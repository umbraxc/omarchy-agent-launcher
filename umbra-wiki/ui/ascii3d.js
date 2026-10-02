// Umbra's 3D ASCII renderer. Every character cell casts a ray into a scene
// built from signed distance shapes; the surface it meets gives the glyph,
// its colour and brightness: real depth, light, shadow and fog, in text.
// Still scenes keep a buffer of what each cell sees and only re-light it
// each frame (water ripples, fire, moving light), so they stay light on the
// processor; "live" scenes (small, orbiting) are traced every frame.
// Used by conversation scenery (chat-scenery.js) and Umbra Outpost.
"use strict";
window.Ascii3D = (() => {
  // ------------------------------------------------------------ noise
  const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const smooth = (k) => k * k * (3 - 2 * k);
  function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), u = smooth(x - xi), v = smooth(y - yi);
    const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = smooth(x - xi), v = smooth(y - yi), w = smooth(z - zi);
    const l = (a, b, k) => a + (b - a) * k;
    const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
    return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
      l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
  }
  const fbm2 = (x, y, oct = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); f *= 2.03; a *= .5; } return s; };

  // --------------------------------------------------- distance shapes
  // All take a point relative to the shape's centre (or base, for the
  // vertical ones) and return a signed distance.
  const sd = {
    sphere: (x, y, z, r) => Math.hypot(x, y, z) - r,
    box(x, y, z, bx, by, bz) {
      const qx = Math.abs(x) - bx, qy = Math.abs(y) - by, qz = Math.abs(z) - bz;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0);
    },
    rbox(x, y, z, bx, by, bz, r) { return sd.box(x, y, z, bx - r, by - r, bz - r) - r; },
    // Upright cylinder standing on y = 0, radius r, height h.
    cyl(x, y, z, r, h) {
      const dx = Math.hypot(x, z) - r, dy = Math.abs(y - h / 2) - h / 2;
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    },
    // Upright cone with its base (radius r) on y = 0 and its tip at y = h.
    cone(x, y, z, r, h) {
      const q = Math.hypot(x, z), k = r / h;
      return Math.max((q - r + y * k) / Math.sqrt(1 + k * k), -y, y - h);
    },
    // A capsule between two points.
    capsule(x, y, z, ax, ay, az, bx, by, bz, r) {
      const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
      const h = Math.max(0, Math.min(1, (px * dx + py * dy + pz * dz) / (dx * dx + dy * dy + dz * dz)));
      return Math.hypot(px - dx * h, py - dy * h, pz - dz * h) - r;
    },
    torus(x, y, z, R, r) { return Math.hypot(Math.hypot(x, z) - R, y) - r; },
    // A pitched roof (a prism) on y = 0: half-width w (x), depth d (z), height h.
    roof(x, y, z, w, d, h) {
      const k = h / w, slope = (Math.abs(x) * k + y - h) / Math.sqrt(1 + k * k);
      return Math.max(slope, -y, Math.abs(z) - d);
    },
  };
  // Rotate a point around the y axis (for turning shapes).
  const rotY = (x, z, a) => { const c = Math.cos(a), s = Math.sin(a); return [x * c - z * s, x * s + z * c]; };

  // -------------------------------------------------------------- colour
  const hex = (h) => { const n = parseInt(h.slice(1), 16); return h.length === 4
    ? [((n >> 8) & 15) * 17, ((n >> 4) & 15) * 17, (n & 15) * 17] : [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const RAMP = " .:-=+*#%@";

  // ------------------------------------------------------------ renderer
  // scene = {
  //   map(x, y, z, t, hit) -> distance; set hit.m to a material key
  //   materials: {key: {color, ramp, emissive, shade(c, t)}}
  //   camera(t) -> {pos:[x,y,z], at:[x,y,z], fov (horizontal, degrees)}
  //   light: [x,y,z] (towards the light), ambient, shadows
  //   sky(u, v, t) -> [glyph, rgb, alpha] | null   (u, v in 0..1)
  //   fog: {color, density}, far, live, fps
  //   particles(t, put) -> put(x, y, z, glyph, rgb, alpha, size)
  //   overlay(g, t, W, H, put2) -> 2D extras
  // }
  function view(canvas, scene, opts = {}) {
    const g = canvas.getContext("2d");
    const cellPx = opts.cell || 10;
    let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, cw = 6, ch = 10;
    let buf = null, built = 0, alive = true, timer = 0, visible = true, last = 0, cost = 0, frames = 0;
    const hit = { m: "" };
    let cam = null;

    function setup() {
      const r = opts.size ? { width: opts.size[0], height: opts.size[1] } : canvas.getBoundingClientRect();
      const nd = opts.dpr || Math.min(2, window.devicePixelRatio || 1);
      if (!r.width || !r.height) return false;
      if (r.width === W && r.height === H && nd === dpr && buf) return true;
      W = r.width; H = r.height; dpr = nd;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ch = cellPx; cw = Math.round(cellPx * .62 * 10) / 10;
      cols = Math.max(8, Math.floor(W / cw)); rows = Math.max(6, Math.floor(H / ch));
      const n = cols * rows;
      buf = { d: new Float32Array(n), nx: new Float32Array(n), ny: new Float32Array(n), nz: new Float32Array(n),
        px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n), sh: new Float32Array(n),
        ao: new Float32Array(n), m: new Array(n) };
      built = 0; layer = null; shim = null;
      return true;
    }

    function camBasis(t) {
      const c = scene.camera(t);
      const [px, py, pz] = c.pos, [ax, ay, az] = c.at;
      let fx = ax - px, fy = ay - py, fz = az - pz; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
      let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;   // right = f × up(0,1,0)
      const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                        // up = r × f
      // fov is horizontal; fovV (vertical) keeps a subject framed at any width.
      const focal = c.fovV ? (H / 2) / Math.tan(c.fovV * Math.PI / 360) : (W / 2) / Math.tan((c.fov || 70) * Math.PI / 360);
      return { px, py, pz, fx, fy, fz, rx, rz, ux, uy, uz, focal };
    }

    const MAX = 160;
    function march(ox, oy, oz, dx, dy, dz, t, far) {
      let d = .01;
      for (let i = 0; i < MAX; i++) {
        const s = scene.map(ox + dx * d, oy + dy * d, oz + dz * d, t, hit);
        if (s < .0015 * d + .0008) return [d, i];
        d += s * (scene.step || .9);
        if (d > far) return [-1, MAX];
      }
      // Out of steps on a grazing slope: it's the surface, not a hole to the sky.
      return [d, MAX];
    }
    function normal(x, y, z, t) {
      const e = .004, h = { m: "" }, m = scene.map;
      // Tetrahedron sampling: four evaluations for a gradient.
      const a = m(x + e, y - e, z - e, t, h), b = m(x - e, y - e, z + e, t, h),
        c = m(x - e, y + e, z - e, t, h), d = m(x + e, y + e, z + e, t, h);
      const nx = a - b - c + d, ny = -a - b + c + d, nz = -a + b - c + d, l = Math.hypot(nx, ny, nz) || 1;
      return [nx / l, ny / l, nz / l];
    }
    function shadow(x, y, z, lx, ly, lz, t) {
      let res = 1, d = .03; const h = { m: "" };
      for (let i = 0; i < 40 && d < 12; i++) {
        const s = scene.map(x + lx * d, y + ly * d, z + lz * d, t, h);
        if (s < .001) return .15;
        res = Math.min(res, 8 * s / d); d += Math.max(.02, s);
      }
      return .15 + .85 * Math.max(0, Math.min(1, res));
    }

    // Trace one cell into the buffer.
    let lightDir = null;
    function traceCell(i, t) {
      const B = cam, far = scene.far || 60, [lx, ly, lz] = lightDir;
      const col = i % cols, row = (i - col) / cols;
      const sx = (col + .5) * cw - W / 2, sy = H / 2 - (row + .5) * ch;
      let dx = B.fx * B.focal + B.rx * sx + B.ux * sy, dy = B.fy * B.focal + B.uy * sy, dz = B.fz * B.focal + B.rz * sx + B.uz * sy;
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      const [d, steps] = march(B.px, B.py, B.pz, dx, dy, dz, t, far);
      buf.d[i] = d;
      if (d < 0) { buf.m[i] = ""; return; }
      const x = B.px + dx * d, y = B.py + dy * d, z = B.pz + dz * d;
      buf.m[i] = hit.m;
      const [nx, ny, nz] = normal(x, y, z, t);
      buf.nx[i] = nx; buf.ny[i] = ny; buf.nz[i] = nz; buf.px[i] = x; buf.py[i] = y; buf.pz[i] = z;
      buf.ao[i] = 1 - Math.min(.6, steps / MAX * 1.6);
      buf.sh[i] = scene.shadows === false ? 1 : shadow(x + nx * .02, y + ny * .02, z + nz * .02, lx, ly, lz, t);
    }
    // Trace rows [from, to) into the buffer.
    function trace(from, to, t) {
      let [lx, ly, lz] = scene.light || [.5, .8, .3]; const ll = Math.hypot(lx, ly, lz);
      lightDir = [lx / ll, ly / ll, lz / ll];
      for (let i = from * cols, n = to * cols; i < n; i++) traceCell(i, t);
    }
    // Moving parts (scene.moving: world spheres [x, y, z, r]) are re-traced
    // each frame; only the cells they cover, never the whole view.
    let movingCells = null;
    function findMoving() {
      movingCells = [];
      if (!scene.moving) return;
      const seen = new Set();
      for (const [x, y, z, r] of scene.moving) {
        const B = cam, vx = x - B.px, vy = y - B.py, vz = z - B.pz, zf = vx * B.fx + vy * B.fy + vz * B.fz;
        if (zf < .2) continue;
        const cx = W / 2 + (vx * B.rx + vz * B.rz) / zf * B.focal, cy = H / 2 - (vx * B.ux + vy * B.uy + vz * B.uz) / zf * B.focal;
        const rp = r / zf * B.focal + ch;
        const c0 = Math.max(0, Math.floor((cx - rp) / cw)), c1 = Math.min(cols - 1, Math.ceil((cx + rp) / cw));
        const r0 = Math.max(0, Math.floor((cy - rp) / ch)), r1 = Math.min(rows - 1, Math.ceil((cy + rp) / ch));
        for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
          const i = row * cols + col;
          if (!seen.has(i)) { seen.add(i); movingCells.push(i); }
        }
      }
      movingCells.set = seen;
    }

    // Grouped drawing: cells of the same colour and opacity share one fillStyle.
    function groups() {
      const map = new Map();
      map.put = (x, y, glyph, rgb, alpha, size) => {
        if (alpha <= .03 || x < -10 || y < -10 || x > W + 10 || y > H + 10) return;
        const key = `${rgb[0] >> 3},${rgb[1] >> 3},${rgb[2] >> 3},${Math.min(9, Math.round(alpha * 9))},${size || 0}`;
        let list = map.get(key); if (!list) map.set(key, list = []);
        list.push(x, y, glyph);
      };
      return map;
    }
    function draw(ctx, map) {
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const font = `700 ${ch}px ${opts.font || "monospace"}`;
      ctx.font = font;
      for (const [key, list] of map) {
        const [r, gg, bb, a, size] = key.split(",").map(Number);
        ctx.fillStyle = `rgb(${r << 3},${gg << 3},${bb << 3})`;
        ctx.globalAlpha = a / 9;
        if (size) ctx.font = `700 ${size}px ${opts.font || "monospace"}`;
        for (let k = 0; k < list.length; k += 3) ctx.fillText(list[k + 2], list[k], list[k + 1]);
        if (size) ctx.font = font;
      }
      ctx.globalAlpha = 1;
    }
    // A material is "live" when its shading depends on time (water, fire).
    const isLive = (mk) => { const mat = scene.materials[mk]; return !!(mat && mat.shade && mat.shade.length >= 2); };
    const cell = {};   // the cell handed to custom shaders
    function shadeCell(i, t, put, lx, ly, lz) {
      const col = i % cols, row = (i - col) / cols, x = (col + .5) * cw, y = (row + .5) * ch;
      const mk = buf.m[i];
      if (!mk) {
        const sky = scene.sky && scene.sky(col / cols, row / rows, t, col, row, W / H);
        if (sky) put(x, y, sky[0], sky[1], sky[2]);
        return;
      }
      const mat = scene.materials[mk] || { color: [200, 200, 200] }, c = cell;
      const amb = scene.ambient ?? .22, fog = scene.fog;
      c.nx = buf.nx[i]; c.ny = buf.ny[i]; c.nz = buf.nz[i]; c.x = buf.px[i]; c.y = buf.py[i]; c.z = buf.pz[i];
      c.d = buf.d[i]; c.col = col; c.row = row; c.color = mat.color; c.ramp = mat.ramp || RAMP; c.glyph = null; c.alpha = 1; c.emit = null;
      if (mat.shade) mat.shade(c, t);
      const light = Math.max(0, c.nx * lx + c.ny * ly + c.nz * lz) * buf.sh[i];
      let b = c.emit != null ? c.emit : mat.emissive ? mat.emissive : amb + (1 - amb) * light;
      b *= buf.ao[i];
      if (mat.spec) { const hh = Math.max(0, c.ny * .9 + c.nx * lx * .3); b += mat.spec * Math.pow(hh, 12); }
      b = Math.max(0, Math.min(1, b));
      let rgb = mix([c.color[0] * .3, c.color[1] * .3, c.color[2] * .36], c.color, Math.min(1, b * 1.25));
      let alpha = c.alpha * (.62 + .38 * b);
      if (fog) {
        const f = 1 - Math.exp(-Math.max(0, c.d - (fog.start ?? 5)) * fog.density);
        rgb = mix(rgb, fog.color, f * .8); alpha *= 1 - f * (fog.fade ?? .3);
      }
      const r = c.ramp, glyph = c.glyph || r[Math.min(r.length - 1, Math.max(1, Math.round(Math.sqrt(b) * (r.length - 1))))];
      put(x, y, glyph, rgb, alpha);
    }
    function skyWash(ctx, from, to) {
      const bg = scene.bg || (scene.sky && scene.sky.bg);
      if (!bg) return;
      const top = hex(bg[0]), low = hex(bg[1]), hz = bg[2] ?? .62;
      ctx.globalAlpha = bg[3] ?? .42;
      for (let row = from; row < to; row++) {
        const k = Math.min(1, row / rows / hz), c = mix(top, low, k);
        ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
        let start = -1;
        for (let col = 0; col <= cols; col++) {
          const sky = col < cols && !buf.m[row * cols + col];
          if (sky && start < 0) start = col;
          if (!sky && start >= 0) { ctx.fillRect(start * cw, row * ch, (col - start) * cw + .5, ch + .5); start = -1; }
        }
      }
      ctx.globalAlpha = 1;
    }
    const projectFn = (px, py, pz) => {
      const B = cam, vx = px - B.px, vy = py - B.py, vz = pz - B.pz, zf = vx * B.fx + vy * B.fy + vz * B.fz;
      return zf < .2 ? null : [W / 2 + (vx * B.rx + vz * B.rz) / zf * B.focal, H / 2 - (vx * B.ux + vy * B.uy + vz * B.uz) / zf * B.focal];
    };
    // Still scenes keep a layer of everything that doesn't move, drawn once
    // as rows are traced; each frame copies it and adds only what moves.
    let layer = null, lctx = null, layerRows = 0, liveCells = [], skyCells = [];
    // Shimmer (water, firelight, twinkling sky) lives on its own layer,
    // refreshed a few times a second; moving parts and particles every frame.
    let shim = null, sctx = null, shimAt = -1e9;
    function paint(t) {
      let [lx, ly, lz] = scene.light || [.5, .8, .3]; const ll = Math.hypot(lx, ly, lz); lx /= ll; ly /= ll; lz /= ll;
      const dyn = groups();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, canvas.width, canvas.height);
      if (scene.live) {
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        skyWash(g, 0, built);
        for (let i = 0, n = built * cols; i < n; i++) shadeCell(i, t, dyn.put, lx, ly, lz);
      } else {
        if (!layer || layer.width !== canvas.width || layer.height !== canvas.height) {
          layer = document.createElement("canvas"); layer.width = canvas.width; layer.height = canvas.height;
          lctx = layer.getContext("2d"); layerRows = 0; liveCells = []; skyCells = [];
        }
        if (layerRows < built) {
          const still = groups();
          lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          skyWash(lctx, layerRows, built);
          for (let i = layerRows * cols, n = built * cols; i < n; i++) {
            const mk = buf.m[i];
            if (movingCells && movingCells.set && movingCells.set.has(i)) continue;
            if (!mk) { if (scene.sky) skyCells.push(i); }
            else if (isLive(mk)) liveCells.push(i);
            else shadeCell(i, t, still.put, lx, ly, lz);
          }
          draw(lctx, still);
          layerRows = built;
        }
        g.drawImage(layer, 0, 0);
        if (skyCells.length + liveCells.length) {
          if (!shim || shim.width !== canvas.width || shim.height !== canvas.height) { shim = document.createElement("canvas"); shim.width = canvas.width; shim.height = canvas.height; sctx = shim.getContext("2d"); shimAt = -1e9; }
          const nowMs = performance.now();
          if (nowMs - shimAt > 1000 / (scene.shimmerFps || 5) || built < rows) {
            shimAt = nowMs;
            const sg = groups();
            for (const i of skyCells) shadeCell(i, t, sg.put, lx, ly, lz);
            for (const i of liveCells) shadeCell(i, t, sg.put, lx, ly, lz);
            sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.clearRect(0, 0, shim.width, shim.height);
            sctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(sctx, sg);
          }
          g.drawImage(shim, 0, 0);
        }
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (movingCells && built >= rows) for (const i of movingCells) { traceCell(i, t); shadeCell(i, t, dyn.put, lx, ly, lz); }
      }
      if (scene.particles && built >= rows) {
        const B = cam, fog = scene.fog;
        scene.particles(t, (px, py, pz, glyph, rgb, alpha, size) => {
          const vx = px - B.px, vy = py - B.py, vz = pz - B.pz;
          const zf = vx * B.fx + vy * B.fy + vz * B.fz;
          if (zf < .2) return;
          const sxW = W / 2 + (vx * B.rx + vz * B.rz) / zf * B.focal, syH = H / 2 - (vx * B.ux + vy * B.uy + vz * B.uz) / zf * B.focal;
          const col = Math.floor(sxW / cw), row = Math.floor(syH / ch);
          if (col >= 0 && row >= 0 && col < cols && row < rows) {
            const d = buf.d[row * cols + col];
            if (d > 0 && d < Math.hypot(vx, vy, vz) - .05) return;   // behind a surface
          }
          let a = alpha;
          if (fog) a *= Math.exp(-Math.hypot(vx, vy, vz) * fog.density * .6);
          dyn.put(sxW, syH, glyph, rgb, a, size);
        });
      }
      if (scene.overlay && built >= rows) scene.overlay(t, W, H, dyn.put, projectFn);
      draw(g, dyn);
    }

    const calm = () => document.body.classList.contains("reduce-motion") || window.offgrid;
    function frame() {
      if (!alive) return;
      if (!setup()) { timer = setTimeout(frame, 400); return; }
      const now = performance.now(), t = calm() ? (scene.stillTime ?? 4) : now / 1000;
      if (scene.live) {
        cam = camBasis(t);
        trace(0, rows, t); built = rows;
      } else if (built < rows) {
        // Reveal: a few rows per frame, like a scanline building the view.
        if (!built) { cam = camBasis(scene.stillTime ?? 4); findMoving(); }
        const step = calm() || opts.size ? rows : Math.max(2, Math.ceil(rows / 14));
        trace(built, Math.min(rows, built + step), scene.stillTime ?? 4);
        built = Math.min(rows, built + step);
      }
      paint(t);
      cost += performance.now() - now; frames++;
      last = now;
      if (opts.onFrame) opts.onFrame(t);
      if (opts.size) return;
      const busy = built < rows;
      if (!visible || document.hidden || (calm() && !busy)) return;   // woken again by visibility
      timer = setTimeout(frame, busy ? 16 : 1000 / (scene.fps || (scene.live ? 10 : 9)));
    }
    if (opts.size) { frame(); return { canvas, stats: () => ({ cols, rows, msPerFrame: frames ? +(cost / frames).toFixed(1) : 0 }) }; }
    const io = new IntersectionObserver((e) => {
      const was = visible; visible = !!e[0]?.isIntersecting;
      if (visible && !was) { clearTimeout(timer); frame(); }
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => { clearTimeout(timer); frame(); });
    ro.observe(canvas);
    const wake = () => { if (!document.hidden && visible) { clearTimeout(timer); frame(); } };
    document.addEventListener("visibilitychange", wake);
    frame();
    return {
      stop() { alive = false; clearTimeout(timer); io.disconnect(); ro.disconnect(); document.removeEventListener("visibilitychange", wake); },
      // Rebuild the still buffer (after the scene changed, e.g. a new building).
      rebuild() { built = 0; layer = null; shim = null; clearTimeout(timer); frame(); },
      wake,
      stats: () => ({ W, H, cols, rows, built, cw, ch, dpr, frames, msPerFrame: frames ? +(cost / frames).toFixed(1) : 0 }),
      // Which material is under a point of the canvas (for hover).
      pick(x, y) { const col = Math.floor(x / cw), row = Math.floor(y / ch); return col >= 0 && row >= 0 && col < cols && row < rows ? buf.m[row * cols + col] : ""; },
      project(px, py, pz) {
        if (!cam) return null;
        const B = cam, vx = px - B.px, vy = py - B.py, vz = pz - B.pz, zf = vx * B.fx + vy * B.fy + vz * B.fz;
        if (zf < .2) return null;
        return [W / 2 + (vx * B.rx + vz * B.rz) / zf * B.focal, H / 2 - (vx * B.ux + vy * B.uy + vz * B.uz) / zf * B.focal];
      },
    };
  }

  // Render a scene once to a detached canvas (cached item and recipe art).
  function still(scene, w, h, o = {}) {
    const canvas = document.createElement("canvas");
    view(canvas, { ...scene, live: false, particles: o.particles ? scene.particles : null }, { size: [w, h], cell: o.cell || 6, dpr: o.dpr || Math.min(2, window.devicePixelRatio || 1), font: o.font });
    return canvas;
  }

  return { view, still, sd, rotY, noise2, noise3, fbm2, hash2, hash3, hex, mix, RAMP };
})();
