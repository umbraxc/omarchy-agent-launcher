"""Offline maps for Umbra Wiki.

The map data is Natural Earth (public domain, naturalearthdata.com). A small
world overview ships with Umbra; the World Atlas and the regional packs are
downloaded on request, cut to their region and converted into compact files
that the Maps tab draws itself: coordinates rounded to the map's scale and
stored as differences, so a region takes a few megabytes.

Pack file format (JSON): {"v": 1, "id", "name", "bbox": [w, s, e, n], "q": units
per degree, "layers": {name: [feature, ...]}}. A feature has "c" (coordinates:
a point [x, y], or a list of rings/lines, each a flat [x0, y0, dx, dy, ...]
list of integers in 1/q degrees), "b" (its bounding box, for lines and
areas), "n" (a name) and a few short attributes per layer.
"""

import json
import os
import re
import shutil
import tempfile
import threading
import time
import unicodedata
import urllib.request

SOURCE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"

# Regions for the detailed packs: [west, south, east, north]. They overlap a
# little at the edges, so nothing falls between two packs.
REGIONS = {
    "europe": ("Europe", [-25, 34, 50, 72]),
    "africa": ("Africa", [-26, -36, 56, 38]),
    "middle-east": ("Middle East & Central Asia", [24, 8, 90, 50]),
    "russia": ("Russia & North Asia", [40, 40, 180, 82]),
    "asia": ("South & East Asia", [60, -12, 150, 50]),
    "oceania": ("Australia & Oceania", [105, -50, 180, 5]),
    "north-america": ("North America", [-170, 7, -50, 84]),
    "south-america": ("South America & Caribbean", [-95, -57, -30, 25]),
}

# Layer sets: what a pack contains, and the Natural Earth files behind it.
# Each layer: (Natural Earth file, kind, attributes to keep).
SETS = {
    "atlas": {
        "countries": ("ne_50m_admin_0_countries", "area"),
        "borders": ("ne_50m_admin_0_boundary_lines_land", "line"),
        "coast": ("ne_50m_coastline", "line"),
        "provinces": ("ne_50m_admin_1_states_provinces_lines", "line"),
        "lakes": ("ne_50m_lakes", "area"),
        "rivers": ("ne_50m_rivers_lake_centerlines", "line"),
        "terrain": ("ne_50m_geography_regions_polys", "area"),
        "seas": ("ne_50m_geography_marine_polys", "label"),
        "cities": ("ne_50m_populated_places_simple", "point"),
    },
    "terrain": {
        "countries": ("ne_10m_admin_0_countries", "area"),
        "borders": ("ne_10m_admin_0_boundary_lines_land", "line"),
        "coast": ("ne_10m_coastline", "line"),
        "provinces": ("ne_10m_admin_1_states_provinces_lines", "line"),
        "provlabels": ("ne_10m_admin_1_states_provinces", "label"),
        "lakes": ("ne_10m_lakes", "area"),
        "rivers": ("ne_10m_rivers_lake_centerlines", "line"),
        "terrain": ("ne_10m_geography_regions_polys", "area"),
        "peaks": ("ne_10m_geography_regions_elevation_points", "point"),
        "glaciers": ("ne_10m_glaciated_areas", "area"),
        "parks": ("ne_10m_parks_and_protected_lands_area", "area"),
        "seas": ("ne_10m_geography_marine_polys", "label"),
        "cities": ("ne_10m_populated_places_simple", "point"),
    },
    "infra": {
        "urban": ("ne_10m_urban_areas", "area"),
        "roads": ("ne_10m_roads", "line"),
        "rail": ("ne_10m_railroads", "line"),
        "airports": ("ne_10m_airports", "point"),
        "ports": ("ne_10m_ports", "point"),
    },
}
SET_NAMES = {"terrain": "Terrain & places", "infra": "Infrastructure"}
SET_LINES = {
    "terrain": "Borders, provinces, cities and towns, rivers, lakes, mountain ranges, peaks, glaciers, parks, seas",
    "infra": "Roads, railways, airports, ports and urban areas",
}
# Download sizes in MB (measured), for the estimates shown before downloading.
SOURCE_MB = {
    "atlas": 15, "terrain": 119, "infra": 120,
}
QUANT = {"atlas": 100, "terrain": 1000, "infra": 1000}   # units per degree: 0.01° and 0.001°


