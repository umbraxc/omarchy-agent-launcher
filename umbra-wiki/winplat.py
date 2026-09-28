"""Umbra Wiki on Windows: where things live and how the system is read.

Imported by the backend only on Windows (the Windows app, built by
windows/build.yml). Linux keeps its own code paths in server.py and radar.py.
Uses psutil (bundled with the Windows app) for processor, memory, battery and
network readings.
"""

import ctypes
import hashlib
import json
import os
import re
import shutil
import subprocess
import threading
import time
import urllib.request

import psutil

CREATE_NO_WINDOW = 0x08000000
CREATE_BREAKAWAY_FROM_JOB = 0x01000000
DETACHED_PROCESS = 0x00000008


def hide_consoles():
    """The app has no console, so every tool it runs (kiwix-serve, Ollama,
    netsh, PowerShell) would flash a black window: start them hidden."""
    base = subprocess.Popen

    class Hidden(base):
        def __init__(self, *args, **kwargs):
            kwargs["creationflags"] = kwargs.get("creationflags", 0) | CREATE_NO_WINDOW
            kwargs.pop("start_new_session", None)
            super().__init__(*args, **kwargs)

    subprocess.Popen = Hidden


# ------------------------------------------------------------------ places

def config_dir():
    return os.path.join(os.environ.get("APPDATA") or os.path.expanduser("~\\AppData\\Roaming"), "UmbraWiki")


def data_dir():
    return os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~\\AppData\\Local"), "UmbraWiki")


def documents_dir():
    """The user's Documents folder (wherever Windows keeps it, OneDrive included)."""
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER,
                            r"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders") as key:
            path = os.path.expandvars(winreg.QueryValueEx(key, "Personal")[0])
        if os.path.isdir(path):
            return path
    except OSError:
        pass
    return os.path.join(os.path.expanduser("~"), "Documents")


def removable_drives():
    """USB sticks and memory cards: (root, label) for each removable drive."""
    out = []
    k32 = ctypes.windll.kernel32
    mask = k32.GetLogicalDrives()
    for i in range(26):
        if not mask & (1 << i):
            continue
        root = f"{chr(65 + i)}:\\"
        if k32.GetDriveTypeW(root) != 2:   # DRIVE_REMOVABLE
            continue
        label = ctypes.create_unicode_buffer(261)
        if not k32.GetVolumeInformationW(root, label, 261, None, None, None, None, 0):
            continue   # empty card reader
        out.append((root, label.value or f"Drive {root[0]}"))
    return out


def open_path(target):
    os.startfile(target)


# -------------------------------------------------------------- processor

def cpu_times():
    """(busy, total) for the whole processor, then each thread, in seconds."""
    def pair(t):
        busy = t.user + t.system
        return (busy, busy + t.idle)
    try:
        return [pair(psutil.cpu_times())] + [pair(t) for t in psutil.cpu_times(percpu=True)]
    except (OSError, psutil.Error):
        return []


def umbra_ticks():
    """Processor time (1/100 s) used by Umbra: this app and its window, the
    library server and the local AI."""
    procs = {}
    me = psutil.Process()
    procs[me.pid] = me
    try:
        for p in me.children(recursive=True):
            procs[p.pid] = p
        for p in psutil.process_iter(["name"]):
            name = (p.info.get("name") or "").lower()
            if name.startswith("ollama") or name.startswith("kiwix-serve"):
                procs[p.pid] = p
    except psutil.Error:
        pass
    total = 0.0
    for p in procs.values():
        try:
            t = p.cpu_times()
            total += t.user + t.system
        except psutil.Error:
            continue
    return int(total * 100)


def physical_cores():
    return psutil.cpu_count(logical=False) or os.cpu_count() or 1


def cpu_name():
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
            name = winreg.QueryValueEx(key, "ProcessorNameString")[0]
        return re.sub(r"\s+", " ", name).replace("(R)", "").replace("(TM)", "").strip()
    except OSError:
        return "Unknown processor"


