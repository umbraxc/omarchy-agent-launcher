// Umbra Wiki medic tools, the MEDIC tab's other pages: ASSESS (START
// triage, GCS and AVPU, normal vital signs by age), CALCULATE (burn area and
// Parkland fluids, child doses of paracetamol and ibuprofen, drip rate, oral
// rehydration, blood loss), PATIENT (a body chart, a timed log, and MIST and
// 9-line reports) and GUIDES (anaphylaxis, snakebite, heat and cold, splints,
// eyes, dental, wounds). All offline; nothing leaves this computer.
// Loaded after app.js (uses $, Sound, escapeHtml, copyText).
"use strict";

window.UmbraMedic = (() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem("umbra-medic-" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("umbra-medic-" + k, JSON.stringify(v)); } catch {} },
  };
  const pad = (n) => String(n).padStart(2, "0");
  const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const warn = (t) => `<p class="fk-warn">${t}</p>`;

  // ------------------------------------------------------------ ASSESS

  // START triage, one question at a time; and a tally for many casualties.
  const START = {
    walk: ["Can the person walk?", [["YES", "done:green"], ["NO", "breath"]]],
    breath: ["Are they breathing?", [["YES", "rate"], ["NO", "airway"]]],
    airway: ["Open the airway (tilt the head, lift the chin). Breathing now?", [["YES", "done:red"], ["NO", "done:black"]]],
    rate: ["Breaths per minute?", [["OVER 30", "done:red"], ["30 OR LESS", "perf"]]],
    perf: ["Radial (wrist) pulse present, and nail-bed colour back within 2 seconds?", [["YES", "mental"], ["NO", "done:red"]]],
    mental: ["Can they follow a simple command (squeeze my hand)?", [["YES", "done:yellow"], ["NO", "done:red"]]],
  };
  const TAG = {
    red: ["IMMEDIATE", "Life-threatening but can be saved: treat and evacuate first. Stop bleeding, open the airway."],
    yellow: ["DELAYED", "Serious but stable for now: treat after the red ones, keep checking."],
    green: ["MINOR", "The walking wounded: move them to one place; they can help."],
    black: ["EXPECTANT", "Not breathing after the airway was opened. Move on to those who can be saved."],
  };
  const GCS = {
    eyes: ["EYES", ["None", "To pain", "To voice", "Open on their own"]],
    verbal: ["VOICE", ["None", "Sounds only", "Wrong words", "Confused", "Oriented, makes sense"]],
    motor: ["MOVEMENT", ["None", "Extends to pain", "Bends abnormally", "Pulls away from pain", "Finds the pain", "Obeys commands"]],
  };
  const VITALS = [   // age, heart rate, breathing rate (typical resting ranges)
    ["Newborn (0–1 month)", "100–180", "30–60"], ["Infant (1–12 months)", "100–160", "30–50"], ["Toddler (1–2 years)", "98–140", "22–37"],
    ["Preschool (3–5)", "80–120", "20–28"], ["School age (6–11)", "75–118", "18–25"], ["Teen (12–15)", "60–100", "12–20"], ["Adult", "60–100", "12–20"],
  ];
  function assess(box) {
    let step = "walk";
    const tally = store.get("tally", { red: 0, yellow: 0, green: 0, black: 0 });
    const gcs = { eyes: 4, verbal: 5, motor: 6 };
    box.innerHTML = `<div class="fk-grid">
      <section class="fk-card md-triage"><div class="fk-h">TRIAGE · START</div>
        <p class="lib-note">For many casualties: 30 to 60 seconds each. Only stop to open an airway or stop major bleeding.</p>
        <div class="md-q"></div>
        <div class="md-tally">${Object.keys(TAG).map((k) => `<div class="md-t md-${k}"><b>${TAG[k][0]}</b><span class="md-n" data-k="${k}">0</span>
          <span><button class="ghost" data-k="${k}" data-d="-1">−</button><button class="ghost" data-k="${k}" data-d="1">+</button></span></div>`).join("")}</div>
        <div class="fk-row"><button class="ghost md-tally-reset">RESET COUNT</button></div>
      </section>
      <section class="fk-card"><div class="fk-h">GLASGOW COMA SCALE</div>
        ${Object.entries(GCS).map(([k, [name, opts]]) => `<div class="md-gcs"><small>${name}</small><div class="md-opts" data-k="${k}">${opts.map((o, i) =>
          `<button data-v="${i + 1}" title="${i + 1} · ${o}"><b>${i + 1}</b>${o}</button>`).join("")}</div></div>`).join("")}
        <div class="md-score"><b class="md-gcs-total">15</b><span class="md-gcs-say"></span></div>
        <div class="fk-h md-sub">AVPU · QUICK CHECK</div>
        <div class="md-avpu">${[["A", "Alert", "Eyes open, talking"], ["V", "Voice", "Responds when spoken to"], ["P", "Pain", "Responds only to pain"], ["U", "Unresponsive", "No response at all"]]
          .map(([l, n, d]) => `<div><b>${l}</b><span>${n}<small>${d}</small></span></div>`).join("")}</div>
        ${warn("P or U: about a GCS of 8 or less. Protect the airway: recovery position if breathing, and get help.")}
      </section>
      <section class="fk-card"><div class="fk-h">NORMAL VITAL SIGNS</div>
        <table class="fk-ranges md-vitals"><tr><th>AGE</th><th>PULSE</th><th>BREATHS</th></tr>${VITALS.map(([a, h, r]) => `<tr><td>${a}</td><td>${h}</td><td>${r}</td></tr>`).join("")}</table>
        <p class="lib-note">Adults: oxygen saturation 95–100%, blood pressure around 90–120 over 60–80, temperature 36.1–37.2 °C. Typical resting ranges: a scared or feverish person runs higher.</p>
      </section></div>`;
    const q = box.querySelector(".md-q");
    const ask = () => {
      if (step.startsWith("done:")) {
        const k = step.slice(5);
        q.innerHTML = `<div class="md-tag md-${k}"><b>${TAG[k][0]}</b><p>${TAG[k][1]}</p></div>
          <div class="fk-row"><button class="solid md-count">COUNT + NEXT CASUALTY ▸</button><button class="ghost md-again">START OVER</button></div>`;
        q.querySelector(".md-count").addEventListener("click", () => { tally[k]++; store.set("tally", tally); showTally(); step = "walk"; ask(); Sound.found(); });
        q.querySelector(".md-again").addEventListener("click", () => { step = "walk"; ask(); Sound.click(); });
        k === "red" || k === "black" ? Sound.error() : Sound.found();
        return;
      }
      const [text, answers] = START[step];
      q.innerHTML = `<p class="md-ask">${text}</p><div class="fk-row">${answers.map(([a, next]) => `<button class="ghost md-a" data-n="${next}">${a}</button>`).join("")}</div>`;
      q.querySelectorAll(".md-a").forEach((b) => b.addEventListener("click", () => { step = b.dataset.n; ask(); Sound.click(); }));
    };
    const showTally = () => box.querySelectorAll(".md-n").forEach((n) => (n.textContent = tally[n.dataset.k]));
    box.querySelectorAll(".md-tally button[data-d]").forEach((b) => b.addEventListener("click", () => {
      tally[b.dataset.k] = Math.max(0, tally[b.dataset.k] + +b.dataset.d); store.set("tally", tally); showTally(); Sound.click();
    }));
    box.querySelector(".md-tally-reset").addEventListener("click", () => { Object.keys(tally).forEach((k) => (tally[k] = 0)); store.set("tally", tally); showTally(); Sound.click(); });
    ask(); showTally();
    const showGcs = () => {
      box.querySelectorAll(".md-opts").forEach((o) => o.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.v === gcs[o.dataset.k])));
      const t = gcs.eyes + gcs.verbal + gcs.motor;
      box.querySelector(".md-gcs-total").textContent = t;
      box.querySelector(".md-gcs-say").textContent = t <= 8 ? "SEVERE · protect the airway, urgent help" : t <= 12 ? "MODERATE · watch closely, get help" : "MILD · keep checking every 15 minutes";
      box.querySelector(".md-score").className = "md-score " + (t <= 8 ? "bad" : t <= 12 ? "mid" : "");
    };
    box.querySelectorAll(".md-opts button").forEach((b) => b.addEventListener("click", () => { gcs[b.closest(".md-opts").dataset.k] = +b.dataset.v; showGcs(); Sound.click(); }));
    showGcs();
  }

  // --------------------------------------------------------- CALCULATE

  // Body areas for burns (rule of nines), adult and child (head bigger, legs smaller).
  const NINES = {
    adult: [["Head & neck", 9], ["Chest", 9], ["Belly", 9], ["Upper back", 9], ["Lower back & buttocks", 9], ["Left arm", 9], ["Right arm", 9],
            ["Left leg, front", 9], ["Left leg, back", 9], ["Right leg, front", 9], ["Right leg, back", 9], ["Groin", 1]],
    child: [["Head & neck", 18], ["Chest & belly", 18], ["Back", 18], ["Left arm", 9], ["Right arm", 9], ["Left leg", 14], ["Right leg", 14]],
  };
  const DRUGS = {
    paracetamol: { name: "Paracetamol (acetaminophen)", perKg: 15, maxDose: 1000, every: "every 4–6 hours", perDay: 4,
      liquids: [["120 mg / 5 ml", 24], ["160 mg / 5 ml", 32], ["250 mg / 5 ml", 50]], note: "Never more than 4 doses in 24 hours. Many cold and flu remedies also contain paracetamol: count them too." },
    ibuprofen: { name: "Ibuprofen", perKg: 10, maxDose: 400, every: "every 6–8 hours", perDay: 3,
      liquids: [["100 mg / 5 ml", 20], ["200 mg / 5 ml", 40]], note: "With food or milk. Not for babies under 3 months or 5 kg, nor with dehydration, asthma made worse by it, or bleeding problems." },
  };
  function calculate(box) {
    const s = store.get("calc", { age: "adult", burns: [], weight: 70, drug: "paracetamol", liquid: 0, vol: 1000, hours: 8, drop: 20, kidKg: 15 });
    const save = () => store.set("calc", s);
    box.innerHTML = `<div class="fk-grid">
      <section class="fk-card"><div class="fk-h">BURN AREA · PARKLAND</div>
        <div class="fk-seg pf-choice md-age"><button data-a="adult">ADULT</button><button data-a="child">CHILD</button></div>
        <p class="lib-note">Tick the areas with deep or blistered burns (not just red skin). A patient's palm with fingers is about 1%.</p>
        <div class="md-areas"></div>
        <div class="md-score"><b class="md-tbsa">0%</b><span>of the body</span></div>
        <label class="md-in"><span>WEIGHT KG</span><input type="number" class="md-kg" min="1" max="250"></label>
        <div class="md-out md-park"></div>
        ${warn("Cool the burn with running water for 20 minutes first. Over 10% in a child or 20% in an adult, or any burn to the face, hands, groin or airway: this is an emergency. Fluids by drip are for trained hands.")}
      </section>
      <section class="fk-card"><div class="fk-h">CHILD DOSE · BY WEIGHT</div>
        <div class="fk-seg pf-choice md-drug">${Object.entries(DRUGS).map(([k, d]) => `<button data-d="${k}">${d.name.split(" ")[0].toUpperCase()}</button>`).join("")}</div>
        <label class="md-in"><span>CHILD'S WEIGHT KG</span><input type="number" class="md-kid" min="3" max="60" step="0.5"></label>
        <label class="md-in"><span>OR AGE, TO GUESS IT</span><input type="number" class="md-kid-age" min="1" max="10" placeholder="1–10 years"></label>
        <div class="md-liquids"></div>
        <div class="md-out md-dose"></div>
        ${warn("Check the dose on the package and follow it if it differs. Use the measuring syringe that came with it. Under 3 months, or if unsure: ask a doctor or pharmacist.")}
      </section>
      <section class="fk-card"><div class="fk-h">DRIP RATE</div>
        <div class="md-row3"><label class="md-in"><span>VOLUME ML</span><input type="number" class="md-vol" min="10" max="5000"></label>
          <label class="md-in"><span>OVER HOURS</span><input type="number" class="md-hrs" min="0.25" max="48" step="0.25"></label></div>
        <div class="md-in"><span>DROPS PER ML (ON THE SET)</span><div class="fk-seg pf-choice md-drops">${[10, 15, 20, 60].map((d) => `<button data-d="${d}">${d}</button>`).join("")}</div></div>
        <div class="md-out md-drip"></div>
        <div class="fk-h md-sub">ORAL REHYDRATION SALTS</div>
        <p class="md-recipe"><b>1 litre</b> clean water · <b>6 level teaspoons</b> sugar · <b>½ level teaspoon</b> salt. Stir until dissolved.
          Sip often: a child 50–100 ml after each loose stool. Too salty (saltier than tears)? Add water.</p>
        <div class="fk-h md-sub">BLOOD LOSS · SIGNS</div>
        <table class="fk-ranges md-loss"><tr><th>LOST</th><th>SIGNS</th></tr>
          <tr><td>Under 15%</td><td>Few signs; pulse normal</td></tr><tr><td>15–30%</td><td>Pulse over 100, anxious, pale, cool</td></tr>
          <tr><td>30–40%</td><td>Pulse over 120, fast breathing, confused, low blood pressure</td></tr>
          <tr><td>Over 40%</td><td>Pulse over 140, drowsy, grey: life-threatening</td></tr></table>
      </section></div>`;
    const q = (x) => box.querySelector(x);
    const seg = (sel, key, attr, after) => {
      const show = () => box.querySelectorAll(sel + " button").forEach((b) => b.classList.toggle("on", String(s[key]) === b.dataset[attr]));
      box.querySelectorAll(sel + " button").forEach((b) => b.addEventListener("click", () => { s[key] = isNaN(+b.dataset[attr]) ? b.dataset[attr] : +b.dataset[attr]; show(); after(); save(); Sound.click(); }));
      show();
    };
    // Burns.
    const areas = () => {
      q(".md-areas").innerHTML = NINES[s.age].map(([n, p], i) => `<label class="fk-check"><input type="checkbox" data-i="${i}" ${s.burns.includes(i) ? "checked" : ""}> ${n} <small>${p}%</small></label>`).join("");
      q(".md-areas").querySelectorAll("input").forEach((c) => c.addEventListener("change", () => {
        s.burns = [...q(".md-areas").querySelectorAll("input:checked")].map((x) => +x.dataset.i); burns(); save(); Sound.click();
      }));
      burns();
    };
    const burns = () => {
      const pct = s.burns.reduce((n, i) => n + (NINES[s.age][i] ? NINES[s.age][i][1] : 0), 0);
      q(".md-tbsa").textContent = pct + "%";
      const ml = 4 * (s.weight || 0) * pct;
      q(".md-park").innerHTML = pct && s.weight ? `<b>${Math.round(ml)} ml</b> over 24 hours from the time of the burn (4 ml × kg × %):
        <b>${Math.round(ml / 2)} ml</b> in the first 8 hours (${Math.round(ml / 16)} ml/h), then ${Math.round(ml / 2)} ml over 16 hours (${Math.round(ml / 32)} ml/h).
        Adjust to urine output (adult about 0.5 ml/kg/h).` : "Tick the burnt areas and give the weight.";
      q(".md-score").classList.toggle("bad", pct >= (s.age === "child" ? 10 : 20));
    };
    seg(".md-age", "age", "a", () => { s.burns = []; areas(); });
    q(".md-kg").value = s.weight;
    q(".md-kg").addEventListener("input", (e) => { s.weight = +e.target.value || 0; burns(); save(); });
    areas();
    // Child dosing.
    const liquids = () => {
      const d = DRUGS[s.drug];
      q(".md-liquids").innerHTML = `<div class="md-in"><span>LIQUID ON THE BOTTLE</span><div class="fk-seg pf-choice">${d.liquids.map(([n], i) => `<button data-l="${i}" class="${i === s.liquid ? "on" : ""}">${n}</button>`).join("")}</div></div>`;
      q(".md-liquids").querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { s.liquid = +b.dataset.l; liquids(); save(); Sound.click(); }));
      dose();
    };
    const dose = () => {
      // liquids: [label, mg per ml]
      const d = DRUGS[s.drug], kg = s.kidKg || 0, [lname, mgPerMl] = d.liquids[Math.min(s.liquid, d.liquids.length - 1)];
      const mg = Math.min(d.maxDose, Math.round(d.perKg * kg));
      const mlReal = Math.round((mg / mgPerMl) * 10) / 10;
      q(".md-dose").innerHTML = !kg ? "Give the weight (or the age to estimate it)." : s.drug === "ibuprofen" && kg < 5
        ? "<b>Not for children under 5 kg.</b> Ask a doctor." :
        `<b>${mg} mg</b> per dose (${d.perKg} mg/kg) = <b>${mlReal} ml</b> of ${lname}, ${d.every}, at most ${d.perDay} doses in 24 hours. ${d.note}`;
    };
    seg(".md-drug", "drug", "d", () => { s.liquid = 0; liquids(); });
    q(".md-kid").value = s.kidKg;
    q(".md-kid").addEventListener("input", (e) => { s.kidKg = +e.target.value || 0; q(".md-kid-age").value = ""; dose(); save(); });
    q(".md-kid-age").addEventListener("input", (e) => {
      const a = +e.target.value;
      if (a >= 1 && a <= 10) { s.kidKg = (a + 4) * 2; q(".md-kid").value = s.kidKg; dose(); save(); }
    });
    liquids();
    // Drip.
    const drip = () => {
      const min = s.hours * 60, gtt = min ? (s.vol * s.drop) / min : 0;
      q(".md-drip").innerHTML = gtt ? `<b>${Math.round(gtt)} drops a minute</b> · one drop every ${(60 / gtt).toFixed(1)} s · ${Math.round(s.vol / s.hours)} ml an hour` : "";
    };
    q(".md-vol").value = s.vol; q(".md-hrs").value = s.hours;
    q(".md-vol").addEventListener("input", (e) => { s.vol = +e.target.value || 0; drip(); save(); });
    q(".md-hrs").addEventListener("input", (e) => { s.hours = +e.target.value || 0; drip(); save(); });
    seg(".md-drops", "drop", "d", drip);
    drip();
  }

  // ----------------------------------------------------------- PATIENT

  // A simple front/back figure (SVG) whose regions can be marked with an
  // injury; a timed log of observations and treatments; and the handover
  // reports: MIST and a 9-line MEDEVAC request.
  const REGIONS = [   // id, name, front path/shape
    ["head", "Head", "M50 6a11 11 0 1 1 0 22a11 11 0 1 1 0-22z"], ["neck", "Neck", "M45 28h10v7H45z"],
    ["chest", "Chest", "M34 35h32v22H34z"], ["belly", "Belly", "M36 57h28v20H36z"], ["pelvis", "Pelvis", "M36 77h28v10H36z"],
    ["larm", "Left arm", "M66 36l9 3l6 40h-8l-7-30z"], ["rarm", "Right arm", "M34 36l-9 3l-6 40h8l7-30z"],
    ["lhand", "Left hand", "M73 79h9v9h-9z"], ["rhand", "Right hand", "M18 79h9v9h-9z"],
    ["lleg", "Left leg", "M51 87h13l-2 60h-9z"], ["rleg", "Right leg", "M36 87h13l-2 60h-9z"],
    ["lfoot", "Left foot", "M53 147h10v6H53z"], ["rfoot", "Right foot", "M37 147h10v6H37z"],
  ];
  const HURT = { bleed: ["Bleeding", "#d8412f"], burn: ["Burn", "#e8892a"], break: ["Fracture", "#9b6ae0"], wound: ["Wound", "#e0b83a"], pain: ["Pain", "#2fa7c4"] };
  function patient(box) {
    const p = store.get("patient", { name: "", age: "", sex: "", mech: "", marks: {}, log: [], nine: {} });
    const save = () => store.set("patient", p);
    let brush = "bleed";
    box.innerHTML = `<div class="fk-grid">
      <section class="fk-card"><div class="fk-h">PATIENT</div>
        <div class="md-row3"><label class="md-in"><span>NAME / ID</span><input class="md-p-name" maxlength="40"></label>
          <label class="md-in"><span>AGE</span><input class="md-p-age" maxlength="10"></label>
          <label class="md-in"><span>SEX</span><input class="md-p-sex" maxlength="10"></label></div>
        <label class="md-in"><span>WHAT HAPPENED (MECHANISM)</span><input class="md-p-mech" maxlength="120" placeholder="e.g. fell 3 m from a ladder at 14:20"></label>
        <div class="md-in"><span>MARK INJURIES: PICK ONE, THEN CLICK THE BODY</span><div class="md-brush">${Object.entries(HURT).map(([k, [n, c]]) =>
          `<button data-k="${k}" style="--hc:${c}"><i></i>${n.toUpperCase()}</button>`).join("")}<button data-k="" style="--hc:var(--faint)"><i></i>CLEAR</button></div></div>
        <div class="md-bodies"><svg viewBox="0 0 100 166" class="md-body" data-side="front"></svg><svg viewBox="0 0 100 166" class="md-body" data-side="back"></svg></div>
        <div class="md-marks"></div>
      </section>
      <section class="fk-card"><div class="fk-h">LOG · WITH TIMES</div>
        <div class="md-row3"><label class="md-in"><span>PULSE</span><input class="md-l-p" type="number"></label>
          <label class="md-in"><span>BREATHS</span><input class="md-l-r" type="number"></label>
          <label class="md-in"><span>AVPU</span><input class="md-l-a" maxlength="1" placeholder="A V P U"></label></div>
        <label class="md-in"><span>TREATMENT OR NOTE</span><input class="md-l-n" maxlength="120" placeholder="e.g. tourniquet right thigh; 1 g paracetamol"></label>
        <div class="fk-row"><button class="solid md-l-add">+ LOG NOW</button><button class="ghost md-new">NEW PATIENT</button></div>
        <div class="md-log"></div>
      </section>
      <section class="fk-card"><div class="fk-h">HANDOVER</div>
        <div class="fk-seg pf-choice md-rep"><button data-r="mist">MIST</button><button data-r="nine">9-LINE MEDEVAC</button></div>
        <div class="md-nine"></div>
        <pre class="md-report"></pre>
        <div class="fk-row"><button class="solid md-copy">⧉ COPY REPORT</button></div>
      </section></div>`;
    const q = (x) => box.querySelector(x);
    for (const k of ["name", "age", "sex", "mech"]) {
      q(".md-p-" + k).value = p[k] || "";
      q(".md-p-" + k).addEventListener("input", (e) => { p[k] = e.target.value; save(); report(); });
    }
    const brushes = () => box.querySelectorAll(".md-brush button").forEach((b) => b.classList.toggle("on", b.dataset.k === brush));
    box.querySelectorAll(".md-brush button").forEach((b) => b.addEventListener("click", () => { brush = b.dataset.k; brushes(); Sound.click(); }));
    brushes();
    const bodies = () => {
      box.querySelectorAll(".md-body").forEach((svg) => {
        const side = svg.dataset.side;
        // Seen from behind, the patient's left is on the viewer's left: mirrored.
        svg.innerHTML = `<text x="50" y="163" class="md-side">${side === "front" ? "FRONT · THEIR LEFT →" : "← THEIR LEFT · BACK"}</text>
          <g ${side === "back" ? 'transform="translate(100 0) scale(-1 1)"' : ""}>` + REGIONS.map(([id, name, d]) => {
          const key = side + ":" + id, mark = p.marks[key];
          return `<path d="${d}" data-k="${key}" style="${mark ? `fill:${HURT[mark][1]}` : ""}"><title>${name} (${side})${mark ? " · " + HURT[mark][0] : ""}</title></path>`;
        }).join("") + "</g>";
        svg.querySelectorAll("path").forEach((el) => el.addEventListener("click", () => {
          if (brush) p.marks[el.dataset.k] = brush; else delete p.marks[el.dataset.k];
          save(); bodies(); report(); Sound.click();
        }));
      });
      const list = Object.entries(p.marks).map(([k, m]) => { const [side, id] = k.split(":"); return `${HURT[m][0]}: ${(REGIONS.find((r) => r[0] === id) || [])[1]} (${side})`; });
      q(".md-marks").textContent = list.length ? list.join(" · ") : "No injuries marked.";
    };
    bodies();
    const log = () => {
      q(".md-log").innerHTML = p.log.length ? p.log.slice().reverse().map((e) => `<div class="md-entry"><b>${hhmm(e.t)}</b><span>${escapeHtml(
        [e.p && `P ${e.p}`, e.r && `R ${e.r}`, e.a && `AVPU ${e.a}`, e.n].filter(Boolean).join(" · "))}</span></div>`).join("") : `<p class="lib-note">Nothing logged yet. Note the time of every check and treatment: the next person needs it.</p>`;
    };
    q(".md-l-add").addEventListener("click", () => {
      const e = { t: Date.now(), p: q(".md-l-p").value, r: q(".md-l-r").value, a: q(".md-l-a").value.toUpperCase().slice(0, 1), n: q(".md-l-n").value.trim() };
      if (!e.p && !e.r && !e.a && !e.n) { Sound.error(); return; }
      p.log.push(e); save(); log(); report();
      ["p", "r", "a", "n"].forEach((k) => (q(".md-l-" + k).value = ""));
      Sound.found();
    });
    q(".md-new").addEventListener("click", async () => {
      const ok = await confirmDialog({ kind: "to-local", tag: "PATIENT", title: "START A NEW PATIENT?", body: "The chart and log on screen are cleared. Copy the report first if you need it.", ok: "NEW PATIENT", cancel: "KEEP" });
      if (!ok) return;
      Object.assign(p, { name: "", age: "", sex: "", mech: "", marks: {}, log: [], nine: {} }); save(); patient(box);
    });
    log();
    // Reports.
    let rep = "mist";
    const NINE = [
      ["1", "Pickup location (grid)", "text", ""], ["2", "Radio frequency, callsign", "text", ""],
      ["3", "Patients by precedence", "text", "e.g. 1A (A urgent, B urgent-surgical, C priority, D routine)"],
      ["4", "Special equipment", "sel", ["A · None", "B · Hoist", "C · Extraction", "D · Ventilator"]],
      ["5", "Patients by type", "text", "e.g. 1L (L litter, A walking)"],
      ["6", "Security at pickup", "sel", ["N · No enemy", "P · Possible enemy", "E · Enemy in area", "X · Armed escort needed"]],
      ["7", "Marking of pickup site", "sel", ["A · Panels", "B · Pyrotechnic", "C · Smoke", "D · None", "E · Other"]],
      ["8", "Patient nationality and status", "text", "e.g. D (civilian)"],
      ["9", "Contamination / terrain", "text", "e.g. none; flat field, power lines north"],
    ];
    const nine = () => {
      q(".md-nine").hidden = rep !== "nine";
      if (rep !== "nine") return;
      q(".md-nine").innerHTML = NINE.map(([n, label, type, opt]) => `<label class="md-in md-line"><span>LINE ${n} · ${label.toUpperCase()}</span>${type === "sel"
        ? `<select data-n="${n}">${opt.map((o) => `<option ${p.nine[n] === o ? "selected" : ""}>${o}</option>`).join("")}</select>`
        : `<input data-n="${n}" maxlength="60" placeholder="${escapeHtml(opt)}">`}</label>`).join("");
      q(".md-nine").querySelectorAll("[data-n]").forEach((el) => {
        if (el.tagName === "INPUT") el.value = p.nine[el.dataset.n] || "";
        el.addEventListener("input", () => { p.nine[el.dataset.n] = el.value; save(); report(); });
      });
      const grid = q('.md-nine input[data-n="1"]');
      if (!grid.value && window.UmbraProfile && window.UmbraMaps) grid.placeholder = "MGRS of the pickup point";
    };
    const report = () => {
      const marks = Object.entries(p.marks).map(([k, m]) => { const [side, id] = k.split(":"); return `${HURT[m][0]} ${(REGIONS.find((r) => r[0] === id) || [])[1]} (${side})`; });
      const last = p.log[p.log.length - 1] || {};
      const treat = p.log.filter((e) => e.n).map((e) => `${hhmm(e.t)} ${e.n}`);
      const text = rep === "mist" ? [
        `MIST HANDOVER · ${hhmm(Date.now())}`, `PATIENT: ${[p.name, p.age, p.sex].filter(Boolean).join(", ") || "unknown"}`,
        `M  MECHANISM: ${p.mech || "—"}`, `I  INJURIES: ${marks.join("; ") || "—"}`,
        `S  SIGNS: ${[last.p && `pulse ${last.p}`, last.r && `breaths ${last.r}`, last.a && `AVPU ${last.a}`].filter(Boolean).join(", ") || "—"}${last.t ? ` (at ${hhmm(last.t)})` : ""}`,
        `T  TREATMENT: ${treat.join("; ") || "—"}`,
      ] : ["9-LINE MEDEVAC REQUEST", ...NINE.map(([n, label, type, opt]) => `LINE ${n}: ${p.nine[n] || (type === "sel" ? opt[0] : "—")}`)];
      q(".md-report").textContent = text.join("\n");
    };
    box.querySelectorAll(".md-rep button").forEach((b) => b.addEventListener("click", () => {
      rep = b.dataset.r; box.querySelectorAll(".md-rep button").forEach((x) => x.classList.toggle("on", x === b)); nine(); report(); Sound.click();
    }));
    box.querySelector('.md-rep button[data-r="mist"]').classList.add("on");
    q(".md-copy").addEventListener("click", async () => { (await copyText(q(".md-report").textContent)) ? Sound.found() : Sound.error(); });
    nine(); report();
  }

  // ------------------------------------------------------------ GUIDES

  const GUIDES = [
    ["Anaphylaxis & auto-injector", "#e0493f", [
      "Signs: swelling of lips, tongue or throat; wheeze; hives; feeling faint after a sting, food or medicine.",
      "Call emergency services. Use the auto-injector at once: <b>blue to the sky, orange to the thigh</b>.",
      "Press hard into the outer thigh (through clothes) until it clicks; <b>hold for 3 seconds</b>; rub the spot.",
      "Lie them down with legs raised; sitting up if breathing is hard. Don't let them stand or walk.",
      "No better after 5 minutes? A <b>second injector</b> if there is one. Start CPR if they stop breathing normally."]],
    ["Snakebite", "#4fb86a", [
      "Move away from the snake; don't try to catch it. A photo from a safe distance helps.",
      "Keep the person <b>still and calm</b>; remove rings and watches before swelling starts.",
      "Keep the limb still, like a fracture, at about heart level. Mark the edge of any swelling with the time.",
      "<b>Don't</b> cut, suck, use a tourniquet, ice or electricity. Don't give alcohol.",
      "Get to a hospital; antivenom is the treatment. (In Australia: a firm pressure bandage over the whole limb.)"]],
    ["Heat: exhaustion to stroke", "#e8892a", [
      "<b>Exhaustion</b>: heavy sweating, pale, dizzy, headache, cramps. Shade, lie down, loosen clothing, sip water or rehydration drink.",
      "<b>Heatstroke</b>: hot skin (sweating may stop), confusion, fits, collapse. Emergency.",
      "Cool fast: cold water on the whole body, wet sheets and fanning, ice packs in armpits, groin and neck.",
      "Recovery position if drowsy; nothing to drink if not fully awake. Keep cooling until help arrives."]],
    ["Cold: hypothermia stages", "#36aec8", [
      "<b>Mild</b> (35–32 °C): shivering, clumsy, grumpy. Shelter, dry clothes, warm sweet drinks, move a little.",
      "<b>Moderate</b> (32–28 °C): shivering stops, confused, drowsy. Handle gently, keep flat, insulate from the ground, warm the trunk first.",
      "<b>Severe</b> (below 28 °C): unconscious, slow or no breathing. Check breathing for a full minute before CPR; handle very gently.",
      "Never rub limbs or use very hot water. 'Not dead until warm and dead.'"]],
    ["Splinting a fracture", "#a77ce8", [
      "Stop any bleeding first; cover open wounds. Don't push bone ends back.",
      "Splint <b>as found</b>: immobilise the joint above and the joint below the break.",
      "Pad the splint (sticks, rolled magazines, a pillow) and tie it on firmly, not tight; knots on the splint side.",
      "Check fingers or toes before and after: warm, pink, can feel and move. If not, loosen.",
      "A sling for the arm; for a leg, strap it to the good leg. Raise if possible and apply cold."]],
    ["Eye injuries", "#d9b235", [
      "Chemicals: rinse with running water for at least 20 minutes, from the nose side outwards.",
      "Grit: blink under water or rinse; lift the upper lid over the lower. Don't rub.",
      "Something stuck in the eye: <b>don't remove it</b>. Cover both eyes (they move together) and get help."]],
    ["Wounds & infection", "#e0493f", [
      "Bleeding first: firm direct pressure for 10 minutes; tourniquet for life-threatening limb bleeding.",
      "Clean with plenty of clean (boiled, cooled) water. Remove dirt; don't close dirty or deep wounds.",
      "Cover with a clean dressing; change daily. Tetanus jab if the last was over 10 years ago.",
      "Infection: spreading redness, heat, pus, red streaks, fever. Red streaks or fever need a doctor soon."]],
    ["Teeth", "#8a93a6", [
      "Knocked-out adult tooth: hold by the crown, rinse briefly, push back into the socket and bite on cloth.",
      "Can't put it back: keep it in milk or in the cheek; see a dentist within the hour.",
      "Toothache: clove oil on the gum, painkillers, salt-water rinses. Swelling of the face with fever: see a doctor."]],
  ];
  function guides(box) {
    box.innerHTML = `<div class="md-guides">${GUIDES.map(([title, color, steps]) => `<section class="fk-card md-guide" style="--cat:color-mix(in oklab, ${color} 78%, var(--fg))">
      <div class="fk-h">${escapeHtml(title.toUpperCase())}</div><ol>${steps.map((s) => `<li>${s}</li>`).join("")}</ol></section>`).join("")}</div>
      ${warn("Quick reminders, not training. Call emergency services when you can; the field manual in the Library has more.")}`;
  }

  return { assess, calculate, patient, guides };
})();
