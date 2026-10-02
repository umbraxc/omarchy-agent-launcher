"""Umbra Outpost content: skills, items, recipes, enemies, places and rewards.

Everything the game knows is defined here once. outpost.py runs the rules
and the UI receives the same definitions (GET /api/outpost/data). Numbers
follow a few formulas so every tier feels like the last one, only better.
All content is original and fictional.
"""

# ------------------------------------------------------------- experience
# The classic idle-RPG curve: level 99 needs 13,034,431 XP.
def _xp_table():
    table, points = [0, 0], 0
    for level in range(1, 120):
        points += int(level + 300 * 2 ** (level / 7))
        table.append(points // 4)
    return table


XP_TABLE = _xp_table()          # XP_TABLE[L] = XP needed for level L (1..120)
MAX_LEVEL = 99


def level_for(xp):
    lo, hi = 1, MAX_LEVEL
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if XP_TABLE[mid] <= xp:
            lo = mid
        else:
            hi = mid - 1
    return lo


# ------------------------------------------------------------------ skills
SKILLS = {}


def _skill(sid, name, kind, color, glyph, desc):
    SKILLS[sid] = {"id": sid, "name": name, "kind": kind, "color": color, "glyph": glyph + "\ufe0e", "desc": desc}


_skill("forestry", "Forestry", "gather", "#8bbf6a", "♣", "Fell trees for logs: timber for Carpentry, fuel for the hearth and beams for new buildings.")
_skill("salvaging", "Salvaging", "gather", "#b9ad98", "▣", "Search the ruins for scrap, parts and the odd treasure someone left behind.")
_skill("fishing", "Fishing", "gather", "#6fb8d0", "≈", "Catch fish for the cooking pot. Rivers carry more than fish.")
_skill("foraging", "Foraging", "gather", "#a6c96a", "✿", "Gather herbs, berries and mushrooms for Remedies and the kitchen.")
_skill("trapping", "Trapping", "gather", "#c49a6c", "∩", "Set snares and lines for hides, feathers and meat.")
_skill("quarrying", "Quarrying", "gather", "#a3a7b3", "◆", "Dig clay, stone and ore. Lucky swings turn up gems.")
_skill("cooking", "Cooking", "craft", "#e59a5a", "◒", "Cook meals that keep you going in a fight. Practice means fewer burnt dinners.")
_skill("metalwork", "Metalwork", "craft", "#d0a070", "⊤", "Smelt bars and forge blades, armour, shields and arrowtips.")
_skill("carpentry", "Carpentry", "craft", "#c8a46e", "≡", "Saw planks, carve bows and fletch arrows.")
_skill("tailoring", "Tailoring", "craft", "#d4b48c", "✄", "Tan hides and sew leather gear, cloaks and packs.")
_skill("remedies", "Remedies", "craft", "#e0858a", "✚", "Brew tonics and salves. Carry one in your kit for a lasting boost.")
_skill("tinkering", "Tinkering", "craft", "#e6c36a", "ϟ", "Wire cells, gadgets and charms from the salvage pile.")
_skill("hearth", "Hearthkeeping", "support", "#ef8f4f", "☼", "Keep the common hearth burning. While it's warm, everyone learns faster.")
_skill("signals", "Signals", "support", "#a49ad6", "◇", "Scan old frequencies for fragments; tune them into permanent broadcasts.")
_skill("scouting", "Scouting", "support", "#8fcfae", "»", "Build a route around the valley and run it. Every stop on it pays off.")
_skill("melee", "Melee", "combat", "#e07a64", "⚔", "Close combat: hit often and hard with blades and clubs.")
_skill("marksmanship", "Marksmanship", "combat", "#9ccf7a", "➶", "Bows and arrows: strike before they close the distance.")
_skill("gadgetry", "Gadgetry", "combat", "#7fc6e6", "✶", "Spark guns and arc tools powered by cells. Stuns brawlers.")
_skill("fortitude", "Fortitude", "combat", "#a9b4c8", "◈", "Read the fight and avoid the blow: your evasion.")
_skill("vitality", "Vitality", "combat", "#e66b6b", "♥", "How much you can take. Ten hit points per level.")
_skill("bounty", "Bounty Hunting", "combat", "#d6b85a", "✪", "Take bounties for tokens, special gear and the far north.")

GATHER = [s for s, v in SKILLS.items() if v["kind"] == "gather"]
CRAFT = [s for s, v in SKILLS.items() if v["kind"] == "craft"]
STYLES = {"melee": "melee", "ranged": "marksmanship", "tech": "gadgetry"}
# The style triangle: each style is strong against the one it lists.
BEATS = {"melee": "ranged", "ranged": "tech", "tech": "melee"}

# Rarity by tier, shared by item frames and loot messages.
RARITY = ["common", "common", "uncommon", "fine", "rare", "epic", "legendary", "legendary"]
RARITY_COLORS = {"common": "#b8b2a6", "uncommon": "#8fc77a", "fine": "#7fb6e0", "rare": "#b192e6", "epic": "#e8a85a", "legendary": "#ef6f5f"}

# ------------------------------------------------------------------- items
ITEMS = {}


def _text(glyph):
    """Append the text-presentation selector so symbols never become colour emoji."""
    return "".join(ch + ("\ufe0e" if ord(ch) >= 0x2190 else "") for ch in glyph)


def item(iid, name, cat, value, glyph, color=None, tier=1, desc="", **extra):
    ITEMS[iid] = {"id": iid, "name": name, "cat": cat, "value": value, "glyph": _text(glyph), "color": color,
                  "tier": tier, "rarity": RARITY[min(tier, 7)], "desc": desc, **extra}
    return iid


# Gathering tables: (id, name, level, seconds, xp, value)
TREES = [("birch", "Birch", 1, 3.0, 10, 1), ("pine", "Pine", 10, 3.4, 18, 3), ("oak", "Oak", 20, 3.8, 28, 6),
         ("maple", "Maple", 32, 4.3, 42, 10), ("cedar", "Cedar", 45, 4.8, 62, 16), ("yew", "Yew", 58, 5.6, 90, 26),
         ("ironwood", "Ironwood", 72, 6.5, 130, 45), ("ghostwood", "Ghostwood", 88, 7.5, 190, 80)]
FISH = [("perch", "Perch", 1, 3.0, 10, 2, 30), ("trout", "Trout", 10, 3.4, 18, 4, 50), ("carp", "Carp", 20, 3.8, 27, 7, 70),
        ("pike", "Pike", 30, 4.2, 38, 11, 90), ("salmon", "Salmon", 42, 4.7, 54, 17, 120), ("catfish", "Catfish", 55, 5.2, 74, 26, 150),
        ("sturgeon", "Sturgeon", 70, 6.0, 105, 40, 190), ("silver_eel", "Silver eel", 85, 7.0, 150, 62, 240)]
HERBS = [("wild_garlic", "Wild garlic", 1, 3.0, 9, 1), ("nettle", "Nettle", 8, 3.2, 14, 2), ("yarrow", "Yarrow", 18, 3.6, 22, 4),
         ("chanterelle", "Chanterelle", 28, 4.0, 31, 7), ("elderberry", "Elderberry", 38, 4.4, 42, 10), ("willow_bark", "Willow bark", 50, 4.8, 57, 15),
         ("arnica", "Arnica", 62, 5.2, 75, 22), ("ghost_orchid", "Ghost orchid", 80, 6.0, 110, 38)]
ORES = [("clay", "Clay", 1, 3.0, 8, 1), ("copper_ore", "Copper ore", 1, 3.0, 9, 2), ("tin_ore", "Tin ore", 5, 3.0, 11, 2),
        ("iron_ore", "Iron ore", 15, 3.5, 20, 5), ("coal", "Coal", 25, 4.0, 28, 7), ("quartz", "Quartz", 35, 4.4, 38, 10),
        ("nickel_ore", "Nickel ore", 48, 5.0, 52, 15), ("titanium_ore", "Titanium ore", 62, 5.8, 72, 24), ("skyfall_ore", "Skyfall ore", 82, 7.0, 110, 42)]
# Trapping: (id, name, level, seconds, xp, hide, meat, extra drop)
GAME = [("rabbit", "Rabbit run", 1, 4.0, 12, "rabbit_hide", "raw_rabbit", None),
        ("pheasant", "Pheasant line", 12, 4.5, 20, None, "raw_fowl", ("feathers", 3, 7)),
        ("deer", "Deer trail", 28, 5.5, 36, "deer_hide", "venison", None),
        ("boar", "Boar wallow", 44, 6.0, 52, "boar_hide", "raw_pork", None),
        ("elk", "Elk crossing", 60, 7.0, 75, "elk_hide", "elk_meat", None),
        ("muskox", "Muskox ridge", 78, 8.0, 110, "muskox_fur", "muskox_meat", None)]

for i, (tid, name, lvl, sec, xp, val) in enumerate(TREES):
    item(f"{tid}_log", f"{name} log", "log", val, "♣", "#b58e5e", tier=1 + i * 6 // len(TREES),
         desc=f"A {name.lower()} log. Saw it into planks, carve it into a bow, or feed the hearth.")
for i, (fid, name, lvl, sec, xp, val, heal) in enumerate(FISH):
    item(f"raw_{fid}", f"Raw {name.lower()}", "raw", val, "≈", "#8fc4d4", tier=1 + i * 6 // len(FISH), desc="Cook it before it turns.")
for i, (hid, name, lvl, sec, xp, val) in enumerate(HERBS):
    item(hid, name, "herb", val, "✿", "#a6c96a", tier=1 + i * 6 // len(HERBS), desc="Fresh from the hedgerow. Used in remedies and cooking.")
for i, (oid, name, lvl, sec, xp, val) in enumerate(ORES):
    item(oid, name, "ore", val, "◆", "#a9a2a0" if oid != "coal" else "#55524f", tier=1 + i * 6 // len(ORES), desc="Raw from the quarry.")
item("rabbit_hide", "Rabbit hide", "hide", 2, "∩", "#d8c4a8", 1, "Soft, small and warm.")
item("deer_hide", "Deer hide", "hide", 6, "∩", "#c49a6c", 2)
item("boar_hide", "Boar hide", "hide", 12, "∩", "#9b7652", 3)
item("elk_hide", "Elk hide", "hide", 22, "∩", "#b08a64", 4)
item("muskox_fur", "Muskox fur", "hide", 40, "∩", "#8a7460", 5)
for mid, name, val, heal in [("raw_rabbit", "Raw rabbit", 2, 0), ("raw_fowl", "Raw fowl", 4, 0), ("venison", "Raw venison", 8, 0),
                             ("raw_pork", "Raw pork", 13, 0), ("elk_meat", "Raw elk", 20, 0), ("muskox_meat", "Raw muskox", 32, 0)]:
    item(mid, name, "raw", val, "♠", "#c97a6a", 1, "Cook it first.")
item("feathers", "Feathers", "material", 1, "‚", "#e8e2d6", 1, "For fletching arrows.")
item("burnt_food", "Burnt food", "junk", 0, "∙", "#5d554e", 0, "Charcoal with ambitions.")
item("old_boot", "Old boot", "junk", 1, "⌐", "#76695c", 0, "One careful owner. Then the river.")

# Salvage materials.
for sid, name, val, glyph, color, tier, desc in [
    ("scrap_metal", "Scrap metal", 1, "▣", "#a8a49c", 1, "Bent, rusted, useful."), ("wire", "Wire", 1, "∫", "#c3a26e", 1, "Insulated, mostly."),
    ("rubber", "Rubber", 2, "○", "#4f4b48", 1, "Old tyres and hoses."), ("glass", "Glass", 2, "◊", "#a8d6e0", 1, "Clean panes and bottles."),
    ("cloth", "Cloth", 2, "▤", "#c9b9a4", 1, "Curtains, sheets and old coats."), ("nails", "Nails", 2, "†", "#9d9d9d", 1, "A jar of assorted nails."),
    ("copper_wire", "Copper wire", 4, "∫", "#d98b52", 2, "Pulled from walls and motors."), ("tool_parts", "Tool parts", 6, "⚙", "#b0a690", 2, "Springs, gears and bolts."),
    ("bandage_roll", "Bandage roll", 5, "▭", "#f2ece0", 2, "Sealed and clean."), ("empty_vial", "Empty vial", 3, "ı", "#cfe8ee", 2, "For remedies."),
    ("circuit_board", "Circuit board", 10, "▦", "#5fae7a", 3, "Green, dusty and full of possibilities."), ("battery", "Battery", 8, "▮", "#e0c060", 3, "Still holds a little charge."),
    ("lens", "Lens", 12, "◎", "#bfe2f0", 3, "Ground glass from a camera or scope."), ("fuel_can", "Fuel can", 12, "▙", "#c8553d", 3, "Half full. Smells strong."),
    ("engine_parts", "Engine parts", 18, "⚙", "#8f8b84", 4, "Pistons and valves."), ("surgical_steel", "Surgical steel", 25, "⁄", "#dfe4e8", 4, "Fine instruments, carefully kept."),
    ("gold_contacts", "Gold contacts", 30, "▫", "#f2c84b", 5, "Tiny, precious connectors."), ("radio_valve", "Radio valve", 40, "♁", "#e9a65a", 4, "A glowing glass valve from an old set."),
    ("server_core", "Server core", 120, "▩", "#7fe0c0", 6, "A sealed core from the data centre. Still warm."),
]:
    item(sid, name, "material", val, glyph, color, tier, desc)
# Things worth keeping (or selling).
for vid, name, val, glyph, tier, desc in [
    ("old_coin", "Old coin", 25, "¤", 3, "Stamped with a face nobody remembers."), ("family_photo", "Family photo", 15, "▢", 2, "Someone's summer, under a cracked frame."),
    ("brass_key", "Brass key", 40, "⚷", 3, "It opened something once."), ("message_bottle", "Message in a bottle", 60, "ß", 4, "The note inside is still dry."),
    ("amber", "Amber", 80, "●", 4, "Golden resin with a tiny wing inside."), ("garnet", "Garnet", 120, "♦", 5, "A deep red stone."),
    ("pocket_watch", "Pocket watch", 90, "◷", 4, "Wound, it keeps perfect time."), ("star_chart", "Star chart", 150, "✦", 5, "Hand inked, with notes in the margin."),
]:
    item(vid, name, "valuable", val, glyph, "#e8c56a", tier, desc)

# ------------------------------------------------------------------ recipes
# recipe: {id, skill, name, level, seconds, xp, inputs {item: n}, outputs {item: n} | table, ...}
RECIPES = {}


def recipe(rid, skill, name, level, seconds, xp, inputs=None, outputs=None, **extra):
    RECIPES[rid] = {"id": rid, "skill": skill, "name": name, "level": level, "seconds": seconds, "xp": xp,
                    "inputs": inputs or {}, "outputs": outputs or {}, **extra}


for tid, name, lvl, sec, xp, val in TREES:
    recipe(f"tree_{tid}", "forestry", f"{name} tree", lvl, sec, xp, outputs={f"{tid}_log": 1}, art=tid)
for fid, name, lvl, sec, xp, val, heal in FISH:
    recipe(f"fish_{fid}", "fishing", f"{name} spot", lvl, sec, xp, outputs={f"raw_{fid}": 1},
           extras=[("old_boot", .04), ("message_bottle", .0015)])
for hid, name, lvl, sec, xp, val in HERBS:
    recipe(f"forage_{hid}", "foraging", name, lvl, sec, xp, outputs={hid: 1}, extras=[("amber", .001)])
for oid, name, lvl, sec, xp, val in ORES:
    recipe(f"quarry_{oid}", "quarrying", name if oid in ("clay", "coal", "quartz") else name.replace(" ore", " vein"), lvl, sec, xp,
           outputs={oid: 1}, extras=[("amber", .004), ("garnet", .0025)] if lvl >= 35 else [("amber", .002)])
for gid, name, lvl, sec, xp, hide, meat, extra in GAME:
    out = {meat: 1}
    if hide:
        out[hide] = 1
    recipe(f"trap_{gid}", "trapping", name, lvl, sec, xp, outputs=out, bonus=extra)

# Salvaging: each search rolls one find from the site's table.
SALVAGE_SITES = [
    ("wreck", "Roadside wreck", 1, 3.0, 9, [("scrap_metal", 50, 1, 3), ("wire", 30, 1, 2), ("rubber", 15, 1, 2), ("glass", 10, 1, 2)], [("old_coin", .004)]),
    ("house", "Abandoned house", 10, 3.5, 16, [("cloth", 40, 1, 3), ("nails", 30, 2, 5), ("glass", 15, 1, 3), ("wire", 15, 1, 3)], [("family_photo", .01), ("brass_key", .003)]),
    ("hardware", "Hardware store", 22, 4.0, 26, [("scrap_metal", 30, 2, 4), ("nails", 25, 3, 7), ("copper_wire", 25, 1, 3), ("tool_parts", 15, 1, 2)], [("brass_key", .006)]),
    ("pharmacy", "Pharmacy", 32, 4.2, 36, [("bandage_roll", 35, 1, 2), ("cloth", 25, 2, 4), ("empty_vial", 30, 1, 4)], [("pocket_watch", .003)]),
    ("electronics", "Electronics shop", 42, 4.5, 48, [("circuit_board", 30, 1, 2), ("copper_wire", 30, 2, 5), ("battery", 25, 1, 2), ("lens", 10, 1, 1)], [("radio_valve", .01)]),
    ("depot", "Fuel depot", 54, 5.0, 64, [("rubber", 30, 2, 5), ("fuel_can", 25, 1, 2), ("scrap_metal", 25, 3, 6), ("engine_parts", 15, 1, 2)], [("old_coin", .02)]),
    ("hospital", "Hospital wing", 66, 5.5, 85, [("bandage_roll", 35, 2, 4), ("empty_vial", 30, 2, 5), ("surgical_steel", 20, 1, 2), ("battery", 15, 1, 2)], [("pocket_watch", .006)]),
    ("datacentre", "Data centre", 80, 6.0, 120, [("circuit_board", 35, 2, 4), ("gold_contacts", 25, 1, 2), ("copper_wire", 30, 3, 6), ("lens", 10, 1, 2)], [("server_core", .012), ("star_chart", .004)]),
]
for sid, name, lvl, sec, xp, table, rares in SALVAGE_SITES:
    recipe(f"salvage_{sid}", "salvaging", name, lvl, sec, xp, table=table, extras=rares, art=sid)

# Cooking.
for fid, name, lvl, sec, xp, val, heal in FISH:
    item(f"cooked_{fid}", f"Cooked {name.lower()}", "food", val * 2 + 2, "◍", "#e59a5a", 1 + FISH.index((fid, name, lvl, sec, xp, val, heal)) * 6 // len(FISH),
         f"Heals {heal} hit points.", heal=heal)
    recipe(f"cook_{fid}", "cooking", f"Cooked {name.lower()}", lvl, 2.5, xp * 1.1, {f"raw_{fid}": 1}, {f"cooked_{fid}": 1}, burn=True)
for mid, cid, name, lvl, heal, xp in [("raw_rabbit", "roast_rabbit", "Roast rabbit", 1, 40, 12), ("raw_fowl", "roast_fowl", "Roast fowl", 12, 60, 22),
                                     ("venison", "venison_steak", "Venison steak", 28, 95, 40), ("raw_pork", "pork_roast", "Pork roast", 44, 130, 58),
                                     ("elk_meat", "elk_steak", "Elk steak", 60, 170, 80), ("muskox_meat", "muskox_stew", "Muskox stew", 78, 225, 115)]:
    item(cid, name, "food", ITEMS[mid]["value"] * 2 + 3, "◍", "#d9845a", max(1, lvl // 15), f"Heals {heal} hit points.", heal=heal)
    recipe(f"cook_{cid}", "cooking", name, lvl, 2.8, xp, {mid: 1}, {cid: 1}, burn=True)
for cid, name, lvl, heal, xp, inputs in [("garlic_stew", "Garlic rabbit stew", 8, 70, 26, {"raw_rabbit": 1, "wild_garlic": 2}),
                                        ("hunters_pie", "Hunter's pie", 34, 140, 60, {"venison": 1, "chanterelle": 2}),
                                        ("orchard_tart", "Elderberry tart", 46, 160, 74, {"elderberry": 3, "raw_fowl": 1}),
                                        ("feast_platter", "Outpost feast", 74, 300, 150, {"elk_meat": 1, "raw_salmon": 1, "arnica": 1})]:
    item(cid, name, "food", 40 + lvl * 2, "◍", "#f0b060", max(1, lvl // 15), f"Heals {heal} hit points.", heal=heal)
    recipe(f"cook_{cid}", "cooking", name, lvl, 3.2, xp, inputs, {cid: 1}, burn=True)

# Metalwork: bars, then a set of gear per metal.
METALS = [("bronze", "Bronze", 1, {"copper_ore": 1, "tin_ore": 1}, 6), ("iron", "Iron", 15, {"iron_ore": 1}, 14),
          ("steel", "Steel", 30, {"iron_ore": 1, "coal": 2}, 22), ("alloy", "Nickel-steel", 48, {"nickel_ore": 1, "coal": 2}, 34),
          ("titanium", "Titanium", 62, {"titanium_ore": 1, "coal": 3}, 50), ("skyfall", "Skyfall", 82, {"skyfall_ore": 1, "coal": 4}, 75)]
METAL_COLORS = {"bronze": "#c98b4f", "iron": "#9a9ea4", "steel": "#c3cad2", "alloy": "#9fc2b8", "titanium": "#d6dee8", "skyfall": "#b39cf0"}
for i, (mid, name, lvl, ores, bxp) in enumerate(METALS):
    tier = i + 1
    item(f"{mid}_bar", f"{name} bar", "bar", 4 + i * i * 6, "▬", METAL_COLORS[mid], tier, "Ready for the anvil.")
    recipe(f"smelt_{mid}", "metalwork", f"{name} bar", lvl, 2.6, bxp, ores, {f"{mid}_bar": 1})
    s = 1 + i * 1.0   # stat scale per tier
    for key, label, slot, bars, off, stats in [
        ("machete", "machete", "weapon", 2, 1, {"style": "melee", "acc": round(8 + 14 * s), "str": round(6 + 13 * s), "speed": 2.4}),
        ("helmet", "helmet", "head", 2, 2, {"def": round(3 + 4 * s)}),
        ("arrowtips", "arrowtips", None, 1, 3, None),
        ("greaves", "greaves", "legs", 3, 5, {"def": round(5 + 6 * s)}),
        ("shield", "shield", "offhand", 3, 6, {"def": round(5 + 7 * s), "acc": -2}),
        ("plate", "chestplate", "body", 4, 8, {"def": round(8 + 10 * s)}),
    ]:
        iid = f"{mid}_{key}"
        req = min(99, lvl + off)
        if key == "arrowtips":
            item(iid, f"{name} arrowtips", "material", 1 + i * 2, "‹", METAL_COLORS[mid], tier, "Fletch them onto shafts.")
            recipe(f"forge_{iid}", "metalwork", f"{name} arrowtips ×15", req, 2.8, bxp * 1.5, {f"{mid}_bar": 1}, {iid: 15})
        else:
            need = {"melee": max(1, lvl)} if key == "machete" else {"fortitude": max(1, lvl)}
            item(iid, f"{name} {label}", "gear", bars * (8 + i * i * 9), {"weapon": "/", "head": "∩", "legs": "Π", "offhand": "◘", "body": "▓"}[slot],
                 METAL_COLORS[mid], tier, "", slot=slot, stats=stats, req=need)
            recipe(f"forge_{iid}", "metalwork", f"{name} {label}", req, 3.0, bars * bxp * 1.6, {f"{mid}_bar": bars}, {iid: 1})

# Carpentry: planks and bows from each wood; shafts; arrows from each metal.
for i, (tid, name, lvl, sec, xp, val) in enumerate(TREES):
    item(f"{tid}_plank", f"{name} plank", "material", val * 2 + 1, "═", "#c8a46e", 1 + i * 6 // len(TREES), "Sawn and planed. Buildings want these.")
    recipe(f"plank_{tid}", "carpentry", f"{name} plank", lvl, 2.4, xp * .6, {f"{tid}_log": 1}, {f"{tid}_plank": 1})
    if i < 6:
        s = 1 + i
        bid = f"{tid}_bow"
        item(bid, f"{name} bow", "gear", (val + 4) * 6, ")", "#c8a46e", i + 1, "", slot="weapon",
             stats={"style": "ranged", "acc": round(10 + 15 * s), "str": round(4 + 10 * s), "speed": 2.8}, req={"marksmanship": max(1, lvl)})
        recipe(f"bow_{tid}", "carpentry", f"{name} bow", min(99, lvl + 4), 3.0, xp * 2.2, {f"{tid}_log": 3}, {bid: 1})
item("arrow_shafts", "Arrow shafts", "material", 1, "|", "#c8a46e", 1, "Straight birch, ready for tips.")
recipe("shafts", "carpentry", "Arrow shafts ×15", 1, 2.2, 5, {"birch_log": 1}, {"arrow_shafts": 15})
for i, (mid, name, lvl, ores, bxp) in enumerate(METALS):
    aid = f"{mid}_arrows"
    item(aid, f"{name} arrows", "ammo", 1 + i * 2, "→", METAL_COLORS[mid], i + 1, "Loaded in your quiver; fired by bows.", slot="ammo",
         stats={"str": 3 + i * 7}, ammo="ranged", req={"marksmanship": max(1, lvl)})
    recipe(f"fletch_{mid}", "carpentry", f"{name} arrows ×15", min(99, lvl + 3), 2.6, 10 + bxp * 1.3,
           {"arrow_shafts": 15, "feathers": 15, f"{mid}_arrowtips": 15}, {aid: 15})

# Tailoring: leather from hides, and a set per leather.
LEATHERS = [("rabbit", "Rabbit-fur", "rabbit_hide", 1), ("deer", "Deerskin", "deer_hide", 28), ("boar", "Boarhide", "boar_hide", 44),
            ("elk", "Elk-leather", "elk_hide", 60), ("muskox", "Muskox", "muskox_fur", 78)]
for i, (lid, name, hide, lvl) in enumerate(LEATHERS):
    item(f"{lid}_leather", f"{name} leather", "material", 4 + i * i * 6, "▥", "#b88a5c", i + 1, "Tanned and supple.")
    recipe(f"tan_{lid}", "tailoring", f"{name} leather", lvl, 2.6, 8 + i * 14, {hide: 1}, {f"{lid}_leather": 1})
    s = 1 + i * 1.15
    for key, label, slot, n, off, stats in [("hood", "hood", "head", 1, 1, {"def": round(2 + 3 * s), "acc": round(2 + 2 * s)}),
                                             ("gloves", "gloves", "hands", 1, 2, {"acc": round(3 + 4 * s), "def": round(1 + s)}),
                                             ("boots", "boots", "feet", 1, 3, {"def": round(2 + 3 * s)}),
                                             ("chaps", "chaps", "legs", 2, 5, {"def": round(3 + 4 * s), "acc": round(1 + 2 * s)}),
                                             ("vest", "vest", "body", 3, 7, {"def": round(5 + 6 * s), "acc": round(2 + 3 * s)})]:
        iid = f"{lid}_{key}"
        item(iid, f"{name} {label}", "gear", n * (10 + i * i * 10), {"head": "∩", "hands": "ω", "feet": "◡", "legs": "Π", "body": "▓"}[slot], "#c49a6c",
             i + 1, "", slot=slot, stats=stats, req={"fortitude": max(1, lvl)})
        recipe(f"sew_{iid}", "tailoring", f"{name} {label}", min(99, lvl + off), 3.0, n * (12 + i * 16), {f"{lid}_leather": n}, {iid: 1})
for cid, name, lvl, inputs, stats in [("bandana", "Bandana", 1, {"cloth": 2}, {"def": 1, "acc": 2}),
                                     ("patchwork_cloak", "Patchwork cloak", 10, {"cloth": 6}, {"def": 3, "eva": 2}),
                                     ("scout_cloak", "Scout's cloak", 35, {"cloth": 6, "deer_leather": 2}, {"def": 7, "eva": 5}),
                                     ("ranger_cloak", "Ranger's cloak", 60, {"cloth": 8, "elk_leather": 3}, {"def": 12, "eva": 9}),
                                     ("muskox_mantle", "Muskox mantle", 80, {"cloth": 10, "muskox_leather": 4}, {"def": 18, "eva": 13})]:
    slot = "head" if cid == "bandana" else "cloak"
    item(cid, name, "gear", 20 + lvl * 6, "∩" if slot == "head" else "Ω", "#d4b48c", max(1, lvl // 16), "", slot=slot, stats=stats, req={"fortitude": max(1, lvl - 5)})
    recipe(f"sew_{cid}", "tailoring", name, lvl, 3.2, 10 + lvl * 1.2, inputs, {cid: 1})

# Remedies: kit items with charges and a lasting effect.
REMEDIES = [("garlic_salve", "Garlic salve", 1, {"wild_garlic": 2}, {"accuracy": 8}, "+8% accuracy in combat"),
            ("nettle_tea", "Nettle tea", 8, {"nettle": 2}, {"xp:gather": 5}, "+5% gathering XP"),
            ("yarrow_poultice", "Yarrow poultice", 18, {"yarrow": 2, "cloth": 1}, {"heal": 20}, "+20% healing from food"),
            ("chanterelle_tonic", "Chanterelle tonic", 28, {"chanterelle": 2, "empty_vial": 1}, {"preserve:craft": 6}, "+6% chance to keep crafting materials"),
            ("elderberry_syrup", "Elderberry syrup", 38, {"elderberry": 2, "empty_vial": 1}, {"double:gather": 6}, "+6% double gathering finds"),
            ("willow_draught", "Willow draught", 50, {"willow_bark": 2, "empty_vial": 1}, {"dr": 8}, "−8% damage taken"),
            ("arnica_balm", "Arnica balm", 62, {"arnica": 2, "empty_vial": 1}, {"evasion": 10}, "+10% evasion"),
            ("orchid_elixir", "Ghost orchid elixir", 80, {"ghost_orchid": 2, "empty_vial": 1}, {"xp:all": 8}, "+8% XP in every skill")]
for i, (rid, name, lvl, inputs, effect, text) in enumerate(REMEDIES):
    item(rid, name, "remedy", 8 + lvl * 3, "ϴ", "#e0858a", 1 + i * 6 // len(REMEDIES), f"{text} for 60 actions. Equip it in your kit.",
         slot="kit", effect=effect, charges=60)
    recipe(f"brew_{rid}", "remedies", name, lvl, 3.0, 12 + lvl * 1.4, inputs, {rid: 1})
for mid, name, lvl, heal, inputs in [("field_dressing", "Field dressing", 12, 60, {"bandage_roll": 1}),
                                    ("medkit", "Medkit", 40, 180, {"bandage_roll": 2, "yarrow": 2, "empty_vial": 1}),
                                    ("trauma_kit", "Trauma kit", 72, 360, {"bandage_roll": 3, "surgical_steel": 1, "arnica": 2})]:
    item(mid, name, "food", 20 + lvl * 3, "✚", "#f08a8a", max(1, lvl // 15), f"Heals {heal} hit points. Counts as food.", heal=heal)
    recipe(f"pack_{mid}", "remedies", name, lvl, 3.4, 20 + lvl * 1.5, inputs, {mid: 1})

# Tinkering: cells (gadget ammo), gadgets (tech weapons), charms and building parts.
for i, (cid, name, lvl, inputs, power) in enumerate([("zinc_cell", "Zinc cells", 1, {"scrap_metal": 1, "wire": 1}, 3),
                                                     ("lithium_cell", "Lithium cells", 25, {"battery": 1, "copper_wire": 1}, 14),
                                                     ("fusion_cell", "Fusion cells", 60, {"battery": 1, "circuit_board": 1, "gold_contacts": 1}, 32)]):
    item(cid, name, "ammo", 1 + i * 4, "▮", "#e6c36a", 1 + i * 2, "Power for gadgets; one per shot.", slot="ammo", stats={"str": power}, ammo="tech",
         req={"gadgetry": max(1, lvl)})
    recipe(f"wire_{cid}", "tinkering", f"{name} ×10", lvl, 2.6, 8 + lvl * 1.1, inputs, {cid: 10})
GADGETS = [("spark_gun", "Spark gun", 1, {"scrap_metal": 3, "wire": 2}), ("taser", "Taser", 15, {"copper_wire": 3, "battery": 1}),
           ("flare_launcher", "Flare launcher", 30, {"tool_parts": 2, "fuel_can": 1, "scrap_metal": 4}),
           ("arc_thrower", "Arc thrower", 45, {"circuit_board": 2, "copper_wire": 4, "steel_bar": 2}),
           ("pulse_emitter", "Pulse emitter", 62, {"circuit_board": 3, "lens": 1, "titanium_bar": 2}),
           ("storm_coil", "Storm coil", 82, {"server_core": 1, "skyfall_bar": 2, "gold_contacts": 2})]
for i, (gid, name, lvl, inputs) in enumerate(GADGETS):
    s = 1 + i
    item(gid, name, "gear", 30 + i * i * 90, "ϟ", "#7fc6e6", i + 1, "", slot="weapon",
         stats={"style": "tech", "acc": round(9 + 15 * s), "str": round(5 + 12 * s), "speed": 3.0}, req={"gadgetry": max(1, lvl)})
    recipe(f"build_{gid}", "tinkering", name, lvl, 3.2, 20 + lvl * 2.2, inputs, {gid: 1})
CHARMS = [("lucky_washer", "Lucky washer", 5, {"scrap_metal": 5}, {"double:all": 2}, "+2% double items in every skill"),
          ("brass_compass", "Brass compass", 20, {"copper_wire": 2, "glass": 2}, {"xp:scouting": 10, "xp:bounty": 5}, "+10% Scouting XP, +5% Bounty XP"),
          ("windup_watch", "Wind-up watch", 35, {"pocket_watch": 1, "tool_parts": 2}, {"speed:all": 3}, "Every action 3% faster"),
          ("signal_scanner", "Signal scanner", 50, {"radio_valve": 1, "circuit_board": 1}, {"fragments": 15, "xp:signals": 5}, "+15% signal fragments"),
          ("amber_amulet", "Amber amulet", 40, {"amber": 1, "copper_wire": 2}, {"xp:all": 3}, "+3% XP in every skill"),
          ("garnet_pendant", "Garnet pendant", 65, {"garnet": 1, "gold_contacts": 1}, {"accuracy": 6, "maxhit": 4}, "+6% accuracy, +4% max hit")]
for i, (cid, name, lvl, inputs, effect, text) in enumerate(CHARMS):
    item(cid, name, "gear", 60 + lvl * 8, "☉", "#e8c56a", 2 + i * 4 // len(CHARMS), text, slot="charm", effect=effect)
    recipe(f"build_{cid}", "tinkering", name, lvl, 3.4, 25 + lvl * 2, inputs, {cid: 1})
item("radio_kit", "Radio kit", "material", 60, "♁", "#a49ad6", 3, "Parts for the radio archive.")
recipe("build_radio_kit", "tinkering", "Radio kit", 38, 3.4, 70, {"circuit_board": 1, "copper_wire": 2, "lens": 1}, {"radio_kit": 1})
item("solar_panel", "Solar panel", "material", 140, "▤", "#e6c36a", 4, "Glass, silicon and patience.")
recipe("build_solar_panel", "tinkering", "Solar panel", 55, 3.6, 120, {"glass": 4, "circuit_board": 1, "titanium_bar": 1}, {"solar_panel": 1})
item("brick", "Bricks", "material", 6, "▬", "#c26a4a", 2, "Fired clay for the hearth and the well.")
recipe("fire_bricks", "quarrying", "Fire bricks ×4", 20, 3.2, 26, {"clay": 4, "coal": 1}, {"brick": 4})

# ------------------------------------------------------------- hearthkeeping
# Burning a log gives XP and warmth: while warm, every non-combat skill
# gains more XP. Warmth stacks up to two hours.
HEARTH_BONUS = 5          # % XP while warm (plus the Hearth building)
HEARTH_MAX = 2 * 3600
for i, (tid, name, lvl, sec, xp, val) in enumerate(TREES):
    recipe(f"burn_{tid}", "hearth", f"Burn {name.lower()}", lvl, 2.2, xp * 1.3, {f"{tid}_log": 1}, {}, warmth=20 + i * 15)

# ------------------------------------------------------------------ signals
# Scanning a band gives XP and sometimes a fragment; fragments tune that
# band's three broadcasts (permanent bonuses, five ranks each).
BANDS = [("weather", "Weather band", 1, 8, [("calm_front", "Calm front", {"xp:forestry": 2}, "+2% Forestry XP"), ("dew_point", "Dew point", {"xp:foraging": 2}, "+2% Foraging XP"), ("pressure", "High pressure", {"speed:salvaging": 1}, "−1% Salvaging time")]),
         ("farm", "Co-op band", 12, 16, [("harvest_call", "Harvest call", {"xp:cooking": 2}, "+2% Cooking XP"), ("market_day", "Market day", {"scrip": 2}, "+2% scrip from sales"), ("barn_dance", "Barn dance", {"hearth_time": 4}, "+4% hearth warmth")]),
         ("maritime", "Maritime band", 24, 26, [("tide_table", "Tide table", {"xp:fishing": 2}, "+2% Fishing XP"), ("sea_room", "Sea room", {"double:fishing": 1}, "+1% double fish"), ("harbour_light", "Harbour light", {"heal": 3}, "+3% food healing")]),
         ("aviation", "Aviation band", 36, 38, [("tailwind", "Tailwind", {"speed:scouting": 2}, "−2% Scouting time"), ("clear_skies", "Clear skies", {"xp:scouting": 3}, "+3% Scouting XP"), ("beacon", "Beacon", {"companion": 4}, "+4% companion chance")]),
         ("military", "Military band", 50, 54, [("drill", "Drill", {"accuracy": 2}, "+2% accuracy"), ("bunker", "Bunker", {"dr": 1}, "−1% damage taken"), ("quartermaster", "Quartermaster", {"ammo": 3}, "+3% ammo kept")]),
         ("numbers", "Numbers station", 65, 74, [("cipher", "Cipher", {"mastery": 2}, "+2% mastery XP"), ("dead_drop", "Dead drop", {"loot": 2}, "+2% double combat loot"), ("handler", "Handler", {"tokens": 3}, "+3% bounty tokens")]),
         ("relay", "Deep relay", 80, 105, [("carrier_wave", "Carrier wave", {"xp:all": 1}, "+1% XP in every skill"), ("long_range", "Long range", {"maxhit": 2}, "+2% max hit"), ("silent_hour", "Silent hour", {"preserve:craft": 1}, "+1% crafting materials kept")])]
for bid, name, lvl, xp, mods in BANDS:
    item(f"{bid}_fragment", f"{name} fragment", "fragment", 15 + lvl, "◇", "#a49ad6", 1 + lvl // 20, "A snatch of an old broadcast. Tune it in Signals.")
    recipe(f"scan_{bid}", "signals", f"Scan the {name.lower()}", lvl, 3.5, xp, {}, {}, fragment=f"{bid}_fragment")
BROADCASTS = {mid: {"id": mid, "band": bid, "name": mname, "effect": eff, "text": text} for bid, _, _, _, mods in BANDS for mid, mname, eff, text in mods}
BROADCAST_COST = [5, 10, 15, 25, 40]   # fragments for ranks 1..5

# ------------------------------------------------------------------ scouting
# A route of up to six stops. Each stop is built once (materials + scrip),
# gives a passive bonus while built, and XP each time the route is run.
OBSTACLES = [
    # slot, id, name, level, seconds, xp, scrip, cost, effect, text
    (0, "log_balance", "Fallen log balance", 1, 4.0, 8, 4, {"birch_log": 10}, {"xp:forestry": 3}, "+3% Forestry XP"),
    (0, "rope_swing", "Rope swing", 1, 4.5, 9, 5, {"cloth": 6, "birch_log": 4}, {"xp:fishing": 3}, "+3% Fishing XP"),
    (0, "stepping_stones", "Stepping stones", 1, 3.5, 7, 3, {"clay": 10}, {"xp:quarrying": 3}, "+3% Quarrying XP"),
    (1, "hedge_tunnel", "Hedge tunnel", 10, 5.0, 14, 7, {"pine_log": 12, "nails": 10}, {"xp:foraging": 3}, "+3% Foraging XP"),
    (1, "culvert_crawl", "Culvert crawl", 10, 5.5, 15, 8, {"scrap_metal": 25}, {"xp:salvaging": 3}, "+3% Salvaging XP"),
    (1, "fence_vault", "Fence vault", 10, 4.5, 13, 6, {"pine_plank": 8}, {"xp:trapping": 3}, "+3% Trapping XP"),
    (2, "rope_bridge", "Rope bridge", 20, 6.0, 22, 12, {"oak_plank": 10, "cloth": 8}, {"speed:gather": 2}, "Gathering 2% faster"),
    (2, "scree_slope", "Scree slope", 20, 6.5, 24, 13, {"iron_bar": 5}, {"evasion": 3}, "+3% evasion"),
    (2, "tree_lookout", "Tree lookout", 20, 6.0, 23, 12, {"oak_log": 20, "nails": 20}, {"companion": 5}, "+5% companion chance"),
    (3, "rail_trestle", "Rail trestle walk", 35, 7.0, 36, 20, {"steel_bar": 6, "maple_plank": 10}, {"xp:craft": 3}, "+3% crafting XP"),
    (3, "flooded_cellar", "Flooded cellar", 35, 7.5, 38, 22, {"rubber": 20, "glass": 10}, {"preserve:craft": 3}, "+3% crafting materials kept"),
    (3, "signal_mast", "Signal mast climb", 35, 7.0, 37, 21, {"copper_wire": 20, "steel_bar": 4}, {"xp:signals": 5}, "+5% Signals XP"),
    (4, "cliff_traverse", "Cliff traverse", 50, 8.0, 54, 32, {"alloy_bar": 6, "deer_leather": 6}, {"accuracy": 4}, "+4% accuracy"),
    (4, "rooftop_run", "Rooftop run", 50, 8.0, 52, 30, {"cedar_plank": 12, "tool_parts": 10}, {"double:gather": 3}, "+3% double gathering finds"),
    (4, "ice_crossing", "Ice crossing", 50, 8.5, 56, 33, {"boar_leather": 8, "nails": 40}, {"heal": 6}, "+6% food healing"),
    (5, "summit_ridge", "Summit ridge", 65, 9.0, 78, 48, {"titanium_bar": 6, "elk_leather": 6}, {"xp:all": 2}, "+2% XP in every skill"),
    (5, "relay_tower", "Relay tower", 65, 9.5, 80, 50, {"circuit_board": 12, "titanium_bar": 4}, {"mastery": 4}, "+4% mastery XP"),
    (5, "wolf_pass", "Wolf pass", 65, 9.0, 76, 46, {"yew_plank": 14, "muskox_leather": 4}, {"maxhit": 3}, "+3% max hit"),
]
OBSTACLE_SLOTS = [1, 10, 20, 35, 50, 65]   # Scouting level to build each slot

# ------------------------------------------------------------------ combat
# Enemies: level, hit points, style, attack (accuracy and max hit),
# defence (evasion), attack interval, drops, scrip.
ENEMIES = {}


def enemy(eid, name, level, hp, style, acc, maxhit, eva, interval, drops=(), scrip=(1, 5), art="beast", desc="", boss=False):
    ENEMIES[eid] = {"id": eid, "name": name, "level": level, "hp": hp, "style": style, "acc": acc, "maxhit": maxhit, "eva": eva,
                    "interval": interval, "drops": [list(d) for d in drops], "scrip": list(scrip), "art": art, "desc": desc, "boss": boss}


# Ratings follow the player formula: (level + 9) * (bonus + 64).
def _r(level, bonus):
    return (level + 9) * (bonus + 64)


enemy("tunnel_rat", "Tunnel rat", 2, 30, "melee", _r(2, 0), 8, _r(2, 0), 2.8, [("raw_rabbit", .1, 1, 1), ("wire", .3, 1, 2)], (0, 3), "rat", "Bold, hungry and quick.")
enemy("stray_dog", "Stray dog", 5, 50, "melee", _r(5, 6), 12, _r(4, 6), 2.6, [("rabbit_hide", .25, 1, 1)], (1, 4), "dog", "It used to belong to someone.")
enemy("wild_boar", "Wild boar", 9, 90, "melee", _r(9, 10), 18, _r(8, 14), 3.0, [("raw_pork", .5, 1, 1), ("boar_hide", .2, 1, 1)], (2, 6), "boar", "Tusks first, questions never.")
enemy("scavenger", "Scavenger", 12, 110, "ranged", _r(12, 16), 20, _r(10, 12), 2.8, [("scrap_metal", .5, 2, 5), ("bronze_arrows", .3, 3, 10), ("cloth", .3, 1, 3)], (4, 12), "raider", "Wants your boots.")
enemy("grey_wolf", "Grey wolf", 18, 160, "melee", _r(18, 22), 30, _r(17, 22), 2.6, [("deer_hide", .3, 1, 1)], (3, 9), "wolf", "Never alone for long.")
enemy("lynx", "Lynx", 22, 180, "melee", _r(22, 28), 34, _r(24, 30), 2.2, [("deer_hide", .2, 1, 2)], (4, 10), "cat", "You only see it when it wants you to.")
enemy("ridge_bandit", "Ridge bandit", 28, 240, "ranged", _r(28, 34), 42, _r(25, 30), 2.8, [("iron_arrows", .35, 5, 15), ("tool_parts", .3, 1, 2), ("old_coin", .02, 1, 1)], (10, 25), "raider", "Collects tolls on a road nobody owns.")
enemy("black_bear", "Black bear", 34, 380, "melee", _r(34, 30), 58, _r(30, 26), 3.4, [("boar_hide", .4, 1, 2), ("elderberry", .4, 2, 5)], (6, 14), "bear", "Mostly wants the berries.")
enemy("raider_scout", "Raider scout", 36, 320, "ranged", _r(36, 42), 55, _r(36, 40), 2.6, [("steel_arrows", .35, 5, 15), ("battery", .2, 1, 2)], (15, 35), "raider", "Watches the river road.")
enemy("bog_pike", "Bog pike", 40, 360, "melee", _r(40, 40), 62, _r(36, 34), 3.0, [("raw_pike", .6, 1, 3), ("message_bottle", .01, 1, 1)], (5, 15), "fish", "Too big for the net. Far too big.")
enemy("raider_brute", "Raider brute", 42, 460, "melee", _r(42, 46), 70, _r(38, 44), 3.2, [("steel_bar", .3, 1, 2), ("cloth", .4, 2, 4)], (18, 40), "raider", "Carries a road sign as a club.")
enemy("rust_drone", "Rust drone", 46, 400, "tech", _r(46, 52), 66, _r(46, 50), 2.6, [("circuit_board", .3, 1, 2), ("copper_wire", .5, 2, 5)], (12, 30), "drone", "Still on patrol. Nobody told it.")
enemy("outrider", "Highway outrider", 52, 560, "ranged", _r(52, 60), 82, _r(52, 56), 2.6, [("alloy_bar", .25, 1, 2), ("fuel_can", .3, 1, 1)], (25, 55), "raider", "Rides the old highway on a stolen bike.")
enemy("armoured_raider", "Armoured raider", 58, 700, "melee", _r(58, 64), 95, _r(60, 70), 3.2, [("alloy_bar", .35, 1, 3), ("engine_parts", .2, 1, 2)], (30, 60), "raider", "Wears a car door.")
enemy("sentry_drone", "Sentry drone", 62, 640, "tech", _r(62, 72), 100, _r(62, 68), 2.6, [("circuit_board", .4, 1, 3), ("lens", .2, 1, 1)], (20, 50), "drone", "Sweeps the ruins with a red eye.")
enemy("hazmat_raider", "Hazmat raider", 68, 820, "tech", _r(68, 78), 115, _r(68, 76), 2.8, [("surgical_steel", .25, 1, 2), ("battery", .4, 1, 3)], (35, 75), "raider", "Their suit hisses as they breathe.")
enemy("alpha_wolf", "Alpha wolf", 72, 900, "melee", _r(72, 84), 128, _r(72, 86), 2.4, [("elk_hide", .35, 1, 2)], (20, 45), "wolf", "The pack follows it everywhere.")
enemy("security_mech", "Security mech", 76, 1100, "tech", _r(76, 88), 140, _r(76, 92), 3.2, [("titanium_bar", .3, 1, 2), ("gold_contacts", .2, 1, 2)], (45, 90), "mech", "Old corporate property. Very territorial.")
enemy("night_stalker", "Night stalker", 78, 980, "ranged", _r(78, 92), 145, _r(80, 96), 2.6, [("yew_bow", .02, 1, 1), ("titanium_arrows", .3, 5, 15)], (40, 85), "raider", "Only hunts after dark.")
enemy("relay_sentinel", "Relay sentinel", 84, 1400, "tech", _r(84, 98), 165, _r(84, 100), 3.0, [("server_core", .03, 1, 1), ("gold_contacts", .35, 1, 3)], (60, 120), "mech", "Guards a signal nobody sends any more.")
enemy("frost_bear", "Frost bear", 88, 1700, "melee", _r(88, 96), 185, _r(86, 94), 3.4, [("muskox_fur", .4, 1, 2), ("muskox_meat", .5, 1, 2)], (30, 70), "bear", "White as the snow it sleeps in.")
enemy("signal_hunter", "Signal hunter", 92, 1500, "ranged", _r(92, 104), 190, _r(92, 106), 2.6, [("skyfall_arrows", .25, 5, 15), ("star_chart", .01, 1, 1)], (70, 140), "raider", "Follows radio chatter to its source.")
enemy("warden_drone", "Warden drone", 96, 1900, "tech", _r(96, 110), 210, _r(96, 112), 2.8, [("skyfall_bar", .2, 1, 2), ("server_core", .04, 1, 1)], (80, 160), "drone", "The north's last line of defence.")
# Expedition bosses.
enemy("storm_sentinel", "Storm-wired Sentinel", 20, 600, "tech", _r(22, 30), 38, _r(20, 26), 3.0, [], (40, 60), "mech", "The weather station's old guard, crackling with stored lightning.", boss=True)
enemy("thorn_keeper", "The Thorn Keeper", 36, 1100, "melee", _r(38, 44), 62, _r(36, 40), 3.0, [], (80, 120), "keeper", "A gardening machine, overgrown and stubborn.", boss=True)
enemy("raider_queen", "Raider Queen Maren", 56, 2000, "ranged", _r(58, 70), 98, _r(56, 66), 2.6, [], (200, 300), "raider", "Rules the drowned depot from a rusted ferry.", boss=True)
enemy("warden_zero", "WARDEN-0", 95, 4200, "tech", _r(98, 118), 230, _r(96, 116), 2.8, [], (600, 900), "mech", "It has been listening to the north for forty years.", boss=True)

AREAS = [
    {"id": "outskirts", "name": "The Outskirts", "level": 1, "desc": "Overgrown gardens and empty roads just past the fence.", "enemies": ["tunnel_rat", "stray_dog", "wild_boar", "scavenger"]},
    {"id": "pine_ridge", "name": "Pine Ridge", "level": 15, "desc": "Dark woods above the valley, full of things that hunt.", "enemies": ["grey_wolf", "lynx", "ridge_bandit", "black_bear"]},
    {"id": "flooded_town", "name": "The Flooded Town", "level": 30, "desc": "Rooftops above brown water. Raiders keep boats here.", "enemies": ["raider_scout", "bog_pike", "raider_brute", "rust_drone"]},
    {"id": "old_highway", "name": "The Old Highway", "level": 45, "desc": "Six lanes of rust and the gangs who claim them.", "enemies": ["outrider", "armoured_raider", "sentry_drone"]},
    {"id": "quarantine", "name": "The Quarantine Zone", "level": 60, "desc": "Fences, warning signs and something still running the lights.", "enemies": ["hazmat_raider", "alpha_wolf", "security_mech", "night_stalker"]},
    {"id": "north", "name": "The Northern Relay", "level": 75, "requires": "night_lens", "desc": "A radio station in the snow. Wear a Night lens to find the way.", "enemies": ["relay_sentinel", "frost_bear", "signal_hunter", "warden_drone"]},
]

# Unique Expedition rewards.
item("stormglass_visor", "Stormglass visor", "gear", 400, "∩", "#88c0f0", 4, "", slot="head", stats={"def": 14, "acc": 10}, req={"fortitude": 15})
item("thorn_shears", "Thorn Keeper's shears", "gear", 900, "/", "#9fd07a", 4, "", slot="weapon", stats={"style": "melee", "acc": 70, "str": 62, "speed": 2.2}, req={"melee": 30})
item("maren_longbow", "Maren's longbow", "gear", 2400, ")", "#e8a85a", 5, "", slot="weapon", stats={"style": "ranged", "acc": 112, "str": 88, "speed": 2.6}, req={"marksmanship": 50})
item("warden_core", "Warden core", "gear", 9000, "☉", "#ef6f5f", 6, "+10% accuracy, +8% max hit, −5% damage taken", slot="charm",
     effect={"accuracy": 10, "maxhit": 8, "dr": 5})
EXPEDITIONS = [
    {"id": "weather", "name": "The Silent Weather Station", "level": 15, "cost": {"food": 6, "water": 6, "medicine": 1, "morale": 2},
     "intro": "A dead weather station blinks once on the ridge. Its last forecast never reached the valley.",
     "enemies": ["stray_dog", "scavenger", "wild_boar", "scavenger", "storm_sentinel"], "reward": {"stormglass_visor": 1, "weather_fragment": 10}, "scrip": 150, "story": "weather"},
    {"id": "glasshouse", "name": "The Glasshouse Signal", "level": 30, "cost": {"food": 8, "water": 8, "medicine": 2, "morale": 3},
     "intro": "A warm light appears beyond the old rail line. Beneath broken glass, something is still growing.",
     "enemies": ["grey_wolf", "lynx", "ridge_bandit", "black_bear", "thorn_keeper"], "reward": {"thorn_shears": 1, "ghost_orchid": 5}, "scrip": 400, "story": "glasshouse"},
    {"id": "depot", "name": "The Drowned Depot", "level": 50, "cost": {"food": 14, "water": 12, "medicine": 4, "morale": 5},
     "intro": "A ferry sits on the depot roof where the flood left it. Lanterns move on deck at night.",
     "enemies": ["raider_scout", "raider_brute", "rust_drone", "raider_brute", "raider_queen"], "reward": {"maren_longbow": 1, "fuel_can": 10}, "scrip": 1200},
    {"id": "relay", "name": "The Northern Relay", "level": 80, "cost": {"food": 24, "water": 20, "medicine": 8, "morale": 10, "energy": 10},
     "intro": "Deep in the snow a tower still transmits, every hour, on the hour. Something answers it.",
     "enemies": ["security_mech", "relay_sentinel", "frost_bear", "signal_hunter", "warden_zero"], "reward": {"warden_core": 1, "relay_fragment": 25}, "scrip": 5000, "requires": "night_lens"},
]
# The two original stories end each first clear with a choice.
STORY_CHOICES = {
    "weather": {"text": "At the foot of the mast you find a sealed forecast map. It marks a safe path through the next storm.",
                "choices": [{"label": "Mark the path for everyone", "reward": {"morale": 8, "water": 5}, "result": "Lanterns answer from the valley. The route belongs to everyone now."},
                            {"label": "Keep the map in the archive", "reward": {"knowledge": 7, "scrap": 3}, "result": "The map finds a place beside the old field books."}]},
    "glasshouse": {"text": "A seed tin and a gardener's notebook sit beneath the last unbroken pane.",
                   "choices": [{"label": "Share the seed tin", "reward": {"food": 8, "morale": 8}, "result": "New plots appear around the outpost by morning."},
                               {"label": "Study the notebook", "reward": {"knowledge": 9, "medicine": 3}, "result": "The notes reveal useful plants and a careful hand at work."}]},
}

# Bounties: a board of contracts; tokens buy special gear.
BOUNTY_TIERS = [{"id": "easy", "name": "Local", "max": 40, "count": (10, 25), "tokens": 1}, {"id": "normal", "name": "Regional", "max": 70, "count": (15, 35), "tokens": 2},
                {"id": "hard", "name": "Frontier", "max": 99, "count": (20, 45), "tokens": 3}]
item("night_lens", "Night lens", "gear", 0, "◎", "#7fe0c0", 5, "Light amplification for the northern dark. Needed for the Northern Relay.",
     slot="charm", effect={"accuracy": 3})
item("hunter_hood", "Hunter's hood", "gear", 0, "∩", "#d6b85a", 4, "", slot="head", stats={"def": 18, "acc": 16}, req={"bounty": 20})
item("tracker_boots", "Tracker's boots", "gear", 0, "◡", "#d6b85a", 4, "", slot="feet", stats={"def": 14, "eva": 10}, req={"bounty": 35})
item("bounty_charm", "Bounty charm", "gear", 0, "☉", "#d6b85a", 4, "+15% bounty tokens, +5% Bounty XP", slot="charm", effect={"tokens": 15, "xp:bounty": 5})
BOUNTY_SHOP = [{"item": "hunter_hood", "tokens": 60, "level": 20}, {"item": "tracker_boots", "tokens": 120, "level": 35},
               {"item": "bounty_charm", "tokens": 200, "level": 45}, {"item": "night_lens", "tokens": 400, "level": 60}]

# Starter gear and the Trader.
item("pipe_club", "Pipe club", "gear", 12, "/", "#9a9ea4", 1, "", slot="weapon", stats={"style": "melee", "acc": 4, "str": 4, "speed": 2.6})
item("slingshot", "Slingshot", "gear", 12, ")", "#c8a46e", 1, "", slot="weapon", stats={"style": "ranged", "acc": 6, "str": 2, "speed": 2.4})
TRADER = [
    {"id": "buy_pipe_club", "kind": "item", "item": "pipe_club", "qty": 1, "price": 25, "desc": "A sturdy length of pipe. Better than fists."},
    {"id": "buy_slingshot", "kind": "item", "item": "slingshot", "qty": 1, "price": 30, "desc": "Fires arrows, badly."},
    {"id": "buy_spark_gun", "kind": "item", "item": "spark_gun", "qty": 1, "price": 40, "desc": "A homemade stun gun."},
    {"id": "buy_arrows", "kind": "item", "item": "bronze_arrows", "qty": 50, "price": 60, "desc": "A quiver's worth."},
    {"id": "buy_cells", "kind": "item", "item": "zinc_cell", "qty": 50, "price": 60, "desc": "Fresh zinc cells."},
    {"id": "buy_feathers", "kind": "item", "item": "feathers", "qty": 100, "price": 70, "desc": "Sorted and clean."},
    {"id": "buy_vials", "kind": "item", "item": "empty_vial", "qty": 10, "price": 45, "desc": "Corked glass vials."},
    {"id": "buy_cloth", "kind": "item", "item": "cloth", "qty": 20, "price": 50, "desc": "Bolts of clean cloth."},
    {"id": "buy_bread", "kind": "item", "item": "cooked_perch", "qty": 10, "price": 45, "desc": "The trader's smoked perch."},
]
TOOLS = [("forestry", "Hatchet", "speed:forestry"), ("fishing", "Fishing rod", "speed:fishing"), ("quarrying", "Pickaxe", "speed:quarrying"),
         ("salvaging", "Pry bar", "speed:salvaging"), ("trapping", "Snare kit", "speed:trapping"), ("foraging", "Forager's knife", "speed:foraging")]
TOOL_TIERS = [("Rusted", 1, 60, 5), ("Iron", 15, 900, 10), ("Steel", 30, 5000, 15), ("Titanium", 50, 25000, 20), ("Skyfall", 70, 120000, 25)]
for skill, tool, key in TOOLS:
    for t, (prefix, lvl, price, pct) in enumerate(TOOL_TIERS):
        TRADER.append({"id": f"tool_{skill}_{t + 1}", "kind": "upgrade", "group": f"tool_{skill}", "tier": t + 1, "name": f"{prefix} {tool.lower()}",
                       "skill": skill, "level": lvl, "price": price, "effect": {key: pct}, "desc": f"{SKILLS[skill]['name']} {pct}% faster."})
for t, (pct, price) in enumerate([(30, 800), (45, 8000), (60, 60000)]):
    TRADER.append({"id": f"autoeat_{t + 1}", "kind": "upgrade", "group": "autoeat", "tier": t + 1, "name": f"Field rations {['I', 'II', 'III'][t]}",
                   "level": 1, "price": price, "effect": {"autoeat": pct}, "desc": f"Eat automatically below {pct}% health."})
STOCKPILE_START, STOCKPILE_STEP = 48, 6


def stockpile_price(bought):
    return int(150 * 1.32 ** bought)


# ------------------------------------------------------------- companions
COMPANIONS = [
    ("chip", "Chip", "beaver", "forestry", {"xp:forestry": 3}), ("glint", "Glint", "magpie", "salvaging", {"double:salvaging": 3}),
    ("ripple", "Ripple", "otter", "fishing", {"xp:fishing": 3}), ("rust", "Rust", "fox", "foraging", {"double:foraging": 3}),
    ("wick", "Wick", "ferret", "trapping", {"xp:trapping": 3}), ("boulder", "Boulder", "mule", "quarrying", {"speed:quarrying": 3}),
    ("saffron", "Saffron", "cat", "cooking", {"preserve:cooking": 4}), ("anvil", "Anvil", "hedgehog", "metalwork", {"xp:metalwork": 3}),
    ("knock", "Knock", "woodpecker", "carpentry", {"xp:carpentry": 3}), ("velvet", "Velvet", "moth", "tailoring", {"preserve:tailoring": 4}),
    ("sage", "Sage", "tortoise", "remedies", {"xp:remedies": 3}), ("cog", "Cog", "crow", "tinkering", {"preserve:tinkering": 4}),
    ("cinder", "Cinder", "salamander", "hearth", {"hearth_time": 10}), ("echo", "Echo", "owl", "signals", {"fragments": 8}),
    ("cliff", "Cliff", "goat", "scouting", {"xp:scouting": 4}), ("scout", "Scout", "dog", "combat", {"accuracy": 3, "loot": 3}),
    ("talon", "Talon", "hawk", "bounty", {"tokens": 5}),
]
COMPANIONS = {cid: {"id": cid, "name": name, "animal": animal, "skill": skill, "effect": eff} for cid, name, animal, skill, eff in COMPANIONS}
COMPANION_CHANCE = 1 / 9000      # per action, scaled by the action's seconds / 4

# ------------------------------------------------------------- buildings
SUPPLIES = ("food", "water", "wood", "scrap", "energy", "medicine", "knowledge", "morale")
BUILDINGS = {
    "garden": {"name": "Garden beds", "supply": "food", "cost": {"wood": 8, "water": 5}, "parts": "pine_plank", "effect": {"xp:cooking": 2, "xp:foraging": 2}},
    "well": {"name": "Rain well", "supply": "water", "cost": {"wood": 7, "scrap": 4}, "parts": "brick", "effect": {"xp:fishing": 2, "heal": 1}},
    "lumber": {"name": "Timber yard", "supply": "wood", "cost": {"food": 6, "scrap": 4}, "parts": "iron_bar", "effect": {"xp:forestry": 2, "xp:carpentry": 2}},
    "salvage": {"name": "Salvage bench", "supply": "scrap", "cost": {"food": 7, "water": 5}, "parts": "tool_parts", "effect": {"xp:salvaging": 2, "xp:tinkering": 2}},
    "solar": {"name": "Solar array", "supply": "energy", "cost": {"scrap": 9, "wood": 5}, "parts": "solar_panel", "effect": {"xp:signals": 2, "preserve:tinkering": 1}},
    "clinic": {"name": "Field clinic", "supply": "medicine", "cost": {"scrap": 7, "knowledge": 5}, "parts": "bandage_roll", "effect": {"xp:remedies": 2, "heal": 2}},
    "archive": {"name": "Radio archive", "supply": "knowledge", "cost": {"energy": 7, "wood": 5}, "parts": "radio_kit", "effect": {"mastery": 1, "xp:signals": 1}},
    "hearth": {"name": "Common hearth", "supply": "morale", "cost": {"food": 8, "wood": 6}, "parts": "brick", "effect": {"xp:hearth": 2, "hearth_time": 5}},
}
BUILDING_MAX = 10
SUPPLY_CAP = 250


def supply_cap(level):
    return SUPPLY_CAP + 50 * max(0, level - 5)


def building_cost(bid, level):
    """Cost to raise a building from `level` to `level + 1`."""
    b = BUILDINGS[bid]
    cost = {k: v * (level + 1) for k, v in b["cost"].items()}
    items = {b["parts"]: 4 * (level - 4)} if level >= 5 else {}
    return cost, items


def supply_rate(level):
    return level * (2 + .4 * level)        # per hour, as the original Outpost


# ------------------------------------------------------------- mastery
MASTERY_POOL_SHARE = .25
MASTERY_CHECKPOINTS = [(10, {"mastery_bonus": 5}, "+5% mastery XP"), (25, {"speed_bonus": 3}, "Actions 3% faster"),
                       (50, {"double_bonus": 5}, "+5% double items"), (95, {"xp_bonus": 10}, "+10% skill XP")]


_POOL_CAPS = {}


def mastery_pool_cap(skill):
    if skill not in _POOL_CAPS:
        _POOL_CAPS[skill] = 40000 * max(1, sum(1 for r in RECIPES.values() if r["skill"] == skill))
    return _POOL_CAPS[skill]


ACTIVE_SKILLS = [s for s in SKILLS if SKILLS[s]["kind"] in ("gather", "craft") or s in ("hearth", "signals")]


# ------------------------------------------------------------- pacing
# One Melvor-like pace for every skill: the best XP per second at a level
# rises from about 3 at level 1 to about 15 at 99, so level 99 takes
# roughly 280 hours of play before bonuses (Melvor-like). A recipe faster than that takes
# longer (up to 20 s); beyond 20 s it gives less XP instead.
def _pace(level):
    return 3.2 + .115 * level


MAX_SECONDS = 20.0
for _r in RECIPES.values():
    _target = _pace(_r["level"])
    if _r["xp"] / _r["seconds"] > _target:
        _t = _r["xp"] / _target
        if _t <= MAX_SECONDS:
            _r["seconds"] = round(_t, 1)
        else:
            _r["seconds"] = MAX_SECONDS
            _r["xp"] = round(_target * MAX_SECONDS, 1)


def export():
    """Everything the UI needs to draw the game."""
    return {"skills": SKILLS, "items": ITEMS, "recipes": RECIPES, "enemies": ENEMIES, "areas": AREAS, "expeditions": EXPEDITIONS,
            "trader": TRADER, "bountyTiers": BOUNTY_TIERS, "bountyShop": BOUNTY_SHOP, "companions": COMPANIONS, "buildings": BUILDINGS,
            "supplies": SUPPLIES, "bands": [{"id": b, "name": n, "level": l, "broadcasts": [m[0] for m in mods]} for b, n, l, x, mods in BANDS],
            "broadcasts": BROADCASTS, "broadcastCost": BROADCAST_COST, "obstacles": [
                {"slot": s, "id": o, "name": n, "level": l, "seconds": sec, "xp": xp, "scrip": sc, "cost": cost, "effect": eff, "text": text}
                for s, o, n, l, sec, xp, sc, cost, eff, text in OBSTACLES],
            "obstacleSlots": OBSTACLE_SLOTS, "xpTable": XP_TABLE[:101], "rarityColors": RARITY_COLORS, "checkpoints": MASTERY_CHECKPOINTS,
            "storyChoices": STORY_CHOICES, "hearthBonus": HEARTH_BONUS, "hearthMax": HEARTH_MAX, "stockpileStep": STOCKPILE_STEP,
            "beats": BEATS, "buildingMax": BUILDING_MAX}