def memory():
    m = psutil.virtual_memory()
    return m.total, m.total - m.available


_gpus = None


def gpus():
    """Graphics cards, from Windows' device list (asked once)."""
    global _gpus
    if _gpus is None:
        try:
            out = subprocess.run(["powershell", "-NoProfile", "-Command",
                                  "(Get-CimInstance Win32_VideoController).Name"],
                                 capture_output=True, text=True, timeout=15).stdout
            _gpus = [line.strip() for line in out.splitlines() if line.strip()]
        except (OSError, subprocess.SubprocessError):
            _gpus = []
    return _gpus


def accel(cards):
    """Ollama for Windows uses NVIDIA and AMD Radeon cards by itself."""
    if any("nvidia" in c.lower() for c in cards):
        return "NVIDIA CUDA"
    if any("radeon" in c.lower() for c in cards):
        return "AMD ROCm"
    return None


def on_battery():
    try:
        b = psutil.sensors_battery()
        return bool(b) and not b.power_plugged
    except (OSError, psutil.Error, AttributeError):
        return False


# ------------------------------------------------- Ollama and kiwix-serve

def ollama_exe():
    found = shutil.which("ollama")
    if found:
        return found
    path = os.path.join(os.environ.get("LOCALAPPDATA", ""), "Programs", "Ollama", "ollama.exe")
    return path if os.path.isfile(path) else None


_ollama_proc = None


