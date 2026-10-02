// Umbra Online: the web on the left, Umbra on the right, one program.
// The browser itself is native (the launcher's WebPane lays WebKit views over
// the space this page keeps free in #web .web-view); everything around it is
// drawn here in Umbra's style: tabs, the address bar, a start page, Umbra View
// (the page re-set in Umbra's theme), the seam, and the companion in the
// conversation: it reads along, offers things to do with the page and, when
// chatty, comments and shares fun facts. Remarks always give way to the
// user's own questions. Loaded after app.js (uses $, Sound, escapeHtml, ask,
// controller, online, feed, follow, pinBottom, prefs, postSettings).
"use strict";

window.UmbraWeb = (() => {
  const host = !!window.UMBRA_WEB && !!window.webkit?.messageHandlers?.umbra;
  const send = (o) => { try { window.webkit.messageHandlers.umbra.postMessage("web:" + JSON.stringify(o)); } catch {} };
  const esc = (s) => escapeHtml(String(s ?? ""));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const calm = () => document.body.classList.contains("reduce-motion") || window.offgrid;
  const ENGINE = "https://duckduckgo.com/?q=";
  let open = false, tabs = [], active = null, pages = {}, covered = false, umbraView = false, attachPage = true;
  let lastShot = "", pendingShot = null, selection = "", browsers = { default: "", browsers: [] }, errors = {};
  let el = null, seam = null, tools = null;

  // ------------------------------------------------------------ the frame
  function build() {
    if (el) return;
    el = document.createElement("section");
    el.id = "web"; el.className = "web"; el.hidden = true;
    el.setAttribute("aria-label", "Umbra Online browser");
    el.innerHTML = `
      <div class="web-tabs" role="tablist"><div class="web-tablist"></div><button type="button" class="web-new" title="New tab|Ctrl + T">+ NEW</button>
        <span class="web-fill"></span><button type="button" class="web-fold" title="Hide the browser|The conversation takes the whole window. LINK or the ◧ BROWSER button brings it back.">◧</button></div>
      <div class="web-bar">
        <button type="button" class="web-nb web-back" title="Back|Alt + Left">‹</button><button type="button" class="web-nb web-fwd" title="Forward|Alt + Right">›</button>
        <button type="button" class="web-nb web-reload" title="Reload|F5">↻</button>
        <form class="web-addr" autocomplete="off"><span class="web-lock" aria-hidden="true">◇</span>
          <input type="text" spellcheck="false" placeholder="Search the web or type an address" aria-label="Address">
          <em class="web-reading" hidden>◇ UMBRA IS READING</em></form>
        <button type="button" class="web-nb web-uview" title="Umbra View|The page's text and pictures in Umbra's colours. Click again for the original.">◧ UMBRA VIEW</button>
        <button type="button" class="web-nb web-save" title="Save offline|Text and pictures, into your Library">▣</button>
        <button type="button" class="web-ext" title="Open in your browser|For sites where you're signed in. Choose the browser in Settings."><span class="g">󰏌</span><span class="web-ext-name">OPEN IN BROWSER</span></button>
      </div>
      <div class="web-load"><i></i></div>
      <div class="web-view"><div class="web-hole"></div><img class="web-cover" alt="" hidden>
        <div class="web-start" hidden></div><div class="web-reader" hidden></div><div class="web-error" hidden></div></div>
      <div class="web-status"><span class="web-st-left"></span><span class="web-st-right"></span></div>`;
    document.body.appendChild(el);
    seam = document.createElement("div");
    seam.className = "web-seam"; seam.hidden = true; seam.innerHTML = "<i></i>";
    document.body.appendChild(seam);

    // The companion's tools, above the prompt.
    tools = document.createElement("div");
    tools.className = "web-tools"; tools.hidden = true;
    tools.innerHTML = `
      <button type="button" data-tool="summary" title="Summarise|The main points of this page"><span class="g">≡</span>SUMMARISE</button>
      <button type="button" data-tool="save" title="Save page|Text and pictures, readable offline in your Library"><span class="g">▣</span>SAVE PAGE</button>
      <button type="button" data-tool="docs" title="Save page and documents|Also the PDFs and files it links to"><span class="g">⇣</span>SAVE + DOCS</button>
      <button type="button" data-tool="screen" title="What's on screen?|Umbra looks at the part of the page you see"><span class="g">◎</span>ON SCREEN?</button>
      <button type="button" class="web-chip" data-tool="attach" title="Page goes with your questions|Click to ask without the page"><span class="g">◇</span><span class="web-chip-t">PAGE ATTACHED</span></button>
      <span class="web-chatty" title="Comments|How often Umbra comments on what you browse (also in Settings)"><span class="web-chatty-k">COMMENTS</span>
        ${["off", "gentle", "chatty"].map((m) => `<button type="button" data-chat="${m}">${m.toUpperCase()}</button>`).join("")}</span>`;
    const dock = document.querySelector(".dock");
    dock.insertBefore(tools, dock.querySelector("#promptbar"));

    const $w = (s) => el.querySelector(s);
    $w(".web-new").addEventListener("click", () => { Sound.click(); newTab(); });
    $w(".web-fold").addEventListener("click", () => { Sound.click(); fold(true); });
    $w(".web-back").addEventListener("click", () => { Sound.click(); send({ c: "back" }); });
    $w(".web-fwd").addEventListener("click", () => { Sound.click(); send({ c: "forward" }); });
    $w(".web-reload").addEventListener("click", () => { Sound.click(); const t = tab(); send({ c: t && t.loading ? "stop" : "reload" }); });
    $w(".web-uview").addEventListener("click", () => { Sound.click(); setUmbraView(!umbraView); });
    $w(".web-save").addEventListener("click", () => savePage(false));
    $w(".web-ext").addEventListener("click", () => external());
    const addr = $w(".web-addr input");
    $w(".web-addr").addEventListener("submit", (e) => { e.preventDefault(); go(addr.value); addr.blur(); });
    addr.addEventListener("focus", () => addr.select());
    addr.addEventListener("keydown", (e) => { if (e.key === "Escape") { addr.value = tab()?.url || ""; addr.blur(); send({ c: "focus" }); } });
    $w(".web-tablist").addEventListener("click", (e) => {
      const x = e.target.closest(".web-x"), t = e.target.closest(".web-tab");
      if (!t) return;
      Sound.click();
      if (x) send({ c: "close", id: +t.dataset.id });
      else send({ c: "select", id: +t.dataset.id });
    });
    $w(".web-tablist").addEventListener("auxclick", (e) => { const t = e.target.closest(".web-tab"); if (t && e.button === 1) send({ c: "close", id: +t.dataset.id }); });
    $w(".web-reader").addEventListener("click", (e) => {
      const a = e.target.closest("a[data-href]");
      if (a) { e.preventDefault(); Sound.click(); setUmbraView(false); go(a.dataset.href); }
    });
    tools.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.chat) { setChat(b.dataset.chat); Sound.click(); return; }
      Sound.click();
      const run = { summary, save: () => savePage(false), docs: () => savePage(true), screen: lookAtScreen, attach: () => { attachPage = !attachPage; paintTools(); } };
      run[b.dataset.tool]?.();
    });
    new ResizeObserver(() => place()).observe(el.querySelector(".web-view"));
    window.addEventListener("resize", () => { layout(); place(); });
    // Drag the seam to give the web or the conversation more room.
    seam.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      seam.setPointerCapture(e.pointerId);
      seam.classList.add("drag");
      const narrow = document.body.classList.contains("web-narrow");
      const move = (ev) => {
        if (narrow) split.h = Math.min(0.8, Math.max(0.25, (ev.clientY - topPx) / (innerHeight - topPx)));
        else split.w = Math.min(0.78, Math.max(0.3, ev.clientX / innerWidth));
        layout();
      };
      const up = () => { seam.classList.remove("drag"); seam.removeEventListener("pointermove", move); seam.removeEventListener("pointerup", up);
        try { localStorage.setItem("umbra-web-split", JSON.stringify(split)); } catch {} place(); };
      seam.addEventListener("pointermove", move);
      seam.addEventListener("pointerup", up);
    });
    // A Umbra panel or dialog over the browser: the browser steps aside behind a picture.
    // (At most a few checks a second: animations change the page all the time.)
    let coverTimer = 0;
    const soon = () => { if (open && !coverTimer) coverTimer = setTimeout(() => { coverTimer = 0; checkCover(); }, 150); };
    new MutationObserver(soon).observe(document.body, { childList: true, attributes: true, attributeFilter: ["hidden", "class", "open"] });
    new MutationObserver(soon).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "open"] });
    setInterval(soon, 500);
  }

  // Below the header and banners; side by side, or stacked in a narrow window.
  let split = { w: 0.58, h: 0.56 }, topPx = 96;
  try { split = { ...split, ...JSON.parse(localStorage.getItem("umbra-web-split") || "{}") }; } catch {}
  function layout() {
    if (!el) return;
    const bars = ["header.top", ".hazard", "#signal-tape", "#netbanner"].map((s) => document.querySelector(s)).filter((x) => x && !x.hidden && x.offsetParent !== null);
    topPx = Math.round(Math.max(0, ...bars.map((x) => x.getBoundingClientRect().bottom)));
    const narrow = innerWidth < 1300;
    document.body.classList.toggle("web-narrow", narrow);
    const st = document.body.style;
    st.setProperty("--web-top", topPx + "px");
    st.setProperty("--web-w", Math.round(innerWidth * split.w) + "px");
    st.setProperty("--web-h", Math.round((innerHeight - topPx) * split.h) + "px");
  }
  const BANNER = '<span class="pulse">◉</span> UMBRA ONLINE · PAGES LOAD FROM THE INTERNET · WHAT UMBRA READS STAYS ON THIS COMPUTER';
  let bannerWas = "";

  const tab = () => tabs.find((t) => t.id === active);
  const page = () => pages[active];
  const chatMode = () => (window.prefs?.webChat || "chatty");

  // ------------------------------------------------------- open & close
  async function enter() {
    if (!host) return false;
    build();
    if (open) { fold(false); return true; }
    open = true;
    const banner = $("#netbanner");
    bannerWas = banner.innerHTML; banner.innerHTML = BANNER;
    layout();
    document.body.classList.add("web-open", "web-entering");
    el.hidden = false; seam.hidden = false; tools.hidden = false;
    paintTools();
    loadBrowsers();
    send({ c: "sync" });
    if (!tabs.length) showStart();
    Sound.online();
    await wait(calm() ? 0 : 650);
    document.body.classList.remove("web-entering");
    place();
    if (!tabs.length) setTimeout(() => el.querySelector(".web-start input")?.focus(), 60);
    pinBottom();
    return true;
  }
  async function leave() {
    if (!open) return;
    open = false;
    send({ c: "end" });
    document.body.classList.add("web-leaving");
    await wait(calm() ? 0 : 420);
    document.body.classList.remove("web-open", "web-leaving", "web-folded", "web-narrow");
    if (bannerWas) $("#netbanner").innerHTML = bannerWas;
    paintFoldButton();
    el.hidden = true; seam.hidden = true; tools.hidden = true;
    tabs = []; active = null; pages = {}; errors = {}; setUmbraView(false, true);
    clearTimers();
    paintTabs();
  }
  // Hide the browser for a while without closing its tabs.
  function fold(on) {
    if (!open) return;
    document.body.classList.toggle("web-folded", on);
    el.hidden = on; seam.hidden = on;
    layout(); place();
    paintFoldButton();
  }
  function paintFoldButton() {
    let b = document.querySelector(".web-unfold");
    const want = open && document.body.classList.contains("web-folded");
    if (want && !b) {
      b = document.createElement("button");
      b.type = "button"; b.className = "web-unfold"; b.title = "Show the browser";
      b.innerHTML = "◧ BROWSER";
      b.addEventListener("click", () => { Sound.click(); fold(false); });
      $("#netbanner").appendChild(b);
    } else if (!want && b) b.remove();
  }

  // Where the native browser goes, and whether it shows (sent only when it changes).
  let lastRect = "";
  function place() {
    if (!host || !el) return;
    if (open) layout();
    const view = el.querySelector(".web-view");
    const r = view.getBoundingClientRect();
    const t = tab();
    const show = open && !el.hidden && !covered && !umbraView && !!t && !!t.url && !errors[active] && r.width > 20 && r.height > 20;
    const msg = JSON.stringify({ c: "rect", rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), vw: document.documentElement.clientWidth }, show });
    if (msg !== lastRect) { lastRect = msg; try { window.webkit.messageHandlers.umbra.postMessage("web:" + msg); } catch {} }
    el.querySelector(".web-cover").hidden = show || !covered || !lastShot;
  }
  function checkCover() {
    if (!open || !el || el.hidden) return;
    const view = el.querySelector(".web-view").getBoundingClientRect();
    if (view.width < 20) return;
    let over = false;
    for (const fx of [0.12, 0.5, 0.88]) for (const fy of [0.08, 0.5, 0.92]) {
      const hit = document.elementFromPoint(view.left + view.width * fx, view.top + view.height * fy);
      if (hit && !el.contains(hit)) { over = true; break; }
    }
    if (over === covered) return;
    covered = over;
    if (over) { lastRect = ""; send({ c: "cover" }); } else { lastRect = ""; place(); }
  }

  // ------------------------------------------------------------- tabs
  function newTab(url = "") {
    if (url) send({ c: "open", url: toUrl(url), newTab: true });
    else { showStart(); el.querySelector(".web-start input")?.focus(); active = null; paintTabs(); place(); }
  }
  function toUrl(text) {
    const s = String(text || "").trim();
    if (!s) return "";
    if (/^https?:\/\//i.test(s)) return s;
    if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(s) && !/\s/.test(s)) return "https://" + s;
    return ENGINE + encodeURIComponent(s);
  }
  function go(text) {
    const url = toUrl(text);
    if (!url) return;
    Sound.send();
    hideStart();
    if (active && tab()) send({ c: "open", url });
    else send({ c: "open", url, newTab: true });
    rememberVisit(url);
  }
  function paintTabs() {
    if (!el) return;
    const list = el.querySelector(".web-tablist");
    const html = tabs.map((t) => `<div class="web-tab ${t.id === active ? "on" : ""}" role="tab" data-id="${t.id}" title="${esc(t.title || t.url)}|${esc(t.url)}">
        <span class="web-tab-i">${t.loading ? '<span class="spin" data-spin>✻</span>' : "◆"}</span><span class="web-tab-t">${esc(t.title || shortUrl(t.url) || "New tab")}</span><button type="button" class="web-x" title="Close tab|Ctrl + W">✕</button></div>`).join("");
    if (list._html !== html) { list.innerHTML = html; list._html = html; }
    const t = tab();
    const addr = el.querySelector(".web-addr input");
    if (document.activeElement !== addr) addr.value = t ? t.url : "";
    el.querySelector(".web-addr").classList.toggle("secure", !!t?.secure);
    el.querySelector(".web-lock").textContent = !t ? "⌕" : t.secure ? "🔒︎" : "◇";
    el.querySelector(".web-back").disabled = !t?.back;
    el.querySelector(".web-fwd").disabled = !t?.forward;
    el.querySelector(".web-reload").textContent = t?.loading ? "✕" : "↻";
    el.querySelector(".web-reload").title = t?.loading ? "Stop" : "Reload|F5";
    const bar = el.querySelector(".web-load");
    bar.classList.toggle("on", !!t?.loading);
    bar.querySelector("i").style.width = `${Math.round((t?.progress || 0) * 100)}%`;
    const p = page();
    el.querySelector(".web-reading").hidden = !(t && !t.loading && p);
    el.querySelector(".web-uview").disabled = !(p && p.words > 60);
    el.querySelector(".web-uview").classList.toggle("on", umbraView);
    el.querySelector(".web-st-left").innerHTML = t ? `<b>◉</b> ${esc(shortUrl(t.url))}${t.secure ? " · ENCRYPTED" : t.url.startsWith("http:") ? " · <span class=\"web-warn\">NOT ENCRYPTED</span>" : ""}` : "<b>◉</b> ONLINE · START";
    el.querySelector(".web-st-right").textContent = p ? `READ BY UMBRA · ${p.words.toLocaleString()} WORDS${p.frac ? ` · ${p.frac}% SEEN` : ""}` : "";
  }
  const shortUrl = (u) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 80);

  // ------------------------------------------------------ the start page
  function visits() { try { return JSON.parse(localStorage.getItem("umbra-web-visits") || "[]"); } catch { return []; } }
  function rememberVisit(url, title) {
    if (!/^https?:/.test(url) || url.startsWith(ENGINE)) return;
    const list = visits().filter((v) => v.url !== url);
    list.unshift({ url, title: title || "", at: Date.now() });
    try { localStorage.setItem("umbra-web-visits", JSON.stringify(list.slice(0, 12))); } catch {}
  }
  function showStart() {
    const box = el.querySelector(".web-start");
    const recent = visits().slice(0, 6);
    const quick = [["Wikipedia", "https://en.wikipedia.org/"], ["Weather", "https://www.windy.com/"], ["News", "https://lite.cnn.com/"], ["Maps", "https://www.openstreetmap.org/"]];
    box.innerHTML = `<div class="ws-in"><pre class="ws-art">${esc(`      .        *        .
  *       ___________       .
     .   / ◆ UMBRA  /|   *
        /__________/ |
   .    |  ONLINE  | /    .
        |__________|/  *`)}</pre>
      <small>UMBRA ONLINE · THE WEB, WITH UMBRA BESIDE YOU</small>
      <form class="ws-search"><span>⌕</span><input type="text" spellcheck="false" placeholder="Search the web or type an address"><button type="submit">GO ▸</button></form>
      <div class="ws-quick">${quick.map(([n, u]) => `<button type="button" data-go="${esc(u)}">${esc(n)}</button>`).join("")}</div>
      ${recent.length ? `<div class="ws-recent"><b>RECENTLY</b>${recent.map((v) => `<button type="button" data-go="${esc(v.url)}"><span>${esc(v.title || shortUrl(v.url))}</span><em>${esc(shortUrl(v.url))}</em></button>`).join("")}</div>` : ""}
      <p class="ws-note">Pages load from the internet. What Umbra reads on them stays on this computer.</p></div>`;
    box.hidden = false;
    box.querySelector(".ws-search").addEventListener("submit", (e) => { e.preventDefault(); go(box.querySelector(".ws-search input").value); });
    box.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => go(b.dataset.go)));
  }
  function hideStart() { const box = el?.querySelector(".web-start"); if (box) box.hidden = true; }

  // ------------------------------------------------------- Umbra View
  function setUmbraView(on, quiet) {
    umbraView = !!on && !!page();
    const box = el?.querySelector(".web-reader");
    if (!box) return;
    if (umbraView) {
      const p = page();
      const parts = (p.blocks || []).map((b) => {
        if (b.k === "img") return `<figure><img src="${esc(b.src)}" alt="${esc(b.alt)}" loading="lazy" referrerpolicy="no-referrer"></figure>`;
        const tag = { h1: "h1", h2: "h2", h3: "h3", p: "p", li: "li", q: "blockquote", cap: "figcaption", pre: "pre" }[b.k] || "p";
        let html = esc(b.t);
        for (const [text, href] of b.links || []) {
          const at = html.indexOf(esc(text));
          if (text.length > 1 && at >= 0) html = html.slice(0, at) + `<a href="#" data-href="${esc(href)}">${esc(text)}</a>` + html.slice(at + esc(text).length);
        }
        return `<${tag}>${html}</${tag}>`;
      }).join("");
      box.innerHTML = `<article><div class="wr-src">◆ UMBRA VIEW · ${esc(p.site)}</div><h1 class="wr-title">${esc(p.title)}</h1>${parts}</article>`;
      box.hidden = false; box.scrollTop = 0;
      track("webUmbraView");
    } else {
      box.hidden = true;
      if (!quiet) box.innerHTML = "";
    }
    paintTabs();
    place();
  }

  // ------------------------------------------------------ events from the launcher
  function hostEvent(e) {
    if (!e || !open && e.t !== "external") return;
    if (e.t === "tabs") {
      const before = active;
      tabs = e.tabs; active = e.active;
      if (tabs.length) hideStart(); else if (open) showStart();
      if (before !== active) { setUmbraView(false); selection = ""; onSwitch(); }
      paintTabs(); place();
    } else if (e.t === "nav") {
      delete errors[e.tab];
      if (e.tab === active) { el.querySelector(".web-error").hidden = true; setUmbraView(false); selection = ""; }
      delete pages[e.tab];
      paintTabs(); place();
    } else if (e.t === "page") {
      const old = pages[e.tab];
      pages[e.tab] = { ...e, frac: old && old.url === e.url ? old.frac : 0, seen: old && old.url === e.url ? old.seen : "" };
      rememberVisit(e.url, e.title);
      if (e.tab === active) { paintTabs(); onPage(pages[e.tab], old); if (umbraView) setUmbraView(true); }
    } else if (e.t === "seen") {
      const p = pages[e.tab];
      if (p) { p.seen = e.text; p.frac = e.frac; if (e.tab === active) { paintTabs(); onSeen(p); } }
    } else if (e.t === "sel") {
      if (e.tab === active) selection = e.text;
    } else if (e.t === "selact") {
      onSelection(e);
    } else if (e.t === "failed") {
      errors[e.tab] = e;
      if (e.tab === active) showError(e);
      place();
    } else if (e.t === "crashed") {
      errors[e.tab] = { message: "This page stopped working.", url: tabs.find((t) => t.id === e.tab)?.url || "" };
      if (e.tab === active) showError(errors[e.tab]);
      place();
    } else if (e.t === "snapshot") {
      if (e.purpose === "cover" && e.data) { lastShot = e.data; const img = el.querySelector(".web-cover"); img.src = `data:image/${e.type || "jpeg"};base64,` + e.data; img.hidden = !covered; }
      if (e.purpose === "vision" && pendingShot) { const go = pendingShot; pendingShot = null; go(e.data || ""); }
    } else if (e.t === "download") {
      if (e.state === "finished") note("download", `Downloaded <b>${esc(e.path.split("/").pop())}</b> to your Downloads folder.`, /\.(pdf|txt|md|epub|html?)$/i.test(e.path) ? [["▣ ADD TO LIBRARY", () => linkFile(e.path)]] : []);
      else if (e.state === "failed") note("download", `The download failed: ${esc(e.message || "")}`);
    } else if (e.t === "handoff") {
      external(e.url);
    } else if (e.t === "external") {
      if (!e.ok) note("info", `Couldn't open the other browser: ${esc(e.message || "")}`);
    } else if (e.t === "key") {
      hostKey(e.key);
    }
  }
  function onSwitch() {
    const p = page();
    el.querySelector(".web-error").hidden = !errors[active];
    if (errors[active]) showError(errors[active]);
    if (p) paintTabs();
  }
  function showError(e) {
    const box = el.querySelector(".web-error");
    box.innerHTML = `<div class="we-in"><pre>${esc(`  ┌─────────┐
  │  ◆   ◆  │
  │    ─    │   NO SIGNAL
  └─────────┘`)}</pre><b>${e.tls ? "THIS SITE'S SECURITY CERTIFICATE ISN'T VALID" : "THIS PAGE COULDN'T BE OPENED"}</b>
      <p>${e.tls ? "Umbra won't open it: the connection might not be private." : esc(e.message || "The site didn't answer.")}</p><small>${esc(shortUrl(e.url))}</small>
      <div><button type="button" class="ghost we-retry">TRY AGAIN</button>${e.url ? '<button type="button" class="ghost we-ext">OPEN IN YOUR BROWSER</button>' : ""}</div></div>`;
    box.hidden = false;
    box.querySelector(".we-retry").addEventListener("click", () => { delete errors[active]; box.hidden = true; send({ c: "open", url: e.url }); });
    box.querySelector(".we-ext")?.addEventListener("click", () => external(e.url));
  }
  function hostKey(key) {
    if (key === "ctrl+l" || key === "f6") { focusUi(); const a = el.querySelector(".web-addr input"); a.focus(); a.select(); }
    else if (key === "ctrl+t") { focusUi(); newTab(); }
    else if (key === "ctrl+w") { if (active) send({ c: "close", id: active }); }
    else if (key === "ctrl+tab" || key === "ctrl+shift+iso_left_tab" || key === "ctrl+shift+tab") {
      if (tabs.length > 1) { const i = tabs.findIndex((t) => t.id === active), d = key === "ctrl+tab" ? 1 : -1; send({ c: "select", id: tabs[(i + d + tabs.length) % tabs.length].id }); }
    } else {
      focusUi();
      const k = key.split("+").pop();
      const init = { key: /^f\d+$/.test(k) ? k.toUpperCase() : k, ctrlKey: key.includes("ctrl+"), shiftKey: key.includes("shift+"), bubbles: true, cancelable: true };
      document.dispatchEvent(new KeyboardEvent("keydown", init));
    }
  }
  const focusUi = () => { try { window.webkit.messageHandlers.umbra.postMessage("focus"); } catch {} };

  // ---------------------------------------------------- the companion
  // Cards in the conversation (never saved with it): what Umbra spotted on
  // the page, its remarks and fun facts, saves and downloads.
  function note(kind, html, actions = [], replaceKey = "") {
    const old = replaceKey ? feed.querySelector(`.web-note[data-key="${replaceKey}"]`) : null;
    const card = document.createElement("div");
    card.className = `msg web-note ${kind}`;
    if (replaceKey) card.dataset.key = replaceKey;
    const label = { spotted: "◇ SPOTTED ON THIS PAGE", fact: "✦ FUN FACT", remark: "UMBRA · READING ALONG", seen: "UMBRA · ON THIS PART", offer: "◇ AN IDEA",
      save: "▣ SAVED OFFLINE", download: "⇣ DOWNLOAD", info: "◇ UMBRA ONLINE", quote: "▣ QUOTE SAVED" }[kind] || "UMBRA";
    card.innerHTML = `<div class="label">${label}<time class="msg-time">${esc(new Date().toTimeString().slice(0, 5))}</time></div>
      <div class="wn-card"><div class="wn-body">${html}</div>${actions.length ? `<div class="wn-acts">${actions.map(([t], i) => `<button type="button" data-i="${i}">${t}</button>`).join("")}</div>` : ""}</div>`;
    card.querySelectorAll(".wn-acts button").forEach((b) => b.addEventListener("click", () => { Sound.click(); actions[+b.dataset.i][1](b); }));
    const stick = follow || feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
    if (old && old === feed.lastElementChild) old.replaceWith(card);
    else { old?.remove(); feed.appendChild(card); }
    if (stick) requestAnimationFrame(pinBottom);
    if (!["spotted"].includes(kind)) Sound.found();
    return card;
  }

  const KIND = { encyclopedia: "ENCYCLOPEDIA", video: "VIDEO", search: "SEARCH RESULTS", recipe: "RECIPE", shop: "SHOP", discussion: "DISCUSSION", article: "ARTICLE", page: "PAGE" };
  function spotted(p) {
    const extra = {
      encyclopedia: [["✎ QUIZ ME", () => askAbout("Quiz me with three short questions on this page, one at a time.", "✎ Quiz me on this page")]],
      recipe: [["☰ SHOPPING LIST", () => askAbout("Make a shopping list and a step-by-step plan from this recipe.", "☰ Shopping list from this recipe")]],
      shop: [["⚖ IS IT WORTH IT?", () => askAbout("Help me judge this product: what matters, what to check, and what questions to ask before buying.", "⚖ Is this worth it?")]],
      discussion: [["⚖ SUM UP THE DEBATE", () => askAbout("Sum up this discussion: the main positions and what most people agree on.", "⚖ Sum up this discussion")]],
      video: [["▶ WHAT'S IT ABOUT?", () => askAbout("From the page text, what is this video about and is it worth watching?", "▶ What's this video about?")]],
      search: [["◎ WHICH RESULT FITS?", () => askAbout("Which of these search results look most useful and trustworthy, and why?", "◎ Which result fits?")]],
      article: [["✓ KEY POINTS", () => askAbout("List the key points of this article in a few bullets.", "✓ Key points")]],
      page: [],
    }[p.kind] || [];
    const docs = p.docs?.length || 0;
    const lines = {
      encyclopedia: `An encyclopedia entry on <b>${esc(p.title.replace(/ [-–—] Wikipedia$/, ""))}</b>.`,
      search: "Search results. I can point out the ones worth opening.",
      recipe: "A recipe. I can turn it into a list and a plan.",
      shop: "A shop page. I can help you judge it.",
      discussion: "A discussion. I can sum up who says what.",
      video: "A video page. I can tell you what it's about from its text.",
      article: `An article${p.description ? `: ${esc(p.description.slice(0, 160))}` : "."}`,
      page: p.description ? esc(p.description.slice(0, 180)) : "I've read this page.",
    }[p.kind];
    const mins = Math.max(1, Math.round(p.words / 230));
    note("spotted", `<p>${lines}</p><small class="wn-meta">${esc(p.site)} · ${KIND[p.kind]} · ${p.words.toLocaleString()} WORDS · ~${mins} MIN READ${p.images ? ` · ${p.images} PICTURES` : ""}${docs ? ` · ${docs} DOCUMENTS` : ""}</small>`, [
      ["≡ SUMMARISE", summary],
      ...extra,
      [`▣ SAVE OFFLINE${p.images ? ` <small>+ ${p.images} PICTURES</small>` : ""}`, () => savePage(false)],
      ...(docs ? [[`⇣ SAVE + ${docs} DOCUMENTS`, () => savePage(true)]] : []),
    ], "spotted");
  }

  // Remarks: when, and which kind.
  let timers = [], lastRemarkAt = 0, recent = [], perPage = {}, remarkCtl = null, lastUserAt = 0, lastSeenRemark = 0;
  function clearTimers() { timers.forEach(clearTimeout); timers = []; remarkCtl?.abort(); remarkCtl = null; }
  function later(ms, fn) { timers.push(setTimeout(fn, ms)); }
  function onPage(p, old) {
    if (old && old.url === p.url) return;   // the same page, updated
    clearTimers();
    const mode = chatMode();
    if (mode === "off" || p.words < 120) return;
    const url = p.url;
    later(mode === "chatty" ? 1600 : 6000, () => { if (page()?.url === url && (mode === "chatty" || p.words >= 400)) spotted(page()); });
    if (mode === "chatty") {
      later(9000, () => remark(url, Math.random() < 0.6 ? "fact" : "remark"));
      later(70000, () => remark(url, "offer"));
    } else {
      later(25000, () => remark(url, "fact"));
    }
  }
  function onSeen(p) {
    if (chatMode() !== "chatty" || !p.seen || p.seen.length < 200) return;
    if (Date.now() - lastSeenRemark < 90000) return;
    lastSeenRemark = Date.now();
    later(4000, () => remark(p.url, "seen"));
  }
  function busy() {
    const q = $("#q");
    return !!controller || locked || document.hidden || !!(q && q.value.trim()) || Date.now() - lastUserAt < 15000
      || document.body.classList.contains("touring");
  }
  async function remark(url, style, tries = 0) {
    const p = page();
    if (!open || !p || p.url !== url || chatMode() === "off") return;
    const gap = chatMode() === "chatty" ? 35000 : 240000;
    const count = perPage[url] || 0;
    if (count >= (chatMode() === "chatty" ? 4 : 1)) return;
    if (busy() || Date.now() - lastRemarkAt < gap) {
      if (tries < 6) later(15000, () => remark(url, style, tries + 1));
      return;
    }
    lastRemarkAt = Date.now();
    perPage[url] = count + 1;
    remarkCtl = new AbortController();
    let out = {};
    try {
      out = await (await fetch("/api/web/remark", { method: "POST", headers: { "Content-Type": "application/json" }, signal: remarkCtl.signal,
        body: JSON.stringify({ style, title: p.title, site: p.site, text: p.text.slice(0, 1500), seen: p.seen || "", recent }) })).json();
    } catch { return; }
    if (out.busy) { perPage[url] = count; if (tries < 6) later(20000, () => remark(url, style, tries + 1)); return; }
    if (!out.text || page()?.url !== url || !open) return;
    recent = [out.text, ...recent].slice(0, 6);
    const text = esc(out.text).replace(/^Fun fact:\s*/i, "");
    if (style === "offer") {
      const ask_ = out.text.replace(/^Want me to\s*/i, "").replace(/\?\s*$/, "");
      note("offer", `<p>${esc(out.text)}</p>`, [["✓ YES, PLEASE", () => askAbout(`Please ${ask_}.`, `✓ ${ask_.charAt(0).toUpperCase() + ask_.slice(1)}`)], ["NOT NOW", (b) => b.closest(".web-note").remove()]]);
    } else {
      note(style === "seen" ? "seen" : style, `<p>${text}</p>`, [["⌕ TELL ME MORE", () => askAbout(`Tell me more about this: ${out.text}`, "⌕ Tell me more")]]);
    }
    track("webRemarks");
  }

  // ------------------------------------------------------------- tools
  let budget = 0;
  function askAbout(question, shownAs, size = 3000) {
    if (!page()) { note("info", "Open a page first, and I'll read it with you."); return; }
    budget = size; pageOnly = true;
    if (controller) { note("info", "I'm still answering. Ask again when I've finished."); return; }
    attachOnce = true;
    ask(question, shownAs);
  }
  let attachOnce = false, pageOnly = false;
  function summary() {
    const p = page();
    askAbout(`Summarise this web page${p ? ` ("${p.title}")` : ""}: the main points in a short overview, then anything surprising or important.`, "≡ Summarise this page", 6000);
  }
  function lookAtScreen() {
    if (!tab()?.url) { note("info", "Open a page first, and I'll look at it with you."); return; }
    if (controller) { note("info", "I'm still answering. Ask again when I've finished."); return; }
    pendingShot = (data) => { shotOnce = data; askAbout("Look at my screen: what am I looking at? Describe what you see on this page and anything useful to know about it.", "◎ What's on my screen?"); };
    send({ c: "snapshot", purpose: "vision" });
    setTimeout(() => { if (pendingShot) { const f = pendingShot; pendingShot = null; f(""); } }, 4000);
  }
  let shotOnce = "";
  async function savePage(withDocs) {
    const p = page();
    if (!p) { note("info", "Open a page first, then I can save it for offline reading."); return; }
    const card = note("save", `<p><span class="spin" data-spin>✻</span> Saving <b>${esc(p.title)}</b>${withDocs && p.docs?.length ? ` and ${p.docs.length} documents` : ""}…</p>`);
    try {
      const r = await (await fetch("/api/web/save", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: p.url, title: p.title, blocks: p.blocks, docs: p.docs, withDocs }) })).json();
      if (!r.ok) throw new Error(r.message || "");
      card.querySelector(".wn-body").innerHTML = `<p><b>${esc(r.name)}</b> is saved for offline reading${r.pictures ? `, with ${r.pictures} pictures` : ""}${r.documents ? ` and ${r.documents} documents` : ""}. It's in your Library, and I can find it in answers when you're offline.</p>
        <small class="wn-meta">${esc(r.folder)}${r.failed ? ` · ${r.failed} ITEMS COULDN'T BE DOWNLOADED` : ""}</small>`;
      card.querySelector(".wn-card").insertAdjacentHTML("beforeend", `<div class="wn-acts"><button type="button">󱉟 OPEN LIBRARY</button></div>`);
      card.querySelector(".wn-acts button").addEventListener("click", () => { Sound.click(); window.toggleLibrary ? toggleLibrary() : $("#library-btn")?.click(); });
      Sound.complete();
      window.UmbraAchievements?.check?.();
    } catch (err) {
      card.querySelector(".wn-body").innerHTML = `<p>The page couldn't be saved. ${esc(err.message)}</p>`;
      Sound.error();
    }
  }
  async function saveQuote(e) {
    const r = await fetch("/api/web/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: e.text, url: e.url, title: e.title }) }).then((x) => x.json()).catch(() => ({}));
    if (r.ok) note("quote", `<blockquote>${esc(e.text.slice(0, 400))}${e.text.length > 400 ? "…" : ""}</blockquote><small class="wn-meta">ADDED TO “SAVED QUOTES” IN YOUR LIBRARY</small>`);
    else note("info", "The quote couldn't be saved.");
  }
  async function linkFile(path) {
    const r = await fetch("/api/library/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [path] }) }).catch(() => null);
    note("info", r && r.ok ? "Added to your Library." : "That file couldn't be added to the Library.");
  }
  function onSelection(e) {
    selection = e.text;
    focusUi();
    const short = e.text.length > 90 ? e.text.slice(0, 87) + "…" : e.text;
    if (e.act === "explain") askAbout(`Explain this part of the page in simple words: "${e.text}"`, `✦ Explain: “${short}”`, 1500);
    else if (e.act === "quote") saveQuote(e);
    else {
      const q = $("#q");
      q.value = `About “${short}”: `;
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
      q.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
  function external(url) {
    const target = url || tab()?.url;
    if (!target) return;
    Sound.click();
    send({ c: "external", url: target, app: window.prefs?.webBrowser || "" });
  }
  async function loadBrowsers() {
    try { browsers = await (await fetch("/api/web/browsers")).json(); } catch {}
    const chosen = browsers.browsers.find((b) => b.id === (window.prefs?.webBrowser || browsers.default));
    if (el) el.querySelector(".web-ext-name").textContent = chosen ? `OPEN IN ${chosen.name.toUpperCase()}` : "OPEN IN BROWSER";
    return browsers;
  }
  function setChat(mode) {
    window.prefs.webChat = mode;
    postSettings({ webChat: mode });
    paintTools();
    if (mode === "off") clearTimers();
  }
  function paintTools() {
    if (!tools) return;
    tools.querySelectorAll("[data-chat]").forEach((b) => b.classList.toggle("on", b.dataset.chat === chatMode()));
    const chip = tools.querySelector(".web-chip");
    chip.classList.toggle("off", !attachPage);
    chip.querySelector(".web-chip-t").textContent = attachPage ? "PAGE ATTACHED" : "PAGE NOT ATTACHED";
    chip.title = attachPage ? "Page goes with your questions|Click to ask without the page" : "Questions go without the page|Click to attach it again";
  }
  function track(what) { try { window.track && window.track(what); } catch {} }

  // What goes with a question (app.js ask): the page, a selection, a picture.
  function pageFor() {
    lastUserAt = Date.now();
    remarkCtl?.abort();
    const p = page();
    const withPage = open && p && (attachPage || attachOnce);
    const shot = shotOnce, size = budget || 3000, picked = selection, only = pageOnly;
    attachOnce = false; shotOnce = ""; budget = 0; selection = ""; pageOnly = false;   // a selection goes with one question
    if (!withPage) return undefined;
    return { title: p.title, url: p.url, text: p.text.slice(0, 24000), budget: shot ? 1200 : size, selection: picked.slice(0, 2500), seen: p.seen || "", screenshot: shot || undefined, only: only || undefined };
  }

  return {
    available: host, get open() { return open; }, get covered() { return covered; }, enter, leave, fold, host: hostEvent, pageFor, loadBrowsers,
    get browsers() { return browsers; }, setChat, paintTools, go,
  };
})();
