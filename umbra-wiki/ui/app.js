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

async function postSettings(update) {
  try {
    await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
  } catch {}
}

// ------------------------------------------------------------------ sound

// Short bundled sounds (Kenney, CC0), played by the backend through PipeWire
// so they work regardless of the web view's audio support.
const Sound = (() => {
  let muted = false;
  const play = (name) => {
    if (muted) return;
    fetch("/api/sound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) })
      .catch(() => {});
  };
  const names = ["launch", "key", "hover", "click", "send", "searchstart", "found", "done",
                 "lock", "unlock", "online", "local", "theme", "error", "beep", "boot", "glitch", "shutdown", "achieve"];
  const api = { get muted() { return muted; }, set muted(v) { muted = v; if (v) api.hum(false); } };
  names.forEach((n) => (api[n] = () => play(n)));
  api.hover = () => { if ((!window.prefs || window.prefs.hoverSounds !== false) && !window.offgrid) play("hover"); };
  // The quiet background hum while Umbra searches and thinks.
  api.hum = (on) => {
    if (on && (muted || window.offgrid)) return;
    fetch("/api/sound", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "hum", on }) })
      .catch(() => {});
  };
  return api;
})();

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
  $("#sound-icon").textContent = value ? "󰖁" : "󰕾";
  $("#sound").classList.toggle("off", value);
  $("#sound").title = value ? "Sound off (click to unmute)" : "Sound on (click to mute)";
  if (save) postSettings({ muted: value });
}
$("#sound").addEventListener("click", () => {
  const next = !Sound.muted;
  setMuted(next);
  if (!next) Sound.click();
});

// ----------------------------------------------------------------- themes

let themes = [];
let currentTheme = "";
const THEME_VARS = {
  bg: "--bg", bg1: "--bg-1", bg2: "--bg-2", bg3: "--bg-3", line: "--line", muted: "--muted",
  fg: "--fg", fgBright: "--fg-bright", dim: "--dim", faint: "--faint",
  signal: "--signal", shade1: "--shade-1", shade2: "--shade-2", shade3: "--shade-3",
  accent: "--accent", red: "--red", net: "--net",
};

function applyTheme(id, { animate = true, force = false } = {}) {
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

const CATEGORY = { survival: "SURVIVAL", medical: "MEDICAL", practical: "PRACTICAL SKILLS" };
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
async function renderLibrary(fresh = false) {
  const body = $("#library-body");
  if (fresh) {
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
  const downloading = new Set(dl.library.active ? dl.library.items.filter((x) => !x.installed).map((x) => x.id) : []);

  const total = lib.installed.reduce((n, x) => n + x.size, 0);
  let html = `<p class="lib-note">Collections are stored in <code>${escapeHtml(lib.dir)}</code> and work fully offline.
    Downloads run in the background, are checked for damage, and join the library as soon as they finish.</p>`;

  if (dl.library.active) {
    html += `<div class="lib-section"><div class="lib-head"><span><span class="spin" data-spin>✻</span> DOWNLOADING</span><b>${dl.library.percent}%</b></div>
      <div class="dl-bar"><i style="width:${dl.library.percent}%"></i></div>`;
    dl.library.items.forEach((x) => {
      const pct = x.size ? Math.round((x.done * 100) / x.size) : 0;
      html += `<div class="dl-row"><span>${x.installed ? "✓" : pct ? "↓" : "·"} ${escapeHtml(x.name)}</span><span>${x.installed ? "DONE" : pct + "%"}</span></div>`;
    });
    html += `</div>`;
  }

  const manual = await loadManual();
  if (manual.length) {
    html += `<div class="lib-section"><div class="lib-head"><span>󰈙 FIELD MANUAL · ${manual.length} PAGES · BUILT IN</span>
      <button class="ghost lib-manual-export" title="Save the whole manual as a file, to print or keep on a USB stick">󰈇 EXPORT</button></div>
      <div class="manual-grid">${manual.map((p) => `<button class="manual-page" data-page="${p.id}" title="${escapeHtml(p.summary)}">
        <span class="mcat">${escapeHtml(p.category)}</span>${escapeHtml(p.title)}</button>`).join("")}</div></div>`;
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
  body.querySelectorAll(".manual-page").forEach((b) => {
    b.addEventListener("mouseenter", Sound.hover);
    b.addEventListener("click", () => openManual(b.dataset.page));
  });
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
  }));
  // Keep the progress moving while the panel is open.
  clearTimeout(libraryTimer);
  if (dl.library.active) libraryTimer = setTimeout(() => { if (!$("#library").hidden) renderLibrary(); }, 2500);
}
let libraryTimer = 0;

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
  if (window.closeSettings) window.closeSettings();
  if (window.closeLoadout) window.closeLoadout(true);
  toggleThemes(false, true);
  $("#library").hidden = true;
  $("#library-btn").classList.remove("on");
  window.newConversation();
}
$("#home").addEventListener("click", goHome);
$(".brand .name").addEventListener("click", goHome);

