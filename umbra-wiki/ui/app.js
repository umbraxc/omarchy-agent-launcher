// Umbra Wiki front end: a chat over the local /api/ask stream.
"use strict";
window.onerror = (msg, src, line) => console.error(`umbra: ${msg} (line ${line})`);

const $ = (s) => document.querySelector(s);
const feed = $("#feed");
const form = $("#ask");
const input = $("#q");
const send = $("#send");
const phaseBox = $("#phase");
const elapsedEl = $("#elapsed");
const introTemplate = $("#intro").cloneNode(true);   // for "new conversation"
let startersToken = 0;

const PHASES = ["search", "read", "think", "write"];
const PHASE_TEXT = { search: "Scanning archives", read: "Extracting sources", think: "Thinking", write: "Writing" };
const QUIPS = {
  search: [
    "Salvaging the archives…", "Digging through the rubble for answers…", "Sweeping the bunker shelves…",
    "Dusting off the survival manuals…", "Scavenging the library ruins…", "Tuning the scanner…",
    "Checking under every loose floorboard…", "Kicking open the supply crates…", "Following the trail markers…",
    "Searching the abandoned ranger station…", "Rummaging through the go-bags…", "Sifting through the ash…",
    "Crawling through the ventilation shafts…", "Cracking open the time capsule…", "Scouting the perimeter…",
    "Flipping through the field manuals…", "Combing the salvage yard…", "Opening the emergency locker…",
    "Wading through the flooded stacks…", "Tapping the walls for hidden rooms…",
  ],
  read: [
    "Decoding scavenged pages…", "Cross-checking field notes…", "Separating signal from static…",
    "Reading by lantern light…", "Piecing the pages back together…", "Squinting at faded handwriting…",
    "Unfolding a water-stained map…", "Translating the margin notes…", "Matching torn pages…",
    "Holding the pages up to the light…",
  ],
  think: [
    "Consulting the wasteland oracle…", "Boiling this down to what matters…", "Checking the Geiger counter…",
    "Negotiating with a raccoon for intel…", "Rationing the facts…", "Sharpening the answer on a whetstone…",
    "Drawing a map in the dirt…", "Weighing the supplies…", "Listening to the static…",
    "Counting the cans in the pantry…", "Charging the hand-crank radio…", "Stoking the campfire of knowledge…",
    "Asking the old-timer at the trading post…", "Plotting a route around the crater…", "Testing the water…",
    "Checking which way the wind blows…", "Tying the loose ends into a bowline…", "Reading the clouds…",
    "Filtering out the nonsense…", "Doing the maths on a scrap of cardboard…", "Winding the pocket watch…",
    "Double-checking the knots…", "Warming up the old generator…", "Consulting the survival almanac…",
    "Sorting the useful from the rusty…", "Keeping the signal fire lit…", "Calibrating the compass…",
    "Mixing the wisdom with a little common sense…", "Packing the answer for the road…", "Almost through the storm…",
  ],
};
let quipTimer = 0, noteTimer = 0, stopArt = null;
let facts = [];
const factsReady = fetch("/api/facts").then((r) => r.json()).then((f) => { facts = f; }).catch(() => {});

function startQuips(answerEl, phase) {
  clearInterval(quipTimer);
  // The personality's own lines join in while searching and thinking.
  const own = phase === "read" ? [] : (window.loadoutQuips || []);
  const list = QUIPS[phase] && QUIPS[phase].concat(own, own);
  if (!list) return;
  let i = Math.floor(Math.random() * list.length);
  const show = () => {
    const w = answerEl.querySelector(".wtext");
    if (!w) { clearInterval(quipTimer); return; }
    w.classList.remove("swap");
    void w.offsetWidth;  // restart the fade
    w.textContent = list[i++ % list.length];
    w.classList.add("swap");
  };
  show();
  quipTimer = setInterval(show, 3200);
}

// A field note under the waiting line, changing every few seconds.
function startNotes(answerEl) {
  clearInterval(noteTimer);
  // A question asked right at launch can arrive before the notes have loaded.
  if (!facts.length) { factsReady.then(() => { if (facts.length && answerEl.isConnected) startNotes(answerEl); }); return; }
  let i = Math.floor(Math.random() * facts.length);
  const show = () => {
    const n = answerEl.querySelector(".wnote .ntext");
    if (!n) { clearInterval(noteTimer); return; }
    n.parentElement.classList.remove("swap");
    void n.offsetWidth;
    n.textContent = facts[i++ % facts.length];
    n.parentElement.classList.add("swap");
  };
  show();
  noteTimer = setInterval(show, 7000);
}

// While Umbra searches, a little scene that fits the chosen scenario
// (scenes.js); a different one each question. The globe takes over while
// it thinks.
let lastScene = "";
function setWaitingArt(answerEl, phase) {
  const art = answerEl.querySelector(".wart");
  if (!art) return;
  const kind = phase === "think" ? "orb" : "scene";
  if (art.dataset.kind === kind) return;
  if (stopArt) stopArt();
  art.dataset.kind = kind;
  art.className = "wart " + kind;
  art.textContent = "";
  if (kind === "orb") { stopArt = orb(art, 14, 10); return; }
  if (!answerEl.dataset.scene) {
    answerEl.dataset.scene = lastScene = window.UmbraScenes.pick(window.loadoutScenario, lastScene);
  }
  stopArt = window.UmbraScenes.run(answerEl.dataset.scene, art);
}

function stopWaiting() {
  clearInterval(quipTimer);
  clearInterval(noteTimer);
  if (stopArt) { stopArt(); stopArt = null; }
}

const chat = [];             // [{role, content}] sent back for follow-ups
let controller = null;       // AbortController of the running answer
let timer = null;
let online = false;          // every launch starts LOCAL
let locked = false;

window.umbraNow = () => new Date(Date.now() + (Number(window.prefs?.clockOffsetMinutes) || 0) * 60000);
window.umbraClockLabel = (stamp = Date.now(), offset = Number(window.prefs?.clockOffsetMinutes) || 0) => new Date(stamp + offset * 60000)
  .toLocaleTimeString(undefined, {hour: "2-digit", minute: "2-digit"});
window.umbraOffsetFor = value => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  const now = new Date(), entered = Number(match[1]) * 60 + Number(match[2]);
  let delta = entered - now.getHours() * 60 - now.getMinutes();
  if (delta > 720) delta -= 1440;
  if (delta < -720) delta += 1440;
  return delta;
};
function updateHomeClock() {
  const el = document.getElementById("home-clock");
  if (el) el.textContent = "◷ " + umbraClockLabel();
}
setInterval(updateHomeClock, 1000);
document.addEventListener("DOMContentLoaded", updateHomeClock);

async function postSettings(update) {
  try {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
  } catch {}
}
function audioPrefsChanged(update) {
  if (window.prefs) Object.assign(prefs, update);
  document.dispatchEvent(new CustomEvent("umbra-audio-prefs", { detail: update }));
}

// ------------------------------------------------------------------ sound

// A message to the app window around the page ("close", "fullscreen",
// "unfullscreen"): the Linux window (WebKitGTK) or the Windows one (pywebview).
window.umbraNative = (msg) => {
  try { window.webkit.messageHandlers.umbra.postMessage(msg); return true; } catch {}
  try { if (window.pywebview && window.pywebview.api) { window.pywebview.api.message(msg); return true; } } catch {}
  return false;
};

