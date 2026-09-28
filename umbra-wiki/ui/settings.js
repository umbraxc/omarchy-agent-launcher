// Umbra Wiki settings: live performance and the AI's processor limit, sound,
// motion, answer extras, the AI model, voice,
// storage folders, the welcome tour and resetting Umbra. Preferences live
// in ~/.config/umbra-wiki/settings.json with the theme and loadout.
// Loaded after app.js and uses its helpers ($, Sound, postSettings,
// confirmDialog, setMuted, stopRain, startRain, toggleThemes, locked).
"use strict";

(() => {
  const DEFAULTS = {
    volume: 0.9, hoverSounds: true, rain: true, background: "rain", reduceMotion: false, offgrid: "off", textScale: 1, cpuLimit: 100,
    suggestions: true, greeting: true, barAlert: true,
  };
  window.prefs = { ...DEFAULTS, hiddenControls: [] };
  // Header buttons that can be hidden (Settings itself always stays).
  const CONTROLS = [["loadout-btn", "Profile & loadout"], ["history-btn", "History"], ["library-btn", "Library"],
                    ["theme-btn", "Themes"], ["sound", "Sound"], ["lock", "Lock"]];
  const panel = $("#settings");
  let pullTimer = 0;
  let packagedInstall = false;   // installed with pacman (the AUR): removal goes through pacman
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

  const BACKGROUNDS = window.UmbraBackgrounds ? window.UmbraBackgrounds.list : [["rain", "Digital rain"], ["none", "None"]];
  let runningBackground = "rain";
  // Off-grid mode (battery saver): on, off, or automatic when unplugged.
  let onBattery = false;
  const offgridActive = () => prefs.offgrid === "on" || (prefs.offgrid === "auto" && onBattery);
  async function checkPower() {
    try { onBattery = !!(await (await fetch("/api/power")).json()).battery; } catch {}
    applyPrefs();
  }
  setInterval(() => { if (prefs.offgrid === "auto") checkPower(); }, 30000);

  function applyPrefs() {
    const calm = !!prefs.reduceMotion || offgridActive();
    const wasCalm = document.body.classList.contains("reduce-motion");
    window.offgrid = offgridActive();
    document.body.classList.toggle("offgrid", window.offgrid);
    document.body.classList.toggle("reduce-motion", calm);
    document.documentElement.style.setProperty("--ts", String(prefs.textScale || 1));
    if (calm) stopRain();
    else if (wasCalm && $("#rain")) startRain();
    // Older settings only had the rain switch.
    if (prefs.rain === false && !prefs.background) prefs.background = "none";
    prefs.background = prefs.background || "rain";
    document.body.classList.toggle("no-rain", prefs.background === "none");
    if (prefs.background !== runningBackground) {
      runningBackground = prefs.background;
      if ($("#rain") && !calm) startRain();
    }
  }
  async function load() {
    try { Object.assign(prefs, DEFAULTS, await (await fetch("/api/settings")).json()); } catch {}
    await checkPower();
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
    packagedInstall = !!paths.packaged;
    body.innerHTML = `
      <section class="set-section set-cpu"><div class="lib-head"><span>PERFORMANCE</span><b class="cpu-now"></b></div>
        <canvas class="cpu-graph" aria-label="Processor use over the last minute"></canvas>
        <div class="cpu-legend"><span class="lg-total"><i></i>WHOLE PROCESSOR <b class="cpu-total">--</b></span>
          <span class="lg-umbra"><i></i>UMBRA <b class="cpu-umbra">--</b></span><span class="cpu-span">LAST 60 S</span></div>
        <div class="cpu-cores" title="Each processor thread"></div>
        <div class="cpu-stats">
          <span><small>PROCESSOR</small><b class="cpu-name">--</b></span>
          <span><small>CORES</small><b class="cpu-count">--</b></span>
          <span><small>TEMPERATURE</small><b class="cpu-temp">--</b></span>
          <span><small>MEMORY</small><b class="cpu-mem">--</b></span>
        </div>
        <div class="set-row"><span class="set-text"><b>AI processor limit</b><small class="cpu-limit-note">How much of the processor
          Umbra's AI may use while it writes. Lower keeps your computer cooler and quieter; answers take longer.</small></span></div>
        <div class="seg" role="slider" tabindex="0" aria-label="AI processor limit" aria-valuemin="25" aria-valuemax="100">
          <div class="seg-fill"></div>
          ${[[25, "LIGHT"], [50, "BALANCED"], [75, "STRONG"], [100, "FULL"]].map(([v, name]) =>
            `<button type="button" class="seg-step" data-v="${v}"><b>${v}%</b><small>${name}</small></button>`).join("")}
        </div>
      </section>
      <section class="set-section"><div class="lib-head">SOUND</div>
        ${toggle("sound", "Sound effects", "Startup, clicks, search and answer sounds")}
        <label class="set-row"><span class="set-text"><b>Volume</b><small>How loud Umbra's sounds are</small></span>
          <input type="range" class="set-volume" min="0" max="1" step="0.05"></label>
        ${toggle("hoverSounds", "Hover sounds", "Soft blips when the mouse moves over buttons")}
        <label class="set-row"><span class="set-text"><b>Sound output</b><small>Where Umbra's sounds play</small></span>
          <span class="set-previews"><select class="set-audio-out"></select><button class="ghost set-audio-test">▶ TEST</button></span></label>
        <label class="set-row"><span class="set-text"><b>Microphone</b><small class="set-audio-in-note">What voice input listens to</small></span>
          <select class="set-audio-in"></select></label>
        <p class="lib-note set-sound-missing" hidden></p>
      </section>
      <section class="set-section"><div class="lib-head">HEADER BUTTONS</div>
        ${CONTROLS.map(([id, label]) => `
          <label class="set-row"><span class="set-text"><b>${label}</b><small>Show this button in the top right</small></span>
            <input type="checkbox" class="set-control" data-control="${id}"></label>`).join("")}
        <p class="lib-note">Settings always stays, so you can bring the others back.</p>
      </section>
      <section class="set-section"><div class="lib-head">MOTION</div>
        <label class="set-row"><span class="set-text"><b>Transition</b><small>How the boot, the goodbye and the end of the tour sweep across the screen</small></span>
          <select class="set-transition">${(window.UmbraTransitions || [["wave", "Glyph wave"]]).map(([id, name]) => `<option value="${id}">${name}</option>`).join("")}</select></label>
        <div class="set-row"><span class="set-text"><small>Try the chosen transition</small></span>
          <span class="set-previews"><button class="ghost set-prev-boot">▶ BOOT</button><button class="ghost set-prev-outro">▶ GOODBYE</button></span></div>
        <label class="set-row"><span class="set-text"><b>Start screen background</b><small>The animation behind the globe and title</small></span>
          <select class="set-background">${BACKGROUNDS.map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}</select></label>
        ${toggle("reduceMotion", "Reduce motion", "Calm the animations; good for slow computers")}
      </section>
      <section class="set-section"><div class="lib-head">CONVERSATION</div>
        ${toggle("greeting", "Personal greeting", "Welcome you on the start screen, picking up from last time")}
        ${toggle("suggestions", "Suggested replies", "Offer a likely reply after each answer (Tab to use it)")}
        ${toggle("barAlert", "Bar alert", "Light up the bar icon when an answer arrives in the background")}
        ${toggle("confirmExit", "Ask before closing", "A short confirmation (and the goodbye animation) when you close Umbra")}
        <label class="set-row"><span class="set-text"><b>Text size</b><small>Answers, your messages, the questions on the start screen and the prompt</small></span>
          <select class="set-textsize"><option value="0.9">Small</option><option value="1">Normal</option>
            <option value="1.12">Large</option><option value="1.25">Extra large</option></select></label>
      </section>
      <section class="set-section"><div class="lib-head">POWER</div>
        <label class="set-row"><span class="set-text"><b>Off-grid mode</b><small>A battery saver for when power is scarce.
          Animations and backgrounds stop, the boot animation is skipped, hover sounds and the working hum go quiet,
          and Umbra skips its extra AI work (greeting, personal questions, suggested replies) and writes shorter answers.
          Everything else works the same. <span class="set-power"></span></small></span>
          <select class="set-offgrid"><option value="off">Off</option><option value="on">On</option>
            <option value="auto">On battery</option></select></label>
      </section>
      <section class="set-section"><div class="lib-head">KEYBOARD</div>
        <div class="set-row"><span class="set-text"><b>Keyboard shortcuts</b><small>Every shortcut on one screen. Press F1 any time.</small></span>
          <button class="ghost set-keys">SHOW</button></div>
      </section>
      <section class="set-section"><div class="lib-head">BACKUP</div>
        <div class="set-row"><span class="set-text"><b>Back up your Umbra</b><small>Your profile, settings, custom themes, personalities and scenarios in one file,
          saved to Documents or a USB stick.</small></span>
          <button class="ghost set-backup">BACK UP</button></div>
        <label class="set-row"><span class="set-text"><b>Include conversations</b><small>Put your History in the backup too</small></span>
          <input type="checkbox" class="set-backup-history" checked></label>
        <div class="set-row"><span class="set-text"><b>Restore a backup</b><small>Choose an umbra-backup file. Items in it are added or replace what's here.</small></span>
          <button class="ghost set-restore">RESTORE…</button></div>
        <input type="file" class="set-restore-file" accept=".json,application/json" hidden>
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
        <div class="set-row"><span class="set-text"><b>Reset Umbra</b><small>Start over as if Umbra was just installed: your profile, settings,
          custom themes, personalities and scenarios, and every conversation are deleted, then the welcome tour runs again.
          The AI model and the library are kept.</small></span>
          <button class="ghost set-reset">RESET…</button></div>
        <div class="set-row"><span class="set-text"><b>Uninstall Umbra</b><small>Remove Umbra Wiki from this computer: the app, its menu entry
          and background service, your profile, settings and conversations. Ollama and other system packages stay.
          On Omarchy, the Omarchy Umbra bar widget stays and can set Umbra up again.</small></span>
          <button class="ghost set-uninstall">UNINSTALL…</button></div>
        <div class="set-uninstall-box" hidden>
          <label class="set-row"><span class="set-text"><b>Also delete the offline library</b><small class="set-lib-size"></small></span>
            <input type="checkbox" class="set-un-library"></label>
          <label class="set-row"><span class="set-text"><b>Also delete the AI model</b><small class="set-model-size"></small></span>
            <input type="checkbox" class="set-un-model"></label>
          <div class="set-row"><span class="set-text"><small>Nothing is removed until you confirm.</small></span>
            <button class="ghost set-un-go">UNINSTALL UMBRA</button></div>
        </div>
      </section>
      <p class="set-about">Umbra Wiki <span class="set-version"></span> · part of Omarchy Umbra · sounds by Kenney (CC0) · MIT license</p>`;
    fetch("/api/status").then((r) => r.json()).then((s) => { const v = body.querySelector(".set-version"); if (v && s.version) v.textContent = s.version; }).catch(() => {});

    body.querySelectorAll(".set-toggle").forEach((box) => {
      const key = box.dataset.key;
      box.checked = key === "sound" ? !Sound.muted : prefs[key] !== false && !!(prefs[key] ?? true);
      if (key === "reduceMotion") box.checked = !!prefs.reduceMotion;
      box.addEventListener("change", () => {
        if (key === "sound") setMuted(!box.checked);
        else save({ [key]: box.checked });
        if (key === "reduceMotion" && !box.checked) startRain();
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
    const ts = body.querySelector(".set-textsize");
    ts.value = String(prefs.textScale || 1);
    if (!ts.value) ts.value = "1";
    ts.addEventListener("change", () => { save({ textScale: Number(ts.value) }); Sound.click(); });
    const og = body.querySelector(".set-offgrid");
    og.value = prefs.offgrid || "off";
    const powerLine = () => {
      body.querySelector(".set-power").textContent = prefs.offgrid === "auto"
        ? `Right now: ${onBattery ? "on battery, so it's on" : "plugged in, so it's off"}.` : "";
    };
    powerLine();
    og.addEventListener("change", async () => { save({ offgrid: og.value }); await checkPower(); powerLine(); Sound.theme(); });
    body.querySelector(".set-keys").addEventListener("click", () => window.showShortcuts && window.showShortcuts());
    body.querySelector(".set-backup").addEventListener("click", () =>
      exportTo({ history: body.querySelector(".set-backup-history").checked }, "your backup", "/api/backup"));
    const file = body.querySelector(".set-restore-file");
    body.querySelector(".set-restore").addEventListener("click", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files[0];
      file.value = "";
      if (!f) return;
      let data;
      try { data = JSON.parse(await f.text()); } catch { data = null; }
      if (!data || data.umbraBackup !== 1) {
        confirmDialog({ kind: "error", tag: "RESTORE", title: "NOT AN UMBRA BACKUP", body: "That file isn't an Umbra backup.", cancel: "OK" });
        return;
      }
      const when = new Date(data.created || 0).toLocaleString();
      const ok = await confirmDialog({
        kind: "to-local", tag: "RESTORE", title: "RESTORE THIS BACKUP?",
        body: `Backup from ${when}: profile and settings, ${(data.themes || []).length} themes, ${(data.personalities || []).length} personalities, ` +
          `${(data.scenarios || []).length} scenarios and ${(data.history || []).length} conversations.\n\n` +
          "They replace your current profile and settings, and are added to your other items. Umbra reloads afterwards.",
        ok: "RESTORE", cancel: "CANCEL",
      });
      if (!ok) return;
      const res = await fetch("/api/restore", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ backup: data }),
      }).catch(() => null);
      if (!res || !res.ok) { Sound.error(); return; }
      location.reload();
    });
    // Audio devices ("" = the system default).
    const audio = await fetch("/api/audio").then((r) => r.json()).catch(() => ({ outputs: [], inputs: [] }));
    const fill = (select, list, current) => {
      select.innerHTML = `<option value="">System default</option>` +
        list.map((d) => `<option value="${escapeHtml(d.name)}">${escapeHtml(d.description)}</option>`).join("");
      select.value = current || "";
    };
    const outSel = body.querySelector(".set-audio-out"), inSel = body.querySelector(".set-audio-in");
    fill(outSel, audio.outputs || [], audio.out);
    fill(inSel, audio.inputs || [], audio.in);
    // No program to play sounds with (they're optional in the package): say so, with the fix.
    const missing = body.querySelector(".set-sound-missing");
    if (audio.player === "" && audio.fix) {
      missing.hidden = false;
      missing.innerHTML = `<b>No sound player is installed, so Umbra is silent.</b> Install one in a terminal with
        <code></code> then press ▶ TEST above.`;
      missing.querySelector("code").textContent = audio.fix;
    }
    if (voice.daemon) body.querySelector(".set-audio-in-note").textContent = "What voice input listens to; voxtype uses it too, so F9 works with the same microphone everywhere";
    const setAudio = async (update) => {
      const r = await fetch("/api/audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) })
        .then((x) => x.json()).catch(() => ({ error: "failed" }));
      if (r.error) Sound.error(); else Sound.click();
    };
    outSel.addEventListener("change", async () => { await setAudio({ out: outSel.value }); Sound.found(); });
    inSel.addEventListener("change", () => setAudio({ in: inSel.value }));
    body.querySelector(".set-audio-test").addEventListener("click", (e) => { e.preventDefault(); Sound.found(); });
    const tr = body.querySelector(".set-transition");
    tr.value = prefs.transition || "wave";
    tr.addEventListener("change", () => { save({ transition: tr.value }); Sound.click(); });
    const preview = async (which) => {
      if (document.body.classList.contains("reduce-motion")) { Sound.error(); return; }
      open(false, true);
      await window.previewTransition(which);
      open(true, true);
    };
    body.querySelector(".set-prev-boot").addEventListener("click", () => preview("boot"));
    body.querySelector(".set-prev-outro").addEventListener("click", () => preview("outro"));
    const bgSelect = body.querySelector(".set-background");
    bgSelect.value = prefs.background || "rain";
    bgSelect.addEventListener("change", () => { save({ background: bgSelect.value }); Sound.theme(); });
    const vol = body.querySelector(".set-volume");
    vol.value = prefs.volume;
    vol.addEventListener("change", () => { save({ volume: Number(vol.value) }); Sound.click(); });

    const select = body.querySelector(".set-model");
    select.addEventListener("change", async () => {
      const res = await fetch("/api/model", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: select.value }),
      }).catch(() => null);
      if (res && res.ok) { Sound.theme(); refreshStatus(); } else { Sound.error(); select.value = select.dataset.current || ""; }
    });
    fillModels(models);
    setupCpu();

    body.querySelector(".set-voice").innerHTML = !voice.available
      ? `Voice input isn't installed. Install it with <code>${escapeHtml(voice.install || "omarchy-voxtype-install")}</code>, then hold <b>F9</b> to talk.`
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
    body.querySelector(".set-uninstall").addEventListener("click", async () => {
      const box = body.querySelector(".set-uninstall-box");
      box.hidden = !box.hidden;
      Sound.click();
      if (box.hidden) return;
      const lib = await fetch("/api/library").then((r) => r.json()).catch(() => ({ installed: [] }));
      const size = lib.installed.reduce((n, x) => n + x.size, 0);
      body.querySelector(".set-lib-size").textContent =
        `${lib.installed.length} collections, ${fmtSize(size)}, in ${lib.dir || "the library folder"}. Other files there stay.`;
      const m = (models.installed || []).find((x) => x.id === models.current);
      body.querySelector(".set-model-size").textContent = m ? `${m.id}, ${m.size} GB. Other Ollama models stay.` : "No model installed.";
    });
    body.querySelector(".set-un-go").addEventListener("click", () => uninstallUmbra({
      library: body.querySelector(".set-un-library").checked,
      model: body.querySelector(".set-un-model").checked,
    }));
  }

  // The model list and the downloadable models. While a download runs, only
  // this part refreshes, so the panel doesn't jump or lose what you're doing.
  function fillModels(models) {
    const select = body.querySelector(".set-model"), pulls = body.querySelector(".set-pulls");
    if (!select || !pulls) return;
    const names = models.models.length ? models.models : [models.current];
    if (select.dataset.names !== names.join("|")) {
      select.innerHTML = names.map((n) => `<option>${escapeHtml(n)}</option>`).join("");
      select.dataset.names = names.join("|");
    }
    select.value = select.dataset.current = models.current;
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
      refreshModels();
    }));
    clearTimeout(pullTimer);
    if (pull.active) pullTimer = setTimeout(refreshModels, 2500);
  }
  async function refreshModels() {
    if (panel.hidden) return;
    const models = await fetch("/api/models").then((r) => r.json()).catch(() => null);
    if (models && !panel.hidden) fillModels(models);
  }

  // ------------------------------------------------------ performance

  // A live graph of the last minute (whole processor, and Umbra's share),
  // a bar per processor thread, and the AI's processor limit. Updates every
  // second while Settings is open.
  const cpuHist = { total: [], umbra: [] };
  const CPU_POINTS = 60;
  let cpuTimer = 0, cpuInfo = null;

  function setupCpu() {
    const seg = body.querySelector(".seg");
    const steps = [...seg.querySelectorAll(".seg-step")];
    const values = steps.map((b) => Number(b.dataset.v));
    const show = (v) => {
      const i = Math.max(0, values.indexOf(v));
      seg.style.setProperty("--seg", String((i + 1) / values.length));
      steps.forEach((b, k) => { b.classList.toggle("on", k <= i); b.classList.toggle("current", k === i); });
      seg.setAttribute("aria-valuenow", String(v));
      limitNote(v);
    };
    const choose = (v) => {
      if (v === (prefs.cpuLimit || 100)) return show(v);
      show(v);
      save({ cpuLimit: v });
      Sound.click();
    };
    // Click a step, or drag along the bar.
    const pick = (x) => {
      const r = seg.getBoundingClientRect();
      return values[Math.max(0, Math.min(values.length - 1, Math.floor(((x - r.left) / r.width) * values.length)))];
    };
    let dragging = false;
    seg.addEventListener("pointerdown", (e) => { dragging = true; seg.setPointerCapture(e.pointerId); show(pick(e.clientX)); });
    seg.addEventListener("pointermove", (e) => { if (dragging) show(pick(e.clientX)); });
    seg.addEventListener("pointerup", (e) => { if (!dragging) return; dragging = false; choose(pick(e.clientX)); });
    seg.addEventListener("keydown", (e) => {
      const i = values.indexOf(prefs.cpuLimit || 100);
      if (["ArrowLeft", "ArrowDown"].includes(e.key)) { e.preventDefault(); choose(values[Math.max(0, i - 1)]); }
      if (["ArrowRight", "ArrowUp"].includes(e.key)) { e.preventDefault(); choose(values[Math.min(values.length - 1, i + 1)]); }
    });
    show(prefs.cpuLimit || 100);
    clearInterval(cpuTimer);
    updateCpu();
    cpuTimer = setInterval(updateCpu, window.offgrid ? 3000 : 1000);
  }

  function limitNote(v) {
    const note = body.querySelector(".cpu-limit-note");
    if (!note || !cpuInfo) return;
    const cores = cpuInfo.limits[String(v)] || cpuInfo.physical, all = cpuInfo.physical;
    note.textContent = (v === 100
      ? `Umbra's AI may use all ${all} cores of your processor while it writes: the fastest answers.`
      : `Umbra's AI may use ${cores} of your ${all} cores while it writes. Your computer stays cooler and quieter; answers take longer.`) +
      " A change applies from the next answer.";
  }

  async function updateCpu() {
    if (panel.hidden || !body.querySelector(".cpu-graph")) { clearInterval(cpuTimer); return; }
    let c;
    try { c = await (await fetch("/api/cpu")).json(); } catch { return; }
    const first = !cpuInfo;
    cpuInfo = c;
    if (first) limitNote(prefs.cpuLimit || 100);
    cpuHist.total.push(c.total); cpuHist.umbra.push(c.umbra);
    for (const k of ["total", "umbra"]) if (cpuHist[k].length > CPU_POINTS) cpuHist[k].shift();
    const q = (sel) => body.querySelector(sel);
    q(".cpu-total").textContent = Math.round(c.total) + "%";
    q(".cpu-umbra").textContent = Math.round(c.umbra) + "%";
    q(".cpu-now").textContent = c.load ? `LOAD ${c.load.toFixed(2)}` : "";
    q(".cpu-name").textContent = c.name;
    q(".cpu-count").textContent = `${c.physical} cores · ${c.threads} threads`;
    q(".cpu-temp").textContent = c.temp != null ? `${c.temp} °C` : "not reported";
    q(".cpu-temp").classList.toggle("hot", c.temp >= 85);
    q(".cpu-mem").textContent = c.memTotal ? `${(c.memUsed / 1e9).toFixed(1)} of ${(c.memTotal / 1e9).toFixed(1)} GB` : "--";
    const cores = q(".cpu-cores");
    if (cores.childElementCount !== c.cores.length) cores.innerHTML = c.cores.map(() => "<i><b></b></i>").join("");
    c.cores.forEach((v, i) => { cores.children[i].firstChild.style.height = Math.max(3, v) + "%"; });
    drawCpu();
  }

  function drawCpu() {
    const canvas = body.querySelector(".cpu-graph");
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    const col = (v) => css.getPropertyValue(v).trim();
    // Grid lines at 25, 50 and 75%.
    ctx.strokeStyle = col("--line"); ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
    for (const f of [0.25, 0.5, 0.75]) { ctx.beginPath(); ctx.moveTo(0, Math.round(h * f) + 0.5); ctx.lineTo(w, Math.round(h * f) + 0.5); ctx.stroke(); }
    ctx.setLineDash([]);
    const plot = (data, stroke, fillAlpha) => {
      if (data.length < 2) return;
      const x = (i) => w - (data.length - 1 - i) * (w / (CPU_POINTS - 1));
      const y = (v) => h - 1 - (v / 100) * (h - 2);
      ctx.beginPath();
      data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.lineTo(x(data.length - 1), h); ctx.lineTo(x(0), h); ctx.closePath();
      ctx.globalAlpha = fillAlpha; ctx.fillStyle = stroke; ctx.fill(); ctx.globalAlpha = 1;
    };
    plot(cpuHist.total, col("--dim"), 0.12);
    plot(cpuHist.umbra, col("--signal"), 0.28);
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

  async function uninstallUmbra({ library, model }) {
    const extra = [library && "the offline library", model && "the AI model"].filter(Boolean);
    const sure = await confirmDialog({
      kind: "error", tag: "UNINSTALL", title: "UNINSTALL UMBRA WIKI?",
      body: "Umbra Wiki, its settings, profile and every conversation will be removed from this computer" +
        (extra.length ? `, together with ${extra.join(" and ")}.` : ". The library and the AI model stay.") +
        (packagedInstall
          ? "\n\nThis window will close. The app itself was installed as a package: remove it afterwards with\n\nsudo pacman -R umbra-wiki"
          : "\n\nThis window will close. You can set Umbra up again from the Omarchy Umbra widget."),
      ok: "UNINSTALL", cancel: "KEEP UMBRA",
    });
    if (!sure) return;
    await fetch("/api/uninstall", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "UNINSTALL", library, model }),
    }).catch(() => null);
    document.body.innerHTML = `<div class="goodbye"><pre class="ascii">UMBRA // OFFLINE</pre><p>Umbra Wiki has been uninstalled. Stay safe out there.</p></div>`;
  }

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
      body.scrollTop = 0;
      render();
    } else {
      clearInterval(cpuTimer);
      clearTimeout(pullTimer);
    }
    if (!quiet) Sound.click();
  }
  window.closeSettings = () => open(false, true);
  window.openSettings = () => open(true);
  window.reloadPrefs = load;

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
      if (s.background && s.background !== prefs.background) { prefs.background = s.background; applyPrefs(); }
      if ((s.offgrid || "off") !== (prefs.offgrid || "off")) { prefs.offgrid = s.offgrid || "off"; await checkPower(); }   // e.g. from the widget
      if (JSON.stringify(s.hiddenControls || []) !== JSON.stringify(prefs.hiddenControls || [])) {
        prefs.hiddenControls = s.hiddenControls || [];
        applyControls(true);
      }
    } catch {}
  }, 3000);
})();
