#!/usr/bin/env python3
"""
build_lead.py — Pre-compute GCWW lead service line replacement program status by neighborhood.

Generates: public/data/lead_service_lines.json
Format:    { "<stripped_neighborhood_key>": { NeighborhoodLeadStats }, ... }

Run this locally before deploying:
    python3 scripts/build_lead.py

Requires: requests (pip install requests)

── Confirmed Data Source (as of March 2026) ──────────────────────────────────

Dataset: b4xq-u3su — "GCWW Private-Side One-off Lead Service Line Replacement"
URL: https://data.cincinnati-oh.gov/dataset/GCWW-Private-Side-One-off-Lead-Service-Line-Replac/b4xq-u3su

Confirmed fields (from live API, 2026-03-28):
  address            — street address
  status             — replacement program status (see STATUS VALUES below)
  emergency          — emergency flag
  replacement        — additional replacement flag/type
  adminarea          — SNA neighborhood name (ALL CAPS in source, e.g. "OVER-THE-RHINE")
  municipality       — city/municipality name
  privatematerialtype — private-side pipe material (see MATERIAL CODES below)
  publicmaterialtype  — public-side pipe material (same codes)
  publicreplacedate   — date the public-side was replaced (ISO 8601)
  gis_branchnumber    — internal GIS branch identifier

NOTE: ntfu-vnkd returns 403 (requires authentication). b4xq-u3su is the correct UID.

── IMPORTANT: Dataset Scope ──────────────────────────────────────────────────

This dataset is NOT the full city-wide service line inventory. It contains
~6,400 lines that GCWW has evaluated and enrolled in the replacement program.
Cincinnati's full inventory of lead/unknown lines is much larger (~33,449).

The tab uses this data to show *replacement program activity and progress*
per neighborhood — not a complete risk census. This distinction is disclosed
in the UI.

── Material Type Codes (privatematerialtype) ─────────────────────────────────

  PB    — Lead (Latin: plumbum) — HIGH RISK
  LDNR  — Lead, Do Not Replace (lead material, no active replacement scheduled)
  CU    — Copper — SAFE
  BR    — Brass — generally safe, may contain minor lead in older fixtures
  GS    — Galvanized Steel — corrosion concern
  DI    — Ductile Iron — safe
  CI    — Cast Iron — safe
  null  — Unknown material

── Status Values ─────────────────────────────────────────────────────────────

  Complete                  — Work done. For lead lines: replaced. For CU: confirmed safe.
  Do Not Replace            — Assessed; no replacement action required (usually CU lines)
  Notice To Proceed Sent    — Contractor notified; replacement in active pipeline
  Owner Accepted            — Homeowner accepted the replacement agreement
  Pending Owner Acceptance  — Awaiting homeowner response
  Pending Quote             — Getting contractor quotes

── Classification Logic ──────────────────────────────────────────────────────

  lead       — PB or LDNR + status is NOT 'Complete' (active lead risk in program)
  replaced   — PB or LDNR + status IS 'Complete' (lead line successfully replaced)
  copper     — CU, DI, CI, BR (confirmed non-lead material, any status)
  galvanized — GS (any status)
  unknown    — null or unrecognized codes

  'total' includes all five categories.

  NOTE: CU lines with 'Complete' status are confirmed-safe inspections, not
  replacements — they are counted under 'copper', not 'replaced'.

── Output Schema ──────────────────────────────────────────────────────────────

{
  "overtherine": {
    "name": "Over-The-Rhine",          ← Title-Cased from ALL CAPS adminarea
    "total": 156,
    "lead": 12,                        ← PB/LDNR lines still pending replacement
    "unknown": 3,
    "galvanized": 2,
    "copper": 89,                      ← CU/safe lines in the program
    "replaced": 50,                    ← PB/LDNR lines successfully replaced
    "asOf": "2026-03-28"
  },
  ...
}

Keys use stripNeighborhoodName() logic: lowercase, alphanumeric only.
"""

import json
import re
import sys
from collections import defaultdict
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
DATASET_UID = "b4xq-u3su"
TODAY = date.today().isoformat()

# ── Material type classification ───────────────────────────────────────────────

# Lead material codes — lines that are/were lead and may expose residents
LEAD_CODES = {'PB', 'LDNR'}

