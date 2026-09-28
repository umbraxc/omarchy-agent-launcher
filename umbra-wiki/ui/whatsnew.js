// Umbra Wiki "what's new": the first time Umbra starts after an update, once
// the boot animation has played and the screen is unlocked, a short note
// shows what the update brought (this version's part of the changelog).
// Shown once per version. Loaded after app.js (uses $, Sound, escapeHtml,
// locked, postSettings).
"use strict";

(() => {
  // **bold** in the changelog becomes the item's title.
  const fmt = (t) => escapeHtml(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");

  function show(info) {
    const box = document.createElement("div");
    box.className = "news";
    box.innerHTML = `<div class="news-card" role="dialog" aria-label="What's new">
      <div class="news-head"><span>UPDATE INSTALLED · v${escapeHtml(info.version)}</span><button class="ghost news-x" title="Close">✕</button></div>
      <div class="news-title">WHAT'S NEW</div>
      <p class="news-lead">Umbra was updated. Everything you had is still here: conversations, maps, waypoints, settings and achievements.</p>
      <ul class="news-list">${info.items.map((t, i) => `<li style="animation-delay:${120 + i * 45}ms">${fmt(t)}</li>`).join("")}</ul>
      <div class="news-foot"><small>The full changelog is on GitHub and in Settings → Help & updates.</small>
        <button class="solid news-ok">GOT IT ▸</button></div></div>`;
    document.body.appendChild(box);
    Sound.glitch();
    const close = () => {
      postSettings({ seenVersion: info.version });
      box.classList.add("leaving");
      setTimeout(() => box.remove(), 300);
      document.removeEventListener("keydown", esc, true);
      Sound.click();
    };
    const esc = (e) => { if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
    document.addEventListener("keydown", esc, true);
    box.querySelector(".news-x").addEventListener("click", close);
    box.querySelector(".news-ok").addEventListener("click", close);
    box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
    setTimeout(() => box.querySelector(".news-ok").focus(), 50);
  }

  // Waits for a quiet moment: booted, unlocked, no tour and no dialog open.
  let tries = 0;
  async function wait() {
    const busy = document.body.classList.contains("booting") || document.body.classList.contains("touring") ||
      locked || document.querySelector(".wipe") || !$("#modal").hidden;
    if (busy) { if (++tries < 400) setTimeout(wait, 700); return; }
    const info = await fetch("/api/whatsnew").then((r) => r.json()).catch(() => null);
    if (info && info.show) setTimeout(() => { if (!locked && !document.querySelector(".news")) show(info); }, 900);
  }
  setTimeout(wait, 1500);
  window.UmbraNews = { show: async () => { const i = await (await fetch("/api/whatsnew")).json(); if (i.items.length) show(i); } };
})();
