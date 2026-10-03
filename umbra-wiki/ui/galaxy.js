// Umbra Wiki GALAXY: the solar system in characters, where everything is
// right now. The planets follow JPL's orbital elements, the Earth turns
// under the real Sun (its night side lit by cities), the Moon is where it is
// in the sky tonight. Around them the named stars at their true places, the
// Milky Way, Andromeda and the Magellanic Clouds. The camera never rests: it
// circles the chosen body (the Earth at first). Drag to turn, scroll to
// come closer or pull away, W A S D to fly freely, click a body for its file.
// Keep pulling out of the Maps and you leave orbit and come here; keep
// diving at the Earth from here and you land back on the Maps.
// Distances are squeezed so the whole system fits (true scale on request);
// sizes are enlarged so the planets can be seen. Nothing goes online.
"use strict";

window.UmbraGalaxy = (() => {
  const TAU = Math.PI * 2, rad = Math.PI / 180;
  const A = window.Ascii3D, N2 = A.noise2, H2 = A.hash2;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const font = () => css("--font") || "monospace";
  const motion = () => !document.body.classList.contains("reduce-motion");
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const esc = (s) => escapeHtml(String(s ?? ""));
  const AU = 149597870.7, GM = 1.32712440018e11;   // km, km³/s²

  // ------------------------------------------------------------ orbits
  // JPL "Approximate Positions of the Planets" (1800 – 2050), per century:
  // a (AU), e, I, L, long. perihelion, long. ascending node (degrees).
  const EL = {
    mercury: [0.38709927, 0.00000037, 0.20563593, 0.00001906, 7.00497902, -0.00594749, 252.2503235, 149472.67411175, 77.45779628, 0.16047689, 48.33076593, -0.12534081],
    venus: [0.72333566, 0.0000039, 0.00677672, -0.00004107, 3.39467605, -0.0007889, 181.9790995, 58517.81538729, 131.60246718, 0.00268329, 76.67984255, -0.27769418],
    earth: [1.00000261, 0.00000562, 0.01671123, -0.00004392, -0.00001531, -0.01294668, 100.46457166, 35999.37244981, 102.93768193, 0.32327364, 0, 0],
    mars: [1.52371034, 0.00001847, 0.0933941, 0.00007882, 1.84969142, -0.00813131, -4.55343205, 19140.30268499, -23.94362959, 0.44441088, 49.55953891, -0.29257343],
    jupiter: [5.202887, -0.00011607, 0.04838624, -0.00013253, 1.30439695, -0.00183714, 34.39644051, 3034.74612775, 14.72847983, 0.21252668, 100.47390909, 0.20469106],
    saturn: [9.53667594, -0.0012506, 0.05386179, -0.00050991, 2.48599187, 0.00193609, 49.95424423, 1222.49362201, 92.59887831, -0.41897216, 113.66242448, -0.28867794],
    uranus: [19.18916464, -0.00196176, 0.04725744, -0.00004397, 0.77263783, -0.00242939, 313.23810451, 428.48202785, 170.9542763, 0.40805281, 74.01692503, 0.04240589],
    neptune: [30.06992276, 0.00026291, 0.00859048, 0.00005105, 1.77004347, 0.00035372, -55.12002969, 218.45945325, 44.96476227, -0.32241464, 131.78422574, -0.00508664],
    pluto: [39.48211675, -0.00031596, 0.2488273, 0.0000517, 17.14001206, 0.00004818, 238.92903833, 145.20780515, 224.06891629, -0.04062942, 110.30393684, -0.01183482],
    // Ceres (approximate mean elements, J2000).
    ceres: [2.7675, 0, 0.0785, 0, 10.59, 0, 153.9, 7826.2, 153.9 - 0.0, 0, 80.31, 0],
  };
  const jd = (ms) => ms / 86400000 + 2440587.5;
  function helio(id, ms, M0 = null) {
    const T = (jd(ms) - 2451545) / 36525, e0 = EL[id];
    const a = e0[0] + e0[1] * T, e = e0[2] + e0[3] * T, I = (e0[4] + e0[5] * T) * rad, L = e0[6] + e0[7] * T, wb = e0[8] + e0[9] * T, O = (e0[10] + e0[11] * T) * rad;
    const w = wb * rad - O;
    let M = M0 != null ? M0 : (((L - wb) % 360) + 540) % 360 - 180; M *= M0 != null ? 1 : rad;
    let E = M + e * Math.sin(M);
    for (let i = 0; i < 6; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
    return { p: [(cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp, (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp, sw * sI * xp + cw * sI * yp], a };
  }
  // The Moon, geocentric ecliptic (km): the almanac formula of the Field Kit.
  function moonGeo(ms) {
    const d = jd(ms) - 2451545, L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.22935 * d);
    const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dist = 385001 - 20905 * Math.cos(M);
    return [Math.cos(b) * Math.cos(l) * dist, Math.cos(b) * Math.sin(l) * dist, Math.sin(b) * dist];
  }
  // Greenwich sidereal angle (radians) and the obliquity of the ecliptic.
  const gmst = (ms) => ((280.46061837 + 360.98564736629 * (jd(ms) - 2451545)) % 360) * rad;
  const OBL = 23.4393 * rad;

  // ------------------------------------------------------------ textures
  // Each returns [rgb, glyph, emit] for a point at (lat, lon) of the body.
  const isLand = (lat, lon) => (window.UmbraOrrery ? UmbraOrrery.isLand(lat, lon) : N2(lat * 0.05, lon * 0.05) > 0.55);
  function crater(lat, lon, k = 0.18) { const gx = Math.floor(lon * k), gy = Math.floor(lat * k), h = H2(gx, gy); if (h < 0.6) return 0; const cx = (gx + 0.5) / k, cy = (gy + 0.5) / k, r = Math.hypot((lon - cx) * Math.cos(lat * rad), lat - cy) * k; return r < 0.32 ? 1 : r < 0.42 ? 2 : 0; }
  const rocky = (c1, c2, sc = 0.05) => (lat, lon) => { const n = N2(lon * sc, lat * sc * 1.4) * 0.7 + 0.3 * N2(lon * 0.2, lat * 0.2), cr = crater(lat, lon); let c = mix(c1, c2, n); if (cr === 2) c = mix(c, [255, 255, 255], 0.25); if (cr === 1) c = mix(c, [0, 0, 0], 0.25); return [c, cr === 2 ? "o" : null]; };
  const TEX = {
    sun: (lat, lon, t) => { const n = N2(lon * 0.08 + t * 0.06, lat * 0.08) * 0.6 + 0.4 * N2(lon * 0.3 - t * 0.12, lat * 0.3); const spot = Math.abs(lat) < 32 && N2(lon * 0.05 + 7, lat * 0.08 + 3) > 0.8;
      return spot ? [[140, 60, 20], "o", 0.8] : [mix([255, 130, 30], [255, 240, 170], n), "@%#*+"[Math.floor(n * 4.99)], 1]; },
    mercury: rocky([110, 105, 100], [175, 168, 158]),
    venus: (lat, lon, t) => { const n = N2(lon * 0.05 + lat * 0.03 + t * 0.02, lat * 0.12); return [mix([200, 160, 90], [250, 230, 170], n), n > 0.6 ? "≈" : "~"]; },
    earth: (lat, lon, t, lit) => {
      const cloud = N2(lon * 0.06 + t * 0.004, lat * 0.1) * 0.7 + 0.3 * N2(lon * 0.2, lat * 0.25);
      if (lit < -0.05) { if (Math.abs(lat) < 62 && isLand(lat, lon) && H2(Math.floor(lat * 1.5), Math.floor(lon * 1.5)) > 0.72) return [[255, 205, 120], "·", 0.85]; }
      if (cloud > 0.66) return [[240, 244, 250], cloud > 0.75 ? "≈" : "~"];
      if (lat > 74 || lat < -66) return [[235, 242, 250], "#"];
      if (isLand(lat, lon)) { const dry = Math.abs(Math.abs(lat) - 24) < 9 && N2(lon * 0.08, lat * 0.08) > 0.4; return [dry ? mix([190, 160, 100], [220, 190, 130], N2(lon * 0.3, lat * 0.3)) : mix([60, 120, 60], [110, 150, 80], N2(lon * 0.2, lat * 0.2)), dry ? ":" : "%"]; }
      return [mix([20, 60, 130], [50, 110, 180], N2(lon * 0.1, lat * 0.1)), "~"]; },
    moon: (lat, lon) => { const mare = N2(lon * 0.035 + 2, lat * 0.05) > 0.58; const [c, g] = rocky([120, 118, 115], [200, 198, 192])(lat, lon); return [mare ? mix(c, [60, 60, 64], 0.45) : c, g]; },
    mars: (lat, lon) => { if (Math.abs(lat) > 78) return [[240, 236, 230], "#"]; const n = N2(lon * 0.05, lat * 0.07) * 0.7 + 0.3 * N2(lon * 0.25, lat * 0.25); const valles = Math.abs(lat + 8) < 2 && lon > -120 && lon < -40;
      return [valles ? [90, 40, 30] : mix([120, 55, 35], [210, 110, 60], n), valles ? "=" : n > 0.6 ? "%" : null]; },
    jupiter: (lat, lon, t) => { const tb = N2(lon * 0.04 + t * 0.03, lat * 0.2) * 3; const z = Math.sin(lat * 0.22 + tb * 0.3); const grs = Math.hypot(((((lon - t * 2 + 540) % 360) - 180) - 40) * 0.5, lat + 22);
      if (grs < 7) return [mix([200, 80, 60], [230, 140, 100], grs / 7), grs < 4 ? "@" : "%"];
      return [z > 0.3 ? mix([235, 210, 165], [250, 235, 205], z) : z > -0.3 ? [215, 145, 90] : mix([150, 80, 50], [190, 110, 70], -z), z > 0.3 ? "=" : "-"]; },
    saturn: (lat, lon, t) => { const z = Math.sin(lat * 0.18 + N2(lon * 0.03 + t * 0.02, lat * 0.1)); return [z > 0 ? mix([225, 205, 150], [245, 230, 185], z) : mix([195, 165, 110], [215, 190, 135], -z), z > 0.5 ? "=" : "-"]; },
    uranus: (lat) => [mix([140, 210, 220], [175, 230, 236], 0.5 + 0.5 * Math.sin(lat * 0.1)), "-"],
    neptune: (lat, lon, t) => { const spot = Math.hypot(((((lon - t * 3 + 540) % 360) - 180) - 20) * 0.45, lat + 20) < 6; const streak = Math.abs(lat - 30) < 2 && N2(lon * 0.2 + t, 1) > 0.5;
      return spot ? [[30, 50, 120], "@"] : streak ? [[230, 240, 255], "~"] : [mix([50, 80, 190], [80, 120, 230], N2(lon * 0.05, lat * 0.15)), "-"]; },
    pluto: (lat, lon) => { const heart = Math.hypot((lon - 175) * 0.6, lat - 15) < 26; return heart ? [[240, 232, 220], "#"] : [mix([150, 110, 80], [210, 180, 150], N2(lon * 0.08, lat * 0.08)), Math.abs(lat) < 12 && N2(lon * 0.05, 3) > 0.55 ? "%" : null]; },
    ceres: (lat, lon) => { if (Math.hypot(lon - 40, lat - 20) < 4) return [[255, 255, 255], "*", 0.6]; return rocky([90, 88, 86], [140, 136, 130])(lat, lon); },
    io: (lat, lon) => { const v = H2(Math.floor(lat * 0.2), Math.floor(lon * 0.2)) > 0.86; return v ? [[150, 50, 20], "o"] : [mix([220, 190, 80], [245, 230, 140], N2(lon * 0.1, lat * 0.1)), null]; },
    europa: (lat, lon) => { const line = Math.abs(Math.sin(lon * 0.18 + lat * 0.11 + N2(lon * 0.05, lat * 0.05) * 4)) < 0.07; return [line ? [160, 90, 60] : mix([210, 200, 180], [240, 236, 225], N2(lon * 0.1, lat * 0.1)), line ? "/" : null]; },
    ganymede: rocky([110, 100, 92], [185, 175, 162], 0.04), callisto: rocky([60, 56, 52], [130, 122, 112], 0.08),
    titan: (lat) => [mix([200, 140, 60], [230, 180, 100], 0.5 + 0.5 * Math.sin(lat * 0.08)), "~"],
    enceladus: (lat, lon) => (lat < -60 && Math.abs(Math.sin(lon * 0.08)) < 0.12 ? [[120, 190, 230], "="] : [[240, 245, 250], null]),
    triton: rocky([190, 165, 160], [235, 215, 205], 0.06), icy: rocky([170, 170, 172], [230, 230, 232], 0.06), grey: rocky([100, 96, 92], [160, 155, 148]), red: rocky([120, 80, 60], [170, 120, 90]),
  };

  // --------------------------------------------------------------- data
  // id, name, kind, parent, radius km, texture, facts.
  const P = (id, name, kind, r, tex, f) => ({ id, name, kind, r, tex, ...f });
  const BODIES = [
    P("sun", "Sun", "Star", 695700, "sun", { tag: "A middle-aged yellow dwarf star, G2V.", age: "4.6 billion years", mass: "1.989 × 10³⁰ kg (333,000 Earths)", g: "274 m/s² (28 g)", day: "about 25 days at the equator, 35 at the poles", rotH: 609.12,
      temp: "5,500 °C surface · 15 million °C core", atmo: "photosphere, chromosphere and a corona of over a million °C", made: "hydrogen 73%, helium 25%, heavier elements 2%",
      res: "every watt on Earth's solar panels, wind and plants: about 1,361 W per m² arrives at Earth's distance", visit: "Parker Solar Probe, SOHO, Solar Orbiter", know: "Light from its surface takes about 8 minutes 20 seconds to reach Earth; the energy began in its core tens of thousands of years earlier.", color: [255, 200, 90] }),
    P("mercury", "Mercury", "Planet", 2439.7, "mercury", { tag: "The smallest planet, closest to the Sun.", age: "4.5 billion years", mass: "3.30 × 10²³ kg (0.055 Earths)", g: "3.7 m/s² (0.38 g)", day: "58.6 Earth days (sidereal); 176 days sunrise to sunrise", rotH: 1407.6, yearD: 87.97, tilt: 0.03,
      temp: "−173 °C at night to 427 °C by day", atmo: "almost none: a thin exosphere of oxygen, sodium, hydrogen, helium", made: "a huge iron core (about 85% of its radius) under a rocky crust", moons: 0,
      res: "water ice in permanently shadowed polar craters", visit: "Mariner 10, MESSENGER, BepiColombo (arriving)", know: "Its orbit's slow turn was one of the first proofs of Einstein's general relativity.", color: [175, 168, 158] }),
    P("venus", "Venus", "Planet", 6051.8, "venus", { tag: "The hottest planet, under clouds of acid.", age: "4.5 billion years", mass: "4.87 × 10²⁴ kg (0.815 Earths)", g: "8.87 m/s² (0.90 g)", day: "243 Earth days, turning backwards", rotH: -5832.5, yearD: 224.7, tilt: 177.4,
      temp: "464 °C, day and night", atmo: "carbon dioxide 96.5%, nitrogen 3.5%; clouds of sulphuric acid; 92 times Earth's pressure", made: "rock and iron, much like Earth", moons: 0,
      res: "none we could reach: its surface melts lead", visit: "Venera landers, Magellan, Venus Express, Akatsuki", know: "Its day is longer than its year, and the Sun rises in the west there.", color: [235, 200, 130] }),
    P("earth", "Earth", "Planet", 6371, "earth", { tag: "Our home: the only world known to hold life.", age: "4.54 billion years", mass: "5.97 × 10²⁴ kg", g: "9.81 m/s² (1 g)", day: "23 h 56 min (sidereal); 24 h sunrise to sunrise", rotH: 23.9345, yearD: 365.256, tilt: 23.44,
      temp: "about 15 °C on average (−89 °C to 57 °C recorded)", atmo: "nitrogen 78%, oxygen 21%, argon 0.9%, carbon dioxide 0.04%, water vapour", made: "an iron-nickel core, a rocky mantle, a thin crust; 71% of the surface is ocean", moons: 1,
      res: "liquid water, breathable air, soil, forests, fresh water (2.5% of all water), metals and fuels in the crust", visit: "you, right now", know: "It is the densest planet in the solar system, and the only one not named after a god.", color: [80, 140, 220] }),
    P("mars", "Mars", "Planet", 3389.5, "mars", { tag: "The red planet, rusted iron dust.", age: "4.6 billion years", mass: "6.42 × 10²³ kg (0.107 Earths)", g: "3.71 m/s² (0.38 g)", day: "24 h 37 min (a sol)", rotH: 24.6229, yearD: 686.98, tilt: 25.19,
      temp: "about −65 °C on average (−125 °C to 20 °C)", atmo: "carbon dioxide 95%, nitrogen 2.8%, argon 2%; less than 1% of Earth's pressure", made: "an iron core, a rocky mantle, an iron-oxide-rich crust", moons: 2,
      res: "water ice at the poles and underground, iron, perchlorate salts", visit: "Viking, Pathfinder, Spirit, Opportunity, Curiosity, Perseverance and Ingenuity, Zhurong", know: "Olympus Mons, a shield volcano, is about 22 km high: two and a half Everests.", color: [210, 110, 60] }),
    P("jupiter", "Jupiter", "Planet", 69911, "jupiter", { tag: "The giant, more massive than all the other planets together.", age: "4.6 billion years", mass: "1.90 × 10²⁷ kg (318 Earths)", g: "24.8 m/s² (2.5 g, at the cloud tops)", day: "9 h 56 min, the shortest day", rotH: 9.925, yearD: 4332.6, tilt: 3.13,
      temp: "about −110 °C at the cloud tops", atmo: "hydrogen 90%, helium 10%, with ammonia and water clouds", made: "hydrogen and helium over a dense core; deep down, hydrogen becomes a liquid metal", moons: 95,
      res: "helium and hydrogen; its moons hold oceans of water (Europa, Ganymede)", visit: "Pioneer, Voyager, Galileo, Juno, JUICE and Europa Clipper (en route)", know: "The Great Red Spot is a storm wider than the Earth, raging for at least 190 years.", color: [220, 180, 140] }),
    P("saturn", "Saturn", "Planet", 58232, "saturn", { tag: "The ringed giant, light enough to float.", age: "4.5 billion years", mass: "5.68 × 10²⁶ kg (95 Earths)", g: "10.4 m/s² (1.07 g)", day: "10 h 33 min", rotH: 10.656, yearD: 10759, tilt: 26.73,
      temp: "about −140 °C at the cloud tops", atmo: "hydrogen 96%, helium 3%", made: "hydrogen and helium over a rocky, icy core; its rings are mostly water ice", moons: 146,
      res: "water ice in its rings and moons; Titan has lakes of methane", visit: "Pioneer 11, Voyager 1 and 2, Cassini–Huygens", know: "Its rings span about 280,000 km but are mostly only about 10 m thick.", color: [230, 205, 150] }),
    P("uranus", "Uranus", "Planet", 25362, "uranus", { tag: "The ice giant that rolls on its side.", age: "4.5 billion years", mass: "8.68 × 10²⁵ kg (14.5 Earths)", g: "8.87 m/s² (0.9 g)", day: "17 h 14 min, backwards", rotH: -17.24, yearD: 30687, tilt: 97.77,
      temp: "about −195 °C; the coldest atmosphere of any planet (−224 °C)", atmo: "hydrogen 83%, helium 15%, methane 2% (its blue-green colour)", made: "water, ammonia and methane ices around a rocky core", moons: 28,
      res: "water, ammonia and methane ices", visit: "Voyager 2 (1986)", know: "Each pole gets about 42 years of sunlight followed by 42 years of darkness.", color: [160, 220, 230] }),
    P("neptune", "Neptune", "Planet", 24622, "neptune", { tag: "The windiest world, found by mathematics.", age: "4.5 billion years", mass: "1.02 × 10²⁶ kg (17 Earths)", g: "11.2 m/s² (1.14 g)", day: "16 h 6 min", rotH: 16.11, yearD: 60190, tilt: 28.32,
      temp: "about −200 °C", atmo: "hydrogen 80%, helium 19%, methane 1.5%", made: "water, ammonia and methane ices around a rocky core", moons: 16,
      res: "ices of water, ammonia and methane", visit: "Voyager 2 (1989)", know: "It was predicted from Uranus's wobbles before anyone saw it (1846). Its winds reach 2,100 km/h.", color: [80, 120, 230] }),
    P("pluto", "Pluto", "Dwarf planet", 1188.3, "pluto", { tag: "A dwarf planet with a heart of nitrogen ice.", age: "4.5 billion years", mass: "1.30 × 10²² kg (0.002 Earths)", g: "0.62 m/s² (0.06 g)", day: "6.4 Earth days, backwards", rotH: -153.29, yearD: 90560, tilt: 122.5,
      temp: "about −225 °C", atmo: "thin nitrogen, methane, carbon monoxide; it freezes out as Pluto moves away from the Sun", made: "rock and water ice; nitrogen and methane ice plains", moons: 5,
      res: "nitrogen, methane and water ice", visit: "New Horizons (2015)", know: "Since its discovery in 1930 it has not yet completed one orbit: that happens in 2178.", color: [210, 180, 150] }),
    P("ceres", "Ceres", "Dwarf planet", 469.7, "ceres", { tag: "The largest body in the asteroid belt.", age: "4.6 billion years", mass: "9.38 × 10²⁰ kg", g: "0.28 m/s²", day: "9 h 4 min", rotH: 9.074, yearD: 1682, tilt: 4,
      temp: "about −105 °C", atmo: "a trace of water vapour", made: "rock and ice; perhaps a brine layer below", moons: 0, approx: true,
      res: "water ice and salts (the bright spots of Occator crater are sodium carbonate)", visit: "Dawn (2015 – 2018)", know: "It was the first asteroid found (1801) and was called a planet for half a century.", color: [150, 146, 140] }),
  ];
  // Moons: parent, radius km, distance km, period days (negative: backwards), texture, line.
  const MOONS = [
    ["moon", "Moon", "earth", 1737.4, 384400, 27.322, "moon", "Earth's companion; the same face always turned to us.", "Formed about 4.5 billion years ago, probably from a giant impact. Twelve people have walked on it (1969 – 1972)."],
    ["phobos", "Phobos", "mars", 11.3, 9376, 0.319, "grey", "A lumpy moon spiralling slowly down into Mars.", "It rises in the west and sets in the east, twice a day."],
    ["deimos", "Deimos", "mars", 6.2, 23463, 1.263, "grey", "Mars's small outer moon.", "From Mars it looks like a bright star."],
    ["io", "Io", "jupiter", 1821.6, 421700, 1.769, "io", "The most volcanic world known.", "Over 400 active volcanoes, heated by Jupiter's tides."],
    ["europa", "Europa", "jupiter", 1560.8, 671034, 3.551, "europa", "An ice shell over a hidden ocean.", "Its ocean may hold twice the water of all Earth's oceans."],
    ["ganymede", "Ganymede", "jupiter", 2634.1, 1070412, 7.155, "ganymede", "The largest moon in the solar system.", "Bigger than Mercury, and the only moon with its own magnetic field."],
    ["callisto", "Callisto", "jupiter", 2410.3, 1882709, 16.689, "callisto", "The most cratered surface known.", "Its ancient surface has barely changed in 4 billion years."],
    ["mimas", "Mimas", "saturn", 198.2, 185539, 0.942, "icy", "The 'Death Star' moon.", "Its crater Herschel is a third of its width."],
    ["enceladus", "Enceladus", "saturn", 252.1, 237948, 1.37, "enceladus", "Geysers of water from a southern ocean.", "Its plumes feed Saturn's E ring."],
    ["tethys", "Tethys", "saturn", 531.1, 294619, 1.888, "icy", "A moon of almost pure water ice.", "A canyon, Ithaca Chasma, runs three-quarters of the way round it."],
    ["dione", "Dione", "saturn", 561.4, 377396, 2.737, "icy", "Bright ice cliffs on a small moon.", "Shares its orbit with two tiny moons, Helene and Polydeuces."],
    ["rhea", "Rhea", "saturn", 763.8, 527108, 4.518, "icy", "Saturn's second-largest moon.", "Cold and airless, with a whisper of oxygen."],
    ["titan", "Titan", "saturn", 2574.7, 1221870, 15.945, "titan", "A moon with a thick orange sky and methane lakes.", "Its air is thicker than Earth's; Huygens landed there in 2005."],
    ["iapetus", "Iapetus", "saturn", 734.5, 3560820, 79.32, "grey", "Two-faced: one side dark, one bright.", "A ridge 13 km high runs around its equator."],
    ["miranda", "Miranda", "uranus", 235.8, 129390, 1.413, "icy", "A patchwork moon with the tallest cliff known.", "Verona Rupes may be 20 km high."],
    ["ariel", "Ariel", "uranus", 578.9, 191020, 2.52, "icy", "The brightest of Uranus's moons.", "Crossed by long valleys."],
    ["umbriel", "Umbriel", "uranus", 584.7, 266000, 4.144, "grey", "The darkest of Uranus's large moons.", "Has a mysterious bright ring, Wunda."],
    ["titania", "Titania", "uranus", 788.4, 435910, 8.706, "icy", "Uranus's largest moon.", "Named after the fairy queen in A Midsummer Night's Dream."],
    ["oberon", "Oberon", "uranus", 761.4, 583520, 13.463, "grey", "The outermost large moon of Uranus.", "Old and cratered, with a mountain about 11 km high."],
    ["triton", "Triton", "neptune", 1353.4, 354759, -5.877, "triton", "A captured world orbiting backwards.", "It has nitrogen geysers; it may come from the Kuiper Belt."],
    ["charon", "Charon", "pluto", 606, 19591, 6.387, "icy", "Half Pluto's size: the two orbit each other.", "Pluto and Charon always show each other the same face."],
  ].map(([id, name, parent, r, a, period, tex, tag, know]) => ({ id, name, kind: "Moon", parent, r, a, period, tex, tag, know, color: [200, 200, 205] }));
  const ALL = [...BODIES, ...MOONS], BY = Object.fromEntries(ALL.map((b) => [b.id, b]));
  const PLANET_IDS = ["mercury", "venus", "earth", "mars", "ceres", "jupiter", "saturn", "uranus", "neptune", "pluto"];

  // ------------------------------------------------------------ scales
  let trueScale = false;
  const distVis = (au) => (trueScale ? au * 6 : 6 * Math.sqrt(au));
  const radVis = (b) => (b.id === "sun" ? 1.5 : Math.max(0.02, 0.25 * (b.r / 6371) ** 0.45));
  const moonDist = (m) => { const p = BY[m.parent]; return radVis(p) * (1.7 + 1.25 * Math.log10(m.a / p.r)); };
  const tiltM = (b) => { const t = (b.tilt || 0) * rad; return [Math.cos(t), Math.sin(t)]; };   // about the x axis
  // A body's turn (radians) at a moment: Earth by sidereal time, others by their day.
  function spin(b, ms) {
    if (b.id === "earth") return gmst(ms);
    if (b.kind === "Moon") return (((jd(ms) - 2451545) / Math.abs(b.period)) * TAU) % TAU;
    return b.rotH ? ((((jd(ms) - 2451545) * 24) / b.rotH) * TAU + H2(b.r, 1) * TAU) % TAU : 0;
  }

  // ------------------------------------------------------------- state
  let el = null, cv = null, g = null, raf = 0, last = 0, W = 0, Hh = 0, dpr = 1, cw = 6, ch = 10, cols = 0, rows = 0;
  let simMs = Date.now(), rate = 1, paused = false;
  const pos = {}, au = {};          // vis positions, true AU vectors (heliocentric)
  let cam = { target: [0, 0, 0], yaw: 0.9, pitch: 0.32, dist: 2.2, follow: "earth" }, goal = { dist: 1.4 };
  let selected = "earth", hover = "", dragging = null, idleUntil = 0, flight = null, showOrbits = true, showLabels = true;
  let labelsHit = [], portalPull = 0, portalShown = false;
  // The grid of characters.
  let G = null;
  function setup() {
    const r = cv.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return false;
    if (W === r.width && Hh === r.height && G) return true;
    dpr = 1;   // one canvas pixel per screen pixel: the picture is made of characters anyway
    W = r.width; Hh = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    ch = W > 1500 ? 10 : 9; cw = Math.round(ch * 0.62 * 10) / 10; cols = Math.ceil(W / cw); rows = Math.ceil(Hh / ch);
    const n = cols * rows; G = { gl: new Array(n), c: new Uint8ClampedArray(n * 3), a: new Float32Array(n), d: new Float32Array(n), id: new Array(n) };
    img = g.createImageData(cv.width, cv.height); px = new Uint32Array(img.data.buffer); masks.clear();
    return true;
  }
  // Characters are drawn once each into a mask (the pixels they cover and
  // how much); each frame copies the masks, coloured, into one picture.
  let img = null, px = null;
  const masks = new Map();
  function mask(gl) {
    let m = masks.get(gl);
    if (m) return m;
    const pw = Math.ceil(cw * dpr), ph = Math.ceil(ch * dpr), c = document.createElement("canvas"); c.width = pw; c.height = ph;
    const x = c.getContext("2d"); x.font = `700 ${ch * dpr}px ${font()}`; x.textBaseline = "top"; x.fillStyle = "#fff"; x.fillText(gl, 0, 0);
    const d = x.getImageData(0, 0, pw, ph).data, idx = [], val = [];
    for (let i = 0; i < pw * ph; i++) if (d[i * 4 + 3] > 8) { idx.push((Math.floor(i / pw) << 16) | (i % pw)); val.push(d[i * 4 + 3] / 255); }
    m = { idx: Int32Array.from(idx), val: Float32Array.from(val) };
    masks.set(gl, m);
    return m;
  }

  // ------------------------------------------------------------- sky
  // Named stars (IAU) at their places, a Milky Way of faint ones, galaxies.
  let SKY = [];
  function eqToEcl(ra, dec) { const x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec); return [x, y * Math.cos(OBL) + z * Math.sin(OBL), -y * Math.sin(OBL) + z * Math.cos(OBL)]; }
  async function buildSky() {
    if (SKY.length) return;
    let stars = [];
    try { stars = (await (await fetch("sky-data.json")).json()).stars || []; } catch {}
    const out = [];
    for (const [name, , mag, ra, dec] of stars) out.push({ d: eqToEcl(ra * rad, dec * rad), b: clamp((6.5 - mag) / 6), col: H2(ra, dec) > 0.7 ? [255, 220, 190] : H2(dec, ra) > 0.7 ? [190, 210, 255] : [240, 240, 250], name });
    // The Milky Way: faint stars crowded along the galactic plane (north galactic pole RA 192.86°, Dec 27.13°).
    const pole = eqToEcl(192.86 * rad, 27.13 * rad), e1 = norm(cross(pole, [0, 0, 1])), e2 = cross(pole, e1);
    for (let i = 0; i < 4200; i++) {
      const u = H2(i, 1) * TAU, spread = (H2(i, 2) - 0.5) * (H2(i, 3) > 0.6 ? 0.9 : 0.25), core = Math.cos(u - 2.3) > 0.6 ? 1.6 : 1;
      const d = norm(add(add(mul(e1, Math.cos(u)), mul(e2, Math.sin(u))), mul(pole, spread / core)));
      out.push({ d, b: 0.08 + 0.25 * H2(i, 4) * core, col: mix([150, 160, 200], [220, 200, 170], H2(i, 5)), mw: true });
    }
    for (let i = 0; i < 900; i++) { const z = H2(i, 7) * 2 - 1, a = H2(i, 8) * TAU, s = Math.sqrt(1 - z * z); out.push({ d: [s * Math.cos(a), s * Math.sin(a), z], b: 0.08 + 0.2 * H2(i, 9), col: [200, 205, 220] }); }
    // Andromeda (M31), the Large and Small Magellanic Clouds, Triangulum (M33).
    for (const [ra, dec, n, sx, sy, col, ang] of [[10.68, 41.27, 260, 0.05, 0.018, [230, 210, 255], 0.6], [80.9, -69.8, 160, 0.06, 0.035, [210, 220, 255], 0.2], [13.2, -72.8, 90, 0.035, 0.02, [210, 220, 255], 0.9], [23.46, 30.66, 70, 0.018, 0.012, [220, 210, 250], 1.2]]) {
      const c = eqToEcl(ra * rad, dec * rad), t1 = norm(cross(c, [0, 0, 1])), t2 = cross(c, t1);
      for (let i = 0; i < n; i++) { const r = Math.sqrt(H2(i, ra)) , a = H2(i, dec) * TAU + r * 4, x = Math.cos(a) * r * sx, y = Math.sin(a) * r * sy, ca = Math.cos(ang), sa = Math.sin(ang);
        out.push({ d: norm(add(c, add(mul(t1, x * ca - y * sa), mul(t2, x * sa + y * ca)))), b: 0.25 + 0.5 * (1 - r), col, gal: true }); }
    }
    SKY = out;
  }

  // ----------------------------------------------------------- update
  function update(dt) {
    if (!paused) simMs += dt * 1000 * rate;
    for (const id of PLANET_IDS) { const h = helio(id, simMs); au[id] = h; const r = len(h.p); pos[id] = mul(h.p, distVis(r) / (r || 1)); }
    au.sun = { p: [0, 0, 0], a: 0 }; pos.sun = [0, 0, 0];
    for (const m of MOONS) {
      const p = pos[m.parent], dist = moonDist(m);
      if (m.id === "moon") { const v = moonGeo(simMs); pos.moon = add(p, mul(norm(v), dist)); continue; }
      const th = (((jd(simMs) - 2451545) / m.period) * TAU) + H2(m.a, 3) * TAU, [ct, st] = tiltM(BY[m.parent]);
      const lx = Math.cos(th) * dist, ly = Math.sin(th) * dist;
      pos[m.id] = add(p, [lx, ly * ct, ly * st]);
    }
  }

  // ----------------------------------------------------------- camera
  function camBasis() {
    const t = cam.target, cp = Math.cos(cam.pitch);
    const p = add(t, mul([cp * Math.cos(cam.yaw), cp * Math.sin(cam.yaw), Math.sin(cam.pitch)], cam.dist));
    const f = norm(sub(t, p)), r = norm(cross(f, [0, 0, 1])), u = cross(r, f);
    return { p, f, r, u, focal: (Hh / 2) / Math.tan(30 * rad) };
  }
  function project(B, x) { const v = sub(x, B.p), z = dot(v, B.f); if (z < 0.01) return null; return [W / 2 + (dot(v, B.r) / z) * B.focal, Hh / 2 - (dot(v, B.u) / z) * B.focal, z]; }

  // ----------------------------------------------------------- render
  const put = (i, gl, c, a, d = 1e9, id = "") => { if (d > G.d[i]) return; G.gl[i] = gl; G.c[i * 3] = c[0]; G.c[i * 3 + 1] = c[1]; G.c[i * 3 + 2] = c[2]; G.a[i] = a; G.d[i] = d; G.id[i] = id; };
  function shadeBody(b, n, sunDir, t) {
    // n: world normal; to the body's frame (undo tilt and turn).
    let x = n[0], y = n[1], z = n[2];
    if (b.id === "earth") { const ye = y * Math.cos(OBL) - z * Math.sin(OBL), ze = y * Math.sin(OBL) + z * Math.cos(OBL); y = ye; z = ze; }
    else if (b.tilt) { const [ct, st] = tiltM(b); const yy = y * ct + z * st, zz = -y * st + z * ct; y = yy; z = zz; }
    const s = spin(b, simMs), cs = Math.cos(-s), ss = Math.sin(-s), xr = x * cs - y * ss, yr = x * ss + y * cs;
    const lat = Math.asin(clamp(z, -1, 1)) / rad, lon = ((Math.atan2(yr, xr) / rad + 540) % 360) - 180;
    const lit = dot(n, sunDir);
    const [col, gl, emit] = (TEX[b.tex || b.id] || TEX.grey)(lat, lon, t, lit);
    return { col, gl, emit, lit };
  }
  const RAMP = " .:-=+*#%@";
  function render(t) {
    const B = camBasis(), PR = window.__gxProfile, tt = () => performance.now();
    let T0 = tt();
    G.gl.fill(""); G.a.fill(0); G.d.fill(1e9); G.id.fill("");
    // Stars: directions only.
    for (const s of SKY) {
      const x = dot(s.d, B.r), y = dot(s.d, B.u), z = dot(s.d, B.f); if (z <= 0.05) continue;
      const sx = W / 2 + (x / z) * B.focal, sy = Hh / 2 - (y / z) * B.focal, c = Math.floor(sx / cw), r = Math.floor(sy / ch);
      if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
      const i = r * cols + c, tw = motion() && !s.mw && !s.gal ? 0.75 + 0.25 * Math.sin(t * (1.5 + H2(c, r) * 2) + c) : 1, br = s.b * tw;
      if (br <= G.a[i]) continue;
      put(i, s.gal ? (br > 0.55 ? "*" : "·") : br > 0.8 ? "✦" : br > 0.55 ? "*" : br > 0.3 ? "+" : "·", s.col, Math.min(1, 0.25 + br), 1e8);
    }
    if (PR) { PR.sky = (PR.sky || 0) + tt() - T0; T0 = tt(); }
    // Belts: the asteroids between Mars and Jupiter, the Kuiper Belt beyond Neptune.
    const days = jd(simMs) - 2451545;
    for (const [n0, a0, a1, zs, col, seed] of [[1400, 2.1, 3.3, 0.06, [170, 160, 140], 11], [1100, 30, 50, 0.12, [150, 170, 200], 23]]) {
      for (let i = 0; i < n0; i++) {
        const a = a0 + (a1 - a0) * H2(i, seed), th = H2(i, seed + 1) * TAU + (days / (365.25 * a ** 1.5)) * TAU, r = distVis(a), zz = (H2(i, seed + 2) - 0.5) * zs * r;
        const q = project(B, [Math.cos(th) * r, Math.sin(th) * r, zz]); if (!q) continue;
        const c = Math.floor(q[0] / cw), rr = Math.floor(q[1] / ch); if (c < 0 || rr < 0 || c >= cols || rr >= rows) continue;
        put(rr * cols + c, q[2] < 8 ? "•" : "·", col, clamp(1.2 - q[2] / 120, 0.25, 0.75), q[2]);
      }
    }
    if (PR) { PR.belts = (PR.belts || 0) + tt() - T0; T0 = tt(); }
    // Bodies, each over the cells it covers.
    for (const b of ALL) {
      const C = pos[b.id], R = radVis(b), oc = sub(B.p, C), q = project(B, C);
      if (!q) continue;
      const zf = q[2]; if (zf < R * 1.02) continue;
      const rp = (R / Math.sqrt(Math.max(1e-6, zf * zf - R * R))) * B.focal + ch;
      const sunDir = b.id === "sun" ? [0, 0, 1] : norm(mul(C, -1));
      // Tiny and far: one glowing character.
      if (rp < ch * 0.9) { const c = Math.floor(q[0] / cw), r = Math.floor(q[1] / ch); if (c >= 0 && r >= 0 && c < cols && r < rows) put(r * cols + c, b.kind === "Moon" ? "•" : "●", b.color, 1, zf, b.id); continue; }
      const ringOuter = b.id === "saturn" ? R * 2.3 : b.id === "uranus" ? R * 2.0 : 0, ext = Math.max(rp, ringOuter ? (ringOuter / zf) * B.focal + ch : 0);
      const c0 = Math.max(0, Math.floor((q[0] - ext) / cw)), c1 = Math.min(cols - 1, Math.ceil((q[0] + ext) / cw)), r0 = Math.max(0, Math.floor((q[1] - ext) / ch)), r1 = Math.min(rows - 1, Math.ceil((q[1] + ext) / ch));
      const [ct, st] = tiltM(b), ringN = [0, -st, ct];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const sx = (c + 0.5) * cw - W / 2, sy = Hh / 2 - (r + 0.5) * ch;
        const d = norm(add(add(mul(B.f, B.focal), mul(B.r, sx)), mul(B.u, sy)));
        const i = r * cols + c, bq = dot(oc, d), cc = dot(oc, oc) - R * R, disc = bq * bq - cc;
        let hitT = 1e9;
        if (disc > 0) {
          hitT = -bq - Math.sqrt(disc);
          if (hitT > 0 && hitT < G.d[i]) {
            const hp = add(B.p, mul(d, hitT)), n = mul(sub(hp, C), 1 / R);
            const s = shadeBody(b, n, sunDir, t);
            if (b.id === "sun") { put(i, s.gl, s.col, 1, hitT, b.id); continue; }
            const view = -dot(n, d), rim = clamp(1 - view);
            let lum = s.emit || 0.2 + 0.8 * clamp(s.lit * 1.15);
            let col = mix(mul(s.col, 0.28), s.col, clamp(lum));
            if ((b.id === "earth" || b.id === "venus" || b.id === "titan") && rim > 0.75 && s.lit > -0.2) col = mix(col, b.id === "earth" ? [140, 200, 255] : [240, 200, 140], (rim - 0.75) * 3);
            const gl = s.gl || RAMP[Math.max(1, Math.min(9, Math.round(Math.sqrt(clamp(lum)) * 9)))];
            put(i, gl, col, s.emit ? 1 : 0.55 + 0.45 * clamp(lum), hitT, b.id);
          }
        }
        // Rings (in the planet's equator plane).
        if (ringOuter) {
          const den = dot(d, ringN); if (Math.abs(den) < 1e-5) continue;
          const tr = dot(sub(C, B.p), ringN) / den; if (tr <= 0 || tr >= G.d[i] || (disc > 0 && tr > hitT && hitT > 0)) continue;
          const hp = add(B.p, mul(d, tr)), rr = len(sub(hp, C)) / R;
          const inner = b.id === "saturn" ? 1.24 : 1.6; if (rr < inner || rr > ringOuter / R) continue;
          if (b.id === "saturn" && rr > 1.95 && rr < 2.03) continue;   // the Cassini Division
          const dens = b.id === "saturn" ? 0.5 + 0.5 * Math.sin(rr * 40) * 0.5 + (rr < 1.5 ? -0.25 : 0) : 0.35;
          const lit = 0.55 + 0.45 * clamp(Math.abs(dot(norm(mul(C, -1)), ringN)) * 2);
          put(i, dens > 0.55 ? "=" : dens > 0.35 ? "-" : ":", mix([150, 140, 115], b.id === "saturn" ? [245, 230, 190] : [180, 220, 230], clamp(lit * (0.7 + dens * 0.5))), 0.65 + dens * 0.35, tr, b.id);
        }
      }
    }
    if (PR) { PR.bodies = (PR.bodies || 0) + tt() - T0; T0 = tt(); }
    // Paint: the characters into one picture, then the Sun's glow over it.
    // The background, with faint scanlines; then a warm glow round the Sun,
    // cell by cell; then each character over its cell.
    const PW = cv.width, PH = cv.height, BGc = (r, gg, b) => (255 << 24) | (b << 16) | (gg << 8) | r;
    const bg0 = BGc(3, 4, 10), bg1 = BGc(1, 2, 6);
    for (let y = 0; y < PH; y++) px.fill(y % 4 === 3 ? bg1 : bg0, y * PW, y * PW + PW);
    const sq = project(B, [0, 0, 0]), sr = sq ? (radVis(BY.sun) / sq[2]) * B.focal : 0, gR = sr * 4.5 + 40;
    const cellBg = new Float32Array(3);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c, gl = G.gl[i];
      let br = 3, bgG = 4, bb = 10;
      if (sq) { const dx = (c + 0.5) * cw - sq[0], dy = (r + 0.5) * ch - sq[1], dd = Math.hypot(dx, dy);
        if (dd < gR) { const k = (1 - dd / gR) ** 2.2 * 0.55; br += 255 * k; bgG += 150 * k; bb += 60 * k * 0.5;
          if (!gl || gl === " ") { const x0 = Math.round(c * cw), y0 = Math.round(r * ch), x1 = Math.min(PW, Math.round((c + 1) * cw)), y1 = Math.min(PH, Math.round((r + 1) * ch)), col = BGc(br | 0, bgG | 0, bb | 0);
            for (let y = y0; y < y1; y++) px.fill(col, y * PW + x0, y * PW + x1); continue; } } }
      if (!gl || gl === " ") continue;
      const m = mask(gl), a = G.a[i], cr = G.c[i * 3], cg = G.c[i * 3 + 1], cb = G.c[i * 3 + 2];
      const x0 = Math.round(c * cw), y0 = Math.round(r * ch);
      if (br > 3) { const x1 = Math.min(PW, Math.round((c + 1) * cw)), y1 = Math.min(PH, Math.round((r + 1) * ch)), col = BGc(br | 0, bgG | 0, bb | 0); for (let y = y0; y < y1; y++) px.fill(col, y * PW + x0, y * PW + x1); }
      for (let k = 0, L = m.idx.length; k < L; k++) {
        const v = m.idx[k], x = x0 + (v & 0xffff), y = y0 + (v >> 16); if (x >= PW || y >= PH) continue;
        const f = m.val[k] * a;
        px[y * PW + x] = (255 << 24) | ((bb + (cb - bb) * f) << 16) | ((bgG + (cg - bgG) * f) << 8) | (br + (cr - br) * f);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0); g.putImageData(img, 0, 0);
    if (PR) { PR.paint = (PR.paint || 0) + tt() - T0; T0 = tt(); }
    overlay(B, t);
    if (PR) PR.overlay = (PR.overlay || 0) + tt() - T0;
  }
  // A path through world points, broken where it goes behind the camera or
  // far off screen (huge coordinates make the canvas crawl).
  let orbitKey = "", orbitPts = {};
  function trace(B, pts) {
    g.beginPath(); let on = false;
    const lim = Math.max(W, Hh) * 3;
    for (const p of pts) { const q = project(B, p); if (!q || Math.abs(q[0] - W / 2) > lim || Math.abs(q[1] - Hh / 2) > lim) { on = false; continue; } on ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); on = true; }
  }
  // Orbits, labels and the reticle around the chosen body.
  function overlay(B, t) {
    const sig = css("--signal") || "#e8d27c";
    labelsHit = [];
    if (showOrbits) {
      // The paths change slowly: worked out again every few simulated days.
      const key = `${trueScale}|${Math.floor(simMs / 4e8)}`;
      if (orbitKey !== key) { orbitKey = key; for (const id of PLANET_IDS) orbitPts[id] = Array.from({ length: 161 }, (_, k) => { const h = helio(id, simMs, (k / 160) * TAU), r = len(h.p); return mul(h.p, distVis(r) / r); }); }
      for (const id of PLANET_IDS) {
        const sel = id === selected || BY[selected]?.parent === id;
        g.strokeStyle = `rgba(${BY[id].color.join(",")},${sel ? 0.6 : 0.2})`; g.lineWidth = sel ? 1.4 : 1;
        trace(B, orbitPts[id]); g.stroke();
      }
      // Moons' paths, around the planet in view.
      const focusP = BY[selected]?.kind === "Moon" ? BY[selected].parent : selected;
      for (const m of MOONS) if (m.parent === focusP) {
        const p = pos[m.parent], dist = moonDist(m), [ct, st] = tiltM(BY[m.parent]);
        g.strokeStyle = `rgba(200,200,210,${m.id === selected ? 0.55 : 0.18})`;
        const pts = [];
        for (let k = 0; k <= 64; k++) { const th = (k / 64) * TAU; let v = [Math.cos(th) * dist, Math.sin(th) * dist * ct, Math.sin(th) * dist * st];
          if (m.id === "moon") { const n0 = norm(sub(pos.moon, p)), e1 = norm(cross(n0, [0, 0, 1])); v = add(mul(n0, Math.cos(th) * dist), mul(e1, Math.sin(th) * dist)); }
          pts.push(add(p, v)); }
        trace(B, pts); g.stroke();
      }
    }
    g.font = `700 10px ${font()}`; g.textBaseline = "middle";
    const focusP = BY[selected]?.kind === "Moon" ? BY[selected].parent : selected;
    for (const b of ALL) {
      if (b.kind === "Moon" && b.parent !== focusP) continue;
      const q = project(B, pos[b.id]); if (!q || !showLabels) continue;
      const R = radVis(b), rp = (R / q[2]) * B.focal, on = b.id === selected, hv = b.id === hover;
      const text = (b.kind === "Moon" ? "· " : "◇ ") + b.name.toUpperCase(), x = q[0] + rp + 8, y = q[1] - rp - 6, w = g.measureText(text).width + 10;
      g.strokeStyle = `rgba(${b.color.join(",")},${on || hv ? 0.9 : 0.4})`; g.beginPath(); g.moveTo(q[0] + rp * 0.7, q[1] - rp * 0.7); g.lineTo(x - 2, y); g.stroke();
      g.fillStyle = on ? sig : hv ? "rgba(255,255,255,.9)" : "rgba(10,12,18,.72)"; g.fillRect(x - 2, y - 8, w, 16);
      g.fillStyle = on ? "#0a0a0a" : hv ? "#0a0a0a" : `rgb(${b.color.join(",")})`; g.fillText(text, x + 3, y + 0.5);
      labelsHit.push({ id: b.id, x: x - 2, y: y - 8, w, h: 16, cx: q[0], cy: q[1], rp: Math.max(rp, 8), z: q[2] });
    }
    // The reticle: corners that breathe around the chosen body.
    const sq = project(B, pos[selected]);
    if (sq) { const R = (radVis(BY[selected]) / sq[2]) * B.focal + 10 + (motion() ? 3 * Math.sin(t * 3) : 0), L = 10;
      g.strokeStyle = sig; g.lineWidth = 1.5; g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const x = sq[0] + sx * R, y = sq[1] + sy * R; g.moveTo(x, y - sy * L); g.lineTo(x, y); g.lineTo(x - sx * L, y); }
      g.stroke(); g.lineWidth = 1; }
  }

  // ----------------------------------------------------------- frame
  function frame(now) {
    raf = 0;
    if (!el || el.hidden || document.hidden) return;
    if (!setup()) { raf = requestAnimationFrame(frame); return; }
    // Paced: brisk while the user steers, calm (and light on the battery) while it circles on its own.
    const busy = dragging || keys.size || flight || now < idleUntil || Math.abs(goal.dist - cam.dist) > cam.dist * 0.01;
    if (now - last < 1000 / (busy ? 30 : 12) - 2) { raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.15, (now - (last || now)) / 1000); last = now;
    const P = window.__gxProfile, t0 = performance.now();
    update(dt);
    steer(dt, now);
    render(now / 1000);
    if (P) { P.n = (P.n || 0) + 1; P.total = (P.total || 0) + performance.now() - t0; }
    if (now - lastInfo > 500) { lastInfo = now; live(); clock(); }
    raf = requestAnimationFrame(frame);
  }
  let lastInfo = 0;
  // The camera glides to its goal; with no hand on it, it circles slowly.
  function steer(dt, now) {
    const tgt = cam.follow ? pos[cam.follow] : cam.target;
    if (flight) { const k = clamp((now - flight.t0) / flight.dur), e = k < 0.5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2;
      cam.target = add(flight.from, mul(sub(tgt, flight.from), e)); cam.dist = flight.d0 + (goal.dist - flight.d0) * e;
      if (flight.dy != null) { cam.yaw = flight.y0 + flight.dy * e; cam.pitch = flight.p0 + (flight.p1 - flight.p0) * e; }
      if (k >= 1) flight = null; }
    else { if (cam.follow) cam.target = tgt; cam.dist += (goal.dist - cam.dist) * Math.min(1, dt * 4); }
    if (now > idleUntil && motion()) cam.yaw += dt * 0.05;
    // Free flight: W A S D, Q E.
    if (keys.size) {
      const B = camBasis(), sp = cam.dist * 1.2 * dt, fwd = norm([B.f[0], B.f[1], 0]);
      let mv = [0, 0, 0];
      if (keys.has("w")) mv = add(mv, fwd); if (keys.has("s")) mv = sub(mv, fwd); if (keys.has("d")) mv = add(mv, B.r); if (keys.has("a")) mv = sub(mv, B.r); if (keys.has("e")) mv = add(mv, [0, 0, 1]); if (keys.has("q")) mv = sub(mv, [0, 0, 1]);
      if (len(mv)) { if (cam.follow) { cam.follow = ""; flight = null; freeNote(true); } cam.target = add(cam.target, mul(norm(mv), sp * 3)); idleUntil = now + 2500; }
    }
  }
  const minDist = (id) => radVis(BY[id]) * (id === "sun" ? 1.6 : 1.35);
  function focus(id, quiet = false) {
    const b = BY[id]; if (!b) return;
    selected = id; cam.follow = id; freeNote(false);
    // Arrive on the sunlit side, a little off the Sun's line.
    const C = pos[id], sunYaw = id === "sun" ? cam.yaw : Math.atan2(-C[1], -C[0]) + 0.75;
    let dy = ((sunYaw - cam.yaw + Math.PI) % TAU + TAU) % TAU - Math.PI;
    flight = { from: [...cam.target], d0: cam.dist, t0: performance.now(), dur: motion() ? 1600 : 1, y0: cam.yaw, dy, p0: cam.pitch, p1: id === "sun" ? 0.45 : 0.28 };
    goal.dist = Math.max(minDist(id) * 1.4, radVis(b) * (b.kind === "Moon" ? 7 : id === "sun" ? 6 : 5.5));
    info(); rail();
    if (!quiet) Sound.glitch();
  }

  // ------------------------------------------------------- the file
  let infoView = null;
  const fmt = (v, d = 0) => v.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
  function liveFacts(b) {
    const out = [];
    if (b.id === "sun") { const e = len(au.earth.p) * AU; out.push(["󰇧", "FROM EARTH", `${fmt(e / 1e6, 1)} million km · light takes ${Math.floor(e / 299792.458 / 60)} min ${Math.round((e / 299792.458) % 60)} s`]); out.push(["󱓞", "ITS OWN ORBIT", "around the galaxy's centre at about 230 km/s, once every 230 million years"]); return out; }
    if (b.kind === "Moon") {
      const p = BY[b.parent], v = (TAU * b.a) / (Math.abs(b.period) * 86400);
      const dKm = b.id === "moon" ? len(moonGeo(simMs)) : b.a;
      out.push(["󰐊", `FROM ${p.name.toUpperCase()}`, `${fmt(dKm)} km`]); out.push(["󰓅", "ORBITAL SPEED", `${fmt(v, 2)} km/s`]); out.push(["󰔟", "ONE ORBIT", `${fmt(Math.abs(b.period), 2)} days${b.period < 0 ? " (backwards)" : ""}`]);
      if (b.id === "moon") { const ml = window.UmbraFieldKit?.moonLight?.(new Date(simMs)); if (ml) out.push(["󰽥", "LIT TONIGHT", `${Math.round(ml.fraction * 100)}%`]); }
      return out;
    }
    const h = au[b.id], r = len(h.p), v = Math.sqrt(GM * (2 / (r * AU) - 1 / (h.a * AU))), e = len(sub(h.p, au.earth.p)) * AU;
    out.push(["󰖨", "FROM THE SUN", `${fmt(r, 3)} AU · ${fmt((r * AU) / 1e6, 1)} million km`]);
    if (b.id !== "earth") out.push(["󰇧", "FROM EARTH", `${fmt(e / 1e6, 1)} million km · light ${e / 299792.458 > 3600 ? fmt(e / 299792.458 / 3600, 1) + " h" : fmt(e / 299792.458 / 60, 1) + " min"}`]);
    out.push(["󰓅", "ORBITAL SPEED NOW", `${fmt(v, 2)} km/s · ${fmt(v * 3600)} km/h`]);
    if (b.rotH) out.push(["󰑓", "SPIN AT THE EQUATOR", `${fmt((TAU * b.r) / Math.abs(b.rotH))} km/h`]);
    out.push(["󰃭", "ONE YEAR", b.yearD > 1000 ? `${fmt(b.yearD / 365.25, 1)} Earth years` : `${fmt(b.yearD, 1)} Earth days`]);
    if (b.id === "earth") { const sd = sub([0, 0, 0], au.earth.p), lon = ((((Math.atan2(sd[1], sd[0]) - gmst(simMs)) / rad) % 360) + 540) % 360 - 180;
      out.push(["󰖙", "NOON IS NOW OVER", `longitude ${fmt(Math.abs(lon), 1)}° ${lon >= 0 ? "E" : "W"}`]); }
    return out;
  }
  function info() {
    const b = BY[selected], box = el.querySelector(".gx-info");
    infoView?.stop(); infoView = null;
    const parent = b.kind === "Moon" ? BY[b.parent] : null;
    box.innerHTML = `
      <div class="gx-ihead"><span>${esc(b.kind.toUpperCase())}${parent ? ` OF ${esc(parent.name.toUpperCase())}` : ""}</span><button class="ghost gx-ix" title="Hide the file">✕</button></div>
      <div class="gx-art"><canvas></canvas></div>
      <h2 data-text="${esc(b.name.toUpperCase())}">${esc(b.name.toUpperCase())}</h2>
      <p class="gx-tag">${esc(b.tag)}</p>
      <div class="gx-live"></div>
      <div class="gx-sec">THE NUMBERS</div>
      <div class="gx-facts">${[["󰆧", "RADIUS", `${fmt(b.r, b.r < 100 ? 1 : 0)} km`], ["󰆧", "MASS", b.mass], ["󰔶", "GRAVITY", b.g], ["󰑓", "DAY", b.day], ["󰔄", "TEMPERATURE", b.temp], ["󰇧", "AXIS TILT", b.tilt != null ? `${b.tilt}°` : ""],
        ["󰽥", "MOONS", b.moons != null ? String(b.moons) : ""], ["󱑂", "AGE", b.age]].filter((x) => x[2]).map(([gl, k, v]) => `<div><b class="g">${gl}</b><span>${k}</span><p>${esc(v)}</p></div>`).join("")}</div>
      ${b.atmo ? `<div class="gx-sec">AIR</div><p>${esc(b.atmo)}</p>` : ""}
      ${b.made ? `<div class="gx-sec">MADE OF</div><p>${esc(b.made)}</p>` : ""}
      ${b.res ? `<div class="gx-sec">RESOURCES</div><p>${esc(b.res)}</p>` : ""}
      ${b.visit ? `<div class="gx-sec">VISITED BY</div><p>${esc(b.visit)}</p>` : ""}
      ${b.know ? `<div class="gx-know"><b class="g">󰛨</b><div><b>DID YOU KNOW</b><p>${esc(b.know)}</p></div></div>` : ""}
      ${MOONS.some((m) => m.parent === b.id) ? `<div class="gx-sec">ITS MOONS HERE</div><div class="gx-moons">${MOONS.filter((m) => m.parent === b.id).map((m) => `<button data-go="${m.id}">${esc(m.name)}</button>`).join("")}</div>` : ""}
      <div class="gx-actions">${b.id === "earth" ? `<button class="solid" data-a="land"><b class="g">󰍍</b> LAND ON EARTH</button>` : ""}<button class="ghost" data-a="lib"><b class="g">󱉟</b> FIND IN LIBRARY</button><button class="ghost" data-a="ask"><b class="g">󰭹</b> ASK UMBRA</button></div>
      <p class="gx-src">${b.approx || (b.kind === "Moon" && b.id !== "moon") ? "Position approximate. " : ""}Planets: JPL Keplerian elements · facts: NASA planetary fact sheets. Sizes enlarged and distances ${trueScale ? "to scale" : "squeezed"} so all can be seen.</p>`;
    box.hidden = false;
    box.classList.remove("in"); void box.offsetWidth; box.classList.add("in");
    live();
    box.querySelector(".gx-ix").addEventListener("click", () => { box.hidden = true; infoView?.stop(); infoView = null; });
    box.querySelectorAll("[data-go]").forEach((x) => x.addEventListener("click", () => focus(x.dataset.go)));
    box.querySelector("[data-a=land]")?.addEventListener("click", () => land());
    box.querySelector("[data-a=lib]").addEventListener("click", () => library(b));
    box.querySelector("[data-a=ask]").addEventListener("click", () => ask(b));
    requestAnimationFrame(() => { const c = box.querySelector(".gx-art canvas"); if (c && selected === b.id) infoView = A.view(c, portrait(b), { cell: 6, font: font() }); });
  }
  function live() {
    const box = el?.querySelector(".gx-live"); if (!box || box.closest("[hidden]")) return;
    box.innerHTML = liveFacts(BY[selected]).map(([gl, k, v]) => `<div><b class="g">${gl}</b><span>${k}</span><p>${esc(v)}</p></div>`).join("");
  }
  // The body's portrait: a sphere turning, its own surface, lit from the side.
  function portrait(b) {
    const ring = b.id === "saturn" ? [1.24, 2.27] : b.id === "uranus" ? [1.6, 2.0] : null;
    return { camera: () => ({ pos: [0, ring ? 0.55 : 0.15, ring ? 4.2 : 3.0], at: [0, 0, 0], fovV: 42 }), light: [-0.6, 0.3, 0.75], ambient: b.id === "sun" ? 1 : 0.16, shadows: false, shimmerFps: 12,
      sky: (u, v, t, col, row) => (H2(col, row) > 0.982 ? ["·", [200, 210, 240], 0.3 + 0.3 * Math.sin(t + col)] : null),
      map: (x, y, z, t, h) => { let d = Math.hypot(x, y, z) - 1; h.m = "body"; if (ring) { const r = Math.hypot(x, z); const dr = Math.max(Math.abs(y + x * 0.25) - 0.01, ring[0] - r, r - ring[1]); if (dr < d) { d = dr; h.m = "ring"; } } return d; },
      materials: {
        body: { color: b.color, ramp: RAMP, shade(c, t) { const s = (motion() ? t * 0.25 : 1) + (b.id === "earth" ? 0 : 0);
          const lat = Math.asin(clamp(c.ny, -1, 1)) / rad, lon = ((((Math.atan2(c.nx, c.nz) + s) / rad) % 360) + 540) % 360 - 180;
          const lit = c.nx * -0.6 + c.ny * 0.3 + c.nz * 0.75;
          const [col, gl, emit] = (TEX[b.tex || b.id] || TEX.grey)(lat, lon, t * 4, lit);
          c.color = col; if (gl) c.glyph = gl; if (emit) c.emit = emit; if (b.id === "sun") c.emit = 0.9; } },
        ring: { color: [220, 205, 170], ramp: " .-=", shade(c) { const r = Math.hypot(c.x, c.z); c.glyph = r > 1.95 && r < 2.03 ? " " : Math.sin(r * 40) > 0 ? "=" : "-"; c.color = b.id === "uranus" ? [170, 210, 220] : [225, 210, 170]; } } },
      particles: b.id === "sun" ? (t, put) => { for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU + t * 0.1, rr = 1.12 + 0.25 * (0.5 + 0.5 * Math.sin(t * 2 + i * 3)); put(Math.cos(a) * rr, Math.sin(a) * rr, 0.2, "*", [255, 190, 90], 0.5); } } : null,
    };
  }
  function library(b) {
    fetch(`/api/library/find?q=${encodeURIComponent(b.kind === "Moon" && b.id !== "moon" ? `${b.name} (moon)` : b.id === "earth" ? "Earth" : b.name)}`).then((r) => r.json())
      .then((hits) => { if (hits.length) { const id = b.id; close(true); openedFrom(() => { toggle(true, true).then(() => focus(id, true)); }); openReader(hits[0]); Sound.click(); } else { note(`NOTHING ABOUT ${b.name.toUpperCase()} IN YOUR LIBRARY YET`); Sound.error(); } }).catch(() => {});
  }
  function ask(b) {
    close(true);
    const what = b.kind === "Moon" ? `${b.name}, the moon of ${BY[b.parent].name}` : b.kind === "Star" ? "the Sun, our star" : `the ${b.kind.toLowerCase()} ${b.name}`;
    const box = $("#q"); box.value = `Tell me about ${what}: what is it like, what is it made of, and could people ever live there?`;
    box.dispatchEvent(new Event("input")); box.focus();
  }

  // --------------------------------------------------------- the rail
  function rail() {
    const box = el.querySelector(".gx-rail");
    box.innerHTML = ["sun", ...PLANET_IDS].map((id) => { const b = BY[id], on = id === selected || BY[selected]?.parent === id;
      return `<button data-go="${id}" class="${on ? "on" : ""}" style="--c:rgb(${b.color.join(",")})"><i></i><b>${esc(b.name.toUpperCase())}</b><small data-d="${id}"></small></button>${on && MOONS.some((m) => m.parent === id) ? `<div class="gx-sub">${MOONS.filter((m) => m.parent === id).map((m) => `<button data-go="${m.id}" class="${m.id === selected ? "on" : ""}">${esc(m.name)}</button>`).join("")}</div>` : ""}`; }).join("");
    box.querySelectorAll("[data-go]").forEach((x) => x.addEventListener("click", () => focus(x.dataset.go)));
  }
  function clock() {
    if (!el) return;
    const d = new Date(simMs), now = Math.abs(simMs - Date.now()) < 60000 && rate === 1 && !paused;
    el.querySelector(".gx-time b").textContent = d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    el.querySelector(".gx-time small").textContent = paused ? "PAUSED" : now ? "LIVE · NOW" : rate === 1 ? "REAL TIME" : `× ${RATES.find((r) => r[0] === rate)?.[1] || rate}`;
    el.querySelectorAll(".gx-rail small[data-d]").forEach((s) => { const id = s.dataset.d; s.textContent = id === "sun" ? "" : `${fmt(len(au[id].p), 2)} AU`; });
  }
  const RATES = [[1, "REAL TIME"], [3600, "1 HOUR / S"], [86400, "1 DAY / S"], [86400 * 30, "1 MONTH / S"], [86400 * 365, "1 YEAR / S"]];
  let noteT = 0;
  function note(text) { const n = el.querySelector(".gx-note"); n.textContent = text; n.hidden = false; clearTimeout(noteT); noteT = setTimeout(() => (n.hidden = true), 3200); }
  function freeNote(on) { el?.querySelector(".gx-free")?.toggleAttribute("hidden", !on); }

  // ------------------------------------------------------- the portal
  // Leaving orbit (Maps → Galaxy) or coming down to Earth (Galaxy → Maps):
  // a short flight in characters, the switch happening halfway.
  function portal(kind, mid) {
    const ov = document.createElement("canvas"); ov.className = "gx-portal"; document.body.appendChild(ov);
    const w = innerWidth, h = innerHeight, pr = Math.min(2, devicePixelRatio || 1); ov.width = w * pr; ov.height = h * pr;
    const c = ov.getContext("2d"); c.scale(pr, pr);
    const dur = motion() ? 1700 : 300, t0 = performance.now(), up = kind === "up", streaks = Array.from({ length: 260 }, (_, i) => [H2(i, 1) * TAU, H2(i, 2), H2(i, 3)]);
    let switched = false;
    if (window.Sound) up ? Sound.searchstart?.() : Sound.glitch?.();
    const step = (now) => {
      const k = clamp((now - t0) / dur), mid0 = k > 0.5;
      if (mid0 && !switched) { switched = true; try { mid(); } catch {} }
      const fade = k < 0.5 ? k * 2 : (1 - k) * 2;
      c.clearRect(0, 0, w, h);
      c.fillStyle = up ? `rgba(3,4,10,${Math.min(1, fade * 1.4)})` : `rgba(${Math.round(40 * (1 - k))},${Math.round(20 * (1 - k))},10,${Math.min(1, fade * 1.4)})`; c.fillRect(0, 0, w, h);
      c.font = `700 14px ${font()}`; c.textAlign = "center";
      const cx = w / 2, cy = h / 2, sp = up ? k : 1 - k;
      for (const [a, r0, sd] of streaks) {
        const r1 = ((r0 + sp * 1.6) % 1) * Math.hypot(w, h) * 0.6, r2 = r1 + 30 + 160 * fade * sd;
        c.strokeStyle = up ? `rgba(${200 + 55 * sd},${210 + 40 * sd},255,${0.6 * fade})` : `rgba(255,${150 + 80 * sd},${80 + 60 * sd},${0.6 * fade})`;
        c.beginPath(); c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); c.stroke();
      }
      c.fillStyle = `rgba(255,255,255,${Math.max(0, 1 - Math.abs(k - 0.5) * 6) * 0.85})`; c.fillRect(0, 0, w, h);
      c.fillStyle = up ? `rgba(200,220,255,${fade})` : `rgba(255,210,150,${fade})`;
      c.fillText(up ? "◆ LEAVING ORBIT ◆" : "◆ ENTERING THE ATMOSPHERE ◆", cx, cy + 4);
      if (k < 1) requestAnimationFrame(step); else ov.remove();
    };
    requestAnimationFrame(step);
  }
  // A prompt that asks before going (keeps pulling: it fills a ring).
  function promptBox(host, title, line, yes, onYes) {
    if (host.querySelector(".gx-ask")) return;
    const box = document.createElement("div"); box.className = "gx-ask";
    box.innerHTML = `<div class="gx-ask-ring"><i></i></div><b>${title}</b><p>${line}</p><div><button class="ghost" data-n>STAY</button><button class="solid" data-y>${yes} ▸</button></div>`;
    host.appendChild(box); Sound.glitch?.();
    const done = (go) => { box.classList.add("out"); setTimeout(() => box.remove(), 250); document.removeEventListener("keydown", key, true); if (go) onYes(); };
    const key = (e) => { if (e.key === "Enter") { e.preventDefault(); e.stopImmediatePropagation(); done(true); } else if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); done(false); } };
    box.querySelector("[data-y]").addEventListener("click", () => done(true)); box.querySelector("[data-n]").addEventListener("click", () => done(false));
    document.addEventListener("keydown", key, true);
    return box;
  }
  // From the Maps: called while the user keeps zooming out of the whole world.
  let mapPull = 0, mapPullT = 0;
  function pullFromMaps(amount, lat, lon, host) {
    if (host.querySelector(".gx-ask")) return;
    mapPull += amount; clearTimeout(mapPullT);
    // A gauge fills while the pull lasts; it drains if the user stops.
    let gauge = host.querySelector(".gx-gauge");
    if (!gauge) { gauge = document.createElement("div"); gauge.className = "gx-gauge"; gauge.innerHTML = "<i></i><b>KEEP ZOOMING OUT TO LEAVE ORBIT</b>"; host.appendChild(gauge); }
    gauge.style.setProperty("--p", Math.min(1, mapPull / 3)); gauge.classList.add("on");
    mapPullT = setTimeout(() => { mapPull = 0; gauge.classList.remove("on"); }, 1600);
    if (mapPull < 3) return;
    mapPull = 0; gauge.classList.remove("on");
    promptBox(host, "LEAVE ORBIT?", "You've zoomed out past the whole world. Go up to the GALAXY: the solar system, live, with the Earth turning below you.", "ENTER GALAXY", () => {
      portal("up", () => { window.closeMaps?.(); open({ from: [lat, lon] }); });
    });
  }
  // Coming down: the camera is pressed against the Earth.
  function land() {
    const sel = BY[selected]; if (sel.id !== "earth") return;
    // The point of the Earth under the camera.
    const B = camBasis(), n = norm(sub(B.p, pos.earth));
    let [x, y, z] = n; const ye = y * Math.cos(OBL) - z * Math.sin(OBL), ze = y * Math.sin(OBL) + z * Math.cos(OBL);
    const s = gmst(simMs), xr = x * Math.cos(-s) - ye * Math.sin(-s), yr = x * Math.sin(-s) + ye * Math.cos(-s);
    const lat = Math.asin(clamp(ze, -1, 1)) / rad, lon = ((Math.atan2(yr, xr) / rad + 540) % 360) - 180;
    portal("down", () => { close(true); window.openMapsAt?.(lat, lon, 4); });
  }

  // ------------------------------------------------------------- input
  const keys = new Set();
  function pick(x, y) {
    let best = null;
    for (const h of labelsHit) {
      if ((x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) || Math.hypot(x - h.cx, y - h.cy) <= h.rp) { if (!best || h.z < best.z) best = h; }
    }
    return best && best.id;
  }
  function wire() {
    cv.addEventListener("pointerdown", (e) => { dragging = { x: e.clientX, y: e.clientY, moved: 0 }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => {
      const r = cv.getBoundingClientRect();
      if (dragging) { const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y; dragging.moved += Math.abs(dx) + Math.abs(dy); dragging.x = e.clientX; dragging.y = e.clientY;
        cam.yaw -= dx * 0.005; cam.pitch = clamp(cam.pitch + dy * 0.004, -1.45, 1.45); idleUntil = performance.now() + 3000; return; }
      const id = pick(e.clientX - r.left, e.clientY - r.top); if (id !== hover) { hover = id || ""; cv.style.cursor = hover ? "pointer" : "grab"; }
    });
    cv.addEventListener("pointerup", (e) => { const r = cv.getBoundingClientRect(); if (dragging && dragging.moved < 5) { const id = pick(e.clientX - r.left, e.clientY - r.top); if (id) focus(id); } dragging = null; });
    cv.addEventListener("wheel", (e) => {
      e.preventDefault(); idleUntil = performance.now() + 2500;
      const k = Math.exp(e.deltaY * 0.0015), min = cam.follow ? minDist(cam.follow) : 0.3;
      if (cam.follow === "earth" && e.deltaY < 0 && goal.dist <= min * 1.02) {
        portalPull += -e.deltaY / 100;
        if (portalPull > 3 && !el.querySelector(".gx-ask")) { portalPull = 0;
          promptBox(el.querySelector(".gx-body"), "LAND ON EARTH?", "You're skimming the atmosphere. Go down to the MAPS, right where you are above the Earth.", "OPEN MAPS", () => land()); }
        return;
      }
      portalPull = 0;
      goal.dist = clamp(goal.dist * k, min, trueScale ? 900 : 120);
      flight = null;
    }, { passive: false });
    cv.addEventListener("dblclick", (e) => { const r = cv.getBoundingClientRect(), id = pick(e.clientX - r.left, e.clientY - r.top); if (id) { focus(id); goal.dist = minDist(id) * 1.6; } });
    el.querySelector(".gx-close").addEventListener("click", () => toggle(false));
    el.querySelectorAll(".gx-tog").forEach((b) => b.addEventListener("click", () => {
      const t = b.dataset.t;
      if (t === "orbits") showOrbits = !showOrbits; else if (t === "labels") showLabels = !showLabels;
      else if (t === "scale") { trueScale = !trueScale; note(trueScale ? "TRUE DISTANCES: THE OUTER PLANETS ARE VERY FAR" : "DISTANCES SQUEEZED SO ALL CAN BE SEEN"); focus(selected, true); }
      b.classList.toggle("on", t === "orbits" ? showOrbits : t === "labels" ? showLabels : trueScale); Sound.click();
    }));
    el.querySelectorAll(".gx-rate button").forEach((b) => b.addEventListener("click", () => {
      const r = b.dataset.r;
      if (r === "pause") paused = !paused; else if (r === "now") { simMs = Date.now(); rate = 1; paused = false; } else { rate = +r; paused = false; }
      el.querySelectorAll(".gx-rate button").forEach((x) => x.classList.toggle("on", (x.dataset.r === "pause" && paused) || (!paused && +x.dataset.r === rate)));
      clock(); Sound.click();
    }));
    document.addEventListener("keydown", (e) => {
      if (!el || el.hidden || !$("#modal").hidden || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if (e.key === "Escape") { e.stopImmediatePropagation(); if (el.querySelector(".gx-ask")) return; toggle(false); return; }
      if ("wasdqe".includes(k) && k.length === 1) { keys.add(k); e.preventDefault(); }
      else if (k === "f") { focus(selected); }
      else if (k === "o") el.querySelector(".gx-tog[data-t=orbits]").click();
      else if (k === " ") { e.preventDefault(); el.querySelector(".gx-rate [data-r=pause]").click(); }
    }, true);
    document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => keys.clear());
  }

  // ------------------------------------------------------------- build
  function build() {
    if (el) return;
    el = document.createElement("div"); el.id = "galaxy"; el.className = "galaxy"; el.hidden = true;
    el.innerHTML = `
      <div class="gx-head">
        <span class="lo-title"><span class="spin" data-spin>✻</span> GALAXY</span>
        <div class="gx-time" title="Simulated time|The positions shown are for this moment. LIVE follows the clock."><b></b><small></small></div>
        <div class="pf-choice gx-rate">
          <button data-r="pause" title="Pause · Space">❚❚</button>${RATES.map(([r, n]) => `<button data-r="${r}" class="${r === 1 ? "on" : ""}" title="${n === "REAL TIME" ? "Real time" : `Speed up|${n.replace(" / S", " every second")}`}">${r === 1 ? "▶" : n.replace(/^1 (\w).* \/ S$/, "1$1/S")}</button>`).join("")}<button data-r="now" title="Back to now|The real positions at this very moment.">NOW</button>
        </div>
        <div class="gx-tools">
          <button class="ctl gx-tog on" data-t="orbits" title="Orbits · O|The planets' paths."><span class="g">󰑓</span></button>
          <button class="ctl gx-tog on" data-t="labels" title="Names|Name tags on the planets and moons."><span class="g">󰓹</span></button>
          <button class="ctl gx-tog" data-t="scale" title="True distances|Off: distances squeezed so the whole system fits. On: to scale (the outer planets are very far)."><span class="g">󰘖</span></button>
          <button class="ghost gx-close" title="Close · Esc">CLOSE ✕</button>
        </div>
      </div>
      <div class="gx-body">
        <canvas class="gx-canvas"></canvas>
        <nav class="gx-rail"></nav>
        <aside class="gx-info" hidden></aside>
        <div class="gx-free" hidden>FREE FLIGHT · W A S D · Q E · F TO FOLLOW AGAIN</div>
        <div class="gx-note" hidden></div>
        <div class="gx-hint">DRAG TO TURN · SCROLL TO ZOOM · CLICK A WORLD · W A S D TO FLY · SPACE PAUSES</div>
      </div>`;
    document.body.appendChild(el);
    cv = el.querySelector(".gx-canvas"); g = cv.getContext("2d");
    wire();
    new ResizeObserver(() => { G = null; W = 0; }).observe(el.querySelector(".gx-body"));
  }
  async function toggle(show = !el || el.hidden, quiet = false, opts = {}) {
    build();
    if (show && (window.locked || document.body.classList.contains("locked"))) return;
    if (!show) {
      if (el.hidden) return;
      el.hidden = true; cancelAnimationFrame(raf); raf = 0; infoView?.stop(); infoView = null; keys.clear();
      document.body.classList.remove("galaxy-open"); $("#galaxy-btn")?.classList.remove("on");
      if (!quiet) { Sound.click(); if (typeof goBack === "function") goBack(); }
      window.startRain?.();
      return;
    }
    ["closeSettings", "closeHistory", "closeFieldKit", "closeMaps", "closeRadar", "closeOutpost", "closeFriends"].forEach((k) => window[k]?.());
    window.closeLoadout?.(true); window.toggleFarming?.(false, true); toggleThemes?.(false, true);
    $("#library").hidden = true; $("#library-btn")?.classList.remove("on");
    el.hidden = false; document.body.classList.add("galaxy-open"); $("#galaxy-btn")?.classList.add("on");
    window.stopRain?.();
    await buildSky();
    simMs = Date.now(); rate = 1; paused = false; update(0);
    selected = "earth"; cam.follow = "earth"; cam.target = [...pos.earth]; flight = null;
    // From the Maps: start just above that place, then rise.
    if (opts.from) {
      const [lat, lon] = opts.from, s = gmst(simMs) + lon * rad, xe = Math.cos(lat * rad) * Math.cos(s), ye = Math.cos(lat * rad) * Math.sin(s), ze = Math.sin(lat * rad);
      const n = [xe, ye * Math.cos(OBL) + ze * Math.sin(OBL), -ye * Math.sin(OBL) + ze * Math.cos(OBL)];
      cam.yaw = Math.atan2(n[1], n[0]); cam.pitch = Math.asin(clamp(n[2], -1, 1)); cam.dist = minDist("earth") * 1.05;
    } else { cam.dist = radVis(BY.earth) * 9; cam.yaw = Math.atan2(-pos.earth[1], -pos.earth[0]) + 0.75; cam.pitch = 0.28; }
    goal.dist = radVis(BY.earth) * 5.5;
    info(); rail(); clock();
    if (!quiet) Sound.searchstart?.();
    last = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function open(opts = {}) { toggle(true, true, opts); }
  function close(quiet = false) { if (el && !el.hidden) toggle(false, quiet); }

  build();
  $("#galaxy-btn")?.addEventListener("click", () => toggle());
  // Another full screen opening closes this one (and locking does).
  new MutationObserver(() => {
    if (!el || el.hidden) return;
    const other = ["#outpost", "#maps", "#fieldkit", "#farming", "#radar", "#loadout", "#friends"].some((s) => { const x = $(s); return x && !x.hidden; });
    if (other || document.body.classList.contains("locked")) toggle(false, true);
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ["hidden", "class"] });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && el && !el.hidden && !raf) { last = 0; raf = requestAnimationFrame(frame); } });
  window.toggleGalaxy = toggle;
  window.closeGalaxy = () => close(true);
  return { open, close, toggle, pullFromMaps, portal, focus, bodies: ALL, helio };
})();
