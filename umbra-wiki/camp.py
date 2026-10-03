"""Umbra Friends and the Camp Network.

Profile cards: a small public card built from the user's profile, Locker,
achievements and Outpost (never health notes, location, conversations or
files), signed with this Umbra's own key so a friend can tell it is really
yours. Shared as a code, a QR code or a .umbracard file; imported into the
Friends list.

The Camp Network: Umbras on the same local network (a router, a phone's
hotspot) find each other and link directly, with no internet. Off until the
user turns it on. A link is a TCP connection encrypted end to end
(X25519 key exchange, ChaCha20-Poly1305), confirmed the first time by a
six-digit code shown on both screens; afterwards the friend's key is known
and links come back by themselves. Linked friends exchange their cards
(live) and chat. Nothing else is sent.
"""

import base64
import hashlib
import json
import os
import re
import secrets
import socket
import struct
import threading
import time
import zlib

try:
    from cryptography.exceptions import InvalidSignature
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
    from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
    from cryptography.hazmat.primitives.ciphers.aead import ChaCha20Poly1305
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF
    CRYPTO = True
except ImportError:   # the Camp Network and signed cards need it; plain codes still work
    CRYPTO = False

PREFIX = "UMBRA1."
MAGIC = b"UMBRACAMP1"
UDP_PORT = int(os.environ.get("UMBRA_CAMP_UDP", 47801))
TCP_PORT = int(os.environ.get("UMBRA_CAMP_TCP", 47802))
MAX_FRAME = 512 * 1024
ID_RE = re.compile(r"[a-z0-9-]{1,40}")
SKILL_RE = re.compile(r"[a-z_]{1,24}")
FRAMES = ("signal", "flames", "aurora", "static", "circuit", "frost", "gold", "plain", "starfield", "orbit", "topo", "morse", "laurels")
SCENES = ("orb", "campfire", "aurora", "mountains", "lighthouse", "forest", "stars", "winter", "storm", "valley")
ACCENTS = ("signal", "accent", "net", "red", "green", "violet", "ice", "gold")
WP_ICONS = ("pin", "objective", "friendly", "enemy", "danger", "rally", "lz", "medic", "cache", "water", "food",
            "op", "checkpoint", "camp", "home")
CHECKIN_STATES = ("ok", "help", "away", "moving")
# Attached to a card but signed apart, so the QR code can leave them out
# (a QR code holds only a few kilobytes): shared waypoints and the check-in.
EXTRAS = ("wp", "ci")


def b64e(b):
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def b64d(s):
    s = str(s)
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _s(v, n):
    return re.sub(r"[\x00-\x1f\x7f]", "", str(v or ""))[:n].strip()


def _id(v):
    v = str(v or "")
    return v if ID_RE.fullmatch(v) else ""


