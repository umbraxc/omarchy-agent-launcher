// Umbra Wiki maps: a country's FULL FILE. Opens from a country card (its
// name, or FULL FILE) and grows to fill the map: a turning 3D globe in
// characters with the country lit, then everything the World Factbook and
// Wikidata say about it, in sections: travel essentials (plugs, mains,
// driving side, emergency numbers…), people, the land, water and health, the
// economy, energy, connections, heritage and wonders, government. Charts and
// drawings are made of characters, in the Umbra theme. Nothing goes online:
// the data comes with Umbra (maps/atlas-more.json).
// Loaded after maps.js, which hands it its helpers (UmbraDossier.init).
"use strict";

window.UmbraDossier = (() => {
  const A = window.Ascii3D;
  let H = null;              // helpers from maps.js
  let el = null, globe = null, timers = [], current = null;
  const esc = (s) => escapeHtml(String(s ?? ""));
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const pctTxt = (v) => (v == null ? "—" : `${+(+v).toFixed(1)}%`);
  const motion = () => !document.body.classList.contains("reduce-motion");

  // ------------------------------------------------------------ drawings
  // Socket faces of the plug types, as seen on the wall.
  const PLUGS = {
    A: [" ┌─────┐ ", " │ ▌ ▐ │ ", " │     │ ", " └─────┘ "], B: [" ┌─────┐ ", " │ ▌ ▐ │ ", " │  ●  │ ", " └─────┘ "],
    C: [" ╭─────╮ ", " │ ● ● │ ", " │     │ ", " ╰─────╯ "], D: [" ╭─────╮ ", " │  ●  │ ", " │ ●  ●│ ", " ╰─────╯ "],
    E: [" ╭─────╮ ", " │  ┬  │ ", " │ ● ● │ ", " ╰─────╯ "], F: [" ╭─────╮ ", " ╡ ● ● ╞ ", " │     │ ", " ╰─────╯ "],
    G: [" ┌─────┐ ", " │  ▮  │ ", " │ ▬ ▬ │ ", " └─────┘ "], H: [" ╭─────╮ ", " │ ╲ ╱ │ ", " │  │  │ ", " ╰─────╯ "],
    I: [" ┌─────┐ ", " │ ╱ ╲ │ ", " │  │  │ ", " └─────┘ "], J: [" ╭─────╮ ", " │ ●  ●│ ", " │  ●  │ ", " ╰─────╯ "],
    K: [" ╭─────╮ ", " │ ● ● │ ", " │  ∪  │ ", " ╰─────╯ "], L: [" ╭─────╮ ", " │●  ●  ●│", " │       │", " ╰───────╯"],
    M: [" ╭─────╮ ", " │  ⬤  │ ", " │⬤   ⬤│ ", " ╰─────╯ "], N: [" ╭─────╮ ", " │ ● ● │ ", " │  ●  │ ", " ╰─────╯ "],
  };
  const PLUG_NOTE = { A: "two flat pins (US/Japan)", B: "two flat pins + earth (US)", C: "Europlug, two round pins", D: "three large round pins (old British)",
    E: "two round pins, earth pin in the socket (France)", F: "Schuko, two round pins, side earth clips", G: "three rectangular pins (UK)",
    H: "three pins in a V (Israel)", I: "two angled flat pins + earth (Australia, China)", J: "three round pins (Switzerland)",
    K: "two round pins + earth (Denmark)", L: "three round pins in a row (Italy)", M: "three large round pins (South Africa)", N: "three round pins (Brazil)" };
  function plugs(list) {
    return list.map((t) => `<figure class="ds-plug" title="Type ${t}|${PLUG_NOTE[t] || ""}"><pre>${esc((PLUGS[t] || PLUGS.C).join("\n"))}</pre><figcaption><b>TYPE ${t}</b><small>${esc(PLUG_NOTE[t] || "")}</small></figcaption></figure>`).join("");
  }
  // A road seen from above, the cars on their side, the dashes moving.
  function road(side, t) {
    const L = side === "left", rows = [];
    for (let r = 0; r < 5; r++) {
      const dash = (r + t) % 3 === 0 ? " " : "¦";
      const up = (r + t) % 5 === 1, down = (r - t + 50) % 5 === 3;
      const a = L ? (up ? "▲" : " ") : (down ? "▼" : " "), b = L ? (down ? "▼" : " ") : (up ? "▲" : " ");
      rows.push(`▓║ ${a} ${dash} ${b} ║▓`);
    }
    return rows.join("\n");
  }
  // Coloured bars made of blocks: [[label, value, colour]].
  const PAL = ["var(--signal)", "var(--net)", "#6fbf5a", "var(--accent)", "#b07ad8", "var(--red)", "#d8c35a", "#5a8fd8", "#c08a5a", "var(--dim)"];
  function stack(parts, unit = "%") {
    const sum = parts.reduce((a, p) => a + p[1], 0) || 1;
    return `<div class="ds-stack">${parts.map((p, i) => `<i style="flex:${p[1] / sum};--c:${p[2] || PAL[i % PAL.length]}" title="${esc(p[0])}|${+p[1].toFixed(1)}${unit}"></i>`).join("")}</div>
      <div class="ds-keys">${parts.map((p, i) => `<span><i style="--c:${p[2] || PAL[i % PAL.length]}"></i>${esc(p[0])} <b>${+p[1].toFixed(1)}${unit}</b></span>`).join("")}</div>`;
  }
  function bars(rows, max = 100, unit = "%") {
    return `<div class="ds-bars">${rows.map(([k, v, c], i) => `<div class="ds-bar"><span>${esc(k)}</span><b style="--w:${Math.max(1.5, Math.min(100, (v / max) * 100))}%;--c:${c || PAL[i % PAL.length]}"><i></i></b><em>${+(+v).toFixed(1)}${unit}</em></div>`).join("")}</div>`;
  }
  function meter(label, v, icon, col = "var(--signal)") {
    if (v == null) return "";
    const n = 24, on = Math.round((Math.max(0, Math.min(100, v)) / 100) * n);
    return `<div class="ds-meter" style="--c:${col}"><span><b class="g">${icon}</b>${esc(label)}</span><pre>${"█".repeat(on)}<i>${"░".repeat(n - on)}</i></pre><em>${pctTxt(v)}</em></div>`;
  }
  // The age pyramid in three bands.
  function ages(a) {
    if (!a || a.every((v) => v == null)) return "";
    const lab = ["65 +", "15–64", "0–14"], vals = [a[2], a[1], a[0]], cols = ["var(--accent)", "var(--signal)", "#6fbf5a"];
    return `<div class="ds-pyr">${vals.map((v, i) => { const w = Math.round(((v || 0) / 70) * 18); const half = "█".repeat(Math.max(1, w));
      return `<div><pre style="--c:${cols[i]}">${half.padStart(18)}│${half.padEnd(18)}</pre><span>${lab[i]} <b>${pctTxt(v)}</b></span></div>`; }).join("")}</div>`;
  }
  // National colours as swatches.
  const NAMED = { red: "#d8412f", white: "#f2f2f2", blue: "#2f5fd0", "light blue": "#7ab8e8", "sky blue": "#7ab8e8", green: "#2e9e4f", yellow: "#f2cd2f",
    gold: "#d8a93a", black: "#111", orange: "#ee8a2a", maroon: "#7a1f2a", purple: "#7a3fa8", brown: "#7a5236", silver: "#b8bec4", azure: "#3f8fe0", crimson: "#c0283e", saffron: "#f39c2b" };
  function swatches(text) {
    const t = String(text || "").toLowerCase(), out = [];
    for (const [name, col] of Object.entries(NAMED).sort((a, b) => b[0].length - a[0].length)) {
      if (t.includes(name) && !out.some((o) => o[0].includes(name))) out.push([name, col]);
    }
    return out.map(([n, c]) => `<span class="ds-sw"><i style="background:${c}"></i>${esc(n)}</span>`).join("");
  }
  // A mountain drawn to the height of the highest point, with the lowest.
  function relief(high, low, mean) {
    const hm = parseFloat(String(high || "").replace(/[^\d.-]+(?=\d)|,/g, "").match(/-?\d+(\.\d+)?$/)?.[0] || "0");
    const rows = Math.max(2, Math.min(7, Math.round(Math.log10(Math.max(10, hm)) * 2 - 1)));
    const art = [];
    for (let r = 0; r < rows; r++) { const w = r * 2 + 1; art.push(" ".repeat(rows - r) + (r === 0 ? "▲" : "/" + "^".repeat(w - 2) + "\\")); }
    art.push("~".repeat(rows * 2 + 2));
    return `<div class="ds-relief"><pre>${esc(art.join("\n"))}</pre><div>${high ? `<p><b class="g">󰔶</b> HIGHEST <span>${esc(high)} m</span></p>` : ""}${mean ? `<p><b class="g">󰐊</b> MEAN <span>${esc(mean)}</span></p>` : ""}${low ? `<p><b class="g">󰁅</b> LOWEST <span>${esc(low)}</span></p>` : ""}</div></div>`;
  }

  // "… per US dollar -; Exchange rates 2024: 151.366 …" -> "151.366 per US dollar (2024)".
  function rate(text, cur) {
    const m = /Exchange rates (\d{4}):\s*([\d.,]+)/.exec(text || "");
    if (!m) return text || "";
    if (/US dollar \(USD\)|^US dollars/i.test(cur || "") && m[2] === "1") return "";
    return `${m[2]} ${(cur || "").replace(/\s*\(.*$/, "")} to 1 US dollar (${m[1]})`;
  }

  // -------------------------------------------------------------- globe
  // The Earth in characters, turned so the country faces you; it sways
  // slowly to and fro around it. Its land is lit in the theme's colour.
  function globeScene(c) {
    const lat0 = (c.label[1] * Math.PI) / 180, lon0 = c.label[0];
    const [x0, y0, x1, y1] = c.box;
    const latN = H.unY(y0), latS = H.unY(y1), lonW = H.unX(x0), lonE = H.unX(x1);
    const step = Math.max(0.12, Math.max(latN - latS, lonE - lonW) / 90);
    const nx = Math.ceil((lonE - lonW) / step) + 1, ny = Math.ceil((latN - latS) / step) + 1;
    const inside = H.inside(c), mask = new Uint8Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) mask[j * nx + i] = inside(latN - j * step, lonW + i * step) ? 1 : 0;
    const inC = (lat, lon) => { const i = Math.round((lon - lonW) / step), j = Math.round((latN - lat) / step); return i >= 0 && j >= 0 && i < nx && j < ny && mask[j * nx + i]; };
    const cap = c.facts && c.facts.capitalAt;
    const sig = A.hex(css("--signal") || "#e8d27c"), net = A.hex(css("--net") || "#5fb8c9"), red = A.hex(css("--red") || "#e06a6a");
    const land = (lat, lon) => (window.UmbraOrrery ? UmbraOrrery.isLand(lat, lon) : false);
    const sway = (t) => (motion() ? Math.sin(t * 0.25) * 38 : 0);
    return {
      camera: () => ({ pos: [0, 0, 2.9], at: [0, 0, 0], fovV: 44 }), light: [-0.35, 0.3, 0.9], ambient: 0.42, shadows: false, shimmerFps: 14, stillTime: 0,
      sky: (u, v, t, col, row) => (A.hash2(col, row) > 0.982 ? ["·", [210, 220, 240], 0.25 + 0.3 * Math.sin(t * (1 + A.hash2(row, col)) + col)] : null),
      map: (x, y, z, t, h) => { h.m = "earth"; return Math.hypot(x, y, z) - 1; },
      materials: {
        earth: { color: net, ramp: " .:-=+*#%@", shade(cl, t) {
          const nyv = cl.ny * Math.cos(lat0) + cl.nz * Math.sin(lat0), nzv = -cl.ny * Math.sin(lat0) + cl.nz * Math.cos(lat0);
          const lat = (Math.asin(Math.max(-1, Math.min(1, nyv))) * 180) / Math.PI;
          let lon = lon0 + (Math.atan2(cl.nx, nzv) * 180) / Math.PI + sway(t);
          lon = ((lon + 540) % 360) - 180;
          const rim = Math.max(0, 1 - cl.nz);
          if (cap && Math.abs(lat - cap[0]) < Math.max(1.4, step * 2) && Math.abs(lon - cap[1]) < Math.max(1.4, step * 2) / Math.max(0.3, Math.cos((lat * Math.PI) / 180))) {
            cl.color = red; cl.glyph = "◆"; cl.emit = 0.75 + 0.25 * Math.sin(t * 4); return;
          }
          if (inC(lat, lon)) { cl.color = sig; cl.glyph = A.hash2(Math.floor(lat * 3), Math.floor(lon * 3)) > 0.5 ? "#" : "%"; cl.emit = 0.55 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2 + lat * 0.4)); return; }
          if (land(lat, lon)) { cl.color = A.mix([70, 110, 70], [150, 140, 100], A.noise2(lat * 0.2, lon * 0.2)); cl.glyph = A.hash2(Math.floor(lat), Math.floor(lon)) > 0.6 ? ":" : "+"; }
          else { cl.color = A.mix([30, 60, 90], net, 0.35 + 0.25 * A.noise2(lat * 0.15 + t * 0.2, lon * 0.15)); cl.glyph = A.noise2(lat * 0.3 + t * 0.3, lon * 0.3) > 0.55 ? "~" : "-"; }
          if (rim > 0.82) { cl.color = A.mix(cl.color, [150, 210, 255], 0.6); cl.glyph = "·"; }
        } },
      },
      // A thin ring of air round the planet and a satellite crossing it.
      particles(t, put) {
        if (!motion()) return;
        for (let i = 0; i < 3; i++) { const a = t * (0.35 + i * 0.12) + i * 2.1, r = 1.32 + i * 0.07, tilt = 0.5 + i * 0.4;
          put(Math.cos(a) * r, Math.sin(a) * r * Math.sin(tilt), Math.sin(a) * r * Math.cos(tilt), i ? "·" : "✦", i ? [150, 200, 230] : [255, 230, 160], 0.85); }
      },
    };
  }

  // ------------------------------------------------------------ sections
  const SECTIONS = [
    ["overview", "󰋽", "OVERVIEW"], ["travel", "󰞇", "TRAVEL ESSENTIALS"], ["people", "󰡉", "PEOPLE"], ["land", "󰔶", "THE LAND"],
    ["water", "󰖌", "WATER & HEALTH"], ["economy", "󰈀", "ECONOMY"], ["energy", "󱐋", "ENERGY"], ["links", "󰀂", "CONNECTIONS"],
    ["heritage", "󰮃", "HERITAGE & WONDERS"], ["state", "󰇲", "GOVERNMENT & SECURITY"], ["sources", "󰈙", "SOURCES"],
  ];
  const row = (k, v, cls = "") => (v ? `<div class="ds-row ${cls}"><span>${esc(k)}</span><p>${esc(v)}</p></div>` : "");
  const tile = (icon, k, v, sub = "", col = "") => (v ? `<div class="ds-tile" ${col ? `style="--c:${col}"` : ""}><b class="g">${icon}</b><span>${esc(k)}</span><p>${esc(v)}</p>${sub ? `<small>${esc(sub)}</small>` : ""}</div>` : "");
  const sec = (id, body) => { const s = SECTIONS.find((x) => x[0] === id); return body.trim() ? `<section class="ds-sec" data-sec="${id}"><h3><b class="g">${s[1]}</b>${s[2]}</h3>${body}</section>` : ""; };
  const chips = (text, icon = "󰄬") => String(text || "").replace(/\([^)]*\d{4}[^)]*\)/g, "").split(/[,;]\s*/).map((s) => s.trim()).filter((s) => s && s.length < 60)
    .slice(0, 14).map((s) => `<span class="ds-chip"><b class="g">${icon}</b>${esc(s)}</span>`).join("");
  const SRC = { fossil: ["Fossil fuels", "#8a7a6a"], nuclear: ["Nuclear", "#b07ad8"], solar: ["Solar", "#f2cd2f"], wind: ["Wind", "#9ad0e0"], hydro: ["Hydro", "#3f8fe0"],
    geothermal: ["Geothermal", "#e06a3a"], biomass: ["Biomass & waste", "#6fbf5a"], tide: ["Tide & wave", "#2fb0a0"] };

  function render(c, m) {
    const f = c.facts || {}, p = m.people || {}, l = m.land || {}, e = m.econ || {}, en = m.energy || {}, co = m.comms || {}, tr = m.transport || {}, g = m.gov || {}, pr = m.practical || {};
    const wonders = window.UmbraWonders ? UmbraWonders.inCountry(c.a3) : [];
    const overview = `
      ${m.intro ? `<p class="ds-intro">${esc(m.intro)}</p>` : ""}
      <div class="ds-tiles">
        ${tile("󰆧", "CAPITAL", f.capital, f.capitalAt ? `${H.fmtLat(f.capitalAt[0])} ${H.fmtLon(f.capitalAt[1])}` : "", "var(--red)")}
        ${tile("󰡉", "PEOPLE", f.population, p.median ? `median age ${p.median.replace(/\s*\(.*\)/, "")}` : "")}
        ${tile("󰒗", "AREA", (f.area || "").replace(/\s*;.*$/, ""), l.comparative)}
        ${tile("󰗊", "LANGUAGES", (f.languages || p.languages || "").split(/[,;]/)[0])}
        ${tile("󰈀", "CURRENCY", f.currency, "", "#6fbf5a")}
        ${tile("󰥔", "TIME", f.utc)}
        ${tile("󰇲", "GOVERNMENT", g.type || f.government)}
        ${tile("󰈻", "NATIONALITY", m.nat && m.nat.adj, m.nat && m.nat.noun)}
      </div>
      <div class="ds-two">
        <div class="ds-flagbox">${c.flag ? `<img src="flags/${esc(c.iso)}.png" alt="">` : ""}
          ${g.flag ? `<p><b>THE FLAG</b> ${esc(g.flag)}</p>` : ""}${g.flagStory ? `<p class="ds-dim">${esc(g.flagStory)}</p>` : ""}</div>
        <div>
          ${g.colors ? `<div class="ds-row"><span>COLOURS</span><p class="ds-sws">${swatches(g.colors) || esc(g.colors)}</p></div>` : ""}
          ${row("SYMBOLS", g.symbols)}
          ${g.anthem && g.anthem.title ? `<div class="ds-row"><span>ANTHEM</span><p><b class="g ds-note">󰝚</b> ${esc(g.anthem.title)}${g.anthem.by ? `<small>${esc(g.anthem.by)}</small>` : ""}${g.anthem.history ? `<small>${esc(g.anthem.history)}</small>` : ""}</p></div>` : ""}
          ${row("HOLIDAY", g.holiday)}${row("INDEPENDENCE", g.independence)}${row("ETHNIC GROUPS", m.ethnic)}
        </div>
      </div>`;
    const em = pr.emergency || [];
    const travel = `
      ${em.length ? `<div class="ds-sos">${em.map(([n, u]) => `<div class="ds-sosn ${/all|police|ambulance|fire/.test(u) ? "" : "minor"}"><b>${esc(n)}</b><span>${esc(u.toUpperCase())}</span></div>`).join("")}</div>` : ""}
      <div class="ds-two">
        <div>${pr.plugs && pr.plugs.length ? `<div class="ds-sub"><b class="g">󰚥</b> PLUGS & SOCKETS</div><div class="ds-plugs">${plugs(pr.plugs)}</div>` : ""}
          <div class="ds-tiles small">${tile("󱐋", "MAINS", pr.volts && pr.volts.length ? pr.volts.join(" / ") + " V" : "", pr.hz ? `${pr.hz} Hz` : "", "#f2cd2f")}
            ${tile("󰏲", "CALLING CODE", pr.calling, "", "var(--net)")}${tile("󰖟", "INTERNET", pr.tld || co.tld, "", "var(--net)")}
            ${tile("󰀝", "AIRCRAFT PREFIX", tr.prefix)}</div></div>
        <div>${pr.drive ? `<div class="ds-sub"><b class="g">󰄋</b> DRIVING</div><div class="ds-drive"><pre class="ds-road" data-side="${esc(pr.drive)}">${esc(road(pr.drive, 0))}</pre>
            <p><b>KEEP ${esc(pr.drive.toUpperCase())}</b><small>${pr.drive === "left" ? "Traffic drives on the left: look right first when crossing." : "Traffic drives on the right: look left first when crossing."}</small></p></div>` : ""}
          ${row("CURRENCY", f.currency)}${row("EXCHANGE", rate(e.rates, f.currency))}${row("TIME", f.utc)}${row("RELIGION", f.religions)}</div>
      </div>`;
    const people = `
      <div class="ds-two">
        <div><div class="ds-sub"><b class="g">󰙅</b> AGE</div>${ages(p.age)}
          <div class="ds-tiles small">${tile("󰃭", "MEDIAN AGE", p.median)}${tile("󰐕", "GROWTH", p.growth)}${tile("󰥳", "LIFESPAN", f.life)}${tile("󰎔", "CHILDREN / WOMAN", p.fertility)}</div></div>
        <div>${p.religions && p.religions.length ? `<div class="ds-sub"><b class="g">󰓎</b> BELIEF</div>${bars(p.religions.slice(0, 7).map(([k, v]) => [k, v]))}` : ""}
          ${meter("Living in towns", p.urban, "󰀘")}</div>
      </div>
      ${row("LANGUAGES", f.languages || p.languages)}${row("CITIES", p.cities)}${row("SPREAD", p.distribution)}
      ${row("BIRTHS", p.births)}${row("DEATHS", p.deaths)}${row("SCHOOL", p.school ? p.school + " of schooling" : "")}`;
    const lu = l.use || {};
    const land = `
      <div class="ds-two">
        <div>${c.main.length ? `<pre class="ds-sil">${H.silhouette(c)}</pre>` : ""}${relief(f.highest, f.lowest, l.mean)}</div>
        <div>${Object.keys(lu).length ? `<div class="ds-sub"><b class="g">󰉕</b> LAND USE</div>${stack([["Arable", lu.arable, "#d8c35a"], ["Crops", lu.crops, "#a8c84a"], ["Pasture", lu.pasture, "#6fbf5a"], ["Forest", lu.forest, "#2e7a4f"], ["Other", lu.other, "var(--dim)"]].filter((x) => x[1]))}` : ""}
          ${row("CLIMATE", f.climate)}${row("TERRAIN", f.terrain)}${row("SIZE", l.comparative)}${row("COAST", f.coastline)}${row("BORDERS", l.boundaries)}</div>
      </div>
      ${f.neighbours ? `<div class="ds-sub"><b class="g">󰆧</b> NEIGHBOURS</div><div class="ds-nbrs">${f.neighbours.split(/;\s*/).map((n) => `<button class="ds-nbr" data-c="${esc(n.replace(/\s*\(.*$/, ""))}">${esc(n)}</button>`).join("")}</div>` : ""}
      ${f.hazards ? `<div class="ds-warn"><b class="g">󰀦</b><div><b>NATURAL HAZARDS</b><p>${esc(f.hazards)}</p></div></div>` : ""}
      ${row("ENVIRONMENT", l.issues, "warn")}${row("NOTE", l.note)}${row("SEAS", l.maritime)}${row("CO₂", l.co2)}`;
    const water = `
      ${f.waterKm3 || (f.rivers && f.rivers.length) ? `<pre class="ds-river" data-km3="${f.waterKm3 || 0}"></pre>` : ""}
      <div class="ds-two">
        <div>${meter("Safe water · towns", p.drink && p.drink[0], "󰖌", "var(--net)")}${meter("Safe water · countryside", p.drink && p.drink[1], "󰖌", "var(--net)")}${meter("Sanitation", p.sanitation, "󰦡", "#6fbf5a")}
          ${row("FRESH WATER", f.waterRes ? f.waterRes + " a year, renewable" : "")}${row("RIVERS", (f.rivers || []).join("; "))}${row("LAKES", (f.lakes || []).join("; "))}${row("BASINS", l.watersheds)}${row("AQUIFERS", l.aquifers)}</div>
        <div><div class="ds-tiles small">${tile("󰋠", "DOCTORS", f.doctors, "", "var(--red)")}${tile("󰋡", "HOSPITAL BEDS", f.beds, "", "var(--red)")}${tile("󰉚", "INFANT DEATHS", p.infant)}${tile("󰉪", "OBESITY", p.obesity)}</div>
          ${row("HEALTH SPENDING", p.healthSpend)}</div>
      </div>`;
    const sectorRows = [["Farming", e.sectors && e.sectors.agri, "#6fbf5a"], ["Industry", e.sectors && e.sectors.industry, "var(--accent)"], ["Services", e.sectors && e.sectors.services, "var(--net)"]].filter((x) => x[1]);
    const economy = `
      ${e.overview ? `<p class="ds-intro">${esc(e.overview)}</p>` : ""}
      <div class="ds-tiles">${tile("󰄨", "GDP (PPP)", e.gdp)}${tile("󰆗", "PER PERSON", e.perCap, "", "#6fbf5a")}${tile("󰄪", "GROWTH", e.growth)}${tile("󰔵", "INFLATION", e.inflation, "", "var(--accent)")}${tile("󰖷", "JOBLESS", e.unemployment)}${tile("󰉀", "BELOW POVERTY", e.poverty, "", "var(--red)")}</div>
      ${sectorRows.length ? `<div class="ds-sub"><b class="g">󰕘</b> WHERE THE MONEY IS MADE</div>${stack(sectorRows)}` : ""}
      <div class="ds-two">
        <div><div class="ds-sub"><b class="g">󰁝</b> EXPORTS ${e.exports && e.exports.value ? `· ${esc(e.exports.value)}` : ""}</div>${e.exports && e.exports.partners && e.exports.partners.length ? bars(e.exports.partners, Math.max(...e.exports.partners.map((x) => x[1])) * 1.1) : ""}${row("GOODS", e.exports && e.exports.goods)}</div>
        <div><div class="ds-sub"><b class="g">󰁅</b> IMPORTS ${e.imports && e.imports.value ? `· ${esc(e.imports.value)}` : ""}</div>${e.imports && e.imports.partners && e.imports.partners.length ? bars(e.imports.partners, Math.max(...e.imports.partners.map((x) => x[1])) * 1.1) : ""}${row("GOODS", e.imports && e.imports.goods)}</div>
      </div>
      ${f.resources ? `<div class="ds-sub"><b class="g">󰆧</b> NATURAL RESOURCES</div><div class="mp-cf-resrow">${H.resourceChips(f.resources)}</div>${row("ALL", f.resources)}` : ""}
      ${e.farm ? `<div class="ds-sub"><b class="g">󰹩</b> FARMS GROW</div><div class="ds-chips">${chips(e.farm, "󰹩")}</div>` : ""}
      ${e.industries ? `<div class="ds-sub"><b class="g">󰣸</b> INDUSTRIES</div><div class="ds-chips">${chips(e.industries, "󰣸")}</div>` : ""}
      ${row("WORKERS", e.labor)}${row("PUBLIC DEBT", e.debt)}`;
    const srcRows = Object.entries(en.sources || {}).filter(([, v]) => v > 0.05).sort((a, b) => b[1] - a[1]).map(([k, v]) => [SRC[k] ? SRC[k][0] : k, v, SRC[k] && SRC[k][1]]);
    const energy = `
      ${meter("Homes with electricity", en.access, "󰌵", "#f2cd2f")}
      ${srcRows.length ? `<div class="ds-sub"><b class="g">󱐋</b> ELECTRICITY COMES FROM <small>(share of capacity)</small></div>${stack(srcRows)}` : ""}
      <div class="ds-tiles small">${tile("󰚥", "CAPACITY", en.capacity)}${tile("󰠠", "CONSUMPTION", en.use)}${tile("󰘡", "OIL", en.oil, "", "#8a7a6a")}${tile("󰈸", "GAS", en.gas)}${tile("󰐗", "COAL", en.coal)}</div>
      ${row("PER PERSON", en.perCap)}${row("NUCLEAR", en.nuclear)}`;
    const links = `
      <div class="ds-two"><div>${meter("Online", co.internet, "󰖟", "var(--net)")}
        ${co.mobile != null ? meter("Mobile lines per 100 people", Math.min(100, co.mobile), "󰏲", "var(--signal)").replace(/<em>.*?<\/em>/, `<em>${co.mobile}</em>`) : ""}
        ${co.broadband != null ? meter("Broadband per 100 people", co.broadband, "󰈀", "#6fbf5a").replace(/<em>.*?<\/em>/, `<em>${co.broadband}</em>`) : ""}</div>
        <div class="ds-tiles small">${tile("󰀝", "AIRPORTS", tr.airports)}${tile("󰔬", "HELIPORTS", tr.heliports)}${tile("󰔬", "RAILWAYS", tr.rail)}${tile("󰞌", "PORTS", tr.ports)}${tile("󰞌", "MERCHANT SHIPS", tr.ships)}</div></div>
      ${row("KEY PORTS", tr.keyPorts)}${row("BROADCAST", co.media)}`;
    const heritageSites = (g.heritage && g.heritage.sites) || [];
    const heritage = `
      ${wonders.length ? `<div class="ds-sub"><b class="g">󰮃</b> WONDERS ON THE MAP</div><div class="ds-wonders">${wonders.map((w) => `<button class="ds-wonder" data-w="${esc(w.id)}"><i class="ds-wart" data-w="${esc(w.id)}"></i><b>${esc(w.name)}</b><small>${esc(w.kind)} · ${esc(w.when)}</small></button>`).join("")}</div>` : ""}
      ${g.heritage && g.heritage.total ? `<div class="ds-sub"><b class="g">󰘏</b> UNESCO WORLD HERITAGE · ${esc(g.heritage.total)}</div>` : ""}
      ${heritageSites.length ? `<div class="ds-sites">${heritageSites.map(([n, k]) => `<span class="ds-site k-${esc(k)}" title="${k === "n" ? "Natural" : k === "m" ? "Mixed" : "Cultural"}|A World Heritage Site."><b class="g">${k === "n" ? "󰔶" : k === "m" ? "󰉕" : "󰮃"}</b>${esc(n)}</span>`).join("")}</div>` : ""}`;
    const state = `
      <div class="ds-tiles small">${tile("󰇲", "SYSTEM", g.type || f.government)}${tile("󰀉", "CHIEF OF STATE", g.chief)}${tile("󰀉", "HEAD OF GOVERNMENT", g.head)}</div>
      ${row("LAW", g.legal)}${row("VOTING", g.suffrage)}${row("REGIONS", g.divisions)}
      ${f.forces || f.personnel ? `<div class="ds-sub"><b class="g">󰃬</b> ARMED FORCES</div>${f.personnel ? `<div class="mp-cf-mil"><span class="g">\u{F0D3A}</span><b>${esc(f.personnel)}</b></div>` : ""}${row("FORCES", f.forces)}${row("SPENDING", f.spending)}${row("SERVICE", f.service)}${row("ABROAD", f.deployments)}${row("ARMED GROUPS", f.groups, "warn")}` : ""}
      ${m.space ? `<div class="ds-sub"><b class="g">󰑣</b> IN SPACE</div>${row("AGENCY", m.space.agency)}${row("LAUNCH SITES", m.space.sites)}${row("PROGRAMME", m.space.overview)}` : ""}
      ${row("REFUGEES", m.refugees)}`;
    const sources = `
      <ul class="ds-refs">
        <li><b class="g">󰈙</b><div><b>The World Factbook</b>, Central Intelligence Agency, 2026 edition, via factbook.json (${esc(m.source || "—")}.json). Public domain.</div></li>
        <li><b class="g">󰈙</b><div><b>Wikidata</b>: plugs, mains, driving side, calling code, emergency numbers, internet domain. CC0.</div></li>
        <li><b class="g">󰈙</b><div><b>Natural Earth</b>: outline, cities and the globe's land. Public domain.</div></li>
        <li><b class="g">󰋽</b><div>Figures are the latest estimates in the sources; laws, leaders and prices change. Check before you rely on them.</div></li>
      </ul>
      <div class="ds-actions"><button class="ghost" data-act="library"><b class="g">󱉟</b> FIND IN LIBRARY</button><button class="ghost" data-act="ask"><b class="g">󰭹</b> ASK UMBRA</button><button class="ghost" data-act="fly"><b class="g">󰆋</b> SHOW ON MAP</button></div>`;
    const body = { overview, travel, people, land, water, economy, energy, links, heritage, state, sources };
    return `
      <div class="ds-card">
        <header class="ds-head">
          <div class="ds-globe"><canvas></canvas><span class="ds-globe-tag">${esc(H.fmtLat(c.label[1]))} ${esc(H.fmtLon(c.label[0]))}</span></div>
          <div class="ds-title">
            <span class="ds-tag">FULL COUNTRY FILE · ${esc(c.a3)}${m.source ? ` · FACTBOOK ${esc(m.source.toUpperCase())}` : ""}</span>
            <div class="ds-name">${c.flag ? `<img src="flags/${esc(c.iso)}.png" alt="">` : ""}<h2 data-text="${esc(c.name.toUpperCase())}">${esc(c.name.toUpperCase())}</h2></div>
            ${f.long && !/^none$/i.test(f.long) ? `<small>${esc(f.long)}</small>` : ""}
            ${f.location ? `<small>${esc(f.location)}</small>` : ""}
            <div class="ds-quick">${pr.emergency && pr.emergency[0] ? `<span class="sos"><b class="g">󰀦</b>${esc(pr.emergency[0][0])}</span>` : ""}${pr.plugs && pr.plugs.length ? `<span><b class="g">󰚥</b>${pr.plugs.join(" ")}</span>` : ""}${pr.volts && pr.volts.length ? `<span><b class="g">󱐋</b>${pr.volts.join("/")} V</span>` : ""}${pr.drive ? `<span><b class="g">󰄋</b>${esc(pr.drive)}</span>` : ""}${pr.calling ? `<span><b class="g">󰏲</b>${esc(pr.calling)}</span>` : ""}</div>
          </div>
          <button class="ghost ds-x" title="Back to the map · Esc">✕ CLOSE</button>
        </header>
        <div class="ds-main">
          <nav class="ds-nav">${SECTIONS.filter(([id]) => body[id].replace(/<[^>]+>|\s/g, "")).map(([id, icon, name]) => `<button data-go="${id}"><b class="g">${icon}</b>${name}</button>`).join("")}</nav>
          <div class="ds-scroll">${SECTIONS.map(([id]) => sec(id, body[id])).join("")}</div>
        </div>
      </div>`;
  }

  // -------------------------------------------------------- open / close
  function stop() { timers.forEach(clearInterval); timers = []; globe?.stop(); globe = null; window.UmbraWonders?.stopMinis?.(el); }
  async function open(c, fromRect) {
    if (!H) return;
    current = c;
    let m = {};
    try { m = await (await fetch(`/api/maps/country?a3=${encodeURIComponent(c.a3)}`)).json(); } catch {}
    if (current !== c) return;
    stop();
    if (!el) { el = document.createElement("div"); el.className = "ds"; $("#maps .mp-body").appendChild(el); }
    el.innerHTML = render(c, m);
    el.hidden = false;
    // Grows from the card it was opened from.
    const body = $("#maps .mp-body").getBoundingClientRect();
    if (fromRect && motion()) {
      el.style.setProperty("--from-x", `${fromRect.left - body.left}px`); el.style.setProperty("--from-y", `${fromRect.top - body.top}px`);
      el.style.setProperty("--from-w", `${fromRect.width}px`); el.style.setProperty("--from-h", `${fromRect.height}px`);
      el.classList.remove("grow"); void el.offsetWidth; el.classList.add("grow");
    }
    Sound.glitch();
    window.track?.("dossiers", c.a3);
    wire(c, m);
    return true;
  }
  function wire(c, m) {
    const card = el.querySelector(".ds-card");
    card.querySelector(".ds-x").addEventListener("click", () => close());
    el.addEventListener("click", (e) => { if (e.target === el) close(); }, { once: true });
    const scroll = card.querySelector(".ds-scroll");
    card.querySelectorAll(".ds-nav button").forEach((b) => b.addEventListener("click", () => {
      // Only the file's own column scrolls (scrollIntoView would also move the map behind it).
      const target = scroll.querySelector(`[data-sec="${b.dataset.go}"]`);
      if (target) scroll.scrollTo({ top: target.offsetTop - 4, behavior: motion() ? "smooth" : "auto" });
      card.querySelectorAll(".ds-nav button").forEach((x) => x.classList.toggle("on", x === b)); Sound.click();
    }));
    // The section in view lights its button.
    const io = new IntersectionObserver((es) => { for (const x of es) if (x.isIntersecting) card.querySelectorAll(".ds-nav button").forEach((b) => b.classList.toggle("on", b.dataset.go === x.target.dataset.sec)); },
      { root: scroll, rootMargin: "0px 0px -70% 0px" });
    scroll.querySelectorAll(".ds-sec").forEach((s) => io.observe(s));
    card.querySelectorAll(".ds-nbr").forEach((b) => b.addEventListener("click", () => H.openCountry(b.dataset.c).then((ok) => { if (ok) setTimeout(() => H.full(), 450); else Sound.error(); })));
    card.querySelectorAll(".ds-wonder").forEach((b) => b.addEventListener("click", () => { close(true); window.UmbraWonders?.open(b.dataset.w, true); }));
    card.querySelector("[data-act=ask]")?.addEventListener("click", () => H.ask(c));
    card.querySelector("[data-act=fly]")?.addEventListener("click", () => close());
    card.querySelector("[data-act=library]")?.addEventListener("click", () => H.library(c));
    // Living pieces: the globe, the road, the river.
    const cv = card.querySelector(".ds-globe canvas");
    if (cv) requestAnimationFrame(() => { if (el.hidden) return; globe = A.view(cv, globeScene(c), { cell: 7 }); });
    const rd = card.querySelector(".ds-road");
    if (rd && motion()) { let t = 0; timers.push(setInterval(() => { if (!rd.isConnected) return; rd.textContent = road(rd.dataset.side, ++t); }, 260)); }
    const rv = card.querySelector(".ds-river");
    if (rv) { const R = H.river(+rv.dataset.km3); let t = 0; rv.textContent = R.frame(0).split("\n").map((r) => r.repeat(3)).join("\n"); if (motion()) timers.push(setInterval(() => { if (rv.isConnected) rv.textContent = R.frame(++t).split("\n").map((r) => r.repeat(3)).join("\n"); }, 220)); }
    window.UmbraWonders?.minis?.(card);
  }
  function close(quiet = false) {
    if (!el || el.hidden) return false;
    stop(); el.hidden = true; current = null;
    if (!quiet) Sound.click();
    return true;
  }
  const isOpen = () => !!el && !el.hidden;
  return { init(helpers) { H = helpers; }, open, close, isOpen };
})();
