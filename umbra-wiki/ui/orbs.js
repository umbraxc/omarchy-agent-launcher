// Umbra Wiki orbs: the sphere on the start screen (and while Umbra thinks),
// drawn in characters on a canvas, like the Sun & Moon view: each character
// with its own colour and brightness, glows behind, several layers. The
// style is a reward equipped in the Locker; "globe" is everyone's from the
// start. Colours come from the theme, so every orb fits every theme.
// Loaded before app.js; app.js's orb() draws with UmbraOrbs.start().
"use strict";

window.UmbraOrbs = (() => {
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  // Smooth value noise, for textures (moon maria, gas bands, flames).
  const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
  const lerp = (a, b, k) => a + (b - a) * k;
  function noise(x, y, z = 0) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const s = (k) => k * k * (3 - 2 * k), u = s(xf), v = s(yf), w = s(zf);
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
    return lerp(lerp(lerp(c(0, 0, 0), c(1, 0, 0), u), lerp(c(0, 1, 0), c(1, 1, 0), u), v),
      lerp(lerp(c(0, 0, 1), c(1, 0, 1), u), lerp(c(0, 1, 1), c(1, 1, 1), u), v), w);
  }
  const fbm = (x, y, z) => noise(x, y, z) * 0.55 + noise(x * 2.1, y * 2.1, z) * 0.3 + noise(x * 4.3, y * 4.3, z) * 0.15;
  // Distance from (x, y) to an ellipse of half-width a and height ratio k:
  // what makes thin rings come out solid on a grid of characters.
  function ringDist(x, y, a, k) {
    const e = Math.hypot(x / a, y / (a * k)) || 1e-6;
    const gx = x / (a * a * e), gy = y / (a * a * k * k * e);
    return Math.abs(e - 1) / (Math.hypot(gx, gy) || 1e-6);
  }
  const rot = (u, v, a) => [u * Math.cos(a) + v * Math.sin(a), -u * Math.sin(a) + v * Math.cos(a)];
  const RAMP = " .·:-=+*#%@";
  const ramp = (v) => RAMP[Math.round(clamp(v) * (RAMP.length - 1))];

  // Land and sea, from the Sun & Moon view's map (when it's loaded).
  const isLand = (lat, lon) => (window.UmbraOrrery && window.UmbraOrrery.isLand ? window.UmbraOrrery.isLand(lat, lon) : noise(lat / 18, lon / 18) > 0.55);

  // A lit sphere point: longitude, latitude and the light on it.
  function sphere(u, v, spin, tilt = 0.35) {
    const w = Math.sqrt(Math.max(0, 1 - u * u - v * v));
    const y = v * Math.cos(tilt) - w * Math.sin(tilt), z = v * Math.sin(tilt) + w * Math.cos(tilt);
    return { lat: Math.asin(clamp(-y, -1, 1)) * 180 / Math.PI, lon: ((Math.atan2(u, z) + spin) * 180 / Math.PI) % 360 - 180, w };
  }

  // ---------------------------------------------------------- the styles
  // Each: cell(u, v, r, t) → [char, colour, alpha] or null for a point of
  // the unit disc; optional under(c)/over(c) paint glows in pixels.
  const STYLES = {
    globe: {
      under: (c) => c.glow(c.cx, c.cy, c.R * 1.25, c.p.signal, 0.16),
      cell(u, v, r, t, c) {
        if (r > 1) return r < 1.08 ? ["·", c.p.signal, 0.35 * (1.08 - r) / 0.08] : null;
        const s = sphere(u, v, t * 0.35), light = clamp(-0.55 * u - 0.35 * v + 0.75 * s.w);
        const land = isLand(s.lat, s.lon);
        const grid = Math.abs(Math.sin(s.lon * Math.PI / 30)) < 0.05 || Math.abs(Math.sin(s.lat * Math.PI / 30)) < 0.05;
        if (light < 0.1) return land ? [":", c.p.shade2, 0.5] : ["·", c.p.shade3, grid ? 0.45 : 0.25];
        if (land) return [light > 0.6 ? "#" : light > 0.3 ? "%" : "+", light > 0.55 ? c.p.fgBright : c.p.signal, 0.6 + 0.4 * light];
        return [grid ? "+" : light > 0.5 ? "~" : "-", grid ? c.p.shade1 : c.p.shade2, 0.3 + 0.45 * light];
      },
      over: (c) => c.glow(c.cx - c.R * 0.35, c.cy - c.R * 0.35, c.R * 0.35, c.p.fgBright, 0.08),
    },
    gold: {
      under: (c) => c.glow(c.cx, c.cy, c.R * 1.3, "#e8c35c", 0.22),
      cell(u, v, r, t, c) {
        if (r > 1) return null;
        const s = sphere(u, v, t * 0.3), light = clamp(-0.55 * u - 0.35 * v + 0.75 * s.w);
        const land = isLand(s.lat, s.lon), sparkle = hash(Math.round(u * 40), Math.round(v * 40), Math.floor(t * 3)) > 0.985;
        if (sparkle && light > 0.3) return ["✦", "#fff4c8", 1];
        return [ramp(0.2 + light * (land ? 0.8 : 0.45)), land ? "#f2cf6b" : "#b8892c", 0.35 + 0.65 * light];
      },
    },
    radar: {
      under: (c) => c.glow(c.cx, c.cy, c.R * 1.1, c.p.signal, 0.1),
      cell(u, v, r, t, c) {
        if (r > 1.04) return null;
        const th = Math.atan2(v, u), sweep = ((t * 1.3 - th) % TAU + TAU) % TAU;
        if (r > 0.94) { const tick = Math.abs(Math.sin(th * 18)) > 0.92; return [tick ? "|" : "·", c.p.signal, tick ? 0.8 : 0.4]; }
        // Blips: fixed contacts that flare when the beam passes, then fade.
        for (const [bx, by] of [[0.42, -0.3], [-0.5, 0.35], [0.15, 0.62], [-0.2, -0.55]]) {
          if (Math.hypot(u - bx, v - by) < 0.07) {
            const age = ((t * 1.3 - Math.atan2(by, bx)) % TAU + TAU) % TAU;
            return ["◆", c.p.accent, clamp(1 - age / 4.5, 0.15)];
          }
        }
        const trail = sweep < 1.4 ? 1 - sweep / 1.4 : 0;
        const ring = [0.33, 0.66].some((x) => Math.abs(r - x) < 0.022) || Math.abs(u) < 0.018 || Math.abs(v) < 0.03;
        if (trail > 0.05) return [trail > 0.8 ? "#" : trail > 0.5 ? "+" : ":", c.p.signal, 0.25 + trail * 0.75];
        return ring ? ["·", c.p.shade1, 0.55] : [hash(u * 30, v * 30, 1) > 0.97 ? "·" : " ", c.p.shade3, 0.4];
      },
    },
    compass: {
      under: (c) => c.glow(c.cx, c.cy, c.R, c.p.shade2, 0.12),
      cell(u, v, r, t, c) {
        if (r > 1.02) return null;
        const th = Math.atan2(u, -v);
        if (r > 0.86) {
          const near = [0, Math.PI / 2, Math.PI, -Math.PI / 2].some((a) => Math.abs(Math.atan2(Math.sin(th - a), Math.cos(th - a))) < 0.16);
          if (near) return null;   // the letters are drawn over (see over)
          return [Math.abs(Math.sin(th * 16)) > 0.94 ? "+" : "·", c.p.shade1, 0.6];
        }
        // The needle swings and settles, again and again.
        const k = (t % 10) / 10, swing = Math.sin(t * 2.2) * Math.exp(-k * 4) * 0.9;
        const nx = Math.sin(swing), ny = -Math.cos(swing);
        const along = u * nx + v * ny, across = Math.abs(u * ny - v * nx);
        if (across < 0.1 * (1 - Math.abs(along) / 0.8) && Math.abs(along) < 0.8) return [along > 0 ? "▲" : "▼", along > 0 ? c.p.red : c.p.dim, 0.95];
        if (r < 0.08) return ["◉", c.p.signal, 1];
        const rose = r < 0.15 + 0.6 * Math.pow(Math.abs(Math.cos(2 * th)), 16);
        return rose ? ["+", c.p.shade1, 0.5] : [hash(u * 20, v * 20, 2) > 0.9 ? "·" : " ", c.p.faint, 0.3];
      },
      over(c) {
        c.text("N", c.cx, c.cy - c.R * 0.91, c.p.red, 1.4);
        c.text("S", c.cx, c.cy + c.R * 0.91, c.p.fgBright, 1.2);
        c.text("E", c.cx + c.R * 0.91, c.cy, c.p.fgBright, 1.2);
        c.text("W", c.cx - c.R * 0.91, c.cy, c.p.fgBright, 1.2);
      },
    },
    moon: {
      under: (c) => c.glow(c.cx, c.cy, c.R * 1.2, c.p.fg, 0.08),
      cell(u, v, r, t, c) {
        if (r > 1) return hash(u * 13, v * 13, 3) > 0.985 ? ["·", c.p.fg, 0.5 + 0.5 * Math.sin(t * 2 + u * 9)] : null;
        const w = Math.sqrt(1 - r * r), a = t * 0.25;
        const lit = u * Math.sin(a) + w * Math.cos(a);
        const maria = fbm(u * 2.2 + 3, v * 2.2 + 1, 0.5), crater = noise(u * 9, v * 9, 7) > 0.78;
        const tone = clamp(0.55 + (maria > 0.55 ? -0.25 : 0.1) + (crater ? -0.2 : 0));
        if (lit < 0) return [crater ? ":" : "·", c.p.faint, 0.25];   // earthshine
        return [ramp(tone * (0.35 + 0.65 * clamp(lit * 1.3))), maria > 0.55 ? c.p.dim : c.p.fgBright, 0.35 + 0.65 * clamp(lit * 1.5)];
      },
    },
    reactor: {
      under: (c) => { c.glow(c.cx, c.cy, c.R * (0.5 + 0.08 * Math.sin(c.t * 4)), c.p.accent, 0.4); c.glow(c.cx, c.cy, c.R * 1.2, c.p.signal, 0.1); },
      cell(u, v, r, t, c) {
        if (r > 1.05) return null;
        if (r < 0.22) return [r < 0.1 ? "@" : "%", c.p.fgBright, 0.7 + 0.3 * Math.sin(t * 6)];
        // Three tilted rings, turning.
        for (const [tilt, speed, col] of [[0.25, 1, c.p.signal], [1.3, -0.8, c.p.accent], [2.4, 0.6, c.p.shade1]]) {
          const [x, y] = rot(u, v, tilt);
          if (ringDist(x, y, 0.86, 0.32) < 0.055) {
            const a = Math.atan2(y / 0.32, x), head = ((a - t * speed * 2) % TAU + TAU) % TAU;
            return [head < 0.4 ? "●" : head < 1.2 ? "•" : "∙", col, head < 0.4 ? 1 : head < 1.2 ? 0.85 : 0.65];
          }
        }
        const spoke = Math.abs(Math.sin(3 * (Math.atan2(v, u) - t))) < 0.07 && r < 0.6;
        return spoke ? [":", c.p.shade2, 0.6] : null;
      },
    },
    ringworld: {
      under: (c) => c.glow(c.cx, c.cy, c.R * 1.2, c.p.shade1, 0.12),
      cell(u, v, r, t, c) {
        const [x, y] = rot(u, v, 0.32);
        const re = Math.hypot(x, y / 0.24), inRing = re > 0.7 && re < 1.03 && Math.abs(re - 0.86) > 0.03;
        const pr = r / 0.62;
        // A small moon going round.
        const ma = t * 0.6, mx = Math.cos(ma) * 0.95, my = Math.sin(ma) * 0.3;
        if (Math.hypot(u - mx, v - my) < 0.06 && (Math.sin(ma) > 0 || pr > 1)) return ["o", c.p.fgBright, 0.9];
        if (inRing && (y > 0 || pr > 1)) return [Math.abs(Math.sin(re * 60)) > 0.5 ? "=" : "-", re < 0.86 ? c.p.signal : c.p.shade1, 0.75];
        if (pr <= 1) {
          const w = Math.sqrt(1 - pr * pr), light = clamp(-0.5 * u / 0.62 - 0.3 * v / 0.62 + 0.8 * w);
          const band = Math.sin(v / 0.62 * 11 + fbm(u * 3, v * 5, t * 0.2) * 3);
          const shadow = y < 0 && Math.abs(y / 0.24) < 0.35 ? 0.4 : 1;   // the ring's shadow on the planet
          return [ramp(0.25 + light * 0.75 * shadow), band > 0.3 ? c.p.accent : c.p.signal, (0.35 + 0.65 * light) * shadow];
        }
        return null;
      },
    },
    watcher: {
      under: (c) => c.glow(c.cx, c.cy, c.R, c.p.red, 0.1),
      cell(u, v, r, t, c) {
        const blink = (t % 7) > 6.7 ? Math.abs(Math.sin(((t % 7) - 6.7) / 0.3 * Math.PI)) : 1;
        const lid = 0.6 * (1 - u * u) * (1 - blink * 0) * blink + 0.001;
        if (Math.abs(v) > lid) return Math.abs(Math.abs(v) - lid) < 0.05 && Math.abs(u) < 0.98 ? ["~", c.p.shade1, 0.7] : null;
        const px = Math.sin(t * 0.4) * 0.3 + Math.sin(t * 1.7) * 0.05, py = Math.sin(t * 0.7) * 0.08;
        const d = Math.hypot(u - px, v - py), pupil = 0.12 + 0.03 * Math.sin(t * 0.9);
        if (Math.hypot(u - px + 0.08, v - py + 0.08) < 0.04) return ["*", "#ffffff", 1];   // the glint
        if (d < pupil) return ["@", c.p.bg, 1];
        if (d < 0.38) {
          const fibre = Math.abs(Math.sin(Math.atan2(v - py, u - px) * 14 + noise(u * 8, v * 8, 1) * 3));
          return [fibre > 0.6 ? "#" : "+", d < 0.25 ? c.p.accent : c.p.signal, 0.55 + 0.45 * fibre];
        }
        return [hash(u * 20, v * 20, 4) > 0.8 ? "·" : " ", c.p.fg, 0.35];
      },
    },
    blacksun: {
      under: (c) => { c.glow(c.cx, c.cy, c.R * 1.25, c.p.red, 0.25); c.glow(c.cx, c.cy, c.R * 0.9, c.p.accent, 0.25); },
      cell(u, v, r, t, c) {
        if (r < 0.52) return r > 0.47 ? ["O", c.p.fgBright, 0.9] : null;
        const th = Math.atan2(v, u), flame = fbm(Math.cos(th) * 2 + t * 0.4, Math.sin(th) * 2, t * 0.5);
        const reach = 0.52 + 0.5 * flame;
        if (r > reach) return null;
        const k = (r - 0.52) / (reach - 0.52 + 0.001);
        return [k < 0.3 ? "#" : k < 0.6 ? "*" : "·", k < 0.35 ? c.p.fgBright : k < 0.7 ? c.p.accent : c.p.red, 1 - k * 0.7];
      },
    },
    // Hard to earn.
    galaxy: {
      under: (c) => c.glow(c.cx, c.cy, c.R * 0.45, c.p.fgBright, 0.35),
      cell(u, v, r, t, c) {
        if (r > 1.05) return null;
        const y = v / 0.7, rr = Math.hypot(u, y), th = Math.atan2(y, u);
        const arm = Math.cos(2 * (th - Math.log(rr + 0.05) * 2.6 - t * 0.35));
        const dens = clamp((arm * 0.5 + 0.5) * (1.1 - rr) * 2 + (rr < 0.2 ? 1 : 0) + (noise(u * 14, y * 14, 9) - 0.5) * 0.5);
        if (dens < 0.14) return hash(u * 29, v * 29, 5) > 0.97 ? ["·", c.p.fg, 0.5] : null;
        return [ramp(dens), rr < 0.25 ? c.p.fgBright : arm > 0.3 ? c.p.signal : c.p.net, 0.3 + 0.7 * dens];
      },
    },
    aurora: {
      under: (c) => c.glow(c.cx, c.cy - c.R * 0.7, c.R * 0.8, c.p.net, 0.2),
      cell(u, v, r, t, c) {
        // The night side of the Earth with city lights, and curtains of light over the pole.
        const wave = Math.sin(u * 6 + t * 0.8 + Math.sin(u * 2.5 - t * 0.6) * 1.8) * 0.5 + 0.5;
        const top = -0.35 - 0.45 * wave, curtain = v < -0.2 && v > top - 0.35 ? clamp(1 - Math.abs(v - top) / 0.35) * (0.4 + 0.6 * wave) : 0;
        if (r > 1) return curtain > 0.15 ? [curtain > 0.6 ? "|" : ":", curtain > 0.75 ? c.p.fgBright : c.p.net, 0.2 + 0.7 * curtain] : null;
        const s = sphere(u, v, t * 0.2, 0.8), land = isLand(s.lat, s.lon), rim = clamp((r - 0.75) / 0.25);
        if (curtain > 0.3) return [curtain > 0.6 ? "|" : ":", c.p.net, 0.35 + 0.6 * curtain];
        if (land) return hash(Math.round(s.lat * 1.5), Math.round(s.lon * 1.5), 6) > 0.86 ? ["*", c.p.accent, 0.95] : [":", c.p.shade2, 0.45 + 0.2 * rim];
        return ["·", rim > 0.5 ? c.p.net : c.p.shade3, 0.25 + 0.4 * rim];
      },
    },
    atom: {
      under: (c) => c.glow(c.cx, c.cy, c.R * 0.35, c.p.accent, 0.4),
      cell(u, v, r, t, c) {
        if (r < 0.14) return ["@", hash(Math.round(u * 20), Math.round(v * 20), 7) > 0.5 ? c.p.red : c.p.signal, 1];
        for (const [tilt, speed] of [[0, 1.4], [Math.PI / 3, -1.1], [-Math.PI / 3, 1.7]]) {
          const [x, y] = rot(u, v, tilt);
          if (ringDist(x, y, 0.92, 0.34) < 0.05) {
            const a = Math.atan2(y / 0.34, x), head = ((a - t * speed * 2) % TAU + TAU) % TAU;
            return head < 0.25 ? ["●", c.p.net, 1] : head < 1 ? ["•", c.p.signal, 0.9 - head * 0.5] : ["∙", c.p.signal, 0.6];
          }
        }
        return null;
      },
    },
    blackhole: {
      under: (c) => c.glow(c.cx, c.cy, c.R * 1.2, c.p.accent, 0.18),
      cell(u, v, r, t, c) {
        // A tilted accretion disc, its far side bent up over the hole by gravity.
        const disc = Math.hypot(u, v / 0.2), bent = Math.hypot(u * 0.95, (v + 0.34 * (1 - clamp(Math.abs(u) / 0.9))) / 0.55);
        const hole = r < 0.3;
        const swirl = (a, d) => fbm(Math.cos(a - t * 0.9 / d) * d * 3, Math.sin(a - t * 0.9 / d) * d * 3, t * 0.2);
        if (disc > 0.34 && disc < 1 && v > -0.05) {
          const k = swirl(Math.atan2(v, u), disc);
          return [ramp(0.3 + k * 0.7), disc < 0.55 ? c.p.fgBright : disc < 0.8 ? c.p.signal : c.p.accent, 0.45 + 0.55 * (1 - disc)];
        }
        if (hole) return Math.abs(r - 0.29) < 0.03 ? ["o", c.p.fgBright, 0.9] : null;   // the photon ring
        if (bent > 0.5 && bent < 0.9 && v < 0) {
          const k = swirl(Math.atan2(v, u) + 1, bent);
          return [ramp(0.2 + k * 0.6), bent < 0.65 ? c.p.signal : c.p.accent, 0.35 + 0.4 * (1 - bent)];
        }
        return hash(u * 31, v * 31, 8) > 0.985 ? ["·", c.p.fg, 0.5] : null;
      },
    },
    supernova: {
      under: (c) => { const k = (c.t % 6) / 6; c.glow(c.cx, c.cy, c.R * (0.3 + k * 1.1), c.p.fgBright, 0.35 * (1 - k)); c.glow(c.cx, c.cy, c.R * 0.3, c.p.accent, 0.4); },
      cell(u, v, r, t, c) {
        const k = (t % 6) / 6, front = 0.12 + k * 0.95, th = Math.atan2(v, u);
        const ragged = front + (noise(Math.cos(th) * 3, Math.sin(th) * 3, Math.floor(t / 6)) - 0.5) * 0.25;
        if (r < 0.1) return ["✺", c.p.fgBright, 1];
        if (Math.abs(r - ragged) < 0.05) return ["*", k < 0.5 ? c.p.fgBright : c.p.accent, 1 - k * 0.6];
        if (r < ragged) {
          const fil = fbm(u * 4, v * 4, Math.floor(t / 6) + k);
          return fil > 0.55 ? [fil > 0.7 ? "%" : "+", fil > 0.65 ? c.p.red : c.p.accent, (1 - k) * 0.8] : null;
        }
        return hash(u * 27, v * 27, 9) > 0.985 ? ["·", c.p.fg, 0.5] : null;
      },
    },
  };

  // ---------------------------------------------------------- the canvas

  // Draws a style into el (the old <pre>, same size as before). w × h is
  // its size in the old characters; the canvas uses finer ones inside it.
  function start(el, w, h, pick) {
    const canvas = document.createElement("canvas");
    canvas.className = "orb-canvas";
    el.textContent = "";
    el.appendChild(canvas);
    const g = canvas.getContext("2d");
    let alive = true, raf = 0, last = 0, t = Math.random() * 6, W = 0, H = 0, dpr = 1, pal = {}, palAt = 0;
    const size = () => {
      const fs = parseFloat(getComputedStyle(el).fontSize) || 10;
      W = Math.round(w * fs * 0.68); H = Math.round(h * fs);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
      return fs;
    };
    let fs = size();
    const colours = () => ({
      bg: css("--bg"), fg: css("--fg"), fgBright: css("--fg-bright"), dim: css("--dim"), faint: css("--faint"),
      signal: css("--signal"), shade1: css("--shade-1"), shade2: css("--shade-2"), shade3: css("--shade-3"),
      accent: css("--accent"), net: css("--net"), red: css("--red"), font: css("--font") || "monospace",
    });
    const frame = (ts) => {
      if (!alive) return;
      if (!el.isConnected) { alive = false; return; }
      raf = requestAnimationFrame(frame);
      const still = document.body.classList.contains("reduce-motion") || window.offgrid;
      // Small previews run slower; nothing is drawn while out of sight (the
      // window draws on the processor, so unseen frames are pure waste).
      if (ts - last < (still ? 1000 : W < 120 ? 140 : 75)) return;
      last = ts;
      if (document.hidden) return;
      const box = canvas.getBoundingClientRect();
      if (!box.width || box.bottom < 0 || box.top > innerHeight || box.right < 0 || box.left > innerWidth) return;
      if (!still) t += 0.075;
      if (ts - palAt > 1000) { pal = colours(); palAt = ts; const f = parseFloat(getComputedStyle(el).fontSize) || 10; if (f !== fs) fs = size(); }
      const name = pick(), S = STYLES[name] || STYLES.globe;
      el.dataset.orb = name;
      const cf = fs * 0.62, cw = cf * 0.62, ch = cf * 0.95;
      g.textAlign = "center"; g.textBaseline = "middle";
      const cols = Math.floor(W / cw), rows = Math.floor(H / ch);
      const R = Math.min(W, H) * 0.46, cx = W / 2, cy = H / 2;
      const c = {
        p: pal, t, cx, cy, R,
        text(ch, x, y, col, scale = 1) {
          g.globalAlpha = 1; g.fillStyle = col; g.font = `800 ${cf * scale}px ${pal.font}`; g.fillText(ch, x, y);
        },
        glow(x, y, r, col, a) {
          if (!col || r <= 0) return;
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, col); gr.addColorStop(1, "transparent");
          g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1;
        },
      };
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      if (S.under) S.under(c);
      g.font = `700 ${cf}px ${pal.font}`; g.textAlign = "center"; g.textBaseline = "middle";
      for (let row = 0; row < rows; row++) {
        const py = (row + 0.5) * ch + (H - rows * ch) / 2, v = (py - cy) / R;
        for (let col = 0; col < cols; col++) {
          const px = (col + 0.5) * cw + (W - cols * cw) / 2, u = (px - cx) / R;
          const r = Math.hypot(u, v);
          if (r > 1.3) continue;
          const out = S.cell(u, v, r, t, c);
          if (!out || out[0] === " ") continue;
          g.globalAlpha = clamp(out[2]); g.fillStyle = out[1] || pal.signal; g.fillText(out[0], px, py);
        }
      }
      g.globalAlpha = 1;
      if (S.over) S.over(c);
    };
    raf = requestAnimationFrame(frame);
    return () => { alive = false; cancelAnimationFrame(raf); };
  }

  return { start, STYLES, list: Object.keys(STYLES) };
})();