// Short bundled sounds (Kenney, CC0), played by the backend through PipeWire
// so they work regardless of the web view's audio support. The Windows
// window (Edge WebView2) plays them itself.
const Sound = (() => {
  let muted = false, last = 0;
  const inPage = /Windows/.test(navigator.userAgent);
  const cache = {};
  const volume = () => (window.prefs && typeof prefs.volume === "number" ? prefs.volume : 0.9);
  const notifyVolume = () => (window.prefs && typeof prefs.notifyVolume === "number" ? prefs.notifyVolume : 0.5);
  const playHere = (name) => {
    const a = cache[name] || (cache[name] = new Audio(`/sounds/${name}.ogg`));
    // Short interface sounds cut their previous one (no tail of clicks).
    const s = ["key", "hover", "click"].includes(name) ? a : a.cloneNode();
    if (s === a) { a.pause(); a.currentTime = 0; }
    const notify = ["achieve", "glitch", "complete"].includes(name) ? notifyVolume() : 1;   // as NOTIFY_SOUNDS in server.py
    if (notify <= 0) return;
    s.volume = volume() * notify;
    s.play().catch(() => {});
  };
  let humAudio = null;
  const play = (name) => {
    last = performance.now();
    if (muted) return;
    if (inPage) return playHere(name);
    fetch("/api/sound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
      .catch(() => {});
  };
  const names = ["launch", "key", "hover", "click", "send", "searchstart", "found", "done",
                 "lock", "unlock", "online", "local", "theme", "error", "beep", "boot", "glitch", "shutdown", "achieve", "complete", "toolchuff"];
  const api = { get muted() { return muted; }, set muted(v) { muted = v; if (v) api.hum(false); } };
  // A click for controls that had no sound of their own just now.
  api.tap = () => { if (performance.now() - last > 120) play("click"); };
  names.forEach((n) => (api[n] = () => play(n)));
  api.hover = () => { if ((!window.prefs || window.prefs.hoverSounds !== false) && !window.offgrid) play("hover"); };
  // The quiet background hum while Umbra searches and thinks.
  api.hum = (on) => {
    if (on && (muted || window.offgrid)) return;
    if (inPage) {
      if (humAudio) { humAudio.pause(); humAudio = null; }
      if (on) { humAudio = new Audio("/sounds/hum.ogg"); humAudio.volume = volume(); humAudio.play().catch(() => {}); }
      return;
    }
    fetch("/api/sound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "hum", on }) })
      .catch(() => {});
  };
  return api;
})();

// Identify the compact navigation icons on the main screen without covering
// a tool panel. These callouts replace duplicate cursor-adjacent tips.
(() => {
  const labels = {
    "loadout-btn": ["PROFILE & LOADOUT", "Identity, scenario and personality"],
    "history-btn": ["HISTORY", "Your saved conversations"],
    "library-btn": ["LIBRARY", "Offline knowledge and manuals"],
    "maps-btn": ["MAPS", "Offline maps and waypoints"],
    "galaxy-btn": ["GALAXY", "The solar system, live"],
    "fieldkit-btn": ["FIELD KIT", "Medic, sky, supplies and training"],
    "farming-btn": ["FARMING", "Crops, livestock and food production"],
    "outpost-btn": ["UMBRA OUTPOST", "Build a settlement and explore two stories"],
    "friends-btn": ["FRIENDS", "Profile cards and the Camp Network"],
    "radar-btn": ["SIGNALS & RADAR", "Nearby signals and device status"],
    "theme-btn": ["THEMES", "Choose Umbra's look"],
    "sound": ["SOUND", "Interface audio"],
    "lock": ["LOCK", "Secure this window"],
    "settings-btn": ["SETTINGS", "Adjust Umbra"],
  };
  // The tab menu names its rows from here: tooltips change with state
  // ("Lock the screen", "Sound on · …"), the names don't.
  window.UMBRA_TAB_NAMES = Object.fromEntries(Object.entries(labels).map(([id, [title]]) => [id, title]));
  const card = document.createElement("div");
  card.className = "nav-callout";
  card.hidden = true;
  card.innerHTML = "<b></b><small></small>";
  document.body.appendChild(card);
  const mainVisible = () => !document.body.classList.contains("touring") && !document.body.classList.contains("locked") &&
    !["#maps", "#fieldkit", "#farming", "#outpost", "#friends", "#radar", "#loadout", "#history", "#library", "#themes", "#settings", "#core"].some((s) => {
      const el = $(s); return el && !el.hidden;
    });
  const hide = () => { card.hidden = true; };
  Object.entries(labels).forEach(([id, [title, hint]]) => {
    const button = document.getElementById(id);
    if (!button) return;
    button.title = `${title}|${hint}`;
    const show = () => {
      if (!mainVisible() || button.hidden || button.classList.contains("gone")) return;
      card.querySelector("b").textContent = title;
      card.querySelector("small").textContent = hint;
      card.hidden = false;
    };
    button.addEventListener("mouseenter", show);
    button.addEventListener("focus", show);
    button.addEventListener("mouseleave", hide);
    button.addEventListener("blur", hide);
  });
  document.addEventListener("click", hide, true);
  window.addEventListener("resize", hide);
})();

// Header controls have the same soft hover response as the tools. After a
// quiet minute on the main screen, one gentle signal crosses their icons.
(() => {
  const bar = document.querySelector(".controls");
  const panels = ["maps", "galaxy", "fieldkit", "farming", "outpost", "friends", "radar", "loadout", "history", "library", "themes", "settings", "core"];
  const atHome = () => !document.hidden && !document.body.classList.contains("locked") &&
    !document.body.classList.contains("touring") && panels.every((id) => document.getElementById(id)?.hidden !== false);
  let idle = 0, wave = 0;
  const arm = () => {
    clearTimeout(idle); clearTimeout(wave); bar.classList.remove("nav-idle-wave");
    idle = setTimeout(() => {
      if (!atHome() || document.body.classList.contains("reduce-motion")) return;
      [...bar.querySelectorAll(".ctl:not([hidden]):not(.overflowed)")].forEach((b, i) => b.style.setProperty("--nav-index", i));
      bar.classList.add("nav-idle-wave");
      wave = setTimeout(arm, 3400);
    }, 60000);
  };
  for (const event of ["pointerdown", "keydown", "wheel"]) document.addEventListener(event, arm, { passive: true });
  let lastMove = 0;
  document.addEventListener("pointermove", () => { const now = performance.now(); if (now - lastMove > 1000) { lastMove = now; arm(); } }, { passive: true });
  document.addEventListener("visibilitychange", arm);
  arm();
})();

// A soft hover blip on the rows and cards of the tools, like elsewhere.
// Tabs and filter chips stay silent, as the header tabs do.
document.addEventListener("mouseover", (e) => {
  const b = e.target.closest(".cal-day, .cal-urow, .rd-row, .rd-krow, .v-row, .v-libi, .tr-mcard, .hist-row .hopen, .mp-pt, .tm-item, .manual-page");
  if (!b || b === hoverLast) return;
  hoverLast = b;
  Sound.hover();
});
let hoverLast = null;

// Every button in the tools (maps, field kit, downloads, settings) answers
// with a click, unless it just made a sound of its own or plays a tone
// (Morse keys, the metronome's tap).
document.addEventListener("click", (e) => {
  const b = e.target.closest("button, .mp-pt, label.mp-opt, .set-chip");
  if (!b || b.disabled || !b.closest("#maps, #fieldkit, #farming, #outpost, #radar, #loadout, #history, #library, #themes, #dl-pop, #settings, .news, .dl-toast, .toolrow, .tabguide, .hist-edit, .hist-move")) return;
  if (b.closest("[data-quiet], .fk-chart, .fk-key, .fk-tap")) return;
  setTimeout(Sound.tap, 30);
});

// Nerd Font icons are drawn wider than the space the font gives them, so on
// their own (in a button) they sit a little right of centre. Each icon is
// measured once in its font and nudged so what's drawn is centred, both ways.
const iconShift = new Map();
const ICON_CHARS = /[\uE000-\uF8FF]|[\u{F0000}-\u{FFFFD}]/u;
function centerIcon(el) {
  const text = el.textContent.trim();
  if (!text || !ICON_CHARS.test(text)) { el.style.translate = ""; return; }
  const cs = getComputedStyle(el);
  const font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const key = text + "|" + font;
  let shift = iconShift.get(key);
  if (!shift) {
    const c = centerIcon.ctx || (centerIcon.ctx = document.createElement("canvas").getContext("2d"));
    c.font = font;
    const m = c.measureText(text);
    shift = [m.width / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2,
             ((m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) - (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent)) / 2];
    iconShift.set(key, shift);
  }
  el.style.translate = `${shift[0].toFixed(2)}px ${shift[1].toFixed(2)}px`;
}
const ICONS = ".g, .lockglyph";
function centerIcons(root = document) {
  if (root.matches && root.matches(ICONS)) centerIcon(root);
  root.querySelectorAll && root.querySelectorAll(ICONS).forEach(centerIcon);
}
document.fonts.ready.then(() => {
  centerIcons();
  // New icons (panels, badges) and changed ones (mute) are centred as they appear.
  new MutationObserver((list) => {
    for (const m of list) {
      const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
      if (!t || t.closest(".answer, .wipe, #rain")) continue;
      const icon = t.closest(ICONS);
      if (icon) centerIcon(icon);
      m.addedNodes.forEach((n) => { if (n.nodeType === 1) centerIcons(n); });
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
});

function setMuted(value, save = true) {
  Sound.muted = value;
  audioPrefsChanged({ muted: value });
  $("#sound-icon").textContent = value ? "󰖁" : "󰕾";
  $("#sound").classList.toggle("off", value);
  $("#sound").title = value ? "Sound off · open sound controls" : "Sound on · open sound controls";
  if (save) postSettings({ muted: value });
  document.dispatchEvent(new Event("umbra-sound-change"));
}
(() => {
  const button = $("#sound");
  const panel = document.createElement("div");
  panel.id = "sound-pop";
  panel.className = "themes sound-panel";
  panel.hidden = true;
  panel.innerHTML = `<div class="themes-head"><span class="themes-title"><span class="spin" data-spin>✻</span> SOUND</span><button class="ghost snd-close" title="Close (Esc)">CLOSE ✕</button></div>
    <div class="library-body sound-body">
    <label class="snd-switch"><span>All sound<small>Effects and offline radio</small></span><input class="snd-on" type="checkbox"></label>
    <label class="snd-range"><span>Effects volume <output class="snd-vol-value"></output></span><input class="snd-volume" type="range" min="0" max="1" step="0.05"></label>
    <label class="snd-range"><span>Notification volume <output class="snd-notify-value"></output></span><input class="snd-notify" type="range" min="0" max="1" step="0.05"></label>
    <label class="snd-switch"><span>Hover sounds<small>Soft blips over controls</small></span><input class="snd-hover" type="checkbox"></label>
    <div class="snd-previews"><small>PREVIEW EFFECTS</small><div><button data-sample="click">CLICK</button><button data-sample="achieve">NOTIFY</button><button data-sample="error">ALERT</button></div></div>
    <div class="snd-radio"></div></div>`;
  document.body.appendChild(panel);
  button.setAttribute("aria-controls", "sound-pop");
  button.setAttribute("aria-expanded", "false");
  const q = (s) => panel.querySelector(s);
  const value = (key, fallback) => window.prefs && typeof prefs[key] === "number" ? prefs[key] : fallback;
  const sync = () => {
    q(".snd-on").checked = !Sound.muted;
    q(".snd-hover").checked = !window.prefs || prefs.hoverSounds !== false;
    for (const [sel, out, amount] of [[".snd-volume", ".snd-vol-value", value("volume", 0.9)],
                                      [".snd-notify", ".snd-notify-value", value("notifyVolume", 0.5)]]) {
      q(sel).value = amount;
      q(out).textContent = Math.round(amount * 100) + "%";
    }
  };
  const close = () => { panel.hidden = true; button.setAttribute("aria-expanded", "false"); };
  button.addEventListener("click", () => {
    if (!panel.hidden) { close(); return; }
    window.closeSettings?.();
    window.closeCore?.();
    toggleThemes(false, true);
    sync(); panel.hidden = false; button.setAttribute("aria-expanded", "true"); Sound.click();
  });
  q(".snd-close").addEventListener("click", close);
  q(".snd-on").addEventListener("change", (e) => { setMuted(!e.target.checked); if (e.target.checked) Sound.click(); });
  q(".snd-hover").addEventListener("change", (e) => {
    audioPrefsChanged({ hoverSounds: e.target.checked });
    postSettings({ hoverSounds: e.target.checked });
    if (e.target.checked) Sound.hover();
  });
  for (const [sel, out, key] of [[".snd-volume", ".snd-vol-value", "volume"], [".snd-notify", ".snd-notify-value", "notifyVolume"]]) {
    const slider = q(sel);
    slider.addEventListener("input", () => { audioPrefsChanged({ [key]: Number(slider.value) }); q(out).textContent = Math.round(Number(slider.value) * 100) + "%"; });
    slider.addEventListener("change", () => { postSettings({ [key]: Number(slider.value) }); Sound.click(); });
  }
  q(".snd-previews").addEventListener("click", (e) => { const sample = e.target.closest("button[data-sample]"); if (sample) Sound[sample.dataset.sample](); });
  document.addEventListener("keydown", (e) => { if (!panel.hidden && e.key === "Escape") { e.stopImmediatePropagation(); close(); } }, true);
  document.addEventListener("umbra-sound-change", sync);
  document.addEventListener("umbra-audio-prefs", sync);
  window.UmbraSoundMenu = { panel, sync, close };
})();

// ----------------------------------------------------------------- themes

let themes = [];
let currentTheme = "";
// The Omarchy theme only loads on Omarchy, so it also tells the tour and
// notes whether Omarchy features (its theme, its top bar) exist here.
const onOmarchy = () => themes.some((t) => t.id === "auto");
// "NVIDIA Corporation GA107M [GeForce RTX 3050 Mobile]" reads as its product name.
const gpuCardName = (name) => (name || "").replace(/^.*\[(.+)\]$/, "$1");
// A typical answer time in words: "about 40 seconds", "about 2.5 minutes"
// (a ½ in the interface font reads like a %).
function fmtAnswerTime(seconds) {
  if (seconds < 50) return `about ${Math.max(5, Math.round(seconds / 5) * 5)} seconds`;
  if (seconds < 75) return "about a minute";
  if (seconds >= 600) return `about ${Math.round(seconds / 60)} minutes`;
  return `about ${Math.round(seconds / 30) / 2} minutes`;
}
const THEME_VARS = {
  bg: "--bg", bg1: "--bg-1", bg2: "--bg-2", bg3: "--bg-3", line: "--line", muted: "--muted",
  fg: "--fg", fgBright: "--fg-bright", dim: "--dim", faint: "--faint",
  signal: "--signal", shade1: "--shade-1", shade2: "--shade-2", shade3: "--shade-3",
  accent: "--accent", red: "--red", net: "--net",
};

// Themes that were redesigned under new names in 3.1.1.
const RENAMED_THEMES = { synthwave: "thermal", toxic: "hazmat", dune: "sahara", abyss: "aurora", volcano: "thermal", jungle: "monsoon",
                         imperium: "tyrian", pharaoh: "lapis", victorian: "burgundy", deco: "jade" };
function applyTheme(id, { animate = true, force = false } = {}) {
  id = RENAMED_THEMES[id] || id;
  const t = themes.find((x) => x.id === id) || themes[0];
  if (!t || (t.id === currentTheme && !force)) return;
  currentTheme = t.id;
  if (animate) {
    document.body.classList.add("theming");
    setTimeout(() => document.body.classList.remove("theming"), 500);
  }
  const root = document.documentElement.style;
  for (const [key, cssVar] of Object.entries(THEME_VARS)) root.setProperty(cssVar, t[key]);
  document.documentElement.style.colorScheme = t.light || t.id === "daybreak" ? "light" : "dark";
  document.querySelectorAll(".tcard").forEach((c) => c.classList.toggle("current", c.dataset.id === t.id));
}

function renderThemeGrid() {
  const grid = $("#theme-grid");
  grid.innerHTML = "";
  themes.forEach((t, i) => {
    const card = document.createElement("button");
    card.className = "tcard" + (t.id === currentTheme ? " current" : "");
    card.dataset.id = t.id;
    card.style.cssText = `background:${t.bg1};color:${t.fg};animation-delay:${i * 35}ms`;
    card.innerHTML = `<div class="tname"></div><div class="tline"></div>
      <div class="tsample">UMBRA<span>//</span>WIKI</div><div class="swatches"></div>`;
    card.querySelector(".tname").textContent = t.name.toUpperCase();
    if (t.auto) {
      const badge = document.createElement("span");
      badge.className = "tauto";
      badge.textContent = "AUTO";
      card.appendChild(badge);
    }
    card.querySelector(".tname").style.color = t.fgBright;
    card.querySelector(".tline").textContent = t.tagline;
    card.querySelector(".tline").style.color = t.dim;
    card.querySelector(".tsample").style.color = t.fgBright;
    card.querySelector(".tsample span").style.color = t.signal;
    const sw = card.querySelector(".swatches");
    for (const c of [t.bg3, t.fg, t.signal, t.accent, t.net]) {
      const i2 = document.createElement("i");
      i2.style.background = c;
      sw.appendChild(i2);
    }
    if (t.custom) {
      const tools = document.createElement("div");
      tools.className = "ttools";
      tools.innerHTML = `<button class="tedit" title="Edit">✎ EDIT</button><button class="tdel" title="Delete">✕</button>`;
      tools.querySelector(".tedit").addEventListener("click", (e) => { e.stopPropagation(); openEditor(t); });
      tools.querySelector(".tdel").addEventListener("click", async (e) => {
        e.stopPropagation();
        const ok = await confirmDialog({ kind: "to-local", tag: "DELETE", title: `DELETE "${t.name.toUpperCase()}"?`,
          body: "This theme will be removed. You can always create it again.", ok: "DELETE", cancel: "KEEP" });
        if (!ok) return;
        await fetch("/api/themes/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: t.id }) });
        themes = themes.filter((x) => x.id !== t.id);
        if (currentTheme === t.id) { applyTheme("umbra"); postSettings({ theme: "umbra" }); }
        renderThemeGrid();
      });
      card.appendChild(tools);
    }
    card.addEventListener("mouseenter", Sound.hover);
    card.addEventListener("click", () => {
      applyTheme(t.id);
      postSettings({ theme: t.id });
      Sound.theme();
    });
    grid.appendChild(card);
  });
  const create = document.createElement("button");
  create.className = "tcard tcreate";
  create.style.animationDelay = `${themes.length * 35}ms`;
  create.innerHTML = `<div class="tplus">+</div><div class="tname">CREATE THEME</div><div class="tline">Pick six colours, see them live</div>`;
  create.addEventListener("mouseenter", Sound.hover);
  create.addEventListener("click", () => openEditor(null));
  grid.appendChild(create);
}

// ------------------------------------------------------------ theme editor

// Six named colours make a theme; everything else is derived from them.
const BASE_FIELDS = [
  ["background", "Background", "The base behind everything"],
  ["text", "Text", "The main reading colour"],
  ["main", "Main colour", "Highlights, logo, citations, buttons"],
  ["secondary", "Secondary colour", "Small accents and hazard signs"],
  ["online", "Online colour", "Top bar and transmit button when online"],
  ["alert", "Alert colour", "Errors, stop, lost connection"],
];

const hexToRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgbToHex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mixHex = (a, b, t) => { const x = hexToRgb(a), y = hexToRgb(b); return rgbToHex(x.map((v, i) => v + (y[i] - v) * t)); };
const luminance = (h) => { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };

function derivePalette(id, name, b) {
  const light = luminance(b.background) > 0.55;
  const edge = light ? "#ffffff" : "#000000";
  const far = light ? "#000000" : "#ffffff";
  return {
    id, name, tagline: "Your theme", custom: true, light, base: { ...b },
    bg: b.background,
    bg1: mixHex(b.background, b.text, 0.03), bg2: mixHex(b.background, b.text, 0.06),
    bg3: mixHex(b.background, b.text, 0.11), line: mixHex(b.background, b.text, 0.16),
    muted: mixHex(b.background, b.text, 0.22),
    fg: b.text, fgBright: mixHex(b.text, far, 0.45),
    dim: mixHex(b.text, b.background, 0.3), faint: mixHex(b.text, b.background, 0.55),
    signal: b.main, shade1: mixHex(b.main, edge, 0.25), shade2: mixHex(b.main, edge, 0.45), shade3: mixHex(b.main, edge, 0.65),
    accent: b.secondary, red: b.alert, net: b.online,
  };
}

function baseFrom(t) {
  return t.base && t.base.background ? { ...t.base } : {
    background: t.bg, text: t.fg, main: t.signal, secondary: t.accent, online: t.net, alert: t.red,
  };
}

function openEditor(existing) {
  const before = currentTheme;
  const source = existing || themes.find((x) => x.id === currentTheme) || themes[0];
  const base = baseFrom(source);
  const grid = $("#theme-grid");
  grid.innerHTML = "";
  const form = document.createElement("div");
  form.className = "editor";
  form.innerHTML = `
    <div class="ed-title">${existing ? "EDIT THEME" : "CREATE THEME"}</div>
    <label class="ed-name"><span>NAME</span><input id="ed-name" maxlength="24" placeholder="My theme"></label>
    <div class="ed-fields"></div>
    <div class="ed-actions"><button class="ghost" id="ed-cancel">CANCEL</button><button class="solid" id="ed-save">SAVE THEME</button></div>`;
  form.querySelector("#ed-name").value = existing ? existing.name : "";
  const fields = form.querySelector(".ed-fields");
  const preview = () => {
    const pal = derivePalette("__preview", "Preview", base);
    const i = themes.findIndex((x) => x.id === "__preview");
    if (i >= 0) themes[i] = pal; else themes.push(pal);
    applyTheme("__preview", { animate: false, force: true });
  };
  for (const [key, label, hint] of BASE_FIELDS) {
    const row = document.createElement("label");
    row.className = "ed-row";
    row.innerHTML = `<input type="color"><span class="ed-label"><b></b><small></small></span><input class="ed-hex" maxlength="7">`;
    row.querySelector("b").textContent = label;
    row.querySelector("small").textContent = hint;
    const picker = row.querySelector('input[type="color"]');
    const hex = row.querySelector(".ed-hex");
    picker.value = hex.value = base[key];
    picker.addEventListener("input", () => { base[key] = hex.value = picker.value; preview(); });
    hex.addEventListener("input", () => {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) { base[key] = picker.value = hex.value.toLowerCase(); preview(); }
    });
    fields.appendChild(row);
  }
  const close = (restore) => {
    themes = themes.filter((x) => x.id !== "__preview");
    if (restore) applyTheme(before, { force: true });
    renderThemeGrid();
  };
  form.querySelector("#ed-cancel").addEventListener("click", () => { Sound.click(); close(true); });
  form.querySelector("#ed-save").addEventListener("click", async () => {
    const name = form.querySelector("#ed-name").value.trim() || "My theme";
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "theme";
    const id = existing ? existing.id : `custom-${slug}`;
    const pal = derivePalette(id, name, base);
    const res = await fetch("/api/themes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: pal }) });
    if (!res.ok) { Sound.error(); return; }
    themes = themes.filter((x) => x.id !== id && x.id !== "__preview");
    themes.push(pal);
    currentTheme = "";
    applyTheme(id);
    postSettings({ theme: id });
    Sound.theme();
    renderThemeGrid();
  });
  grid.appendChild(form);
  preview();
  Sound.click();
}

function toggleThemes(show = $("#themes").hidden, quiet = false) {
  if (show && locked) return;
  $("#themes").hidden = !show;
  $("#theme-btn").classList.toggle("on", show);
  if (show) {
    if (window.closeCore) window.closeCore();
    $("#library").hidden = true;
    $("#library-btn").classList.remove("on");
    if (window.closeHistory) window.closeHistory();
    if (window.closeSettings) window.closeSettings();
    renderThemeGrid();
  }
  if (!quiet) Sound.click();
}
$("#theme-btn").addEventListener("click", () => toggleThemes());
$("#themes-close").addEventListener("click", () => toggleThemes(false));

// ---------------------------------------------------------------- library

const CATEGORY = { survival: "SURVIVAL", medical: "MEDICAL", practical: "PRACTICAL SKILLS", everyday: "EVERYDAY LIFE", knowledge: "KNOWLEDGE & THE WORLD" };
const fmtSize = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB");

// Rebuilds a scrolling panel in place: the reader stays where they scrolled
// to (downloads refresh the panel every few seconds), and rows don't replay
// their entry animation.
function keepScroll(el, rebuild) {
  const top = el.scrollTop, again = el.childElementCount > 0;
  rebuild();
  el.classList.toggle("refreshing", again);
  el.scrollTop = top;
}

// fresh: the panel was just opened (start at the top, show "Reading…").
let libraryStructure = "";
async function renderLibrary(fresh = false) {
  const body = $("#library-body");
  if (fresh) {
    libraryStructure = "";
    body.innerHTML = `<p class="lib-note"><span class="spin" data-spin>✻</span> Reading library…</p>`;
    body.scrollTop = 0;
  }
  let lib, packs = [], dl = { library: { items: [] } };
  try {
    [lib, packs, dl] = await Promise.all([
      fetch("/api/library").then((r) => r.json()),
      fetch("/api/packs").then((r) => r.json()).catch(() => []),
      fetch("/api/downloads").then((r) => r.json()).catch(() => dl),
    ]);
  } catch { body.innerHTML = `<p class="lib-note">Library unavailable.</p>`; return; }
  const jobs = dl.library.items || [];
  const downloading = new Set(jobs.filter((x) => !x.installed && ["queued", "downloading", "paused"].includes(x.status)).map((x) => x.id));
  const structure = JSON.stringify([lib.installed.map((x) => x.file), lib.available.map((x) => x.id),
    jobs.map((x) => [x.id, x.status, x.installed]), dl.library.paused,
    (lib.linked || []).map((x) => [x.path, x.available])]);
  if (!fresh && structure === libraryStructure) {
    const overall = body.querySelector("[data-library-percent]");
    if (overall) overall.textContent = dl.library.percent + "%";
    const bar = body.querySelector("[data-library-bar]");
    if (bar) bar.style.width = dl.library.percent + "%";
    jobs.forEach((x) => {
      const row = [...body.querySelectorAll("[data-dl-id]")].find((el) => el.dataset.dlId === x.id);
      if (row) row.querySelector("[data-dl-pct]").textContent = x.status === "downloading"
        ? (x.size ? Math.round(x.done * 100 / x.size) : 0) + "%" : x.status.toUpperCase();
    });
    clearTimeout(libraryTimer);
    if (dl.library.active) libraryTimer = setTimeout(() => { if (!$("#library").hidden) renderLibrary(); }, 2500);
    return;
  }
  libraryStructure = structure;

  const total = lib.installed.reduce((n, x) => n + x.size, 0);
  let html = `<p class="lib-note">Collections are stored in <code>${escapeHtml(lib.dir)}</code> and work fully offline.
    Downloads run in the background, are checked for damage, and join the library as soon as they finish.</p>`;

  if (dl.library.active || dl.library.paused || jobs.some((x) => x.status === "error")) {
    const paused = !!dl.library.paused;
    html += `<div class="lib-section"><div class="lib-head"><span>${paused ? "󰏤 PAUSED" : dl.library.active ? `<span class="spin" data-spin>✻</span> DOWNLOADING` : "DOWNLOAD NEEDS ATTENTION"}</span><b data-library-percent>${dl.library.percent}%</b></div>
      <div class="dl-bar"><i data-library-bar style="width:${dl.library.percent}%"></i></div>`;
    jobs.forEach((x) => {
      const pct = x.size ? Math.round((x.done * 100) / x.size) : 0;
      html += `<div class="dl-row" data-dl-id="${escapeHtml(x.id)}"><span>${x.installed ? "✓" : pct ? "↓" : "·"} ${escapeHtml(x.name)}</span><span data-dl-pct>${x.installed ? "DONE" : x.status === "downloading" ? pct + "%" : x.status.toUpperCase()}</span></div>`;
    });
    if (dl.library.error) html += `<p class="lib-note mp-err">${escapeHtml(dl.library.error)}</p>`;
    if (window.UmbraDownloads) html += `<div class="dl-controls">${UmbraDownloads.controls("library", { paused: paused || (!dl.library.active && !!dl.library.error) })}</div>${UmbraDownloads.note("the library download")}`;
    html += `</div>`;
  }

  const manual = await loadManual();
  if (manual.length) {
    html += `<div class="lib-section"><div class="lib-head"><span>󰈙 FIELD MANUAL · ${manual.length} PAGES · BUILT IN</span>
      <button class="ghost lib-manual-export" title="Save the whole manual as a file, to print or keep on a USB stick">󰈇 EXPORT</button></div>
      ${[...new Set(manual.map((p) => p.category))].map((cat) => {
        const M = window.UmbraManualArt, color = M ? M.color(cat) : "var(--signal)";
        const pages = manual.filter((p) => p.category === cat);
        return `<div class="manual-cat" style="--cat:${color}"><div class="manual-cat-head"><b>${escapeHtml(cat.toUpperCase())}</b><small>${pages.length} ${pages.length === 1 ? "PAGE" : "PAGES"}</small></div>
          <div class="manual-grid">${pages.map((p) => `<button class="manual-page" data-page="${p.id}" title="${escapeHtml(p.title)}|${escapeHtml(p.summary)}">
            <pre class="m-art">${escapeHtml(M ? M.art(p.id)[0] : "")}</pre><span class="m-title">${escapeHtml(p.title)}</span></button>`).join("")}</div></div>`;
      }).join("")}</div>`;
  }

  const open = packs.filter((p) => p.missing.length);
  if (open.length) {
    html += `<div class="lib-section"><div class="lib-head"><span>PACKS</span></div>
      <p class="lib-note lib-quote">“The more you prepare on a calm day, the more you'll have on a hard one.”</p>`;
    open.forEach((p) => {
      const busy = p.missing.every((id) => downloading.has(id));
      html += `<div class="lib-row pack"><span class="mark-new">◆</span>
        <span class="lname">${escapeHtml(p.name)}${p.recommended ? ' <span class="lrec">RECOMMENDED</span>' : ""}
          <span class="lsize">· ${p.count} collections · ${fmtSize(p.size)}</span></span>
        <button class="ghost get" data-ids="${p.missing.join(" ")}" ${busy ? "disabled" : ""}>${busy ? "DOWNLOADING" : "GET " + fmtSize(p.missingSize)}</button>
        <span class="ldesc">${escapeHtml(p.tagline)}</span></div>`;
    });
    html += `</div>`;
  }

  html += `<div class="lib-section"><div class="lib-head"><span>INSTALLED · ${lib.installed.length}</span><b>${fmtSize(total)}</b></div>`;
  if (!lib.installed.length) html += `<p class="lib-note">No collections yet. Answers come from the AI alone until you add some.</p>`;
  lib.installed.forEach((x, i) => {
    html += `<div class="lib-row" style="animation-delay:${i * 20}ms"><span class="mark-ok">✓</span>
      <span class="lname">${escapeHtml(x.name)}</span><span class="lsize">${fmtSize(x.size)}</span>
      <span class="ldesc">${escapeHtml(x.description)}</span></div>`;
  });
  html += `</div>`;

  html += `<div class="lib-section"><div class="lib-head"><span>LINKED FILES · ${(lib.linked || []).length}</span>
    <button class="ghost lib-link-choose" title="Choose existing files to use in Umbra without copying them">+ LINK FILES</button></div>
    <p class="lib-note">Link ZIM archives, PDFs and text files where they already live. Keep the original files available; Umbra never moves them.</p>
    <div class="lib-link-entry"><input class="lib-link-path" type="text" placeholder="Or paste a full file path" aria-label="Full path to a library file">
      <button class="ghost lib-link-add">LINK PATH</button></div>
    <p class="lib-note lib-link-error" hidden></p>`;
  (lib.linked || []).forEach((x, i) => {
    html += `<div class="lib-row lib-linked"><span class="${x.available ? "mark-ok" : "mark-new"}">${x.available ? "✓" : "!"}</span>
      <span class="lname">${escapeHtml(x.name)} <small class="lsize">· ${x.kind.toUpperCase()}</small></span>
      <button class="ghost lib-unlink" data-link-i="${i}" title="Remove this link; leave the original file untouched">UNLINK</button>
      <span class="ldesc">${x.available ? escapeHtml(x.path) : "File unavailable: " + escapeHtml(x.path)}</span></div>`;
  });
  html += `</div>`;

  for (const cat of Object.keys(CATEGORY)) {
    const items = lib.available.filter((x) => x.category === cat);
    if (!items.length) continue;
    html += `<div class="lib-section"><div class="lib-head"><span>AVAILABLE · ${CATEGORY[cat]}</span></div>`;
    items.forEach((x, i) => {
      html += `<div class="lib-row" style="animation-delay:${i * 20}ms"><span class="mark-new">+</span>
        <span class="lname">${escapeHtml(x.name)} <span class="lsize">· ${fmtSize(x.size)}</span></span>
        <button class="ghost get" data-ids="${x.id}" ${downloading.has(x.id) ? "disabled" : ""}>${downloading.has(x.id) ? "DOWNLOADING" : "DOWNLOAD"}</button>
        <span class="ldesc">${escapeHtml(x.description)}</span></div>`;
    });
    html += `</div>`;
  }
  if (!lib.available.length) html += `<p class="lib-note">✓ Every recommended collection is installed.</p>`;
  keepScroll(body, () => { body.innerHTML = html; });
  startManualArt(body);
  body.querySelectorAll(".manual-page").forEach((b) => {
    b.addEventListener("mouseenter", Sound.hover);
    b.addEventListener("click", () => openManual(b.dataset.page));
  });
  if (window.UmbraDownloads) UmbraDownloads.wire(body, () => renderLibrary());
  body.querySelector(".lib-manual-export")?.addEventListener("click", () => exportTo({ what: "manual" }, "the field manual"));
  body.querySelectorAll("[data-ids]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    b.textContent = "STARTING…";
    Sound.click();
    await fetch("/api/library/download", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: b.dataset.ids.split(" ") }),
    });
    renderLibrary();
    if (window.UmbraDownloads) UmbraDownloads.refresh();
  }));
  const linkError = body.querySelector(".lib-link-error");
  const linkRequest = async (route, payload = {}) => {
    try {
      const r = await fetch("/api/library/" + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || "Could not link that file");
      renderLibrary();
    } catch (e) { linkError.textContent = e.message; linkError.hidden = false; Sound.error(); }
  };
  body.querySelector(".lib-link-choose").addEventListener("click", () => linkRequest("choose"));
  body.querySelector(".lib-link-add").addEventListener("click", () => {
    const path = body.querySelector(".lib-link-path").value.trim();
    if (path) linkRequest("link", { paths: [path] });
  });
  body.querySelector(".lib-link-path").addEventListener("keydown", (e) => { if (e.key === "Enter") body.querySelector(".lib-link-add").click(); });
  body.querySelectorAll(".lib-unlink").forEach((b) => b.addEventListener("click", () => linkRequest("unlink", { path: lib.linked[+b.dataset.linkI].path })));
  // Keep the progress moving while the panel is open.
  clearTimeout(libraryTimer);
  if (dl.library.active) libraryTimer = setTimeout(() => { if (!$("#library").hidden) renderLibrary(); }, 2500);
}
let libraryTimer = 0;

// The manual cards' pictures breathe slowly; the one under the mouse faster.
let manualArtTimer = 0;
function startManualArt(body) {
  clearInterval(manualArtTimer);
  if (!window.UmbraManualArt) return;
  let t = 0;
  manualArtTimer = setInterval(() => {
    if ($("#library").hidden || !body.isConnected) { clearInterval(manualArtTimer); return; }
    if (document.body.classList.contains("reduce-motion") || window.offgrid) return;
    t++;
    body.querySelectorAll(".manual-page").forEach((b, i) => {
      const hot = b.matches(":hover");
      if (!hot && (t + i) % 4) return;
      const frames = UmbraManualArt.art(b.dataset.page);
      b.querySelector(".m-art").textContent = frames[(hot ? t : Math.floor((t + i) / 4)) % frames.length];
    });
  }, 420);
}

function toggleLibrary(show = $("#library").hidden) {
  if (show && locked) return;
  $("#library").hidden = !show;
  $("#library-btn").classList.toggle("on", show);
  if (show) {
    toggleThemes(false, true);
    if (window.closeHistory) window.closeHistory();
    if (window.closeSettings) window.closeSettings();
    renderLibrary(true);
  }
  Sound.click();
}
$("#library-btn").addEventListener("click", () => toggleLibrary());
$("#library-close").addEventListener("click", () => toggleLibrary(false));

// The emblem and the name in the top left: close any panel and start a new
// conversation on the start screen.
function goHome() {
  if (locked || document.body.classList.contains("touring") || !window.newConversation) return;
  backTo = null;
  if (!$("#reader").hidden) { $("#reader").hidden = true; $("#reader-frame").src = "about:blank"; }
  if (window.closeSettings) window.closeSettings();
  if (window.closeLoadout) window.closeLoadout(true);
  if (window.closeMaps) window.closeMaps();
  window.closeGalaxy?.();
  if (window.closeFieldKit) window.closeFieldKit();
  if (window.closeFarming) window.closeFarming();
  if (window.closeRadar) window.closeRadar();
  toggleThemes(false, true);
  $("#library").hidden = true;
  $("#library-btn").classList.remove("on");
  window.newConversation();
}
$("#home").addEventListener("click", goHome);
$(".brand .name").addEventListener("click", goHome);

// Settings can change from the bar widget too, so keep them in sync.
async function syncSettings(first = false) {
  if (!first && document.hidden) return;
  try {
    const s = await (await fetch("/api/settings")).json();
    if (s.theme === "auto") {
      // Follow changes to the Omarchy theme while "auto" is selected.
      const fresh = await (await fetch("/api/omarchy-theme")).json();
      const i = themes.findIndex((x) => x.id === "auto");
      if (fresh && fresh.id && i >= 0 && JSON.stringify(fresh) !== JSON.stringify(themes[i])) {
        themes[i] = fresh;
        applyTheme("auto", { animate: !first, force: true });
      }
    }
    if (s.theme) applyTheme(s.theme, { animate: !first });
    if (typeof s.muted === "boolean" && s.muted !== Sound.muted) setMuted(s.muted, false);
  } catch {}
}

(async () => {
  try { themes = await (await fetch("themes.json")).json(); } catch { themes = []; }
  try {
    const auto = await (await fetch("/api/omarchy-theme")).json();
    if (auto && auto.id) themes.unshift(auto);
  } catch {}
  try { themes.push(...(await (await fetch("/api/themes")).json())); } catch {}
  await syncSettings(true);
  if (!currentTheme && themes.length) applyTheme(themes[0].id, { animate: false });
  setInterval(syncSettings, 3000);
})();

// ------------------------------------------------------------------ status

async function refreshStatus() {
  const st = $("#t-status");
  try {
    const s = await (await fetch("/api/status")).json();
    $("#t-archives").textContent = String(s.archives).padStart(2, "0");
    $("#t-model").textContent = s.model.replace(":", " ").toUpperCase();
    if (controller) return;
    const d = await fetch("/api/downloads").then((r) => r.json()).catch(() => null);
    const pull = d && d.model && d.model.active && d.model.total ? Math.round((d.model.completed * 100) / d.model.total) : null;
    if (!s.ollama) { st.textContent = "CORE OFFLINE"; st.className = "v bad"; }
    else if (!s.modelReady && pull !== null) { st.textContent = `AI ↓ ${pull}%`; st.className = "v busy"; }
    else if (!s.modelReady) { st.textContent = "NO MODEL"; st.className = "v bad"; }
    else if (d && d.library.active) { st.textContent = `LIB ↓ ${d.library.percent}%`; st.className = "v busy"; }
    else { st.textContent = "READY"; st.className = "v"; }
  } catch (err) {
    console.warn("status check failed:", err && err.message);
    st.textContent = "NO BACKEND"; st.className = "v bad";
  }
}
refreshStatus();
setInterval(refreshStatus, 5000);

// ---------------------------------------------------------- little motion

// Spinner glyphs, cycled on one shared timer that runs only while needed.
const SPIN = "·✢✣✶✻✽✻✶✣✢".split("");   // no emoji-capable characters (✳ could turn green)
let spinFrame = 0;
setInterval(() => {
  const spins = document.querySelectorAll("[data-spin]");
  if (!spins.length) return;
  spinFrame = (spinFrame + 1) % SPIN.length;
  spins.forEach((el) => { if (el.offsetParent !== null) el.textContent = SPIN[spinFrame]; });
}, 110);

// The start screen's orb (and the one while Umbra thinks), in the style
// equipped in the Locker: drawn by orbs.js.
function orb(el, w, h, style) {
  if (!window.UmbraOrbs) return () => {};
  return window.UmbraOrbs.start(el, w, h, () => style || (window.prefs && window.prefs.orb) || "globe");
}
window.umbraOrb = orb;

// Digital rain: columns of random characters falling behind the intro,
// fading as they go. ~16 frames a second on a small canvas.
let rainRaf = 0;
// The start screen's animated background, chosen in Settings (the
// backgrounds themselves live in backgrounds.js). About 16 frames a second.
let rainResize = null;
function startRain() {
  if (!introVisible || controller) return;
  const canvas = $("#rain");
  const front = $("#rain-front");
  if (front) front.getContext("2d").clearRect(0, 0, front.width, front.height);
  if (!canvas || document.body.classList.contains("no-rain") || document.body.classList.contains("reduce-motion")) return;
  stopRain();
  const mode = (window.prefs && window.prefs.background) || "rain";
  const make = window.UmbraBackgrounds && (window.UmbraBackgrounds.make[mode] || window.UmbraBackgrounds.make.rain);
  if (mode === "none" || !make) return;
  const env = {
    ctx: canvas.getContext("2d"), fctx: front ? front.getContext("2d") : canvas.getContext("2d"), w: 0, h: 0, c: {},
    // The globe's centre and radius, in canvas coordinates.
    orb() {
      const el = $("#intro-orb");
      if (!el) return null;
      const cr = canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
      return { x: r.left - cr.left + r.width / 2, y: r.top - cr.top + r.height / 2, r: r.width / 2 };
    },
  };
  const bg = make(env);
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    env.w = canvas.width = Math.max(1, Math.floor(r.width));
    env.h = canvas.height = Math.max(1, Math.floor(r.height));
    if (front) { front.width = env.w; front.height = env.h; }
    bg.resize();
  };
  resize();
  if (rainResize) rainResize.disconnect();
  rainResize = new ResizeObserver(resize);
  rainResize.observe(canvas);
  let last = 0, t = 0;
  const VARS = { bg: "--bg", signal: "--signal", shade1: "--shade-1", shade2: "--shade-2", shade3: "--shade-3",
                 fgBright: "--fg-bright", dim: "--dim", net: "--net", accent: "--accent", font: "--font" };
  const frame = (ts) => {
    rainRaf = requestAnimationFrame(frame);
    if (ts - last < 60 || !canvas.isConnected) return;
    last = ts;
    t += 0.06;
    const css = getComputedStyle(document.documentElement);
    for (const [k, v] of Object.entries(VARS)) env.c[k] = css.getPropertyValue(v).trim();   // follows theme changes
    bg.frame(t);
  };
  rainRaf = requestAnimationFrame(frame);
}
function stopRain() { cancelAnimationFrame(rainRaf); rainRaf = 0; }

