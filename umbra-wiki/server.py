#!/usr/bin/env python3
"""Umbra Wiki backend.

Serves the UI, runs kiwix-serve over the offline library, and answers
questions: search the archives, pull the most relevant passage from the top
sources, and stream Gemma's answer back as NDJSON events.

Everything listens on 127.0.0.1 only. In LOCAL mode nothing leaves the
machine; ONLINE mode, switched on per question from the UI, also searches
Wikipedia.
"""

import glob
import html
import json
import math
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import maps  # noqa: E402  (offline maps: maps.py next to this file)

HOME = os.path.expanduser("~")
APP_DIR = os.path.dirname(os.path.abspath(__file__))
UI_DIR = os.path.join(APP_DIR, "ui")
# Installed as a system package (the AUR's umbra-wiki) rather than run from
# the Omarchy plugin folder or a clone: removal then goes through pacman.
PACKAGED = APP_DIR.startswith("/usr/")
CONFIG_DIR = os.path.join((os.environ.get("XDG_CONFIG_HOME") or os.path.join(HOME, ".config")), "umbra-wiki")
DATA_DIR = os.path.join((os.environ.get("XDG_DATA_HOME") or os.path.join(HOME, ".local", "share")), "umbra-wiki")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")      # model, libraryDir (set by setup)
SETTINGS_FILE = os.path.join(CONFIG_DIR, "settings.json")  # theme, muted (changed from the UI)
CUSTOM_THEMES_FILE = os.path.join(CONFIG_DIR, "themes.json")  # themes made in the editor


def read_json(path, default):
    try:
        with open(path) as f:
            value = json.load(f)
        return value if isinstance(value, dict) else default
    except (OSError, ValueError):
        return default


# Settings are read, changed and written back by several requests at once
# (the tour saves theme, scenario and personality in quick succession), so
# those updates take turns; each write goes through its own temporary file
# and an atomic rename, so a crash never leaves a half-written file.
SETTINGS_LOCK = threading.Lock()


def write_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp, "w") as f:
        json.dump(value, f, indent=2)
    os.replace(tmp, path)


CONFIG = read_json(CONFIG_FILE, {})
LIBRARY_DIR = os.path.expanduser(CONFIG.get("libraryDir") or os.path.join(HOME, "UmbraWiki", "library"))

HOST = "127.0.0.1"
PORT = int(os.environ.get("UMBRA_PORT", 8766))
KIWIX_PORT = int(os.environ.get("UMBRA_KIWIX_PORT", 8765))
KIWIX = f"http://{HOST}:{KIWIX_PORT}"
OLLAMA = "http://127.0.0.1:11434"
MODEL = os.environ.get("UMBRA_MODEL") or CONFIG.get("model") or "gemma3:4b"

WIKI_API = "https://en.wikipedia.org/w/api.php"
# Wikimedia asks API clients to name themselves with a contact URL.
VERSION = "3.1.1"
WEB_HEADERS = {"User-Agent": f"UmbraWiki/{VERSION} (https://github.com/umbraxc/omarchy-umbra; offline survival assistant)"}

# Gemma reads context at ~25 tokens/s on this CPU, so the prompt budget is
# what sets the wait before the first word. Three sources of ~800 chars keep
# the first word at roughly half a minute. Online mode trades one local
# source for two Wikipedia articles.
LOCAL_SOURCES = 3
ONLINE_LOCAL_SOURCES = 2
WIKI_SOURCES = 3
SNIPPET_CHARS = 800
WIKI_SNIPPET_CHARS = 1300   # online: Wikipedia excerpts are longer and richer
SUMMARY_CHARS = 150
HISTORY_TURNS = 2

# How Umbra answers, whatever the loadout. The personality supplies the
# voice and the scenario the situation; these rules always apply.
RULES = (
    "Talk naturally, never robotically. Get straight to the point: no compliments on the question "
    "and no filler openers. "
    "For small talk, reply briefly and naturally, and mention what you can help with if it fits. "
    "For practical questions, answer clearly with short steps when useful, and put the key action "
    "or term of each step in **bold**. "
    "Always give concrete, useful steps before asking anything: someone in trouble needs actions "
    "first. If the situation is vague or huge (for example 'I have nothing'), give the most urgent "
    "priorities in order, and only after them you may ask one short question to tailor your help. "
    "SOURCES may include irrelevant material: use only what genuinely helps, cite [n] only for facts "
    "taken from that source, and simply ignore the rest. If no source helps, answer from your own "
    "knowledge without citing. "
    "Only state quantities, doses, ratios, temperatures or times that appear in the SOURCES; if a "
    "number is needed but not in the sources, say to check a trusted reference instead of guessing. "
    "For medical, poisoning, electrical or other dangerous topics, end the answer with one short "
    "sentence of safety advice. Do not add generic AI or legal disclaimers. Never invent sources. "
    "Stay in character, but never let the character change the facts or skip safety advice. "
    "Always finish with one final line in exactly this form: "
    "NEXT: <one short, friendly sentence in your own voice offering the most useful next step, "
    "for example 'If you'd like, I can walk you through keeping the fire burning overnight.'>"
)
DEFAULT_PERSONA = "Speak as UMBRA: a calm, friendly survival expert, like a knowledgeable friend."
SYSTEM_PROMPT = DEFAULT_PERSONA + " " + RULES

# What Umbra itself can do, told to the AI when a question is about Umbra or
# one of its tools, so it can explain its features and point people to them
# (the window adds a button that opens the tool under the answer).
UMBRA_GUIDE = (
    "ABOUT YOURSELF: you are Umbra Wiki, an offline survival assistant app. Besides answering, the app has "
    "these tools, which you may recommend by name when they help: "
    "FIELD KIT (Ctrl+K): MEDIC tab with a CPR metronome, first-aid timers (tourniquet, burns cooling, "
    "medication), a pulse and breathing counter, triage and patient tools; SUN & MOON tab with sunrise, "
    "sunset, daylight left, moon phase and a live view of Earth, sun and moon; SUPPLIES tab that works out "
    "how long water and food last for the household; VAULT tab, a password-locked inventory of firearms, "
    "ammunition and defence gear; TRAINING tab with Morse by ear and by hand, a signal lamp, the phonetic "
    "alphabet, radio procedure, drills and knots; CARDS tab that prints pocket cards. "
    "MAPS (Ctrl+G): offline world map, downloadable detailed areas, search, coordinates and MGRS, "
    "waypoints, measuring, clickable country files with facts, and safety levels per country. "
    "SIGNALS & RADAR: nearby Wi-Fi and Bluetooth signals placed around you by strength, and the device's "
    "vitals. LIBRARY (Ctrl+L): offline collections and the built-in Umbra Field Manual. HISTORY (Ctrl+H) "
    "with folders; PROFILE and LOADOUT (scenarios, personalities, achievements); THEMES (Ctrl+T); "
    "SETTINGS with search. Everything works offline; only online mode, downloads and the update check use "
    "the internet. In the prompt, Tab opens quick actions. When you mention a tool, name it exactly as above."
)
ABOUT_UMBRA = re.compile(r"\b(umbra|this app|the app|your (features|tools|functions)|what can you do|what are you|who are you|"
                         r"how do (i|you) use|field kit|medic tab|vault|radar|sun (and|&) moon|pocket cards?|morse trainer|"
                         r"settings|shortcut|offline map|waypoint|help me with the app)\b", re.I)

STOPWORDS = set("""
a an the and or but if then so of to in on at by for from with without about into over under
is are was were be been being am do does did doing have has had having can could should would
will shall may might must i me my we our you your he she it they them their this that these those
what which who whom whose when where why how there here any some all no not very just also too
please tell explain give show want need know make get use using way ways best good
""".split())

kiwix_proc = None


# --------------------------------------------------------------- kiwix-serve

