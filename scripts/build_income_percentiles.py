#!/usr/bin/env python3
"""
build_income_percentiles.py — Fetch Cincinnati household income percentile
thresholds from the U.S. Census ACS 5-year estimates (table B19080) for use
in the Tax & Revenue tab.

Generates: public/data/cincinnati_income_percentiles.json

Run locally before deploying:
    python3 scripts/build_income_percentiles.py

Requires: requests (pip install requests)

── Data Source ───────────────────────────────────────────────────────────────

U.S. Census Bureau — American Community Survey (ACS) 5-Year Estimates
  Table B19080: Household Income Quintile Upper Limits
  API base:    https://api.census.gov/data/<year>/acs/acs5
  Geography:   state:39 (Ohio), place:15000 (Cincinnati city)
  Auth:        Optional — CENSUS_API_KEY env var for higher rate limits.

B19080 variables (5 values per year):
  B19080_001E  Lowest Quintile upper limit (20th percentile)
  B19080_002E  Second Quintile upper limit (40th percentile)
  B19080_003E  Third Quintile upper limit  (60th percentile)
  B19080_004E  Fourth Quintile upper limit (80th percentile)
  B19080_005E  Lower Limit of Top 5 Percent (95th percentile threshold)

ACS 5-year estimates are centered on the middle year of the 5-year window
(e.g. "2022" means the 2018–2022 survey waves). They suppress margin-of-error
for small places less often than 1-year estimates — preferred for neighborhood
and city-level use.

── Output format ─────────────────────────────────────────────────────────────

{
  "source": { "dataset": "ACS 5-Year, Table B19080", "place": "Cincinnati, OH" },
  "years": [
    {
      "year": 2012,
      "p20": 18234, "p40": 31500, "p60": 51200,
      "p80": 83400, "p95": 150000
    },
    ...
  ]
}

The first ACS 5-year data release was 2009 (for 2005–2009). B19080 was added
later; the earliest year we reliably pull is typically 2012.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

import requests

# ── Configuration ─────────────────────────────────────────────────────────────

STATE_FIPS = "39"          # Ohio
PLACE_FIPS = "15000"       # Cincinnati city (FIPS place code)
VARIABLES = [
    "B19080_001E",
    "B19080_002E",
    "B19080_003E",
    "B19080_004E",
    "B19080_005E",
]

# ACS 5-year releases. Earliest reliable year for B19080 at place level is 2012.
# We step through each release year from 2012 to the most recent one. When this
# script is re-run in a later year, add the new release to the end of the list.
YEARS = [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023]

OUT_PATH = Path(__file__).resolve().parent.parent / "public" / "data" / "cincinnati_income_percentiles.json"


# ── Fetch ─────────────────────────────────────────────────────────────────────

def fetch_year(year: int, api_key: Optional[str]) -> Optional[dict]:
    """Fetch B19080 for Cincinnati place for one ACS 5-year release."""
    url = f"https://api.census.gov/data/{year}/acs/acs5"
    params = {
        "get": ",".join(["NAME", *VARIABLES]),
        "for": f"place:{PLACE_FIPS}",
        "in": f"state:{STATE_FIPS}",
    }
    if api_key:
        params["key"] = api_key

    try:
        r = requests.get(url, params=params, timeout=20)
    except requests.RequestException as e:
        print(f"  ! {year}: request failed: {e}", file=sys.stderr)
        return None

    if r.status_code != 200:
        print(f"  ! {year}: HTTP {r.status_code}: {r.text[:120]}", file=sys.stderr)
        return None

    try:
        rows = r.json()
    except ValueError:
        print(f"  ! {year}: non-JSON response: {r.text[:120]}", file=sys.stderr)
        return None

    # rows = [header, [NAME, B19080_001E, ..., state, place]]
    if len(rows) < 2:
        print(f"  ! {year}: no data row returned", file=sys.stderr)
        return None

    header = rows[0]
    data = rows[1]
    record = dict(zip(header, data))

    def to_int(v: str) -> Optional[int]:
        try:
            n = int(v)
            # Census uses -666666666 (and similar) as NULL sentinels
            if n < 0:
                return None
            return n
        except (TypeError, ValueError):
            return None

    return {
        "year": year,
        "p20": to_int(record.get("B19080_001E", "")),
        "p40": to_int(record.get("B19080_002E", "")),
        "p60": to_int(record.get("B19080_003E", "")),
        "p80": to_int(record.get("B19080_004E", "")),
        "p95": to_int(record.get("B19080_005E", "")),
    }


def main() -> int:
    api_key = os.environ.get("CENSUS_API_KEY") or None
    if not api_key:
        print("Note: CENSUS_API_KEY not set. Public requests work at low volume.", file=sys.stderr)

    print(f"Fetching Cincinnati income percentiles ({len(YEARS)} ACS 5-year releases)...")
    records: list[dict] = []
    for y in YEARS:
        print(f"  {y}...", end=" ", flush=True)
        row = fetch_year(y, api_key)
        if row is None:
            print("SKIPPED")
            continue
        print(
            f"p20=${row['p20']:,}  p40=${row['p40']:,}  p60=${row['p60']:,}  "
            f"p80=${row['p80']:,}  p95=${row['p95']:,}"
            if all(row[k] is not None for k in ("p20", "p40", "p60", "p80", "p95"))
            else "partial"
        )
        records.append(row)
        # Be polite to the API.
        time.sleep(0.25)

    if not records:
        print("No data fetched. Aborting — not overwriting existing file.", file=sys.stderr)
        return 1

    out = {
        "source": {
            "dataset": "U.S. Census Bureau ACS 5-Year Estimates, Table B19080 (Household Income Quintile Upper Limits)",
            "place": "Cincinnati city, Ohio (state:39 place:15000)",
            "api": "https://api.census.gov/data/<year>/acs/acs5",
            "built_at": time.strftime("%Y-%m-%d"),
            "note": "ACS 5-year estimates center on the middle year of the survey window. A 'year' value of 2022 represents 2018-2022 survey waves combined."
        },
        "fields": {
            "p20": "20th percentile of household income (upper limit of lowest quintile)",
            "p40": "40th percentile (upper limit of second quintile)",
            "p60": "60th percentile (upper limit of third / middle quintile)",
            "p80": "80th percentile (upper limit of fourth quintile)",
            "p95": "95th percentile (lower limit of top 5%)"
        },
        "years": records
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {len(records)} years -> {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
