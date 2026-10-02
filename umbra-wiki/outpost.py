"""Umbra Outpost: an offline idle game. One action at a time (a skill, a
fight, the scouting route); buildings, companions and broadcasts add up to
lasting bonuses; everything keeps going while Umbra is closed (up to a day).
Content lives in outpost_data.py. Fictional, local and saved as JSON.
"""
import copy
import json
import math
import os
import random
import threading
import time

import outpost_data as D

LOCK = threading.Lock()
VERSION = 2
OFFLINE_CAP = 24 * 3600
# Away from the Outpost (closed, or nobody watching): the first two minutes
# count fully, the rest at a tenth of the pace; still capped at a real day.
AWAY_FULL = 120
AWAY_PACE = .1
LOG_LINES = 40
BASE_AUTOEAT = 20            # % of max health; Field rations raise it
REGEN = .01                  # of max health per 2 s outside combat
RESPAWN = 2.5                # seconds between enemies

# The original Outpost's names, still used by achievements and backups.
RESOURCES = D.SUPPLIES
STATIONS = {bid: (b["supply"], b["cost"]) for bid, b in D.BUILDINGS.items()}
ROUTES = {e["story"]: e for e in D.EXPEDITIONS if e.get("story")}


# ------------------------------------------------------------------ state
def fresh(now):
    return {"version": VERSION, "created": now, "updated": now, "scrip": 25,
            "xp": {s: (D.XP_TABLE[10] if s == "vitality" else 0) for s in D.SKILLS},
            "mastery": {}, "pool": {}, "bank": {"cooked_perch": 5, "pipe_club": 1}, "slotsBought": 0,
            "equipment": {}, "food": None, "kit": None, "hp": 100, "stance": "aggressive",
            "action": None, "buildings": {b: (1 if b in ("garden", "well", "lumber") else 0) for b in D.BUILDINGS},
            "supplies": {"food": 15, "water": 15, "wood": 12, "scrap": 10, "energy": 8, "medicine": 2, "knowledge": 4, "morale": 10},
            "upgrades": {}, "broadcasts": {}, "obstacles": [None] * 6, "warmUntil": 0, "companions": [], "completed": [],
            "storyDone": [], "pendingStory": None, "bounty": None, "tokens": 0, "stats": {}, "away": None,
            "log": ["The lamps come on. Umbra Outpost has a place to begin."]}


def _migrate(state, now):
    """Bring a first-version save (camps, resources, two stories) forward."""
    if state.get("version") == VERSION:
        return state
    new = fresh(now)
    for k in D.SUPPLIES:
        v = state.get("resources", {}).get(k)
        if type(v) in (int, float):
            new["supplies"][k] = max(0, min(D.SUPPLY_CAP, v))
    for k in D.BUILDINGS:
        v = state.get("stations", {}).get(k)
        if type(v) is int:
            new["buildings"][k] = max(0, min(5, v))
    new["completed"] = [r for r in state.get("completed", []) if r in ROUTES]
    new["storyDone"] = list(new["completed"])
    active = state.get("active")
    if isinstance(active, dict) and active.get("route") in ROUTES:
        for k, v in ROUTES[active["route"]]["cost"].items():   # the trip becomes an Expedition: refund it
            new["supplies"][k] = new["supplies"].get(k, 0) + v
    old_log = [line for line in state.get("log", []) if isinstance(line, str)][:10]
    new["log"] = ["The Outpost has grown: skills, a stockpile, the Trader and Expeditions are open."] + old_log
    new["updated"] = min(now, float(state.get("updated", now)))
    return new


def _normal(state, now):
    """Fill anything missing (new content) so older saves keep working."""
    base = fresh(now)
    for k, v in base.items():
        if k not in state:
            state[k] = copy.deepcopy(v)
    for s in D.SKILLS:
        state["xp"].setdefault(s, base["xp"][s])
    for b in D.BUILDINGS:
        state["buildings"].setdefault(b, 0)
    for k in D.SUPPLIES:
        state["supplies"].setdefault(k, 0)
    if len(state["obstacles"]) < 6:
        state["obstacles"] += [None] * (6 - len(state["obstacles"]))
    state["bank"] = {k: v for k, v in state["bank"].items() if k in D.ITEMS and v > 0}
    return state


def _save(path, state):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, separators=(",", ":"))
    os.replace(tmp, path)


def _load(path, now):
    try:
        with open(path) as f:
            state = json.load(f)
        if not isinstance(state, dict) or state.get("version") not in (1, VERSION):
            raise ValueError("invalid save")
    except (OSError, ValueError, TypeError):
        return fresh(now)
    return _normal(_migrate(state, now), now)


# ---------------------------------------------------------------- helpers
def level(state, skill):
    return D.level_for(state["xp"].get(skill, 0))


def mastery_level(state, rid):
    r = D.RECIPES.get(rid)
    return D.level_for(state["mastery"].get(r["skill"], {}).get(rid, 0)) if r else 1


def max_hp(state):
    return level(state, "vitality") * 10


def combat_level(state):
    best = max(level(state, s) for s in ("melee", "marksmanship", "gadgetry"))
    return int(.25 * (level(state, "fortitude") + level(state, "vitality")) + .4875 * best)


def slots(state):
    return D.STOCKPILE_START + D.STOCKPILE_STEP * state.get("slotsBought", 0)


def _log(state, line):
    state["log"] = ([line] + state["log"])[:LOG_LINES]


def _stat(state, key, n=1):
    state["stats"][key] = state["stats"].get(key, 0) + n


