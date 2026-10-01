// Umbra Wiki history: every conversation is saved on this computer
// (~/.local/share/umbra-wiki/history) and can be reopened and continued from
// the History panel. Loaded after app.js and uses its helpers ($, Sound,
// feed, chat, controller, locked, addUser, addBot, finishAnswer, showIntro, keepScroll,
// stopRain, toggleThemes, confirmDialog, suggestFor, setSuggestion).
"use strict";

(() => {
  const panel = $("#history");
  const list = $("#hist-list");
  const filter = $("#hist-filter");
  let convo = null;     // { id, title, messages, folder } of the conversation on screen
  let items = [];
  let dir = "";
  let folders = [];     // [{ id, name, color, brief }]
  let view = "";        // the folder shown ("" = everything)
  const FCOLORS = { signal: "var(--signal)", accent: "var(--accent)", net: "var(--net)", red: "var(--red)",
                    green: "color-mix(in oklab, #4fb86a 80%, var(--fg))", violet: "color-mix(in oklab, #a77ce8 80%, var(--fg))", dim: "var(--dim)" };
  const fcolor = (f) => FCOLORS[(f && f.color) || "signal"];
  // Umbra reads the folder's brief for the conversation on screen.
  const syncFolder = () => {
    window.currentFolder = convo ? convo.folder || "" : view;
    window.currentConversationId = convo ? convo.id : "";
  };

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
    if (!convo) {
      convo = { id: newId(), title: (rec.shown || rec.question).slice(0, 120), messages: [], folder: view };
      syncFolder();
    }
    convo.messages.push(rec);
    const [scenario = "", personality = ""] = ($("#loadout-chip").textContent || "").split(" · ");
    try {
      await fetch("/api/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...convo, scenario, personality, ...(convo.messages.length === 1 ? { folder: convo.folder || "" } : {}) }),
      });
    } catch {}
    if (!panel.hidden) load();
  };

  // ------------------------------------------------------ small pictures

  // Every conversation gets a little ASCII picture of what it was about
  // (two frames, swapped slowly; faster under the mouse).
  const PICS = [
    [/water|drink|filter|purif|boil|thirst|rain/i, ["  .  \n ( ) \n ~~~ ", " . . \n ( ) \n~~~~~"]],
    [/fire|burn|stove|warm|heat(?!stroke)|smoke/i, ["  )  \n ) ( \n/\\/\\", "  (  \n ( ) \n/\\/\\"]],
    [/bleed|wound|cpr|first aid|injur|medic|pain|fever|sick|burnt|fractur|choking|doctor|health/i, [" ┌┐  \n─┘└─ \n─┐┌─ \n └┘  ", " ┌┐  \n─┘└─·\n─┐┌─ \n └┘  "]],
    [/shelter|tent|camp|cabin|sleep|cold|freez|snow/i, ["  /\\  \n /  \\ \n/____\\", "  /\\  \n /░░\\ \n/____\\"]],
    [/food|eat|cook|hunt|fish|garden|forag|ration|store/i, [" ___ \n|~~~|\n|___|", " _°_ \n|~~~|\n|___|"]],
    [/map|navig|compass|lost|route|north|walk|hike/i, ["  N  \nW ✦ E\n  S  ", "  N  \nW ✧ E\n  S  "]],
    [/power|electric|battery|solar|generator|outage|blackout/i, [" ┌─┐ \n │ϟ│ \n └┬┘ ", " ┌─┐ \n │ │ \n └┬┘ "]],
    [/radio|signal|morse|phone|call|comms/i, ["((·))\n  |  \n  |  ", "(( · ))\n  |  \n  |  "]],
    [/flood|storm|earthquake|wildfire|weather|hurricane|tornado/i, ["▗▄▄▄▖\n ╱╱╱ \n╱╱╱  ", "▗▄▄▄▖\n  ╱╱╱\n ╱╱╱ "]],
    [/repair|fix|tool|engine|car|pipe|leak/i, ["  ┌┐ \n ─┤├─\n  └┘ ", " ─┐┌─\n  ├┤ \n ─┘└─"]],
  ];
  const GENERAL = [" ┌───┐\n │ ≡ │\n └───┘", " ┌───┐\n │ ≡·│\n └───┘"];
  const picFor = (title) => (PICS.find(([re]) => re.test(title || "")) || [0, GENERAL])[1];
  let picTimer = 0, picTick = 0;
  function animatePics() {
    clearInterval(picTimer);
    picTimer = setInterval(() => {
      if (panel.hidden) { clearInterval(picTimer); return; }
      if (document.body.classList.contains("reduce-motion") || window.offgrid) return;
      picTick++;
      list.querySelectorAll(".hist-row").forEach((row, i) => {
        const hot = row.matches(":hover");
        if (!hot && (picTick + i) % 5) return;
        const f = picFor(row.dataset.title);
        row.querySelector(".hpic").textContent = f[(hot ? picTick : Math.floor((picTick + i) / 5)) % f.length];
      });
      const fold = panel.querySelector(".hist-brief .hb-pic");
      if (fold) fold.textContent = picTick % 8 < 4 ? " ___\n|__ \\___\n|   ≡   |\n|_______|" : " ___\n|__ \\___\n|  ≡ ≡  |\n|_______|";
    }, 450);
  }

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
    try { folders = (await (await fetch("/api/folders")).json()).folders || []; } catch { folders = []; }
    if (view && !folders.some((f) => f.id === view)) view = "";
    renderFolders();
    render();
  }

  // ---------------------------------------------------------- folders

  const post = (url, data) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then((r) => r.json()).catch(() => ({ error: "failed" }));
  function renderFolders() {
    let bar = panel.querySelector(".hist-folders");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "hist-folders";
      panel.insertBefore(bar, list);
    }
    const count = (id) => items.filter((c) => (c.folder || "") === id).length;
    bar.innerHTML = `<button class="hf ${view === "" ? "on" : ""}" data-f=""><span class="hf-dot" style="--fc:var(--fg)"></span>ALL <small>${items.length}</small></button>` +
      folders.map((f) => `<button class="hf ${view === f.id ? "on" : ""}" data-f="${f.id}" style="--fc:${fcolor(f)}" title="${escapeHtml(f.name)}|${escapeHtml(f.brief || "Click to show it; double-click to edit. Drop a conversation here to move it.")}">
        <span class="g">\u{F024B}</span><span class="hf-name"></span><small>${count(f.id)}</small></button>`).join("") +
      `<button class="hf hf-add" title="New folder|Group conversations, and give Umbra a brief for them.">+ FOLDER</button>`;
    bar.querySelectorAll(".hf[data-f]").forEach((b) => {
      const f = folders.find((x) => x.id === b.dataset.f);
      if (f) b.querySelector(".hf-name").textContent = f.name.toUpperCase();
      b.addEventListener("click", () => { view = b.dataset.f; if (!convo) syncFolder(); renderFolders(); render(); Sound.click(); });
      if (f) b.addEventListener("dblclick", () => editFolder(f));
      // Drop a conversation on a folder to move it there.
      b.addEventListener("dragover", (e) => { e.preventDefault(); b.classList.add("drop"); });
      b.addEventListener("dragleave", () => b.classList.remove("drop"));
      b.addEventListener("drop", (e) => { e.preventDefault(); b.classList.remove("drop"); moveTo(e.dataTransfer.getData("text/umbra-conv"), b.dataset.f); });
    });
    bar.querySelector(".hf-add").addEventListener("click", () => editFolder(null));
    const f = folders.find((x) => x.id === view);
    let brief = panel.querySelector(".hist-brief");
    if (f) {
      if (!brief) { brief = document.createElement("div"); brief.className = "hist-brief"; panel.insertBefore(brief, list); }
      brief.style.setProperty("--fc", fcolor(f));
      brief.innerHTML = `<pre class="hb-pic"> ___\n|__ \\___\n|   ≡   |\n|_______|</pre><div><b></b><small></small></div><button class="ghost hb-edit">✎ EDIT</button>`;
      brief.querySelector("b").textContent = f.name.toUpperCase();
      brief.querySelector("small").textContent = f.brief ? "Umbra keeps in mind: " + f.brief : "No brief yet. Add one and Umbra reads it in every conversation of this folder.";
      brief.querySelector(".hb-edit").addEventListener("click", () => editFolder(f));
    } else brief?.remove();
  }
  async function moveTo(id, folder) {
    if (!id) return;
    const r = await post("/api/history/move", { id, folder });
    if (r.error) { Sound.error(); return; }
    if (convo && convo.id === id) { convo.folder = folder; syncFolder(); }
    Sound.found();
    load();
  }
  async function saveFolders(next) {
    const r = await post("/api/folders", { folders: next });
    if (r.error) { Sound.error(); return false; }
    folders = r.folders;
    return true;
  }
  // The folder editor: name, colour and brief, in a small framed card.
  function editFolder(f) {
    panel.querySelector(".hist-edit")?.remove();
    const draft = f ? { ...f } : { id: "f-" + Math.random().toString(36).slice(2, 10), name: "", color: "signal", brief: "" };
    const box = document.createElement("div");
    box.className = "hist-edit";
    box.innerHTML = `<div class="lo-ed-title">${f ? "EDIT FOLDER" : "NEW FOLDER"}</div>
      <label class="lo-field"><span>NAME</span><input class="he-name" maxlength="32" placeholder="e.g. Cabin trip"></label>
      <div class="lo-field"><span>COLOUR</span><div class="he-colors">${Object.keys(FCOLORS).map((c) => `<button type="button" data-c="${c}" style="--fc:${FCOLORS[c]}"><i></i></button>`).join("")}</div></div>
      <label class="lo-field"><span>BRIEF FOR UMBRA (OPTIONAL)</span><textarea class="he-brief" rows="3" maxlength="400"
        placeholder="e.g. A week at a cabin in the mountains, 4 people, no power, a wood stove."></textarea></label>
      <div class="lo-actions">${f ? `<button class="ghost he-del">DELETE FOLDER</button>` : ""}<button class="ghost he-cancel">CANCEL</button><button class="solid he-save">SAVE ◆</button></div>`;
    panel.insertBefore(box, list);
    const name = box.querySelector(".he-name"), brief = box.querySelector(".he-brief");
    name.value = draft.name; brief.value = draft.brief;
    const colors = () => box.querySelectorAll(".he-colors button").forEach((b) => b.classList.toggle("on", b.dataset.c === draft.color));
    box.querySelectorAll(".he-colors button").forEach((b) => b.addEventListener("click", () => { draft.color = b.dataset.c; colors(); Sound.click(); }));
    colors();
    setTimeout(() => name.focus(), 30);
    box.querySelector(".he-cancel").addEventListener("click", () => { box.remove(); Sound.click(); });
    box.querySelector(".he-save").addEventListener("click", async () => {
      draft.name = name.value.trim() || "Folder";
      draft.brief = brief.value.trim();
      const next = f ? folders.map((x) => (x.id === f.id ? draft : x)) : [...folders, draft];
      if (!(await saveFolders(next))) return;
      box.remove();
      view = draft.id;
      if (!convo) syncFolder();
      Sound.theme();
      load();
    });
    name.addEventListener("keydown", (e) => { if (e.key === "Enter") box.querySelector(".he-save").click(); e.stopPropagation(); });
    box.querySelector(".he-del")?.addEventListener("click", async () => {
      const ok = await confirmDialog({ kind: "to-local", tag: "HISTORY", title: `DELETE "${f.name.toUpperCase()}"?`,
        body: "Only the folder goes: its conversations stay, under ALL.", ok: "DELETE FOLDER", cancel: "KEEP" });
      if (!ok) return;
      if (!(await saveFolders(folders.filter((x) => x.id !== f.id)))) return;
      box.remove();
      view = "";
      if (convo && convo.folder === f.id) convo.folder = "";
      syncFolder();
      load();
    });
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
    keepScroll(list, fill);
  }
  function fill() {
    const hidden = new Set(pendingDeletes.keys());
    const shown = (results || items).filter((c) => !hidden.has(c.id) && (!view || (c.folder || "") === view))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    list.innerHTML = !items.length
      ? `<p class="lib-note">No conversations yet. Everything you ask is saved here automatically.</p>`
      : !shown.length ? `<p class="lib-note">${results ? "Nothing was found for that search." : "No conversations in this folder yet. Drop one on the folder above, or start a new one while the folder is selected."}</p>` : "";
    let day = "";
    shown.forEach((c, i) => {
      const label = c.pinned ? "PINNED" : dayLabel(c.updated);
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
      const fold = folders.find((f) => f.id === c.folder);
      row.draggable = true;
      if (fold) row.style.setProperty("--fc", fcolor(fold));
      row.classList.toggle("in-folder", !!fold);
      row.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/umbra-conv", c.id); row.classList.add("dragging"); });
      row.addEventListener("dragend", () => row.classList.remove("dragging"));
      row.dataset.title = c.title || "";
      row.innerHTML = `<pre class="hpic">${escapeHtml(picFor(c.title)[0])}</pre><button class="hopen"><span class="htitle"></span><span class="hmeta"></span>${c.snippet ? '<span class="hsnip"></span>' : ""}</button>
        <span class="hactions"><button class="ghost hpin ${c.pinned ? "on" : ""}" title="${c.pinned ? "Unpin" : "Pin to the top"}">\u{F0403}</button>
        <button class="ghost hmove" title="Move to a folder">\u{F024B}</button>
        <button class="ghost hexp" title="Export this conversation">󰈇</button>
        <button class="ghost hdel" title="Delete (you can undo for a few seconds)">✕</button></span>`;
      row.querySelector(".htitle").textContent = c.title;
      if (c.snippet) row.querySelector(".hsnip").textContent = c.snippet;
      row.querySelector(".hmeta").textContent = [
        timeOf(c.updated),
        `${c.count} ${c.count === 1 ? "ANSWER" : "ANSWERS"}`,
        c.scenario && c.personality ? `${c.scenario} · ${c.personality}` : "",
        fold && !view ? "▣ " + fold.name.toUpperCase() : "",
      ].filter(Boolean).join("  ·  ");
      row.querySelector(".hpin").addEventListener("click", async () => { await post("/api/history/move", { id: c.id, pinned: !c.pinned }); Sound.click(); load(); });
      row.querySelector(".hmove").addEventListener("click", (e) => moveMenu(e.currentTarget, c));
      row.querySelector(".hopen").addEventListener("mouseenter", Sound.hover);
      row.querySelector(".hopen").addEventListener("click", () => openConvo(c.id));
      row.querySelector(".hdel").addEventListener("click", () => remove(c));
      row.querySelector(".hexp").addEventListener("click", () => exportTo({ what: "conversation", id: c.id }, "this conversation"));
      list.appendChild(row);
    });
    animatePics();
    $("#hist-foot").innerHTML = dir ? `Saved on this computer only, in <code></code>` : "";
    if (dir) $("#hist-foot code").textContent = dir;
  }

  // A small list of folders under the move button.
  function moveMenu(btn, c) {
    panel.querySelector(".hist-move")?.remove();
    const m = document.createElement("div");
    m.className = "hist-move";
    m.innerHTML = `<div class="lib-head">MOVE TO</div>` + [{ id: "", name: "No folder" }, ...folders].map((f) =>
      `<button data-f="${f.id}" class="${(c.folder || "") === f.id ? "on" : ""}" style="--fc:${f.id ? fcolor(f) : "var(--faint)"}"><i></i><span></span></button>`).join("") +
      (folders.length ? "" : `<p class="lib-note">No folders yet: make one with + FOLDER.</p>`);
    [{ name: "No folder" }, ...folders].forEach((f, i) => { m.querySelectorAll("button")[i].querySelector("span").textContent = f.name; });
    const r = btn.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    m.style.top = r.bottom - pr.top + 4 + "px";
    m.style.right = pr.right - r.right + "px";
    panel.appendChild(m);
    m.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { m.remove(); moveTo(c.id, b.dataset.f); }));
    setTimeout(() => document.addEventListener("mousedown", function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener("mousedown", off); } }), 0);
    Sound.click();
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
    convo = { id: c.id, title: c.title, messages: c.messages || [], folder: c.folder || "" };
    syncFolder();
    showIntro(false, { greet: false });   // the start screen sits above the conversation
    chat.length = 0;
    for (const m of convo.messages) {
      addUser(m.shown || m.question, m.online, m.userAt || NaN, m.clockOffsetMinutes);
      finishAnswer(addBot(m.persona || "", m.answerAt || NaN, m.clockOffsetMinutes), m);
      chat.push({ role: "user", content: m.question }, { role: "assistant", content: m.answer });
    }
    const last = convo.messages[convo.messages.length - 1];
    if (last) suggestFor(last);
    toggle(false, true);
    Sound.theme();
    followChatBottom();
    input.focus();
  }

  function newConvo() {
    if (busy()) return;
    convo = null;
    syncFolder();
    chat.length = 0;
    suggestToken++;
    setSuggestion("");
    showIntro();
    resetChatScroll();
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
