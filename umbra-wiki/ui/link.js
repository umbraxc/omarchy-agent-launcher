// Umbra Wiki link panel: clicking LINK in the header. What LOCAL means, what
// going ONLINE adds and exactly what leaves the computer, a warning that a
// transmitting device can be noticed, and a live radar. Going online takes
// an "I understand" and plays an uplink sequence (with a real connection
// check); going back plays the radio going silent. Loaded after app.js
// (uses $, Sound, escapeHtml, setOnline, online, controller, locked) and orbs.js.
"use strict";

window.UmbraLink = (() => {
  let box = null, stopRadar = null;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const calm = () => document.body.classList.contains("reduce-motion") || window.offgrid;
  const sentOnline = () => [...document.querySelectorAll("#feed .msg.user .label")].filter((l) => /ONLINE/.test(l.textContent)).length;

  const ROW = (on, name, where) => `<div class="lp-row ${on ? "on" : ""}"><b>[${on ? "■" : " "}]</b><span>${name}</span><i></i><em>${where}</em></div>`;

  function shell(state) {
    close(true);
    box = document.createElement("div");
    box.className = "linkpanel-shade";
    box.innerHTML = `<div class="linkpanel ${state}" role="dialog" aria-label="Link">
      <div class="lp-head"><span class="lp-title"></span><button class="lp-x" title="Close · Esc">✕</button></div>
      <div class="lp-body"><div class="lp-left"><pre class="orb lp-radar"></pre><div class="lp-radar-cap"></div></div><div class="lp-right"></div></div>
      <div class="lp-foot"></div></div>`;
    document.body.appendChild(box);
    box.querySelector(".lp-x").addEventListener("click", () => close());
    box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
    document.addEventListener("keydown", esc, true);
    if (window.umbraOrb) stopRadar = window.umbraOrb(box.querySelector(".lp-radar"), 17, 12, "radar");
    Sound.glitch();
    return box.querySelector(".linkpanel");
  }
  function esc(e) { if (e.key === "Escape" && box) { e.preventDefault(); e.stopImmediatePropagation(); close(); } }
  function close(quiet) {
    if (stopRadar) { stopRadar(); stopRadar = null; }
    document.removeEventListener("keydown", esc, true);
    if (box) { box.remove(); box = null; if (!quiet) Sound.click(); }
  }

  // ------------------------------------------------------- the panel

  function showLocal() {
    const p = shell("local");
    p.querySelector(".lp-title").textContent = "◆ LINK · LOCAL";
    p.querySelector(".lp-radar-cap").innerHTML = `<b>RADIO SILENCE</b><small>Umbra sends nothing. Everything runs on this computer.</small>`;
    p.querySelector(".lp-right").innerHTML = `
      <div class="lp-sec"><small>RIGHT NOW</small>
        ${ROW(true, "AI", "ON THIS COMPUTER")}${ROW(true, "LIBRARY", "ON THIS COMPUTER")}${ROW(true, "MAPS & TOOLS", "ON THIS COMPUTER")}${ROW(false, "INTERNET", "NOT USED")}</div>
      <div class="lp-sec"><small>GOING ONLINE ADDS</small>
        <ul><li><b>Wikipedia</b> for every question: fuller, more current answers.</li>
        <li>Answers say which facts came from where. Your library and the AI keep working as before.</li></ul></div>
      <div class="lp-sec"><small>WHAT LEAVES THIS COMPUTER</small>
        <ul><li>The <b>search words</b> of each question, to Wikipedia, over an encrypted connection (HTTPS).</li>
        <li>Wikipedia sees your <b>network address (IP)</b>; your network and provider can see that you contact Wikipedia.</li>
        <li><b>Nothing else</b>: not your conversations, profile, health notes, location, vault or files.</li></ul></div>
      <div class="lp-warn"><pre class="lp-warn-art"></pre><div><b>RADIO SILENCE BROKEN</b>
        <small>Online, this device transmits. Other devices on the network, your provider or anyone listening on the airwaves can notice it. If you must not be found, stay LOCAL.</small></div></div>
      <label class="lp-agree"><input type="checkbox"> I understand what goes online.</label>`;
    p.querySelector(".lp-foot").innerHTML = `<button class="ghost lp-stay">STAY LOCAL</button><button class="solid lp-go" disabled>GO ONLINE ▸</button>`;
    warnArt(p.querySelector(".lp-warn-art"));
    const go = p.querySelector(".lp-go");
    p.querySelector(".lp-agree input").addEventListener("change", (e) => { go.disabled = !e.target.checked; Sound.click(); });
    p.querySelector(".lp-stay").addEventListener("click", () => close());
    go.addEventListener("click", () => uplink(p));
  }

  function showOnline() {
    const p = shell("online");
    p.querySelector(".lp-title").textContent = "◆ LINK · ONLINE";
    p.querySelector(".lp-radar-cap").innerHTML = `<b class="warn">TRANSMITTING</b><small>This device is talking to the internet.</small>`;
    p.querySelector(".lp-right").innerHTML = `
      <div class="lp-sec"><small>RIGHT NOW</small>
        ${ROW(true, "AI", "ON THIS COMPUTER")}${ROW(true, "LIBRARY", "ON THIS COMPUTER")}${ROW(true, "WIKIPEDIA", "OVER THE INTERNET")}
        <div class="lp-stats"><span>LATENCY <b class="lp-ms">…</b></span><span>QUESTIONS SENT ONLINE <b>${sentOnline()}</b></span></div></div>
      <div class="lp-sec"><small>GOING LOCAL</small>
        <ul><li>Wikipedia is switched off at once; answers come from your library and the AI only.</li>
        <li>Nothing more leaves this computer. Every launch starts LOCAL anyway.</li></ul></div>`;
    p.querySelector(".lp-foot").innerHTML = `<button class="ghost lp-stay">STAY ONLINE</button><button class="solid lp-dark">GO DARK ▸</button>`;
    fetch("/api/netinfo").then((r) => r.json()).then((n) => { const el = p.querySelector(".lp-ms"); if (el) el.textContent = n.online ? `${n.ms} MS` : "NO CONNECTION"; }).catch(() => {});
    p.querySelector(".lp-stay").addEventListener("click", () => close());
    p.querySelector(".lp-dark").addEventListener("click", () => goDark(p));
  }

  // A small signal mast with waves going out.
  function warnArt(pre) {
    let k = 0;
    const draw = () => {
      if (!pre.isConnected) return;
      const w = ["   ", " ) ", " )) ", " ))) "][k % 4];
      pre.textContent = `  |${w}\n /|\\\n/ | \\`;
      k++;
      setTimeout(draw, calm() ? 1500 : 420);
    };
    draw();
  }

  // ------------------------------------------------------ switching

  // A console that types lines out, and a link bar that fills or drains.
  async function sequence(p, lines, fill) {
    const right = p.querySelector(".lp-right");
    right.innerHTML = `<pre class="lp-console"></pre><pre class="lp-bar"></pre>`;
    p.querySelector(".lp-foot").innerHTML = "";
    const con = right.querySelector(".lp-console"), barEl = right.querySelector(".lp-bar");
    const bar = (k) => { const n = 26, on = Math.round(k * n); barEl.textContent = `LOCAL ◀${"━".repeat(on)}${"─".repeat(n - on)}▶ ONLINE`; };
    bar(fill ? 0 : 1);
    for (const [text, fn] of lines) {
      con.textContent += "> ";
      for (const ch of text) { con.textContent += ch; if (!calm()) await wait(12); }
      const res = fn ? await fn() : "";
      if (res) con.textContent += " " + res;
      con.textContent += "\n";
      Sound.key();
      if (!calm()) await wait(160);
    }
    for (let i = 0; i <= 10; i++) { bar(fill ? i / 10 : 1 - i / 10); if (!calm()) await wait(40); }
    return con;
  }

  async function uplink(p) {
    p.className = "linkpanel switching";
    p.querySelector(".lp-title").textContent = "◆ ESTABLISHING UPLINK";
    p.querySelector(".lp-radar-cap").innerHTML = `<b class="warn">OPENING A CHANNEL</b><small>Checking that the internet can be reached.</small>`;
    $("#link-label").textContent = "LINKING…";
    let ok = false, ms = null;
    const con = await sequence(p, [
      ["POWERING TRANSMITTER", () => wait(250).then(() => "OK")],
      ["REACHING WIKIPEDIA", async () => {
        const t0 = performance.now();
        try { ok = (await (await fetch("/api/netcheck")).json()).online; } catch { ok = false; }
        ms = Math.round(performance.now() - t0);
        return ok ? `OK · ${ms} MS` : "NO ANSWER";
      }],
      ["ENCRYPTING (HTTPS)", () => wait(150).then(() => (ok ? "OK" : "—"))],
    ], true);
    if (!ok) {
      setOnline(false);
      con.textContent += "> UPLINK FAILED. STAYING LOCAL.\n";
      p.className = "linkpanel failed";
      p.querySelector(".lp-title").textContent = "◆ NO CONNECTION";
      p.querySelector(".lp-radar-cap").innerHTML = `<b class="bad">NO SIGNAL</b><small>Wikipedia couldn't be reached. Check your connection and try again.</small>`;
      p.querySelector(".lp-foot").innerHTML = `<button class="solid lp-ok">OK</button>`;
      p.querySelector(".lp-ok").addEventListener("click", () => close());
      Sound.error();
      return;
    }
    con.textContent += "> LINK ESTABLISHED. YOU ARE ONLINE.\n";
    setOnline(true);
    Sound.online();
    flash("online");
    await wait(calm() ? 200 : 900);
    close(true);
  }

  async function goDark(p) {
    p.className = "linkpanel switching dark";
    p.querySelector(".lp-title").textContent = "◆ CUTTING UPLINK";
    p.querySelector(".lp-radar-cap").innerHTML = `<b>GOING DARK</b><small>Closing the connection.</small>`;
    const con = await sequence(p, [["CLOSING CHANNEL", () => wait(200).then(() => "OK")], ["TRANSMITTER OFF", () => wait(150).then(() => "OK")]], false);
    setOnline(false);
    con.textContent += "> RADIO SILENCE RESTORED. YOU ARE LOCAL.\n";
    Sound.local();
    flash("local");
    await wait(calm() ? 200 : 800);
    close(true);
  }

  // The header's LINK cell flashes as it changes.
  function flash(kind) {
    const el = $("#link");
    el.classList.remove("lp-flash-online", "lp-flash-local"); void el.offsetWidth;
    el.classList.add("lp-flash-" + kind);
  }

  function open() {
    if (controller || locked) return;   // not while an answer is being written
    online ? showOnline() : showLocal();
  }
  return { open, close };
})();
