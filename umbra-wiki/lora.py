"""Umbra's LoRa radio: Meshtastic radios for messages, check-ins, positions
and waypoints over kilometres, with no phone network and no internet.

The radio stack (the official meshtastic library) is installed on request
into its own Python environment in Umbra's data folder, and runs in its own
process (lora_worker.py). This module finds radios on USB by their USB IDs
(only boards Meshtastic runs on: a modem or a GPS is never touched), keeps
the node list and the messages, and passes commands to the worker.
"""
import glob
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time

ENGINE = ["meshtastic==2.7.11"]
# USB chips and boards Meshtastic radios use: (vendor, product) → what it likely is.
BOARDS = {
    ("10c4", "ea60"): "Silicon Labs CP210x (Heltec, T-Beam, many ESP32 radios)",
    ("1a86", "7523"): "CH340 (LilyGO and other ESP32 radios)",
    ("1a86", "55d4"): "CH9102 (LilyGO T-Beam, T3)",
    ("1a86", "55d3"): "CH9102 (LilyGO)",
    ("303a", "1001"): "ESP32-S3 (Heltec V3, T-Deck, Station G2…)",
    ("303a", "4001"): "ESP32-S3 (LilyGO T3-S3)",
    ("239a", "8029"): "RAK4631 (RAK WisBlock)",
    ("239a", "0029"): "nRF52840 (LilyGO T-Echo, RAK)",
    ("239a", "4405"): "nRF52840 (Adafruit, RAK)",
    ("2886", "0057"): "Seeed SenseCAP T1000-E",
    ("2886", "0059"): "Seeed XIAO / Wio Tracker",
    ("1915", "520f"): "nRF52840 radio",
}


def usb_id(dev):
    """(vendor, product, maker, name) of a serial device, from sysfs."""
    try:
        p = os.path.realpath(f"/sys/class/tty/{os.path.basename(dev)}/device")
        for _ in range(4):
            if os.path.exists(os.path.join(p, "idVendor")):
                rd = lambda f: open(os.path.join(p, f)).read().strip() if os.path.exists(os.path.join(p, f)) else ""
                return rd("idVendor").lower(), rd("idProduct").lower(), rd("manufacturer"), rd("product")
            p = os.path.dirname(p)
    except OSError:
        pass
    return "", "", "", ""


