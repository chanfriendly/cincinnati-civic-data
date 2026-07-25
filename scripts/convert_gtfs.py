"""
convert_gtfs.py — Convert a SORTA GTFS export into public/data/sorta_stops.json.

Usage:
    1. Download the latest GTFS feed:
       curl -o google_transit.zip https://www.go-metro.com/transitdata/google_transit.zip
    2. Unzip it (needs stops.txt):
       unzip -o google_transit.zip -d gtfs/
    3. Run:
       python3 scripts/convert_gtfs.py gtfs/stops.txt

Output shape (matches the existing file exactly):
    [{"stop_id": "...", "stop_name": "...", "stop_lat": 39.2, "stop_lon": -84.4, "routes": []}]

Note on `routes`: SORTA's public GTFS export does not carry route assignments at
stop level, and the app deliberately scores transit by stop *count*, not route
count (see CHANGELOG "SORTA route data"). `routes` is kept as an empty array for
schema stability. If you want to populate it, join stop_times.txt → trips.txt →
routes.txt — but nothing in the UI requires it.

No third-party dependencies (stdlib csv/json only).
"""

import csv
import json
import sys
from pathlib import Path

OUTPUT = Path(__file__).resolve().parent.parent / 'public' / 'data' / 'sorta_stops.json'


def main() -> None:
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(1)

    stops_txt = Path(sys.argv[1])
    if not stops_txt.exists():
        print(f'Error: {stops_txt} not found. Unzip the GTFS feed first.')
        sys.exit(1)

    stops = []
    with open(stops_txt, newline='', encoding='utf-8-sig') as f:
        for row in csv.DictReader(f):
            try:
                stops.append({
                    'stop_id': row['stop_id'].strip(),
                    'stop_name': row['stop_name'].strip(),
                    'stop_lat': float(row['stop_lat']),
                    'stop_lon': float(row['stop_lon']),
                    'routes': [],
                })
            except (KeyError, ValueError) as e:
                print(f'Skipping malformed row {row.get("stop_id", "?")}: {e}')

    if len(stops) < 1000:
        print(f'Error: only {len(stops)} stops parsed — expected ~3,700. '
              'Refusing to overwrite the existing file with a suspiciously small export.')
        sys.exit(1)

    stops.sort(key=lambda s: s['stop_id'])
    with open(OUTPUT, 'w', encoding='utf-8') as f:
        json.dump(stops, f, ensure_ascii=False, separators=(',', ':'))
    print(f'Wrote {len(stops)} stops to {OUTPUT}')


if __name__ == '__main__':
    main()
