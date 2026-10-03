// A theme-colored direction cue follows the active vertical scroll region.
"use strict";
(() => {
  const cue = document.createElement("div");
  cue.className = "scroll-cue"; cue.hidden = true; cue.setAttribute("aria-hidden", "true");
  cue.innerHTML = '<span class="scroll-cue-arrow">↓</span>';
  document.body.appendChild(cue);
  let active = null, queued = false, hideTimer = 0, direction = "down", lastPanel = null, panelDefault = null, scannedAt = 0;
  const panels = ["maps", "galaxy", "fieldkit", "farming", "outpost", "friends", "radar", "loadout", "history", "library", "themes", "settings", "core"];
  function hide() {
    cue.classList.remove("is-visible");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!cue.classList.contains("is-visible")) cue.hidden = true; }, 260);
  }
  function show() {
    clearTimeout(hideTimer);
    if (cue.hidden) cue.hidden = false;
    requestAnimationFrame(() => cue.classList.add("is-visible"));
  }
  const canScroll = (el) => {
    if (!el || el === cue || el.closest("[hidden]") || el.clientHeight < 70 || el.scrollHeight <= el.clientHeight + 8) return false;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    return /auto|scroll/.test(style.overflowY) || el === document.scrollingElement;
  };
  const nearest = (start) => {
    for (let el = start; el && el !== document.body; el = el.parentElement) if (canScroll(el)) return el;
    return canScroll(document.scrollingElement) ? document.scrollingElement : null;
  };
  function current() {
    const panel = panels.map((id) => document.getElementById(id)).find((el) => el && !el.hidden);
    if (panel) {
      if (active && panel.contains(active) && canScroll(active)) return active;
      if (panel !== lastPanel || (!canScroll(panelDefault) && performance.now() - scannedAt > 500)) {
        lastPanel = panel; scannedAt = performance.now();
        panelDefault = canScroll(panel) ? panel : [...panel.querySelectorAll("*")].find(canScroll) || null;
      }
      active = panelDefault;
    } else if (!canScroll(active)) active = nearest(document.querySelector("#feed"));
    if (!panel) { lastPanel = null; panelDefault = null; }
    return active;
  }
  function paint() {
    queued = false;
    const region = current();
    if (!region || !region.isConnected || !canScroll(region)) { hide(); return; }
    const r = region.getBoundingClientRect();
    if (r.bottom < 70 || r.top > innerHeight || r.width < 80) { hide(); return; }
    cue.style.left = `${Math.max(4, Math.min(innerWidth - 30, r.right - 30))}px`;
    cue.style.top = `${Math.max(62, Math.min(innerHeight - 52, r.bottom - 54))}px`;
    const next = region.scrollTop <= 6 ? "down"
      : region.scrollTop + region.clientHeight >= region.scrollHeight - 6 ? "up" : "both";
    if (next !== direction) {
      direction = next;
      cue.querySelector(".scroll-cue-arrow").textContent = { down: "↓", both: "↕", up: "↑" }[next];
      cue.classList.remove("changing"); void cue.offsetWidth; cue.classList.add("changing");
    }
    show();
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  const choose = (target) => { const found = nearest(target); if (found) { active = found; queue(); } };
  document.addEventListener("pointerover", (e) => choose(e.target));
  document.addEventListener("focusin", (e) => choose(e.target));
  document.addEventListener("scroll", (e) => { active = nearest(e.target) || active; queue(); }, true);
  window.addEventListener("resize", queue);
  new MutationObserver(queue).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  active = nearest(document.querySelector("#feed")); queue();
})();