def modifiers(state, now):
    """Every lasting bonus, as {key: percent}."""
    m = {}

    def add(effect, k=1):
        for key, v in effect.items():
            m[key] = m.get(key, 0) + v * k
    for b, lvl in state["buildings"].items():
        if lvl and b in D.BUILDINGS:
            add(D.BUILDINGS[b]["effect"], lvl)
    for c in state["companions"]:
        if c in D.COMPANIONS:
            add(D.COMPANIONS[c]["effect"])
    for bc, rank in state["broadcasts"].items():
        if bc in D.BROADCASTS:
            add(D.BROADCASTS[bc]["effect"], rank)
    for o in state["obstacles"]:
        if o in _OBSTACLES:
            add(_OBSTACLES[o]["effect"])
    for group, tier in state["upgrades"].items():
        offer = _UPGRADES.get((group, tier))
        if offer:
            add(offer["effect"])
    charm = state["equipment"].get("charm")
    if charm and D.ITEMS.get(charm, {}).get("effect"):
        add(D.ITEMS[charm]["effect"])
    kit = state.get("kit")
    if kit and kit.get("charges", 0) > 0 and kit.get("item") in D.ITEMS:
        add(D.ITEMS[kit["item"]]["effect"])
    if state.get("warmUntil", 0) > now:
        m["warm"] = D.HEARTH_BONUS + state["buildings"].get("hearth", 0)
    return m


_OBSTACLES = {o[1]: {"slot": o[0], "id": o[1], "name": o[2], "level": o[3], "seconds": o[4], "xp": o[5], "scrip": o[6],
                     "cost": o[7], "effect": o[8], "text": o[9]} for o in D.OBSTACLES}
_UPGRADES = {(o["group"], o["tier"]): o for o in D.TRADER if o["kind"] == "upgrade"}
_OFFERS = {o["id"]: o for o in D.TRADER}


def _pct(m, skill, kind):
    """A skill's total bonus of one kind ('xp', 'speed', 'double', 'preserve')."""
    group = D.SKILLS.get(skill, {}).get("kind")
    total = m.get(f"{kind}:all", 0) + m.get(f"{kind}:{skill}", 0)
    if group == "gather":
        total += m.get(f"{kind}:gather", 0)
    if group == "craft":
        total += m.get(f"{kind}:craft", 0)
    return total


def _checkpoints(state, skill):
    pool, cap = state["pool"].get(skill, 0), D.mastery_pool_cap(skill)
    out = {}
    for pct, eff, _ in D.MASTERY_CHECKPOINTS:
        if pool >= cap * pct / 100:
            for k, v in eff.items():
                out[k] = out.get(k, 0) + v
    return out


def interval(state, rid, m):
    r = D.RECIPES[rid]
    cp = _checkpoints(state, r["skill"])
    speed = _pct(m, r["skill"], "speed") + mastery_level(state, rid) * .08 + cp.get("speed_bonus", 0)
    return max(r["seconds"] * .4, r["seconds"] * (1 - speed / 100))


def _bank_add(state, iid, n, stats=True):
    """Add to the stockpile; False when a new kind won't fit."""
    if n <= 0:
        return True
    if iid not in state["bank"] and len(state["bank"]) >= slots(state):
        return False
    state["bank"][iid] = state["bank"].get(iid, 0) + n
    if stats:
        _stat(state, "found", n)
    return True


def _bank_take(state, iid, n):
    have = state["bank"].get(iid, 0)
    if have < n:
        return False
    if have == n:
        del state["bank"][iid]
    else:
        state["bank"][iid] = have - n
    return True


def _grant_xp(state, skill, amount, m, events, now):
    if amount <= 0:
        return
    bonus = _pct(m, skill, "xp")
    if D.SKILLS[skill]["kind"] != "combat" and state.get("warmUntil", 0) > now:
        bonus += m.get("warm", 0)
    before = level(state, skill)
    state["xp"][skill] = min(D.XP_TABLE[120], state["xp"][skill] + amount * (1 + bonus / 100))
    after = level(state, skill)
    if after > before:
        events.append({"type": "level", "skill": skill, "level": after})
        if skill == "vitality":
            state["hp"] = min(max_hp(state), state["hp"] + (after - before) * 10)


def _grant_mastery(state, rid, base, m, events):
    r = D.RECIPES[rid]
    skill = r["skill"]
    cp = _checkpoints(state, skill)
    gain = base * (1 + (m.get("mastery", 0) + cp.get("mastery_bonus", 0)) / 100)
    book = state["mastery"].setdefault(skill, {})
    before = D.level_for(book.get(rid, 0))
    book[rid] = min(D.XP_TABLE[99], book.get(rid, 0) + gain)
    state["pool"][skill] = min(D.mastery_pool_cap(skill), state["pool"].get(skill, 0) + gain * D.MASTERY_POOL_SHARE)
    after = D.level_for(book[rid])
    if after > before and after % 10 == 0:
        events.append({"type": "mastery", "recipe": rid, "level": after})


def _companion(state, key, seconds, m, events, rng):
    pet = next((c for c in D.COMPANIONS.values() if c["skill"] == key), None)
    if not pet or pet["id"] in state["companions"]:
        return
    if rng.random() < D.COMPANION_CHANCE * max(.5, seconds / 4) * (1 + m.get("companion", 0) / 100):
        state["companions"].append(pet["id"])
        events.append({"type": "companion", "id": pet["id"]})
        _log(state, f"A {pet['animal']} called {pet['name']} has joined the Outpost.")


_COMBAT_KEYS = {"accuracy", "maxhit", "evasion", "dr", "heal"}


def _kit_fits(effect, context):
    """Whether a remedy's effect matters for this kind of action."""
    for key in effect:
        kind, _, target = key.partition(":")
        if key in _COMBAT_KEYS:
            if context == "combat":
                return True
        elif target in ("all", ""):
            return True
        elif target == context or (target in D.SKILLS and D.SKILLS[target]["kind"] == context):
            return True
    return False


def _use_kit(state, context):
    kit = state.get("kit")
    if kit and kit.get("charges", 0) > 0 and _kit_fits(D.ITEMS[kit["item"]]["effect"], context):
        kit["charges"] -= 1
        if kit["charges"] <= 0:
            _log(state, f"Your {D.ITEMS[kit['item']]['name'].lower()} is used up.")
            state["kit"] = None


