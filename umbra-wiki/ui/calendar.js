// Umbra Wiki calendar: the Field Kit's CALENDAR tab. A month to browse,
// your reminders in six colours and four levels of importance (with
// repeats), and what Umbra works out by itself: when stored water and food
// run out, best-before dates, first-aid timers and the moon's phases.
// Reminders ring (a chime and a note) at their time, or at 09:00 for a
// whole-day one, while Umbra is open. Loaded after app.js and fieldkit.js.
"use strict";

window.UmbraCalendar = (() => {
  const COLORS = { signal: "var(--signal)", red: "var(--red)", accent: "var(--accent)", green: "color-mix(in oklab, #4fb86a 80%, var(--fg))", net: "var(--net)", violet: "color-mix(in oklab, #a77ce8 80%, var(--fg))" };
  const IMPORTANCE = [null, ["LOW", "·"], ["NORMAL", "•"], ["HIGH", "▲"], ["CRITICAL", "◆"]];
  const REPEAT = { "": "Once", daily: "Every day", weekly: "Every week", monthly: "Every month", yearly: "Every year" };
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const post = (url, data) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }).then((r) => r.json());

  let events = [], auto = [], view = new Date(), sel = ymd(new Date()), editing = null;

  async function load() {
    try { events = (await (await fetch("/api/calendar")).json()).events || []; } catch { events = []; }
    auto = await autoEvents();
  }
  // Does an event happen on a day (repeats included)?
  function on(e, day) {
    if (e.date === day) return true;
    if (!e.repeat || day < e.date) return false;
    const a = parse(e.date), b = parse(day);
    if (e.repeat === "daily") return true;
    if (e.repeat === "weekly") return Math.round((b - a) / 864e5) % 7 === 0;
    if (e.repeat === "monthly") return a.getDate() === b.getDate();
    if (e.repeat === "yearly") return a.getDate() === b.getDate() && a.getMonth() === b.getMonth();
    return false;
  }
  const dayEvents = (day) => [...events.filter((e) => on(e, day)), ...auto.filter((e) => e.date === day)]
    .sort((x, y) => (x.time || "99").localeCompare(y.time || "99") || y.importance - x.importance);

  // What Umbra adds by itself.
  async function autoEvents() {
    const out = [], today = new Date();
    const add = (d, title, note, color, importance, kind, time = "") => out.push({ id: "auto-" + kind + out.length, date: ymd(d), time, title, note, color, importance, auto: kind });
    try {
      const f = window.UmbraFieldKit && UmbraFieldKit.forecast ? await UmbraFieldKit.forecast() : null;
      if (f) {
        for (const [days, what, color] of [[f.waterDays, "Water", "net"], [f.foodDays, "Food", "accent"]]) {
          if (days == null) continue;
          const end = new Date(today.getTime() + days * 864e5);
          add(end, `${what} runs out`, `At today's use your stored ${what.toLowerCase()} lasts about ${days < 1 ? Math.round(days * 24) + " hours" : days.toFixed(1) + " days"} (Field Kit → Supplies).`, color, days < 3 ? 4 : days < 7 ? 3 : 2, what.toLowerCase());
          if (days > 3) add(new Date(end.getTime() - 3 * 864e5), `${what}: 3 days left`, "Time to restock or ration.", color, 3, what.toLowerCase() + "3");
        }
        for (const it of f.items) add(parse(it.expires), `Best before: ${it.name}`, "Use it or rotate it (Field Kit → Supplies).", "violet", it.expires < ymd(today) ? 3 : 2, "exp");
        for (const t of f.timers) {
          const due = new Date(t.at + t.secs * 1000);
          add(due, `${t.name} ${t.up ? "check" : "done"}`, `First-aid timer started at ${new Date(t.at).toTimeString().slice(0, 5)}.`, "red", 4, "timer", `${pad(due.getHours())}:${pad(due.getMinutes())}`);
        }
      }
      const A = window.UmbraFieldKit && UmbraFieldKit.astro;
      if (A) {
        // Full and new moons over the next two months.
        let prev = A.moonLight(today).phase;
        for (let h = 6; h < 24 * 62; h += 6) {
          const d = new Date(today.getTime() + h * 36e5), p = A.moonLight(d).phase;
          if (prev < 0.5 && p >= 0.5) add(d, "Full moon", "Bright nights: good for moving without a torch, bad for staying unseen.", "signal", 1, "moon");
          if (prev > 0.9 && p < 0.1) add(d, "New moon", "The darkest nights of the month.", "signal", 1, "moon");
          prev = p;
        }
      }
    } catch {}
    return out;
  }

  // ------------------------------------------------------------ render

  async function render(box) {
    await load();
    draw(box);
  }
  function draw(box) {
    const y = view.getFullYear(), m = view.getMonth(), today = ymd(new Date());
    const first = new Date(y, m, 1), start = new Date(y, m, 1 - ((first.getDay() + 6) % 7));
    const cells = [];
    for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
    const upcoming = [];
    for (let i = 0; i < 21 && upcoming.length < 12; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      for (const e of dayEvents(ymd(d))) if (!e.done) upcoming.push([ymd(d), e]);
    }
    box.innerHTML = `<div class="cal">
      <section class="fk-card cal-month">
        <div class="cal-head"><button class="ghost cal-prev" title="Previous month">◂</button>
          <div class="cal-title"><select class="cal-m">${MONTHS.map((n, i) => `<option value="${i}" ${i === m ? "selected" : ""}>${n.toUpperCase()}</option>`).join("")}</select>
            <input class="cal-y" type="number" min="1900" max="2200" value="${y}"></div>
          <button class="ghost cal-next" title="Next month">▸</button><button class="ghost cal-today">TODAY</button></div>
        <div class="cal-grid">${DAYS.map((d) => `<div class="cal-dow">${d}</div>`).join("")}
          ${cells.map((d) => {
            const k = ymd(d), evs = dayEvents(k);
            return `<button class="cal-day ${d.getMonth() !== m ? "out" : ""} ${k === today ? "today" : ""} ${k === sel ? "sel" : ""}" data-d="${k}">
              <b>${d.getDate()}</b><span class="cal-dots">${evs.slice(0, 4).map((e) => `<i class="imp${e.importance} ${e.done ? "done" : ""}" style="--c:${COLORS[e.color] || COLORS.signal}" title="${escapeHtml(e.title)}"></i>`).join("")}${evs.length > 4 ? `<em>+${evs.length - 4}</em>` : ""}</span>
              ${evs.filter((e) => e.importance >= 3 && !e.done).slice(0, 1).map((e) => `<span class="cal-chip" style="--c:${COLORS[e.color]}">${escapeHtml(e.title)}</span>`).join("")}</button>`;
          }).join("")}</div>
        <div class="cal-legend"><span><i style="--c:var(--net)"></i>WATER</span><span><i style="--c:var(--accent)"></i>FOOD</span><span><i style="--c:${COLORS.violet}"></i>BEST BEFORE</span>
          <span><i style="--c:var(--red)"></i>TIMERS</span><span><i style="--c:var(--signal)"></i>MOON</span><span class="cal-auto-note">Worked out by Umbra from your supplies, timers and the sky.</span></div>
      </section>
      <section class="fk-card cal-side">
        <div class="fk-h cal-dayname">${parse(sel).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase()}</div>
        <div class="cal-list">${dayEvents(sel).map((e) => row(e, sel)).join("") || `<p class="lib-note">Nothing on this day.</p>`}</div>
        <div class="cal-form">${form()}</div>
        <div class="fk-h cal-up">COMING UP</div>
        <div class="cal-upcoming">${upcoming.map(([d, e]) => `<div class="cal-urow" data-d="${d}"><b>${d === today ? "TODAY" : parse(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).toUpperCase()}</b><i style="--c:${COLORS[e.color]}"></i><span></span><small>${e.time || ""}</small></div>`).join("") || `<p class="lib-note">Nothing in the next three weeks.</p>`}</div>
      </section></div>`;
    box.querySelectorAll(".cal-urow").forEach((r, i) => { r.querySelector("span").textContent = upcoming[i][1].title; r.addEventListener("click", () => { sel = r.dataset.d; view = parse(sel); draw(box); Sound.click(); }); });
    const q = (s) => box.querySelector(s);
    const month = (dm) => { view = new Date(view.getFullYear(), view.getMonth() + dm, 1); draw(box); Sound.click(); };
    q(".cal-prev").addEventListener("click", () => month(-1));
    q(".cal-next").addEventListener("click", () => month(1));
    q(".cal-today").addEventListener("click", () => { view = new Date(); sel = ymd(view); draw(box); Sound.click(); });
    q(".cal-m").addEventListener("change", (e) => { view = new Date(view.getFullYear(), +e.target.value, 1); draw(box); });
    q(".cal-y").addEventListener("change", (e) => { const yy = Math.max(1900, Math.min(2200, +e.target.value || view.getFullYear())); view = new Date(yy, view.getMonth(), 1); draw(box); });
    q(".cal-y").addEventListener("keydown", (e) => e.stopPropagation());
    box.querySelectorAll(".cal-day").forEach((b) => {
      b.addEventListener("click", () => { sel = b.dataset.d; editing = null; if (b.classList.contains("out")) view = parse(sel); draw(box); Sound.click(); });
      b.addEventListener("mouseenter", Sound.hover);
    });
    box.querySelectorAll(".cal-row").forEach((r) => {
      const e = [...events, ...auto].find((x) => x.id === r.dataset.id);
      r.querySelector(".cal-rt").textContent = e.title;
      if (e.note) r.querySelector(".cal-rn").textContent = e.note;
      r.querySelector(".cal-done")?.addEventListener("click", async () => { e.done = !e.done; await save(); draw(box); e.done ? Sound.found() : Sound.click(); });
      r.querySelector(".cal-edit")?.addEventListener("click", () => { editing = e; draw(box); Sound.click(); });
      r.querySelector(".cal-del")?.addEventListener("click", async () => { events = events.filter((x) => x.id !== e.id); await save(); draw(box); Sound.click(); });
    });
    wireForm(box);
  }
  function row(e) {
    const imp = IMPORTANCE[e.importance] || IMPORTANCE[2];
    return `<div class="cal-row imp${e.importance} ${e.done ? "done" : ""} ${e.auto ? "auto" : ""}" data-id="${e.id}" style="--c:${COLORS[e.color] || COLORS.signal}">
      <span class="cal-time">${e.time || "ALL DAY"}</span><span class="cal-rbody"><b class="cal-rt"></b><small class="cal-rn"></small>
      <em>${imp[1]} ${imp[0]}${e.repeat ? " · " + REPEAT[e.repeat].toUpperCase() : ""}${e.auto ? " · AUTO" : ""}</em></span>
      ${e.auto ? "" : `<span class="cal-ract"><button class="ghost cal-done" title="${e.done ? "Not done" : "Done"}">${e.done ? "↺" : "✓"}</button><button class="ghost cal-edit" title="Edit">✎</button><button class="ghost cal-del" title="Delete">✕</button></span>`}</div>`;
  }
  function form() {
    const e = editing || { title: "", time: "", color: "signal", importance: 2, repeat: "", note: "" };
    return `<div class="fk-h">${editing ? "EDIT REMINDER" : "ADD A REMINDER"}</div>
      <input class="cal-f-title" maxlength="80" placeholder="What, e.g. Rotate the water jerrycans" value="${escapeHtml(e.title)}">
      <div class="cal-f-row"><input class="cal-f-time" type="time" value="${e.time}" title="Time (empty for all day)">
        <select class="cal-f-rep">${Object.entries(REPEAT).map(([k, n]) => `<option value="${k}" ${k === e.repeat ? "selected" : ""}>${n}</option>`).join("")}</select></div>
      <div class="cal-f-colors">${Object.entries(COLORS).map(([k, c]) => `<button type="button" data-c="${k}" class="${k === e.color ? "on" : ""}" style="--c:${c}"><i></i></button>`).join("")}</div>
      <div class="cal-f-imp">${[1, 2, 3, 4].map((i) => `<button type="button" data-i="${i}" class="${i === e.importance ? "on" : ""}">${IMPORTANCE[i][1]} ${IMPORTANCE[i][0]}</button>`).join("")}</div>
      <textarea class="cal-f-note" rows="2" maxlength="400" placeholder="A note (optional)">${escapeHtml(e.note || "")}</textarea>
      <div class="fk-row">${editing ? `<button class="ghost cal-f-cancel">CANCEL</button>` : ""}<button class="solid cal-f-save">${editing ? "SAVE" : "+ ADD"} ◆</button></div>`;
  }
  function wireForm(box) {
    const q = (s) => box.querySelector(s);
    let color = editing ? editing.color : "signal", imp = editing ? editing.importance : 2;
    box.querySelectorAll(".cal-f-colors button").forEach((b) => b.addEventListener("click", () => { color = b.dataset.c; box.querySelectorAll(".cal-f-colors button").forEach((x) => x.classList.toggle("on", x === b)); Sound.click(); }));
    box.querySelectorAll(".cal-f-imp button").forEach((b) => b.addEventListener("click", () => { imp = +b.dataset.i; box.querySelectorAll(".cal-f-imp button").forEach((x) => x.classList.toggle("on", x === b)); Sound.click(); }));
    box.querySelectorAll(".cal-form input, .cal-form textarea").forEach((el) => el.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter" && el.tagName === "INPUT") q(".cal-f-save").click(); }));
    q(".cal-f-cancel")?.addEventListener("click", () => { editing = null; draw(box); Sound.click(); });
    q(".cal-f-save").addEventListener("click", async () => {
      const title = q(".cal-f-title").value.trim();
      if (!title) { q(".cal-f-title").focus(); Sound.error(); return; }
      const data = { title, time: q(".cal-f-time").value, repeat: q(".cal-f-rep").value, color, importance: imp, note: q(".cal-f-note").value.trim() };
      if (editing) Object.assign(editing, data);
      else events.push({ id: Math.random().toString(36).slice(2, 12).padEnd(6, "0"), date: sel, done: false, ...data });
      editing = null;
      await save();
      draw(box);
      Sound.found();
    });
  }
  async function save() {
    try { events = (await post("/api/calendar", { events: events.filter((e) => !e.auto) })).events || events; } catch { Sound.error(); }
  }

  // ---------------------------------------------------------- reminders

  // Every half minute: anything due now that hasn't rung yet rings once.
  const rung = () => { try { return JSON.parse(localStorage.getItem("umbra-cal-rung") || "{}"); } catch { return {}; } };
  async function check() {
    try { events = (await (await fetch("/api/calendar")).json()).events || []; } catch { return; }
    const now = new Date(), today = ymd(now), hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const done = rung();
    for (const e of events) {
      if (e.done || !on(e, today)) continue;
      const at = e.time || "09:00", key = e.id + "@" + today;
      if (at > hm || done[key]) continue;
      done[key] = Date.now();
      ring(e);
    }
    // Water or food running out within a day: once a day.
    try {
      const f = window.UmbraFieldKit && UmbraFieldKit.forecast ? await UmbraFieldKit.forecast() : null;
      for (const [d, what] of f ? [[f.waterDays, "water"], [f.foodDays, "food"]] : []) {
        const key = what + "@" + today;
        if (d != null && d < 1.5 && !done[key] && hm >= "09:00") { done[key] = Date.now(); ring({ title: `Your ${what} runs out within ${Math.max(1, Math.round(d * 24))} hours`, note: "Field Kit → Supplies", importance: 4, color: what === "water" ? "net" : "accent" }); }
      }
    } catch {}
    for (const k of Object.keys(done)) if (Date.now() - done[k] > 40 * 864e5) delete done[k];
    try { localStorage.setItem("umbra-cal-rung", JSON.stringify(done)); } catch {}
  }
  function ring(e) {
    (e.importance >= 3 ? Sound.achieve : Sound.complete)();
    if (typeof setAttention === "function") setAttention(true);
    const t = document.createElement("div");
    t.className = "dl-toast cal-toast imp" + (e.importance || 2);
    t.style.setProperty("--c", COLORS[e.color] || COLORS.signal);
    t.innerHTML = `<span class="g">\u{F00ED}</span><div><b>REMINDER${e.importance >= 4 ? " · CRITICAL" : e.importance === 3 ? " · HIGH" : ""}</b><p></p>${e.note ? "<small></small>" : ""}</div><button class="ghost" title="Close">✕</button>`;
    t.querySelector("p").textContent = (e.time ? e.time + " · " : "") + e.title;
    if (e.note) t.querySelector("small").textContent = e.note;
    document.body.appendChild(t);
    const bye = () => { t.classList.add("leaving"); setTimeout(() => t.remove(), 400); };
    t.querySelector("button").addEventListener("click", bye);
    t.addEventListener("click", (ev) => { if (ev.target.tagName !== "BUTTON") { bye(); window.UmbraFieldKit && UmbraFieldKit.open("calendar"); } });
    if (e.importance < 4) setTimeout(bye, 20000);
  }
  setTimeout(check, 8000);
  setInterval(check, 30000);

  return { render, check };
})();