def start_kiwix():
    global kiwix_proc
    zims = sorted(glob.glob(os.path.join(LIBRARY_DIR, "*.zim")))
    if not zims:
        print("umbra: no .zim files in", LIBRARY_DIR, file=sys.stderr)
        return 0
    kiwix_proc = subprocess.Popen(
        ["kiwix-serve", "--address", HOST, "--port", str(KIWIX_PORT), *zims],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    for _ in range(100):
        try:
            urllib.request.urlopen(KIWIX + "/", timeout=1)
            break
        except Exception:
            time.sleep(0.2)
    return len(zims)


def reload_library():
    """New archives arrived: restart only kiwix-serve, so answers and model
    downloads in progress carry on."""
    global kiwix_proc
    if kiwix_proc and kiwix_proc.poll() is None:
        kiwix_proc.terminate()
        try:
            kiwix_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            kiwix_proc.kill()
    return start_kiwix()


def stop_kiwix(*_):
    maps.SHUTDOWN.set()
    if kiwix_proc and kiwix_proc.poll() is None:
        kiwix_proc.terminate()
    sys.exit(0)


def fetch(url, timeout=30, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


# --------------------------------------------------------------------- maps

MAPS = None   # set up once the data folder is known (below)
WAYPOINTS_FILE = os.path.join(DATA_DIR, "waypoints.json")
WAYPOINT_ICONS = ("pin", "objective", "friendly", "enemy", "danger", "rally", "lz", "medic", "cache", "water", "food",
                  "op", "checkpoint", "camp", "home")
WAYPOINT_COLORS = ("red", "orange", "yellow", "green", "cyan", "blue", "violet", "ink")


def get_waypoints():
    wps = read_json(WAYPOINTS_FILE, {}).get("waypoints", [])
    return wps if isinstance(wps, list) else []


def save_waypoints(items):
    """The user's waypoints on the map, checked like everything else."""
    if not isinstance(items, list):
        raise ValueError("bad waypoints")
    clean = []
    for w in items[:500]:
        if not isinstance(w, dict):
            continue
        try:
            lat, lon = float(w.get("lat")), float(w.get("lon"))
        except (TypeError, ValueError):
            continue
        if not (-85 <= lat <= 85 and -180 <= lon <= 180):
            continue
        wid = str(w.get("id") or "")
        if not re.fullmatch(r"[a-z0-9]{4,24}", wid):
            continue
        clean.append({"id": wid, "name": re.sub(r"\s+", " ", str(w.get("name") or "Waypoint")).strip()[:40],
                      "lat": round(lat, 6), "lon": round(lon, 6),
                      "icon": w.get("icon") if w.get("icon") in WAYPOINT_ICONS else "medic" if w.get("icon") == "medical" else "pin",
                      "color": w.get("color") if w.get("color") in WAYPOINT_COLORS else "",
                      "note": str(w.get("note") or "").strip()[:200],
                      "created": int(w.get("created") or time.time() * 1000)})
    write_json(WAYPOINTS_FILE, {"waypoints": clean})
    for w in clean:
        record("waypoints", w["id"])
    return clean


# ------------------------------------------------------------------- vault

# The Field Kit's Vault: the user's own inventory of firearms, ammunition and
# defence gear. Behind the lock password when one is set (checked here for
# every read and write); the file is readable by the user only. Not
# encrypted: the password keeps the screen private, like the lock screen.
VAULT_FILE = os.path.join(DATA_DIR, "vault.json")
VAULT_KINDS = ("weapon", "ammo", "gear")


def get_vault():
    items = read_json(VAULT_FILE, {}).get("items", [])
    return items if isinstance(items, list) else []


def save_vault(items):
    if not isinstance(items, list):
        raise ValueError("bad vault")
    clean = []
    num = lambda v, hi: max(0, min(hi, int(v))) if isinstance(v, (int, float)) and not isinstance(v, bool) else 0
    text = lambda v, n: re.sub(r"\s+", " ", str(v or "")).strip()[:n]
    for it in items[:400]:
        if not isinstance(it, dict) or it.get("kind") not in VAULT_KINDS:
            continue
        iid = str(it.get("id") or "")
        if not re.fullmatch(r"[a-z0-9]{4,24}", iid):
            continue
        clean.append({"id": iid, "kind": it["kind"], "model": re.sub(r"[^a-z0-9-]", "", str(it.get("model") or ""))[:40],
                      "name": text(it.get("name"), 60) or "Item", "calibre": text(it.get("calibre"), 40),
                      "count": num(it.get("count"), 99999), "serial": text(it.get("serial"), 40),
                      "where": text(it.get("where"), 60), "condition": text(it.get("condition"), 20),
                      "notes": str(it.get("notes") or "").strip()[:400], "added": num(it.get("added"), 10**14) or int(time.time() * 1000)})
    write_json(VAULT_FILE, {"items": clean})
    try:
        os.chmod(VAULT_FILE, 0o600)
    except OSError:
        pass
    return clean


# ------------------------------------------------------------------ safety

# How safe the user considers each country (their own judgement, shown as a
# coloured overlay on the map): {"levels": {"NLD": 1, ...}}, 1 safe .. 4 danger.
SAFETY_FILE = os.path.join(DATA_DIR, "safety.json")


def get_safety():
    levels = read_json(SAFETY_FILE, {}).get("levels", {})
    return {"levels": {k: v for k, v in levels.items() if isinstance(v, int) and 1 <= v <= 4}}


def save_safety(levels):
    if not isinstance(levels, dict):
        raise ValueError("bad safety levels")
    clean = {}
    for k, v in list(levels.items())[:300]:
        if re.fullmatch(r"[A-Z0-9]{3}", str(k)) and isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 4:
            clean[str(k)] = v
    write_json(SAFETY_FILE, {"levels": clean})
    return {"levels": clean}


# ---------------------------------------------------------------- supplies

# The Field Kit's supply list: who's in the household and what's stored.
# The calculation happens in the window; this keeps it (and backs it up).
SUPPLIES_FILE = os.path.join(DATA_DIR, "supplies.json")
HOUSEHOLD_KEYS = ("adults", "teens", "children", "toddlers", "infants", "elderly", "dogsSmall", "dogsLarge", "cats")


def get_supplies():
    return read_json(SUPPLIES_FILE, {})


def save_supplies(data):
    if not isinstance(data, dict):
        raise ValueError("bad supplies")
    num = lambda v, lo, hi: max(lo, min(hi, float(v))) if isinstance(v, (int, float)) and not isinstance(v, bool) else lo
    hh = data.get("household") if isinstance(data.get("household"), dict) else {}
    items = []
    for it in (data.get("items") or [])[:300]:
        if not isinstance(it, dict):
            continue
        items.append({"id": re.sub(r"[^a-z0-9]", "", str(it.get("id", "")))[:24] or f"i{len(items)}",
                      "kind": re.sub(r"[^a-z0-9_]", "", str(it.get("kind", "custom")))[:24] or "custom",
                      "name": re.sub(r"\s+", " ", str(it.get("name", "")))[:60],
                      "qty": num(it.get("qty"), 0, 1e6), "kcal": num(it.get("kcal"), 0, 1e7),
                      "litres": num(it.get("litres"), 0, 1e6), "expires": str(it.get("expires", ""))[:10]})
    clean = {"household": {k: int(num(hh.get(k), 0, 99)) for k in HOUSEHOLD_KEYS},
             "climate": data.get("climate") if data.get("climate") in ("cold", "temperate", "hot") else "temperate",
             "activity": data.get("activity") if data.get("activity") in ("rest", "moderate", "heavy") else "moderate",
             "target": int(num(data.get("target"), 1, 365)) or 14, "items": items}
    write_json(SUPPLIES_FILE, clean)
    return clean


# ------------------------------------------------------------ pocket cards

def _card_html(md):
    """The field manual's light Markdown as HTML, for printed cards."""
    out, in_list = [], None
    for line in str(md).splitlines():
        t = html.escape(line.strip())
        t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
        m = re.match(r"^(\d+)\.\s+(.*)", t)
        if t.startswith(("- ", "* ")) or m:
            kind = "ol" if m else "ul"
            if in_list != kind:
                if in_list:
                    out.append(f"</{in_list}>")
                out.append(f"<{kind}>")
                in_list = kind
            out.append(f"<li>{m.group(2) if m else t[2:]}</li>")
            continue
        if in_list:
            out.append(f"</{in_list}>")
            in_list = None
        if t.startswith("#"):
            out.append(f"<h3>{t.lstrip('#').strip()}</h3>")
        elif t:
            out.append(f"<p>{t}</p>")
    if in_list:
        out.append(f"</{in_list}>")
    return "\n".join(out)


def pocket_cards(req, folder):
    """Printable pocket cards (A6, four to an A4 page, with cut lines): field
    manual pages, waypoints with MGRS, the supply summary and emergency
    contacts. Written as a web page: open it and print."""
    cards = []
    wanted = set(str(x) for x in (req.get("pages") or [])[:40])
    for page in field_manual():
        if page.get("id") in wanted:
            cards.append((page["title"], page.get("category", "Field manual"), _card_html(page.get("body", ""))))
    wps = [w for w in (req.get("waypoints") or [])[:60] if isinstance(w, dict)]
    if wps:
        rows = "".join(f"<tr><td><b>{html.escape(str(w.get('name', ''))[:40])}</b><br><small>{html.escape(str(w.get('note', ''))[:80])}</small></td>"
                       f"<td>{html.escape(str(w.get('coords', ''))[:40])}<br>{html.escape(str(w.get('mgrs', ''))[:30])}</td></tr>" for w in wps)
        cards.append(("Waypoints", "Maps", f"<table>{rows}</table>"))
    for key, title, cat in (("supplies", "Supplies", "Field kit"), ("contacts", "Emergency contacts", "Field kit"),
                            ("notes", "Notes", "Field kit")):
        text = str(req.get(key) or "").strip()[:3000]
        if text:
            cards.append((title, cat, _card_html(text)))
    if not cards:
        raise ValueError("nothing to print")
    stamp = time.strftime("%Y-%m-%d")
    body = "".join(f'<section class="card"><header><span>{html.escape(cat).upper()}</span><span>UMBRA</span></header>'
                   f"<h2>{html.escape(title)}</h2><div>{content}</div>"
                   f'<footer>Umbra Wiki pocket card · {stamp} · check critical steps; call emergency services when you can</footer></section>'
                   for title, cat, content in cards)
    page = f"""<!doctype html><html><head><meta charset="utf-8"><title>Umbra pocket cards {stamp}</title><style>
@page {{ size: A4; margin: 8mm; }}
body {{ margin: 0; font: 9pt/1.35 "DejaVu Sans Mono", "JetBrains Mono", monospace; color: #111; background: #fff; }}
.sheet {{ display: grid; grid-template-columns: repeat(2, 1fr); gap: 0; }}
.card {{ box-sizing: border-box; height: 138mm; padding: 5mm 6mm; border: 0.3mm dashed #999; overflow: hidden; break-inside: avoid; display: flex; flex-direction: column; }}
.card header {{ display: flex; justify-content: space-between; font-size: 7pt; letter-spacing: .2em; border-bottom: 0.6mm solid #111; padding-bottom: 1.5mm; }}
.card h2 {{ font-size: 12pt; margin: 2.5mm 0 2mm; letter-spacing: .04em; }}
.card div {{ flex: 1; font-size: 8.4pt; }}
.card ul, .card ol {{ margin: 1mm 0; padding-left: 5mm; }} .card li {{ margin: .6mm 0; }}
.card p {{ margin: 1mm 0; }} .card h3 {{ font-size: 9pt; margin: 2mm 0 1mm; }}
.card table {{ width: 100%; border-collapse: collapse; font-size: 7.8pt; }} .card td {{ border-bottom: .2mm solid #ccc; padding: 1mm 0; vertical-align: top; }}
.card footer {{ font-size: 6.2pt; color: #555; border-top: .2mm solid #999; padding-top: 1mm; }}
.hint {{ padding: 6mm; font-size: 10pt; }} @media print {{ .hint {{ display: none; }} }}
</style></head><body><p class="hint">Print this page (Ctrl+P), cut along the dashed lines, and keep the cards dry, e.g. in a zip bag.</p>
<div class="sheet">{body}</div></body></html>"""
    path = os.path.join(folder, f"Umbra pocket cards {stamp}.html")
    with open(path, "w", encoding="utf-8") as f:
        f.write(page)
    return {"path": path.replace(HOME, "~", 1), "count": len(cards)}


# ------------------------------------------------------------------ updates

RELEASES_API = "https://api.github.com/repos/umbraxc/omarchy-umbra/releases/latest"


def install_kind():
    """How this copy was installed, which decides how it's updated."""
    if PACKAGED:
        return "package"
    return "omarchy" if "/omarchy/plugins/" in APP_DIR else "clone"


def check_update():
    """Only when asked (Settings → Check for updates): the newest release on
    GitHub. Nothing about the user is sent; offline, it just says so."""
    kind = install_kind()
    try:
        release = json.loads(fetch(RELEASES_API, timeout=8, headers={
            "Accept": "application/vnd.github+json", "User-Agent": "umbra-wiki/" + VERSION}))
    except Exception:
        return {"current": VERSION, "kind": kind, "error": "offline"}
    latest = str(release.get("tag_name", "")).lstrip("v")
    as_tuple = lambda v: tuple(int(x) for x in re.findall(r"\d+", v)[:3])
    return {"current": VERSION, "kind": kind, "latest": latest,
            "newer": bool(latest) and as_tuple(latest) > as_tuple(VERSION),
            "url": str(release.get("html_url", ""))[:200], "published": str(release.get("published_at", ""))[:10]}


# ------------------------------------------------------------------ retrieval

def keywords(question):
    words = re.findall(r"[a-zA-Z][a-zA-Z'-]+", question.lower())
    return [w for w in words if w not in STOPWORDS and len(w) > 2]


def search(terms, count=10):
    q = urllib.parse.quote(" ".join(terms))
    xml = fetch(f"{KIWIX}/search?pattern={q}&pageLength={count}&format=xml")
    results = []
    for item in re.findall(r"(?s)<item>(.*?)</item>", xml):
        link = re.search(r"<link>(.*?)</link>", item)
        title = re.search(r"<title>(.*?)</title>", item)
        book = re.search(r"(?s)<book>\s*<title>(.*?)</title>", item)
        desc = re.search(r"(?s)<description>(.*?)</description>", item)
        if not link:
            continue
        results.append({
            "title": html.unescape(title.group(1)) if title else "Untitled",
            "url": html.unescape(link.group(1)),
            "archive": html.unescape(book.group(1)) if book else "",
            "snippet": re.sub(r"<[^>]+>", "", html.unescape(desc.group(1))) if desc else "",
        })
    return results


def local_sources(terms, limit):
    """Best archive pages for the question's terms.

    Full-text search needs every term to match, which often finds nothing
    for natural questions. So word pairs and single words are searched too,
    and every candidate is ranked by how many terms its title and snippet
    contain: a term in the title counts most.
    """
    from itertools import combinations

    topical = [t for t in terms if t not in GENERIC] or terms
    queries = [terms]
    if len(topical) > 1:
        queries += [list(c) for c in combinations(topical, 2)]
    queries += [[t] for t in topical]

    stems = [t[:5] for t in topical]
    candidates = {}
    for q in queries:
        for r in search(q, count=8):
            if r["url"] in candidates:
                continue
            title, snippet = r["title"].lower(), r["snippet"].lower()
            r["score"] = sum(3 for st in stems if st in title) + sum(1 for st in stems if st in snippet)
            candidates[r["url"]] = r
        if len([c for c in candidates.values() if c["score"] >= 4]) >= limit * 2:
            break  # plenty of strong matches already

    ranked = sorted(candidates.values(), key=lambda r: r["score"], reverse=True)
    picked, per_archive, seen = [], {}, set()
    for r in ranked:
        if r["score"] < 2:
            break
        key = clean_title(r["title"]).lower()
        if key in seen or per_archive.get(r["archive"], 0) >= 2:
            continue
        seen.add(key)
        per_archive[r["archive"]] = per_archive.get(r["archive"], 0) + 1
        try:
            passage, summary = best_passage(page_text(r["url"]), terms)
        except Exception:
            passage, summary = "", ""
        picked.append({
            "kind": "local", "title": clean_title(r["title"]), "archive": r["archive"],
            "url": KIWIX + r["url"], "passage": passage, "summary": summary,
        })
        if len(picked) == limit:
            break
    return picked


def wiki_sources(terms, limit):
    def wget(params):
        url = f"{WIKI_API}?{urllib.parse.urlencode({**params, 'format': 'json', 'utf8': 1})}"
        try:
            return json.loads(fetch(url, timeout=8, headers=WEB_HEADERS))
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(1.5)   # rate limited: one polite retry
            return json.loads(fetch(url, timeout=8, headers=WEB_HEADERS))

    def wsearch(text, count):
        return wget({"action": "query", "list": "search", "srsearch": text, "srlimit": count})["query"]["search"]

    hits = wsearch(" ".join(terms), 8)
    # The main article on the topic itself ("Hypothermia") often ranks below
    # niche ones in full-text search. The topic is the question word the
    # results' titles share most; it's looked up on its own too.
    topical = [t for t in terms if t not in GENERIC] or terms
    topic = max(topical, key=lambda t: (sum(1 for h in hits if t[:5] in h["title"].lower()), len(t)))
    try:
        hits += wsearch(topic, 2)
    except Exception:
        pass
    unique = {}
    for h in hits:
        unique.setdefault(h["title"], h)
    hits = list(unique.values())
    stems = [t[:5] for t in terms]
    need = min(2, len(stems))

    def relevance(hit):
        title = hit["title"].lower()
        snippet = re.sub(r"<[^>]+>", "", hit.get("snippet", "")).lower()
        score = sum(1 for st in stems if st in title) * 2 + sum(1 for st in stems if st in snippet)
        words = title.split()
        # A general article named after the topic itself ("Hypothermia").
        if len(words) <= 2 and any(w.startswith(topic[:5]) for w in words) \
                and all(any(w.startswith(st) for st in stems) for w in words):
            score += 5
        return score - max(0, len(words) - 3) * 0.5

    ranked = [h for h in hits
              if not re.match(r"(?i)(lists?|index|outline) of ", h["title"])
              and (relevance(h) >= 5
                   or sum(1 for st in stems if st in (h["title"] + " " + h.get("snippet", "")).lower()) >= need)]
    ranked.sort(key=relevance, reverse=True)

    sources = []
    for hit in ranked[:limit]:
        title = hit["title"]
        try:
            pages = wget({"action": "query", "prop": "extracts", "explaintext": 1, "exsectionformat": "plain",
                          "titles": title})["query"]["pages"]
        except Exception:
            continue   # one article failing (or rate limiting) shouldn't lose the rest
        text = next(iter(pages.values())).get("extract", "")
        passage, summary = best_passage(text, terms, WIKI_SNIPPET_CHARS)
        sources.append({
            "kind": "wiki", "title": title, "archive": "Wikipedia (online)",
            "url": "https://en.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
            "passage": passage, "summary": summary,
        })
    return sources


def page_text(url):
    raw = fetch(KIWIX + url)
    raw = re.sub(r"(?is)<(script|style|nav|header|footer)[^>]*>.*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>|</(p|li|h\d|tr|div)>", "\n", raw)
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    text = re.sub(r"[ \t\r\f\v]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n", text).strip()


NOISE = re.compile(
    r"(?i)\b(edited|asked|answered|modified)\b.*\d{2}|\bviewed\b.*times|\bshare\b.*\bfollow\b|"
    r"improve this|add a comment|stack exchange|creative commons|all rights reserved|cookie|"
    r"^\s*\d+\s*(votes?|answers?)\b|reputation|sign up|log in|\bupvote|\bdownvote")

SITE_SUFFIX = re.compile(r"\s+[-–|]\s+(The Great Outdoors|Seasoned Advice|[\w &]+)\s+Stack Exchange\s*$", re.I)


def clean_title(title):
    """Readable title: no site suffixes, path pieces, underscores or dash runs."""
    t = SITE_SUFFIX.sub("", html.unescape(title))
    t = t.split("/")[-1] if "/" in t and " " not in t else t
    t = re.sub(r"[_]+", " ", t)
    t = re.sub(r"\s*[-–—|]{2,}\s*", " ", t)
    t = re.sub(r"\s+", " ", t).strip(" -–—|/")
    return t[:1].upper() + t[1:] if t else "Untitled"


def shorten(text, limit):
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s+([,.;:!?)])", r"\1", text)
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].rstrip(",;:-–")
    return cut + "…"


def best_passage(text, terms, limit=SNIPPET_CHARS):
    """(passage, summary): the sentences that best answer the question, kept
    in page order, and the single most relevant sentence as a summary.

    Scores each sentence on its own so the best lines can come from anywhere
    on the page. On Q&A pages the question itself repeats the search words,
    so everything before its "asked ..." line is skipped in favour of answers.
    """
    asked = re.search(r"(?i)\basked\b [A-Z][a-z]{2} \d{1,2}", text)
    if asked and asked.start() < len(text) * 0.6:
        text = text[asked.end():]

    # Reference markers like "[ 1 ]" are noise; "e.g." and "i.e." are not sentence ends.
    text = re.sub(r"\[\s*\d+\s*\]", "", text)
    text = re.sub(r"\be\.g\.", "for example", text)
    text = re.sub(r"\bi\.e\.", "that is", text)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n", text)]
    sentences = [s for s in sentences if 25 <= len(s) <= 400 and not NOISE.search(s)]
    if not sentences:
        return text[:limit], shorten(text, SUMMARY_CHARS)

    stems = [t[:5] for t in terms]
    scored = []
    for i, sent in enumerate(sentences):
        low = sent.lower()
        hits = sum(1 for st in stems if st in low)
        # Neighbours carry context: a sentence right after a strong one is
        # usually its explanation.
        prev = sum(1 for st in stems if i and st in sentences[i - 1].lower())
        score = hits * 2 + prev * 0.5 + min(len(sent), 200) / 200
        scored.append((score, i))

    ranked = sorted(scored, reverse=True)
    picked, used = [], 0
    for score, i in ranked:
        if score < 1 or used + len(sentences[i]) > limit:
            continue
        picked.append(i)
        used += len(sentences[i]) + 1
    if not picked:
        picked = [ranked[0][1]]
    passage = " ".join(sentences[i] for i in sorted(picked))
    # Summaries read better from a statement than from a question.
    summary = next((sentences[i] for _, i in ranked if not sentences[i].endswith("?")), sentences[ranked[0][1]])
    return passage, shorten(summary, SUMMARY_CHARS)


SMALL_TALK = re.compile(
    r"(?i)^\W*(hi|hey|hello|yo|hiya|good (morning|afternoon|evening|night)|thanks?( you)?|thank you|"
    r"cheers|ok(ay)?|cool|nice|great|how are (you|u)|how'?s it going|what'?s up|who are you|"
    r"what are you|what can you do|what do you do|bye|goodbye|see you)\b")

# Words that match everything in a full-text search but carry no topic.
GENERIC = set("nothing something anything everything help start scratch stuff thing things "
              "situation basically really".split())


CHAT_WORDS = set("""hi hey hello yo hiya good morning afternoon evening night thanks thank cheers okay cool
nice great how's hows going what's whats who are doing today there umbra bye goodbye see later
awesome perfect""".split())


def is_small_talk(question):
    """Greetings and chit-chat: nothing left once chat words are removed."""
    topical = [w for w in keywords(question) if w not in CHAT_WORDS]
    return not topical and (bool(SMALL_TALK.match(question)) or len(question.split()) <= 4)


