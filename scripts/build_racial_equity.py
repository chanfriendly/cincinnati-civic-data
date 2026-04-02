#!/usr/bin/env python3
"""
build_racial_equity.py — Pre-compute ACS race-disaggregated equity statistics
per Cincinnati neighborhood.

Output: public/data/neighborhood_racial_equity.json

Usage:
    python3 scripts/build_racial_equity.py

The script:
1. Fetches ACS 5-Year (2022) race-disaggregated variables for all Hamilton County tracts
2. Downloads the Cincinnati SNA GeoJSON to get neighborhood centroids
3. Maps each tract to its closest neighborhood centroid (nearest-centroid)
4. Aggregates tract-level counts to neighborhood level (population-weighted)
5. Computes derived rates (poverty rate, homeownership rate, income)
6. Writes the result to public/data/neighborhood_racial_equity.json

Census tables used:
  B03002  — Hispanic or Latino Origin by Race (population by race/ethnicity)
  B19013A — Median Household Income (White alone)
  B19013B — Median Household Income (Black or African American alone)
  B19013D — Median Household Income (Asian alone)
  B19013H — Median Household Income (White alone, not Hispanic or Latino)
  B19013I — Median Household Income (Hispanic or Latino)
  B17001A — Poverty Status by Sex by Age (White alone)
  B17001B — Poverty Status by Sex by Age (Black or African American alone)
  B17001D — Poverty Status by Sex by Age (Asian alone)
  B17001H — Poverty Status by Sex by Age (White alone, not Hispanic or Latino)
  B17001I — Poverty Status by Sex by Age (Hispanic or Latino)
  B25003A — Tenure (White alone householder)
  B25003B — Tenure (Black or African American alone householder)
  B25003D — Tenure (Asian alone householder)
  B25003H — Tenure (White alone, not Hispanic or Latino householder)
  B25003I — Tenure (Hispanic or Latino householder)

All variables are from ACS 5-Year 2022 (most recent with full tract coverage).

Notes on aggregation:
- Poverty rates and homeownership rates are computed from raw counts,
  so population-weighted aggregation is exact.
- Median household income CANNOT be aggregated by averaging medians.
  We use a population-weighted average as a neighborhood-level approximation.
  This is standard civic data practice and is disclosed in the UI.
  For precise analysis, use the individual tract-level ACS data.
- Race groups here are non-exclusive for "White alone" vs. "White non-Hispanic":
  we show White non-Hispanic (B19013H) as the primary white comparison group
  to be consistent with how the Urban League and most equity analyses frame
  the Black/White income gap in Cincinnati.
"""

import json
import math
import os
import sys
import urllib.request
import urllib.error

# ── Config ─────────────────────────────────────────────────────────────────────

CENSUS_YEAR = 2022
CENSUS_STATE = "39"       # Ohio
CENSUS_COUNTY = "061"     # Hamilton County
OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__),
    "../public/data/neighborhood_racial_equity.json"
)
SNA_GEOJSON_URL = "https://opendata.arcgis.com/datasets/572561553c9e4d618d2d7939c5261d46_0.geojson"