def _norm(text):
    """Lower case without accents, so "sao paulo" finds São Paulo."""
    return re.sub(r"[\u0300-\u036f]", "", unicodedata.normalize("NFD", str(text))).lower()


def pack_id(kind, region=""):
    return kind if kind == "atlas" else f"{kind}-{region}"


def catalog():
    """Every pack there is: the world overview (built in), the World Atlas,
    and a terrain and an infrastructure pack per region."""
    packs = [{"id": "world", "name": "World overview", "kind": "world", "builtin": True,
              "line": "Countries, capitals, major rivers and lakes. Built in."},
             {"id": "atlas", "name": "World Atlas", "kind": "atlas", "region": "",
              "line": "The whole world in more detail: borders, provinces, 1,200 cities, rivers, lakes, mountain ranges, seas",
              "download": SOURCE_MB["atlas"]}]
    for rid, (rname, bbox) in REGIONS.items():
        for kind in ("terrain", "infra"):
            packs.append({"id": pack_id(kind, rid), "name": f"{rname} · {SET_NAMES[kind]}", "kind": kind,
                          "region": rid, "regionName": rname, "bbox": bbox, "line": SET_LINES[kind]})
    return packs


# ---------------------------------------------------------------- geometry

def _rings(geom):
    """All rings (areas) or lines of a GeoJSON geometry, as lists of [x, y]."""
    t, c = geom.get("type"), geom.get("coordinates")
    if t == "Polygon":
        return c
    if t == "MultiPolygon":
        return [r for poly in c for r in poly]
    if t == "LineString":
        return [c]
    if t == "MultiLineString":
        return c
    return []


def _clip(ring, box):
    """Cut an area's ring to a box (Sutherland-Hodgman), so a region holds
    only its part of a continent."""
    w, s, e, n = box
    for inside, cross in (
        (lambda p: p[0] >= w, lambda a, b: [w, a[1] + (b[1] - a[1]) * (w - a[0]) / (b[0] - a[0])]),
        (lambda p: p[0] <= e, lambda a, b: [e, a[1] + (b[1] - a[1]) * (e - a[0]) / (b[0] - a[0])]),
        (lambda p: p[1] >= s, lambda a, b: [a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]), s]),
        (lambda p: p[1] <= n, lambda a, b: [a[0] + (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]), n]),
    ):
        if not ring:
            return []
        out = []
        prev = ring[-1]
        for cur in ring:
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
            prev = cur
        ring = out
    return ring


def _encode(points, q, closed):
    """Round to the map's scale, drop points that fall together, and store
    the differences: [x0, y0, dx1, dy1, ...]."""
    out, last = [], None
    for p in points:
        x, y = round(p[0] * q), round(p[1] * q)
        if last and x == last[0] and y == last[1]:
            continue
        out.append((x, y))
        last = (x, y)
    if len(out) < (3 if closed else 2):
        return None
    flat = [out[0][0], out[0][1]]
    for (ax, ay), (bx, by) in zip(out, out[1:]):
        flat += [bx - ax, by - ay]
    return flat


def _bbox(rings):
    xs = [p[0] for r in rings for p in r]
    ys = [p[1] for r in rings for p in r]
    return [min(xs), min(ys), max(xs), max(ys)] if xs else None


def _centroid(rings):
    """The centre of the largest ring: a good spot for a label."""
    best, area = None, 0
    for r in rings:
        a = cx = cy = 0
        for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]):
            k = x0 * y1 - x1 * y0
            a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k
        if a and abs(a) > area:
            area, best = abs(a), (cx / (3 * a), cy / (3 * a))
    return best


