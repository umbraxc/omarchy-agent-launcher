"""Reading map tiles from a PMTiles v3 archive over HTTP, and decoding the
vector tiles inside (Mapbox Vector Tile protobuf), with the standard
library only. Used by maps.py to cut an area out of the daily
OpenStreetMap planet build (Protomaps basemap, ODbL) without downloading
the whole planet: only the directories and tiles of the chosen area are
fetched, with HTTP range requests.

Spec: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
"""

import bisect
import concurrent.futures
import gzip
import struct
import urllib.request

UA = {"User-Agent": "umbra-wiki (offline survival maps)"}


# ------------------------------------------------------------ tile ids

def _rotate(n, x, y, rx, ry):
    if ry == 0:
        if rx == 1:
            x, y = n - 1 - x, n - 1 - y
        x, y = y, x
    return x, y


def zxy_to_id(z, x, y):
    """Tiles are numbered along a Hilbert curve, zoom level after zoom level."""
    acc = ((1 << (2 * z)) - 1) // 3
    n = 1 << z
    d = 0
    s = n >> 1
    while s > 0:
        rx = 1 if (x & s) else 0
        ry = 1 if (y & s) else 0
        d += s * s * ((3 * rx) ^ ry)
        x, y = _rotate(n, x, y, rx, ry)
        s >>= 1
    return acc + d


