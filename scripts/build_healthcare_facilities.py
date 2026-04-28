#!/usr/bin/env python3
"""
build_healthcare_facilities.py — Pre-build healthcare facility data for Cincinnati.

Generates: public/data/healthcare_facilities.json

Sources (in priority order):
  1. OpenStreetMap via Overpass API  — hospitals, urgent care, clinics, dentists,
                                       pharmacies, mental health centers
  2. HRSA Health Center Finder       — Federally Qualified Health Centers (FQHCs)
  3. SAMHSA Treatment Locator        — substance use + behavioral health treatment

Output is a flat JSON array of facility objects. Each object:
  {
    "name":     string,
    "type":     "hospital" | "urgent_care" | "clinic" | "dentist" | "pharmacy"
                | "mental_health" | "substance_use" | "fqhc",
    "category": human-readable label,
    "address":  string (optional),
    "phone":    string (optional),
    "lat":      float,
    "lon":      float,
    "source":   "openstreetmap" | "hrsa" | "samhsa",
    "fqhc":     bool   (true = federally qualified health center)
  }

Run:
    pip install requests --break-system-packages
    python3 scripts/build_healthcare_facilities.py

Deduplication: facilities within 50m of each other with the same type are merged.
HRSA and SAMHSA records take precedence over OSM records for the same location.
"""

import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

# ── Output ────────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
ROOT_DIR   = SCRIPT_DIR.parent
OUT_FILE   = ROOT_DIR / 'public' / 'data' / 'healthcare_facilities.json'

# ── Cincinnati bounding box (WGS84) ──────────────────────────────────────────
# Wide enough to cover all 52 SNA neighborhoods + immediate suburbs
BBOX = {'south': 38.98, 'west': -84.85, 'north': 39.35, 'east': -84.25}
CENTER_LAT = 39.1031
CENTER_LON = -84.5120

# ── Type mapping ─────────────────────────────────────────────────────────────

CATEGORY_LABELS = {
    'hospital':       'Hospital',
    'urgent_care':    'Urgent Care',
    'clinic':         'Health Clinic',
    'dentist':        'Dental',
    'pharmacy':       'Pharmacy',
    'mental_health':  'Mental Health',
    'substance_use':  'Substance Use Treatment',
    'fqhc':           'Federally Qualified Health Center (FQHC)',
}

