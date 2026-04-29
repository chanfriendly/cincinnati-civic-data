#!/usr/bin/env python3
"""
build_life_expectancy.py — Pre-build neighborhood life expectancy estimates
from CDC USALEEP (United States Small-Area Life Expectancy Estimates Project).

Generates: public/data/neighborhood_life_expectancy.json

Source: CDC NCHS / NVSS — USALEEP
  URL: https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NVSS/USALEEP/CSV/OH_A.CSV
  File: Ohio state-level CSV with census-tract life expectancy at birth (e(0))
  Geography: Hamilton County tracts (CNTY2KX == 061, STATE2KX == 39)
  Vintage: 2010–2015 (USALEEP baseline period)
  Note: USALEEP suppresses tracts with too few deaths — 203 of 226 HC tracts
        have data. Suppressed tracts are excluded from neighborhood averages.

Output format:
  {
    "avondale": {
      "name": "Avondale",
      "lifeExpectancy": 73.2,
      "tractCount": 3,
      "tractSuppressed": 0,
      "dataYears": "2010-2015",
      "asOf": "2026-04-29"
    },
    ...
  }

Run:
    python3 scripts/build_life_expectancy.py
"""

import csv
import io
import json
import math
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ROOT_DIR   = SCRIPT_DIR.parent
OUT_FILE   = ROOT_DIR / 'public' / 'data' / 'neighborhood_life_expectancy.json'
ACS_PATH   = ROOT_DIR / 'public' / 'data' / 'neighborhood_acs.json'

USALEEP_URL = (
    'https://ftp.cdc.gov/pub/Health_Statistics/NCHS/Datasets/NVSS/USALEEP/CSV/OH_A.CSV'
)
HAMILTON_COUNTY = '061'
OHIO_STATE      = '39'

# ── SNA neighborhood centroids ────────────────────────────────────────────────

SNA_CENTROIDS = {
    'Avondale':           (39.1417, -84.4920),
    'Bond Hill':          (39.1730, -84.4770),
    'California':         (39.0843, -84.4580),
    'Camp Washington':    (39.1188, -84.5434),
    'Carthage':           (39.1870, -84.4770),
    'CBD / Riverfront':   (39.1031, -84.5120),
    'Clifton':            (39.1449, -84.5198),
    'Clifton Heights':    (39.1310, -84.5300),
    'College Hill':       (39.1955, -84.5185),
    'Columbia-Tusculum':  (39.1005, -84.4470),
    'Corryville':         (39.1330, -84.5120),
    'East End':           (39.0937, -84.4190),
    'East Price Hill':    (39.1133, -84.5480),
    'East Walnut Hills':  (39.1285, -84.4700),
    'East Westwood':      (39.1417, -84.5600),
    'English Woods':      (39.1800, -84.5680),
    'Evanston':           (39.1480, -84.4820),
    'Fairview':           (39.1310, -84.5300),
    'Fay Apartments':     (39.1127, -84.5380),
    'Hartwell':           (39.2080, -84.5050),
    'Hyde Park':          (39.1333, -84.4410),
    'Kennedy Heights':    (39.1750, -84.4600),
    'Linwood':            (39.1035, -84.4600),
    'Lower Price Hill':   (39.1056, -84.5550),
    'Madisonville':       (39.1460, -84.4290),
    'Millvale':           (39.1290, -84.5340),
    'Mount Adams':        (39.1089, -84.4967),
    'Mount Airy':         (39.1883, -84.5580),
    'Mount Auburn':       (39.1231, -84.5010),
    'Mt. Lookout':        (39.1108, -84.4206),
    'Mt. Washington':     (39.0913, -84.4300),
    'North Avondale':     (39.1620, -84.4905),
    'North Fairmount':    (39.1530, -84.5500),
    'Northside':          (39.1650, -84.5380),
    'Oakley':             (39.1490, -84.4400),
    "O'Bryonville":       (39.1268, -84.4447),
    'Over-the-Rhine':     (39.1123, -84.5153),
    'Paddock Hills':      (39.1828, -84.4822),
    'Pendleton':          (39.1082, -84.5053),
    'Pleasant Ridge':     (39.1650, -84.4480),
    'Queensgate':         (39.1000, -84.5340),
    'Riverside':          (39.0857, -84.6100),
    'Roselawn':           (39.1810, -84.4660),
    'Sayler Park':        (39.0967, -84.6440),
    'Sedamsville':        (39.0952, -84.6200),
    'South Cumminsville': (39.1433, -84.5530),
    'South Fairmount':    (39.1260, -84.5520),
    'Spring Grove Village':(39.1700, -84.5270),
    'Walnut Hills':       (39.1290, -84.4780),
    'West End':           (39.1127, -84.5380),
    'West Price Hill':    (39.1263, -84.5760),
    'Westwood':           (39.1497, -84.5810),
    'Winton Hills':       (39.1967, -84.5060),
}