# Confirmed safe (non-lead) material codes
SAFE_CODES = {'CU', 'DI', 'CI', 'BR'}

# Galvanized steel — corrosion/interaction concern, tracked separately
GALV_CODES = {'GS'}

# Replacement-complete status strings (case-insensitive exact match)
COMPLETE_STATUSES = {'complete'}

# ── Helpers ────────────────────────────────────────────────────────────────────

def strip_name(name: str) -> str:
    """Matches stripNeighborhoodName() in src/utils/api.ts"""
    return re.sub(r'[^a-z0-9]', '', name.lower())

def fetch_soda_all(uid: str, select_fields: str, page_size: int = 50000) -> list[dict]:
    """Fetch all records from a Socrata dataset (handles pagination)."""
    all_records = []
    offset = 0
    while True:
        params = {
            "$select": select_fields,
            "$limit": page_size,
            "$offset": offset,
        }
        url = f"{SODA_BASE}/{uid}.json"
        resp = requests.get(url, params=params, timeout=60)
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        all_records.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
        print(f"  ... fetched {len(all_records):,} records so far")
    return all_records

def classify_record(row: dict) -> str:
    """
    Return classification bucket for a single service line record.

    Logic:
      - Lead material (PB/LDNR) + Complete status → 'replaced' (was lead, now done)
      - Lead material (PB/LDNR) + any other status → 'lead' (active lead risk)
      - Galvanized (GS) → 'galvanized'
      - Safe material (CU/DI/CI/BR) → 'copper'
      - Anything else (null, unrecognized) → 'unknown'
    """
    mat = (row.get('privatematerialtype') or '').strip().upper()
    status = (row.get('status') or '').strip().lower()

    if mat in LEAD_CODES:
        if status in COMPLETE_STATUSES:
            return 'replaced'   # Lead line that was successfully replaced
        else:
            return 'lead'       # Active lead risk — still in the ground or pending
    elif mat in GALV_CODES:
        return 'galvanized'
    elif mat in SAFE_CODES:
        return 'copper'
    else:
        return 'unknown'        # Null or unknown material code

# ── Main logic ─────────────────────────────────────────────────────────────────

