// Umbra Outpost's living things in 3D ASCII: the creatures you fight, the
// companions you find, people (raiders, the trader, and you in the gear you
// wear), and the scenes they live in: the duel, the trader's post, the
// bounty board and the four expedition sites. Each is built from signed
// distance shapes (ascii3d.js), breathes, sways or whirs, and is drawn as a
// still picture until it's looked at closely (hover, a fight).
// Loaded after ascii3d.js and outpost-models.js.
"use strict";

window.UmbraBeings = (() => {
  const A = window.Ascii3D, { sd, noise2, hash2, hex, mix } = A;
  const U = (b, d, m, h) => { if (d < b[0]) { b[0] = d; h.m = m; } };
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const RAMP = { solid: " .:-=+*#%@", metal: " .:=+#%@", wood: " .:|=#H", cloth: " .:;=+#%", fur: " .:-=+*#%@", skin: " .:-=+*#", leaf: " .:*%#&@", rock: " .:-=+#%@" };
  // Very dark colours vanish on Umbra's dark ground: lift them to a readable charcoal.
  const lum = (c) => .3 * c[0] + .59 * c[1] + .11 * c[2];
  const H = (c) => { const v = hex(c), l = lum(v); return l < 95 ? mix(v, [150, 150, 160], (95 - l) / 160) : v; };
  const solid = (c, ramp = RAMP.solid) => ({ color: H(c), ramp });
  const metal = (c) => ({ color: H(c), ramp: RAMP.metal, spec: .55 });
  const cloth = (c, c2) => ({ color: H(c), ramp: RAMP.cloth, shade(k) { if (c2) k.color = mix(H(c), H(c2), noise2(k.x * 9 + k.z * 4, k.y * 9)); } });
  const fur = (c, c2, f = 14) => ({ color: H(c), ramp: RAMP.fur, shade(k) { k.color = mix(H(c), H(c2 || c), noise2(k.x * f + k.z * 5, k.y * f)); } });
  const glow = (c, pulse = 0, glyph = "@") => ({ color: hex(c), shade(k, t) { k.emit = .85 + pulse * Math.sin(t * 4 + k.x * 3); k.glyph = glyph; } });
  const darken = (c, k = .35) => "#" + hex(c).map((v) => Math.round(v * (1 - k)).toString(16).padStart(2, "0")).join("");
  const lighten = (c, k = .3) => "#" + hex(c).map((v) => Math.round(v + (255 - v) * k).toString(16).padStart(2, "0")).join("");
  // An ellipsoid (approximate, good enough for bodies and wings).
  const ell = (x, y, z, rx, ry, rz) => { const k = Math.min(rx, ry, rz); return (Math.hypot(x / rx, y / ry, z / rz) - 1) * k; };

  // ================================================================ people
  // Feet at y = 0, about 1.8 tall, facing +z. o: colours, head, body, legs,
  // feet, hands, cloak, back, weapon, offhand, charm, eyes, scale, sit, smoke.
  function person(o = {}, p = "") {
    const C = { skin: "#d9a982", hair: "#4a3828", shirt: "#7a6a52", pants: "#4f4a40", boots: "#3a2e26", ...(o.colors || {}) };
    const S = o.scale || 1, sit = !!o.sit, dy = sit ? -.37 : 0;
    const mats = {};
    const m = (k, mat) => { mats[p + k] = mat; return p + k; };
    const SK = m("skin", solid(C.skin, RAMP.skin)), HR = m("hair", fur(C.hair, darken(C.hair, .3))), SH = m("shirt", cloth(C.shirt, darken(C.shirt, .2)));
    const PA = m("pants", cloth(o.legs?.color || C.pants, darken(o.legs?.color || C.pants, .25)));
    const BO = m("boots", solid(o.feet?.color || C.boots, RAMP.wood)), GL = m("gloves", solid(o.hands?.color || C.skin, o.hands ? RAMP.cloth : RAMP.skin));
    const EY = m("eyes", o.eyes ? glow(o.eyes, .15, "o") : solid("#1a1410"));
    const AR = o.body ? m("armour", o.body.metal ? { ...metal(o.body.color), shade(k) { if (Math.abs(k.x) < .02) k.glyph = "|"; } } : cloth(o.body.color, darken(o.body.color, .3))) : SH;
    const LG = o.legs?.metal ? m("greaves", metal(o.legs.color)) : PA;
    const HD = o.head ? m("headgear", o.head.metal ? metal(o.head.color) : o.head.kind === "visor" ? glow(o.head.color || "#88c0f0", .1, "=") : cloth(o.head.color, darken(o.head.color, .3))) : HR;
    const CL = o.cloak ? m("cloak", cloth(o.cloak, darken(o.cloak, .35))) : null;
    const WP = o.weapon ? m("weapon", o.weapon.kind === "bow" || o.weapon.kind === "slingshot" ? solid(o.weapon.color || "#8a6a48", RAMP.wood) : metal(o.weapon.color || "#c3cad2")) : null;
    const WG = m("grip", solid("#5a4232", RAMP.wood)), GW = m("glowpart", glow(o.weapon?.glow || o.charm || "#7fc6e6", .25)), STR = m("string", { color: hex("#e8e2d0"), shade(k) { k.glyph = "|"; } });
    const SHD = o.offhand ? m("shield", o.offhand.metal ? metal(o.offhand.color) : solid(o.offhand.color, RAMP.wood)) : null;
    const BK = o.back ? m("back", o.back.kind === "tank" ? metal(o.back.color || "#c8b040") : cloth(o.back.color || "#6a5a44", "#4a3a2a")) : null;
    const CIG = m("cig", { color: [255, 140, 60], shade(k, t) { k.emit = .6 + .4 * Math.max(0, Math.sin(t * .9)); k.glyph = "*"; } });
    const parts = (x, y, z, b, h, t) => {
      const X = x / S, Y = y / S, Z = z / S, sb = [99, ""];
      const br = .006 * Math.sin(t * 1.9), sway = .03 * Math.sin(t * 1.25);
      const u = (d, mat) => { if (d < sb[0]) { sb[0] = d; sb[1] = mat; } };
      // Legs and boots.
      for (const s of [-1, 1]) {
        if (sit) {
          u(sd.capsule(X, Y, Z, s * .1, .58, 0, s * .12, .56, .42, .085), LG); u(sd.capsule(X, Y, Z, s * .12, .56, .42, s * .13, .1, .46, .07), LG);
          u(sd.rbox(X - s * .13, Y - .06, Z - .52, .065, .06, .12, .03), BO);
        } else {
          const step = o.pose === "guard" ? s * .05 : 0;
          u(sd.capsule(X, Y, Z, s * .1, .92, 0, s * .115, .5, .03 + step, .085), LG); u(sd.capsule(X, Y, Z, s * .115, .5, .03 + step, s * .12, .12, .01 + step, .072), LG);
          u(sd.rbox(X - s * .12, Y - .06, Z - .06 - step, .065, .06, .12, .03), BO);
        }
      }
      // Body.
      u(sd.rbox(X, Y - (1.18 + dy + br), Z, .2, .26, .115, .07), SH);
      u(sd.box(X, Y - (.94 + dy), Z, .205, .03, .12), BO);
      if (o.body) { u(sd.rbox(X, Y - (1.25 + dy + br), Z, .225, .2, .135, .06), AR); if (o.body.metal) for (const s of [-1, 1]) u(sd.sphere(X - s * .25, Y - (1.43 + dy), Z, .1), AR); }
      if (o.charm) u(sd.sphere(X, Y - (1.32 + dy), Z - .15, .032), GW);
      // Arms: the right one (x < 0) holds the weapon, the left one the shield or the bow.
      const shoulderY = 1.42 + dy;
      const arm = (s, elbow, hand) => {
        u(sd.capsule(X, Y, Z, s * .25, shoulderY, 0, ...elbow, .062), o.body && o.body.metal ? AR : SH);
        u(sd.capsule(X, Y, Z, ...elbow, ...hand, .055), o.hands ? GL : SH);
        u(sd.sphere(X - hand[0], Y - hand[1], Z - hand[2], .055), GL);
      };
      let rh, lh;
      if (o.smoke) {
        rh = [-.07, 1.58 + dy, .17]; arm(-1, [-.3, 1.18 + dy, .2], rh);
        u(sd.capsule(X, Y, Z, rh[0] + .02, rh[1] + .01, rh[2], .02, rh[1] + .03, rh[2] + .1, .012), m("paper", solid("#f2ece0")));
        u(sd.sphere(X - .02, Y - (rh[1] + .03), Z - (rh[2] + .1), .018), CIG);
      } else {
        rh = [-.31, .86 + dy + sway * .3, .1]; arm(-1, [-.3, 1.12 + dy, .04], rh);
      }
      lh = o.weapon?.kind === "bow" ? [.3, 1.1 + dy, .28] : sit ? [.22, .62 + dy + .37, .3] : [.31, .86 + dy - sway * .3, .1];
      arm(1, o.weapon?.kind === "bow" ? [.32, 1.2 + dy, .1] : sit ? [.3, 1.1 + dy, .12] : [.3, 1.12 + dy, .04], lh);
      // Weapons.
      const w = o.weapon;
      if (w && !o.smoke) {
        const [hx, hy, hz] = rh;
        if (w.kind === "blade") { u(sd.capsule(X, Y, Z, hx, hy + .06, hz - .02, hx, hy - .06, hz + .04, .03), WG); u(sd.capsule(X, Y, Z, hx, hy - .06, hz + .06, hx, hy - .2, hz + .55, .03), WP); }
        else if (w.kind === "club") u(sd.capsule(X, Y, Z, hx, hy - .04, hz, hx, hy + .12, hz + .55, .045), WP);
        else if (w.kind === "axe") { u(sd.capsule(X, Y, Z, hx, hy - .1, hz, hx, hy + .4, hz + .35, .035), WG); u(sd.box(X - hx, Y - (hy + .38), Z - (hz + .42), .03, .13, .1), WP); }
        else if (w.kind === "rifle") { u(sd.capsule(X, Y, Z, hx, hy + .02, hz - .05, .05, 1.3 + dy, .5, .04), WP); u(sd.capsule(X, Y, Z, hx + .02, hy, hz, hx - .05, hy - .15, hz - .25, .045), WG); }
        else if (w.kind === "gadget") { u(sd.rbox(X - hx, Y - hy, Z - (hz + .14), .05, .06, .14, .02), WP); u(sd.sphere(X - hx, Y - hy, Z - (hz + .3), .045), GW); }
        else if (w.kind === "slingshot") { u(sd.capsule(X, Y, Z, hx, hy, hz, hx, hy + .16, hz + .06, .022), WP); for (const s of [-1, 1]) u(sd.capsule(X, Y, Z, hx, hy + .16, hz + .06, hx + s * .07, hy + .28, hz + .08, .018), WP); }
        else if (w.kind === "bow") {
          const [bx, by, bz] = lh, R = .46;
          u(Math.max(Math.abs(sd.torus(Y - by, X - bx, Z - (bz - .32), R, 0)) - .025, -(Z - (bz - .32) - .12)), WP);
          u(sd.capsule(X, Y, Z, bx, by - R * .93, bz - .14, bx, by + R * .93, bz - .14, .006), STR);
        }
      }
      if (o.offhand) u(sd.rbox(X - .37, Y - (1.02 + dy), Z - .12, .03, .2, .16, .03), SHD);
      // Head.
      const hy = 1.68 + dy + br * .5, turn = .04 * Math.sin(t * .7);
      const HX = X - turn;
      u(sd.capsule(X, Y, Z, 0, 1.45 + dy, 0, 0, hy - .05, 0, .05), SK);
      u(sd.sphere(HX, Y - hy, Z, .125), SK);
      for (const s of [-1, 1]) u(sd.sphere(HX - s * .045, Y - (hy + .02), Z - .112, .019), EY);
      if (!o.head || o.head.kind === "bandana" || o.head.kind === "visor") u(Math.max(sd.sphere(HX, Y - (hy + .035), Z + .015, .13), -(Y - (hy + .03))), HR);
      const g = o.head;
      if (g) {
        if (g.kind === "helmet") { u(Math.max(sd.sphere(HX, Y - (hy + .02), Z, .155), -(Y - (hy - .01))), HD); u(sd.box(HX, Y - (hy - .005), Z - .03, .17, .012, .17), HD); }
        else if (g.kind === "hood") { u(Math.max(sd.sphere(HX, Y - (hy + .015), Z + .02, .165), -sd.sphere(HX, Y - (hy - .01), Z - .13, .12)), HD); u(sd.capsule(X, Y, Z, 0, hy - .1, -.08, 0, 1.4 + dy, -.1, .12), HD); }
        else if (g.kind === "cap") { u(Math.max(sd.sphere(HX, Y - (hy + .03), Z, .135), -(Y - (hy + .03))), HD); u(sd.box(HX, Y - (hy + .03), Z - .14, .1, .01, .06), HD); }
        else if (g.kind === "bandana") u(sd.rbox(HX, Y - (hy - .05), Z - .07, .13, .045, .08, .02), HD);
        else if (g.kind === "visor") u(sd.box(HX, Y - (hy + .02), Z - .1, .13, .028, .04), HD);
        else if (g.kind === "gasmask") { u(sd.sphere(HX, Y - (hy - .04), Z - .1, .08), HD); for (const s of [-1, 1]) u(sd.capsule(X, Y, Z, s * .06 - turn, hy - .07, .1, s * .1 - turn, hy - .12, .16, .035), HD); u(Math.max(sd.sphere(HX, Y - (hy + .02), Z, .15), -(Y - (hy + .04))), HD); }
        else if (g.kind === "crown") { u(sd.torus(HX, Z, Y - (hy + .1), .12, .022), HD); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; u(sd.cone(HX - Math.cos(a) * .12, Y - (hy + .1), Z - Math.sin(a) * .12, .025, .1), HD); } }
      }
      // Cloak and what's on the back.
      if (CL) {
        const d = Math.max(0, shoulderY - Y), cz = -.15 - .1 * d - .03 * Math.sin(t * 1.4) * d;
        u(Math.max(sd.box(X, Y - (shoulderY - .5 - (sit ? -.1 : 0)), Z - cz, .26 + d * .05, sit ? .4 : .52, .018), -(Y - .25 - (sit ? .3 : 0))), CL);
      }
      if (BK) {
        if (o.back.kind === "quiver") { u(sd.capsule(X, Y, Z, -.1, 1.0 + dy, -.17, .12, 1.48 + dy, -.2, .05), BK); for (let i = 0; i < 3; i++) u(sd.cone(X - (.13 - i * .03), Y - (1.5 + dy), Z + .21, .025, .08), m("fletch", solid("#e8e2d0"))); }
        else if (o.back.kind === "pack") u(sd.rbox(X, Y - (1.15 + dy), Z + .21, .17, .2, .09, .04), BK);
        else if (o.back.kind === "tank") for (const s of [-1, 1]) u(sd.capsule(X, Y, Z, s * .08, .95 + dy, -.2, s * .08, 1.4 + dy, -.2, .07), BK);
        else if (o.back.kind === "antenna") { u(sd.rbox(X, Y - (1.15 + dy), Z + .2, .14, .18, .08, .03), BK); u(sd.capsule(X, Y, Z, .1, 1.3 + dy, -.22, .14, 2.1 + dy, -.22, .012), m("ant", metal("#c0c6cc"))); u(sd.sphere(X - .14, Y - (2.12 + dy), Z + .22, .03), m("blink", { color: [255, 80, 60], shade(k, t) { k.emit = Math.sin(t * 3) > 0 ? 1 : .2; k.glyph = "@"; } })); }
      }
      if (sb[0] * S < b[0]) { b[0] = sb[0] * S; h.m = sb[1]; }
    };
    return { parts, mats, height: 1.85 * S, len: .8 * S, facing: "z" };
  }

  // ================================================================ animals
  // Four legs, facing +x, standing on y = 0.
  function beast(o, p = "") {
    const s = o.s || 1, L = o.L ?? .7, H = o.H ?? .38, G = o.G ?? .17, hr = o.hr ?? G * .85;
    const mats = {};
    const m = (k, mat) => { mats[p + k] = mat; return p + k; };
    const FU = m("fur", o.spots ? { color: hex(o.color), ramp: RAMP.fur, shade(k) { k.color = noise2(k.x * 22, k.y * 22 + k.z * 9) > .66 ? hex(darken(o.color, .45)) : hex(o.color); } } : fur(o.color, o.color2 || darken(o.color, .2)));
    const BE = m("belly", fur(o.belly || lighten(o.color, .25), o.color)), DK = m("dark", solid("#1a1412"));
    const EY = m("eyes", o.eyes ? glow(o.eyes, .2, "o") : solid("#120e0c")), TK = m("tusk", solid(o.hornColor || "#efe6d0"));
    const SP = m("spikes", { color: hex(o.color), ramp: " .^^AA#", shade(k) { k.glyph = "^"; k.color = mix(hex(o.color), hex("#e8dcc0"), noise2(k.x * 30, k.z * 30) * .6); } });
    const SHL = m("shell", { color: hex(o.shell || "#6a7a4a"), ramp: RAMP.rock, shade(k) { const c = Math.floor(k.x * 9) + Math.floor(k.z * 9); k.glyph = (Math.abs(Math.sin(k.x * 18)) < .15 || Math.abs(Math.sin(k.z * 18)) < .15) ? "+" : c % 2 ? "#" : "%"; } });
    const parts = (x, y, z, b, h, t) => {
      const X = x / s, Y = y / s, Z = z / s, sb = [99, ""], u = (d, mat) => { if (d < sb[0]) { sb[0] = d; sb[1] = mat; } };
      const br = 1 + .03 * Math.sin(t * 2.2), y0 = H + G, bob = .012 * Math.sin(t * 1.7);
      if (o.shellBody) {   // a tortoise: a dome on short legs
        u(Math.max(ell(X, Y - H, Z, L * .55, G * 1.7, G * 1.6), -(Y - H + .02)), SHL);
        u(sd.box(X, Y - H, Z, L * .5, .02, G * 1.3), m("rim", solid(darken(o.shell || "#6a7a4a", .3))));
      } else if (o.spiky) {
        u(Math.max(ell(X, Y - (H + G * .6), Z, L * .5, G * 1.4, G * 1.3) - .02 * noise2(X * 30, Z * 30), -(Y - H + .03)), SP);
      } else {
        u(sd.capsule(X, Y, Z, -L / 2, y0, 0, L / 2, y0 + .02, 0, G * br), FU);
        u(sd.sphere(X - (L / 2 - .02), Y - (y0 - .02), Z, G * 1.06 * br), FU);
        u(sd.sphere(X + (L / 2 - .04), Y - y0, Z, G * 1.02), FU);
        u(ell(X - .02, Y - (y0 - G * .45), Z, L * .45, G * .5, G * .7), BE);
        if (o.ridge) u(sd.capsule(X, Y, Z, -L / 2, y0 + G * .9, 0, L / 2, y0 + G * 1.05, 0, .03), m("ridge", { color: hex(darken(o.color, .4)), shade(k) { k.glyph = "^"; } }));
      }
      // Neck and head.
      const nx = L / 2 + (o.neck ?? .1), ny = y0 + (o.neckUp ?? .14) + bob, hx = nx + .05, hy = ny + .04;
      if (!o.shellBody && !o.spiky) u(sd.capsule(X, Y, Z, L / 2 - .02, y0 + .03, 0, nx, ny, 0, G * .62), o.mane ? m("mane", fur(o.mane, darken(o.mane, .3), 20)) : FU);
      if (o.mane) u(sd.sphere(X - (L / 2 + .02), Y - (y0 + .08), Z, G * 1.25) + .02 * noise2(X * 25, Y * 25), mats[p + "mane"] ? p + "mane" : FU);
      u(sd.sphere(X - hx, Y - hy, Z, hr), FU);
      const sn = o.snout ?? hr * 1.1;
      u(sd.capsule(X, Y, Z, hx + hr * .4, hy - hr * .2, 0, hx + hr * .4 + sn, hy - hr * .35, 0, hr * (o.snoutR ?? .5)), o.snoutColor ? m("snout", fur(o.snoutColor, o.color)) : FU);
      u(sd.sphere(X - (hx + hr * .4 + sn + hr * .3), Y - (hy - hr * .33), Z, hr * .22), o.noseColor ? m("nose", solid(o.noseColor)) : DK);
      for (const sz of [-1, 1]) u(sd.sphere(X - (hx + hr * .55), Y - (hy + hr * .25), Z - sz * hr * .55, hr * .17), EY);
      for (const sz of [-1, 1]) {
        const ex = hx - hr * .1, ez = sz * hr * .6;
        if (o.ear === "point" || o.ear === "tuft") { u(sd.cone(X - ex, Y - (hy + hr * .7), Z - ez, hr * .38, hr * (o.ear === "tuft" ? 1.1 : .85)), FU); if (o.ear === "tuft") u(sd.capsule(X, Y, Z, ex, hy + hr * 1.75, ez, ex, hy + hr * 2.15, ez, .012), DK); }
        else if (o.ear === "round") u(sd.sphere(X - ex, Y - (hy + hr * .8), Z - ez, hr * .32), FU);
        else if (o.ear === "flop") u(sd.capsule(X, Y, Z, ex, hy + hr * .6, ez * 1.2, ex + .02, hy - hr * .2, ez * 1.55, hr * .22), FU);
        if (o.horns) u(sd.capsule(X, Y, Z, ex, hy + hr * .7, ez * .7, ex - .14, hy + hr * 1.7, ez * 1.3, .025), TK);
      }
      if (o.tusks) for (const sz of [-1, 1]) u(sd.capsule(X, Y, Z, hx + hr * .4 + sn * .7, hy - hr * .55, sz * hr * .35, hx + hr * .4 + sn * .9, hy - hr * .05, sz * hr * .45, .016), TK);
      if (o.beard) u(sd.cone(X - (hx + hr * .7), -(Y - (hy - hr * .5)), Z, hr * .25, hr * .8), FU);
      // Legs.
      const legR = o.legR ?? G * .3, fx = L / 2 - .05, fz = o.shellBody || o.spiky ? G * .9 : G * .55;
      for (const [lx, lz, ph] of [[fx, fz, 0], [fx, -fz, 1], [-fx, fz, 1], [-fx, -fz, 0]]) {
        const kick = .015 * Math.sin(t * 1.7 + ph * 3);
        u(sd.capsule(X, Y, Z, lx, y0 - G * .2, lz, lx + .02 + kick, H * .5, lz, legR * 1.55), FU);
        u(sd.capsule(X, Y, Z, lx + .02 + kick, H * .5, lz, lx + .04, .04, lz, legR * .9), o.socks ? m("socks", solid(o.socks)) : FU);
        u(sd.sphere(X - (lx + .06), Y - .035, Z - lz, legR * 1.05), o.socks ? p + "socks" : FU);
      }
      // Tail.
      const tw = Math.sin(t * (o.tail === "bush" ? 2.4 : 1.6)) * .12;
      const tx = -L / 2 - .02, ty = y0 + .04;
      if (o.tail === "thin") { u(sd.capsule(X, Y, Z, tx, ty, 0, tx - .25, ty - .12, tw, .02), m("tailskin", solid(o.tailColor || "#c89a8a"))); u(sd.capsule(X, Y, Z, tx - .25, ty - .12, tw, tx - .5, ty - .2, tw * 2.2, .013), p + "tailskin"); }
      else if (o.tail === "bush") u(sd.capsule(X, Y, Z, tx, ty, 0, tx - (o.tailLen ?? .32), ty - .1, tw, G * .38), o.tailTip ? m("tailtip", fur(o.tailTip, o.color)) : FU);
      else if (o.tail === "short") u(sd.sphere(X - tx, Y - ty, Z - tw * .3, G * .3), FU);
      else if (o.tail === "curl") u(sd.torus(X - (tx - .04), Y - (ty + .04), Z, .04, .012), FU);
      else if (o.tail === "flat") u(ell(X - (tx - .2), Y - (ty - .15), Z - tw * .3, .2, .03, .1), m("paddle", { color: hex("#4a3a2c"), shade(k) { k.glyph = (Math.floor(k.x * 40) + Math.floor(k.z * 40)) % 2 ? "#" : "+"; } }));
      else if (o.tail === "lizard") { u(sd.capsule(X, Y, Z, tx, y0 - .02, 0, tx - .3, .05, tw * 1.5, G * .4), FU); u(sd.capsule(X, Y, Z, tx - .3, .05, tw * 1.5, tx - .6, .04, tw * 3, G * .2), FU); }
      if (sb[0] * s < b[0]) { b[0] = sb[0] * s; h.m = sb[1]; }
    };
    return { parts, mats, height: (H + G * 2 + (o.neckUp ?? .14) + hr * 1.6) * s, len: (L + (o.neck ?? .1) + hr * 2 + (o.snout ?? hr) + (o.tail === "bush" ? (o.tailLen ?? .32) : o.tail === "thin" ? .5 : o.tail === "lizard" ? .6 : .1) + .1) * s, facing: "x" };
  }

  // Birds, facing +x. o: color, color2, beak, crest, upright (owls), tail, wings spread.
  function bird(o, p = "") {
    const s = o.s || 1, mats = {};
    const m = (k, mat) => { mats[p + k] = mat; return p + k; };
    const BD = m("body", fur(o.color, o.color2 || darken(o.color, .2), 18)), WG = m("wing", { color: hex(o.wing || darken(o.color, .15)), ramp: " .:-=#%", shade(k) { k.glyph = Math.sin(k.x * 60) > 0 ? "=" : "-"; if (o.wingTip && k.x < -.1) k.color = hex(o.wingTip); } });
    const BK = m("beak", solid(o.beak || "#e0a030")), EY = m("eyes", o.bigEyes ? { color: hex("#ffcf40"), shade(k) { k.emit = .9; k.glyph = "O"; } } : solid("#100c0a"));
    const BL = m("belly", fur(o.belly || lighten(o.color, .3), o.color, 18)), LG = m("legs", solid(o.legs || "#c8a060"));
    const parts = (x, y, z, b, h, t) => {
      const X = x / s, Y = y / s, Z = z / s, sb = [99, ""], u = (d, mat) => { if (d < sb[0]) { sb[0] = d; sb[1] = mat; } };
      const flap = o.spread ? .35 + .35 * Math.sin(t * 3) : .15 * Math.max(0, Math.sin(t * 1.3)) ** 6, by = o.upright ? .42 : .34;
      if (o.upright) u(ell(X, Y - by, Z, .2, .3, .2), BD); else u(ell(X, Y - by, Z, .3, .17, .16), BD);
      u(ell(X - .05, Y - (by - .06), Z, o.upright ? .16 : .24, .12, .13), BL);
      const hx = o.upright ? .02 : .26, hy = o.upright ? by + .3 : by + .14, hr = o.upright ? .17 : .11;
      u(sd.sphere(X - hx, Y - hy, Z, hr), BD);
      const bx0 = hx + hr * .8, bl = o.beakLen || .12;
      u(Math.max(Math.hypot(Y - (hy - .01), Z) - .032 * (1 - clamp((X - bx0) / bl)) - .004, bx0 - X, X - (bx0 + bl)), BK);
      for (const sz of [-1, 1]) u(sd.sphere(X - (hx + hr * (o.upright ? .75 : .55)), Y - (hy + .03), Z - sz * hr * (o.upright ? .42 : .6), hr * (o.bigEyes ? .3 : .16)), EY);
      if (o.tufts) for (const sz of [-1, 1]) u(sd.cone(X - (hx - .02), Y - (hy + hr * .7), Z - sz * hr * .55, .04, .12), BD);
      if (o.crest) u(ell(X - (hx - .04), Y - (hy + hr * .85), Z, .09, .05, .03), m("crest", solid(o.crest)));
      for (const sz of [-1, 1]) {   // wings fold along the body, or spread and beat
        const a = sz * flap * 2.2, wy = Y - (by + .05), wz = Z - sz * .15, c = Math.cos(a), sn = Math.sin(a);
        const ry = wy * c - wz * sn * -1, rz = wz * c + wy * sn * -1;
        u(ell(X + .05, ry, rz - sz * (o.spread ? .25 : .02), o.spread ? .2 : .26, .03, o.spread ? .34 : .1), WG);
      }
      const tl = o.tail ?? .22;
      u(ell(X + (o.upright ? .05 : .32 + tl * .5), Y - (o.upright ? by - .25 : by + .02), Z, tl * .55, .025, .08), WG);
      for (const sz of [-1, 1]) u(sd.capsule(X, Y, Z, 0, by - (o.upright ? .28 : .14), sz * .06, .03, .02, sz * .06, .015), LG);
      if (sb[0] * s < b[0]) { b[0] = sb[0] * s; h.m = sb[1]; }
    };
    return { parts, mats, height: (o.upright ? .95 : .62) * s, len: (o.spread ? 1.1 : .95) * s, facing: "x" };
  }

  function moth(p = "") {
    const mats = { [p + "mbody"]: fur("#8a7a6a", "#5a4a3a", 30), [p + "mwing"]: { color: hex("#c8b8a0"), ramp: " .:+*#", shade(k) { const r = Math.hypot(k.x * 1.4, k.y - .45); k.glyph = Math.abs(Math.sin(r * 30)) < .3 ? "o" : "*"; k.color = r % .12 < .04 ? hex("#6a5a4a") : hex("#d8c8a8"); } } };
    const parts = (x, y, z, b, h, t) => {
      U(b, sd.capsule(x, y, z, -.18, .45, 0, .16, .45, 0, .055), p + "mbody", h);
      const f = .5 * Math.sin(t * 9);
      for (const sz of [-1, 1]) for (const [ox, rx] of [[.06, .2], [-.1, .14]]) {
        const a = sz * f, wy = y - .47, wz = z - sz * .02, c = Math.cos(a), sn = Math.sin(a);
        U(b, ell(x - ox, wy * c + wz * sn, (wz * c - wy * sn) - sz * rx * 1.1, rx, .012, rx * 1.2), p + "mwing", h);
      }
      for (const sz of [-1, 1]) U(b, sd.capsule(x, y, z, .17, .48, sz * .02, .3, .6, sz * .08, .006), p + "mbody", h);
    };
    return { parts, mats, height: .8, len: .8, facing: "x" };
  }

  // The bog pike: half out of black water, jaws working.
  function pike(p = "") {
    const mats = { [p + "scales"]: { color: hex("#5f7a4a"), ramp: " .:-=#%", shade(k) { k.color = noise2(k.x * 26, k.y * 26) > .6 ? hex("#c8c070") : hex("#4f6a3c"); if (k.y < .25) k.color = hex("#d8d0a0"); } },
      [p + "fin"]: solid("#8a5a3a"), [p + "teeth"]: solid("#f2ecd8"), [p + "peye"]: glow("#e8d040", .1, "o"),
      ground: { color: hex("#2a3a30"), ramp: " .-~≈", shade(k, t) { const n = noise2(k.x * 3 + t * .4, k.z * 4); k.glyph = n > .6 ? "≈" : "~"; k.color = mix(hex("#1f2a24"), hex("#5a7a6a"), n); } } };
    const parts = (x, y, z, b, h, t) => {
      const lift = .08 * Math.sin(t * 1.2), jaw = .04 + .04 * Math.max(0, Math.sin(t * 2.5));
      U(b, Math.max(y - .02 * Math.sin(x * 4 + t), Math.hypot(x, z) - .9), "ground", h);
      const Y = y - lift;
      U(b, sd.capsule(x, Y, z, -.6, .22, 0, .35, .38, 0, .14), p + "scales", h);
      U(b, sd.capsule(x, Y, z, .35, .38, 0, .62, .44 + jaw, 0, .07), p + "scales", h);
      U(b, sd.capsule(x, Y, z, .35, .33, 0, .6, .32 - jaw, 0, .06), p + "scales", h);
      for (let i = 0; i < 5; i++) U(b, sd.cone(x - (.4 + i * .045), -(Y - (.4 + jaw - .02)), z, .012, .05), p + "teeth", h);
      for (const sz of [-1, 1]) U(b, sd.sphere(x - .4, Y - .45, z - sz * .07, .025), p + "peye", h);
      U(b, sd.cone(x + .55, Y - .1, z, .1, .3), p + "fin", h); U(b, sd.cone(x + .1, Y - .48, z, .05, .16), p + "fin", h);
    };
    return { parts, mats, height: .7, len: 1.4, facing: "x", water: true };
  }

  // ================================================================ machines
  function drone(o, p = "") {
    const mats = { [p + "hull"]: o.rust ? { color: hex("#9a6a4a"), ramp: RAMP.metal, shade(k) { if (noise2(k.x * 14, k.y * 14) > .6) k.color = hex("#6a3a2a"); } } : metal(o.color || "#9aa4ac"),
      [p + "rotor"]: { color: hex("#d8dce0"), shade(k, t) { const a = Math.atan2(k.z, k.x) * 2 + t * 30; k.glyph = "-\\|/"[Math.floor(((a % 6.283) + 6.283) % 6.283 / 1.571)]; k.alpha = .55; } },
      [p + "deye"]: glow(o.eye || "#ff4a3c", .2, "@"), [p + "core"]: glow(o.core || o.eye || "#b192e6", .3, "*") };
    const parts = (x, y, z, b, h, t) => {
      const hy = .75 + .06 * Math.sin(t * 2.6), S = o.s || 1, X = x / S, Y = y / S - (hy - .75) / S, Z = z / S, sb = [99, ""], u = (d, mat) => { if (d < sb[0]) { sb[0] = d; sb[1] = mat; } };
      if (o.kind === "sentry") { u(sd.capsule(X, Y, Z, 0, .62, 0, 0, .9, 0, .2), p + "hull"); u(sd.capsule(X, Y, Z, .1, .7, 0, .45, .68, 0, .035), p + "hull"); u(sd.sphere(X - .2, Y - .82, Z, .06), p + "deye"); }
      else { u(sd.sphere(X, Y - .75, Z, .24), p + "hull"); u(sd.sphere(X - .2, Y - .76, Z, .07), p + "deye"); if (o.kind === "warden") { u(Math.abs(sd.sphere(X, Y - .75, Z, .32)) - .02 + Math.max(0, Math.abs(Y - .75) - .07), p + "hull"); u(sd.sphere(X, Y - .75, Z, .12), p + "core"); } }
      for (const a of [.785, 2.356, 3.927, 5.498]) {
        const ax = Math.cos(a) * .42, az = Math.sin(a) * .42;
        u(sd.capsule(X, Y, Z, 0, .78, 0, ax, .84, az, .025), p + "hull");
        u(Math.max(Math.hypot(X - ax, Z - az) - .13, Math.abs(Y - .88) - .008), p + "rotor");
      }
      if (sb[0] * S < b[0]) { b[0] = sb[0] * S; h.m = sb[1]; }
    };
    return { parts, mats, height: 1.1 * (o.s || 1), len: 1.1 * (o.s || 1), facing: "x" };
  }
  function mech(p = "") {
    const mats = { [p + "plate"]: { ...metal("#8a9098"), shade(k) { if (Math.abs(Math.sin(k.y * 14)) < .1) k.glyph = "="; } }, [p + "joint"]: metal("#4a4e54"), [p + "visor"]: glow("#ff4a3c", .15, "=") };
    const parts = (x, y, z, b, h, t) => {
      const stomp = .03 * Math.max(0, Math.sin(t * 1.6));
      for (const sz of [-1, 1]) { U(b, sd.capsule(x, y, z, 0, .05, sz * .2, .08, .5 + stomp, sz * .2, .08), p + "joint", h); U(b, sd.capsule(x, y, z, .08, .5, sz * .2, -.02, .95, sz * .18, .09), p + "plate", h); U(b, sd.rbox(x - .04, y - .04, z - sz * .2, .14, .04, .09, .02), p + "plate", h); }
      U(b, sd.rbox(x, y - 1.2, z, .28, .25, .3, .06), p + "plate", h); U(b, sd.box(x - .26, y - 1.27, z, .03, .04, .18), p + "visor", h);
      for (const sz of [-1, 1]) { U(b, sd.capsule(x, y, z, 0, 1.3, sz * .38, .2, 1.0, sz * .42, .07), p + "joint", h); U(b, sd.capsule(x, y, z, .2, 1.0, sz * .42, .62, 1.02 + .03 * Math.sin(t * 2 + sz), sz * .42, .06), p + "plate", h); }
      U(b, sd.capsule(x, y, z, -.1, 1.45, -.15, -.15, 1.85, -.2, .015), p + "joint", h);
    };
    return { parts, mats, height: 1.9, len: 1.3, facing: "x" };
  }
  function sentinel(o, p = "") {
    const mats = { [p + "pylon"]: { ...metal(o.color || "#5a6470"), shade(k) { if (Math.abs(Math.sin(k.y * 9)) < .12) k.glyph = "="; } }, [p + "seye"]: glow(o.eye || "#7fc6e6", .3, "@"),
      [p + "halo"]: { color: hex(o.eye || "#7fc6e6"), shade(k, t) { k.emit = .7 + .3 * Math.sin(Math.atan2(k.z, k.x) * 4 + t * 3); k.glyph = "o"; } } };
    const parts = (x, y, z, b, h, t) => {
      const S = o.s || 1, X = x / S, Y = y / S, Z = z / S, sb = [99, ""], u = (d, mat) => { if (d < sb[0]) { sb[0] = d; sb[1] = mat; } }, f = .05 * Math.sin(t * 1.4);
      u(sd.cone(X, Y, Z, .32, .5), p + "pylon");
      u(sd.rbox(X, Y - .85, Z, .2, .38, .16, .05), p + "pylon");
      u(sd.rbox(X, Y - (1.45 + f), Z, .14, .12, .12, .04), p + "pylon");
      u(sd.sphere(X - .12, Y - (1.46 + f), Z, .055), p + "seye");
      for (const sz of [-1, 1]) u(sd.rbox(X, Y - (1.15 + f * 1.5), Z - sz * (.36 + f), .12, .2, .05, .03), p + "pylon");
      if (o.halo) u(Math.abs(sd.torus(X, Z, Y - (1.85 + f), .32, 0)) - .025, p + "halo");
      if (o.mast) u(sd.capsule(X, Y, Z, 0, 1.55, 0, 0, 2.05, 0, .015), p + "pylon");
      if (sb[0] * S < b[0]) { b[0] = sb[0] * S; h.m = sb[1]; }
    };
    return { parts, mats, height: (o.halo ? 2.0 : 1.9) * (o.s || 1), len: .9 * (o.s || 1), facing: "x" };
  }
  function keeper(p = "") {
    const mats = { [p + "vine"]: { color: hex("#4f7a3c"), ramp: " .:;=%#&", shade(k) { k.color = mix(hex("#3a5a2e"), hex("#7aa04a"), noise2(k.x * 9, k.y * 12)); } },
      [p + "thorn"]: solid("#c8b890"), [p + "bloom"]: { color: hex("#e05a8a"), shade(k, t) { k.emit = .7 + .3 * Math.sin(t * 2); k.glyph = "✿"; } } };
    const parts = (x, y, z, b, h, t) => {
      for (let i = 0; i < 5; i++) { const a = i * 1.26, w = .05 * Math.sin(t * 1.3 + i); U(b, sd.capsule(x, y, z, Math.cos(a) * .18, 0, Math.sin(a) * .18, Math.cos(a + 1.5) * .1 + w, 1.4, Math.sin(a + 1.5) * .1, .09) + .015 * noise2(y * 20, i), p + "vine", h); }
      for (const sz of [-1, 1]) { const w = .1 * Math.sin(t * 1.6 + sz); U(b, sd.capsule(x, y, z, 0, 1.2, sz * .15, .3, 1.0 + w, sz * .45, .06), p + "vine", h); U(b, sd.capsule(x, y, z, .3, 1.0 + w, sz * .45, .6, 1.3 + w, sz * .5, .04), p + "vine", h); }
      for (let i = 0; i < 9; i++) { const ty = .2 + i * .14, a = i * 2.4; U(b, sd.cone(x - Math.cos(a) * .2, y - ty, z - Math.sin(a) * .2, .025, .1), p + "thorn", h); }
      U(b, sd.sphere(x - .05, y - 1.55, z, .17) + .03 * Math.sin(Math.atan2(z, x - .05) * 7), p + "bloom", h);
    };
    return { parts, mats, height: 1.8, len: 1.3, facing: "x" };
  }

  // ================================================================ rosters
  const RAIDER = (colors, extra) => (p) => person({ colors, ...extra }, p);
  const ENEMIES = {
    tunnel_rat: (p) => beast({ s: .55, L: .5, H: .1, G: .15, color: "#7a6a5e", color2: "#5a4a40", ear: "round", tail: "thin", snout: .14, snoutR: .4, noseColor: "#d88a8a", eyes: "#ff5a4a" }, p),
    stray_dog: (p) => beast({ L: .62, H: .3, G: .19, color: "#b08a5a", color2: "#8a6a42", ear: "flop", tail: "bush", tailLen: .25, snout: .15, socks: "#e8dcc0" }, p),
    wild_boar: (p) => beast({ L: .7, H: .2, G: .25, color: "#5a4a3a", color2: "#3a2e24", ear: "point", tail: "curl", snout: .17, snoutR: .55, noseColor: "#c89080", tusks: true, ridge: true }, p),
    scavenger: RAIDER({ shirt: "#7a6a52", pants: "#5a5040" }, { head: { kind: "hood", color: "#6a5a44" }, weapon: { kind: "club", color: "#9aa0a6" }, back: { kind: "pack", color: "#6a5a44" } }),
    grey_wolf: (p) => beast({ L: .72, H: .34, G: .2, color: "#8a8a8a", color2: "#5a5a5e", ear: "point", tail: "bush", tailLen: .36, snout: .2, belly: "#c8c8c8" }, p),
    lynx: (p) => beast({ L: .62, H: .3, G: .18, color: "#c89a5a", ear: "tuft", tail: "short", snout: .08, spots: true }, p),
    ridge_bandit: RAIDER({ shirt: "#5a6a44", pants: "#4a4a3a" }, { head: { kind: "bandana", color: "#8a3a2a" }, weapon: { kind: "bow", color: "#8a5a3a" }, back: { kind: "quiver", color: "#6a4a32" } }),
    black_bear: (p) => beast({ s: 1.35, L: .72, H: .26, G: .27, color: "#5a4a3e", color2: "#3a2e26", ear: "round", tail: "short", snout: .14, snoutColor: "#8a6a4a", belly: "#3a3430" }, p),
    raider_scout: RAIDER({ shirt: "#6a5a4a" }, { head: { kind: "cap", color: "#4a5a3a" }, body: { color: "#7a5a3a" }, weapon: { kind: "rifle", color: "#4a4a4e" }, eyes: null }),
    bog_pike: (p) => pike(p),
    raider_brute: RAIDER({ shirt: "#6a4a3a", pants: "#3a3430", skin: "#c89070" }, { scale: 1.18, body: { color: "#8a8a8a", metal: true }, weapon: { kind: "axe", color: "#a8acb0" }, pose: "guard" }),
    rust_drone: (p) => drone({ rust: true }, p),
    outrider: RAIDER({ shirt: "#3a3430", pants: "#2e2a26" }, { head: { kind: "helmet", color: "#a83a2a", metal: true }, body: { color: "#4a3a30" }, weapon: { kind: "rifle", color: "#5a5a5e" }, cloak: "#8a6a4a" }),
    armoured_raider: RAIDER({ shirt: "#5a4a3a" }, { head: { kind: "helmet", color: "#9a9ea4", metal: true }, body: { color: "#9a9ea4", metal: true }, legs: { color: "#8a8e94", metal: true }, weapon: { kind: "blade", color: "#c3cad2" }, offhand: { color: "#7a7e84", metal: true }, pose: "guard" }),
    sentry_drone: (p) => drone({ kind: "sentry", color: "#c8ccd0", eye: "#7fc6e6" }, p),
    hazmat_raider: RAIDER({ shirt: "#d8b830", pants: "#c8a828" }, { head: { kind: "gasmask", color: "#3a3a3a" }, eyes: "#9fe86a", back: { kind: "tank", color: "#7a8a6a" }, weapon: { kind: "gadget", color: "#5a646e", glow: "#9fe86a" }, hands: { color: "#2e2e2e" }, feet: { color: "#2e2e2e" } }),
    alpha_wolf: (p) => beast({ s: 1.2, L: .75, H: .34, G: .21, color: "#4a4a50", color2: "#2e2e34", mane: "#8a8a90", ear: "point", tail: "bush", tailLen: .4, snout: .21, eyes: "#ff5a3c" }, p),
    security_mech: (p) => mech(p),
    night_stalker: RAIDER({ shirt: "#2a2a30", pants: "#22222a", skin: "#a8a0a0" }, { head: { kind: "hood", color: "#1e1e26" }, eyes: "#c88aff", cloak: "#24242e", weapon: { kind: "bow", color: "#3a3a40" } }),
    relay_sentinel: (p) => sentinel({ color: "#5a6470", eye: "#7fc6e6", mast: true }, p),
    frost_bear: (p) => beast({ s: 1.45, L: .74, H: .27, G: .28, color: "#e8eef2", color2: "#b8c8d4", ear: "round", tail: "short", snout: .16, belly: "#ffffff", eyes: "#7fc6e6" }, p),
    signal_hunter: RAIDER({ shirt: "#4a5a5e", pants: "#3a4448" }, { head: { kind: "visor", color: "#ff7a3c" }, cloak: "#5a4a3a", back: { kind: "antenna", color: "#4a4a4e" }, weapon: { kind: "rifle", color: "#3a3e44" } }),
    warden_drone: (p) => drone({ kind: "warden", s: 1.3, color: "#4a4e5a", eye: "#b192e6", core: "#b192e6" }, p),
    storm_sentinel: (p) => sentinel({ color: "#5a6a7a", eye: "#e8e8ff", mast: true }, p),
    thorn_keeper: (p) => keeper(p),
    raider_queen: RAIDER({ shirt: "#6a2a2a", pants: "#3a2a2a", hair: "#2a1a14" }, { scale: 1.08, head: { kind: "crown", color: "#d8a84a", metal: true }, cloak: "#8a1a1a", body: { color: "#5a3a2a" }, weapon: { kind: "bow", color: "#8a3a2a" }, back: { kind: "quiver", color: "#5a2a1a" }, charm: "#ffcf40" }),
    warden_zero: (p) => sentinel({ color: "#3a3e4a", eye: "#b192e6", halo: true, s: 1.2 }, p),
  };
  const COMPANIONS = {
    beaver: (p) => beast({ s: .7, L: .55, H: .14, G: .17, color: "#7a5236", color2: "#5a3a26", ear: "round", tail: "flat", snout: .08, snoutR: .55, noseColor: "#2a1a14" }, p),
    magpie: (p) => bird({ color: "#1e1e24", belly: "#f2f2f2", wing: "#2a3a5a", wingTip: "#f2f2f2", beak: "#1a1a1a", tail: .4 }, p),
    otter: (p) => beast({ s: .75, L: .8, H: .16, G: .13, color: "#6a4a32", color2: "#4a3220", belly: "#c8a880", ear: "round", tail: "bush", tailLen: .4, snout: .07, snoutR: .6 }, p),
    fox: (p) => beast({ L: .6, H: .26, G: .16, color: "#d8742c", color2: "#b85a1c", belly: "#f2e8d8", ear: "point", tail: "bush", tailLen: .42, tailTip: "#f2ece0", snout: .17, snoutR: .4, socks: "#2a1e18" }, p),
    ferret: (p) => beast({ s: .7, L: .85, H: .14, G: .1, color: "#e8dcc0", color2: "#c8b898", ear: "round", tail: "bush", tailLen: .3, snout: .08, snoutColor: "#f2ece0", socks: "#5a4a3a" }, p),
    mule: (p) => beast({ s: 1.2, L: .75, H: .44, G: .22, color: "#7a6a5a", color2: "#5a4a3c", ear: "point", tail: "thin", tailColor: "#3a2e26", snout: .22, snoutR: .5, snoutColor: "#c8b8a0", neckUp: .3, neck: .14, mane: "#3a2e26" }, p),
    cat: (p) => beast({ s: .8, L: .5, H: .2, G: .15, color: "#c89a5a", color2: "#8a6a3a", ear: "point", tail: "bush", tailLen: .38, snout: .05, spots: false, socks: "#f2ece0" }, p),
    hedgehog: (p) => beast({ s: .7, L: .5, H: .08, G: .16, color: "#6a5a4a", spiky: true, ear: "round", tail: "none", snout: .14, snoutR: .4, snoutColor: "#c8a880" }, p),
    woodpecker: (p) => bird({ color: "#2a2a2e", belly: "#e8e8e8", crest: "#d83a2a", beak: "#3a3a3a", beakLen: .18 }, p),
    moth: (p) => moth(p),
    tortoise: (p) => beast({ s: .8, L: .6, H: .12, G: .15, color: "#8a8a5a", shellBody: true, shell: "#6a7a4a", ear: "none", tail: "short", snout: .05, neckUp: .02 }, p),
    crow: (p) => bird({ color: "#16161c", wing: "#22222e", beak: "#1a1a1a" }, p),
    salamander: (p) => beast({ s: .9, L: .55, H: .08, G: .11, color: "#e8902a", spots: true, ear: "none", tail: "lizard", snout: .06, eyes: "#1a1a1a" }, p),
    owl: (p) => bird({ color: "#8a6a4a", color2: "#5a4a3a", belly: "#d8c8a8", upright: true, tufts: true, bigEyes: true, beak: "#3a3028", tail: .1 }, p),
    goat: (p) => beast({ L: .62, H: .34, G: .19, color: "#e8e2d4", color2: "#c8c0b0", ear: "flop", tail: "short", snout: .14, horns: true, beard: true, hornColor: "#8a7a6a" }, p),
    dog: (p) => beast({ L: .62, H: .28, G: .18, color: "#3a3028", color2: "#5a4a3a", belly: "#c89a6a", ear: "flop", tail: "bush", tailLen: .3, snout: .16, socks: "#c89a6a" }, p),
    hawk: (p) => bird({ color: "#8a5a3a", color2: "#6a4a2a", belly: "#e8dcc8", wing: "#6a4a2e", beak: "#e8c040", spread: true, tail: .25 }, p),
  };

  // You, from what's equipped (any item, by its slot and colour).
  const METAL_COL = () => window.UmbraOutpostModels.kit.METALS, LEATHER_COL = () => window.UmbraOutpostModels.kit.LEATHERS, WOOD_COL = () => window.UmbraOutpostModels.kit.WOODS;
  function outfit(equipment = {}, items = {}) {
    const o = { colors: { shirt: "#5f7f9a", pants: "#3f4a52" } };
    const colOf = (id) => {
      let m;
      if ((m = id.match(/^(bronze|iron|steel|alloy|titanium|skyfall)_/))) return [METAL_COL()[m[1]], true];
      if ((m = id.match(/^(rabbit|deer|boar|elk|muskox)_/))) return [LEATHER_COL()[m[1]], false];
      if ((m = id.match(/^(\w+)_bow$/)) && WOOD_COL()[m[1]]) return [WOOD_COL()[m[1]][1], false];
      const it = items[id] || {};
      return [it.color || "#8a8a8a", /plate|helmet|greaves|shield|visor/.test(id)];
    };
    for (const [slot, id] of Object.entries(equipment)) {
      if (!id) continue;
      const [color, isMetal] = colOf(id), name = id;
      if (slot === "head") o.head = { kind: /visor|goggle/.test(name) ? "visor" : /hood|bandana|mask/.test(name) ? (/bandana|mask/.test(name) ? "bandana" : "hood") : /cap|hat/.test(name) ? "cap" : isMetal ? "helmet" : "hood", color, metal: isMetal };
      else if (slot === "body") o.body = { color, metal: isMetal };
      else if (slot === "legs") o.legs = { color, metal: isMetal };
      else if (slot === "feet") o.feet = { color };
      else if (slot === "hands") o.hands = { color };
      else if (slot === "cloak") o.cloak = color;
      else if (slot === "offhand") o.offhand = { color, metal: isMetal };
      else if (slot === "charm") o.charm = color;
      else if (slot === "ammo") o.back = { kind: "quiver", color: "#6a4a32" };
      else if (slot === "weapon") {
        const kind = /bow/.test(name) ? "bow" : /sling/.test(name) ? "slingshot" : /gun|taser|launcher|thrower|emitter|coil|zapper/.test(name) ? "gadget" : /club|pipe|hammer|mace/.test(name) ? "club" : /axe/.test(name) ? "axe" : "blade";
        o.weapon = { kind, color, glow: kind === "gadget" ? color : undefined };
      }
    }
    return o;
  }

  // ================================================================ scenes
  const ground = (c1 = "#4a5a40", c2) => ({ color: hex(c1), ramp: " .,:;'", shade(k) { if (c2) k.color = mix(hex(c1), hex(c2), noise2(k.x * 2, k.z * 2)); k.alpha = .55; } });
  // A single being on a patch of ground (pictures and hover views).
  // A being's parts behind a bounding box: rays in empty space step by the
  // box instead of measuring every limb (pictures render many times faster).
  function cheap(being) {
    if (being.cheap) return being.cheap;
    const L = Math.max(being.len || 0, being.height) * .75 + .25, mid = being.height / 2, hy = mid + .25;
    return (being.cheap = (x, y, z, sb, hh, t) => {
      const bd = sd.box(x, y - mid, z, L, hy, L);
      if (bd > .15) { if (bd - .1 < sb[0]) sb[0] = bd - .1; return; }
      being.parts(x, y, z, sb, hh, t);
    });
  }
  function solo(being, o = {}) {
    const K = window.UmbraOutpostModels.kit;
    // Every being fills its picture the same way: scaled to fit, feet on the ground.
    const k = 2.05 / Math.max(being.height, being.len || 0, .5), base = -being.height * k / 2, parts = cheap(being);
    return K.model((x, y, z, b, h, t) => {
      if (!being.water) U(b, y - base + .001, "ground", h);
      const sb = [99, ""], hh = { m: "" };
      parts(x / k, (y - base) / k, z / k, sb, hh, t ?? 2);
      if (sb[0] * k < b[0]) { b[0] = sb[0] * k; h.m = hh.m; }
    },
      { ground: ground(o.ground || "#4a5a40", o.ground2 || "#3a4a34"), ...being.mats },
      { cam: being.facing === "z" ? [.9, .55, 2.9] : [2.0, .95, 2.3], fov: 34, zoom: 1.02, ambient: .58, light: [-.3, .85, .7], shadows: false });
  }
  const enemyBeing = (id, p) => (ENEMIES[id] || ENEMIES.scavenger)(p);
  // Place a being at (ox, 0, 0) facing the other side of the arena.
  function placed(being, ox, faceLeft, size, front) {
    const k = size / being.height;
    const rot = front ? 0 : being.facing === "z" ? (faceLeft ? -Math.PI / 2 : Math.PI / 2) : (faceLeft ? Math.PI : 0), parts = cheap(being);
    return (x, y, z, b, h, t) => {
      const [rx, rz] = A.rotY(x - ox, z, -rot);
      const sb = [99, ""], hh = { m: "" };
      parts(rx / k, y / k, rz / k, sb, hh, t);
      if (sb[0] * k < b[0]) { b[0] = sb[0] * k; h.m = hh.m; }
    };
  }
  // The duel: you on the left, the enemy on the right, sparks between.
  function duel(enemyId, gear) {
    const you = person(gear, "p_"), foe = enemyBeing(enemyId, "e_");
    const big = /bear|mech|sentinel|warden_zero|brute|queen|keeper|alpha/.test(enemyId);
    const fy = Math.min(1.75, Math.max(.75, foe.height * (big ? 1.05 : 1)));
    const pY = placed(you, -.95, false, 1.6), pE = placed(foe, .95, true, fy);
    return { fps: 10, camera: () => ({ pos: [0, 1.0, 4.3], at: [0, .82, 0], fovV: 26 }), light: [-.3, .8, .6], ambient: .5,
      moving: [[-.95, .85, 0, .95], [.95, fy / 2, 0, Math.max(.8, fy * .62)]],
      map(x, y, z, t, h) { const b = [y, "arena"]; h.m = "arena"; pY(x, y, z, b, h, t); pE(x, y, z, b, h, t); return b[0]; },
      materials: { arena: ground("#4a4a3c", "#6a6450"), ...you.mats, ...foe.mats },
      particles(t, put) {
        const k = (t * .8) % 2, mine = k < 1, p = k % 1;
        if (p > .45) return;
        for (let i = 0; i < 9; i++) { const a = -1.1 + i * .27 + p * 2; put((mine ? .2 : -.2) + Math.cos(a) * .32 * (mine ? 1 : -1), .95 + Math.sin(a) * .3, .2, i % 3 ? "·" : "*", mine ? [255, 230, 160] : [255, 120, 90], 1 - p / .45); }
      } };
  }
  // You alone, turning on a stand (Gear).
  function mannequin(gear) {
    const you = person(gear, "p_"), K = window.UmbraOutpostModels.kit, k = 2.1 / you.height, base = -1.05, parts = cheap(you);
    return { ...K.model((x, y, z, b, h, t) => {
      U(b, Math.max(sd.cyl(x, y - base + .06, z, .55, .06), 0), "stand", h);
      const sb = [99, ""], hh = { m: "" };
      parts(x / k, (y - base) / k, z / k, sb, hh, t);
      if (sb[0] * k < b[0]) { b[0] = sb[0] * k; h.m = hh.m; }
    },
      { stand: { color: hex("#5a5a5e"), ramp: " .:=#", shade(k) { if (k.ny > .8) { const r = Math.hypot(k.x, k.z); k.glyph = Math.floor(r * 30) % 2 ? "o" : "·"; } } }, ground: ground("#2a2e30"), ...you.mats },
      { cam: [.4, .35, 3.2], fov: 36, zoom: 1.08, ambient: .52, bounded: true }) };
  }
  // The trader's post: a stall with an awning, crates and jars, a lantern,
  // and the trader on a crate, smoking.
  function traderScene() {
    const man = person({ colors: { shirt: "#7a5a3a", pants: "#4a4034", hair: "#9a9a9a", skin: "#c8946a" }, head: { kind: "cap", color: "#5a4a32" }, sit: true, smoke: true, cloak: "#6a4a32" }, "t_");
    const pT = placed(man, -1.25, false, 1.75, true);
    const sit = (x, y, z, b, h, t) => pT(x, y, z - .35, b, h, t);
    return { fps: 10, camera: () => ({ pos: [-.2, 1.45, 4.1], at: [-.2, .9, -.2], fovV: 31 }), light: [-.4, .85, .5], ambient: .42,
      moving: [[-1.25, 1.2, .35, .35]],
      fog: { color: hex("#14110e"), density: .03, start: 6, fade: .4 },
      sky: (u, v, t, col, row) => hash2(col, row) > .982 ? ["·", [226, 230, 246], .35 + .3 * Math.sin(t + col)] : null,
      map(x, y, z, t, h) {
        const b = [y, "dirt"]; h.m = "dirt";
        // The stall: a counter, posts and a striped awning.
        U(b, sd.box(x - .35, y - .45, z + .4, .85, .45, .28), "counter", h);
        for (const px of [-.45, 1.15]) for (const pz of [-.1, -.75]) U(b, sd.box(x - px, y - 1.05, z - pz, .05, 1.05, .05), "post", h);
        U(b, Math.max(sd.box(x - .35, y - (2.08 - (z + .4) * .3), z + .45, 1.0, .03, .5), 0), "awning", h);
        // Wares on the counter, crates and a barrel.
        for (let i = 0; i < 5; i++) U(b, sd.cyl(x - (-.2 + i * .25), y - .9, z + .3, .07, .16), "jar", h);
        U(b, sd.box(x - 1.45, y - .25, z - .5, .25, .25, .25), "crate", h); U(b, sd.box(x - 1.38, y - .72, z - .48, .2, .2, .2), "crate", h);
        U(b, sd.cyl(x + 1.45, y, z + .1, .24, .62), "barrel", h);
        U(b, sd.box(x + 1.25, y - .18, z - .35, .2, .18, .2), "crate", h);   // the trader's seat
        // The lantern hanging from the awning.
        U(b, sd.capsule(x, y, z, .95, 1.9, -.65, .95, 1.62, -.65, .008), "post", h); U(b, sd.sphere(x - .95, y - 1.53, z + .65, .09), "lantern", h);
        sit(x, y, z, b, h, t);
        return b[0];
      },
      materials: { dirt: ground("#5a4a3a", "#6a5a44"), counter: solid("#7a5a3e", RAMP.wood), post: solid("#6a4e36", RAMP.wood),
        awning: { color: hex("#c8553d"), ramp: RAMP.cloth, shade(k) { k.color = Math.floor((k.x + 2) * 4) % 2 ? hex("#e8dcc0") : hex("#b8483a"); } },
        jar: { color: hex("#8fc0b0"), ramp: " .:+*", shade(k) { k.alpha = .8; k.color = [hex("#8fc0b0"), hex("#e0a050"), hex("#c8d070")][Math.floor((k.x + 3) * 4) % 3]; } },
        crate: { color: hex("#9a7550"), ramp: RAMP.wood, shade(k) { if (Math.abs(Math.sin(k.y * 20)) < .2) k.glyph = "="; } }, barrel: { color: hex("#7a5236"), ramp: RAMP.wood, shade(k) { if (Math.abs(Math.sin(k.y * 9)) < .15) { k.color = hex("#8a8e94"); k.glyph = "="; } } },
        lantern: { color: [255, 200, 110], shade(k, t) { k.emit = .8 + .2 * Math.sin(t * 7) * Math.sin(t * 2.3); k.glyph = "@"; } }, ...man.mats },
      particles(t, put) {
        // Smoke from the cigarette, curling up; moths round the lantern.
        const cx = -1.25 + .02, cy = 1.2, cz = .35 + .17;
        for (let i = 0; i < 12; i++) { const p = (t * .18 + i / 12) % 1; put(cx + Math.sin(p * 6 + i) * .08 * p * 2 + p * .2, cy + p * 1.1, cz + Math.cos(p * 5 + i) * .05, p < .3 ? "~" : p < .7 ? "°" : "·", [210, 210, 214], .55 * (1 - p)); }
        for (let i = 0; i < 3; i++) { const a = t * (2 + i) + i * 2; put(.95 + Math.cos(a) * .18, 1.55 + Math.sin(a * 1.3) * .1, -.65 + Math.sin(a) * .18, "ᵔ", [230, 220, 200], .8); }
      } };
  }
  // The bounty board: posters on a post board, a lantern, a crow on top.
  function boardScene() {
    const crow = COMPANIONS.crow("c_"), pC = placed(crow, .55, true, .45);
    return { fps: 10, camera: () => ({ pos: [.4, 1.4, 4.4], at: [0, 1.0, 0], fovV: 30 }), light: [-.4, .8, .6], ambient: .32, moving: [[.55, 1.95, 0, .3]],
      map(x, y, z, t, h) {
        const b = [y, "dirt"]; h.m = "dirt";
        for (const px of [-1.05, 1.05]) U(b, sd.box(x - px, y - 1.0, z, .06, 1.0, .06), "post", h);
        U(b, sd.box(x, y - 1.15, z, 1.0, .6, .04), "board", h);
        U(b, sd.roof(x, y - 1.78, z, 1.25, .25, .3), "roofing", h);
        const P = [[-.6, 1.3], [-.05, 1.35], [.55, 1.28], [-.35, .85], [.3, .82]];
        P.forEach(([px, py], i) => U(b, sd.box(x - px, y - py - .01 * Math.sin(t * 2 + i) * (i === 1 ? 1 : 0), z - .05, .2, .24, .008), "poster", h));
        U(b, sd.sphere(x - .45, y - .1, z - .35, .09), "lantern", h);
        pC(x, y - 1.82, z, b, h, t);
        return b[0];
      },
      materials: { dirt: ground("#5a4a3a", "#4a4034"), post: solid("#6a4e36", RAMP.wood), board: solid("#8a6a48", RAMP.wood), roofing: solid("#5a3a2a", RAMP.wood),
        poster: { color: hex("#e8dcc0"), ramp: " .:-=", shade(k) { const r = Math.floor((k.y + 1) * 30) % 4; k.glyph = r === 0 ? "-" : Math.abs(k.x % .4) < .12 && k.y > 1.2 ? "@" : "."; k.color = hex(k.y > 1.33 && k.y < 1.4 ? "#b8483a" : "#e8dcc0"); } },
        lantern: { color: [255, 200, 110], shade(k, t) { k.emit = .85 + .15 * Math.sin(t * 7); k.glyph = "@"; } }, ...crow.mats } };
  }
  // The four expedition sites.
  function siteScene(id) {
    const K = window.UmbraOutpostModels.kit;
    const sky = { weather: "#c8d4e0", glasshouse: "#a8c8a0", depot: "#6a8aa0", relay: "#d8e4ec" }[id];
    const parts = {
      weather: (x, y, z, b, h, t) => {
        U(b, sd.box(x + .5, y - .35, z, .45, .35, .4), "hut", h); U(b, sd.roof(x + .5, y - .7, z, .55, .45, .3), "roofing", h);
        U(b, sd.cyl(x - .5, y, z, .03, 1.8), "mast", h);
        for (let i = 0; i < 3; i++) { const a = t * 3 + i * 2.09; U(b, sd.sphere(x - .5 - Math.cos(a) * .18, y - 1.82, z - Math.sin(a) * .18, .05), "cup", h); U(b, sd.capsule(x, y, z, .5, 1.82, 0, .5 + Math.cos(a) * .18, 1.82, Math.sin(a) * .18, .008), "mast", h); }
        U(b, Math.max(sd.sphere(x - .05, y - 1.0, z + .55, .3), -(x - .05 + .05)), "dish", h);
      },
      glasshouse: (x, y, z, b, h, t) => {
        U(b, Math.max(sd.box(x, y - .4, z, .8, .4, .45), -sd.box(x, y - .4, z, .76, .38, .41)), "frame", h);
        U(b, sd.roof(x, y - .8, z, .85, .5, .35), "glass", h);
        for (let i = 0; i < 6; i++) U(b, sd.capsule(x, y, z, -.8 + i * .32, 0, .46, -.7 + i * .3 + .05 * Math.sin(t + i), .5 + .3 * hash2(i, 2), .5, .03), "vine", h);
        U(b, sd.sphere(x + .2, y - .3, z - .1, .3), "vine", h);
      },
      depot: (x, y, z, b, h, t) => {
        U(b, Math.max(sd.box(x, y - .5, z, .8, .7, .5), -sd.box(x + .3, y - .5, z - .5, .2, .4, .2)), "shed", h); U(b, sd.roof(x, y - 1.2, z, .9, .55, .25), "roofing", h);
        for (let i = 0; i < 3; i++) U(b, sd.cyl(x - (-1.1 + i * .5), y + .05 - .03 * Math.sin(t * 1.5 + i), z - .7, .13, .32), "drum", h);
      },
      relay: (x, y, z, b, h, t) => {
        for (const [cx, cz] of [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]]) U(b, sd.capsule(x, y, z, cx, 0, cz, cx * .15, 2.2, cz * .15, .025), "mast", h);
        for (let k = 0; k < 6; k++) { const yy = .3 + k * .35, w = .3 * (1 - yy / 2.4); U(b, Math.max(Math.abs(sd.box(x, y - yy, z, w, .01, w)) - .012, 0), "mast", h); }
        U(b, sd.sphere(x, y - 2.3, z, .07), "beacon", h);
      },
    }[id];
    return K.model((x, y, z, b, h, t) => { const water = id === "depot"; U(b, y - (water ? .02 * Math.sin(x * 3 + t) : 0), water ? "bog" : "ground", h); parts(x, y, z, b, h, t ?? 2); },
      { ground: ground(id === "relay" ? "#d8e0e8" : "#5a6a48", id === "relay" ? "#b8c4cc" : "#4a5a3c"),
        bog: { color: hex("#2a4a5a"), ramp: " .-~≈", shade(k, t) { const n = noise2(k.x * 3 + t * .5, k.z * 4); k.glyph = n > .6 ? "≈" : "~"; k.color = mix(hex("#1f3a4a"), hex("#6a9ab0"), n); k.alpha = .7; } },
        hut: solid("#9a9488", RAMP.solid), roofing: solid("#6a4a3a", RAMP.wood), mast: metal("#b8bec4"), cup: metal("#e8e8e8"), dish: { ...metal("#d8dce0"), shade(k) { k.glyph = "o"; } },
        frame: metal("#8a9a8a"), glass: { color: hex("#bfe2f0"), ramp: " .:+/", shade(k) { k.alpha = .6; k.glyph = "/"; } }, vine: { color: hex("#5d8a4a"), ramp: RAMP.leaf, shade(k) { k.color = mix(hex("#3a6a3a"), hex("#8ab060"), noise2(k.x * 9, k.y * 9)); } },
        shed: { color: hex("#7a6a5a"), ramp: RAMP.solid, shade(k) { if (k.y < .3) k.color = hex("#4a5a5a"); } }, drum: { color: hex("#c8553d"), ramp: RAMP.metal, shade(k) { if (Math.abs(Math.sin(k.y * 14)) < .2) k.glyph = "="; } },
        beacon: { color: [255, 80, 60], shade(k, t) { k.emit = Math.sin(t * 2.4) > 0 ? 1 : .3; k.glyph = "@"; } } },
      { cam: [1.4, .9, 3.1], fov: 36, zoom: 1.05, ambient: .38 });
  }

  // ================================================================ API
  const KINDS = { creature: 1, pet: 1, site: 1 };
  function scene(kind, id) {
    if (kind === "creature") return solo(enemyBeing(id, ""), { ground: /pike/.test(id) ? "#2a3a30" : "#4a5a40" });
    if (kind === "pet") return solo((COMPANIONS[id] || COMPANIONS.dog)(""), { ground: "#4a5a40" });
    if (kind === "site") return siteScene(id);
    return null;
  }
  const spin = (sc, k = .6, fps) => window.UmbraOutpostModels.spin(sc, k, fps);
  return {
    has: (kind) => !!KINDS[kind], scene, outfit,
    // Turning, breathing views for hover boxes and the Gear stand.
    live(canvas, kind, id, o = {}) { const sc = scene(kind, id); return sc ? A.view(canvas, spin(sc, o.speed ?? .5), { cell: o.cell || 5 }) : null; },
    duel(canvas, enemyId, gear) { return A.view(canvas, duel(enemyId, gear), { cell: 8 }); },
    // The Gear stand turns as a turntable: captured once, then smooth.
    mannequin(canvas, gear) { return A.view(canvas, { ...spin(mannequin(gear), .45, 24), turntable: { speed: .45, views: 12 } }, { cell: 5 }); },
    mannequinScene: (gear) => mannequin(gear),
    duelScene: (enemyId, gear) => duel(enemyId, gear),
    trader(canvas) { return A.view(canvas, traderScene(), { cell: 8 }); },
    board(canvas) { return A.view(canvas, boardScene(), { cell: 8 }); },
    ENEMIES, COMPANIONS, person,
    // Place a being in another scene: at (x, z), `size` tall, turned by `rot`.
    place(being, x, z, size, rot = 0) {
      const k = size / being.height;
      return { mats: being.mats, f(px, py, pz, b, h, t) {
        // Far away: a safe bound (a step never lands inside), not the full shape.
        const bd = sd.box(px - x, py - size * .55, pz - z, size * .75, size * .62, size * .75);
        if (bd > .3) { if (bd - .2 < b[0]) b[0] = bd - .2; return; }
        const [rx, rz] = A.rotY(px - x, pz - z, -rot), sb = [99, ""], hh = { m: "" };
        being.parts(rx / k, py / k, rz / k, sb, hh, t);
        if (sb[0] * k < b[0]) { b[0] = sb[0] * k; h.m = hh.m; }
      } };
    },
  };
})();