// Transition styles (Settings → Transition): each gives every character cell
// its moment in the wave, from 0 (first) to about 1 (last), for the way in
// and the way out. The boot, the tour's end, previews and the outro use it.
const cellNoise = (x) => { const v = Math.sin(x * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };
const TRANSITIONS = {
  wave: { name: "Glyph wave",
    in: (x, y) => x * 0.55 + y * 0.25 + Math.random() * 0.2,
    out: (x, y) => Math.hypot(x - 0.5, y - 0.5) * 1.3 + Math.random() * 0.25 },
  rain: { name: "Glyph rain",
    in: (x, y) => y * 0.75 + cellNoise(x * 7) * 0.3 + Math.random() * 0.05,
    out: (x, y) => y * 0.75 + cellNoise(x * 3) * 0.35 + Math.random() * 0.06 },
  scan: { name: "Scanlines",
    in: (x, y) => y * 0.95 + Math.random() * 0.05,
    out: (x, y) => (1 - y) * 0.95 + Math.random() * 0.05 },
  static: { name: "Static",
    in: () => Math.random() * 1.0,
    out: () => Math.random() * 1.0 },
  blinds: { name: "Blinds",
    in: (x, y, rows) => ((y * rows) % 5) / 5 * 0.8 + x * 0.15 + Math.random() * 0.05,
    out: (x, y, rows) => ((y * rows) % 5) / 5 * 0.8 + (1 - x) * 0.15 + Math.random() * 0.05 },
  split: { name: "Split",
    in: (x) => (1 - Math.abs(x - 0.5) * 2) * 0.95 + Math.random() * 0.08,
    out: (x) => Math.abs(x - 0.5) * 2 * 0.95 + Math.random() * 0.08 },
  diamond: { name: "Diamond",
    in: (x, y) => (1 - (Math.abs(x - 0.5) + Math.abs(y - 0.5))) * 1.0 + Math.random() * 0.12,
    out: (x, y) => (Math.abs(x - 0.5) + Math.abs(y - 0.5)) * 1.0 + Math.random() * 0.12 },
  spiral: { name: "Spiral",
    in: (x, y) => ((Math.atan2(y - 0.5, x - 0.5) + Math.PI) / (2 * Math.PI)) * 0.7 + Math.hypot(x - 0.5, y - 0.5) * 0.4 + Math.random() * 0.08,
    out: (x, y) => ((Math.atan2(y - 0.5, x - 0.5) + Math.PI) / (2 * Math.PI)) * 0.7 + Math.hypot(x - 0.5, y - 0.5) * 0.4 + Math.random() * 0.08 },
};
window.UmbraTransitions = Object.entries(TRANSITIONS).map(([id, t]) => [id, t.name]);
const transition = () => TRANSITIONS[(window.prefs && window.prefs.transition) || "wave"] || TRANSITIONS.wave;

// The character grid under the boot and goodbye transitions. It follows the
// window: resized or made fullscreen mid-animation, the grid is rebuilt at
// the new size (nothing stretches, crops or leaves an edge uncovered), and it
// draws at the screen's pixel density so the text stays sharp.
// times(cols, rows) gives each cell its moment(s) in the wave.
function glyphGrid(canvas, times) {
  const g = { cw: 11, ch: 20, w: 0, h: 0, dpr: 0 };
  g.fit = () => {
    const dpr = window.devicePixelRatio || 1;
    if (g.w === innerWidth && g.h === innerHeight && g.dpr === dpr) return false;
    g.w = innerWidth; g.h = innerHeight; g.dpr = dpr;
    canvas.width = Math.round(g.w * dpr); canvas.height = Math.round(g.h * dpr);
    g.ctx = canvas.getContext("2d");
    g.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.cols = Math.ceil(g.w / g.cw); g.rows = Math.ceil(g.h / g.ch); g.n = g.cols * g.rows;
    g.mask = document.createElement("canvas");
    g.mask.width = g.cols; g.mask.height = g.rows;
    g.mctx = g.mask.getContext("2d");
    g.img = g.mctx.createImageData(g.cols, g.rows);
    g.layer = document.createElement("canvas");
    g.layer.width = canvas.width; g.layer.height = canvas.height;
    g.lctx = g.layer.getContext("2d");
    g.lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.at = times(g.cols, g.rows);
    return true;
  };
  g.fit();
  return g;
}

// A full-window ASCII transition. A wave of glyphs sweeps diagonally over
// the screen and leaves it dark with a few embers; UMBRA // ONLINE types
// in and beeps, the status line fades in and the user is welcomed by name;
// then the glyphs dissolve from the centre outwards, revealing what swap()
// put underneath. With covered it starts already dark (at launch, behind
// the "booting" cover, so the page never flashes first).
//
// Fast enough to stay smooth: the dark cover is one tiny image (a pixel
// per character cell) scaled up in a single draw, and glyphs are drawn
// only along the moving edge of the wave.
function asciiWipe(swap, { covered = false, welcome = "" } = {}) {
  return new Promise((resolve) => {
    if (document.body.classList.contains("reduce-motion")) {
      swap(); document.body.classList.remove("booting"); resolve(); return;
    }
    const canvas = document.createElement("canvas");
    canvas.className = "wipe";
    document.body.appendChild(canvas);
    const glyphs = "░▒▓█#%&@*+=:·アイウエオカキクケコ0123456789".split("");
    // Each cell's moment in the wave: diagonal on the way in, from the
    // centre outwards on the way out.
    const style = transition();
    const grid = glyphGrid(canvas, (cols, rows) => {
      const inAt = new Float32Array(cols * rows), outAt = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) {
        const x = (i % cols) / cols, y = ((i / cols) | 0) / rows;
        inAt[i] = style.in(x, y, rows);
        outAt[i] = style.out(x, y, rows);
      }
      return { inAt, outAt };
    });
    const IN = covered ? 0 : 1000, HOLD = 4300, OUT = 2800, band = 0.2;
    const GLITCH = [3650, 4200];   // after a moment to read the welcome, the text glitches out
    const title = "UMBRA // ONLINE", sub = "LOADOUT DEPLOYED · LIBRARY LINKED · CORE READY";
    const color = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const rgb = (c) => {
      const m = c.match(/^#([0-9a-f]{6})$/i);
      if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
      const r = c.match(/\d+/g);
      return r ? r.slice(0, 3).map(Number) : [9, 9, 9];
    };
    const start = performance.now();
    let swapped = false, first = true, lastGlyphs = 0;
    const beeps = [1000, 1260, 1520];                    // ONLINE blinks with these
    let glitchSounded = false;                           // the glitch has its own sound
    let beeped = 0;

    const frame = (now) => {
      const t = now - start;
      if (grid.fit()) lastGlyphs = 0;   // the window changed size: redraw everything at once
      const { w, h, cw, ch, cols, rows, n, ctx, mask, mctx, img, layer: glyphLayer, lctx: gctx } = grid;
      const { inAt, outAt } = grid.at;
      const [bg, signal, shade, dim, accent, font] = ["--bg", "--signal", "--shade-2", "--dim", "--accent", "--font"].map(color);
      const [r, g, b] = rgb(bg);
      const phaseIn = t < IN, phaseOut = t > IN + HOLD;
      const p = phaseIn ? (t / IN) * 1.2 : phaseOut ? ((t - IN - HOLD) / OUT) * 1.45 : 2;
      const refreshGlyphs = now - lastGlyphs > 45;   // glyphs flicker at ~22 fps; the cover moves every frame
      if (refreshGlyphs) { lastGlyphs = now; gctx.clearRect(0, 0, w, h); gctx.font = `${ch - 6}px ${font}`; gctx.textBaseline = "top"; }
      const px = img.data;
      for (let i = 0; i < n; i++) {
        const k = p - (phaseOut ? outAt[i] : inAt[i]);
        let cover, edge = false;
        if (phaseOut) { cover = k <= 0 ? 1 : k >= band ? 0 : 1 - k / band; edge = k > 0 && k < band; }
        else if (phaseIn) { cover = k <= 0 ? 0 : k >= band ? 1 : k / band; edge = k > 0 && k < band; }
        else cover = 1;
        const o = i * 4;
        px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = cover * 255;
        if (refreshGlyphs && (edge || (cover === 1 && Math.random() < 0.012))) {
          gctx.fillStyle = Math.random() < 0.15 ? signal : shade;
          gctx.globalAlpha = edge ? 1 : 0.7;
          gctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], (i % cols) * cw, ((i / cols) | 0) * ch + 2);
        }
      }
      gctx.globalAlpha = 1;
      mctx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(mask, 0, 0, cols * cw, rows * ch);
      ctx.drawImage(glyphLayer, 0, 0, w, h);

      if (t >= IN && !swapped) { swapped = true; swap(); }
      if (first) { first = false; document.body.classList.remove("booting"); }

      // Boot text: the title types in, ONLINE blinks with three beeps, the
      // status line fades in, the welcome types; all drift up and fade out.
      const k = t - IN;
      if (k > 0 && (!phaseOut || t < IN + HOLD + OUT * 0.55)) {
        while (beeped < beeps.length && k >= beeps[beeped]) { Sound.beep(); beeped++; }
        if (!glitchSounded && k >= GLITCH[0]) { glitchSounded = true; Sound.glitch(); }
        const outK = phaseOut ? (t - IN - HOLD) / (OUT * 0.55) : 0;
        const fade = 1 - outK, lift = outK * 16;
        const typed = (text, from, dur) => text.slice(0, Math.max(0, Math.ceil(text.length * Math.min(1, (k - from) / dur))));
        const cursor = (shown, full) => (shown.length < full.length && (now / 140 | 0) % 2 ? "▌" : "");
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const a = typed(title, 150, 750);
        // ONLINE blinks in step with the beeps.
        const blinking = beeps.some((at) => k >= at && k < at + 130);
        const shown = k > beeps[0] && k < beeps[2] + 260 && !blinking ? "UMBRA //" + " ".repeat(7) : a;
        const c = welcome ? typed(welcome, 2150, 700) : "";
        const draw = (dx, tint, alpha) => {
          ctx.globalAlpha = fade * alpha;
          ctx.font = `800 28px ${font}`;
          ctx.fillStyle = tint || signal;
          ctx.fillText(shown + cursor(a, title), w / 2 + dx, h / 2 - 34 - lift);
          ctx.globalAlpha = fade * alpha * Math.min(1, Math.max(0, (k - 1800) / 450));
          ctx.font = `11px ${font}`;
          ctx.fillStyle = tint || dim;
          ctx.fillText(sub, w / 2 + dx, h / 2 - 2 - lift);
          if (c) {
            ctx.globalAlpha = fade * alpha;
            ctx.font = `700 15px ${font}`;
            ctx.fillStyle = tint || accent || signal;
            ctx.fillText(c + cursor(c, welcome), w / 2 + dx, h / 2 + 30 - lift);
          }
        };
        const glitching = k >= GLITCH[0] && k < GLITCH[1] && Math.random() < 0.7;
        if (!glitching) draw(0, null, 1);
        else {
          // Colour-split copies either side, then the text in sliced strips
          // that jump sideways, with a few stray glyph blocks.
          const net = color("--net");
          draw(-4 - Math.random() * 4, net, 0.55);
          draw(4 + Math.random() * 4, accent, 0.55);
          const top = h / 2 - 60 - lift, bottom = h / 2 + 50 - lift, slices = 6;
          for (let i = 0; i < slices; i++) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, top + ((bottom - top) * i) / slices, w, (bottom - top) / slices);
            ctx.clip();
            draw(Math.random() < 0.5 ? 0 : (Math.random() - 0.5) * 26, null, 1);
            ctx.restore();
          }
          ctx.globalAlpha = fade * 0.8;
          ctx.font = `14px ${font}`;
          for (let i = 0; i < 6; i++) {
            ctx.fillStyle = Math.random() < 0.5 ? signal : net;
            ctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], w / 2 + (Math.random() - 0.5) * 360, top + Math.random() * (bottom - top));
          }
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
      }

      if (t < IN + HOLD + OUT) requestAnimationFrame(frame);
      else { canvas.remove(); resolve(); }
    };
    requestAnimationFrame(frame);
    if (!covered) Sound.theme();
    setTimeout(() => Sound.boot(), IN + HOLD - 250);   // Umbra's boot chime, as the screen opens
  });
}

