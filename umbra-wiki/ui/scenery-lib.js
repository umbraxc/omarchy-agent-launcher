// Umbra's scenery library: landscapes in 3D ASCII (ascii3d.js), with depth,
// light and fog. Conversation scenery (chat-scenery.js) picks one that fits
// the subject; each scene is offline, original and drawn on the fly.
"use strict";
window.UmbraScenery = (() => {
  const A = window.Ascii3D, { sd, noise2, fbm2, hash2, hex, mix } = A;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

  // ---------------------------------------------------------------- sky
  // A sky made of sparse glyphs: haze toward the horizon, drifting clouds,
  // stars that twinkle, a sun or moon with a halo, aurora curtains.
  function sky(o) {
    const top = hex(o.top || "#1a2438"), low = hex(o.low || "#7c8aa0");
    const cloud = o.cloudColor ? hex(o.cloudColor) : mix(low, [255, 255, 255], .35);
    const sun = o.sun, sunRgb = sun ? hex(sun.color || "#ffd98c") : null;
    const fn = (u, v, t, col, row, aspect = 4) => {
      const hz = clamp(v / (o.horizon || .62));
      const base = mix(top, low, hz);
      if (sun) {
        // Distances in units of the view's height, so discs stay round.
        const dx = (u - sun.u) * aspect, dy = v - sun.v, r = Math.hypot(dx, dy), R = sun.r * 2.2;
        if (r < R) { const k = r / R; return [k < .45 ? "@" : k < .8 ? "O" : "o", mix([255, 255, 255], sunRgb, k), 1]; }
        if (r < R * 2.2) return [(col + row) % 2 ? "·" : "+", sunRgb, .6 * (1 - r / (R * 2.2))];
        if (sun.rays && r < R * 5 && Math.abs(Math.sin(Math.atan2(dy, dx) * 7 + t * .12)) > .975) return ["·", sunRgb, .4 * (1 - r / (R * 5))];
      }
      if (o.moon) {
        const m = o.moon, dx = (u - m.u) * aspect, dy = v - m.v, r = Math.hypot(dx, dy), R = m.r * 2;
        if (r < R) { const lit = dx / R > -.25; return [lit ? (r / R < .6 ? "@" : "O") : "o", lit ? [242, 240, 220] : [120, 124, 140], lit ? 1 : .55]; }
        if (r < R * 2.4) return ["·", [214, 220, 236], .35 * (1 - r / (R * 2.4))];
      }
      if (o.aurora && v < .58) {
        const wave = Math.sin(u * 7 + t * .35 + Math.sin(u * 3 - t * .2) * 1.8) * .1 + .24;
        const k = 1 - Math.abs(v - wave) / .17;
        if (k > 0 && hash2(col, row) > .25) {
          const hue = clamp(.5 + .5 * Math.sin(u * 4 + t * .25));
          return [k > .6 ? "|" : k > .3 ? "!" : ":", mix([92, 230, 160], [176, 120, 230], hue * (1 - k * .4)), .25 + .65 * k];
        }
      }
      if (o.milky) {
        const band = Math.abs(v - (.15 + u * .35)) ;
        if (band < .12 && hash2(col * 3.1, row * 1.7) > .55 + band * 3) return ["·", [214, 206, 236], .25 + .4 * (1 - band / .12)];
      }
      if (o.clouds) {
        const n = fbm2(u * 5 + t * (o.wind || .012), v * 11 + 2.3, 3);
        if (n > 1 - o.clouds && v < (o.cloudLow || .6)) {
          const k = (n - (1 - o.clouds)) / o.clouds;
          return [k > .55 ? "≈" : k > .25 ? "~" : "-", mix(cloud, base, .25 * (1 - k)), clamp(.2 + .7 * k)];
        }
      }
      if (o.stars) {
        const h = hash2(col, row);
        if (h > 1 - o.stars * (1 - hz)) {
          const tw = .55 + .45 * Math.sin(t * (1 + h * 3) + col);
          return [h > 1 - o.stars * .12 ? "*" : "·", [228, 232, 248], .25 + .6 * tw * (1 - hz)];
        }
      }
      if (hz > .72 && (col * 7 + row * 3) % 5 === 0) return ["·", mix(base, low, .5), .12 + .25 * (hz - .72) / .28];
      return null;
    };
    fn.bg = [o.top || "#1a2438", o.low || "#7c8aa0", o.horizon || .62, o.bgAlpha ?? .4];
    return fn;
  }

  // ----------------------------------------------------------- materials
  const RAMPS = {
    rock: " .:-=+#%@", snow: " .:-=+*", grass: " .,:;\"'%#", leaf: " .:*%#&@", pine: " .^^AA%#",
    wood: " .:|=#H", sand: " .,:-~=", water: " .-~≈", metal: " .:=#%@", wall: " .:-=#%@",
    stone: " .:o0O@", crop: " .,|\"'Y", hay: " .,:;=#",
  };
  // Rippling water: the glyph and brightness follow moving noise; a sparkle
  // path sits under the light.
  const water = (deep, shallow, sparkleX) => ({
    color: hex(deep), ramp: RAMPS.water, spec: .45,
    shade(c, t) {
      const n = noise2(c.x * 1.7 + t * .35, c.z * 4.2 - t * .22) + .5 * noise2(c.x * 4 - t * .5, c.z * 9);
      c.glyph = n > 1.05 ? "≈" : n > .82 ? "~" : n > .6 ? "-" : "·";
      c.color = mix(hex(deep), hex(shallow), clamp(n * .6));
      if (sparkleX != null) {
        const along = Math.abs(c.x - sparkleX * (-c.z) / 12);
        if (along < .25 + -c.z * .03 && n > .78) { c.glyph = n > 1 ? "*" : "+"; c.emit = .9; c.color = [255, 238, 190]; }
      }
    },
  });
  const fire = {
    color: [255, 160, 70], ramp: " .'^*",
    shade(c, t) {
      const n = noise2(c.x * 6 + t * 3, c.y * 7 - t * 9);
      c.emit = .55 + .45 * n; c.glyph = n > .7 ? "*" : n > .45 ? "^" : "'";
      c.color = mix([255, 220, 120], [230, 70, 40], clamp(c.y * 2.2 - .3 + n * .3));
    },
  };
  const glow = (color, flicker = .15) => ({ color: hex(color), shade(c, t) {
    c.emit = .8 + flicker * Math.sin(t * 7 + c.x * 9) * Math.sin(t * 3.1); c.glyph = "#"; } });
  const foliage = (a, b, ramp = RAMPS.leaf) => ({ color: hex(a), ramp, shade(c) {
    const n = noise2(c.x * 5, c.y * 5 + c.z * 3); c.color = mix(hex(a), hex(b), n); } });
  const plain = (color, ramp) => ({ color: hex(color), ramp: ramp || RAMPS.wall });

  // -------------------------------------------------------------- shapes
  // A pine standing at (x, z) on ground height gy; size s.
  function pine(px, py, pz, s, h) {
    const trunk = sd.cyl(px, py, pz, .07 * s, .5 * s);
    let crown = sd.cone(px, py - .35 * s, pz, .55 * s, 1 * s);
    crown = Math.min(crown, sd.cone(px, py - .8 * s, pz, .42 * s, .8 * s), sd.cone(px, py - 1.2 * s, pz, .28 * s, .65 * s));
    if (crown < trunk) { h.m = "pine"; return crown; }
    h.m = "bark"; return trunk;
  }
  // A broad-leafed tree.
  function leafy(px, py, pz, s, h, mat = "leaf") {
    const trunk = sd.capsule(px, py, pz, 0, 0, 0, 0, .8 * s, 0, .08 * s);
    const crown = sd.sphere(px, py - 1.15 * s, pz, .62 * s) - .08 * noise2(px * 6 + py * 3, pz * 6);
    if (crown < trunk) { h.m = mat; return crown; }
    h.m = "bark"; return trunk;
  }
  // A forest of pines by domain repetition, between z0 and z1.
  function pineField(x, y, z, ground, h, { spacing = 2, z0 = -40, z1 = -2, size = 1, skip } = {}) {
    if (z > z1 + 1 || z < z0 - 1) return 99;
    let best = 99, mat = "";
    const gx = Math.floor(x / spacing), gz = Math.floor(z / spacing);
    for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
      const cx = gx + ox, cz = gz + oz;
      const r = hash2(cx * 1.3, cz * 2.7);
      if (r < .25) continue;
      const tx = (cx + .2 + .6 * hash2(cx, cz + 9)) * spacing, tz = (cz + .2 + .6 * hash2(cx + 5, cz)) * spacing;
      if (tz < z0 || tz > z1 || (skip && skip(tx, tz))) continue;
      const s = size * (.75 + .6 * r);
      const d = pine(x - tx, y - ground(tx, tz), z - tz, s, h);
      if (d < best) { best = d; mat = h.m; }
    }
    h.m = mat; return best;
  }
  // A small cabin facing +z: walls, pitched roof, chimney, lit windows.
  function cabin(x, y, z, h, s = 1, rot = 0) {
    [x, z] = A.rotY(x, z, rot);
    x /= s; y /= s; z /= s;
    const walls = sd.box(x, y - .45, z, .8, .45, .55);
    const roof = sd.roof(x, y - .88, z, .98, .68, .5);
    const chimney = sd.box(x - .45, y - 1.2, z + .1, .1, .3, .1);
    const win = Math.min(sd.box(x + .38, y - .5, z - .56, .16, .13, .02), sd.box(x - .32, y - .5, z - .56, .16, .13, .02));
    const door = sd.box(x + .02, y - .3, z - .56, .13, .3, .02);
    let d = walls, m = "cabin";
    if (roof < d) { d = roof; m = "roof"; }
    if (chimney < d) { d = chimney; m = "stone"; }
    if (win < d + .01) { d = Math.min(d, win); m = "window"; }
    if (door < d + .005) { d = Math.min(d, door); m = "door"; }
    h.m = m; return d * s;
  }

  // ------------------------------------------------------------- particles
  const smoke = (x, y, z, t, put, color = [190, 190, 196]) => {
    for (let i = 0; i < 9; i++) {
      const p = (t * .18 + i / 9) % 1;
      put(x + Math.sin(t * .7 + i) * .15 + p * .6, y + p * 2.2, z, p < .3 ? "o" : p < .65 ? "°" : "·", color, .55 * (1 - p));
    }
  };
  const birds = (t, put, { x = 0, y = 4, z = -10, n = 3, spread = 3 } = {}) => {
    for (let i = 0; i < n; i++) {
      const p = (t * .03 + i * .37) % 1;
      const bx = x - spread * 2 + p * spread * 4, by = y + Math.sin(t * .8 + i * 2) * .3 + i * .25;
      put(bx, by, z - i, Math.sin(t * 6 + i) > 0 ? "v" : "-", [40, 40, 48], .8);
    }
  };
  const rain = (t, W, H, put2, n = 160, slant = .35, color = [160, 180, 205]) => {
    for (let i = 0; i < n; i++) {
      const sx = hash2(i, 1) * (W + 60), speed = 140 + hash2(i, 2) * 120, y = ((t * speed + hash2(i, 3) * H) % (H + 20)) - 10;
      put2(sx - y * slant, y, slant > .2 ? "/" : "|", color, .25 + .35 * hash2(i, 4));
    }
  };
  const snowfall = (t, W, H, put2, n = 110) => {
    for (let i = 0; i < n; i++) {
      const speed = 12 + hash2(i, 2) * 22, y = ((t * speed + hash2(i, 3) * H) % (H + 10)) - 5;
      const x = (hash2(i, 1) * W + Math.sin(t * .8 + i) * 12) % W;
      put2(x, y, hash2(i, 5) > .7 ? "*" : "·", [236, 240, 248], .45 + .45 * hash2(i, 4));
    }
  };

  // Rolling terrain, distant hills higher.
  const hills = (amp = 1, freq = .18, rise = .04) => (x, z) => amp * fbm2(x * freq + 3.1, z * freq + 7.7, 4) * (1 + Math.max(0, -z) * rise) - .2;

  // -------------------------------------------------------------- scenes
  // Each: name, tags (when a conversation fits) and build() -> scene.
  const S = {};
  const cam = (pos, at, fov = 50) => () => ({ pos, at, fov });

  S.mountains = { name: "Alpine peaks at first light", tags: /\b(mountains?|alps|alpine|summit|peaks?|hik(e|ing)|trek(king)?|climb(ing)?|mountaineer\w*|altitude|ridge|himalaya\w*|rockies|everest|backpack(ing)?)\b/i,
    build() {
      const H = (x, z) => { const r = 1 - Math.abs(2 * fbm2(x * .07 + 2, z * .07, 4) - 1); return r * r * 9 * clamp((-z - 8) / 18) + fbm2(x * .3, z * .3, 3) * .7 - .5; };
      return { camera: cam([0, 2.2, 9], [0, 3.6, -20], 72), light: [-.6, .55, .4], ambient: .18,
        fog: { color: hex("#9fb3c8"), density: 0.014 }, sky: sky({ top: "#2b3a58", low: "#e7b08e", clouds: .32, sun: { u: .18, v: .47, r: .045, color: "#ffcf8a", rays: true }, cloudLow: .45 }),
        map(x, y, z, t, h) {
          const d = (y - H(x, z)) * .45; h.m = "terrain";
          if (z > -16 && z < 3) { const p = pineField(x, y, z, H, h, { spacing: 1.6, z0: -15, z1: 1, size: .7, skip: (tx, tz) => H(tx, tz) > 1.6 }); if (p < d) return p; h.m = "terrain"; }
          return d;
        },
        materials: { pine: foliage("#3d6b4e", "#2a4f3c", RAMPS.pine), bark: plain("#6b5440", RAMPS.wood),
          terrain: { color: hex("#8a8378"), ramp: RAMPS.rock, shade(c) {
            const snowLine = 4.2 + noise2(c.x * .7, c.z * .7) * 1.4;
            if (c.y > snowLine && c.ny > .45) { c.color = hex("#eef2f6"); c.ramp = RAMPS.snow; }
            else if (c.y < 1.1 && c.ny > .7) { c.color = mix(hex("#5c7d4f"), hex("#7f915e"), noise2(c.x, c.z)); c.ramp = RAMPS.grass; }
            else c.color = mix(hex("#857a6d"), hex("#a39a8c"), noise2(c.x * 2, c.y * 2)); } } },
        particles: (t, put) => { const a = t * .12; put(Math.cos(a) * 4, 5.2 + Math.sin(t * .5) * .2, -8 + Math.sin(a) * 2, Math.sin(t * 4) > 0 ? "^" : "v", [30, 30, 36], .85); },
        overlay: (t, W, H, put2) => { for (let i = 0; i < 70; i++) { const y = H * (.6 + .07 * Math.sin(i)), x = ((i * 37 + t * 9) % (W + 40)) - 20; put2(x, y + Math.sin(t * .4 + i) * 3, "~", [220, 228, 236], .16); } },
      };
    } };

  S.forest = { name: "Sunlight through the pines", tags: /\b(forests?|woods|woodland|trees?|timber|pines?|spruce|fir|oak|birch|hik(e|ing) trail|bushcraft|foraging|mushrooms?|ferns?)\b/i,
    build() {
      const H = hills(.6, .2, .01);
      return { camera: cam([0, 1.6, 7], [0, 1.9, -8], 72), light: [-.4, .8, .25], ambient: .2,
        fog: { color: hex("#9fb89b"), density: 0.035, fade: .4 }, sky: sky({ top: "#355b4a", low: "#cfe3b7", clouds: .18 }),
        map(x, y, z, t, h) {
          const g = (y - H(x, z)) * .7, p = pineField(x, y, z, H, h, { spacing: 2.3, z0: -30, z1: 1.5, size: 1.05 });
          if (p < g) return p; h.m = "floor"; return g;
        },
        materials: { pine: foliage("#4a7d55", "#2d5a3f", RAMPS.pine), bark: plain("#76593f", RAMPS.wood),
          floor: { color: hex("#6b7d45"), ramp: RAMPS.grass, shade(c) { const n = noise2(c.x * 2.5, c.z * 2.5); c.color = mix(hex("#5d7340"), hex("#a08a52"), n); if (n > .8) c.glyph = "*"; } } },
        overlay(t, W, H, put2) {
          for (let k = 0; k < 4; k++) { const x0 = W * (.15 + k * .22) + Math.sin(t * .1 + k) * 10;
            for (let y = 0; y < H; y += 9) put2(x0 + y * .45, y, "/", [255, 240, 190], .07 + .05 * Math.sin(t * .6 + k)); }
        },
        particles: (t, put) => { for (let i = 0; i < 12; i++) { const p = (t * .05 + i / 12) % 1; put(-3 + i * .6, 2.5 - p * 2.5, -2 - i * .3, "·", [255, 236, 170], .7 * Math.sin(p * Math.PI)); } },
      };
    } };

  S.lake = { name: "A still mountain lake", tags: /\b(lakes?|canoe(ing)?|kayak(ing)?|ponds?|reservoir|lakeside|paddl(e|ing)|fjords?|reflection)\b/i,
    build() {
      const H = (x, z) => z < -9 ? 4.5 * fbm2(x * .12, z * .12, 4) * clamp((-z - 9) / 8) + .3 : -1;
      const shore = (x, z) => z < -7.5 ? .25 + .3 * noise2(x * .5, z) : -1;
      return { camera: cam([0, 1.3, 7], [0, 1.1, -8], 67), light: [.3, .6, .5], ambient: .2,
        fog: { color: hex("#a9bccb"), density: 0.018 }, sky: sky({ top: "#3c5878", low: "#f0d4b0", clouds: .22, sun: { u: .62, v: .44, r: .035 } }),
        map(x, y, z, t, h) {
          let d = y, m = "water";
          const g = (y - Math.max(H(x, z), shore(x, z))) * .5; if (g < d) { d = g; m = "hill"; }
          const p = pineField(x, y, z, (a, b) => Math.max(H(a, b), shore(a, b)), h, { spacing: 1.2, z0: -14, z1: -7.6, size: .9 }); if (p < d) { d = p; m = h.m; }
          // A canoe with a paddler.
          const cx = x - 1.4, cz = z + .5;
          const hull = Math.max(sd.sphere(cx * .55, (y - .06) * 2.6, cz * 2.4, .22), -y + .02);
          if (hull < d) { d = hull; m = "canoe"; }
          const body = sd.capsule(cx, y, cz, 0, .06, 0, 0, .28, 0, .06); if (body < d) { d = body; m = "jacket"; }
          const head = sd.sphere(cx, y - .38, cz, .055); if (head < d) { d = head; m = "skin"; }
          h.m = m; return d;
        },
        materials: { water: water("#2e4f6b", "#7fa3b8", .62 * 18 - 9), hill: { color: hex("#6f7d74"), ramp: RAMPS.rock, shade(c) { if (c.y > 3 && c.ny > .5) { c.color = hex("#e9eef1"); c.ramp = RAMPS.snow; } } },
          pine: foliage("#365f48", "#24463a", RAMPS.pine), bark: plain("#5e4836", RAMPS.wood), canoe: plain("#c0603f", RAMPS.wood), jacket: plain("#d9a23c"), skin: plain("#e0b493") },
        particles: (t, put) => birds(t, put, { y: 3.5, z: -9 }),
      };
    } };

  S.lighthouse = { name: "A lighthouse over the night sea", tags: /\b(ocean|seas?|sail(ing|boat)?|boats?|lighthouses?|coast(al|line)?|ships?|harbou?r|maritime|navigat\w+|waves?|tides?)\b/i,
    build() {
      const isle = (x, z) => 1.4 * Math.max(0, 1 - Math.hypot((x - 2.6) * .55, (z + 4) * .7)) + .25 * noise2(x * 2, z * 2) - .25;
      return { camera: cam([0, 1.2, 7], [.6, 1.6, -6], 65), light: [-.3, .5, .6], ambient: .12,
        fog: { color: hex("#1c2740"), density: 0.015, fade: .3 }, sky: sky({ top: "#070b18", low: "#25365a", stars: .07, moon: { u: .2, v: .2, r: .028 }, clouds: .15, cloudColor: "#56657e" }),
        map(x, y, z, t, h) {
          let d = y - .02 * Math.sin(x * 2 + z), m = "sea";
          const rock = (y - isle(x, z)) * .5; if (rock < d) { d = rock; m = "rock"; }
          const lx = x - 2.6, lz = z + 4, ty = y - 1.05;
          const tower = Math.max(sd.cone(lx, ty, lz, .38, 3.6), ty - 2.3); if (tower < d) { d = tower; m = "tower"; }
          const gallery = sd.cyl(lx, ty - 2.3, lz, .32, .08); if (gallery < d) { d = gallery; m = "metal"; }
          const lamp = sd.sphere(lx, ty - 2.55, lz, .2); if (lamp < d) { d = lamp; m = "lamp"; }
          const cap = sd.cone(lx, ty - 2.72, lz, .26, .32); if (cap < d) { d = cap; m = "metal"; }
          h.m = m; return d;
        },
        materials: { sea: water("#13243f", "#3b5d82", .2 * 18 - 9), rock: plain("#4a4e56", RAMPS.rock), metal: plain("#3a3f48", RAMPS.metal),
          tower: { color: [230, 230, 222], ramp: RAMPS.wall, shade(c) { if (Math.floor((c.y - 1.05) * 2.2) % 2) c.color = hex("#c4433b"); } },
          lamp: { color: [255, 236, 160], shade(c, t) { c.emit = .9 + .1 * Math.sin(t * 4); c.glyph = "@"; } } },
        overlay(t, W, H, put2, project) {
          const p = project(2.6, 3.6, -4); if (!p) return;
          const a = Math.sin(t * .6) * 1.4;   // the beam sweeps across the sea
          for (let r = 12; r < W * .8; r += 7) for (let k = -2; k <= 2; k++) {
            const ang = a + k * .025, x = p[0] + Math.cos(ang) * r * (Math.cos(t * .6) > 0 ? 1 : -1), y = p[1] + Math.sin(Math.abs(ang)) * r * .12;
            put2(x, y, "-", [255, 236, 170], .32 * (1 - r / (W * .8)));
          }
        },
      };
    } };

  S.shore = { name: "Waves along a quiet shore", tags: /\b(beach(es)?|shore(line)?|seaside|sand|surf(ing)?|seashells?|dunes? by the sea|coves?|tidepools?)\b/i,
    build() {
      const sand = (x, z) => .05 + (z + x * .35 + 2.5) * .12 + .08 * noise2(x * .6, z * .6);
      return { camera: cam([0, 1.6, 6], [-.5, 1, -10], 72), light: [.5, .6, .4], ambient: .25,
        fog: { color: hex("#b8cad6"), density: 0.015 }, sky: sky({ top: "#4a77a5", low: "#e6eef2", clouds: .25, sun: { u: .8, v: .25, r: .04 } }),
        map(x, y, z, t, h) {
          let d = y, m = "sea";
          const s = (y - sand(x, z)) * .7; if (s < d) { d = s; m = "sand"; }
          const r1 = sd.sphere(x + 2.4, y - .1, z + 1.5, .55) + .08 * noise2(x * 5, y * 5); if (r1 < d) { d = r1; m = "rock"; }
          const r2 = sd.sphere(x + 3.2, y, z + .6, .35) + .06 * noise2(x * 6, z * 6); if (r2 < d) { d = r2; m = "rock"; }
          h.m = m; return d;
        },
        materials: { sea: water("#2f6b8a", "#8fc2cf", .8 * 18 - 9), rock: plain("#6d6a66", RAMPS.rock),
          sand: { color: hex("#d8c39a"), ramp: RAMPS.sand, shade(c, t) {
            // The wash line: foam that runs up the sand and back.
            const edge = c.y - (.04 + .05 * Math.sin(t * .8 + c.x * .4));
            if (edge < .03 && edge > -.04) { c.glyph = "~"; c.color = [244, 248, 250]; c.emit = .85; }
            else if (edge < .1) c.color = hex("#b39f78"); } } },
        particles: (t, put) => { for (let i = 0; i < 3; i++) { const a = t * .25 + i * 2; put(Math.cos(a) * 3 + i, 3 + Math.sin(a * 1.3) * .5, -5 - i, Math.sin(t * 5 + i) > 0 ? "v" : "~", [240, 240, 240], .85); } },
      };
    } };

  S.valley = { name: "A river valley homestead", tags: /\b(rivers?|streams?|creeks?|valleys?|homestead(ing)?|riverbank|fishing spot|brook)\b/i,
    build() {
      const riverX = (z) => Math.sin(z * .18) * 2.2 - .4;
      const H = (x, z) => { const r = Math.abs(x - riverX(z)); return Math.min(2.6, r * r * .05) + fbm2(x * .2, z * .2, 3) * 1.2 * clamp(r / 2) - .25; };
      return { camera: cam([.5, 2.3, 7], [0, .9, -6], 67), light: [-.5, .65, .4], ambient: .22,
        fog: { color: hex("#b6c3b4"), density: 0.02 }, sky: sky({ top: "#41678d", low: "#f2dcb0", clouds: .25 }),
        map(x, y, z, t, h) {
          let d = y - .05, m = "river";
          const g = (y - H(x, z)) * .55; if (g < d) { d = g; m = "field"; }
          const c = cabin(x - 2.4, y - H(2.4, -2.5), z + 2.5, h, .9, .5); if (c < d) { d = c; m = h.m; }
          const p = pineField(x, y, z, H, h, { spacing: 1.5, z0: -20, z1: -7, size: .9, skip: (tx, tz) => Math.abs(tx - riverX(tz)) < 1.3 }); if (p < d) { d = p; m = h.m; }
          h.m = m; return d;
        },
        materials: { river: water("#3d6c86", "#9cc4cf", null), cabin: plain("#8a6648", RAMPS.wood), roof: plain("#6e3f33", RAMPS.wall), stone: plain("#7d7a75", RAMPS.stone),
          window: glow("#ffcf7a", .1), door: plain("#4c3424", RAMPS.wood), pine: foliage("#3d6a4c", "#294d3a", RAMPS.pine), bark: plain("#5e4836", RAMPS.wood),
          field: { color: hex("#6d8b4f"), ramp: RAMPS.grass, shade(c) { const band = Math.sin(c.x * 1.4 + c.z * .6); if (c.x > 0 && c.ny > .8 && band > .6) { c.color = hex("#c9b26a"); c.ramp = RAMPS.hay; } } } },
        particles: (t, put) => { smoke(2.0, 1.5, -2.4, t, put); birds(t, put, { y: 3.2, z: -10 }); },
      };
    } };

  S.waterfall = { name: "A waterfall in the gorge", tags: /\b(waterfalls?|cascades?|gorge|canyon|rapids|spring water|falls)\b/i,
    build() {
      return { camera: cam([0, 1.5, 7.5], [0, 2.1, -4], 74), light: [-.3, .7, .5], ambient: .2,
        fog: { color: hex("#a6bbb4"), density: 0.022 }, sky: sky({ top: "#3e6a73", low: "#d8e8d6", clouds: .2 }),
        map(x, y, z, t, h) {
          // The cliff fills z < -4 below its rim; the gorge cuts a notch for the falls.
          const cliff = Math.max(z + 4 + .35 * noise2(x * 1.5, y * 1.5), y - 3.2 - .6 * noise2(x * .5, 2) - Math.abs(x) * .12);
          const notch = sd.box(x, y - 3.6, z + 4, .72, .75, 2);
          let d = Math.max(cliff, -notch) * .7, m = "cliff";
          const ground = y - (.2 * noise2(x * .8, z * .8) + Math.max(0, Math.abs(x) - 1.6) * .25); if (ground < d) { d = ground; m = "moss"; }
          const pool = y - .05; if (pool < d && Math.hypot(x * .55, z + 2.6) < 1.6) { d = pool; m = "pool"; }
          const fall = sd.box(x, y - 1.45, z + 3.95, .62, 1.45, .08); if (fall < d) { d = fall; m = "fall"; }
          const r1 = sd.sphere(x + 1.9, y - .2, z + 1.4, .5) + .1 * noise2(x * 4, y * 4); if (r1 < d) { d = r1; m = "rock"; }
          const r2 = sd.sphere(x - 2, y - .15, z + 1, .42) + .1 * noise2(x * 4, z * 4); if (r2 < d) { d = r2; m = "rock"; }
          h.m = m; return d;
        },
        materials: { cliff: { color: hex("#6b6f69"), ramp: RAMPS.rock, shade(c) { if (c.ny > .6) { c.color = hex("#5d8a55"); c.ramp = RAMPS.grass; } } },
          moss: foliage("#4f7a46", "#6f8f50", RAMPS.grass), rock: plain("#6d706b", RAMPS.rock), pool: water("#2e5e64", "#8fc4c1", null),
          fall: { color: [220, 238, 246], shade(c, t) { const n = noise2(c.x * 9, c.y * 3 + t * 6); c.glyph = n > .66 ? "|" : n > .4 ? "!" : ":"; c.emit = .55 + .45 * n; } } },
        particles: (t, put) => { for (let i = 0; i < 26; i++) { const p = (t * .25 + i / 26) % 1, a = i * 2.4; put(Math.cos(a) * (.4 + p * 1.6), .1 + p * 1.1, -3.6 + Math.sin(a) * .6 + p, "·", [228, 240, 246], .5 * (1 - p)); } },
      };
    } };

  S.desert = { name: "Dunes under a hard sun", tags: /\b(deserts?|dunes?|sahara|arid|cact(us|i)|heat ?wave|drought|camels?|oasis|mojave|outback|dry climate)\b/i,
    build() {
      const H = (x, z) => .9 * Math.abs(Math.sin(x * .35 + z * .25 + 2 * noise2(x * .1, z * .1))) * (1 + -z * .05) + .4 * noise2(x * .3, z * .3) - .3;
      return { camera: cam([0, 1.6, 7], [0, 1.2, -8], 67), light: [.6, .7, .2], ambient: .3,
        fog: { color: hex("#e3c9a0"), density: 0.015 }, sky: sky({ top: "#3d6fa3", low: "#f4dcb0", sun: { u: .72, v: .18, r: .04, color: "#fff2c0", rays: true } }),
        map(x, y, z, t, h) {
          let d = (y - H(x, z)) * .6, m = "dune";
          const mx = x + 7, mz = z + 22, mesa = Math.max(Math.hypot(mx * .35, mz * .7) - 1.8 + y * .12 - .25 * noise2(mx * 1.5, mz * 1.5), y - 2.6 - .15 * noise2(mx * 3, mz), -y) * .8; if (mesa < d) { d = mesa; m = "mesa"; }
          const cx = x - 1.8, cz = z + 1.2, gy = y - H(1.8, -1.2);
          const cactus = Math.min(sd.capsule(cx, gy, cz, 0, 0, 0, 0, 1.3, 0, .13), sd.capsule(cx, gy, cz, 0, .6, 0, .35, .75, 0, .08), sd.capsule(cx, gy, cz, .35, .75, 0, .35, 1.05, 0, .08), sd.capsule(cx, gy, cz, 0, .45, 0, -.3, .55, 0, .07), sd.capsule(cx, gy, cz, -.3, .55, 0, -.3, .8, 0, .07));
          if (cactus < d) { d = cactus; m = "cactus"; }
          h.m = m; return d;
        },
        materials: { dune: { color: hex("#e0b77f"), ramp: " .:-=+*#", shade(c) { c.color = mix(hex("#b97f48"), hex("#f6d9a3"), clamp(c.ny * .9 + .1 * noise2(c.x * 3, c.z * 3)));
            if (Math.sin(c.x * 4 + c.z * 2.5 + 3 * noise2(c.x * .5, c.z * .5)) > .82) c.glyph = "~"; } },
          mesa: { color: hex("#b06b4a"), ramp: RAMPS.rock, shade(c) { if (Math.floor(c.y * 3) % 2) c.color = hex("#c8825a"); } }, cactus: foliage("#5e8a4c", "#43703d", " .:|!#") },
        overlay(t, W, H, put2) { for (let i = 0; i < 40; i++) { const y = H * .55 + (i % 8) * 4, x = (i * 53 + Math.sin(t * 2 + i) * 6) % W; put2(x, y, "~", [255, 236, 200], .08); } },
      };
    } };

  S.winter = { name: "Snowfall over a winter cabin", tags: /\b(snow(y|fall|storm)?|winter|ski(ing)?|frost|freez(e|ing)|blizzard|cold weather|ice ?fishing|sled(ding)?|snowshoe\w*|hypothermia prevention)\b/i,
    build() {
      const H = hills(.9, .16, .03);
      return { camera: cam([0, 1.8, 7], [0, 1.1, -6], 67), light: [-.4, .6, .5], ambient: .3,
        fog: { color: hex("#c5d0dc"), density: 0.025 }, sky: sky({ top: "#5a6c84", low: "#d9e1ea", clouds: .5, cloudColor: "#c8d2de" }),
        map(x, y, z, t, h) {
          let d = (y - H(x, z)) * .55, m = "snow";
          const c = cabin(x + 1.3, y - H(-1.3, -1.5), z + 1.5, h, 1, -.35); if (c < d) { d = c; m = h.m; }
          const p = pineField(x, y, z, H, h, { spacing: 1.6, z0: -25, z1: 0, size: 1, skip: (tx, tz) => Math.hypot(tx + 1.3, tz + 1.5) < 1.6 }); if (p < d) { d = p; m = h.m; }
          h.m = m; return d;
        },
        materials: { snow: plain("#eef2f7", RAMPS.snow), cabin: plain("#7a5a42", RAMPS.wood), stone: plain("#7a7875", RAMPS.stone), window: glow("#ffc66e", .15), door: plain("#4c3424", RAMPS.wood),
          roof: { color: hex("#f2f5f9"), ramp: RAMPS.snow }, bark: plain("#5a4636", RAMPS.wood),
          pine: { color: hex("#3c6450"), ramp: RAMPS.pine, shade(c) { if (c.ny > .55) { c.color = hex("#e8eef3"); c.ramp = RAMPS.snow; } } } },
        particles: (t, put) => smoke(-1.75, 1.6, -1.4, t, put, [210, 214, 222]),
        overlay: (t, W, H, put2) => snowfall(t, W, H, put2),
      };
    } };

  S.storm = { name: "A storm rolling over the hills", tags: /\b(storms?|thunder(storm)?s?|lightning|weather front|gales?|squall|hail|tornado season|severe weather|monsoon)\b/i,
    build() {
      const H = hills(.8, .2, .02);
      return { camera: cam([0, 1.6, 7], [0, 1.4, -6], 68), light: [.2, .6, .5], ambient: .32, fps: 10,
        fog: { color: hex("#4a5262"), density: 0.025 },
        sky: (u, v, t, col, row) => {
          const flash = Math.max(0, Math.sin(t * .9) ** 40);
          const n = fbm2(u * 4 + t * .03, v * 7, 4);
          if (v < .55 && n > .42) return [n > .62 ? "%" : n > .52 ? "=" : "-", mix([92, 100, 122], [230, 234, 246], flash * .8 + (n - .42)), .25 + .45 * (n - .42) + flash * .45];
          return null;
        },
        map(x, y, z, t, h) {
          let d = (y - H(x, z)) * .55, m = "grass";
          const tr = leafy(x - 1.6, y - H(1.6, -1), z + 1, 1.2, h, "darkleaf"); if (tr < d) { d = tr; m = h.m; }
          h.m = m; return d;
        },
        materials: { grass: { color: hex("#4e6845"), ramp: RAMPS.grass, shade(c, t) { const flash = Math.max(0, Math.sin(t * .9) ** 40); c.color = mix(hex("#5d7a4f"), [210, 220, 230], flash * .6); } },
          darkleaf: foliage("#4d7350", "#36573c"), bark: plain("#6a5240", RAMPS.wood) },
        overlay(t, W, H, put2) {
          rain(t, W, H, put2, 200, .3, [150, 168, 196]);
          const flash = Math.sin(t * .9) ** 40;
          if (flash > .2) { let x = W * (.3 + .4 * noise2(Math.floor(t * .9 / Math.PI), 1)), y = 0;
            while (y < H * .6) { put2(x, y, "ϟ", [250, 250, 220], flash); x += (noise2(y * .1, t) - .5) * 14; y += 9; } }
        },
      };
    } };

  S.aurora = { name: "Northern lights over the ice", tags: /\b(aurora|northern lights|arctic|polar|iceland|lapland|norway|greenland|svalbard|tundra|yukon|alaska)\b/i,
    build() {
      const H = (x, z) => z < -6 ? 2.2 * fbm2(x * .15, z * .15, 4) * clamp((-z - 6) / 6) : 0;
      return { camera: cam([0, 1.3, 7], [0, 2, -8], 72), light: [.1, .5, .6], ambient: .25,
        fog: { color: hex("#24364a"), density: 0.015, fade: .35 }, sky: sky({ top: "#050a16", low: "#1d3550", stars: .08, aurora: true }),
        map(x, y, z, t, h) {
          let d = y, m = "ice";
          const g = (y - H(x, z)) * .5; if (g < d) { d = g; m = "snowhill"; }
          const p = pineField(x, y, z, H, h, { spacing: 1.4, z0: -12, z1: -6.5, size: .8 }); if (p < d) { d = p; m = h.m; }
          h.m = m; return d;
        },
        materials: { snowhill: plain("#c9d6e2", RAMPS.snow), pine: foliage("#21362d", "#16261f", RAMPS.pine), bark: plain("#3a2f26", RAMPS.wood),
          ice: { color: hex("#3c5a6e"), ramp: " .-=+", shade(c, t) {
            // The ice catches the aurora's colour.
            const k = .5 + .5 * Math.sin(c.x * .45 + t * .35);
            c.color = mix([70, 160, 130], [120, 90, 170], k); c.emit = .25 + .2 * noise2(c.x * 2, c.z * 3 + t * .1); c.glyph = noise2(c.x * 3, c.z * 6) > .7 ? "-" : "·"; } } },
      };
    } };

  S.cave = { name: "Lantern light at a cave mouth", tags: /\b(caves?|caverns?|spelunk\w*|underground|grottos?|bats?|stalactites?|mines? shaft|tunnels?)\b/i,
    build() {
      return { camera: cam([0, 1.05, 3.4], [0, 1, -6], 76), light: [.1, .4, -1], ambient: .16,
        fog: { color: hex("#0e1014"), density: 0.03, fade: .2 },
        sky: (u, v, t, col, row) => { const k = Math.hypot((u - .5) * 1.6, v - .48); if (k > .27) return null;
          return [hash2(col, row) > .6 ? "*" : "·", mix([235, 238, 210], [130, 170, 120], k / .27), .5 + .4 * (1 - k / .27)]; },
        map(x, y, z, t, h) {
          const tunnel = -(Math.hypot(x * .75, (y - 1.2) * .85) - 1.6 - .35 * noise2(x * 2 + z, y * 2 - z * .5) - Math.max(0, -z - 3) * .06);
          let d = Math.max(tunnel, -(z + 9)) * .7, m = "cave";
          const floor = y - (.05 + .15 * noise2(x * 2, z * 2)); if (floor < d) { d = floor; m = "cavefloor"; }
          for (const [sx, sz, s] of [[-.6, -1.4, .55], [.5, -2.2, .7], [-.2, -3.4, .5], [.9, -.8, .4]]) {
            const st = sd.cone(x - sx, -(y - 2.75), z - sz, .12, s); if (st < d) { d = st; m = "cave"; } }
          const lamp = sd.sphere(x + .7, y - .34, z + .2, .14); if (lamp < d) { d = lamp; m = "lamp"; }
          const base = sd.cyl(x + .7, y - .1, z + .2, .09, .15); if (base < d) { d = base; m = "metal"; }
          h.m = m; return d;
        },
        materials: { cave: { color: hex("#6e6457"), ramp: RAMPS.rock, shade(c, t) {
            // Warm lantern light falls off with distance from the flame.
            const r = Math.hypot(c.x + .7, c.y - .35, c.z + .2), f = .85 + .15 * Math.sin(t * 9) * Math.sin(t * 5.3);
            c.emit = clamp(1.6 / (1 + r * r * .35) * f + .12); c.color = mix(hex("#6a5a4c"), hex("#f0b066"), clamp(1.8 / (1 + r * r * .5))); } },
          cavefloor: { color: hex("#5a5148"), ramp: RAMPS.stone, shade(c, t) { const r = Math.hypot(c.x + .7, c.z + .2), f = .85 + .15 * Math.sin(t * 9) * Math.sin(t * 5.3);
            c.emit = clamp(1.5 / (1 + r * r * .4) * f + .1); c.color = mix(hex("#5a4e44"), hex("#eaa660"), clamp(1.6 / (1 + r * r * .5))); } },
          lamp: { color: [255, 214, 120], shade(c, t) { c.emit = .9 + .1 * Math.sin(t * 9); c.glyph = "@"; } }, metal: plain("#555", RAMPS.metal) },
        particles: (t, put) => { for (let i = 0; i < 4; i++) { const p = (t * .5 + i * .27) % 1; put(-.6 + i * .5, 2.6 - p * 2.5, -1.4 - i * .6, "'", [170, 200, 220], .7 * (1 - p)); }
          for (let i = 0; i < 3; i++) { const a = t * 1.3 + i * 2; put(Math.cos(a) * .9, 2 + Math.sin(a * 2) * .2, -4 - i, Math.sin(t * 12 + i) > 0 ? "w" : "v", [30, 30, 30], .8); } },
      };
    } };

  S.farm = { name: "Fields and a red barn", tags: /\b(farm(s|ing|er|land)?|crops?|harvest\w*|tractors?|barns?|wheat|corn|livestock|silos?|plough|plow(ing)?|agricultur\w*|vegetable garden|garden(ing)?|allotment)\b/i,
    build() {
      const H = hills(.7, .14, .02);
      return { camera: cam([0, 2.2, 7], [0, .9, -6], 67), light: [-.5, .7, .4], ambient: .24,
        fog: { color: hex("#c6cfb5"), density: 0.018 }, sky: sky({ top: "#4b79a8", low: "#f1e2bd", clouds: .28, sun: { u: .15, v: .2, r: .04 } }),
        map(x, y, z, t, h) {
          let d = (y - H(x, z)) * .55, m = "field";
          const bx = x + 2, by = y - H(-2, -3), bz = z + 3;
          const barn = Math.min(sd.box(bx, by - .6, bz, .9, .6, .7), sd.roof(bx, by - 1.2, bz, 1.05, .78, .6)); if (barn < d) { d = barn; m = sd.roof(bx, by - 1.2, bz, 1.05, .78, .6) < sd.box(bx, by - .6, bz, .9, .6, .7) ? "barnroof" : "barn"; }
          const silo = Math.min(sd.cyl(bx - 1.3, by, bz + .2, .38, 1.8), sd.sphere(bx - 1.3, by - 1.8, bz + .2, .38)); if (silo < d) { d = silo; m = "silo"; }
          for (let k = -4; k <= 4; k++) { const f = sd.box(x - k * .8, y - H(k * .8, .6) - .18, z - .6, .03, .2, .03); if (f < d) { d = f; m = "fence"; } }
          const rail = sd.box(x, y - H(x, .6) - .28, z - .6, 3.4, .02, .02); if (rail < d) { d = rail; m = "fence"; }
          h.m = m; return d;
        },
        materials: { barn: plain("#a8402f", RAMPS.wood), barnroof: plain("#5a5550", RAMPS.metal), silo: plain("#c9c4b8", RAMPS.metal), fence: plain("#8a6a4a", RAMPS.wood),
          field: { color: hex("#86a050"), ramp: RAMPS.crop, shade(c, t) {
            const row = Math.sin(c.x * 3.2 + Math.sin(t * .8 + c.z) * .15);
            const plot = Math.floor(c.x * .35 + 3) % 3;
            c.color = plot === 0 ? hex("#d8bb63") : plot === 1 ? hex("#7d9c4a") : hex("#a4b45a");
            c.glyph = c.z > -14 && row > .55 ? (plot === 0 ? "Y" : "\"") : null; } } },
        particles: (t, put) => birds(t, put, { y: 3.4, z: -8, n: 4 }),
      };
    } };

  S.campfire = { name: "A campfire under the stars", tags: /\b(campfires?|camping|camp ?site|tents?|bonfire|marshmallows?|fire ?pit|wild camp(ing)?|bivouac|sleeping bag|start(ing)? a fire|fire ?starting)\b/i,
    build() {
      return { camera: cam([0, 1.1, 4.2], [0, .6, -2], 70), light: [0, .3, 1], ambient: .08,
        fog: { color: hex("#0c1020"), density: 0.06, fade: .5 }, sky: sky({ top: "#03060f", low: "#18213a", stars: .09, milky: true }),
        map(x, y, z, t, h) {
          let d = y - .06 * noise2(x * 2, z * 2), m = "ground";
          const flame = sd.cone(x, y - .08, z + .4, .32, .85 + .12 * Math.sin(t * 6)); if (flame < d) { d = flame; m = "fire"; }
          const l1 = sd.capsule(x, y, z + .4, -.45, .08, .1, .45, .08, -.1, .07), l2 = sd.capsule(x, y, z + .4, -.1, .08, -.45, .1, .08, .45, .07);
          if (Math.min(l1, l2) < d) { d = Math.min(l1, l2); m = "log"; }
          for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, s = sd.sphere(x - Math.cos(a) * .52, y, z + .4 - Math.sin(a) * .52, .1); if (s < d) { d = s; m = "stone"; } }
          const tent = sd.roof(x + 1.6, y, z + 1.8, .75, .8, .9); if (tent < d) { d = tent; m = "tent"; }
          const p = pineField(x, y, z, () => 0, h, { spacing: 1.8, z0: -14, z1: -3, size: 1.3 }); if (p < d) { d = p; m = h.m; }
          h.m = m; return d;
        },
        materials: { fire, log: plain("#5e4532", RAMPS.wood),
          ground: { color: hex("#3a3328"), ramp: RAMPS.grass, shade(c, t) { const r = Math.hypot(c.x, c.z + .4), f = .85 + .15 * Math.sin(t * 8) * Math.sin(t * 3.3); c.emit = clamp(1.5 / (1 + r * r * .7) * f + .06); c.color = mix(hex("#3a342c"), hex("#eaa25a"), clamp(1.6 / (1 + r * r * .6))); } },
          stone: { color: hex("#8a8278"), ramp: RAMPS.stone, shade(c, t) { c.emit = .45 + .1 * Math.sin(t * 8); } },
          tent: { color: hex("#c97b3d"), ramp: RAMPS.wall, shade(c, t) { const r = Math.hypot(c.x, c.z + .4); c.emit = clamp(.9 / (1 + r * r * .45)) * (.9 + .1 * Math.sin(t * 7)); } },
          pine: { color: hex("#2c4236"), ramp: RAMPS.pine, shade(c) { const r = Math.hypot(c.x, c.z + .4); c.emit = clamp(.85 / (1 + r * r * .12)) + .05; } }, bark: plain("#2a221c", RAMPS.wood) },
        particles: (t, put) => { for (let i = 0; i < 16; i++) { const p = (t * .35 + i / 16) % 1; put(Math.sin(i * 3 + t) * .2 * (1 + p), .4 + p * 2.4, -.4 + Math.cos(i * 5) * .15, p < .5 ? "*" : "·", mix([255, 220, 120], [220, 80, 40], p), .9 * (1 - p)); } },
      };
    } };

  S.ruins = { name: "An overgrown city skyline", tags: /\b(cit(y|ies)|urban|downtown|skyscrapers?|ruins?|abandoned|collapse|apocalyp\w*|post-?apocalyp\w*|grid ?down|shtf|bug ?out|evacuat(e|ion)|blackout)\b/i,
    build() {
      return { camera: cam([0, 1.4, 7], [0, 2.2, -8], 70), light: [-.7, .4, .3], ambient: .18,
        fog: { color: hex("#8c7f78"), density: 0.02 }, sky: sky({ top: "#2c2a3e", low: "#d99a6c", clouds: .25, sun: { u: .12, v: .5, r: .05, color: "#ffb070" } }),
        map(x, y, z, t, h) {
          let d = y - .1 * noise2(x, z), m = "rubble";
          for (let i = 0; i < 9; i++) {
            const bx = -7 + i * 1.8 + hash2(i, 1) * .6, bz = -8 - hash2(i, 2) * 6, hgt = 2 + hash2(i, 3) * 4.5;
            const cut = (x - bx) * (hash2(i, 4) - .5) * 1.4;
            const b = Math.max(sd.box(x - bx, y - hgt / 2, z - bz, .7, hgt / 2, .7), y - hgt - cut);
            if (b < d) { d = b; m = "tower"; }
          }
          h.m = m; return d;
        },
        materials: { rubble: foliage("#5d6a45", "#76705e", RAMPS.grass),
          tower: { color: hex("#6e6a70"), ramp: RAMPS.wall, shade(c, t) {
            const wx = Math.floor((c.x + c.z) * 3.2), wy = Math.floor(c.y * 2.6);
            if ((wx + wy) % 2 === 0 && Math.abs(c.ny) < .3) { c.glyph = hash2(wx, wy) > .93 ? "#" : "□"; c.color = hash2(wx, wy) > .93 ? [255, 196, 120] : [40, 40, 46]; if (hash2(wx, wy) > .93) c.emit = .7 + .2 * Math.sin(t + wx); }
            if (c.y < 1.6 + noise2(c.x * 2, c.z) && noise2(c.x * 4, c.y * 4) > .45) { c.color = hex("#5f8a4c"); c.glyph = "%"; } } } },
        particles: (t, put) => birds(t, put, { y: 5, z: -10, n: 5, spread: 4 }),
      };
    } };

  S.meadow = { name: "Deer in a flowering meadow", tags: /\b(deer|wildlife|meadows?|wildflowers?|animals?|bird ?watching|nature walk|grassland|prairie|butterfl(y|ies)|wild animals|tracking animals)\b/i,
    build() {
      const H = hills(.5, .2, .03);
      // A deer facing +x: body, raised neck, head, ears, slim legs, a short tail.
      const deer = (x, y, z) => Math.min(
        sd.capsule(x, y, z, -.28, .74, 0, .26, .76, 0, .16),
        sd.capsule(x, y, z, .24, .8, 0, .42, 1.12, 0, .07),
        sd.capsule(x, y, z, .42, 1.16, 0, .62, 1.08, 0, .065),
        sd.capsule(x, y, z, .4, 1.22, .05, .36, 1.34, .1, .025), sd.capsule(x, y, z, .4, 1.22, -.05, .36, 1.34, -.1, .025),
        ...[[-.22, .06], [.2, .06], [-.22, -.06], [.2, -.06]].map(([lx, lz]) => sd.capsule(x, y, z, lx, 0, lz, lx, .66, lz, .03)),
        sd.capsule(x, y, z, -.42, .8, 0, -.48, .86, 0, .04));
      return { camera: cam([0, 1.5, 8.5], [0, 1, -6], 67), light: [-.4, .7, .4], ambient: .26,
        fog: { color: hex("#c9d6bb"), density: 0.022 }, sky: sky({ top: "#5d8fbf", low: "#eef0d6", clouds: .26 }),
        map(x, y, z, t, h) {
          let d = (y - H(x, z)) * .6, m = "meadow";
          const d1 = deer((x - .9) / 1.2, (y - H(.9, 1)) / 1.2, (z - 1) / 1.2) * 1.2; if (d1 < d) { d = d1; m = "deer"; }
          const d2 = deer(-(x + 1.9) / 1.1, (y - H(-1.9, -1)) / 1.1, (z + 1) / 1.1) * 1.1; if (d2 < d) { d = d2; m = "deer"; }
          const tr = leafy(x - 3.4, y - H(3.4, -5), z + 5, 1.6, h); if (tr < d) { d = tr; m = h.m; }
          h.m = m; return d;
        },
        materials: { deer: { color: hex("#b0764a"), ramp: RAMPS.wall, shade(c) { if (c.ny < -.3) c.color = hex("#e8d8c0"); } }, leaf: foliage("#5b8b4a", "#3e6b3c"), bark: plain("#6a5038", RAMPS.wood),
          meadow: { color: hex("#78a056"), ramp: RAMPS.grass, shade(c, t) { const h = hash2(Math.floor(c.x * 9), Math.floor(c.z * 9));
            if (h > .9 && c.z > -10) { c.glyph = "*"; c.color = [[240, 220, 110], [230, 140, 170], [250, 250, 250], [170, 150, 230]][Math.floor(h * 400) % 4]; c.emit = .8; }
            else c.color = mix(hex("#6a9350"), hex("#9cb562"), noise2(c.x * 2 + Math.sin(t * .6) * .1, c.z * 2)); } } },
        particles: (t, put) => { for (let i = 0; i < 5; i++) { const a = t * .7 + i * 1.7; put(Math.cos(a) * 1.5 + i - 2, .6 + Math.sin(a * 2.3) * .25, -1 - i * .5, Math.sin(t * 9 + i) > 0 ? "ʚ" : "ɞ", [[255, 200, 90], [180, 200, 255], [255, 255, 255]][i % 3], .9); } },
      };
    } };

  S.orchard = { name: "Beehives in the orchard", tags: /\b(bees?|beekeeping|honey|hives?|orchards?|apples?|pollinat\w*|fruit trees?|cider|blossom)\b/i,
    build() {
      const H = hills(.35, .25, .02);
      return { camera: cam([0, 1.5, 6], [0, .9, -5], 67), light: [-.5, .7, .4], ambient: .26,
        fog: { color: hex("#d3d9be"), density: 0.025 }, sky: sky({ top: "#5f90bf", low: "#f4ecd2", clouds: .22, sun: { u: .82, v: .2, r: .035 } }),
        map(x, y, z, t, h) {
          let d = (y - H(x, z)) * .6, m = "grass";
          for (const [tx, tz, s] of [[-2.4, -2.5, 1.2], [2.6, -3.5, 1.3], [-.6, -6, 1.1], [3.8, -8, 1.2], [-4, -7.5, 1.3], [1, -10, 1.2]]) {
            const tr = leafy(x - tx, y - H(tx, tz), z - tz, s, h, "apple"); if (tr < d) { d = tr; m = h.m; } }
          for (const [hx, hz] of [[.2, -1], [1, -1.4], [-.7, -1.6]]) {
            const gy = y - H(hx, hz), b = Math.min(sd.box(x - hx, gy - .35, z - hz, .26, .2, .22), sd.box(x - hx, gy - .62, z - hz, .26, .07, .22), sd.box(x - hx, gy - .75, z - hz, .3, .04, .26));
            if (b < d) { d = b; m = "hive"; } }
          h.m = m; return d;
        },
        materials: { hive: { color: hex("#efe8d6"), ramp: RAMPS.wall, shade(c) { if (Math.abs(c.y % .14) < .02) c.color = hex("#b9a988"); } }, bark: plain("#6e533c", RAMPS.wood),
          apple: { color: hex("#5d8f45"), ramp: RAMPS.leaf, shade(c) { const h = hash2(Math.floor(c.x * 12), Math.floor(c.y * 12 + c.z * 7)); if (h > .9) { c.glyph = "o"; c.color = [214, 58, 46]; } else c.color = mix(hex("#4f7f3f"), hex("#7da656"), noise2(c.x * 4, c.y * 4)); } },
          grass: foliage("#7aa152", "#93b263", RAMPS.grass) },
        particles: (t, put) => { for (let i = 0; i < 14; i++) { const a = t * (1.5 + hash2(i, 1)) + i, r = .4 + hash2(i, 2) * 1.2; put(.2 + Math.cos(a) * r, .9 + Math.sin(a * 1.7) * .35, -1.3 + Math.sin(a) * r * .6, "•", [240, 196, 60], .9); } },
      };
    } };

  S.dawn = { name: "Sunrise over a cabin", tags: /\b(sunrise|dawn|early morning|morning routine|cabin|off[- ]grid living|tiny house|log cabin|homestead life)\b/i,
    build() {
      const H = hills(1, .15, .04);
      return { camera: cam([0, 1.9, 7], [0, 1.7, -6], 67), light: [-.5, .45, .7], ambient: .26,
        fog: { color: hex("#e1b994"), density: 0.025 }, sky: sky({ top: "#3e4f78", low: "#f7c08a", clouds: .3, cloudColor: "#f2a98a", sun: { u: .6, v: .3, r: .045, color: "#ffc070", rays: true } }),
        map(x, y, z, t, h) {
          let d = (y - H(x, z)) * .55, m = "hill";
          const c = cabin(x + .4, y - H(-.4, -1), z + 1, h, 1, .25); if (c < d) { d = c; m = h.m; }
          const p = pineField(x, y, z, H, h, { spacing: 1.9, z0: -22, z1: -3, size: 1.1 }); if (p < d) { d = p; m = h.m; }
          h.m = m; return d;
        },
        materials: { hill: foliage("#5c6f4c", "#86815c", RAMPS.grass), cabin: plain("#7f5b40", RAMPS.wood), roof: plain("#5a3a30", RAMPS.wall), stone: plain("#7a7470", RAMPS.stone),
          window: glow("#ffd080", .1), door: plain("#4c3424", RAMPS.wood), pine: foliage("#3f5f48", "#2c4637", RAMPS.pine), bark: plain("#5a4636", RAMPS.wood) },
        particles: (t, put) => { smoke(-.85, 2.1, -.9, t, put); birds(t, put, { y: 3.6, z: -9 }); },
        overlay: (t, W, H, put2) => { for (let i = 0; i < 60; i++) put2(((i * 41 + t * 6) % (W + 40)) - 20, H * .7 + (i % 5) * 5 + Math.sin(t * .3 + i) * 2, "~", [250, 226, 200], .14); },
      };
    } };

  S.stars = { name: "Camp under the Milky Way", tags: /\b(milky way|galax(y|ies)|stargaz\w*|astronom\w*|telescopes?|meteors?|shooting stars?|night sky|dark sky)\b/i,
    build() {
      const H = (x, z) => 1.6 * fbm2(x * .2, z * .2, 3) * clamp((2 - z) / 8) - .1;
      return { camera: cam([0, 1.15, 6], [0, .95, -8], 72), light: [0, .4, 1], ambient: .08,
        fog: { color: hex("#0b1124"), density: 0.025, fade: .3 }, sky: sky({ top: "#02040b", low: "#16203a", stars: .13, milky: true }),
        map(x, y, z, t, h) {
          let d = (y - H(x, z)) * .55, m = "ridge";
          const tent = sd.roof(x - 1.1, y - H(1.1, .5), z - .5, .5, .6, .55); if (tent < d) { d = tent; m = "tent"; }
          h.m = m; return d;
        },
        materials: { ridge: { color: hex("#1e2a33"), ramp: RAMPS.grass, shade(c) { const r = Math.hypot(c.x - 1.1, c.z - .5); c.emit = .42 + clamp(.9 / (1 + r * r * 1.2)); c.color = mix(hex("#6f8598"), hex("#e9a35a"), clamp(1.1 / (1 + r * r * .8))); } },
          tent: { color: hex("#d8913f"), ramp: RAMPS.wall, shade(c, t) { c.emit = .65 + .08 * Math.sin(t * 2); } } },
        overlay(t, W, H, put2) { const p = (t * .25) % 6; if (p < 1) for (let k = 0; k < 8; k++) put2(W * (.2 + p * .5) - k * 6, H * (.1 + p * .2) - k * 2.4, k ? "·" : "*", [255, 255, 255], .9 * (1 - k / 8)); },
      };
    } };

  S.rain = { name: "Rain over a forest shelter", tags: /\b(rain(y|fall|storm)?|drizzle|downpour|wet weather|tarp shelter|rain ?jacket|waterproof\w*|lean-?to)\b/i,
    build() {
      const H = hills(.4, .2, .02);
      return { camera: cam([0, 1.3, 5], [0, .9, -4], 70), light: [-.3, .7, .5], ambient: .2, fps: 10,
        fog: { color: hex("#6f7f80"), density: 0.04 }, sky: sky({ top: "#3c4a52", low: "#8e9b9c", clouds: .55, cloudColor: "#7d898c" }),
        map(x, y, z, t, h) {
          let d = (y - H(x, z)) * .6, m = "floor";
          const gy = y - H(.3, -1);
          const roof = Math.max(sd.box(x - .3, gy - .7 + (z + 1) * .45, z + 1, .9, .03, .55), -(gy)); if (roof < d) { d = roof; m = "tarp"; }
          const post = Math.min(sd.cyl(x + .5, gy, z + .5, .04, 1), sd.cyl(x - 1.1, gy, z + .5, .04, 1)); if (post < d) { d = post; m = "bark"; }
          const flame = sd.cone(x - .3, gy - .05, z + .2, .14, .32 + .05 * Math.sin(t * 7)); if (flame < d) { d = flame; m = "fire"; }
          const p = pineField(x, y, z, H, h, { spacing: 1.5, z0: -18, z1: -2.5, size: 1.2 }); if (p < d) { d = p; m = h.m; }
          h.m = m; return d;
        },
        materials: { fire, tarp: plain("#4f6e78", RAMPS.wall), bark: plain("#4c3c2e", RAMPS.wood), pine: foliage("#33503f", "#24392f", RAMPS.pine),
          floor: { color: hex("#4b5a3d"), ramp: RAMPS.grass, shade(c, t) { const r = Math.hypot(c.x - .3, c.z + .2); c.emit = clamp(.6 / (1 + r * r * 2)) + .12; c.color = mix(hex("#3e4b34"), hex("#d59050"), clamp(.9 / (1 + r * r * 1.5)));
            if (hash2(Math.floor(c.x * 8 + t * 3), Math.floor(c.z * 8)) > .96) { c.glyph = "o"; c.color = [180, 196, 210]; } } } },
        overlay: (t, W, H, put2) => rain(t, W, H, put2, 220, .12, [168, 186, 200]),
      };
    } };

  return { scenes: S, ids: Object.keys(S), sky };
})();
