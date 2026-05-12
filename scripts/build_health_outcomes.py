#!/usr/bin/env python3
"""
build_health_outcomes.py — Pre-build neighborhood health outcome data from CDC PLACES.

Generates: public/data/neighborhood_health_outcomes.json

Source: CDC PLACES: Local Data for Better Health (census tract level)
  API: https://data.cdc.gov/resource/cwsq-ngmh.json
  Hamilton County FIPS: 39061 (Ohio)

Measures captured:
  DIABETES   — Diagnosed diabetes (%)
  OBESITY    — Obesity among adults (%)
  BPHIGH     — High blood pressure (%)
  DEPRESSION — Depression (%)
  MHLTH      — Mental health not good for ≥14 days (%)
  CSMOKING   — Current smoking (%)
  LPA        — Physical inactivity (no leisure-time activity, %)
  DENTAL     — No dental visit in past year (%)
  ACCESS2    — No health insurance (%)
  CHECKUP    — Annual checkup (%)
  SLEEP      — Short sleep duration (<7 hrs) among adults (%)
  CHD        — Coronary heart disease among adults (%)
  STROKE     — Stroke among adults (%)
  COPD       — COPD among adults (%)
  COGNITION  — Cognitive disability among adults (%)
  DISABILITY — Any disability among adults (%)
  MOBILITY   — Mobility disability among adults (%)
  SELFCARE   — Self-care disability among adults (%)
  INDEPLIVE  — Independent living disability among adults (%)
  LONELINESS — Loneliness among adults (%)
  EMOTIONSPT — Lack of social/emotional support among adults (%)
  GHLTH      — Fair or poor self-rated health among adults (%)
  ARTHRITIS  — Arthritis among adults (%)
  TEETHLOST  — All teeth lost among adults aged ≥65 years (%)

Process:
  1. Fetch all Hamilton County census tract records from CDC PLACES API
  2. Pivot from long format (one row per tract × measure) to wide (one row per tract)
  3. Map census tracts to neighborhoods via nearest-centroid (same method as ACS)
  4. Average tract values weighted by data coverage within each neighborhood

Output format:
  {
    "overtherine": {
      "name": "Over-the-Rhine",
      "diabetes": 12.5,
      "obesity": 30.2,
      "highBloodPressure": 35.0,
      "depression": 18.1,
      "mentalHealthDistress": 15.2,
      "smoking": 22.0,
      "physicalInactivity": 28.5,
      "noDentalVisit": 45.0,
      "noHealthInsurance": 18.0,
      "annualCheckup": 72.0,
      "tractCount": 3,
      "dataYear": "2021",
      "asOf": "2024-04-28"
    },
    ...
  }

Run:
    pip install requests --break-system-packages
    python3 scripts/build_health_outcomes.py
"""

import json
import math
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Optional

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ROOT_DIR   = SCRIPT_DIR.parent
OUT_FILE   = ROOT_DIR / 'public' / 'data' / 'neighborhood_health_outcomes.json'

# Hamilton County FIPS = 39061
# CDC PLACES uses 11-digit FIPS: state(2) + county(3) + tract(6)
# All Hamilton County tracts start with 39061
HAMILTON_COUNTY_PREFIX = '39061'

CDC_PLACES_URL = 'https://data.cdc.gov/resource/cwsq-ngmh.json'

# Measure IDs → our output field names
MEASURE_MAP = {
    # Original 10 measures
    'DIABETES':   'diabetes',
    'OBESITY':    'obesity',
    'BPHIGH':     'highBloodPressure',
    'DEPRESSION': 'depression',
    'MHLTH':      'mentalHealthDistress',
    'CSMOKING':   'smoking',
    'LPA':        'physicalInactivity',
    'DENTAL':     'noDentalVisit',
    'ACCESS2':    'noHealthInsurance',
    'CHECKUP':    'annualCheckup',
    # Sleep & cardiovascular (upstream/downstream of sleep-disordered breathing)
    'SLEEP':      'shortSleep',
    'CHD':        'heartDisease',
    'STROKE':     'stroke',
    'COPD':       'copd',
    # Disability & independence cluster (elderly vulnerability)
    'COGNITION':  'cognitiveDisability',
    'DISABILITY': 'anyDisability',
    'MOBILITY':   'mobilityDisability',
    'SELFCARE':   'selfCareDisability',
    'INDEPLIVE':  'independentLivingDisability',
    # Social isolation & wellbeing
    'LONELINESS': 'loneliness',
    'EMOTIONSPT': 'lackSocialSupport',
    'GHLTH':      'poorSelfRatedHealth',
    # Additional chronic conditions
    'ARTHRITIS':  'arthritis',
    'TEETHLOST':  'allTeethLost',
}