// The start screen stays at the top of every conversation, so scrolling up
// brings the logo and the questions back, like one long page. Its animated
// background only runs while it's on screen and Umbra isn't answering.
let introVisible = false;
let easterTimer = 0, easterLoop = 0;
function clearEaster(remove = false) {
  clearTimeout(easterTimer); clearInterval(easterLoop);
  easterTimer = easterLoop = 0;
  if (remove) document.querySelector("#intro .intro-easter")?.remove();
}
function armEaster() {
  clearTimeout(easterTimer);
  const intro = $("#intro");
  if (!intro || !introVisible || !document.body.classList.contains("prompts-hidden") || chat.length || document.hidden || intro.querySelector(".intro-easter")) return;
  easterTimer = setTimeout(() => {
    if (!intro.isConnected || !introVisible || !document.body.classList.contains("prompts-hidden") || chat.length || document.hidden) return;
    const card = document.createElement("div");
    card.className = "intro-easter";
    card.innerHTML = '<span>UMBRA // FOUND A QUIET PLACE</span><canvas role="img" aria-label="Animated morning landscape"></canvas>';
    intro.querySelector(".prompts")?.after(card);
    const canvas = card.querySelector("canvas");
    const draw = () => UmbraLandscape.draw(canvas, "dawn", performance.now());
    draw();
    easterLoop = setInterval(() => {
      if (!card.isConnected) { clearInterval(easterLoop); easterLoop = 0; return; }
      if (introVisible && !document.hidden && !document.body.classList.contains("reduce-motion")) draw();
    }, 180);
    if (window.track) track("quietScene");
  }, 45000);
}
const introWatch = new IntersectionObserver(([e]) => {
  introVisible = e.isIntersecting;
  if (introVisible) { startRain(); armEaster(); } else { stopRain(); clearTimeout(easterTimer); }
});

// Puts the start screen back (for a new conversation, or at the top of an
// opened one: without the greeting) and starts its motion.
function showIntro(first = false, { greet = true } = {}) {
  clearEaster();
  if (!first) {
    stopRain();
    feed.innerHTML = "";
    feed.appendChild(introTemplate.cloneNode(true));
    if (document.body.classList.contains("prompts-hidden")) setPromptsHidden(true, false);
    if (greet) greeting = null;
    if (greet) showGreeting(); else $("#intro .greet")?.remove();
  }
  introWatch.disconnect();
  introWatch.observe($("#intro"));
  orb($("#intro-orb"), 19, 13);
  document.querySelectorAll("#intro .chip").forEach((c) => {
    c.addEventListener("mouseenter", Sound.hover);
    c.addEventListener("click", () => ask(c.textContent));
  });
  showStarters();
}
for (const event of ["pointermove", "keydown", "wheel"]) document.addEventListener(event, () => {
  if (easterTimer) armEaster();
}, { passive: true });
document.addEventListener("visibilitychange", () => { if (!document.hidden) armEaster(); });

// The suggested questions can be tucked away (remembered on this computer).
function setPromptsHidden(hide, animate = true) {
  document.body.classList.toggle("prompts-hidden", hide);
  document.body.classList.toggle("prompts-anim", animate);
  document.querySelectorAll(".prompts-toggle").forEach((b) => {
    b.textContent = hide ? "SHOW QUESTIONS ▾" : "HIDE ▴";
    b.dataset.tip = hide ? "Show the questions|Bring the suggested questions back." : "Hide the questions|Tuck the suggested questions away; show them again any time.";
  });
  try { localStorage.setItem("umbra-prompts-hidden", hide ? "1" : ""); } catch {}
  if (hide) armEaster(); else clearEaster(true);
}
document.addEventListener("click", (e) => {
  if (!e.target.closest(".prompts-toggle")) return;
  setPromptsHidden(!document.body.classList.contains("prompts-hidden"));
  Sound.click();
});
try { if (localStorage.getItem("umbra-prompts-hidden")) setPromptsHidden(true, false); } catch {}

// The start screen's suggested questions: general chat and scenario starters
// at once, then a few written from the profile,
// marked ✦, when the local AI has them ready. Every 100 seconds a fresh
// set rotates in; every so often a slow wave runs through the text.
let starterPool = { personal: [], general: [], scenario: [] }, starterShown = [], starterTurn = 0;
async function showStarters() {
  const box = $("#intro .prompts");
  if (!box) return;
  const token = ++startersToken;
  try {
    const quick = await (await fetch("/api/starters?personal=0")).json();
    if (token !== startersToken || !box.isConnected) return;
    starterPool = { personal: [], general: quick.general || [], scenario: quick.scenario || [] };
    starterTurn = 0;
    if (starterPool.scenario.length) renderStarters(false);
    if (window.offgrid) return;   // off-grid: no extra AI work
    const full = await (await fetch("/api/starters")).json();
    if (token !== startersToken || !box.isConnected) return;
    if (full.personal && full.personal.length) {
      starterPool = full;
      starterTurn = 0;
      renderStarters(true);
    }
  } catch {}
}

// Up to four personal questions (rotating through them), the rest from the
// scenario's pool, avoiding what was just on screen.
function pickStarters() {
  const { personal, general, scenario } = starterPool;
  const n = Math.min(4, personal.length);
  const mine = Array.from({ length: n }, (_, i) => personal[(starterTurn * n + i) % personal.length]);
  starterTurn++;
  const social = general.length ? [general[(starterTurn - 1) % general.length]] : [];
  const fresh = scenario.filter((t) => !starterShown.includes(t) && !mine.includes(t));
  const pool = (fresh.length >= 6 - n - social.length ? fresh : scenario.filter((t) => !mine.includes(t))).slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return [...social.map((t) => [t, false]), ...mine.map((t) => [t, true]), ...pool.slice(0, 6 - n - social.length).map((t) => [t, false])];
}

