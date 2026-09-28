// Umbra Wiki profile: the user's name (Umbra calls them by it) and callsign,
// a few lines about them, where they are, their units, experience, household
// and health notes (all used to tailor answers), a name colour, an ASCII
// character, an optional picture, and a service record with their rank and
// pinned achievement badges. Saved locally in ~/.config/umbra-wiki/profile.json.
// Shown as the PROFILE tab of the loadout (loadout.js calls UmbraProfile.render).
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

  const profile = { name: "", callsign: "", about: "", location: "", units: "", experience: "", household: "",
                    health: "", blood: "", allergies: "", meds: "", contact: "", skills: [], color: "", badges: [], character: {}, picture: "" };
  const COLORS = [["", "Default"], ["signal", "Signal"], ["accent", "Accent"], ["net", "Network"], ["red", "Red"], ["fg-bright", "White"]];
  const TOPIC_NAMES = { water: "Water", fire: "Fire", shelter: "Shelter", medical: "First aid", food: "Food",
                        navigation: "Navigation", power: "Power", comms: "Radio", repair: "Repairs", weather: "Disasters" };
  const listeners = [];
  async function load() {
    try { Object.assign(profile, await (await fetch("/api/profile")).json()); } catch {}
    listeners.forEach((f) => f(profile));
  }

  // --------------------------------------------------------- the tab

  // Little ASCII animations beside each section, one frame list each; one
  // clock drives them all while the tab is open (still with Reduce motion).
  const ANIM = {
    id: ["((·))", "(( · ))", "((  ·  ))", "(( · ))"],
    place: ["  N  \n W+E \n  S  ", "  N  \n W×E \n  S  "].concat(["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"].map((a) => `  N  \n W${a}E \n  S  `)),
    units: ["|▾...|....|", "|.▾..|....|", "|..▾.|....|", "|...▾|....|", "|....▾....|", "|....|▾...|", "|....|.▾..|", "|....|..▾.|", "|....|...▾|"],
    exp: ["  ︿  \n     \n     ", "  ︿  \n  ︿  \n     ", "  ︿  \n  ︿  \n  ︿  ", "  ★  \n  ︿  \n  ︿  "],
    home: ["   (   \n  /\\ ) \n /__\\  \n |[]|  ", "    )  \n  /\\(  \n /__\\  \n |[]|  ", "   (   \n  /\\ ) \n /__\\  \n |[]|  "],
    health: [], skills: ["[■□□□]", "[■■□□]", "[■■■□]", "[■■■■]", "[□■■■]", "[□□■■]", "[□□□■]", "[□□□□]"],
    color: ["◐", "◓", "◑", "◒"],
    lock: [" .-. \n | | \n[###]", " .-. \n   | \n[###]", " .-. \n | | \n[#◆#]"],
  };
  // A heartbeat line that scrolls.
  const ECG = "___/\\_/‾\\____/\\/\\__";
  for (let i = 0; i < ECG.length; i++) ANIM.health.push((ECG.slice(i) + ECG.slice(0, i)).slice(0, 9));

  const SKILLS = [["firstaid", "First aid"], ["navigation", "Map & compass"], ["radio", "Radio"], ["fire", "Fire"],
    ["shelter", "Shelter"], ["water", "Water"], ["foraging", "Foraging"], ["hunting", "Hunting"], ["fishing", "Fishing"],
    ["cooking", "Cooking"], ["gardening", "Growing food"], ["mechanics", "Mechanics"], ["electrics", "Electrics"],
    ["carpentry", "Carpentry"], ["sewing", "Sewing"], ["defence", "Self-defence"]];
  const BLOOD = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  // What makes a profile complete (for the meter).
  const FIELDS = ["name", "callsign", "about", "location", "units", "experience", "household", "health", "blood", "allergies", "contact", "skills", "color", "picture"];
  const filled = (d) => FIELDS.filter((k) => (Array.isArray(d[k]) ? d[k].length : !!d[k])).length;

  function section(key, cat, title, line, body, color) {
    return `<section class="pf-sec" data-sec="${key}" style="--cat:${color}">
      <div class="pf-sec-head"><pre class="pf-anim" data-anim="${cat}"></pre><div><b>${title}</b><small>${line}</small></div></div>
      <div class="pf-sec-body">${body}</div></section>`;
  }

  function render(grid, detail, animate) {
    const draft = JSON.parse(JSON.stringify(profile));
    draft.character = draft.character || {};
    draft.skills = draft.skills || [];
    let stop = null;

    grid.innerHTML = `<div class="pf-left">
      <div class="pf-builder">
        <div class="lo-stage pf-stage"><pre class="lo-portrait"></pre><span class="pf-scan"></span></div>
        <div class="pf-parts"></div>
        <button class="ghost pf-random">⚄ RANDOMIZE</button>
      </div>
      <div class="pf-side">
        <div class="pf-tag"><div class="pf-tag-hole"></div><pre class="pf-tag-text"></pre></div>
        <div class="pf-meter"><div class="pf-meter-head"><span>PROFILE</span><b class="pf-meter-pct"></b></div>
          <div class="pf-meter-bar"></div><small class="pf-meter-next"></small></div>
      </div></div>
    <div class="pf-record"></div>`;
    renderRecord(grid.querySelector(".pf-record"));
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
        show(); showArt(); tag(); Sound.click();
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
      showArt(); tag();
      Sound.theme();
    });
    showArt();

    const C = (hex) => `color-mix(in oklab, ${hex} 78%, var(--fg))`;
    detail.innerHTML = `
      <div class="lo-ed-title">YOUR PROFILE</div>
      <p class="lo-desc pf-lead">Everything here stays on this computer. Umbra uses it to talk to you personally and to fit its answers to you and your people.</p>
      ${section("id", "id", "IDENTITY", "Who you are, and what Umbra calls you", `
        <div class="pf-pic-row">
          <button class="pf-pic" title="Choose a picture"><img alt="" hidden><span class="pf-pic-empty">+ PICTURE</span></button>
          <div class="pf-pic-side"><div class="pf-two pf-names">
            <label class="lo-field"><span>NAME</span><input class="pf-name" maxlength="32" placeholder="What should Umbra call you?"></label>
            <label class="lo-field"><span>CALLSIGN</span><input class="pf-callsign" maxlength="24" placeholder="e.g. Nomad-7"></label></div>
            <button class="ghost pf-pic-remove" hidden>✕ REMOVE PICTURE</button></div>
          <input type="file" class="pf-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
        </div>
        <label class="lo-field"><span>ABOUT YOU</span><textarea class="pf-about" maxlength="500" rows="3"
          placeholder="For example: I live in the countryside with my partner and two dogs, and I'm new to camping."></textarea></label>`, C("#36aec8"))}
      ${section("place", "place", "WHERE YOU ARE", "Climate and region change the advice", `
        <label class="lo-field"><span>REGION AND CLIMATE</span><input class="pf-location" maxlength="80"
          placeholder="e.g. Northern Europe, wet and cold winters"></label>
        <div class="lo-field"><span>UNITS <pre class="pf-anim pf-inline" data-anim="units"></pre></span><div class="pf-choice pf-units">
          <button type="button" data-v="">AUTO</button><button type="button" data-v="metric">METRIC</button><button type="button" data-v="imperial">IMPERIAL</button></div></div>`, C("#4fb86a"))}
      ${section("exp", "exp", "EXPERIENCE & SKILLS", "Umbra skips what you know, explains what you don't", `
        <div class="lo-field"><span>EXPERIENCE</span><div class="pf-choice pf-exp">
          <button type="button" data-v="new">NEW</button><button type="button" data-v="some">SOME</button><button type="button" data-v="experienced">SEASONED</button></div></div>
        <div class="lo-field"><span>SKILLS YOU HAVE <pre class="pf-anim pf-inline" data-anim="skills"></pre></span>
          <div class="pf-skills">${SKILLS.map(([k, n]) => `<button type="button" class="pf-skill" data-k="${k}">${n}</button>`).join("")}</div></div>`, C("#d9b235"))}
      ${section("home", "home", "HOUSEHOLD", "Who you look after: answers and supplies plan for them", `
        <label class="lo-field"><span>WHO LIVES WITH YOU</span><input class="pf-household" maxlength="160"
          placeholder="e.g. 2 adults, a child of 6, a dog"></label>
        <label class="lo-field"><span>EMERGENCY CONTACT</span><input class="pf-contact" maxlength="80"
          placeholder="Name and phone, for your ID card"></label>`, C("#e8892a"))}
      ${section("health", "health", "HEALTH", "Kept in mind for medical and food advice, and on your ID card", `
        <div class="pf-two">
          <div class="lo-field"><span>BLOOD TYPE</span><div class="pf-blood">${BLOOD.map((b) => `<button type="button" data-v="${b}">${b || "?"}</button>`).join("")}</div></div>
          <label class="lo-field"><span>ALLERGIES</span><input class="pf-allergies" maxlength="160" placeholder="e.g. penicillin, peanuts"></label></div>
        <label class="lo-field"><span>MEDICATION</span><input class="pf-meds" maxlength="160" placeholder="What you take regularly (optional)"></label>
        <label class="lo-field"><span>OTHER HEALTH NOTES</span><textarea class="pf-health" maxlength="300" rows="2"
          placeholder="Conditions or limits Umbra should keep in mind (optional)"></textarea></label>`, C("#e0493f"))}
      ${section("color", "color", "NAME COLOUR", "How your name shows in the chat", `
        <div class="pf-colors">${COLORS.map(([v, label]) =>
          `<button type="button" class="pf-color" data-v="${v}" title="${label}" style="--c: var(--${v || "fg-bright"})"><i></i></button>`).join("")}
          <span class="pf-color-preview"></span></div>`, C("#a77ce8"))}
      <div class="lo-actions pf-save-row"><small class="pf-dirty"></small><button class="solid pf-save">SAVE PROFILE</button></div>
      ${section("lock", "lock", "PASSWORD", "Optional: keeps the screen (and the Vault) private", `
        <p class="lo-desc">Umbra asks for it when it starts and whenever you lock the screen. It keeps the screen private;
          it doesn't encrypt the files on this computer. <span class="pf-pw-state"></span></p>
        <label class="lo-field pf-pw-old" hidden><span>CURRENT PASSWORD</span><input type="password" class="pf-old" autocomplete="off"></label>
        <div class="pf-two"><label class="lo-field"><span class="pf-new-label">NEW PASSWORD</span><input type="password" class="pf-new" autocomplete="off" maxlength="200"></label>
          <label class="lo-field"><span>REPEAT IT</span><input type="password" class="pf-new2" autocomplete="off" maxlength="200"></label></div>
        <div class="lo-actions"><small class="pf-pw-msg"></small><button class="ghost pf-pw-remove" hidden>REMOVE PASSWORD</button>
          <button class="solid pf-pw-set">SET PASSWORD</button></div>`, C("#8a93a6"))}
      <div class="pf-danger"><span>Start over: delete your profile, achievements, settings, custom items and every conversation.</span>
        <button class="ghost pf-reset">RESET UMBRA…</button></div>`;
    const q = (sel) => detail.querySelector(sel);
    for (const k of ["name", "callsign", "about", "location", "household", "health", "allergies", "meds", "contact"]) q(".pf-" + k).value = draft[k] || "";
    const read = () => { for (const k of ["name", "callsign", "about", "location", "household", "health", "allergies", "meds", "contact"]) draft[k] = q(".pf-" + k).value.trim(); };
    let dirty = false;
    const changed = () => { read(); dirty = true; q(".pf-dirty").textContent = "Unsaved changes"; tag(); };
    detail.querySelectorAll("input:not([type=password]):not([type=file]), textarea").forEach((el) => el.addEventListener("input", changed));

    // Units, experience, blood type and name colour are picked with buttons.
    const choice = (sel, key, toggleOff) => {
      const box = q(sel);
      const show = () => box.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.v === (draft[key] || "")));
      box.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        draft[key] = draft[key] === b.dataset.v && toggleOff ? "" : b.dataset.v;
        show(); changed(); Sound.click();
      }));
      show();
    };
    choice(".pf-units", "units");
    choice(".pf-exp", "experience", true);
    choice(".pf-blood", "blood", true);
    detail.querySelectorAll(".pf-skill").forEach((b) => {
      b.classList.toggle("on", draft.skills.includes(b.dataset.k));
      b.addEventListener("click", () => {
        const on = !draft.skills.includes(b.dataset.k);
        draft.skills = on ? [...draft.skills, b.dataset.k] : draft.skills.filter((k) => k !== b.dataset.k);
        b.classList.toggle("on", on); changed(); on ? Sound.found() : Sound.click();
      });
    });
    const preview = () => {
      const p = q(".pf-color-preview");
      p.textContent = ((q(".pf-name").value.trim() || "YOU") + (q(".pf-callsign").value.trim() ? " · " + q(".pf-callsign").value.trim() : "")).toUpperCase();
      p.style.color = draft.color ? `var(--${draft.color})` : "";
      detail.querySelectorAll(".pf-color").forEach((b) => b.classList.toggle("on", b.dataset.v === (draft.color || "")));
    };
    detail.querySelectorAll(".pf-color").forEach((b) => b.addEventListener("click", () => { draft.color = b.dataset.v; preview(); changed(); Sound.click(); }));
    q(".pf-name").addEventListener("input", preview);
    q(".pf-callsign").addEventListener("input", preview);
    preview();
    const img = q(".pf-pic img");
    const showPic = () => {
      img.hidden = !draft.picture;
      if (draft.picture) img.src = draft.picture;
      q(".pf-pic-empty").hidden = !!draft.picture;
      q(".pf-pic-remove").hidden = !draft.picture;
    };
    showPic();
    q(".pf-pic").addEventListener("click", () => q(".pf-file").click());
    q(".pf-pic-remove").addEventListener("click", () => { draft.picture = ""; showPic(); changed(); Sound.click(); });
    q(".pf-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try { draft.picture = await squarePicture(file); showPic(); changed(); Sound.theme(); } catch { Sound.error(); }
    });
    q(".pf-reset").addEventListener("click", () => window.resetUmbra && window.resetUmbra());

    // The dog tag: a live preview of what you've filled in.
    function tag() {
      const t = grid.querySelector(".pf-tag-text");
      if (!t) return;
      const up = (v, n) => String(v || "—").toUpperCase().slice(0, n);
      const lines = [
        up(draft.name || "NAME", 18), up(draft.callsign, 18), "",
        `BLOOD ${up(draft.blood, 3)}  ${draft.units === "imperial" ? "IMP" : draft.units === "metric" ? "MET" : "AUT"}`,
        `ALRG ${up(draft.allergies || "NONE", 13)}`, up(draft.location, 18),
        `ICE ${up(draft.contact, 14)}`,
      ];
      t.textContent = lines.join("\n");
      const n = filled(draft), pct = Math.round((n / FIELDS.length) * 100);
      grid.querySelector(".pf-meter-pct").textContent = pct + "%";
      grid.querySelector(".pf-meter-bar").innerHTML = FIELDS.map((k) => `<i class="${(Array.isArray(draft[k]) ? draft[k].length : draft[k]) ? "on" : ""}"></i>`).join("");
      const missing = FIELDS.find((k) => !(Array.isArray(draft[k]) ? draft[k].length : draft[k]));
      const HINT = { name: "Add your name", callsign: "Pick a callsign", about: "Say a little about yourself", location: "Add where you are",
        units: "Choose your units", experience: "Set your experience", household: "Add your household", health: "Add health notes (or 'none')",
        blood: "Add your blood type", allergies: "Add allergies (or 'none')", contact: "Add an emergency contact", skills: "Mark the skills you have",
        color: "Pick a name colour", picture: "Add a picture" };
      grid.querySelector(".pf-meter-next").textContent = missing ? "NEXT: " + HINT[missing].toUpperCase() : "COMPLETE · WELL PREPARED";
    }
    tag();

    // One clock for the section animations.
    let f = 0;
    const anims = [...detail.querySelectorAll(".pf-anim")];
    const tick = () => {
      f++;
      for (const a of anims) { const fr = ANIM[a.dataset.anim]; if (fr && fr.length) a.textContent = fr[(document.body.classList.contains("reduce-motion") ? 0 : f) % fr.length]; }
    };
    tick();
    const clock = setInterval(() => { if (!detail.isConnected) { clearInterval(clock); return; } tick(); }, 260);

    // Password: set, change or remove (the current one is needed to change it).
    const pwMsg = (text, bad) => { const m = q(".pf-pw-msg"); m.textContent = text; m.classList.toggle("bad", !!bad); };
    const showPw = async () => {
      const has = !!(await fetch("/api/lock").then((r) => r.json()).catch(() => ({}))).password;
      q(".pf-pw-state").textContent = has ? "Password is ON." : "No password set.";
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
      read();
      draft.badges = profile.badges || [];   // pinned in the achievements tab meanwhile
      if (!(await save(draft))) { Sound.error(); return; }
      Sound.theme();
      dirty = false;
      q(".pf-dirty").textContent = "";
      const b = q(".pf-save");
      b.textContent = "SAVED ✓";
      grid.querySelector(".pf-tag").classList.remove("stamp"); void grid.offsetWidth; grid.querySelector(".pf-tag").classList.add("stamp");
      setTimeout(() => { if (b.isConnected) b.textContent = "SAVE PROFILE"; }, 1600);
    });
    return () => { if (stop) stop(); clearInterval(clock); };
  }

  async function save(next) {
    const res = await fetch("/api/profile", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next),
    }).catch(() => null);
    if (!res || !res.ok) return false;
    Object.assign(profile, await res.json());
    listeners.forEach((f) => f(profile));
    if (window.UmbraAchievements) UmbraAchievements.check();
    return true;
  }
  // Change a few fields (e.g. the pinned badges) and save.
  const update = (fields) => save({ ...profile, ...fields });

  // The service record: rank and points, a few numbers, and the badges
  // pinned from the ACHIEVEMENTS tab.
  async function renderRecord(box) {
    if (!box) return;
    const A = window.UmbraAchievements;
    const data = (A && (A.data || await A.load())) || null;
    if (!data || !box.isConnected) return;
    const earned = data.achievements.filter((a) => a.earned);
    const pinned = (profile.badges || []).map((id) => earned.find((a) => a.id === id)).filter(Boolean);
    const since = profile.since ? new Date(profile.since).toLocaleDateString(undefined, { month: "short", year: "numeric" }) : "today";
    box.innerHTML = `<div class="lo-ed-title">SERVICE RECORD</div>
      <div class="pf-rank"><b>${escapeHtml(data.rank.toUpperCase())}</b><span>${data.points} PTS · ${earned.length}/${data.achievements.length} EARNED</span></div>
      <div class="pf-stats">
        <span><small>QUESTIONS</small><b>${data.stats.questions}</b></span>
        <span><small>BEST STREAK</small><b>${data.stats.streak} ${data.stats.streak === 1 ? "DAY" : "DAYS"}</b></span>
        <span><small>FAVOURITE</small><b>${escapeHtml((TOPIC_NAMES[data.stats.favourite] || "—").toUpperCase())}</b></span>
        <span><small>SINCE</small><b>${escapeHtml(since.toUpperCase())}</b></span>
      </div>
      <div class="pf-badges">${pinned.length ? pinned.map((a) => `<span class="pf-badge" title="${escapeHtml(a.name)}">${A.badge(a)}</span>`).join("")
        : `<span class="pf-badges-empty">Pin up to 5 earned badges here from ACHIEVEMENTS.</span>`}</div>
      <button class="ghost pf-to-ach">◆ ACHIEVEMENTS</button>`;
    box.querySelector(".pf-to-ach").addEventListener("click", () => window.openLoadout && window.openLoadout("achievements"));
  }
  const refreshRecord = () => renderRecord(document.querySelector("#loadout .pf-record"));

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
    data: profile, art, render, update, refreshRecord,
    onChange: (f) => { listeners.push(f); f(profile); },
  };
  load();
})();
