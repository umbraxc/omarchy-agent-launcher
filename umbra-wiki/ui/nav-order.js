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
  let noteTimer = 0;
  const hideNote = () => { clearTimeout(noteTimer); note.hidden = true; };
  const showNote = () => {
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      const r = bar.getBoundingClientRect();
      note.style.top = `${r.bottom + 8}px`;
      note.style.right = `${Math.max(8, innerWidth - r.right)}px`;
      note.hidden = false;
    }, 650);
  };
  bar.addEventListener("mouseover", (e) => { if (movable(e.target.closest(".ctl"))) showNote(); });
  bar.addEventListener("mouseout", (e) => { if (!bar.contains(e.relatedTarget)) hideNote(); });
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
