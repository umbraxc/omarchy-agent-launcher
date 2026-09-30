// Umbra Wiki downloads: one place for everything being fetched (map areas,
// library collections, the AI model). A button in the top bar shows while
// something downloads, with its progress; its popover pauses, resumes or
// cancels each download. Every download panel shows the same calm note,
// and a chime and a note say when one is done.
// Loaded after app.js and uses its helpers ($, Sound, escapeHtml, confirmDialog).
"use strict";

(() => {
  const KINDS = {
    maps: { icon: "󰍍", title: "MAP", verb: "Map area" },
    library: { icon: "󱉟", title: "LIBRARY", verb: "Library" },
    model: { icon: "󰚩", title: "AI MODEL", verb: "AI model" },
    docs: { icon: "\u{F0219}", title: "MANUALS", verb: "Manuals" },
  };
  let state = null, timer = 0, open = false;

  // The same reassurance under every download.
  function note(what = "this") {
    return `<div class="dl-note"><span class="g">󰋽</span><p>Keep using Umbra normally: ${what} finishes in the background,
      even if you close the window, and goes on after a restart. A chime tells you when it's done.
      Only this data is fetched; your conversations, maps and settings are safe.</p></div>`;
  }

  // What's going on, per kind: {pct, line, active, paused}.
  function summary(d) {
    const out = {};
    if (d.maps && d.maps.kind === "download" && (d.maps.active || d.maps.paused)) {
      const m = d.maps;
      const pct = m.phase === "index" || m.phase === "terrain" ? Math.round((m.done / Math.max(1, m.count)) * 100)
        : m.total ? Math.min(100, Math.round((m.received / m.total) * 100)) : 0;
      const phase = { tiles: "map", points: "essential points", terrain: "elevation", index: "search index", paused: "paused" }[m.phase] || "starting";
      out.maps = { pct, active: m.active, paused: m.paused, line: `${m.name || "Map area"} · ${phase}` };
    }
    const lib = d.library || {};
    if (lib.active || lib.paused || lib.error) {
      const left = (lib.items || []).filter((x) => !x.installed);
      out.library = { pct: lib.percent || 0, active: lib.active, paused: lib.paused || !lib.active,
                      line: lib.error || (left.length === 1 ? left[0].name : `${left.length} collections`) };
    }
    const dc = d.docs || {};
    if (dc.left && (dc.active || dc.paused || dc.error)) {
      out.docs = { pct: dc.percent || 0, active: dc.active, paused: dc.paused || !dc.active,
                   line: dc.error || (dc.left === 1 ? dc.title : `${dc.title} + ${dc.left - 1} more`) };
    }
    const mo = d.model || {};
    if (mo.active || mo.paused) {
      out.model = { pct: mo.total ? Math.round((mo.completed * 100) / mo.total) : 0, active: mo.active, paused: mo.paused,
                    line: `${String(mo.model || "").replace(":", " ")} · ${mo.status || "preparing"}${mo.current ? ` · ${mo.current} still answers` : ""}` };
    }
    return out;
  }

  async function refresh() {
    clearTimeout(timer);
    let d;
    try { d = await (await fetch("/api/downloads")).json(); } catch { timer = setTimeout(refresh, 8000); return; }
    const before = state ? summary(state) : {};
    const now = summary(d);
    // Finished since last time: a chime and a note.
    if (state) {
      for (const k of Object.keys(before)) {
        if (!before[k].active || now[k]) continue;
        const done = k === "docs" ? !(d.docs && d.docs.error) : k === "maps" ? d.maps.phase === "done" : k === "model" ? d.model.status === "done" || !d.model.status
          : (d.library.items || []).every((x) => x.installed);
        if (done) finished(k, before[k].line, d);
      }
    }
    state = d;
    render(now);
    const busy = Object.values(now).some((x) => x.active && !x.paused);
    timer = setTimeout(refresh, busy ? 2000 : 10000);
    document.dispatchEvent(new CustomEvent("umbra-downloads", { detail: d }));
  }

  function render(now) {
    const btn = $("#dl-btn"), kinds = Object.keys(now);
    // The guided tour introduces this tab even before the first download.
    btn.hidden = !kinds.length && !document.body.classList.contains("touring");
    if (!kinds.length && open) toggle(false);
    const running = kinds.filter((k) => now[k].active && !now[k].paused);
    const pct = kinds.length ? Math.round(kinds.reduce((n, k) => n + now[k].pct, 0) / kinds.length) : 0;
    btn.classList.toggle("paused", !running.length);
    btn.style.setProperty("--pct", pct);
    btn.querySelector(".dl-pct").textContent = running.length ? pct + "%" : "II";
    btn.dataset.tip = running.length ? `Downloads · ${pct}%|${kinds.map((k) => `${KINDS[k].verb}: ${now[k].line}, ${now[k].pct}%`).join(" · ")}. Click to pause or resume.`
      : "Downloads paused|Click to resume them.";
    if (!open) return;
    const pop = $("#dl-pop");
    pop.innerHTML = `<div class="lib-head"><span>DOWNLOADS</span><button class="ghost dl-x" title="Close">✕</button></div>` +
      (kinds.length ? kinds.map((k) => {
        const s = now[k];
        return `<div class="dl-item ${s.paused ? "paused" : ""}"><div class="dl-top"><span class="g">${KINDS[k].icon}</span>
          <span class="dl-name"><b>${KINDS[k].title}</b><small>${escapeHtml(s.line)}</small></span>
          <span class="dl-p">${s.paused ? "PAUSED" : s.pct + "%"}</span></div>
          <div class="dl-bar"><i style="width:${s.pct}%"></i></div>
          <div class="dl-actions">${controls(k, s)}</div></div>`;
      }).join("") : `<p class="lib-note">Nothing downloading.</p>`) + note("each download");
    pop.querySelector(".dl-x").addEventListener("click", () => toggle(false));
    wire(pop);
  }

  // Pause / resume and cancel buttons for a download (also used in the
  // Maps panel, the Library and Settings).
  function controls(kind, s) {
    return `${s.paused ? `<button class="ghost dl-go" data-k="${kind}" data-a="resume" title="Resume|Goes on from where it stopped.">󰐊 RESUME</button>`
      : `<button class="ghost dl-go" data-k="${kind}" data-a="pause" title="Pause|Stops for now and keeps what's downloaded; resume any time, even after a restart.">󰏤 PAUSE</button>`}
      <button class="ghost dl-go dl-cancel" data-k="${kind}" data-a="cancel" title="Cancel|Stops and removes the unfinished part.">✕ CANCEL</button>`;
  }
  function wire(root, after) {
    root.querySelectorAll(".dl-go").forEach((b) => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const { k, a } = b.dataset;
      if (a === "cancel") {
        const ok = await confirmDialog({ kind: "to-local", tag: "DOWNLOADS", title: "CANCEL THIS DOWNLOAD?",
          body: "What's downloaded so far is removed. Nothing else is touched.", ok: "CANCEL IT", cancel: "KEEP GOING" });
        if (!ok) return;
      }
      b.disabled = true;
      try { await fetch(`/api/downloads/${k}/${a}`, { method: "POST" }); } catch {}
      a === "pause" ? Sound.lock() : a === "resume" ? Sound.unlock() : Sound.click();
      state = null;          // no chime for a cancel
      await refresh();
      if (after) after();
    }));
  }

  function finished(kind, line, latest) {
    Sound.complete();
    const t = document.createElement("div");
    t.className = "dl-toast";
    const what = kind === "maps" ? "MAP READY" : kind === "library" ? "LIBRARY READY" : kind === "docs" ? "MANUAL READY" : "AI MODEL READY";
    const more = kind === "maps" ? "is on this computer and works offline." : kind === "library" ? "joined the library." : kind === "docs" ? "is ready to read (Field Kit → Training → Manuals)."
      : latest.model?.activated ? "is installed and now answers your questions." : "is installed. Your current model still answers; switch in Core when ready.";
    t.innerHTML = `<span class="g">󰄬</span><div><b>${what}</b><p></p></div><button class="ghost" title="Close">✕</button>`;
    t.querySelector("p").textContent = `${line.replace(/ · .*$/, "")} ${more}`;
    document.body.appendChild(t);
    const bye = () => { t.classList.add("leaving"); setTimeout(() => t.remove(), 400); };
    t.querySelector("button").addEventListener("click", bye);
    setTimeout(bye, 9000);
  }

  function toggle(show = !open) {
    open = show;
    $("#dl-pop").hidden = !show;
    $("#dl-btn").classList.toggle("on", show);
    if (show) { render(state ? summary(state) : {}); refresh(); }
  }

  const btn = document.createElement("button");
  btn.id = "dl-btn"; btn.className = "ctl"; btn.hidden = true;
  btn.innerHTML = `<span class="g">󰄠</span><span class="dl-pct"></span>`;
  $("#loadout-btn").before(btn);
  btn.addEventListener("click", (e) => { e.stopPropagation(); toggle(); Sound.click(); });
  const pop = document.createElement("div");
  pop.id = "dl-pop"; pop.className = "dl-pop"; pop.hidden = true;
  document.body.appendChild(pop);
  document.addEventListener("mousedown", (e) => { if (open && !pop.contains(e.target) && e.target !== btn && !e.target.closest(".modal")) toggle(false); });
  document.addEventListener("keydown", (e) => { if (open && e.key === "Escape") { e.stopImmediatePropagation(); toggle(false); } }, true);

  window.UmbraDownloads = { note, controls, wire, refresh, get state() { return state; } };
  refresh();
})();