# ------------------------------------------------------------ one action
def _do_skill(state, a, t, m, events, rng):
    """One completed cycle of a skill recipe. Returns a stop reason or None."""
    rid = a["recipe"]
    r = D.RECIPES[rid]
    skill = r["skill"]
    if level(state, skill) < r["level"]:
        return "Your level is too low for that."
    mlvl = mastery_level(state, rid)
    cp = _checkpoints(state, skill)
    preserve = _pct(m, skill, "preserve") + (mlvl * .15 if D.SKILLS[skill]["kind"] == "craft" else 0)
    for iid, n in r["inputs"].items():
        if state["bank"].get(iid, 0) < n:
            return f"Out of {D.ITEMS[iid]['name'].lower()}."
    if not (r["inputs"] and rng.random() * 100 < preserve):
        for iid, n in r["inputs"].items():
            _bank_take(state, iid, n)
    double = rng.random() * 100 < _pct(m, skill, "double") + mlvl * .2 + cp.get("double_bonus", 0)
    outputs = dict(r["outputs"])
    if r.get("table"):
        roll, total = rng.random() * sum(w for _, w, _, _ in r["table"]), 0
        for iid, w, lo, hi in r["table"]:
            total += w
            if roll <= total:
                outputs[iid] = outputs.get(iid, 0) + rng.randint(lo, hi)
                break
    if r.get("bonus"):
        iid, lo, hi = r["bonus"]
        outputs[iid] = outputs.get(iid, 0) + rng.randint(lo, hi)
    if r.get("burn"):
        chance = max(0, 30 - (level(state, skill) - r["level"]) * 1.5 - mlvl * .2)
        if rng.random() * 100 < chance:
            outputs = {"burnt_food": 1}
            double = False
            _stat(state, "burnt")
    for iid, n in outputs.items():
        if not _bank_add(state, iid, n * (2 if double else 1)):
            return "The stockpile is full."
        if D.SKILLS[skill]["kind"] == "craft":
            _stat(state, "crafted", n)
    for iid, chance in r.get("extras", []):
        if rng.random() < chance:
            if _bank_add(state, iid, 1):
                events.append({"type": "rare", "item": iid})
                _log(state, f"Found something unusual: {D.ITEMS[iid]['name'].lower()}.")
    if r.get("warmth"):
        bonus = 1 + m.get("hearth_time", 0) / 100
        state["warmUntil"] = min(t + D.HEARTH_MAX, max(t, state.get("warmUntil", 0)) + r["warmth"] * bonus)
    if r.get("fragment"):
        chance = (18 + level(state, "signals") * .25) * (1 + m.get("fragments", 0) / 100)
        if rng.random() * 100 < chance:
            _bank_add(state, r["fragment"], 1)
    xp = r["xp"] * (1 + cp.get("xp_bonus", 0) / 100)
    _grant_xp(state, skill, xp, m, events, t)
    _grant_mastery(state, rid, 1.5 + r["seconds"] * 1.2, m, events)
    _companion(state, skill, r["seconds"], m, events, rng)
    _stat(state, "actions")
    _stat(state, f"skill:{skill}")
    _use_kit(state, D.SKILLS[skill]["kind"])
    return None


def _do_scout(state, a, t, m, events, rng):
    course = [o for o in state["obstacles"] if o in _OBSTACLES]
    if not course:
        return "Build a stop on the route first."
    o = _OBSTACLES[course[a.get("step", 0) % len(course)]]
    _grant_xp(state, "scouting", o["xp"], m, events, t)
    _stat(state, "obstacles")
    a["step"] = a.get("step", 0) + 1
    if a["step"] % len(course) == 0:
        scrip = sum(_OBSTACLES[c]["scrip"] for c in course)
        state["scrip"] += scrip
        _stat(state, "laps")
        _stat(state, "scripEarned", scrip)
    _companion(state, "scouting", o["seconds"], m, events, rng)
    return None


def scout_interval(state, a, m):
    course = [o for o in state["obstacles"] if o in _OBSTACLES]
    if not course:
        return 5
    o = _OBSTACLES[course[a.get("step", 0) % len(course)]]
    return max(o["seconds"] * .5, o["seconds"] * (1 - _pct(m, "scouting", "speed") / 100))


# ----------------------------------------------------------------- combat
def player_stats(state, m):
    eq = state["equipment"]
    stats = {"acc": 0, "str": 0, "def": 0, "eva": 0}
    for slot, iid in eq.items():
        it = D.ITEMS.get(iid, {})
        for k, v in (it.get("stats") or {}).items():
            if k in stats:
                stats[k] += v
    weapon = D.ITEMS.get(eq.get("weapon"), {})
    style = (weapon.get("stats") or {}).get("style", "melee")
    speed = (weapon.get("stats") or {}).get("speed", 2.4)
    ammo = D.ITEMS.get(eq.get("ammo"), {})
    if style != "melee":
        if ammo.get("ammo") == style:
            stats["str"] += (ammo.get("stats") or {}).get("str", 0)
    skill = D.STYLES[style]
    atk, fort = level(state, skill), level(state, "fortitude")
    acc = (atk + 9) * (stats["acc"] + 64) * (1 + m.get("accuracy", 0) / 100)
    maxhit = math.floor(10 * (1.3 + atk / 10 + stats["str"] / 80 + atk * stats["str"] / 640)) * (1 + m.get("maxhit", 0) / 100)
    eva = (fort + 9) * (stats["def"] + stats["eva"] + 64) * (1 + m.get("evasion", 0) / 100)
    dr = min(60, stats["def"] / 10 + m.get("dr", 0))
    return {"style": style, "skill": skill, "speed": speed, "acc": round(acc), "maxhit": max(1, round(maxhit)), "eva": round(eva),
            "dr": round(dr, 1), "needsAmmo": style != "melee", "ammoOk": style == "melee" or ammo.get("ammo") == style}


