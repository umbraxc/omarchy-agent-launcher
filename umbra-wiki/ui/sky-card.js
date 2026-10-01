// An offline IAU star atlas in a shaded ASCII sky dome.
"use strict";
window.UmbraSky = (() => {
  const catalog = fetch("sky-data.json").then(response => response.json()).catch(() => null);
  const rad = Math.PI / 180;
  const sidereal = (date, longitude) => (280.46061837 + 360.98564736629 * (date.getTime() / 86400000 + 2440587.5 - 2451545) + longitude) % 360;
  function position(ra, dec, lat, lon, date) {
    const ha = ((sidereal(date, lon) - ra + 540) % 360 - 180) * rad;
    const d = dec * rad, latitude = lat * rad;
    const sinAlt = Math.sin(latitude) * Math.sin(d) + Math.cos(latitude) * Math.cos(d) * Math.cos(ha);
    const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    const az = Math.atan2(-Math.sin(ha) * Math.cos(d), Math.sin(d) * Math.cos(latitude) - Math.cos(d) * Math.sin(latitude) * Math.cos(ha));
    return {alt: alt / rad, az};
  }
  function render(parent) {
    if (parent.querySelector(".sky-card")) return;
    const el = document.createElement("section");
    el.className = "sky-card";
    el.innerHTML = '<div class="sky-head"><b>✦ NIGHT SKY // OFFLINE ATLAS</b><span class="sky-place"></span></div>' +
      '<div class="sky-stage"><canvas role="img" aria-label="Animated star chart with named stars above the horizon"></canvas><div class="sky-hover" hidden></div></div>' +
      '<div class="sky-constellations"></div>' +
      '<div class="sky-controls"><span>VIEW FROM</span><label>LAT <input class="sky-lat" type="number" min="-89" max="89" step="0.01" aria-label="Sky latitude"></label>' +
      '<label>LON <input class="sky-lon" type="number" min="-180" max="180" step="0.01" aria-label="Sky longitude"></label>' +
      '<button class="ghost sky-save" type="button">SET LOCATION</button></div>' +
      '<small class="sky-note">Named stars above the geometric horizon. Weather, daylight and local obstructions may hide them. ' +
      '<a href="https://iauarchive.eso.org/public/themes/constellations/">IAU constellations</a> · ' +
      '<a href="https://iauarchive.eso.org/public/themes/naming_stars/">IAU star names</a></small>';
    parent.appendChild(el);
    const canvas = el.querySelector("canvas"), ctx = canvas.getContext("2d"), tip = el.querySelector(".sky-hover");
    const latInput = el.querySelector(".sky-lat"), lonInput = el.querySelector(".sky-lon");
    let lat = Number.isFinite(Number(window.prefs?.skyLatitude)) && window.prefs?.skyLatitude != null ? Number(prefs.skyLatitude) : 52;
    let lon = Number.isFinite(Number(window.prefs?.skyLongitude)) && window.prefs?.skyLongitude != null ? Number(prefs.skyLongitude) : 5;
    let sample = window.prefs?.skyLatitude == null || window.prefs?.skyLongitude == null;
    latInput.value = String(lat); lonInput.value = String(lon);
    let data = null, W = 0, H = 0, hovered = null, marks = [], timer = 0;
    const palette = () => {
      const css = getComputedStyle(document.documentElement);
      return {signal: css.getPropertyValue("--signal").trim() || "#e5cc75", dim: css.getPropertyValue("--dim").trim() || "#777", fg: css.getPropertyValue("--fg").trim() || "#ddd"};
    };
    function resize() {
      const rect = canvas.getBoundingClientRect(); W = rect.width; H = rect.height;
      const dpr = Math.min(2, devicePixelRatio || 1);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw();
    }
    function draw() {
      if (!data || !W || !H || !el.isConnected) return;
      const colors = palette(), t = performance.now() / 1000, still = document.body.classList.contains("reduce-motion") || window.offgrid;
      const date = new Date(), cx = W / 2, cy = H * .51, R = Math.min(W * .43, H * .44);
      el.querySelector(".sky-place").textContent = sample ? "EXAMPLE · 52°N 5°E" : lat.toFixed(2) + "° / " + lon.toFixed(2) + "°";
      ctx.clearRect(0, 0, W, H);
      const halo = ctx.createRadialGradient(cx - R * .2, cy - R * .35, 5, cx, cy, R * 1.25);
      halo.addColorStop(0, "#18232b"); halo.addColorStop(.6, "#0b1018"); halo.addColorStop(1, "#030609");
      ctx.fillStyle = halo; ctx.fillRect(0, 0, W, H);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
      ctx.font = '10px monospace'; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (let ring = 1; ring <= 4; ring++) {
        const rr = R * ring / 4;
        for (let i = 0; i < 96; i++) {
          const a = i * Math.PI / 48;
          ctx.fillStyle = i % 8 ? "rgba(140,185,190,.14)" : "rgba(225,196,112,.3)";
          ctx.fillText(i % 8 ? "·" : "+", cx + Math.sin(a) * rr, cy - Math.cos(a) * rr);
        }
      }
      for (let i = 0; i < 16; i++) {
        const a = i * Math.PI / 8;
        for (let j = 1; j < 10; j++) {
          const rr = R * j / 10;
          ctx.fillStyle = "rgba(100,175,188,.12)";ctx.fillText("·", cx + Math.sin(a) * rr, cy - Math.cos(a) * rr);
        }
      }
      marks = [];
      const labels = [];
      const stars = data.stars.filter(s => s[2] <= 5.5).sort((a,b) => b[2] - a[2]);
      for (const star of stars) {
        const [name, abbr, mag, ra, dec] = star, sky = position(ra, dec, lat, lon, date);
        if (sky.alt <= 0) continue;
        const rr = R * (90 - sky.alt) / 90, x = cx + Math.sin(sky.az) * rr, y = cy - Math.cos(sky.az) * rr;
        const bright = mag < 2.4, pulse = still ? 1 : .75 + .25 * Math.sin(t * (1.5 + mag / 8) + ra);
        ctx.globalAlpha = pulse;ctx.fillStyle = bright ? colors.signal : mag < 4 ? "#a5c8cf" : "#79959b";
        ctx.shadowColor = bright ? colors.signal : "#8bc9dd"; ctx.shadowBlur = bright ? 12 : 3;
        ctx.font = (bright ? "700 14px" : mag < 4 ? "11px" : "9px") + " monospace";
        ctx.fillText(bright ? "✦" : mag < 4 ? "✧" : "·", x, y);
        ctx.shadowBlur = 0;ctx.globalAlpha = 1;
        if (mag < 1.8 && sky.alt > 12 && !labels.some(point => Math.abs(point.x - x) < 60 && Math.abs(point.y - y) < 25)) {
          labels.push({x,y});
          ctx.font = "9px monospace";ctx.fillStyle = colors.fg;ctx.globalAlpha = .7;
          ctx.fillText(name.toUpperCase(), x, y + 14);ctx.globalAlpha = 1;
        }
        marks.push({x,y,name,abbr,alt:sky.alt,mag});
      }
      ctx.restore();
      ctx.strokeStyle = colors.signal;ctx.globalAlpha = .7;ctx.lineWidth = 1;
      ctx.beginPath();ctx.arc(cx,cy,R,0,Math.PI*2);ctx.stroke();ctx.globalAlpha = 1;
      ctx.font = "10px monospace";ctx.fillStyle = colors.signal;
      for (const [label,a] of [["N",0],["E",Math.PI/2],["S",Math.PI],["W",3*Math.PI/2]])
        ctx.fillText(label,cx+Math.sin(a)*(R+14),cy-Math.cos(a)*(R+14));
      const scores = new Map(), names = new Map(data.constellations.map(([name,abbreviation]) => [abbreviation,name]));
      for (const mark of marks) if (mark.alt > 15) scores.set(mark.abbr, (scores.get(mark.abbr) || 0) + Math.max(.2, 4.6 - mark.mag));
      const regions = [...scores].sort((a,b) => b[1] - a[1]).slice(0, 6).map(([abbr]) => names.get(abbr) || abbr);
      const line = el.querySelector(".sky-constellations");
      const summary = "ABOVE HORIZON · " + regions.join(" · ").toUpperCase();
      if (line.textContent !== summary) line.textContent = summary;
      if (hovered) {
        const m = marks.find(mark => mark.name === hovered);
        if (m) { tip.textContent = m.name + " · " + m.alt.toFixed(0) + "° ABOVE HORIZON";tip.hidden = false; }
        else tip.hidden = true;
      }
    }
    canvas.addEventListener("pointermove", event => {
      const rect = canvas.getBoundingClientRect(), x = event.clientX - rect.left, y = event.clientY - rect.top;
      const m = marks.find(mark => Math.hypot(mark.x - x, mark.y - y) < 12);
      hovered = m?.name || null; tip.hidden = !m;
      if (m) { tip.style.left = Math.max(5, Math.min(W - 190, x + 12)) + "px";tip.style.top = Math.max(5, y - 35) + "px";draw(); }
    });
    canvas.addEventListener("pointerleave", () => { hovered = null;tip.hidden = true; });
    el.querySelector(".sky-save").addEventListener("click", async () => {
      const a = Number(latInput.value), b = Number(lonInput.value);
      if (!Number.isFinite(a) || !Number.isFinite(b) || a < -89 || a > 89 || b < -180 || b > 180 || !latInput.value || !lonInput.value) return;
      lat = a;lon = b;sample = false;
      if (window.prefs) Object.assign(prefs,{skyLatitude:lat,skyLongitude:lon});
      await postSettings({skyLatitude:lat,skyLongitude:lon});Sound.click();draw();
    });
    new ResizeObserver(resize).observe(canvas);
    catalog.then(value => { data = value;resize(); });
    const loop = () => {
      if (!el.isConnected) { clearTimeout(timer);return; }
      if (!document.hidden && el.getBoundingClientRect().bottom > 0 && el.getBoundingClientRect().top < innerHeight) draw();
      timer = setTimeout(loop, document.hidden || window.offgrid || document.body.classList.contains("reduce-motion") ? 1500 : 300);
    };
    loop();
  }
  return {render};
})();