// The key words of a question are highlighted: its two most telling words
// (longest, skipping the small ones), so each question reads at a glance.
const PLAIN = new Set(("a an the and or but of to in on at by for from with about into over under is are was were be " +
  "do does did have has how what which who why when where can could should would will i me my we you your it its " +
  "this that these those some any tell give show make get let lets let's please more most good best like " +
  "there here just really very much many one two").split(" "));
function starterHTML(text) {
  const words = text.split(/(\s+)/);
  const ranked = words.map((w, i) => [w.replace(/[^\p{L}\p{N}'-]/gu, ""), i])
    .filter(([w]) => w.length > 2 && !PLAIN.has(w.toLowerCase()))
    .sort((a, b) => b[0].length - a[0].length).slice(0, 2).map(([, i]) => i);
  return words.map((w, i) => (ranked.includes(i) ? `<b>${escapeHtml(w)}</b>` : escapeHtml(w))).join("");
}

function makeChip(text, mine, i = 0) {
  const c = document.createElement("button");
  c.className = "chip" + (mine ? " mine" : "");
  c.innerHTML = `<span class="ct">${starterHTML(text)}</span>`;
  c.dataset.text = text;
  if (mine) c.title = "Suggested for you";
  c.style.animationDelay = i * 70 + "ms";
  c.addEventListener("mouseenter", Sound.hover);
  c.addEventListener("click", () => ask(text));
  return c;
}

function renderStarters(animate) {
  const box = $("#intro .prompts");
  if (!box) return;
  const items = pickStarters();
  starterShown = items.map(([t]) => t);
  const build = () => {
    box.innerHTML = "";
    items.forEach(([text, mine], i) => box.appendChild(makeChip(text, mine, i)));
    scheduleSwaps();
  };
  if (!animate || !box.children.length) { build(); return; }
  [...box.children].forEach((c, i) => { c.style.animationDelay = i * 50 + "ms"; c.classList.add("leaving"); });
  setTimeout(build, 600);
}

// Each question swaps on its own clock (every 25-55 s) for another one of
// the same kind that isn't on screen, so the set keeps changing at
// different moments instead of all at once.
let swapTimers = [];
function scheduleSwaps() {
  swapTimers.forEach(clearTimeout);
  swapTimers = [];
  const box = $("#intro .prompts");
  if (!box) return;
  [...box.children].forEach((chip) => {
    const tick = () => {
      if (!chip.isConnected) return;
      if (startersIdle() && !chip.matches(":hover")) swapChip(chip);
      swapTimers.push(setTimeout(tick, 25000 + Math.random() * 30000));
    };
    swapTimers.push(setTimeout(tick, 12000 + Math.random() * 30000));
  });
}
function swapChip(chip) {
  const mine = chip.classList.contains("mine");
  const onScreen = [...chip.parentNode.children].map((c) => c.dataset.text);
  const pool = (mine ? starterPool.personal : [...starterPool.general, ...starterPool.scenario]).filter((t) => !onScreen.includes(t));
  if (!pool.length) return;
  const text = pool[(Math.random() * pool.length) | 0];
  chip.classList.add("leaving");
  setTimeout(() => {
    if (!chip.isConnected) return;
    const fresh = makeChip(text, mine);
    fresh.style.animationDelay = "0ms";
    chip.replaceWith(fresh);
    scheduleSwaps();
  }, 450);
}

const startersIdle = () => {
  const box = $("#intro .prompts");
  return box && box.children.length && !box.matches(":hover") && !input.value && !controller
    && !document.body.classList.contains("touring") && !document.body.classList.contains("reduce-motion");
};
function starterWave() {
  if (startersIdle()) {
    $("#intro .prompts").querySelectorAll(".ct").forEach((t, i) => {
      t.classList.remove("wave");
      void t.offsetWidth;
      t.style.animationDelay = i * 160 + "ms";
      t.classList.add("wave");
    });
  }
  setTimeout(starterWave, 11000 + Math.random() * 7000);
}
setTimeout(starterWave, 8000);
showIntro(true);
// Every launch boots through the ASCII transition; "Reduce motion" skips it.
Promise.all([
  fetch("/api/settings").then((r) => r.json()).catch(() => ({})),
  fetch("/api/profile").then((r) => r.json()).catch(() => ({})),
  fetch("/api/power").then((r) => r.json()).catch(() => ({})),
]).then(([s, p, power]) => {
  const offgrid = s.offgrid === "on" || (s.offgrid === "auto" && power.battery);
  if (s.reduceMotion || offgrid) { document.body.classList.remove("booting"); Sound.launch(); return; }
  const welcome = !s.onboarded ? "" : p.name ? `WELCOME BACK, ${p.name}` : "WELCOME BACK, SURVIVOR";
  asciiWipe(() => {}, { covered: true, welcome });
});

// A short welcome for this opening. New conversations get a new line.
let greeting = null;
async function showGreeting() {
  const box = $("#intro .greet");
  if (!box) return;
  const who = box.querySelector(".gname"), line = box.querySelector(".gtext");
  const s = await fetch("/api/settings").then((r) => r.json()).catch(() => ({}));
  if (s.greeting === false || !s.onboarded) { box.remove(); return; }
  const name = await fetch("/api/profile").then((r) => r.json()).then((p) => p.name || "").catch(() => "");
  who.textContent = name ? `WELCOME BACK, ${name}` : "WELCOME, SURVIVOR";
  box.classList.add("in");
  if (window.offgrid) { line.remove(); return; }   // off-grid: no extra AI work
  if (!greeting) greeting = fetch("/api/greeting").then((r) => r.json()).catch(() => null);
  const g = await greeting;
  if (!line.isConnected) return;
  if (!g || !g.text) { line.remove(); return; }
  line.textContent = "";
  let i = 0;
  const type = () => {
    if (!line.isConnected) return;
    line.textContent = g.text.slice(0, ++i);
    if (i < g.text.length) setTimeout(type, 18);
  };
  type();
}
showGreeting();

// ------------------------------------------------------------------ dialog

// Resolves true for confirm, false for cancel, or "instant" when offered.
function confirmDialog({ kind, tag, title, body, ok, cancel, instant }) {
  return new Promise((resolve) => {
    const modal = $("#modal");
    const dialog = modal.querySelector(".dialog");
    dialog.className = "dialog " + kind;
    $("#modal-tag").textContent = tag;
    $("#modal-title").textContent = title;
    $("#modal-body").textContent = body;
    $("#modal-ok").textContent = ok || "";
    $("#modal-ok").hidden = !ok;
    $("#modal-instant").textContent = instant || "";
    $("#modal-instant").hidden = !instant;
    $("#modal-cancel").textContent = cancel;
    modal.hidden = false;
    (ok ? $("#modal-ok") : $("#modal-cancel")).focus();
    kind === "error" ? Sound.error() : Sound.click();

    const done = (value) => {
      modal.hidden = true;
      $("#modal-ok").onclick = $("#modal-cancel").onclick = $("#modal-instant").onclick = modal.onclick = null;
      document.removeEventListener("keydown", onKey, true);
      input.focus();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
    $("#modal-ok").onclick = () => done(true);
    $("#modal-instant").onclick = () => done("instant");
    $("#modal-cancel").onclick = () => done(false);
    modal.onclick = (e) => { if (e.target === modal) done(false); };
    document.addEventListener("keydown", onKey, true);
  });
}

// ------------------------------------------------------- link and network

let netTimer = null;

async function refreshNet() {
  const real = $("#t-net"), mask = $("#t-net-mask"), k = $("#t-net-k");
  try {
    const n = await (await fetch("/api/netinfo")).json();
    if (!n.online) {
      k.textContent = "NETWORK"; mask.textContent = real.textContent = "CONNECTION LOST";
      mask.style.color = real.style.color = "var(--red)";
      return;
    }
    mask.style.color = real.style.color = "";
    const name = n.name || "CONNECTED";
    real.textContent = name;
    mask.textContent = "*".repeat(Math.min(Math.max(name.length, 6), 12));
    k.textContent = `NETWORK · ${n.ms} MS`;
  } catch {
    mask.textContent = real.textContent = "UNKNOWN";
  }
}

function setOnline(value) {
  online = value;
  document.body.classList.toggle("online", online);
  $("#link-label").textContent = online ? "ONLINE" : "LOCAL";
  $("#netbanner").hidden = !online;
  $("#t-net-cell").hidden = !online;
  clearInterval(netTimer);
  if (online) { $("#t-net-mask").textContent = "********"; refreshNet(); netTimer = setInterval(refreshNet, 10000); }
}

// LINK opens the link panel (link.js): what online means, and the switch.
$("#link").addEventListener("click", () => window.UmbraLink && window.UmbraLink.open());

// -------------------------------------------------------------------- lock

// Freezes the window where it is: no scrolling, typing or clicking until the
// same button unlocks it. An answer in progress keeps streaming underneath.
// With a password (Profile), unlocking asks for it, and the shield hides the
// screen completely; without one, the lock button locks and unlocks.
let hasPassword = false;
function setLocked(value) {
  locked = value;
  document.body.classList.toggle("locked", locked);
  $("#lockshield").hidden = !locked;
  $("#lockshield").classList.toggle("secure", locked && hasPassword);
  $(".lock-form").hidden = !hasPassword;
  $(".lock-hint").textContent = hasPassword ? "Enter your password to continue" : "Unlock with the lock in the top right";
  $(".lock-error").textContent = "";
  if (locked && hasPassword) { $(".lock-pass").value = ""; setTimeout(() => $(".lock-pass").focus(), 60); }
  $("#lock-icon").textContent = locked ? "󰌾" : "󰌿";
  $("#lock").classList.toggle("on", locked);
  $("#lock").title = locked ? "Unlock" : "Lock the screen";
  hidePop();
  if (locked) {
    $("#themes").hidden = $("#library").hidden = true; $("#theme-btn").classList.remove("on"); $("#library-btn").classList.remove("on");
    if (!hasPassword) document.activeElement?.blur();
    Sound.lock();
  }
  else { input.focus(); Sound.unlock(); }
}
$("#lock").addEventListener("click", () => {
  if (locked && hasPassword) { $(".lock-pass").focus(); return; }   // the password unlocks, not the button
  setLocked(!locked);
});
$(".lock-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const field = $(".lock-pass");
  const r = await fetch("/api/unlock", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: field.value }),
  }).then((x) => x.json()).catch(() => ({}));
  if (r.ok) { field.value = ""; setLocked(false); }
  else { $(".lock-error").textContent = "Wrong password"; field.value = ""; field.focus(); Sound.error(); }
});
// With a password, Umbra starts locked.
window.refreshPasswordLock = async (lockNow = false) => {
  hasPassword = !!(await fetch("/api/lock").then((r) => r.json()).catch(() => ({}))).password;
  if (lockNow && hasPassword) setLocked(true);
};
window.refreshPasswordLock(true);

// While locked, swallow keys before anything else sees them.
document.addEventListener("keydown", (e) => {
  if (!locked) return;
  if (document.activeElement === $("#lock") && (e.key === "Enter" || e.key === " ")) return;
  if (document.activeElement === $(".lock-pass")) return;   // typing the password
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);

// ---------------------------------------------------------------- markdown

// Puts text on the clipboard (true when it worked).
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const t = document.createElement("textarea");
  t.value = text; t.style.cssText = "position:fixed;opacity:0;left:-99px";
  document.body.appendChild(t); t.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch {}
  t.remove();
  return ok;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function inline(s) {
  // One pass keeps markdown inside inline code literal and prevents emphasis
  // from consuming adjacent words while a response is still streaming.
  return s.replace(/`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\s][^*\n]*?)\*|\[(\d+(?:\s*,\s*\d+)*)\]/g,
    (_, code, strong, emphasis, nums) => {
      if (code !== undefined) return `<code>${code}</code>`;
      if (strong !== undefined) return `<strong>${strong}</strong>`;
      if (emphasis !== undefined) return `<em>${emphasis}</em>`;
      return nums.split(/\s*,\s*/).map((n) => `<span class="cite" data-n="${n}">${n}</span>`).join("");
    });
}

// Small, forgiving renderer: it runs while an answer types out, so
// half-written markdown must still render sensibly.
function renderMarkdown(src) {
  const lines = escapeHtml(src).split("\n");
  let out = "", list = null, itemOpen = false, para = [], code = null;
  // Keep numbering through blank lines; start a new sequence after prose.
  let lastNum = 0;
  const flushPara = () => { if (para.length) { out += `<p>${inline(para.join(" "))}</p>`; para = []; } };
  const closeItem = () => { if (itemOpen) { out += "</li>"; itemOpen = false; } };
  const closeList = () => { if (list) { closeItem(); out += `</${list}>`; list = null; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("```")) {
      if (code === null) { flushPara(); closeList(); code = []; }
      else { out += `<pre>${code.join("\n")}</pre>`; code = null; }
      continue;
    }
    if (code !== null) { code.push(raw); continue; }

    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)/))) {
      flushPara(); closeList(); lastNum = 0;
      out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
    } else if ((m = line.match(/^\s*(?:[-*•])\s+(.*)/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      flushPara();
      const kind = /^\s*\d/.test(line) ? "ol" : "ul";
      if (list !== kind) { closeList(); out += `<${kind}>`; list = kind; }
      closeItem();
      if (kind === "ol") {
        const n = parseInt(line, 10);
        lastNum = n <= lastNum ? lastNum + 1 : n;
        out += `<li value="${lastNum}">${inline(m[1])}`;
      } else out += `<li>${inline(m[1])}`;
      itemOpen = true;
    } else if (!line.trim()) {
      flushPara();
    } else if (/^\s{2,}\S/.test(raw) && itemOpen) {
      out += `<br>${inline(line.trim())}`;
    } else {
      closeList(); lastNum = 0; para.push(line.trim());
    }
  }
  if (code !== null) out += `<pre>${code.join("\n")}</pre>`;
  flushPara(); closeList();
  return out;
}

// The model ends with an upper-case "NEXT: <question>" line that becomes the
// follow-up button, so it is hidden from the answer. Upper case only: a
// "Next:" inside the answer is part of the answer. While streaming, a
// half-arrived "NE" at the very end is held back too.
function visibleAnswer(text, live) {
  let out = text.replace(/(^|\s)[*_]*NEXT\s*:[\s\S]*$/, "$1");
  out = out.replace(/\s?\[n\]/g, "");   // a literal "[n]" copied from the citation rule
  if (live) out = out.replace(/(^|\s)N(E(X(T)?)?)?$/, "$1");
  return out.trimEnd();
}

// ------------------------------------------------------------- smoothness

// Tokens arrive in bursts; the typewriter reveals them at a steady pace that
// speeds up only as the backlog grows, so text flows instead of jumping.
// Repaints are capped at ~30 per second to keep CPU drawing light.
function typewriter(render) {
  let target = "", shown = 0, carry = 0, raf = 0, lastPaint = 0, waiters = [];
  const tick = (ts) => {
    const backlog = target.length - shown;
    if (backlog > 0) {
      carry += Math.max(0.8, backlog / 22);
      const step = Math.floor(carry);
      if (step > 0 && ts - lastPaint >= 33) {
        carry -= step;
        shown = Math.min(target.length, shown + step);
        lastPaint = ts;
        render(target.slice(0, shown));
        wake();
      }
    }
    if (shown < target.length) raf = requestAnimationFrame(tick);
    else { raf = 0; waiters.splice(0).forEach((w) => w()); }
  };
  return {
    set(text) { target = text; if (shown > target.length) shown = target.length; if (!raf) raf = requestAnimationFrame(tick); },
    drained() { return new Promise((r) => (shown >= target.length ? r() : waiters.push(r))); },
  };
}

// Follow new content with an eased scroll, unless the user scrolled up to
// read; coming back to the bottom resumes following. The loop sleeps when
// there is nothing to catch up on.
let follow = true, followRaf = 0;
function pinBottom() { feed.scrollTop = Math.max(0, feed.scrollHeight - feed.clientHeight); }
function resetChatScroll() {
  follow = false;
  cancelAnimationFrame(followRaf);
  followRaf = 0;
  feed.scrollTop = 0;
}
function followChatBottom() { follow = true; pinBottom(); requestAnimationFrame(pinBottom); }
function wake() { if (!followRaf) followRaf = requestAnimationFrame(followLoop); }
function followLoop() {
  followRaf = 0;
  if (!follow || locked) return;
  const gap = feed.scrollHeight - feed.clientHeight - feed.scrollTop;
  if (gap > 0.5) {
    feed.scrollTop += Math.max(1, gap * 0.18);
    followRaf = requestAnimationFrame(followLoop);
  }
}
// Only a user's scroll gesture can stop following. Layout changes and browser
// scroll anchoring can move scrollTop without the user asking to read above.
let lastTop = 0, touchY = null, draggingScroll = false;
feed.addEventListener("wheel", (e) => { if (e.deltaY < 0) follow = false; }, { passive: true });
feed.addEventListener("touchstart", (e) => { touchY = e.touches[0]?.clientY ?? null; }, { passive: true });
feed.addEventListener("touchmove", (e) => {
  const y = e.touches[0]?.clientY;
  if (y != null && touchY != null && y > touchY) follow = false;
  touchY = y;
}, { passive: true });
feed.addEventListener("pointerdown", (e) => {
  draggingScroll = e.clientX >= feed.getBoundingClientRect().right - 16;
  if (draggingScroll) follow = false;
});
document.addEventListener("pointerup", () => { draggingScroll = false; });
feed.addEventListener("keydown", (e) => { if (["ArrowUp", "PageUp", "Home"].includes(e.key)) follow = false; });
feed.addEventListener("scroll", () => {
  const top = feed.scrollTop;
  if (draggingScroll && top < lastTop - 1) follow = false;
  if (top > lastTop && feed.scrollHeight - feed.clientHeight - top < 40) follow = true;
  lastTop = top;
}, { passive: true });
new ResizeObserver(() => { if (follow && !locked) requestAnimationFrame(pinBottom); }).observe(feed);
window.addEventListener("resize", () => { if (follow) requestAnimationFrame(pinBottom); });

