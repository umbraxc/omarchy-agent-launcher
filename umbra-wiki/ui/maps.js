// Umbra Wiki maps: offline maps drawn by Umbra itself, in two styles, a
// military TOPOGRAPHIC paper map and a dark TACTICAL one in the Umbra theme.
// Data: Natural Earth (public domain), a built-in world overview plus the
// World Atlas and regional packs downloaded from the side panel (maps.py
// cuts and packs them). With a lat/long grid, MGRS grid zones, a
// coordinate readout (degrees and MGRS), search (places or coordinates),
// waypoints, distance measuring, fullscreen and a pop-out window.
// Loaded after app.js and uses its helpers ($, Sound, escapeHtml, locked).
"use strict";

(() => {
  const TAU = Math.PI * 2;
  const clampLat = (lat) => Math.max(-85.0511, Math.min(85.0511, lat));
  const projX = (lon) => (lon + 180) / 360;
  const projY = (lat) => { const s = Math.sin(clampLat(lat) * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  const unX = (x) => x * 360 - 180;
  const unY = (y) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
  const toRad = Math.PI / 180;
  const POPOUT = new URLSearchParams(location.search).get("view") === "maps";

  // ------------------------------------------------------------- data

  const packs = new Map();       // id -> decoded pack
  let catalog = null;            // /api/maps
  let waypoints = [];

  // Decodes a pack: every coordinate list becomes a Float64Array of
  // projected x, y pairs (0..1 world units), with bounding boxes to skip
  // what's off screen.
  function decode(pack) {
    const q = pack.q;
    const ring = (flat) => {
      const out = new Float64Array(flat.length);
      let x = flat[0], y = flat[1];
      out[0] = projX(x / q); out[1] = projY(y / q);
      for (let i = 2; i < flat.length; i += 2) {
        x += flat[i]; y += flat[i + 1];
        out[i] = projX(x / q); out[i + 1] = projY(y / q);
      }
      return out;
    };
    for (const feats of Object.values(pack.layers)) {
      for (const f of feats) {
        if (f.b) {
          f.rings = f.c.map(ring);
          // A lighter copy for zoomed-out views (points closer than ~1 px at zoom 5 dropped).
          f.coarse = f.rings.map((r) => decimate(r, 1.6e-4));
          f.mid = f.rings.map((r) => decimate(r, 3.5e-5));   // ~1 px at zoom 7
          f.box = [projX(f.b[0] / q), projY(f.b[3] / q), projX(f.b[2] / q), projY(f.b[1] / q)];
          if (f.l) f.lp = [projX(f.l[0] / q), projY(f.l[1] / q)];
          else f.lp = [(f.box[0] + f.box[2]) / 2, (f.box[1] + f.box[3]) / 2];
          f.ll = [unY(f.lp[1]), unX(f.lp[0])];
        } else {
          f.lat = f.c[1] / q; f.lon = f.c[0] / q;
          f.x = projX(f.lon); f.y = projY(f.lat);
        }
        delete f.c;
      }
    }
    if (pack.bbox) pack.box = [projX(pack.bbox[0]), projY(pack.bbox[3]), projX(pack.bbox[2]), projY(pack.bbox[1])];
    return pack;
  }

  function decimate(r, tol) {
    if (r.length < 16) return r;
    const out = [r[0], r[1]];
    let px = r[0], py = r[1];
    for (let i = 2; i < r.length - 2; i += 2) {
      if (Math.abs(r[i] - px) + Math.abs(r[i + 1] - py) < tol) continue;
      out.push(r[i], r[i + 1]); px = r[i]; py = r[i + 1];
    }
    out.push(r[r.length - 2], r[r.length - 1]);
    return out.length < r.length * 0.7 ? Float64Array.from(out) : r;
  }

  async function loadPack(id) {
    if (packs.has(id)) return packs.get(id);
    packs.set(id, null);   // loading
    try {
      const p = decode(await (await fetch("/api/mapdata/" + id)).json());
      packs.set(id, p);
      draw(true);
      return p;
    } catch { packs.delete(id); return null; }
  }

  async function refreshCatalog() {
    try { catalog = await (await fetch("/api/maps")).json(); } catch { return; }
    // Packs that were deleted are dropped; new ones load when they're in view.
    for (const id of [...packs.keys()]) {
      if (id !== "world" && !catalog.packs.find((p) => p.id === id && p.installed)) packs.delete(id);
    }
    if (catalog.packs.find((p) => p.id === "atlas" && p.installed)) loadPack("atlas");
    draw(true);
  }

  // ------------------------------------------------------------ view

  let view = { x: 0.53, y: 0.36, z: 2.2 };      // centre (world units) and zoom
  const MAXZ = 13;
  let W = 0, H = 0, dpr = 1;
  let style = "topo", showGrid = true, tool = "", target = null;   // target: the searched place
  let measure = [];
  const scale = () => 256 * Math.pow(2, view.z);
  const minZ = () => Math.log2(Math.max(H, 256) / 256);
  const toScreen = (x, y) => [(x - view.x) * scale() + W / 2, (y - view.y) * scale() + H / 2];
  const toWorld = (sx, sy) => [(sx - W / 2) / scale() + view.x, (sy - H / 2) / scale() + view.y];

  // ----------------------------------------------------------- colours

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  // The paper map follows US/NATO topographic colours: blue water, green
  // vegetation, brown relief, red main roads, black names and man-made things.
  const TOPO = {
    sea: "#9fc5d6", land: ["#efe6cc", "#ece3c4", "#f1e9d3", "#e9e1c6", "#eee4c9", "#ebe5cb", "#f0e7ce"],
    lake: "#a9cee0", river: "#4a86b4", coast: "#3f6f93", border: "#3d2a3a", province: "#7d6a70",
    urban: "#e3b8a0", park: "#b9d39a", glacier: "#f4f8fb", mountain: "#9c6a3c", desert: "#c9a067", wet: "#5a8fae",
    road: "#b3261e", road2: "#4a4038", rail: "#1c1c1c", grid: "rgba(20, 40, 70, .35)", gridText: "#1f3550",
    zone: "rgba(120, 30, 30, .55)", text: "#1b1b1b", textSoft: "#4d4437", sea_text: "#2f6386", terrain_text: "#7a4a22",
    halo: "rgba(245, 240, 225, .85)", frame: "#1b1b1b", frame2: "#f3ecd8",
  };
  function palette() {
    if (style === "topo") return TOPO;
    const bg = css("--bg"), sig = css("--signal"), net = css("--net"), acc = css("--accent");
    return {
      sea: bg, land: [css("--bg-2")], lake: mix(net, bg, 0.82), river: mix(net, bg, 0.35), coast: mix(sig, bg, 0.25),
      border: sig, province: mix(sig, bg, 0.6), urban: mix(acc, bg, 0.75), park: mix("#6fbf5a", bg, 0.8),
      glacier: mix("#ffffff", bg, 0.85), mountain: mix(css("--shade-1") || sig, bg, 0.45), desert: mix(acc, bg, 0.65),
      wet: mix(net, bg, 0.5), road: mix(acc, bg, 0.2), road2: mix(css("--dim"), bg, 0.3), rail: mix(css("--fg"), bg, 0.45),
      grid: mix(sig, bg, 0.82), gridText: mix(sig, bg, 0.3), zone: mix(css("--red") || "#e06a6a", bg, 0.4),
      text: css("--fg-bright"), textSoft: css("--dim"), sea_text: mix(net, bg, 0.2), terrain_text: mix(sig, bg, 0.35),
      halo: mix(bg, bg, 0) + "e0", frame: sig, frame2: bg,
    };
  }
  function mix(a, b, t) {   // a..b by t (hex colours)
    const p = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ""); return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [128, 128, 128]; };
    const [x, y] = [p(a), p(b)];
    return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
  }

  // Fill patterns: hatching for mountains, stipple for deserts, marsh ticks.
  const patterns = {};
  function pattern(ctx, kind, color) {
    const key = kind + color;
    if (patterns[key]) return patterns[key];
    const c = document.createElement("canvas");
    c.width = c.height = 12;
    const g = c.getContext("2d");
    g.strokeStyle = g.fillStyle = color;
    g.globalAlpha = 0.55;
    if (kind === "hatch") { g.lineWidth = 1; g.beginPath(); g.moveTo(0, 12); g.lineTo(12, 0); g.moveTo(-6, 6); g.lineTo(6, -6); g.moveTo(6, 18); g.lineTo(18, 6); g.stroke(); }
    if (kind === "dots") { g.fillRect(2, 3, 1.4, 1.4); g.fillRect(8, 9, 1.4, 1.4); g.fillRect(9, 2, 1, 1); }
    if (kind === "marsh") { g.lineWidth = 1; g.beginPath(); g.moveTo(2, 8); g.lineTo(7, 8); g.moveTo(4.5, 8); g.lineTo(4.5, 5); g.stroke(); }
    return (patterns[key] = ctx.createPattern(c, "repeat"));
  }

  // ----------------------------------------------------------- drawing

  let canvas, ctx, base, bctx;         // the visible canvas, and the last full drawing
  let baseView = null;                  // the view the base drawing was made for
  let raf = 0, full = false;
  let labels = [];                      // placed label boxes, to avoid overlaps

  // The packs to draw: the best world-wide one, then detailed regions on top.
  function layersForView() {
    const world = packs.get("atlas") && view.z > 2.3 ? packs.get("atlas") : packs.get("world");
    const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
    const regional = [];
    if (catalog && view.z >= 5.6) {
      for (const p of catalog.packs) {
        if (!p.installed || p.kind === "world" || p.kind === "atlas") continue;
        const b = [projX(p.bbox[0]), projY(p.bbox[3]), projX(p.bbox[2]), projY(p.bbox[1])];
        if (b[0] > x1 || b[2] < x0 || b[1] > y1 || b[3] < y0) continue;
        const d = packs.get(p.id);
        if (d === undefined) loadPack(p.id);
        else if (d) regional.push(d);
      }
    }
    return { world, regional };
  }

  function draw(now = false) {
    full = true;
    if (now) { cancelAnimationFrame(raf); raf = 0; render(); return; }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; render(); });
  }

  // While dragging or zooming, the last full drawing is moved or scaled
  // (smooth even on a slow processor); a full redraw follows when it rests.
  let settle = 0;
  function quick() {
    if (!base || !baseView) return draw();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      raf = 0;
      const k = Math.pow(2, view.z - baseView.z);
      const S = scale();
      const dx = (baseView.x - view.x) * S + W / 2 - (W / 2) * k;
      const dy = (baseView.y - view.y) * S + H / 2 - (H / 2) * k;
      const pal = palette();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = pal.sea;
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(base, dx, dy, W * k, H * k);
      overlay(pal);
    });
    clearTimeout(settle);
    settle = setTimeout(() => draw(), 140);
  }

  function render() {
    if (!canvas || $("#maps").hidden) return;
    const pal = palette();
    const g = bctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = pal.sea;
    g.fillRect(0, 0, W, H);
    labels = [];
    setRect();
    const { world, regional } = layersForView();
    const offsets = worldCopies();
    if (world) drawPack(g, world, pal, offsets, null);
    // Regional detail replaces the world map inside its own area.
    for (const p of regional) {
      g.save();
      const [ax, ay] = toScreen(p.box[0], p.box[1]), [bx, by] = toScreen(p.box[2], p.box[3]);
      g.beginPath(); g.rect(ax, ay, bx - ax, by - ay); g.clip();
      if (p.kind === "terrain") { g.fillStyle = pal.sea; g.fillRect(ax, ay, bx - ax, by - ay); }
      drawPack(g, p, pal, offsets, null);
      g.restore();
    }
    // Place names last, over everything, without overlapping.
    drawLabels(g, [world, ...regional].filter(Boolean), pal, offsets);
    if (showGrid) drawGrid(g, pal);
    baseView = { ...view };
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlay(pal);
    full = false;
  }

  // The world repeats sideways; draw the copies that are on screen.
  function worldCopies() {
    const [x0] = toWorld(0, 0), [x1] = toWorld(W, 0);
    const out = [];
    for (let k = Math.floor(x0); k <= Math.floor(x1); k++) out.push(k);
    return out;
  }

  let vr = [0, 0, 1, 1];   // the view in world units, set before each drawing
  const setRect = () => { const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H); vr = [x0, y0, x1, y1]; };
  function visible(box, k) {
    return box[0] + k <= vr[2] && box[2] + k >= vr[0] && box[1] <= vr[3] && box[3] >= vr[1];
  }

  // One feature's rings as a path, skipping points closer than ~0.7 px.
  function path(g, f, k, closed) {
    const S = scale(), ox = W / 2 - view.x * S + k * S, oy = H / 2 - view.y * S;
    for (const r of view.z < 6.5 ? f.coarse : view.z < 8.7 ? f.mid : f.rings) {
      let px = r[0] * S + ox, py = r[1] * S + oy;
      g.moveTo(px, py);
      for (let i = 2; i < r.length; i += 2) {
        const x = r[i] * S + ox, y = r[i + 1] * S + oy;
        if (Math.abs(x - px) + Math.abs(y - py) < 0.7 && i < r.length - 2) continue;
        g.lineTo(x, y); px = x; py = y;
      }
      if (closed) g.closePath();
    }
  }
  function areas(g, feats, offsets, fill, stroke, lw, filter) {
    if (!feats) return;
    for (const k of offsets) {
      g.beginPath();
      let any = false;
      for (const f of feats) {
        if (filter && !filter(f)) continue;
        if (!visible(f.box, k)) continue;
        path(g, f, k, true); any = true;
      }
      if (!any) continue;
      if (fill) { g.fillStyle = fill; g.fill("evenodd"); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
    }
  }
  function lines(g, feats, offsets, stroke, lw, dash, filter) {
    if (!feats) return;
    g.setLineDash(dash || []);
    g.strokeStyle = stroke; g.lineWidth = lw; g.lineJoin = "round"; g.lineCap = "round";
    for (const k of offsets) {
      g.beginPath();
      for (const f of feats) {
        if (filter && !filter(f)) continue;
        if (visible(f.box, k)) path(g, f, k, false);
      }
      g.stroke();
    }
    g.setLineDash([]);
  }

  function drawPack(g, p, pal, offsets) {
    const L = p.layers, z = view.z;
    const zw = Math.max(0.6, Math.min(2.4, (z - 1.5) / 3));   // line widths grow with zoom
    // Land, tinted by country in the paper style.
    if (L.countries) {
      const tints = pal.land;
      for (let t = 0; t < tints.length; t++) {
        areas(g, L.countries, offsets, tints[t], null, 0, tints.length > 1 ? (f) => ((f.m || 1) - 1) % tints.length === t : null);
      }
    }
    if (z > 5.2) areas(g, L.urban, offsets, pal.urban, null, 0);
    areas(g, L.parks, offsets, pal.park, null, 0);
    areas(g, L.glaciers, offsets, pal.glacier, style === "topo" ? "#9cc3d8" : pal.lake, 0.6);
    if (L.terrain && z > 2.5) {
      areas(g, L.terrain, offsets, pattern(g, "hatch", pal.mountain), null, 0, (f) => /range|mtn|mount/.test(f.t || ""));
      areas(g, L.terrain, offsets, pattern(g, "dots", pal.desert), null, 0, (f) => /desert/.test(f.t || ""));
      areas(g, L.terrain, offsets, pattern(g, "marsh", pal.wet), null, 0, (f) => /wetland|swamp|marsh/.test(f.t || ""));
    }
    areas(g, L.lakes, offsets, pal.lake, pal.coast, 0.5 * zw, (f) => (f.r ?? 0) <= z * 1.6 + 1);
    lines(g, L.rivers, offsets, pal.river, 0.8 * zw, null, (f) => (f.r ?? 0) <= z * 1.5 + 1);
    lines(g, L.coast, offsets, pal.coast, 0.9 * zw);
    // Dashed lines are costly to draw: solid and faint from afar, dashed up close.
    if (z > 3) {
      g.globalAlpha = z < 6.5 ? 0.6 : 1;
      lines(g, L.provinces, offsets, pal.province, 0.6 * zw, z < 6.5 ? null : [4, 3]);
      g.globalAlpha = 1;
    }
    // Borders: dash-dot, the classic boundary line.
    lines(g, L.borders, offsets, pal.border, 1.1 * zw, [7, 3, 1.5, 3]);
    if (L.countries && !L.borders) areas(g, L.countries, offsets, null, pal.border, 0.7 * zw);
    if (z > 4.6) {
      if (z > 6) {
        lines(g, L.rail, offsets, pal.rail, (z < 8 ? 1 : 1.6) * zw, null);
        if (z >= 8) lines(g, L.rail, offsets, style === "topo" ? "#f5efdc" : pal.sea, 0.8 * zw, [5, 5]);   // the railway's ladder, up close
      }
      lines(g, L.roads, offsets, pal.river, 0.8 * zw, [2, 4], (f) => f.t === "ferry" && z > 5.5);
      lines(g, L.roads, offsets, pal.road2, 0.7 * zw, null, (f) => f.t === "minor" && z > 6.6);
      if (z > 5.6) lines(g, L.roads, offsets, pal.road, 1.3 * zw, null, (f) => f.t === "major");
    }
  }

  // ----------------------------------------------------------- labels

  function place(g, text, x, y, font, color, opts = {}) {
    g.font = font;
    const w = g.measureText(text).width + (opts.spacing || 0) * text.length;
    const h = parseFloat(font.match(/(\d+(\.\d+)?)px/)[1]);
    const box = [x - w / 2 - 3, y - h / 2 - 2, x + w / 2 + 3, y + h / 2 + 2];
    if (box[2] < 0 || box[0] > W || box[3] < 0 || box[1] > H) return false;
    if (labels.some((b) => b[0] < box[2] && b[2] > box[0] && b[1] < box[3] && b[3] > box[1])) return false;
    labels.push(box);
    g.textAlign = "center"; g.textBaseline = "middle";
    if ("letterSpacing" in g) g.letterSpacing = (opts.spacing || 0) + "px";
    if (opts.halo) { g.lineWidth = 3; g.strokeStyle = opts.halo; g.lineJoin = "round"; g.strokeText(text, x, y); }
    g.fillStyle = color;
    g.fillText(text, x, y);
    if ("letterSpacing" in g) g.letterSpacing = "0px";
    return true;
  }

  function drawLabels(g, list, pal, offsets) {
    const z = view.z, font = css("--font") || "monospace";
    const halo = style === "topo" ? pal.halo : pal.sea + "d0";
    const at = (x, y, k) => toScreen(x + k, y);
    // Waypoints and the searched place first: they always get their space.
    for (const w of waypoints) for (const k of offsets) {
      const [sx, sy] = at(projX(w.lon), projY(w.lat), k);
      labels.push([sx - 10, sy - 12, sx + 10, sy + 10]);
    }
    const seen = new Set();
    for (const p of list) {
      const L = p.layers;
      for (const k of offsets) {
        // Seas: italic, spaced, blue.
        for (const f of L.seas || []) {
          if ((f.r ?? 0) > z * 1.4 + 1 || seen.has("s" + f.n)) continue;
          const [x, y] = at(f.x, f.y, k);
          if (place(g, f.n.toUpperCase(), x, y, `italic 600 ${z > 5 ? 11 : 10}px ${font}`, pal.sea_text, { spacing: 2.5 })) seen.add("s" + f.n);
        }
        // Countries: capitals, bold and spaced, the most important first.
        const countries = (L.countries || []).filter((f) => f.n && (f.r ?? 5) <= z + 2.5).sort((a, b) => (a.r ?? 5) - (b.r ?? 5));
        for (const f of countries) {
          if (seen.has("c" + f.n) || !visible(f.box, k)) continue;
          const [x, y] = at(f.lp[0], f.lp[1], k);
          const size = Math.max(9, Math.min(15, 8 + z * 1.1 - (f.r ?? 5) * 0.6));
          if (place(g, f.n.toUpperCase(), x, y, `700 ${size}px ${font}`, pal.text, { spacing: 2, halo })) seen.add("c" + f.n);
        }
        if (z > 4.5) for (const f of L.provlabels || []) {
          if (seen.has("p" + f.n)) continue;
          const [x, y] = at(f.x, f.y, k);
          if (place(g, f.n.toUpperCase(), x, y, `600 9.5px ${font}`, pal.textSoft, { spacing: 1.5, halo })) seen.add("p" + f.n);
        }
        if (z > 3.2) for (const f of L.terrain || []) {
          if (!f.n || (f.r ?? 0) > z + 1 || seen.has("t" + f.n) || !visible(f.box, k)) continue;
          const [x, y] = at(f.lp[0], f.lp[1], k);
          if (place(g, f.n.toUpperCase(), x, y, `italic 600 10px ${font}`, pal.terrain_text, { spacing: 2, halo })) seen.add("t" + f.n);
        }
        // Cities and towns: a dot (a square for capitals), by importance.
        const weight = (f) => Math.log10((f.p || 0) + 10) + (f.cap ? 0.8 : 0) - (f.r ?? 10) * 0.15;
        const cities = (L.cities || []).filter((f) => (f.r ?? 10) <= z * 1.35 - 0.5 || (f.cap && z > 2 && ((f.p || 0) > 800000 || z > 4))).sort((a, b) => weight(b) - weight(a));
        for (const f of cities) {
          if (seen.has("x" + f.n + f.lat)) continue;
          const [x, y] = at(f.x, f.y, k);
          if (x < -40 || x > W + 40 || y < -20 || y > H + 20) continue;
          const big = f.cap || (f.p || 0) > 1e6;
          const size = big ? 11.5 : 10;
          if (!place(g, f.n, x + 6 + g.measureText(f.n).width / 2, y, `${big ? 700 : 500} ${size}px ${font}`, pal.text, { halo })) continue;
          seen.add("x" + f.n + f.lat);
          g.fillStyle = pal.text;
          if (f.cap) { g.strokeStyle = pal.text; g.lineWidth = 1.2; g.strokeRect(x - 3.5, y - 3.5, 7, 7); g.fillRect(x - 1.5, y - 1.5, 3, 3); }
          else { g.beginPath(); g.arc(x, y, big ? 2.8 : 2, 0, TAU); g.fill(); }
        }
        if (z > 5.5) for (const f of L.peaks || []) {
          const [x, y] = at(f.x, f.y, k);
          const text = f.n ? `${f.n} ${f.e ? f.e + "m" : ""}` : `${f.e}m`;
          if (!place(g, text, x, y + 9, `italic 9.5px ${font}`, pal.terrain_text, { halo })) continue;
          g.fillStyle = pal.terrain_text;
          g.beginPath(); g.moveTo(x, y - 4); g.lineTo(x + 4, y + 3); g.lineTo(x - 4, y + 3); g.closePath(); g.fill();
        }
        if (z > 6) for (const f of L.airports || []) {
          const [x, y] = at(f.x, f.y, k);
          if (f.t !== "major" && z < 7.5) continue;
          if (!place(g, "󰀝", x, y, `14px ${font}`, pal.text, { halo })) continue;   // font icons: never colour emoji
          if (z > 7) place(g, f.i || f.n || "", x, y + 11, `9px ${font}`, pal.textSoft, { halo });
        }
        if (z > 7) for (const f of L.ports || []) {
          const [x, y] = at(f.x, f.y, k);
          place(g, "󰀱", x, y, `13px ${font}`, pal.river, { halo });
        }
      }
    }
  }

  // ------------------------------------------------------------- grid

  // Latitude/longitude lines with degree labels on the frame, the MGRS grid
  // zones (6° × 8°) with their names, and a map collar with ticks.
  function drawGrid(g, pal) {
    const font = css("--font") || "monospace";
    const [x0, y0] = toWorld(0, 0), [x1, y1] = toWorld(W, H);
    const lon0 = unX(x0), lon1 = unX(x1), lat0 = unY(y1), lat1 = unY(y0);
    const steps = [30, 15, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.02, 0.01];
    const pxPerDeg = scale() / 360;
    const step = steps.find((s) => s * pxPerDeg < 170) || 0.01;
    g.strokeStyle = pal.grid; g.lineWidth = 1;
    g.beginPath();
    for (let lon = Math.ceil(lon0 / step) * step; lon <= lon1; lon += step) {
      const [x] = toScreen(projX(lon), 0); g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H);
    }
    for (let lat = Math.ceil(Math.max(-85, lat0) / step) * step; lat <= Math.min(85, lat1); lat += step) {
      const [, y] = toScreen(0, projY(lat)); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5);
    }
    g.stroke();
    // MGRS grid zones at the scales where they're useful.
    if (view.z > 2.4 && view.z < 8.5) {
      g.strokeStyle = pal.zone; g.lineWidth = 1.2; g.setLineDash([10, 4]);
      g.beginPath();
      for (let lon = Math.ceil((lon0 + 180) / 6) * 6 - 180; lon <= lon1; lon += 6) {
        const [x] = toScreen(projX(lon), 0); g.moveTo(x, 0); g.lineTo(x, H);
      }
      for (let lat = -80; lat <= 84; lat += 8) {
        if (lat < lat0 - 8 || lat > lat1 + 8) continue;
        const [, y] = toScreen(0, projY(lat)); g.moveTo(0, y); g.lineTo(W, y);
      }
      g.stroke(); g.setLineDash([]);
      g.font = `700 11px ${font}`; g.textAlign = "left"; g.textBaseline = "top"; g.fillStyle = pal.zone;
      for (let lon = Math.floor((lon0 + 180) / 6) * 6 - 180; lon <= lon1; lon += 6) {
        for (let lat = -80; lat < 84; lat += 8) {
          if (lat + 8 < lat0 || lat > lat1) continue;
          const [x, y] = toScreen(projX(lon + 0.3), projY(Math.min(84, lat + 8) - 0.3));
          const zone = Math.floor((((lon + 3) + 180) % 360) / 6) + 1;
          g.fillText(`${zone}${"CDEFGHJKLMNPQRSTUVWX"[Math.floor((lat + 80) / 8)]}`, x + 4, y + 4);
        }
      }
    }
    // The collar: a frame with alternating ticks and degree labels.
    const M = 16;
    g.fillStyle = style === "topo" ? "rgba(243, 236, 216, .92)" : pal.sea + "e6";
    g.fillRect(0, 0, W, M); g.fillRect(0, H - M, W, M); g.fillRect(0, 0, M, H); g.fillRect(W - M, 0, M, H);
    g.strokeStyle = pal.frame; g.lineWidth = 1.2;
    g.strokeRect(M + 0.5, M + 0.5, W - 2 * M - 1, H - 2 * M - 1);
    g.fillStyle = pal.gridText; g.font = `600 9.5px ${font}`; g.textBaseline = "middle"; g.textAlign = "center";
    const fmt = (v, pos, neg) => { const a = Math.abs(v); const d = step < 1 ? a.toFixed(step < 0.1 ? 2 : 1) : Math.round(a); return `${d}°${v >= 0 ? pos : neg}`; };
    for (let lon = Math.ceil(lon0 / step) * step; lon <= lon1; lon += step) {
      const [x] = toScreen(projX(lon), 0);
      if (x < M + 20 || x > W - M - 20) continue;
      const v = ((lon + 540) % 360) - 180;
      g.fillText(fmt(v, "E", "W"), x, M / 2); g.fillText(fmt(v, "E", "W"), x, H - M / 2);
    }
    for (let lat = Math.ceil(Math.max(-85, lat0) / step) * step; lat <= Math.min(85, lat1); lat += step) {
      const [, y] = toScreen(0, projY(lat));
      if (y < M + 14 || y > H - M - 14) continue;
      g.save(); g.translate(M / 2, y); g.rotate(-Math.PI / 2); g.fillText(fmt(lat, "N", "S"), 0, 0); g.restore();
      g.save(); g.translate(W - M / 2, y); g.rotate(Math.PI / 2); g.fillText(fmt(lat, "N", "S"), 0, 0); g.restore();
    }
    // Alternating black and white ticks along the inner frame.
    const tick = Math.max(24, step * pxPerDeg / 4);
    g.fillStyle = pal.frame;
    for (let x = M, i = 0; x < W - M; x += tick, i++) if (i % 2 === 0) { g.fillRect(x, M - 3, Math.min(tick, W - M - x), 3); g.fillRect(x, H - M, Math.min(tick, W - M - x), 3); }
    for (let y = M, i = 0; y < H - M; y += tick, i++) if (i % 2 === 0) { g.fillRect(M - 3, y, 3, Math.min(tick, H - M - y)); g.fillRect(W - M, y, 3, Math.min(tick, H - M - y)); }
  }

  // Things that move without redrawing the map: waypoints, the searched
  // place, the measuring line.
  function overlay(pal) {
    const g = ctx, font = css("--font") || "monospace";
    const offsets = worldCopies();
    const sig = css("--signal") || "#e8d27c";
    const ink = style === "topo" ? "#8a1c1c" : sig;
    for (const k of offsets) {
      for (const w of waypoints) {
        const [x, y] = toScreen(projX(w.lon) + k, projY(w.lat));
        if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
        g.font = `17px ${font}`; g.textAlign = "center"; g.textBaseline = "middle";
        g.lineWidth = 3; g.strokeStyle = style === "topo" ? "#f7f1df" : pal.sea; g.strokeText(ICON[w.icon] || ICON.pin, x, y - 8);
        g.fillStyle = ink; g.fillText(ICON[w.icon] || ICON.pin, x, y - 8);
        g.font = `700 10px ${font}`;
        g.strokeText(w.name.toUpperCase(), x, y + 9); g.fillText(w.name.toUpperCase(), x, y + 9);
      }
      if (target) {
        const [x, y] = toScreen(projX(target.lon) + k, projY(target.lat));
        g.strokeStyle = ink; g.lineWidth = 2;
        g.beginPath(); g.arc(x, y, 11, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(x - 18, y); g.lineTo(x - 6, y); g.moveTo(x + 6, y); g.lineTo(x + 18, y);
        g.moveTo(x, y - 18); g.lineTo(x, y - 6); g.moveTo(x, y + 6); g.lineTo(x, y + 18); g.stroke();
      }
      if (measure.length) {
        g.strokeStyle = ink; g.lineWidth = 2; g.setLineDash([8, 5]);
        g.beginPath();
        measure.forEach((m, i) => { const [x, y] = toScreen(projX(m.lon) + k, projY(m.lat)); i ? g.lineTo(x, y) : g.moveTo(x, y); });
        g.stroke(); g.setLineDash([]);
        let total = 0;
        measure.forEach((m, i) => {
          const [x, y] = toScreen(projX(m.lon) + k, projY(m.lat));
          g.fillStyle = ink; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill();
          if (i) {
            total += distance(measure[i - 1], m);
            g.font = `700 10.5px ${font}`; g.textAlign = "left"; g.textBaseline = "bottom";
            g.lineWidth = 3; g.strokeStyle = style === "topo" ? "#f7f1df" : pal.sea;
            g.strokeText(fmtDist(total), x + 7, y - 5); g.fillText(fmtDist(total), x + 7, y - 5);
          }
        });
      }
    }
  }

  // --------------------------------------------------- coordinates, MGRS

  const units = () => ((window.UmbraProfile && window.UmbraProfile.data.units) === "imperial" ? "mi" : "km");
  function distance(a, b) {   // great-circle, in km
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

  // MGRS from latitude/longitude (WGS84 UTM, with the Norway and Svalbard zones).
  const BANDS = "CDEFGHJKLMNPQRSTUVWX";
  function toMGRS(lat, lon, digits = 5) {
    if (lat < -80 || lat > 84) return "—";
    let zone = Math.floor((lon + 180) / 6) + 1;
    if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
    if (lat >= 72 && lat < 84) { if (lon >= 0 && lon < 9) zone = 31; else if (lon < 21) zone = 33; else if (lon < 33) zone = 35; else if (lon < 42) zone = 37; }
    const { e, n } = utm(lat, lon, zone);
    const band = BANDS[Math.min(19, Math.floor((lat + 80) / 8))];
    const set = ((zone - 1) % 6) + 1;
    const colLetters = ["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"][(set - 1) % 3];
    const rowLetters = "ABCDEFGHJKLMNPQRSTUV";
    const col = colLetters[Math.floor(e / 100000) - 1];
    const row = rowLetters[(Math.floor(n / 100000) + (set % 2 === 0 ? 5 : 0)) % 20];
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
  // MGRS back to latitude/longitude, for searching "31U FT 12345 67890".
  function fromMGRS(text) {
    const m = /^\s*(\d{1,2})\s*([C-HJ-NP-X])\s*([A-HJ-NP-Z])([A-HJ-NP-V])\s*(\d+)\s*(\d*)\s*$/i.exec(text);
    if (!m) return null;
    const zone = +m[1], band = m[2].toUpperCase(), col = m[3].toUpperCase(), row = m[4].toUpperCase();
    let digits = m[5] + m[6];
    if (digits.length % 2) return null;
    const half = digits.length / 2;
    const ee = half ? +digits.slice(0, half) * 10 ** (5 - half) : 0, nn = half ? +digits.slice(half) * 10 ** (5 - half) : 0;
    const set = ((zone - 1) % 6) + 1;
    const e = (["ABCDEFGH", "JKLMNPQR", "STUVWXYZ"][(set - 1) % 3].indexOf(col) + 1) * 100000 + ee;
    const rowIdx = ("ABCDEFGHJKLMNPQRSTUV".indexOf(row) - (set % 2 === 0 ? 5 : 0) + 20) % 20;
    // The band's southern edge gives which 2,000 km cycle the row letter is in.
    const bandLat = -80 + BANDS.indexOf(band) * 8;
    const south = bandLat < 0;
    const nBand = utm(bandLat, (zone - 1) * 6 - 180 + 3, zone).n;
    let n = rowIdx * 100000 + nn;
    while (n < nBand - 100000) n += 2000000;
    const ll = fromUTM(e, n, zone, south);
    return ll && Math.abs(ll.lat - (bandLat + 4)) < 6 ? ll : null;
  }
  function fromUTM(e, n, zone, south) {
    const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const x = e - 500000, y = south ? n - 10000000 : n;
    const M = y / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
    const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
      + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
    const N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), T1 = Math.tan(p1) ** 2, C1 = ep2 * Math.cos(p1) ** 2;
    const R1 = a * (1 - e2) / (1 - e2 * Math.sin(p1) ** 2) ** 1.5, D = x / (N1 * k0);
    const lat = p1 - (N1 * Math.tan(p1) / R1) * (D ** 2 / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * ep2) * D ** 4 / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * ep2 - 3 * C1 ** 2) * D ** 6 / 720);
    const lon = (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * ep2 + 24 * T1 ** 2) * D ** 5 / 120) / Math.cos(p1);
    return { lat: lat / toRad, lon: ((zone - 1) * 6 - 180 + 3) + lon / toRad };
  }
  // Decimal degrees ("52.09, 5.12", "52.09N 5.12E") or degrees-minutes-seconds.
  function parseCoords(text) {
    const t = text.trim().toUpperCase();
    const dms = /^(\d{1,2})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)?["″]?\s*([NS])[,\s]+(\d{1,3})[°\s]+(\d{1,2})['′\s]+(\d{1,2}(?:\.\d+)?)?["″]?\s*([EW])$/.exec(t);
    if (dms) {
      const lat = (+dms[1] + dms[2] / 60 + (+dms[3] || 0) / 3600) * (dms[4] === "S" ? -1 : 1);
      const lon = (+dms[5] + dms[6] / 60 + (+dms[7] || 0) / 3600) * (dms[8] === "W" ? -1 : 1);
      return { lat, lon };
    }
    const dec = /^(-?\d{1,2}(?:\.\d+)?)\s*°?\s*([NS])?[,\s]+(-?\d{1,3}(?:\.\d+)?)\s*°?\s*([EW])?$/.exec(t);
    if (dec) {
      const lat = +dec[1] * (dec[2] === "S" ? -1 : 1), lon = +dec[3] * (dec[4] === "W" ? -1 : 1);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { lat, lon };
    }
    return fromMGRS(text);
  }

  // ------------------------------------------------------------ search

  const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const KIND = {
    country: ["COUNTRY", "󰇧", 9], capital: ["CAPITAL", "󰓏", 8], city: ["CITY", "󰅆", 6], town: ["TOWN", "󰴕", 4],
    province: ["PROVINCE", "󰍍", 5], sea: ["SEA", "󰖌", 5], terrain: ["TERRAIN", "󰋵", 4], peak: ["PEAK", "󰋵", 4],
    lake: ["LAKE", "󰖌", 4], river: ["RIVER", "󰖌", 3], airport: ["AIRPORT", "󰀝", 3], port: ["PORT", "󰀱", 2], waypoint: ["WAYPOINT", "󰈻", 10],
  };
  // Coordinates and waypoints are found here; places come from the index
  // the backend keeps of every map on this computer.
  async function search(q) {
    const t = norm(q.trim());
    if (!t) return [];
    const hits = [];
    const coord = parseCoords(q);
    if (coord) hits.push({ kind: "coords", name: `${fmtLat(coord.lat)}  ${fmtLon(coord.lon)}`, lat: coord.lat, lon: coord.lon, zoom: 9 });
    for (const w of waypoints) if (norm(w.name).includes(t)) hits.push({ kind: "waypoint", name: w.name, lat: w.lat, lon: w.lon, zoom: 10 });
    if (t.length >= 2) {
      try { hits.push(...await (await fetch("/api/mapsearch?q=" + encodeURIComponent(q.trim()))).json()); } catch {}
    }
    return hits.slice(0, 14);
  }

  // --------------------------------------------------------- motion

  // A smooth flight: zoom out a little, glide over, zoom in.
  let flight = 0;
  function flyTo(lat, lon, z) {
    const from = { ...view }, to = { x: projX(lon), y: projY(lat), z: Math.min(MAXZ, z) };
    const dx = to.x - from.x;
    if (Math.abs(dx) > 0.5) from.x += dx > 0 ? 1 : -1;
    const dist = Math.hypot(to.x - from.x, to.y - from.y) * 256 * Math.pow(2, Math.min(from.z, to.z));
    const peak = Math.min(from.z, to.z) - Math.min(4, Math.max(0, Math.log2(dist / 400)));
    const t0 = performance.now(), dur = Math.min(1600, 600 + dist / 3);
    cancelAnimationFrame(flight);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur), e = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      view.x = from.x + (to.x - from.x) * e;
      view.y = from.y + (to.y - from.y) * e;
      view.z = from.z + (to.z - from.z) * e - (peak < Math.min(from.z, to.z) ? Math.sin(Math.PI * t) * (Math.min(from.z, to.z) - peak) : 0);
      clampView();
      if (t < 1) { quick(); flight = requestAnimationFrame(step); } else { view.x = ((view.x % 1) + 1) % 1; draw(); readout(); }
    };
    flight = requestAnimationFrame(step);
  }
  function clampView() {
    view.z = Math.max(minZ(), Math.min(MAXZ, view.z));
    const half = H / 2 / scale();
    view.y = Math.max(half, Math.min(1 - half, view.y));
  }
  function zoomAt(sx, sy, dz) {
    const [wx, wy] = toWorld(sx, sy);
    view.z = Math.max(minZ(), Math.min(MAXZ, view.z + dz));
    const [nx, ny] = toWorld(sx, sy);
    view.x += wx - nx; view.y += wy - ny;
    clampView();
    quick();
    readout();
  }

  // ---------------------------------------------------------------- UI

  const ICON = { pin: "󰍎", camp: "󰔈", water: "󰖌", danger: "󰀪", rally: "󰈻", cache: "󰜦", medical: "󰋠", home: "󰋜" };
  const ICON_NAMES = { pin: "Pin", camp: "Camp", water: "Water", danger: "Danger", rally: "Rally point", cache: "Cache", medical: "Medical", home: "Home" };
  let panel = "";   // "", "packs", "points"

  function build() {
    const el = document.createElement("div");
    el.id = "maps";
    el.className = "maps";
    el.hidden = true;
    el.innerHTML = `
      <div class="mp-head">
        <span class="lo-title"><span class="spin" data-spin>✻</span> MAPS</span>
        <div class="mp-search"><span class="g">󰍉</span>
          <input placeholder="Search places, or coordinates / MGRS…" spellcheck="false" autocomplete="off">
          <div class="mp-results" hidden></div></div>
        <div class="mp-tools">
          <div class="pf-choice mp-style"><button data-s="topo">TOPO</button><button data-s="tactical">TACTICAL</button></div>
          <button class="ctl mp-t" data-t="grid" title="Grid lines and MGRS zones (G)"><span class="g">󰋁</span></button>
          <button class="ctl mp-t" data-t="waypoint" title="Drop a waypoint (W)"><span class="g">󰍎</span></button>
          <button class="ctl mp-t" data-t="measure" title="Measure a distance (M); right-click ends"><span class="g">󰑭</span></button>
          <button class="ctl mp-t" data-t="points" title="Your waypoints"><span class="g">󰈻</span></button>
          <button class="ctl mp-t" data-t="packs" title="Download maps"><span class="g">󰇚</span></button>
          <button class="ctl mp-t" data-t="full" title="Full screen (F)"><span class="g">󰊓</span></button>
          <button class="ctl mp-t mp-popout" data-t="pop" title="Open the map in its own window"><span class="g">󰏌</span></button>
          <button class="ghost mp-close" title="Close (Esc)">CLOSE ✕</button>
        </div>
      </div>
      <div class="mp-body">
        <canvas class="mp-canvas"></canvas>
        <div class="mp-cross" aria-hidden="true"></div>
        <div class="mp-compass" aria-hidden="true"><span>N</span></div>
        <div class="mp-zoom"><button class="ctl" data-z="1" title="Zoom in (+)"><span class="g">󰐕</span></button>
          <button class="ctl" data-z="-1" title="Zoom out (−)"><span class="g">󰍴</span></button>
          <button class="ctl" data-z="0" title="Whole world"><span class="g">󰇧</span></button></div>
        <div class="mp-scale"><i></i><span></span></div>
        <div class="mp-card" hidden></div>
        <aside class="mp-panel" hidden></aside>
        <div class="mp-hint" hidden></div>
      </div>
      <div class="mp-foot"><span class="mp-coord"></span><span class="mp-mgrs"></span><span class="mp-zl"></span>
        <span class="mp-credit">NATURAL EARTH · PUBLIC DOMAIN</span></div>`;
    document.body.appendChild(el);
    canvas = el.querySelector(".mp-canvas");
    ctx = canvas.getContext("2d");
    base = document.createElement("canvas");
    bctx = base.getContext("2d");
    wire(el);
    new ResizeObserver(resize).observe(el.querySelector(".mp-body"));
  }

  function resize() {
    const body = $("#maps .mp-body");
    if (!body || $("#maps").hidden) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = body.clientWidth; H = body.clientHeight;
    for (const c of [canvas, base]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    clampView();
    draw(true);
    readout();
  }

  // The status line: where the crosshair is, in degrees and MGRS.
  function readout(sx, sy) {
    const el = $("#maps");
    if (!el || el.hidden) return;
    const [x, y] = sx === undefined ? [view.x, view.y] : toWorld(sx, sy);
    const lat = unY(Math.max(0, Math.min(1, y))), lon = ((unX(x) + 540) % 360) - 180;
    el.querySelector(".mp-coord").textContent = `${sx === undefined ? "CENTRE" : "CURSOR"}  ${fmtLat(lat)}  ${fmtLon(lon)}`;
    el.querySelector(".mp-mgrs").textContent = `MGRS ${toMGRS(lat, lon)}`;
    const mPerPx = (40075016 * Math.cos(view.y ? unY(view.y) * toRad : 0)) / scale();
    el.querySelector(".mp-zl").textContent = `ZOOM ${view.z.toFixed(1)} · 1:${fmtScale(mPerPx * 3780)}`;
    // Scale bar: a round distance about 100 px long.
    const km = (mPerPx * 110) / 1000;
    const nice = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find((v) => v >= km * (units() === "mi" ? 0.621 : 1) * 0.7) || 5000;
    const kmNice = units() === "mi" ? nice / 0.621371 : nice;
    el.querySelector(".mp-scale i").style.width = Math.round((kmNice * 1000) / mPerPx) + "px";
    el.querySelector(".mp-scale span").textContent = `${nice < 1 ? nice * (units() === "mi" ? 5280 : 1000) : nice} ${nice < 1 ? (units() === "mi" ? "FT" : "M") : units().toUpperCase()}`;
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
    if (tool !== "measure") { measure = []; draw(); }
    Sound.click();
  }

  function wire(el) {
    const input = el.querySelector(".mp-search input"), results = el.querySelector(".mp-results");
    let hits = [], sel = 0;
    const showResults = () => {
      results.hidden = !hits.length;
      results.innerHTML = hits.map((h, i) => {
        const k = h.kind === "coords" ? ["COORDINATES", "󰆤"] : KIND[h.kind];
        return `<button class="mp-hit ${i === sel ? "on" : ""}" data-i="${i}"><span class="g">${k[1]}</span>
          <span class="mp-hn">${escapeHtml(h.name)}</span><small>${k[0]}${h.ctx ? " · " + escapeHtml(h.ctx.toUpperCase()) : ""}</small></button>`;
      }).join("");
      results.querySelectorAll(".mp-hit").forEach((b) => b.addEventListener("mousedown", (e) => { e.preventDefault(); go(hits[+b.dataset.i]); }));
    };
    const go = (h) => {
      if (!h) return;
      results.hidden = true;
      input.blur();
      target = { lat: h.lat, lon: h.lon, name: h.name, kind: h.kind, ctx: h.ctx, pop: h.pop };
      flyTo(h.lat, h.lon, Math.max(view.z, h.zoom || 8));
      showCard(target);
      Sound.found();
      if (window.track && h.kind !== "coords") track("mapSearches", h.name);
    };
    let token = 0, typing = 0;
    input.addEventListener("input", () => {
      clearTimeout(typing);
      typing = setTimeout(async () => {
        const mine = ++token, found = await search(input.value);
        if (mine !== token) return;
        hits = found; sel = 0; showResults();
      }, 110);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(hits.length - 1, sel + 1); showResults(); }
      if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(0, sel - 1); showResults(); }
      if (e.key === "Enter") {
        e.preventDefault();
        clearTimeout(typing);
        if (hits.length) go(hits[sel]);
        else search(input.value).then((h) => { hits = h; go(h[0]); });
      }
      if (e.key === "Escape") { e.stopPropagation(); if (input.value) { input.value = ""; hits = []; showResults(); } else input.blur(); }
    });
    input.addEventListener("blur", () => setTimeout(() => (results.hidden = true), 120));
    input.addEventListener("focus", () => { if (hits.length) results.hidden = false; });

    el.querySelectorAll(".mp-style button").forEach((b) => b.addEventListener("click", () => setStyle(b.dataset.s, true)));
    el.querySelectorAll(".mp-t").forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset.t;
      if (t === "grid") { showGrid = !showGrid; b.classList.toggle("on", showGrid); save(); draw(); Sound.click(); }
      else if (t === "waypoint" || t === "measure") setTool(t);
      else if (t === "packs" || t === "points") togglePanel(t);
      else if (t === "full") fullscreen();
      else if (t === "pop") popout();
    }));
    el.querySelector(".mp-close").addEventListener("click", () => toggle(false));
    el.querySelectorAll(".mp-zoom .ctl").forEach((b) => b.addEventListener("click", () => {
      const z = +b.dataset.z;
      if (z === 0) flyTo(20, 10, minZ() + 0.2); else zoomAt(W / 2, H / 2, z);
      Sound.click();
    }));

    // Drag to pan, wheel to zoom, double-click to zoom in, click for tools.
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
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
      quick();
    });
    canvas.addEventListener("pointerup", (e) => {
      const d = drag; drag = null;
      if (!d || d.moved) { view.x = ((view.x % 1) + 1) % 1; return; }
      const r = canvas.getBoundingClientRect();
      click(e.clientX - r.left, e.clientY - r.top);
    });
    canvas.addEventListener("pointerleave", () => readout());
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect();
      zoomAt(e.clientX - r.left, e.clientY - r.top, -Math.sign(e.deltaY) * Math.min(0.6, Math.abs(e.deltaY) / 200 + 0.15));
    }, { passive: false });
    canvas.addEventListener("dblclick", (e) => { const r = canvas.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, 1); });
    canvas.addEventListener("contextmenu", (e) => { e.preventDefault(); if (tool === "measure") finishMeasure(); });
  }

  function click(sx, sy) {
    const [x, y] = toWorld(sx, sy);
    const lat = unY(y), lon = ((unX(x) + 540) % 360) - 180;
    if (tool === "measure") { measure.push({ lat, lon }); overlayOnly(); Sound.key(); return; }
    if (tool === "waypoint") { editWaypoint({ lat, lon, name: "", icon: "pin", note: "" }, sx, sy); return; }
    // A waypoint under the cursor opens its card; elsewhere, a spot card.
    const hit = waypoints.find((w) => { const [wx, wy] = toScreen(projX(w.lon) + Math.round(x - projX(w.lon)), projY(w.lat)); return Math.hypot(wx - sx, wy - sy + 8) < 14; });
    if (hit) { showCard({ ...hit, kind: "waypoint", wp: hit }); return; }
    target = { lat, lon, name: "", kind: "spot" };
    showCard(target);
    overlayOnly();
  }
  function overlayOnly() {
    if (!base) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (baseView && (baseView.x !== view.x || baseView.y !== view.y || baseView.z !== view.z)) return quick();
    overlay(palette());
  }
  function finishMeasure() {
    if (measure.length < 2) return;
    let km = 0;
    for (let i = 1; i < measure.length; i++) km += distance(measure[i - 1], measure[i]);
    showCard({ kind: "measure", name: `DISTANCE ${fmtDist(km)}`, lat: measure[measure.length - 1].lat, lon: measure[measure.length - 1].lon, km });
    tool = ""; $("#maps").querySelectorAll(".mp-t").forEach((b) => b.dataset.t === "measure" && b.classList.remove("on"));
    $("#maps .mp-hint").hidden = true;
    $("#maps").classList.remove("tooling");
    Sound.found();
  }

  // The info card for a place, a spot, a waypoint or a measurement.
  function showCard(t) {
    const card = $("#maps .mp-card");
    const kind = t.kind === "spot" ? "LOCATION" : t.kind === "measure" ? "MEASUREMENT" : t.kind === "coords" ? "COORDINATES" : (KIND[t.kind] || ["PLACE"])[0];
    const extra = t.pop ? `POPULATION ${t.pop.toLocaleString()}` : t.ctx || "";
    card.innerHTML = `<div class="mp-card-kind">${kind}${t.wp ? ` · ${ICON_NAMES[t.wp.icon].toUpperCase()}` : ""}</div>
      ${t.name ? `<div class="mp-card-name"></div>` : ""}
      ${extra ? `<div class="mp-card-extra"></div>` : ""}
      ${t.wp && t.wp.note ? `<p class="mp-card-note"></p>` : ""}
      <div class="mp-card-coords">${fmtLat(t.lat)} · ${fmtLon(t.lon)}<br>MGRS ${toMGRS(t.lat, t.lon)}</div>
      <div class="mp-card-actions">
        ${t.kind === "measure" ? `<button class="ghost mp-c-clear">CLEAR</button>` : ""}
        ${t.wp ? `<button class="ghost mp-c-edit">✎ EDIT</button><button class="ghost mp-c-del">✕ DELETE</button>`
          : t.kind !== "measure" ? `<button class="ghost mp-c-pin">󰍎 WAYPOINT</button>` : ""}
        ${t.name && t.kind !== "measure" && t.kind !== "coords" ? `<button class="solid mp-c-ask">ASK UMBRA ▸</button>` : ""}
        <button class="ghost mp-c-x" title="Close">✕</button>
      </div>`;
    if (t.name) card.querySelector(".mp-card-name").textContent = t.name;
    if (extra) card.querySelector(".mp-card-extra").textContent = extra.toUpperCase();
    if (t.wp && t.wp.note) card.querySelector(".mp-card-note").textContent = t.wp.note;
    card.hidden = false;
    const q = (s) => card.querySelector(s);
    q(".mp-c-x").addEventListener("click", () => { card.hidden = true; target = null; overlayOnly(); });
    q(".mp-c-clear")?.addEventListener("click", () => { measure = []; card.hidden = true; overlayOnly(); });
    q(".mp-c-pin")?.addEventListener("click", () => editWaypoint({ lat: t.lat, lon: t.lon, name: t.name || "", icon: "pin", note: "" }));
    q(".mp-c-edit")?.addEventListener("click", () => editWaypoint(t.wp));
    q(".mp-c-del")?.addEventListener("click", async () => {
      waypoints = waypoints.filter((w) => w.id !== t.wp.id);
      await saveWaypoints(); card.hidden = true; overlayOnly(); Sound.click();
    });
    // Ask Umbra about the place: the question lands in the prompt, ready to send.
    q(".mp-c-ask")?.addEventListener("click", () => {
      const where = t.ctx && t.kind !== "terrain" ? `${t.name}, ${t.ctx}` : t.name;
      toggle(false);
      const box = $("#q");
      box.value = `What should I know to stay safe around ${where}: the climate, water, dangers and what to prepare?`;
      box.dispatchEvent(new Event("input"));
      box.focus();
    });
  }

  function editWaypoint(w, sx, sy) {
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
      showCard({ ...draft, kind: "waypoint", wp: draft });
      draw();
      Sound.found();
    };
    card.querySelector(".mp-wp-save").addEventListener("click", saveIt);
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveIt(); } });
    card.querySelector(".mp-wp-cancel").addEventListener("click", () => { card.hidden = true; });
  }

  async function saveWaypoints() {
    try {
      const r = await (await fetch("/api/waypoints", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waypoints }),
      })).json();
      if (Array.isArray(r)) waypoints = r;
    } catch { Sound.error(); }
    if (panel === "points") renderPanel();
    if (window.UmbraAchievements) UmbraAchievements.check();
  }

  // ------------------------------------------------------ side panel

  function togglePanel(which) {
    panel = panel === which ? "" : which;
    $("#maps").querySelectorAll(".mp-t[data-t=packs], .mp-t[data-t=points]").forEach((b) => b.classList.toggle("on", b.dataset.t === panel));
    renderPanel();
    Sound.click();
  }

  let chosen = new Set(), jobTimer = 0;
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
        b.addEventListener("click", () => { flyTo(w.lat, w.lon, Math.max(view.z, 9)); showCard({ ...w, kind: "waypoint", wp: w }); });
      });
      keepTop(box, top);
      return;
    }
    if (!catalog) { box.innerHTML = `<p class="lib-note">Reading maps…</p>`; return; }
    const job = catalog.job || {};
    const inst = (id) => catalog.packs.find((p) => p.id === id && p.installed);
    const sizeOf = (id) => { const p = inst(id); return p ? fmtSize(p.bytes) : ""; };
    const needs = { atlas: chosen.has("atlas") };
    for (const id of chosen) needs[id.split("-")[0]] = true;
    const mb = (needs.atlas ? catalog.atlasMB : 0) + (needs.terrain ? catalog.sets[0].downloadMB : 0) + (needs.infra ? catalog.sets[1].downloadMB : 0);
    let html = `<p class="lib-note">Maps are stored in <code>${escapeHtml(catalog.dir)}</code> and work fully offline.
      Pick what to download: the source data is fetched once, then cut to your regions.</p>`;
    if (job.active || job.phase === "failed") {
      const pct = job.total ? Math.min(99, Math.round((job.received / job.total) * 100)) : 0;
      html += `<div class="lib-section"><div class="lib-head"><span>${job.active ? '<span class="spin" data-spin>✻</span> ' : ""}${
        job.phase === "build" ? "BUILDING MAPS" : job.phase === "failed" ? "DOWNLOAD FAILED" : "DOWNLOADING"}</span><b>${job.phase === "build" ? "" : pct + "%"}</b></div>
        <div class="dl-bar"><i style="width:${job.phase === "build" ? 100 : pct}%"></i></div>
        <p class="lib-note">${job.phase === "failed" ? escapeHtml(job.error || "") : job.phase === "build" ? "Cutting and packing the regions (about a minute)…" : escapeHtml((job.file || "").replace(/^ne_/, "").replace(/_/g, " "))}</p></div>`;
    }
    const row = (id, name, line) => {
      const i = inst(id);
      return `<label class="mp-pack ${i ? "have" : ""}"><input type="checkbox" data-id="${id}" ${chosen.has(id) ? "checked" : ""} ${i || job.active ? "disabled" : ""}>
        <span><b>${escapeHtml(name)}</b><small>${escapeHtml(line)}</small></span>
        ${i ? `<span class="mp-have">✓ ${sizeOf(id)}</span><button class="ghost mp-del" data-id="${id}" title="Delete">✕</button>` : ""}</label>`;
    };
    html += `<div class="lib-section"><div class="lib-head"><span>WORLD</span></div>
      <div class="mp-pack have"><span class="g mp-builtin">󰇧</span><span><b>World overview</b><small>Countries, capitals, major rivers and lakes</small></span><span class="mp-have">BUILT IN</span></div>
      ${row("atlas", "World Atlas", "The whole world in more detail: 1,200 cities, provinces, rivers, lakes, mountain ranges, seas")}</div>`;
    html += `<div class="lib-section"><div class="lib-head"><span>REGIONS</span><small class="mp-legend-t">TERRAIN · INFRASTRUCTURE</small></div>`;
    for (const r of catalog.regions) {
      html += `<div class="mp-region" data-r="${r.id}"><div class="mp-rname">${escapeHtml(r.name.toUpperCase())}</div>
        ${row("terrain-" + r.id, "Terrain & places", catalog.sets[0].line)}${row("infra-" + r.id, "Infrastructure", catalog.sets[1].line)}</div>`;
    }
    html += `</div><div class="mp-dl"><span>${chosen.size ? `${chosen.size} selected · about ${mb} MB to download` : "Select maps to download"}</span>
      <button class="solid mp-go" ${!chosen.size || job.active ? "disabled" : ""}>DOWNLOAD ▸</button></div>`;
    box.innerHTML = html;
    box.querySelectorAll("input[type=checkbox]").forEach((c) => c.addEventListener("change", () => {
      if (c.checked) chosen.add(c.dataset.id); else chosen.delete(c.dataset.id);
      Sound.click(); renderPanel();
    }));
    box.querySelectorAll(".mp-region").forEach((r) => {
      r.addEventListener("mouseenter", () => { hover = r.dataset.r; overlayRegions(); });
      r.addEventListener("mouseleave", () => { hover = ""; overlayOnly(); });
    });
    box.querySelectorAll(".mp-del").forEach((b) => b.addEventListener("click", async (e) => {
      e.preventDefault();
      const ok = await confirmDialog({ kind: "to-local", tag: "MAPS", title: "DELETE THIS MAP?", body: "You can download it again any time.", ok: "DELETE", cancel: "KEEP" });
      if (!ok) return;
      await fetch("/api/maps/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.dataset.id }) });
      await refreshCatalog(); renderPanel();
    }));
    box.querySelector(".mp-go")?.addEventListener("click", async () => {
      const r = await (await fetch("/api/maps/download", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packs: [...chosen] }),
      })).json();
      if (r.error) { Sound.error(); return; }
      chosen.clear(); catalog = r; Sound.click(); renderPanel(); pollJob();
    });
    keepTop(box, top);
  }
  function keepTop(box, top) { box.scrollTop = top; }
  function pollJob() {
    clearTimeout(jobTimer);
    jobTimer = setTimeout(async () => {
      const was = catalog && catalog.job && catalog.job.active;
      try { catalog = await (await fetch("/api/maps")).json(); } catch {}
      if (panel === "packs") renderPanel();
      if (catalog.job.active) pollJob();
      else if (was) { await refreshCatalog(); if (catalog.job.phase === "done") Sound.found(); if (window.UmbraAchievements) UmbraAchievements.check(); }
    }, 1500);
  }

  // Hovering a region in the list outlines it on the map.
  let hover = "";
  function overlayRegions() {
    overlayOnly();
    const r = catalog && catalog.regions.find((x) => x.id === hover);
    if (!r) return;
    const [ax, ay] = toScreen(projX(r.bbox[0]), projY(r.bbox[3])), [bx, by] = toScreen(projX(r.bbox[2]), projY(r.bbox[1]));
    ctx.save();
    ctx.strokeStyle = css("--signal"); ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
    ctx.fillStyle = css("--signal-soft") || "rgba(232,210,124,.12)";
    ctx.fillRect(ax, ay, bx - ax, by - ay); ctx.strokeRect(ax, ay, bx - ax, by - ay);
    ctx.restore();
  }

  // ----------------------------------------------------- open / close

  function setStyle(s, click) {
    style = s;
    $("#maps").classList.toggle("tactical", s === "tactical");
    $("#maps").querySelectorAll(".mp-style button").forEach((b) => b.classList.toggle("on", b.dataset.s === s));
    save();
    draw();
    if (click) Sound.theme();
  }
  function save() {
    try { localStorage.setItem("umbra-maps", JSON.stringify({ style, showGrid, view })); } catch {}
  }
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
      if (POPOUT) { try { window.webkit.messageHandlers.umbra.postMessage("close"); } catch { window.close(); } return; }
      if (fullOn) fullscreen();
      el.hidden = true; $("#maps-btn").classList.remove("on"); save(); Sound.click(); return;
    }
    // One overlay at a time.
    if (window.closeSettings) window.closeSettings();
    if (window.closeLoadout) window.closeLoadout(true);
    if (window.closeHistory) window.closeHistory();
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    el.hidden = false;
    $("#maps-btn").classList.add("on");
    setStyle(style);
    el.querySelector(".mp-t[data-t=grid]").classList.toggle("on", showGrid);
    resize();
    Sound.click();
    if (!packs.has("world")) await loadPack("world");
    try { waypoints = await (await fetch("/api/waypoints")).json(); } catch {}
    await refreshCatalog();
    if (catalog && catalog.job && catalog.job.active) pollJob();
    readout();
    setTimeout(() => el.querySelector(".mp-search input").focus(), 50);
  }

  // Full screen: the whole window becomes the map (the launcher does it).
  let fullOn = false;
  function fullscreen() {
    fullOn = !fullOn;
    $("#maps").classList.toggle("full", fullOn);
    $("#maps .mp-t[data-t=full]").classList.toggle("on", fullOn);
    try { window.webkit.messageHandlers.umbra.postMessage(fullOn ? "fullscreen" : "unfullscreen"); } catch {}
    Sound.click();
  }
  // Its own window, next to the chat.
  function popout() {
    try { window.webkit.messageHandlers.umbra.postMessage("maps-window"); Sound.click(); } catch { Sound.error(); }
  }

  build();
  restore();
  $("#maps-btn").addEventListener("click", () => toggle());
  document.addEventListener("keydown", (e) => {
    const el = $("#maps");
    if (el.hidden || !$("#modal").hidden) return;
    const typing = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === "Escape") {
      e.stopImmediatePropagation();
      if (!$("#maps .mp-card").hidden && !tool) { $("#maps .mp-card").hidden = true; target = null; overlayOnly(); }
      else if (tool) { measure = []; setTool(tool); }
      else if (fullOn && !POPOUT) fullscreen();
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
      const d = 80 / scale();
      if (k === "arrowleft") view.x -= d; if (k === "arrowright") view.x += d;
      if (k === "arrowup") view.y -= d; if (k === "arrowdown") view.y += d;
      clampView(); quick(); readout();
    } else return;
    e.preventDefault();
  }, true);
  new MutationObserver(() => { if (document.body.classList.contains("locked") && !$("#maps").hidden) toggle(false); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  // The theme can change while the map is open (tactical follows it).
  new MutationObserver(() => { if (!$("#maps").hidden && style === "tactical") { for (const k in patterns) delete patterns[k]; draw(); } })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });

  window.toggleMaps = toggle;
  window.closeMaps = () => { if (!$("#maps").hidden && !POPOUT) toggle(false); };
  if (POPOUT) { document.body.classList.add("maps-window"); toggle(true); }
  // For tests and the welcome tour.
  window.UmbraMaps = { toMGRS, fromMGRS, parseCoords, search: (q) => search(q), redraw: () => draw(true), get view() { return view; } };
})();
