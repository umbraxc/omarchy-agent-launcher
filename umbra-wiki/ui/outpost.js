// Umbra Outpost: an offline idle game with skills, a stockpile, gear,
// combat, expeditions and companions. The rules run in the backend
// (outpost.py); this draws the game and keeps its bars moving.
"use strict";
(() => {
  const button = document.getElementById("outpost-btn");
  const panel = document.createElement("section");
  panel.id = "outpost"; panel.className = "loadout op"; panel.hidden = true;
  panel.dataset.quiet = "1";   // the Outpost plays its own button sounds, one per press
  panel.setAttribute("aria-label", "Umbra Outpost game");
  panel.innerHTML = `<header class="lo-head op-head"><span class="lo-title">✦ UMBRA OUTPOST</span>
      <div class="op-top" role="status" aria-live="polite"></div><button class="op-close" type="button">CLOSE ✕</button></header>
    <div class="op-shell"><nav class="op-nav" aria-label="Outpost sections"></nav>
      <main class="op-main"><div class="op-hero"></div><div class="op-view"></div></main></div>
    <div class="op-toasts" aria-live="polite"></div><div class="op-layer" hidden></div>`;
  document.body.appendChild(panel);
  const $o = (s) => panel.querySelector(s);
  const clean = (v) => escapeHtml(String(v ?? ""));

  let D = null, V = null, sel = "overview", busy = false, skew = 0, poll = 0, art = null, artKey = "", pressed = false;
  let lastStartClick = -1e9;
  let lastBody = "", lastNav = "", lastTop = "", pick = null, bankTab = "all", prevXp = null, prevCombat = null, area = "outskirts";

  // ------------------------------------------------------------ formatting
  const now = () => Date.now() / 1000 + skew;
  const fmt = (n) => { n = Math.floor(n); return n >= 1e7 ? (n / 1e6).toFixed(1) + "M" : n >= 1e5 ? Math.round(n / 1e3) + "k" : n >= 1e4 ? (n / 1e3).toFixed(1) + "k" : n.toLocaleString(); };
  const secs = (s) => (s < 10 ? s.toFixed(1) : Math.round(s)) + "s";
  const dur = (s) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return h ? `${h}h ${m}m` : m ? `${m}m ${s % 60}s` : `${s}s`; };
  const lvl = (s) => V.levels[s];
  const xpOf = (s) => V.state.xp[s];
  const xpFrac = (s) => { const L = lvl(s); if (L >= 99) return 1; const a = D.xpTable[L], b = D.xpTable[L + 1]; return (xpOf(s) - a) / (b - a); };
  const item = (id) => D.items[id] || { name: id, glyph: "?", rarity: "common" };
  const have = (id) => V.state.bank[id] || 0;
  const skillName = (s) => D.skills[s]?.name || s;
  const roman = (n) => ["", "I", "II", "III", "IV", "V"][n] || n;
  const ROMAN = ["", "I", "II", "III", "IV"];
  // Item icons are small 3D pictures (outpost-models.js), the glyph shows
  // until the picture is ready. Hover any of them for the info box.
  function icon(id, qty, extra = "", size = 72) {
    const it = item(id);
    return `<span class="op-it r-${it.rarity}" style="--ic:${it.color || D.rarityColors[it.rarity]}" data-item="${id}" ${extra}><i class="op-art-i" data-art="item:${id}" data-size="${size}">${clean(it.glyph)}</i>${qty != null ? `<b>${fmt(qty)}</b>` : ""}</span>`;
  }
  const bar = (frac, cls = "", attrs = "") => `<div class="op-bar ${cls}" ${attrs}><i style="width:${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%"></i></div>`;
  const mlevel = (rid) => { const r = D.recipes[rid]; const x = V.state.mastery[r.skill]?.[rid] || 0; let L = 1; while (L < 99 && D.xpTable[L + 1] <= x) L++; return L; };
  const mfrac = (rid) => { const r = D.recipes[rid], x = V.state.mastery[r.skill]?.[rid] || 0, L = mlevel(rid); return L >= 99 ? 1 : (x - D.xpTable[L]) / (D.xpTable[L + 1] - D.xpTable[L]); };
  const poolCap = (s) => 40000 * Object.values(D.recipes).filter((r) => r.skill === s).length;

  // ----------------------------------------------------------- navigation
  const svg = (d) => `<svg class="op-ico" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
  const ICONS = {
    overview: svg('<path d="M2 20 9 9l4 6 3-4 6 9z"/><path d="M15 6h4v3"/>'),
    stockpile: svg('<path d="M3 8h18v12H3z"/><path d="M3 8l2-4h14l2 4M9 12h6"/>'),
    gear: svg('<path d="M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6z"/>'),
    trader: svg('<circle cx="12" cy="12" r="8"/><path d="M14.5 9.5c-.5-1-1.5-1.5-2.5-1.5-1.7 0-3 1-3 2s1 1.7 3 2 3 1 3 2-1.3 2-3 2c-1 0-2-.5-2.5-1.5M12 6v12"/>'),
    companions: svg('<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2-4 2s-4 0-4-2z"/>'),
    log: svg('<path d="M6 3h10l3 3v15H6z"/><path d="M9 9h7M9 13h7M9 17h4"/>'),
    profile: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-6.5 8-6.5s7 2 8 6.5"/>'),
    battle: svg('<path d="m4 4 9 9M4 4h4M4 4v4M20 4l-9 9M20 4h-4M20 4v4M8 16l-3 3M16 16l3 3M10 14l-4 4M14 14l4 4"/>'),
    expeditions: svg('<path d="M5 21V4"/><path d="M5 4h12l-3 4 3 4H5"/>'),
    bounties: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  };
  const SECTIONS = [
    ["OUTPOST", [["profile", ICONS.profile, "Profile"], ["overview", ICONS.overview, "Valley"], ["stockpile", ICONS.stockpile, "Stockpile"], ["gear", ICONS.gear, "Gear"], ["trader", ICONS.trader, "Trader"], ["companions", ICONS.companions, "Companions"], ["log", ICONS.log, "Log & stats"]]],
    ["GATHERING", ["forestry", "salvaging", "fishing", "foraging", "trapping", "quarrying"]],
    ["MAKING", ["cooking", "metalwork", "carpentry", "tailoring", "remedies", "tinkering"]],
    ["SUPPORT", ["hearth", "signals", "scouting"]],
    ["COMBAT", [["battle", ICONS.battle, "Battle"], ["expeditions", ICONS.expeditions, "Expeditions"], ["bounties", ICONS.bounties, "Bounties"]]],
  ];
  function navHtml() {
    const active = V.state.action;
    return SECTIONS.map(([head, rows]) => `<div class="op-nav-group"><small>${head}${head === "COMBAT" ? ` <b>LV ${V.combatLevel}</b>` : ""}</small>` + rows.map((row) => {
      if (Array.isArray(row)) {
        const [id, g, name] = row, on = sel === id, busyHere = active && ((id === "battle" && active.type === "combat" && !active.expedition) || (id === "expeditions" && active.expedition));
        const badge = id === "profile" ? `${V.totalLevel}` : id === "stockpile" ? `${Object.keys(V.state.bank).length}/${V.slots}` : id === "companions" ? `${V.state.companions.length}/${Object.keys(D.companions).length}` : id === "bounties" && V.state.bounty ? `${V.state.bounty.left}` : "";
        return `<button type="button" class="op-nav-row ${on ? "on" : ""}" data-view="${id}" title="${name}"><span class="op-nav-g">${g}</span><span class="op-nav-name">${name}</span>${busyHere ? '<i class="op-live"></i>' : ""}<small>${badge}</small></button>`;
      }
      const s = D.skills[row], on = sel === row, busyHere = active && (active.skill === row || (row === "scouting" && active.type === "scout"));
      return `<button type="button" class="op-nav-row ${on ? "on" : ""}" data-view="${row}" style="--sc:${s.color}" title="${s.name}|Level ${lvl(row)}"><span class="op-nav-g">${s.glyph}</span><span class="op-nav-name">${s.name}</span>${busyHere ? '<i class="op-live"></i>' : ""}<small>${lvl(row)}</small>${bar(xpFrac(row), "op-nav-xp")}</button>`;
    }).join("") + "</div>").join("");
  }
  function topHtml() {
    const a = V.state.action, hp = V.state.hp / V.maxHp;
    let act = `<span class="op-idle">IDLE · choose something to do</span>`;
    if (a) {
      const label = a.type === "combat" ? `⚔\ufe0e ${clean(D.enemies[a.enemy]?.name || "")}${a.expedition ? ` · ${a.wave + 1}/${D.expeditions.find((e) => e.id === a.expedition).enemies.length}` : ""}`
        : a.type === "scout" ? "» Running the route" : `${D.skills[a.skill].glyph} ${clean(D.recipes[a.recipe].name)}`;
      const sc = a.type === "combat" ? "var(--red)" : a.type === "scout" ? D.skills.scouting?.color || "var(--signal)" : D.skills[a.skill].color;
      act = `<button type="button" class="op-act" style="--sc:${sc}" data-view="${a.type === "combat" ? (a.expedition ? "expeditions" : "battle") : a.type === "scout" ? "scouting" : a.skill}"><span class="op-act-l"><span>${label}</span>${a.type === "combat" ? "" : '<em class="op-eta" data-keep="1"></em>'}</span>${a.type === "combat" ? "" : `<div class="op-bar op-prog op-top-prog" data-start="${a.start}" data-int="${a.interval}"><i></i></div>`}</button><button type="button" class="op-stop" data-act="stop" title="Stop|Stop the current action">■</button>`;
    }
    const P = V.state.prestige || 0;
    return `<button type="button" class="op-chip op-prestige-chip p${P}" data-view="profile" title="Prestige|${P ? `Prestige ${ROMAN[P]} of IV.` : "Prestige I unlocks at total level 1,000."} Total level ${V.totalLevel} of ${D.maxTotal}. Open your profile."><span>★ ${P ? ROMAN[P] : "0"}/IV</span> <b>${V.totalLevel}</b></button>
      <span class="op-chip" title="Scrip|The Outpost's currency. Sell items or run the route to earn it.">¤ <b>${fmt(V.state.scrip)}</b></span>
      <span class="op-chip" title="Bounty tokens|Earned by finishing bounties.">✪ <b>${fmt(V.state.tokens)}</b></span>
      <span class="op-chip op-hp" title="Health|${Math.round(V.state.hp)} of ${V.maxHp}. Recovers at camp; eat in a fight.">♥ ${bar(hp, "hp")}<b>${Math.round(V.state.hp)}</b></span>
      <span class="op-current">${act}</span>`;
  }

  // ----------------------------------------------------------------- views
  function heroFor(key) {
    // A 3D scene sits above skill views and combat; it survives updates.
    const skill = D.skills[key] && !["melee", "marksmanship", "gadgetry", "fortitude", "vitality", "bounty"].includes(key) ? key : null;
    if (key === "overview") return "valley";
    if (skill) return "skill:" + skill;
    if (key === "battle" || key === "expeditions") return "duel";
    if (key === "trader") return "trader";
    if (key === "bounty" || key === "bounties") return "board";
    return "";
  }
  function setHero(key) {
    const foe = V.state.action?.type === "combat" ? V.state.action.enemy : key === "expeditions" ? D.expeditions[0].enemies[0] : (D.areas.find((x) => x.id === area) || D.areas[0]).enemies[0];
    const want = heroFor(key) + (key === "battle" || key === "expeditions" ? ":" + foe + ":" + JSON.stringify(V.state.equipment) : "");
    if (want === artKey) return;
    if (art) { art.stop(); art = null; }
    artKey = want;
    const hero = $o(".op-hero");
    hero.innerHTML = "";
    hero.hidden = !want;
    if (!want) return;
    const canvas = document.createElement("canvas");
    canvas.className = "op-art " + (want === "valley" ? "op-art-valley" + ((V.state.prestige || 0) >= 4 ? " golden" : "") : "");
    canvas.setAttribute("aria-hidden", "true");
    const label = document.createElement("div");
    label.className = "op-hero-label";
    hero.append(canvas, label);
    if (want === "valley") art = UmbraOutpostArt.valley(canvas, () => V.state.buildings);
    else if (want.startsWith("skill:")) art = UmbraOutpostArt.skill(canvas, want.slice(6));
    else if (want === "trader") art = UmbraBeings.trader(canvas);
    else if (want === "board") art = UmbraBeings.board(canvas);
    else art = UmbraBeings.duel(canvas, want.split(":")[1], UmbraBeings.outfit(V.state.equipment, D.items));
  }
  $o(".op-hero").addEventListener("pointermove", (e) => valleyHover(e));
  $o(".op-hero").addEventListener("pointerleave", () => { const l = $o(".op-hero-label"); if (l) l.hidden = true; });
  function valleyHover(e) {
    const canvas = $o(".op-art-valley"), label = $o(".op-hero-label");
    if (artKey !== "valley" || !canvas || !art?.project) return;
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 60;
    for (const id of Object.keys(D.buildings)) {
      const [sx, sz] = UmbraOutpostArt.site(id), p = art.project(sx, .4, sz);
      if (!p) continue;
      const d = Math.hypot(p[0] - x, p[1] - y);
      if (d < bd) { bd = d; best = [id, p]; }
    }
    if (!best) { label.hidden = true; return; }
    const [id, p] = best, b = D.buildings[id], L = V.state.buildings[id];
    label.hidden = false;
    label.style.left = `${Math.max(6, Math.min(r.width - 200, p[0] - 95))}px`; label.style.top = `${Math.max(6, p[1] - 95)}px`;
    label.innerHTML = `<b>${clean(b.name).toUpperCase()}</b><span>${L ? `LEVEL ${L}/${D.buildingMax}` : "NOT BUILT"}</span><small>${L ? `${rate(L).toFixed(1)} ${b.supply}/h · ${effectText(b.effect, L)}` : "Build it from the list below."}</small>`;
  }
  const rate = (L) => L * (2 + .4 * L);
  const EFFECT_NAMES = { accuracy: "accuracy", maxhit: "max hit", evasion: "evasion", dr: "damage taken", heal: "food healing", autoeat: "auto-eat", scrip: "scrip from sales", loot: "double loot",
    companion: "companion chance", mastery: "mastery XP", hearth_time: "hearth warmth", tokens: "bounty tokens", ammo: "ammo kept", fragments: "signal fragments" };
  function effectText(eff, k = 1) {
    return Object.entries(eff).map(([key, v]) => {
      const n = +(v * k).toFixed(1), [kind, target] = key.split(":");
      const who = target === "all" ? "every skill" : target === "gather" ? "gathering" : target === "craft" ? "crafting" : target ? skillName(target) : "";
      if (kind === "xp") return `+${n}% ${who} XP`;
      if (kind === "speed") return `${who} ${n}% faster`;
      if (kind === "double") return `+${n}% double ${who}`;
      if (kind === "preserve") return `+${n}% ${who} materials kept`;
      if (key === "dr") return `−${n}% damage taken`;
      return `+${n}% ${EFFECT_NAMES[key] || key}`;
    }).join(", ");
  }

  function overviewHtml() {
    const s = V.state;
    const supplies = D.supplies.map((k) => {
      const prod = Object.entries(D.buildings).filter(([, b]) => b.supply === k).reduce((n, [id]) => n + rate(s.buildings[id]), 0);
      return `<div class="op-sup" title="${k.toUpperCase()}|${prod ? `${prod.toFixed(1)} per hour from the buildings.` : "No building makes this yet."} Used to raise buildings and supply expeditions."><span>${k.toUpperCase()}</span><b>${fmt(s.supplies[k])}</b><small>${prod ? `+${prod.toFixed(1)}/H` : "—"}</small></div>`;
    }).join("");
    const buildings = Object.entries(D.buildings).map(([id, b]) => {
      const L = s.buildings[id], max = L >= D.buildingMax;
      const cost = Object.fromEntries(Object.entries(b.cost).map(([k, v]) => [k, v * (L + 1)]));
      const parts = L >= 5 ? { [b.parts]: 4 * (L - 4) } : {};
      const ok = !max && Object.entries(cost).every(([k, v]) => s.supplies[k] >= v) && Object.entries(parts).every(([k, v]) => have(k) >= v);
      return `<article class="op-card op-build ${L ? "" : "dim"}" data-building-card="${id}" data-level="${L}">
        <div class="op-bart" data-live="b:${id}@${L}"><i class="op-art-r" data-art="building:${id}@${L}" data-size="200"></i></div>
        <header><b>${clean(b.name)}</b><span>LV ${L}/${D.buildingMax}</span></header>
        <div class="op-pips">${Array.from({ length: D.buildingMax }, (_, i) => `<i class="${i < L ? "on" : ""}"></i>`).join("")}</div>
        <p>${L ? `${rate(L).toFixed(1)} ${b.supply}/h · ${effectText(b.effect, L)}` : `Makes ${b.supply}. ${effectText(b.effect)} per level.`}</p>
        ${max ? "" : `<p class="op-next">NEXT · ${rate(L + 1).toFixed(1)} ${b.supply}/h${L + 1 > 5 ? `, holds ${250 + 50 * (L - 4)}` : ""} · ${effectText(b.effect, L + 1)}</p>`}
        ${max ? `<small class="op-done">FULLY UPGRADED</small>` : `<div class="op-cost">${Object.entries(cost).map(([k, v]) => `<span class="${s.supplies[k] >= v ? "" : "short"}">${v} ${k}</span>`).join("")}${Object.entries(parts).map(([k, v]) => `<span class="${have(k) >= v ? "" : "short"}">${icon(k)} ${v}</span>`).join("")}</div>
        <button type="button" data-act="upgrade" data-building="${id}" ${ok ? "" : "disabled"}>${L ? "UPGRADE" : "BUILD"}</button>`}</article>`;
    }).join("");
    const log = s.log.slice(0, 8).map((l) => `<p>› ${clean(l)}</p>`).join("");
    return startHtml() + `<section class="op-sec"><h2>◈ SUPPLIES <small>Buildings keep producing while Umbra is closed.</small></h2><div class="op-sups">${supplies}</div></section>
      <section class="op-sec"><h2>☗ BUILDINGS <small>Each level raises output and a lasting bonus. From level 5 they also need crafted parts.</small></h2><div class="op-grid">${buildings}</div></section>
      <section class="op-sec"><h2>⌁ FIELD LOG</h2><div class="op-log">${log}</div></section>`;
  }

  // First steps, ticked off as they happen; hidden once all are done.
  const STEPS = [
    ["forestry", "Fell a birch tree", "Open FORESTRY on the left and press START.", (s) => s.xp.forestry > 0],
    ["fishing", "Catch a perch", "FISHING works the same way: one action at a time.", (s) => s.xp.fishing > 0],
    ["cooking", "Cook what you caught", "COOKING turns raw fish into food that heals in a fight.", (s) => s.xp.cooking > 0],
    ["overview", "Raise a building", "Supplies grow by themselves; spend them on the buildings below.", (s) => Object.values(s.buildings).reduce((a, b) => a + b, 0) > 3],
    ["gear", "Choose your food and weapon", "In GEAR, pick a food to eat in fights and equip a weapon.", (s) => s.food && s.equipment.weapon],
    ["battle", "Win your first fight", "In BATTLE, the Outskirts are gentle to start with.", (s) => (s.stats.kills || 0) > 0],
  ];
  function startHtml() {
    const s = V.state, done = STEPS.map((st) => !!st[3](s));
    let hide = V.state.options?.start === false; try { hide = hide || localStorage.getItem("umbra-outpost-start") === "hidden"; } catch {}
    if (hide || done.every(Boolean)) return "";
    const next = done.indexOf(false);
    return `<section class="op-sec op-start"><h2>✦ GETTING STARTED <small>${done.filter(Boolean).length} of ${STEPS.length} done</small><button type="button" class="inline" data-hide-start="1">HIDE</button></h2>
      <ol>${STEPS.map(([view, title, hint], i) => `<li class="${done[i] ? "done" : i === next ? "now" : ""}"><button type="button" data-view="${view}"><b>${done[i] ? "✓" : i + 1}</b><span><em>${title}</em><small>${hint}</small></span></button></li>`).join("")}</ol></section>`;
  }
  const SKILL_USES = { forestry: "Logs feed Carpentry, Hearthkeeping and the buildings.", salvaging: "Parts and wire for Tinkering, cloth for Tailoring, vials for Remedies.",
    fishing: "Raw fish for Cooking.", foraging: "Herbs for Remedies and Cooking.", trapping: "Hides for Tailoring, meat for Cooking, feathers for arrows.",
    quarrying: "Ore and coal for Metalwork; clay for bricks.", cooking: "Food heals you in fights.", metalwork: "Bars, melee weapons, armour and arrowtips.",
    carpentry: "Planks for buildings, bows and arrows for Marksmanship.", tailoring: "Leather armour and cloaks.", remedies: "Kit remedies for lasting boosts, medkits that heal.",
    tinkering: "Cells and gadgets for Gadgetry, charms, and parts for buildings.", hearth: "Warmth: more XP in every skill.", signals: "Fragments tune permanent broadcasts.",
    scouting: "Each stop on the route gives a lasting bonus; laps pay scrip.", bounty: "Tokens buy special gear and the way north." };
  function skillHead(s) {
    const sk = D.skills[s], pool = V.state.pool[s] || 0, cap = poolCap(s), m = V.mods;
    const pct = (kind) => (m[`${kind}:all`] || 0) + (m[`${kind}:${s}`] || 0) + (sk.kind === "gather" ? m[`${kind}:gather`] || 0 : 0) + (sk.kind === "craft" ? m[`${kind}:craft`] || 0 : 0);
    const warm = V.state.warmUntil > now() && sk.kind !== "combat";
    const ticks = D.checkpoints.map(([p, , text]) => `<i class="${pool >= cap * p / 100 ? "on" : ""}" style="left:${p}%" title="${p}% checkpoint|${clean(text)}"></i>`).join("");
    const L = lvl(s), next = L < 99 ? D.xpTable[L + 1] - xpOf(s) : 0;
    return `<div class="op-skillhead" style="--sc:${sk.color}"><div class="op-sh-main"><span class="op-sh-g">${sk.glyph}</span><div><h1>${sk.name}</h1><p>${clean(sk.desc)}</p>${SKILL_USES[s] ? `<p class="op-uses">→ ${clean(SKILL_USES[s])}</p>` : ""}${nextUnlock(s)}</div>
        <div class="op-sh-level"><b>${L}</b><small>/ 99</small></div></div>
      <div class="op-sh-bars"><label>XP <span>${fmt(xpOf(s))}${L < 99 ? ` · ${fmt(next)} to level ${L + 1}` : " · MAX"}</span></label>${bar(xpFrac(s), "xp")}
        ${cap ? `<label title="Mastery pool|A quarter of all mastery XP in this skill pools here. Checkpoints give bonuses while the pool stays above them; spend it to raise a recipe's mastery.">MASTERY POOL <span>${fmt(pool)} / ${fmt(cap)} · ${(pool / cap * 100).toFixed(1)}%</span></label><div class="op-pool">${bar(pool / cap, "pool")}${ticks}</div>` : ""}</div>
      <div class="op-sh-mods">${[["XP", pct("xp") + (warm ? m.warm || 0 : 0), "+"], ["SPEED", pct("speed"), "−"], ["DOUBLE", pct("double"), "+"], ["KEEP", pct("preserve"), "+"]].map(([k, v, sign]) =>
        `<span class="${v ? "on" : ""}">${k} <b>${v ? sign + (+v.toFixed(1)) + "%" : "—"}</b></span>`).join("")}${warm ? `<span class="on warm" title="Hearth warmth|While the hearth is warm, every skill gains extra XP.">☼ WARM ${dur(V.state.warmUntil - now())}</span>` : ""}</div></div>`;
  }
  function nextUnlock(s) {
    const r = Object.values(D.recipes).filter((x) => x.skill === s && x.level > lvl(s)).sort((a, b) => a.level - b.level)[0];
    return r ? `<p class="op-unlock">NEXT AT LEVEL ${r.level}: <b>${clean(r.name)}</b></p>` : "";
  }
  function recipeCard(r) {
    const s = V.state, locked = lvl(r.skill) < r.level, active = s.action?.recipe === r.id;
    const inputs = Object.entries(r.inputs).map(([k, n]) => `<span class="${have(k) >= n ? "" : "short"}">${icon(k, have(k))}<em>×${n}</em></span>`).join("");
    let outs = Object.entries(r.outputs).map(([k, n]) => icon(k, n === 1 ? null : n)).join("");
    if (r.table) outs = r.table.map(([k]) => icon(k)).join("");
    if (r.fragment) outs = icon(r.fragment) + `<small>${(18 + lvl("signals") * .25).toFixed(0)}%</small>`;
    if (r.warmth) outs = `<small class="op-warmth">☼ +${r.warmth}s warmth</small>`;
    if (r.bonus) outs += icon(r.bonus[0]);
    const extras = (r.extras || []).map(([k]) => icon(k, null, 'data-rare="1"')).join("");
    const ml = mlevel(r.id), poolNeed = ml < 99 ? D.xpTable[ml + 1] - (s.mastery[r.skill]?.[r.id] || 0) : 0, canSpend = ml < 99 && (s.pool[r.skill] || 0) >= poolNeed && !locked;
    const t = V.intervals[r.id];
    const blocked = !locked && Object.entries(r.inputs).some(([k, n]) => have(k) < n);
    const perHour = 3600 / t, made = Object.values(r.outputs)[0] || (r.table ? 1 : 0);
    return `<article class="op-card op-recipe ${locked ? "locked" : ""} ${active ? "active" : ""}" style="--sc:${D.skills[r.skill].color}" data-recipe-card="${r.id}">
      <div class="op-rart"><i class="op-art-r" data-art="recipe:${r.id}" data-size="180"></i>${active ? `<canvas class="op-rlive" data-live="${r.id}" aria-hidden="true"></canvas>` : ""}</div>
      <div class="op-rbody"><header><b>${clean(r.name)}</b><span class="op-req">${locked ? `🔒\ufe0e LV ${r.level}` : `LV ${r.level}`}</span></header>
      <div class="op-rmeta"><span title="Time|Per action, with your bonuses">◷ ${secs(t)}</span><span>✦ ${fmt(r.xp)} XP</span><span title="Per hour|While you keep at it">${fmt(perHour * r.xp)} XP/H${made ? ` · ${fmt(perHour * made)}/H` : ""}</span>${r.burn ? `<span title="Burn chance|Falls as your level rises above the recipe's.">※ ${Math.max(0, 30 - (lvl(r.skill) - r.level) * 1.5 - ml * .2).toFixed(0)}% burn</span>` : ""}</div>
      ${inputs ? `<div class="op-io"><small>USES</small>${inputs}</div>` : ""}<div class="op-io"><small>${r.table ? "FINDS" : "MAKES"}</small>${outs}${extras ? `<span class="op-rare">${extras}</span>` : ""}</div>
      <div class="op-mastery" title="Mastery|Each level: faster, more doubles${D.skills[r.skill].kind === "craft" ? " and kept materials" : ""}."><span>MASTERY ${ml}</span>${bar(mfrac(r.id), "m")}${canSpend ? `<button type="button" class="op-spend" data-act="mastery" data-recipe="${r.id}" title="Spend pool|${fmt(poolNeed)} pool XP for +1 mastery level">+1</button>` : ""}</div>
      ${active ? `<div class="op-bar op-prog big" data-start="${s.action.start}" data-int="${s.action.interval}"><i></i></div><button type="button" class="op-go on" data-act="stop">STOP ■</button>`
        : `<button type="button" class="op-go" data-act="start" data-recipe="${r.id}" ${locked || blocked ? "disabled" : ""}>${locked ? "LOCKED" : blocked ? "NEED MATERIALS" : "START ▸"}</button>`}</div></article>`;
  }
  function skillHtml(s) {
    const recipes = Object.values(D.recipes).filter((r) => r.skill === s);
    let extra = "";
    if (s === "signals") extra = signalsHtml();
    if (s === "hearth") extra = `<p class="op-note">Burn logs to keep the common hearth warm. While it's warm, every non-combat skill gains <b>+${D.hearthBonus + (V.state.buildings.hearth || 0)}% XP</b>. Warmth stacks up to two hours.</p>`;
    return skillHead(s) + extra + `<section class="op-sec"><div class="op-grid recipes">${recipes.map(recipeCard).join("")}</div></section>`;
  }
  function signalsHtml() {
    return `<section class="op-sec"><h2>◇ BROADCASTS <small>Tune fragments into permanent bonuses: five ranks each.</small></h2><div class="op-grid">${D.bands.map((b) => {
      const open = lvl("signals") >= b.level, frags = have(`${b.id}_fragment`);
      return `<article class="op-card op-band ${open ? "" : "locked"}"><header><b>${clean(b.name)}</b><span>${open ? icon(`${b.id}_fragment`, frags) : `🔒 LV ${b.level}`}</span></header>${b.broadcasts.map((id) => {
        const bc = D.broadcasts[id], rank = V.state.broadcasts[id] || 0, cost = D.broadcastCost[rank];
        return `<div class="op-bc"><span><b>${clean(bc.name)} ${roman(rank)}</b><small>${clean(bc.text)} per rank</small></span><span class="op-pips five">${[1, 2, 3, 4, 5].map((n) => `<i class="${n <= rank ? "on" : ""}"></i>`).join("")}</span>
          ${rank < 5 ? `<button type="button" data-act="tune" data-broadcast="${id}" ${open && frags >= cost ? "" : "disabled"} title="Tune|${cost} fragments">◇ ${cost}</button>` : "<small>MAX</small>"}</div>`;
      }).join("")}</article>`;
    }).join("")}</div></section>`;
  }
  function scoutingHtml() {
    const s = V.state, active = s.action?.type === "scout";
    const course = s.obstacles.filter(Boolean);
    const step = active ? (s.action.step || 0) % Math.max(1, course.length) : -1;
    const slots = D.obstacleSlots.map((need, slot) => {
      const built = s.obstacles[slot], open = lvl("scouting") >= need;
      const options = D.obstacles.filter((o) => o.slot === slot).map((o) => {
        const ok = open && Object.entries(o.cost).every(([k, n]) => have(k) >= n) && s.scrip >= 50 * (slot + 1) ** 2;
        return `<div class="op-ob ${built === o.id ? "on" : ""}"><b>${clean(o.name)}</b><small>${clean(o.text)} · ${secs(o.seconds)} · ${o.xp} XP · ¤${o.scrip}</small>
          ${built === o.id ? `<em>${course.indexOf(o.id) === step ? "◆ RUNNING" : "BUILT"}</em>` : `<div class="op-cost">${Object.entries(o.cost).map(([k, n]) => `<span class="${have(k) >= n ? "" : "short"}">${icon(k)} ${n}</span>`).join("")}<span class="${s.scrip >= 50 * (slot + 1) ** 2 ? "" : "short"}">¤${50 * (slot + 1) ** 2}</span></div>
          <button type="button" data-act="obstacle" data-slot="${slot}" data-obstacle="${o.id}" ${ok ? "" : "disabled"}>${built ? "REPLACE" : "BUILD"}</button>`}</div>`;
      }).join("");
      return `<article class="op-card op-slot ${open ? "" : "locked"}"><header><b>STOP ${slot + 1}</b><span>${open ? "" : `🔒 LV ${need}`}</span></header>${options}</article>`;
    }).join("");
    return skillHead("scouting") + `<section class="op-sec"><h2>» THE ROUTE <small>Each stop gives its bonus while built. Running the route pays scrip at the end of each lap.</small>
      ${active ? `<button type="button" class="op-go on inline" data-act="stop">STOP ■</button>` : `<button type="button" class="op-go inline" data-act="scout" ${course.length ? "" : "disabled"}>RUN THE ROUTE ▸</button>`}</h2>
      ${active ? bar(0, "op-prog big", `data-start="${s.action.start}" data-int="${s.action.interval}"`) : ""}<div class="op-grid slots">${slots}</div></section>`;
  }

  const CATS = [["all", "ALL"], ["material", "MATERIALS"], ["log", "WOOD"], ["ore", "ORE & BARS"], ["herb", "HERBS"], ["raw", "RAW"], ["food", "FOOD"], ["gear", "GEAR"], ["ammo", "AMMO"], ["remedy", "REMEDIES"], ["valuable", "VALUABLES"], ["fragment", "SIGNALS"]];
  const inCat = (it, cat) => cat === "all" || it.cat === cat || (cat === "ore" && it.cat === "bar") || (cat === "material" && ["hide", "material", "junk"].includes(it.cat));
  function stockpileHtml() {
    const s = V.state, ids = Object.keys(s.bank).filter((id) => inCat(item(id), bankTab)).sort((a, b) => item(a).cat.localeCompare(item(b).cat) || item(a).tier - item(b).tier || item(a).name.localeCompare(item(b).name));
    const used = Object.keys(s.bank).length, value = Object.entries(s.bank).reduce((n, [id, q]) => n + item(id).value * q, 0);
    if (pick && !s.bank[pick]) pick = null;
    return `<section class="op-sec"><h2>▦ STOCKPILE <small>${used} / ${V.slots} kinds · worth ¤${fmt(value)}</small><button type="button" class="inline" data-view="trader" title="More room|The Trader sells room in the stockpile: +${D.stockpileStep} kinds for ¤${fmt(V.slotPrice)}">MORE ROOM AT THE TRADER ▸</button></h2>
      ${bar(used / V.slots, used >= V.slots ? "full" : "")}
      <div class="op-tabs">${CATS.map(([c, n]) => `<button type="button" class="${bankTab === c ? "on" : ""}" data-tab="${c}">${n}</button>`).join("")}</div>
      <div class="op-bankwrap"><div class="op-bank">${ids.map((id) => `<button type="button" class="op-cell ${pick === id ? "on" : ""}" data-pick="${id}" data-item="${id}">${icon(id, s.bank[id])}</button>`).join("") || `<p class="op-note">Nothing here yet.</p>`}</div>
      <aside class="op-detail">${pick ? detailHtml(pick) : `<p class="op-note">Select an item to see what it does, equip it or sell it.</p>`}</aside></div></section>`;
  }
  function statsText(it) {
    const st = it.stats || {}, parts = [];
    if (st.style) parts.push(`${st.style === "melee" ? "MELEE" : st.style === "ranged" ? "BOW" : "GADGET"} · ${secs(st.speed)} per attack`);
    if (st.acc) parts.push(`${st.acc > 0 ? "+" : ""}${st.acc} accuracy`);
    if (st.str) parts.push(`+${st.str} ${it.cat === "ammo" ? "damage" : "strength"}`);
    if (st.def) parts.push(`+${st.def} defence`);
    if (st.eva) parts.push(`+${st.eva} evasion`);
    if (it.effect && it.cat !== "remedy") parts.push(effectText(it.effect));
    return parts;
  }
  function detailHtml(id) {
    const it = item(id), q = have(id), eq = it.slot && it.slot !== "kit" && V.state.equipment[it.slot];
    const req = Object.entries(it.req || {}).map(([k, v]) => `<span class="${lvl(k) >= v ? "" : "short"}">${skillName(k)} ${v}</span>`).join("");
    const cur = eq && eq !== id ? item(eq) : null;
    return `<div class="op-dhead">${icon(id, null, "", 160)}<div><b>${clean(it.name)}</b><small class="r-${it.rarity}">${it.rarity.toUpperCase()} · ${it.cat.toUpperCase()}</small></div></div>
      ${it.desc ? `<p>${clean(it.desc)}</p>` : ""}${statsText(it).length ? `<ul>${statsText(it).map((t) => `<li>${clean(t)}</li>`).join("")}</ul>` : ""}
      ${cur ? `<p class="op-cmp">Equipped now: <b>${clean(cur.name)}</b>${statsText(cur).length ? ` · ${clean(statsText(cur).join(", "))}` : ""}</p>` : ""}
      ${req ? `<div class="op-cost">NEEDS ${req}</div>` : ""}
      <p class="op-have">You have <b>${fmt(q)}</b> · ¤${fmt(it.value)} each</p>
      <div class="op-dact">${it.slot ? `<button type="button" data-act="equip" data-item="${id}" ${V.state.equipment[it.slot] === id || V.state.kit?.item === id ? "disabled" : ""}>${it.slot === "kit" ? "USE IN KIT" : it.slot === "ammo" ? "LOAD" : "EQUIP"}</button>` : ""}
        ${it.cat === "food" ? `<button type="button" data-act="food" data-item="${id}" ${V.state.food === id ? "disabled" : ""}>${V.state.food === id ? "IN USE AS FOOD" : "USE AS FOOD"}</button>` : ""}
        ${it.value ? `<button type="button" data-act="sell" data-item="${id}" data-qty="1">SELL 1</button>${q > 10 ? `<button type="button" data-act="sell" data-item="${id}" data-qty="${Math.floor(q / 2)}">SELL HALF</button>` : ""}<button type="button" data-act="sell" data-item="${id}" data-qty="${q}" class="warn">SELL ALL · ¤${fmt(it.value * q)}</button>` : ""}
        <button type="button" class="warn" data-act="discard" data-item="${id}" data-qty="${q}" ${it.value ? 'data-ask="1"' : ""} title="Throw away|${it.value ? "Gone for good, no scrip: selling is usually better." : "Worth nothing: frees its slot in the stockpile."}">✕ THROW AWAY${q > 1 ? ` ALL ${fmt(q)}` : ""}</button></div>`;
  }

  const SLOTS = [["head", "HEAD", "∩"], ["cloak", "CLOAK", "Ω"], ["body", "BODY", "▓"], ["legs", "LEGS", "Π"], ["feet", "FEET", "◡"], ["hands", "HANDS", "ω"], ["weapon", "WEAPON", "/"], ["offhand", "OFF-HAND", "◘"], ["ammo", "QUIVER", "→"], ["charm", "CHARM", "☉"]];
  function gearHtml() {
    const s = V.state, p = V.player;
    const slots = SLOTS.map(([slot, name, g]) => {
      const id = s.equipment[slot], it = id && item(id);
      return `<div class="op-slotbox s-${slot} ${id ? "on" : ""}"><small>${name}</small>${id ? `${icon(id, slot === "ammo" ? have(id) : null)}<b>${clean(it.name)}</b><button type="button" data-act="unequip" data-slot="${slot}" title="Unequip|Back to the stockpile">✕</button>` : `<span class="op-empty">${g}</span><b>—</b>`}</div>`;
    }).join("");
    const kit = s.kit;
    const foods = Object.keys(s.bank).filter((id) => item(id).cat === "food");
    const choose = (cat, act, current) => `<select data-select="${act}"><option value="">—</option>${Object.keys(s.bank).filter((id) => item(id).cat === cat || (cat === "gearslot" && item(id).slot)).map((id) => `<option value="${id}" ${id === current ? "selected" : ""}>${clean(item(id).name)} (${fmt(have(id))})</option>`).join("")}</select>`;
    const triangle = { melee: "beats bows, loses to gadgets", ranged: "beats gadgets, loses to melee", tech: "beats melee, loses to bows" }[p.style];
    return `<section class="op-sec op-gear"><div class="op-doll"><div class="op-figure3d" data-keep="1" aria-hidden="true"></div>${slots}</div>
      <div class="op-gstats"><h2>◈ IN THE FIELD</h2>
        <dl><dt>Style</dt><dd>${p.style === "melee" ? "Melee" : p.style === "ranged" ? "Bow" : "Gadget"} · ${clean(triangle)}</dd>
          <dt>Accuracy</dt><dd>${fmt(p.acc)}</dd><dt>Max hit</dt><dd>${p.maxhit}</dd><dt>Evasion</dt><dd>${fmt(p.eva)}</dd>
          <dt>Damage taken</dt><dd>−${p.dr}%</dd><dt>Attack speed</dt><dd>${secs(p.speed)}</dd><dt>Health</dt><dd>${Math.round(s.hp)} / ${V.maxHp}</dd><dt>Combat level</dt><dd>${V.combatLevel}</dd></dl>
        <label>FOOD <small>eaten automatically below ${V.autoeat}% health</small>${choose("food", "food", s.food)}</label>
        <div class="op-kit"><small>KIT</small>${kit ? `${icon(kit.item)}<b>${clean(item(kit.item).name)}</b><em>${kit.charges} uses left</em><button type="button" data-act="unequip" data-slot="kit">✕</button>` : `<em>Brew a remedy and use it in your kit.</em>`}</div>
        <div class="op-stance"><small>STANCE</small><button type="button" class="${s.stance === "aggressive" ? "on" : ""}" data-act="stance" data-stance="aggressive" title="Aggressive|Fighting trains your attack skill.">AGGRESSIVE</button><button type="button" class="${s.stance === "defensive" ? "on" : ""}" data-act="stance" data-stance="defensive" title="Defensive|Fighting trains Fortitude.">DEFENSIVE</button></div>
        <p class="op-note">Equip gear from the stockpile. Bows need arrows in the quiver; gadgets need cells.</p></div></section>`;
  }

  function traderHtml() {
    const s = V.state;
    const groups = {};
    for (const o of D.trader) if (o.kind === "upgrade") (groups[o.group] = groups[o.group] || []).push(o);
    const upgrades = Object.entries(groups).map(([g, list]) => {
      const tier = s.upgrades[g] || 0, next = list.find((o) => o.tier === tier + 1), cur = list.find((o) => o.tier === tier);
      const ok = next && s.scrip >= next.price && (!next.skill || lvl(next.skill) >= next.level);
      const show = next || cur, key = UmbraOutpostModels.toolKey(show);
      return `<article class="op-card op-offer op-tool" data-tool-card="${key}"><header><b>${clean(cur ? cur.name : (([w]) => w.charAt(0).toUpperCase() + w.slice(1))([list[0].name.split(" ").slice(1).join(" ")]))}</b><span>${tier ? `TIER ${tier}/${list.length}` : "NONE YET"}</span></header>
        <div class="op-bart op-tart" data-live="t:${key}"><i class="op-art-r" data-art="tool:${key}" data-size="220"></i><small>${clean(show.name.toUpperCase())}${next ? "" : " · OWNED"}</small></div>
        <p>${cur ? clean(cur.desc) : "Not owned."}</p>${next ? `<p class="op-next">NEXT · ${clean(next.name)}: ${clean(next.desc)}${next.skill ? ` <span class="${lvl(next.skill) >= next.level ? "" : "short"}">${skillName(next.skill)} ${next.level}</span>` : ""}</p>
        <button type="button" data-act="buy" data-offer="${next.id}" ${ok ? "" : "disabled"}>BUY · ¤${fmt(next.price)}</button>` : `<small class="op-done">BEST AVAILABLE</small>`}</article>`;
    }).join("");
    const goods = D.trader.filter((o) => o.kind === "item").map((o) => `<article class="op-card op-offer"><header>${icon(o.item, o.qty)}<b>${clean(item(o.item).name)}${o.qty > 1 ? ` ×${o.qty}` : ""}</b></header><p>${clean(o.desc)}</p>
      <button type="button" data-act="buy" data-offer="${o.id}" ${s.scrip >= o.price ? "" : "disabled"}>BUY · ¤${fmt(o.price)}</button></article>`).join("");
    const room = `<article class="op-card op-offer op-tool" data-tool-card="shelves@${Math.min(4, s.slotsBought || 0)}"><header><b>Stockpile room</b><span>${V.slots} KINDS</span></header>
        <div class="op-bart op-tart" data-live="t:shelves"><i class="op-art-r" data-art="tool:shelves@${Math.min(4, s.slotsBought || 0)}" data-size="220"></i><small>SHELVES AND CRATES</small></div>
        <p>Room for ${D.stockpileStep} more kinds of item. Each extension costs more than the last.</p>
        <button type="button" data-act="slots" ${s.scrip >= V.slotPrice ? "" : "disabled"}>BUY +${D.stockpileStep} · ¤${fmt(V.slotPrice)}</button></article>`;
    return `<section class="op-sec"><h2>¤ THE TRADER <small>A caravan that stops by the Outpost. Tools make their skill faster; rations keep you fed in a fight.</small></h2><div class="op-grid">${room}${upgrades}</div></section>
      <section class="op-sec"><h2>¤ GOODS</h2><div class="op-grid">${goods}</div></section>`;
  }

  function enemyCard(id, fighting) {
    const e = D.enemies[id], kills = V.state.stats[`kill:${id}`] || 0, beat = D.beats;
    const vs = beat[V.player.style] === e.style ? "good" : beat[e.style] === V.player.style ? "bad" : "";
    return `<article class="op-card op-enemy ${fighting ? "active" : ""}" data-hover-art="creature:${id}"><header><b>${clean(e.name)}</b><span>LV ${e.level}</span></header>
      <div class="op-bart op-creature"><i class="op-art-r" data-art="creature:${id}" data-size="260"></i></div>
      <p>${clean(e.desc)}</p><div class="op-rmeta"><span>♥ ${e.hp}</span><span class="op-style ${vs}" title="Style|${e.style === "melee" ? "Melee" : e.style === "ranged" ? "Ranged" : "Tech"} attacker. ${vs === "good" ? "Your style beats it." : vs === "bad" ? "It beats your style." : ""}">${{ melee: "⚔\ufe0e", ranged: "➶\ufe0e", tech: "✶\ufe0e" }[e.style]} ${e.style.toUpperCase()}</span><span>✕ ${kills}</span></div>
      <div class="op-io"><small>DROPS</small>${e.drops.map(([k]) => icon(k)).join("")}<em>¤${e.scrip[0]}–${e.scrip[1]}</em></div>
      ${fighting ? "" : `<button type="button" class="op-go" data-act="fight" data-enemy="${id}">FIGHT ▸</button>`}</article>`;
  }
  function fightHtml() {
    const a = V.action, e = D.enemies[a.enemy], s = V.state;
    const food = s.food ? `${icon(s.food, have(s.food))}<button type="button" data-act="eat" ${have(s.food) && s.hp < V.maxHp ? "" : "disabled"}>EAT</button>` : `<em>No food chosen</em>`;
    return `<section class="op-sec op-fight"><div class="op-fighter you"><header><b>YOU</b><span>${V.combatLevel}</span></header>${bar(s.hp / V.maxHp, "hp", 'data-hp="you"')}<small><b data-hpnum="you">${Math.round(s.hp)}</b> / ${V.maxHp}</small>
        ${bar(0, "op-swing", `data-swing="you" data-next="${a.pNext}" data-speed="${a.player.speed}"`)}<div class="op-rmeta"><span>HIT ${a.hitChance}%</span><span>MAX ${a.player.maxhit}</span></div><div class="op-food">${food}</div><div class="op-splat" data-splat="you" data-keep="1"></div></div>
      <div class="op-versus">VS</div>
      <div class="op-fighter them"><header><b>${clean(e.name)}</b><span>${e.level}</span></header>${bar(a.spawnAt ? 0 : a.enemyHp / a.enemyMax, "hp enemy", 'data-hp="them"')}<small>${a.spawnAt ? "<b>NEXT ONE IS COMING…</b>" : `<b data-hpnum="them">${a.enemyHp}</b> / ${a.enemyMax}`}</small>
        ${bar(0, "op-swing", `data-swing="them" data-next="${a.eNext}" data-speed="${e.interval}"`)}<div class="op-rmeta"><span>HIT ${a.enemyHitChance}%</span><span>MAX ${e.maxhit}</span></div><div class="op-splat" data-splat="them" data-keep="1"></div></div>
      <button type="button" class="op-go on flee" data-act="stop">${a.expedition ? "CALL BACK ■" : "RETREAT ■"}</button></section>`;
  }
  function battleHtml() {
    const fighting = V.action?.type === "combat" && !V.action.expedition;
    const areas = D.areas.map((ar) => `<button type="button" class="${area === ar.id ? "on" : ""}" data-area="${ar.id}">${clean(ar.name)} <small>LV ${ar.level}+</small></button>`).join("");
    const ar = D.areas.find((x) => x.id === area);
    const locked = ar.requires && V.state.equipment.charm !== ar.requires;
    return (fighting ? fightHtml() : "") + `<section class="op-sec"><h2>⚔\ufe0e BATTLE <small>Fights run on their own: eat, swing and loot. Health returns at camp.</small></h2>
      <div class="op-tabs">${areas}</div><p class="op-note">${clean(ar.desc)}${locked ? ` <b class="short">Wear the ${clean(item(ar.requires).name)} to enter.</b>` : ""}</p>
      <div class="op-grid">${ar.enemies.map((id) => enemyCard(id, fighting && V.action.enemy === id)).join("")}</div></section>`;
  }
  function expeditionsHtml() {
    const a = V.action, on = a?.type === "combat" && a.expedition;
    return (on ? fightHtml() : "") + `<section class="op-sec"><h2>⚑\ufe0e EXPEDITIONS <small>A run of fights ending with a boss. No changing gear once you leave; the rewards are unique.</small></h2><div class="op-grid">${D.expeditions.map((x) => {
      const done = V.state.completed.includes(x.id), going = on && a.expedition === x.id;
      const ok = !on && V.combatLevel >= x.level - 10 && Object.entries(x.cost).every(([k, v]) => V.state.supplies[k] >= v) && (!x.requires || V.state.equipment.charm === x.requires);
      return `<article class="op-card op-exp ${done ? "done" : ""}" data-hover-art="site:${x.id}"><header><b>${clean(x.name)}</b><span>${done ? "✓ CLEARED" : `REC. LV ${x.level}`}</span></header>
        <div class="op-bart op-site"><i class="op-art-r" data-art="site:${x.id}" data-size="220"></i></div><p>${clean(x.intro)}</p>
        <div class="op-waves">${x.enemies.map((id, i) => `<span class="${going && i < a.wave ? "won" : going && i === a.wave ? "now" : ""} ${D.enemies[id].boss ? "boss" : ""}" title="${clean(D.enemies[id].name)}|Level ${D.enemies[id].level}">${D.enemies[id].boss ? "☠" : i + 1}</span>`).join("<i></i>")}</div>
        <div class="op-io"><small>REWARD</small>${Object.entries(x.reward).map(([k, n]) => icon(k, n > 1 ? n : null)).join("")}<em>¤${fmt(x.scrip)}</em></div>
        <div class="op-cost">${Object.entries(x.cost).map(([k, v]) => `<span class="${V.state.supplies[k] >= v ? "" : "short"}">${v} ${k}</span>`).join("")}${x.requires ? `<span class="${V.state.equipment.charm === x.requires ? "" : "short"}">${clean(item(x.requires).name)}</span>` : ""}</div>
        ${going ? "" : `<button type="button" class="op-go" data-act="expedition" data-id="${x.id}" ${ok ? "" : "disabled"}>${done ? "RUN AGAIN ▸" : "SET OUT ▸"}</button>`}</article>`;
    }).join("")}</div></section>`;
  }
  function bountiesHtml() {
    const b = V.state.bounty;
    const current = b ? `<article class="op-card op-bounty active" data-hover-art="creature:${b.enemy}"><header><b>WANTED · ${clean(D.enemies[b.enemy].name)}</b><span>${b.total - b.left}/${b.total}</span></header>
      <div class="op-bart op-creature op-wanted"><i class="op-art-r" data-art="creature:${b.enemy}" data-size="220"></i><small>WANTED</small></div>${bar((b.total - b.left) / b.total, "xp")}
      <p>Reward: <b>${b.reward} tokens</b> (more with bounty bonuses). Find them in ${clean(D.areas.find((ar) => ar.enemies.includes(b.enemy)).name)}.</p>
      <button type="button" data-act="fight" data-enemy="${b.enemy}" ${V.action?.type === "combat" ? "disabled" : ""}>HUNT ▸</button><button type="button" class="warn" data-act="dropbounty">DROP</button></article>`
      : `<div class="op-grid">${D.bountyTiers.map((t) => `<article class="op-card"><header><b>${t.name.toUpperCase()} BOUNTY</b><span>✪ ×${t.tokens}</span></header><p>${t.count[0]}–${t.count[1]} targets up to level ${t.max}, chosen for your level.</p><button type="button" data-act="bounty" data-tier="${t.id}">TAKE ▸</button></article>`).join("")}</div>`;
    const shop = D.bountyShop.map((o) => `<article class="op-card op-offer"><header>${icon(o.item)}<b>${clean(item(o.item).name)}</b><span>${have(o.item) || Object.values(V.state.equipment).includes(o.item) ? "OWNED" : ""}</span></header><p>${clean(item(o.item).desc || statsText(item(o.item)).join(", "))}</p>
      <button type="button" data-act="bountyshop" data-item="${o.item}" ${V.state.tokens >= o.tokens && lvl("bounty") >= o.level ? "" : "disabled"}>✪ ${o.tokens}${lvl("bounty") < o.level ? ` · NEEDS LV ${o.level}` : ""}</button></article>`).join("");
    return skillHead("bounty") + `<section class="op-sec"><h2>✪ THE BOARD</h2>${current}</section><section class="op-sec"><h2>✪ TOKEN SHOP</h2><div class="op-grid">${shop}</div></section>`;
  }
  function companionsHtml() {
    return `<section class="op-sec"><h2>❀ COMPANIONS <small>Rare finds while you work. Each one stays and helps a little.</small></h2><div class="op-grid pets">${Object.values(D.companions).map((c) => {
      const got = V.state.companions.includes(c.id);
      return `<article class="op-card op-pet ${got ? "got" : ""}" ${got ? `data-hover-art="pet:${c.animal}"` : ""}><div class="op-bart op-petart ${got ? "" : "unknown"}"><i class="op-art-r" data-art="pet:${c.animal}" data-size="260"></i>${got ? "" : "<b>?</b>"}</div>
        <header><b>${got ? clean(c.name) : "UNKNOWN"}</b><span>${got ? clean(c.animal.toUpperCase()) : ""}</span></header><p>${got ? clean(effectText(c.effect)) : `Found while training ${c.skill === "combat" ? "combat" : skillName(c.skill)}.`}</p></article>`;
    }).join("")}</div></section>`;
  }
  // -------------------------------------------------------------- profile
  function profileHtml() {
    const s = V.state, P = s.prestige || 0, next = D.prestige[P], o = s.options || {};
    const total = V.totalLevel, need = next ? next.total : D.maxTotal, frac = Math.min(1, total / need);
    const xpAll = Object.values(s.xp).reduce((a, b) => a + b, 0);
    const skills = Object.keys(D.skills).map((k) => `<div class="op-ps" style="--sc:${D.skills[k].color}" title="${clean(D.skills[k].name)}|${fmt(xpOf(k))} XP"><span>${D.skills[k].glyph}</span><b>${clean(D.skills[k].name)}</b><em>${lvl(k)}</em>${bar(xpFrac(k), "xp")}</div>`).join("");
    const mastered = Object.values(s.mastery).reduce((n, book) => n + Object.values(book).filter((x) => x >= D.xpTable[99]).length, 0);
    const st = s.stats || {};
    return `<section class="op-sec op-prof">
      <div class="op-prof-head p${P}"><div class="op-prof-stars">${[1, 2, 3, 4].map((i) => `<i class="${i <= P ? "on" : ""}">${i <= P ? "★" : "☆"}</i>`).join("")}</div>
        <div><small>${P ? `PRESTIGE ${ROMAN[P]} · ${clean(D.prestige[P - 1].name.toUpperCase())}` : "NO PRESTIGE YET"}</small><h1>Total level ${total}<span> / ${D.maxTotal}</span></h1>
          <p>Combat level ${V.combatLevel} · ${fmt(xpAll)} XP in all · ${dur(s.playtime || 0)} in the Outpost</p></div>
        <div class="op-prof-btns"><button type="button" class="op-go" data-show="rewards">✦ REWARDS</button></div></div>
      <div class="op-prestige-meter"><label>${next ? `PRESTIGE ${ROMAN[P + 1]} · ${clean(next.name.toUpperCase())} AT TOTAL LEVEL ${fmt(next.total)}` : "EVERY PRESTIGE COMPLETE"}<span>${next ? `${total} / ${fmt(next.total)}` : "IV / IV"}</span></label>${bar(frac, "prestige")}
        <p>${next ? (total >= next.total ? "<b>Ready.</b> Prestige restarts your skills, items and buildings and keeps your companions, achievements and Locker rewards. It brings a lasting bonus, new perks and new Locker rewards."
          : `Prestige restarts a run for a lasting bonus, new perks and Locker rewards: an orb, a title and a name effect. ${fmt(next.total - total)} levels to go.`) : "You have reached the last light. Every reward is yours."}</p>
        ${next ? `<button type="button" class="op-go op-prestige-go" data-show="prestige" ${total >= next.total ? "" : "disabled"}>${total >= next.total ? `PRESTIGE ${ROMAN[P + 1]} ▸` : `PRESTIGE ${ROMAN[P + 1]} · LOCKED`}</button>` : ""}</div></section>
      <section class="op-sec"><h2>◈ SKILLS <small>${total} of ${D.maxTotal} levels</small></h2><div class="op-grid op-pskills">${skills}</div></section>
      <section class="op-sec"><h2>≡ MILESTONES</h2><dl class="op-stats">${[["Companions", `${s.companions.length} / ${Object.keys(D.companions).length}`], ["Expeditions cleared", `${s.completed.length} / ${D.expeditions.length}`],
        ["Recipes at mastery 99", mastered], ["Enemies defeated", fmt(st.kills || 0)], ["Items crafted", fmt(st.crafted || 0)], ["Bounties", fmt(st.bounties || 0)], ["Scrip earned", fmt(st.scripEarned || 0)]].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></section>
      <section class="op-sec op-settings"><h2>⚙ OUTPOST SETTINGS</h2>
        ${[["start", "Getting-started guide", "First steps on the Valley page"], ["liveArt", "Live 3D art", "Turning buildings, recipes and items; off is lighter on slow computers"], ["awayPopup", "While-you-were-away summary", "A summary when you open Umbra again after closing it"], ["closeNote", "Note when closing", "How the Outpost keeps going while you're away"]].map(([k, name, hint]) =>
          `<label class="op-opt"><span><b>${name}</b><small>${hint}</small></span><input type="checkbox" data-option="${k}" ${o[k] !== false ? "checked" : ""}></label>`).join("")}
        <div class="op-opt danger"><span><b>Reset the Outpost</b><small>Start over from nothing. Prestige stars and Locker rewards stay yours.</small></span><button type="button" class="warn" data-show="reset">RESET…</button></div></section>`;
  }
  function rewardsHtml() {
    const P = V.state.prestige || 0;
    return `<div class="op-modal op-rewards"><small>PRESTIGE · FOUR TIERS</small><h2>Rewards for each prestige</h2><div class="op-tiers">${D.prestige.map((t) => {
      const got = P >= t.tier, nextOne = P + 1 === t.tier;
      const orbId = ["", "embercrown", "stormrings", "northlight", "lastlight"][t.tier], fx = ["", "ember-glow", "sparks", "aurora-flow", "golden-embers"][t.tier];
      return `<article class="op-tier ${got ? "got" : nextOne ? "next-tier" : "locked"}"><header><b>${"★".repeat(t.tier)} ${ROMAN[t.tier]} · ${clean(t.name.toUpperCase())}</b><span>${got ? "EARNED" : `TOTAL LEVEL ${fmt(t.total)}`}</span></header>
        <div class="op-tier-orb" data-orb-style="${orbId}"></div>
        <p class="op-tier-name"><span class="fx-${fx}">${clean((window.UmbraProfile?.data?.name || "Survivor"))}</span> <span class="title-tag">${clean(t.title.toUpperCase())}</span></p>
        <ul><li><b>Orb</b> ${clean(t.orb)}</li><li><b>Title</b> ${clean(t.title)}</li><li><b>Name effect</b> ${clean(t.nameFx)}</li>
          <li><b>Bonus</b> ${clean(effectText(t.bonus))}</li>${t.perks.map((p) => `<li><b>Perk</b> ${clean(p)}</li>`).join("")}</ul></article>`;
    }).join("")}</div><p class="op-note">Bonuses and perks add up: Prestige III keeps everything from I and II. Rewards appear in your Locker (Profile & Loadout).</p>
      <button type="button" class="op-go" data-show="">CLOSE</button></div>`;
  }
  function confirmHtml(kind) {
    const P = V.state.prestige || 0, t = D.prestige[P];
    if (kind === "prestige") return `<div class="op-modal op-confirm prestige"><small>PRESTIGE ${ROMAN[P + 1]} · ${clean(t.name.toUpperCase())}</small><h2>Begin a new run?</h2>
      <div class="op-cols"><div><h3>RESETS</h3><ul><li>All skill levels and mastery</li><li>Stockpile, gear, scrip and tokens</li><li>Buildings and supplies</li><li>Expeditions, bounty and the route</li></ul></div>
      <div><h3>YOU KEEP</h3><ul><li>Companions</li><li>Achievements and Locker rewards</li><li>Lifetime statistics</li><li>Every earlier prestige bonus</li></ul></div>
      <div><h3>YOU GAIN</h3><ul><li>${clean(effectText(t.bonus))}</li>${t.perks.map((p) => `<li>${clean(p)}</li>`).join("")}<li>Orb, title and name effect: ${clean(t.name)}</li></ul></div></div>
      <label class="op-type">Type <b>PRESTIGE</b> to confirm<input type="text" data-confirm="PRESTIGE" autocomplete="off" spellcheck="false"></label>
      <div class="op-dact"><button type="button" class="op-go" data-show="">NOT YET</button><button type="button" class="op-go op-prestige-go" data-act="prestige" data-confirm-btn="PRESTIGE" disabled>PRESTIGE ${ROMAN[P + 1]} ★</button></div></div>`;
    return `<div class="op-modal op-confirm"><small>RESET THE OUTPOST</small><h2>Start over from nothing?</h2>
      <p>Skills, mastery, items, gear, buildings, companions and progress are erased. Your prestige stars, achievements and Locker rewards stay.</p>
      <label class="op-type">Type <b>RESET</b> to confirm<input type="text" data-confirm="RESET" autocomplete="off" spellcheck="false"></label>
      <div class="op-dact"><button type="button" class="op-go" data-show="">KEEP MY OUTPOST</button><button type="button" class="op-go warn" data-act="reset" data-confirm-btn="RESET" disabled>RESET EVERYTHING</button></div></div>`;
  }

  function logHtml() {
    const st = V.state.stats, rows = [["Actions", st.actions], ["Items found", st.found], ["Items crafted", st.crafted], ["Burnt dinners", st.burnt], ["Enemies defeated", st.kills], ["Damage dealt", st.damage], ["Damage taken", st.damageTaken],
      ["Knock-downs", st.knockouts], ["Meals eaten", st.eaten], ["Bounties done", st.bounties], ["Expeditions", st.expeditions], ["Route laps", st.laps], ["Scrip earned", st.scripEarned]];
    const total = Object.values(V.levels).reduce((a, b) => a + b, 0);
    return `<section class="op-sec"><h2>≡ STATISTICS <small>Total level ${total} · combat level ${V.combatLevel}</small></h2><dl class="op-stats">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${fmt(v || 0)}</dd>`).join("")}</dl></section>
      <section class="op-sec"><h2>⌁ FIELD LOG</h2><div class="op-log">${V.state.log.map((l) => `<p>› ${clean(l)}</p>`).join("")}</div></section>`;
  }

  function bodyHtml() {
    if (D.skills[sel] && !["melee", "marksmanship", "gadgetry", "fortitude", "vitality"].includes(sel)) return sel === "scouting" ? scoutingHtml() : sel === "bounty" ? bountiesHtml() : skillHtml(sel);
    return { overview: overviewHtml, stockpile: stockpileHtml, gear: gearHtml, trader: traderHtml, battle: battleHtml, expeditions: expeditionsHtml,
      bounties: bountiesHtml, companions: companionsHtml, log: logHtml, profile: profileHtml }[sel]?.() || overviewHtml();
  }
  function combatSkills() {
    return `<section class="op-sec"><h2>⚔\ufe0e COMBAT SKILLS</h2><div class="op-grid cs">${["melee", "marksmanship", "gadgetry", "fortitude", "vitality", "bounty"].map((s) => `<div class="op-cs" style="--sc:${D.skills[s].color}" title="${clean(D.skills[s].name)}|${clean(D.skills[s].desc)}"><span>${D.skills[s].glyph}</span><b>${D.skills[s].name}</b><em>${lvl(s)}</em>${bar(xpFrac(s), "xp")}</div>`).join("")}</div></section>`;
  }

  // ---------------------------------------------------------------- render
  function render(force = false) {
    if (!V || !D || panel.hidden) return;
    const nav = navHtml();
    if (nav !== lastNav) { morph($o(".op-nav"), nav); lastNav = nav; }
    const top = topHtml();
    if (top !== lastTop) { morph($o(".op-top"), top); lastTop = top; }
    setHero(sel);
    if (pressed && !force) return;      // never swap buttons under a pressed pointer
    let body = bodyHtml();
    if (sel === "battle" || sel === "expeditions") body += combatSkills();
    if (body !== lastBody || force) {
      const view = $o(".op-view");
      // A new section starts fresh; the same section is patched in place,
      // so what's under the pointer, tooltips and scroll stay put.
      if (view.dataset.sel !== sel) { view.innerHTML = body; view.dataset.sel = sel; } else morph(view, body);
      lastBody = body;
      UmbraOutpostModels.fill(panel);
      liveRecipe();
    }
    figure();
    modals();
    UmbraOutpostModels.fill(panel);      // pictures in the popups too
    tick();
  }
  // Gear: you, in 3D, wearing what's equipped, turning on a stand. The view
  // stays across updates and is rebuilt only when the equipment changes.
  let figView = null, figKey = "", figEl = null;
  function figure() {
    const box = $o(".op-figure3d");
    const key = box ? JSON.stringify(V.state.equipment) : "";
    if (box === figEl && key === figKey) return;
    figView?.stop(); figView = null; figEl = box; figKey = key;
    if (!box) return;
    box.innerHTML = "<canvas></canvas>";
    if (window.offgrid || V.state.options?.liveArt === false) { const c = Ascii3D.still(UmbraBeings.mannequinScene(UmbraBeings.outfit(V.state.equipment, D.items)), 240, 300, { cell: 5 }); box.replaceChildren(c); return; }
    figView = UmbraBeings.mannequin(box.querySelector("canvas"), UmbraBeings.outfit(V.state.equipment, D.items));
  }
  // Patch `el` to match `html`, touching only what differs. Art that is
  // already drawn (same picture) is left alone.
  const tpl = document.createElement("template");
  function morph(el, html) {
    tpl.innerHTML = html;
    patchChildren(el, tpl.content);
  }
  function patchChildren(a, b) {
    const an = [...a.childNodes], bn = [...b.childNodes];
    for (let i = 0; i < bn.length; i++) {
      const x = an[i], y = bn[i];
      if (!x) { a.appendChild(y.cloneNode(true)); continue; }
      if (x.nodeType !== y.nodeType || x.nodeName !== y.nodeName || (x.nodeType === 1 && (x.dataset.art !== y.dataset.art || x.dataset.live !== y.dataset.live))) { a.replaceChild(y.cloneNode(true), x); continue; }
      if (x.nodeType === 3) { if (x.nodeValue !== y.nodeValue) x.nodeValue = y.nodeValue; continue; }
      if (x.nodeType !== 1) continue;
      if (x.dataset.art || x.dataset.live || x.dataset.keep) continue;      // a drawn picture, a live canvas or floating numbers
      for (const { name, value } of [...y.attributes]) {
        if (name === "style" && x.closest(".op-prog, [data-swing]")) continue;   // bars move between updates
        if (name === "style" && x.parentElement?.classList.contains("op-bar") && x.getAttribute(name) !== value) {
          // A bar that empties (a level up) jumps back instead of sliding backwards.
          const was = parseFloat(x.style.width), will = parseFloat(/width:\s*([\d.]+)/.exec(value)?.[1]);
          if (will < was - 20) { x.style.transition = "none"; x.setAttribute(name, value); void x.offsetWidth; x.style.transition = ""; continue; }
        }
        if (x.getAttribute(name) !== value) {
          if (name === "data-act" && value === "stop") lastStartClick = performance.now();   // the button just turned into STOP
          x.setAttribute(name, value);
        }
      }
      for (const { name } of [...x.attributes]) if (!y.hasAttribute(name) && !(name === "style" && x.closest(".op-prog, [data-swing]"))) x.removeAttribute(name);
      if (x.tagName === "SELECT") { patchChildren(x, y); x.value = y.querySelector("option[selected]")?.value ?? ""; continue; }
      patchChildren(x, y);
    }
    for (let i = an.length - 1; i >= bn.length; i--) an[i].remove();
  }
  // The running recipe's picture turns slowly while it works.
  let live = null, liveId = "";
  function liveRecipe() {
    const c = panel.querySelector("canvas[data-live]");
    const id = c?.dataset.live || "";
    if (id === liveId && live) return;
    live?.stop(); live = null; liveId = id;
    if (c && !window.offgrid && V.state.options?.liveArt !== false) live = Ascii3D.view(c, UmbraOutpostModels.spin(UmbraOutpostModels.forRecipe(D.recipes[id]), .35), { cell: 5 });
  }

  // A popup is drawn once and kept while its content is the same, so
  // updates (an action completing) never redraw or replay it.
  let orbStops = [];
  function setLayer(layer, html) {
    if (layer._html === html) return;
    orbStops.forEach((f) => f && f()); orbStops = [];
    layer.innerHTML = html; layer._html = html;
  }
  let overlay = "";      // "rewards", "prestige" or "reset" while open
  function modals() {
    const layer = $o(".op-layer"), s = V.state;
    if (overlay) {
      layer.hidden = false;
      setLayer(layer, overlay === "rewards" ? rewardsHtml() : confirmHtml(overlay));
      if (overlay === "rewards") layer.querySelectorAll("[data-orb-style]:not(.on)").forEach((el) => { el.classList.add("on"); if (window.umbraOrb) orbStops.push(window.umbraOrb(el, 15, 10, el.dataset.orbStyle)); });
      return;
    }
    if (s.pendingStory && D.storyChoices[s.pendingStory]) {
      const st = D.storyChoices[s.pendingStory], exp = D.expeditions.find((e) => e.story === s.pendingStory);
      layer.hidden = false;
      setLayer(layer, `<div class="op-modal"><small>${clean(exp.name.toUpperCase())} · THE STORY'S END</small><p>${clean(st.text)}</p><div class="op-choices">${st.choices.map((c, i) => `<button type="button" data-act="story" data-choice="${i}">${clean(c.label)}<small>${Object.entries(c.reward).map(([k, v]) => `+${v} ${k}`).join(" · ")}</small></button>`).join("")}</div></div>`);
      return;
    }
    if (s.away) {
      const a = s.away;
      const xp = Object.entries(a.xp).sort((x, y) => y[1] - x[1]).map(([k, v]) => `<li style="--sc:${D.skills[k].color}"><span>${D.skills[k].glyph} ${D.skills[k].name}</span><b>+${fmt(v)} XP</b>${a.levels[k] ? `<em>LV ${a.levels[k][0]} → ${a.levels[k][1]}</em>` : ""}</li>`).join("");
      const items = Object.entries(a.items).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 18).map(([k, v]) => `<span class="${v < 0 ? "used" : ""}">${icon(k)}<b>${v > 0 ? "+" : ""}${fmt(v)}</b></span>`).join("");
      layer.hidden = false;
      const sup = Object.entries(a.supplies || {}).filter(([, v]) => v >= 1).map(([k, v]) => `<span><b>+${fmt(v)}</b> ${k}</span>`).join("");
      const lv = Object.entries(a.levels || {}).map(([k, [f, t]]) => `${D.skills[k].name} ${f} → ${t}`).join(" · ");
      setLayer(layer, `<div class="op-modal away"><small>WHILE YOU WERE AWAY · ${dur(a.seconds)}</small><h2>The Outpost kept working.</h2>
        ${lv ? `<p class="op-away-levels">▲ LEVELS GAINED · ${clean(lv)}</p>` : ""}
        ${xp ? `<ul class="op-away-xp">${xp}</ul>` : ""}
        ${items ? `<h3>ITEMS</h3><div class="op-away-items">${items}</div>` : ""}
        ${sup ? `<h3>SUPPLIES FROM THE BUILDINGS</h3><div class="op-away-sup">${sup}</div>` : ""}
        <p class="op-away-sum">${a.scrip ? `¤ ${a.scrip > 0 ? "+" : ""}${fmt(a.scrip)} scrip` : ""}${a.kills ? ` · ${fmt(a.kills)} enemies defeated` : ""}${a.tokens ? ` · ✪ +${a.tokens}` : ""}${a.companions.length ? ` · new companion: ${a.companions.map((c) => clean(D.companions[c].name)).join(", ")}` : ""}</p>
        ${a.stopped ? `<p class="op-away-stop">⚠ ${clean(a.stopped)}</p>` : ""}
        <p class="op-away-pace">While Umbra is open it works at full pace on any tab. Once Umbra is closed, it keeps going at ${a.pace >= .33 ? "a third" : a.pace >= .2 ? "a fifth" : "a tenth"} of its pace after the first two minutes, for up to a day.</p>
        <button type="button" class="op-go" data-act="ack">BACK TO WORK ▸</button></div>`);
      if (!layer.dataset.shown) { Sound.complete(); layer.dataset.shown = "1"; }
      return;
    }
    layer.hidden = true; orbStops.forEach((f) => f && f()); orbStops = []; layer.innerHTML = ""; layer._html = ""; delete layer.dataset.shown;
  }
  // Progress bars, attack timers and pets move between updates.
  function tick() {
    if (!V || panel.hidden) return;
    const t = now();
    panel.querySelectorAll(".op-prog").forEach((el) => {
      // The action repeats: keep the bar looping even if an update is late.
      const start = +el.dataset.start, int = +el.dataset.int || 1, k = (Math.max(0, t - start) % int) / int;
      if (el._k != null && k < el._k - .5) pop(el);   // one more done
      el._k = k;
      el.style.setProperty("--p", k.toFixed(4));
      const eta = el.parentElement.querySelector(".op-eta");
      if (eta) { const txt = `${((1 - k) * int).toFixed(1)}s`; if (eta.textContent !== txt) eta.textContent = txt; }
    });
    panel.querySelectorAll("[data-swing]").forEach((el) => {
      const next = +el.dataset.next, speed = +el.dataset.speed || 1;
      const k = Math.max(0, Math.min(1, 1 - (next - t) / speed));
      if (el._k != null && k < el._k - .5) pop(el);
      el._k = k;
      el.style.setProperty("--p", k.toFixed(4));
    });
  }
  // A short burst of light when a bar completes.
  function pop(el) {
    if (window.offgrid || document.body.classList.contains("reduce-motion")) return;
    el.classList.remove("op-flash"); void el.offsetWidth; el.classList.add("op-flash");   // (not "pop": the source popover owns that name)
    clearTimeout(el._pop); el._pop = setTimeout(() => el.classList.remove("op-flash"), 520);
  }
  // Bars move every frame (smooth at the screen's own rate) while the
  // Outpost is open; with Reduce motion or off-grid, ten times a second.
  let barFrame = 0;
  function barLoop() {
    barFrame = 0;
    if (!V || panel.hidden) return;
    tick();
    if (!window.offgrid && !document.body.classList.contains("reduce-motion")) barFrame = requestAnimationFrame(barLoop);
  }
  let petFrame = 0;
  setInterval(() => {
    if (panel.hidden || sel !== "companions" || window.offgrid || document.body.classList.contains("reduce-motion")) return;
    petFrame = 1 - petFrame;
    panel.querySelectorAll(".op-pet.got .op-pet-art").forEach((el, i) => { if ((i + petFrame) % 3 === 0) el.textContent = UmbraOutpostArt.pets[el.dataset.pet][petFrame]; else el.textContent = UmbraOutpostArt.pets[el.dataset.pet][0]; });
  }, 900);

  // The building under the pointer comes alive: it turns, smoke rises.
  let bLive = null, bCard = null;
  panel.addEventListener("pointerover", (e) => {
    const card = e.target.closest("[data-building-card], [data-tool-card], [data-hover-art]");
    if (card === bCard) return;
    bLive?.stop(); bLive = null; panel.querySelectorAll(".op-bart canvas.live").forEach((c) => c.remove());
    panel.querySelectorAll(".op-bart.playing").forEach((b) => b.classList.remove("playing"));
    bCard = card;
    if (!card || window.offgrid || document.body.classList.contains("reduce-motion") || V?.state.options?.liveArt === false) return;
    const box = card.querySelector(".op-bart"), c = document.createElement("canvas");
    c.className = "live"; box.appendChild(c); box.classList.add("playing");
    if (card.dataset.hoverArt) { const [kind, id] = card.dataset.hoverArt.split(":"); bLive = UmbraBeings.live(c, kind, id, { speed: kind === "site" ? .35 : .55 }); return; }
    const scene = card.dataset.toolCard ? UmbraOutpostModels.tool(card.dataset.toolCard) : UmbraOutpostModels.building(card.dataset.buildingCard, +card.dataset.level);
    bLive = Ascii3D.view(c, UmbraOutpostModels.spin(scene, card.dataset.toolCard ? .8 : .45), { cell: 5 });
  });

  // ------------------------------------------------------------- info box
  // Hover an item anywhere in the Outpost: it turns in 3D beside what it
  // is, what it does, and where it comes from and goes.
  const info = document.createElement("div");
  info.className = "op-info"; info.hidden = true;
  info.innerHTML = '<canvas aria-hidden="true"></canvas><div class="op-info-text"></div>';
  panel.appendChild(info);
  let infoView = null, infoId = "", infoTimer = 0;
  function sources(id) {
    const made = [], used = [], drops = [];
    for (const r of Object.values(D.recipes)) {
      if (r.outputs[id] || r.fragment === id || (r.table || []).some(([k]) => k === id) || (r.extras || []).some(([k]) => k === id) || r.bonus?.[0] === id) made.push(r);
      if (r.inputs[id]) used.push(r);
    }
    for (const e of Object.values(D.enemies)) if (e.drops.some(([k]) => k === id)) drops.push(e);
    const shop = D.trader.some((o) => o.item === id) ? "the Trader" : D.bountyShop.some((o) => o.item === id) ? "the bounty board" : D.expeditions.find((x) => x.reward[id])?.name || "";
    return { made, used, drops, shop };
  }
  function showInfo(el) {
    const id = el.dataset.item, it = item(id);
    if (!it || !D) return;
    clearTimeout(infoTimer);
    if (id !== infoId) {
      infoId = id;
      const src = sources(id), list = (a, f) => a.slice(0, 4).map(f).join(", ") + (a.length > 4 ? ` +${a.length - 4}` : "");
      const lines = statsText(it);
      info.querySelector(".op-info-text").innerHTML = `<b>${clean(it.name)}</b><small class="r-${it.rarity}">${it.rarity.toUpperCase()} · ${clean(it.cat.toUpperCase())}</small>
        ${it.desc ? `<p>${clean(it.desc)}</p>` : ""}${lines.length ? `<ul>${lines.map((l) => `<li>${clean(l)}</li>`).join("")}</ul>` : ""}
        <dl>${src.made.length ? `<dt>FROM</dt><dd>${clean(list(src.made, (r) => `${skillName(r.skill)}: ${r.name}`))}</dd>` : ""}
        ${src.drops.length ? `<dt>DROPS</dt><dd>${clean(list(src.drops, (e) => e.name))}</dd>` : ""}${src.shop ? `<dt>FROM</dt><dd>${clean(src.shop)}</dd>` : ""}
        ${src.used.length ? `<dt>USED IN</dt><dd>${clean(list(src.used, (r) => r.name))}</dd>` : ""}</dl>
        <p class="op-info-foot">YOU HAVE <b>${fmt(have(id))}</b> · ¤${fmt(it.value)} EACH</p>`;
      infoView?.stop();
      infoView = window.offgrid || V.state.options?.liveArt === false ? null : UmbraOutpostModels.live(info.querySelector("canvas"), id);
    }
    info.hidden = false;
    const r = el.getBoundingClientRect(), w = info.offsetWidth, h = info.offsetHeight;
    info.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, r.right + 10 + w > innerWidth ? r.left - w - 10 : r.right + 10))}px`;
    info.style.top = `${Math.max(8, Math.min(innerHeight - h - 8, r.top - 20))}px`;
  }
  function hideInfo() { infoTimer = setTimeout(() => { info.hidden = true; infoView?.stop(); infoView = null; infoId = ""; }, 120); }
  // The outermost [data-item] counts, so crossing an item's own border or
  // its count never closes the box; moving straight to another item swaps it.
  const itemAt = (node) => { let el = node?.closest?.("[data-item]"); while (el?.parentElement?.closest("[data-item]")) el = el.parentElement.closest("[data-item]"); return el; };
  panel.addEventListener("pointerover", (e) => { const el = itemAt(e.target); if (el && !info.contains(el)) showInfo(el); });
  panel.addEventListener("pointerout", (e) => {
    const from = itemAt(e.target), to = itemAt(e.relatedTarget);
    if (from && from !== to && !to) hideInfo();
  });

  // ---------------------------------------------------------------- toasts
  function toast(html, kind = "") {
    const box = $o(".op-toasts"), el = document.createElement("div");
    el.className = "op-toast " + kind; el.innerHTML = html;
    box.appendChild(el);
    while (box.children.length > 6) box.firstElementChild.remove();
    setTimeout(() => el.classList.add("out"), kind === "big" ? 4200 : 2600);
    setTimeout(() => el.remove(), kind === "big" ? 4800 : 3200);
  }
  function feedback(prev, events) {
    for (const e of events) {
      if (e.type === "level") { toast(`<span class="op-burst">${D.skills[e.skill].glyph}</span><b>${D.skills[e.skill].name.toUpperCase()} ${e.level}</b><small>LEVEL UP</small>`, "big"); Sound.complete(); }
      else if (e.type === "mastery") toast(`<b>${clean(D.recipes[e.recipe].name)}</b><small>MASTERY ${e.level}</small>`);
      else if (e.type === "companion") { const c = D.companions[e.id]; toast(`<pre>${clean(UmbraOutpostArt.pets[c.animal][0])}</pre><b>${clean(c.name)} the ${c.animal} joined you!</b><small>${clean(effectText(c.effect))}</small>`, "big pet"); Sound.achieve(); }
      else if (e.type === "rare") { toast(`${icon(e.item)}<b>${clean(item(e.item).name)}</b><small>RARE FIND</small>`, "rare"); Sound.found(); }
      else if (e.type === "stopped" && !/Expedition complete/.test(e.reason)) { toast(`<b>${clean(e.reason)}</b><small>STOPPED</small>`, "warn"); Sound.error(); }
      else if (e.type === "defeat") toast(`<b>Knocked down</b><small>BACK AT CAMP</small>`, "warn");
      else if (e.type === "bounty") { toast(`<b>Bounty complete · ✪ ${e.tokens}</b><small>THE BOARD PAYS</small>`, "big"); Sound.complete(); }
      else if (e.type === "expedition") { toast(`<b>${clean(D.expeditions.find((x) => x.id === e.id).name)}</b><small>EXPEDITION COMPLETE</small>`, "big"); Sound.complete(); }
      else if (e.type === "prestige") { toast(`<span class="op-burst">★</span><b>PRESTIGE ${ROMAN[e.tier]} · ${clean(D.prestige[e.tier - 1].name.toUpperCase())}</b><small>NEW REWARDS IN YOUR LOCKER</small>`, "big"); Sound.achieve(); setTimeout(() => window.UmbraAchievements?.check?.(), 600); }
      else if (e.type === "building") { toast(`<b>${clean(D.buildings[e.id].name)} · LV ${e.level}</b><small>RAISED</small>`, "big"); Sound.complete(); art?.rebuild?.(); }
    }
    // XP and items gained this tick, for the skill being trained.
    if (prev && V.state.action && V.state.action.type !== "combat") {
      const s = V.state.action.skill, gain = V.state.xp[s] - prev.xp[s];
      if (gain >= 1) {
        const items = Object.entries(V.state.bank).filter(([k, v]) => v > (prev.bank[k] || 0)).slice(0, 3).map(([k, v]) => `${icon(k)}<em>+${fmt(v - (prev.bank[k] || 0))}</em>`).join("");
        drop(`<b>+${fmt(gain)} XP</b>${items}`);
      }
    }
    if (prevCombat && V.action?.type === "combat") {
      const dmg = prevCombat.enemyHp - V.action.enemyHp, hurt = prevCombat.hp - V.state.hp;
      if (V.action.enemy === prevCombat.enemy && dmg > 0) splat("them", dmg);
      if (hurt > 0) splat("you", hurt);
    }
  }
  function drop(html) {
    const hero = $o(".op-hero");
    if (hero.hidden) return;
    const el = document.createElement("div");
    el.className = "op-drop"; el.innerHTML = html;
    hero.appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
  function splat(who, n) {
    const el = panel.querySelector(`[data-splat="${who}"]`);
    if (!el) return;
    const s = document.createElement("span");
    s.textContent = "−" + Math.round(n);
    el.appendChild(s);
    setTimeout(() => s.remove(), 1100);
  }

  // ---------------------------------------------------------------- server
  function schedule() {
    clearTimeout(poll);
    if (panel.hidden || !V) return;
    const a = V.state.action;
    let wait = 30;
    if (a?.type === "combat") wait = 1;
    else if (a) { const due = a.start + a.interval - now() + .15; wait = due > 0 ? Math.max(1, due) : 1; }
    if (V.state.warmUntil > now()) wait = Math.min(wait, 5);
    poll = setTimeout(() => refresh(), wait * 1000);
  }
  async function refresh(action) {
    if (busy && !action) return;
    busy = true;
    const prev = V && { xp: { ...V.state.xp }, bank: { ...V.state.bank } };
    prevCombat = V?.action?.type === "combat" ? { enemy: V.action.enemy, enemyHp: V.action.enemyHp, hp: V.state.hp } : null;
    try {
      if (!D) { D = await fetch("/api/outpost/data").then((r) => r.json()); UmbraOutpostModels.recipes = D.recipes; }
      const res = await fetch("/api/outpost", action ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action) } : undefined);
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || "The Outpost didn't answer.");
      skew = out.now - Date.now() / 1000;
      V = out;
      feedback(action ? null : prev, out.events || []);
      if (action) {
        // Buttons already click when pressed (one sound); results have their own.
        if (action.type === "fight" || action.type === "expedition") setHero(sel);
      }
      render(!!action);
    } catch (err) {
      toast(`<b>${clean(err.message)}</b>`, "warn"); Sound.error();
    } finally {
      busy = false;
      schedule();
    }
  }

  // ----------------------------------------------------------------- input
  panel.addEventListener("pointerdown", () => { pressed = true; });
  window.addEventListener("pointerup", () => { if (pressed) { pressed = false; setTimeout(() => render(), 60); } });
  panel.addEventListener("click", (e) => {
    const show = e.target.closest("[data-show]");
    if (show) { overlay = show.dataset.show; if (overlay !== "rewards") { const l = $o(".op-layer"); l._html = ""; } Sound.click(); render(true); return; }
    const pressed = e.target.closest("button");
    if (pressed && !pressed.disabled && !pressed.classList.contains("op-close")) Sound.click();
    const nav = e.target.closest("[data-view]");
    if (nav) {
      sel = nav.dataset.view; lastBody = ""; pick = null;
      clearTimeout(infoTimer); info.hidden = true; infoView?.stop(); infoView = null; infoId = "";
      if (sel === "battle" && V.action?.area) area = V.action.area;
      $o(".op-main").scrollTop = 0;
      render(true);
      return;
    }
    if (e.target.closest("[data-hide-start]")) { try { localStorage.setItem("umbra-outpost-start", "hidden"); } catch {} render(true); return; }
    const tab = e.target.closest("[data-tab]");
    if (tab) { bankTab = tab.dataset.tab; render(true); return; }
    const ar = e.target.closest("[data-area]");
    if (ar) { area = ar.dataset.area; render(true); return; }
    const cell = e.target.closest("[data-pick]");
    if (cell) { pick = cell.dataset.pick; render(true); return; }
    const b = e.target.closest("[data-act]");
    if (!b || b.disabled) return;
    const d = b.dataset, act = { type: d.act };
    // A STOP that just appeared (after a start, or where START was a moment
    // ago) ignores the click: a double-click must never cancel the work.
    if (d.act === "stop" && performance.now() - lastStartClick < 900) return;
    if (["start", "fight", "expedition", "scout"].includes(d.act)) { lastStartClick = performance.now(); b.blur(); }
    if (d.recipe) act.recipe = d.recipe;
    if (d.building) act.building = d.building;
    if (d.item) act.item = d.item;
    if (d.qty) act.qty = +d.qty;
    if (d.slot) act.slot = isNaN(+d.slot) ? d.slot : +d.slot;
    if (d.enemy) act.enemy = d.enemy;
    if (d.id) act.id = d.id;
    if (d.offer) act.offer = d.offer;
    if (d.tier) act.tier = d.tier;
    if (d.broadcast) act.broadcast = d.broadcast;
    if (d.obstacle) act.obstacle = d.obstacle;
    if (d.stance) act.stance = d.stance;
    if (d.choice) act.choice = +d.choice;
    if (d.confirmBtn) { act.confirm = d.confirmBtn; overlay = ""; }
    if (d.act === "discard" && d.ask && !b.dataset.armed) {   // worth something: ask once more
      b.dataset.armed = "1"; const was = b.textContent; b.textContent = "SURE? CLICK AGAIN";
      setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = was; } }, 3000);
      return;
    }
    if (d.act === "fight" && sel !== "battle" && sel !== "bounties") sel = "battle";
    if (d.act === "fight") area = D.areas.find((x) => x.enemies.includes(d.enemy)).id;
    refresh(act);
  });
  panel.addEventListener("input", (e) => {
    const box = e.target.closest("[data-confirm]");
    if (!box) return;
    const go = $o(`[data-confirm-btn="${box.dataset.confirm}"]`);
    if (go) go.disabled = box.value.trim().toUpperCase() !== box.dataset.confirm;
  });
  panel.addEventListener("change", (e) => {
    const opt = e.target.closest("[data-option]");
    if (opt) { refresh({ type: "options", [opt.dataset.option]: opt.checked }); return; }
    const s = e.target.closest("[data-select]");
    if (s) refresh({ type: s.dataset.select, item: s.value || null });
  });

  function close() {
    panel.hidden = true; button.classList.remove("on"); document.body.classList.remove("outpost-open");
    clearTimeout(poll);
    if (art) { art.stop(); art = null; artKey = ""; }
    live?.stop(); live = null; liveId = ""; bLive?.stop(); bLive = null; bCard = null; info.hidden = true; infoView?.stop(); infoView = null; infoId = "";
  }
  // Leaving the Outpost: a short note on how it keeps going (unless hidden).
  function leaveNote() {
    if (!V || V.state.options?.closeNote === false || $(".op-leave")) return;
    const a = V.state.action, P = V.state.prestige || 0;
    const doing = !a ? "Nothing is running right now: start an action and it keeps going while you're away."
      : a.type === "combat" ? `You're fighting ${clean(D.enemies[a.enemy]?.name || "")}: the fight goes on (food is eaten as needed).`
      : a.type === "scout" ? "You're running the route: it goes on." : `${clean(D.recipes[a.recipe].name)} keeps going.`;
    const pace = P >= 4 ? "a third of" : P >= 3 ? "a fifth of" : "a tenth of";
    const box = document.createElement("div");
    box.className = "op-leave";
    box.innerHTML = `<div class="op-leave-card" role="dialog" aria-label="The Outpost keeps going"><small>◆ UMBRA OUTPOST</small><h2>The Outpost keeps going</h2>
      <p class="op-leave-now">${doing}</p>
      <ul><li><b>While Umbra is open:</b> everything runs at full pace, on any tab.</li>
        <li><b>When you close Umbra:</b> the first <b>2 minutes</b> still count fully, then it carries on at <b>${pace} the pace</b>${P >= 3 ? " (your prestige bonus)" : ""}.</li>
        <li><b>For up to a day:</b> up to <b>24 hours</b> closed are counted, even with the computer off; after that it waits for you.</li>
        <li>Next time you open Umbra, the Outpost shows a summary of what happened while it was closed.</li></ul>
      <div class="op-leave-foot"><label><input type="checkbox"> Don't show this again</label><button type="button" class="solid">GOT IT</button></div></div>`;
    document.body.appendChild(box);
    const done = () => {
      if (box.querySelector("input").checked) refresh({ type: "options", closeNote: false });
      box.remove(); document.removeEventListener("keydown", key, true); Sound.click();
    };
    const key = (e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); done(); } };
    box.querySelector("button").addEventListener("click", done);
    box.addEventListener("click", (e) => { if (e.target === box) done(); });
    document.addEventListener("keydown", key, true);
  }
  function toggle() {
    if (!panel.hidden) { close(); Sound.click(); leaveNote(); return; }
    if (window.locked || document.body.classList.contains("locked")) return;
    ["closeSettings", "closeLoadout", "closeHistory", "closeMaps", "closeGalaxy", "closeFieldKit", "closeFarming", "closeRadar", "closeCore"].forEach((key) => window[key]?.());
    toggleThemes(false, true);
    document.getElementById("library").hidden = true;
    document.getElementById("library-btn").classList.remove("on");
    panel.hidden = false; button.classList.add("on"); document.body.classList.add("outpost-open");
    lastBody = lastNav = lastTop = "";
    refresh(); Sound.click();
  }
  button.addEventListener("click", toggle);
  $o(".op-close").addEventListener("click", () => { close(); Sound.click(); leaveNote(); });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || panel.hidden) return;
    if (overlay) { overlay = ""; render(true); return; }
    if (!$o(".op-layer").hidden && V?.state.away) { refresh({ type: "ack" }); return; }
    close(); leaveNote();
  });
  const otherPanels = ["maps", "galaxy", "fieldkit", "farming", "friends", "radar", "loadout", "history", "library", "themes", "settings", "core"];
  new MutationObserver(() => { if (!panel.hidden && otherPanels.some((id) => document.getElementById(id)?.hidden === false)) close(); })
    .observe(document.body, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  setInterval(() => {
    if (panel.hidden) return;
    if (window.offgrid || document.body.classList.contains("reduce-motion")) tick();
    else if (!barFrame) barFrame = requestAnimationFrame(barLoop);
  }, 100);
  // Umbra is open (whatever tab): the Outpost keeps its full pace. Only
  // closing Umbra counts as being away, so the summary comes once a session.
  const here = () => fetch("/api/outpost/seen", { method: "POST" }).catch(() => {});
  here(); setInterval(here, 30000);
  window.closeOutpost = close;
  window.toggleOutpost = toggle;
})();
