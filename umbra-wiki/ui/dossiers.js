// Umbra Wiki dossiers: a conversation looks like two people talking. Umbra's
// card on the left (its personality's portrait, what it's doing: standing
// by, thinking, transmitting), yours on the right above the prompt (your
// character, name, title, rank; typing, sent). Your messages sit right of
// centre. On a wide window the cards stand beside the conversation; on a
// narrower one they fold into slim bars at the edges that open on hover (or
// a click) and push the conversation aside to make room. Only while a
// conversation is on screen. Loaded after app.js, loadout.js, profile.js
// and achievements.js.
"use strict";

(() => {
  const feed = $("#feed");
  const WIDE = 1380;   // 860 px of conversation + room for a card on each side

  function card(side) {
    const el = document.createElement("aside");
    el.className = `dossier ${side}`;
    el.hidden = true;
    el.innerHTML = `<button class="dos-tab" type="button" title="${side === "left" ? "Umbra|Who you're talking to." : "You|How Umbra sees you."}"><span>${side === "left" ? "UMBRA" : "YOU"}</span><i></i></button>
      <div class="dos-card"><div class="dos-head"><span class="dos-kind">${side === "left" ? "◆ AI" : "◆ YOU"}</span><b class="dos-state"></b></div>
        <pre class="dos-face"></pre><div class="dos-name"></div><div class="dos-sub"></div>
        <div class="dos-wave"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        <dl class="dos-facts"></dl></div>`;
    document.body.appendChild(el);
    return el;
  }
  const ai = card("left"), me = card("right");

  // ------------------------------------------------------------ content

  let faceStops = { left: null, right: null }, aiKey = "", meKey = "";
  function fillAi() {
    const L = window.UmbraLoadout;
    const pe = L && L.persona(), sc = L && L.scenario();
    const key = [pe && pe.id, sc && sc.id].join("|");
    if (key !== aiKey && L && pe) {
      aiKey = key;
      if (faceStops.left) faceStops.left();
      faceStops.left = L.animate(ai.querySelector(".dos-face"), L.artOf(pe), "personality");
      ai.querySelector(".dos-name").textContent = (pe.name || "UMBRA").toUpperCase();
      ai.querySelector(".dos-sub").textContent = pe.tagline || "";
    }
    const model = ($("#t-model")?.textContent || "").trim();
    const turns = feed.querySelectorAll(".msg.bot").length;
    const sources = feed.querySelectorAll(".msg.bot .cite").length;
    ai.querySelector(".dos-facts").innerHTML = [["MODEL", model || "—"], ["SCENARIO", (sc && sc.name) || "—"], ["REPLIES", turns], ["CITES", sources]]
      .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v))}</dd>`).join("");
  }
  function fillMe() {
    const P = window.UmbraProfile, d = (P && P.data) || {};
    const A = window.UmbraAchievements && UmbraAchievements.data;
    const key = JSON.stringify([d.character, d.name, d.callsign, d.color, window.prefs && prefs.title, window.prefs && prefs.nameFx, A && A.rank]);
    if (key !== meKey && P) {
      meKey = key;
      if (faceStops.right) faceStops.right();
      faceStops.right = window.UmbraLoadout ? UmbraLoadout.animate(me.querySelector(".dos-face"), P.art(d.character || {}), "personality") : null;
      const title = window.prefs && prefs.title, t = A && title && title !== "none" && (A.rewards || []).find((r) => r.id === title);
      me.querySelector(".dos-name").innerHTML = `<span class="fx-${escapeHtml((window.prefs && prefs.nameFx) || "plain")}"${d.color ? ` style="color:var(--${d.color})"` : ""}>${escapeHtml((d.name || "YOU").toUpperCase())}</span>`;
      me.querySelector(".dos-sub").innerHTML = (d.callsign ? escapeHtml(d.callsign) : "") + (t ? ` <span class="title-tag">${escapeHtml(t.name.toUpperCase())}</span>` : "");
    }
    const sent = feed.querySelectorAll(".msg.user").length;
    me.querySelector(".dos-facts").innerHTML = [["RANK", (A && A.rank) || "—"], ["POINTS", A ? A.points : "—"], ["SENT", sent]]
      .map(([k, v]) => `<dt>${k}</dt><dd>${escapeHtml(String(v).toUpperCase())}</dd>`).join("");
  }

  // ------------------------------------------------------------- states

  let lastLen = 0, growing = 0, wasBusy = false, sentAt = 0, lastUser = 0;
  function states() {
    // Umbra: transmitting while its answer grows, thinking before that.
    const last = [...feed.querySelectorAll(".msg.bot .answer")].pop();
    const len = last ? last.textContent.length : 0;
    growing = len > lastLen ? 6 : Math.max(0, growing - 1);
    lastLen = len;
    const busy = !!(typeof controller !== "undefined" && controller);
    const aiState = busy ? (growing ? "TRANSMITTING" : "THINKING") : "STANDING BY";
    ai.dataset.state = aiState.toLowerCase().replace(" ", "-");
    ai.querySelector(".dos-state").textContent = aiState;
    if (busy && !wasBusy) pop(ai);
    wasBusy = busy;
    // You: typing, or just sent.
    const users = feed.querySelectorAll(".msg.user").length;
    if (users > lastUser) { sentAt = performance.now(); pop(me); }
    lastUser = users;
    const typing = $("#q") && $("#q").value.length > 0;
    const meState = performance.now() - sentAt < 2200 ? "SENT" : typing ? "TYPING" : "LISTENING";
    me.dataset.state = meState.toLowerCase();
    me.querySelector(".dos-state").textContent = meState;
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
      el.classList.toggle("docked", wide);
      if (!wide && el.hidden) el.classList.remove("open");
      if (was && !el.hidden && wide) pop(el);
    }
    document.body.classList.toggle("dos-chat", chatting);
    document.body.classList.toggle("dos-push-left", chatting && !wide && ai.classList.contains("open"));
    document.body.classList.toggle("dos-push-right", chatting && !wide && me.classList.contains("open"));
    // Yours sits just above the prompt.
    const dock = $(".dock"), h = dock ? dock.getBoundingClientRect().height : 150;
    me.style.setProperty("--dock", h + "px");
  }

  // The folded bars open on hover (and stay open on a click).
  for (const el of [ai, me]) {
    const tab = el.querySelector(".dos-tab");
    let pinned = false, closeTimer = 0;
    const set = (on) => { if (el.classList.contains("docked")) return; el.classList.toggle("open", on); layout(); };
    el.addEventListener("mouseenter", () => { clearTimeout(closeTimer); if (!el.classList.contains("open")) { set(true); Sound.hover(); } });
    el.addEventListener("mouseleave", () => { if (!pinned) closeTimer = setTimeout(() => set(false), 350); });
    tab.addEventListener("click", () => { pinned = !el.classList.contains("open") || !pinned; set(pinned); Sound.click(); });
  }

  const tick = () => { if (!ai.hidden) { fillAi(); fillMe(); states(); } };
  new MutationObserver(() => { layout(); tick(); }).observe(feed, { childList: true });
  addEventListener("resize", layout);
  setInterval(tick, 400);
  setInterval(layout, 1500);
  layout();
})();
