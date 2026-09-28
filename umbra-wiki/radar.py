"""Signals & Radar: the wireless signals around this computer, read from
the system (NetworkManager or iwd for Wi-Fi, BlueZ for Bluetooth), and the
device's vitals. Passive: nothing is connected to, stored or sent anywhere;
scanning only asks the radios what they can already hear.
Standard library only; the tools are called when they exist."""

import glob
import json
import os
import re
import shutil
import subprocess
import threading
import time

OUI_FILE = "/usr/share/hwdata/oui.txt"   # the IEEE list of makers, from hwdata
_oui = None
_scan_lock = threading.Lock()
_last_bt_scan = 0.0
_net_prev = {}


def _run(args, timeout=8):
    try:
        return subprocess.run(args, capture_output=True, text=True, timeout=timeout).stdout
    except (OSError, subprocess.SubprocessError):
        return ""


def maker(mac):
    """The maker of a device from the first half of its address (if it's a
    public one; phones often use private, random addresses)."""
    global _oui
    if not mac or len(mac) < 8:
        return ""
    if int(mac[1], 16) & 2:
        return "Private address"
    if _oui is None:
        _oui = {}
        try:
            with open(OUI_FILE, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    m = re.match(r"^([0-9A-F]{2})-([0-9A-F]{2})-([0-9A-F]{2})\s+\(hex\)\s+(.+)$", line.strip())
                    if m:
                        _oui[m[1] + m[2] + m[3]] = m[4].strip()[:40]
        except OSError:
            pass
    return _oui.get(mac.replace(":", "").upper()[:6], "")


def _blocked(kind):
    """rfkill: is this radio switched off?"""
    for path in glob.glob("/sys/class/rfkill/rfkill*"):
        try:
            if open(os.path.join(path, "type")).read().strip() == kind:
                return open(os.path.join(path, "soft")).read().strip() == "1" or open(os.path.join(path, "hard")).read().strip() == "1"
        except OSError:
            continue
    return None


# ---------------------------------------------------------------- Wi-Fi

def _band(freq):
    return "2.4 GHz" if freq < 3000 else "5 GHz" if freq < 5925 else "6 GHz"


def wifi(rescan=False):
    blocked = _blocked("wlan")
    ifaces = [os.path.basename(p) for p in glob.glob("/sys/class/net/*") if os.path.isdir(os.path.join(p, "wireless"))]
    out = {"available": bool(ifaces), "enabled": blocked is not True, "networks": [], "tool": ""}
    if not ifaces or blocked:
        return out
    if shutil.which("nmcli") and _run(["nmcli", "-t", "-f", "RUNNING", "general"], 4).strip() == "running":
        out["tool"] = "NetworkManager"
        text = _run(["nmcli", "-t", "-f", "IN-USE,BSSID,SSID,CHAN,FREQ,RATE,SIGNAL,SECURITY,MODE", "dev", "wifi", "list",
                     "--rescan", "yes" if rescan else "auto"], 25)
        for line in text.splitlines():
            f = [x.replace("\\:", ":") for x in re.split(r"(?<!\\):", line)]
            if len(f) < 9:
                continue
            try:
                freq, signal = int(re.sub(r"\D", "", f[4]) or 0), int(f[6] or 0)
            except ValueError:
                continue
            out["networks"].append({"id": f[1].lower(), "name": f[2], "bssid": f[1], "channel": f[3], "freq": freq, "band": _band(freq),
                                    "rate": f[5], "signal": signal, "security": f[7] or "Open", "mode": f[8], "connected": f[0] == "*",
                                    "maker": maker(f[1])})
    elif shutil.which("busctl"):
        out["tool"] = "iwd"
        objs = _dbus_objects("net.connman.iwd")
        for path, ifs in objs.items():
            st = ifs.get("net.connman.iwd.Station")
            if st is None:
                continue
            if rescan:
                _run(["busctl", "call", "net.connman.iwd", path, "net.connman.iwd.Station", "Scan"], 6)
            raw = _run(["busctl", "--json=short", "call", "net.connman.iwd", path, "net.connman.iwd.Station", "GetOrderedNetworks"], 6)
            try:
                ordered = json.loads(raw)["data"][0]
            except (ValueError, KeyError, IndexError):
                ordered = []
            for npath, strength in ordered:
                n = objs.get(npath, {}).get("net.connman.iwd.Network", {})
                dbm = strength / 100
                out["networks"].append({"id": npath, "name": _v(n.get("Name")) or "", "bssid": "", "channel": "", "freq": 0, "band": "",
                                        "rate": "", "signal": max(0, min(100, int(2 * (dbm + 100)))), "dbm": dbm,
                                        "security": {"psk": "WPA", "8021x": "Enterprise", "open": "Open"}.get(_v(n.get("Type")), _v(n.get("Type")) or ""),
                                        "mode": "Infra", "connected": bool(_v(n.get("Connected"))), "maker": ""})
    out["networks"].sort(key=lambda n: -n["signal"])
    for n in out["networks"]:
        n.setdefault("dbm", round(n["signal"] / 2 - 100))
    return out


def _v(x):
    return x.get("data") if isinstance(x, dict) else x


def _dbus_objects(service):
    raw = _run(["busctl", "--json=short", "call", service, "/", "org.freedesktop.DBus.ObjectManager", "GetManagedObjects"], 6)
    try:
        return json.loads(raw)["data"][0]
    except (ValueError, KeyError, IndexError):
        return {}


# ------------------------------------------------------------ Bluetooth

BT_KIND = {"phone": "Phone", "computer": "Computer", "audio-headset": "Headset", "audio-headphones": "Headphones",
           "audio-card": "Speaker", "input-keyboard": "Keyboard", "input-mouse": "Mouse", "input-gaming": "Game controller",
           "camera-photo": "Camera", "printer": "Printer", "video-display": "Display", "multimedia-player": "Media player",
           "input-tablet": "Tablet"}


def bluetooth(rescan=False):
    global _last_bt_scan
    blocked = _blocked("bluetooth")
    out = {"available": blocked is not None or bool(glob.glob("/sys/class/bluetooth/hci*")), "enabled": blocked is not True,
           "powered": False, "devices": []}
    if not out["available"] or blocked or not shutil.which("busctl"):
        return out
    objs = _dbus_objects("org.bluez")
    for path, ifs in objs.items():
        if "org.bluez.Adapter1" in ifs:
            out["powered"] = bool(_v(ifs["org.bluez.Adapter1"].get("Powered")))
    # Discovery runs a few seconds in the background; results arrive next time.
    if rescan and out["powered"] and shutil.which("bluetoothctl") and time.time() - _last_bt_scan > 12:
        _last_bt_scan = time.time()
        threading.Thread(target=_run, args=(["bluetoothctl", "--timeout", "10", "scan", "on"], 15), daemon=True).start()
    for path, ifs in objs.items():
        d = ifs.get("org.bluez.Device1")
        if not d:
            continue
        rssi = _v(d.get("RSSI"))
        connected = bool(_v(d.get("Connected")))
        if rssi is None and not connected:
            continue   # known from before, but not heard now
        addr = _v(d.get("Address")) or ""
        icon = _v(d.get("Icon")) or ""
        dbm = int(rssi) if rssi is not None else -55
        out["devices"].append({"id": addr.lower(), "name": _v(d.get("Name")) or _v(d.get("Alias")) or "Unnamed device", "address": addr,
                               "kind": BT_KIND.get(icon, icon.replace("-", " ").capitalize() or "Device"), "dbm": dbm,
                               "signal": max(0, min(100, 2 * (dbm + 100))), "paired": bool(_v(d.get("Paired"))), "connected": connected,
                               "trusted": bool(_v(d.get("Trusted"))), "maker": maker(addr), "addrType": _v(d.get("AddressType")) or ""})
    out["devices"].sort(key=lambda d: -d["signal"])
    return out


def scan(rescan=False):
    with _scan_lock:
        return {"wifi": wifi(rescan), "bluetooth": bluetooth(rescan), "time": int(time.time() * 1000)}


# --------------------------------------------------------------- vitals

def vitals():
    """Battery, disk, network traffic and uptime (the processor and memory
    come from the backend's own CPU readout)."""
    out = {}
    for p in glob.glob("/sys/class/power_supply/*"):
        try:
            if open(os.path.join(p, "type")).read().strip() == "Battery":
                out["battery"] = {"percent": int(open(os.path.join(p, "capacity")).read()),
                                  "status": open(os.path.join(p, "status")).read().strip()}
                break
        except (OSError, ValueError):
            continue
    try:
        du = shutil.disk_usage(os.path.expanduser("~"))
        out["disk"] = {"total": du.total, "used": du.used}
    except OSError:
        pass
    now, nets = time.monotonic(), []
    for p in sorted(glob.glob("/sys/class/net/*")):
        name = os.path.basename(p)
        if name == "lo":
            continue
        try:
            rx, tx = int(open(os.path.join(p, "statistics/rx_bytes")).read()), int(open(os.path.join(p, "statistics/tx_bytes")).read())
            state = open(os.path.join(p, "operstate")).read().strip()
        except (OSError, ValueError):
            continue
        prev = _net_prev.get(name)
        rate = ((rx - prev[1]) / max(0.2, now - prev[0]), (tx - prev[2]) / max(0.2, now - prev[0])) if prev else (0, 0)
        _net_prev[name] = (now, rx, tx)
        kind = "wifi" if os.path.isdir(os.path.join(p, "wireless")) else "wwan" if name.startswith("ww") else "vpn" if re.match(r"(tun|wg|proton|tap)", name) else "ethernet"
        nets.append({"name": name, "kind": kind, "up": state in ("up", "unknown") and (rx or tx) > 0, "rx": max(0, rate[0]), "tx": max(0, rate[1])})
    out["net"] = nets
    try:
        out["uptime"] = int(float(open("/proc/uptime").read().split()[0]))
    except (OSError, ValueError):
        pass
    return out


# ------------------------------------------------------------ kill switch

def radios(off):
    """The kill switch: turn Wi-Fi (and mobile data) and Bluetooth off, or
    back on, with whatever this system offers. Returns what worked."""
    done, failed = [], []
    state = "off" if off else "on"
    if shutil.which("nmcli") and _run(["nmcli", "-t", "-f", "RUNNING", "general"], 4).strip() == "running":
        r = subprocess.run(["nmcli", "radio", "all", state], capture_output=True, text=True, timeout=10)
        (done if r.returncode == 0 else failed).append("Wi-Fi and mobile data (NetworkManager)")
    elif shutil.which("iwctl"):
        ok = True
        for dev in [os.path.basename(p) for p in glob.glob("/sys/class/net/*") if os.path.isdir(os.path.join(p, "wireless"))]:
            r = subprocess.run(["iwctl", "device", dev, "set-property", "Powered", state], capture_output=True, text=True, timeout=10)
            ok = ok and r.returncode == 0
        (done if ok else failed).append("Wi-Fi (iwd)")
    if shutil.which("bluetoothctl"):
        r = subprocess.run(["bluetoothctl", "power", state], capture_output=True, text=True, timeout=10)
        (done if r.returncode == 0 and "succeeded" in (r.stdout + r.stderr).lower() else failed).append("Bluetooth")
    if shutil.which("rfkill"):
        r = subprocess.run(["rfkill", "block" if off else "unblock", "all"], capture_output=True, text=True, timeout=10)
        if r.returncode == 0:
            done.append("all radios (rfkill)")
    return {"off": off, "done": done, "failed": [f for f in failed if not (off and "all radios (rfkill)" in done)],
            "wifi": _blocked("wlan"), "bluetooth": _blocked("bluetooth")}