def relevant(source, terms):
    """Keep a source only if it is plausibly about the question."""
    topical = [t[:5] for t in terms if t not in GENERIC] or [t[:5] for t in terms]
    title = source["title"].lower()
    body = (source["passage"] + " " + source["summary"]).lower()
    in_title = sum(1 for t in topical if t in title)
    in_body = sum(1 for t in topical if t in body)
    return in_title >= 1 or in_body >= max(2, (len(topical) + 1) // 2)


def find_sources(question, online):
    terms = keywords(question) or question.split()
    sources = manual_sources(terms)
    try:
        sources += local_sources(terms, ONLINE_LOCAL_SOURCES if online else LOCAL_SOURCES) if kiwix_proc else []
    except Exception:
        pass
    notice = ""
    if online:
        try:
            sources += wiki_sources(terms, WIKI_SOURCES)
        except Exception:
            notice = "Wikipedia could not be reached; answered from local archives only."
    return [src for src in sources if relevant(src, terms)], notice


def netinfo():
    """Active connection name and Wikipedia round-trip time, for the header."""
    name = ""
    try:
        out = subprocess.run(["nmcli", "-t", "-f", "NAME,TYPE", "connection", "show", "--active"],
                             capture_output=True, text=True, timeout=3).stdout
        for line in out.splitlines():
            conn, _, kind = line.rpartition(":")
            if kind in ("802-11-wireless", "802-3-ethernet", "gsm", "wireguard") or "ethernet" in kind:
                name = conn.replace("\\:", ":")
                break
    except Exception:
        pass
    t0 = time.time()
    ok = internet_ok()
    return {"online": ok, "name": name, "ms": round((time.time() - t0) * 1000) if ok else None}


def library():
    """Installed archives and the catalog's collections not yet installed."""
    try:
        catalog = json.load(open(os.path.join(APP_DIR, "library.json")))
    except (OSError, ValueError):
        catalog = []
    files = sorted(os.path.basename(f) for f in glob.glob(os.path.join(LIBRARY_DIR, "*.zim")))
    installed, known = [], set()
    for f in files:
        entry = next((c for c in catalog if f.startswith(c["id"])), None)
        if entry:
            known.add(entry["id"])
        installed.append({
            "file": f, "name": entry["name"] if entry else clean_title(f.rsplit(".", 1)[0]),
            "description": entry["description"] if entry else "",
            "size": os.path.getsize(os.path.join(LIBRARY_DIR, f)),
        })
    available = [c for c in catalog if c["id"] not in known]
    shown = "~" + LIBRARY_DIR[len(HOME):] if LIBRARY_DIR.startswith(HOME) else LIBRARY_DIR
    return {"dir": shown, "installed": installed, "available": available}


SOUNDS_DIR = os.path.join(APP_DIR, "sounds")
_last_sound = {}


_hum = None


def audio_devices():
    """Speakers/headphones and microphones known to PipeWire (via pactl)."""
    def listing(kind):
        try:
            out = subprocess.run(["pactl", "-f", "json", "list", kind], capture_output=True, text=True, timeout=4).stdout
            return [{"name": d["name"], "description": d.get("description") or d["name"]}
                    for d in json.loads(out or "[]") if not d["name"].endswith(".monitor")]
        except (OSError, ValueError, subprocess.SubprocessError, KeyError):
            return []
    settings = read_json(SETTINGS_FILE, {})
    return {"outputs": listing("sinks"), "inputs": listing("sources"),
            "out": settings.get("audioOut", ""), "in": settings.get("audioIn", ""), **sound_player()}


def sound_player():
    """Which program plays Umbra's sounds, and the command that installs one
    when there is none (the package lists them as optional)."""
    found = player(os.devnull)
    if found:
        return {"player": found[0], "fix": ""}
    runtime = os.environ.get("XDG_RUNTIME_DIR") or "/tmp"
    pipewire = os.path.exists(os.path.join(runtime, "pipewire-0"))
    return {"player": "", "fix": "sudo pacman -S --needed " + ("pipewire-audio" if pipewire else "libpulse")}


def set_audio(out=None, source=None):
    """Choose where Umbra plays and records ('' = the system default). The
    microphone is also given to voxtype, so F9 dictation uses the same one."""
    devices = audio_devices()
    update = {}
    if out is not None:
        if out and out not in [d["name"] for d in devices["outputs"]]:
            raise ValueError("unknown output")
        update["audioOut"] = out
    if source is not None:
        if source and source not in [d["name"] for d in devices["inputs"]]:
            raise ValueError("unknown input")
        update["audioIn"] = source
        if shutil.which("voxtype"):
            subprocess.run(["voxtype", "config", "set", "audio.device", source or "default"], capture_output=True, timeout=5)
            if voxtype_daemon():
                subprocess.run(["systemctl", "--user", "restart", "voxtype"], capture_output=True, timeout=10)
    with SETTINGS_LOCK:
        settings = read_json(SETTINGS_FILE, {})
        settings.update(update)
        write_json(SETTINGS_FILE, settings)
    return audio_devices()


def player(path):
    """The command that plays a sound: PipeWire's pw-play (to the chosen
    output), or PulseAudio's paplay on systems that don't run PipeWire."""
    runtime = os.environ.get("XDG_RUNTIME_DIR") or "/tmp"
    if shutil.which("pw-play") and os.path.exists(os.path.join(runtime, "pipewire-0")):
        return ["pw-play", *audio_target("audioOut"), "--volume", sound_volume(),
                "-P", "{ application.name = \"Umbra Wiki\" media.role = \"Notification\" }", path]
    if shutil.which("paplay"):
        return ["paplay", f"--volume={int(float(sound_volume()) * 65536)}", path]
    return None


def audio_target(key):
    """pw-play / pw-record arguments for the chosen device, if any."""
    name = read_json(SETTINGS_FILE, {}).get(key, "")
    return ["--target", name] if name else []


def sound_volume():
    """The volume chosen in Settings (0-1), 0.9 by default."""
    try:
        return f"{max(0.0, min(1.0, float(read_json(SETTINGS_FILE, {}).get('volume', 0.9)))):.2f}"
    except (TypeError, ValueError):
        return "0.90"


def hum(on):
    """Start or stop the quiet background hum while Umbra works."""
    global _hum
    if _hum and _hum.poll() is None:
        _hum.terminate()
    _hum = None
    path = os.path.join(SOUNDS_DIR, "hum.ogg")
    if on and os.path.isfile(path) and player(path):
        _hum = subprocess.Popen(player(path), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def play_sound(name):
    """Play a bundled sound through PipeWire (independent of the web view)."""
    path = os.path.join(SOUNDS_DIR, name + ".ogg")
    if not re.fullmatch(r"[a-z]{1,16}", name) or not os.path.isfile(path) or not player(path):
        return False
    now = time.monotonic()
    if now - _last_sound.get(name, 0) < 0.04:  # collapse accidental double triggers
        return True
    _last_sound[name] = now
    subprocess.Popen(player(path), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return True


OMARCHY_STATE = os.path.join(HOME, ".local", "state", "omarchy", "current")


def _rgb(hexcolor):
    h = hexcolor.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _hex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, round(c))) for c in rgb)


def _mix(a, b, t):
    ra, rb = _rgb(a), _rgb(b)
    return _hex([x + (y - x) * t for x, y in zip(ra, rb)])


def _hue(hexcolor):
    import colorsys
    r, g, b = (c / 255 for c in _rgb(hexcolor))
    h, l, sat = colorsys.rgb_to_hls(r, g, b)
    return h * 360, sat


def omarchy_theme():
    """An Umbra theme built from the current Omarchy theme's colors.toml."""
    import tomllib
    try:
        with open(os.path.join(OMARCHY_STATE, "theme", "colors.toml"), "rb") as f:
            c = tomllib.load(f)
        name = open(os.path.join(OMARCHY_STATE, "theme.name")).read().strip()
    except (OSError, ValueError):
        return None
    get = lambda key, fallback: c.get(key) if isinstance(c.get(key), str) and c.get(key).startswith("#") else fallback
    bg = get("darker_background", get("background", "#090909"))
    bg1 = get("dark_background", get("background", "#0d0d0d"))
    bg2 = get("background", bg1)
    bg3 = get("lighter_background", _mix(bg2, "#ffffff", 0.08))
    fg = get("foreground", "#cbcbcb")
    signal = get("accent", get("blue", "#e8d27c"))
    light = c.get("mode") == "light"
    edge = "#ffffff" if light else "#000000"
    # A second accent and an online colour that stand apart from the signal.
    sig_hue, _ = _hue(signal)
    def distinct(keys, fallback):
        for key in keys:
            value = get(key, None)
            if value:
                hue, sat = _hue(value)
                gap = abs(hue - sig_hue)
                if min(gap, 360 - gap) > 40 and sat > 0.25:
                    return value
        return fallback
    return {
        "id": "auto", "name": "Omarchy", "auto": True,
        "tagline": "Follows your Omarchy theme · " + name.replace("-", " ").title(),
        "bg": bg, "bg1": bg1, "bg2": bg2, "bg3": bg3,
        "line": get("selection", _mix(bg3, fg, 0.12)), "muted": get("muted", _mix(bg3, fg, 0.2)),
        "fg": fg, "fgBright": _mix(get("bright_foreground", fg), "#000000" if light else "#ffffff", 0.35),
        "dim": get("light_foreground", _mix(fg, bg, 0.3)), "faint": get("dark_foreground", _mix(fg, bg, 0.55)),
        "signal": signal, "shade1": _mix(signal, edge, 0.25), "shade2": _mix(signal, edge, 0.45),
        "shade3": _mix(signal, edge, 0.65),
        "accent": distinct(["yellow", "green", "magenta", "blue", "bright_yellow"], _mix(signal, fg, 0.5)),
        "red": get("red", "#e06a6a"),
        "net": distinct(["cyan", "bright_cyan", "blue", "bright_blue", "green"], "#5fb8c9"),
        "light": light,
    }


THEME_COLORS = ("bg", "bg1", "bg2", "bg3", "line", "muted", "fg", "fgBright", "dim", "faint",
                "signal", "shade1", "shade2", "shade3", "accent", "red", "net")
BASE_COLORS = ("background", "text", "main", "secondary", "online", "alert")
HEX = re.compile(r"#[0-9a-fA-F]{6}")


def custom_themes():
    try:
        with open(CUSTOM_THEMES_FILE) as f:
            themes = json.load(f)
        return themes if isinstance(themes, list) else []
    except (OSError, ValueError):
        return []


def save_custom_theme(theme):
    """Validate and store a theme from the editor; returns the stored list."""
    if not isinstance(theme, dict) or not re.fullmatch(r"custom-[a-z0-9-]{1,24}", str(theme.get("id", ""))):
        raise ValueError("bad theme id")
    clean = {"id": theme["id"], "name": str(theme.get("name", "Custom"))[:24] or "Custom",
             "tagline": "Your theme", "custom": True, "light": bool(theme.get("light"))}
    for key in THEME_COLORS:
        if not HEX.fullmatch(str(theme.get(key, ""))):
            raise ValueError(f"bad colour {key}")
        clean[key] = theme[key].lower()
    base = theme.get("base") or {}
    clean["base"] = {k: base[k].lower() for k in BASE_COLORS if HEX.fullmatch(str(base.get(k, "")))}
    themes = [t for t in custom_themes() if t.get("id") != clean["id"]] + [clean]
    write_json_list(CUSTOM_THEMES_FILE, themes)
    return themes


def delete_custom_theme(theme_id):
    themes = [t for t in custom_themes() if t.get("id") != theme_id]
    write_json_list(CUSTOM_THEMES_FILE, themes)
    settings = read_json(SETTINGS_FILE, {})
    if settings.get("theme") == theme_id:
        settings["theme"] = "umbra"
        write_json(SETTINGS_FILE, settings)
    return themes


