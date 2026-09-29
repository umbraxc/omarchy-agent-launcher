// Umbra Wiki Core panel: click STATUS (or CORE) in the header. A live ASCII
// core in the colour of the current state, every system's condition with
// what to do about it, what each status word means, and the AI models: the
// one in use, the others installed, and more to download, each with its own
// emblem, what it's good at, its limits, an example of how it answers and
// how well it suits this computer. Loaded after app.js (uses $, Sound,
// escapeHtml, fmtSize, confirmDialog, refreshStatus).
"use strict";

(() => {
  let data = null, timer = 0, raf = 0, frame = 0, open = false, netState = null;
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

  // A ring of points around the centre with a bright sweep going round
  // (still when offline), drawn in characters.
  const W = 31, H = 11;
  function coreArt(kind, label) {
    const grid = Array.from({ length: H }, () => Array(W).fill(" "));
    const cx = (W - 1) / 2, cy = (H - 1) / 2;
    const ring = (rx, ry, n, ch) => { for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2; const x = Math.round(cx + Math.cos(a) * rx), y = Math.round(cy + Math.sin(a) * ry); if (grid[y] && grid[y][x] === " ") grid[y][x] = ch; } };
    ring(14, 5, 44, "·");
    ring(9.5, 3.4, 30, "∙");
    const still = kind === "bad" || document.body.classList.contains("reduce-motion") || window.offgrid;
    if (!still) {
      const speed = kind === "busy" ? 0.16 : 0.07;
      for (let t = 0; t < 7; t++) {
        const a = frame * speed - t * 0.13;
        const x = Math.round(cx + Math.cos(a) * 14), y = Math.round(cy + Math.sin(a) * 5);
        if (grid[y]) grid[y][x] = t === 0 ? "◆" : t < 3 ? "●" : "•";
        const x2 = Math.round(cx + Math.cos(-a * 1.3) * 9.5), y2 = Math.round(cy + Math.sin(-a * 1.3) * 3.4);
        if (grid[y2] && t < 4) grid[y2][x2] = t === 0 ? "◇" : "∘";
      }
    } else if (kind === "bad") {
      [[-2, -1], [-1, 0], [0, 1], [1, 2], [2, 3]].forEach(([dx, dy], i) => { grid[cy + dy - 1][cx + dx] = "╲"; grid[cy + dy - 1][cx - dx] = "╱"; });
    }
    if (kind !== "bad") {
      const pulse = still ? "◉" : ["◉", "◎", "○", "◎"][Math.floor(frame / 8) % 4];
      grid[cy][cx] = pulse;
      grid[cy][cx - 2] = "["; grid[cy][cx + 2] = "]";
    }
    const lines = grid.map((r) => r.join(""));
    return lines.join("\n") + "\n" + label.padStart(Math.round((W + label.length) / 2)).padEnd(W);
  }
  function drawCore() {
    const pre = $("#core .co-art");
    if (!pre || !open) { raf = 0; return; }
    frame++;
    const i = currentState();
    pre.textContent = coreArt(STATES[i][1], "« " + ($("#t-status")?.textContent || STATES[i][0]) + " »");
    pre.className = "co-art " + STATES[i][1];
    raf = setTimeout(() => requestAnimationFrame(drawCore), 90);
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
      <div class="co-facts">${facts}</div>
      <div class="co-meters"><span>KNOWLEDGE <b>${meter(m.tier || 3)}</b></span><span>SPEED <b>${meter(speedN(m) + (data.system.accel ? 1 : 0), 4)}</b></span>${m.thinks ? "<span>REASONS DEEPLY</span>" : ""}</div>
      ${!m.installed && m.fitWhy ? `<p class="co-why">${escapeHtml(m.fitWhy)}</p>` : ""}</div>
      <details ${big ? "open" : ""}><summary>MORE ABOUT ${escapeHtml(m.callsign)}</summary>
        <p>${escapeHtml(m.about || "")}</p>
        <div class="co-gl"><div><em>GOOD AT</em>${list(m.good)}</div><div><em>LIMITS</em>${list(m.limits)}</div></div>
        ${m.example ? `<div class="co-ex"><em>HOW IT ANSWERS · "How long do I boil water to make it safe?"</em><p>${escapeHtml(m.example).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")}</p></div>` : ""}
      </details>
      <div class="co-actions">${actions}</div></div>`;
  }

  function models() {
    const active = data.installed.find((m) => m.active);
    const others = data.installed.filter((m) => !m.active);
    const order = { good: 0, slow: 1, tight: 2, "too big": 3 };
    const more = [...data.catalog].sort((a, b) => order[a.fit] - order[b.fit] || (a.tier || 3) - (b.tier || 3));
    const failed = (data.pull || {}).status === "failed" ? `<p class="lib-note">The last download failed: ${escapeHtml(data.pull.error || "")}</p>` : "";
    return `${active ? `<div class="lib-head">ACTIVE AI</div>${modelCard(active, true)}` : `<p class="lib-note">No AI model is installed yet. Pick one below: <b>RANGER</b> suits most computers.</p>`}
      ${others.length ? `<div class="lib-head">ALSO ON THIS COMPUTER</div><div class="co-grid">${others.map((m) => modelCard(m)).join("")}</div>` : ""}
      <div class="lib-head">MORE MODELS</div>
      <p class="lib-note">Every model runs on this computer, offline. Bigger ones know more and write better but think slower; the badge says how each suits this computer (${escapeHtml(data.system.ramGB + " GB memory")}, ${data.system.accel ? "graphics card: " + escapeHtml(data.system.accel) : "no AI graphics card"}, ${escapeHtml(String(data.system.freeGB))} GB free).</p>
      ${failed}<div class="co-grid">${more.map((m) => modelCard(m)).join("")}</div>`;
  }

  // ------------------------------------------------------------ render

  async function load() {
    data = await fetch("/api/core").then((r) => r.json()).catch(() => null);
    if (!open) return;
    const body = $("#core .co-body");
    if (!data) { body.innerHTML = `<p class="lib-note">Umbra's background service didn't answer. Restart Umbra.</p>`; return; }
    const keep = body.scrollTop, opened = [...body.querySelectorAll("details[open]")].map((d) => d.closest(".co-model")?.dataset.id);
    body.innerHTML = `<div class="co-left">
        <div class="co-hero"><pre class="co-art"></pre><div class="co-now"></div></div>
        <div class="lib-head">SYSTEMS</div><div class="co-systems">${systems()}</div>
        <div class="lib-head">WHAT THE STATUS MEANS</div><div class="co-legend">${legend()}</div>
      </div><div class="co-right">${models()}</div>`;
    const i = currentState();
    body.querySelector(".co-now").innerHTML = `<b class="${STATES[i][1]}">${escapeHtml($("#t-status")?.textContent || STATES[i][0])}</b><span>${escapeHtml(STATES[i][2])}</span>`;
    opened.forEach((id) => { const d = body.querySelector(`.co-model[data-id="${CSS.escape(id || "")}"] details`); if (d) d.open = true; });
    body.scrollTop = keep;
    wire(body);
    if (!raf) drawCore();
    clearTimeout(timer);
    timer = setTimeout(load, data.pull && data.pull.active ? 2000 : 6000);
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
    el.id = "core"; el.className = "corepanel"; el.hidden = true;
    el.innerHTML = `<div class="co-head"><span class="lo-title"><span class="spin" data-spin>✻</span> CORE</span>
        <span class="co-sub">Umbra's systems and its AI</span>
        <div class="co-tools"><button class="ghost co-refresh" title="Check again|Reads every system's condition now.">↻ CHECK</button>
        <button class="ghost co-close" title="Close · Esc|Back to where you were.">CLOSE ✕</button></div></div>
      <div class="co-body"></div>`;
    document.body.appendChild(el);
    el.querySelector(".co-close").addEventListener("click", () => toggle(false));
    el.querySelector(".co-refresh").addEventListener("click", () => { Sound.searchstart(); netCheck(); load(); });
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
      document.body.classList.remove("core-open");
      clearTimeout(timer); clearTimeout(raf); raf = 0;
      if (!quiet) { Sound.click(); if (typeof goBack === "function") goBack(); }
      if (window.startRain) startRain();
      return;
    }
    ["closeSettings", "closeHistory", "closeFieldKit", "closeMaps", "closeRadar"].forEach((f) => window[f] && window[f]());
    if (window.closeLoadout) window.closeLoadout(true);
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    el.hidden = false; open = true;
    document.body.classList.add("core-open");
    if (window.stopRain) stopRain();
    el.querySelector(".co-body").innerHTML = `<p class="lib-note">Reading every system…</p>`;
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
    if (!$("#core").hidden && (b.contains("locked") || b.contains("maps-open") || b.contains("radar-open"))) toggle(false, true);
  })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.toggleCore = toggle;
  window.closeCore = () => toggle(false, true);
})();
