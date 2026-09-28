// Umbra Wiki vault: the Field Kit's VAULT tab. A round vault door that
// unlocks with the lock password (or a click when there's none) and opens
// on your arsenal: firearms, ammunition and defence gear, picked from a
// library of common models or entered by hand. Each item has an inspect view
// with its ASCII drawing, parts called out, and its specifications; rounds
// on hand are matched to the weapons that fire them. Stored on this
// computer only (behind the password, not encrypted).
// Loaded after app.js (uses $, Sound, escapeHtml, confirmDialog).
"use strict";

window.UmbraVault = (() => {
  // ------------------------------------------------------------ drawings

  // Side views, muzzle to the right; parts: [name, row, column].
  const ART = {
    pistol: { art: [
      "  ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖  ",
      " ▐███████████████████████████▌▬ ",
      "  ▀▜█████▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘  ",
      "   ▐█████▌ ╲▁▁▁╱                ",
      "   ▐█████▌                      ",
      "  ▐█████▌                       ",
      "  ▝▀▀▀▀▀▘                       "],
      parts: [["SIGHTS", 0, 3], ["SLIDE", 0, 16], ["MUZZLE", 1, 31], ["TRIGGER", 3, 12], ["GRIP", 4, 6], ["MAGAZINE", 6, 5]] },
    revolver: { art: [
      "      ▗▄▄▄▄▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖ ",
      "  ▗▄▄▄███████████████████████▌▬",
      "  ▐██▛▀▜█████▛▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘ ",
      "  ▐██▌  ▀▀▀▀▀ ╲▁▁╱              ",
      " ▐██▌                          ",
      " ▐██▌                          ",
      " ▝▀▀▘                          "],
      parts: [["HAMMER", 1, 4], ["CYLINDER", 0, 9], ["BARREL", 0, 24], ["TRIGGER", 3, 15], ["GRIP", 5, 2]] },
    rifle: { art: [
      "                         ▗▄▄▄▄▄▄▄▄▄▖                        ",
      " ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟█████████▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖   ",
      "▐██████████████████████████████████████▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘▬▬ ",
      " ▀▀▀▀▀▀▀▀▀▀▀▜███▛▀▀▀╲▁▁▁╱▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘                    ",
      "            ▝▀▀▀▘                                          "],
      parts: [["STOCK", 2, 5], ["SCOPE", 0, 30], ["BOLT", 1, 22], ["BARREL", 2, 48], ["TRIGGER", 3, 21], ["GRIP", 4, 14]] },
    ar: { art: [
      "                  ▗▄▄▄▄▄▄▄▖                        ",
      "   ▗▄▄▄▄▄▄▄▄▄▄▄▄▄▄▟███████▙▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖       ",
      " ▐██████████████████████████████████████████▬▬▬▬▬▬",
      " ▐███▛▀▀▀▀▀▀▀▀▜██▛ ▐████▌ ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘        ",
      " ▝▀▀▘        ▐██▌   ▐████▌                          ",
      "            ▝▀▀▘     ▝████▌                         ",
      "                       ▀▀▀                          "],
      parts: [["STOCK", 3, 3], ["OPTIC", 0, 22], ["RECEIVER", 1, 14], ["HANDGUARD", 1, 36], ["BARREL", 2, 48], ["GRIP", 5, 13], ["MAGAZINE", 6, 24]] },
    shotgun: { art: [
      " ▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖",
      "▐██████████████████████████████████████████████████▌",
      " ▀▀▀▀▀▀▀▜███▛▀▀╲▁▁╱▀▀▀▀▐██████████▌▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘",
      "        ▝▀▀▀▘          ▝▀▀▀▀▀▀▀▀▀▀▘                 "],
      parts: [["STOCK", 1, 3], ["RECEIVER", 0, 16], ["BARREL", 0, 40], ["TRIGGER", 2, 16], ["PUMP", 3, 28], ["TUBE MAGAZINE", 2, 42]] },
    bow: { art: [
      "      ▗▖            ",
      "     ▐▌ ╲           ",
      "    ▐▌    ╲         ",
      "   ▐▌       ╲       ",
      " ══▐▌════════●═════▶",
      "   ▐▌       ╱       ",
      "    ▐▌    ╱         ",
      "     ▐▌ ╱           ",
      "      ▝▘            "],
      parts: [["LIMB", 1, 5], ["STRING", 2, 10], ["ARROW", 4, 18], ["GRIP", 4, 3], ["NOCK", 4, 13]] },
    crossbow: { art: [
      "                ╱            ",
      "              ╱              ",
      " ▗▄▄▄▄▄▄▄▄▄▄▄▄█▄▄▄▄▄▄▄▄▄▄▄▄▖  ",
      "▐██████████████████═════════▶",
      " ▀▀▀▀▜██▛▀▀╲▁╱▀█▀▀▀▀▀▀▀▀▀▀▀▘  ",
      "     ▀▀        ╲             ",
      "                 ╲           "],
      parts: [["LIMBS", 0, 16], ["STOCK", 3, 3], ["BOLT", 3, 27], ["TRIGGER", 4, 12], ["GRIP", 5, 6]] },
    knife: { art: [
      " ▗▄▄▄▄▄▄▄▄▖▗▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖     ",
      " ▐████████▌▐▌███████████████████████▙▄▖ ",
      " ▝▀▀▀▀▀▀▀▀▘▝▘▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘ "],
      parts: [["HANDLE", 0, 5], ["GUARD", 2, 11], ["SPINE", 0, 24], ["EDGE", 2, 26], ["TIP", 1, 38]] },
    spray: { art: [
      "    ▗▄▖   ",
      "   ▐███▌═ ",
      "  ▗█████▖ ",
      "  ▐█████▌ ",
      "  ▐█████▌ ",
      "  ▐█████▌ ",
      "  ▝▀▀▀▀▀▘ "],
      parts: [["NOZZLE", 1, 8], ["ACTUATOR", 0, 5], ["CANISTER", 4, 4]] },
    ammo: { art: [
      " ▗▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖▄▄▄▖   ",
      " ▐████████████████▌███▙▖ ",
      " ▝▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘▀▀▀▘   "],
      parts: [["PRIMER", 1, 1], ["CASE", 0, 9], ["BULLET", 0, 21]] },
    shell: { art: [
      " ▗▄▄▄▖▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖ ",
      " ▐███▌███████████████▌ ",
      " ▝▀▀▀▘▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘ "],
      parts: [["BRASS HEAD", 0, 3], ["HULL", 2, 13], ["CRIMP", 1, 22]] },
    coin: { art: [
      "   ▄▄▄▄▄▄▄   ",
      " ▄█▀     ▀█▄ ",
      "██   ▄█▄   ██",
      "██  ▀█▀█▀  ██",
      " ▀█▄     ▄█▀ ",
      "   ▀▀▀▀▀▀▀   "],
      parts: [["RIM", 0, 6], ["FACE", 3, 6], ["EDGE", 4, 11]] },
    bar: { art: [
      "     ▗▄▄▄▄▄▄▄▄▄▄▄▄▄▖   ",
      "   ▗▟█████████████▙▖  ",
      "  ▟██ 999.9  FINE ██▙ ",
      " ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀ "],
      parts: [["STAMP", 2, 9], ["TOP", 0, 12]] },
    cash: { art: [
      " ┌───────────────────────┐ ",
      " │ ◉  ═══════════   (§)  │ ",
      " │    ─────  100  ─────  │ ",
      " └───────────────────────┘ "],
      parts: [["SERIAL", 1, 8], ["VALUE", 2, 15]] },
    jewel: { art: [
      "    ▄▄▄▄▄    ",
      "  ▄▀ ◆◆◆ ▀▄  ",
      " █  ◆◆◆◆◆  █ ",
      "  ▀▄     ▄▀  ",
      "    ▀▀▀▀▀    "],
      parts: [["STONES", 2, 6], ["BAND", 4, 6]] },
    drive: { art: [
      " ▗▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▖ ",
      " ▐ ▄▄▄▄   ●  ▬▬▬▬▬▬  ▌▬",
      " ▐ ▀▀▀▀      ▬▬▬▬▬▬  ▌▬",
      " ▝▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▘ "],
      parts: [["LABEL", 1, 5], ["LIGHT", 1, 11], ["PORT", 1, 22]] },
    stick: { art: [
      " ▗▄▄▄▄▄▄▄▄▄▄▄▄▖▄▄▄▖ ",
      " ▐██████████████▌▒▒▒▌",
      " ▝▀▀▀▀▀▀▀▀▀▀▀▀▘▀▀▀▘ "],
      parts: [["BODY", 0, 7], ["PLUG", 2, 18]] },
    papers: { art: [
      "  ┌──────────────┐  ",
      "  │ ═══════════  │┐ ",
      "  │ ─────── ──── ││ ",
      "  │ ────── ───── ││ ",
      "  │ ────     ✎   ││ ",
      "  └──────────────┘│ ",
      "   └──────────────┘ "],
      parts: [["TITLE", 1, 9], ["SIGNATURE", 4, 13]] },
    box: { art: [
      " ▗▄▄▄▄▄▄▄▄▄▄▄▄▄▖ ",
      " ▐█▀▀▀▀▀▀▀▀▀▀▀█▌ ",
      " ▐█           █▌ ",
      " ▐█▄▄▄▄▄▄▄▄▄▄▄█▌ ",
      " ▝▀▀▀▀▀▀▀▀▀▀▀▀▀▘ "],
      parts: [["LID", 0, 8], ["CASE", 4, 8]] },
  };

  // ----------------------------------------------------------- library

  // Calibres, and what else a weapon chambered for one can safely fire.
  const CAL = {
    "9mm": "9×19mm Parabellum", "45acp": ".45 ACP", "357": ".357 Magnum", "38spl": ".38 Special", "22lr": ".22 LR",
    "556": "5.56×45mm NATO / .223 Rem", "762x39": "7.62×39mm", "308": ".308 Win / 7.62×51mm NATO", "3006": ".30-06 Springfield",
    "3030": ".30-30 Winchester", "762x54": "7.62×54mmR", "12ga": "12 gauge", "20ga": "20 gauge", "arrow": "Arrows", "bolt": "Crossbow bolts",
  };
  const ALSO = { "357": ["38spl"] };
  // id: [name, drawing, kind, calibre, action, capacity, weight, range, notes]
  const LIB = {
    glock17: ["Glock 17", "pistol", "weapon", "9mm", "Semi-automatic, striker-fired", "17-round magazine", "≈ 0.9 kg loaded", "≈ 50 m", "Polymer frame; no manual safety lever: the trigger safety, and the holster, keep it safe."],
    glock19: ["Glock 19", "pistol", "weapon", "9mm", "Semi-automatic, striker-fired", "15-round magazine", "≈ 0.85 kg loaded", "≈ 50 m", "The compact Glock; takes Glock 17 magazines too."],
    p320: ["SIG Sauer P320", "pistol", "weapon", "9mm", "Semi-automatic, striker-fired", "17-round magazine", "≈ 0.95 kg loaded", "≈ 50 m", "Modular: the serialised part is the fire-control unit inside."],
    beretta92: ["Beretta 92FS", "pistol", "weapon", "9mm", "Semi-automatic, double/single action", "15-round magazine", "≈ 1.1 kg loaded", "≈ 50 m", "Hammer-fired, with a slide-mounted safety/decocker."],
    cz75: ["CZ 75 B", "pistol", "weapon", "9mm", "Semi-automatic, double/single action", "16-round magazine", "≈ 1.1 kg loaded", "≈ 50 m", "All-steel; frame-mounted safety."],
    m1911: ["Colt M1911", "pistol", "weapon", "45acp", "Semi-automatic, single action", "7-round magazine", "≈ 1.2 kg loaded", "≈ 50 m", "Carried cocked and locked; thumb and grip safeties."],
    sw686: ["Smith & Wesson 686", "revolver", "weapon", "357", "Revolver, double/single action", "6 rounds in the cylinder", "≈ 1.2 kg", "≈ 50 m", "Fires .357 Magnum and the milder .38 Special."],
    ruger1022: ["Ruger 10/22", "rifle", "weapon", "22lr", "Semi-automatic (rimfire)", "10-round rotary magazine", "≈ 2.3 kg", "≈ 100 m", "Light and quiet; small game and practice. Ammunition is cheap and light to store."],
    ar15: ["AR-15 pattern rifle", "ar", "weapon", "556", "Semi-automatic, gas-operated", "30-round magazine (common)", "≈ 3 kg", "≈ 400 m", "Modular: upper and lower receiver; the lower is the serialised part."],
    akm: ["AK-pattern rifle (AKM)", "ar", "weapon", "762x39", "Semi-automatic, gas piston", "30-round magazine", "≈ 3.6 kg loaded", "≈ 300 m", "Known for running dirty; heavy, affordable ammunition."],
    mini14: ["Ruger Mini-14", "rifle", "weapon", "556", "Semi-automatic, gas piston", "20-round magazine", "≈ 3 kg", "≈ 300 m", "Ranch rifle look; wood or synthetic stock."],
    sks: ["SKS", "rifle", "weapon", "762x39", "Semi-automatic, gas piston", "10-round fixed magazine, stripper clips", "≈ 3.9 kg", "≈ 300 m", "Loaded from the top with stripper clips."],
    rem700: ["Remington 700", "rifle", "weapon", "308", "Bolt action", "4 + 1 (internal magazine)", "≈ 3.4 kg", "≈ 600 m with an optic", "A classic hunting and precision rifle; many calibres."],
    mosin: ["Mosin-Nagant M91/30", "rifle", "weapon", "762x54", "Bolt action", "5 rounds, stripper clips", "≈ 4 kg", "≈ 500 m", "Old, tough and common; long and heavy."],
    marlin336: ["Marlin 336", "rifle", "weapon", "3030", "Lever action", "6-round tube magazine", "≈ 3.2 kg", "≈ 150 m", "Deer and brush country; use flat or round-nose bullets in the tube."],
    springfield: ["M1 Garand / .30-06 rifle", "rifle", "weapon", "3006", "Semi-automatic (Garand) or bolt", "8-round en-bloc clip (Garand)", "≈ 4.3 kg", "≈ 450 m", "Powerful and long-ranged."],
    rem870: ["Remington 870", "shotgun", "weapon", "12ga", "Pump action", "4 + 1 (tube)", "≈ 3.5 kg", "≈ 40 m (buckshot), 100 m (slug)", "Buckshot, slugs or birdshot; the most common pump shotgun."],
    moss500: ["Mossberg 500", "shotgun", "weapon", "12ga", "Pump action", "5 + 1 (tube)", "≈ 3.4 kg", "≈ 40 m (buckshot), 100 m (slug)", "Tang safety on top, easy for either hand."],
    benellim4: ["Benelli M4", "shotgun", "weapon", "12ga", "Semi-automatic, gas", "5 + 1 (tube)", "≈ 3.8 kg", "≈ 40 m (buckshot), 100 m (slug)", "Self-cleaning gas system."],
    sxs20: ["20 gauge shotgun", "shotgun", "weapon", "20ga", "Break action or pump", "1–5 rounds", "≈ 3 kg", "≈ 35 m", "Lighter recoil; good for smaller shooters and game."],
    compound: ["Compound bow", "bow", "weapon", "arrow", "Compound, with cams", "1 arrow", "≈ 2 kg", "≈ 40 m for game", "Quiet and legal in most places; practise often."],
    recurve: ["Recurve bow", "bow", "weapon", "arrow", "Recurve", "1 arrow", "≈ 1.2 kg", "≈ 30 m for game", "Simple, light, easy to repair; takes down for carrying."],
    crossbow: ["Crossbow", "crossbow", "weapon", "bolt", "Crossbow", "1 bolt", "≈ 3 kg", "≈ 40 m for game", "Keep fingers below the rail; never dry-fire."],
    knife: ["Fixed-blade knife", "knife", "gear", "", "Full tang, fixed blade", "", "≈ 0.3 kg", "", "The most useful tool of all: keep it sharp and dry."],
    machete: ["Machete", "knife", "gear", "", "Long blade", "", "≈ 0.6 kg", "", "Clearing brush, splitting kindling."],
    spray: ["Pepper spray", "spray", "gear", "", "OC spray", "", "≈ 0.1 kg", "≈ 3–5 m", "Check the expiry date on the can; legal status varies by country."],
    bearspray: ["Bear spray", "spray", "gear", "", "OC spray, large canister", "", "≈ 0.4 kg", "≈ 8–10 m", "A cloud for bears, not for people. Check the expiry date."],
    a9mm: ["9mm ammunition", "ammo", "ammo", "9mm", "", "", "", "", "The most common pistol round."],
    a45: [".45 ACP ammunition", "ammo", "ammo", "45acp", "", "", "", "", ""],
    a357: [".357 Magnum ammunition", "ammo", "ammo", "357", "", "", "", "", ""],
    a38: [".38 Special ammunition", "ammo", "ammo", "38spl", "", "", "", "", "Fires in .357 Magnum revolvers too."],
    a22: [".22 LR ammunition", "ammo", "ammo", "22lr", "", "", "", "", "Small and light: hundreds in a pocket-sized box."],
    a556: ["5.56 / .223 ammunition", "ammo", "ammo", "556", "", "", "", "", "A 5.56 NATO chamber takes .223; not always the other way round: check the barrel marking."],
    a76239: ["7.62×39mm ammunition", "ammo", "ammo", "762x39", "", "", "", "", ""],
    a308: [".308 / 7.62×51 ammunition", "ammo", "ammo", "308", "", "", "", "", ""],
    a3006: [".30-06 ammunition", "ammo", "ammo", "3006", "", "", "", "", ""],
    a3030: [".30-30 ammunition", "ammo", "ammo", "3030", "", "", "", "", "Flat or round-nose bullets for tube magazines."],
    a76254: ["7.62×54mmR ammunition", "ammo", "ammo", "762x54", "", "", "", "", "Much surplus is corrosive: clean the bore the same day."],
    buck: ["12 gauge buckshot", "shell", "ammo", "12ga", "", "", "", "", "00 buck: 8–9 pellets of about 8 mm."],
    slug: ["12 gauge slugs", "shell", "ammo", "12ga", "", "", "", "", "One heavy projectile: longer range, big game."],
    bird: ["12 gauge birdshot", "shell", "ammo", "12ga", "", "", "", "", "Small game and birds."],
    g20: ["20 gauge shells", "shell", "ammo", "20ga", "", "", "", "", ""],
    arrows: ["Arrows", "box", "ammo", "arrow", "", "", "", "", "Match spine and length to your bow; check for cracks."],
    bolts: ["Crossbow bolts", "box", "ammo", "bolt", "", "", "", "", "Use the length and nock your crossbow calls for."],
    // Valuables: [name, drawing, kind, "", what it is, size, weight, "", notes]
    goldcoin: ["Gold coins (1 oz)", "coin", "valuables", "", "Bullion coin, e.g. Krugerrand, Maple Leaf, Eagle", "1 troy oz (31.1 g) of gold", "≈ 33 g", "", "Recognisable everywhere; keep the original tubes or capsules."],
    goldsmall: ["Small gold (1/10 oz)", "coin", "valuables", "", "Fractional gold coins", "3.1 g of gold", "≈ 3.4 g", "", "Easier to trade for small amounts than full ounces."],
    silvercoin: ["Silver coins (1 oz)", "coin", "valuables", "", "Bullion coin", "1 troy oz (31.1 g) of silver", "≈ 31 g", "", "Low value per coin: good for small trades."],
    goldbar: ["Gold bar", "bar", "valuables", "", "Bullion bar with stamp and serial", "e.g. 10 g, 1 oz, 100 g", "", "", "Keep the certificate with it."],
    cash: ["Cash", "cash", "valuables", "", "Banknotes, small denominations", "", "", "", "Small notes are easier to use when change is scarce. Keep some in your go-bag."],
    foreigncash: ["Foreign cash", "cash", "valuables", "", "Banknotes in another currency", "", "", "", "Useful near a border or if you may have to leave."],
    jewellery: ["Jewellery", "jewel", "valuables", "", "Rings, chains, watches", "", "", "", "Photograph pieces for insurance; note their hallmarks."],
    watch: ["Watch", "jewel", "valuables", "", "Mechanical or quartz", "", "", "", "A mechanical watch keeps time with no battery."],
    // Data: backups and documents.
    usb: ["USB stick", "stick", "data", "", "Flash drive", "", "≈ 10 g", "", "Encrypt it (e.g. LUKS or VeraCrypt) if it holds documents."],
    ssd: ["External drive", "drive", "data", "", "SSD or hard drive backup", "", "", "", "Test a restore now and then; a backup you can't open isn't one."],
    sdcard: ["Memory card", "stick", "data", "", "SD or microSD", "", "≈ 1 g", "", "Tiny and easy to hide; easy to lose too."],
    docs: ["Document copies", "papers", "data", "", "Passports, IDs, deeds, insurance, prescriptions", "", "", "", "Paper copies in a waterproof bag, and a scan on an encrypted stick."],
    backup: ["Offline backup", "drive", "data", "", "A copy of your important files, kept away from the computer", "", "", "", "Keep one copy off-site (3-2-1: three copies, two kinds of media, one elsewhere)."],
    umbrabackup: ["Umbra backup", "stick", "data", "", "Your Umbra backup file (Settings → Back up)", "", "", "", "Your profile, conversations, waypoints and this vault, ready to restore."],
  };
  const KINDS = { weapon: "WEAPONS", ammo: "AMMUNITION", gear: "GEAR", valuables: "VALUABLES", data: "DATA" };

  // ----------------------------------------------------------- drawing

  // The inspect view: the drawing with its parts named around it, lines
  // from each name to its part.
  function inspectArt(type) {
    const a = ART[type] || ART.box, rows = a.art.length, cols = Math.max(...a.art.map((r) => r.length));
    const top = 3, bot = 3, W = cols + 12, grid = [];
    for (let r = 0; r < rows + top + bot; r++) grid.push(Array.from({ length: W }, () => [" ", ""]));
    a.art.forEach((line, r) => [...line].forEach((c, i) => { if (c !== " ") grid[r + top][i + 6] = [c, "a"]; }));
    const lanes = { up: [0, 0], down: [0, 0] };   // where each row of labels has room from
    const sorted = a.parts.slice().sort((x, y) => x[2] - y[2]);
    for (const [name, r, c] of sorted) {
      const up = r < rows / 2, col = c + 6;
      const lane = up ? (lanes.up[0] <= col - Math.floor(name.length / 2) ? 0 : 1) : (lanes.down[0] <= col - Math.floor(name.length / 2) ? 0 : 1);
      const lr = up ? lane : rows + top + bot - 1 - lane;
      const start = Math.max(0, Math.min(W - name.length, col - Math.floor(name.length / 2)));
      [...name].forEach((ch, i) => (grid[lr][start + i] = [ch, "l"]));
      (up ? lanes.up : lanes.down)[lane] = start + name.length + 1;
      // The line, through empty cells only, to the part.
      const from = up ? lr + 1 : lr - 1, to = r + top, step = up ? 1 : -1;
      for (let y = from; up ? y < to : y > to; y += step) {
        if (grid[y][col][1] === "a") break;
        if (grid[y][col][0] === " ") grid[y][col] = [y === to - step ? (up ? "┬" : "┴") : "│", "k"];
      }
    }
    return grid.map((row) => {
      let html = "", cls = null, run = "";
      for (const [ch, c] of row) {
        if (c !== cls) { if (run) html += cls ? `<span class="v-${cls}">${escapeHtml(run)}</span>` : escapeHtml(run); run = ""; cls = c; }
        run += ch;
      }
      if (run) html += cls ? `<span class="v-${cls}">${escapeHtml(run)}</span>` : escapeHtml(run);
      return html;
    }).join("\n");
  }

  // ------------------------------------------------------------- state

  let items = null, password = "", sel = null, adding = false;
  const newId = () => Math.random().toString(36).slice(2, 12).padEnd(6, "0");
  const post = (url, data) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) })
    .then(async (r) => ({ ok: r.ok, ...(await r.json().catch(() => ({}))) })).catch(() => ({ ok: false }));
  async function persist() {
    const r = await post("/api/vault/save", { password, items });
    if (!r.ok) { Sound.error(); return false; }
    items = r.items;
    return true;
  }
  // Rounds on hand per calibre.
  const rounds = () => { const m = {}; for (const it of items) if (it.kind === "ammo" && it.calibre) m[it.calibre] = (m[it.calibre] || 0) + (it.count || 0); return m; };
  const typeOf = (it) => (LIB[it.model] ? LIB[it.model][1] : it.kind === "ammo" ? (/ga$/.test(it.calibre) ? "shell" : /arrow|bolt/.test(it.calibre) ? "box" : "ammo")
    : it.kind === "gear" ? "knife" : it.kind === "valuables" ? "coin" : it.kind === "data" ? "drive" : "rifle");

  // ------------------------------------------------------------ the door

  const DOOR = (spoke) => [
    "      ▄▄▄▄▄▄▄▄▄▄▄▄      ",
    "   ▄██▀▀        ▀▀██▄   ",
    "  ██▀   ▄▄▄▄▄▄▄▄   ▀██  ",
    " ██   ▄█▀      ▀█▄   ██ ",
    "██   ██    " + spoke[0] + "    ██   ██",
    "██▐▌ ██  " + spoke[1] + "   ██ ▐▌██",
    "██   ██    " + spoke[2] + "    ██   ██",
    " ██   ▀█▄      ▄█▀   ██ ",
    "  ██▄   ▀▀▀▀▀▀▀▀   ▄██  ",
    "   ▀██▄▄        ▄▄██▀   ",
    "      ▀▀▀▀▀▀▀▀▀▀▀▀      "];
  const SPOKES = [["│ ", "──◉──", "│ "], ["╲ ", " ─◉─ ", " ╲"], ["  ", "──◉──", "  "], [" ╱", " ─◉─ ", "╱ "]];

  async function render(body) {
    if (items) return inside(body);
    const lock = await fetch("/api/lock").then((r) => r.json()).catch(() => ({}));
    body.innerHTML = `<div class="v-gate"><pre class="v-door">${DOOR(SPOKES[0]).join("\n")}</pre>
      <div class="v-gate-side"><div class="fk-h">THE VAULT</div>
        <p class="lib-note">Your arsenal and what matters most: firearms, ammunition, defence gear, valuables (gold, silver, cash, jewellery) and data (backups, drives, document copies), with an inspect view of each.
          ${lock.password ? "Enter your lock password to open it." : "No lock password is set, so it opens with a click; set one in your Profile to keep it closed."}</p>
        ${lock.password ? `<input type="password" class="v-pw" placeholder="Lock password" autocomplete="off">` : ""}
        <button class="solid v-open">OPEN THE VAULT ▸</button><small class="v-msg"></small>
        <p class="fk-warn">Stored on this computer only, hidden behind the password but not encrypted. Keep firearms locked and unloaded,
          ammunition apart, and follow the laws where you live.</p></div></div>`;
    const door = body.querySelector(".v-door"), pw = body.querySelector(".v-pw");
    const tryOpen = async () => {
      const r = await post("/api/vault/open", { password: pw ? pw.value : "" });
      if (!r.ok) {
        body.querySelector(".v-msg").textContent = r.error === "wrong password" ? "Wrong password." : "Couldn't open it.";
        door.classList.remove("shake"); void door.offsetWidth; door.classList.add("shake"); Sound.error();
        return;
      }
      password = pw ? pw.value : "";
      Sound.unlock();
      // The wheel turns, the bolts slide, the door swings.
      let f = 0;
      const still = document.body.classList.contains("reduce-motion");
      const spin = setInterval(() => { door.textContent = DOOR(SPOKES[++f % 4]).join("\n"); }, 90);
      setTimeout(() => { clearInterval(spin); door.classList.add("open"); Sound.glitch(); }, still ? 0 : 820);
      setTimeout(() => { items = r.items; inside(body); }, still ? 50 : 1350);
    };
    body.querySelector(".v-open").addEventListener("click", tryOpen);
    pw?.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") tryOpen(); });
    setTimeout(() => pw?.focus(), 60);
  }

  // ------------------------------------------------------------ inside

  function inside(body) {
    const R = rounds();
    const weapons = items.filter((i) => i.kind === "weapon").reduce((n, i) => n + (i.count || 1), 0);
    const count = (k) => items.filter((i) => i.kind === k).reduce((n, i) => n + (i.count || 1), 0);
    body.innerHTML = `<div class="v-top"><span class="v-stat"><small>WEAPONS</small><b>${weapons}</b></span>
      ${count("valuables") ? `<span class="v-stat"><small>VALUABLES</small><b>${items.filter((i) => i.kind === "valuables").length}</b></span>` : ""}
      ${count("data") ? `<span class="v-stat"><small>DATA</small><b>${items.filter((i) => i.kind === "data").length}</b></span>` : ""}
      ${Object.entries(R).map(([c, n]) => `<span class="v-stat"><small>${escapeHtml(CAL[c] || c)}</small><b>${n}</b></span>`).join("")}
      <span class="v-top-right"><button class="solid v-add">+ ADD</button><button class="ghost v-lock" title="Lock the vault|Closes it again; it asks for the password next time.">\u{F033E} LOCK</button></span></div>
      <div class="v-main"><div class="v-list"></div><div class="v-inspect"></div></div>
      <p class="fk-warn">Keep firearms locked and unloaded, ammunition stored apart, cool and dry. Follow the laws where you live.</p>`;
    body.querySelector(".v-lock").addEventListener("click", () => { items = null; password = ""; sel = null; Sound.lock(); render(body); });
    body.querySelector(".v-add").addEventListener("click", () => { adding = true; sel = null; list(body); addForm(body); Sound.click(); });
    list(body);
    if (adding) addForm(body);
    else if (sel && items.some((i) => i.id === sel)) inspect(body, items.find((i) => i.id === sel));
    else if (items.length) inspect(body, items[0]);
    else addForm(body);
  }

  function list(body) {
    const box = body.querySelector(".v-list"), R = rounds();
    box.innerHTML = Object.entries(KINDS).map(([k, name]) => {
      const mine = items.filter((i) => i.kind === k);
      return `<div class="v-group"><div class="lib-head">${name} · ${mine.length}</div>${mine.length ? mine.map((i) => {
        const have = i.kind === "weapon" && i.calibre ? [i.calibre, ...(ALSO[i.calibre] || [])].reduce((n, c) => n + (R[c] || 0), 0) : null;
        return `<button class="v-row ${sel === i.id ? "on" : ""}" data-id="${i.id}"><pre class="v-mini">${escapeHtml((ART[typeOf(i)] || ART.box).art[Math.floor((ART[typeOf(i)] || ART.box).art.length / 2)].trim().slice(0, 12))}</pre>
          <span><b></b><small>${escapeHtml(CAL[i.calibre] || i.calibre || "")}${have !== null ? ` · ${have} ROUNDS ON HAND` : ""}</small></span><em>×${i.count || (i.kind === "ammo" ? 0 : 1)}</em></button>`;
      }).join("") : `<p class="lib-note">None yet.</p>`}</div>`;
    }).join("");
    box.querySelectorAll(".v-row").forEach((b) => {
      b.querySelector("b").textContent = items.find((i) => i.id === b.dataset.id).name;
      b.addEventListener("mouseenter", Sound.hover);
      b.addEventListener("click", () => { adding = false; sel = b.dataset.id; list(body); inspect(body, items.find((i) => i.id === sel)); Sound.click(); });
    });
  }

  function inspect(body, it) {
    sel = it.id;
    const box = body.querySelector(".v-inspect"), L = LIB[it.model], R = rounds();
    const have = it.kind === "weapon" && it.calibre ? [it.calibre, ...(ALSO[it.calibre] || [])].reduce((n, c) => n + (R[c] || 0), 0) : null;
    const other = it.kind === "valuables" || it.kind === "data";
    const spec = L ? [[other ? "WHAT" : "ACTION", L[4]], [other ? "SIZE" : "CAPACITY", L[5]], ["WEIGHT", L[6]], ["EFFECTIVE RANGE", L[7]]].filter(([, v]) => v) : [];
    box.innerHTML = `<div class="v-card"><div class="v-card-head"><span>INSPECT · ${KINDS[it.kind].slice(0, -1)}</span><b>${escapeHtml(it.name.toUpperCase())}</b></div>
      <pre class="v-art">${inspectArt(typeOf(it))}</pre>
      <div class="v-specs">${it.calibre ? `<div><small>CALIBRE</small><b>${escapeHtml(CAL[it.calibre] || it.calibre)}</b></div>` : ""}
        ${spec.map(([k, v]) => `<div><small>${k}</small><b>${escapeHtml(v)}</b></div>`).join("")}
        ${have !== null ? `<div class="${have ? "" : "v-low"}"><small>ROUNDS ON HAND</small><b>${have}${have ? "" : " · NONE"}</b></div>` : ""}</div>
      ${L && L[8] ? `<p class="v-note">${escapeHtml(L[8])}</p>` : ""}
      <div class="v-fields">
        <label class="md-in"><span>NAME</span><input class="v-f-name" maxlength="60"></label>
        ${it.kind === "weapon" || it.kind === "ammo" ? `<label class="md-in"><span>CALIBRE</span><select class="v-f-cal"><option value="">—</option>${Object.entries(CAL).map(([k, n]) => `<option value="${k}" ${it.calibre === k ? "selected" : ""}>${escapeHtml(n)}</option>`).join("")}</select></label>` : ""}
        <label class="md-in"><span>${it.kind === "ammo" ? "ROUNDS" : it.kind === "valuables" && /cash/.test(it.model) ? "AMOUNT" : "HOW MANY"}</span><input class="v-f-count" type="number" min="0" max="99999"></label>
        ${it.kind === "weapon" ? `<label class="md-in"><span>SERIAL NUMBER</span><input class="v-f-serial" maxlength="40" placeholder="optional"></label>` : ""}
        <label class="md-in"><span>WHERE IT'S KEPT</span><input class="v-f-where" maxlength="60" placeholder="e.g. safe, top shelf"></label>
        <label class="md-in"><span>CONDITION</span><select class="v-f-condition">${["", "New", "Good", "Worn", "Needs work"].map((c) => `<option ${it.condition === c ? "selected" : ""}>${c}</option>`).join("")}</select></label>
      </div>
      <label class="md-in"><span>NOTES</span><textarea class="v-f-notes" rows="2" maxlength="400" placeholder="${{ weapon: "Accessories, zeroing, last cleaned…", ammo: "Type (FMJ, hollow point…), lot, bought when…", gear: "Where it lives, condition…", valuables: "Purity, certificates, where bought…", data: "What's on it, encrypted?, last updated…" }[it.kind] || ""}"></textarea></label>
      <div class="fk-row"><button class="solid v-save">SAVE ◆</button><button class="ghost v-del">✕ REMOVE</button><small class="v-saved"></small></div></div>`;
    const q = (s) => box.querySelector(s);
    q(".v-f-name").value = it.name; q(".v-f-count").value = it.count || (it.kind === "ammo" ? 0 : 1);
    if (q(".v-f-serial")) q(".v-f-serial").value = it.serial || "";
    q(".v-f-where").value = it.where || ""; q(".v-f-notes").value = it.notes || "";
    box.querySelectorAll("input, textarea").forEach((el) => el.addEventListener("keydown", (e) => e.stopPropagation()));
    // The parts' names appear one after another, like a scan.
    const labels = [...box.querySelectorAll(".v-l, .v-k")];
    if (!document.body.classList.contains("reduce-motion")) {
      labels.forEach((l) => (l.style.opacity = 0));
      labels.forEach((l, i) => setTimeout(() => (l.style.opacity = 1), 120 + i * 22));
    }
    q(".v-save").addEventListener("click", async () => {
      Object.assign(it, { name: q(".v-f-name").value.trim() || it.name, count: Math.max(0, +q(".v-f-count").value || 0),
        serial: q(".v-f-serial") ? q(".v-f-serial").value.trim() : "", where: q(".v-f-where").value.trim(),
        calibre: q(".v-f-cal") ? q(".v-f-cal").value : it.calibre,
        condition: q(".v-f-condition").value, notes: q(".v-f-notes").value.trim() });
      if (await persist()) { q(".v-saved").textContent = "Saved."; Sound.found(); inside(body); }
    });
    q(".v-del").addEventListener("click", async () => {
      const ok = await confirmDialog({ kind: "to-local", tag: "VAULT", title: `REMOVE "${it.name.toUpperCase()}"?`, body: "It's taken off your list.", ok: "REMOVE", cancel: "KEEP" });
      if (!ok) return;
      items = items.filter((x) => x.id !== it.id); sel = null;
      if (await persist()) { Sound.click(); inside(body); }
    });
  }

  // Adding: pick from the library (by kind) or type your own.
  function addForm(body) {
    const box = body.querySelector(".v-inspect");
    let kind = "weapon";
    const draw = () => {
      const lib = Object.entries(LIB).filter(([, l]) => l[2] === kind);
      box.innerHTML = `<div class="v-card"><div class="v-card-head"><span>ADD TO THE VAULT</span><b>CHOOSE FROM THE LIBRARY</b></div>
        <div class="fk-seg pf-choice v-kinds">${Object.entries(KINDS).map(([k, n]) => `<button data-k="${k}" class="${k === kind ? "on" : ""}">${n}</button>`).join("")}</div>
        <div class="v-lib">${lib.map(([id, l]) => `<button class="v-libi" data-id="${id}"><pre>${escapeHtml(ART[l[1]].art[Math.floor(ART[l[1]].art.length / 2)].trim().slice(0, 14))}</pre>
          <b>${escapeHtml(l[0])}</b><small>${escapeHtml(CAL[l[3]] || l[4] || "")}</small></button>`).join("")}
          <button class="v-libi v-custom"><pre>  ? ? ?  </pre><b>Something else</b><small>Type it in yourself</small></button></div>
        <div class="fk-row"><button class="ghost v-cancel">CANCEL</button></div></div>`;
      box.querySelectorAll(".v-kinds button").forEach((b) => b.addEventListener("click", () => { kind = b.dataset.k; draw(); Sound.click(); }));
      box.querySelectorAll(".v-libi").forEach((b) => b.addEventListener("click", async () => {
        const L = LIB[b.dataset.id];
        const it = L ? { id: newId(), kind: L[2], model: b.dataset.id, name: L[0], calibre: L[3], count: L[2] === "ammo" ? 50 : 1, added: Date.now() }
          : { id: newId(), kind, model: "", name: { ammo: "Ammunition", gear: "Gear", valuables: "Valuable", data: "Data" }[kind] || "Firearm", calibre: "", count: kind === "ammo" ? 50 : 1, added: Date.now() };
        items.push(it); adding = false; sel = it.id;
        if (await persist()) { Sound.found(); inside(body); }
      }));
      box.querySelector(".v-cancel").addEventListener("click", () => { adding = false; inside(body); Sound.click(); });
    };
    draw();
  }

  // Locking Umbra (or leaving it) closes the vault.
  new MutationObserver(() => { if (document.body.classList.contains("locked")) { items = null; password = ""; } })
    .observe(document.body, { attributes: true, attributeFilter: ["class"] });

  return { render, lock: () => { items = null; password = ""; }, LIB, CAL };
})();
