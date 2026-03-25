#!/usr/bin/env python3
"""
build_disability.py — Pre-compute ACS disability statistics per Cincinnati neighborhood.

Output: public/data/neighborhood_disability.json

Run this script whenever you want to refresh the disability data.
It requires no API key — the Census ACS 5-year API is publicly accessible for
Hamilton County tract queries at low request volume.

Usage:
    python3 scripts/build_disability.py

The script:
1. Fetches ACS 5-Year (2022) disability variables for all Hamilton County tracts
2. Downloads the Cincinnati SNA GeoJSON to get neighborhood centroids
3. Maps each tract to its closest neighborhood centroid
4. Aggregates tract-level counts to neighborhood level
5. Writes the result to public/data/neighborhood_disability.json

Census tables used:
  B18101 — Sex by Age by Disability Status (total with any disability)
  B18102 — Sex by Age by Hearing Difficulty
  B18103 — Sex by Age by Vision Difficulty
  B18104 — Sex by Age by Cognitive Difficulty
  B18105 — Sex by Age by Ambulatory Difficulty
  B18106 — Sex by Age by Self-Care Difficulty
  B18107 — Sex by Age by Independent Living Difficulty
  C18130 — Age by Disability Status by Poverty Status (disability + poverty crosswalk)

All variables are from ACS 5-Year 2022 (most recent with full tract coverage).
"""

import json
import math
import os
import sys
import urllib.request
import urllib.error

# ── Config ─────────────────────────────────────────────────────────────────────

CENSUS_YEAR = 2022
CENSUS_STATE = "39"      # Ohio
CENSUS_COUNTY = "061"    # Hamilton County
OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../public/data/neighborhood_disability.json")
SNA_GEOJSON_URL = "https://opendata.arcgis.com/datasets/572561553c9e4d618d2d7939c5261d46_0.geojson"

# Variables to fetch.
# B181xx tables each cover a different minimum age, which changes the cell layout.
# The Census publishes these disability types only for age ranges where assessment
# is meaningful — cognitive/ambulatory/self-care start at 5, independent living at 18.
#
# Layout per table (verified against ACS 2022 variable lists):
#
#   B18102 (Hearing)   — all ages: Under 5, 5-17, 18-34, 35-64, 65-74, 75+  (6 groups)
#     Male with:   004, 007, 010, 013, 016, 019  | Female with:  023, 026, 029, 032, 035, 038
#
#   B18103 (Vision)    — all ages: same as B18102
#     Male with:   004, 007, 010, 013, 016, 019  | Female with:  023, 026, 029, 032, 035, 038
#
#   B18104 (Cognitive) — 5+: 5-17, 18-34, 35-64, 65-74, 75+  (5 groups)
#     Male with:   004, 007, 010, 013, 016        | Female with:  020, 023, 026, 029, 032
#
#   B18105 (Ambulatory)    — 5+: same as B18104
#   B18106 (Self-care)     — 5+: same as B18104
#
#   B18107 (Independent living) — 18+: 18-34, 35-64, 65-74, 75+  (4 groups)
#     Male with:   004, 007, 010, 013              | Female with:  017, 020, 023, 026

_AGE_STRUCTURES = {
    "all_ages": (  # B18102, B18103
        [4, 7, 10, 13, 16, 19],   # male  "with difficulty" positions
        [23, 26, 29, 32, 35, 38], # female "with difficulty" positions
    ),
    "age5plus": (  # B18104, B18105, B18106
        [4, 7, 10, 13, 16],
        [20, 23, 26, 29, 32],
    ),
    "age18plus": (  # B18107
        [4, 7, 10, 13],
        [17, 20, 23, 26],
    ),
}

_TABLE_AGE_STRUCTURE = {
    "B18102": "all_ages",
    "B18103": "all_ages",
    "B18104": "age5plus",
    "B18105": "age5plus",
    "B18106": "age5plus",
    "B18107": "age18plus",
}

def _difficulty_cells(table_prefix: str) -> list[str]:
    """Return all 'with difficulty' cells for a B181xx table, using the correct age structure."""
    structure_key = _TABLE_AGE_STRUCTURE.get(table_prefix, "all_ages")
    male_positions, female_positions = _AGE_STRUCTURES[structure_key]
    return [
        f"{table_prefix}_{str(pos).zfill(3)}E"
        for pos in (male_positions + female_positions)
    ]

