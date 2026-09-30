// Umbra Farming: an offline, editable production plan. The catalog is bundled
// with Umbra; a plan is saved by the local backend and included in backups.
"use strict";
(() => {
  let catalog = null, plan = null, chosen = "", kind = "all", query = "", saveTimer = 0, revision = 0;
  let saveChain = Promise.resolve();
  const $f = (s) => document.querySelector("#farming " + s);
  const n = (v, digits = 0) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
  const cropMap = new Map(), stockMap = new Map();
  const item = (id) => cropMap.get(id) || stockMap.get(id);
  const isCrop = (id) => cropMap.has(id);
  const numeric = (entry, key, fallback) => entry[key] === undefined ? fallback : entry[key];
  const safe = (v) => escapeHtml(String(v == null ? "" : v));

  function projection(entry) {
    const data = item(entry.id), crop = isCrop(entry.id);
    if (!data) return null;
    const amount = Number(entry.amount || 0), cycles = Number(entry.cycles || 0);
    const yieldKg = numeric(entry, "yieldKg", crop ? data.yieldKgM2 : data.outputKgCycle);
    const kcalKg = numeric(entry, "kcalKg", data.kcalKg);
    const outputKg = amount * cycles * yieldKg;
    const outputKcal = outputKg * kcalKg;
    if (crop) {
      const seedKg = amount * cycles * numeric(entry, "seedKgM2", data.seedKgM2);
      return { outputKg, outputKcal, seedKg, seedKcal: seedKg * kcalKg, feedKg: 0, feedKcal: 0,
        work: amount / 10 * cycles * numeric(entry, "workHours", data.workHours10M2),
        land: amount, housing: 0, overYear: cycles * data.days > 365 };
    }
    const feedKg = amount * cycles * data.cycleDays * numeric(entry, "feedKgDay", data.feedKgDay);
    return { outputKg, outputKcal, seedKg: 0, seedKcal: 0, feedKg,
      feedKcal: feedKg * numeric(entry, "feedKcalKg", data.feedKcalKg),
      work: amount * cycles * data.cycleDays / 7 * numeric(entry, "workHours", data.workHoursWeek),
      land: 0, housing: amount * data.housingM2, overYear: cycles * data.cycleDays > 365 };
  }
  function totals() {
    const sum = { outputKg: 0, outputKcal: 0, seedKg: 0, seedKcal: 0, feedKg: 0, feedKcal: 0, work: 0, land: 0, housing: 0, overYear: false };
    for (const entry of plan.items) {
      const p = projection(entry);
      if (!p) continue;
      for (const key of Object.keys(sum)) sum[key] = key === "overYear" ? sum[key] || p[key] : sum[key] + p[key];
    }
    return sum;
  }
  const art = `        .  *       .      |      .       *  .
      *      .            |            .
             \\  |  /     |     \\  |  /
          ----  ☼  ----   |   ----  ☼  ----
             /  |  \\     |     /  |  \\
      _________           |           _________
     /  /  /  /\\       __|__       /\\  \\  \\  \\
    /__/__/__/__\\     /  _  \\     /__\\__\\__\\__\\
     || || || ||       |  | |  |       || || || ||
  ___||_||_||_||_______|__|_|__|_______||_||_||_||___`;

  function build() {
    const panel = document.createElement("div");
    panel.id = "farming"; panel.className = "loadout fm"; panel.hidden = true;
    panel.innerHTML = `<div class="lo-head fm-head"><span class="lo-title"><span class="g">&#xF0073;</span> FARMING</span>
      <span class="fm-head-note">OFFLINE FIELD PLANNER</span><button class="ghost fm-close" title="Close Farming · Esc">CLOSE ✕</button></div>
      <div class="fm-body"><aside class="fm-catalog"><div class="fm-cat-head"><b>THE FIELD BOOK</b><small>Bundled crops & livestock</small></div>
        <input class="fm-search" type="search" placeholder="Search crops or animals…" aria-label="Search farming catalog">
        <div class="fm-filter"><button data-kind="all" class="on">ALL</button><button data-kind="crop">CROPS</button><button data-kind="stock">LIVESTOCK</button></div>
        <div class="fm-catalog-list"></div></aside><main class="fm-main"><div class="fm-hero"><pre class="fm-art" aria-hidden="true"></pre>
        <div><small>UMBRA // AGRICULTURE</small><h2>Plan your food production.</h2><p>Compare food output, planting seed, animal feed and work over a planning year. Change every estimate to fit your own farm.</p></div></div>
        <div class="fm-target"><label>PEOPLE IN PLAN <input class="fm-people" type="number" min="1" max="100" step="1"></label>
          <label>COMPARISON TARGET · KCAL / PERSON / DAY <input class="fm-target-kcal" type="number" min="500" max="5000" step="50"></label>
          <span>Math reference only; set a target appropriate to your household.</span></div>
        <div class="fm-stats"></div><div class="fm-content"><section class="fm-plan"><div class="fm-title"><b>YOUR PRODUCTION PLAN</b><small class="fm-save-state"></small></div><div class="fm-rows"></div></section>
          <section class="fm-detail"><div class="fm-title"><b>FIELD NOTES & ESTIMATES</b></div><div class="fm-detail-inner"></div></section></div>
        <details class="fm-method"><summary>DATA, SOURCES & LIMITS</summary><div class="fm-method-inner"></div></details></main></div>`;
    document.body.appendChild(panel);
    $f(".fm-art").textContent = art;
    $f(".fm-close").addEventListener("click", () => toggle(false));
    $f(".fm-search").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); renderCatalog(); });
    $f(".fm-filter").addEventListener("click", (e) => {
      const button = e.target.closest("button[data-kind]"); if (!button) return;
      kind = button.dataset.kind;
      $f(".fm-filter").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === button));
      renderCatalog(); Sound.click();
    });
    $f(".fm-catalog-list").addEventListener("click", (e) => {
      const button = e.target.closest("button[data-id]"); if (!button) return;
      const id = button.dataset.id;
      if (!plan.items.some((x) => x.id === id)) {
        plan.items.push({ id, amount: isCrop(id) ? 10 : 1, cycles: isCrop(id) ? 1 : item(id).defaultCycles });
        scheduleSave(); Sound.found();
      } else Sound.click();
      chosen = id; renderPlan(); renderDetail(); renderCatalog();
    });
    $f(".fm-rows").addEventListener("click", (e) => {
      const del = e.target.closest(".fm-remove"), row = e.target.closest("[data-id]");
      if (!row) return;
      if (del) {
        plan.items = plan.items.filter((x) => x.id !== row.dataset.id);
        if (chosen === row.dataset.id) chosen = plan.items[0]?.id || "";
        scheduleSave(); renderPlan(); renderDetail(); renderCatalog(); Sound.click();
      } else { chosen = row.dataset.id; renderPlan(); renderDetail(); Sound.click(); }
    });
    for (const [sel, key] of [[".fm-people", "people"], [".fm-target-kcal", "targetKcal"]]) {
      $f(sel).addEventListener("input", (e) => {
        const val = e.target.valueAsNumber;
        if (!Number.isFinite(val) || val < +e.target.min || val > +e.target.max) return;
        plan[key] = val; renderStats(); scheduleSave();
      });
    }
    $f(".fm-detail-inner").addEventListener("input", (e) => {
      const input = e.target.closest("input[data-field]"); if (!input || !chosen) return;
      const val = input.valueAsNumber;
      if (!Number.isFinite(val) || val < +input.min || val > +input.max) return;
      const entry = plan.items.find((x) => x.id === chosen);
      if (!entry) return;
      entry[input.dataset.field] = val;
      renderStats(); renderPlan(); scheduleSave();
    });
    $f(".fm-detail-inner").addEventListener("click", (e) => {
      if (!e.target.closest(".fm-defaults")) return;
      const entry = plan.items.find((x) => x.id === chosen);
      if (!entry) return;
      for (const key of ["yieldKg", "kcalKg", "seedKgM2", "feedKgDay", "feedKcalKg", "workHours"]) delete entry[key];
      renderDetail(); renderStats(); renderPlan(); scheduleSave(); Sound.click();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden && $("#modal").hidden) { e.stopImmediatePropagation(); toggle(false); }
    }, true);
    new MutationObserver(() => { if (document.body.classList.contains("locked") && !panel.hidden) toggle(false, true); })
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });
    for (const sel of ["#maps", "#fieldkit", "#radar", "#loadout", "#history", "#library", "#themes", "#settings", "#core"]) {
      const other = $(sel); if (!other) continue;
      new MutationObserver(() => { if (!panel.hidden && !other.hidden) toggle(false, true); })
        .observe(other, { attributes: true, attributeFilter: ["hidden"] });
    }
  }
  async function load() {
    if (catalog && plan) return;
    const response = await fetch("/api/farm").then((r) => r.json());
    catalog = response.catalog; plan = response.plan;
    cropMap.clear(); stockMap.clear();
    catalog.crops.forEach((x) => cropMap.set(x.id, x));
    catalog.livestock.forEach((x) => stockMap.set(x.id, x));
    chosen = plan.items[0]?.id || "";
    $f(".fm-people").value = plan.people || 1;
    $f(".fm-target-kcal").value = plan.targetKcal || 2000;
    $f(".fm-method-inner").innerHTML = `<p>${safe(catalog.method)}</p><p>Food calories mean edible food mass. Animal feed energy is feed energy, not food for people. Housing area excludes pasture. Planting, feed, fuel, soil nutrients, losses and nutrition quality need local checks.</p>
      ${catalog.sources.map((s) => `<div><b>${safe(s.title)}</b><small>${safe(s.use)}</small><code>${safe(s.url)}</code></div>`).join("")}`;
  }
  function renderCatalog() {
    const entries = [
      ...(kind === "stock" ? [] : catalog.crops.map((x) => ({ ...x, type: "crop" }))),
      ...(kind === "crop" ? [] : catalog.livestock.map((x) => ({ ...x, type: "stock" }))),
    ].filter((x) => !query || (x.name + " " + x.group + " " + (x.product || "")).toLowerCase().includes(query));
    $f(".fm-catalog-list").innerHTML = entries.length ? entries.map((x) => {
      const added = plan.items.some((p) => p.id === x.id);
      return `<button data-id="${safe(x.id)}" class="fm-catalog-item${x.id === chosen ? " on" : ""}"><span class="fm-type">${x.type === "crop" ? "✣" : "◇"}</span>
        <span><b>${safe(x.name)}</b><small>${safe(x.group)} · ${n(x.kcalKg)} kcal/kg</small></span><em>${added ? "IN PLAN" : "+ ADD"}</em></button>`;
    }).join("") : `<p class="lib-note">No match in the bundled catalog.</p>`;
  }
  function renderStats() {
    const t = totals(), need = (plan.people || 1) * (plan.targetKcal || 2000) * 365;
    const days = t.outputKcal / ((plan.people || 1) * (plan.targetKcal || 2000));
    $f(".fm-stats").innerHTML = `<div><small>ESTIMATED FOOD OUTPUT / YEAR</small><b>${n(t.outputKcal)} <em>kcal</em></b><span>${n(t.outputKg, 1)} kg edible mass · ${n(days, 1)} household target days</span></div>
      <div><small>COMPARISON TARGET / YEAR</small><b>${n(need)} <em>kcal</em></b><span>${n(need ? 100 * t.outputKcal / need : 0, 1)}% of the selected reference target</span></div>
      <div><small>PLANTING & FEED INPUT</small><b>${n(t.seedKcal + t.feedKcal)} <em>kcal</em></b><span>${n(t.seedKg, 1)} kg edible seed · ${n(t.feedKg, 1)} kg animal feed</span></div>
      <div><small>LAND & WORK</small><b>${n(t.land, 1)} <em>m² planted</em></b><span>${n(t.housing, 1)} m² animal housing · ≈${n(t.work, 1)} work h/year</span></div>`;
    $f(".fm-stats").classList.toggle("fm-empty", !plan.items.length);
    $f(".fm-method").querySelector("summary").textContent = t.overYear ? "DATA, SOURCES & LIMITS · CHECK CYCLES" : "DATA, SOURCES & LIMITS";
  }
  function renderPlan() {
    $f(".fm-rows").innerHTML = plan.items.length ? plan.items.map((entry) => {
      const data = item(entry.id), p = projection(entry), crop = isCrop(entry.id);
      return `<div class="fm-plan-row${chosen === entry.id ? " on" : ""}" data-id="${safe(entry.id)}"><span class="fm-type">${crop ? "✣" : "◇"}</span>
        <span><b>${safe(data.name)}</b><small>${n(entry.amount, 1)} ${crop ? "m²" : "head"} · ${n(entry.cycles, 1)} cycle${entry.cycles === 1 ? "" : "s"}/year${p.overYear ? " · CHECK TIMING" : ""}</small></span>
        <strong>${n(p.outputKcal)} kcal</strong><button class="ghost fm-remove" title="Remove from plan">✕</button></div>`;
    }).join("") : `<p class="fm-blank">Choose crops or livestock in the Field Book to build your plan. Your numbers save on this computer.</p>`;
    renderStats();
  }
  const input = (title, field, value, unit, min, max, step) => `<label class="fm-edit"><span>${title}</span><div><input type="number" data-field="${field}" value="${value}" min="${min}" max="${max}" step="${step}"><small>${unit}</small></div></label>`;
  function renderDetail() {
    const entry = plan.items.find((x) => x.id === chosen), box = $f(".fm-detail-inner");
    if (!entry) { box.innerHTML = `<p class="fm-blank">Select an entry to inspect climate, soil, timing, feed and calorie assumptions.</p>`; return; }
    const d = item(chosen), crop = isCrop(chosen), p = projection(entry);
    box.innerHTML = `<div class="fm-detail-name"><span>${crop ? "CROP" : "LIVESTOCK"} / ${safe(d.group)}</span><h3>${safe(d.name)}</h3><p>${safe(d.note)}</p></div>
      <div class="fm-projection"><b>${n(p.outputKg, 1)} kg</b><span>edible output / planning year</span><strong>${n(p.outputKcal)} kcal</strong></div>
      <div class="fm-edit-grid">${input(crop ? "PLANTED AREA" : "ANIMALS", "amount", entry.amount, crop ? "m²" : "head", 0, crop ? 100000 : 10000, crop ? 0.1 : 1)}
        ${input("CYCLES IN PLAN YEAR", "cycles", entry.cycles, "cycles", 0, 12, 0.1)}
        ${input(crop ? "YIELD PER M² / CYCLE" : "EDIBLE KG / HEAD / CYCLE", "yieldKg", numeric(entry, "yieldKg", crop ? d.yieldKgM2 : d.outputKgCycle), "kg", 0, 10000, 0.01)}
        ${input("FOOD ENERGY", "kcalKg", numeric(entry, "kcalKg", d.kcalKg), "kcal/kg", 0, 10000, 10)}
        ${crop ? `${input("PLANTING SEED", "seedKgM2", numeric(entry, "seedKgM2", d.seedKgM2), "kg/m²/cycle", 0, 10, 0.001)}
          ${input("WORK", "workHours", numeric(entry, "workHours", d.workHours10M2), "h/10 m²/cycle", 0, 1000, 0.1)}`
          : `${input("FEED PER DAY", "feedKgDay", numeric(entry, "feedKgDay", d.feedKgDay), "kg/head/day", 0, 1000, 0.01)}
          ${input("FEED ENERGY", "feedKcalKg", numeric(entry, "feedKcalKg", d.feedKcalKg), "kcal/kg feed", 0, 10000, 10)}
          ${input("WORK", "workHours", numeric(entry, "workHours", d.workHoursWeek), "h/head/week", 0, 1000, 0.1)}`}</div>
      <div class="fm-facts">${crop ? `<div><small>FIRST HARVEST</small><b>≈${d.days} days</b></div><div><small>BEST GROWING TEMPERATURE</small><b>${d.tempC[0]}–${d.tempC[1]}°C</b></div>
        <div><small>SOIL</small><b>${safe(d.soil)}</b></div><div><small>SOIL pH</small><b>${d.ph[0]}–${d.ph[1]}</b></div><div><small>WATER</small><b>${safe(d.water)}</b></div>`
        : `<div><small>CYCLE</small><b>≈${d.cycleDays} days</b></div><div><small>OUTPUT</small><b>${safe(d.product)}</b></div><div><small>CLIMATE & CARE</small><b>${safe(d.climate)}</b></div>
        <div><small>HOUSING</small><b>≈${d.housingM2} m²/head, pasture extra</b></div>`}</div>
      <p class="fm-estimate-note">${crop ? `Planting seed: ${n(p.seedKg, 2)} kg, ≈${n(p.seedKcal)} kcal where edible seed is modelled.` : `Animal feed: ${n(p.feedKg, 1)} kg, ≈${n(p.feedKcal)} feed kcal. Feed energy is not human food energy.`}
        Work: ≈${n(p.work, 1)} h/year.${p.overYear ? " Selected cycles need more than 365 days; check your schedule." : ""}</p>
      <button class="ghost fm-defaults">RESTORE CATALOG ESTIMATES</button>`;
  }
  function render() { renderCatalog(); renderPlan(); renderDetail(); }
  function scheduleSave() {
    const current = ++revision;
    clearTimeout(saveTimer);
    $f(".fm-save-state").textContent = "Saving…";
    saveTimer = setTimeout(() => {
      const snapshot = JSON.stringify(plan);
      saveChain = saveChain.catch(() => {}).then(async () => {
      try {
        const res = await fetch("/api/farm", { method: "POST", headers: { "Content-Type": "application/json" }, body: snapshot });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || "save failed");
        if (current === revision) $f(".fm-save-state").textContent = "SAVED LOCALLY";
      } catch (e) { if (current === revision) { $f(".fm-save-state").textContent = "SAVE FAILED · " + (e.message || "retry an edit"); Sound.error(); } }
      });
    }, 450);
  }
  function toggle(show = document.getElementById("farming").hidden, quiet = false) {
    const panel = document.getElementById("farming");
    if (show && locked) return;
    if (!show) { panel.hidden = true; document.body.classList.remove("farming-open"); $("#farming-btn").classList.remove("on"); if (!quiet) Sound.click(); return; }
    if (window.closeSettings) window.closeSettings();
    if (window.closeLoadout) window.closeLoadout(true);
    if (window.closeHistory) window.closeHistory();
    if (window.closeMaps) window.closeMaps();
    if (window.closeFieldKit) window.closeFieldKit();
    if (window.closeRadar) window.closeRadar();
    if (window.closeCore) window.closeCore();
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    panel.hidden = false; document.body.classList.add("farming-open"); $("#farming-btn").classList.add("on");
    if (!catalog) {
      $f(".fm-catalog-list").innerHTML = `<p class="lib-note">Opening the field book…</p>`;
      load().then(render).catch(() => { $f(".fm-catalog-list").innerHTML = `<p class="lib-note">The local field book could not be loaded. Close and open Farming to try again.</p>`; });
    } else render();
    if (!quiet) Sound.click();
  }
  build();
  $("#farming-btn").addEventListener("click", () => toggle());
  window.toggleFarming = toggle;
  window.closeFarming = () => { if (!document.getElementById("farming").hidden) toggle(false, true); };
})();
