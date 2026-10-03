// Umbra Wiki scenario drills, the first page of Field Kit › TRAINING:
// short situations told in steps ("Grid down, day 3, the tap runs dry…").
// Each step offers choices; each choice has a consequence and a score. At
// the end comes a debrief: what was right, what was risky, the Field Manual
// page to read, and Umbra's own debrief in the chat if wanted.
// Three levels: RECRUIT (feedback after every choice), VETERAN (feedback
// only at the end) and HARDCORE (a clock on every decision, one surprise
// complication, feedback only at the end).
// Each drill is staged in a 3D ASCII scene from scenery-lib.js.
// Loaded after app.js, ascii3d.js and scenery-lib.js.
"use strict";

window.UmbraDrills = (() => {
  const esc = (s) => escapeHtml(String(s ?? ""));
  const calm = () => document.body.classList.contains("reduce-motion") || window.offgrid;
  const GROUPS = [["everyday", "EVERYDAY"], ["outdoors", "OUTDOORS"], ["emergency", "EMERGENCY"], ["fiction", "FICTION"]];
  const LEVELS = [["recruit", "RECRUIT", "Feedback after every choice. Learn as you go."],
    ["veteran", "VETERAN", "No feedback until the debrief. Trust your judgement."],
    ["hardcore", "HARDCORE", "20 seconds a decision, one surprise complication, debrief at the end."]];
  const SECONDS = 20;
  let data = null, progress = { drills: {} }, level = "recruit", picked = null;
  let stopArt = null, timer = 0, keyFn = null;
  const store = { get(k, d) { try { const v = localStorage.getItem("umbra-drills-" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("umbra-drills-" + k, JSON.stringify(v)); } catch {} } };
  level = store.get("level", "recruit");

  async function load() {
    if (!data) data = await fetch("drills.json").then((r) => r.json()).catch(() => ({ drills: [], complications: [] }));
    progress = await fetch("/api/drills").then((r) => r.json()).catch(() => ({ drills: {} }));
  }
  const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const medal = (s) => (s >= 100 ? ["◆", "PERFECT", "perfect"] : s >= 80 ? ["★", "STRONG", "gold"] : s >= 50 ? ["☆", "SURVIVED", "silver"] : s > 0 ? ["·", "TRY AGAIN", "bronze"] : ["", "NOT PLAYED", "none"]);

  // The scene behind a drill: a live 3D ASCII view, or still in calm mode.
  function stage(canvas, drill) {
    stopArt?.(); stopArt = null;
    const sc = window.UmbraScenery?.scenes?.[drill.scene] || window.UmbraScenery?.scenes?.campfire;
    if (!sc || !window.Ascii3D) return;
    try { const v = Ascii3D.view(canvas, sc.build(), { cell: 7 }); stopArt = () => v.stop(); } catch {}
  }
  function cleanup() { stopArt?.(); stopArt = null; clearInterval(timer); if (keyFn) document.removeEventListener("keydown", keyFn, true); keyFn = null; }

  // --------------------------------------------------------- the picker
  async function render(box) {
    cleanup();
    box.innerHTML = `<div class="dr-wrap"><p class="lib-note">Loading the drills…</p></div>`;
    await load();
    if (!box.isConnected) return;
    if (!picked || !data.drills.find((d) => d.id === picked)) picked = data.drills[0]?.id;
    const done = Object.keys(progress.drills || {}).length;
    box.innerHTML = `<div class="dr-wrap">
      <div class="dr-hero"><canvas class="dr-art"></canvas><div class="dr-hero-shade"></div>
        <div class="dr-hero-text"><small class="dr-time"></small><h2 class="dr-name"></h2><p class="dr-brief"></p>
          <div class="dr-hero-actions"><button type="button" class="solid dr-go">▶ START DRILL</button><span class="dr-best"></span></div></div></div>
      <div class="dr-bar"><div class="pf-choice dr-levels">${LEVELS.map(([k, n, hint]) => `<button type="button" data-l="${k}" title="${esc(n)}|${esc(hint)}">${n}</button>`).join("")}</div>
        <small class="dr-level-hint"></small>
        <span class="dr-stats"><small>DRILLS DONE</small><b>${done}<i>/${data.drills.length}</i></b><small>RUNS</small><b>${progress.done || 0}</b><small>PERFECT</small><b>${progress.perfect || 0}</b></span></div>
      ${GROUPS.map(([g, label]) => {
        const list = data.drills.filter((d) => d.group === g);
        return list.length ? `<div class="dr-group"><div class="lib-head"><span>${label}</span><b>${list.length}</b></div><div class="dr-grid">${list.map((d) => {
          const best = progress.drills?.[d.id]?.best || 0, [m, mt, mc] = medal(best);
          return `<button type="button" class="dr-card ${d.id === picked ? "on" : ""} m-${mc}" data-id="${esc(d.id)}"><small>${esc(d.time.split("·")[0].trim())}</small><b>${esc(d.name)}</b>
            <span class="dr-medal">${m ? `${m} ${best}% · ${mt}` : "NEW"}</span></button>`; }).join("")}</div></div>` : "";
      }).join("")}
      <p class="lib-note dr-note">Drills follow the Field Manual and common first-aid guidance. They train judgement; in a real emergency, call your local emergency number.</p></div>`;
    const showLevel = () => {
      box.querySelectorAll(".dr-levels button").forEach((b) => b.classList.toggle("on", b.dataset.l === level));
      box.querySelector(".dr-level-hint").textContent = LEVELS.find(([k]) => k === level)[2];
    };
    box.querySelectorAll(".dr-levels button").forEach((b) => b.addEventListener("click", () => { level = b.dataset.l; store.set("level", level); showLevel(); Sound.click(); }));
    showLevel();
    const show = (id, quiet) => {
      picked = id;
      const d = data.drills.find((x) => x.id === id);
      box.querySelectorAll(".dr-card").forEach((c) => c.classList.toggle("on", c.dataset.id === id));
      box.querySelector(".dr-time").textContent = d.time;
      box.querySelector(".dr-name").textContent = d.name.toUpperCase();
      box.querySelector(".dr-brief").textContent = d.brief;
      const p = progress.drills?.[id];
      box.querySelector(".dr-best").textContent = p ? `BEST ${p.best}% · ${p.runs} RUN${p.runs > 1 ? "S" : ""}` : "NOT PLAYED YET";
      stage(box.querySelector(".dr-art"), d);
      if (!quiet) Sound.click();
    };
    box.querySelectorAll(".dr-card").forEach((c) => c.addEventListener("click", () => show(c.dataset.id)));
    box.querySelector(".dr-go").addEventListener("click", () => { Sound.click(); run(box, data.drills.find((x) => x.id === picked)); });
    show(picked, true);
  }

  // ---------------------------------------------------------- a run
  function run(box, drill) {
    cleanup();
    const nodes = drill.nodes, path = [];
    // Hardcore slips one complication in before the last decision.
    const decisions = Object.values(nodes).filter((n) => n.choices).length;
    const complication = level === "hardcore" ? data.complications[Math.floor(Math.random() * data.complications.length)] : null;
    let at = drill.start, step = 0, extraDone = false;
    box.innerHTML = `<div class="dr-wrap dr-run lv-${level}">
      <div class="dr-hero small"><canvas class="dr-art"></canvas><div class="dr-hero-shade"></div>
        <div class="dr-hero-text"><small class="dr-time">${esc(drill.time)}</small><h2>${esc(drill.name.toUpperCase())}</h2>
          <div class="dr-steps"></div></div>
        <button type="button" class="ghost dr-quit" title="Leave the drill|Back to the list; this run isn't scored.">✕ LEAVE</button></div>
      <div class="dr-clock" ${level === "hardcore" ? "" : "hidden"}><i></i></div>
      <div class="dr-q"><p class="dr-text"></p><div class="dr-choices"></div><div class="dr-fb" hidden></div></div></div>`;
    stage(box.querySelector(".dr-art"), drill);
    box.querySelector(".dr-quit").addEventListener("click", () => { Sound.click(); render(box); });
    const total = decisions + (complication ? 1 : 0);
    const steps = () => { box.querySelector(".dr-steps").innerHTML = Array.from({ length: total }, (_, i) => `<i class="${i < path.length ? (path[i].p >= 10 ? "good" : path[i].p > 0 ? "ok" : "bad") : i === path.length ? "now" : ""}"></i>`).join(""); };
    const typeIn = (el, text) => {
      if (calm()) { el.textContent = text; return; }
      let i = 0; el.textContent = "";
      const t = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(t); }, 14);
    };
    const ask = (node) => {
      steps();
      const q = box.querySelector(".dr-q");
      typeIn(q.querySelector(".dr-text"), node.text);
      const choices = shuffle(node.choices.map((c, i) => ({ ...c, i })));
      q.querySelector(".dr-choices").innerHTML = choices.map((c, k) => `<button type="button" class="dr-choice" data-k="${k}"><kbd>${k + 1}</kbd><span>${esc(c.t)}</span></button>`).join("");
      q.querySelector(".dr-fb").hidden = true;
      let answered = false;
      const answer = (c) => {
        if (answered) return;
        answered = true;
        clearInterval(timer);
        path.push({ q: node.text, t: c ? c.t : "No decision: the clock ran out.", p: c ? c.p : 0, f: c ? c.f : "Freezing is a choice too. In a real emergency, a reasonable action now beats a perfect one too late." });
        q.querySelectorAll(".dr-choice").forEach((b) => { b.disabled = true; const cc = choices[+b.dataset.k]; if (c && cc === c) b.classList.add("picked"); if (level === "recruit") b.classList.add(cc.p >= 10 ? "good" : cc.p > 0 ? "ok" : "bad"); });
        const last = path[path.length - 1];
        (last.p >= 10 ? Sound.found : last.p > 0 ? Sound.click : Sound.error)();
        steps();
        const go = () => {
          const nextId = c?.n || node.next || nextOf(node);
          if (complication && !extraDone && nodes[nextId]?.end) { extraDone = true; ask(complication); return; }
          if (!nextId || nodes[nextId]?.end) finish(nodes[nextId]); else ask(nodes[at = nextId]);
        };
        if (level === "recruit") {
          const fb = q.querySelector(".dr-fb");
          fb.hidden = false;
          fb.className = "dr-fb " + (last.p >= 10 ? "good" : last.p > 0 ? "ok" : "bad");
          fb.innerHTML = `<b>${last.p >= 10 ? "✓ GOOD CALL" : last.p > 0 ? "~ IT COULD WORK" : "✗ RISKY"}</b><p>${esc(last.f)}</p><button type="button" class="solid dr-next">NEXT ▸</button>`;
          fb.querySelector(".dr-next").addEventListener("click", () => { Sound.click(); go(); });
          fb.querySelector(".dr-next").focus();
        } else setTimeout(go, 450);
      };
      q.querySelectorAll(".dr-choice").forEach((b) => b.addEventListener("click", () => answer(choices[+b.dataset.k])));
      if (keyFn) document.removeEventListener("keydown", keyFn, true);
      keyFn = (e) => { if (!box.isConnected || !box.offsetParent) return; const n = +e.key; if (n >= 1 && n <= choices.length && !answered && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName)) { e.preventDefault(); answer(choices[n - 1]); } };
      document.addEventListener("keydown", keyFn, true);
      if (level === "hardcore") {
        const bar = box.querySelector(".dr-clock i"), t0 = performance.now();
        clearInterval(timer);
        timer = setInterval(() => {
          if (!box.isConnected) { clearInterval(timer); return; }
          const k = (performance.now() - t0) / 1000 / SECONDS;
          bar.style.width = `${Math.max(0, 100 - k * 100)}%`;
          bar.classList.toggle("low", k > 0.7);
          if (k >= 1) answer(null);
        }, 100);
      }
    };
    // The step after a node: the next one in the drill's order.
    const order = Object.keys(nodes);
    const nextOf = (node) => { const i = order.findIndex((k) => nodes[k] === node); return order[i + 1]; };
    ask(nodes[at]);

    async function finish(endNode) {
      cleanup();
      const got = path.reduce((s, x) => s + x.p, 0), score = Math.round((got / (path.length * 10)) * 100);
      const [m, mt, mc] = medal(score);
      const worst = path.filter((x) => x.p === 0);
      const risky = worst.length, n = (k) => `${k} risky decision${k > 1 ? "s" : ""}`;
      const outcome = score >= 80 ? endNode?.end || "You made it through." : score >= 50
        ? `You got through, but not cleanly${risky ? `: ${n(risky)} could have cost you dearly` : ""}. The debrief shows where.`
        : `It went wrong: ${n(Math.max(1, risky))} put you and others in danger. Read the debrief, then run it again.`;
      const prog = await fetch("/api/drills/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: drill.id, score, level }) }).then((r) => r.json()).catch(() => null);
      if (prog?.ok) progress = prog;
      window.UmbraAchievements?.check?.();
      if (!box.isConnected) return;
      (score >= 80 ? Sound.achieve : score >= 50 ? Sound.found : Sound.error)();
      box.innerHTML = `<div class="dr-wrap dr-end m-${mc}">
        <div class="dr-hero small"><canvas class="dr-art"></canvas><div class="dr-hero-shade"></div>
          <div class="dr-hero-text"><small class="dr-time">DEBRIEF · ${esc(drill.name.toUpperCase())} · ${esc(level.toUpperCase())}</small>
            <div class="dr-score"><b>${score}<i>%</i></b><span>${m} ${mt}</span></div><p class="dr-outcome"></p></div></div>
        <div class="dr-debrief">${path.map((x, i) => `<div class="dr-line ${x.p >= 10 ? "good" : x.p > 0 ? "ok" : "bad"}"><span class="dr-mark">${x.p >= 10 ? "✓" : x.p > 0 ? "~" : "✗"}</span>
          <div><small>DECISION ${i + 1}</small><p class="dr-qq">${esc(x.q)}</p><p class="dr-you">You: ${esc(x.t)}</p><p class="dr-why">${esc(x.f)}</p></div></div>`).join("")}</div>
        <div class="dr-end-actions"><button type="button" class="solid dr-again">↻ RUN IT AGAIN</button><button type="button" class="ghost dr-list">◂ ALL DRILLS</button>
          ${drill.manual ? `<button type="button" class="ghost dr-manual">▤ READ: FIELD MANUAL</button>` : ""}<button type="button" class="ghost dr-ask">◆ ASK UMBRA FOR A DEBRIEF</button></div></div>`;
      box.querySelector(".dr-outcome").textContent = outcome;
      stage(box.querySelector(".dr-art"), drill);
      box.querySelector(".dr-again").addEventListener("click", () => { Sound.click(); run(box, drill); });
      box.querySelector(".dr-list").addEventListener("click", () => { Sound.click(); render(box); });
      box.querySelector(".dr-manual")?.addEventListener("click", () => { Sound.click(); window.closeFieldKit?.(); window.openManual?.(drill.manual); });
      box.querySelector(".dr-ask").addEventListener("click", () => {
        Sound.click(); window.closeFieldKit?.();
        const lines = path.map((x, i) => `${i + 1}. ${x.q} I chose: ${x.t}`).join("\n");
        const q = $("#q");
        q.value = `Debrief my training drill "${drill.name}" (${drill.brief}) I scored ${score}%. My decisions:\n${lines}\nWhat did I do well, what should I do differently, and what's the one thing to remember?`;
        q.dispatchEvent(new Event("input")); q.focus();
      });
    }
  }

  return { render, stop: cleanup };
})();
