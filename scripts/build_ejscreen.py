#!/usr/bin/env python3
"""
build_ejscreen.py — Pre-compute EPA EJScreen environmental justice indicators
per Cincinnati neighborhood.

Output: public/data/neighborhood_ejscreen.json

Background:
  EPA EJScreen (ejscreen.epa.gov) was taken offline in February 2025.
  The 2023 dataset (v2.3) is preserved by Public Environmental Data Partners
  and on Zenodo. This script downloads the tract-level CSV, filters to
  Hamilton County (FIPS 39061), maps tracts to Cincinnati SNA neighborhoods
  using the same centroid-matching strategy as the ACS data, and writes a
  static JSON used by the Neighborhood Explorer.

Usage:
    python3 scripts/build_ejscreen.py

The script tries download sources in order:
  1. EPA FTP (may still be accessible)
  2. PEDP preservation mirror
  3. Zenodo archive
  4. Local file at scripts/data/ejscreen_tracts.csv (manual fallback)

Manual download (if automated sources fail):
  Go to https://screening-tools.com/environmental-justice-screening-tool-1
  or https://zenodo.org/records/14767363
  Download the tract-level CSV for EJSCREEN 2023, save as:
  scripts/data/ejscreen_tracts.csv

Key EJScreen 2.3 fields used:
  ID       — 11-digit census tract GEOID (matches neighborhood_acs.json)
  ACSTOTPOP — ACS total population
  CANCER   — Air toxics cancer risk (lifetime per million, inhalation)
  DSLPM    — Diesel particulate matter (µg/m³)
  PTRAF    — Traffic proximity (AADT within 500m / distance)
  PNPL     — Superfund site proximity (NPL sites within 5km, weighted)
  PTSDF    — Hazardous waste proximity (TSDFs within 5km, weighted)
  PWDIS    — Wastewater discharge indicator
  PM25     — PM 2.5 annual average (µg/m³)
  P_CANCER, P_DSLPM, P_PTRAF, P_PNPL, P_PTSDF, P_PWDIS, P_PM25
           — National percentile ranks (0–100, higher = more exposed)

Composite EJ Pollution Index:
  Weighted average of 5 national percentiles:
    Air toxics cancer risk  (30%)
    Diesel PM               (20%)
    Traffic proximity       (20%)
    Superfund proximity     (15%)
    Hazardous waste prox.   (15%)
  Higher index = higher pollution burden = lower score in Explorer.
"""

import csv
import io
import json
import math
import os
import sys
import urllib.request
import urllib.error
import zipfile

# ── Config ────────────────────────────────────────────────────────────────────

OUTPUT_PATH   = os.path.join(os.path.dirname(__file__), "../public/data/neighborhood_ejscreen.json")
ACS_PATH      = os.path.join(os.path.dirname(__file__), "../public/data/neighborhood_acs.json")
LOCAL_CSV     = os.path.join(os.path.dirname(__file__), "data/ejscreen_tracts.csv")

HAMILTON_FIPS_PREFIX = "39061"  # State 39 (Ohio) + County 061 (Hamilton)

# Download sources in order of preference
DOWNLOAD_SOURCES = [
    # EPA FTP (original — may still work or may 403)
    "https://gaftp.epa.gov/EJScreen/2023/EJSCREEN_2023_Tracts_with_AS_CNMI_GU_VI.csv.zip",
    # PEDP preservation (non-ZIP version if available)
    "https://screening-tools.com/data/EJSCREEN_2023_Tracts.csv.zip",
]

