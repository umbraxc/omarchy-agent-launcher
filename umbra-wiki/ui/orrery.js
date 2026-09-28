// Umbra Wiki orrery: the Earth, Sun and Moon drawn in characters at the top
// of the Field Kit's SUN & MOON tab. The Earth turns slowly under the camera;
// its day and night follow the real position of the Sun for the chosen
// moment, the Moon sits in its real direction with its real lit side, and
// your place is marked. Stars twinkle; the other planets circle the Sun far
// behind (for the picture, not to scale). Uses the almanac formulas of
// fieldkit.js (UmbraFieldKit.astro). Nothing goes online.
"use strict";

window.UmbraOrrery = (() => {
  // Land on a 2° grid (180 × 90, north to south, from 180° W), from Natural
  // Earth (public domain), as hex.
  const LAND = "0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000007f800ffc0000000000000000000000000000000000017ff3fffffe00000000000004000000000000000000061df0ffffff0000f8000000003c000000000000000030027c3ffffff80002000000000060000000000000000038afc007ffff00000000030007ffc001d80000000000e88b7b003fffe000000000c003ffffec00000080180009fc33fc00fffa00000300041dffffffeffc80100fffbfe725d8f00fff800001ff000edfffffffffffdfe0ffffffffff87c1ff8000007ffebffdfffffffffffff31fffffffffd1f80fc01e000f9ebfffffffffffffffff00fffffffff8034078000003e7fffffffffffffffffff01fdffffffe01e0038000007e7ffffffffffffffff2f0007807ffffe01e4000000007e3ffffffffffffff82200001001fffff80fe000000182c7fffffffffffffe00f000080007fffff9ff8000003820ffffffffffffffc00e000000007fffff9ffc000006cfffffffffffffffffc08000000003ffffffffc000000dfffffffffffffffff4000000000017ffffff460000007fffffffffffffffff400000000000fffffffc10000007ffffffffffffffffe400000000000fffffff600000007f7f97cffffffffffc000000000000ffffffe00000007f19f03cffffffffff8c00000000000ffffffc00000003c26f7fe7ffffffffe0800000000000ffffff000000007c02dffe7fffffff8408000000000007fffff0000000018740ffe7fffffffe630000000000003fffff000000001fe022ffffffffffc4f0000000000001ffffc000000003ff000ffffffffffc180000000000000ffff8000000007ffef7ffffffffffe0000000000000003fc04000000007ffffffdffffffffe0000000000000005f80400000001fffffefe7fffffffc0000000000000002f80000000001fffffe7f41ffffffc0000000000000000780c00000003ffffff7ff07fffff20000000000000000786100000007ffffffbfe07fcff0000000000000000003cc020000003ffffff9fe03f07e8000000000000000000fc000000003ffffff9f801e07f02000000000000000000f000000007ffffffde001c01f020000000000000000003000000003ffffffe8001c01f8200000000000000000010f0000003fffffff3000c013008000000000000000000aff000001fffffffe000a0120000000000000000000001ff800000fffffffe00020000080000000000000000001fff00000687ffffc000002c1800000000000000000001fff80000001ffff800000143800000000000000000003fff80000001ffff000000187a00000000000000000003fffe0000003fffe0000000c7818000000000000000003ffffc000001fffc00000006762b800000000000000007fffff000000fffc000000020101e00000000000000003fffff800000fffc00000001c001f08000000000000001fffff000000fffc000000000880d02000000000000001ffffe0000007ffc000000000000000000000000000000ffffe000000fffc20000000001c400000000000000000ffffe000000fffc2000000000fc6004000000000000003fffc000000fff8e000000001fe6000000000000000001fffc000000fff0e000000001ffe000000000000000001fffc0000007ff0c00000000ffff808000000000000001fff00000007ff0c00000001ffff800000000000000001ffc00000007fe0800000001ffffc00000000000000001ffc00000003fc0000000001ffffe00000000000000003ff800000003fc0000000001ffffe00000000000000003ff800000001f80000000000ffffe00000000000000003ff000000001f00000000000f07fc00000000000000003f8000000000000000000000801f800800000000000007fc000000000000000000000000f800400000000000007e00000000000000000000000000000600000000000007a00000000000000000000000003000c00000000000003c0000000000000000000000000100180000000000000780000000000000000000000000000300000000000000780000000000000000000000000000000000000000000f00000000000000000800000000000000000000000000e000000000000000000000000000000000000000000007000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000c00000000000001e00020ff9ffe000000000000000000c0000000000013fff87fffffffff00000000000000003e00000001ffffffff3fffffffffffc000000000038400f000001ffffffffffffffffffffffe000000ffff4ffffc000007ffffffffffffffffffffff800001ffffffffe000001ffffffffffffffffffffffff00004fffffffffe00070fffffffffffffffffffffffff000000fffffffffe0080ffffffffffffffffffffffffc000007fffffffffffffffffffffffffffffffffffffff80ff803ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  const land = new Uint8Array(180 * 90);
  for (let j = 0; j < 90; j++) {
    const hex = LAND.slice(j * 45, j * 45 + 45);
    for (let k = 0; k < 45; k++) {
      const v = parseInt(hex[k], 16);
      for (let b = 0; b < 4; b++) land[j * 180 + k * 4 + b] = (v >> (3 - b)) & 1;
    }
  }
  const isLand = (lat, lon) => land[Math.min(89, Math.max(0, Math.floor((90 - lat) / 2))) * 180 + ((Math.floor((lon + 180) / 2) % 180) + 180) % 180];

  const rad = Math.PI / 180;
  const vec = (lat, lon) => [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  // Where the Sun and Moon stand over the Earth at a moment: the points
  // straight below them, as directions from the Earth's centre.
  function sky(date) {
    const A = window.UmbraFieldKit && UmbraFieldKit.astro;
    if (!A) return null;
    const d = A.toDays(date), gmst = A.sidereal(d, 0), s = A.sunCoords(d), m = A.moonCoords(d);
    return { sun: vec(s.dec, s.ra - gmst), moon: vec(m.dec, m.ra - gmst), sunLat: s.dec / rad,
             sunLon: (((((s.ra - gmst) / rad) % 360) + 540) % 360) - 180, lit: A.moonLight(date).fraction };
  }

  let run = null;
  // Starts the view in a box; returns a function that stops it.
  function start(box, getPlace, getDate) {
    if (run) run.stop();
    box.innerHTML = `<canvas class="orr-canvas"></canvas><div class="orr-bar"><span class="orr-when"></span>
      <span class="orr-legend"><i class="orr-l-sun"></i>SUN <i class="orr-l-moon"></i>MOON <b>◆</b> YOU</span>
      <button class="ghost orr-lapse" title="Time-lapse|Runs a day in 24 seconds, so you see night sweep over the Earth and the Moon move.">▶ TIME-LAPSE</button></div>`;
    const canvas = box.querySelector("canvas"), g = canvas.getContext("2d");
    let W = 0, H = 0, dpr = 1, cw = 7, ch = 12, font = "";
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = box.clientWidth; H = Math.max(220, Math.min(300, Math.round(W * 0.3)));
      canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
      font = `700 9.5px ${css("--font") || "monospace"}`;
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.font = font;
      cw = g.measureText("M").width || 6; ch = 9.5;
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(box);
    // Stars: fixed places, each with its own twinkle.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const stars = Array.from({ length: 150 }, () => ({ x: rnd(), y: rnd(), c: ".·*+"[Math.floor(rnd() * 4)], p: rnd() * 6.28, s: 0.4 + rnd() * 1.6 }));
    const PLANETS = [["∙", 0.28, 4.1, "#b9a58c"], ["•", 0.42, 1.6, "#e8d27c"], ["•", 0.62, 0.85, "#e06a4a"], ["●", 0.95, 0.14, "#d9b98a"]];   // Mercury, Venus, Mars, Jupiter
    let lapse = false, lapseStart = 0, lapseFrom = 0, camLon = null, t0 = performance.now(), timer = 0;
    box.querySelector(".orr-lapse").addEventListener("click", (e) => {
      lapse = !lapse; lapseStart = performance.now(); lapseFrom = when().getTime();
      e.currentTarget.textContent = lapse ? "■ LIVE" : "▶ TIME-LAPSE"; Sound.click();
    });
    const still = () => document.body.classList.contains("reduce-motion") || window.offgrid;
    function when() {
      const d = getDate();
      if (lapse) return new Date(lapseFrom + (performance.now() - lapseStart) * 3600);   // a day in 24 s
      return d;
    }
    function frame() {
      if (!box.isConnected) { stop(); return; }
      const date = when(), s = sky(date), place = getPlace();
      if (!s || !W) return;
      const now = performance.now(), el = (now - t0) / 1000;
      const bg = css("--bg") || "#000", sig = css("--signal") || "#e8d27c", net = css("--net") || "#5fb8c9";
      const fg = css("--fg") || "#ccc", faint = css("--faint") || "#555", accent = css("--accent") || "#e68e0d";
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.font = font; g.textBaseline = "middle"; g.textAlign = "center";
      // Stars.
      for (const st of stars) {
        g.globalAlpha = still() ? 0.35 : 0.15 + 0.35 * (0.5 + 0.5 * Math.sin(el * st.s + st.p));
        g.fillStyle = fg; g.fillText(st.c, st.x * W, st.y * H);
      }
      g.globalAlpha = 1;
      // The camera circles slowly, starting over your longitude, a little north.
      if (camLon === null) camLon = (place ? place.lon : 0) * rad;
      const lon = camLon + (still() ? 0 : el * rad * 4), C = vec(18 * rad, lon);
      const right = norm(cross([0, 0, 1], C)), up = cross(C, right);
      const R = Math.min(H * 0.44, W * 0.17), cx = W * 0.42, cy = H * 0.5;
      const S = s.sun, sx = dot(S, right), sy = dot(S, up), sz = dot(S, C);
      // The Sun, far off in its real direction (to the side, or behind).
      const sunX = cx + sx * W * 0.5, sunY = cy - sy * H * 0.42, sunBehind = sz < 0;
      const drawSun = () => {
        const glow = g.createRadialGradient(sunX, sunY, 2, sunX, sunY, 46);
        glow.addColorStop(0, sig); glow.addColorStop(1, "transparent");
        g.globalAlpha = sunBehind ? 0.35 : 0.8; g.fillStyle = glow; g.beginPath(); g.arc(sunX, sunY, 46, 0, 6.3); g.fill();
        g.globalAlpha = sunBehind ? 0.5 : 1; g.fillStyle = sig; g.font = `700 18px ${css("--font")}`; g.fillText("☼", sunX, sunY); g.font = font;
        // The other planets, on tilted rings around the Sun.
        for (const [sym, rr, speed, col] of PLANETS) {
          const a = el * speed * 0.2 + rr * 9, ox = Math.cos(a) * rr * W * 0.3, oy = Math.sin(a) * rr * H * 0.12;
          g.globalAlpha = (Math.sin(a) < 0 ? 0.35 : 0.7) * (sunBehind ? 0.6 : 1);
          g.strokeStyle = faint; g.lineWidth = 0.6; g.setLineDash([2, 5]);
          g.beginPath(); g.ellipse(sunX, sunY, rr * W * 0.3, rr * H * 0.12, 0, 0, 6.3); g.stroke(); g.setLineDash([]);
          g.fillStyle = col; g.fillText(sym, sunX + ox, sunY + oy);
        }
        g.globalAlpha = 1;
      };
      if (sunBehind) drawSun();
      // The Moon: real direction, true size, lit on the Sun's side. Drawn
      // closer than it really is (it would be 60 Earth radii away).
      const M = s.moon, mDist = 2.5, mx = cx + dot(M, right) * R * mDist, my = cy - dot(M, up) * R * mDist, mz = dot(M, C);
      const mR = Math.max(ch * 1.2, R * 0.27);
      const drawBall = (bx, by, br, shade) => {
        for (let py = by - br; py <= by + br; py += ch) {
          for (let px = bx - br; px <= bx + br; px += cw) {
            const u = (px - bx) / br, v = (by - py) / br, rr = u * u + v * v;
            if (rr > 1) continue;
            const w = Math.sqrt(1 - rr), n = [right[0] * u + up[0] * v + C[0] * w, right[1] * u + up[1] * v + C[1] * w, right[2] * u + up[2] * v + C[2] * w];
            shade(n, px, py);
          }
        }
      };
      const moon = () => drawBall(mx, my, mR, (n, px, py) => {
        const l = dot(n, S);
        g.fillStyle = l > 0 ? fg : faint; g.globalAlpha = l > 0 ? 0.55 + 0.45 * l : 0.35;
        g.fillText(l > 0.6 ? "@" : l > 0.25 ? "O" : l > 0 ? "o" : ".", px, py);
      });
      if (mz < 0) moon();
      // The Earth: land and sea by day, dark by night, a twilight band.
      drawBall(cx, cy, R, (n, px, py) => {
        const lat = Math.asin(n[2]) / rad, lo = Math.atan2(n[1], n[0]) / rad, l = dot(n, S), isL = isLand(lat, lo);
        if (l > 0.08) {
          g.globalAlpha = 0.45 + 0.55 * Math.min(1, l * 1.4);
          g.fillStyle = isL ? sig : net;
          g.fillText(isL ? (l > 0.6 ? "#" : l > 0.3 ? "%" : "+") : (l > 0.5 ? "~" : "-"), px, py);
        } else if (l > -0.08) {
          g.globalAlpha = 0.6; g.fillStyle = accent; g.fillText(isL ? ":" : "·", px, py);
        } else {
          g.globalAlpha = 0.3; g.fillStyle = faint; g.fillText(isL ? ":" : " ", px, py);
        }
      });
      g.globalAlpha = 1;
      // Your place.
      if (place) {
        const P = vec(place.lat * rad, place.lon * rad);
        if (dot(P, C) > 0) {
          const px = cx + dot(P, right) * R, py = cy - dot(P, up) * R, pulse = still() ? 1 : 0.6 + 0.4 * Math.sin(el * 4);
          g.globalAlpha = pulse; g.fillStyle = css("--red") || "#e06a6a"; g.font = `700 14px ${css("--font")}`; g.fillText("◆", px, py); g.font = font;
          g.globalAlpha = 1;
        }
      }
      if (mz >= 0) moon();
      if (!sunBehind) drawSun();
      // What the picture shows, in words.
      const f = (v, p, n) => `${Math.abs(v).toFixed(1)}°${v >= 0 ? p : n}`;
      box.querySelector(".orr-when").textContent = `${lapse ? "TIME-LAPSE" : "LIVE"} · ${date.toISOString().slice(0, 16).replace("T", " ")} UTC · SUN OVERHEAD ${f(s.sunLat, "N", "S")} ${f(s.sunLon, "E", "W")} · MOON ${Math.round(s.lit * 100)}% LIT`;
    }
    const loop = () => { frame(); timer = setTimeout(loop, still() ? 1000 : 80); };
    loop();
    function stop() { clearTimeout(timer); ro.disconnect(); if (run && run.stop === stop) run = null; }
    run = { stop };
    return stop;
  }

  return { start, sky };
})();
