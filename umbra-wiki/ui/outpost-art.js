// The Outpost valley is drawn from shaded glyphs, like Umbra's Sun & Moon view.
"use strict";
window.UmbraOutpostArt = (() => {
  const keys = ["garden", "well", "lumber", "salvage", "solar", "clinic", "archive", "hearth"];
  const names = ["GARDEN", "RAIN WELL", "TIMBER", "SALVAGE", "SOLAR", "CLINIC", "ARCHIVE", "HEARTH"];
  const colors = ["#9fc779", "#76bdc7", "#b59868", "#b3a795", "#e5be68", "#dc8e83", "#aa9dcc", "#df9b66"];
  const sprites = {
    garden: ["  .-^-.", " /:::::\\", "|✿✿✿✿✿|", "|▒▒▒▒▒|", " \\_____/"] ,
    well: ["  .---.", " / /\\  \\", "| |≈≈| |", "| |≈≈| |", " \\_____/"],
    lumber: ["   /\\  ", "  /♣♣\\ ", " /♣♣♣♣\\", "   ║║   ", " ==╩╩== "],
    salvage: [" .-===-.", "/ ▣ ▣  \\", "| ━╋━  |", "|_/___\\_|", " /_/_\\_\\"],
    solar: ["  .-ϟ-.", " /#:#:#\\", "|#:#:#:|", " \\=====//", "  /_|_\\"],
    clinic: ["  /\\__ ", " /  ✚  \\", "| [__] |", "| |  | |", "|_|__|_|"],
    archive: ["   ◇   ", "  /|\\  ", " /▒▒▒\\ ", " |≡ ≡| ", " |_|_| "],
    hearth: ["  /\u00b7\\  ", " / \u2665 \\ ", "/_/_\\_\\", "  \\ϟ/  ", " ==╧== "]
  };
  const empty = ["  . .  ", " /___\\ ", " |   | ", " |___| "];
  const rand = n => { const s = Math.sin(n * 127.1 + 78.23) * 43758.5453; return s - Math.floor(s); };
  let styleCache = {};
  const css = name => styleCache[name] || (styleCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim());
  const rate = level => level * (2 + .4 * level);
  const clock = value => {
    const seconds = Math.max(0, Math.ceil(value));
    return Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0");
  };

  function start(canvas, getData) {
    const scene = canvas.parentElement, ctx = canvas.getContext("2d");
    const tip = scene.querySelector(".op-site-tip");
    let W = 0, H = 0, dpr = 1, hovered = null, burst = null, tick = 0;
    let sites = [];
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width; H = rect.height; dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(W * dpr)); canvas.height = Math.max(1, Math.round(H * dpr));
    };
    new ResizeObserver(resize).observe(canvas); resize();
    const glyph = (char, x, y, color, alpha = 1, size = 11) => {
      ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.font = `700 ${size}px ${css("--font") || "monospace"}`;
      ctx.fillText(char, x, y); ctx.globalAlpha = 1;
    };
    function sprite(key, level, x, y, scale, t) {
      const lines = level ? sprites[key] : empty;
      const color = colors[keys.indexOf(key)], cw = 6.6 * scale, ch = 11.2 * scale;
      const width = Math.max(...lines.map(line => [...line].length)) * cw;
      const firstY = y - lines.length * ch;
      // The offset shadow makes each glyph wall read as a little solid object.
      for (let row = 0; row < lines.length; row++) {
        const chars = [...lines[row]];
        for (let col = 0; col < chars.length; col++) {
          let char = chars[col]; if (char === " ") continue;
          if (key === "well" && char === "≈") char = (tick % 4 < 2 ? "≈" : "~");
          if (key === "hearth" && char === "ϟ") char = (tick % 4 < 2 ? "ϟ" : "✦");
          if (key === "solar" && char === "ϟ") char = (tick % 4 < 2 ? "✦" : "ϟ");
          if (key === "garden" && char === "✿") char = (tick + col) % 5 ? "✿" : "*";
          const px = x - width / 2 + col * cw, py = firstY + row * ch;
          const bright = "✿≈~♣ϟ✦✚◇♥*".includes(char);
          glyph(char, px + 1.5, py + 2.5, "#030303", .75, 11 * scale);
          glyph(char, px, py, bright ? color : row < 2 ? css("--fg-bright") : color,
            level ? (bright ? .92 : .45 + .45 * (1 - row / lines.length)) : .33, 11 * scale);
        }
      }
      if (level && !document.body.classList.contains("reduce-motion") && !window.offgrid) {
        const p = (t * .7 + keys.indexOf(key) * .31) % 1;
        const particle = key === "well" ? "·" : key === "lumber" ? "♣" : key === "garden" ? "✿" : key === "hearth" ? "ϟ" : "✦";
        glyph(particle, x + Math.sin(t * 2 + x) * 11, firstY - p * 19, color, .25 + .55 * (1 - p), 10 * scale);
      }
    }
    function frame() {
      if (!W || !H || scene.closest("#outpost")?.hidden || document.hidden) return;
      styleCache = {};
      const data = getData(), t = performance.now() / 1000;
      const still = document.body.classList.contains("reduce-motion") || window.offgrid;
      if (!still) tick = Math.floor(t * 2);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = css("--bg-1") || "#080808"; ctx.fillRect(0, 0, W, H);
      const halo = ctx.createRadialGradient(W * .52, H * .72, 5, W * .52, H * .72, W * .6);
      halo.addColorStop(0, css("--signal-soft") || "#3b2d0d"); halo.addColorStop(1, "transparent");
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
      // Mountains, distant stars and rows of terrain recede to a vanishing point.
      for (let n = 0; n < 62; n++) {
        const x = rand(n + 31) * W, y = rand(n + 190) * H * .28;
        glyph(n % 9 ? "·" : "+", x, y, css("--fg"), still ? .25 : .18 + .28 * (.5 + .5 * Math.sin(t * (1 + rand(n)) + n)), 9);
      }
      for (let x = -24; x < W + 24; x += 8) {
        const a = x / W;
        const ridge = H * (.29 + .045 * Math.sin(a * 12) + .025 * Math.sin(a * 27));
        glyph(x % 3 ? "/" : "^", x, ridge, css("--faint"), .4, 9);
      }
      for (let row = 0; row < 12; row++) {
        const depth = row / 11, y = H * (.31 + .65 * depth * depth), spread = W * (.22 + .8 * depth);
        for (let col = -12; col <= 12; col++) {
          const x = W / 2 + col * spread / 12;
          glyph((row + col) % 5 ? "·" : ":", x, y, css("--faint"), .13 + .23 * depth, 8 + depth * 2);
        }
      }
      // A round, shaded command dome anchors the settlement. Its glyphs use
      // the same lit-surface idea as the Sun & Moon sphere.
      const hubX = W * .5, hubY = H * .24, radius = Math.min(39, W * .065);
      for (let py = -radius; py <= radius; py += 6.5) {
        for (let px = -radius; px <= radius; px += 6.5) {
          const u = px / radius, v = py / radius, rr = u * u + v * v;
          if (rr > 1) continue;
          const depth = Math.sqrt(1 - rr), light = Math.max(0, .65 * -u + .55 * -v + .7 * depth);
          const pattern = Math.sin(u * 17 + t * (still ? 0 : .22)) * Math.cos(v * 13);
          glyph(light > .95 ? "@" : light > .7 ? "#" : light > .4 ? "+" : "·",
            hubX + px, hubY + py, pattern > .4 ? css("--signal") : css("--fg"),
            .26 + .68 * light, 10);
        }
      }
      glyph("╭──────────╮", hubX, hubY + radius + 4, css("--signal"), .7, 10);
      glyph("│ ◇  UMBRA │", hubX, hubY + radius + 15, css("--signal"), .8, 10);
      glyph("╰──────────╯", hubX, hubY + radius + 26, css("--dim"), .65, 10);
      glyph("COMMAND HUB", hubX, hubY - radius - 16, css("--signal"), .85, 8);
      for (let i = 0; i < 8; i++) {
        const x = W * [.13, .37, .63, .87][i % 4], y = H * (i < 4 ? .54 : .83);
        for (let step = 2; step < 9; step++) {
          const p = step / 9;
          glyph(step % 3 ? "·" : ":", hubX + (x - hubX) * p, hubY + radius + 22 + (y - hubY - radius - 22) * p,
            css("--signal"), .14 + .1 * p, 8);
        }
      }
      sites = [];
      const scale = Math.min(1.14, Math.max(.75, W / 700));
      const xes = [.13, .37, .63, .87];
      for (let i = 0; i < 8; i++) {
        const row = i < 4 ? 0 : 1, x = W * xes[i % 4], y = H * (row ? .83 : .54);
        const key = keys[i], level = data?.state?.stations?.[key] || 0, color = colors[i];
        const width = Math.min(92, W * .22), height = 77 * scale;
        sites.push({key, x, y, width, height, level});
        ctx.fillStyle = "rgba(0,0,0,.38)"; ctx.beginPath(); ctx.ellipse(x, y + 4, width * .42, 9, 0, 0, 7); ctx.fill();
        const near = hovered === key, pulse = still ? .48 : .45 + .12 * Math.sin(t * 2 + i);
        ctx.strokeStyle = near ? color : css("--line"); ctx.globalAlpha = near ? .9 : pulse;
        ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x + width * .47, y + 5); ctx.lineTo(x, y + 18); ctx.lineTo(x - width * .47, y + 5); ctx.closePath(); ctx.stroke(); ctx.globalAlpha = 1;
        sprite(key, level, x, y - 4, scale, t);
        glyph(names[i], x, y + 25, level ? color : css("--dim"), .9, 8.5);
        glyph(level ? `LV ${level} · ${rate(level).toFixed(1)}/H` : "BUILD TO START", x, y + 37, css("--dim"), .9, 8);
      }
      if (burst && !still) {
        const age = t - burst.at;
        if (age > 2.2) burst = null;
        else {
          const site = sites.find(s => s.key === burst.key);
          if (site) for (let i = 0; i < 18; i++) {
            const angle = i * 2.4, distance = 12 + age * (25 + i % 4 * 7);
            glyph(i % 3 ? "✦" : "+", site.x + Math.cos(angle) * distance,
              site.y - 40 + Math.sin(angle) * distance, colors[keys.indexOf(site.key)], 1 - age / 2.2, 8 + i % 3);
          }
        }
      }
      if (hovered && data) {
        const site = sites.find(s => s.key === hovered);
        if (site) {
          const resource = data.stations[hovered][0], level = site.level;
          const amount = data.state.resources[resource], hourly = rate(level);
          const next = hourly && amount < 250 ? " · NEXT +1 IN " + clock((1 - amount % 1) / hourly * 3600) : "";
          tip.innerHTML = "<b>" + names[keys.indexOf(hovered)] + "</b><span>LEVEL " + level + "/5 · " +
            (level ? hourly.toFixed(1) + " " + resource.toUpperCase() + "/H" : "AWAITING BUILD") +
            "</span><small>" + amount.toFixed(2) + " " + resource.toUpperCase() + " STORED" + next + "</small>";
          tip.style.left = `${Math.max(8, Math.min(W - 195, site.x - 90))}px`;
          tip.style.top = `${Math.max(6, site.y - site.height - 80)}px`;
          tip.hidden = false;
        }
      }
    }
    canvas.addEventListener("pointermove", event => {
      const box = canvas.getBoundingClientRect(), x = event.clientX - box.left, y = event.clientY - box.top;
      const site = sites.find(s => Math.abs(x - s.x) < s.width * .55 && y > s.y - s.height && y < s.y + 40);
      hovered = site?.key || null; tip.hidden = !hovered;
      canvas.style.cursor = hovered ? "help" : "default";
      frame();
    });
    canvas.addEventListener("pointerleave", () => { hovered = null; tip.hidden = true; });
    const loop = () => {
      frame();
      const idle = scene.closest("#outpost")?.hidden || document.hidden;
      setTimeout(loop, idle ? 800 : document.body.classList.contains("reduce-motion") || window.offgrid ? 1000 : 120);
    };
    loop();
    return { celebrate: key => { burst = {key, at: performance.now() / 1000}; frame(); }, draw: frame };
  }
  return {start};
})();