def clean_card(c):
    """A card from anywhere, reduced to known fields with sane sizes (it will
    be shown to the user, so every id is checked and every text trimmed)."""
    if not isinstance(c, dict):
        raise ValueError("Not a profile card.")
    out = {"v": 1, "id": _s(c.get("id"), 24), "pk": _s(c.get("pk"), 60), "n": _s(c.get("n"), 40) or "Survivor",
           "u": int(c.get("u") or 0) if str(c.get("u") or "0").isdigit() else 0}
    for key, n in (("cs", 24), ("m", 90), ("r", 30), ("s", 7), ("sc", 30), ("ps", 30)):
        if c.get(key):
            out[key] = _s(c[key], n)
    for key in ("t", "fx", "o"):
        if _id(c.get(key)):
            out[key] = c[key]
    for key in ("p", "a", "at"):
        if isinstance(c.get(key), int) and 0 <= c[key] < 10 ** 7:
            out[key] = c[key]
    if isinstance(c.get("b"), list):
        out["b"] = [b for b in c["b"][:4] if _id(b)]
    ch = c.get("ch")
    if isinstance(ch, dict):
        out["ch"] = {k: int(ch[k]) for k in ("top", "eyes", "mouth", "body") if isinstance(ch.get(k), int) and 0 <= ch[k] < 64}
    if _id(c.get("c")):
        out["c"] = c["c"]
    op = c.get("op")
    if isinstance(op, dict):
        o = {}
        for key, hi in (("tl", 5000), ("pr", 4), ("cb", 200), ("h", 10 ** 6)):
            if isinstance(op.get(key), int) and 0 <= op[key] <= hi:
                o[key] = op[key]
        if isinstance(op.get("top"), list):
            o["top"] = [[s, l] for s, l in op["top"][:3] if isinstance(s, str) and SKILL_RE.fullmatch(s) and isinstance(l, int) and 0 < l < 200]
        out["op"] = o
    st = c.get("st")
    if isinstance(st, dict):
        out["st"] = {"f": st.get("f") if st.get("f") in FRAMES else "signal",
                     "bg": st.get("bg") if st.get("bg") in SCENES else "orb",
                     "ac": st.get("ac") if st.get("ac") in ACCENTS else "signal"}
    # The dossier: what the card's extension shows (space, Earth, drills, habits, the Locker look).
    x = c.get("x")
    if isinstance(x, dict):
        o = {}
        for key, hi in (("w", 20), ("mo", 60), ("co", 400), ("wd", 28), ("dr", 10 ** 5), ("sd", 10 ** 5), ("sb", 100),
                        ("sp", 10 ** 4), ("sk", 10 ** 4), ("dy", 10 ** 5), ("q", 10 ** 7), ("fr", 1000)):
            if isinstance(x.get(key), int) and not isinstance(x.get(key), bool) and 0 <= x[key] <= hi:
                o[key] = x[key]
        for key in ("bg", "tr"):
            if _id(x.get(key)):
                o[key] = x[key]
        if o:
            out["x"] = o
    wp = clean_waypoints(c.get("wp"))
    if wp:
        out["wp"] = wp
    ci = clean_checkin(c.get("ci"))
    if ci:
        out["ci"] = ci
    if c.get("sig"):
        out["sig"] = _s(c["sig"], 100)
    if c.get("xs"):
        out["xs"] = _s(c["xs"], 100)
    return out


def clean_waypoints(v):
    """Shared waypoints: [lat, lon, name, icon, colour], at most 80."""
    out = []
    for w in (v if isinstance(v, list) else [])[:80]:
        if not isinstance(w, list) or len(w) < 3:
            continue
        try:
            lat, lon = round(float(w[0]), 5), round(float(w[1]), 5)
        except (TypeError, ValueError):
            continue
        if not (-85 <= lat <= 85 and -180 <= lon <= 180):
            continue
        icon = w[3] if len(w) > 3 and w[3] in WP_ICONS else "pin"
        colour = w[4] if len(w) > 4 and isinstance(w[4], str) and re.fullmatch(r"[a-z]{0,10}", w[4]) else ""
        out.append([lat, lon, _s(w[2], 40) or "Waypoint", icon, colour])
    return out


def clean_checkin(v):
    """A check-in: when, how (OK, need help, away, on the move), a note, maybe a place, and how often to expect one."""
    if not isinstance(v, dict) or not isinstance(v.get("at"), int) or v.get("st") not in CHECKIN_STATES:
        return None
    out = {"at": v["at"], "st": v["st"]}
    if v.get("n"):
        out["n"] = _s(v["n"], 120)
    try:
        if v.get("lat") is not None and v.get("lon") is not None:
            lat, lon = round(float(v["lat"]), 4), round(float(v["lon"]), 4)
            if -85 <= lat <= 85 and -180 <= lon <= 180:
                out["lat"], out["lon"] = lat, lon
    except (TypeError, ValueError):
        pass
    if isinstance(v.get("ev"), int) and 0 <= v["ev"] <= 168:
        out["ev"] = v["ev"]
    return out


