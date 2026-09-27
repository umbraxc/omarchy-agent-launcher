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

  // The search box looks through everything that was said, not just titles.
  let results = null, searchTimer = 0, searchToken = 0;
  function search() {
    clearTimeout(searchTimer);
    const q = filter.value.trim();
    if (q.length < 2) { results = null; render(); return; }
    searchTimer = setTimeout(async () => {
      const token = ++searchToken;
      const found = await fetch("/api/history-search?q=" + encodeURIComponent(q)).then((r) => r.json()).catch(() => []);
      if (token !== searchToken) return;
      results = found;
      render();
    }, 220);
  }

  function render() {
    const hidden = new Set(pendingDeletes.keys());
    const shown = (results || items).filter((c) => !hidden.has(c.id));
    list.innerHTML = !items.length
      ? `<p class="lib-note">No conversations yet. Everything you ask is saved here automatically.</p>`
      : !shown.length ? `<p class="lib-note">Nothing was found for that search.</p>` : "";
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
      row.innerHTML = `<button class="hopen"><span class="htitle"></span><span class="hmeta"></span>${c.snippet ? '<span class="hsnip"></span>' : ""}</button>
        <span class="hactions"><button class="ghost hexp" title="Export this conversation">󰈇</button>
        <button class="ghost hdel" title="Delete (you can undo for a few seconds)">✕</button></span>`;
      row.querySelector(".htitle").textContent = c.title;
      if (c.snippet) row.querySelector(".hsnip").textContent = c.snippet;
      row.querySelector(".hmeta").textContent = [
        timeOf(c.updated),
        `${c.count} ${c.count === 1 ? "ANSWER" : "ANSWERS"}`,
        c.scenario && c.personality ? `${c.scenario} · ${c.personality}` : "",
      ].filter(Boolean).join("  ·  ");
      row.querySelector(".hopen").addEventListener("mouseenter", Sound.hover);
      row.querySelector(".hopen").addEventListener("click", () => openConvo(c.id));
      row.querySelector(".hdel").addEventListener("click", () => remove(c));
      row.querySelector(".hexp").addEventListener("click", () => exportTo({ what: "conversation", id: c.id }, "this conversation"));
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

  // Quick delete: the conversation disappears at once, and an UNDO bar
  // gives five seconds to take it back before it's really removed.
  const pendingDeletes = new Map();
  function remove(c) {
    Sound.click();
    const timer = setTimeout(async () => {
      pendingDeletes.delete(c.id);
      try {
        await fetch("/api/history/delete", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: c.id }),
        });
      } catch {}
      if (convo && convo.id === c.id) convo = null;   // what's on screen stays; new answers start a new entry
      items = items.filter((x) => x.id !== c.id);
      if (results) results = results.filter((x) => x.id !== c.id);
      showUndo();
      render();
    }, 5000);
    pendingDeletes.set(c.id, { timer, title: c.title });
    showUndo();
    render();
  }
  function showUndo() {
    let bar = panel.querySelector(".undo-bar");
    if (!pendingDeletes.size) { bar?.remove(); return; }
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "undo-bar";
      bar.innerHTML = `<span></span><button class="ghost">UNDO</button>`;
      bar.querySelector("button").addEventListener("click", () => {
        pendingDeletes.forEach((p) => clearTimeout(p.timer));
        pendingDeletes.clear();
        Sound.theme();
        showUndo();
        render();
      });
      panel.insertBefore(bar, $("#hist-foot"));
    }
    const n = pendingDeletes.size;
    bar.querySelector("span").textContent = n === 1 ? `Deleted "${[...pendingDeletes.values()][0].title.slice(0, 40)}"` : `Deleted ${n} conversations`;
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
      if (window.closeSettings) window.closeSettings();
      filter.value = "";
      results = null;
      load();
    }
    if (!quiet) Sound.click();
  }
  window.closeHistory = () => toggle(false, true);

  $("#history-btn").addEventListener("click", () => toggle());
  $("#history-close").addEventListener("click", () => toggle(false));
  $("#hist-new").addEventListener("click", newConvo);
  filter.addEventListener("input", search);
  $("#hist-export").addEventListener("click", () => exportTo({ what: "all" }, "all conversations"));
  window.newConversation = newConvo;
  // umbra-wiki --open <id> (the widget's RECENT list) opens a conversation.
  const openParam = new URLSearchParams(location.search).get("open");
  if (openParam) setTimeout(() => openConvo(openParam), 700);
  window.toggleHistory = toggle;
  window.focusHistorySearch = () => { toggle(true); setTimeout(() => filter.focus(), 60); };
  window.exportCurrent = () => (convo ? exportTo({ what: "conversation", id: convo.id }, "this conversation") : Sound.error());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden && $("#modal").hidden) { e.stopImmediatePropagation(); toggle(false); }
  }, true);
  new MutationObserver(() => { if (document.body.classList.contains("locked")) toggle(false, true); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
})();
