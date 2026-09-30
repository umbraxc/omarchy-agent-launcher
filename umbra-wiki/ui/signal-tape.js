// A trading-floor style tape of actual local Umbra status, never market data.
"use strict";
(() => {
  const tape = document.querySelector("#signal-tape");
  const track = tape.querySelector(".signal-tape-track");
  const first = tape.querySelector(".signal-tape-group");
  let status = {}, farm = {}, radio = {}, downloads = {}, lastMarkup = "";
  function fitTrack() {
    const width = first.getBoundingClientRect().width;
    if (!width || !tape.clientWidth) return;
    // One complete sequence must be followed by enough identical copies to
    // cover the viewport throughout the loop, including after maximization.
    const count = Math.max(2, Math.ceil(tape.clientWidth / width) + 1);
    while (track.children.length < count) {
      const copy = first.cloneNode(true);
      copy.setAttribute("aria-hidden", "true");
      track.appendChild(copy);
    }
    while (track.children.length > count) track.lastElementChild.remove();
    track.style.setProperty("--tape-shift", `${-width}px`);
    track.style.setProperty("--tape-duration", `${Math.max(20, width / 42)}s`);
  }
  const safe = (v) => escapeHtml(String(v == null ? "" : v));
  const item = (art, tag, value, tone = "signal", extra = "") => `<span class="tape-item tape-${tone}"><span class="tape-art ${extra}" aria-hidden="true">${art}</span><small>${tag}</small><b>${safe(value)}</b></span>`;
  function farmArea() {
    const plan = farm.plan || {}, catalog = farm.catalog || {};
    const crops = new Set((catalog.crops || []).map((x) => x.id));
    const stock = new Map((catalog.livestock || []).map((x) => [x.id, x]));
    return (plan.items || []).reduce((sum, x) => sum + (crops.has(x.id) ? Number(x.amount || 0)
      : Number(x.amount || 0) * Number(x.housingM2 ?? stock.get(x.id)?.housingM2 ?? 0)), 0);
  }
  function draw() {
    // Keep the track mounted while panels open, so neither layout nor travel resets.
    if (tape.hidden) tape.hidden = false;
    const now = new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    const plan = farm.plan || {}, items = plan.items || [];
    const land = Number(plan.availableLandM2), used = farmArea();
    const radioTrack = (radio.catalog || []).find((x) => x.id === radio.track);
    const library = downloads.library || {}, model = downloads.model || {};
    const transfer = library.active ? item("⇣", "LIBRARY", `${Math.round(Number(library.percent || 0))}% DOWNLOADED`, "accent", "tape-live") : "";
    const landInfo = plan.availableLandM2 != null && land > 0
      ? item("▤", "PLANNED AREA", `${Math.round(used / land * 100)}%`, used > land ? "alert" : "green") : "";
    const markup = item("◈", "LOCAL TIME", now, "signal", "tape-live")
      + item("✦", "AI CORE", status.model || model.current || "CHECKING", status.modelReady ? "green" : "accent", "tape-live")
      + item("▥", "ARCHIVES", Number.isFinite(status.archives) ? status.archives : "—", "signal")
      + item("◉", "LINK", document.body.classList.contains("online") ? "ONLINE" : "LOCAL", document.body.classList.contains("online") ? "green" : "signal", "tape-live")
      + item("♧", "FARM PLAN", `${items.length} ${items.length === 1 ? "ITEM" : "ITEMS"}`, "green")
      + landInfo
      + item("♫", "RADIO", radio.playing ? (radioTrack?.title || radio.track || "PLAYING") : "STANDBY", radio.playing ? "green" : "muted")
      + transfer;
    if (markup === lastMarkup) return;
    lastMarkup = markup;
    [...track.children].forEach((g) => { g.innerHTML = markup; });
    tape.setAttribute("aria-label", `Umbra local status: ${status.model || "AI checking"}, ${status.archives ?? 0} archives, ${items.length} farm plan items`);
    requestAnimationFrame(fitTrack);
  }
  async function refresh() {
    if (document.hidden) return;
    const calls = await Promise.allSettled(["status", "farm", "radio", "downloads"].map((name) => fetch(`/api/${name}`).then((r) => r.ok ? r.json() : null)));
    [status, farm, radio, downloads] = calls.map((r, i) => r.status === "fulfilled" && r.value ? r.value : [status, farm, radio, downloads][i]);
    draw();
  }
  setInterval(refresh, 20000);
  setInterval(draw, 1000);
  new ResizeObserver(fitTrack).observe(tape);
  new ResizeObserver(fitTrack).observe(first);
  document.fonts?.ready.then(fitTrack);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  refresh();
})();
