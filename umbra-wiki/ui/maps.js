// Umbra Wiki maps: offline OpenStreetMap maps, drawn by Umbra in a military
// TOPOGRAPHIC paper style or a dark TACTICAL one in the Umbra theme, with
// relief shading and contour lines. Areas are downloaded from the side panel
// (maps.py fetches only the chosen area from the daily planet build); a
// small world map is built in. Tiles are drawn once by a worker
// (maps-worker.js) and then only moved and scaled, so panning and zooming
// stay smooth; names are placed on top without overlapping. With a lat/long
// grid, MGRS grid zones and readout, search (towns, streets, water points,
// coordinates, MGRS), waypoints, measuring and full screen.
// Loaded after app.js and uses its helpers ($, Sound, escapeHtml, locked).
"use strict";

(() => {
  const TAU = Math.PI * 2, toRad = Math.PI / 180;
  const clampLat = (lat) => Math.max(-85.0511, Math.min(85.0511, lat));
  const projX = (lon) => (lon + 180) / 360;
  const projY = (lat) => { const s = Math.sin(clampLat(lat) * toRad); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const unX = (x) => x * 360 - 180;
  const unY = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  const wrapLon = (lon) => ((lon + 540) % 360) - 180;

  // --------------------------------------------------------------- view

  let view = { x: 0.53, y: 0.34, z: 3 };
  const MAXZ = 19;
  let W = 0, H = 0, dpr = 1;
  let style = "topo", showGrid = true, tool = "", target = null, measure = [];
  let status = null;                 // /api/maps: the areas on this computer
  let waypoints = [];
  const scale = () => 256 * Math.pow(2, view.z);
  const minZ = () => Math.log2(Math.max(H, 256) / 256);
  const toScreen = (x, y) => [(x - view.x) * scale() + W / 2, (y - view.y) * scale() + H / 2];
  const toWorld = (sx, sy) => [(sx - W / 2) / scale() + view.x, (sy - H / 2) / scale() + view.y];
  const tileZ = () => Math.max(0, Math.min(18, Math.round(view.z - 1)));
  function clampView() {
    view.z = Math.max(minZ(), Math.min(MAXZ, view.z));
    const half = H / 2 / scale();
    view.y = half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, view.y));
  }

  // ------------------------------------------------------------ colours

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ""); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128]; };
  const mix = (a, b, t) => { const [x, y] = [hex(a), hex(b)]; return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join(""); };
  // The paper map follows military topographic colours: blue water, green
  // vegetation, brown relief and contours, red main roads, black buildings.
  const TOPO = {
    sea: "#9fc5d6", land: "#f3ecd9", water: "#a8cde0", water2: "#3f7fb3", farm: "#efe8cc", grass: "#e2eac6",
    scrub: "#dce5bd", park: "#cfe2b0", forest: "#bfd79c", forestMark: "rgba(80, 120, 50, .35)", built: "#ecd7c8",
    built2: "#e3d4cc", cemetery: "#d9dcc6", sand: "#efe1b3", rock: "#dcd6cc", glacier: "#f6f9fb", military: "#f1d8d2",
    militaryMark: "rgba(170, 40, 30, .35)", wet: "#dfe9df", building: "#9c8b7a", path: "#7a5530", casing: "#5a5046",
    minor: "#fbf8ef", major: "#e6904a", highway: "#c0392b", rail: "#1f1f1f", railLadder: "#f7f1df",
    border: "#5b2d6e", border2: "#8a6f8f", contour: "rgba(160, 105, 55, .5)", contourIndex: "rgba(140, 85, 40, .8)",
    shadeRGB: [70, 55, 40], shadeStrength: 190,
    text: "#1b1b1b", textSoft: "#4d4437", waterText: "#2f6386", halo: "rgba(246, 241, 226, .9)", contourText: "#8c5a2a",
    ink: "#8a1c1c", frame: "#1b1b1b", grid: "rgba(20, 40, 70, .32)", gridText: "#1f3550", zone: "rgba(120, 30, 30, .55)",
    collar: "rgba(243, 236, 216, .94)",
  };
  // The colours are worked out once per style and theme, not every frame.
  let palCache = null, palKey = "";
  function palette() {
    if (style === "topo") return TOPO;
    const key = themeSig();
    if (palCache && palKey === key) return palCache;
    palKey = key;
    return (palCache = tacticalPalette());
  }
  function tacticalPalette() {
    const bg = css("--bg") || "#090909", sig = css("--signal") || "#e8d27c", net = css("--net") || "#5fb8c9";
    const acc = css("--accent") || "#e68e0d", fg = css("--fg") || "#cbcbcb", dim = css("--dim") || "#96969a", red = css("--red") || "#e06a6a";
    return {
      sea: mix(net, bg, 0.9), land: mix(css("--bg-2") || "#131313", bg, 0.1), water: mix(net, bg, 0.82), water2: mix(net, bg, 0.35),
      farm: mix(sig, bg, 0.96), grass: mix("#6fbf5a", bg, 0.93), scrub: mix("#6fbf5a", bg, 0.92), park: mix("#6fbf5a", bg, 0.88),
      forest: mix("#6fbf5a", bg, 0.84), forestMark: mix("#6fbf5a", bg, 0.6), built: mix(acc, bg, 0.93), built2: mix(acc, bg, 0.95),
      cemetery: mix(fg, bg, 0.9), sand: mix(sig, bg, 0.85), rock: mix(fg, bg, 0.85), glacier: mix("#ffffff", bg, 0.8),
      military: mix(red, bg, 0.88), militaryMark: mix(red, bg, 0.5),
      wet: mix(net, bg, 0.86), building: mix(fg, bg, 0.72), path: mix(dim, bg, 0.35), casing: mix(bg, "#000000", 0.2),
      minor: mix(fg, bg, 0.55), major: mix(acc, bg, 0.3), highway: acc, rail: mix(fg, bg, 0.4), railLadder: bg,
      border: sig, border2: mix(sig, bg, 0.55), contour: mix(sig, bg, 0.72), contourIndex: mix(sig, bg, 0.5),
      shadeRGB: [0, 0, 0], shadeStrength: 230,
      text: css("--fg-bright") || "#f0f0f0", textSoft: dim, waterText: mix(net, bg, 0.15), halo: bg + "e6", contourText: mix(sig, bg, 0.35),
      ink: sig, frame: sig, grid: mix(sig, bg, 0.82), gridText: mix(sig, bg, 0.3), zone: mix(red, bg, 0.4),
      collar: bg + "ee",
    };
  }
  const themeSig = () => style + (style === "topo" ? "" : css("--bg") + css("--signal") + css("--accent") + css("--net"));

  // -------------------------------------------------------------- tiles

  // What the downloaded areas offer at a tile: the deepest level of detail,
  // elevation and essential points (the built-in world goes to level 3).
  function coverage(z, x, y) {
    const n = 2 ** z;
    const lon0 = (x / n) * 360 - 180, lon1 = ((x + 1) / n) * 360 - 180;
    const lat1 = unY(y / n), lat0 = unY((y + 1) / n);
    let maxz = 3, terrain = 0, points = 0;
    for (const a of (status && status.areas) || []) {
      const b = a.bbox;
      if (b[0] > lon1 || b[2] < lon0 || b[1] > lat1 || b[3] < lat0) continue;
      maxz = Math.max(maxz, a.maxzoom);
      terrain = Math.max(terrain, a.terrain || 0);
      if (a.points) points = 1;
    }
    return { maxz, terrain, points };
  }

  const cache = new Map();      // key -> {bitmap, labels, z, x, y}
  const queued = new Map();     // key -> job waiting for a worker
  const running = new Set();
  const workers = [];
  let sig = "";
  function startWorkers() {
    if (workers.length) return;
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      const w = new Worker("maps-worker.js");
      w.busy = 0;
      w.onmessage = (e) => {
        const m = e.data;
        w.busy--;
        running.delete(m.key);
        if (m.bitmap && m.key.startsWith(sig + "|")) {
          const [z, x, y] = m.key.split("|")[1].split("/").map(Number);
          cache.set(m.key, { bitmap: m.bitmap, labels: m.labels || [], z, x, y });
          trimCache();
          labelsDirty = true;
          frame();
        } else if (m.bitmap && m.bitmap.close) m.bitmap.close();
        pump();
      };
      workers.push(w);
    }
  }
  function trimCache() {
    while (cache.size > 110) {
      const k = cache.keys().next().value;
      const v = cache.get(k);
      if (v.bitmap.close) v.bitmap.close();
      cache.delete(k);
    }
  }
  // Ask for a tile; the most central ones are drawn first.
  function want(z, x, y) {
    const key = `${sig}|${z}/${x}/${y}`;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); return hit; }
    if (!queued.has(key) && !running.has(key)) {
      const c = coverage(z, x, y);
      queued.set(key, { type: "render", key, z, x, y, size: 512, ratio: dpr, pal: palette(),
                        maxz: c.maxz, terrain: c.terrain, points: c.points });
    }
    return null;
  }
  function pump() {
    if (!queued.size) return;
    const tz = tileZ();
    for (const w of workers) {
      while (w.busy < 2 && queued.size) {
        let bestKey = null, bestD = Infinity;
        for (const [k, j] of queued) {
          const n = 2 ** j.z, d = Math.hypot((j.x + 0.5) / n - view.x, (j.y + 0.5) / n - view.y) + (j.z === tz ? 0 : 1);
          if (d < bestD) { bestD = d; bestKey = k; }
        }
        const job = queued.get(bestKey);
        queued.delete(bestKey);
        running.add(bestKey);
        w.busy++;
        w.postMessage(job);
      }
    }
  }
  // A new style or theme, or a new map download: draw everything again.
  function restyle(flush = false) {
    sig = themeSig() + ":" + (status ? status.areas.map((a) => a.id).join(",") : "");
    queued.clear();
    if (flush) {
      for (const v of cache.values()) if (v.bitmap.close) v.bitmap.close();
      cache.clear();
      workers.forEach((w) => w.postMessage({ type: "flush" }));
    }
    labelsDirty = true;
    frame();
  }

  // ------------------------------------------------------------ drawing

  let canvas, ctx, raf = 0;
  function frame() { if (!raf) raf = requestAnimationFrame(draw); }

  function visibleTiles() {
    const z = tileZ(), n = 2 ** z;
    const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
    const out = [];
    for (let ty = Math.max(0, Math.floor(y0 * n)); ty <= Math.min(n - 1, Math.floor(y1 * n)); ty++) {
      for (let tx = Math.floor(x0 * n); tx <= Math.floor(x1 * n); tx++) out.push([z, tx, ty]);
    }
    return out;
  }

  function draw() {
    raf = 0;
    if (!canvas || $("#maps").hidden) return;
    animate();
    const pal = palette();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = pal.sea;
    ctx.fillRect(0, 0, W, H);
    const S = scale(), n = 2 ** tileZ(), size = S / n;
    const shown = [];
    // Tiles go to whole device pixels: when they're shown at their own size
    // (between zoom steps' scaling) they're copied straight, which is fast.
    const dsize = Math.round(size * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const [tz, tx, ty] of visibleTiles()) {
      const wx = ((tx % n) + n) % n;
      const sx = (tx / n - view.x) * S + W / 2, sy = (ty / n - view.y) * S + H / 2;
      const t = want(tz, wx, ty);
      if (t) {
        const native = Math.abs(t.bitmap.width - dsize) <= 1;
        ctx.imageSmoothingEnabled = !native;
        ctx.drawImage(t.bitmap, Math.round(sx * dpr), Math.round(sy * dpr), native ? t.bitmap.width : dsize + 1, native ? t.bitmap.height : dsize + 1);
        shown.push({ t, sx, sy });
        continue;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Not drawn yet: show a lower level magnified (or a higher one shrunk) meanwhile.
      let done = false;
      for (let up = 1; up <= 6 && tz - up >= 0 && !done; up++) {
        const k = 2 ** up, px = Math.floor(wx / k), py = Math.floor(ty / k);
        const p = cache.get(`${sig}|${tz - up}/${px}/${py}`);
        if (p) {
          const bw = p.bitmap.width / k, bh = p.bitmap.height / k;
          ctx.drawImage(p.bitmap, (wx - px * k) * bw, (ty - py * k) * bh, bw, bh, sx, sy, size + 0.6, size + 0.6);
          done = true;
        }
      }
      if (!done && tz < 18) {
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          const c = cache.get(`${sig}|${tz + 1}/${wx * 2 + i}/${ty * 2 + j}`);
          if (c) ctx.drawImage(c.bitmap, sx + (i * size) / 2, sy + (j * size) / 2, size / 2 + 0.6, size / 2 + 0.6);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    pump();
    drawLabels(shown, pal);
    if (showGrid) drawGrid(pal);
    overlay(pal);
    if (moving()) frame();
  }

  // ------------------------------------------------------------- labels

  // Names are drawn over the tiles, so they're never cut at tile edges and
  // never overlap. Each one is rendered once into a little image (a sprite)
  // and reused while the map moves.
  const sprites = new Map();
  let labelsDirty = true, placed = [];
  const PLACE = {   // class: [from tile level, font, letter spacing, capitals]
    country: [1, "700 14px", 3, 1], region: [4, "600 11px", 2, 1], city: [3, "700 13.5px", 0.5, 0], town: [7, "600 12px", 0.3, 0],
    village: [10, "500 11px", 0, 0], hamlet: [12, "500 10.5px", 0, 0], hood: [13, "italic 500 10.5px", 0, 0],
  };
  const POI = {   // kind: [icon, colour, from tile level]
    drinking_water: ["󰖌", "water", 13], water_point: ["󰖌", "water", 13], spring: ["󰖌", "water", 12], water_well: ["󰖌", "water", 13],
    water_tap: ["󰖌", "water", 13], fountain: ["󰖌", "water", 15], watering_place: ["󰖌", "water", 14],
    hospital: ["󰋠", "red", 11], clinic: ["󰋠", "red", 13], doctors: ["󰋠", "red", 14], pharmacy: ["󰐂", "red", 13],
    defibrillator: ["󰗶", "red", 14], first_aid: ["󰋠", "red", 14], fire_station: ["󰈸", "red", 13], police: ["󰒃", "text", 13],
    shelter: ["󰔈", "text", 13], alpine_hut: ["󰔈", "text", 12], wilderness_hut: ["󰔈", "text", 12], camp_site: ["󰔈", "text", 12],
    toilets: ["󰦫", "text", 14], fuel: ["󰊘", "text", 13], supermarket: ["󰒚", "text", 14], peak: ["▲", "brown", 10], volcano: ["▲", "red", 8],
    cave_entrance: ["󰋵", "brown", 13], aerodrome: ["󰀝", "text", 9], station: ["󰔬", "text", 12], ranger_station: ["󰔈", "text", 13],
  };
  function sprite(key, make) {
    let s = sprites.get(key);
    if (!s) {
      s = make();
      sprites.set(key, s);
      if (sprites.size > 900) sprites.delete(sprites.keys().next().value);
    }
    return s;
  }
  function textSprite(text, font, color, halo, spacing = 0, icon = "", iconColor = "") {
    const f = css("--font") || "monospace";
    return sprite([text, font, color, halo, spacing, icon, iconColor].join("|"), () => {
      const m = document.createElement("canvas").getContext("2d");
      m.font = `${font} ${f}`;
      if ("letterSpacing" in m) m.letterSpacing = spacing + "px";
      const tw = text ? m.measureText(text).width : 0;
      const iconW = icon ? 15 : 0;
      const h = parseFloat(font.match(/([\d.]+)px/)[1]);
      const w = Math.ceil(tw + iconW + (icon && text ? 3 : 0) + 6), hh = Math.ceil(h * 1.5 + 4);
      const c = document.createElement("canvas");
      const r = Math.min(2, Math.max(1, dpr));
      c.width = Math.ceil(w * r); c.height = Math.ceil(hh * r);
      const g = c.getContext("2d");
      g.scale(r, r);
      g.textBaseline = "middle";
      g.lineJoin = "round";
      if (icon) {
        g.font = `15px ${f}`;
        g.lineWidth = 3.5; g.strokeStyle = halo; g.strokeText(icon, 3, hh / 2);
        g.fillStyle = iconColor || color; g.fillText(icon, 3, hh / 2);
      }
      if (text) {
        g.font = `${font} ${f}`;
        if ("letterSpacing" in g) g.letterSpacing = spacing + "px";
        const x0 = 3 + iconW + (icon ? 3 : 0);
        g.lineWidth = 3; g.strokeStyle = halo; g.strokeText(text, x0, hh / 2);
        g.fillStyle = color; g.fillText(text, x0, hh / 2);
      }
      return { c, w, h: hh, anchor: icon ? 10 : w / 2 };
    });
  }

  // While the map only slides (same zoom), the last layout is reused and just
  // moved; it's worked out again when tiles arrive, the zoom changes or the
  // map has slid far.
  let layout = null;
  function drawLabels(shown, pal) {
    if (layout && !labelsDirty && layout.z === view.z && layout.style === style &&
        Math.hypot((view.x - layout.x) * scale(), (view.y - layout.y) * scale()) < 220) {
      const dx = (layout.x - view.x) * scale(), dy = (layout.y - view.y) * scale();
      for (const d of layout.items) {
        if (d.dot) {
          ctx.fillStyle = d.color;
          if (d.cap) { ctx.strokeStyle = d.color; ctx.lineWidth = 1.2; ctx.strokeRect(d.x + dx - 4, d.y + dy - 4, 8, 8); ctx.fillRect(d.x + dx - 1.5, d.y + dy - 1.5, 3, 3); }
          else { ctx.beginPath(); ctx.arc(d.x + dx, d.y + dy, d.r, 0, TAU); ctx.fill(); }
        } else if (d.a) { ctx.save(); ctx.translate(d.x + dx, d.y + dy); ctx.rotate(d.a); ctx.drawImage(d.s.c, -d.s.w / 2, -d.s.h / 2, d.s.w, d.s.h); ctx.restore(); }
        else ctx.drawImage(d.s.c, d.x + dx, d.y + dy, d.s.w, d.s.h);
      }
      return;
    }
    const items = [];
    layout = { z: view.z, x: view.x, y: view.y, style, items };
    const tz = tileZ(), S = scale();
    const boxes = [];
    const fits = (b) => {
      if (b[2] < 0 || b[0] > W || b[3] < 0 || b[1] > H) return false;
      for (const o of boxes) if (o[0] < b[2] && o[2] > b[0] && o[1] < b[3] && o[3] > b[1]) return false;
      boxes.push(b);
      return true;
    };
    for (const w of waypoints) { const [x, y] = toScreen(projX(w.lon), projY(w.lat)); boxes.push([x - 12, y - 22, x + 12, y + 16]); }
    if (labelsDirty) {
      placed = [];
      for (const { t, sx, sy } of shown) for (const l of t.labels) placed.push({ l, t, dx: sx, dy: sy });
      const pri = (l) => l.t === "place" ? 100 + ({ country: 60, city: 40, region: 30, town: 20, village: 10 }[l.cls] || 0) + (l.rank || 0) * 2
        : l.t === "poi" ? (l.ess || (POI[l.kind] && POI[l.kind][1] === "water") ? 90 : 50) : l.t === "water" ? 60 : l.t === "road" ? 30 + l.rank * 5 : 5;
      placed.sort((a, b) => pri(b.l) - pri(a.l));
      labelsDirty = false;
    }
    const size = S / 2 ** tz;
    const seen = new Set();
    for (const p of placed) {
      const { l, t } = p;
      if (t.z !== tz) continue;
      // Where the tile is now (it may be a copy of the world to the side).
      const n = 2 ** t.z;
      let sx = (t.x / n - view.x) * S + W / 2;
      sx += Math.round((view.x - (t.x + 0.5) / n)) * S;
      const sy = (t.y / n - view.y) * S + H / 2;
      const x = sx + (l.x / 512) * size, y = sy + (l.y / 512) * size;
      if (x < -60 || x > W + 60 || y < -30 || y > H + 30) continue;
      if (l.t === "place") {
        const cfg = PLACE[l.cls];
        if (!cfg || tz < cfg[0] || (l.cls === "country" && tz > 7) || (l.cls === "region" && tz > 10)) continue;
        const dk = l.cls + l.text;
        if (seen.has(dk)) continue;
        const text = cfg[3] ? l.text.toUpperCase() : l.text;
        const s = textSprite(text, cfg[1], l.cls === "region" || l.cls === "hood" ? pal.textSoft : pal.text, pal.halo, cfg[2]);
        const dot = tz < 13 && /city|town|village/.test(l.cls);
        const bx = dot ? x + 5 : x - s.w / 2, by = y - s.h / 2;
        if (!fits([bx, by, bx + s.w, by + s.h])) continue;
        seen.add(dk);
        ctx.drawImage(s.c, bx, by, s.w, s.h);
        items.push({ s, x: bx, y: by });
        if (dot) {
          ctx.fillStyle = pal.text;
          if (l.cap && l.cls === "city") { ctx.strokeStyle = pal.text; ctx.lineWidth = 1.2; ctx.strokeRect(x - 4, y - 4, 8, 8); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
          else { ctx.beginPath(); ctx.arc(x, y, l.cls === "city" ? 3 : 2.2, 0, TAU); ctx.fill(); }
          items.push({ dot: 1, x, y, color: pal.text, cap: l.cap && l.cls === "city", r: l.cls === "city" ? 3 : 2.2 });
        }
      } else if (l.t === "poi") {
        const cfg = POI[l.kind];
        if (!cfg || tz < cfg[2]) continue;
        const color = cfg[1] === "water" ? pal.water2 : cfg[1] === "red" ? "#c0392b" : cfg[1] === "brown" ? pal.contourText : pal.text;
        const name = l.kind === "peak" || l.kind === "volcano" ? [l.text, l.ele ? Math.round(l.ele) + " m" : ""].filter(Boolean).join(" ") : tz >= 15 ? l.text : "";
        const s = textSprite(name, "italic 500 10px", pal.textSoft, pal.halo, 0, cfg[0], color);
        const bx = x - s.anchor, by = y - s.h / 2;
        if (!fits([bx, by, bx + s.w, by + s.h])) continue;
        ctx.drawImage(s.c, bx, by, s.w, s.h);
        items.push({ s, x: bx, y: by });
      } else if (l.t === "water") {
        const dk = "w" + l.text;
        if (seen.has(dk)) continue;
        const s = textSprite(l.text, "italic 600 11px", pal.waterText, pal.halo, 1);
        if (!fits([x - s.w / 2, y - s.h / 2, x + s.w / 2, y + s.h / 2])) continue;
        seen.add(dk);
        ctx.drawImage(s.c, x - s.w / 2, y - s.h / 2, s.w, s.h);
        items.push({ s, x: x - s.w / 2, y: y - s.h / 2 });
      } else if (l.t === "road" || l.t === "contour") {
        if (l.t === "road" && (tz < 13 || (tz < 14 && l.rank < 2))) continue;
        const dk = "r" + l.text + Math.round(x / 280) + Math.round(y / 280);
        if (l.t === "road" && seen.has(dk)) continue;
        const s = l.t === "road" ? textSprite(l.text, "500 10.5px", pal.text, pal.halo, 0.3) : textSprite(l.text, "9px", pal.contourText, pal.halo);
        if (l.t === "road" && l.len * (size / 512) < s.w * 0.9) continue;
        const r = Math.max(s.w, s.h) / 2 + 1;
        if (!fits([x - r, y - r * 0.55, x + r, y + r * 0.55])) continue;
        if (l.t === "road") seen.add(dk);
        ctx.save(); ctx.translate(x, y); ctx.rotate(l.a); ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h); ctx.restore();
        items.push({ s, x, y, a: l.a || 1e-6 });
      }
    }
  }

  // -------------------------------------------------------------- grid

  // Latitude/longitude lines with degree labels on the collar, the MGRS grid
  // zones (6° × 8°) with their names, and alternating ticks on the frame.
  function drawGrid(pal) {
    const g = ctx, font = css("--font") || "monospace";
    const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
    const lon0 = unX(x0), lon1 = unX(x1), lat0 = unY(Math.min(1, y1)), lat1 = unY(Math.max(0, y0));
    const steps = [30, 15, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
    const pxPerDeg = scale() / 360;
    const step = steps.find((s) => s * pxPerDeg < 190) || 0.001;
    g.strokeStyle = pal.grid; g.lineWidth = 1;
    g.beginPath();
    for (let lon = Math.ceil(lon0 / step) * step; lon <= lon1; lon += step) { const [x] = toScreen(projX(lon), 0); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H); }
    for (let lat = Math.ceil(Math.max(-85, lat0) / step) * step; lat <= Math.min(85, lat1); lat += step) { const [, y] = toScreen(0, projY(lat)); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); }
    g.stroke();
    if (view.z > 3 && view.z < 9.5) {
      g.strokeStyle = pal.zone; g.lineWidth = 1.2; g.setLineDash([10, 4]);
      g.beginPath();
      for (let lon = Math.ceil((lon0 + 180) / 6) * 6 - 180; lon <= lon1; lon += 6) { const [x] = toScreen(projX(lon), 0); g.moveTo(x, 0); g.lineTo(x, H); }
      for (let lat = -80; lat <= 84; lat += 8) { if (lat < lat0 - 8 || lat > lat1 + 8) continue; const [, y] = toScreen(0, projY(lat)); g.moveTo(0, y); g.lineTo(W, y); }
      g.stroke(); g.setLineDash([]);
      g.font = `700 11px ${font}`; g.textAlign = "left"; g.textBaseline = "top"; g.fillStyle = pal.zone;
      for (let lon = Math.floor((lon0 + 180) / 6) * 6 - 180; lon <= lon1; lon += 6) {
        for (let lat = -80; lat < 84; lat += 8) {
          if (lat + 8 < lat0 || lat > lat1) continue;
          const [x, y] = toScreen(projX(lon + 0.3), projY(Math.min(84, lat + 8) - 0.3));
          g.fillText(`${Math.floor(((wrapLon(lon + 3) + 180) % 360) / 6) + 1}${BANDS[Math.floor((lat + 80) / 8)]}`, x + 4, y + 4);
        }
      }
    }
    const M = 16;
    g.fillStyle = pal.collar;
    g.fillRect(0, 0, W, M); g.fillRect(0, H - M, W, M); g.fillRect(0, 0, M, H); g.fillRect(W - M, 0, M, H);
    g.strokeStyle = pal.frame; g.lineWidth = 1.2;
    g.strokeRect(M + 0.5, M + 0.5, W - 2 * M - 1, H - 2 * M - 1);
    g.fillStyle = pal.gridText; g.font = `600 9.5px ${font}`; g.textBaseline = "middle"; g.textAlign = "center";
    const digits = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
    const fmt = (v, pos, neg) => `${Math.abs(v).toFixed(digits)}°${v >= 0 ? pos : neg}`;
    for (let lon = Math.ceil(lon0 / step) * step; lon <= lon1; lon += step) {
      const [x] = toScreen(projX(lon), 0);
      if (x < M + 24 || x > W - M - 24) continue;
      g.fillText(fmt(wrapLon(lon), "E", "W"), x, M / 2); g.fillText(fmt(wrapLon(lon), "E", "W"), x, H - M / 2);
    }
    for (let lat = Math.ceil(Math.max(-85, lat0) / step) * step; lat <= Math.min(85, lat1); lat += step) {
      const [, y] = toScreen(0, projY(lat));
      if (y < M + 16 || y > H - M - 16) continue;
      g.save(); g.translate(M / 2, y); g.rotate(-Math.PI / 2); g.fillText(fmt(lat, "N", "S"), 0, 0); g.restore();
      g.save(); g.translate(W - M / 2, y); g.rotate(Math.PI / 2); g.fillText(fmt(lat, "N", "S"), 0, 0); g.restore();
    }
    const tick = Math.max(24, (step * pxPerDeg) / 4);
    g.fillStyle = pal.frame;
    for (let x = M, i = 0; x < W - M; x += tick, i++) if (i % 2 === 0) { g.fillRect(x, M - 3, Math.min(tick, W - M - x), 3); g.fillRect(x, H - M, Math.min(tick, W - M - x), 3); }
    for (let y = M, i = 0; y < H - M; y += tick, i++) if (i % 2 === 0) { g.fillRect(M - 3, y, 3, Math.min(tick, H - M - y)); g.fillRect(W - M, y, 3, Math.min(tick, H - M - y)); }
  }

  // Waypoints, the searched place, the measuring line and the area being
  // chosen for download.
  function overlay(pal) {
    const g = ctx, font = css("--font") || "monospace", ink = pal.ink;
    const halo = style === "topo" ? "#f7f1df" : pal.sea;
    for (const w of waypoints) {
      const [x, y] = toScreen(projX(w.lon), projY(w.lat));
      if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
      g.font = `18px ${font}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 3.5; g.strokeStyle = halo; g.strokeText(ICON[w.icon] || ICON.pin, x, y - 9);
      g.fillStyle = ink; g.fillText(ICON[w.icon] || ICON.pin, x, y - 9);
      g.font = `700 10px ${font}`;
      g.strokeText(w.name.toUpperCase(), x, y + 9); g.fillText(w.name.toUpperCase(), x, y + 9);
    }
    if (target) {
      const [x, y] = toScreen(projX(target.lon), projY(target.lat));
      g.strokeStyle = ink; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 11, 0, TAU); g.stroke();
      if (!document.body.classList.contains("reduce-motion")) {
        const pulse = (performance.now() / 900) % 1;
        g.globalAlpha = 1 - pulse; g.beginPath(); g.arc(x, y, 11 + pulse * 22, 0, TAU); g.stroke(); g.globalAlpha = 1;
      }
      g.beginPath(); g.moveTo(x - 19, y); g.lineTo(x - 6, y); g.moveTo(x + 6, y); g.lineTo(x + 19, y);
      g.moveTo(x, y - 19); g.lineTo(x, y - 6); g.moveTo(x, y + 6); g.lineTo(x, y + 19); g.stroke();
    }
    if (measure.length) {
      g.strokeStyle = ink; g.lineWidth = 2; g.setLineDash([8, 5]);
      g.beginPath();
      measure.forEach((m, i) => { const [x, y] = toScreen(projX(m.lon), projY(m.lat)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
      g.stroke(); g.setLineDash([]);
      let total = 0;
      measure.forEach((m, i) => {
        const [x, y] = toScreen(projX(m.lon), projY(m.lat));
        g.fillStyle = ink; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill();
        if (i) {
          total += distance(measure[i - 1], m);
          g.font = `700 10.5px ${font}`; g.textAlign = "left"; g.textBaseline = "bottom";
          g.lineWidth = 3; g.strokeStyle = halo;
          g.strokeText(fmtDist(total), x + 7, y - 5); g.fillText(fmtDist(total), x + 7, y - 5);
        }
      });
    }
    if (chosenBox) {
      const [ax, ay] = toScreen(projX(chosenBox[0]), projY(chosenBox[3])), [bx, by] = toScreen(projX(chosenBox[2]), projY(chosenBox[1]));
      const sigc = css("--signal") || "#e8d27c";
      g.save();
      g.strokeStyle = sigc; g.lineWidth = 2; g.setLineDash([10, 6]);
      g.fillStyle = sigc + "22";
      g.fillRect(ax, ay, bx - ax, by - ay); g.strokeRect(ax, ay, bx - ax, by - ay);
      g.restore();
    }
  }

  // ------------------------------------------------- coordinates, MGRS

  const units = () => ((window.UmbraProfile && window.UmbraProfile.data.units) === "imperial" ? "mi" : "km");
  function distance(a, b) {
    const dLat = (b.lat - a.lat) * toRad, dLon = (b.lon - a.lon) * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function fmtDist(km) {
    if (units() === "mi") { const mi = km * 0.621371; return mi < 1 ? `${Math.round(mi * 5280)} FT` : `${mi.toFixed(mi < 10 ? 2 : 1)} MI`; }
    return km < 1 ? `${Math.round(km * 1000)} M` : `${km.toFixed(km < 10 ? 2 : 1)} KM`;
  }
  const fmtLat = (v) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? "N" : "S"}`;
  const fmtLon = (v) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? "E" : "W"}`;
  const BANDS = "CDEFGHJKLMNPQRSTUVWX";
  function toMGRS(lat, lon, digits = 5) {
    if (lat < -80 || lat > 84) return "—";
    let zone = Math.floor((lon + 180) / 6) + 1;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
    if (lat >= 72 && lat < 84) { if (lon >= 0 && lon < 9) zone = 31; else if (lon < 21) zone = 33; else if (lon < 33) zone = 35; else if (lon < 42) zone = 37; }
    const { e, n } = utm(lat, lon, zone);
    const band = BANDS[Math.min(19, Math.floor((lat + 80) / 8))];
    const set = ((zone - 1) % 6) + 1;
    const col = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"][(set - 1) % 3][Math.floor(e / 100000) - 1];
    const row = "ABCDEFGHJKLMNPQRSTUV"[(Math.floor(n / 100000) + (set % 2 === 0 ? 5 : 0)) % 20];
    const f = (v) => String(Math.floor(v % 100000)).padStart(5, "0").slice(0, digits);
    return `${zone}${band} ${col}${row} ${f(e)} ${f(n)}`;
  }
  function utm(lat, lon, zone) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const phi = lat * toRad, lam = lon * toRad, lam0 = ((zone - 1) * 6 - 180 + 3) * toRad;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2;
    const A = Math.cos(phi) * (lam - lam0);
    const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi)
      + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
    const e = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
    let n = k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
    if (lat < 0) n += 10000000;
    return { e, n };
  }
  function fromMGRS(text) {
    const m = /^\s*(\d{1,2})\s*([C-HJ-NP-X])\s*([A-HJ-NP-Z])([A-HJ-NP-V])\s*(\d+)\s*(\d*)\s*$/i.exec(text);
    if (!m) return null;
    const zone = +m[1], band = m[2].toUpperCase(), col = m[3].toUpperCase(), row = m[4].toUpperCase();
    const digits = m[5] + m[6];
    if (digits.length % 2) return null;
    const half = digits.length / 2;
    const ee = half ? +digits.slice(0, half) * 10 ** (5 - half) : 0, nn = half ? +digits.slice(half) * 10 ** (5 - half) : 0;
    const set = ((zone - 1) % 6) + 1;
    const e = (["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"][(set - 1) % 3].indexOf(col) + 1) * 100000 + ee;
    const rowIdx = ("ABCDEFGHJKLMNPQRSTUV".indexOf(row) - (set % 2 === 0 ? 5 : 0) + 20) % 20;
    const bandLat = -80 + BANDS.indexOf(band) * 8;
    const nBand = utm(bandLat, (zone - 1) * 6 - 180 + 3, zone).n;
    let n = rowIdx * 100000 + nn;
    while (n < nBand - 100000) n += 2000000;
    const ll = fromUTM(e, n, zone, bandLat < 0);
    return ll && Math.abs(ll.lat - (bandLat + 4)) < 6 ? ll : null;
  }
  function fromUTM(e, n, zone, south) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const x = e - 500000, y = south ? n - 10000000 : n;
    const mu = y / k0 / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
    const N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), T1 = Math.tan(p1) ** 2, C1 = ep2 * Math.cos(p1) ** 2;
    const R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = x / (N1 * k0);
    const lat = p1 - (N1 * Math.tan(p1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
    const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(p1);
    return { lat: lat / toRad, lon: ((zone - 1) * 6 - 180 + 3) + lon / toRad };
  }
  function parseCoords(text) {
    const t = text.trim().toUpperCase();
    const dms = /^(\d{1,2})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)?["″]?\s*([NS])[,\s]+(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)?["″]?\s*([EW])$/.exec(t);
    if (dms) return { lat: (+dms[1] + dms[2] / 60 + (+dms[3] || 0) / 3600) * (dms[4] === "S" ? -1 : 1), lon: (+dms[5] + dms[6] / 60 + (+dms[7] || 0) / 3600) * (dms[8] === "W" ? -1 : 1) };
    const dec = /^(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?[,\s]+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?$/.exec(t);
    if (dec) {
      const lat = +dec[1] * (dec[2] === "S" ? -1 : 1), lon = +dec[3] * (dec[4] === "W" ? -1 : 1);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
    return fromMGRS(text);
  }

  // ------------------------------------------------------------- search

  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const KIND = {   // what a result is, its icon, and the zoom to show it at
    country: ["COUNTRY", "󰇧", 5], region: ["REGION", "󰍍", 7], city: ["CITY", "󰅆", 11], town: ["TOWN", "󰴕", 13],
    village: ["VILLAGE", "󰋜", 14], hamlet: ["HAMLET", "󰋜", 15], locality: ["PLACE", "󰋜", 13], neighbourhood: ["DISTRICT", "󰋜", 15],
    macrohood: ["DISTRICT", "󰋜", 14], street: ["STREET", "󰑢", 16.5], water: ["WATER", "󰖌", 14.5], poi: ["PLACE", "󰍎", 16.5],
    coords: ["COORDINATES", "󰆤", 14], waypoint: ["WAYPOINT", "󰈻", 15],
  };
  function kindOf(h) {
    if (h.kind === "poi") {
      const p = POI[h.detail];
      return [String(h.detail || "place").replace(/_/g, " ").toUpperCase(), p ? p[0] : "󰍎", 16.5];
    }
    if (h.kind === "locality" && KIND[h.detail]) return KIND[h.detail];
    return KIND[h.kind] || KIND.locality;
  }
  async function search(q) {
    const t = norm(q.trim());
    if (!t) return [];
    const hits = [];
    const coord = parseCoords(q);
    if (coord) hits.push({ kind: "coords", name: `${fmtLat(coord.lat)}  ${fmtLon(coord.lon)}`, lat: coord.lat, lon: coord.lon });
    for (const w of waypoints) if (norm(w.name).includes(t)) hits.push({ kind: "waypoint", name: w.name, lat: w.lat, lon: w.lon });
    if (t.length >= 2) {
      const lat = unY(view.y), lon = wrapLon(unX(view.x));
      try { hits.push(...await (await fetch(`/api/mapsearch?q=${encodeURIComponent(q.trim())}&lat=${lat}&lon=${lon}`)).json()); } catch {}
    }
    return hits.slice(0, 14);
  }

  // ------------------------------------------------------------- motion

  // Everything that moves the map eases: flights, zoom and flicks.
  let flight = null, zoomTo = null, fling = null;
  const moving = () => !!(flight || zoomTo || fling || (target && !document.body.classList.contains("reduce-motion")));
  function animate() {
    const now = performance.now();
    if (flight) {
      const f = flight, t = Math.min(1, (now - f.t0) / f.dur), e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      view.x = f.from.x + (f.to.x - f.from.x) * e;
      view.y = f.from.y + (f.to.y - f.from.y) * e;
      view.z = f.from.z + (f.to.z - f.from.z) * e - Math.sin(Math.PI * t) * f.dip;
      if (t >= 1) { flight = null; view.x = ((view.x % 1) + 1) % 1; }
      clampView(); readout();
    }
    if (zoomTo) {
      const [wx, wy] = toWorld(zoomTo.sx, zoomTo.sy);
      const dz = (zoomTo.z - view.z) * 0.22;
      view.z += Math.abs(dz) < 0.002 ? zoomTo.z - view.z : dz;
      clampView();
      const [nx, ny] = toWorld(zoomTo.sx, zoomTo.sy);
      view.x += wx - nx; view.y += wy - ny;
      clampView();
      if (Math.abs(view.z - zoomTo.z) < 0.001) zoomTo = null;
      readout();
    }
    if (fling) {
      view.x -= fling.vx / scale(); view.y -= fling.vy / scale();
      fling.vx *= 0.9; fling.vy *= 0.9;
      clampView();
      if (Math.hypot(fling.vx, fling.vy) < 0.3) { fling = null; view.x = ((view.x % 1) + 1) % 1; }
    }
    if (flight || zoomTo || fling) labelsDirty = true;
  }
  let lastTz = -1;
  function flyTo(lat, lon, z) {
    zoomTo = fling = null;
    const from = { ...view }, to = { x: projX(lon), y: projY(lat), z: whole(z) };
    if (Math.abs(to.x - from.x) > 0.5) from.x += to.x > from.x ? 1 : -1;
    const dist = Math.hypot(to.x - from.x, to.y - from.y) * 256 * 2 ** Math.min(from.z, to.z);
    const dip = Math.min(4, Math.max(0, Math.log2(dist / 500)));
    flight = { from, to, dip, t0: performance.now(), dur: document.body.classList.contains("reduce-motion") ? 1 : Math.min(1800, 700 + dist / 4) };
    frame();
  }
  // Zooming glides freely, then settles on the nearest whole level: there the
  // tiles are shown at their own size (sharpest, and fastest to move).
  let snapTimer = 0;
  const whole = (z) => Math.max(minZ(), Math.min(MAXZ, Math.round(z)));
  function zoomAt(sx, sy, dz) {
    flight = fling = null;
    const base = zoomTo ? zoomTo.z : view.z;
    zoomTo = { sx, sy, z: Math.max(minZ(), Math.min(MAXZ, base + dz)) };
    clearTimeout(snapTimer);
    snapTimer = setTimeout(() => {
      const z = zoomTo ? zoomTo.z : view.z;
      if (Math.abs(z - whole(z)) > 0.01) { zoomTo = { sx, sy, z: whole(z) }; frame(); }
    }, 180);
    frame();
  }

  // ----------------------------------------------------------------- UI

  const ICON = { pin: "󰍎", camp: "󰔈", water: "󰖌", danger: "󰀪", rally: "󰈻", cache: "󰜦", medical: "󰋠", home: "󰋜" };
  const ICON_NAMES = { pin: "Pin", camp: "Camp", water: "Water", danger: "Danger", rally: "Rally point", cache: "Cache", medical: "Medical", home: "Home" };
  let panel = "";

  function build() {
    const el = document.createElement("div");
    el.id = "maps";
    el.className = "maps";
    el.hidden = true;
    el.innerHTML = `
      <div class="mp-head">
        <span class="lo-title"><span class="spin" data-spin>✻</span> MAPS</span>
        <div class="mp-search"><span class="g">󰍉</span>
          <input placeholder="Search towns, streets, water, coordinates or MGRS…" spellcheck="false" autocomplete="off">
          <div class="mp-results" hidden></div></div>
        <div class="mp-tools">
          <div class="pf-choice mp-style"><button data-s="topo">TOPO</button><button data-s="tactical">TACTICAL</button></div>
          <button class="ctl mp-t" data-t="grid" title="Grid lines and MGRS zones (G)"><span class="g">󰋁</span></button>
          <button class="ctl mp-t" data-t="waypoint" title="Drop a waypoint (W)"><span class="g">󰍎</span></button>
          <button class="ctl mp-t" data-t="measure" title="Measure a distance (M); right-click ends"><span class="g">󰑭</span></button>
          <button class="ctl mp-t" data-t="points" title="Your waypoints"><span class="g">󰈻</span></button>
          <button class="ctl mp-t" data-t="packs" title="Download maps"><span class="g">󰇚</span></button>
          <button class="ctl mp-t" data-t="full" title="Full screen (F)"><span class="g">󰊓</span></button>
          <button class="ghost mp-close" title="Close (Esc)">CLOSE ✕</button>
        </div>
      </div>
      <div class="mp-body">
        <canvas class="mp-canvas"></canvas>
        <div class="mp-cross" aria-hidden="true"></div>
        <div class="mp-rail">
          <div class="mp-compass" aria-hidden="true"><i></i><span>N</span></div>
          <button class="mp-ctl" data-z="1" title="Zoom in (+)"><span class="g">󰐕</span></button>
          <button class="mp-ctl" data-z="-1" title="Zoom out (−)"><span class="g">󰍴</span></button>
          <button class="mp-ctl" data-z="0" title="Whole world"><span class="g">󰇧</span></button>
        </div>
        <div class="mp-scale"><i></i><span></span></div>
        <div class="mp-card" hidden></div>
        <aside class="mp-panel" hidden></aside>
        <div class="mp-hint" hidden></div>
      </div>
      <div class="mp-foot"><span class="mp-coord"></span><span class="mp-mgrs"></span><span class="mp-zl"></span>
        <span class="mp-credit">© OPENSTREETMAP CONTRIBUTORS · PROTOMAPS · TERRAIN TILES</span></div>`;
    document.body.appendChild(el);
    canvas = el.querySelector(".mp-canvas");
    ctx = canvas.getContext("2d");
    wire(el);
    new ResizeObserver(resize).observe(el.querySelector(".mp-body"));
  }

  function resize() {
    const body = $("#maps .mp-body");
    if (!body || $("#maps").hidden) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = body.clientWidth; H = body.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    clampView();
    labelsDirty = true;
    frame();
    readout();
  }

  function readout(sx, sy) {
    const el = $("#maps");
    if (!el || el.hidden) return;
    const [x, y] = sx === undefined ? [view.x, view.y] : toWorld(sx, sy);
    const lat = unY(Math.max(0, Math.min(1, y))), lon = wrapLon(unX(x));
    el.querySelector(".mp-coord").textContent = `${sx === undefined ? "CENTRE" : "CURSOR"}  ${fmtLat(lat)}  ${fmtLon(lon)}`;
    el.querySelector(".mp-mgrs").textContent = `MGRS ${toMGRS(lat, lon)}`;
    const mPerPx = (40075016 * Math.cos(unY(view.y) * toRad)) / scale();
    el.querySelector(".mp-zl").textContent = `ZOOM ${view.z.toFixed(1)} · 1:${fmtScale(mPerPx * 3780)}`;
    const km = (mPerPx * 110) / 1000, mi = units() === "mi";
    const nice = [0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((v) => v >= km * (mi ? 0.621 : 1) * 0.7) || 5000;
    el.querySelector(".mp-scale i").style.width = Math.round(((mi ? nice / 0.621371 : nice) * 1000) / mPerPx) + "px";
    el.querySelector(".mp-scale span").textContent = nice < 1 ? `${Math.round(nice * (mi ? 5280 : 1000))} ${mi ? "FT" : "M"}` : `${nice} ${mi ? "MI" : "KM"}`;
    if (tileZ() !== lastTz) { lastTz = tileZ(); labelsDirty = true; }
  }
  const fmtScale = (v) => (v > 1e6 ? (v / 1e6).toFixed(v > 1e7 ? 0 : 1) + "M" : v > 1e3 ? Math.round(v / 1e3) + "K" : Math.round(v) + "");

  function setTool(t) {
    tool = tool === t ? "" : t;
    const el = $("#maps");
    el.querySelectorAll(".mp-t[data-t=waypoint], .mp-t[data-t=measure]").forEach((b) => b.classList.toggle("on", b.dataset.t === tool));
    el.classList.toggle("tooling", !!tool);
    const hint = el.querySelector(".mp-hint");
    hint.hidden = !tool;
    hint.textContent = tool === "waypoint" ? "CLICK THE MAP TO DROP A WAYPOINT · ESC TO CANCEL"
      : tool === "measure" ? "CLICK POINTS TO MEASURE · RIGHT-CLICK OR ENTER TO FINISH · ESC TO CLEAR" : "";
    if (tool !== "measure") measure = [];
    frame();
    Sound.click();
  }

  function wire(el) {
    const input = el.querySelector(".mp-search input"), results = el.querySelector(".mp-results");
    let hits = [], sel = 0, token = 0, typing = 0;
    const showResults = () => {
      results.hidden = !hits.length;
      results.innerHTML = hits.map((h, i) => {
        const k = kindOf(h);
        const dist = h.km != null && (h.kind === "poi" || h.kind === "street" || h.kind === "water") ? ` · ${fmtDist(h.km)}` : "";
        return `<button class="mp-hit ${i === sel ? "on" : ""}" data-i="${i}"><span class="g">${k[1]}</span>
          <span class="mp-hn">${escapeHtml(h.name)}</span><small>${escapeHtml(k[0])}${dist}</small></button>`;
      }).join("");
      results.querySelectorAll(".mp-hit").forEach((b) => b.addEventListener("mousedown", (e) => { e.preventDefault(); go(hits[+b.dataset.i]); }));
    };
    const go = (h) => {
      if (!h) return;
      results.hidden = true;
      input.blur();
      const k = kindOf(h);
      target = { lat: h.lat, lon: h.lon, name: h.name, kind: h.kind, label: k[0], km: h.km };
      flyTo(h.lat, h.lon, Math.max(view.z, k[2]));
      showCard(target);
      Sound.found();
      if (window.track && h.kind !== "coords") track("mapSearches", h.name);
    };
    input.addEventListener("input", () => {
      clearTimeout(typing);
      typing = setTimeout(async () => { const mine = ++token, found = await search(input.value); if (mine === token) { hits = found; sel = 0; showResults(); } }, 110);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(hits.length - 1, sel + 1); showResults(); }
      if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); showResults(); }
      if (e.key === "Enter") { e.preventDefault(); clearTimeout(typing); if (hits.length) go(hits[sel]); else search(input.value).then((h) => { hits = h; go(h[0]); }); }
      if (e.key === "Escape") { e.stopPropagation(); if (input.value) { input.value = ""; hits = []; showResults(); } else input.blur(); }
    });
    input.addEventListener("blur", () => setTimeout(() => (results.hidden = true), 120));
    input.addEventListener("focus", () => { if (hits.length) results.hidden = false; });

    el.querySelectorAll(".mp-style button").forEach((b) => b.addEventListener("click", () => setStyle(b.dataset.s, true)));
    el.querySelectorAll(".mp-t").forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset.t;
      if (t === "grid") { showGrid = !showGrid; b.classList.toggle("on", showGrid); save(); frame(); Sound.click(); }
      else if (t === "waypoint" || t === "measure") setTool(t);
      else if (t === "packs" || t === "points") togglePanel(t);
      else if (t === "full") fullscreen();
    }));
    el.querySelector(".mp-close").addEventListener("click", () => toggle(false));
    el.querySelectorAll(".mp-ctl").forEach((b) => b.addEventListener("click", () => {
      const z = +b.dataset.z;
      if (z === 0) flyTo(25, 10, minZ() + 0.3); else zoomAt(W / 2, H / 2, z);
      Sound.click();
    }));

    // Drag to pan (with a little momentum), wheel or touchpad to zoom
    // smoothly, double-click to zoom in, click for tools.
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      flight = zoomTo = fling = null;
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false, hist: [[e.clientX, e.clientY, performance.now()]] };
    });
    canvas.addEventListener("pointermove", (e) => {
      const r = canvas.getBoundingClientRect();
      readout(e.clientX - r.left, e.clientY - r.top);
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (!drag.moved) return;
      view.x = drag.vx - dx / scale(); view.y = drag.vy - dy / scale();
      clampView();
      drag.hist.push([e.clientX, e.clientY, performance.now()]);
      if (drag.hist.length > 6) drag.hist.shift();
      frame();
    });
    canvas.addEventListener("pointerup", (e) => {
      const d = drag; drag = null;
      if (!d) return;
      if (d.moved) {
        const a = d.hist[0], b = d.hist[d.hist.length - 1];
        const dt = Math.max(16, b[2] - a[2]);
        if (performance.now() - b[2] < 80 && !document.body.classList.contains("reduce-motion")) {
          fling = { vx: ((b[0] - a[0]) / dt) * 16, vy: ((b[1] - a[1]) / dt) * 16 };
        }
        view.x = ((view.x % 1) + 1) % 1;
        labelsDirty = true;
        frame();
        return;
      }
      const r = canvas.getBoundingClientRect();
      click(e.clientX - r.left, e.clientY - r.top);
    });
    canvas.addEventListener("pointerleave", () => readout());
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const step = e.deltaMode === 1 ? e.deltaY / 3 : e.deltaY / 100;
      zoomAt(e.clientX - r.left, e.clientY - r.top, -Math.max(-1, Math.min(1, step)) * 0.6);
    }, { passive: false });
    canvas.addEventListener("dblclick", (e) => { const r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 1); });
    canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); if (tool === "measure") finishMeasure(); });
  }

  function click(sx, sy) {
    const [x, y] = toWorld(sx, sy);
    const lat = unY(y), lon = wrapLon(unX(x));
    if (tool === "measure") { measure.push({ lat, lon }); frame(); Sound.key(); return; }
    if (tool === "waypoint") { editWaypoint({ lat, lon, name: "", icon: "pin", note: "" }); return; }
    const hit = waypoints.find((w) => { const [wx, wy] = toScreen(projX(w.lon), projY(w.lat)); return Math.hypot(wx - sx, wy - sy + 8) < 16; });
    if (hit) { showCard({ ...hit, kind: "waypoint", wp: hit, label: "WAYPOINT" }); return; }
    target = { lat, lon, name: "", kind: "spot", label: "LOCATION" };
    showCard(target);
    frame();
  }
  function finishMeasure() {
    if (measure.length < 2) return;
    let km = 0;
    for (let i = 1; i < measure.length; i++) km += distance(measure[i - 1], measure[i]);
    const last = measure[measure.length - 1];
    showCard({ kind: "measure", label: "MEASUREMENT", name: `DISTANCE ${fmtDist(km)}`, lat: last.lat, lon: last.lon });
    tool = "";
    $("#maps").querySelectorAll(".mp-t[data-t=measure]").forEach((b) => b.classList.remove("on"));
    $("#maps .mp-hint").hidden = true;
    $("#maps").classList.remove("tooling");
    Sound.found();
  }

  // The info card for a place, a spot, a waypoint or a measurement.
  function showCard(t) {
    const card = $("#maps .mp-card");
    card.innerHTML = `<div class="mp-card-kind">${escapeHtml(t.label || "PLACE")}${t.wp ? ` · ${ICON_NAMES[t.wp.icon].toUpperCase()}` : ""}</div>
      ${t.name ? `<div class="mp-card-name"></div>` : ""}
      ${t.km != null && t.kind !== "measure" ? `<div class="mp-card-extra">${fmtDist(t.km)} FROM THE MAP CENTRE</div>` : ""}
      ${t.wp && t.wp.note ? `<p class="mp-card-note"></p>` : ""}
      <div class="mp-card-coords">${fmtLat(t.lat)} · ${fmtLon(t.lon)}<br>MGRS ${toMGRS(t.lat, t.lon)}</div>
      <div class="mp-card-actions">
        ${t.kind === "measure" ? `<button class="ghost mp-c-clear">CLEAR</button>` : ""}
        ${t.wp ? `<button class="ghost mp-c-edit">✎ EDIT</button><button class="ghost mp-c-del">✕ DELETE</button>`
          : t.kind !== "measure" ? `<button class="ghost mp-c-pin">󰍎 WAYPOINT</button>` : ""}
        ${t.name && !["measure", "coords", "poi", "street"].includes(t.kind) ? `<button class="solid mp-c-ask">ASK UMBRA ▸</button>` : ""}
        <button class="ghost mp-c-x" title="Close">✕</button>
      </div>`;
    if (t.name) card.querySelector(".mp-card-name").textContent = t.name;
    if (t.wp && t.wp.note) card.querySelector(".mp-card-note").textContent = t.wp.note;
    card.hidden = false;
    const q = (s) => card.querySelector(s);
    q(".mp-c-x").addEventListener("click", () => { card.hidden = true; target = null; frame(); });
    q(".mp-c-clear")?.addEventListener("click", () => { measure = []; card.hidden = true; frame(); });
    q(".mp-c-pin")?.addEventListener("click", () => editWaypoint({ lat: t.lat, lon: t.lon, name: t.name || "", icon: /water/i.test(t.label || "") ? "water" : "pin", note: "" }));
    q(".mp-c-edit")?.addEventListener("click", () => editWaypoint(t.wp));
    q(".mp-c-del")?.addEventListener("click", async () => {
      waypoints = waypoints.filter((w) => w.id !== t.wp.id);
      await saveWaypoints(); card.hidden = true; frame(); Sound.click();
    });
    q(".mp-c-ask")?.addEventListener("click", () => {
      toggle(false);
      const box = $("#q");
      box.value = `What should I know to stay safe around ${t.name}: the climate, water, dangers and what to prepare?`;
      box.dispatchEvent(new Event("input"));
      box.focus();
    });
  }

  function editWaypoint(w) {
    const card = $("#maps .mp-card");
    const draft = { ...w };
    card.innerHTML = `<div class="mp-card-kind">${w.id ? "EDIT WAYPOINT" : "NEW WAYPOINT"}</div>
      <input class="mp-wp-name" maxlength="40" placeholder="Name, e.g. Water source">
      <div class="mp-wp-icons">${Object.entries(ICON).map(([k, g]) => `<button class="ctl" data-i="${k}" title="${ICON_NAMES[k]}"><span class="g">${g}</span></button>`).join("")}</div>
      <textarea class="mp-wp-note" maxlength="200" rows="2" placeholder="A note (optional)"></textarea>
      <div class="mp-card-coords">${fmtLat(w.lat)} · ${fmtLon(w.lon)}<br>MGRS ${toMGRS(w.lat, w.lon)}</div>
      <div class="mp-card-actions"><button class="ghost mp-wp-cancel">CANCEL</button><button class="solid mp-wp-save">SAVE ◆</button></div>`;
    card.hidden = false;
    const name = card.querySelector(".mp-wp-name"), note = card.querySelector(".mp-wp-note");
    name.value = draft.name || ""; note.value = draft.note || "";
    const showIcon = () => card.querySelectorAll(".mp-wp-icons .ctl").forEach((b) => b.classList.toggle("on", b.dataset.i === draft.icon));
    card.querySelectorAll(".mp-wp-icons .ctl").forEach((b) => b.addEventListener("click", () => { draft.icon = b.dataset.i; showIcon(); Sound.click(); }));
    showIcon();
    setTimeout(() => name.focus(), 30);
    const saveIt = async () => {
      draft.name = name.value.trim() || ICON_NAMES[draft.icon];
      draft.note = note.value.trim();
      if (!draft.id) { draft.id = Math.random().toString(36).slice(2, 12).padEnd(6, "0"); draft.created = Date.now(); waypoints.push(draft); }
      else waypoints = waypoints.map((x) => (x.id === draft.id ? draft : x));
      await saveWaypoints();
      if (tool === "waypoint") setTool("waypoint");
      showCard({ ...draft, kind: "waypoint", wp: draft, label: "WAYPOINT" });
      frame();
      Sound.found();
    };
    card.querySelector(".mp-wp-save").addEventListener("click", saveIt);
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveIt(); } });
    card.querySelector(".mp-wp-cancel").addEventListener("click", () => { card.hidden = true; });
  }

  async function saveWaypoints() {
    try {
      const r = await (await fetch("/api/waypoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waypoints }) })).json();
      if (Array.isArray(r)) waypoints = r;
    } catch { Sound.error(); }
    if (panel === "points") renderPanel();
    if (window.UmbraAchievements) UmbraAchievements.check();
  }

  // ---------------------------------------------------- download panel

  let countries = [], chosen = null, chosenBox = null, jobTimer = 0;
  const pick = { zoom: 14, terrain: 11, essentials: true };
  function togglePanel(which) {
    panel = panel === which ? "" : which;
    $("#maps").querySelectorAll(".mp-t[data-t=packs], .mp-t[data-t=points]").forEach((b) => b.classList.toggle("on", b.dataset.t === panel));
    if (panel !== "packs") chosenBox = null;
    frame();
    renderPanel();
    Sound.click();
  }
  const fmtBytes = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB");
  const post = (url, data) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json()).catch(() => ({ error: "failed" }));

  function renderPanel() {
    const box = $("#maps .mp-panel");
    box.hidden = !panel;
    if (!panel) return;
    const top = box.scrollTop;
    if (panel === "points") {
      box.innerHTML = `<div class="lib-head"><span>WAYPOINTS · ${waypoints.length}</span></div>` + (waypoints.length
        ? waypoints.map((w) => `<button class="mp-pt" data-id="${w.id}"><span class="g">${ICON[w.icon]}</span><span><b></b><small>${fmtLat(w.lat)} ${fmtLon(w.lon)}</small></span></button>`).join("")
        : `<p class="lib-note">No waypoints yet. Use the pin tool (W) and click the map: camps, water, dangers, rally points, caches…</p>`);
      box.querySelectorAll(".mp-pt").forEach((b) => {
        const w = waypoints.find((x) => x.id === b.dataset.id);
        b.querySelector("b").textContent = w.name;
        b.addEventListener("click", () => { flyTo(w.lat, w.lon, Math.max(view.z, 15)); showCard({ ...w, kind: "waypoint", wp: w, label: "WAYPOINT" }); });
      });
      box.scrollTop = top;
      return;
    }
    if (!status) { box.innerHTML = `<p class="lib-note">Reading maps…</p>`; return; }
    const job = status.job || {};
    const plan = job.plan && chosen && job.plan.name === chosen.name ? job.plan : null;
    let html = `<p class="lib-note">Maps are OpenStreetMap, updated daily, and work fully offline once downloaded.
      Pick a country, or frame an area on the map: Umbra fetches only that area.</p>`;
    html += `<div class="lib-section"><div class="lib-head"><span>ON THIS COMPUTER</span></div>
      <div class="mp-pack have"><span class="g mp-builtin">󰇧</span><span><b>World</b><small>Countries, big cities and coasts. Built in.</small></span><span class="mp-have">BUILT IN</span></div>`;
    for (const a of status.areas) {
      const det = status.detail.find((d) => d.zoom === a.maxzoom);
      const date = String(a.build).replace(/\.pmtiles$/, "").replace(/(\d{4})(\d{2})(\d{2})/, "$3-$2-$1");
      html += `<div class="mp-pack have mp-area" data-id="${escapeHtml(a.id)}" title="Show it on the map"><span class="g mp-builtin">󰍍</span>
        <span><b>${escapeHtml(a.name)}</b><small>${escapeHtml(det ? det.name : "Level " + a.maxzoom)}${a.terrain ? " · relief & contours" : ""}${a.points ? " · essentials" : ""} · data of ${escapeHtml(date)}</small></span>
        <span class="mp-have">${fmtBytes(a.bytes)}</span><button class="ghost mp-del" data-id="${escapeHtml(a.id)}" title="Delete">✕</button></div>`;
    }
    html += `</div><div class="lib-section"><div class="lib-head"><span>GET A MAP</span></div>
      <div class="mp-choose"><select class="mp-country"><option value="">Choose a country…</option>${countries.map((c, i) => `<option value="${i}">${escapeHtml(c.name)}</option>`).join("")}</select>
      <button class="ghost mp-here" title="The area you see on the map now">󰆤 AREA ON SCREEN</button></div>`;
    if (chosen) {
      html += `<div class="mp-chosen"><b>${escapeHtml(chosen.name)}</b><small>${chosen.bbox.map((v) => v.toFixed(2)).join(" · ")}</small></div>`;
      if (job.active && job.kind === "plan") html += progress(job, "CHECKING THE SIZE");
      else if (!plan) html += `<div class="mp-dl"><span>First check the size: nothing is downloaded yet.</span><button class="solid mp-plan" ${job.active ? "disabled" : ""}>CHECK SIZE ▸</button></div>`;
      else {
        html += `<div class="mp-opt-t">DETAIL</div>` + status.detail.map((d) => {
          const size = plan.sizes[String(d.zoom)];
          return `<label class="mp-opt ${size == null ? "off" : ""}"><input type="radio" name="mp-z" value="${d.zoom}" ${pick.zoom === d.zoom ? "checked" : ""} ${size == null ? "disabled" : ""}>
            <span><b>${escapeHtml(d.name)}</b><small>${escapeHtml(d.line)}</small></span><em>${size == null ? "TOO BIG" : fmtBytes(size)}</em></label>`;
        }).join("");
        html += `<div class="mp-opt-t">RELIEF & CONTOURS</div>` + status.terrainLevels.map((tz) => {
          const size = tz ? plan.terrain[String(tz)] : 0;
          const name = !tz ? "None" : tz === 10 ? "Coarse" : tz === 11 ? "Standard" : "Fine";
          return `<label class="mp-opt ${size == null ? "off" : ""}"><input type="radio" name="mp-t" value="${tz}" ${pick.terrain === tz ? "checked" : ""} ${size == null ? "disabled" : ""}>
            <span><b>${name}</b><small>${tz ? "Shaded hills and brown contour lines" : "A flat map"}</small></span><em>${size == null ? "TOO BIG" : tz ? "≈ " + fmtBytes(size) : ""}</em></label>`;
        }).join("");
        if (plan.essentials != null) {
          html += `<div class="mp-opt-t">SURVIVAL</div><label class="mp-opt"><input type="checkbox" class="mp-ess" ${pick.essentials || pick.zoom >= 15 ? "checked" : ""} ${pick.zoom >= 15 ? "disabled" : ""}>
            <span><b>Essentials</b><small>Every drinking-water tap, spring, shelter, pharmacy, hospital, toilet and fuel station, from the finest level; kept small on disk</small></span>
            <em>${pick.zoom >= 15 ? "INCLUDED" : "+" + fmtBytes(plan.essentials)}</em></label>`;
        }
        const zsize = plan.sizes[String(pick.zoom)] || 0, tsize = pick.terrain ? plan.terrain[String(pick.terrain)] || 0 : 0;
        const esize = pick.essentials && pick.zoom < 15 && plan.essentials ? plan.essentials : 0;
        if (job.active && job.kind === "download") html += progress(job, "DOWNLOADING");
        else html += `<div class="mp-dl"><span>About ${fmtBytes(zsize + tsize + esize)} to download</span>
          <button class="solid mp-go" ${job.active || !zsize ? "disabled" : ""}>DOWNLOAD ▸</button></div>`;
      }
    } else if (job.active) html += progress(job, job.kind === "plan" ? "CHECKING THE SIZE" : "DOWNLOADING");
    if (job.phase === "failed") html += `<p class="lib-note mp-err">${escapeHtml(job.error || "Something went wrong.")} Check the connection and try again.</p>`;
    html += `</div><p class="lib-note mp-lic">Map data © OpenStreetMap contributors (ODbL), from the Protomaps daily build.
      Elevation: Terrain Tiles (AWS open data: SRTM, GMTED, ETOPO and others).</p>`;
    box.innerHTML = html;
    const sel = box.querySelector(".mp-country");
    if (chosen && chosen.i != null) sel.value = String(chosen.i);
    sel.addEventListener("change", () => {
      if (sel.value === "") return;
      const c = countries[+sel.value];
      chosen = { name: c.name, bbox: c.bbox, i: +sel.value };
      chosenBox = c.bbox;
      showArea(c.bbox);
      Sound.click(); renderPanel();
    });
    box.querySelector(".mp-here").addEventListener("click", () => {
      const [x0, y0] = toWorld(40, 40), [x1, y1] = toWorld(W - 40, H - 40);
      const bbox = [wrapLon(unX(x0)), unY(y1), wrapLon(unX(x1)), unY(y0)].map((v) => Math.round(v * 1000) / 1000);
      if (bbox[2] <= bbox[0]) { Sound.error(); return; }
      const lat = unY(view.y), lon = wrapLon(unX(view.x));
      chosen = { name: `${(target && target.name) || "Area"} ${Math.abs(lat).toFixed(2)}${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}${lon >= 0 ? "E" : "W"}`, bbox };
      chosenBox = bbox;
      Sound.click(); renderPanel(); frame();
    });
    box.querySelector(".mp-plan")?.addEventListener("click", async () => {
      const r = await post("/api/maps/plan", { name: chosen.name, bbox: chosen.bbox });
      if (r.error) { Sound.error(); return; }
      status = r; renderPanel(); pollJob();
    });
    box.querySelectorAll("input[name=mp-z]").forEach((i) => i.addEventListener("change", () => { pick.zoom = +i.value; Sound.click(); renderPanel(); }));
    box.querySelectorAll("input[name=mp-t]").forEach((i) => i.addEventListener("change", () => { pick.terrain = +i.value; Sound.click(); renderPanel(); }));
    box.querySelector(".mp-ess")?.addEventListener("change", (e) => { pick.essentials = e.target.checked; Sound.click(); renderPanel(); });
    box.querySelector(".mp-go")?.addEventListener("click", async () => {
      const r = await post("/api/maps/download", { plan: plan.id, zoom: pick.zoom, terrain: pick.terrain, essentials: pick.essentials });
      if (r.error) { Sound.error(); return; }
      status = r; Sound.click(); renderPanel(); pollJob();
    });
    box.querySelectorAll(".mp-area").forEach((row) => row.addEventListener("click", (e) => {
      if (e.target.closest(".mp-del")) return;
      showArea(status.areas.find((x) => x.id === row.dataset.id).bbox);
    }));
    box.querySelectorAll(".mp-del").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog({ kind: "to-local", tag: "MAPS", title: "DELETE THIS MAP?", body: "You can download it again any time.", ok: "DELETE", cancel: "KEEP" });
      if (!ok) return;
      const r = await post("/api/maps/delete", { id: b.dataset.id });
      if (!r.error) { status = r; restyle(true); }
      renderPanel();
    }));
    box.scrollTop = top;
  }
  function showArea(b) {
    const span = Math.max(projX(b[2]) - projX(b[0]), projY(b[1]) - projY(b[3]));
    flyTo((b[1] + b[3]) / 2, (b[0] + b[2]) / 2, Math.log2((Math.min(W, H) * 0.8) / 256 / span));
  }
  function progress(job, title) {
    const phase = { scan: "Reading the map's index for this area", tiles: "Map", points: "Essential points", terrain: "Elevation", index: "Building the search index" }[job.phase] || "Starting";
    const pct = job.phase === "index" || job.phase === "terrain" ? Math.round((job.done / Math.max(1, job.count)) * 100)
      : job.total ? Math.min(100, Math.round((job.received / job.total) * 100)) : 0;
    const got = job.phase === "tiles" || job.phase === "points" ? ` · ${fmtBytes(job.received)} of ${fmtBytes(job.total)}`
      : job.phase === "scan" ? ` · ${fmtBytes(job.received)} read` : "";
    return `<div class="lib-section mp-job"><div class="lib-head"><span><span class="spin" data-spin>✻</span> ${title}</span><b>${job.phase === "scan" ? "" : pct + "%"}</b></div>
      <div class="dl-bar ${job.phase === "scan" ? "busy" : ""}"><i style="width:${job.phase === "scan" ? 100 : pct}%"></i></div><p class="lib-note">${escapeHtml(phase + got)}</p></div>`;
  }
  function pollJob() {
    clearTimeout(jobTimer);
    jobTimer = setTimeout(async () => {
      const was = status && status.job && status.job.active ? status.job.kind : "";
      await refreshStatus();
      if (panel === "packs") renderPanel();
      if (status.job.active) pollJob();
      else if (was === "download" && status.job.phase === "done") {
        Sound.found();
        chosen = null; chosenBox = null;
        restyle(true);
        if (window.UmbraAchievements) UmbraAchievements.check();
        if (panel === "packs") renderPanel();
      } else if (was === "plan") Sound.click();
    }, 1000);
  }
  async function refreshStatus() {
    try {
      const before = status ? status.areas.map((a) => a.id).join() : null;
      status = await (await fetch("/api/maps")).json();
      if (before !== null && before !== status.areas.map((a) => a.id).join()) restyle(true);
    } catch {}
  }

  // ------------------------------------------------------- open / close

  function setStyle(s, click) {
    style = s;
    $("#maps").classList.toggle("tactical", s === "tactical");
    $("#maps").querySelectorAll(".mp-style button").forEach((b) => b.classList.toggle("on", b.dataset.s === s));
    save();
    sprites.clear();
    restyle();
    if (click) Sound.theme();
  }
  function save() { try { localStorage.setItem("umbra-maps", JSON.stringify({ style, showGrid, view })); } catch {} }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem("umbra-maps") || "{}");
      if (s.style) style = s.style;
      if (typeof s.showGrid === "boolean") showGrid = s.showGrid;
      if (s.view && isFinite(s.view.z)) view = s.view;
    } catch {}
  }

  async function toggle(show = $("#maps").hidden) {
    if (show && locked) return;
    const el = $("#maps");
    if (!show) {
      if (fullOn) fullscreen();
      el.hidden = true; $("#maps-btn").classList.remove("on"); save(); Sound.click();
      document.body.classList.remove("maps-open");
      startRain();
      return;
    }
    if (window.closeSettings) window.closeSettings();
    if (window.closeLoadout) window.closeLoadout(true);
    if (window.closeHistory) window.closeHistory();
    if (window.closeFieldKit) window.closeFieldKit();
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    el.hidden = false;
    $("#maps-btn").classList.add("on");
    // The window is drawn by the processor: the chat under the map (and its
    // animated background) would be repainted with every map frame. It rests.
    document.body.classList.add("maps-open");
    stopRain();
    startWorkers();
    el.querySelector(".mp-t[data-t=grid]").classList.toggle("on", showGrid);
    await refreshStatus();
    setStyle(style);
    resize();
    Sound.click();
    try { waypoints = await (await fetch("/api/waypoints")).json(); } catch {}
    if (!countries.length) try { countries = await (await fetch("/api/maps/countries")).json(); } catch {}
    if (status && status.job && status.job.active) pollJob();
    frame();
    setTimeout(() => el.querySelector(".mp-search input").focus(), 50);
  }

  let fullOn = false;
  function fullscreen() {
    fullOn = !fullOn;
    $("#maps").classList.toggle("full", fullOn);
    $("#maps .mp-t[data-t=full]").classList.toggle("on", fullOn);
    try { window.webkit.messageHandlers.umbra.postMessage(fullOn ? "fullscreen" : "unfullscreen"); } catch {}
    Sound.click();
  }

  build();
  restore();
  $("#maps-btn").addEventListener("click", () => toggle());
  document.addEventListener("keydown", (e) => {
    const el = $("#maps");
    if (el.hidden || !$("#modal").hidden) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if (e.key === "Escape") {
      e.stopImmediatePropagation();
      if (!$("#maps .mp-card").hidden && !tool) { $("#maps .mp-card").hidden = true; target = null; frame(); }
      else if (tool) { measure = []; setTool(tool); }
      else if (panel) togglePanel(panel);
      else if (fullOn) fullscreen();
      else toggle(false);
      return;
    }
    if (typing) return;
    const k = e.key.toLowerCase();
    if (k === "enter" && tool === "measure") finishMeasure();
    else if (k === "+" || k === "=") zoomAt(W / 2, H / 2, 1);
    else if (k === "-") zoomAt(W / 2, H / 2, -1);
    else if (k === "w") setTool("waypoint");
    else if (k === "m") setTool("measure");
    else if (k === "g") el.querySelector(".mp-t[data-t=grid]").click();
    else if (k === "f") fullscreen();
    else if (k === "/") { e.preventDefault(); el.querySelector(".mp-search input").focus(); }
    else if (e.key.startsWith("Arrow")) {
      fling = { vx: k === "arrowleft" ? 14 : k === "arrowright" ? -14 : 0, vy: k === "arrowup" ? 14 : k === "arrowdown" ? -14 : 0 };
      frame();
    } else return;
    e.preventDefault();
  }, true);
  new MutationObserver(() => { if (document.body.classList.contains("locked") && !$("#maps").hidden) toggle(false); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  // The tactical style follows the theme.
  new MutationObserver(() => { if (!$("#maps").hidden && style === "tactical") { sprites.clear(); restyle(); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });

  window.toggleMaps = toggle;
  window.closeMaps = () => { if (!$("#maps").hidden) toggle(false); };
  window.UmbraMaps = { toMGRS, fromMGRS, parseCoords, search: (q) => search(q), get view() { return view; },
                       go: (lat, lon, z) => flyTo(lat, lon, z), stats: () => ({ cache: cache.size, queued: queued.size, running: running.size }) };
})();