def hit_chance(acc, eva):
    return .5 * acc / eva if acc < eva else 1 - .5 * eva / acc


def _eat(state, m, events):
    food = state.get("food")
    if not food or state["bank"].get(food, 0) <= 0:
        return False
    _bank_take(state, food, 1)
    heal = D.ITEMS[food].get("heal", 0) * (1 + m.get("heal", 0) / 100)
    state["hp"] = min(max_hp(state), state["hp"] + heal)
    _stat(state, "eaten")
    if food not in state["bank"]:
        events.append({"type": "nofood", "item": food})
        _log(state, f"You've eaten the last {D.ITEMS[food]['name'].lower()}.")
    return True


def _enemy_for(a):
    return D.ENEMIES[a["enemy"]]


def _spawn(state, a, t):
    if a.get("expedition"):
        exp = _EXPEDITIONS[a["expedition"]]
        a["enemy"] = exp["enemies"][a["wave"]]
    e = _enemy_for(a)
    a["enemyHp"] = e["hp"]
    a["pNext"] = t + .3
    a["eNext"] = t + e["interval"]
    a["spawnAt"] = 0


_EXPEDITIONS = {e["id"]: e for e in D.EXPEDITIONS}


def _combat(state, a, until, m, events, rng):
    """Run a fight from a['clock'] to `until`. Returns a stop reason or None."""
    ps = player_stats(state, m)
    autoeat = BASE_AUTOEAT + m.get("autoeat", 0)
    guard, seen = 0, len(events)
    while guard < 200000:
        guard += 1
        if len(events) != seen:          # a level up mid-fight makes you stronger at once
            ps, seen = player_stats(state, m), len(events)
        if a.get("spawnAt"):
            nxt = a["spawnAt"]
        else:
            nxt = min(a["pNext"], a["eNext"])
        if nxt > until:
            a["clock"] = until
            return None
        t = nxt
        a["clock"] = t
        if a.get("spawnAt"):
            _spawn(state, a, t)
            continue
        e = _enemy_for(a)
        if a["pNext"] <= a["eNext"]:
            a["pNext"] = t + ps["speed"]
            if ps["needsAmmo"]:
                ammo = state["equipment"].get("ammo")
                if not ps["ammoOk"] or not ammo or state["bank"].get(ammo, 0) <= 0:
                    if ammo and state["bank"].get(ammo, 0) <= 0:
                        state["equipment"].pop("ammo", None)
                    return "Out of ammunition." if ps["style"] == "ranged" else "Out of cells."
                keep = (20 if ps["style"] == "ranged" else 0) + m.get("ammo", 0)
                if rng.random() * 100 >= keep:
                    _bank_take(state, ammo, 1)
            _use_kit(state, "combat")
            if rng.random() < hit_chance(ps["acc"], e["eva"]):
                mult = 1.25 if D.BEATS[ps["style"]] == e["style"] else .85 if D.BEATS[e["style"]] == ps["style"] else 1
                dmg = min(a["enemyHp"], max(1, round(rng.randint(1, ps["maxhit"]) * mult)))
                a["enemyHp"] -= dmg
                skill = "fortitude" if state.get("stance") == "defensive" else ps["skill"]
                _grant_xp(state, skill, dmg * .4, m, events, t)
                _grant_xp(state, "vitality", dmg * .133, m, events, t)
                _stat(state, "damage", dmg)
            if a["enemyHp"] <= 0:
                stop = _kill(state, a, e, t, m, events, rng)
                if stop:
                    return stop
        else:
            a["eNext"] = t + e["interval"]
            if rng.random() < hit_chance(e["acc"], ps["eva"]):
                mult = 1.15 if D.BEATS[e["style"]] == ps["style"] else .85 if D.BEATS[ps["style"]] == e["style"] else 1
                dmg = max(1, round(rng.randint(1, e["maxhit"]) * mult * (1 - ps["dr"] / 100)))
                state["hp"] -= dmg
                _stat(state, "damageTaken", dmg)
            while state["hp"] < max_hp(state) * autoeat / 100 and _eat(state, m, events):
                pass
            if state["hp"] <= 0:
                state["hp"] = round(max_hp(state) * .3)
                _stat(state, "knockouts")
                events.append({"type": "defeat", "enemy": e["id"]})
                if a.get("expedition"):
                    _log(state, f"The expedition to {_EXPEDITIONS[a['expedition']]['name']} turned back.")
                    return "Knocked down. The expedition turned back."
                _log(state, f"The {e['name'].lower()} knocked you down. You limp back to camp.")
                return "Knocked down. You made it back to camp."
    a["clock"] = until
    return None


def _kill(state, a, e, t, m, events, rng):
    _stat(state, "kills")
    _stat(state, f"kill:{e['id']}")
    scrip = rng.randint(*e["scrip"])
    state["scrip"] += scrip
    _stat(state, "scripEarned", scrip)
    double = rng.random() * 100 < m.get("loot", 0)
    for iid, chance, lo, hi in e["drops"]:
        if rng.random() < chance:
            n = rng.randint(lo, hi) * (2 if double else 1)
            _bank_add(state, iid, n)
            if D.ITEMS[iid]["cat"] in ("valuable", "gear") or iid == "server_core":
                events.append({"type": "rare", "item": iid})
    b = state.get("bounty")
    if b and b["enemy"] == e["id"] and b["left"] > 0:
        b["left"] -= 1
        _grant_xp(state, "bounty", e["hp"] * .12, m, events, t)
        if b["left"] == 0:
            tokens = round(b["reward"] * (1 + m.get("tokens", 0) / 100))
            state["tokens"] += tokens
            _stat(state, "bounties")
            events.append({"type": "bounty", "tokens": tokens})
            _log(state, f"Bounty complete: {b['total']} × {e['name'].lower()}. {tokens} tokens paid.")
            state["bounty"] = None
    _companion(state, "combat", 6, m, events, rng)
    if b and b["enemy"] == e["id"]:
        _companion(state, "bounty", 8, m, events, rng)
    if a.get("expedition"):
        exp = _EXPEDITIONS[a["expedition"]]
        a["wave"] += 1
        if a["wave"] >= len(exp["enemies"]):
            first = exp["id"] not in state["completed"]
            if first:
                state["completed"].append(exp["id"])
            for iid, n in exp["reward"].items():
                if not (D.ITEMS[iid]["cat"] == "gear" and not first and iid in state["bank"]):
                    _bank_add(state, iid, n)
            state["scrip"] += exp["scrip"]
            _stat(state, "expeditions")
            _stat(state, f"exp:{exp['id']}")
            events.append({"type": "expedition", "id": exp["id"], "first": first})
            _log(state, f"Expedition complete: {exp['name']}.")
            if first and exp.get("story") and exp["story"] not in state["storyDone"]:
                state["pendingStory"] = exp["story"]
            return "Expedition complete."
    a["spawnAt"] = t + RESPAWN
    return None


