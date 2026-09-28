"""Offline maps for Umbra Wiki.

Map data is OpenStreetMap, from the daily Protomaps planet build (vector
tiles, ODbL: © OpenStreetMap contributors). Umbra never downloads the
planet: for an area you choose (a country, or what's on screen) it reads the
archive's directory, works out exactly which tiles that area needs at each
level of detail (with their exact size), and fetches only those, with HTTP
range requests. Elevation comes from the open Terrain Tiles on AWS (SRTM and
other public sources), used for relief shading and contour lines.

Each area is one SQLite file in ~/.local/share/umbra-wiki/maps: the tiles
(stored once even when repeated, like open sea), the elevation tiles, and a
search index of its towns, streets, water points and other places. A small
world map (zoom 0-3) ships with Umbra, so the map works before any download.
"""

import bisect
import concurrent.futures
import json
import math
import os
import re
import sqlite3
import threading
import time
import unicodedata
import urllib.request

import pmtiles

BUILDS = "https://build-metadata.protomaps.dev/builds.json"
PLANET = "https://build.protomaps.com/"
TERRAIN = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
UA = {"User-Agent": "umbra-wiki (offline survival maps)"}

# Levels of detail to choose from, by the deepest zoom level downloaded.
# Vector tiles stay sharp when zoomed in further, so 14 shows streets up close.
DETAIL = [
    {"zoom": 10, "name": "Overview", "line": "Main roads, towns, rivers and forests"},
    {"zoom": 12, "name": "Towns & roads", "line": "Every town and village, main and local roads, streams"},
    {"zoom": 14, "name": "Streets & paths", "line": "Every street, footpath and track, buildings, water points, hospitals, shops"},
    {"zoom": 15, "name": "Full detail", "line": "The finest level, every small feature"},
]
TERRAIN_LEVELS = [0, 10, 11, 12]     # elevation detail: none, or the deepest zoom
# The finest level (15) is the only one with every water tap, shelter and
# pharmacy. "Essentials" fetches it but keeps only these points.
ESSENTIALS = {"drinking_water", "water_point", "spring", "water_well", "water_tap", "watering_place", "fountain",
              "hospital", "clinic", "doctors", "pharmacy", "defibrillator", "first_aid", "fire_station", "police",
              "shelter", "toilets", "fuel", "camp_site", "caravan_site", "alpine_hut", "wilderness_hut",
              "supermarket", "marketplace", "convenience", "peak", "cave_entrance", "saddle", "ranger_station",
              "emergency_phone", "phone", "telephone", "charging_station", "atm", "bank"}
TERRAIN_BYTES = 95_000               # an elevation tile, on average
MAX_TILES = 1_600_000                # a level of detail with more tiles than this is too big


def _norm(text):
    """Lower case without accents, so "sao paulo" finds São Paulo."""
    return re.sub(r"[̀-ͯ]", "", unicodedata.normalize("NFD", str(text))).lower().strip()


def tile_xy(lon, lat, z):
    n = 1 << z
    lat = max(-85.0511, min(85.0511, lat))
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return max(0, min(n - 1, x)), max(0, min(n - 1, y))


def tile_lonlat(z, x, y):
    n = 1 << z
    return x / n * 360 - 180, math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))


def tiles_in(bbox, z):
    x0, y1 = tile_xy(bbox[0], bbox[1], z)
    x1, y0 = tile_xy(bbox[2], bbox[3], z)
    return x0, y0, x1, y1


def count_in(bbox, z):
    x0, y0, x1, y1 = tiles_in(bbox, z)
    return (x1 - x0 + 1) * (y1 - y0 + 1)


_latest = {"key": "", "at": 0}


def latest_build():
    """The newest daily planet build (checked once a day)."""
    if _latest["key"] and time.time() - _latest["at"] < 86400:
        return _latest["key"]
    req = urllib.request.Request(BUILDS, headers=UA)
    builds = json.loads(urllib.request.urlopen(req, timeout=20).read())
    _latest.update(key=builds[-1]["key"], at=time.time())
    return _latest["key"]


