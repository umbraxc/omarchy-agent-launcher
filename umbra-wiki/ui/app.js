// Umbra Wiki front end: a chat over the local /api/ask stream.
"use strict";

const $ = (s) => document.querySelector(s);
const feed = $("#feed");
const form = $("#ask");
const input = $("#q");
const send = $("#send");
const phaseBox = $("#phase");
const elapsedEl = $("#elapsed");

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
fetch("/api/facts").then((r) => r.json()).then((f) => { facts = f; }).catch(() => {});

function startQuips(answerEl, phase) {
  clearInterval(quipTimer);
  const list = QUIPS[phase];
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
  if (!facts.length) return;
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

// A survivor walking in place over moving ground, while Umbra searches.
function walker(el) {
  const bodies = [
    ["   O   ", "  /|\\# ", "  / >  "],
    ["   O   ", "  /|\\# ", "   |>  "],
    ["   O   ", "  /|\\# ", "  < \\  "],
    ["   O   ", "  /|\\# ", "   |\\  "],
  ];
  const ground = "._.-'-._.·´¯`·._.-'-._.·´¯`·._";
  let f = 0, alive = true;
  const tick = () => {
    if (!alive || !el.isConnected) return;
    const g = ground.slice(f % 10, (f % 10) + 9);
    el.textContent = bodies[f % bodies.length].join("\n") + "\n" + g;
    f++;
    setTimeout(tick, 170);
  };
  tick();
  return () => { alive = false; };
}

function setWaitingArt(answerEl, phase) {
  const art = answerEl.querySelector(".wart");
  if (!art) return;
  const kind = phase === "think" ? "orb" : "walker";
  if (art.dataset.kind === kind) return;
  if (stopArt) stopArt();
  art.dataset.kind = kind;
  art.className = "wart " + kind;
  art.textContent = "";
  stopArt = kind === "orb" ? orb(art, 14, 10) : walker(art);
}

function stopWaiting() {
  clearInterval(quipTimer);
  clearInterval(noteTimer);
  if (stopArt) { stopArt(); stopArt = null; }
}

// ---------------------------------------------------------------- library

const CATEGORY = { survival: "SURVIVAL", medical: "MEDICAL", practical: "PRACTICAL SKILLS" };
const fmtSize = (b) => (b >= 1e9 ? (b / 1e9).toFixed(1) + " GB" : Math.max(1, Math.round(b / 1e6)) + " MB");

async function renderLibrary() {
  const body = $("#library-body");
  body.innerHTML = `<p class="lib-note"><span class="spin" data-spin>✻</span> Reading library…</p>`;
  let lib;
  try { lib = await (await fetch("/api/library")).json(); } catch { body.innerHTML = `<p class="lib-note">Library unavailable.</p>`; return; }

  const total = lib.installed.reduce((n, x) => n + x.size, 0);
  let html = `<p class="lib-note">Collections are stored in <code>${escapeHtml(lib.dir)}</code> and work fully offline.
    Downloads open in a terminal with progress; Umbra reloads when they finish.</p>`;

  html += `<div class="lib-section"><div class="lib-head"><span>INSTALLED · ${lib.installed.length}</span><b>${fmtSize(total)}</b></div>`;
  if (!lib.installed.length) html += `<p class="lib-note">No collections yet. Answers come from the AI alone until you add some.</p>`;
  lib.installed.forEach((x, i) => {
    html += `<div class="lib-row" style="animation-delay:${i * 20}ms"><span class="mark-ok">✓</span>
      <span class="lname">${escapeHtml(x.name)}</span><span class="lsize">${fmtSize(x.size)}</span>
      <span class="ldesc">${escapeHtml(x.description)}</span></div>`;
  });
  html += `</div>`;

  const missingEssentials = lib.available.filter((x) => x.essential);
  if (missingEssentials.length) {
    const size = missingEssentials.reduce((n, x) => n + x.size, 0);
    html += `<button class="solid lib-all" data-ids="${missingEssentials.map((x) => x.id).join(" ")}">DOWNLOAD SURVIVAL ESSENTIALS · ${fmtSize(size)}</button>`;
  }
  for (const cat of Object.keys(CATEGORY)) {
    const items = lib.available.filter((x) => x.category === cat);
    if (!items.length) continue;
    html += `<div class="lib-section"><div class="lib-head"><span>AVAILABLE · ${CATEGORY[cat]}</span></div>`;
    items.forEach((x, i) => {
      html += `<div class="lib-row" style="animation-delay:${i * 20}ms"><span class="mark-new">+</span>
        <span class="lname">${escapeHtml(x.name)} <span class="lsize">· ${fmtSize(x.size)}</span></span>
        <button class="ghost get" data-ids="${x.id}">DOWNLOAD</button>
        <span class="ldesc">${escapeHtml(x.description)}</span></div>`;
    });
    html += `</div>`;
  }
  if (!lib.available.length) html += `<p class="lib-note">✓ Every recommended collection is installed.</p>`;
  body.innerHTML = html;
  body.querySelectorAll("[data-ids]").forEach((b) => b.addEventListener("click", async () => {
    b.disabled = true;
    b.textContent = "OPENING…";
    Sound.click();
    await fetch("/api/library/download", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: b.dataset.ids.split(" ") }),
    });
    b.textContent = "DOWNLOADING…";
  }));
}

