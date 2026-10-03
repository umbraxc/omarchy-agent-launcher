// Umbra Wiki command line (Ctrl+Space, also in the hold-Ctrl tools): a terminal
// that slides out of the top of the prompt, in the theme's colour. Type to
// search everything (tabs, tools, Field Manual pages, drills, worlds,
// personalities, scenarios, themes, start screens, saved conversations) or
// give a command ("theme frost", "voice male", "map Lisbon", "checkin ok").
// Enter runs the highlighted line, ↑↓ choose, Tab completes, Esc closes;
// with an empty line ↑ brings back earlier commands. `help` lists them all.
// Loaded after app.js and the screens it opens.
"use strict";

window.UmbraTerminal = (() => {
  let el = null, out, field, list, items = [], sel = 0, open = false, past = [], pastAt = -1, index = null, chatTimer = 0;
  try { past = JSON.parse(localStorage.getItem("umbra-term-history") || "[]"); } catch {}
  const esc = (s) => escapeHtml(String(s ?? ""));
  const post = (url, body = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}));
  const click = (id) => document.getElementById(id)?.click();
  const closeAll = () => { window.closeSettings?.(); window.closeLoadout?.(true); window.closeHistory?.(); window.closeFieldKit?.(); window.closeGalaxy?.(); window.closeFriends?.(); window.closeOutpost?.(); window.closeRadar?.(); window.closeFarming?.(); };

  // ------------------------------------------------------------ the index
  // Everything the command line can find, built once and topped up.
  const TABS = [
    ["Maps", "maps-btn", "Offline maps, waypoints, country files, wonders"], ["Galaxy", "galaxy-btn", "The solar system, live"],
    ["Field Kit", "fieldkit-btn", "Medic, sun & moon, supplies, calendar, vault, training, cards"], ["Farming", "farming-btn", "Crops and livestock planner"],
    ["Umbra Outpost", "outpost-btn", "The idle game"], ["Friends", "friends-btn", "Profile cards, Camp Network, shared list"],
    ["Signals & Radar", "radar-btn", "Wi-Fi and Bluetooth around you"], ["LoRa mesh", "radar-btn", "Meshtastic radios: messages over kilometres"], ["History", "history-btn", "Saved conversations"],
    ["Library", "library-btn", "Offline collections and the Field Manual"], ["Themes", "theme-btn", "Colour themes"],
    ["Settings", "settings-btn", "Everything adjustable"], ["Profile & Loadout", "loadout-btn", "Profile, achievements, Locker, card"],
  ];
  const KIT = [["medic", "Medic"], ["sky", "Sun & Moon"], ["supplies", "Supplies"], ["calendar", "Calendar"], ["vault", "Vault"], ["training", "Training"], ["cards", "Cards"]];
  const TRAIN = [["scenarios", "Scenario drills"], ["morse", "Morse"], ["challenge", "Morse challenge"], ["lamp", "Signal lamp"], ["phonetic", "Phonetic alphabet"],
    ["radio", "Radio procedure"], ["grid", "Grid references"], ["compass", "Compass"], ["salute", "SALUTE report"], ["manuals", "Field manuals"], ["drill", "Daily drill"], ["knots", "Knots"]];
  const LOADOUT = [["profile", "Profile"], ["achievements", "Achievements"], ["locker", "Locker"], ["card", "Profile card"], ["scenario", "Scenarios"], ["personality", "Personalities"]];
  async function build() {
    const idx = [];
    const add = (kind, label, hint, run, words = "") => idx.push({ kind, label, hint, run, key: `${label} ${words} ${hint}`.toLowerCase() });
    TABS.forEach(([n, id, h]) => add("TAB", n, h, () => { closeAll(); if (n === "LoRa mesh") window.openLora?.(); else click(id); }, n === "LoRa mesh" ? "meshtastic radio" : ""));
    KIT.forEach(([t, n]) => add("FIELD KIT", n, "Field Kit", () => { closeAll(); window.UmbraFieldKit?.open(t); }));
    TRAIN.forEach(([t, n]) => add("TRAINING", n, "Field Kit › Training", () => { closeAll(); window.UmbraFieldKit?.open("training", t); }));
    LOADOUT.forEach(([t, n]) => add("PROFILE", n, "Profile & Loadout", () => { closeAll(); window.openLoadout?.(t); }));
    add("TOOL", "Core panel", "Systems and AI models", () => { closeAll(); document.querySelector(".cell.status")?.click(); }, "status ai model");
    add("TOOL", "Keyboard shortcuts", "Every key", () => window.showShortcuts?.(), "keys f1");
    add("TOOL", "New conversation", "Start fresh", () => window.newConversation?.(), "new chat");
    add("TOOL", "Export this conversation", "To a file or USB", () => window.exportCurrent?.(), "save");
    add("TOOL", "Check in", "Tell friends you're OK", () => { closeAll(); window.UmbraFriends?.open("friends"); setTimeout(() => document.querySelector(".fr-checkin")?.click(), 400); }, "ok");
    add("TOOL", "Shared supply list", "Friends › Shared list", () => { closeAll(); window.UmbraFriends?.open("list"); });
    add("TOOL", "Camp Network", "Friends › Camp Network", () => { closeAll(); window.UmbraFriends?.open("camp"); });
    add("TOOL", "Umbra's voice", "Read aloud options", () => window.UmbraSpeech?.toggle(true), "speech speak read aloud");
    try { (await fetch("/api/manual").then((r) => r.json())).forEach((p) => add("MANUAL", p.title, p.category || "Field Manual", () => { closeAll(); window.openManual?.(p.id); }, p.summary || "")); } catch {}
    try { (await window.UmbraDrills?.list() || []).forEach((d) => add("DRILL", d.name, d.time, () => { closeAll(); window.UmbraDrills.pick(d.id); window.UmbraFieldKit?.open("training", "scenarios"); }, d.brief)); } catch {}
    (window.UmbraGalaxy?.bodies || []).forEach((b) => add("WORLD", b.name, b.kind || "Galaxy", () => { closeAll(); window.UmbraGalaxy.open(); setTimeout(() => window.UmbraGalaxy.focus(b.id), 300); }));
    const lo = window.UmbraLoadout?.all?.() || {};
    (lo.personalities || []).forEach((p) => add("PERSONALITY", p.name, p.tagline || "", () => window.UmbraLoadout.deploy("personality", p.id), "voice persona"));
    (lo.scenarios || []).forEach((s) => add("SCENARIO", s.name, s.tagline || "", () => window.UmbraLoadout.deploy("scenario", s.id), "situation"));
    (typeof themes !== "undefined" ? themes : []).forEach((t) => add("THEME", t.name || t.id, "Colour theme", () => setTheme(t.id), "colour color"));
    const rw = window.UmbraAchievements?.data?.rewards || (await fetch("/api/achievements").then((r) => r.json()).catch(() => ({}))).rewards || [];
    const free = (kind, id) => rw.find((r) => r.kind === kind && r.id === id)?.unlocked !== false;
    (window.UmbraBackgrounds?.list || []).forEach(([id, n]) => add("START SCREEN", n, free("background", id) ? "Start-screen background" : "🔒 Locked: see the Locker", () => setLook("background", id), "background"));
    (window.UmbraTransitions || []).forEach(([id, n]) => add("TRANSITION", n, free("transition", id) ? "Boot and goodbye" : "🔒 Locked: see the Locker", () => setLook("transition", id)));
    index = idx;
  }
  function setTheme(id) { if (typeof applyTheme === "function") applyTheme(id); window.postSettings?.({ theme: id }); }
  async function setLook(kind, id) {
    const r = await post("/api/settings", { [kind]: id });
    if (r[kind] !== id) { print(`✗ ${kind === "background" ? "That start screen" : "That transition"} is locked. Earn it in Profile › Locker.`, "err"); return false; }
    if (window.prefs) window.prefs[kind] = id;
    window.applyPrefs?.();
    print(`✓ ${kind === "background" ? "Start screen" : "Transition"} set.`);
    return true;
  }

  // ------------------------------------------------------------ commands
  const COMMANDS = [
    ["help", "this list"], ["open <tab or tool>", "open anything"], ["theme <name>", "change the colour theme"], ["bg <name>", "start-screen background"],
    ["transition <name>", "boot and goodbye animation"], ["persona <name>", "switch personality"], ["scenario <name>", "switch scenario"],
    ["voice on | off | mic | male | female | stop", "Umbra's voice"], ["say <text>", "Umbra says it aloud"], ["mute | unmute", "all sound"],
    ["volume <0-100>", "effects volume"], ["map <place>", "search the Maps"], ["galaxy [world]", "fly to a world"], ["drill <name>", "start a scenario drill"],
    ["checkin [ok | help | away | moving] [note]", "check in for your friends"], ["find <words>", "search every saved conversation"],
    ["ask <question>", "ask Umbra"], ["new", "new conversation"], ["export", "export this conversation"], ["offgrid on | off | auto", "battery saver"],
    ["zoom <50-200>", "window zoom"], ["lock", "lock the window"], ["status", "how Umbra is doing"], ["time", "local time"], ["clear", "clear this screen"], ["exit", "close the command line"],
  ];
  const best = (q, kinds) => (index || []).filter((x) => !kinds || kinds.includes(x.kind)).map((x) => [score(x, q), x]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0])[0]?.[1];
  async function run(text) {
    const raw = text.trim();
    if (!raw) return;
    past = [raw, ...past.filter((p) => p !== raw)].slice(0, 40);
    try { localStorage.setItem("umbra-term-history", JSON.stringify(past)); } catch {}
    echo(raw);
    window.track?.("quickActions");
    const [verb, ...rest] = raw.split(/\s+/), arg = rest.join(" "), v = verb.toLowerCase();
    if (!index) await build();
    switch (v) {
      case "help": case "?":
        print(COMMANDS.map(([c, d]) => `  ${c.padEnd(44)} ${d}`).join("\n") + "\n  Or just type: anything matching appears below. Enter opens it.", "help"); return;
      case "clear": out.innerHTML = ""; return;
      case "exit": case "quit": case "close": hide(); return;
      case "open": case "go": { const x = best(arg.toLowerCase()); if (x) { print(`▸ ${x.label}`); hide(); x.run(); } else print(`✗ Nothing called “${arg}”.`, "err"); return; }
      case "theme": { const x = best(arg.toLowerCase(), ["THEME"]); if (x) { x.run(); print(`✓ Theme: ${x.label}.`); } else print("✗ No such theme. Try: theme list", "err"); if (/^list$/i.test(arg)) print((typeof themes !== "undefined" ? themes : []).map((t) => t.name || t.id).join(" · ")); return; }
      case "bg": case "background": { const x = best(arg.toLowerCase(), ["START SCREEN"]); if (x) await x.run(); else print("✗ No such start screen.", "err"); return; }
      case "transition": { const x = best(arg.toLowerCase(), ["TRANSITION"]); if (x) await x.run(); else print("✗ No such transition.", "err"); return; }
      case "persona": case "personality": { const x = best(arg.toLowerCase(), ["PERSONALITY"]); if (x) { await x.run(); print(`✓ Personality: ${x.label}.`); } else print("✗ No such personality.", "err"); return; }
      case "scenario": { const x = best(arg.toLowerCase(), ["SCENARIO"]); if (x) { await x.run(); print(`✓ Scenario: ${x.label}.`); } else print("✗ No such scenario.", "err"); return; }
      case "voice": case "speech": {
        const a = arg.toLowerCase(), S = window.UmbraSpeech;
        if (!S?.state?.installed && a !== "stop") { print("◇ Umbra's voice isn't installed yet: opening its options.", "warn"); S?.toggle(true); return; }
        if (a === "stop") { S.stop(); print("■ Stopped."); return; }
        const mode = { on: "always", always: "always", off: "off", mic: "mic" }[a], gender = { male: "m", female: "f", m: "m", f: "f" }[a];
        if (mode) { await window.postSettings?.({ speechMode: mode }); S.refresh(); print(`✓ Read aloud: ${mode === "mic" ? "when you speak" : mode}.`); return; }
        if (gender) { await window.postSettings?.({ speechGender: gender }); S.refresh(); S.sample("umbra"); print(`✓ Umbra's voice: ${gender === "m" ? "male" : "female"}.`); return; }
        S.toggle(true); return;
      }
      case "say": if (!arg) { print("✗ say <text>", "err"); return; } window.UmbraSpeech?.say(arg); print("◉ Speaking…"); return;
      case "mute": case "unmute": await window.postSettings?.({ muted: v === "mute" }); if (window.prefs) window.prefs.muted = v === "mute"; window.reloadPrefs?.(); print(v === "mute" ? "✓ Muted." : "✓ Sound on."); return;
      case "volume": { const n = Number(arg); if (!(n >= 0 && n <= 100)) { print("✗ volume <0-100>", "err"); return; } await window.postSettings?.({ volume: n / 100 }); window.reloadPrefs?.(); print(`✓ Effects volume ${n}%.`); return; }
      case "map": case "maps": {
        hide(); closeAll(); click("maps-btn");
        if (arg) setTimeout(() => { const i = document.querySelector("#maps .mp-search input"); if (i) { i.value = arg; i.dispatchEvent(new Event("input")); i.focus(); } }, 600);
        return;
      }
      case "galaxy": { hide(); closeAll(); const x = arg && best(arg.toLowerCase(), ["WORLD"]); window.UmbraGalaxy?.open(); if (x) setTimeout(() => x.run(), 50); return; }
      case "drill": { const x = arg ? best(arg.toLowerCase(), ["DRILL"]) : null; hide(); closeAll(); if (x) x.run(); else window.UmbraFieldKit?.open("training", "scenarios"); return; }
      case "checkin": case "check-in": {
        const [st, ...note] = rest, state = ["ok", "help", "away", "moving"].includes((st || "").toLowerCase()) ? st.toLowerCase() : "ok";
        const r = await post("/api/camp/checkin", { st: state, note: (["ok", "help", "away", "moving"].includes((st || "").toLowerCase()) ? note : rest).join(" ") });
        print(r.ok ? `✓ Checked in: ${state.toUpperCase()}. Linked friends see it now.` : "✗ The check-in didn't go through.", r.ok ? "" : "err"); return;
      }
      case "find": case "search": {
        if (!arg) { print("✗ find <words>", "err"); return; }
        const hits = await fetch("/api/history-search?q=" + encodeURIComponent(arg)).then((r) => r.json()).catch(() => []);
        const list = (Array.isArray(hits) ? hits : hits.items || hits.results || []).slice(0, 8);
        if (!list.length) { print(`◌ No saved conversation mentions “${arg}”.`); return; }
        print(`${list.length} conversation${list.length > 1 ? "s" : ""} mention “${arg}”: opening History.`);
        hide(); window.toggleHistory?.(true); setTimeout(() => { const f = document.getElementById("hist-filter"); if (f) { f.value = arg; f.dispatchEvent(new Event("input")); } }, 200);
        return;
      }
      case "ask": { if (!arg) { print("✗ ask <question>", "err"); return; } hide(); const q = $("#q"); q.value = arg; q.dispatchEvent(new Event("input")); $("#ask").requestSubmit(); return; }
      case "new": hide(); window.newConversation?.(); return;
      case "export": hide(); window.exportCurrent?.(); return;
      case "offgrid": { const m = arg.toLowerCase(); if (!["on", "off", "auto"].includes(m)) { print("✗ offgrid on | off | auto", "err"); return; } await window.postSettings?.({ offgrid: m }); window.reloadPrefs?.(); print(`✓ Off-grid mode: ${m}.`); return; }
      case "zoom": { const n = Number(arg); if (!(n >= 50 && n <= 200)) { print("✗ zoom <50-200>", "err"); return; } await window.postSettings?.({ zoom: n / 100 }); window.applyZoom?.(n / 100); print(`✓ Zoom ${n}%.`); return; }
      case "lock": hide(); document.getElementById("lock")?.click(); return;
      case "time": print(`◷ ${window.umbraClockLabel?.() || new Date().toTimeString().slice(0, 5)} · ${new Date().toDateString()}`); return;
      case "status": {
        const s = await fetch("/api/status").then((r) => r.json()).catch(() => ({}));
        print(`◉ ${s.modelReady ? "READY" : "NOT READY"} · model ${s.model || "?"} · library ${s.archives ?? s.zims ?? "?"} archives · version ${s.version || "?"}`); return;
      }
    }
    // Anything else: the highlighted search result, or a question for Umbra.
    const x = items[sel];
    if (x && !x.ask) { print(`▸ ${x.label}`); hide(); x.run(); return; }
    hide(); const q = $("#q"); q.value = raw; q.dispatchEvent(new Event("input")); q.focus();
  }

  // ------------------------------------------------------------ search
  function score(x, q) {
    if (!q) return 0;
    const label = x.label.toLowerCase();
    if (label === q) return 100;
    if (label.startsWith(q)) return 80 - label.length * 0.1;
    if (label.split(/[\s›&-]+/).some((w) => w.startsWith(q))) return 60 - label.length * 0.1;
    if (label.includes(q)) return 45;
    const words = q.split(/\s+/).filter(Boolean);
    if (words.length && words.every((w) => x.key.includes(w))) return 25;
    return 0;
  }
  function suggest() {
    const raw = field.value, q = raw.trim().toLowerCase();
    const verb = q.split(/\s+/)[0];
    const kinds = { theme: ["THEME"], bg: ["START SCREEN"], background: ["START SCREEN"], transition: ["TRANSITION"], persona: ["PERSONALITY"], personality: ["PERSONALITY"],
      scenario: ["SCENARIO"], galaxy: ["WORLD"], drill: ["DRILL"], open: null, go: null }[verb];
    const term = kinds !== undefined && q.includes(" ") ? q.slice(verb.length).trim() : q;
    items = !q ? [] : (index || []).filter((x) => !kinds || kinds.includes(x.kind)).map((x) => [score(x, term), x]).filter(([s]) => s > 0)
      .sort((a, b) => b[0] - a[0]).slice(0, 7).map(([, x]) => x);
    const cmd = COMMANDS.filter(([c]) => q && c.startsWith(verb) && verb.length > 1).slice(0, 2);
    if (q && !items.length && !cmd.length) items = [{ kind: "ASK", label: `Ask Umbra: “${raw.trim()}”`, hint: "Enter sends it as a question", ask: true }];
    sel = 0;
    list.innerHTML = cmd.map(([c, d]) => `<div class="term-cmd"><b>${esc(c)}</b><span>${esc(d)}</span></div>`).join("") +
      items.map((x, i) => `<button type="button" class="term-item ${i === sel ? "on" : ""}" data-i="${i}"><small>${esc(x.kind)}</small><b>${esc(x.label)}</b><span>${esc(x.hint || "")}</span></button>`).join("");
    out.scrollTop = out.scrollHeight;
  }
  function move(d) {
    if (!items.length) return;
    sel = (sel + d + items.length) % items.length;
    list.querySelectorAll(".term-item").forEach((b, i) => b.classList.toggle("on", i === sel));
    Sound.hover();
  }

  // ------------------------------------------------------------ screen
  function echo(text) { print(`<span class="term-ps">umbra ▸</span> ${esc(text)}`, "echo", true); }
  function print(text, cls = "", html = false) {
    const p = document.createElement("div");
    p.className = "term-line " + cls;
    if (html) p.innerHTML = text; else p.textContent = text;
    out.appendChild(p);
    out.scrollTop = out.scrollHeight;
  }
  function make() {
    el = document.createElement("section");
    el.id = "umbra-term"; el.className = "term"; el.hidden = true;
    el.setAttribute("aria-label", "Command line");
    el.innerHTML = `<div class="term-head"><span>▣ UMBRA // COMMAND LINE</span><span class="term-keys">ENTER RUN · ↑↓ CHOOSE · TAB COMPLETE · ESC CLOSE</span></div>
      <div class="term-out" aria-live="polite"></div>
      <form class="term-in" autocomplete="off"><span class="term-ps">umbra ▸</span><input type="text" spellcheck="false" aria-label="Command" placeholder="type a command, or anything to find it"><i class="term-cursor"></i></form>
      <div class="term-list"></div>`;
    const stack = document.querySelector(".command-stack");
    stack.insertBefore(el, stack.querySelector("#ask"));
    out = el.querySelector(".term-out"); field = el.querySelector("input"); list = el.querySelector(".term-list");
    el.querySelector(".term-in").addEventListener("submit", (e) => { e.preventDefault(); const t = field.value; field.value = ""; pastAt = -1; list.innerHTML = ""; run(t).then(() => { if (open) field.focus(); }); });
    field.addEventListener("input", () => { pastAt = -1; suggest(); });
    field.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); if (items.length) move(1); }
      else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (!field.value || pastAt >= 0) { pastAt = Math.min(past.length - 1, pastAt + 1); if (past[pastAt]) { field.value = past[pastAt]; list.innerHTML = ""; } }
        else move(-1);
      }
      else if (e.key === "Tab") { e.preventDefault(); const x = items[sel]; if (x && !x.ask) { const verb = field.value.split(/\s+/)[0]; field.value = (field.value.includes(" ") ? verb + " " : "") + x.label; suggest(); } }
    });
    list.addEventListener("click", (e) => { const b = e.target.closest(".term-item"); if (!b) return; sel = +b.dataset.i; const x = items[sel]; if (x.ask) { run(field.value); field.value = ""; } else { echo(x.label); hide(); x.run(); } });
    el.addEventListener("mousedown", (e) => { if (e.target === el || e.target.closest(".term-out")) setTimeout(() => field.focus(), 0); });
  }
  async function show() {
    if (locked || document.body.classList.contains("touring")) return;
    if (!el) make();
    if (open) { field.focus(); return; }
    open = true;
    el.hidden = false;
    document.body.classList.add("term-open");
    requestAnimationFrame(() => el.classList.add("in"));
    Sound.toolchuff?.();
    field.focus();
    if (!out.childElementCount) {
      const lines = ["UMBRA COMMAND LINE · everything, one line away.", "Type to find anything, or a command. `help` lists them. Enter runs · Esc closes."];
      if (document.body.classList.contains("reduce-motion")) lines.forEach((l) => print(l, "welcome"));
      else {
        let k = 0;
        const typeLine = () => { if (k >= lines.length) return; const p = document.createElement("div"); p.className = "term-line welcome"; out.appendChild(p); let i = 0;
          const t = setInterval(() => { i += 3; p.textContent = lines[k].slice(0, i); if (i >= lines[k].length) { clearInterval(t); k++; typeLine(); } }, 12); };
        typeLine();
      }
    }
    if (!index) build().then(() => { if (field.value) suggest(); });
  }
  function hide() {
    if (!open) return;
    open = false;
    el.classList.remove("in");
    document.body.classList.remove("term-open");
    setTimeout(() => { if (!open) el.hidden = true; }, 260);
    $("#q")?.focus();
  }
  // Ctrl+Space anywhere opens it (the hold-Ctrl tools show it too); again closes it.
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey && (e.code === "Space" || e.key === " " || e.key === "`")) {
      e.preventDefault(); e.stopImmediatePropagation();
      open ? hide() : show();
    }
  }, true);
  // The index follows new themes, personalities and drills now and then.
  setInterval(() => { if (!open) index = null; }, 120000);
  return { show, hide, toggle: () => (open ? hide() : show()) };
})();
