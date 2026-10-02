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

import base64
import ctypes
import io
import itertools
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


class WebPane:
    """Umbra Online's built-in browser on Windows: Edge WebView2 controls (one
    per tab) laid over the space the page keeps free (#web .web-view), driven
    by the same "web:{json}" messages as the Linux launcher's WebPane. Every
    change runs on the window's thread; events go back to the page through
    UmbraWeb.host(...). Anything that fails leaves Umbra's usual online mode."""

    SCHEMES = ("http://", "https://")

    def __init__(self, window):
        self.window = window
        self.form = None
        self.tabs, self.order, self.active = {}, [], None
        self.loading, self.ids = {}, itertools.count(1)
        self.rect, self.shown, self.ratio = (0, 0, 10, 10), False, 1.0
        self.last_selact = 0
        try:
            self.reader = open(os.path.join(HERE, "ui", "web-page.js"), encoding="utf-8").read()
        except OSError:
            self.reader = ""

    def start(self):
        """Once the window exists: load the WebView2 types, then tell the page."""
        try:
            import clr  # noqa: F401  (pythonnet, already loaded by pywebview)
            from System import Action
            self.Action = Action
            self.form = self.window.native
            from Microsoft.Web.WebView2.WinForms import WebView2  # noqa: F401
            self.window.evaluate_js("window.UMBRA_WEB = 1")
            print("web: ready", flush=True)
        except Exception as e:
            self.form = None
            print("web: not available:", e, flush=True)

    def ui(self, fn):
        """Run on the window's thread (WinForms controls live there)."""
        def safe():
            try:
                fn()
            except Exception as e:
                print("web:", repr(e), flush=True)
        if self.form is not None:
            self.form.BeginInvoke(self.Action(safe))

    def send(self, event):
        js = ("try { window.UmbraWeb && UmbraWeb.host(" + json.dumps(event, ensure_ascii=True)
              + ") } catch (e) { console.error('UmbraWeb:', e) }")
        self.ui(lambda: self.form.webview.CoreWebView2.ExecuteScriptAsync(js))

    # ------------------------------------------------------------ tabs
    def tab_info(self, tid):
        v = self.tabs[tid]
        core = v.CoreWebView2
        url = str(core.Source) if core is not None else ""
        if url == "about:blank":
            url = ""
        return {"id": tid, "title": str(core.DocumentTitle) if core is not None else "", "url": url,
                "loading": bool(self.loading.get(tid)), "progress": 0.35 if self.loading.get(tid) else 1,
                "back": bool(core and core.CanGoBack), "forward": bool(core and core.CanGoForward), "secure": url.startswith("https://")}

    def send_tabs(self):
        self.send({"t": "tabs", "active": self.active, "tabs": [self.tab_info(t) for t in self.order]})

    def new_tab(self, url=""):
        from Microsoft.Web.WebView2.WinForms import WebView2, CoreWebView2CreationProperties
        from System.Drawing import Color, Rectangle
        tid = next(self.ids)
        v = WebView2()
        props = CoreWebView2CreationProperties()
        props.UserDataFolder = os.path.join(DATA, "web")
        v.CreationProperties = props
        v.DefaultBackgroundColor = Color.White
        v.Visible = False
        v.Bounds = Rectangle(*self.rect)
        self.form.Controls.Add(v)
        v.BringToFront()
        self.tabs[tid] = v
        self.order.append(tid)
        v.CoreWebView2InitializationCompleted += lambda s, a, tid=tid, url=url: self.ready(tid, a, url)
        v.EnsureCoreWebView2Async(None)
        self.select(tid)
        return tid

    def ready(self, tid, args, url):
        v = self.tabs.get(tid)
        if v is None:
            return
        if not args.IsSuccess:
            self.send({"t": "failed", "tab": tid, "url": url, "tls": False, "message": "The browser couldn't start."})
            return
        core = v.CoreWebView2
        st = core.Settings
        st.AreDevToolsEnabled = False
        st.IsStatusBarEnabled = False
        st.AreDefaultScriptDialogsEnabled = True
        if self.reader:
            core.AddScriptToExecuteOnDocumentCreatedAsync(self.reader)
        core.WebMessageReceived += lambda s, e, tid=tid: self.on_message(tid, e)
        core.NavigationStarting += lambda s, e, tid=tid: self.on_start(tid, e)
        core.NavigationCompleted += lambda s, e, tid=tid: self.on_done(tid, e)
        core.SourceChanged += lambda s, e: self.send_tabs()
        core.DocumentTitleChanged += lambda s, e: self.send_tabs()
        core.HistoryChanged += lambda s, e: self.send_tabs()
        core.NewWindowRequested += self.on_new_window
        core.PermissionRequested += self.on_permission
        core.DownloadStarting += self.on_download
        core.ProcessFailed += lambda s, e, tid=tid: self.send({"t": "crashed", "tab": tid})
        if url:
            self.load(tid, url)
        self.send_tabs()

    def load(self, tid, url):
        v = self.tabs.get(tid)
        url = (url or "").strip()
        if v is not None and v.CoreWebView2 is not None and url.startswith(self.SCHEMES):
            v.CoreWebView2.Navigate(url)

    def select(self, tid):
        if tid not in self.tabs:
            return
        self.active = tid
        for t, v in self.tabs.items():
            v.Visible = self.shown and t == tid
        if self.shown:
            self.tabs[tid].BringToFront()
            self.tabs[tid].Focus()
        self.send_tabs()
        self.extract()

    def close_tab(self, tid):
        v = self.tabs.pop(tid, None)
        if v is None:
            return
        i = self.order.index(tid)
        self.order.remove(tid)
        self.loading.pop(tid, None)
        self.form.Controls.Remove(v)
        v.Dispose()
        if self.active == tid:
            self.active = None
            if self.order:
                self.select(self.order[max(0, i - 1)])
        self.send_tabs()

    def end(self):
        for tid in list(self.order):
            self.close_tab(tid)
        self.place(None, False)

    # --------------------------------------------------------- placement
    def place(self, rect, show, page_width=0):
        from System.Drawing import Rectangle
        if page_width:
            self.ratio = self.form.webview.Width / float(page_width)
        if rect:
            k = self.ratio
            self.rect = tuple(max(0, int(round(float(n) * k))) for n in rect)
        show = bool(show and rect and self.order)
        for t, v in self.tabs.items():
            v.Bounds = Rectangle(*self.rect)
            v.Visible = show and t == self.active
        if show and self.active in self.tabs:
            self.tabs[self.active].BringToFront()
        self.shown = show

    def snapshot(self, purpose, then=None):
        from Microsoft.Web.WebView2.Core import CoreWebView2CapturePreviewImageFormat
        from System.IO import MemoryStream
        v = self.tabs.get(self.active)
        if v is None or v.CoreWebView2 is None:
            if then:
                then()
            return
        stream = MemoryStream()
        task = v.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream)

        def done():
            try:
                from PIL import Image
                img = Image.open(io.BytesIO(bytes(stream.ToArray()))).convert("RGB")
                if img.width > 1280:
                    img = img.resize((1280, max(1, img.height * 1280 // img.width)))
                if purpose == "cover":
                    img = Image.blend(img, Image.new("RGB", img.size, (9, 9, 9)), 0.42)
                buf = io.BytesIO()
                img.save(buf, "PNG" if purpose == "cover" else "JPEG", quality=82)
                self.send({"t": "snapshot", "purpose": purpose, "tab": self.active,
                           "type": "png" if purpose == "cover" else "jpeg", "data": base64.b64encode(buf.getvalue()).decode()})
            except Exception as e:
                self.send({"t": "snapshot", "purpose": purpose, "error": str(e)[:200]})
            if then:
                then()
        task.GetAwaiter().OnCompleted(self.Action(done))

    def extract(self, tid=None):
        v = self.tabs.get(tid or self.active)
        if v is not None and v.CoreWebView2 is not None:
            v.CoreWebView2.ExecuteScriptAsync("window.__umbraRead && __umbraRead(true)")

    # ------------------------------------------------------------ events
    def on_message(self, tid, e):
        try:
            data = json.loads(str(e.TryGetWebMessageAsString()))
        except Exception:
            return
        if not isinstance(data, dict) or data.get("t") not in ("page", "sel", "selact", "seen", "key"):
            return
        if data["t"] == "selact":   # web pages could post this too: never more than one every two seconds
            if time.time() - self.last_selact < 2:
                return
            self.last_selact = time.time()
        if data["t"] == "key":
            if data.get("key") not in ("ctrl+l", "ctrl+t", "ctrl+w", "ctrl+tab", "ctrl+shift+tab", "f1", "f6", "ctrl+k", "ctrl+b"):
                return
        data["tab"] = tid
        self.send(data)

    def on_start(self, tid, e):
        uri = str(e.Uri or "")
        if uri.startswith(("mailto:", "tel:", "magnet:")):
            e.Cancel = True
            self.send({"t": "handoff", "url": uri})
            return
        if not uri.startswith(self.SCHEMES + ("about:", "data:", "blob:")):
            e.Cancel = True
            return
        self.loading[tid] = True
        self.send({"t": "nav", "tab": tid, "url": uri})
        self.send_tabs()

    def on_done(self, tid, e):
        self.loading[tid] = False
        if not e.IsSuccess:
            status = str(e.WebErrorStatus)
            if status != "OperationCanceled":
                v = self.tabs.get(tid)
                url = str(v.CoreWebView2.Source) if v is not None and v.CoreWebView2 is not None else ""
                self.send({"t": "failed", "tab": tid, "url": url, "tls": status.startswith("Certificate"),
                           "message": "The site didn't answer (" + status + ")."})
        self.send_tabs()

    def on_new_window(self, sender, e):
        e.Handled = True
        uri = str(e.Uri or "")
        if uri.startswith(self.SCHEMES):
            self.new_tab(uri)

    def on_permission(self, sender, e):
        from Microsoft.Web.WebView2.Core import CoreWebView2PermissionState
        e.State = CoreWebView2PermissionState.Deny

    def on_download(self, sender, e):
        folder = os.path.join(os.path.expanduser("~"), "Downloads")
        try:
            os.makedirs(folder, exist_ok=True)
            name = os.path.basename(str(e.ResultFilePath)) or "download"
            base, ext = os.path.splitext(name)
            path, n = os.path.join(folder, name), 1
            while os.path.exists(path):
                n += 1
                path = os.path.join(folder, f"{base} ({n}){ext}")
            e.ResultFilePath = path
            e.Handled = True   # no browser download bubble: Umbra tells the user
            op = e.DownloadOperation
            self.send({"t": "download", "state": "started", "name": os.path.basename(path), "path": path})

            def changed(s, a):
                state = str(op.State)
                if state == "Completed":
                    self.send({"t": "download", "state": "finished", "path": path})
                elif state == "Interrupted":
                    self.send({"t": "download", "state": "failed", "message": str(op.InterruptReason)})
            op.StateChanged += changed
        except Exception as ex:
            print("web download:", ex, flush=True)

    # ---------------------------------------------------------- commands
    def command(self, cmd):
        if self.form is not None:
            self.ui(lambda: self.run(cmd))

    def run(self, cmd):
        c = cmd.get("c")
        v = self.tabs.get(self.active)
        if c == "rect":
            r = cmd.get("rect")
            self.place((r["x"], r["y"], r["w"], r["h"]) if r else None, cmd.get("show"), float(r.get("vw") or 0) if r else 0)
        elif c == "cover":
            self.snapshot("cover", lambda: self.place(None, False))
        elif c == "open":
            url = str(cmd.get("url", ""))
            if cmd.get("newTab") or v is None:
                self.new_tab(url)
            else:
                self.load(self.active, url)
        elif c == "select":
            self.select(int(cmd.get("id", 0)))
        elif c == "close":
            self.close_tab(int(cmd.get("id", 0)))
        elif c == "end":
            self.end()
        elif c == "sync":
            self.send_tabs()
            self.extract()
        elif c == "extract":
            self.extract()
        elif c == "snapshot":
            self.snapshot(str(cmd.get("purpose", "vision")))
        elif c == "focus" and v is not None:
            v.Focus()
        elif c == "external":
            open_in_browser(str(cmd.get("url", "")), str(cmd.get("app", "")))
            self.send({"t": "external", "ok": True})
        elif v is not None and v.CoreWebView2 is not None and c in ("back", "forward", "reload", "stop"):
            core = v.CoreWebView2
            {"back": core.GoBack, "forward": core.GoForward, "reload": core.Reload, "stop": core.Stop}[c]()


def open_in_browser(url, app=""):
    """Hand a page to the user's browser: the one chosen in Settings (a
    StartMenuInternet name from the registry), else the default one."""
    if not url.startswith(("http://", "https://", "mailto:")):
        return
    if app:
        try:
            import shlex
            import subprocess
            import winreg
            for root in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
                try:
                    with winreg.OpenKey(root, rf"SOFTWARE\Clients\StartMenuInternet\{app}\shell\open\command") as k:
                        command = winreg.QueryValue(k, None)
                    exe = shlex.split(command, posix=False)[0].strip('"')
                    subprocess.Popen([exe, url])
                    return
                except OSError:
                    continue
        except Exception as e:
            print("open in browser:", e, flush=True)
    os.startfile(url)


class Bridge:
    """What the page can ask of the window (window.umbraNative in app.js).
    pywebview offers the page every public attribute, so the rest is private."""

    def __init__(self):
        self._window = None
        self._closing = False
        self._full = False
        self._web = None

    def message(self, text):
        if text.startswith("web:") and self._web is not None:
            try:
                cmd = json.loads(text[4:])
            except ValueError:
                return
            if isinstance(cmd, dict):
                self._web.command(cmd)
            return
        if text == "focus" and self._web is not None and self._web.form is not None:
            self._web.ui(lambda: self._web.form.webview.Focus())
            return
        if text == "close":
            self._closing = True
            self._window.destroy()
        elif text in ("fullscreen", "unfullscreen") and (text == "fullscreen") != self._full:
            self._full = not self._full
            self._window.toggle_fullscreen()
        elif text.startswith("zoom:"):   # Ctrl + wheel in the page (app.js): zoom everything
            try:
                self._zoom(max(0.5, min(2.0, float(text[5:]))))
            except ValueError:
                pass

    def _zoom(self, level):
        """WebView2's own zoom, set on the window's thread."""
        try:
            from System import Action
            form = self._window.native
            form.Invoke(Action(lambda: setattr(form.webview, "ZoomFactor", level)))
        except Exception as e:
            print("zoom failed:", e, flush=True)


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
    # 1180 x 820, or less on a small screen.
    width, height = 1180, 820
    try:
        screen = webview.screens[0]
        width, height = min(width, int(screen.width * 0.92)), min(height, int(screen.height * 0.88))
    except Exception:
        pass
    if backend_up():
        window = webview.create_window("Umbra Wiki", URL + query, js_api=bridge, width=width, height=height,
                                       min_size=(760, 560), background_color="#090909", text_select=True)
    else:
        window = webview.create_window("Umbra Wiki", html=(
            "<body style='background:#090909;color:#d35f5f;font:15px Consolas,monospace;padding:40px'>"
            "UMBRA WIKI // the background service didn't start.<br><br>"
            "Details are in %LOCALAPPDATA%\\UmbraWiki\\umbra.log</body>"), width=900, height=500, background_color="#090909")
    bridge._window = window
    # Umbra Online: the built-in browser, once the window is up.
    web = WebPane(window)
    bridge._web = web

    def loaded():   # also after a reload of the page: it forgets the flag
        if web.form is None:
            web.start()
        else:
            window.evaluate_js("window.UMBRA_WEB = 1")
    window.events.loaded += loaded

    def on_closing():
        """Ask the page first: it confirms, plays the outro and says "close".
        If it can't answer, the window just closes."""
        if bridge._closing:
            return True

        def ask():
            try:
                answer = window.evaluate_js("typeof window.umbraExit === 'function' ? window.umbraExit() : 'no'")
            except Exception:
                answer = "no"
            if answer != "ok":
                bridge._closing = True
                window.destroy()
        threading.Thread(target=ask, daemon=True).start()
        return False

    window.events.closing += on_closing
    if os.environ.get("UMBRA_PROBE"):   # the build's window check: report what the page shows
        def probe():
            for wait in (20, 30, 30):
                time.sleep(wait)
                try:
                    print("probe:", window.evaluate_js(
                        "JSON.stringify({status: document.querySelector('#t-status').textContent, body: document.body.className,"
                        " tour: !!document.querySelector('.tour, #tour'), text: document.body.innerText.slice(0, 300)})"), flush=True)
                    t0 = time.time()
                    urllib.request.urlopen(URL + "api/status", timeout=30).read()
                    print(f"probe: /api/status took {time.time() - t0:.1f}s", flush=True)
                    t0 = time.time()
                    urllib.request.urlopen(URL + "api/downloads", timeout=30).read()
                    print(f"probe: /api/downloads took {time.time() - t0:.1f}s", flush=True)
                    before = window.evaluate_js("innerWidth")
                    window.evaluate_js("document.dispatchEvent(new KeyboardEvent('keydown', {key: '=', ctrlKey: true, bubbles: true, cancelable: true}))")
                    time.sleep(1.5)
                    after = window.evaluate_js("JSON.stringify({w: innerWidth, dpr: devicePixelRatio, zoom: window.umbraZoom})")
                    print(f"probe: zoom in: width {before} -> {after}", flush=True)
                    window.evaluate_js("document.dispatchEvent(new KeyboardEvent('keydown', {key: '0', ctrlKey: true, bubbles: true, cancelable: true}))")
                    time.sleep(1)
                except Exception as e:
                    print("probe failed:", e, flush=True)
        threading.Thread(target=probe, daemon=True).start()

        def probe_web():   # Umbra Online: open a page in the built-in browser, report what Umbra read
            time.sleep(38)
            try:
                print("probe web: available", window.evaluate_js("String(!!(window.UmbraWeb && UmbraWeb.available))"), flush=True)
                window.evaluate_js("setOnline(true); UmbraWeb.enter().then(() => UmbraWeb.go('https://en.wikipedia.org/wiki/Aurora'))")
                for _ in range(4):
                    time.sleep(10)
                    print("probe web:", window.evaluate_js(
                        "JSON.stringify({open: UmbraWeb.open, tabs: [...document.querySelectorAll('.web-tab')].map(t => t.textContent.trim().slice(0, 40)),"
                        " addr: document.querySelector('.web-addr input')?.value, error: document.querySelector('.web-error')?.hidden === false,"
                        " notes: [...document.querySelectorAll('.web-note .label')].map(n => n.textContent.slice(0, 30)),"
                        " rect: JSON.stringify(document.querySelector('.web-view')?.getBoundingClientRect())})"), flush=True)
                print("probe web: browsers", urllib.request.urlopen(URL + "api/web/browsers", timeout=20).read()[:300], flush=True)
            except Exception as e:
                print("probe web failed:", e, flush=True)
        threading.Thread(target=probe_web, daemon=True).start()
    webview.start(gui="edgechromium", private_mode=False, storage_path=os.path.join(DATA, "webview"))
    if server:
        server.shutdown()
    os._exit(0)


if __name__ == "__main__":
    main()
