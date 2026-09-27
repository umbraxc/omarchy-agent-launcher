// Umbra Wiki settings: sound, motion, answer extras, the AI model, voice,
// storage folders, the welcome tour and resetting Umbra. Preferences live
// in ~/.config/umbra-wiki/settings.json with the theme and loadout.
// Loaded after app.js and uses its helpers ($, Sound, postSettings,
// confirmDialog, setMuted, stopRain, startRain, toggleThemes, locked).
"use strict";

(() => {
  const DEFAULTS = {
    volume: 0.9, hoverSounds: true, rain: true, reduceMotion: false,
    suggestions: true, greeting: true, barAlert: true,
  };
  window.prefs = { ...DEFAULTS, hiddenControls: [] };
  // Header buttons that can be hidden (Settings itself always stays).
  const CONTROLS = [["loadout-btn", "Profile & loadout"], ["history-btn", "History"], ["library-btn", "Library"],
                    ["theme-btn", "Themes"], ["sound", "Sound"], ["lock", "Lock"]];
  const panel = $("#settings");
  let pullTimer = 0;
  const body = $("#settings-body");

  // Hidden buttons glitch out and the rest close up to the right; shown ones
  // glitch back in. Without animation (at startup) they just switch.
  function applyControls(animate) {
    const hidden = new Set(prefs.hiddenControls || []);
    for (const [id] of CONTROLS) {
      const el = $("#" + id);
      if (!el) continue;
      const hide = hidden.has(id);
      const shown = !el.classList.contains("gone") && !el.classList.contains("glitch-out");
      if (hide !== shown) continue;
      el.classList.remove("glitch-in", "glitch-out");
      if (!animate || prefs.reduceMotion) { el.classList.toggle("gone", hide); continue; }
      void el.offsetWidth;
      if (hide) {
        el.classList.add("glitch-out");
        el.addEventListener("animationend", () => {
          if (el.classList.contains("glitch-out")) { el.classList.remove("glitch-out"); el.classList.add("gone"); }
        }, { once: true });
      } else {
        el.classList.remove("gone");
        el.classList.add("glitch-in");
        el.addEventListener("animationend", () => el.classList.remove("glitch-in"), { once: true });
      }
    }
  }

  function applyPrefs() {
    document.body.classList.toggle("no-rain", !prefs.rain);
    document.body.classList.toggle("reduce-motion", !!prefs.reduceMotion);
    if (!prefs.rain || prefs.reduceMotion) stopRain();
  }
  async function load() {
    try { Object.assign(prefs, DEFAULTS, await (await fetch("/api/settings")).json()); } catch {}
    applyPrefs();
    applyControls(false);
  }
  function save(update) {
    Object.assign(prefs, update);
    applyPrefs();
    postSettings(update);
  }

  // ----------------------------------------------------------- panel

  const toggle = (key, label, hint) => `
    <label class="set-row"><span class="set-text"><b>${label}</b><small>${hint}</small></span>
      <input type="checkbox" class="set-toggle" data-key="${key}"></label>`;

  async function render() {
    const [models, voice, paths] = await Promise.all([
      fetch("/api/models").then((r) => r.json()).catch(() => ({ current: "", models: [] })),
      fetch("/api/voice").then((r) => r.json()).catch(() => ({ available: false })),
      fetch("/api/paths").then((r) => r.json()).catch(() => ({})),
    ]);
    body.innerHTML = `
      <section class="set-section"><div class="lib-head">SOUND</div>
        ${toggle("sound", "Sound effects", "Startup, clicks, search and answer sounds")}
        <label class="set-row"><span class="set-text"><b>Volume</b><small>How loud Umbra's sounds are</small></span>
          <input type="range" class="set-volume" min="0" max="1" step="0.05"></label>
        ${toggle("hoverSounds", "Hover sounds", "Soft blips when the mouse moves over buttons")}
      </section>
      <section class="set-section"><div class="lib-head">HEADER BUTTONS</div>
        ${CONTROLS.map(([id, label]) => `
          <label class="set-row"><span class="set-text"><b>${label}</b><small>Show this button in the top right</small></span>
            <input type="checkbox" class="set-control" data-control="${id}"></label>`).join("")}
        <p class="lib-note">Settings always stays, so you can bring the others back.</p>
      </section>
      <section class="set-section"><div class="lib-head">MOTION</div>
        ${toggle("rain", "Digital rain", "Falling characters behind the start screen")}
        ${toggle("reduceMotion", "Reduce motion", "Calm the animations; good for slow computers")}
      </section>
      <section class="set-section"><div class="lib-head">CONVERSATION</div>
        ${toggle("greeting", "Personal greeting", "Welcome you on the start screen, picking up from last time")}
        ${toggle("suggestions", "Suggested replies", "Offer a likely reply after each answer (Tab to use it)")}
        ${toggle("barAlert", "Bar alert", "Light up the bar icon when an answer arrives in the background")}
      </section>
      <section class="set-section"><div class="lib-head">AI MODEL</div>
        <label class="set-row"><span class="set-text"><b>Local model</b><small>Bigger models are smarter but slower. Add more with <code>ollama pull &lt;name&gt;</code></small></span>
          <select class="set-model"></select></label>
        <div class="set-pulls"></div>
      </section>
      <section class="set-section"><div class="lib-head">VOICE</div>
        <p class="lib-note set-voice"></p>
      </section>
      <section class="set-section"><div class="lib-head">STORAGE</div>
        ${["library", "history", "config"].map((k) => `
          <div class="set-row"><span class="set-text"><b>${{ library: "Library", history: "History", config: "Settings and profile" }[k]}</b>
            <small><code>${escapeHtml(paths[k] || "")}</code></small></span>
            <button class="ghost set-open" data-which="${k}">OPEN</button></div>`).join("")}
      </section>
      <section class="set-section"><div class="lib-head">WELCOME TOUR</div>
        <div class="set-row"><span class="set-text"><b>Replay the tour</b><small>The first-launch walkthrough of everything Umbra can do</small></span>
          <button class="ghost set-tour">REPLAY</button></div>
      </section>
      <section class="set-section danger"><div class="lib-head">DANGER ZONE</div>
        <div class="set-row"><span class="set-text"><b>Reset Umbra</b><small>Delete your profile, settings, custom themes, personalities, scenarios and all conversations</small></span>
          <button class="ghost set-reset">RESET…</button></div>
      </section>
      <p class="set-about">Umbra Wiki · part of Omarchy Umbra · sounds by Kenney (CC0)</p>`;

    body.querySelectorAll(".set-toggle").forEach((box) => {
      const key = box.dataset.key;
      box.checked = key === "sound" ? !Sound.muted : prefs[key] !== false && !!(prefs[key] ?? true);
      if (key === "reduceMotion") box.checked = !!prefs.reduceMotion;
      box.addEventListener("change", () => {
        if (key === "sound") setMuted(!box.checked);
        else save({ [key]: box.checked });
        if (key === "rain" && box.checked && !prefs.reduceMotion) startRain();
        Sound.click();
      });
    });
    body.querySelectorAll(".set-control").forEach((box) => {
      const id = box.dataset.control;
      box.checked = !(prefs.hiddenControls || []).includes(id);
      box.addEventListener("change", () => {
        const hidden = new Set(prefs.hiddenControls || []);
        if (box.checked) hidden.delete(id); else hidden.add(id);
        save({ hiddenControls: [...hidden] });
        applyControls(true);
        Sound.click();
      });
    });
    const vol = body.querySelector(".set-volume");
    vol.value = prefs.volume;
    vol.addEventListener("change", () => { save({ volume: Number(vol.value) }); Sound.click(); });

    const select = body.querySelector(".set-model");
    const names = models.models.length ? models.models : [models.current];
    select.innerHTML = names.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
    select.value = models.current;
    select.addEventListener("change", async () => {
      const res = await fetch("/api/model", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: select.value }),
      }).catch(() => null);
      if (res && res.ok) { Sound.theme(); refreshStatus(); } else { Sound.error(); select.value = models.current; }
    });

    // Models that can be downloaded, with progress while one is coming in.
    const pulls = body.querySelector(".set-pulls");
    const pull = models.pull || {};
    const installedIds = (models.installed || []).map((m) => m.id);
    pulls.innerHTML = (models.choices || []).filter((c) => !installedIds.includes(c.id)).map((c) => {
      const active = pull.active && pull.model === c.id;
      const pct = active && pull.total ? Math.round((pull.completed * 100) / pull.total) : 0;
      return `<div class="set-row"><span class="set-text"><b>${escapeHtml(c.name)}</b><small>${c.size} GB · ${escapeHtml(c.line)}</small></span>
        <button class="ghost set-pull" data-model="${escapeHtml(c.id)}" ${pull.active ? "disabled" : ""}>${active ? `↓ ${pct}%` : "DOWNLOAD"}</button></div>`;
    }).join("") + (pull.status === "failed" ? `<p class="lib-note">Download failed: ${escapeHtml(pull.error || "")}</p>` : "");
    pulls.querySelectorAll(".set-pull").forEach((b) => b.addEventListener("click", async () => {
      await fetch("/api/model/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: b.dataset.model }) });
      Sound.click();
      render();
    }));
    clearTimeout(pullTimer);
    if (pull.active) pullTimer = setTimeout(() => { if (!panel.hidden) render(); }, 2500);

    body.querySelector(".set-voice").innerHTML = !voice.available
      ? "Voice input isn't installed. On Omarchy, install it with <code>omarchy-voxtype-install</code>, then hold <b>F9</b> to talk."
      : voice.daemon
        ? "Voice input is ready: hold <b>F9</b> anywhere, or click the microphone next to TRANSMIT. Speech is turned into text offline by voxtype."
        : "Voice input is ready: click the microphone next to TRANSMIT, or hold <b>F9</b> in Umbra. Speech is turned into text offline by voxtype.";

    body.querySelectorAll(".set-open").forEach((b) => b.addEventListener("click", () => {
      fetch("/api/open-folder", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ which: b.dataset.which }) });
      Sound.click();
    }));
    body.querySelector(".set-tour").addEventListener("click", () => {
      if (controller) { Sound.error(); return; }
      open(false, true);
      window.startTour && window.startTour();
    });
    body.querySelector(".set-reset").addEventListener("click", resetUmbra);
  }

  // Reset asks twice: it deletes everything personal.
  async function resetUmbra() {
    const first = await confirmDialog({
      kind: "error", tag: "RESET", title: "RESET UMBRA?",
      body: "This deletes your profile, settings, custom themes, personalities and scenarios, and every saved conversation.\n\nYour AI model and your library downloads are kept.",
      ok: "CONTINUE", cancel: "CANCEL",
    });
    if (!first) return;
    const sure = await confirmDialog({
      kind: "error", tag: "FINAL WARNING", title: "THIS CAN'T BE UNDONE",
      body: "Umbra will restart as if freshly installed, with the welcome tour.",
      ok: "RESET EVERYTHING", cancel: "KEEP MY DATA",
    });
    if (!sure) return;
    const res = await fetch("/api/reset", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: "RESET" }),
    }).catch(() => null);
    if (!res || !res.ok) { Sound.error(); return; }
    location.reload();
  }
  window.resetUmbra = resetUmbra;

  // ------------------------------------------------------ open / close

  function open(show = panel.hidden, quiet = false) {
    if (show && locked) return;
    if (show === !panel.hidden) return;
    panel.hidden = !show;
    $("#settings-btn").classList.toggle("on", show);
    if (show) {
      toggleThemes(false, true);
      $("#library").hidden = true;
      $("#library-btn").classList.remove("on");
      if (window.closeHistory) window.closeHistory();
      if (window.closeLoadout) window.closeLoadout(true);
      render();
    }
    if (!quiet) Sound.click();
  }
  window.closeSettings = () => open(false, true);

  $("#settings-btn").addEventListener("click", () => open());
  $("#settings-close").addEventListener("click", () => open(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden && $("#modal").hidden) { e.stopImmediatePropagation(); open(false); }
  }, true);
  new MutationObserver(() => { if (document.body.classList.contains("locked")) open(false, true); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  load();
  // Follow changes made elsewhere (another window, or a reset).
  setInterval(async () => {
    try {
      const s = await (await fetch("/api/settings")).json();
      if (JSON.stringify(s.hiddenControls || []) !== JSON.stringify(prefs.hiddenControls || [])) {
        prefs.hiddenControls = s.hiddenControls || [];
        applyControls(true);
      }
    } catch {}
  }, 3000);
})();
