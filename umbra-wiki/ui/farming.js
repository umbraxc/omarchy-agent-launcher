// Umbra Farming: an offline, editable production plan. The catalog is bundled
// with Umbra; a plan is saved by the local backend and included in backups.
"use strict";
(() => {
  let catalog = null, plan = null, household = null, householdClimate = "temperate", householdActivity = "moderate", chosen = "", kind = "all", query = "", saveTimer = 0, revision = 0;
  let saveChain = Promise.resolve();
  const $f = (s) => document.querySelector("#farming " + s);
  const n = (v, digits = 0) => Number(v || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
  const cropMap = new Map(), stockMap = new Map();
  const item = (id) => cropMap.get(id) || stockMap.get(id);
  const isCrop = (id) => cropMap.has(id);
  const numeric = (entry, key, fallback) => entry[key] === undefined ? fallback : entry[key];
  const safe = (v) => escapeHtml(String(v == null ? "" : v));
  const householdRates = { adults: 2200, teens: 2400, children: 1700, toddlers: 1100, infants: 700, elderly: 1800 };
  function comparison() {
    const groups = Object.entries(household || {}).filter(([key, count]) => householdRates[key] && Number(count) > 0);
    const persons = groups.reduce((sum, [, count]) => sum + Number(count), 0);
    const base = groups.reduce((sum, [key, count]) => sum + Number(count) * householdRates[key], 0);
    const kcal = base * ({ rest: .9, moderate: 1, heavy: 1.3 }[householdActivity] || 1) * (householdClimate === "cold" ? 1.15 : 1);
    const linked = plan.comparisonMode === "household" && persons > 0;
    return { persons: linked ? persons : plan.people || 1, kcal: linked ? kcal : (plan.people || 1) * (plan.targetKcal || 2000), linked, groups };
  }
  async function refreshHousehold() {
    try {
      const supplies = await fetch("/api/supplies").then((r) => r.json());
      household = supplies.household || {}; householdClimate = supplies.climate || "temperate"; householdActivity = supplies.activity || "moderate";
    }
    catch { household = {}; }
    if (plan) renderStats();
  }

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
      land: 0, housing: amount * numeric(entry, "housingM2", data.housingM2), overYear: cycles * data.cycleDays > 365 };
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
  function build() {
    const panel = document.createElement("div");
    panel.id = "farming"; panel.className = "loadout fm"; panel.hidden = true;
    panel.innerHTML = `<div class="lo-head fm-head"><span class="lo-title"><span class="g">&#xF0073;</span> FARMING</span>
      <span class="fm-head-note">OFFLINE FIELD PLANNER</span><button class="ghost fm-household" title="Edit your household in Field Kit Supplies">HOUSEHOLD ↗</button><button class="ghost fm-close" title="Close Farming · Esc">CLOSE ✕</button></div>
      <div class="fm-body"><aside class="fm-catalog"><div class="fm-cat-head"><b>THE FIELD BOOK</b><button class="fm-overview-btn" type="button" title="See the farm overview">VIEW FARM ▸</button></div>
        <input class="fm-search" type="search" placeholder="Search crops or animals…" aria-label="Search farming catalog">
        <div class="fm-filter"><button data-kind="all" class="on">ALL</button><button data-kind="crop">CROPS</button><button data-kind="stock">LIVESTOCK</button></div>
        <div class="fm-catalog-list"></div></aside><main class="fm-main"><div class="fm-hero fm-overview"><canvas class="fm-art" role="img" aria-label="Summer farm with cabin and animals"></canvas>
        <div class="fm-hero-copy"><small class="fm-hero-kicker">UMBRA // THE FARM</small><h2 class="fm-hero-name">A place to grow.</h2><p class="fm-hero-desc">Choose a crop or animal from the Field Book to explore its needs and add it to your plan.</p></div></div>
        <section class="fm-land"><label for="fm-available-land">LAND AVAILABLE <small>m²</small></label><input id="fm-available-land" class="fm-available-land" type="number" min="0" max="1000000000" step="any" placeholder="Enter your land area" aria-label="Land available in square metres"><span class="fm-land-result" aria-live="polite"></span></section>
        <details class="fm-comparison"><summary>HOUSEHOLD CALORIE COMPARISON</summary><div class="fm-target"><div class="fm-compare-modes"><button type="button" data-mode="household">USE HOUSEHOLD</button><button type="button" data-mode="manual">MANUAL TARGET</button></div><p class="fm-household-note"></p><div class="fm-manual-target"><label>PEOPLE IN PLAN <input class="fm-people" type="number" min="1" max="100" step="1"></label>
          <label>COMPARISON TARGET · KCAL / PERSON / DAY <input class="fm-target-kcal" type="number" min="500" max="5000" step="50"></label>
          </div><span>These are planning estimates, not individual nutrition advice. Household counts come from Field Kit Supplies.</span></div></details>
        <div class="fm-stats"></div><div class="fm-content"><section class="fm-plan"><div class="fm-title"><b>YOUR PRODUCTION PLAN</b><small class="fm-save-state"></small></div><div class="fm-rows"></div></section>
          <section class="fm-detail"><div class="fm-title"><b>FIELD NOTES & ESTIMATES</b></div><div class="fm-detail-inner"></div></section></div>
        <details class="fm-method"><summary>DATA, SOURCES & LIMITS</summary><div class="fm-method-inner"></div></details></main></div>`;
    document.body.appendChild(panel);
    UmbraFarmArt.hero($f(".fm-art"), null, 0);
    new ResizeObserver(() => {
      if (!panel.hidden) UmbraFarmArt.hero($f(".fm-art"), item(chosen), performance.now());
    }).observe($f(".fm-art"));
    setInterval(() => {
      if (panel.hidden || document.hidden || document.body.classList.contains("reduce-motion")) return;
      const art = $f(".fm-art"), view = art.getBoundingClientRect();
      if (view.bottom < 0 || view.top > innerHeight) return;
      UmbraFarmArt.hero(art, item(chosen), performance.now());
    }, 180);
    $f(".fm-overview-btn").addEventListener("click", () => { chosen = ""; renderCatalog(); renderPlan(); renderDetail(); Sound.click(); });
    $f(".fm-close").addEventListener("click", () => toggle(false));
    $f(".fm-household").addEventListener("click", () => { toggle(false, true); window.UmbraFieldKit?.open("supplies"); Sound.click(); });
    $f(".fm-available-land").addEventListener("input", (e) => {
      if (!plan) return;
      const raw = e.target.value.trim();
      if (raw && (!e.target.validity.valid || !Number.isFinite(e.target.valueAsNumber))) return;
      plan.availableLandM2 = raw ? e.target.valueAsNumber : null;
      renderStats(); scheduleSave();
    });
    $f(".fm-compare-modes").addEventListener("click", (e) => {
      const mode = e.target.closest("button[data-mode]")?.dataset.mode;
      if (!mode || !plan) return;
      plan.comparisonMode = mode; renderStats(); scheduleSave(); Sound.click();
    });
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
      Sound.click();
      chosen = id; renderPlan(); renderDetail(); renderCatalog();
    });
    $f(".fm-rows").addEventListener("click", (e) => {
      const del = e.target.closest(".fm-remove"), row = e.target.closest("[data-id]");
      if (!row) return;
      if (del) {
        plan.items = plan.items.filter((x) => x.id !== row.dataset.id);
        if (chosen === row.dataset.id) chosen = row.dataset.id;
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
      if (input.dataset.field === "plants") entry.amount = val * numeric(entry, "plantSpaceM2", item(chosen).plantSpaceM2);
      else entry[input.dataset.field] = val;
      if (input.dataset.field === "plantSpaceM2" || input.dataset.field === "amount") {
        const plants = $f('.fm-detail-inner input[data-field="plants"]');
        if (plants) plants.value = Math.round(entry.amount / numeric(entry, "plantSpaceM2", item(chosen).plantSpaceM2));
      }
      if (input.dataset.field === "plants") {
        const area = $f('.fm-detail-inner input[data-field="amount"]'); if (area) area.value = +entry.amount.toFixed(3);
      }
      renderDetailFigures();
      renderStats(); renderPlan(); scheduleSave();
    });
    $f(".fm-detail-inner").addEventListener("click", (e) => {
      if (e.target.closest(".fm-add")) {
        if (!plan.items.some((x) => x.id === chosen)) {
          plan.items.push({ id: chosen, amount: isCrop(chosen) ? 10 : 1, cycles: isCrop(chosen) ? 1 : item(chosen).defaultCycles });
          scheduleSave(); renderPlan(); renderDetail(); renderCatalog(); Sound.found();
        }
        return;
      }
      if (!e.target.closest(".fm-defaults")) return;
      const entry = plan.items.find((x) => x.id === chosen);
      if (!entry) return;
      for (const key of ["yieldKg", "kcalKg", "seedKgM2", "feedKgDay", "feedKcalKg", "workHours", "plantSpaceM2", "housingM2"]) delete entry[key];
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
    if (!plan.comparisonMode) plan.comparisonMode = plan.people !== 1 || plan.targetKcal !== 2000 ? "manual" : "household";
    cropMap.clear(); stockMap.clear();
    catalog.crops.forEach((x) => cropMap.set(x.id, x));
    catalog.livestock.forEach((x) => stockMap.set(x.id, x));
    chosen = "";
    $f(".fm-people").value = plan.people || 1;
    $f(".fm-target-kcal").value = plan.targetKcal || 2000;
    $f(".fm-available-land").value = plan.availableLandM2 == null ? "" : plan.availableLandM2;
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
      return `<button data-id="${safe(x.id)}" class="fm-catalog-item${x.id === chosen ? " on" : ""}"><canvas class="fm-mini-art" data-art="${safe(x.id)}" width="64" height="64" aria-hidden="true"></canvas>
        <span><b>${safe(x.name)}</b><small>${safe(x.group)}${x.product ? " · " + safe(x.product) : ""}</small></span><em>${added ? "IN PLAN" : "VIEW"}</em></button>`;
    }).join("") : `<p class="lib-note">No match in the bundled catalog.</p>`;
    $f(".fm-catalog-list").querySelectorAll(".fm-mini-art").forEach((canvas) => UmbraFarmArt.mini(canvas, item(canvas.dataset.art)));
  }
  function renderStats() {
    const t = totals(), target = comparison(), need = target.kcal * 365;
    const days = target.kcal ? t.outputKcal / target.kcal : 0;
    const used = t.land + t.housing, available = plan.availableLandM2;
    const landResult = $f(".fm-land-result");
    landResult.classList.toggle("short", available != null && used > available);
    landResult.textContent = available == null
      ? `${n(used, 1)} m² planned · enter your land area to compare.`
      : `${n(used, 1)} m² planned · ${n(Math.abs(available - used), 1)} m² ${used > available ? "over available land" : "remaining"}. Outdoor range and pasture are additional.`;
    $f(".fm-compare-modes").querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.mode === plan.comparisonMode));
    $f(".fm-manual-target").hidden = target.linked;
    $f(".fm-household-note").textContent = target.linked
      ? `${n(target.persons)} people in Field Kit · ${n(target.kcal)} kcal/day household estimate. Changes in Field Kit update this comparison.`
      : plan.comparisonMode === "household" ? "Add people in Field Kit Supplies to link this estimate. Showing your manual target for now."
      : `Manual target · ${n(target.persons)} people × ${n(plan.targetKcal || 2000)} kcal/day.`;
    $f(".fm-stats").innerHTML = `<div><small>FOOD / DAY · AVERAGE</small><b>${n(t.outputKg / 365, 2)} <em>kg</em></b><span>${n(t.outputKcal / 365)} kcal · seasonal output averaged</span></div>
      <div><small>FOOD / WEEK · AVERAGE</small><b>${n(t.outputKg / 52, 2)} <em>kg</em></b><span>${n(t.outputKcal / 52)} kcal · ${n(days, 1)} household target days/year</span></div>
      <div><small>FOOD / YEAR</small><b>${n(t.outputKg, 1)} <em>kg</em></b><span>${n(t.outputKcal)} kcal · ${n(need ? 100 * t.outputKcal / need : 0, 1)}% of comparison target</span></div>
      <div><small>SPACE & INPUTS</small><b>${n(t.land + t.housing, 1)} <em>m²</em></b><span>${n(t.land, 1)} planted + ${n(t.housing, 1)} shelter · ${n(t.seedKg + t.feedKg, 1)} kg seed/feed</span></div>`;
    $f(".fm-stats").classList.toggle("fm-empty", !plan.items.length);
    $f(".fm-method").querySelector("summary").textContent = t.overYear ? "DATA, SOURCES & LIMITS · CHECK CYCLES" : "DATA, SOURCES & LIMITS";
  }
  function renderPlan() {
    $f(".fm-rows").innerHTML = plan.items.length ? plan.items.map((entry) => {
      const data = item(entry.id), p = projection(entry), crop = isCrop(entry.id);
      return `<div class="fm-plan-row${chosen === entry.id ? " on" : ""}" data-id="${safe(entry.id)}"><canvas class="fm-mini-art" data-art="${safe(entry.id)}" width="64" height="64" aria-hidden="true"></canvas>
        <span><b>${safe(data.name)}</b><small>${crop ? "" : safe(data.product) + " · "}${n(entry.amount, 1)} ${crop ? "m²" : "head"} · ${n(entry.cycles, 1)} cycle${entry.cycles === 1 ? "" : "s"}/year${p.overYear ? " · CHECK TIMING" : ""}</small></span>
        <strong>${n(p.outputKcal)} kcal</strong><button class="ghost fm-remove" title="Remove from plan">✕</button></div>`;
    }).join("") : `<p class="fm-blank">Choose crops or livestock in the Field Book to build your plan. Your numbers save on this computer.</p>`;
    $f(".fm-rows").querySelectorAll(".fm-mini-art").forEach((canvas) => UmbraFarmArt.mini(canvas, item(canvas.dataset.art)));
    renderStats();
  }
  const input = (title, field, value, unit, min, max, step) => `<label class="fm-edit"><span>${title}</span><div><input type="number" data-field="${field}" value="${value}" min="${min}" max="${max}" step="${step}"><small>${unit}</small></div></label>`;
  function renderDetailFigures() {
    const entry = plan.items.find((x) => x.id === chosen);
    if (!entry) return;
    const p = projection(entry), crop = isCrop(chosen), d = item(chosen);
    const box = $f(".fm-detail-inner");
    const figure = box.querySelector(".fm-projection");
    if (figure) figure.innerHTML = `<div><small>PER DAY · YEAR AVERAGE</small><b>${n(p.outputKg / 365, 2)} kg</b><span>${n(p.outputKcal / 365)} kcal</span></div>
      <div><small>PER WEEK · YEAR AVERAGE</small><b>${n(p.outputKg / 52, 2)} kg</b><span>${n(p.outputKcal / 52)} kcal</span></div>
      <div><small>PER YEAR</small><b>${n(p.outputKg, 1)} kg</b><span>${n(p.outputKcal)} kcal</span></div>`;
    const land = box.querySelector(".fm-land-total");
    if (land) land.textContent = crop
      ? `${n(entry.amount, 2)} m² planted · about ${n(entry.amount / numeric(entry, "plantSpaceM2", d.plantSpaceM2))} plants at ${n(numeric(entry, "plantSpaceM2", d.plantSpaceM2), 3)} m² each`
      : `${n(entry.amount * numeric(entry, "housingM2", d.housingM2), 1)} m² shelter for ${n(entry.amount)} animals (${n(numeric(entry, "housingM2", d.housingM2), 2)} m² each). Outdoor range, grazing or pond space is additional.`;
    const note = box.querySelector(".fm-estimate-note");
    if (note) note.textContent = (crop ? `Planting seed: ${n(p.seedKg, 2)} kg for planned cycles.` : `Feed: ${n(p.feedKg, 1)} kg for planned cycles.`) +
      ` Work: about ${n(p.work, 1)} h/year. Daily and weekly values are annual averages; actual harvests and batches are seasonal.` +
      (p.overYear ? " Selected cycles exceed 365 days; check timing." : "");
  }
  function renderDetail() {
    const d = item(chosen), box = $f(".fm-detail-inner");
    $f(".fm-hero").classList.toggle("fm-overview", !d);
    $f(".fm-art").setAttribute("aria-label", d ? `Animated ASCII portrait of ${d.name}` : "Summer farm with cabin and animals");
    UmbraFarmArt.hero($f(".fm-art"), d, 0);
    if (!d) {
      $f(".fm-hero-kicker").textContent = "UMBRA // THE FARM";
      $f(".fm-hero-name").textContent = "A place to grow.";
      $f(".fm-hero-desc").textContent = "Choose a crop or animal from the Field Book to explore its needs and add it to your plan.";
      box.innerHTML = `<p class="fm-blank">Choose a crop or animal in the Field Book to preview it. Nothing is added until you choose Add to plan.</p>`;
      return;
    }
    const crop = isCrop(chosen), entry = plan.items.find((x) => x.id === chosen);
    $f(".fm-hero-kicker").textContent = crop ? "CROP / " + d.group.toUpperCase() : "LIVESTOCK / " + d.group.toUpperCase();
    $f(".fm-hero-name").textContent = d.name;
    $f(".fm-hero-desc").textContent = crop ? `${d.days} days to first harvest · ${d.soil} · ${d.water} water` : `${d.product} · ${d.climate}`;
    const preview = `<div class="fm-detail-name"><span>${crop ? "CROP" : "LIVESTOCK"} / ${safe(d.group)}</span><h3>${safe(d.name)}</h3><p>${safe(d.note)}</p></div>`;
    if (!entry) {
      box.innerHTML = preview + `<div class="fm-facts">${crop ? `<div><small>FIRST HARVEST</small><b>≈${d.days} days</b></div><div><small>GROWING TEMPERATURE</small><b>${d.tempC[0]}–${d.tempC[1]}°C</b></div><div><small>SOIL</small><b>${safe(d.soil)}</b></div><div><small>SOIL pH</small><b>${d.ph[0]}–${d.ph[1]}</b></div><div><small>WATER</small><b>${safe(d.water)}</b></div><div><small>SPACE START</small><b>≈${n(d.plantSpaceM2, 3)} m² / plant</b></div>` : `<div><small>PRODUCT</small><b>${safe(d.product)}</b></div><div><small>CYCLE</small><b>≈${d.cycleDays} days</b></div><div><small>CLIMATE</small><b>${safe(d.climate)}</b></div><div><small>SHELTER START</small><b>≈${d.housingM2} m² / animal</b></div>`}</div>
        <div class="fm-care"><b>CARE & MAINTENANCE</b><ul>${(d.care || []).map((x) => `<li>${safe(x)}</li>`).join("")}</ul></div>
        <p class="fm-estimate-note">These are starting estimates. Add this item to enter your own numbers and see land, feed, work and output.</p>
        <button class="fm-add" type="button">+ ADD ${safe(d.name.toUpperCase())} TO PLAN</button>`;
      return;
    }
    box.innerHTML = preview + `<div class="fm-projection"></div>
      <p class="fm-average-note">Planning averages. Harvests, milk, eggs and meat arrive on different schedules.</p>
      <div class="fm-edit-grid">${input(crop ? "PLANTED AREA" : "ANIMALS", "amount", entry.amount, crop ? "m²" : "head", 0, crop ? 100000 : 10000, crop ? 0.1 : 1)}
        ${crop ? `${input("APPROX. PLANTS", "plants", Math.round(entry.amount / numeric(entry, "plantSpaceM2", d.plantSpaceM2)), "plants", 0, 10000000, 1)}
          ${input("SPACE PER PLANT", "plantSpaceM2", numeric(entry, "plantSpaceM2", d.plantSpaceM2), "m²", 0.001, 100, 0.001)}`
        : input("SHELTER PER ANIMAL", "housingM2", numeric(entry, "housingM2", d.housingM2), "m²", 0, 10000, 0.1)}
        ${input("CYCLES PER YEAR", "cycles", entry.cycles, "cycles", 0, 12, 0.1)}
        ${input(crop ? "YIELD PER M² / CYCLE" : "EDIBLE KG / ANIMAL / CYCLE", "yieldKg", numeric(entry, "yieldKg", crop ? d.yieldKgM2 : d.outputKgCycle), "kg", 0, 10000, 0.01)}
        ${input("FOOD ENERGY", "kcalKg", numeric(entry, "kcalKg", d.kcalKg), "kcal/kg", 0, 10000, 10)}
        ${crop ? `${input("PLANTING SEED", "seedKgM2", numeric(entry, "seedKgM2", d.seedKgM2), "kg/m²/cycle", 0, 10, 0.001)}
          ${input("WORK", "workHours", numeric(entry, "workHours", d.workHours10M2), "h/10 m²/cycle", 0, 1000, 0.1)}`
          : `${input("FEED PER DAY", "feedKgDay", numeric(entry, "feedKgDay", d.feedKgDay), "kg/animal", 0, 1000, 0.01)}
          ${input("FEED ENERGY", "feedKcalKg", numeric(entry, "feedKcalKg", d.feedKcalKg), "kcal/kg feed", 0, 10000, 10)}
          ${input("WORK", "workHours", numeric(entry, "workHours", d.workHoursWeek), "h/animal/week", 0, 1000, 0.1)}`}</div>
      <div class="fm-land-total"></div>
      <div class="fm-facts">${crop ? `<div><small>FIRST HARVEST</small><b>≈${d.days} days</b></div><div><small>GROWING TEMPERATURE</small><b>${d.tempC[0]}–${d.tempC[1]}°C</b></div><div><small>SOIL</small><b>${safe(d.soil)}</b></div><div><small>SOIL pH</small><b>${d.ph[0]}–${d.ph[1]}</b></div><div><small>WATER</small><b>${safe(d.water)}</b></div>`
        : `<div><small>CYCLE</small><b>≈${d.cycleDays} days</b></div><div><small>OUTPUT</small><b>${safe(d.product)}</b></div><div><small>CLIMATE & CARE</small><b>${safe(d.climate)}</b></div>`}</div>
      <div class="fm-care"><b>CARE & MAINTENANCE</b><ul>${(d.care || []).map((x) => `<li>${safe(x)}</li>`).join("")}</ul></div>
      <p class="fm-estimate-note"></p><button class="ghost fm-defaults">RESTORE CATALOG ESTIMATES</button>`;
    renderDetailFigures();
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
    window.closeGalaxy?.();
    if (window.closeFieldKit) window.closeFieldKit();
    if (window.closeRadar) window.closeRadar();
    if (window.closeCore) window.closeCore();
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn").classList.remove("on");
    panel.hidden = false; document.body.classList.add("farming-open"); $("#farming-btn").classList.add("on");
    chosen = "";
    if (!catalog) {
      $f(".fm-catalog-list").innerHTML = `<p class="lib-note">Opening the field book…</p>`;
      load().then(() => { render(); refreshHousehold(); }).catch(() => { $f(".fm-catalog-list").innerHTML = `<p class="lib-note">The local field book could not be loaded. Close and open Farming to try again.</p>`; });
    } else { render(); refreshHousehold(); }
    if (!quiet) Sound.click();
  }
  build();
  $("#farming-btn").addEventListener("click", () => toggle());
  window.toggleFarming = toggle;
  window.closeFarming = () => { if (!document.getElementById("farming").hidden) toggle(false, true); };
})();
