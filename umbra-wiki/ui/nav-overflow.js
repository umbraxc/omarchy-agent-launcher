// Keep the tab row in one predictable menu at every window size.
"use strict";
(() => {
  const top = document.querySelector(".top"), bar = document.querySelector(".controls");
  const more = document.createElement("button");
  more.id = "nav-more"; more.className = "ctl"; more.type = "button"; more.hidden = true;
  more.title = "All tabs|Open Umbra's tabs as a menu";
  more.setAttribute("aria-label", "Open all tabs");
  more.innerHTML = '<span class="g">☰</span>';
  bar.appendChild(more);
  const menu = document.createElement("div");
  menu.id = "nav-overflow"; menu.className = "nav-overflow-menu"; menu.hidden = true;
  menu.setAttribute("role", "menu");
  document.body.appendChild(menu);
  more.setAttribute("aria-controls", menu.id);
  more.setAttribute("aria-expanded", "false");

  const tabs = () => [...bar.children].filter(el => el.classList.contains("ctl") && el !== more && !el.hidden && !el.classList.contains("gone"));
  const close = () => { menu.hidden = true; more.classList.remove("on"); more.setAttribute("aria-expanded", "false"); };
  function place() {
    const r = more.getBoundingClientRect();
    menu.style.top = `${r.bottom + 7}px`;
    menu.style.left = `${Math.max(8, Math.min(r.right - menu.offsetWidth, innerWidth - menu.offsetWidth - 8))}px`;
  }
  function fill() {
    menu.innerHTML = tabs().map(el => {
      const label = el.id === "dl-btn" ? "DOWNLOADS" : window.UMBRA_TAB_NAMES?.[el.id] || (el.dataset.tip || el.title || el.id).split("|")[0].toUpperCase();
      const active = el.classList.contains("on");
      const progress = el.querySelector(".dl-pct")?.textContent || "";
      return `<button type="button" role="menuitem" data-for="${el.id}" class="${active ? "on" : ""}">${el.querySelector(".g")?.outerHTML || ""}<span>${escapeHtml(label)}</span>${progress ? `<small>${escapeHtml(progress)}</small>` : ""}</button>`;
    }).join("");
  }
  function open() {
    if (document.body.classList.contains("locked")) return;
    fill(); menu.hidden = false; more.classList.add("on"); more.setAttribute("aria-expanded", "true"); place();
  }
  function layout() {
    top.classList.add("compact-nav"); more.hidden = false;
    if (menu.hidden) fill();
    else place();
    if (document.body.classList.contains("locked")) close();
  }
  more.addEventListener("click", event => {
    event.stopPropagation();
    if (!menu.hidden) { close(); return; }
    open(); menu.querySelector("button")?.focus(); Sound.click();
  });
  const activate = row => {
    const tab = document.getElementById(row.dataset.for);
    if (tab?.id !== "sound") window.UmbraSoundMenu?.close();
    close(); tab?.click();
  };
  // A press must survive unrelated header mutations while the menu is open.
  menu.addEventListener("pointerdown", event => {
    const row = event.target.closest("button[data-for]");
    if (!row || event.button !== 0) return;
    event.preventDefault(); event.stopPropagation(); activate(row);
  });
  menu.addEventListener("click", event => {
    const row = event.target.closest("button[data-for]");
    if (row && !menu.hidden) activate(row);  // keyboard / accessibility activation
  });
  document.addEventListener("pointerdown", event => {
    if (!menu.hidden && !document.querySelector(".spot-shade") && !menu.contains(event.target) && !more.contains(event.target)) close();
  });
  document.addEventListener("keydown", event => {
    if (menu.hidden) return;
    if (event.key === "Escape") { event.stopImmediatePropagation(); close(); more.focus(); }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const rows = [...menu.querySelectorAll("button")], index = rows.indexOf(document.activeElement);
      rows[(index + (event.key === "ArrowDown" ? 1 : -1) + rows.length) % rows.length]?.focus();
    }
  }, true);
  let queued = false;
  const queue = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; layout(); }); };
  window.addEventListener("resize", queue);
  document.addEventListener("fullscreenchange", queue);
  document.addEventListener("umbra-downloads", queue);
  new MutationObserver(records => { if (records.some(record => record.target !== more)) queue(); })
    .observe(bar, { childList: true, attributes: true, subtree: true, attributeFilter: ["hidden", "class"] });
  new MutationObserver(queue).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.UmbraNavOverflow = { open, close, fill, menu, more };
  queue();
})();
