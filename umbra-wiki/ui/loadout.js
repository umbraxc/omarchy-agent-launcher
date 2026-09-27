// Umbra Wiki loadout: choose the scenario you're in and the personality
// Umbra answers with, or create your own personality. Loaded after app.js
// and uses its helpers ($, Sound, postSettings, confirmDialog, escapeHtml).
"use strict";

(() => {
  const state = {
    data: { scenarios: [], personalities: [] },
    custom: [],
    scenario: "everyday",
    personality: "umbra",
    tab: "personality",
    selected: null,       // id shown in the detail pane
    stopAnim: null,
  };
  const TRAITS = ["Warmth", "Humor", "Brevity", "Caution", "Grit"];
  const TRAIT_HINTS = {
    Warmth: "How friendly and encouraging it sounds",
    Humor: "Jokes and wit (always off in medical emergencies)",
    Brevity: "How short its answers are",
    Caution: "How much it double-checks risky steps",
    Grit: "How hard it pushes you to keep going",
  };

  const overlay = $("#loadout");
  const grid = overlay.querySelector(".lo-grid");
  const detail = overlay.querySelector(".lo-detail");

  const personalities = () => state.data.personalities.concat(state.custom);
  const faces = () => state.data.personalities.map((p) => p.art);
  const artOf = (item) => item.art || faces()[item.face || 0] || faces()[0];
  const list = () => (state.tab === "scenario" ? state.data.scenarios : personalities());
  const current = () => (state.tab === "scenario" ? state.scenario : state.personality);
  const find = (id, kind = state.tab) =>
    (kind === "scenario" ? state.data.scenarios : personalities()).find((x) => x.id === id);

  // ---------------------------------------------------------- loading

  async function load() {
    try { state.data = await (await fetch("loadout.json")).json(); } catch {}
    try { state.custom = await (await fetch("/api/personalities")).json(); } catch {}
    try {
      const s = await (await fetch("/api/settings")).json();
      if (s.scenario && find(s.scenario, "scenario")) state.scenario = s.scenario;
      if (s.personality && find(s.personality, "personality")) state.personality = s.personality;
    } catch {}
    applyLoadout();
  }

  // The header chip and the personality's own waiting lines.
  function applyLoadout() {
    const sc = find(state.scenario, "scenario");
    const pe = find(state.personality, "personality");
    const chip = $("#loadout-chip");
    if (chip && sc && pe) chip.textContent = `${sc.name} · ${pe.name}`.toUpperCase();
    window.loadoutQuips = (pe && pe.quips) || [];
  }

  // ----------------------------------------------------------- motion

  // Portraits blink now and then; scenes alternate their two frames.
  function animate(pre, frames, kind) {
    let alive = true, frame = 0, t = 0;
    const show = (i) => { pre.textContent = frames[i % frames.length].join("\n"); };
    show(0);
    const tick = () => {
      if (!alive || !pre.isConnected) return;
      t++;
      if (kind === "scenario") { frame = (frame + 1) % frames.length; show(frame); setTimeout(tick, 650); }
      else {
        const blink = t % 18 === 0 || t % 47 === 0;
        show(blink ? 1 : 0);
        setTimeout(tick, blink ? 140 : 170);
      }
    };
    setTimeout(tick, 400);
    return () => { alive = false; };
  }

  // ------------------------------------------------------------ views

  function render() {
    overlay.querySelectorAll(".lo-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
    if (!state.selected || !find(state.selected)) state.selected = current();
    grid.innerHTML = "";
    list().forEach((item, i) => {
      const card = document.createElement("button");
      card.className = "lo-card" + (item.id === current() ? " active" : "") + (item.id === state.selected ? " selected" : "");
      card.style.animationDelay = `${i * 30}ms`;
      card.innerHTML = `<pre class="lo-mini"></pre><span class="lo-name"></span><span class="lo-tag"></span>`;
      card.querySelector(".lo-mini").textContent = artOf(item)[0].join("\n");
      card.querySelector(".lo-name").textContent = item.name;
      card.querySelector(".lo-tag").textContent = item.tagline || "";
      card.addEventListener("mouseenter", Sound.hover);
      card.addEventListener("click", () => { state.selected = item.id; Sound.click(); render(); });
      grid.appendChild(card);
    });
    if (state.tab === "personality") {
      const create = document.createElement("button");
      create.className = "lo-card lo-create";
      create.innerHTML = `<span class="lo-plus">+</span><span class="lo-name">Create personality</span><span class="lo-tag">Your own voice and traits</span>`;
      create.addEventListener("mouseenter", Sound.hover);
      create.addEventListener("click", () => editor(null));
      grid.appendChild(create);
    }
    showDetail(find(state.selected));
  }

  function statBars(stats) {
    return Object.entries(stats || {}).map(([k, v], i) =>
      `<div class="lo-stat"><span class="lo-sk">${escapeHtml(k.toUpperCase())}</span>
       <span class="lo-bar">${[1, 2, 3, 4, 5].map((n) =>
        `<i class="${n <= v ? "fill" : ""}" style="animation-delay:${i * 90 + n * 45}ms"></i>`).join("")}</span></div>`).join("");
  }

  function showDetail(item) {
    if (state.stopAnim) state.stopAnim();
    if (!item) { detail.innerHTML = ""; return; }
    const active = item.id === current();
    detail.innerHTML = `
      <div class="lo-stage"><pre class="lo-portrait"></pre></div>
      <div class="lo-dname"></div>
      <div class="lo-dtag"></div>
      <div class="lo-stats">${statBars(item.stats)}</div>
      <p class="lo-desc"></p>
      ${item.sample ? `<blockquote class="lo-sample"></blockquote>` : ""}
      <div class="lo-actions">
        ${item.custom ? `<button class="ghost lo-edit">✎ EDIT</button><button class="ghost lo-del">✕ DELETE</button>` : ""}
        <button class="solid lo-deploy" ${active ? "disabled" : ""}>${active ? "ACTIVE ✓" : "DEPLOY ▸"}</button>
      </div>`;
    detail.querySelector(".lo-dname").textContent = item.name.toUpperCase();
    detail.querySelector(".lo-dtag").textContent = item.tagline || "";
    detail.querySelector(".lo-desc").textContent = item.description || item.voice || "";
    if (item.sample) detail.querySelector(".lo-sample").textContent = `“${item.sample}”`;
    state.stopAnim = animate(detail.querySelector(".lo-portrait"), artOf(item), state.tab);
    detail.querySelector(".lo-deploy").addEventListener("click", () => deploy(item));
    detail.querySelector(".lo-edit")?.addEventListener("click", () => editor(item));
    detail.querySelector(".lo-del")?.addEventListener("click", () => remove(item));
  }

  async function deploy(item) {
    if (state.tab === "scenario") state.scenario = item.id; else state.personality = item.id;
    await postSettings(state.tab === "scenario" ? { scenario: item.id } : { personality: item.id });
    applyLoadout();
    Sound.theme();
    render();
    const stage = detail.querySelector(".lo-stage");
    stage?.classList.add("deployed");
  }

  async function remove(item) {
    const ok = await confirmDialog({
      kind: "to-local", tag: "DELETE", title: `DELETE "${item.name.toUpperCase()}"?`,
      body: "This personality will be removed. You can always create it again.", ok: "DELETE", cancel: "KEEP",
    });
    if (!ok) return;
    state.custom = await (await fetch("/api/personalities/delete", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id }),
    })).json();
    if (state.personality === item.id) state.personality = "umbra";
    state.selected = state.personality;
    applyLoadout();
    render();
  }

  // ----------------------------------------------------------- editor

  function editor(existing) {
    if (state.stopAnim) state.stopAnim();
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : {
      name: "", tagline: "", voice: "", sample: "", face: 0,
      stats: { Warmth: 3, Humor: 2, Brevity: 3, Caution: 3, Grit: 3 },
    };
    detail.innerHTML = `
      <div class="lo-ed-title">${existing ? "EDIT PERSONALITY" : "CREATE PERSONALITY"}</div>
      <div class="lo-face">
        <button class="ghost lo-prev" title="Previous face">◂</button>
        <pre class="lo-portrait"></pre>
        <button class="ghost lo-next" title="Next face">▸</button>
      </div>
      <label class="lo-field"><span>NAME</span><input class="lo-in-name" maxlength="28" placeholder="The Navigator"></label>
      <label class="lo-field"><span>TAGLINE</span><input class="lo-in-tag" maxlength="48" placeholder="Always knows the way home"></label>
      <label class="lo-field"><span>HOW IT TALKS</span><textarea class="lo-in-voice" maxlength="400" rows="3"
        placeholder="A calm ship's navigator who explains everything in terms of maps, stars and headings."></textarea></label>
      <label class="lo-field"><span>SAMPLE LINE</span><input class="lo-in-sample" maxlength="120" placeholder="Hold your heading. We'll get there."></label>
      <div class="lo-sliders"></div>
      <div class="lo-actions">
        <button class="ghost lo-cancel">CANCEL</button>
        <button class="solid lo-save">SAVE &amp; DEPLOY</button>
      </div>`;
    const q = (sel) => detail.querySelector(sel);
    q(".lo-in-name").value = draft.name;
    q(".lo-in-tag").value = draft.tagline || "";
    q(".lo-in-voice").value = draft.voice || "";
    q(".lo-in-sample").value = draft.sample || "";
    let stop = null;
    const showFace = () => {
      if (stop) stop();
      stop = animate(q(".lo-portrait"), faces()[draft.face % faces().length], "personality");
    };
    showFace();
    q(".lo-prev").addEventListener("click", () => { draft.face = (draft.face + faces().length - 1) % faces().length; Sound.click(); showFace(); });
    q(".lo-next").addEventListener("click", () => { draft.face = (draft.face + 1) % faces().length; Sound.click(); showFace(); });

    const sliders = q(".lo-sliders");
    for (const t of TRAITS) {
      const row = document.createElement("label");
      row.className = "lo-slider";
      row.innerHTML = `<span class="lo-sk"></span><input type="range" min="1" max="5" step="1"><b></b><small></small>`;
      row.querySelector(".lo-sk").textContent = t.toUpperCase();
      row.querySelector("small").textContent = TRAIT_HINTS[t];
      const input = row.querySelector("input");
      const val = row.querySelector("b");
      input.value = draft.stats[t];
      val.textContent = input.value;
      input.addEventListener("input", () => { draft.stats[t] = Number(input.value); val.textContent = input.value; });
      sliders.appendChild(row);
    }

    q(".lo-cancel").addEventListener("click", () => { if (stop) stop(); Sound.click(); render(); });
    q(".lo-save").addEventListener("click", async () => {
      draft.name = q(".lo-in-name").value.trim() || "My personality";
      draft.tagline = q(".lo-in-tag").value.trim();
      draft.voice = q(".lo-in-voice").value.trim();
      draft.sample = q(".lo-in-sample").value.trim();
      draft.description = draft.voice;
      const slug = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "persona";
      draft.id = existing ? existing.id : `custom-${slug}`;
      const res = await fetch("/api/personalities", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ personality: draft }),
      });
      if (!res.ok) { Sound.error(); return; }
      state.custom = await res.json();
      if (stop) stop();
      state.selected = draft.id;
      await deploy(find(draft.id));
    });
    Sound.click();
  }

  // ------------------------------------------------------ open / close

  function open(tab) {
    if (document.body.classList.contains("locked")) return;
    if (tab) state.tab = tab;
    state.selected = current();
    $("#themes").hidden = true;
    $("#library").hidden = true;
    $("#theme-btn").classList.remove("on");
    $("#library-btn").classList.remove("on");
    overlay.hidden = false;
    $("#loadout-btn").classList.add("on");
    render();
    Sound.click();
  }
  function close() {
    if (overlay.hidden) return;
    if (state.stopAnim) state.stopAnim();
    overlay.hidden = true;
    $("#loadout-btn").classList.remove("on");
    Sound.click();
  }

  $("#loadout-btn").addEventListener("click", () => (overlay.hidden ? open() : close()));
  $("#loadout-chip").addEventListener("click", () => open());
  overlay.querySelector(".lo-close").addEventListener("click", close);
  overlay.querySelectorAll(".lo-tabs button").forEach((b) => b.addEventListener("click", () => {
    if (state.tab === b.dataset.tab) return;
    state.tab = b.dataset.tab;
    state.selected = null;
    Sound.click();
    render();
  }));
  // Esc closes the loadout before anything else reacts to it.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden && $("#modal").hidden) { e.stopImmediatePropagation(); close(); }
  }, true);
  // Locking the window closes the loadout.
  new MutationObserver(() => { if (document.body.classList.contains("locked")) close(); })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  // Keep in step with changes made elsewhere (the bar widget).
  setInterval(async () => {
    try {
      const s = await (await fetch("/api/settings")).json();
      if ((s.scenario && s.scenario !== state.scenario) || (s.personality && s.personality !== state.personality)) {
        state.scenario = s.scenario || state.scenario;
        state.personality = s.personality || state.personality;
        applyLoadout();
        if (!overlay.hidden) render();
      }
    } catch {}
  }, 4000);

  window.openLoadout = open;
  load().then(() => {
    if (new URLSearchParams(location.search).get("view") === "loadout") open();
  });
})();