def _signed_bytes(card):
    body = {k: v for k, v in card.items() if k not in ("sig", "xs") + EXTRAS}
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def _extras_bytes(card):
    body = {"id": card.get("id"), "u": card.get("u"), **{k: card[k] for k in EXTRAS if k in card}}
    return json.dumps(body, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()


def encode(card, short=False):
    """The card as a code. short: without the waypoints and check-in (for a QR code)."""
    if short:
        card = {k: v for k, v in card.items() if k not in EXTRAS + ("xs",)}
    raw = json.dumps(card, separators=(",", ":"), ensure_ascii=False).encode()
    return PREFIX + b64e(zlib.compress(raw, 9))


def decode(text):
    """A card from a code (also found inside pasted text)."""
    m = re.search(re.escape(PREFIX) + r"([A-Za-z0-9_-]{20,20000})", str(text or ""))
    if not m:
        raise ValueError("That isn't an Umbra profile card code.")
    try:
        data = json.loads(zlib.decompress(b64d(m.group(1)), bufsize=65536)[:65536])
    except Exception:
        raise ValueError("The card code is damaged or incomplete.")
    return clean_card(data)


def verify(card):
    """True when the card is signed by the key it carries (it really comes
    from that Umbra), and its id matches that key."""
    if not CRYPTO or not card.get("sig") or not card.get("pk"):
        return False
    try:
        pk = b64d(card["pk"])
        if fingerprint(pk) != card.get("id"):
            return False
        Ed25519PublicKey.from_public_bytes(pk).verify(b64d(card["sig"]), _signed_bytes(card))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def verify_extras(card):
    """The waypoints and check-in really come from the card's owner."""
    if not any(k in card for k in EXTRAS):
        return True
    if not CRYPTO or not card.get("xs") or not card.get("pk"):
        return False
    try:
        Ed25519PublicKey.from_public_bytes(b64d(card["pk"])).verify(b64d(card["xs"]), _extras_bytes(card))
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False


def fingerprint(pk_bytes):
    return hashlib.sha256(pk_bytes).hexdigest()[:20]


def _hkdf(material, salt, info, n=32):
    return HKDF(algorithm=hashes.SHA256(), length=n, salt=salt, info=info).derive(material)


class Link:
    """One encrypted connection to another Umbra."""

    def __init__(self, camp, sock, addr, outgoing):
        self.camp, self.sock, self.addr, self.outgoing = camp, sock, addr, outgoing
        self.peer_id = self.peer_pk = None
        self.send_key = self.recv_key = None
        self.send_n = self.recv_n = 0
        self.sas = ""
        self.lock = threading.Lock()
        self.alive = True

    # --------------------------------------------------------- framing
    def _send_raw(self, data):
        self.sock.sendall(struct.pack(">I", len(data)) + data)

    def _recv_raw(self):
        head = self._exact(4)
        n = struct.unpack(">I", head)[0]
        if n > MAX_FRAME:
            raise ConnectionError("frame too large")
        return self._exact(n)

    def _exact(self, n):
        buf = b""
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("closed")
            buf += chunk
        return buf

    def send(self, obj):
        data = json.dumps(obj, separators=(",", ":")).encode()
        with self.lock:
            nonce = struct.pack(">4xQ", self.send_n)
            self.send_n += 1
            self._send_raw(ChaCha20Poly1305(self.send_key).encrypt(nonce, data, None))

    def recv(self):
        data = self._recv_raw()
        nonce = struct.pack(">4xQ", self.recv_n)
        self.recv_n += 1
        return json.loads(ChaCha20Poly1305(self.recv_key).decrypt(nonce, data, None))

    # ------------------------------------------------------- handshake
    def handshake(self):
        """Both sides: a fresh X25519 key signed with the Umbra's identity
        key; the shared secret gives one key per direction and the code."""
        me = self.camp
        eph = X25519PrivateKey.generate()
        eph_pub = eph.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        nonce = secrets.token_bytes(16)
        hello = {"magic": MAGIC.decode(), "pk": b64e(me.pk), "eph": b64e(eph_pub), "nonce": b64e(nonce),
                 "sig": b64e(me.key.sign(MAGIC + eph_pub + nonce))}
        self.sock.settimeout(15)
        self._send_raw(json.dumps(hello).encode())
        other = json.loads(self._recv_raw()[:4096])
        if other.get("magic") != MAGIC.decode():
            raise ConnectionError("not an Umbra")
        pk, peph, pnonce = b64d(other["pk"]), b64d(other["eph"]), b64d(other["nonce"])
        Ed25519PublicKey.from_public_bytes(pk).verify(b64d(other["sig"]), MAGIC + peph + pnonce)
        shared = eph.exchange(X25519PublicKey.from_public_bytes(peph))
        a, b = sorted([(eph_pub, nonce), (peph, pnonce)])
        salt = hashlib.sha256(a[0] + a[1] + b[0] + b[1]).digest()
        k1, k2 = _hkdf(shared, salt, b"umbra camp keys", 64)[:32], _hkdf(shared, salt, b"umbra camp keys", 64)[32:]
        mine_first = (eph_pub, nonce) == a
        self.send_key, self.recv_key = (k1, k2) if mine_first else (k2, k1)
        code = int.from_bytes(_hkdf(shared, salt, b"umbra camp code", 4), "big") % 1000000
        self.sas = f"{code:06d}"
        self.peer_pk, self.peer_id = pk, fingerprint(pk)
        self.sock.settimeout(None)

    def close(self):
        self.alive = False
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


class Camp:
    def __init__(self, config_dir, data_dir, get_card, notify=None):
        self.config_dir, self.data_dir = config_dir, data_dir
        self.get_card_raw = get_card
        self.notify = notify or (lambda *a: None)
        self.lock = threading.RLock()
        self.file = os.path.join(data_dir, "friends.json")
        self.state = self._load()
        self.enabled = False
        self.peers = {}        # detected on the network: id -> {name, ip, port, seen}
        self.links = {}        # id -> Link (linked, verified)
        self.pending = {}      # id -> {link, name, sas, mine: confirmed?, theirs: confirmed?, card}
        self.events = []       # short notices for the page (new friend, message…)
        self.gen = 0
        self.watched = time.time()   # the last time a window asked (the Camp closes with the last window)
        self.udp = self.tcp = None
        self.key = None
        self.pk = b""
        if CRYPTO:
            self._identity()

    # ----------------------------------------------------------- storage
    def _load(self):
        try:
            with open(self.file, encoding="utf-8") as f:
                s = json.load(f)
        except (OSError, ValueError):
            s = {}
        s.setdefault("friends", {})
        s.setdefault("chats", {})
        s.setdefault("trusted", {})    # id -> public key (b64) of linked friends
        return s

    def _save(self):
        os.makedirs(self.data_dir, exist_ok=True)
        tmp = self.file + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(self.state, f, ensure_ascii=False)
        os.replace(tmp, self.file)

    def _identity(self):
        path = os.path.join(self.config_dir, "camp-identity.key")
        try:
            with open(path, "rb") as f:
                self.key = Ed25519PrivateKey.from_private_bytes(base64.b64decode(f.read().strip()))
        except (OSError, ValueError):
            self.key = Ed25519PrivateKey.generate()
            raw = self.key.private_bytes(serialization.Encoding.Raw, serialization.PrivateFormat.Raw, serialization.NoEncryption())
            os.makedirs(self.config_dir, exist_ok=True)
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "wb") as f:
                f.write(base64.b64encode(raw))
        self.pk = self.key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)

    @property
    def my_id(self):
        return fingerprint(self.pk) if self.pk else ""

    # -------------------------------------------------------------- cards
    def card(self):
        """My card, as it is right now, signed."""
        c = clean_card({**self.get_card_raw(), "id": self.my_id, "pk": b64e(self.pk) if self.pk else "",
                        "u": int(time.time())})
        c.pop("sig", None); c.pop("xs", None)
        if self.key is not None:
            c["sig"] = b64e(self.key.sign(_signed_bytes(c)))
            if any(k in c for k in EXTRAS):
                c["xs"] = b64e(self.key.sign(_extras_bytes(c)))
        return c

    def add_friend(self, card, source, verified):
        if not verify_extras(card):   # waypoints or a check-in someone else put on the card: dropped
            card = {k: v for k, v in card.items() if k not in EXTRAS + ("xs",)}
        fid = card.get("id") or ("card-" + hashlib.sha256(card.get("n", "").encode()).hexdigest()[:12])
        if fid == self.my_id:
            raise ValueError("That's your own card.")
        with self.lock:
            old = self.state["friends"].get(fid, {})
            if old.get("verified") and not verified:
                raise ValueError("This friend's card is already here, signed by their Umbra; this copy isn't signed by them.")
            if old.get("card", {}).get("u", 0) > card.get("u", 0) and old.get("verified"):
                return fid, False   # an older copy of a card we already have
            self.state["friends"][fid] = {"card": card, "verified": bool(verified), "source": source if not old else old.get("source", source),
                                          "camp": old.get("camp", False) or source == "camp", "added": old.get("added") or int(time.time()),
                                          "updated": int(time.time())}
            self._save()
        return fid, not old

    def import_code(self, text):
        card = decode(text)
        ok = verify(card)
        fid, new = self.add_friend(card, "card", ok)
        return {"id": fid, "new": new, "verified": ok, "name": card["n"]}

    def remove(self, fid):
        with self.lock:
            self.state["friends"].pop(fid, None)
            self.state["chats"].pop(fid, None)
            self.state["trusted"].pop(fid, None)
            self._save()
            link = self.links.pop(fid, None)
        if link:
            link.close()

    def friends(self):
        with self.lock:
            out = []
            for fid, f in self.state["friends"].items():
                chat = self.state["chats"].get(fid, [])
                out.append({"id": fid, **f, "online": fid in self.links,
                            "unread": sum(1 for m in chat if not m.get("me") and not m.get("read")),
                            "last": chat[-1]["at"] if chat else 0})
        out.sort(key=lambda f: (not f["online"], -max(f["last"], f["updated"])))
        return out

    def chat(self, fid, mark_read=True):
        with self.lock:
            msgs = self.state["chats"].get(fid, [])
            if mark_read and any(not m.get("me") and not m.get("read") for m in msgs):
                for m in msgs:
                    m["read"] = True
                self._save()
            return list(msgs[-300:])

    def say(self, fid, text, wp=None):
        text = _s(text, 2000)
        wp = (clean_waypoints([wp]) or [None])[0] if wp else None
        if not text and not wp:
            raise ValueError("Empty message.")
        link = self.links.get(fid)
        if not link:
            raise ValueError("Your friend isn't linked right now: messages need both Umbras on the same network.")
        msg = {"id": secrets.token_hex(6), "text": text, "at": int(time.time() * 1000), **({"wp": wp} if wp else {})}
        link.send({"t": "msg", **msg})
        self._store(fid, {**msg, "me": True})
        return msg

    def _store(self, fid, msg):
        with self.lock:
            chat = self.state["chats"].setdefault(fid, [])
            if any(m["id"] == msg["id"] for m in chat[-50:]):
                return
            chat.append(msg)
            del chat[:-1000]
            self._save()

    # -------------------------------------------------------- the network
    def status(self):
        now = time.time()
        self.watched = now
        with self.lock:
            peers = [{"id": pid, "name": p["name"], "ip": p["ip"], "friend": pid in self.state["friends"],
                      "trusted": pid in self.state["trusted"], "linked": pid in self.links, "pending": pid in self.pending}
                     for pid, p in self.peers.items() if now - p["seen"] < 16]   # beacons every 5 s: a lost one or two never makes a peer flicker
            pending = [{"id": pid, "name": p["name"], "code": p["sas"], "incoming": not p["link"].outgoing,
                        "mine": p["mine"], "theirs": p["theirs"]} for pid, p in self.pending.items()]
            events, self.events = self.events, []
        return {"available": CRYPTO, "enabled": self.enabled, "me": {"id": self.my_id, "name": self.get_card_raw().get("n", "")},
                "peers": peers, "pending": pending, "linked": list(self.links), "events": events,
                "address": local_ip()}

    def set_enabled(self, on):
        if not CRYPTO:
            raise ValueError("The Camp Network needs the Python cryptography package.")
        if on and not self.enabled:
            try:
                self._start()
            except OSError as e:
                self._stop()
                raise ValueError(f"The Camp Network couldn't start: {e.strerror or e}. Another program may use port {TCP_PORT}.")
            self.enabled = True
        elif not on and self.enabled:
            self.enabled = False
            self._stop()
        return self.status()

    def _start(self):
        self.udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        if hasattr(socket, "SO_REUSEPORT"):
            try:
                self.udp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEPORT, 1)
            except OSError:
                pass
        self.udp.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        self.udp.bind(("", UDP_PORT))
        self.tcp = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.tcp.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.tcp.bind(("0.0.0.0", TCP_PORT))
        self.tcp.listen(8)
        gen = time.time()
        self.gen = gen
        self.watched = gen
        for target in (self._beacon, self._listen_udp, self._accept, self._watchdog):
            threading.Thread(target=target, args=(gen,), daemon=True).start()

    def _stop(self):
        self.gen = 0
        for s in (self.udp, self.tcp):
            if s is None:
                continue
            try:
                s.shutdown(socket.SHUT_RDWR)   # wakes the thread waiting in accept()
            except OSError:
                pass
            try:
                s.close()
            except Exception:
                pass
        self.udp = self.tcp = None
        with self.lock:
            links = list(self.links.values()) + [p["link"] for p in self.pending.values()]
            self.links.clear()
            self.pending.clear()
            self.peers.clear()
        for link in links:
            link.close()

    def _watchdog(self, gen):
        """No Umbra window has asked for two minutes (it was closed): the Camp
        goes quiet, so nothing listens on the network unseen."""
        while self.gen == gen:
            time.sleep(5)
            if self.gen == gen and time.time() - self.watched > 120:
                self.enabled = False
                self._stop()
                return

    def _beacon(self, gen):
        """Say "an Umbra is here" on the local network every few seconds."""
        while self.gen == gen:
            msg = json.dumps({"umbra": "camp1", "id": self.my_id, "name": self.get_card_raw().get("n", "Survivor")[:40],
                              "port": TCP_PORT}).encode()
            for target, port in [(b, UDP_PORT) for b in broadcast_addresses()] + test_peers():
                try:
                    self.udp.sendto(msg, (target, port))
                except OSError:
                    pass
            for i in range(30):
                if self.gen != gen:
                    return
                time.sleep(0.1)

    def _listen_udp(self, gen):
        while self.gen == gen:
            try:
                data, (ip, _) = self.udp.recvfrom(2048)
                m = json.loads(data[:2048])
            except (OSError, ValueError):
                if self.gen != gen:
                    return
                continue
            if not isinstance(m, dict) or m.get("umbra") != "camp1" or not re.fullmatch(r"[0-9a-f]{20}", str(m.get("id", ""))):
                continue
            if m["id"] == self.my_id:
                continue
            port = m.get("port") if isinstance(m.get("port"), int) and 0 < m["port"] < 65536 else TCP_PORT
            with self.lock:
                new = m["id"] not in self.peers
                self.peers[m["id"]] = {"name": _s(m.get("name"), 40) or "Survivor", "ip": ip, "port": port, "seen": time.time()}
                again = (m["id"] in self.state["trusted"] and m["id"] not in self.links and m["id"] not in self.pending
                         and self.my_id < m["id"])   # the lower id dials, so two Umbras don't both call
            if new:
                self.events.append({"t": "peer", "name": self.peers[m["id"]]["name"]})
            if again:
                threading.Thread(target=self.link, args=(m["id"],), daemon=True).start()

    def _accept(self, gen):
        while self.gen == gen:
            try:
                sock, addr = self.tcp.accept()
            except OSError:
                return
            threading.Thread(target=self._serve, args=(Link(self, sock, addr, False),), daemon=True).start()

    def link(self, pid):
        """Call a detected Umbra."""
        with self.lock:
            p = self.peers.get(pid)
            if not p or pid in self.links or pid in self.pending:
                return
        try:
            sock = socket.create_connection((p["ip"], p["port"]), timeout=8)
        except OSError:
            self.events.append({"t": "error", "message": f"{p['name']}'s Umbra didn't answer."})
            return
        self._serve(Link(self, sock, (p["ip"], p["port"]), True))

    def _serve(self, link):
        try:
            link.handshake()
            pid = link.peer_id
            if pid == self.my_id:
                raise ConnectionError("myself")
            with self.lock:
                trusted = self.state["trusted"].get(pid)
            if trusted and trusted == b64e(link.peer_pk):
                self._linked(link)
            else:
                # First time: both people compare the code on their screens.
                with self.lock:
                    name = self.peers.get(pid, {}).get("name", "An Umbra")
                    self.pending[pid] = {"link": link, "name": name, "sas": link.sas, "mine": False, "theirs": False}
                self.events.append({"t": "request" if not link.outgoing else "calling", "name": name})
            while link.alive:
                msg = link.recv()
                self._handle(link, msg)
        except Exception:
            pass
        finally:
            link.close()
            with self.lock:
                pid = link.peer_id
                if pid and self.links.get(pid) is link:
                    del self.links[pid]
                    self.events.append({"t": "left", "name": self.state["friends"].get(pid, {}).get("card", {}).get("n", "A friend")})
                if pid and self.pending.get(pid, {}).get("link") is link:
                    del self.pending[pid]

    def confirm(self, pid, ok):
        with self.lock:
            p = self.pending.get(pid)
        if not p:
            raise ValueError("That link request is gone.")
        if not ok:
            try:
                p["link"].send({"t": "decline"})
            except Exception:
                pass
            p["link"].close()
            return
        p["mine"] = True
        p["link"].send({"t": "confirm"})
        if p["theirs"]:
            self._linked(p["link"])

    def _linked(self, link):
        pid = link.peer_id
        with self.lock:
            self.pending.pop(pid, None)
            old = self.links.get(pid)
            self.links[pid] = link
            self.state["trusted"][pid] = b64e(link.peer_pk)
            self._save()
        if old and old is not link:
            old.close()
        link.send({"t": "card", "card": self.card()})
        with self.lock:
            items = [dict(i, id=k) for k, i in self.state.setdefault("list", {}).items()]
        if items:
            link.send({"t": "list", "items": items})

    def _handle(self, link, msg):
        t = msg.get("t") if isinstance(msg, dict) else None
        pid = link.peer_id
        if t == "confirm":
            with self.lock:
                p = self.pending.get(pid)
                already = self.links.get(pid) is link
            if already:   # they forgot us and asked again: we know them, so we agree
                link.send({"t": "confirm"})
            elif p:
                p["theirs"] = True
                if p["mine"]:
                    self._linked(link)
        elif t == "decline":
            self.events.append({"t": "declined", "name": self.pending.get(pid, {}).get("name", "They")})
            link.close()
        elif pid not in self.links or self.links[pid] is not link:
            return   # nothing else before the link is confirmed
        elif t == "card":
            card = clean_card(msg.get("card"))
            if card.get("id") != pid or not verify(card):
                return
            before = (self.state["friends"].get(pid, {}).get("card") or {}).get("ci", {}).get("at", 0)
            fid, new = self.add_friend(card, "camp", True)
            with self.lock:
                self.state["friends"][fid]["camp"] = True
                self._save()
            ci = card.get("ci")
            if ci and ci["at"] > before and before:
                self.events.append({"t": "checkin", "id": pid, "name": card["n"], "st": ci["st"], "note": ci.get("n", "")})
                self.notify("checkin", card["n"])
            if new:
                self.events.append({"t": "friend", "name": card["n"]})
        elif t == "msg":
            text = _s(msg.get("text"), 2000)
            wp = (clean_waypoints([msg.get("wp")]) or [None])[0] if msg.get("wp") else None
            if text or wp:
                self._store(pid, {"id": _s(msg.get("id"), 16) or secrets.token_hex(6), "text": text,
                                  "at": int(time.time() * 1000), "me": False, **({"wp": wp} if wp else {})})
                name = self.state["friends"].get(pid, {}).get("card", {}).get("n", "A friend")
                self.events.append({"t": "msg", "id": pid, "name": name, "text": (text or "◈ " + wp[2])[:120]})
                self.notify("message", name)
        elif t == "list":
            if self.merge_list(msg.get("items"), pid):
                self.events.append({"t": "list", "name": self.state["friends"].get(pid, {}).get("card", {}).get("n", "A friend")})

    # ------------------------------------------------- the shared supply list
    # One list for everyone linked (a household, a camp). Each item carries
    # when it last changed; the newest change wins, removals are kept as
    # tombstones so they spread too.
    def shared_list(self):
        with self.lock:
            items = dict(self.state.setdefault("list", {}))
        return sorted((dict(i, id=k) for k, i in items.items() if not i.get("gone")), key=lambda i: (i.get("done", False), -i.get("u", 0)))

    def merge_list(self, items, source=""):
        changed = False
        if not isinstance(items, list):
            return False
        with self.lock:
            mine = self.state.setdefault("list", {})
            for it in items[:400]:
                if not isinstance(it, dict):
                    continue
                iid = _s(it.get("id"), 16)
                u = it.get("u")
                if not re.fullmatch(r"[a-z0-9]{6,16}", iid) or not isinstance(u, int):
                    continue
                if mine.get(iid, {}).get("u", 0) >= u:
                    continue
                q = it.get("q")
                mine[iid] = {"t": _s(it.get("t"), 80), "q": _s(q, 20) if q else "", "done": bool(it.get("done")),
                             "by": _s(it.get("by"), 40), "u": u, **({"gone": True} if it.get("gone") else {})}
                changed = True
            if changed:
                # Tombstones older than a month are forgotten.
                cut = int(time.time() * 1000) - 30 * 86400 * 1000
                for k in [k for k, i in mine.items() if i.get("gone") and i["u"] < cut]:
                    del mine[k]
                self._save()
        return changed

    def edit_list(self, item, by):
        """Add, change, tick or remove an item, here and on every linked Umbra."""
        iid = _s(item.get("id"), 16) or secrets.token_hex(5)
        with self.lock:
            old = dict(self.state.setdefault("list", {}).get(iid, {}))
        new = {"id": iid, "t": _s(item.get("t", old.get("t", "")), 80), "q": _s(item.get("q", old.get("q", "")), 20),
               "done": bool(item.get("done", old.get("done", False))), "by": old.get("by") or _s(by, 40),
               "u": max(int(time.time() * 1000), old.get("u", 0) + 1), **({"gone": True} if item.get("gone") else {})}
        if not new["t"] and not new.get("gone"):
            raise ValueError("Write what the item is.")
        self.merge_list([new])
        self.push_list([new])
        return self.shared_list()

    def push_list(self, items=None):
        if items is None:
            with self.lock:
                items = [dict(i, id=k) for k, i in self.state.setdefault("list", {}).items()]
        for link in list(self.links.values()):
            try:
                link.send({"t": "list", "items": items})
            except Exception:
                pass

    def push_card(self):
        """My card changed: friends linked right now get the new one."""
        card = None
        for link in list(self.links.values()):
            try:
                card = card or self.card()
                link.send({"t": "card", "card": card})
            except Exception:
                pass