# EJScreen column names — with fallbacks for version differences
# Format: (preferred_name, *fallbacks)
COL_ALIASES = {
    "id":       ["ID", "GEOID", "FIPS"],
    "pop":      ["ACSTOTPOP", "TOTPOP", "TOTPOP17"],
    "cancer":   ["CANCER"],
    "dslpm":    ["DSLPM"],
    "ptraf":    ["PTRAF"],
    "pnpl":     ["PNPL"],
    "ptsdf":    ["PTSDF"],
    "pwdis":    ["PWDIS"],
    "pm25":     ["PM25"],
    "p_cancer": ["P_CANCER", "B_CANCER"],
    "p_dslpm":  ["P_DSLPM",  "B_DSLPM"],
    "p_ptraf":  ["P_PTRAF",  "B_PTRAF"],
    "p_pnpl":   ["P_PNPL",   "B_PNPL"],
    "p_ptsdf":  ["P_PTSDF",  "B_PTSDF"],
    "p_pwdis":  ["P_PWDIS",  "B_PWDIS"],
    "p_pm25":   ["P_PM25",   "B_PM25"],
}

# Composite EJ index weights (must sum to 1.0)
EJ_WEIGHTS = {
    "p_cancer": 0.30,
    "p_dslpm":  0.20,
    "p_ptraf":  0.20,
    "p_pnpl":   0.15,
    "p_ptsdf":  0.15,
}

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
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def resolve_col(headers: list[str], key: str) -> str | None:
    """Find the actual column name in the CSV for a logical field."""
    for alias in COL_ALIASES[key]:
        if alias in headers:
            return alias
    return None


def safe_float(val: str) -> float | None:
    try:
        v = float(val)
        return v if math.isfinite(v) and v >= 0 else None
    except (ValueError, TypeError):
        return None


# ── Step 1: Load the ACS file to get tract centroids ─────────────────────────

def load_tract_centroids() -> dict[str, tuple[float, float, int]]:
    """Returns {geoid: (lat, lon, pop)} for all Hamilton County tracts."""
    print("[Step 1] Loading tract centroids from neighborhood_acs.json…")
    with open(ACS_PATH) as f:
        tracts = json.load(f)
    centroids: dict[str, tuple[float, float, int]] = {}
    for t in tracts:
        geoid = str(t["geoid"])
        if geoid.startswith(HAMILTON_FIPS_PREFIX):
            centroids[geoid] = (t["lat"], t["lon"], t.get("pop", 0))
    print(f"  Found {len(centroids)} Hamilton County tracts in ACS file")
    return centroids


# ── Step 2: Load SNA neighborhood centroids ───────────────────────────────────

