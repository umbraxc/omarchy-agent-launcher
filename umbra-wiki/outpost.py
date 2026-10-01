"""Small, fully offline settlement game. No real farm or supply data is used."""
import copy
import json
import os
import threading
import time

LOCK = threading.Lock()
RESOURCES = ("food", "water", "wood", "scrap", "energy", "medicine", "knowledge", "morale")
STATIONS = {
    "garden": ("food", {"wood": 8, "water": 5}),
    "well": ("water", {"wood": 7, "scrap": 4}),
    "lumber": ("wood", {"food": 6, "scrap": 4}),
    "salvage": ("scrap", {"food": 7, "water": 5}),
    "solar": ("energy", {"scrap": 9, "wood": 5}),
    "clinic": ("medicine", {"scrap": 7, "knowledge": 5}),
    "archive": ("knowledge", {"energy": 7, "wood": 5}),
    "hearth": ("morale", {"food": 8, "wood": 6}),
}
ROUTES = {
    "weather": {"title": "THE SILENT WEATHER STATION", "cost": {"food": 6, "water": 6, "medicine": 1, "morale": 2}, "minutes": 12,
                "intro": "A dead weather station blinks once on the ridge. Its last forecast never reached the valley."},
    "glasshouse": {"title": "THE GLASSHOUSE SIGNAL", "cost": {"food": 8, "water": 8, "medicine": 2, "morale": 3}, "minutes": 18,
                   "intro": "A warm light appears beyond the old rail line. Beneath broken glass, something is still growing."},
}
SCENES = {
    "weather": [
        {"text": "The antenna is bent, but a paper log records one final storm warning. How do you get the message out?",
         "choices": [
             {"label": "Repair the transmitter", "cost": {"scrap": 5, "energy": 3}, "reward": {"knowledge": 5}, "result": "The aerial hums. A distant receiver answers with three patient clicks."},
             {"label": "Carry the log home", "cost": {}, "reward": {"knowledge": 3, "wood": 4}, "result": "You pocket the log and salvage dry timber from the empty station."}]},
        {"text": "At the foot of the mast you find a sealed forecast map. It marks a safe path through the next storm.",
         "choices": [
             {"label": "Mark the path for everyone", "cost": {"knowledge": 3}, "reward": {"morale": 8, "water": 5}, "result": "Lanterns answer from the valley. The route belongs to everyone now."},
             {"label": "Keep the map in the archive", "cost": {}, "reward": {"knowledge": 7, "scrap": 3}, "result": "The map finds a place beside the old field books."}]},
    ],
    "glasshouse": [
        {"text": "The glasshouse pump is silent. A hand painted sign reads: TAKE WHAT YOU NEED. LEAVE SOMETHING GROWING.",
         "choices": [
             {"label": "Repair the pump", "cost": {"scrap": 6, "energy": 3}, "reward": {"food": 7}, "result": "Water runs through the beds again; fresh shoots turn toward the light."},
             {"label": "Carry water by hand", "cost": {"water": 5}, "reward": {"food": 5, "morale": 3}, "result": "It is slower work, but the first seedlings survive."}]},
        {"text": "A seed tin and a gardener's notebook sit beneath the last unbroken pane.",
         "choices": [
             {"label": "Share the seed tin", "cost": {}, "reward": {"food": 8, "morale": 8}, "result": "New plots appear around the outpost by morning."},
             {"label": "Study the notebook", "cost": {}, "reward": {"knowledge": 9, "medicine": 3}, "result": "The notes reveal useful plants and a careful hand at work."}]},
    ],
}


def fresh(now):
    return {"version": 1, "updated": now, "resources": {"food": 15, "water": 15, "wood": 12,
            "scrap": 10, "energy": 8, "medicine": 2, "knowledge": 4, "morale": 10},
            "stations": {name: (1 if name in ("garden", "well", "lumber") else 0) for name in STATIONS}, "active": None, "completed": [],
            "log": ["The lamps come on. Umbra Outpost has a place to begin."]}


def _save(path, state):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=2)
    os.replace(tmp, path)


def _load(path, now):
    try:
        with open(path) as f:
            state = json.load(f)
        if state.get("version") != 1 or not isinstance(state.get("resources"), dict):
            raise ValueError("invalid save")
        return state
    except (OSError, ValueError, TypeError):
        return fresh(now)


def _log(state, line):
    state["log"] = ([line] + state.get("log", []))[:12]