def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))   # no packet is sent: this only picks the network interface
        return s.getsockname()[0]
    except OSError:
        return ""
    finally:
        s.close()


def broadcast_addresses():
    """The local network's broadcast addresses (and the general one)."""
    out = ["255.255.255.255"]
    ip = local_ip()
    if ip and not ip.startswith("127."):
        out.append(".".join(ip.split(".")[:3]) + ".255")
    return out


def test_peers():
    """Two Umbras on one computer (testing): UMBRA_CAMP_PEERS="127.0.0.1:47811,…" """
    out = []
    for item in (os.environ.get("UMBRA_CAMP_PEERS") or "").split(","):
        host, _, port = item.strip().rpartition(":")
        if host and port.isdigit():
            out.append((host, int(port)))
    return out


def local_network():
    """This computer's local network, as 192.168.1.0/24 (for the firewall rule)."""
    import ipaddress
    import subprocess
    ip = local_ip()
    try:
        out = subprocess.run(["ip", "-o", "-f", "inet", "addr", "show"], capture_output=True, text=True, timeout=5).stdout
        for m in re.finditer(r"inet (\d+\.\d+\.\d+\.\d+)/(\d+)", out):
            if m.group(1) == ip:
                return str(ipaddress.ip_network(f"{ip}/{m.group(2)}", strict=False))
    except (OSError, ValueError):
        pass
    return ".".join(ip.split(".")[:3]) + ".0/24" if ip else ""