def strip_name(name: str) -> str:
    return re.sub(r'[^a-z0-9]', '', name.lower())


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_neighborhood(lat: float, lon: float) -> str:
    return min(SNA_CENTROIDS, key=lambda n: haversine_km(lat, lon, *SNA_CENTROIDS[n]))


def load_tract_coords() -> dict[str, tuple[float, float]]:
    """Load census tract centroids from neighborhood_acs.json (flat list)."""
    if not ACS_PATH.exists():
        print(f'ERROR: {ACS_PATH} not found — run build_demographics.py first.', file=sys.stderr)
        return {}
    with open(ACS_PATH) as f:
        acs_list = json.load(f)
    coords: dict[str, tuple[float, float]] = {}
    for rec in acs_list:
        geoid = str(rec.get('geoid', '')).zfill(11)
        lat, lon = rec.get('lat'), rec.get('lon')
        if geoid and lat is not None and lon is not None:
            coords[geoid] = (float(lat), float(lon))
    return coords


def fetch_usaleep() -> list[dict]:
    """Fetch Ohio USALEEP CSV and return Hamilton County rows."""
    print(f'Fetching USALEEP data from CDC FTP…')
    req = urllib.request.Request(
        USALEEP_URL,
        headers={'User-Agent': 'Cincinnati Civic Data / chanfriendly@gmail.com'},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        text = resp.read().decode('utf-8')

    reader = csv.DictReader(io.StringIO(text))
    all_rows = list(reader)
    print(f'  Total Ohio tracts: {len(all_rows)}')

    hc_rows = [r for r in all_rows if r['CNTY2KX'].strip() == HAMILTON_COUNTY]
    print(f'  Hamilton County tracts: {len(hc_rows)}')
    return hc_rows


def process(rows: list[dict], tract_coords: dict[str, tuple[float, float]]) -> dict:
    """Map tracts to neighborhoods, average life expectancy per neighborhood."""
    # Bucket: nbh_name → list of (e0, se) tuples
    nbh_e0: dict[str, list[float]]     = defaultdict(list)
    nbh_suppressed: dict[str, int]     = defaultdict(int)

    for row in rows:
        tract_id = row['Tract ID'].strip().zfill(11)
        e0_str   = row['e(0)'].strip()

        coords = tract_coords.get(tract_id)
        if not coords:
            # Tract not in our ACS data — skip
            continue

        nbh = nearest_neighborhood(coords[0], coords[1])

        if not e0_str or e0_str in ('', 'NA', '.'):
            nbh_suppressed[nbh] += 1
            continue

        try:
            e0 = float(e0_str)
        except ValueError:
            nbh_suppressed[nbh] += 1
            continue

        nbh_e0[nbh].append(e0)

    print(f'  Neighborhoods with life expectancy data: {len(nbh_e0)}')

    today = date.today().isoformat()
    output: dict[str, dict] = {}

    for nbh_name, e0_list in sorted(nbh_e0.items()):
        key = strip_name(nbh_name)
        avg_e0 = round(sum(e0_list) / len(e0_list), 1)
        output[key] = {
            'name':             nbh_name,
            'lifeExpectancy':   avg_e0,
            'tractCount':       len(e0_list),
            'tractSuppressed':  nbh_suppressed.get(nbh_name, 0),
            'dataYears':        '2010-2015',
            'asOf':             today,
        }

    return output


def main():
    rows = fetch_usaleep()
    if not rows:
        print('ERROR: No Hamilton County data returned.', file=sys.stderr)
        sys.exit(1)

    tract_coords = load_tract_coords()
    if not tract_coords:
        sys.exit(1)
    print(f'  Tract coordinates loaded: {len(tract_coords)}')

    result = process(rows, tract_coords)
    if not result:
        print('ERROR: No neighborhoods produced.', file=sys.stderr)
        sys.exit(1)

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, 'w') as f:
        json.dump(result, f, indent=2)

    print(f'\n✓ Wrote {len(result)} neighborhoods → {OUT_FILE}')

    # Print range summary
    e0_vals = [v['lifeExpectancy'] for v in result.values()]
    print(f'  Life expectancy range: {min(e0_vals):.1f} – {max(e0_vals):.1f} years')
    print(f'  City average: {sum(e0_vals)/len(e0_vals):.1f} years')

    # Print sample
    sample_key = next(iter(result))
    sample = result[sample_key]
    print(f'\nSample ({sample["name"]}):')
    for k, v in sample.items():
        if k != 'name':
            print(f'  {k}: {v}')


if __name__ == '__main__':
    main()
