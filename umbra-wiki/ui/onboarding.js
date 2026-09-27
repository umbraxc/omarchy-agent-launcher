// Umbra Wiki welcome tour: on the very first launch (and after a reset, or
// from Settings) Umbra walks the user through everything in the chat: who
// it is, their name, what it's for, theme, scenario and personality, a
// spotlight tour of the screen, and the extras. Scripted, so it's instant.
"use strict";

(() => {
  let skipped = false;
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
      skipHooks.push(() => reject(SKIP));
      wake();
    });
  }

  // A text field under the last message; resolves with the text ("" = skipped).
  function field(answer, placeholder, max, multiline = false) {
    return new Promise((resolve, reject) => {
      const box = document.createElement("div");
      box.className = "tour-field";
      box.innerHTML = `${multiline ? "<textarea rows='3'></textarea>" : "<input>"}
        <button class="solid">CONTINUE ⏎</button><button class="ghost">SKIP</button>`;
      const inp = box.querySelector("input, textarea");
      inp.placeholder = placeholder;
      inp.maxLength = max;
      const done = (v) => { box.remove(); Sound.click(); resolve(v); };
      box.querySelector(".solid").addEventListener("click", () => done(inp.value.trim()));
      box.querySelector(".ghost").addEventListener("click", () => done(""));
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); done(inp.value.trim()); } });
      answer.appendChild(box);
      skipHooks.push(() => reject(SKIP));
      wake();
      setTimeout(() => inp.focus(), 50);
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
      next.querySelector("button").addEventListener("click", () => { grid.classList.add("done"); next.remove(); Sound.click(); resolve(); });
      answer.append(grid, next);
      skipHooks.push(() => reject(SKIP));
      wake();
    });
  }

  // -------------------------------------------------------- spotlight

  const SPOTS = [
    [".brand", "UMBRA // WIKI", "Your current loadout is shown under the name. Click it to switch scenario or personality."],
    ["#link", "LINK", "LOCAL means fully offline (the default). Switch to ONLINE when you have internet and I add Wikipedia for fuller, more current answers. I always ask first."],
    [".cell.status", "STATUS", "Shows when I'm ready, working, or can't reach my AI."],
    ["#loadout-btn", "PROFILE & LOADOUT", "Your profile (name, picture, character), plus scenarios and personalities. You can create your own of both."],
    ["#history-btn", "HISTORY", "Every conversation is saved on this computer. Reopen and continue any of them."],
    ["#library-btn", "LIBRARY", "The offline collections I read from. Download more here: medicine, repairs, gardening, radio and more."],
    ["#theme-btn", "THEMES", "Pick a colour theme, follow your Omarchy theme, or design your own."],
    ["#sound", "SOUND", "Mute or unmute my sounds."],
    ["#lock", "LOCK", "Locks the window so nothing can be clicked or typed by accident."],
    ["#settings-btn", "SETTINGS", "Volume, motion, the AI model, voice, storage, replaying this tour, and resetting Umbra."],
    ["#q", "ASK", "Type here. Enter sends, Shift+Enter adds a line, Tab uses my suggested reply, Ctrl+Z undoes."],
    ["#mic", "VOICE", "Hold F9 (or click) and just talk. Speech is turned into text offline."],
    ["#send", "TRANSMIT", "Sends your question. While I'm answering it becomes STOP (or press Esc)."],
  ];

  function spotlight() {
    return new Promise((resolve, reject) => {
      const steps = SPOTS.filter(([sel]) => {
        const el = $(sel);
        return el && el.getClientRects().length && el.getBoundingClientRect().width > 0;
      });
      const shade = document.createElement("div");
      shade.className = "spot-shade";
      shade.innerHTML = `<div class="spot"></div><div class="spot-card"><div class="spot-n"></div>
        <div class="spot-title"></div><p class="spot-text"></p>
        <div class="spot-actions"><button class="ghost spot-back">◂ BACK</button><button class="solid spot-next">NEXT ▸</button></div></div>`;
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
      addEventListener("resize", show);
      skipHooks.push(() => finish(false));
      show();
    });
  }

  // ------------------------------------------------------------- tour

  let skipHooks = [];

  async function script() {
    const [themeList, loadout, profile] = await Promise.all([
      Promise.resolve(themes),
      fetch("loadout.json").then((r) => r.json()),
      fetch("/api/profile").then((r) => r.json()).catch(() => ({})),
    ]);
    const settings = await fetch("/api/settings").then((r) => r.json()).catch(() => ({}));

    let a = await say("Hello, and welcome. I'm **Umbra**, your offline survival assistant.\n\n" +
      "I run entirely on this computer. A local AI reads from a library of survival, medical and practical guides stored right here, " +
      "so I keep working with **no internet**, no accounts and no subscriptions, and nothing you ask ever leaves this machine.");
    a = await say("Let me show you around. It takes about two minutes, and you can skip it at any time with **SKIP TOUR** at the top.");
    if (await choose(a, [["SHOW ME AROUND ▸", "go", true], ["SKIP THE TOUR", "skip"]]) === "skip") throw SKIP;

    // Name and a little about the user: this becomes their profile.
    a = await say("First things first: **what should I call you?**");
    const name = await field(a, "Your name, any way you like to write it", 32);
    let who = name;
    if (name) {
      addUser(name);
      a = await say(`Nice to meet you, **${name}**. Want to tell me a little about yourself? Where you live, who you look after, what you're into. It helps me give advice that fits you. This stays on this computer.`);
      const about = await field(a, "For example: I live in the countryside with my partner and two dogs, and I'm new to camping.", 500, true);
      if (about) addUser(about);
      await post("/api/profile", { ...profile, name, about: about || profile.about || "" });
      if (window.UmbraProfile) Object.assign(window.UmbraProfile.data, { name, about: about || profile.about || "" });
    } else {
      who = "friend";
    }

    await say("Here's what I'm for. Out of the box I'm built for **survival and off-grid life**: water, fire, shelter, first aid, food, " +
      "power, repairs and radio, for when the grid, the phone network or the internet is gone. And for everyday preparation long before that.");
    a = await say("But I'm not limited to that. I can also be your **programming tutor**, help you **study** any subject, run a **homestead**, " +
      "**fix things** in the workshop, or just trade stories by the fire. You can even **create your own scenarios** for anything you like. " +
      "Your Umbra is yours to shape.");
    await choose(a, [["GOT IT ▸", "ok", true]]);

    // The AI model: what's already on this computer, or one of three sizes.
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
    await cards(a, modelCards, model, (id) => { model = id; Sound.click(); },
      (id) => (installed.includes(id) ? "USE THIS MODEL ▸" : `DOWNLOAD ${(models.choices.find((c) => c.id === id) || {}).size || ""} GB ▸`));
    if (installed.includes(model)) {
      if (model !== models.current) await post("/api/model", { model });
      await say(`**${model}** it is. I'm ready to think.`);
    } else {
      await post("/api/model/pull", { model });
      await say(`Downloading **${model}** in the background. We can carry on meanwhile; you'll see the progress under **STATUS** at the top.`);
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
        "I'm usable right away, and each collection joins my library as soon as it arrives. Progress shows under **STATUS** and in the **Library**.");
    } else if (chosen) {
      await say(`**${chosen.name}** is already on this computer. Well stocked.`);
    } else {
      await say("No problem. You can stock the library any time from the **Library** button.");
    }

    // Theme.
    a = await say("Let's make this place yours. **Pick a theme.** It applies right away, and you can change it any time from the palette button, follow your Omarchy theme, or design your own.");
    await cards(a, themeList.map((t) => ({
      id: t.id, name: t.name, line: t.tagline || "",
      swatch: `<span class="tour-sw">${["bg", "signal", "accent", "net"].map((k) => `<i style="background:${t[k] || t.vars?.[k] || "#888"}"></i>`).join("")}</span>`,
    })), currentTheme, (id) => { applyTheme(id); postSettings({ theme: id }); Sound.theme(); });

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

    // The screen, piece by piece.
    a = await say("Now a quick look at the screen, piece by piece.");
    await choose(a, [["START THE SCREEN TOUR ▸", "go", true]]);
    await spotlight();

    a = await say("A few more things worth knowing:\n\n" +
      "- My answers cite their sources as numbered tags. **Hover** one for a summary, **click** to open the page.\n" +
      "- I usually end with an offer. Click it, or press **Tab** then **Enter**, to accept.\n" +
      "- While I think, a little scene and **field notes** keep you company. Answers take a minute or so, because everything runs on this computer.\n" +
      "- On Omarchy, the **Umbra icon in the top bar** opens me, shows your loadout and a new field note every hour, and lights up when an answer is waiting.");
    a = await say(`That's the tour${who !== "friend" ? `, **${who}**` : ""}. You can replay it any time from **Settings**. Ready when you are.`);
    await choose(a, [["START USING UMBRA ▸", "go", true]]);
  }

  async function startTour() {
    if (document.body.classList.contains("touring")) return;
    skipped = false;
    skipHooks = [];
    document.body.classList.add("touring");
    stopRain();
    feed.innerHTML = "";
    chat.length = 0;
    const skip = document.createElement("button");
    skip.className = "ghost tour-skip";
    skip.textContent = "SKIP TOUR ✕";
    skip.addEventListener("click", () => { skipped = true; skipHooks.forEach((f) => f()); });
    document.body.appendChild(skip);
    try { await script(); } catch (e) { if (e !== SKIP) console.error("umbra tour: " + e.message); }
    skip.remove();
    document.querySelector(".spot-shade")?.remove();
    document.body.classList.remove("touring");
    postSettings({ onboarded: true });
    if (window.prefs) window.prefs.onboarded = true;
    showIntro();
    input.focus();
  }
  window.startTour = startTour;

  // First launch (or after a reset): no "onboarded" in the settings yet.
  fetch("/api/settings").then((r) => r.json()).then((s) => {
    if (!s.onboarded && !new URLSearchParams(location.search).get("q")) setTimeout(startTour, 900);
  }).catch(() => {});
})();