# ------------------------------------------------------------- the clock
def _advance(state, now, events, rng):
    last = float(state.get("updated", now))
    elapsed = max(0, min(now - last, OFFLINE_CAP))
    start = now - elapsed
    # Supplies keep flowing from the buildings.
    if elapsed:
        for b, lvl in state["buildings"].items():
            if lvl and b in D.BUILDINGS:
                k = D.BUILDINGS[b]["supply"]
                cap = D.supply_cap(lvl)
                if state["supplies"].get(k, 0) < cap:
                    state["supplies"][k] = min(cap, state["supplies"].get(k, 0) + elapsed / 3600 * D.supply_rate(lvl))
    a = state.get("action")
    if elapsed and (not a or a["type"] != "combat"):
        # Health returns at camp.
        state["hp"] = min(max_hp(state), state["hp"] + max_hp(state) * REGEN * elapsed / 2)
    if not a:
        state["updated"] = now
        return None
    # Only a long absence is capped (a day of offline time). An action in
    # progress keeps its own start: checking often must never delay it.
    floor = now - OFFLINE_CAP
    a["start"] = max(a.get("start", now), floor)
    stop = None
    if a["type"] == "combat":
        a["clock"] = max(a.get("clock", now), floor)
        if a.get("spawnAt"):
            a["spawnAt"] = max(a["spawnAt"], a["clock"])
        else:
            a["pNext"] = max(a.get("pNext", a["clock"]), a["clock"])
            a["eNext"] = max(a.get("eNext", a["clock"]), a["clock"])
        stop = _combat(state, a, now, modifiers(state, a["clock"]), events, rng)
    else:
        n, m, seen, warm = 0, None, -1, None
        while n < 100000:
            # Bonuses change rarely (a level, a companion, the hearth going
            # cold): recompute them only then, not every action.
            is_warm = state.get("warmUntil", 0) > a["start"]
            if m is None or len(events) != seen or is_warm != warm or n % 500 == 0:
                m, seen, warm = modifiers(state, a["start"]), len(events), is_warm
            step = interval(state, a["recipe"], m) if a["type"] == "skill" else scout_interval(state, a, m)
            t = a["start"] + step
            if t > now:
                break
            stop = (_do_skill if a["type"] == "skill" else _do_scout)(state, a, t, m, events, rng)
            a["start"] = t
            n += 1
            if stop:
                break
        a["interval"] = interval(state, a["recipe"], modifiers(state, now)) if a["type"] == "skill" else scout_interval(state, a, modifiers(state, now))
    if stop:
        events.append({"type": "stopped", "reason": stop})
        state["action"] = None
        if not stop.startswith("Expedition complete"):
            _log(state, stop)
    state["updated"] = now
    return stop


def _shift(state, dt, until):
    """Move running timers forward by dt, so the action resumes now."""
    a = state.get("action")
    if a:
        for k in ("start", "clock", "pNext", "eNext"):
            if type(a.get(k)) in (int, float):
                a[k] += dt
        if a.get("spawnAt"):
            a["spawnAt"] += dt
    if state.get("warmUntil", 0) > until:
        state["warmUntil"] += dt          # warmth left over isn't lost while away


def _snapshot(state):
    return {"xp": dict(state["xp"]), "bank": dict(state["bank"]), "scrip": state["scrip"], "kills": state["stats"].get("kills", 0),
            "supplies": dict(state["supplies"]),
            "companions": list(state["companions"]), "tokens": state["tokens"]}


def _report(before, state, seconds, stop):
    gained = {s: round(state["xp"][s] - before["xp"].get(s, 0)) for s in state["xp"] if state["xp"][s] - before["xp"].get(s, 0) >= 1}
    supplies = {k: round(v - before["supplies"].get(k, 0), 1) for k, v in state["supplies"].items() if abs(v - before["supplies"].get(k, 0)) >= .1}
    if not gained and state["scrip"] == before["scrip"] and not supplies:
        return None
    items = {}
    for k in set(before["bank"]) | set(state["bank"]):
        d = state["bank"].get(k, 0) - before["bank"].get(k, 0)
        if d:
            items[k] = d
    return {"seconds": round(seconds), "xp": gained,
            "levels": {s: [D.level_for(before["xp"].get(s, 0)), D.level_for(state["xp"][s])] for s in gained
                       if D.level_for(state["xp"][s]) > D.level_for(before["xp"].get(s, 0))},
            "items": items, "scrip": state["scrip"] - before["scrip"], "kills": state["stats"].get("kills", 0) - before["kills"],
            "companions": [c for c in state["companions"] if c not in before["companions"]], "tokens": state["tokens"] - before["tokens"],
            "supplies": supplies, "pace": AWAY_PACE, "stopped": stop or ""}


