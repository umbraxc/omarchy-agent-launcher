// Umbra Wiki dossiers: a conversation looks like two people talking. Umbra's
// card on the left (its personality's portrait, whose face follows the
// conversation: thinking, talking, then a mood that fits the answer), yours
// on the right above the prompt (your character: focused while you type,
// pleased when you send). Your messages sit right of centre. On a wide
// window the cards stand beside the conversation; on a narrower one they
// fold into slim bars at the edges that open over the text on hover (or a
// click). Only while a conversation is on screen. Loaded after app.js,
// loadout.js, profile.js and achievements.js.
"use strict";

(() => {
  const feed = $("#feed");
  const WIDE = 1420;   // 860 px of conversation + room for a card on each side

  function card(side) {
    const el = document.createElement("aside");
    el.className = `dossier ${side}`;
    el.hidden = true;
    el.innerHTML = `<button class="dos-tab" type="button" title="${side === "left" ? "Umbra|Who you're talking to." : "You|How Umbra sees you."}"><span>${side === "left" ? "UMBRA" : "YOU"}</span><i></i></button>
      <div class="dos-card"><div class="dos-head"><span class="dos-kind">${side === "left" ? "◆ AI · DOSSIER" : "◆ YOU · DOSSIER"}</span><b class="dos-state"></b><button class="dos-size" type="button" aria-label="Minimize ${side === "left" ? "Umbra" : "your"} dossier">MINIMIZE ▸</button></div>
        <div class="dos-portrait"><pre class="dos-face"></pre><span class="dos-mood"></span></div>
        <div class="dos-name"></div><div class="dos-sub"></div>
        <pre class="dos-line"></pre>
        <div class="dos-extra"></div>
        <dl class="dos-facts"></dl></div>`;
    document.body.appendChild(el);
    return el;
  }
  const ai = card("left"), me = card("right");

  // ------------------------------------------------------ expressions

  // Any portrait (the built-in personalities, custom ones, your character):
  // the eyes are the line that changes when it blinks, the mouth is the line
  // below them. Moods swap those characters and keep everything aligned.
  const MOODS = {
    neutral: null,
    thinking: { eyes: "°", mouth: "~" },
    talk1: { mouth: "o" }, talk2: { mouth: "O" }, talk3: { mouth: "-" },
    happy: { eyes: "^", mouth: "u" },
    serious: { eyes: "•", mouth: "_" },
    curious: { eyes: "o", mouth: "o", one: "O" },
    focused: { eyes: "•", mouth: "-" },
    blink: "blink",
  };
  function face(frames, mood) {
    const open = frames[0], shut = frames[1] || frames[0];
    if (mood === "blink") return shut;
    const m = MOODS[mood];
    if (!m) return open;
    const eyeRow = open.findIndex((l, i) => l !== shut[i]);
    if (eyeRow < 0) return open;
    const out = open.slice();
    const eyeCols = [...open[eyeRow]].map((c, i) => (c !== shut[eyeRow][i] ? i : -1)).filter((i) => i >= 0);
    if (m.eyes && eyeCols.length) {
      const row = [...out[eyeRow]];
      eyeCols.forEach((c, k) => { row[c] = m.one && k === eyeCols.length - 1 ? m.one : m.eyes; });
      out[eyeRow] = row.join("");
    }
    const mouthRow = eyeRow + 1, mid = eyeCols.length ? Math.round((eyeCols[0] + eyeCols[eyeCols.length - 1]) / 2) : -1;
    if (m.mouth && out[mouthRow] && mid >= 0 && mid < out[mouthRow].length && !/[|()[\]{}]/.test(out[mouthRow][mid])) {
      const row = [...out[mouthRow]]; row[mid] = m.mouth; out[mouthRow] = row.join("");
    }
    return out;
  }
  const MOOD_NAME = { neutral: "CALM", thinking: "THINKING", talk: "TALKING", happy: "PLEASED", serious: "SERIOUS", curious: "CURIOUS", focused: "FOCUSED" };

  // What an answer calls for.
  const SERIOUS = /\b(bleed|bleeding|wound|injur|burn|fracture|broken|poison|overdose|unconscious|cpr|not breathing|chok|stroke|heart attack|seizure|hypotherm|anaphyla|danger|emergency|attack|snake ?bite|drown|suicid)/i;
  const HAPPY = /\b(thanks|thank you|cheers|great|awesome|hello|hi|hey|good morning|good evening|love|perfect|nice)\b/i;
  const TOPICS = [["WATER", /water|purif|filter|boil/i], ["FIRE", /fire|tinder|flame|stove/i], ["SHELTER", /shelter|tent|tarp|insulat|warm/i],
    ["MEDICAL", /bleed|wound|burn|medic|injur|cpr|pain|fever|poison|bite/i], ["FOOD", /food|eat|forag|ration|cook|hunt|fish/i],
    ["NAVIGATION", /map|compass|navigat|north|lost|route/i], ["POWER", /power|solar|battery|generator|electric/i],
    ["RADIO", /radio|signal|morse|frequency|ham\b/i], ["REPAIR", /repair|fix|broken|tool|engine/i], ["WEATHER", /weather|storm|rain|snow|cold|heat/i]];

  // One clock for both faces: blinks, talking, moods.
  const who = { left: { frames: null, mood: "neutral", until: 0 }, right: { frames: null, mood: "neutral", until: 0 } };
  let beat = 0;
  function drawFaces() {
    beat++;
    for (const [side, el] of [["left", ai], ["right", me]]) {
      const w = who[side];
      if (!w.frames || el.hidden) continue;
      let mood = w.mood;
      if (mood === "talk") mood = ["talk1", "talk2", "talk3", "talk2"][beat % 4];
      const blink = mood !== "thinking" && (beat % 23 === 0 || beat % 57 === 0);
      el.querySelector(".dos-face").textContent = face(w.frames, blink ? "blink" : mood).join("\n");
      el.querySelector(".dos-mood").textContent = MOOD_NAME[w.mood] || "";
    }
  }
  const setMood = (side, mood, ms = 0) => { who[side].mood = mood; who[side].until = ms ? performance.now() + ms : 0; };

  // ------------------------------------------------------------ content

  let aiKey = "", meKey = "", answerStart = 0, lastAnswerSecs = null, topic = "—";
  const bar = (k, n = 10) => "■".repeat(Math.round(k * n)) + "□".repeat(n - Math.round(k * n));
  function fillAi() {
    const L = window.UmbraLoadout;
    const pe = L && L.persona(), sc = L && L.scenario();
    const key = [pe && pe.id, sc && sc.id].join("|");
    if (key !== aiKey && L && pe) {
      aiKey = key;
      who.left.frames = L.artOf(pe);
      ai.querySelector(".dos-name").textContent = (pe.name || "UMBRA").toUpperCase();
      ai.querySelector(".dos-sub").textContent = pe.tagline || "";
    }
    const model = ($("#t-model")?.textContent || "").trim();
    const turns = feed.querySelectorAll(".msg.bot").length;
    const cites = feed.querySelectorAll(".msg.bot .cite").length;
    const link = document.body.classList.contains("online") ? "ONLINE" : "LOCAL";
    ai.querySelector(".dos-facts").innerHTML = [["MODEL", model || "—"], ["SCENARIO", (sc && sc.name) || "—"], ["LINK", link], ["TOPIC", topic],
      ["REPLIES", turns], ["SOURCES CITED", cites], ["LAST ANSWER", lastAnswerSecs == null ? "—" : `${lastAnswerSecs} s`]]
      .map(([k, v]) => `<dt>${k}</dt><dd${k === "LINK" && v === "ONLINE" ? ' class="warn"' : ""}>${escapeHtml(String(v))}</dd>`).join("");
  }
  function fillMe() {
    const P = window.UmbraProfile, d = (P && P.data) || {};
    const A = window.UmbraAchievements && UmbraAchievements.data;
    const key = JSON.stringify([d.character, d.name, d.callsign, d.color, window.prefs && prefs.title, window.prefs && prefs.nameFx, A && A.points]);
    if (key !== meKey && P) {
      meKey = key;
      who.right.frames = P.art(d.character || {});
      const title = window.prefs && prefs.title, t = A && title && title !== "none" && (A.rewards || []).find((r) => r.id === title);
      me.querySelector(".dos-name").innerHTML = `<span class="fx-${escapeHtml((window.prefs && prefs.nameFx) || "plain")}"${d.color ? ` style="color:var(--${d.color})"` : ""}>${escapeHtml((d.name || "YOU").toUpperCase())}</span>`;
      me.querySelector(".dos-sub").innerHTML = (d.callsign ? escapeHtml(d.callsign) : "") + (t ? ` <span class="title-tag">${escapeHtml((t.unlock?.rank ? A.rank : t.name).toUpperCase())}</span>` : "");
      // Rank, with how far to the next one.
      if (A) {
        const ranks = A.ranks || [], cur = [...ranks].reverse().find((r) => A.points >= r[0]) || [0, A.rank];
        const next = A.next, k = next ? (A.points - cur[0]) / Math.max(1, next.points - cur[0]) : 1;
        me.querySelector(".dos-extra").innerHTML = `<div class="dos-rank"><span>${escapeHtml(A.rank.toUpperCase())}</span><b>${bar(k)}</b>
          <small>${next ? `${next.points - A.points} TO ${escapeHtml(next.rank.toUpperCase())}` : "HIGHEST RANK"}</small></div>`;
      }
    }
    const sent = feed.querySelectorAll(".msg.user").length, s = (A && A.stats) || {};
    me.querySelector(".dos-facts").innerHTML = [["POINTS", A ? A.points : "—"], ["DAY STREAK", s.streak ?? "—"], ["TOP TOPIC", (s.favourite || "—").toUpperCase()], ["SENT", sent]]
      .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join("");
  }

  // A line of transmission: busy while talking, a slow pulse otherwise.
  const WAVE = "▁▂▃▄▅▆▇";
  function waveLine(el, active, calm) {
    let s = "";
    for (let i = 0; i < 22; i++) {
      const v = active ? Math.abs(Math.sin(i * 0.9 + beat * 0.8) * Math.cos(i * 0.37 - beat * 0.5)) : calm ? 0.08 + 0.1 * Math.max(0, Math.sin(i * 0.6 - beat * 0.35)) : 0;
      s += WAVE[Math.min(WAVE.length - 1, Math.round(v * (WAVE.length - 1)))];
    }
    el.querySelector(".dos-line").textContent = s;
  }

  // ------------------------------------------------------------- states

  let lastLen = 0, growing = 0, wasBusy = false, sentAt = 0, lastUser = 0;
  function states() {
    const now = performance.now();
    const last = [...feed.querySelectorAll(".msg.bot .answer")].pop();
    const len = last ? last.textContent.length : 0;
    growing = len > lastLen ? 5 : Math.max(0, growing - 1);
    lastLen = len;
    const busy = !!(typeof controller !== "undefined" && controller);
    const aiState = busy ? (growing ? "TRANSMITTING" : "THINKING") : "STANDING BY";
    ai.dataset.state = aiState.toLowerCase().replace(" ", "-");
    ai.querySelector(".dos-state").textContent = aiState;
    if (busy && !wasBusy) { pop(ai); answerStart = now; }
    if (busy) setMood("left", growing ? "talk" : "thinking");
    if (!busy && wasBusy) {
      lastAnswerSecs = Math.round((now - answerStart) / 1000);
      const said = (last ? last.textContent : "") + " " + ([...feed.querySelectorAll(".msg.user .body")].pop()?.textContent || "");
      setMood("left", SERIOUS.test(said) ? "serious" : HAPPY.test(said) ? "happy" : /\?\s*$/.test(last ? last.textContent.trim() : "") ? "curious" : "neutral", 20000);
    }
    if (!busy && who.left.until && now > who.left.until) setMood("left", "neutral");
    wasBusy = busy;
    // You: typing, or just sent.
    const users = [...feed.querySelectorAll(".msg.user .body")];
    if (users.length > lastUser) {
      sentAt = now; pop(me);
      const q = users[users.length - 1].textContent;
      const t = TOPICS.find(([, re]) => re.test(q));
      if (t) topic = t[0];
      setMood("right", SERIOUS.test(q) ? "serious" : "happy", 2500);
    }
    lastUser = users.length;
    const typing = $("#q") && $("#q").value.length > 0;
    const meState = now - sentAt < 2200 ? "SENT" : typing ? "TYPING" : "LISTENING";
    me.dataset.state = meState.toLowerCase();
    me.querySelector(".dos-state").textContent = meState;
    if (!who.right.until || now > who.right.until) setMood("right", typing ? "focused" : "neutral");
    const calm = !document.body.classList.contains("reduce-motion") && !window.offgrid;
    waveLine(ai, aiState === "TRANSMITTING", calm);
    waveLine(me, meState === "TYPING", calm);
  }
  // Glitches in, like a country file on the map.
  function pop(el) {
    const c = el.querySelector(".dos-card");
    c.classList.remove("glitch"); void c.offsetWidth; c.classList.add("glitch");
  }

  // ------------------------------------------------------------- layout

  function layout() {
    const chatting = !!feed.querySelector(".msg") && !document.body.classList.contains("touring");
    const wide = innerWidth >= WIDE;
    for (const el of [ai, me]) {
      const was = el.hidden;
      el.hidden = !chatting;
      el.classList.toggle("can-dock", wide);
      el.classList.toggle("docked", wide && !el.classList.contains("minimized"));
      const size = el.querySelector(".dos-size");
      size.textContent = el.classList.contains("minimized") ? "RESTORE ◂" : "MINIMIZE ▸";
      size.setAttribute("aria-label", `${el.classList.contains("minimized") ? "Restore" : "Minimize"} ${el === ai ? "Umbra" : "your"} dossier`);
      if (!wide && el.hidden) el.classList.remove("open");
      if (was && !el.hidden && wide) pop(el);
    }
    document.body.classList.toggle("dos-chat", chatting);
    // Yours sits just above the prompt.
    const dock = $(".dock"), h = dock ? dock.getBoundingClientRect().height : 150;
    me.style.setProperty("--dock", h + "px");
  }

  // The folded bars open over the text on hover (and stay open on a click).
  for (const el of [ai, me]) {
    const tab = el.querySelector(".dos-tab");
    let pinned = false, closeTimer = 0;
    const set = (on) => { if (el.classList.contains("docked")) return; el.classList.toggle("open", on); if (on) pop(el); };
    el.addEventListener("mouseenter", () => { clearTimeout(closeTimer); if (!el.classList.contains("open")) { set(true); Sound.hover(); } });
    el.addEventListener("mouseleave", () => { if (!pinned) closeTimer = setTimeout(() => set(false), 350); });
    tab.addEventListener("click", () => { pinned = !el.classList.contains("open") || !pinned; set(pinned); Sound.click(); });
    el.querySelector(".dos-size").addEventListener("click", () => {
      pinned = false; el.classList.remove("open");
      el.classList.toggle("minimized"); layout(); Sound.click();
    });
  }

  // Only while the cards can be seen (not behind the map, the radar or another window).
  const seen = () => !ai.hidden && !document.hidden && !/(maps|radar)-open/.test(document.body.className) && !document.body.classList.contains("locked");
  const tick = () => { if (seen()) { fillAi(); fillMe(); states(); } };
  new MutationObserver(() => { layout(); tick(); }).observe(feed, { childList: true });
  addEventListener("resize", layout);
  setInterval(tick, 400);
  setInterval(() => { if (seen()) drawFaces(); }, 170);
  setInterval(layout, 1500);
  layout();
})();
