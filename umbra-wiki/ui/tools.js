// Umbra Wiki tools and quick actions. Umbra's own tools (Field Kit tabs,
// maps, radar, library, manual pages) have ids that open them; after an
// answer, the tools that fit the question are offered as buttons under it.
// Tab in an empty prompt opens a small menu above it: likely replies, the
// fitting tools and, on the start screen, a few questions to start with.
// The prompt's placeholder slowly cycles through example questions.
// Loaded after app.js (uses $, Sound, escapeHtml, input, ask, loadManual,
// openManual, openedFrom).
"use strict";

(() => {
  const G = {   // icons (JetBrains Mono Nerd Font)
    medic: "\u{F02E0}", sky: "\u{F0599}", box: "\u{F03D6}", vault: "\u{F0A6A}", school: "\u{F0474}", card: "\u{F0B78}",
    map: "\u{F034D}", radar: "\u{F0437}", book: "\u{F125F}", page: "\u{F0219}", reply: "\u{F045A}", ask: "\u{F1738}",
  };
  const kit = (tab, sub) => () => window.UmbraFieldKit && UmbraFieldKit.open(tab, sub);
  // id: [name, what it does, icon, words that call for it, open]
  const TOOLS = {
    "kit:medic": ["CPR metronome & first aid", "Field Kit: CPR beat, first-aid timers, triage and patient tools", G.medic,
      /\b(cpr|resuscitat|heart ?attack|cardiac|not breathing|unconscious|bleed|bleeding|tourniquet|wound|burn|fracture|broken bone|splint|triage|pulse|choking|shock|casualt|patient|first aid|injur|concussion|hypotherm|heat ?stroke|allerg|anaphyla|epipen|dose|dosing|fever)/i, kit("medic")],
    "kit:sky": ["Sun & moon", "Sunrise, sunset, daylight left, moon phase and moonlight", G.sky,
      /\b(sunrise|sunset|daylight|dusk|dawn|twilight|moon|night ?time|how long (until|till) dark|nightfall|solstice)/i, kit("sky")],
    "kit:supplies": ["Supplies", "How long your water and food last for your household", G.box,
      /\b(supplies|stockpile|ration|how long (will|would|does) .*(last|food|water)|food storage|water storage|calories|household)/i, kit("supplies")],
    "kit:calendar": ["Calendar", "Reminders, and when your water and food run out", "\u{F00ED}",
      /\b(remind|reminder|calendar|schedule|appointment|deadline|expir|best before|when will .* run out|rotate (my|the) (water|food|stock))/i, kit("calendar")],
    "kit:vault": ["The Vault", "Your arsenal: firearms, ammunition and defence gear, behind your password", G.vault,
      /\b(gun|guns|firearm|rifle|pistol|shotgun|handgun|ammo|ammunition|caliber|calibre|cartridge|self[- ]defen[cs]e|arsenal|vault|crossbow|pepper spray)/i, kit("vault")],
    "kit:training": ["Training", "Morse, signal lamp, phonetic alphabet, drills and knots", G.school,
      /\b(morse|signal (for help|lamp|mirror)|sos|knot|phonetic|alpha bravo|semaphore|hand signal|radio (call|procedure)|prowords?|pace count|salute report|9[- ]line)/i, kit("training")],
    "kit:cards": ["Pocket cards", "Printable cards for your wallet or go-bag", G.card,
      /\b(print|pocket card|wallet card|laminat|cheat ?sheet|go[- ]?bag card)/i, kit("cards")],
    maps: ["Maps", "Offline maps, search, MGRS, waypoints and country files", G.map,
      /\b(map|maps|coordinates?|mgrs|grid reference|latitude|longitude|navigate|navigation|compass bearing|waypoint|route|evacuat|where is|topograph)/i,
      () => window.toggleMaps && toggleMaps(true)],
    radar: ["Signals & radar", "Nearby Wi-Fi and Bluetooth signals around you, and your device's vitals", G.radar,
      /\b(wi-?fi|bluetooth|wireless|signal strength|nearby (networks|devices)|scan(ning)? for|radar|hotspot|access point)/i,
      () => window.toggleRadar && toggleRadar(true)],
    library: ["Library", "Offline collections: medicine, repairs, outdoors, water, food", G.book,
      /\b(library|offline (books|collections|wikipedia)|download (books|more knowledge))/i,
      () => window.toggleLibrary && toggleLibrary(true)],
  };

  // The tools that fit a question and its answer (at most two), plus a
  // matching page of the field manual.
  let pages = [];
  loadManual().then((p) => (pages = p || [])).catch(() => {});
  function toolsFor(question, answer = "") {
    const q = String(question || ""), both = q + "\n" + String(answer || "").slice(0, 1500);
    const out = [];
    for (const [id, t] of Object.entries(TOOLS)) {
      if (id === "radar" && !window.toggleRadar) continue;
      if (id === "kit:vault" && !(window.UmbraFieldKit && UmbraFieldKit.hasVault)) continue;
      // The question counts most; the answer only for the medical kit.
      if (t[3].test(q) || (id === "kit:medic" && t[3].test(both) && /\b(cpr|bleed|tourniquet|burn|fracture|wound)/i.test(both))) out.push(id);
    }
    const words = q.toLowerCase().match(/[a-z]{4,}/g) || [];
    const page = pages.find((p) => { const t = p.title.toLowerCase(); return words.some((w) => t.includes(w.replace(/(ing|ed|s)$/, ""))); });
    if (page) out.unshift("manual:" + page.id);
    return out.slice(0, 2);
  }
  function info(id) {
    if (id.startsWith("manual:")) {
      const p = pages.find((x) => x.id === id.slice(7));
      return p ? [p.title, "Umbra Field Manual · " + p.category, G.page] : null;
    }
    const t = TOOLS[id];
    return t ? [t[0], t[1], t[2]] : null;
  }
  function open(id) {
    Sound.click();
    if (id.startsWith("manual:")) { openManual(id.slice(7)); return; }
    const t = TOOLS[id];
    if (t) t[4]();
  }

  // Buttons under an answer: ▸ OPEN CPR METRONOME & FIRST AID.
  function renderTools(answerEl, rec) {
    const ids = toolsFor(rec.question, rec.answer).filter((id) => info(id));
    if (!ids.length) return;
    const row = document.createElement("div");
    row.className = "toolrow";
    row.innerHTML = ids.map((id) => { const [name, line, icon] = info(id);
      return `<button class="toolchip" data-id="${escapeHtml(id)}" title="${escapeHtml(name)}|${escapeHtml(line)}"><span class="g">${icon}</span>OPEN ${escapeHtml(name.toUpperCase())} ▸</button>`; }).join("");
    row.querySelectorAll(".toolchip").forEach((b) => {
      b.addEventListener("mouseenter", Sound.hover);
      b.addEventListener("click", () => open(b.dataset.id));
    });
    answerEl.after(row);
  }

  // -------------------------------------------------------- the Tab menu

  let menu = null, items = [], sel = 0;
  let replies = [];   // likely replies to the last answer, from app.js
  let lastRec = null;
  function setReplies(list, rec) {
    const was = replies.map((r) => r.text).join("|");
    replies = list || [];
    if (rec) lastRec = rec;
    // New replies are typed in at once, then take turns; when they go (a new
    // question), the usual hint comes back the same way, never with a jump.
    if (replies.length && replies.map((r) => r.text).join("|") !== was) setTimeout(() => cycle(true), 60);
    if (!replies.length && was) typeHint(DEFAULT_HINT, false);
  }

  function gather() {
    const out = [];
    for (const r of replies.slice(0, 3)) out.push({ kind: "REPLY", icon: G.reply, label: r.text, run: () => fill(r.text) });
    if (lastRec) for (const id of toolsFor(lastRec.question, lastRec.answer)) {
      const i = info(id);
      if (i) out.push({ kind: "TOOL", icon: i[2], label: i[0], line: i[1], run: () => open(id) });
    }
    if (!lastRec || !document.querySelector("#feed .msg")) {
      // The start screen: a few of its questions, and a tool.
      [...document.querySelectorAll("#intro .prompts > *")].slice(0, 3).forEach((b) => {
        const q = b.dataset.text || b.textContent.trim();
        if (!q) return;
        out.push({ kind: "ASK", icon: G.ask, label: q, run: () => ask(q) });
      });
      out.push({ kind: "TOOL", icon: G.medic, label: TOOLS["kit:medic"][0], line: TOOLS["kit:medic"][1], run: () => open("kit:medic") });
    }
    return out.slice(0, 5);
  }
  function fill(text) {
    input.value = text;
    input.dispatchEvent(new Event("input"));
    input.setSelectionRange(text.length, text.length);
    input.focus();
  }
  function show() {
    items = gather();
    if (!items.length) return false;
    sel = 0;
    if (!menu) {
      menu = document.createElement("div");
      menu.className = "tabmenu";
      $("#ask").appendChild(menu);
      menu.addEventListener("mousedown", (e) => e.preventDefault());
    }
    menu.innerHTML = `<div class="tm-head"><span>⇥ QUICK ACTIONS</span><small>↑↓ CHOOSE · ⏎ USE · ESC CLOSE</small></div>` +
      items.map((it, i) => `<button class="tm-item" data-i="${i}"><span class="g">${it.icon}</span>
        <span class="tm-text"><b></b>${it.line ? "<small></small>" : ""}</span><em>${it.kind}</em></button>`).join("");
    menu.querySelectorAll(".tm-item").forEach((b, i) => {
      b.querySelector("b").textContent = items[i].label;
      if (items[i].line) b.querySelector("small").textContent = items[i].line;
      b.addEventListener("mouseenter", () => { sel = i; mark(); Sound.hover(); });
      b.addEventListener("click", () => pick(i));
    });
    mark();
    menu.classList.remove("out");
    menu.hidden = false;
    Sound.key();
    return true;
  }
  const isOpen = () => menu && !menu.hidden;
  function hide() {
    if (!isOpen()) return;
    menu.classList.add("out");
    setTimeout(() => { if (menu.classList.contains("out")) menu.hidden = true; }, 160);
  }
  function mark() { menu.querySelectorAll(".tm-item").forEach((b, i) => b.classList.toggle("on", i === sel)); }
  function pick(i) { const it = items[i]; hide(); if (it) { if (window.track) track("suggestions"); it.run(); } }

  input.addEventListener("keydown", (e) => {
    if (isOpen()) {
      if (e.key === "ArrowDown" || (e.key === "Tab" && !e.shiftKey)) { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + 1) % items.length; mark(); Sound.hover(); return; }
      if (e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)) { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel - 1 + items.length) % items.length; mark(); Sound.hover(); return; }
      if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); pick(sel); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); hide(); return; }
      hide();
      return;
    }
    if (e.key === "Tab" && !e.shiftKey && !input.value && !document.body.classList.contains("touring")) {
      if (show()) { e.preventDefault(); e.stopImmediatePropagation(); }
    }
  }, true);
  input.addEventListener("blur", () => setTimeout(hide, 120));

  // ------------------------------------------- the prompt's placeholder

  // Every so often the example in the prompt types itself anew, so the
  // empty prompt feels alive (never while a suggestion shows or you type).
  const EXAMPLES = [
    "Ask anything: water, fire, wounds, repairs, power…",
    "How do I purify water with what's around me?",
    "Someone is bleeding heavily. What do I do first?",
    "How do I keep warm through a night outside?",
    "The power is out. What should I check first?",
    "How much water does my household need a day?",
    "How do I signal for help without a phone?",
  ];
  // After an answer the likely replies take turns in the prompt, typed in
  // the reply colour; before that, example questions.
  // This is the only place that writes the prompt's hint: the old text is
  // wiped quickly, then the new one typed in, each in its own single colour
  // (replies in the reply colour, everything else faint), so it never jumps.
  const DEFAULT_HINT = input.placeholder;
  let ex = 0, typing = 0, cycleTimer = 0;
  function typeHint(text, reply) {
    clearTimeout(typing);
    const tail = reply ? "    ⇥ TAB" : "";
    const target = text + tail;
    const finish = () => {   // typing started, or no motion: show it whole, at once
      input.classList.remove("typing-hint");
      input.classList.toggle("suggest", !!reply);
      input.placeholder = target;
    };
    if (document.body.classList.contains("reduce-motion") || window.offgrid || input.value) return finish();
    if (input.placeholder === target && input.classList.contains("suggest") === !!reply) return;
    input.classList.add("typing-hint");
    let shown = input.placeholder.replace("▌", ""), i = 0;
    const type = () => {
      if (input.value) return finish();
      input.placeholder = target.slice(0, ++i) + (i < target.length ? "▌" : "");   // "⇥ TAB" types in too
      if (i < target.length) typing = setTimeout(type, i > text.length ? 18 : 24 + Math.random() * 26);
      else input.classList.remove("typing-hint");
    };
    const wipe = () => {
      if (input.value) return finish();
      if (shown.length) {
        shown = shown.slice(0, -Math.max(2, Math.ceil(shown.length / 12)));
        input.placeholder = shown + "▌";
        typing = setTimeout(wipe, 16);
        return;
      }
      input.classList.toggle("suggest", !!reply);   // the colour changes while the line is empty
      type();
    };
    wipe();
  }
  function cycle(now = false) {
    clearTimeout(cycleTimer);
    const calm = !input.value && !isOpen() && !locked && !controller && !document.body.classList.contains("touring");
    const list = replies.length ? replies.map((r) => r.text) : EXAMPLES;
    if (calm && (now || list.length > 1 || !replies.length)) {
      ex = (ex + 1) % list.length;
      typeHint(list[replies.length ? (now ? 0 : ex) : ex], replies.length > 0);
      if (now) ex = 0;
    }
    cycleTimer = setTimeout(cycle, replies.length ? 7000 + Math.random() * 2000 : 14000 + Math.random() * 6000);
  }
  cycleTimer = setTimeout(cycle, 16000);

  window.UmbraTools = { toolsFor, info, open, renderTools, setReplies, showMenu: show, hideMenu: hide, TOOLS };
})();
