// Umbra Wiki achievements: badges earned by using Umbra (questions, topics,
// the field manual, streaks, off-grid life…). The backend counts progress
// and keeps what's earned for good (~/.local/share/umbra-wiki/achievements.json);
// this file draws the badges, the ACHIEVEMENTS tab of the loadout
// (loadout.js calls UmbraAchievements.render), the "unlocked" pop-ups and
// the badges pinned to the profile. Loaded after app.js and uses its helpers
// ($, Sound, escapeHtml).
"use strict";

(() => {
  let data = null;             // /api/achievements
  let filter = "all";          // all | earned | locked
  let selected = null;

  // Each tier has its own shape: a hexagon (bronze), a hexagon with an inner
  // ring (silver), a shield (gold) and an eight-point star (legendary).
  const SHAPES = {
    bronze: `<polygon class="bd-face" points="50,4 90,27 90,73 50,96 10,73 10,27"/>`,
    silver: `<polygon class="bd-face" points="50,4 90,27 90,73 50,96 10,73 10,27"/>
             <polygon class="bd-ring" points="50,13 82,31.5 82,68.5 50,87 18,68.5 18,31.5"/>`,
    gold: `<path class="bd-face" d="M50 4 L90 16 L90 50 C90 74 72 88 50 96 C28 88 10 74 10 50 L10 16 Z"/>
           <path class="bd-ring" d="M50 13 L82 22.5 L82 50 C82 69 68 80.5 50 87.5 C32 80.5 18 69 18 50 L18 22.5 Z"/>`,
    legendary: `<polygon class="bd-face" points="50,2 61,24 85,15 76,39 98,50 76,61 85,85 61,76 50,98 39,76 15,85 24,61 2,50 24,39 15,15 39,24"/>
                <circle class="bd-ring" cx="50" cy="50" r="27"/>`,
  };
  const pct = (a) => Math.round((Math.min(a.progress, a.goal) / a.goal) * 100);
  const hidden = (a) => a.secret && !a.earned;

  // A badge: the tier shape, the icon, and (while locked) a progress ring.
  function badge(a, size = "") {
    const p = pct(a);
    const ring = a.earned ? "" : `<circle class="bd-track" cx="50" cy="50" r="47"/>` +
      (p > 0 ? `<circle class="bd-prog" cx="50" cy="50" r="47" pathLength="100" stroke-dasharray="${p} 100"/>` : "");
    return `<span class="badge ${a.tier} ${a.earned ? "got" : "locked"} ${size}">
      <svg viewBox="0 0 100 100" aria-hidden="true">${ring}${SHAPES[a.tier]}</svg>
      <span class="bd-icon g">${hidden(a) ? "?" : a.icon}</span></span>`;
  }

  const when = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  async function load() {
    try { data = await (await fetch("/api/achievements")).json(); } catch { data = null; }
    return data;
  }

  // ---------------------------------------------------- the loadout tab

  async function render(grid, detail) {
    if (!data) await load();
    if (!data) { grid.innerHTML = `<p class="lib-note">Achievements are unavailable.</p>`; detail.innerHTML = ""; return; }
    const earned = data.achievements.filter((a) => a.earned).length;
    const next = data.next;
    const toNext = next ? Math.round(((data.points - prevRank()) / (next.points - prevRank())) * 100) : 100;
    const top = grid.scrollTop, again = grid.dataset.tab === "achievements" && grid.childElementCount > 0;
    grid.dataset.tab = "achievements";
    grid.classList.toggle("refreshing", again);
    grid.innerHTML = `
      <div class="ac-summary">
        <div class="ac-rank"><small>RANK</small><b>${escapeHtml(data.rank.toUpperCase())}</b></div>
        <div class="ac-count"><small>EARNED</small><b>${earned} / ${data.achievements.length}</b></div>
        <div class="ac-points"><small>POINTS</small><b>${data.points}</b></div>
        <div class="ac-next">
          <div class="ac-bar"><i style="width:${toNext}%"></i></div>
          <small>${next ? `${next.points - data.points} POINTS TO ${escapeHtml(next.rank.toUpperCase())}` : "HIGHEST RANK REACHED"}</small>
        </div>
      </div>
      <div class="ac-filters">${[["all", "ALL"], ["earned", "EARNED"], ["locked", "IN PROGRESS"]].map(([k, l]) =>
        `<button class="ghost ${filter === k ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}</div>
      <div class="ac-list"></div>`;
    const list = grid.querySelector(".ac-list");
    for (const [cat, label] of data.categories) {
      const items = data.achievements.filter((a) => a.category === cat &&
        (filter === "all" || (filter === "earned" ? a.earned : !a.earned)));
      if (!items.length) continue;
      const head = document.createElement("div");
      head.className = "lib-head";
      head.innerHTML = `<span>${label}</span><b>${items.filter((a) => a.earned).length}/${items.length}</b>`;
      list.appendChild(head);
      items.forEach((a, i) => {
        const card = document.createElement("button");
        card.className = `ac-card ${a.earned ? "got" : ""} ${selected === a.id ? "selected" : ""}`;
        card.style.animationDelay = `${Math.min(i, 10) * 25}ms`;
        card.innerHTML = `${badge(a)}<span class="ac-text"><b></b><small></small>
          <span class="ac-mini"><i style="width:${pct(a)}%"></i></span></span>
          <span class="ac-val">${a.earned ? "✓" : `${a.progress}/${a.goal}`}</span>`;
        card.querySelector("b").textContent = hidden(a) ? "Secret achievement" : a.name;
        card.querySelector("small").textContent = hidden(a) ? "Keep exploring to find it." : a.description;
        card.addEventListener("mouseenter", Sound.hover);
        card.addEventListener("click", () => { selected = a.id; Sound.click(); render(grid, detail); });
        list.appendChild(card);
      });
    }
    grid.querySelectorAll(".ac-filters button").forEach((b) => b.addEventListener("click", () => {
      filter = b.dataset.f; Sound.click(); grid.scrollTop = 0; render(grid, detail);
    }));
    grid.scrollTop = again ? top : 0;
    showDetail(detail, data.achievements.find((a) => a.id === selected) || data.achievements.find((a) => !a.earned && !a.secret) || data.achievements[0]);
  }

  function prevRank() {
    return [...data.ranks].reverse().find((r) => r[0] <= data.points)[0];
  }

  function showDetail(detail, a) {
    selected = a.id;
    const profile = (window.UmbraProfile && window.UmbraProfile.data) || {};
    const pinned = (profile.badges || []).includes(a.id);
    detail.innerHTML = `
      <div class="ac-stage">${badge(a, "big")}</div>
      <div class="ac-tier ${a.tier}">${data.tiers[a.tier]} · ${a.points} POINTS</div>
      <div class="lo-dname"></div>
      <p class="lo-desc ac-desc"></p>
      <div class="ac-progress"><div class="ac-bar"><i style="width:${pct(a)}%"></i></div>
        <span>${a.earned ? "COMPLETE" : `${a.progress} / ${a.goal} · ${pct(a)}%`}</span></div>
      <p class="ac-when">${a.earned ? `Earned on ${when(a.earned)}. It stays yours, and it's part of your backups.` : "Not earned yet."}</p>
      <div class="lo-actions">${a.earned ? `<button class="${pinned ? "ghost" : "solid"} ac-pin">${pinned ? "UNPIN FROM PROFILE" : "PIN TO PROFILE ◆"}</button>` : ""}</div>`;
    detail.querySelector(".lo-dname").textContent = (hidden(a) ? "Secret achievement" : a.name).toUpperCase();
    detail.querySelector(".ac-desc").textContent = hidden(a) ? "Some achievements only show themselves once you've earned them. Keep exploring." : a.description;
    detail.querySelector(".ac-pin")?.addEventListener("click", async () => {
      const badges = new Set(profile.badges || []);
      if (pinned) badges.delete(a.id);
      else if (badges.size >= 5) { Sound.error(); detail.querySelector(".ac-when").textContent = "Your profile shows up to 5 badges. Unpin one first."; return; }
      else badges.add(a.id);
      const ok = window.UmbraProfile && await window.UmbraProfile.update({ badges: [...badges] });
      if (!ok) { Sound.error(); return; }
      Sound.theme();
      showDetail(detail, a);
    });
  }

  // ------------------------------------------------------- unlocked!

  // New achievements pop up in the corner one after another, with a chime.
  const queue = [];
  let showing = false;
  function toast(a) {
    queue.push(a);
    if (!showing) nextToast();
  }
  function nextToast() {
    const a = queue.shift();
    if (!a) { showing = false; return; }
    showing = true;
    const el = document.createElement("div");
    el.className = `ac-toast ${a.tier}`;
    el.innerHTML = `${badge(a)}<span class="ac-toast-text"><small>ACHIEVEMENT UNLOCKED · +${a.points}</small><b></b><span></span></span>`;
    el.querySelector("b").textContent = a.name;
    el.querySelector(".ac-toast-text > span").textContent = a.description;
    el.addEventListener("click", () => { el.remove(); window.openLoadout && window.openLoadout("achievements"); selected = a.id; });
    document.body.appendChild(el);
    Sound.achieve();
    setTimeout(() => el.classList.add("leaving"), 4800);
    setTimeout(() => { el.remove(); nextToast(); }, 5300);
  }

  let checking = false;
  async function check() {
    if (checking || document.body.classList.contains("booting")) return;
    checking = true;
    try {
      const r = await (await fetch("/api/achievements/unseen")).json();
      data = r;
      r.unseen.forEach((id) => { const a = r.achievements.find((x) => x.id === id); if (a) toast(a); });
      if (r.unseen.length && window.refreshLoadoutTab) window.refreshLoadoutTab("achievements");
      if (r.unseen.length && window.UmbraProfile) window.UmbraProfile.refreshRecord?.();
    } catch {}
    checking = false;
  }
  setInterval(check, 4000);

  // Something the user did in the window (the backend counts the rest itself).
  window.track = (event, value) => {
    fetch("/api/achievements/event", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event, value }),
    }).then(check).catch(() => {});
  };

  window.UmbraAchievements = { render, badge, load, check, get data() { return data; } };
})();
