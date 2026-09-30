// Hold Shift and drag a header tab to arrange it. Settings remains anchored.
"use strict";
(() => {
  const bar = document.querySelector(".controls");
  const pinned = document.querySelector("#settings-btn");
  const ids = ["loadout-btn", "history-btn", "library-btn", "maps-btn", "fieldkit-btn", "farming-btn", "radar-btn", "theme-btn", "sound", "lock"];
  const movable = (el) => el && ids.includes(el.id);
  const order = () => [...bar.children].filter(movable).map((el) => el.id);
  function apply(saved) {
    const arranged = [...new Set([...(Array.isArray(saved) ? saved : []), ...ids])].filter((id) => ids.includes(id));
    for (const id of arranged) { const el = document.getElementById(id); if (el) bar.insertBefore(el, pinned); }
  }
  let dragging = null, startX = 0, startY = 0, moved = false, suppress = false;
  const note = document.createElement("div");
  note.className = "nav-order-note";
  note.textContent = "HOLD SHIFT + DRAG TO REARRANGE";
  note.hidden = true;
  document.body.appendChild(note);
  let hideTimer = 0;
  const hideNote = () => { clearTimeout(hideTimer); note.hidden = true; };
  const busy = () => !!document.querySelector(".nav-callout:not([hidden]), .ac-toast:not([hidden]), .dl-toast:not([hidden]), .tip:not([hidden]), .sound-pop:not([hidden])");
  const showNote = () => {
    const panels = ["maps", "fieldkit", "farming", "radar", "loadout", "history", "library", "themes", "settings", "core"];
    if (document.hidden || document.body.classList.contains("locked") || document.body.classList.contains("touring") || busy() ||
        panels.some((id) => document.getElementById(id)?.hidden === false)) return;
    const r = bar.getBoundingClientRect();
    note.style.top = `${r.bottom + 10}px`;
    note.style.right = `${Math.max(8, innerWidth - r.right)}px`;
    note.hidden = false;
    hideTimer = setTimeout(hideNote, 4500);
  };
  setTimeout(showNote, 45000);
  setInterval(showNote, 300000);
  bar.addEventListener("mouseover", hideNote);
  new MutationObserver(() => { if (!note.hidden && busy()) hideNote(); })
    .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] });
  bar.addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".ctl");
    if (!e.shiftKey || e.button !== 0 || !movable(el) || document.body.classList.contains("touring")) return;
    dragging = el; startX = e.clientX; startY = e.clientY; moved = false;
    hideNote();
    e.preventDefault();
  });
  window.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    if (!moved && Math.hypot(e.clientX - startX, e.clientY - startY) < 5) return;
    moved = true; dragging.classList.add("nav-moving");
    bar.querySelectorAll(".nav-target").forEach((el) => el.classList.remove("nav-target"));
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest(".ctl");
    if (!movable(target) || target === dragging) return;
    const before = e.clientX < target.getBoundingClientRect().left + target.offsetWidth / 2;
    bar.insertBefore(dragging, before ? target : target.nextSibling === pinned ? pinned : target.nextSibling);
    target.classList.add("nav-target");
  });
  function end() {
    if (!dragging) return;
    dragging.classList.remove("nav-moving"); dragging = null;
    bar.querySelectorAll(".nav-target").forEach((el) => el.classList.remove("nav-target"));
    if (moved) {
      suppress = true;
      const headerOrder = order();
      if (window.prefs) window.prefs.headerOrder = headerOrder;
      if (window.postSettings) postSettings({ headerOrder });
      setTimeout(() => { suppress = false; }, 0);
    }
  }
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  bar.addEventListener("click", (e) => { if (suppress) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  window.UmbraNavOrder = { apply, order };
})();