# All variables fit in a single Census API request (well under the 50-var limit).
VARIABLES = [
    # ── Population by race/ethnicity (B03002) ──────────────────────────────────
    "B03002_001E",  # Total population
    "B03002_003E",  # White alone, not Hispanic or Latino
    "B03002_004E",  # Black or African American alone
    "B03002_006E",  # Asian alone
    "B03002_012E",  # Hispanic or Latino (any race)

    # ── Median household income by race (B19013x) ──────────────────────────────
    # Note: Census codes -666666666 for suppressed cells (< 15 sample households).
    # We treat those as null.
    "B19013B_001E",  # Black or African American alone
    "B19013H_001E",  # White alone, not Hispanic or Latino
    "B19013D_001E",  # Asian alone
    "B19013I_001E",  # Hispanic or Latino

    # ── Poverty status by race (B17001x) ───────────────────────────────────────
    # _001E = total with poverty determined; _002E = income below poverty level
    "B17001B_001E",  # Black/AA — total with poverty status determined
    "B17001B_002E",  # Black/AA — below poverty
    "B17001H_001E",  # White non-Hispanic — total
    "B17001H_002E",  # White non-Hispanic — below poverty
    "B17001D_001E",  # Asian — total
    "B17001D_002E",  # Asian — below poverty
    "B17001I_001E",  # Hispanic/Latino — total
    "B17001I_002E",  # Hispanic/Latino — below poverty

    # ── Tenure by race (B25003x) ────────────────────────────────────────────────
    # _001E = total occupied housing units; _002E = owner-occupied
    "B25003B_001E",  # Black/AA householder — total
    "B25003B_002E",  # Black/AA householder — owner-occupied
    "B25003H_001E",  # White non-Hispanic householder — total
    "B25003H_002E",  # White non-Hispanic householder — owner-occupied
    "B25003D_001E",  # Asian householder — total
    "B25003D_002E",  # Asian householder — owner-occupied
    "B25003I_001E",  # Hispanic/Latino householder — total
    "B25003I_002E",  # Hispanic/Latino householder — owner-occupied
]

SUPPRESSED = -666666666  # Census sentinel value for suppressed/missing cells


# ── Census API ─────────────────────────────────────────────────────────────────

def fetch_census() -> list[dict]:
    vars_str = ",".join(VARIABLES) + ",NAME"
    url = (
        f"https://api.census.gov/data/{CENSUS_YEAR}/acs/acs5"
        f"?get={vars_str}"
        f"&for=tract:*"
        f"&in=state:{CENSUS_STATE}%20county:{CENSUS_COUNTY}"
    )
    print(f"Fetching Census ACS {CENSUS_YEAR} ({len(VARIABLES)} variables)...")
    print(f"  URL: {url[:100]}...")
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            raw = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        print(f"ERROR: Census API returned HTTP {e.code}.")
        if e.code == 400:
            body = e.read().decode("utf-8", errors="replace")
            print(f"  Response body: {body[:300]}")
        if e.code == 429:
            print("  Rate limited — register a free key: https://api.census.gov/data/key_signup.html")
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    header = raw[0]
    rows = [dict(zip(header, row)) for row in raw[1:]]
    print(f"  → {len(rows)} tracts returned.")
    return rows


# ── SNA GeoJSON ────────────────────────────────────────────────────────────────

def fetch_sna_geojson() -> dict:
    print("Fetching SNA GeoJSON...")
    try:
        with urllib.request.urlopen(SNA_GEOJSON_URL, timeout=30) as resp:
            geo = json.loads(resp.read())
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)
    print(f"  → {len(geo['features'])} neighborhood features.")
    return geo


# ── Geometry helpers ───────────────────────────────────────────────────────────

def strip_name(name: str) -> str:
    """Normalise a neighborhood name to a lowercase alphanumeric key."""
    return "".join(c for c in name.lower() if c.isalnum())


def polygon_centroid(coords: list) -> tuple[float, float]:
    """Compute the centroid of a polygon ring using the shoelace formula."""
    xs = [p[0] for p in coords]
    ys = [p[1] for p in coords]
    n = len(xs)
    area = sum(xs[i] * ys[(i + 1) % n] - xs[(i + 1) % n] * ys[i] for i in range(n)) / 2
    if abs(area) < 1e-10:
        return sum(xs) / n, sum(ys) / n
    cx = sum((xs[i] + xs[(i + 1) % n]) * (xs[i] * ys[(i + 1) % n] - xs[(i + 1) % n] * ys[i]) for i in range(n)) / (6 * area)
    cy = sum((ys[i] + ys[(i + 1) % n]) * (xs[i] * ys[(i + 1) % n] - xs[(i + 1) % n] * ys[i]) for i in range(n)) / (6 * area)
    return cx, cy


