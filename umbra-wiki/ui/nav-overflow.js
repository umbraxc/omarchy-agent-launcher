// Keep the compact header usable when downloads or narrow windows take space.
"use strict";
(() => {
  const top = document.querySelector(".top"), bar = document.querySelector(".controls");
  const settings = document.getElementById("settings-btn");
  const more = document.createElement("button");
  more.id = "nav-more"; more.className = "ctl"; more.type = "button"; more.hidden = true;
  more.title = "More tabs|Open the tabs that do not fit in this window";
  more.innerHTML = '<span class="g">󰅀</span>';
  settings.before(more);
  const menu = document.createElement("div");
  menu.className = "nav-overflow-menu"; menu.hidden = true;
  menu.id = "nav-overflow";
  document.body.appendChild(menu);
  more.setAttribute("aria-controls", menu.id);
  more.setAttribute("aria-expanded", "false");
  const candidates = () => [...bar.children].filter((el) => el.classList.contains("ctl") && el !== more && el !== settings && el.id !== "dl-btn" && !el.hidden && !el.classList.contains("gone"));
  const close = () => { menu.hidden = true; more.classList.remove("on"); more.setAttribute("aria-expanded", "false"); };
  function layout() {
    candidates().forEach((el) => el.classList.remove("overflowed"));
    more.hidden = true;
    const fits = () => top.scrollWidth <= top.clientWidth + 1 && settings.getBoundingClientRect().right <= top.getBoundingClientRect().right - 4;
    if (!fits()) {
      more.hidden = false;
      const ordered = candidates();
      for (let i = ordered.length - 1; i >= 0 && !fits(); i--) ordered[i].classList.add("overflowed");
    }
    const hidden = candidates().filter((el) => el.classList.contains("overflowed"));
    if (!hidden.length) { more.hidden = true; close(); return; }
    menu.innerHTML = hidden.map((el) => {
      const label = (el.dataset.tip || el.title || el.id).split("|")[0];
      return `<button type="button" data-for="${el.id}">${el.querySelector(".g")?.outerHTML || ""}<span>${escapeHtml(label)}</span></button>`;
    }).join("");
    if (!menu.hidden) place();
  }
  function place() {
    const r = more.getBoundingClientRect();
    menu.style.top = `${r.bottom + 7}px`;
    menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
  }
  more.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menu.hidden) { menu.hidden = false; place(); more.classList.add("on"); more.setAttribute("aria-expanded", "true"); menu.querySelector("button")?.focus(); Sound.click(); }
    else close();
  });
  menu.addEventListener("click", (e) => {
    const row = e.target.closest("button[data-for]"); if (!row) return;
    close(); document.getElementById(row.dataset.for)?.click();
  });
  document.addEventListener("pointerdown", (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== more && !more.contains(e.target)) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !menu.hidden) { e.stopImmediatePropagation(); close(); more.focus(); } }, true);
  let queued = false;
  const queue = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; layout(); }); };
  window.addEventListener("resize", queue);
  document.addEventListener("fullscreenchange", queue);
  document.addEventListener("umbra-downloads", queue);
  new MutationObserver(queue).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  queue();
})();
