// QR codes for Umbra profile cards: an encoder (byte mode, any version, the
// standard error correction) after Project Nayuki's reference design, and a
// reader for clean pictures of a code (a screenshot or a saved card image,
// square to the picture). Offline, no library.
"use strict";

window.UmbraQR = (() => {
  // ------------------------------------------------------------ tables
  // Error correction codewords per block, and number of blocks, by level
  // (L, M, Q, H) and version (index 0 unused).
  const ECC = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];
  const BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];
  const FORMAT_BITS = [1, 0, 3, 2];   // L, M, Q, H as written in the format field

  const rawModules = (v) => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  };
  const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC[e][v] * BLOCKS[e][v];
  const alignPositions = (v) => {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2, size = v * 4 + 17;
    const step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const out = [6];
    for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
    return out;
  };

  // ------------------------------------------------------- Reed-Solomon
  const gmul = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 255; };
  function rsDivisor(degree) {
    const r = new Array(degree).fill(0); r[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < r.length; j++) { r[j] = gmul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = gmul(root, 2);
    }
    return r;
  }
  function rsRemainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) {
      const f = b ^ r.shift(); r.push(0);
      div.forEach((c, i) => { r[i] ^= gmul(c, f); });
    }
    return r;
  }

  // ------------------------------------------------------------ layout
  // The grid of a version with its fixed patterns drawn; `fn` marks them.
  function frame(v) {
    const size = v * 4 + 17;
    const m = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = alignPositions(v), n = al.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    drawFormat(m, fn, 0, 0, set);
    if (v >= 7) {
      let rem = v;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const bit = ((bits >>> i) & 1) !== 0, a = size - 11 + (i % 3), b = Math.floor(i / 3);
        set(a, b, bit); set(b, a, bit);
      }
    }
    return { size, m, fn, set };
  }
  function formatBits(e, mask) {
    const data = (FORMAT_BITS[e] << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }
  function drawFormat(m, fn, e, mask, set) {
    const size = m.length, bits = formatBits(e, mask), bit = (i) => ((bits >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  }
  // The data modules in reading order (the zigzag from the bottom right).
  function* dataCells(size, fn) {
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x]) yield [x, y];
      }
    }
  }
  const MASKS = [
    (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
    (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
  ];
  function penalty(m) {
    const n = m.length;
    let p = 0, dark = 0;
    for (let y = 0; y < n; y++) for (let pass = 0; pass < 2; pass++) {
      let run = 1;
      for (let x = 1; x < n; x++) {
        const a = pass ? m[x][y] : m[y][x], b = pass ? m[x - 1][y] : m[y][x - 1];
        if (a === b) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
      }
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
    for (const row of m) for (const c of row) if (c) dark++;
    return p + Math.floor(Math.abs(dark * 20 - n * n * 10) / (n * n)) * 10;
  }

  // ------------------------------------------------------------ encode
  // Text to a matrix of booleans (true = dark), level M by default.
  function encode(text, level = 1) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let v = 1;
    for (; v <= 40; v++) {
      const countBits = v <= 9 ? 8 : 16;
      if (4 + countBits + bytes.length * 8 <= dataCodewords(v, level) * 8) break;
    }
    if (v > 40) throw new Error("Too long for a QR code");
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v <= 9 ? 8 : 16);
    bytes.forEach((b) => put(b, 8));
    const cap = dataCodewords(v, level) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    // Blocks with their error correction, interleaved.
    const nb = BLOCKS[level][v], eccLen = ECC[level][v], raw = Math.floor(rawModules(v) / 8);
    const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb), div = rsDivisor(eccLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1));
      k += dat.length;
      const ecc = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const out = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) out.push(b[i]); });
    // Place, then keep the mask with the lowest penalty.
    let best = null;
    for (let mask = 0; mask < 8; mask++) {
      const f = frame(v);
      let i = 0;
      for (const [x, y] of dataCells(f.size, f.fn)) {
        f.m[y][x] = i < out.length * 8 ? ((out[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
        i++;
      }
      for (let y = 0; y < f.size; y++) for (let x = 0; x < f.size; x++) if (!f.fn[y][x] && MASKS[mask](x, y)) f.m[y][x] = !f.m[y][x];
      drawFormat(f.m, f.fn, level, mask, f.set);
      const score = penalty(f.m);
      if (!best || score < best.score) best = { score, m: f.m };
    }
    return best.m;
  }

  // Draw a code on a canvas: dark modules on a light ground with the quiet zone.
  function draw(canvas, text, o = {}) {
    const m = encode(text, o.level ?? 1), n = m.length, quiet = 4;
    const scale = o.scale || Math.max(2, Math.floor((o.px || 360) / (n + quiet * 2)));
    canvas.width = canvas.height = (n + quiet * 2) * scale;
    const g = canvas.getContext("2d");
    g.fillStyle = o.light || "#f2ecd8"; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = o.dark || "#0b0b0b";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) g.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    return canvas;
  }

  // ------------------------------------------------------------ decode
  // Read a code from image data (a clean picture: a screenshot or a saved
  // card, not a camera photo at an angle).
  function decode(img) {
    const { width: W, height: H, data } = img;
    const lum = new Uint8Array(W * H);
    let lo = 255, hi = 0;
    for (let i = 0; i < W * H; i++) {
      const l = (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) / 1000;
      lum[i] = l; if (l < lo) lo = l; if (l > hi) hi = l;
    }
    const cut = (lo + hi) / 2, dark = (x, y) => lum[Math.round(y) * W + Math.round(x)] < cut;
    // Finder patterns: 1:1:3:1:1 runs along rows, confirmed down the column.
    const found = [];
    for (let y = 0; y < H; y += 1) {
      const runs = []; let x = 0;
      while (x < W) { const d = lum[y * W + x] < cut; let n = 0; while (x < W && (lum[y * W + x] < cut) === d) { n++; x++; } runs.push([d, n, x]); }
      for (let i = 0; i + 4 < runs.length; i++) {
        if (!runs[i][0]) continue;
        const r = runs.slice(i, i + 5).map((q) => q[1]), unit = r.reduce((a, b) => a + b) / 7;
        if (unit < 1) continue;
        const ok = [1, 1, 3, 1, 1].every((k, j) => Math.abs(r[j] - k * unit) < unit * 0.6);
        if (!ok) continue;
        const cx = runs[i + 4][2] - r[4] - r[3] - r[2] / 2;
        let up = 0, down = 0;
        while (y - up >= 0 && dark(cx, y - up)) up++;
        while (y + down < H && dark(cx, y + down)) down++;
        if (Math.abs(up + down - 3 * unit) > unit * 1.5) continue;
        const cy = y - up + (up + down) / 2;
        const near = found.find((f) => Math.hypot(f.x - cx, f.y - cy) < unit * 3);
        if (near) { near.n++; near.sx += cx; near.sy += cy; near.u += unit; near.x = near.sx / near.n; near.y = near.sy / near.n; }
        else found.push({ x: cx, y: cy, sx: cx, sy: cy, n: 1, u: unit });
      }
    }
    const cand = found.filter((f) => f.n >= 2).sort((a, b) => b.n - a.n).slice(0, 6);
    if (cand.length < 3) throw new Error("No QR code found in this picture.");
    cand.forEach((f) => { f.u /= f.n; });
    // The three that form a right angle: top-left is the corner.
    let best = null;
    for (let a = 0; a < cand.length; a++) for (let b = 0; b < cand.length; b++) for (let c = 0; c < cand.length; c++) {
      if (a === b || b === c || a === c) continue;
      const tl = cand[a], tr = cand[b], bl = cand[c];
      const v1 = [tr.x - tl.x, tr.y - tl.y], v2 = [bl.x - tl.x, bl.y - tl.y];
      const l1 = Math.hypot(...v1), l2 = Math.hypot(...v2);
      if (l1 < 10 || Math.abs(l1 - l2) > l1 * 0.12) continue;
      const cross = v1[0] * v2[1] - v1[1] * v2[0], cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
      if (cross <= 0 || Math.abs(cos) > 0.15) continue;
      const score = Math.abs(cos) + Math.abs(l1 - l2) / l1;
      if (!best || score < best.score) best = { score, tl, tr, bl };
    }
    if (!best) throw new Error("No QR code found in this picture.");
    const { tl, tr, bl } = best, unit = (tl.u + tr.u + bl.u) / 3;
    const span = (Math.hypot(tr.x - tl.x, tr.y - tl.y) + Math.hypot(bl.x - tl.x, bl.y - tl.y)) / 2;
    let v = Math.round((span / unit + 7 - 17) / 4);
    const errors = [];
    for (const vv of [v, v - 1, v + 1]) {
      if (vv < 1 || vv > 40) continue;
      try { return readGrid(vv, tl, tr, bl, dark); } catch (e) { errors.push(e.message); }
    }
    throw new Error(errors[0] || "The QR code couldn't be read.");
  }
  function readGrid(v, tl, tr, bl, dark) {
    const size = v * 4 + 17, d = size - 7;
    const ux = [(tr.x - tl.x) / d, (tr.y - tl.y) / d], uy = [(bl.x - tl.x) / d, (bl.y - tl.y) / d];
    const at = (x, y) => dark(tl.x + (x - 3) * ux[0] + (y - 3) * uy[0], tl.y + (x - 3) * ux[1] + (y - 3) * uy[1]);
    const g = Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) => at(x, y)));
    // The format field (either copy).
    let fmt = null;
    const read1 = () => { let b = 0; const bits = [];
      for (let i = 0; i <= 5; i++) bits[i] = g[i][8]; bits[6] = g[7][8]; bits[7] = g[8][8]; bits[8] = g[8][7];
      for (let i = 9; i < 15; i++) bits[i] = g[8][14 - i];
      bits.forEach((x, i) => { if (x) b |= 1 << i; }); return b; };
    const read2 = () => { let b = 0; const bits = [];
      for (let i = 0; i < 8; i++) bits[i] = g[8][size - 1 - i];
      for (let i = 8; i < 15; i++) bits[i] = g[size - 15 + i][8];
      bits.forEach((x, i) => { if (x) b |= 1 << i; }); return b; };
    for (const raw of [read1(), read2()]) {
      for (let e = 0; e < 4 && !fmt; e++) for (let mask = 0; mask < 8 && !fmt; mask++) {
        let diff = formatBits(e, mask) ^ raw, n = 0;
        while (diff) { n += diff & 1; diff >>>= 1; }
        if (n <= 3) fmt = { e, mask };
      }
      if (fmt) break;
    }
    if (!fmt) throw new Error("The QR code's format couldn't be read.");
    const f = frame(v), bytes = [];
    let cur = 0, k = 0;
    for (const [x, y] of dataCells(size, f.fn)) {
      const bit = g[y][x] !== MASKS[fmt.mask](x, y);
      cur = (cur << 1) | (bit ? 1 : 0);
      if (++k % 8 === 0) { bytes.push(cur); cur = 0; }
    }
    // Undo the interleaving, check each block, keep the data.
    const e = fmt.e, nb = BLOCKS[e][v], eccLen = ECC[e][v], raw = Math.floor(rawModules(v) / 8);
    const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
    // Every block as the encoder laid it out (short blocks have a gap at the
    // end of their data), filled column by column.
    const blocks = Array.from({ length: nb }, () => new Array(shortLen + 1).fill(0));
    let p = 0;
    for (let i = 0; i <= shortLen; i++) for (let j = 0; j < nb; j++) {
      if (i === shortLen - eccLen && j < nShort) continue;
      blocks[j][i] = bytes[p++];
    }
    blocks.forEach((b, j) => { if (j < nShort) b.splice(shortLen - eccLen, 1); });
    const div = rsDivisor(eccLen), data = [];
    blocks.forEach((b) => {
      const dlen = b.length - eccLen, dat = b.slice(0, dlen);
      const ecc = rsRemainder(dat, div);
      if (ecc.some((c, i) => c !== b[dlen + i])) throw new Error("The QR code is blurred or damaged.");
      data.push(...dat);
    });
    // Byte mode segment.
    let bit = 0;
    const take = (n) => { let r = 0; for (let i = 0; i < n; i++, bit++) r = (r << 1) | ((data[bit >>> 3] >>> (7 - (bit & 7))) & 1); return r; };
    // Segments: numbers, letters and bytes (codes made by other tools mix them).
    const ALNUM = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:", out = [], total = data.length * 8;
    const cls = v <= 9 ? 0 : v <= 26 ? 1 : 2;
    while (bit + 4 <= total) {
      const mode = take(4);
      if (mode === 0) break;
      if (mode === 4) { const n = take([8, 16, 16][cls]); for (let i = 0; i < n; i++) out.push(take(8)); }
      else if (mode === 2) {
        let n = take([9, 11, 13][cls]);
        for (; n >= 2; n -= 2) { const x = take(11); out.push(ALNUM.charCodeAt(Math.floor(x / 45)), ALNUM.charCodeAt(x % 45)); }
        if (n) out.push(ALNUM.charCodeAt(take(6)));
      } else if (mode === 1) {
        let n = take([10, 12, 14][cls]);
        for (; n >= 3; n -= 3) String(take(10)).padStart(3, "0").split("").forEach((c) => out.push(c.charCodeAt(0)));
        if (n === 2) String(take(7)).padStart(2, "0").split("").forEach((c) => out.push(c.charCodeAt(0)));
        else if (n === 1) out.push(String(take(4)).charCodeAt(0));
      } else if (mode === 7) take(8);   // ECI: the text stays UTF-8
      else throw new Error("This QR code uses a kind of data Umbra doesn't read.");
    }
    return new TextDecoder().decode(new Uint8Array(out));
  }

  // Read the code in a picture (a data: URL, a File or an <img>).
  async function read(src) {
    const img = new Image();
    img.src = typeof src === "string" ? src : URL.createObjectURL(src);
    await img.decode();
    const c = document.createElement("canvas");
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(img, 0, 0, c.width, c.height);
    return decode(g.getImageData(0, 0, c.width, c.height));
  }

  return { encode, draw, decode, read };
})();
