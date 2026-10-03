// Umbra Outpost models: a small 3D ASCII sculpture for every item and every
// recipe, in families that share a shape and differ in colour and detail
// (a steel machete's blade is steel, its grip stays leather). Rendered once
// to cached images for icons and recipe cards; the hover box spins one live.
"use strict";
window.UmbraOutpostModels = (() => {
  const A = window.Ascii3D, { sd, noise2, hash2, hex, mix } = A;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const U = (b, d, m, h) => { if (d < b[0]) { b[0] = d; h.m = m; } };
  const RAMP = { solid: " .:-=+*#%@", metal: " .:=+#%@", wood: " .:|=#H", leaf: " .:*%#&@", cloth: " .:;=+#", glass: " .:+*", fur: " .,\";%#" };
  const M = {
    solid: (c, ramp) => ({ color: hex(c), ramp: ramp || RAMP.solid }),
    metal: (c) => ({ color: hex(c), ramp: RAMP.metal, spec: .55 }),
    glow: (c, k = .85) => ({ color: hex(c), shade(cell) { cell.emit = k; } }),
    glass: (c) => ({ color: hex(c), ramp: RAMP.glass, spec: .6, shade(cell) { cell.alpha = .75; } }),
    noisy: (a, b, ramp, f = 6) => ({ color: hex(a), ramp: ramp || RAMP.solid, shade(c) { c.color = mix(hex(a), hex(b), noise2(c.x * f + c.z * 3, c.y * f)); } }),
  };
  const DARK = "#3a2e26", WRAP = "#5a4232", STEEL = "#c3cad2";
  // A material's own colour, a shade darker, for gentle texture.
  const shade = (c, k = .25) => "#" + hex(c).map((v) => Math.round(v * (1 - k)).toString(16).padStart(2, "0")).join("");
  const LIFT = (c) => "#" + hex(c).map((v) => Math.round(Math.min(255, v * 1.25 + 30)).toString(16).padStart(2, "0")).join("");
  const METALS = { bronze: "#c98b4f", iron: "#9a9ea4", steel: "#c3cad2", alloy: "#9fc2b8", titanium: "#d6dee8", skyfall: "#b39cf0" };
  const WOODS = { birch: ["#e8e2d4", "#d8c39a"], pine: ["#9a5a3a", "#e0b880"], oak: ["#6e5038", "#c9a06a"], maple: ["#8a7a6a", "#e2c08a"], cedar: ["#a0522d", "#d98b5a"],
    yew: ["#7a3a3a", "#c9806a"], ironwood: ["#5a6470", "#9aa6b4"], ghostwood: ["#d8e4ec", "#f2f6fa"] };
  const LEATHERS = { rabbit: "#d8c4a8", deer: "#c49a6c", boar: "#8f6a4a", elk: "#b08a64", muskox: "#7a6452" };

  // Models are built at the origin, inside a unit-ish sphere, and seen in
  // three-quarter view. spin turns them for the hover box.
  // The camera frames each model by its measured size, so every object
  // fills its box the same way, centred.
  function fit(map, ground) {
    // A point counts when the surface is within half a grid step, so thin
    // shapes (blades, strings, keys) are found too.
    const h = { m: "" }, N = 24, lo = [9, 9, 9], hi = [-9, -9, -9], near = 2.6 / (N - 1) * .6;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
      const x = -1.3 + 2.6 * i / (N - 1), y = -1.3 + 2.6 * j / (N - 1), z = -1.3 + 2.6 * k / (N - 1);
      if (map(x, y, z, 0, h) < near && !(ground && h.m === "ground")) { lo[0] = Math.min(lo[0], x); lo[1] = Math.min(lo[1], y); lo[2] = Math.min(lo[2], z); hi[0] = Math.max(hi[0], x); hi[1] = Math.max(hi[1], y); hi[2] = Math.max(hi[2], z); }
    }
    if (lo[0] > hi[0]) return { c: [0, 0, 0], r: 1 };
    const c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    return { c, r: Math.max(.25, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2 - near + .06) };
  }
  function model(parts, mats, o = {}) {
    const map = (x, y, z, t, h) => { const b = [99, ""]; parts(x, y, z, b, h, t); return b[0]; };
    let frame = null;
    return {
      camera() {
        frame = frame || fit(map, true);
        const dir = o.cam || [1.7, 1.35, 2.7], dl = Math.hypot(...dir), fov = o.fov || 34;
        const dist = frame.r / Math.sin(fov * Math.PI / 360) * (o.zoom || 1.12);
        return { pos: dir.map((v, i) => frame.c[i] + v / dl * dist), at: frame.c, fovV: fov };
      },
      light: o.light || [-.5, .85, .6], ambient: o.ambient ?? .48, shadows: o.shadows ?? true,
      map, materials: mats, particles: o.particles, fps: 9, far: 30,
      // Optionally, the sphere the whole model fits in (no ground plane), so
      // rays that miss it cost nothing.
      bound: o.bounded ? () => { frame = frame || fit(map, true); return { c: frame.c, r: frame.r + .15 }; } : undefined,
    };
  }
  // Turning on the spot: a bounded model stays within the sphere around the
  // turning axis that holds its own.
  const spin = (scene, speed = .7, fps = 8) => ({ ...scene, live: true, fps, map(x, y, z, t, h) { const [rx, rz] = A.rotY(x, z, t * speed); return scene.map(rx, y, rz, t, h); },
    bound: scene.bound ? () => { const b = scene.bound(); return { c: [0, b.c[1], 0], r: b.r + Math.hypot(b.c[0], b.c[2]) }; } : undefined,
    // How fast its surface can move (the rim of its sphere), for frame-to-frame reuse.
    motion: scene.bound ? Math.abs(speed) * (() => { const b = scene.bound(); return b.r + Math.hypot(b.c[0], b.c[2]); })() * 1.15 + .05 : undefined });

  // ------------------------------------------------------------ families
  const F = {};
  F.log = (sp) => {
    const [bark, ring] = WOODS[sp];
    return model((x, y, z, b, h) => U(b, sd.capsule(x, y, z, -.75, 0, 0, .75, 0, 0, .34) + .02 * noise2(x * 9, y * 9 + z * 5), "bark", h), {
      bark: { color: hex(bark), ramp: RAMP.wood, shade(c, ) {
        if (Math.abs(c.nx) > .75) { const r = Math.hypot(c.y, c.z); c.glyph = Math.floor(r * 26) % 2 ? "o" : "·"; c.color = hex(ring); return; }
        const n = noise2(c.x * 7, c.y * 9 + c.z * 9);
        if (sp === "birch") { c.color = n > .72 ? hex("#2e2a26") : hex(bark); c.glyph = n > .72 ? "=" : null; }
        else if (sp === "ghostwood") { c.color = mix(hex(bark), [255, 255, 255], n); c.emit = .55 + .3 * n; }
        else if (sp === "ironwood") { c.color = mix(hex(bark), hex("#c8d4e0"), n); }
        else c.color = mix(hex(bark), hex(DARK), n * .6);
      } } });
  };
  F.plank = (sp) => {
    const [, grain] = WOODS[sp];
    return model((x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .35); U(b, sd.box(rx, y, rz, .85, .1, .3), "board", h); U(b, sd.box(rx, y - .22, rz - .05, .85, .1, .3), "board", h); }, {
      board: { color: hex(grain), ramp: RAMP.wood, shade(c) { c.glyph = Math.abs(Math.sin(c.x * 26 + noise2(c.x * 3, c.z * 4) * 5)) > .82 ? "=" : null; c.color = mix(hex(grain), hex(WOODS[sp][0]), noise2(c.x * 4, c.z * 9) * .5); } } });
  };
  F.ore = (color, kind) => model((x, y, z, b, h) => {
    if (kind === "crystal") { for (const [cx, cz, ht] of [[0, 0, .95], [.3, .1, .65], [-.26, .16, .6], [.06, -.3, .5]]) U(b, Math.max(sd.cyl(x - cx, y + .5, z - cz, .14, ht), (y + .5 - ht) + Math.hypot(x - cx, z - cz) * 1.6) * .5, "crystal", h); return; }
    U(b, sd.sphere(x, y, z, .62) + .16 * noise2(x * 3.2 + 7, y * 3.2 + z * 2.1), kind === "clay" ? "clay" : "rock", h);
  }, { rock: { color: hex("#7d766c"), ramp: RAMP.solid, shade(c) { const v = noise2(c.x * 9 + 3, c.y * 9 + c.z * 5);
      if (v > (kind === "coal" ? 0 : .68)) { c.color = hex(color); c.glyph = kind === "coal" ? null : "◆"; if (kind === "glow") c.emit = .85; } else c.color = mix(hex("#6a645c"), hex("#9a9286"), v); } },
    clay: { color: hex(color), ramp: RAMP.solid, spec: .2 }, crystal: { color: hex(color), ramp: " .:+*#", spec: .7, shade(c) { c.emit = .55 + .4 * Math.abs(c.nx); } } });
  F.bar = (color) => model((x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .3);
    U(b, Math.max(sd.box(rx, y, rz, .72, .2, .3), (Math.abs(rx) - .72) * .9 + (y - .2) * .5, (Math.abs(rz) - .3) * .9 + (y - .2) * .6) - .02, "bar", h); }, { bar: M.metal(color) });
  // Fish: length, depth, colours and markings per species.
  const FISH = { perch: ["#7a9a4a", "#e8d070", "stripes", .8, .3], trout: ["#7a8a6a", "#e8c8b8", "spots", .9, .26], carp: ["#c8a040", "#f0d890", "scales", .8, .36],
    pike: ["#4f7a4a", "#d8e0a0", "spots", 1.1, .2], salmon: ["#8a9ab0", "#f0a090", "plain", 1, .28], catfish: ["#4a4a42", "#a8a088", "whiskers", .95, .26],
    sturgeon: ["#6a7078", "#c8ccd0", "ridges", 1.1, .22], silver_eel: ["#a8b8c8", "#e8f0f6", "eel", 1.1, .12] };
  F.fish = (sp, cooked) => {
    const [top, belly, pat, len, dep] = FISH[sp];
    return model((x, y, z, b, h) => {
      if (cooked) U(b, sd.cyl(x, y + .32, z, .8, .04), "plate", h);
      const by = cooked ? -.12 : 0;
      if (pat === "eel") { const zz = z - .18 * Math.sin(x * 4); U(b, sd.capsule(x, y - by, zz, -len, 0, 0, len, 0, 0, dep), "fish", h); U(b, sd.sphere(x - len + .02, y - by - .03, zz - .08, .03), "eye", h); return; }
      U(b, sd.sphere(x / len, (y - by) / dep, z / (dep * .55), 1) * Math.min(len, dep * .55), "fish", h);
      U(b, Math.max(sd.box(x + len + .14, y - by, z, .16, dep * .9, .02), Math.abs(y - by) - (x + len + .3) * 1.4), "fin", h);
      U(b, Math.max(sd.box(x + .05, y - by - dep * .95, z, len * .4, dep * .3, .015), -(y - by - dep * .8)), "fin", h);
      U(b, sd.sphere(x - len * .72, y - by - dep * .25, z - dep * .42, .045), "eye", h);
      if (pat === "whiskers") for (const s of [-1, 1]) U(b, sd.capsule(x, y - by, z, -len * .95, -.05, s * .05, -len * 1.25, -.12, s * .14, .012), "fin", h);
    }, {
      fish: { color: hex(top), ramp: RAMP.solid, spec: .5, shade(c) {
        const k = clamp((c.y - (cooked ? -.12 : 0)) / dep * .5 + .5); c.color = cooked ? mix(hex("#9a5a2a"), hex("#e0a060"), k) : mix(hex(belly), hex(top), k);
        if (cooked) { if (noise2(c.x * 12, c.z * 12) > .7) c.glyph = "#"; return; }
        if (pat === "stripes" && Math.sin(c.x * 22) > .6 && k > .4) c.color = hex("#2e3a22");
        if (pat === "spots" && hash2(Math.floor(c.x * 30), Math.floor(c.y * 30)) > .82) { c.glyph = "o"; c.color = hex("#2e2a24"); }
        if (pat === "scales") c.glyph = (Math.floor(c.x * 30) + Math.floor(c.y * 30)) % 2 ? ")" : null;
        if (pat === "ridges" && Math.abs(c.y - dep * .55) < .05) { c.glyph = "^"; c.color = hex("#d8dce0"); } } },
      fin: M.solid(cooked ? "#8a4a22" : top), eye: { color: [20, 20, 20], shade(c) { c.glyph = "o"; c.emit = .4; } }, plate: { color: hex("#7a7670"), ramp: " .:-=", shade(c) { c.alpha = .6; } } }, { cam: [1.5, 1.6, 2.6] });
  };
  F.meat = (kind, cooked) => model((x, y, z, b, h) => {
    if (cooked) U(b, sd.cyl(x, y + .32, z, .8, .04), "plate", h);
    if (kind === "leg") { U(b, sd.capsule(x, y, z, -.35, -.05, 0, .25, .05, 0, .26), "meat", h); U(b, sd.capsule(x, y, z, .25, .05, 0, .7, .12, 0, .07), "bone", h); U(b, sd.sphere(x - .72, y - .12, z, .1), "bone", h); return; }
    if (kind === "bowl") { U(b, Math.max(sd.sphere(x, y - .1, z, .65), y - .1), "bowl", h); U(b, sd.cyl(x, y - .02, z, .58, .06), "stew", h); return; }
    if (kind === "pie") { U(b, sd.cyl(x, y + .2, z, .7, .32), "crust", h); return; }
    U(b, sd.sphere(x / .8, y / .22, z / .55, 1) * .22, "meat", h);
  }, { meat: { color: hex(cooked ? "#9a5a2e" : "#c84a4a"), ramp: RAMP.solid, shade(c) { const r = Math.hypot(c.x / .8, c.z / .55); if (!cooked && r > .82 && kind !== "leg") { c.color = hex("#f0e0d0"); } if (cooked && noise2(c.x * 10, c.z * 10) > .7) c.glyph = "#"; } },
    bone: M.solid("#efe6d4"), plate: { color: hex("#7a7670"), ramp: " .:-=", shade(c) { c.alpha = .6; } }, bowl: M.solid("#8a6a4a", RAMP.wood),
    stew: { color: hex("#b0602e"), shade(c) { c.emit = .6; c.glyph = noise2(c.x * 9, c.z * 9) > .6 ? "o" : "~"; c.color = noise2(c.x * 5, c.z * 5) > .6 ? hex("#e0b060") : hex("#a0502a"); } },
    crust: { color: hex("#d8a058"), ramp: RAMP.solid, shade(c) { if (c.ny > .8) { const r = Math.hypot(c.x, c.z); c.glyph = Math.abs(Math.sin(Math.atan2(c.z, c.x) * 6)) > .9 && r < .6 ? "|" : (kind === "pie" ? "#" : "o"); if (kind === "tart" && hash2(Math.floor(c.x * 12), Math.floor(c.z * 12)) > .5) c.color = hex("#5a2a6a"); } } } });
  F.herb = (kind) => {
    const P = {
      wild_garlic: (x, y, z, b, h) => { U(b, sd.sphere(x, (y + .35) * 1.25, z, .32), "bulb", h); for (const a of [0, 2.1, 4.2]) U(b, sd.capsule(x, y, z, 0, -.2, 0, Math.cos(a) * .3, .7, Math.sin(a) * .3, .06), "leaf", h); },
      nettle: (x, y, z, b, h) => { U(b, sd.capsule(x, y, z, 0, -.6, 0, 0, .7, 0, .03), "stem", h); for (let k = 0; k < 4; k++) for (const s of [-1, 1]) U(b, sd.sphere((x - s * .2) / 1.8, (y + .35 - k * .3) / .5, z / .4, .14) * .4 + .015 * Math.sin(x * 60), "leaf", h); },
      yarrow: (x, y, z, b, h) => { for (const a of [0, 2.1, 4.2]) U(b, sd.capsule(x, y, z, 0, -.6, 0, Math.cos(a) * .2, .3, Math.sin(a) * .2, .025), "stem", h); for (let k = 0; k < 14; k++) { const a = k * 2.4, r = .1 + (k % 4) * .08; U(b, sd.sphere(x - Math.cos(a) * r, y - .35, z - Math.sin(a) * r, .07), "flower", h); } },
      chanterelle: (x, y, z, b, h) => { U(b, sd.cyl(x, y + .6, z, .13, .6), "cap", h); U(b, Math.max(sd.cone(x, -(y - .25), z, .52, .45), -(y - .05)), "cap", h); },
      elderberry: (x, y, z, b, h) => { U(b, sd.capsule(x, y, z, 0, .7, 0, 0, .2, 0, .025), "stem", h); for (let k = 0; k < 22; k++) { const a = k * 2.4, r = Math.sqrt(k) * .1; U(b, sd.sphere(x - Math.cos(a) * r, y - .1 + r * .5, z - Math.sin(a) * r, .085), "berry", h); } },
      willow_bark: (x, y, z, b, h) => U(b, Math.max(Math.abs(Math.hypot(x, z) - .4) - .05, Math.abs(y) - .55, Math.atan2(z, x) > 2.2 ? 1 : -1), "bark", h),
      arnica: (x, y, z, b, h) => { U(b, sd.capsule(x, y, z, 0, -.7, 0, 0, .2, 0, .03), "stem", h); U(b, sd.cyl(x, y - .18, z, .14, .08), "centre", h); for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; U(b, sd.capsule(x, y, z, Math.cos(a) * .12, .22, Math.sin(a) * .12, Math.cos(a) * .48, .2, Math.sin(a) * .48, .045), "petal", h); } },
      ghost_orchid: (x, y, z, b, h) => { U(b, sd.capsule(x, y, z, 0, -.7, 0, 0, .1, .05, .025), "stem", h); for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; U(b, sd.sphere((x - Math.cos(a) * .25) / 1.6, (y - .25) / .5, (z - Math.sin(a) * .25) / 1.6, .14) * .5, "ghost", h); } },
    };
    return model(P[kind], { bulb: M.solid("#f0ead8"), leaf: M.noisy("#4f8a3a", "#7aaa50", RAMP.leaf), stem: M.solid("#5a7a3a"), flower: M.solid("#f2efe6"), cap: M.noisy("#e8932c", "#f4b450"),
      berry: { color: hex("#7a4aa0"), spec: .6, ramp: RAMP.solid }, bark: M.noisy("#7a6a5a", "#a89880", RAMP.wood), centre: M.solid("#d8902a"), petal: M.solid("#f2c83a"),
      ghost: { color: hex("#eef4fa"), shade(c) { c.emit = .8; c.glyph = "%"; } } });
  };
  F.pelt = (color, shaggy) => model((x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .4);
    U(b, Math.max(Math.abs(y + .05 * Math.sin(rx * 4)) - .04, Math.hypot(rx / 1, rz / .75) - .75 - .12 * noise2(rx * 4 + 3, rz * 4)), "pelt", h); }, {
    pelt: { color: hex(color), ramp: shaggy ? RAMP.fur : RAMP.cloth, shade(c) { c.color = mix(hex(color), hex(DARK), noise2(c.x * 8, c.z * 8) * .4); if (shaggy) c.glyph = noise2(c.x * 20, c.z * 20) > .5 ? "\"" : "%"; } } }, { cam: [1.2, 2.2, 2.2] });
  F.roll = (color, band) => model((x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .4); U(b, sd.capsule(rx, y, rz, -.6, 0, 0, .6, 0, 0, .3), "roll", h); U(b, sd.torus(rz, rx - .2, y, .31, .04), "band", h); }, {
    roll: { color: hex(color), ramp: RAMP.cloth, shade(c) { if (Math.abs(c.nx) > .7) { c.glyph = Math.floor(Math.hypot(c.y, c.z) * 30) % 2 ? "@" : "·"; } } }, band: M.solid(band || "#5a3a2a") });
  F.feather = () => model((x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .6); const cy = .15 * Math.sin(rx * 2);
    U(b, sd.capsule(rx, y - cy, rz, -.85, 0, 0, .8, 0, 0, .02), "quill", h); U(b, Math.max(Math.abs(rz) - .015, Math.abs(y - cy) - .26 * clamp(1 - Math.abs(rx + .1) / .85), Math.abs(rx + .05) - .75), "vane", h); },
    { quill: M.solid("#e8e2d6"), vane: { color: hex("#d8d0c4"), ramp: RAMP.cloth, shade(c) { c.glyph = Math.sin(c.x * 40 + c.y * 20) > .3 ? "/" : "\\"; } } });
  // Salvage and workshop parts.
  F.part = (kind, color) => {
    const P = {
      pile: (x, y, z, b, h) => { for (let k = 0; k < 6; k++) { const a = k * 1.7; U(b, sd.box(x - Math.cos(a) * .3, y + .3 - k * .08, z - Math.sin(a) * .3, .32, .03, .2) - .01, "main", h); } },
      coil: (x, y, z, b, h) => { for (let k = 0; k < 6; k++) U(b, sd.torus(x, y + .3 - k * .1, z, .45, .045), "main", h); },
      tyre: (x, y, z, b, h) => U(b, sd.torus(x, z, y, .5, .2), "main", h),
      shard: (x, y, z, b, h) => { for (const [cx, a] of [[0, .2], [.3, -.4], [-.3, .6]]) { const [rx, rz] = A.rotY(x - cx, z, a); U(b, Math.max(Math.abs(rz) - .02, Math.abs(rx) + Math.abs(y) * .6 - .45), "main", h); } },
      bolt: (x, y, z, b, h) => { U(b, sd.box(x, y + .25, z, .55, .12, .4) - .03, "main", h); U(b, sd.box(x, y, z, .5, .12, .38) - .03, "main", h); U(b, sd.box(x, y - .25, z, .45, .12, .35) - .03, "main", h); },
      nails: (x, y, z, b, h) => { for (let k = 0; k < 7; k++) { const a = k * .9, ox = Math.cos(a) * .25, oz = Math.sin(a) * .25; U(b, sd.capsule(x, y, z, ox - .4, -.3 + k * .05, oz, ox + .4, -.2 + k * .05, oz, .03), "main", h); U(b, sd.cyl(x - ox + .42, y + .27 - k * .05, z - oz, .07, .02), "main", h); } },
      gear: (x, y, z, b, h) => { const a = Math.atan2(z, x), r = Math.hypot(x, z); U(b, Math.max(Math.abs(y) - .1, r - .55 - .1 * (Math.cos(a * 10) > 0 ? 1 : 0), .18 - r), "main", h); },
      rollw: (x, y, z, b, h) => U(b, Math.max(sd.cyl(x, y + .3, z, .45, .6), .12 - Math.hypot(x, z)), "main", h),
      vial: (x, y, z, b, h) => { U(b, sd.capsule(x, y, z, 0, -.5, 0, 0, .3, 0, .26), "liquidv", h); U(b, sd.capsule(x, y, z, 0, -.5, 0, 0, .3, 0, .28), "glass", h); U(b, sd.cyl(x, y - .3, z, .1, .3), "glass", h); U(b, sd.cyl(x, y - .6, z, .12, .12), "cork", h); },
      board: (x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .4); U(b, sd.box(rx, y, rz, .75, .04, .5), "main", h); for (const [cx, cz] of [[-.3, -.15], [.2, .15], [.35, -.2]]) U(b, sd.box(rx - cx, y - .08, rz - cz, .14, .05, .1), "chip", h); },
      battery: (x, y, z, b, h) => { U(b, sd.cyl(x, y + .55, z, .28, 1), "main", h); U(b, sd.cyl(x, y - .45, z, .1, .1), "metal", h); U(b, sd.cyl(x, y + .1, z, .29, .25), "band", h); },
      lens: (x, y, z, b, h) => { U(b, Math.max(sd.sphere(x, y, z, .7) , Math.abs(z) - .1), "glass", h); U(b, Math.max(sd.torus(x, z, y, .6, .08), 0), "metal", h); },
      can: (x, y, z, b, h) => { U(b, sd.rbox(x, y + .05, z, .45, .55, .2, .06), "main", h); U(b, sd.capsule(x, y, z, -.25, .62, 0, .15, .62, 0, .05), "metal", h); U(b, sd.cyl(x - .35, y - .6, z, .07, .2), "metal", h); },
      piston: (x, y, z, b, h) => { U(b, sd.cyl(x, y - .1, z, .32, .45), "main", h); U(b, sd.capsule(x, y, z, 0, .1, 0, .2, -.7, 0, .07), "main", h); U(b, sd.torus(x - .2, z, y + .7, .14, .05), "main", h); },
      blade: (x, y, z, b, h) => { for (const [oz, a] of [[-.25, .4], [0, .5], [.25, .6]]) { const [rx, rz] = A.rotY(x, z - oz, a); U(b, sd.capsule(rx, y, rz, .05, 0, 0, .75, 0, 0, .05), "metal", h); U(b, Math.max(sd.box(rx - .3, y, rz, .35, .04, .09), (rx - .3) * .3 + Math.abs(rz) - .09), "main", h); } },
      pins: (x, y, z, b, h) => { for (let k = 0; k < 9; k++) U(b, sd.cyl(x - (k % 3 - 1) * .3, y + .25, z - (Math.floor(k / 3) - 1) * .3, .05, .5), "main", h); U(b, sd.box(x, y + .3, z, .5, .04, .5), "chip", h); },
      valve: (x, y, z, b, h) => { U(b, sd.capsule(x, y, z, 0, -.2, 0, 0, .4, 0, .3), "glass", h); U(b, sd.capsule(x, y, z, 0, -.1, 0, 0, .3, 0, .05), "glowpart", h); U(b, sd.cyl(x, y + .55, z, .3, .3), "metal", h); },
      core: (x, y, z, b, h) => U(b, sd.rbox(x, y, z, .45, .45, .45, .06), "core", h),
      bricks: (x, y, z, b, h) => { U(b, sd.box(x, y + .18, z, .55, .16, .28) - .02, "main", h); U(b, sd.box(x + .15, y - .16, z, .55, .16, .28) - .02, "main", h); },
      kit: (x, y, z, b, h) => { U(b, sd.rbox(x, y + .1, z, .55, .3, .35, .05), "main", h); U(b, sd.capsule(x, y, z, .3, .4, 0, .4, 1, -.1, .025), "metal", h); U(b, sd.cyl(x + .2, y - .12, z - .36, .1, .02), "glowpart", h); },
      panel: (x, y, z, b, h) => { const k = (z * .6 + y); U(b, Math.max(sd.box(x, k, z * .8 - y * .6, .7, .04, .5), 0), "main", h); U(b, sd.capsule(x, y, z, 0, -.6, .2, 0, -.05, 0, .04), "metal", h); },
      shafts: (x, y, z, b, h) => { for (let k = 0; k < 7; k++) { const a = k * .9, ox = Math.cos(a) * .14, oz = Math.sin(a) * .14; U(b, sd.capsule(x - ox, y, z - oz, -.85, 0, 0, .85, 0, 0, .055), "main", h); } U(b, sd.torus(z, x, y, .17, .03), "metal", h); },
      cells: (x, y, z, b, h) => { for (const ox of [-.32, 0, .32]) { U(b, sd.cyl(x - ox, y + .45, z, .14, .8), "main", h); U(b, sd.cyl(x - ox, y - .33, z, .06, .06), "metal", h); U(b, sd.cyl(x - ox, y + .05, z, .145, .16), "band", h); } },
      crystal: (x, y, z, b, h) => U(b, (Math.abs(x) + Math.abs(z) * 1.2 + Math.abs(y) * .55) * .7 - .4, "glowpart", h),
      lump: (x, y, z, b, h) => U(b, sd.sphere(x, y, z, .5) + .12 * noise2(x * 5, y * 5 + z * 3), "main", h),
      boot: (x, y, z, b, h) => { U(b, sd.rbox(x + .1, y, z, .2, .45, .22, .08), "main", h); U(b, sd.rbox(x - .2, y + .35, z, .45, .12, .22, .08), "main", h); U(b, sd.box(x - .15, y + .48, z, .5, .03, .23), "dark", h); },
    };
    return model(P[kind], { main: kind === "shard" ? M.glass(color) : ["coil", "pins", "gear", "nails", "piston", "pile"].includes(kind) ? M.metal(color) : M.solid(color, RAMP.solid),
      metal: M.metal(STEEL), glass: M.glass("#cfe8ee"), liquidv: { color: hex("#9fd8e8"), shade(c) { c.emit = .55; } }, cork: M.solid("#a07a52"), chip: M.solid("#2a2e30"), band: M.solid("#e0c060"), dark: M.solid(DARK),
      glowpart: { color: hex(color), shade(c) { c.emit = .9; } }, core: { color: hex(color), ramp: RAMP.metal, shade(c) { const g = Math.abs(Math.sin(c.x * 14)) < .12 || Math.abs(Math.sin(c.y * 14)) < .12; if (g) { c.emit = .95; c.glyph = "+"; } else c.color = hex("#2a3a3a"); } } });
  };
  // Valuables and keepsakes.
  F.keep = (kind, color) => {
    const P = {
      coin: (x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .5); U(b, sd.cyl(rx, rz + .07, y, .55, .14), "gold", h); },
      frame: (x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .3); U(b, Math.max(sd.box(rx, y, rz, .5, .62, .04), -sd.box(rx, y, rz - .03, .4, .52, .04)), "wood", h); U(b, sd.box(rx, y, rz, .4, .52, .02), "photo", h); },
      key: (x, y, z, b, h) => { U(b, sd.torus(x + .5, z, y, .24, .08), "gold", h); U(b, sd.capsule(x, y, z, -.28, 0, 0, .7, 0, 0, .08), "gold", h); U(b, sd.box(x - .6, y + .14, z, .06, .13, .06), "gold", h); U(b, sd.box(x - .44, y + .12, z, .05, .1, .06), "gold", h); },
      bottle: (x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .4); U(b, sd.capsule(rx, y, rz, -.5, 0, 0, .25, 0, 0, .24), "glass", h); U(b, sd.capsule(rx, y, rz, .25, 0, 0, .7, 0, 0, .09), "glass", h); U(b, sd.capsule(rx, y, rz, -.35, 0, 0, .15, 0, 0, .1), "paper", h); },
      blob: (x, y, z, b, h) => U(b, sd.sphere(x, y, z, .5) + .08 * noise2(x * 4, y * 4 + z * 3), "gem", h),
      gem: (x, y, z, b, h) => U(b, (Math.abs(x) + Math.abs(y) * 1.3 + Math.abs(z)) * .6 - .42, "gem", h),
      watch: (x, y, z, b, h) => { U(b, sd.cyl(x, z + .1, y, .5, .2), "gold", h); U(b, sd.torus(x, z, y - .65, .14, .04), "gold", h); },
      scroll: (x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .4); U(b, sd.capsule(rx, y, rz, -.7, 0, 0, .7, 0, 0, .18), "paper", h); for (const s of [-.75, .75]) U(b, sd.capsule(rx, y, rz, s, 0, 0, s * 1.08, 0, 0, .06), "wood", h); },
    };
    return model(P[kind], { gold: M.metal(color || "#e8c56a"), wood: M.solid("#6e5038", RAMP.wood), photo: M.noisy("#7a8a9a", "#d8c8a8", RAMP.solid, 9), glass: M.glass("#9fc8a8"), paper: M.solid("#efe4c8", RAMP.cloth),
      gem: { color: hex(color || "#e8c56a"), ramp: RAMP.glass, spec: .8, shade(c) { c.emit = .45 + .35 * Math.abs(c.nx + c.ny); } } },
      ["scroll", "bottle", "key", "coin"].includes(kind) ? { cam: [1, 2.4, 1.6] } : {});
  };
  // Gear. The metal part takes the tier's colour; grips and straps stay.
  F.machete = (metal) => model((x, y, z, b, h) => { const ry = y + x * .35;
    // A broad blade that widens to the tip, a guard and a wrapped grip.
    U(b, Math.max(sd.box(x + .2, ry, z, .62, .2 + (x + .2) * -.06, .05), (-x - .82) + Math.abs(ry - .08) * .9), "blade", h);
    U(b, sd.box(x - .46, ry, z, .05, .26, .08), "guard", h); U(b, sd.capsule(x, ry, z, .5, 0, 0, .95, 0, 0, .08), "grip", h); },
    { blade: { ...M.metal(METALS[metal]), shade(c) { if (c.y + c.x * .35 > .1) { c.color = mix(hex(METALS[metal]), [255, 255, 255], .35); c.glyph = "="; } } }, guard: M.metal("#6a6050"), grip: { color: hex(WRAP), ramp: RAMP.wood, shade(c) { c.glyph = Math.sin(c.x * 50) > 0 ? "/" : "="; } } }, { cam: [.5, .7, 3] });
  F.helmet = (color, leather) => model((x, y, z, b, h) => { U(b, Math.max(sd.sphere(x, y + .15, z, .6), -(y + .15)), "shell", h); U(b, Math.max(sd.cyl(x, y + .2, z, .72, .07), -y - .2), "shell", h);
    if (!leather) U(b, sd.box(x, y + .05, z - .6, .05, .25, .04), "shell", h); else U(b, sd.capsule(x, y, z, .55, -.05, 0, .65, -.55, .1, .07), "shell", h); },
    { shell: leather ? M.noisy(LIFT(color), color, RAMP.cloth, 8) : { ...M.metal(color), shade(c) { if (Math.abs(c.x) < .04) c.glyph = "|"; } } });
  F.chest = (color, leather) => model((x, y, z, b, h) => { U(b, Math.max(sd.rbox(x, y, z, .55, .62, .3, .2), -sd.cyl(x, y - .62, z, .2, .3)), "plate", h);
    for (const s of [-1, 1]) U(b, sd.sphere(x - s * .58, y - .45, z, .22), "plate", h); if (!leather) for (const s of [-1, 1]) U(b, sd.box(x - s * .3, y, z - .3, .04, .55, .02), "strap", h); },
    { plate: leather ? M.noisy(LIFT(color), color, RAMP.cloth, 7) : { ...M.metal(color), shade(c) { if (Math.abs(Math.sin(c.y * 9)) < .1) c.glyph = "="; } }, strap: M.solid(WRAP) });
  F.legs = (color, leather) => model((x, y, z, b, h) => { for (const s of [-1, 1]) U(b, sd.capsule(x - s * .2, y, z, 0, .55, 0, s * .05, -.6, 0, .17), "plate", h); U(b, sd.rbox(x, y - .55, z, .4, .12, .2, .06), "plate", h); },
    { plate: leather ? M.noisy(LIFT(color), color, RAMP.cloth, 7) : M.metal(color) });
  F.shield = (color) => model((x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .5); U(b, Math.max(sd.sphere(rx, y, rz + 1.6, 1.75), Math.hypot(rx, y) - .68, -(rz + .02)), "face", h);
    U(b, sd.torus(rx, y, rz - .02, .68, .05), "rim", h); U(b, sd.sphere(rx, y, rz - .05, .14), "rim", h); },
    { face: { color: hex(color), ramp: RAMP.metal, spec: .4, shade(c) { const r = Math.hypot(c.x, c.y); if (Math.abs(Math.sin(r * 18)) < .12) c.glyph = "o"; } }, rim: M.metal("#6a6050") }, { cam: [1.4, 1, 2.8] });
  F.tips = (color) => model((x, y, z, b, h) => { for (const [cx, cz, a] of [[0, 0, 0], [.35, .2, .6], [-.35, .15, -.5]]) { const [rx, rz] = A.rotY(x - cx, z - cz, a); U(b, Math.max(sd.cone(rx, y + .35, rz, .2, .7), 0), "tip", h); } }, { tip: M.metal(color) });
  F.bow = (wood, ornate) => model((x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .4);
    U(b, Math.max(sd.torus(rx + .9, rz, y, 1.15, .09), -(rx + .25)), "limb", h); U(b, sd.capsule(rx, y, rz, -.24, -.82, 0, -.24, .82, 0, .025), "string", h); U(b, sd.capsule(rx, y, rz, .22, -.15, 0, .26, .15, 0, .075), "grip", h); },
    { limb: { color: hex(wood), ramp: RAMP.wood, shade(c) { if (ornate && Math.sin(c.y * 30) > .7) c.color = hex("#e8c56a"); } }, string: M.solid("#f0ead8"), grip: M.solid(WRAP, RAMP.wood) });
  F.arrows = (color) => model((x, y, z, b, h) => { for (const [oy, oz] of [[0, 0], [.14, .1], [-.12, .12]]) { const [rx, rz] = A.rotY(x, z - oz, .5), ry = y - oy;
    U(b, sd.capsule(rx, ry, rz, -.75, 0, 0, .55, 0, 0, .05), "shaft", h); U(b, sd.cone(-(rx - .75), ry, rz, .11, .26), "tip", h); U(b, Math.max(Math.abs(rz) - .03, Math.abs(ry) - .12, Math.abs(rx + .62) - .13), "fletch", h); } },
    { shaft: M.solid("#c8a46e", RAMP.wood), tip: M.metal(color), fletch: M.solid("#efe8dc") });
  F.glove = (color) => model((x, y, z, b, h) => { U(b, sd.rbox(x, y + .1, z, .32, .38, .12, .1), "l", h); for (let k = 0; k < 4; k++) U(b, sd.capsule(x, y, z, -.22 + k * .15, .4, 0, -.24 + k * .16, .75 - Math.abs(k - 1.5) * .07, 0, .06), "l", h);
    U(b, sd.capsule(x, y, z, .3, .1, 0, .52, .4, 0, .07), "l", h); U(b, sd.cyl(x, y + .62, z, .34, .2), "cuff", h); }, { l: M.noisy(LIFT(color), color, RAMP.cloth, 8), cuff: M.solid("#5a4232") });
  F.boot = (color) => model((x, y, z, b, h) => { U(b, sd.rbox(x + .15, y - .1, z, .2, .45, .22, .1), "l", h); U(b, sd.rbox(x - .18, y + .4, z, .45, .14, .22, .1), "l", h); U(b, sd.box(x - .15, y + .53, z, .5, .03, .23), "sole", h); },
    { l: M.noisy(LIFT(color), color, RAMP.cloth, 8), sole: M.solid(DARK) });
  F.cloak = (color, hood) => model((x, y, z, b, h) => { U(b, Math.max(sd.cone(x, y + .75, z, .7, 1.45) + .03 * Math.sin(Math.atan2(z, x) * 7), -sd.cone(x, y + .8, z, .6, 1.3)), "cloth", h); if (hood) U(b, Math.max(sd.sphere(x, y - .55, z, .28), -sd.sphere(x, y - .52, z - .1, .22)), "cloth", h); },
    { cloth: M.noisy(LIFT(color), color, RAMP.cloth, 5) });
  F.gadget = (accent, tier) => model((x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .6);
    U(b, sd.rbox(rx + .1, y, rz, .42, .22, .18, .06), "body", h); U(b, sd.capsule(rx, y, rz, -.3, 0, 0, -.6 - tier * .03, 0, 0, .08 + tier * .008), "barrel", h);
    U(b, sd.rbox(rx + .35, y + .35, rz, .1, .26, .1, .04), "grip", h); for (let k = 0; k < 2 + Math.floor(tier / 2); k++) U(b, sd.torus(y, rz, rx + .45 + k * .12, .1, .025), "coil", h); },
    { body: M.metal("#8a949e"), barrel: M.metal("#b0b8c0"), grip: M.solid("#6a5a4a"), coil: { color: hex(accent), shade(c) { c.emit = .9; } } });
  F.charm = (kind, color) => {
    const P = {
      washer: (x, y, z, b, h) => U(b, Math.max(sd.torus(x, y, z, .38, .14), 0), "main", h),
      compass: (x, y, z, b, h) => { U(b, sd.cyl(x, z + .1, y, .55, .2), "main", h); U(b, sd.box(x, y, z - .12, .04, .38, .02), "needle", h); },
      watch: (x, y, z, b, h) => { U(b, sd.cyl(x, z + .1, y, .5, .2), "main", h); U(b, sd.torus(x, z, y - .62, .13, .035), "main", h); },
      scanner: (x, y, z, b, h) => { U(b, sd.rbox(x, y, z, .45, .55, .12, .05), "main", h); U(b, sd.box(x, y - .18, z - .12, .32, .18, .01), "screen", h); U(b, sd.capsule(x, y, z, .3, .5, 0, .35, 1, 0, .025), "needle", h); },
      pendant: (x, y, z, b, h) => { U(b, sd.torus(x, z, y - .25, .55, .02), "cord", h); U(b, (Math.abs(x) + Math.abs(y + .45) * 1.2 + Math.abs(z) * 2) * .6 - .2, "gem", h); },
      lens: (x, y, z, b, h) => { for (const s of [-1, 1]) { U(b, sd.torus(x - s * .32, y, z, .22, .06), "main", h); U(b, Math.max(Math.hypot(x - s * .32, y) - .2, Math.abs(z) - .02), "gem", h); } U(b, sd.capsule(x, y, z, -.12, 0, 0, .12, 0, 0, .04), "main", h); },
      star: (x, y, z, b, h) => { const a = Math.atan2(y, x), r = Math.hypot(x, y); U(b, Math.max(Math.abs(z) - .06, r - (.32 + .25 * Math.max(0, Math.cos(a * 5)))), "main", h); },
      core: (x, y, z, b, h) => { U(b, sd.sphere(x, y, z, .38), "gem", h); for (let k = 0; k < 3; k++) U(b, sd.torus(x, y, z, .55 + k * .02, .03), "main", h); },
    };
    return model(P[kind], { main: M.metal(color), needle: M.solid("#e84a3a"), screen: { color: hex("#7fe0c0"), shade(c) { c.emit = .85; c.glyph = Math.sin(c.x * 30) > 0 ? "~" : "-"; } },
      cord: M.solid("#5a4232"), gem: { color: hex(kind === "core" ? "#ef4a3a" : kind === "lens" ? "#7fe0c0" : color === "#e8c56a" ? "#f0a030" : "#c0303a"), spec: .7, shade(c) { c.emit = .55; } } }, { cam: [1.2, 1, 2.8] });
  };
  F.remedy = (kind, liquid) => {
    const P = {
      tin: (x, y, z, b, h) => { U(b, sd.cyl(x, y + .2, z, .55, .35), "metal", h); U(b, sd.cyl(x, y - .15, z, .5, .02), "liquid", h); },
      cup: (x, y, z, b, h) => { U(b, Math.max(sd.cyl(x, y + .45, z, .4, .75), -sd.cyl(x, y + .35, z, .34, .8)), "cup", h); U(b, sd.cyl(x, y - .2, z, .34, .02), "liquid", h); U(b, sd.torus(z, y, x - .42, .17, .04), "cup", h); },
      bundle: (x, y, z, b, h) => { U(b, sd.sphere(x, y, z, .48) + .05 * noise2(x * 6, y * 6), "cloth", h); U(b, sd.torus(x, z, y - .32, .2, .05), "tie", h); },
      round: (x, y, z, b, h) => { U(b, sd.sphere(x, y + .1, z, .42), "glass", h); U(b, sd.cyl(x, y - .3, z, .1, .3), "glass", h); U(b, sd.sphere(x, y + .18, z, .34), "liquid", h); U(b, sd.cyl(x, y - .62, z, .12, .1), "cork", h); },
      tall: (x, y, z, b, h) => { U(b, sd.rbox(x, y + .1, z, .26, .48, .2, .06), "glass", h); U(b, sd.cyl(x, y - .4, z, .1, .3), "glass", h); U(b, sd.rbox(x, y + .2, z, .22, .36, .16, .05), "liquid", h); U(b, sd.cyl(x, y - .72, z, .12, .1), "cork", h); },
      flask: (x, y, z, b, h) => { U(b, Math.max(sd.cone(x, y + .55, z, .5, 1.1), y - .1), "glass", h); U(b, sd.cyl(x, y + .1, z, .1, .45), "glass", h); U(b, Math.max(sd.cone(x, y + .5, z, .44, 1), y - .05 + .25), "liquid", h); U(b, sd.cyl(x, y - .55, z, .12, .1), "cork", h); },
      jar: (x, y, z, b, h) => { U(b, sd.rbox(x, y + .15, z, .38, .35, .38, .1), "glass", h); U(b, sd.rbox(x, y + .2, z, .33, .28, .33, .08), "liquid", h); U(b, sd.cyl(x, y - .22, z, .36, .12), "metal", h); },
      ornate: (x, y, z, b, h) => { U(b, sd.sphere(x, y + .2, z, .38), "glass", h); U(b, sd.capsule(x, y, z, 0, -.15, 0, 0, -.55, 0, .07), "glass", h); U(b, sd.sphere(x, y + .22, z, .3), "liquid", h); U(b, sd.torus(x, z, y - .55, .12, .04), "metal", h); U(b, sd.sphere(x, y - .72, z, .08), "liquid", h); },
      dressing: (x, y, z, b, h) => { U(b, sd.rbox(x, y, z, .55, .15, .4, .06), "cloth", h); U(b, sd.box(x, y - .16, z, .3, .01, .06), "cross", h); U(b, sd.box(x, y - .16, z, .06, .01, .22), "cross", h); },
      case: (x, y, z, b, h) => { U(b, sd.rbox(x, y, z, .62, .38, .3, .06), "case", h); U(b, sd.box(x, y, z - .31, .1, .26, .01), "cross", h); U(b, sd.box(x, y, z - .31, .26, .1, .01), "cross", h); U(b, sd.torus(x, z, y - .45, .2, .04), "metal", h); },
    };
    return model(P[kind], { metal: M.metal("#b8bec6"), glass: M.glass("#d8eef2"), cork: M.solid("#a07a52"), cup: M.solid("#d8cfc0"), cloth: M.solid("#efe8da", RAMP.cloth), tie: M.solid("#7a5a3a"),
      liquid: { color: hex(liquid), shade(c) { c.emit = .7; c.glyph = noise2(c.x * 12, c.y * 12) > .55 ? "~" : null; } }, cross: { color: hex("#d83a3a"), shade(c) { c.emit = .9; c.glyph = "+"; } },
      case: M.solid(liquid === "big" ? "#4a5a4a" : "#efe8da") });
  };
  F.club = () => model((x, y, z, b, h) => { const ry = y + x * .35; U(b, sd.capsule(x, ry, z, -.85, 0, 0, .8, 0, 0, .13), "pipe", h); U(b, sd.capsule(x, ry, z, -.95, 0, 0, -.7, 0, 0, .19), "pipe", h); U(b, sd.capsule(x, ry, z, .4, 0, 0, .85, 0, 0, .15), "grip", h); },
    { pipe: M.metal("#9aa0a6"), grip: { color: hex("#6a5a4a"), ramp: RAMP.wood, shade(c) { c.glyph = Math.sin(c.x * 40) > 0 ? "/" : "="; } } }, { cam: [.5, .7, 3] });
  F.slingshot = () => model((x, y, z, b, h) => { U(b, sd.capsule(x, y, z, 0, -.7, 0, 0, .05, 0, .07), "wood", h); for (const s of [-1, 1]) U(b, sd.capsule(x, y, z, 0, .05, 0, s * .35, .6, 0, .06), "wood", h); U(b, sd.capsule(x, y, z, -.35, .58, 0, 0, .3, .2, .02), "band", h); U(b, sd.capsule(x, y, z, .35, .58, 0, 0, .3, .2, .02), "band", h); },
    { wood: M.solid("#9a7550", RAMP.wood), band: M.solid("#c84a3a") });
  F.shears = () => model((x, y, z, b, h) => { const [rx, rz] = A.rotY(x, z, .5); for (const s of [-1, 1]) { U(b, Math.max(sd.box(rx - .3, y - s * .06 * (rx - .3), rz + s * .02, .55, .06, .015), 0), "blade", h); U(b, sd.torus(rx + .5, rz + s * .02, y - s * .22, .14, .04), "vine", h); } },
    { blade: M.metal("#c3cad2"), vine: M.noisy("#5d8a4a", "#3e6b3c", RAMP.leaf) });
  F.visor = () => model((x, y, z, b, h) => { U(b, Math.max(sd.sphere(x, y + .1, z, .6), -(y + .1)), "shell", h); U(b, Math.max(Math.abs(sd.sphere(x, y + .1, z, .63)) - .03, Math.abs(y + .02) - .16, z), "glass", h); },
    { shell: M.metal("#5a6a7a"), glass: { color: hex("#88c0f0"), shade(c) { c.emit = .8; c.glyph = "="; } } });

  // ------------------------------------------------------- item → model
  const LIQUIDS = { garlic_salve: ["tin", "#e8e0b8"], nettle_tea: ["cup", "#6a8a3a"], yarrow_poultice: ["bundle", "#fff"], chanterelle_tonic: ["round", "#e8932c"], elderberry_syrup: ["tall", "#6a2a7a"],
    willow_draught: ["flask", "#9a7a4a"], arnica_balm: ["jar", "#f2c83a"], orchid_elixir: ["ornate", "#e8f0ff"], field_dressing: ["dressing", "#fff"], medkit: ["case", "#fff"], trauma_kit: ["case", "big"] };
  const PARTS = { scrap_metal: ["pile", "#a8a49c"], wire: ["coil", "#b8b0a0"], rubber: ["tyre", "#62605c"], glass: ["shard", "#a8d6e0"], cloth: ["bolt", "#c9b9a4"], nails: ["nails", "#9d9d9d"],
    copper_wire: ["coil", "#d98b52"], tool_parts: ["gear", "#b0a690"], bandage_roll: ["rollw", "#f2ece0"], empty_vial: ["vial", "#cfe8ee"], circuit_board: ["board", "#3f8a5a"], battery: ["battery", "#3a3a3a"],
    lens: ["lens", "#bfe2f0"], fuel_can: ["can", "#c8553d"], engine_parts: ["piston", "#8f8b84"], surgical_steel: ["blade", "#dfe4e8"], gold_contacts: ["pins", "#f2c84b"], radio_valve: ["valve", "#ffb35a"],
    server_core: ["core", "#7fe0c0"], brick: ["bricks", "#c26a4a"], radio_kit: ["kit", "#6a5a8a"], solar_panel: ["panel", "#2a4a7a"], arrow_shafts: ["shafts", "#c8a46e"], burnt_food: ["lump", "#5a4436"], old_boot: ["boot", "#5a4a3a"] };
  const KEEPS = { old_coin: ["coin"], family_photo: ["frame"], brass_key: ["key"], message_bottle: ["bottle"], amber: ["blob", "#f0a030"], garnet: ["gem", "#b0303a"], pocket_watch: ["watch"], star_chart: ["scroll"] };
  const CHARMS = { lucky_washer: ["washer", "#a8acb2"], brass_compass: ["compass", "#d8a84a"], windup_watch: ["watch", "#d8a84a"], signal_scanner: ["scanner", "#5a646e"], amber_amulet: ["pendant", "#e8c56a"],
    garnet_pendant: ["pendant", "#c0c6cc"], night_lens: ["lens", "#4a5a5a"], bounty_charm: ["star", "#d6b85a"], warden_core: ["core", "#5a6068"] };
  const BAND = { weather: "#88c0f0", farm: "#9fc779", maritime: "#4ab0c8", aviation: "#e8e8f8", military: "#a8b860", numbers: "#e8a85a", relay: "#b192e6" };
  const ORE = { clay: ["#b07a52", "clay"], copper_ore: ["#d98b52"], tin_ore: ["#c8ccd0"], iron_ore: ["#b0603a"], coal: ["#4a4a54", "coal"], quartz: ["#eef4f6", "crystal"],
    nickel_ore: ["#9fc2b8"], titanium_ore: ["#d6dee8"], skyfall_ore: ["#b39cf0", "glow"] };

  function forItem(id) {
    let m;
    if ((m = id.match(/^(\w+)_log$/))) return F.log(m[1]);
    if ((m = id.match(/^(\w+)_plank$/))) return F.plank(m[1]);
    if (ORE[id]) return F.ore(ORE[id][0], ORE[id][1]);
    if ((m = id.match(/^(\w+)_bar$/))) return F.bar(METALS[m[1]]);
    if ((m = id.match(/^raw_(\w+)$/)) && FISH[m[1]]) return F.fish(m[1], false);
    if ((m = id.match(/^cooked_(\w+)$/)) && FISH[m[1]]) return F.fish(m[1], true);
    if (["raw_rabbit", "raw_fowl"].includes(id)) return F.meat("leg", false);
    if (["venison", "raw_pork", "elk_meat", "muskox_meat"].includes(id)) return F.meat("steak", false);
    if (["roast_rabbit", "roast_fowl"].includes(id)) return F.meat("leg", true);
    if (["venison_steak", "pork_roast", "elk_steak"].includes(id)) return F.meat("steak", true);
    if (["muskox_stew", "garlic_stew", "feast_platter"].includes(id)) return F.meat("bowl", true);
    if (id === "hunters_pie") return F.meat("pie", true);
    if (id === "orchard_tart") return F.meat("tart", true);
    if (["wild_garlic", "nettle", "yarrow", "chanterelle", "elderberry", "willow_bark", "arnica", "ghost_orchid"].includes(id)) return F.herb(id);
    if ((m = id.match(/^(\w+)_(hide|fur)$/))) return F.pelt(LEATHERS[m[1]] || "#8a7460", m[1] === "muskox");
    if ((m = id.match(/^(\w+)_leather$/))) return F.roll(LEATHERS[m[1]], "#5a3a2a");
    if (id === "feathers") return F.feather();
    if ((m = id.match(/^(\w+)_fragment$/))) return F.part("crystal", BAND[m[1]]);
    if (PARTS[id]) return F.part(PARTS[id][0], PARTS[id][1]);
    if (KEEPS[id]) return F.keep(KEEPS[id][0], KEEPS[id][1]);
    if (CHARMS[id]) return F.charm(CHARMS[id][0], CHARMS[id][1]);
    if (LIQUIDS[id]) return F.remedy(LIQUIDS[id][0], LIQUIDS[id][1]);
    if ((m = id.match(/^(bronze|iron|steel|alloy|titanium|skyfall)_(machete|helmet|plate|greaves|shield|arrowtips|arrows)$/))) {
      const c = METALS[m[1]];
      return { machete: () => F.machete(m[1]), helmet: () => F.helmet(c), plate: () => F.chest(c), greaves: () => F.legs(c), shield: () => F.shield(c), arrowtips: () => F.tips(c), arrows: () => F.arrows(c) }[m[2]]();
    }
    if ((m = id.match(/^(\w+)_bow$/))) return F.bow(WOODS[m[1]][1]);
    if ((m = id.match(/^(rabbit|deer|boar|elk|muskox)_(hood|gloves|boots|chaps|vest)$/))) {
      const c = LEATHERS[m[1]];
      return { hood: () => F.helmet(c, true), gloves: () => F.glove(c), boots: () => F.boot(c), chaps: () => F.legs(c, true), vest: () => F.chest(c, true) }[m[2]]();
    }
    const cloaks = { bandana: ["#c8553d", false], patchwork_cloak: ["#8a7a6a", true], scout_cloak: ["#5a7a5a", true], ranger_cloak: ["#4a6a52", true], muskox_mantle: ["#6a5a4a", true] };
    if (cloaks[id]) return id === "bandana" ? F.helmet("#c8553d", true) : F.cloak(...cloaks[id]);
    const gadgets = { spark_gun: ["#7fc6e6", 0], taser: ["#e6e05a", 1], flare_launcher: ["#ef6f4f", 2], arc_thrower: ["#7fa6ff", 3], pulse_emitter: ["#b192e6", 4], storm_coil: ["#ffffff", 5] };
    if (gadgets[id]) return F.gadget(...gadgets[id]);
    const cells = { zinc_cell: "#a8acb2", lithium_cell: "#6ab0e0", fusion_cell: "#b192e6" };
    if (cells[id]) return F.part("cells", cells[id]);
    if (id === "pipe_club") return F.club();
    if (id === "slingshot") return F.slingshot();
    if (id === "thorn_shears") return F.shears();
    if (id === "stormglass_visor") return F.visor();
    if (id === "maren_longbow") return F.bow("#8a3a2a", true);
    if (id === "hunter_hood") return F.helmet("#8a7a4a", true);
    if (id === "tracker_boots") return F.boot("#6a5a3a");
    return F.part("lump", "#8a8a8a");
  }

  // ------------------------------------------------------ Trader tools
  // The Trader's tool upgrades, one model per kind; the tier sets the metal
  // (the handles and grips keep their own colours).
  const TOOL_METALS = { rusted: "#9a5a3a", iron: METALS.iron, steel: METALS.steel, titanium: METALS.titanium, skyfall: METALS.skyfall };
  const metalMat = (tier) => tier === "rusted" ? M.noisy("#a8653f", "#5e3a26", RAMP.metal, 9)
    : { ...M.metal(TOOL_METALS[tier] || METALS.iron), shade(c) { if (tier === "skyfall") c.emit = .35 + .2 * Math.sin(c.x * 9 + c.y * 7); } };
  const HANDLE = { color: hex("#8a6a48"), ramp: RAMP.wood, shade(c) { c.glyph = Math.sin(c.y * 30 + c.x * 12) > .6 ? "|" : c.glyph; } };
  // Long tools lie on a diagonal, so they fill a square picture.
  const tilt = (fn, a) => (x, y, z, b, h) => { const c = Math.cos(a), s = Math.sin(a); fn(x * c + y * s, -x * s + y * c, z, b, h); };
  F.tool = (kind, tier) => {
    const metal = metalMat(tier), edge = { ...metalMat(tier), shade(c) { c.color = mix(hex(TOOL_METALS[tier] || METALS.iron), [255, 255, 255], .45); c.glyph = "="; } };
    if (kind === "hatchet") return model(tilt((x, y, z, b, h) => {
      const [rx, rz] = A.rotY(x, z, .35);
      U(b, sd.capsule(rx, y, rz, 0, -.85, 0, 0, .7, 0, .1), "handle", h);
      // The head: a wedge that flares to the edge, with an eye round the handle.
      U(b, Math.max(sd.box(rx + .3, y - .55, rz, .34, .2 + (rx + .3) * .22, .1), -rx - .02), "metal", h);
      U(b, sd.box(rx + .64, y - .55, rz, .04, .34, .07), "edge", h);
      U(b, sd.cyl(rx, y - .75, rz, .15, .4), "metal", h);
    }, -.8), { handle: HANDLE, metal, edge }, { cam: [.9, .7, 3] });
    if (kind === "pickaxe") return model(tilt((x, y, z, b, h) => {
      const [rx, rz] = A.rotY(x, z, .35);
      U(b, sd.capsule(rx, y, rz, 0, -.85, 0, 0, .55, 0, .1), "handle", h);
      for (const s of [-1, 1]) U(b, sd.capsule(rx, y, rz, 0, .62, 0, s * .8, .4 - .1 * s, 0, .11 - .03 * s), s > 0 ? "edge" : "metal", h);
      U(b, sd.rbox(rx, y - .62, rz, .18, .14, .14, .04), "metal", h);
    }, -.6), { handle: HANDLE, metal, edge }, { cam: [.9, .7, 3] });
    if (kind === "rod") return model((x, y, z, b, h) => {
      const [rx, rz] = A.rotY(x, z, .5), ry = y - rx * .9;
      U(b, sd.capsule(rx, ry, rz, -.9, 0, 0, .95, 0, 0, .05 + Math.max(0, -rx) * .03), "metal", h);
      U(b, sd.capsule(rx, ry, rz, -.95, 0, 0, -.45, 0, 0, .1), "cork", h);
      U(b, sd.torus(rx + .35, rz - .12, ry + .02, .15, .055), "reel", h);
      U(b, sd.capsule(rx, ry, rz, .95, 0, 0, .95, -.55, .02, .02), "line", h);
      U(b, sd.torus(rx - .95, rz, ry + .6, .04, .012), "metal", h);
    }, { metal, cork: M.noisy("#c9a06a", "#8a6a48", RAMP.cloth, 14), reel: metal, line: { color: hex("#e8e4d8"), shade(c) { c.glyph = "|"; } } }, { cam: [.6, .6, 3] });
    if (kind === "prybar") return model(tilt((x, y, z, b, h) => {
      const [rx, rz] = A.rotY(x, z, .4);
      U(b, sd.capsule(rx, y, rz, 0, -.8, 0, 0, .55, 0, .085), "metal", h);
      U(b, Math.max(Math.abs(sd.torus(rx - .2, rz, y - .55, .2, 0) ) - .085, -(y - .55)), "metal", h);   // the curved end
      U(b, sd.box(rx - .38, y - .52, rz, .05, .08, .08), "edge", h);
      U(b, sd.box(rx + .04, y + .82, rz, .1, .04, .07), "edge", h);
      U(b, sd.capsule(rx, y, rz, 0, -.75, 0, 0, -.25, 0, .12), "grip", h);
    }, -.75), { metal, edge, grip: { color: hex("#c8553d"), ramp: RAMP.cloth } }, { cam: [.9, .7, 3] });
    if (kind === "snare") return model((x, y, z, b, h) => {
      U(b, Math.abs(sd.torus(x - .2, z, y - .05, .42, 0)) - .045, "metal", h);   // the wire loop
      U(b, Math.abs(sd.torus(x - .2, z, y - .05, .28, 0)) - .038, "metal", h);
      U(b, sd.cone(x + .55, -(y - .55), z, .11, 1.05), "stake", h);                // a wooden stake, point down
      U(b, sd.capsule(x, y, z, .55, .45, 0, .25, .1, .05, .035), "metal", h);
    }, { metal, stake: M.solid("#9a7550", RAMP.wood) }, { cam: [1, 2.2, 2.4] });
    if (kind === "knife") return model((x, y, z, b, h) => {
      const [rx, rz] = A.rotY(x, z, .5), ry = y + rx * .3;
      U(b, Math.max(sd.box(rx + .3, ry - (rx + .3) * (rx + .3) * .25, rz, .45, .15, .045), (rx - .75) * .6 + Math.abs(ry) - .16), "metal", h);
      U(b, sd.box(rx + .3, ry - .13 - (rx + .3) * (rx + .3) * .25, rz, .42, .025, .05), "edge", h);
      U(b, sd.capsule(rx, ry, rz, -.75, 0, 0, -.18, 0, 0, .13), "handle", h);
      U(b, sd.cyl(rx + .16, ry, rz, .05, .02), "edge", h);
    }, { metal, edge, handle: HANDLE }, { cam: [.4, .8, 3] });
    // Stockpile room: shelves that fill with crates as it grows.
    if (kind === "shelves") return model((x, y, z, b, h) => {
      const n = 1 + (+tier || 0);
      for (const px of [-.7, .7]) U(b, sd.box(x - px, y - .55, z, .04, .55, .25), "frame", h);
      for (let k = 0; k < 3; k++) U(b, sd.box(x, y - (.08 + k * .45), z, .72, .025, .25), "frame", h);
      for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) if (k * 3 + i < 3 + n * 1.5) U(b, sd.box(x - (-.45 + i * .45), y - (.25 + k * .45), z, .17, .14, .17), "crate", h);
    }, { frame: M.solid("#6a4e36", RAMP.wood), crate: { color: hex("#b08a5a"), ramp: RAMP.wood, shade(c) { if (Math.abs(Math.sin(c.y * 30)) < .2) c.glyph = "="; } } }, { cam: [.8, .7, 3] });
    // Field rations: tins in a crate; more tins for higher tiers.
    const n = { i: 1, ii: 2, iii: 3 }[tier] || 1;
    return model((x, y, z, b, h) => {
      U(b, Math.max(sd.box(x, y + .25, z, .7, .25, .45), -sd.box(x, y + .35, z, .64, .25, .39)), "crate", h);
      for (let i = 0; i < 2 + n; i++) { const tx = -.45 + i * (.9 / (1 + n)); U(b, sd.cyl(x - tx, y + .05, z, .17, .55), "tin", h); U(b, sd.cyl(x - tx, y + .6, z, .18, .03), "lid", h); }
    }, { crate: M.noisy("#9a7550", "#6a5038", RAMP.wood, 8), tin: { color: hex("#c8553d"), ramp: RAMP.metal, spec: .5, shade(c) { if (Math.abs(c.y - .35) < .08) { c.color = hex("#f2ece0"); c.glyph = "="; } } }, lid: M.metal("#c3cad2") }, { cam: [1.5, 1.6, 2.6] });
  };
  const TOOL_KINDS = { tool_forestry: "hatchet", tool_fishing: "rod", tool_quarrying: "pickaxe", tool_salvaging: "prybar", tool_trapping: "snare", tool_foraging: "knife", autoeat: "rations" };
  // An offer of the Trader ({group, name}) as "kind@tier".
  function toolKey(o) {
    const first = o.name.split(" ")[0].toLowerCase();
    return `${TOOL_KINDS[o.group] || "rations"}@${o.group === "autoeat" ? (o.name.split(" ").pop() || "I").toLowerCase() : first}`;
  }

  // ------------------------------------------------------- recipe → model
  // Gathering shows where it comes from; making shows what it makes.
  const TREES = { birch: ["#e8e2d4", "#9ccf6a", "round"], pine: ["#7a4a2e", "#3f7a52", "cone"], oak: ["#6e5038", "#5f8f45", "broad"], maple: ["#7a6a5a", "#e07a3a", "round"],
    cedar: ["#a0522d", "#4a7a5a", "layers"], yew: ["#6a3a3a", "#2f5a3e", "cone"], ironwood: ["#5a6470", "#7a9ab0", "broad"], ghostwood: ["#e8f0f6", "#d8f0ff", "round"] };
  function tree(sp) {
    const [bark, leaf, shape] = TREES[sp];
    return model((x, y, z, b, h) => {
      U(b, y + .85 - .04 * noise2(x * 3, z * 3), "ground", h);
      U(b, sd.capsule(x, y, z, 0, -.85, 0, 0, shape === "cone" ? .2 : .05, 0, shape === "broad" ? .12 : .08), "trunk", h);
      if (shape === "cone") U(b, Math.min(sd.cone(x, y + .5, z, .55, .85), sd.cone(x, y + .1, z, .42, .75), sd.cone(x, y - .25, z, .28, .6)), "leaf", h);
      else if (shape === "layers") for (let k = 0; k < 4; k++) U(b, sd.cyl(x, y + .35 - k * .28, z, .6 - k * .12, .09) + .02 * noise2(x * 8, z * 8), "leaf", h);
      else U(b, sd.sphere(x / (shape === "broad" ? 1.25 : 1), (y - .32) / (shape === "broad" ? .8 : 1), z, .5) * .8 + .07 * noise2(x * 6 + y * 3, z * 6), "leaf", h);
    }, { ground: { color: hex("#3f5a40"), ramp: " .,:;'", shade(c) { c.alpha = .55; } },
      trunk: { color: hex(bark), ramp: RAMP.wood, shade(c) { if (sp === "birch" && noise2(c.y * 9, c.x * 9) > .7) c.color = hex("#2e2a26"); } },
      leaf: { ...M.noisy(leaf, mix(hex(leaf), [20, 30, 20], .4).map(Math.round).reduce((s, v) => s + v.toString(16).padStart(2, "0"), "#"), sp === "pine" || sp === "yew" ? " .^^AA%#" : RAMP.leaf), ...(sp === "ghostwood" ? { shade(c) { c.emit = .75; } } : {}) } },
      { cam: [1.5, .9, 2.8], at: [0, -.05, 0], fov: 46 });
  }
  function scene(kind, color) {
    // Salvage sites, rocks, game, signal masts and the hearth.
    const ground = { color: hex("#4a4a40"), ramp: " .,:;'", shade(c) { c.alpha = .55; } };
    const parts = {
      wreck: (x, y, z, b, h) => { U(b, y + .6, "ground", h); U(b, sd.rbox(x, y + .3, z, .8, .2, .4, .06), "rust", h); U(b, sd.rbox(x + .1, y, z, .45, .16, .36, .06), "rust", h); for (const [wx, wz] of [[-.5, .4], [.5, .4]]) U(b, sd.torus(x - wx, y + .45, z - wz, .14, .06), "dark", h); },
      house: (x, y, z, b, h) => { U(b, y + .7, "ground", h); U(b, sd.box(x, y + .25, z, .55, .45, .4), "wall", h); U(b, sd.roof(x, y - .2, z, .7, .5, .45), "roofm", h); U(b, sd.box(x, y + .35, z - .41, .12, .2, .01), "dark", h); },
      shop: (x, y, z, b, h) => { U(b, y + .7, "ground", h); U(b, sd.box(x, y + .2, z, .65, .5, .38), "wall", h); U(b, sd.box(x, y - .38, z - .4, .5, .1, .02), "sign", h); U(b, sd.box(x, y + .35, z - .39, .4, .18, .01), "glassm", h); },
      pump: (x, y, z, b, h) => { U(b, y + .7, "ground", h); U(b, sd.rbox(x, y + .15, z, .22, .55, .18, .04), "sign", h); U(b, sd.box(x, y - .12, z - .19, .14, .1, .01), "glassm", h); U(b, sd.capsule(x, y, z, .22, .1, 0, .45, -.2, 0, .03), "dark", h); U(b, sd.box(x - .5, y - .45, z, .9, .04, .5), "wall", h); for (const s of [-1, 1]) U(b, sd.cyl(x - .5 - s * .8, y + .7, z, .04, 1.15), "wall", h); },
      racks: (x, y, z, b, h) => { U(b, y + .7, "ground", h); for (const ox of [-.45, 0, .45]) { U(b, sd.box(x - ox, y + .1, z, .18, .6, .3), "dark", h); } },
      rock: (x, y, z, b, h) => { U(b, y + .6, "ground", h); U(b, sd.sphere(x, y + .15, z, .7) + .15 * noise2(x * 3 + 2, y * 3 + z * 2), "rockm", h); },
      mast: (x, y, z, b, h) => { U(b, y + .8, "ground", h); for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) U(b, sd.capsule(x, y, z, sx * .35, -.8, sz * .35, sx * .04, .8, sz * .04, .025), "steel", h); U(b, sd.sphere(x, y - .85, z, .07), "beacon", h); },
      fire: (x, y, z, b, h) => { U(b, y + .5, "ground", h); for (const a of [0, 2.1, 4.2]) U(b, sd.capsule(x, y, z, Math.cos(a) * .4, -.42, Math.sin(a) * .4, -Math.cos(a) * .15, -.2, -Math.sin(a) * .15, .08), "logm", h); U(b, sd.cone(x, y + .45, z, .32, .7), "flame", h); },
    };
    return model(parts[kind], { ground, rust: M.noisy("#9a5a42", "#6b4a3a", RAMP.metal), dark: M.solid("#2e2c2a"), wall: M.noisy("#a89a88", "#7a6e60"), roofm: M.solid("#7a3a2e"),
      sign: M.solid(color || "#c8553d"), glassm: { color: hex("#9fd0d8"), shade(c) { c.emit = .6; c.glyph = ":"; } }, steel: M.metal("#c0c6cc"), beacon: { color: hex(color || "#ff4a3a"), shade(c) { c.emit = 1; c.glyph = "@"; } },
      rockm: { color: hex("#7d766c"), ramp: RAMP.solid, shade(c) { if (noise2(c.x * 8 + 3, c.y * 8 + c.z * 5) > .66) { c.color = hex(color); c.glyph = "◆"; } } },
      logm: M.solid("#6e5038", RAMP.wood), flame: { color: [255, 170, 80], ramp: " .'^*", shade(c) { c.emit = .85; c.glyph = noise2(c.x * 9, c.y * 9) > .5 ? "^" : "*"; c.color = mix([255, 224, 130], [235, 80, 40], clamp(c.y * 1.6 + .5)); } } },
      { cam: [1.6, 1, 2.7], at: [0, -.1, 0], fov: 44 });
  }
  const SITE = { wreck: ["wreck"], house: ["house"], hardware: ["shop", "#c8a040"], pharmacy: ["shop", "#3a9a5a"], electronics: ["shop", "#4a7ac8"], depot: ["pump", "#c8553d"], hospital: ["shop", "#e8e8e8"], datacentre: ["racks"] };
  const ANIMALS = { rabbit: ["#c8ae90", .5], pheasant: ["#c8703a", .55], deer: ["#b87a4a", 1], boar: ["#8a6e58", .9], elk: ["#a8845e", 1.15], muskox: ["#7a6450", 1.1] };
  function animal(kind) {
    const [color, s] = ANIMALS[kind];
    if (kind === "pheasant") return model((x, y, z, b, h) => { U(b, y + .55, "ground", h); U(b, sd.sphere(x / 1.3, y + .05, z, .3), "body", h); U(b, sd.capsule(x, y, z, .3, .05, 0, .45, .4, 0, .07), "body", h); U(b, sd.sphere(x - .5, y - .45, z, .1), "head", h); U(b, sd.capsule(x, y, z, -.3, .05, 0, -.95, .3, 0, .03), "tail", h); for (const lz of [-.08, .08]) U(b, sd.capsule(x, y, z, 0, -.25, lz, 0, -.55, lz, .02), "dark", h); },
      { ground: { color: hex("#4a5a40"), ramp: " .,:;'", shade(c) { c.alpha = .55; } }, body: M.noisy(color, "#e8c870"), head: M.solid("#2a5a4a"), tail: M.solid("#c8a060"), dark: M.solid("#3a2a20") }, { fov: 42 });
    return model((x, y, z, b, h) => {
      U(b, y + .6, "ground", h);
      const X = x / s, Y = (y + .6) / s, Z = z / s;
      U(b, sd.capsule(X, Y, Z, -.3, .5, 0, .3, .52, 0, kind === "rabbit" ? .2 : .16) * s, "body", h);
      U(b, sd.sphere(X - .45, Y - .62, Z, .13) * s, "body", h);
      if (kind === "rabbit") for (const lz of [-.05, .05]) U(b, sd.capsule(X, Y, Z, .42, .72, lz, .38, 1.05, lz * 1.6, .035) * s, "body", h);
      if (kind === "deer" || kind === "elk") for (const lz of [-.06, .06]) { U(b, sd.capsule(X, Y, Z, .42, .72, lz, .36, 1.05, lz * 3, .018) * s, "antler", h); if (kind === "elk") U(b, sd.capsule(X, Y, Z, .38, .9, lz * 2, .5, 1.05, lz * 3.5, .015) * s, "antler", h); }
      if (kind === "boar") U(b, sd.capsule(X, Y, Z, .55, .58, .06, .64, .68, .06, .02) * s, "antler", h);
      for (const [lx, lz] of [[-.22, .08], [.22, .08], [-.22, -.08], [.22, -.08]]) U(b, sd.capsule(X, Y, Z, lx, 0, lz, lx, kind === "rabbit" ? .3 : .45, lz, .045) * s, "body", h);
    }, { ground: { color: hex("#4a5a40"), ramp: " .,:;'", shade(c) { c.alpha = .55; } }, body: kind === "muskox" ? { color: hex(color), ramp: RAMP.fur, shade(c) { c.glyph = noise2(c.x * 20, c.y * 20) > .5 ? "\"" : "%"; } } : M.noisy(color, mix(hex(color), [20, 16, 12], .35).map(Math.round).reduce((s2, v) => s2 + v.toString(16).padStart(2, "0"), "#")),
      antler: M.solid("#e8dcc0") }, { cam: [1.3, .9, 2.9], at: [0, -.1, 0], fov: 42 });
  }
  function forRecipe(r) {
    let m;
    if ((m = r.id.match(/^tree_(\w+)$/))) return tree(m[1]);
    if ((m = r.id.match(/^salvage_(\w+)$/))) return scene(...SITE[m[1]]);
    if ((m = r.id.match(/^quarry_(\w+)$/))) return ORE[m[1]] && ORE[m[1]][1] !== "crystal" && m[1] !== "clay" ? scene("rock", ORE[m[1]][0]) : forItem(m[1]);
    if ((m = r.id.match(/^trap_(\w+)$/))) return animal(m[1]);
    if ((m = r.id.match(/^burn_(\w+)$/))) return scene("fire");
    if ((m = r.id.match(/^scan_(\w+)$/))) return scene("mast", BAND[m[1]]);
    const out = Object.keys(r.outputs || {})[0] || r.fragment;
    return out ? forItem(out) : forItem("scrap_metal");
  }

  // ------------------------------------------------------------ buildings
  // Each building grows with its level (0 = foundations, 10 = complete).
  function building(id, L) {
    const g = .55 + Math.min(10, L) * .045, k = L / 10;
    const ground = { color: hex("#4a5a42"), ramp: " .,:;'", shade(c) { c.alpha = .55; } };
    const parts = {
      garden(x, y, z, b, h) {
        U(b, y + .02, "ground", h);
        const beds = Math.max(1, Math.min(5, 1 + Math.floor(L / 2)));
        for (let r = 0; r < beds; r++) { const bz = z - (r - (beds - 1) / 2) * .34; U(b, sd.box(x, y - .06, bz, .62 * g, .07, .12), "soil", h); if (L) U(b, sd.box(x, y - .15, bz, .58 * g, .03, .09) + .03 * noise2(x * 14, bz * 9), "crop", h); }
        if (L >= 5) U(b, Math.max(sd.roof(x, y - .02, z, .75 * g, .95, .7 * g), -sd.roof(x, y - .02, z, .7 * g, .9, .65 * g)), "glass", h);
        if (L >= 8) U(b, sd.cyl(x - .8, y, z + .7, .08, .5), "post", h);
      },
      well(x, y, z, b, h) {
        U(b, y + .02, "ground", h);
        U(b, Math.max(sd.cyl(x, y, z, .38 * g, .35 + k * .1), -sd.cyl(x, y - .05, z, .3 * g, .6)), L ? "stone" : "outline", h);
        if (L) U(b, sd.cyl(x, y - .2, z, .3 * g, .02), "water", h);
        if (L >= 2) { for (const s of [-1, 1]) U(b, sd.cyl(x - s * .36 * g, y, z, .03, .95), "post", h); U(b, sd.roof(x, y - .92, z, .55 * g, .35, .3), "roof", h); U(b, sd.capsule(x, y, z, -.36 * g, .72, 0, .36 * g, .72, 0, .03), "post", h); }
        if (L >= 6) U(b, sd.box(x + .6, y - .25, z + .3, .18, .25, .18), "barrel", h);
      },
      lumber(x, y, z, b, h) {
        U(b, y + .02, "ground", h);
        const n = Math.max(1, Math.min(6, 1 + Math.floor(L / 2)));
        for (let i = 0; i < n; i++) { const row = Math.floor(i / 3), col = i % 3; U(b, sd.capsule(x, y, z, -.55 * g, .1 + row * .17, (col - 1) * .17, .55 * g, .1 + row * .17, (col - 1) * .17, .085), "log", h); }
        if (L >= 3) U(b, sd.cyl(x + .75, y, z - .45, .17, .22), "stump", h);
        if (L >= 6) { U(b, sd.box(x - .2, y - .55, z - .6, .6, .03, .3), "roof", h); for (const s of [-1, 1]) U(b, sd.cyl(x - .2 - s * .55, y, z - .6, .03, .55), "post", h); }
      },
      salvage(x, y, z, b, h) {
        U(b, y + .02, "ground", h);
        if (!L) { U(b, Math.max(sd.box(x, y, z, .55, .03, .4), -sd.box(x, y, z, .5, .1, .35)), "outline", h); return; }
        U(b, sd.box(x, y - .28 * g, z, .5 * g, .28 * g, .36 * g), "shed", h); U(b, sd.roof(x, y - .56 * g, z, .62 * g, .44 * g, .25), "tin", h);
        U(b, sd.box(x, y - .3 * g, z - .37 * g, .2 * g, .2 * g, .01), "door", h);
        for (let i = 0; i < Math.min(6, 2 + L); i++) U(b, sd.sphere(x + .75 * g + (i % 2) * .15, y - .08 - Math.floor(i / 2) * .1, z - .3 + (i % 3) * .2, .1), "scrap", h);
        if (L >= 5) U(b, sd.box(x - .7 * g, y - .2, z + .1, .2, .2, .25), "bench", h);
      },
      solar(x, y, z, b, h) {
        U(b, y + .02, "ground", h);
        const n = Math.max(1, Math.min(4, Math.ceil(L / 3)));
        if (!L) { U(b, Math.max(sd.box(x, y, z, .55, .03, .4), -sd.box(x, y, z, .5, .1, .35)), "outline", h); return; }
        for (let i = 0; i < n; i++) { const pz = z - (i - (n - 1) / 2) * .36; U(b, sd.box(x, y - .3 + x * .35, pz, .55 * g, .02, .14) * .9, "panel", h); U(b, sd.cyl(x, y, pz, .025, .28), "post", h); }
        if (L >= 7) U(b, sd.box(x + .8, y - .2, z, .12, .2, .14), "battery", h);
      },
      clinic(x, y, z, b, h) {
        U(b, y + .02, "ground", h);
        if (!L) { U(b, Math.max(sd.box(x, y, z, .55, .03, .4), -sd.box(x, y, z, .5, .1, .35)), "outline", h); return; }
        U(b, sd.box(x, y - .3 * g, z, .5 * g, .3 * g, .38 * g), "white", h); U(b, sd.roof(x, y - .6 * g, z, .58 * g, .44 * g, .25), "roof", h);
        U(b, sd.box(x, y - .38 * g, z - .39 * g, .1, .025, .01), "cross", h); U(b, sd.box(x, y - .38 * g, z - .39 * g, .025, .1, .01), "cross", h);
        if (L >= 5) U(b, sd.box(x + .6 * g, y - .22 * g, z, .18 * g, .22 * g, .3 * g), "white", h);
        if (L >= 8) U(b, Math.max(sd.roof(x - .7 * g, y, z, .3, .3, .35), -y), "tent", h);
      },
      archive(x, y, z, b, h) {
        U(b, y + .02, "ground", h);
        if (!L) { U(b, Math.max(sd.box(x, y, z, .55, .03, .4), -sd.box(x, y, z, .5, .1, .35)), "outline", h); return; }
        U(b, sd.box(x, y - .32 * g, z, .42 * g, .32 * g, .36 * g), "brick", h); U(b, sd.box(x, y - .66 * g, z, .46 * g, .03, .4 * g), "roof", h);
        const mh = .5 + L * .09;
        U(b, sd.cyl(x + .25, y - .66 * g, z, .022, mh), "mast", h);
        for (let i = 1; i <= Math.min(4, 1 + Math.floor(L / 3)); i++) U(b, sd.capsule(x, y, z, .25 - .12, .66 * g + mh * i / 5, 0, .25 + .12, .66 * g + mh * i / 5, 0, .012), "mast", h);
        U(b, sd.sphere(x + .25, y - .66 * g - mh, z, .05), "beacon", h);
        if (L >= 6) U(b, Math.max(sd.sphere(x - .3, y - .72 * g, z, .18), -(y - .7 * g)), "dish", h);
      },
      hearth(x, y, z, b, h) {
        U(b, y + .02, "ground", h);
        U(b, Math.max(sd.torus(x, z, y - .08, .34 * g, .09), -y), L ? "stone" : "outline", h);
        if (!L) return;
        for (const a of [0, 2.1, 4.2]) U(b, sd.capsule(x, y, z, Math.cos(a) * .26 * g, .04, Math.sin(a) * .26 * g, -Math.cos(a) * .06, .2, -Math.sin(a) * .06, .05), "log", h);
        U(b, sd.cone(x, y, z, .22 * g, .32 + L * .04), "fire", h);
        if (L >= 4) for (const a of [.6, 2.7, 4.8]) U(b, sd.box(x - Math.cos(a) * .75, y - .12, z - Math.sin(a) * .75, .2, .07, .07), "bench", h);
        if (L >= 8) for (const a of [1.6, 3.7]) U(b, sd.cyl(x - Math.cos(a) * .95, y, z - Math.sin(a) * .95, .03, .7), "lamp", h);
      },
    };
    return model(parts[id], { ground, outline: { color: hex("#c8b48a"), ramp: " .:", shade(c) { c.glyph = ":"; c.emit = .8; } },
      soil: M.solid("#9a7450", RAMP.solid), crop: { color: hex("#8fc06a"), ramp: RAMP.leaf, shade(c) { c.glyph = hash2(Math.floor(c.x * 30), Math.floor(c.z * 30)) > .6 ? "✿" : "\""; c.color = hash2(Math.floor(c.x * 12), 3) > .5 ? hex("#a6d07a") : hex("#e0c070"); } },
      glass: { color: hex("#c8eee6"), ramp: " .:+", shade(c) { c.alpha = .55; } }, post: M.solid("#8a6a4a", RAMP.wood), stone: M.noisy("#9a9286", "#7a7268"),
      water: { color: hex("#4a90b0"), shade(c, t) { c.emit = .7 + .2 * Math.sin(t * 2 + c.x * 9); c.glyph = Math.sin(t * 2 + c.x * 12 + c.z * 9) > 0 ? "~" : "≈"; } },
      roof: M.solid("#8a4a3a"), barrel: M.solid("#7a5a3a", RAMP.wood), log: M.noisy("#a8805a", "#7a5a3a", RAMP.wood), stump: { color: hex("#b58e5e"), ramp: RAMP.wood, shade(c) { if (c.ny > .8) c.glyph = "o"; } },
      shed: M.noisy("#8a8072", "#6a6258"), tin: M.metal("#a8b0b8"), door: M.solid("#4a3a2e"), scrap: M.metal("#a8a49c"), bench: M.solid("#7a5a3e", RAMP.wood),
      panel: { color: hex("#3c6a9a"), ramp: RAMP.metal, shade(c, t) { c.glyph = "#"; if (Math.sin(c.x * 4 + c.z * 3 + t * 1.2) > .93) { c.color = [230, 240, 255]; c.emit = .95; c.glyph = "✦"; } } },
      battery: M.solid("#e0c060"), white: M.solid("#e2ded2"), cross: { color: [220, 60, 60], shade(c) { c.emit = .95; c.glyph = "+"; } }, tent: M.solid("#d8c8a0", RAMP.cloth),
      brick: { color: hex("#a8603e"), ramp: RAMP.solid, shade(c) { if (Math.abs((c.y * 9) % 1) < .12) c.color = hex("#6a3a2a"); } }, mast: M.metal("#c0c6cc"), dish: M.metal("#d0d6dc"),
      beacon: { color: [255, 80, 60], shade(c, t) { c.emit = Math.sin(t * 2.6) > 0 ? 1 : .35; c.glyph = "@"; } },
      fire: { color: [255, 170, 80], ramp: " .'^*", shade(c, t) { const n = noise2(c.x * 9 + t * 3, c.y * 9 - t * 8); c.emit = .6 + .4 * n; c.glyph = n > .6 ? "*" : n > .4 ? "^" : "'"; c.color = mix([255, 224, 130], [235, 80, 40], clamp(c.y * 2 + n * .3)); } },
      lamp: { color: [255, 210, 120], shade(c) { c.emit = .9; } } },
      { cam: [1.6, 1.25, 2.6], zoom: .92, ambient: .62,
        particles: id === "hearth" && L ? (t, put) => { for (let i = 0; i < 8; i++) { const p = (t * .35 + i / 8) % 1; put(Math.sin(i * 3 + t) * .1, .3 + p * .9, 0, p < .5 ? "*" : "·", mix([255, 220, 120], [220, 80, 40], p), .9 * (1 - p)); } }
          : id === "salvage" && L ? (t, put) => { for (let i = 0; i < 5; i++) { const p = (t * .2 + i / 5) % 1; put(.1 + p * .2, .7 + p * .8, 0, "°", [200, 200, 206], .5 * (1 - p)); } } : null });
  }

  // ---------------------------------------------------------- image cache
  // Pictures are rendered once (one per animation frame, so nothing
  // stutters) into canvases kept in memory, then copied into a small canvas
  // in each placeholder: no image encoding and no loads through the page.
  const cache = new Map(), queue = [], waiting = new Map();
  let pumping = false;
  const font = () => getComputedStyle(document.documentElement).getPropertyValue("--font").trim() || "monospace";
  function pump() {
    pumping = true;
    const start = performance.now();
    while (queue.length && performance.now() - start < 10) {
      const [key, build, size, cell] = queue.shift();
      if (cache.has(key)) continue;
      let pic = null;
      try { const sc = build(); pic = A.still({ ...sc, shadows: sc.shadows !== false && size >= 140 }, size, size, { cell, font: font(), dpr: 1 }); } catch { pic = null; }
      cache.set(key, pic);
      for (const el of waiting.get(key) || []) apply(el, pic);
      waiting.delete(key);
    }
    if (queue.length) requestAnimationFrame(pump); else pumping = false;
  }
  function apply(el, pic) {
    if (!pic || !el.isConnected) return;
    const c = document.createElement("canvas");
    c.width = pic.width; c.height = pic.height;
    c.getContext("2d").drawImage(pic, 0, 0);
    el.textContent = ""; el.appendChild(c); el.classList.add("ready");
  }
  function request(el, key, build, size, cell) {
    if (cache.has(key)) return apply(el, cache.get(key));
    if (!waiting.has(key)) { waiting.set(key, []); queue.push([key, build, size, cell]); }
    waiting.get(key).push(el);
    if (!pumping) requestAnimationFrame(pump);
  }
  // Fill every [data-art] placeholder inside root. Pictures for what's on
  // screen go first.
  function fill(root) {
    const els = [...root.querySelectorAll("[data-art]:not(.ready)")];
    const vh = innerHeight;
    els.sort((a, b) => Math.abs(a.getBoundingClientRect().top - vh / 3) - Math.abs(b.getBoundingClientRect().top - vh / 3));
    for (const el of els) {
      const [kind, id] = el.dataset.art.split(":"), size = +el.dataset.size || 64;
      const key = `${kind}:${id}:${size}`;
      const cell = size >= 140 ? 6 : size >= 80 ? 5 : 4;
      if (kind === "item") request(el, key, () => forItem(id), size, cell);
      else if (kind === "recipe" && window.UmbraOutpostModels.recipes) request(el, key, () => forRecipe(window.UmbraOutpostModels.recipes[id]), size, cell);
      else if (kind === "building") { const [b, lv] = id.split("@"); request(el, key, () => building(b, +lv), size, cell); }
      else if (kind === "tool") { const [k, tier] = id.split("@"); request(el, key, () => F.tool(k, tier), size, cell); }
      else if (window.UmbraBeings?.has(kind)) request(el, key, () => window.UmbraBeings.scene(kind, id), size, cell);
    }
  }

  // Building blocks for outpost-beings.js (creatures, people, companions).
  const kit = { model, fit, M, RAMP, METALS, WOODS, LEATHERS, shade, LIFT, U };
  return { forItem, forRecipe, building, fill, spin, recipes: null, toolKey, kit, tool: (key) => { const [k, tier] = key.split("@"); return F.tool(k, tier); },
    // A live, turning view for the hover box.
    live(canvas, id) { return A.view(canvas, spin(forItem(id)), { cell: 5, font: font() }); } };
})();