def feature_centroid(feature: dict) -> tuple[float, float] | None:
    geom = feature.get("geometry", {})
    if not geom:
        return None
    gtype = geom.get("type", "")
    coords = geom.get("coordinates", [])
    if gtype == "Polygon" and coords:
        return polygon_centroid(coords[0])
    if gtype == "MultiPolygon" and coords:
        # Use the largest ring by vertex count as the representative polygon
        best = max(coords, key=lambda p: len(p[0]))
        return polygon_centroid(best[0])
    return None


def haversine(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ── Tract → neighborhood mapping ──────────────────────────────────────────────

# TIGERweb ACS 2022 REST API — returns Hamilton County tracts with internal points
TIGERWEB_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2022/MapServer/6/query"
    "?where=STATE%3D%2739%27+AND+COUNTY%3D%27061%27"
    "&outFields=GEOID,INTPTLAT,INTPTLON"
    "&returnGeometry=false&f=json&resultRecordCount=500"
)

def fetch_tract_points() -> dict[str, tuple[float, float]]:
    """Fetch internal-point lat/lon for each Hamilton County tract from TIGERweb."""
    print("Fetching tract centroids from TIGERweb...")
    try:
        with urllib.request.urlopen(TIGERWEB_URL, timeout=30) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

    features = data.get("features", [])
    points: dict[str, tuple[float, float]] = {}
    for f in features:
        attrs = f.get("attributes", {})
        geoid = str(attrs.get("GEOID", ""))
        try:
            lat = float(attrs["INTPTLAT"])
            lon = float(attrs["INTPTLON"])
            points[geoid] = (lon, lat)
        except (KeyError, TypeError, ValueError):
            pass

    print(f"  → {len(points)} tract centroids loaded.")
    return points


def build_neighborhood_centroids(geojson: dict) -> list[dict]:
    centroids = []
    for feat in geojson["features"]:
        props = feat.get("properties", {})
        name = props.get("SNA_NAME") or props.get("SNANAME") or props.get("name") or ""
        c = feature_centroid(feat)
        if c and name:
            centroids.append({"name": name, "key": strip_name(name), "lon": c[0], "lat": c[1]})
    return centroids


def assign_tract_to_neighborhood(
    tract_lon: float, tract_lat: float, centroids: list[dict]
) -> dict:
    return min(centroids, key=lambda c: haversine(tract_lon, tract_lat, c["lon"], c["lat"]))


# ── Aggregation helpers ────────────────────────────────────────────────────────

def safe_int(val) -> int | None:
    try:
        v = int(val)
        return None if v == SUPPRESSED or v < 0 else v
    except (TypeError, ValueError):
        return None


def safe_income(val) -> float | None:
    """Return income as float, treating Census suppression sentinels as None."""
    try:
        v = float(val)
        return None if v <= SUPPRESSED or v < 0 else v
    except (TypeError, ValueError):
        return None


