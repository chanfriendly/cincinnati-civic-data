#!/usr/bin/env python3
"""
build_ejscreen.py — Pre-compute EPA AirToxScreen environmental indicators
per Cincinnati neighborhood.

Output: public/data/neighborhood_ejscreen.json

Data source:
  EPA AirToxScreen 2019 — "Cancer risk per million due to cumulative air toxics"
  Served via EPA's ArcGIS Online organization (still live as of 2026-03-28).
  This is the same underlying data that EJScreen uses for its CANCER and DSLPM
  indicators. EJScreen's REST API was taken offline in February 2025, but the
  individual AirToxScreen feature service remains accessible.

  Service URL:
  https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/
    Cancer_risk_per_million_due_to_cumulative_air_toxics/FeatureServer/0

  Confirmed fields (2026-03-28 live test):
    GEOID10       — 11-digit census tract FIPS (matches neighborhood_acs.json)
    Population    — ACS population
    TOTAL_RISK    — Cumulative air toxics cancer risk (cases per million)
    AC_DIESEL_PM  — Diesel PM ambient concentration (µg/m³)
    RESPIRATORY_HI — Respiratory hazard index (unitless)

  FIPS filter: FIPS='39061' (Hamilton County, Ohio)
  Result: 222 tracts returned in a single request (no pagination needed).

Metrics stored per neighborhood:
  ejIndex       = TOTAL_RISK (population-weighted)
                  Primary scoring metric: higher = greater air toxics burden.
                  The Neighborhood Explorer normalizes this across all
                  neighborhoods so the dimension score reflects Cincinnati-
                  relative burden, not the absolute national risk level.
  dieselPm      = AC_DIESEL_PM (population-weighted)
  respiratoryHI = RESPIRATORY_HI (population-weighted)

Usage:
  python3 scripts/build_ejscreen.py
"""

import json
import math
import os
import sys
import urllib.request
import urllib.error
import urllib.parse

# ── Config ────────────────────────────────────────────────────────────────────

OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__),
    "../public/data/neighborhood_ejscreen.json"
)
ACS_PATH = os.path.join(
    os.path.dirname(__file__),
    "../public/data/neighborhood_acs.json"
)

# EPA AirToxScreen 2019 feature service — confirmed live 2026-03-28
AIRTOX_BASE = (
    "https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services"
    "/Cancer_risk_per_million_due_to_cumulative_air_toxics/FeatureServer/0/query"
)
HAMILTON_FIPS = "39061"

# SNA GeoJSON for neighborhood centroids (same URL used by build_parks.py)
SNA_GEOJSON_URL = (
    "https://opendata.arcgis.com/datasets/"
    "572561553c9e4d618d2d7939c5261d46_0.geojson"
)

TODAY = __import__("datetime").date.today().isoformat()


# ── Utilities ─────────────────────────────────────────────────────────────────

def strip_name(s: str) -> str:
    """Normalize to lowercase alphanumeric — matches stripNeighborhoodName() in api.ts."""
    return "".join(c for c in s.lower() if c.isalnum())


