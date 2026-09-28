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
  const hist = { cpu: [], rx: [], tx: [] };
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
          <button class="ghost rd-scan" title="Scan now|Asks the radios to listen again (a few seconds).">${G.scan} SCAN</button>
          <button class="ghost rd-close" title="Close · Esc|Back to where you were.">CLOSE ✕</button></div></div>
      <div class="rd-body">
        <aside class="rd-left"><div class="rd-h">SIGNALS <small class="rd-count"></small></div><div class="rd-list"></div></aside>
        <div class="rd-center"><canvas class="rd-canvas"></canvas><div class="rd-detail" hidden></div>
          <p class="rd-note">Only the radios need to be on: no internet. Passive: Umbra connects to nothing and keeps nothing.</p></div>
        <aside class="rd-right"><div class="rd-h">SYSTEM</div><div class="rd-vitals"></div>
          <div class="rd-h">WI-FI CHANNELS</div><canvas class="rd-spectrum"></canvas></aside>
      </div>`;
    document.body.appendChild(el);
    canvas = el.querySelector(".rd-canvas"); g = canvas.getContext("2d");
    el.querySelector(".rd-close").addEventListener("click", () => toggle(false));
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
    const bg = css("--bg") || "#000", fg = css("--fg") || "#ccc", faint = css("--faint") || "#555", red = css("--red") || "#e06a6a";
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.44;
    // The scope: a dim disc, rings with signal levels, a crosshair, bearings.
    const disc = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    disc.addColorStop(0, ca(sig, 0.08)); disc.addColorStop(1, ca(sig, 0.02));
    g.fillStyle = disc; g.beginPath(); g.arc(cx, cy, R, 0, 6.3); g.fill();
    g.strokeStyle = sig; g.lineWidth = 1;
    g.font = `600 9px ${css("--font")}`; g.textAlign = "left"; g.textBaseline = "middle";
    [[0.25, "-40 dBm"], [0.5, "-55"], [0.75, "-70"], [1, "-90"]].forEach(([k, label]) => {
      g.globalAlpha = k === 1 ? 0.55 : 0.22; g.beginPath(); g.arc(cx, cy, R * k, 0, 6.3); g.stroke();
      g.globalAlpha = 0.45; g.fillStyle = sig; g.fillText(label, cx + 4, cy - R * k + 8);
    });
    g.globalAlpha = 0.18;
    g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
    for (let d = 0; d < 360; d += 10) {
      const a = (d - 90) * Math.PI / 180, l = d % 30 ? 5 : 10;
      g.globalAlpha = d % 30 ? 0.25 : 0.55;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); g.lineTo(cx + Math.cos(a) * (R + l), cy + Math.sin(a) * (R + l)); g.stroke();
      if (!(d % 90)) { g.fillStyle = sig; g.textAlign = "center"; g.fillText(String(d).padStart(3, "0"), cx + Math.cos(a) * (R + 20), cy + Math.sin(a) * (R + 20)); }
    }
    // The sweep: a bright line with a fading wake.
    if (!still) sweep = (sweep + dt * 1.6) % (Math.PI * 2);
    const wake = g.createConicGradient ? g.createConicGradient(sweep - 1.2, cx, cy) : null;
    if (wake) {
      wake.addColorStop(0, ca(sig, 0)); wake.addColorStop(0.19, ca(sig, 0.23)); wake.addColorStop(0.191, ca(sig, 0)); wake.addColorStop(1, ca(sig, 0));
      g.globalAlpha = 1; g.fillStyle = wake; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, sweep - 1.2, sweep + 0.01); g.closePath(); g.fill();
    }
    g.globalAlpha = 0.9; g.strokeStyle = sig; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sweep) * R, cy + Math.sin(sweep) * R); g.stroke();
    // The blips: lit by the sweep, fading after it (phosphor).
    const list = signals();
    g.font = `600 9.5px ${css("--font")}`; g.textAlign = "left";
    for (const s of list) {
      const [x, y, a] = pos(s);
      const behind = ((sweep - ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) + 4 * Math.PI) % (2 * Math.PI);
      if (behind < dt * 1.7 + 0.02) lit.set(s.id, now);
      const age = (now - (lit.get(s.id) || 0)) / 1000, glow = still ? 1 : Math.max(0.25, 1 - age / 3.8);
      const col = s.type === "wifi" ? net : acc;
      g.globalAlpha = glow;
      g.fillStyle = col; g.strokeStyle = col;
      if (s.type === "wifi") { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); }
      else { g.beginPath(); g.arc(x, y, 4, 0, 6.3); g.fill(); }
      if (glow > 0.8 && !still) { g.globalAlpha = (glow - 0.8) * 3; g.beginPath(); g.arc(x, y, 6 + (1 - glow) * 40, 0, 6.3); g.lineWidth = 1; g.stroke(); }
      if (s.connected || s.paired) { g.globalAlpha = 0.9; g.lineWidth = 1.4; g.beginPath(); g.arc(x, y, 9, 0, 6.3); g.stroke(); }
      if (picked && picked.id === s.id) {
        g.globalAlpha = 1; g.strokeStyle = sig; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 13, 0, 6.3); g.stroke();
        g.beginPath(); g.moveTo(x - 18, y); g.lineTo(x - 8, y); g.moveTo(x + 8, y); g.lineTo(x + 18, y); g.moveTo(x, y - 18); g.lineTo(x, y - 8); g.moveTo(x, y + 8); g.lineTo(x, y + 18); g.stroke();
      }
      if (s.signal >= 55 || (picked && picked.id === s.id)) {
        g.globalAlpha = Math.max(0.5, glow); g.fillStyle = fg;
        g.fillText((s.name || "hidden").slice(0, 18), x + 9, y - 8);
      }
    }
    // You, in the centre.
    g.globalAlpha = 1; g.fillStyle = red;
    const p = still ? 0 : (now / 1000) % 1.6 / 1.6;
    g.beginPath(); g.arc(cx, cy, 4.5, 0, 6.3); g.fill();
    g.strokeStyle = red; g.globalAlpha = 1 - p; g.beginPath(); g.arc(cx, cy, 5 + p * 24, 0, 6.3); g.stroke();
    g.globalAlpha = 0.8; g.fillStyle = fg; g.textAlign = "center"; g.fillText("YOU", cx, cy + 18);
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
    if (!still) raf = requestAnimationFrame(draw); else setTimeout(() => (raf = requestAnimationFrame(draw)), 500);
  }

  // ------------------------------------------------------ list & detail

  const bars = (s) => "▂▄▆█".slice(0, Math.max(1, Math.ceil(s.signal / 25))).padEnd(4, "·");
  function list() {
    const box = $("#radar .rd-list"), all = signals();
    $("#radar .rd-count").textContent = all.length ? `· ${all.length}` : "";
    const w = data.wifi, b = data.bluetooth;
    let html = "";
    if (show.wifi && w.available === false) html += `<p class="lib-note">No Wi-Fi adapter found.</p>`;
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

  // ------------------------------------------------------------ scanning

  async function scan(force = false) {
    clearTimeout(scanTimer);
    if ($("#radar").hidden) return;
    const re = force || Date.now() - lastScan > 30000;
    if (re) lastScan = Date.now();
    $("#radar .rd-scan").classList.add("busy");
    try { data = await (await fetch("/api/radar" + (re ? "?scan=1" : ""))).json(); } catch {}
    $("#radar .rd-scan").classList.remove("busy");
    if (picked) { const s = signals().find((x) => x.id === picked.id); if (s && !$("#radar .rd-detail").hidden) picked = s; }
    list();
    if (force) Sound.found();
    scanTimer = setTimeout(scan, 10000);
  }

  // ------------------------------------------------------ open / close

  function toggle(on = $("#radar").hidden, quiet = false) {
    if (on && locked) return;
    const el = $("#radar");
    if (!on) {
      if (el.hidden) return;
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
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    el.hidden = false; document.body.classList.add("radar-open"); $("#radar-btn")?.classList.add("on");
    if (window.stopRain) stopRain();
    ro.observe(el.querySelector(".rd-center"));
    resize();
    list(); scan(true); vitals();
    if (!raf) raf = requestAnimationFrame(draw);
    Sound.searchstart();
  }

  build();
  const btn = $("#radar-btn");
  if (btn) btn.addEventListener("click", () => toggle());
  document.addEventListener("keydown", (e) => {
    if ($("#radar").hidden || !$("#modal").hidden) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); if (!$("#radar .rd-detail").hidden) closeDetail(); else toggle(false); }
    else if (e.key.toLowerCase() === "s" && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); scan(true); Sound.searchstart(); }
  }, true);
  new MutationObserver(() => { if (document.body.classList.contains("locked") && !$("#radar").hidden) toggle(false, true); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.toggleRadar = toggle;
  window.closeRadar = () => toggle(false, true);
})();