def find_radios(windows=False):
    out = []
    if windows:
        try:
            from serial.tools import list_ports
            for p in list_ports.comports():
                key = (f"{p.vid:04x}" if p.vid else "", f"{p.pid:04x}" if p.pid else "")
                if key in BOARDS:
                    out.append({"path": p.device, "kind": BOARDS[key], "maker": p.manufacturer or "", "name": p.product or "", "access": True})
        except Exception:
            pass
        return out
    for dev in sorted(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*")):
        vid, pid, maker, name = usb_id(dev)
        if (vid, pid) in BOARDS:
            out.append({"path": dev, "kind": BOARDS[(vid, pid)], "maker": maker, "name": name,
                        "access": os.access(dev, os.R_OK | os.W_OK)})
    return out


def serial_group():
    """The group that may use serial ports here (uucp on Arch, dialout on Debian and Ubuntu)."""
    try:
        import grp
        for g in ("uucp", "dialout"):
            try:
                grp.getgrnam(g)
                return g
            except KeyError:
                continue
    except ImportError:
        pass
    return "uucp"


def friendly(msg):
    """A radio error in plain words."""
    m = str(msg).lower()
    if "permission denied" in m:
        return "Umbra isn't allowed to use the serial port yet: allow it below, then log out and back in."
    if "connection refused" in m or "no route" in m or "timed out" in m and "connect" in m:
        return "No radio answered at that address. Is its Wi-Fi on, and on this network?"
    if "timed out waiting" in m or "timeout" in m:
        return "The radio didn't answer. Is Meshtastic installed on it? Try unplugging it and plugging it back in."
    if "no such file" in m or "could not open port" in m:
        return "The radio was unplugged."
    if "busy" in m or "resource temporarily unavailable" in m:
        return "Another program is using the radio (a Meshtastic app or the web client?). Close it and try again."
    return str(msg)[:200]


class Lora:
    def __init__(self, data_dir, record=None, windows=False):
        self.dir = os.path.join(data_dir, "lora")
        self.msgs_file = os.path.join(self.dir, "messages.json")
        self.windows = windows
        self.record = record or (lambda *a, **k: None)
        self.state = {"active": False, "phase": "", "error": ""}
        self.proc = None
        self.inq = None   # commands for the in-app worker (Windows build)
        self.lock = threading.Lock()
        self.info = None
        self.nodes = {}
        self.connected = False
        self.target = ""
        self.error = ""
        self.events = []
        self.messages = self._load()

    # ---------------------------------------------------------- install
    def _python(self):
        if self.windows or getattr(sys, "frozen", False):
            return None
        return os.path.join(self.dir, "env", "bin", "python")

    def engine_ok(self):
        if self._python() is None:
            try:
                import meshtastic  # noqa: F401
                return True
            except Exception:
                return False
        return os.path.exists(os.path.join(self.dir, "env", ".engine-ok"))

    def install(self):
        if self.state["active"]:
            return self.status()
        self.state = {"active": True, "phase": "engine", "error": ""}

        def go():
            try:
                os.makedirs(self.dir, exist_ok=True)
                env = os.path.join(self.dir, "env")
                if not os.path.exists(self._python()):
                    subprocess.run([sys.executable, "-m", "venv", env], check=True, capture_output=True, timeout=300)
                r = subprocess.run([self._python(), "-m", "pip", "install", "--disable-pip-version-check", "-q", *ENGINE],
                                   capture_output=True, text=True, timeout=1800)
                if r.returncode:
                    raise RuntimeError("The radio software couldn't be installed: " + (r.stderr.strip().splitlines() or ["no internet?"])[-1][:160])
                open(os.path.join(env, ".engine-ok"), "w").close()
                self.state = {"active": False, "phase": "done", "error": ""}
            except Exception as exc:
                self.state = {"active": False, "phase": "error", "error": str(exc)[:240]}
        threading.Thread(target=go, daemon=True).start()
        return self.status()

    # ---------------------------------------------------------- status
    def status(self, take=False):
        """take: hand over the new events (the window shows them once)."""
        with self.lock:
            events = list(self.events)
            if take:
                self.events = []
            return {"engine": self.engine_ok(), "install": dict(self.state), "radios": find_radios(self.windows),
                    "group": serial_group(), "connected": self.connected, "target": self.target, "error": self.error,
                    "info": self.info, "nodes": sorted(self.nodes.values(), key=lambda n: -(n.get("heard") or 0)),
                    "messages": self.messages[-200:], "events": events, "windows": self.windows}

    # ------------------------------------------------------- connection
    def connect(self, port="", host="", fake=False):
        self.disconnect()
        if not fake and not self.engine_ok():
            raise ValueError("The radio software isn't installed yet.")
        if port and not any(r["path"] == port for r in find_radios(self.windows)):
            raise ValueError("That isn't a radio Umbra recognises.")
        if host and not re.fullmatch(r"[A-Za-z0-9.-]{1,80}", host):
            raise ValueError("That isn't a network address.")
        args = ["--fake"] if fake else ["--host", host] if host else ["--port", port]
        self.target = "simulated radio" if fake else host or port
        self.error = ""
        if self._python() is None:   # no separate Python (Windows build): the worker runs in a thread here
            import queue
            import lora_worker
            lora_worker.SINK = self._event
            self.inq = queue.Queue()
            q = self.inq

            def commands():
                while True:
                    c = q.get()
                    yield c
                    if c is None:
                        return
            threading.Thread(target=lora_worker.main, args=(args, commands()), daemon=True).start()
            return {"ok": True}
        worker = os.path.join(os.path.dirname(os.path.abspath(__file__)), "lora_worker.py")
        py = self._python() if not fake else (self._python() if self.engine_ok() else sys.executable)
        self.proc = subprocess.Popen([py or sys.executable, worker, *args], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                     stderr=subprocess.DEVNULL, text=True, bufsize=1)
        threading.Thread(target=self._read, args=(self.proc,), daemon=True).start()
        return {"ok": True}

    def disconnect(self):
        if self.inq:
            self.inq.put(None)
            self.inq = None
        p, self.proc = self.proc, None
        self.connected = False
        if p and p.poll() is None:
            try:
                p.terminate()
            except OSError:
                pass

    def _read(self, proc):
        for line in proc.stdout:
            try:
                ev = json.loads(line)
            except ValueError:
                continue
            self._event(ev)
        if proc is self.proc:
            self.connected = False
            self.events.append({"t": "lost"})

    def _event(self, ev):
        kind = ev.get("ev")
        with self.lock:
            if kind == "connected":
                self.connected, self.info = True, ev.get("info")
                self.nodes = {n["id"]: n for n in ev.get("nodes") or [] if n.get("id")}
                self.events.append({"t": "connected"})
                self.record("loraConnected")
            elif kind == "info":
                self.info = ev.get("info")
            elif kind == "nodes":
                for n in ev.get("nodes") or []:
                    if n.get("id"):
                        self.nodes[n["id"]] = {**self.nodes.get(n["id"], {}), **{k: v for k, v in n.items() if v is not None}}
                self.record("loraNodes", value=len(self.nodes))
            elif kind == "node":
                n = ev.get("node") or {}
                if n.get("id"):
                    self.nodes[n["id"]] = {**self.nodes.get(n["id"], {}), **{k: v for k, v in n.items() if v is not None}}
            elif kind == "packet":
                pk = ev.get("packet") or {}
                node = self.nodes.setdefault(pk.get("from", "?"), {"id": pk.get("from", "?")})
                if pk.get("snr") is not None:
                    node["snr"] = pk["snr"]
                node["heard"] = int(time.time())
                if pk.get("lat") is not None:
                    node.update(lat=pk["lat"], lon=pk["lon"])
                if pk.get("text") or pk.get("waypoint"):
                    msg = {"id": secrets.token_hex(5), "from": pk.get("from"), "to": pk.get("to"), "text": pk.get("text", ""),
                           "waypoint": pk.get("waypoint"), "snr": pk.get("snr"), "rssi": pk.get("rssi"), "hops": pk.get("hops"),
                           "at": pk.get("at") or int(time.time() * 1000), "me": False}
                    self.messages.append(msg)
                    self.events.append({"t": "msg", "from": self._name(pk.get("from")), "text": pk.get("text") or ("◈ " + (pk.get("waypoint") or {}).get("name", ""))})
                    self.record("loraReceived")
                    if pk.get("hops"):
                        self.record("loraHops", value=pk["hops"])
                    self._save()
            elif kind in ("sent", "ack"):
                for m in reversed(self.messages[-50:]):
                    if m.get("ref") == ev.get("ref"):
                        m["state"] = "sent" if kind == "sent" else ("delivered" if ev.get("ok") else "failed")
                        break
                self._save()
            elif kind == "lost":
                self.connected = False
                self.events.append({"t": "lost"})
            elif kind == "error":
                self.error = friendly(ev.get("message", ""))
                if not self.connected:
                    self.events.append({"t": "error", "message": self.error})

    def _name(self, nid):
        n = self.nodes.get(nid) or {}
        return n.get("long") or n.get("short") or nid or "A radio"

    # --------------------------------------------------------- commands
    def command(self, cmd):
        if not (self.connected and (self.inq or (self.proc and self.proc.poll() is None))):
            raise ValueError("No radio is connected.")
        ref = secrets.token_hex(4)
        if cmd.get("cmd") in ("text", "waypoint", "position"):
            text = cmd.get("text") or (("◈ " + cmd.get("name", "")) if cmd.get("cmd") == "waypoint" else "⌖ position")
            self.messages.append({"id": ref, "ref": ref, "from": (self.info or {}).get("me", {}).get("id"), "to": cmd.get("to") or "^all",
                                  "text": text, "at": int(time.time() * 1000), "me": True, "state": "sending",
                                  **({"waypoint": {"name": cmd["name"], "lat": cmd["lat"], "lon": cmd["lon"]}} if cmd.get("cmd") == "waypoint" else {})})
            self._save()
            self.record("loraSent")
        if self.inq:
            self.inq.put({**cmd, "ref": ref})
        else:
            self.proc.stdin.write(json.dumps({**cmd, "ref": ref}) + "\n")
            self.proc.stdin.flush()
        return {"ok": True, "ref": ref}

    # --------------------------------------------------------- storage
    def _load(self):
        try:
            data = json.load(open(self.msgs_file))
            return data if isinstance(data, list) else []
        except (OSError, ValueError):
            return []

    def _save(self):
        os.makedirs(self.dir, exist_ok=True)
        tmp = self.msgs_file + ".tmp"
        with open(tmp, "w") as f:
            json.dump(self.messages[-1000:], f)
        os.replace(tmp, self.msgs_file)
