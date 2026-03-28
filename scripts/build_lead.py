#!/usr/bin/env python3
"""
build_lead.py — Pre-compute GCWW lead service line inventory by neighborhood.

Generates: public/data/lead_service_lines.json
Format:    { "<stripped_neighborhood_key>": { NeighborhoodLeadStats }, ... }

Run this locally before deploying. The Cowork sandbox blocks most external
requests, so this script must be run from your own machine.

Usage:
    python3 scripts/build_lead.py

Requires: requests (pip install requests)

── Data Sources ──────────────────────────────────────────────────────────────

PRIMARY (attempt 1): GCWW Neighborhood Stats page
  https://la.mygcww.org/neighborhood-stats/
  HTML page listing total / lead / unknown / copper / replaced counts by
  neighborhood. Scraped and parsed.

FALLBACK (attempt 2): Cincinnati Open Data SODA API
  Dataset: ntfu-vnkd — GCWW Private-Side One-off Lead Service Line Replacements
  This dataset records completed private-side replacements only. When used as
  fallback it counts replacements per neighborhood but cannot give a full
  inventory split (lead vs. unknown vs. copper). Fields must be discovered via
  the metadata endpoint since the schema is undocumented.

── Field Name Discovery ───────────────────────────────────────────────────────

The `ntfu-vnkd` dataset field names are not confirmed. This script queries the
Socrata metadata endpoint first to discover the actual column names, then builds
the query accordingly.

── Output Schema ──────────────────────────────────────────────────────────────

{
  "overtherine": {
    "name": "Over-the-Rhine",
    "total": 1240,
    "lead": 312,
    "unknown": 567,
    "galvanized": 88,
    "copper": 220,
    "replaced": 53,
    "asOf": "2024-12-01"
  },
  ...
}

Keys use stripNeighborhoodName() logic: lowercase, alphanumeric only.
"""

import json
import re
import sys
from datetime import date
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package not installed. Run: pip install requests")
    sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────────

OUTPUT_PATH = Path(__file__).parent.parent / "public" / "data" / "lead_service_lines.json"
SODA_BASE = "https://data.cincinnati-oh.gov/resource"
GCWW_NEIGH_STATS_URL = "https://la.mygcww.org/neighborhood-stats/"
DATASET_UID = "ntfu-vnkd"          # GCWW Private-Side One-off Lead Service Line Replacements
DATASET_UID_ALT = "b4xq-u3su"     # Alternate view — try if ntfu-vnkd has no neighborhood field

TODAY = date.today().isoformat()

# ── Helpers ────────────────────────────────────────────────────────────────────

def strip_name(name: str) -> str:
    """Matches stripNeighborhoodName() in src/utils/api.ts"""
    return re.sub(r'[^a-z0-9]', '', name.lower())

def discover_fields(uid: str) -> list[dict]:
    """Query the Socrata metadata endpoint to discover column names."""
    url = f"{SODA_BASE}/{uid}.json?$limit=1"
    try:
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        records = resp.json()
        if records:
            return list(records[0].keys())
        # Try the columns metadata endpoint
        meta_url = f"https://data.cincinnati-oh.gov/api/views/{uid}.json"
        meta = requests.get(meta_url, timeout=15).json()
        return [col["fieldName"] for col in meta.get("columns", [])]
    except Exception as e:
        print(f"  Field discovery failed: {e}")
        return []

