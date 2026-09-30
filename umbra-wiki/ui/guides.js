// Umbra Wiki tab guides: the first time a screen or a tab opens, a small
// framed note in its corner says what it's for and how to use it, once.
// "Show tab guides again" in Settings brings them all back.
"use strict";

window.UmbraGuide = (() => {
  const G = {
    maps: ["MAPS", ["Drag to move, scroll to zoom; click a country's name for its file.", "Right-click anywhere for waypoints, measuring, coordinates and range rings.", "The download button (top right) gets detailed maps that work offline."]],
    farming: ["FARMING", ["Choose edible crops or livestock from the Field Book and set area or animal count.", "The yearly food, seed, feed and work estimates update as you edit. Your plan saves locally and joins Umbra backups.", "Catalog numbers are starting estimates; check local growing conditions and adjust them." ]],
    core: ["CORE", ["Every system's condition at a glance, and what to do when one isn't right.", "Download, switch or remove AI models here. A download keeps your current model answering; compatible computers can add an optional second opinion."]],
    "lo-locker": ["LOCKER", ["Rewards for your achievements: orbs for the start screen, titles and name effects.", "Earn points to rank up; ranks and certain achievements unlock more. Click one to equip it."]],
    radar: ["SIGNALS & RADAR", ["The Wi-Fi and Bluetooth signals around you: nearer the centre means stronger.", "Click a blip or a row for its details. DEVICES remembers what the radar has heard and marks new ones.", "The KILL SWITCH turns all radios off at once. F for full screen."]],
    library: ["LIBRARY", ["The offline collections Umbra reads from, and its built-in Field Manual.", "Download more here; downloads can be paused and go on after a restart."]],
    history: ["HISTORY", ["Every conversation, saved on this computer. Ctrl+Shift+H searches all saved chats; Ctrl+F searches only the open chat.", "Make folders with a brief Umbra keeps in mind; drag conversations onto them, or pin them."]],
    settings: ["SETTINGS", ["Six coloured groups: jump with the chips, or type in the search box (Ctrl+F).", "Your data lists your downloaded maps and waypoints, with backups and restore."]],
    themes: ["THEMES", ["Click a theme to try it at once. Each has its own character.", "Make your own at the bottom, or follow your Omarchy theme."]],
    "lo-profile": ["PROFILE", ["What Umbra should know about you: it fits every answer to it.", "Health details go on your ID card and are never suggested against. Save when you're done."]],
    "lo-achievements": ["ACHIEVEMENTS", ["Badges for learning and preparing. Pin up to five to your profile.", "Earned ones are kept for good and included in backups."]],
    "lo-scenario": ["SCENARIO", ["The situation you're in: it changes what Umbra focuses on and how urgent it is.", "Deploy one, or write your own."]],
    "lo-personality": ["PERSONALITY", ["Who Umbra is when it talks to you. The facts never change, only the voice.", "Deploy one, or create your own."]],
    "fk-medic": ["MEDIC", ["Five pages: LIFE SUPPORT (CPR, timers, pulse), ASSESS, CALCULATE, PATIENT and GUIDES.", "In an emergency, call for help first. The timers keep running when you close the kit."]],
    "fk-sky": ["SUN & MOON", ["A live Earth with the real Sun and Moon; TIME-LAPSE runs a day in seconds.", "Below: daylight, last light and the moon for the map centre, a waypoint or any place."]],
    "fk-supplies": ["SUPPLIES", ["Who you look after and what you have stored: see how long water and food last.", "Add best-before dates: they show in the Calendar."]],
    "fk-calendar": ["CALENDAR", ["Click a day to add a reminder with a colour, an importance and a repeat.", "Umbra adds when your water and food run out, best-before dates, timers and the moon. Reminders ring while Umbra is open."]],
    "fk-vault": ["VAULT", ["Your arsenal and valuables, behind your lock password (set one in your Profile).", "Pick items from the library for an inspect view; the rounds on hand are matched to each weapon."]],
    "fk-training": ["TRAINING", ["Pick a drill along the top: Morse, radio, grid references, compass, SALUTE and more.", "MANUALS downloads real field manuals to read. Drills keep your points and best streak."]],
    "fk-cards": ["CARDS", ["Choose what goes on the cards; the sketch shows the first page.", "They're saved as a page to print, four to a sheet, to keep in your kit."]],
  };
  const seenKey = "umbra-guides-seen";
  const seen = () => { try { return JSON.parse(localStorage.getItem(seenKey) || "{}"); } catch { return {}; } };
  let current = null;

  function show(key, host) {
    if (!G[key] || seen()[key] || document.body.classList.contains("touring") || document.body.classList.contains("booting")) return;
    if (current && current.isConnected) current.remove();
    const [title, lines] = G[key];
    const el = document.createElement("div");
    el.className = "tabguide";
    el.innerHTML = `<div class="tg-head"><span>◆ ${title} · FIRST LOOK</span></div><ul>${lines.map((l) => `<li></li>`).join("")}</ul>
      <div class="tg-foot"><button type="button" class="tour-skipline tg-none">hide all first-look notes</button><button class="solid tg-ok">GOT IT</button></div>`;
    el.querySelectorAll("li").forEach((li, i) => (li.textContent = lines[i]));
    host.appendChild(el);
    current = el;
    Sound.glitch();
    const done = () => {
      const s = seen(); s[key] = 1;
      try { localStorage.setItem(seenKey, JSON.stringify(s)); } catch {}
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 250);
      Sound.click();
    };
    el.querySelector(".tg-ok").addEventListener("click", done);
    // Never show another one (Settings → Help & updates brings them back).
    el.querySelector(".tg-none").addEventListener("click", () => {
      const s = seen(); Object.keys(G).forEach((k) => (s[k] = 1));
      try { localStorage.setItem(seenKey, JSON.stringify(s)); } catch {}
      done();
    });
  }

  // Watches which screen and tab are open.
  let last = "";
  setInterval(() => {
    if (document.body.classList.contains("touring")) return;
    const vis = (sel) => { const e = document.querySelector(sel); return e && !e.hidden ? e : null; };
    let key = "", host = null, e;
    if ((e = vis("#maps"))) { key = "maps"; host = e.querySelector(".mp-body"); }
    else if ((e = vis("#farming"))) { key = "farming"; host = e; }
    else if ((e = vis("#radar"))) { key = "radar"; host = e.querySelector(".rd-center"); }
    else if ((e = vis("#core"))) { key = "core"; host = e; }
    else if ((e = vis("#fieldkit"))) { const t = e.querySelector(".lo-tabs button.on"); key = t ? "fk-" + t.dataset.tab : ""; host = e; }
    else if ((e = vis("#loadout"))) { const t = e.querySelector(".lo-tabs button.on"); key = t ? "lo-" + t.dataset.tab : ""; host = e; }
    else if ((e = vis("#settings"))) { key = "settings"; host = e; }
    else if ((e = vis("#history"))) { key = "history"; host = e; }
    else if ((e = vis("#library"))) { key = "library"; host = e; }
    else if ((e = vis("#themes"))) { key = "themes"; host = e; }
    if (key !== last) {
      last = key;
      if (current && current.isConnected && !host?.contains(current)) current.remove();
      if (key && host) setTimeout(() => { if (last === key) show(key, host); }, 700);
    }
  }, 500);

  return { reset: () => { try { localStorage.removeItem(seenKey); } catch {} }, GUIDES: G };
})();
