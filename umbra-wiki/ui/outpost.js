// Umbra Outpost: a fictional, local game with its own save and authored stories.
"use strict";
(() => {
  const button = document.getElementById("outpost-btn");
  const panel = document.createElement("section");
  panel.id = "outpost"; panel.className = "loadout op"; panel.hidden = true;
  panel.setAttribute("aria-label", "Umbra Outpost game");
  panel.innerHTML = `<header class="lo-head op-head"><span class="lo-title">✦ UMBRA OUTPOST</span><span class="op-sub">A SMALL WORLD THAT KEEPS GROWING</span><button class="op-close" type="button">CLOSE ✕</button></header>
    <div class="op-scroll"><div class="op-intro"><div><small>OUTPOST // DAY ONE</small><h1>Keep the lights on.</h1><p>Build a haven, follow the signals, and see what the valley remembers.</p></div><span>FICTIONAL GAME · SAVED LOCALLY</span></div>
    <div class="op-scene" aria-label="Animated ASCII outpost landscape"><canvas class="op-canvas" role="img" aria-label="Eight camp sites drawn in animated, shaded ASCII glyphs; hover a site for live production"></canvas><div class="op-site-tip" hidden></div><div class="op-scene-label">◈ VALLEY VIEW <span>LOCAL SIGNAL · ACTIVE</span></div></div>
    <div class="op-summary" role="status" aria-live="polite"></div><div class="op-resource-grid"></div>
    <div class="op-columns"><section><h2>◈ BUILD & UPGRADE</h2><p class="op-help">Stations make resources while Umbra is closed. Each level increases production.</p><div class="op-stations"></div></section>
    <section><h2>◇ EXPEDITIONS</h2><p class="op-help">Two stories are waiting beyond the valley. Choose what happens when your team returns.</p><div class="op-expeditions"></div></section></div>
    <section class="op-log"><h2>⌁ FIELD LOG</h2><div class="op-log-lines"></div></section></div>`;
  document.body.appendChild(panel);
  const $o = s => panel.querySelector(s);
  const names = {food:"FOOD", water:"WATER", wood:"WOOD", scrap:"SCRAP", energy:"ENERGY", medicine:"MEDICINE", knowledge:"KNOWLEDGE", morale:"MORALE"};
  const symbols = {food:"✿", water:"≈", wood:"♣", scrap:"▣", energy:"ϟ", medicine:"✚", knowledge:"◇", morale:"♥"};
  const stationNames = {garden:"Garden beds", well:"Rain well", lumber:"Timber yard", salvage:"Salvage bench", solar:"Solar array", clinic:"Field clinic", archive:"Radio archive", hearth:"Common hearth"};
  const glyphArt = {
    food: ["╭✿╮", "▒▒▒", "╰─╯"], water: ["╭≈╮", "│≈│", "╰─╯"],
    wood: ["╱♣╲", "♣♣♣", " ║ "], scrap: ["┏▣┓", "┃▒┃", "┗━┛"],
    energy: ["╲ϟ╱", "━╋━", "╱ϟ╲"], medicine: ["┏━┓", "┃✚┃", "┗━┛"],
    knowledge: ["╭◇╮", "│≡│", "╰━╯"], morale: ["╭♥╮", "│▒│", "╰✦╯"]
  };
  let data = null, busy = false, anchor = performance.now();
  const clean = value => escapeHtml(String(value));
  const number = value => Math.floor(value).toLocaleString();
  const costText = cost => Object.entries(cost).map(([key,value]) => value + " " + names[key].toLowerCase()).join(" · ") || "No cost";
  const affordable = cost => Object.entries(cost).every(([key,value]) => data.state.resources[key] >= value);
  const rate = level => level * (2 + .4 * level);
  const duration = value => {
    const seconds = Math.max(0, Math.ceil(value)), minutes = Math.floor(seconds / 60);
    return minutes >= 60 ? Math.floor(minutes / 60) + "H " + (minutes % 60) + "M"
      : minutes + ":" + String(seconds % 60).padStart(2, "0");
  };
  const elapsed = () => Math.max(0, (performance.now() - anchor) / 1000);
  const liveAmount = key => {
    if (!data) return 0;
    const station = Object.keys(data.stations).find(name => data.stations[name][0] === key);
    return Math.min(250, data.state.resources[key] + elapsed() * rate(data.state.stations[station] || 0) / 3600);
  };
  const art = UmbraOutpostArt.start($o(".op-canvas"), () => data && ({
    ...data, state: {...data.state, resources: Object.fromEntries(Object.keys(names).map(key => [key, liveAmount(key)]))}
  }));
  function tickLive() {
    if (!data || panel.hidden) return;
    panel.classList.toggle("op-still", !!window.offgrid);
    for (const key of Object.keys(names)) {
      const card = $o('.op-resource[data-resource="' + key + '"]');
      if (!card) continue;
      const amount = liveAmount(key), station = Object.keys(data.stations).find(name => data.stations[name][0] === key);
      const hourly = rate(data.state.stations[station] || 0), fraction = amount - Math.floor(amount);
      card.querySelector(".op-number").textContent = number(amount);
      card.querySelector(".op-decimal").textContent = "." + Math.floor(fraction * 100).toString().padStart(2, "0");
      card.querySelector(".op-progress-fill").style.width = (hourly ? Math.max(2, fraction * 100) : 0) + "%";
      card.querySelector(".op-progress").setAttribute("aria-valuenow", Math.floor(fraction * 100));
      card.querySelector(".op-next").textContent = hourly && amount < 250
        ? "NEXT +1 IN " + duration((1 - fraction) / hourly * 3600)
        : amount >= 250 ? "STORAGE FULL" : "BUILD TO START";
    }
    if (data.state.active && !data.scene) {
      const seconds = Math.max(0, Math.ceil(data.state.active.ready - data.now - elapsed()));
      const countdown = $o(".op-countdown");
      if (countdown) countdown.textContent = duration(seconds);
      if (seconds === 0 && !busy) refresh();
    }
  }
  function render() {
    if (!data) return;
    const state = data.state, active = state.active;
    $o(".op-scene-label span").textContent = `${Object.values(state.stations).filter(level => level > 0).length} STATIONS ONLINE`;
    $o(".op-summary").textContent = active ? `EXPEDITION ACTIVE · ${data.routes[active.route].title}` : "THE OUTPOST IS READY FOR YOUR NEXT MOVE";
    $o(".op-resource-grid").innerHTML = Object.entries(names).map(([key,label]) => {
      const station = Object.keys(data.stations).find(name => data.stations[name][0] === key);
      const hourly = rate(state.stations[station] || 0);
      return '<article class="op-resource' + (hourly ? ' producing' : '') + '" data-resource="' + key + '">' +
        '<div class="op-resource-top"><pre class="op-resource-art" aria-hidden="true">' + glyphArt[key].join("\n") + '</pre>' +
        '<div class="op-resource-value"><span>' + symbols[key] + ' ' + label + '</span><b><span class="op-number">' + number(state.resources[key]) + '</span><small class="op-decimal">.00</small></b>' +
        '<small class="op-rate">' + (hourly ? '+' + hourly.toFixed(1) + '/H LIVE' : 'INACTIVE') + '</small></div></div>' +
        '<div class="op-progress" role="progressbar" aria-label="' + label + ' progress to next unit" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i class="op-progress-fill"></i></div>' +
        '<small class="op-next">' + (hourly ? 'PRODUCING' : 'BUILD TO START') + '</small></article>';
    }).join("");
    $o(".op-stations").innerHTML = Object.entries(data.stations).map(([key,[resource,base]]) => {
      const level = state.stations[key] || 0, cost = Object.fromEntries(Object.entries(base).map(([r,n]) => [r,n * (level + 1)]));
      return `<article class="op-card"><div><b>${symbols[resource]} ${stationNames[key]}</b><small>LEVEL ${level}/5 · ${level ? (level * (2 + .4 * level)).toFixed(1) + "/H" : "INACTIVE"} ${names[resource]}</small></div><button data-upgrade="${key}" ${level >= 5 || !affordable(cost) || busy ? "disabled" : ""}>${level >= 5 ? "MAXED" : level ? "UPGRADE" : "BUILD"}</button><p>${level >= 5 ? "Fully upgraded" : costText(cost)}</p></article>`;
    }).join("");
    let expedition = "";
    if (active) {
      const route = data.routes[active.route], ready = active.ready <= data.now;
      expedition = `<article class="op-story"><small>${route.title} · PART ${active.step + 1}/2</small>${ready ? `<p>${clean(data.scene.text)}</p><div class="op-choices">${data.scene.choices.map((choice,i) => `<button data-choice="${i}" ${!affordable(choice.cost) || busy ? "disabled" : ""}>${clean(choice.label)}<small>${clean(costText(choice.cost))}</small></button>`).join("")}</div>` : `<p>Your team is following the trail. Check back in <b class="op-countdown">${Math.max(1,Math.ceil((active.ready - data.now)/60))}</b>.</p>`}</article>`;
    } else expedition = Object.entries(data.routes).map(([key,route]) => `<article class="op-story"><small>${clean(route.title)} ${state.completed.includes(key) ? "· COMPLETE" : ""}</small><p>${clean(route.intro)}</p><button data-launch="${key}" ${state.completed.includes(key) || !affordable(route.cost) || busy ? "disabled" : ""}>${state.completed.includes(key) ? "STORY COMPLETE" : "SEND EXPEDITION"}</button><small>${clean(costText(route.cost))} · ${route.minutes} MIN</small></article>`).join("");
    $o(".op-expeditions").innerHTML = expedition;
    $o(".op-log-lines").innerHTML = state.log.map(line => `<p>› ${clean(line)}</p>`).join("");
    tickLive(); art.draw();
  }
  async function refresh(action) {
    if (busy) return;
    busy = true;
    let succeeded = false;
    try {
      const response = await fetch("/api/outpost", action ? {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(action)} : undefined);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Outpost is unavailable.");
      data = result; anchor = performance.now();
      succeeded = true;
      $o(".op-summary").classList.remove("op-error");
    } catch (error) {
      $o(".op-summary").textContent = error.message;
      $o(".op-summary").classList.add("op-error"); Sound.error();
    } finally {
      busy = false;
      if (succeeded) {
        render();
        if (action) {
          (action.type === "choose" || action.type === "upgrade" ? Sound.complete : Sound.click)();
          if (action.type === "upgrade") {
            art.celebrate(action.station);
            $o('[data-upgrade="' + action.station + '"]')?.closest(".op-card")?.classList.add("op-upgraded");
            const resource = data.stations[action.station][0];
            $o('[data-resource="' + resource + '"]')?.classList.add("op-upgraded");
          }
        }
      }
    }
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
  setInterval(tickLive, 250);
  window.closeOutpost = close;
})();