def _spend(state, cost):
    if any(state["resources"].get(key, 0) < value for key, value in cost.items()):
        raise ValueError("Not enough resources yet.")
    for key, value in cost.items():
        state["resources"][key] -= value


def _advance(state, now):
    elapsed = max(0, min(now - float(state.get("updated", now)), 24 * 3600))
    hours = elapsed / 3600
    if hours:
        for station, (resource, _) in STATIONS.items():
            level = max(0, min(5, int(state.get("stations", {}).get(station, 0))))
            # A useful return after an absence, without overflow or maintenance debt.
            state["resources"][resource] = min(250, state["resources"].get(resource, 0) + hours * level * (2 + .4 * level))
    state["updated"] = now


def _view(state, now):
    active = state.get("active")
    scene = None
    if active and now >= active["ready"]:
        scene = SCENES[active["route"]][active["step"]]
    return {"state": state, "scene": scene, "routes": ROUTES, "stations": STATIONS,
            "now": now}


def interact(path, action=None, now=None):
    now = time.time() if now is None else now
    with LOCK:
        state = _load(path, now)
        _advance(state, now)
        if action:
            kind = action.get("type")
            if kind == "upgrade":
                name = action.get("station")
                if name not in STATIONS:
                    raise ValueError("Unknown station.")
                level = state["stations"].get(name, 0)
                if level >= 5:
                    raise ValueError("This station is fully upgraded.")
                cost = {key: amount * (level + 1) for key, amount in STATIONS[name][1].items()}
                _spend(state, cost)
                state["stations"][name] = level + 1
                _log(state, f"{name.title()} upgraded to level {level + 1}.")
            elif kind == "launch":
                route = action.get("route")
                if route not in ROUTES or state.get("active"):
                    raise ValueError("Choose an available expedition.")
                if route in state["completed"]:
                    raise ValueError("That story is complete.")
                _spend(state, ROUTES[route]["cost"])
                state["active"] = {"route": route, "step": 0, "ready": now + ROUTES[route]["minutes"] * 60}
                _log(state, f"Expedition departed: {ROUTES[route]['title']}.")
            elif kind == "choose":
                active = state.get("active")
                if not active or now < active["ready"]:
                    raise ValueError("The expedition has not returned yet.")
                choices = SCENES[active["route"]][active["step"]]["choices"]
                index = action.get("choice")
                if type(index) is not int or not 0 <= index < len(choices):
                    raise ValueError("Choose one of the available paths.")
                choice = choices[index]
                _spend(state, choice["cost"])
                for key, amount in choice["reward"].items():
                    state["resources"][key] = min(250, state["resources"].get(key, 0) + amount)
                _log(state, choice["result"])
                active["step"] += 1
                if active["step"] == len(SCENES[active["route"]]):
                    state["completed"].append(active["route"])
                    _log(state, f"Story complete: {ROUTES[active['route']]['title']}.")
                    state["active"] = None
                else:
                    active["ready"] = now + 8 * 60
            else:
                raise ValueError("Unknown outpost action.")
        _save(path, state)
        return _view(copy.deepcopy(state), now)


def restore_save(path, state):
    """Accept only game shaped data from an Umbra backup."""
    if not isinstance(state, dict) or state.get("version") != 1:
        raise ValueError("Invalid Outpost save.")
    resources, stations = state.get("resources"), state.get("stations")
    if not isinstance(resources, dict) or not isinstance(stations, dict):
        raise ValueError("Invalid Outpost save.")
    clean = fresh(time.time())
    for key in RESOURCES:
        value = resources.get(key)
        if type(value) not in (int, float) or not 0 <= value <= 250:
            raise ValueError("Invalid Outpost resources.")
        clean["resources"][key] = value
    for key in STATIONS:
        value = stations.get(key)
        if type(value) is not int or not 0 <= value <= 5:
            raise ValueError("Invalid Outpost stations.")
        clean["stations"][key] = value
    clean["completed"] = [key for key in state.get("completed", []) if key in ROUTES]
    active = state.get("active")
    if isinstance(active, dict) and active.get("route") in ROUTES and type(active.get("step")) is int and active["step"] in (0, 1) and type(active.get("ready")) in (int, float):
        clean["active"] = {"route": active["route"], "step": active["step"], "ready": active["ready"]}
    clean["log"] = [str(line)[:250] for line in state.get("log", [])[:12] if isinstance(line, str)]
    clean["updated"] = min(time.time(), max(0, float(state.get("updated", time.time()))))
    with LOCK:
        _save(path, clean)