# Census API allows max 50 variables per request (plus geo identifiers).
# Now using correct per-table age structures, so cell counts are:
#   B18102/B18103 (all_ages):  12 cells each
#   B18104/B18105/B18106 (age5plus): 10 cells each
#   B18107 (age18plus):         8 cells
# Total: 5 + 12 + 12 + 10 + 10 + 10 + 8 = 67 vars — split across 4 batches.
VAR_BATCHES = [
    # Batch 1: population denominators + hearing (17 vars)
    [
        "B18101_001E",   # total pop (disability status denominator)
        "C18108_001E",   # total pop (any-disability denominator)
        "C18108_002E",   # with 1+ disabilities
        "C18130_002E",   # total with disability (poverty crosswalk denominator)
        "C18130_006E",   # with disability + below poverty
        *_difficulty_cells("B18102"),  # hearing — 12 cells, all ages
    ],
    # Batch 2: vision + cognitive (22 vars)
    [
        *_difficulty_cells("B18103"),  # vision — 12 cells, all ages
        *_difficulty_cells("B18104"),  # cognitive — 10 cells, age 5+
    ],
    # Batch 3: ambulatory + self-care (20 vars)
    [
        *_difficulty_cells("B18105"),  # ambulatory/mobility — 10 cells, age 5+
        *_difficulty_cells("B18106"),  # self-care — 10 cells, age 5+
    ],
    # Batch 4: independent living (8 vars)
    [
        *_difficulty_cells("B18107"),  # independent living — 8 cells, age 18+
    ],
]

# ── Census API fetch ────────────────────────────────────────────────────────────

def _fetch_census_batch(variables: list[str], batch_num: int) -> list[dict]:
    """Fetch one batch of variables for all Hamilton County tracts."""
    vars_str = ",".join(variables) + ",NAME"
    url = (
        f"https://api.census.gov/data/{CENSUS_YEAR}/acs/acs5"
        f"?get={vars_str}"
        f"&for=tract:*"
        f"&in=state:{CENSUS_STATE}%20county:{CENSUS_COUNTY}"
    )
    print(f"  Batch {batch_num} ({len(variables)} vars): {url[:90]}...")
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            raw = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"ERROR: Census API returned HTTP {e.code} on batch {batch_num}.")
        if e.code == 400:
            body = e.read().decode("utf-8", errors="replace")
            print(f"  Response body: {body[:300]}")
        if e.code == 429:
            print("  Rate limited — add a free key: https://api.census.gov/data/key_signup.html")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR fetching Census batch {batch_num}: {e}")
        sys.exit(1)

    header = raw[0]
    return [dict(zip(header, row)) for row in raw[1:]]


def fetch_census() -> list[dict]:
    """
    Fetch all Hamilton County tract records across multiple batched requests.
    Merges all batches into one record per tract, keyed by (state, county, tract).
    """
    print(f"Fetching Census ACS {CENSUS_YEAR} data in {len(VAR_BATCHES)} batches...")
    merged: dict[tuple, dict] = {}

    for i, batch in enumerate(VAR_BATCHES, start=1):
        rows = _fetch_census_batch(batch, i)
        for row in rows:
            key = (row["state"], row["county"], row["tract"])
            if key not in merged:
                merged[key] = {}
            merged[key].update(row)

    result = list(merged.values())
    print(f"  → {len(result)} tracts merged across all batches.")
    return result

# ── SNA GeoJSON fetch ───────────────────────────────────────────────────────────

def fetch_sna_geojson() -> dict:
    """Download the Cincinnati SNA (neighborhood) boundary GeoJSON."""
    print(f"Fetching SNA GeoJSON...")
    try:
        with urllib.request.urlopen(SNA_GEOJSON_URL, timeout=30) as resp:
            geo = json.loads(resp.read())
    except Exception as e:
        print(f"ERROR fetching SNA GeoJSON: {e}")
        sys.exit(1)
    print(f"  → {len(geo['features'])} neighborhood features.")
    return geo

# ── Geometry helpers ────────────────────────────────────────────────────────────

def centroid_of_polygon(coordinates: list) -> tuple[float, float]:
    """Compute the centroid of the first ring of a Polygon (or first poly of MultiPolygon)."""
    if isinstance(coordinates[0][0][0], list):
        # MultiPolygon: use first polygon's first ring
        ring = coordinates[0][0]
    else:
        ring = coordinates[0]
    lons = [pt[0] for pt in ring]
    lats = [pt[1] for pt in ring]
    return (sum(lats) / len(lats), sum(lons) / len(lons))

def haversine_miles(lat1, lon1, lat2, lon2) -> float:
    R = 3959
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

# ── Data parsing helpers ────────────────────────────────────────────────────────

def safe_int(val) -> int:
    try:
        v = int(val)
        return max(0, v)  # Census returns -666666666 for N/A
    except (TypeError, ValueError):
        return 0

def sum_cells(record: dict, cells: list[str]) -> int:
    return sum(safe_int(record.get(c, 0)) for c in cells)

def hearing_total(record: dict) -> int:
    return sum_cells(record, _difficulty_cells("B18102"))

def vision_total(record: dict) -> int:
    return sum_cells(record, _difficulty_cells("B18103"))

def cognitive_total(record: dict) -> int:
    return sum_cells(record, _difficulty_cells("B18104"))

def ambulatory_total(record: dict) -> int:
    return sum_cells(record, _difficulty_cells("B18105"))

def selfcare_total(record: dict) -> int:
    return sum_cells(record, _difficulty_cells("B18106"))

def independentliving_total(record: dict) -> int:
    return sum_cells(record, _difficulty_cells("B18107"))

# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    census_rows = fetch_census()
    geo = fetch_sna_geojson()

    # Build neighborhood centroid list from SNA GeoJSON
    neighborhoods = []
    for feat in geo["features"]:
        name = (
            feat["properties"].get("SNA_NAME") or
            feat["properties"].get("SNANAME") or
            feat["properties"].get("NAME") or
            "Unknown"
        )
        geom_type = feat["geometry"]["type"]
        coords = feat["geometry"]["coordinates"]
        lat, lon = centroid_of_polygon(coords)
        neighborhoods.append({"name": name, "lat": lat, "lon": lon})

    if not neighborhoods:
        print("ERROR: No neighborhood features found in SNA GeoJSON.")
        sys.exit(1)

    # Build tract centroid list using the TIGERweb ACS2022 REST API (layer 6 = Census Tracts).
    # Returns INTPTLAT/INTPTLON — Census "internal point" coordinates — for each tract.
    # No polygon computation needed. Hamilton County (39061) has exactly 226 tracts,
    # all returned in a single request (well within the 300-record default limit).
    tigerweb_url = (
        "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2022"
        "/MapServer/6/query"
        f"?where=STATE%3D%27{CENSUS_STATE}%27+AND+COUNTY%3D%27{CENSUS_COUNTY}%27"
        "&outFields=GEOID%2CINTPTLAT%2CINTPTLON"
        "&f=json&resultRecordCount=300"
    )
    print("Fetching Hamilton County tract centroids from TIGERweb ACS2022 (layer 6)...")
    tract_centroids = {}
    try:
        req = urllib.request.Request(tigerweb_url, headers={"User-Agent": "build_disability.py/1.0"})
        with urllib.request.urlopen(req, timeout=30) as resp:
            tw = json.loads(resp.read())
        for feat in tw.get("features", []):
            attrs = feat.get("attributes", {})
            geoid = str(attrs.get("GEOID", ""))
            try:
                lat = float(attrs["INTPTLAT"])
                lon = float(attrs["INTPTLON"])
                tract_centroids[geoid] = (lat, lon)
            except (KeyError, TypeError, ValueError):
                pass
        print(f"  → {len(tract_centroids)} Hamilton County tract centroids.")
    except Exception as e:
        print(f"  WARNING: TIGERweb fetch failed ({e}). Tracts won't be mapped to neighborhoods.")

    # Aggregate: for each tract, find closest neighborhood
    accum = {n["name"]: {
        "pop": 0, "anyDisability": 0,
        "hearing": 0, "vision": 0, "cognitive": 0,
        "ambulatory": 0, "selfCare": 0, "independentLiving": 0,
        "disabilityTotal": 0, "disabilityPoverty": 0,
    } for n in neighborhoods}

    unmatched = 0
    for row in census_rows:
        state  = row.get("state", "")
        county = row.get("county", "")
        tract  = row.get("tract", "")
        geoid  = f"{state}{county}{tract}"

        centroid = tract_centroids.get(geoid)
        if centroid is None:
            unmatched += 1
            continue

        t_lat, t_lon = centroid

        # Find closest neighborhood centroid
        closest = min(neighborhoods, key=lambda n: haversine_miles(t_lat, t_lon, n["lat"], n["lon"]))
        name = closest["name"]

        pop = safe_int(row.get("B18101_001E", 0))
        if pop <= 0:
            continue

        acc = accum[name]
        acc["pop"]               += safe_int(row.get("C18108_001E", pop))
        acc["anyDisability"]     += safe_int(row.get("C18108_002E", 0))
        acc["hearing"]           += hearing_total(row)
        acc["vision"]            += vision_total(row)
        acc["cognitive"]         += cognitive_total(row)
        acc["ambulatory"]        += ambulatory_total(row)
        acc["selfCare"]          += selfcare_total(row)
        acc["independentLiving"] += independentliving_total(row)
        acc["disabilityTotal"]   += safe_int(row.get("C18130_002E", 0))
        acc["disabilityPoverty"] += safe_int(row.get("C18130_006E", 0))

    if unmatched > 0:
        print(f"  WARNING: {unmatched} tracts had no centroid match (skipped).")

    # Build output: keyed by stripNeighborhoodName (lowercase alphanumeric) to match JS
    def strip_name(name: str) -> str:
        return "".join(c for c in name.lower() if c.isalnum())

    output = {}
    for n in neighborhoods:
        key = strip_name(n["name"])
        acc = accum[n["name"]]
        if acc["pop"] <= 0:
            continue
        output[key] = {
            "name":               n["name"],
            "pop":                acc["pop"],
            "anyDisability":      acc["anyDisability"],
            "hearing":            acc["hearing"],
            "vision":             acc["vision"],
            "cognitive":          acc["cognitive"],
            "ambulatory":         acc["ambulatory"],
            "selfCare":           acc["selfCare"],
            "independentLiving":  acc["independentLiving"],
            "disabilityTotal":    acc["disabilityTotal"],
            "disabilityPoverty":  acc["disabilityPoverty"],
        }

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\nWrote {len(output)} neighborhoods to {OUTPUT_PATH}")
    print("Done. Commit public/data/neighborhood_disability.json and redeploy.")

if __name__ == "__main__":
    main()
