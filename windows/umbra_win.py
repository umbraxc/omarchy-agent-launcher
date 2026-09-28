"""Umbra Wiki for Windows: the app window around the local UI.

One process: the backend (umbra-wiki/server.py) runs in a thread, and the
UI shows in an Edge WebView2 window (pywebview). Closing the window asks the
page first (it plays its goodbye), then stops the backend and the programs it
started. Built into "Umbra Wiki.exe" by windows/umbra.spec.

  Umbra Wiki.exe                 open Umbra
  Umbra Wiki.exe "a question"    open Umbra and ask it
  Umbra Wiki.exe --selftest      start the backend on a spare port with an
                                 empty profile, check it, exit (for the build)
"""

import ctypes
import json
import os
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request

FROZEN = getattr(sys, "frozen", False)
HERE = sys._MEIPASS if FROZEN else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "umbra-wiki")
sys.path.insert(0, HERE)

SELFTEST = "--selftest" in sys.argv
if SELFTEST:
    # A throwaway profile, so the build's check never touches real data.
    scratch = tempfile.mkdtemp(prefix="umbra-selftest-")
    for var in ("APPDATA", "LOCALAPPDATA", "USERPROFILE", "HOME"):
        os.environ[var] = os.path.join(scratch, var.lower())
        os.makedirs(os.environ[var], exist_ok=True)
    os.environ["UMBRA_PORT"], os.environ["UMBRA_KIWIX_PORT"] = "8896", "8895"