// Settings can change from the bar widget too, so keep them in sync.
async function syncSettings(first = false) {
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

// A shaded ASCII globe spinning on its axis: latitude and longitude lines
// over a lit sphere. Draws ~12 frames a second into a small <pre>.
function orb(el, w, h) {
  const ramp = " .·:-=+*#%@";
  let t = Math.random() * 6, last = 0, raf = 0, alive = true;
  const frame = (ts) => {
    if (!alive) return;
    if (ts - last > 80 && el.isConnected) {
      last = ts; t += 0.07;
      let out = "";
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const nx = (x - w / 2 + 0.5) / (w / 2), ny = (y - h / 2 + 0.5) / (h / 2);
          const r2 = nx * nx + ny * ny;
          if (r2 > 1) { out += " "; continue; }
          const nz = Math.sqrt(1 - r2);
          const lon = Math.atan2(nx, nz) + t, lat = Math.asin(ny);
          const grid = Math.abs(Math.sin(lon * 3)) < 0.16 || Math.abs(Math.sin(lat * 4)) < 0.14;
          const light = 0.25 + 0.75 * Math.max(0, -0.45 * nx - 0.4 * ny + 0.8 * nz);
          const v = Math.min(1, light * 0.6 + (grid ? 0.4 : 0));
          out += ramp[Math.round(v * (ramp.length - 1))];
        }
        out += "\n";
      }
      el.textContent = out;
    }
    if (!el.isConnected) { alive = false; return; }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); };
}

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
const introWatch = new IntersectionObserver(([e]) => {
  introVisible = e.isIntersecting;
  if (introVisible) startRain(); else stopRain();
});

