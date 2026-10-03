// Umbra Wiki start-screen backgrounds, chosen in Settings. Each one draws
// ASCII glyphs on the canvas behind the globe and title (and, for Saturn
// rings, on a second canvas in front of the globe), in the theme's colours.
// app.js's startRain() runs the chosen one at ~16 frames a second.
//
// A background is make(env) → { resize(), frame(t) }; env gives the two
// 2D contexts, the size (w, h), the theme colours (c) and the globe's
// centre and radius (orb()).
"use strict";

(() => {
  const RAIN = "アイウエオカキクケコサシスセソ0123456789ABCDEFGHJKLMNPQRSTUVWXYZ#$%&*+=<>?/".split("");
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (s) => s[(Math.random() * s.length) | 0];

  // Digital rain, falling (or rising): columns of glyphs whose trails fade.
  const rain = (dir) => (env) => {
    const size = 14;
    let cols = [];
    return {
      resize() {
        cols = Array.from({ length: Math.ceil(env.w / size) }, () => ({ y: dir > 0 ? rnd(-env.h, 0) : rnd(env.h, 2 * env.h), speed: rnd(0.6, 1.5) }));
      },
      frame() {
        const { ctx, w, h, c } = env;
        ctx.fillStyle = c.bg + "2e";   // translucent: older glyphs fade
        ctx.fillRect(0, 0, w, h);
        ctx.font = `${size}px ${c.font}`;
        cols.forEach((col, i) => {
          ctx.fillStyle = Math.random() < 0.08 ? c.signal : c.shade2;
          ctx.fillText(pick(RAIN), i * size, col.y);
          col.y += dir * size * col.speed;
          if (dir > 0 ? col.y > h + size * 4 : col.y < -size * 4) {
            col.y = dir > 0 ? rnd(-h * 0.5, 0) : rnd(h, h * 1.5);
            col.speed = rnd(0.6, 1.5);
          }
        });
      },
    };
  };

  // A field of stars, each twinkling at its own pace.
  function starField(env, density, dim = 1) {
    let stars = [];
    return {
      resize() {
        stars = Array.from({ length: Math.round((env.w * env.h) / density) }, () => ({
          x: rnd(0, env.w), y: rnd(0, env.h), glyph: pick("··.+*✦"), phase: rnd(0, 6.3), speed: rnd(0.4, 1.8), bright: Math.random() < 0.12,
        }));
      },
      draw(t) {
        const { ctx, c } = env;
        ctx.font = `12px ${c.font}`;
        stars.forEach((s) => {
          ctx.globalAlpha = (0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase))) * dim;
          ctx.fillStyle = s.bright ? c.signal : c.shade1;
          ctx.fillText(s.glyph, s.x, s.y);
        });
        ctx.globalAlpha = 1;
      },
    };
  }

  // Starfield with the occasional shooting star.
  const stars = (env) => {
    const field = starField(env, 1700);
    let shooting = null;
    return {
      resize: field.resize,
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        field.draw(t);
        if (!shooting && Math.random() < 0.012) shooting = { x: rnd(0, w * 0.7), y: rnd(0, h * 0.4), life: 0 };
        if (shooting) {
          shooting.life += 1;
          for (let i = 0; i < 9; i++) {
            const k = shooting.life - i * 0.6;
            if (k < 0) continue;
            ctx.globalAlpha = Math.max(0, (1 - i / 9) * (1 - shooting.life / 22));
            ctx.fillStyle = i === 0 ? c.signal : c.shade1;
            ctx.fillText(i === 0 ? "✦" : "·", shooting.x + k * 16, shooting.y + k * 7);
          }
          if (shooting.life > 22) shooting = null;
          ctx.globalAlpha = 1;
        }
      },
    };
  };

  // Saturn rings: four bands of glyphs orbiting the globe, tilted; the near
  // half is drawn on the front canvas, the far half behind the globe.
  const rings = (env) => {
    const field = starField(env, 1700, 0.45);
    let parts = [];
    return {
      resize() {
        field.resize();
        parts = [[1.4, 0.9, 120], [1.7, 0.7, 170], [2.1, 0.5, 150], [2.45, 0.38, 100]].flatMap(([radius, speed, count]) =>
          Array.from({ length: count }, () => ({ a: rnd(0, 6.3), radius: radius + rnd(-0.04, 0.04), speed })));
      },
      frame(t) {
        const { ctx, fctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        fctx.clearRect(0, 0, w, h);
        field.draw(t);
        const o = env.orb();
        if (!o) return;
        const tilt = -0.32, cos = Math.cos(tilt), sin = Math.sin(tilt);
        fctx.font = ctx.font = `12px ${c.font}`;
        parts.forEach((p) => {
          p.a += p.speed * 0.02;
          const x0 = Math.cos(p.a) * o.r * p.radius, y0 = Math.sin(p.a) * o.r * p.radius * 0.28;
          const x = o.x + x0 * cos - y0 * sin, y = o.y + x0 * sin + y0 * cos;
          const depth = Math.sin(p.a), near = depth > 0;
          if (!near && Math.hypot(x - o.x, y - o.y) < o.r * 0.95) return;   // behind the globe
          const g = near ? fctx : ctx;
          g.globalAlpha = 0.45 + 0.55 * (depth + 1) / 2;
          g.fillStyle = near && Math.random() < 0.3 ? c.signal : c.shade1;
          g.fillText(near ? (depth > 0.6 ? "●" : "•") : depth < -0.6 ? "·" : "∙", x - 3, y + 4);
        });
        ctx.globalAlpha = fctx.globalAlpha = 1;
      },
    };
  };

  // Night forest: two ranges of pines on the horizon, drifting fog and
  // fireflies wandering and blinking between the trees.
  const forest = (env) => {
    const field = starField(env, 3200, 0.6);
    let trees = [], flies = [], fog = [];
    const cell = 9;
    // A pine in tiers: each tier widens, then the next starts narrower.
    const treeRows = (tiers) => {
      const rows = ["^"];
      for (let t = 0; t < tiers; t++) for (let r = 1; r <= 2 + (t > 0); r++) rows.push("/" + ":".repeat(t + r * 2 - 1) + "\\");
      rows.push("|");
      return rows;
    };
    return {
      resize() {
        field.resize();
        const { w, h } = env;
        const horizon = h * 0.62;
        trees = [];
        for (const [layer, count, min, max] of [[0, Math.ceil(w / 26), 1, 2], [1, Math.ceil(w / 44), 2, 3]]) {
          for (let i = 0; i < count; i++) {
            const tiers = Math.round(rnd(min, max));
            trees.push({ layer, x: (i + rnd(-0.35, 0.35)) * (w / count), base: horizon + layer * 18 + rnd(-6, 6), rows: treeRows(tiers) });
          }
        }
        trees.sort((a, b) => a.layer - b.layer);
        flies = Array.from({ length: Math.round(w / 45) }, () => ({ x: rnd(0, w), y: rnd(h * 0.3, horizon + 20), phase: rnd(0, 6.3), speed: rnd(0.5, 1.2) }));
        fog = Array.from({ length: 4 }, (_, i) => ({ y: horizon - 18 + i * 12, offset: rnd(0, 100), speed: rnd(0.2, 0.6) * (i % 2 ? 1 : -1) }));
      },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        field.draw(t);
        ctx.font = `${cell + 3}px ${c.font}`;
        ctx.textAlign = "center";
        trees.forEach((tr) => {
          ctx.fillStyle = tr.layer ? c.shade2 : c.shade3;
          ctx.globalAlpha = tr.layer ? 0.75 : 0.5;
          tr.rows.forEach((row, r) => ctx.fillText(row, tr.x, tr.base - (tr.rows.length - r) * cell * 1.15));
        });
        ctx.textAlign = "left";
        // Fog drifts sideways in soft bands.
        ctx.font = `12px ${c.font}`;
        fog.forEach((f) => {
          f.offset += f.speed;
          ctx.globalAlpha = 0.18;
          ctx.fillStyle = c.dim;
          const line = "~ ~~ ~~~ ~ ~~ ".repeat(Math.ceil(w / 90) + 2);
          ctx.fillText(line, (f.offset % 90) - 90, f.y);
        });
        // Fireflies wander and blink.
        flies.forEach((f) => {
          f.x += Math.sin(t * 0.7 + f.phase) * 0.8 * f.speed;
          f.y += Math.cos(t * 0.5 + f.phase * 1.3) * 0.5 * f.speed;
          const glow = Math.max(0, Math.sin(t * 1.6 * f.speed + f.phase));
          ctx.globalAlpha = glow;
          ctx.fillStyle = c.signal;
          ctx.fillText(glow > 0.7 ? "•" : "·", f.x, f.y);
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // Snowfall: flakes at three depths, drifting on a slowly changing wind.
  const snow = (env) => {
    let flakes = [];
    return {
      resize() {
        flakes = Array.from({ length: Math.round((env.w * env.h) / 2200) }, () => {
          const depth = pick([0, 1, 1, 2, 2, 2]);
          return { x: rnd(0, env.w), y: rnd(0, env.h), depth, phase: rnd(0, 6.3) };
        });
      },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        const wind = Math.sin(t * 0.15) * 0.8;
        flakes.forEach((f) => {
          const speed = [1.6, 1.0, 0.55][f.depth];
          f.y += speed;
          f.x += wind * speed + Math.sin(t + f.phase) * 0.4;
          if (f.y > h + 10) { f.y = -10; f.x = rnd(0, w); }
          if (f.x > w + 10) f.x = -10; else if (f.x < -10) f.x = w + 10;
          ctx.font = `${[15, 12, 10][f.depth]}px ${c.font}`;
          ctx.globalAlpha = [0.95, 0.7, 0.4][f.depth];
          ctx.fillStyle = f.depth === 0 ? c.fgBright : c.shade1;
          ctx.fillText(f.depth === 0 ? "*" : f.depth === 1 ? "+" : "·", f.x, f.y);
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // Northern lights: curtains of glyphs rippling across the sky in the
  // theme's signal and network colours, leaving soft trails.
  const aurora = (env) => {
    const field = starField(env, 2600, 0.5);
    const size = 11;
    return {
      resize: field.resize,
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.fillStyle = c.bg + "40";
        ctx.fillRect(0, 0, w, h);
        field.draw(t);
        ctx.font = `${size}px ${c.font}`;
        for (let x = 0; x < w; x += size) {
          const top = h * 0.12 + Math.sin(x * 0.012 + t * 0.9) * 24 + Math.sin(x * 0.004 - t * 0.5) * 34;
          const len = 5 + 4 * (0.5 + 0.5 * Math.sin(x * 0.02 - t * 1.3));
          const hue = 0.5 + 0.5 * Math.sin(x * 0.006 + t * 0.3);
          for (let k = 0; k < len; k++) {
            if (Math.random() < 0.35) continue;
            ctx.globalAlpha = (1 - k / len) * 0.55 * (0.4 + 0.6 * hue);
            ctx.fillStyle = hue > 0.55 ? c.net : c.signal;
            ctx.fillText(pick("│┃|:'"), x, top + k * size * 1.2);
          }
        }
        ctx.globalAlpha = 1;
      },
    };
  };

  // Campfire embers: sparks rising from below, swaying, flaring and dying.
  const embers = (env) => {
    let sparks = [];
    // They rise from the lower middle, where the start screen is still visible.
    const spawn = () => ({ x: rnd(env.w * 0.08, env.w * 0.92), y: rnd(env.h * 0.42, env.h * 0.62), life: 0, max: rnd(35, 80), speed: rnd(0.9, 2.2), sway: rnd(0, 6.3) });
    return {
      resize() { sparks = Array.from({ length: Math.round(env.w / 7) }, () => ({ ...spawn(), life: rnd(0, 60) })); },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.fillStyle = c.bg + "55";
        ctx.fillRect(0, 0, w, h);
        ctx.font = `12px ${c.font}`;
        sparks.forEach((s, i) => {
          s.life += 1;
          s.y -= s.speed;
          s.x += Math.sin(t * 2 + s.sway) * 0.7;
          const k = s.life / s.max;
          if (k >= 1 || s.y < -10) { sparks[i] = spawn(); return; }
          ctx.globalAlpha = Math.min(1, Math.sin(k * Math.PI) * 1.3) * (0.7 + 0.3 * Math.random());
          ctx.fillStyle = k < 0.3 ? c.signal : c.accent;
          ctx.fillText(k < 0.2 ? "*" : k < 0.6 ? "•" : "·", s.x, s.y);
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // Radar: range rings around the globe, a sweep with a fading wake, and
  // blips that light up when the sweep passes and slowly fade.
  const radar = (env) => {
    let blips = [], angle = 0;
    return {
      resize() {
        blips = Array.from({ length: 14 }, () => ({ a: rnd(0, 6.3), d: rnd(1.3, 3.2), glow: 0 }));
      },
      frame() {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        const o = env.orb();
        if (!o) return;
        angle = (angle + 0.045) % (Math.PI * 2);
        ctx.font = `11px ${c.font}`;
        // Range rings.
        for (const ring of [1.5, 2.3, 3.1]) {
          const r = o.r * ring;
          for (let a = 0; a < 6.28; a += 9 / r) {
            ctx.globalAlpha = 0.45;
            ctx.fillStyle = c.shade1;
            ctx.fillText("·", o.x + Math.cos(a) * r - 2, o.y + Math.sin(a) * r * 0.62 + 3);
          }
        }
        // The sweep and its wake.
        for (let k = 0; k < 14; k++) {
          const a = angle - k * 0.05;
          ctx.globalAlpha = (1 - k / 14) * 0.95;
          ctx.fillStyle = k === 0 ? c.signal : c.shade1;
          for (let d = 1.2; d < 3.3; d += 0.18) {
            ctx.fillText(k === 0 ? "•" : "·", o.x + Math.cos(a) * o.r * d - 2, o.y + Math.sin(a) * o.r * d * 0.62 + 3);
          }
        }
        // Blips.
        blips.forEach((b) => {
          const diff = (angle - b.a + Math.PI * 4) % (Math.PI * 2);
          if (diff < 0.06) b.glow = 1;
          b.glow *= 0.96;
          if (b.glow < 0.05) return;
          ctx.globalAlpha = b.glow;
          ctx.fillStyle = c.accent;
          ctx.fillText(b.glow > 0.6 ? "◉" : "∘", o.x + Math.cos(b.a) * o.r * b.d - 4, o.y + Math.sin(b.a) * o.r * b.d * 0.62 + 4);
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // ---------------------------------------------------------------- helpers

  // An offscreen picture painted once per size and theme (the still parts of
  // a scene), so each frame only draws what moves.
  const cached = (env, key, paint) => {
    const k = `${env.w}x${env.h}|${env.c.bg}${env.c.shade1}${env.c.shade2}${env.c.accent}${env.c.red}${env.c.signal}`;
    env.cache = env.cache || {};
    if (!env.cache[key] || env.cache[key].k !== k) {
      const cv = document.createElement("canvas");
      cv.width = env.w; cv.height = env.h;
      paint(cv.getContext("2d"));
      env.cache[key] = { k, cv };
    }
    return env.cache[key].cv;
  };
  // A grid of glyphs drawn fast: one fillText per row and colour, spaces
  // elsewhere (the font is monospaced). cells(x, y) gives [glyph, band] or
  // null; bands are [colour, alpha] pairs.
  const gridText = (ctx, font, size, x0, y0, cols, rows, lineH, cells, bands) => {
    ctx.font = `${size}px ${font}`;
    ctx.textBaseline = "top";
    const lines = bands.map(() => new Array(cols));
    for (let y = 0; y < rows; y++) {
      lines.forEach((l) => l.fill(" "));
      let any = false;
      for (let x = 0; x < cols; x++) {
        const cell = cells(x, y);
        if (cell) { lines[cell[1]][x] = cell[0]; any = true; }
      }
      if (!any) continue;
      bands.forEach(([colour, alpha], b) => {
        const text = lines[b].join("");
        if (!text.trim()) return;
        ctx.globalAlpha = alpha; ctx.fillStyle = colour;
        ctx.fillText(text, x0, y0 + y * lineH);
      });
    }
    ctx.globalAlpha = 1;
    ctx.textBaseline = "alphabetic";
  };
  const charW = (ctx, font, size) => { ctx.font = `${size}px ${font}`; return ctx.measureText("M").width || size * 0.6; };
  const glow = (ctx, x, y, r, colour, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour); g.addColorStop(1, "transparent");
    ctx.globalAlpha = alpha; ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  };

  // ------------------------------------------------------------ calm skies

  // Thunderstorm: slanting rain under rolling clouds, and now and then a
  // forked bolt that lights the whole sky.
  const storm = (env) => {
    let drops = [], bolt = null, flash = 0;
    const strike = () => {
      const { w, h } = env;
      const path = [[rnd(w * 0.15, w * 0.85), 0]];
      const end = rnd(h * 0.55, h * 0.95);
      while (path[path.length - 1][1] < end) {
        const [x, y] = path[path.length - 1];
        path.push([x + rnd(-12, 12), y + rnd(9, 14)]);
      }
      const fork = path[(path.length * rnd(0.25, 0.5)) | 0], branch = [fork];
      for (let i = 0; i < 6; i++) { const [x, y] = branch[branch.length - 1]; branch.push([x + rnd(4, 14) * (fork[0] > w / 2 ? -1 : 1), y + rnd(7, 12)]); }
      return { paths: [path, branch], life: 9 };
    };
    return {
      resize() {
        drops = Array.from({ length: Math.round((env.w * env.h) / 1300) }, () => ({ x: rnd(-env.h * 0.4, env.w), y: rnd(0, env.h), s: rnd(8, 14) }));
      },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        if (!bolt && Math.random() < 0.012) { bolt = strike(); flash = 1; }
        if (flash > 0) { ctx.globalAlpha = flash * 0.16; ctx.fillStyle = c.fgBright; ctx.fillRect(0, 0, w, h); flash *= 0.55; if (flash < 0.03) flash = 0; }
        // Clouds roll along the top.
        ctx.font = `13px ${c.font}`;
        for (let row = 0; row < 4; row++) {
          for (let x = -8; x < w; x += 8) {
            const n = Math.sin(x * 0.013 + row * 1.7 + t * 0.12) + Math.sin(x * 0.031 - t * 0.07 + row);
            if (n < 0.2 + row * 0.35) continue;
            ctx.globalAlpha = Math.min(1, (0.14 + 0.16 * n) * (1 + flash * 4));
            ctx.fillStyle = n > 1.2 ? c.dim : c.shade1;
            const y = 12 + row * 9 + Math.sin(x * 0.05 + row) * 3;
            ctx.fillText(n > 1.1 ? ":" : ".", x, y);
            if (n > 1.3) ctx.fillText(".", x + 4, y - 5);
          }
        }
        ctx.font = `12px ${c.font}`;
        ctx.fillStyle = c.shade2;
        ctx.globalAlpha = 0.55;
        drops.forEach((d) => {
          d.x += d.s * 0.35; d.y += d.s;
          if (d.y > h) { ctx.fillText(".", d.x, h - 2); d.y = rnd(-20, 0); d.x = rnd(-h * 0.4, w); }
          ctx.fillText("\\", d.x, d.y);
        });
        if (bolt) {
          ctx.font = `13px ${c.font}`;
          ctx.globalAlpha = bolt.life / 9;
          bolt.paths.forEach((path, k) => {
            ctx.fillStyle = k ? c.signal : c.fgBright;
            for (let i = 1; i < path.length; i++) {
              const dx = path[i][0] - path[i - 1][0];
              ctx.fillText(dx < -4 ? "/" : dx > 4 ? "\\" : "|", path[i][0], path[i][1]);
            }
          });
          if (bolt.life === 5) flash = 0.7;   // the flicker after the strike
          if (--bolt.life <= 0) bolt = null;
        }
        ctx.globalAlpha = 1;
      },
    };
  };

  // Moonlit sea: a quiet horizon, the Moon, and waves rolling in with its
  // light glittering on the water.
  const tide = (env) => {
    const field = starField(env, 2400, 0.55);
    return {
      resize: field.resize,
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        const horizon = h * 0.5;
        ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, horizon - 8); ctx.clip(); field.draw(t); ctx.restore();
        const mx = w * 0.72, my = h * 0.2, mr = h * 0.09;
        glow(ctx, mx, my, mr * 3, c.fgBright, 0.08);
        ctx.font = `10px ${c.font}`;
        ctx.fillStyle = c.fgBright;
        for (let y = -mr; y <= mr; y += 8) for (let x = -mr; x <= mr; x += 6) {
          const d = Math.hypot(x, y) / mr;
          if (d > 1) continue;
          const crater = Math.sin(x * 0.31 + 1) * Math.sin(y * 0.42 + 2);
          ctx.globalAlpha = 0.55 + 0.45 * (1 - d * d);
          ctx.fillText(d > 0.86 ? "·" : crater > 0.45 ? "o" : crater < -0.5 ? "." : ":", mx + x, my + y);
        }
        ctx.font = `11px ${c.font}`;
        for (let row = 0, y = horizon; y < h + 10; row++, y += 7 + row * 0.9) {
          const near = row / 12, step = 6 + row * 0.4;
          const sparkle = 14 + row * 7;
          for (let x = (row * 13) % step - step; x < w; x += step) {
            const wave = Math.sin(x * (0.05 - near * 0.02) + t * (0.8 + near) + row * 1.3);
            const lit = Math.abs(x - mx) < sparkle * (0.7 + 0.3 * Math.sin(t * 3 + x * 0.2 + row));
            if (!lit && wave < 0.1) continue;
            ctx.globalAlpha = lit ? 0.55 + 0.4 * Math.random() : (0.35 + near * 0.5) * wave;
            ctx.fillStyle = lit ? c.signal : c.shade1;
            ctx.fillText(lit ? (wave > 0.4 ? "=" : "-") : wave > 0.8 ? "~" : "-", x, y);
          }
        }
        ctx.globalAlpha = 1;
      },
    };
  };

  // Sandstorm: dunes under a hazy sun, sand streaming past on gusts.
  const dunes = (env) => {
    let grains = [];
    return {
      resize() {
        grains = Array.from({ length: Math.round(env.w / 3) }, () => ({ x: rnd(0, env.w), y: rnd(0, env.h), s: rnd(3, 9), p: rnd(0, 6.3) }));
      },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.fillStyle = c.bg + "55";
        ctx.fillRect(0, 0, w, h);
        glow(ctx, w * 0.7, h * 0.3, h * 0.35, c.accent, 0.1);
        const art = cached(env, "dunes", (g) => {
          g.font = `11px ${c.font}`;
          [[0.62, 0.008, 22, c.shade3, 0.5], [0.72, 0.012, 18, c.shade2, 0.6], [0.84, 0.006, 26, c.shade1, 0.55]].forEach(([base, f, amp, colour, alpha], layer) => {
            g.fillStyle = colour;
            for (let x = 0; x < w; x += 7) {
              const top = h * base - amp * Math.sin(x * f + layer * 2) - amp * 0.4 * Math.sin(x * f * 2.7 + layer);
              g.globalAlpha = alpha;
              g.fillText(Math.sin(x * f * 3) > 0 ? "_" : "-", x, top);
              for (let y = top + 11; y < h; y += 11) { g.globalAlpha = alpha * 0.5; g.fillText((x + y) % 3 ? "." : ":", x, y); }
            }
          });
        });
        ctx.drawImage(art, 0, 0);
        const gust = 0.6 + 0.6 * Math.max(0, Math.sin(t * 0.35));
        ctx.font = `11px ${c.font}`;
        ctx.fillStyle = c.signal;
        grains.forEach((g) => {
          g.x += g.s * gust; g.y += Math.sin(t * 2 + g.p) * 0.6;
          if (g.x > w + 10) { g.x = -10; g.y = rnd(0, h); }
          ctx.globalAlpha = 0.25 + 0.5 * (g.s / 9) * gust;
          ctx.fillText(g.s > 7 ? "-" : g.s > 5 ? "~" : "·", g.x, g.y);
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // Constellations: stars drifting slowly, joined by dotted lines while
  // they're close.
  const constellations = (env) => {
    let nodes = [];
    return {
      resize() {
        nodes = Array.from({ length: Math.round((env.w * env.h) / 5200) }, () => ({ x: rnd(0, env.w), y: rnd(0, env.h), vx: rnd(-0.25, 0.25), vy: rnd(-0.15, 0.15), p: rnd(0, 6.3) }));
      },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        const reach = Math.min(130, w / 6);
        ctx.font = `10px ${c.font}`;
        ctx.fillStyle = c.shade1;
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j], d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d > reach) continue;
            ctx.globalAlpha = 0.9 * (1 - d / reach);
            const n = Math.floor(d / 9);
            for (let k = 1; k < n; k++) ctx.fillText("·", a.x + (b.x - a.x) * k / n - 2, a.y + (b.y - a.y) * k / n + 3);
          }
        }
        ctx.font = `13px ${c.font}`;
        nodes.forEach((s) => {
          s.x += s.vx; s.y += s.vy;
          if (s.x < -20) s.x = w + 20; else if (s.x > w + 20) s.x = -20;
          if (s.y < -20) s.y = h + 20; else if (s.y > h + 20) s.y = -20;
          const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + s.p);
          ctx.globalAlpha = 0.45 + 0.55 * tw;
          ctx.fillStyle = tw > 0.85 ? c.signal : c.fgBright;
          ctx.fillText(tw > 0.85 ? "✦" : "+", s.x - 4, s.y + 4);
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // ---------------------------------------------------- earned: the cosmos

  // A spiral galaxy turning around the globe: two arms of stars, the inner
  // ones faster, young blue stars and pink nebulae along them.
  const galaxy = (env) => {
    const field = starField(env, 3400, 0.4);
    let stars = [];
    return {
      resize() {
        field.resize();
        stars = Array.from({ length: 1400 }, (_, i) => {
          const r = Math.pow(Math.random(), 0.7) * 0.95 + 0.05, arm = i % 2;
          const scatter = i % 7 === 0 ? rnd(0, 6.3) : rnd(-0.35, 0.35) * (1.2 - r);
          return { r, a: arm * Math.PI + Math.log(r) * 2.4 + scatter, kind: Math.random() };
        });
      },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        field.draw(t);
        const o = env.orb();
        if (!o) return;
        const R = Math.min(w * 0.5, h * 1.45), tilt = -0.22, cos = Math.cos(tilt), sin = Math.sin(tilt);
        glow(ctx, o.x, o.y, o.r * 2.6, c.signal, 0.16);
        ctx.font = `10px ${c.font}`;
        const groups = [[], [], [], []];
        stars.forEach((s) => {
          const a = s.a + t * 0.09 / (0.25 + s.r);
          const x0 = Math.cos(a) * s.r * R, y0 = Math.sin(a) * s.r * R * 0.4;
          const x = o.x + x0 * cos - y0 * sin, y = o.y + x0 * sin + y0 * cos;
          if (Math.hypot(x - o.x, y - o.y) < o.r * 0.95) return;
          groups[s.r < 0.22 ? 0 : s.kind < 0.08 ? 2 : s.kind < 0.12 ? 3 : 1].push([x, y, s.r]);
        });
        [[c.signal, 1], [c.shade1, 0.95], [c.net, 0.9], [c.accent, 0.75]].forEach(([colour, alpha], g) => {
          ctx.fillStyle = colour;
          groups[g].forEach(([x, y, r]) => {
            ctx.globalAlpha = alpha * (1.15 - r);
            ctx.fillText(r < 0.3 ? "*" : g === 3 ? "░" : r < 0.6 ? "+" : "·", x - 3, y + 3);
          });
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // Circuitry: traces etched across the dark, data pulsing along them.
  const circuit = (env) => {
    let traces = [], cell = 12;
    return {
      resize() {
        const { w, h } = env;
        const cols = Math.floor(w / cell), rows = Math.floor(h / cell);
        traces = Array.from({ length: Math.round((cols * rows) / 90) }, () => {
          let x = (Math.random() * cols) | 0, y = (Math.random() * rows) | 0, dir = (Math.random() * 4) | 0;
          const pts = [[x, y]];
          for (let seg = 0; seg < 4; seg++) {
            const len = 2 + ((Math.random() * 7) | 0);
            for (let k = 0; k < len; k++) {
              x += [1, 0, -1, 0][dir]; y += [0, 1, 0, -1][dir];
              if (x < 0 || y < 0 || x >= cols || y >= rows) break;
              pts.push([x, y]);
            }
            dir = (dir + (Math.random() < 0.5 ? 1 : 3)) % 4;
          }
          return { pts, pulse: rnd(0, pts.length), speed: rnd(0.15, 0.45) };
        }).filter((tr) => tr.pts.length > 4);
      },
      frame() {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        const art = cached(env, "circuit", (g) => {
          g.font = `12px ${c.font}`;
          g.fillStyle = c.shade2;
          traces.forEach(({ pts }) => {
            pts.forEach(([x, y], i) => {
              const a = pts[i - 1], b = pts[i + 1];
              const horiz = (p) => p && p[1] === y, vert = (p) => p && p[0] === x;
              let glyph = "─";
              if (!a || !b) glyph = "◘";
              else if (vert(a) && vert(b)) glyph = "│";
              else if (!(horiz(a) && horiz(b))) {
                const up = [a, b].some((p) => p[1] < y), left = [a, b].some((p) => p[0] < x);
                glyph = up ? (left ? "┘" : "└") : (left ? "┐" : "┌");
              }
              g.globalAlpha = glyph === "◘" ? 0.6 : 0.35;
              g.fillText(glyph, x * cell, y * cell + cell);
            });
          });
        });
        ctx.drawImage(art, 0, 0);
        ctx.font = `12px ${c.font}`;
        traces.forEach((tr) => {
          tr.pulse = (tr.pulse + tr.speed) % (tr.pts.length + 8);
          for (let k = 0; k < 6; k++) {
            const p = tr.pts[Math.floor(tr.pulse) - k];
            if (!p) continue;
            ctx.globalAlpha = 1 - k / 6;
            ctx.fillStyle = k ? c.signal : c.net;
            ctx.fillText(k ? "▪" : "■", p[0] * cell, p[1] * cell + cell);
          }
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // Meteor shower: streaks across the stars, some bursting into sparks.
  const meteors = (env) => {
    const field = starField(env, 2000, 0.7);
    let rocks = [], sparks = [];
    return {
      resize() { field.resize(); rocks = []; sparks = []; },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        field.draw(t);
        if (rocks.length < 7 && Math.random() < 0.09) rocks.push({ x: rnd(-w * 0.2, w * 0.8), y: rnd(-30, h * 0.3), v: rnd(8, 15), life: 0, max: rnd(14, 30), tint: pick(["signal", "signal", "net", "accent"]) });
        ctx.font = `12px ${c.font}`;
        rocks = rocks.filter((m) => {
          m.life++; m.x += m.v; m.y += m.v * 0.42;
          for (let i = 0; i < 12; i++) {
            ctx.globalAlpha = (1 - i / 12) * 0.9;
            ctx.fillStyle = i === 0 ? c.fgBright : c[m.tint];
            ctx.fillText(i === 0 ? "●" : i < 4 ? "•" : "·", m.x - i * m.v * 0.5, m.y - i * m.v * 0.21);
          }
          if (m.life > m.max) {
            if (Math.random() < 0.5) for (let k = 0; k < 7; k++) sparks.push({ x: m.x, y: m.y, vx: rnd(-3, 3), vy: rnd(-3, 3), life: 1, tint: m.tint });
            return false;
          }
          return true;
        });
        sparks = sparks.filter((s) => {
          s.x += s.vx; s.y += s.vy; s.life -= 0.07;
          ctx.globalAlpha = Math.max(0, s.life);
          ctx.fillStyle = c[s.tint];
          ctx.fillText("*", s.x, s.y);
          return s.life > 0;
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // ------------------------------------------------ earned: the dark ones

  // Rain of blades: swords fall from a dark sky and bite into the ground,
  // glinting, until a field of them stands there; ash drifts down.
  const blades = (env) => {
    let swords = [], ash = [], sparks = [];
    const make = () => {
      const depth = Math.random();
      return { x: rnd(env.w * 0.05, env.w * 0.95), y: -rnd(40, 300), vy: 0, size: 11 + depth * 8, ground: env.h * (0.6 + depth * 0.34), tilt: rnd(-0.12, 0.12), len: 3 + ((depth * 4) | 0), stuck: 0, glint: -1 };
    };
    const shape = (len) => ["o", "║", "═╬═", ...Array(len).fill("│"), "▼"];
    return {
      resize() {
        swords = Array.from({ length: 6 }, make);
        ash = Array.from({ length: Math.round(env.w / 12) }, () => ({ x: rnd(0, env.w), y: rnd(0, env.h), s: rnd(0.3, 0.9), p: rnd(0, 6.3) }));
      },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        const grad = ctx.createLinearGradient(0, h, 0, h * 0.5);
        grad.addColorStop(0, c.red); grad.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.12; ctx.fillStyle = grad; ctx.fillRect(0, h * 0.5, w, h * 0.5);
        ctx.font = `11px ${c.font}`;
        ctx.fillStyle = c.shade2;
        ctx.globalAlpha = 0.5;
        for (let x = 0; x < w; x += 7) ctx.fillText(Math.sin(x * 0.7) > 0.6 ? "," : "_", x, h * 0.97);
        if (swords.length < 32 && Math.random() < 0.09) swords.push(make());
        swords.sort((a, b) => a.size - b.size);
        ctx.textAlign = "center";
        swords = swords.filter((s) => {
          const rows = shape(s.len), step = s.size * 0.95;
          const tipY = s.y + (rows.length - 1) * step;
          if (!s.stuck) {
            s.vy += 0.9; s.y += s.vy;
            if (s.y + (rows.length - 1) * step >= s.ground) {
              s.y = s.ground - (rows.length - 1) * step; s.stuck = 1;
              for (let k = 0; k < 8; k++) sparks.push({ x: s.x, y: s.ground, vx: rnd(-2.5, 2.5), vy: rnd(-3.5, -0.5), life: 1 });
            }
          } else s.stuck++;
          if (s.stuck > 420) return false;
          if (s.stuck && s.glint < 0 && Math.random() < 0.01) s.glint = 0;
          const fade = s.stuck > 360 ? (420 - s.stuck) / 60 : 1;
          ctx.save();
          ctx.translate(s.x, tipY); ctx.rotate(s.stuck ? s.tilt : 0); ctx.translate(-s.x, -tipY);
          ctx.font = `${s.size}px ${c.font}`;
          rows.forEach((glyph, i) => {
            const blade = i > 2;
            const lit = s.glint >= 0 && Math.abs(i - s.glint) < 1;
            ctx.globalAlpha = (0.5 + s.size / 30) * fade;
            ctx.fillStyle = lit ? c.fgBright : i === 0 ? c.signal : i === 2 ? c.accent : blade ? c.shade1 : c.dim;
            ctx.fillText(glyph, s.x, s.y + i * step);
          });
          ctx.restore();
          if (s.glint >= 0) { s.glint += 0.5; if (s.glint > rows.length) s.glint = -1; }
          return true;
        });
        ctx.textAlign = "left";
        ctx.font = `11px ${c.font}`;
        sparks = sparks.filter((p) => {
          p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life -= 0.06;
          ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = c.signal;
          ctx.fillText("*", p.x, p.y);
          return p.life > 0;
        });
        ctx.fillStyle = c.dim;
        ash.forEach((a) => {
          a.y += a.s; a.x += Math.sin(t + a.p) * 0.4;
          if (a.y > h) { a.y = -5; a.x = rnd(0, w); }
          ctx.globalAlpha = 0.35; ctx.fillText("·", a.x, a.y);
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // Inferno: a wall of fire roaring up behind the title (the classic
  // spreading-heat fire, drawn in glyphs), embers flying out of it.
  const inferno = (env) => {
    const RAMP = " .,:;-=+*#%@", MAX = 36;
    let cols = 0, rows = 0, cw = 7, heat = null, sparks = [];
    return {
      resize() {
        cw = charW(env.ctx, env.c.font || "monospace", 11);
        cols = Math.ceil(env.w / cw) + 2; rows = Math.ceil((env.h * 0.85) / 10);
        heat = new Uint8Array(cols * rows); sparks = [];
      },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        const grad = ctx.createLinearGradient(0, h, 0, h * 0.25);
        grad.addColorStop(0, c.red); grad.addColorStop(1, "transparent");
        ctx.globalAlpha = 0.22; ctx.fillStyle = grad; ctx.fillRect(0, h * 0.25, w, h * 0.75); ctx.globalAlpha = 1;
        const last = (rows - 1) * cols;
        for (let x = 0; x < cols; x++) heat[last + x] = Math.random() < 0.82 ? MAX - ((Math.random() * 5) | 0) : 14;
        const wind = Math.round(Math.sin(t * 0.4));
        for (let y = 1; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            const src = y * cols + x, r = (Math.random() * 3) | 0;
            const dx = Math.min(cols - 1, Math.max(0, x - r + 1 + (Math.random() < 0.3 ? wind : 0)));
            heat[(y - 1) * cols + dx] = Math.max(0, heat[src] - r - (Math.random() < 0.42 ? 1 : 0));
          }
        }
        const top = h - rows * 10;
        gridText(ctx, c.font, 11, -cw, top, cols, rows, 10, (x, y) => {
          const v = heat[y * cols + x];
          if (v < 6) return null;
          return [RAMP[Math.min(RAMP.length - 1, (v * RAMP.length / MAX) | 0)], v > 31 ? 0 : v > 23 ? 1 : v > 13 ? 2 : 3];
        }, [[c.fgBright, 0.9], [c.signal, 0.85], [c.accent, 0.75], [c.red, 0.6]]);
        if (Math.random() < 0.6) sparks.push({ x: rnd(0, w), y: top + rnd(0, rows * 5), vx: rnd(-1, 1), vy: rnd(-3.5, -1.5), life: 1 });
        ctx.font = `11px ${c.font}`;
        sparks = sparks.filter((s) => {
          s.x += s.vx + Math.sin(t * 3 + s.y * 0.05) * 0.5; s.y += s.vy; s.life -= 0.02;
          ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.life > 0.6 ? c.signal : c.red;
          ctx.fillText(s.life > 0.5 ? "*" : "·", s.x, s.y);
          return s.life > 0 && s.y > -10;
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // Burning skulls: two great skulls either side of the title, fire pouring
  // up out of their eyes, jaws that clack now and then, and a ring of small
  // skulls circling the globe.
  const SKULL = [
    "     .-''''''-.     ",
    "   .'          '.   ",
    "  /              \\  ",
    " |                | ",
    " |  .---.  .---.  | ",
    " | /     \\/     \\ | ",
    " | \\  *  /\\  *  / | ",
    " |  '---'  '---'  | ",
    "  \\      /\\      /  ",
    "   '.   /__\\   .'   ",
    "    |\\        /|    ",
    "    | |=|=|=|=| |   ",
    "     \\'-'-'-'-'/    ",
    "      '-------'     ",
  ];
  const skulls = (env) => {
    let flames = [], heads = [], embers = [];
    return {
      resize() {
        const { w, h } = env;
        const size = Math.max(10, Math.min(22, (h * 0.8) / SKULL.length));
        const cw = charW(env.ctx, env.c.font || "monospace", size);
        heads = [0.17, 0.83].map((fx, i) => {
          const x0 = w * fx - (SKULL[0].length * cw) / 2, y0 = h * 0.1;
          const eyes = [];
          SKULL.forEach((row, r) => [...row].forEach((ch, k) => { if (ch === "*") eyes.push([x0 + k * cw + cw / 2, y0 + r * size + size * 0.5]); }));
          return { x0, y0, size, cw, eyes, clack: 0, next: 60 + i * 50 };
        });
        flames = []; embers = Array.from({ length: Math.round(w / 14) }, () => ({ x: rnd(0, w), y: rnd(0, h), s: rnd(0.3, 1), p: rnd(0, 6.3) }));
      },
      frame(t) {
        const { ctx, fctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h); fctx.clearRect(0, 0, w, h);
        ctx.font = `11px ${c.font}`;
        embers.forEach((e) => {
          e.y -= e.s; e.x += Math.sin(t + e.p) * 0.5;
          if (e.y < -5) { e.y = h + 5; e.x = rnd(0, w); }
          ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 2 + e.p); ctx.fillStyle = c.red;
          ctx.fillText("·", e.x, e.y);
        });
        heads.forEach((s) => {
          if (--s.next <= 0) { s.clack = 6; s.next = 50 + Math.random() * 90; }
          const jaw = s.clack > 0 ? s.size * 0.4 * Math.sin((s.clack-- / 6) * Math.PI) : 0;
          s.eyes.forEach(([x, y]) => glow(ctx, x, y, s.size * 3, c.red, 0.35 + 0.15 * Math.sin(t * 5 + x)));
          ctx.font = `${s.size}px ${c.font}`;
          ctx.fillStyle = c.dim;
          ctx.globalAlpha = 0.85;
          SKULL.forEach((row, r) => ctx.fillText(row.replace(/\*/g, " "), s.x0, s.y0 + r * s.size + s.size * 0.8 + (r >= 9 ? jaw : 0)));
          s.eyes.forEach(([x, y]) => {
            ctx.globalAlpha = 0.8 + 0.2 * Math.random(); ctx.fillStyle = Math.random() < 0.5 ? c.signal : c.accent;
            ctx.textAlign = "center"; ctx.fillText("●", x, y + s.size * 0.35); ctx.textAlign = "left";
            for (let k = 0; k < 2; k++) flames.push({ x: x + rnd(-s.cw * 0.6, s.cw * 0.6), y, vx: rnd(-0.4, 0.4), vy: rnd(-2.4, -1.2), life: 1, size: s.size });
          });
        });
        flames = flames.filter((f) => {
          f.x += f.vx + Math.sin(t * 6 + f.y * 0.1) * 0.4; f.y += f.vy; f.life -= 0.045;
          ctx.font = `${Math.round(f.size * 0.8)}px ${c.font}`;
          ctx.globalAlpha = Math.max(0, f.life);
          ctx.fillStyle = f.life > 0.8 ? c.fgBright : f.life > 0.55 ? c.signal : f.life > 0.3 ? c.accent : c.red;
          ctx.fillText(f.life > 0.7 ? "^" : f.life > 0.4 ? "'" : ".", f.x, f.y);
          return f.life > 0;
        });
        const o = env.orb();
        if (o) {
          const tilt = -0.18, cos = Math.cos(tilt), sin = Math.sin(tilt);
          // Small skulls, drawn as shapes so they take the theme's colours.
          const mini = (g, x, y, r, bone, eyes) => {
            g.fillStyle = bone;
            g.beginPath(); g.arc(x, y, r, Math.PI * 0.85, Math.PI * 2.15); g.fill();
            g.fillRect(x - r * 0.55, y, r * 1.1, r * 0.9);
            g.fillStyle = eyes;
            g.beginPath(); g.arc(x - r * 0.38, y + r * 0.05, r * 0.28, 0, 7); g.arc(x + r * 0.38, y + r * 0.05, r * 0.28, 0, 7); g.fill();
            g.fillRect(x - r * 0.06, y + r * 0.45, r * 0.12, r * 0.45);
          };
          for (let i = 0; i < 12; i++) {
            const a = t * 0.35 + (i / 12) * Math.PI * 2;
            const x0 = Math.cos(a) * o.r * 1.6, y0 = Math.sin(a) * o.r * 0.42;
            const near = Math.sin(a) > 0, g = near ? fctx : ctx;
            g.globalAlpha = near ? 0.9 : 0.4;
            mini(g, o.x + x0 * cos - y0 * sin, o.y + x0 * sin + y0 * cos, near ? 5 : 4, c.dim, i % 3 === 0 ? c.red : c.bg);
          }
        }
        ctx.globalAlpha = fctx.globalAlpha = 1;
      },
    };
  };

  // The Reaper: a hooded figure towers at the side, eyes burning in the dark
  // of its hood, its scythe arched over the globe; fog rolls along the
  // ground and crows circle.
  const reaper = (env) => {
    let crows = [], ash = [];
    // How each spot of the figure looks, in units of the scene's height
    // from the figure's centre line: [shade 0..1] or null.
    const seg = (u, v, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay, k = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
      return Math.hypot(u - ax - dx * k, v - ay - dy * k);
    };
    const shapeAt = (u, v) => {
      // The scythe's blade, curving out over the globe.
      if (u > 0.15 && u < 0.72) {
        const s = (u - 0.15) / 0.57, top = 0.04 + 0.05 * s + 0.24 * Math.pow(s, 2), width = 0.065 * Math.pow(1 - s, 0.7) + 0.006;
        if (v >= top && v <= top + width) return v > top + width - 0.012 ? ["=", 2] : ["#", 1];
      }
      if (seg(u, v, 0.3, 1.04, 0.15, 0.0) < 0.011) return ["|", 1];                          // the staff
      if (Math.hypot(u - 0.226, v - 0.5) < 0.024) return ["@", 2];                             // a bony hand
      if (seg(u, v, 0.07, 0.4, 0.22, 0.5) < 0.035 + 0.012 * (0.22 - u) / 0.15) return [":", 0]; // the sleeve
      const hood = ((u / 0.125) ** 2 + ((v - 0.22) / 0.16) ** 2 < 1) || (v > 0.0 && v < 0.12 && Math.abs(u + 0.02 * (0.12 - v) / 0.12) < (v - 0.0) * 0.9);
      if (hood) {
        if (((u - 0.004) / 0.072) ** 2 + ((v - 0.245) / 0.1) ** 2 < 1) return null;              // the dark of the face
        return [u / 0.125 * 0.4 - (v - 0.2) * 1.5 > 0 ? "%" : "#", 0];
      }
      if (v > 0.3 && v < 1.04) {
        const hw = 0.11 + (v - 0.3) * 0.3, x = u + 0.02 * Math.sin(v * 9);
        if (Math.abs(x) < hw && v < 1.0 - 0.03 * Math.abs(Math.sin(u * 60))) {
          const fold = Math.sin(u * 95 + v * 4);
          return [fold > 0.55 ? "|" : fold > -0.2 ? "#" : "%", 0];
        }
      }
      return null;
    };
    return {
      resize() {
        const { w, h } = env;
        crows = Array.from({ length: 6 }, (_, i) => ({ a: (i / 6) * 6.3, r: rnd(0.6, 1), s: rnd(0.012, 0.02), y: rnd(0.1, 0.35) }));
        ash = Array.from({ length: Math.round(w / 16) }, () => ({ x: rnd(0, w), y: rnd(0, h), s: rnd(0.2, 0.6), p: rnd(0, 6.3) }));
      },
      frame(t) {
        const { ctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h);
        const H = h, cx = w * 0.22, size = 9, line = 9;
        const art = cached(env, "reaper", (g) => {
          const cw = charW(g, c.font, size);
          const u0 = -0.45, cols = Math.ceil((1.25 * H) / cw), rows = Math.ceil((1.08 * H) / line);
          gridText(g, c.font, size, cx + u0 * H, -0.03 * H, cols, rows, line, (x, y) =>
            shapeAt(u0 + (x * cw) / H, -0.03 + (y * line) / H), [[c.shade1, 0.95], [c.dim, 0.85], [c.fgBright, 0.7]]);
        });
        ctx.drawImage(art, 0, 0);
        // The eyes burn in the hood.
        const flare = 0.6 + 0.4 * Math.max(0, Math.sin(t * 0.8)) + 0.1 * Math.random();
        [[-0.028, 0.24], [0.034, 0.24]].forEach(([u, v]) => {
          const x = cx + u * H, y = v * H;
          glow(ctx, x, y, 16 * flare, c.red, 0.55);
          ctx.globalAlpha = flare; ctx.fillStyle = c.signal; ctx.font = `10px ${c.font}`;
          ctx.textAlign = "center"; ctx.fillText("•", x, y + 3); ctx.textAlign = "left";
        });
        // A glint runs along the blade's edge.
        const s = (t * 0.25) % 1.8;
        if (s < 1) {
          const u = 0.15 + s * 0.57, v = 0.04 + 0.05 * s + 0.24 * Math.pow(s, 2) + 0.065 * Math.pow(1 - s, 0.7);
          ctx.globalAlpha = 0.9; ctx.fillStyle = c.fgBright; ctx.font = `12px ${c.font}`;
          ctx.fillText("✦", cx + u * H - 4, v * H + 4);
        }
        // Fog along the ground.
        ctx.font = `12px ${c.font}`;
        for (let i = 0; i < 4; i++) {
          ctx.globalAlpha = 0.16; ctx.fillStyle = c.dim;
          ctx.fillText("~ ~~ ~~~ ~ ~~ ".repeat(Math.ceil(w / 90) + 2), ((t * (8 + i * 5) * (i % 2 ? 1 : -1)) % 90) - 90, h * (0.84 + i * 0.045));
        }
        // Crows circling over the far side.
        crows.forEach((cr, i) => {
          cr.a += cr.s;
          const x = w * 0.7 + Math.cos(cr.a) * w * 0.2 * cr.r, y = h * cr.y + Math.sin(cr.a * 2) * h * 0.06;
          ctx.globalAlpha = 0.7; ctx.fillStyle = c.shade1; ctx.font = `12px ${c.font}`;
          ctx.fillText(Math.sin(t * 6 + i) > 0 ? "v" : "~", x, y);
        });
        ctx.fillStyle = c.dim;
        ash.forEach((a) => {
          a.y += a.s; a.x += Math.sin(t + a.p) * 0.3;
          if (a.y > h) { a.y = -5; a.x = rnd(0, w); }
          ctx.globalAlpha = 0.3; ctx.fillText("·", a.x, a.y);
        });
        ctx.globalAlpha = 1;
      },
    };
  };

  // Event horizon: the globe as the dark heart of a black hole. A blazing
  // disk whirls around it, its far side bent up over the top by gravity, a
  // thin ring of light hugs the edge, and stars spiral in and vanish.
  const horizon = (env) => {
    let disk = [], infall = [];
    const respawn = (p) => { p.r = rnd(2.6, 4.5); p.a = rnd(0, 6.3); return p; };
    return {
      resize() {
        disk = Array.from({ length: 900 }, () => ({ a: rnd(0, 6.3), r: 1.25 + Math.pow(Math.random(), 1.6) * 1.5 }));
        infall = Array.from({ length: 160 }, () => respawn({}));
      },
      frame(t) {
        const { ctx, fctx, w, h, c } = env;
        ctx.fillStyle = c.bg + "66"; ctx.fillRect(0, 0, w, h);
        fctx.clearRect(0, 0, w, h);
        const o = env.orb();
        if (!o) return;
        ctx.font = fctx.font = `11px ${c.font}`;
        ctx.fillStyle = c.shade1;
        infall.forEach((p) => {
          p.a += 0.06 / Math.pow(p.r, 1.5); p.r -= 0.012 / p.r;
          if (p.r < 1.05) respawn(p);
          ctx.globalAlpha = Math.min(1, (4.5 - p.r) / 2) * 0.7;
          ctx.fillText(p.r < 1.6 ? "-" : "·", o.x + Math.cos(p.a) * o.r * p.r * 1.3, o.y + Math.sin(p.a) * o.r * p.r * 0.75);
        });
        glow(ctx, o.x, o.y, o.r * 2.4, c.accent, 0.22);
        const tilt = -0.12, cos = Math.cos(tilt), sin = Math.sin(tilt);
        const tint = (r) => (r < 1.45 ? c.fgBright : r < 1.8 ? c.signal : r < 2.3 ? c.accent : c.red);
        disk.forEach((p) => {
          p.a += 0.05 / Math.pow(p.r, 1.5);
          const ca = Math.cos(p.a), sa = Math.sin(p.a);
          const x0 = ca * o.r * p.r, y0 = sa * o.r * p.r * 0.2;
          const x = o.x + x0 * cos - y0 * sin, y = o.y + x0 * sin + y0 * cos;
          const near = sa > 0, doppler = 0.55 + 0.45 * ca;   // the side coming towards us is brighter
          if (!near && Math.hypot(x - o.x, y - o.y) < o.r) return;
          const g = near ? fctx : ctx;
          g.globalAlpha = Math.min(1, (0.35 + 0.65 * doppler) * (2.9 - p.r) / 1.4);
          g.fillStyle = tint(p.r);
          g.fillText(p.r < 1.6 ? "=" : "-", x - 3, y + 4);
          // The far side, bent by gravity into an arc over the top (and a
          // faint one under the bottom).
          if (!near) {
            const rr = o.r * (1.08 + (p.r - 1.25) * 0.35);
            ctx.globalAlpha *= 0.8;
            ctx.fillText("·", o.x + ca * rr - 2, o.y - Math.abs(sa) * rr * 1.05 + 3);
            ctx.globalAlpha *= 0.35;
            ctx.fillText("·", o.x + ca * rr * 0.95 - 2, o.y + Math.abs(sa) * rr + 3);
          }
        });
        // The photon ring.
        ctx.fillStyle = c.fgBright;
        for (let a = 0; a < 6.28; a += 0.09) {
          ctx.globalAlpha = 0.35 + 0.35 * Math.sin(a * 3 + t * 4);
          ctx.fillText("·", o.x + Math.cos(a) * o.r * 1.03 - 2, o.y + Math.sin(a) * o.r * 1.03 + 3);
        }
        ctx.globalAlpha = fctx.globalAlpha = 1;
      },
    };
  };

  // The Watching Eye: a giant eye opens around the globe, which becomes its
  // pupil. Bloodshot, lashed, it blinks slowly and never stops watching.
  const eye = (env) => {
    let open = 1, blink = -1, wait = 90, veins = [];
    const lens = (dx, A) => Math.max(0, 1 - (dx / A) ** 2);
    return {
      resize() {
        const o = env.orb() || { x: env.w / 2, y: env.h / 2, r: env.h * 0.2 };
        const A = Math.min(env.w * 0.46, o.r * 3.2), B = o.r * 1.45;
        veins = Array.from({ length: 18 }, (_, i) => {
          const side = i % 2 ? 1 : -1;
          let x = side * rnd(A * 0.55, A * 0.95), y = rnd(-0.6, 0.6) * B * lens(x, A);
          const pts = [];
          for (let k = 0; k < 14; k++) {
            pts.push([x, y]);
            const d = Math.hypot(x, y);
            if (d < o.r * 1.4) break;
            x -= (x / d) * 7 + rnd(-3, 3); y -= (y / d) * 4 + rnd(-4, 4);
          }
          return pts;
        });
      },
      frame(t) {
        const { ctx, fctx, w, h, c } = env;
        ctx.clearRect(0, 0, w, h); fctx.clearRect(0, 0, w, h);
        const o = env.orb();
        if (!o) return;
        const A = Math.min(w * 0.46, o.r * 3.2), B = o.r * 1.45;
        if (blink < 0 && --wait <= 0) blink = 0;
        if (blink >= 0) { blink += 1; open = Math.abs(Math.cos((blink / 14) * Math.PI)); if (blink >= 14) { blink = -1; open = 1; wait = 110 + Math.random() * 120; } }
        glow(ctx, o.x, o.y, A * 1.05, c.red, 0.12);
        const art = cached(env, "eye", (g) => {
          const size = 10, cw = charW(g, c.font, size);
          const cols = Math.ceil((A * 2) / cw) + 2, rows = Math.ceil((B * 2) / size) + 2;
          const x0 = o.x - A - cw, y0 = o.y - B - size;
          gridText(g, c.font, size, x0, y0, cols, rows, size, (cx, cy) => {
            const dx = x0 + cx * cw + cw / 2 - o.x, dy = y0 + cy * size + size / 2 - o.y;
            if (Math.abs(dy) > B * lens(dx, A)) return null;
            const d = Math.hypot(dx, dy);
            if (d < o.r * 0.98) return null;
            if (d < o.r * 1.36) {
              const a = ((Math.atan2(dy, dx) + Math.PI) / Math.PI) * 4;
              return ["-\\|/-\\|/"[Math.round(a) % 8], Math.sin(Math.atan2(dy, dx) * 9) > 0 ? 1 : 2];
            }
            const edge = 1 - Math.abs(dy) / (B * lens(dx, A) + 1);
            return [edge < 0.25 ? ":" : "·", 0];
          }, [[c.shade1, 0.45], [c.accent, 0.85], [c.signal, 0.8]]);
          g.font = `10px ${c.font}`;
          g.fillStyle = c.red;
          veins.forEach((pts) => pts.forEach(([x, y], k) => {
            g.globalAlpha = 0.25 + 0.5 * (k / pts.length);
            g.fillText(k % 2 ? "~" : "-", o.x + x - 3, o.y + y + 3);
          }));
        });
        const lidUp = (dx) => o.y - B * open * lens(dx, A), lidDown = (dx) => o.y + B * (0.15 + 0.85 * open) * lens(dx, A);
        ctx.save();
        ctx.beginPath();
        for (let dx = -A; dx <= A; dx += 6) ctx.lineTo(o.x + dx, lidUp(dx));
        for (let dx = A; dx >= -A; dx -= 6) ctx.lineTo(o.x + dx, lidDown(dx));
        ctx.clip();
        ctx.drawImage(art, 0, 0);
        ctx.restore();
        if (open < 0.6) {
          // The upper lid comes down over the globe, too.
          fctx.save(); fctx.beginPath();
          for (let dx = -A; dx <= A; dx += 6) fctx.lineTo(o.x + dx, o.y - B * lens(dx, A) - 4);
          for (let dx = A; dx >= -A; dx -= 6) fctx.lineTo(o.x + dx, lidUp(dx));
          fctx.fillStyle = c.bg; fctx.globalAlpha = 0.92; fctx.fill(); fctx.restore();
        }
        // Lids and lashes.
        const g = open < 0.6 ? fctx : ctx;
        g.font = `12px ${c.font}`;
        g.textAlign = "center";
        for (let dx = -A; dx <= A; dx += 7) {
          const k = dx / A, y = lidUp(dx);
          g.globalAlpha = 0.85; g.fillStyle = c.shade1;
          g.fillText(Math.abs(k) > 0.7 ? (k < 0 ? "/" : "\\") : "_", o.x + dx, y + 2);
          g.fillText("‾", o.x + dx, lidDown(dx) + 6);
          if (Math.abs(k) < 0.85 && Math.round(dx / 7) % 2 === 0) {
            g.globalAlpha = 0.7; g.fillStyle = c.dim;
            g.fillText(k < -0.25 ? "\\" : k > 0.25 ? "/" : "|", o.x + dx * 1.04, y - 9);
          }
        }
        g.textAlign = "left";
        ctx.globalAlpha = fctx.globalAlpha = 1;
      },
    };
  };

  // ---------------------------------------------------------------- the list

  // Every background, in the order Settings and the Locker show them. Which
  // ones are yours (and how to earn the rest) comes from the achievements.
  window.UmbraBackgrounds = {
    list: [["rain", "Digital rain"], ["rise", "Rising rain"], ["rings", "Saturn rings"], ["stars", "Starfield"],
           ["forest", "Night forest"], ["snow", "Snowfall"], ["aurora", "Northern lights"], ["embers", "Campfire embers"],
           ["radar", "Radar sweep"], ["storm", "Thunderstorm"], ["tide", "Moonlit sea"], ["dunes", "Sandstorm"],
           ["constellations", "Constellations"], ["galaxy", "Spiral galaxy"], ["meteors", "Meteor shower"], ["circuit", "Circuitry"],
           ["blades", "Rain of blades"], ["inferno", "Inferno"], ["skulls", "Burning skulls"], ["reaper", "The Reaper"],
           ["eye", "The Watching Eye"], ["horizon", "Event horizon"], ["none", "None"]],
    make: { rain: rain(1), rise: rain(-1), rings, stars, forest, snow, aurora, embers, radar,
            storm, tide, dunes, constellations, galaxy, meteors, circuit, blades, inferno, skulls, reaper, eye, horizon },
    // A live (or still) miniature for the Locker: the scene drawn at full
    // start-screen size and scaled down, with a stand-in for the globe.
    preview(canvas, id, { still = false } = {}) {
      const make = this.make[id];
      const out = canvas.getContext("2d");
      const W = 860, H = 330;
      const back = document.createElement("canvas"), front = document.createElement("canvas");
      back.width = front.width = W; back.height = front.height = H;
      const env = { ctx: back.getContext("2d"), fctx: front.getContext("2d"), w: W, h: H, c: colours(), orb: () => ({ x: W / 2, y: H * 0.3, r: H * 0.21 }) };
      const scene = make ? make(env) : null;
      if (scene) scene.resize();
      let t = 0, raf = 0, last = 0, stopped = false;
      const paint = () => {
        const cw = canvas.width = canvas.clientWidth || 160, ch = canvas.height = canvas.clientHeight || 62;
        out.clearRect(0, 0, cw, ch);
        const k = Math.max(cw / W, ch / H), dx = (cw - W * k) / 2, dy = (ch - H * k) / 2;
        out.drawImage(back, dx, dy, W * k, H * k);
        const o = env.orb();
        out.globalAlpha = 0.9; out.fillStyle = env.c.shade3 || "#333";
        out.beginPath(); out.arc(dx + o.x * k, dy + o.y * k, o.r * k * 0.95, 0, Math.PI * 2); out.fill();
        out.globalAlpha = 1;
        out.drawImage(front, dx, dy, W * k, H * k);
      };
      const step = () => { t += 0.06; env.c = colours(); if (scene) scene.frame(t); };
      if (still) {
        // A dozen and a half frames in, so the scene has filled the sky.
        // Stills are drawn one at a time, so a grid of them stays quick.
        // Each still is kept, so the Locker opens instantly the next time.
        const key = `${id}|${env.c.bg}${env.c.signal}${env.c.accent}|${canvas.clientWidth}x${canvas.clientHeight}`;
        const kept = stillCache.get(key);
        if (kept) {
          canvas.width = kept.width; canvas.height = kept.height;
          out.drawImage(kept, 0, 0);
          return () => {};
        }
        stillQueue.push(() => {
          if (stopped) return;
          for (let i = 0; i < 18; i++) step();
          paint();
          const copy = document.createElement("canvas");
          copy.width = canvas.width; copy.height = canvas.height;
          copy.getContext("2d").drawImage(canvas, 0, 0);
          stillCache.set(key, copy);
        });
        runStills();
        return () => { stopped = true; };
      }
      for (let i = 0; i < 24; i++) step();
      const loop = (ts) => { raf = requestAnimationFrame(loop); if (ts - last < 60) return; last = ts; step(); paint(); };
      raf = requestAnimationFrame(loop);
      return () => { stopped = true; cancelAnimationFrame(raf); };
    },
  };
  const stillQueue = [], stillCache = new Map();
  let stillBusy = false;
  function runStills() {
    if (stillBusy || !stillQueue.length) return;
    stillBusy = true;
    setTimeout(() => { try { stillQueue.shift()(); } finally { stillBusy = false; runStills(); } }, 20);
  }
  // The theme's colours, as the scenes use them.
  function colours() {
    const css = getComputedStyle(document.documentElement);
    const v = (name) => css.getPropertyValue(name).trim();
    return { bg: v("--bg"), signal: v("--signal"), shade1: v("--shade-1"), shade2: v("--shade-2"), shade3: v("--shade-3"),
             fgBright: v("--fg-bright"), dim: v("--dim"), net: v("--net"), accent: v("--accent"), red: v("--red"), font: v("--font") };
  }
})();