# ── SNA neighborhood centroids ────────────────────────────────────────────────
# Identical to those used in build_hud.py and build_parks.py.

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
    """Lowercase + strip non-alphanumeric — matches TypeScript stripNeighborhoodName()."""
    return re.sub(r'[^a-z0-9]', '', name.lower())


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_neighborhood(lat: float, lon: float) -> str:
    best_name = min(SNA_CENTROIDS, key=lambda n: haversine_km(lat, lon, *SNA_CENTROIDS[n]))
    return best_name


# ── Centroid lookup for census tracts ─────────────────────────────────────────

def census_tract_centroid(fips11: str) -> Optional[tuple[float, float]]:
    """
    Approximate centroid of a Hamilton County census tract using the
    neighborhood_acs.json we already have (which was built from the same tracts).
    Falls back to None if not found.
    """
    acs_path = ROOT_DIR / 'public' / 'data' / 'neighborhood_acs.json'
    if not acs_path.exists():
        return None

    # Load lazily on first call
    if not hasattr(census_tract_centroid, '_cache'):
        with open(acs_path) as f:
            census_tract_centroid._cache = json.load(f)

    # neighborhood_acs.json structure: { stripped_key: { tracts: [...], ... } }
    # We don't have tract centroids directly — return None to use neighborhood centroid
    return None


# ── Fetch CDC PLACES data ─────────────────────────────────────────────────────