// Puts the start screen back (for a new conversation, or at the top of an
// opened one: without the greeting) and starts its motion.
function showIntro(first = false, { greet = true } = {}) {
  if (!first) {
    stopRain();
    feed.innerHTML = "";
    feed.appendChild(introTemplate.cloneNode(true));
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

// The start screen's suggested questions: the scenario's own starters at
// once, then a few written for you (from your profile and conversations),
// marked ✦, when the local AI has them ready. Every 100 seconds a fresh
// set rotates in; every so often a slow wave runs through the text.
let starterPool = { personal: [], scenario: [] }, starterShown = [], starterTurn = 0;
async function showStarters() {
  const box = $("#intro .prompts");
  if (!box) return;
  const token = ++startersToken;
  try {
    const quick = await (await fetch("/api/starters?personal=0")).json();
    if (token !== startersToken || !box.isConnected) return;
    starterPool = { personal: [], scenario: quick.scenario || [] };
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
  const { personal, scenario } = starterPool;
  const n = Math.min(4, personal.length);
  const mine = Array.from({ length: n }, (_, i) => personal[(starterTurn * n + i) % personal.length]);
  starterTurn++;
  const fresh = scenario.filter((t) => !starterShown.includes(t) && !mine.includes(t));
  const pool = (fresh.length >= 6 - n ? fresh : scenario.filter((t) => !mine.includes(t))).slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return [...mine.map((t) => [t, true]), ...pool.slice(0, 6 - n).map((t) => [t, false])];
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
  const pool = (mine ? starterPool.personal : starterPool.scenario).filter((t) => !onScreen.includes(t));
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

// A welcome on the start screen: your name, and a line in the current
// personality's voice that picks up from the last conversation.
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

// Resolves true for the confirm button, false for cancel / Esc / backdrop.
function confirmDialog({ kind, tag, title, body, ok, cancel }) {
  return new Promise((resolve) => {
    const modal = $("#modal");
    const dialog = modal.querySelector(".dialog");
    dialog.className = "dialog " + kind;
    $("#modal-tag").textContent = tag;
    $("#modal-title").textContent = title;
    $("#modal-body").textContent = body;
    $("#modal-ok").textContent = ok || "";
    $("#modal-ok").hidden = !ok;
    $("#modal-cancel").textContent = cancel;
    modal.hidden = false;
    (ok ? $("#modal-ok") : $("#modal-cancel")).focus();
    kind === "error" ? Sound.error() : Sound.click();

    const done = (value) => {
      modal.hidden = true;
      $("#modal-ok").onclick = $("#modal-cancel").onclick = modal.onclick = null;
      document.removeEventListener("keydown", onKey, true);
      input.focus();
      resolve(value);
    };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); done(false); } };
    $("#modal-ok").onclick = () => done(true);
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

$("#link").addEventListener("click", async () => {
  if (controller || locked) return; // don't switch sources mid-answer
  if (!online) {
    const go = await confirmDialog({
      kind: "to-online", tag: "WARNING", title: "SWITCH TO ONLINE MODE?",
      body: "Umbra will also search Wikipedia over the internet. Your questions will leave this device.\n\n" +
            "Your offline archives stay in use and the AI still runs on this computer.",
      ok: "GO ONLINE", cancel: "STAY LOCAL",
    });
    if (!go) return;
    $("#link-label").textContent = "CHECKING…";
    let reachable = false;
    try { reachable = (await (await fetch("/api/netcheck")).json()).online; } catch {}
    if (!reachable) {
      setOnline(false);
      await confirmDialog({
        kind: "error", tag: "NO CONNECTION", title: "INTERNET NOT REACHABLE",
        body: "Wikipedia could not be reached, so Umbra stays in LOCAL mode.\nCheck your connection and try again.",
        cancel: "OK",
      });
      return;
    }
    setOnline(true);
    Sound.online();
  } else {
    const back = await confirmDialog({
      kind: "to-local", tag: "CONFIRM", title: "RETURN TO LOCAL ONLY?",
      body: "Online search turns off. Answers will come only from the archives stored on this device, " +
            "and nothing will be sent over the internet.",
      ok: "GO LOCAL", cancel: "STAY ONLINE",
    });
    if (back) { setOnline(false); Sound.local(); }
  }
});

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

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_, nums) =>
      nums.split(/\s*,\s*/).map((n) => `<span class="cite" data-n="${n}">${n}</span>`).join(""));
}

// Small, forgiving renderer: it runs while an answer types out, so
// half-written markdown must still render sensibly.
function renderMarkdown(src) {
  const lines = escapeHtml(src).split("\n");
  let out = "", list = null, para = [], code = null;
  const flushPara = () => { if (para.length) { out += `<p>${inline(para.join(" "))}</p>`; para = []; } };
  const closeList = () => { if (list) { out += `</${list}>`; list = null; } };

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
      flushPara(); closeList();
      out += `<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`;
    } else if ((m = line.match(/^\s*(?:[-*•])\s+(.*)/)) || (m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      flushPara();
      const kind = /^\s*\d/.test(line) ? "ol" : "ul";
      if (list !== kind) { closeList(); out += `<${kind}>`; list = kind; }
      out += `<li>${inline(m[1])}</li>`;
    } else if (!line.trim()) {
      flushPara(); closeList();
    } else {
      closeList(); para.push(line.trim());
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
// Any move up (wheel, touchpad, scrollbar, keys) stops following, even the
// small steps a touchpad makes near the bottom; only moving back down to
// the end resumes it.
let lastTop = 0, lastHeight = 0;
feed.addEventListener("wheel", (e) => { if (e.deltaY < 0) follow = false; }, { passive: true });
feed.addEventListener("keydown", (e) => { if (["ArrowUp", "PageUp", "Home"].includes(e.key)) follow = false; });
feed.addEventListener("scroll", () => {
  const top = feed.scrollTop, height = feed.scrollHeight;
  if (top < lastTop - 1 && height >= lastHeight) follow = false;
  else if (top > lastTop && height - feed.clientHeight - top < 40) follow = true;
  lastTop = top;
  lastHeight = height;
}, { passive: true });

// ----------------------------------------------------------- source popups

const pop = $("#pop");
function showPop(s, anchor) {
  if (locked) return;
  $("#pop-n").textContent = s.n;
  const kind = $("#pop-kind");
  kind.textContent = s.kind === "manual" ? "FIELD MANUAL" : s.kind === "local" ? "LOCAL ARCHIVE" : "WIKIPEDIA ↗";
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
  if (!el.hasAttribute("aria-label")) el.setAttribute("aria-label", el.dataset.tip);
  el.removeAttribute("title");
  if (el === tipFor && !tip.hidden) tip.textContent = el.dataset.tip;
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
  if (!el || locked) return;
  tipFor = el;
  tipTimer = setTimeout(() => {
    if (!el.isConnected || !el.dataset.tip) return;
    tip.textContent = el.dataset.tip;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const below = r.bottom + 8 + h < innerHeight - 4;
    tip.style.left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8) + "px";
    tip.style.top = (below ? r.bottom + 8 : r.top - h - 8) + "px";
    tip.classList.toggle("above", !below);
  }, 380);
});
document.addEventListener("mouseout", (e) => { if (tipFor && !tipFor.contains(e.relatedTarget)) hideTip(); });
["mousedown", "keydown", "wheel"].forEach((ev) => document.addEventListener(ev, hideTip, true));

// ------------------------------------------------------------------- feed

function addUser(text, wasOnline = online) {
  const el = document.createElement("div");
  el.className = "msg user";
  const me = (window.UmbraProfile && window.UmbraProfile.data) || {};
  el.innerHTML = `<div class="label">${me.picture ? '<img class="avatar" alt="">' : ""}<span class="who"></span>${wasOnline ? " · ONLINE" : ""}</div><div class="body"></div>`;
  el.querySelector(".who").textContent = (me.name || "YOU") + (me.callsign ? ` · ${me.callsign}` : "");
  if (me.color) el.querySelector(".who").style.color = `var(--${me.color})`;
  if (me.picture) el.querySelector(".avatar").src = me.picture;
  el.querySelector(".body").textContent = text;
  feed.appendChild(el);
}

// UMBRA, plus which personality is talking, so a conversation shows who
// said what even when the loadout changes midway.
function addBot(persona = window.loadoutPersona || "") {
  const el = document.createElement("div");
  el.className = "msg bot";
  const who = persona && persona.toLowerCase() !== "umbra" ? ` <span class="persona"></span>` : "";
  el.innerHTML = `<div class="label"><span class="spin" data-spin>✻</span> UMBRA${who}</div>
    <div class="card"><div class="answer"></div></div>`;
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
  else if (s.kind === "local") openReader(s);
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
    kind.textContent = s.kind === "manual" ? "MANUAL" : s.kind === "local" ? "LOCAL" : "WIKIPEDIA ↗";
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
    if (s) bindSource(c, s);
  });
}