function toggleLibrary(show = $("#library").hidden) {
  if (show && locked) return;
  $("#library").hidden = !show;
  $("#library-btn").classList.toggle("on", show);
  if (show) { toggleThemes(false, true); renderLibrary(); }
  Sound.click();
}
$("#library-btn").addEventListener("click", () => toggleLibrary());
$("#library-close").addEventListener("click", () => toggleLibrary(false));

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
    if (!s.ollama) { st.textContent = "CORE OFFLINE"; st.className = "v bad"; }
    else if (!s.modelReady) { st.textContent = "NO MODEL"; st.className = "v bad"; }
    else { st.textContent = "READY"; st.className = "v"; }
  } catch {
    st.textContent = "NO BACKEND"; st.className = "v bad";
  }
}
refreshStatus();
setInterval(refreshStatus, 10000);

// ---------------------------------------------------------- little motion

// Spinner glyphs, cycled on one shared timer that runs only while needed.
const SPIN = "·✢✳✶✻✽✻✶✳✢".split("");
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
orb($("#intro-orb"), 19, 13);

// Digital rain: columns of random characters falling behind the intro,
// fading as they go. ~16 frames a second on a small canvas.
let rainRaf = 0;
function startRain() {
  const canvas = $("#rain");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const glyphs = "アイウエオカキクケコサシスセソ0123456789ABCDEFGHJKLMNPQRSTUVWXYZ#$%&*+=<>?/".split("");
  const size = 14;
  let cols = [], w = 0, h = 0, last = 0;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    w = canvas.width = Math.max(1, Math.floor(r.width));
    h = canvas.height = Math.max(1, Math.floor(r.height));
    cols = Array.from({ length: Math.ceil(w / size) }, () => ({ y: Math.random() * -h, speed: 0.6 + Math.random() * 0.9 }));
  };
  resize();
  new ResizeObserver(resize).observe(canvas);
  const frame = (ts) => {
    rainRaf = requestAnimationFrame(frame);
    if (ts - last < 60 || !canvas.isConnected) return;
    last = ts;
    const css = getComputedStyle(document.documentElement);
    ctx.fillStyle = css.getPropertyValue("--bg").trim() + "2e";   // translucent: older glyphs fade
    ctx.fillRect(0, 0, w, h);
    ctx.font = `${size}px ${css.getPropertyValue("--font")}`;
    const signal = css.getPropertyValue("--signal").trim();
    const shade = css.getPropertyValue("--shade-2").trim();
    cols.forEach((c, i) => {
      const ch = glyphs[(Math.random() * glyphs.length) | 0];
      ctx.fillStyle = Math.random() < 0.08 ? signal : shade;
      ctx.fillText(ch, i * size, c.y);
      c.y += size * c.speed;
      if (c.y > h + size * 4) { c.y = Math.random() * -h * 0.5; c.speed = 0.6 + Math.random() * 0.9; }
    });
  };
  rainRaf = requestAnimationFrame(frame);
}
function stopRain() { cancelAnimationFrame(rainRaf); rainRaf = 0; }
startRain();
Sound.launch();

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
function setLocked(value) {
  locked = value;
  document.body.classList.toggle("locked", locked);
  $("#lockshield").hidden = !locked;
  $("#lock-icon").textContent = locked ? "󰌾" : "󰌿";
  $("#lock").classList.toggle("on", locked);
  $("#lock").title = locked ? "Unlock" : "Lock the screen";
  hidePop();
  if (locked) { $("#themes").hidden = $("#library").hidden = true; $("#theme-btn").classList.remove("on"); $("#library-btn").classList.remove("on"); document.activeElement?.blur(); Sound.lock(); }
  else { input.focus(); Sound.unlock(); }
}
$("#lock").addEventListener("click", () => setLocked(!locked));

