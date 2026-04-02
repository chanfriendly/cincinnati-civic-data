#!/usr/bin/env python3
"""
build_hmda.py — Pre-compute HMDA mortgage lending outcomes by race per neighborhood.

Output: public/data/neighborhood_hmda.json

Usage:
    python3 scripts/build_hmda.py

CFPB HMDA Data Browser API — hard-won notes:
  - Akamai CDN blocks Python urllib by TLS fingerprint. All calls use curl.
  - Max 2 "filter criteria" per aggregations call (counties + years are free;
    races, ethnicities, actions_taken, loan_purposes etc. each count as one).
    Exceeding 2 → HTTP 400 "provide-two-or-less-filter-criteria".
  - variable=census_tract on the aggregations endpoint is silently ignored —
    it always returns one county-level aggregate row regardless. Confirmed
    after extensive debugging.
  - For tract-level data, use the /view/csv endpoint instead. It returns raw
    LAR records (one row per application) with a census_tract column. We
    aggregate these in Python. Same 2-filter limit applies.
  - loan_purposes=1 (home purchase only) cannot be combined with both races
    and actions_taken without exceeding the 2-criterion limit. Omitted — data
    includes all loan types (purchase + refi + home improvement). Disclosed
    in the UI methodology note.

County-level strategy:
  Two /aggregations calls per group: actions_taken=1 (originated) and
  actions_taken=3 (denied), filtered by races=<race>. 2 criteria each.

Tract-level strategy:
  Two /csv calls per group with same filter params. Each CSV has one row per
  loan application with a census_tract field. Aggregate in Python by tract.
  ~10,000–20,000 rows per call for White; smaller for other groups. ~30–60s.

Action taken codes:
    1 = Loan originated   → "approved"
    3 = Application denied → "denied"
"""

import csv
import io
import json
import math
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

# ── Config ─────────────────────────────────────────────────────────────────────

HMDA_YEAR = "2022"
COUNTY_FIPS = "39061"       # Hamilton County, Ohio
STATE_FIPS = "39"           # Ohio
OUTPUT_PATH = os.path.join(
    os.path.dirname(__file__),
    "../public/data/neighborhood_hmda.json"
)
SNA_GEOJSON_URL = "https://opendata.arcgis.com/datasets/572561553c9e4d618d2d7939c5261d46_0.geojson"
TIGERWEB_URL = (
    "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/tigerWMS_ACS2022/MapServer/6/query"
    "?where=STATE%3D%2739%27+AND+COUNTY%3D%27061%27"
    "&outFields=GEOID,INTPTLAT,INTPTLON"
    "&returnGeometry=false&f=json&resultRecordCount=500"
)

HMDA_AGG_URL  = "https://ffiec.cfpb.gov/v2/data-browser-api/view/aggregations"
HMDA_CSV_URL  = "https://ffiec.cfpb.gov/v2/data-browser-api/view/csv"

RACE_MAP = {
    "white":   "White",
    "black":   "Black or African American",
    "asian":   "Asian",
}
HISPANIC_ETHNICITY = "Hispanic or Latino"

# ── Query string builder (commas unencoded) ────────────────────────────────────

def build_qs(params: dict) -> str:
    """
    Build a query string keeping commas literal (not %2C).
    The CFPB API treats %2C as a single invalid token.
    """
    parts = []
    for k, v in params.items():
        parts.append(
            urllib.parse.quote(str(k), safe="") + "=" +
            urllib.parse.quote(str(v), safe=",")
        )
    return "&".join(parts)


# ── curl helpers ───────────────────────────────────────────────────────────────