def id_to_zxy(tid):
    z, acc = 0, 0
    while True:
        count = 1 << (2 * z)
        if tid < acc + count:
            break
        acc += count
        z += 1
    d = tid - acc
    n = 1 << z
    x = y = 0
    s = 1
    while s < n:
        rx = 1 & (d // 2)
        ry = 1 & (d ^ rx)
        x, y = _rotate(s, x, y, rx, ry)
        x += s * rx
        y += s * ry
        d //= 4
        s *= 2
    return z, x, y


# ------------------------------------------------------------ archive

def _varint(buf, pos):
    shift = result = 0
    while True:
        b = buf[pos]
        pos += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, pos
        shift += 7


class Remote:
    """A PMTiles archive behind a URL that supports range requests."""

    def __init__(self, url, fetched=None):
        self.url = url
        self.fetched = fetched   # called with the bytes received, for progress
        h = self.read(0, 127)
        if h[:7] != b"PMTiles" or h[7] != 3:
            raise ValueError("not a PMTiles v3 archive")
        (self.root_off, self.root_len, self.meta_off, self.meta_len, self.leaf_off, self.leaf_len,
         self.data_off, self.data_len) = struct.unpack_from("<8Q", h, 8)
        self.internal_comp, self.tile_comp, self.tile_type, self.min_zoom, self.max_zoom = struct.unpack_from("<5B", h, 97)

    def read(self, offset, length):
        req = urllib.request.Request(self.url, headers={**UA, "Range": f"bytes={offset}-{offset + length - 1}"})
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        if self.fetched:
            self.fetched(len(data))
        return data

    def _dir(self, raw):
        buf = gzip.decompress(raw) if self.internal_comp == 2 else raw
        n, pos = _varint(buf, 0)
        ids, runs, lens, offs = [0] * n, [0] * n, [0] * n, [0] * n
        last = 0
        for i in range(n):
            v, pos = _varint(buf, pos)
            last += v
            ids[i] = last
        for arr in (runs, lens):
            for i in range(n):
                arr[i], pos = _varint(buf, pos)
        for i in range(n):
            v, pos = _varint(buf, pos)
            offs[i] = offs[i - 1] + lens[i - 1] if (v == 0 and i > 0) else v - 1
        return list(zip(ids, runs, lens, offs))

    def root(self):
        return self._dir(self.read(self.root_off, self.root_len))

    def leaf(self, off, length):
        return self._dir(self.read(self.leaf_off + off, length))

    def entries(self, wanted, parallel=1):
        """Every tile entry (tile id, run length, length, data offset) that
        covers one of the wanted tile ids (a sorted list). Leaf directories
        are fetched several at a time."""
        out = []

        def scan(directory, pending):
            for i, (tid, run, length, off) in enumerate(directory):
                end = directory[i + 1][0] if i + 1 < len(directory) else 1 << 62
                lo = bisect.bisect_left(wanted, tid)
                if lo >= len(wanted):
                    continue
                if run == 0:
                    if wanted[lo] < end:
                        pending.append((off, length))
                elif wanted[lo] < tid + run:
                    out.append((tid, run, length, off))

        pending = []
        scan(self.root(), pending)
        while pending:
            with concurrent.futures.ThreadPoolExecutor(max(1, parallel)) as pool:
                found = list(pool.map(lambda p: self.leaf(*p), pending))
            pending = []
            for directory in found:
                scan(directory, pending)
        return out


# ------------------------------------------------------ vector tiles

def _fields(buf):
    """Protobuf fields: (number, wire type, value) with bytes for type 2."""
    pos, n = 0, len(buf)
    while pos < n:
        key, pos = _varint(buf, pos)
        num, wt = key >> 3, key & 7
        if wt == 0:
            v, pos = _varint(buf, pos)
        elif wt == 2:
            ln, pos = _varint(buf, pos)
            v = buf[pos:pos + ln]
            pos += ln
        elif wt == 5:
            v = buf[pos:pos + 4]
            pos += 4
        elif wt == 1:
            v = buf[pos:pos + 8]
            pos += 8
        else:
            raise ValueError("bad protobuf")
        yield num, wt, v


def _value(buf):
    for num, wt, v in _fields(buf):
        if num == 1:
            return bytes(v).decode("utf-8", "replace")
        if num == 2:
            return struct.unpack("<f", v)[0]
        if num == 3:
            return struct.unpack("<d", v)[0]
        if num in (4, 5):
            return v
        if num == 6:
            return (v >> 1) ^ -(v & 1)
        if num == 7:
            return bool(v)
    return None


def _first3(buf):
    out, pos = [], 0
    while pos < len(buf) and len(out) < 3:
        v, pos = _varint(buf, pos)
        out.append(v)
    return out


def _packed(buf):
    out, pos = [], 0
    while pos < len(buf):
        v, pos = _varint(buf, pos)
        out.append(v)
    return out


def decode(tile, layers=None):
    """Decode a vector tile: {layer: [(properties, type, first point x, y,
    extent)]}. Only the first point of each geometry is kept (enough for
    names in search)."""
    data = gzip.decompress(tile) if tile[:2] == b"\x1f\x8b" else tile
    out = {}
    for num, _, lb in _fields(data):
        if num != 3:
            continue
        name, keys, values, feats, extent = "", [], [], [], 4096
        for n2, _, v in _fields(lb):
            if n2 == 1:
                name = bytes(v).decode()
            elif n2 == 2:
                feats.append(v)
            elif n2 == 3:
                keys.append(bytes(v).decode())
            elif n2 == 4:
                values.append(_value(v))
            elif n2 == 5:
                extent = v
        if layers and name not in layers:
            continue
        rows = []
        for fb in feats:
            tags, gtype, geom = [], 0, []
            for n3, _, v in _fields(fb):
                if n3 == 2:
                    tags = _packed(v)
                elif n3 == 3:
                    gtype = v
                elif n3 == 4:
                    geom = _first3(v)   # only the first point is used
            props = {keys[tags[i]]: values[tags[i + 1]] for i in range(0, len(tags) - 1, 2)}
            x = y = 0
            if len(geom) >= 3 and (geom[0] & 7) == 1:
                x = (geom[1] >> 1) ^ -(geom[1] & 1)
                y = (geom[2] >> 1) ^ -(geom[2] & 1)
            rows.append((props, gtype, x, y, extent))
        out[name] = rows
    return out


# ------------------------------------------------------- keeping points

def _key(num, wt):
    return _enc(num << 3 | wt)


def _enc(v):
    out = bytearray()
    while True:
        b = v & 0x7F
        v >>= 7
        if v:
            out.append(b | 0x80)
        else:
            out.append(b)
            return bytes(out)


def keep_points(tile, layer, kinds):
    """A copy of a vector tile with only one layer, and in it only the
    features whose "kind" is one of kinds (b"" when nothing is left). Used to
    keep the life-saving points of the finest level (water taps, shelters,
    pharmacies...) without the rest of it."""
    data = gzip.decompress(tile) if tile[:2] == b"\x1f\x8b" else tile
    for num, _, lb in _fields(data):
        if num != 3:
            continue
        keys, values, feats, head, name = [], [], [], bytearray(), ""
        for n2, wt, v in _fields(lb):
            if n2 == 1:
                name = bytes(v).decode()
            if n2 == 2:
                feats.append(v)
            else:
                if n2 == 3:
                    keys.append(bytes(v).decode())
                elif n2 == 4:
                    values.append(_value(v))
                head += _key(n2, wt) + (_enc(len(v)) + bytes(v) if wt == 2 else _enc(v))
        if name != layer:
            continue
        kind_i = keys.index("kind") if "kind" in keys else -1
        kept = bytearray()
        for fb in feats:
            tags = []
            for n3, _, v in _fields(fb):
                if n3 == 2:
                    tags = _packed(v)
            kind = next((values[tags[i + 1]] for i in range(0, len(tags) - 1, 2) if tags[i] == kind_i), None)
            if kind in kinds:
                kept += _key(2, 2) + _enc(len(fb)) + bytes(fb)
        if not kept:
            return b""
        body = bytes(head) + bytes(kept)
        return gzip.compress(_key(3, 2) + _enc(len(body)) + body)
    return b""
