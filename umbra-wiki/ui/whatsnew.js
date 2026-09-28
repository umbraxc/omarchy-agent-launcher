// Umbra Wiki "what's new": the first time Umbra starts after an update, once
// the boot animation has played and the screen is unlocked, a short note
// shows what the update brought (this version's part of the changelog).
// Shown once per version. The Windows app also checks once a day for a
// newer version and offers to install it (see UmbraUpdate below; Linux
// updates come through the package manager). Loaded after app.js (uses $, Sound, escapeHtml,
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
      <ul class="news-list">${info.items.slice(0, 10).map((t, i) => `<li style="animation-delay:${120 + i * 45}ms">${fmt(t)}</li>`).join("")}</ul>
      <div class="news-foot"><small>Every detail is in the changelog on GitHub.</small>
        <span class="news-btns"><button class="ghost news-tour" title="Take the tour again|A guided look at everything, including what's new. Your profile and settings are kept: skip any question to keep your answer.">↻ TAKE THE TOUR</button>
        <button class="solid news-ok">CONTINUE ▸</button></span></div></div>`;
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
    box.querySelector(".news-tour").addEventListener("click", () => { close(); setTimeout(() => window.startTour && window.startTour(), 450); });
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
    else if (/Windows/.test(navigator.userAgent)) {
      const u = await fetch("/api/update-auto").then((r) => r.json()).catch(() => ({}));
      if (u.installable) setTimeout(() => { if (!locked && !document.querySelector(".news")) offer(u); }, 900);
    }
  }

  // ------------------------------------------------ Windows: self-update

  function offer(u) {
    const box = document.createElement("div");
    box.className = "news";
    box.innerHTML = `<div class="news-card" role="dialog" aria-label="Update available">
      <div class="news-head"><span>UPDATE AVAILABLE · v${escapeHtml(u.latest)}</span><button class="ghost news-x" title="Close">✕</button></div>
      <div class="news-title">UMBRA ${escapeHtml(u.latest)} IS OUT</div>
      <p class="news-lead">You have ${escapeHtml(u.current)}. Installing takes a minute: Umbra downloads the new version, checks it,
        closes, updates and opens again. Everything you have stays: conversations, maps, library, settings and achievements.</p>
      <p class="news-lead upd-status" hidden></p>
      <div class="news-foot"><small>Umbra checks once a day; switch it off in Settings → Help &amp; updates.</small>
        <span class="news-btns"><button class="ghost news-later">LATER</button>
        <button class="solid news-ok">INSTALL NOW ▸</button></span></div></div>`;
    document.body.appendChild(box);
    Sound.glitch();
    const close = () => { box.classList.add("leaving"); setTimeout(() => box.remove(), 300); Sound.click(); };
    box.querySelector(".news-x").addEventListener("click", close);
    box.querySelector(".news-later").addEventListener("click", close);
    box.querySelector(".news-ok").addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      box.querySelector(".news-later").disabled = true;
      Sound.click();
      await install(box.querySelector(".upd-status"));
      e.currentTarget.disabled = false;
      box.querySelector(".news-later").disabled = false;
    });
    setTimeout(() => box.querySelector(".news-ok").focus(), 50);
  }

  // Downloads and checks the installer, then closes Umbra so it can run.
  // `note` shows the progress; resolves only if something went wrong.
  async function install(note) {
    const say = (t) => { if (note) { note.hidden = false; note.textContent = t; } };
    say("Downloading the update…");
    const r = await fetch("/api/update-install", { method: "POST" }).then((x) => x.json()).catch(() => ({ error: "Umbra's background service didn't answer" }));
    if (r.error) { say("Couldn't update: " + r.error + "."); Sound.error(); return; }
    for (;;) {
      await new Promise((ok) => setTimeout(ok, 500));
      const st = await fetch("/api/update-state").then((x) => x.json()).catch(() => ({}));
      if (st.error) { say("Couldn't update: " + st.error + ". Nothing was changed; try again later."); Sound.error(); return; }
      if (st.ready) break;
      if (st.total) say(`Downloading the update… ${Math.round(st.done * 100 / st.total)}%`);
    }
    say("Checked and ready. Umbra closes now and opens again in a moment, updated.");
    Sound.complete();
    setTimeout(() => { if (!window.umbraNative("close")) window.close(); }, 1600);
  }
  window.UmbraUpdate = { install, offer };
  setTimeout(wait, 1500);
  window.UmbraNews = { show: async () => { const i = await (await fetch("/api/whatsnew")).json(); if (i.items.length) show(i); } };
})();
