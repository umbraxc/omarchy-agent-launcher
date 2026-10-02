// Umbra profile cards: the public card a user shares with friends, drawn
// from what they chose to show (card data from /api/card). A 3D ASCII
// landscape (or their orb) behind, an animated ASCII frame around (flames,
// caution tape, aurora, static, circuit, frost, gold), their character, name
// effect, title, rank, achievements and Outpost on the front, and the QR
// code on the back. Also the CARD tab of Profile & Loadout, where the card
// is shaped and shared. Loaded after app.js, profile.js, achievements.js,
// orbs.js, ascii3d.js, scenery-lib.js and qr.js.
"use strict";

window.UmbraCard = (() => {
  const esc = (s) => escapeHtml(String(s ?? ""));
  const calm = () => document.body.classList.contains("reduce-motion") || window.offgrid;
  const ACCENTS = { signal: ["Signal", "var(--signal)"], accent: ["Ember", "var(--accent)"], net: ["Network", "var(--net)"], red: ["Alarm", "var(--red)"],
    green: ["Moss", "#6fcf7f"], violet: ["Violet", "#b28cf0"], ice: ["Ice", "#8fd8f4"], gold: ["Gold", "#ffd27a"] };
  const FRAMES = [
    ["flames", "Flames", "Fire licking the edges"], ["signal", "Caution tape", "Umbra's yellow and black"], ["aurora", "Aurora", "Northern lights flowing"],
    ["static", "Static", "A radio between stations"], ["circuit", "Circuit", "Signals racing round"], ["frost", "Frost", "Ice crystals sparkling"],
    ["gold", "Last Light", "Golden embers · Prestige IV"], ["plain", "Plain", "A single line"],
  ];
  const SCENES = [["campfire", "Campfire"], ["orb", "Your orb"], ["aurora", "Aurora"], ["mountains", "Mountains"], ["lighthouse", "Lighthouse"],
    ["forest", "Forest"], ["stars", "Milky Way"], ["winter", "Winter cabin"], ["storm", "Storm"], ["valley", "Valley"]];
  const FIELDS = [["character", "Character"], ["callsign", "Callsign"], ["title", "Title"], ["nameFx", "Name effect"], ["orb", "Orb"],
    ["rank", "Rank and points"], ["achievements", "Achievements"], ["badges", "Pinned badges"], ["outpost", "Outpost level"], ["skills", "Top Outpost skills"],
    ["motto", "Motto"], ["since", "Member since"], ["scenario", "Scenario"]];
  const ROMAN = ["", "I", "II", "III", "IV"];
  let outpostData = null;
  const skillsReady = fetch("/api/outpost/data").then((r) => r.json()).then((d) => { outpostData = d; }).catch(() => {});

  // ------------------------------------------------------------ frames
  // The animated border, drawn in ASCII on a canvas over the card's edge.
  function frameAnim(canvas, kind, accent) {
    const g = canvas.getContext("2d");
    let alive = true, timer = 0, W = 0, H = 0, dpr = 1;
    const cw = 7, ch = 11;
    const col = getComputedStyle(canvas).getPropertyValue("--ac").trim() || "#e8d27c";
    const rgb = (h) => h;
    const fire = ["#5a1206", "#a52a0c", "#e0570f", "#f59a1e", "#ffd25a", "#fff4c0"];
    const noise = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
    const smooth = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), u = x - xi, v = y - yi;
      const a = noise(xi, yi), b = noise(xi + 1, yi), c = noise(xi, yi + 1), d = noise(xi + 1, yi + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
    function size() {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return false;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      if (r.width !== W || r.height !== H) { W = r.width; H = r.height; canvas.width = W * dpr; canvas.height = H * dpr; }
      return true;
    }
    function put(cx, cy, glyph, color, alpha = 1) {
      g.globalAlpha = alpha; g.fillStyle = color; g.fillText(glyph, cx * cw + cw / 2, cy * ch + ch / 2);
    }
    function draw(t) {
      if (!size()) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.font = `600 ${ch - 1}px ${getComputedStyle(document.documentElement).getPropertyValue("--font") || "monospace"}`;
      g.textAlign = "center"; g.textBaseline = "middle";
      const cols = Math.floor(W / cw), rows = Math.floor(H / ch);
      const ring = (fn) => {   // every cell of the outer band: (x, y, depth from edge, edge, position along it)
        for (let x = 0; x < cols; x++) for (let d = 0; d < 4; d++) { fn(x, d, d, "top", x); fn(x, rows - 1 - d, d, "bottom", x); }
        for (let y = 4; y < rows - 4; y++) for (let d = 0; d < 4; d++) { fn(d, y, d, "left", y); fn(cols - 1 - d, y, d, "right", y); }
      };
      if (kind === "flames" || kind === "gold") {
        const pal = kind === "gold" ? ["#4a3208", "#8a5f12", "#c9922a", "#ffd27a", "#fff1b8", "#ffffff"] : fire;
        ring((x, y, d, edge, p) => {
          const rise = edge === "bottom" ? .75 : edge === "top" ? .35 : .55;
          const n = smooth(p * .28 + (edge === "left" ? 40 : edge === "right" ? 80 : 0), t * 2.6 - (edge === "bottom" ? 0 : p * .05));
          const h = (1.2 + 3 * n) * rise + (edge === "bottom" ? .6 : 0);
          if (d >= h) return;
          const k = 1 - d / h, flick = noise(x + Math.floor(t * 12), y);
          const gi = Math.min(5, Math.floor(k * 4 + flick * 1.6));
          put(x, y, " .:*^#"[Math.min(5, Math.max(1, Math.round(k * 4 + flick)))], pal[gi], .55 + .45 * k);
        });
        if (kind === "gold") for (let i = 0; i < 14; i++) {   // embers rising inside
          const p = (t * .08 + i / 14) % 1, x = Math.floor(cols * noise(i, 3)), y = Math.floor(rows * (1 - p));
          put(x, y, p < .5 ? "·" : "*", pal[4], .6 * (1 - p));
        }
      } else if (kind === "signal") {
        ring((x, y, d, edge, p) => {
          if (d > 0) return;
          const s = Math.floor((p + (edge === "bottom" || edge === "left" ? -1 : 1) * t * 6) / 2);
          put(x, y, "/", s % 2 ? col : "#1a1a1a", s % 2 ? .95 : .9);
        });
      } else if (kind === "aurora") {
        const pal = ["#3ee08a", "#46d8c6", "#5fb8f0", "#9b7cf0", "#d07cf0"];
        ring((x, y, d, edge, p) => {
          const n = smooth(p * .18, t * .6 + (edge === "left" || edge === "right" ? 20 : 0));
          const h = 1 + 3 * n;
          if (d >= h) return;
          const k = 1 - d / h;
          put(x, y, edge === "left" || edge === "right" ? "~" : "|", pal[Math.floor((p * .05 + t * .15) % pal.length)], .25 + .6 * k);
        });
      } else if (kind === "static") {
        ring((x, y, d) => {
          if (d > 1) return;
          const r = noise(x * 3 + Math.floor(t * 14), y * 7);
          if (r < .45) return;
          put(x, y, "░▒▓.:"[Math.floor(r * 50) % 5], r > .93 ? col : "#7a7a80", .35 + .5 * r);
        });
      } else if (kind === "circuit") {
        const per = 2 * (cols + rows - 2);
        const at = (s) => { s = ((s % per) + per) % per;
          if (s < cols) return [s, 0]; s -= cols; if (s < rows - 1) return [cols - 1, s + 1]; s -= rows - 1;
          if (s < cols - 1) return [cols - 2 - s, rows - 1]; s -= cols - 1; return [0, rows - 2 - s]; };
        for (let s = 0; s < per; s++) { const [x, y] = at(s); put(x, y, y === 0 || y === rows - 1 ? "─" : "│", col, .25); }
        for (let k = 0; k < 4; k++) for (let tail = 0; tail < 10; tail++) {
          const [x, y] = at(t * 22 + k * per / 4 - tail);
          put(x, y, tail ? "·" : "■", col, 1 - tail / 10);
        }
      } else if (kind === "frost") {
        ring((x, y, d) => {
          const r = noise(x, y);
          if (d > 2 || r < .55 - d * .1) return;
          const tw = .5 + .5 * Math.sin(t * 3 + r * 40);
          put(x, y, "*✦+·"[Math.floor(r * 37) % 4], tw > .8 ? "#ffffff" : "#8fd8f4", .3 + .6 * tw * (1 - d / 3));
        });
      }
      g.globalAlpha = 1;
    }
    const loop = () => {
      if (!alive) return;
      if (canvas.isConnected && !document.hidden) draw(performance.now() / 1000);
      if (!calm() && kind !== "plain") timer = setTimeout(loop, 70);
    };
    loop();
    return () => { alive = false; clearTimeout(timer); };
  }

  // --------------------------------------------------------- the card
  const titleName = (id) => (window.UmbraAchievements?.data?.rewards || []).find((r) => r.id === id)?.name || "";
  const badgeName = (id) => (window.UmbraAchievements?.data?.achievements || []).find((a) => a.id === id)?.name || id;
  const skill = (id) => outpostData?.skills?.[id] || { name: id.replace(/_/g, " "), glyph: "◆", color: "var(--signal)" };
  const stars = (n) => [1, 2, 3, 4].map((i) => `<i class="${i <= n ? "on" : ""}">${i <= n ? "★" : "☆"}</i>`).join("");
  const shortId = (id) => (id || "").slice(0, 12).toUpperCase().replace(/(.{4})(?=.)/g, "$1·");

  // Draw a card into `host`. Returns { el, flip(), stop() }.
  function render(host, card, o = {}) {
    const st = card.st || {}, accent = ACCENTS[st.ac] ? st.ac : "signal", frame = st.f || "signal";
    const el = document.createElement("div");
    el.className = `ucard f-${frame}` + (o.small ? " small" : "");
    el.style.setProperty("--ac", ACCENTS[accent][1]);
    const face = card.ch ? window.UmbraProfile?.art(card.ch)?.[0]?.join("\n") : "";
    const op = card.op || {};
    const verified = o.verified ?? !!card.sig;
    el.innerHTML = `<div class="uc-inner">
      <div class="uc-face uc-front">
        <canvas class="uc-scene"></canvas><div class="uc-shade"></div>
        <div class="uc-body">
          <div class="uc-top"><span>◆ UMBRA // PROFILE CARD</span>${card.r ? `<b>${esc(card.r.toUpperCase())}</b>` : ""}</div>
          <div class="uc-id">
            <pre class="uc-portrait" ${card.c ? `style="color:var(--${esc(card.c)})"` : ""}>${esc(face || "  .---.\n |? ?|\n | - |\n '---'\n  / \\")}</pre>
            ${card.o ? `<pre class="uc-orb orb" data-orb="${esc(card.o)}"></pre>` : ""}
          </div>
          <div class="uc-name"><span class="uc-n fx-${esc(card.fx || "plain")}">${esc(card.n)}</span>${card.cs ? `<small>· ${esc(card.cs)}</small>` : ""}</div>
          ${card.t && titleName(card.t) ? `<div class="uc-title"><span class="title-tag">${esc(titleName(card.t).toUpperCase())}</span></div>` : ""}
          ${card.m ? `<p class="uc-motto">“${esc(card.m)}”</p>` : ""}
          <div class="uc-stats">
            ${card.a != null ? `<div><small>ACHIEVEMENTS</small><b>${card.a}<i>/${card.at || "?"}</i></b></div>` : ""}
            ${card.p != null ? `<div><small>POINTS</small><b>${card.p}</b></div>` : ""}
            ${op.tl != null ? `<div><small>OUTPOST LEVEL</small><b>${op.tl}</b></div>` : ""}
            ${op.tl != null ? `<div><small>PRESTIGE</small><b class="uc-stars">${stars(op.pr || 0)}</b></div>` : ""}
          </div>
          ${op.top?.length ? `<div class="uc-skills">${op.top.map(([s, l]) => `<span style="--sc:${esc(skill(s).color)}"><i>${esc(skill(s).glyph)}</i>${esc(skill(s).name)} <b>${l}</b></span>`).join("")}</div>` : ""}
          ${card.b?.length ? `<div class="uc-badges">${card.b.map((b) => `<span>✦ ${esc(badgeName(b))}</span>`).join("")}</div>` : ""}
          <div class="uc-foot"><span>${card.s ? `SINCE ${esc(card.s)}` : ""}${card.sc ? ` · ${esc(card.sc.toUpperCase())}` : ""}</span>
            <span class="${verified ? "uc-ok" : "uc-unsigned"}" title="${verified ? "Signed|This card is signed by its owner's Umbra: it really comes from them." : "Not signed|This card isn't signed by its owner's Umbra, so it may have been changed."}">${verified ? "✓ SIGNED" : "◇ UNSIGNED"} · ${esc(shortId(card.id))}</span></div>
        </div>
      </div>
      <div class="uc-face uc-back">
        <div class="uc-back-top">◆ ADD ${esc(card.n.toUpperCase())} AS A FRIEND</div>
        <div class="uc-qr"><canvas></canvas></div>
        <p>In Umbra: <b>Friends › Add a friend</b>, then the picture of this card, the file or the code.</p>
        <small>Only this card is shared. Nothing else leaves the computer.</small>
      </div>
    </div><canvas class="uc-frame"></canvas>`;
    host.appendChild(el);
    const stops = [];
    // The landscape behind (or the orb, large).
    const sceneCanvas = el.querySelector(".uc-scene");
    const bg = st.bg || "campfire";
    if (!o.small && !window.offgrid && window.Ascii3D && window.UmbraScenery?.scenes?.[bg]) {
      try { const v = Ascii3D.view(sceneCanvas, UmbraScenery.scenes[bg].build(), { cell: 7 }); stops.push(() => v.stop()); } catch {}
    } else if (bg === "orb" && card.o && window.umbraOrb && !o.small) {
      sceneCanvas.replaceWith(Object.assign(document.createElement("pre"), { className: "uc-scene uc-bigorb orb" }));
      stops.push(window.umbraOrb(el.querySelector(".uc-bigorb"), 30, 20, card.o));
    }
    const orbEl = el.querySelector(".uc-orb");
    if (orbEl && window.umbraOrb) stops.push(window.umbraOrb(orbEl, o.small ? 7 : 11, o.small ? 5 : 8, card.o));
    if (!o.small) stops.push(frameAnim(el.querySelector(".uc-frame"), frame, accent));
    let qrDone = false;
    const api = {
      el,
      flip(back = !el.classList.contains("flipped")) {
        if (back && !qrDone && o.code) {
          try { UmbraQR.draw(el.querySelector(".uc-qr canvas"), o.code, { px: 260 }); } catch {}
          qrDone = true;
        }
        if (back === el.classList.contains("flipped")) return;
        if (calm()) { el.classList.toggle("flipped", back); return; }
        el.classList.remove("flipping"); void el.offsetWidth; el.classList.add("flipping");
        setTimeout(() => el.classList.toggle("flipped", back), 270);
        setTimeout(() => el.classList.remove("flipping"), 600);
      },
      stop() { stops.forEach((f) => { try { f && f(); } catch {} }); },
    };
    skillsReady.then(() => { if (op.top?.length && el.isConnected) el.querySelectorAll(".uc-skills span").forEach((s, i) => {
      const k = skill(op.top[i][0]); s.style.setProperty("--sc", k.color); s.querySelector("i").textContent = k.glyph;
      s.childNodes[1].textContent = k.name + " "; }); });
    return api;
  }

  // A picture of a card to share: the QR code with the name, title and Umbra frame.
  function sharePicture(card, code) {
    const qr = UmbraQR.draw(document.createElement("canvas"), code, { scale: 6 });
    const pad = 36, W = qr.width + pad * 2, H = qr.height + pad * 2 + 120;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), css = getComputedStyle(document.documentElement);
    const sig = css.getPropertyValue("--signal").trim() || "#e8d27c", bg = css.getPropertyValue("--bg").trim() || "#090909";
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = sig; g.lineWidth = 3; g.strokeRect(10, 10, W - 20, H - 20);
    g.fillStyle = sig; g.font = "700 22px monospace"; g.textAlign = "center";
    g.fillText("◆ UMBRA // PROFILE CARD", W / 2, 50);
    g.drawImage(qr, pad, 70);
    g.fillStyle = "#f0f0f0"; g.font = "700 30px monospace"; g.fillText(card.n, W / 2, qr.height + 120);
    g.fillStyle = "#96969a"; g.font = "16px monospace";
    g.fillText("Umbra › Friends › Add a friend › this picture", W / 2, qr.height + 150);
    return c;
  }

  // ------------------------------------------------- the CARD tab (editor)
  let data = null;
  async function load() { data = await (await fetch("/api/card")).json(); return data; }
  async function save(update) {
    try {
      const r = await fetch("/api/card", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(update) });
      const d = await r.json();
      if (d.ok === false) throw new Error(d.message);
      data = d;
    } catch (e) { window.umbraToast?.(e.message || "The card couldn't be saved."); }
    return data;
  }

  function editor(grid, detail) {
    let live = null, stopped = false;
    grid.innerHTML = `<div class="uc-stage"><div class="uc-holder"></div>
      <div class="uc-flipbar"><button type="button" class="ghost uc-flip">⟲ SHOW THE QR SIDE</button></div></div>`;
    detail.innerHTML = `<div class="uc-editor"><div class="uc-loading">Drawing your card…</div></div>`;
    const draw = () => {
      if (stopped || !data) return;
      const holder = grid.querySelector(".uc-holder"), back = live?.el.classList.contains("flipped");
      live?.stop(); holder.innerHTML = "";
      live = render(holder, data.card, { code: data.code });
      if (back) live.flip(true);
    };
    const paint = () => {
      const p = data.prefs, prestige = data.card.op?.pr ?? 0;
      detail.innerHTML = `<div class="uc-editor">
        <div class="uc-privacy"><b>◆ ONLY THIS CARD IS SHARED</b>
          <p>What you see on the card, at the moment you share it. Your health notes, location, contacts, conversations, files, vault and everything else stay on this computer.</p></div>
        <section><h3>FRAME</h3><div class="uc-chips">${FRAMES.map(([id, name, hint]) => {
          const locked = id === "gold" && prestige < 4;
          return `<button type="button" class="uc-chip ${p.frame === id ? "on" : ""}" data-frame="${id}" ${locked ? "disabled" : ""} title="${esc(name)}|${esc(locked ? "Unlocks at Prestige IV in Umbra Outpost" : hint)}">${locked ? "🔒︎ " : ""}${esc(name)}</button>`; }).join("")}</div></section>
        <section><h3>BACKGROUND</h3><div class="uc-chips">${SCENES.map(([id, name]) => `<button type="button" class="uc-chip ${p.bg === id ? "on" : ""}" data-bg="${id}">${esc(name)}</button>`).join("")}</div></section>
        <section><h3>COLOUR</h3><div class="uc-colors">${Object.entries(ACCENTS).map(([id, [name, c]]) => `<button type="button" class="uc-dot ${p.accent === id ? "on" : ""}" data-accent="${id}" style="--dot:${c}" title="${esc(name)}"></button>`).join("")}</div></section>
        <section><h3>MOTTO</h3><input type="text" class="uc-motto-in" maxlength="90" placeholder="A line for your card, like “Keep the fire lit.”" value="${esc(p.motto)}"></section>
        <section><h3>SHOWN ON THE CARD</h3><div class="uc-fields">${FIELDS.map(([k, name]) => `<label><input type="checkbox" data-field="${k}" ${p.fields[k] ? "checked" : ""}><span>${esc(name)}</span></label>`).join("")}</div>
          <small class="uc-note">Your name is always shown. Your picture never is: the card shows your character instead.</small></section>
        <section class="uc-share"><h3>SHARE</h3>
          <div class="uc-actions"><button type="button" class="solid" data-share="qr">▦ SHOW QR CODE</button><button type="button" class="ghost" data-share="copy">⧉ COPY CARD CODE</button>
            <button type="button" class="ghost" data-share="save">▣ SAVE CARD FILES</button><button type="button" class="ghost" data-share="friends">◈ OPEN FRIENDS</button></div>
          <small class="uc-note">Saving writes <b>${esc(data.card.n)}.umbracard</b> and a picture of the QR code to Documents › Umbra Friend Cards, ready for a USB stick or a message.</small></section>
      </div>`;
      detail.querySelectorAll("[data-frame]").forEach((b) => b.addEventListener("click", () => change({ frame: b.dataset.frame })));
      detail.querySelectorAll("[data-bg]").forEach((b) => b.addEventListener("click", () => change({ bg: b.dataset.bg })));
      detail.querySelectorAll("[data-accent]").forEach((b) => b.addEventListener("click", () => change({ accent: b.dataset.accent })));
      detail.querySelectorAll("[data-field]").forEach((b) => b.addEventListener("change", () => change({ fields: { [b.dataset.field]: b.checked } })));
      let mt = 0;
      detail.querySelector(".uc-motto-in").addEventListener("input", (e) => { clearTimeout(mt); mt = setTimeout(() => change({ motto: e.target.value }, true), 500); });
      detail.querySelectorAll("[data-share]").forEach((b) => b.addEventListener("click", () => share(b.dataset.share)));
    };
    async function change(update, quiet) {
      if (!quiet) Sound.click();
      await save(update);
      if (stopped) return;
      draw();
      if (!quiet) paint();
    }
    async function share(how) {
      Sound.click();
      if (how === "qr") { live?.flip(true); return; }
      if (how === "friends") { window.closeLoadout?.(); window.UmbraFriends?.open(); return; }
      if (how === "copy") {
        try { await navigator.clipboard.writeText(data.code); window.umbraToast?.("Card code copied. Paste it to a friend: they add it in Friends."); }
        catch { window.prompt("Your card code:", data.code); }
        return;
      }
      const png = sharePicture(data.card, data.code).toDataURL("image/png").split(",")[1];
      const r = await fetch("/api/card/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ png, open: true }) }).then((x) => x.json()).catch(() => ({}));
      window.umbraToast?.(r.ok ? "Card saved to Documents › Umbra Friend Cards." : r.message || "The card couldn't be saved.");
    }
    grid.querySelector(".uc-flip").addEventListener("click", () => { Sound.click(); live?.flip(); grid.querySelector(".uc-flip").textContent = live?.el.classList.contains("flipped") ? "⟲ SHOW THE FRONT" : "⟲ SHOW THE QR SIDE"; });
    load().then(() => { draw(); paint(); }).catch(() => { detail.innerHTML = `<div class="uc-editor"><p>The card couldn't be loaded.</p></div>`; });
    return () => { stopped = true; live?.stop(); };
  }

  return { render, editor, sharePicture, load, FRAMES, SCENES, ACCENTS };
})();