def distance_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in miles."""
    R = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))


def fetch_json(url: str, timeout: int = 30) -> dict:
    req = urllib.request.Request(
        url, headers={"User-Agent": "CincinnatiCivicData/1.0"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


# ── Step 1: Load tract centroids from neighborhood_acs.json ──────────────────

def load_tract_centroids() -> dict[str, tuple[float, float, int]]:
    """Returns {geoid: (lat, lon, pop)} for Hamilton County tracts."""
    print("[Step 1] Loading tract centroids from neighborhood_acs.json…")
    with open(ACS_PATH) as f:
        tracts = json.load(f)
    centroids: dict[str, tuple[float, float, int]] = {}
    for t in tracts:
        geoid = str(t["geoid"])
        if geoid.startswith(HAMILTON_FIPS):
            centroids[geoid] = (t["lat"], t["lon"], t.get("pop", 0))
    print(f"  Found {len(centroids)} Hamilton County tracts in ACS file")
    return centroids


# ── Step 2: Load SNA neighborhood centroids ───────────────────────────────────

def load_neigh_centroids() -> dict[str, tuple[float, float, str]]:
    """Returns {normalized_key: (lat, lon, display_name)} for all SNA neighborhoods."""
    print("[Step 2] Loading SNA neighborhood boundaries from CAGIS…")
    geojson = fetch_json(SNA_GEOJSON_URL, timeout=20)
    centroids: dict[str, tuple[float, float, str]] = {}
    for feat in geojson["features"]:
        name = str(
            feat["properties"].get("NEIGH")
            or feat["properties"].get("SNA_NAME")
            or ""
        )
        if not name:
            continue
        coords = feat["geometry"]["coordinates"]
        geom_type = feat["geometry"]["type"]
        rings = coords if geom_type == "Polygon" else [p[0] for p in coords]
        all_pts = [pt for ring in rings for pt in ring]
        lat = sum(p[1] for p in all_pts) / len(all_pts)
        lon = sum(p[0] for p in all_pts) / len(all_pts)
        centroids[strip_name(name)] = (lat, lon, name)
    print(f"  Loaded {len(centroids)} SNA neighborhoods")
    return centroids


# ── Step 3: Fetch AirToxScreen data for Hamilton County ──────────────────────

def fetch_airtoxscreen() -> list[dict]:
    """Returns all Hamilton County tracts from the EPA AirToxScreen service."""
    print("[Step 3] Fetching EPA AirToxScreen 2019 data for Hamilton County…")
    params = urllib.parse.urlencode({
        "where": f"FIPS='{HAMILTON_FIPS}'",
        "outFields": "GEOID10,Population,TOTAL_RISK,AC_DIESEL_PM,RESPIRATORY_HI",
        "returnGeometry": "false",
        "f": "json",
        "resultRecordCount": 2000,
    })
    url = f"{AIRTOX_BASE}?{params}"
    data = fetch_json(url, timeout=30)

    if "error" in data:
        print(f"  ERROR: {data['error']}")
        sys.exit(1)

    features = data.get("features", [])
    if data.get("exceededTransferLimit"):
        print("  WARNING: Transfer limit exceeded — results may be incomplete!")

    print(f"  Retrieved {len(features)} tracts")
    # Print sample
    for f in features[:3]:
        a = f["attributes"]
        print(f"    {a['GEOID10']}  risk={a['TOTAL_RISK']:.1f}  "
              f"diesel={a['AC_DIESEL_PM']:.3f}  resp={a['RESPIRATORY_HI']:.3f}")

    return [f["attributes"] for f in features]


# ── Step 4: Map tracts → neighborhoods ───────────────────────────────────────

def map_to_neighborhoods(
    tracts: list[dict],
    tract_centroids: dict[str, tuple[float, float, int]],
    neigh_centroids: dict[str, tuple[float, float, str]],
) -> dict[str, list[dict]]:
    """Map each tract to its nearest neighborhood centroid (within 5 miles)."""
    print("[Step 4] Mapping tracts to neighborhoods…")
    neigh_list = list(neigh_centroids.items())

    result: dict[str, list[dict]] = {}
    unmatched = 0

    for tract in tracts:
        geoid = str(tract.get("GEOID10", "")).zfill(11)
        coords = tract_centroids.get(geoid)
        if not coords:
            unmatched += 1
            continue
        tlat, tlon, _ = coords

        closest, min_dist = "", math.inf
        for nkey, (nlat, nlon, _name) in neigh_list:
            d = distance_miles(tlat, tlon, nlat, nlon)
            if d < min_dist:
                min_dist = d
                closest = nkey
        if min_dist <= 5 and closest:
            result.setdefault(closest, []).append({**tract, "_lat": tlat, "_lon": tlon})
        else:
            unmatched += 1

    assigned = sum(len(v) for v in result.values())
    print(f"  Assigned {assigned} tracts to {len(result)} neighborhoods "
          f"({unmatched} unmatched — outer suburbs)")
    return result


# ── Step 5: Aggregate per neighborhood ───────────────────────────────────────

def aggregate(
    neigh_tract_map: dict[str, list[dict]],
    neigh_centroids: dict[str, tuple[float, float, str]],
) -> dict[str, dict]:
    """Population-weighted average of air toxics indicators per neighborhood."""
    print("[Step 5] Aggregating per neighborhood…")
    result: dict[str, dict] = {}

    for nkey, tracts in neigh_tract_map.items():
        name = neigh_centroids.get(nkey, (0, 0, nkey))[2]
        total_pop = sum(t.get("Population", 0) for t in tracts)
        weight = total_pop if total_pop > 0 else len(tracts)

        def wavg(field: str) -> float | None:
            ws, wt = 0.0, 0.0
            for t in tracts:
                v = t.get(field)
                if v is not None:
                    w = t.get("Population", 1) or 1
                    ws += v * w
                    wt += w
            return round(ws / wt, 4) if wt > 0 else None

        ej_index   = wavg("TOTAL_RISK")
        diesel_pm  = wavg("AC_DIESEL_PM")
        resp_hi    = wavg("RESPIRATORY_HI")

        result[nkey] = {
            "name":          name,
            # Primary scoring metric (maps to ejPollutionIndex in Explorer)
            "ejIndex":       ej_index,     # cumulative air toxics cancer risk (per million)
            # Supporting indicators (available for detail display)
            "dieselPm":      diesel_pm,    # diesel PM ambient concentration (µg/m³)
            "respiratoryHI": resp_hi,      # respiratory hazard index
            # Legacy percentile fields — null (not available from AirToxScreen)
            "cancerPctile":     None,
            "dieselPctile":     None,
            "trafficPctile":    None,
            "superfundPctile":  None,
            "wastePctile":      None,
            "wastewaterPctile": None,
            "pm25Pctile":       None,
            "tractCount":  len(tracts),
            "pop":         weight,
            "source":      "airtoxscreen_2019",
            "asOf":        TODAY,
        }

    # Print summary sorted by ejIndex (highest burden first)
    ranked = sorted(
        [(k, v) for k, v in result.items() if v["ejIndex"] is not None],
        key=lambda x: x[1]["ejIndex"],
        reverse=True,
    )
    print()
    print("  Top 15 neighborhoods by air toxics cancer risk:")
    for nkey, data in ranked[:15]:
        print(f"    {data['name']:30s} "
              f"riskPerMillion={data['ejIndex']:5.1f}  "
              f"diesel={data['dieselPm'] or 0:.3f}  "
              f"respHI={data['respiratoryHI'] or 0:.3f}")

    print()
    ej_vals = [v["ejIndex"] for v in result.values() if v["ejIndex"] is not None]
    if ej_vals:
        print(f"  Range: {min(ej_vals):.1f} – {max(ej_vals):.1f} cases/million "
              f"(avg {sum(ej_vals)/len(ej_vals):.1f})")

    return result


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 70)
    print("build_ejscreen.py — EPA AirToxScreen 2019 Environmental Data")
    print("=" * 70)
    print()

    tract_centroids  = load_tract_centroids()
    neigh_centroids  = load_neigh_centroids()
    tracts           = fetch_airtoxscreen()
    neigh_tract_map  = map_to_neighborhoods(tracts, tract_centroids, neigh_centroids)
    output           = aggregate(neigh_tract_map, neigh_centroids)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print()
    print(f"✅ Wrote {len(output)} neighborhoods to")
    print(f"   {OUTPUT_PATH}")
    print()
    print("Next steps:")
    print("  1. Verify that high-burden neighborhoods (Camp Washington, Lower")
    print("     Price Hill, Queensgate) rank near the top — they sit adjacent")
    print("     to I-75, rail yards, and former industrial sites.")
    print("  2. Commit public/data/neighborhood_ejscreen.json")
    print("  3. Push to Vercel")


if __name__ == "__main__":
    main()
