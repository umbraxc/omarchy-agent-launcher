// A quiet theme-colored hint follows whichever vertical region can scroll.
"use strict";
(() => {
  const cue = document.createElement("div");
  cue.className = "scroll-cue"; cue.hidden = true; cue.setAttribute("aria-hidden", "true");
  cue.innerHTML = Array.from({ length: 5 }, (_, i) => `<i style="--line-index:${i}"></i>`).join("");
  document.body.appendChild(cue);
  let active = null, queued = false;
  const hide = (value) => { if (cue.hidden !== value) cue.hidden = value; };
  const canScroll = (el) => {
    if (!el || el === cue || el.hidden || el.clientHeight < 70 || el.scrollHeight <= el.clientHeight + 8) return false;
    const style = getComputedStyle(el);
    return /auto|scroll/.test(style.overflowY) || el === document.scrollingElement;
  };
  const nearest = (start) => {
    for (let el = start; el && el !== document.body; el = el.parentElement) if (canScroll(el)) return el;
    return canScroll(document.scrollingElement) ? document.scrollingElement : null;
  };
  function paint() {
    queued = false;
    if (!active || !active.isConnected || !canScroll(active) || active.scrollTop + active.clientHeight >= active.scrollHeight - 6) { hide(true); return; }
    const r = active.getBoundingClientRect();
    if (r.bottom < 70 || r.top > innerHeight || r.width < 80) { hide(true); return; }
    cue.style.left = `${Math.max(4, Math.min(innerWidth - 30, r.right - 30))}px`;
    cue.style.top = `${Math.max(62, Math.min(innerHeight - 52, r.bottom - 54))}px`;
    hide(false);
  }
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(paint); } };
  const choose = (target) => { const found = nearest(target); if (found) { active = found; queue(); } };
  document.addEventListener("pointerover", (e) => choose(e.target));
  document.addEventListener("focusin", (e) => choose(e.target));
  document.addEventListener("scroll", (e) => { active = nearest(e.target) || active; queue(); }, true);
  window.addEventListener("resize", queue);
  new MutationObserver(queue).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  active = nearest(document.querySelector("main")); queue();
})();
