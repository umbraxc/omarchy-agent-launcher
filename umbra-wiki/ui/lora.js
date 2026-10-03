// Umbra Wiki LoRa mesh, the second mode of Signals: Meshtastic radios send
// messages, check-ins, positions and waypoints over kilometres, with no phone
// network and no internet, each radio relaying the others.
// Without a radio: a guide that explains it, lists what to buy (with a
// search), and walks through the setup, watching for a radio on USB. With a
// radio: a control board (the radio's status, the nodes on a scope, the mesh
// chat, and its settings: name, region, preset, a private channel).
// Loaded after app.js, ascii3d.js and qr.js; radar.js hosts it.
"use strict";

window.UmbraLora = (() => {
  const esc = (s) => escapeHtml(String(s ?? ""));
  const post = (url, body = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false, message: "No answer." }));
  const calm = () => document.body.classList.contains("reduce-motion") || window.offgrid;
  let host = null, st = null, poll = 0, stops = [], selected = null, sig = "", chatSig = "", view = "";
  const REGIONS = [["EU_868", "Europe, UK (868 MHz)"], ["US", "Americas (915 MHz)"], ["ANZ", "Australia, New Zealand (915 MHz)"], ["EU_433", "Europe (433 MHz)"],
    ["IN", "India (865 MHz)"], ["JP", "Japan (920 MHz)"], ["KR", "Korea (920 MHz)"], ["TW", "Taiwan (920 MHz)"], ["CN", "China (470 MHz)"], ["RU", "Russia (868 MHz)"],
    ["NZ_865", "New Zealand (865 MHz)"], ["TH", "Thailand (920 MHz)"], ["UA_868", "Ukraine (868 MHz)"], ["MY_919", "Malaysia (919 MHz)"], ["SG_923", "Singapore (923 MHz)"],
    ["PH_915", "Philippines (915 MHz)"], ["BR_902", "Brazil (902 MHz)"], ["LORA_24", "Worldwide 2.4 GHz (special radios)"]];
  const PRESETS = [["LONG_FAST", "Long range, fast · the default, what most meshes use"], ["LONG_MODERATE", "Long range, steadier"], ["LONG_SLOW", "Longest range, slow"],
    ["MEDIUM_FAST", "Medium range, quicker"], ["SHORT_FAST", "Short range, fastest"]];
  const RADIOS = [
    ["Heltec WiFi LoRa 32 V3", "€20–30", "The cheapest way in: a small screen, Wi-Fi and Bluetooth. Add a case and a battery.", "heltec"],
    ["LilyGO T-Beam Supreme", "€45–60", "GPS built in and an 18650 battery holder: a complete handheld base station.", "tbeam"],
    ["RAK WisBlock Meshtastic Starter Kit", "€30–45", "Sips power and runs for weeks on a battery: the ideal relay on a roof or a hill.", "rak"],
    ["Seeed SenseCAP T1000-E", "€35–45", "Card-sized, waterproof, GPS: charge it and carry it. Paired by Bluetooth or USB.", "card"],
    ["LilyGO T-Deck Plus", "€60–80", "A keyboard and screen: send messages without a computer or phone.", "deck"]];

  // ------------------------------------------------------------- art
  // A radio in 3D characters: a body, a glowing screen and an antenna, with
  // radio rings rising from the tip.
  function radioScene(online) {
    const A = window.Ascii3D, { sd, hex, mix } = A;
    const net = hex(getComputedStyle(document.documentElement).getPropertyValue("--net").trim() || "#5fb8c9");
    const sig = hex(getComputedStyle(document.documentElement).getPropertyValue("--signal").trim() || "#e8d27c");
    const U = (b, d, m, h) => { if (d < b[0]) { b[0] = d; h.m = m; } };
    return {
      fps: 14, camera: () => ({ pos: [1.1, 1.55, 4.6], at: [0.05, 1.05, 0], fovV: 40 }), light: [-0.5, 0.8, 0.6], ambient: 0.34, stillTime: 2,
      map(x, y, z, t, h) {
        const b = [y + 0.02, "ground"]; h.m = "ground";
        U(b, sd.rbox(x, y - 0.55, z, 0.46, 0.55, 0.16, 0.06), "body", h);
        U(b, sd.box(x, y - 0.78, z - 0.165, 0.32, 0.2, 0.01), "screen", h);
        for (const [bx, by] of [[-0.18, 0.3], [0, 0.3], [0.18, 0.3]]) U(b, sd.cyl(x - bx, (z + 0.17), y - by, 0.045, 0.02), "button", h);
        U(b, sd.capsule(x, y, z, 0.3, 1.08, 0, 0.3, 2.05, 0, 0.065), "antenna", h);
        U(b, sd.cyl(x - 0.3, y - 1.12, z, 0.1, 0.06), "button", h);
        U(b, sd.sphere(x - 0.3, y - 2.1, z, 0.1), "tip", h);
        h.m = h.m; return b[0];
      },
      materials: {
        ground: { color: [40, 44, 52], ramp: " .:-", shade(c) { c.glyph = (Math.floor(c.x * 6) + Math.floor(c.z * 6)) % 2 ? "·" : " "; } },
        body: { color: [104, 112, 126], ramp: " .:-=+*#%@" },
        screen: { color: online ? net : [60, 70, 80], shade(c, t) { c.emit = online ? 0.55 + 0.2 * Math.sin(t * 2 + c.x * 9) : 0.12; c.glyph = online ? "▒" : "·"; } },
        button: { color: [120, 120, 130], ramp: " .:o@" },
        antenna: { color: [150, 156, 168], ramp: " .:|#" },
        tip: { color: online ? sig : [80, 80, 80], shade(c, t) { c.emit = online ? 0.6 + 0.4 * Math.max(0, Math.sin(t * 5)) : 0.2; c.glyph = "@"; } },
      },
      particles(t, put) {
        if (!online) return;
        for (let k = 0; k < 4; k++) {
          const r = ((t * 0.55 + k / 4) % 1) * 2.4;
          for (let a = 0; a < 40; a++) {
            const ang = (a / 40) * Math.PI * 2;
            put(0.3 + Math.cos(ang) * r, 2.1 + Math.sin(ang) * r * 0.55, Math.sin(ang) * r * 0.3, a % 2 ? "·" : "o", mix(net, sig, k / 4), Math.max(0, 1 - r / 2.4) * 0.9);
          }
        }
      },
    };
  }
  function art(canvas, online) {
    if (!window.Ascii3D || calm()) return;
    try { const v = Ascii3D.view(canvas, radioScene(online), { cell: 7 }); stops.push(() => v.stop()); } catch {}
  }

  // ------------------------------------------------------------ setup
  async function refresh(force) {
    const s = await fetch("/api/lora").then((r) => r.json()).catch(() => null);
    if (!s || !host?.isConnected) return;
    st = s;
    for (const e of s.events || []) {
      if (e.t === "msg") { window.umbraToast?.(`⌁ ${e.from}: ${e.text}`); Sound.found(); }
      if (e.t === "connected") { Sound.online(); }
      if (e.t === "lost") { window.umbraToast?.("⌁ The radio was disconnected."); Sound.error(); }
      if (e.t === "error") window.umbraToast?.(`⌁ ${e.message}`);
    }
    const want = s.connected ? "board" : "setup";
    if (want !== view || force) { view = want; (want === "board" ? board : setup)(); }
    else if (want === "board") updateBoard();
    else updateSetup();
  }
  function cleanup() { stops.forEach((f) => { try { f(); } catch {} }); stops = []; }

  function setup() {
    cleanup();
    host.innerHTML = `<div class="lr-setup">
      <div class="lr-hero"><canvas class="lr-art"></canvas>
        <div class="lr-hero-text"><small>⌁ LORA MESH · MESHTASTIC</small><h2>Messages over kilometres. No network.</h2>
          <p>LoRa radios talk to each other directly, over 2 to 10 km and more from high ground, using free public radio bands: no phone network, no internet, no licence. Every radio relays the others, so a group covers a whole valley.</p>
          <ul><li><b>Text and check-ins</b> between radios, from Umbra.</li><li><b>Positions and waypoints</b> on your Maps.</li><li><b>Encrypted channels</b> for your own group.</li><li><b>Tiny and frugal</b>: days on a small battery.</li></ul>
          <p class="lr-small">Limits: short messages (about 200 characters) and slow airtime; no pictures or calls.</p></div></div>
      <div class="lr-steps">
        <section class="lr-step" data-s="buy"><h3><i>1</i> GET TWO RADIOS</h3><p>Any radio that runs <b>Meshtastic</b> (open source). Buy the version for your region's band: <b>868 MHz</b> in Europe and the UK, <b>915 MHz</b> in the Americas and Australia.</p>
          <div class="lr-shop">${RADIOS.map(([n, price, why, k]) => `<div class="lr-radio"><pre class="lr-ico">${esc(ICONS[k])}</pre><div><b>${esc(n)}</b><small>${esc(price)}</small><p>${esc(why)}</p></div>
            <button type="button" class="ghost" data-search="${esc(n)}" title="Search online|Opens your web browser">SEARCH ▸</button></div>`).join("")}</div></section>
        <section class="lr-step warn"><h3><i>2</i> ANTENNA FIRST</h3><p>Always screw the antenna on <b>before</b> powering a radio: transmitting without one can damage it.</p></section>
        <section class="lr-step"><h3><i>3</i> PUT MESHTASTIC ON THEM</h3><p>Most radios need the Meshtastic firmware once. Use the official web flasher in Chrome or Edge: plug the radio in, pick its model, click Flash.</p>
          <button type="button" class="ghost" data-open="https://flasher.meshtastic.org">OPEN THE FLASHER ▸</button> <button type="button" class="ghost" data-open="https://meshtastic.org/docs/getting-started/">MESHTASTIC GUIDE ▸</button></section>
        <section class="lr-step" data-s="engine"><h3><i>4</i> UMBRA'S RADIO SOFTWARE</h3><div class="lr-engine"></div></section>
        <section class="lr-step" data-s="plug"><h3><i>5</i> PLUG IT IN</h3><div class="lr-found"></div>
          <form class="lr-host"><label>OR A RADIO ON YOUR NETWORK <input placeholder="its address, like 192.168.4.1" maxlength="80"></label><button class="ghost" type="submit">CONNECT ▸</button></form></section>
        <section class="lr-step"><h3><i>6</i> NAME IT, SET THE REGION</h3><p>Once connected, Umbra asks for your region (the radio stays silent until it's set) and a name, and can make a private, encrypted channel for your group.</p></section>
      </div></div>`;
    art(host.querySelector(".lr-art"), true);
    host.querySelectorAll("[data-search]").forEach((b) => b.addEventListener("click", () => { Sound.click(); openUrl("https://duckduckgo.com/?q=" + encodeURIComponent(b.dataset.search + " meshtastic")); }));
    host.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => { Sound.click(); openUrl(b.dataset.open); }));
    host.querySelector(".lr-host").addEventListener("submit", async (e) => { e.preventDefault(); const v = e.target.querySelector("input").value.trim(); if (v) connect({ host: v }); });
    updateSetup();
  }
  const openUrl = (url) => post("/api/open", { url });
  function updateSetup() {
    const s = st, eng = host.querySelector(".lr-engine"), found = host.querySelector(".lr-found");
    if (!eng) return;
    const k = JSON.stringify([s.engine, s.install, s.radios, s.error]);
    if (k === sig) return;
    sig = k;
    eng.innerHTML = s.engine ? `<p class="lr-ok">✓ Installed. Umbra can talk to Meshtastic radios.</p>`
      : s.install?.active ? `<p><span class="spin" data-spin>✻</span> Installing the radio software (about 35 MB)…</p>`
      : `${s.install?.phase === "error" ? `<p class="lr-bad">${esc(s.install.error)}</p>` : ""}<p>Umbra uses the official Meshtastic software to talk to radios. One download of about 35 MB, with internet; after that it works offline.</p>
         <button type="button" class="solid lr-install">⇣ INSTALL THE RADIO SOFTWARE</button>`;
    eng.querySelector(".lr-install")?.addEventListener("click", async () => { Sound.click(); await post("/api/lora/install"); refresh(); });
    const radios = s.radios || [];
    found.innerHTML = radios.length ? radios.map((r) => `<div class="lr-dev ${r.access ? "" : "noaccess"}"><span class="lr-dot"></span><div><b>${esc(r.name || r.kind)}</b><small>${esc(r.path)} · ${esc(r.kind)}</small>
        ${r.access ? "" : `<p class="lr-bad">Umbra may not use serial ports yet. Allow it (your password is asked), then log out and back in.</p>`}</div>
        ${r.access ? `<button type="button" class="solid" data-port="${esc(r.path)}" ${s.engine ? "" : "disabled"}>CONNECT ▸</button>` : `<button type="button" class="ghost lr-perm">ALLOW ▸</button>`}</div>`).join("")
      : `<p class="lr-wait"><span class="spin" data-spin>✻</span> Watching for a radio on USB… plug one in with a data cable.</p>`;
    if (s.error) found.insertAdjacentHTML("beforeend", `<p class="lr-bad">⌁ ${esc(s.error)}</p>`);
    found.querySelectorAll("[data-port]").forEach((b) => b.addEventListener("click", () => connect({ port: b.dataset.port })));
    found.querySelector(".lr-perm")?.addEventListener("click", async () => {
      Sound.click();
      const r = await post("/api/lora/permission");
      window.umbraToast?.(r.ok ? `Done: log out and back in, and Umbra can use the radio (group ${r.group}).` : r.message || "The permission wasn't changed.");
    });
  }
  async function connect(how) {
    Sound.click();
    const r = await post("/api/lora/connect", how);
    if (r.ok === false) { window.umbraToast?.(r.message); Sound.error(); return; }
    window.umbraToast?.("⌁ Connecting to the radio…");
    setTimeout(() => refresh(), 1500);
  }

  // ------------------------------------------------------- the board
  function board() {
    cleanup();
    sig = chatSig = "";
    host.innerHTML = `<div class="lr-board">
      <div class="lr-strip"></div>
      <div class="lr-main">
        <aside class="lr-nodes"><div class="rd-h">RADIOS ON THE MESH <small class="lr-ncount"></small></div><div class="lr-nlist"></div></aside>
        <div class="lr-center"><canvas class="lr-scope"></canvas><div class="lr-node-card" hidden></div><canvas class="lr-art lr-art-small"></canvas></div>
        <aside class="lr-chat"><div class="rd-h">MESH CHAT <small class="lr-to">TO EVERYONE</small></div><div class="lr-msgs"></div>
          <div class="lr-quick"><button type="button" class="ghost" data-q="ok" title="Check in|Tells the mesh you're OK">◉ I'M OK</button><button type="button" class="ghost" data-q="pos" title="Send a position|One of your waypoints, or your home">⌖ POSITION</button><button type="button" class="ghost" data-q="wp" title="Send a waypoint|It appears on their map">◈ WAYPOINT</button></div>
          <form class="lr-say"><input maxlength="200" placeholder="Message the mesh… (200 characters)"><button class="solid" type="submit">SEND ⏎</button></form>
          <small class="lr-left">200</small></aside>
      </div>
      <div class="lr-settings" hidden></div></div>`;
    art(host.querySelector(".lr-art-small"), true);
    const say = host.querySelector(".lr-say input");
    say.addEventListener("input", () => { host.querySelector(".lr-left").textContent = 200 - new TextEncoder().encode(say.value).length; });
    host.querySelector(".lr-say").addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = say.value.trim(); if (!text) return;
      const r = await post("/api/lora/send", { cmd: "text", text, to: selected || "" });
      if (r.ok === false) { window.umbraToast?.(r.message); Sound.error(); return; }
      say.value = ""; Sound.send(); refresh();
    });
    host.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => quick(b.dataset.q)));
    const scope = host.querySelector(".lr-scope");
    scope.addEventListener("click", (e) => { const r = scope.getBoundingClientRect(), hit = (scope._hits || []).find((h) => Math.hypot(h.x - (e.clientX - r.left), h.y - (e.clientY - r.top)) < 14); if (hit) pick(hit.id); });
    stops.push(scopeLoop(scope));
    updateBoard();
  }
  async function quick(q) {
    Sound.click();
    if (q === "ok") { await post("/api/lora/send", { cmd: "text", text: "◉ CHECK-IN: OK · sent from Umbra", to: selected || "" }); refresh(); return; }
    let wps = []; try { wps = await (await fetch("/api/waypoints")).json(); } catch {}
    if (!wps.length) { window.umbraToast?.("Make a waypoint on the Maps first (right-click the map)."); return; }
    const w = wps.find((x) => x.icon === "home") || wps[0];
    const pickW = await choose(q === "pos" ? "SEND WHICH POSITION?" : "SEND WHICH WAYPOINT?", wps);
    if (!pickW) return;
    await post("/api/lora/send", q === "pos" ? { cmd: "position", lat: pickW.lat, lon: pickW.lon } : { cmd: "waypoint", name: pickW.name, lat: pickW.lat, lon: pickW.lon });
    refresh();
    void w;
  }
  function choose(title, wps) {
    return new Promise((done) => {
      const box = document.createElement("div");
      box.className = "lr-choose";
      box.innerHTML = `<b>${esc(title)}</b>${wps.slice(0, 30).map((w, i) => `<button type="button" data-i="${i}">◈ ${esc(w.name)}</button>`).join("")}<button type="button" class="lr-cancel">CANCEL</button>`;
      host.querySelector(".lr-chat").appendChild(box);
      box.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; box.remove(); done(b.classList.contains("lr-cancel") ? null : wps[+b.dataset.i]); });
    });
  }
  function nodeName(id) { const n = (st.nodes || []).find((x) => x.id === id); return n ? n.long || n.short || id : id === "^all" ? "everyone" : id || "?"; }
  const ago = (s) => { if (!s) return "never"; const m = Math.max(0, Date.now() / 1000 - s) / 60; return m < 1 ? "now" : m < 60 ? `${Math.round(m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
  function updateBoard() {
    const s = st, info = s.info || {}, me = info.me || {};
    const strip = host.querySelector(".lr-strip");
    if (!strip) return;
    const unset = info.region === "UNSET";
    strip.innerHTML = `<div class="lr-me"><span class="lr-led"></span><div><b>${esc(me.long || "Your radio")}</b><small>${esc(me.short || "")} · ${esc(me.id || "")} · ${esc(me.hw || "")}${info.firmware ? ` · fw ${esc(info.firmware)}` : ""}</small></div></div>
      <div class="lr-stat ${unset ? "bad" : ""}"><small>REGION</small><b>${esc(unset ? "NOT SET" : info.region)}</b></div><div class="lr-stat"><small>PRESET</small><b>${esc((info.preset || "").replace(/_/g, " "))}</b></div>
      <div class="lr-stat"><small>BATTERY</small><b>${me.battery != null ? (me.battery > 100 ? "USB" : me.battery + "%") : "—"}</b></div>
      <div class="lr-stat"><small>CHANNEL USE</small><b>${me.chUtil != null ? me.chUtil.toFixed(1) + "%" : "—"}</b></div><div class="lr-stat"><small>AIRTIME</small><b>${me.airTx != null ? me.airTx.toFixed(1) + "%" : "—"}</b></div>
      <div class="lr-stat"><small>CHANNEL</small><b>${esc((info.channels || [])[0]?.name || "LongFast")}${(info.channels || [])[0]?.secure ? " 🔒︎" : ""}</b></div>
      <button type="button" class="ghost lr-set">⚙ RADIO SETTINGS</button><button type="button" class="ghost lr-map">◈ ON THE MAP</button><button type="button" class="ghost lr-off">DISCONNECT</button>`;
    strip.querySelector(".lr-set").onclick = () => { Sound.click(); settings(); };
    strip.querySelector(".lr-off").onclick = async () => { Sound.click(); await post("/api/lora/disconnect"); refresh(true); };
    strip.querySelector(".lr-map").onclick = () => { Sound.click(); window.closeRadar?.(); window.showLoraOnMap?.(); };
    if (unset && !host.querySelector(".lr-settings:not([hidden])")) settings(true);
    const nodes = (s.nodes || []).filter((n) => n.id !== me.id);
    host.querySelector(".lr-ncount").textContent = nodes.length;
    const nl = host.querySelector(".lr-nlist");
    const nk = JSON.stringify(nodes.map((n) => [n.id, n.snr, n.heard, n.battery, n.hops, n.long])) + selected;
    if (nl.dataset.k !== nk) {
      nl.dataset.k = nk;
      nl.innerHTML = nodes.length ? nodes.map((n) => `<button type="button" class="lr-n ${n.id === selected ? "on" : ""}" data-id="${esc(n.id)}"><span class="lr-bars">${bars(n.snr)}</span>
        <div><b>${esc(n.long || n.short || n.id)}</b><small>${esc(n.short || "")} · ${n.hops ? `${n.hops} hop${n.hops > 1 ? "s" : ""}` : "direct"} · ${esc(ago(n.heard))}${n.battery != null ? ` · ${n.battery > 100 ? "USB" : n.battery + "%"}` : ""}</small></div></button>`).join("")
        : `<p class="lr-wait">No other radios heard yet. Turn on a second radio nearby; it appears here within a minute or two.</p>`;
      nl.querySelectorAll(".lr-n").forEach((b) => b.addEventListener("click", () => pick(b.dataset.id)));
    }
    const msgs = s.messages || [], ck = JSON.stringify(msgs.map((m) => [m.id, m.state]));
    if (ck !== chatSig) {
      chatSig = ck;
      const box = host.querySelector(".lr-msgs");
      box.innerHTML = msgs.length ? msgs.slice(-120).map((m) => {
        const ci = /^◉ CHECK-IN:/.test(m.text || "");
        return `<div class="lr-msg ${m.me ? "me" : ""} ${ci ? "ci" : ""}"><small>${esc(m.me ? "YOU" : nodeName(m.from))}${m.to && m.to !== "^all" ? ` → ${esc(nodeName(m.to))}` : ""} · ${esc(new Date(m.at).toTimeString().slice(0, 5))}${m.hops != null && !m.me ? ` · ${m.hops ? m.hops + " hop" + (m.hops > 1 ? "s" : "") : "direct"}` : ""}${m.snr != null && !m.me ? ` · SNR ${m.snr}` : ""}${m.me ? ` · <i class="st-${esc(m.state || "")}">${{ sending: "SENDING…", sent: "SENT", delivered: "✓ DELIVERED", failed: "✗ NOT DELIVERED" }[m.state] || ""}</i>` : ""}</small>
          ${m.text ? `<p>${esc(m.text)}</p>` : ""}${m.waypoint ? `<button type="button" class="fr-wp" data-lat="${m.waypoint.lat}" data-lon="${m.waypoint.lon}"><b>◈ ${esc(m.waypoint.name)}</b><small>${(+m.waypoint.lat).toFixed(4)}°, ${(+m.waypoint.lon).toFixed(4)}° · SHOW ON MAP ▸</small></button>` : ""}</div>`; }).join("")
        : `<p class="lr-wait">Nothing on the mesh yet. Say hello: every radio on your channel hears it.</p>`;
      box.querySelectorAll(".fr-wp").forEach((b) => b.addEventListener("click", () => { Sound.click(); window.closeRadar?.(); window.openMapsAt?.(+b.dataset.lat, +b.dataset.lon, 12); }));
      box.scrollTop = box.scrollHeight;
    }
    host.querySelector(".lr-to").textContent = selected ? `TO ${nodeName(selected).toUpperCase()} ONLY · ✕` : "TO EVERYONE";
    host.querySelector(".lr-to").onclick = () => { if (selected) { selected = null; Sound.click(); updateBoard(); } };
  }
  const bars = (snr) => { const n = snr == null ? 0 : snr > 5 ? 4 : snr > 0 ? 3 : snr > -7 ? 2 : 1; return [1, 2, 3, 4].map((i) => `<i class="${i <= n ? "on" : ""}" style="height:${3 + i * 3}px"></i>`).join(""); };
  function pick(id) {
    selected = selected === id ? null : id;
    Sound.click();
    const n = (st.nodes || []).find((x) => x.id === id), card = host.querySelector(".lr-node-card");
    if (!selected || !n) { card.hidden = true; updateBoard(); return; }
    card.hidden = false;
    card.innerHTML = `<div class="mp-cf-head"><span class="mp-cf-tag">⌁ RADIO · ${esc(n.hw || "")}</span><button type="button" class="ghost lr-x">✕</button></div>
      <h3>${esc(n.long || n.id)}</h3><small>${esc(n.short || "")} · ${esc(n.id)}</small>
      <div class="lr-kv"><span>Signal</span><b>${n.snr != null ? `SNR ${n.snr} dB` : "—"}</b><span>Route</span><b>${n.hops ? `${n.hops} hop${n.hops > 1 ? "s" : ""}` : "direct"}</b>
        <span>Last heard</span><b>${esc(ago(n.heard))}</b><span>Battery</span><b>${n.battery != null ? (n.battery > 100 ? "on USB power" : n.battery + "%") : "—"}</b>
        <span>Position</span><b>${n.lat != null ? `${(+n.lat).toFixed(4)}°, ${(+n.lon).toFixed(4)}°` : "not shared"}</b></div>
      <div class="lr-card-acts"><button type="button" class="solid lr-dm">✉ MESSAGE</button><button type="button" class="ghost lr-tr" title="Trace route|Which radios relay your messages to it">⇢ TRACE ROUTE</button>
        ${n.lat != null ? `<button type="button" class="ghost lr-onmap">◈ MAP</button>` : ""}</div>`;
    card.querySelector(".lr-x").onclick = () => { selected = null; card.hidden = true; Sound.click(); updateBoard(); };
    card.querySelector(".lr-dm").onclick = () => { host.querySelector(".lr-say input").focus(); updateBoard(); };
    card.querySelector(".lr-tr").onclick = async () => { Sound.click(); await post("/api/lora/send", { cmd: "traceroute", to: n.id }); window.umbraToast?.("⇢ Tracing the route… the answer appears in the chat when it comes back."); };
    card.querySelector(".lr-onmap")?.addEventListener("click", () => { window.closeRadar?.(); window.openMapsAt?.(n.lat, n.lon, 12); });
    updateBoard();
  }
  // The scope: you in the middle, each radio a blip, nearer the stronger it's heard.
  function scopeLoop(canvas) {
    const g = canvas.getContext("2d");
    let raf = 0, last = 0;
    const loop = (ts) => {
      raf = requestAnimationFrame(loop);
      if (ts - last < 50 || !canvas.isConnected) return;
      last = ts;
      const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
      if (!r.width) return;
      if (canvas.width !== Math.round(r.width * dpr)) { canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
      const W = r.width, H = r.height, cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42, t = ts / 1000;
      const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
      const net = css("--net") || "#5fb8c9", sig = css("--signal") || "#e8d27c", dim = css("--line") || "#333", font = css("--font");
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      g.strokeStyle = dim; g.lineWidth = 1;
      for (let k = 1; k <= 4; k++) { g.beginPath(); g.arc(cx, cy, (R * k) / 4, 0, Math.PI * 2); g.stroke(); }
      g.font = `9px ${font}`; g.fillStyle = dim; g.textAlign = "left";
      ["STRONG", "GOOD", "WEAK", "FAINT"].forEach((l, k) => g.fillText(l, cx + 4, cy - (R * (k + 1)) / 4 + 11));
      // Waves going out from you.
      for (let k = 0; k < 3; k++) { const rr = ((t * 0.35 + k / 3) % 1) * R; g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.strokeStyle = net; g.globalAlpha = (1 - rr / R) * 0.5; g.stroke(); }
      g.globalAlpha = 1;
      g.fillStyle = sig; g.beginPath(); g.arc(cx, cy, 5, 0, Math.PI * 2); g.fill();
      g.font = `700 10px ${font}`; g.textAlign = "center"; g.fillText("YOU", cx, cy + 18);
      const me = st?.info?.me?.id, hits = [];
      (st?.nodes || []).filter((n) => n.id !== me).forEach((n) => {
        const h = [...n.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7), ang = (h % 360) * Math.PI / 180;
        const k = n.snr == null ? 0.85 : Math.min(0.95, Math.max(0.15, (8 - n.snr) / 22)), x = cx + Math.cos(ang) * R * k, y = cy + Math.sin(ang) * R * k;
        const on = n.id === selected, fresh = n.heard && Date.now() / 1000 - n.heard < 900;
        g.globalAlpha = fresh ? 1 : 0.45;
        g.strokeStyle = on ? sig : net; g.lineWidth = on ? 2 : 1;
        if (n.hops) { g.setLineDash([3, 4]); g.beginPath(); g.moveTo(cx, cy); g.lineTo(x, y); g.stroke(); g.setLineDash([]); }
        g.fillStyle = on ? sig : net; g.beginPath(); g.arc(x, y, on ? 7 : 5, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(x, y, 9 + 3 * Math.sin(t * 3 + h), 0, Math.PI * 2); g.stroke();
        g.font = `700 10px ${font}`; g.fillStyle = on ? sig : net; g.fillText((n.short || n.long || n.id).toUpperCase(), x, y - 14);
        g.globalAlpha = 1;
        hits.push({ x, y, id: n.id });
      });
      canvas._hits = hits;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }

  // ---------------------------------------------------------- settings
  function settings(firstTime) {
    const box = host.querySelector(".lr-settings"), info = st.info || {}, me = info.me || {};
    box.hidden = false;
    box.innerHTML = `<div class="lr-set-head"><b>⚙ RADIO SETTINGS</b>${firstTime ? `<small>The radio stays silent until its region is set: choose yours.</small>` : ""}<button type="button" class="ghost lr-set-x">✕</button></div>
      <div class="lr-set-grid">
        <label>REGION <select class="lr-region">${info.region === "UNSET" ? `<option value="">Choose your region…</option>` : ""}${REGIONS.map(([k, n]) => `<option value="${k}" ${k === info.region ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        <label>PRESET <select class="lr-preset">${PRESETS.map(([k, n]) => `<option value="${k}" ${k === info.preset ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        <label>NAME <input class="lr-long" maxlength="39" value="${esc(me.long || "")}"></label>
        <label>SHORT NAME <input class="lr-short" maxlength="4" value="${esc(me.short || "")}"></label>
      </div>
      <div class="lr-set-acts"><button type="button" class="solid lr-save">SAVE TO THE RADIO</button></div>
      <div class="lr-chan"><b>PRIVATE CHANNEL</b><p>The default channel is public: anyone on Meshtastic nearby can read it. A private channel has its own name and a random key; radios share it by scanning or pasting its link.</p>
        <div class="lr-set-acts"><input class="lr-chname" maxlength="11" placeholder="Channel name" value="Umbra"><button type="button" class="ghost lr-mkchan">MAKE A PRIVATE CHANNEL</button></div>
        <div class="lr-set-acts"><button type="button" class="ghost lr-share">▦ SHOW THIS CHANNEL'S QR</button><input class="lr-url" placeholder="Paste a channel link (https://meshtastic.org/e/#…)"><button type="button" class="ghost lr-join">JOIN</button></div>
        <div class="lr-qr" hidden><canvas></canvas><small></small></div></div>`;
    box.querySelector(".lr-set-x").onclick = () => { box.hidden = true; Sound.click(); };
    box.querySelector(".lr-save").onclick = async () => {
      Sound.click();
      const region = box.querySelector(".lr-region").value, preset = box.querySelector(".lr-preset").value, long = box.querySelector(".lr-long").value.trim(), short = box.querySelector(".lr-short").value.trim();
      if (region && region !== info.region) await post("/api/lora/send", { cmd: "region", value: region });
      if (preset && preset !== info.preset) await post("/api/lora/send", { cmd: "preset", value: preset });
      if (long && (long !== me.long || short !== me.short)) await post("/api/lora/send", { cmd: "owner", long, short: short || long.slice(0, 4) });
      window.umbraToast?.("⌁ Saved to the radio. It may restart for a moment."); box.hidden = true; setTimeout(refresh, 2500);
    };
    box.querySelector(".lr-mkchan").onclick = async () => {
      const ok = await confirmDialog({ kind: "to-local", tag: "LORA", title: "MAKE A PRIVATE CHANNEL?", body: "Your radio leaves the public channel for a private one with a new random key. Your other radios must join it (scan its QR or paste its link) to keep talking to you.", ok: "MAKE IT", cancel: "CANCEL" });
      if (!ok) return;
      await post("/api/lora/send", { cmd: "channel", name: box.querySelector(".lr-chname").value.trim() || "Umbra" });
      setTimeout(() => { refresh(); settings(); box.querySelector(".lr-share")?.click(); }, 2000);
    };
    box.querySelector(".lr-share").onclick = () => {
      const url = st.info?.url; if (!url) return;
      const q = box.querySelector(".lr-qr"); q.hidden = false;
      try { UmbraQR.draw(q.querySelector("canvas"), url, { px: 200 }); } catch {}
      q.querySelector("small").textContent = url; Sound.click();
    };
    box.querySelector(".lr-join").onclick = async () => {
      const url = box.querySelector(".lr-url").value.trim();
      if (!/^https:\/\/meshtastic\.org\/e\/#/.test(url)) { window.umbraToast?.("That isn't a Meshtastic channel link."); return; }
      await post("/api/lora/send", { cmd: "seturl", url }); window.umbraToast?.("⌁ Joined the channel."); setTimeout(refresh, 2000);
    };
  }

  // A little ASCII picture for each radio in the shop list.
  const ICONS = {
    heltec: " ___|_\n|[==] |\n|  o  |\n'-----'", tbeam: "  |\n .|___.\n |[__]|\n |=GPS=|\n '-----'", rak: "  |\n.-|--.\n| RAK |\n'-----'",
    card: " .----.\n | ◉  |\n | GPS|\n '----'", deck: " .-----.\n |[===]|\n |qwert|\n '-----'",
  };

  // ------------------------------------------------------------- mount
  function mount(el) {
    host = el; view = ""; sig = chatSig = "";
    clearInterval(poll);
    refresh(true);
    poll = setInterval(() => { if (!host?.isConnected || host.closest("[hidden]")) { clearInterval(poll); cleanup(); return; } refresh(); }, 2000);
  }
  function unmount() { clearInterval(poll); cleanup(); view = ""; }
  // Radios with positions, for the Maps (as a layer like friends').
  window.loraForMap = async () => {
    const s = await fetch("/api/lora").then((r) => r.json()).catch(() => null);
    if (!s?.connected) return [];
    const me = s.info?.me?.id;
    return (s.nodes || []).filter((n) => n.lat != null && n.id !== me).map((n) => ({ id: "lora-" + n.id, name: n.long || n.short || n.id, accent: "net", waypoints: [[n.lat, n.lon, "⌁ " + (n.short || "RADIO"), "op", "cyan"]], checkin: null }));
  };
  return { mount, unmount };
})();