DATA = os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "UmbraWiki")
os.makedirs(DATA, exist_ok=True)
if FROZEN or SELFTEST:
    # No console: messages go to a log file (useful when something goes wrong).
    log = open(os.path.join(os.getcwd(), "selftest.log") if SELFTEST else os.path.join(DATA, "umbra.log"),
               "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = log
    print(f"\n--- {time.strftime('%Y-%m-%d %H:%M:%S')} start {' '.join(sys.argv[1:])}", flush=True)

PORT = int(os.environ.get("UMBRA_PORT", 8766))
URL = f"http://127.0.0.1:{PORT}/"
MUTEX = "UmbraWikiRunning"   # the installer waits for it before replacing files


def backend_up():
    try:
        urllib.request.urlopen(URL + "api/ping", timeout=1)
        return True
    except Exception:
        return False


def kill_children_with_us():
    """Everything Umbra starts (kiwix-serve, Ollama's server when Umbra
    started it) ends with it, even if Umbra crashes: a job object that
    closes its processes when this one ends. The updater and the uninstaller
    break away from it (see winplat)."""
    k32 = ctypes.windll.kernel32

    class Limits(ctypes.Structure):
        _fields_ = [("PerProcessUserTimeLimit", ctypes.c_int64), ("PerJobUserTimeLimit", ctypes.c_int64),
                    ("LimitFlags", ctypes.c_uint32), ("MinimumWorkingSetSize", ctypes.c_size_t),
                    ("MaximumWorkingSetSize", ctypes.c_size_t), ("ActiveProcessLimit", ctypes.c_uint32),
                    ("Affinity", ctypes.c_size_t), ("PriorityClass", ctypes.c_uint32), ("SchedulingClass", ctypes.c_uint32)]

    class Extended(ctypes.Structure):
        _fields_ = [("Basic", Limits), ("Io", ctypes.c_uint64 * 6), ("ProcessMemoryLimit", ctypes.c_size_t),
                    ("JobMemoryLimit", ctypes.c_size_t), ("PeakProcessMemoryUsed", ctypes.c_size_t),
                    ("PeakJobMemoryUsed", ctypes.c_size_t)]

    k32.CreateJobObjectW.restype = ctypes.c_void_p
    job = k32.CreateJobObjectW(None, None)
    info = Extended()
    info.Basic.LimitFlags = 0x2000 | 0x800   # KILL_ON_JOB_CLOSE | BREAKAWAY_OK
    k32.SetInformationJobObject(ctypes.c_void_p(job), 9, ctypes.byref(info), ctypes.sizeof(info))
    k32.GetCurrentProcess.restype = ctypes.c_void_p
    k32.AssignProcessToJobObject(ctypes.c_void_p(job), ctypes.c_void_p(k32.GetCurrentProcess()))
    return job   # kept open for the life of the process


def start_backend():
    import server
    threading.Thread(target=server.run, kwargs={"signals": False}, daemon=True).start()
    for _ in range(240):   # up to a minute (the first start unpacks and indexes)
        if backend_up():
            return server
        time.sleep(0.25)
    return server


def selftest():
    """Start the backend and check what a first launch needs. Exit code 0 = fine."""
    server = start_backend()
    results, ok = {}, True
    checks = ["ping", "status", "paths", "system", "cpu", "audio", "voice", "downloads", "drives", "library", "packs",
              "models", "whatsnew", "settings", "profile", "radar", "vitals", "maps/countries", "update-check"]
    for name in checks:
        try:
            with urllib.request.urlopen(URL + "api/" + name, timeout=60) as r:
                body = r.read()
                json.loads(body)
                results[name] = f"{r.status} {len(body)} bytes"
        except Exception as e:
            results[name] = f"FAILED {e}"
            ok = ok and name in ("update-check",)   # needs the internet; not a failure of the app
    for page in ("", "app.js", "style.css", "sounds/click.ogg", "fonts/JetBrainsMonoNerdFont-Regular.ttf"):
        try:
            with urllib.request.urlopen(URL + page, timeout=10) as r:
                results["/" + page] = f"{r.status} {len(r.read())} bytes"
        except Exception as e:
            results["/" + page] = f"FAILED {e}"
            ok = False
    status = json.loads(urllib.request.urlopen(URL + "api/status", timeout=10).read())
    results["platform"] = status.get("platform")
    results["utf8_mode"] = sys.flags.utf8_mode
    ok = ok and status.get("platform") == "windows" and (sys.flags.utf8_mode == 1 or not FROZEN)
    results["kiwix-serve"] = server.winplat.kiwix_exe(server.APP_DIR)
    ok = ok and os.path.isfile(results["kiwix-serve"])
    results["ok"] = ok
    report = json.dumps(results, indent=2)
    print(report, flush=True)
    with open(os.path.join(os.getcwd(), "selftest.json"), "w", encoding="utf-8") as f:
        f.write(report)
    server.shutdown()
    return 0 if ok else 1


class Bridge:
    """What the page can ask of the window (window.umbraNative in app.js)."""

    def __init__(self):
        self.window = None
        self.closing = False
        self.full = False

    def message(self, text):
        if text == "close":
            self.closing = True
            self.window.destroy()
        elif text in ("fullscreen", "unfullscreen") and (text == "fullscreen") != self.full:
            self.full = not self.full
            self.window.toggle_fullscreen()


def main():
    if SELFTEST:
        sys.exit(selftest())

    kill_children_with_us()
    ctypes.windll.kernel32.CreateMutexW(None, False, MUTEX)
    # Tell Windows this is its own app (its own taskbar icon, not Python's).
    ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("umbraxc.UmbraWiki")

    server = None
    if not backend_up():   # a second window shares the first one's backend
        server = start_backend()

    args = " ".join(a for a in sys.argv[1:] if not a.startswith("-psn")).strip()
    if args == "--profile":
        query = "?view=profile"
    elif args == "--loadout":
        query = "?view=loadout"
    else:
        query = "?" + urllib.parse.urlencode({"q": args}) if args else ""

    # Sounds play in the page, from the start (no click needed first).
    os.environ.setdefault("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS", "--autoplay-policy=no-user-gesture-required")
    import webview

    bridge = Bridge()
    if backend_up():
        window = webview.create_window("Umbra Wiki", URL + query, js_api=bridge, width=1180, height=820,
                                       min_size=(760, 560), background_color="#090909", text_select=True)
    else:
        window = webview.create_window("Umbra Wiki", html=(
            "<body style='background:#090909;color:#d35f5f;font:15px Consolas,monospace;padding:40px'>"
            "UMBRA WIKI // the background service didn't start.<br><br>"
            "Details are in %LOCALAPPDATA%\\UmbraWiki\\umbra.log</body>"), width=900, height=500, background_color="#090909")
    bridge.window = window

    def on_closing():
        """Ask the page first: it confirms, plays the outro and says "close".
        If it can't answer, the window just closes."""
        if bridge.closing:
            return True

        def ask():
            try:
                answer = window.evaluate_js("typeof window.umbraExit === 'function' ? window.umbraExit() : 'no'")
            except Exception:
                answer = "no"
            if answer != "ok":
                bridge.closing = True
                window.destroy()
        threading.Thread(target=ask, daemon=True).start()
        return False

    window.events.closing += on_closing
    webview.start(gui="edgechromium", private_mode=False, storage_path=os.path.join(DATA, "webview"))
    if server:
        server.shutdown()
    os._exit(0)


if __name__ == "__main__":
    main()
