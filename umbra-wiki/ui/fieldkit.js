// Umbra Wiki field kit: the tools that can matter between life and death,
// all offline. MEDIC (a CPR metronome, first-aid timers, a pulse and
// breathing counter), SUN & MOON (daylight, twilight, moon phase and rise
// and set for any place, computed here), SUPPLIES (how long water and food
// last for your household), TRAINING (Morse by ear and by hand, a signal
// lamp, daily drills, knots) and CARDS (printable pocket cards).
// Loaded after app.js and uses its helpers ($, Sound, escapeHtml, locked,
// confirmDialog, exportTo, loadManual, openManual).
"use strict";

(() => {
  const I = {   // icons (JetBrains Mono Nerd Font)
    kit: "\u{F06EF}", heart: "\u{F05F6}", timer: "\u{F051B}", sun: "\u{F0599}", moon: "\u{F0F65}", box: "\u{F03D6}",
    school: "\u{F0474}", card: "\u{F0B78}", play: "\u{F040A}", stop: "\u{F04DB}", bell: "\u{F009E}", water: "\u{F058C}",
    food: "\u{F025B}", morse: "\u{F0003}", lamp: "\u{F0244}", rise: "\u{F059C}", set: "\u{F059B}", compass: "\u{F018B}",
    clock: "\u{F0150}", plus: "\u{F0415}", minus: "\u{F0374}", del: "\u{F01B4}", print: "\u{F042A}", check: "\u{F012C}",
    close: "\u{F0156}", adult: "\u{F064D}", child: "\u{F02E7}", baby: "\u{F0E7D}", elder: "\u{F1581}", dog: "\u{F0A43}",
    cat: "\u{F011B}", thermo: "\u{F050F}", run: "\u{F070E}", bandage: "\u{F0DAF}", lungs: "\u{F1084}", brain: "\u{F09D1}",
    help: "\u{F0625}", alarm: "\u{F0020}", bolt: "\u{F140B}", knot: "\u{F0339}", pin: "\u{F034E}", night: "\u{F0594}",
    fire: "\u{F0238}", hand: "\u{F0E46}", hospital: "\u{F02E0}",
  };
  const TABS = [["medic", "MEDIC"], ["sky", "SUN & MOON"], ["supplies", "SUPPLIES"], ["calendar", "CALENDAR"], ["vault", "VAULT"], ["training", "TRAINING"], ["cards", "CARDS"]];
  let tab = "medic";
  const store = {
    get(k, d) { try { const v = localStorage.getItem("umbra-fk-" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("umbra-fk-" + k, JSON.stringify(v)); } catch {} },
  };
  const pad = (n) => String(n).padStart(2, "0");
  const mmss = (s) => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
  const hhmm = (d) => (d && !isNaN(d) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : "—");

  // ----------------------------------------------------------- sound

  // Precise beeps from the page's own audio clock (the metronome and Morse
  // need exact timing). Follows Umbra's volume; has its own on/off.
  let ac = null;
  function audio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } }
    if (ac && ac.state === "suspended") ac.resume();
    return ac;
  }
  function tone(freq, start, dur, gain = 0.5) {
    const c = audio();
    if (!c) return;
    const vol = (window.prefs && window.prefs.volume != null ? window.prefs.volume : 0.9) * gain;
    const o = c.createOscillator(), g = c.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.004);
    g.gain.setValueAtTime(vol, start + Math.max(0.005, dur - 0.006));
    g.gain.linearRampToValueAtTime(0, start + dur);
    o.connect(g).connect(c.destination);
    o.start(start); o.stop(start + dur + 0.02);
  }

  // ------------------------------------------------------------ panel

  function build() {
    const el = document.createElement("div");
    el.id = "fieldkit";
    el.className = "loadout fk";
    el.hidden = true;
    el.innerHTML = `<div class="lo-head"><span class="lo-title"><span class="spin" data-spin>✻</span> FIELD KIT</span>
      <div class="lo-tabs">${TABS.map(([id, name]) => `<button data-tab="${id}">${name}</button>`).join("")}</div>
      <button class="ghost fk-close" title="Close (Esc)">CLOSE ✕</button></div>
      <div class="fk-body"></div>
      <div class="fk-tip"><span class="g">${I.help}</span><span class="fk-tip-text"></span></div>`;
    document.body.appendChild(el);
    el.querySelector(".fk-close").addEventListener("click", () => toggle(false));
    el.querySelectorAll(".lo-tabs button").forEach((b) => b.addEventListener("click", () => { if (tab !== b.dataset.tab) { tab = b.dataset.tab; Sound.click(); render(); } }));
  }
  function render() {
    const el = $("#fieldkit");
    el.querySelectorAll(".lo-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    const body = el.querySelector(".fk-body");
    body.scrollTop = 0;
    ({ medic: medic, sky: sky, supplies: supplies, calendar: (b) => (window.UmbraCalendar ? UmbraCalendar.render(b) : null), vault: (b) => (window.UmbraVault ? UmbraVault.render(b) : null), training: training, cards: cards })[tab](body);
    tip();
  }
  const TIPS = {
    medic: ["Call emergency services first (112, 911 or 999) and put the phone on speaker; then start CPR.",
            "Push hard and fast in the centre of the chest; let it come all the way back up between pushes.",
            "Write the time on a tourniquet (or the skin) as soon as it's on. The timer keeps it for you too.",
            "Tap along with each heartbeat on the pulse counter: 5 or 6 taps are enough for a rate."],
    sky: ["Last light is when you can still see without a torch: plan to be at camp before it.",
          "At solar noon the sun is due south in the northern hemisphere (north in the southern).",
          "A full moon rises around sunset; a new moon gives the darkest nights."],
    supplies: ["The usual rule is 3.8 litres (a gallon) of water per person per day, double in hot weather.",
               "Keep at least 3 days of water and food; two weeks is a strong reserve.",
               "Don't ration water: drink what you need, and cut sweat instead (rest, shade)."],
    calendar: ["Click a day to add a reminder: pick a colour, how important it is, and whether it repeats.",
               "Water, food, best-before dates, running first-aid timers and the moon are added by Umbra itself.",
               "Reminders ring at their time while Umbra is open; all-day ones at 09:00."],
    vault: ["Store firearms unloaded and locked, and ammunition separately, cool and dry.",
            "Sealed ammunition kept cool and dry lasts for decades; rotate the oldest first.",
            "Treat every firearm as loaded; never point it at anything you don't intend to shoot."],
    training: ["SOS is ··· ——— ···: three short, three long, three short, sent as one word.",
               "Learn Morse by sound, not by counting dots: listen to whole letters.",
               "The signal lamp turns this screen into a flashing light for SOS at night."],
    cards: ["Print the cards, cut them out and keep them in a zip bag in your kit.",
            "Add emergency contacts and medical notes: a phone battery won't always be there."],
  };
  function tip() {
    const list = TIPS[tab] || [];
    $("#fieldkit .fk-tip-text").textContent = list[Math.floor(Math.random() * list.length)] || "";
  }

  // =========================================================== MEDIC

  const CPR = {
    adult: { name: "ADULT", depth: "5 to 6 cm (2 to 2.4 in), both hands, heel of the hand on the centre of the chest", breaths: 2 },
    child: { name: "CHILD", depth: "About 5 cm (2 in), a third of the chest; one or two hands", breaths: 2 },
    infant: { name: "INFANT", depth: "About 4 cm (1.5 in), a third of the chest; two fingers just below the nipple line", breaths: 2 },
  };
  const cpr = { on: false, mode: store.get("cpr-mode", "adult"), handsOnly: store.get("cpr-hands", false), sound: store.get("cpr-sound", true),
                count: 0, cycles: 0, start: 0, next: 0, breathing: 0, timer: 0, minutes: 0 };
  const BPM = 110;

  // MEDIC has pages: life support (here), and assess, calculate, patient
  // and guides (medic.js).
  const MSUBS = [["life", "LIFE SUPPORT", "heart"], ["assess", "ASSESS", "brain"], ["calculate", "CALCULATE", "thermo"],
                 ["patient", "PATIENT", "hand"], ["guides", "GUIDES", "bandage"]];
  let msub = store.get("msub", "life");
  function medic(body) {
    if (!window.UmbraMedic) msub = "life";
    body.innerHTML = `<div class="fk-subnav">${MSUBS.map(([id, name, icon]) => `<button data-s="${id}" class="${id === msub ? "on" : ""}"><span class="g">${I[icon]}</span>${name}</button>`).join("")}</div><div class="fk-msub"></div>`;
    body.querySelectorAll(".fk-subnav button").forEach((b) => b.addEventListener("click", () => {
      if (msub === b.dataset.s) return;
      msub = b.dataset.s; store.set("msub", msub); Sound.click(); medic(body);
    }));
    const inner = body.querySelector(".fk-msub");
    if (msub !== "life") { window.UmbraMedic[msub](inner); return; }
    lifeSupport(inner);
  }
  function lifeSupport(body) {
    body.innerHTML = `<div class="fk-grid">
      <section class="fk-card fk-cpr">
        <div class="fk-h"><span class="g">${I.heart}</span> CPR METRONOME</div>
        <div class="fk-seg pf-choice">${Object.entries(CPR).map(([k, v]) => `<button data-m="${k}">${v.name}</button>`).join("")}</div>
        <div class="fk-beat"><div class="fk-ring"></div><div class="fk-count">${I.play}</div><div class="fk-sub">110 / MIN</div></div>
        <p class="fk-cue"></p>
        <div class="fk-row"><button class="solid fk-cpr-go">${I.play} START</button>
          <label class="fk-check"><input type="checkbox" class="fk-hands"> Hands-only (no breaths)</label>
          <label class="fk-check"><input type="checkbox" class="fk-snd"> Beep</label></div>
        <div class="fk-stats"><span><small>TIME</small><b class="fk-cpr-time">0:00</b></span><span><small>CYCLES</small><b class="fk-cpr-cycles">0</b></span>
          <span><small>NEXT CHECK</small><b class="fk-cpr-switch">2:00</b></span></div>
        <p class="fk-warn">Not breathing normally? Call emergency services, then start at once. Every 2 minutes, swap with a helper if there is one.
          Keep going until help takes over or the person breathes normally.</p>
      </section>
      <section class="fk-card">
        <div class="fk-h"><span class="g">${I.timer}</span> FIRST-AID TIMERS</div>
        <div class="fk-presets">${TIMERS.map((t) => `<button class="ghost" data-t="${t.id}" title="${escapeHtml(t.help)}"><span class="g">${I[t.icon]}</span> ${t.name}</button>`).join("")}
          <span class="fk-custom"><input type="number" min="1" max="600" value="15" class="fk-min"><button class="ghost fk-custom-go">+ MINUTES</button></span></div>
        <div class="fk-timers"></div>
      </section>
      <section class="fk-card">
        <div class="fk-h"><span class="g">${I.lungs}</span> PULSE & BREATHING</div>
        <div class="fk-seg pf-choice fk-pmode"><button data-p="pulse">PULSE</button><button data-p="breath">BREATHING</button></div>
        <button class="fk-tap">TAP WITH EACH ${"BEAT"}</button>
        <div class="fk-rate"><b>—</b><small>PER MINUTE</small></div>
        <table class="fk-ranges"></table>
        <div class="fk-links">${[["bleeding", "Bleeding"], ["cpr", "CPR"], ["choking", "Choking"], ["burns", "Burns"], ["shock", "Shock"], ["hypothermia", "Hypothermia"]]
          .map(([id, n]) => `<button class="ghost" data-page="${id}">${I.bandage} ${n}</button>`).join("")}</div>
      </section></div>`;
    const q = (s) => body.querySelector(s);
    const showMode = () => body.querySelectorAll(".fk-cpr .fk-seg button").forEach((b) => b.classList.toggle("on", b.dataset.m === cpr.mode));
    body.querySelectorAll(".fk-cpr .fk-seg button").forEach((b) => b.addEventListener("click", () => { cpr.mode = b.dataset.m; store.set("cpr-mode", cpr.mode); showMode(); cprCue(); Sound.click(); }));
    showMode();
    q(".fk-hands").checked = cpr.handsOnly;
    q(".fk-hands").addEventListener("change", (e) => { cpr.handsOnly = e.target.checked; store.set("cpr-hands", cpr.handsOnly); cprCue(); });
    q(".fk-snd").checked = cpr.sound;
    q(".fk-snd").addEventListener("change", (e) => { cpr.sound = e.target.checked; store.set("cpr-sound", cpr.sound); });
    q(".fk-cpr-go").addEventListener("click", () => (cpr.on ? cprStop() : cprStart()));
    cprCue(); cprShow();
    body.querySelectorAll(".fk-presets [data-t]").forEach((b) => b.addEventListener("click", () => startTimer(TIMERS.find((t) => t.id === b.dataset.t))));
    q(".fk-custom-go").addEventListener("click", () => {
      const m = Math.max(1, Math.min(600, +q(".fk-min").value || 15));
      startTimer({ id: "custom", name: `${m} MINUTES`, icon: "alarm", down: m * 60, help: "" });
    });
    renderTimers();
    setupPulse(body);
    body.querySelectorAll(".fk-links [data-page]").forEach((b) => b.addEventListener("click", async () => {
      const pages = await loadManual();
      const page = pages.find((p) => p.id === b.dataset.page) || pages.find((p) => p.id.includes(b.dataset.page) || p.title.toLowerCase().includes(b.dataset.page));
      if (page) { toggle(false, true); openedFrom(() => toggle(true)); openManual(page.id); } else Sound.error();
    }));
  }
  function cprCue(text) {
    const cue = $("#fieldkit .fk-cue");
    if (!cue) return;
    cue.textContent = text || (cpr.handsOnly ? "Push hard and fast, without stopping. " : "30 compressions, then 2 rescue breaths. ") + CPR[cpr.mode].depth + ".";
  }
  function cprStart() {
    audio();
    Object.assign(cpr, { on: true, count: 0, cycles: 0, start: performance.now(), breathing: 0, minutes: 0 });
    cpr.next = ac ? ac.currentTime + 0.15 : 0;
    cpr.lastBeat = performance.now();
    clearInterval(cpr.timer);
    cpr.timer = setInterval(cprTick, 25);
    cprShow();
    Sound.click();
  }
  function cprStop() {
    cpr.on = false;
    clearInterval(cpr.timer);
    cprShow(); cprCue();
    Sound.click();
  }
  // The beat is scheduled on the audio clock a little ahead, so it never
  // drifts; the screen follows it.
  function cprTick() {
    const now = performance.now();
    const secs = (now - cpr.start) / 1000;
    if (Math.floor(secs / 60) > cpr.minutes) { cpr.minutes = Math.floor(secs / 60); if (window.track) track("cprMinutes"); }
    if (cpr.breathing) {
      if (now >= cpr.breathing) { cpr.breathing = 0; cpr.count = 0; cpr.lastBeat = now; if (ac) cpr.next = ac.currentTime + 0.1; cprCue(); }
      cprShow(secs);
      return;
    }
    const interval = 60 / BPM;
    const due = ac ? ac.currentTime + 0.05 >= cpr.next : now - cpr.lastBeat >= interval * 1000;
    if (!due) { cprShow(secs); return; }
    cpr.count++;
    cpr.lastBeat = now;
    if (cpr.sound && ac) tone(cpr.count === 1 ? 1320 : 990, cpr.next, 0.05, cpr.count === 1 ? 0.6 : 0.45);
    if (ac) cpr.next += interval;
    const ring = $("#fieldkit .fk-ring");
    if (ring) { ring.classList.remove("beat"); void ring.offsetWidth; ring.classList.add("beat"); }
    if (!cpr.handsOnly && cpr.count >= 30) {
      cpr.cycles++;
      // Two breaths, about a second each, then back to compressions.
      cpr.breathing = now + 5000;
      cprCue("2 RESCUE BREATHS: tilt the head back, lift the chin, seal and blow for about a second each; watch the chest rise.");
      if (cpr.sound && ac) { const t = ac.currentTime + 0.35; tone(660, t, 0.9, 0.35); tone(660, t + 2.2, 0.9, 0.35); }
    } else if (cpr.handsOnly && cpr.count % 30 === 0) cpr.cycles++;
    cprShow(secs);
  }
  function cprShow(secs = 0) {
    const el = $("#fieldkit .fk-cpr");
    if (!el) return;
    el.classList.toggle("running", cpr.on);
    el.classList.toggle("breaths", !!cpr.breathing);
    el.querySelector(".fk-count").textContent = cpr.on ? (cpr.breathing ? "BREATHE" : String(cpr.count || "")) : I.play;
    el.querySelector(".fk-cpr-go").innerHTML = cpr.on ? `${I.stop} STOP` : `${I.play} START`;
    el.querySelector(".fk-cpr-time").textContent = mmss(secs);
    el.querySelector(".fk-cpr-cycles").textContent = cpr.cycles;
    const left = 120 - (secs % 120);
    el.querySelector(".fk-cpr-switch").textContent = mmss(left);
    el.querySelector(".fk-cpr-switch").classList.toggle("due", cpr.on && secs >= 115 && left > 115);   // just after each 2 minutes
  }

  // First-aid timers: they keep running with the panel closed (even across a
  // restart) and ring when they're due.
  const TIMERS = [
    { id: "tourniquet", name: "TOURNIQUET", icon: "bandage", up: true, alarm: 7200, help: "Counts up from when it went on. Write the time on it. Don't loosen it yourself; get medical help. Rings at 2 hours." },
    { id: "pressure", name: "DIRECT PRESSURE", icon: "hand", down: 600, help: "10 minutes of firm pressure on a bleeding wound, without lifting to look." },
    { id: "burn", name: "COOL A BURN", icon: "water", down: 1200, help: "20 minutes under cool running water (not ice). Remove rings and tight clothing early." },
    { id: "seizure", name: "SEIZURE", icon: "brain", up: true, alarm: 300, help: "Time it from the start. Call emergency services if it lasts over 5 minutes (rings then)." },
    { id: "recheck", name: "RECHECK", icon: "heart", down: 900, help: "Check breathing, pulse and temperature again in 15 minutes." },
  ];
  let running = store.get("timers", []);
  function startTimer(t) {
    running.push({ id: Math.random().toString(36).slice(2, 8), kind: t.id, name: t.name, icon: t.icon, up: !!t.up,
                   secs: t.up ? t.alarm : t.down, help: t.help, at: Date.now(), rang: false });
    store.set("timers", running);
    if (window.track) track("timers");
    audio(); Sound.click();
    renderTimers();
    ensureTick();
  }
  function renderTimers() {
    const box = $("#fieldkit .fk-timers");
    if (!box) return;
    box.innerHTML = running.length ? running.map((r) => `<div class="fk-timer ${r.rang ? "rang" : ""}" data-id="${r.id}">
        <span class="g">${I[r.icon] || I.alarm}</span><span class="fk-tn"><b>${escapeHtml(r.name)}</b><small>Started ${hhmm(new Date(r.at))}${r.help ? " · " + escapeHtml(r.help) : ""}</small></span>
        <span class="fk-tv">0:00</span><button class="ghost fk-tx" title="Remove">✕</button></div>`).join("")
      : `<p class="lib-note">Start a timer above. It keeps running when you close the kit, and rings when it's due.</p>`;
    box.querySelectorAll(".fk-tx").forEach((b) => b.addEventListener("click", () => {
      running = running.filter((r) => r.id !== b.closest(".fk-timer").dataset.id);
      store.set("timers", running); renderTimers(); Sound.click();
    }));
    tickTimers();
  }
  let tickHandle = 0;
  function ensureTick() { if (!tickHandle && running.length) tickHandle = setInterval(tickTimers, 250); }
  function tickTimers() {
    if (!running.length) { clearInterval(tickHandle); tickHandle = 0; return; }
    for (const r of running) {
      const el = (s) => document.querySelector(`#fieldkit .fk-timer[data-id="${r.id}"] ${s}`);
      const passed = (Date.now() - r.at) / 1000;
      const show = r.up ? passed : Math.max(0, r.secs - passed);
      const v = el(".fk-tv");
      if (v) v.textContent = show >= 3600 ? `${Math.floor(show / 3600)}:${pad(Math.floor((show % 3600) / 60))}:${pad(Math.floor(show % 60))}` : mmss(show);
      if (!r.rang && passed >= r.secs) {
        r.rang = true;
        store.set("timers", running);
        ring(r);
        document.querySelector(`#fieldkit .fk-timer[data-id="${r.id}"]`)?.classList.add("rang");
      }
    }
  }
  function ring(r) {
    const c = audio();
    if (c) for (let i = 0; i < 6; i++) tone(i % 2 ? 1175 : 880, c.currentTime + 0.1 + i * 0.28, 0.2, 0.6);
    else Sound.error();
    // A banner wherever you are in Umbra.
    const b = document.createElement("div");
    b.className = "fk-alarm";
    b.innerHTML = `<span class="g">${I.alarm}</span><span><b></b><small></small></span><button class="solid">OK</button>`;
    b.querySelector("b").textContent = r.kind === "seizure" ? "SEIZURE: 5 MINUTES" : r.kind === "tourniquet" ? "TOURNIQUET: 2 HOURS" : `${r.name} DONE`;
    b.querySelector("small").textContent = r.kind === "seizure" ? "Call emergency services now if it hasn't stopped."
      : r.kind === "tourniquet" ? `On since ${hhmm(new Date(r.at))}. Get medical help; don't loosen it yourself.` : r.help;
    b.querySelector("button").addEventListener("click", () => b.remove());
    document.body.appendChild(b);
    setTimeout(() => b.remove(), 30000);
  }

  // Tap along with the pulse or the breaths; the rate comes from the gaps.
  function setupPulse(body) {
    let mode = "pulse", taps = [], fastSince = 0, fastLast = 0, speedAwarded = false;
    const RANGES = {
      pulse: [["Adult", "60–100"], ["Child 1–10", "70–120"], ["Infant", "100–160"], ["Very fit adult at rest", "40–60"]],
      breath: [["Adult", "12–20"], ["Child 1–10", "20–30"], ["Infant", "30–60"]],
    };
    const show = () => {
      body.querySelectorAll(".fk-pmode button").forEach((b) => b.classList.toggle("on", b.dataset.p === mode));
      body.querySelector(".fk-tap").textContent = mode === "pulse" ? "TAP WITH EACH BEAT" : "TAP WITH EACH BREATH IN";
      body.querySelector(".fk-ranges").innerHTML = RANGES[mode].map(([w, r]) => `<tr><td>${w}</td><td>${r}</td></tr>`).join("");
    };
    body.querySelectorAll(".fk-pmode button").forEach((b) => b.addEventListener("click", () => { mode = b.dataset.p; taps = []; fastSince = fastLast = 0; body.querySelector(".fk-rate b").textContent = "—"; show(); Sound.click(); }));
    body.querySelector(".fk-tap").addEventListener("pointerdown", () => {
      const now = performance.now();
      if (taps.length && now - taps[taps.length - 1] > (mode === "pulse" ? 3000 : 12000)) taps = [];
      taps.push(now);
      if (taps.length > 12) taps.shift();
      const gaps = taps.slice(1).map((t, i) => t - taps[i]).sort((a, b) => a - b);
      const rate = gaps.length >= (mode === "pulse" ? 4 : 2) ? Math.round(60000 / gaps[Math.floor(gaps.length / 2)]) : 0;
      body.querySelector(".fk-rate b").textContent = rate || "…";
      if (mode === "pulse" && rate >= 480 && rate <= 520 && (!fastLast || now - fastLast <= 180)) {
        if (!fastSince) fastSince = now;
        fastLast = now;
        if (!speedAwarded && now - fastSince >= 10000) { speedAwarded = true; if (window.track) track("pulse500"); }
      } else { fastSince = fastLast = 0; }
      Sound.key();
    });
    show();
  }

  // ======================================================= SUN & MOON

  // The standard almanac formulas (sun and moon positions from the date),
  // worked out here: nothing goes online.
  const rad = Math.PI / 180, dayMs = 864e5, J1970 = 2440588, J2000 = 2451545, OBL = rad * 23.4397;
  const toDays = (d) => d.valueOf() / dayMs - 0.5 + J1970 - J2000;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const ra = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBL) - Math.tan(b) * Math.sin(OBL), Math.cos(l));
  const dec = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBL) + Math.cos(b) * Math.sin(OBL) * Math.sin(l));
  const azimuth = (H, phi, d) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(d) * Math.cos(phi));
  const altitude = (H, phi, d) => Math.asin(Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H));
  const sidereal = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
  const meanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  const eclLong = (M) => M + rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) + rad * 102.9372 + Math.PI;
  function sunCoords(d) { const L = eclLong(meanAnomaly(d)); return { dec: dec(L, 0), ra: ra(L, 0) }; }
  function sunPos(date, lat, lon) {
    const lw = rad * -lon, phi = rad * lat, d = toDays(date), c = sunCoords(d), H = sidereal(d, lw) - c.ra;
    return { az: azimuth(H, phi, c.dec), alt: altitude(H, phi, c.dec) };
  }
  function sunTimes(date, lat, lon) {
    const lw = rad * -lon, phi = rad * lat, d = toDays(date);
    const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
    const ds = 0.0009 + lw / (2 * Math.PI) + n;
    const M = meanAnomaly(ds), L = eclLong(M), dc = dec(L, 0);
    const transit = (x) => J2000 + x + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const noon = transit(ds);
    const at = (h) => {
      const w = Math.acos((Math.sin(h * rad) - Math.sin(phi) * Math.sin(dc)) / (Math.cos(phi) * Math.cos(dc)));
      if (isNaN(w)) return [null, null];
      const set = transit(0.0009 + (w + lw) / (2 * Math.PI) + n);
      return [fromJulian(noon - (set - noon)), fromJulian(set)];
    };
    const [rise, set] = at(-0.833), [dawn, dusk] = at(-6);
    const up = sunPos(fromJulian(noon), lat, lon).alt > 0;
    return { noon: fromJulian(noon), rise, set, dawn, dusk, polar: !rise ? (up ? "day" : "night") : "" };
  }
  function moonCoords(d) {
    const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F);
    return { ra: ra(l, b), dec: dec(l, b), dist: 385001 - 20905 * Math.cos(M) };
  }
  function moonAlt(date, lat, lon) {
    const lw = rad * -lon, phi = rad * lat, d = toDays(date), c = moonCoords(d);
    return altitude(sidereal(d, lw) - c.ra, phi, c.dec);
  }
  function moonLight(date) {
    const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sd = 149598000;
    const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
    const inc = Math.atan2(sd * Math.sin(phi), m.dist - sd * Math.cos(phi));
    const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
    return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI };
  }
  // Moonrise and moonset: when the moon crosses the horizon, found in
  // ten-minute steps over the day.
  function moonTimes(day, lat, lon) {
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const h0 = 0.133 * rad;
    let rise = null, set = null, prev = moonAlt(start, lat, lon) - h0;
    for (let i = 1; i <= 144; i++) {
      const t = new Date(start.getTime() + i * 600000), cur = moonAlt(t, lat, lon) - h0;
      if (prev < 0 && cur >= 0 && !rise) rise = new Date(t.getTime() - 600000 * (cur / (cur - prev)));
      if (prev >= 0 && cur < 0 && !set) set = new Date(t.getTime() - 600000 * (cur / (cur - prev)));
      prev = cur;
    }
    return { rise, set };
  }
  function nextPhase(from, target) {
    for (let h = 0; h < 24 * 31; h += 1) {
      const a = moonLight(new Date(from.getTime() + h * 3600000)).phase, b = moonLight(new Date(from.getTime() + (h + 1) * 3600000)).phase;
      if (target === 0 ? a > 0.9 && b < 0.1 : a < target && b >= target) return new Date(from.getTime() + (h + 1) * 3600000);
    }
    return null;
  }
  const PHASES = [[0.03, "New moon"], [0.22, "Waxing crescent"], [0.28, "First quarter"], [0.47, "Waxing gibbous"], [0.53, "Full moon"],
                  [0.72, "Waning gibbous"], [0.78, "Last quarter"], [0.97, "Waning crescent"], [1.01, "New moon"]];
  const compassPoint = (azRad) => {
    const deg = ((azRad / rad + 180) % 360 + 360) % 360;   // from north
    return `${Math.round(deg)}° ${["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"][Math.round(deg / 22.5) % 16]}`;
  };

  let skyPlace = null;
  async function sky(body) {
    const wps = await fetch("/api/waypoints").then((r) => r.json()).catch(() => []);
    let mapView = null;
    try { const v = JSON.parse(localStorage.getItem("umbra-maps") || "{}").view; if (v) mapView = { lat: (Math.atan(Math.sinh(Math.PI * (1 - 2 * v.y))) * 180) / Math.PI, lon: ((v.x * 360 + 360) % 360) - 180 }; } catch {}
    const saved = store.get("sky", null);
    if (!skyPlace) skyPlace = saved || (mapView ? { name: "Map centre", ...mapView } : { name: "Map centre", lat: 45.92, lon: 6.87 });
    const today = new Date();
    body.innerHTML = `<div class="fk-sky">
      <section class="fk-card fk-orrery"></section>
      <section class="fk-card fk-where">
        <div class="fk-h"><span class="g">${I.pin}</span> WHERE AND WHEN</div>
        <div class="fk-row"><select class="fk-place"><option value="map">Map centre${mapView ? ` (${mapView.lat.toFixed(2)}, ${mapView.lon.toFixed(2)})` : ""}</option>
          ${wps.map((w, i) => `<option value="w${i}">${escapeHtml(w.name)}</option>`).join("")}<option value="manual">Coordinates…</option></select>
          <input class="fk-lat" type="number" step="0.01" min="-89" max="89"><input class="fk-lon" type="number" step="0.01" min="-180" max="180">
          <input class="fk-date" type="date"></div>
      </section>
      <div class="fk-sky-out"></div></div>`;
    const q = (s) => body.querySelector(s);
    q(".fk-date").value = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    q(".fk-lat").value = skyPlace.lat.toFixed(3); q(".fk-lon").value = skyPlace.lon.toFixed(3);
    const pick = q(".fk-place");
    pick.value = saved && saved.src ? saved.src : "map";
    const apply = () => {
      const src = pick.value;
      if (src === "map" && mapView) skyPlace = { name: "Map centre", ...mapView, src };
      else if (src.startsWith("w")) { const w = wps[+src.slice(1)]; skyPlace = { name: w.name, lat: w.lat, lon: w.lon, src }; }
      else skyPlace = { name: "Coordinates", lat: +q(".fk-lat").value || 0, lon: +q(".fk-lon").value || 0, src: "manual" };
      q(".fk-lat").value = skyPlace.lat.toFixed(3); q(".fk-lon").value = skyPlace.lon.toFixed(3);
      store.set("sky", skyPlace);
      drawSky(q(".fk-sky-out"), new Date(q(".fk-date").value + "T12:00:00"));
    };
    pick.addEventListener("change", () => { apply(); Sound.click(); });
    for (const s of [".fk-lat", ".fk-lon"]) q(s).addEventListener("change", () => { pick.value = "manual"; apply(); });
    q(".fk-date").addEventListener("change", apply);
    apply();
    // The live Earth, Sun and Moon: now for today, midday for another date.
    if (window.UmbraOrrery) UmbraOrrery.start(q(".fk-orrery"), () => skyPlace, () => {
      const d = new Date(q(".fk-date").value + "T12:00:00");
      return isNaN(d) || d.toDateString() === new Date().toDateString() ? new Date() : d;
    });
    if (window.track) track("sunChecks");
  }
  function drawSky(out, day) {
    const { lat, lon } = skyPlace;
    const t = sunTimes(day, lat, lon), now = new Date();
    const isToday = day.toDateString() === now.toDateString();
    const len = t.rise && t.set ? (t.set - t.rise) / 1000 : t.polar === "day" ? 86400 : 0;
    const left = isToday && t.set && now < t.set ? (t.set - Math.max(now, t.rise)) / 1000 : 0;
    const lastLeft = isToday && t.dusk && now < t.dusk ? (t.dusk - now) / 1000 : 0;
    const ml = moonLight(isToday ? now : day), mt = moonTimes(day, lat, lon);
    const phaseName = PHASES.find(([p]) => ml.phase < p)[1];
    const fullAt = nextPhase(isToday ? now : day, 0.5), newAt = nextPhase(isToday ? now : day, 0);
    const riseAz = t.rise ? compassPoint(sunPos(t.rise, lat, lon).az) : "—", setAz = t.set ? compassPoint(sunPos(t.set, lat, lon).az) : "—";
    const hrs = (s) => `${Math.floor(s / 3600)} h ${pad(Math.floor((s % 3600) / 60))} min`;
    const date = (d) => (d ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) : "—");
    out.innerHTML = `
      <section class="fk-card"><div class="fk-h"><span class="g">${I.sun}</span> SUN · ${escapeHtml(skyPlace.name.toUpperCase())}</div>
        ${t.polar ? `<p class="lib-note">${t.polar === "day" ? "Midnight sun: the sun doesn't set on this day." : "Polar night: the sun doesn't rise on this day."}</p>` : ""}
        <canvas class="fk-daybar" width="900" height="70"></canvas>
        <div class="fk-times">
          <span><small>FIRST LIGHT</small><b>${hhmm(t.dawn)}</b></span>
          <span><small>SUNRISE</small><b>${hhmm(t.rise)}</b><em>${riseAz}</em></span>
          <span><small>SOLAR NOON</small><b>${hhmm(t.noon)}</b><em>${lat >= 0 ? "SUN DUE SOUTH" : "SUN DUE NORTH"}</em></span>
          <span><small>SUNSET</small><b>${hhmm(t.set)}</b><em>${setAz}</em></span>
          <span><small>LAST LIGHT</small><b>${hhmm(t.dusk)}</b></span>
          <span><small>DAYLIGHT</small><b>${len ? hrs(len) : "—"}</b></span>
        </div>
        ${isToday ? `<p class="fk-left">${left > 0 ? `<b>${hrs(left)}</b> of sunlight left today, and <b>${hrs(lastLeft)}</b> until last light.`
          : lastLeft > 0 ? `The sun has set: <b>${hrs(lastLeft)}</b> until last light.` : "It's dark now."}</p>` : ""}
      </section>
      <section class="fk-card fk-moon"><div class="fk-h"><span class="g">${I.moon}</span> MOON</div>
        <div class="fk-moon-row"><canvas class="fk-moonpic" width="160" height="160"></canvas>
          <div class="fk-times">
            <span><small>PHASE</small><b>${phaseName}</b><em>${Math.round(ml.fraction * 100)}% LIT</em></span>
            <span><small>MOONRISE</small><b>${hhmm(mt.rise)}</b></span>
            <span><small>MOONSET</small><b>${hhmm(mt.set)}</b></span>
            <span><small>NEXT FULL MOON</small><b>${date(fullAt)}</b></span>
            <span><small>NEXT NEW MOON</small><b>${date(newAt)}</b></span>
          </div></div>
        <p class="lib-note">${ml.fraction > 0.7 ? "A bright night: good for moving and working without a torch." : ml.fraction < 0.2 ? "A dark night: stars are easy to read, but plan your route by daylight." : "A partly lit night."}</p>
      </section>`;
    dayBar(out.querySelector(".fk-daybar"), day, t, isToday ? now : null);
    moonPic(out.querySelector(".fk-moonpic"), ml);
  }
  const cssv = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function dayBar(c, day, t, now) {
    const g = c.getContext("2d"), W = c.width, H = c.height;
    const start = new Date(day); start.setHours(0, 0, 0, 0);
    const x = (d) => d ? ((d - start) / dayMs) * W : null;
    g.fillStyle = cssv("--bg-3") || "#1e1e1e"; g.fillRect(0, 18, W, 30);
    if (t.dawn && t.dusk) { g.fillStyle = cssv("--net") || "#5fb8c9"; g.globalAlpha = 0.45; g.fillRect(x(t.dawn), 18, x(t.dusk) - x(t.dawn), 30); g.globalAlpha = 1; }
    if (t.rise && t.set) { g.fillStyle = cssv("--signal") || "#e8d27c"; g.fillRect(x(t.rise), 18, x(t.set) - x(t.rise), 30); }
    else if (t.polar === "day") { g.fillStyle = cssv("--signal") || "#e8d27c"; g.fillRect(0, 18, W, 30); }
    g.fillStyle = cssv("--dim") || "#999"; g.font = `11px ${cssv("--font")}`; g.textAlign = "center";
    for (let h = 0; h <= 24; h += 3) { g.fillRect((h / 24) * W - 0.5, 48, 1, 6); g.fillText(`${pad(h % 24)}:00`, Math.min(W - 18, Math.max(18, (h / 24) * W)), 66); }
    if (now) { const nx = x(now); g.fillStyle = cssv("--red") || "#e06a6a"; g.fillRect(nx - 1.5, 10, 3, 46); g.fillText("NOW", Math.min(W - 16, Math.max(16, nx)), 9); }
  }
  function moonPic(c, ml) {
    const g = c.getContext("2d"), r = 62, cx = 80, cy = 80;
    g.clearRect(0, 0, 160, 160);
    g.fillStyle = cssv("--bg-3") || "#222"; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    // The lit part: a half disc plus an ellipse whose width follows the phase.
    const p = ml.phase, waxing = p < 0.5, k = Math.cos(p * 2 * Math.PI);
    g.fillStyle = cssv("--fg-bright") || "#eee";
    g.beginPath();
    g.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, !waxing);
    g.ellipse(cx, cy, Math.abs(k) * r, r, 0, Math.PI / 2, -Math.PI / 2, (k > 0) === waxing);
    g.fill();
    g.strokeStyle = cssv("--signal") || "#e8d27c"; g.lineWidth = 1.5; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  }

  // ========================================================= SUPPLIES

  // Daily needs per person (water in litres, food in kcal), from common
  // preparedness guidance: about 3.8 L (a gallon) per person per day for
  // drinking and basic hygiene, doubled in hot weather; food by age.
  const PEOPLE = [
    ["adults", "Adults", "adult", 3.8, 2200], ["teens", "Teens 14–17", "adult", 3.8, 2400], ["children", "Children 4–13", "child", 3.0, 1700],
    ["toddlers", "Toddlers 1–3", "child", 2.0, 1100], ["infants", "Infants under 1", "baby", 1.2, 700], ["elderly", "Seniors 65+", "elder", 3.8, 1800],
    ["dogsSmall", "Small dogs", "dog", 0.6, 0], ["dogsLarge", "Large dogs", "dog", 1.8, 0], ["cats", "Cats", "cat", 0.3, 0],
  ];
  const FOODS = [   // [id, name, unit, kcal per unit, litres per unit]
    ["water_l", "Water", "litre", 0, 1], ["water_15", "Bottled water 1.5 L", "bottle", 0, 1.5], ["water_20", "Jerrycan 20 L", "can", 0, 20],
    ["rice", "Rice", "kg", 3600, 0], ["pasta", "Pasta", "kg", 3700, 0], ["oats", "Oats", "kg", 3800, 0], ["beans", "Dried beans or lentils", "kg", 3400, 0],
    ["flour", "Flour", "kg", 3640, 0], ["sugar", "Sugar", "kg", 3870, 0], ["honey", "Honey", "kg", 3040, 0], ["nuts", "Nuts", "kg", 6000, 0],
    ["pb", "Peanut butter 500 g", "jar", 2950, 0], ["canmeal", "Canned meal 400 g", "can", 400, 0], ["canveg", "Canned vegetables 400 g", "can", 150, 0],
    ["canfish", "Canned fish 125 g", "can", 250, 0], ["bar", "Energy bar", "bar", 250, 0], ["mre", "Ration pack (MRE)", "pack", 1250, 0],
    ["crackers", "Crackers 250 g", "pack", 1100, 0], ["milk", "Powdered milk", "kg", 5000, 0], ["choc", "Chocolate 100 g", "bar", 540, 0],
    ["custom", "Other food", "unit", 500, 0],
  ];
  let sup = null, saveTimer = 0;
  async function supplies(body) {
    if (!sup) sup = await fetch("/api/supplies").then((r) => r.json()).catch(() => ({}));
    sup.household = sup.household || { adults: 1 };
    sup.items = sup.items || [];
    sup.climate = sup.climate || "temperate"; sup.activity = sup.activity || "moderate"; sup.target = sup.target || 14;
    body.innerHTML = `<div class="fk-grid fk-sup">
      <section class="fk-card"><div class="fk-h"><span class="g">${I.adult}</span> HOUSEHOLD</div>
        <div class="fk-people">${PEOPLE.map(([k, name, icon]) => `<div class="fk-person" data-k="${k}"><span class="g">${I[icon]}</span><span>${name}</span>
          <button class="ghost" data-d="-1">${I.minus}</button><b>0</b><button class="ghost" data-d="1">${I.plus}</button></div>`).join("")}</div>
        <div class="fk-row"><label>CLIMATE <select class="fk-climate"><option value="cold">Cold</option><option value="temperate">Mild</option><option value="hot">Hot</option></select></label>
          <label>ACTIVITY <select class="fk-activity"><option value="rest">Resting</option><option value="moderate">Normal</option><option value="heavy">Heavy work</option></select></label>
          <label>GOAL <select class="fk-target">${[3, 7, 14, 30, 60, 90].map((d) => `<option value="${d}">${d} days</option>`).join("")}</select></label></div>
      </section>
      <section class="fk-card"><div class="fk-h"><span class="g">${I.box}</span> WHAT YOU HAVE</div>
        <div class="fk-add"><select class="fk-food">${FOODS.map(([id, name, unit]) => `<option value="${id}">${escapeHtml(name)} (${unit})</option>`).join("")}</select>
          <input type="number" class="fk-qty" min="0" step="0.5" value="1" title="How many"><input type="number" class="fk-kcal" min="0" step="10" value="500" title="kcal per unit" hidden>
          <input type="date" class="fk-exp" title="Best before (optional)"><button class="solid fk-add-go">${I.plus} ADD</button></div>
        <div class="fk-items"></div>
      </section>
      <section class="fk-card fk-result"></section></div>`;
    const q = (s) => body.querySelector(s);
    body.querySelectorAll(".fk-person").forEach((row) => {
      const k = row.dataset.k, show = () => (row.querySelector("b").textContent = sup.household[k] || 0);
      row.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        sup.household[k] = Math.max(0, Math.min(99, (sup.household[k] || 0) + +b.dataset.d)); show(); changed(); Sound.click();
      }));
      show();
    });
    for (const [s, key] of [[".fk-climate", "climate"], [".fk-activity", "activity"], [".fk-target", "target"]]) {
      q(s).value = String(sup[key]);
      q(s).addEventListener("change", () => { sup[key] = key === "target" ? +q(s).value : q(s).value; changed(); Sound.click(); });
    }
    q(".fk-food").addEventListener("change", () => { q(".fk-kcal").hidden = q(".fk-food").value !== "custom"; });
    q(".fk-add-go").addEventListener("click", () => {
      const f = FOODS.find((x) => x.id === undefined && x[0] === q(".fk-food").value) || FOODS.find((x) => x[0] === q(".fk-food").value);
      const qty = Math.max(0, +q(".fk-qty").value || 0);
      if (!qty) { Sound.error(); return; }
      sup.items.push({ id: Math.random().toString(36).slice(2, 10), kind: f[0], name: f[1], qty,
                       kcal: f[0] === "custom" ? Math.max(0, +q(".fk-kcal").value || 0) : f[3], litres: f[4], expires: q(".fk-exp").value || "" });
      changed(); Sound.click();
    });
    const changed = () => { renderItems(body); result(q(".fk-result")); clearTimeout(saveTimer); saveTimer = setTimeout(saveSupplies, 700); };
    renderItems(body);
    result(q(".fk-result"));
  }
  function renderItems(body) {
    const box = body.querySelector(".fk-items"), today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 60 * dayMs).toISOString().slice(0, 10);
    box.innerHTML = sup.items.length ? sup.items.map((it) => {
      const f = FOODS.find((x) => x[0] === it.kind) || FOODS[FOODS.length - 1];
      const exp = it.expires ? (it.expires < today ? "expired" : it.expires < soon ? "soon" : "") : "";
      return `<div class="fk-item ${exp}" data-id="${it.id}"><span class="g">${it.litres ? I.water : I.food}</span>
        <span class="fk-in"><b></b><small>${it.litres ? `${+(it.qty * it.litres).toFixed(1)} L` : `${Math.round(it.qty * it.kcal).toLocaleString()} kcal`}${it.expires ? ` · best before ${it.expires}${exp === "expired" ? " (EXPIRED)" : exp === "soon" ? " (SOON)" : ""}` : ""}</small></span>
        <input type="number" min="0" step="0.5" value="${it.qty}"><span class="fk-unit">${f[2]}</span><button class="ghost fk-del">${I.del}</button></div>`;
    }).join("") : `<p class="lib-note">Add what you have stored: water, food, ration packs. The totals below update as you go.</p>`;
    box.querySelectorAll(".fk-item").forEach((row) => {
      const it = sup.items.find((x) => x.id === row.dataset.id);
      row.querySelector("b").textContent = it.name;
      row.querySelector("input").addEventListener("change", (e) => { it.qty = Math.max(0, +e.target.value || 0); refresh(); });
      row.querySelector(".fk-del").addEventListener("click", () => { sup.items = sup.items.filter((x) => x !== it); refresh(); Sound.click(); });
    });
    const refresh = () => { renderItems(body); result(body.querySelector(".fk-result")); clearTimeout(saveTimer); saveTimer = setTimeout(saveSupplies, 700); };
  }
  function needs() {
    const hot = sup.climate === "hot", cold = sup.climate === "cold";
    const actF = { rest: 0.9, moderate: 1, heavy: 1.3 }[sup.activity], actW = sup.activity === "heavy" ? 1 : 0;
    let water = 0, kcal = 0, people = 0, pets = 0;
    for (const [k, , icon, w, f] of PEOPLE) {
      const n = sup.household[k] || 0;
      const human = icon !== "dog" && icon !== "cat";
      water += n * (w * (hot && human ? 2 : 1) + (human && /adult|elder/.test(icon) ? actW : 0));
      kcal += n * f * actF * (cold ? 1.15 : 1);
      if (human) people += n; else pets += n;
    }
    return { water, kcal, people, pets };
  }
  function result(box) {
    const n = needs();
    const water = sup.items.reduce((s, it) => s + it.qty * (it.litres || 0), 0);
    const kcal = sup.items.reduce((s, it) => s + it.qty * (it.kcal || 0), 0);
    const wd = n.water ? water / n.water : 0, fd = n.kcal ? kcal / n.kcal : 0;
    const target = sup.target;
    const bar = (days) => `<div class="fk-bar"><i style="width:${Math.min(100, (days / target) * 100)}%"></i><em style="left:${Math.min(100, (3 / target) * 100)}%">3 d</em></div>`;
    const days = (d) => (d >= 1 ? `${d.toFixed(d < 10 ? 1 : 0)} days` : `${Math.round(d * 24)} hours`);
    const limit = Math.min(wd, fd);
    const ration = fd && fd < target ? Math.round((fd / target) * 100) : 100;
    box.innerHTML = `<div class="fk-h"><span class="g">${I.check}</span> HOW LONG IT LASTS</div>
      ${!n.people ? `<p class="lib-note">Add the people in your household to see how long your supplies last.</p>` : `
      <div class="fk-need"><span><small>WATER NEEDED</small><b>${n.water.toFixed(1)} L / day</b></span><span><small>FOOD NEEDED</small><b>${Math.round(n.kcal).toLocaleString()} kcal / day</b></span></div>
      <div class="fk-last"><span class="g">${I.water}</span><b>Water</b><span>${water.toFixed(1)} L</span><strong>${days(wd)}</strong></div>${bar(wd)}
      <div class="fk-last"><span class="g">${I.food}</span><b>Food</b><span>${Math.round(kcal).toLocaleString()} kcal</span><strong>${days(fd)}</strong></div>${bar(fd)}
      <p class="fk-verdict ${limit >= target ? "ok" : limit >= 3 ? "mid" : "low"}">${limit >= target ? `You're covered for your ${target}-day goal.`
        : `${wd <= fd ? "Water" : "Food"} runs out first, after about <b>${days(limit)}</b>. For ${target} days you'd need
           ${wd < target ? `<b>${(n.water * target - water).toFixed(0)} L</b> more water` : ""}${wd < target && fd < target ? " and " : ""}${fd < target ? `<b>${Math.round(n.kcal * target - kcal).toLocaleString()} kcal</b> more food` : ""}.`}</p>
      ${fd && fd < target ? `<p class="lib-note">Stretching the food to ${target} days means eating about ${ration}% of normal.
        ${ration < 55 ? "That's too little for long: healthy adults can manage about half for a couple of weeks at most." : "Healthy adults can manage on less for a while;"}
        children, pregnant or nursing people, the elderly and anyone ill should keep full portions.</p>` : ""}
      <p class="lib-note">Don't ration water: drink what you need and save it elsewhere (rest in the shade, no alcohol, no salty food).
        ${n.pets ? "Pets need their own food on top of this. " : ""}Needs are estimates from common preparedness guidance.</p>`}`;
  }
  async function saveSupplies() {
    try { sup = await (await fetch("/api/supplies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sup) })).json(); } catch {}
    if (window.UmbraAchievements) UmbraAchievements.check();
  }

  // ========================================================= TRAINING

  const MORSE = { A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.", H: "....", I: "..", J: ".---", K: "-.-", L: ".-..",
    M: "--", N: "-.", O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-", V: "...-", W: ".--", X: "-..-", Y: "-.--",
    Z: "--..", 1: ".----", 2: "..---", 3: "...--", 4: "....-", 5: ".....", 6: "-....", 7: "--...", 8: "---..", 9: "----.", 0: "-----" };
  const FROM = Object.fromEntries(Object.entries(MORSE).map(([k, v]) => [v, k]));
  const WORDS = ["SOS", "HELP", "WATER", "FIRE", "SAFE", "NORTH", "CAMP", "MEDIC", "FOOD", "SHELTER", "RADIO", "EAST", "WEST", "SOUTH", "OK", "HURT", "COME", "WAIT"];
  let sub = "morse", wpm = store.get("wpm", 15);
  const unit = () => 1.2 / wpm;   // the length of a dot, in seconds
  // Plays text as Morse on the audio clock; returns when it's done.
  function playMorse(text, onSymbol) {
    const c = audio();
    if (!c) return Promise.resolve();
    let t = c.currentTime + 0.1;
    const u = unit(), marks = [];
    for (const ch of text.toUpperCase()) {
      if (ch === " ") { t += u * 4; continue; }
      for (const s of MORSE[ch] || "") {
        const d = s === "." ? u : u * 3;
        tone(700, t, d, 0.5); marks.push([t, d]); t += d + u;
      }
      t += u * 2;
    }
    if (onSymbol) for (const [st, d] of marks) setTimeout(() => onSymbol(d), (st - c.currentTime) * 1000);
    return new Promise((r) => setTimeout(r, (t - c.currentTime) * 1000));
  }

  function training(body) {
    body.innerHTML = `<div class="fk-subtabs pf-choice">${[["morse", "MORSE"], ["challenge", "MORSE CHALLENGE"], ["lamp", "SIGNAL LAMP"], ["phonetic", "PHONETIC"],
      ["radio", "RADIO"], ["grid", "GRID REFS"], ["compass", "COMPASS"], ["salute", "SALUTE"], ["manuals", "MANUALS"], ["drill", "DAILY DRILL"], ["knots", "KNOTS"]]
      .filter(([k]) => ["morse", "lamp", "drill", "knots"].includes(k) || window.UmbraTraining)
      .map(([k, n]) => `<button data-s="${k}">${n}</button>`).join("")}</div><div class="fk-sub"></div>`;
    body.querySelectorAll(".fk-subtabs button").forEach((b) => b.addEventListener("click", () => { sub = b.dataset.s; Sound.click(); showSub(body); }));
    showSub(body);
  }
  function showSub(body) {
    body.querySelectorAll(".fk-subtabs button").forEach((b) => b.classList.toggle("on", b.dataset.s === sub));
    const box = body.querySelector(".fk-sub");
    const T = window.UmbraTraining;
    const K = { MORSE, FROM, audio, unit, wpm: () => wpm, playMorse };
    ({ morse: morseTab, lamp: lampTab, drill: drillTab, knots: knotsTab, challenge: (b) => T.challenge(b, K), phonetic: T && T.phonetic,
       radio: T && T.radio, grid: T && T.grid, compass: T && T.compass, salute: T && T.salute, manuals: T && T.manuals }[sub] || morseTab)(box);
  }

  function morseTab(box) {
    let answer = "", level = store.get("morse-level", 1), streak = 0, keyed = "", down = 0, gapTimer = 0;
    box.innerHTML = `<div class="fk-grid">
      <section class="fk-card"><div class="fk-h"><span class="g">${I.morse}</span> LISTEN AND ANSWER</div>
        <div class="fk-row"><div class="pf-choice fk-level"><button data-l="1">LETTERS</button><button data-l="2">WORDS</button></div>
          <label>SPEED <select class="fk-wpm">${[8, 12, 15, 20, 25].map((w) => `<option value="${w}">${w} wpm</option>`).join("")}</select></label></div>
        <div class="fk-morse-show">?</div>
        <div class="fk-row"><button class="solid fk-listen">${I.play} PLAY</button><button class="ghost fk-again">REPEAT</button>
          <input class="fk-guess" maxlength="12" placeholder="What did you hear?" spellcheck="false"><button class="ghost fk-check-go">CHECK</button></div>
        <p class="fk-feedback lib-note">Press PLAY, listen, and type what you heard. Streak: <b>0</b></p>
      </section>
      <section class="fk-card"><div class="fk-h"><span class="g">${I.bolt}</span> SEND: HOLD SPACE (OR THE KEY)</div>
        <button class="fk-key">KEY</button>
        <div class="fk-keyed"><span class="fk-sym"></span><b class="fk-dec"></b></div>
        <p class="lib-note">A short press is a dot, a long one (three times as long) a dash. Pause to end a letter. Umbra decodes as you send.
          <button class="ghost fk-clear">CLEAR</button></p>
      </section>
      <section class="fk-card fk-chart-card"><div class="fk-h"><span class="g">${I.help}</span> THE CODE · CLICK TO HEAR</div>
        <div class="fk-chart">${Object.entries(MORSE).map(([k, v]) => `<button data-c="${k}"><b>${k}</b><span>${v.replace(/\./g, "·").replace(/-/g, "—")}</span></button>`).join("")}</div>
      </section></div>`;
    const q = (s) => box.querySelector(s);
    const showLevel = () => box.querySelectorAll(".fk-level button").forEach((b) => b.classList.toggle("on", +b.dataset.l === level));
    box.querySelectorAll(".fk-level button").forEach((b) => b.addEventListener("click", () => { level = +b.dataset.l; store.set("morse-level", level); showLevel(); Sound.click(); }));
    showLevel();
    q(".fk-wpm").value = String(wpm);
    q(".fk-wpm").addEventListener("change", () => { wpm = +q(".fk-wpm").value; store.set("wpm", wpm); });
    const flash = (d) => { const s = q(".fk-morse-show"); s.classList.add("on"); setTimeout(() => s.classList.remove("on"), d * 1000); };
    q(".fk-listen").addEventListener("click", async () => {
      const letters = Object.keys(MORSE);
      answer = level === 1 ? letters[Math.floor(Math.random() * 26)] : WORDS[Math.floor(Math.random() * WORDS.length)];
      q(".fk-morse-show").textContent = "···";
      q(".fk-guess").value = ""; q(".fk-guess").focus();
      await playMorse(answer, flash);
    });
    q(".fk-again").addEventListener("click", () => answer && playMorse(answer, flash));
    const check = () => {
      if (!answer) return;
      const g = q(".fk-guess").value.trim().toUpperCase();
      const ok = g === answer;
      streak = ok ? streak + 1 : 0;
      q(".fk-morse-show").textContent = `${answer}  ${[...answer].map((c) => MORSE[c]).join(" ").replace(/\./g, "·").replace(/-/g, "—")}`;
      q(".fk-feedback").innerHTML = `${ok ? "Correct." : `It was <b>${answer}</b>.`} Streak: <b>${streak}</b>`;
      if (ok) { Sound.found(); if (window.track) for (let i = 0; i < answer.length; i++) track("morseLetters"); } else Sound.error();
      answer = "";
    };
    q(".fk-check-go").addEventListener("click", check);
    q(".fk-guess").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); check(); } e.stopPropagation(); });
    box.querySelectorAll(".fk-chart button").forEach((b) => b.addEventListener("click", () => playMorse(b.dataset.c)));
    // Sending: press lengths become dots and dashes, pauses end letters.
    const c = () => audio();
    let osc = null, gainNode = null;
    const press = () => {
      if (down) return;
      down = performance.now();
      const ctx = c(); if (!ctx) return;
      osc = ctx.createOscillator(); gainNode = ctx.createGain();
      osc.frequency.value = 700; gainNode.gain.value = 0.4 * (window.prefs ? window.prefs.volume : 0.9);
      osc.connect(gainNode).connect(ctx.destination); osc.start();
      q(".fk-key").classList.add("on");
      clearTimeout(gapTimer);
    };
    const release = () => {
      if (!down) return;
      const ms = performance.now() - down; down = 0;
      if (osc) { osc.stop(); osc = null; }
      q(".fk-key").classList.remove("on");
      keyed += ms < unit() * 1000 * 2 ? "." : "-";
      q(".fk-sym").textContent = keyed.replace(/\./g, "·").replace(/-/g, "—");
      clearTimeout(gapTimer);
      gapTimer = setTimeout(() => {
        const ch = FROM[keyed] || "?";
        q(".fk-dec").textContent = (q(".fk-dec").textContent + ch).slice(-24);
        keyed = ""; q(".fk-sym").textContent = "";
      }, unit() * 1000 * 3);
    };
    q(".fk-key").addEventListener("pointerdown", press);
    q(".fk-key").addEventListener("pointerup", release);
    q(".fk-key").addEventListener("pointerleave", release);
    q(".fk-clear").addEventListener("click", () => { q(".fk-dec").textContent = ""; });
    keyHandler = (e) => {
      if (e.code !== "Space" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return false;
      e.preventDefault();
      if (e.type === "keydown" && !e.repeat) press();
      if (e.type === "keyup") release();
      return true;
    };
  }
  let keyHandler = null;

  // The signal lamp: the whole screen flashes Morse (SOS or a message), or
  // stays lit as a light or a strobe.
  function lampTab(box) {
    box.innerHTML = `<section class="fk-card"><div class="fk-h"><span class="g">${I.lamp}</span> SIGNAL LAMP</div>
      <p class="lib-note">Turns this screen into a light. At night a bright screen can be seen from far away. Turn the screen brightness up first.
        Warning: flashing light can trigger seizures in people with photosensitive epilepsy.</p>
      <div class="fk-row"><button class="solid" data-m="sos">SOS</button><button class="ghost" data-m="text">SEND A MESSAGE</button>
        <input class="fk-msg" maxlength="30" placeholder="e.g. HELP 2 HURT" spellcheck="false"><button class="ghost" data-m="steady">STEADY LIGHT</button>
        <button class="ghost" data-m="strobe">STROBE</button></div>
      <p class="lib-note">Press Esc or click to stop.</p></section>`;
    box.querySelectorAll("[data-m]").forEach((b) => b.addEventListener("click", () => lamp(b.dataset.m, box.querySelector(".fk-msg").value)));
    box.querySelector(".fk-msg").addEventListener("keydown", (e) => e.stopPropagation());
  }
  function lamp(mode, text) {
    const el = document.createElement("div");
    el.className = "fk-lamp";
    el.innerHTML = `<span>${mode === "sos" ? "SOS" : mode === "text" ? escapeHtml(text.toUpperCase() || "SOS") : mode === "strobe" ? "STROBE" : "LIGHT"} · ESC TO STOP</span>`;
    document.body.appendChild(el);
    let alive = true, timer = 0;
    const stop = () => { alive = false; clearTimeout(timer); el.remove(); document.removeEventListener("keydown", onKey, true); };
    const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); stop(); } };
    document.addEventListener("keydown", onKey, true);
    el.addEventListener("click", stop);
    const set = (on) => el.classList.toggle("lit", on);
    if (mode === "steady") { set(true); return; }
    if (mode === "strobe") { let on = false; const t = () => { if (!alive) return; on = !on; set(on); timer = setTimeout(t, on ? 120 : 880); }; t(); return; }
    const msg = (mode === "sos" ? "SOS" : text || "SOS").toUpperCase(), u = 0.25;   // slow enough to read by eye
    const seq = [];
    for (const ch of msg) {
      if (ch === " ") { seq.push([false, u * 4]); continue; }
      for (const s of MORSE[ch] || "") seq.push([true, s === "." ? u : u * 3], [false, u]);
      seq.push([false, u * 2]);
    }
    seq.push([false, u * 7]);
    let i = 0;
    const step = () => { if (!alive) return; const [on, d] = seq[i % seq.length]; set(on); i++; timer = setTimeout(step, d * 1000); };
    step();
  }

  // Daily drill: five questions, the same for everyone on a day; one drill
  // a day counts toward the streak.
  const QUIZ = [
    ["Someone is bleeding heavily from the thigh. What comes first?", ["Firm, direct pressure on the wound", "A drink of water", "Raise the head", "Wait for it to clot"], 0, "Direct pressure first; a tourniquet if pressure can't stop life-threatening bleeding from a limb."],
    ["How many chest compressions per minute in CPR?", ["60–80", "100–120", "140–160", "As many as possible"], 1, "100 to 120 a minute, about two a second."],
    ["The ratio for CPR with rescue breaths is:", ["15:1", "30:2", "5:1", "50:5"], 1, "30 compressions, then 2 breaths."],
    ["How long should you cool a burn under running water?", ["1 minute", "5 minutes", "20 minutes", "Until it blisters"], 2, "20 minutes of cool (not icy) running water."],
    ["Which water treatment kills most germs with just heat?", ["Freezing", "A rolling boil for 1 minute", "Letting it settle", "Adding salt"], 1, "A rolling boil for 1 minute (3 at high altitude)."],
    ["How much water should you store per person per day?", ["0.5 L", "1 L", "About 3.8 L (a gallon)", "10 L"], 2, "About a gallon (3.8 L) for drinking and basic hygiene; more in heat."],
    ["The 'rule of threes' says you can survive about how long without shelter in harsh weather?", ["3 minutes", "3 hours", "3 days", "3 weeks"], 1, "3 minutes without air, 3 hours without shelter (harsh conditions), 3 days without water, 3 weeks without food."],
    ["What does SOS look like in Morse?", ["··· ——— ···", "——— ··· ———", "·—·—·—", "···· ····"], 0, "Three short, three long, three short."],
    ["The international distress signal with a whistle or light is:", ["One long blast", "Three blasts or flashes", "Five short blasts", "Continuous sound"], 1, "Three of anything (blasts, flashes, fires) means distress."],
    ["Early signs of hypothermia include:", ["Shivering, clumsiness, confusion", "Hot, red skin", "Sweating", "Hiccups"], 0, "Shivering, fumbling hands, slurred speech, confusion ('the umbles')."],
    ["For someone in shock you should:", ["Give them alcohol", "Lay them down, keep them warm", "Make them walk", "Give salty food"], 1, "Lay them down, raise the legs if no injury prevents it, keep them warm, get help."],
    ["Choking adult who can't cough or speak. First:", ["Back blows and abdominal thrusts", "A glass of water", "Wait", "Lay them flat"], 0, "Up to 5 back blows, then up to 5 abdominal thrusts, alternating."],
    ["Which knot makes a fixed loop that won't slip?", ["Clove hitch", "Bowline", "Square knot", "Slip knot"], 1, "The bowline: a fixed loop, easy to untie after load."],
    ["Carbon monoxide danger during a power cut comes from:", ["Candles", "Generators or stoves used indoors", "Torches", "Fridges"], 1, "Never run generators, grills or fuel heaters indoors or in garages."],
    ["A person's pulse at rest is normally about:", ["20–40", "60–100", "120–160", "180+"], 1, "60 to 100 beats a minute for most adults at rest."],
    ["In a flood, how deep can moving water knock you over?", ["15 cm (6 in)", "1 m", "2 m", "It can't"], 0, "About 15 cm of fast water can knock you down; 30 cm can float a car."],
    ["Where does the sun stand at solar noon in the northern hemisphere?", ["Due north", "Due south", "Due east", "Straight overhead always"], 1, "Due south (due north in the southern hemisphere)."],
    ["Best first step if you're lost in the wild:", ["Run to find a road", "S.T.O.P.: stop, think, observe, plan", "Climb the nearest tree", "Wait for dark"], 1, "Stop, think, observe, plan. Panic wastes energy and gets people more lost."],
    ["A tourniquet's time should be:", ["Kept secret", "Written on it or the skin", "Reset every 10 minutes", "Ignored"], 1, "Write the time it went on; medics need it."],
    ["Snake bite: which is right?", ["Cut and suck the wound", "Keep still, immobilise the limb, get help", "Apply ice", "Run to hospital"], 1, "Keep still and calm, immobilise the limb, remove rings, get medical help."],
    ["The safest way to thaw a frostbitten hand in the field:", ["Rub it with snow", "Warm water around 37–39 °C, if it won't refreeze", "Hold it to a fire", "Leave it"], 1, "Warm water, only when it won't refreeze; never rub or use direct heat."],
    ["Heat stroke differs from heat exhaustion by:", ["Confusion and very high temperature", "Thirst", "Tiredness", "Sweating"], 0, "Confusion, collapse or very high temperature mean heat stroke: cool fast, call for help."],
    ["How long can a healthy adult last without food?", ["3 days", "About 3 weeks", "3 months", "1 day"], 1, "About three weeks with water, but strength drops fast: stay warm and rested."],
    ["A good fire needs:", ["Heat, fuel and oxygen", "Only big logs", "Wet wood", "No wind at all"], 0, "The fire triangle: heat, fuel, oxygen. Start with tinder, then kindling, then fuel."],
    ["The recovery position is for someone who:", ["Is breathing but unresponsive", "Has no pulse", "Is choking", "Is awake and talking"], 0, "Breathing but unresponsive: on their side, head tilted to keep the airway open."],
  ];
  function drillTab(box) {
    const day = new Date().toISOString().slice(0, 10);
    const seed = [...day].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    const order = QUIZ.map((_, i) => i).sort((a, b) => ((a * 9301 + seed) % 233) - ((b * 9301 + seed) % 233)).slice(0, 5);
    const done = store.get("drill-day", "") === day;
    let i = 0, score = 0;
    const streak = store.get("drill-streak", 0);
    box.innerHTML = `<section class="fk-card fk-drill"><div class="fk-h"><span class="g">${I.school}</span> DAILY DRILL · ${day}</div>
      <p class="lib-note">Five questions a day. ${done ? "You've done today's drill; you can still practise it." : ""} Streak: <b>${streak} ${streak === 1 ? "day" : "days"}</b></p>
      <div class="fk-q"></div></section>`;
    const show = () => {
      const qbox = box.querySelector(".fk-q");
      if (i >= order.length) {
        qbox.innerHTML = `<div class="fk-done"><b>${score} / ${order.length}</b><span>${score === 5 ? "Perfect. Sharp as a knife." : score >= 3 ? "Well done. Come back tomorrow for a new drill." : "Keep at it: each day builds the habit."}</span></div>`;
        if (!done) {
          const yesterday = new Date(Date.now() - dayMs).toISOString().slice(0, 10);
          store.set("drill-streak", store.get("drill-last", "") === yesterday ? streak + 1 : 1);
          store.set("drill-last", day); store.set("drill-day", day);
          if (window.track) track("drills");
        }
        Sound.found();
        return;
      }
      const [question, answers, right, why] = QUIZ[order[i]];
      qbox.innerHTML = `<div class="fk-qn">QUESTION ${i + 1} OF ${order.length}</div><h3></h3><div class="fk-answers">${answers.map((a, k) => `<button class="ghost" data-k="${k}"></button>`).join("")}</div><p class="fk-why lib-note" hidden></p>`;
      qbox.querySelector("h3").textContent = question;
      qbox.querySelectorAll(".fk-answers button").forEach((b) => {
        b.textContent = answers[+b.dataset.k];
        b.addEventListener("click", () => {
          if (qbox.querySelector(".fk-answers").classList.contains("answered")) return;
          qbox.querySelector(".fk-answers").classList.add("answered");
          const ok = +b.dataset.k === right;
          if (ok) score++;
          b.classList.add(ok ? "right" : "wrong");
          qbox.querySelector(`[data-k="${right}"]`).classList.add("right");
          const w = qbox.querySelector(".fk-why"); w.hidden = false; w.textContent = why;
          ok ? Sound.found() : Sound.error();
          const next = document.createElement("button"); next.className = "solid fk-next"; next.textContent = i + 1 < order.length ? "NEXT ▸" : "FINISH ▸";
          next.addEventListener("click", () => { i++; show(); });
          qbox.appendChild(next);
        });
      });
    };
    show();
  }

  const KNOTS = [
    ["Bowline", "A fixed loop that won't slip or jam: rescue loops, tying to a tree or a boat.", ["Make a small overhand loop in the standing part (the 'rabbit hole').", "Pass the working end up through the loop (the rabbit comes out of the hole).", "Take it around behind the standing part (round the tree).", "Bring it back down through the small loop (back down the hole).", "Hold the end and loop, pull the standing part to tighten."]],
    ["Clove hitch", "Quick to tie around a pole or post: starting lashings, securing a tarp line.", ["Wrap the rope once around the pole.", "Cross over the first wrap and go around again.", "Tuck the end under the second wrap.", "Pull both ends to snug it; add a half hitch for security."]],
    ["Square (reef) knot", "Joins two ends of the same material: bandages, bundles. Not for loads.", ["Right over left and under.", "Left over right and under.", "Check it lies flat and symmetrical; each end exits beside its own standing part."]],
    ["Sheet bend", "Joins two ropes, even of different thickness.", ["Make a bight (U-bend) in the thicker rope.", "Pass the thinner end up through the bight.", "Wrap it around behind both legs of the bight.", "Tuck it under itself (not through the bight). Pull tight."]],
    ["Taut-line hitch", "An adjustable loop that holds under tension: tent guylines, ridgelines.", ["Pass the end around the stake or anchor.", "Wrap it twice around the standing part, inside the loop.", "Make one more wrap outside the first two.", "Tighten; slide the knot to adjust the tension."]],
    ["Figure-eight loop", "A strong, secure fixed loop that's easy to check: climbing, heavy loads.", ["Tie a loose figure-eight in the rope.", "Pass the end around the anchor (or use a doubled rope for a loop on a bight).", "Follow the figure-eight back exactly, alongside the first pass.", "Dress it neatly and pull all four strands tight."]],
    ["Trucker's hitch", "Pulls a line really tight with a built-in pulley: loads, ridgelines.", ["Make a fixed loop in the standing part (a slipped overhand or a figure eight on a bight).", "Pass the end around the anchor and back up through that loop.", "Pull down hard: the loop works like a pulley.", "Lock it with two half hitches below the loop."]],
    ["Prusik", "A friction hitch that grips a rope when loaded and slides when not: climbing a rope, adjustable tie-offs.", ["Take a loop of thinner cord.", "Wrap it around the main rope, passing through itself, three times.", "Keep the wraps neat and parallel.", "Load the loop: it grips. Unload it: it slides."]],
  ];
  function knotsTab(box) {
    const done = store.get("knots", []);
    box.innerHTML = `<div class="fk-knots">${KNOTS.map(([name, use, steps], k) => `<section class="fk-card fk-knot">
      <div class="fk-h"><span class="g">${I.knot}</span> ${name.toUpperCase()}</div><p class="lo-desc">${escapeHtml(use)}</p>
      <ol>${steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
      <label class="fk-check"><input type="checkbox" data-k="${k}" ${done.includes(k) ? "checked" : ""}> I can tie it</label></section>`).join("")}</div>
      <p class="lib-note">Practise with a real piece of rope until you can tie each one without looking: knots are only useful if your hands know them.</p>`;
    box.querySelectorAll("input[data-k]").forEach((c) => c.addEventListener("change", () => {
      const set = new Set(store.get("knots", []));
      c.checked ? set.add(+c.dataset.k) : set.delete(+c.dataset.k);
      store.set("knots", [...set]); Sound.click();
    }));
  }

  // ============================================================ CARDS

  async function cards(body) {
    const pages = await loadManual();
    const chosen = new Set(store.get("card-pages", pages.slice(0, 6).map((p) => p.id)));
    body.innerHTML = `<div class="fk-grid">
      <section class="fk-card"><div class="fk-h"><span class="g">${I.card}</span> FIELD MANUAL PAGES</div>
        <div class="fk-pages">${pages.map((p) => `<label class="fk-check"><input type="checkbox" value="${escapeHtml(p.id)}" ${chosen.has(p.id) ? "checked" : ""}> ${escapeHtml(p.title)}</label>`).join("")}</div>
      </section>
      <section class="fk-card"><div class="fk-h"><span class="g">${I.pin}</span> ALSO ON THE CARDS</div>
        <label class="fk-check"><input type="checkbox" class="fk-c-id" checked> My ID & medical card (from your profile: blood type, allergies, medication, emergency contact)</label>
        <label class="fk-check"><input type="checkbox" class="fk-c-wp" checked> My waypoints, with coordinates and MGRS</label>
        <label class="fk-check"><input type="checkbox" class="fk-c-sup" checked> My supplies summary</label>
        <label class="lo-field"><span>EMERGENCY CONTACTS</span><textarea class="fk-c-contacts" rows="4" maxlength="1500" placeholder="Name, relation, phone number — one per line"></textarea></label>
        <label class="lo-field"><span>NOTES</span><textarea class="fk-c-notes" rows="3" maxlength="1500" placeholder="Meeting points, medication, blood type, radio channels…"></textarea></label>
        <p class="lib-note">Cards are A6, four to an A4 page with cut lines. They're saved as a page you open and print (Ctrl+P).</p>
        <div class="lo-actions"><button class="solid fk-print">${I.print} MAKE THE CARDS</button></div>
      </section>
      <section class="fk-card fk-cards-preview"><div class="fk-h"><span class="g">${I.card}</span> WHAT YOU'LL GET <small class="fk-cp-count"></small></div>
        <pre class="fk-cp"></pre>
        <p class="lib-note">A sketch of the first page: four cards to an A4 sheet, cut along the dashed lines, and keep them dry (a zip bag works).</p>
      </section></div>`;
    const q = (s) => body.querySelector(s);
    q(".fk-c-contacts").value = store.get("contacts", "");
    q(".fk-c-notes").value = store.get("card-notes", "");
    // The preview: the cards that will be made, as a sketch of the first page.
    const preview = () => {
      const titles = [];
      if (q(".fk-c-id").checked) titles.push(["ID & MEDICAL", ["Name · callsign", "Blood type · allergy", "Medication", "ICE contact"]]);
      body.querySelectorAll(".fk-pages input:checked").forEach((c) => { const p = pages.find((x) => x.id === c.value); if (p) titles.push([p.title, null]); });
      if (q(".fk-c-wp").checked) titles.push(["WAYPOINTS", ["Name   grid", "Name   grid", "Name   grid"]]);
      if (q(".fk-c-sup").checked) titles.push(["SUPPLIES", ["Water   days", "Food    days", "- items"]]);
      if (q(".fk-c-contacts").value.trim()) titles.push(["CONTACTS", ["Name   phone", "Name   phone"]]);
      if (q(".fk-c-notes").value.trim()) titles.push(["NOTES", null]);
      const w = 17, cut = (t) => (t.length > w - 2 ? t.slice(0, w - 3) + "…" : t).padEnd(w - 2);
      const card = (c) => {
        if (!c) return Array(8).fill(" ".repeat(w - 2));
        const [t, lines] = c, body = lines || ["1. ─────────", "2. ────────", "3. ──────────", "4. ──────"];
        return ["UMBRA · CARD".padEnd(w - 2), cut(t.toUpperCase()), "═".repeat(w - 2), ...body.slice(0, 4).map(cut), ...Array(Math.max(0, 4 - body.length)).fill(" ".repeat(w - 2)), "·call 112·".padStart(w - 4).padEnd(w - 2)];
      };
      const page = [titles[0], titles[1], titles[2], titles[3]].map(card);
      const row = (a, b) => a.map((l, i) => `┆ ${l} ┆ ${b[i]} ┆`).join("\n");
      const line = "┄".repeat(w) , top = `┌${line}┬${line}┐`, mid = `├${line}┼${line}┤`, bot = `└${line}┴${line}┘`;
      q(".fk-cp").textContent = titles.length ? [top, row(page[0], page[1]), mid, row(page[2], page[3]), bot].join("\n") : "Choose something to put on the cards.";
      const n = titles.length;
      q(".fk-cp-count").textContent = n ? `· ${n} ${n === 1 ? "CARD" : "CARDS"} · ${Math.ceil(n / 4)} ${Math.ceil(n / 4) === 1 ? "PAGE" : "PAGES"}` : "";
    };
    body.querySelectorAll("input[type=checkbox]").forEach((c) => c.addEventListener("change", preview));
    for (const s of [".fk-c-contacts", ".fk-c-notes"]) q(s).addEventListener("input", preview);
    preview();
    for (const s of [".fk-c-contacts", ".fk-c-notes"]) q(s).addEventListener("keydown", (e) => e.stopPropagation());
    q(".fk-print").addEventListener("click", async () => {
      const ids = [...body.querySelectorAll(".fk-pages input:checked")].map((c) => c.value);
      store.set("card-pages", ids);
      store.set("contacts", q(".fk-c-contacts").value); store.set("card-notes", q(".fk-c-notes").value);
      let wps = [];
      if (q(".fk-c-wp").checked) {
        const list = await fetch("/api/waypoints").then((r) => r.json()).catch(() => []);
        const M = window.UmbraMaps;
        wps = list.map((w) => ({ name: w.name, note: w.note, coords: `${w.lat.toFixed(5)}, ${w.lon.toFixed(5)}`, mgrs: M ? "MGRS " + M.toMGRS(w.lat, w.lon) : "" }));
      }
      let supText = "";
      if (q(".fk-c-sup").checked) {
        if (!sup) sup = await fetch("/api/supplies").then((r) => r.json()).catch(() => ({}));
        if (sup && sup.items && sup.items.length) {
          sup.household = sup.household || {};
          const n = needs();
          const water = sup.items.reduce((s, it) => s + it.qty * (it.litres || 0), 0), kcal = sup.items.reduce((s, it) => s + it.qty * (it.kcal || 0), 0);
          supText = [`**Household:** ${PEOPLE.filter(([k]) => sup.household[k]).map(([k, name]) => `${sup.household[k]} ${name.toLowerCase()}`).join(", ") || "not set"}`,
            `- Water: ${water.toFixed(0)} L (${n.water ? (water / n.water).toFixed(1) : "?"} days at ${n.water.toFixed(1)} L/day)`,
            `- Food: ${Math.round(kcal).toLocaleString()} kcal (${n.kcal ? (kcal / n.kcal).toFixed(1) : "?"} days)`,
            ...sup.items.map((it) => `- ${it.qty} × ${it.name}${it.expires ? ` (best before ${it.expires})` : ""}`)].join("\n");
        }
      }
      exportTo({ what: "cards", idcard: q(".fk-c-id").checked, pages: ids, waypoints: wps, supplies: supText, contacts: q(".fk-c-contacts").value, notes: q(".fk-c-notes").value }, "your pocket cards");
    });
  }

  // ------------------------------------------------------- open / close

  function toggle(show = $("#fieldkit").hidden, quiet = false) {
    const el = $("#fieldkit");
    if (show && locked) return;
    if (!show) {
      el.hidden = true; $("#fieldkit-btn").classList.remove("on");
      if (!quiet) Sound.click();
      return;
    }
    if (window.closeSettings) window.closeSettings();
    if (window.closeLoadout) window.closeLoadout(true);
    if (window.closeHistory) window.closeHistory();
    if (window.closeMaps) window.closeMaps();
    if (window.closeRadar) window.closeRadar();
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    el.hidden = false; $("#fieldkit-btn").classList.add("on");
    render();
    Sound.click();
  }

  build();
  $("#fieldkit-btn").addEventListener("click", () => toggle());
  document.addEventListener("keydown", (e) => {
    if ($("#fieldkit").hidden || !$("#modal").hidden) return;
    // The signal lamp (full screen) handles its own Esc: back to Training.
    if (e.key === "Escape" && document.querySelector(".fk-lamp")) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); toggle(false); return; }
    if (keyHandler && tab === "training" && sub === "morse" && keyHandler(e)) e.stopImmediatePropagation();
  }, true);
  document.addEventListener("keyup", (e) => { if (!$("#fieldkit").hidden && keyHandler && tab === "training" && sub === "morse") keyHandler(e); }, true);
  new MutationObserver(() => { if (document.body.classList.contains("locked") && !$("#fieldkit").hidden) toggle(false, true); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  ensureTick();   // timers from before a restart keep going (and ring)
  window.toggleFieldKit = toggle;
  window.closeFieldKit = () => { if (!$("#fieldkit").hidden) toggle(false, true); };
  window.UmbraFieldKit = { sunTimes, moonLight, moonTimes, needs: () => sup && needs(),
    // Opens the kit on a tab (and a training sub-tab), e.g. open("training", "morse").
    astro: { toDays, sidereal, sunCoords, moonCoords, moonLight }, hasVault: true,
    // For the calendar: how many days the stored water and food last, the
    // items' best-before dates, and the running first-aid timers.
    forecast: async () => {
      if (!sup) sup = await fetch("/api/supplies").then((r) => r.json()).catch(() => ({}));
      sup.household = sup.household || { adults: 1 }; sup.items = sup.items || [];
      sup.climate = sup.climate || "temperate"; sup.activity = sup.activity || "moderate"; sup.target = sup.target || 14;
      const n = needs();
      const water = sup.items.reduce((s2, it) => s2 + it.qty * (it.litres || 0), 0), kcal = sup.items.reduce((s2, it) => s2 + it.qty * (it.kcal || 0), 0);
      return { waterDays: n.water && water ? water / n.water : null, foodDays: n.kcal && kcal ? kcal / n.kcal : null,
               items: sup.items.filter((it) => it.expires).map((it) => ({ name: it.name, expires: it.expires })),
               timers: running.map((r) => ({ name: r.name, at: r.at, secs: r.secs, up: r.up })) };
    },
    open: (t, st) => { if (t && TABS.some(([id]) => id === t)) tab = t; if (st) sub = st; if ($("#fieldkit").hidden) toggle(true); else render(); } };
})();
