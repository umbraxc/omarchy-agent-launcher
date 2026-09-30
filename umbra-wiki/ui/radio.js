// Umbra's small, fully offline radio. Linux streams bundled PCM through the
// local backend and the chosen audio output; Windows plays it in the WebView.
// Music continues while the user moves among Umbra's screens.
"use strict";
(() => {
  const host = window.UmbraSoundMenu?.panel.querySelector(".snd-radio");
  if (!host) return;
  const windows = /Windows/.test(navigator.userAgent);
  const owner = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).slice(0, 24);
  let catalog = [], current = "", volume = 0.4, audio = null, sequence = 0, queue = Promise.resolve(), error = "";
  const safe = (s) => escapeHtml(String(s || ""));
  const label = (id) => catalog.find((x) => x.id === id)?.title || id;
  const saveVolume = () => postSettings({ radioVolume: volume });
  const status = () => error || (current ? Sound.muted ? `PAUSED · ALL SOUND IS MUTED` : `PLAYING · ${label(current)}` : "STOPPED");
  const paintState = () => {
    host.querySelectorAll("button[data-track]").forEach((b) => {
      const on = b.dataset.track === current;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", String(on));
    });
    const stop = host.querySelector(".snd-radio-stop");
    if (stop) stop.disabled = !current;
    const state = host.querySelector(".snd-radio-state");
    if (state) state.textContent = status();
  };
  const backend = (track) => {
    const mine = ++sequence;
    queue = queue.catch(() => {}).then(async () => {
      const response = await fetch("/api/radio", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ owner, track, volume }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Radio could not start");
      if (mine === sequence) { error = data.error || ""; paintState(); }
    }).catch((e) => {
      if (mine === sequence) { error = e.message || "Radio unavailable"; paintState(); Sound.error(); }
    });
  };
  const stopAudio = () => { if (audio) { audio.pause(); audio.removeAttribute("src"); audio.load(); audio = null; } };
  const playback = (track) => {
    if (!windows) { backend(track); return; }
    stopAudio();
    if (!track) return;
    const a = new Audio(`/sounds/radio/${track}.wav`);
    a.loop = true; a.volume = volume; a.preload = "auto"; audio = a;
    a.play().then(() => { error = ""; paintState(); }).catch(() => {
      if (audio === a) { stopAudio(); current = ""; error = "Audio output is unavailable"; paintState(); }
    });
  };
  const select = (id) => {
    if (current === id) { current = ""; error = ""; playback(""); paintState(); return; }
    current = id; error = "";
    if (Sound.muted) setMuted(false); // this event starts the selected track
    else playback(id);
    paintState();
  };
  function render() {
    host.innerHTML = `<div class="snd-radio-head"><b>OFFLINE RADIO</b><button class="ghost snd-radio-stop" type="button">STOP ■</button></div>
      <p class="snd-radio-note">Original loops bundled with Umbra. They keep playing as you move between screens.</p>
      <div class="snd-radio-list">${catalog.map((x) => `<button type="button" data-track="${safe(x.id)}" aria-pressed="false"><span class="snd-radio-mark">${x.kind === "NATURE" || x.kind === "AMBIENCE" ? "◈" : "♫"}</span><span><b>${safe(x.title)}</b><small>${safe(x.line)}</small></span><em>${safe(x.kind)}</em></button>`).join("")}</div>
      <label class="snd-range snd-radio-volume"><span>Radio volume <output>${Math.round(volume * 100)}%</output></span><input type="range" min="0" max="1" step="0.05" value="${volume}"></label>
      <div class="snd-radio-state" role="status"></div>`;
    paintState();
  }
  host.addEventListener("click", (e) => {
    const track = e.target.closest("button[data-track]");
    if (track) { select(track.dataset.track); Sound.click(); }
    else if (e.target.closest(".snd-radio-stop")) { if (current) { current = ""; error = ""; playback(""); paintState(); Sound.click(); } }
  });
  host.addEventListener("input", (e) => {
    if (!e.target.matches(".snd-radio-volume input")) return;
    volume = Number(e.target.value);
    host.querySelector(".snd-radio-volume output").textContent = Math.round(volume * 100) + "%";
    if (audio) audio.volume = volume;
  });
  host.addEventListener("change", (e) => {
    if (!e.target.matches(".snd-radio-volume input")) return;
    saveVolume();
    if (current && !Sound.muted && !windows) playback(current);
  });
  document.addEventListener("umbra-sound-change", () => {
    if (!current) return;
    playback(Sound.muted ? "" : current);
    paintState();
  });
  window.addEventListener("pagehide", () => {
    stopAudio();
    if (!windows) fetch("/api/radio", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner, track: "", volume }), keepalive: true }).catch(() => {});
  });
  if (!windows) setInterval(async () => {
    if (!current || Sound.muted) return;
    try {
      const state = await fetch("/api/radio").then((r) => r.json());
      if (state.track !== current || !state.playing) {
        current = "";
        error = state.error || "Radio playback stopped";
        paintState();
      }
    } catch {}
  }, 4000);
  fetch("/api/radio").then((r) => r.json()).then((data) => {
    catalog = Array.isArray(data.catalog) ? data.catalog : [];
    if (typeof data.volume === "number") volume = data.volume;
    if (window.prefs) prefs.radioVolume = volume;
    render();
  }).catch(() => { host.innerHTML = `<p class="snd-radio-note">The local radio catalog is unavailable.</p>`; });
})();
