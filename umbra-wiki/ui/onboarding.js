// Umbra Wiki welcome tour: on the very first launch (and after a reset, or
// from Settings). A short ASCII introduction, then the user picks how much
// of a tour they want:
//   QUICK START    their name, the AI, the library, a theme and a short look
//                  at the screen (about a minute);
//   FULL BRIEFING  everything: the whole profile with health notes and ID
//                  card, a password, scenario and personality, comfort and
//                  power, the full screen tour and the extras;
//   SKIP           straight in (the Core panel and Settings set up the rest).
// Scripted, so it's instant. Finishing a tour (not skipping) earns the first
// achievement; achievements only count from then on.
"use strict";

(() => {
  let skipped = false;
  // ?autotour plays the tour by itself with the default choices (for
  // testing; it never downloads a model or a library).
  const AUTO = new URLSearchParams(location.search).has("autotour");
  const autoClick = (el) => { if (AUTO) setTimeout(() => el && el.isConnected && el.click(), 650); };
  const SKIP = new Error("skip");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const post = (url, data) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });

  // ------------------------------------------------------- chat pieces

  // Umbra says something, typed out quickly.
  async function say(text) {
    if (skipped) throw SKIP;
    const msg = addBot("");
    const answer = msg.querySelector(".answer");
    msg.querySelector(".label .spin")?.remove();
    for (let i = 0; i <= text.length; i += 3) {
      if (skipped) throw SKIP;
      answer.innerHTML = renderMarkdown(text.slice(0, i)) + '<span class="cursor"></span>';
      if (i % 30 === 0) wake();
      await wait(12);
    }
    answer.innerHTML = renderMarkdown(text);
    wake();
    await wait(250);
    return answer;
  }

  // A quiet "skip the tour" line under whatever the tour is asking now, so
  // the way out is always right where the eyes are.
  function skipLine(parent) {
    document.querySelectorAll(".tour-skipline").forEach((x) => x.remove());
    const line = document.createElement("button");
    line.type = "button";
    line.className = "tour-skipline";
    line.textContent = "skip the rest of the tour ▸";
    line.addEventListener("click", () => { Sound.click(); skipTour(); });
    parent.appendChild(line);
  }

  // Buttons under the last message; resolves with the chosen value.
  function choose(answer, options) {
    return new Promise((resolve, reject) => {
      const row = document.createElement("div");
      row.className = "tour-choices";
      options.forEach(([label, value, solid]) => {
        const b = document.createElement("button");
        b.className = solid ? "solid" : "ghost";
        b.textContent = label;
        b.addEventListener("mouseenter", Sound.hover);
        b.addEventListener("click", () => { row.remove(); Sound.click(); resolve(value); });
        row.appendChild(b);
      });
      answer.appendChild(row);
      skipLine(answer);
      skipHooks.push(() => reject(SKIP));
      wake();
      autoClick(row.querySelector("button"));
    });
  }

  // A text field under the last message; resolves with the text ("" = skipped).
  function field(answer, placeholder, max, multiline = false, secret = false, auto = "Alex") {
    return new Promise((resolve, reject) => {
      const box = document.createElement("div");
      box.className = "tour-field";
      box.innerHTML = `${multiline ? "<textarea rows='3'></textarea>" : "<input>"}
        <button class="solid">CONTINUE ⏎</button><button class="ghost">SKIP</button>`;
      const inp = box.querySelector("input, textarea");
      if (secret) { inp.type = "password"; inp.autocomplete = "off"; }
      inp.placeholder = placeholder;
      inp.maxLength = max;
      const done = (v) => { box.remove(); Sound.click(); resolve(v); };
      box.querySelector(".solid").addEventListener("click", () => done(inp.value.trim()));
      box.querySelector(".ghost").addEventListener("click", () => done(""));
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); done(inp.value.trim()); } });
      answer.appendChild(box);
      skipLine(answer);
      skipHooks.push(() => reject(SKIP));
      wake();
      setTimeout(() => inp.focus(), 50);
      if (AUTO) { inp.value = multiline || secret ? "" : auto; autoClick(box.querySelector(secret || !inp.value ? ".ghost" : ".solid")); }
    });
  }

  // Long lists of cards show a first few and a MORE button that unfolds the
  // rest (and folds them away again), so the tour never floods the screen.
  function foldCards(grid, keep = 6) {
    const cards = [...grid.children];
    if (cards.length <= keep + 1) return;
    const onIdx = cards.findIndex((c) => c.classList.contains("on"));
    cards.forEach((c, i) => { if (i >= keep && i !== onIdx) c.classList.add("tour-extra"); });
    const more = document.createElement("button");
    more.type = "button";
    more.className = "ghost tour-more";
    const hidden = () => grid.querySelectorAll(".tour-extra").length;
    const label = (open) => (more.textContent = open ? "▴ SHOW FEWER ▴" : `▾ ${hidden()} MORE OPTIONS ▾`);
    label(false);
    more.addEventListener("click", () => {
      const open = !grid.classList.contains("unfolded");
      grid.classList.toggle("unfolded", open);
      more.classList.add("seen");   // it only pulses until it's been used
      label(open);
      Sound.click();
      if (!open) grid.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    grid.after(more);
  }

  // Cards that toggle on and off (several can be picked). Resolves on CONTINUE.
  function multi(answer, items, chosen) {
    return new Promise((resolve, reject) => {
      const grid = document.createElement("div");
      grid.className = "tour-cards tour-multi";
      const next = document.createElement("div");
      items.forEach((it) => {
        const c = document.createElement("button");
        c.className = "tour-card" + (chosen.has(it.id) ? " on" : "");
        c.innerHTML = "<b></b>";
        c.querySelector("b").textContent = it.name;
        c.addEventListener("mouseenter", Sound.hover);
        c.addEventListener("click", () => { chosen.has(it.id) ? chosen.delete(it.id) : chosen.add(it.id); c.classList.toggle("on", chosen.has(it.id)); Sound.click(); });
        grid.appendChild(c);
      });
      next.className = "tour-choices";
      next.innerHTML = `<button class="solid">CONTINUE ▸</button>`;
      next.querySelector("button").addEventListener("click", () => { grid.classList.add("done", "unfolded"); grid.nextElementSibling?.classList.contains("tour-more") && grid.nextElementSibling.remove(); next.remove(); Sound.click(); resolve(chosen); });
      answer.append(grid, next);
      foldCards(grid, 8);
      skipLine(answer);
      skipHooks.push(() => reject(SKIP));
      wake();
      autoClick(next.querySelector("button"));
    });
  }

  // A grid of pickable cards; picking applies at once. Resolves on CONTINUE.
  function cards(answer, items, current, onPick, nextLabel) {
    return new Promise((resolve, reject) => {
      const grid = document.createElement("div");
      grid.className = "tour-cards";
      const next = document.createElement("div");
      items.forEach((it) => {
        const c = document.createElement("button");
        c.className = "tour-card" + (it.id === current ? " on" : "");
        c.innerHTML = `${it.swatch || ""}<b></b><small></small>`;
        c.querySelector("b").textContent = it.name;
        c.querySelector("small").textContent = it.line || "";
        c.addEventListener("mouseenter", Sound.hover);
        c.addEventListener("click", () => {
          grid.querySelectorAll(".tour-card").forEach((x) => x.classList.remove("on"));
          c.classList.add("on");
          onPick(it.id);
          if (nextLabel) next.querySelector("button").textContent = nextLabel(it.id);
        });
        grid.appendChild(c);
      });
      next.className = "tour-choices";
      next.innerHTML = `<button class="solid">${nextLabel ? nextLabel(current) : "CONTINUE ▸"}</button>`;
      next.querySelector("button").addEventListener("click", () => {
        grid.classList.add("done");
        // Only the chosen card stays, the rest fold away.
        grid.querySelectorAll(".tour-card:not(.on)").forEach((c) => c.classList.add("tour-extra"));
        grid.classList.remove("unfolded");
        grid.nextElementSibling?.classList.contains("tour-more") && grid.nextElementSibling.remove();
        next.remove(); Sound.click(); resolve();
      });
      answer.append(grid, next);
      foldCards(grid, 6);
      skipLine(answer);
      skipHooks.push(() => reject(SKIP));
      wake();
      autoClick(next.querySelector("button"));
    });
  }

  const CONTINENTS = [["africa", "Africa"], ["antarctica", "Antarctica"], ["asia", "Asia"], ["europe", "Europe"],
                      ["north-america", "North America"], ["oceania", "Oceania"], ["south-america", "South America"]];
  // Quick Start and Full Briefing each require a click here to continue.
  // No location is guessed from the computer or network.
  function continentCards(answer, current) {
    return new Promise((resolve, reject) => {
      const grid = document.createElement("div");
      grid.className = "tour-cards tour-continents";
      const next = document.createElement("div");
      next.className = "tour-choices";
      next.innerHTML = `<button class="solid" disabled>CONTINUE ▸</button>`;
      let selected = "";
      CONTINENTS.forEach(([id, label]) => {
        const card = document.createElement("button");
        card.className = "tour-card";
        card.innerHTML = "<b></b>";
        card.querySelector("b").textContent = label;
        card.addEventListener("mouseenter", Sound.hover);
        card.addEventListener("click", () => {
          selected = id;
          grid.querySelectorAll(".tour-card").forEach((b) => b.classList.remove("on"));
          card.classList.add("on");
          next.querySelector("button").disabled = false;
          Sound.click();
        });
        grid.appendChild(card);
      });
      next.querySelector("button").addEventListener("click", () => {
        if (!selected) return;
        grid.classList.add("done"); next.remove(); Sound.click(); resolve(selected);
      });
      answer.append(grid, next);
      skipHooks.push(() => reject(SKIP));
      wake();
      if (AUTO) {
        autoClick(grid.children[CONTINENTS.findIndex(([id]) => id === current) >= 0 ? CONTINENTS.findIndex(([id]) => id === current) : 0]);
        setTimeout(() => autoClick(next.querySelector("button")), 750);
      }
    });
  }

  // -------------------------------------------------------- spotlight

  const SPOTS = [
    [".brand", "UMBRA // WIKI", "Click the emblem or the name to go back to the start screen with a new conversation. Your loadout is shown under the name: click it to switch scenario or personality."],
    ["#link", "LINK", "LOCAL means fully offline (the default). Switch to ONLINE when you have internet and I add Wikipedia for fuller, more current answers. I always ask first."],
    [".cell.status", "CORE", "Shows when I'm ready, working, or can't reach my AI. Click it for the Core panel: every system's condition, and the AI models, what each can do and which suits this computer."],
    ["#loadout-btn", "PROFILE & LOADOUT", "Your profile (name, callsign, character, what I should know about you), your Achievements and rank, plus scenarios and personalities. You can create your own of both."],
    ["#history-btn", "HISTORY", "Every conversation is saved on this computer. Reopen and continue any of them, search through everything, sort them into folders (each with a brief I keep in mind), pin them, and export them."],
    ["#library-btn", "LIBRARY", "The offline collections I read from, and my built-in Field Manual: the critical basics, always available. Download more collections here."],
    ["#maps-btn", "MAPS", "Offline maps with a military look, down to street level: download a country or any area, search towns, streets, water and coordinates. Right-click for waypoints (15 marker types), measuring and range rings. Click a country's name for its file and your own safety level."],
    ["#fieldkit-btn", "FIELD KIT", "Tools that matter in an emergency. MEDIC: CPR metronome, timers, triage, coma scale, burns and child-dose calculators, a patient chart with handover reports. SUN & MOON with a live Earth. SUPPLIES. A CALENDAR that also shows when water and food run out. The VAULT for your arsenal and valuables. TRAINING: Morse, radio, grid references, compass, and field manuals to download. Printable CARDS."],
    ["#farming-btn", "FARMING", "An offline field planner for edible crops and common livestock. Compare growing conditions, food output, feed, seed and work with numbers you can adjust."],
    ["#radar-btn", "SIGNALS & RADAR", "The Wi-Fi networks and Bluetooth devices around you on a radar, nearer the centre when stronger; click one for its details. Plus your device's vitals. No internet needed."],
    ["#dl-btn", "DOWNLOADS", "Shows while something downloads (maps, library, AI model): pause, resume or cancel it here. Downloads go on after a restart."],
    ["#theme-btn", "THEMES", "Pick a colour theme, follow your Omarchy theme, or design your own."],
    ["#sound", "SOUND", "Mute or unmute my sounds."],
    ["#lock", "LOCK", "Locks the window so nothing can be clicked or typed by accident."],
    ["#settings-btn", "SETTINGS", "Search box at the top. Performance and the processor limit, sounds, text size, backgrounds, off-grid mode, the AI model, voice, backups, updates, replaying this tour, and more."],
    ["#q", "ASK", "Type here. Enter sends, Shift+Enter adds a line, Ctrl+Z undoes. Press Tab in an empty prompt for quick actions: likely replies, the right tool, questions to start with."],
    ["#mic", "VOICE", "Hold F9 (or click) and just talk. Speech is turned into text offline."],
    ["#send", "TRANSMIT", "Sends your question. While I'm answering it becomes STOP (or press Esc)."],
  ];

  // The quick start shows the essentials only.
  const QUICK_SPOTS = [".cell.status", "#loadout-btn", "#history-btn", "#library-btn", "#maps-btn", "#fieldkit-btn", "#settings-btn", "#q"];

  function spotlight(quick = false) {
    return new Promise((resolve, reject) => {
      const steps = SPOTS.filter(([sel]) => !quick || QUICK_SPOTS.includes(sel)).filter(([sel]) => {
        const el = $(sel);
        return el && el.getClientRects().length && el.getBoundingClientRect().width > 0;
      });
      const shade = document.createElement("div");
      shade.className = "spot-shade";
      shade.innerHTML = `<div class="spot"></div><div class="spot-card"><div class="spot-n"></div>
        <div class="spot-title"></div><p class="spot-text"></p>
        <div class="spot-actions"><button class="ghost spot-back">◂ BACK</button><button class="solid spot-next">NEXT ▸</button></div>
        <button type="button" class="tour-skipline spot-skip">skip the rest of the tour ▸</button></div>`;
      document.body.appendChild(shade);
      const spot = shade.querySelector(".spot"), card = shade.querySelector(".spot-card");
      let i = 0;
      const show = () => {
        const [sel, title, text] = steps[i];
        const r = $(sel).getBoundingClientRect();
        const pad = 6;
        Object.assign(spot.style, { left: r.left - pad + "px", top: r.top - pad + "px", width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px" });
        shade.querySelector(".spot-n").textContent = `${i + 1} / ${steps.length}`;
        shade.querySelector(".spot-title").textContent = title;
        shade.querySelector(".spot-text").textContent = text;
        shade.querySelector(".spot-back").disabled = i === 0;
        shade.querySelector(".spot-next").textContent = i === steps.length - 1 ? "DONE ✓" : "NEXT ▸";
        const w = card.offsetWidth, h = card.offsetHeight;
        const below = r.bottom + pad + 14 + h < innerHeight;
        card.style.left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12) + "px";
        card.style.top = (below ? r.bottom + pad + 14 : r.top - pad - 14 - h) + "px";
        card.classList.remove("in"); void card.offsetWidth; card.classList.add("in");
      };
      const finish = (ok) => { shade.remove(); removeEventListener("resize", show); ok ? resolve() : reject(SKIP); };
      shade.querySelector(".spot-next").addEventListener("click", () => {
        Sound.click();
        if (i === steps.length - 1) finish(true); else { i++; show(); }
      });
      shade.querySelector(".spot-back").addEventListener("click", () => { if (i > 0) { i--; show(); Sound.click(); } });
      shade.querySelector(".spot-skip").addEventListener("click", () => { Sound.click(); skipTour(); });
      addEventListener("resize", show);
      skipHooks.push(() => finish(false));
      show();
      if (AUTO) {
        const step = () => { if (shade.isConnected) { shade.querySelector(".spot-next").click(); setTimeout(step, 400); } };
        setTimeout(step, 400);
      }
    });
  }

  // ------------------------------------------------ shared tour steps

  // The AI model (what's on this computer, or one to download) and the
  // library pack. Both tours have these.
  async function stepBrainAndLibrary() {
    let a;
    // The AI model: what's already on this computer, or one to download.
    // A fresh install may not have started Ollama yet (packages can't start
    // services themselves): explain how, and check again.
    let core = await fetch("/api/status").then((r) => r.json()).catch(() => ({}));
    while (!core.ollama && !AUTO && core.platform === "windows") {
      a = await say("First, my AI engine **Ollama** isn't installed or running yet. The Umbra installer offers it; if you skipped it, " +
        "get it from **ollama.com/download** (free, about a gigabyte), install it, and check again.");
      const pick = await choose(a, [["OPEN OLLAMA.COM ▸", "get", true], ["CHECK AGAIN", "again"], ["SKIP FOR NOW", "skip"]]);
      if (pick === "skip") break;
      if (pick === "get") fetch("/api/open", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: "https://ollama.com/download/windows" }) });
      core = await fetch("/api/status").then((r) => r.json()).catch(() => ({}));
      if (core.ollama) await say("There it is. Ollama is running.");
    }
    while (!core.ollama && !AUTO && core.platform !== "windows") {
      a = await say("First, my AI engine **Ollama** isn't running yet. Start it once with this command in a terminal, " +
        "and it will start by itself from then on:\n\n`sudo systemctl enable --now ollama`");
      if (await choose(a, [["I'VE STARTED IT, CHECK AGAIN ▸", "again", true], ["SKIP FOR NOW", "skip"]]) === "skip") break;
      core = await fetch("/api/status").then((r) => r.json()).catch(() => ({}));
      if (core.ollama) await say("There it is. Ollama is running.");
    }
    const [sys, models, packs] = await Promise.all([
      fetch("/api/system").then((r) => r.json()).catch(() => ({})),
      fetch("/api/models").then((r) => r.json()).catch(() => ({ installed: [], choices: [] })),
      fetch("/api/packs").then((r) => r.json()).catch(() => []),
    ]);
    const gpu = (sys.gpus || [])[0] || "";
    const gpuLine = sys.accel
      ? `Your graphics card is set up for AI (${sys.accel}), so I'll answer quickly.`
      : gpu
        ? `Graphics: ${gpu.replace(/ Corporation| Integrated Graphics Controller/g, "")}. No AI acceleration for it, so I'll think on the processor: answers take a minute or so.`
        : "I'll think on the processor: answers take a minute or so.";
    await say("Now let's set up my **brain**: the local AI model. Everything runs on this computer, so my speed depends on your " +
      "**processor (CPU)**, or on your **graphics card (GPU)** if it has a supported one. Bigger models know more and write better, but think slower.");
    a = await say(`This computer: **${sys.cpu || "unknown processor"}**, ${sys.cores || "?"} threads, **${sys.ramGB || "?"} GB** of memory. ${gpuLine}`);
    const installed = (models.installed || []).map((m) => m.id);
    const modelCards = [
      ...(models.installed || []).map((m) => ({ id: m.id, name: m.id, line: `Already on this computer · ${m.size} GB · ready now` })),
      ...(models.choices || []).filter((c) => !installed.includes(c.id)).map((c) => ({
        id: c.id, name: c.name + (c.id === sys.recommended ? "  ★" : ""),
        line: `${c.size} GB download · ${c.line}${c.id === sys.recommended ? " Recommended for this computer." : ""}${sys.ramGB && c.ram > sys.ramGB ? " Probably too big for this computer." : ""}`,
      })),
    ];
    let model = installed.includes(models.current) ? models.current : installed[0] || sys.recommended || "gemma3:4b";
    if (AUTO && installed.length) model = installed.includes(models.current) ? models.current : installed[0];
    await cards(a, modelCards, model, (id) => { model = id; Sound.click(); },
      (id) => (installed.includes(id) ? "USE THIS MODEL ▸" : `DOWNLOAD ${(models.choices.find((c) => c.id === id) || {}).size || ""} GB ▸`));
    if (installed.includes(model)) {
      if (model !== models.current) await post("/api/model", { model });
      await say(`**${model}** it is. I'm ready to think.`);
    } else {
      await post("/api/model/pull", { model });
      if (window.UmbraDownloads) UmbraDownloads.refresh();
      await say(`Downloading **${model}** in the background. We can carry on meanwhile: the **downloads button** at the top shows the progress, ` +
        `and pauses or resumes it any time. ${installed.length ? `Your current model keeps answering; ${model} waits for you to switch after it finishes.` : `${model} becomes active when it finishes.`} ` +
        "It goes on after a restart, and a chime tells you when it's done. Only the model is fetched; nothing of yours leaves this computer.");
    }

    // The library: packs of offline collections.
    const packCards = packs.map((p) => ({
      id: p.id,
      name: p.name + (p.recommended ? "  ★" : ""),
      line: `${p.count} collections · ${fmtSize(p.size)}${!p.missing.length ? " · ✓ installed" : p.missing.length < p.count ? ` · ${fmtSize(p.missingSize)} still to get` : ""} · ${p.tagline}`,
    }));
    packCards.push({ id: "none", name: "Not now", line: "I still work without a library, from the AI's own knowledge. Add collections any time from the Library." });
    const done = [...packs].reverse().find((p) => !p.missing.length);
    const fits = (p) => !sys.freeGB || p.missingSize / 1e9 < sys.freeGB - 2;
    let pack = done ? done.id : (packs.find((p) => p.recommended && fits(p)) || packs[0] || { id: "none" }).id;
    if (AUTO) pack = "none";
    await say("Next, my **library**: the offline knowledge I read from when I answer. With no library I answer from memory alone; " +
      "with a big one I can quote real field manuals, medical guides and repair steps.");
    a = await say("> *The more you prepare on a calm day, the more you'll have on a hard one.*\n\n" +
      `Pick a pack (you have **${sys.freeGB || "?"} GB** free). Downloads run in the background and are checked for damage.`);
    const packBy = (id) => packs.find((p) => p.id === id);
    await cards(a, packCards, pack, (id) => { pack = id; Sound.click(); }, (id) => {
      const p = packBy(id);
      return !p ? "CONTINUE ▸" : p.missing.length ? `DOWNLOAD ${fmtSize(p.missingSize)} ▸` : "CONTINUE ▸";
    });
    const chosen = packBy(pack);
    if (chosen && chosen.missing.length) {
      await post("/api/library/download", { ids: chosen.missing });
      await say(`Downloading **${chosen.name}** (${fmtSize(chosen.missingSize)}) in the background. Depending on your connection this can take a while; ` +
        "I'm usable right away, and each collection joins my library as soon as it arrives. Progress shows in the **downloads button** at the top and in the **Library**; " +
        "you can pause it and pick it up later, even after a restart.");
      if (window.UmbraDownloads) UmbraDownloads.refresh();
    } else if (chosen) {
      await say(`**${chosen.name}** is already on this computer. Well stocked.`);
    } else {
      await say("No problem. You can stock the library any time from the **Library** button.");
    }
  }

  // A colour theme, applied at once.
  async function stepTheme(themeList) {
    let a;
    a = await say("Let's make this place yours. **Pick a theme.** It applies right away, and you can change it any time from the palette button, follow your Omarchy theme, or design your own.");
    await cards(a, themeList.map((t) => ({
      id: t.id, name: t.name, line: t.tagline || "",
      swatch: `<span class="tour-sw">${["bg", "signal", "accent", "net"].map((k) => `<i style="background:${t[k] || t.vars?.[k] || "#888"}"></i>`).join("")}</span>`,
    })), currentTheme, (id) => { applyTheme(id); postSettings({ theme: id }); Sound.theme(); });
  }

  // The quick start after the name: the AI, the library, a theme, a short
  // look at the screen, and in.
  async function quickRest() {
    await stepBrainAndLibrary();
    await stepTheme(themes);
    let a = await say("Now a quick look at the screen: the parts you'll use most.");
    await choose(a, [["SHOW ME ▸", "go", true]]);
    await spotlight(true);
    a = await say("That's the essentials. Everything else (your full profile and health card, a password, scenarios and personalities, " +
      "maps, the Field Kit, the radar) waits in the menus, each with a short note the first time you open it. " +
      "Press **F1** for shortcuts, or replay the **full briefing** any time from Settings.");
    await choose(a, [["START USING UMBRA ▸", "go", true]]);
    completed = true;
  }

  // ------------------------------------------------------------- tour

  let skipHooks = [];
  let mode = "", completed = false, continentChosen = false;
  function skipTour() { skipped = true; skipHooks.forEach((f) => f()); }

  // Who Umbra is, in one ASCII frame, drawn line by line.
  const EMBLEM = [
    "            ▲",
    "           ╱ ╲            U M B R A  //  W I K I",
    "          ╱ ✦ ╲           offline survival intelligence",
    "         ╱  │  ╲",
    "        ◄───┼───►         ▸ a local AI, on this computer",
    "         ╲  │  ╱          ▸ a library of field manuals",
    "          ╲   ╱           ▸ maps, medic tools, radar",
    "           ╲ ╱            ▸ no internet, no accounts",
    "            ▼",
  ];
  async function introCard() {
    const msg = addBot("");
    const answer = msg.querySelector(".answer");
    msg.querySelector(".label .spin")?.remove();
    const pre = document.createElement("pre");
    pre.className = "tour-emblem";
    answer.appendChild(pre);
    Sound.glitch();
    const calm = document.body.classList.contains("reduce-motion");
    for (let i = 1; i <= EMBLEM.length; i++) {
      if (skipped) throw SKIP;
      pre.textContent = EMBLEM.slice(0, i).join("\n");
      wake();
      if (!calm) await wait(70);
    }
    await wait(300);
    return say("Hello, and welcome. I'm **Umbra**. I keep working when the grid, the phone network or the internet is gone, " +
      "and nothing you ask ever leaves this machine.\n\n**How would you like to start?**");
  }

  // Three ways in, as cards: pick one and it starts.
  function pickMode(answer) {
    const MODES = [
      ["quick", "QUICK START", "About a minute", "Your name, continent, my AI, the library and a look. The basics, then straight in.", true],
      ["full", "FULL BRIEFING", "About five minutes", "Everything: your continent and profile, health notes and ID card, a password, scenarios, personalities, comfort and power, and every tool on screen."],
      ["skip", "SKIP", "Straight in", "Set your continent later in Profile, and the AI in Core (click STATUS). Each screen explains itself the first time."],
    ];
    return new Promise((resolve, reject) => {
      const grid = document.createElement("div");
      grid.className = "tour-modes";
      MODES.forEach(([id, title, time, line, star]) => {
        const b = document.createElement("button");
        b.className = "tour-mode" + (star ? " star" : "");
        b.innerHTML = `<b></b><em></em><small></small>`;
        b.querySelector("b").textContent = title + (star ? "  ★" : "");
        b.querySelector("em").textContent = time;
        b.querySelector("small").textContent = line;
        b.addEventListener("mouseenter", Sound.hover);
        b.addEventListener("click", () => { grid.remove(); Sound.click(); resolve(id); });
        grid.appendChild(b);
      });
      answer.appendChild(grid);
      skipHooks.push(() => reject(SKIP));
      wake();
      // ?autotour=full plays the full briefing; plain ?autotour the quick start.
      const want = new URLSearchParams(location.search).get("autotour");
      autoClick(grid.querySelectorAll(".tour-mode")[want === "full" ? 1 : 0]);
    });
  }

  async function script() {
    const [themeList, loadout, profile] = await Promise.all([
      Promise.resolve(themes),
      fetch("loadout.json").then((r) => r.json()),
      fetch("/api/profile").then((r) => r.json()).catch(() => ({})),
    ]);
    const settings = await fetch("/api/settings").then((r) => r.json()).catch(() => ({}));

    const me = { ...profile };
    const saveMe = async () => {
      const r = await post("/api/profile", me).then((x) => x.json()).catch(() => null);
      if (r && !r.error && window.UmbraProfile) Object.assign(window.UmbraProfile.data, r);
      return !!r && !r.error;
    };

    // The tour choice comes first. Each actual tour asks for a continent;
    // SKIP leaves setup to the Profile later.
    let a = await introCard();
    mode = await pickMode(a);
    if (mode === "skip") throw SKIP;
    const full = mode === "full";

    // The rest of the profile is optional and saved as it grows.
    a = await say("First things first: **what should I call you?**");
    const name = await field(a, "Your name, any way you like to write it", 32);
    let who = name;
    if (name) {
      addUser(name);
      me.name = name;
      if (full) {
        a = await say(`Nice to meet you, **${name}**. Every good survivor has a **callsign**, too. Want one? I'll show it next to your name.`);
        const callsign = await field(a, "e.g. Nomad-7, Fox, Northstar", 24, false, false, "");
        if (callsign) { addUser(callsign); me.callsign = callsign; }
        a = await say("Want to tell me a little about yourself? What you're into, what you'd like to be ready for. It helps me give advice that fits you. This stays on this computer.");
        const about = await field(a, "For example: I'm new to camping and I'd like to be ready for power cuts.", 500, true);
        if (about) { addUser(about); me.about = about; }
      } else {
        await say(`Nice to meet you, **${name}**.`);
      }
      await saveMe();
    } else {
      who = "friend";
    }

    while (!continentChosen) {
      a = await say("**Choose your continent.** Maps will start there whenever you open it. You can change this later in your Profile.");
      const continent = await continentCards(a, me.continent);
      me.continent = continent;
      if (await saveMe()) continentChosen = true;
      else await say("I couldn't save that yet. Please choose it again so Maps knows where to start.");
    }
    a = await say("You can also add a **city, region or climate** if you like. This is optional and helps me give more local advice.");
    const where = await field(a, "e.g. Utrecht, Netherlands; wet winters", 80, false, false, "");
    if (where) { addUser(where); me.location = where; await saveMe(); }
    // The time zone says more than the language (plenty of people outside the
    // US use US English): the US, Liberia and Myanmar use imperial units.
    const zone = (Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    const guessUnits = /^(America\/(New_York|Detroit|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Nome|Adak|Boise|Menominee|Metlakatla|Yakutat|Indiana\/.*|Kentucky\/.*|North_Dakota\/.*)|US\/.*|Pacific\/Honolulu|Africa\/Monrovia|Asia\/(Yangon|Rangoon))$/.test(zone) ? "imperial" : "metric";
    me.units = me.units || guessUnits;
    if (!full) { await saveMe(); await quickRest(); return; }

    // Tailoring: units, experience, household, health.
    a = await say("**Which units** should I use for temperatures, distances and weights?");
    await cards(a, [
      { id: "metric", name: "Metric" + (guessUnits === "metric" ? "  ★" : ""), line: "°C, kilometres, metres, kilograms, litres" },
      { id: "imperial", name: "Imperial" + (guessUnits === "imperial" ? "  ★" : ""), line: "°F, miles, feet, pounds, gallons" },
    ], me.units, (id) => { me.units = id; Sound.click(); });
    a = await say("And **how much experience** do you have with survival and preparedness? I'll explain more, or less.");
    me.experience = me.experience || "some";
    await cards(a, [
      { id: "new", name: "New to this", line: "Explain the basics, step by step" },
      { id: "some", name: "Some experience", line: "A good balance" },
      { id: "experienced", name: "Seasoned", line: "Skip the basics, be concise and technical" },
    ], me.experience, (id) => { me.experience = id; Sound.click(); });
    a = await say("**What can you already do?** Pick the skills you have: I'll build on them and skip the basics there.");
    const skills = await multi(a, [["firstaid", "First aid"], ["navigation", "Map & compass"], ["radio", "Radio"], ["fire", "Fire"],
      ["shelter", "Shelter"], ["water", "Water"], ["foraging", "Foraging"], ["hunting", "Hunting"], ["fishing", "Fishing"],
      ["cooking", "Cooking"], ["gardening", "Growing food"], ["mechanics", "Mechanics"], ["electrics", "Electrics"],
      ["carpentry", "Carpentry"], ["sewing", "Sewing"], ["defence", "Self-defence"]].map(([id, name]) => ({ id, name })), new Set(me.skills || []));
    me.skills = [...skills];
    a = await say("**Who do you look after?** Kids, older family, pets: I'll plan for them too when it matters.");
    const household = await field(a, "e.g. 2 adults, a child of 6, a dog", 160, false, false, "");
    if (household) { addUser(household); me.household = household; }
    a = await say("An **emergency contact**, for your ID card: who should a helper call? Name and phone. Optional.");
    const contact = await field(a, "e.g. Sam (partner) +31 6 1234 5678", 80, false, false, "");
    if (contact) { addUser(contact); me.contact = contact; }
    a = await say("Now your **health**, for first aid and food advice, and your pocket ID card. All optional; it never leaves this computer. " +
      "First, **your blood type**, if you know it.");
    await cards(a, ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => ({ id: b, name: b || "Don't know", line: "" })),
      me.blood || "", (id) => { me.blood = id; Sound.click(); });
    a = await say("Any **allergies**? I'll never suggest them.");
    const allergies = await field(a, "e.g. penicillin, peanuts, bee stings", 160, false, false, "");
    if (allergies) { addUser(allergies); me.allergies = allergies; }
    a = await say("Any **medication** you take regularly, or a condition I should keep in mind?");
    const health = await field(a, "e.g. inhaler for asthma", 300, true);
    if (health) { addUser("(health notes saved)"); me.health = health; }
    a = await say("Last touch: **the colour of your name** in our conversations.");
    const colours = [["", "Default"], ["signal", "Signal"], ["accent", "Accent"], ["net", "Network"], ["red", "Red"], ["fg-bright", "White"]];
    await cards(a, colours.map(([id, label]) => ({
      id, name: label, line: "",
      swatch: `<span class="tour-sw"><i style="background:var(--${id || "fg"})"></i></span>`,
    })), me.color || "", (id) => { me.color = id; Sound.click(); });
    await saveMe();
    await say("Saved to your **Profile**, where you can change any of it, and where your **dog tag** shows it at a glance. " +
      "You'll also find your **Achievements** there: badges you earn as you learn and prepare. The first one is for finishing this briefing.");

    // An optional password: typed as dots, asked twice.
    a = await say("Would you like a **password** on Umbra? It's optional. I'll ask for it when I start and when you lock the screen, " +
      "so nobody else can read your conversations here. (It keeps the screen private; it doesn't encrypt your files.)");
    if (await choose(a, [["SET A PASSWORD", "yes", true], ["NO THANKS", "no"]]) === "yes") {
      a = await say("Type your password.");
      const first = await field(a, "Password", 200, false, true);
      if (first) {
        a = await say("And once more, to be sure.");
        const second = await field(a, "Repeat the password", 200, false, true);
        if (first === second) {
          await post("/api/password", { new: first });
          if (window.refreshPasswordLock) window.refreshPasswordLock();
          await say("Done. Your Umbra is locked with a password. You can change or remove it any time in your **Profile**.");
        } else {
          await say("Those didn't match, so I haven't set a password. You can set one any time in your **Profile**.");
        }
      }
    }

    await say("Here's what I'm for. Out of the box I'm built for **survival and off-grid life**: water, fire, shelter, first aid, food, " +
      "power, repairs and radio, for when the grid, the phone network or the internet is gone. And for everyday preparation long before that.");
    a = await say("But I'm not limited to that. I can also be your **programming tutor**, help you **study** any subject, run a **homestead**, " +
      "**fix things** in the workshop, or just trade stories by the fire. You can even **create your own scenarios** for anything you like. " +
      "Your Umbra is yours to shape.");
    await choose(a, [["GOT IT ▸", "ok", true]]);

    await stepBrainAndLibrary();
    await stepTheme(themeList);

    // Scenario.
    const scenarios = loadout.scenarios;
    a = await say("Now the **scenario**: the situation you're in. It changes what I focus on and how urgent I am. " +
      "I'd start with **Everyday Prep**: normal life, planning ahead. When things get real, switch to Wilderness, Grid Down or Medical Emergency in a click.");
    await cards(a, scenarios.map((s) => ({ id: s.id, name: s.name, line: s.tagline })), settings.scenario || "everyday",
      (id) => { postSettings({ scenario: id }); Sound.theme(); });

    // Personality.
    a = await say("And **who should I be?** Each personality has its own voice and style (the facts never change, only how I tell them). " +
      "I'd suggest starting with me, **Umbra**: calm and friendly. The Sergeant is short and firm, The Medic careful and precise, The Old-Timer full of stories… Pick whoever you'd like beside you.");
    await cards(a, loadout.personalities.map((p) => ({ id: p.id, name: p.name, line: p.tagline })), settings.personality || "umbra",
      (id) => { postSettings({ personality: id }); Sound.theme(); });
    if (window.reloadLoadout) window.reloadLoadout();

    // Comfort: text size, the start screen, and power.
    a = await say("Let's make it comfortable. First, **how big should my text be?** It changes right away.");
    const sizes = [["0.9", "Small"], ["1", "Normal"], ["1.12", "Large"], ["1.25", "Extra large"]];
    await cards(a, sizes.map(([id, name]) => ({ id, name, line: id === "1" ? "The default" : "" })), String(settings.textScale || 1), (id) => {
      document.documentElement.style.setProperty("--ts", id);
      postSettings({ textScale: Number(id) });
      if (window.prefs) window.prefs.textScale = Number(id);
      Sound.click();
    });
    const bgs = (window.UmbraBackgrounds && window.UmbraBackgrounds.list) || [];
    if (bgs.length) {
      a = await say("And **what should move behind my start screen?** Pick a mood; you'll see it in a moment.");
      await cards(a, bgs.map(([id, name]) => ({ id, name })), settings.background || "rain", (id) => {
        postSettings({ background: id });
        if (window.prefs) window.prefs.background = id;
        Sound.click();
      });
    }
    a = await say("**How hard may I work your processor** while I write? Lower keeps a laptop cooler and quieter; answers take longer.");
    await cards(a, [
      { id: "100", name: "Full  ★", line: "Fastest answers" },
      { id: "75", name: "Strong", line: "Most of the processor" },
      { id: "50", name: "Balanced", line: "Half: cooler and quieter" },
      { id: "25", name: "Light", line: "Gentle on the battery and fans; slow" },
    ], String(settings.cpuLimit || 100), (id) => { postSettings({ cpuLimit: Number(id) }); if (window.prefs) window.prefs.cpuLimit = Number(id); Sound.click(); });
    let offgridChoice = settings.offgrid || "auto";
    a = await say("One more, and it matters off the grid: **off-grid mode**, my battery saver. It stops the animations, keeps me quiet, " +
      "skips my extra AI work and makes my answers shorter, so the battery lasts. \"On battery\" switches it on by itself when you unplug.");
    await cards(a, [
      { id: "auto", name: "On battery  ★", line: "Recommended for laptops: saves power only when unplugged" },
      { id: "off", name: "Off", line: "Full experience, always" },
      { id: "on", name: "Always on", line: "Lightest on power, all the time" },
    ], settings.offgrid || "auto", (id) => { offgridChoice = id; Sound.click(); });
    await postSettings({ offgrid: offgridChoice });   // the preselected choice counts too
    const voice = await fetch("/api/voice").then((r) => r.json()).catch(() => ({}));
    await say(voice.available
      ? "Last thing: **voice input is ready.** Hold **F9** (or click the microphone) and just talk; it's turned into text right here, offline."
      : `Last thing: **voice input** isn't installed yet. Install it with \`${voice.install || "omarchy-voxtype-install"}\` and then hold **F9** to talk to me.`);

    // The screen, piece by piece.
    a = await say("Now a quick look at the screen, piece by piece.");
    await choose(a, [["START THE SCREEN TOUR ▸", "go", true]]);
    await spotlight();

    a = await say("A few more things worth knowing:\n\n" +
      "- My answers cite their sources as numbered tags. **Hover** one for a summary, **click** to open the page.\n" +
      "- I usually end with an offer. Click it, or press **Tab** and pick it. Under an answer, buttons open the tool that fits (the CPR metronome for CPR, a manual page, the map…).\n" +
      "- While I think, a little scene and **field notes** keep you company. Answers take a minute or so, because everything runs on this computer.\n" +
      "- My **Field Manual** (in the Library) has the critical basics, from bleeding to water, and I use it in my answers too.\n" +
      "- Scroll up any time, even while I'm writing: the whole conversation is one long page, with the start screen on top.\n" +
      "- Earn **achievements** as you go (questions, topics, streaks, the field manual…); pin your favourite badges to your profile.\n" +
      "- **Export** conversations or the manual to a file or a USB stick, and **back up** your whole Umbra from Settings.\n" +
      "- Every download can be **paused and resumed**, even after a restart; a chime tells you when it's done.\n" +
      "- After an update, I'll show you **what's new**, once.\n" +
      "- Press **F1** any time for the keyboard shortcuts.\n" +
      "- On Omarchy, the **Umbra icon in the top bar** opens me, shows your loadout and a new field note every hour, and lights up when an answer is waiting.");
    a = await say(`That's the tour${who !== "friend" ? `, **${who}**` : ""}. You can replay it any time from **Settings**. Ready when you are.`);
    await choose(a, [["START USING UMBRA ▸", "go", true]]);
    completed = true;
  }

  async function startTour() {
    if (document.body.classList.contains("touring")) return;
    skipped = false;
    skipHooks = [];
    mode = ""; completed = false; continentChosen = false;
    document.body.classList.add("touring");
    stopRain();
    feed.innerHTML = "";
    chat.length = 0;
    const skip = document.createElement("button");
    skip.className = "ghost tour-skip";
    skip.textContent = "SKIP TOUR ✕";
    skip.addEventListener("click", skipTour);
    document.body.appendChild(skip);
    try { await script(); } catch (e) { if (e !== SKIP) console.error("umbra tour: " + e.message); }
    skip.remove();
    document.querySelector(".spot-shade")?.remove();
    document.body.classList.remove("touring");
    if (mode !== "skip" && !skipped && !continentChosen) return;  // retry after a failed save
    // The tour covers what's new, so the "what's new" note waits for the next update.
    const version = (await fetch("/api/whatsnew").then((r) => r.json()).catch(() => ({}))).version;
    // A tour played to the end earns the first achievement; a skipped one doesn't.
    await postSettings({ onboarded: true, ...(completed ? { tourDone: true } : {}), ...(version ? { seenVersion: version } : {}) });
    if (window.reloadPrefs) await window.reloadPrefs();
    if (window.prefs) window.prefs.onboarded = true;
    // From the tour to the home screen through an ASCII transition.
    const me = (window.UmbraProfile && window.UmbraProfile.data.name) || "";
    await asciiWipe(() => { showIntro(); window.scrollTo(0, 0); }, { welcome: me ? `WELCOME, ${me}` : "WELCOME, SURVIVOR" });
    input.focus();
  }
  window.startTour = startTour;

  // First launch (or after a reset): no "onboarded" in the settings yet.
  fetch("/api/settings").then((r) => r.json()).then((s) => {
    if (!s.onboarded && !new URLSearchParams(location.search).get("q")) setTimeout(startTour, 4600);   // as the boot animation opens up
  }).catch(() => {});
})();