SCHEMA = """
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS tiles(z INTEGER, x INTEGER, y INTEGER, d INTEGER, PRIMARY KEY(z, x, y)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS blobs(d INTEGER PRIMARY KEY, data BLOB);
CREATE TABLE IF NOT EXISTS points(z INTEGER, x INTEGER, y INTEGER, data BLOB, PRIMARY KEY(z, x, y)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS terrain(z INTEGER, x INTEGER, y INTEGER, data BLOB, PRIMARY KEY(z, x, y)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS places(name TEXT, key TEXT, kind TEXT, detail TEXT, lat REAL, lon REAL, rank INTEGER, ctx TEXT);
CREATE INDEX IF NOT EXISTS places_key ON places(key);
"""

# How important each kind of place is in search.
POI_RANK = {"drinking_water": 70, "water_point": 70, "spring": 70, "water_well": 65, "hospital": 60, "pharmacy": 50,
            "clinic": 50, "doctors": 45, "fire_station": 55, "police": 50, "shelter": 60, "camp_site": 50,
            "fuel": 45, "supermarket": 40, "aerodrome": 55, "station": 50, "peak": 55, "volcano": 55}
PLACE_RANK = {"country": 100, "region": 80, "city": 90, "town": 75, "village": 60, "hamlet": 45,
              "locality": 55, "macrohood": 40, "neighbourhood": 35}
WATER_NAMES = {"drinking_water": "Drinking water", "water_point": "Water point", "spring": "Spring",
               "water_well": "Water well"}