// While locked, swallow keys before anything else sees them.
document.addEventListener("keydown", (e) => {
  if (!locked) return;
  if (document.activeElement === $("#lock") && (e.key === "Enter" || e.key === " ")) return;
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
feed.addEventListener("wheel", (e) => { if (e.deltaY < 0) follow = false; }, { passive: true });
feed.addEventListener("keydown", (e) => { if (["ArrowUp", "PageUp", "Home"].includes(e.key)) follow = false; });
feed.addEventListener("scroll", () => {
  if (feed.scrollHeight - feed.clientHeight - feed.scrollTop < 40) follow = true;
}, { passive: true });

// ----------------------------------------------------------- source popups

const pop = $("#pop");
function showPop(s, anchor) {
  if (locked) return;
  $("#pop-n").textContent = s.n;
  const kind = $("#pop-kind");
  kind.textContent = s.kind === "local" ? "LOCAL ARCHIVE" : "WIKIPEDIA ↗";
  kind.className = "pop-kind " + s.kind;
  $("#pop-title").textContent = s.title;
  $("#pop-archive").textContent = s.kind === "local" ? s.archive : "Opens in your browser";
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

// ------------------------------------------------------------------- feed

function addUser(text) {
  const el = document.createElement("div");
  el.className = "msg user";
  el.innerHTML = `<div class="label">YOU${online ? " · ONLINE" : ""}</div><div class="body"></div>`;
  el.querySelector(".body").textContent = text;
  feed.appendChild(el);
}

function addBot() {
  const el = document.createElement("div");
  el.className = "msg bot";
  el.innerHTML = `<div class="label"><span class="spin" data-spin>✻</span> UMBRA</div>
    <div class="card"><div class="answer"></div></div>`;
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
  if (s.kind === "local") openReader(s);
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
    kind.textContent = s.kind === "local" ? "LOCAL" : "WIKIPEDIA ↗";
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
  send.classList.remove("stop");
  send.innerHTML = "TRANSMIT <kbd>⏎</kbd>";
  refreshStatus();
  if (!locked) input.focus();
}

// ------------------------------------------------------------------- ask

async function ask(question, shownAs = "") {
  if (controller || locked || !question.trim()) return;
  const intro = $("#intro");
  if (intro && !intro.classList.contains("leaving")) {
    intro.classList.add("leaving");
    stopRain();
    intro.addEventListener("animationend", () => intro.remove(), { once: true });
    setTimeout(() => intro.remove(), 900);
  }
  addUser(shownAs || question);
  const msg = addBot();
  const label = msg.querySelector(".label");
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
  const paint = (shown, live) => {
    answerEl.innerHTML = renderMarkdown(shown) + (live ? '<span class="cursor"></span>' : "");
    answerEl.querySelectorAll(".cite").forEach((c) => {
      const s = sourceByN[c.dataset.n];
      if (s) bindSource(c, s);
    });
  };
  const typer = typewriter((shown) => paint(shown, true));

  try {
    const res = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history: chat, online }),
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
  paint(shown, false);
  label.querySelector(".spin")?.remove();
  renderSources(card, sources);
  if (next && !stopped) renderNext(answerEl, next);
  if (meta) {
    const m = document.createElement("div");
    m.className = "meta";
    m.textContent = `${meta.tokens} TOKENS · ${meta.seconds}s · ${sources.length} SOURCES · ${online ? "ONLINE" : "OFFLINE"}`;
    card.appendChild(m);
  }
  chat.push({ role: "user", content: question }, { role: "assistant", content: shown });
  stopped ? Sound.error() : Sound.done();
  stopWorking();
  wake();
}

// ------------------------------------------------------------------ reader

function openReader(s) {
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

form.addEventListener("submit", (e) => {
  e.preventDefault();
  if (controller) { controller.abort(); return; }
  const q = input.value;
  input.value = "";
  autosize();
  ask(q);
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); return; }
  if (e.key.length === 1 || e.key === "Backspace") Sound.key();
});

function autosize() { input.style.height = "auto"; input.style.height = input.scrollHeight + "px"; }
input.addEventListener("input", autosize);

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !$("#modal").hidden) return;
  if (!$("#themes").hidden) toggleThemes(false);
  else if (!$("#library").hidden) toggleLibrary(false);
  else if (!$("#reader").hidden) closeReader();
  else if (controller) controller.abort();
});

document.querySelectorAll(".chip").forEach((c) => {
  c.addEventListener("mouseenter", Sound.hover);
  c.addEventListener("click", () => ask(c.textContent));
});

// umbra-wiki "question" passes it as ?q= to ask on open.
const initial = new URLSearchParams(location.search).get("q");
if (initial) ask(initial);
