// Umbra Wiki voice out: Umbra reads its answers aloud with an offline voice
// (Kokoro, in speech.py), each personality in its own. This file is the
// window's side: the VOICE options row that opens from the microphone (read
// aloud off / always / when I speak, Umbra's voice female or male, volume,
// stop), a LISTEN button on every answer, the install of the voice, and on
// Windows the playing of the clips (on Linux the backend plays them).
// Loaded after app.js (uses $, Sound, escapeHtml, confirmDialog).
"use strict";

window.UmbraSpeech = (() => {
  let st = { installed: false, speechMode: "off", speechGender: "f", speechVolume: 0.85, install: {}, speaking: false };
  let row = null, spokeInput = false, poll = 0, audio = null, queue = [];
  const post = (url, body = {}) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({}));
  const MODES = [["off", "OFF", "Umbra writes, silently"], ["always", "ALWAYS", "Every answer is read aloud"], ["mic", "WHEN I SPEAK", "Answers to questions you spoke (F9) are read aloud"]];

  async function refresh() {
    const s = await fetch("/api/speech").then((r) => r.json()).catch(() => null);
    if (s) st = s;
    paint();
    document.body.classList.toggle("speaking", !!st.speaking);
    return st;
  }

  // ------------------------------------------------------ the options row
  function build() {
    if (row) return;
    row = document.createElement("div");
    row.className = "speech-tools";
    row.hidden = true;
    const dock = document.querySelector(".dock");
    dock.insertBefore(row, dock.querySelector("#promptbar"));
    row.addEventListener("click", async (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      Sound.click();
      if (b.dataset.mode) { st.speechMode = b.dataset.mode; await window.postSettings?.({ speechMode: b.dataset.mode }); paint(); }
      else if (b.dataset.gender) { st.speechGender = b.dataset.gender; await window.postSettings?.({ speechGender: b.dataset.gender }); paint(); sample("umbra"); }
      else if (b.dataset.act === "stop") stop();
      else if (b.dataset.act === "install") install();
      else if (b.dataset.act === "sample") sample();
      else if (b.dataset.act === "close") toggle(false);
    });
    row.addEventListener("input", (e) => {
      if (!e.target.matches(".sp-vol")) return;
      st.speechVolume = +e.target.value;
      row.querySelector(".sp-vol-n").textContent = Math.round(st.speechVolume * 100) + "%";
      clearTimeout(row.t); row.t = setTimeout(() => window.postSettings?.({ speechVolume: st.speechVolume }), 250);
    });
    // A small speaker on the microphone opens the row; right-click on the microphone does too.
    const mic = $("#mic");
    const btn = document.createElement("button");
    btn.type = "button"; btn.id = "speech-btn";
    btn.title = "Umbra's voice|Read answers aloud: off, always, or when you spoke the question. Umbra's voice, volume, stop.";
    btn.innerHTML = `<span class="g">󰕾</span>`;
    mic.after(btn);
    btn.addEventListener("mousedown", (e) => e.preventDefault());
    btn.addEventListener("click", () => { Sound.click(); if (st.speaking) stop(); else toggle(); });
    mic.addEventListener("contextmenu", (e) => { e.preventDefault(); Sound.click(); toggle(true); });
  }
  function toggle(on = row.hidden) {
    build();
    row.hidden = !on;
    $("#speech-btn")?.classList.toggle("on", on);
    if (on) refresh();
  }
  function paint() {
    if (!row) return;
    $("#speech-btn")?.classList.toggle("live", st.speechMode !== "off");
    const ins = st.install || {};
    if (!st.installed) {
      const pct = ins.total ? Math.round((ins.done / ins.total) * 100) : 0;
      row.innerHTML = `<span class="sp-k"><span class="g">󰕾</span> UMBRA'S VOICE</span>
        ${ins.active ? `<span class="sp-dl"><i style="width:${pct}%"></i></span><span class="sp-note">${ins.phase === "engine" ? "Setting up the voice engine…" : `Downloading the voice · ${pct}%`}</span>`
          : `<span class="sp-note">${ins.phase === "error" ? `<b class="sp-err">${escapeHtml(ins.error || "The download failed.")}</b> ` : ""}A natural voice that reads answers aloud, offline, each personality in its own. One download of ${st.downloadMB || 354} MB.</span>
             <button type="button" class="solid" data-act="install">⇣ GET THE VOICE</button>`}
        <button type="button" class="sp-x" data-act="close" title="Close">✕</button>`;
      if (ins.active) watchInstall();
      return;
    }
    row.innerHTML = `<span class="sp-k"><span class="g">󰕾</span> READ ALOUD</span>
      <span class="sp-seg">${MODES.map(([k, n, hint]) => `<button type="button" data-mode="${k}" class="${st.speechMode === k ? "on" : ""}" title="${escapeHtml(n)}|${escapeHtml(hint)}">${n}</button>`).join("")}</span>
      <span class="sp-k">UMBRA</span><span class="sp-seg">${[["f", "♀ FEMALE"], ["m", "♂ MALE"]].map(([k, n]) => `<button type="button" data-gender="${k}" class="${st.speechGender === k ? "on" : ""}" title="Umbra's voice|Other personalities have their own.">${n}</button>`).join("")}</span>
      <label class="sp-volume" title="Voice volume|Separate from Umbra's sounds"><span class="g">󰕾</span><input type="range" class="sp-vol" min="0" max="1" step="0.05" value="${st.speechVolume}"><span class="sp-vol-n">${Math.round(st.speechVolume * 100)}%</span></label>
      <button type="button" data-act="sample" title="Hear it|A line in the current personality's voice">▶ HEAR</button>
      <button type="button" data-act="stop" class="sp-stop" ${st.speaking ? "" : "disabled"}>■ STOP</button>
      <button type="button" class="sp-x" data-act="close" title="Close">✕</button>`;
  }
  function watchInstall() {
    clearTimeout(watchInstall.t);
    watchInstall.t = setTimeout(async () => {
      const was = st.installed;
      await refresh();
      if (st.install?.active) watchInstall();
      else if (!was && st.installed) { Sound.found(); window.umbraToast?.("Umbra's voice is ready. Choose when it reads aloud."); if (st.speechMode === "off") { st.speechMode = "always"; window.postSettings?.({ speechMode: "always" }); paint(); } }
    }, 1200);
  }
  async function install() {
    const ok = await confirmDialog({ kind: "to-online", tag: "VOICE", title: "DOWNLOAD UMBRA'S VOICE?",
      body: `About ${st.downloadMB || 354} MB, once, with internet: the speech engine and the Kokoro voice model (open source). After that it works entirely offline, and nothing you say or read leaves this computer.`, ok: "DOWNLOAD", cancel: "NOT NOW" });
    if (!ok) return;
    st = await post("/api/speech/install");
    paint(); watchInstall();
  }

  // ------------------------------------------------------------- speech
  // Whether the question about to be sent should be answered aloud.
  function wants() {
    const yes = st.installed && (st.speechMode === "always" || (st.speechMode === "mic" && spokeInput));
    spokeInput = false;
    if (yes) speakingSoon();
    return yes;
  }
  function heardVoice() { spokeInput = true; }
  async function say(text) {
    if (!st.installed) { toggle(true); return; }
    await post("/api/speech/say", { text });
    speakingSoon();
  }
  async function sample(persona) {
    if (!st.installed) { toggle(true); return; }
    await post("/api/speech/sample", persona ? { persona } : {});
    speakingSoon();
  }
  function stop() {
    post("/api/speech/stop");
    clearInterval(poll); queue = []; if (audio) { audio.pause(); audio = null; }
    st.speaking = false; document.body.classList.remove("speaking"); paint();
  }
  // While Umbra speaks: the speaker glows (click it to stop), and on Windows
  // the window fetches and plays the clips in turn.
  function speakingSoon() {
    st.speaking = true; document.body.classList.add("speaking"); paint();
    clearInterval(poll);
    // Until the first sentence is ready (the AI may still be thinking), keep waiting, up to two minutes.
    let idle = 0, started = false;
    const since = Date.now();
    poll = setInterval(async () => {
      const r = await fetch("/api/speech/pending").then((x) => x.json()).catch(() => null);
      if (!r) return;
      for (const c of r.clips || []) queue.push(c.url);
      if (r.speaking || queue.length || audio) started = true;
      playNext();
      if ((started || Date.now() - since > 120000) && !r.speaking && !queue.length && !audio) { if (++idle > 3) { clearInterval(poll); st.speaking = false; document.body.classList.remove("speaking"); paint(); } } else idle = 0;
    }, 500);
  }
  function playNext() {
    if (audio || !queue.length) return;
    audio = new Audio(queue.shift());
    audio.volume = Math.max(0, Math.min(1, st.speechVolume));
    audio.onended = audio.onerror = () => { audio = null; playNext(); };
    audio.play().catch(() => { audio = null; });
  }

  // A LISTEN button on an answer.
  function addListen(msg, rec) {
    const label = msg.querySelector(".label");
    if (!label || label.querySelector(".listen") || !rec?.answer) return;
    const b = document.createElement("button");
    b.type = "button"; b.className = "listen";
    b.title = "Listen|Umbra reads this answer aloud";
    b.innerHTML = `<span class="g">󰕾</span> LISTEN`;
    b.addEventListener("click", (e) => { e.stopPropagation(); Sound.click(); if (st.speaking) stop(); else say(rec.answer); });
    label.appendChild(b);
  }

  // Settings › UMBRA'S VOICE: the same choices, the install and removal.
  async function settingsPanel(box) {
    if (!box) return;
    await refresh();
    if (!box.isConnected) return;
    const ins = st.install || {};
    if (!st.installed) {
      box.innerHTML = `<div class="set-row"><span class="set-text"><b>Read answers aloud</b><small>A natural offline voice (Kokoro), each personality in its own. One download of ${st.downloadMB || 354} MB, then no internet needed.${ins.phase === "error" ? ` <b class="sp-err">${escapeHtml(ins.error)}</b>` : ""}</small></span>
        <button type="button" class="solid set-sp-install" ${ins.active ? "disabled" : ""}>${ins.active ? `DOWNLOADING… ${ins.total ? Math.round((ins.done / ins.total) * 100) : 0}%` : "⇣ GET THE VOICE"}</button></div>`;
      box.querySelector(".set-sp-install")?.addEventListener("click", async () => { Sound.click(); await install(); settingsPanel(box); });
      if (ins.active) setTimeout(() => settingsPanel(box), 1500);
      return;
    }
    box.innerHTML = `<label class="set-row"><span class="set-text"><b>Read aloud</b><small>Off, every answer, or only answers to questions you spoke (F9)</small></span>
        <select class="set-sp-mode">${MODES.map(([k, n]) => `<option value="${k}">${n === "OFF" ? "Off" : n === "ALWAYS" ? "Always" : "When I speak"}</option>`).join("")}</select></label>
      <label class="set-row"><span class="set-text"><b>Umbra's voice</b><small>Every other personality has its own voice</small></span>
        <select class="set-sp-gender"><option value="f">Female</option><option value="m">Male</option></select></label>
      <label class="set-row"><span class="set-text"><b>Voice volume</b><small>Separate from Umbra's sounds</small></span>
        <span class="set-audio-range"><input type="range" class="set-sp-vol" min="0" max="1" step="0.05"><output></output></span></label>
      <div class="set-row"><span class="set-text"><b>Hear it</b><small>A line in the current personality's voice; more in Profile › Personality</small></span>
        <span class="set-previews"><button type="button" class="ghost set-sp-hear">▶ HEAR</button><button type="button" class="ghost set-sp-stop">■ STOP</button></span></div>
      <div class="set-row"><span class="set-text"><b>Remove the voice</b><small>Frees about ${st.downloadMB || 354} MB; you can download it again any time</small></span>
        <button type="button" class="ghost warn set-sp-remove">REMOVE</button></div>`;
    const mode = box.querySelector(".set-sp-mode"), gender = box.querySelector(".set-sp-gender"), vol = box.querySelector(".set-sp-vol"), out = box.querySelector(".set-sp-vol + output");
    mode.value = st.speechMode; gender.value = st.speechGender; vol.value = st.speechVolume; out.textContent = Math.round(st.speechVolume * 100) + "%";
    mode.addEventListener("change", () => { st.speechMode = mode.value; window.postSettings?.({ speechMode: mode.value }); paint(); Sound.click(); });
    gender.addEventListener("change", async () => { st.speechGender = gender.value; await window.postSettings?.({ speechGender: gender.value }); paint(); sample("umbra"); });
    vol.addEventListener("input", () => { st.speechVolume = +vol.value; out.textContent = Math.round(st.speechVolume * 100) + "%"; });
    vol.addEventListener("change", () => window.postSettings?.({ speechVolume: st.speechVolume }));
    box.querySelector(".set-sp-hear").addEventListener("click", () => { Sound.click(); sample(); });
    box.querySelector(".set-sp-stop").addEventListener("click", () => { Sound.click(); stop(); });
    box.querySelector(".set-sp-remove").addEventListener("click", async () => {
      const ok = await confirmDialog({ kind: "to-local", tag: "VOICE", title: "REMOVE UMBRA'S VOICE?", body: "Umbra goes back to writing only. You can download the voice again any time.", ok: "REMOVE", cancel: "KEEP" });
      if (!ok) return;
      st = await post("/api/speech/remove"); paint(); settingsPanel(box);
    });
  }

  // The voice's colour: never the online colour (--net), so nobody thinks the
  // voice needs the internet. Of the theme's accent, its signal colour and a
  // violet, the one that stands furthest from --net.
  function voiceColour() {
    const css = getComputedStyle(document.documentElement), rgb = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec((c || "").trim()); return m ? [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)) : null; };
    const net = rgb(css.getPropertyValue("--net")), opts = [css.getPropertyValue("--accent"), "#b28cf0", css.getPropertyValue("--signal")].map((c) => c.trim()).filter(rgb);
    if (!net || !opts.length) return;
    const far = (c) => { const x = rgb(c); return Math.hypot(x[0] - net[0], x[1] - net[1], x[2] - net[2]); };
    const pick = opts.find((c) => far(c) > 140) || opts.sort((a, b) => far(b) - far(a))[0];
    if (document.documentElement.style.getPropertyValue("--voice") !== pick) document.documentElement.style.setProperty("--voice", pick);
  }
  voiceColour();
  new MutationObserver(() => setTimeout(voiceColour, 50)).observe(document.documentElement, { attributes: true, attributeFilter: ["style", "class", "data-theme"] });

  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && st.speaking && !document.querySelector(".modal:not([hidden])")) stop(); });
  build();
  refresh();
  setInterval(() => { if (document.hasFocus() && !st.installed && st.install?.active) refresh(); }, 4000);
  return { refresh, toggle, wants, heardVoice, say, sample, stop, addListen, settingsPanel, get state() { return st; } };
})();
