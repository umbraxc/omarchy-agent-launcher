// Umbra Online: the reader that runs inside each web page of the built-in
// browser, in an isolated world (the page's own scripts can't see or call it).
// It tells Umbra what the page is about (title, main text, headings, pictures,
// documents it links to, the part on screen) and what the user selects, and it
// shows a small Umbra bar over a selection: EXPLAIN · ASK · SAVE QUOTE.
// Messages go to the launcher (umbra-wiki, WebPane), which passes them on.
(() => {
  "use strict";
  if (window.__umbraRead || window.top !== window) return;
  // Linux: the launcher's handler in this isolated world; Windows: WebView2's channel.
  const post = (o) => {
    try { window.webkit.messageHandlers.umbraweb.postMessage(JSON.stringify(o)); return; } catch {}
    try { window.chrome.webview.postMessage(JSON.stringify(o)); } catch {}
  };
  // On Windows the page has the keyboard: Umbra's browser shortcuts go to Umbra.
  if (!window.webkit?.messageHandlers?.umbraweb && window.chrome?.webview) {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      const name = (e.ctrlKey ? "ctrl+" : "") + (e.shiftKey && e.ctrlKey ? "shift+" : "") + (k === "tab" ? "tab" : k);
      if (["ctrl+l", "ctrl+t", "ctrl+w", "ctrl+tab", "ctrl+shift+tab", "f1", "f6", "ctrl+k", "ctrl+b"].includes(name)) {
        e.preventDefault(); e.stopPropagation();
        post({ t: "key", key: name });
      }
    }, true);
  }
  const clip = (s, n) => (s.length > n ? s.slice(0, n) : s);
  const tidy = (s) => (s || "").replace(/\s+/g, " ").trim();
  const DOC = /\.(pdf|epub|docx?|odt|txt|md|csv|xlsx?|pptx?|zip)(\?|#|$)/i;
  const SKIP = "script,style,noscript,svg,canvas,iframe,nav,footer,header,aside,form,button,select,textarea,[role=navigation],[role=banner],[role=contentinfo],[aria-hidden=true],.mw-editsection,.reference,.navbox,.infobox-below,.sidebar,.toc,#toc";

  // The element that holds the main text: an <article> or <main>, else the
  // block with the most paragraph text.
  function mainNode() {
    const cand = [...document.querySelectorAll("article, main, [role=main], #content, #mw-content-text, .post, .entry-content, .article-body")];
    let best = null, score = 0;
    const measure = (el) => [...el.querySelectorAll("p")].reduce((n, p) => n + tidy(p.textContent).length, 0);
    for (const el of cand) { const n = measure(el); if (n > score) { best = el; score = n; } }
    if (score < 400) {
      const tally = new Map();
      for (const p of document.querySelectorAll("p")) {
        const n = tidy(p.textContent).length;
        if (n < 60 || !p.parentElement) continue;
        tally.set(p.parentElement, (tally.get(p.parentElement) || 0) + n);
      }
      for (const [el, n] of tally) if (n > score) { best = el; score = n; }
    }
    return best || document.body;
  }

  // Readable blocks (headings, paragraphs, list items, quotes, code, pictures)
  // for Umbra's own view of the page and for the AI.
  function blocks(root) {
    const out = [], seen = new Set();
    const walk = (el) => {
      if (out.length >= 700) return;
      for (const node of el.children) {
        if (node.matches(SKIP) || node.closest("[hidden]")) continue;
        const tag = node.tagName.toLowerCase();
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") continue;
        if (/^h[1-4]$/.test(tag)) { const t = tidy(node.textContent); if (t) out.push({ k: "h" + Math.min(3, +tag[1]), t: clip(t, 200) }); continue; }
        if (tag === "p" || tag === "li" || tag === "blockquote" || tag === "dd" || tag === "figcaption") {
          const t = tidy(node.innerText || node.textContent);
          if (t.length > 1 && !seen.has(t)) { seen.add(t); out.push({ k: tag === "li" ? "li" : tag === "blockquote" ? "q" : tag === "figcaption" ? "cap" : "p", t: clip(t, 3000), links: links(node) }); }
          if (tag !== "li") { for (const img of node.querySelectorAll("img")) picture(img, out); continue; }
          continue;
        }
        if (tag === "pre") { out.push({ k: "pre", t: clip(node.textContent, 3000) }); continue; }
        if (tag === "img") { picture(node, out); continue; }
        if (tag === "table") { const t = tidy(node.innerText); if (t) out.push({ k: "p", t: clip(t, 1500) }); continue; }
        walk(node);
      }
    };
    walk(root);
    return out;
  }
  function picture(img, out) {
    const src = img.currentSrc || img.src;
    if (!/^https?:/.test(src) || img.naturalWidth && img.naturalWidth < 90 || img.width && img.width < 60) return;
    out.push({ k: "img", src, alt: clip(tidy(img.alt), 200) });
  }
  function links(node) {
    const l = [...node.querySelectorAll("a[href]")].slice(0, 12).map((a) => [tidy(a.textContent), a.href]).filter(([t, h]) => t && /^https?:/.test(h));
    return l.length ? l : undefined;
  }

  // What kind of page this is, so Umbra can offer the right things.
  function kind(words) {
    const host = location.hostname, path = location.pathname;
    if (/wikipedia\.org$/.test(host)) return "encyclopedia";
    if (/youtube\.com|vimeo\.com/.test(host) || document.querySelector("video")) return "video";
    if (/[?&](q|query|search)=/.test(location.search) || /\/search/.test(path)) return "search";
    if (document.querySelector('[itemtype*="Recipe"], .wprm-recipe, .recipe')) return "recipe";
    if (document.querySelector('[itemtype*="Product"], [data-price], .price, #add-to-cart') && words < 2500) return "shop";
    if (/forum|reddit\.com|stackexchange|stackoverflow/.test(host + path)) return "discussion";
    if (document.querySelector("article") || words > 700) return "article";
    return "page";
  }

  let last = "", timer = 0, sentAt = 0;
  function read(force) {
    const root = mainNode();
    const b = blocks(root);
    const text = b.filter((x) => x.k !== "img").map((x) => (x.k[0] === "h" ? "\n## " : x.k === "li" ? "- " : "") + x.t).join("\n");
    const words = text.split(/\s+/).filter(Boolean).length;
    const sig = location.href + "|" + document.title + "|" + words;
    if (!force && sig === last) return;
    last = sig; sentAt = Date.now();
    const docs = [...document.querySelectorAll("a[href]")].filter((a) => DOC.test(a.href) && /^https?:/.test(a.href))
      .slice(0, 40).map((a) => ({ name: clip(tidy(a.textContent) || decodeURIComponent(a.href.split("/").pop().split("?")[0]), 120), url: a.href }));
    const meta = (n) => document.querySelector(`meta[name="${n}"], meta[property="${n}"]`)?.content || "";
    const icon = document.querySelector('link[rel~="icon"]')?.href || "";
    post({
      t: "page", url: location.href, title: clip(document.title, 300), site: location.hostname.replace(/^www\./, ""),
      description: clip(tidy(meta("description") || meta("og:description")), 400), lang: document.documentElement.lang || "",
      kind: kind(words), words, text: clip(text, 24000), blocks: b, docs, icon: /^https?:/.test(icon) ? icon : "",
      images: b.filter((x) => x.k === "img").length, headings: b.filter((x) => x.k[0] === "h").map((x) => x.t).slice(0, 30),
    });
  }
  window.__umbraRead = read;
  const soon = (ms) => { clearTimeout(timer); timer = setTimeout(() => read(false), Math.max(ms, 3000 - (Date.now() - sentAt))); };
  soon(400);
  window.addEventListener("load", () => soon(600));
  // Pages that change without reloading (search results, feeds, single-page apps).
  new MutationObserver(() => soon(1500)).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", () => soon(300));

  // The part on screen right now (Umbra comments on where the reader is).
  let seenTimer = 0;
  window.addEventListener("scroll", () => {
    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => {
      const mid = innerHeight / 2, parts = [];
      for (const p of document.querySelectorAll("p, li, h2, h3")) {
        const r = p.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight && r.height) parts.push(tidy(p.textContent));
        if (r.top > innerHeight) break;
      }
      const h = document.documentElement;
      post({ t: "seen", text: clip(parts.join("\n"), 2500), frac: Math.round(100 * (scrollY + innerHeight) / Math.max(h.scrollHeight, 1)), mid });
    }, 900);
  }, { passive: true });

  // ------------------------------------------------- the selection bar
  let host = null, bar = null, selText = "";
  function ensureBar() {
    if (host && host.isConnected) return;
    host = document.createElement("umbra-selection");
    host.style.cssText = "all:initial;position:absolute;z-index:2147483647;display:none";
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `<style>
      .b{display:flex;gap:3px;padding:3px;background:#0d0d0d;border:1px solid var(--s,#e8d27c);box-shadow:0 8px 22px rgba(0,0,0,.45);font:600 10px "JetBrainsMono Nerd Font","JetBrains Mono",monospace;letter-spacing:.1em;animation:in .14s ease-out}
      button{all:unset;cursor:pointer;color:var(--s,#e8d27c);background:#131313;border:1px solid #2a2a2a;padding:5px 8px}
      button:hover{background:#1e1e1e;color:#f0f0f0;border-color:var(--s,#e8d27c)}
      @keyframes in{from{opacity:0;transform:translateY(4px)}}</style>
      <div class="b"><button data-a="explain">✦ EXPLAIN</button><button data-a="ask">⌕ ASK UMBRA</button><button data-a="quote">▣ SAVE QUOTE</button></div>`;
    bar = shadow.querySelector(".b");
    bar.addEventListener("mousedown", (e) => e.preventDefault());
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      post({ t: "selact", act: b.dataset.a, text: selText, url: location.href, title: document.title });
      hideBar();
    });
    document.documentElement.appendChild(host);
  }
  function hideBar() { if (host) host.style.display = "none"; }
  function showBar() {
    const sel = getSelection();
    const text = sel && !sel.isCollapsed ? tidy(sel.toString()) : "";
    if (text.length < 2 || text.length > 4000 || !sel.rangeCount) { hideBar(); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) { hideBar(); return; }
    selText = text;
    ensureBar();
    host.style.display = "block";
    const w = bar.offsetWidth || 300;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const y = r.top > 50 ? r.top - 42 : r.bottom + 10;
    host.style.left = scrollX + x + "px";
    host.style.top = scrollY + y + "px";
    post({ t: "sel", text: clip(text, 4000) });
  }
  document.addEventListener("mouseup", (e) => { if (host && e.composedPath().includes(host)) return; setTimeout(showBar, 10); });
  document.addEventListener("keyup", (e) => { if (e.shiftKey || e.key === "Shift") setTimeout(showBar, 10); });
  document.addEventListener("selectionchange", () => { const s = getSelection(); if (!s || s.isCollapsed) hideBar(); });
  window.__umbraTint = (color) => { ensureBar(); host.style.setProperty("--s", color); };
})();
