#!/usr/bin/env python3
"""
build_parks.py — Pre-compute park acreage per Cincinnati neighborhood from CAGIS.

Output: public/data/cagis_neighborhood_parks.json

This eliminates the 52 sequential CAGIS API calls that the Neighborhood Explorer
currently makes at runtime (one per neighborhood), which causes a 30–60 second
delay before park scores appear. Instead, this script runs once and writes a
static JSON file that the browser reads instantly.

Usage:
    python3 scripts/build_parks.py

The script:
1. Fetches the Cincinnati SNA GeoJSON to get neighborhood polygons and centroids
2. Queries CAGIS FeatureServer/34 for all Hamilton County parks (excluding schools,
   cemeteries, and private/commercial facilities)
3. For each park, finds which SNA neighborhood its centroid falls within using
   a point-in-polygon test against the SNA boundaries
4. Aggregates park count and total SHAPE__Area per neighborhood
5. Writes results to public/data/cagis_neighborhood_parks.json

The output format matches what NeighborhoodExplorer/index.tsx expects:
  {
    "overtherine": { "parkCount": 12, "totalArea": 45000.0 },
    "hydeparkobryonville": { ... },
    ...
  }

Keys are normalized neighborhood names (lowercase, alphanumeric only) matching
the stripNeighborhoodName() function in src/utils/api.ts.

CAGIS layer 34 fields confirmed:
    OBJECTID, NAME, SHORT_NAME, PARKTYPE, COUNTY, SHOW, GLOBALID, SHAPE__Area, SHAPE__Length
    (No ACREAGE field — use SHAPE__Area for relative park access scoring)

PARKTYPE values excluded (non-public, non-recreational):
    'Schools-Private', 'Schools-Public', 'Cemetery', 'Private Commercial',
    'Clubs-Members Only', 'Other Private'

Network note: This script makes external HTTPS requests to CAGIS (arcgis.com)
and opendata.arcgis.com. Run locally — these endpoints are accessible from most
networks but may be rate-limited if called too rapidly.
"""

import json
import math
import os
import sys
import time
import urllib.request
import urllib.error
from typing import Optional

# ── Config ─────────────────────────────────────────────────────────────────────

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "../public/data/cagis_neighborhood_parks.json")
SNA_GEOJSON_URL = "https://opendata.arcgis.com/datasets/572561553c9e4d618d2d7939c5261d46_0.geojson"

# CAGIS Hamilton County Parks & Greenspace — FeatureServer/34
# Request all features in a single call (there are ~754 features in this layer).
PARKS_URL = (
    "https://services.arcgis.com/JyZag7oO4NteHGiq/arcgis/rest/services/OpenData/FeatureServer/34/query"
    "?where=PARKTYPE+NOT+IN+('Schools-Private','Schools-Public','Cemetery','Private+Commercial',"
    "'Clubs-Members+Only','Other+Private')"
    "&outFields=NAME,PARKTYPE,SHAPE__Area"
    "&geometryType=esriGeometryPoint"
    "&returnGeometry=true"
    "&outSR=4326"
    "&f=geojson"
    "&resultRecordCount=2000"
)

# ── Helpers ─────────────────────────────────────────────────────────────────────

def strip_name(name: str) -> str:
    """Normalize a neighborhood name to lowercase alphanumeric — matches
    stripNeighborhoodName() in src/utils/api.ts."""
    return ''.join(c.lower() for c in name if c.isalnum())


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "cincinnati-civic-data/build-parks"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())


def point_in_polygon(px: float, py: float, polygon: list) -> bool:
    """Ray-casting point-in-polygon test.
    polygon is a list of [lng, lat] coordinate pairs forming a closed ring.
    """
    n = len(polygon)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i][0], polygon[i][1]
        xj, yj = polygon[j][0], polygon[j][1]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def get_park_centroid(geometry: dict) -> Optional[tuple]:
    """Extract centroid (lng, lat) from a GeoJSON geometry."""
    gtype = geometry.get("type", "")
    coords = geometry.get("coordinates")
    if not coords:
        return None
    if gtype == "Point":
        return (coords[0], coords[1])
    if gtype == "Polygon":
        ring = coords[0]
        if not ring:
            return None
        lng = sum(c[0] for c in ring) / len(ring)
        lat = sum(c[1] for c in ring) / len(ring)
        return (lng, lat)
    if gtype == "MultiPolygon":
        # Use centroid of first polygon
        ring = coords[0][0]
        if not ring:
            return None
        lng = sum(c[0] for c in ring) / len(ring)
        lat = sum(c[1] for c in ring) / len(ring)
        return (lng, lat)
    return None


def find_neighborhood_for_point(lng: float, lat: float, sna_features: list) -> Optional[str]:
    """Return the normalized SNA neighborhood name containing (lng, lat),
    or None if no polygon contains the point."""
    for feature in sna_features:
        geom = feature.get("geometry", {})
        props = feature.get("properties", {})
        name = props.get("SNA_NAME") or props.get("NBRHD_NAME") or props.get("NAME") or ""
        if not name:
            continue
        gtype = geom.get("type", "")
        coords = geom.get("coordinates", [])
        if gtype == "Polygon":
            for ring in coords:
                if point_in_polygon(lng, lat, ring):
                    return strip_name(name)
        elif gtype == "MultiPolygon":
            for poly in coords:
                for ring in poly:
                    if point_in_polygon(lng, lat, ring):
                        return strip_name(name)
    return None


