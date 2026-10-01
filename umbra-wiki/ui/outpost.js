// Umbra Outpost: a fictional, local game with its own save and authored stories.
"use strict";
(() => {
  const button = document.getElementById("outpost-btn");
  const panel = document.createElement("section");
  panel.id = "outpost"; panel.className = "loadout op"; panel.hidden = true;
  panel.setAttribute("aria-label", "Umbra Outpost game");
  panel.innerHTML = `<header class="lo-head op-head"><span class="lo-title">✦ UMBRA OUTPOST</span><span class="op-sub">A SMALL WORLD THAT KEEPS GROWING</span><button class="op-close" type="button">CLOSE ✕</button></header>
    <div class="op-scroll"><div class="op-intro"><div><small>OUTPOST // DAY ONE</small><h1>Keep the lights on.</h1><p>Build a haven, follow the signals, and see what the valley remembers.</p></div><span>FICTIONAL GAME · SAVED LOCALLY</span></div>
    <div class="op-scene" aria-label="Animated ASCII outpost landscape"><pre class="op-art" aria-hidden="true"></pre><div class="op-scene-label">◈ VALLEY VIEW <span>LOCAL SIGNAL · ACTIVE</span></div></div>
    <div class="op-summary" role="status" aria-live="polite"></div><div class="op-resource-grid"></div>
    <div class="op-columns"><section><h2>◈ BUILD & UPGRADE</h2><p class="op-help">Stations make resources while Umbra is closed. Each level increases production.</p><div class="op-stations"></div></section>
    <section><h2>◇ EXPEDITIONS</h2><p class="op-help">Two stories are waiting beyond the valley. Choose what happens when your team returns.</p><div class="op-expeditions"></div></section></div>
    <section class="op-log"><h2>⌁ FIELD LOG</h2><div class="op-log-lines"></div></section></div>`;
  document.body.appendChild(panel);
  const $o = s => panel.querySelector(s);
  const names = {food:"FOOD", water:"WATER", wood:"WOOD", scrap:"SCRAP", energy:"ENERGY", medicine:"MEDICINE", knowledge:"KNOWLEDGE", morale:"MORALE"};
  const symbols = {food:"✿", water:"≈", wood:"♣", scrap:"▣", energy:"ϟ", medicine:"✚", knowledge:"◇", morale:"♥"};
  const stationNames = {garden:"Garden beds", well:"Rain well", lumber:"Timber yard", salvage:"Salvage bench", solar:"Solar array", clinic:"Field clinic", archive:"Radio archive", hearth:"Common hearth"};
  let data = null, busy = false, frame = 0;
  const clean = value => escapeHtml(String(value));
  const number = value => Math.floor(value).toLocaleString();
  const costText = cost => Object.entries(cost).map(([key,value]) => `${value} ${names[key].toLowerCase()}`).join(" · ") || "No cost";
  const affordable = cost => Object.entries(cost).every(([key,value]) => data.state.resources[key] >= value);
  const artRows = [
    "                 .       *               .                     +          ",
    "      .       /\\           .       /\\          .      *                  ",
    "          /\\/  \\     .        /\\/  \\                /\\               ",
    "     /\\  /      \\  /\\     /\\/      \\  /\\       /\\/  \\       .     ",
    "  __/  \\/        \\/  \\___/            \\/  \\____/      \\________  ",
    "                           |  .---.   |      _|_|_                     ",
    "         .      .            | /  _  \\  |     | ϟ |       .             ",
    "    ____/\\______      ______| | |_| |  |_____|___|______/\\______       ",
    "  /     ||      \\    /      | |___| |  /     /   \\      ||      \\      ",
    " /______||_______\\__/_______|_______|_/_____/_____\\_____||_______\\_____",
    "     \\      /         \\      /          \\     /         \\       /       ",
    "      \\____/     .    \\____/      .    \\___/     .    \\_____/        ",
    "         \\               /                   \\              /           ",
    "          \\_____________/_____________________\\____________/            "
  ];
  function draw() {
    if (panel.hidden || document.hidden || document.body.classList.contains("reduce-motion")) return;
    frame++;
    const rows = artRows.map((row, i) => {
      if (i > 3) return row;
      const chars = [...row];
      for (let n = 0; n < 2; n++) {
        const x = (frame * (n + 1) * 3 + i * 17 + n * 31) % chars.length;
        if (chars[x] === " ") chars[x] = frame % 3 === 0 ? "·" : " ";
      }
      return chars.join("");
    });
    const lit = data ? Object.entries(data.state.stations).filter(([,level]) => level > 0).map(([key]) => key.toUpperCase()) : [];
    rows.push(`  └─ ${lit.length ? lit.join(" · ") : "FIRST LIGHT"} ─┘`);
    $o(".op-art").textContent = rows.join("\n");
  }
  function render() {
    if (!data) return;
    const state = data.state, active = state.active;
    $o(".op-scene-label span").textContent = `${Object.values(state.stations).filter(level => level > 0).length} STATIONS ONLINE`;
    $o(".op-summary").textContent = active ? `EXPEDITION ACTIVE · ${data.routes[active.route].title}` : "THE OUTPOST IS READY FOR YOUR NEXT MOVE";
    $o(".op-resource-grid").innerHTML = Object.entries(names).map(([key,label]) => `<div class="op-resource"><span>${symbols[key]} ${label}</span><b>${number(state.resources[key])}</b><small>${stationNames[Object.keys(data.stations).find(s => data.stations[s][0] === key)]}</small></div>`).join("");
    $o(".op-stations").innerHTML = Object.entries(data.stations).map(([key,[resource,base]]) => {
      const level = state.stations[key] || 0, cost = Object.fromEntries(Object.entries(base).map(([r,n]) => [r,n * (level + 1)]));
      return `<article class="op-card"><div><b>${symbols[resource]} ${stationNames[key]}</b><small>LEVEL ${level}/5 · ${level ? (level * (2 + .4 * level)).toFixed(1) + "/H" : "INACTIVE"} ${names[resource]}</small></div><button data-upgrade="${key}" ${level >= 5 || !affordable(cost) || busy ? "disabled" : ""}>${level >= 5 ? "MAXED" : level ? "UPGRADE" : "BUILD"}</button><p>${level >= 5 ? "Fully upgraded" : costText(cost)}</p></article>`;
    }).join("");
    let expedition = "";
    if (active) {
      const route = data.routes[active.route], ready = active.ready <= data.now;
      expedition = `<article class="op-story"><small>${route.title} · PART ${active.step + 1}/2</small>${ready ? `<p>${clean(data.scene.text)}</p><div class="op-choices">${data.scene.choices.map((choice,i) => `<button data-choice="${i}" ${!affordable(choice.cost) || busy ? "disabled" : ""}>${clean(choice.label)}<small>${clean(costText(choice.cost))}</small></button>`).join("")}</div>` : `<p>Your team is following the trail. Check back in <b>${Math.max(1,Math.ceil((active.ready - data.now)/60))} minutes</b>.</p>`}</article>`;
    } else expedition = Object.entries(data.routes).map(([key,route]) => `<article class="op-story"><small>${clean(route.title)} ${state.completed.includes(key) ? "· COMPLETE" : ""}</small><p>${clean(route.intro)}</p><button data-launch="${key}" ${state.completed.includes(key) || !affordable(route.cost) || busy ? "disabled" : ""}>${state.completed.includes(key) ? "STORY COMPLETE" : "SEND EXPEDITION"}</button><small>${clean(costText(route.cost))} · ${route.minutes} MIN</small></article>`).join("");
    $o(".op-expeditions").innerHTML = expedition;
    $o(".op-log-lines").innerHTML = state.log.map(line => `<p>› ${clean(line)}</p>`).join("");
    draw();
  }
  async function refresh(action) {
    if (busy) return;
    busy = true;
    let succeeded = false;
    try {
      const response = await fetch("/api/outpost", action ? {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(action)} : undefined);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Outpost is unavailable.");
      data = result; render();
      succeeded = true;
      if (action) (action.type === "choose" ? Sound.complete : Sound.click)();
      $o(".op-summary").classList.remove("op-error");
    } catch (error) {
      $o(".op-summary").textContent = error.message;
      $o(".op-summary").classList.add("op-error"); Sound.error();
    } finally { busy = false; if (succeeded) render(); }
  }
  function close() { panel.hidden = true; button.classList.remove("on"); document.body.classList.remove("outpost-open"); }
  function toggle() {
    if (!panel.hidden) { close(); Sound.click(); return; }
    if (window.locked || document.body.classList.contains("locked")) return;
    ["closeSettings","closeLoadout","closeHistory","closeMaps","closeFieldKit","closeFarming","closeRadar","closeCore"].forEach(key => window[key]?.());
    toggleThemes(false, true);
    document.getElementById("library").hidden = true;
    document.getElementById("library-btn").classList.remove("on");
    panel.hidden = false; button.classList.add("on"); document.body.classList.add("outpost-open");
    refresh(); Sound.click();
  }
  button.addEventListener("click", toggle);
  $o(".op-close").addEventListener("click", () => { close(); Sound.click(); });
  panel.addEventListener("click", event => {
    const target = event.target.closest("button[data-upgrade],button[data-launch],button[data-choice]");
    if (!target || target.disabled) return;
    if (target.dataset.upgrade) refresh({type:"upgrade",station:target.dataset.upgrade});
    else if (target.dataset.launch) refresh({type:"launch",route:target.dataset.launch});
    else refresh({type:"choose",choice:Number(target.dataset.choice)});
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !panel.hidden) close(); });
  const otherPanels = ["maps","fieldkit","farming","radar","loadout","history","library","themes","settings","core"];
  new MutationObserver(() => { if (!panel.hidden && otherPanels.some(id => document.getElementById(id)?.hidden === false)) close(); })
    .observe(document.body, {subtree:true,attributes:true,attributeFilter:["hidden"]});
  setInterval(() => { if (!panel.hidden && !document.hidden) refresh(); }, 30000);
  setInterval(draw, 650);
  window.closeOutpost = close;
})();