def write_json_list(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.tmp"
    with open(tmp, "w") as f:
        json.dump(value, f, indent=2)
    os.replace(tmp, path)


# ------------------------------------------------------------------ loadout

LOADOUT_FILE = os.path.join(UI_DIR, "loadout.json")
PERSONALITIES_FILE = os.path.join(CONFIG_DIR, "personalities.json")  # made in the editor
TRAITS = ("Warmth", "Humor", "Brevity", "Caution", "Grit")


def custom_personalities():
    try:
        with open(PERSONALITIES_FILE) as f:
            items = json.load(f)
        return items if isinstance(items, list) else []
    except (OSError, ValueError):
        return []


def save_personality(item):
    if not isinstance(item, dict) or not re.fullmatch(r"custom-[a-z0-9-]{1,24}", str(item.get("id", ""))):
        raise ValueError("bad id")
    clean = {
        "id": item["id"], "custom": True,
        "name": str(item.get("name", "Custom"))[:28] or "Custom",
        "tagline": str(item.get("tagline", ""))[:48],
        "description": str(item.get("description", ""))[:400],
        "sample": str(item.get("sample", ""))[:120],
        "voice": str(item.get("voice", ""))[:400],
        "face": int(item.get("face", 0)) if str(item.get("face", "0")).isdigit() else 0,
        "stats": {t: max(1, min(5, int((item.get("stats") or {}).get(t, 3)))) for t in TRAITS},
    }
    items = [x for x in custom_personalities() if x.get("id") != clean["id"]] + [clean]
    write_json_list(PERSONALITIES_FILE, items)
    return items


def delete_personality(item_id):
    items = [x for x in custom_personalities() if x.get("id") != item_id]
    write_json_list(PERSONALITIES_FILE, items)
    with SETTINGS_LOCK:
        settings = read_json(SETTINGS_FILE, {})
        if settings.get("personality") == item_id:
            settings["personality"] = "umbra"
            write_json(SETTINGS_FILE, settings)
    return items


# ------------------------------------------------------------------ profile

# The user's own profile: a name Umbra calls them by, a few lines about
# them, an ASCII character and an optional picture. Stays on this computer.
PROFILE_FILE = os.path.join(CONFIG_DIR, "profile.json")


def get_profile():
    return read_json(PROFILE_FILE, {})


BLOOD_TYPES = ("A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-")
SKILLS = {"firstaid": "first aid", "navigation": "map and compass", "radio": "radio", "fire": "fire making",
          "shelter": "shelter building", "water": "water purification", "foraging": "foraging", "hunting": "hunting",
          "fishing": "fishing", "cooking": "cooking from scratch", "gardening": "growing food", "mechanics": "mechanics",
          "electrics": "electrics", "carpentry": "carpentry", "sewing": "sewing and mending", "defence": "self-defence"}


def save_profile(p):
    if not isinstance(p, dict):
        raise ValueError("bad profile")
    picture = str(p.get("picture") or "")
    if picture and (not re.match(r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$", picture)
                    or len(picture) > 600_000):
        raise ValueError("bad picture")
    character = p.get("character") if isinstance(p.get("character"), dict) else {}
    one_line = lambda key, n: re.sub(r"\s+", " ", str(p.get(key, "") or "")).strip()[:n]
    known = {a["id"] for a in achievement_catalog()["achievements"]}
    clean = {
        "name": one_line("name", 32),
        "callsign": one_line("callsign", 24),
        "about": str(p.get("about", "")).strip()[:500],
        "location": one_line("location", 80),
        "units": p.get("units") if p.get("units") in ("metric", "imperial") else "",
        "experience": p.get("experience") if p.get("experience") in ("new", "some", "experienced") else "",
        "household": one_line("household", 160),
        "health": str(p.get("health", "") or "").strip()[:300],
        "blood": p.get("blood") if p.get("blood") in BLOOD_TYPES else "",
        "allergies": one_line("allergies", 160),
        "meds": one_line("meds", 160),
        "contact": one_line("contact", 80),
        "skills": [k for k in dict.fromkeys(p.get("skills") or []) if k in SKILLS][:len(SKILLS)],
        "color": p.get("color") if p.get("color") in ("signal", "accent", "net", "red", "fg-bright") else "",
        "badges": [b for b in (p.get("badges") or [])[:5] if isinstance(b, str) and b in known],
        "character": {k: max(0, min(40, int(v))) for k, v in character.items()
                      if re.fullmatch(r"[a-z]{1,12}", str(k)) and str(v).isdigit()},
        "picture": picture,
        "since": p.get("since") if isinstance(p.get("since"), int) else get_profile().get("since") or int(time.time() * 1000),
    }
    write_json(PROFILE_FILE, clean)
    return clean


def profile_prompt():
    p = get_profile()
    lines = []
    if p.get("name"):
        lines.append(f"The user's name is {p['name']}; address them by name now and then, naturally.")
    if p.get("about"):
        lines.append(f"What the user says about themselves: {p['about']}")
    if p.get("location"):
        lines.append(f"Where the user lives (climate and region matter for advice): {p['location']}.")
    if p.get("units") == "imperial":
        lines.append("Give measurements in US units (°F, miles, feet, pounds, gallons), with metric in brackets where useful.")
    elif p.get("units") == "metric":
        lines.append("Give measurements in metric units (°C, km, metres, kg, litres).")
    if p.get("experience") == "new":
        lines.append("The user is new to survival and preparedness: explain terms and basics simply, step by step.")
    elif p.get("experience") == "experienced":
        lines.append("The user is experienced: skip the basics and be concise and technical.")
    if p.get("household"):
        lines.append(f"The user's household: {p['household']}. Plan for them too where it matters.")
    if p.get("health"):
        lines.append(f"Health notes the user shared, to keep in mind for medical and food advice: {p['health']}")
    if p.get("allergies"):
        lines.append(f"The user's allergies (never suggest these): {p['allergies']}.")
    if p.get("meds"):
        lines.append(f"Medication the user takes (mind interactions): {p['meds']}.")
    if p.get("blood"):
        lines.append(f"The user's blood type: {p['blood']}.")
    skills = [SKILLS[k] for k in p.get("skills") or [] if k in SKILLS]
    if skills:
        lines.append("Skills the user already has (build on them, skip the basics there): " + ", ".join(skills) + ".")
    return " ".join(lines)


# ------------------------------------------------------------- achievements

# Achievements: progress is counted as Umbra is used; once earned, an
# achievement is kept for good (deleting conversations doesn't take it away),
# is included in backups, and shows on the profile. Only Reset and Uninstall
# remove them. The catalog is achievements.json next to this file.
ACH_FILE = os.path.join(DATA_DIR, "achievements.json")
ACH_LOCK = threading.Lock()
_catalog = None
TOPICS = {
    "water": r"water|purif|filter|boil|dehydrat|well\b|thirst",
    "fire": r"fire|flame|tinder|kindling|ember|lighter|spark|matches",
    "shelter": r"shelter|tent|tarp|lean-to|insulat|hut\b|bivouac|sleeping bag",
    "medical": r"bleed|wound|burn|cpr|fractur|first aid|infect|bandage|tourniquet|fever|poison|sprain|hypotherm|"
               r"heat ?stroke|medic|injur|pain|allerg|choking|snake ?bite|sting|diarrh",
    "food": r"food|cook|forag|edible|preserv|canning|ferment|garden|plant|hunt|fish|trap|ration|meal|mushroom|berr",
    "navigation": r"navigat|compass|\bmap|north|lost\b|direction|gps|landmark|orient",
    "power": r"power|solar|batter|generator|electric|charg|grid|volt|inverter",
    "comms": r"radio|ham\b|signal|morse|frequen|antenna|communicat|walkie|sos\b|whistle|mirror",
    "repair": r"repair|fix|broken|tool|engine|patch|sew|mend|leak",
    "weather": r"storm|flood|hurricane|tornado|earthquake|wildfire|blizzard|snow|winter|heat ?wave|drought|lightning|evacuat",
}


def achievement_catalog():
    global _catalog
    if _catalog is None:
        try:
            _catalog = json.load(open(os.path.join(APP_DIR, "achievements.json")))
        except (OSError, ValueError):
            _catalog = {"achievements": [], "categories": [], "tiers": {}, "ranks": [[0, "Recruit"]]}
    return _catalog


def _ach_state():
    if not os.path.exists(ACH_FILE):
        return _ach_backfill()
    st = read_json(ACH_FILE, {})
    st.setdefault("earned", {})
    st.setdefault("unseen", [])
    st.setdefault("counts", {})
    st.setdefault("topics", {})
    st.setdefault("sets", {})
    st.setdefault("days", [])
    return st


def _ach_backfill():
    """The first time (e.g. right after updating): count the questions,
    topics, longest conversation and days already in the saved history, so
    earlier use counts. What that unlocks is awarded quietly, without pop-ups."""
    st = {"earned": {}, "unseen": [], "counts": {}, "topics": {}, "sets": {}, "days": []}
    counts = st["counts"]
    for item in history_list()["items"]:
        conv = read_json(history_path(item["id"]), {})
        messages = conv.get("messages") or []
        counts["questions"] = counts.get("questions", 0) + len(messages)
        counts["longestConversation"] = max(counts.get("longestConversation", 0), len(messages))
        counts["onlineQuestions"] = counts.get("onlineQuestions", 0) + sum(1 for m in messages if m.get("online"))
        for m in messages:
            text = str(m.get("question", "")).lower()
            for topic, pattern in TOPICS.items():
                if re.search(pattern, text):
                    st["topics"][topic] = st["topics"].get(topic, 0) + 1
        for stamp in (conv.get("created"), conv.get("updated")):
            if isinstance(stamp, (int, float)) and stamp > 0:
                day = time.strftime("%Y-%m-%d", time.localtime(stamp / 1000))
                if day not in st["days"]:
                    st["days"].append(day)
    st["days"] = sorted(st["days"])[-400:]
    # What the settings show was already done: the tour, the current look and loadout.
    settings = read_json(SETTINGS_FILE, {})
    if settings.get("onboarded"):
        counts["tour"] = 1
    for key, stat in (("theme", "themes"), ("background", "backgrounds"),
                      ("personality", "personalities"), ("scenario", "scenarios")):
        if isinstance(settings.get(key), str) and settings[key]:
            st["sets"][stat] = [settings[key][:60]]
    _award(st)
    st["unseen"] = []
    write_json(ACH_FILE, st)
    return st


def _streak(days):
    """The longest run of consecutive days in a list of YYYY-MM-DD dates."""
    import datetime
    dates = sorted({datetime.date.fromisoformat(d) for d in days if re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)})
    best = run = 0
    prev = None
    for d in dates:
        run = run + 1 if prev and (d - prev).days == 1 else 1
        best = max(best, run)
        prev = d
    return best


def _stat(st, stat):
    counts, sets = st["counts"], st["sets"]
    if stat.startswith("topic:"):
        return st["topics"].get(stat[6:], 0)
    if stat == "topicsCovered":
        return sum(1 for t in TOPICS if st["topics"].get(t))
    if stat == "streak":
        return max(_streak(st["days"]), counts.get("bestStreak", 0))
    if stat in ("manualPages", "themes", "backgrounds", "personalities", "scenarios", "creations",
                "mapPacks", "waypoints", "mapSearches"):
        return len(sets.get(stat, []))
    if stat == "profileName":
        return 1 if get_profile().get("name") else 0
    if stat == "profilePicture":
        return 1 if get_profile().get("picture") else 0
    if stat == "profileDetails":
        p = get_profile()
        return 1 if p.get("location") and p.get("units") and p.get("experience") else 0
    if stat == "password":
        return 1 if read_json(LOCK_FILE, {}).get("hash") else counts.get("password", 0)
    if stat == "collections":
        return len(glob.glob(os.path.join(LIBRARY_DIR, "*.zim")))
    if stat == "allOthers":
        return sum(1 for a in achievement_catalog()["achievements"] if a["stat"] != "allOthers" and a["id"] in st["earned"])
    return counts.get(stat, 0)


def _award(st):
    """Earn everything whose goal is reached; the legend is checked last."""
    now, changed = int(time.time() * 1000), False
    items = achievement_catalog()["achievements"]
    for a in sorted(items, key=lambda a: a["stat"] == "allOthers"):
        if a["id"] not in st["earned"] and _stat(st, a["stat"]) >= a["goal"]:
            st["earned"][a["id"]] = now
            st["unseen"].append(a["id"])
            changed = True
    return changed


def record(event, value=None, **info):
    """Count something the user did and award what it unlocks."""
    with ACH_LOCK:
        st = _ach_state()
        counts, sets = st["counts"], st["sets"]
        today = time.strftime("%Y-%m-%d")
        if today not in st["days"]:
            st["days"] = (st["days"] + [today])[-400:]
            counts["bestStreak"] = max(counts.get("bestStreak", 0), _streak(st["days"]))
        if event == "question":
            counts["questions"] = counts.get("questions", 0) + 1
            text = str(value or "").lower()
            for topic, pattern in TOPICS.items():
                if re.search(pattern, text):
                    st["topics"][topic] = st["topics"].get(topic, 0) + 1
            hour = time.localtime().tm_hour
            if hour < 4:
                counts["nightQuestions"] = counts.get("nightQuestions", 0) + 1
            elif 5 <= hour < 7:
                counts["dawnQuestions"] = counts.get("dawnQuestions", 0) + 1
            for flag, key in (("online", "onlineQuestions"), ("offgrid", "offgridQuestions")):
                if info.get(flag):
                    counts[key] = counts.get(key, 0) + 1
            counts["longestConversation"] = max(counts.get("longestConversation", 0), int(info.get("turn") or 1))
        elif event in ("suggestions", "sources", "stops", "voice", "backups", "usbExports", "tour", "password",
                       "cprMinutes", "morseLetters", "drills", "timers", "sunChecks", "cards", "quartermaster"):
            counts[event] = counts.get(event, 0) + 1
        elif event in ("manualPages", "themes", "backgrounds", "personalities", "scenarios", "creations",
                       "mapPacks", "waypoints", "mapSearches"):
            item = str(value or "")[:60]
            if item and item not in sets.get(event, []):
                sets[event] = sets.get(event, []) + [item]
        _award(st)
        write_json(ACH_FILE, st)


def achievements(mark_seen=False):
    """The catalog with progress, what's earned (and when), points and rank.
    With mark_seen, also hands over (and clears) the newly earned ones."""
    with ACH_LOCK:
        st = _ach_state()
        changed = _award(st)
        unseen = list(st["unseen"])
        if mark_seen and unseen:
            st["unseen"] = []
            changed = True
        if changed:
            write_json(ACH_FILE, st)
    cat = achievement_catalog()
    items = [{**a, "progress": min(a["goal"], _stat(st, a["stat"])), "earned": st["earned"].get(a["id"])}
             for a in cat["achievements"]]
    points = sum(a["points"] for a in items if a["earned"])
    rank = [r for r in cat["ranks"] if points >= r[0]][-1][1]
    later = [r for r in cat["ranks"] if r[0] > points]
    counts = st["counts"]
    favourite = max(TOPICS, key=lambda t: st["topics"].get(t, 0)) if any(st["topics"].values()) else ""
    return {**{k: cat[k] for k in ("categories", "tiers", "ranks")}, "achievements": items, "points": points,
            "total": sum(a["points"] for a in items), "rank": rank,
            "next": {"rank": later[0][1], "points": later[0][0]} if later else None,
            "unseen": unseen if mark_seen else [],
            "stats": {"questions": counts.get("questions", 0), "streak": _stat(st, "streak"),
                      "days": len(st["days"]), "favourite": favourite}}


def restore_achievements(data):
    """Merge achievements from a backup: earned ones are kept (the earliest
    date wins) and counters take the higher value."""
    if not isinstance(data, dict):
        return
    known = {a["id"] for a in achievement_catalog()["achievements"]}
    with ACH_LOCK:
        st = _ach_state()
        for aid, when in (data.get("earned") or {}).items():
            if aid in known and isinstance(when, int):
                st["earned"][aid] = min(when, st["earned"].get(aid, when))
        for key in ("counts", "topics"):
            for k, v in (data.get(key) or {}).items():
                if isinstance(v, int) and re.fullmatch(r"[A-Za-z]{1,30}", str(k)):
                    st[key][k] = max(v, st[key].get(k, 0))
        for k, v in (data.get("sets") or {}).items():
            if k in ("manualPages", "themes", "backgrounds", "personalities", "scenarios", "creations",
                     "mapPacks", "waypoints", "mapSearches") and isinstance(v, list):
                st["sets"][k] = sorted(set(st["sets"].get(k, [])) | {str(x)[:60] for x in v[:200]})
        st["days"] = sorted(set(st["days"]) | {d for d in (data.get("days") or [])[:400]
                                               if isinstance(d, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", d)})[-400:]
        write_json(ACH_FILE, st)


def greeting():
    """A short, warm welcome in the current personality's voice, picking up
    where the last conversation left off."""
    name = get_profile().get("name", "")
    last = history_list()["items"][:1]
    topic = ""
    if last:
        conv = read_json(history_path(last[0]["id"]), {})
        msgs = conv.get("messages") or []
        if msgs:
            topic = msgs[-1].get("question") or conv.get("title", "")
            days = (time.time() * 1000 - (last[0].get("updated") or 0)) / 864e5
            when = "earlier today" if days < 1 else "yesterday" if days < 2 else f"{int(days)} days ago"
    hour = time.localtime().tm_hour
    part = "morning" if 5 <= hour < 12 else "afternoon" if hour < 18 else "evening"
    about = f"The user is {name}. " if name else "You don't know the user's name. "
    context = (f"Last time ({when}) they asked you: \"{topic[:200]}\". Warmly ask how that went or "
               "whether they want to pick it up again.") if topic else "Ask how they are doing today."
    text = quick_generate(
        f"{about}It is the {part}. They just opened you, Umbra, their survival assistant. {context}\n"
        "Write ONE short greeting of at most 25 words, in your own voice. No lists, no citations. "
        "Reply with only the greeting.", 90, system=persona_prompt())
    text = re.sub(r"(?i)^(greeting)\s*:\s*", "", text).strip(" \"'“”‘’")
    # Never show a greeting cut off mid-sentence.
    if text and text[-1] not in ".!?…":
        ends = [m.end() for m in re.finditer(r"[.!?…](?=\s|$)", text)]
        text = text[:ends[-1]] if ends else ""
    return {"name": name, "text": text[:240]}


# ------------------------------------------------- setup: hardware, models, packs

# The AI models offered at setup, smallest to largest.
MODEL_CHOICES = [
    {"id": "gemma3:1b", "name": "Gemma 3 · 1B", "size": 0.8, "ram": 4,
     "line": "Fastest, basic answers. Runs on any computer."},
    {"id": "gemma3:4b", "name": "Gemma 3 · 4B", "size": 3.3, "ram": 8,
     "line": "The recommended balance of speed and quality. Needs 8 GB of memory."},
    {"id": "llama3.1:8b", "name": "Llama 3.1 · 8B", "size": 4.9, "ram": 16,
     "line": "Most capable and detailed. Needs 16 GB of memory; slow without a graphics card."},
]


# ------------------------------------------------------------------ CPU

CPU_LOCK = threading.Lock()
CPU_PREV = {}
CLK_TCK = os.sysconf("SC_CLK_TCK") if hasattr(os, "sysconf") else 100
CPU_LIMITS = (25, 50, 75, 100)


def cpu_times():
    """(busy, total) jiffies for the whole CPU, then each core, from /proc/stat."""
    out = []
    try:
        for line in open("/proc/stat"):
            if not line.startswith("cpu"):
                break
            v = [int(x) for x in line.split()[1:9]]
            idle = v[3] + (v[4] if len(v) > 4 else 0)
            out.append((sum(v) - idle, sum(v)))
    except (OSError, ValueError):
        pass
    return out


def umbra_ticks():
    """CPU time used so far by Umbra's processes: the local AI (Ollama), the
    library server (kiwix-serve), this backend, and the window with its web view."""
    procs = {}
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        try:
            with open(f"/proc/{pid}/stat") as f:
                stat = f.read()
        except OSError:
            continue
        comm = stat[stat.find("(") + 1:stat.rfind(")")]
        fields = stat[stat.rfind(")") + 2:].split()
        try:
            procs[int(pid)] = (comm, int(fields[1]), int(fields[11]) + int(fields[12]))
        except (IndexError, ValueError):
            continue
    window = {pid for pid, (comm, _, _) in procs.items() if comm == "umbra-wiki"}
    return sum(ticks for pid, (comm, ppid, ticks) in procs.items()
               if comm.startswith("ollama") or comm == "kiwix-serve" or pid == os.getpid()
               or pid in window or ppid in window)


def physical_cores():
    """Real cores (not threads): what Ollama uses by default."""
    cores = set()
    phys = core = None
    try:
        for line in open("/proc/cpuinfo"):
            if line.startswith("physical id"):
                phys = line.split(":")[1].strip()
            elif line.startswith("core id"):
                core = line.split(":")[1].strip()
            elif not line.strip():
                if core is not None:
                    cores.add((phys, core))
                phys = core = None
    except OSError:
        pass
    return len(cores) or os.cpu_count() or 1


def cpu_limit():
    value = read_json(SETTINGS_FILE, {}).get("cpuLimit", 100)
    return value if value in CPU_LIMITS else 100


def ai_threads(limit=None):
    """How many cores the local AI may use at a CPU limit (%)."""
    limit = cpu_limit() if limit is None else limit
    return max(1, round(physical_cores() * limit / 100))


def ai_options(**extra):
    """Ollama options shared by every request, so the model never reloads
    between them. Below 100% the AI gets fewer cores (num_thread)."""
    options = {"num_ctx": 4096, **extra}
    if cpu_limit() < 100:
        options["num_thread"] = ai_threads()
    return options


def cpu_temp():
    """The processor temperature in °C, if the system reports it."""
    for hw in glob.glob("/sys/class/hwmon/hwmon*"):
        try:
            if open(hw + "/name").read().strip() in ("coretemp", "k10temp", "zenpower"):
                return round(int(open(hw + "/temp1_input").read()) / 1000)
        except (OSError, ValueError):
            continue
    fallback = None
    for zone in sorted(glob.glob("/sys/class/thermal/thermal_zone*")):
        try:
            kind = open(zone + "/type").read().strip()
            temp = round(int(open(zone + "/temp").read()) / 1000)
        except (OSError, ValueError):
            continue
        if kind == "x86_pkg_temp":
            return temp
        if fallback is None and kind in ("acpitz", "cpu-thermal", "cpu_thermal", "TCPU", "soc_thermal"):
            fallback = temp
    return fallback


def cpu_status():
    """Live CPU use (whole processor, each thread, and Umbra's share) since
    the previous call, plus temperature, memory and the AI's core limit."""
    now, times, ticks = time.monotonic(), cpu_times(), umbra_ticks()
    with CPU_LOCK:
        prev = dict(CPU_PREV)
        CPU_PREV.update(at=now, times=times, ticks=ticks)
    pct = lambda a, b: round(max(0.0, min(100.0, (a[0] - b[0]) * 100 / max(1, a[1] - b[1]))), 1)
    threads = max(1, len(times) - 1)
    total, cores, umbra = 0.0, [0.0] * threads, 0.0
    if prev.get("times") and len(prev["times"]) == len(times) and now - prev["at"] > 0.05:
        total = pct(times[0], prev["times"][0])
        cores = [pct(a, b) for a, b in zip(times[1:], prev["times"][1:])]
        umbra = round(max(0.0, min(100.0, (ticks - prev["ticks"]) * 100 / ((now - prev["at"]) * CLK_TCK * threads))), 1)
    mem = {}
    try:
        for line in open("/proc/meminfo"):
            key, value = line.split(":", 1)
            if key in ("MemTotal", "MemAvailable"):
                mem[key] = int(value.split()[0]) * 1024
    except (OSError, ValueError):
        pass
    name = system_info_cpu()
    limit = cpu_limit()
    return {"total": total, "umbra": min(umbra, 100.0), "cores": cores, "threads": threads,
            "physical": physical_cores(), "name": name, "temp": cpu_temp(),
            "memTotal": mem.get("MemTotal", 0), "memUsed": mem.get("MemTotal", 0) - mem.get("MemAvailable", 0),
            "load": os.getloadavg()[0] if hasattr(os, "getloadavg") else 0,
            "limit": limit, "aiThreads": ai_threads(limit), "limits": {str(l): ai_threads(l) for l in CPU_LIMITS}}


def system_info_cpu():
    try:
        for line in open("/proc/cpuinfo"):
            if line.startswith("model name"):
                return re.sub(r"\s+", " ", line.split(":", 1)[1]).replace("(R)", "").replace("(TM)", "").strip()
    except OSError:
        pass
    return "Unknown processor"


def system_info():
    """What this computer can do, for choosing a model."""
    cpu = system_info_cpu()
    ram = 0
    try:
        for line in open("/proc/meminfo"):
            if line.startswith("MemTotal"):
                ram = math.ceil(int(line.split()[1]) / 1024 / 1024)  # usable memory is a bit under the installed size
    except (OSError, ValueError):
        pass
    gpus = []
    try:
        out = subprocess.run(["lspci"], capture_output=True, text=True, timeout=3).stdout
        for line in out.splitlines():
            if re.search(r"VGA|3D controller|Display controller", line):
                name = line.split(": ", 1)[-1]
                gpus.append(re.sub(r"\s*\(rev \w+\)", "", name))
    except (OSError, subprocess.SubprocessError):
        pass
    accel = next((kind for pkg, kind in (("ollama-cuda", "NVIDIA CUDA"), ("ollama-rocm", "AMD ROCm"),
                                         ("ollama-vulkan", "Vulkan"))
                  if subprocess.run(["pacman", "-Q", pkg], capture_output=True).returncode == 0), None)
    os.makedirs(LIBRARY_DIR, exist_ok=True)
    free = shutil.disk_usage(LIBRARY_DIR).free / 1e9
    recommended = "gemma3:1b" if ram and ram < 8 else "llama3.1:8b" if ram >= 16 and accel else "gemma3:4b"
    return {"cpu": cpu, "cores": os.cpu_count() or 1, "ramGB": ram, "gpus": gpus, "accel": accel,
            "freeGB": round(free, 1), "recommended": recommended}


def catalog():
    try:
        return json.load(open(os.path.join(APP_DIR, "library.json")))
    except (OSError, ValueError):
        return []


def packs():
    """Library packs with their collections, sizes and what's installed."""
    items = catalog()
    have = {f for f in os.listdir(LIBRARY_DIR)} if os.path.isdir(LIBRARY_DIR) else set()
    try:
        defs = json.load(open(os.path.join(APP_DIR, "packs.json")))
    except (OSError, ValueError):
        defs = []
    out = []
    for d in defs:
        wanted = d["ids"]
        if wanted == "all":
            ids = [c["id"] for c in items]
        else:
            wanted = [wanted] if isinstance(wanted, str) else wanted
            ids = [c["id"] for c in items if ("essential" in wanted and c.get("essential")) or c["id"] in wanted]
        chosen = [c for c in items if c["id"] in ids]
        missing = [c for c in chosen if c["file"] not in have]
        out.append({**{k: v for k, v in d.items() if k != "ids"}, "ids": ids, "count": len(chosen),
                    "size": sum(c["size"] for c in chosen), "missing": [c["id"] for c in missing],
                    "missingSize": sum(c["size"] for c in missing)})
    return out


# Library downloads run in their own systemd unit, so they survive backend
# restarts; progress is read from the growing files.
DOWNLOAD_UNIT = "umbra-wiki-download"
DOWNLOADS_FILE = os.path.join(DATA_DIR, "downloads.json")


def start_download(ids):
    known = {c["id"]: c for c in catalog()}
    ids = [i for i in ids if i in known]
    if not ids:
        return False
    queued = read_json(DOWNLOADS_FILE, {}).get("ids", []) if _download_units() else []
    ids = [i for i in ids if i not in queued]
    if not ids:
        return True
    # The download unit gets this backend's config location and port.
    env = [f"--setenv={k}={os.environ[k]}" for k in ("XDG_CONFIG_HOME", "UMBRA_PORT") if os.environ.get(k)]
    r = subprocess.run(["systemd-run", "--user", "--collect", f"--unit={DOWNLOAD_UNIT}-{int(time.time() * 1000)}", *env,
                        os.path.join(APP_DIR, "fetch-archive.sh"), *ids], capture_output=True)
    write_json(DOWNLOADS_FILE, {"ids": queued + ids})
    return r.returncode == 0


def downloads():
    known = {c["id"]: c for c in catalog()}
    ids = [i for i in read_json(DOWNLOADS_FILE, {}).get("ids", []) if i in known]
    active = bool(_download_units())
    total = done = 0
    items = []
    for i in ids:
        c = known[i]
        path = os.path.join(LIBRARY_DIR, c["file"])
        got = c["size"] if os.path.exists(path) else os.path.getsize(path + ".part") if os.path.exists(path + ".part") else 0
        total += c["size"]
        done += min(got, c["size"])
        items.append({"id": i, "name": c["name"], "size": c["size"], "done": min(got, c["size"]),
                      "installed": os.path.exists(path)})
    state = read_json(DOWNLOADS_FILE, {})
    waiting = not active and any(not i["installed"] for i in items)
    library = {"active": active, "items": items, "percent": round(done * 100 / total) if total else 0,
               "paused": waiting and bool(state.get("paused")), "done": done, "total": total}
    job = MAPS.job
    maps = {"active": bool(job.get("active")) or bool(job.get("resumable")), "paused": bool(job.get("paused")),
            "phase": job.get("phase", ""), "name": (job.get("plan") or {}).get("name", ""), "kind": job.get("kind", ""),
            "received": job.get("received", 0), "total": job.get("total", 0), "done": job.get("done", 0), "count": job.get("count", 0)}
    return {"library": library, "model": dict(pull_state), "maps": maps}


def library_control(action):
    """Pause (the download stops; the part already fetched is kept), resume
    (it goes on from there) or cancel (the unfinished files are removed)."""
    state = read_json(DOWNLOADS_FILE, {})
    known = {c["id"]: c for c in catalog()}
    left = [i for i in state.get("ids", []) if i in known and not os.path.exists(os.path.join(LIBRARY_DIR, known[i]["file"]))]
    if action in ("pause", "cancel"):
        for unit in _download_units():
            subprocess.run(["systemctl", "--user", "stop", unit], capture_output=True)
    if action == "pause":
        write_json(DOWNLOADS_FILE, {**state, "paused": True})
    elif action == "resume":
        if left:
            start_download(left)
    elif action == "cancel":
        for i in left:
            try:
                os.remove(os.path.join(LIBRARY_DIR, known[i]["file"]) + ".part")
            except OSError:
                pass
        try:
            os.remove(DOWNLOADS_FILE)
        except OSError:
            pass
    return downloads()


def resume_library():
    """At start: library downloads cut off by a restart go on (paused ones wait)."""
    state = read_json(DOWNLOADS_FILE, {})
    if state.get("paused") or _download_units():
        return
    known = {c["id"]: c for c in catalog()}
    left = [i for i in state.get("ids", []) if i in known and not os.path.exists(os.path.join(LIBRARY_DIR, known[i]["file"]))]
    if left:
        start_download(left)


def _download_units():
    out = subprocess.run(["systemctl", "--user", "list-units", "--plain", "--no-legend", "--state=active,activating",
                          f"{DOWNLOAD_UNIT}-*"], capture_output=True, text=True).stdout
    return [line.split()[0] for line in out.splitlines() if line.strip()]


# Model downloads go through Ollama's API in a background thread; a pending
# pull is remembered and resumed if the backend restarts.
PULL_FILE = os.path.join(DATA_DIR, "pull.json")
pull_state = {}


def start_pull(name):
    if name not in {m["id"] for m in MODEL_CHOICES} and not re.fullmatch(r"[a-z0-9._:/-]{1,60}", name):
        raise ValueError("bad model name")
    if pull_state.get("active"):
        return pull_state
    write_json(PULL_FILE, {"model": name})
    pull_state.clear()
    pull_state.update({"paused": False})
    pull_state.update({"model": name, "active": True, "completed": 0, "total": 0, "status": "starting", "error": ""})
    threading.Thread(target=_pull, args=(name,), daemon=True).start()
    return pull_state


def _pull(name):
    try:
        req = urllib.request.Request(OLLAMA + "/api/pull", json.dumps({"model": name, "stream": True}).encode(),
                                     {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            for line in r:
                if pull_state.get("stop") == "cancel":
                    pull_state.clear()
                    return
                if pull_state.get("stop"):
                    # Paused: Ollama keeps what's fetched and goes on from there next time.
                    pull_state.update({"active": False, "paused": True, "status": "paused", "stop": False})
                    return
                e = json.loads(line or b"{}")
                if e.get("error"):
                    raise RuntimeError(e["error"])
                pull_state["status"] = e.get("status", "")
                if e.get("total"):
                    pull_state["total"] = e["total"]
                    pull_state["completed"] = e.get("completed", 0)
        pull_state.update({"active": False, "status": "done", "completed": pull_state.get("total", 0)})
        try:
            os.remove(PULL_FILE)
        except OSError:
            pass
        set_model(name)
    except Exception as e:
        pull_state.update({"active": False, "status": "failed", "error": str(e)[:200]})


def resume_pull():
    pending = read_json(PULL_FILE, {})
    if pending.get("paused") and pending.get("model"):
        pull_state.update({"model": pending["model"], "active": False, "paused": True, "status": "paused",
                           "completed": pending.get("completed", 0), "total": pending.get("total", 0), "error": ""})
    elif pending.get("model"):
        start_pull(pending["model"])


def pull_control(action):
    pending = read_json(PULL_FILE, {})
    if action == "pause" and pull_state.get("active"):
        pull_state["stop"] = True
        write_json(PULL_FILE, {**pending, "paused": True, "completed": pull_state.get("completed", 0), "total": pull_state.get("total", 0)})
    elif action == "resume" and pending.get("model") and not pull_state.get("active"):
        start_pull(pending["model"])
    elif action == "cancel":
        try:
            os.remove(PULL_FILE)
        except OSError:
            pass
        if pull_state.get("active"):
            pull_state["stop"] = "cancel"
        else:
            pull_state.clear()
    return dict(pull_state)


# ------------------------------------------------------- settings: model, reset

def list_models():
    """Installed chat models (embedding models can't answer questions)."""
    try:
        tags = json.loads(urllib.request.urlopen(OLLAMA + "/api/tags", timeout=3).read())
        found = [{"id": m["name"], "size": round(m.get("size", 0) / 1e9, 1)} for m in tags.get("models", [])
                 if "embed" not in m["name"] and "bert" not in (m.get("details", {}).get("family") or "")]
    except Exception:
        found = []
    return {"current": MODEL, "models": sorted(m["id"] for m in found), "installed": found,
            "choices": MODEL_CHOICES, "pull": dict(pull_state)}


def set_model(name):
    """Switch the local AI to another installed Ollama model."""
    global MODEL
    if name not in list_models()["models"]:
        raise ValueError("model not installed")
    MODEL = name
    config = read_json(CONFIG_FILE, {})
    config["model"] = name
    write_json(CONFIG_FILE, config)
    threading.Thread(target=warm_model, daemon=True).start()
    return list_models()


def reset_umbra():
    """Back to a fresh install: settings, profile, achievements, waypoints,
    custom themes, personalities and scenarios, and all saved conversations
    are deleted (downloaded maps stay, like the library). The AI model,
    the library and config.json (model, library folder) are kept."""
    for path in (SETTINGS_FILE, PROFILE_FILE, CUSTOM_THEMES_FILE, PERSONALITIES_FILE, SCENARIOS_FILE, LOCK_FILE, ACH_FILE,
                 WAYPOINTS_FILE, SUPPLIES_FILE, SAFETY_FILE, FOLDERS_FILE, VAULT_FILE):
        try:
            os.remove(path)
        except OSError:
            pass
    shutil.rmtree(HISTORY_DIR, ignore_errors=True)
    try:
        os.remove(STARTERS_CACHE)
    except OSError:
        pass
    set_attention(False)
    return {"ok": True}


# -------------------------------------------------------------------- voice

# Voice input through voxtype's offline speech engine (Whisper base.en).
# When the voxtype service is running (Omarchy: hold F9 anywhere), Umbra
# drives it and the words are typed into the prompt box. Without the
# service, Umbra records the microphone itself and transcribes the clip.
VOICE_FILE = os.path.join(os.environ.get("XDG_RUNTIME_DIR") or "/tmp", "umbra-wiki-voice.wav")
voice_proc = None


def voxtype_daemon():
    try:
        pid = int(open(os.path.join(os.environ.get("XDG_RUNTIME_DIR") or "/tmp", "voxtype", "pid")).read().strip())
        os.kill(pid, 0)
        return True
    except (OSError, ValueError):
        return False


def voice_status():
    if not shutil.which("voxtype"):
        install = ("omarchy-voxtype-install" if shutil.which("omarchy-voxtype-install")
                   else "yay -S voxtype-bin && voxtype setup --download --model base.en")
        return {"available": False, "daemon": False, "state": "idle", "install": install}
    daemon = voxtype_daemon()
    state = "idle"
    if daemon:
        try:
            out = subprocess.run(["voxtype", "status", "--format", "json"], capture_output=True, text=True, timeout=2)
            state = json.loads(out.stdout or "{}").get("class", "idle")
        except (OSError, ValueError, subprocess.SubprocessError):
            pass
    elif voice_proc and voice_proc.poll() is None:
        state = "recording"
    return {"available": True, "daemon": daemon, "state": state}


def voice_action(action):
    global voice_proc
    status = voice_status()
    if not status["available"]:
        return {"error": "voxtype is not installed"}
    if status["daemon"]:
        if action in ("start", "stop", "cancel", "toggle"):
            subprocess.run(["voxtype", "record", action], capture_output=True, timeout=5)
        return voice_status()
    # No service: record here, transcribe on stop.
    if action == "start" and not (voice_proc and voice_proc.poll() is None):
        voice_proc = subprocess.Popen(["pw-record", *audio_target("audioIn"), "--rate", "16000", "--channels", "1", "--format", "s16", VOICE_FILE],
                                      stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {**voice_status(), "state": "recording"}
    if action in ("stop", "cancel") and voice_proc:
        voice_proc.send_signal(signal.SIGINT)
        try:
            voice_proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            voice_proc.kill()
        voice_proc = None
        if action == "cancel":
            return voice_status()
        try:
            out = subprocess.run(["voxtype", "-q", "transcribe", VOICE_FILE], capture_output=True, text=True, timeout=120)
            # Progress lines share stdout with the words; keep only the words.
            text = " ".join(l.strip() for l in out.stdout.splitlines() if l.strip()
                            and not re.match(r"(Loading audio file|Audio format|Processing \d)", l.strip()))
        except (OSError, subprocess.SubprocessError):
            text = ""
        finally:
            try:
                os.remove(VOICE_FILE)
            except OSError:
                pass
        return {**voice_status(), "text": text}
    return voice_status()


# ----------------------------------------------------------------- starters

# The start screen's suggested questions: the scenario's own starters, plus
# a few written for this user from their profile and recent conversations.
# Personal ones are cached until the profile, scenario or history changes.
STARTERS_CACHE = os.path.join(DATA_DIR, "starters.json")


def current_scenario():
    settings = read_json(SETTINGS_FILE, {})
    try:
        loadout = json.load(open(LOADOUT_FILE))
    except (OSError, ValueError):
        return {}
    every = loadout["scenarios"] + custom_scenarios()
    sc = next((x for x in every if x["id"] == settings.get("scenario")), loadout["scenarios"][0])
    if sc.get("custom"):
        base = next((x for x in loadout["scenarios"] if x["id"] == sc.get("base")), loadout["scenarios"][0])
        sc = {**sc, "starters": base.get("starters", []), "prompt": sc.get("situation", "")}
    return sc


def starters(personal=True):
    sc = current_scenario()
    out = {"scenario": sc.get("starters", []), "personal": []}
    if not personal:
        return out
    profile = get_profile()
    recent = history_list()["items"][:6]
    about = profile.get("about", "")
    if not about and not recent:
        return out
    key = json.dumps([sc.get("id"), about, [(r["id"], r.get("updated")) for r in recent]])
    cache = read_json(STARTERS_CACHE, {})
    if cache.get("key") == key and len(cache.get("personal", [])) > 4:
        out["personal"] = cache.get("personal", [])
        return out
    asked = "\n".join(f"- {r.get('title', '')}" for r in recent) or "- (none yet)"
    lines = quick_generate(
        f"Suggest 8 different questions this user would likely want to ask their assistant next.\n"
        f"About the user: {about or 'unknown'}\n"
        f"Their recent questions:\n{asked}\n"
        f"Current scenario: {sc.get('name', '')}: {sc.get('prompt', '')[:300]}\n\n"
        "Make them personal: follow up on their recent topics or fit their life, and suit the scenario. "
        "Each under 8 words, written the way the user would type it, varied, and not a copy of a recent question. "
        "One per line, no numbers, no quotes, nothing else.", 180, lines=True)
    personal = []
    for l in lines:
        l = re.sub(r"^\s*(\d+[.)]|[-*•])\s*", "", l).strip(" \"'“”")
        if 3 <= len(l) <= 60 and len(l.split()) <= 10 and l.lower() not in {x.lower() for x in personal}:
            personal.append(l)
    personal = personal[:8]
    if personal:
        write_json(STARTERS_CACHE, {"key": key, "personal": personal})
    out["personal"] = personal
    return out


def whats_new():
    """This version's notes from the changelog, and whether to show them: once,
    on the first start after an update (not after a fresh install: the
    welcome tour covers that)."""
    items = []
    for path in (os.path.join(APP_DIR, "CHANGELOG.md"), os.path.join(APP_DIR, "..", "CHANGELOG.md"),
                 "/usr/share/doc/umbra-wiki/CHANGELOG.md"):
        try:
            with open(path, encoding="utf-8") as fh:
                text = fh.read()
        except OSError:
            continue
        m = re.search(rf"^## {re.escape(VERSION)}\s*\n(.*?)(?=^## |\Z)", text, re.S | re.M)
        if m:
            for bullet in re.split(r"\n- ", "\n" + m.group(1).strip()):
                bullet = " ".join(bullet.split()).lstrip("- ").strip()
                if bullet:
                    items.append(bullet)
            break
    settings = read_json(SETTINGS_FILE, {})
    show = bool(items) and bool(settings.get("onboarded")) and settings.get("seenVersion") != VERSION
    return {"version": VERSION, "items": items, "show": show}


def apply_settings(update):
    """Merge a settings change (from the app, the tour or a backup) into
    settings.json, keeping only known keys with sensible values."""
    with SETTINGS_LOCK:
        settings = read_json(SETTINGS_FILE, {})
        if isinstance(update.get("theme"), str) and re.fullmatch(r"[a-z0-9-]{1,40}", update["theme"]):
            settings["theme"] = update["theme"]
        for key in ("muted", "onboarded", "rain", "reduceMotion", "suggestions", "greeting", "barAlert", "hoverSounds",
                    "confirmExit"):
            if isinstance(update.get(key), bool):
                settings[key] = update[key]
        if isinstance(update.get("hiddenControls"), list):
            allowed = {"loadout-btn", "history-btn", "library-btn", "maps-btn", "fieldkit-btn", "theme-btn", "sound", "lock"}
            settings["hiddenControls"] = [c for c in update["hiddenControls"] if c in allowed]
        if update.get("background") in ("rain", "rise", "rings", "stars", "forest", "snow", "aurora",
                                         "embers", "radar", "none"):
            settings["background"] = update["background"]
        if update.get("transition") in ("wave", "rain", "scan", "static", "blinds", "split", "diamond", "spiral"):
            settings["transition"] = update["transition"]
        if update.get("offgrid") in ("off", "on", "auto"):
            settings["offgrid"] = update["offgrid"]
        if isinstance(update.get("textScale"), (int, float)):
            settings["textScale"] = max(0.8, min(1.4, float(update["textScale"])))
        if isinstance(update.get("volume"), (int, float)):
            settings["volume"] = max(0.0, min(1.0, float(update["volume"])))
        if update.get("cpuLimit") in CPU_LIMITS:
            settings["cpuLimit"] = update["cpuLimit"]
        for key in ("scenario", "personality"):
            if isinstance(update.get(key), str) and re.fullmatch(r"[a-z0-9-]{1,40}", update[key]):
                settings[key] = update[key]
        if isinstance(update.get("seenVersion"), str) and re.fullmatch(r"[0-9][0-9.]{0,15}", update["seenVersion"]):
            settings["seenVersion"] = update["seenVersion"]
        write_json(SETTINGS_FILE, settings)
    return settings


# ----------------------------------------------------------------- password

# An optional password that locks Umbra's screen at launch. Only a salted,
# slow hash is kept (PBKDF2-SHA256), in its own file that backups leave out.
# It guards the screen, not the files: they stay readable to this account.
LOCK_FILE = os.path.join(CONFIG_DIR, "lock.json")
LOCK_ROUNDS = 200_000


def has_password():
    return bool(read_json(LOCK_FILE, {}).get("hash"))


def check_password(password):
    lock = read_json(LOCK_FILE, {})
    if not lock.get("hash"):
        return True
    import hashlib, hmac
    digest = hashlib.pbkdf2_hmac("sha256", str(password).encode(), bytes.fromhex(lock["salt"]),
                                 int(lock.get("rounds", LOCK_ROUNDS))).hex()
    return hmac.compare_digest(digest, lock["hash"])


def set_password(old, new):
    if has_password() and not check_password(old):
        time.sleep(0.6)
        raise ValueError("wrong password")
    if not new:
        try:
            os.remove(LOCK_FILE)
        except OSError:
            pass
        return {"password": False}
    import hashlib
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(new)[:200].encode(), salt, LOCK_ROUNDS).hex()
    write_json(LOCK_FILE, {"salt": salt.hex(), "hash": digest, "rounds": LOCK_ROUNDS})
    try:
        os.chmod(LOCK_FILE, 0o600)
    except OSError:
        pass
    return {"password": True}


# ------------------------------------------------------------- field manual

# A short built-in manual of critical basics (first aid, water, fire,
# shelter, signalling, home emergencies). Always available offline, and
# searched first for every question.
def field_manual():
    try:
        return json.load(open(os.path.join(APP_DIR, "fieldmanual.json")))
    except (OSError, ValueError):
        return []


def manual_sources(terms, limit=2):
    topical = [t[:5] for t in terms if t not in GENERIC] or [t[:5] for t in terms]
    scored = []
    for page in field_manual():
        title, text = page["title"].lower(), (page["summary"] + " " + page["body"]).lower()
        score = sum(3 for t in topical if t in title) + sum(1 for t in topical if t in text)
        if score >= 3:
            scored.append((score, page))
    scored.sort(key=lambda x: -x[0])
    out = []
    for _, page in scored[:limit]:
        plain = re.sub(r"[*_#>]", "", page["body"])
        passage, _ = best_passage(plain, terms, 900)
        out.append({"kind": "manual", "title": page["title"], "archive": "Umbra Field Manual",
                    "url": "manual:" + page["id"], "passage": passage, "summary": page["summary"]})
    return out


# ------------------------------------------------------ export, drives, backup

def documents_dir():
    try:
        d = subprocess.run(["xdg-user-dir", "DOCUMENTS"], capture_output=True, text=True, timeout=3).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        d = ""
    return os.path.join(d if d and d != HOME else os.path.join(HOME, "Documents"), "Umbra")


def drives():
    """The Documents folder plus removable drives mounted for this user (USB
    sticks), as places to export and back up to."""
    base = os.environ.get("UMBRA_MEDIA_DIR") or os.path.join("/run/media", os.environ.get("USER", ""))   # override: testing
    try:
        names = sorted(n for n in os.listdir(base) if os.path.isdir(os.path.join(base, n)))
    except OSError:
        names = []
    out = [{"id": "documents", "name": "Documents folder", "path": documents_dir().replace(HOME, "~", 1)}]
    for n in names:
        path = os.path.join(base, n)
        if os.access(path, os.W_OK):
            out.append({"id": path, "name": f"USB drive: {n}", "path": path})
    return out


def target_dir(target):
    if target and target != "documents":
        if target not in [d["id"] for d in drives()]:
            raise ValueError("unknown drive")
        folder = os.path.join(target, "Umbra")
    else:
        folder = documents_dir()
    os.makedirs(folder, exist_ok=True)
    return folder


def safe_name(text):
    return re.sub(r"[^\w\- ]+", "", text).strip().replace(" ", "-")[:60] or "conversation"


def conversation_markdown(conv):
    when = time.strftime("%Y-%m-%d %H:%M", time.localtime((conv.get("created") or 0) / 1000))
    lines = [f"# {conv.get('title', 'Conversation')}", "",
             f"*{when} · {conv.get('scenario', '')} · {conv.get('personality', '')} · exported from Umbra Wiki*", ""]
    for m in conv.get("messages", []):
        persona = m.get("persona") or ""
        lines += ["## You", "", m.get("shown") or m.get("question", ""), "",
                  "## Umbra" + (f" ({persona})" if persona and persona.lower() != "umbra" else ""), "",
                  m.get("answer", ""), ""]
        if m.get("sources"):
            lines += ["**Sources**", ""]
            for src in m["sources"]:
                where = src.get("url", "") if str(src.get("url", "")).startswith("http") else src.get("archive", "")
                lines.append(f"- [{src.get('n')}] {src.get('title', '')} ({where})")
            lines.append("")
    return "\n".join(lines)


def export(what, conv_id="", target="", req=None):
    folder = target_dir(target)
    if what == "cards":
        return pocket_cards(req or {}, folder)
    stamp = time.strftime("%Y-%m-%d")
    if what == "conversation":
        conv = read_json(history_path(conv_id), {})
        if not conv:
            raise ValueError("not found")
        path = os.path.join(folder, f"{stamp} {safe_name(conv.get('title', ''))}.md")
        with open(path, "w") as f:
            f.write(conversation_markdown(conv))
        return {"path": path.replace(HOME, "~", 1), "count": 1}
    if what == "all":
        sub = os.path.join(folder, f"Conversations {stamp}")
        os.makedirs(sub, exist_ok=True)
        n = 0
        for item in history_list()["items"]:
            conv = read_json(history_path(item["id"]), {})
            if conv:
                day = time.strftime("%Y-%m-%d", time.localtime((conv.get("created") or 0) / 1000))
                with open(os.path.join(sub, f"{day} {safe_name(conv.get('title', ''))} {item['id'][-4:]}.md"), "w") as f:
                    f.write(conversation_markdown(conv))
                n += 1
        return {"path": sub.replace(HOME, "~", 1), "count": n}
    if what == "manual":
        path = os.path.join(folder, "Umbra Field Manual.md")
        pages = field_manual()
        body = ["# Umbra Field Manual", "",
                "*Critical basics, from Umbra Wiki. Not a substitute for training or professional help.*", ""]
        for page in pages:
            body += [f"## {page['title']}", "", page["body"], ""]
        with open(path, "w") as f:
            f.write("\n".join(body))
        return {"path": path.replace(HOME, "~", 1), "count": len(pages)}
    raise ValueError("unknown export")


def backup(include_history, target=""):
    folder = target_dir(target)
    data = {
        "umbraBackup": 1, "created": int(time.time() * 1000),
        "settings": read_json(SETTINGS_FILE, {}), "profile": get_profile(),
        "themes": custom_themes(), "personalities": custom_personalities(), "scenarios": custom_scenarios(),
        "achievements": read_json(ACH_FILE, {}), "waypoints": get_waypoints(), "supplies": get_supplies(),
        "safety": get_safety()["levels"], "folders": get_folders()["folders"], "vault": get_vault(),
        "history": [read_json(history_path(i["id"]), {}) for i in history_list()["items"]] if include_history else [],
    }
    path = os.path.join(folder, f"umbra-backup-{time.strftime('%Y-%m-%d-%H%M')}.json")
    write_json(path, data)
    return {"path": path.replace(HOME, "~", 1), "conversations": len(data["history"])}


def restore(data):
    """Put a backup back. Everything goes through the same checks as edits
    made in the app, so a damaged or foreign file can't write anything odd."""
    if not isinstance(data, dict) or data.get("umbraBackup") != 1:
        raise ValueError("not an Umbra backup")
    if isinstance(data.get("settings"), dict):
        apply_settings(data["settings"])
    if isinstance(data.get("profile"), dict):
        save_profile(data["profile"])
    restore_achievements(data.get("achievements"))
    if isinstance(data.get("supplies"), dict) and data["supplies"]:
        try:
            save_supplies(data["supplies"])
        except (ValueError, TypeError):
            pass
    if isinstance(data.get("vault"), list) and data["vault"]:
        try:
            mine = {v["id"]: v for v in get_vault()}
            mine.update({v.get("id"): v for v in data["vault"] if isinstance(v, dict)})
            save_vault(list(mine.values()))
        except ValueError:
            pass
    if isinstance(data.get("folders"), list) and data["folders"]:
        try:
            mine = {f["id"]: f for f in get_folders()["folders"]}
            mine.update({f.get("id"): f for f in data["folders"] if isinstance(f, dict)})
            save_folders(list(mine.values()))
        except ValueError:
            pass
    if isinstance(data.get("safety"), dict) and data["safety"]:
        try:
            save_safety({**get_safety()["levels"], **data["safety"]})
        except ValueError:
            pass
    if isinstance(data.get("waypoints"), list):
        mine = {w["id"]: w for w in get_waypoints()}
        mine.update({w.get("id"): w for w in data["waypoints"] if isinstance(w, dict)})
        try:
            save_waypoints(list(mine.values()))
        except ValueError:
            pass
    counts = {"themes": 0, "personalities": 0, "scenarios": 0, "conversations": 0}
    for key, save in (("themes", save_custom_theme), ("personalities", save_personality),
                      ("scenarios", save_scenario), ("history", lambda c: history_save(c, keep_time=True))):
        for item in data.get(key) or []:
            try:
                save(item)
                counts["conversations" if key == "history" else key] += 1
            except (ValueError, TypeError, KeyError, AttributeError):
                pass
    return counts


def on_battery():
    """True when running on battery (for off-grid mode's automatic setting)."""
    try:
        supplies = os.environ.get("UMBRA_POWER_DIR") or "/sys/class/power_supply"   # override: testing
        mains = [p for p in glob.glob(os.path.join(supplies, "*"))
                 if open(os.path.join(p, "type")).read().strip() == "Mains"]
        return bool(mains) and not any(open(os.path.join(p, "online")).read().strip() == "1" for p in mains)
    except OSError:
        return False


def search_history(q):
    """Conversations whose title, questions or answers contain every word."""
    words = [w for w in q.lower().split() if w]
    if not words:
        return []
    out = []
    for item in history_list()["items"]:
        conv = read_json(history_path(item["id"]), {})
        texts = [conv.get("title", "")] + [x for m in conv.get("messages", [])
                                            for x in (m.get("question", ""), m.get("answer", ""))]
        low = [t.lower() for t in texts]
        if not all(any(w in t for t in low) for w in words):
            continue
        snippet = ""
        for t in texts[1:]:
            i = t.lower().find(words[0])
            if i >= 0:
                start = max(0, i - 40)
                snippet = ("…" if start else "") + re.sub(r"[*_#`]", "", t[start:i + 80]).replace("\n", " ").strip() + "…"
                break
        out.append({**item, "snippet": snippet})
    return out


# ---------------------------------------------------------------- attention

# A new answer arrived while the window was in the background: this flag
# file makes the bar widget's emblem light up until the window is focused.
ATTENTION_FILE = os.path.join(os.environ.get("XDG_RUNTIME_DIR") or "/tmp", "umbra-wiki-attention")


def set_attention(on):
    try:
        if on:
            open(ATTENTION_FILE, "w").close()
        elif os.path.exists(ATTENTION_FILE):
            os.remove(ATTENTION_FILE)
    except OSError:
        pass


# ------------------------------------------------------------------ history

# Every conversation is kept as one JSON file on this computer.
HISTORY_DIR = os.path.join(DATA_DIR, "history")
HISTORY_ID = re.compile(r"c-[0-9]{8}-[0-9]{6}-[a-z0-9]{4}")


def history_path(conv_id):
    if not HISTORY_ID.fullmatch(str(conv_id)):
        raise ValueError("bad id")
    return os.path.join(HISTORY_DIR, conv_id + ".json")


def history_list():
    items = []
    for path in glob.glob(os.path.join(HISTORY_DIR, "c-*.json")):
        conv = read_json(path, None)
        if not conv or not HISTORY_ID.fullmatch(str(conv.get("id", ""))):
            continue
        item = {k: conv.get(k) for k in ("id", "title", "created", "updated", "scenario", "personality", "folder", "pinned")}
        item["count"] = len(conv.get("messages") or [])
        items.append(item)
    items.sort(key=lambda x: x.get("updated") or 0, reverse=True)
    return {"dir": HISTORY_DIR.replace(HOME, "~", 1), "items": items}


def history_save(conv, keep_time=False):
    path = history_path(conv.get("id"))
    old = read_json(path, {})
    messages = []
    for m in (conv.get("messages") or [])[:500]:
        if not isinstance(m, dict):
            continue
        sources = [
            {k: str(src.get(k, ""))[:600] for k in ("n", "kind", "title", "archive", "url", "summary")}
            for src in (m.get("sources") or [])[:12] if isinstance(src, dict)
        ]
        messages.append({
            "question": str(m.get("question", ""))[:4000],
            "shown": str(m.get("shown", ""))[:4000],
            "answer": str(m.get("answer", ""))[:20000],
            "offer": str(m.get("offer", ""))[:400],
            "meta": str(m.get("meta", ""))[:200],
            "online": bool(m.get("online")),
            "persona": str(m.get("persona", ""))[:40],
            "sources": sources,
        })
    now = int(time.time() * 1000)
    if keep_time and isinstance(conv.get("updated"), int):
        now = conv["updated"]   # restoring a backup keeps the original order
    clean = {
        "id": conv["id"],
        "title": str(conv.get("title", "") or "Conversation")[:120],
        "created": old.get("created") or now,
        "updated": now,
        "scenario": str(conv.get("scenario", ""))[:40],
        "personality": str(conv.get("personality", ""))[:40],
        # The folder and pin are kept unless this save changes them.
        "folder": _folder_id(conv["folder"]) if "folder" in conv else old.get("folder", ""),
        "pinned": bool(conv["pinned"]) if "pinned" in conv else bool(old.get("pinned")),
        "messages": messages,
    }
    write_json(path, clean)
    return {"ok": True, "updated": now}


# Folders for conversations: a name, a colour and an optional brief that
# Umbra reads for every conversation in the folder.
FOLDERS_FILE = os.path.join(DATA_DIR, "folders.json")
FOLDER_COLORS = ("signal", "accent", "net", "red", "green", "violet", "dim")


def _folder_id(v):
    v = str(v or "")
    return v if re.fullmatch(r"f-[a-z0-9]{4,16}", v) else ""


def get_folders():
    return {"folders": [f for f in read_json(FOLDERS_FILE, {}).get("folders", []) if isinstance(f, dict)]}


def save_folders(folders):
    if not isinstance(folders, list):
        raise ValueError("bad folders")
    clean, seen = [], set()
    for f in folders[:60]:
        if not isinstance(f, dict) or not _folder_id(f.get("id")) or f["id"] in seen:
            continue
        seen.add(f["id"])
        clean.append({"id": f["id"], "name": re.sub(r"\s+", " ", str(f.get("name", ""))).strip()[:32] or "Folder",
                      "color": f.get("color") if f.get("color") in FOLDER_COLORS else "signal",
                      "brief": str(f.get("brief", "") or "").strip()[:400]})
    write_json(FOLDERS_FILE, {"folders": clean})
    # Conversations in a folder that's gone go back to no folder.
    for path in glob.glob(os.path.join(HISTORY_DIR, "c-*.json")):
        conv = read_json(path, None)
        if conv and conv.get("folder") and conv["folder"] not in seen:
            conv["folder"] = ""
            write_json(path, conv)
    return {"folders": clean}


def history_move(conv_id, folder=None, pinned=None):
    """Put a conversation in a folder (or none), or pin/unpin it; the order
    by date stays as it was."""
    path = history_path(conv_id)
    conv = read_json(path, None)
    if not conv:
        raise ValueError("unknown conversation")
    if folder is not None:
        fid = _folder_id(folder)
        if fid and fid not in {f["id"] for f in get_folders()["folders"]}:
            raise ValueError("unknown folder")
        conv["folder"] = fid
    if pinned is not None:
        conv["pinned"] = bool(pinned)
    write_json(path, conv)
    return history_list()


def folder_prompt(folder):
    fid = _folder_id(folder)
    f = next((x for x in get_folders()["folders"] if x["id"] == fid), None)
    if not f:
        return ""
    line = f"This conversation is in the user's folder \"{f['name']}\"."
    if f.get("brief"):
        line += f" What the user wrote about it (keep it in mind): {f['brief']}"
    return line


def history_delete(conv_id):
    try:
        os.remove(history_path(conv_id))
    except (OSError, ValueError):
        pass
    return history_list()


SCENARIOS_FILE = os.path.join(CONFIG_DIR, "scenarios.json")  # made in the editor
SCENARIO_STATS = ("Threat", "Scarcity", "Isolation", "Urgency", "Duration")


def custom_scenarios():
    try:
        with open(SCENARIOS_FILE) as f:
            items = json.load(f)
        return items if isinstance(items, list) else []
    except (OSError, ValueError):
        return []


def save_scenario(item):
    if not isinstance(item, dict) or not re.fullmatch(r"custom-[a-z0-9-]{1,24}", str(item.get("id", ""))):
        raise ValueError("bad id")
    clean = {
        "id": item["id"], "custom": True,
        "name": str(item.get("name", "Custom"))[:28] or "Custom",
        "tagline": str(item.get("tagline", ""))[:48],
        "situation": str(item.get("situation", ""))[:500],
        "base": str(item.get("base", "everyday"))[:24] if re.fullmatch(r"[a-z-]{1,24}", str(item.get("base", ""))) else "everyday",
        "stats": {t: max(1, min(5, int((item.get("stats") or {}).get(t, 2)))) for t in SCENARIO_STATS},
    }
    items = [x for x in custom_scenarios() if x.get("id") != clean["id"]] + [clean]
    write_json_list(SCENARIOS_FILE, items)
    return items


def delete_scenario(item_id):
    items = [x for x in custom_scenarios() if x.get("id") != item_id]
    write_json_list(SCENARIOS_FILE, items)
    with SETTINGS_LOCK:
        settings = read_json(SETTINGS_FILE, {})
        if settings.get("scenario") == item_id:
            settings["scenario"] = "everyday"
            write_json(SETTINGS_FILE, settings)
    return items


def trait_lines(stats, no_humor):
    """Turn the 1–5 trait values into short style instructions."""
    lines = []
    b = stats.get("Brevity", 3)
    if b >= 5: lines.append("Use short, punchy sentences and no padding, but never leave out an essential step.")
    elif b == 4: lines.append("Keep answers tight, but never leave out an essential step.")
    elif b <= 1: lines.append("You may take a little more space to explain, but stay focused.")
    h = 0 if no_humor else stats.get("Humor", 2)
    if h >= 4: lines.append("Add a light touch of humour where it fits.")
    elif h <= 1: lines.append("No jokes.")
    w = stats.get("Warmth", 3)
    if w >= 5: lines.append("Be especially warm and encouraging.")
    elif w <= 1: lines.append("Be matter-of-fact rather than warm.")
    if stats.get("Caution", 3) >= 5: lines.append("Double-check every risky step and call out dangers clearly.")
    if stats.get("Grit", 3) >= 5: lines.append("Be firm and motivating: keep the user moving.")
    return " ".join(lines)


# Umbra knows whether it is offline or has the internet, and acts on it.
MODE_LOCAL = (
    "MODE: LOCAL. You are fully offline: your only sources are the offline survival archives on this "
    "device. If a question needs current or live information (news, weather, prices, recent events), "
    "say plainly that you are offline and suggest switching to ONLINE mode with the LINK button."
)
MODE_ONLINE = (
    "MODE: ONLINE. You have internet access: besides the offline archives, you have live Wikipedia "
    "articles (labelled 'WIKIPEDIA, ONLINE'). Use them to give a fuller, more precise and more up-to-date "
    "answer than you could offline: more specifics, figures and background, still well organised. When "
    "a key fact comes from a source labelled 'WIKIPEDIA, ONLINE', you may say so briefly (for example "
    "'according to Wikipedia'); never say that about sources labelled 'OFFLINE ARCHIVE', and always cite the "
    "number of the source the fact really comes from."
)


def persona_prompt():
    """Just the current personality's voice (for short side prompts)."""
    settings = read_json(SETTINGS_FILE, {})
    try:
        loadout = json.load(open(LOADOUT_FILE))
    except (OSError, ValueError):
        return DEFAULT_PERSONA
    people = loadout["personalities"] + custom_personalities()
    person = next((x for x in people if x["id"] == settings.get("personality")), loadout["personalities"][0])
    if person.get("custom"):
        return f"Speak as {person['name'].upper()}: {person.get('voice') or person.get('description') or 'a helpful survival expert'}."
    return person["prompt"]


def build_system_prompt(online=False):
    """Persona + scenario + trait style + the user's profile + the fixed rules."""
    settings = read_json(SETTINGS_FILE, {})
    try:
        loadout = json.load(open(LOADOUT_FILE))
    except (OSError, ValueError):
        return SYSTEM_PROMPT
    scenario = next((x for x in loadout["scenarios"] + custom_scenarios() if x["id"] == settings.get("scenario")),
                    loadout["scenarios"][0])
    if scenario.get("custom"):
        scenario = {**scenario, "prompt": f"The user's situation, in their own words: {(scenario.get('situation') or scenario['name']).rstrip('. ')}. "
                    "Adapt your help to it; if it isn't about survival, you may answer from your own knowledge."}
    people = loadout["personalities"] + custom_personalities()
    person = next((x for x in people if x["id"] == settings.get("personality")), loadout["personalities"][0])
    if person.get("custom"):
        persona = f"Speak as {person['name'].upper()}: {person.get('voice') or person.get('description') or 'a helpful survival expert'}."
        if person.get("sample"):
            persona += f" Example of how you talk: \"{person['sample']}\""
    else:
        persona = person["prompt"]
    no_humor = bool(scenario.get("noHumor"))
    parts = [persona, trait_lines(person.get("stats", {}), no_humor),
             "SCENARIO: " + scenario["prompt"], MODE_ONLINE if online else MODE_LOCAL, profile_prompt(), RULES]
    return " ".join(x for x in parts if x)


def internet_ok():
    try:
        fetch(f"{WIKI_API}?action=query&meta=siteinfo&format=json", timeout=5, headers=WEB_HEADERS)
        return True
    except Exception:
        return False


# --------------------------------------------------------------------- server

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.0"

    def log_message(self, *_):
        pass

    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length) or b"{}")

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == "/api/ping":
            return self.send_json({"ok": True})
        if path == "/api/status":
            return self.send_json(status())
        if path == "/api/netcheck":
            return self.send_json({"online": internet_ok()})
        if path == "/api/netinfo":
            return self.send_json(netinfo())
        if path == "/api/settings":
            return self.send_json(read_json(SETTINGS_FILE, {}))
        if path == "/api/facts":
            try:
                return self.send_json(json.load(open(os.path.join(APP_DIR, "facts.json"))))
            except (OSError, ValueError):
                return self.send_json([])
        if path == "/api/voice":
            return self.send_json(voice_status())
        if path == "/api/audio":
            return self.send_json(audio_devices())
        if path == "/api/lock":
            return self.send_json({"password": has_password()})
        if path == "/api/models":
            return self.send_json(list_models())
        if path == "/api/system":
            return self.send_json(system_info())
        if path == "/api/packs":
            return self.send_json(packs())
        if path == "/api/downloads":
            return self.send_json(downloads())
        if path == "/api/paths":
            short = lambda x: x.replace(HOME, "~", 1)
            return self.send_json({"library": short(LIBRARY_DIR), "config": short(CONFIG_DIR),
                                   "history": short(HISTORY_DIR), "packaged": PACKAGED, "installKind": install_kind()})
        if path == "/api/profile":
            return self.send_json(get_profile())
        if path == "/api/greeting":
            return self.send_json(greeting())
        if path == "/api/starters":
            query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            return self.send_json(starters(personal=query.get("personal", ["1"])[0] != "0"))
        if path == "/api/history":
            return self.send_json(history_list())
        if path == "/api/history-search":
            q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("q", [""])[0]
            return self.send_json(search_history(q[:100]))
        if path == "/api/manual":
            return self.send_json(field_manual())
        if path == "/api/drives":
            return self.send_json(drives())
        if path == "/api/power":
            return self.send_json({"battery": on_battery()})
        if path == "/api/cpu":
            return self.send_json(cpu_status())
        if path == "/api/achievements":
            return self.send_json(achievements())
        if path == "/api/update-check":
            return self.send_json(check_update())
        if path == "/api/maps":
            st = MAPS.status()
            st["dir"] = st["dir"].replace(HOME, "~", 1)
            return self.send_json(st)
        if path == "/api/waypoints":
            return self.send_json(get_waypoints())
        if path == "/api/supplies":
            return self.send_json(get_supplies())
        if path == "/api/mapsearch":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            try:
                near = (float(qs["lat"][0]), float(qs["lon"][0]))
            except (KeyError, ValueError):
                near = None
            return self.send_json(MAPS.search(qs.get("q", [""])[0][:60], near=near))
        if path == "/api/maps/countries":
            return self.send_json(MAPS.countries())
        if path == "/api/maps/atlas":
            # Every country's outline, main cities and fact sheet (1 MB, bundled).
            try:
                with open(os.path.join(APP_DIR, "maps", "atlas.json"), "rb") as fh:
                    body = fh.read()
            except OSError:
                body = b"[]"
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "max-age=86400")
            self.end_headers()
            return self.wfile.write(body)
        if path == "/api/safety":
            return self.send_json(get_safety())
        if path == "/api/folders":
            return self.send_json(get_folders())
        if path == "/api/whatsnew":
            return self.send_json(whats_new())
        # Map tiles: /api/tile/z/x/y (roads, places...), /api/points/15/x/y
        # (essential points), /api/terrain/z/x/y (elevation, PNG).
        m = re.fullmatch(r"/api/(tile|points|terrain)/(\d{1,2})/(\d{1,6})/(\d{1,6})", path)
        if m:
            kind, z, x, y = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
            body = getattr(MAPS, kind)(z, x, y)
            if not body:
                self.send_response(204)
                self.end_headers()
                return
            self.send_response(200)
            if kind == "terrain":
                self.send_header("Content-Type", "image/png")
            else:
                self.send_header("Content-Type", "application/x-protobuf")
                if body[:2] == b"\x1f\x8b":
                    self.send_header("Content-Encoding", "gzip")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "max-age=3600")
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/achievements/unseen":
            return self.send_json(achievements(mark_seen=True))
        if path.startswith("/api/history/"):
            try:
                conv = read_json(history_path(path.rsplit("/", 1)[1]), None)
            except ValueError:
                conv = None
            return self.send_json(conv or {"error": "not found"}, 200 if conv else 404)
        if path == "/api/personalities":
            return self.send_json(custom_personalities())
        if path == "/api/scenarios":
            return self.send_json(custom_scenarios())
        if path == "/api/themes":
            return self.send_json(custom_themes())
        if path == "/api/omarchy-theme":
            return self.send_json(omarchy_theme() or {})
        if path == "/api/library":
            return self.send_json(library())
        if path == "/":
            path = "/index.html"
        file = os.path.normpath(os.path.join(UI_DIR, path.lstrip("/")))
        if not file.startswith(UI_DIR) or not os.path.isfile(file):
            self.send_error(404)
            return
        types = {".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml",
                 ".json": "application/json"}
        with open(file, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("Content-Type", types.get(os.path.splitext(file)[1], "application/octet-stream") + "; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/api/settings":
            update = self.read_json()
            before = cpu_limit()
            old = read_json(SETTINGS_FILE, {})
            settings = apply_settings(update)
            for key, stat in (("theme", "themes"), ("background", "backgrounds"),
                              ("personality", "personalities"), ("scenario", "scenarios")):
                if key in update and settings.get(key) and settings.get(key) != old.get(key):
                    record(stat, settings[key])
            if update.get("onboarded") is True and not old.get("onboarded"):
                record("tour")
            if cpu_limit() != before:
                threading.Thread(target=warm_model, daemon=True).start()   # reload the AI with its new core count now
            return self.send_json(settings)
        if self.path == "/api/voice":
            return self.send_json(voice_action(str(self.read_json().get("action", ""))))
        if self.path == "/api/audio":
            req = self.read_json()
            try:
                return self.send_json(set_audio(req.get("out"), req.get("in")))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/password":
            req = self.read_json()
            try:
                out = set_password(str(req.get("old", "")), str(req.get("new", "")))
                if req.get("new"):
                    record("password")
                return self.send_json(out)
            except ValueError as e:
                return self.send_json({"error": str(e)}, 403)
        if self.path == "/api/unlock":
            ok = check_password(str(self.read_json().get("password", "")))
            if not ok:
                time.sleep(0.6)   # slows down guessing
            return self.send_json({"ok": ok})
        if self.path == "/api/model":
            try:
                return self.send_json(set_model(str(self.read_json().get("model", ""))))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/reset":
            if self.read_json().get("confirm") != "RESET":
                return self.send_json({"error": "not confirmed"}, 400)
            return self.send_json(reset_umbra())
        if self.path in ("/api/export", "/api/backup", "/api/restore"):
            req = self.read_json()
            try:
                if self.path == "/api/export":
                    out = export(str(req.get("what", "")), str(req.get("id", "")), str(req.get("target", "")), req)
                elif self.path == "/api/backup":
                    out = backup(bool(req.get("history")), str(req.get("target", "")))
                    record("backups")
                else:
                    return self.send_json(restore(req.get("backup")))
                if str(req.get("target", "")) not in ("", "documents"):
                    record("usbExports")
                if req.get("what") == "cards":
                    record("cards")
            except (ValueError, OSError) as e:
                return self.send_json({"error": str(e)}, 400)
            if req.get("open"):
                folder = os.path.expanduser(out["path"])
                subprocess.Popen(["xdg-open", folder if os.path.isdir(folder) else os.path.dirname(folder)],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            return self.send_json(out)
        if self.path == "/api/uninstall":
            req = self.read_json()
            if req.get("confirm") != "UNINSTALL":
                return self.send_json({"error": "not confirmed"}, 400)
            # Its own unit: the script stops this backend on the way.
            flags = [f for f, on in (("--library", req.get("library")), ("--model", req.get("model"))) if on]
            subprocess.Popen(["systemd-run", "--user", "--collect", "--unit=umbra-wiki-uninstall",
                              os.path.join(APP_DIR, "uninstall.sh"), *flags],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            return self.send_json({"ok": True})
        if self.path == "/api/open-folder":
            which = str(self.read_json().get("which", ""))
            folder = {"library": LIBRARY_DIR, "config": CONFIG_DIR, "history": HISTORY_DIR}.get(which)
            if not folder:
                return self.send_json({"ok": False}, 400)
            os.makedirs(folder, exist_ok=True)
            subprocess.Popen(["xdg-open", folder], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
            return self.send_json({"ok": True})
        if self.path == "/api/profile":
            try:
                return self.send_json(save_profile(self.read_json()))
            except (ValueError, TypeError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/attention":
            set_attention(bool(self.read_json().get("on")))
            return self.send_json({"ok": True})
        if self.path == "/api/suggest":
            req = self.read_json()
            options = suggest_replies(str(req.get("question", ""))[:1000], str(req.get("answer", ""))[:6000])
            return self.send_json({"text": options[0] if options else "", "options": options})
        if self.path == "/api/history":
            try:
                return self.send_json(history_save(self.read_json()))
            except (ValueError, TypeError, AttributeError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/history/move":
            req = self.read_json()
            try:
                return self.send_json(history_move(str(req.get("id", "")), req.get("folder"), req.get("pinned")))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/folders":
            try:
                return self.send_json(save_folders(self.read_json().get("folders")))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/history/delete":
            return self.send_json(history_delete(str(self.read_json().get("id", ""))))
        if self.path == "/api/personalities":
            try:
                out = save_personality(self.read_json().get("personality"))
                record("creations", "personality")
                return self.send_json(out)
            except (ValueError, TypeError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/scenarios":
            try:
                out = save_scenario(self.read_json().get("scenario"))
                record("creations", "scenario")
                return self.send_json(out)
            except (ValueError, TypeError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/scenarios/delete":
            return self.send_json(delete_scenario(str(self.read_json().get("id", ""))))
        if self.path == "/api/personalities/delete":
            return self.send_json(delete_personality(str(self.read_json().get("id", ""))))
        if self.path == "/api/themes":
            try:
                out = save_custom_theme(self.read_json().get("theme"))
                record("creations", "theme")
                return self.send_json(out)
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/themes/delete":
            return self.send_json(delete_custom_theme(str(self.read_json().get("id", ""))))
        if self.path == "/api/maps/plan":
            req = self.read_json()
            try:
                return self.send_json(MAPS.plan(str(req.get("name", "")), list(req.get("bbox") or [])[:4]))
            except (ValueError, TypeError, IndexError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/maps/download":
            req = self.read_json()
            try:
                return self.send_json(MAPS.download(str(req.get("plan", "")), int(req.get("zoom", 0)),
                                                    int(req.get("terrain", 0)), bool(req.get("essentials")),
                                                    on_done=lambda aid: record("mapPacks", aid)))
            except (ValueError, TypeError) as e:
                return self.send_json({"error": str(e)}, 400)
        m = re.fullmatch(r"/api/downloads/(maps|library|model)/(pause|resume|cancel)", self.path)
        if m:
            kind, action = m.groups()
            try:
                if kind == "maps":
                    getattr(MAPS, action)()
                elif kind == "library":
                    library_control(action)
                else:
                    pull_control(action)
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
            return self.send_json(downloads())
        if self.path == "/api/maps/delete":
            try:
                return self.send_json(MAPS.delete(str(self.read_json().get("id", ""))))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/supplies":
            try:
                out = save_supplies(self.read_json())
                if out["items"]:
                    record("quartermaster")
                return self.send_json(out)
            except (ValueError, TypeError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path in ("/api/vault/open", "/api/vault/save"):
            req = self.read_json()
            if not check_password(str(req.get("password", ""))):
                time.sleep(0.6)
                return self.send_json({"error": "wrong password"}, 403)
            if self.path == "/api/vault/open":
                return self.send_json({"items": get_vault(), "password": has_password()})
            try:
                return self.send_json({"items": save_vault(req.get("items"))})
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/safety":
            try:
                return self.send_json(save_safety(self.read_json().get("levels")))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/waypoints":
            try:
                return self.send_json(save_waypoints(self.read_json().get("waypoints")))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/achievements/event":
            req = self.read_json()
            event, value = str(req.get("event", "")), req.get("value")
            if event == "manualPages":
                if value not in [p.get("id") for p in field_manual()]:
                    return self.send_json({"error": "unknown page"}, 400)
            elif event == "mapSearches":
                value = str(value or "")[:60].lower()
            elif event not in ("suggestions", "sources", "stops", "voice", "cprMinutes", "morseLetters", "drills",
                               "timers", "sunChecks", "cards"):
                return self.send_json({"error": "unknown event"}, 400)
            record(event, value)
            return self.send_json({"ok": True})
        if self.path == "/api/sound":
            req = self.read_json()
            name = str(req.get("name", ""))
            muted = read_json(SETTINGS_FILE, {}).get("muted")
            if name == "hum":
                hum(bool(req.get("on")) and not muted)
            elif not muted:
                play_sound(name)
            return self.send_json({"ok": True})
        if self.path == "/api/library/download":
            ids = self.read_json().get("ids") or []
            return self.send_json({"ok": start_download([str(i) for i in ids])})
        if self.path == "/api/reload-library":
            return self.send_json({"archives": reload_library()})
        if self.path == "/api/model/pull":
            try:
                return self.send_json(start_pull(str(self.read_json().get("model", ""))))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/open":
            # Web sources open in the user's browser rather than inside the app.
            url = str(self.read_json().get("url", ""))
            if not re.match(r"^https?://", url):
                return self.send_json({"ok": False}, 400)
            subprocess.Popen(["xdg-open", url], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             start_new_session=True)
            return self.send_json({"ok": True})
        if self.path != "/api/ask":
            self.send_error(404)
            return
        req = self.read_json()
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        try:
            answer(req, self.emit)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the user pressed stop
        except Exception as e:
            try:
                self.emit({"type": "error", "message": str(e)})
            except Exception:
                pass

    def emit(self, event):
        self.wfile.write((json.dumps(event) + "\n").encode())
        self.wfile.flush()


def status():
    try:
        tags = json.loads(fetch(OLLAMA + "/api/tags", timeout=3))
        model_ok = any(m["name"] == MODEL for m in tags.get("models", []))
        ollama_ok = True
    except Exception:
        model_ok = ollama_ok = False
    return {
        "archives": len(glob.glob(os.path.join(LIBRARY_DIR, "*.zim"))),
        "model": MODEL,
        "ollama": ollama_ok,
        "modelReady": model_ok,
        "version": VERSION,
    }


def answer(req, emit):
    question = str(req.get("question", "")).strip()
    history = req.get("history") or []
    online = bool(req.get("online"))
    # Off-grid mode saves battery: the AI writes shorter answers.
    offgrid = bool(req.get("offgrid"))
    if not question:
        emit({"type": "error", "message": "Empty question."})
        return

    if not status()["modelReady"]:
        pulling = pull_state.get("active") and pull_state.get("total")
        pct = f" ({round(pull_state['completed'] * 100 / pull_state['total'])}% downloaded)" if pulling else ""
        emit({"type": "error", "message": f"My AI model {MODEL} isn't installed yet{pct}. "
              + ("It's downloading now; ask again when it's done." if pulling else
                 "Pick one in Settings → AI model, and I'll download it.")})
        return

    chatting = is_small_talk(question)
    emit({"type": "phase", "phase": "search"})
    sources, notice = ([], "") if chatting else find_sources(question, online)
    if notice:
        emit({"type": "notice", "message": notice})

    emit({"type": "phase", "phase": "read", "count": len(sources)})
    # The label says plainly where each source comes from, so Umbra credits the right one.
    blocks = [f"[{i}] {s['title']} ({'WIKIPEDIA, ONLINE' if s['kind'] == 'wiki' else 'OFFLINE ARCHIVE: ' + s['archive']})"
              f"\n{s['passage']}" for i, s in enumerate(sources, 1)]
    emit({"type": "sources", "sources": [
        {"n": i, "kind": s["kind"], "title": s["title"], "archive": s["archive"],
         "summary": s["summary"], "url": s["url"]}
        for i, s in enumerate(sources, 1)
    ]})

    system = build_system_prompt(online)
    if req.get("folder"):
        system += " " + folder_prompt(req.get("folder"))
    if ABOUT_UMBRA.search(question):
        system += " " + UMBRA_GUIDE
    if offgrid:
        system += (" OFF-GRID MODE: the user is saving battery. Keep the answer short: the essential steps "
                   "in their proper order, without long explanations. Never skip the first step or any "
                   "safety-critical step to save words (for bleeding, firm direct pressure always comes first).")
    messages = [{"role": "system", "content": system}]
    for turn in history[-HISTORY_TURNS * 2:]:
        role = "assistant" if turn.get("role") == "assistant" else "user"
        messages.append({"role": role, "content": str(turn.get("content", ""))[:600]})
    if chatting:
        messages.append({"role": "user", "content": question})
    else:
        context = "\n\n".join(blocks) if blocks else "(no relevant sources found; answer from your own knowledge)"
        messages.append({"role": "user", "content": f"SOURCES:\n{context}\n\nQUESTION: {question}"})

    emit({"type": "phase", "phase": "think"})
    full, done_event = stream_chat(messages, emit, 420 if offgrid else None)
    if not re.sub(r"\bNEXT\s*:.*", "", full, flags=re.S).strip():
        # An empty reply is never acceptable: retry once without sources.
        retry = [messages[0], {"role": "user", "content": question}]
        full, done_event = stream_chat(retry, emit, 420 if offgrid else None)

    match = None
    for match in re.finditer(r"\bNEXT\s*:\s*(.+)", full):
        pass
    body = full[:match.start()] if match else full
    # When Umbra ends by asking the user something, let them answer instead.
    asks_back = body.strip().rstrip("*_ \n").endswith("?")
    if chatting or asks_back:
        follow = ""
    else:
        follow = match.group(1).strip(" *_\"'") if match else follow_up(question, full)
    if follow:
        emit({"type": "next", "text": follow})
    record("question", question, online=online, offgrid=offgrid, turn=len(history) // 2 + 1)
    if done_event:
        emit(done_event)


def stream_chat(messages, emit, limit=None):
    options = ai_options(temperature=0.4)
    if limit:
        options["num_predict"] = limit
    body = json.dumps({
        "model": MODEL, "messages": messages, "stream": True, "keep_alive": "30m", "options": options,
    }).encode()
    request = urllib.request.Request(OLLAMA + "/api/chat", body, {"Content-Type": "application/json"})
    full, done_event, first = "", None, True
    with urllib.request.urlopen(request, timeout=600) as r:
        for line in r:
            if not line.strip():
                continue
            chunk = json.loads(line)
            token = chunk.get("message", {}).get("content", "")
            if token:
                if first:
                    emit({"type": "phase", "phase": "write"})
                    first = False
                full += token
                emit({"type": "token", "text": token})
            if chunk.get("done"):
                done_event = {"type": "done", "tokens": chunk.get("eval_count", 0),
                              "seconds": round(chunk.get("total_duration", 0) / 1e9, 1),
                              "reason": chunk.get("done_reason", ""),
                              "promptTokens": chunk.get("prompt_eval_count", 0)}
    return full, done_event


def quick_generate(prompt, num_predict, system=None, lines=False):
    """A short one-line completion from the local model ('' on failure);
    with lines=True, all non-empty lines as a list."""
    req = {"model": MODEL, "prompt": prompt, "stream": False, "keep_alive": "30m",
           "options": ai_options(temperature=0.4, num_predict=num_predict)}
    if system:
        req["system"] = system
    body = json.dumps(req).encode()
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request(
            OLLAMA + "/api/generate", body, {"Content-Type": "application/json"}), timeout=120).read())
        out = [l.strip() for l in r.get("response", "").strip().splitlines() if l.strip()]
        if lines:
            return out
        return out[0].strip(" *_\"'") if out else ""
    except Exception:
        return [] if lines else ""


def follow_up(question, answer_text):
    """One likely next question, when the answer didn't end with a NEXT line."""
    text = quick_generate(
        "A user asked a survival assistant a question and got an answer.\n"
        f"QUESTION: {question}\nANSWER: {answer_text[:700]}\n\n"
        "Write one short, friendly sentence in the assistant's voice offering the most useful next "
        "step, for example 'If you'd like, I can show you how to keep the fire going overnight.' "
        "Under 20 words. Reply with only that sentence.", 40)
    return re.sub(r"(?i)^(next|follow[- ]?up)( question)?\W*:\s*", "", text)


def suggest_replies(question, answer_text):
    """What the user would most likely say next: up to three short replies,
    the first shown as a hint in the prompt box, all in the Tab menu."""
    lines = quick_generate(
        "A user is talking to a survival assistant.\n"
        f"USER: {question[:300]}\nASSISTANT: {answer_text[-800:]}\n\n"
        "Write the user's three most likely short replies to the assistant's last message, in the "
        "user's own words: answers if the assistant asked something, otherwise natural follow-up "
        "questions, each different. Examples: 'Yes, I have a plastic bottle and some cloth.' or "
        "'How long should I boil it?' Each under 12 words, one per line, nothing else.", 70, lines=True)
    out = []
    for line in lines:
        text = re.sub(r"(?i)^\s*(?:[-*•]|\d+[.)])?\s*(user|reply|me)?\s*:?\s*", "", line).strip(" \"'*")
        if 3 <= len(text) <= 120 and text not in out:
            out.append(text)
    return out[:3]


def warm_model():
    """Load Gemma into memory ahead of the first question."""
    try:
        body = json.dumps({"model": MODEL, "keep_alive": "30m", "options": ai_options()}).encode()
        urllib.request.urlopen(urllib.request.Request(
            OLLAMA + "/api/generate", body, {"Content-Type": "application/json"}), timeout=120).read()
    except Exception:
        pass


MAPS = maps.Maps(DATA_DIR, APP_DIR)

if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop_kiwix)
    signal.signal(signal.SIGINT, stop_kiwix)
    os.makedirs(LIBRARY_DIR, exist_ok=True)
    n = start_kiwix()
    set_attention(False)
    threading.Thread(target=warm_model, daemon=True).start()
    resume_pull()
    threading.Thread(target=resume_library, daemon=True).start()
    MAPS.restore(on_done=lambda aid: record("mapPacks", aid))
    print(f"umbra: {n} archives, model {MODEL}, http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