// ----------------------------------------------------------- source popups

const pop = $("#pop");
function showPop(s, anchor) {
  if (locked) return;
  $("#pop-n").textContent = s.n;
  const kind = $("#pop-kind");
  kind.textContent = s.kind === "manual" ? "FIELD MANUAL" : s.kind === "core" ? "BUILT-IN NOTE" : s.kind === "local" ? "LOCAL ARCHIVE" : s.kind === "linked" ? "LINKED FILE" : "WIKIPEDIA ↗";
  kind.className = "pop-kind " + s.kind;
  $("#pop-title").textContent = s.title;
  $("#pop-archive").textContent = s.kind === "wiki" ? "Opens in your browser" : s.archive;
  $("#pop-summary").textContent = s.summary || "";
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
  const top = r.top - h - 10 > 8 ? r.top - h - 10 : r.bottom + 10;
  pop.style.left = left + "px";
  pop.style.top = top + "px";
  Sound.hover();
}
function hidePop() { pop.hidden = true; }
feed.addEventListener("scroll", hidePop, { passive: true });

function bindSource(el, s) {
  el.addEventListener("mouseenter", () => showPop(s, el));
  el.addEventListener("mouseleave", hidePop);
  el.addEventListener("click", () => { hidePop(); Sound.click(); openSource(s); });
}

// ---------------------------------------------------------------- tooltips

// Themed hover labels instead of the browser's plain ones: every title
// attribute (also ones set later) becomes data-tip, shown in a framed box.
const tip = document.createElement("div");
tip.className = "tip";
tip.hidden = true;
document.body.appendChild(tip);
let tipTimer = 0, tipFor = null;

function tipify(el) {
  if (el.tagName === "IFRAME" || !el.hasAttribute("title")) return;
  el.dataset.tip = el.getAttribute("title");
  if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", el.dataset.tip.replace("|", ": "));
  el.removeAttribute("title");
  if (el === tipFor && !tip.hidden) setTip(el.dataset.tip);
}
// "Name|explanation" shows the name, then a line explaining it.
function setTip(text) {
  const [name, more] = text.split("|");
  tip.classList.toggle("rich", !!more);
  if (!more) { tip.textContent = text; return; }
  tip.innerHTML = "<b></b><span></span>";
  tip.firstChild.textContent = name;
  tip.lastChild.textContent = more;
}
document.querySelectorAll("[title]").forEach(tipify);
new MutationObserver((changes) => changes.forEach((c) => {
  if (c.type === "attributes") tipify(c.target);
  else c.addedNodes.forEach((n) => {
    if (n.nodeType !== 1) return;
    tipify(n);
    n.querySelectorAll("[title]").forEach(tipify);
  });
})).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });

function hideTip() { clearTimeout(tipTimer); tip.hidden = true; tipFor = null; }
document.addEventListener("mouseover", (e) => {
  const el = e.target.closest("[data-tip]");
  if (el === tipFor) return;
  hideTip();
  if (!el || locked || el.matches(".controls .ctl")) return;
  tipFor = el;
  tipTimer = setTimeout(() => {
    if (!el.isConnected || !el.dataset.tip) return;
    setTip(el.dataset.tip);
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let below = r.bottom + 8 + h < innerHeight - 4;
    let left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    // Umbra Online: the browser is drawn above the page, so a label that
    // would land on it goes above its button, or beside the browser.
    const web = window.UmbraWeb?.area?.();
    if (web) {
      const hits = (top) => !(left + w <= web.left || left >= web.right || top + h <= web.top || top >= web.bottom);
      if (hits(below ? r.bottom + 8 : r.top - h - 8)) below = !below;
      if (hits(below ? r.bottom + 8 : r.top - h - 8) && r.left >= web.right - 4) left = Math.min(innerWidth - w - 8, Math.max(left, web.right + 8));
      if (!below && r.top - h - 8 < 4) below = true;
    }
    tip.style.left = left + "px";
    tip.style.top = (below ? r.bottom + 8 : r.top - h - 8) + "px";
    tip.classList.toggle("above", !below);
  }, 380);
});
document.addEventListener("mouseout", (e) => { if (tipFor && !tipFor.contains(e.relatedTarget)) hideTip(); });
["mousedown", "keydown", "wheel"].forEach((ev) => document.addEventListener(ev, hideTip, true));

// ------------------------------------------------------------------- feed

function addUser(text, wasOnline = online, stamp = Date.now(), offset) {
  const el = document.createElement("div");
  el.className = "msg user";
  const me = (window.UmbraProfile && window.UmbraProfile.data) || {};
  el.innerHTML = `<div class="label">${me.picture ? '<img class="avatar" alt="">' : ""}<span class="who"></span><time class="msg-time"></time>${wasOnline ? " · ONLINE" : ""}</div><div class="body"></div>`;
  el.querySelector(".msg-time").textContent = Number.isFinite(stamp) ? umbraClockLabel(stamp, offset) : "";
  el.querySelector(".who").textContent = (me.name || "YOU") + (me.callsign ? ` · ${me.callsign}` : "");
  if (me.color) el.querySelector(".who").style.color = `var(--${me.color})`;
  // Rewards from the Locker: a name effect and a title.
  const fx = (window.prefs && window.prefs.nameFx) || "plain";
  el.querySelector(".who").classList.add("fx-" + fx);
  const title = window.prefs && window.prefs.title;
  const achievements = window.UmbraAchievements?.data;
  const titled = title && title !== "none" && achievements && (achievements.rewards || []).find((r) => r.id === title);
  if (titled) {
    const rankTitle = !!titled.unlock?.rank;
    const label = rankTitle ? achievements.rank : titled.name;
    el.querySelector(".who").insertAdjacentHTML("beforebegin", `<span class="title-tag${rankTitle ? " rank-tag" : ""}">${escapeHtml(label.toUpperCase())}</span>`);
  }
  if (me.picture) el.querySelector(".avatar").src = me.picture;
  el.querySelector(".body").textContent = text;
  feed.appendChild(el);
}
window.updateChatRank = () => {
  const rank = window.UmbraAchievements?.data?.rank;
  if (rank) document.querySelectorAll(".msg.user .rank-tag").forEach(el => { el.textContent = rank.toUpperCase(); });
};

// UMBRA, plus which personality is talking, so a conversation shows who
// said what even when the loadout changes midway.
function addBot(persona = window.loadoutPersona || "", stamp = Date.now(), offset) {
  const el = document.createElement("div");
  el.className = "msg bot";
  const who = persona && persona.toLowerCase() !== "umbra" ? ` <span class="persona"></span>` : "";
  el.innerHTML = `<div class="label"><span class="spin" data-spin>✻</span> UMBRA${who}<time class="msg-time"></time></div>
    <div class="card"><div class="answer"></div></div>`;
  el.querySelector(".msg-time").textContent = Number.isFinite(stamp) ? umbraClockLabel(stamp, offset) : "";
  if (who) el.querySelector(".persona").textContent = `(${persona.toUpperCase()})`;
  feed.appendChild(el);
  return el;
}

// The waiting state: a little scene, the current step in a themed line,
// and a rotating field note underneath.
function showWaiting(answerEl) {
  answerEl.innerHTML = `<div class="waiting"><pre class="wart"></pre>
    <div class="wcol">
      <span><span class="spin" data-spin>✻</span> <span class="wtext">${PHASE_TEXT.search}…</span></span>
      <span class="wnote"><span class="narrow">↳ FIELD NOTE</span> <span class="ntext"></span></span>
    </div></div>`;
  setWaitingArt(answerEl, "search");
  startNotes(answerEl);
}
function setWaitingText(answerEl, text) {
  const w = answerEl.querySelector(".wtext");
  if (w) w.textContent = text;
}

function openSource(s) {
  if (window.track) track("sources");
  if (s.kind === "manual") openManual(String(s.url).replace(/^manual:/, ""));
  else if (s.kind === "core") {
    $("#reader-title").textContent = `${s.title} · ${s.archive}`;
    $("#reader-frame").hidden = true;
    $("#reader-doc").hidden = false;
    $("#reader-doc").textContent = s.summary || "";
    $("#reader").hidden = false;
  }
  else if (s.kind === "local") openReader(s);
  else if (s.kind === "linked") fetch("/api/library/open-linked", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: s.url }) });
  else fetch("/api/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: s.url }) });
}

// One quiet line under the answer; the full list folds out on click.
function renderSources(card, sources) {
  if (!sources.length) return;
  const line = document.createElement("button");
  line.className = "srcline";
  line.innerHTML = `<span class="arrow">▸</span>${sources.length} SOURCE${sources.length === 1 ? "" : "S"}`;
  const list = document.createElement("div");
  list.className = "srclist";
  for (const s of sources) {
    const row = document.createElement("button");
    row.className = "srcrow";
    row.innerHTML = `<span class="n">${s.n}</span><span class="t"></span><span class="kind"></span>`;
    row.querySelector(".t").textContent = s.title;
    const kind = row.querySelector(".kind");
    kind.textContent = s.kind === "manual" ? "MANUAL" : s.kind === "core" ? "BUILT-IN" : s.kind === "local" ? "LOCAL" : s.kind === "linked" ? "LINKED FILE" : "WIKIPEDIA ↗";
    kind.classList.add(s.kind);
    bindSource(row, s);
    list.appendChild(row);
  }
  line.addEventListener("click", () => {
    line.classList.toggle("open");
    list.classList.toggle("open");
    Sound.click();
    if (list.classList.contains("open")) setTimeout(wake, 320);
  });
  card.append(line, list);
}

// Umbra's closing offer, in its own words; clicking it accepts.
function renderNext(answerEl, offer) {
  const p = document.createElement("p");
  p.className = "offer";
  p.innerHTML = `<span class="otext"></span><span class="ohint">yes, please ⏎</span>`;
  p.querySelector(".otext").textContent = offer;
  p.addEventListener("mouseenter", Sound.hover);
  p.addEventListener("click", () => {
    if (controller || p.classList.contains("taken")) return;
    p.classList.add("taken");
    ask(`Yes, please: ${offer}`, "Yes, please.");
  });
  answerEl.appendChild(p);
}

// Draws answer text with hoverable citations.
function paintAnswer(answerEl, shown, sourceByN, live = false) {
  answerEl.innerHTML = renderMarkdown(shown) + (live ? '<span class="cursor"></span>' : "");
  answerEl.querySelectorAll(".cite").forEach((c) => {
    const s = sourceByN[c.dataset.n];
    if (s) { bindSource(c, s); return; }
    // A number with no source behind it is the model's slip, not a citation.
    const before = c.previousSibling;
    if (before && before.nodeType === Node.TEXT_NODE) before.textContent = before.textContent.replace(/\s+$/, "");
    c.remove();
  });
}

// A finished answer: text, sources, Umbra's offer and the meta line. Used
// for new answers and for conversations reopened from History.
function finishAnswer(msg, rec) {
  const answerEl = msg.querySelector(".answer");
  const card = msg.querySelector(".card");
  if (rec.contextNote && !card.querySelector(".context-note")) {
    const n = document.createElement("div");
    n.className = "context-note";
    n.textContent = rec.contextNote;
    card.prepend(n);
  }
  const byN = {};
  rec.sources.forEach((s) => (byN[s.n] = s));
  paintAnswer(answerEl, rec.answer, byN);
  if (rec.scene && window.UmbraChill && !msg.querySelector(".chat-scene")) UmbraChill.render(card, rec.scene);
  if (rec.sky && window.UmbraSky) UmbraSky.render(card);
  msg.querySelector(".label .spin")?.remove();
  renderSources(card, rec.sources);
  if (rec.offer) renderNext(answerEl, rec.offer);
  if (window.UmbraTools && rec.question) UmbraTools.renderTools(answerEl, rec);
  if (rec.meta) {
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = rec.meta;
    card.appendChild(m);
  }
}

// -------------------------------------------------------------- phases UI

function setPhase(name) {
  phaseBox.hidden = false;
  const idx = PHASES.indexOf(name);
  phaseBox.querySelectorAll("[data-step]").forEach((el) => {
    const i = PHASES.indexOf(el.dataset.step);
    el.className = i < idx ? "done" : i === idx ? "active" : "";
  });
}

function startTimer() {
  const t0 = performance.now();
  elapsedEl.textContent = "0.0s";
  timer = setInterval(() => { elapsedEl.textContent = ((performance.now() - t0) / 1000).toFixed(1) + "s"; }, 100);
}

function stopWorking() {
  clearInterval(timer);
  phaseBox.hidden = true;
  controller = null;
  startRain();   // if the start screen is in view
  if (window.UmbraAchievements) UmbraAchievements.check();   // an answer can unlock something
  send.classList.remove("stop");
  send.innerHTML = "TRANSMIT <kbd>⏎</kbd>";
  refreshStatus();
  if (!locked) input.focus();
}

// ------------------------------------------------------------------- ask

// What only this window knows (kept in its local storage): training
// scores, the patient being cared for, running first-aid timers. Sent with
// each question so Umbra can take it into account.
function localContext() {
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
  const out = {};
  const train = get("umbra-train-score");
  if (train) out.training = Object.fromEntries(Object.entries(train).filter(([, v]) => v && v.points));
  const p = get("umbra-medic-patient");
  if (p && ((p.log && p.log.length) || Object.keys(p.marks || {}).length || p.mech)) {
    const marks = Object.entries(p.marks || {}).map(([k, v]) => `${v} ${k.split(":")[1]} (${k.split(":")[0]})`).join(", ");
    const last = (p.log || []).slice(-4).map((e) => `${new Date(e.t).toTimeString().slice(0, 5)} ${[e.p && "pulse " + e.p, e.r && "breaths " + e.r, e.a && "AVPU " + e.a, e.n].filter(Boolean).join(", ")}`).join("; ");
    out.patient = [p.age && `age ${p.age}`, p.sex, p.mech && `what happened: ${p.mech}`, marks && `injuries: ${marks}`, last && `log: ${last}`].filter(Boolean).join("; ");
  }
  const timers = get("umbra-fk-timers");
  if (Array.isArray(timers) && timers.length) out.timers = timers.map((t) => `${t.name} since ${new Date(t.at).toTimeString().slice(0, 5)}`);
  return out;
}

