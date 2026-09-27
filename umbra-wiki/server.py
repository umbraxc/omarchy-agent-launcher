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

HOME = os.path.expanduser("~")
APP_DIR = os.path.dirname(os.path.abspath(__file__))
UI_DIR = os.path.join(APP_DIR, "ui")
CONFIG_DIR = os.path.join(os.environ.get("XDG_CONFIG_HOME", os.path.join(HOME, ".config")), "umbra-wiki")
DATA_DIR = os.path.join(os.environ.get("XDG_DATA_HOME", os.path.join(HOME, ".local", "share")), "umbra-wiki")
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
WEB_HEADERS = {"User-Agent": "UmbraWiki/1.1 (https://github.com/umbraxc/omarchy-umbra; offline survival assistant)"}

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
            "out": settings.get("audioOut", ""), "in": settings.get("audioIn", "")}


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


def save_profile(p):
    if not isinstance(p, dict):
        raise ValueError("bad profile")
    picture = str(p.get("picture") or "")
    if picture and (not re.match(r"^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$", picture)
                    or len(picture) > 600_000):
        raise ValueError("bad picture")
    character = p.get("character") if isinstance(p.get("character"), dict) else {}
    clean = {
        "name": re.sub(r"\s+", " ", str(p.get("name", ""))).strip()[:32],
        "about": str(p.get("about", "")).strip()[:500],
        "character": {k: max(0, min(40, int(v))) for k, v in character.items()
                      if re.fullmatch(r"[a-z]{1,12}", str(k)) and str(v).isdigit()},
        "picture": picture,
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
    return " ".join(lines)


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


def system_info():
    """What this computer can do, for choosing a model."""
    cpu = "Unknown processor"
    try:
        for line in open("/proc/cpuinfo"):
            if line.startswith("model name"):
                cpu = re.sub(r"\s+", " ", line.split(":", 1)[1]).replace("(R)", "").replace("(TM)", "").strip()
                break
    except OSError:
        pass
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
    library = {"active": active, "items": items, "percent": round(done * 100 / total) if total else 0}
    return {"library": library, "model": dict(pull_state)}


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
    pull_state.update({"model": name, "active": True, "completed": 0, "total": 0, "status": "starting", "error": ""})
    threading.Thread(target=_pull, args=(name,), daemon=True).start()
    return pull_state


def _pull(name):
    try:
        req = urllib.request.Request(OLLAMA + "/api/pull", json.dumps({"model": name, "stream": True}).encode(),
                                     {"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            for line in r:
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
    pending = read_json(PULL_FILE, {}).get("model")
    if pending:
        start_pull(pending)


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
    """Back to a fresh install: settings, profile, custom themes, personalities
    and scenarios, and all saved conversations are deleted. The AI model,
    the library and config.json (model, library folder) are kept."""
    for path in (SETTINGS_FILE, PROFILE_FILE, CUSTOM_THEMES_FILE, PERSONALITIES_FILE, SCENARIOS_FILE, LOCK_FILE):
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
            allowed = {"loadout-btn", "history-btn", "library-btn", "theme-btn", "sound", "lock"}
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
        for key in ("scenario", "personality"):
            if isinstance(update.get(key), str) and re.fullmatch(r"[a-z0-9-]{1,40}", update[key]):
                settings[key] = update[key]
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


def export(what, conv_id="", target=""):
    folder = target_dir(target)
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
        item = {k: conv.get(k) for k in ("id", "title", "created", "updated", "scenario", "personality")}
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
        "messages": messages,
    }
    write_json(path, clean)
    return {"ok": True, "updated": now}


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
                                   "history": short(HISTORY_DIR)})
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
            return self.send_json(apply_settings(update))
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
                return self.send_json(set_password(str(req.get("old", "")), str(req.get("new", ""))))
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
                    out = export(str(req.get("what", "")), str(req.get("id", "")), str(req.get("target", "")))
                elif self.path == "/api/backup":
                    out = backup(bool(req.get("history")), str(req.get("target", "")))
                else:
                    return self.send_json(restore(req.get("backup")))
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
            return self.send_json({"text": suggest_reply(str(req.get("question", ""))[:1000],
                                                         str(req.get("answer", ""))[:6000])})
        if self.path == "/api/history":
            try:
                return self.send_json(history_save(self.read_json()))
            except (ValueError, TypeError, AttributeError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/history/delete":
            return self.send_json(history_delete(str(self.read_json().get("id", ""))))
        if self.path == "/api/personalities":
            try:
                return self.send_json(save_personality(self.read_json().get("personality")))
            except (ValueError, TypeError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/scenarios":
            try:
                return self.send_json(save_scenario(self.read_json().get("scenario")))
            except (ValueError, TypeError) as e:
                return self.send_json({"error": str(e)}, 400)
        if self.path == "/api/scenarios/delete":
            return self.send_json(delete_scenario(str(self.read_json().get("id", ""))))
        if self.path == "/api/personalities/delete":
            return self.send_json(delete_personality(str(self.read_json().get("id", ""))))
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
    if done_event:
        emit(done_event)


def stream_chat(messages, emit, limit=None):
    options = {"num_ctx": 4096, "temperature": 0.4}
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
           "options": {"num_ctx": 4096, "temperature": 0.4, "num_predict": num_predict}}
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


def suggest_reply(question, answer_text):
    """What the user would most likely say next, shown as a hint in the prompt box."""
    text = quick_generate(
        "A user is talking to a survival assistant.\n"
        f"USER: {question[:300]}\nASSISTANT: {answer_text[-800:]}\n\n"
        "Write the user's most likely short reply to the assistant's last message, in the user's own "
        "words: an answer if the assistant asked something, otherwise a natural follow-up question. "
        "Examples: 'Yes, I have a plastic bottle and some cloth.' or 'How long should I boil it?' "
        "Under 12 words. Reply with only that reply.", 30)
    text = re.sub(r"(?i)^(user|reply|me)\s*:\s*", "", text).strip(" \"'")
    return text[:120]


def warm_model():
    """Load Gemma into memory ahead of the first question."""
    try:
        body = json.dumps({"model": MODEL, "keep_alive": "30m", "options": {"num_ctx": 4096}}).encode()
        urllib.request.urlopen(urllib.request.Request(
            OLLAMA + "/api/generate", body, {"Content-Type": "application/json"}), timeout=120).read()
    except Exception:
        pass


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop_kiwix)
    signal.signal(signal.SIGINT, stop_kiwix)
    n = start_kiwix()
    set_attention(False)
    threading.Thread(target=warm_model, daemon=True).start()
    resume_pull()
    print(f"umbra: {n} archives, model {MODEL}, http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
