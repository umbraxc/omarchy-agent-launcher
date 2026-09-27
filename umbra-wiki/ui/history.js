// Umbra Wiki history: every conversation is saved on this computer
// (~/.local/share/umbra-wiki/history) and can be reopened and continued from
// the History panel. Loaded after app.js and uses its helpers ($, Sound,
// feed, chat, controller, locked, addUser, addBot, finishAnswer, showIntro,
// stopRain, toggleThemes, confirmDialog, suggestFor, setSuggestion).
"use strict";

(() => {
  const panel = $("#history");
  const list = $("#hist-list");
  const filter = $("#hist-filter");
  let convo = null;     // { id, title, messages } of the conversation on screen
  let items = [];
  let dir = "";

  const pad = (n) => String(n).padStart(2, "0");
  const newId = () => {
    const d = new Date();
    return `c-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-` +
      `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-` +
      Math.random().toString(36).slice(2, 6).padEnd(4, "0");
  };

  // ---------------------------------------------------------- saving

  // app.js calls this when an answer finishes.
  window.recordTurn = async (rec) => {
    if (!convo) convo = { id: newId(), title: (rec.shown || rec.question).slice(0, 120), messages: [] };
    convo.messages.push(rec);
    const [scenario = "", personality = ""] = ($("#loadout-chip").textContent || "").split(" · ");
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...convo, scenario, personality }),
      });
    } catch {}
    if (!panel.hidden) load();
  };

  // ---------------------------------------------------------- listing

  const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  function dayLabel(ms) {
    const d = new Date(ms), now = new Date();
    const days = Math.round((dayStart(now) - dayStart(d)) / 864e5);
    if (days === 0) return "TODAY";
    if (days === 1) return "YESTERDAY";
    return d.toLocaleDateString(undefined, {
      weekday: days < 7 ? "long" : undefined, day: "numeric", month: "short",
      year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
    }).toUpperCase();
  }
  const timeOf = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  async function load() {
    try {
      const r = await (await fetch("/api/history")).json();
      items = r.items || [];
      dir = r.dir || "";
    } catch { items = []; }
    render();
  }

  function render() {
    const q = filter.value.trim().toLowerCase();
    const shown = items.filter((c) => !q || (c.title || "").toLowerCase().includes(q));
    list.innerHTML = !items.length
      ? `<p class="lib-note">No conversations yet. Everything you ask is saved here automatically.</p>`
      : !shown.length ? `<p class="lib-note">Nothing matches that filter.</p>` : "";
    let day = "";
    shown.forEach((c, i) => {
      const label = dayLabel(c.updated);
      if (label !== day) {
        day = label;
        const h = document.createElement("div");
        h.className = "lib-head";
        h.textContent = label;
        list.appendChild(h);
      }
      const row = document.createElement("div");
      row.className = "hist-row" + (convo && convo.id === c.id ? " current" : "");
      row.style.animationDelay = Math.min(i, 12) * 25 + "ms";
      row.innerHTML = `<button class="hopen"><span class="htitle"></span><span class="hmeta"></span></button>
        <button class="hdel ghost" title="Delete this conversation">✕</button>`;
      row.querySelector(".htitle").textContent = c.title;
      row.querySelector(".hmeta").textContent = [
        timeOf(c.updated),
        `${c.count} ${c.count === 1 ? "ANSWER" : "ANSWERS"}`,
        c.scenario && c.personality ? `${c.scenario} · ${c.personality}` : "",
      ].filter(Boolean).join("  ·  ");
      row.querySelector(".hopen").addEventListener("mouseenter", Sound.hover);
      row.querySelector(".hopen").addEventListener("click", () => openConvo(c.id));
      row.querySelector(".hdel").addEventListener("click", () => remove(c));
      list.appendChild(row);
    });
    $("#hist-foot").innerHTML = dir ? `Saved on this computer only, in <code></code>` : "";
    if (dir) $("#hist-foot code").textContent = dir;
  }

  // -------------------------------------------------------- actions

  function busy() {
    if (!controller) return false;
    confirmDialog({ kind: "error", tag: "BUSY", title: "UMBRA IS STILL ANSWERING",
      body: "Wait for the answer to finish, or press Esc to stop it first.", cancel: "OK" });
    return true;
  }

  async function openConvo(id) {
    if (busy()) return;
    let c;
    try {
      const r = await fetch("/api/history/" + encodeURIComponent(id));
      if (!r.ok) throw new Error();
      c = await r.json();
    } catch { Sound.error(); load(); return; }
    convo = { id: c.id, title: c.title, messages: c.messages || [] };
    stopRain();
    feed.innerHTML = "";
    chat.length = 0;
    for (const m of convo.messages) {
      addUser(m.shown || m.question, m.online);
      finishAnswer(addBot(m.persona || ""), m);
      chat.push({ role: "user", content: m.question }, { role: "assistant", content: m.answer });
    }
    const last = convo.messages[convo.messages.length - 1];
    if (last) suggestFor(last);
    toggle(false, true);
    Sound.theme();
    requestAnimationFrame(() => { feed.scrollTop = feed.scrollHeight; });
    input.focus();
  }

  function newConvo() {
    if (busy()) return;
    convo = null;
    chat.length = 0;
    suggestToken++;
    setSuggestion("");
    showIntro();
    toggle(false, true);
    Sound.theme();
    input.focus();
  }

  async function remove(c) {
    const ok = await confirmDialog({
      kind: "to-local", tag: "DELETE", title: "DELETE THIS CONVERSATION?",
      body: `"${c.title}" will be removed from this computer. This can't be undone.`, ok: "DELETE", cancel: "KEEP",
    });
    if (!ok) return;
    try {
      await fetch("/api/history/delete", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }),
      });
    } catch {}
    if (convo && convo.id === c.id) convo = null;   // what's on screen stays; new answers start a new entry
    load();
  }

  // ---------------------------------------------------- open / close

  function toggle(show = panel.hidden, quiet = false) {
    if (show && locked) return;
    if (show === !panel.hidden) return;
    panel.hidden = !show;
    $("#history-btn").classList.toggle("on", show);
    if (show) {
      toggleThemes(false, true);
      $("#library").hidden = true;
      $("#library-btn").classList.remove("on");
      if (window.closeLoadout) window.closeLoadout(true);
      filter.value = "";
      load();
    }
    if (!quiet) Sound.click();
  }
  window.closeHistory = () => toggle(false, true);

  $("#history-btn").addEventListener("click", () => toggle());
  $("#history-close").addEventListener("click", () => toggle(false));
  $("#hist-new").addEventListener("click", newConvo);
  filter.addEventListener("input", render);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden && $("#modal").hidden) { e.stopImmediatePropagation(); toggle(false); }
  }, true);
  new MutationObserver(() => { if (document.body.classList.contains("locked")) toggle(false, true); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
})();