class Maps:
    def __init__(self, data_dir, app_dir):
        self.dir = os.path.join(data_dir, "maps")
        self.builtin = os.path.join(app_dir, "maps", "world.mbtiles")
        self.countries_file = os.path.join(app_dir, "maps", "countries.json")
        self.job = {"active": False}
        self.plans = {}
        self.lock = threading.Lock()
        self._areas = None
        self._local = threading.local()

    # ------------------------------------------------------------ areas

    def _db(self, path):
        """One read connection per thread and file."""
        conns = getattr(self._local, "conns", None)
        if conns is None:
            conns = self._local.conns = {}
        if path not in conns:
            conns[path] = sqlite3.connect(f"file:{path}?mode=ro", uri=True, check_same_thread=False)
        return conns[path]

    def areas(self):
        """The downloaded areas, most detailed first."""
        if self._areas is None:
            out = []
            if os.path.isdir(self.dir):
                for f in sorted(os.listdir(self.dir)):
                    if not f.endswith(".mbtiles"):
                        continue
                    path = os.path.join(self.dir, f)
                    try:
                        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
                        meta = dict(con.execute("SELECT key, value FROM meta").fetchall())
                        con.close()
                        out.append({"id": f[:-8], "path": path, "name": meta.get("name", f[:-8]),
                                    "bbox": json.loads(meta.get("bbox", "[-180,-85,180,85]")),
                                    "maxzoom": int(meta.get("maxzoom", 0)), "terrain": int(meta.get("terrain", 0)),
                                    "points": int(meta.get("points", 0)),
                                    "build": meta.get("build", ""), "created": int(meta.get("created", 0)),
                                    "bytes": os.path.getsize(path)})
                    except (sqlite3.Error, ValueError):
                        continue
            out.sort(key=lambda a: -a["maxzoom"])
            self._areas = out
        return self._areas

    def _covering(self, z, x, y, field):
        """Areas that hold this tile, most detailed first; then the built-in world."""
        lon0, lat1 = tile_lonlat(z, x, y)
        lon1, lat0 = tile_lonlat(z, x + 1, y + 1)
        for a in self.areas():
            b = a["bbox"]
            if (a[field] >= z if field != "points" else a[field] and z == 15) and b[0] <= lon1 and b[2] >= lon0 and b[1] <= lat1 and b[3] >= lat0:
                yield a["path"]
        if field == "maxzoom" and os.path.isfile(self.builtin):
            yield self.builtin

    def tile(self, z, x, y):
        for path in self._covering(z, x, y, "maxzoom"):
            row = self._db(path).execute(
                "SELECT b.data FROM tiles t JOIN blobs b ON b.d = t.d WHERE t.z=? AND t.x=? AND t.y=?", (z, x, y)).fetchone()
            if row:
                return row[0]
        return None

    def points(self, z, x, y):
        """The essential points (level 15) of an area that has them."""
        for path in self._covering(z, x, y, "points"):
            row = self._db(path).execute("SELECT data FROM points WHERE z=? AND x=? AND y=?", (z, x, y)).fetchone()
            if row:
                return row[0]
        return None

    def terrain(self, z, x, y):
        for path in self._covering(z, x, y, "terrain"):
            row = self._db(path).execute("SELECT data FROM terrain WHERE z=? AND x=? AND y=?", (z, x, y)).fetchone()
            if row:
                return row[0]
        return None

    def status(self):
        return {"areas": [{k: v for k, v in a.items() if k != "path"} for a in self.areas()],
                "builtin": {"maxzoom": 3} if os.path.isfile(self.builtin) else None,
                "detail": DETAIL, "terrainLevels": TERRAIN_LEVELS, "job": dict(self.job), "dir": self.dir}

    def countries(self):
        try:
            with open(self.countries_file, encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, ValueError):
            return []

    def delete(self, aid):
        if not re.fullmatch(r"[a-z0-9-]{1,60}", aid or ""):
            raise ValueError("unknown area")
        path = os.path.join(self.dir, aid + ".mbtiles")
        if not os.path.isfile(path):
            raise ValueError("unknown area")
        conns = getattr(self._local, "conns", {})
        if path in conns:
            conns.pop(path).close()
        os.remove(path)
        self._areas = None
        return self.status()

    # ------------------------------------------------------------ search

    def search(self, query, limit=30, near=None):
        """Towns, streets, water points and more, across every area. Points
        and streets are ranked by distance from near (the map's centre), so
        "drinking water" lists the closest taps first."""
        t = _norm(query)
        if len(t) < 2:
            return []
        rows = []
        paths = [a["path"] for a in self.areas()] + ([self.builtin] if os.path.isfile(self.builtin) else [])
        for path in paths:
            try:
                rows += self._db(path).execute(
                    "SELECT name, key, kind, detail, lat, lon, rank, ctx FROM places WHERE key LIKE ? "
                    "ORDER BY rank DESC LIMIT 400", (f"%{t}%",)).fetchall()
            except sqlite3.Error:
                continue
        seen, hits = set(), []
        for name, key, kind, detail, lat, lon, rank, ctx in rows:
            k = (key, detail, round(lat, 2), round(lon, 2))
            if k in seen:
                continue
            seen.add(k)
            i = key.find(t)
            start = i == 0 or key[i - 1] in " -'("
            score = (3000 if key == t else 1500 if start else 0) + rank * 10 - len(key)
            km = None
            if near:
                dl = math.radians(lat - near[0]) / 2
                dn = math.radians(lon - near[1]) / 2
                h = math.sin(dl) ** 2 + math.cos(math.radians(lat)) * math.cos(math.radians(near[0])) * math.sin(dn) ** 2
                km = 12742 * math.asin(min(1.0, math.sqrt(h)))
                if kind in ("poi", "street", "water"):
                    score -= min(2500, km * 25)
            hits.append((score, {"name": name, "kind": kind, "detail": detail, "lat": round(lat, 5),
                                 "lon": round(lon, 5), "ctx": ctx, "km": round(km, 2) if km is not None else None}))
        hits.sort(key=lambda h: -h[0])
        return [h for _, h in hits[:limit]]

    # ------------------------------------------------------------- jobs

    def _start(self, kind, target, *args):
        with self.lock:
            if self.job.get("active"):
                raise ValueError("a map job is already running")
            keep = self.job.get("plan") if kind == "download" else None
            self.job = {"active": True, "kind": kind, "phase": "start", "received": 0, "total": 0,
                        "done": 0, "count": 0, "error": "", "started": int(time.time())}
            if keep:
                self.job["plan"] = keep
        threading.Thread(target=self._guard, args=(target, *args), daemon=True).start()
        return self.status()

    def _guard(self, target, *args):
        try:
            target(*args)
        except Exception as e:   # shown in the Maps panel
            self.job["error"] = str(e)[:200]
            self.job["phase"] = "failed"
        finally:
            self.job["active"] = False

    def _fetched(self, n):
        self.job["received"] += n

    def plan(self, name, bbox):
        """Work out the exact size of an area at each level of detail. The
        directory scan also prepares the download."""
        bbox = [max(-180.0, float(bbox[0])), max(-85.0, float(bbox[1])), min(180.0, float(bbox[2])), min(85.0, float(bbox[3]))]
        if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
            raise ValueError("empty area")
        return self._start("plan", self._plan, str(name)[:60] or "Area", bbox)

    def _plan(self, name, bbox):
        self.job["phase"] = "scan"
        build = latest_build()
        remote = pmtiles.Remote(PLANET + build, self._fetched)
        zooms, total = [], 0
        for z in range(0, 16):
            total += count_in(bbox, z)
            if total > MAX_TILES:
                break
            zooms.append(z)
        wanted = []
        for z in zooms:
            x0, y0, x1, y1 = tiles_in(bbox, z)
            wanted += [pmtiles.zxy_to_id(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
        wanted.sort()
        self.job["count"] = len(wanted)
        entries = remote.entries(wanted, parallel=8)
        per, seen = {}, set()
        for tid, run, length, off in entries:
            z = pmtiles.id_to_zxy(tid)[0]
            if off not in seen:
                seen.add(off)
                per[z] = per.get(z, 0) + length
        sizes, cum = {}, 0
        for z in range(0, 16):
            cum += per.get(z, 0)
            if z in zooms:
                sizes[z] = cum
        terrain = {}
        for tz in TERRAIN_LEVELS[1:]:
            n = sum(count_in(bbox, z) for z in range(max(0, tz - 3), tz + 1))
            terrain[tz] = n * TERRAIN_BYTES if n < MAX_TILES // 8 else None
        pid = f"p{int(time.time() * 1000) % 10**9}"
        self.plans = {pid: {"name": name, "bbox": bbox, "build": build, "wanted": wanted, "entries": entries}}
        self.job["plan"] = {"id": pid, "name": name, "bbox": bbox, "build": build,
                            "sizes": {str(d["zoom"]): sizes.get(d["zoom"]) for d in DETAIL},
                            "essentials": per.get(15) if 15 in zooms else None,
                            "terrain": {str(k): v for k, v in terrain.items()}}
        self.job["phase"] = "planned"

    def download(self, pid, maxzoom, terrain_zoom, essentials=False, on_done=None):
        plan = self.plans.get(pid)
        if not plan:
            raise ValueError("plan the area again")
        if maxzoom not in [d["zoom"] for d in DETAIL] or terrain_zoom not in TERRAIN_LEVELS:
            raise ValueError("bad level")
        if not plan["wanted"] or pmtiles.id_to_zxy(plan["wanted"][-1])[0] < maxzoom:
            raise ValueError("that level of detail is too big for this area")
        essentials = bool(essentials) and maxzoom < 15 and pmtiles.id_to_zxy(plan["wanted"][-1])[0] >= 15
        return self._start("download", self._download, plan, maxzoom, terrain_zoom, essentials, on_done)

    def _download(self, plan, maxzoom, terrain_zoom, essentials, on_done):
        os.makedirs(self.dir, exist_ok=True)
        aid = (re.sub(r"[^a-z0-9]+", "-", _norm(plan["name"])).strip("-")[:40] or "area") + f"-z{maxzoom}"
        path = os.path.join(self.dir, aid + ".mbtiles")
        part = path + ".part"
        if os.path.exists(part):
            os.remove(part)
        con = sqlite3.connect(part)
        con.executescript(SCHEMA)
        build_zooms(con, plan, maxzoom, self.job)
        if essentials:
            build_zooms(con, plan, 15, self.job, only=15)
        if terrain_zoom:
            fetch_terrain(con, plan["bbox"], terrain_zoom, self.job)
        self.job.update(phase="index", done=0, count=con.execute("SELECT COUNT(*) FROM tiles").fetchone()[0])
        index(con, maxzoom, self.job)
        meta = {"name": plan["name"], "bbox": json.dumps(plan["bbox"]), "maxzoom": maxzoom, "terrain": terrain_zoom,
                "points": int(essentials), "build": plan["build"], "created": int(time.time())}
        con.executemany("INSERT OR REPLACE INTO meta VALUES (?,?)", [(k, str(v)) for k, v in meta.items()])
        con.commit()
        con.execute("VACUUM")
        con.close()
        conns = getattr(self._local, "conns", {})
        if path in conns:
            conns.pop(path).close()
        os.replace(part, path)
        self._areas = None
        self.job["phase"] = "done"
        self.job["area"] = aid
        if on_done:
            on_done(aid)


def build_zooms(con, plan, maxzoom, job, only=None):
    """Fetch an area's tiles up to maxzoom into the database: each distinct
    tile content once, in merged ranges (neighbouring tiles lie close).
    With only=15, just that level, keeping only its essential points."""
    remote = pmtiles.Remote(PLANET + plan["build"], None)
    last_id = ((1 << (2 * (maxzoom + 1))) - 1) // 3
    first_id = ((1 << (2 * only)) - 1) // 3 if only else 0
    wanted = plan["wanted"][bisect.bisect_left(plan["wanted"], first_id):bisect.bisect_left(plan["wanted"], last_id)]
    contents, rows = {}, []
    for tid, run, length, off in plan["entries"]:
        if tid >= last_id or tid + run <= first_id:
            continue
        lo = bisect.bisect_left(wanted, tid)
        hi = bisect.bisect_left(wanted, tid + run)
        if lo == hi:
            continue
        d = contents.setdefault(off, (len(contents), length))[0]
        rows += [(*pmtiles.id_to_zxy(t), d) for t in wanted[lo:hi]]
    if not only:
        con.executemany("INSERT OR REPLACE INTO tiles VALUES (?,?,?,?)", rows)
    spans = sorted((off, length, d) for off, (d, length) in contents.items())
    groups, cur = [], []
    for s in spans:
        if cur and (s[0] - (cur[-1][0] + cur[-1][1]) > 65536 or s[0] + s[1] - cur[0][0] > 4 << 20):
            groups.append(cur)
            cur = []
        cur.append(s)
    if cur:
        groups.append(cur)
    job.update(phase="points" if only else "tiles", total=sum(s[1] for s in spans), received=0, count=len(spans), done=0)

    def fetch(group):
        start, end = group[0][0], group[-1][0] + group[-1][1]
        for attempt in range(4):
            try:
                data = remote.read(remote.data_off + start, end - start)
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))
        return [(d, data[off - start:off - start + length]) for off, length, d in group]

    kept = {}
    with concurrent.futures.ThreadPoolExecutor(6) as pool:
        for result in pool.map(fetch, groups):
            job["received"] += sum(len(b) for _, b in result)
            job["done"] += len(result)
            if only:
                for d, data in result:
                    small = pmtiles.keep_points(data, "pois", ESSENTIALS)
                    if small:
                        kept[d] = small
            else:
                con.executemany("INSERT OR REPLACE INTO blobs VALUES (?,?)", result)
    if only:
        con.executemany("INSERT OR REPLACE INTO points VALUES (?,?,?,?)",
                        [(z, x, y, kept[d]) for z, x, y, d in rows if d in kept])
    con.commit()


