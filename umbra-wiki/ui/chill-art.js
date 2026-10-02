// Conversation scenery: a 3D ASCII landscape (scenery-lib.js) under an answer
// when the conversation is about something it shows: mountains for a hike,
// the lighthouse for the sea. At most one an hour, so it stays special,
// unless the user has clearly moved on to a different subject that has its
// own scene. Never for emergencies or medical questions, never off-grid.
// Scene IDs are stored in History and replay without the AI or the network.
"use strict";
(() => {
  const lib = window.UmbraScenery;
  const HOUR = 3600e3;
  // A pause in an emergency is the wrong moment for scenery.
  const URGENT = /\b(bleed\w*|blood|cpr|chok\w*|unconscious|not breathing|poison\w*|overdose|heart attack|stroke|seizure|burns?|fractur\w*|broken (bone|leg|arm)|anaphyla\w*|allerg\w* reaction|suicid\w*|self[- ]harm|chest pain|emergency|ambulance|911|999|112|wound\w*|injur\w*|hypotherm\w*|frostbite|heat ?stroke|drown\w*|snake ?bite|bitten|sting|tourniquet|shock|fever|pregnan\w*|labou?r|medic\w*|dose|symptom\w*|pain|hurt\w*|lost and|trapped|attack\w*|danger\w*)\b/i;
  const RELAXED = /\b(fun fact|interesting fact|random fact|tell me (a |another |some )?(story|stories)|how are you|what'?s up|quiet|stillness|relax\w*|chill|vibe|beautiful day|daydream|peaceful|calm me)\b/i;
  const CALM = ["dawn", "lake", "meadow", "stars", "valley", "forest", "orchard", "aurora"];
  let last = { at: 0, id: "", turn: -99 };

  const matches = (text) => lib ? lib.ids.filter((id) => lib.scenes[id].tags.test(text || "")) : [];
  function remembered() {
    const p = window.prefs || {};
    if (typeof p.sceneryAt === "number" && p.sceneryAt > last.at) last = { ...last, at: p.sceneryAt, id: p.sceneryScene || "" };
    return last;
  }

  // ctx: { answer, sky, failed, history: [{role, content}] (before this turn) }
  function select(question, turn, ctx = {}) {
    if (!lib || window.offgrid || ctx.sky || ctx.failed) return "";
    const q = String(question || "");
    if (URGENT.test(q) || URGENT.test(String(ctx.answer || "").slice(0, 400))) return "";
    const prev = remembered(), now = Date.now();
    let found = matches(q);
    // Nothing in the question: the answer may still be clearly about one place.
    if (!found.length && q.split(/\s+/).length >= 4) {
      const inAnswer = matches(String(ctx.answer || "").slice(0, 700));
      if (inAnswer.length === 1) found = inAnswer;
    }
    let pick = found.find((id) => id !== prev.id) || found[0] || "";
    if (!pick && RELAXED.test(q) && Math.random() < .35) {
      const choices = CALM.filter((id) => id !== prev.id);
      pick = choices[Math.floor(Math.random() * choices.length)];
    }
    if (!pick) return "";
    const hourPassed = now - prev.at >= HOUR;
    if (!hourPassed) {
      // Within the hour only a clearly new subject earns a new scene: a
      // different scene, the last one's subject absent from the user's two
      // latest messages, and a few turns since.
      const lastTags = prev.id && lib.scenes[prev.id] ? lib.scenes[prev.id].tags : null;
      const recentUser = (ctx.history || []).filter((m) => m.role === "user").slice(-1).map((m) => m.content).concat(q);
      const movedOn = pick !== prev.id && (!lastTags || !recentUser.some((t) => lastTags.test(t))) && turn - prev.turn >= 3 && found.includes(pick);
      if (!movedOn) return "";
    }
    last = { at: now, id: pick, turn };
    if (window.prefs) Object.assign(window.prefs, { sceneryAt: now, sceneryScene: pick });
    if (typeof postSettings === "function") postSettings({ sceneryAt: now, sceneryScene: pick });
    return pick;
  }

  function render(after, id) {
    if (!lib || !lib.scenes[id] || !window.Ascii3D) return;
    const card = document.createElement("div");
    card.className = "chat-scene";
    card.setAttribute("role", "img");
    card.setAttribute("aria-label", lib.scenes[id].name);
    card.innerHTML = `<span><b>UMBRA // SCENERY</b> ${escapeHtml(lib.scenes[id].name.toUpperCase())}</span><canvas aria-hidden="true"></canvas>`;
    after.after(card);
    const view = window.Ascii3D.view(card.querySelector("canvas"), lib.scenes[id].build(), { cell: 10, font: getComputedStyle(document.documentElement).getPropertyValue("--font").trim() || "monospace" });
    // Stop drawing once the card leaves the page (a new conversation).
    const watch = setInterval(() => { if (!card.isConnected) { view.stop(); clearInterval(watch); } }, 5000);
  }

  window.UmbraChill = { select, render, ids: lib ? lib.ids : [] };
})();