def build_inventory() -> dict:
    print(f"\n[Step 1] Fetching sample to confirm field values…")
    sample = fetch_soda_all(DATASET_UID, "adminarea,privatematerialtype,status,publicreplacedate", 5)
    if sample:
        for i, r in enumerate(sample[:3]):
            print(f"  Record {i}: adminarea={r.get('adminarea')!r:25s} "
                  f"mat={r.get('privatematerialtype')!r:8s} "
                  f"status={r.get('status')!r:30s}")
    else:
        print("  No records returned. Cannot continue.")
        return {}

    print(f"\n[Step 2] Fetching full dataset…")
    records = fetch_soda_all(
        DATASET_UID,
        "adminarea,privatematerialtype,status,publicreplacedate"
    )
    print(f"  Total records: {len(records):,}")

    if not records:
        print("  No records returned.")
        return {}

    # ── Diagnostic: count all material and status values ──────────────────────
    mat_counts: dict[str, int] = defaultdict(int)
    status_counts: dict[str, int] = defaultdict(int)
    for r in records:
        mat = (r.get('privatematerialtype') or 'null').strip().upper()
        status = (r.get('status') or 'null').strip()
        mat_counts[mat] += 1
        status_counts[status] += 1

    print(f"\n  privatematerialtype values (with classification):")
    for v, cnt in sorted(mat_counts.items(), key=lambda x: -x[1]):
        if v in LEAD_CODES:
            label = '→ LEAD'
        elif v in SAFE_CODES:
            label = '→ copper/safe'
        elif v in GALV_CODES:
            label = '→ galvanized'
        else:
            label = '→ unknown'
        print(f"    {v!r:12s} {cnt:6,}  {label}")

    print(f"\n  status values:")
    for v, cnt in sorted(status_counts.items(), key=lambda x: -x[1]):
        print(f"    {v!r:35s} {cnt:6,}")

    # ── Aggregate by neighborhood ─────────────────────────────────────────────
    print(f"\n[Step 3] Aggregating by neighborhood…")
    nd: dict[str, dict] = defaultdict(lambda: {
        'lead': 0, 'replaced': 0, 'copper': 0, 'galvanized': 0, 'unknown': 0,
        'total': 0, '_raw_name': '',
    })
    skipped = 0

    for r in records:
        area = (r.get('adminarea') or '').strip()
        if not area or area.upper() in ('N/A', 'NULL', 'UNKNOWN', ''):
            skipped += 1
            continue
        key = strip_name(area)
        bucket = classify_record(r)
        nd[key]['_raw_name'] = area
        nd[key]['total'] += 1
        nd[key][bucket] += 1

    if skipped:
        print(f"  Skipped {skipped:,} records with no adminarea")

    print(f"  Found {len(nd)} distinct neighborhoods")
    print(f"\n  Classification totals:")
    total_lead     = sum(v['lead']      for v in nd.values())
    total_replaced = sum(v['replaced']  for v in nd.values())
    total_copper   = sum(v['copper']    for v in nd.values())
    total_galv     = sum(v['galvanized']for v in nd.values())
    total_unk      = sum(v['unknown']   for v in nd.values())
    print(f"    lead (active):  {total_lead:,}")
    print(f"    replaced:       {total_replaced:,}")
    print(f"    copper/safe:    {total_copper:,}")
    print(f"    galvanized:     {total_galv:,}")
    print(f"    unknown:        {total_unk:,}")

    print(f"\n  Top 15 neighborhoods by active lead lines:")
    top = sorted(nd.items(), key=lambda x: -x[1]['lead'])[:15]
    for key, data in top:
        if data['lead'] == 0:
            break
        pct = data['lead'] / data['total'] * 100 if data['total'] else 0
        print(f"    {data['_raw_name']:30s} lead={data['lead']:4d}  total={data['total']:4d}  ({pct:.0f}%)")

    # ── Convert to output format ───────────────────────────────────────────────
    result = {}
    for key, data in nd.items():
        raw_name = data['_raw_name']
        # Convert ALL-CAPS adminarea to Title Case (matches SNA name conventions)
        # Special cases: acronyms that should stay uppercase
        ACRONYM_NAMES = {'CUF'}
        display_name = raw_name if raw_name in ACRONYM_NAMES else raw_name.title()
        result[key] = {
            "name": display_name,
            "total": data['total'],
            "lead": data['lead'],
            "unknown": data['unknown'],
            "galvanized": data['galvanized'],
            "copper": data['copper'],
            "replaced": data['replaced'],
            "asOf": TODAY,
        }

    return result

# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("GCWW Lead Service Line Replacement Program Build Script")
    print(f"Dataset: {DATASET_UID}")
    print(f"Output:  {OUTPUT_PATH}")
    print("=" * 60)
    print()
    print("IMPORTANT: This dataset covers ~6,400 lines in the replacement")
    print("program, NOT Cincinnati's full inventory of ~33,449 lead/unknown")
    print("lines. The tab discloses this scope limitation.")

    result = {}
    try:
        result = build_inventory()
    except requests.HTTPError as e:
        print(f"\n[ERROR] HTTP error: {e}")
    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback; traceback.print_exc()

    if not result:
        print("\n[WARN] No data to write.")
        result = {}

    result = dict(sorted(result.items()))

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(result, f, indent=2)

    lead_total     = sum(v['lead']      for v in result.values())
    replaced_total = sum(v['replaced']  for v in result.values())
    copper_total   = sum(v['copper']    for v in result.values())

    print(f"\n✅ Wrote {len(result)} neighborhoods to {OUTPUT_PATH}")
    print(f"   Active lead risk:  {lead_total:,} lines")
    print(f"   Successfully replaced: {replaced_total:,} lines")
    print(f"   Confirmed safe (copper): {copper_total:,} lines")

    if result:
        sample_key = next(iter(result))
        print(f"\nSample ({sample_key}):")
        print(json.dumps(result[sample_key], indent=2))

    print("\nNext steps:")
    print("  1. Review 'Top 15 neighborhoods by active lead lines' above")
    print("  2. Verify adminarea→SNA name mapping looks correct")
    print("  3. Commit public/data/lead_service_lines.json")
    print("  4. Push to Vercel")


if __name__ == "__main__":
    main()
