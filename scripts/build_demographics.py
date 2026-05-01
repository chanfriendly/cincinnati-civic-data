#!/usr/bin/env python3
"""
build_demographics.py — Pre-build expanded neighborhood demographic data from ACS 5-Year.

Generates: public/data/neighborhood_demographics.json

Sources:
  ACS 5-Year 2022 (same vintage as neighborhood_acs.json)
  Census API endpoint: https://api.census.gov/data/2022/acs/acs5
  Geography: All census tracts in Hamilton County, OH (state=39, county=061)

Variables fetched per tract:
  Age structure (B01001):
    B01001_001E  — Total population
    B01001_002E  — Male total
    B01001_026E  — Female total
    (Under 18: sum of B01001_003..006 + B01001_027..030)
    (65+: sum of B01001_020..025 + B01001_044..049)
    B01002_001E  — Median age

  Language at home (C16001 — collapsed, available at tract level):
    C16001_001E  — Population 5+ years
    C16001_002E  — English only
    (B16001 is suppressed at tract level; C16001 is the tract-available equivalent)
    (We derive share speaking non-English at home)

  Foreign-born (B05002):
    B05002_001E  — Total population
    B05002_013E  — Foreign-born

  Educational attainment (B15003) — population 25+:
    B15003_001E  — Total 25+
    B15003_017E  — HS diploma
    B15003_018E  — GED
    B15003_022E  — Bachelor's degree
    B15003_023E  — Master's degree
    B15003_024E  — Professional school degree
    B15003_025E  — Doctorate

  Household type (B11001):
    B11001_001E  — Total households
    B11001_003E  — Married-couple family
    B11001_006E  — Female householder, no husband
    B11001_008E  — Non-family: living alone

  Broadband/Internet (B28002):
    B28002_001E  — Total households
    B28002_004E  — Broadband (cable, fiber, DSL)
    B28002_007E  — Cellular data plan
    B28002_013E  — No internet access

Run:
    python3 scripts/build_demographics.py
    (Requires CENSUS_API_KEY in environment or .env.local)
"""

import json
import math
import os
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date
from pathlib import Path

# ── Config ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ROOT_DIR   = SCRIPT_DIR.parent
OUT_FILE   = ROOT_DIR / 'public' / 'data' / 'neighborhood_demographics.json'

CENSUS_BASE = 'https://api.census.gov/data/2022/acs/acs5'
STATE       = '39'   # Ohio
COUNTY      = '061'  # Hamilton County

# Try to load API key from env or .env.local
CENSUS_API_KEY = os.environ.get('CENSUS_API_KEY', '')
if not CENSUS_API_KEY:
    env_path = ROOT_DIR / '.env.local'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith('CENSUS_API_KEY='):
                CENSUS_API_KEY = line.split('=', 1)[1].strip().strip('"\'')
                break

if not CENSUS_API_KEY:
    print('WARNING: No CENSUS_API_KEY found. Requests may be rate-limited.', file=sys.stderr)

# Under-18 age columns (B01001)
MALE_UNDER18   = [f'B01001_0{str(i).zfill(2)}E' for i in range(3, 7)]    # 003-006
FEMALE_UNDER18 = [f'B01001_0{str(i).zfill(2)}E' for i in range(27, 31)]   # 027-030
# 65+ age columns
MALE_65PLUS    = [f'B01001_0{str(i).zfill(2)}E' for i in range(20, 26)]   # 020-025
FEMALE_65PLUS  = [f'B01001_0{str(i).zfill(2)}E' for i in range(44, 50)]   # 044-049
# HS+: all codes ≥ 017 (HS diploma through doctorate)
HS_PLUS_COLS   = [f'B15003_0{str(i).zfill(2)}E' for i in range(17, 26)]   # 017-025
BACH_PLUS_COLS = [f'B15003_0{str(i).zfill(2)}E' for i in range(22, 26)]   # 022-025

