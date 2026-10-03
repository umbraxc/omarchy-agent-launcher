"""Umbra's LoRa worker: talks to a Meshtastic radio through the official
meshtastic library, in its own Python (the LoRa environment in Umbra's data
folder), so the main app never loads the radio stack.

  lora_worker.py --port /dev/ttyUSB0      (a radio on USB)
  lora_worker.py --host 192.168.4.1       (a radio on the network)
  lora_worker.py --fake                   (a simulated radio, for tests)

Events go out as JSON lines on stdout: {"ev": "info"|"nodes"|"packet"|
"ack"|"connected"|"lost"|"error", ...}. Commands come in as JSON lines on
stdin: {"cmd": "text"|"position"|"waypoint"|"owner"|"region"|"preset"|
"channel"|"seturl"|"traceroute"|"refresh", ...}.
"""
import json
import random
import sys
import threading
import time

OUT = threading.Lock()
SINK = None   # inside the app (Windows build): events go straight to Umbra instead of stdout


def emit(**ev):
    if SINK:
        SINK(json.loads(json.dumps(ev, default=str)))
        return
    with OUT:
        print(json.dumps(ev, default=str), flush=True)


def node_view(n):
    """A node, reduced to what Umbra shows."""
    u, p, m = n.get("user") or {}, n.get("position") or {}, n.get("deviceMetrics") or {}
    out = {"num": n.get("num"), "id": u.get("id") or (f"!{n['num']:08x}" if n.get("num") else ""), "long": u.get("longName", ""),
           "short": u.get("shortName", ""), "hw": u.get("hwModel", ""), "snr": n.get("snr"), "heard": n.get("lastHeard"),
           "hops": n.get("hopsAway"), "battery": m.get("batteryLevel"), "voltage": m.get("voltage"),
           "chUtil": m.get("channelUtilization"), "airTx": m.get("airUtilTx")}
    if "latitude" in p and "longitude" in p:
        out.update(lat=p["latitude"], lon=p["longitude"], alt=p.get("altitude"))
    return out


def packet_view(pk):
    d = pk.get("decoded") or {}
    out = {"from": pk.get("fromId") or (f"!{pk['from']:08x}" if pk.get("from") else ""), "to": pk.get("toId") or "",
           "port": d.get("portnum", ""), "snr": pk.get("rxSnr"), "rssi": pk.get("rxRssi"), "channel": pk.get("channel", 0),
           "hops": (pk.get("hopStart") - pk.get("hopLimit")) if pk.get("hopStart") is not None and pk.get("hopLimit") is not None else None,
           "id": pk.get("id"), "at": int(time.time() * 1000)}
    if d.get("portnum") == "TEXT_MESSAGE_APP":
        out["text"] = d.get("text", "")
    elif d.get("portnum") == "POSITION_APP":
        pos = d.get("position") or {}
        out.update(lat=pos.get("latitude"), lon=pos.get("longitude"))
    elif d.get("portnum") == "WAYPOINT_APP":
        w = d.get("waypoint") or {}
        out["waypoint"] = {"name": w.get("name", ""), "lat": (w.get("latitudeI") or 0) / 1e7, "lon": (w.get("longitudeI") or 0) / 1e7,
                           "description": w.get("description", "")}
    elif d.get("portnum") == "ROUTING_APP":
        out["routing"] = (d.get("routing") or {}).get("errorReason", "NONE")
        out["requestId"] = d.get("requestId")
    elif d.get("portnum") == "TRACEROUTE_APP":
        out["route"] = (d.get("traceroute") or {}).get("route", [])
    return out


class Real:
    def __init__(self, port=None, host=None):
        from pubsub import pub
        import meshtastic.serial_interface
        import meshtastic.tcp_interface
        self.pub = pub
        pub.subscribe(self.on_receive, "meshtastic.receive")
        pub.subscribe(self.on_lost, "meshtastic.connection.lost")
        pub.subscribe(self.on_node, "meshtastic.node.updated")
        self.iface = (meshtastic.tcp_interface.TCPInterface(hostname=host) if host
                      else meshtastic.serial_interface.SerialInterface(devPath=port))

    def info(self):
        i = self.iface
        me = i.getMyNodeInfo() or {}
        lora = i.localNode.localConfig.lora
        from meshtastic.protobuf import config_pb2
        enum = config_pb2.Config.LoRaConfig
        meta = getattr(i, "metadata", None)
        chans = []
        for c in (i.localNode.channels or []):
            if c.role:
                chans.append({"index": c.index, "name": c.settings.name or ("LongFast" if c.index == 0 else f"Channel {c.index}"),
                              "primary": c.role == 1, "secure": len(c.settings.psk) > 1})
        return {"me": node_view(me), "region": enum.RegionCode.Name(lora.region), "preset": enum.ModemPreset.Name(lora.modem_preset),
                "firmware": getattr(meta, "firmware_version", "") if meta else "", "channels": chans, "url": i.localNode.getURL(includeAll=False)}

    def nodes(self):
        return [node_view(n) for n in (self.iface.nodes or {}).values()]

    def on_receive(self, packet, interface):
        emit(ev="packet", packet=packet_view(packet))

    def on_lost(self, interface, topic=None):
        emit(ev="lost")

    def on_node(self, node, interface):
        emit(ev="node", node=node_view(node))

    def do(self, c):
        i, cmd = self.iface, c.get("cmd")
        if cmd == "text":
            def acked(p):
                emit(ev="ack", ref=c.get("ref"), ok=((p.get("decoded") or {}).get("routing") or {}).get("errorReason", "NONE") == "NONE")
            sent = i.sendText(str(c["text"])[:228], destinationId=c.get("to") or "^all", wantAck=True, onResponse=acked,
                              channelIndex=int(c.get("channel", 0)))
            emit(ev="sent", ref=c.get("ref"), id=getattr(sent, "id", None))
        elif cmd == "position":
            i.sendPosition(latitude=float(c["lat"]), longitude=float(c["lon"]), channelIndex=int(c.get("channel", 0)))
            emit(ev="sent", ref=c.get("ref"))
        elif cmd == "waypoint":
            i.sendWaypoint(name=str(c["name"])[:30], description=str(c.get("description", ""))[:100], icon=0x1F4CD,
                           expire=int(time.time()) + 7 * 86400, latitude=float(c["lat"]), longitude=float(c["lon"]),
                           channelIndex=int(c.get("channel", 0)))
            emit(ev="sent", ref=c.get("ref"))
        elif cmd == "owner":
            i.localNode.setOwner(long_name=str(c["long"])[:39], short_name=str(c["short"])[:4])
        elif cmd in ("region", "preset"):
            from meshtastic.protobuf import config_pb2
            enum = config_pb2.Config.LoRaConfig
            lora = i.localNode.localConfig.lora
            if cmd == "region":
                lora.region = enum.RegionCode.Value(c["value"])
            else:
                lora.modem_preset = enum.ModemPreset.Value(c["value"])
                lora.use_preset = True
            i.localNode.writeConfig("lora")
        elif cmd == "seturl":
            i.localNode.setURL(str(c["url"]))
        elif cmd == "channel":   # a private channel: a name and a fresh random key
            ch = i.localNode.channels[0]
            ch.settings.name = str(c.get("name", "Umbra"))[:11]
            ch.settings.psk = bytes(random.getrandbits(8) for _ in range(32))
            i.localNode.writeChannel(0)
        elif cmd == "traceroute":
            threading.Thread(target=lambda: i.sendTraceRoute(c["to"], hopLimit=int(c.get("hops", 5))), daemon=True).start()
        emit(ev="info", info=self.info())


