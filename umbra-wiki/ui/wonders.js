// Umbra Wiki maps: WONDERS. Twenty-eight landmarks of the world, built and
// natural, each a small 3D diorama in characters with its own sky and its own
// life: the Eiffel Tower sparkles, Kukulcán's serpent of light slides down
// El Castillo, a plume streams from Everest, mist and a rainbow rise over
// Victoria Falls, petals fall by Fuji, Uluru glows from ochre to purple…
// On the map they stand as small swaying models; hover one to see it turn,
// click it for its file: a large live model, the numbers, the story, and
// where it is. Everything is drawn here; nothing goes online.
// Loaded before maps.js, which places them (UmbraWonders.attach/layout).
"use strict";

window.UmbraWonders = (() => {
  const A = window.Ascii3D, { sd, rotY, noise2, hash2 } = A;
  const hex = A.hex, mix = A.mix;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smin = (a, b, k) => { const h = clamp(0.5 + (0.5 * (b - a)) / k); return b + (a - b) * h - k * h * (1 - h); };
  const U = (b, d, m, h) => { if (d < b[0]) { b[0] = d; h.m = m; } };
  const motion = () => !document.body.classList.contains("reduce-motion");
  const font = () => getComputedStyle(document.documentElement).getPropertyValue("--font").trim() || "monospace";
  const R = { stone: " .:-=+*#%@", soft: " .,:;=+*#", leaf: " .,;:%&@", water: " .-~≈", snow: " .:-=+*", sand: " .:;=+*#" };

  // ------------------------------------------------------------ helpers
  const solid = (c, ramp = R.stone) => ({ color: hex(c), ramp });
  const tone = (c1, c2, sc = 3, ramp = R.stone) => { const a = hex(c1), b = hex(c2); return { color: a, ramp, shade(c) { c.color = mix(a, b, noise2(c.x * sc + c.z * sc * 0.7, c.y * sc)); } }; };
  const glow = (c, glyph, pulse = 0) => { const col = hex(c); return { color: col, shade(c2, t) { c2.emit = 0.85 + pulse * Math.sin(t * 5 + c2.x * 9); if (glyph) c2.glyph = glyph; } }; };
  const water = (deep, light, speed = 1) => { const a = hex(deep), b = hex(light); return { color: a, ramp: R.water, shade(c, t) {
    const n = noise2(c.x * 2.2 + t * 0.25 * speed, c.z * 3.4 - t * 0.18 * speed) * 0.7 + 0.3 * noise2(c.x * 5 - t * 0.4 * speed, c.z * 6);
    c.glyph = n > 0.66 ? "≈" : n > 0.46 ? "~" : "-"; c.color = mix(a, b, n); } }; };
  const leaf = (c1, c2) => { const a = hex(c1), b = hex(c2); return { color: a, ramp: R.leaf, shade(c) { c.color = mix(a, b, noise2(c.x * 7, c.y * 7 + c.z * 5)); } }; };
  // The ground every diorama stands on: a round tile, its side in layers.
  const SOIL = { color: hex("#5a4636"), ramp: R.stone, shade(c) { c.color = mix(hex("#3e3026"), hex("#7a5e44"), 0.5 + 0.5 * Math.sin(c.y * 40 + noise2(c.x * 4, c.z * 4) * 3)); c.glyph = Math.abs(Math.sin(c.y * 40)) < 0.25 ? "=" : null; } };
  function tile(x, y, z, b, h, top = "ground", R0 = 2.05) {
    const d = sd.cyl(x, y + 0.35, z, R0, 0.35);
    if (d < b[0]) { b[0] = d; h.m = y < -0.03 ? "soil" : top; }
  }
  function land(x, y, z, b, h, Hf, top = "ground", R0 = 2.05, k = 0.5) {
    const d = Math.max((y - Hf(x, z)) * k, Math.hypot(x, z) - R0, -(y + 0.35));
    if (d < b[0]) { b[0] = d; h.m = Math.hypot(x, z) > R0 - 0.02 && y < Hf(x, z) - 0.03 ? "soil" : top; }
  }
  const pyramid = (x, y, z, w, hh) => Math.max((Math.max(Math.abs(x), Math.abs(z)) * hh + y * w - w * hh) / Math.hypot(hh, w), -y);
  const ell = (x, y, z, rx, ry, rz) => (Math.hypot(x / rx, y / ry, z / rz) - 1) * Math.min(rx, ry, rz);
  const onion = (x, y, z, r) => smin(sd.sphere(x, y, z, r), sd.cone(x, y - r * 0.55, z, r * 0.55, r * 1.35), r * 0.25);
  const sun = (put, x, y, z, col = [255, 210, 140], size = 20) => { put(x, y, z, "●", col, 0.9, size); put(x, y, z, "○", col, 0.35, size * 1.8); };
  function birds(put, t, n, cx, cy, cz, rad = 1.6, col = [30, 30, 36]) {
    for (let i = 0; i < n; i++) { const a = t * (0.32 + i * 0.05) + i * 2.3; put(cx + Math.cos(a) * (rad + i * 0.2), cy + Math.sin(a * 2 + i) * 0.12 + i * 0.05, cz + Math.sin(a) * (rad * 0.6), Math.sin(t * 7 + i) > 0 ? "v" : "^", col, 0.85); }
  }
  function clouds(put, t, y, n, spread = 3, col = [230, 234, 240], a = 0.45, speed = 0.08) {
    for (let i = 0; i < n; i++) { const p = ((t * speed + i / n) % 1) * 2 - 1; const z = -1.4 + (i % 4) * 0.9, yy = y + (hash2(i, 3) - 0.5) * 0.35;
      for (let k = -2; k <= 2; k++) put(p * spread + k * 0.12, yy + Math.abs(k) * -0.02, z, k ? "≈" : "≋", col, a * (1 - Math.abs(p)) * (1 - Math.abs(k) * 0.18)); }
  }
  const stars = (u, v, t, col, row) => (hash2(col, row) > 0.985 && v < 0.6 ? [hash2(col + 1, row) > 0.85 ? "*" : "·", [215, 222, 245], 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(t * (1 + hash2(col, row)) + col))] : null);

  // ------------------------------------------------------------- models
  // Each: map(x, y, z, t, h), materials, particles; cam {r, h, at, fov}, bg.
  const M = {};
  M.giza = () => ({
    bg: ["#24170c", "#d0884a", 0.7, 0.5], cam: { r: 4.6, h: 2.0, at: [0.35, 0.55, 0.4] },
    map(x, y, z, t, h) { const b = [99, ""];
      land(x, y, z, b, h, (px, pz) => 0.05 * noise2(px * 1.4, pz * 1.4), "sand");
      U(b, pyramid(x + 0.35, y, z + 0.25, 0.85, 1.08), "lime", h);
      U(b, pyramid(x - 0.8, y, z - 0.55, 0.72, 0.98), "lime2", h);
      U(b, pyramid(x - 1.35, y, z - 1.2, 0.38, 0.5), "lime", h);
      // The Sphinx, keeping watch.
      U(b, Math.min(sd.rbox(x - 0.15, y - 0.07, z - 1.25, 0.08, 0.07, 0.2, 0.03), sd.rbox(x - 0.15, y - 0.17, z - 1.4, 0.06, 0.06, 0.05, 0.02)), "sphinx", h);
      for (let i = 0; i < 3; i++) U(b, sd.box(x - 1.5 + i * 0.2, y - 0.04, z - 0.6, 0.06, 0.04, 0.06), "lime", h);
      return b[0]; },
    materials: { soil: SOIL, sand: tone("#c9a46a", "#e8c88a", 2, R.sand),
      lime: { color: hex("#d9b77a"), ramp: R.stone, shade(c) { c.glyph = Math.floor(c.y * 30) % 2 ? "=" : null; c.color = mix(hex("#b8955e"), hex("#e8cf98"), noise2(c.x * 6, c.y * 9 + c.z * 4)); } },
      lime2: { color: hex("#d9b77a"), ramp: R.stone, shade(c) { if (c.y > 0.78) { c.color = hex("#f4ead2"); c.glyph = null; } else { c.glyph = Math.floor(c.y * 30) % 2 ? "=" : null; c.color = mix(hex("#b8955e"), hex("#e0c590"), noise2(c.x * 6, c.y * 9)); } } },
      sphinx: tone("#c8a26e", "#a8824e", 8) },
    particles(t, put) { sun(put, -2.8, 2.2, -5); birds(put, t, 3, 0, 1.9, -0.5, 1.8);
      for (let i = 0; i < 12; i++) { const p = (t * 0.25 + i / 12) % 1; put(-2 + p * 4, 0.05 + 0.15 * Math.sin(p * 9 + i), 1.4 - (i % 5) * 0.6, "·", [230, 200, 150], 0.5 * Math.sin(p * Math.PI)); } },
  });
  M.wall = () => {
    const path = (x) => 0.55 * Math.sin(x * 1.3 + 0.4), T = (x, z) => 0.38 + 0.32 * Math.sin(x * 1.1) * Math.cos(z * 0.9) + 0.12 * noise2(x * 1.6, z * 1.6) - 0.25 * Math.abs(z - path(x)) ** 1.5;
    return { bg: ["#1c2632", "#e0a07a", 0.65, 0.5], cam: { r: 4.4, h: 2.1, at: [0, 0.55, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        land(x, y, z, b, h, T, "hill", 2.05, 0.45);
        const pz = path(x), top = T(x, pz) + 0.2 + (((x * 9) % 1 + 1) % 1 < 0.5 ? 0.05 : 0);
        if (Math.abs(x) < 2.05) U(b, Math.max((Math.abs(z - pz) - 0.07) * 0.7, y - top, Math.hypot(x, z) - 2.02), "wall", h);
        for (const tx of [-1.45, -0.35, 0.75, 1.65]) { const tz = path(tx), ty = T(tx, tz); U(b, Math.max(sd.box(x - tx, y - ty - 0.2, z - tz, 0.12, 0.26, 0.12), Math.hypot(x, z) - 2.02), "tower", h); U(b, pyramid(x - tx, y - ty - 0.46, z - tz, 0.15, 0.12), "roofr", h); }
        return b[0]; },
      materials: { soil: SOIL, hill: leaf("#3f6e40", "#7a9a52"), wall: { color: hex("#c0ae8c"), ramp: R.stone, shade(c) { c.color = mix(hex("#a8987a"), hex("#d8c8a4"), noise2(c.x * 8, c.y * 8)); if (Math.abs(((c.y * 24) % 1)) < 0.2) c.glyph = "="; } },
        tower: tone("#b8a684", "#d8c8a4", 6), roofr: solid("#8a3a2e") },
      particles(t, put) { sun(put, 3, 1.4, -6, [255, 190, 130], 22); birds(put, t, 4, 0, 1.7, -0.6, 2);
        for (let i = 0; i < 18; i++) { const p = (t * 0.05 + i / 18) % 1; put(-2.2 + p * 4.4, 0.35 + (i % 3) * 0.12, 1.2 - (i % 6) * 0.55, "≈", [235, 225, 220], 0.28 * Math.sin(p * Math.PI)); } },
    };
  };
  M.petra = () => ({
    bg: ["#1a1018", "#d07a5a", 0.7, 0.45], cam: { r: 4.9, h: 1.3, at: [0, 0.95, -0.4], swing: 0.55 },
    map(x, y, z, t, h) { const b = [99, ""];
      tile(x, y, z, b, h, "sand");
      const cliff = Math.max(sd.box(x, y - 1.2, z + 0.85, 2.0, 1.25, 0.7) + 0.06 * noise2(x * 3, y * 3), -sd.box(x, y - 1.05, z + 0.1, 0.95, 1.05, 0.25), Math.hypot(x, z) - 2.04);
      U(b, cliff, "rock", h);
      for (let i = 0; i < 6; i++) U(b, sd.cyl(x + 0.75 - i * 0.3, y, z + 0.1, 0.055, 0.88), "col", h);
      U(b, sd.box(x, y - 0.95, z + 0.12, 0.88, 0.07, 0.1), "carve", h); U(b, Math.max(sd.roof(x, y - 1.02, z + 0.12, 0.88, 0.1, 0.2), 0), "carve", h);
      U(b, sd.cyl(x, y - 1.25, z + 0.18, 0.17, 0.42), "col", h); U(b, sd.cone(x, y - 1.67, z + 0.18, 0.2, 0.18), "carve", h); U(b, sd.sphere(x, y - 1.9, z + 0.18, 0.04), "carve", h);
      for (const s of [-1, 1]) { U(b, sd.cyl(x - s * 0.55, y - 1.25, z + 0.12, 0.04, 0.42), "col", h); U(b, sd.box(x - s * 0.62, y - 1.7, z + 0.12, 0.2, 0.03, 0.08), "carve", h); U(b, sd.cyl(x - s * 0.82, y - 1.25, z + 0.12, 0.04, 0.42), "col", h); }
      U(b, sd.box(x, y - 0.32, z + 0.18, 0.13, 0.32, 0.03), "door", h);
      return b[0]; },
    materials: { soil: SOIL, sand: tone("#c98e6a", "#e0aa84", 2, R.sand),
      rock: { color: hex("#c97a5e"), ramp: R.stone, shade(c) { const band = 0.5 + 0.5 * Math.sin(c.y * 9 + noise2(c.x * 2, c.y * 2) * 3); c.color = mix(hex("#a85a4a"), hex("#e3a07e"), band); } },
      col: { color: hex("#e2a484"), ramp: R.stone, shade(c) { c.glyph = Math.abs(Math.sin(Math.atan2(c.z, c.x) * 10)) < 0.3 ? "|" : null; } }, carve: tone("#d8947a", "#eab494", 9),
      door: { color: [24, 12, 10], shade(c) { c.glyph = " "; } } },
    particles(t, put) { for (let i = 0; i < 3; i++) { const p = (t * 0.6 + i / 3) % 1; put(-0.25 + i * 0.25, 0.68 + p * 0.25, 0.25, p < 0.5 ? "*" : "·", [255, 190, 110], 0.8 * (1 - p)); }
      for (let i = 0; i < 10; i++) { const p = (t * 0.07 + i / 10) % 1; put(-1.6 + p * 3.2, 0.3 + Math.sin(i + t) * 0.3 + i * 0.08, 0.9, "·", [230, 180, 150], 0.35 * Math.sin(p * Math.PI)); } },
  });
  M.colosseum = () => ({
    bg: ["#1d2436", "#e0b07a", 0.65, 0.45], cam: { r: 4.4, h: 2.2, at: [0, 0.45, 0] },
    map(x, y, z, t, h) { const b = [99, ""];
      tile(x, y, z, b, h, "paving");
      const a = Math.atan2(z, x), top = a > -2.2 && a < -0.5 ? 0.62 + 0.18 * noise2(a * 6, 1) : 1.02;
      const e = (Math.hypot(x / 1.45, z / 1.15) - 1) * 1.15;
      U(b, Math.max(Math.abs(e) - 0.13, y - top), "trav", h);
      U(b, Math.max(Math.abs(e + 0.32) - 0.05, y - 0.32), "trav", h);
      U(b, Math.max((Math.hypot(x / 1.0, z / 0.72) - 1) * 0.72, y - 0.06), "arena", h);
      return b[0]; },
    materials: { soil: SOIL, paving: tone("#8a8478", "#a8a294", 6), arena: tone("#c8a46e", "#a88454", 5, R.sand),
      trav: { color: hex("#d8c49a"), ramp: R.stone, shade(c) {
        const a = Math.atan2(c.z / 1.15, c.x / 1.45), col = (((a / (2 * Math.PI)) * 40) % 1 + 1) % 1, lv = c.y / 0.25, f = lv % 1;
        c.color = mix(hex("#bca67c"), hex("#ecdcb4"), noise2(c.x * 5, c.y * 7));
        if (lv < 3 && col > 0.2 && col < 0.8 && f > 0.18 && f < 0.78 - Math.abs(col - 0.5) * 0.3 && Math.hypot(c.x / 1.45, c.z / 1.15) > 1.0) { c.color = hex("#3a2e22"); c.glyph = "∩"; }
        else if (lv >= 3 && Math.abs(col - 0.5) < 0.12 && f > 0.3 && f < 0.7) { c.color = hex("#4a3e30"); c.glyph = "▪"; } } } },
    particles(t, put) { birds(put, t, 5, 0, 1.6, 0, 1.4); sun(put, -3, 2.0, -5.5, [255, 200, 140], 16); },
  });
  M.chichen = () => {
    const step = (x, y, z) => { let d = 99; for (let i = 0; i < 9; i++) { const w = 0.95 - i * 0.065; d = Math.min(d, sd.box(x, y - (i + 0.5) * 0.105, z, w, 0.0525, w)); } return d; };
    return { bg: ["#1a2030", "#e8a060", 0.62, 0.45], cam: { r: 4.4, h: 1.7, at: [0, 0.6, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        tile(x, y, z, b, h, "grass");
        U(b, step(x, y, z), "stone", h);
        // A stair up the middle of each side.
        for (const [lx, lz] of [[x, z], [x, -z], [z, x], [z, -x]]) U(b, Math.max(Math.abs(lx) - 0.17, (y + (lz - 0.38) * 1.532 - 0.95) * 0.546, -y, 0.3 - lz, lz - 1.02), "stair", h);
        U(b, sd.box(x, y - 1.08, z, 0.28, 0.14, 0.28), "temple", h); U(b, sd.box(x, y - 1.05, z - 0.27, 0.07, 0.1, 0.03), "door", h);
        for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.3, r = 1.65 + (i % 3) * 0.12; U(b, sd.sphere(x - Math.cos(a) * r, y - 0.28, z - Math.sin(a) * r, 0.22) + 0.05 * noise2(x * 9, y * 9), "jungle", h); }
        return b[0]; },
      materials: { soil: SOIL, grass: tone("#4f7a3e", "#6f9a4a", 3, R.leaf), jungle: leaf("#2f6a3a", "#5f9a4a"), door: { color: [20, 16, 12], shade(c) { c.glyph = " "; } },
        stone: { color: hex("#b8ab8a"), ramp: R.stone, shade(c, t) {
          c.color = mix(hex("#9c9078"), hex("#d0c4a2"), noise2(c.x * 6, c.y * 8 + c.z * 3));
          // Kukulcán: triangles of light slide down the north stair's side.
          if (c.nx > 0.6 && c.z > 0.2 && c.z < 0.9 && motion()) { const k = ((c.y * 5 - c.z * 2 + t * 0.35) % 1 + 1) % 1; if (k < 0.5) { c.emit = 0.95; c.color = hex("#ffd890"); c.glyph = "▲"; } } } },
        stair: { color: hex("#c8bc9c"), ramp: R.stone, shade(c) { c.glyph = Math.floor(c.y * 38) % 2 ? "=" : "-"; } }, temple: tone("#b0a284", "#d0c4a2", 8) },
      particles(t, put) { birds(put, t, 4, 0, 1.8, 0, 1.6); sun(put, 3.2, 1.2, -5, [255, 180, 120], 22); },
    };
  };
  M.machu = () => {
    const peak = (x, z) => 2.2 * Math.max(0, 1 - Math.hypot(x + 0.15, (z + 1.15) * 1.1) / 0.85) ** 1.25 + 0.25 * noise2(x * 3, z * 3) * Math.max(0, 1 - Math.hypot(x, z + 1.15) / 1.2);
    const ridge = (x, z) => 0.55 + 0.1 * noise2(x * 2, z * 2) - 0.18 * Math.max(0, Math.hypot(x * 0.6, z) - 0.9);
    return { bg: ["#2c3a46", "#b0c4c4", 0.65, 0.5], cam: { r: 4.4, h: 1.6, at: [0, 0.9, -0.3] },
      map(x, y, z, t, h) { const b = [99, ""];
        land(x, y, z, b, h, (px, pz) => Math.max(peak(px, pz), Math.max(0.05, ridge(px, pz)) - (Math.hypot(px, pz) > 1.7 ? (Math.hypot(px, pz) - 1.7) * 1.2 : 0)), "slope", 2.05, 0.4);
        // Terraces stepping down the ridge, and the stone houses.
        for (let i = 0; i < 6; i++) U(b, Math.max(sd.box(x, y - (0.5 - i * 0.07), z - (0.25 + i * 0.13), 1.1 - i * 0.04, 0.035, 0.07), Math.hypot(x, z) - 2), "terrace", h);
        for (let i = 0; i < 7; i++) { const hx = -0.75 + i * 0.25, hz = -0.15 + (i % 2) * 0.22; U(b, sd.box(x - hx, y - 0.62, z - hz, 0.08, 0.07, 0.06), "house", h); U(b, Math.max(sd.roof(x - hx, y - 0.69, z - hz, 0.08, 0.06, 0.08), 0), i % 3 ? "thatch" : "house", h); }
        return b[0]; },
      materials: { soil: SOIL, slope: { color: hex("#4f7a46"), ramp: R.leaf, shade(c) { c.color = c.ny < 0.55 ? mix(hex("#6a6a62"), hex("#8a8a80"), noise2(c.x * 6, c.y * 6)) : mix(hex("#3f6e40"), hex("#7aa052"), noise2(c.x * 5, c.z * 5)); } },
        terrace: { color: hex("#8a8a78"), ramp: R.stone, shade(c) { if (c.ny > 0.7) { c.color = hex("#7aa052"); c.glyph = "\""; } } }, house: tone("#a8a494", "#c8c4b4", 9), thatch: solid("#b89a5a", R.soft) },
      particles(t, put) { clouds(put, t, 1.15, 7, 2.6, [236, 240, 244], 0.55, 0.05); clouds(put, t + 30, 0.55, 5, 2.6, [236, 240, 244], 0.35, 0.04); birds(put, t, 2, 0, 2.4, -1, 1.2); },
    };
  };
  M.taj = () => ({
    bg: ["#221c34", "#eaa8a0", 0.62, 0.5], cam: { r: 4.4, h: 1.5, at: [0, 0.75, 0.1] },
    map(x, y, z, t, h) { const b = [99, ""];
      tile(x, y, z, b, h, "garden");
      U(b, sd.box(x, y - 0.06, z, 1.25, 0.06, 1.15), "marble", h);
      U(b, Math.max(sd.box(x, y - 0.55, z, 0.55, 0.45, 0.55), (Math.abs(x) + Math.abs(z)) * 0.707 - 0.62), "marble", h);
      U(b, sd.cyl(x, y - 1.0, z, 0.3, 0.2), "marble", h);
      U(b, onion(x, y - 1.42, z, 0.36), "dome", h); U(b, sd.capsule(x, y, z, 0, 1.8, 0, 0, 2.05, 0, 0.012), "gold", h);
      for (const [cx, cz] of [[0.38, 0.38], [-0.38, 0.38], [0.38, -0.38], [-0.38, -0.38]]) { U(b, sd.cyl(x - cx, y - 1.0, z - cz, 0.07, 0.12), "marble", h); U(b, onion(x - cx, y - 1.17, z - cz, 0.08), "dome", h); }
      for (const [cx, cz] of [[1.08, 1.0], [-1.08, 1.0], [1.08, -1.0], [-1.08, -1.0]]) { U(b, sd.cyl(x - cx, y - 0.12, z - cz, 0.055 - (y - 0.12) * 0.008, 1.15), "marble", h); for (const ry of [0.5, 0.85, 1.2]) U(b, sd.cyl(x - cx, y - ry, z - cz, 0.075, 0.025), "marble", h); U(b, onion(x - cx, y - 1.32, z - cz, 0.065), "dome", h); }
      U(b, sd.box(x, y - 0.02, z - 1.65, 0.14, 0.03, 0.42), "pool", h);
      for (const s of [-1, 1]) for (let i = 0; i < 4; i++) U(b, sd.cone(x - s * 0.32, y - 0.02, z - (1.3 + i * 0.2), 0.06, 0.3), "cypress", h);
      return b[0]; },
    materials: { soil: SOIL, garden: tone("#4f7a3e", "#6f9a4a", 4, R.leaf), cypress: leaf("#1f4a2e", "#3f6e40"), gold: glow("#e8c060"),
      marble: { color: hex("#f2eee4"), ramp: R.stone, shade(c) { c.color = mix(hex("#e4d8cc"), hex("#fff8f0"), clamp(0.5 + c.nx * 0.3 + c.nz * 0.2)); const fx = Math.abs(c.x), fz = Math.abs(c.z);
        if (c.y > 0.2 && c.y < 0.88 && ((fx < 0.17 && Math.abs(c.z) > 0.5) || (fz < 0.17 && Math.abs(c.x) > 0.5)) && (c.y < 0.62 + 0.26 * (1 - (Math.min(fx, fz) / 0.17) ** 2))) { c.color = hex("#8a7a70"); c.glyph = "∩"; } } },
      dome: { color: hex("#f6f2ea"), ramp: R.stone, shade(c, t) { c.color = mix(hex("#e8dcd4"), hex("#ffffff"), clamp(0.4 + c.nx * 0.4)); if (c.nx > 0.65 && c.ny > 0.3 && motion() && Math.sin(t * 0.7) > 0.8) { c.emit = 1; c.glyph = "✦"; } } },
      pool: water("#3a6a8a", "#c0d8e8", 0.6) },
    particles(t, put) { sun(put, 3, 1.1, -5, [255, 200, 170], 22); birds(put, t, 3, 0, 1.9, 0, 1.7); },
  });
  M.christ = () => {
    const H = (x, z) => 1.35 * Math.max(0, 1 - Math.hypot(x, z) / 1.85) ** 1.15 + 0.1 * noise2(x * 3, z * 3);
    return { bg: ["#141c34", "#ec8a52", 0.62, 0.5], cam: { r: 4.3, h: 1.9, at: [0, 1.35, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        land(x, y, z, b, h, H, "forest", 2.05, 0.45);
        const top = H(0, 0);
        U(b, sd.box(x, y - top - 0.1, z, 0.12, 0.12, 0.12), "stone", h);
        U(b, sd.cone(x, y - top - 0.2, z, 0.14, 0.7), "statue", h);
        U(b, sd.capsule(x, y, z, 0, top + 0.5, 0, 0, top + 0.78, 0, 0.065), "statue", h);
        U(b, sd.capsule(x, y, z, -0.42, top + 0.74, 0, 0.42, top + 0.74, 0, 0.038), "statue", h);
        U(b, sd.sphere(x, y - top - 0.88, z, 0.058), "statue", h);
        for (let i = 0; i < 6; i++) { const a = i * 1.1 + 0.4, r = 1.7; U(b, sd.box(x - Math.cos(a) * r, y - 0.08, z - Math.sin(a) * r, 0.05, 0.08 + (i % 3) * 0.04, 0.05), "city", h); }
        return b[0]; },
      materials: { soil: SOIL, forest: { color: hex("#3f6e40"), ramp: R.leaf, shade(c) { c.color = c.ny < 0.45 ? mix(hex("#6a6460"), hex("#8a847a"), noise2(c.x * 6, c.y * 6)) : mix(hex("#2f5e38"), hex("#5f8e4a"), noise2(c.x * 6, c.z * 6)); } },
        stone: tone("#9a968c", "#b8b4a8", 9), statue: { color: hex("#ece8dc"), ramp: R.stone, shade(c) { c.color = mix(hex("#c8c4b8"), hex("#ffffff"), clamp(0.5 + c.nx * 0.45)); } },
        city: glow("#f0c070", "▪", 0.1) },
      particles(t, put) { sun(put, -3.4, 1.4, -5, [255, 170, 110], 26); clouds(put, t, 0.75, 8, 2.4, [240, 236, 236], 0.5, 0.06); birds(put, t, 3, 0, 2.3, 0, 1.3); },
    };
  };
  M.stonehenge = () => {
    const gone = new Set([3, 7, 8, 12, 19, 23, 24, 27]);
    return { bg: ["#1a2034", "#f0b878", 0.6, 0.5], cam: { r: 4.3, h: 1.9, at: [0, 0.35, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        tile(x, y, z, b, h, "grass");
        const r = Math.hypot(x, z), a = Math.atan2(z, x);
        if (r > 0.95 && r < 1.5 && y < 1.1) {
          const k = Math.round(a / ((2 * Math.PI) / 30)), ak = k * ((2 * Math.PI) / 30), kk = ((k % 30) + 30) % 30;
          const tg = r * Math.sin(a - ak), rd = r * Math.cos(a - ak) - 1.2;
          if (!gone.has(kk)) U(b, sd.box(tg, y - 0.42, rd, 0.075, 0.42, 0.055) + 0.01 * noise2(x * 20, y * 20), "sarsen", h);
          if (!gone.has(kk) && !gone.has((kk + 1) % 30) && kk % 3) U(b, Math.max(Math.abs(r - 1.2) - 0.05, Math.abs(y - 0.89) - 0.045), "sarsen", h);
        }
        if (r < 0.95 && y < 1.3) for (let i = 0; i < 5; i++) { const ta = Math.PI * 0.5 + (i - 2) * 0.62, cx = Math.cos(ta) * 0.62, cz = Math.sin(ta) * 0.62; const [lx, lz] = rotY(x - cx, z - cz, -ta + Math.PI / 2);
          U(b, Math.min(sd.box(lx - 0.1, y - 0.55, lz, 0.065, 0.55, 0.05), sd.box(lx + 0.1, y - 0.55, lz, 0.065, 0.55, 0.05), sd.box(lx, y - 1.15, lz, 0.2, 0.05, 0.055)), "sarsen", h); }
        U(b, sd.box(x - 1.3, y - 0.04, z - 0.6, 0.35, 0.04, 0.07), "sarsen", h);
        U(b, sd.box(x, y - 0.3, z - 1.75, 0.08, 0.3, 0.07), "sarsen", h);
        return b[0]; },
      materials: { soil: SOIL, grass: tone("#5f8a46", "#86a85a", 3, R.leaf),
        sarsen: { color: hex("#a8a49a"), ramp: R.stone, shade(c) { const n = noise2(c.x * 9, c.y * 9 + c.z * 5); c.color = n > 0.68 ? hex("#8a9a6a") : mix(hex("#8a867c"), hex("#c4c0b4"), n); } } },
      // The sun rises over the Heel Stone.
      particles(t, put) { const p = motion() ? ((t * 0.03) % 1) : 0.4; sun(put, 0, -0.2 + p * 1.6, -5.5, mix([255, 150, 90], [255, 230, 170], p), 26); birds(put, t, 4, 0, 1.6, 0, 1.6); },
    };
  };
  M.eiffel = () => ({
    bg: ["#04060e", "#1e2848", 0.7, 0.55], cam: { r: 4.6, h: 1.5, at: [0, 1.05, 0] }, sky: stars,
    map(x, y, z, t, h) { const b = [99, ""];
      tile(x, y, z, b, h, "champ");
      if (y < 2.45 && Math.abs(x) < 0.8 && Math.abs(z) < 0.8) {
        const k = clamp(y / 2.2), s = 0.6 * (1 - k) ** 1.7 + 0.025, th = 0.065 * (1 - k * 0.8) + 0.012;
        if (y < 1.55) U(b, Math.max(Math.hypot(Math.abs(x) - s, Math.abs(z) - s) - th, -y) * 0.6, "iron", h);
        else U(b, Math.max(sd.box(x, y - 1.55, z, s + th * 0.7, 99, s + th * 0.7), -(y - 1.5), y - 2.2) * 0.8, "iron", h);
        U(b, Math.max(Math.abs(x) - 0.47, Math.abs(z) - 0.47, Math.abs(y - 0.56) - 0.035), "deck", h);
        U(b, Math.max(Math.abs(x) - 0.24, Math.abs(z) - 0.24, Math.abs(y - 1.12) - 0.03), "deck", h);
        U(b, Math.max(Math.abs(x) - 0.09, Math.abs(z) - 0.09, Math.abs(y - 2.0) - 0.04), "deck", h);
        U(b, sd.capsule(x, y, z, 0, 2.0, 0, 0, 2.42, 0, 0.012), "iron", h);
        for (const [ax, az] of [[1, 0], [0, 1]]) { const lx = ax ? z : x, lz = ax ? x : z; U(b, Math.max(Math.abs(Math.abs(lz) - 0.46) - 0.03, Math.abs(Math.hypot(lx, y - 0.05) - 0.43) - 0.025, -(y - 0.1), y - 0.52), "iron", h); }
      }
      return b[0]; },
    materials: { soil: SOIL, champ: { color: hex("#3f5a3a"), ramp: R.leaf, shade(c) { c.color = Math.abs(c.x) < 0.25 || Math.abs(c.z) < 0.1 ? hex("#8a8070") : mix(hex("#2f4a30"), hex("#4f6a40"), noise2(c.x * 5, c.z * 5)); } },
      deck: glow("#e8b04a", "=", 0.05),
      // Golden lights; for a few seconds each half-minute it sparkles.
      iron: { color: hex("#c08a40"), ramp: R.stone, shade(c, t) {
        c.color = mix(hex("#8a5a2a"), hex("#ffcc66"), 0.55 + 0.45 * Math.sin(c.y * 3));
        c.glyph = ((c.y + Math.abs(c.x) + Math.abs(c.z)) * 22) % 1 < 0.5 ? "x" : "+"; c.emit = 0.5 + 0.12 * c.y;
        if (motion() && t % 30 < 6 && hash2(Math.floor(c.y * 60 + c.x * 40), Math.floor(t * 9 + c.z * 30)) > 0.86) { c.color = [255, 255, 255]; c.glyph = "*"; c.emit = 1; } } } },
    // The beacon at the top sweeps the night.
    particles(t, put) { const a = t * 0.8; for (let i = 1; i < 14; i++) put(Math.cos(a) * i * 0.2, 2.44, Math.sin(a) * i * 0.2, "·", [255, 240, 200], 0.6 * (1 - i / 14));
      put(0, 2.45, 0, "✦", [255, 250, 220], 0.95); },
  });
  M.angkor = () => {
    const tower = (x, y, z, cx, cz, y0, hh, r0) => { if (y < y0 - 0.05 || y > y0 + hh + 0.1) return 99; const k = clamp((y - y0) / hh), r = r0 * (1 - k ** 1.6) * (1 + 0.07 * Math.sin(y * 48)); return Math.max((Math.hypot(x - cx, z - cz) - r) * 0.7, y0 - y, y - y0 - hh); };
    return { bg: ["#2a1c38", "#f0a85a", 0.6, 0.5], cam: { r: 4.4, h: 1.6, at: [0, 0.75, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        tile(x, y, z, b, h, "moat");
        U(b, sd.box(x, y - 0.06, z, 1.45, 0.06, 1.25), "lawn", h);
        U(b, sd.box(x, y - 0.06, z - 1.6, 0.14, 0.06, 0.45), "sand", h);
        for (let i = 0; i < 3; i++) U(b, sd.box(x, y - (0.17 + i * 0.12), z, 0.95 - i * 0.2, 0.06, 0.8 - i * 0.17), "sand", h);
        U(b, tower(x, y, z, 0, 0, 0.47, 1.4, 0.24), "sand", h);
        for (const [cx, cz] of [[0.42, 0.36], [-0.42, 0.36], [0.42, -0.36], [-0.42, -0.36]]) U(b, tower(x, y, z, cx, cz, 0.47, 0.95, 0.15), "sand", h);
        return b[0]; },
      materials: { soil: SOIL, moat: water("#2a4a5a", "#e8a070", 0.5), lawn: tone("#4f7a3e", "#6f9a4a", 4, R.leaf),
        sand: { color: hex("#8a8270"), ramp: R.stone, shade(c) { const n = noise2(c.x * 7, c.y * 7 + c.z * 4); c.color = n > 0.72 ? hex("#5a6a48") : mix(hex("#6e6656"), hex("#b0a68c"), n); if (Math.abs(Math.sin(c.y * 48)) > 0.85) c.glyph = "="; } } },
      particles(t, put) { sun(put, 0, 1.35, -5.5, [255, 170, 100], 30); birds(put, t, 4, 0, 1.9, 0, 1.6); },
    };
  };
  M.moai = () => {
    const moai = (x, y, z, hat) => { let d = Math.min(sd.rbox(x, y - 0.42, z, 0.1, 0.42, 0.075, 0.03), sd.rbox(x, y - 0.92, z - 0.01, 0.085, 0.17, 0.08, 0.03), sd.capsule(x, y, z, 0, 0.92, 0.075, 0, 0.82, 0.11, 0.025), sd.box(x, y - 1.03, z - 0.07, 0.085, 0.022, 0.03));
      if (hat) d = Math.min(d, sd.cyl(x, y - 1.09, z + 0.01, 0.075, 0.09)); return d; };
    return { bg: ["#18203a", "#f08a5a", 0.6, 0.5], cam: { r: 4.2, h: 1.2, at: [0, 0.7, 0], swing: 0.6, a0: 0 },
      map(x, y, z, t, h) { const b = [99, ""];
        const d0 = sd.cyl(x, y + 0.35, z, 2.05, 0.35);
        if (d0 < b[0]) { b[0] = d0; h.m = y < -0.03 ? "soil" : z < -0.55 ? "sea" : "grass"; }
        U(b, sd.box(x, y - 0.06, z + 0.15, 1.35, 0.07, 0.17), "ahu", h);
        for (let i = 0; i < 7; i++) U(b, moai(x + 1.05 - i * 0.35, y - 0.12, z + 0.15, i === 2 || i === 5), i === 2 || i === 5 ? "moai" : "moai", h);
        return b[0]; },
      materials: { soil: SOIL, sea: water("#2a5a7a", "#f0a080", 1.2), grass: tone("#5a7a46", "#7a9a52", 3, R.leaf), ahu: tone("#6a645c", "#8a847a", 9),
        moai: { color: hex("#7a7064"), ramp: R.stone, shade(c) { c.color = c.y > 1.17 ? hex("#a0503a") : mix(hex("#5e564c"), hex("#9a9080"), noise2(c.x * 12, c.y * 12)); } } },
      particles(t, put) { sun(put, 0.5, 0.45, -5.5, [255, 160, 100], 30); birds(put, t, 3, 0, 1.6, -0.8, 1.7);
        for (let i = 0; i < 10; i++) { const p = (t * 0.2 + i / 10) % 1; put(-2 + i * 0.42, 0.02, -0.65 - p * 1.2, "~", [255, 255, 255], 0.6 * (1 - p)); } },
    };
  };
  M.liberty = () => ({
    bg: ["#121a30", "#e2925a", 0.62, 0.5], cam: { r: 4.2, h: 1.4, at: [0, 1.05, 0] },
    map(x, y, z, t, h) { const b = [99, ""];
      const d0 = sd.cyl(x, y + 0.35, z, 2.05, 0.35);
      if (d0 < b[0]) { b[0] = d0; h.m = y < -0.03 ? "soil" : Math.hypot(x, z) < 1.05 ? "lawn" : "harbor"; }
      const [rx, rz] = rotY(x, z, Math.PI / 4);
      U(b, Math.max(Math.min(sd.box(x, y - 0.1, z, 0.6, 0.1, 0.6), sd.box(rx, y - 0.1, rz, 0.6, 0.1, 0.6)), -y), "fort", h);
      U(b, sd.box(x, y - 0.5, z, 0.22, 0.3, 0.22), "granite", h); U(b, sd.box(x, y - 0.83, z, 0.17, 0.04, 0.17), "granite", h);
      U(b, sd.cone(x, y - 0.87, z, 0.14, 0.72), "copper", h);
      U(b, sd.capsule(x, y, z, 0, 1.05, 0, 0, 1.42, 0, 0.07), "copper", h); U(b, sd.sphere(x, y - 1.52, z, 0.055), "copper", h);
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.35; U(b, sd.capsule(x, y, z, 0, 1.56, 0, Math.sin(a) * 0.1, 1.62 + Math.cos(a) * 0.02, -Math.cos(a) * 0.03 + 0.02, 0.008), "copper", h); }
      U(b, sd.capsule(x, y, z, 0.05, 1.38, 0, 0.11, 1.78, 0.02, 0.028), "copper", h); U(b, sd.cone(x - 0.11, y - 1.78, z - 0.02, 0.04, 0.06), "copper", h);
      U(b, sd.cone(x - 0.11, y - 1.84, z - 0.02, 0.025, 0.07 + 0.015 * Math.sin(t * 9)), "flame", h);
      U(b, sd.box(x + 0.09, y - 1.22, z - 0.05, 0.03, 0.06, 0.02), "copper", h);
      return b[0]; },
    materials: { soil: SOIL, harbor: water("#1e3e5a", "#e09a6a", 1), lawn: tone("#4f7a3e", "#6f9a4a", 4, R.leaf), fort: tone("#9a9284", "#b8b0a0", 8), granite: tone("#a8a090", "#c8c0b0", 10),
      copper: { color: hex("#6fb59e"), ramp: R.stone, shade(c) { c.color = mix(hex("#4f9580"), hex("#9fdcc4"), clamp(0.45 + c.nx * 0.4 + c.ny * 0.15)); } }, flame: glow("#ffc04a", "^", 0.15) },
    particles(t, put) { for (let i = 0; i < 4; i++) { const p = (t * 1.1 + i / 4) % 1; put(0.11, 1.9 + p * 0.2, 0.02, "*", [255, 210, 120], 1 - p); }
      for (let i = 0; i < 2; i++) { const a = t * 0.15 + i * 3; put(Math.cos(a) * 1.55, 0.06, Math.sin(a) * 1.55, "▬", [230, 230, 230], 0.9); } birds(put, t, 3, 0, 1.8, 0, 1.5, [230, 230, 236]); },
  });
  M.opera = () => {
    const sail = (x, y, z, cx, s, tilt) => { const [lx, ly] = [x - cx, y - 0.18]; const d = Math.abs(sd.sphere(lx + 0.35 * s, ly + 0.15 * s, z * 1.6, 0.62 * s)) - 0.03 * s; return Math.max(d, -(ly), -(lx + tilt * s), lx - 0.3 * s, Math.abs(z) - 0.32 * s); };
    return { bg: ["#121c34", "#7ab0d8", 0.62, 0.45], cam: { r: 4.4, h: 1.5, at: [0, 0.5, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        const d0 = sd.cyl(x, y + 0.35, z, 2.05, 0.35);
        if (d0 < b[0]) { b[0] = d0; h.m = y < -0.03 ? "soil" : "harbor"; }
        U(b, sd.box(x + 0.1, y - 0.09, z, 1.25, 0.09, 0.5), "podium", h);
        for (const [cx, s] of [[-0.65, 1], [-0.1, 0.85], [0.42, 0.62]]) { U(b, sail(x, y, z - 0.18, cx, s, 0.05), "shell", h); U(b, sail(x, y, z + 0.2, cx + 0.1, s * 0.82, 0.05), "shell", h); }
        // The Harbour Bridge across the back.
        const bx = x + 0.6, bz = z + 1.55;
        if (Math.abs(bz) < 0.2) { U(b, Math.max(Math.abs(Math.hypot(bx, y + 0.35) - 1.05) - 0.03, Math.abs(bz) - 0.08, -y), "steel", h); U(b, sd.box(bx, y - 0.33, bz, 1.3, 0.025, 0.09), "steel", h); }
        return b[0]; },
      materials: { soil: SOIL, harbor: water("#1e4a6a", "#9ad0e8", 1), podium: tone("#b8a07a", "#d0b890", 6),
        shell: { color: hex("#f4f2ec"), ramp: R.stone, shade(c) { c.color = mix(hex("#d8d4c8"), hex("#ffffff"), clamp(0.5 + c.nx * 0.4)); c.glyph = ((c.y * 18 + c.z * 18) % 1 + 1) % 1 < 0.5 ? "^" : "/"; } }, steel: tone("#6a6e74", "#8a9098", 9) },
      particles(t, put) { for (let i = 0; i < 2; i++) { const a = (t * 0.09 + i * 0.5) % 1; put(-2 + a * 4, 0.05, 1.2 - i * 0.4, "▰", [240, 220, 120], 0.9); } birds(put, t, 4, 0, 1.6, 0, 1.6, [235, 235, 240]); sun(put, 3, 2.5, -5, [255, 240, 200], 18); },
    };
  };
  M.parthenon = () => {
    const cols = [];
    for (let i = 0; i < 8; i++) for (const zz of [-0.4, 0.4]) cols.push([-0.84 + i * 0.24, zz]);
    for (let i = 1; i < 4; i++) for (const xx of [-0.84, 0.84]) cols.push([xx, -0.4 + i * 0.2]);
    const broken = new Set([4, 9, 21]);
    const H = (x, z) => Math.hypot(x, z) < 1.5 ? 0.35 : 0.35 - (Math.hypot(x, z) - 1.5) * 0.6 + 0.08 * noise2(x * 4, z * 4);
    return { bg: ["#2a4a7a", "#d8e4ec", 0.65, 0.45], cam: { r: 4.3, h: 1.6, at: [0, 0.7, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        land(x, y, z, b, h, H, "rock", 2.05, 0.6);
        for (let i = 0; i < 3; i++) U(b, sd.box(x, y - 0.38 - i * 0.03, z, 1.0 - i * 0.04, 0.03, 0.52 - i * 0.04), "marble", h);
        if (Math.abs(x) < 1 && Math.abs(z) < 0.55 && y < 1.3) {
          cols.forEach(([cx, cz], i) => U(b, sd.cyl(x - cx, y - 0.47, z - cz, 0.048, broken.has(i) ? 0.25 : 0.55), "column", h));
          U(b, Math.max(sd.box(x, y - 1.06, z, 0.92, 0.04, 0.46), -sd.box(x + 0.12, y - 1.06, z - 0.4, 0.18, 0.06, 0.08)), "marble", h);
          U(b, Math.max(sd.roof(z, y - 1.1, x, 0.46, 0.92, 0.17), 0.62 - Math.abs(x)), "marble", h);
        }
        return b[0]; },
      materials: { soil: SOIL, rock: { color: hex("#a89a84"), ramp: R.stone, shade(c) { c.color = c.ny > 0.8 ? mix(hex("#b0a48a"), hex("#c8bca0"), noise2(c.x * 5, c.z * 5)) : mix(hex("#8a7c68"), hex("#b0a088"), noise2(c.x * 4, c.y * 6)); } },
        marble: tone("#e4d8bc", "#f4ecd8", 8), column: { color: hex("#efe4c8"), ramp: R.stone, shade(c) { c.glyph = Math.abs(Math.sin(Math.atan2(c.z, c.x) * 10)) < 0.35 ? "|" : null; c.color = mix(hex("#d8c8a4"), hex("#f8f0dc"), clamp(0.5 + c.nx * 0.4)); } } },
      particles(t, put) { sun(put, -3, 2.6, -4, [255, 245, 210], 18); birds(put, t, 4, 0, 1.8, 0, 1.6); },
    };
  };
  M.hagia = () => ({
    bg: ["#1c2238", "#d8a07a", 0.62, 0.5], cam: { r: 4.4, h: 1.6, at: [0, 0.7, 0] },
    map(x, y, z, t, h) { const b = [99, ""];
      tile(x, y, z, b, h, "plaza");
      U(b, sd.box(x, y - 0.4, z, 0.72, 0.4, 0.62), "wall", h);
      for (const s of [-1, 1]) U(b, sd.box(x - s * 0.8, y - 0.55, z, 0.1, 0.55, 0.45), "wall", h);
      U(b, sd.cyl(x, y - 0.8, z, 0.42, 0.12), "wall", h);
      U(b, Math.max(sd.sphere(x, y - 0.88, z, 0.42), 0.9 - y), "lead", h);
      for (const s of [-1, 1]) U(b, Math.max(sd.sphere(x - s * 0.42, y - 0.78, z, 0.28), 0.8 - y, -s * (x - s * 0.3)), "lead", h);
      for (const [cx, cz] of [[0.95, 0.8], [-0.95, 0.8], [0.95, -0.8], [-0.95, -0.8]]) { U(b, sd.cyl(x - cx, y, z - cz, 0.04, 1.25), "minaret", h); U(b, sd.cone(x - cx, y - 1.25, z - cz, 0.05, 0.3), "lead", h); U(b, sd.cyl(x - cx, y - 0.95, z - cz, 0.06, 0.03), "minaret", h); }
      return b[0]; },
    materials: { soil: SOIL, plaza: tone("#8a8478", "#a8a294", 6), wall: { color: hex("#d8a07a"), ramp: R.stone, shade(c) { c.color = mix(hex("#c08868"), hex("#e8b894"), noise2(c.x * 6, c.y * 6)); if (c.y > 0.2 && c.y < 0.65 && Math.abs(Math.sin((c.x + c.z) * 18)) > 0.8) { c.glyph = "∩"; c.color = hex("#6a4a3a"); } } },
      lead: { color: hex("#8a9098"), ramp: R.stone, shade(c) { c.glyph = Math.abs(Math.sin(Math.atan2(c.z, c.x) * 20)) < 0.3 ? "|" : null; } }, minaret: tone("#e0d8c8", "#f4eee0", 9) },
    particles(t, put) { birds(put, t, 6, 0, 1.6, 0, 1.6, [230, 230, 236]); sun(put, 3, 1.2, -5, [255, 190, 140], 22); },
  });
  M.burj = () => ({
    bg: ["#060818", "#2a2648", 0.7, 0.55], cam: { r: 5.0, h: 1.6, at: [0, 1.45, 0] }, sky: stars,
    map(x, y, z, t, h) { const b = [99, ""];
      tile(x, y, z, b, h, "city");
      for (let i = 0; i < 10; i++) { const a = i * 0.63 + 0.2, r = 1.15 + (i % 3) * 0.25; U(b, sd.box(x - Math.cos(a) * r, y - 0.15 - (i % 4) * 0.06, z - Math.sin(a) * r, 0.1, 0.15 + (i % 4) * 0.06, 0.1), "tower", h); }
      U(b, sd.cyl(x - 0.75, y, z - 0.9, 0.35, 0.02), "fountain", h);
      if (Math.abs(x) < 0.7 && Math.abs(z) < 0.7 && y < 3.0) {
        const lvl = Math.floor(clamp(y / 2.4) * 9), L = 0.52 * (1 - lvl / 10.5);
        let d = 99;
        for (const a of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) { const px = Math.cos(a), pz = Math.sin(a), k = clamp(x * px + z * pz, 0, L); d = Math.min(d, Math.hypot(x - px * k, z - pz * k) - 0.075); }
        U(b, Math.max(d, y - 2.4, -y), "glass", h);
        U(b, Math.max(sd.cyl(x, y, z, 0.07, 2.62), y - 2.62), "glass", h);
        U(b, sd.capsule(x, y, z, 0, 2.6, 0, 0, 2.95, 0, 0.012), "spire", h);
      }
      return b[0]; },
    materials: { soil: SOIL, city: tone("#2a2a34", "#3a3a48", 6), fountain: water("#2a4a8a", "#a0d0ff", 2), spire: glow("#e0e8ff", "|"),
      tower: { color: hex("#3a4050"), ramp: R.stone, shade(c, t) { c.glyph = "▪"; c.color = hash2(Math.floor(c.y * 30), Math.floor((c.x + c.z) * 30)) > 0.55 ? [255, 210, 130] : [60, 66, 80]; c.emit = c.color[0] > 200 ? 0.8 : 0.3; } },
      glass: { color: hex("#a8c0d0"), ramp: R.stone, shade(c, t) { const row = Math.floor(c.y * 40); c.color = mix(hex("#8aa8c0"), hex("#e8f4fc"), clamp(0.5 + c.nx * 0.4)); c.glyph = row % 2 ? "=" : "-"; c.emit = 0.55;
        if (hash2(row, Math.floor(Math.atan2(c.z, c.x) * 8 + (motion() ? Math.floor(t * 0.5) : 0))) > 0.82) { c.color = [255, 220, 150]; c.emit = 0.9; } } } },
    // The fountain dances.
    particles(t, put) { for (let i = 0; i < 9; i++) { const ph = t * 2 + i * 0.7, hgt = 0.25 + 0.35 * Math.max(0, Math.sin(ph)); for (let k = 0; k < 4; k++) put(-0.75 + Math.cos(i * 0.7) * 0.25, (hgt * k) / 4, -0.9 + Math.sin(i * 0.7) * 0.25, k === 3 ? "*" : "|", [180, 220, 255], 0.7); }
      put(0, 2.97, 0, "✦", [255, 80, 80], 0.5 + 0.5 * Math.sin(t * 3)); },
  });
  M.basil = () => {
    const DOMES = [[0.42, 0.42, 0.95, 0], [-0.42, 0.42, 0.9, 1], [0.42, -0.42, 0.92, 2], [-0.42, -0.42, 0.88, 3], [0.6, 0, 1.0, 4], [-0.6, 0, 0.96, 5], [0, 0.6, 1.02, 6], [0, -0.6, 0.94, 1]];
    return { bg: ["#121828", "#5a6a8c", 0.62, 0.5], cam: { r: 4.2, h: 1.5, at: [0, 0.85, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        tile(x, y, z, b, h, "snow");
        U(b, sd.box(x, y - 0.25, z, 0.75, 0.25, 0.75), "brick", h);
        U(b, sd.cyl(x, y - 0.5, z, 0.17, 0.7), "brick", h); U(b, sd.cone(x, y - 1.2, z, 0.18, 0.5), "tent", h); U(b, onion(x, y - 1.77, z, 0.07), "gold", h);
        DOMES.forEach(([cx, cz, top, k]) => { U(b, sd.cyl(x - cx, y - 0.5, z - cz, 0.1, top - 0.6), "brick", h); U(b, onion(x - cx, y - top - 0.06, z - cz, 0.13), "d" + k, h); });
        return b[0]; },
      materials: { soil: SOIL, snow: tone("#d8dce4", "#f4f6fa", 4, R.snow), gold: glow("#f0c040", null, 0.1), tent: tone("#3a7a4a", "#5a9a5a", 10),
        brick: { color: hex("#a8402e"), ramp: R.stone, shade(c) { c.color = mix(hex("#8a3020"), hex("#c8604a"), noise2(c.x * 10, c.y * 10)); if (Math.abs((c.y * 14) % 1) < 0.15) { c.color = hex("#e8d8c8"); c.glyph = "="; } } },
        ...Object.fromEntries([["#d8412f", "#2e9e4f"], ["#2f5fd0", "#f2f2f2"], ["#f2cd2f", "#2e9e4f"], ["#d8412f", "#f2cd2f"], ["#2e9e4f", "#f2f2f2"], ["#e8892a", "#2f5fd0"], ["#c0283e", "#f2cd2f"]].map(([a, bb], i) => {
          const c1 = hex(a), c2 = hex(bb);
          return ["d" + i, { color: c1, ramp: R.stone, shade(c) { const ang = Math.atan2(c.z, c.x), k = i % 2 ? Math.sin(ang * 6 + c.y * 30) : Math.sin(ang * 8); c.color = k > 0 ? c1 : c2; c.glyph = k > 0 ? "#" : "="; } }]; })) },
      particles(t, put) { for (let i = 0; i < 26; i++) { const p = (t * 0.08 + hash2(i, 1)) % 1; put(-2 + hash2(i, 2) * 4, 2.6 - p * 2.6, -1.5 + hash2(i, 3) * 3, "*", [240, 244, 255], 0.75); } },
    };
  };
  M.borobudur = () => {
    const rings = [[0.55, 16, 0.86], [0.42, 12, 0.96], [0.3, 8, 1.06]];
    const volcano = (x, z) => 1.7 * Math.max(0, 1 - Math.hypot(x + 1.0, z + 1.5) / 1.1) ** 1.4;
    return { bg: ["#262e38", "#dcb890", 0.62, 0.5], cam: { r: 4.4, h: 1.7, at: [0, 0.6, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        land(x, y, z, b, h, (px, pz) => Math.max(0, volcano(px, pz)), "jungleground", 2.05, 0.5);
        for (let i = 0; i < 6; i++) U(b, sd.box(x, y - (0.06 + i * 0.12), z, 1.15 - i * 0.12, 0.06, 1.15 - i * 0.12), "andesite", h);
        for (let i = 0; i < 3; i++) U(b, sd.cyl(x, y - (0.72 + i * 0.1), z, 0.6 - i * 0.13, 0.1), "andesite", h);
        if (Math.hypot(x, z) < 0.7 && y > 0.75 && y < 1.4) for (const [r, n, yy] of rings) { const a = Math.atan2(z, x), k = Math.round((a / (2 * Math.PI)) * n), ak = (k / n) * 2 * Math.PI; U(b, onion(x - Math.cos(ak) * r, y - yy - 0.06, z - Math.sin(ak) * r, 0.045), "stupa", h); }
        U(b, smin(sd.sphere(x, y - 1.3, z, 0.17), sd.cone(x, y - 1.38, z, 0.06, 0.28), 0.05), "stupa", h);
        for (let i = 0; i < 10; i++) { const a = i * 0.63 + 0.5, r = 1.75; U(b, sd.sphere(x - Math.cos(a) * r, y - 0.25, z - Math.sin(a) * r, 0.24) + 0.05 * noise2(x * 9, y * 9), "trees", h); }
        return b[0]; },
      materials: { soil: SOIL, jungleground: { color: hex("#3f6e40"), ramp: R.leaf, shade(c) { c.color = c.y > 0.5 ? mix(hex("#5a5550"), hex("#7a746c"), noise2(c.x * 4, c.y * 4)) : mix(hex("#2f5e38"), hex("#5f8e4a"), noise2(c.x * 5, c.z * 5)); } },
        trees: leaf("#2a5a32", "#4f8a42"), stupa: tone("#7a7468", "#9a9488", 12),
        andesite: { color: hex("#7a7468"), ramp: R.stone, shade(c) { const n = noise2(c.x * 9, c.y * 9 + c.z * 5); c.color = n > 0.74 ? hex("#5a6a48") : mix(hex("#5e5a50"), hex("#9a9488"), n); if (c.ny < 0.5 && Math.abs(Math.sin((c.x + c.z) * 40)) > 0.85) c.glyph = "▪"; } } },
      // Merapi smokes behind.
      particles(t, put) { for (let i = 0; i < 12; i++) { const p = (t * 0.09 + i / 12) % 1; put(-1.0 + Math.sin(p * 4 + i) * 0.2 + p * 0.6, 1.7 + p * 1.1, -1.5, p < 0.4 ? "o" : "°", [200, 196, 190], 0.55 * (1 - p)); }
        clouds(put, t, 0.35, 6, 2.6, [236, 236, 230], 0.35, 0.04); },
    };
  };
  M.goldengate = () => {
    const cab = (x) => { const ax = Math.abs(x); return ax < 0.9 ? 0.4 + 0.66 * (ax / 0.9) ** 2 : 1.06 - (ax - 0.9) * 0.85; };
    const hills = (x, z) => Math.max(0, 0.5 * (1 - Math.hypot(x - 1.9, z + 0.2) / 0.8) + 0.08 * noise2(x * 4, z * 4)) + Math.max(0, 0.42 * (1 - Math.hypot(x + 1.9, z - 0.3) / 0.7));
    return { bg: ["#181a30", "#f0905e", 0.62, 0.5], cam: { r: 4.4, h: 1.3, at: [0, 0.6, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        const hl = hills(x, z), d0 = Math.max(sd.cyl(x, y + 0.35, z, 2.05, 0.35 + hl), y - hl);
        if (d0 < b[0]) { b[0] = d0 * 0.7; h.m = y < -0.03 && Math.hypot(x, z) > 2.03 ? "soil" : hl > 0.02 ? "headland" : "bay"; }
        U(b, sd.box(x, y - 0.33, z, 1.95, 0.025, 0.09), "orange", h);
        for (const tx of [-0.9, 0.9]) { for (const tz of [-0.09, 0.09]) U(b, sd.box(x - tx, y - 0.57, z - tz, 0.035, 0.57, 0.025), "orange", h); for (const ty of [0.6, 0.85, 1.08]) U(b, sd.box(x - tx, y - ty, z, 0.03, 0.025, 0.1), "orange", h); }
        if (Math.abs(x) < 1.9 && y > 0.3) for (const cz of [-0.09, 0.09]) U(b, Math.hypot((y - cab(x)) * 0.8, z - cz) - 0.014, "orange", h);
        return b[0]; },
      materials: { soil: SOIL, bay: water("#1e3e5a", "#f0a070", 1), headland: leaf("#4a6a3e", "#7a8a52"),
        orange: { color: hex("#c0362c"), ramp: R.stone, shade(c) { c.color = mix(hex("#902a22"), hex("#e8503a"), clamp(0.5 + c.nx * 0.4 + c.nz * 0.2)); } } },
      // Fog rolls in under the towers; car lights cross.
      particles(t, put) { for (let i = 0; i < 22; i++) { const p = (t * 0.04 + i / 22) % 1; put(-2.2 + p * 4.4, 0.45 + (i % 4) * 0.1, -1.2 + (i % 5) * 0.55, "≈", [236, 236, 240], 0.32 * Math.sin(p * Math.PI)); }
        for (let i = 0; i < 6; i++) { const p = (t * 0.12 + i / 6) % 1; put(-1.95 + p * 3.9, 0.37, i % 2 ? 0.04 : -0.04, "•", i % 2 ? [255, 240, 200] : [255, 80, 70], 0.9); } sun(put, -0.4, 0.5, -6, [255, 160, 100], 30); },
    };
  };
  M.everest = () => {
    const H = (x, z) => { const r = Math.hypot(x * 0.95, z * 1.1); let v = 2.0 * Math.max(0, 1 - r / 1.55) ** 1.35; v += 1.05 * Math.max(0, 1 - Math.hypot(x - 0.85, z - 0.35) / 0.7) ** 1.5; v += 0.85 * Math.max(0, 1 - Math.hypot(x + 0.9, z - 0.5) / 0.65) ** 1.5;
      return v + 0.18 * noise2(x * 3, z * 3) * Math.min(1, v) + 0.06 * Math.abs(Math.sin(Math.atan2(z, x) * 3 + r * 4)); };
    return { bg: ["#081430", "#5a8ac0", 0.6, 0.5], cam: { r: 4.6, h: 1.8, at: [0, 0.95, 0] },
      map(x, y, z, t, h) { const b = [99, ""]; land(x, y, z, b, h, H, "massif", 2.05, 0.4); return b[0]; },
      materials: { soil: SOIL, massif: { color: hex("#e8eef4"), ramp: R.snow, shade(c) { const snow = c.y > 0.55 + 0.25 * noise2(c.x * 3, c.z * 3) && c.ny > 0.42;
        c.color = snow ? mix(hex("#c8d4e4"), hex("#ffffff"), clamp(0.4 + c.nx * 0.5)) : c.y < 0.25 ? mix(hex("#5a5248"), hex("#7a7060"), noise2(c.x * 6, c.z * 6)) : mix(hex("#4a4a54"), hex("#7a7a84"), noise2(c.x * 8, c.y * 8)); if (!snow) c.glyph = c.ny < 0.5 ? "/" : null; } } },
      // The summit's plume of snow, blown east by the jet stream.
      particles(t, put) { for (let i = 0; i < 26; i++) { const p = (t * 0.18 + i / 26) % 1; put(0.05 + p * 2.4, 2.02 + p * 0.25 + Math.sin(p * 9 + i) * 0.05, 0.05 + Math.sin(i) * 0.12 * p, p < 0.3 ? "≈" : "~", [245, 248, 255], 0.75 * (1 - p)); }
        clouds(put, t, 0.45, 8, 2.6, [236, 240, 246], 0.45, 0.04); },
    };
  };
  M.canyon = () => {
    const path = (x) => 0.35 * Math.sin(x * 1.2 + 0.5), H = (x, z) => { const d = Math.abs(z - path(x)), k = clamp(1 - d / 1.1), stepk = Math.floor(k * 6) / 6; return 0.55 - 0.95 * (stepk * 0.65 + k * 0.35) + 0.04 * noise2(x * 5, z * 5); };
    return { bg: ["#1e1830", "#f08a4a", 0.62, 0.5], cam: { r: 4.4, h: 2.2, at: [0, 0.1, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        const d = Math.max((y - H(x, z)) * 0.42, Math.hypot(x, z) - 2.05, -(y + 0.55));
        if (d < b[0]) { b[0] = d; h.m = H(x, z) < -0.32 && y < -0.3 ? "river" : "strata"; }
        return b[0]; },
      materials: { river: water("#2a5a6a", "#7ac0c8", 1.5),
        strata: { color: hex("#c8703a"), ramp: R.stone, shade(c) { const bands = [hex("#e8d0a0"), hex("#c8603a"), hex("#a8482e"), hex("#d89a5a"), hex("#8a3a2a"), hex("#e0b080")]; const k = Math.floor((c.y + 0.6) * 9 + noise2(c.x * 2, c.z * 2) * 0.6);
          c.color = c.ny > 0.85 && c.y > 0.45 ? mix(hex("#c89a62"), hex("#e8c890"), noise2(c.x * 5, c.z * 5)) : bands[((k % 6) + 6) % 6]; if (c.ny > 0.85) c.glyph = c.y > 0.45 ? (noise2(c.x * 9, c.z * 9) > 0.6 ? "*" : "=") : ":"; } } },
      particles(t, put) { birds(put, t, 2, 0, 1.2, 0, 1.4, [30, 26, 24]); sun(put, -3, 0.9, -5, [255, 170, 100], 30); },
    };
  };
  M.victoria = () => ({
    bg: ["#1a2a3a", "#a8d0e0", 0.62, 0.45], cam: { r: 4.3, h: 1.4, at: [0, 0.35, 0.2] },
    map(x, y, z, t, h) { const b = [99, ""];
      // The plateau the river crosses, the gorge it falls into, the far side.
      const plateau = Math.max(sd.cyl(x, y + 0.4, z, 2.05, 1.15), z), far = Math.max(sd.cyl(x, y + 0.4, z, 2.05, 0.85), 0.62 - z), floor = sd.cyl(x, y + 0.4, z, 2.05, 0.15);
      const d0 = Math.min(plateau, far, floor);
      if (d0 < b[0]) { b[0] = d0; const top = z < 0.31 ? 0.75 : 0.45; h.m = Math.hypot(x, z) > 2.03 && y < top - 0.02 ? "soil" : y > top - 0.03 ? (z < -0.02 && z > -1.0 && Math.abs(x) < 1.7 ? "river" : "bank") : y < -0.22 ? "pool" : "cliff"; }
      // The curtain of falling water.
      U(b, Math.max(Math.abs(z - 0.03) - 0.035, Math.abs(x) - 1.7, y - 0.76, -(y + 0.25)), "falls", h);
      for (let i = 0; i < 8; i++) { const a = i * 0.8 + 0.3, tx = -1.8 + i * 0.5; U(b, sd.sphere(x - tx, y - 0.95, z + 0.8 + (i % 2) * 0.4, 0.2) + 0.05 * noise2(x * 9, y * 9), "trees", h); }
      return b[0]; },
    materials: { soil: SOIL, cliff: tone("#5a4a3e", "#7a6a58", 6), bank: leaf("#3f6e40", "#6f9a4a"), trees: leaf("#2a5a32", "#5f9a4a"),
      river: { color: hex("#6a8a7a"), ramp: R.water, shade(c, t) { const n = noise2(c.x * 3, c.z * 6 - t * 1.2); c.glyph = n > 0.55 ? "≈" : "~"; c.color = mix(hex("#4a6a5a"), hex("#c8e0d8"), n); } },
      pool: water("#2a4a4a", "#c0e0e0", 2),
      falls: { color: hex("#e8f4f8"), ramp: R.water, shade(c, t) { const k = ((c.y * 9 + (motion() ? t * 2.2 : 0) + hash2(Math.floor(c.x * 30), 1) * 3) % 1 + 1) % 1; c.glyph = k < 0.4 ? "|" : k < 0.7 ? "¦" : ":"; c.color = mix(hex("#a8c8d0"), hex("#ffffff"), k); c.emit = 0.6 + 0.3 * k; } } },
    // Mist rises from the gorge; a rainbow hangs in it.
    particles(t, put) { for (let i = 0; i < 26; i++) { const p = (t * 0.22 + i / 26) % 1; put(-1.7 + hash2(i, 4) * 3.4, -0.2 + p * 1.6, 0.25 + hash2(i, 5) * 0.4, p < 0.5 ? "°" : "·", [236, 244, 248], 0.55 * (1 - p)); }
      const RB = [[230, 70, 70], [240, 150, 60], [240, 220, 80], [90, 200, 110], [80, 140, 230], [150, 90, 210]];
      RB.forEach((col, k) => { for (let i = 0; i <= 16; i++) { const a = Math.PI * (i / 16); put(Math.cos(a) * (0.95 - k * 0.06), 0.15 + Math.sin(a) * (0.95 - k * 0.06), 0.7, "·", col, 0.55); } }); },
  });
  M.reef = () => {
    const reef = (x, z) => noise2(x * 1.6 + 3, z * 1.6) * 0.7 + 0.3 * noise2(x * 5, z * 5);
    return { bg: ["#1e4a7a", "#c8e8f0", 0.62, 0.4], cam: { r: 4.4, h: 2.6, at: [0, 0, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        const d0 = sd.cyl(x, y + 0.35, z, 2.05, 0.35);
        if (d0 < b[0]) { b[0] = d0; h.m = y < -0.03 ? "deep" : "sea"; }
        U(b, Math.max((ell(x - 0.5, y, z - 0.3, 0.42, 0.12, 0.3)), -y), "cay", h);
        for (const [px, pz] of [[0.45, 0.25], [0.65, 0.4]]) { U(b, sd.capsule(x, y, z, px, 0, pz, px + 0.06, 0.38, pz, 0.016), "trunk", h); U(b, ell(x - px - 0.06, y - 0.4, z - pz, 0.16, 0.04, 0.16), "palm", h); }
        const bx = x + 1.0 - (motion() ? 0 : 0), bz = z + 0.5;
        U(b, Math.max(ell(bx, y - 0.02, bz, 0.22, 0.07, 0.07), -(y)), "hull", h); U(b, Math.max(Math.abs(bz) - 0.005, -(bx + 0.02), bx - 0.16 + (y - 0.06) * 0.4, -(y - 0.06), y - 0.45), "sail", h);
        return b[0]; },
      materials: { cay: tone("#f0e0b0", "#fff4d8", 4, R.sand), trunk: solid("#8a6a4a"), palm: leaf("#3f8a4a", "#6fb04a"), hull: solid("#f4f0e8"), sail: solid("#ffffff", " .:-="),
        deep: { color: hex("#1e3a5a"), ramp: R.stone, shade(c) { c.color = mix(hex("#1a3050"), hex("#2a5a7a"), 0.5 + 0.5 * Math.sin(c.y * 30)); } },
        // Corals show through the shallow water: turquoise over sand, colours over reef.
        sea: { color: hex("#3ab0c0"), ramp: R.water, shade(c, t) { const r = reef(c.x, c.z), w = noise2(c.x * 3 + t * 0.3, c.z * 4 - t * 0.2);
          if (r > 0.6) { const cc = [hex("#e8706a"), hex("#f0c050"), hex("#b06ad8"), hex("#6ad89a")][Math.floor(hash2(Math.floor(c.x * 6), Math.floor(c.z * 6)) * 4)]; c.color = mix(cc, hex("#5ad0e0"), 0.35 + 0.2 * w); c.glyph = w > 0.5 ? "*" : "%"; }
          else { c.color = mix(hex("#2a90b0"), hex("#8ae8e8"), clamp(r * 1.3 + w * 0.2)); c.glyph = w > 0.62 ? "≈" : w > 0.45 ? "~" : "-"; } } } },
      // Fish dart in shoals; a turtle glides.
      particles(t, put) { for (let s = 0; s < 3; s++) for (let i = 0; i < 6; i++) { const a = t * (0.5 + s * 0.2) + i * 0.15 + s * 2; put(Math.cos(a) * (0.9 + s * 0.35), 0.01, Math.sin(a) * (0.8 + s * 0.3), "›", [[255, 220, 90], [120, 220, 255], [255, 140, 120]][s], 0.85); }
        const a = t * 0.12; put(Math.cos(a) * 1.3, 0.02, Math.sin(a) * 1.0, "@", [120, 180, 110], 0.9); birds(put, t, 3, 0, 1.4, 0, 1.6, [240, 240, 244]); },
    };
  };
  M.fuji = () => {
    const H = (x, z) => { const r = Math.hypot(x + 0.1, z + 0.55); let v = 1.75 * Math.max(0, 1 - r / 1.75) ** 1.6; if (r < 0.14) v -= (0.14 - r) * 0.6; return v; };
    return { bg: ["#2a2440", "#f0b0b8", 0.62, 0.5], cam: { r: 4.4, h: 1.2, at: [0, 0.75, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        const d0 = Math.max((y - Math.max(H(x, z), z > 0.7 ? 0 : 0.02)) * 0.5, Math.hypot(x, z) - 2.05, -(y + 0.35));
        if (d0 < b[0]) { b[0] = d0; h.m = Math.hypot(x, z) > 2.03 && y < -0.02 ? "soil" : H(x, z) > 0.05 ? "fuji" : z > 0.7 ? "lake" : "shore"; }
        U(b, Math.max(sd.box(x, y + 0.01, z - 1.3, 2.0, 0.02, 0.6), Math.hypot(x, z) - 2.05), "lake", h);
        for (const [tx, tz] of [[-1.3, 0.9], [-1.0, 1.1], [1.25, 0.95], [1.5, 0.7]]) { U(b, sd.capsule(x, y, z, tx, 0, tz, tx, 0.22, tz, 0.025), "trunk", h); U(b, sd.sphere(x - tx, y - 0.32, z - tz, 0.17) + 0.04 * noise2(x * 12, y * 12), "sakura", h); }
        // The Chureito pagoda on the hill, five roofs.
        for (let i = 0; i < 5; i++) { U(b, sd.box(x + 0.85, y - (0.08 + i * 0.13), z - 0.55, 0.08 - i * 0.008, 0.05, 0.08 - i * 0.008), "pagoda", h); U(b, pyramid(x + 0.85, y - (0.13 + i * 0.13), z - 0.55, 0.14 - i * 0.012, 0.04), "roof", h); }
        return b[0]; },
      materials: { soil: SOIL, shore: leaf("#4a7a3e", "#7aa052"), lake: water("#3a5a8a", "#f0c0c8", 0.6), trunk: solid("#5a3e2e"), roof: solid("#3a2e2e"), pagoda: solid("#c8402e"),
        sakura: { color: hex("#f4b0c8"), ramp: R.leaf, shade(c) { c.color = mix(hex("#e890b0"), hex("#ffe0ec"), noise2(c.x * 12, c.y * 12)); } },
        fuji: { color: hex("#5a6a8a"), ramp: R.stone, shade(c) { const cap = c.y > 1.0 + 0.12 * Math.sin(Math.atan2(c.z + 0.55, c.x + 0.1) * 9) + 0.06 * noise2(c.x * 8, c.z * 8);
          c.color = cap ? mix(hex("#d8e0f0"), hex("#ffffff"), clamp(0.5 + c.nx * 0.4)) : mix(hex("#3a4a6a"), hex("#6a7a9a"), noise2(c.x * 5, c.y * 5)); c.glyph = cap ? null : Math.abs(Math.sin(Math.atan2(c.z + 0.55, c.x + 0.1) * 30)) < 0.3 ? "|" : null; } } },
      particles(t, put) { for (let i = 0; i < 22; i++) { const p = (t * 0.07 + hash2(i, 7)) % 1; put(-1.8 + hash2(i, 8) * 3.6 + Math.sin(t + i) * 0.15, 0.9 - p * 0.9, 0.4 + hash2(i, 9) * 1.2, "·", [255, 190, 210], 0.85); }
        sun(put, 2.3, 1.4, -5, [255, 200, 190], 22); birds(put, t, 3, 0, 2.0, -0.4, 1.6); },
    };
  };
  M.uluru = () => ({
    bg: ["#1a1430", "#e07a4a", 0.6, 0.5], cam: { r: 4.4, h: 1.2, at: [0, 0.35, 0] }, sky: stars,
    map(x, y, z, t, h) { const b = [99, ""];
      tile(x, y, z, b, h, "desert");
      U(b, Math.max(ell(x, y + 0.08, z, 1.28, 0.7, 0.62) + 0.025 * Math.abs(Math.sin(x * 14 + noise2(x, z) * 3)), -y), "rock", h);
      for (let i = 0; i < 14; i++) { const a = i * 0.9, r = 1.55 + (i % 3) * 0.13; U(b, sd.sphere(x - Math.cos(a) * r, y - 0.04, z - Math.sin(a) * r, 0.07), "scrub", h); }
      return b[0]; },
    // The rock's colour follows the sun: ochre, fire red, deep purple.
    materials: { soil: SOIL, desert: tone("#b8582e", "#d8784a", 3, R.sand), scrub: leaf("#6a7a3e", "#8a9a52"),
      rock: { color: hex("#c8582e"), ramp: R.stone, shade(c, t) { const k = motion() ? 0.5 + 0.5 * Math.sin(t * 0.18) : 0.6; const base = k < 0.5 ? mix(hex("#7a3a5a"), hex("#c84a2a"), k * 2) : mix(hex("#c84a2a"), hex("#e88a4a"), (k - 0.5) * 2);
        c.color = mix(base, hex("#ffffff"), 0.05 * noise2(c.x * 9, c.y * 9)); c.glyph = Math.abs(Math.sin(c.x * 14 + noise2(c.x, c.z) * 3)) < 0.2 ? "|" : null; } } },
    particles(t, put) { sun(put, -2.6, 0.3 + 0.2 * Math.sin(t * 0.18), -5, [255, 150, 90], 30); },
  });
  M.kilimanjaro = () => {
    const H = (x, z) => { const r = Math.hypot(x + 0.1, z + 0.6); let v = 1.25 * Math.max(0, 1 - r / 1.85) ** 1.1; v = Math.min(v, 1.0 + (r < 0.3 ? -(0.3 - r) * 0.3 : 0)); return v + 0.05 * noise2(x * 4, z * 4); };
    const elephant = (x, y, z) => Math.min(ell(x, y - 0.13, z, 0.11, 0.075, 0.07), sd.sphere(x - 0.12, y - 0.16, z, 0.055), sd.capsule(x, y, z, 0.16, 0.14, 0, 0.19, 0.03, 0, 0.015),
      ...[[-0.06, -0.04], [0.06, -0.04], [-0.06, 0.04], [0.06, 0.04]].map(([lx, lz]) => sd.capsule(x, y, z, lx, 0, lz, lx, 0.1, lz, 0.022)));
    return { bg: ["#1c2a44", "#e8b070", 0.62, 0.5], cam: { r: 4.4, h: 1.3, at: [0, 0.6, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        land(x, y, z, b, h, H, "kili", 2.05, 0.5);
        for (const [tx, tz] of [[-1.2, 1.0], [1.3, 1.1], [0.4, 1.5], [-1.6, 0.4]]) { U(b, sd.capsule(x, y, z, tx, 0, tz, tx + 0.04, 0.3, tz, 0.018), "trunk", h); U(b, ell(x - tx - 0.04, y - 0.33, z - tz, 0.26, 0.05, 0.2), "acacia", h); }
        const ex = motion() ? ((t * 0.02) % 1) * 1.2 : 0.4;
        U(b, elephant(x + 0.6 - ex, y - 0.03, z - 1.2), "grey", h); U(b, elephant(x + 0.95 - ex, y - 0.03, z - 1.35) * 1.0, "grey", h);
        return b[0]; },
      materials: { soil: SOIL, trunk: solid("#4a3a2e"), acacia: leaf("#4a6a2e", "#7a8a3e"), grey: tone("#7a7470", "#9a948e", 8),
        kili: { color: hex("#8a7a5a"), ramp: R.stone, shade(c) { const r = Math.hypot(c.x + 0.1, c.z + 0.6); const snow = c.y > 0.92 && noise2(c.x * 8, c.z * 8) > 0.35;
          c.color = snow ? hex("#f4f8ff") : c.y > 0.55 ? mix(hex("#6a6058"), hex("#8a8070"), noise2(c.x * 6, c.y * 6)) : c.y > 0.25 ? mix(hex("#3f6a3a"), hex("#5f8a4a"), noise2(c.x * 6, c.z * 6)) : mix(hex("#b8a058"), hex("#d8c078"), noise2(c.x * 5, c.z * 5));
          if (!snow && c.y < 0.25 && r > 1.2) c.glyph = "\""; } } },
      moving: [[0.2, 0.15, 1.25, 0.6]],
      particles(t, put) { for (let i = 0; i < 16; i++) { const a = t * 0.06 + (i / 16) * Math.PI * 2; put(-0.1 + Math.cos(a) * 1.25, 0.55 + Math.sin(i) * 0.05, -0.6 + Math.sin(a) * 1.0, "≈", [240, 240, 244], 0.45); } sun(put, 2.6, 1.3, -5, [255, 190, 130], 24); },
    };
  };
  M.halong = () => {
    const KARST = [[-1.1, -0.6, 0.32, 1.1], [-0.4, -1.1, 0.28, 1.3], [0.5, -0.8, 0.35, 1.0], [1.2, -0.2, 0.3, 0.85], [-0.2, 0.2, 0.22, 0.75], [0.9, 0.7, 0.2, 0.6], [-1.3, 0.6, 0.24, 0.7]];
    return { bg: ["#2a3640", "#c8d4cc", 0.62, 0.5], cam: { r: 4.4, h: 1.4, at: [0, 0.5, 0] },
      map(x, y, z, t, h) { const b = [99, ""];
        const d0 = sd.cyl(x, y + 0.35, z, 2.05, 0.35);
        if (d0 < b[0]) { b[0] = d0; h.m = y < -0.03 ? "soil" : "bay"; }
        for (const [cx, cz, r, hh] of KARST) { if (Math.abs(x - cx) > r + 0.3 || Math.abs(z - cz) > r + 0.3) continue; const k = clamp(y / hh), rr = r * (1 - k ** 3) * (0.85 + 0.25 * noise2(y * 5 + cx, Math.atan2(z - cz, x - cx) * 2)); U(b, Math.max((Math.hypot(x - cx, z - cz) - rr) * 0.6, y - hh, -y), "karst", h); }
        const p = motion() ? ((t * 0.035) % 1) : 0.3, jx = x + 1.6 - p * 3.2, jz = z - 1.1;
        U(b, Math.max(ell(jx, y - 0.03, jz, 0.18, 0.06, 0.06), -y), "hull", h);
        for (const sx of [-0.06, 0.07]) U(b, Math.max(Math.abs(jz) - 0.006, Math.abs(jx - sx) - 0.06, -(y - 0.08), y - 0.36 + Math.abs(jx - sx) * 0.4), "redsail", h);
        return b[0]; },
      moving: [[0, 0.2, 1.1, 1.8]],
      materials: { soil: SOIL, bay: water("#2a5a5a", "#a8d0c0", 0.8), hull: solid("#6a4a32"), redsail: { color: hex("#c8402e"), ramp: R.stone, shade(c) { c.glyph = Math.floor(c.y * 30) % 2 ? "=" : "#"; } },
        karst: { color: hex("#8a8a80"), ramp: R.stone, shade(c) { c.color = c.ny > 0.5 || noise2(c.x * 6, c.y * 6 + c.z * 6) > 0.62 ? mix(hex("#2f5e38"), hex("#5f8e4a"), noise2(c.x * 9, c.z * 9)) : mix(hex("#6a6a62"), hex("#a8a49a"), noise2(c.x * 4, c.y * 9)); if (c.ny < 0.4 && Math.abs(Math.sin(c.y * 30 + c.x * 8)) > 0.8) c.glyph = "|"; } } },
      particles(t, put) { clouds(put, t, 0.35, 9, 2.6, [236, 240, 236], 0.4, 0.035); birds(put, t, 3, 0, 1.6, 0, 1.6); },
    };
  };

  // --------------------------------------------------------------- data
  // id, model, name, kind, country (ISO A3), place, lat, lon, when, tagline,
  // numbers [icon, label, value], story, did you know, visiting.
  const W = [
    ["giza", "giza", "Pyramids of Giza", "Built", "EGY", "Giza, Egypt", 29.9792, 31.1342, "c. 2560 BC", "The last standing wonder of the ancient world.",
      [["󰔶", "HEIGHT", "146.6 m when built (138.5 m today)"], ["󰒗", "BASE", "230.3 m a side"], ["󰆧", "BLOCKS", "about 2.3 million"], ["󱑂", "AGE", "about 4,500 years"]],
      "Built for the pharaoh Khufu, the Great Pyramid was the tallest structure made by people for nearly 4,000 years. Beside it stand the pyramids of Khafre and Menkaure, and the Sphinx keeps watch below.",
      "Its sides were once faced with polished white limestone that shone in the sun; a little of that casing still caps Khafre's pyramid.",
      "Cooler from November to February. Bring water, sun cover and closed shoes for the sand."],
    ["wall", "wall", "Great Wall of China", "Built", "CHN", "Northern China (Mutianyu shown)", 40.4319, 116.5704, "7th century BC – 1644", "Walls, watchtowers and passes across mountains and steppe.",
      [["󰑪", "LENGTH", "about 21,196 km, all branches"], ["󰔶", "WALL HEIGHT", "mostly 5 – 8 m"], ["󰆧", "BUILT BY", "many dynasties, last the Ming"], ["󰘏", "UNESCO", "1987"]],
      "Not one wall but many, raised over two thousand years to guard the northern frontier. The brick and stone stretches most people picture were rebuilt by the Ming dynasty.",
      "Despite the legend, it is not visible to the naked eye from the Moon.",
      "Spring and autumn are clear and mild. Steep sections: good shoes, water, and start early."],
    ["petra", "petra", "Petra", "Built", "JOR", "Ma'an, Jordan", 30.3285, 35.4444, "c. 4th century BC", "A rose-red city carved into the cliffs.",
      [["󰔶", "TREASURY", "about 40 m tall"], ["󰑪", "THE SIQ", "1.2 km gorge entrance"], ["󰆧", "BUILT BY", "the Nabataeans"], ["󰘏", "UNESCO", "1985"]],
      "The capital of the Nabataean traders, cut straight into sandstone. Its famous facade, Al-Khazneh, is reached through a narrow canyon, the Siq, which opens on it all at once.",
      "Petra had a clever water system of dams, cisterns and channels that let a city thrive in the desert.",
      "Spring and autumn. Expect long walks; carry water. Petra by Night lights the Siq with candles."],
    ["colosseum", "colosseum", "Colosseum", "Built", "ITA", "Rome, Italy", 41.8902, 12.4922, "AD 70 – 80", "The great amphitheatre of ancient Rome.",
      [["󰔶", "HEIGHT", "48 m"], ["󰡉", "CROWD", "50,000 – 80,000"], ["󰒗", "SIZE", "189 × 156 m"], ["󰘏", "UNESCO", "1980 (Historic Rome)"]],
      "Opened under Emperor Titus, it hosted gladiators, animal hunts and public spectacles for centuries. Earthquakes and stone robbers took away part of the outer ring.",
      "A huge awning, the velarium, worked by sailors, could shade the crowd.",
      "Book ahead; mornings are quieter. The underground (hypogeum) needs a special ticket."],
    ["chichen", "chichen", "Chichén Itzá", "Built", "MEX", "Yucatán, Mexico", 20.6843, -88.5678, "c. AD 600 – 1200", "A Maya city and the stepped pyramid of Kukulcán.",
      [["󰔶", "EL CASTILLO", "30 m with the temple"], ["󰆧", "STEPS", "91 a side, 365 in all"], ["󰆧", "BUILT BY", "the Maya"], ["󰘏", "UNESCO", "1988"]],
      "El Castillo is a calendar in stone: four stairways of 91 steps plus the top platform make 365. At the equinoxes the afternoon sun casts triangles of light that seem to slide down the north stair like a feathered serpent.",
      "Clapping at the foot of the stair echoes back as a chirp, like the quetzal bird.",
      "Arrive at opening time to beat the heat and crowds. Equinox days are spectacular and busy."],
    ["machu", "machu", "Machu Picchu", "Built", "PER", "Cusco Region, Peru", -13.1631, -72.545, "c. AD 1450", "An Inca citadel high in the Andes.",
      [["󰔶", "ALTITUDE", "2,430 m"], ["󰆧", "BUILT BY", "the Inca (Pachacuti)"], ["󰆧", "BUILDINGS", "about 200"], ["󰘏", "UNESCO", "1983"]],
      "A royal estate on a ridge above the Urubamba river, built without mortar from stones cut to fit so closely that a knife blade will not pass. Huayna Picchu rises behind it.",
      "The terraces held soil and drained the heavy rains, keeping the city from sliding off its mountain.",
      "Dry season May – October. Tickets are timed and limited; acclimatise to the altitude in Cusco first."],
    ["taj", "taj", "Taj Mahal", "Built", "IND", "Agra, India", 27.1751, 78.0421, "1632 – 1653", "A white marble tomb built for love.",
      [["󰔶", "HEIGHT", "73 m"], ["󰡉", "WORKERS", "about 20,000"], ["󰆧", "BUILT BY", "Shah Jahan, for Mumtaz Mahal"], ["󰘏", "UNESCO", "1983"]],
      "The emperor Shah Jahan raised it for his wife Mumtaz Mahal. Its marble is inlaid with semi-precious stones, and its colour changes with the light, from pink at dawn to gold at dusk.",
      "The four minarets lean very slightly outward, so in an earthquake they would fall away from the tomb.",
      "October to March. Closed on Fridays. Sunrise is the most beautiful and the quietest."],
    ["christ", "christ", "Christ the Redeemer", "Built", "BRA", "Rio de Janeiro, Brazil", -22.9519, -43.2105, "1922 – 1931", "Arms open over Rio from Corcovado.",
      [["󰔶", "STATUE", "30 m, on an 8 m pedestal"], ["󰒗", "ARM SPAN", "28 m"], ["󰔶", "MOUNTAIN", "Corcovado, 700 m"], ["󰆧", "MATERIAL", "concrete and soapstone"]],
      "Designed by Heitor da Silva Costa with the French sculptor Paul Landowski, it faces the city and the bay from the top of Corcovado in the Tijuca forest.",
      "It is struck by lightning several times a year; spare soapstone is kept for repairs.",
      "Go early on a clear day; clouds often hide the statue by midday. The cog train climbs through the forest."],
    ["stonehenge", "stonehenge", "Stonehenge", "Built", "GBR", "Wiltshire, England", 51.1789, -1.8262, "c. 3000 – 2000 BC", "A ring of standing stones aligned with the sun.",
      [["󰆧", "SARSENS", "up to about 25 tonnes"], ["󰑪", "BLUESTONES", "brought about 225 km from Wales"], ["󱑂", "AGE", "about 5,000 years"], ["󰘏", "UNESCO", "1986"]],
      "Built in stages over a thousand years. The stones frame the sunrise at the summer solstice and the sunset at the winter solstice.",
      "The lintels are held by joints carpenters would know: mortise and tenon, and tongue and groove.",
      "Solstice gatherings let people among the stones. Otherwise you walk a path around them."],
    ["eiffel", "eiffel", "Eiffel Tower", "Built", "FRA", "Paris, France", 48.8584, 2.2945, "1887 – 1889", "Wrought iron lace over the Seine.",
      [["󰔶", "HEIGHT", "330 m with antennas"], ["󰆧", "IRON", "about 7,300 tonnes"], ["󰆧", "RIVETS", "about 2.5 million"], ["󰡉", "VISITORS", "about 6 – 7 million a year"]],
      "Built by Gustave Eiffel's company for the 1889 World's Fair, it was meant to stand for twenty years. Its use as a radio mast saved it.",
      "Every hour after dark it sparkles for five minutes with 20,000 lights; heat can make it grow by up to 15 cm in summer.",
      "Book the summit ahead. The stairs to the second floor are an adventure and a shorter queue."],
    ["angkor", "angkor", "Angkor Wat", "Built", "KHM", "Siem Reap, Cambodia", 13.4125, 103.867, "early 12th century", "The world's largest religious monument.",
      [["󰒗", "AREA", "162.6 hectares"], ["󰔶", "CENTRAL TOWER", "65 m"], ["󰆧", "BUILT BY", "King Suryavarman II"], ["󰘏", "UNESCO", "1992 (Angkor)"]],
      "A Khmer temple for Vishnu, later Buddhist, its five lotus-bud towers stand for the peaks of Mount Meru. A wide moat surrounds it like the ocean around the world.",
      "Its walls carry nearly 2 km of carved reliefs, including the Churning of the Ocean of Milk.",
      "November to February. Sunrise over the towers, seen across the reflecting pools, is the classic view."],
    ["moai", "moai", "Moai of Rapa Nui", "Built", "CHL", "Easter Island, Chile", -27.1258, -109.2768, "c. AD 1250 – 1500", "Stone ancestors watching over the island.",
      [["󰆧", "STATUES", "about 900"], ["󰔶", "TALLEST STANDING", "about 10 m"], ["󰆧", "AHU TONGARIKI", "15 moai in a row"], ["󰘏", "UNESCO", "1995"]],
      "Carved by the Rapa Nui from volcanic tuff at the Rano Raraku quarry, the moai face inland, watching over their people. Some wear red stone topknots, pukao.",
      "Experiments suggest they were 'walked' upright with ropes, rocking from side to side.",
      "Remote: flights from Santiago or Tahiti. Do not touch or climb the moai or the ahu."],
    ["liberty", "liberty", "Statue of Liberty", "Built", "USA", "New York Harbor, USA", 40.6892, -74.0445, "1886", "Liberty Enlightening the World.",
      [["󰔶", "HEIGHT", "93 m with pedestal"], ["󰆧", "COPPER SKIN", "about 2.4 mm thick"], ["󰆧", "BY", "Bartholdi and Eiffel"], ["󰘏", "UNESCO", "1984"]],
      "A gift from France to the United States. Frédéric Bartholdi sculpted her; Gustave Eiffel's company designed the iron frame inside.",
      "She was copper-brown at first; the green patina formed within about thirty years.",
      "Crown tickets sell out months ahead. Ferries leave from Battery Park and Liberty State Park."],
    ["opera", "opera", "Sydney Opera House", "Built", "AUS", "Sydney, Australia", -33.8568, 151.2153, "1959 – 1973", "Sails of white tile on the harbour.",
      [["󰆧", "ROOF TILES", "over 1 million"], ["󰔶", "HEIGHT", "65 m"], ["󰆧", "ARCHITECT", "Jørn Utzon"], ["󰘏", "UNESCO", "2007"]],
      "Jørn Utzon's design won a competition in 1957. Its shells are all cut from the surface of one sphere, a solution that made them buildable.",
      "The tiles are self-cleaning: glazed so that rain washes them.",
      "Take a tour or a show; walk to Mrs Macquarie's Chair for the classic view with the Harbour Bridge."],
    ["parthenon", "parthenon", "Parthenon", "Built", "GRC", "Acropolis, Athens, Greece", 37.9715, 23.7267, "447 – 432 BC", "The temple of Athena on the Acropolis.",
      [["󰒗", "SIZE", "69.5 × 30.9 m"], ["󰆧", "COLUMNS", "46 outer"], ["󰆧", "MARBLE", "Pentelic"], ["󰘏", "UNESCO", "1987 (Acropolis)"]],
      "Built under Pericles to honour Athena, it is the summit of classical Greek architecture. A gunpowder explosion in 1687 left it the ruin we see.",
      "It has almost no straight lines: the columns swell and lean slightly so that it looks perfectly straight.",
      "Go at opening time or late in the day; it is hot and bright on the rock. Wear grippy shoes on the marble."],
    ["hagia", "hagia", "Hagia Sophia", "Built", "TUR", "Istanbul, Türkiye", 41.0086, 28.9802, "AD 537", "A dome that seems to float on light.",
      [["󰔶", "DOME", "55.6 m high"], ["󰒗", "DOME WIDTH", "about 31 m"], ["󰆧", "BUILT BY", "Emperor Justinian I"], ["󰘏", "UNESCO", "1985 (Historic Istanbul)"]],
      "For nearly a thousand years the world's largest cathedral, then a mosque, a museum, and a mosque again. A ring of forty windows at its base makes the dome seem to hover.",
      "Its builders were mathematicians: Anthemius of Tralles and Isidore of Miletus.",
      "It is a working mosque: dress modestly, and avoid prayer times."],
    ["burj", "burj", "Burj Khalifa", "Built", "ARE", "Dubai, United Arab Emirates", 25.1972, 55.2744, "2004 – 2010", "The tallest building on Earth.",
      [["󰔶", "HEIGHT", "828 m"], ["󰆧", "FLOORS", "163"], ["󰆧", "ARCHITECT", "Adrian Smith (SOM)"], ["󰔶", "VIEW", "visible from about 95 km"]],
      "Its Y-shaped plan, inspired by the desert flower Hymenocallis, steps back as it rises, which breaks up the wind. At its feet, the Dubai Fountain dances.",
      "The temperature at the top can be several degrees cooler than at the base.",
      "Sunset slots sell out early. The fountain shows run every evening."],
    ["basil", "basil", "Saint Basil's Cathedral", "Built", "RUS", "Red Square, Moscow, Russia", 55.7525, 37.6231, "1555 – 1561", "Onion domes like flames of a bonfire.",
      [["󰆧", "CHAPELS", "nine around one"], ["󰔶", "HEIGHT", "47.5 m"], ["󰆧", "BUILT FOR", "Ivan IV"], ["󰘏", "UNESCO", "1990 (Red Square)"]],
      "Built to mark the capture of Kazan, its chapels gather around a central tent spire. The bright colours of the domes came later, in the 17th century.",
      "Inside, it is a maze of narrow passages and small chapels, painted from floor to vault.",
      "Check current travel advice before any trip. Winter is very cold and very beautiful."],
    ["borobudur", "borobudur", "Borobudur", "Built", "IDN", "Central Java, Indonesia", -7.6079, 110.2038, "9th century", "A mountain of stone and a path to enlightenment.",
      [["󰆧", "STUPAS", "72 around a main one"], ["󰆧", "RELIEF PANELS", "2,672"], ["󰆧", "BUDDHAS", "504 statues"], ["󰘏", "UNESCO", "1991"]],
      "The world's largest Buddhist temple, built as a mandala you climb: carved terraces of the everyday world below, open round terraces of bell-shaped stupas above.",
      "It lay hidden under volcanic ash and jungle for centuries until it was cleared in the 19th century.",
      "Sunrise with the volcanoes Merapi and Merbabu is famous. Climbing the top is limited; book ahead."],
    ["goldengate", "goldengate", "Golden Gate Bridge", "Built", "USA", "San Francisco, USA", 37.8199, -122.4783, "1933 – 1937", "International orange in the fog.",
      [["󰑪", "LENGTH", "2,737 m"], ["󰑪", "MAIN SPAN", "1,280 m"], ["󰔶", "TOWERS", "227 m"], ["󰆧", "CABLES", "each 92 cm thick"]],
      "When it opened it had the longest suspension span in the world. Its colour, International Orange, was chosen to stand out in the fog and suit the hills.",
      "Each main cable holds 27,572 wires; laid end to end they would circle the Earth three times.",
      "Walk or cycle across. Mornings are often foggy; the fog lifting is part of the show."],
    ["everest", "everest", "Mount Everest", "Natural", "NPL", "Nepal – China (Tibet) border", 27.9881, 86.925, "about 50 million years rising", "The roof of the world.",
      [["󰔶", "HEIGHT", "8,849 m"], ["󰡉", "FIRST CLIMB", "1953, Hillary and Tenzing"], ["󰖐", "SUMMIT AIR", "about a third of sea-level oxygen"], ["󰘏", "UNESCO", "1979 (Sagarmatha)"]],
      "Sagarmatha in Nepali, Chomolungma in Tibetan. India pushing into Asia raised the Himalaya, and Everest still grows a few millimetres a year.",
      "Its summit rock is marine limestone, the floor of an ocean that vanished.",
      "Base-camp treks are best in spring and autumn. Climb slowly: altitude sickness can kill. Descend if symptoms worsen."],
    ["canyon", "canyon", "Grand Canyon", "Natural", "USA", "Arizona, USA", 36.1069, -112.1129, "carved over 5 – 6 million years", "Two billion years of Earth's history in its walls.",
      [["󰑪", "LENGTH", "446 km"], ["󰔶", "DEPTH", "about 1.8 km"], ["󰒗", "WIDTH", "up to 29 km"], ["󰘏", "UNESCO", "1979"]],
      "The Colorado River cut it as the plateau rose. Its layers run from rocks about 1.8 billion years old at the bottom to much younger limestone at the rim.",
      "The bottom can be more than 15 °C hotter than the rim.",
      "Never try to hike rim to river and back in a day in summer. Carry lots of water and salty food."],
    ["victoria", "victoria", "Victoria Falls", "Natural", "ZMB", "Zambia – Zimbabwe border", -17.9243, 25.8572, "formed over about 100,000 years", "Mosi-oa-Tunya: the smoke that thunders.",
      [["󰑪", "WIDTH", "1,708 m"], ["󰔶", "DROP", "up to 108 m"], ["󰖌", "PEAK FLOW", "over 500 million litres a minute"], ["󰘏", "UNESCO", "1989"]],
      "The Zambezi falls into a narrow basalt gorge across its whole width, the largest single curtain of falling water on Earth. Its spray can be seen from tens of kilometres away.",
      "On full-moon nights its spray makes a lunar rainbow, a moonbow.",
      "High water (March – May) is overwhelming and soaking; low water (September – December) shows the rock."],
    ["reef", "reef", "Great Barrier Reef", "Natural", "AUS", "Queensland, Australia", -18.2871, 147.6992, "about 20,000 years in its present form", "The largest structure made by living things.",
      [["󰑪", "LENGTH", "about 2,300 km"], ["󰆧", "REEFS", "about 2,900"], ["󰆧", "ISLANDS", "about 900"], ["󰘏", "UNESCO", "1981"]],
      "Billions of tiny coral polyps built it, home to some 1,500 kinds of fish, turtles, dugongs and whales. Warming seas bleach its corals.",
      "It is large enough to be seen from space.",
      "June to October is dry and mild. Use reef-safe sunscreen; watch for jellyfish (stingers) from October to May."],
    ["fuji", "fuji", "Mount Fuji", "Natural", "JPN", "Honshu, Japan", 35.3606, 138.7274, "last erupted 1707", "A near-perfect volcano and a sacred mountain.",
      [["󰔶", "HEIGHT", "3,776 m"], ["󰆧", "TYPE", "active stratovolcano"], ["󰡉", "CLIMBERS", "about 200,000 a year"], ["󰘏", "UNESCO", "2013 (cultural)"]],
      "Fuji-san has inspired poets and painters for centuries, Hokusai most famously. Its snow cap lasts most of the year.",
      "The 1707 Hōei eruption dropped ash on Edo, the city now called Tokyo, 100 km away.",
      "Official climbing season is July to early September. See it reflected in Lake Kawaguchi, with the Chureito pagoda in spring."],
    ["uluru", "uluru", "Uluru", "Natural", "AUS", "Northern Territory, Australia", -25.3444, 131.0369, "about 300 million years old", "The red heart of Australia.",
      [["󰔶", "HEIGHT", "348 m above the plain"], ["󰑪", "AROUND", "9.4 km"], ["󰆧", "ROCK", "arkose sandstone"], ["󰘏", "UNESCO", "1987 (mixed)"]],
      "Sacred to the Aṉangu people, its traditional owners. Most of it lies under the ground, like an iceberg.",
      "It changes colour with the sun: ochre by day, fiery red at sunset, purple and grey at night.",
      "Climbing is no longer allowed. Walk the base, carry lots of water, and start early in summer."],
    ["kilimanjaro", "kilimanjaro", "Mount Kilimanjaro", "Natural", "TZA", "Kilimanjaro Region, Tanzania", -3.0674, 37.3556, "formed about 750,000 years ago", "Africa's highest mountain, snow on the equator.",
      [["󰔶", "HEIGHT", "5,895 m"], ["󰆧", "TYPE", "dormant volcano, three cones"], ["󰆧", "CLIMATE ZONES", "farmland to arctic summit"], ["󰘏", "UNESCO", "1987"]],
      "The highest free-standing mountain in the world rises from the savanna through rainforest, heath and alpine desert to the glaciers of Kibo.",
      "Its glaciers have shrunk by over 80% since the early 20th century.",
      "Dry seasons: January – March and June – October. Choose a longer route to acclimatise."],
    ["halong", "halong", "Ha Long Bay", "Natural", "VNM", "Quảng Ninh, Vietnam", 20.9101, 107.1839, "karst formed over 20 million years", "Thousands of limestone islands in an emerald sea.",
      [["󰆧", "ISLANDS", "about 1,600"], ["󰒗", "AREA", "about 1,553 km²"], ["󰆧", "ROCK", "limestone karst"], ["󰘏", "UNESCO", "1994"]],
      "Its name means 'descending dragon': legend says a dragon's tail carved the islands. Many hide caves and floating fishing villages.",
      "Some islands are hollow, holding lakes reached only through caves.",
      "October to April is cooler and calmer; summer brings storms. Choose licensed boats."],
  ].map(([id, model, name, kind, a3, place, lat, lon, when, tag, nums, story, know, visit]) => ({ id, model, name, kind, a3, place, lat, lon, when, tag, nums, story, know, visit }));
  const BY = Object.fromEntries(W.map((w) => [w.id, w]));

  // ------------------------------------------------------------ scenes
  function scene(w, o = {}) {
    const s = M[w.model](), c = { ...s.cam, r: s.cam.r * 1.38, h: s.cam.h * 1.25 };
    const a0 = c.a0 ?? 0.55, speed = o.speed ?? 0.12;
    return {
      ...s, sky: s.sky || null, ambient: s.ambient ?? 0.42, light: s.light || [0.55, 0.75, 0.75], shadows: o.shadows ?? false, stillTime: o.time ?? 3,
      materials: { ...s.materials },
      camera: (t) => { const a = c.swing ? a0 + Math.sin(t * speed * 1.4) * c.swing : a0 + t * speed, r = c.r * (o.zoom || 1);
        return { pos: [c.at[0] + Math.sin(a) * r, c.at[1] + c.h * (o.zoom || 1) * 0.8, c.at[2] + Math.cos(a) * r], at: c.at, fovV: c.fov || 36 }; },
    };
  }

  // ------------------------------------------------------- map icons
  // Small models that sway to and fro: eight frames, made a few at a time.
  const FR = 8, MINI = 64;
  const frames = new Map();       // id -> [canvas…]
  let queue = [], pumping = false;
  function want(id) { if (!frames.has(id)) { frames.set(id, []); for (let k = 0; k < FR; k++) queue.push([id, k]); pump(); } return frames.get(id); }
  function pump() {
    if (pumping) return; pumping = true;
    const step = () => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 12) {
        const [id, k] = queue.shift(), w = BY[id];
        try {
          const sc = scene(w, { speed: 0.12, time: 0, zoom: 0.8 }), cam = sc.camera, ang = Math.sin((k / FR) * Math.PI * 2) * 2.2;
          frames.get(id)[k] = A.still({ ...sc, ambient: 0.5, camera: () => cam(ang), stillTime: 2 + k * 0.4 }, MINI, MINI, { cell: 5, font: font(), dpr: Math.min(2, window.devicePixelRatio || 1) });
        } catch { frames.get(id)[k] = null; }
      }
      if (queue.length) requestAnimationFrame(step); else pumping = false;
    };
    requestAnimationFrame(step);
  }
  let layer = null, hooks = null, shown = true, tick = 0, animTimer = 0, hoverCard = null, hoverView = null, hoverId = "", hoverT = 0;
  function attach(h) {
    hooks = h; layer = h.layer;
    try { shown = localStorage.getItem("umbra-wonders") !== "0"; } catch {}
    layer.innerHTML = W.map((w) => `<button class="wd-pin ${w.kind === "Natural" ? "nat" : ""}" data-w="${w.id}" hidden title=""><canvas width="${MINI}" height="${MINI}"></canvas><span>${escapeHtml(w.name)}</span></button>`).join("");
    hoverCard = document.createElement("div"); hoverCard.className = "wd-hover"; hoverCard.hidden = true; layer.parentElement.appendChild(hoverCard);
    layer.querySelectorAll(".wd-pin").forEach((b) => {
      b.addEventListener("pointerenter", () => hover(b.dataset.w, b));
      b.addEventListener("pointerleave", () => unhover());
      b.addEventListener("click", (e) => { e.stopPropagation(); open(b.dataset.w, false, b.getBoundingClientRect()); });
    });
    clearInterval(animTimer);
    animTimer = setInterval(() => {
      if (!layer.isConnected || layer.closest("[hidden]") || !shown || !motion()) return;
      tick++;
      layer.querySelectorAll(".wd-pin:not([hidden])").forEach((b) => draw(b.querySelector("canvas"), b.dataset.w, tick));
    }, 170);
  }
  function draw(cv, id, k = 0) {
    const fr = want(id), f = fr[k % FR] || fr.find(Boolean);
    if (!f) return;
    const g = cv.getContext("2d"); if (cv.width !== f.width) { cv.width = f.width; cv.height = f.height; }
    g.clearRect(0, 0, cv.width, cv.height); g.drawImage(f, 0, 0);
  }
  // Called by the map after each frame: icons follow their places.
  function layout() {
    if (!layer || !hooks) return;
    const z = hooks.zoom(), size = z < 3 ? 50 : z < 5 ? 60 : z < 8 ? 72 : 84;
    layer.style.setProperty("--wd", size + "px");
    layer.classList.toggle("off", !shown);
    for (const b of layer.children) {
      const w = BY[b.dataset.w], p = shown && hooks.project(w.lat, w.lon);
      if (!p || p[0] < -60 || p[1] < -60 || p[0] > hooks.width() + 60 || p[1] > hooks.height() + 60) { b.hidden = true; continue; }
      if (b.hidden) { b.hidden = false; draw(b.querySelector("canvas"), w.id, tick); }
      b.style.transform = `translate(${Math.round(p[0])}px, ${Math.round(p[1])}px)`;
    }
  }
  function setShown(v) { shown = v; try { localStorage.setItem("umbra-wonders", v ? "1" : "0"); } catch {} layout(); }
  // Hover: a card with the model turning live.
  function hover(id, pin) {
    clearTimeout(hoverT);
    const w = BY[id], r = pin.getBoundingClientRect(), body = layer.parentElement.getBoundingClientRect();
    if (hoverId !== id) {
      hoverView?.stop(); hoverId = id;
      hoverCard.innerHTML = `<canvas></canvas><div><small>${w.kind === "Natural" ? "NATURAL WONDER" : "WONDER OF THE WORLD"} · ${escapeHtml(w.when)}</small><b>${escapeHtml(w.name)}</b><span>${escapeHtml(w.tag)}</span><em>${escapeHtml(w.place)} · CLICK FOR ITS FILE</em></div>`;
      hoverCard.hidden = false;
      requestAnimationFrame(() => { if (hoverId === id) hoverView = A.view(hoverCard.querySelector("canvas"), { ...scene(w, { speed: 0.35 }), live: true, fps: 12 }, { cell: 6, font: font() }); });
      Sound.hover?.();
    }
    hoverCard.hidden = false;
    const x = r.left - body.left + r.width / 2, y = r.top - body.top;
    const left = Math.max(8, Math.min(body.width - 330, x - 160)), top = y > 250 ? y - 238 : y + r.height + 8;
    hoverCard.style.left = left + "px"; hoverCard.style.top = top + "px";
  }
  function unhover() { clearTimeout(hoverT); hoverT = setTimeout(() => { hoverCard.hidden = true; hoverView?.stop(); hoverView = null; hoverId = ""; }, 120); }

  // ------------------------------------------------------- the file
  let panel = null, big = null, openId = "";
  function open(id, fly = false, fromRect = null) {
    const w = BY[id]; if (!w || !hooks) return;
    unhover(); window.track?.("wonders", id);
    if (fly) hooks.flyTo(w.lat, w.lon, 7);
    big?.stop(); openId = id;
    if (!panel) { panel = document.createElement("div"); panel.className = "wd-file"; layer.parentElement.appendChild(panel); }
    const country = hooks.country(w.a3);
    panel.innerHTML = `
      <div class="wd-card">
        <div class="wd-art"><canvas></canvas><span class="wd-hint">DRAG TO TURN · SCROLL TO ZOOM</span></div>
        <div class="wd-info">
          <div class="wd-head"><span class="wd-tag">${w.kind === "Natural" ? "◆ NATURAL WONDER" : "◆ WONDER OF THE WORLD"} · ${escapeHtml(w.when.toUpperCase())}</span><button class="ghost wd-x" title="Close · Esc">✕</button></div>
          <h2 data-text="${escapeHtml(w.name.toUpperCase())}">${escapeHtml(w.name.toUpperCase())}</h2>
          <p class="wd-line">${escapeHtml(w.tag)}</p>
          <button class="wd-where" title="Fly there"><b class="g">󰍎</b>${escapeHtml(w.place)}<small>${hooks.fmt(w.lat, w.lon)} · MGRS ${hooks.mgrs(w.lat, w.lon)}</small></button>
          <div class="wd-nums">${w.nums.map(([g, k, v]) => `<div><b class="g">${g}</b><span>${escapeHtml(k)}</span><p>${escapeHtml(v)}</p></div>`).join("")}</div>
          <div class="wd-sec">THE STORY</div><p>${escapeHtml(w.story)}</p>
          <div class="wd-know"><b class="g">󰛨</b><div><b>DID YOU KNOW</b><p>${escapeHtml(w.know)}</p></div></div>
          <div class="wd-sec">GOING THERE</div><p>${escapeHtml(w.visit)}</p>
          <div class="wd-actions">
            <button class="solid" data-a="fly"><b class="g">󰆋</b> FLY THERE</button>
            ${country ? `<button class="ghost" data-a="country"><b class="g">󰈻</b> ${escapeHtml(country.toUpperCase())} FILE</button>` : ""}
            <button class="ghost" data-a="lib"><b class="g">󱉟</b> FIND IN LIBRARY</button>
          </div>
          <p class="wd-src">Model drawn by Umbra · figures from public sources (UNESCO, national agencies).</p>
        </div>
      </div>`;
    panel.hidden = false;
    const body = layer.parentElement.getBoundingClientRect();
    if (fromRect && motion()) { panel.style.setProperty("--fx", `${fromRect.left - body.left + fromRect.width / 2}px`); panel.style.setProperty("--fy", `${fromRect.top - body.top + fromRect.height / 2}px`); panel.classList.remove("grow"); void panel.offsetWidth; panel.classList.add("grow"); }
    const cv = panel.querySelector(".wd-art canvas");
    let zoom = 1, turn = 0, drag = null;
    const sc = scene(w, { speed: 0.09, shadows: true }), cam = sc.camera;
    sc.camera = (t) => { const c = cam(t + turn * 8), at = c.at; return { ...c, pos: [at[0] + (c.pos[0] - at[0]) * zoom, at[1] + (c.pos[1] - at[1]) * zoom, at[2] + (c.pos[2] - at[2]) * zoom] }; };
    requestAnimationFrame(() => { if (openId === id) big = A.view(cv, { ...sc, live: true, drift: 3, fps: 12 }, { cell: 7, font: font() }); });
    cv.addEventListener("pointerdown", (e) => { drag = e.clientX; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => { if (drag == null) return; turn += (e.clientX - drag) / 400; drag = e.clientX; });
    cv.addEventListener("pointerup", () => { drag = null; });
    cv.addEventListener("wheel", (e) => { e.preventDefault(); zoom = clamp(zoom * (e.deltaY > 0 ? 1.08 : 0.92), 0.55, 1.6); }, { passive: false });
    panel.querySelector(".wd-x").addEventListener("click", () => close());
    panel.querySelector(".wd-where").addEventListener("click", () => { hooks.flyTo(w.lat, w.lon, 9); close(); });
    panel.querySelector("[data-a=fly]").addEventListener("click", () => { hooks.flyTo(w.lat, w.lon, 9); close(); });
    panel.querySelector("[data-a=country]")?.addEventListener("click", () => { close(true); hooks.openCountry(w.a3); });
    panel.querySelector("[data-a=lib]").addEventListener("click", () => hooks.library(w.name));
    panel.addEventListener("click", (e) => { if (e.target === panel) close(); });
    Sound.glitch();
  }
  function close(quiet = false) {
    if (!panel || panel.hidden) return false;
    big?.stop(); big = null; panel.hidden = true; openId = "";
    if (!quiet) Sound.click();
    return true;
  }
  const isOpen = () => !!panel && !panel.hidden;

  // Small turning pictures elsewhere (the country file's wonders).
  const minisOn = new Set();
  function minis(root) {
    root.querySelectorAll(".ds-wart[data-w]").forEach((el) => { const cv = document.createElement("canvas"); el.appendChild(cv); minisOn.add(cv); draw(cv, el.dataset.w, 0); });
    if (!minis.timer) minis.timer = setInterval(() => { let k = Math.floor(performance.now() / 170); for (const cv of minisOn) { if (!cv.isConnected) { minisOn.delete(cv); continue; } draw(cv, cv.parentElement.dataset.w, k); } if (!minisOn.size) { clearInterval(minis.timer); minis.timer = 0; } }, 170);
  }
  function stopMinis() { minisOn.clear(); }

  return { list: W, get: (id) => BY[id], inCountry: (a3) => W.filter((w) => w.a3 === a3 || (w.id === "everest" && a3 === "CHN") || (w.id === "victoria" && a3 === "ZWE")),
    attach, layout, setShown, get shown() { return shown; }, open, close, isOpen, minis, stopMinis, scene };
})();