def pct(numerator: int | None, denominator: int | None) -> float | None:
    if numerator is None or denominator is None or denominator == 0:
        return None
    return round(100 * numerator / denominator, 1)


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    tracts = fetch_census()
    sna = fetch_sna_geojson()
    tract_points = fetch_tract_points()
    nb_centroids = build_neighborhood_centroids(sna)

    if not nb_centroids:
        print("ERROR: No neighborhood centroids found in SNA GeoJSON.")
        sys.exit(1)

    print(f"\nMapping {len(tracts)} tracts to {len(nb_centroids)} neighborhoods...")

    # Accumulator: one dict per neighborhood key
    # Stores population-weighted sums for income, and raw count sums for rates.
    accum: dict[str, dict] = {}

    unmatched = 0
    for tract in tracts:
        geoid = tract.get("state", "") + tract.get("county", "") + tract.get("tract", "")
        point = tract_points.get(geoid)
        if not point:
            unmatched += 1
            continue

        nb = assign_tract_to_neighborhood(point[0], point[1], nb_centroids)
        key = nb["key"]

        if key not in accum:
            accum[key] = {
                "name": nb["name"],
                "tractCount": 0,
                # Population
                "totalPop": 0,
                "popWhiteNH": 0,
                "popBlack": 0,
                "popAsian": 0,
                "popHispanic": 0,
                # Poverty counts
                "povertyTotalBlack": 0, "povertyBelowBlack": 0,
                "povertyTotalWhiteNH": 0, "povertyBelowWhiteNH": 0,
                "povertyTotalAsian": 0, "povertyBelowAsian": 0,
                "povertyTotalHispanic": 0, "povertyBelowHispanic": 0,
                # Homeownership counts
                "housingTotalBlack": 0, "housingOwnerBlack": 0,
                "housingTotalWhiteNH": 0, "housingOwnerWhiteNH": 0,
                "housingTotalAsian": 0, "housingOwnerAsian": 0,
                "housingTotalHispanic": 0, "housingOwnerHispanic": 0,
                # Income: weighted sum + weight (pop of that race group)
                "incomeWtSumBlack": 0.0, "incomeWtBlack": 0,
                "incomeWtSumWhiteNH": 0.0, "incomeWtWhiteNH": 0,
                "incomeWtSumAsian": 0.0, "incomeWtAsian": 0,
                "incomeWtSumHispanic": 0.0, "incomeWtHispanic": 0,
            }

        a = accum[key]
        a["tractCount"] += 1

        # Population
        for field, src in [
            ("totalPop", "B03002_001E"),
            ("popWhiteNH", "B03002_003E"),
            ("popBlack", "B03002_004E"),
            ("popAsian", "B03002_006E"),
            ("popHispanic", "B03002_012E"),
        ]:
            v = safe_int(tract.get(src))
            if v is not None:
                a[field] += v

        # Poverty counts
        poverty_map = [
            ("povertyTotalBlack", "B17001B_001E", "povertyBelowBlack", "B17001B_002E"),
            ("povertyTotalWhiteNH", "B17001H_001E", "povertyBelowWhiteNH", "B17001H_002E"),
            ("povertyTotalAsian", "B17001D_001E", "povertyBelowAsian", "B17001D_002E"),
            ("povertyTotalHispanic", "B17001I_001E", "povertyBelowHispanic", "B17001I_002E"),
        ]
        for total_f, total_src, below_f, below_src in poverty_map:
            t = safe_int(tract.get(total_src))
            b = safe_int(tract.get(below_src))
            if t is not None:
                a[total_f] += t
            if b is not None:
                a[below_f] += b

        # Homeownership counts
        housing_map = [
            ("housingTotalBlack", "B25003B_001E", "housingOwnerBlack", "B25003B_002E"),
            ("housingTotalWhiteNH", "B25003H_001E", "housingOwnerWhiteNH", "B25003H_002E"),
            ("housingTotalAsian", "B25003D_001E", "housingOwnerAsian", "B25003D_002E"),
            ("housingTotalHispanic", "B25003I_001E", "housingOwnerHispanic", "B25003I_002E"),
        ]
        for total_f, total_src, owner_f, owner_src in housing_map:
            t = safe_int(tract.get(total_src))
            o = safe_int(tract.get(owner_src))
            if t is not None:
                a[total_f] += t
            if o is not None:
                a[owner_f] += o

        # Income: population-weighted accumulation
        # Weight each tract's median by that tract's race-group population
        income_map = [
            ("incomeWtSumBlack", "incomeWtBlack", "B19013B_001E", "popBlack", "B03002_004E"),
            ("incomeWtSumWhiteNH", "incomeWtWhiteNH", "B19013H_001E", "popWhiteNH", "B03002_003E"),
            ("incomeWtSumAsian", "incomeWtAsian", "B19013D_001E", "popAsian", "B03002_006E"),
            ("incomeWtSumHispanic", "incomeWtHispanic", "B19013I_001E", "popHispanic", "B03002_012E"),
        ]
        for wt_sum_f, wt_f, income_src, _pop_key, pop_src in income_map:
            income = safe_income(tract.get(income_src))
            pop = safe_int(tract.get(pop_src))
            if income is not None and pop is not None and pop > 0:
                a[wt_sum_f] += income * pop
                a[wt_f] += pop

    print(f"  {unmatched} tracts skipped (no centroid match).")
    print(f"  {len(accum)} neighborhoods populated.\n")

    # Build output
    output: dict[str, dict] = {}
    for key, a in sorted(accum.items()):
        def income_or_null(wt_sum, wt):
            return round(wt_sum / wt) if wt > 0 else None

        entry = {
            "name": a["name"],
            "tractCount": a["tractCount"],
            "asOf": str(CENSUS_YEAR),
            # Population
            "totalPop": a["totalPop"] or None,
            "popWhiteNH": a["popWhiteNH"] or None,
            "popBlack": a["popBlack"] or None,
            "popAsian": a["popAsian"] or None,
            "popHispanic": a["popHispanic"] or None,
            # Median household income (population-weighted approx)
            "medIncomeBlack": income_or_null(a["incomeWtSumBlack"], a["incomeWtBlack"]),
            "medIncomeWhiteNH": income_or_null(a["incomeWtSumWhiteNH"], a["incomeWtWhiteNH"]),
            "medIncomeAsian": income_or_null(a["incomeWtSumAsian"], a["incomeWtAsian"]),
            "medIncomeHispanic": income_or_null(a["incomeWtSumHispanic"], a["incomeWtHispanic"]),
            # Poverty rates (exact from counts)
            "povertyRateBlack": pct(a["povertyBelowBlack"], a["povertyTotalBlack"]),
            "povertyRateWhiteNH": pct(a["povertyBelowWhiteNH"], a["povertyTotalWhiteNH"]),
            "povertyRateAsian": pct(a["povertyBelowAsian"], a["povertyTotalAsian"]),
            "povertyRateHispanic": pct(a["povertyBelowHispanic"], a["povertyTotalHispanic"]),
            # Homeownership rates (exact from counts)
            "homeownerRateBlack": pct(a["housingOwnerBlack"], a["housingTotalBlack"]),
            "homeownerRateWhiteNH": pct(a["housingOwnerWhiteNH"], a["housingTotalWhiteNH"]),
            "homeownerRateAsian": pct(a["housingOwnerAsian"], a["housingTotalAsian"]),
            "homeownerRateHispanic": pct(a["housingOwnerHispanic"], a["housingTotalHispanic"]),
        }
        output[key] = entry

        # Console summary for spot-checking
        if a["totalPop"] and a["totalPop"] > 2000:
            blk_inc = entry["medIncomeBlack"]
            wnh_inc = entry["medIncomeWhiteNH"]
            gap = f"  gap=${wnh_inc - blk_inc:,.0f}" if blk_inc and wnh_inc else ""
            print(
                f"  {a['name']:30s}  pop={a['totalPop']:6,}  "
                f"blk_inc=${blk_inc:,}" if blk_inc else f"  {a['name']:30s}  pop={a['totalPop']:6,}  blk_inc=N/A"
            )

    # Write output
    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print(f"\n✅ Wrote {len(output)} neighborhoods to {OUTPUT_PATH}")
    print("\nSanity check — top income gaps (White NH vs Black):")
    gaps = [
        (v["name"], v["medIncomeWhiteNH"], v["medIncomeBlack"])
        for v in output.values()
        if v["medIncomeWhiteNH"] and v["medIncomeBlack"]
    ]
    gaps.sort(key=lambda x: (x[1] or 0) - (x[2] or 0), reverse=True)
    for name, wnh, blk in gaps[:8]:
        print(f"  {name:30s}  White NH=${wnh:,}  Black=${blk:,}  gap=${wnh-blk:,}")


if __name__ == "__main__":
    main()