// A finished answer: text, sources, Umbra's offer and the meta line. Used
// for new answers and for conversations reopened from History.
function finishAnswer(msg, rec) {
  const answerEl = msg.querySelector(".answer");
  const card = msg.querySelector(".card");
  const byN = {};
  rec.sources.forEach((s) => (byN[s.n] = s));
  paintAnswer(answerEl, rec.answer, byN);
  msg.querySelector(".label .spin")?.remove();
  renderSources(card, rec.sources);
  if (rec.offer) renderNext(answerEl, rec.offer);
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

async function ask(question, shownAs = "") {
  if (controller || locked || !question.trim() || document.body.classList.contains("touring")) return;
  stopRain();   // the start screen stays above the conversation, resting while Umbra works
  suggestToken++;
  setSuggestion("");
  addUser(shownAs || question);
  const msg = addBot();
  const card = msg.querySelector(".card");
  const answerEl = msg.querySelector(".answer");
  showWaiting(answerEl);
  follow = true;
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

  let text = "", sources = [], next = "", meta = null, stopped = false, writing = false;
  const sourceByN = {};
  const typer = typewriter((shown) => paintAnswer(answerEl, shown, sourceByN, true));

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: chat, online, offgrid: !!window.offgrid }),
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
        } else if (e.type === "error") {
          text += `\n\n**Error:** ${e.message}`;
        }
      }
    }
  } catch (err) {
    stopped = err.name === "AbortError";
    if (!stopped) text += `\n\n**Error:** ${err.message}`;
  }

  Sound.hum(false);
  stopWaiting();
  let shown = visibleAnswer(text, false);
  if (!shown) {
    shown = stopped
      ? "*Stopped.*"
      : "Sorry, I lost my train of thought there. Could you ask that again, maybe in a few more words?";
  } else if (stopped) shown += "\n\n*[transmission stopped]*";
  if (!stopped) { typer.set(shown); await typer.drained(); }
  const rec = {
    question, shown: shownAs, answer: shown, offer: stopped ? "" : next, sources, online,
    persona: window.loadoutPersona || "",
    meta: meta ? `${meta.tokens} TOKENS · ${meta.seconds}s · ${sources.length} SOURCES · ${online ? "ONLINE" : "OFFLINE"}` : "",
  };
  finishAnswer(msg, rec);
  chat.push({ role: "user", content: question }, { role: "assistant", content: shown });
  if (window.recordTurn) window.recordTurn(rec);
  if (!document.hasFocus() && (!window.prefs || window.prefs.barAlert !== false)) setAttention(true);
  if (!stopped) suggestFor(rec);
  stopped ? Sound.error() : Sound.done();
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
  try { window.webkit.messageHandlers.umbra.postMessage("close"); } catch { window.close(); }
}
async function leaveUmbra() {
  if (exiting) return;
  exiting = true;
  if (controller) controller.abort();
  Sound.hum(false);
  $("#modal").hidden = true;
  const calm = document.body.classList.contains("reduce-motion");
  if (!calm) {
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
    ok: "LEAVE", cancel: "STAY",
  }).then((ok) => { exitAsked = false; if (ok) leaveUmbra(); });
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
function closeReader() {
  $("#reader").hidden = true;
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
async function refreshVoice() {
  if (!document.hasFocus() && voice.state === "idle") return;
  try { showVoice(await (await fetch("/api/voice")).json()); } catch {}
}
refreshVoice();
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
function setSuggestion(text, sendAs = "") {
  suggestion = text ? { text, sendAs } : null;
  input.placeholder = text ? `${text}    ⇥ TAB` : DEFAULT_HINT;
  input.classList.toggle("suggest", !!text);
}
async function suggestFor(rec) {
  const token = ++suggestToken;
  if ((window.prefs && window.prefs.suggestions === false) || window.offgrid) return setSuggestion("");
  if (rec.offer) return setSuggestion("Yes, please.", `Yes, please: ${rec.offer}`);
  setSuggestion("");
  try {
    const r = await (await fetch("/api/suggest", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: rec.question, answer: rec.answer }),
    })).json();
    if (token === suggestToken && !controller && r.text) setSuggestion(r.text);
  } catch {}
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (controller) { controller.abort(); if (window.track) track("stops"); return; }
  const q = input.value;
  input.value = "";
  autosize();
  Undo.snap();
  if (suggestion && suggestion.sendAs && q.trim() === suggestion.text) ask(suggestion.sendAs, q.trim());
  else ask(q);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); return; }
  const k = e.key.toLowerCase();
  if (e.ctrlKey && !e.altKey && (k === "z" || k === "y")) {
    e.preventDefault();
    if (k === "y" || e.shiftKey) Undo.redo(); else Undo.undo();
    return;
  }
  if (e.key === "Tab" && !e.shiftKey && suggestion && !input.value) {
    e.preventDefault();
    if (window.track) track("suggestions");
    input.value = suggestion.text;
    input.setSelectionRange(input.value.length, input.value.length);
    autosize();
    Undo.snap();
    Sound.key();
    return;
  }
  if (e.key.length === 1 || e.key === "Backspace") Sound.key();
});

