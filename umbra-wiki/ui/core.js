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
    ["AI ↓ %", "busy", "My AI model is downloading; I answer once it's in."],
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
        pct !== null ? `Downloading ${pull.model}.`
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
      ["VOICE", d.voice ? "ok" : "warn", d.voice ? "READY" : onWin() ? "N/A" : "NOT SET UP",
        d.voice ? "Hold F9 to talk; speech is turned into text offline." : onWin() ? "Voice input isn't available in the Windows app yet." : "Voice input isn't installed: see Settings → Voice."],
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

  const meter = (n, of = 5) => "▰".repeat(n) + "▱".repeat(of - n);
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
    if (m.active) actions = `<span class="co-tag on">IN USE</span>`;
    else if (m.installed) actions = `<button class="solid co-use" data-id="${escapeHtml(m.id)}">USE ${escapeHtml(m.callsign)}</button><button class="ghost co-del" data-id="${escapeHtml(m.id)}" title="Remove|Deletes this model from the computer to free ${m.size} GB. You can download it again any time.">REMOVE</button>`;
    else if (mine) actions = `<span class="co-tag busy">${pull.paused ? "PAUSED" : "DOWNLOADING"} ${pct}%</span>`;
    else actions = `<button class="${m.fit === "good" ? "solid" : "ghost"} co-get" data-id="${escapeHtml(m.id)}" ${busy ? "disabled" : ""}>DOWNLOAD ${m.size} GB</button>`;
    return `<div class="co-model${big ? " big" : ""}${m.active ? " active" : ""}" data-id="${escapeHtml(m.id)}">
      <pre class="co-logo">${escapeHtml((m.logo || []).join("\n"))}</pre>
      <div class="co-main"><div class="co-mhead"><b class="co-call">${escapeHtml(m.callsign)}</b><span class="co-real">${escapeHtml(m.family || m.name)}</span>
        ${!m.installed ? `<span class="co-fit ${m.fit.replace(" ", "-")}" title="${escapeHtml(m.fitWhy)}">${FIT[m.fit]}</span>` : m.loaded ? `<span class="co-fit good">AWAKE</span>` : ""}
        ${m.recommended ? `<span class="co-star">★ RECOMMENDED</span>` : ""}</div>
      <p class="co-line">${escapeHtml(m.line || "")}</p>
      ${big ? `<div class="co-facts">${facts}</div>` : ""}
      <div class="co-meters"><span>KNOWLEDGE <b>${meter(m.tier || 3)}</b></span><span>SPEED <b>${meter(speedN(m) + (data.system.accel ? 1 : 0), 4)}</b></span>${m.thinks ? "<span>REASONS DEEPLY</span>" : ""}</div>
      ${!big ? `<div class="co-actions">${actions}</div>` : ""}</div>
      <details ${big ? "open" : ""}><summary>MORE ABOUT ${escapeHtml(m.callsign)}</summary>
        ${!big ? `<div class="co-facts">${facts}</div>${!m.installed && m.fitWhy ? `<p class="co-why">${escapeHtml(m.fitWhy)}</p>` : ""}` : ""}
        <p>${escapeHtml(m.about || "")}</p>
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
    return `${active ? modelCard(active, true) : `<p class="lib-note">No AI model is installed yet. Pick one below: <b>RANGER</b> suits most computers.</p>`}
      ${others.length ? `<div class="co-sub-head">ALSO ON THIS COMPUTER</div>${others.map((m) => modelCard(m)).join("")}` : ""}
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
    const html = `<div class="lib-head">AI</div><div class="co-models">${models()}</div>
      <div class="lib-head">WHAT'S LOCAL</div><div class="co-systems">${systems()}</div>
      <details class="co-legend-box"><summary>WHAT THE STATUS WORDS MEAN</summary><div class="co-legend">${legend()}</div></details>`;
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
  }

  function wire(body) {
    body.querySelectorAll("button, summary").forEach((b) => b.addEventListener("mouseenter", Sound.hover));
    body.querySelectorAll(".co-use").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      const r = await post("/api/model", { model: b.dataset.id });
      if (r.error) { Sound.error(); b.disabled = false; return; }
      Sound.theme();
      if (window.refreshStatus) refreshStatus();
      load();
    }));
    body.querySelectorAll(".co-get").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      await post("/api/model/pull", { model: b.dataset.id });
      Sound.click();
      if (window.UmbraDownloads) UmbraDownloads.refresh();
      load();
    }));
    body.querySelectorAll(".co-del").forEach((b) => b.addEventListener("click", async () => {
      const m = data.installed.find((x) => x.id === b.dataset.id);
      const sure = await confirmDialog({ kind: "error", tag: "AI MODEL", title: `REMOVE ${m ? m.callsign : "THIS MODEL"}?`,
        body: `${m ? m.name : b.dataset.id} is deleted from this computer, freeing ${m ? m.size : "?"} GB. You can download it again any time.`,
        ok: "REMOVE", cancel: "KEEP IT" });
      if (!sure) return;
      const r = await post("/api/model/delete", { model: b.dataset.id });
      if (r.error) Sound.error(); else Sound.click();
      load();
    }));
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
      <div class="co-body"></div>`;
    document.body.appendChild(el);
    el.querySelector(".co-close").addEventListener("click", () => toggle(false));
    el.querySelector(".co-refresh").addEventListener("click", () => { Sound.searchstart(); netCheck(); load(); });
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
      if (!quiet) Sound.click();
      return;
    }
    ["closeSettings", "closeHistory"].forEach((f) => window[f] && window[f]());
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    el.hidden = false; open = true;
    shown = "";
    el.querySelector(".co-body").innerHTML = `<p class="lib-note">Reading every system…</p>`;
    hero();
    clearInterval(heroTimer);
    heroTimer = setInterval(() => { hero(); chips(); }, 1000);
    netCheck();
    load();
    Sound.searchstart();
    if (window.track) track("coreOpened");
  }

  build();
  // The header's STATUS and CORE cells open it.
  document.querySelectorAll(".top .cell.status, .top .cell.core").forEach((c) => {
    c.classList.add("co-open");
    c.setAttribute("title", "Core|Every system's condition, and the AI models: what each can do and which suits this computer.");
    c.addEventListener("click", () => toggle());
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