# SNA neighborhood centroids (same as other build scripts)
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


def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))


def nearest_neighborhood(lat, lon):
    return min(SNA_CENTROIDS, key=lambda n: haversine_km(lat, lon, *SNA_CENTROIDS[n]))


def strip_name(name):
    return re.sub(r'[^a-z0-9]', '', name.lower())


def census_get(variables: list[str]) -> list[dict]:
    """Fetch ACS data for all Hamilton County tracts, returning list of row dicts."""
    get_str = ','.join(['GEO_ID', 'NAME'] + variables)
    params = {
        'get':    get_str,
        'for':    'tract:*',
        'in':     f'state:{STATE} county:{COUNTY}',
    }
    if CENSUS_API_KEY:
        params['key'] = CENSUS_API_KEY

    url = f'{CENSUS_BASE}?{urllib.parse.urlencode(params)}'
    print(f'  Fetching {len(variables)} variables for all HC tracts…')
    req = urllib.request.Request(url, headers={'Accept': 'application/json'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = json.loads(resp.read())

    headers = raw[0]
    return [dict(zip(headers, row)) for row in raw[1:]]


def safe_int(val):
    try:
        v = int(val)
        return v if v >= 0 else None
    except (TypeError, ValueError):
        return None


def safe_float(val):
    try:
        v = float(val)
        return v if v >= 0 else None
    except (TypeError, ValueError):
        return None


def geoid_from_row(row):
    # GEO_ID looks like "1400000US39061000100"
    geo = row.get('GEO_ID', '')
    if geo.startswith('1400000US'):
        return geo[9:].zfill(11)
    # Fallback: state+county+tract
    return f"{row.get('state','')}{row.get('county','')}{row.get('tract','')}".zfill(11)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    # Build all variables list
    age_vars = (
        ['B01001_001E', 'B01002_001E'] +
        MALE_UNDER18 + FEMALE_UNDER18 +
        MALE_65PLUS + FEMALE_65PLUS
    )
    lang_vars  = ['C16001_001E', 'C16001_002E']
    born_vars  = ['B05002_001E', 'B05002_013E']
    edu_vars   = ['B15003_001E'] + HS_PLUS_COLS
    hh_vars    = ['B11001_001E', 'B11001_008E']
    broad_vars = ['B28002_001E', 'B28002_004E', 'B28002_007E', 'B28002_013E']

    all_vars = list(dict.fromkeys(age_vars + lang_vars + born_vars + edu_vars + hh_vars + broad_vars))

    print('Fetching ACS expanded demographics for Hamilton County tracts…')
    rows = census_get(all_vars)
    print(f'  {len(rows)} census tracts returned')

    # Load tract coordinates from neighborhood_acs.json
    acs_path = ROOT_DIR / 'public' / 'data' / 'neighborhood_acs.json'
    tract_coords: dict[str, tuple] = {}
    if acs_path.exists():
        acs_list = json.load(open(acs_path))
        for rec in acs_list:
            geoid = str(rec.get('geoid', '')).zfill(11)
            if rec.get('lat') and rec.get('lon'):
                tract_coords[geoid] = (float(rec['lat']), float(rec['lon']))
    print(f'  {len(tract_coords)} tract coordinates loaded')

    # Accumulate per neighborhood
    nbh_buckets: dict[str, list[dict]] = defaultdict(list)

    for row in rows:
        geoid = geoid_from_row(row)
        coords = tract_coords.get(geoid)
        if not coords:
            continue
        nbh = nearest_neighborhood(*coords)
        nbh_buckets[nbh].append(row)

    print(f'  Mapped to {len(nbh_buckets)} neighborhoods')

    def weighted_avg(bucket, col, denom_col):
        """Sum col / sum denom_col across tracts."""
        num   = sum(safe_int(r.get(col)) or 0 for r in bucket)
        denom = sum(safe_int(r.get(denom_col)) or 0 for r in bucket)
        if denom == 0:
            return None
        return round(100.0 * num / denom, 1)

    def simple_avg(bucket, col):
        vals = [safe_float(r.get(col)) for r in bucket if safe_float(r.get(col)) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    def col_sum(bucket, cols):
        total = 0
        for r in bucket:
            for c in cols:
                v = safe_int(r.get(c))
                if v is not None and v >= 0:
                    total += v
        return total

    today = date.today().isoformat()
    output = {}

    for nbh_name, bucket in sorted(nbh_buckets.items()):
        key = strip_name(nbh_name)

        total_pop = col_sum(bucket, ['B01001_001E'])
        under18   = col_sum(bucket, MALE_UNDER18 + FEMALE_UNDER18)
        over65    = col_sum(bucket, MALE_65PLUS  + FEMALE_65PLUS)

        # Median age: simple average of tract medians (weighted avg would need population weights)
        median_age = simple_avg(bucket, 'B01002_001E')

        # Language (C16001: collapsed table, available at tract level)
        pop5plus        = col_sum(bucket, ['C16001_001E'])
        english_only    = col_sum(bucket, ['C16001_002E'])
        non_english_pct = round(100.0 * (pop5plus - english_only) / pop5plus, 1) if pop5plus > 0 else None

        # Foreign-born
        pop_total    = col_sum(bucket, ['B05002_001E'])
        foreign_born = col_sum(bucket, ['B05002_013E'])
        foreign_pct  = round(100.0 * foreign_born / pop_total, 1) if pop_total > 0 else None

        # Education
        edu_total  = col_sum(bucket, ['B15003_001E'])
        hs_plus    = col_sum(bucket, HS_PLUS_COLS)
        bach_plus  = col_sum(bucket, BACH_PLUS_COLS)
        hs_pct     = round(100.0 * hs_plus   / edu_total, 1) if edu_total > 0 else None
        bach_pct   = round(100.0 * bach_plus  / edu_total, 1) if edu_total > 0 else None

        # Household types (B11011 = household by type)
        hh_total      = col_sum(bucket, ['B11001_001E'])
        living_alone  = col_sum(bucket, ['B11001_008E'])  # Non-family: householder living alone
        alone_pct     = round(100.0 * living_alone / hh_total, 1) if hh_total > 0 else None

        # Broadband
        bb_total     = col_sum(bucket, ['B28002_001E'])
        broadband    = col_sum(bucket, ['B28002_004E'])
        no_internet  = col_sum(bucket, ['B28002_013E'])
        broadband_pct   = round(100.0 * broadband   / bb_total, 1) if bb_total > 0 else None
        no_internet_pct = round(100.0 * no_internet  / bb_total, 1) if bb_total > 0 else None

        output[key] = {
            'name':              nbh_name,
            'tractCount':        len(bucket),
            'totalPopulation':   total_pop,
            'medianAge':         median_age,
            'under18Pct':        round(100.0 * under18 / total_pop, 1) if total_pop > 0 else None,
            'over65Pct':         round(100.0 * over65  / total_pop, 1) if total_pop > 0 else None,
            'nonEnglishHomePct': non_english_pct,
            'foreignBornPct':    foreign_pct,
            'hsCompletionPct':   hs_pct,
            'bachelorsPlusPct':  bach_pct,
            'livingAlonePct':    alone_pct,
            'broadbandPct':      broadband_pct,
            'noInternetPct':     no_internet_pct,
            'dataYear':          '2022',
            'asOf':              today,
        }

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    print(f'\n✓ Wrote {len(output)} neighborhoods → {OUT_FILE}')
    sample_key = next(iter(output))
    sample = output[sample_key]
    print(f'\nSample ({sample["name"]}):')
    for k, v in sample.items():
        if k != 'name':
            print(f'  {k}: {v}')


if __name__ == '__main__':
    main()
