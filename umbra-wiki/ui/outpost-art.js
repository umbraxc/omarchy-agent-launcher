// Umbra Outpost art: the valley, a 3D ASCII scene per skill and the
// the companions' portraits. Built on ascii3d.js, in the game's own palette.
"use strict";
window.UmbraOutpostArt = (() => {
  const A = window.Ascii3D, { sd, noise2, hash2, hex, mix } = A;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const RAMP = { rock: " .:-=+#%@", wood: " .:|=#H", leaf: " .:*%#&@", pine: " .^^AA%#", metal: " .:=#%@", wall: " .:-=#%@", grass: " .,:;\"'%#", water: " .-~≈" };
  const plain = (c, ramp) => ({ color: hex(c), ramp: ramp || RAMP.wall });
  const foliage = (a, b, ramp = RAMP.leaf) => ({ color: hex(a), ramp, shade(c) { c.color = mix(hex(a), hex(b), noise2(c.x * 5, c.y * 5 + c.z * 3)); } });
  const fire = { color: [255, 170, 80], ramp: " .'^*", shade(c, t) { const n = noise2(c.x * 7 + t * 3, c.y * 8 - t * 9); c.emit = .55 + .45 * n; c.glyph = n > .7 ? "*" : n > .45 ? "^" : "'"; c.color = mix([255, 224, 130], [235, 80, 40], clamp(c.y * 2.5 - .2 + n * .3)); } };
  const water = { color: hex("#3e7690"), ramp: RAMP.water, shade(c, t) { const n = noise2(c.x * 2 + t * .5, c.z * 5 - t * .3); c.glyph = n > .7 ? "≈" : n > .5 ? "~" : "-"; c.color = mix(hex("#2b5770"), hex("#8cc4d4"), n * .8); } };
  const glowM = (c, f = .15) => ({ color: hex(c), shade(cell, t) { cell.emit = .85 + f * Math.sin(t * 6 + cell.x * 7); cell.glyph = "@"; } });
  // Ground stays quiet so the subject reads: sparse glyphs, half strength.
  const ground = (c1, c2) => ({ color: hex(c1), ramp: " .,:;'", shade(c) { c.color = mix(hex(c1), hex(c2), noise2(c.x * 2, c.z * 2)); c.alpha = .5; } });
  const floor = (c1) => ({ color: hex(c1), ramp: " .,:-", shade(c) { c.alpha = .45; } });
  // A fixed three-quarter view: the scene is traced once and only its
  // moving parts redraw (orbiting cameras cost a full trace every frame).
  const orbit = (r, h, at = [0, .6, 0]) => () => ({ pos: [Math.sin(.6) * r * 1.25, h * .85, Math.cos(.6) * r * 1.25], at: [at[0], at[1] + .1, at[2]], fovV: 34 });
  const U = (best, d, m, h) => { if (d < best[0]) { best[0] = d; h.m = m; } };

  // Small helpers for skill scenes: trees, forests, rocks, cabins, people.
  function pine(x, y, z, s, best, h) {
    U(best, sd.cyl(x, y, z, .07 * s, .5 * s), "bark", h);
    U(best, Math.min(sd.cone(x, y - .35 * s, z, .5 * s, .95 * s), sd.cone(x, y - .8 * s, z, .38 * s, .8 * s), sd.cone(x, y - 1.2 * s, z, .25 * s, .6 * s)), "pine", h);
  }
  function broad(x, y, z, s, b, h) {
    U(b, sd.cyl(x, y, z, .07 * s, .7 * s), "bark", h);
    U(b, sd.sphere(x, y - .95 * s, z, .48 * s) + .07 * s * noise2(x * 5 / s, y * 5 / s + z * 3), "leaf", h);
  }
  // A scattered forest (hash grid), kept out of the clearing around (0, 0).
  function forest(x, y, z, b, h, o = {}) {
    const sp = o.sp || 1.05, top = (o.size || .9) * 2.4;
    if (o.behind != null) {   // everything behind the subject, edge to edge of the wide view
      if (y > top || x * .565 + z * .825 > o.behind + 1.5 || Math.abs(x * .825 - z * .565) > 16) return;
    } else if (y > top || x < (o.x0 ?? -11) - 1 || x > (o.x1 ?? 11) + 1 || z < (o.z0 ?? -11) - 1 || z > (o.z1 ?? -1.5) + 1) return;
    const gx = Math.floor(x / sp), gz = Math.floor(z / sp);
    for (let ox = 0; ox <= 1; ox++) for (let oz = 0; oz <= 1; oz++) {
      const cx = gx + ox, cz = gz + oz, hr = hash2(cx * 1.7 + (o.seed || 0), cz * 3.1);
      if (hr < (o.thin ?? .28)) continue;
      const tx = (cx + .5 * hash2(cx, cz + 4)) * sp, tz = (cz + .5 * hash2(cx + 2, cz)) * sp;
      if (o.behind != null ? (tx * .565 + tz * .825 > o.behind || Math.abs(tx * .825 - tz * .565) > 16 || tx * .565 + tz * .825 < -14)
        : (tx < (o.x0 ?? -11) || tx > (o.x1 ?? 11) || tz < (o.z0 ?? -11) || tz > (o.z1 ?? -1.5))) continue;
      if (Math.hypot(tx - (o.cx || 0), tz - (o.cz || 0)) < (o.clear ?? 2.2)) continue;
      const s = (o.size || .9) * (.7 + .6 * hr), gy = o.H ? o.H(tx, tz) : 0;
      if (o.broad && hash2(cx * 3, cz * 7) > (o.broad === true ? .55 : o.broad)) broad(x - tx, y - gy, z - tz, s * .85, b, h); else pine(x - tx, y - gy, z - tz, s, b, h);
    }
  }
  const rock = (x, y, z, r, b, h, m = "rock") => U(b, sd.sphere(x, y, z, r) + .18 * r * noise2(x * 5 / r, z * 5 / r + y * 3), m, h);
  // A small cabin: plank walls, a pitched roof, a chimney and a lit window.
  function cabin(x, y, z, s, b, h, rot = 0) {
    const [rx, rz] = A.rotY(x, z, rot), X = rx / s, Y = y / s, Z = rz / s;
    const far = Math.hypot(X, Y - .8, Z) - 1.3;   // a sphere round the whole cabin
    if (far > .3) { U(b, far * s, "wall", h); return; }
    U(b, sd.box(X, Y - .45, Z, .7, .45, .5) * s, "wall", h);
    U(b, sd.roof(X, Y - .9, Z, .82, .6, .5) * s, "roof", h);
    U(b, sd.box(X - .45, Y - 1.25, Z + .2, .09, .3, .09) * s, "brick", h);
    U(b, sd.box(X - .3, Y - .5, Z - .51, .14, .12, .02) * s, "window", h);
    U(b, sd.box(X + .25, Y - .3, Z - .51, .12, .3, .02) * s, "door", h);
  }
  const chimney = (cx, cy, cz, t, put, n = 10) => { for (let i = 0; i < n; i++) { const p = (t * .15 + i / n) % 1; put(cx + Math.sin(p * 5 + i) * .1 + p * .3, cy + p * 1.4, cz, p < .4 ? "°" : "·", [200, 200, 206], .5 * (1 - p)); } };
  const birds = (t, put, y = 2.6, n = 4) => { for (let i = 0; i < n; i++) { const a = t * .25 + i * 1.7; put(Math.cos(a) * (4 + i), y + Math.sin(a * 2 + i) * .3, -5 + Math.sin(a) * 2, Math.sin(t * 8 + i) > 0 ? "v" : "^", [40, 40, 46], .8); } };
  const COMMON = () => ({ bark: plain("#6a5040", RAMP.wood), pine: foliage("#3f7a52", "#2a5640", RAMP.pine), leaf: foliage("#5f8f45", "#3e6b3c"),
    rock: { color: hex("#8a8378"), ramp: RAMP.rock, shade(c) { c.color = mix(hex("#6a645c"), hex("#a49c90"), noise2(c.x * 3, c.y * 3 + c.z)); } },
    wall: { color: hex("#8a6a4a"), ramp: RAMP.wood, shade(c) { if (Math.abs(Math.sin(c.y * 22)) < .15) c.glyph = "="; } }, roof: plain("#6a3a2e", RAMP.wall),
    brick: { color: hex("#9a5a42"), ramp: RAMP.wall, shade(c) { if (Math.abs((c.y * 7) % 1) < .15) c.glyph = "="; } },
    window: { color: [255, 200, 110], shade(c, t) { c.emit = .85 + .1 * Math.sin(t * 1.3); c.glyph = "#"; } }, door: plain("#5a3e2a", RAMP.wood) });
  // People and animals from outpost-beings.js, placed in a scene.
  const placedBeing = (being, x, z, size, rot) => window.UmbraBeings ? window.UmbraBeings.place(being, x, z, size, rot) : { mats: {}, f() {} };
  const facing = (x, z, tx = 0, tz = 0) => Math.atan2(-(tx - x), tz - z);
  // A camera that turns slowly round the scene (the whole view redraws, so
  // only for scenes light enough).
  const drift = (r, h, at, swing = .25, speed = .06) => (t) => { const a = .6 + swing * Math.sin(t * speed); return { pos: [Math.sin(a) * r * 1.25, h * .85, Math.cos(a) * r * 1.25], at, fovV: 34 }; };
  const SKILL = {};

  // ------------------------------------------------------------ gathering
  SKILL.forestry = () => ({ fps: 9, camera: orbit(4.6, 1.6, [0, 1, .8]), light: [-.4, .8, .4], ambient: .3,
    fog: { color: hex("#10170f"), density: .03, start: 8, fade: .35 },
    sky: (u, v, t, col, row) => hash2(col, row) > .985 ? ["·", [210, 226, 220], .3 + .2 * Math.sin(t + col)] : null,
    map(x, y, z, t, h) { const g = .25 * noise2(x * .3, z * .3) * clamp((-z - 2) / 4); const b = [y - g, ""]; h.m = "grass";
      forest(x, y, z, b, h, { behind: -1.6, clear: 2.8, cz: .8, size: 1.15, sp: .95, broad: .8, seed: 1 });
      pine(x + .9, y, z + 1.2, 1.15, b, h); pine(x - 1.5, y, z + 1.6, .9, b, h); pine(x - .1, y, z + 2.4, 1.3, b, h); pine(x + 2.2, y, z + .2, .8, b, h);
      U(b, sd.cyl(x - .9, y, z - .4, .26, .32), "stump", h);
      U(b, Math.min(sd.capsule(x, y, z, .4, .12, .7, 1.3, .12, .9, .12), sd.capsule(x, y, z, .45, .36, .8, 1.25, .36, .95, .12)), "bark", h);
      for (let k = 0; k < 6; k++) { const ly = .1 + (k % 3) * .2 + Math.floor(k / 3) * .1, lz = 1.3 + Math.floor(k / 3) * .22; U(b, sd.capsule(x, y, z, -3.6, ly, lz, -2.5, ly, lz + .05, .1), "logend", h); }   // a stack of cut logs
      U(b, sd.capsule(x, y, z, -.9, .35, -.4, -.6, .75, -.25, .03), "handle", h); U(b, sd.box(x + .62, y - .78, z + .27, .1, .07, .02), "metal", h);
      cabin(x + 3.4, y, z - 2.2, .9, b, h, .9); pine(x + 4.6, y, z - .8, 1.1, b, h); pine(x + 2.2, y, z - 3.4, 1.0, b, h); broad(x + 5.2, y, z - 3.2, 1.0, b, h);
      return b[0]; },
    materials: { ...COMMON(), grass: ground("#4f7a46", "#79914f"), pine: foliage("#4a8a5a", "#2f5f44", RAMP.pine),
      stump: { color: hex("#b58e5e"), ramp: RAMP.wood, shade(c) { if (c.ny > .8) { const r = Math.hypot(c.x + .9, c.z + .4); c.glyph = Math.floor(r * 22) % 2 ? "o" : "·"; c.color = hex("#d8b27c"); } } },
      logend: { color: hex("#9a7550"), ramp: RAMP.wood, shade(c) { if (c.nx < -.7 || c.nx > .7) { c.glyph = "@"; c.color = hex("#d8b27c"); } } },
      handle: plain("#8a6a4a", RAMP.wood), metal: plain("#c8ccd2", RAMP.metal) },
    particles: (t, put) => {
      for (let i = 0; i < 8; i++) { const p = (t * .4 + i / 8) % 1; put(-.9 + Math.cos(i * 2.3) * p * .6, .4 + Math.sin(p * 3) * .4, -.4 + Math.sin(i * 2.3) * p * .6, "'", [222, 190, 140], 1 - p); }
      for (let i = 0; i < 10; i++) { const p = (t * .07 + i / 10) % 1; put(-4 + i * .9 + Math.sin(t + i) * .3, 3 - p * 3, -2 - (i % 3), "`", [160, 190, 110], .7 * (1 - p)); }   // falling needles
      chimney(-3.4, 1.4, 2.2, t, put); birds(t, put, 3.4);
    },
  });
  // A wrecked car: body, cabin, wheels (some missing), broken glass, rust.
  function car(x, y, z, kind, b, h) {
    const L = kind === "van" ? 1.0 : kind === "truck" ? 1.2 : .95, roof = kind === "van" ? .55 : .3;
    U(b, sd.rbox(x, y - .32, z, L, .22, .45, .08), "car", h);
    U(b, sd.rbox(x + (kind === "truck" ? .55 : .05), y - .6 - roof * .5, z, kind === "truck" ? .4 : L * .6, roof * .5 + .05, .42, .08), kind === "van" ? "car2" : "car", h);
    U(b, sd.box(x + (kind === "truck" ? .55 : .05), y - .62 - roof * .45, z, (kind === "truck" ? .38 : L * .58) + .02, roof * .3, .44), "glass", h);
    for (const [wx, wz, gone] of [[-L * .65, .45, 0], [L * .65, .45, kind === "sedan"], [-L * .65, -.45, kind === "van"], [L * .65, -.45, 0]]) if (!gone) U(b, sd.torus(x - wx, z - wz, y - .18, .16, .07), "tyre", h);
  }
  SKILL.salvaging = () => ({ fps: 9, camera: orbit(3.9, 1.5, [0, .5, 0]), light: [.4, .8, .3], ambient: .3,
    fog: { color: hex("#1a1612"), density: .03, start: 8, fade: .35 },
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "dirt";
      U(b, sd.rbox(x, y - .35, z, 1.1, .25, .5, .08), "car", h); U(b, sd.rbox(x + .1, y - .7, z, .55, .2, .45, .08), "car", h);
      for (const [wx, wz] of [[-.7, .5], [.7, .5], [-.7, -.5]]) U(b, sd.torus(x - wx, z - wz, y - .2, .17, .08), "tyre", h);
      U(b, sd.box(x + .1, y - .72, z, .5, .14, .46), "glass", h);
      // The yard: more wrecks, stacked, on their sides, a bus shell, tyres, barrels and a fence.
      const [ax, az] = A.rotY(x + 2.6, z + 1.8, .5); car(ax, y, az, "van", b, h);
      const [bx, bz] = A.rotY(x - 2.8, z + 1.3, -.4); car(bx, y, bz, "sedan", b, h);
      const [cx, cz] = A.rotY(x - 2.8, z + 1.3, -.4); car(cx, y - .55, cz, "sedan", b, h);
      const [dx, dz] = A.rotY(x + .4, z + 3.6, .1); car(dx, y, dz, "truck", b, h);
      const [ex, ez] = A.rotY(x - 1.2, z + 3.9, 1.3); U(b, Math.max(sd.rbox(ex, y - .7, ez, 1.9, .7, .55, .1), -sd.rbox(ex, y - .75, ez, 1.85, .62, .5, .08), -(y - .05)), "bus", h);
      for (let i = 0; i < 4; i++) U(b, sd.torus(x - 1.5, y - (.08 + i * .15), z + .9, .2, .07), "tyre", h);
      for (const [px, pz] of [[1.6, .9], [1.9, 1.1]]) U(b, sd.cyl(x - px, y, z - pz, .17, .5), "barrel", h);
      for (let i = 0; i < 8; i++) U(b, sd.sphere(x + 1.5 + Math.cos(i) * .4, y - .14, z - .8 + Math.sin(i * 1.7) * .4, .16 + .05 * (i % 3)) + .03 * noise2(x * 9, z * 9), "scrap", h);
      if (z < -4.6 && z > -5.4) { U(b, Math.max(Math.abs(z + 5) - .02, y - 1.1, Math.abs(x) - 7), "fence", h); for (let k = -7; k <= 7; k++) U(b, sd.cyl(x - k, y, z + 5, .04, 1.2), "post", h); }
      return b[0]; },
    materials: { dirt: ground("#6b5e4b", "#857660"), car: { color: hex("#9a5a42"), ramp: RAMP.metal, shade(c) { const n = noise2(c.x * 4, c.y * 6 + c.z * 2); if (n > .62) c.color = hex("#6b4a3a"); else if (n < .2) c.color = hex("#5a7a8a"); } },
      car2: { color: hex("#6a8a6a"), ramp: RAMP.metal, shade(c) { if (noise2(c.x * 5, c.y * 5) > .6) c.color = hex("#7a4a32"); } }, bus: { color: hex("#c8a03a"), ramp: RAMP.metal, shade(c) { if (noise2(c.x * 3, c.y * 6) > .55) c.color = hex("#7a5a3a"); if (Math.abs(Math.sin(c.x * 6)) < .2 && c.y > .6) c.glyph = "|"; } },
      tyre: plain("#2e2c2a", RAMP.rock), glass: { color: hex("#9fd0d8"), ramp: " .:/+", shade(c) { c.glyph = noise2(c.x * 8, c.y * 8) > .6 ? "/" : ":"; } }, scrap: plain("#a8a49c", RAMP.metal),
      barrel: { color: hex("#3a6a8a"), ramp: RAMP.metal, shade(c) { if (noise2(c.x * 8, c.y * 8) > .6) c.color = hex("#8a5a3a"); } }, fence: { color: hex("#9aa0a6"), ramp: " .:x#", shade(c) { c.glyph = "x"; c.alpha = .55; } }, post: plain("#6a6e72", RAMP.metal) },
    particles: (t, put) => {
      const p = (t * .5) % 1; put(.1 + Math.cos(t) * .3, .95 + p * .2, .2, p < .5 ? "✦" : "+", [255, 240, 190], 1 - p);
      for (let i = 0; i < 8; i++) { const q = (t * 1.3 + i / 8) % 1; put(-2.6 + Math.cos(i * 2) * q * .5, .6 + Math.sin(q * 3) * .4, -1.3 + Math.sin(i) * q * .4, "*", [255, 210, 120], 1 - q); }   // a cutting torch
      for (let i = 0; i < 6; i++) { const q = (t * .1 + i / 6) % 1; put(-5 + q * 10, .3 + Math.sin(i + t) * .1, -2 - i * .3, "·", [180, 160, 130], .3 * Math.sin(q * 3.14)); }   // dust
    },
  });
  SKILL.fishing = () => ({ fps: 12, shimmerFps: 15, moving: [[-.7, 0, -.1, .2], [-2.4, .2, -2.2, .7]], camera: orbit(3.4, 1.35, [0, .45, 0], .08), light: [-.3, .7, .5], ambient: .32,
    fog: { color: hex("#0f1a20"), density: .045, start: 6, fade: .45 },
    sky: (u, v, t, col, row) => hash2(col, row) > .988 ? ["·", [220, 230, 246], .3 + .2 * Math.sin(t + col)] : null,
    map(x, y, z, t, h) {
      // Far shore: hills with pines, a hut by the water.
      const shore = -6.5 + .8 * noise2(x * .2, 3), land = z < shore ? (shore - z) * .35 + .3 * noise2(x * .4, z * .4) : -1;
      const b = [Math.min(y, land > 0 ? y - land : 9), ""]; h.m = land > 0 && y <= land + .05 ? "shore" : "water";
      if (land > 0) forest(x, y, z, b, h, { x0: -14, x1: 14, z0: -14, z1: shore - .6, clear: 0, size: 1.0, sp: 1.0, seed: 3, H: (tx, tz) => (shore - tz) * .35 });
      U(b, sd.box(x + 1.2, y - .3, z, .9, .05, .35), "plank", h);
      for (const px of [.4, 2]) for (const pz of [-.3, .3]) U(b, sd.cyl(x + px, y + .4, z - pz, .05, .75), "plank", h);
      // The dock runs back to the near shore; crates, a barrel, nets drying.
      U(b, sd.box(x + 2.6, y - .3, z - 1.1, .35, .05, 1.4), "plank", h);
      for (let k = 0; k < 4; k++) U(b, sd.cyl(x + 2.3 + (k % 2) * .6, y + .4, z - .2 - k * .7, .05, .75), "plank", h);
      U(b, sd.box(x + 2.5, y - .5, z - 1.6, .15, .15, .15), "crate", h); U(b, sd.cyl(x + 2.75, y - .35, z - 2, .14, .38), "barrel", h);
      U(b, Math.max(sd.box(x + 3.4, y - .7, z - 1.2, .02, .4, .5), 0), "net", h); for (const nz of [.7, 1.7]) U(b, sd.cyl(x + 3.4, y, z - nz, .03, 1.15), "plank", h);
      U(b, sd.capsule(x, y, z, -.5, .45, 0, .6, 1.25, 0, .022), "rod", h);
      U(b, sd.sphere(x - .7, y - .03 - .04 * Math.sin(t * 2.5), z - .1, .07), "float", h);
      U(b, sd.sphere(x + .7, y - .55, z, .12), "jacket", h); U(b, sd.capsule(x, y, z, .7, .33, 0, .7, .5, 0, .13), "jacket", h);
      // A rowboat bobbing; a sailboat further out; buoys.
      const bob = .04 * Math.sin(t * 1.3), [rx, rz] = A.rotY(x + 2.4, z + 2.2, .4);
      U(b, Math.max(sd.capsule(rx, y - bob, rz * 2.2, -.6, .1, 0, .6, .1, 0, .28), -sd.capsule(rx, y - bob, rz * 2.2, -.55, .2, 0, .55, .2, 0, .24), -(y - bob + .05)), "boat", h);
      U(b, Math.max(sd.capsule(x + .5, y, (z + 4.6) * 2.4, -.7, .1, 0, .7, .1, 0, .25), -(y + .05)), "boat", h);
      U(b, sd.cyl(x + .5, y - .2, z + 4.6, .025, 1.3), "plank", h); U(b, Math.max(Math.abs(z + 4.6) - .01, -(x + .5 - .05), x + .5 - .7 + (y - .3) * .45, -(y - .3), y - 1.4), "sail", h);
      for (const [fx, fz] of [[-1.6, -.9], [1.2, -2.4]]) U(b, sd.sphere(x - fx, y - .03 * Math.sin(t * 1.7 + fx), z - fz, .07), "float", h);
      return b[0]; },
    materials: { ...COMMON(),
      water: { color: hex("#3e7690"), ramp: RAMP.water, shade(c, t) { const n = noise2(c.x * 1.6 + t * .22, c.z * 3.2 - t * .14) * .7 + .3 * noise2(c.x * 4 - t * .3, c.z * 6); c.glyph = n > .66 ? "≈" : n > .45 ? "~" : "-"; c.color = mix(hex("#2b5770"), hex("#8cc4d4"), n); } },
      shore: ground("#4a6a44", "#6a7a50"), plank: plain("#8a6a4a", RAMP.wood), rod: plain("#c8a46e", RAMP.wood), float: { color: [230, 70, 60], shade(c) { c.emit = .9; c.glyph = "o"; } }, jacket: plain("#d9a23c"),
      crate: plain("#9a7550", RAMP.wood), barrel: plain("#7a5236", RAMP.wood), boat: { color: hex("#a85a3a"), ramp: RAMP.wood, shade(c) { if (Math.abs(Math.sin(c.y * 30)) < .2) c.color = hex("#e8dcc0"); } },
      net: { color: hex("#c8b890"), ramp: " .+x#", shade(c) { c.glyph = (Math.floor(c.y * 18) + Math.floor(c.z * 18)) % 2 ? "x" : "+"; c.alpha = .6; } }, sail: { color: hex("#e8e2d0"), ramp: " .:-=", shade(c) { c.alpha = .85; } } },
    particles: (t, put) => {
      const p = (t * .35) % 1; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; put(-.7 + Math.cos(a) * p * .6, .02, -.1 + Math.sin(a) * p * .35, "·", [210, 236, 246], .6 * (1 - p)); }
      for (let i = 0; i < 3; i++) { const a = t * .3 + i * 2; put(Math.cos(a) * 3, 2 + Math.sin(a * 2) * .3, -3 + Math.sin(a) * 1.5, Math.sin(t * 7 + i) > 0 ? "v" : "~", [235, 235, 240], .8); }   // gulls
    },
  });
  SKILL.foraging = () => ({ fps: 9, camera: orbit(3.2, 1.3, [0, .35, 0]), light: [-.4, .8, .3], ambient: .32,
    fog: { color: hex("#121a10"), density: .03, start: 8, fade: .35 },
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "moss";
      for (const [mx, mz, s] of [[0, 0, 1], [.35, .25, .7], [-.3, .3, .6], [.15, -.4, .8]]) { U(b, sd.cyl(x - mx, y, z - mz, .06 * s, .35 * s), "stem", h); U(b, Math.max(sd.sphere(x - mx, y - .35 * s, z - mz, .22 * s), -(y - .35 * s)), "cap", h); }
      for (const [bx, bz, r] of [[-1, -.6, .42], [1.1, -.5, .42], [.9, .8, .4], [-2.2, .4, .5], [2.4, .2, .55], [-1.6, -1.8, .6], [1.8, -1.9, .5], [-3, -1, .55], [3.1, -1.2, .6]]) U(b, sd.sphere(x - bx, y - r * .7, z - bz, r) + .06 * noise2(x * 6, z * 6), "bush", h);
      for (let i = 0; i < 9; i++) { const fx = -2.6 + i * .65, fz = .9 + Math.sin(i * 2) * .3; for (let k = 0; k < 4; k++) { const a = k * 1.57 + i; U(b, sd.capsule(x, y, z, fx, 0, fz, fx + Math.cos(a) * .25, .25, fz + Math.sin(a) * .25, .015), "fern", h); } }
      U(b, Math.max(sd.cyl(x + .8, y, z - .55, .2, .22), -sd.cyl(x + .8, y + .05, z - .55, .17, .3)), "basket", h); U(b, sd.torus(x + .8, y - .32, z - .55, .14, .02), "basket", h);
      cabin(x + 3.6, y, z - 1.8, .9, b, h, .9); cabin(x - 3.4, y, z + 2.6, .8, b, h, .5);
      forest(x, y, z, b, h, { behind: -2.4, clear: 3, size: .95, broad: .45, seed: 5 });
      return b[0]; },
    materials: { ...COMMON(), moss: ground("#4c7340", "#6f8c4a"), stem: plain("#efe2c8"),
      cap: { color: hex("#e2973c"), ramp: RAMP.wall, shade(c) { if (hash2(Math.floor(c.x * 30), Math.floor(c.z * 30)) > .85) { c.glyph = "o"; c.color = [250, 240, 220]; } } },
      bush: { color: hex("#4f8a4a"), ramp: RAMP.leaf, shade(c) { if (hash2(Math.floor(c.x * 14), Math.floor(c.y * 14 + c.z * 9)) > .88) { c.glyph = "•"; c.color = [120, 70, 160]; } } },
      fern: { color: hex("#6fa04a"), ramp: " .,\"'", shade(c) { c.glyph = "\""; } }, basket: { color: hex("#c8a06a"), ramp: RAMP.wood, shade(c) { c.glyph = Math.sin(c.y * 40 + Math.atan2(c.z, c.x) * 8) > 0 ? "#" : "="; } } },
    particles: (t, put) => { for (let i = 0; i < 6; i++) { const a = t * 1.2 + i * 1.6; put(Math.cos(a) * (.9 + i * .3), .7 + Math.sin(a * 2) * .2, Math.sin(a) * .7, Math.sin(t * 10 + i) > 0 ? "ʚ" : "ɞ", [255, 230, 120 - i * 15], .9); } chimney(-3.6, 1.4, 1.8, t, put); },
  });
  SKILL.trapping = () => {
    const deer = window.UmbraBeings ? placedBeing(window.UmbraBeings.COMPANIONS.goat("dr_"), 2.6, -2.4, .9, -1.2) : null;
    const fox = window.UmbraBeings ? placedBeing(window.UmbraBeings.COMPANIONS.fox("fx_"), -2.8, -1.4, .55, .9) : null;
    return { fps: 9, moving: [[-.5, .3, 0, .45]], camera: orbit(3.4, 1.3, [0, .3, 0]), light: [-.4, .8, .3], ambient: .32,
      fog: { color: hex("#10170f"), density: .03, start: 8, fade: .35 },
      map(x, y, z, t, h) { const b = [y - .1 * Math.max(0, .6 - Math.hypot(x + .5, z)), ""]; h.m = "meadow";
        for (const [gx, gz] of [[-1.2, -.6], [1.3, .7], [-.9, 1.1], [1.6, -.9], [-2, .6], [2.2, 1.2]]) U(b, sd.sphere(x - gx, y, z - gz, .3) + .05 * noise2(x * 8, z * 8), "tuft", h);
        U(b, Math.max(sd.sphere(x + .5, y + .15, z, .45), -y), "burrow", h);
        U(b, sd.cyl(x - .5, y, z - .2, .05, .7), "stake", h); U(b, sd.torus(x - .5, z - .55, y - .12, .22, .02), "wire", h);
        U(b, sd.capsule(x, y, z, .5, .6, -.2, .5, .12, -.55, .012), "wire", h);
        const pop = Math.max(0, Math.sin(t * .8)) * .25;
        U(b, sd.sphere(x + .5, y - .12 - pop, z, .16), "rabbit", h); U(b, sd.sphere(x + .5, y - .3 - pop, z + .08, .1), "rabbit", h);
        U(b, sd.capsule(x, y, z, -.45, .36 + pop, .1, -.48, .52 + pop, .08, .025), "rabbit", h); U(b, sd.capsule(x, y, z, -.55, .36 + pop, .1, -.58, .52 + pop, .08, .025), "rabbit", h);
        // A box trap with its prop stick, a log, a deer and a fox among the trees.
        U(b, Math.max(sd.box(x - 1.4, y - .18, z + .3, .25, .18, .2), -sd.box(x - 1.4, y - .18, z + .5, .2, .14, .2)), "stake", h); U(b, sd.capsule(x, y, z, 1.1, 0, -.1, 1.15, .3, -.15, .015), "stake", h);
        U(b, sd.capsule(x, y, z, -2.2, .12, -.8, -1.2, .12, -1.2, .12), "bark", h);
        deer?.f(x, y, z, b, h, t); fox?.f(x, y, z, b, h, t);
        forest(x, y, z, b, h, { behind: .6, clear: 2.6, size: 1.0, sp: .95, broad: .7, seed: 11 });
        return b[0]; },
      materials: { ...COMMON(), meadow: ground("#6f9150", "#9cb562"), tuft: foliage("#6f9a4f", "#9ab760", " .,\"';%"), burrow: plain("#6b5a44", RAMP.rock), stake: plain("#8a6a4a", RAMP.wood), wire: plain("#c3a26e", RAMP.metal),
        rabbit: { color: hex("#c8ae90"), ramp: RAMP.wall }, ...(deer?.mats || {}), ...(fox?.mats || {}) },
      particles: (t, put) => birds(t, put, 3.2, 5),
    };
  };
  SKILL.quarrying = () => ({ fps: 9, camera: orbit(3.6, 1.4, [0, .7, -.4], .08), light: [.5, .7, .4], ambient: .3,
    fog: { color: hex("#1a1612"), density: .045, start: 6, fade: .35 },
    map(x, y, z, t, h) {
      // Canyon walls on both sides and mountains behind.
      const mtn = Math.max(0, -z - 5) * .6 + 1.5 * noise2(x * .2, z * .2) * clamp((-z - 5) / 3);
      const b = [y - mtn, ""]; h.m = -z > 5.5 ? "cliff" : "gravel";
      U(b, Math.max(3.6 - Math.abs(x + .35 * Math.sin(z * .7) + .25 * noise2(y * 1.5, z * 1.2)), y - 3.2 - .6 * noise2(x, z * .5), x * .565 + z * .825 + 1.0), "cliff", h);   // the canyon walls, behind the pit
      U(b, (sd.sphere(x * .7, y - .2, z + 1, 1.2) + .18 * noise2(x * 3, y * 3 + z)), "rock", h);
      for (let i = 0; i < 7; i++) U(b, sd.sphere(x - .9 + i * .4, y - .1, z - .8 + Math.sin(i) * .3, .12 + .04 * (i % 2)), "rubble", h);
      U(b, sd.capsule(x, y, z, .8, .05, .4, 1.2, .5, .3, .03), "handle", h); U(b, sd.capsule(x, y, z, .95, .55, .3, 1.45, .45, .3, .035), "metal", h);
      // A mine entrance in the cliff with timber beams, rails and a cart.
      U(b, Math.max(sd.box(x + 3.3, y - .7, z + 2.2, .5, .7, .3), -sd.box(x + 3.3, y - .6, z + 2.2, .38, .6, .4)), "beam", h);
      U(b, sd.box(x + 3.3, y - .6, z + 2.0, .38, .6, .02), "dark", h);
      for (const rz of [-.18, .18]) U(b, sd.box(x + 1.8 + 0, y - .03, z + 1.5 + rz, 1.6, .02, .02), "rail", h);
      U(b, Math.max(sd.box(x + 1.3, y - .35, z + 1.5, .32, .2, .26), -sd.box(x + 1.3, y - .42, z + 1.5, .28, .2, .22)), "cart", h);
      for (const [wx, wz] of [[1.05, 1.25], [1.55, 1.25], [1.05, 1.75], [1.55, 1.75]]) U(b, sd.torus(x + wx, z + wz, y - .1, .07, .025), "rail", h);
      U(b, sd.sphere(x + 1.3, y - .55, z + 1.5, .18) + .05 * noise2(x * 9, z * 9), "ore", h);
      U(b, sd.capsule(x, y, z, -1.6, 0, -1.4, -1.6, 1.6, -1.4, .04), "beam", h); U(b, sd.capsule(x, y, z, -1.6, 1.55, -1.4, -1.0, 1.55, -1.4, .03), "beam", h); U(b, sd.sphere(x + 1.05, y - 1.4, z + 1.4, .07), "lamp", h);
      return b[0]; },
    materials: { gravel: ground("#77706a", "#938b80"), rubble: plain("#8a8378", RAMP.rock), handle: plain("#8a6a4a", RAMP.wood), metal: plain("#c8ccd2", RAMP.metal),
      cliff: { color: hex("#9a7a5a"), ramp: RAMP.rock, shade(c) { const v = noise2(c.y * 2.5, c.z * 1.2 + c.x * .5); c.color = mix(hex("#7a5a40"), hex("#c8a078"), v); if (Math.abs(Math.sin(c.y * 5 + v * 2)) < .12) c.glyph = "="; } },
      rock: { color: hex("#8a8378"), ramp: RAMP.rock, shade(c, t) { const v = noise2(c.x * 4 + 3, c.y * 4 + c.z * 2); if (v > .74) { c.color = [214, 140, 82]; c.glyph = "◆"; c.emit = .7 + .2 * Math.sin(t * 2 + c.x * 9); } } },
      beam: plain("#7a5a3a", RAMP.wood), dark: { color: [20, 16, 14], shade(c) { c.glyph = " "; } }, rail: plain("#9aa0a6", RAMP.metal), cart: plain("#6a6e72", RAMP.metal),
      ore: { color: hex("#c87a3a"), ramp: RAMP.rock, shade(c) { if (noise2(c.x * 12, c.y * 12) > .6) { c.glyph = "◆"; c.color = [230, 160, 90]; } } }, lamp: { color: [255, 200, 110], shade(c, t) { c.emit = .9 + .1 * Math.sin(t * 6); c.glyph = "@"; } } },
    particles: (t, put) => { const p = (t * .8) % 1; for (let k = 0; k < 5; k++) put(.6 + Math.cos(k * 1.3) * p * .4, .3 + p * .3, -.2 + Math.sin(k * 1.3) * p * .3, ".", [200, 190, 170], 1 - p); for (let i = 0; i < 6; i++) { const q = (t * .06 + i / 6) % 1; put(-3 + q * 6, 2 + Math.sin(i) * .5, -1 - i * .4, "·", [190, 170, 140], .25 * Math.sin(q * 3.14)); } },
  });

  // ------------------------------------------------------------- making
  // A room: wooden floor, two stone walls (back and left), a window.
  function room(x, y, z, b, h, o = {}) {
    U(b, y, o.floor || "boards", h);
    U(b, Math.max(z + (o.back ?? 1.9), y - 3.5), o.wall || "stonewall", h);
    U(b, Math.max(x + (o.left ?? 3.2), y - 3.5), o.wall || "stonewall", h);
    if (o.window) U(b, sd.box(x - o.window, y - 1.5, z + (o.back ?? 1.9), .45, .35, .03), "daylight", h);
    if (o.side) U(b, sd.box(x + (o.left ?? 3.2), y - 1.5, z - o.side, .03, .35, .45), "daylight", h);
  }
  // A room lit from one source (hearth, forge, lamp): surfaces facing it
  // brighten and take its tint, falling off with distance.
  function lit(scene, at, k = 1, tint = [255, 186, 120]) {
    const mats = scene.materials;
    for (const id in mats) { const m = mats[id], light = (c, t) => {
      if (m.shade) m.shade(c, t);
      if (c.emit != null || m.emissive) return;
      const dx = at[0] - c.x, dy = at[1] - c.y, dz = at[2] - c.z, d = Math.hypot(dx, dy, dz) || 1, fall = k / (1 + d * d * .1);
      const ndl = Math.max(0, (c.nx * dx + c.ny * dy + c.nz * dz) / d);
      c.emit = Math.min(1, .3 + .62 * ndl * fall + .12 * fall);
      c.color = mix(c.color, tint, Math.min(.3, fall * .22));
    };
    // Keep the shader's arity: one taking t is redrawn as it shimmers.
    mats[id] = { ...m, shade: m.shade && m.shade.length >= 2 ? (c, t) => light(c, t) : (c) => light(c) }; }
    return scene;
  }
  const ROOM = () => ({ boards: { color: hex("#6a5038"), ramp: " .:-=", shade(c) { c.alpha = .75; c.glyph = Math.abs(Math.sin(c.x * 6)) < .12 ? "|" : "-"; c.color = mix(hex("#5a4230"), hex("#8a6a48"), noise2(c.x * 2, c.z * 6)); } },
    stonewall: { color: hex("#6a645c"), ramp: RAMP.rock, shade(c) { const row = Math.floor(c.y * 4), col = Math.floor((c.x + c.z) * 3 + row * .5); c.glyph = Math.abs((c.y * 4) % 1) < .12 || Math.abs(((c.x + c.z) * 3 + row * .5) % 1) < .1 ? "-" : ":"; c.color = mix(hex("#4a453f"), hex("#76706a"), hash2(row, col)); c.alpha = .5; } },
    daylight: { color: [200, 220, 240], shade(c, t) { c.emit = .8; c.glyph = (Math.floor(c.x * 6) + Math.floor(c.y * 6)) % 2 ? "#" : "+"; } } });
  SKILL.cooking = () => lit({ fps: 9, moving: [[0, .3, 0, .38]], camera: orbit(2.9, 1.25, [0, .55, -.2]), light: [0, .6, .8], ambient: .4,
    map(x, y, z, t, h) { const b = [99, ""]; h.m = "earth";
      room(x, y, z, b, h, { back: 2.2, left: 3, window: -1.6 });
      // The hearth: a stone chimney breast with the fire and the pot under a crane.
      U(b, Math.max(sd.box(x, y - 1.4, z + 1.9, 1.0, 1.4, .3), -sd.box(x, y - .55, z + 1.6, .62, .55, .4)), "hearthstone", h);
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; U(b, sd.sphere(x - Math.cos(a) * .5, y - .05, z - Math.sin(a) * .5, .11), "stone", h); }
      U(b, sd.cone(x, y - .02, z, .3, .45 + .06 * Math.sin(t * 7)), "fire", h);
      U(b, Math.max(sd.cyl(x, y - .5, z, .32, .38), -sd.cyl(x, y - .55, z, .27, .4)), "pot", h);
      U(b, sd.cyl(x, y - .82, z, .27, .02), "stew", h);
      U(b, Math.min(sd.capsule(x, y, z, -.6, 0, 0, 0, 1.15, 0, .03), sd.capsule(x, y, z, .6, 0, 0, 0, 1.15, 0, .03)), "stick", h);
      // A table with bread, cheese and a jug; pots and pans on the wall; herbs; shelves of jars; a barrel and a chopping block.
      U(b, sd.box(x - 1.9, y - .75, z - .2, .7, .04, .4), "table", h); for (const [lx, lz] of [[1.3, -.55], [2.5, -.55], [1.3, .15], [2.5, .15]]) U(b, sd.box(x + lx, y - .37, z - lz, .04, .37, .04), "table", h);
      U(b, sd.capsule(x, y, z, -2.2, .86, -.3, -1.9, .86, -.25, .09), "bread", h); U(b, sd.sphere(x + 1.6, y - .85, z, .1), "bread", h);
      U(b, Math.max(sd.cyl(x + 1.6, y - .79, z + .35, .14, .12), 0), "cheese", h); U(b, sd.cyl(x + 2.3, y - .79, z, .08, .22), "jug", h);
      for (let i = 0; i < 4; i++) { U(b, sd.capsule(x, y, z, -2.6 + i * .35, 2.0, -2.15, -2.6 + i * .35, 1.75, -2.12, .012), "metal", h); U(b, Math.max(sd.cyl(x + 2.6 - i * .35, z + 2.05, y - 1.6 + .0, .14 - i * .015, .02) + 0, 0), "pan", h); }
      for (let i = 0; i < 2; i++) U(b, sd.box(x + 2.4, y - (1.3 + i * .5), z + 2.1, .7, .025, .12), "table", h);
      for (let i = 0; i < 8; i++) U(b, sd.cyl(x + 2.95 - (i % 4) * .35, y - (1.33 + Math.floor(i / 4) * .5), z + 2.05, .07, .18), "jar", h);
      for (let i = 0; i < 5; i++) U(b, sd.cone(x - (1.6 + i * .22), -(y - 2.5), z + 1.2, .06, .35 + .05 * (i % 2)), "herbs", h);
      U(b, sd.cyl(x + 2.4, y, z + .6, .3, .75), "barrel", h); U(b, sd.cyl(x - 1.6, y, z - 1.2, .3, .5), "block", h); U(b, sd.box(x - 1.6, y - .62, z - 1.2, .02, .12, .16), "metal", h);
      // Along the left wall: a dresser of plates, strings of onions, sacks of flour.
      U(b, sd.box(x + 2.8, y - .5, z - 2.4, .2, .5, .7), "table", h); for (let i = 0; i < 3; i++) U(b, sd.box(x + 2.8, y - (1.1 + i * .3), z - 2.4, .22, .02, .7), "table", h);
      for (let i = 0; i < 9; i++) U(b, sd.cyl(z - 2.4 + (-.55 + (i % 3) * .55), x + 2.95, y - (1.25 + Math.floor(i / 3) * .3), .11, .015), "plate", h);
      for (let i = 0; i < 6; i++) U(b, sd.sphere(x + 2.95, y - (2.2 - i * .1), z - 3.0, .07 - i * .004), "onion", h); for (let i = 0; i < 6; i++) U(b, sd.sphere(x + 2.95, y - (2.2 - i * .1), z - 3.4, .065), "garlic", h);
      for (const [sz, r] of [[2.6, .28], [3.1, .25]]) U(b, sd.sphere(x + 2.55, y - r, z - sz, r) + .02 * noise2(x * 8, y * 8), "sack", h);
      return b[0]; },
    materials: { ...ROOM(), earth: floor("#3a3028"), stone: plain("#8a8278", RAMP.rock), fire, pot: plain("#3d3d42", RAMP.metal), stick: plain("#7a5a3e", RAMP.wood),
      stew: { color: [200, 120, 60], shade(c, t) { c.emit = .6; c.glyph = noise2(c.x * 9 + t, c.z * 9) > .5 ? "o" : "~"; } },
      hearthstone: { color: hex("#7a726a"), ramp: RAMP.rock, shade(c) { const r = Math.hypot(c.x, c.y - .5); c.emit = clamp(.9 / (1 + r * r * 3)); c.color = mix(hex("#6a625a"), hex("#c88a5a"), clamp(1 - r)); } },
      table: plain("#8a6a48", RAMP.wood), bread: { color: hex("#d8a058"), ramp: RAMP.wall }, cheese: plain("#e8c858"), jug: plain("#b87a4a", RAMP.wall), metal: plain("#9aa0a8", RAMP.metal),
      pan: { color: hex("#5a5a5e"), ramp: RAMP.metal, shade(c) { c.glyph = "O"; } }, jar: { color: hex("#8fc0b0"), ramp: " .:+*", shade(c) { c.color = [hex("#8fc0b0"), hex("#e0a050"), hex("#c8d070"), hex("#b85a4a")][Math.floor((c.x + 4) * 3) % 4]; } },
      herbs: foliage("#7a9a4a", "#5a7a3a", " .,;\"%"), barrel: { color: hex("#7a5236"), ramp: RAMP.wood, shade(c) { if (Math.abs(Math.sin(c.y * 9)) < .15) { c.color = hex("#8a8e94"); c.glyph = "="; } } }, block: plain("#9a7550", RAMP.wood),
      plate: { color: hex("#d8dce0"), ramp: RAMP.wall, shade(c) { c.glyph = "O"; } }, onion: plain("#c8803a", RAMP.wall), garlic: plain("#ece4d0", RAMP.wall), sack: { color: hex("#c8b48a"), ramp: RAMP.cloth, shade(c) { if (c.y > .4) c.color = hex("#ece8dc"); } } },
    particles: (t, put) => { for (let i = 0; i < 10; i++) { const p = (t * .3 + i / 10) % 1; put(Math.sin(i * 3 + t) * .12 * (1 + p), .9 + p * 1.2, Math.cos(i * 2) * .1, p < .4 ? "o" : "°", [220, 220, 226], .7 * (1 - p)); } },
  }, [0, 1.0, .2], 1.25);
  SKILL.metalwork = () => lit({ fps: 9, moving: [[.05, .95, .05, .32], [-2.1, .6, -.6, .35]], camera: orbit(3.2, 1.35, [0, .6, -.2]), light: [.2, .6, .7], ambient: .4,
    map(x, y, z, t, h) { const b = [99, ""]; h.m = "floor";
      room(x, y, z, b, h, { back: 2.3, left: 3.2, floor: "earthfloor" });
      U(b, Math.min(sd.box(x, y - .3, z, .18, .3, .16), sd.box(x, y - .66, z, .5, .08, .2), sd.box(x - .55, y - .68, z, .12, .05, .12)), "anvil", h);
      U(b, sd.box(x, y - .76, z, .26, .02, .08), "hotbar", h);
      const lift = Math.max(0, Math.sin(t * 4)) * .35;
      U(b, sd.capsule(x, y, z, .55, .82 + lift, .3, .2, .9 + lift * .6, .1, .03), "handle", h); U(b, sd.box(x - .15, y - .9 - lift * .6, z - .05, .08, .06, .06), "metal", h);
      // The forge with its hood and chimney, bellows, a quench barrel, a grindstone, tool racks.
      U(b, Math.max(sd.box(x + 1.3, y - .5, z + 1.2, .6, .5, .5), -sd.box(x + 1.3, y - .45, z + .85, .35, .25, .2)), "brick", h);
      U(b, sd.box(x + 1.3, y - .4, z + 1.1, .3, .18, .1), "forgefire", h);
      U(b, sd.roof(x + 1.3, y - 1.25, z + 1.2, .7, .4, .55), "brick", h); U(b, sd.box(x + 1.3, y - 2.2, z + 1.4, .2, .7, .2), "brick", h);
      U(b, sd.rbox(x + 2.35, y - .55, z + .9, .25, .08 + .04 * Math.sin(t * 2), .2, .04), "leather", h);
      U(b, sd.cyl(x - 1.3, y, z + .3, .3, .6), "barrel", h); U(b, sd.cyl(x - 1.3, y - .55, z + .3, .26, .02), "quench", h);
      const [gx, gz] = A.rotY(x + 2.1, z - .6, 0); U(b, sd.torus(gx, gz, y - .6, .3, .07), "grind", h); U(b, sd.box(gx, y - .3, gz, .05, .3, .05), "handle", h);
      for (let i = 0; i < 6; i++) { const tx = -2.4 + i * .3; U(b, sd.capsule(x, y, z, tx, 1.95, -2.25, tx, 1.3 - (i % 2) * .15, -2.25, .02), "metal", h); U(b, sd.box(x - tx, y - (1.3 - (i % 2) * .15), z + 2.25, .06 + (i % 3) * .02, .04, .02), "metal", h); }
      for (let i = 0; i < 3; i++) U(b, sd.torus(x - (1.0 + i * .3), z + 2.27, y - 1.6, .1, .02), "metal", h);   // horseshoes on the wall
      U(b, sd.box(x + 2.6, y - .45, z - .3, .4, .03, .7), "table", h);
      // On the left wall: round shields and crossed blades; ingots stacked below; a coal heap.
      for (const [sz, sy] of [[1.6, 1.6], [3.0, 1.7]]) { U(b, sd.cyl(z - sz, x + 3.17, y - sy, .32, .03) + 0, "shield", h); U(b, sd.sphere(x + 3.15, y - sy, z - sz, .07), "metal", h); }
      for (const d of [-1, 1]) U(b, sd.capsule(x, y, z, -3.13, 1.15, 2.3 - d * .45, -3.13, 2.1, 2.3 + d * .45, .025), "blade", h);
      for (let i = 0; i < 6; i++) U(b, sd.box(x + 2.6 + (i % 3) * .0, y - (.06 + Math.floor(i / 3) * .12), z - (1.2 + (i % 3) * .22) , .2, .05, .08), "ingot", h);
      U(b, sd.sphere(x + 2.4, y + .2, z - 3.0, .55) + .05 * noise2(x * 12, z * 12), "coal", h);
      return b[0]; },
    materials: { ...ROOM(), earthfloor: floor("#3d3833"), floor: floor("#3d3833"), anvil: plain("#5d6168", RAMP.metal), handle: plain("#7a5a3e", RAMP.wood), metal: plain("#9aa0a8", RAMP.metal),
      hotbar: { color: [255, 150, 60], shade(c, t) { c.emit = .75 + .2 * Math.sin(t * 3); c.glyph = "="; } }, brick: { color: hex("#9a4f3a"), ramp: RAMP.wall, shade(c) { if (Math.abs((c.y * 6) % 1) < .12) c.glyph = "="; } },
      forgefire: { color: [255, 140, 50], shade(c, t) { const n = noise2(c.x * 9 + t * 2, c.y * 9); c.emit = .7 + .3 * n; c.glyph = n > .5 ? "*" : "^"; c.color = mix([255, 220, 120], [220, 60, 30], n); } },
      leather: plain("#7a5236", RAMP.cloth), barrel: plain("#6a4a32", RAMP.wood), quench: { color: hex("#3a5a6a"), shade(c, t) { c.glyph = Math.sin(c.x * 30 + t * 2) > 0 ? "~" : "-"; } },
      shield: { color: hex("#8a3a2a"), ramp: RAMP.wood, shade(c) { const r = Math.hypot(c.y - (c.z > 2.3 ? 1.7 : 1.6), c.z - (c.z > 2.3 ? 3.0 : 1.6)); if (r > .26) { c.color = hex("#9aa0a8"); c.glyph = "O"; } } },
      blade: plain("#d8dee4", RAMP.metal), ingot: { color: hex("#d8a050"), ramp: RAMP.metal, shade(c) { c.color = Math.floor(c.z * 4.5) % 2 ? hex("#c8ccd2") : hex("#d89a5a"); } }, coal: { color: hex("#2e2a28"), ramp: RAMP.rock, shade(c, t) { if (noise2(c.x * 14 + t * .5, c.z * 14) > .78) { c.color = [230, 110, 50]; c.emit = .7; c.glyph = "*"; } } },
      grind: { color: hex("#9a948a"), ramp: RAMP.rock, shade(c, t) { c.glyph = "-\\|/"[Math.floor((t * 6) % 4)]; } }, table: plain("#6a5038", RAMP.wood) },
    particles: (t, put) => { const hit = (t * 4 / (Math.PI * 2)) % 1; if (hit > .7) for (let i = 0; i < 10; i++) { const p = (hit - .7) / .3, a = i * .63; put(Math.cos(a) * p * .6, .8 + Math.sin(p * 3) * .3, Math.sin(a) * p * .4, "*", [255, 200, 90], 1 - p); }
      for (let i = 0; i < 6; i++) { const q = (t * .8 + i / 6) % 1; put(-2.1 + Math.cos(i * 2 + t) * .32 * q * 2, .6 + q * .2, .6 + Math.sin(i * 2 + t) * .1, "·", [255, 220, 150], 1 - q); }   // grindstone sparks
      for (let i = 0; i < 8; i++) { const q = (t * .25 + i / 8) % 1; put(-1.3 + Math.sin(i) * .1, .6 + q * 1.4, -1.2, "°", [190, 190, 196], .4 * (1 - q)); } },
  }, [-1.3, .9, -.4], 1.2);
  SKILL.carpentry = () => lit({ fps: 9, moving: [[.25, .78, 0, .42]], camera: orbit(3.2, 1.3, [0, .55, -.2]), light: [-.4, .8, .4], ambient: .4,
    map(x, y, z, t, h) { const b = [99, ""]; h.m = "shavings";
      room(x, y, z, b, h, { back: 2.3, left: 3.2, floor: "shavings", window: 1.6, wall: "planks" });
      for (const sx of [-.7, .7]) { U(b, sd.capsule(x, y, z, sx - .2, 0, -.2, sx, .55, 0, .03), "wood", h); U(b, sd.capsule(x, y, z, sx + .2, 0, .2, sx, .55, 0, .03), "wood", h); }
      U(b, sd.box(x, y - .6, z, 1.1, .04, .18), "plank", h);
      U(b, sd.box(x - .2 - .15 * Math.sin(t * 3), y - .78, z, .3, .12, .015), "saw", h);
      // The workbench with a vise, planes and chisels; lumber; a half-made chair; tools on the wall; a lathe.
      U(b, sd.box(x + 1.9, y - .8, z + 1.4, 1.0, .06, .4), "plank", h); for (const [lx, lz] of [[1.0, 1.1], [2.8, 1.1], [1.0, 1.7], [2.8, 1.7]]) U(b, sd.box(x - lx, y - .4, z + lz, .05, .4, .05), "wood", h);
      U(b, sd.box(x + 1.3, y - .95, z + 1.2, .12, .1, .1), "metal", h); U(b, sd.rbox(x + 2.1, y - .92, z + 1.35, .18, .06, .06, .02), "wood", h); for (let i = 0; i < 4; i++) U(b, sd.capsule(x, y, z, -2.4 - i * .1, .88, -1.2, -2.6 - i * .1, .88, -1.05, .012), "metal", h);
      for (let k = 0; k < 5; k++) U(b, sd.box(x - 2.4, y - (.08 + k * .12), z - .6, .9, .05, .14 - k * .01), "lumber", h);
      U(b, sd.box(x + 2.1, y - .45, z - .1, .25, .03, .25), "plank", h); for (const [cx2, cz2] of [[1.88, -.12], [2.32, -.12], [1.88, .32], [2.32, .32]]) U(b, sd.box(x + cx2, y - .22, z + cz2, .025, .22, .025), "wood", h); U(b, sd.box(x + 2.1, y - .75, z + .33, .25, .3, .02), "plank", h);
      for (let i = 0; i < 5; i++) { const wx = -1.0 + i * .5; U(b, sd.box(x - wx, y - 1.5, z + 2.27, .16 + (i % 2) * .06, .05 + (i % 3) * .03, .02), "metal", h); U(b, sd.capsule(x, y, z, wx, 1.5, -2.27, wx, 1.25, -2.27, .02), "wood", h); }
      U(b, sd.capsule(x, y, z, -2.6, .7, 1.6, -1.6, .7, 1.6, .06), "plank", h); U(b, sd.box(x + 2.8, y - .4, z + 1.6, .08, .4, .15), "wood", h);
      // On the left wall: bow saws and frame saws, clamps; a finished cabinet and a coopered barrel.
      for (let i = 0; i < 3; i++) { const sz = 1.2 + i * .8; U(b, Math.max(Math.abs(sd.box(x + 3.17, y - 1.6, z - sz, .02, .25, .3)) - .025, 0), "wood", h); U(b, sd.box(x + 3.17, y - 1.38, z - sz, .015, .02, .28), "saw", h); }
      for (let i = 0; i < 4; i++) U(b, Math.abs(sd.box(x + 3.17, y - 2.25, z - (1.3 + i * .45), .02, .12, .08)) - .015, "metal", h);
      U(b, sd.box(x + 2.7, y - .7, z - 3.4, .35, .7, .45), "cabinet", h); U(b, sd.cyl(x + 2.6, y, z - 2.4, .28 + .03 * Math.cos((y - .35) * 4), .7), "lumber", h);
      return b[0]; },
    materials: { ...ROOM(), shavings: { color: hex("#8a7050"), ramp: " .,'`~", shade(c) { c.alpha = .55; c.color = mix(hex("#7a6040"), hex("#d8b27c"), noise2(c.x * 6, c.z * 6)); } }, wood: plain("#7a5a3e", RAMP.wood),
      planks: { color: hex("#7a5a3e"), ramp: RAMP.wood, shade(c) { c.glyph = Math.abs(Math.sin(c.x * 4 + c.z * 4)) < .1 ? "|" : "-"; c.alpha = .5; } },
      plank: { color: hex("#d8b27c"), ramp: RAMP.wood, shade(c) { c.glyph = Math.abs(Math.sin(c.x * 20 + noise2(c.x * 3, c.z * 3) * 4)) > .8 ? "=" : "-"; } }, saw: plain("#c8ccd2", RAMP.metal), metal: plain("#b8bec4", RAMP.metal),
      cabinet: { color: hex("#a87a4a"), ramp: RAMP.wood, shade(c) { if (Math.abs(c.z + 3.4) < .02 || Math.abs(c.y - .7) < .03) c.glyph = "|"; if (Math.abs(c.z + 3.25) < .04 && Math.abs(c.y - .8) < .05) { c.glyph = "o"; c.color = hex("#d8c088"); } } },
      lumber: { color: hex("#c49a68"), ramp: RAMP.wood, shade(c) { if (c.nx > .7 || c.nx < -.7) { c.glyph = "@"; c.color = hex("#e0bc88"); } } } },
    particles: (t, put) => { for (let i = 0; i < 6; i++) { const p = (t * .9 + i / 6) % 1; put(-.2 + i * .05, .6 - p * .6, .15 + p * .2, "'", [230, 200, 150], 1 - p); } for (let i = 0; i < 8; i++) { const q = (t * .05 + i / 8) % 1; put(-2 + q * 3, 1.2 + Math.sin(q * 6 + i) * .4, -1.2 + Math.cos(i) * .4, "·", [230, 210, 170], .3 * Math.sin(q * 3.14)); } },
  }, [.2, 2.4, .8], 1.15, [255, 226, 180]);
  SKILL.tailoring = () => lit({ fps: 9, moving: [[.32, .95, .07, .22], [-2.1, .9, -.6, .5]], camera: orbit(3.2, 1.25, [0, .75, -.2], .1), light: [-.3, .7, .6], ambient: .4,
    map(x, y, z, t, h) { const b = [99, ""]; h.m = "floor";
      room(x, y, z, b, h, { back: 2.2, left: 3.2, floor: "rugfloor", window: -1.4, side: 2.2, wall: "plaster" });
      // On the left wall: cloaks and a shirt hanging from pegs; a chair with a cushion.
      for (const [gz, m] of [[1.0, "bolt2"], [3.4, "bolt1"]]) { U(b, sd.capsule(x, y, z, -3.1, 1.95, gz, -2.95, 1.95, gz, .025), "frame", h); U(b, Math.max(ell3(x + 3.05, y - 1.45, z - gz, .1, .5, .3 - .15 * (y - 1.45)), y - 1.95), m, h); }
      U(b, sd.box(x + 2.5, y - .45, z - 2.8, .25, .03, .25), "frame", h); U(b, sd.box(x + 2.72, y - .75, z - 2.8, .03, .3, .25), "frame", h); for (const [cx2, cz2] of [[2.3, 2.6], [2.7, 2.6], [2.3, 3.0], [2.7, 3.0]]) U(b, sd.box(x + cx2, y - .22, z - cz2, .025, .22, .025), "frame", h); U(b, sd.rbox(x + 2.5, y - .52, z - 2.8, .22, .04, .22, .03), "bolt3", h);
      U(b, Math.min(sd.capsule(x, y, z, -.8, 0, 0, -.8, 1.4, 0, .04), sd.capsule(x, y, z, .8, 0, 0, .8, 1.4, 0, .04), sd.capsule(x, y, z, -.8, 1.35, 0, .8, 1.35, 0, .04), sd.capsule(x, y, z, -.8, .25, 0, .8, .25, 0, .04)), "frame", h);
      U(b, sd.box(x, y - .8, z - .02 * Math.sin(x * 4), .66, .48, .01), "hide", h);
      U(b, sd.capsule(x, y, z, .2 + .1 * Math.sin(t * 3), .9, .05, .35 + .1 * Math.sin(t * 3), 1, .1, .008), "needle", h);
      // A spinning wheel turning, a loom with threads, a dress form, bolts of cloth, yarn, scissors.
      const [sx, sz] = A.rotY(x + 2.1, z + .6, 0); U(b, Math.abs(sd.torus(sx, sz, y - .85, .38, 0)) - .025, "frame", h); for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI + t * 1.5; U(b, sd.capsule(sx, y, sz, 0, .85, 0, Math.cos(a) * .38, .85 + Math.sin(a) * .38, 0, .012), "frame", h); } U(b, sd.box(sx - .3, y - .3, sz, .45, .05, .12), "frame", h);
      U(b, Math.max(sd.box(x - 2.0, y - .9, z + 1.4, .7, .9, .3), -sd.box(x - 2.0, y - .95, z + 1.4, .62, .75, .4)), "frame", h); U(b, sd.box(x - 2.0, y - .95, z + 1.4, .62, .75, .01), "threads", h);
      U(b, sd.capsule(x, y, z, 2.2, 0, -1.4, 2.2, 1.0, -1.4, .03), "frame", h); U(b, ell3(x - 2.2, y - 1.25, z + 1.4, .22, .32, .16), "cloth2", h); U(b, ell3(x - 2.2, y - .95, z + 1.4, .26, .2, .2), "cloth2", h);
      for (let i = 0; i < 5; i++) U(b, sd.capsule(x, y, z, -2.9, .1 + i * .18, -.4 + i * .05, -1.9, .1 + i * .18, -.4 + i * .05, .08), ["bolt1", "bolt2", "bolt3", "bolt1", "bolt2"][i], h);
      U(b, Math.max(sd.cyl(x - 1.2, y, z + .9, .28, .28), -sd.cyl(x - 1.2, y + .05, z + .9, .24, .4)), "basket", h); for (let i = 0; i < 4; i++) U(b, sd.sphere(x - 1.2 - Math.cos(i * 1.6) * .12, y - .3, z + .9 - Math.sin(i * 1.6) * .12, .09), ["bolt1", "bolt2", "bolt3", "bolt2"][i], h);
      return b[0]; },
    materials: { ...ROOM(), floor: floor("#4a4036"), frame: plain("#7a5a3e", RAMP.wood), needle: plain("#e8eef2", RAMP.metal),
      rugfloor: { color: hex("#8a3a32"), ramp: " .:-=", shade(c) { const r = Math.max(Math.abs(c.x * .5), Math.abs(c.z)); c.alpha = .75; c.color = r < 1.2 ? (Math.floor(r * 6) % 2 ? hex("#a84a3a") : hex("#d8a858")) : hex("#5a4230"); c.glyph = r < 1.2 ? "#" : "-"; } },
      plaster: { color: hex("#c8b89a"), ramp: " .:-=", shade(c) { c.alpha = .45; c.color = mix(hex("#a89878"), hex("#d8c8a8"), noise2(c.x * 2 + c.z, c.y * 2)); } },
      hide: { color: hex("#c49a6c"), ramp: RAMP.wall, shade(c) { if (Math.abs(Math.abs(c.x) - .6) < .03 || Math.abs(Math.abs(c.y - .8) - .44) < .03) { c.glyph = "+"; c.color = hex("#e8d8b8"); } } },
      threads: { color: hex("#e8dcc0"), ramp: " .:|", shade(c) { c.glyph = "|"; c.color = Math.floor(c.x * 20) % 3 ? hex("#c8553d") : hex("#e8dcc0"); } }, cloth2: plain("#4a6a8a", RAMP.cloth),
      bolt1: plain("#b84a4a", RAMP.cloth), bolt2: plain("#4a7aa8", RAMP.cloth), bolt3: plain("#d8b84a", RAMP.cloth), basket: plain("#c8a06a", RAMP.wood) },
  }, [0, 2.3, .8], 1.15, [255, 214, 160]);
  const ell3 = (x, y, z, rx, ry, rz) => { const k = Math.min(rx, ry, rz); return (Math.hypot(x / rx, y / ry, z / rz) - 1) * k; };
  SKILL.remedies = () => {
    const mule = window.UmbraBeings ? placedBeing(window.UmbraBeings.COMPANIONS.mule("mu_"), 2.6, -1.6, 1.25, -.4) : null;
    return { fps: 9, camera: orbit(3.3, 1.35, [0, .6, -.3], .1), light: [-.3, .8, .5], ambient: .32,
      fog: { color: hex("#12160f"), density: .03, start: 8, fade: .35 },
      map(x, y, z, t, h) { const b = [y, ""]; h.m = "grass";
        U(b, sd.box(x, y - .38, z, .9, .04, .45), "table", h); for (const [lx, lz] of [[-.8, -.38], [.8, -.38], [-.8, .38], [.8, .38]]) U(b, sd.box(x - lx, y - .19, z - lz, .04, .19, .04), "table", h);
        for (const [vx, vz, c] of [[-.5, 0, "redliquid"], [-.2, .15, "greenliquid"], [.15, -.05, "blueliquid"]]) {
          U(b, Math.max(sd.cyl(x - vx, y - .42, z - vz, .09, .3), -sd.cyl(x - vx, y - .45, z - vz, .07, .3)), "glass", h);
          U(b, sd.cyl(x - vx, y - .42, z - vz, .072, .17), c, h); }
        U(b, Math.max(sd.sphere(x - .55, y - .55, z + .1, .17), -sd.sphere(x - .55, y - .62, z + .1, .14), .55 - y), "mortar", h);
        // The healer's wagon: a canvas cover with a red cross, wheels, the mule; herbs drying; a bubbling cauldron; a stretcher.
        U(b, sd.box(x - .4, y - .55, z + 1.7, 1.1, .12, .55), "wagonwood", h);
        U(b, Math.max(Math.hypot(y - .67, z + 1.7) - .62, Math.abs(x - .4) - 1.05, -(y - .67)), "canvas", h);
        for (const [wx, wz] of [[-.4, 1.12], [1.2, 1.12], [-.4, 2.28], [1.2, 2.28]]) U(b, Math.abs(sd.torus(x - wx, z + wz, y - .32, .3, 0)) - .03, "wagonwood", h);
        U(b, sd.capsule(x, y, z, 1.5, .5, -1.7, 2.3, .55, -1.6, .025), "wagonwood", h);
        mule?.f(x, y, z, b, h, t);
        for (let i = 0; i < 6; i++) U(b, sd.cone(x - (-2.4 + i * .25), -(y - 1.8), z + .5, .06, .35), "herbs", h); U(b, sd.capsule(x, y, z, -2.6, 1.82, -.5, -1.0, 1.82, -.5, .015), "wagonwood", h); for (const px of [-2.6, -1.0]) U(b, sd.cyl(x - px, y, z + .5, .03, 1.85), "wagonwood", h);
        U(b, Math.max(sd.cyl(x + 1.6, y - .05, z - .4, .32, .45), -sd.cyl(x + 1.6, y - .1, z - .4, .27, .5)), "pot", h); U(b, sd.cyl(x + 1.6, y - .43, z - .4, .27, .02), "greenliquid", h);
        U(b, sd.box(x - 2.2, y - .25, z - .8, .9, .04, .3), "canvas", h);
        forest(x, y, z, b, h, { behind: -2.6, clear: 3.2, size: .95, broad: .5, seed: 13 });
        return b[0]; },
      materials: { ...COMMON(), grass: ground("#4c6a40", "#6a7a4a"), table: plain("#8a6a4a", RAMP.wood), glass: { color: [200, 230, 236], ramp: " .:+", shade(c) { c.alpha = .7; } }, mortar: plain("#c9c4b8", RAMP.rock),
        redliquid: { color: [220, 90, 100], shade(c) { c.emit = .75; c.glyph = "~"; } }, greenliquid: { color: [110, 210, 120], shade(c, t) { c.emit = .75; c.glyph = noise2(c.x * 20 + t * 2, c.z * 20) > .5 ? "o" : "~"; } }, blueliquid: { color: [110, 160, 230], shade(c) { c.emit = .75; c.glyph = "~"; } },
        wagonwood: plain("#7a5a3e", RAMP.wood), canvas: { color: hex("#e8e0cc"), ramp: " .:-=+", shade(c) { const cr = Math.abs(c.x - .4) < .18 && Math.abs(c.y - 1.15) < .06 || Math.abs(c.x - .4) < .06 && Math.abs(c.y - 1.15) < .18; if (cr) { c.color = hex("#c83a3a"); c.glyph = "#"; } } },
        herbs: foliage("#7a9a4a", "#5a7a3a", " .,;\"%"), pot: plain("#3d3d42", RAMP.metal), ...(mule?.mats || {}) },
      particles: (t, put) => { for (let i = 0; i < 6; i++) { const p = (t * .4 + i / 6) % 1; put(-.2 + Math.sin(i) * .03, .62 + p * .5, .15, "°", [150, 230, 160], .8 * (1 - p)); } for (let i = 0; i < 8; i++) { const p = (t * .3 + i / 8) % 1; put(-1.6 + Math.sin(i * 2 + t) * .15, .5 + p * 1.2, .4, p < .5 ? "o" : "°", [160, 230, 150], .6 * (1 - p)); } },
    };
  };
  SKILL.tinkering = () => lit({ fps: 9, moving: [[2.3, .7, -1.4, .55]], camera: orbit(3, 1.35, [0, .6, -.2], .1), light: [-.3, .8, .5], ambient: .4,
    map(x, y, z, t, h) { const b = [99, ""]; h.m = "floor";
      room(x, y, z, b, h, { back: 2.1, left: 3, floor: "concrete", wall: "pegboard" });
      U(b, sd.box(x, y - .38, z, .95, .04, .45), "bench", h); for (const [lx, lz] of [[-.85, -.38], [.85, -.38], [-.85, .38], [.85, .38]]) U(b, sd.box(x - lx, y - .19, z - lz, .04, .19, .04), "bench", h);
      U(b, sd.rbox(x + .3, y - .58, z, .32, .18, .16, .04), "radio", h); U(b, sd.cyl(x + .1, y - .6, z - .17, .07, .02), "dial", h);
      U(b, sd.capsule(x, y, z, .5, .76, 0, .55, 1.15, 0, .012), "metal", h);
      for (let k = 0; k < 4; k++) U(b, sd.torus(x + .45, z - .05, y - .5 - k * .06, .12, .018), "coil", h);
      // An oscilloscope, a soldering iron, a half-built drone, shelves of parts, a tesla coil, cables.
      U(b, sd.rbox(x - .55, y - .62, z + .15, .2, .2, .18, .03), "radio", h); U(b, sd.box(x - .55, y - .64, z - .04, .15, .12, .01), "scope", h);
      U(b, sd.capsule(x, y, z, .7, .44, .25, .9, .5, .05, .012), "metal", h);
      U(b, sd.sphere(x + .75, y - .5, z + .25, .1), "radio", h); for (const a of [.8, 2.4, 3.9, 5.5]) U(b, sd.capsule(x, y, z, -.75, .5, -.25, -.75 + Math.cos(a) * .2, .52, -.25 + Math.sin(a) * .2, .012), "metal", h);
      for (let i = 0; i < 3; i++) U(b, sd.box(x - 2.0, y - (.6 + i * .5), z + 1.8, .8, .025, .2), "bench", h);
      for (let i = 0; i < 9; i++) U(b, sd.rbox(x - 2.0 + (-.6 + (i % 3) * .55), y - (.72 + Math.floor(i / 3) * .5), z + 1.8, .12, .1, .12, .02), ["radio", "coil", "metal"][i % 3], h);
      U(b, sd.cyl(x - 1.4, y, z + .2, .14, .9), "coil", h); U(b, sd.torus(x - 1.4, y - .95, z + .2, .16, .06), "metal", h);
      U(b, sd.capsule(x, y, z, .3, .01, .5, 1.6, .01, .9, .02), "cable", h); U(b, sd.capsule(x, y, z, -.2, .01, .45, -1.3, .01, .8, .02), "cable", h);
      // On the left wall: a lit circuit board, a coil of cable, a tool strip; a robot arm in the corner.
      U(b, sd.box(x + 2.97, y - 1.6, z - 2.2, .02, .4, .55), "board", h);
      U(b, sd.torus(z - 1.0, x + 2.92, y - 1.5, .22, .03), "cable", h);
      for (let i = 0; i < 6; i++) U(b, sd.capsule(x, y, z, -2.95, 1.0, 3.4 + i * .14, -2.95, .75 - (i % 2) * .1, 3.4 + i * .14, .02), "metal", h);
      { const a = Math.sin(t * .8) * .5; U(b, sd.cyl(x - 2.4, y, z + 1.5, .2, .15), "radio", h); U(b, sd.capsule(x, y, z, 2.4, .15, -1.5, 2.4 + Math.sin(a) * .2, .85, -1.5, .05), "metal", h); U(b, sd.capsule(x, y, z, 2.4 + Math.sin(a) * .2, .85, -1.5, 2.0 + Math.sin(a) * .4, 1.05, -1.2, .04), "metal", h); }
      return b[0]; },
    materials: { ...ROOM(), floor: floor("#3a3530"), concrete: { color: hex("#5a5a5a"), ramp: " .:-", shade(c) { c.alpha = .6; } }, pegboard: { color: hex("#8a7a5a"), ramp: " .o", shade(c) { c.glyph = (Math.floor(c.x * 8) + Math.floor(c.y * 8)) % 2 ? "·" : " "; c.alpha = .5; } },
      bench: plain("#6e5a44", RAMP.wood), radio: plain("#5a6b5e", RAMP.metal), metal: plain("#c8ccd2", RAMP.metal), cable: plain("#2e2e30", RAMP.rock),
      dial: { color: [255, 200, 110], shade(c, t) { c.emit = .7 + .3 * Math.sin(t * 2); c.glyph = "o"; } }, coil: { color: hex("#d98b52"), ramp: RAMP.metal },
      board: { color: hex("#2a6a4a"), ramp: RAMP.metal, shade(c, t) { const n = hash2(Math.floor(c.y * 12), Math.floor(c.z * 12)); c.glyph = n > .7 ? "▪" : Math.abs((c.y * 12) % 1) < .15 ? "-" : "|"; if (n > .93) { c.color = [255, 120, 80]; c.emit = Math.sin(t * 4 + n * 30) > 0 ? .9 : .2; } } },
      scope: { color: [120, 230, 140], shade(c, t) { c.emit = .9; const w = Math.sin(c.x * 40 + t * 4) * .06; c.glyph = Math.abs(c.y - .64 - w) < .025 ? "~" : " "; } } },
    particles: (t, put) => { if (Math.sin(t * 5) > .3) for (let i = 0; i < 5; i++) put(-.45 + (hash2(i, Math.floor(t * 5)) - .5) * .3, .75 + hash2(i + 9, Math.floor(t * 5)) * .25, .05, "ϟ", [170, 220, 255], .9);
      for (let i = 0; i < 6; i++) { const a = t * 6 + i; put(-1.4 + Math.cos(a) * (.2 + hash2(i, Math.floor(t * 8)) * .3), 1.0 + Math.sin(a * 1.7) * .2, -.2 + Math.sin(a) * .2, "ϟ", [190, 200, 255], .8); }
      for (let i = 0; i < 5; i++) { const q = (t * .4 + i / 5) % 1; put(.9 + Math.sin(i) * .03, .5 + q * .4, .05, "°", [200, 200, 206], .5 * (1 - q)); } },
  }, [0, 2.2, .6], 1.1, [210, 228, 255]);

  // ------------------------------------------------------------- support
  SKILL.hearth = () => {
    const B = window.UmbraBeings, seats = [[1.5, .5, "#7a5a3a", "#3a4a5a"], [-1.4, .7, "#5a6a44", "#4a3a30"], [.3, 1.6, "#8a3a3a", "#3a3430"], [-.8, -1.3, "#4a5a7a", "#2e2a26"]];
    const people = B ? seats.map(([px, pz, shirt, pants], i) => placedBeing(B.person({ sit: true, colors: { shirt, pants, hair: ["#3a2a1a", "#8a6a3a", "#1a1410", "#a8a8a8"][i], skin: ["#d9a982", "#8a5a3a", "#c8946a", "#e0b493"][i] }, head: i === 1 ? { kind: "cap", color: "#4a3a2a" } : i === 3 ? { kind: "hood", color: "#5a6a7a" } : undefined }, `h${i}_`), px, pz, 1.3, facing(px, pz))) : [];
    const dog = B ? placedBeing(B.COMPANIONS.dog("dg_"), 1.0, -1.3, .45, 2.2) : null;
    return { fps: 7, moving: [[0, .5, 0, .5]], camera: orbit(3.6, 1.35, [0, .55, 0], .07), light: [0, .5, .8], ambient: .2,
      sky: (u, v, t, col, row) => hash2(col, row) > .982 ? [hash2(col + 1, row) > .8 ? "*" : "·", [226, 230, 246], .4 + .4 * Math.sin(t * (1 + hash2(col, row)) + col)] : null,
      map(x, y, z, t, h) { const b = [y, ""]; h.m = "earth";
        U(b, Math.max(sd.torus(x, y - .05, z, .6, .14), -y), "stone", h);
        U(b, sd.cone(x, y, z, .45, .9 + .12 * Math.sin(t * 6) + .08 * Math.sin(t * 9.3)), "fire", h);
        for (const a of [0, 2.1, 4.2]) U(b, sd.capsule(x, y, z, Math.cos(a) * .4, .08, Math.sin(a) * .4, -Math.cos(a) * .1, .3, -Math.sin(a) * .1, .07), "log", h);
        // Log benches, the people round the fire, tents, lantern posts, a spit, a dog by the fire.
        for (const [px, pz] of seats) { const [rx, rz] = A.rotY(x - px * 1.05, z - pz * 1.05, facing(px, pz)); U(b, sd.capsule(rx, y, rz, -.4, .14, 0, .4, .14, 0, .14), "log", h); }
        for (const p of people) p.f(x, y, z, b, h, t);
        dog?.f(x, y, z, b, h, t);
        for (const [tx, tz, r] of [[-2.8, -2.6, .3], [2.9, -2.4, -.4], [0, -3.6, 0]]) { const [rx, rz] = A.rotY(x - tx, z - tz, r); U(b, sd.roof(rx, y, rz, .8, .9, 1.0), "tent", h); }
        for (const [lx, lz] of [[-3.2, 1.4], [1.6, -2.4], [-2.4, -.8], [3.4, -1.6]]) { U(b, sd.cyl(x - lx, y, z - lz, .04, 1.5), "log", h); U(b, sd.sphere(x - lx, y - 1.55, z - lz, .08), "lantern", h); }
        for (const s of [-1, 1]) U(b, sd.capsule(x, y, z, s * .75, 0, 0, s * .75, .95, 0, .03), "log", h); U(b, sd.capsule(x, y, z, -.8, .92, 0, .8, .92, 0, .02), "log", h);
        forest(x, y, z, b, h, { behind: -3.6, clear: 0, size: 1.0, seed: 17 });
        return b[0]; },
      materials: { ...COMMON(), earth: { color: hex("#3a3028"), ramp: " .,:;'", shade(c) { c.alpha = .7; const r = Math.hypot(c.x, c.z); c.emit = clamp(1.2 / (1 + r * r * .6) * .94); c.color = mix(hex("#3a3028"), hex("#d88a4a"), clamp(1.2 / (1 + r * r * .8))); } },
        stone: { color: hex("#8a8278"), ramp: RAMP.rock, shade(c) { c.emit = .55; } }, fire, log: plain("#5e4532", RAMP.wood),
        tent: { color: hex("#c97b3d"), ramp: RAMP.wall, shade(c) { const r = Math.hypot(c.x, c.z); c.emit = clamp(.9 / (1 + r * r * .25)); } },
        lantern: { color: [255, 200, 110], shade(c, t) { c.emit = .85 + .15 * Math.sin(t * 5 + c.x); c.glyph = "@"; } },
        ...Object.assign({}, ...people.map((p) => p.mats)), ...(dog?.mats || {}) },
      particles: (t, put) => { for (let i = 0; i < 16; i++) { const p = (t * .35 + i / 16) % 1; put(Math.sin(i * 3 + t) * .25 * (1 + p), .6 + p * 1.6, Math.cos(i * 5) * .2, p < .5 ? "*" : "·", mix([255, 220, 120], [220, 80, 40], p), .9 * (1 - p)); } },
    };
  };
  SKILL.signals = () => ({ fps: 4, live: true, drift: 1, camera: drift(4.4, 1.6, [0, 1.4, 0], .22, .045), light: [-.4, .7, .5], ambient: .3,
    sky: (u, v, t, col, row) => hash2(col, row) > .985 ? ["·", [220, 226, 246], .5 + .4 * Math.sin(t + col)] : null,
    map(x, y, z, t, h) { const g = .5 * noise2(x * .25, z * .25) * clamp((Math.hypot(x, z) - 3) / 4); const b = [y - g, ""]; h.m = "hill";
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) U(b, sd.capsule(x, y, z, sx * .45, 0, sz * .45, sx * .06, 3, sz * .06, .025), "mast", h);
      for (let k = 1; k < 6; k++) { const yy = k * .5, ww = Math.max(.07, .45 - yy * .13); U(b, Math.max(sd.box(x, y - yy, z, ww, .015, ww), -sd.box(x, y - yy, z, ww - .04, .1, ww - .04)), "mast", h); }
      U(b, sd.sphere(x, y - 3.05, z, .08), "beacon", h);
      U(b, sd.box(x + 1, y - .3, z + .6, .35, .3, .28), "hut", h); U(b, sd.roof(x + 1, y - .6, z + .6, .42, .35, .2), "roofing", h);
      // A dish, more masts on the hills, power lines and a cabin.
      U(b, Math.max(sd.sphere(x - 1.6, y - .9, z - .4, .45), -sd.sphere(x - 1.75, y - .95, z - .45, .42), -(x - 1.6 + .1)), "dish", h); U(b, sd.cyl(x - 1.55, y, z - .4, .05, .6), "mast", h);
      for (const [mx, mz] of [[-4.5, -4], [5, -5], [1.5, -7]]) { U(b, sd.cyl(x - mx, y - .5 * noise2(mx * .25, mz * .25), z - mz, .04, 2.2), "mast", h); U(b, sd.sphere(x - mx, y - 2.25, z - mz, .07), "beacon", h); }
      for (let k = -3; k <= 3; k++) { const px = k * 1.8, pz = 2.2 + k * .2; U(b, sd.cyl(x - px, y, z - pz, .035, 1.1), "pole", h); U(b, sd.box(x - px, y - 1.05, z - pz, .25, .02, .02), "pole", h); }
      if (Math.abs(x) < 5.4) { const u = (((x % 1.8) + 1.8) % 1.8) / 1.8; U(b, Math.hypot(y - (1.07 - .12 * Math.sin(u * Math.PI)), z - (2.2 + x / 9)) - .008, "wire", h); }   // sagging power line
      cabin(x + 2.6, y, z + 2.2, .8, b, h, .4);
      return b[0]; },
    materials: { ...COMMON(), hill: ground("#3f5a45", "#5c7652"), mast: plain("#c0c6cc", RAMP.metal), hut: plain("#7a6a5a", RAMP.wall), roofing: plain("#5a4a3a", RAMP.wall), pole: plain("#6a5040", RAMP.wood), wire: { color: hex("#3a3a3a"), shade(c) { c.glyph = "-"; } },
      dish: { color: hex("#d8dce0"), ramp: RAMP.metal, shade(c) { c.glyph = "o"; } }, beacon: { color: [255, 70, 60], shade(c, t) { c.emit = Math.sin(t * 3 + c.x) > 0 ? 1 : .3; c.glyph = "@"; } } },
    particles: (t, put) => { for (let k = 0; k < 3; k++) { const p = (t * .4 + k / 3) % 1; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; put(Math.cos(a) * p * 2.4, 3.05, Math.sin(a) * p * 2.4, "·", [140, 200, 230], .7 * (1 - p)); } } },
  });
  SKILL.scouting = () => ({ fps: 6, live: true, drift: 1, camera: drift(4.2, 1.8, [0, .4, 0], .22, .045), light: [-.4, .8, .3], ambient: .32,
    fog: { color: hex("#141a14"), density: .04, start: 6, fade: .4 },
    map(x, y, z, t, h) {
      // A gorge under the rope bridge, mountains beyond, the trail on either side.
      const gorge = Math.abs(x) < 1.5 ? -1.8 * (1 - (x / 1.5) ** 2) : 0, mtn = Math.max(0, -z - 4) * .7 + 2 * noise2(x * .18, z * .2) * clamp((-z - 4) / 3);
      const b = [y - .2 * noise2(x * .7, z * .7) - gorge - mtn, ""]; h.m = Math.abs(x) < 1.45 ? "gorge" : -z > 4.5 ? "mountain" : "trail";
      U(b, sd.capsule(x, y, z, -1.6, .55, -.2, 1.6, .55, -.2, .03), "rope", h); U(b, sd.capsule(x, y, z, -1.6, .55, .6, 1.6, .55, .6, .03), "rope", h);
      for (let k = -6; k <= 6; k++) U(b, sd.box(x - k * .25, y - (.52 - .12 * Math.cos(k / 6 * 1.57)), z - .2, .1, .02, .4), "plank", h);
      for (const px of [-1.6, 1.6]) for (const pz of [-.2, .6]) U(b, sd.cyl(x - px, y, z - pz, .05, .8), "post", h);
      U(b, sd.cyl(x - 2.4, y, z + .9, .03, .9), "post", h); U(b, sd.box(x - 2.25, y - .78, z + .9, .15, .09, .01), "flag", h);
      // A signpost, a tent and a cairn on the far side; pines.
      U(b, sd.cyl(x + 2.4, y, z - 1.0, .04, 1.1), "post", h); for (const [sy, a] of [[.95, .4], [.75, -.5]]) { const [rx, rz] = A.rotY(x + 2.4, z - 1.0, a); U(b, sd.box(rx - .2, y - sy, rz, .25, .06, .015), "plank", h); }
      { const [rx, rz] = A.rotY(x - 2.6, z + 1.8, .4); U(b, sd.roof(rx, y, rz, .5, .6, .7), "tent", h); }
      for (let i = 0; i < 4; i++) U(b, sd.sphere(x + 2.8, y - (.1 + i * .17), z + 1.6, .16 - i * .03), "stone", h);
      forest(x, y, z, b, h, { behind: -1.2, clear: 3.0, size: .9, seed: 19, sp: 1.2, thin: .4 });
      return b[0]; },
    materials: { ...COMMON(), trail: ground("#6f8a52", "#9a8a62"), gorge: { color: hex("#5a4a3a"), ramp: RAMP.rock, shade(c) { c.color = mix(hex("#3a2e24"), hex("#8a7058"), clamp(1 + c.y / 2)); } },
      mountain: { color: hex("#7a8a9a"), ramp: RAMP.rock, shade(c) { c.color = c.y > 2.6 ? hex("#e8eef2") : mix(hex("#5a6a6a"), hex("#9aa4ac"), noise2(c.x * .8, c.y)); } },
      rope: plain("#c8a46e", RAMP.wood), plank: plain("#8a6a4a", RAMP.wood), post: plain("#6e5440", RAMP.wood), stone: plain("#8a8378", RAMP.rock), tent: plain("#4a7a5a", RAMP.wall),
      flag: { color: hex("#e0705a"), shade(c, t) { c.emit = .8; c.glyph = Math.sin(t * 6 + c.x * 20) > 0 ? "~" : "="; } } },
    particles: (t, put) => birds(t, put, 2.8, 5),
  });

  // ------------------------------------------------------------ the valley
  // Eight buildings around the hub; each grows with its level (0-10).
  const SITES = { garden: [-3.2, -.6], well: [-1.6, 1.4], lumber: [1.6, 1.4], salvage: [3.2, -.6], solar: [-3.6, -3.4], clinic: [-1.2, -4.2], archive: [1.2, -4.2], hearth: [3.6, -3.4] };
  const SITE_LIST = Object.entries(SITES);
  function valley(getLevels) {
    // Levels are read once per build (the view rebuilds when they change).
    let lv = getLevels();
    const H = (x, z) => { const k = clamp((Math.hypot(x, z + 1.5) - 5.5) / 3); return k ? .6 * noise2(x * .22 + 4, z * .22) * k * (1 + Math.max(0, -z - 6) * .25) : 0; };
    // Paths from the hub to every built site; the stream across the open front.
    const HUB = [0, -1.4], seg = (x, z, ax, az, bx, bz) => { const dx = bx - ax, dz = bz - az, k = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)); return Math.hypot(x - ax - dx * k, z - az - dz * k); };
    const STREAM = (x) => 2.35 + .2 * Math.sin(x * .55 + 1) + .08 * Math.sin(x * 1.3);
    const LAMPS = [[-.9, .1], [.9, .1], [-2.3, -2.4], [2.3, -2.4]], ROCKS = [[-5.2, -3.6, .3], [5.0, -1.2, .35], [-4.4, 1.6, .25], [4.6, 1.9, .28], [-6, -.8, .4], [5.8, -4.4, .3]];
    const MILL = [-5.0, -.3];
    const scene = { camera: () => ({ pos: [0, 3.0, 7.4], at: [0, .55, -1.4], fovV: 31 }), light: [-.5, .8, .45], ambient: .28, stillTime: 2, shimmerFps: 10, movingShadows: false,
      moving: [[MILL[0], 1.25, MILL[1] + .2, .75]],
      fog: { color: hex("#0f1418"), density: .04, start: 9, fade: .5 },
      sky: (u, v, t, col, row) => hash2(col, row) > .975 ? [hash2(col + 1, row) > .8 ? "*" : "·", [226, 230, 246], .3 + .5 * (.5 + .5 * Math.sin(t * (1 + hash2(col, row)) + col))] : null,
      refresh() { lv = getLevels(); },
      map(x, y, z, t, h) {
        const sdz = z - STREAM(x), bank = Math.abs(sdz) < .5 ? .14 * (1 - (sdz / .5) ** 2) : 0;
        const b = [y - H(x, z) + bank, ""]; h.m = "ground";
        if (y < .3) {
          if (Math.abs(sdz) < .42) U(b, y + .05, "stream", h);
          else {
            let pd = 9;
            for (const [id, [sx, sz]] of SITE_LIST) if (lv[id]) pd = Math.min(pd, seg(x, z, HUB[0], HUB[1], sx, sz));
            pd = Math.min(pd, seg(x, z, HUB[0], HUB[1], 0, 4.2));   // the track out of the valley, over the bridge
            if (pd < .16) h.m = "path";
          }
        }
        // The footbridge over the stream, on the track.
        if (Math.abs(x) < .5 && Math.abs(sdz) < .8) {
          U(b, Math.max(sd.box(x, y - .06 - .06 * Math.cos(sdz * 1.9), z - STREAM(0), .32, .03, .7), 0), "plank", h);
          for (const sx of [-.32, .32]) { U(b, sd.capsule(x, y, z - STREAM(0), sx, .3, -.65, sx, .3, .65, .018), "plank", h); for (const pz of [-.6, 0, .6]) U(b, sd.cyl(x - sx, y, z - STREAM(0) - pz, .02, .3), "plank", h); }
        }
        // Lanterns along the paths; boulders by the tree line; the windmill.
        for (const [lx, lz] of LAMPS) if (Math.abs(x - lx) < .3 && Math.abs(z - lz) < .3) { U(b, sd.cyl(x - lx, y, z - lz, .02, .55), "post", h); U(b, sd.sphere(x - lx, y - .58, z - lz, .05), "lamp", h); }
        for (const [rx, rz, r] of ROCKS) if (Math.abs(x - rx) < r + .3 && Math.abs(z - rz) < r + .3) U(b, sd.sphere(x - rx, y + r * .3, z - rz, r) + .15 * r * noise2(x * 6 / r, z * 6 / r + y * 4), "boulder", h);
        { const mx = x - MILL[0], mz = z - MILL[1];
          if (Math.abs(mx) < 1 && Math.abs(mz) < 1 && y < 2.2) {
            U(b, sd.cone(mx, y, mz, .32, 1.4) , "millwall", h); U(b, sd.cone(mx, y - 1.1, mz, .2, .35), "roof", h);
            const a = t * .9, ly = y - 1.2, lz = mz - .26;
            for (let k = 0; k < 4; k++) { const q = a + k * Math.PI / 2, ex = Math.cos(q) * .7, ey = Math.sin(q) * .7; U(b, Math.max(sd.capsule(mx, ly, lz, 0, 0, 0, ex, ey, 0, .03), 0), "plank", h); U(b, sd.capsule(mx, ly, lz, ex * .35 + Math.sin(q) * .07, ey * .35 - Math.cos(q) * .07, 0, ex * .95 + Math.sin(q) * .07, ey * .95 - Math.cos(q) * .07, 0, .055), "sail", h); }
          } }
        // A ring of pines around the settlement.
        const rr = Math.hypot(x, z + 1.5);
        if (rr > 5.6 && rr < 11 && y < 2.6) {
          const sp = 1.15, gx = Math.floor(x / sp), gz = Math.floor(z / sp);
          for (let ox = 0; ox <= 1; ox++) for (let oz = 0; oz <= 1; oz++) {
            const cx = gx + ox, cz = gz + oz, hr = hash2(cx * 1.7, cz * 3.1);
            if (hr < .35) continue;
            const tx = (cx + .5 * hash2(cx, cz + 4)) * sp, tz = (cz + .5 * hash2(cx + 2, cz)) * sp;
            if (Math.hypot(tx, tz + 1.5) < 5.9 || tz > 1.2) continue;   // keep the near side open
            pine(x - tx, y - H(tx, tz), z - tz, .7 + .5 * hr, b, h);
          }
        }
        // The hub: a dome with a mast.
        U(b, Math.max(sd.sphere(x, y, z + 1.4, .62), -y), "hub", h); U(b, sd.cyl(x, y - .6, z + 1.4, .025, .7), "mast", h); U(b, sd.sphere(x, y - 1.35, z + 1.4, .06), "beacon", h);
        for (const [id, [sx, sz]] of SITE_LIST) {
          const L = lv[id] || 0, bx = x - sx, bz = z - sz;
          if (Math.abs(bx) > 1.2 || Math.abs(bz) > 1.2) continue;
          if (!L) { U(b, Math.max(sd.box(bx, y, bz, .55, .03, .45), -sd.box(bx, y, bz, .48, .1, .38)), "outline", h); continue; }
          const g = .85 + L * .06;     // grows with level
          if (id === "garden") { const fx = Math.abs(bx) - .7 * g, fz = Math.abs(bz) - .55 * g; if (Math.abs(Math.max(fx, fz)) < .04 && y < .3) U(b, Math.max(Math.abs(Math.max(fx, fz)) - .015, y - .22 - .04 * (Math.abs(Math.sin((bx + bz) * 18)) > .6 ? 1 : 0)), "picket", h); for (let r = -2; r <= 2; r++) U(b, sd.box(bx, y - .05, bz - r * .18 * g, .55 * g, .05, .06), "bed", h); if (L >= 5) U(b, sd.roof(bx, y - .0, bz + .55 * g, .6 * g, .16, .55 * g), "glasshouse", h); }
          else if (id === "well") { U(b, Math.max(sd.cyl(bx, y, bz, .3 * g, .35), -sd.cyl(bx, y - .1, bz, .22 * g, .4)), "stone", h); U(b, sd.cyl(bx, y - .25, bz, .22 * g, .02), "wellwater", h); U(b, sd.roof(bx, y - .75, bz, .42 * g, .3 * g, .3), "roof", h); for (const px of [-.3, .3]) U(b, sd.cyl(bx - px * g, y, bz, .025, .78), "wood", h); }
          else if (id === "lumber") { for (let k = 0; k < 3; k++) U(b, sd.capsule(bx, y, bz, -.5 * g, .08 + k * .15, k * .07 - .1, .5 * g, .08 + k * .15, k * .07 - .1, .07), "log", h); U(b, sd.cyl(bx + .5 * g, y, bz - .5, .14, .22), "wood", h); }
          else if (id === "salvage") { U(b, sd.box(bx, y - .25 * g, bz, .55 * g, .25 * g, .35 * g), "shed", h); U(b, sd.roof(bx, y - .5 * g, bz, .65 * g, .42 * g, .25), "tin", h); for (let k = 0; k < 4; k++) U(b, sd.sphere(bx + .7 * g, y - .08, bz - .3 + k * .2, .1), "scrap", h); }
          else if (id === "solar") { const n = Math.min(4, 1 + Math.floor(L / 3)); for (let k = 0; k < n; k++) U(b, sd.box(bx, y - .25 - k * .0, bz + (k - (n - 1) / 2) * .32 + bx * .4, .45 * g, .02, .13), "panel", h); }
          else if (id === "clinic") { U(b, sd.box(bx, y - .3 * g, bz, .5 * g, .3 * g, .38 * g), "white", h); U(b, sd.roof(bx, y - .6 * g, bz, .58 * g, .44 * g, .25), "roof", h); U(b, sd.box(bx, y - .35 * g, bz - .39 * g, .08, .02, .01), "redcross", h); U(b, sd.box(bx, y - .35 * g, bz - .39 * g, .02, .08, .01), "redcross", h); }
          else if (id === "archive") { U(b, sd.box(bx, y - .35 * g, bz, .42 * g, .35 * g, .36 * g), "brick", h); U(b, sd.cyl(bx + .25, y - .7 * g, bz, .02, .5 + L * .06), "mast", h); U(b, sd.sphere(bx + .25, y - .72 * g - .5 - L * .06, bz, .05), "beacon", h); }
          else if (id === "hearth") { U(b, Math.max(sd.torus(bx, bz, y - .1, .35 * g, .1), -y), "stone", h); U(b, sd.cone(bx, y, bz, .26 * g, .35 + L * .05), "fire", h); }
        }
        return b[0];
      },
      materials: { ground: { color: hex("#4a6a46"), ramp: " .,:;'\"", shade(c) { c.color = mix(hex("#3a5a3c"), hex("#7a9a5a"), noise2(c.x * 1.3, c.z * 1.3)); c.alpha = .72;
          const f = hash2(Math.floor(c.x * 7), Math.floor(c.z * 7)); if (f > .988) { c.glyph = f > .995 ? "*" : ","; c.color = [[236, 196, 90], [226, 120, 140], [190, 170, 240], [240, 240, 236]][Math.floor(f * 997) % 4]; c.alpha = .75; } } },
        path: { color: hex("#8a7458"), ramp: " .,:", shade(c) { c.glyph = hash2(Math.floor(c.x * 14), Math.floor(c.z * 14)) > .8 ? ":" : "."; c.color = mix(hex("#7a6448"), hex("#a88e6a"), noise2(c.x * 3, c.z * 3)); c.alpha = .85; } },
        stream: { color: hex("#3e7690"), ramp: RAMP.water, shade(c, t) { const n = noise2(c.x * 1.4 - t * .35, c.z * 4) * .7 + .3 * noise2(c.x * 3 - t * .5, c.z * 7); c.glyph = n > .66 ? "≈" : n > .45 ? "~" : "-"; c.color = mix(hex("#2b5770"), hex("#9fd2e2"), n); } },
        plank: plain("#8a6a4a", RAMP.wood), post: plain("#5e4532", RAMP.wood), picket: plain("#d8ccb0", RAMP.wood), boulder: { color: hex("#8a8378"), ramp: RAMP.rock, shade(c) { c.color = mix(hex("#6a645c"), hex("#a49c90"), noise2(c.x * 3, c.y * 3 + c.z)); } },
        lamp: { color: [255, 200, 110], shade(c, t) { c.emit = .85 + .15 * Math.sin(t * 4 + c.x * 3); c.glyph = "@"; } },
        millwall: { color: hex("#d0c4a8"), ramp: RAMP.wall, shade(c) { if (Math.abs(c.y - .5) < .08 && c.z > MILL[1]) { c.glyph = "#"; c.color = hex("#5a3e2a"); } } }, sail: { color: hex("#e8e0cc"), ramp: " .:-=+", shade(c) { c.glyph = "="; } },
        pine: foliage("#3f7a52", "#2a5640", RAMP.pine), bark: plain("#6a5040", RAMP.wood),
        hub: { color: hex("#8fa0aa"), ramp: RAMP.metal, shade(c, t) { const p = Math.sin(Math.atan2(c.z + 1.4, c.x) * 8 + t * .4); if (p > .85) { c.color = [255, 196, 90]; c.emit = .8; } } },
        mast: plain("#c0c6cc", RAMP.metal), beacon: { color: [255, 80, 60], shade(c, t) { c.emit = Math.sin(t * 2.4) > 0 ? 1 : .35; c.glyph = "@"; } }, outline: { color: hex("#7a6f5a"), ramp: " .:", shade(c) { c.glyph = "·"; c.alpha = .55; } },
        bed: { color: hex("#6a4f36"), ramp: RAMP.grass, shade(c) { if (c.ny > .8) { c.glyph = hash2(Math.floor(c.x * 20), Math.floor(c.z * 20)) > .5 ? "✿" : "\""; c.color = hash2(Math.floor(c.x * 9), 3) > .5 ? hex("#9fc779") : hex("#7fb35a"); } } },
        glasshouse: { color: [190, 230, 220], ramp: " .:+", shade(c) { c.alpha = .7; } }, stone: plain("#8a8278", RAMP.rock), wellwater: water, roof: plain("#7a4a3a", RAMP.wall), wood: plain("#7a5a3e", RAMP.wood),
        log: plain("#9a7550", RAMP.wood), shed: plain("#7d7468", RAMP.wall), tin: plain("#9aa4ac", RAMP.metal), scrap: plain("#a8a49c", RAMP.metal),
        panel: { color: hex("#3c6a9a"), ramp: RAMP.metal, shade(c, t) { const s = Math.sin(c.x * 3 + t * .8); if (s > .9) { c.color = [230, 240, 255]; c.emit = .9; c.glyph = "✦"; } else c.glyph = "#"; } },
        white: plain("#dcd8cc", RAMP.wall), redcross: { color: [220, 60, 60], shade(c) { c.emit = .9; c.glyph = "+"; } }, brick: plain("#9a5a42", RAMP.wall), fire },
      particles(t, put) {
        if (lv.hearth) for (let i = 0; i < 10; i++) { const p = (t * .3 + i / 10) % 1; put(3.6 + Math.sin(i * 3 + t) * .15, .3 + p * 1.6, -3.4, p < .5 ? "*" : "·", mix([255, 220, 120], [220, 80, 40], p), .9 * (1 - p)); }
        if (lv.salvage) for (let i = 0; i < 6; i++) { const p = (t * .2 + i / 6) % 1; put(3.0 + p * .4, .9 + p * 1.2, -.6, "°", [200, 200, 206], .5 * (1 - p)); }
        if (lv.clinic) for (let i = 0; i < 5; i++) { const p = (t * .15 + i / 5) % 1; put(-1.0 + Math.sin(p * 5 + i) * .08 + p * .3, 1.0 + p * 1.1, -4.2, p < .4 ? "°" : "·", [210, 210, 214], .45 * (1 - p)); }
        for (let i = 0; i < 12; i++) { const a = t * (.3 + hash2(i, 1) * .3) + i * 2.1; put(Math.sin(a) * (2 + i * .35), .25 + .2 * Math.sin(a * 2.3 + i), STREAM(Math.sin(a) * 3) - .9 - (i % 4) * .6 + Math.cos(a * 1.3) * .3, "·", [220, 255, 140], .5 + .45 * Math.sin(t * 3 + i * 1.7)); }   // fireflies
        for (let i = 0; i < 4; i++) { const a = t * .18 + i * 1.6; put(Math.cos(a) * (3 + i), 3.2 + Math.sin(a * 2 + i) * .3, -4 + Math.sin(a) * 2, Math.sin(t * 7 + i) > 0 ? "v" : "^", [40, 40, 46], .8); }   // birds
      },
    };
    return scene;
  }

  // ------------------------------------------------------------ companions
  // Two frames each: a blink, a twitch or a wag.
  const PETS = {
    beaver: ["  _.--._  \n (o)  (o) \n  \\ ^^ /  \n  /|##|\\  \n (_|==|_) \n   ####   ", "  _.--._  \n (-)  (-) \n  \\ ^^ /  \n  /|##|\\  \n (_|==|_) \n  ####    "],
    magpie: ["    __    \n   (o >   \n  //\\_\\   \n  \\\\_/_)  \n   ||     \n   ^^  ✦  ", "    __    \n   (- >   \n  //\\_\\   \n  \\\\_/_)  \n   ||  ✦  \n   ^^     "],
    otter: ["  .--.    \n ( o o)   \n  ( ^ )~~ \n /|   |\\  \n(_|___|_) \n  ~~~~~~  ", "  .--.    \n ( - -)   \n  ( ^ )~  \n /|   |\\  \n(_|___|_) \n   ~~~~~~ "],
    fox: ["  /\\_/\\   \n ( o.o )  \n  > ^ <   \n /|   |\\~~\n(_|   |_) \n          ", "  /\\_/\\   \n ( -.- )  \n  > ^ <   \n /|   |\\ ~\n(_|   |_)~\n          "],
    ferret: ["   .--.   \n  (o  o)~~~\n   \\__/   \n  /    \\  \n ~~~~~~~  \n          ", "   .--.   \n  (-  -)~~\n   \\__/  ~\n  /    \\  \n ~~~~~~~  \n          "],
    mule: [" /\\   /\\  \n(  o o  ) \n |  ^  |  \n  \\ = /   \n  /| |\\   \n ^^ ^ ^^  ", " /\\   /\\  \n(  - -  ) \n |  ^  |  \n  \\ = /   \n  /| |\\   \n ^^ ^ ^^  "],
    cat: ["  /\\_/\\   \n ( o.o )  \n  > ^ <   \n (  _  )  \n  \"\" \"\"~  \n          ", "  /\\_/\\   \n ( -.- )  \n  > ^ <   \n (  _  )  \n  \"\" \"\" ~ \n          "],
    hedgehog: ["  ^^^^^^  \n ^^^^^^^o>\n ^^^^^^^  \n  \"  \"    \n          \n          ", "  ^^^^^^  \n ^^^^^^^->\n ^^^^^^^  \n  \"  \"    \n          \n          "],
    woodpecker: ["   _      \n  (o>     \n  ||\\  |  \n  ||/  |  \n  ^^   |  \n       |  ", "   _      \n   (o>    \n  ||\\ |   \n  ||/ |   \n  ^^  |   \n      |   "],
    moth: [" \\  /\\  / \n  \\(oo)/  \n  /(  )\\  \n /  \\/  \\ \n          \n          ", "  \\ /\\ /  \n   (oo)   \n   (  )   \n  / \\/ \\  \n          \n          "],
    tortoise: ["   ____   \n  /####\\_ \n |######(o)\n  \\_/\\_/  \n          \n          ", "   ____   \n  /####\\_ \n |######(-)\n  \\_/\\_/  \n          \n          "],
    crow: ["    __    \n   (o >   \n  /|##|   \n  \\|##|   \n   ^ ^ ϟ  \n          ", "    __    \n   (- >   \n  /|##|   \n  \\|##| ϟ \n   ^ ^    \n          "],
    salamander: ["  ~*~     \n (o o)~~~~\n  \\_/  ~~ \n  ^  ^    \n          \n          ", "  ~*~     \n (o o)~~~ \n  \\_/ ~~~ \n  ^  ^    \n          \n          "],
    owl: ["  ,___,   \n  (O,O)   \n  /)_)    \n   \"\"     \n          \n          ", "  ,___,   \n  (-,O)   \n  /)_)    \n   \"\"     \n          \n          "],
    goat: ["  \\\\  //  \n  (o  o)  \n   \\  /   \n   (__)~  \n   |  |   \n   ^  ^   ", "  \\\\  //  \n  (-  -)  \n   \\  /   \n   (__) ~ \n   |  |   \n   ^  ^   "],
    dog: ["  /^ ^\\   \n / 0 0 \\  \n V\\ Y /V  \n  / - \\   \n |    \\\\  \n ||  (__) ", "  /^ ^\\   \n / - - \\  \n V\\ Y /V  \n  / - \\ ~ \n |    \\\\  \n ||  (__) "],
    hawk: ["  __      \n ( o>     \n //\\\\\\    \n/// \\\\\\   \n   ^^     \n          ", "  __      \n ( o>     \n \\\\\\///   \n  \\\\//    \n   ^^     \n          "],
  };

  return {
    skill(canvas, id) { return SKILL[id] ? A.view(canvas, SKILL[id](), { cell: 7 }) : null; },
    skillScene: (id) => SKILL[id] && SKILL[id](),
    valley(canvas, getLevels) {
      const scene = valley(getLevels), view = A.view(canvas, scene, { cell: 9 });
      return { ...view, rebuild() { scene.refresh(); view.rebuild(); } };
    },
    site: (id) => SITES[id],
    pets: PETS,
  };
})();
