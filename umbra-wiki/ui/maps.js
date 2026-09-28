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
    drawSafety();
    drawLabels(shown, pal);
    if (showGrid) drawGrid(pal);
    drawPicked(pal);
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
    toilets: ["󰋨", "text", 14], fuel: ["󰊘", "text", 13], supermarket: ["󰒚", "text", 14], peak: ["▲", "brown", 10], volcano: ["▲", "red", 8],
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
  // Some names in OpenStreetMap carry emoji (a coffee cup, a flag...); they'd
  // be drawn as colour pictures among the map's own icons, so they're left out.
  const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu;
  function textSprite(text, font, color, halo, spacing = 0, icon = "", iconColor = "") {
    const f = css("--font") || "monospace";
    text = text.replace(EMOJI, "").replace(/\s{2,}/g, " ").trim();
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
      layout.off = [dx, dy];
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
    layout = { z: view.z, x: view.x, y: view.y, style, items, countries: [], off: [0, 0] };
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
    // Country names come from the atlas, each from its own zoom level, and
    // go first; they can be clicked for the country's file.
    if (atlas && view.z < 9) {
      for (const c of atlas) {
        if (view.z < c.minz - 0.7) continue;
        const cx = (c.lx + Math.round(view.x - c.lx) - view.x) * S + W / 2, cy = (c.ly - view.y) * S + H / 2;
        if (cx < -120 || cx > W + 120 || cy < -30 || cy > H + 30) continue;
        const font = c.rank <= 2 ? "700 14px" : c.rank <= 4 ? "700 12.5px" : "700 11px";
        const s = textSprite(c.name.toUpperCase(), font, c === picked ? pal.ink : pal.border, pal.halo, c.rank <= 4 ? 3 : 1.5);
        const bx = cx - s.w / 2, by = cy - s.h / 2;
        if (!fits([bx, by, bx + s.w, by + s.h])) continue;
        ctx.drawImage(s.c, bx, by, s.w, s.h);
        items.push({ s, x: bx, y: by });
        layout.countries.push({ c, x: bx, y: by, w: s.w, h: s.h });
      }
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
        if (!cfg || tz < cfg[0] || (l.cls === "country" && atlas) || (l.cls === "country" && tz > 7) || (l.cls === "region" && tz > 10)) continue;
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
    drawRings(g, font, ink, halo);
    for (const w of waypoints) {
      const [x, y] = toScreen(projX(w.lon), projY(w.lat));
      if (x < -30 || x > W + 30 || y < -30 || y > H + 30) continue;
      const m = markOf(w), col = colorOf(w, pal), cy = y - 12;
      markerPath(g, m[1], x, cy, 10);
      g.lineWidth = 4; g.strokeStyle = halo; g.stroke();
      g.fillStyle = col; g.fill();
      g.lineWidth = 1.2; g.strokeStyle = style === "topo" ? "#1b1b1b" : "#000"; g.stroke();
      g.beginPath(); g.moveTo(x, cy + 10); g.lineTo(x, y); g.strokeStyle = col; g.lineWidth = 2; g.stroke();
      g.font = `12px ${font}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = light(col) ? "#111" : "#fff";
      if (!w.sym || !drawSym(g, w.sym, x, cy + (m[1] === "tri" ? 2 : 0), 13, g.fillStyle)) g.fillText(m[2], x, cy + (m[1] === "tri" ? 2 : 0));
      g.font = `700 10px ${font}`; g.lineWidth = 3.5; g.strokeStyle = halo; g.fillStyle = col;
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
  // Coordinates in the forms the map shows (45.9237° N 6.8694° E, with or
  // without "·" between them), N45.92 E6.87, 45.92, 6.87, degrees-minutes-
  // seconds, or MGRS (31U FT 50912 81543).
  function parseCoords(text) {
    const t = text.trim().toUpperCase().replace(/^(CENTRE|CURSOR|MGRS)\s+/, "").replace(/[·;|]/g, " ").replace(/\s+/g, " ").trim();
    const pre = /^([NS])\s*(\d{1,2}(?:\.\d+)?)\s*°?[,\s]+([EW])\s*(\d{1,3}(?:\.\d+)?)\s*°?$/.exec(t);
    if (pre) {
      const lat = +pre[2] * (pre[1] === "S" ? -1 : 1), lon = +pre[4] * (pre[3] === "W" ? -1 : 1);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
    const dms = /^(\d{1,2})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)?["″]?\s*([NS])[,\s]+(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)?["″]?\s*([EW])$/.exec(t);
    if (dms) return { lat: (+dms[1] + dms[2] / 60 + (+dms[3] || 0) / 3600) * (dms[4] === "S" ? -1 : 1), lon: (+dms[5] + dms[6] / 60 + (+dms[7] || 0) / 3600) * (dms[8] === "W" ? -1 : 1) };
    const dec = /^(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?[,\s]+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?$/.exec(t);
    if (dec) {
      const lat = +dec[1] * (dec[2] === "S" ? -1 : 1), lon = +dec[3] * (dec[4] === "W" ? -1 : 1);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
    return fromMGRS(t);
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

  // ---------------------------------------------------------- countries

  // Every country's outline, label point, main cities and fact sheet (CIA
  // World Factbook and Natural Earth, public domain; maps/atlas.json). Their
  // names are drawn by Umbra and can be clicked: the camera centres on the
  // country, its outline lights up and a country file opens, tied to it by a
  // pointed line. Countries can also be marked with a safety level of the
  // user's own choosing, shown as a coloured layer at every zoom.
  let atlas = null, atlasLoading = null, picked = null, safety = {}, showSafety = true;
  const SAFETY = [
    null,
    { name: "Safe", color: "#3fae5a", line: "No special worries" },
    { name: "Caution", color: "#e0b83a", line: "Stay alert, check the news" },
    { name: "Avoid", color: "#e67e22", line: "Only if you must" },
    { name: "Danger", color: "#d8412f", line: "Stay away" },
  ];
  function loadAtlas() {
    if (atlas || atlasLoading) return atlasLoading;
    atlasLoading = Promise.all([
      fetch("/api/maps/atlas", { cache: "no-store" }).then((r) => r.json()).catch(() => []),
      fetch("/api/safety").then((r) => r.json()).catch(() => ({ levels: {} })),
    ]).then(([list, s]) => {
      safety = s.levels || {};
      for (const c of list) {
        // Outlines in map units (0..1), with their boxes, for quick culling.
        c.rings = c.shapes.map((flat) => {
          const pts = new Float64Array(flat.length);
          let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
          for (let i = 0; i < flat.length; i += 2) {
            const x = projX(flat[i]), y = projY(flat[i + 1]);
            pts[i] = x; pts[i + 1] = y;
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
          return { pts, box: [x0, y0, x1, y1], area: (x1 - x0) * (y1 - y0) };
        });
        delete c.shapes;
        // The main land: the biggest part and what lies near it (not far-off
        // islands or overseas territories), for framing and the drawing.
        const big = c.rings.reduce((a, r) => (r.area > (a ? a.area : -1) ? r : a), null);
        if (big) {
          const [bx0, by0, bx1, by1] = big.box, mx = (bx1 - bx0) * 0.6 + 1e-4, my = (by1 - by0) * 0.6 + 1e-4;
          c.main = c.rings.filter((r) => r.box[2] > bx0 - mx && r.box[0] < bx1 + mx && r.box[3] > by0 - my && r.box[1] < by1 + my);
          c.box = c.main.reduce((b, r) => [Math.min(b[0], r.box[0]), Math.min(b[1], r.box[1]), Math.max(b[2], r.box[2]), Math.max(b[3], r.box[3])], [1, 1, 0, 0]);
        } else {
          c.main = [];
          const x = projX(c.label[0]), y = projY(c.label[1]);
          c.box = [x - 1e-4, y - 1e-4, x + 1e-4, y + 1e-4];
        }
        c.lx = projX(c.label[0]); c.ly = projY(c.label[1]);
      }
      atlas = list.sort((a, b) => a.rank - b.rank || a.minz - b.minz);
      labelsDirty = true;
      frame();
    });
    return atlasLoading;
  }

  // Draws rings (in map units) at the current view, every copy of the world
  // that shows, skipping what's off screen.
  function traceRings(g, rings) {
    const S = scale(), ox = W / 2 - view.x * S, oy = H / 2 - view.y * S;
    const [vx0, vy0] = toWorld(-40, -40), [vx1, vy1] = toWorld(W + 40, H + 40);
    const lim = 60000;
    g.beginPath();
    for (let k = Math.floor(vx0) - 1; k <= Math.floor(vx1); k++) {
      for (const r of rings) {
        const b = r.box;
        if (b[2] + k < vx0 || b[0] + k > vx1 || b[3] < vy0 || b[1] > vy1) continue;
        const p = r.pts;
        for (let i = 0; i < p.length; i += 2) {
          const x = Math.max(-lim, Math.min(lim, (p[i] + k) * S + ox)), y = Math.max(-lim, Math.min(lim, p[i + 1] * S + oy));
          i ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.closePath();
      }
    }
  }
  function drawSafety() {
    if (!atlas || !showSafety) return;
    const g = ctx;
    for (const c of atlas) {
      const lvl = safety[c.a3];
      if (!lvl || !c.rings.length) continue;
      const col = SAFETY[lvl].color;
      traceRings(g, c.rings);
      // Strong enough to read from afar, light over streets up close.
      g.globalAlpha = (style === "topo" ? 0.2 : 0.24) * (view.z >= 12 ? 0.4 : view.z >= 9 ? 0.7 : 1);
      g.fillStyle = col; g.fill("evenodd");
      g.globalAlpha = 0.75; g.strokeStyle = col; g.lineWidth = 1.4; g.stroke();
      g.globalAlpha = 1;
    }
  }
  function drawPicked(pal) {
    if (!picked) return;
    const g = ctx, ink = style === "topo" ? pal.ink : css("--signal") || pal.ink;
    traceRings(g, picked.rings);
    g.globalAlpha = 0.1; g.fillStyle = ink; g.fill("evenodd");
    g.globalAlpha = 1; g.strokeStyle = ink; g.lineWidth = 2.6; g.setLineDash([]); g.stroke();
    // The pointed line from the country to its file.
    const win = $("#maps .mp-cfile");
    if (!win || win.hidden) return;
    const body = $("#maps .mp-body").getBoundingClientRect(), r = win.getBoundingClientRect();
    let ax = (picked.lx + Math.round(view.x - picked.lx) - view.x) * scale() + W / 2, ay = (picked.ly - view.y) * scale() + H / 2;
    // From the end of its name when the name shows, so the name stays readable.
    const nb = layout && layout.countries && layout.countries.find((b) => b.c === picked);
    if (nb) { ax = nb.x + layout.off[0] + nb.w + 5; ay = nb.y + layout.off[1] + nb.h / 2; }
    const ex = r.left - body.left, ey = Math.max(r.top - body.top + 26, Math.min(r.bottom - body.top - 26, ay));
    if (ax > ex - 20) return;
    const dx = ex - ax, dy = ey - ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    g.fillStyle = ink;
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(ex + nx * 7, ey + ny * 7); g.lineTo(ex - nx * 7, ey - ny * 7); g.closePath(); g.fill();
    g.fillRect(ex - 2, r.top - body.top, 3, r.height);
    g.lineWidth = 2; g.strokeStyle = ink;
    g.beginPath(); g.arc(ax, ay, 6, 0, TAU); g.stroke();
    g.beginPath(); g.arc(ax, ay, 2.2, 0, TAU); g.fill();
  }
  // A country whose name is under a point of the map, if any.
  function countryAt(sx, sy) {
    if (!layout || !layout.countries) return null;
    const [dx, dy] = layout.off || [0, 0];
    const hit = layout.countries.find((b) => sx >= b.x + dx - 4 && sx <= b.x + dx + b.w + 4 && sy >= b.y + dy - 3 && sy <= b.y + dy + b.h + 3);
    return hit ? hit.c : null;
  }

  // The country as characters: its main land sampled on a grid, denser
  // characters where more of a cell is land, the capital marked.
  function silhouette(c) {
    const [x0, y0, x1, y1] = c.box, wpx = x1 - x0, hpx = y1 - y0;
    let cols = 38, rows = Math.round(cols * (hpx / wpx) * 0.5);
    if (rows > 17) { rows = 17; cols = Math.max(12, Math.round((rows / 0.5) * (wpx / hpx))); }
    rows = Math.max(4, rows);
    const inside = (x, y) => {
      let n = 0;
      for (const r of c.main) {
        const b = r.box;
        if (x < b[0] || x > b[2] || y < b[1] || y > b[3]) continue;
        const p = r.pts;
        for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
          if ((p[i + 1] > y) !== (p[j + 1] > y) && x < ((p[j] - p[i]) * (y - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) n++;
        }
      }
      return n % 2 === 1;
    };
    const ramp = " .:-=+*#%@";
    const cap = c.facts && c.facts.capitalAt ? [projX(c.facts.capitalAt[1]), projY(c.facts.capitalAt[0])] : null;
    const capCell = cap ? [Math.floor(((cap[0] - x0) / wpx) * cols), Math.floor(((cap[1] - y0) / hpx) * rows)] : null;
    const out = [];
    for (let j = 0; j < rows; j++) {
      let line = "";
      for (let i = 0; i < cols; i++) {
        if (capCell && capCell[0] === i && capCell[1] === j) { line += "\u0001"; continue; }
        let hits = 0;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
          if (inside(x0 + ((i + (a + 0.5) / 3) / cols) * wpx, y0 + ((j + (b + 0.5) / 3) / rows) * hpx)) hits++;
        }
        line += ramp[hits];
      }
      out.push(line.replace(/\s+$/, ""));
    }
    return escapeHtml(out.join("\n")).replace("\u0001", '<b class="mp-cf-cap">◆</b>');
  }

  async function openCountry(c, fly = true) {
    await loadAtlas();
    if (typeof c === "string") {
      const n = norm(c);
      c = atlas.find((x) => norm(x.name) === n) || atlas.find((x) => x.facts && norm(x.facts.long || "") === n);
      if (!c) return false;
    }
    picked = c;
    $("#maps .mp-card").hidden = true;
    target = null;
    if (fly) {
      // Frame the main land in the part of the map left of the file.
      const win = Math.min(400, W * 0.45) + 60, room = Math.max(200, W - win - 60);
      const [x0, y0, x1, y1] = c.box;
      const z = Math.max(minZ(), Math.min(10, Math.log2(Math.min(room / Math.max(1e-6, x1 - x0), (H - 120) / Math.max(1e-6, y1 - y0)) / 256)));
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, S = 256 * 2 ** whole(z - 0.49);
      const vx = cx + (W / 2 - (room / 2 + 30)) / S;
      flyTo(unY(cy), unX(vx), z - 0.49);
    }
    renderCountry(c);
    Sound.glitch();
    if (window.track) track("countries", c.a3);
    frame();
    return true;
  }
  function closeCountry() {
    const win = $("#maps .mp-cfile");
    if (win.hidden) return;
    win.hidden = true; picked = null; frame(); Sound.click();
  }

  // Resources as small symbols: [words, icon].
  const RES = [[/petroleum|oil/, "\u{F03C7}", "Oil"], [/natural gas/, "\u{F0238}", "Gas"], [/coal/, "\u{F01A6}", "Coal"],
    [/iron|steel/, "\u{F089B}", "Iron"], [/gold/, "\u{F124F}", "Gold"], [/silver|platinum/, "\u{F124F}", "Silver"],
    [/copper|zinc|lead|nickel|tin|bauxite|alumin|manganese|chrom|cobalt|tungsten|molybden|titanium/, "\u{F08B7}", "Metals"],
    [/diamond|gem|emerald|ruby|sapphire/, "\u{F01C8}", "Gems"], [/uranium/, "\u{F043C}", "Uranium"], [/timber|forest|wood/, "\u{F0405}", "Timber"],
    [/fish|seafood/, "\u{F023A}", "Fish"], [/arable|farm|land/, "\u{F0E66}", "Farmland"], [/hydro/, "\u{F12E5}", "Hydropower"],
    [/salt|potash|phosphate|sulfur|gypsum|limestone|sand|gravel|clay|marble/, "\u{F0DDA}", "Minerals"], [/rare earth|lithium|graphite/, "\u{F0768}", "Rare earths"]];
  function resourceChips(text) {
    const t = String(text || "").toLowerCase();
    return RES.filter(([re]) => re.test(t)).map(([, g, n]) => `<span class="mp-cf-res"><span class="g">${g}</span>${n}</span>`).join("");
  }
  // A river whose width follows how much fresh water the country has.
  let riverTimer = 0;
  function river(km3) {
    const lvl = Math.max(1, Math.min(6, Math.round(Math.log10((km3 || 0) + 1) * 1.5)));
    return { lvl, frame: (t) => {
      const w = 34, rows = [];
      for (let r = 0; r < lvl; r++) {
        let line = "";
        for (let i = 0; i < w; i++) {
          const k = (i + t + r * 3) % 7;
          line += r === 0 || r === lvl - 1 ? (k === 0 ? "~" : "-") : (k < 2 ? "≈" : k < 4 ? "~" : " ");
        }
        rows.push(line);
      }
      return rows.join("\n");
    } };
  }

  // Each country's own short tune, made here (no recordings): notes from a
  // scale that fits its part of the world, picked and timed from the
  // country's code, so every country has its own and it's always the same.
  let tuneCtx = null;
  function countryTune(c) {
    if (Sound.muted || window.offgrid) return;
    try { tuneCtx = tuneCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    const ac = tuneCtx; if (ac.state === "suspended") ac.resume();
    const [lon, lat] = c.label;
    const SCALES = {
      eastAsia: [0, 2, 4, 7, 9], southAsia: [0, 1, 4, 5, 7, 8, 11], mideast: [0, 1, 4, 5, 7, 8, 10], africa: [0, 3, 5, 7, 10],
      nordic: [0, 2, 3, 5, 7, 8, 10], europe: [0, 2, 4, 5, 7, 9, 11], latin: [0, 2, 4, 5, 7, 9, 10], oceania: [0, 2, 4, 6, 7, 9, 11], americas: [0, 2, 4, 5, 7, 9, 11],
    };
    const region = lon > 95 && lon < 150 && lat > -10 ? "eastAsia" : lon > 60 && lon <= 95 && lat > 5 ? "southAsia"
      : lon > -20 && lon <= 60 && lat > 12 && lat < 42 && !(lon < 30 && lat > 36) ? "mideast" : lon > -20 && lon < 55 && lat <= 12 ? "africa"
      : lon > -30 && lon < 45 && lat >= 55 ? "nordic" : lon > -30 && lon < 45 && lat >= 35 ? "europe" : lon < -30 && lat < 25 ? "latin"
      : lon >= 110 || lon < -150 ? "oceania" : "americas";
    const timbre = { eastAsia: "pluck", southAsia: "drone", mideast: "pluck", africa: "marimba", nordic: "bell", europe: "bell", latin: "pluck", oceania: "marimba", americas: "bell" }[region];
    let h = 7; for (const ch of c.a3) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((h = (h * 1103515245 + 12345) >>> 0) / 4294967296);
    const scale = SCALES[region], root = 220 * Math.pow(2, Math.floor(rnd() * 7) / 12), beat = 0.16 + rnd() * 0.08;
    const vol = (window.prefs && window.prefs.volume != null ? window.prefs.volume : 0.9) * 0.22;
    const note = (deg, t, len) => {
      const f = root * Math.pow(2, (scale[((deg % scale.length) + scale.length) % scale.length] + 12 * Math.floor(deg / scale.length)) / 12);
      const o = ac.createOscillator(), o2 = ac.createOscillator(), g = ac.createGain();
      o.type = timbre === "pluck" ? "triangle" : "sine"; o.frequency.value = f;
      o2.type = "sine"; o2.frequency.value = f * (timbre === "bell" ? 2.76 : timbre === "marimba" ? 4 : 2);
      const g2 = ac.createGain(); g2.gain.value = timbre === "bell" ? 0.35 : 0.15;
      const decay = timbre === "marimba" ? 0.35 : timbre === "pluck" ? 0.6 : timbre === "drone" ? len : 1.2;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
      o.connect(g); o2.connect(g2).connect(g); g.connect(ac.destination);
      o.start(t); o2.start(t); o.stop(t + decay + 0.05); o2.stop(t + decay + 0.05);
    };
    const t0 = ac.currentTime + 0.25, n = 5 + Math.floor(rnd() * 3);
    let deg = Math.floor(rnd() * 3), t = t0;
    if (timbre === "drone") note(-7, t0, beat * (n + 2));
    for (let i = 0; i < n; i++) {
      note(deg, t, beat * 2);
      t += beat * (rnd() < 0.3 ? 2 : 1);
      deg += [-2, -1, 1, 1, 2, 3][Math.floor(rnd() * 6)];
      if (i === n - 2) deg = scale.length;   // end on the octave, like an answer
    }
  }

  function renderCountry(c) {
    const win = $("#maps .mp-cfile");
    const f = c.facts || {};
    const ll = (lat, lon) => `${fmtLat(lat)} ${fmtLon(lon)}`;
    const row = (k, v, cls = "") => (v ? `<div class="mp-cf-row ${cls}"><span>${k}</span><p>${escapeHtml(v)}</p></div>` : "");
    const cities = c.cities.map((ct) => `<button class="mp-cf-city" data-lat="${ct[1]}" data-lon="${ct[2]}" title="Fly there">
        <b>${ct[4] ? "◆ " : ""}${escapeHtml(ct[0])}</b><small>${ll(ct[1], ct[2])} · ${toMGRS(ct[1], ct[2], 3)}</small>
        <em>${ct[3] ? (ct[3] >= 1e6 ? (ct[3] / 1e6).toFixed(1) + " M" : Math.round(ct[3] / 1000) + " K") : ""}</em></button>`).join("");
    const lvl = safety[c.a3] || 0;
    win.innerHTML = `
      <div class="mp-cf-head"><span class="mp-cf-tag">COUNTRY FILE · ${escapeHtml(c.a3)}</span>
        <button class="ghost mp-cf-x" title="Close · Esc">✕</button></div>
      <div class="mp-cf-id">
        ${c.flag ? `<img class="mp-cf-flag" src="flags/${escapeHtml(c.iso)}.png" alt="">` : `<span class="mp-cf-flag none">?</span>`}
        <div><div class="mp-cf-name" data-text="${escapeHtml(c.name.toUpperCase())}">${escapeHtml(c.name.toUpperCase())}</div>
          ${f.long && !/^none$/i.test(f.long) && f.long.toLowerCase() !== c.name.toLowerCase() ? `<small>${escapeHtml(f.long)}</small>` : ""}
          ${f.location ? `<small>${escapeHtml(f.location)}</small>` : ""}</div>
      </div>
      ${c.main.length ? `<pre class="mp-cf-art">${silhouette(c)}</pre>` : ""}
      ${f.note ? `<p class="mp-cf-note">${escapeHtml(f.note)}</p>` : ""}
      <div class="mp-cf-sec">SAFETY · YOUR CALL</div>
      <div class="mp-cf-safety">${SAFETY.map((s, i) => `<button class="mp-cf-lvl ${i === lvl ? "on" : ""}" data-l="${i}" style="--lvl:${s ? s.color : "var(--faint)"}"
        title="${s ? `${s.name}|${s.line}. Colours ${escapeHtml(c.name)} on the map.` : "No level|Leave this country uncoloured."}"><i></i>${s ? s.name.toUpperCase() : "NONE"}</button>`).join("")}</div>
      <div class="mp-cf-sec">KEY FACTS</div>
      ${f.capital ? `<div class="mp-cf-row"><span>CAPITAL</span><p>${escapeHtml(f.capital)}${f.capitalAt ? `<small>${ll(f.capitalAt[0], f.capitalAt[1])}<br>MGRS ${toMGRS(f.capitalAt[0], f.capitalAt[1])}</small>` : ""}</p></div>` : ""}
      ${row("PEOPLE", f.population)}${row("LANGUAGES", f.languages)}${row("CURRENCY", f.currency)}${row("AREA", f.area)}
      ${row("TIME", f.utc)}${row("GOVERNMENT", f.government)}${row("RELIGION", f.religions)}
      ${cities ? `<div class="mp-cf-sec">MAIN CITIES</div><div class="mp-cf-cities">${cities}</div>` : ""}
      ${f.climate || f.terrain ? `<div class="mp-cf-sec">THE LAND</div>` : ""}
      ${row("CLIMATE", f.climate)}${row("TERRAIN", f.terrain)}${row("HIGHEST", f.highest)}${row("LOWEST", f.lowest)}
      ${f.resources ? `<div class="mp-cf-resrow">${resourceChips(f.resources)}</div>` : ""}
      ${row("RESOURCES", f.resources)}${row("HAZARDS", f.hazards, "warn")}${row("BORDERS", f.neighbours)}${row("COAST", f.coastline)}
      ${f.waterKm3 || (f.rivers && f.rivers.length) ? `<div class="mp-cf-sec">WATER</div>
        <pre class="mp-cf-river" data-km3="${f.waterKm3 || 0}"></pre>
        ${row("FRESH WATER", f.waterRes ? f.waterRes + " a year, renewable" : "")}${row("RIVERS", (f.rivers || []).join("; "))}${row("LAKES", (f.lakes || []).join("; "))}` : ""}
      ${f.water || f.doctors ? `<div class="mp-cf-sec">HEALTH & WATER</div>` : ""}
      ${row("SAFE WATER", f.water)}${row("DOCTORS", f.doctors)}${row("HOSPITAL", f.beds)}${row("LIFESPAN", f.life)}
      ${f.forces || f.personnel ? `<div class="mp-cf-sec">ARMED FORCES</div>
        ${f.personnel ? `<div class="mp-cf-mil"><span class="g">\u{F0D3A}</span><b></b></div>` : ""}
        ${row("FORCES", f.forces)}${row("SPENDING", f.spending)}${row("SERVICE", f.service)}${row("EQUIPMENT", f.equipment)}
        ${row("DEPLOYED ABROAD", f.deployments)}${row("NOTE", f.milNote)}${row("ARMED GROUPS", f.groups ? f.groups + " (on the US terrorism list)" : "", "warn")}` : ""}
      <div class="mp-card-actions">
        <button class="ghost mp-cf-dl" title="Download this country|Opens the download panel with ${escapeHtml(c.name)} chosen: check the size first.">󰇚 GET MAP</button>
        <button class="solid mp-cf-ask">ASK UMBRA ▸</button></div>
      <p class="mp-cf-src">CIA World Factbook (public domain) · Natural Earth · cities: Natural Earth</p>`;
    win.hidden = false;
    win.scrollTop = 0;
    if (f.personnel) win.querySelector(".mp-cf-mil b").textContent = f.personnel;
    // The river flows while the file is open.
    clearInterval(riverTimer);
    const rv = win.querySelector(".mp-cf-river");
    if (rv) {
      const R = river(+rv.dataset.km3);
      let t = 0; rv.textContent = R.frame(0); rv.dataset.lvl = R.lvl;
      if (!document.body.classList.contains("reduce-motion")) riverTimer = setInterval(() => { if (!rv.isConnected || win.hidden) { clearInterval(riverTimer); return; } rv.textContent = R.frame(++t); }, 220);
    }
    setTimeout(() => countryTune(c), 350);
    win.classList.remove("glitch"); void win.offsetWidth; win.classList.add("glitch");
    win.querySelector(".mp-cf-x").addEventListener("click", closeCountry);
    win.querySelectorAll(".mp-cf-city").forEach((b) => b.addEventListener("click", () => {
      const lat = +b.dataset.lat, lon = +b.dataset.lon;
      closeCountry();
      target = { lat, lon, name: b.querySelector("b").textContent.replace("◆ ", ""), kind: "city", label: "CITY" };
      flyTo(lat, lon, Math.max(view.z, 11));
      showCard(target);
    }));
    win.querySelectorAll(".mp-cf-lvl").forEach((b) => b.addEventListener("click", async () => {
      const l = +b.dataset.l;
      if (l) safety[c.a3] = l; else delete safety[c.a3];
      win.querySelectorAll(".mp-cf-lvl").forEach((x) => x.classList.toggle("on", x === b));
      showSafety = true; showLegend();
      $("#maps .mp-t[data-t=safety]").classList.add("on");
      frame();
      l >= 3 ? Sound.error() : Sound.click();
      try { await post("/api/safety", { levels: safety }); } catch {}
    }));
    win.querySelector(".mp-cf-ask").addEventListener("click", () => {
      toggle(false, true);
      const box = $("#q");
      box.value = `I may have to go to ${c.name}. What should I know to stay safe there: the climate, water, health risks, dangers and what to prepare?`;
      box.dispatchEvent(new Event("input"));
      box.focus();
    });
    win.querySelector(".mp-cf-dl").addEventListener("click", async () => {
      if (!countries.length) try { countries = await (await fetch("/api/maps/countries")).json(); } catch {}
      const i = countries.findIndex((x) => norm(x.name) === norm(c.name));
      closeCountry();
      if (panel !== "packs") togglePanel("packs");
      if (i >= 0) { chosen = { name: countries[i].name, bbox: countries[i].bbox, i }; chosenBox = countries[i].bbox; renderPanel(); frame(); }
    });
  }
  // The colour key, while any country has a level.
  function showLegend() {
    const el = $("#maps .mp-legend"), used = new Set(Object.values(safety));
    el.hidden = !showSafety || !used.size;
    el.innerHTML = `<b>SAFETY</b>` + SAFETY.map((s, i) => (s && used.has(i) ? `<span><i style="background:${s.color}"></i>${s.name.toUpperCase()}</span>` : "")).join("");
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

  // Map markers, in the spirit of military map symbols (and Arma's and
  // Zomboid's markers): a shape that says what kind of thing it is, a
  // symbol inside, and a colour of your choice.
  // type: [name, shape, symbol, default colour]
  const MARK = {
    pin: ["Pin", "circle", "\u{F034E}", "red"], objective: ["Objective", "tri", "\u{F023B}", "yellow"],
    friendly: ["Friendly", "rect", "\u{F0498}", "blue"], enemy: ["Enemy", "diamond", "\u{F01A4}", "red"],
    danger: ["Danger", "diamond", "\u{F0026}", "orange"], rally: ["Rally point", "rect", "\u{F0240}", "green"],
    lz: ["Landing zone", "circle", "\u{F0AC2}", "cyan"], medic: ["Medic", "circle", "\u{F02E0}", "red"],
    cache: ["Cache", "rect", "\u{F03D6}", "violet"], water: ["Water", "circle", "\u{F058C}", "cyan"],
    food: ["Food", "circle", "\u{F025A}", "green"], op: ["Observation post", "tri", "\u{F00A5}", "blue"],
    checkpoint: ["Checkpoint", "rect", "\u{F0E86}", "orange"], camp: ["Camp", "tri", "\u{F0508}", "green"],
    home: ["Home", "rect", "\u{F02DC}", "ink"],
  };
  const MCOLOR = { red: "#d8412f", orange: "#e8892a", yellow: "#e0b83a", green: "#3fae5a", cyan: "#2fa7c4", blue: "#3a6fd8", violet: "#9b6ae0", ink: "" };
  const markOf = (w) => MARK[w.icon] || MARK[w.icon === "medical" ? "medic" : "pin"];
  const colorOf = (w, pal) => MCOLOR[w.color || markOf(w)[3]] || (style === "topo" ? "#1b1b1b" : (pal && pal.ink) || "#e8d27c");
  const ICON = Object.fromEntries(Object.entries(MARK).map(([k, m]) => [k, m[2]]));
  const ICON_NAMES = Object.fromEntries(Object.entries(MARK).map(([k, m]) => [k, m[0]]));
  ICON.medical = ICON.medic; ICON_NAMES.medical = ICON_NAMES.medic;
  // Whether a colour is light (dark symbols on it then).
  const light = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ""); if (!m) return false; const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); return r * 0.3 + g * 0.59 + b * 0.11 > 150; };
  // A symbol from the icon library (mapicons.js), drawn in a square of
  // size s centred on x, y.
  const symPaths = new Map();
  function drawSym(g, name, x, y, s, color) {
    const I = window.UmbraIcons && UmbraIcons[name];
    if (!I) return false;
    let p = symPaths.get(name);
    if (!p) { p = new Path2D(I[2]); symPaths.set(name, p); }
    g.save(); g.translate(x - s / 2, y - s / 2); g.scale(s / 512, s / 512); g.fillStyle = color; g.fill(p); g.restore();
    return true;
  }
  // Draws a marker's shape at x, y (also used for the editor's buttons).
  function markerPath(g, shape, x, y, r) {
    g.beginPath();
    if (shape === "circle") g.arc(x, y, r, 0, TAU);
    else if (shape === "rect") g.rect(x - r * 1.15, y - r * 0.8, r * 2.3, r * 1.6);
    else if (shape === "diamond") { g.moveTo(x, y - r * 1.2); g.lineTo(x + r * 1.2, y); g.lineTo(x, y + r * 1.2); g.lineTo(x - r * 1.2, y); g.closePath(); }
    else { g.moveTo(x, y - r * 1.25); g.lineTo(x + r * 1.25, y + r * 0.85); g.lineTo(x - r * 1.25, y + r * 0.85); g.closePath(); }
  }
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
          <input placeholder="Search towns, streets, water, coordinates (45.92° N 6.87° E) or MGRS…" spellcheck="false" autocomplete="off">
          <div class="mp-results" hidden></div></div>
        <div class="mp-tools">
          <div class="pf-choice mp-style"><button data-s="topo" title="Topographic|A paper military map: green woods, blue water, brown relief.">TOPO</button><button data-s="tactical" title="Tactical|A dark map in the colours of your Umbra theme.">TACTICAL</button></div>
          <button class="ctl mp-t" data-t="grid" title="Grid · G|Latitude and longitude lines, with the military (MGRS) grid zones and their names."><span class="g">󰋁</span></button>
          <button class="ctl mp-t" data-t="waypoint" title="Waypoint tool · W|Click the map to mark a spot, or right-click anywhere: objectives, friendlies, enemies, water, caches, landing zones… in eight colours. Saved on this computer."><span class="g">󰍎</span></button>
          <button class="ctl mp-t" data-t="measure" title="Measuring tool · M|Click points on the map to measure a distance along them. Right-click or Enter to finish, Esc to clear."><span class="g">󰑭</span></button>
          <button class="ctl mp-t on" data-t="safety" title="Safety layer|Colours the countries you marked safe, caution, avoid or danger. Click a country's name to mark it."><span class="g">󰞀</span></button>
          <button class="ctl mp-t" data-t="points" title="Your waypoints|Every waypoint you saved: fly to one, or remove it."><span class="g">󰈻</span></button>
          <button class="ctl mp-t mp-dl-btn" data-t="packs" title="Download maps|Get detailed offline maps of a country or of the area on screen: streets, paths, water points, shelters and relief. Also lists and removes the maps you have."><span class="g">󰇚</span><i class="mp-dot" hidden></i></button>
          <button class="ctl mp-t" data-t="full" title="Full screen · F|Use the whole screen for the map. Press F or Esc to go back."><span class="g">󰊓</span></button>
          <button class="ghost mp-close" title="Close the map · Esc|Back to where you were. The map remembers where you left it.">CLOSE ✕</button>
        </div>
      </div>
      <div class="mp-body">
        <canvas class="mp-canvas"></canvas>
        <div class="mp-cross" aria-hidden="true"></div>
        <div class="mp-rail">
          <div class="mp-compass" aria-hidden="true"><i></i><span>N</span></div>
          <button class="mp-ctl" data-z="1" title="Zoom in · +|Or scroll, or double-click the map."><span class="g">󰐕</span></button>
          <button class="mp-ctl" data-z="-1" title="Zoom out · −|Or scroll the other way."><span class="g">󰍴</span></button>
          <button class="mp-ctl" data-z="0" title="Whole world|Fly back out to see the whole world."><span class="g">󰇧</span></button>
        </div>
        <div class="mp-scale"><i></i><span></span></div>
        <div class="mp-card" hidden></div>
        <div class="mp-cfile" hidden></div>
        <div class="mp-legend" hidden></div>
        <div class="mp-ambient" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 37 + 11) % 97}%;top:${(i * 53 + 7) % 91}%;animation-delay:${-(i * 1.7).toFixed(1)}s;animation-duration:${14 + (i % 5) * 3}s"></i>`).join("")}<b class="mp-glitch"></b><u class="mp-scanline"></u></div>
        <aside class="mp-panel" hidden></aside>
        <div class="mp-hint" hidden></div>
        <div class="mp-first" hidden><b>󰇚 GET A DETAILED MAP</b>This is the built-in world map. For streets, paths, water points,
          shelters and relief, download a country or an area here: it then works with no internet.
          <div class="mp-card-actions"><button class="ghost mp-first-x">LATER</button><button class="solid mp-first-go">SHOW ME ▸</button></div></div>
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

  // A short note at the top of the map for a few seconds.
  let hintTimer = 0;
  function hint(text) {
    const el = $("#maps .mp-hint");
    if (tool) return;
    el.textContent = text; el.hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { if (!tool) el.hidden = true; }, 3200);
  }
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
      if (h.kind === "country") {
        target = null;
        openCountry(h.name).then((ok) => { if (!ok) { target = { lat: h.lat, lon: h.lon, name: h.name, kind: h.kind, label: k[0] }; flyTo(h.lat, h.lon, Math.max(view.z, k[2])); showCard(target); } });
        return;
      }
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
      else if (t === "safety") {
        showSafety = !showSafety; b.classList.toggle("on", showSafety); showLegend(); save(); frame(); Sound.click();
        if (showSafety && !Object.keys(safety).length) hint("CLICK A COUNTRY'S NAME TO GIVE IT A SAFETY LEVEL");
      }
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
      if (!drag) { canvas.classList.toggle("over-name", !tool && !!countryAt(e.clientX - r.left, e.clientY - r.top)); return; }
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
      if (e.ctrlKey) return;   // Ctrl + wheel zooms the whole window (app.js)
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      const step = e.deltaMode === 1 ? e.deltaY / 3 : e.deltaY / 100;
      zoomAt(e.clientX - r.left, e.clientY - r.top, -Math.max(-1, Math.min(1, step)) * 0.6);
    }, { passive: false });
    canvas.addEventListener("dblclick", (e) => { const r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 1); });
    canvas.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (tool === "measure") { finishMeasure(); return; }
      const r = canvas.getBoundingClientRect();
      contextMenu(e.clientX - r.left, e.clientY - r.top);
    });
  }

  function click(sx, sy) {
    const [x, y] = toWorld(sx, sy);
    const lat = unY(y), lon = wrapLon(unX(x));
    if (tool === "measure") { measure.push({ lat, lon }); frame(); Sound.key(); return; }
    if (tool === "waypoint") { editWaypoint({ lat, lon, name: "", icon: "pin", note: "" }); return; }
    const land = countryAt(sx, sy);
    if (land) { openCountry(land); return; }
    const hit = waypoints.find((w) => { const [wx, wy] = toScreen(projX(w.lon), projY(w.lat)); return Math.hypot(wx - sx, wy - 12 - sy) < 16; });
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
        <button class="ghost mp-c-copy" title="Copy the coordinates|Both forms, ready to paste in a message, a note or the search box.">⧉ COPY</button>
        ${t.kind === "measure" ? `<button class="ghost mp-c-clear">CLEAR</button>` : ""}
        ${t.wp ? `<button class="ghost mp-c-edit">✎ EDIT</button><button class="ghost mp-c-del">✕ DELETE</button>`
          : t.kind !== "measure" ? `<button class="ghost mp-c-pin">󰍎 WAYPOINT</button>` : ""}
        ${t.name && !["measure", "coords", "poi", "street"].includes(t.kind) ? `<button class="solid mp-c-ask">ASK UMBRA ▸</button>` : ""}
        <button class="ghost mp-c-x" title="Close">✕</button>
      </div>`;
    if (t.name) card.querySelector(".mp-card-name").textContent = t.name;
    card.dataset.wp = t.wp ? t.wp.id : "";
    if (t.wp && t.wp.note) card.querySelector(".mp-card-note").textContent = t.wp.note;
    card.hidden = false;
    const q = (s) => card.querySelector(s);
    q(".mp-c-x").addEventListener("click", () => { card.hidden = true; target = null; frame(); Sound.click(); });
    q(".mp-c-copy").addEventListener("click", async (e) => {
      const ok = await copyText(`${fmtLat(t.lat)} ${fmtLon(t.lon)} · MGRS ${toMGRS(t.lat, t.lon)}`);
      e.target.textContent = ok ? "✓ COPIED" : "COULDN'T COPY";
      ok ? Sound.found() : Sound.error();
      setTimeout(() => { if (e.target.isConnected) e.target.textContent = "⧉ COPY"; }, 1600);
    });
    q(".mp-c-clear")?.addEventListener("click", () => { measure = []; card.hidden = true; frame(); });
    q(".mp-c-pin")?.addEventListener("click", () => editWaypoint({ lat: t.lat, lon: t.lon, name: t.name || "", icon: /water/i.test(t.label || "") ? "water" : "pin", note: "" }));
    q(".mp-c-edit")?.addEventListener("click", () => editWaypoint(t.wp));
    q(".mp-c-del")?.addEventListener("click", async () => {
      waypoints = waypoints.filter((w) => w.id !== t.wp.id);
      await saveWaypoints(); card.hidden = true; frame(); Sound.click();
    });
    q(".mp-c-ask")?.addEventListener("click", () => {
      toggle(false, true);
      const box = $("#q");
      box.value = `What should I know to stay safe around ${t.name}: the climate, water, dangers and what to prepare?`;
      box.dispatchEvent(new Event("input"));
      box.focus();
    });
  }

  // The waypoint editor: kind of marker (shape and symbol), colour, name,
  // note, and when it was noted.
  function editWaypoint(w) {
    const card = $("#maps .mp-card");
    const draft = { ...w };
    if (draft.icon === "medical") draft.icon = "medic";
    if (!MARK[draft.icon]) draft.icon = "pin";
    card.innerHTML = `<div class="mp-card-kind">${w.id ? "EDIT WAYPOINT" : "NEW WAYPOINT"}${w.created ? " · NOTED " + new Date(w.created).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase() : ""}</div>
      <div class="mp-wp-preview"><canvas width="64" height="64"></canvas><input class="mp-wp-name" maxlength="40" placeholder="Name, e.g. Water source"></div>
      <div class="mp-wp-t">MARKER</div>
      <div class="mp-wp-types">${Object.entries(MARK).map(([k, m]) => `<button type="button" class="mp-wp-type" data-i="${k}" title="${m[0]}"><canvas width="28" height="28"></canvas></button>`).join("")}</div>
      <div class="mp-wp-t">SYMBOL <small>from the icon library, or the marker's own</small></div>
      <div class="mp-wp-syms"><button type="button" class="mp-wp-sym" data-s="" title="The marker's own symbol">AUTO</button>${window.UmbraIcons ? (() => {
        const groups = {};
        for (const [k, v] of Object.entries(UmbraIcons)) (groups[v[1]] = groups[v[1]] || []).push([k, v[0]]);
        return Object.entries(groups).map(([gname, list]) => `<div class="mp-wp-sg">${gname}</div>` + list.map(([k, label]) =>
          `<button type="button" class="mp-wp-sym" data-s="${k}" title="${escapeHtml(label)}"><canvas width="22" height="22"></canvas></button>`).join("")).join("");
      })() : ""}</div>
      <div class="mp-wp-t">COLOUR <small class="mp-wp-auto"></small></div>
      <div class="mp-wp-colors"><button type="button" class="mp-wp-color" data-c="" title="The marker's own colour">AUTO</button>${Object.keys(MCOLOR).map((c) =>
        `<button type="button" class="mp-wp-color" data-c="${c}" title="${c}" style="--mc:${MCOLOR[c] || "var(--fg-bright)"}"><i></i></button>`).join("")}</div>
      <textarea class="mp-wp-note" maxlength="200" rows="2" placeholder="A note (optional): what's here, how many, when to check it"></textarea>
      <div class="mp-card-coords">${fmtLat(w.lat)} · ${fmtLon(w.lon)}<br>MGRS ${toMGRS(w.lat, w.lon)}</div>
      <div class="mp-card-actions"><button class="ghost mp-wp-cancel">CANCEL</button><button class="solid mp-wp-save">SAVE ◆</button></div>`;
    card.hidden = false;
    const name = card.querySelector(".mp-wp-name"), note = card.querySelector(".mp-wp-note");
    name.value = draft.name || ""; note.value = draft.note || "";
    const paint = (cv, type, color, r) => {
      const g = cv.getContext("2d"), d = Math.min(2, window.devicePixelRatio || 1), size = +(cv.dataset.s || (cv.dataset.s = cv.getAttribute("width")));
      cv.width = size * d; cv.height = size * d; cv.style.width = cv.style.height = size + "px";
      g.scale(d, d);
      const m = MARK[type], col = MCOLOR[color || m[3]] || (style === "topo" ? "#1b1b1b" : css("--signal"));
      markerPath(g, m[1], size / 2, size / 2, r);
      g.fillStyle = col; g.fill(); g.lineWidth = 1.2; g.strokeStyle = "#000"; g.stroke();
      g.font = `${Math.round(r * 1.2)}px ${css("--font")}`; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = light(col) ? "#111" : "#fff";
      if (!draft.sym || !drawSym(g, draft.sym, size / 2, size / 2 + (m[1] === "tri" ? r * 0.2 : 0), r * 1.3, g.fillStyle)) g.fillText(m[2], size / 2, size / 2 + (m[1] === "tri" ? r * 0.2 : 0));
    };
    const show = () => {
      card.querySelectorAll(".mp-wp-type").forEach((b) => { b.classList.toggle("on", b.dataset.i === draft.icon); paint(b.querySelector("canvas"), b.dataset.i, draft.color, 8.5); });
      card.querySelectorAll(".mp-wp-color").forEach((b) => b.classList.toggle("on", b.dataset.c === (draft.color || "")));
      card.querySelectorAll(".mp-wp-sym").forEach((b) => {
        b.classList.toggle("on", b.dataset.s === (draft.sym || ""));
        const cv = b.querySelector("canvas");
        if (cv && !cv.dataset.done) {
          cv.dataset.done = 1;
          const d = Math.min(2, window.devicePixelRatio || 1), gg = cv.getContext("2d");
          cv.width = 22 * d; cv.height = 22 * d; cv.style.width = cv.style.height = "22px"; gg.scale(d, d);
          drawSym(gg, b.dataset.s, 11, 11, 20, css("--fg-bright") || "#eee");
        }
      });
      card.querySelector(".mp-wp-auto").textContent = draft.color ? "" : "· " + MARK[draft.icon][3].toUpperCase();
      paint(card.querySelector(".mp-wp-preview canvas"), draft.icon, draft.color, 20);
      if (!name.value || Object.values(ICON_NAMES).includes(name.placeholder)) name.placeholder = MARK[draft.icon][0];
    };
    card.querySelectorAll(".mp-wp-type").forEach((b) => b.addEventListener("click", () => { draft.icon = b.dataset.i; show(); Sound.click(); }));
    card.querySelectorAll(".mp-wp-color").forEach((b) => b.addEventListener("click", () => { draft.color = b.dataset.c; show(); Sound.click(); }));
    card.querySelectorAll(".mp-wp-sym").forEach((b) => b.addEventListener("click", () => {
      draft.sym = b.dataset.s;
      if (draft.sym && (!name.value || Object.values(ICON_NAMES).includes(name.value))) name.placeholder = UmbraIcons[draft.sym][0];
      show(); Sound.click();
    }));
    show();
    setTimeout(() => name.focus(), 30);
    const saveIt = async () => {
      draft.name = name.value.trim() || (draft.sym && window.UmbraIcons && UmbraIcons[draft.sym] ? UmbraIcons[draft.sym][0] : MARK[draft.icon][0]);
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
    card.querySelector(".mp-wp-cancel").addEventListener("click", () => { card.hidden = true; Sound.click(); });
  }

  // ------------------------------------------------- right-click menu

  // Right-click the map: add a waypoint, measure, copy the coordinates,
  // what's here, range rings, and the bearing from home.
  let rings = null, bearing = null;
  const brg = (a, b) => { const f1 = a.lat * toRad, f2 = b.lat * toRad, dl = (b.lon - a.lon) * toRad;
    return ((Math.atan2(Math.sin(dl) * Math.cos(f2), Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)) / toRad) + 360) % 360; };
  function contextMenu(sx, sy) {
    const [x, y] = toWorld(sx, sy);
    const at = { lat: unY(y), lon: wrapLon(unX(x)) };
    const home = waypoints.find((w) => w.icon === "home");
    let m = $("#maps .mp-ctx");
    if (!m) { m = document.createElement("div"); m.className = "mp-ctx"; $("#maps .mp-body").appendChild(m); }
    const items = [
      ["wp", "\u{F0651}", "ADD A WAYPOINT HERE", "W"],
      ["measure", "\u{F046D}", "MEASURE FROM HERE", "M"],
      ["copy", "\u{F018F}", "COPY COORDINATES", ""],
      ["info", "\u{F02FD}", "WHAT'S HERE", ""],
      ["rings", "\u{F05DD}", rings ? "MOVE RANGE RINGS HERE" : "RANGE RINGS HERE", ""],
      ...(rings ? [["norings", "\u{F05DD}", "REMOVE RANGE RINGS", ""]] : []),
      ...(home ? [["bearing", "\u{F05F8}", `FROM HOME · ${fmtDist(distance(home, at))} · ${String(Math.round(brg(home, at))).padStart(3, "0")}°`, ""]] : []),
      ...(bearing ? [["nobearing", "\u{F05F8}", "HIDE THE LINE FROM HOME", ""]] : []),
    ];
    m.innerHTML = `<div class="mp-ctx-head">${fmtLat(at.lat)} ${fmtLon(at.lon)}<br><small>MGRS ${toMGRS(at.lat, at.lon)}</small></div>` +
      items.map(([k, g, label, key]) => `<button data-k="${k}"><span class="g">${g}</span><span>${label}</span>${key ? `<kbd>${key}</kbd>` : ""}</button>`).join("");
    m.hidden = false;
    m.style.left = Math.min(sx, W - 250) + "px";
    m.style.top = Math.min(sy, H - m.offsetHeight - 8) + "px";
    Sound.click();
    m.querySelectorAll("button").forEach((b) => b.addEventListener("click", async () => {
      m.hidden = true;
      const k = b.dataset.k;
      if (k === "wp") editWaypoint({ lat: at.lat, lon: at.lon, name: "", icon: "pin", note: "" });
      else if (k === "measure") { if (tool !== "measure") setTool("measure"); measure = [at]; frame(); }
      else if (k === "copy") { (await copyText(`${fmtLat(at.lat)} ${fmtLon(at.lon)} · MGRS ${toMGRS(at.lat, at.lon)}`)) ? Sound.found() : Sound.error(); }
      else if (k === "info") { target = { ...at, name: "", kind: "spot", label: "LOCATION" }; showCard(target); frame(); }
      else if (k === "rings") { rings = at; frame(); Sound.click(); }
      else if (k === "norings") { rings = null; frame(); Sound.click(); }
      else if (k === "bearing") { bearing = at; frame(); Sound.click(); }
      else if (k === "nobearing") { bearing = null; frame(); Sound.click(); }
    }));
  }
  document.addEventListener("mousedown", (e) => { const m = $("#maps .mp-ctx"); if (m && !m.hidden && !m.contains(e.target)) m.hidden = true; });

  // Range rings (at a round distance for the zoom) and the line from home.
  function drawRings(g, font, ink, halo) {
    if (rings) {
      const [cx, cy] = toScreen(projX(rings.lon), projY(rings.lat));
      const mPerPx = (40075016 * Math.cos(rings.lat * toRad)) / scale();
      const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000];
      const step = steps.find((km) => (km * 1000) / mPerPx > 70) || 1000;
      g.save(); g.setLineDash([6, 5]); g.strokeStyle = ink; g.lineWidth = 1.4;
      g.font = `700 10px ${font}`; g.textAlign = "left"; g.textBaseline = "middle";
      for (let i = 1; i <= 4; i++) {
        const r = (step * i * 1000) / mPerPx;
        g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
        const label = fmtDist(step * i);
        g.lineWidth = 3; g.strokeStyle = halo; g.strokeText(label, cx + r + 4, cy); g.fillStyle = ink; g.fillText(label, cx + r + 4, cy);
        g.lineWidth = 1.4; g.strokeStyle = ink;
      }
      g.setLineDash([]); g.beginPath(); g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6); g.stroke();
      g.restore();
    }
    const home = waypoints.find((w) => w.icon === "home");
    if (bearing && home) {
      const [ax, ay] = toScreen(projX(home.lon), projY(home.lat)), [bx, by] = toScreen(projX(bearing.lon), projY(bearing.lat));
      g.save(); g.strokeStyle = ink; g.lineWidth = 2; g.setLineDash([12, 4, 2, 4]);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
      g.beginPath(); g.arc(bx, by, 5, 0, TAU); g.stroke();
      const label = `${fmtDist(distance(home, bearing))} · ${String(Math.round(brg(home, bearing))).padStart(3, "0")}°`;
      g.font = `700 11px ${font}`; g.textAlign = "center"; g.textBaseline = "bottom";
      const mx = (ax + bx) / 2, my = (ay + by) / 2 - 6;
      g.lineWidth = 3.5; g.strokeStyle = halo; g.strokeText(label, mx, my); g.fillStyle = ink; g.fillText(label, mx, my);
      g.restore();
    }
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
    if (panel === "packs") { $("#maps .mp-first").hidden = true; try { localStorage.setItem("umbra-maps-hint", "1"); } catch {} }
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
        ? waypoints.map((w) => `<div class="mp-pt" data-id="${w.id}" title="Fly to it"><span class="g" style="color:${colorOf(w)}">${ICON[w.icon] || ICON.pin}</span><span><b></b><small>${fmtLat(w.lat)} ${fmtLon(w.lon)}</small></span><button class="ghost mp-del" title="Remove this waypoint">✕</button></div>`).join("")
        : `<p class="lib-note">No waypoints yet. Use the pin tool (W) and click the map: camps, water, dangers, rally points, caches…</p>`);
      box.querySelectorAll(".mp-pt").forEach((b) => {
        const w = waypoints.find((x) => x.id === b.dataset.id);
        b.querySelector("b").textContent = w.name;
        b.addEventListener("click", () => { flyTo(w.lat, w.lon, Math.max(view.z, 15)); showCard({ ...w, kind: "waypoint", wp: w, label: "WAYPOINT" }); Sound.click(); });
        b.querySelector(".mp-del").addEventListener("click", async (e) => {
          e.stopPropagation();
          const ok = await confirmDialog({ kind: "to-local", tag: "WAYPOINTS", title: `REMOVE "${w.name.toUpperCase()}"?`, body: "The waypoint is taken off the map and this computer.", ok: "REMOVE", cancel: "KEEP" });
          if (!ok) return;
          waypoints = waypoints.filter((x) => x.id !== w.id);
          const card = $("#maps .mp-card");
          if (!card.hidden && card.dataset.wp === w.id) card.hidden = true;
          await saveWaypoints(); frame(); Sound.click();
        });
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
      else if (!plan) html += `<div class="mp-dl"><span>First check the size: nothing is downloaded yet.</span><button class="solid mp-plan" ${job.active || job.resumable ? "disabled" : ""}>CHECK SIZE ▸</button></div>`;
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
        if ((job.active || job.resumable) && job.kind === "download") html += progress(job, job.paused ? "PAUSED" : "DOWNLOADING");
        else html += `<div class="mp-dl"><span>About ${fmtBytes(zsize + tsize + esize)} to download</span>
          <button class="solid mp-go" ${job.active || job.resumable || !zsize ? "disabled" : ""}>DOWNLOAD ▸</button></div>`;
      }
    } else if (job.active || job.resumable) html += progress(job, job.kind === "plan" ? "CHECKING THE SIZE" : job.paused ? "PAUSED" : "DOWNLOADING");
    if (job.phase === "failed") html += `<p class="lib-note mp-err">${escapeHtml(job.error || "Something went wrong.")} Check the connection and try again.</p>`;
    html += `</div><p class="lib-note mp-lic">Map data © OpenStreetMap contributors (ODbL), from the Protomaps daily build.
      Elevation: Terrain Tiles (AWS open data: SRTM, GMTED, ETOPO and others).</p>`;
    box.innerHTML = html;
    if (window.UmbraDownloads) UmbraDownloads.wire(box, async () => { await refreshStatus(); renderPanel(); pollJob(); });
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
      if (window.UmbraDownloads) UmbraDownloads.refresh();
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
    const dl = job.kind === "download" && window.UmbraDownloads;
    return `<div class="lib-section mp-job"><div class="lib-head"><span>${job.paused ? "󰏤" : `<span class="spin" data-spin>✻</span>`} ${title}${job.plan && job.plan.name ? " · " + escapeHtml(job.plan.name.toUpperCase()) : ""}</span><b>${job.phase === "scan" ? "" : pct + "%"}</b></div>
      <div class="dl-bar ${job.phase === "scan" ? "busy" : ""}"><i style="width:${job.phase === "scan" ? 100 : pct}%"></i></div><p class="lib-note">${escapeHtml(job.paused ? "Paused: what's downloaded is kept." : phase + got)}</p>
      ${dl ? `<div class="dl-controls">${UmbraDownloads.controls("maps", { paused: !!job.paused })}</div>${UmbraDownloads.note("the map")}` : ""}</div>`;
  }
  // With only the built-in world, the download button pulses; the first
  // time the map opens, a note points at it.
  function firstHint() {
    const el = $("#maps"), none = !!status && !status.areas.length && !(status.job && status.job.active);
    el.querySelector(".mp-dot").hidden = !none;
    const note = el.querySelector(".mp-first");
    let seen = true;
    try { seen = !!localStorage.getItem("umbra-maps-hint"); } catch {}
    if (!none || seen) { note.hidden = true; return; }
    const b = el.querySelector(".mp-dl-btn").getBoundingClientRect(), body = el.querySelector(".mp-body").getBoundingClientRect();
    note.style.setProperty("--arrow", Math.max(10, body.right - 16 - (b.left + b.width / 2) - 6) + "px");
    note.hidden = false;
    const done = () => { note.hidden = true; try { localStorage.setItem("umbra-maps-hint", "1"); } catch {} };
    note.querySelector(".mp-first-x").onclick = () => { done(); Sound.click(); };
    note.querySelector(".mp-first-go").onclick = () => { done(); if (panel !== "packs") togglePanel("packs"); };
  }
  function pollJob() {
    clearTimeout(jobTimer);
    jobTimer = setTimeout(async () => {
      const was = status && status.job && status.job.active ? status.job.kind : "";
      await refreshStatus();
      if (panel === "packs") renderPanel();
      if (status.job.active) pollJob();
      else if (was === "download" && status.job.phase === "done") {
        // The chime and the note come from the downloads button.
        if (window.UmbraDownloads) UmbraDownloads.refresh(); else Sound.found();
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
      if (!$("#maps").hidden) $("#maps .mp-dot").hidden = !!status.areas.length || !!(status.job && status.job.active);
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
  function save() { try { localStorage.setItem("umbra-maps", JSON.stringify({ style, showGrid, showSafety, view })); } catch {} }
  function restore() {
    try {
      const s = JSON.parse(localStorage.getItem("umbra-maps") || "{}");
      if (s.style) style = s.style;
      if (typeof s.showGrid === "boolean") showGrid = s.showGrid;
      if (typeof s.showSafety === "boolean") showSafety = s.showSafety;
      if (s.view && isFinite(s.view.z)) view = s.view;
    } catch {}
  }

  async function toggle(show = $("#maps").hidden, quiet = false) {
    if (show && locked) return;
    const el = $("#maps");
    if (!show) {
      if (el.hidden) return;
      if (fullOn) fullscreen();
      el.hidden = true; $("#maps-btn").classList.remove("on"); save();
      if (!quiet) Sound.click();
      document.body.classList.remove("maps-open");
      startRain();
      if (!quiet && typeof goBack === "function") goBack();
      return;
    }
    if (window.closeSettings) window.closeSettings();
    if (window.closeLoadout) window.closeLoadout(true);
    if (window.closeHistory) window.closeHistory();
    if (window.closeFieldKit) window.closeFieldKit();
    if (window.closeRadar) window.closeRadar();
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
    el.querySelector(".mp-t[data-t=safety]").classList.toggle("on", showSafety);
    loadAtlas().then(showLegend);
    await refreshStatus();
    setStyle(style);
    resize();
    Sound.click();
    try { waypoints = await (await fetch("/api/waypoints")).json(); } catch {}
    if (!countries.length) try { countries = await (await fetch("/api/maps/countries")).json(); } catch {}
    if (status && status.job && status.job.active) pollJob();
    firstHint();
    frame();
    setTimeout(() => el.querySelector(".mp-search input").focus(), 50);
  }

  let fullOn = false;
  function fullscreen() {
    fullOn = !fullOn;
    $("#maps").classList.toggle("full", fullOn);
    $("#maps .mp-t[data-t=full]").classList.toggle("on", fullOn);
    window.umbraNative(fullOn ? "fullscreen" : "unfullscreen");
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
      if ($("#maps .mp-ctx") && !$("#maps .mp-ctx").hidden) $("#maps .mp-ctx").hidden = true;
      else if (!$("#maps .mp-first").hidden) { $("#maps .mp-first-x").click(); }
      else if (!$("#maps .mp-cfile").hidden) closeCountry();
      else if (!$("#maps .mp-card").hidden && !tool) { $("#maps .mp-card").hidden = true; target = null; frame(); }
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
  new MutationObserver(() => { if (document.body.classList.contains("locked") && !$("#maps").hidden) toggle(false, true); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  // The tactical style follows the theme.
  new MutationObserver(() => { if (!$("#maps").hidden && style === "tactical") { sprites.clear(); restyle(); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });

  window.toggleMaps = toggle;
  window.closeMaps = () => { if (!$("#maps").hidden) toggle(false, true); };
  window.UmbraMaps = { toMGRS, fromMGRS, parseCoords, search: (q) => search(q), get view() { return view; },
                       go: (lat, lon, z) => flyTo(lat, lon, z), country: (c) => openCountry(c), countryAt, get atlas() { return atlas; }, stats: () => ({ cache: cache.size, queued: queued.size, running: running.size }) };
})();
