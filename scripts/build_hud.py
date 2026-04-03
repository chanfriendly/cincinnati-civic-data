#!/usr/bin/env python3
"""
build_hud.py — Pre-compute HUD subsidized housing inventory by Cincinnati neighborhood.

Generates: public/data/hud_affordable_housing.json
Format:    { "<stripped_neighborhood_key>": { NeighborhoodHUDStats }, ... }

Run locally before deploying:
    python3 scripts/build_hud.py

Requires: requests (pip install requests)

── Data Source ───────────────────────────────────────────────────────────────

HUD Multifamily Properties - Assisted (ArcGIS FeatureServer)
  URL: https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/
            Multifamily_Properties_Assisted/FeatureServer/0/query
  Auth: None (fully public ArcGIS REST API)
  Filter: STATE_CD = 'OH' and CITY = 'CINCINNATI'

Key fields queried:
  PROPERTY_NAME, PROPERTY_ADDRESS, CITY, STATE_CD, ZIP_CODE
  TOTAL_ASSISTED_UNIT_COUNT, TOTAL_UNIT_COUNT
  ASSISTED_UNITS_COUNT (alternate field name in some layers)
  LATITUDE, LONGITUDE (or geometry)
  Program type flags:
    IS_SUBSIDIZED_IND
    PROGRAM_TYPE (or PROGRAM_NAME)
    TRACS_OVERALL_EXPIRATION_DATE  — contract end date

── Neighborhood matching ─────────────────────────────────────────────────────

Properties are matched to Cincinnati neighborhoods using nearest-centroid to the
SNA (Statistical Neighborhood Approximations) list. The same centroid file used
by build_parks.py and build_racial_equity.py.

── Output format ─────────────────────────────────────────────────────────────

{
  "overtherine": {
    "name": "Over-the-Rhine",
    "totalAssistedUnits": 312,
    "propertyCount": 8,
    "byProgram": { "Section 8 New Construction": 180, "Public Housing": 132 },
    "expiringProperties": [
      { "name": "OTR Towers", "address": "...", "units": 48, "contractEnd": "2027-06-30" }
    ],
    "asOf": "2026-04-03"
  },
  ...
}
"""

import json
import math
import re
import sys
import urllib.request
import urllib.parse
from datetime import date, datetime
from pathlib import Path
from typing import Optional

# ── Paths ─────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ROOT_DIR   = SCRIPT_DIR.parent
OUT_FILE   = ROOT_DIR / 'public' / 'data' / 'hud_affordable_housing.json'

# ── Cincinnati bounding box (WGS84) ──────────────────────────────────────────

# Broad box covering all of Hamilton County / greater Cincinnati area
# so we catch suburban neighborhoods that are still SNA-mapped
BBOX = {
    'xmin': -84.82,
    'ymin': 38.98,
    'xmax': -84.25,
    'ymax': 39.35,
}

# ── HUD ArcGIS endpoint ───────────────────────────────────────────────────────

HUD_FS_URL = (
    'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services'
    '/Multifamily_Properties_Assisted/FeatureServer/0/query'
)

# Fields to fetch — some may be null depending on property type
FIELDS = ','.join([
    'PROPERTY_NAME_TEXT',
    'ADDRESS_LINE1_TEXT',
    'STD_CITY',
    'STD_ST',
    'STD_ZIP5',
    'TOTAL_ASSISTED_UNIT_COUNT',
    'TOTAL_UNIT_COUNT',
    'PROGRAM_TYPE1',
    'PROGRAM_TYPE2',
    'EXPIRATION_DATE1',
    'EXPIRATION_DATE2',
    'MGMT_AGENT_ORG_NAME',
    'LAT',
    'LON',
])

# ── SNA neighborhood centroids ────────────────────────────────────────────────
# Same list used by build_parks.py and build_racial_equity.py