def haversine_miles(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 3958.8  # Earth radius in miles
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def get_sna_centroid(feature: dict) -> Optional[tuple]:
    """Get (lat, lng) centroid for an SNA GeoJSON feature."""
    geom = feature.get("geometry", {})
    gtype = geom.get("type", "")
    coords = geom.get("coordinates", [])
    if gtype == "Polygon":
        ring = coords[0]
        lng = sum(c[0] for c in ring) / len(ring)
        lat = sum(c[1] for c in ring) / len(ring)
        return (lat, lng)
    elif gtype == "MultiPolygon":
        ring = coords[0][0]
        lng = sum(c[0] for c in ring) / len(ring)
        lat = sum(c[1] for c in ring) / len(ring)
        return (lat, lng)
    return None


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("→ Fetching Cincinnati SNA neighborhood boundaries…")
    try:
        sna_data = fetch_json(SNA_GEOJSON_URL)
    except Exception as e:
        print(f"  ERROR: Could not fetch SNA GeoJSON: {e}", file=sys.stderr)
        sys.exit(1)

    sna_features = sna_data.get("features", [])
    print(f"  ✓ Loaded {len(sna_features)} neighborhood polygons")

    # Build a lookup of normalized name → centroid for the nearest-centroid fallback
    sna_centroids: dict[str, tuple] = {}
    for feat in sna_features:
        props = feat.get("properties", {})
        name = props.get("SNA_NAME") or props.get("NBRHD_NAME") or props.get("NAME") or ""
        if name:
            centroid = get_sna_centroid(feat)
            if centroid:
                sna_centroids[strip_name(name)] = centroid

    print(f"\n→ Fetching parks from CAGIS FeatureServer/34…")
    try:
        parks_data = fetch_json(PARKS_URL)
    except Exception as e:
        print(f"  ERROR: Could not fetch parks data: {e}", file=sys.stderr)
        sys.exit(1)

    park_features = parks_data.get("features", [])
    print(f"  ✓ Loaded {len(park_features)} park features")

    # ── Aggregate parks per neighborhood ────────────────────────────────────────
    print(f"\n→ Assigning parks to neighborhoods (point-in-polygon)…")

    results: dict[str, dict] = {}
    unmatched = 0
    fallback_count = 0

    for i, feat in enumerate(park_features):
        props = feat.get("properties", {})
        geom = feat.get("geometry", {})
        area = float(props.get("SHAPE__Area") or 0)

        # Get the park centroid
        centroid = get_park_centroid(geom)
        if centroid is None:
            unmatched += 1
            continue

        lng, lat = centroid

        # Try point-in-polygon first
        nbhd_key = find_neighborhood_for_point(lng, lat, sna_features)

        # Fall back to nearest SNA centroid if PiP fails (park on boundary)
        if nbhd_key is None and sna_centroids:
            nearest_key = min(
                sna_centroids.keys(),
                key=lambda k: haversine_miles(lat, lng, sna_centroids[k][0], sna_centroids[k][1])
            )
            dist = haversine_miles(lat, lng, sna_centroids[nearest_key][0], sna_centroids[nearest_key][1])
            # Only use the fallback if the park is within 2 miles of a neighborhood centroid
            if dist < 2.0:
                nbhd_key = nearest_key
                fallback_count += 1

        if nbhd_key is None:
            unmatched += 1
            continue

        if nbhd_key not in results:
            results[nbhd_key] = {"parkCount": 0, "totalArea": 0.0}
        results[nbhd_key]["parkCount"] += 1
        results[nbhd_key]["totalArea"] += area

        if (i + 1) % 100 == 0:
            print(f"  … processed {i + 1}/{len(park_features)}")

    # Round totalArea to 2 decimal places for cleaner JSON
    for key in results:
        results[key]["totalArea"] = round(results[key]["totalArea"], 2)

    # ── Write output ────────────────────────────────────────────────────────────
    out_path = os.path.abspath(OUTPUT_PATH)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\n✓ Done.")
    print(f"  Neighborhoods with park data: {len(results)}")
    print(f"  Parks assigned via PiP:       {len(park_features) - unmatched - fallback_count}")
    print(f"  Parks assigned via fallback:  {fallback_count}")
    print(f"  Parks unmatched:              {unmatched}")
    print(f"  Output written to:            {out_path}")

    # Print a sample of results
    print("\n  Sample output (top 5 by park count):")
    top = sorted(results.items(), key=lambda x: x[1]["parkCount"], reverse=True)[:5]
    for key, val in top:
        print(f"    {key}: {val['parkCount']} parks, area={val['totalArea']:.0f}")


if __name__ == "__main__":
    main()