def fetch_soda(uid: str, params: dict) -> list[dict]:
    """Fetch records from a Socrata dataset."""
    url = f"{SODA_BASE}/{uid}.json"
    resp = requests.get(url, params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()

def fetch_soda_count(uid: str, where: str = "1=1") -> int:
    """Get total record count for a dataset."""
    records = fetch_soda(uid, {"$select": "count(*) as cnt", "$where": where})
    if records and "cnt" in records[0]:
        return int(records[0]["cnt"])
    return 0

# ── Strategy 1: GCWW Neighborhood Stats HTML page ─────────────────────────────

def try_gcww_html() -> dict | None:
    """
    Attempt to scrape the GCWW neighborhood stats page.
    Returns { stripped_name: NeighborhoodLeadStats } or None on failure.
    """
    print("\n[Strategy 1] Attempting GCWW neighborhood stats page…")
    try:
        resp = requests.get(GCWW_NEIGH_STATS_URL, timeout=20)
        resp.raise_for_status()
    except Exception as e:
        print(f"  Failed to fetch {GCWW_NEIGH_STATS_URL}: {e}")
        return None

    html = resp.text
    result = {}

    # Look for a table or JSON blob with neighborhood stats.
    # The page may render stats as:
    #   <tr><td>Over-the-Rhine</td><td>1240</td><td>312</td>...</tr>
    # or as a JSON data blob in a <script> tag.

    # Attempt 1: embedded JSON in <script>
    json_match = re.search(r'var\s+\w+\s*=\s*(\[.*?\]);', html, re.DOTALL)
    if not json_match:
        json_match = re.search(r'data\s*[:=]\s*(\[.*?\])', html, re.DOTALL)
    if json_match:
        try:
            data = json.loads(json_match.group(1))
            if isinstance(data, list) and data and isinstance(data[0], dict):
                print(f"  Found JSON blob with {len(data)} entries")
                for row in data:
                    name_raw = (
                        row.get("neighborhood") or
                        row.get("SNA_NAME") or
                        row.get("name") or ""
                    )
                    if not name_raw:
                        continue
                    key = strip_name(name_raw)
                    result[key] = {
                        "name": name_raw,
                        "total": int(row.get("total", 0) or 0),
                        "lead": int(row.get("lead", 0) or 0),
                        "unknown": int(row.get("unknown", 0) or 0),
                        "galvanized": int(row.get("galvanized", 0) or 0),
                        "copper": int(row.get("copper", 0) or 0),
                        "replaced": int(row.get("replaced", 0) or 0),
                        "asOf": TODAY,
                    }
                if result:
                    print(f"  Parsed {len(result)} neighborhoods from JSON blob")
                    return result
        except json.JSONDecodeError:
            pass

    # Attempt 2: HTML table rows
    # Try to find table rows with neighborhood name + numeric columns
    table_rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL | re.IGNORECASE)
    for row_html in table_rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row_html, re.DOTALL | re.IGNORECASE)
        cells = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
        if len(cells) >= 4 and cells[0] and not cells[0].replace(',', '').isdigit():
            name_raw = cells[0]
            nums = []
            for c in cells[1:]:
                try:
                    nums.append(int(c.replace(',', '')))
                except ValueError:
                    nums.append(0)
            if nums:
                key = strip_name(name_raw)
                # Column order assumed: total, lead, unknown, galvanized, copper, replaced
                # Adjust indices below if the page uses a different column order
                result[key] = {
                    "name": name_raw,
                    "total": nums[0] if len(nums) > 0 else 0,
                    "lead": nums[1] if len(nums) > 1 else 0,
                    "unknown": nums[2] if len(nums) > 2 else 0,
                    "galvanized": nums[3] if len(nums) > 3 else 0,
                    "copper": nums[4] if len(nums) > 4 else 0,
                    "replaced": nums[5] if len(nums) > 5 else 0,
                    "asOf": TODAY,
                }

    if result:
        print(f"  Parsed {len(result)} neighborhoods from HTML table")
        return result

    print("  Could not parse neighborhood stats from HTML")
    return None

# ── Strategy 2: SODA replacement records (count-only fallback) ─────────────────