def fetch_terrain(con, bbox, terrain_zoom, job):
    """Elevation tiles for relief and contours: the chosen level and three
    below it (for zoomed-out views)."""
    todo = []
    for z in range(max(0, terrain_zoom - 3), terrain_zoom + 1):
        x0, y0, x1, y1 = tiles_in(bbox, z)
        todo += [(z, x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    job.update(phase="terrain", total=len(todo), count=len(todo), done=0, received=0)

    def get(t):
        req = urllib.request.Request(TERRAIN.format(z=t[0], x=t[1], y=t[2]), headers=UA)
        for attempt in range(3):
            try:
                return t, urllib.request.urlopen(req, timeout=30).read()
            except Exception:
                time.sleep(1 + attempt)
        return t, None

    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        for (z, x, y), data in pool.map(get, todo):
            if data:
                con.execute("INSERT OR REPLACE INTO terrain VALUES (?,?,?,?)", (z, x, y, data))
                job["received"] += len(data)
            job["done"] += 1
    con.commit()


def index(con, maxzoom, job=None):
    """The search index: places (countries to hamlets) from every level, and
    streets, water points, named water and other useful places from the most
    detailed one (at most 14, which has them all)."""
    deep = min(14, maxzoom)
    rows, seen = [], set()
    n = 0
    tiles = con.execute("SELECT t.z, t.x, t.y, b.data FROM tiles t JOIN blobs b ON b.d = t.d").fetchall()
    tiles += con.execute("SELECT z, x, y, data FROM points").fetchall()
    for z, x, y, data in tiles:
        n += 1
        if job is not None and n % 200 == 0:
            job["done"] = n
        layers = ("pois",) if z == 15 and deep < 15 else ("places",) if z != deep else ("places", "pois", "roads", "water")
        try:
            tile = pmtiles.decode(data, layers)
        except Exception:
            continue
        n2 = 1 << z
        for layer, feats in tile.items():
            for props, gtype, fx, fy, extent in feats:
                name = props.get("name") or props.get("name:en") or ""
                kind = str(props.get("kind", ""))
                detail = str(props.get("kind_detail", "") or "")
                if layer == "places":
                    rank = PLACE_RANK.get(detail, PLACE_RANK.get(kind, 30)) + int(props.get("population_rank") or 0)
                elif layer == "pois":
                    if not name and kind not in ESSENTIALS:
                        continue
                    name = name or WATER_NAMES.get(kind) or kind.replace("_", " ").capitalize()
                    rank, detail, kind = POI_RANK.get(kind, 20), kind, "poi"
                elif layer == "roads":
                    if not name or kind in ("rail", "ferry", "aerialway"):
                        continue
                    rank, detail, kind = 15, kind, "street"
                else:
                    if not name:
                        continue
                    rank, detail, kind = 40, detail or kind, "water"
                if not name:
                    continue
                lon = (x + fx / extent) / n2 * 360 - 180
                lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + fy / extent) / n2))))
                key = _norm(name)
                digits = 1 if kind == "street" else 2
                sig = (key, detail, round(lat, digits), round(lon, digits))
                if sig in seen:
                    continue
                seen.add(sig)
                rows.append((str(name)[:80], key[:80], kind, detail, lat, lon, rank, ""))
        if len(rows) > 5000:
            con.executemany("INSERT INTO places VALUES (?,?,?,?,?,?,?,?)", rows)
            rows = []
    con.executemany("INSERT INTO places VALUES (?,?,?,?,?,?,?,?)", rows)
    con.commit()
