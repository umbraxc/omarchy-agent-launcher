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
  //   fog: {color, density}, far, live, fps, drift (with live: rows re-traced per frame)
  //   movingShadows: false skips shadow rays for the moving parts (cheaper)
  //   particles(t, put) -> put(x, y, z, glyph, rgb, alpha, size)
  //   overlay(g, t, W, H, put2) -> 2D extras
  // }
  function view(canvas, scene, opts = {}) {
    const g = canvas.getContext("2d");
    const cellPx = opts.cell || 10;
    let W = 0, H = 0, dpr = 1, cols = 0, rows = 0, cw = 6, ch = 10;
    let buf = null, built = 0, scan = 0, alive = true, timer = 0, visible = true, last = 0, cost = 0, frames = 0;
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
        ao: new Float32Array(n), m: new Array(n), sd: new Float32Array(n), st: new Uint8Array(n),
        // The still trace of each cell, kept to restore when a moving part leaves it.
        sm: new Array(n), sn: new Float32Array(n * 3), ssh: new Float32Array(n), sao: new Float32Array(n),
        // For turning models: when each cell was last marched, and its clearance.
        ct: new Float32Array(n).fill(-1), cl: new Float32Array(n) };
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
    let clearance = 0;   // after a miss: how near the ray came to any surface
    function march(ox, oy, oz, dx, dy, dz, t, far, d0) {
      let d = d0 || .01;
      clearance = 99;
      for (let i = 0; i < MAX; i++) {
        const s = scene.map(ox + dx * d, oy + dy * d, oz + dz * d, t, hit);
        if (s < .0015 * d + .0008) return [d, i];
        if (s < clearance) clearance = s;
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
      let res = 1, d = .03, end = 12; const h = { m: "" };
      if (bounds) {   // nothing outside the scene's sphere can cast a shadow
        const ox = x - bounds.c[0], oy = y - bounds.c[1], oz = z - bounds.c[2], bq = ox * lx + oy * ly + oz * lz;
        end = Math.min(end, -bq + Math.sqrt(Math.max(0, bq * bq - (ox * ox + oy * oy + oz * oz - bounds.r * bounds.r))));
      }
      for (let i = 0; i < 40 && d < end; i++) {
        const s = scene.map(x + lx * d, y + ly * d, z + lz * d, t, h);
        if (s < .001) return .15;
        res = Math.min(res, 8 * s / d); d += Math.max(.02, s);
      }
      return .15 + .85 * Math.max(0, Math.min(1, res));
    }

    // Trace one cell into the buffer.
    let lightDir = null;
    // again: a moving cell starts its ray where it enters a moving part, or just
    // before the still surface the first trace found, whichever is nearer:
    // nothing can lie in front of that, so far fewer steps for the same picture.
    function traceCell(i, t, again) {
      const B = cam, [lx, ly, lz] = lightDir;
      let far = scene.far || 60;
      const col = i % cols, row = (i - col) / cols;
      const sx = (col + .5) * cw - W / 2, sy = H / 2 - (row + .5) * ch;
      let dx = B.fx * B.focal + B.rx * sx + B.ux * sy, dy = B.fy * B.focal + B.uy * sy, dz = B.fz * B.focal + B.rz * sx + B.uz * sy;
      const dl = Math.hypot(dx, dy, dz); dx /= dl; dy /= dl; dz /= dl;
      let d0 = 0;
      if (again) {
        let start = buf.sd[i] > 0 ? buf.sd[i] - .08 : far;
        for (const [mx, my, mz, mr] of scene.moving) {
          const ox = B.px - mx, oy = B.py - my, oz = B.pz - mz, bq = ox * dx + oy * dy + oz * dz, r = mr + .1;
          const disc = bq * bq - (ox * ox + oy * oy + oz * oz - r * r);
          if (disc >= 0) start = Math.min(start, -bq - Math.sqrt(disc));
        }
        if (start >= far) { buf.d[i] = -1; buf.m[i] = ""; return; }   // sky, and no moving part on this ray
        d0 = Math.max(.01, start);
      }
      // A scene that fits in a sphere (a figure on a stand): rays that miss
      // it are sky at once, and the rest start where they enter it.
      if (bounds) {
        const [bx, by, bz] = bounds.c, ox = B.px - bx, oy = B.py - by, oz = B.pz - bz, bq = ox * dx + oy * dy + oz * dz;
        const disc = bq * bq - (ox * ox + oy * oy + oz * oz - bounds.r * bounds.r);
        if (disc < 0) { buf.d[i] = -1; buf.m[i] = ""; if (!again) { buf.sd[i] = -1; buf.st[i] = 0; } return; }
        const root = Math.sqrt(disc), entry = Math.max(d0, -bq - root, .01);
        d0 = entry; far = Math.min(far, -bq + root + .05);
        // A turning model moves only a little between frames (scene.motion:
        // at most that far a second). A ray that missed it by a margin still
        // misses until the model could have closed the gap; a ray that hit it
        // starts again just in front of where it hit.
        if (scene.motion && !again && built >= rows && buf.ct[i] >= 0) {
          const moved = scene.motion * Math.abs(t - buf.ct[i]) + .004;
          if (buf.d[i] < 0) {
            if (buf.cl[i] > moved) { buf.m[i] = ""; return; }
          } else {
            const near = buf.d[i] - moved * 3 - .03;
            if (near > entry && scene.map(B.px + dx * near, B.py + dy * near, B.pz + dz * near, t, hit) > .002) d0 = near;
          }
        }
      }
      const [d, n] = march(B.px, B.py, B.pz, dx, dy, dz, t, far, d0);
      if (bounds && scene.motion && !again) { buf.ct[i] = t; buf.cl[i] = d < 0 ? clearance : 0; }
      // Steps skipped count as the still trace's, so shading stays even.
      const steps = again ? Math.min(MAX, n + (buf.sd[i] > 0 ? buf.st[i] * Math.min(1, d0 / buf.sd[i]) : 0)) : n;
      if (!again) { buf.sd[i] = d; buf.st[i] = Math.min(255, n); }
      buf.d[i] = d;
      if (d < 0) { buf.m[i] = ""; return; }
      const x = B.px + dx * d, y = B.py + dy * d, z = B.pz + dz * d;
      buf.m[i] = hit.m; buf.px[i] = x; buf.py[i] = y; buf.pz[i] = z;
      if (again && hit.m === buf.sm[i] && Math.abs(d - buf.sd[i]) < .01) {   // the same still surface: no need to light it again
        buf.nx[i] = buf.sn[i * 3]; buf.ny[i] = buf.sn[i * 3 + 1]; buf.nz[i] = buf.sn[i * 3 + 2]; buf.ao[i] = buf.sao[i]; buf.sh[i] = buf.ssh[i];
        return;
      }
      const [nx, ny, nz] = normal(x, y, z, t);
      buf.nx[i] = nx; buf.ny[i] = ny; buf.nz[i] = nz;
      buf.ao[i] = 1 - Math.min(.6, steps / MAX * 1.6);
      const mat = scene.materials[hit.m];
      buf.sh[i] = scene.shadows === false || (again && (scene.movingShadows === false || mat && mat.emissive)) ? 1 : shadow(x + nx * .02, y + ny * .02, z + nz * .02, lx, ly, lz, t);
      if (!again) { buf.sm[i] = hit.m; buf.sn[i * 3] = nx; buf.sn[i * 3 + 1] = ny; buf.sn[i * 3 + 2] = nz; buf.sao[i] = buf.ao[i]; buf.ssh[i] = buf.sh[i]; }
    }
    // Trace rows [from, to) into the buffer.
    let bounds = null;
    function trace(from, to, t) {
      bounds = typeof scene.bound === "function" ? scene.bound(t) : scene.bound || null;
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
    // ...but a live cell whose look never changes (firelight too faint to
    // flicker visibly that far from the fire) is drawn once with the still
    // ones: it's shaded at a few moments and kept live only if they differ.
    function looksLive(i, t, lx, ly, lz) {
      let lo = Infinity, hi = 0, glyphs = new Set();
      const probe = (x, y, glyph, rgb, alpha) => { const l = alpha * (.3 * rgb[0] + .59 * rgb[1] + .11 * rgb[2]); lo = Math.min(lo, l); hi = Math.max(hi, l); glyphs.add(glyph); };
      for (const dt of [0, .13, .29, .47, .71, .97, 1.3, 2.1, 3.4, 5.5, 8.9, 14.4]) shadeCell(i, t + dt, probe, lx, ly, lz);
      // Live when its brightness visibly changes, or its glyph changes for
      // reasons other than a faint flicker (fire, water, a blinking light).
      return hi - lo > hi * .12 + 5 || (glyphs.size > 2) || (glyphs.size > 1 && hi - lo > hi * .05 + 3);
    }
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
            else if (isLive(mk) && looksLive(i, t, lx, ly, lz)) liveCells.push(i);
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
        if (movingCells && built >= rows) for (const i of movingCells) { traceCell(i, t, true); shadeCell(i, t, dyn.put, lx, ly, lz); }
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

    // A turntable (scene.turntable: { speed } on a model turning about the
    // vertical axis): its surface is captured once, traced from a dozen
    // angles, as points; each frame then turns the points and drops them into
    // the cells nearest the eye. Smooth at any speed for a tiny fraction of
    // tracing every frame.
    let tt = null;
    function captureView(k, K) {
      const speed = scene.turntable.speed, a = (k / K) * Math.PI * 2, tk = a / speed;
      cam = camBasis(tk);
      buf.ct.fill(-1);
      trace(0, rows, tk);
      const [lx, ly, lz] = lightDir, c = Math.cos(a), s = Math.sin(a);
      for (let i = 0; i < cols * rows; i++) {
        if (!(buf.d[i] > 0)) continue;
        // Back into the model's own frame (the scene turns world points by a).
        const x = buf.px[i], z = buf.pz[i], nx = buf.nx[i], nz = buf.nz[i];
        tt.pts.push(x * c - z * s, buf.py[i], x * s + z * c, nx * c - nz * s, buf.ny[i], nx * s + nz * c, buf.ao[i]);
        tt.mat.push(buf.m[i]);
      }
      if (k === 0) tt.light = [lx, ly, lz];
    }
    function splat(t) {
      const a = t * scene.turntable.speed, c = Math.cos(a), s = Math.sin(a), B = cam, P = tt.pts, n = cols * rows;
      buf.d.fill(-1); buf.m.fill("");
      for (let j = 0, k = 0; j < P.length; j += 7, k++) {
        // Back out to the world: the inverse turn.
        const x = P[j] * c + P[j + 2] * s, y = P[j + 1], z = -P[j] * s + P[j + 2] * c;
        const vx = x - B.px, vy = y - B.py, vz = z - B.pz, zf = vx * B.fx + vy * B.fy + vz * B.fz;
        if (zf < .2) continue;
        const col = Math.floor((W / 2 + (vx * B.rx + vz * B.rz) / zf * B.focal) / cw), row = Math.floor((H / 2 - (vx * B.ux + vy * B.uy + vz * B.uz) / zf * B.focal) / ch);
        if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
        const i = row * cols + col, nx = P[j + 3] * c + P[j + 5] * s, nz = -P[j + 3] * s + P[j + 5] * c;
        if (nx * vx + P[j + 4] * vy + nz * vz > 0) continue;   // facing away
        if (buf.d[i] > 0 && buf.d[i] <= zf) continue;
        buf.d[i] = zf; buf.m[i] = tt.mat[k]; buf.px[i] = x; buf.py[i] = y; buf.pz[i] = z;
        buf.nx[i] = nx; buf.ny[i] = P[j + 4]; buf.nz[i] = nz; buf.ao[i] = P[j + 6];
      }
      // Pinholes between points take their nearest neighbour.
      for (let i = cols; i < n - cols; i++) {
        if (buf.d[i] > 0) continue;
        const l = buf.d[i - 1] > 0, r = buf.d[i + 1] > 0, u = buf.d[i - cols] > 0, dn = buf.d[i + cols] > 0;
        if ((l && r) || (u && dn)) {
          const f = l && r ? (buf.d[i - 1] < buf.d[i + 1] ? i - 1 : i + 1) : (buf.d[i - cols] < buf.d[i + cols] ? i - cols : i + cols);
          buf.d[i] = buf.d[f]; buf.m[i] = buf.m[f]; buf.px[i] = buf.px[f]; buf.py[i] = buf.py[f]; buf.pz[i] = buf.pz[f];
          buf.nx[i] = buf.nx[f]; buf.ny[i] = buf.ny[f]; buf.nz[i] = buf.nz[f]; buf.ao[i] = buf.ao[f];
        }
      }
      // Shadows: a quarter of the lit cells each frame, so they follow the
      // turn a step behind at a quarter of the cost.
      const [lx, ly, lz] = lightDir;
      tt.phase = (tt.phase + 1) % 4;
      for (let i = 0; i < n; i++) {
        if (!(buf.d[i] > 0)) { tt.sh[i] = 1; continue; }
        if (scene.shadows !== false && i % 4 === tt.phase) tt.sh[i] = shadow(buf.px[i] + buf.nx[i] * .02, buf.py[i] + buf.ny[i] * .02, buf.pz[i] + buf.nz[i] * .02, lx, ly, lz, t);
        buf.sh[i] = scene.shadows === false ? 1 : tt.sh[i];
      }
    }

    const calm = () => document.body.classList.contains("reduce-motion") || window.offgrid;
    function frame() {
      if (!alive) return;
      if (!setup()) { timer = setTimeout(frame, 400); return; }
      const now = performance.now();
      let t = calm() ? (scene.stillTime ?? 4) : now / 1000;
      if (scene.turntable && scene.live && !calm()) {
        const K = scene.turntable.views || 12;
        if (!tt || tt.cols !== cols || tt.rows !== rows) tt = { pts: [], mat: [], done: 0, cols, rows, sh: new Float32Array(cols * rows).fill(1), phase: 0, start: 0 };
        if (tt.done < K) {
          // Capture one angle per frame; the first is shown while the rest are taken.
          captureView(tt.done, K);
          if (!tt.done) { built = rows; paint(0); }
          tt.done++;
          if (tt.done === K) tt.start = now;
          cost += performance.now() - now; frames++;
          timer = setTimeout(frame, 16);
          return;
        }
        t = (now - tt.start) / 1000;
        cam = camBasis(0);
        splat(t);
        built = rows;
      } else if (scene.live && scene.drift && built >= rows) {
        // A slow drift: the camera moves a little and a band of rows is
        // traced again each frame, like a scanline, so a heavy scene can turn.
        cam = camBasis(t);
        const n = Math.min(rows, scene.drift);
        trace(scan, Math.min(rows, scan + n), t); scan = scan + n >= rows ? 0 : scan + n;
      } else if (scene.live && !scene.drift) {
        cam = camBasis(t);
        trace(0, rows, t); built = rows;
      } else if (built < rows) {
        // Reveal: a few rows per frame, like a scanline building the view.
        if (!built) { cam = camBasis(scene.drift && !calm() ? now / 1000 : scene.stillTime ?? 4); if (!scene.live) findMoving(); }
        const step = calm() || opts.size ? rows : Math.max(1, Math.ceil(rows / 26));
        trace(built, Math.min(rows, built + step), scene.drift && !calm() ? now / 1000 : scene.stillTime ?? 4);
        built = Math.min(rows, built + step);
      }
      paint(t);
      cost += performance.now() - now; frames++;
      last = now;
      if (opts.onFrame) opts.onFrame(t);
      if (opts.size) return;
      const busy = built < rows;
      if (!visible || document.hidden || (calm() && !busy)) return;   // woken again by visibility
      // The frame's own time counts towards the pace, so a scene keeps its
      // frame rate (never sleeping less than half the interval).
      const every = 1000 / (scene.fps || (scene.live ? 10 : 9));
      timer = setTimeout(frame, busy ? 16 : Math.max(every / 2, every - (performance.now() - now)));
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