def curl_json(params: dict, label: str = "") -> list[dict]:
    """
    Call the HMDA aggregations endpoint via curl → return aggregation rows.
    """
    qs = build_qs(params)
    url = f"{HMDA_AGG_URL}?{qs}"
    desc = label or params.get("races") or params.get("ethnicities") or "?"
    print(f"  → {desc}: ...{qs[-80:]}")
    try:
        result = subprocess.run(
            ["curl", "-s", "-H", "Accept: application/json", url],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            print(f"     ✗ curl error: {result.stderr[:200]}")
            return []
        data = json.loads(result.stdout)
        aggs = data.get("aggregations", [])
        print(f"     ✓ {len(aggs)} rows, count={sum(int(r.get('count',0)) for r in aggs):,}")
        return aggs
    except (json.JSONDecodeError, ValueError):
        print(f"     ✗ JSON parse error: {result.stdout[:200]}")
        return []
    except FileNotFoundError:
        print("     ✗ curl not found — install curl and retry")
        sys.exit(1)
    except Exception as e:
        print(f"     ✗ ERROR: {e}")
        return []


def curl_csv_tracts(params: dict, label: str = "") -> dict[str, int]:
    """
    Call the HMDA CSV endpoint via curl.
    Returns {census_tract_geoid: record_count} — one count per tract.
    Each CSV row is one loan application; we tally by census_tract.
    """
    qs = build_qs(params)
    url = f"{HMDA_CSV_URL}?{qs}"
    desc = label or params.get("races") or params.get("ethnicities") or "?"
    print(f"  → {desc} (CSV): ...{qs[-80:]}")
    try:
        result = subprocess.run(
            ["curl", "-s", url],
            capture_output=True, text=True, timeout=180
        )
        if result.returncode != 0:
            print(f"     ✗ curl error: {result.stderr[:200]}")
            return {}

        content = result.stdout
        if not content.strip():
            print("     ✗ empty response")
            return {}

        # Check for JSON error response instead of CSV
        if content.strip().startswith("{"):
            try:
                err = json.loads(content)
                print(f"     ✗ API error: {err.get('message', content[:200])}")
            except Exception:
                print(f"     ✗ unexpected response: {content[:200]}")
            return {}

        reader = csv.DictReader(io.StringIO(content))
        tract_counts: dict[str, int] = {}
        skipped = 0
        for row in reader:
            # The census_tract field in HMDA LAR is the full 11-digit GEOID
            # Some records have "NA" or "Exempt" (exempted reporters)
            tract = row.get("census_tract", "").strip()
            if not tract or tract in ("NA", "Exempt", ""):
                skipped += 1
                continue
            geoid = normalize_geoid(tract)
            tract_counts[geoid] = tract_counts.get(geoid, 0) + 1

        total = sum(tract_counts.values())
        print(f"     ✓ {total:,} records across {len(tract_counts)} tracts ({skipped} exempt/NA skipped)")
        return tract_counts
    except Exception as e:
        print(f"     ✗ ERROR: {e}")
        return {}


def normalize_geoid(tract: str) -> str:
    """Normalize HMDA census_tract to 11-digit FIPS GEOID."""
    # Remove any decimal (some HMDA formats use e.g. "012700.00")
    tract = tract.strip().replace(".00", "").replace(".", "")
    if len(tract) == 11:
        return tract
    if len(tract) <= 6:
        return STATE_FIPS + COUNTY_FIPS + tract.zfill(6)
    return tract   # leave as-is if unexpected length


# ── Race stats helpers ─────────────────────────────────────────────────────────

def make_stats(approved: int, denied: int) -> dict:
    total = approved + denied
    return {
        "approved": approved,
        "denied": denied,
        "total": total,
        "approvalRate": round(100 * approved / total, 1) if total >= 10 else None,
    }


def fetch_county_race(races_param: str, ethnicity_param: str | None,
                      race_key: str, base: dict) -> dict:
    """Two aggregations calls (originated + denied) → approval rate dict."""
    def p(action: str) -> dict:
        d = dict(base)
        d["ethnicities" if ethnicity_param else "races"] = ethnicity_param or races_param
        d["actions_taken"] = action
        return d

    orig = curl_json(p("1"), label=f"{race_key} orig")
    time.sleep(0.3)
    denied = curl_json(p("3"), label=f"{race_key} denied")
    time.sleep(0.3)

    approved = sum(int(r.get("count", 0)) for r in orig)
    den = sum(int(r.get("count", 0)) for r in denied)
    return make_stats(approved, den)


def fetch_tract_race(races_param: str, ethnicity_param: str | None,
                     race_key: str, base: dict) -> dict[str, dict]:
    """
    Two CSV calls (originated + denied) → {geoid: {approved, denied}}.
    CSV rows have census_tract field; we tally per tract.
    """
    def p(action: str) -> dict:
        d = dict(base)
        d["ethnicities" if ethnicity_param else "races"] = ethnicity_param or races_param
        d["actions_taken"] = action
        return d

    orig_tracts  = curl_csv_tracts(p("1"), label=f"{race_key} orig")
    time.sleep(0.5)
    denied_tracts = curl_csv_tracts(p("3"), label=f"{race_key} denied")
    time.sleep(0.5)

    result: dict[str, dict] = {}
    for geoid, cnt in orig_tracts.items():
        result.setdefault(geoid, {"approved": 0, "denied": 0})
        result[geoid]["approved"] += cnt
    for geoid, cnt in denied_tracts.items():
        result.setdefault(geoid, {"approved": 0, "denied": 0})
        result[geoid]["denied"] += cnt
    return result


# ── Geometry helpers ───────────────────────────────────────────────────────────

def strip_name(name: str) -> str:
    return "".join(c for c in name.lower() if c.isalnum())


def polygon_centroid(coords):
    xs, ys = [p[0] for p in coords], [p[1] for p in coords]
    n = len(xs)
    area = sum(xs[i]*ys[(i+1)%n] - xs[(i+1)%n]*ys[i] for i in range(n)) / 2
    if abs(area) < 1e-10:
        return sum(xs)/n, sum(ys)/n
    cx = sum((xs[i]+xs[(i+1)%n])*(xs[i]*ys[(i+1)%n]-xs[(i+1)%n]*ys[i]) for i in range(n)) / (6*area)
    cy = sum((ys[i]+ys[(i+1)%n])*(xs[i]*ys[(i+1)%n]-xs[(i+1)%n]*ys[i]) for i in range(n)) / (6*area)
    return cx, cy


def feature_centroid(feature):
    geom = feature.get("geometry", {})
    if not geom:
        return None
    gtype, coords = geom.get("type", ""), geom.get("coordinates", [])
    if gtype == "Polygon" and coords:
        return polygon_centroid(coords[0])
    if gtype == "MultiPolygon" and coords:
        return polygon_centroid(max(coords, key=lambda p: len(p[0]))[0])
    return None


def haversine(lon1, lat1, lon2, lat2):
    R = 6371.0
    dlat, dlon = math.radians(lat2-lat1), math.radians(lon2-lon1)
    a = (math.sin(dlat/2)**2
         + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlon/2)**2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def fetch_tract_points() -> dict[str, tuple]:
    print("Fetching tract centroids from TIGERweb...")
    with urllib.request.urlopen(TIGERWEB_URL, timeout=30) as resp:
        data = json.loads(resp.read())
    points = {}
    for f in data.get("features", []):
        attrs = f.get("attributes", {})
        geoid = str(attrs.get("GEOID", "")).strip()
        try:
            points[geoid] = (float(attrs["INTPTLON"]), float(attrs["INTPTLAT"]))
        except (KeyError, ValueError):
            pass
    print(f"  → {len(points)} tract centroids.")
    return points


def fetch_sna_geojson() -> dict:
    print("Fetching SNA neighborhood GeoJSON...")
    with urllib.request.urlopen(SNA_GEOJSON_URL, timeout=30) as resp:
        geo = json.loads(resp.read())
    print(f"  → {len(geo['features'])} neighborhoods.")
    return geo


def build_nb_centroids(geo: dict) -> list[dict]:
    out = []
    for feat in geo["features"]:
        props = feat.get("properties", {})
        name = props.get("SNA_NAME") or props.get("SNANAME") or props.get("name") or ""
        c = feature_centroid(feat)
        if c and name:
            out.append({"name": name, "key": strip_name(name), "lon": c[0], "lat": c[1]})
    return out


def nearest_nb(lon, lat, centroids):
    return min(centroids, key=lambda c: haversine(lon, lat, c["lon"], c["lat"]))


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f"\n=== HMDA Mortgage Lending Build — {HMDA_YEAR} ===\n")
    print("HTTP via curl (bypasses Akamai TLS fingerprint block on Python urllib)")
    print("Tract-level via /view/csv endpoint (aggregations endpoint silently ignores")
    print("variable=census_tract — confirmed after extensive debugging)\n")

    base = {"counties": COUNTY_FIPS, "years": HMDA_YEAR}

    # ── Step 1: County-level ─────────────────────────────────────────────────
    print("── Step 1: County-level approval rates ──")
    county: dict[str, dict] = {}
    for race_key, hmda_race in RACE_MAP.items():
        county[race_key] = fetch_county_race(hmda_race, None, race_key, base)
    county["hispanic"] = fetch_county_race("", HISPANIC_ETHNICITY, "hispanic", base)

    print("\nCounty-level summary (all loan types, Hamilton County 2022):")
    for key in ["white", "black", "asian", "hispanic"]:
        s = county[key]
        rate = f"{s['approvalRate']}%" if s["approvalRate"] is not None else "N/A"
        print(f"  {key:12s}  {rate:8s}  ({s['approved']:,} / {s['total']:,})")

    # ── Step 2: Tract-level via CSV ──────────────────────────────────────────
    print("\n── Step 2: Tract-level data via /view/csv ──")
    print("(2 CSV downloads per group × 4 groups — may take 30–90s)\n")

    tract_race: dict[str, dict[str, dict]] = {}
    for race_key, hmda_race in RACE_MAP.items():
        tract_race[race_key] = fetch_tract_race(hmda_race, None, race_key, base)
    tract_race["hispanic"] = fetch_tract_race("", HISPANIC_ETHNICITY, "hispanic", base)

    all_tracts = set()
    for rd in tract_race.values():
        all_tracts.update(rd.keys())
    print(f"\n  → {len(all_tracts)} unique tracts with lending data across all groups.")

    # ── Step 3: Map tracts → neighborhoods ──────────────────────────────────
    print("\n── Step 3: Map tracts → neighborhoods ──")
    geo = fetch_sna_geojson()
    tract_points = fetch_tract_points()
    nb_centroids = build_nb_centroids(geo)

    nb_accum: dict[str, dict] = {}   # key → {name, races: {race_key → {approved, denied}}}

    if all_tracts:
        for geoid in all_tracts:
            point = tract_points.get(geoid)
            if not point:
                continue
            nb = nearest_nb(point[0], point[1], nb_centroids)
            key = nb["key"]
            nb_accum.setdefault(key, {"name": nb["name"], "races": {}})
            for race_key in ["white", "black", "asian", "hispanic"]:
                counts = tract_race[race_key].get(geoid, {})
                if not counts:
                    continue
                r = nb_accum[key]["races"].setdefault(race_key, {"approved": 0, "denied": 0})
                r["approved"] += counts.get("approved", 0)
                r["denied"]   += counts.get("denied", 0)
        print(f"  → {len(nb_accum)} neighborhoods with tract-level data mapped.")
    else:
        print("  ⚠ No tract-level data — all neighborhoods will use county fallback.")

    # ── Step 4: Build output ──────────────────────────────────────────────────
    print("\n── Step 4: Building output ──")

    cw = county["white"]["approvalRate"]
    cb = county["black"]["approvalRate"]

    output: dict[str, dict] = {}

    for nb_key, nb in nb_accum.items():
        races = nb["races"]
        race_entries = {
            rk: make_stats(races.get(rk, {}).get("approved", 0),
                           races.get(rk, {}).get("denied", 0))
            for rk in ["white", "black", "asian", "hispanic"]
        }
        output[nb_key] = {
            "name": nb["name"],
            "year": int(HMDA_YEAR),
            "loanTypes": "All (purchase, refinance, home improvement)",
            "source": "tract_level",
            **race_entries,
            "countyWhiteApprovalRate": cw,
            "countyBlackApprovalRate": cb,
        }

    for nb in nb_centroids:
        key = nb["key"]
        if key not in output:
            output[key] = {
                "name": nb["name"],
                "year": int(HMDA_YEAR),
                "loanTypes": "All (purchase, refinance, home improvement)",
                "source": "county_fallback",
                "white":    {"approvalRate": county["white"]["approvalRate"]},
                "black":    {"approvalRate": county["black"]["approvalRate"]},
                "asian":    {"approvalRate": county["asian"]["approvalRate"]},
                "hispanic": {"approvalRate": county["hispanic"]["approvalRate"]},
                "countyWhiteApprovalRate": cw,
                "countyBlackApprovalRate": cb,
            }

    output["_county"] = {
        "name": "Hamilton County (all)",
        "year": int(HMDA_YEAR),
        "loanTypes": "All (purchase, refinance, home improvement)",
        "source": "county_level",
        **{k: county[k] for k in ["white", "black", "asian", "hispanic"]},
        "countyWhiteApprovalRate": cw,
        "countyBlackApprovalRate": cb,
    }

    os.makedirs(os.path.dirname(os.path.abspath(OUTPUT_PATH)), exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, indent=2)

    n_tract    = sum(1 for v in output.values() if v.get("source") == "tract_level")
    n_fallback = sum(1 for v in output.values() if v.get("source") == "county_fallback")
    print(f"\n✅ Wrote {len(output)} entries to {OUTPUT_PATH}")
    print(f"   {n_tract} neighborhoods: tract-level data")
    print(f"   {n_fallback} neighborhoods: county fallback")

    print("\nSanity check — Hamilton County Black/White approval gap:")
    w, b = county["white"], county["black"]
    if w["approvalRate"] is not None and b["approvalRate"] is not None:
        print(f"  White NH: {w['approvalRate']}%  (n={w['total']:,})")
        print(f"  Black:    {b['approvalRate']}%  (n={b['total']:,})")
        print(f"  Gap:      {w['approvalRate'] - b['approvalRate']:.1f} percentage points")


if __name__ == "__main__":
    main()