# OSM amenity/healthcare tag → our type
OSM_TYPE_MAP = {
    # amenity tags
    'hospital':           'hospital',
    'clinic':             'clinic',
    'doctors':            'clinic',
    'dentist':            'dentist',
    'pharmacy':           'pharmacy',
    'urgent_care':        'urgent_care',
    'social_facility':    'clinic',     # refine below by social_facility:for
    # healthcare tags
    'doctor':             'clinic',
    'centre':             'clinic',
    'hospital':           'hospital',
    'clinic':             'clinic',
    'dentist':            'dentist',
    'pharmacy':           'pharmacy',
    'rehabilitation':     'substance_use',
    'counselling':        'mental_health',
    'mental_health':      'mental_health',
    'psychotherapist':    'mental_health',
    'alternative':        'clinic',
    'blood_bank':         'clinic',
    'birthing_center':    'clinic',
    'laboratory':         'clinic',
    'optometrist':        'clinic',
    'physiotherapist':    'clinic',
    'podiatrist':         'clinic',
    'sample_collection':  'clinic',
    'hospice':            'clinic',
    'dialysis':           'clinic',
    'nursing_home':       'clinic',
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres."""
    R = 6371000.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def clean_name(raw: Optional[str]) -> str:
    if not raw:
        return ''
    return raw.strip()


def fetch_url(url: str, data: Optional[bytes] = None, timeout: int = 30) -> Optional[bytes]:
    try:
        req = urllib.request.Request(
            url,
            data=data,
            headers={'User-Agent': 'CincinnatiCivicData/1.0 (https://cincinnati-civic-data.vercel.app)'},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except Exception as e:
        print(f'  ⚠ fetch failed: {e}', file=sys.stderr)
        return None


# ── Source 1: OpenStreetMap via Overpass API ──────────────────────────────────

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

OVERPASS_QUERY = f"""
[out:json][timeout:90];
(
  node["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy|urgent_care|social_facility)$"]
      ({BBOX['south']},{BBOX['west']},{BBOX['north']},{BBOX['east']});
  node["healthcare"]
      ({BBOX['south']},{BBOX['west']},{BBOX['north']},{BBOX['east']});
  way["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy|urgent_care|social_facility)$"]
      ({BBOX['south']},{BBOX['west']},{BBOX['north']},{BBOX['east']});
  way["healthcare"]
      ({BBOX['south']},{BBOX['west']},{BBOX['north']},{BBOX['east']});
  relation["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy|urgent_care|social_facility)$"]
      ({BBOX['south']},{BBOX['west']},{BBOX['north']},{BBOX['east']});
  relation["healthcare"]
      ({BBOX['south']},{BBOX['west']},{BBOX['north']},{BBOX['east']});
);
out center tags;
"""


def classify_osm(tags: dict) -> str:
    amenity   = tags.get('amenity', '')
    healthcare = tags.get('healthcare', '')

    # FQHC detection from OSM tags
    if tags.get('healthcare:speciality', '') == 'community_health_centre':
        return 'fqhc'
    if 'fqhc' in tags.get('name', '').lower():
        return 'fqhc'
    if 'federally qualified' in tags.get('name', '').lower():
        return 'fqhc'

    # Mental health keywords in name
    name_lc = tags.get('name', '').lower()
    if any(k in name_lc for k in ['mental health', 'behavioral health', 'behaviour', 'counseling', 'counselling', 'psychiatr', 'psycholog']):
        return 'mental_health'
    if any(k in name_lc for k in ['substance', 'addiction', 'recovery', 'detox', 'rehabilitation', 'rehab', 'sober']):
        return 'substance_use'

    # Tag-based classification
    raw = healthcare or amenity
    t = OSM_TYPE_MAP.get(raw, '')
    if t:
        return t

    # Social facility refinement
    if amenity == 'social_facility':
        sf_for = tags.get('social_facility:for', '')
        if 'mental_health' in sf_for or 'disabled' in sf_for:
            return 'mental_health'
        if 'drug_addicts' in sf_for or 'alcohol' in sf_for:
            return 'substance_use'

    return 'clinic'  # default


def fetch_osm() -> list[dict]:
    print('Querying OpenStreetMap via Overpass API…')
    body = OVERPASS_QUERY.encode('utf-8')
    raw = fetch_url(OVERPASS_URL, data=body, timeout=90)
    if not raw:
        print('  ERROR: Overpass query failed', file=sys.stderr)
        return []

    data = json.loads(raw)
    elements = data.get('elements', [])
    print(f'  → {len(elements)} OSM elements returned')

    facilities = []
    for el in elements:
        tags = el.get('tags', {})
        name = clean_name(tags.get('name', ''))
        if not name:
            continue  # skip unnamed facilities

        # Extract lat/lon — nodes have direct coords; ways/relations have center
        if el['type'] == 'node':
            lat, lon = el.get('lat'), el.get('lon')
        else:
            center = el.get('center', {})
            lat, lon = center.get('lat'), center.get('lon')

        if lat is None or lon is None:
            continue

        fac_type = classify_osm(tags)
        address_parts = [
            tags.get('addr:housenumber', ''),
            tags.get('addr:street', ''),
            tags.get('addr:city', ''),
            tags.get('addr:state', ''),
        ]
        address = ' '.join(p for p in address_parts if p).strip()

        facilities.append({
            'name':     name,
            'type':     fac_type,
            'category': CATEGORY_LABELS.get(fac_type, 'Health Facility'),
            'address':  address or None,
            'phone':    tags.get('phone', tags.get('contact:phone', None)),
            'website':  tags.get('website', tags.get('contact:website', None)),
            'lat':      round(lat, 6),
            'lon':      round(lon, 6),
            'source':   'openstreetmap',
            'fqhc':     fac_type == 'fqhc',
        })

    print(f'  → {len(facilities)} named OSM facilities parsed')
    return facilities


# ── Source 2: HRSA Health Center Finder ──────────────────────────────────────
# HRSA publishes FQHCs via their ArcGIS feature service.

HRSA_URL = (
    'https://services1.arcgis.com/3t5Q7r7GmV1sWYi3/arcgis/rest/services'
    '/HCsites/FeatureServer/0/query'
)


def fetch_hrsa() -> list[dict]:
    print('Querying HRSA Health Center Finder (FQHCs)…')
    params = urllib.parse.urlencode({
        'where':          "StateAbbreviation='OH'",
        'outFields':      'SiteName,SiteAddress,SiteCity,SiteState,SiteZipCode,SitePhoneNumber,Latitude,Longitude,BHSHSite',
        'geometry':       f"{BBOX['west']},{BBOX['south']},{BBOX['east']},{BBOX['north']}",
        'geometryType':   'esriGeometryEnvelope',
        'spatialRel':     'esriSpatialRelIntersects',
        'inSR':           '4326',
        'outSR':          '4326',
        'returnGeometry': 'false',
        'f':              'json',
        'resultRecordCount': 500,
    })
    raw = fetch_url(f'{HRSA_URL}?{params}', timeout=30)
    if not raw:
        print('  ⚠ HRSA query failed — skipping FQHC source', file=sys.stderr)
        return []

    data = json.loads(raw)
    if 'error' in data:
        print(f"  ⚠ HRSA API error: {data['error']}", file=sys.stderr)
        return []

    features = data.get('features', [])
    print(f'  → {len(features)} HRSA features returned')

    facilities = []
    for feat in features:
        attrs = feat.get('attributes', {})
        name = clean_name(attrs.get('SiteName', ''))
        if not name:
            continue

        lat = attrs.get('Latitude')
        lon = attrs.get('Longitude')
        if not lat or not lon:
            continue

        try:
            lat, lon = float(lat), float(lon)
        except (TypeError, ValueError):
            continue

        # Bounding-box filter (HRSA query is statewide OH)
        if not (BBOX['south'] <= lat <= BBOX['north'] and BBOX['west'] <= lon <= BBOX['east']):
            continue

        city  = attrs.get('SiteCity', '') or ''
        state = attrs.get('SiteState', '') or ''
        addr  = attrs.get('SiteAddress', '') or ''
        zipcd = attrs.get('SiteZipCode', '') or ''
        full_addr = f"{addr}, {city}, {state} {zipcd}".strip(', ')

        facilities.append({
            'name':     name,
            'type':     'fqhc',
            'category': CATEGORY_LABELS['fqhc'],
            'address':  full_addr or None,
            'phone':    attrs.get('SitePhoneNumber') or None,
            'website':  None,
            'lat':      round(lat, 6),
            'lon':      round(lon, 6),
            'source':   'hrsa',
            'fqhc':     True,
        })

    print(f'  → {len(facilities)} HRSA FQHCs in bounding box')
    return facilities


# ── Source 3: SAMHSA Treatment Locator ───────────────────────────────────────
# SAMHSA's Behavioral Health Treatment Services Locator API

SAMHSA_URL = 'https://findtreatment.gov/locator/v1/facilities'

def fetch_samhsa() -> list[dict]:
    """Paginate through SAMHSA results within 30 miles of Cincinnati center."""
    print('Querying SAMHSA Treatment Locator (behavioral health)…')
    all_facilities = []
    page = 1
    max_pages = 10

    while page <= max_pages:
        params = urllib.parse.urlencode({
            'sType': 'SA',       # substance abuse
            'lat':   CENTER_LAT,
            'lng':   CENTER_LON,
            'dist':  30,         # miles
            'page':  page,
            'pageSize': 100,
        })
        raw = fetch_url(f'{SAMHSA_URL}?{params}', timeout=30)
        if not raw:
            break

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            break

        rows = data.get('rows', [])
        if not rows:
            break

        for row in rows:
            name = clean_name(row.get('name1', '') or row.get('name2', ''))
            if not name:
                continue
            lat = row.get('latitude') or row.get('lat')
            lon = row.get('longitude') or row.get('lng') or row.get('lon')
            if not lat or not lon:
                continue
            try:
                lat, lon = float(lat), float(lon)
            except (TypeError, ValueError):
                continue

            # Only keep if within bounding box
            if not (BBOX['south'] <= lat <= BBOX['north'] and BBOX['west'] <= lon <= BBOX['east']):
                continue

            # Classify: mental health vs substance use
            services = str(row.get('services', '') or row.get('type1', '') or '').lower()
            name_lc  = name.lower()
            if any(k in name_lc or k in services for k in ['mental health', 'behavioral', 'psychiatr', 'counseling']):
                fac_type = 'mental_health'
            else:
                fac_type = 'substance_use'

            addr_parts = [
                row.get('street1', ''), row.get('street2', ''),
                row.get('city', ''), row.get('state', ''), row.get('zip', ''),
            ]
            address = ', '.join(p for p in addr_parts if p).strip(', ')

            all_facilities.append({
                'name':     name,
                'type':     fac_type,
                'category': CATEGORY_LABELS.get(fac_type, 'Treatment Facility'),
                'address':  address or None,
                'phone':    row.get('phone') or None,
                'website':  row.get('website') or None,
                'lat':      round(lat, 6),
                'lon':      round(lon, 6),
                'source':   'samhsa',
                'fqhc':     False,
            })

        total = data.get('totalCount', 0) or data.get('total', 0)
        fetched = (page - 1) * 100 + len(rows)
        print(f'  → Page {page}: {len(rows)} rows (total reported: {total})')
        if fetched >= total or len(rows) < 100:
            break
        page += 1
        time.sleep(0.3)

    # Also query for mental health type
    print('  Querying SAMHSA for mental health facilities…')
    page = 1
    while page <= max_pages:
        params = urllib.parse.urlencode({
            'sType': 'MH',       # mental health
            'lat':   CENTER_LAT,
            'lng':   CENTER_LON,
            'dist':  30,
            'page':  page,
            'pageSize': 100,
        })
        raw = fetch_url(f'{SAMHSA_URL}?{params}', timeout=30)
        if not raw:
            break

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            break

        rows = data.get('rows', [])
        if not rows:
            break

        for row in rows:
            name = clean_name(row.get('name1', '') or row.get('name2', ''))
            if not name:
                continue
            lat = row.get('latitude') or row.get('lat')
            lon = row.get('longitude') or row.get('lng') or row.get('lon')
            if not lat or not lon:
                continue
            try:
                lat, lon = float(lat), float(lon)
            except (TypeError, ValueError):
                continue
            if not (BBOX['south'] <= lat <= BBOX['north'] and BBOX['west'] <= lon <= BBOX['east']):
                continue

            addr_parts = [
                row.get('street1', ''), row.get('street2', ''),
                row.get('city', ''), row.get('state', ''), row.get('zip', ''),
            ]
            address = ', '.join(p for p in addr_parts if p).strip(', ')

            all_facilities.append({
                'name':     name,
                'type':     'mental_health',
                'category': CATEGORY_LABELS['mental_health'],
                'address':  address or None,
                'phone':    row.get('phone') or None,
                'website':  row.get('website') or None,
                'lat':      round(lat, 6),
                'lon':      round(lon, 6),
                'source':   'samhsa',
                'fqhc':     False,
            })

        total = data.get('totalCount', 0) or data.get('total', 0)
        fetched = (page - 1) * 100 + len(rows)
        if fetched >= total or len(rows) < 100:
            break
        page += 1
        time.sleep(0.3)

    print(f'  → {len(all_facilities)} SAMHSA facilities in bounding box')
    return all_facilities


# ── Deduplication ─────────────────────────────────────────────────────────────

DEDUP_RADIUS_M = 50  # facilities within 50m with same type → merge

def deduplicate(facilities: list[dict]) -> list[dict]:
    """
    Remove near-duplicate facilities. Priority: hrsa > samhsa > openstreetmap.
    Within same source, keep first seen.
    """
    source_priority = {'hrsa': 0, 'samhsa': 1, 'openstreetmap': 2}

    # Sort: higher priority sources first
    facilities.sort(key=lambda f: source_priority.get(f['source'], 99))

    kept: list[dict] = []
    for fac in facilities:
        is_dup = False
        for k in kept:
            if fac['type'] != k['type']:
                continue
            dist = haversine_m(fac['lat'], fac['lon'], k['lat'], k['lon'])
            if dist < DEDUP_RADIUS_M:
                is_dup = True
                break
        if not is_dup:
            kept.append(fac)

    return kept


# ── Filter out low-value types that clutter the map ──────────────────────────

EXCLUDED_NAMES = re.compile(
    r'\b(veterinar|vet clinic|pet|animal hospital|optical|vision|eye care|'
    r'dermatolog|cosmetic|plastic surgery|laser|spa|massage|chiropractic|'
    r'acupuncture|holistic|hair|nail|beauty|tattoo)\b',
    re.IGNORECASE,
)


def filter_facilities(facilities: list[dict]) -> list[dict]:
    out = []
    for f in facilities:
        name = f.get('name', '')
        if EXCLUDED_NAMES.search(name):
            continue
        out.append(f)
    return out


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    all_fac: list[dict] = []

    # Source 1: OpenStreetMap
    osm = fetch_osm()
    all_fac.extend(osm)
    time.sleep(1)

    # Source 2: HRSA (FQHCs)
    hrsa = fetch_hrsa()
    all_fac.extend(hrsa)
    time.sleep(0.5)

    # Source 3: SAMHSA (substance use + mental health treatment)
    samhsa = fetch_samhsa()
    all_fac.extend(samhsa)

    print(f'\nTotal before dedup/filter: {len(all_fac)}')

    # Filter
    all_fac = filter_facilities(all_fac)
    print(f'After name filter: {len(all_fac)}')

    # Deduplicate
    all_fac = deduplicate(all_fac)
    print(f'After dedup: {len(all_fac)}')

    # Summary by type
    by_type: dict[str, int] = {}
    for f in all_fac:
        by_type[f['type']] = by_type.get(f['type'], 0) + 1
    print('\nBy type:')
    for t, count in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f'  {CATEGORY_LABELS.get(t, t)}: {count}')

    # Sort by type then name for deterministic output
    all_fac.sort(key=lambda f: (f['type'], f['name']))

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, 'w') as fp:
        json.dump(all_fac, fp, indent=2)

    print(f'\n✓ Wrote {len(all_fac)} facilities → {OUT_FILE}')


if __name__ == '__main__':
    main()