def start_ollama(url):
    """Ollama normally starts with Windows (its tray app). If it isn't
    running, start its server for as long as Umbra is open."""
    global _ollama_proc
    try:
        urllib.request.urlopen(url + "/api/version", timeout=2)
        return True
    except Exception:
        pass
    exe = ollama_exe()
    if not exe:
        return False
    try:
        _ollama_proc = subprocess.Popen([exe, "serve"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError:
        return False
    for _ in range(40):
        try:
            urllib.request.urlopen(url + "/api/version", timeout=1)
            return True
        except Exception:
            time.sleep(0.25)
    return False


def stop_ollama():
    if _ollama_proc and _ollama_proc.poll() is None:
        _ollama_proc.terminate()


def kiwix_exe(app_dir):
    path = os.path.join(app_dir, "kiwix", "kiwix-serve.exe")
    return path if os.path.isfile(path) else (shutil.which("kiwix-serve") or path)


# ------------------------------------------------------- library downloads

class Downloads:
    """Library collections download in a background thread (Linux uses a
    systemd unit and fetch-archive.sh). Downloads resume where they stopped,
    and nothing is kept unless its SHA-256 matches the catalog."""

    def __init__(self):
        self.thread = None
        self.stop = threading.Event()

    def active(self):
        return bool(self.thread and self.thread.is_alive())

    def start(self, entries, library_dir, on_done):
        if self.active():
            return True
        self.stop.clear()
        self.thread = threading.Thread(target=self._run, args=(entries, library_dir, on_done), daemon=True)
        self.thread.start()
        return True

    def halt(self):
        """Stop and wait, so the unfinished file is closed (Windows can't
        delete a file that's still open)."""
        self.stop.set()
        if self.thread:
            self.thread.join(timeout=15)

    def _run(self, entries, library_dir, on_done):
        os.makedirs(library_dir, exist_ok=True)
        got_any = False
        for c in entries:
            final = os.path.join(library_dir, c["file"])
            if os.path.exists(final):
                continue
            part = final + ".part"
            for attempt in range(6):
                if self.stop.is_set():
                    return
                try:
                    self._fetch(c["url"], part)
                    break
                except Exception as e:   # network trouble: try again, from where it stopped
                    print(f"umbra: download of {c['id']} interrupted ({e}); retrying", flush=True)
                    time.sleep(3 * (attempt + 1))
            else:
                continue
            if self.stop.is_set():
                return
            h = hashlib.sha256()
            with open(part, "rb") as f:
                for block in iter(lambda: f.read(1 << 20), b""):
                    h.update(block)
            if h.hexdigest() != c.get("sha256"):
                print(f"umbra: {c['id']} failed its checksum; removed", flush=True)
                os.remove(part)
                continue
            os.replace(part, final)
            got_any = True
        if got_any:
            on_done()

    def _fetch(self, url, part):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        req = urllib.request.Request(url, headers={"Range": f"bytes={have}-"} if have else {})
        with urllib.request.urlopen(req, timeout=30) as r:
            if have and r.status != 206:
                have = 0   # the server ignored the resume: start over
            with open(part, "ab" if have else "wb") as f:
                while not self.stop.is_set():
                    block = r.read(1 << 18)
                    if not block:
                        break
                    f.write(block)


# ---------------------------------------------------------------- updates

SETUP_ASSET = "Umbra-Wiki-Setup-{version}.exe"
SUMS_ASSET = "SHA256SUMS-windows.txt"


def release_assets(release, version):
    """The installer and checksum links in a GitHub release, if it has them."""
    urls = {a.get("name"): a.get("browser_download_url") for a in release.get("assets", [])}
    return urls.get(SETUP_ASSET.format(version=version)), urls.get(SUMS_ASSET)


def download_update(setup_url, sums_url, version, headers, progress):
    """Fetch the new installer into the temporary folder and check it against
    the release's checksums. Returns the installer's path."""
    name = SETUP_ASSET.format(version=version)
    folder = os.path.join(os.environ.get("TEMP") or data_dir(), "UmbraWikiUpdate")
    os.makedirs(folder, exist_ok=True)
    with urllib.request.urlopen(urllib.request.Request(sums_url, headers=headers), timeout=30) as r:
        sums = r.read().decode("utf-8", "replace")
    want = next((line.split()[0].lower() for line in sums.splitlines()
                 if line.strip().endswith(name) and line.split()), "")
    if not re.fullmatch(r"[0-9a-f]{64}", want):
        raise ValueError("the release has no checksum for the installer")
    path = os.path.join(folder, name)
    h = hashlib.sha256()
    with urllib.request.urlopen(urllib.request.Request(setup_url, headers=headers), timeout=60) as r, open(path + ".part", "wb") as f:
        total = int(r.headers.get("Content-Length") or 0)
        done = 0
        while True:
            block = r.read(1 << 18)
            if not block:
                break
            f.write(block)
            h.update(block)
            done += len(block)
            progress(done, total)
    if h.hexdigest() != want:
        os.remove(path + ".part")
        raise ValueError("the downloaded installer didn't match its checksum")
    os.replace(path + ".part", path)
    return path


def run_installer(path):
    """Start the installer on its own (it outlives this app, which closes so
    its files can be replaced). It waits for Umbra to close, installs quietly,
    keeps everything of the user's, and opens the new version."""
    subprocess.Popen([path, "/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/MERGETASKS=!ollama,!desktopicon", "/RELAUNCH=1"],
                     creationflags=CREATE_BREAKAWAY_FROM_JOB | DETACHED_PROCESS, close_fds=True)


# ---------------------------------------------------------------- removal

def uninstaller(app_dir):
    """Windows' own uninstaller for the app (from the installer), if present."""
    import sys
    folder = os.path.dirname(sys.executable) if getattr(sys, "frozen", False) else app_dir
    path = os.path.join(folder, "unins000.exe")
    return path if os.path.isfile(path) else None


def run_uninstaller(path):
    subprocess.Popen([path], creationflags=CREATE_BREAKAWAY_FROM_JOB | DETACHED_PROCESS, close_fds=True)


def remove_tree(path):
    shutil.rmtree(path, ignore_errors=True)


# ------------------------------------------------------------------ radar

def _netsh(*args):
    try:
        out = subprocess.run(["netsh", "wlan", *args], capture_output=True, timeout=15).stdout
    except (OSError, subprocess.SubprocessError):
        return ""
    for enc in ("utf-8", "mbcs"):
        try:
            return out.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return out.decode("latin-1")


def wifi_networks():
    """The Wi-Fi networks Windows can hear, from `netsh wlan`. Field names
    are matched loosely: some are translated on non-English Windows."""
    iface = _netsh("show", "interfaces")
    if not iface.strip() or "There is no wireless interface" in iface:
        return {"available": False, "enabled": True, "networks": [], "tool": "Windows"}
    connected = set()
    for m in re.finditer(r"(?im)^\s*BSSID\s*:\s*([0-9a-f:]{17})", iface):
        connected.add(m[1].lower())
    radio_off = bool(re.search(r"(?im)^\s*Radio status.*\n\s*.*Software Off", iface)) or "software off" in iface.lower()
    text = _netsh("show", "networks", "mode=bssid")
    nets, ssid, security = [], "", ""
    cur = None
    for raw in text.splitlines():
        line = raw.strip()
        key, _, value = line.partition(":")
        key, value = key.strip().lower(), value.strip()
        if re.match(r"^ssid \d+$", key):
            ssid, security = value, ""
        elif key.startswith("authentication"):
            security = value
        elif re.match(r"^bssid \d+$", key):
            cur = {"id": value.lower(), "name": ssid, "bssid": value, "channel": "", "freq": 0, "band": "", "rate": "",
                   "signal": 0, "security": security if security and security.lower() != "open" else "Open",
                   "mode": "Infra", "connected": value.lower() in connected, "maker": ""}
            nets.append(cur)
        elif cur is not None and key.startswith("signal"):
            cur["signal"] = int(re.sub(r"\D", "", value) or 0)
        elif cur is not None and key == "channel":
            cur["channel"] = value
            try:
                ch = int(value)
                cur["band"] = "2.4 GHz" if ch <= 14 else "5 GHz"
                cur["freq"] = 2407 + 5 * ch if ch <= 14 else 5000 + 5 * ch
            except ValueError:
                pass
        elif cur is not None and key == "band":
            cur["band"] = value
        elif cur is not None and key.startswith("radio type"):
            cur["rate"] = value
    return {"available": True, "enabled": not radio_off, "networks": nets, "tool": "Windows"}


_net_prev = {}


def vitals():
    out = {}
    try:
        b = psutil.sensors_battery()
        if b:
            out["battery"] = {"percent": int(b.percent),
                              "status": "Charging" if b.power_plugged and b.percent < 100 else "Full" if b.power_plugged else "Discharging"}
    except (OSError, psutil.Error, AttributeError):
        pass
    try:
        du = shutil.disk_usage(os.path.expanduser("~"))
        out["disk"] = {"total": du.total, "used": du.used}
    except OSError:
        pass
    now, nets = time.monotonic(), []
    try:
        stats, counters = psutil.net_if_stats(), psutil.net_io_counters(pernic=True)
    except (OSError, psutil.Error):
        stats, counters = {}, {}
    for name, st in stats.items():
        low = name.lower()
        if "loopback" in low or name not in counters:
            continue
        c = counters[name]
        prev = _net_prev.get(name)
        rate = ((c.bytes_recv - prev[1]) / max(0.2, now - prev[0]), (c.bytes_sent - prev[2]) / max(0.2, now - prev[0])) if prev else (0, 0)
        _net_prev[name] = (now, c.bytes_recv, c.bytes_sent)
        kind = "wifi" if re.search(r"wi-?fi|wlan|wireless", low) else "vpn" if re.search(r"vpn|wireguard|tap|tun", low) else "wwan" if "cellular" in low else "ethernet"
        if not st.isup and not (c.bytes_recv or c.bytes_sent):
            continue
        nets.append({"name": name, "kind": kind, "up": st.isup, "rx": max(0, rate[0]), "tx": max(0, rate[1])})
    out["net"] = nets
    try:
        out["uptime"] = int(time.time() - psutil.boot_time())
    except (OSError, psutil.Error):
        pass
    return out
