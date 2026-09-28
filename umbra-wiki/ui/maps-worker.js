// Umbra maps, drawing worker. Runs beside the page so the map stays smooth:
// it fetches OpenStreetMap vector tiles and elevation tiles from the
// backend, decodes them, and draws each map tile once, in the topographic
// or tactical style (relief shading and contour lines included). The page
// gets back a finished image plus the tile's labels, and only has to move
// and scale images while you pan and zoom.
"use strict";

// ------------------------------------------------------ vector tiles

// A minimal protobuf reader for Mapbox Vector Tiles.
function reader(buf) {
  let pos = 0;
  const varint = () => {
    let r = 0, s = 0, b;
    do { b = buf[pos++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80);
    return r;
  };
  return {
    get pos() { return pos; }, set pos(v) { pos = v; }, get end() { return pos >= buf.length; },
    varint,
    skip(wt) { if (wt === 0) varint(); else if (wt === 2) pos += varint(); else if (wt === 5) pos += 4; else if (wt === 1) pos += 8; },
    bytes() { const n = varint(); const b = buf.subarray(pos, pos + n); pos += n; return b; },
  };
}
const utf8 = new TextDecoder();

function decodeTile(buf) {
  const layers = {};
  const r = reader(buf);
  while (!r.end) {
    const key = r.varint(), num = key >> 3, wt = key & 7;
    if (num === 3 && wt === 2) {
      const l = decodeLayer(r.bytes());
      layers[l.name] = l;
    } else r.skip(wt);
  }
  return layers;
}

function value(b) {
  const r = reader(b);
  while (!r.end) {
    const key = r.varint(), num = key >> 3, wt = key & 7;
    if (num === 1) return utf8.decode(r.bytes());
    if (num === 2) { const v = new DataView(b.buffer, b.byteOffset + r.pos, 4).getFloat32(0, true); r.pos += 4; return v; }
    if (num === 3) { const v = new DataView(b.buffer, b.byteOffset + r.pos, 8).getFloat64(0, true); r.pos += 8; return v; }
    if (num === 4 || num === 5) return r.varint();
    if (num === 6) { const v = r.varint(); return v % 2 ? -(v + 1) / 2 : v / 2; }
    if (num === 7) return !!r.varint();
    r.skip(wt);
  }
  return null;
}

function decodeLayer(b) {
  const r = reader(b);
  const l = { name: "", extent: 4096, keys: [], values: [], raw: [], features: [] };
  while (!r.end) {
    const key = r.varint(), num = key >> 3, wt = key & 7;
    if (num === 1) l.name = utf8.decode(r.bytes());
    else if (num === 2) l.raw.push(r.bytes());
    else if (num === 3) l.keys.push(utf8.decode(r.bytes()));
    else if (num === 4) l.values.push(value(r.bytes()));
    else if (num === 5) l.extent = r.varint();
    else r.skip(wt);
  }
  for (const fb of l.raw) l.features.push(decodeFeature(fb, l));
  delete l.raw;
  return l;
}

function decodeFeature(b, l) {
  const r = reader(b);
  const f = { type: 0, props: {}, rings: [], box: [Infinity, Infinity, -Infinity, -Infinity] };
  let geom = null;
  while (!r.end) {
    const key = r.varint(), num = key >> 3, wt = key & 7;
    if (num === 2) {
      const end = r.varint() + r.pos;
      while (r.pos < end) { const k = r.varint(), v = r.varint(); f.props[l.keys[k]] = l.values[v]; }
    } else if (num === 3) f.type = r.varint();
    else if (num === 4) geom = r.bytes();
    else r.skip(wt);
  }
  if (geom) {
    const g = reader(geom);
    let x = 0, y = 0, ring = null;
    const pts = [];
    while (!g.end) {
      const cmdlen = g.varint(), cmd = cmdlen & 7, count = cmdlen >> 3;
      if (cmd === 1 || cmd === 2) {
        for (let i = 0; i < count; i++) {
          const dx = g.varint(), dy = g.varint();
          x += dx % 2 ? -(dx + 1) / 2 : dx / 2;
          y += dy % 2 ? -(dy + 1) / 2 : dy / 2;
          if (cmd === 1) { if (ring && ring.length) f.rings.push(ring); ring = []; }
          ring.push(x, y);
          if (x < f.box[0]) f.box[0] = x; if (y < f.box[1]) f.box[1] = y;
          if (x > f.box[2]) f.box[2] = x; if (y > f.box[3]) f.box[3] = y;
          if (f.type === 1) pts.push(x, y);
        }
      } else if (cmd === 7 && ring) { /* close path: rings are drawn closed */ }
    }
    if (ring && ring.length) f.rings.push(ring);
  }
  return f;
}

// ------------------------------------------------------------ caches

const tiles = new Map();     // data tiles: "z/x/y" -> Promise<layers|null>
const heights = new Map();   // elevation: "z/x/y" -> Promise<{h: Float32Array, n}|null>
function lru(map, max) { while (map.size > max) map.delete(map.keys().next().value); }

async function getTile(kind, z, x, y) {
  const key = `${kind}/${z}/${x}/${y}`;
  if (!tiles.has(key)) {
    tiles.set(key, (async () => {
      try {
        const r = await fetch(`/api/${kind}/${z}/${x}/${y}`);
        if (r.status !== 200) return null;
        let buf = new Uint8Array(await r.arrayBuffer());
        if (buf[0] === 0x1f && buf[1] === 0x8b) {   // still compressed
          buf = new Uint8Array(await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
        }
        return decodeTile(buf);
      } catch { return null; }
    })());
    lru(tiles, 80);
  }
  return tiles.get(key);
}

// The best data tile for a display tile: its own level, or the nearest
// lower one that exists (it's drawn magnified: vectors stay sharp).
async function bestTile(z, x, y, maxz) {
  for (let dz = Math.min(z, maxz); dz >= 0 && dz >= Math.min(z, maxz) - 6; dz--) {
    const k = 2 ** (z - dz);
    const t = await getTile("tile", dz, Math.floor(x / k), Math.floor(y / k));
    if (t) return { t, dz, k, ox: x - Math.floor(x / k) * k, oy: y - Math.floor(y / k) * k };
  }
  return null;
}

async function getHeights(z, x, y) {
  const key = `${z}/${x}/${y}`;
  if (!heights.has(key)) {
    heights.set(key, (async () => {
      try {
        const r = await fetch(`/api/terrain/${z}/${x}/${y}`);
        if (r.status !== 200) return null;
        const bmp = await createImageBitmap(await r.blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height), g = c.getContext("2d");
        g.drawImage(bmp, 0, 0);
        const px = g.getImageData(0, 0, bmp.width, bmp.height).data;
        const n = bmp.width, h = new Float32Array(n * n);
        for (let i = 0; i < n * n; i++) h[i] = px[i * 4] * 256 + px[i * 4 + 1] + px[i * 4 + 2] / 256 - 32768;
        return { h, n };
      } catch { return null; }
    })());
    lru(heights, 40);
  }
  return heights.get(key);
}

// ------------------------------------------------------------- style

// Line widths grow with the zoom level: [z, width] pairs, interpolated.
function wz(z, stops) {
  if (z <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    if (z <= stops[i][0]) {
      const [z0, w0] = stops[i - 1], [z1, w1] = stops[i];
      return w0 + (w1 - w0) * (z - z0) / (z1 - z0);
    }
  }
  return stops[stops.length - 1][1];
}

const LANDUSE = {
  forest: "forest", wood: "forest", nature_reserve: "park", park: "park", national_park: "park", protected_area: "park",
  garden: "park", golf_course: "park", recreation_ground: "park", playground: "park", pitch: "park", dog_park: "park",
  grass: "grass", grassland: "grass", meadow: "grass", village_green: "grass", scrub: "scrub", heath: "scrub",
  farmland: "farm", farmyard: "farm", orchard: "farm", vineyard: "farm", allotments: "farm", plant_nursery: "farm",
  residential: "built", urban_area: "built", commercial: "built2", retail: "built2", industrial: "built2",
  railway: "built2", brownfield: "built2", construction: "built2", landfill: "built2", quarry: "built2",
  military: "military", naval_base: "military", airfield: "built2", aerodrome: "built2",
  cemetery: "cemetery", grave_yard: "cemetery", hospital: "built2", school: "built2", university: "built2", college: "built2",
  beach: "sand", sand: "sand", barren: "sand", bare_rock: "rock", scree: "rock", glacier: "glacier",
  wetland: "wetland", marsh: "wetland", swamp: "wetland", bog: "wetland", zoo: "park", theme_park: "park",
  pedestrian: "built", platform: "built2", parking: "built2",
};

function pattern(g, kind, color) {
  const c = new OffscreenCanvas(12, 12), p = c.getContext("2d");
  p.strokeStyle = p.fillStyle = color;
  p.lineWidth = 1;
  if (kind === "marsh") { p.beginPath(); p.moveTo(2, 8); p.lineTo(8, 8); p.moveTo(5, 8); p.lineTo(5, 5); p.moveTo(3, 8); p.lineTo(2, 6); p.moveTo(7, 8); p.lineTo(8, 6); p.stroke(); }
  if (kind === "hatch") { p.beginPath(); p.moveTo(0, 12); p.lineTo(12, 0); p.moveTo(-6, 6); p.lineTo(6, -6); p.moveTo(6, 18); p.lineTo(18, 6); p.stroke(); }
  if (kind === "dots") { p.fillRect(2, 3, 1.3, 1.3); p.fillRect(8, 9, 1.3, 1.3); }
  if (kind === "trees") { p.beginPath(); p.arc(4, 4, 1.6, 0, 7); p.arc(10, 10, 1.6, 0, 7); p.fill(); }
  return g.createPattern(c, "repeat");
}

// ------------------------------------------------------------ render

async function render(job) {
  const { z, x, y, size, ratio, pal, maxz, points, terrain } = job;
  const px = Math.round(size * ratio);
  const canvas = new OffscreenCanvas(px, px), g = canvas.getContext("2d");
  g.scale(ratio, ratio);
  const labels = [];
  g.fillStyle = pal.sea;
  g.fillRect(0, 0, size, size);

  const best = await bestTile(z, x, y, maxz);
  if (!best) {
    g.fillStyle = pal.land; g.globalAlpha = 0.25; g.fillRect(0, 0, size, size);
    return { bitmap: canvas.transferToImageBitmap(), labels, empty: true };
  }
  const { t, k, ox, oy } = best;
  // Tile coordinates (0..extent) of the data tile to display pixels.
  const L = (name) => t[name] || { features: [], extent: 4096 };
  const view = (l) => {
    const s = (size * k) / l.extent;
    return { s, tx: -ox * size, ty: -oy * size, lo: [(ox / k) * l.extent - 64, (oy / k) * l.extent - 64], hi: [((ox + 1) / k) * l.extent + 64, ((oy + 1) / k) * l.extent + 64] };
  };
  const inside = (f, v) => !(f.box[2] < v.lo[0] || f.box[0] > v.hi[0] || f.box[3] < v.lo[1] || f.box[1] > v.hi[1]);
  const path = (f, v, closed) => {
    for (const r of f.rings) {
      g.moveTo(r[0] * v.s + v.tx, r[1] * v.s + v.ty);
      for (let i = 2; i < r.length; i += 2) g.lineTo(r[i] * v.s + v.tx, r[i + 1] * v.s + v.ty);
      if (closed) g.closePath();
    }
  };
  const fill = (layer, test, color) => {
    const l = L(layer), v = view(l);
    g.beginPath();
    let any = false;
    for (const f of l.features) if (f.type === 3 && inside(f, v) && test(f.props)) { path(f, v, true); any = true; }
    if (any) { g.fillStyle = color; g.fill("evenodd"); }
  };
  const stroke = (layer, test, color, width, dash, cap = "round") => {
    if (width <= 0.05) return;
    const l = L(layer), v = view(l);
    g.beginPath();
    let any = false;
    for (const f of l.features) if (f.type === 2 && inside(f, v) && test(f.props)) { path(f, v, false); any = true; }
    if (!any) return;
    g.setLineDash(dash || []); g.strokeStyle = color; g.lineWidth = width; g.lineCap = cap; g.lineJoin = "round";
    g.stroke(); g.setLineDash([]);
  };

  // Land, and what covers it.
  fill("earth", () => true, pal.land);
  const cover = (p) => LANDUSE[p.kind] || "";
  for (const layer of ["landcover", "landuse"]) {
    for (const [cls, color] of [["farm", pal.farm], ["grass", pal.grass], ["scrub", pal.scrub], ["park", pal.park], ["forest", pal.forest],
                                ["built", pal.built], ["built2", pal.built2], ["cemetery", pal.cemetery], ["sand", pal.sand],
                                ["rock", pal.rock], ["glacier", pal.glacier], ["military", pal.military], ["wetland", pal.wet]]) {
      fill(layer, (p) => cover(p) === cls, color);
    }
  }
  if (z >= 11) {
    fill("landuse", (p) => cover(p) === "forest", pattern(g, "trees", pal.forestMark));
    fill("landuse", (p) => cover(p) === "wetland", pattern(g, "marsh", pal.water2));
    fill("landuse", (p) => cover(p) === "military", pattern(g, "hatch", pal.militaryMark));
  }

  // Relief: shading and contour lines from the elevation tiles.
  if (terrain && z <= terrain + 5) await relief(g, job, labels);

  // Water: areas, then rivers, streams, canals and ditches.
  fill("water", () => true, pal.water);
  const wl = (p) => String(p.kind_detail || p.kind || "");
  stroke("water", (p) => /river/.test(wl(p)), pal.water2, wz(z, [[8, 0.6], [12, 1.6], [16, 5]]));
  stroke("water", (p) => /canal/.test(wl(p)), pal.water2, wz(z, [[10, 0.5], [14, 1.8], [17, 4]]));
  stroke("water", (p) => /stream|drain|ditch/.test(wl(p)), pal.water2, wz(z, [[11, 0.3], [14, 0.9], [17, 2]]));
  stroke("physical_line", () => true, pal.water2, wz(z, [[10, 0.4], [15, 1.2]]));

  // Borders: dash-dot for countries, dashed for regions.
  stroke("boundaries", (p) => p.kind === "region", pal.border2, wz(z, [[4, 0.4], [10, 1], [14, 1.5]]), [6, 3]);
  stroke("boundaries", (p) => p.kind === "country", pal.border, wz(z, [[2, 0.6], [8, 1.4], [14, 2.4]]), [9, 3, 1.5, 3]);

  // Buildings: dark blocks, as on military maps.
  if (z >= 13) fill("buildings", () => true, pal.building);

  // Roads, lowest first, each with a casing; railways as a ladder.
  const rk = (p) => String(p.kind || "");
  const paths = (p) => rk(p) === "path";
  const minor = (p) => rk(p) === "minor_road" && !p.is_tunnel;
  const major = (p) => rk(p) === "major_road" && !p.is_tunnel;
  const hwy = (p) => rk(p) === "highway" && !p.is_tunnel;
  if (z >= 12) stroke("roads", paths, pal.path, wz(z, [[12, 0.5], [16, 1.4]]), [3, 2.5], "butt");
  if (z >= 11) {
    stroke("roads", minor, pal.casing, wz(z, [[11, 0.8], [13, 2.2], [15, 5], [17, 10]]));
    stroke("roads", minor, pal.minor, wz(z, [[11, 0.4], [13, 1.4], [15, 3.6], [17, 8]]));
  }
  stroke("roads", major, pal.casing, wz(z, [[6, 0.6], [9, 1.2], [12, 3.2], [15, 7], [17, 13]]));
  stroke("roads", major, pal.major, wz(z, [[6, 0.4], [9, 0.8], [12, 2.2], [15, 5.4], [17, 11]]));
  stroke("roads", hwy, pal.casing, wz(z, [[4, 0.6], [8, 1.6], [12, 4], [15, 8.5], [17, 16]]));
  stroke("roads", hwy, pal.highway, wz(z, [[4, 0.4], [8, 1.1], [12, 3], [15, 6.6], [17, 13]]));
  stroke("roads", (p) => rk(p) === "ferry", pal.water2, wz(z, [[6, 0.5], [14, 1.4]]), [4, 4]);
  if (z >= 8) {
    const rail = (p) => rk(p) === "rail" && !/subway|tram|light_rail/.test(String(p.kind_detail || "")) && !p.is_tunnel;
    stroke("roads", rail, pal.rail, wz(z, [[8, 0.6], [12, 1.6], [16, 3]]));
    if (z >= 12) stroke("roads", rail, pal.railLadder, wz(z, [[12, 0.8], [16, 1.6]]), [4, 4], "butt");
  }

  // Labels, placed by the page over the tiles.
  const toPx = (l, fx, fy) => { const v = view(l); return [fx * v.s + v.tx, fy * v.s + v.ty]; };
  const pl = L("places");
  for (const f of pl.features) {
    const name = f.props["name:en"] && /[^\x00-\x7f]/.test(f.props.name || "") && !/^[\p{Script=Latin}\s\d'’.-]+$/u.test(f.props.name || "") ? f.props["name:en"] : f.props.name;
    if (!name || f.type !== 1) continue;
    const [px2, py2] = toPx(pl, f.rings[0][0], f.rings[0][1]);
    if (px2 < -2 || py2 < -2 || px2 > size + 2 || py2 > size + 2) continue;
    const kind = String(f.props.kind || ""), detail = String(f.props.kind_detail || "");
    const pop = +f.props.population_rank || 0;
    const cls = kind === "country" ? "country" : kind === "region" ? "region" : detail === "city" || pop >= 10 ? "city"
      : detail === "town" || pop >= 7 ? "town" : detail === "village" ? "village" : kind === "locality" ? "hamlet" : "hood";
    labels.push({ t: "place", cls, text: name, x: px2, y: py2, rank: pop, cap: f.props.capital ? 1 : 0 });
  }
  if (z >= 13) {
    const rl = L("roads");
    for (const f of rl.features) {
      const name = f.props.name;
      if (!name || f.type !== 2 || !/road|highway/.test(rk(f.props))) continue;
      // The midpoint of the longest segment, with its angle.
      let best = null, blen = 0;
      for (const r of f.rings) for (let i = 2; i < r.length; i += 2) {
        const dx = r[i] - r[i - 2], dy = r[i + 1] - r[i - 1], len = Math.hypot(dx, dy);
        if (len > blen) { blen = len; best = [(r[i] + r[i - 2]) / 2, (r[i + 1] + r[i - 1]) / 2, Math.atan2(dy, dx)]; }
      }
      if (!best) continue;
      const [px2, py2] = toPx(rl, best[0], best[1]);
      const plen = blen * view(rl).s;
      if (px2 < 0 || py2 < 0 || px2 > size || py2 > size) continue;
      let a = best[2]; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
      labels.push({ t: "road", text: name, x: px2, y: py2, a, len: plen, rank: rk(f.props) === "highway" ? 3 : rk(f.props) === "major_road" ? 2 : 1 });
    }
  }
  const wlab = L("water");
  for (const f of wlab.features) {
    if (!f.props.name || !(f.type === 3 ? z >= 9 : z >= 12)) continue;
    const bx = f.box, cx = (bx[0] + bx[2]) / 2, cy = (bx[1] + bx[3]) / 2;
    const [px2, py2] = toPx(wlab, f.type === 3 ? cx : f.rings[0][Math.floor(f.rings[0].length / 4) * 2], f.type === 3 ? cy : f.rings[0][Math.floor(f.rings[0].length / 4) * 2 + 1]);
    if (px2 < 0 || py2 < 0 || px2 > size || py2 > size) continue;
    const area = (bx[2] - bx[0]) * (bx[3] - bx[1]) * view(wlab).s ** 2;
    if (f.type === 3 && area < 4000) continue;
    labels.push({ t: "water", text: f.props.name, x: px2, y: py2, rank: f.type === 3 ? 2 : 1 });
  }
  const po = L("pois");
  const poiLabel = (f, l, essential) => {
    const [px2, py2] = toPx(l, f.rings[0][0], f.rings[0][1]);
    if (px2 < 0 || py2 < 0 || px2 > size || py2 > size) return;
    labels.push({ t: "poi", kind: String(f.props.kind || ""), text: f.props.name || "", x: px2, y: py2,
                  ele: f.props.elevation || 0, rank: essential ? 3 : 1, mz: +f.props.min_zoom || 14 });
  };
  for (const f of po.features) if (f.type === 1) poiLabel(f, po, false);
  // Essential points from the finest level (water taps, shelters...).
  if (points && z >= 14) {
    const kk = 2 ** (15 - z);
    for (let i = 0; i < kk; i++) for (let j = 0; j < kk; j++) {
      const pt = await getTile("points", 15, x * kk + i, y * kk + j);
      const pp = pt && pt.pois;
      if (!pp) continue;
      const s = size / kk / pp.extent;
      for (const f of pp.features) {
        if (f.type !== 1) continue;
        const px2 = f.rings[0][0] * s + i * (size / kk), py2 = f.rings[0][1] * s + j * (size / kk);
        labels.push({ t: "poi", kind: String(f.props.kind || ""), text: f.props.name || "", x: px2, y: py2, rank: 3, mz: 14, ess: 1 });
      }
    }
  }
  return { bitmap: canvas.transferToImageBitmap(), labels };
}

// Relief shading and contour lines, from the nearest elevation tile.
async function relief(g, job, labels) {
  const { z, x, y, size, pal, terrain } = job;
  let tz = Math.min(z, terrain), k = 2 ** (z - tz), data = null;
  for (; tz >= Math.max(0, terrain - 3); tz--, k *= 2) {
    data = await getHeights(tz, Math.floor(x / k), Math.floor(y / k));
    if (data) break;
  }
  if (!data) return;
  const { h, n } = data;
  const ox = (x - Math.floor(x / k) * k) / k, oy = (y - Math.floor(y / k) * k) / k;
  // Elevation at a point of the display tile (0..1), bilinear.
  const at = (u, v) => {
    const fx = Math.min(n - 1.001, Math.max(0, (ox + u / k) * n - 0.5)), fy = Math.min(n - 1.001, Math.max(0, (oy + v / k) * n - 0.5));
    const ix = fx | 0, iy = fy | 0, dx = fx - ix, dy = fy - iy, i = iy * n + ix;
    return (h[i] * (1 - dx) + h[i + 1] * dx) * (1 - dy) + (h[i + n] * (1 - dx) + h[i + n + 1] * dx) * dy;
  };
  const G = 96;                      // samples across the tile
  const grid = new Float32Array((G + 1) * (G + 1));
  let lo = Infinity, hi = -Infinity;
  for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) {
    const v = at(i / G, j / G);
    grid[j * (G + 1) + i] = v;
    if (v < lo) lo = v; if (v > hi) hi = v;
  }
  // Shading: light from the north-west; shadows only, gently.
  const metresPerSample = (40075016 * Math.cos(Math.atan(Math.sinh(Math.PI * (1 - 2 * (y + 0.5) / 2 ** z))))) / 2 ** z / G;
  const shade = new OffscreenCanvas(G, G), sg = shade.getContext("2d"), img = sg.createImageData(G, G);
  const exag = Math.max(1, 3 - z * 0.12);
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    const a = grid[j * (G + 1) + i], b = grid[j * (G + 1) + i + 1], c = grid[(j + 1) * (G + 1) + i];
    const dzdx = ((b - a) * exag) / metresPerSample, dzdy = ((c - a) * exag) / metresPerSample;
    const slope = Math.atan(Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
    const lit = Math.cos(0.785) * Math.cos(slope) + Math.sin(0.785) * Math.sin(slope) * Math.cos(2.356 - aspect);
    const o = (j * G + i) * 4;
    img.data[o] = pal.shadeRGB[0]; img.data[o + 1] = pal.shadeRGB[1]; img.data[o + 2] = pal.shadeRGB[2];
    img.data[o + 3] = Math.max(0, Math.min(255, (0.72 - lit) * pal.shadeStrength));
  }
  sg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(shade, 0, 0, size, size);
  // Contours: an interval that suits the zoom and the terrain, every fifth
  // line thicker (index contours), with a few height labels.
  if (hi - lo < 1) return;
  const iv = z >= 15 ? 10 : z >= 13 ? 20 : z >= 12 ? 25 : z >= 11 ? 50 : z >= 10 ? 100 : z >= 8 ? 200 : 500;
  const cs = size / G;
  for (let level = Math.ceil(lo / iv) * iv; level <= hi; level += iv) {
    if (level <= 0 && lo < -5) continue;   // no contours at sea level over water
    const index = Math.round(level / iv) % 5 === 0;
    g.beginPath();
    let longest = null, llen = 0;
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const a = grid[j * (G + 1) + i], b = grid[j * (G + 1) + i + 1], c = grid[(j + 1) * (G + 1) + i + 1], d = grid[(j + 1) * (G + 1) + i];
      const m = (a > level) | ((b > level) << 1) | ((c > level) << 2) | ((d > level) << 3);
      if (m === 0 || m === 15) continue;
      const e = [
        [i + (level - a) / (b - a), j], [i + 1, j + (level - b) / (c - b)],
        [i + (level - d) / (c - d), j + 1], [i, j + (level - a) / (d - a)],
      ];
      const segs = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]],
                     8: [[2, 3]], 9: [[0, 2]], 10: [[0, 3], [1, 2]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] }[m];
      for (const [p, q] of segs) {
        g.moveTo(e[p][0] * cs, e[p][1] * cs); g.lineTo(e[q][0] * cs, e[q][1] * cs);
        if (index && i > 8 && j > 8 && i < G - 8 && j < G - 8) {
          const len = Math.hypot(e[p][0] - e[q][0], e[p][1] - e[q][1]);
          if (len > llen) { llen = len; longest = [(e[p][0] + e[q][0]) / 2 * cs, (e[p][1] + e[q][1]) / 2 * cs, Math.atan2(e[q][1] - e[p][1], e[q][0] - e[p][0])]; }
        }
      }
    }
    g.strokeStyle = index ? pal.contourIndex : pal.contour;
    g.lineWidth = index ? 1.1 : 0.55;
    g.stroke();
    if (index && longest && z >= 11) {
      let a = longest[2]; if (a > Math.PI / 2) a -= Math.PI; if (a < -Math.PI / 2) a += Math.PI;
      labels.push({ t: "contour", text: String(Math.round(level)), x: longest[0], y: longest[1], a, rank: 0 });
    }
  }
}

// One tile at a time per worker; the page asks the most central ones first.
onmessage = async (e) => {
  const job = e.data;
  if (job.type === "flush") { tiles.clear(); heights.clear(); return; }
  try {
    const out = await render(job);
    postMessage({ key: job.key, ...out }, [out.bitmap]);
  } catch (err) {
    postMessage({ key: job.key, error: String(err) });
  }
};
