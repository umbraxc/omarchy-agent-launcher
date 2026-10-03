// Umbra Wiki Core panel: click STATUS (or CORE) in the header. A drawer like
// Settings: a live orb in the state's style, the AI (the model in use, the
// others installed and more to download, each with its emblem, what it's
// good at, its limits, an example answer and how well it suits this
// computer), then what's local (every system's condition and what to do
// about it), and what each status word means. Loaded after app.js (uses $, Sound,
// escapeHtml, fmtSize, confirmDialog, refreshStatus).
"use strict";

(() => {
  let data = null, timer = 0, heroTimer = 0, open = false, netState = null;
  const post = (url, body) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => r.json()).catch(() => ({ error: "Umbra's background service didn't answer" }));

  // ------------------------------------------------------------ state

  // The header's status words, what they mean and the colour they wear.
  const STATES = [
    ["READY", "ok", "Every system is go: ask anything."],
    ["WORKING", "busy", "I'm reading the library and writing an answer. Esc stops it."],
    ["AI ↓ %", "busy", "A model is downloading. The current one keeps answering until you switch."],
    ["LIB ↓ %", "busy", "Library collections are downloading; I already answer from what's here."],
    ["NO MODEL", "bad", "No AI model is installed yet: pick one below."],
    ["CORE OFFLINE", "bad", "My AI engine (Ollama) isn't running, so I can't think. See AI ENGINE below."],
    ["NO BACKEND", "bad", "Umbra's own background service isn't answering. Restart Umbra."],
  ];
  function currentState() {
    const st = $("#t-status")?.textContent || "";
    const i = STATES.findIndex(([w]) => w.includes("%") ? st.startsWith(w.slice(0, 4)) : st === w);
    return i < 0 ? 0 : i;
  }

  // --------------------------------------------------------- the core

  // The header's orb: a glowing reactor when all is well, a sweeping radar
  // while busy, the black sun when something is wrong.
  const HERO = { ok: "reactor", busy: "radar", bad: "blacksun" };
  let heroStop = null;
  function hero() {
    const i = currentState(), kind = STATES[i][1];
    const box = $("#core .co-hero");
    if (!box) return;
    box.className = "co-hero " + kind;
    box.querySelector(".co-word").textContent = $("#t-status")?.textContent || STATES[i][0];
    box.querySelector(".co-say").textContent = STATES[i][2];
    const pre = box.querySelector(".co-orb");
    if (pre.dataset.style !== HERO[kind]) {
      if (heroStop) heroStop();
      pre.dataset.style = HERO[kind];
      heroStop = window.umbraOrb ? window.umbraOrb(pre, 15, 10, HERO[kind]) : null;
    }
  }

  // ------------------------------------------------------- the systems

  const onWin = () => data && data.status.platform === "windows";
  function systems() {
    const d = data, st = d.status, eng = d.engine, lib = d.library, pull = d.pull || {};
    const active = d.installed.find((m) => m.active);
    const pct = pull.active && pull.total ? Math.round((pull.completed * 100) / pull.total) : null;
    const rows = [
      ["AI ENGINE", eng.running ? "ok" : "bad", eng.running ? "ONLINE" : "OFFLINE",
        eng.running ? `Ollama ${eng.version || ""}: runs the AI on this computer.`
          : onWin() ? "Ollama isn't running. Open Ollama from the Start menu, or install it from ollama.com/download."
            : "Ollama isn't running. Start it once in a terminal, and it starts by itself from then on: sudo systemctl enable --now ollama"],
      ["AI MODEL", pct !== null ? "busy" : st.modelReady ? "ok" : "bad", pct !== null ? `↓ ${pct}%` : st.modelReady ? (active && active.loaded ? "AWAKE" : "READY") : "MISSING",
        pct !== null ? `${active ? active.callsign + " keeps answering" : "No model can answer yet"} while ${pull.model} downloads. It will ${active ? "wait for you to switch" : "become active when ready"}.`
          : st.modelReady ? `${active ? active.name : st.model}${active && active.loaded ? ", loaded in memory and quick to answer" : ", asleep until the next question (the first answer takes a little longer)"}.`
            : "No model is installed. Pick one under AI MODELS."],
      ["LIBRARY", lib.archives ? (lib.running ? "ok" : "bad") : "warn", lib.archives ? (lib.running ? `${lib.archives} ONLINE` : "STOPPED") : "EMPTY",
        lib.archives ? `${lib.archives} collections, ${fmtSize(lib.size)}${lib.running ? ", searched with every question" : "; the library server has stopped: restart Umbra"}. ${lib.available} more in the Library.`
          : "No offline collections yet: I answer from the AI's own knowledge. Open the Library to add some."],
      ["MAPS", d.maps.areas ? "ok" : "warn", d.maps.areas ? `${d.maps.areas} AREAS` : "OVERVIEW",
        d.maps.areas ? `${d.maps.areas} detailed areas saved for offline use, plus the world overview.` : "The world overview works offline; download a country or area in Maps for street-level detail."],
      ["NETWORK", netState === null ? "warn" : netState.online ? "ok" : "warn", netState === null ? "CHECKING" : netState.online ? "ONLINE" : "OFFLINE",
        netState === null ? "Checking the connection…" : netState.online ? "Connected to the internet. Umbra still answers locally unless you switch the LINK to ONLINE."
          : "No internet. Nothing is lost: everything Umbra needs is on this computer."],
      ["DOWNLOADS", Object.values(d.downloads).some(Boolean) ? "busy" : "ok", Object.values(d.downloads).some(Boolean) ? "ACTIVE" : "IDLE",
        Object.values(d.downloads).some(Boolean) ? `In progress: ${Object.entries(d.downloads).filter(([, v]) => v).map(([k]) => ({ library: "library", model: "AI model", maps: "maps", docs: "field manuals" })[k]).join(", ")}. The downloads button at the top pauses or resumes them.` : "Nothing downloading."],
      ["POWER", d.power.battery ? "warn" : "ok", d.power.battery ? "BATTERY" : "MAINS",
        `Off-grid mode: ${({ auto: "switches on by itself on battery", on: "always on", off: "off" })[d.power.offgrid] || d.power.offgrid}.${window.offgrid ? " It's saving power now." : ""}`],
      ["VOICE", d.voice ? "ok" : "warn", d.voice ? "READY" : "NOT SET UP",
        d.voice ? "Hold F9 to talk; speech is turned into text offline." : "Voice input isn't set up yet: click the microphone, or Settings › Voice input."],
      ["PROCESSOR", d.system.accel ? "ok" : "warn", d.system.accel ? "ACCELERATED" : "CPU ONLY",
        `${d.system.cpu}, ${d.system.cores} threads, ${d.system.ramGB} GB of memory. ${d.system.accel ? `Graphics card: ${d.system.accel}, so answers come fast.` : "No graphics card the AI can use, so answers take a minute or so."}`],
    ];
    return rows.map(([name, kind, badge, text]) => `<div class="co-sys ${kind}"><i></i><b>${name}</b><span class="co-badge">${escapeHtml(badge)}</span><small>${escapeHtml(text)}</small></div>`).join("");
  }

  function legend() {
    const now = currentState();
    return STATES.map(([w, kind, text], i) => `<div class="co-leg ${kind}${i === now ? " now" : ""}"><b>${escapeHtml(w.replace(" %", " n%"))}</b><small>${escapeHtml(text)}</small>${i === now ? "<em>NOW</em>" : ""}</div>`).join("");
  }

  // --------------------------------------------------------- the models

  const meter = (n, of = 5) => { n = Math.max(0, Math.min(of, Math.round(n))); return "▰".repeat(n) + "▱".repeat(of - n); };
  const speedN = (m) => ({ fast: 3, steady: 2, slow: 1 })[m.speed] || 2;
  const FIT = { good: "FITS WELL", slow: "SLOW HERE", tight: "TIGHT", "too big": "TOO BIG" };

  function modelCard(m, big = false) {
    const pull = data.pull || {};
    const mine = (pull.active || pull.paused) && pull.model === m.id;
    const pct = mine && pull.total ? Math.round((pull.completed * 100) / pull.total) : 0;
    const busy = pull.active || pull.paused;
    const facts = [m.maker && `${escapeHtml(m.maker)}${m.year ? " · " + m.year : ""}`, m.params && `${escapeHtml(m.params)} parameters`,
      m.size && `${m.size} GB`, m.ram && `${m.ram} GB memory`].filter(Boolean).join("  ·  ");
    const list = (items) => items && items.length ? `<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : "";
    let actions = "";
    if (m.active) actions = `<span class="co-tag on">IN USE</span><button class="ghost co-del" data-id="${escapeHtml(m.id)}">REMOVE MODEL</button>`;
    else if (m.installed) actions = `<button class="solid co-use" data-id="${escapeHtml(m.id)}">USE ${escapeHtml(m.callsign)}</button><button class="ghost co-del" data-id="${escapeHtml(m.id)}" title="Remove|Deletes this model from the computer to free ${m.size} GB. You can download it again any time.">REMOVE</button>`;
    else if (mine) actions = `<span class="co-tag busy">${pull.paused ? "PAUSED" : "DOWNLOADING"} ${pct}%</span>`;
    else if (m.fit === "too big") actions = `<button class="ghost co-get" disabled title="Not for this computer|${escapeHtml(m.fitWhy || "")}">\u{F033E} WON'T RUN HERE</button>`;
    else actions = `<button class="${m.fit === "good" ? "solid" : "ghost"} co-get" data-id="${escapeHtml(m.id)}" data-fit="${escapeHtml(m.fit)}" ${busy ? "disabled" : ""}>DOWNLOAD ${m.size} GB</button>`;
    return `<div class="co-model${big ? " big" : ""}${m.active ? " active" : ""}" data-id="${escapeHtml(m.id)}">
      <pre class="co-logo">${escapeHtml((m.logo || []).join("\n"))}</pre>
      <div class="co-main"><div class="co-mhead"><b class="co-call">${escapeHtml(m.callsign)}</b><span class="co-real">${escapeHtml(m.family || m.name)}</span>
        ${!m.installed ? `<span class="co-fit ${m.fit.replace(" ", "-")}" title="${escapeHtml(m.fitWhy)}">${FIT[m.fit]}</span>` : m.loaded ? `<span class="co-fit good">AWAKE</span>` : ""}
        ${m.recommended ? `<span class="co-star">★ RECOMMENDED</span>` : ""}</div>
      <p class="co-line">${escapeHtml(m.line || "")}</p>
      ${big ? `<div class="co-facts">${facts}</div>` : ""}
      <div class="co-meters"><span>KNOWLEDGE <b>${meter(m.tier || 3, 8)}</b></span><span>SPEED <b>${meter(speedN(m) + (data.system.accel ? 1 : 0), 4)}</b></span>${m.thinks ? "<span>REASONS DEEPLY</span>" : ""}</div>
      ${!big ? `<div class="co-actions">${actions}</div>` : ""}</div>
      <details ${big ? "open" : ""}><summary>MORE ABOUT ${escapeHtml(m.callsign)}</summary>
        ${!big ? `<div class="co-facts">${facts}</div>${!m.installed && m.fitWhy ? `<p class="co-why">${escapeHtml(m.fitWhy)}</p>` : ""}` : ""}
        <p>${escapeHtml(m.about || "")}</p>
        <p class="co-pair-why"><b>PAIRING</b> ${escapeHtml(m.active ? "This is the model answering now. Add a compatible installed helper below if this computer can run one." : m.pairWhy || "Use this model on its own.")}</p>
        <div class="co-gl"><div><em>GOOD AT</em>${list(m.good)}</div><div><em>LIMITS</em>${list(m.limits)}</div></div>
        ${m.example ? `<div class="co-ex"><em>HOW IT ANSWERS · "How long do I boil water to make it safe?"</em><p>${escapeHtml(m.example).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p></div>` : ""}
      </details>
      ${big ? `<div class="co-actions">${actions}</div>` : ""}</div>`;
  }

  function models() {
    const active = data.installed.find((m) => m.active);
    const others = data.installed.filter((m) => !m.active);
    const order = { good: 0, slow: 1, tight: 2, "too big": 3 };
    const more = [...data.catalog].sort((a, b) => order[a.fit] - order[b.fit] || (a.tier || 3) - (b.tier || 3));
    const failed = (data.pull || {}).status === "failed" ? `<p class="lib-note">The last download failed: ${escapeHtml(data.pull.error || "")}</p>` : "";
    const pull = data.pull || {};
    const downloading = pull.active || pull.paused;
    const progress = downloading ? `<div class="co-transfer"><b>${pull.paused ? "DOWNLOAD PAUSED" : "DOWNLOADING"} · ${escapeHtml(pull.model || "AI MODEL")}</b>
      <span>${pull.total ? `${Math.min(100, Math.round((pull.completed || 0) * 100 / pull.total))}% · ${fmtSize(pull.completed || 0)} / ${fmtSize(pull.total)}` : escapeHtml(pull.status || "Preparing download…")}</span>
      <div class="dl-bar"><i style="width:${pull.total ? Math.min(100, Math.round((pull.completed || 0) * 100 / pull.total)) : 0}%"></i></div>
      ${window.UmbraDownloads ? `<div class="dl-controls">${UmbraDownloads.controls("model", { paused: !!pull.paused })}</div>` : ""}</div>` : "";
    const flow = `<div class="co-flow"><b>MODEL CONTROL</b><p>${active ? `<strong>${escapeHtml(active.callsign)}</strong> answers now. Downloaded models stay installed together; choose USE to switch.`
      : "No AI model can answer yet. The first model you download becomes active when ready."}
      ${downloading ? ` ${escapeHtml(pull.model || "The new model")} is ${pull.paused ? "paused" : "downloading"}; ${active ? `${escapeHtml(active.callsign)} keeps answering.` : "answers begin when it finishes."}` : ""}</p></div>`;
    const team = data.team || {};
    const candidates = data.installed.filter((m) => !m.active && team.choices?.[m.id]?.ok);
    const teamPanel = `<div class="co-team"><b>SECOND OPINION · OPTIONAL</b><p>${team.enabled
      ? `${escapeHtml(active?.callsign || "The main model")} answers with a short check from ${escapeHtml(data.installed.find((m) => m.id === team.helper)?.callsign || team.helper)}. The models run in sequence; your main model writes the final answer. Casual chat stays quick and solo.`
      : data.system.accel ? data.system.vramGB ? "A compatible installed helper can check a practical answer before the main model replies. This takes longer; casual chat stays solo."
        : "Umbra cannot measure dedicated graphics memory here, so models run alone to keep answers reliable. Several models can still be installed and switched."
        : "This computer uses its processor for AI. Models stay solo here so answers remain responsive; you can still keep and switch between several installed models."}</p>
      ${team.reason ? `<small>${escapeHtml(team.reason)}</small>` : ""}
      <div class="co-actions">${team.enabled ? `<button class="ghost co-solo">USE ONE MODEL</button>` : candidates.map((m) => `<button class="ghost co-pair" data-id="${escapeHtml(m.id)}">ADD ${escapeHtml(m.callsign)} AS HELPER</button>`).join("")}</div></div>`;
    return `${flow}${progress}${active ? modelCard(active, true) : `<p class="lib-note">No AI model is installed yet. Pick one below: <b>RANGER</b> suits most computers.</p>`}
      ${others.length ? `<div class="co-sub-head">ALSO ON THIS COMPUTER</div>${others.map((m) => modelCard(m)).join("")}` : ""}
      ${teamPanel}
      <div class="co-sub-head">MORE MODELS · FOR ${escapeHtml(data.system.ramGB + " GB")} MEMORY, ${data.system.accel ? escapeHtml(data.system.accel).toUpperCase() : "NO AI GRAPHICS CARD"}, ${escapeHtml(String(data.system.freeGB))} GB FREE</div>
      ${failed}${more.map((m) => modelCard(m)).join("")}`;
  }

  // ------------------------------------------------------------ render

  // Redrawn only when something changed, so nothing flickers; the header
  // follows the status every second either way.
  let shown = "";
  async function load() {
    data = await fetch("/api/core").then((r) => r.json()).catch(() => null);
    if (!open) return;
    const body = $("#core .co-body");
    clearTimeout(timer);
    timer = setTimeout(load, data && data.pull && data.pull.active ? 2000 : 6000);
    if (!data) { body.innerHTML = `<p class="lib-note">Umbra's background service didn't answer. Restart Umbra.</p>`; shown = ""; return; }
    const html = `<div class="lib-head">AI</div><div class="co-models">${models()}</div>`;
    const local = `<div class="lib-head">WHAT'S LOCAL</div><div class="co-systems">${systems()}</div>
      <details class="co-legend-box"><summary>WHAT THE STATUS WORDS MEAN</summary><div class="co-legend">${legend()}</div></details>`;
    const lbox = $("#core .co-local");
    if (lbox.dataset.html !== local) {
      const op = lbox.querySelector("details")?.open;
      lbox.innerHTML = local; lbox.dataset.html = local;
      if (op) lbox.querySelector("details").open = true;
    }
    statusArt();
    if (html === shown) return;
    const keep = body.scrollTop;
    const opened = [...body.querySelectorAll("details[open]")].map((d) => d.closest(".co-model")?.dataset.id || d.className);
    const fresh = !shown;
    shown = html;
    body.innerHTML = html;
    body.classList.toggle("fresh", fresh);
    opened.forEach((id) => { const d = body.querySelector(`.co-model[data-id="${CSS.escape(id || "")}"] details`) || body.querySelector(`details.${CSS.escape(id || "x")}`); if (d) d.open = true; });
    body.scrollTop = keep;
    wire(body);
    if (wantStatus) { wantStatus = false; const sc = $("#core .co-scroll"); sc.scrollTo({ top: $("#core .co-status").offsetTop - 8 }); }
  }

  function wire(body) {
    const showError = (message) => {
      Sound.error();
      const flow = body.querySelector(".co-flow");
      if (!flow) return;
      let note = flow.querySelector(".co-action-error");
      if (!note) { note = document.createElement("p"); note.className = "co-action-error"; flow.appendChild(note); }
      note.textContent = message;
    };
    body.querySelectorAll("button, summary").forEach((b) => b.addEventListener("mouseenter", Sound.hover));
    body.querySelectorAll(".co-use").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      const r = await post("/api/model", { model: b.dataset.id });
      if (r.error) { showError(r.error); b.disabled = false; return; }
      Sound.theme();
      if (window.refreshStatus) refreshStatus();
      load();
    }));
    body.querySelectorAll(".co-get[data-id]").forEach((b) => b.addEventListener("click", async () => {
      // A tight fit (just enough memory) is the user's call, with the facts in front of them.
      if (b.dataset.fit === "tight") {
        const m = data.catalog.find((x) => x.id === b.dataset.id);
        const rec = data.catalog.concat(data.installed || []).find((x) => x.recommended);
        const sure = await confirmDialog({ kind: "error", tag: "AI MODEL", title: `${m ? m.callsign : "THIS MODEL"} IS A TIGHT FIT`,
          body: `${m ? m.fitWhy : ""} It may be slow, or fail to start while other programs are open.${rec ? ` For this computer I recommend ${rec.callsign}.` : ""}`,
          ok: "DOWNLOAD ANYWAY", cancel: "CHOOSE ANOTHER" });
        if (!sure) return;
      }
      b.disabled = true;
      const r = await post("/api/model/pull", { model: b.dataset.id });
      if (r.error) { showError(r.error); b.disabled = false; return; }
      Sound.click();
      if (window.UmbraDownloads) UmbraDownloads.refresh();
      load();
    }));
    body.querySelectorAll(".co-del").forEach((b) => b.addEventListener("click", async () => {
      const m = data.installed.find((x) => x.id === b.dataset.id);
      const fallback = data.installed.filter((x) => x.id !== b.dataset.id).sort((a, b) => (b.tier || 0) - (a.tier || 0))[0];
      const sure = await confirmDialog({ kind: "error", tag: "AI MODEL", title: `REMOVE ${m ? m.callsign : "THIS MODEL"}?`,
        body: `${m ? m.name : b.dataset.id} will be deleted from this computer, freeing ${m ? m.size : "?"} GB. ${m?.active ? fallback ? `${fallback.callsign} will take over.` : "Umbra will need another model before it can answer AI questions." : "The model in use stays active."} You can download it again later.`,
        ok: "REMOVE", cancel: "KEEP IT" });
      if (!sure) return;
      const r = await post("/api/model/delete", { model: b.dataset.id });
      if (r.error) showError(r.error); else { Sound.click(); if (window.refreshStatus) refreshStatus(); }
      load();
    }));
    body.querySelectorAll(".co-pair, .co-solo").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      const r = await post("/api/model/team", { helper: b.classList.contains("co-solo") ? "" : b.dataset.id });
      if (r.error) { showError(r.error); b.disabled = false; return; }
      Sound.theme(); load();
    }));
    if (window.UmbraDownloads) UmbraDownloads.wire(body, load);
  }

  // ------------------------------------------------------ open / close

  function build() {
    const el = document.createElement("div");
    el.id = "core"; el.className = "themes corepanel"; el.hidden = true;
    el.innerHTML = `<div class="themes-head"><span class="themes-title"><span class="spin" data-spin>✻</span> CORE</span>
        <span class="co-tools"><button class="ghost co-refresh" title="Check again|Reads every system's condition now.">↻ CHECK</button>
        <button class="ghost co-close" title="Close · Esc|Back to where you were.">CLOSE ✕</button></span></div>
      <div class="co-hero ok"><pre class="orb co-orb"></pre><div class="co-now"><small>STATUS</small><b class="co-word">…</b><span class="co-say"></span>
        <span class="co-chips"></span></div></div>
      <div class="co-scroll"><div class="co-body"></div>
      <div class="co-status"><div class="lib-head">STATUS</div><div class="co-sbox"><canvas class="co-sart"></canvas>
        <div class="co-stext"><small>RIGHT NOW</small><b class="co-sword"></b><span class="co-ssay"></span></div></div></div>
      <div class="co-local"></div></div>`;
    document.body.appendChild(el);
    el.querySelector(".co-close").addEventListener("click", () => toggle(false));
    el.querySelector(".co-refresh").addEventListener("click", () => { Sound.searchstart(); netCheck(); load(); });
  }

  // The status, drawn: Umbra's core as a 3D ASCII reactor. Calm and blue-green
  // when ready, spinning up in the signal colour while working or
  // downloading, flickering red and broken when something's wrong.
  let artStop = null, artKind = "", wantStatus = false;
  function statusArt() {
    const i = currentState(), kind = STATES[i][1], box = $("#core .co-sbox");
    if (!box) return;
    box.className = "co-sbox " + kind;
    box.querySelector(".co-sword").textContent = $("#t-status")?.textContent || STATES[i][0];
    box.querySelector(".co-ssay").textContent = STATES[i][2];
    if (kind === artKind && artStop) return;
    artKind = kind; artStop?.(); artStop = null;
    if (!window.Ascii3D || document.body.classList.contains("reduce-motion") || window.offgrid) return;
    const A = Ascii3D, css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const col = A.hex(kind === "ok" ? css("--net") || "#5fb8c9" : kind === "busy" ? css("--signal") || "#e8d27c" : css("--red") || "#e06a6a");
    const hot = A.mix(col, [255, 255, 255], 0.55);
    const speed = kind === "busy" ? 1.6 : kind === "ok" ? 0.45 : 0.25;
    const scene = {
      fps: 16, camera: () => ({ pos: [0, 0.7, 4.2], at: [0, 0, 0], fovV: 36 }), light: [-0.4, 0.7, 0.6], ambient: 0.3, stillTime: 2, shadows: false,
      map(x, y, z, t, h) { h.m = "core"; return A.sd.sphere(x, y, z, 0.62) + (kind === "bad" ? 0.03 * A.noise3(x * 6, y * 6, z * 6) : 0); },
      materials: { core: { color: col, shade(c, t) {
        const n = A.noise3(c.x * 4 + t * speed, c.y * 4, c.z * 4 - t * speed * 0.7);
        const flick = kind === "bad" ? (Math.sin(t * 23) > 0.6 ? 0.25 : 1) : 1;
        c.emit = (0.35 + 0.45 * n + 0.2 * Math.sin(t * (kind === "busy" ? 5 : 1.6))) * flick;
        c.glyph = n > 0.62 ? "@" : n > 0.45 ? "%" : n > 0.3 ? "*" : "+"; c.color = A.mix(col, hot, n);
      } } },
      particles(t, put) {
        const rings = kind === "busy" ? 3 : 2;
        for (let r = 0; r < rings; r++) {
          const tilt = 0.5 + r * 0.9, rad = 1.0 + r * 0.22, spin = t * speed * (r % 2 ? -1 : 1) * 1.4;
          for (let k = 0; k < 64; k++) {
            if (kind === "bad" && (k + Math.floor(t * 6)) % 7 < 2) continue;   // broken rings
            const a = (k / 64) * Math.PI * 2 + spin, x = Math.cos(a) * rad, y0 = Math.sin(a) * rad * 0.3;
            put(x, y0 * Math.cos(tilt) - 0.1, y0 * Math.sin(tilt) + Math.sin(a) * rad * 0.2, k % 8 === 0 ? "◆" : "·", k % 8 === 0 ? hot : col, 0.9);
          }
        }
        if (kind === "busy") for (let k = 0; k < 14; k++) {   // work flowing in
          const p = (t * 0.9 + k / 14) % 1, a = k * 2.4;
          put(Math.cos(a) * (2 - 1.4 * p), Math.sin(a * 1.3) * (1.2 - 0.8 * p), Math.sin(a) * (1 - p), "•", hot, p);
        }
        if (kind === "bad") for (let k = 0; k < 8; k++) {   // sparks
          const p = (t * 1.3 + k / 8) % 1, a = k * 0.8 + Math.floor(t) * 1.7;
          put(Math.cos(a) * (0.65 + p), Math.sin(a) * (0.65 + p) * 0.8, 0.2, "*", hot, 1 - p);
        }
      },
    };
    try { const v = A.view(box.querySelector(".co-sart"), scene, { cell: 6 }); artStop = () => v.stop(); } catch {}
  }

  // Small facts beside the status word.
  function chips() {
    const box = $("#core .co-chips");
    if (!box || !data) return;
    const active = data.installed.find((m) => m.active);
    box.innerHTML = [active ? active.callsign : "NO MODEL", data.engine.running ? `OLLAMA ${data.engine.version}` : "ENGINE OFF",
      `${data.library.archives} ARCHIVES`].map((c) => `<i>${escapeHtml(c)}</i>`).join("");
  }

  function netCheck() {
    netState = null;
    fetch("/api/netinfo").then((r) => r.json()).then((n) => { netState = n; if (open) load(); }).catch(() => { netState = { online: false }; });
  }

  function toggle(on = $("#core").hidden, quiet = false) {
    if (on && locked) return;
    const el = $("#core");
    if (!on) {
      if (el.hidden) return;
      el.hidden = true; open = false;
      clearTimeout(timer); clearInterval(heroTimer);
      if (heroStop) { heroStop(); heroStop = null; el.querySelector(".co-orb").dataset.style = ""; }
      artStop?.(); artStop = null; artKind = "";
      if (!quiet) Sound.click();
      return;
    }
    ["closeSettings", "closeHistory"].forEach((f) => window[f] && window[f]());
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    el.hidden = false; open = true;
    shown = "";
    el.querySelector(".co-body").innerHTML = `<p class="lib-note">Reading every system…</p>`;
    el.querySelector(".co-scroll").scrollTop = 0;
    hero();
    clearInterval(heroTimer);
    heroTimer = setInterval(() => { hero(); chips(); statusArt(); }, 1000);
    netCheck();
    load();
    Sound.searchstart();
    if (window.track) track("coreOpened");
  }

  build();
  // The header's STATUS and CORE cells open it.
  // CORE opens on the AI; STATUS opens on the status, drawn.
  document.querySelectorAll(".top .cell.status, .top .cell.core").forEach((c) => {
    const status = c.classList.contains("status");
    c.classList.add("co-open");
    c.setAttribute("title", status ? "Status|What Umbra is doing right now, drawn live, and every system's condition." : "Core|The AI models: the one in use, what each can do and which suits this computer.");
    c.addEventListener("click", () => {
      const el = $("#core"), was = !el.hidden;
      if (!was) toggle(true);
      const go = () => { const sc = el.querySelector(".co-scroll"), st = el.querySelector(".co-status"); if (status) sc.scrollTo({ top: st.offsetTop - 8, behavior: was ? "smooth" : "auto" }); else sc.scrollTo({ top: 0, behavior: "smooth" }); };
      if (!was && status) wantStatus = true;   // once the AI section has loaded above it
      if (was) go(); else setTimeout(go, 350);
    });
  });
  document.addEventListener("keydown", (e) => {
    if ($("#core").hidden || !$("#modal").hidden) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); toggle(false); }
  }, true);
  // Locking, or another full screen opening (from a shortcut), closes it.
  new MutationObserver(() => {
    const b = document.body.classList;
    if (!$("#core").hidden && (b.contains("locked") || b.contains("maps-open") || b.contains("radar-open") || !$("#settings").hidden || !$("#themes").hidden)) toggle(false, true);
  })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.toggleCore = toggle;
  window.closeCore = () => toggle(false, true);
})();