// Grows the prompt with its text. Measuring briefly collapses the box, which
// would pull the chat up and down on every key; the chat's scroll position
// is held still around it.
function autosize() {
  const keep = feed.scrollTop, before = input.style.height;
  input.style.height = "auto";
  const height = input.scrollHeight + "px";
  input.style.height = height;
  if (height !== before && follow) feed.scrollTop = feed.scrollHeight;
  else feed.scrollTop = keep;
}
input.addEventListener("input", () => { autosize(); Undo.snap(true); });

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !$("#modal").hidden) return;
  if (!$("#themes").hidden) toggleThemes(false);
  else if (!$("#library").hidden) toggleLibrary(false);
  else if (!$("#reader").hidden) closeReader();
  else if (controller) { controller.abort(); if (window.track) track("stops"); }
});


// ---------------------------------------------------------------- shortcuts

const SHORTCUTS = [
  ["Enter", "Send your question"], ["Shift + Enter", "New line"], ["Esc", "Stop an answer, or close a panel"],
  ["Tab", "Use the suggested reply"], ["F9", "Hold to talk (voice input)"], ["Ctrl + Z", "Undo in the prompt"], ["Ctrl + Y", "Redo in the prompt"],
  ["Ctrl + N", "New conversation"], ["Ctrl + H", "History"], ["Ctrl + F", "Search your conversations"],
  ["Ctrl + E", "Export this conversation"], ["Ctrl + L", "Library and field manual"], ["Ctrl + P", "Your profile"],
  ["Ctrl + O", "Loadout: scenario and personality"], ["Ctrl + T", "Themes"], ["Ctrl + M", "Mute or unmute sounds"],
  ["Ctrl + ,", "Settings"], ["F1", "This list"],
];
function showShortcuts() {
  if ($(".keys-overlay")) return;
  const shade = document.createElement("div");
  shade.className = "modal keys-overlay";
  shade.innerHTML = `<div class="dialog to-local"><div class="dialog-tag">KEYBOARD</div><h2>SHORTCUTS</h2>
    <div class="keys">${SHORTCUTS.map(([k, what]) => `<span class="kk">${k.split(" + ").map((x) => `<kbd>${escapeHtml(x)}</kbd>`).join(" + ")}</span><span>${escapeHtml(what)}</span>`).join("")}</div>
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
    m: () => setMuted(!Sound.muted),
    ",": () => window.openSettings && window.openSettings(),
  };
  const act = actions[e.key.toLowerCase()];
  if (act) { e.preventDefault(); act(); }
});

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
  if (n) return [`▸ COMPOSING · ${n} ${n === 1 ? "CHAR" : "CHARS"}`, "⏎ TRANSMIT · ⇧⏎ NEW LINE · CTRL+Z UNDO", false];
  if (suggestion) return ["▸ SUGGESTION READY", "⇥ ACCEPT · ⏎ TRANSMIT", true];
  return [`▸ AWAITING INPUT${online ? " · LINK ONLINE" : ""}${window.offgrid ? " · OFF-GRID" : ""}`, "⏎ TRANSMIT · F9 VOICE · F1 KEYS", false];
}
function updatePromptBar() {
  const [left, right, hot] = promptBarState();
  const key = left + "|" + right;
  if (key === barState) return;
  barState = key;
  clearInterval(barTimer);
  barLeft.classList.toggle("hot", hot);
  if (document.body.classList.contains("reduce-motion")) { barLeft.textContent = left; barRight.textContent = right; return; }
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

// ------------------------------------------------------------ block cursor

// The prompt's cursor is a thick block, like a terminal's. The native one
// is hidden; this one is placed with a hidden mirror of the text.
const fakeCaret = document.createElement("span");
fakeCaret.className = "fake-caret";
fakeCaret.hidden = true;
form.appendChild(fakeCaret);
const mirror = document.createElement("div");
mirror.setAttribute("aria-hidden", "true");
Object.assign(mirror.style, { position: "absolute", visibility: "hidden", whiteSpace: "pre-wrap", wordWrap: "break-word", top: "0", left: "-9999px" });
document.body.appendChild(mirror);
let caretIdle = 0;
function placeCaret() {
  if (document.activeElement !== input || input.selectionStart !== input.selectionEnd || locked) { fakeCaret.hidden = true; return; }
  const cs = getComputedStyle(input);
  for (const p of ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "paddingTop", "paddingLeft", "paddingRight", "borderLeftWidth", "boxSizing"]) mirror.style[p] = cs[p];
  mirror.style.width = input.clientWidth + "px";
  mirror.textContent = input.value.slice(0, input.selectionStart);
  const mark = document.createElement("span");
  mark.textContent = input.value.slice(input.selectionStart, input.selectionStart + 1).replace("\n", "") || " ";
  mirror.appendChild(mark);
  const lineH = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5;
  fakeCaret.style.left = input.offsetLeft + mark.offsetLeft + "px";
  fakeCaret.style.top = input.offsetTop + mark.offsetTop - input.scrollTop + (lineH - parseFloat(cs.fontSize) * 1.2) / 2 + "px";
  fakeCaret.style.width = Math.max(7, mark.offsetWidth || parseFloat(cs.fontSize) * 0.6) + "px";
  fakeCaret.style.height = parseFloat(cs.fontSize) * 1.2 + "px";
  fakeCaret.hidden = false;
  // Solid while typing, blinking when idle.
  fakeCaret.classList.add("solid");
  clearTimeout(caretIdle);
  caretIdle = setTimeout(() => fakeCaret.classList.remove("solid"), 600);
}
["input", "focus", "blur", "click", "keyup", "scroll", "select"].forEach((ev) => input.addEventListener(ev, placeCaret));
input.addEventListener("keydown", () => requestAnimationFrame(placeCaret));
document.addEventListener("selectionchange", () => { if (document.activeElement === input) placeCaret(); });
addEventListener("resize", placeCaret);
setTimeout(placeCaret, 300);

// umbra-wiki --manual <page> opens a field-manual page.
const manualParam = new URLSearchParams(location.search).get("manual");
if (manualParam) setTimeout(() => openManual(manualParam), 700);

// umbra-wiki "question" passes it as ?q= to ask on open.
const initial = new URLSearchParams(location.search).get("q");
if (initial) ask(initial);


