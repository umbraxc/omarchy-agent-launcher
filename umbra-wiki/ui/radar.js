// Umbra Wiki Signals & Radar: a command-centre screen. In the middle a
// sonar-style radar with you at the centre: every Wi-Fi network and
// Bluetooth device the radios hear is a blip, nearer the centre the stronger
// its signal, lit as the sweep passes. Click one for its details. Around it,
// the device's vitals (processor, temperature, memory, battery, disk,
// network traffic) and the Wi-Fi channels in use. Passive and local: only
// the radios need to be on (no internet); nothing is connected to, stored or
// sent. Loaded after app.js (uses $, Sound, escapeHtml, locked, goBack).
"use strict";

(() => {
  const G = { radar: "\u{F0437}", wifi: "\u{F05A9}", bt: "\u{F00AF}", chip: "\u{F061A}", temp: "\u{F050F}", mem: "\u{F035B}",
              bat: "\u{F0079}", disk: "\u{F02CA}", net: "\u{F0317}", scan: "\u{F0450}", lock: "\u{F033E}", open: "\u{F0FC6}" };
  let data = { wifi: { networks: [] }, bluetooth: { devices: [] } }, vit = null, picked = null, show = { wifi: true, bt: true };
  let ro = null, canvas, g, W = 0, H = 0, dpr = 1, raf = 0, scanTimer = 0, vitTimer = 0, lastScan = 0, sweep = 0, t0 = performance.now();
  const hist = { cpu: [], rx: [], tx: [], count: [] };
  const events = [];        // [{t, kind, text}] the event log
  let seen = null, scans = 0, lastScanAt = 0, rtab = "system", killed = false, fullOn = false;
  const pings = [];         // detection rings: {x, y, t, col}
  const lit = new Map();   // id -> time the sweep last passed it
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  // A theme colour with transparency (themes give #rrggbb; anything else stays solid).
  const ca = (c, a) => { const m = /^#([0-9a-f]{6})$/i.exec(c || ""); return m ? `rgba(${[0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)).join(",")},${a})` : c; };
  const hash = (s) => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; };

  // ---------------------------------------------------------------- build

  function build() {
    const el = document.createElement("div");
    el.id = "radar"; el.className = "radar"; el.hidden = true;
    el.innerHTML = `
      <div class="rd-head"><span class="lo-title"><span class="spin" data-spin>✻</span> SIGNALS & RADAR</span>
        <div class="rd-chips"><span class="rd-chip" data-k="wifi"></span><span class="rd-chip" data-k="bt"></span><span class="rd-chip rd-clock"></span></div>
        <div class="rd-tools">
          <button class="ctl rd-t on" data-t="wifi" title="Wi-Fi|Show or hide the Wi-Fi networks."><span class="g">${G.wifi}</span></button>
          <button class="ctl rd-t on" data-t="bt" title="Bluetooth|Show or hide the Bluetooth devices."><span class="g">${G.bt}</span></button>
          <button class="ghost rd-scan" title="Scan now · S|Asks the radios to listen again (a few seconds).">${G.scan} SCAN</button>
          <button class="ctl rd-full" title="Full screen · F|Use the whole screen for the radar."><span class="g">\u{F0293}</span></button>
          <button class="ghost rd-kill" title="Kill switch|Turns Wi-Fi, mobile data and Bluetooth off at once, for when you need to go dark. Umbra keeps working offline.">\u{F0425} KILL SWITCH</button>
          <button class="ghost rd-close" title="Close · Esc|Back to where you were.">CLOSE ✕</button></div></div>
      <div class="rd-body">
        <aside class="rd-left"><div class="rd-h">SIGNALS <small class="rd-count"></small></div><div class="rd-list"></div></aside>
        <div class="rd-center"><canvas class="rd-canvas"></canvas><div class="rd-detail" hidden></div>
          <div class="rd-hud rd-hud-tl"><b class="rd-blink">● SIGINT · PASSIVE</b><span class="rd-hud-scan"></span></div>
          <div class="rd-hud rd-hud-tr"><span class="rd-hud-brg"></span><span class="rd-hud-sig"></span></div>
          <div class="rd-hud rd-hud-bl"><span>RF 2.4 · 5 · 6 GHz · BLE</span><span class="rd-hud-coords"></span></div>
          <div class="rd-dark" hidden><b>\u{F0425} RADIOS OFF</b><p>The kill switch is on: Wi-Fi, mobile data and Bluetooth are off. Umbra keeps working offline.</p>
            <button class="solid rd-restore">RESTORE RADIOS ▸</button></div>
          <p class="rd-note">Only the radios need to be on: no internet. Passive: Umbra connects to nothing and keeps nothing.</p></div>
        <aside class="rd-right"><div class="rd-rtabs"><button data-r="system" class="on">SYSTEM</button><button data-r="intel">INTEL</button><button data-r="log">DEVICES <i class="rd-logn"></i></button></div>
          <div class="rd-pane" data-r="system"><div class="rd-vitals"></div><div class="rd-h">WI-FI CHANNELS</div><canvas class="rd-spectrum"></canvas></div>
          <div class="rd-pane" data-r="intel" hidden></div>
          <div class="rd-pane" data-r="log" hidden><div class="rd-h"><span class="rd-blink">●</span> KNOWN DEVICES <small class="rd-kcount"></small></div>
            <div class="rd-kfilter"><button data-f="all" class="on">ALL</button><button data-f="range">IN RANGE</button><button data-f="new">NEW</button></div>
            <div class="rd-log"></div>
            <p class="lib-note rd-kfoot">Every device the radar has heard is remembered on this computer only, so new ones stand out. <button class="ghost rd-forget">FORGET ALL</button></p></div></aside>
      </div>`;
    document.body.appendChild(el);
    canvas = el.querySelector(".rd-canvas"); g = canvas.getContext("2d");
    el.querySelector(".rd-close").addEventListener("click", () => toggle(false));
    el.querySelector(".rd-full").addEventListener("click", fullscreen);
    el.querySelector(".rd-kill").addEventListener("click", () => kill(true));
    el.querySelector(".rd-restore").addEventListener("click", () => kill(false));
    el.querySelectorAll(".rd-kfilter button").forEach((b) => b.addEventListener("click", () => {
      kfilter = b.dataset.f; el.querySelectorAll(".rd-kfilter button").forEach((x) => x.classList.toggle("on", x === b)); logView(); Sound.click();
    }));
    el.querySelector(".rd-forget").addEventListener("click", async () => {
      const ok = await confirmDialog({ kind: "to-local", tag: "RADAR", title: "FORGET ALL DEVICES?", body: "The list of devices the radar has heard is cleared. It fills again with the next scan.", ok: "FORGET", cancel: "KEEP" });
      if (!ok) return;
      known = (await (await fetch("/api/radar/forget", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json()).known;
      logView(); Sound.click();
    });
    el.querySelectorAll(".rd-rtabs button").forEach((b) => b.addEventListener("click", () => {
      rtab = b.dataset.r;
      el.querySelectorAll(".rd-rtabs button").forEach((x) => x.classList.toggle("on", x === b));
      el.querySelectorAll(".rd-pane").forEach((p) => (p.hidden = p.dataset.r !== rtab));
      if (rtab === "intel") intel(); if (rtab === "log") logView();
      Sound.click();
    }));
    el.querySelector(".rd-scan").addEventListener("click", () => { scan(true); Sound.searchstart(); });
    el.querySelectorAll(".rd-t").forEach((b) => b.addEventListener("click", () => {
      show[b.dataset.t] = !show[b.dataset.t]; b.classList.toggle("on", show[b.dataset.t]); list(); Sound.click();
    }));
    canvas.addEventListener("click", (e) => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 18;
      for (const s of signals()) { const [bx, by] = pos(s); const d = Math.hypot(bx - x, by - y); if (d < bd) { bd = d; best = s; } }
      if (best) pick(best); else closeDetail();
    });
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      canvas.style.cursor = signals().some((s) => { const [bx, by] = pos(s); return Math.hypot(bx - x, by - y) < 14; }) ? "pointer" : "";
    });
    // Watched for size only while open: an observer costs a little on every
    // frame of every other screen (the map's too).
    ro = new ResizeObserver(resize);
  }

  // All signals shown, with their kind.
  const signals = () => [...(show.wifi ? (data.wifi.networks || []).map((n) => ({ ...n, type: "wifi" })) : []),
                         ...(show.bt ? (data.bluetooth.devices || []).map((d) => ({ ...d, type: "bt" })) : [])];
  // Where a signal sits: its own fixed bearing, nearer the centre when stronger.
  function pos(s) {
    const R = Math.min(W, H) * 0.44, a = hash(s.id || s.name) * Math.PI * 2 + (s.type === "bt" ? 0.35 : 0);
    const r = R * (0.12 + 0.86 * (1 - Math.max(0, Math.min(100, s.signal)) / 100));
    return [W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r, a, r];
  }

  function resize() {
    const box = $("#radar .rd-center");
    if (!box || $("#radar").hidden) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = box.clientWidth; H = box.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + "px"; canvas.style.height = H + "px";
  }

  // ----------------------------------------------------------------- draw

  function draw() {
    raf = 0;
    if ($("#radar").hidden) return;
    const now = performance.now(), dt = Math.min(0.1, (now - t0) / 1000); t0 = now;
    const still = document.body.classList.contains("reduce-motion") || window.offgrid;
    const sig = css("--signal") || "#e8d27c", net = css("--net") || "#5fb8c9", acc = css("--accent") || "#e68e0d";
    const bg = css("--bg") || "#000", fg = css("--fg") || "#ccc", red = css("--red") || "#e06a6a", font = css("--font");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
    // The scope: a glowing disc, rings with levels, cross, and a slowly
    // turning outer bezel of bearings.
    const disc = g.createRadialGradient(cx, cy, R * 0.05, cx, cy, R * 1.05);
    disc.addColorStop(0, ca(sig, 0.1)); disc.addColorStop(0.7, ca(sig, 0.035)); disc.addColorStop(1, ca(sig, 0));
    g.fillStyle = disc; g.beginPath(); g.arc(cx, cy, R * 1.05, 0, 6.3); g.fill();
    g.strokeStyle = sig; g.lineWidth = 1; g.font = `600 9px ${font}`; g.textAlign = "left"; g.textBaseline = "middle";
    [[0.25, "-40 dBm"], [0.5, "-55"], [0.75, "-70"], [1, "-90"]].forEach(([k, label]) => {
      g.globalAlpha = k === 1 ? 0.6 : 0.2; g.setLineDash(k === 1 ? [] : [2, 6]);
      g.beginPath(); g.arc(cx, cy, R * k, 0, 6.3); g.stroke();
      g.globalAlpha = 0.5; g.fillStyle = sig; g.fillText(label, cx + 5, cy - R * k + 9);
    });
    g.setLineDash([]);
    g.globalAlpha = 0.14;
    for (let a = 0; a < 12; a++) { const t = (a * Math.PI) / 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(t) * R, cy + Math.sin(t) * R); g.stroke(); }
    const bez = still ? 0 : (now / 1000) * 0.03;
    for (let d = 0; d < 360; d += 5) {
      const a = (d - 90) * Math.PI / 180 + bez, l = d % 30 ? (d % 10 ? 3 : 6) : 11;
      g.globalAlpha = d % 30 ? 0.3 : 0.7;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4)); g.lineTo(cx + Math.cos(a) * (R + 4 + l), cy + Math.sin(a) * (R + 4 + l)); g.stroke();
    }
    g.globalAlpha = 0.8; g.fillStyle = sig; g.textAlign = "center";
    for (const d of [0, 90, 180, 270]) { const a = (d - 90) * Math.PI / 180; g.fillText(String(d).padStart(3, "0"), cx + Math.cos(a) * (R + 26), cy + Math.sin(a) * (R + 26)); }
    // The sweep, slow, with a long phosphor wake and a bright edge.
    if (!still) sweep = (sweep + dt * 0.62) % (Math.PI * 2);
    if (g.createConicGradient) {
      const wake = g.createConicGradient(sweep - 1.6, cx, cy);
      wake.addColorStop(0, ca(sig, 0)); wake.addColorStop(0.2, ca(sig, 0.08)); wake.addColorStop(0.2545, ca(sig, 0.3)); wake.addColorStop(0.255, ca(sig, 0)); wake.addColorStop(1, ca(sig, 0));
      g.globalAlpha = 1; g.fillStyle = wake; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, sweep - 1.6, sweep + 0.005); g.closePath(); g.fill();
    }
    g.globalAlpha = 1; g.strokeStyle = sig; g.lineWidth = 2;
    g.shadowColor = sig; g.shadowBlur = 8;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); g.stroke();
    g.shadowBlur = 0;
    // Grain: a few specks of noise.
    if (!still) { g.fillStyle = sig; for (let i = 0; i < 14; i++) { const a = Math.random() * 6.3, r = Math.random() * R; g.globalAlpha = Math.random() * 0.35; g.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1); } }
    // The blips: lit as the sweep passes, then fading like phosphor, with a
    // ring going out from each new contact.
    const list = signals();
    g.font = `600 9.5px ${font}`; g.textAlign = "left";
    for (const s of list) {
      const [x0, y0, a] = pos(s);
      const j = still ? 0 : Math.sin(now / 700 + hash(s.id) * 20) * 0.8, x = x0 + j, y = y0 - j;
      const behind = ((sweep - ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) + 4 * Math.PI) % (2 * Math.PI);
      const col = s.type === "wifi" ? net : acc;
      if (behind < dt * 0.7 + 0.03 && now - (lit.get(s.id) || 0) > 1500) { lit.set(s.id, now); pings.push({ x, y, t: now, col }); }
      const age = (now - (lit.get(s.id) || 0)) / 1000, glow = still ? 1 : Math.max(0.22, 1 - age / 7);
      if (glow > 0.3) {
        const halo = g.createRadialGradient(x, y, 0, x, y, 14);
        halo.addColorStop(0, ca(col, 0.45 * glow)); halo.addColorStop(1, ca(col, 0));
        g.globalAlpha = 1; g.fillStyle = halo; g.beginPath(); g.arc(x, y, 14, 0, 6.3); g.fill();
      }
      g.globalAlpha = glow; g.fillStyle = col; g.strokeStyle = col;
      if (s.type === "wifi") { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); }
      else { g.beginPath(); g.arc(x, y, 4, 0, 6.3); g.fill(); }
      if (/open/i.test(s.security || "") && s.type === "wifi") { g.strokeStyle = red; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 8, 0, 6.3); g.stroke(); }
      if (s.connected || s.paired) { g.globalAlpha = 0.95; g.strokeStyle = col; g.lineWidth = 1.4; g.setLineDash([2, 2]); g.beginPath(); g.arc(x, y, 10, 0, 6.3); g.stroke(); g.setLineDash([]); }
      if (picked && picked.id === s.id) {
        const p = still ? 0 : (now / 400) % 1;
        g.globalAlpha = 1; g.strokeStyle = sig; g.lineWidth = 1.5;
        g.strokeRect(x - 12 - p * 3, y - 12 - p * 3, 24 + p * 6, 24 + p * 6);
        g.beginPath(); g.moveTo(x - 22, y); g.lineTo(x - 13, y); g.moveTo(x + 13, y); g.lineTo(x + 22, y); g.moveTo(x, y - 22); g.lineTo(x, y - 13); g.moveTo(x, y + 13); g.lineTo(x, y + 22); g.stroke();
      }
      const kk = known[(s.type === "bt" ? "bt:" : "wifi:") + s.id];
      if (kk && isNew(kk)) { g.globalAlpha = 0.9; g.fillStyle = red; g.font = `700 8.5px ${font}`; g.fillText("NEW", x + 8, y + 10); g.font = `600 9.5px ${font}`; }
      if (s.signal >= 55 || (picked && picked.id === s.id)) {
        g.globalAlpha = Math.max(0.55, glow); g.fillStyle = fg;
        g.fillText((s.name || "hidden").slice(0, 18) + `  ${s.dbm}`, x + 10, y - 9);
      }
    }
    for (let i = pings.length - 1; i >= 0; i--) {
      const p = pings[i], k = (now - p.t) / 1100;
      if (k > 1 || still) { pings.splice(i, 1); continue; }
      g.globalAlpha = (1 - k) * 0.7; g.strokeStyle = p.col; g.lineWidth = 1;
      g.beginPath(); g.arc(p.x, p.y, 5 + k * 26, 0, 6.3); g.stroke();
    }
    // You, in the centre.
    g.globalAlpha = 1; g.fillStyle = red;
    const pu = still ? 0 : (now / 1000) % 1.6 / 1.6;
    g.beginPath(); g.arc(cx, cy, 4.5, 0, 6.3); g.fill();
    g.strokeStyle = red; g.globalAlpha = 1 - pu; g.beginPath(); g.arc(cx, cy, 5 + pu * 26, 0, 6.3); g.stroke();
    g.globalAlpha = 0.85; g.fillStyle = fg; g.textAlign = "center"; g.fillText("YOU", cx, cy + 18);
    // A line from the picked signal to its window.
    const win = $("#radar .rd-detail");
    if (picked && !win.hidden) {
      const s = list.find((x) => x.id === picked.id);
      if (s) {
        const [x, y] = pos(s), br = win.getBoundingClientRect(), cr = canvas.getBoundingClientRect();
        const ex = br.left - cr.left, ey = Math.max(br.top - cr.top + 20, Math.min(br.bottom - cr.top - 20, y));
        g.globalAlpha = 0.85; g.strokeStyle = sig; g.lineWidth = 1.2; g.setLineDash([4, 4]);
        g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey); g.stroke(); g.setLineDash([]);
      }
    }
    g.globalAlpha = 1;
    // The HUD in the corners: the sweep's bearing and the strongest contact on it.
    if (!draw.hud || now - draw.hud > (still ? 900 : 250)) {
      draw.hud = now;
      const brg = Math.round(((sweep * 180) / Math.PI + 90 + 360) % 360);
      const onBeam = list.filter((sg) => { const a = pos(sg)[2]; const d = Math.abs(((a - sweep + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); return d < 0.25; }).sort((x, y) => y.signal - x.signal)[0];
      $("#radar .rd-hud-brg").textContent = `BEARING ${String(brg).padStart(3, "0")}°`;
      $("#radar .rd-hud-sig").textContent = onBeam ? `CONTACT ${(onBeam.name || "HIDDEN").slice(0, 16).toUpperCase()} ${onBeam.dbm} dBm` : "NO CONTACT ON BEAM";
      $("#radar .rd-hud-scan").textContent = `SCAN #${scans} · ${lastScanAt ? Math.round((Date.now() - lastScanAt) / 1000) + " S AGO" : "…"} · ${list.length} CONTACTS`;
    }
    if (!still) raf = requestAnimationFrame(draw); else setTimeout(() => (raf = requestAnimationFrame(draw)), 500);
  }

  // ------------------------------------------------------ list & detail

  const bars = (s) => "▂▄▆█".slice(0, Math.max(1, Math.ceil(s.signal / 25))).padEnd(4, "·");
  function list() {
    const box = $("#radar .rd-list"), all = signals();
    $("#radar .rd-count").textContent = all.length ? `· ${all.length}` : "";
    const w = data.wifi, b = data.bluetooth;
    let html = "";
    if (data.windows) html += `<p class="lib-note">On Windows the radar hears Wi-Fi networks. Bluetooth devices and the kill switch aren't available here: use Windows' airplane mode to switch every radio off.</p>`;
    if (data.wsl) html += `<p class="lib-note">Umbra is running inside Windows (WSL). Windows keeps Wi-Fi and Bluetooth to itself, so the radar can't hear any signals here; the system panels still work.</p>`;
    else if (show.wifi && w.available === false) html += `<p class="lib-note">No Wi-Fi adapter found.</p>`;
    else if (show.wifi && w.enabled === false) html += `<p class="lib-note">Wi-Fi is switched off. Turn it on to see the networks around you.</p>`;
    if (show.bt && b.available && (b.enabled === false || !b.powered)) html += `<p class="lib-note">Bluetooth is off. Switch it on (Omarchy: the Bluetooth menu, or <code>rfkill unblock bluetooth</code>) to see devices.</p>`;
    html += all.map((s) => `<button class="rd-row ${picked && picked.id === s.id ? "on" : ""}" data-id="${escapeHtml(s.id)}" data-type="${s.type}">
      <span class="g">${s.type === "wifi" ? G.wifi : G.bt}</span><span class="rd-name"><b></b><small>${escapeHtml(s.type === "wifi" ? `${s.band || ""} ${s.channel ? "CH " + s.channel : ""} · ${s.security}` : s.kind)}</small></span>
      <span class="rd-bars">${bars(s)}</span><em>${s.dbm} dBm</em></button>`).join("");
    box.innerHTML = html;
    box.querySelectorAll(".rd-row").forEach((r, i) => {
      const s = all[i];
      r.querySelector("b").textContent = (s.name || "(hidden network)") + (s.connected ? "  ◆" : "");
      r.addEventListener("mouseenter", Sound.hover);
      r.addEventListener("click", () => pick(s));
    });
    const chip = (k, on, text) => { const c = $(`#radar .rd-chip[data-k="${k}"]`); c.textContent = text; c.classList.toggle("off", !on); };
    chip("wifi", w.enabled !== false && w.available !== false, `WI-FI ${w.enabled === false ? "OFF" : (w.networks || []).length}`);
    chip("bt", b.enabled !== false && b.powered, `BLUETOOTH ${b.enabled === false || !b.powered ? "OFF" : (b.devices || []).length}`);
  }
  function pick(s) {
    picked = s;
    const win = $("#radar .rd-detail");
    const rows = s.type === "wifi" ? [
      ["TYPE", "Wi-Fi network" + (s.mode && s.mode !== "Infra" ? ` (${s.mode})` : "")], ["SIGNAL", `${s.signal}% · about ${s.dbm} dBm · ${near(s)}`],
      ["SECURITY", s.security || "Open"], ["BAND", [s.band, s.channel && "channel " + s.channel, s.freq && s.freq + " MHz"].filter(Boolean).join(" · ")],
      ["SPEED", s.rate], ["ADDRESS", s.bssid], ["MAKER", s.maker], ["STATUS", s.connected ? "Connected: this is your network" : "Heard, not connected"],
    ] : [
      ["TYPE", `Bluetooth · ${s.kind}`], ["SIGNAL", `${s.dbm} dBm · ${near(s)}`], ["ADDRESS", `${s.address}${s.addrType ? " (" + s.addrType + ")" : ""}`],
      ["MAKER", s.maker], ["STATUS", [s.connected && "Connected", s.paired && "Paired", s.trusted && "Trusted"].filter(Boolean).join(" · ") || "Heard nearby"],
    ];
    win.innerHTML = `<div class="mp-cf-head"><span class="mp-cf-tag">${s.type === "wifi" ? "WI-FI" : "BLUETOOTH"} · SIGNAL FILE</span><button class="ghost mp-cf-x rd-x" title="Close · Esc">✕</button></div>
      <div class="rd-d-name"><span class="g">${s.type === "wifi" ? G.wifi : G.bt}</span><b></b></div>
      <div class="rd-meter"><i style="width:${s.signal}%"></i></div>
      ${rows.filter(([, v]) => v).map(([k, v]) => `<div class="mp-cf-row"><span>${k}</span><p>${escapeHtml(String(v))}</p></div>`).join("")}
      <p class="rd-d-note">${s.type === "wifi" && /open/i.test(s.security || "") ? "Open network: anything sent over it can be read by others nearby. Use it only with care." :
        s.type === "wifi" ? "Distance is a guess from signal strength: walls, bodies and weather change it." : "Many phones and earbuds use private addresses that change, so the same device can appear under a new address."}</p>`;
    win.querySelector("b").textContent = s.name || "(hidden network)";
    win.hidden = false;
    win.classList.remove("glitch"); void win.offsetWidth; win.classList.add("glitch");
    win.querySelector(".rd-x").addEventListener("click", closeDetail);
    list();
    Sound.glitch();
  }
  // Roughly how near, from the signal strength.
  const near = (s) => s.dbm >= -50 ? "very close (a few metres)" : s.dbm >= -65 ? "close (same building)" : s.dbm >= -78 ? "near (next door, down the street)" : "far (at the edge of range)";
  function closeDetail() { const w = $("#radar .rd-detail"); if (w.hidden) return; w.hidden = true; picked = null; list(); Sound.click(); }

  // ---------------------------------------------------------- vitals

  const fmtB = (b) => (b >= 1e12 ? (b / 1e12).toFixed(1) + " TB" : b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.round(b / 1e6) + " MB");
  const fmtR = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + " MB/s" : Math.round(b / 1e3) + " KB/s");
  const spark = (arr, max, w = 200, h = 34) => {
    if (arr.length < 2) return "";
    const pts = arr.map((v, i) => `${(i / (arr.length - 1)) * w},${h - (Math.min(max, v) / max) * (h - 2) - 1}`).join(" ");
    return `<svg class="rd-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${pts}"/><polyline class="fill" points="0,${h} ${pts} ${w},${h}"/></svg>`;
  };
  const gauge = (pct, label, value) => `<div class="rd-gauge"><svg viewBox="0 0 60 36"><path class="bg" d="M6 32 A24 24 0 0 1 54 32"/>
    <path class="fg" d="M6 32 A24 24 0 0 1 54 32" style="stroke-dasharray:${(Math.max(0, Math.min(100, pct)) / 100) * 75.4} 80"/></svg><b>${value}</b><small>${label}</small></div>`;
  async function vitals() {
    clearTimeout(vitTimer);
    if ($("#radar").hidden) return;
    try { vit = await (await fetch("/api/vitals")).json(); } catch { vit = null; }
    if (vit) {
      const c = vit.cpu || {}, rx = (vit.net || []).reduce((n, x) => n + x.rx, 0), tx = (vit.net || []).reduce((n, x) => n + x.tx, 0);
      hist.cpu.push(c.total || 0); hist.rx.push(rx); hist.tx.push(tx);
      for (const k in hist) if (hist[k].length > 60) hist[k].shift();
      const mem = c.memTotal ? (c.memUsed / c.memTotal) * 100 : 0, disk = vit.disk ? (vit.disk.used / vit.disk.total) * 100 : 0;
      const up = vit.uptime ? `${Math.floor(vit.uptime / 86400)}d ${Math.floor((vit.uptime % 86400) / 3600)}h ${Math.floor((vit.uptime % 3600) / 60)}m` : "—";
      $("#radar .rd-vitals").innerHTML = `
        <div class="rd-gauges">${gauge(c.total || 0, "CPU", Math.round(c.total || 0) + "%")}${gauge(c.temp ? (c.temp / 100) * 100 : 0, "TEMP", c.temp ? c.temp + "°C" : "—")}
          ${gauge(mem, "MEMORY", Math.round(mem) + "%")}${vit.battery ? gauge(vit.battery.percent, vit.battery.status.toUpperCase().slice(0, 9), vit.battery.percent + "%") : gauge(disk, "DISK", Math.round(disk) + "%")}</div>
        <div class="rd-v"><small>PROCESSOR · LAST MINUTE</small>${spark(hist.cpu, 100)}</div>
        <div class="rd-cores">${(c.cores || []).map((v) => `<i style="height:${Math.max(4, v)}%"></i>`).join("")}</div>
        <div class="rd-v"><small>NETWORK · ↓ ${fmtR(rx)} · ↑ ${fmtR(tx)}</small>${spark(hist.rx.map((v, i) => v + hist.tx[i]), Math.max(50e3, ...hist.rx.map((v, i) => v + hist.tx[i])))}</div>
        <div class="rd-ifs">${(vit.net || []).map((n) => `<span class="${n.up ? "up" : ""}"><i></i>${n.kind.toUpperCase()}</span>`).join("")}</div>
        <div class="rd-kv"><span>DISK</span><b>${vit.disk ? `${fmtB(vit.disk.used)} of ${fmtB(vit.disk.total)}` : "—"}</b></div>
        <div class="rd-kv"><span>UPTIME</span><b>${up}</b></div>
        <div class="rd-kv"><span>CPU</span><b>${escapeHtml((c.name || "").replace(/\(R\)|\(TM\)|CPU/g, "").replace(/\s+/g, " ").trim())}</b></div>`;
    }
    spectrum();
    vitTimer = setTimeout(vitals, 1500);
  }
  // Which Wi-Fi channels are busy: a bar per channel, taller for stronger networks.
  function spectrum() {
    const c = $("#radar .rd-spectrum"), w = c.clientWidth, h = 90, d = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * d; c.height = h * d; c.style.height = h + "px";
    const x = c.getContext("2d"); x.scale(d, d);
    const chans = {};
    for (const n of data.wifi.networks || []) { const ch = +n.channel; if (ch) chans[ch] = (chans[ch] || 0) + n.signal; }
    const keys = Object.keys(chans).map(Number).sort((a, b) => a - b);
    x.fillStyle = css("--faint"); x.font = `8px ${css("--font")}`; x.textAlign = "center";
    if (!keys.length) { x.fillText("NO CHANNEL DATA", w / 2, h / 2); return; }
    const max = Math.max(...Object.values(chans)), bw = Math.max(4, (w - 10) / keys.length - 3);
    keys.forEach((k, i) => {
      const bh = (chans[k] / max) * (h - 18), bx = 5 + i * (bw + 3);
      x.fillStyle = k <= 14 ? css("--net") : css("--signal"); x.globalAlpha = 0.8;
      x.fillRect(bx, h - 12 - bh, bw, bh);
      x.globalAlpha = 1; x.fillStyle = css("--dim"); x.fillText(String(k), bx + bw / 2, h - 2);
    });
  }

  // ------------------------------------------------------ intel & log

  // INTEL: what the scan shows at a glance.
  function intel() {
    const box = $("#radar .rd-pane[data-r=intel]");
    if (!box || box.hidden) return;
    const w = data.wifi.networks || [], b = data.bluetooth.devices || [];
    const by = (arr, f) => arr.reduce((m, x) => { const k = f(x) || "?"; m[k] = (m[k] || 0) + 1; return m; }, {});
    const bands = by(w, (n) => n.band), sec = by(w, (n) => (/open/i.test(n.security) ? "OPEN" : /WPA3/.test(n.security) ? "WPA3" : /WPA2/.test(n.security) ? "WPA2" : /WPA|WEP/.test(n.security) ? "OLD (WPA/WEP)" : n.security || "?"));
    const makers = Object.entries(by([...w, ...b].filter((x) => x.maker && x.maker !== "Private address"), (x) => x.maker.split(/[ ,]/)[0])).sort((x, y) => y[1] - x[1]).slice(0, 5);
    const strongest = [...w, ...b].sort((x, y) => y.signal - x.signal)[0];
    const avg = w.length ? Math.round(w.reduce((n, x) => n + x.dbm, 0) / w.length) : 0;
    const hidden = w.filter((n) => !n.name).length, open = w.filter((n) => /open/i.test(n.security));
    const bar = (m) => { const tot = Object.values(m).reduce((a, x) => a + x, 0) || 1; return Object.entries(m).map(([k, v]) => `<div class="rd-bar"><span>${escapeHtml(k)}</span><i style="width:${(v / tot) * 100}%"></i><b>${v}</b></div>`).join(""); };
    box.innerHTML = `<div class="rd-h"><span class="rd-blink">●</span> SIGNAL INTELLIGENCE</div>
      <div class="rd-kpis"><span><small>WI-FI</small><b>${w.length}</b></span><span><small>BLUETOOTH</small><b>${b.length}</b></span>
        <span><small>HIDDEN</small><b>${hidden}</b></span><span class="${open.length ? "warn" : ""}"><small>OPEN</small><b>${open.length}</b></span></div>
      <div class="rd-v"><small>CONTACTS OVER TIME</small>${spark(hist.count, Math.max(5, ...hist.count))}</div>
      <div class="rd-h">BANDS</div>${bar(bands) || `<p class="lib-note">—</p>`}
      <div class="rd-h">SECURITY</div>${bar(sec) || `<p class="lib-note">—</p>`}
      ${open.length ? `<p class="rd-warn">⚠ ${open.length} open network${open.length > 1 ? "s" : ""}: anyone nearby can read what's sent over ${open.length > 1 ? "them" : "it"}.</p>` : ""}
      <div class="rd-h">MAKERS</div>${makers.length ? makers.map(([k, v]) => `<div class="rd-kv"><span>${escapeHtml(k.toUpperCase())}</span><b>${v}</b></div>`).join("") : `<p class="lib-note">Most devices hide their maker behind private addresses.</p>`}
      <div class="rd-h">READINGS</div>
      <div class="rd-kv"><span>STRONGEST</span><b>${strongest ? escapeHtml((strongest.name || "hidden").slice(0, 22)) + " · " + strongest.dbm + " dBm" : "—"}</b></div>
      <div class="rd-kv"><span>AVERAGE WI-FI</span><b>${w.length ? avg + " dBm" : "—"}</b></div>
      <div class="rd-kv"><span>SCANS</span><b>${scans}</b></div>`;
  }
  // DEVICES: a steady list of everything the radar has ever heard, in range
  // or not, grouped by kind. NEW marks devices first heard in the last day
  // (not the ones from the very first scan).
  let known = {}, kfilter = "all";
  const DAY = 864e5;
  const isNew = (k) => !k.baseline && Date.now() - k.first < DAY;
  const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  function logView() {
    const box = $("#radar .rd-log");
    if (!box) return;
    const live = new Set([...(data.wifi.networks || []).map((n) => "wifi:" + n.id), ...(data.bluetooth.devices || []).map((d) => "bt:" + d.id)]);
    const all = Object.entries(known).map(([key, k]) => ({ key, ...k, live: live.has(key) }));
    const news = all.filter(isNew).length;
    const n = $("#radar .rd-logn"); if (n) n.textContent = news ? news + " NEW" : "";
    if (box.closest(".rd-pane").hidden) return;
    $("#radar .rd-kcount").textContent = `· ${all.length}`;
    const pick = all.filter((k) => kfilter === "all" || (kfilter === "range" ? k.live : isNew(k)))
      .sort((a, b) => (b.live - a.live) || (isNew(b) - isNew(a)) || (b.last - a.last));
    const group = (type, title) => {
      const list = pick.filter((k) => k.type === type);
      if (!list.length) return "";
      return `<div class="rd-kgroup">${title} · ${list.length}</div>` + list.map((k) => `<div class="rd-krow ${k.live ? "live" : ""}" data-key="${escapeHtml(k.key)}">
        <i class="rd-kdot"></i><span class="rd-kname"><b></b><small>${escapeHtml([k.detail, k.band, k.maker].filter(Boolean).join(" · "))}</small></span>
        <span class="rd-kmeta">${isNew(k) ? `<em class="rd-new">NEW</em>` : ""}${k.live ? `<b>${k.dbm} dBm</b>` : `<small>${ago(k.last)}</small>`}<small>seen ${k.count}×</small></span></div>`).join("");
    };
    box.innerHTML = (group("wifi", "WI-FI") + group("bt", "BLUETOOTH")) || `<p class="lib-note">${kfilter === "new" ? "Nothing new in the last day." : "No devices yet: the list fills as the radar scans."}</p>`;
    box.querySelectorAll(".rd-krow").forEach((r) => {
      const k = known[r.dataset.key];
      r.querySelector("b").textContent = k.name || (k.type === "wifi" ? "(hidden network)" : "Unnamed device");
      r.addEventListener("click", () => {
        const s = signals().find((x) => (x.type === "bt" ? "bt:" : "wifi:") + x.id === r.dataset.key);
        if (s) pick(s); else Sound.error();
      });
    });
  }
  function logScan() {
    if (data.known) known = data.known;
    const cur = (data.wifi.networks || []).length + (data.bluetooth.devices || []).length;
    const fresh = Object.values(known).filter((k) => isNew(k) && Date.now() - k.first < 20000).length;
    if (fresh && scans > 1) Sound.found();
    hist.count.push(cur); if (hist.count.length > 60) hist.count.shift();
    logView(); intel();
  }

  // ----------------------------------------------- full screen, kill switch

  function fullscreen() {
    fullOn = !fullOn;
    $("#radar").classList.toggle("full", fullOn);
    $("#radar .rd-full").classList.toggle("on", fullOn);
    window.umbraNative(fullOn ? "fullscreen" : "unfullscreen");
    Sound.click();
  }
  async function kill(off) {
    if (off) {
      const ok = await confirmDialog({ kind: "error", tag: "KILL SWITCH", title: "GO DARK?",
        body: "Wi-Fi, mobile data and Bluetooth are switched off at once. This computer disconnects from networks and from Bluetooth devices (headphones, mice). Umbra keeps working fully offline. Turn them back on here with RESTORE RADIOS.",
        ok: "KILL ALL RADIOS", cancel: "CANCEL" });
      if (!ok) return;
    }
    const r = await fetch("/api/radios", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ off }) }).then((x) => x.json()).catch(() => null);
    killed = off && !!r && r.done.length > 0;
    $("#radar .rd-dark").hidden = !killed;
    $("#radar .rd-kill").classList.toggle("on", killed);
    events.push({ t: Date.now(), kind: off ? "lost" : "new", text: r ? `${off ? "Kill switch" : "Radios restored"}: ${r.done.join(", ") || "nothing could be changed"}${r.failed.length ? " · failed: " + r.failed.join(", ") : ""}` : "Kill switch: no answer from Umbra" });
    logView();
    off ? Sound.lock() : Sound.unlock();
    if (!r || (off && !r.done.length)) confirmDialog({ kind: "error", tag: "KILL SWITCH", title: "COULDN'T SWITCH THE RADIOS", body: "This system didn't allow it. Use the Wi-Fi and Bluetooth menus of your desktop, or your laptop's flight-mode key.", cancel: "OK" });
    setTimeout(() => scan(true), 1500);
  }

  // ------------------------------------------------------------ scanning

  async function scan(force = false) {
    clearTimeout(scanTimer);
    if ($("#radar").hidden) return;
    const re = force || Date.now() - lastScan > 30000;
    if (re) lastScan = Date.now();
    $("#radar .rd-scan").classList.add("busy");
    try { data = await (await fetch("/api/radar" + (re ? "?scan=1" : ""))).json(); scans++; lastScanAt = Date.now(); logScan(); } catch {}
    $("#radar .rd-scan").classList.remove("busy");
    if (picked) { const s = signals().find((x) => x.id === picked.id); if (s && !$("#radar .rd-detail").hidden) picked = s; }
    list();
    if (force) Sound.found();
    $("#radar .rd-kill").hidden = !!(data.wsl || data.windows);   // no radios to switch inside WSL or from the Windows app
    scanTimer = setTimeout(scan, 10000);
  }

  // ------------------------------------------------------ open / close

  function toggle(on = $("#radar").hidden, quiet = false) {
    if (on && locked) return;
    const el = $("#radar");
    if (!on) {
      if (el.hidden) return;
      if (fullOn) fullscreen();
      el.hidden = true; document.body.classList.remove("radar-open"); $("#radar-btn")?.classList.remove("on");
      clearTimeout(scanTimer); clearTimeout(vitTimer); cancelAnimationFrame(raf); raf = 0; ro.disconnect();
      if (!quiet) { Sound.click(); if (typeof goBack === "function") goBack(); }
      if (window.startRain) startRain();
      return;
    }
    if (window.closeSettings) window.closeSettings();
    if (window.closeLoadout) window.closeLoadout(true);
    if (window.closeHistory) window.closeHistory();
    if (window.closeFieldKit) window.closeFieldKit();
    if (window.closeMaps) window.closeMaps();
    window.closeGalaxy?.();
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    el.hidden = false; document.body.classList.add("radar-open"); $("#radar-btn")?.classList.add("on");
    if (window.stopRain) stopRain();
    ro.observe(el.querySelector(".rd-center"));
    resize();
    list(); scan(true); vitals();
    if (window.track) track("radarOpened");
    if (!raf) raf = requestAnimationFrame(draw);
    Sound.searchstart();
  }

  build();
  const btn = $("#radar-btn");
  if (btn) btn.addEventListener("click", () => toggle());
  document.addEventListener("keydown", (e) => {
    if ($("#radar").hidden || !$("#modal").hidden) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); if (!$("#radar .rd-detail").hidden) closeDetail(); else if (fullOn) fullscreen(); else toggle(false); }
    else if (e.key.toLowerCase() === "f" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); fullscreen(); }
    else if (e.key.toLowerCase() === "s" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); scan(true); Sound.searchstart(); }
  }, true);
  new MutationObserver(() => { if (document.body.classList.contains("locked") && !$("#radar").hidden) toggle(false, true); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.toggleRadar = toggle;
  window.closeRadar = () => toggle(false, true);
})();
