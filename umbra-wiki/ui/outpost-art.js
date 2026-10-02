// Umbra Outpost art: the valley, a 3D ASCII scene per skill, the duel and
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

  // Small helpers for skill scenes.
  function pine(x, y, z, s, best, h) {
    U(best, sd.cyl(x, y, z, .07 * s, .5 * s), "bark", h);
    U(best, Math.min(sd.cone(x, y - .35 * s, z, .5 * s, .95 * s), sd.cone(x, y - .8 * s, z, .38 * s, .8 * s), sd.cone(x, y - 1.2 * s, z, .25 * s, .6 * s)), "pine", h);
  }
  const SKILL = {};

  SKILL.forestry = () => ({ fps: 9, camera: orbit(4.6, 1.6, [0, 1, .8]), light: [-.4, .8, .4], ambient: .3,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "grass";
      pine(x + .9, y, z + 1.2, 1.15, b, h); pine(x - 1.5, y, z + 1.6, .9, b, h); pine(x - .1, y, z + 2.4, 1.3, b, h); pine(x + 2.2, y, z + .2, .8, b, h);
      U(b, sd.cyl(x - .9, y, z - .4, .26, .32), "stump", h);
      U(b, Math.min(sd.capsule(x, y, z, .4, .12, .7, 1.3, .12, .9, .12), sd.capsule(x, y, z, .45, .36, .8, 1.25, .36, .95, .12)), "bark", h);
      U(b, sd.capsule(x, y, z, -.9, .35, -.4, -.6, .75, -.25, .03), "handle", h); U(b, sd.box(x + .62, y - .78, z + .27, .1, .07, .02), "metal", h);
      return Math.min(b[0], y); },
    materials: { grass: ground("#4f7a46", "#79914f"), bark: plain("#7a5a3e", RAMP.wood), pine: foliage("#4a8a5a", "#2f5f44", RAMP.pine),
      stump: { color: hex("#b58e5e"), ramp: RAMP.wood, shade(c) { if (c.ny > .8) { const r = Math.hypot(c.x + .9, c.z + .4); c.glyph = Math.floor(r * 22) % 2 ? "o" : "·"; c.color = hex("#d8b27c"); } } },
      handle: plain("#8a6a4a", RAMP.wood), metal: plain("#c8ccd2", RAMP.metal) },
    particles: (t, put) => { for (let i = 0; i < 8; i++) { const p = (t * .4 + i / 8) % 1; put(-.9 + Math.cos(i * 2.3) * p * .6, .4 + Math.sin(p * 3) * .4, -.4 + Math.sin(i * 2.3) * p * .6, "'", [222, 190, 140], 1 - p); } },
  });
  SKILL.salvaging = () => ({ fps: 9, camera: orbit(3.6, 1.4, [0, .5, 0]), light: [.4, .8, .3], ambient: .28,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "dirt";
      U(b, sd.rbox(x, y - .35, z, 1.1, .25, .5, .08), "car", h); U(b, sd.rbox(x + .1, y - .7, z, .55, .2, .45, .08), "car", h);
      for (const [wx, wz] of [[-.7, .5], [.7, .5], [-.7, -.5], [.7, -.5]]) U(b, sd.torus(x - wx, z - wz, y - .2, .17, .08), "tyre", h);
      U(b, sd.box(x + .1, y - .72, z, .5, .14, .46), "glass", h);
      for (let i = 0; i < 6; i++) U(b, sd.sphere(x + 1.5 + Math.cos(i) * .3, y - .12, z - .8 + Math.sin(i * 1.7) * .3, .16 + .05 * (i % 3)) + .03 * noise2(x * 9, z * 9), "scrap", h);
      return b[0]; },
    materials: { dirt: ground("#6b5e4b", "#857660"), car: { color: hex("#9a5a42"), ramp: RAMP.metal, shade(c) { if (noise2(c.x * 4, c.y * 6) > .62) c.color = hex("#6b4a3a"); } },
      tyre: plain("#2e2c2a", RAMP.rock), glass: { color: hex("#9fd0d8"), ramp: " .:/+", shade(c) { c.glyph = noise2(c.x * 8, c.y * 8) > .6 ? "/" : ":"; } }, scrap: plain("#a8a49c", RAMP.metal) },
    particles: (t, put) => { const p = (t * .5) % 1; put(.1 + Math.cos(t) * .3, .95 + p * .2, .2, p < .5 ? "✦" : "+", [255, 240, 190], 1 - p); },
  });
  SKILL.fishing = () => ({ fps: 9, moving: [[-.7, 0, -.1, .16]], camera: orbit(3.2, 1.3, [0, .45, 0], .08), light: [-.3, .7, .5], ambient: .3,
    map(x, y, z, t, h) { const b = [y - .02 * Math.sin(x * 3 + t), ""]; h.m = "water";
      U(b, sd.box(x + 1.2, y - .3, z, .9, .05, .35), "plank", h);
      for (const px of [.4, 2]) for (const pz of [-.3, .3]) U(b, sd.cyl(x + px, y + .4, z - pz, .05, .75), "plank", h);
      U(b, sd.capsule(x, y, z, -.5, .45, 0, .6, 1.25, 0, .022), "rod", h);
      U(b, sd.sphere(x - .7, y - .03 - .04 * Math.sin(t * 2.5), z - .1, .07), "float", h);
      U(b, sd.sphere(x + .7, y - .55, z, .12), "jacket", h); U(b, sd.capsule(x, y, z, .7, .33, 0, .7, .5, 0, .13), "jacket", h);
      return b[0]; },
    materials: { water, plank: plain("#8a6a4a", RAMP.wood), rod: plain("#c8a46e", RAMP.wood), float: { color: [230, 70, 60], shade(c) { c.emit = .9; c.glyph = "o"; } }, jacket: plain("#d9a23c") },
    particles: (t, put) => { const p = (t * .35) % 1; for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; put(-.7 + Math.cos(a) * p * .6, .02, -.1 + Math.sin(a) * p * .35, "·", [210, 236, 246], .6 * (1 - p)); } },
  });
  SKILL.foraging = () => ({ fps: 9, camera: orbit(2.8, 1.2, [0, .35, 0]), light: [-.4, .8, .3], ambient: .3,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "moss";
      for (const [mx, mz, s] of [[0, 0, 1], [.35, .25, .7], [-.3, .3, .6], [.15, -.4, .8]]) { U(b, sd.cyl(x - mx, y, z - mz, .06 * s, .35 * s), "stem", h); U(b, Math.max(sd.sphere(x - mx, y - .35 * s, z - mz, .24 * s), .35 * s - y + .01), "cap", h); }
      for (const [bx, bz] of [[-1, -.6], [1.1, -.5], [.9, .8]]) U(b, sd.sphere(x - bx, y - .3, z - bz, .42) + .06 * noise2(x * 6, z * 6), "bush", h);
      return b[0]; },
    materials: { moss: ground("#4c7340", "#6f8c4a"), stem: plain("#efe2c8"), cap: { color: hex("#e2973c"), ramp: RAMP.wall, shade(c) { if (hash2(Math.floor(c.x * 30), Math.floor(c.z * 30)) > .85) { c.glyph = "o"; c.color = [250, 240, 220]; } } },
      bush: { color: hex("#4f8a4a"), ramp: RAMP.leaf, shade(c) { if (hash2(Math.floor(c.x * 14), Math.floor(c.y * 14 + c.z * 9)) > .88) { c.glyph = "•"; c.color = [120, 70, 160]; } } } },
    particles: (t, put) => { for (let i = 0; i < 4; i++) { const a = t * 1.2 + i * 1.6; put(Math.cos(a) * .9, .7 + Math.sin(a * 2) * .2, Math.sin(a) * .7, Math.sin(t * 10 + i) > 0 ? "ʚ" : "ɞ", [255, 220, 120], .9); } },
  });
  SKILL.trapping = () => ({ fps: 9, moving: [[-.5, .3, 0, .5]], camera: orbit(3, 1.2, [0, .3, 0]), light: [-.4, .8, .3], ambient: .3,
    map(x, y, z, t, h) { const b = [y - .1 * Math.max(0, .6 - Math.hypot(x + .5, z)), ""]; h.m = "meadow";
      for (const [gx, gz] of [[-1.2, -.6], [1.3, .7], [-.9, 1.1], [1.6, -.9]]) U(b, sd.sphere(x - gx, y, z - gz, .3) + .05 * noise2(x * 8, z * 8), "tuft", h);
      U(b, Math.max(sd.sphere(x + .5, y + .15, z, .45), -y), "burrow", h);
      U(b, sd.cyl(x - .5, y, z - .2, .05, .7), "stake", h); U(b, sd.torus(x - .5, z - .55, y - .12, .22, .02), "wire", h);
      U(b, sd.capsule(x, y, z, .5, .6, -.2, .5, .12, -.55, .012), "wire", h);
      const pop = Math.max(0, Math.sin(t * .8)) * .25;
      U(b, sd.sphere(x + .5, y - .12 - pop, z, .16), "rabbit", h); U(b, sd.sphere(x + .5, y - .3 - pop, z + .08, .1), "rabbit", h);
      U(b, sd.capsule(x, y, z, -.45, .36 + pop, .1, -.48, .52 + pop, .08, .025), "rabbit", h); U(b, sd.capsule(x, y, z, -.55, .36 + pop, .1, -.58, .52 + pop, .08, .025), "rabbit", h);
      return b[0]; },
    materials: { meadow: ground("#6f9150", "#9cb562"), tuft: foliage("#6f9a4f", "#9ab760", " .,\"';%"), burrow: plain("#6b5a44", RAMP.rock), stake: plain("#8a6a4a", RAMP.wood), wire: plain("#c3a26e", RAMP.metal), rabbit: plain("#b59a7e") },
  });
  SKILL.quarrying = () => ({ fps: 9, camera: orbit(3.2, 1.3, [0, .6, -.4], .08), light: [.5, .7, .4], ambient: .28,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "gravel";
      U(b, (sd.sphere(x * .7, y - .2, z + 1, 1.2) + .18 * noise2(x * 3, y * 3 + z)), "rock", h);
      for (let i = 0; i < 5; i++) U(b, sd.sphere(x - .9 + i * .4, y - .1, z - .8 + Math.sin(i) * .3, .12), "rubble", h);
      U(b, sd.capsule(x, y, z, .8, .05, .4, 1.2, .5, .3, .03), "handle", h); U(b, sd.capsule(x, y, z, .95, .55, .3, 1.45, .45, .3, .035), "metal", h);
      return b[0]; },
    materials: { gravel: ground("#77706a", "#938b80"), rubble: plain("#8a8378", RAMP.rock), handle: plain("#8a6a4a", RAMP.wood), metal: plain("#c8ccd2", RAMP.metal),
      rock: { color: hex("#8a8378"), ramp: RAMP.rock, shade(c, t) { const v = noise2(c.x * 4 + 3, c.y * 4 + c.z * 2); if (v > .74) { c.color = [214, 140, 82]; c.glyph = "◆"; c.emit = .7 + .2 * Math.sin(t * 2 + c.x * 5); } else c.color = mix(hex("#7a736a"), hex("#a29a8e"), v); } } },
    particles: (t, put) => { const p = (t * .8) % 1; for (let k = 0; k < 5; k++) put(.6 + Math.cos(k * 1.3) * p * .4, .3 + p * .3, -.2 + Math.sin(k * 1.3) * p * .3, ".", [200, 190, 170], 1 - p); },
  });
  SKILL.cooking = () => ({ fps: 9, moving: [[0, .3, 0, .38]], camera: orbit(2.6, 1.1, [0, .35, 0]), light: [0, .6, .8], ambient: .2,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "earth";
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; U(b, sd.sphere(x - Math.cos(a) * .5, y - .05, z - Math.sin(a) * .5, .11), "stone", h); }
      U(b, sd.cone(x, y - .02, z, .3, .45 + .06 * Math.sin(t * 7)), "fire", h);
      U(b, Math.max(sd.cyl(x, y - .5, z, .32, .38), -sd.cyl(x, y - .55, z, .27, .4)), "pot", h);
      U(b, sd.cyl(x, y - .82, z, .27, .02), "stew", h);
      U(b, Math.min(sd.capsule(x, y, z, -.6, 0, 0, 0, 1.15, 0, .03), sd.capsule(x, y, z, .6, 0, 0, 0, 1.15, 0, .03)), "stick", h);
      return b[0]; },
    materials: { earth: { color: hex("#4a4034"), ramp: " .,:;'", shade(c) { c.alpha = .7; const r = Math.hypot(c.x, c.z); c.emit = clamp(.9 / (1 + r * r * 2) * .95 + .1); c.color = mix(hex("#4a4034"), hex("#e39a52"), clamp(1 / (1 + r * r * 2))); } },
      stone: plain("#8a8278", RAMP.rock), fire, pot: plain("#3d3d42", RAMP.metal), stick: plain("#7a5a3e", RAMP.wood), stew: { color: [200, 120, 60], shade(c, t) { c.emit = .6; c.glyph = noise2(c.x * 9 + t, c.z * 9) > .5 ? "o" : "~"; } } },
    particles: (t, put) => { for (let i = 0; i < 10; i++) { const p = (t * .3 + i / 10) % 1; put(Math.sin(i * 3 + t) * .12 * (1 + p), .9 + p * 1.2, Math.cos(i * 2) * .1, p < .4 ? "o" : "°", [220, 220, 226], .6 * (1 - p)); } },
  });
  SKILL.metalwork = () => ({ fps: 9, moving: [[.05, .95, .05, .32]], camera: orbit(2.8, 1.3, [0, .55, 0]), light: [.2, .6, .7], ambient: .2,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "floor";
      U(b, Math.min(sd.box(x, y - .3, z, .18, .3, .16), sd.box(x, y - .66, z, .5, .08, .2), sd.box(x - .55, y - .68, z, .12, .05, .12)), "anvil", h);
      U(b, sd.box(x, y - .76, z, .26, .02, .08), "hotbar", h);
      const lift = Math.max(0, Math.sin(t * 4)) * .35;
      U(b, sd.capsule(x, y, z, .55, .82 + lift, .3, .2, .9 + lift * .6, .1, .03), "handle", h); U(b, sd.box(x - .15, y - .9 - lift * .6, z - .05, .08, .06, .06), "metal", h);
      U(b, Math.max(sd.box(x + 1.3, y - .5, z + .6, .5, .5, .4), -sd.box(x + 1.3, y - .45, z + .25, .3, .25, .2)), "brick", h);
      U(b, sd.box(x + 1.3, y - .4, z + .5, .26, .18, .1), "forgefire", h);
      return b[0]; },
    materials: { floor: floor("#3d3833"), anvil: plain("#5d6168", RAMP.metal), handle: plain("#7a5a3e", RAMP.wood), metal: plain("#9aa0a8", RAMP.metal),
      hotbar: { color: [255, 150, 60], shade(c, t) { c.emit = .75 + .2 * Math.sin(t * 3); c.glyph = "="; } }, brick: { color: hex("#9a4f3a"), ramp: RAMP.wall, shade(c) { if (Math.abs((c.y * 6) % 1) < .15) c.color = hex("#5a3a2e"); } }, forgefire: fire },
    particles: (t, put) => { const hit = (t * 4 / (Math.PI * 2)) % 1; if (hit > .7) for (let i = 0; i < 10; i++) { const p = (hit - .7) / .3, a = i * .63; put(Math.cos(a) * p * .6, .8 + Math.sin(p * 3) * .3, Math.sin(a) * p * .4, "*", [255, 200, 90], 1 - p); } },
  });
  SKILL.carpentry = () => ({ fps: 9, moving: [[.25, .78, 0, .42]], camera: orbit(3, 1.3, [0, .5, 0]), light: [-.4, .8, .4], ambient: .3,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "shavings";
      for (const sx of [-.7, .7]) { U(b, sd.capsule(x, y, z, sx - .2, 0, -.2, sx, .55, 0, .03), "wood", h); U(b, sd.capsule(x, y, z, sx + .2, 0, .2, sx, .55, 0, .03), "wood", h); }
      U(b, sd.box(x, y - .6, z, 1.1, .04, .18), "plank", h);
      U(b, sd.box(x - .2 - .15 * Math.sin(t * 3), y - .78, z, .3, .12, .015), "saw", h);
      U(b, sd.torus(x - 1.6, y - .8, z, .5, .03), "bow", h);
      return b[0]; },
    materials: { shavings: { color: hex("#8a7050"), ramp: " .,'`~", shade(c) { c.alpha = .5; c.color = mix(hex("#7a6040"), hex("#d8b27c"), noise2(c.x * 6, c.z * 6)); } }, wood: plain("#7a5a3e", RAMP.wood),
      plank: { color: hex("#d8b27c"), ramp: RAMP.wood, shade(c) { c.glyph = Math.abs(Math.sin(c.x * 20 + noise2(c.x * 3, c.z * 3) * 4)) > .8 ? "=" : "-"; } }, saw: plain("#c8ccd2", RAMP.metal), bow: plain("#c8a46e", RAMP.wood) },
    particles: (t, put) => { for (let i = 0; i < 6; i++) { const p = (t * .9 + i / 6) % 1; put(-.2 + i * .05, .6 - p * .6, .15 + p * .2, "'", [230, 200, 150], 1 - p); } },
  });
  SKILL.tailoring = () => ({ fps: 9, moving: [[.32, .95, .07, .22]], camera: orbit(3, 1.2, [0, .7, 0], .1), light: [-.3, .7, .6], ambient: .3,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "floor";
      U(b, Math.min(sd.capsule(x, y, z, -.8, 0, 0, -.8, 1.4, 0, .04), sd.capsule(x, y, z, .8, 0, 0, .8, 1.4, 0, .04), sd.capsule(x, y, z, -.8, 1.35, 0, .8, 1.35, 0, .04), sd.capsule(x, y, z, -.8, .25, 0, .8, .25, 0, .04)), "frame", h);
      U(b, sd.box(x, y - .8, z - .02 * Math.sin(x * 4), .66, .48, .01), "hide", h);
      U(b, sd.capsule(x, y, z, .2 + .1 * Math.sin(t * 3), .9, .05, .35 + .1 * Math.sin(t * 3), 1, .1, .008), "needle", h);
      return b[0]; },
    materials: { floor: floor("#4a4036"), frame: plain("#7a5a3e", RAMP.wood), needle: plain("#e8eef2", RAMP.metal),
      hide: { color: hex("#c49a6c"), ramp: RAMP.wall, shade(c) { if (Math.abs(Math.abs(c.x) - .6) < .03 || Math.abs(Math.abs(c.y - .8) - .44) < .03) { c.glyph = "+"; c.color = hex("#e8d8b8"); } } } },
  });
  SKILL.remedies = () => ({ fps: 9, camera: orbit(2.4, 1.3, [0, .55, 0], .1), light: [-.3, .8, .5], ambient: .3,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "floor";
      U(b, sd.box(x, y - .38, z, .9, .04, .45), "table", h);
      for (const [vx, vz, c] of [[-.5, 0, "redliquid"], [-.2, .15, "greenliquid"], [.15, -.05, "blueliquid"]]) {
        U(b, Math.max(sd.cyl(x - vx, y - .42, z - vz, .09, .3), -sd.cyl(x - vx, y - .45, z - vz, .07, .3)), "glass", h);
        U(b, sd.cyl(x - vx, y - .42, z - vz, .072, .17), c, h); }
      U(b, Math.max(sd.sphere(x - .55, y - .55, z + .1, .17), -sd.sphere(x - .55, y - .62, z + .1, .14), .55 - y), "mortar", h);
      return b[0]; },
    materials: { floor: floor("#3f3832"), table: plain("#8a6a4a", RAMP.wood), glass: { color: [200, 230, 236], ramp: " .:+", shade(c) { c.alpha = .7; } }, mortar: plain("#c9c4b8", RAMP.rock),
      redliquid: { color: [220, 90, 100], shade(c, t) { c.emit = .75; c.glyph = "~"; } }, greenliquid: { color: [110, 210, 120], shade(c) { c.emit = .75; c.glyph = "~"; } }, blueliquid: { color: [110, 170, 230], shade(c) { c.emit = .75; c.glyph = "~"; } } },
    particles: (t, put) => { for (let i = 0; i < 6; i++) { const p = (t * .4 + i / 6) % 1; put(-.2 + Math.sin(i) * .03, .62 + p * .5, .15, "°", [150, 230, 160], .8 * (1 - p)); } },
  });
  SKILL.tinkering = () => ({ fps: 9, camera: orbit(2.6, 1.3, [0, .55, 0], .1), light: [-.3, .8, .5], ambient: .26,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "floor";
      U(b, sd.box(x, y - .38, z, .95, .04, .45), "bench", h);
      U(b, sd.rbox(x + .3, y - .58, z, .32, .18, .16, .04), "radio", h); U(b, sd.cyl(x + .1, y - .6, z - .17, .07, .02), "dial", h);
      U(b, sd.capsule(x, y, z, .5, .76, 0, .55, 1.15, 0, .012), "metal", h);
      for (let k = 0; k < 4; k++) U(b, sd.torus(x + .45, z - .05, y - .5 - k * .06, .12, .018), "coil", h);
      return b[0]; },
    materials: { floor: floor("#3a3530"), bench: plain("#6e5a44", RAMP.wood), radio: plain("#5a6b5e", RAMP.metal), metal: plain("#c8ccd2", RAMP.metal),
      dial: { color: [255, 200, 110], shade(c, t) { c.emit = .7 + .3 * Math.sin(t * 2); c.glyph = "o"; } }, coil: { color: hex("#d98b52"), ramp: RAMP.metal } },
    particles: (t, put) => { if (Math.sin(t * 5) > .3) for (let i = 0; i < 5; i++) put(-.45 + (hash2(i, Math.floor(t * 5)) - .5) * .3, .75 + hash2(i + 9, Math.floor(t * 5)) * .25, .05, "ϟ", [170, 220, 255], .9); },
  });
  SKILL.hearth = () => ({ fps: 9, moving: [[0, .55, 0, .6]], camera: orbit(3, 1.2, [0, .55, 0], .07), light: [0, .5, .8], ambient: .14,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "earth";
      U(b, Math.max(sd.torus(x, z, y - .2, .6, .2), -y), "stone", h);
      U(b, sd.cone(x, y, z, .45, .9 + .12 * Math.sin(t * 6) + .08 * Math.sin(t * 9.3)), "fire", h);
      for (const a of [0, 2.1, 4.2]) U(b, sd.capsule(x, y, z, Math.cos(a) * .4, .08, Math.sin(a) * .4, -Math.cos(a) * .1, .3, -Math.sin(a) * .1, .07), "log", h);
      return b[0]; },
    materials: { earth: { color: hex("#3a3028"), ramp: " .,:;'", shade(c) { c.alpha = .7; const r = Math.hypot(c.x, c.z); c.emit = clamp(1.2 / (1 + r * r * 1.2) * .94); c.color = mix(hex("#3a3028"), hex("#ef9a52"), clamp(1.2 / (1 + r * r))); } },
      stone: { color: hex("#8a8278"), ramp: RAMP.rock, shade(c) { c.emit = .55; } }, fire, log: plain("#5e4532", RAMP.wood) },
    particles: (t, put) => { for (let i = 0; i < 16; i++) { const p = (t * .35 + i / 16) % 1; put(Math.sin(i * 3 + t) * .25 * (1 + p), .6 + p * 1.6, Math.cos(i * 5) * .2, p < .5 ? "*" : "·", mix([255, 220, 120], [220, 80, 40], p), .9 * (1 - p)); } },
  });
  SKILL.signals = () => ({ fps: 9, camera: orbit(4, 1.6, [0, 1.4, 0], .07), light: [-.4, .7, .5], ambient: .3,
    sky: (u, v, t, col, row) => hash2(col, row) > .985 ? ["·", [220, 226, 246], .5 + .4 * Math.sin(t + col)] : null,
    map(x, y, z, t, h) { const b = [y, ""]; h.m = "hill";
      const w = Math.max(.05, .45 - y * .14);
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) U(b, sd.capsule(x, y, z, sx * .45, 0, sz * .45, sx * .06, 3, sz * .06, .025), "mast", h);
      for (let k = 1; k < 6; k++) { const yy = k * .5, ww = Math.max(.07, .45 - yy * .13); U(b, Math.max(sd.box(x, y - yy, z, ww, .015, ww), -sd.box(x, y - yy, z, ww - .04, .1, ww - .04)), "mast", h); }
      U(b, sd.sphere(x, y - 3.05, z, .08), "beacon", h);
      U(b, sd.box(x + 1, y - .3, z + .6, .35, .3, .28), "hut", h);
      return b[0]; },
    materials: { hill: ground("#3f5a45", "#5c7652"), mast: plain("#c0c6cc", RAMP.metal), hut: plain("#7a6a5a", RAMP.wall), beacon: { color: [255, 70, 60], shade(c, t) { c.emit = Math.sin(t * 3) > 0 ? 1 : .3; c.glyph = "@"; } } },
    particles: (t, put) => { for (let k = 0; k < 3; k++) { const p = (t * .4 + k / 3) % 1; for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; put(Math.cos(a) * p * 2.4, 3.05, Math.sin(a) * p * 2.4, "·", [170, 160, 236], .7 * (1 - p)); } } },
  });
  SKILL.scouting = () => ({ fps: 9, camera: orbit(3.8, 1.7, [0, .5, 0], .07), light: [-.4, .8, .3], ambient: .3,
    map(x, y, z, t, h) { const b = [y - .2 * noise2(x * .7, z * .7), ""]; h.m = "trail";
      U(b, sd.capsule(x, y, z, -1.6, .55, -.2, 1.6, .55, -.2, .03), "rope", h);
      for (let k = -6; k <= 6; k++) U(b, sd.box(x - k * .25, y - .52, z + .2, .1, .02, .22), "plank", h);
      for (const px of [-1.6, 1.6]) U(b, sd.cyl(x - px, y, z + .2, .05, .8), "post", h);
      U(b, sd.cyl(x - 1.1, y, z - .9, .03, .9), "post", h); U(b, sd.box(x - .95, y - .78, z - .9, .15, .09, .01), "flag", h);
      return b[0]; },
    materials: { trail: ground("#6f8a52", "#9a8a62"), rope: plain("#c8a46e", RAMP.wood), plank: plain("#8a6a4a", RAMP.wood), post: plain("#6e5440", RAMP.wood),
      flag: { color: hex("#e0705a"), shade(c, t) { c.emit = .8; c.glyph = Math.sin(t * 6 + c.x * 20) > 0 ? "~" : "="; } } },
  });

  // ------------------------------------------------------------ the duel
  // Enemy figures by kind, standing at x = +0.9 and facing the player.
  function beast(kind, x, y, z, t, b, h) {
    const bob = .03 * Math.sin(t * 4);
    const legs = (ox, len, r = .04) => { for (const [lx, lz] of [[-.25, .1], [.25, .1], [-.25, -.1], [.25, -.1]]) U(b, sd.capsule(x, y, z, ox + lx, 0, lz, ox + lx, len, lz, r), "enemy", h); };
    if (kind === "rat") { U(b, sd.capsule(x, y, z, -.2, .14, 0, .2, .14, 0, .1), "enemy", h); U(b, sd.sphere(x + .28, y - .16, z, .08), "enemy", h); U(b, sd.capsule(x, y, z, -.25, .12, 0, -.6, .05, 0, .015), "enemy", h); return; }
    if (kind === "fish") { U(b, sd.capsule(x, y, z, -.4, .3 + bob, 0, .4, .3 + bob, 0, .17), "enemy", h); U(b, sd.cone(x + .55, y - .3 - bob, z, .18, .25), "enemy", h); return; }
    if (["dog", "wolf", "cat", "boar", "bear"].includes(kind)) {
      // Local x points at the player: head in front, tail behind.
      const s = kind === "bear" ? 1.4 : kind === "boar" ? 1.05 : kind === "cat" ? .85 : 1;
      const X = x / s, Y = (y - bob) / s, Z = z / s;
      U(b, sd.capsule(X, Y, Z, -.3, .5, 0, .3, .52, 0, .16) * s, "enemy", h);
      U(b, sd.sphere(X - .45, Y - .62, Z, .13) * s, "enemy", h);
      if (kind !== "bear" && kind !== "boar") U(b, Math.min(sd.cone(X - .43, Y - .7, Z - .06, .04, .12), sd.cone(X - .43, Y - .7, Z + .06, .04, .12)) * s, "enemy", h);
      if (kind === "boar") U(b, sd.capsule(X, Y, Z, .5, .55, .06, .62, .65, .06, .02) * s, "tusk", h);
      for (const [lx, lz] of [[-.22, .08], [.22, .08], [-.22, -.08], [.22, -.08]]) U(b, sd.capsule(X, y / s, Z, lx, 0, lz, lx, .45, lz, .045) * s, "enemy", h);
      if (kind !== "bear") U(b, sd.capsule(X, Y, Z, -.3, .55, 0, -.5, .7, 0, .03) * s, "enemy", h);
      return;
    }
    if (kind === "drone") { const hy = 1 + .1 * Math.sin(t * 3); U(b, sd.sphere(x, y - hy, z, .25), "enemy", h); U(b, sd.sphere(x + .2, y - hy, z, .08), "eye", h); for (const a of [0, 1.57, 3.14, 4.71]) U(b, sd.torus(x - Math.cos(a) * .35, z - Math.sin(a) * .35, y - hy - .1, .12, .015), "metal", h); return; }
    if (kind === "mech" || kind === "keeper") {
      U(b, sd.rbox(x, y - .95, z, .28, .3, .2, .05), "enemy", h); U(b, sd.rbox(x, y - 1.42, z, .16, .14, .14, .04), "enemy", h); U(b, sd.sphere(x + .14, y - 1.44, z, .05), "eye", h);
      for (const lz of [-.13, .13]) { U(b, sd.capsule(x, y, z, 0, 0, lz, 0, .65, lz, .07), "metal", h); U(b, sd.capsule(x, y, z, -.05, 1.1, lz * 2.6, -.25 + .1 * Math.sin(t * 2), .6, lz * 3, .06), "metal", h); }
      if (kind === "keeper") U(b, sd.sphere(x, y - 1.2, z, .32) + .08 * noise2(x * 9, y * 9), "vine", h);
      return;
    }
    // A raider (or the default humanoid).
    U(b, sd.capsule(x, y, z, 0, .55, 0, 0, 1.05, 0, .16), "enemy", h); U(b, sd.sphere(x, y - 1.28 - bob, z, .13), "skin", h);
    for (const lz of [-.09, .09]) U(b, sd.capsule(x, y, z, 0, 0, lz, 0, .55, lz, .06), "enemy", h);
    U(b, sd.capsule(x, y, z, 0, 1, .15, .35 + .1 * Math.sin(t * 3), .85, .2, .05), "enemy", h);
  }
  function duel(kind) {
    return { fps: 9, camera: () => ({ pos: [0, 1.1, 4.6], at: [0, .7, 0], fovV: 23 }), light: [-.3, .8, .6], ambient: .3,
      // Strikes: arcs of sparks between the two, alternating sides.
      particles(t, put) {
        const k = (t * .8) % 2, mine = k < 1, p = k % 1;
        if (p > .45) return;
        for (let i = 0; i < 9; i++) {
          const a = -1.1 + i * .27 + p * 2;
          put((mine ? .15 : -.15) + Math.cos(a) * .32 * (mine ? 1 : -1), .95 + Math.sin(a) * .3, .2, i % 3 ? "·" : "*", mine ? [255, 230, 160] : [255, 120, 90], 1 - p / .45);
        }
      },
      map(x, y, z, t, h) {
        const b = [y, ""]; h.m = "arena";
        // The player: a cloaked figure facing right.
        const px = x + .95, lunge = .06 * Math.max(0, Math.sin(t * 2.6));
        U(b, sd.capsule(px - lunge, y, z, 0, .55, 0, 0, 1.05, 0, .16), "player", h); U(b, sd.sphere(px - lunge, y - 1.28, z, .13), "skin", h);
        U(b, sd.cone(px - lunge, y - .35, z, .26, .75), "cloak", h);
        for (const lz of [-.09, .09]) U(b, sd.capsule(px, y, z, 0, 0, lz, 0, .55, lz, .06), "player", h);
        U(b, sd.capsule(px - lunge, y, z, 0, 1, .15, .4, .9, .25, .05), "player", h); U(b, sd.capsule(px - lunge, y, z, .4, .9, .25, .75, 1.15, .25, .025), "metal", h);
        beast(kind, -(x - .95), y, z, t, b, h);
        return b[0];
      },
      materials: { arena: ground("#4a4a3c", "#6a6450"), player: plain("#5f7f9a"), cloak: plain("#3f5a6e"), skin: plain("#e0b493"), metal: plain("#c8ccd2", RAMP.metal),
        enemy: plain(kind === "drone" || kind === "mech" ? "#8a9098" : kind === "raider" ? "#9a6a5a" : "#8a6a52"), eye: { color: [255, 70, 60], shade(c) { c.emit = 1; c.glyph = "@"; } },
        tusk: plain("#f2ecd8"), vine: foliage("#5d8a4a", "#3e6b3c") } };
  }

  // ------------------------------------------------------------ the valley
  // Eight buildings around the hub; each grows with its level (0-10).
  const SITES = { garden: [-3.2, -.6], well: [-1.6, 1.4], lumber: [1.6, 1.4], salvage: [3.2, -.6], solar: [-3.6, -3.4], clinic: [-1.2, -4.2], archive: [1.2, -4.2], hearth: [3.6, -3.4] };
  const SITE_LIST = Object.entries(SITES);
  function valley(getLevels) {
    // Levels are read once per build (the view rebuilds when they change).
    let lv = getLevels();
    const H = (x, z) => { const k = clamp((Math.hypot(x, z + 1.5) - 5.5) / 3); return k ? .6 * noise2(x * .22 + 4, z * .22) * k * (1 + Math.max(0, -z - 6) * .25) : 0; };
    const scene = { camera: () => ({ pos: [0, 3.0, 7.4], at: [0, .55, -1.4], fovV: 31 }), light: [-.5, .8, .45], ambient: .28, stillTime: 2,
      fog: { color: hex("#0f1418"), density: .04, start: 9, fade: .5 },
      sky: (u, v, t, col, row) => hash2(col, row) > .975 ? [hash2(col + 1, row) > .8 ? "*" : "·", [226, 230, 246], .3 + .5 * (.5 + .5 * Math.sin(t * (1 + hash2(col, row)) + col))] : null,
      refresh() { lv = getLevels(); },
      map(x, y, z, t, h) {
        const b = [y - H(x, z), ""]; h.m = "ground";
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
          if (id === "garden") { for (let r = -2; r <= 2; r++) U(b, sd.box(bx, y - .05, bz - r * .18 * g, .55 * g, .05, .06), "bed", h); if (L >= 5) U(b, sd.roof(bx, y - .0, bz + .55 * g, .6 * g, .16, .55 * g), "glasshouse", h); }
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
      materials: { ground: { color: hex("#4a6a46"), ramp: " .,:;'\"", shade(c) { c.color = mix(hex("#3a5a3c"), hex("#7a9a5a"), noise2(c.x * 1.3, c.z * 1.3)); c.alpha = .72; } },
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
    duel(canvas, kind) { return A.view(canvas, duel(kind || "raider"), { cell: 8 }); },
    valley(canvas, getLevels) {
      const scene = valley(getLevels), view = A.view(canvas, scene, { cell: 9 });
      return { ...view, rebuild() { scene.refresh(); view.rebuild(); } };
    },
    site: (id) => SITES[id],
    pets: PETS,
  };
})();
