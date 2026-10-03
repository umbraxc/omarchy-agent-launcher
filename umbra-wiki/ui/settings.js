// Umbra Wiki settings: live performance and the AI's processor limit, sound,
// motion, answer extras, the AI model, voice,
// storage folders, the welcome tour and resetting Umbra. Preferences live
// in ~/.config/umbra-wiki/settings.json with the theme and loadout.
// Loaded after app.js and uses its helpers ($, Sound, postSettings,
// confirmDialog, setMuted, stopRain, startRain, toggleThemes, locked).
"use strict";

(() => {
  const DEFAULTS = {
    volume: 0.9, notifyVolume: 0.5, radioVolume: 0.4, hoverSounds: true, rain: true, background: "rain", reduceMotion: false, offgrid: "off", textScale: 1, cpuLimit: 100,
    suggestions: true, greeting: true, barAlert: true,
  };
  window.prefs = { ...DEFAULTS, hiddenControls: [], pinnedControls: [], headerOrder: [] };
  // Header buttons that can be hidden (Settings itself always stays).
  const CONTROLS = [["loadout-btn", "Profile & loadout"], ["history-btn", "History"], ["library-btn", "Library"], ["maps-btn", "Maps"], ["galaxy-btn", "Galaxy"], ["fieldkit-btn", "Field kit"], ["farming-btn", "Farming"], ["outpost-btn", "Umbra Outpost"], ["friends-btn", "Friends"],
                    ["radar-btn", "Signals & radar"], ["theme-btn", "Themes"], ["sound", "Sound"], ["lock", "Lock"]];
  const panel = $("#settings");
  let pullTimer = 0;
  let packagedInstall = false;   // installed with pacman (the AUR): removal goes through pacman
  let onWindowsApp = false;      // the Windows app: removal ends in Windows' own uninstaller
  const body = $("#settings-body");
  function syncZoom(z) {
    const select = body.querySelector(".set-zoom");
    if (!select) return;
    // Also display levels restored from older/custom settings.
    select.querySelectorAll("option[data-custom]").forEach((o) => o.remove());
    if (![...select.options].some((o) => Number(o.value) === z)) {
      const option = new Option(`${Math.round(z * 100)}%`, String(z));
      option.dataset.custom = "1";
      select.add(option);
    }
    select.value = String(z);
  }
  document.addEventListener("umbra-zoom", (e) => syncZoom(e.detail));

  // Every tab lives in the ☰ tab menu (unless switched off there); pinned
  // tabs also stay in the header, beside the menu, at all times.
  function applyControls() {
    const hidden = new Set(prefs.hiddenControls || []), pinned = new Set(prefs.pinnedControls || []);
    for (const [id] of [...CONTROLS, ["settings-btn"]]) {
      const el = $("#" + id);
      if (!el) continue;
      const inMenu = id === "settings-btn" || !hidden.has(id);
      el.dataset.menu = inMenu ? "on" : "off";
      el.classList.toggle("pinned", pinned.has(id));
      el.classList.toggle("gone", !inMenu && !pinned.has(id));
      el.classList.remove("glitch-in", "glitch-out");
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
    if (window.applyZoom) applyZoom(prefs.zoom || 1);
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
  window.applyPrefs = applyPrefs;
  // Start screens and transitions are Locker rewards: the ones not earned yet
  // stay in the list, greyed, saying how to earn them.
  async function lockOptions(select, kind) {
    let rewards = window.UmbraAchievements?.data?.rewards;
    if (!rewards) rewards = (await fetch("/api/achievements").then((r) => r.json()).catch(() => ({}))).rewards || [];
    for (const option of select.options) {
      const r = rewards.find((x) => x.kind === kind && x.id === option.value);
      if (!r || r.unlocked) continue;
      option.disabled = true;
      option.textContent = `${r.name} · locked: ${r.how}`;
    }
  }
  async function load() {
    try { Object.assign(prefs, DEFAULTS, await (await fetch("/api/settings")).json()); } catch {}
    await checkPower();
    applyControls(false);
    window.UmbraNavOrder?.apply(prefs.headerOrder);
  }
  function save(update) {
    Object.assign(prefs, update);
    applyPrefs();
    if (Object.keys(update).some((key) => ["volume", "notifyVolume", "radioVolume", "hoverSounds"].includes(key))) audioPrefsChanged(update);
    return postSettings(update);
  }
  function syncAudioControls() {
    const controls = [[".set-volume", prefs.volume], [".set-notify-volume", prefs.notifyVolume], [".set-radio-volume", window.UmbraRadio?.volume ?? prefs.radioVolume]];
    for (const [sel, value] of controls) {
      const input = body.querySelector(sel);
      if (input && document.activeElement !== input) input.value = value;
      const output = input?.closest(".set-row")?.querySelector("output");
      if (output) output.textContent = Math.round(Number(value) * 100) + "%";
    }
    const all = body.querySelector('.set-toggle[data-key="sound"]'); if (all) all.checked = !Sound.muted;
    const hover = body.querySelector('.set-toggle[data-key="hoverSounds"]'); if (hover) hover.checked = prefs.hoverSounds !== false;
    const radio = window.UmbraRadio;
    const tracks = body.querySelector(".set-radio-tracks");
    if (tracks && radio) {
      tracks.innerHTML = `<option value="">Stopped</option>${radio.catalog.map((x) => `<option value="${escapeHtml(x.id)}">${escapeHtml(x.title)}</option>`).join("")}`;
      tracks.value = radio.track;
    }
    const state = body.querySelector(".set-radio-state"); if (state) state.textContent = radio?.status || "Offline radio unavailable";
  }
  document.addEventListener("umbra-audio-prefs", syncAudioControls);
  document.addEventListener("umbra-radio-change", syncAudioControls);
  document.addEventListener("umbra-sound-change", syncAudioControls);

  // ---------------------------------------------------------- search

  // Words people might search for that aren't written in a section, so
  // "cpu", "mic" or "dark" still find the right place.
  const KEYWORDS = {
    PERFORMANCE: "cpu processor performance speed fast slow hot fan heat temperature memory ram cores threads limit battery graph gpu graphics card video nvidia amd cuda rocm vulkan vram boost typical answer time speed slow measure benchmark how long",
    SOUND: "notification notifications popup pop-up alert achievement ding audio volume speaker speakers headphones mute quiet loud output input microphone mic beep",
    TABS: "hide show icons toolbar top buttons header tabs menu pin pinned",
    "MAPS & PLACES": "maps map downloaded areas countries waypoints places delete remove space disk",
    MOTION: "animation animations background rain transition boot intro outro reduce motion effects",
    CONVERSATION: "adapt adaptive learn learning style tone formal casual forget zoom scale bigger smaller magnify magnifier size larger readable chat text size font bigger smaller greeting suggestions replies alert close exit",
    POWER: "battery off-grid offgrid power saver laptop unplugged",
    "UMBRA ONLINE": "online browser web internet firefox chrome default browser comments chatty fun facts pages websites",
    KEYBOARD: "keys shortcuts hotkeys keyboard",
    BACKUP: "backup restore export save usb copy transfer",
    "AI MODEL": "model ai llm gemma llama ollama brain download",
    VOICE: "voice speech dictation talk microphone f9 voxtype",
    STORAGE: "folders files location library history path disk",
    "WELCOME TOUR": "tour tutorial intro help onboarding guide guides tips first look",
    UPDATES: "update updates version upgrade release new check changelog what's whats news patch notes",
    "DANGER ZONE": "reset uninstall delete remove wipe erase",
  };
  const search = $("#set-q");
  let query = "";
  const highlight = window.CSS && CSS.highlights && typeof Highlight === "function" ? new Highlight() : null;
  if (highlight) CSS.highlights.set("set-hit", highlight);

  // Show only what matches, as you type: whole sections whose name or
  // keywords match, otherwise just the matching rows. Matches are marked.
  function applySearch() {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const sections = body.querySelectorAll(".set-section");
    let shown = 0;
    if (highlight) highlight.clear();
    sections.forEach((sec) => {
      const head = sec.querySelector(".lib-head");
      const title = head ? (head.querySelector("span") || head).textContent.trim() : "";
      const keys = (KEYWORDS[title] || "") + " " + title.toLowerCase();
      const rows = [...sec.children].filter((el) => el !== head);
      // A class of its own, so things hidden for other reasons stay hidden.
      if (!words.length) { sec.classList.remove("sr-hide"); rows.forEach((r) => r.classList.remove("sr-hide")); return; }
      const whole = words.every((w) => keys.includes(w));
      let hits = 0;
      rows.forEach((r) => {
        const text = r.textContent.toLowerCase() + " " + (r.querySelector("select") ? [...r.querySelectorAll("option")].map((o) => o.textContent).join(" ").toLowerCase() : "");
        const match = whole || words.every((w) => text.includes(w) || keys.includes(w));
        r.classList.toggle("sr-hide", !match);
        if (match && !r.hidden) hits++;
      });
      sec.classList.toggle("sr-hide", hits === 0);
      shown += hits;
    });
    body.querySelectorAll(".set-cat").forEach((c) => c.classList.toggle("sr-hide", !!words.length && !c.querySelector(".set-section:not(.sr-hide)")));
    if (highlight && words.length) markWords(words);
    const count = $(".set-search-count");
    count.textContent = words.length ? (shown ? `${shown} ${shown === 1 ? "MATCH" : "MATCHES"}` : "") : "";
    let empty = body.querySelector(".set-empty");
    if (words.length && !shown) {
      if (!empty) { empty = document.createElement("p"); empty.className = "lib-note set-empty"; body.prepend(empty); }
      // Some things live in their own panels: point there.
      const elsewhere = [
        [/theme|colou?r|dark|light|palette|look/, "Colours and themes have their own panel: the palette button at the top (Ctrl+T)."],
        [/name|profile|password|picture|avatar|callsign|units|metric|imperial|health|achiev|badge|rank/, "That's in your Profile (Ctrl+P): name, callsign, units, health notes, password, achievements."],
        [/scenario|personality|loadout|voice of|character/, "Scenarios and personalities are in the Loadout (Ctrl+O)."],
        [/map|waypoint|region|gps|mgrs|coordinate/, "Maps have their own panel: the map button at the top (Ctrl+G)."],
        [/cpr|first aid|timer|tourniquet|pulse|sun|moon|daylight|supply|supplies|water|food|ration|morse|knot|drill|quiz|card|print/,
         "That's in the Field Kit (Ctrl+K): CPR metronome, first-aid timers, sun and moon, supplies, training and pocket cards."],
        [/library|collection|zim|download|manual/, "The offline library and the field manual are in the Library (Ctrl+L)."],
        [/history|conversation|export|chat/, "Conversations are in History (Ctrl+H)."],
      ].find(([re]) => re.test(query.toLowerCase()));
      empty.textContent = elsewhere ? elsewhere[1] : `Nothing in Settings matches "${query.trim()}". Try another word, like sound, model, backup or battery.`;
    } else if (empty) empty.remove();
  }
  // Marks each occurrence of the words in the visible text (CSS highlights:
  // nothing in the page is rewritten).
  function markWords(words) {
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest("[hidden], .sr-hide, select, option, .cpu-cores") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const low = n.data.toLowerCase();
      for (const w of words) {
        for (let i = low.indexOf(w); i >= 0; i = low.indexOf(w, i + w.length)) {
          const r = new Range(); r.setStart(n, i); r.setEnd(n, i + w.length); highlight.add(r);
        }
      }
    }
  }
  search.addEventListener("input", () => { query = search.value; body.scrollTop = 0; applySearch(); });
  search.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && search.value) { e.stopPropagation(); search.value = query = ""; applySearch(); }
    if (e.key === "Enter") {   // jump to the first match
      const first = body.querySelector(".set-section:not(.sr-hide) > :not(.lib-head):not([hidden]):not(.sr-hide)");
      first?.scrollIntoView({ block: "center", behavior: "smooth" });
      first?.querySelector("input, select, button")?.focus({ preventScroll: true });
    }
  });
  window.focusSettingsSearch = () => { search.focus(); search.select(); };

  // ------------------------------------------------------- categories

  // The sections are grouped in six categories, each with its own quiet
  // colour (six distinct hues, blended with the theme's text colour so they
  // read well on light and dark themes alike), a header stripe and a chip under the search box to jump there.
  const CATS = [
    { id: "ai", name: "AI & PERFORMANCE", icon: "󰘚", color: "color-mix(in oklab, #e8892a 78%, var(--fg))", line: "The model, the processor, battery, Umbra Online",
      sections: ["PERFORMANCE", "AI MODEL", "POWER", "UMBRA ONLINE"] },
    { id: "look", name: "LOOK & FEEL", icon: "󰏘", color: "color-mix(in oklab, #a77ce8 78%, var(--fg))", line: "Motion, buttons, conversation, text size",
      sections: ["MOTION", "TABS", "CONVERSATION"] },
    { id: "sound", name: "SOUND & VOICE", icon: "󰕾", color: "color-mix(in oklab, #36aec8 78%, var(--fg))", line: "Effects, volume, speakers, microphone, dictation, Umbra's voice",
      sections: ["SOUND", "VOICE INPUT", "UMBRA'S VOICE"] },
    { id: "data", name: "YOUR DATA", icon: "󰆼", color: "color-mix(in oklab, #4fb86a 78%, var(--fg))", line: "Backups, maps and places, where things are kept",
      sections: ["BACKUP", "MAPS & PLACES", "STORAGE"] },
    { id: "help", name: "HELP & UPDATES", icon: "󰘥", color: "color-mix(in oklab, #d9b235 78%, var(--fg))", line: "Shortcuts, the tour, what's new, updates",
      sections: ["KEYBOARD", "WELCOME TOUR", "UPDATES"] },
    { id: "danger", name: "DANGER ZONE", icon: "󰀩", color: "color-mix(in oklab, #e0493f 80%, var(--fg))", line: "Reset or uninstall",
      sections: ["DANGER ZONE"] },
  ];
  const titleOf = (sec) => { const h = sec.querySelector(".lib-head"); return h ? (h.querySelector("span") || h).textContent.trim() : ""; };
  function arrange() {
    const secs = [...body.querySelectorAll(".set-section")];
    const about = body.querySelector(".set-about");
    for (const c of CATS) {
      const box = document.createElement("div");
      box.className = "set-cat";
      box.dataset.cat = c.id;
      box.style.setProperty("--cat", c.color);
      box.innerHTML = `<div class="set-cat-head"><span class="g">${c.icon}</span><b>${c.name}</b><small>${c.line}</small></div>`;
      for (const name of c.sections) { const sec = secs.find((x) => titleOf(x) === name); if (sec) box.appendChild(sec); }
      body.insertBefore(box, about);
    }
    // Anything not listed stays visible, at the end of "your data".
    secs.filter((x) => !x.closest(".set-cat")).forEach((x) => body.querySelector('.set-cat[data-cat="data"]').appendChild(x));
    const chips = $("#set-chips");
    chips.innerHTML = CATS.map((c) => `<button class="set-chip" data-cat="${c.id}" style="--cat:${c.color}" title="${c.name.charAt(0) + c.name.slice(1).toLowerCase()}|${c.line}"><span class="g">${c.icon}</span>${c.name}</button>`).join("");
    chips.querySelectorAll(".set-chip").forEach((b) => b.addEventListener("click", () => {
      if (query) { search.value = query = ""; applySearch(); }
      const cat = body.querySelector(`.set-cat[data-cat="${b.dataset.cat}"]`);
      body.scrollTo({ top: cat.offsetTop - body.offsetTop - 4, behavior: document.body.classList.contains("reduce-motion") ? "auto" : "smooth" });
      Sound.click();
    }));
    markChip();
  }
  // The chip of the category in view is lit.
  function markChip() {
    const cats = [...body.querySelectorAll(".set-cat:not(.sr-hide)")];
    const top = body.scrollTop + 40;
    let cur = cats[0];
    for (const c of cats) if (c.offsetTop - body.offsetTop <= top) cur = c;
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) cur = cats[cats.length - 1];
    $("#set-chips").querySelectorAll(".set-chip").forEach((b) => b.classList.toggle("on", !!cur && b.dataset.cat === cur.dataset.cat));
  }
  body.addEventListener("scroll", markChip, { passive: true });

  // Downloaded map areas and saved waypoints, each removable.
  async function fillPlaces() {
    const box = body.querySelector(".set-places-list");
    if (!box) return;
    const [maps, wps] = await Promise.all([
      fetch("/api/maps").then((r) => r.json()).catch(() => ({ areas: [] })),
      fetch("/api/waypoints").then((r) => r.json()).catch(() => []),
    ]);
    const size = maps.areas.reduce((n, a) => n + (a.bytes || 0), 0);
    body.querySelector(".set-places-size").textContent = size ? fmtSize(size) : "";
    box.innerHTML = `<div class="set-row"><span class="set-text"><b>World map</b><small>Built in: countries, big cities and coasts. Always there.</small></span><span class="set-tag">BUILT IN</span></div>` +
      maps.areas.map((a) => `<div class="set-row"><span class="set-text"><b>${escapeHtml(a.name)}</b><small>Downloaded map · ${fmtSize(a.bytes || 0)}</small></span>
        <button class="ghost set-map-del" data-id="${escapeHtml(a.id)}" data-name="${escapeHtml(a.name)}">REMOVE</button></div>`).join("") +
      `<div class="set-row"><span class="set-text"><b>Waypoints</b><small>${wps.length ? `${wps.length} saved: ${escapeHtml(wps.slice(0, 6).map((w) => w.name).join(", "))}${wps.length > 6 ? "…" : ""}` : "None saved yet"}</small></span>
        <span class="set-previews">${wps.length ? `<button class="ghost set-wp-open">MANAGE</button><button class="ghost set-wp-clear">REMOVE ALL</button>` : ""}</span></div>
      <p class="lib-note">Maps are stored in <code>${escapeHtml(maps.dir || "")}</code>. They're yours only: an update or a new install never ships them.</p>`;
    box.querySelectorAll(".set-map-del").forEach((b) => b.addEventListener("click", async () => {
      const ok = await confirmDialog({ kind: "to-local", tag: "MAPS", title: `REMOVE ${b.dataset.name.toUpperCase()}?`, body: "The downloaded map is deleted from this computer. You can download it again any time.", ok: "REMOVE", cancel: "KEEP" });
      if (!ok) return;
      await fetch("/api/maps/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.dataset.id }) });
      Sound.click(); fillPlaces();
    }));
    box.querySelector(".set-wp-open")?.addEventListener("click", () => {
      open(false, true);
      openedFrom(() => open(true));
      if (window.toggleMaps) toggleMaps(true).then(() => $("#maps .mp-t[data-t=points]").click());
    });
    box.querySelector(".set-wp-clear")?.addEventListener("click", async () => {
      const ok = await confirmDialog({ kind: "to-local", tag: "WAYPOINTS", title: "REMOVE EVERY WAYPOINT?", body: `All ${wps.length} waypoints are deleted. This can't be undone (unless they're in a backup).`, ok: "REMOVE ALL", cancel: "KEEP" });
      if (!ok) return;
      await fetch("/api/waypoints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ waypoints: [] }) });
      Sound.click(); fillPlaces();
    });
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
    const onWindows = onWindowsApp = paths.installKind === "windows";
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
        <div class="set-row"><span class="set-text"><b>AI runs on</b><small class="dev-note">Checking this computer's graphics card…</small></span></div>
        <div class="seg seg-dev" role="radiogroup" aria-label="AI runs on">
          <div class="seg-fill"></div>
          <button type="button" class="seg-step" role="radio" data-dev="cpu"><b>CPU</b><small>PROCESSOR ONLY</small></button>
          <button type="button" class="seg-step" role="radio" data-dev="gpu"><b>CPU + GPU</b><small>GRAPHICS BOOST</small></button>
        </div>
        <div class="set-row set-speed"><span class="set-text"><b>Typical answer</b><small class="speed-note">Checking…</small></span>
          <button class="ghost set-measure" title="Time a short piece of work on this computer">MEASURE</button></div>
        <div class="set-row"><span class="set-text"><b>AI processor limit</b><small class="cpu-limit-note">How much of the processor
          Umbra's AI may use while it writes. Lower keeps your computer cooler and quieter; answers take longer.</small></span></div>
        <div class="seg" role="slider" tabindex="0" aria-label="AI processor limit" aria-valuemin="25" aria-valuemax="100">
          <div class="seg-fill"></div>
          ${[[25, "LIGHT"], [50, "BALANCED"], [75, "STRONG"], [100, "FULL"]].map(([v, name]) =>
            `<button type="button" class="seg-step" data-v="${v}"><b>${v}%</b><small>${name}</small></button>`).join("")}
        </div>
      </section>
      <section class="set-section"><div class="lib-head">SOUND</div>
        ${toggle("sound", "All sound", "Effects and the offline radio")}
        <label class="set-row"><span class="set-text"><b>Effects volume</b><small>How loud Umbra's interface sounds are</small></span>
          <span class="set-audio-range"><input type="range" class="set-volume" min="0" max="1" step="0.05"><output></output></span></label>
        <label class="set-row"><span class="set-text"><b>Notification sounds</b><small>Pop-ups, first-look notes, achievements and finished downloads. All the way left turns them off</small></span>
          <span class="set-audio-range"><input type="range" class="set-notify-volume" min="0" max="1" step="0.05"><output></output></span></label>
        ${toggle("hoverSounds", "Hover sounds", "Soft blips when the mouse moves over buttons")}
        <label class="set-row"><span class="set-text"><b>Offline radio</b><small>Six bundled pieces play while you move between screens</small></span>
          <select class="set-radio-tracks" aria-label="Offline radio track"><option value="">Stopped</option></select></label>
        <label class="set-row"><span class="set-text"><b>Radio volume</b><small>Separate from interface effects</small></span>
          <span class="set-audio-range"><input type="range" class="set-radio-volume" min="0" max="1" step="0.05"><output></output></span></label>
        <p class="lib-note set-radio-state" role="status"></p>
        <div class="set-row"><span class="set-text"><b>Preview effects</b><small>Hear interface, notification and alert sounds</small></span>
          <span class="set-previews"><button class="ghost set-sample" data-sample="click" type="button">CLICK</button><button class="ghost set-sample" data-sample="achieve" type="button">NOTIFY</button><button class="ghost set-sample" data-sample="error" type="button">ALERT</button></span></div>
        <label class="set-row"><span class="set-text"><b>Sound output</b><small>Where Umbra's sounds play</small></span>
          <span class="set-previews"><select class="set-audio-out"></select><button class="ghost set-audio-test">▶ TEST</button></span></label>
        <label class="set-row"><span class="set-text"><b>Microphone</b><small class="set-audio-in-note">What voice input listens to</small></span>
          <select class="set-audio-in"></select></label>
        <p class="lib-note set-sound-missing" hidden></p>
      </section>
      <section class="set-section"><div class="lib-head">TABS</div>
        <p class="lib-note">Every tab is in the ☰ menu at the top right. <b>Pin</b> the ones you use most to keep them beside the menu at all times.</p>
        ${[...CONTROLS, ["settings-btn", "Settings"]].map(([id, label]) => `
          <div class="set-row set-tab-row"><span class="set-text"><b>${label}</b><small>${id === "settings-btn" ? "Always in the menu, so you can bring the others back" : "In the ☰ menu, pinned beside it, or both"}</small></span>
            <span class="set-tabopts"><label title="In the menu|Listed in the ☰ tab menu"><input type="checkbox" class="set-control" data-control="${id}" ${id === "settings-btn" ? "checked disabled" : ""}><span>MENU</span></label>
            <label title="Pinned|Always shown in the header, beside the ☰ menu"><input type="checkbox" class="set-pin" data-pin="${id}"><span>◆ PIN</span></label></span></div>`).join("")}
      </section>
      <section class="set-section"><div class="lib-head">MOTION</div>
        <label class="set-row"><span class="set-text"><b>Transition</b><small>How the boot, the goodbye and the end of the tour sweep across the screen. Earn more in Profile › Locker.</small></span>
          <select class="set-transition">${(window.UmbraTransitions || [["wave", "Glyph wave"]]).map(([id, name]) => `<option value="${id}">${name}</option>`).join("")}</select></label>
        <div class="set-row"><span class="set-text"><small>Try the chosen transition</small></span>
          <span class="set-previews"><button class="ghost set-prev-boot">▶ BOOT</button><button class="ghost set-prev-outro">▶ GOODBYE</button></span></div>
        <label class="set-row"><span class="set-text"><b>Start screen background</b><small>The animation behind the globe and title. Earn more in Profile › Locker.</small></span>
          <select class="set-background">${BACKGROUNDS.map(([id, label]) => `<option value="${id}">${label}</option>`).join("")}</select></label>
        ${toggle("reduceMotion", "Reduce motion", "Calm the animations; good for slow computers")}
      </section>
      <section class="set-section"><div class="lib-head">CONVERSATION</div>
        <label class="set-row"><span class="set-text"><b>Your local time</b><small>Set the clock Umbra shows and uses when time matters. Change it here if your computer clock differs.</small></span>
          <input class="set-local-time" type="time" aria-label="Your local time"></label>
        ${toggle("greeting", "Personal greeting", "Welcome you on the start screen, picking up from last time")}
        ${toggle("suggestions", "Suggested replies", "Offer a likely reply after each answer (Tab to use it)")}
        ${toggle("adaptive", "Adapt to how I write", "Umbra matches your tone (formal or casual), remembers what you ask for, like shorter answers or no lists, and keeps its wording fresh. Its personality stays")}
        <div class="set-row"><span class="set-text"><b>What Umbra has learned</b><small class="set-style">Reading…</small></span>
          <button class="ghost set-style-forget">FORGET</button></div>
        ${toggle("barAlert", "Bar alert", "Light up the bar icon when an answer arrives in the background")}
        ${toggle("confirmExit", "Ask before closing", "A short confirmation (and the goodbye animation) when you close Umbra")}
        <label class="set-row"><span class="set-text"><b>Text size</b><small>Answers, your messages, the questions on the start screen and the prompt</small></span>
          <select class="set-textsize"><option value="0.9">Small</option><option value="1">Normal</option>
            <option value="1.12">Large</option><option value="1.25">Extra large</option></select></label>
        <label class="set-row"><span class="set-text"><b>Zoom</b><small>Everything on every screen, bigger or smaller. Also Ctrl + mouse wheel, or Ctrl + plus / minus; Ctrl + 0 resets</small></span>
          <select class="set-zoom">${[0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2].map((z) => `<option value="${z}">${Math.round(z * 100)}%</option>`).join("")}</select></label>
      </section>
      <section class="set-section"><div class="lib-head">POWER</div>
        <label class="set-row"><span class="set-text"><b>Off-grid mode</b><small>A battery saver for when power is scarce.
          Animations and backgrounds stop, the boot animation is skipped, hover sounds and the working hum go quiet,
          and Umbra skips its extra AI work (greeting, personal questions, suggested replies) and writes shorter answers.
          Everything else works the same. <span class="set-power"></span></small></span>
          <select class="set-offgrid"><option value="off">Off</option><option value="on">On</option>
            <option value="auto">On battery</option></select></label>
      </section>
      <section class="set-section set-online"><div class="lib-head">UMBRA ONLINE</div>
        <label class="set-row"><span class="set-text"><b>Comments while you browse</b><small>Online, Umbra reads the pages beside you.
          Chatty: it says what it spotted, shares fun facts and ideas as you read. Gentle: one fun fact on longer pages. Off: only when you ask.
          Comments always wait while you type or Umbra answers.</small></span>
          <select class="set-webchat"><option value="chatty">Chatty</option><option value="gentle">Gentle</option><option value="off">Off</option></select></label>
        <label class="set-row"><span class="set-text"><b>Your browser</b><small>"Open in your browser" hands a page to this one, for sites where you're signed in.
          <span class="set-webdefault"></span></small></span>
          <select class="set-webbrowser"><option value="">System default</option></select></label>
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
        <label class="set-row"><span class="set-text"><b>Local model</b><small>The AI Umbra thinks with. Bigger models are smarter but slower</small></span>
          <select class="set-model"></select></label>
        <p class="lib-note set-model-flow"></p>
        <div class="set-row"><span class="set-text"><b>Compare and download models</b><small>What each model is good at, how it answers, and how well it suits this computer: in the Core panel (or click STATUS at the top)</small></span>
          <button class="ghost set-core">OPEN CORE ▸</button></div>
        <div class="set-pulls" hidden></div>
      </section>
      <section class="set-section"><div class="lib-head">VOICE INPUT</div>
        <p class="lib-note set-voice"></p>
      </section>
      <section class="set-section"><div class="lib-head">UMBRA'S VOICE</div>
        <div class="set-speech"><p class="lib-note">Reading…</p></div>
      </section>
      <section class="set-section set-places"><div class="lib-head"><span>MAPS & PLACES</span><b class="set-places-size"></b></div>
        <div class="set-places-list"><p class="lib-note">Reading…</p></div>
      </section>
      <section class="set-section"><div class="lib-head">STORAGE</div>
        ${["library", "history", "config"].map((k) => `
          <div class="set-row"><span class="set-text"><b>${{ library: "Library", history: "History", config: "Settings and profile" }[k]}</b>
            <small><code>${escapeHtml(paths[k] || "")}</code></small></span>
            <button class="ghost set-open" data-which="${k}">OPEN</button></div>`).join("")}
      </section>
      <section class="set-section"><div class="lib-head">WELCOME TOUR</div>
        <div class="set-row"><span class="set-text"><b>Tab guides</b><small>The short notes that appear the first time you open each screen or tab</small></span>
          <button class="ghost set-guides">SHOW AGAIN</button></div>
        <div class="set-row"><span class="set-text"><b>Replay the tour</b><small>The first-launch walkthrough of everything Umbra can do</small></span>
          <button class="ghost set-tour">REPLAY</button></div>
      </section>
      <section class="set-section set-updates"><div class="lib-head"><span>UPDATES</span><b class="set-version-now"></b></div>
        <div class="set-row"><span class="set-text"><b>What's new</b><small>What this version brought, from the changelog</small></span>
          <button class="ghost set-news">SHOW</button></div>
        <div class="set-row"><span class="set-text"><b>Check for updates</b><small class="set-update-note">Asks GitHub for the newest
          release. Only this check goes online, and nothing about you is sent.</small></span>
          <button class="ghost set-update">CHECK NOW</button></div>
        <div class="set-win-only" hidden>${toggle("autoUpdate", "Check automatically", "Once a day, when you're online, Umbra asks GitHub for a newer version and offers to install it")}</div>
        <details class="set-manual"><summary>How to update by hand</summary>
          <div class="set-howto" data-kind="windows"><b>Windows app</b>: download the newest installer and run it; it keeps everything of yours
            <code>github.com/umbraxc/omarchy-umbra/releases/latest</code></div>
          <div class="set-howto" data-kind="package"><b>Installed with pacman</b> (the [umbra] repository)
            <code>sudo pacman -Syu</code></div>
          <div class="set-howto" data-kind="omarchy"><b>Omarchy plugin</b>: updates to <i>Omarchy Umbra</i> arrive through Omarchy's
            plugin marketplace; Umbra runs the new version after the restart below.</div>
          <div class="set-howto" data-kind="clone"><b>From a downloaded copy</b>: in its folder,
            <code>git pull && ./install-arch.sh --update</code></div>
          <p class="set-linux-only">Then restart Umbra's background service and reopen this window:
            <code>systemctl --user restart umbra-wiki</code></p>
          <p>Your settings, profile, achievements, conversations and library are never touched by an update.
            Every release, with what changed, is listed on GitHub:
            <code>github.com/umbraxc/omarchy-umbra/releases</code></p>
        </details>
      </section>
      <section class="set-section danger"><div class="lib-head">DANGER ZONE</div>
        <div class="set-row"><span class="set-text"><b>Reset Umbra</b><small>Start over as if Umbra was just installed: your profile, settings,
          achievements, custom themes, personalities and scenarios, and every conversation are deleted, then the welcome tour runs again.
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
    arrange();
    fillPlaces();
    // The Windows app: automatic updates; no speaker/microphone choice (it
    // plays through Windows' default output) and no voice input yet.
    body.querySelectorAll(".set-win-only").forEach((el) => (el.hidden = !onWindows));
    body.querySelectorAll(".set-linux-only").forEach((el) => (el.hidden = onWindows));
    if (onWindows) [".set-audio-out", ".set-audio-in"].forEach((sel) => { const row = body.querySelector(sel).closest(".set-row"); if (row) row.hidden = true; });
    body.querySelector(".set-guides").addEventListener("click", (e) => { window.UmbraGuide && UmbraGuide.reset(); e.target.textContent = "DONE ✓"; Sound.found(); });
    body.querySelector(".set-news").addEventListener("click", () => window.UmbraNews && UmbraNews.show());
    fetch("/api/status").then((r) => r.json()).then((s) => {
      if (!s.version) return;
      body.querySelector(".set-version").textContent = s.version;
      body.querySelector(".set-version-now").textContent = "VERSION " + s.version;
    }).catch(() => {});
    // The way this copy updates is marked, and listed first.
    const kind = paths.installKind || (packagedInstall ? "package" : "omarchy");
    const mine = body.querySelector(`.set-howto[data-kind="${kind}"]`);
    if (mine) { mine.classList.add("mine"); mine.parentElement.insertBefore(mine, mine.parentElement.querySelector(".set-howto")); }
    body.querySelector(".set-update").addEventListener("click", async (e) => {
      const b = e.currentTarget, note = body.querySelector(".set-update-note");
      b.disabled = true;
      b.textContent = "CHECKING…";
      Sound.click();
      const r = await fetch("/api/update-check").then((x) => x.json()).catch(() => ({ error: "offline" }));
      b.disabled = false;
      b.textContent = "CHECK AGAIN";
      note.classList.toggle("fresh", !!r.newer);
      if (r.error) {
        note.textContent = "Couldn't reach GitHub: this computer seems to be offline. Umbra works fine without updates; try again when you're connected.";
        Sound.error();
      } else if (r.newer && r.installable && window.UmbraUpdate) {
        note.textContent = `Umbra ${r.latest} is out (you have ${r.current}).`;
        Sound.found();
        window.UmbraUpdate.offer(r);
      } else if (r.newer) {
        note.textContent = `Umbra ${r.latest} is out (you have ${r.current}). Update as shown below, under "How to update by hand".`;
        body.querySelector(".set-manual").open = true;
        Sound.found();
      } else {
        note.textContent = `You're up to date: ${r.current} is the newest version${r.latest && r.latest !== r.current ? ` (latest release: ${r.latest})` : ""}.`;
        Sound.theme();
      }
    });

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
    body.querySelectorAll(".set-control:not([disabled])").forEach((box) => {
      const id = box.dataset.control;
      box.checked = !(prefs.hiddenControls || []).includes(id);
      box.addEventListener("change", () => {
        const hidden = new Set(prefs.hiddenControls || []);
        if (box.checked) hidden.delete(id); else hidden.add(id);
        save({ hiddenControls: [...hidden] });
        applyControls();
        Sound.click();
      });
    });
    body.querySelectorAll(".set-pin").forEach((box) => {
      const id = box.dataset.pin;
      box.checked = (prefs.pinnedControls || []).includes(id);
      box.addEventListener("change", () => {
        const pinned = new Set(prefs.pinnedControls || []);
        if (box.checked) pinned.add(id); else pinned.delete(id);
        save({ pinnedControls: [...pinned] });
        applyControls();
        Sound.click();
      });
    });
    const ts = body.querySelector(".set-textsize");
    const localTime = body.querySelector(".set-local-time");
    localTime.value = [umbraNow().getHours(), umbraNow().getMinutes()].map(n => String(n).padStart(2, "0")).join(":");
    localTime.addEventListener("change", () => {
      const offset = umbraOffsetFor(localTime.value);
      if (offset !== null) { save({ clockOffsetMinutes: offset }); Sound.click(); }
    });
    ts.value = String(prefs.textScale || 1);
    if (!ts.value) ts.value = "1";
    ts.addEventListener("change", () => { save({ textScale: Number(ts.value) }); Sound.click(); });
    const zs = body.querySelector(".set-zoom");
    syncZoom(prefs.zoom || 1);
    zs.addEventListener("change", () => { save({ zoom: Number(zs.value) }); window.applyZoom && applyZoom(Number(zs.value), true); Sound.click(); });
    const og = body.querySelector(".set-offgrid");
    og.value = prefs.offgrid || "off";
    const powerLine = () => {
      body.querySelector(".set-power").textContent = prefs.offgrid === "auto"
        ? `Right now: ${onBattery ? "on battery, so it's on" : "plugged in, so it's off"}.` : "";
    };
    powerLine();
    og.addEventListener("change", async () => { save({ offgrid: og.value }); await checkPower(); powerLine(); Sound.theme(); });
    body.querySelector(".set-keys").addEventListener("click", () => window.showShortcuts && window.showShortcuts());
    const wc = body.querySelector(".set-webchat");
    wc.value = prefs.webChat || "chatty";
    wc.addEventListener("change", () => { window.UmbraWeb ? UmbraWeb.setChat(wc.value) : save({ webChat: wc.value }); Sound.click(); });
    const wb = body.querySelector(".set-webbrowser");
    (async () => {
      let info = { default: "", browsers: [] };
      try { info = await (await fetch("/api/web/browsers")).json(); } catch {}
      const def = info.browsers.find((b) => b.id === info.default);
      wb.innerHTML = `<option value="">System default${def ? ` (${escapeHtml(def.name)})` : ""}</option>` + info.browsers.map((b) => `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join("");
      wb.value = info.browsers.some((b) => b.id === prefs.webBrowser) ? prefs.webBrowser : "";
      body.querySelector(".set-webdefault").textContent = def ? `This computer's default browser is ${def.name}.` : info.browsers.length ? "" : "No other browser was found on this computer.";
      if (!window.UmbraWeb?.available) body.querySelector(".set-online small").insertAdjacentText("beforeend", " (The built-in browser comes to this system in a later version; online mode searches Wikipedia.)");
    })();
    wb.addEventListener("change", () => { save({ webBrowser: wb.value }); window.UmbraWeb?.loadBrowsers(); Sound.click(); });
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
    lockOptions(tr, "transition");
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
    lockOptions(bgSelect, "background");
    bgSelect.addEventListener("change", () => { save({ background: bgSelect.value }); Sound.theme(); });
    const nv = body.querySelector(".set-notify-volume");
    nv.value = typeof prefs.notifyVolume === "number" ? prefs.notifyVolume : 0.5;
    nv.addEventListener("change", async () => { await save({ notifyVolume: Number(nv.value) }); Sound.achieve(); });
    const vol = body.querySelector(".set-volume");
    vol.value = prefs.volume;
    vol.addEventListener("change", () => { save({ volume: Number(vol.value) }); Sound.click(); });
    for (const input of [vol, nv]) input.addEventListener("input", () => {
      audioPrefsChanged({ [input === vol ? "volume" : "notifyVolume"]: Number(input.value) });
    });
    body.querySelector(".set-radio-tracks").addEventListener("change", (e) => {
      if (e.target.value) window.UmbraRadio?.select(e.target.value); else window.UmbraRadio?.stop();
    });
    const rv = body.querySelector(".set-radio-volume");
    rv.addEventListener("input", () => {
      const output = rv.closest(".set-row").querySelector("output");
      output.textContent = Math.round(Number(rv.value) * 100) + "%";
    });
    rv.addEventListener("change", () => window.UmbraRadio?.setVolume(rv.value));
    body.querySelectorAll(".set-sample").forEach((button) => button.addEventListener("click", () => Sound[button.dataset.sample]()));
    syncAudioControls();

    const select = body.querySelector(".set-model");
    select.addEventListener("change", async () => {
      const res = await fetch("/api/model", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: select.value }),
      }).catch(() => null);
      if (res && res.ok) { Sound.theme(); refreshStatus(); refreshSpeed(); } else { Sound.error(); select.value = select.dataset.current || ""; }
    });
    fillModels(models);
    setupCpu();
    applySearch();

    window.UmbraSpeech?.settingsPanel(body.querySelector(".set-speech"));
    body.querySelector(".set-voice").innerHTML = voice.unsupported
      ? "Voice input isn't available in the Windows app yet. Type your questions; everything else works the same."
      : !voice.available
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
    const showStyle = (st) => {
      body.querySelector(".set-style").textContent = !st.on ? "Switched off: Umbra answers everyone the same way."
        : st.learned.length ? "You " + st.learned.join("; ") + "." : "Nothing yet. It learns as you talk; only on this computer.";
    };
    fetch("/api/style").then((r) => r.json()).then(showStyle).catch(() => {});
    body.querySelector(".set-style-forget").addEventListener("click", async () => {
      showStyle(await (await fetch("/api/style/forget", { method: "POST" })).json());
      Sound.click();
    });
    body.querySelector(".set-core").addEventListener("click", () => { open(false, true); window.toggleCore && window.toggleCore(true); });
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
    const names = models.models.length ? models.models : [""];
    if (select.dataset.names !== names.join("|")) {
      const label = (n) => !n ? "NO MODEL INSTALLED" : ((models.choices || []).find((c) => c.id === n) || {}).name || n;
      select.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(label(n))}</option>`).join("");
      select.dataset.names = names.join("|");
    }
    select.value = select.dataset.current = models.current;
    select.disabled = !models.models.length;
    const pull = models.pull || {};
    const currentName = ((models.choices || []).find((c) => c.id === models.current) || {}).callsign || models.current;
    const flow = body.querySelector(".set-model-flow");
    if (flow) flow.textContent = models.models.includes(models.current)
      ? `${currentName} answers now. You can keep several models installed and switch with this menu. ${pull.active || pull.paused ? `${pull.model} is ${pull.paused ? "paused" : "downloading"}; ${currentName} keeps answering until you switch.` : "New downloads wait for you to choose them."}`
      : `No AI model can answer yet. The first model you download becomes active when it finishes.`;
    const installedIds = (models.installed || []).map((m) => m.id);
    const busy = pull.active || pull.paused;
    pulls.innerHTML = (models.choices || []).filter((c) => !installedIds.includes(c.id)).map((c) => {
      const mine = busy && pull.model === c.id;
      const pct = mine && pull.total ? Math.round((pull.completed * 100) / pull.total) : 0;
      return `<div class="set-row"><span class="set-text"><b>${escapeHtml(c.name)}</b><small>${c.size} GB · ${escapeHtml(c.line)}${mine && pull.status ? ` · ${escapeHtml(pull.status)}` : ""}</small></span>
        <button class="ghost set-pull" data-model="${escapeHtml(c.id)}" ${busy ? "disabled" : ""}>${mine ? (pull.paused ? `PAUSED ${pct}%` : `↓ ${pct}%`) : "DOWNLOAD"}</button></div>
        ${mine && window.UmbraDownloads ? `<div class="dl-controls">${UmbraDownloads.controls("model", { paused: !!pull.paused })}</div>${UmbraDownloads.note("the model")}` : ""}`;
    }).join("") + (pull.status === "failed" ? `<p class="lib-note">Download failed: ${escapeHtml(pull.error || "")}</p>` : "");
    if (window.UmbraDownloads) UmbraDownloads.wire(pulls, refreshModels);
    pulls.querySelectorAll(".set-pull").forEach((b) => b.addEventListener("click", async () => {
      await fetch("/api/model/pull", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: b.dataset.model }) });
      Sound.click();
      refreshModels();
      if (window.UmbraDownloads) UmbraDownloads.refresh();
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
  // second while Settings is open. With the graphics card boosting the AI,
  // the graph and figures follow the card (and the processor beside it).
  const cpuHist = { total: [], umbra: [], gpu: [] };
  const CPU_POINTS = 60;
  let cpuTimer = 0, cpuInfo = null, gpuInfo = null;
  const gpuMode = () => !!(gpuInfo && gpuInfo.available && gpuInfo.device === "gpu");
  const cardName = gpuCardName;

  async function setupDevice() {
    const seg = body.querySelector(".seg-dev"), note = body.querySelector(".dev-note");
    if (!seg) return;
    try { gpuInfo = await (await fetch("/api/gpu")).json(); } catch { gpuInfo = null; }
    if (!body.contains(seg)) return;
    const gpuBtn = seg.querySelector('[data-dev="gpu"]');
    const available = !!(gpuInfo && gpuInfo.available);
    gpuBtn.classList.toggle("unavailable", !available);
    gpuBtn.setAttribute("aria-disabled", String(!available));
    gpuBtn.querySelector("small").textContent = available ? "GRAPHICS BOOST" : "NOT AVAILABLE";
    const show = (dev) => {
      seg.style.setProperty("--pick", dev === "gpu" ? "1" : "0");
      seg.querySelectorAll(".seg-step").forEach((b) => {
        const on = b.dataset.dev === dev;
        b.classList.toggle("current", on); b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on));
      });
      const card = cardName(gpuInfo && gpuInfo.name);
      note.textContent = !available
        ? `CPU + GPU is not available on this machine. ${gpuInfo ? gpuInfo.reason : "The graphics card could not be checked."}`
        : dev === "gpu"
          ? `Your ${card} (${gpuInfo.accel}) takes as much of the AI as fits in its memory and the processor runs the rest: usually much faster answers. A change applies from the next answer.`
          : `The AI runs on the processor alone and your ${card} stays free for other work. Answers take longer. A change applies from the next answer.`;
    };
    show(gpuInfo ? gpuInfo.device : "cpu");
    seg.onclick = (e) => {
      const b = e.target.closest(".seg-step");
      if (!b) return;
      if (b.classList.contains("unavailable")) {
        Sound.error();
        note.classList.remove("flash"); void note.offsetWidth; note.classList.add("flash");
        return;
      }
      if (b.dataset.dev === gpuInfo.device) return;
      gpuInfo.device = b.dataset.dev;
      show(gpuInfo.device);
      save({ aiDevice: gpuInfo.device }).then(refreshSpeed);
      Sound.click();
      swapGraph();
    };
    swapGraph(false);
  }

  // How long a typical answer takes here: the average of the latest real
  // answers, a timed test, or a rough guide for the model, in that order.
  async function refreshSpeed() {
    const note = body.querySelector(".speed-note");
    if (!note) return;
    const sp = await fetch("/api/speed").then((r) => r.json()).catch(() => null);
    if (!sp || !body.contains(note)) return;
    showSpeed(sp);
  }
  function showSpeed(sp) {
    const note = body.querySelector(".speed-note");
    if (!note) return;
    const time = fmtAnswerTime(sp.seconds), on = `${sp.model} on the ${sp.device === "gpu" ? "graphics card and processor" : "processor"}`;
    note.textContent = sp.source === "answers"
      ? `${time[0].toUpperCase() + time.slice(1)}: the average of your last ${sp.samples} answers (${on}).`
      : sp.source === "measured"
        ? `${time[0].toUpperCase() + time.slice(1)}, measured on this computer (${on}). After a few answers this becomes the average of your own.`
        : `Roughly ${time.replace(/^about /, "")}, a rough guide for ${sp.model}. MEASURE times it on this computer.`;
  }
  async function measureSpeed(button) {
    button.disabled = true; button.textContent = "MEASURING…";
    Sound.click();
    const sp = await fetch("/api/speed", { method: "POST" }).then((r) => r.json()).catch(() => null);
    button.disabled = false; button.textContent = "MEASURE";
    if (!sp) { Sound.error(); return; }
    showSpeed(sp);
    if (sp.error) { Sound.error(); body.querySelector(".speed-note").textContent = sp.error; } else Sound.done();
  }

  // The big graph changes its subject with the device: processor or card.
  function swapGraph(animate = true) {
    const sec = body.querySelector(".set-cpu");
    if (!sec) return;
    const gpu = gpuMode(), q = (sel) => sec.querySelector(sel);
    sec.classList.toggle("gpu-mode", gpu);
    q(".cpu-graph").setAttribute("aria-label", gpu ? "Graphics card and processor use over the last minute" : "Processor use over the last minute");
    q(".lg-total").firstChild.nextSibling.textContent = gpu ? "PROCESSOR " : "WHOLE PROCESSOR ";
    q(".lg-umbra").firstChild.nextSibling.textContent = gpu ? "GRAPHICS CARD " : "UMBRA ";
    const labels = gpu ? ["GRAPHICS CARD", "ACCELERATION", "GRAPHICS MEMORY", "MODEL ON GPU"] : ["PROCESSOR", "CORES", "TEMPERATURE", "MEMORY"];
    sec.querySelectorAll(".cpu-stats small").forEach((el, i) => (el.textContent = labels[i]));
    cpuHist.gpu = [];
    limitNote(prefs.cpuLimit || 100);
    if (animate && !document.body.classList.contains("reduce-motion")) {
      sec.classList.remove("swap"); void sec.offsetWidth; sec.classList.add("swap");
    }
    if (animate) updateCpu(true);
  }

  function setupCpu() {
    const seg = body.querySelector(".seg:not(.seg-dev)");
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
      save({ cpuLimit: v }).then(refreshSpeed);
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
    setupDevice();
    refreshSpeed();
    body.querySelector(".set-measure").onclick = (e) => measureSpeed(e.currentTarget);
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
      (gpuMode() ? " This is the processor's share; the graphics card works alongside it." : "") + " A change applies from the next answer.";
  }

  async function updateCpu(redrawOnly = false) {
    if (panel.hidden || !body.querySelector(".cpu-graph")) { clearInterval(cpuTimer); return; }
    let c, g = null;
    const gpu = gpuMode();
    try {
      [c, g] = await Promise.all([fetch("/api/cpu").then((r) => r.json()), gpu ? fetch("/api/gpu").then((r) => r.json()) : null]);
    } catch { return; }
    if (!body.querySelector(".cpu-graph") || gpu !== gpuMode()) return;
    const first = !cpuInfo;
    cpuInfo = c;
    if (first) limitNote(prefs.cpuLimit || 100);
    if (!redrawOnly) {
      cpuHist.total.push(c.total); cpuHist.umbra.push(c.umbra);
      if (g) cpuHist.gpu.push(g.util == null ? 0 : g.util);
      for (const k of ["total", "umbra", "gpu"]) if (cpuHist[k].length > CPU_POINTS) cpuHist[k].shift();
    }
    const q = (sel) => body.querySelector(sel);
    q(".cpu-total").textContent = Math.round(c.total) + "%";
    q(".cpu-now").textContent = c.load ? `LOAD ${c.load.toFixed(2)}` : "";
    q(".cpu-temp").classList.toggle("hot", !g && c.temp >= 85);
    if (g) {
      const gb = (v) => (v / 2 ** 30).toFixed(1);
      q(".cpu-umbra").textContent = g.util == null ? "not reported" : Math.round(g.util) + "%";
      q(".cpu-now").textContent = "CPU + GPU";
      q(".cpu-name").textContent = cardName(g.name) || "--";
      q(".cpu-count").textContent = g.accel || "--";
      q(".cpu-temp").textContent = g.memTotal ? `${gb(g.memUsed)} of ${gb(g.memTotal)} GB` : g.vramGB ? `${g.vramGB} GB` : "not reported";
      q(".cpu-mem").textContent = g.modelOnGpu == null ? "loads with the next answer" : `${g.modelOnGpu}%`;
      drawCpu();
      return;
    }
    q(".cpu-umbra").textContent = Math.round(c.umbra) + "%";
    q(".cpu-name").textContent = c.name;
    q(".cpu-count").textContent = `${c.physical} cores · ${c.threads} threads`;
    q(".cpu-temp").textContent = c.temp != null ? `${c.temp} °C` : "not reported";
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
    plot(gpuMode() ? cpuHist.gpu : cpuHist.umbra, col("--signal"), 0.28);
  }

  // Reset asks twice: it deletes everything personal.
  async function resetUmbra() {
    const first = await confirmDialog({
      kind: "error", tag: "RESET", title: "RESET UMBRA?",
      body: "This deletes your profile, achievements, settings, custom themes, personalities and scenarios, and every saved conversation.\n\nYour AI model and your library downloads are kept.",
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
    // What the window keeps goes too (training scores, the patient chart,
    // timers, guides, map view...), so it really starts over.
    try { Object.keys(localStorage).filter((k) => k.startsWith("umbra")).forEach((k) => localStorage.removeItem(k)); } catch {}
    location.reload();
  }
  window.resetUmbra = resetUmbra;

  async function uninstallUmbra({ library, model }) {
    const extra = [library && "the offline library", model && "the AI model"].filter(Boolean);
    const sure = await confirmDialog({
      kind: "error", tag: "UNINSTALL", title: "UNINSTALL UMBRA WIKI?",
      body: "Umbra Wiki, its settings, profile and every conversation will be removed from this computer" +
        (extra.length ? `, together with ${extra.join(" and ")}.` : ". The library and the AI model stay.") +
        (onWindowsApp
          ? "\n\nThis window will close, and Windows' uninstaller opens to remove the app itself."
          : packagedInstall
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
    if (onWindowsApp) setTimeout(() => window.umbraNative("close"), 2500);   // so Windows' uninstaller can remove the app
  }

  // ------------------------------------------------------ open / close

  function open(show = panel.hidden, quiet = false) {
    if (show && locked) return;
    if (show === !panel.hidden) return;
    panel.hidden = !show;
    $("#settings-btn").classList.toggle("on", show);
    if (show) {
      window.UmbraSoundMenu?.close();
      if (window.closeCore) window.closeCore();
      toggleThemes(false, true);
      $("#library").hidden = true;
      $("#library-btn").classList.remove("on");
      if (window.closeHistory) window.closeHistory();
      if (window.closeLoadout) window.closeLoadout(true);
      body.scrollTop = 0;
      search.value = query = "";
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
    if (e.key === "Escape" && !panel.hidden && $("#modal").hidden) {
      if (document.activeElement === search && search.value) return;   // Esc clears the search first
      e.stopImmediatePropagation(); open(false);
    }
    // Ctrl+F searches Settings while it's open (elsewhere it searches History).
    if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f" && !panel.hidden) {
      e.preventDefault(); e.stopImmediatePropagation(); window.focusSettingsSearch();
    }
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
      if (JSON.stringify(s.hiddenControls || []) !== JSON.stringify(prefs.hiddenControls || []) || JSON.stringify(s.pinnedControls || []) !== JSON.stringify(prefs.pinnedControls || [])) {
        prefs.hiddenControls = s.hiddenControls || [];
        prefs.pinnedControls = s.pinnedControls || [];
        applyControls();
      }
      if (JSON.stringify(s.headerOrder || []) !== JSON.stringify(prefs.headerOrder || [])) {
        prefs.headerOrder = s.headerOrder || [];
        window.UmbraNavOrder?.apply(prefs.headerOrder);
      }
    } catch {}
  }, 3000);
})();