def fetch_places_data() -> list[dict]:
    """
    Fetch Hamilton County census tract data from CDC PLACES API.
    The API returns one row per (location × measure) combination.
    Uses pagination (limit 50000 per request).
    """
    all_rows: list[dict] = []
    offset = 0
    limit  = 50000

    # Filter directly to Hamilton County FIPS 39061 — avoids the broken
    # geographiclevel + stateabbr $where clause (returns HTTP 400).
    # The CDC PLACES API accepts countyfips as a direct column filter.
    while True:
        params = urllib.parse.urlencode({
            'countyfips': HAMILTON_COUNTY_PREFIX,
            '$select':    'locationid,locationname,measureid,data_value,year',
            '$limit':     limit,
            '$offset':    offset,
        })
        url = f'{CDC_PLACES_URL}?{params}'
        print(f'  Fetching offset={offset}…  {url[:100]}')

        req = urllib.request.Request(url, headers={'Accept': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                batch = json.loads(resp.read())
        except Exception as e:
            print(f'  ERROR: {e}', file=sys.stderr)
            break

        if not batch:
            break

        all_rows.extend(batch)
        print(f'  → {len(batch)} rows (running total: {len(all_rows)})')

        if len(batch) < limit:
            break
        offset += limit

    return all_rows


# ── Process: long → wide, then group by neighborhood ─────────────────────────

def process(rows: list[dict]) -> dict:
    """
    1. Filter to Hamilton County tracts (FIPS starts with 39061).
    2. Build per-tract wide dict: {fips: {measure: value}}.
    3. Map each tract to nearest neighborhood centroid.
    4. Average across tracts per neighborhood.
    """
    # Step 1 & 2: build tract → {measure: value} map
    # locationid is the 11-digit FIPS; locationname is the formatted tract number
    tract_data: dict[str, dict[str, float]] = defaultdict(dict)
    tract_year: dict[str, str] = {}

    for row in rows:
        loc_id = str(row.get('locationid', '') or row.get('locationname', ''))
        # CDC PLACES uses the 11-digit census FIPS as locationid
        # Filter to Hamilton County
        if not loc_id.startswith(HAMILTON_COUNTY_PREFIX):
            continue

        measure = str(row.get('measureid', '')).strip().upper()
        if measure not in MEASURE_MAP:
            continue

        raw_val = row.get('data_value')
        if raw_val is None or raw_val == '':
            continue
        try:
            val = float(raw_val)
        except (TypeError, ValueError):
            continue

        field = MEASURE_MAP[measure]
        tract_data[loc_id][field] = val
        if 'year' in row and row['year']:
            tract_year[loc_id] = str(row['year'])

    print(f'\nHamilton County census tracts with data: {len(tract_data)}')
    if not tract_data:
        print('ERROR: No Hamilton County tracts found. Check FIPS prefix.', file=sys.stderr)
        return {}

    # Step 3: for each tract, find nearest neighborhood
    # We need tract centroids. Use the neighborhood_acs.json which has tracts listed.
    # Build a lookup: tract_fips → neighborhood name
    # neighborhood_acs.json is a flat LIST of {geoid, lat, lon, ...} objects —
    # one record per census tract. We use each tract's lat/lon with the
    # nearest_neighborhood() function (same haversine-to-SNA-centroid logic
    # used by build_parks.py and build_hud.py) to assign an SNA neighborhood.

    acs_path = ROOT_DIR / 'public' / 'data' / 'neighborhood_acs.json'
    tract_coords: dict[str, tuple[float, float]] = {}

    if acs_path.exists():
        with open(acs_path) as f:
            acs_list = json.load(f)  # list of {geoid, lat, lon, ...}

        for record in acs_list:
            geoid = str(record.get('geoid', '')).zfill(11)
            lat   = record.get('lat')
            lon   = record.get('lon')
            if geoid and lat is not None and lon is not None:
                tract_coords[geoid] = (float(lat), float(lon))

        print(f'Census tract coordinates loaded: {len(tract_coords)}')

    # Step 4: aggregate per neighborhood using nearest-centroid assignment
    nbh_buckets: dict[str, list[dict[str, float]]] = defaultdict(list)
    nbh_years:   dict[str, set[str]] = defaultdict(set)

    unmatched = 0
    for tract_fips, measures in tract_data.items():
        if len(measures) < 3:
            continue  # skip tracts with very few measures

        coords = tract_coords.get(tract_fips)
        if not coords:
            unmatched += 1
            continue
        nbh_name = nearest_neighborhood(coords[0], coords[1])

        nbh_buckets[nbh_name].append(measures)
        yr = tract_year.get(tract_fips, '')
        if yr:
            nbh_years[nbh_name].add(yr)

    print(f'Unmatched tracts (no ACS mapping): {unmatched}')
    print(f'Neighborhoods with health data: {len(nbh_buckets)}')

    # Compute neighborhood averages
    today = date.today().isoformat()
    output: dict[str, dict] = {}

    for nbh_name, tract_list in sorted(nbh_buckets.items()):
        stripped = strip_name(nbh_name)
        field_sums: dict[str, float] = defaultdict(float)
        field_counts: dict[str, int]  = defaultdict(int)

        for tract_measures in tract_list:
            for field, val in tract_measures.items():
                field_sums[field] += val
                field_counts[field] += 1

        record: dict = {'name': nbh_name}
        for field in MEASURE_MAP.values():
            if field_counts[field] > 0:
                record[field] = round(field_sums[field] / field_counts[field], 1)

        record['tractCount'] = len(tract_list)
        years = nbh_years.get(nbh_name, set())
        record['dataYear'] = max(years) if years else 'unknown'
        record['asOf'] = today

        output[stripped] = record

    return output


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print('Fetching CDC PLACES data for Ohio census tracts…')
    rows = fetch_places_data()
    print(f'\nTotal rows fetched: {len(rows)}')

    if not rows:
        print('ERROR: No data returned from CDC PLACES API.', file=sys.stderr)
        sys.exit(1)

    result = process(rows)
    if not result:
        print('ERROR: Processing produced no output.', file=sys.stderr)
        sys.exit(1)

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, 'w') as f:
        json.dump(result, f, indent=2)

    print(f'\n✓ Wrote {len(result)} neighborhoods → {OUT_FILE}')

    # Print a sample
    sample_key = next(iter(result))
    sample = result[sample_key]
    print(f'\nSample ({sample["name"]}):')
    for k, v in sample.items():
        if k != 'name':
            print(f'  {k}: {v}')


if __name__ == '__main__':
    main()
