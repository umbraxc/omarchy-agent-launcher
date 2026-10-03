// Umbra Friends: the people whose profile cards you have, and the Camp
// Network. Three views: FRIENDS (their live cards, and chat when linked),
// ADD A FRIEND (a card's picture, file or code) and CAMP NETWORK (Umbras on
// the same local network, found and linked directly, encrypted, with no
// internet; a 3D ASCII camp where every Umbra nearby is a beacon). Only
// profile cards and the messages you write are ever shared. Loaded after
// app.js and card.js (uses $, Sound, escapeHtml, locked, UmbraCard, UmbraQR).
"use strict";

window.UmbraFriends = (() => {
  const esc = (s) => escapeHtml(String(s ?? ""));
  const calm = () => document.body.classList.contains("reduce-motion") || window.offgrid;
  const api = (path, body) => fetch(path, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(async (r) => { const d = await r.json(); if (!r.ok || d.ok === false) throw new Error(d.message || "Something went wrong."); return d; });
  let el = null, view = "friends", friends = [], camp = null, selected = null, poll = 0, bg = 0;
  let stops = [], cardView = null, campView = null, linking = {}, chatFor = "", chatSig = "";

  // --------------------------------------------------------- the panel
  function build() {
    if (el) return;
    el = document.createElement("section");
    el.id = "friends"; el.className = "friends"; el.hidden = true;
    el.setAttribute("aria-label", "Friends");
    el.innerHTML = `
      <div class="fr-head"><span class="fr-title"><span class="g">󰡉</span> FRIENDS</span>
        <div class="fr-tabs"><button type="button" data-view="friends">FRIENDS</button><button type="button" data-view="add">ADD A FRIEND</button><button type="button" data-view="camp">CAMP NETWORK <i class="fr-camp-dot"></i></button><button type="button" data-view="list">SHARED LIST</button></div>
        <button type="button" class="ghost fr-checkin" title="Check in|Tell your friends you're OK (or need help, are away or on the move). It goes on your card, live for linked friends."><span class="fr-ci-dot"></span> CHECK IN</button>
        <span class="fr-safe" title="What's shared|Only profile cards, and the messages you write to linked friends. Your conversations, health notes, location, files and everything else stay on this computer.">◆ ONLY PROFILE CARDS ARE SHARED</span>
        <button type="button" class="ghost fr-close" title="Close (Esc)">CLOSE ✕</button></div>
      <div class="fr-body"></div>`;
    document.body.appendChild(el);
    el.querySelector(".fr-close").addEventListener("click", () => toggle(false));
    el.querySelector(".fr-checkin").addEventListener("click", (e) => { e.stopPropagation(); Sound.click(); checkinPopover(); });
    el.querySelectorAll(".fr-tabs button").forEach((b) => b.addEventListener("click", () => { Sound.click(); show(b.dataset.view); }));
    // A card file or a picture of one, dropped anywhere on the panel.
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("dropping"); });
    el.addEventListener("dragleave", (e) => { if (e.target === el) el.classList.remove("dropping"); });
    el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("dropping"); const f = e.dataTransfer.files?.[0]; if (f) importFile(f); });
  }

  function cleanup() { stops.forEach((f) => { try { f(); } catch {} }); stops = []; cardView?.stop(); cardView = null; campView = null; }

  function show(v) {
    view = v;
    cleanup();
    el.querySelectorAll(".fr-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    const body = el.querySelector(".fr-body");
    body.className = "fr-body fr-" + v;
    if (v === "friends") friendsView(body);
    else if (v === "add") addView(body);
    else if (v === "list") listView(body);
    else campViewBuild(body);
  }

  // -------------------------------------------------------- CHECK IN
  let myCheckin = null;
  async function checkinPopover() {
    let pop = el.querySelector(".fr-ci-pop");
    if (pop) { pop.remove(); return; }
    pop = document.createElement("div");
    pop.className = "fr-ci-pop";
    pop.innerHTML = `<div class="fr-ci-head"><b>◉ CHECK IN</b><small>${myCheckin ? `Last: ${esc(UmbraCard.CHECKIN[myCheckin.st]?.[1] || "OK")}, ${esc(UmbraCard.agoText(myCheckin.at))}` : "Let your friends know how you are."}</small></div><div class="fr-ci-host"></div>`;
    el.querySelector(".fr-head").appendChild(pop);
    await UmbraCard.checkinBox(pop.querySelector(".fr-ci-host"), myCheckin, (ci) => { myCheckin = ci; paintCheckinDot(); pop.remove(); });
    const away = (e) => { if (!pop.contains(e.target) && !e.target.closest(".fr-checkin")) { pop.remove(); document.removeEventListener("mousedown", away); } };
    document.addEventListener("mousedown", away);
  }
  function paintCheckinDot() {
    const b = el?.querySelector(".fr-checkin");
    if (!b) return;
    const late = UmbraCard.overdue(myCheckin);
    b.dataset.st = late ? "late" : myCheckin?.st || "";
    b.querySelector(".fr-ci-dot").title = myCheckin ? `${UmbraCard.CHECKIN[myCheckin.st]?.[1]} · ${UmbraCard.agoText(myCheckin.at)}` : "";
    // A promised check-in that's due: a gentle reminder, once.
    if (late && paintCheckinDot.warned !== myCheckin.at) { paintCheckinDot.warned = myCheckin.at; toast(`◉ Your check-in is due: you said every ${myCheckin.ev} h.`, () => { open("friends"); checkinPopover(); }); }
  }

  // ---------------------------------------------------- SHARED LIST
  // One supply list for everyone linked: a household, a camp. It works on its
  // own too, and syncs whenever friends are linked on the Camp Network.
  let listItems = [], listSig = "";
  async function listView(body) {
    body.innerHTML = `<div class="sl-wrap"><div class="sl-head"><div><small>◆ SHARED SUPPLY LIST</small><h2>What the camp needs</h2>
        <p>Everyone linked on the Camp Network sees the same list and can add, tick and remove items. It syncs whenever you're linked, and works on its own in between.</p></div>
        <pre class="sl-art">${esc("   _____\n  |#####|\n  |=====|  ✓\n  |#####|\n  '-----'")}</pre></div>
      <form class="sl-add"><input type="text" class="sl-t" maxlength="80" placeholder="Add an item: water, batteries, rice…" autocomplete="off"><input type="text" class="sl-q" maxlength="20" placeholder="How much"><button type="submit" class="solid">+ ADD</button></form>
      <div class="sl-list"></div><small class="sl-sync"></small></div>`;
    body.querySelector(".sl-add").addEventListener("submit", async (e) => {
      e.preventDefault();
      const t = body.querySelector(".sl-t"), q = body.querySelector(".sl-q");
      if (!t.value.trim()) return;
      await editItem({ t: t.value.trim(), q: q.value.trim() });
      t.value = ""; q.value = ""; t.focus(); Sound.send();
    });
    listSig = "";
    await loadList(true);
  }
  async function editItem(item) {
    try { const d = await api("/api/camp/list", item); listItems = d.items; paintList2(); } catch (e) { toast(e.message); }
  }
  async function loadList(force) {
    try { listItems = (await api("/api/camp/list")).items || []; } catch { return; }
    const sig = JSON.stringify(listItems);
    if (!force && sig === listSig) return;
    listSig = sig;
    paintList2();
  }
  function paintList2() {
    const box = el?.querySelector(".sl-list");
    if (!box) return;
    listSig = JSON.stringify(listItems);
    const open = listItems.filter((i) => !i.done), done = listItems.filter((i) => i.done);
    const row = (i) => `<div class="sl-item ${i.done ? "done" : ""}" data-id="${esc(i.id)}"><button type="button" class="sl-tick" title="${i.done ? "Not done|Back on the list" : "Got it|Tick it off for everyone"}">${i.done ? "☑" : "☐"}</button>
      <span class="sl-name">${esc(i.t)}</span><span class="sl-qty">${esc(i.q || "")}</span><small>${esc(i.by || "")}</small><button type="button" class="sl-del" title="Remove|From the list, for everyone">✕</button></div>`;
    box.innerHTML = listItems.length ? `${open.map(row).join("")}${done.length ? `<div class="sl-sep">GOT IT · ${done.length}</div>${done.map(row).join("")}` : ""}`
      : `<p class="sl-empty">Nothing on the list yet. Add what the camp needs.</p>`;
    box.querySelectorAll(".sl-item").forEach((r) => {
      const it = listItems.find((i) => i.id === r.dataset.id);
      r.querySelector(".sl-tick").addEventListener("click", () => { Sound.click(); editItem({ id: it.id, done: !it.done }); });
      r.querySelector(".sl-del").addEventListener("click", () => { Sound.click(); editItem({ id: it.id, gone: true }); });
    });
    const linked = (camp?.linked || []).length;
    const sync = el.querySelector(".sl-sync");
    if (sync) sync.textContent = linked ? `◉ Syncing live with ${linked} linked Umbra${linked > 1 ? "s" : ""}.` : "◌ Not linked right now: changes sync the next time you meet on the Camp Network.";
  }

  // -------------------------------------------------------- FRIENDS
  function friendsView(body) {
    if (!friends.length) {
      body.innerHTML = `<div class="fr-empty"><canvas class="fr-empty-art"></canvas><div class="fr-empty-text">
        <small>NO FRIENDS YET</small><h2>Share your card. Add theirs.</h2>
        <p>A <b>profile card</b> shows who you are in Umbra: your character, title, name effect, orb, rank, achievements and Outpost. You choose what's on it in <b>Profile › Card</b>.</p>
        <ol><li><b>Swap cards</b>: show your card's QR code, or send the card file or code. Your friend adds it here; works anywhere, even offline.</li>
          <li><b>Or meet on the Camp Network</b>: on the same Wi-Fi or hotspot, link your Umbras directly to see each other's cards live and chat, encrypted, with no internet.</li></ol>
        <div class="fr-row"><button type="button" class="solid" data-go="add">+ ADD A FRIEND</button><button type="button" class="ghost" data-go="camp">◉ CAMP NETWORK</button><button type="button" class="ghost" data-go="mycard">◆ MY CARD</button></div></div></div>`;
      const art = body.querySelector(".fr-empty-art");
      if (!calm() && window.Ascii3D && window.UmbraScenery) { const vw = Ascii3D.view(art, UmbraScenery.scenes.stars.build(), { cell: 8 }); stops.push(() => vw.stop()); }
      wireGo(body);
      return;
    }
    if (!selected || !friends.find((f) => f.id === selected)) selected = friends[0].id;
    body.innerHTML = `<aside class="fr-list"></aside><div class="fr-stage"><div class="fr-cardhold"></div>
      <div class="fr-card-actions"><button type="button" class="ghost fr-flip">⟲ FLIP</button></div></div><div class="fr-side"></div>`;
    paintList(body);
    paintFriend(body);
  }
  function paintList(body) {
    const list = body.querySelector(".fr-list");
    if (!list) return;
    list.innerHTML = `<div class="fr-list-head">${friends.length} FRIEND${friends.length > 1 ? "S" : ""}<button type="button" class="ghost fr-add" data-go="add" title="Add a friend">+</button></div>` +
      friends.map((f) => {
        const c = f.card, face = c.ch ? window.UmbraProfile?.art(c.ch)?.[0]?.slice(1, 3).join("\n") : " ? ? \n  -  ";
        return `<button type="button" class="fr-item ${f.id === selected ? "on" : ""}" data-id="${esc(f.id)}">
          <pre class="fr-mini" ${c.c ? `style="color:var(--${esc(c.c)})"` : ""}>${esc(face)}</pre>
          <span class="fr-who"><b class="fx-${esc(c.fx || "plain")}">${esc(c.n)}</b><small>${f.online ? '<i class="fr-on"></i>LINKED · CAMP' : f.camp ? "CAMP FRIEND · AWAY" : "FROM A CARD"}${c.op?.tl != null ? ` · LV ${c.op.tl}` : ""}</small>
            ${c.ci ? `<small class="fr-ci ${esc(c.ci.st)} ${UmbraCard.overdue(c.ci) ? "late" : ""}">${UmbraCard.overdue(c.ci) ? "⚠ CHECK-IN OVERDUE" : `${esc(UmbraCard.CHECKIN[c.ci.st]?.[0] || "✓")} ${esc(UmbraCard.CHECKIN[c.ci.st]?.[1] || "OK")} · ${esc(UmbraCard.agoText(c.ci.at).toUpperCase())}`}</small>` : ""}</span>
          ${f.unread ? `<em class="fr-unread">${f.unread}</em>` : ""}</button>`;
      }).join("");
    list.querySelectorAll(".fr-item").forEach((b) => b.addEventListener("click", () => { Sound.click(); selected = b.dataset.id; paintList(body); paintFriend(body); }));
    wireGo(list);
  }
  function paintFriend(body) {
    const f = friends.find((x) => x.id === selected);
    if (!f) return;
    cardView?.stop();
    const hold = body.querySelector(".fr-cardhold");
    hold.innerHTML = "";
    refresh.shownU = f.card.u;
    cardView = window.UmbraCard.render(hold, f.card, { verified: f.verified, open: true, onMap: () => { toggle(false, true); window.showFriendOnMap?.(f.id); } });
    body.querySelector(".fr-flip").onclick = () => { Sound.click(); cardView?.flip(); };
    const side = body.querySelector(".fr-side");
    const when = (t) => t ? new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
    side.innerHTML = `<div class="fr-status ${f.online ? "on" : ""}">${f.online
        ? `<b>◉ LINKED ON THE CAMP NETWORK</b><small>Encrypted, directly between your Umbras. Their card updates live.</small>`
        : f.camp ? `<b>◌ CAMP FRIEND · NOT NEARBY</b><small>You'll link again by yourselves the next time you're both on the Camp Network.</small>`
        : `<b>▣ FROM A PROFILE CARD</b><small>Added ${esc(when(f.added))}. Their card was made ${esc(when(f.card.u))}; add a newer one to update it.</small>`}
      ${f.verified ? `<small class="fr-sig">✓ Signed by their Umbra (${esc((f.id || "").slice(0, 8).toUpperCase())}…): it really comes from them.</small>` : `<small class="fr-sig warn">◇ Not signed: this card may have been changed.</small>`}</div>
      <div class="fr-chat">${f.online || f.camp ? `<div class="fr-msgs" aria-live="polite"></div>
        <form class="fr-say"><button type="button" class="ghost fr-pin" title="Send a waypoint|Pick one of your waypoints: it arrives as a marker they can open on their map." ${f.online ? "" : "disabled"}>◈</button><input type="text" maxlength="2000" placeholder="${f.online ? `Message ${esc(f.card.n)}…` : "Messages need you both on the Camp Network"}" ${f.online ? "" : "disabled"}><button type="submit" class="solid" ${f.online ? "" : "disabled"}>SEND ⏎</button></form>
        <small class="fr-chat-note">Messages go straight to their Umbra, encrypted. Nothing passes through the internet.</small>`
        : `<div class="fr-chat-off"><pre>${esc("  ((·))\n   /|\\\n  / | \\")}</pre><p>To chat, meet on the <b>Camp Network</b>: the same Wi-Fi or hotspot, both Umbras linked once.</p><button type="button" class="ghost" data-go="camp">◉ OPEN THE CAMP NETWORK</button></div>`}</div>
      <div class="fr-side-foot"><button type="button" class="ghost warn fr-remove">REMOVE ${esc(f.card.n.toUpperCase())}</button></div>`;
    wireGo(side);
    side.querySelector(".fr-remove").addEventListener("click", async () => {
      const ok = await confirmDialog({ kind: "to-local", tag: "FRIENDS", title: `REMOVE ${f.card.n.toUpperCase()}?`,
        body: "Their card and your messages with them are deleted from this computer. If you're linked on the Camp Network, the link ends.", ok: "REMOVE", cancel: "KEEP" });
      if (!ok) return;
      await api("/api/friends/remove", { id: f.id }).catch(() => {});
      selected = null; await refresh(); show("friends");
    });
    const form = side.querySelector(".fr-say");
    if (form) {
      chatFor = f.id; chatSig = "";
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const input = form.querySelector("input"), text = input.value.trim();
        if (!text) return;
        input.value = "";
        try { await api("/api/friends/chat", { id: f.id, text }); Sound.send(); } catch (err) { toast(err.message); input.value = text; }
        loadChat(true);
      });
      form.querySelector(".fr-pin").addEventListener("click", () => { Sound.click(); pickWaypoint(form, f); });
      loadChat(true);
    } else chatFor = "";
  }
  // Choose one of your waypoints to send in the chat.
  async function pickWaypoint(form, f) {
    let menu = form.querySelector(".fr-pin-menu");
    if (menu) { menu.remove(); return; }
    let wps = [];
    try { wps = await (await fetch("/api/waypoints")).json(); } catch {}
    menu = document.createElement("div");
    menu.className = "fr-pin-menu";
    menu.innerHTML = wps.length ? `<small>SEND A WAYPOINT</small>${wps.slice(0, 40).map((w) => `<button type="button" data-id="${esc(w.id)}">◈ ${esc(w.name)}</button>`).join("")}`
      : `<small>No waypoints yet: right-click the Maps to make one.</small>`;
    form.appendChild(menu);
    menu.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", async () => {
      const w = wps.find((x) => x.id === b.dataset.id);
      menu.remove();
      try { await api("/api/friends/chat", { id: f.id, text: "", wp: [w.lat, w.lon, w.name, w.icon, w.color || ""] }); Sound.send(); } catch (err) { toast(err.message); }
      loadChat(true);
    }));
  }
  async function loadChat(force) {
    const box = el?.querySelector(".fr-msgs");
    if (!box || !chatFor) return;
    const d = await api("/api/friends/chat?id=" + encodeURIComponent(chatFor)).catch(() => null);
    if (!d) return;
    const sig = d.messages.map((m) => m.id).join(",");
    if (!force && sig === chatSig) return;
    const grow = sig !== chatSig && chatSig !== "";
    chatSig = sig;
    const me = window.UmbraProfile?.data?.name || "YOU";
    box.innerHTML = d.messages.length ? d.messages.map((m) => `<div class="fr-msg ${m.me ? "me" : ""}"><small>${esc(m.me ? me : friends.find((x) => x.id === chatFor)?.card.n || "")} · ${esc(new Date(m.at).toTimeString().slice(0, 5))}</small>${m.text ? `<p>${esc(m.text)}</p>` : ""}${m.wp ? `<button type="button" class="fr-wp" data-lat="${m.wp[0]}" data-lon="${m.wp[1]}" title="Open on the map|${esc(m.wp[2])}"><b>◈ ${esc(m.wp[2])}</b><small>${(+m.wp[0]).toFixed(4)}°, ${(+m.wp[1]).toFixed(4)}° · SHOW ON MAP ▸</small></button>` : ""}</div>`).join("")
      : `<p class="fr-chat-empty">No messages yet. Say hello.</p>`;
    box.scrollTop = box.scrollHeight;
    box.querySelectorAll(".fr-wp").forEach((b) => b.addEventListener("click", () => { Sound.click(); toggle(false, true); window.openMapsAt?.(+b.dataset.lat, +b.dataset.lon, 12); }));
    if (grow && !d.messages[d.messages.length - 1]?.me) Sound.found();
  }

  // -------------------------------------------------------- ADD A FRIEND
  function addView(body) {
    body.innerHTML = `<div class="fr-add-art"><pre class="orb fr-relay"></pre><small>A CARD IS A SIGNED, SEALED LITTLE FILE</small></div>
      <div class="fr-add-main">
        <h2>Add a friend from their profile card</h2>
        <p>Your friend shares their card from <b>Profile › Card</b>: a QR picture, a <b>.umbracard</b> file or a code. Bring any of them in; Umbra checks the card's signature and adds it to your friends.</p>
        <div class="fr-ways">
          <button type="button" class="fr-way" data-way="file"><span class="g">󰈔</span><b>OPEN A CARD</b><small>A .umbracard file, or a picture of the card's QR code</small></button>
          <label class="fr-way fr-way-paste"><span class="g">󰆒</span><b>PASTE A CODE</b><textarea placeholder="UMBRA1.…" spellcheck="false"></textarea><button type="button" class="solid" data-way="paste">ADD ▸</button></label>
          <div class="fr-way fr-drop"><span class="g">󰁅</span><b>DROP IT HERE</b><small>Drag a card file or QR picture anywhere on this screen</small></div>
        </div>
        <div class="fr-add-result" hidden></div>
        <p class="fr-note">◆ Adding a card reads only that card. It doesn't connect to anything, and nothing of yours is sent. Your own card: <a href="#" data-go="mycard">Profile › Card</a>.</p>
      </div>`;
    if (window.umbraOrb) stops.push(window.umbraOrb(body.querySelector(".fr-relay"), 20, 14, "relay"));
    body.querySelector('[data-way="file"]').addEventListener("click", async () => {
      Sound.click();
      try { const r = await api("/api/friends/choose", {}); if (r.code) importCode(r.code); else if (r.image) importImage(r.image); }
      catch (e) { result(false, e.message); }
    });
    body.querySelector('[data-way="paste"]').addEventListener("click", () => { Sound.click(); importCode(body.querySelector("textarea").value); });
    wireGo(body);
  }
  function result(ok, html, card) {
    const box = el.querySelector(".fr-add-result");
    if (!box) { toast(html.replace(/<[^>]+>/g, "")); return; }
    box.hidden = false;
    box.className = "fr-add-result " + (ok ? "ok" : "bad");
    box.innerHTML = `<div class="fr-add-msg">${html}</div>${card ? `<div class="fr-add-card"></div>` : ""}`;
    if (card) { cardView?.stop(); cardView = window.UmbraCard.render(box.querySelector(".fr-add-card"), card.card, { verified: card.verified }); }
    ok ? Sound.complete() : Sound.error();
  }
  async function importCode(text) {
    try {
      const r = await api("/api/friends/import", { code: text });
      await refresh();
      const f = friends.find((x) => x.id === r.id);
      result(true, `<b>${esc(r.name)}</b> ${r.new ? "is now in your friends" : "was updated"}. ${r.verified ? "✓ Signed by their Umbra." : "◇ This card isn't signed, so it may have been changed."}
        <button type="button" class="ghost" data-open="${esc(r.id)}">SEE ${esc(r.name.toUpperCase())} ▸</button>`, f);
      el.querySelector("[data-open]")?.addEventListener("click", (e) => { selected = e.target.dataset.open; Sound.click(); show("friends"); });
    } catch (e) { result(false, esc(e.message)); }
  }
  async function importImage(src) {
    try { importCode(await UmbraQR.read(src)); }
    catch (e) { result(false, `${esc(e.message)} Try the .umbracard file or the code instead.`); }
  }
  function importFile(file) {
    if (view !== "add") show("add");
    if (/^image\//.test(file.type)) { importImage(file); return; }
    if (file.size > 200000) { result(false, "That file is too large to be a card."); return; }
    file.text().then(importCode);
  }

  // -------------------------------------------------------- CAMP NETWORK
  function campViewBuild(body) {
    body.innerHTML = `<div class="cp-scene"><canvas></canvas><div class="cp-labels"></div><div class="cp-caption"></div></div>
      <aside class="cp-side"><div class="cp-switch"></div><div class="cp-pending"></div><div class="cp-peers"></div><div class="cp-explain">
        <h3>HOW THE CAMP NETWORK WORKS</h3>
        <ol><li><b>Same network, no internet.</b> Umbras on the same Wi-Fi, router or phone hotspot find each other. Nothing goes through the internet.</li>
          <li><b>Link once, with a code.</b> The first time, both screens show a six-digit code; check they match, then both confirm.</li>
          <li><b>Encrypted end to end.</b> Each link has its own keys (X25519 and ChaCha20-Poly1305). Only your profile card and the messages you write are sent.</li>
          <li><b>Off when you want.</b> It's off until you turn it on, and turns itself off when Umbra's window closes.</li></ol></div></aside>`;
    const canvas = body.querySelector(".cp-scene canvas");
    if (window.Ascii3D && window.UmbraScenery && !window.offgrid) {
      const v = Ascii3D.view(canvas, campScene(), { cell: 8 });
      campView = v; stops.push(() => v.stop());
      // Names over the beacons: placed again only when the view's size
      // changes (the camera stands still), so they never jump about.
      const ro = new ResizeObserver(() => requestAnimationFrame(placeLabels)); ro.observe(canvas); stops.push(() => ro.disconnect());
      const first = setInterval(() => { if (campView.project(0, 0, 0)) { clearInterval(first); placeLabels(); } }, 120); stops.push(() => clearInterval(first));
    }
    paintCamp();
  }
  // The camp: your Umbra is the campfire, radio rings pulse out while the
  // network is on, and every Umbra nearby is a beacon around it.
  // Open ground around the fire (clear of the tent and the tree line).
  const SPOTS = [[1.7, -1.3], [-2.9, -.7], [2.5, -2.3], [.6, -2.5], [3.2, -1.0], [-3.1, -2.0], [-.5, -2.6], [1.9, -.3]];
  function spot(i) { const [x, z] = SPOTS[i % SPOTS.length]; return [x, .55, z]; }
  function campScene() {
    const base = UmbraScenery.scenes.campfire.build(), { hex, mix } = Ascii3D;
    const net = hex(getComputedStyle(document.documentElement).getPropertyValue("--net").trim() || "#5fb8c9");
    const sig = hex(getComputedStyle(document.documentElement).getPropertyValue("--signal").trim() || "#e8d27c");
    return { ...base, fps: 18, particles(t, put) {
      base.particles?.(t, put);
      if (!camp?.enabled) return;
      for (let k = 0; k < 3; k++) {   // radio rings from the fire
        const r = ((t * .35 + k / 3) % 1) * 4.2;
        for (let a = 0; a < 72; a++) { const ang = a / 72 * Math.PI * 2; put(Math.cos(ang) * r, .14, -.4 + Math.sin(ang) * r, "o", net, 1 - r / 4.2, 1.3); }
      }
      (camp.peers || []).forEach((p, i) => {
        const [x, y, z] = spot(i), on = (camp.linked || []).includes(p.id), pend = p.pending || linking[p.id];
        const pulse = .6 + .4 * Math.sin(t * 4 + i);
        const c = on ? sig : net;
        put(x, y + .35 + .1 * Math.sin(t * 2 + i), z, on ? "◆" : "◇", c, 1, 2.4);
        for (let s = 0; s < 7; s++) put(x, y + .2 - s * .14, z, "|", c, .55 + .45 * pulse);   // the beacon's mast
        for (let a = 0; a < 16; a++) { const ang = a / 16 * Math.PI * 2, rr = .25 + .15 * pulse; put(x + Math.cos(ang) * rr, .12, z + Math.sin(ang) * rr, "·", c, .8); }
        if (on || pend) for (let s = 0; s < 14; s++) {   // the link: a beam between the fire and their beacon
          const k = ((s / 14) + t * (pend ? .9 : .3)) % 1;
          put(x * k, .5 + (y - .5) * k + Math.sin(k * Math.PI) * .5, -.4 + (z + .4) * k, on ? "•" : "·", on ? sig : mix(net, [255, 255, 255], .3), on ? .9 : .7);
        }
      });
    } };
  }
  function placeLabels() {
    const box = el?.querySelector(".cp-labels");
    if (!box || !campView) return;
    const peers = camp?.enabled ? camp.peers || [] : [];
    setHTML(box, peers.map((p, i) => {
      const pos = campView.project(...spot(i));
      if (!pos) return "";
      const on = (camp.linked || []).includes(p.id);
      return `<span class="cp-label ${on ? "on" : ""}" style="left:${Math.round(pos[0])}px;top:${Math.round(pos[1] - 34)}px">${esc(p.name)}<small>${on ? "LINKED" : p.pending ? "LINKING" : "NEARBY"}</small></span>`;
    }).join("") + (camp?.enabled ? (() => { const me = campView.project(0, .9, -.4); return me ? `<span class="cp-label me" style="left:${Math.round(me[0])}px;top:${Math.round(me[1] - 40)}px">YOU<small>${esc(camp.address || "")}</small></span>` : ""; })() : ""));
  }
  // Replaces a piece of the page only when it really changed, so nothing
  // flickers, loses its hover or restarts its animation. Returns true when it did.
  function setHTML(node, html) {
    if (!node || node.dataset.html === html) return false;
    node.innerHTML = html; node.dataset.html = html;
    return true;
  }
  function paintCamp() {
    const side = el?.querySelector(".cp-side");
    if (!side || !camp) return;
    const sw = side.querySelector(".cp-switch");
    const fw = camp.firewall && !camp.opened;
    const swChanged = setHTML(sw, !camp.available ? `<div class="cp-off"><b>UNAVAILABLE</b><p>The Camp Network needs Python's cryptography package, which isn't installed.</p></div>` : `
      <div class="cp-state ${camp.enabled ? "on" : ""}"><span class="cp-led"></span><div><b>${camp.enabled ? "CAMP NETWORK ON" : "CAMP NETWORK OFF"}</b>
        <small>${camp.enabled ? `Listening on this network${camp.address ? ` (${esc(camp.address)})` : ""}. Encrypted · no internet.` : "Nothing is listening. Turn it on to find Umbras nearby."}</small></div>
        <button type="button" class="${camp.enabled ? "ghost" : "solid"} cp-toggle">${camp.enabled ? "TURN OFF" : "TURN ON ▸"}</button></div>
      ${camp.enabled && fw ? `<div class="cp-fw"><b>◇ THE FIREWALL MAY BE IN THE WAY</b><p>This computer's firewall (ufw) blocks other Umbras from reaching yours. Allow the Camp Network's two ports, only from your local network (${esc(camp.network)})? Your password is asked.</p>
        <button type="button" class="ghost cp-fw-open">ALLOW ON THIS NETWORK</button></div>` : ""}
      ${camp.enabled && camp.firewall && camp.opened ? `<small class="cp-fw-ok">✓ The firewall lets the Camp Network in from ${esc(camp.network)}. <a href="#" class="cp-fw-close">Close it again</a></small>` : ""}`);
    if (swChanged) wireSwitch(sw);
    paintCampLists(side);
  }
  function wireSwitch(sw) {
    sw.querySelector(".cp-toggle")?.addEventListener("click", async () => {
      Sound.click();
      try { camp = { ...camp, ...(await api("/api/camp", { on: !camp.enabled })) }; camp.enabled ? Sound.online() : Sound.local(); } catch (e) { toast(e.message); }
      paintCamp(); refresh();
    });
    sw.querySelector(".cp-fw-open")?.addEventListener("click", () => firewall("open"));
    sw.querySelector(".cp-fw-close")?.addEventListener("click", (e) => { e.preventDefault(); firewall("close"); });
  }
  function paintCampLists(side) {
    // Link requests: the code to compare.
    const pendingBox = side.querySelector(".cp-pending");
    if (setHTML(pendingBox, (camp.pending || []).map((p) => `
      <div class="cp-req" data-id="${esc(p.id)}"><small>${p.incoming ? "◉ " + esc(p.name.toUpperCase()) + " WANTS TO LINK" : "◉ LINKING WITH " + esc(p.name.toUpperCase())}</small>
        <pre class="cp-console">${esc(consoleLines(p))}</pre>
        <div class="cp-code">${esc(p.code.slice(0, 3))} ${esc(p.code.slice(3))}</div>
        <p>${p.mine ? `Waiting for ${esc(p.name)} to confirm the same code…` : `Check that <b>${esc(p.name)}</b>'s screen shows the same code, then confirm.`}</p>
        ${p.mine ? "" : `<div class="fr-row"><button type="button" class="solid cp-yes">CODES MATCH ✓</button><button type="button" class="ghost cp-no">DON'T LINK</button></div>`}</div>`).join(""))) pendingBox.querySelectorAll(".cp-req").forEach((r) => {
      r.querySelector(".cp-yes")?.addEventListener("click", async () => { Sound.click(); await api("/api/camp/confirm", { id: r.dataset.id, ok: true }).catch((e) => toast(e.message)); refresh(); });
      r.querySelector(".cp-no")?.addEventListener("click", async () => { Sound.click(); await api("/api/camp/confirm", { id: r.dataset.id, ok: false }).catch(() => {}); refresh(); });
    });
    const peers = camp.enabled ? camp.peers || [] : [];
    const peersBox = side.querySelector(".cp-peers");
    const peersChanged = setHTML(peersBox, camp.enabled ? `<h3>NEARBY UMBRAS <small>${peers.length || "SEARCHING…"}</small></h3>` + (peers.length ? peers.map((p) => `
      <div class="cp-peer ${p.linked ? "on" : ""}"><span class="cp-dot"></span><div><b>${esc(p.name)}</b><small>${esc(p.ip)} · ${p.linked ? "LINKED, ENCRYPTED" : p.trusted ? "A FRIEND · LINKING BY ITSELF" : p.pending ? "WAITING FOR THE CODE" : "NOT LINKED"}</small></div>
        ${p.linked ? `<button type="button" class="ghost" data-see="${esc(p.id)}">CARD ▸</button>` : p.pending || p.trusted ? "" : `<button type="button" class="solid" data-link="${esc(p.id)}">LINK ▸</button>`}</div>`).join("")
      : `<p class="cp-searching"><span class="spin" data-spin>✻</span> Listening for other Umbras on this network. They need the Camp Network on too.</p>`) : "");
    if (peersChanged) wirePeers(peersBox);
    setHTML(el.querySelector(".cp-caption"), camp.enabled
      ? `<b>◉ THE CAMP IS ON THE AIR</b><span>You're the fire. ${peers.length ? `${peers.length} Umbra${peers.length > 1 ? "s" : ""} nearby.` : "Other Umbras appear as beacons around it."}</span>`
      : `<b>◌ THE CAMP IS QUIET</b><span>Turn the Camp Network on to light the beacon.</span>`);
    placeLabels();
  }
  function wirePeers(side) {
    side.querySelectorAll("[data-link]").forEach((b) => b.addEventListener("click", async () => {
      Sound.click(); linking[b.dataset.link] = Date.now();
      b.disabled = true; b.textContent = "CALLING…";
      await api("/api/camp/link", { id: b.dataset.link }).catch((e) => toast(e.message));
      setTimeout(refresh, 800);
    }));
    side.querySelectorAll("[data-see]").forEach((b) => b.addEventListener("click", () => { Sound.click(); selected = b.dataset.see; show("friends"); }));
  }
  function consoleLines(p) {
    return ["> CONNECTING DIRECTLY · NO INTERNET … OK", "> KEY EXCHANGE · X25519 … OK", "> CHANNEL · CHACHA20-POLY1305 … OK",
      `> VERIFY THE CODE ON BOTH SCREENS${p.mine ? " · CONFIRMED HERE" : ""}`].join("\n");
  }
  async function firewall(action) {
    Sound.click();
    toast(action === "open" ? "Asking for your password to allow the Camp Network…" : "Asking for your password…");
    try { camp = { ...camp, ...(await api("/api/camp/firewall", { action })) }; toast(action === "open" ? "The Camp Network is allowed on this network." : "The firewall is closed to the Camp again."); }
    catch (e) { toast(e.message); }
    paintCamp();
  }

  // ------------------------------------------------------------ data
  async function refresh() {
    try {
      const d = await api("/api/friends");
      // Each view repaints only for what it shows: a friend's card being
      // updated doesn't touch the Camp, and the Camp's search doesn't touch the cards.
      const campSig = JSON.stringify([d.camp.enabled, d.camp.available, d.camp.peers, d.camp.pending, d.camp.linked, d.camp.firewall, d.camp.opened, d.camp.address]);
      const sig = view === "camp" ? campSig : JSON.stringify(d.friends.map((f) => [f.id, f.updated, f.online, f.unread, f.camp])) + campSig;
      friends = d.friends; camp = d.camp;
      events(d.camp.events);
      badge();
      if (el && !el.hidden && sig !== refresh.sig) {
        refresh.sig = sig;
        if (view === "camp") paintCamp();
        else if (view === "friends") { const body = el.querySelector(".fr-body"); if (!friends.length || !body.querySelector(".fr-list")) show("friends"); else {
          paintList(body);
          // The open friend's card is redrawn only when the card itself changed (a new check-in, new waypoints…).
          const cur = friends.find((x) => x.id === selected)?.card;
          if (!body.querySelector(`.fr-item.on`) || (cur && cur.u !== refresh.shownU)) { refresh.shownU = cur?.u; paintFriend(body); } else updateSide(body); } }
      }
      if (el && !el.hidden && view === "friends") loadChat(false);
      if (el && !el.hidden && view === "list") loadList(false);
      if (!refresh.ciAt || Date.now() - refresh.ciAt > 60000) { refresh.ciAt = Date.now(); api("/api/card").then((c) => { myCheckin = c.checkin || null; paintCheckinDot(); }).catch(() => {}); }
    } catch {}
  }
  // The status and chat box of the open friend follow the network without redrawing their card.
  function updateSide(body) {
    const f = friends.find((x) => x.id === selected);
    const side = body.querySelector(".fr-side");
    if (!f || !side) return;
    const wasOnline = side.querySelector(".fr-status")?.classList.contains("on");
    if (wasOnline !== f.online) paintFriend(body);
  }
  function events(list) {
    for (const e of list || []) {
      if (e.t === "msg" && !(el && !el.hidden && view === "friends" && chatFor === e.id)) toast(`◉ ${e.name}: ${e.text}`, () => { selected = e.id; open("friends"); });
      else if (e.t === "request") { toast(`◉ ${e.name} wants to link on the Camp Network.`, () => open("camp")); Sound.glitch(); }
      else if (e.t === "friend") { toast(`✦ ${e.name} is now your friend.`); Sound.achieve(); }
      else if (e.t === "peer" && el && !el.hidden && view === "camp") Sound.found();
      else if (e.t === "declined") toast(`${e.name} didn't link.`);
      else if (e.t === "error") toast(e.message);
      else if (e.t === "checkin") { const c = UmbraCard.CHECKIN[e.st] || UmbraCard.CHECKIN.ok; toast(`${c[0]} ${e.name} checked in: ${c[1]}${e.note ? ` · “${e.note}”` : ""}`, () => { selected = e.id; open("friends"); }); if (e.st === "help") Sound.glitch(); }
      else if (e.t === "list") { if (el && !el.hidden && view === "list") loadList(true); else toast(`☑ ${e.name} updated the shared supply list.`, () => open("list")); }
    }
  }
  function badge() {
    const btn = $("#friends-btn");
    if (!btn) return;
    const unread = friends.reduce((n, f) => n + (f.unread || 0), 0) + (camp?.pending || []).filter((p) => p.incoming && !p.mine).length;
    let b = btn.querySelector(".fr-badge");
    if (unread && !b) { b = document.createElement("i"); b.className = "fr-badge"; btn.appendChild(b); }
    if (b) { if (unread) b.textContent = unread > 9 ? "9+" : unread; else b.remove(); }
    btn.classList.toggle("camp-on", !!camp?.enabled);
    el?.querySelector(".fr-camp-dot")?.classList.toggle("on", !!camp?.enabled);
  }
  // While the Camp is on, keep an ear open even with the panel closed.
  function background() {
    clearTimeout(bg);
    bg = setTimeout(async () => { if (camp?.enabled && (!el || el.hidden)) await refresh(); background(); }, 5000);
  }

  // ------------------------------------------------------------ toasts
  function toast(text, onClick) {
    const t = document.createElement("div");
    t.className = "umbra-toast" + (onClick ? " link" : "");
    t.textContent = text;
    if (onClick) t.addEventListener("click", () => { t.remove(); onClick(); });
    document.body.appendChild(t);
    setTimeout(() => t.classList.add("out"), 4200);
    setTimeout(() => t.remove(), 4800);
  }
  window.umbraToast = toast;

  function wireGo(root) {
    root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", (e) => {
      e.preventDefault(); Sound.click();
      if (b.dataset.go === "mycard") { toggle(false, true); window.openLoadout?.("card"); } else show(b.dataset.go);
    }));
  }

  // ------------------------------------------------------- open / close
  function toggle(on = !el || el.hidden, quiet = false) {
    build();
    if (on && locked) return;
    if (!on) {
      if (el.hidden) return;
      el.hidden = true; cleanup(); clearInterval(poll); chatFor = "";
      document.body.classList.remove("friends-open"); $("#friends-btn")?.classList.remove("on");
      if (!quiet) { Sound.click(); if (typeof goBack === "function") goBack(); }
      if (window.startRain) startRain();
      background();
      return;
    }
    window.closeSettings?.(); window.closeLoadout?.(true); window.closeHistory?.(); window.closeFieldKit?.(); window.closeMaps?.(); window.closeGalaxy?.();
    window.toggleRadar?.(false, true); window.toggleFarming?.(false, true); window.closeOutpost?.();
    toggleThemes(false, true);
    $("#library").hidden = true; $("#library-btn")?.classList.remove("on");
    el.hidden = false; document.body.classList.add("friends-open"); $("#friends-btn")?.classList.add("on");
    if (window.stopRain) stopRain();
    refresh.sig = "";
    refresh().then(() => show(view));
    clearInterval(poll); poll = setInterval(refresh, 2000);
    Sound.searchstart();
  }
  function open(v) { if (v) view = v; if (!el || el.hidden) toggle(true); else show(view); }

  build();
  $("#friends-btn")?.addEventListener("click", () => toggle());
  document.addEventListener("keydown", (e) => {
    if (!el || el.hidden || !$("#modal").hidden) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); if (el.querySelector(".ucard.flipped")) cardView?.flip(false); else toggle(false); }
  }, true);
  // Another full screen opening closes this one (and locking the window does).
  new MutationObserver(() => {
    if (el.hidden) return;
    const other = ["#outpost", "#maps", "#galaxy", "#fieldkit", "#farming", "#radar", "#loadout"].some((s) => { const x = $(s); return x && !x.hidden; });
    if (other || document.body.classList.contains("locked")) toggle(false, true);
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["hidden", "class"] });
  refresh().then(background);
  window.toggleFriends = toggle;
  window.closeFriends = () => toggle(false, true);
  return { open, toggle, refresh };
})();