class Fake:
    """A simulated radio and two neighbours, for testing Umbra without hardware."""
    def __init__(self):
        self.me = {"num": 0xA1B2C3D4, "id": "!a1b2c3d4", "long": "Umbra Test", "short": "UMB", "hw": "HELTEC_V3", "battery": 87, "voltage": 4.02,
                   "chUtil": 3.2, "airTx": 0.4, "lat": 46.55, "lon": 7.98}
        self.others = [
            {"num": 0x11, "id": "!00000011", "long": "Ridge Relay", "short": "RDG", "hw": "RAK4631", "snr": 6.5, "hops": 0, "battery": 100, "lat": 46.61, "lon": 8.03},
            {"num": 0x22, "id": "!00000022", "long": "Mira's T-Beam", "short": "MIRA", "hw": "TBEAM", "snr": -9.25, "hops": 1, "battery": 54, "lat": 46.68, "lon": 8.12}]
        self.region, self.preset = "EU_868", "LONG_FAST"
        threading.Thread(target=self.chatter, daemon=True).start()

    def info(self):
        return {"me": self.me, "region": self.region, "preset": self.preset, "firmware": "2.7.11.sim",
                "channels": [{"index": 0, "name": "LongFast", "primary": True, "secure": False}], "url": "https://meshtastic.org/e/#CgMSAQESBggBQANIAQ"}

    def nodes(self):
        return [self.me] + [dict(o, heard=int(time.time()) - 60) for o in self.others]

    def chatter(self):
        time.sleep(4)
        emit(ev="packet", packet={"from": "!00000022", "to": "^all", "port": "TEXT_MESSAGE_APP", "text": "Mira here, on the ridge. Weather's turning.",
                                  "snr": -9.25, "rssi": -112, "hops": 1, "channel": 0, "at": int(time.time() * 1000)})

    def do(self, c):
        if c.get("cmd") == "text":
            emit(ev="sent", ref=c.get("ref"))
            time.sleep(1.2)
            emit(ev="ack", ref=c.get("ref"), ok=True)
        elif c.get("cmd") == "region":
            self.region = c["value"]
        elif c.get("cmd") == "preset":
            self.preset = c["value"]
        elif c.get("cmd") == "owner":
            self.me.update(long=c["long"], short=c["short"])
        emit(ev="info", info=self.info())


def main(args=None, commands=None):
    """args: like the command line; commands: an iterable of command dicts (in-app) or None (stdin)."""
    args = sys.argv[1:] if args is None else args
    try:
        if "--fake" in args:
            radio = Fake()
        elif "--host" in args:
            radio = Real(host=args[args.index("--host") + 1])
        else:
            radio = Real(port=args[args.index("--port") + 1])
        emit(ev="connected", info=radio.info(), nodes=radio.nodes())
    except Exception as exc:
        emit(ev="error", message=str(exc)[:300])
        return

    def tick():   # the node list now and then (positions, battery, last heard)
        while True:
            time.sleep(20)
            try:
                emit(ev="nodes", nodes=radio.nodes())
            except Exception:
                pass
    threading.Thread(target=tick, daemon=True).start()
    for line in (commands if commands is not None else sys.stdin):
        if line is None:   # the app disconnects
            break
        try:
            c = line if isinstance(line, dict) else json.loads(line)
        except ValueError:
            continue
        try:
            if c.get("cmd") == "refresh":
                emit(ev="info", info=radio.info())
                emit(ev="nodes", nodes=radio.nodes())
            else:
                radio.do(c)
        except Exception as exc:
            emit(ev="error", message=str(exc)[:300], ref=c.get("ref"))


if __name__ == "__main__":
    main()