def load_neigh_centroids() -> dict[str, tuple[float, float, str]]:
    """
    Returns {normalized_key: (lat, lon, display_name)} for all SNA neighborhoods.
    Fetches the SNA GeoJSON from CAGIS (same URL used by build_parks.py).
    Falls back to deriving centroids from ACS tract data if CAGIS is unreachable.
    """
    SNA_URL = "https://opendata.arcgis.com/datasets/572561553c9e4d618d2d7939c5261d46_0.geojson"
    print("[Step 2] Loading SNA neighborhood boundaries…")
    try:
        req = urllib.request.Request(SNA_URL, headers={"User-Agent": "CincinnatiCivicData/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            geojson = json.loads(resp.read())
        centroids: dict[str, tuple[float, float, str]] = {}
        for feat in geojson["features"]:
            name = str(feat["properties"].get("NEIGH") or feat["properties"].get("SNA_NAME") or "")
            if not name:
                continue
            coords = feat["geometry"]["coordinates"]
            geom_type = feat["geometry"]["type"]
            if geom_type == "Polygon":
                rings = coords
            elif geom_type == "MultiPolygon":
                rings = [p[0] for p in coords]
            else:
                continue
            all_pts = [pt for ring in rings for pt in ring]
            lat = sum(p[1] for p in all_pts) / len(all_pts)
            lon = sum(p[0] for p in all_pts) / len(all_pts)
            centroids[strip_name(name)] = (lat, lon, name)
        print(f"  Loaded {len(centroids)} SNA neighborhoods from CAGIS")
        return centroids
    except Exception as e:
        print(f"  CAGIS fetch failed ({e}). Deriving centroids from ACS tracts.")
        return {}


# ── Step 3: Download or locate EJScreen CSV ───────────────────────────────────

def load_ejscreen_csv() -> tuple[list[str], list[dict]]:
    """Returns (headers, rows) for all EJScreen tract records."""

    # Check for local manual download first
    if os.path.exists(LOCAL_CSV):
        print(f"[Step 3] Using local CSV: {LOCAL_CSV}")
        with open(LOCAL_CSV, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            headers = reader.fieldnames or []
            rows = list(reader)
        print(f"  Loaded {len(rows):,} rows from local file")
        return list(headers), rows

    # Try remote download
    os.makedirs(os.path.join(os.path.dirname(__file__), "data"), exist_ok=True)
    for url in DOWNLOAD_SOURCES:
        print(f"[Step 3] Trying: {url}")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "CincinnatiCivicData/1.0"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                raw = resp.read()
            if url.endswith(".zip"):
                with zipfile.ZipFile(io.BytesIO(raw)) as zf:
                    csv_names = [n for n in zf.namelist() if n.endswith(".csv")]
                    if not csv_names:
                        print("  No CSV found in ZIP")
                        continue
                    csv_bytes = zf.read(csv_names[0])
                text = csv_bytes.decode("utf-8-sig")
            else:
                text = raw.decode("utf-8-sig")

            # Cache locally for future runs
            with open(LOCAL_CSV, "w") as out:
                out.write(text)
            print(f"  Downloaded and cached to {LOCAL_CSV}")

            reader = csv.DictReader(io.StringIO(text))
            headers = reader.fieldnames or []
            rows = list(reader)
            print(f"  Loaded {len(rows):,} rows")
            return list(headers), rows

        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code}: {e.reason}")
        except Exception as e:
            print(f"  Failed: {e}")

    # All sources failed
    print()
    print("=" * 70)
    print("MANUAL DOWNLOAD REQUIRED")
    print("=" * 70)
    print()
    print("Automated download failed. To get the EJScreen 2023 data:")
    print()
    print("Option A — PEDP (Public Environmental Data Partners):")
    print("  https://screening-tools.com/epa-ejscreen")
    print("  Download the 2023 tract-level CSV")
    print()
    print("Option B — Zenodo archive:")
    print("  https://zenodo.org/records/14767363")
    print("  Download 'EJSCREEN_2023_Tracts_with_AS_CNMI_GU_VI.csv.zip'")
    print()
    print(f"Save the CSV as: {LOCAL_CSV}")
    print("Then re-run this script.")
    print()
    sys.exit(1)


# ── Step 4: Resolve column names from the actual CSV header ──────────────────

def build_col_map(headers: list[str]) -> dict[str, str | None]:
    print("[Step 4] Resolving column names…")
    col_map: dict[str, str | None] = {}
    for key in COL_ALIASES:
        col_map[key] = resolve_col(headers, key)
        status = col_map[key] or "NOT FOUND"
        print(f"  {key:12s} → {status}")
    missing_required = [k for k in ["id", "pop", "p_cancer", "p_dslpm", "p_ptraf"] if not col_map[k]]
    if missing_required:
        print()
        print(f"ERROR: Required columns not found: {missing_required}")
        print("Available headers (first 40):")
        for h in headers[:40]:
            print(f"  {h}")
        sys.exit(1)
    return col_map


# ── Step 5: Filter and parse Hamilton County rows ────────────────────────────

def parse_hamilton_rows(rows: list[dict], col_map: dict) -> list[dict]:
    """Returns parsed rows for Hamilton County tracts only."""
    print("[Step 5] Filtering to Hamilton County (FIPS 39061)…")
    id_col = col_map["id"]
    hamilton = []
    for row in rows:
        geoid = str(row.get(id_col, "")).strip().zfill(11)
        if not geoid.startswith(HAMILTON_FIPS_PREFIX):
            continue
        parsed: dict = {"geoid": geoid, "pop": 0}
        if pop_col := col_map["pop"]:
            parsed["pop"] = int(safe_float(row.get(pop_col, "0")) or 0)
        for key in ["cancer", "dslpm", "ptraf", "pnpl", "ptsdf", "pwdis", "pm25",
                    "p_cancer", "p_dslpm", "p_ptraf", "p_pnpl", "p_ptsdf", "p_pwdis", "p_pm25"]:
            if c := col_map.get(key):
                parsed[key] = safe_float(row.get(c, ""))
        hamilton.append(parsed)
    print(f"  Found {len(hamilton)} Hamilton County tracts")
    return hamilton


# ── Step 6: Map tracts → neighborhoods ───────────────────────────────────────

def map_to_neighborhoods(
    tracts: list[dict],
    tract_centroids: dict[str, tuple[float, float, int]],
    neigh_centroids: dict[str, tuple[float, float, str]],
) -> dict[str, list[dict]]:
    """Returns {neigh_key: [tract_rows]}. Uses nearest-centroid, max 5 miles."""

    # If we couldn't load SNA GeoJSON, fall back to tract lat/lon from ACS
    # and build approximate neighborhood groupings by choosing closest known
    # neighborhood centroid from the ACS tract coordinates.
    print("[Step 6] Mapping tracts to neighborhoods…")

    # Build a fast lookup: geoid → (lat, lon)
    coord_lookup: dict[str, tuple[float, float]] = {
        g: (lat, lon) for g, (lat, lon, _pop) in tract_centroids.items()
    }

    # Build neighborhood centroid list — prefer SNA GeoJSON, fall back to
    # inferring from ACS tract data if SNA load failed.
    if neigh_centroids:
        neigh_list = list(neigh_centroids.items())  # [(key, (lat, lon, name))]
    else:
        print("  No SNA centroids — cannot map tracts to neighborhoods")
        return {}

    tract_to_neigh: dict[str, str] = {}
    for tract in tracts:
        geoid = tract["geoid"]
        coords = coord_lookup.get(geoid)
        if not coords:
            continue  # tract not in our ACS file; skip
        tlat, tlon = coords
        closest, min_dist = "", math.inf
        for nkey, (nlat, nlon, _name) in neigh_list:
            d = distance_miles(tlat, tlon, nlat, nlon)
            if d < min_dist:
                min_dist = d
                closest = nkey
        if min_dist <= 5 and closest:
            tract_to_neigh[geoid] = closest

    result: dict[str, list[dict]] = {}
    for tract in tracts:
        nkey = tract_to_neigh.get(tract["geoid"])
        if nkey:
            result.setdefault(nkey, []).append(tract)

    assigned = sum(len(v) for v in result.values())
    print(f"  Assigned {assigned}/{len(tracts)} tracts to {len(result)} neighborhoods")
    return result


# ── Step 7: Aggregate per neighborhood ───────────────────────────────────────

def aggregate(
    neigh_tract_map: dict[str, list[dict]],
    neigh_centroids: dict[str, tuple[float, float, str]],
) -> dict[str, dict]:
    """Population-weighted average of EJ percentile indicators per neighborhood."""
    print("[Step 7] Aggregating…")
    result: dict[str, dict] = {}

    for nkey, tracts in neigh_tract_map.items():
        name = neigh_centroids[nkey][2] if nkey in neigh_centroids else nkey
        total_pop = sum(t["pop"] for t in tracts)
        if total_pop == 0:
            total_pop = len(tracts)  # fallback: equal weight

        def wavg(field: str) -> float | None:
            weighted_sum, weight = 0.0, 0.0
            for t in tracts:
                v = t.get(field)
                if v is not None:
                    w = t["pop"] if t["pop"] > 0 else 1
                    weighted_sum += v * w
                    weight += w
            return round(weighted_sum / weight, 2) if weight > 0 else None

        cancer   = wavg("p_cancer")
        dslpm    = wavg("p_dslpm")
        ptraf    = wavg("p_ptraf")
        pnpl     = wavg("p_pnpl")
        ptsdf    = wavg("p_ptsdf")
        pwdis    = wavg("p_pwdis")
        pm25     = wavg("p_pm25")

        # Composite EJ index: weighted average of 5 key percentiles
        # Using only indicators with available data
        ej_components: list[tuple[float | None, float]] = [
            (cancer, EJ_WEIGHTS["p_cancer"]),
            (dslpm,  EJ_WEIGHTS["p_dslpm"]),
            (ptraf,  EJ_WEIGHTS["p_ptraf"]),
            (pnpl,   EJ_WEIGHTS["p_pnpl"]),
            (ptsdf,  EJ_WEIGHTS["p_ptsdf"]),
        ]
        valid = [(v, w) for v, w in ej_components if v is not None]
        if valid:
            total_w = sum(w for _, w in valid)
            ej_index = round(sum(v * w for v, w in valid) / total_w, 1)
        else:
            ej_index = None

        result[nkey] = {
            "name":          name,
            "ejIndex":       ej_index,     # composite pollution burden (0–100, higher = worse)
            "cancerPctile":  cancer,       # air toxics cancer risk national %ile
            "dieselPctile":  dslpm,        # diesel PM national %ile
            "trafficPctile": ptraf,        # traffic proximity national %ile
            "superfundPctile": pnpl,       # Superfund proximity national %ile
            "wastePctile":   ptsdf,        # hazardous waste proximity national %ile
            "wastewaterPctile": pwdis,     # wastewater discharge national %ile
            "pm25Pctile":    pm25,         # PM2.5 national %ile
            "tractCount":    len(tracts),
            "pop":           total_pop,
            "asOf":          TODAY,
        }

    # Print summary sorted by EJ index (worst first)
    ranked = sorted(
        [(k, v) for k, v in result.items() if v["ejIndex"] is not None],
        key=lambda x: x[1]["ejIndex"],
        reverse=True
    )
    print()
    print("  Top 15 neighborhoods by EJ pollution burden:")
    for nkey, data in ranked[:15]:
        ej = data["ejIndex"]
        name = data["name"]
        print(f"    {name:30s} ejIndex={ej:5.1f}  cancer%ile={data['cancerPctile'] or 0:5.1f}  diesel%ile={data['dieselPctile'] or 0:5.1f}")

    return result


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 70)
    print("build_ejscreen.py — EJScreen Environmental Justice Data")
    print("=" * 70)
    print()

    tract_centroids  = load_tract_centroids()
    neigh_centroids  = load_neigh_centroids()
    headers, rows    = load_ejscreen_csv()
    col_map          = build_col_map(headers)
    hamilton_tracts  = parse_hamilton_rows(rows, col_map)
    neigh_tract_map  = map_to_neighborhoods(hamilton_tracts, tract_centroids, neigh_centroids)
    output           = aggregate(neigh_tract_map, neigh_centroids)

    os.makedirs(os.path.dirname(OUTPUT_PATH), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    print()
    print(f"✅ Wrote {len(output)} neighborhoods to {OUTPUT_PATH}")
    print()
    print("EJ Index summary:")
    ej_vals = [v["ejIndex"] for v in output.values() if v["ejIndex"] is not None]
    if ej_vals:
        print(f"  Min: {min(ej_vals):.1f}  Max: {max(ej_vals):.1f}  Avg: {sum(ej_vals)/len(ej_vals):.1f}")
    print()
    print("Next steps:")
    print("  1. Review Top 15 neighborhoods above for plausibility")
    print("  2. Commit public/data/neighborhood_ejscreen.json")
    print("  3. Push to Vercel")


if __name__ == "__main__":
    main()
