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

HOME = os.path.expanduser("~")
APP_DIR = os.path.dirname(os.path.abspath(__file__))
UI_DIR = os.path.join(APP_DIR, "ui")
CONFIG_DIR = os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.join(HOME, ".config")), "umbra-wiki")
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


def write_json(path, value):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(value, f, indent=2)
    os.replace(tmp, path)


CONFIG = read_json(CONFIG_FILE, {})
LIBRARY_DIR = os.path.expanduser(CONFIG.get("libraryDir") or os.path.join(HOME, "UmbraWiki", "library"))

HOST = "127.0.0.1"
PORT = 8766
KIWIX_PORT = 8765
KIWIX = f"http://{HOST}:{KIWIX_PORT}"
OLLAMA = "http://127.0.0.1:11434"
MODEL = os.environ.get("UMBRA_MODEL") or CONFIG.get("model") or "gemma3:4b"

WIKI_API = "https://en.wikipedia.org/w/api.php"
WEB_HEADERS = {"User-Agent": "UmbraWiki/1.0 (personal offline survival assistant)"}

# Gemma reads context at ~25 tokens/s on this CPU, so the prompt budget is
# what sets the wait before the first word. Three sources of ~800 chars keep
# the first word at roughly half a minute. Online mode trades one local
# source for two Wikipedia articles.
LOCAL_SOURCES = 3
ONLINE_LOCAL_SOURCES = 2
WIKI_SOURCES = 2
SNIPPET_CHARS = 800
SUMMARY_CHARS = 150
HISTORY_TURNS = 2

SYSTEM_PROMPT = (
    "You are UMBRA, a calm, friendly survival expert talking with the user, like a knowledgeable "
    "friend. Talk naturally and warmly, never robotically. Get straight to the point: no compliments "
    "on the question and no filler openers. "
    "For small talk, reply briefly and naturally, and mention what you can help with if it fits. "
    "For practical questions, answer clearly with short steps when useful, and put the key action "
    "or term of each step in **bold**. "
    "If the situation is vague or huge (for example 'I have nothing'), start with the most urgent "
    "priorities in order, then ask the user one short question back so you can tailor your help. "
    "SOURCES may include irrelevant material: use only what genuinely helps, cite [n] only for facts "
    "taken from that source, and simply ignore the rest. If no source helps, answer from your own "
    "knowledge without citing. "
    "Only state quantities, doses, ratios, temperatures or times that appear in the SOURCES; if a "
    "number is needed but not in the sources, say to check a trusted reference instead of guessing. "
    "For medical, poisoning, electrical or other dangerous topics, end the answer with one short "
    "sentence of safety advice. Do not add generic AI or legal disclaimers. Never invent sources. "
    "Always finish with one final line in exactly this form: "
    "NEXT: <one short, friendly sentence in your own voice offering the most useful next step, "
    "for example 'If you'd like, I can walk you through keeping the fire burning overnight.'>"
)

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


def stop_kiwix(*_):
    if kiwix_proc and kiwix_proc.poll() is None:
        kiwix_proc.terminate()
    sys.exit(0)


def fetch(url, timeout=30, headers=None):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


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
    query = urllib.parse.urlencode({
        "action": "query", "list": "search", "srsearch": " ".join(terms),
        "srlimit": 8, "format": "json", "utf8": 1,
    })
    hits = json.loads(fetch(f"{WIKI_API}?{query}", timeout=8, headers=WEB_HEADERS))["query"]["search"]
    stems = [t[:5] for t in terms]
    need = min(2, len(stems))

    def relevance(hit):
        title = hit["title"].lower()
        snippet = re.sub(r"<[^>]+>", "", hit.get("snippet", "")).lower()
        return sum(1 for st in stems if st in title) * 2 + sum(1 for st in stems if st in snippet)

    ranked = [h for h in hits
              if not re.match(r"(?i)(list|index|outline) of ", h["title"])
              and sum(1 for st in stems if st in (h["title"] + " " + h.get("snippet", "")).lower()) >= need]
    ranked.sort(key=relevance, reverse=True)

    sources = []
    for hit in ranked[:limit]:
        title = hit["title"]
        query = urllib.parse.urlencode({
            "action": "query", "prop": "extracts", "explaintext": 1, "exsectionformat": "plain",
            "titles": title, "format": "json", "utf8": 1,
        })
        pages = json.loads(fetch(f"{WIKI_API}?{query}", timeout=8, headers=WEB_HEADERS))["query"]["pages"]
        text = next(iter(pages.values())).get("extract", "")
        passage, summary = best_passage(text, terms)
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


def best_passage(text, terms):
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
        return text[:SNIPPET_CHARS], shorten(text, SUMMARY_CHARS)

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
        if score < 1 or used + len(sentences[i]) > SNIPPET_CHARS:
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
    try:
        sources = local_sources(terms, ONLINE_LOCAL_SOURCES if online else LOCAL_SOURCES) if kiwix_proc else []
    except Exception:
        sources = []
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