# ---------------------------------------------------------------- actions
def _require(cond, message):
    if not cond:
        raise ValueError(message)


def _start_skill(state, rid, now):
    r = D.RECIPES.get(rid)
    _require(r, "Unknown action.")
    _require(level(state, r["skill"]) >= r["level"], f"Needs {D.SKILLS[r['skill']]['name']} level {r['level']}.")
    for iid, n in r["inputs"].items():
        _require(state["bank"].get(iid, 0) >= n, f"You need {n} × {D.ITEMS[iid]['name'].lower()}.")
    state["action"] = {"type": "skill", "skill": r["skill"], "recipe": rid, "start": now}
    state["action"]["interval"] = interval(state, rid, modifiers(state, now))


def _start_fight(state, now, enemy=None, expedition=None):
    if expedition:
        exp = _EXPEDITIONS.get(expedition)
        _require(exp, "Unknown expedition.")
        _require(combat_level(state) >= exp["level"] - 10, f"Recommended combat level {exp['level']}. Train a little more first.")
        if exp.get("requires"):
            _require(state["equipment"].get("charm") == exp["requires"], f"Wear the {D.ITEMS[exp['requires']]['name']} to find the way.")
        for k, v in exp["cost"].items():
            _require(state["supplies"].get(k, 0) >= v, f"The expedition needs {v} {k}.")
        for k, v in exp["cost"].items():
            state["supplies"][k] -= v
        a = {"type": "combat", "expedition": expedition, "wave": 0, "enemy": exp["enemies"][0]}
        _log(state, f"Expedition departed: {exp['name']}.")
    else:
        e = D.ENEMIES.get(enemy)
        _require(e and not e["boss"], "Unknown enemy.")
        area = next(ar for ar in D.AREAS if enemy in ar["enemies"])
        if area.get("requires"):
            _require(state["equipment"].get("charm") == area["requires"], f"Wear the {D.ITEMS[area['requires']]['name']} to find the way.")
        a = {"type": "combat", "area": area["id"], "enemy": enemy}
    ps = player_stats(state, modifiers(state, now))
    _require(ps["ammoOk"] and (not ps["needsAmmo"] or state["bank"].get(state["equipment"].get("ammo"), 0) > 0),
             "Load arrows for a bow." if ps["style"] == "ranged" else "Load cells for a gadget.")
    a.update(start=now, clock=now)
    _spawn(state, a, now)
    state["action"] = a


def _equip(state, iid):
    it = D.ITEMS.get(iid)
    _require(it and it.get("slot"), "That can't be equipped.")
    _require(state["bank"].get(iid, 0) > 0, "You don't have that.")
    for skill, lvl in (it.get("req") or {}).items():
        _require(level(state, skill) >= lvl, f"Needs {D.SKILLS[skill]['name']} level {lvl}.")
    if it["slot"] == "kit":
        old = state.get("kit")
        if old and old["charges"] >= D.ITEMS[old["item"]]["charges"]:
            _bank_add(state, old["item"], 1, False)        # an untouched remedy goes back on the shelf
        _bank_take(state, iid, 1)
        state["kit"] = {"item": iid, "charges": it["charges"]}
        return
    if it["slot"] == "ammo":
        state["equipment"]["ammo"] = iid          # ammo stays in the stockpile and is drawn from it
        return
    state["equipment"][it["slot"]] = iid
    if it["slot"] == "weapon" and it["stats"].get("style") != "melee":
        ammo = state["equipment"].get("ammo")
        if ammo and D.ITEMS[ammo].get("ammo") != it["stats"]["style"]:
            state["equipment"].pop("ammo")


def interact(path, action=None, now=None):
    now = time.time() if now is None else now
    rng = random.Random()
    with LOCK:
        state = _load(path, now)
        events = []
        before = _snapshot(state)
        last = float(state.get("updated", now))
        gap = min(max(0, now - last), OFFLINE_CAP)
        if gap > AWAY_FULL:
            state["updated"] = now - gap          # a longer absence starts the day it can count
            until = now - gap + AWAY_FULL + (gap - AWAY_FULL) * AWAY_PACE
            stop = _advance(state, until, events, rng)
            _shift(state, now - until, until)
            state["updated"] = now
        else:
            stop = _advance(state, now, events, rng)
        away = gap >= AWAY_FULL
        reached = {}
        for e in events:
            if e["type"] == "level":
                reached[e["skill"]] = max(reached.get(e["skill"], 0), e["level"])
        for skill, lv in reached.items():
            _log(state, f"{D.SKILLS[skill]['name']} reached level {lv}.")
        if away:
            report = _report(before, state, min(now - last, OFFLINE_CAP), stop)
            if report:
                state["away"] = report
                events = [e for e in events if e["type"] not in ("level", "mastery")]   # the report says it all
        if action:
            _act(state, action, now, events)
        _save(path, state)
        return view(state, now, events)


