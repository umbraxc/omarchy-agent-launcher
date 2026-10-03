#!/usr/bin/env python3
"""Builds umbra-wiki/maps/atlas-more.json: the full country files behind the
Maps' country cards (opened with "FULL FILE").

Sources (both public domain / CC0):
  * The World Factbook via factbook.json (https://github.com/factbook/factbook.json):
    download the repository archive and unzip it.
  * Wikidata (CC0): plugs, mains voltage, driving side, calling code, top-level
    domain and emergency numbers, from two SPARQL queries saved as JSON:

      SELECT ?a3 ?prop ?valLabel ?val WHERE { ?c wdt:P298 ?a3 .
        VALUES ?prop { wdt:P1622 wdt:P2853 wdt:P2884 wdt:P474 wdt:P78 wdt:P85 }
        ?c ?prop ?val . SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }

      SELECT ?a3 ?numLabel ?useLabel WHERE { ?c wdt:P298 ?a3 . ?c p:P2852 ?st . ?st ps:P2852 ?num .
        OPTIONAL { ?st pq:P366 ?use . } SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } }

Usage: build-atlas-more.py FACTBOOK_DIR WIKIDATA.json EMERGENCY.json
"""
import glob
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS = os.path.join(HERE, "..", "umbra-wiki", "maps", "atlas.json")
OUT = os.path.join(HERE, "..", "umbra-wiki", "maps", "atlas-more.json")

# Atlas names the Factbook spells differently (file codes).
BY_HAND = {"Côte d'Ivoire": "iv", "Faeroe Islands": "fo", "Falkland Is.": "fk", "Palestine": "we",
           "St. Vin. and Gren.": "vc", "U.S. Virgin Is.": "vq"}
# Mains at 60 Hz (the rest of the world is 50 Hz; Japan is both).
HZ60 = set("USA CAN MEX GTM BLZ SLV HND NIC CRI PAN CUB DOM HTI BHS PRI TTO VIR BRA COL ECU PER VEN GUY SUR KOR TWN PHL SAU "
           "LBR FSM MHL PLW GUM ASM MNP ABW CUW AIA ATG BMU CYM KNA LCA MSR VCT TCA VGB BES SXM".split())
PLUG = {"Europlug": "C", "Schuko": "F", "NEMA 1-15": "A", "NEMA 5-15": "B", "BS 1363": "G", "Type E": "E",
        "AS/NZS 3112": "I", "BS 546": "D", "Type L": "L", "Type K": "K", "SN 441011": "J", "IEC 60906-1": "N", "Type H": "H",
        "AC power plugs and sockets: British and related types": "G"}


def clean(s, limit=0):
    s = html.unescape(re.sub(r"<[^>]+>", " ", str(s or "")))
    s = re.sub(r"\s+", " ", s).strip(" ;,")
    if limit and len(s) > limit:
        cut = s[:limit]
        end = max(cut.rfind(". "), cut.rfind("; "))
        s = (cut[: end + 1] if end > limit * 0.5 else cut.rsplit(" ", 1)[0]) + "…"
    return s


def text(node, limit=0):
    """A field as one line: its text, or its parts joined."""
    if not node:
        return ""
    if isinstance(node, str):
        return clean(node, limit)
    if "text" in node:
        return clean(node["text"], limit)
    parts = [f"{k}: {clean(v.get('text', ''))}" for k, v in node.items() if isinstance(v, dict) and v.get("text") and k != "note"]
    return clean("; ".join(parts), limit)


def part(node, key, limit=0):
    v = (node or {}).get(key)
    return clean(v.get("text", ""), limit) if isinstance(v, dict) else ""


def latest(node, limit=0):
    """For yearly series ("Real GDP per capita 2024": …): the newest value."""
    if not node:
        return ""
    keys = sorted((k for k in node if re.search(r"\d{4}$", k)), reverse=True)
    return clean(node[keys[0]]["text"], limit) if keys else text(node, limit)


def pct(s):
    m = re.search(r"(-?\d+(?:\.\d+)?)\s*%", s or "")
    return float(m.group(1)) if m else None