SNA_CENTROIDS = {
    'Avondale':          (39.1417, -84.4920),
    'Bond Hill':         (39.1730, -84.4770),
    'California':        (39.0843, -84.4580),
    'Camp Washington':   (39.1188, -84.5434),
    'Carthage':          (39.1870, -84.4770),
    'CBD / Riverfront':  (39.1031, -84.5120),
    'Clifton':           (39.1449, -84.5198),
    'Clifton Heights':   (39.1310, -84.5300),
    'College Hill':      (39.1955, -84.5185),
    'Columbia-Tusculum': (39.1005, -84.4470),
    'Corryville':        (39.1330, -84.5120),
    'East End':          (39.0937, -84.4190),
    'East Price Hill':   (39.1133, -84.5480),
    'East Walnut Hills': (39.1285, -84.4700),
    'East Westwood':     (39.1417, -84.5600),
    'English Woods':     (39.1800, -84.5680),
    'Evanston':          (39.1480, -84.4820),
    'Fairview':          (39.1310, -84.5300),
    'Fay Apartments':    (39.1127, -84.5380),
    'Hartwell':          (39.2080, -84.5050),
    'Hyde Park':         (39.1333, -84.4410),
    'Kennedy Heights':   (39.1750, -84.4600),
    'Linwood':           (39.1035, -84.4600),
    'Lower Price Hill':  (39.1056, -84.5550),
    'Madisonville':      (39.1460, -84.4290),
    'Millvale':          (39.1290, -84.5340),
    'Mount Adams':       (39.1089, -84.4967),
    'Mount Airy':        (39.1883, -84.5580),
    'Mount Auburn':      (39.1231, -84.5010),
    'Mt. Lookout':       (39.1108, -84.4206),
    'Mt. Washington':    (39.0913, -84.4300),
    'North Avondale':    (39.1620, -84.4905),
    'North Fairmount':   (39.1530, -84.5500),
    'Northside':         (39.1650, -84.5380),
    'Oakley':            (39.1490, -84.4400),
    "O'Bryonville":      (39.1268, -84.4447),
    'Over-the-Rhine':    (39.1123, -84.5153),
    'Paddock Hills':     (39.1828, -84.4822),
    'Pendleton':         (39.1082, -84.5053),
    'Pleasant Ridge':    (39.1650, -84.4480),
    'Queensgate':        (39.1000, -84.5340),
    'Riverside':         (39.0857, -84.6100),
    'Roselawn':          (39.1810, -84.4660),
    'Sayler Park':       (39.0967, -84.6440),
    'Sedamsville':       (39.0952, -84.6200),
    'South Cumminsville':(39.1433, -84.5530),
    'South Fairmount':   (39.1260, -84.5520),
    'Spring Grove Village':(39.1700, -84.5270),
    'Walnut Hills':      (39.1290, -84.4780),
    'West End':          (39.1127, -84.5380),
    'West Price Hill':   (39.1263, -84.5760),
    'Westwood':          (39.1497, -84.5810),
    'Winton Hills':      (39.1967, -84.5060),
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def strip_name(name: str) -> str:
    """Lower-case and strip non-alphanumeric — same as TypeScript stripNeighborhoodName()."""
    return re.sub(r'[^a-z0-9]', '', name.lower())


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km."""
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearest_neighborhood(lat: float, lon: float) -> str:
    """Return the SNA neighborhood name whose centroid is closest to (lat, lon)."""
    best_name = None
    best_dist = float('inf')
    for name, (clat, clon) in SNA_CENTROIDS.items():
        d = haversine(lat, lon, clat, clon)
        if d < best_dist:
            best_dist = d
            best_name = name
    return best_name  # type: ignore[return-value]


def get_field(attrs: dict, *keys: str, default=None):
    """Return first non-null value from a list of candidate field names."""
    for k in keys:
        v = attrs.get(k)
        if v is not None and v != '' and v != 'null':
            return v
    return default


def parse_expiry(val) -> Optional[str]:
    """Normalize various date formats to YYYY-MM-DD, or None."""
    if not val:
        return None
    s = str(val).strip()
    # Epoch milliseconds (ArcGIS returns these for date fields)
    if s.isdigit() and len(s) > 8:
        try:
            dt = datetime.utcfromtimestamp(int(s) / 1000)
            return dt.strftime('%Y-%m-%d')
        except Exception:
            return None
    # Try common date strings
    for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(s[:10], fmt).strftime('%Y-%m-%d')
        except ValueError:
            continue
    return None


def fetch_hud_properties() -> list[dict]:
    """Query HUD FeatureServer for all properties within the Cincinnati bounding box."""
    params = urllib.parse.urlencode({
        'where': "STD_ST='OH'",
        'geometry': f"{BBOX['xmin']},{BBOX['ymin']},{BBOX['xmax']},{BBOX['ymax']}",
        'geometryType': 'esriGeometryEnvelope',
        'spatialRel': 'esriSpatialRelIntersects',
        'inSR': '4326',
        'outFields': FIELDS,
        'returnGeometry': 'true',
        'outSR': '4326',
        'f': 'json',
        'resultRecordCount': 1000,
    })
    url = f'{HUD_FS_URL}?{params}'
    print(f'Fetching HUD data...\n  {url[:120]}...')

    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())

    if 'error' in data:
        raise RuntimeError(f"ArcGIS error: {data['error']}")

    features = data.get('features', [])
    print(f'  → {len(features)} features returned')
    return features


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    today = date.today().isoformat()
    five_years = date.today().replace(year=date.today().year + 5).isoformat()

    try:
        features = fetch_hud_properties()
    except Exception as e:
        print(f'ERROR fetching HUD data: {e}', file=sys.stderr)
        sys.exit(1)

    # Accumulate per-neighborhood
    # Structure: { stripped_key: { name, units, programs, expiring } }
    nbh_map: dict[str, dict] = {}

    skipped = 0
    for feat in features:
        attrs = feat.get('attributes', {})
        geom  = feat.get('geometry', {})

        # Extract lat/lon — prefer attribute fields, fall back to geometry
        lat = get_field(attrs, 'LAT') or (geom.get('y') if geom else None)
        lon = get_field(attrs, 'LON') or (geom.get('x') if geom else None)
        if lat is None or lon is None:
            skipped += 1
            continue
        lat, lon = float(lat), float(lon)

        # Only keep properties within a tighter Cincinnati city boundary
        if not (39.05 <= lat <= 39.22 and -84.62 <= lon <= -84.38):
            continue

        # Resolve nearest neighborhood
        nbh_name = nearest_neighborhood(lat, lon)
        key = strip_name(nbh_name)

        # Extract fields
        assisted_units = int(get_field(attrs, 'TOTAL_ASSISTED_UNIT_COUNT', default=0) or 0)
        total_units    = int(get_field(attrs, 'TOTAL_UNIT_COUNT', default=0) or 0)
        prop_name      = get_field(attrs, 'PROPERTY_NAME_TEXT', default='Unknown Property')
        address        = get_field(attrs, 'ADDRESS_LINE1_TEXT', default='')
        program        = get_field(attrs, 'PROGRAM_TYPE1', 'PROGRAM_TYPE2', default='HUD Assisted')
        expiry_raw     = get_field(attrs, 'EXPIRATION_DATE1', 'EXPIRATION_DATE2')
        expiry         = parse_expiry(expiry_raw)

        if key not in nbh_map:
            nbh_map[key] = {
                'name': nbh_name,
                'totalAssistedUnits': 0,
                'propertyCount': 0,
                'byProgram': {},
                'expiringProperties': [],
                'asOf': today,
            }

        entry = nbh_map[key]
        entry['totalAssistedUnits'] += assisted_units
        entry['propertyCount'] += 1

        # Program type aggregation
        prog_label = str(program).strip() or 'HUD Assisted'
        entry['byProgram'][prog_label] = entry['byProgram'].get(prog_label, 0) + assisted_units

        # Flag expiring within 5 years
        if expiry and today <= expiry <= five_years and assisted_units > 0:
            entry['expiringProperties'].append({
                'name': str(prop_name),
                'address': str(address),
                'units': assisted_units,
                'contractEnd': expiry,
            })

    if skipped:
        print(f'  ({skipped} features skipped — no geometry)')

    # Sort expiring properties by date ascending
    for entry in nbh_map.values():
        entry['expiringProperties'].sort(key=lambda x: x['contractEnd'])

    print(f'\nResults: {len(nbh_map)} neighborhoods with HUD-assisted housing')
    for key, entry in sorted(nbh_map.items(), key=lambda x: -x[1]['totalAssistedUnits'])[:10]:
        print(f'  {entry["name"]}: {entry["totalAssistedUnits"]} units across {entry["propertyCount"]} properties')

    # Write output
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, 'w') as f:
        json.dump(nbh_map, f, indent=2)
    print(f'\nWrote {OUT_FILE}')


if __name__ == '__main__':
    main()
