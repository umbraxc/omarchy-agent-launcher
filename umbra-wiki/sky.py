"""Small offline IAU star atlas and approximate topocentric visibility."""
import json
import math
import os
import time
from functools import lru_cache

DATA = os.path.join(os.path.dirname(__file__), "ui", "sky-data.json")


@lru_cache(maxsize=1)
def catalog():
    with open(DATA, encoding="utf-8") as file:
        return json.load(file)


def altitude(ra, dec, lat, lon, when=None):
    """Geometric altitude in degrees, using the J2000 catalog coordinates."""
    when = time.time() if when is None else when
    jd = when / 86400 + 2440587.5
    lst = (280.46061837 + 360.98564736629 * (jd - 2451545.0) + lon) % 360
    ha = math.radians((lst - ra + 180) % 360 - 180)
    latitude, declination = math.radians(lat), math.radians(dec)
    sin_alt = math.sin(latitude) * math.sin(declination) + math.cos(latitude) * math.cos(declination) * math.cos(ha)
    return math.degrees(math.asin(max(-1, min(1, sin_alt))))


def overview(lat=None, lon=None, when=None):
    data = catalog()
    if lat is None or lon is None:
        return ("The user's sky location is not set, so you do not know what is above their horizon. Do not name "
                "constellations as visible tonight, and do not give directions or heights such as 'high in the east'. "
                "You may mention one or two well-known constellations as typical of the current season, clearly framed "
                "as depending on hemisphere and location. Ask for their city or latitude/longitude so the chart can show "
                "their own sky. Until then the chat chart shows a clearly labelled sample location. "
                "This offline atlas contains 88 IAU constellations and named stars, not planet ephemerides or astrology predictions.")
    names = {abbrev: name for name, abbrev, _ in data["constellations"]}
    visible = [(name, abbr, magnitude, altitude(ra, dec, lat, lon, when))
               for name, abbr, magnitude, ra, dec in data["stars"] if magnitude <= 4.5]
    visible = [star for star in visible if star[3] >= 15]
    visible.sort(key=lambda star: star[2])
    counts = {}
    for _, abbr, magnitude, height in visible:
        counts[abbr] = counts.get(abbr, 0) + max(0.2, 4.6 - magnitude)
    groups = sorted(counts, key=counts.get, reverse=True)[:7]
    bright = ", ".join(f"{name} ({names.get(abbr, abbr)}, {height:.0f}° up)" for name, abbr, _, height in visible[:8])
    constellations = ", ".join(names.get(abbr, abbr) for abbr in groups)
    return (f"Offline sky calculation for latitude {lat:.2f}°, longitude {lon:.2f}° at the current instant. "
            f"Named bright stars at least 15° above the geometric horizon: {bright or 'none in this small catalog'}. "
            f"Constellations represented by those stars include: {constellations or 'none in this small catalog'}. "
            "Visibility also depends on daylight, weather, obstructions and light pollution. "
            "These IAU star positions are a small J2000 atlas; do not assert a planet position or exact viewing conditions.")