async function ask(question, shownAs = "") {
  if (controller || locked || !question.trim() || document.body.classList.contains("touring")) return;
  stopRain();   // the start screen stays above the conversation, resting while Umbra works
  document.body.classList.remove("model-pending");
  suggestToken++;
  setSuggestion("");
  // Files from the paperclip go along with this question (their names show under it).
  const attachments = window.UmbraAttach ? UmbraAttach.take() : [];
  const userAt = Date.now();
  const clockOffsetMinutes = Number(window.prefs?.clockOffsetMinutes) || 0;
  addUser((shownAs || question) + (attachments.length ? "\n" + attachments.map((a) => `\u{F03E2} ${a.name}`).join("   ") : ""), online, userAt, clockOffsetMinutes);
  const msg = addBot();
  const card = msg.querySelector(".card");
  const answerEl = msg.querySelector(".answer");
  showWaiting(answerEl);
  follow = true;
  pinBottom();
  requestAnimationFrame(pinBottom);
  wake();
  Sound.searchstart();
  Sound.hum(true);

  controller = new AbortController();
  send.classList.add("stop");
  send.textContent = "STOP ■";
  const st = $("#t-status");
  st.textContent = "WORKING"; st.className = "v busy";
  startTimer();
  setPhase("search");

  let text = "", sources = [], next = "", meta = null, completed = false, failure = "", stopped = false, writing = false, contextNote = "", skyRequested = false, pageSent = undefined;
  const sourceByN = {};
  const typer = typewriter((shown) => paintAnswer(answerEl, shown, sourceByN, true));

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: chat, conversation: window.currentConversationId || "", online, offgrid: !!window.offgrid, folder: window.currentFolder || "", context: localContext(), attachments, page: (pageSent = window.UmbraWeb?.pageFor?.()) }),
      signal: controller.signal,
    });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        const e = JSON.parse(line);
        if (e.type === "phase") {
          setPhase(e.phase);
          if (!writing) { startQuips(answerEl, e.phase); setWaitingArt(answerEl, e.phase); }
        } else if (e.type === "notice") {
          const n = document.createElement("div");
          n.className = "notice";
          n.textContent = "⚠ " + e.message;
          card.prepend(n);
        } else if (e.type === "context" || e.type === "model") {
          if (e.type === "model" && /AI (?:DOWNLOAD IN PROGRESS|MODEL NEEDED)/.test(e.message)) document.body.classList.add("model-pending");
          contextNote = contextNote ? contextNote + " · " + e.message : e.message;
          let n = card.querySelector(".context-note");
          if (!n) { n = document.createElement("div"); n.className = "context-note"; card.prepend(n); }
          n.textContent = contextNote;
        } else if (e.type === "sky") {
          skyRequested = true;
        } else if (e.type === "sources") {
          sources = e.sources;
          sources.forEach((s) => (sourceByN[s.n] = s));
        } else if (e.type === "token") {
          if (!writing) { stopWaiting(); Sound.hum(false); Sound.found(); }
          writing = true;
          text += e.text;
          typer.set(visibleAnswer(text, true));
        } else if (e.type === "next") {
          next = e.text;
        } else if (e.type === "done") {
          meta = e;
        } else if (e.type === "complete") {
          completed = true;
        } else if (e.type === "error") {
          failure = e.message || "The answer was interrupted.";
        }
      }
    }
  } catch (err) {
    stopped = err.name === "AbortError";
    if (!stopped) failure = err.message || "The connection was interrupted.";
  }

  Sound.hum(false);
  stopWaiting();
  let shown = visibleAnswer(text, false);
  if (!shown) {
    shown = stopped
      ? "*Stopped.*"
      : !completed || failure ? "*Reply interrupted before I could answer. Please try again.*"
      : "Sorry, I lost my train of thought there. Could you ask that again, maybe in a few more words?";
  } else if (stopped) shown += "\n\n*[transmission stopped]*";
  else if (!completed || failure) shown += "\n\n*Reply interrupted. Ask me to continue and I’ll pick up from here.*";
  if (!stopped) { typer.set(shown); await typer.drained(); }
  const rec = {
    question, shown: shownAs, answer: shown, rawAnswer: text || shown,
    offer: stopped || !completed || failure ? "" : next, sources, online, contextNote,
    userAt, answerAt: Date.now(), clockOffsetMinutes, sky: skyRequested,
    scene: !stopped && window.UmbraChill ? UmbraChill.select(question, chat.length / 2, { answer: shown, sky: skyRequested, failed: !completed || failure, history: chat, page: !!pageSent }) : "",
    persona: window.loadoutPersona || "",
    meta: stopped ? "" : !completed || failure ? "INTERRUPTED · " + (online ? "ONLINE" : "OFFLINE")
      : meta ? `${meta.tokens} TOKENS · ${meta.seconds}s · ${sources.length} SOURCES · ${online ? "ONLINE" : "OFFLINE"}` : "",
  };
  finishAnswer(msg, rec);
  msg.querySelector(".msg-time").textContent = umbraClockLabel(rec.answerAt, clockOffsetMinutes);
  chat.push({ role: "user", content: question }, { role: "assistant", content: text || shown });
  if (window.recordTurn) window.recordTurn(rec);
  if (!document.hasFocus() && (!window.prefs || window.prefs.barAlert !== false)) setAttention(true);
  if (!stopped && completed && !failure) suggestFor(rec);
  stopped || !completed || failure ? Sound.error() : Sound.done();
  stopWorking();
  wake();
}

// ------------------------------------------------------------------ reader

// ------------------------------------------------------------------ leaving

// The outro, a variation of the boot: the glyph wave closes in from the
// edges, UMBRA // OFFLINE types in and blinks, the farewell appears, then
// everything collapses into a bright line and a dot, like an old screen
// switching off.
function asciiOutro(farewell, { keep = true } = {}) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.className = "wipe";
    document.body.appendChild(canvas);
    const glyphs = "░▒▓█#%&@*+=:·アイウエオカキクケコ0123456789".split("");
    // Far cells close first, so the dark closes in on the centre: the
    // chosen style, played in reverse (it closes where the boot opens).
    const style = transition();
    const grid = glyphGrid(canvas, (cols, rows) => {
      const at = new Float32Array(cols * rows);
      for (let i = 0; i < cols * rows; i++) {
        const x = (i % cols) / cols, y = ((i / cols) | 0) / rows;
        at[i] = 1.2 - style.out(x, y, rows);
      }
      return at;
    });
    // The farewell stays fully on screen for about two seconds before the switch-off.
    const CLOSE = 1100, HOLD = 3600, COLLAPSE = 650, FADE = 300, band = 0.2;
    const title = "UMBRA // OFFLINE", sub = "HISTORY SAVED · SETTINGS KEPT · STAY SAFE";
    const color = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    const rgb = (c) => {
      const m = c.match(/^#([0-9a-f]{6})$/i);
      return m ? [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) : [9, 9, 9];
    };
    const start = performance.now();
    let lastGlyphs = 0, beeped = 0;
    const beeps = [950, 1200];
    setTimeout(() => Sound.shutdown(), CLOSE + HOLD + COLLAPSE - 1900);   // the reversed chime ends as the screen goes out

    const frame = (now) => {
      const t = now - start;
      if (grid.fit()) lastGlyphs = 0;
      const { w, h, cw, ch, cols, rows, n, ctx, mask, mctx, img, layer, lctx, at } = grid;
      const [bg, signal, shade, dim, accent, font] = ["--bg", "--signal", "--shade-2", "--dim", "--accent", "--font"].map(color);
      ctx.clearRect(0, 0, w, h);
      if (t < CLOSE + HOLD) {
        // The closing wave, then darkness with a few embers.
        const p = t < CLOSE ? (t / CLOSE) * 1.45 : 2;
        const [r, g, b] = rgb(bg);
        const px = img.data;
        const refresh = now - lastGlyphs > 45;
        if (refresh) { lastGlyphs = now; lctx.clearRect(0, 0, w, h); lctx.font = `${ch - 6}px ${font}`; lctx.textBaseline = "top"; }
        for (let i = 0; i < n; i++) {
          const k = p - at[i];
          const cover = k <= 0 ? 0 : k >= band ? 1 : k / band;
          const o = i * 4;
          px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = cover * 255;
          if (refresh && ((k > 0 && k < band) || (cover === 1 && Math.random() < 0.01))) {
            lctx.fillStyle = Math.random() < 0.15 ? signal : shade;
            lctx.fillText(glyphs[(Math.random() * glyphs.length) | 0], (i % cols) * cw, ((i / cols) | 0) * ch + 2);
          }
        }
        mctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(mask, 0, 0, cols * cw, rows * ch);
        ctx.drawImage(layer, 0, 0, w, h);
      } else {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, w, h);
      }

      // The text, typed in; in the collapse it is squashed with everything.
      const k = t - CLOSE;
      const collapse = t > CLOSE + HOLD ? Math.min(1, (t - CLOSE - HOLD) / COLLAPSE) : 0;
      if (k > 0 && collapse < 1) {
        while (beeped < beeps.length && k >= beeps[beeped]) { Sound.beep(); beeped++; }
        const typed = (text, from, dur) => text.slice(0, Math.max(0, Math.ceil(text.length * Math.min(1, (k - from) / dur))));
        const blink = beeps.some((b) => k >= b && k < b + 120);
        const a = typed(title, 100, 700);
        const shown = k > beeps[0] - 100 && k < beeps[1] + 240 && !blink ? "UMBRA //" + " ".repeat(8) : a;
        ctx.save();
        ctx.translate(w / 2, h / 2);
        ctx.scale(1 + collapse * 0.4, Math.max(0.02, 1 - collapse * 1.1));
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = `800 28px ${font}`;
        ctx.fillStyle = signal;
        ctx.fillText(shown, 0, -34);
        ctx.globalAlpha = Math.min(1, Math.max(0, (k - 1250) / 400));
        ctx.font = `11px ${font}`;
        ctx.fillStyle = dim;
        ctx.fillText(sub, 0, -2);
        ctx.globalAlpha = 1;
        const f = typed(farewell, 1500, 500);
        if (f) {
          ctx.font = `700 15px ${font}`;
          ctx.fillStyle = accent || signal;
          ctx.fillText(f, 0, 30);
        }
        ctx.restore();
      }
      // The switch-off: a bright line that narrows to a dot and fades.
      if (collapse > 0) {
        const end = t - CLOSE - HOLD - COLLAPSE;
        const lineW = collapse < 0.7 ? w * 0.8 : w * 0.8 * Math.max(0.004, 1 - (collapse - 0.7) / 0.3);
        const lineH = 2 + 6 * (1 - collapse);   // a thin line that brightens as the text flattens into it
        ctx.globalAlpha = end > 0 ? Math.max(0, 1 - end / FADE) : Math.min(1, 0.25 + collapse);
        ctx.fillStyle = signal;
        ctx.shadowColor = signal;
        ctx.shadowBlur = 18;
        ctx.fillRect(w / 2 - lineW / 2, h / 2 - lineH / 2, lineW, lineH);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
      if (t < CLOSE + HOLD + COLLAPSE + FADE) requestAnimationFrame(frame);
      else {
        if (!keep) canvas.remove();   // a preview; when leaving, the canvas stays while the window closes
        resolve();
      }
    };
    requestAnimationFrame(frame);
  });
}

// Closing the window lands here (the launcher asks before closing). Umbra
// asks once, since everything is already saved, then plays the outro and
// tells the window to close. A second close request goes straight out.
let exitAsked = false, exiting = false;
function closeWindow() {
  if (!window.umbraNative("close")) window.close();
}
async function leaveUmbra(instant = false) {
  if (exiting) return;
  exiting = true;
  if (controller) controller.abort();
  Sound.hum(false);
  $("#modal").hidden = true;
  const calm = document.body.classList.contains("reduce-motion");
  if (!instant && !calm) {
    const name = (window.UmbraProfile && window.UmbraProfile.data.name) || "";
    await asciiOutro(name ? `SEE YOU SOON, ${name}` : "SEE YOU SOON, SURVIVOR");
  }
  closeWindow();
}
// Settings previews.
window.previewTransition = async (which) => {
  const name = (window.UmbraProfile && window.UmbraProfile.data.name) || "SURVIVOR";
  if (which === "outro") await asciiOutro(`SEE YOU SOON, ${name}`, { keep: false });
  else await asciiWipe(() => {}, { welcome: `WELCOME BACK, ${name}` });
};

window.umbraExit = () => {
  if (exiting) return "ok";
  if (exitAsked || (window.prefs && window.prefs.confirmExit === false)) { leaveUmbra(); return "ok"; }
  exitAsked = true;
  confirmDialog({
    kind: "to-local", tag: "LEAVE", title: "LEAVE UMBRA?",
    body: "Everything is saved on this computer: your conversations stay in History, and your settings and profile " +
      "stay as they are." + (controller ? "\n\nThe answer in progress will stop." : ""),
    ok: "LEAVE", cancel: "STAY", instant: "INSTANT EXIT",
  }).then((choice) => { exitAsked = false; if (choice) leaveUmbra(choice === "instant"); });
  return "ok";
};

// ------------------------------------------------------- export and save

// Where to save: the Documents folder, or a USB stick when one is plugged
// in (asked only then). Resolves with a target id, or null if cancelled.
async function chooseTarget(what) {
  const list = await fetch("/api/drives").then((r) => r.json()).catch(() => []);
  if (list.length <= 1) return "documents";
  return new Promise((resolve) => {
    const shade = document.createElement("div");
    shade.className = "modal picker";
    shade.innerHTML = `<div class="dialog to-local"><div class="dialog-tag">SAVE TO</div><h2></h2>
      <div class="picker-list"></div><div class="dialog-actions"><button class="ghost">CANCEL</button></div></div>`;
    shade.querySelector("h2").textContent = `WHERE SHOULD ${what.toUpperCase()} GO?`;
    const done = (v) => { shade.remove(); resolve(v); };
    list.forEach((d) => {
      const b = document.createElement("button");
      b.className = "picker-item";
      b.innerHTML = `<b>${d.id === "documents" ? "󰉋" : "󱊟"} ${escapeHtml(d.name)}</b><small>${escapeHtml(d.path)}</small>`;
      b.addEventListener("click", () => { Sound.click(); done(d.id); });
      shade.querySelector(".picker-list").appendChild(b);
    });
    shade.querySelector(".ghost").addEventListener("click", () => done(null));
    shade.addEventListener("click", (e) => { if (e.target === shade) done(null); });
    document.body.appendChild(shade);
    Sound.click();
  });
}

// Export (a conversation, all of them, or the field manual) or back up,
// then say where it went, with a button to open the folder.
async function exportTo(payload, label, endpoint = "/api/export") {
  const target = await chooseTarget(label);
  if (!target) return;
  const send = (open) => fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, target, open }),
  }).then((r) => r.json());
  const out = await send(false).catch(() => ({ error: "could not write the file" }));
  if (out.error) {
    confirmDialog({ kind: "error", tag: "NOT SAVED", title: "COULDN'T SAVE", body: out.error, cancel: "OK" });
    return;
  }
  Sound.done();
  const again = await confirmDialog({
    kind: "to-local", tag: "SAVED", title: `${label.toUpperCase()} SAVED`,
    body: `Saved to:\n${out.path}\n\nPlain files that open anywhere, even without Umbra.`,
    ok: "OPEN FOLDER", cancel: "DONE",
  });
  if (again) send(true);
}

// The built-in field manual opens in the same reader panel, rendered here.
let manualPages = null;
async function loadManual() {
  if (!manualPages) manualPages = await fetch("/api/manual").then((r) => r.json()).catch(() => []);
  return manualPages;
}
async function openManual(id) {
  const pages = await loadManual();
  const page = pages.find((p) => p.id === id);
  if (!page) return;
  if (window.track) track("manualPages", id);
  $("#reader-title").textContent = `${page.title} · Umbra Field Manual`;
  $("#reader-frame").hidden = true;
  const doc = $("#reader-doc");
  doc.hidden = false;
  doc.innerHTML = `<div class="rd-cat">${escapeHtml(page.category.toUpperCase())}</div><h1>${escapeHtml(page.title)}</h1>
    <div class="answer">${renderMarkdown(page.body)}</div>
    <p class="rd-note">Umbra Field Manual: critical basics, always available offline. Not a substitute for training or professional help.</p>`;
  doc.scrollTop = 0;
  $("#reader").hidden = false;
  Sound.click();
}

function openReader(s) {
  $("#reader-doc").hidden = true;
  $("#reader-frame").hidden = false;
  $("#reader-title").textContent = `${s.title} · ${s.archive}`;
  $("#reader-frame").src = s.url;
  $("#reader").hidden = false;
}
// Going back: a panel opened from another one (a manual page from the Field
// Kit, the map from Settings) returns there when it's closed with Esc or ✕.
let backTo = null;
function openedFrom(fn) { backTo = fn; }
function goBack() { const fn = backTo; backTo = null; if (fn) setTimeout(fn, 0); }

function closeReader() {
  if ($("#reader").hidden) return;
  $("#reader").hidden = true;
  goBack();
  $("#reader-frame").src = "about:blank";
  input.focus();
}
$("#reader-close").addEventListener("click", closeReader);

// ------------------------------------------------------------------ inputs

// ------------------------------------------------------------------- voice

// Voice input through voxtype (offline Whisper). With the voxtype service
// running (Omarchy's F9), it types straight into the focused prompt; the
// button drives the same service and lights up whenever it records.
// Without the service, the backend records and returns the words here.
const mic = $("#mic");
let voice = { available: false, daemon: false, state: "idle" };
function showVoice(v) {
  if (voice.state === "transcribing" && v.state === "idle" && window.track) track("voice");   // words came in by voice
  voice = { ...voice, ...v };
  mic.classList.toggle("rec", voice.state === "recording");
  mic.classList.toggle("busy", voice.state === "transcribing");
  mic.classList.toggle("off", !voice.available);
  mic.hidden = !!voice.unsupported;   // the Windows app has no voice input yet
}
function insertText(text) {
  const a = input.selectionStart, b = input.selectionEnd, v = input.value;
  const sep = a > 0 && !/\s$/.test(v.slice(0, a)) ? " " : "";
  input.value = v.slice(0, a) + sep + text + v.slice(b);
  const at = a + sep.length + text.length;
  input.setSelectionRange(at, at);
  autosize();
  Undo.snap();
}
async function voiceCall(action) {
  try {
    const r = await (await fetch("/api/voice", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }),
    })).json();
    showVoice(r);
    if (r.text) insertText(r.text);
  } catch {}
}
let voiceTick = 0;
async function refreshVoice() {
  if (voice.unsupported || (!document.hasFocus() && voice.state === "idle")) return;
  // Every 0.8 s while recording or transcribing, every 1.6 s at rest (each
  // check asks voxtype, a separate program).
  if (voice.state === "idle" && ++voiceTick % 2) return;
  try { showVoice(await (await fetch("/api/voice")).json()); } catch {}
}
// The first check runs at once, focused or not, so the Windows app hides
// the microphone before anything (the tour included) points at it.
fetch("/api/voice").then((r) => r.json()).then(showVoice).catch(() => {});
setInterval(refreshVoice, 800);