def _hits(b, box):
    return b and b[0] <= box[2] and b[2] >= box[0] and b[1] <= box[3] and b[3] >= box[1]


def _num(v, default=0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _feature(layer, kind, f, q, box):
    """One GeoJSON feature in the compact form, or None when it's outside
    the region or too small to keep."""
    p = {k.lower(): v for k, v in (f.get("properties") or {}).items()}
    geom = f.get("geometry") or {}
    name = str(p.get("name_en") or p.get("name") or "").strip()
    out = {}
    if kind == "point" or kind == "label":
        if kind == "point":
            if geom.get("type") != "Point":
                return None
            x, y = geom["coordinates"][:2]
        else:   # an area used only for its name: its label point
            x = _num(p.get("label_x") or p.get("longitude"), None)
            y = _num(p.get("label_y") or p.get("latitude"), None)
            if x is None or y is None:
                c = _centroid(_rings(geom))
                if not c:
                    return None
                x, y = c
            if not name:
                return None
        if box and not (box[0] <= x <= box[2] and box[1] <= y <= box[3]):
            return None
        out["c"] = [round(x * q), round(y * q)]
    else:
        rings = _rings(geom)
        b = _bbox(rings)
        if not b or (box and not _hits(b, box)):
            return None
        closed = kind == "area"
        if box and closed and not (box[0] <= b[0] and b[2] <= box[2] and box[1] <= b[1] and b[3] <= box[3]):
            rings = [_clip(r, box) for r in rings]
        enc = [e for e in (_encode(r, q, closed) for r in rings) if e]
        if not enc:
            return None
        out["c"] = enc
        b = _bbox([r for r in rings if r]) or b
        out["b"] = [round(b[0] * q), round(b[1] * q), round(b[2] * q), round(b[3] * q)]
    if name:
        out["n"] = name[:60]
    # A few attributes per layer, for styling and search.
    if layer == "countries":
        out["m"] = int(_num(p.get("mapcolor7"), 1))
        lx, ly = _num(p.get("label_x"), None), _num(p.get("label_y"), None)
        if lx is not None and ly is not None:
            out["l"] = [round(lx * q), round(ly * q)]
        out["r"] = int(_num(p.get("labelrank"), 5))
    elif layer == "cities":
        out["p"] = int(_num(p.get("pop_max")))
        out["r"] = int(_num(p.get("scalerank"), 10))
        if "admin-0 capital" in str(p.get("featurecla", "")).lower():   # national capitals only
            out["cap"] = 1
        if p.get("adm0name"):
            out["a"] = str(p["adm0name"])[:40]
    elif layer in ("rivers", "lakes", "terrain", "seas", "provlabels", "roads"):
        out["r"] = int(_num(p.get("scalerank") or p.get("min_label"), 5))
        if layer == "terrain":
            out["t"] = str(p.get("featurecla", ""))[:20].lower()
        if layer == "roads":
            kind_ = str(p.get("type", "")).lower()
            out["t"] = "ferry" if "ferry" in kind_ else "major" if "major" in kind_ else "minor"
            ref = str(p.get("label") or p.get("number") or "").strip()
            if ref and ref != "0":
                out["n"] = ref[:12]
        if layer == "provlabels" and p.get("admin"):
            out["a"] = str(p["admin"])[:40]
    elif layer == "peaks":
        out["e"] = int(_num(p.get("elevation")))
    elif layer == "airports":
        if p.get("iata_code"):
            out["i"] = str(p["iata_code"])[:4]
        out["t"] = "major" if "major" in str(p.get("type", "")).lower() else "minor"
    if layer in ("coast", "borders", "provinces", "rail"):
        out.pop("n", None)   # lines drawn without labels
    return out


# ---------------------------------------------------------------- downloads

class Maps:
    """The map packs on this computer, and the download job."""

    def __init__(self, data_dir, app_dir):
        self.dir = os.path.join(data_dir, "maps")
        self.builtin = os.path.join(app_dir, "maps")
        self.job = {"active": False}
        self.lock = threading.Lock()

    def path(self, pid):
        if pid == "world":
            return os.path.join(self.builtin, "world.json")
        return os.path.join(self.dir, pid + ".json")

    def status(self):
        packs = []
        for p in catalog():
            path = self.path(p["id"])
            p = dict(p)
            p["installed"] = os.path.isfile(path)
            p["bytes"] = os.path.getsize(path) if p["installed"] else 0
            packs.append(p)
        return {"packs": packs, "regions": [{"id": k, "name": v[0], "bbox": v[1]} for k, v in REGIONS.items()],
                "sets": [{"id": k, "name": SET_NAMES[k], "line": SET_LINES[k], "downloadMB": SOURCE_MB[k]} for k in ("terrain", "infra")],
                "atlasMB": SOURCE_MB["atlas"], "job": dict(self.job), "dir": self.dir}

    # Search across every map on this computer, not only what's on screen:
    # an index of names, built once and rebuilt when packs change.
    _index, _index_key = [], None
    WEIGHT = {"country": 9, "capital": 8, "city": 6, "town": 4, "province": 5, "sea": 5, "terrain": 4,
              "peak": 4, "lake": 4, "river": 3, "airport": 3, "port": 2}

    def _build_index(self):
        installed = [p["id"] for p in catalog() if os.path.isfile(self.path(p["id"]))]
        key = [(pid, os.path.getmtime(self.path(pid))) for pid in installed]
        if key == self._index_key:
            return self._index
        out, seen = [], set()

        def add(kind, name, lon, lat, q, **extra):
            if not name:
                return
            lat, lon = lat / q, lon / q
            k = (kind, _norm(name), round(lat * 4), round(lon * 4))
            if k in seen:
                return
            seen.add(k)
            out.append({"kind": kind, "name": name, "lat": round(lat, 4), "lon": round(lon, 4), "key": k[1], **extra})
        for pid in installed:
            try:
                with open(self.path(pid), encoding="utf-8") as fh:
                    pack = json.load(fh)
            except (OSError, ValueError):
                continue
            q, L = pack.get("q", 100), pack.get("layers", {})
            first = lambda f: (f["c"][0][0], f["c"][0][1]) if f.get("b") else (f["c"][0], f["c"][1])
            centre = lambda f: tuple(f["l"]) if f.get("l") else ((f["b"][0] + f["b"][2]) / 2, (f["b"][1] + f["b"][3]) / 2)
            for f in L.get("countries", []):
                add("country", f.get("n"), *centre(f), q, zoom=4.5)
            for f in L.get("cities", []):
                pop = f.get("p", 0)
                add("capital" if f.get("cap") else "city" if pop > 100000 else "town", f.get("n"), *first(f), q,
                    ctx=f.get("a", ""), pop=pop, zoom=8.5)
            for layer, kind, zoom in (("provlabels", "province", 6.5), ("seas", "sea", 4.5), ("peaks", "peak", 9),
                                      ("airports", "airport", 10), ("ports", "port", 10)):
                for f in L.get(layer, []):
                    name = f.get("n") or ""
                    if kind == "airport" and f.get("i"):
                        name = f"{name} ({f['i']})"
                    ctx = f.get("a", "") or (f"{f['e']} m" if f.get("e") else "")
                    add(kind, name, *first(f), q, ctx=ctx, zoom=zoom)
            for layer, kind, zoom in (("terrain", "terrain", 6), ("lakes", "lake", 7.5), ("rivers", "river", 6.5)):
                for f in L.get(layer, []):
                    ctx = (f.get("t") or "").replace("/", " ") if kind == "terrain" else ""
                    add(kind, f.get("n"), *centre(f), q, ctx=ctx, zoom=zoom)
        self._index, self._index_key = out, key
        return out

    def search(self, query, limit=30):
        t = _norm(query)
        if len(t) < 2:
            return []
        hits = []
        for it in self._build_index():
            i = it["key"].find(t)
            if i < 0:
                continue
            start = i == 0 or it["key"][i - 1] in " -'("
            score = (3000 if it["key"] == t else 1500 if start else 0) + self.WEIGHT[it["kind"]] * 100 \
                + len(str(it.get("pop") or 0)) * 30 - len(it["key"])
            hits.append((score, it))
        hits.sort(key=lambda h: -h[0])
        return [{k: v for k, v in it.items() if k != "key"} for _, it in hits[:limit]]

    def delete(self, pid):
        if pid == "world" or pid not in [p["id"] for p in catalog()]:
            raise ValueError("unknown pack")
        try:
            os.remove(self.path(pid))
        except OSError:
            pass
        return self.status()

    def start(self, wanted, on_done=None):
        """Download and build packs in the background. The Natural Earth files
        are shared by all regions, so each is fetched once per job."""
        known = {p["id"]: p for p in catalog() if p["id"] != "world"}
        wanted = [w for w in dict.fromkeys(wanted) if w in known]
        if not wanted:
            raise ValueError("nothing to download")
        with self.lock:
            if self.job.get("active"):
                raise ValueError("a map download is already running")
            self.job = {"active": True, "packs": wanted, "done": [], "phase": "download", "file": "",
                        "received": 0, "total": 0, "error": "", "started": int(time.time())}
        threading.Thread(target=self._run, args=([known[w] for w in wanted], on_done), daemon=True).start()
        return self.status()

    def _run(self, packs, on_done):
        tmp = tempfile.mkdtemp(prefix="umbra-maps-")
        try:
            files = sorted({f for p in packs for f, _ in SETS[p["kind"]].values()})
            self.job["total"] = sum(SOURCE_MB[k] for k in {p["kind"] for p in packs}) * 1_000_000
            for fname in files:
                self.job["file"] = fname
                self._fetch(fname, os.path.join(tmp, fname + ".geojson"))
            self.job["phase"] = "build"
            cache = {}

            def source(fname):
                if fname not in cache:
                    cache.clear()   # one big file in memory at a time
                    with open(os.path.join(tmp, fname + ".geojson"), encoding="utf-8") as fh:
                        cache[fname] = json.load(fh)
                return cache[fname]

            os.makedirs(self.dir, exist_ok=True)
            # Build layer by layer across packs, so each source is read once.
            built = {p["id"]: {"v": 1, "id": p["id"], "name": p["name"], "kind": p["kind"],
                               "bbox": p.get("bbox", [-180, -90, 180, 90]), "q": QUANT[p["kind"]], "layers": {}}
                     for p in packs}
            for fname in files:
                for p in packs:
                    for layer, (f, kind) in SETS[p["kind"]].items():
                        if f != fname:
                            continue
                        box = p.get("bbox")
                        grown = [box[0] - 1, box[1] - 1, box[2] + 1, box[3] + 1] if box else None
                        built[p["id"]]["layers"][layer] = [x for x in (
                            _feature(layer, kind, feat, QUANT[p["kind"]], grown)
                            for feat in source(fname).get("features", [])) if x]
            for pid, pack in built.items():
                part = self.path(pid) + ".part"
                with open(part, "w", encoding="utf-8") as fh:
                    json.dump(pack, fh, separators=(",", ":"), ensure_ascii=False)
                os.replace(part, self.path(pid))
                self.job["done"].append(pid)
            self.job["phase"] = "done"
            if on_done:
                on_done(list(built))
        except Exception as e:   # shown in the Maps panel
            self.job["error"] = str(e)[:200]
            self.job["phase"] = "failed"
        finally:
            self.job["active"] = False
            shutil.rmtree(tmp, ignore_errors=True)

    def _fetch(self, fname, dest):
        req = urllib.request.Request(SOURCE + fname + ".geojson", headers={"User-Agent": "umbra-wiki"})
        with urllib.request.urlopen(req, timeout=60) as r, open(dest, "wb") as fh:
            while True:
                chunk = r.read(1 << 16)
                if not chunk:
                    break
                fh.write(chunk)
                self.job["received"] += len(chunk)