def num(s):
    m = re.search(r"(-?\d[\d,]*(?:\.\d+)?)", s or "")
    return float(m.group(1).replace(",", "")) if m else None


def shares(node, names):
    """Percentages of named parts, e.g. {"agriculture": 1.4, …}."""
    out = {}
    for key, short in names.items():
        for k, v in (node or {}).items():
            if (k == key or k.endswith(": " + key)) and isinstance(v, dict):
                p = pct(v.get("text"))
                if p is not None:
                    out[short] = p
    return out


def listed(s, limit=12):
    """ "Germany 11%, Italy 9%" -> [["Germany", 11], …]."""
    out = []
    for m in re.finditer(r"([^,;()]+?)\s+(\d+(?:\.\d+)?)%", s or ""):
        name = m.group(1).strip()
        if name and not re.match(r"^\d", name):
            out.append([name, float(m.group(2))])
    return out[:limit]


def build(fb_dir, wd_path, em_path):
    atlas = json.load(open(ATLAS))
    files = {}
    for f in glob.glob(os.path.join(fb_dir, "*", "*.json")):
        d = json.load(open(f))
        g = d.get("Government", {}).get("Country name", {})
        files[os.path.basename(f)[:-5]] = (part(g, "conventional short form").lower(), part(g, "conventional long form").lower(), d)
    bylong = {v[1]: k for k, v in files.items() if v[1] and v[1] != "none"}
    byshort = {v[0]: k for k, v in files.items() if v[0]}

    wd, em = {}, {}
    for b in json.load(open(wd_path))["results"]["bindings"]:
        wd.setdefault(b["a3"]["value"], {}).setdefault(b["prop"]["value"].rsplit("/", 1)[-1], []).append(b["valLabel"]["value"])
    for b in json.load(open(em_path))["results"]["bindings"]:
        use = b.get("useLabel", {}).get("value") or ""
        use = {"emergency medical services": "ambulance", "fire department": "fire"}.get(use, use)
        em.setdefault(b["a3"]["value"], []).append([b["numLabel"]["value"], use])

    out = {}
    for c in atlas:
        long_ = (c.get("facts") or {}).get("long", "").lower()
        code = BY_HAND.get(c["name"]) or bylong.get(long_) or byshort.get(c["name"].lower())
        d = files[code][2] if code else {}
        P, G, E, N, EN, CO, T, GO, SP = (d.get(k, {}) for k in ("People and Society", "Geography", "Economy", "Environment",
                                                                 "Energy", "Communications", "Transportation", "Government", "Space"))
        m = {}
        if d:
            m["intro"] = text(d.get("Introduction", {}).get("Background"), 1400)
            m["nat"] = {"noun": part(P.get("Nationality"), "noun"), "adj": part(P.get("Nationality"), "adjective")}
            m["ethnic"] = text(P.get("Ethnic groups"), 400)
            ages = P.get("Age structure") or {}
            m["people"] = {
                "age": [pct(part(ages, "0-14 years")), pct(part(ages, "15-64 years")), pct(part(ages, "65 years and over"))],
                "median": part(P.get("Median age"), "total"), "growth": text(P.get("Population growth rate")),
                "urban": pct(part(P.get("Urbanization"), "urban population")), "cities": text(P.get("Major urban areas - population"), 400),
                "births": text(P.get("Birth rate")), "deaths": text(P.get("Death rate")), "infant": part(P.get("Infant mortality rate"), "total"),
                "fertility": text(P.get("Total fertility rate")), "obesity": text(P.get("Obesity - adult prevalence rate")),
                "sanitation": pct(part(P.get("Sanitation facility access"), "improved: total")),
                "drink": [pct(part(P.get("Drinking water source"), "improved: urban")), pct(part(P.get("Drinking water source"), "improved: rural"))],
                "healthSpend": text(P.get("Health expenditure")), "school": part(P.get("School life expectancy (primary to tertiary education)"), "total"),
                "religions": listed(text(P.get("Religions"))), "languages": re.sub(r"^Languages: |;? ?major-language sample.*$", "", text(P.get("Languages"))[:600]).strip()[:400], "distribution": text(P.get("Population distribution"), 360),
            }
            m["land"] = {
                "use": shares(G.get("Land use"), {"arable land": "arable", "permanent crops": "crops", "permanent pasture": "pasture", "forest": "forest", "other": "other"}),
                "comparative": text(G.get("Area - comparative"), 200), "mean": part(G.get("Elevation"), "mean elevation"),
                "coords": text(G.get("Geographic coordinates"), 200), "irrigated": text(G.get("Irrigated land")),
                "boundaries": part(G.get("Land boundaries"), "total"), "maritime": text(G.get("Maritime claims"), 240),
                "watersheds": text(G.get("Major watersheds (area sq km)"), 300), "aquifers": text(G.get("Major aquifers"), 200),
                "note": text(G.get("Geography - note"), 500), "issues": text(N.get("Environmental issues"), 500),
                "co2": text(N.get("Carbon dioxide emissions"), 120), "climate": text(G.get("Climate"), 500),
            }
            m["econ"] = {
                "overview": text(E.get("Economic overview"), 700), "gdp": latest(E.get("Real GDP (purchasing power parity)")),
                "growth": latest(E.get("Real GDP growth rate")), "perCap": latest(E.get("Real GDP per capita")),
                "inflation": latest(E.get("Inflation rate (consumer prices)")),
                "sectors": shares(E.get("GDP - composition, by sector of origin"), {"agriculture": "agri", "industry": "industry", "services": "services"}),
                "farm": text(E.get("Agricultural products"), 300), "industries": text(E.get("Industries"), 300),
                "labor": text(E.get("Labor force"), 120), "unemployment": latest(E.get("Unemployment rate")),
                "poverty": text(E.get("Population below poverty line"), 120), "debt": latest(E.get("Public debt"), 120),
                "exports": {"value": latest(E.get("Exports")), "partners": listed(text(E.get("Exports - partners"))), "goods": text(E.get("Exports - commodities"), 260)},
                "imports": {"value": latest(E.get("Imports")), "partners": listed(text(E.get("Imports - partners"))), "goods": text(E.get("Imports - commodities"), 260)},
                "rates": text(E.get("Exchange rates"), 160),
            }
            m["energy"] = {
                "access": pct(text(EN.get("Electricity access"))),
                "sources": shares(EN.get("Electricity generation sources"), {"fossil fuels": "fossil", "nuclear": "nuclear", "solar": "solar", "wind": "wind",
                                                                              "hydroelectricity": "hydro", "geothermal": "geothermal", "biomass and waste": "biomass", "tide and wave": "tide"}),
                "capacity": part(EN.get("Electricity"), "installed generating capacity"), "use": part(EN.get("Electricity"), "consumption"),
                "oil": part(EN.get("Petroleum"), "crude oil estimated reserves") or part(EN.get("Petroleum"), "total petroleum production"),
                "gas": part(EN.get("Natural gas"), "proven reserves") or part(EN.get("Natural gas"), "production"),
                "coal": part(EN.get("Coal"), "proven reserves"), "perCap": text(EN.get("Energy consumption per capita"), 100),
                "nuclear": text(EN.get("Nuclear energy"), 200),
            }
            m["comms"] = {
                "internet": pct(text(CO.get("Internet users"))), "mobile": num(part(CO.get("Telephones - mobile cellular"), "subscriptions per 100 inhabitants")),
                "fixed": num(part(CO.get("Telephones - fixed lines"), "subscriptions per 100 inhabitants")),
                "broadband": num(part(CO.get("Broadband - fixed subscriptions"), "subscriptions per 100 inhabitants")),
                "media": text(CO.get("Broadcast media"), 420), "tld": text(CO.get("Internet country code")),
            }
            m["transport"] = {
                "airports": text(T.get("Airports")), "heliports": text(T.get("Heliports")), "rail": part(T.get("Railways"), "total"),
                "ports": part(T.get("Ports"), "total ports"), "keyPorts": part(T.get("Ports"), "key ports", 260),
                "ships": part(T.get("Merchant marine"), "total"), "prefix": text(T.get("Civil aircraft registration country code prefix")),
            }
            heritage = GO.get("National heritage") or {}
            sites = [[clean(re.sub(r"\(([cnm])\)$", "", s)), (re.search(r"\(([cnm])\)\s*$", s) or [None, ""])[1]]
                     for s in re.split(r";\s*", part(heritage, "selected World Heritage Site locales")) if s.strip()]
            flag = part(GO.get("Flag"), "text") or text(GO.get("Flag"))
            fd = re.search(r"description:\s*(.*?)(?:history:|$)", clean(GO.get("Flag", {}).get("text", "")))
            fh = re.search(r"history:\s*(.*)$", clean(GO.get("Flag", {}).get("text", "")))
            m["gov"] = {
                "type": text(GO.get("Government type")), "chief": part(GO.get("Executive branch"), "chief of state", 200),
                "head": part(GO.get("Executive branch"), "head of government", 200), "independence": text(GO.get("Independence"), 260),
                "holiday": text(GO.get("National holiday"), 160), "symbols": text(GO.get("National symbol(s)"), 200),
                "colors": text(GO.get("National color(s)")), "legal": text(GO.get("Legal system"), 160), "suffrage": text(GO.get("Suffrage"), 120),
                "anthem": {"title": part(GO.get("National anthem(s)"), "title", 160), "by": part(GO.get("National anthem(s)"), "lyrics/music", 160),
                           "history": part(GO.get("National anthem(s)"), "history", 300)},
                "flag": clean(fd.group(1), 360) if fd else clean(flag, 360), "flagStory": clean(fh.group(1), 500) if fh else "",
                "heritage": {"total": part(heritage, "total World Heritage Sites"), "sites": sites[:14]},
                "divisions": text(GO.get("Administrative divisions"), 300),
            }
            if SP:
                m["space"] = {"agency": text(SP.get("Space agency/agencies"), 240), "sites": text(SP.get("Space launch site(s)"), 240),
                              "overview": text(SP.get("Space program overview"), 600)}
            ref = text(d.get("Transnational Issues", {}).get("Refugees and internally displaced persons"), 300)
            if ref:
                m["refugees"] = ref
            m["source"] = code
        w = wd.get(c["a3"], {})
        plugs = sorted({PLUG[p] for p in w.get("P2853", []) if p in PLUG})
        volts = sorted({int(float(v)) for v in w.get("P2884", []) if re.match(r"^\d+(\.\d+)?$", v) and 90 <= float(v) <= 260})
        nums = {}
        for n_, use in em.get(c["a3"], []):
            if re.match(r"^[\d\-/ ]{2,8}$", n_):
                nums.setdefault(n_, set()).add(use)
        emergency = [[n_, ", ".join(sorted(u for u in uses if u)) or "all emergencies"] for n_, uses in sorted(nums.items(), key=lambda x: (len(x[0]), x[0]))]
        prac = {"plugs": plugs, "volts": volts, "hz": 60 if c["a3"] in HZ60 else 50, "drive": (w.get("P1622") or [""])[0],
                "calling": (w.get("P474") or [""])[0], "tld": (w.get("P78") or [""])[0], "emergency": emergency[:6],
                "anthem": (w.get("P85") or [""])[0]}
        if c["a3"] == "JPN":
            prac["hz"] = "50 (east) / 60 (west)"
        if plugs or volts or emergency or prac["drive"] or prac["calling"]:
            m["practical"] = prac
        if m:
            out[c["a3"]] = m

    def prune(v):
        if isinstance(v, dict):
            v = {k: prune(x) for k, x in v.items()}
            return {k: x for k, x in v.items() if x not in ("", None, [], {}) and not (isinstance(x, list) and all(y is None for y in x))}
        if isinstance(v, list):
            return [prune(x) for x in v]
        return v
    out = prune(out)
    with open(OUT, "w") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(out)} countries, {os.path.getsize(OUT) / 1e6:.2f} MB -> {OUT}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    build(*sys.argv[1:])
