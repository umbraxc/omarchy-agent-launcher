// Umbra Wiki training drills, more pages for the Field Kit's TRAINING tab:
// a Morse sending challenge (key a word or a sentence, for points and a
// streak), the NATO phonetic alphabet, radio procedure words, reading grid
// references, compass bearings and pace counting, and SALUTE reports.
// Points and best streaks are kept on this computer.
// Loaded after app.js (uses $, Sound, escapeHtml); fieldkit.js passes its
// Morse table and audio in.
"use strict";

window.UmbraTraining = (() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem("umbra-train-" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("umbra-train-" + k, JSON.stringify(v)); } catch {} },
  };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

  // Points, streaks and best streaks per drill, shown on every drill.
  function score(drill) {
    const s = store.get("score", {});
    const me = s[drill] || (s[drill] = { points: 0, best: 0, streak: 0 });
    return {
      get: () => me,
      hit(p = 1) { me.points += p; me.streak++; me.best = Math.max(me.best, me.streak); store.set("score", s); if (window.track) track("drills"); },
      miss() { me.streak = 0; store.set("score", s); },
      bar: () => `<div class="tr-bar"><span><small>POINTS</small><b>${me.points}</b></span><span><small>STREAK</small><b>${me.streak}</b></span><span><small>BEST</small><b>${me.best}</b></span></div>`,
    };
  }
  const refreshBar = (box, sc) => { const b = box.querySelector(".tr-bar"); if (b) b.outerHTML = sc.bar(); };

  // A multiple-choice card: a question, four answers, and the next one.
  function quiz(box, sc, make, intro = "") {
    const next = () => {
      const { q, a, wrong, explain } = make();
      const opts = shuffle([a, ...[...new Set(wrong)].filter((w) => w !== a).slice(0, 3)]);
      box.querySelector(".tr-q").innerHTML = `<p class="tr-ask">${q}</p><div class="tr-opts">${opts.map((o) => `<button class="ghost tr-o">${escapeHtml(o)}</button>`).join("")}</div><p class="tr-exp"></p>`;
      box.querySelectorAll(".tr-o").forEach((b) => b.addEventListener("click", () => {
        if (box.querySelector(".tr-q").dataset.done) return;
        box.querySelector(".tr-q").dataset.done = "1";
        const ok = b.textContent === a;
        box.querySelectorAll(".tr-o").forEach((x) => x.classList.toggle("right", x.textContent === a));
        if (!ok) b.classList.add("wrong");
        ok ? (sc.hit(), Sound.found()) : (sc.miss(), Sound.error());
        box.querySelector(".tr-exp").innerHTML = (ok ? "Correct. " : "") + (explain || "");
        refreshBar(box, sc);
        setTimeout(() => { delete box.querySelector(".tr-q").dataset.done; next(); }, ok ? 900 : 2200);
      }));
    };
    box.innerHTML = `<section class="fk-card tr-card">${sc.bar()}${intro}<div class="tr-q"></div></section>`;
    next();
  }

  // ---------------------------------------------------- Morse challenge

  const PHRASES = [
    ["SOS"], ["HELP"], ["WATER"], ["NORTH"], ["CAMP"], ["FIRE"], ["SAFE"], ["RALLY"], ["MEDIC"], ["FOOD"],
    ["ALL SAFE"], ["NEED WATER"], ["SEND HELP"], ["GO NORTH"], ["AT CAMP"], ["RALLY AT DAWN"], ["TWO HURT"], ["BRIDGE OUT"],
  ];
  function challenge(box, K) {
    const sc = score("morse-send");
    let target = "", pos = 0, keyed = "", down = 0, gapTimer = 0, osc = null, t0 = 0;
    const level = () => store.get("mc-level", 1);
    box.innerHTML = `<div class="fk-grid"><section class="fk-card tr-card">${sc.bar()}
      <div class="fk-h">SEND IT IN MORSE</div>
      <div class="fk-row"><div class="pf-choice tr-lvl"><button data-l="1">WORDS</button><button data-l="2">SENTENCES</button></div>
        <button class="ghost tr-hear">▶ HEAR IT</button><button class="ghost tr-skip">NEW ONE</button></div>
      <div class="tr-target"></div>
      <button class="fk-key tr-key">KEY · HOLD SPACE</button>
      <div class="fk-keyed"><span class="fk-sym tr-sym"></span></div>
      <p class="lib-note tr-msg">Hold Space (or the key) for dashes, tap for dots; pause between letters. Each correct word scores its letters, more at higher speed.</p>
      </section>
      <section class="fk-card"><div class="fk-h">THE CODE</div><div class="fk-chart tr-chart">${Object.entries(K.MORSE).filter(([c]) => /[A-Z]/.test(c))
        .map(([c, v]) => `<span><b>${c}</b>${v.replace(/\./g, "·").replace(/-/g, "—")}</span>`).join("")}</div></section></div>`;
    const q = (s) => box.querySelector(s);
    const lv = () => box.querySelectorAll(".tr-lvl button").forEach((b) => b.classList.toggle("on", +b.dataset.l === level()));
    box.querySelectorAll(".tr-lvl button").forEach((b) => b.addEventListener("click", () => { store.set("mc-level", +b.dataset.l); lv(); fresh(); Sound.click(); }));
    lv();
    const show = () => {
      q(".tr-target").innerHTML = [...target].map((c, i) => `<span class="${i < pos ? "ok" : i === pos ? "cur" : ""}">${c === " " ? "&nbsp;" : c}</span>`).join("") +
        `<small>${target.replace(/ /g, "").slice(pos === 0 ? 0 : 0).length} LETTERS</small>`;
    };
    function fresh() {
      const pool = PHRASES.filter(([p]) => (level() === 1 ? !p.includes(" ") : p.includes(" ")));
      target = pick(pool)[0]; pos = 0; keyed = ""; t0 = performance.now(); show();
      q(".tr-sym").textContent = "";
    }
    const skipSpaces = () => { while (target[pos] === " ") pos++; };
    const letter = (ch) => {
      skipSpaces();
      if (ch === target[pos]) {
        pos++; skipSpaces(); Sound.key();
        if (pos >= target.length) {
          const letters = target.replace(/ /g, "").length, pts = letters * (K.wpm() >= 15 ? 2 : 1);
          sc.hit(pts); refreshBar(box, sc);
          q(".tr-msg").innerHTML = `<b>${target}</b> sent in ${((performance.now() - t0) / 1000).toFixed(1)} s. +${pts} points.`;
          Sound.found();
          if (window.track) for (let i = 0; i < letters; i++) track("morseLetters");
          setTimeout(fresh, 900);
        }
      } else {
        sc.miss(); refreshBar(box, sc);
        q(".tr-msg").innerHTML = `That was <b>${ch}</b>; <b>${target[pos]}</b> is ${K.MORSE[target[pos]].replace(/\./g, "·").replace(/-/g, "—")}. Streak lost; carry on.`;
        q(".tr-target").classList.remove("bad"); void q(".tr-target").offsetWidth; q(".tr-target").classList.add("bad");
        Sound.error();
      }
      show();
    };
    const press = () => {
      if (down) return;
      down = performance.now();
      const ctx = K.audio(); if (!ctx) return;
      osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.frequency.value = 700; g.gain.value = 0.4 * (window.prefs ? window.prefs.volume : 0.9);
      osc.connect(g).connect(ctx.destination); osc.start();
      q(".tr-key").classList.add("on"); clearTimeout(gapTimer);
    };
    const release = () => {
      if (!down) return;
      const ms = performance.now() - down; down = 0;
      if (osc) { osc.stop(); osc = null; }
      q(".tr-key").classList.remove("on");
      keyed += ms < K.unit() * 1000 * 2 ? "." : "-";
      q(".tr-sym").textContent = keyed.replace(/\./g, "·").replace(/-/g, "—");
      clearTimeout(gapTimer);
      gapTimer = setTimeout(() => { const ch = K.FROM[keyed] || "?"; keyed = ""; q(".tr-sym").textContent = ""; letter(ch); }, K.unit() * 1000 * 3);
    };
    q(".tr-key").addEventListener("pointerdown", press);
    q(".tr-key").addEventListener("pointerup", release);
    q(".tr-key").addEventListener("pointerleave", release);
    const onKey = (e) => {
      if (!box.isConnected) { document.removeEventListener("keydown", onKey, true); document.removeEventListener("keyup", onKey, true); return; }
      if (e.code !== "Space" || /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type === "keydown" && !e.repeat) press(); else if (e.type === "keyup") release();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKey, true);
    q(".tr-hear").addEventListener("click", () => K.playMorse(target));
    q(".tr-skip").addEventListener("click", () => { sc.miss(); refreshBar(box, sc); fresh(); Sound.click(); });
    fresh();
  }

  // ---------------------------------------------------- phonetic alphabet

  const NATO = { A: "Alfa", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot", G: "Golf", H: "Hotel", I: "India", J: "Juliett",
    K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango", U: "Uniform",
    V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee", Z: "Zulu", 0: "Zero", 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Niner" };
  function phonetic(box) {
    const sc = score("phonetic");
    const letters = Object.keys(NATO).filter((k) => /[A-Z]/.test(k));
    quiz(box, sc, () => {
      if (Math.random() < 0.3) {   // spell a short word
        const w = pick(["SOS", "HELP", "CAMP", "WATER", "NORTH", "BASE", "MEDIC", "RALLY"]);
        const right = [...w].map((c) => NATO[c]).join(" ");
        // Wrong answers: the same word with one letter swapped.
        const wrong = new Set();
        for (let t = 0; t < 40 && wrong.size < 3; t++) {
          const i = Math.floor(Math.random() * w.length), x = [...w].map((c, j) => NATO[j === i ? pick(letters) : c]).join(" ");
          if (x !== right) wrong.add(x);
        }
        return { q: `Spell <b>${w}</b> over the radio.`, a: right, wrong, explain: `${w}: ${right}.` };
      }
      const L = pick(letters), a = NATO[L];
      return { q: `<b class="tr-big">${L}</b>`, a, wrong: shuffle(letters.filter((x) => x !== L)).slice(0, 3).map((x) => NATO[x]), explain: `${L} is ${a}.` };
    }, `<div class="fk-h">NATO PHONETIC ALPHABET</div><p class="lib-note">Numbers: say NINER for 9, and each digit on its own ("one two five").</p>`);
    box.querySelector(".tr-card").insertAdjacentHTML("beforeend", `<div class="tr-table">${Object.entries(NATO).map(([k, v]) => `<span><b>${k}</b>${v}</span>`).join("")}</div>`);
  }

  // --------------------------------------------------- radio procedure

  const PROWORDS = [
    ["OVER", "I've finished; I'm waiting for your reply."], ["OUT", "I've finished; no reply is expected. (Never 'over and out'.)"],
    ["ROGER", "I have received your last message."], ["WILCO", "I have received your message, understand it, and will comply."],
    ["SAY AGAIN", "Repeat your last message (or the part named)."], ["I SPELL", "I'm going to spell the next word phonetically."],
    ["BREAK", "A pause between parts of a message."], ["WAIT", "I must pause for a few seconds."], ["WAIT OUT", "I must pause for longer; I'll call back."],
    ["READ BACK", "Repeat this message back to me exactly as you received it."], ["CORRECTION", "I made an error; this is the correct version."],
    ["AFFIRMATIVE", "Yes."], ["NEGATIVE", "No."], ["RADIO CHECK", "How do you hear me? (Answered, e.g., 'loud and clear')."],
    ["MAYDAY", "Distress: grave and immediate danger to life; said three times."], ["PAN-PAN", "Urgency: a serious situation, but not immediate danger to life."],
    ["SECURITÉ", "Safety: an important safety message (weather, hazards)."], ["SILENCE", "Stop transmitting: an emergency is on this channel."],
  ];
  function radio(box) {
    const sc = score("radio");
    quiz(box, sc, () => {
      const [w, m] = pick(PROWORDS);
      if (Math.random() < 0.5) return { q: `What does <b>${w}</b> mean?`, a: m, wrong: shuffle(PROWORDS.filter((p) => p[0] !== w)).slice(0, 3).map((p) => p[1]) };
      return { q: `Which word means: <i>${m}</i>`, a: w, wrong: shuffle(PROWORDS.filter((p) => p[0] !== w)).slice(0, 3).map((p) => p[0]), explain: `${w}: ${m}` };
    }, `<div class="fk-h">RADIO PROCEDURE WORDS</div><p class="lib-note">Think, press, pause, speak. Short, clear, and say who you're calling, then who you are: "BASE, THIS IS NOMAD, OVER."</p>`);
  }

  // ------------------------------------------------------- grid reading

  // A 1 km grid with a point: find its six-figure reference (eastings
  // first: "along the corridor, then up the stairs").
  function grid(box) {
    const sc = score("grid");
    quiz(box, sc, () => {
      const e0 = 10 + Math.floor(Math.random() * 80), n0 = 10 + Math.floor(Math.random() * 80);
      const px = Math.floor(Math.random() * 30), py = Math.floor(Math.random() * 30);   // tenths across 3 squares
      const E = e0 * 10 + px, N = n0 * 10 + py, ref = (v) => String(Math.floor(v / 10) % 100).padStart(2, "0") + (v % 10);
      const a = `${ref(E)} ${ref(N)}`;
      const W = 240, cell = 72, off = 24;
      let svg = `<svg class="tr-grid" viewBox="0 0 ${W + 10} ${W + 20}">`;
      for (let i = 0; i <= 3; i++) {
        svg += `<line x1="${off + i * cell}" y1="${off}" x2="${off + i * cell}" y2="${off + 3 * cell}"/><line x1="${off}" y1="${off + i * cell}" x2="${off + 3 * cell}" y2="${off + i * cell}"/>`;
        svg += `<text x="${off + i * cell}" y="${off + 3 * cell + 14}">${String((e0 + i) % 100).padStart(2, "0")}</text><text x="${off - 12}" y="${off + (3 - i) * cell + 4}">${String((n0 + i) % 100).padStart(2, "0")}</text>`;
      }
      const x = off + (px / 10) * cell, y = off + 3 * cell - (py / 10) * cell;
      svg += `<circle cx="${x}" cy="${y}" r="4"/><circle cx="${x}" cy="${y}" r="9" class="tr-ring"/></svg>`;
      const near = (d1, d2) => `${ref(E + d1)} ${ref(N + d2)}`;
      return { q: `What's the six-figure reference of the point?${svg}`, a, wrong: shuffle([near(0, 3), near(3, 0), `${ref(N)} ${ref(E)}`, near(-2, 1)].filter((x) => x !== a)),
               explain: `Along the corridor (easting ${ref(E)}), then up the stairs (northing ${ref(N)}): <b>${a}</b>. Each square is 1 km; the third digit is tenths (100 m).` };
    }, `<div class="fk-h">GRID REFERENCES</div>`);
  }

  // ------------------------------------------------ compass & pace count

  function compass(box) {
    const sc = score("compass");
    let paces = store.get("paces", 65);
    quiz(box, sc, () => {
      const kind = Math.random();
      if (kind < 0.4) {
        const b = Math.floor(Math.random() * 360), back = (b + 180) % 360, f = (v) => String(v).padStart(3, "0") + "°";
        return { q: `Your bearing is <b>${f(b)}</b>. What's the back bearing (the way home)?`, a: f(back),
                 wrong: [f((b + 90) % 360), f((b + 270) % 360), f((360 - b) % 360)].filter((x) => x !== f(back)), explain: "Add 180° (or take it away if over 180°)." };
      }
      if (kind < 0.7) {
        const pts = [["N", 0], ["NE", 45], ["E", 90], ["SE", 135], ["S", 180], ["SW", 225], ["W", 270], ["NW", 315]];
        const [n, d] = pick(pts);
        return { q: `Which bearing is <b>${n}</b>?`, a: d + "°", wrong: shuffle(pts.filter((p) => p[0] !== n)).slice(0, 3).map((p) => p[1] + "°") };
      }
      const m = pick([200, 300, 450, 600, 800]), right = Math.round((m / 100) * paces);
      return { q: `Your pace count is <b>${paces}</b> per 100 m. How many paces for <b>${m} m</b>?`, a: String(right),
               wrong: [String(Math.round(right * 1.25)), String(Math.round(right * 0.8)), String(right + paces)], explain: `${m / 100} × ${paces} = ${right}. Count every second step (left foot) on your own ground; slopes and mud take more.` };
    }, `<div class="fk-h">COMPASS & PACE COUNT</div><label class="md-in"><span>YOUR PACES PER 100 M (EVERY LEFT STEP)</span><input type="number" class="tr-paces" min="40" max="120"></label>`);
    const inp = box.querySelector(".tr-paces");
    inp.value = paces;
    inp.addEventListener("input", () => { paces = Math.max(40, Math.min(120, +inp.value || 65)); store.set("paces", paces); });
    inp.addEventListener("keydown", (e) => e.stopPropagation());
  }

  // --------------------------------------------------------- SALUTE

  const SALUTE = [["S", "Size", "How many? e.g. 6 people, 2 vehicles"], ["A", "Activity", "What are they doing? e.g. moving north on foot"],
    ["L", "Location", "Where? A grid reference or landmark"], ["U", "Unit / uniform", "Who? Clothing, markings, insignia"],
    ["T", "Time", "When did you see it (24-hour clock)"], ["E", "Equipment", "What do they carry or drive"]];
  function salute(box) {
    const sc = score("salute");
    const r = store.get("salute", {});
    quiz(box, sc, () => {
      const [l, n, d] = pick(SALUTE);
      if (Math.random() < 0.5) return { q: `In a SALUTE report, what does <b>${l}</b> stand for?`, a: n, wrong: shuffle(SALUTE.filter((x) => x[0] !== l)).slice(0, 3).map((x) => x[1]), explain: `${l}: ${n} · ${d}.` };
      return { q: `"${d}" goes under which letter?`, a: `${l} · ${n}`, wrong: shuffle(SALUTE.filter((x) => x[0] !== l)).slice(0, 3).map((x) => `${x[0]} · ${x[1]}`) };
    }, `<div class="fk-h">SALUTE REPORT</div><p class="lib-note">Report what you saw, quickly and completely. Fill one in below; copy it into a message or read it over the radio.</p>
      <div class="tr-salute">${SALUTE.map(([l, n, d]) => `<label class="md-in"><span>${l} · ${n.toUpperCase()}</span><input data-k="${l}" maxlength="80" placeholder="${escapeHtml(d)}"></label>`).join("")}</div>
      <div class="fk-row"><button class="solid tr-copy">⧉ COPY REPORT</button></div>`);
    box.querySelectorAll(".tr-salute input").forEach((i) => {
      i.value = r[i.dataset.k] || "";
      i.addEventListener("input", () => { r[i.dataset.k] = i.value; store.set("salute", r); });
      i.addEventListener("keydown", (e) => e.stopPropagation());
    });
    box.querySelector(".tr-copy").addEventListener("click", async () => {
      const text = "SALUTE REPORT\n" + SALUTE.map(([l, n]) => `${l} · ${n.toUpperCase()}: ${r[l] || "—"}`).join("\n");
      (await copyText(text)) ? Sound.found() : Sound.error();
    });
  }

  return { challenge, phonetic, radio, grid, compass, salute };
})();