def _act(state, action, now, events):
    kind = action.get("type")
    m = modifiers(state, now)
    if kind == "start":
        _start_skill(state, action.get("recipe"), now)
    elif kind == "scout":
        _require(any(o in _OBSTACLES for o in state["obstacles"]), "Build a stop on the route first.")
        state["action"] = {"type": "scout", "skill": "scouting", "start": now, "step": 0}
        state["action"]["interval"] = scout_interval(state, state["action"], m)
    elif kind == "stop":
        a = state.get("action") or {}
        if a.get("expedition"):
            _log(state, "You called the expedition back.")
        elif a.get("type") == "skill":
            _log(state, f"You stopped {D.RECIPES[a['recipe']]['name'].lower()}.")
        elif a.get("type") == "combat":
            _log(state, f"You retreated from the {D.ENEMIES[a['enemy']]['name'].lower()}.")
        elif a.get("type") == "scout":
            _log(state, "You stopped running the route.")
        state["action"] = None
    elif kind == "fight":
        _start_fight(state, now, enemy=action.get("enemy"))
    elif kind == "expedition":
        _start_fight(state, now, expedition=action.get("id"))
    elif kind == "equip":
        _equip(state, action.get("item"))
    elif kind == "unequip":
        slot = action.get("slot")
        if slot == "kit":
            state["kit"] = None
        else:
            state["equipment"].pop(slot, None)
    elif kind == "food":
        iid = action.get("item")
        _require(iid is None or (iid in D.ITEMS and D.ITEMS[iid]["cat"] == "food"), "That isn't food.")
        state["food"] = iid
    elif kind == "eat":
        _require(state["hp"] < max_hp(state), "You're already at full health.")
        _require(_eat(state, m, events), "Choose food you have first.")
    elif kind == "stance":
        _require(action.get("stance") in ("aggressive", "defensive"), "Unknown stance.")
        state["stance"] = action["stance"]
    elif kind == "sell":
        iid, n = action.get("item"), action.get("qty")
        _require(iid in state["bank"] and type(n) is int and 0 < n <= state["bank"][iid], "Nothing to sell.")
        _require(iid not in state["equipment"].values() or state["bank"][iid] > n, "Unequip it first.")
        value = round(D.ITEMS[iid]["value"] * n * (1 + m.get("scrip", 0) / 100))
        _bank_take(state, iid, n)
        state["scrip"] += value
        _stat(state, "scripEarned", value)
        if state.get("food") == iid and iid not in state["bank"]:
            state["food"] = None
    elif kind == "buy":
        offer = _OFFERS.get(action.get("offer"))
        _require(offer, "Unknown offer.")
        _require(state["scrip"] >= offer["price"], "Not enough scrip.")
        if offer["kind"] == "upgrade":
            _require(state["upgrades"].get(offer["group"], 0) == offer["tier"] - 1, "Buy the earlier tier first.")
            if offer.get("skill"):
                _require(level(state, offer["skill"]) >= offer["level"], f"Needs {D.SKILLS[offer['skill']]['name']} level {offer['level']}.")
            state["upgrades"][offer["group"]] = offer["tier"]
        else:
            _require(_bank_add(state, offer["item"], offer["qty"], False), "The stockpile is full.")
        state["scrip"] -= offer["price"]
        _log(state, f"Bought {offer.get('name') or D.ITEMS[offer['item']]['name'].lower()} from the Trader.")
    elif kind == "slots":
        price = D.stockpile_price(state["slotsBought"])
        _require(state["scrip"] >= price, "Not enough scrip.")
        state["scrip"] -= price
        state["slotsBought"] += 1
    elif kind == "upgrade":
        b = action.get("building")
        _require(b in D.BUILDINGS, "Unknown building.")
        lvl = state["buildings"][b]
        _require(lvl < D.BUILDING_MAX, "Fully upgraded.")
        cost, parts = D.building_cost(b, lvl)
        for k, v in cost.items():
            _require(state["supplies"].get(k, 0) >= v, f"Needs {v} {k}.")
        for iid, v in parts.items():
            _require(state["bank"].get(iid, 0) >= v, f"Needs {v} × {D.ITEMS[iid]['name'].lower()}.")
        for k, v in cost.items():
            state["supplies"][k] -= v
        for iid, v in parts.items():
            _bank_take(state, iid, v)
        state["buildings"][b] = lvl + 1
        events.append({"type": "building", "id": b, "level": lvl + 1})
        _log(state, f"{D.BUILDINGS[b]['name']} raised to level {lvl + 1}.")
    elif kind == "mastery":
        rid = action.get("recipe")
        r = D.RECIPES.get(rid)
        _require(r, "Unknown recipe.")
        book = state["mastery"].setdefault(r["skill"], {})
        lvl = D.level_for(book.get(rid, 0))
        _require(lvl < 99, "Already mastered.")
        need = D.XP_TABLE[lvl + 1] - book.get(rid, 0)
        _require(state["pool"].get(r["skill"], 0) >= need, "Not enough in the mastery pool.")
        state["pool"][r["skill"]] -= need
        book[rid] = D.XP_TABLE[lvl + 1]
    elif kind == "bounty":
        tier = next((x for x in D.BOUNTY_TIERS if x["id"] == action.get("tier")), None)
        _require(tier, "Unknown bounty.")
        _require(not state.get("bounty"), "Finish or drop your current bounty first.")
        cl = combat_level(state)
        pool = [e for ar in D.AREAS for e in ar["enemies"] if D.ENEMIES[e]["level"] <= min(tier["max"], cl + 12)
                and (not ar.get("requires") or state["equipment"].get("charm") == ar["requires"])]
        _require(pool, "No bounties for your level yet.")
        rng = random.Random()
        eid = rng.choice(pool)
        n = rng.randint(*tier["count"])
        state["bounty"] = {"enemy": eid, "left": n, "total": n, "tier": tier["id"], "reward": n * tier["tokens"] // 2 + 5}
        _log(state, f"New bounty: {n} × {D.ENEMIES[eid]['name'].lower()}.")
    elif kind == "dropbounty":
        state["bounty"] = None
    elif kind == "bountyshop":
        offer = next((o for o in D.BOUNTY_SHOP if o["item"] == action.get("item")), None)
        _require(offer, "Unknown item.")
        _require(level(state, "bounty") >= offer["level"], f"Needs Bounty Hunting level {offer['level']}.")
        _require(state["tokens"] >= offer["tokens"], "Not enough tokens.")
        _require(_bank_add(state, offer["item"], 1, False), "The stockpile is full.")
        state["tokens"] -= offer["tokens"]
    elif kind == "tune":
        bc = D.BROADCASTS.get(action.get("broadcast"))
        _require(bc, "Unknown broadcast.")
        band = next(b for b in D.BANDS if b[0] == bc["band"])
        _require(level(state, "signals") >= band[2], f"Needs Signals level {band[2]}.")
        rank = state["broadcasts"].get(bc["id"], 0)
        _require(rank < 5, "Fully tuned.")
        cost, frag = D.BROADCAST_COST[rank], f"{bc['band']}_fragment"
        _require(state["bank"].get(frag, 0) >= cost, f"Needs {cost} fragments.")
        _bank_take(state, frag, cost)
        state["broadcasts"][bc["id"]] = rank + 1
        _log(state, f"Broadcast tuned: {bc['name']} {'I II III IV V'.split()[rank]}.")
    elif kind == "obstacle":
        slot, oid = action.get("slot"), action.get("obstacle")
        o = _OBSTACLES.get(oid)
        _require(o and o["slot"] == slot, "That stop doesn't go there.")
        _require(level(state, "scouting") >= D.OBSTACLE_SLOTS[slot], f"Needs Scouting level {D.OBSTACLE_SLOTS[slot]}.")
        _require(state["obstacles"][slot] != oid, "Already built.")
        for iid, n in o["cost"].items():
            _require(state["bank"].get(iid, 0) >= n, f"Needs {n} × {D.ITEMS[iid]['name'].lower()}.")
        price = 50 * (slot + 1) ** 2
        _require(state["scrip"] >= price, f"Needs {price} scrip.")
        for iid, n in o["cost"].items():
            _bank_take(state, iid, n)
        state["scrip"] -= price
        state["obstacles"][slot] = oid
        _log(state, f"Built {o['name'].lower()} on the route.")
    elif kind == "story":
        sid = state.get("pendingStory")
        _require(sid in D.STORY_CHOICES, "No story is waiting.")
        choice = action.get("choice")
        options = D.STORY_CHOICES[sid]["choices"]
        _require(type(choice) is int and 0 <= choice < len(options), "Choose one of the paths.")
        for k, v in options[choice]["reward"].items():
            state["supplies"][k] = state["supplies"].get(k, 0) + v
        _log(state, options[choice]["result"])
        state["storyDone"].append(sid)
        state["pendingStory"] = None
    elif kind == "ack":
        state["away"] = None
    else:
        raise ValueError("Unknown Outpost action.")


# ------------------------------------------------------------------- view
def view(state, now, events=()):
    m = modifiers(state, now)
    a = state.get("action")
    info = None
    if a:
        info = dict(a)
        if a["type"] == "combat":
            ps = player_stats(state, m)
            e = _enemy_for(a)
            info.update(enemyMax=e["hp"], player=ps, hitChance=round(hit_chance(ps["acc"], e["eva"]) * 100),
                        enemyHitChance=round(hit_chance(e["acc"], ps["eva"]) * 100))
    return {"state": state, "now": now, "events": list(events), "mods": m, "maxHp": max_hp(state), "combatLevel": combat_level(state),
            "levels": {s: level(state, s) for s in D.SKILLS}, "slots": slots(state), "slotPrice": D.stockpile_price(state["slotsBought"]),
            "player": player_stats(state, m), "action": info, "autoeat": BASE_AUTOEAT + m.get("autoeat", 0),
            "intervals": {rid: round(interval(state, rid, m), 2) for rid in D.RECIPES}}


def data():
    return D.export()


# ------------------------------------------------------- achievements
def stat(path, key):
    """A number for Umbra's achievements (outpost:<key>)."""
    try:
        with open(path) as f:
            raw = json.load(f)
    except (OSError, ValueError):
        return 0
    if not isinstance(raw, dict):
        return 0
    state = _normal(_migrate(raw, time.time()), time.time())
    levels = [max(0, min(D.BUILDING_MAX, int(v))) for v in state["buildings"].values() if type(v) in (int, float)]
    if key == "stations":
        return sum(lv > 0 for lv in levels)
    if key == "upgrades":
        return max(0, sum(levels) - 3)
    if key == "mastered":
        return sum(lv >= 5 for lv in levels)
    if key == "stockpile":
        return sum(state["supplies"].get(k, 0) >= 50 for k in D.SUPPLIES)
    if key == "stories":
        return len(set(state["completed"]) & set(ROUTES))
    if key.startswith("route:"):
        return int(key[6:] in state["completed"])
    if key.startswith("station:"):
        return state["buildings"].get(key[8:], 0)
    if key == "total":
        return sum(D.level_for(x) for x in state["xp"].values())
    if key == "maxskill":
        return max(D.level_for(x) for x in state["xp"].values())
    if key.startswith("skill:"):
        return D.level_for(state["xp"].get(key[6:], 0))
    if key == "companions":
        return len(state["companions"])
    if key == "expeditions":
        return len(set(state["completed"]))
    if key in ("bounties", "kills", "crafted", "laps"):
        return state["stats"].get(key, 0)
    if key == "broadcasts":
        return sum(state["broadcasts"].values())
    if key == "mastery99":
        return sum(1 for book in state["mastery"].values() for x in book.values() if D.level_for(x) >= 99)
    return 0


def restore_save(path, state):
    """Accept only game-shaped data from an Umbra backup (either version)."""
    if not isinstance(state, dict) or state.get("version") not in (1, VERSION):
        raise ValueError("Invalid Outpost save.")
    now = time.time()
    clean = _normal(_migrate(copy.deepcopy(state), now), now)
    if not isinstance(clean.get("xp"), dict) or not isinstance(clean.get("bank"), dict):
        raise ValueError("Invalid Outpost save.")
    for s, x in list(clean["xp"].items()):
        if s not in D.SKILLS or type(x) not in (int, float) or not 0 <= x <= 2 ** 31:
            raise ValueError("Invalid Outpost skills.")
    for k, v in list(clean["bank"].items()):
        if type(v) is not int or v < 0 or v > 10 ** 9:
            raise ValueError("Invalid Outpost stockpile.")
    clean["updated"] = min(now, max(0, float(clean.get("updated", now))))
    with LOCK:
        _save(path, clean)
