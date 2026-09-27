// Umbra Wiki profile: the user's name (Umbra calls them by it), a few lines
// about them, an ASCII character and an optional picture. Saved locally in
// ~/.config/umbra-wiki/profile.json. Shown as the PROFILE tab of the
// loadout (loadout.js calls UmbraProfile.render).
"use strict";

(() => {
  // Character parts, all 7 characters wide so every combination lines up.
  const PARTS = {
    top: [["Plain", " .---. "], ["Buzz cut", " .'''. "], ["Spiky", " /\\/\\/\\"], ["Beanie", " (===) "],
          ["Helmet", " [___] "], ["Hood", " /---\\ "], ["Wild", " ~~~~~ "], ["Cap", " .---=="]],
    eyes: [["Calm", "o o"], ["Wide", "O O"], ["Happy", "^ ^"], ["Sharp", "• •"], ["Wink", "o -"],
           ["Shades", "■-■"], ["Goggles", "0-0"]],
    mouth: [["Neutral", " - "], ["Smile", "\\_/"], ["Open", " o "], ["Smirk", " ~ "], ["Beard", "vvv"],
            ["Moustache", "~^~"], ["Mask", "[#]"]],
    body: [["Plain", "  / \\  "], ["Backpack", "  /#\\  "], ["Vest", " /[=]\\ "], ["Scarf", "  /~\\  "],
           ["Radio", "  / \\¤ "], ["Cape", " //_\\\\ "]],
  };
  const PART_LABELS = { top: "HEAD", eyes: "EYES", mouth: "MOUTH", body: "GEAR" };
  const pick = (part, i) => PARTS[part][((i || 0) % PARTS[part].length + PARTS[part].length) % PARTS[part].length];

  // [open, blink] frames, the same shape as the personality portraits.
  function art(ch = {}) {
    const eyes = pick("eyes", ch.eyes)[1];
    const frame = (e) => [pick("top", ch.top)[1], ` |${e}| `, ` |${pick("mouth", ch.mouth)[1]}| `, " '---' ", pick("body", ch.body)[1]];
    return [frame(eyes), frame(/[■0]/.test(eyes) ? eyes : "- -")];
  }

  const profile = { name: "", about: "", character: {}, picture: "" };
  const listeners = [];
  async function load() {
    try { Object.assign(profile, await (await fetch("/api/profile")).json()); } catch {}
    listeners.forEach((f) => f(profile));
  }

  // --------------------------------------------------------- the tab

  function render(grid, detail, animate) {
    const draft = JSON.parse(JSON.stringify(profile));
    draft.character = draft.character || {};
    let stop = null;

    grid.innerHTML = `<div class="pf-builder">
      <div class="lo-stage pf-stage"><pre class="lo-portrait"></pre></div>
      <div class="pf-parts"></div>
      <button class="ghost pf-random">⚄ RANDOMIZE</button>
    </div>`;
    const showArt = () => {
      if (stop) stop();
      stop = animate(grid.querySelector(".lo-portrait"), art(draft.character), "personality");
    };
    const parts = grid.querySelector(".pf-parts");
    for (const part of Object.keys(PARTS)) {
      const row = document.createElement("div");
      row.className = "pf-part";
      row.innerHTML = `<span class="lo-sk">${PART_LABELS[part]}</span>
        <button class="ghost pf-prev">◂</button><span class="pf-val"></span><button class="ghost pf-next">▸</button>`;
      const val = row.querySelector(".pf-val");
      const show = () => { val.textContent = pick(part, draft.character[part])[0].toUpperCase(); };
      const step = (d) => {
        const n = PARTS[part].length;
        draft.character[part] = (((draft.character[part] || 0) + d) % n + n) % n;
        show(); showArt(); Sound.click();
      };
      row.querySelector(".pf-prev").addEventListener("click", () => step(-1));
      row.querySelector(".pf-next").addEventListener("click", () => step(1));
      show();
      parts.appendChild(row);
    }
    grid.querySelector(".pf-random").addEventListener("click", () => {
      for (const part of Object.keys(PARTS)) draft.character[part] = Math.floor(Math.random() * PARTS[part].length);
      parts.querySelectorAll(".pf-part").forEach((row, i) => {
        row.querySelector(".pf-val").textContent = pick(Object.keys(PARTS)[i], draft.character[Object.keys(PARTS)[i]])[0].toUpperCase();
      });
      showArt();
      Sound.theme();
    });
    showArt();

    detail.innerHTML = `
      <div class="lo-ed-title">YOUR PROFILE</div>
      <div class="pf-pic-row">
        <button class="pf-pic" title="Choose a picture"><img alt="" hidden><span class="pf-pic-empty">+ PICTURE</span></button>
        <div class="pf-pic-side">
          <p class="lo-desc">Everything here stays on this computer. Umbra uses your name and the lines about you to talk to you more personally.</p>
          <button class="ghost pf-pic-remove" hidden>✕ REMOVE PICTURE</button>
        </div>
        <input type="file" class="pf-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      </div>
      <label class="lo-field"><span>NAME</span><input class="pf-name" maxlength="32" placeholder="What should Umbra call you?"></label>
      <label class="lo-field"><span>ABOUT YOU</span><textarea class="pf-about" maxlength="500" rows="4"
        placeholder="For example: I live in the countryside with my partner and two dogs, and I'm new to camping."></textarea></label>
      <div class="lo-actions"><button class="solid pf-save">SAVE PROFILE</button></div>
      <div class="pf-password">
        <div class="lo-ed-title">PASSWORD <span class="pf-pw-state"></span></div>
        <p class="lo-desc">Optional. Umbra asks for it when it starts and whenever you lock the screen. It keeps the screen private;
          it doesn't encrypt the files on this computer.</p>
        <label class="lo-field pf-pw-old" hidden><span>CURRENT PASSWORD</span><input type="password" class="pf-old" autocomplete="off"></label>
        <label class="lo-field"><span class="pf-new-label">NEW PASSWORD</span><input type="password" class="pf-new" autocomplete="off" maxlength="200"></label>
        <label class="lo-field"><span>REPEAT IT</span><input type="password" class="pf-new2" autocomplete="off" maxlength="200"></label>
        <div class="lo-actions"><small class="pf-pw-msg"></small><button class="ghost pf-pw-remove" hidden>REMOVE PASSWORD</button>
          <button class="solid pf-pw-set">SET PASSWORD</button></div>
      </div>
      <div class="pf-danger"><span>Start over: delete your profile, settings, custom items and every conversation.</span>
        <button class="ghost pf-reset">RESET UMBRA…</button></div>`;
    const q = (sel) => detail.querySelector(sel);
    q(".pf-name").value = draft.name || "";
    q(".pf-about").value = draft.about || "";
    const img = q(".pf-pic img");
    const showPic = () => {
      img.hidden = !draft.picture;
      if (draft.picture) img.src = draft.picture;
      q(".pf-pic-empty").hidden = !!draft.picture;
      q(".pf-pic-remove").hidden = !draft.picture;
    };
    showPic();
    q(".pf-pic").addEventListener("click", () => q(".pf-file").click());
    q(".pf-pic-remove").addEventListener("click", () => { draft.picture = ""; showPic(); Sound.click(); });
    q(".pf-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { draft.picture = await squarePicture(file); showPic(); Sound.theme(); } catch { Sound.error(); }
    });
    q(".pf-reset").addEventListener("click", () => window.resetUmbra && window.resetUmbra());
    // Password: set, change or remove (the current one is needed to change it).
    const pwMsg = (text, bad) => { const m = q(".pf-pw-msg"); m.textContent = text; m.classList.toggle("bad", !!bad); };
    const showPw = async () => {
      const has = !!(await fetch("/api/lock").then((r) => r.json()).catch(() => ({}))).password;
      q(".pf-pw-state").textContent = has ? "· ON" : "· OFF";
      q(".pf-pw-old").hidden = !has;
      q(".pf-pw-remove").hidden = !has;
      q(".pf-pw-set").textContent = has ? "CHANGE PASSWORD" : "SET PASSWORD";
      return has;
    };
    showPw();
    const sendPw = async (next) => {
      const r = await fetch("/api/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old: q(".pf-old").value, new: next }),
      }).then((x) => x.json()).catch(() => ({ error: "failed" }));
      ["pf-old", "pf-new", "pf-new2"].forEach((c) => (q("." + c).value = ""));
      if (r.error) { pwMsg(r.error === "wrong password" ? "The current password is wrong." : "Couldn't save it.", true); Sound.error(); return; }
      pwMsg(next ? "Password saved. Umbra will ask for it when it starts." : "Password removed.");
      Sound.theme();
      await showPw();
      if (window.refreshPasswordLock) window.refreshPasswordLock();
    };
    q(".pf-pw-set").addEventListener("click", () => {
      const a = q(".pf-new").value, b = q(".pf-new2").value;
      if (!a) { pwMsg("Type a new password first.", true); return; }
      if (a !== b) { pwMsg("The two passwords don't match.", true); Sound.error(); return; }
      sendPw(a);
    });
    q(".pf-pw-remove").addEventListener("click", () => sendPw(""));
    q(".pf-save").addEventListener("click", async () => {
      draft.name = q(".pf-name").value.trim();
      draft.about = q(".pf-about").value.trim();
      const res = await fetch("/api/profile", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft),
      }).catch(() => null);
      if (!res || !res.ok) { Sound.error(); return; }
      Object.assign(profile, await res.json());
      listeners.forEach((f) => f(profile));
      Sound.theme();
      const b = q(".pf-save");
      b.textContent = "SAVED ✓";
      setTimeout(() => { if (b.isConnected) b.textContent = "SAVE PROFILE"; }, 1600);
    });
    return () => { if (stop) stop(); };
  }

  // The picture is cropped to a square and shrunk, so it stays small.
  function squarePicture(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        const side = Math.min(im.width, im.height), size = 256;
        const c = document.createElement("canvas");
        c.width = c.height = size;
        c.getContext("2d").drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable image")); };
      im.src = url;
    });
  }

  window.UmbraProfile = {
    data: profile, art, render,
    onChange: (f) => { listeners.push(f); f(profile); },
  };
  load();
})();