def download(ids):
    """Download collections in a visible terminal, where progress shows."""
    script = os.path.join(APP_DIR, "fetch-archive.sh")
    ids = [i for i in ids if re.fullmatch(r"[a-z0-9._-]{1,80}", i)]
    if not ids:
        return False
    cmd = f"{script} {' '.join(ids)}"
    runner = ["omarchy-launch-floating-terminal-with-presentation", cmd]
    if not shutil.which(runner[0]):
        runner = ["xdg-terminal-exec", "bash", "-c", cmd + "; read -rp 'Press Enter to close'"]
    subprocess.Popen(runner, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    return True


SOUNDS_DIR = os.path.join(APP_DIR, "sounds")
_last_sound = {}


_hum = None


def hum(on):
    """Start or stop the quiet background hum while Umbra works."""
    global _hum
    if _hum and _hum.poll() is None:
        _hum.terminate()
    _hum = None
    path = os.path.join(SOUNDS_DIR, "hum.ogg")
    if on and os.path.isfile(path) and shutil.which("pw-play"):
        _hum = subprocess.Popen(
            ["pw-play", "--volume", "0.9", "-P", "{ application.name = \"Umbra Wiki\" media.role = \"Notification\" }", path],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def play_sound(name):
    """Play a bundled sound through PipeWire (independent of the web view)."""
    path = os.path.join(SOUNDS_DIR, name + ".ogg")
    if not re.fullmatch(r"[a-z]{1,16}", name) or not os.path.isfile(path) or not shutil.which("pw-play"):
        return False
    now = time.monotonic()
    if now - _last_sound.get(name, 0) < 0.04:  # collapse accidental double triggers
        return True
    _last_sound[name] = now
    subprocess.Popen(
        ["pw-play", "--volume", "0.9", "-P", "{ application.name = \"Umbra Wiki\" media.role = \"Notification\" }", path],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(value, f, indent=2)
    os.replace(tmp, path)


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
            settings = read_json(SETTINGS_FILE, {})
            if isinstance(update.get("theme"), str) and re.fullmatch(r"[a-z0-9-]{1,40}", update["theme"]):
                settings["theme"] = update["theme"]
            if isinstance(update.get("muted"), bool):
                settings["muted"] = update["muted"]
            write_json(SETTINGS_FILE, settings)
            return self.send_json(settings)
        if self.path == "/api/themes":
            try:
                return self.send_json(save_custom_theme(self.read_json().get("theme")))
            except ValueError as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/themes/delete":
            return self.send_json(delete_custom_theme(str(self.read_json().get("id", ""))))
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
            return self.send_json({"ok": download([str(i) for i in ids])})
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
    }


def answer(req, emit):
    question = str(req.get("question", "")).strip()
    history = req.get("history") or []
    online = bool(req.get("online"))
    if not question:
        emit({"type": "error", "message": "Empty question."})
        return

    chatting = is_small_talk(question)
    emit({"type": "phase", "phase": "search"})
    sources, notice = ([], "") if chatting else find_sources(question, online)
    if notice:
        emit({"type": "notice", "message": notice})

    emit({"type": "phase", "phase": "read", "count": len(sources)})
    blocks = [f"[{i}] {s['title']} ({s['archive']})\n{s['passage']}" for i, s in enumerate(sources, 1)]
    emit({"type": "sources", "sources": [
        {"n": i, "kind": s["kind"], "title": s["title"], "archive": s["archive"],
         "summary": s["summary"], "url": s["url"]}
        for i, s in enumerate(sources, 1)
    ]})

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in history[-HISTORY_TURNS * 2:]:
        role = "assistant" if turn.get("role") == "assistant" else "user"
        messages.append({"role": role, "content": str(turn.get("content", ""))[:600]})
    if chatting:
        messages.append({"role": "user", "content": question})
    else:
        context = "\n\n".join(blocks) if blocks else "(no relevant sources found; answer from your own knowledge)"
        messages.append({"role": "user", "content": f"SOURCES:\n{context}\n\nQUESTION: {question}"})

    emit({"type": "phase", "phase": "think"})
    full, done_event = stream_chat(messages, emit)
    if not re.sub(r"\bNEXT\s*:.*", "", full, flags=re.S).strip():
        # An empty reply is never acceptable: retry once without sources.
        retry = [messages[0], {"role": "user", "content": question}]
        full, done_event = stream_chat(retry, emit)

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
    if done_event:
        emit(done_event)


def stream_chat(messages, emit):
    body = json.dumps({
        "model": MODEL, "messages": messages, "stream": True, "keep_alive": "30m",
        "options": {"num_ctx": 4096, "temperature": 0.4},
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


def follow_up(question, answer_text):
    """One likely next question, when the answer didn't end with a NEXT line."""
    prompt = (
        "A user asked a survival assistant a question and got an answer.\n"
        f"QUESTION: {question}\nANSWER: {answer_text[:700]}\n\n"
        "Write one short, friendly sentence in the assistant's voice offering the most useful next "
        "step, for example 'If you'd like, I can show you how to keep the fire going overnight.' "
        "Under 20 words. Reply with only that sentence."
    )
    body = json.dumps({"model": MODEL, "prompt": prompt, "stream": False, "keep_alive": "30m",
                       "options": {"num_ctx": 2048, "temperature": 0.4, "num_predict": 40}}).encode()
    try:
        r = json.loads(urllib.request.urlopen(urllib.request.Request(
            OLLAMA + "/api/generate", body, {"Content-Type": "application/json"}), timeout=120).read())
        text = r.get("response", "").strip().splitlines()[0].strip(" *_\"'")
        return re.sub(r"(?i)^(next|follow[- ]?up)( question)?\W*:\s*", "", text)
    except Exception:
        return ""


def warm_model():
    """Load Gemma into memory ahead of the first question."""
    try:
        body = json.dumps({"model": MODEL, "keep_alive": "30m"}).encode()
        urllib.request.urlopen(urllib.request.Request(
            OLLAMA + "/api/generate", body, {"Content-Type": "application/json"}), timeout=120).read()
    except Exception:
        pass


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop_kiwix)
    signal.signal(signal.SIGINT, stop_kiwix)
    n = start_kiwix()
    threading.Thread(target=warm_model, daemon=True).start()
    print(f"umbra: {n} archives, model {MODEL}, http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