mic.addEventListener("mousedown", (e) => e.preventDefault());   // keep the prompt focused for dictation
mic.addEventListener("click", () => {
  if (locked) return;
  if (!voice.available) {
    confirmDialog({
      kind: "to-local", tag: "VOICE", title: "VOICE INPUT ISN'T INSTALLED",
      body: "Voice input uses voxtype, an offline speech-to-text tool. Install it with:\n\n" +
        (voice.install || "omarchy-voxtype-install") + "\n\nThen hold F9 in Umbra (or click the microphone) to talk.",
      cancel: "OK",
    });
    return;
  }
  input.focus();
  Sound.click();
  if (voice.state === "recording") {
    if (!voice.daemon) showVoice({ state: "transcribing" });
    voiceCall("stop");
  } else if (voice.state === "idle") voiceCall("start");
});
// Hold F9 to talk. With the voxtype service running, Omarchy's own F9
// binding already does this everywhere, so Umbra leaves the key to it.
document.addEventListener("keydown", (e) => {
  if (e.key !== "F9" || e.repeat || voice.daemon || !voice.available || locked) return;
  e.preventDefault();
  input.focus();
  voiceCall("start");
});
document.addEventListener("keyup", (e) => {
  if (e.key !== "F9" || voice.daemon || !voice.available || voice.state !== "recording") return;
  e.preventDefault();
  showVoice({ state: "transcribing" });
  voiceCall("stop");
});

// An answer that lands while the window is in the background lights up the
// bar widget's emblem; coming back to the window clears it.
let attention = false;
function setAttention(on) {
  if (attention === on) return;
  attention = on;
  fetch("/api/attention", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ on }) })
    .catch(() => {});
}
window.addEventListener("focus", () => setAttention(false));
window.addEventListener("pagehide", () => setAttention(false));

// The prompt box keeps its own undo history (Ctrl+Z, and Ctrl+Shift+Z or
// Ctrl+Y to redo). It survives sending: Ctrl+Z brings a sent question back.
const Undo = (() => {
  let stack = [{ v: "", at: 0 }], i = 0, last = 0;
  const snap = (typing = false) => {
    const cur = { v: input.value, at: input.selectionStart };
    if (stack[i].v === cur.v) return;
    stack = stack.slice(0, i + 1);
    // Quick typing merges into one step; a pause or a space starts a new one.
    const merge = typing && i > 0 && stack[i].v && Date.now() - last < 900 && !/\s$/.test(stack[i].v);
    if (merge) stack[i] = cur;
    else { stack.push(cur); i++; }
    if (stack.length > 300) { stack.shift(); i--; }
    last = Date.now();
  };
  const go = (step) => {
    if (i + step < 0 || i + step >= stack.length) return;
    i += step;
    input.value = stack[i].v;
    const at = Math.min(stack[i].at ?? input.value.length, input.value.length);
    input.setSelectionRange(at, at);
    autosize();
    last = 0;
  };
  return { snap, undo: () => go(-1), redo: () => go(1) };
})();

// After an answer, the prompt's hint turns into a likely reply; Tab types it.
// Accepting Umbra's offer this way asks for exactly what it offered.
const DEFAULT_HINT = input.placeholder;
let suggestion = null, suggestToken = 0;
function setSuggestion(text, sendAs = "", more = []) {
  suggestion = text ? { text, sendAs } : null;
  // The Tab menu offers this reply and a couple of others.
  if (window.UmbraTools) UmbraTools.setReplies(text ? [{ text }, ...more.filter((m) => m !== text).map((m) => ({ text: m }))] : []);
  if (window.UmbraTools) return;   // tools.js types the hint in (and out) smoothly
  input.placeholder = text ? `${text}  ⇥ TAB` : DEFAULT_HINT;
  input.classList.toggle("suggest", !!text);
}
async function suggestFor(rec) {
  const token = ++suggestToken;
  if (window.UmbraTools) UmbraTools.setReplies([], rec);
  if ((window.prefs && window.prefs.suggestions === false) || window.offgrid) return setSuggestion("");
  if (rec.offer) setSuggestion("Yes, please.", `Yes, please: ${rec.offer}`);
  else setSuggestion("");
  try {
    const r = await (await fetch("/api/suggest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: rec.question, answer: rec.answer }),
    })).json();
    if (token !== suggestToken || controller) return;
    const opts = (r.options || []).filter(Boolean);
    if (rec.offer) setSuggestion("Yes, please.", `Yes, please: ${rec.offer}`, opts);
    else if (r.text) setSuggestion(r.text, "", opts);
  } catch {}
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (controller) { controller.abort(); if (window.track) track("stops"); return; }
  let q = input.value;
  if (!q.trim() && window.UmbraAttach && UmbraAttach.count()) q = "Look at what I've attached and tell me what's in it.";
  input.value = "";
  autosize();
  Undo.snap();
  if (suggestion && suggestion.sendAs && q.trim() === suggestion.text) ask(suggestion.sendAs, q.trim());
  else ask(q);
});

let keyRepeat = 0;
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); return; }
  const k = e.key.toLowerCase();
  if (e.ctrlKey && !e.altKey && (k === "z" || k === "y")) {
    e.preventDefault();
    if (k === "y" || e.shiftKey) Undo.redo(); else Undo.undo();
    return;
  }
  if (e.key === "Tab" && !e.shiftKey && suggestion && !input.value && !window.UmbraTools) {
    e.preventDefault();
    if (window.track) track("suggestions");
    input.value = suggestion.text;
    input.setSelectionRange(input.value.length, input.value.length);
    autosize();
    Undo.snap();
    Sound.key();
    return;
  }
  // Held keys repeat fast: only every fourth repeat clicks.
  if (e.key.length === 1 || e.key === "Backspace") {
    if (!e.repeat) { keyRepeat = 0; Sound.key(); } else if (++keyRepeat % 4 === 0) Sound.key();
  }
});

// Grows the prompt with its text. Measuring briefly collapses the box, which
// would pull the chat up and down on every key; the chat's scroll position
// is held still around it.
// The height is measured on a hidden copy of the prompt, so the prompt
// itself never collapses and the chat above doesn't move while you type.
// Only a real change of height touches the chat's scroll position.
const sizer = document.createElement("textarea");
sizer.setAttribute("aria-hidden", "true");
sizer.tabIndex = -1;
Object.assign(sizer.style, { position: "absolute", visibility: "hidden", left: "-9999px", top: "0", height: "0", overflow: "hidden" });
document.body.appendChild(sizer);
function autosize() {
  const cs = getComputedStyle(input);
  for (const p of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingBottom", "paddingLeft", "paddingRight", "boxSizing", "wordSpacing"]) sizer.style[p] = cs[p];
  sizer.style.width = input.getBoundingClientRect().width + "px";
  sizer.value = input.value || " ";
  const max = parseFloat(cs.maxHeight) || 180;
  const height = Math.min(max, sizer.scrollHeight) + "px";
  if (height === input.style.height) return;
  const bottom = feed.scrollHeight - feed.scrollTop;
  input.style.height = height;
  if (follow) feed.scrollTop = feed.scrollHeight;
  else feed.scrollTop = feed.scrollHeight - bottom;   // keep the same text in view
}
input.addEventListener("input", () => { autosize(); Undo.snap(true); });

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !$("#modal").hidden) return;
  // The one on top closes first: the reader opens over the library.
  if (!$("#reader").hidden) closeReader();
  else if (!$("#themes").hidden) toggleThemes(false);
  else if (!$("#library").hidden) toggleLibrary(false);
  else if (controller) { controller.abort(); if (window.track) track("stops"); }
});


// ---------------------------------------------------------------- shortcuts

const SHORTCUTS = [
  ["Enter", "Send your question"], ["Shift + Enter", "New line"], ["Esc", "Stop an answer, or close a panel"],
  ["Tab", "Quick actions: likely replies, fitting tools, questions to start with"], ["F9", "Hold to talk (voice input)"], ["Ctrl + Z", "Undo in the prompt"], ["Ctrl + Y", "Redo in the prompt"],
  ["Ctrl (hold)", "Conversation tools: search, history and export"], ["Ctrl + N", "New conversation"], ["Ctrl + F", "Search this conversation"],
  ["Ctrl + H", "History"], ["Ctrl + Shift + H", "Search all conversations in History"],
  ["Ctrl + E", "Export this conversation"], ["Ctrl + L", "Library and field manual"], ["Ctrl + P", "Your profile"],
  ["Ctrl + O", "Loadout: scenario and personality"], ["Ctrl + G", "Maps"], ["Ctrl + K", "Field kit: medic, sun & moon, supplies, vault, training"], ["Ctrl + J", "Signals & radar"], ["Ctrl + T", "Themes"], ["Ctrl + M", "Mute or unmute sounds"],
  ["Ctrl + Shift + F", "Farming planner"], ["Ctrl + B", "Umbra Outpost"], ["Ctrl + U", "Friends and the Camp Network"],
  ["Ctrl + ,", "Settings"], ["Ctrl + wheel", "Zoom in or out (also Ctrl + plus / minus; Ctrl + 0 resets)"], ["F1", "This list"],
  ["Ctrl + L", "Online, in the browser: the address bar"], ["Ctrl + T", "Online, in the browser: a new tab"], ["Ctrl + W", "Online, in the browser: close the tab"],
  ["Ctrl + Tab", "Online, in the browser: next tab"], ["Alt + Left", "Online, in the browser: back (Alt + Right: forward)"], ["F5", "Online, in the browser: reload"],
];
function showShortcuts() {
  if ($(".keys-overlay")) return;
  const shade = document.createElement("div");
  shade.className = "modal keys-overlay";
  shade.innerHTML = `<div class="dialog to-local"><div class="dialog-tag">KEYBOARD</div><h2>SHORTCUTS</h2>
    <div class="keys">${SHORTCUTS.filter(([k]) => k !== "F9" || !voice.unsupported).map(([k, what]) => `<span class="kk">${k.split(" + ").map((x) => `<kbd>${escapeHtml(x)}</kbd>`).join(" + ")}</span><span>${escapeHtml(what)}</span>`).join("")}</div>
    <div class="dialog-actions"><button class="solid">GOT IT</button></div></div>`;
  const close = () => { shade.remove(); document.removeEventListener("keydown", onKey, true); input.focus(); };
  const onKey = (e) => { if (e.key === "Escape" || e.key === "F1") { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  shade.querySelector(".solid").addEventListener("click", close);
  shade.addEventListener("click", (e) => { if (e.target === shade) close(); });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(shade);
  Sound.click();
}
window.showShortcuts = showShortcuts;

document.addEventListener("keydown", (e) => {
  if (locked || !$("#modal").hidden || document.body.classList.contains("touring")) return;
  if (e.key === "F1") { e.preventDefault(); showShortcuts(); return; }
  if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") { e.preventDefault(); window.toggleFarming?.(); return; }
  if (e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "h") { e.preventDefault(); window.focusHistorySearch?.(); return; }
  if (!e.ctrlKey || e.altKey || e.shiftKey) return;
  const actions = {
    n: () => window.newConversation && window.newConversation(),
    h: () => window.toggleHistory && window.toggleHistory(),
    f: () => window.focusHistorySearch && window.focusHistorySearch(),
    e: () => window.exportCurrent && window.exportCurrent(),
    l: () => toggleLibrary(),
    p: () => window.openLoadout && window.openLoadout("profile"),
    o: () => window.openLoadout && window.openLoadout("scenario"),
    t: () => toggleThemes(),
    g: () => window.toggleMaps && window.toggleMaps(),
    k: () => window.toggleFieldKit && window.toggleFieldKit(),
    j: () => window.toggleRadar && window.toggleRadar(),
    b: () => window.toggleOutpost && window.toggleOutpost(),
    u: () => window.toggleFriends && window.toggleFriends(),
    m: () => setMuted(!Sound.muted),
    ",": () => window.openSettings && window.openSettings(),
  };
  const act = actions[e.key.toLowerCase()];
  if (act) { e.preventDefault(); act(); }
});

// ------------------------------------------------------------------ zoom

// Ctrl + mouse wheel (or Ctrl + plus / minus, Ctrl + 0 to reset) zooms every
// screen. The app window zooms natively (WebKitGTK's zoom level on Linux,
// WebView2's zoom factor on Windows), so the layout reflows and maps, the
// radar and every click stay exact. The level is saved with the settings.
const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
let zoomNow = 1, zoomToastTimer = 0;
function applyZoom(z, announce = false) {
  z = Math.min(2, Math.max(0.5, Number(z) || 1));
  if (z !== zoomNow) {
    zoomNow = window.umbraZoom = z;
    if (!window.umbraNative("zoom:" + z)) {
      // The Windows window's bridge arrives a moment after the page: then zoom.
      if (/Windows/.test(navigator.userAgent)) window.addEventListener("pywebviewready", () => window.umbraNative("zoom:" + zoomNow), { once: true });
      else document.documentElement.style.zoom = z === 1 ? "" : String(z);   // a plain browser tab
    }
  }
  if (window.prefs) window.prefs.zoom = z;
  document.dispatchEvent(new CustomEvent("umbra-zoom", { detail: z }));
  if (announce) {
    let t = $(".zoom-toast");
    if (!t) { t = document.createElement("div"); t.className = "zoom-toast"; document.body.appendChild(t); }
    t.innerHTML = `ZOOM <b>${Math.round(z * 100)}%</b><small>${z === 1 ? "CTRL + WHEEL" : "CTRL + 0 RESETS"}</small>`;
    t.classList.add("on");
    clearTimeout(zoomToastTimer);
    zoomToastTimer = setTimeout(() => t.classList.remove("on"), 1300);
  }
}
window.applyZoom = applyZoom;
function stepZoom(dir) {
  const next = dir === 0 ? 1
    : dir > 0 ? (ZOOM_STEPS.find((z) => z > zoomNow + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1])
    : ([...ZOOM_STEPS].reverse().find((z) => z < zoomNow - 0.001) ?? ZOOM_STEPS[0]);
  const changed = next !== zoomNow;
  applyZoom(next, true);   // at the limit, the note still shows where you are
  if (!changed) return;
  if (window.prefs) window.prefs.zoom = next;
  postSettings({ zoom: next });
  Sound.key();
}
// Wheel steps add up, so a trackpad pinch zooms at a steady pace too.
let wheelSum = 0, wheelAt = 0;
window.addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  const now = performance.now();
  if (now - wheelAt > 300) wheelSum = 0;
  wheelAt = now;
  wheelSum += e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
  if (Math.abs(wheelSum) < 40) return;
  stepZoom(wheelSum < 0 ? 1 : -1);
  wheelSum = 0;
}, { passive: false, capture: true });
document.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || e.altKey) return;
  const dir = { "=": 1, "+": 1, "-": -1, "_": -1, "0": 0 }[e.key];
  if (dir === undefined) return;
  e.preventDefault();
  stepZoom(dir);
}, true);

// ------------------------------------------------------------ prompt status

// A short mechanical status line above the prompt, typed in whenever the
// situation changes (idle, composing, suggestion, working, listening…).
const barLeft = $("#promptbar .pb-left"), barRight = $("#promptbar .pb-right");
let barState = "", barTimer = 0;
function promptBarState() {
  if (voice.state === "recording") return ["◉ LISTENING", voice.daemon ? "RELEASE F9 TO STOP" : "CLICK THE MIC OR RELEASE F9 TO STOP", true];
  if (voice.state === "transcribing") return ["◌ TRANSCRIBING", "", true];
  if (controller) return ["▸ UMBRA IS WORKING", "ESC ABORT", true];
  const n = input.value.length;
  if (n) return [`▸ COMPOSING · ${n} ${n === 1 ? "CHAR" : "CHARS"}`, "⏎ SEND · ⇧⏎ NEW LINE", false];
  const f9 = voice.unsupported ? "" : " · F9 VOICE";
  if (suggestion) return ["▸ SUGGESTIONS READY", "⏎ SEND" + f9, true];
  return [`▸ AWAITING INPUT${online ? " · ONLINE" : ""}${window.offgrid ? " · OFF-GRID" : ""}`, "⏎ SEND" + f9, false];
}
function updatePromptBar() {
  // The Tab hint, in the reply colour, beside the status while the prompt is empty.
  const tabHint = $("#promptbar .pb-tab");
  if (tabHint) tabHint.hidden = !!(input.value.length || controller || voice.state === "recording" || voice.state === "transcribing");
  const [left, right, hot] = promptBarState();
  const key = left + "|" + right;
  if (key === barState) return;
  // Only a new situation is typed out; while composing, just the count
  // changes (with a small flick), the rest of the line stays put.
  const shape = (t) => t.replace(/\d+/g, "#").replace(/CHARS?/, "CHAR");
  const sameShape = barState && shape(barState) === shape(key);
  barState = key;
  barLeft.classList.toggle("hot", hot);
  if (sameShape || document.body.classList.contains("reduce-motion")) {
    clearInterval(barTimer);
    barLeft.textContent = left; barRight.textContent = right;
    if (sameShape) { barLeft.classList.remove("tick"); void barLeft.offsetWidth; barLeft.classList.add("tick"); }
    return;
  }
  clearInterval(barTimer);
  // Typed out like a teleprinter, both sides at once.
  let i = 0;
  const len = Math.max(left.length, right.length);
  barTimer = setInterval(() => {
    i += 2;
    barLeft.textContent = left.slice(0, i) + (i < left.length ? "▌" : "");
    barRight.textContent = right.slice(0, i);
    if (i >= len) clearInterval(barTimer);
  }, 14);
}
setInterval(updatePromptBar, 200);
updatePromptBar();

// The textarea's native caret follows text wrapping, selection and scrolling.

// umbra-wiki --manual <page> opens a field-manual page.
const manualParam = new URLSearchParams(location.search).get("manual");
if (manualParam) setTimeout(() => openManual(manualParam), 700);

// umbra-wiki "question" passes it as ?q= to ask on open.
const initial = new URLSearchParams(location.search).get("q");
if (initial) ask(initial);