def try_soda_replacements() -> dict | None:
    """
    Fall back to querying the GCWW replacement records dataset.
    This only gives us replacement counts per neighborhood — not the full
    lead/unknown/copper split. Records the limitation in the output.

    Returns { stripped_name: NeighborhoodLeadStats } or None on failure.
    """
    print(f"\n[Strategy 2] Attempting SODA dataset {DATASET_UID}…")

    # Discover field names
    fields = discover_fields(DATASET_UID)
    if not fields:
        print(f"  Trying alternate UID {DATASET_UID_ALT}…")
        fields = discover_fields(DATASET_UID_ALT)
        uid = DATASET_UID_ALT
    else:
        uid = DATASET_UID

    if fields:
        print(f"  Fields found: {fields}")
    else:
        print("  Could not discover field names. Dataset may require auth or not exist.")
        return None

    # Find the neighborhood field
    neigh_field = None
    for candidate in ["neighborhood", "cpd_neighborhood", "sna_neighborhood", "neigh"]:
        if candidate in fields:
            neigh_field = candidate
            break

    if not neigh_field:
        print(f"  No neighborhood field found in: {fields}")
        return None

    print(f"  Using neighborhood field: {neigh_field}")

    try:
        # Group by neighborhood to get counts
        rows = fetch_soda(uid, {
            "$select": f"{neigh_field},count(*) as cnt",
            "$group": neigh_field,
            "$limit": 200,
        })
    except Exception as e:
        print(f"  SODA query failed: {e}")
        return None

    result = {}
    for row in rows:
        name_raw = row.get(neigh_field, "")
        if not name_raw or name_raw.upper() in ("N/A", "NULL", "UNKNOWN", ""):
            continue
        # Names in CPD datasets are UPPER CASE — convert to Title Case for display
        name_display = name_raw.title().replace("-", "-")
        key = strip_name(name_raw)
        cnt = int(row.get("cnt", 0))
        result[key] = {
            "name": name_display,
            "total": 0,         # Full inventory unknown from this dataset
            "lead": 0,
            "unknown": 0,
            "galvanized": 0,
            "copper": 0,
            "replaced": cnt,    # Only replacement count is available
            "asOf": TODAY,
            "_note": "Count from replacement records only — full inventory not available from this source",
        }

    if result:
        print(f"  Got replacement counts for {len(result)} neighborhoods")
        return result

    return None

# ── Strategy 3: ArcGIS feature service (future) ────────────────────────────────
#
# GCWW hosts a lead service line map at:
#   https://gcww.maps.arcgis.com/apps/webappviewer/index.html?id=0a170c268c694e46a8a4e394630df0bd
#
# The underlying feature service can be queried if its REST endpoint is found.
# This is a good target for a future improvement. To find the endpoint:
#   1. Open the app in a browser
#   2. Open Network tab in DevTools
#   3. Filter for "FeatureServer" or "MapServer" requests
#   4. The service URL will be visible in the request URLs
#
# Once the endpoint is known, add a Strategy 3 block here that queries:
#   <service_url>/query?where=1%3D1&outFields=*&groupByFieldsForStatistics=<neigh_field>
#   &outStatistics=[{"statisticType":"count","onStatisticField":"<id_field>","outStatisticFieldName":"cnt"}]

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("GCWW Lead Service Line Inventory Build Script")
    print(f"Output: {OUTPUT_PATH}")
    print("=" * 60)

    result = None

    result = try_gcww_html()

    if not result:
        result = try_soda_replacements()

    if not result:
        print("\n[WARN] All strategies failed. Writing empty JSON.")
        print("       The Lead Safety tab will show a 'build required' notice.")
        result = {}

    # Sort by key for stable output
    result = dict(sorted(result.items()))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n✅ Wrote {len(result)} neighborhoods to {OUTPUT_PATH}")
    if result:
        sample_key = next(iter(result))
        print(f"\nSample entry ({sample_key}):")
        print(json.dumps(result[sample_key], indent=2))

    print("\nNext steps:")
    print("  1. Commit public/data/lead_service_lines.json")
    print("  2. Push to Vercel — the Lead Safety tab will populate automatically")
    if result and any(r.get("total", 0) == 0 for r in result.values()):
        print("\n[WARN] Many entries have total=0. The HTML strategy likely fell back to")
        print("       SODA replacement counts only. Try inspecting the GCWW neighborhood")
        print("       stats page manually and update the HTML parsing logic above.")


if __name__ == "__main__":
    main()
