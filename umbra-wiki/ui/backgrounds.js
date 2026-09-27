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

  window.UmbraBackgrounds = {
    list: [["rain", "Digital rain"], ["rise", "Rising rain"], ["rings", "Saturn rings"], ["stars", "Starfield"],
           ["forest", "Night forest"], ["snow", "Snowfall"], ["aurora", "Northern lights"], ["embers", "Campfire embers"],
           ["radar", "Radar sweep"], ["none", "None"]],
    make: { rain: rain(1), rise: rain(-1), rings, stars, forest, snow, aurora, embers, radar },
  };
})();
