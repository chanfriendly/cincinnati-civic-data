# Cincinnati Civic Platform — Claude Code Handoff

**Last updated:** March 2026
**Stack:** Vite + React 18 + TypeScript + Tailwind CSS + Leaflet + Recharts
**Dev server:** `npm run dev` → http://localhost:5173
**Deploy target:** Cloudflare Pages + Workers (see `worker/api-proxy.js`)

---

## Current State

The app has four working tabs. The sections below reflect the current state after two cowork sessions.

---

## Tab 1 — Address Lookup ✅ Working

**Working:**
- Mapbox geocoding autocomplete (`VITE_GEOCODING_API_KEY`)
- Leaflet map with address pin (CartoDB Positron tiles)
- Crime incidents via `within_circle` on both datasets
- Transit stop proximity (`/data/sorta_stops.json` — 3,743 stops)
- AI "Explain this record" summary via OpenRouter

**Four CAGIS cards (working, not yet live-tested against all Cincinnati addresses):**
- **Zoning** — `cagisonline.hamilton-co.org/arcgis/rest/services/Cincinnati/Cincinnati_LDC_Zoning/MapServer/4`
- **FEMA Flood Zone** — `hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28` (federal, very reliable)
- **Historic District** — tries `Cincinnati_Historic_Landmarks` MapServer first, falls back to ArcGIS item API for item `41203d41015d43c08d7354e57b7eee75`
- **Nearby Parks** — ArcGIS item API for item `f3a7a97236f54d9395db2b639787a5db`

**If any CAGIS card shows an error,** check the browser Network tab for the failing URL. Most likely issues:
1. Historic district: layer 3 may be wrong — try layer 0 in `fetchHistoricDistrict()`
2. Parks item API returns a non-FeatureServer URL — inspect `meta.url` in the response

**Known gap — building permits/inspections address filter:**
Currently uses `within_circle(location,...)` which requires a `location` geo_point field. If you see "No such column: location", switch to bounding box:
```ts
$where: `latitude_x >= ${lat-0.001} AND latitude_x <= ${lat+0.001} AND longitude_x >= ${lng-0.001} AND longitude_x <= ${lng+0.001}`
```

---

## Tab 2 — Neighborhood Profiles ⚠️ Partially working

**Working:**
- Crime (both datasets, correct `cpd_neighborhood` field, UPPER CASE values)
- Building Permits — shows real total via separate `count(*)` query (not capped at 500)
- Community Perceptions — Likert-scale averages computed from 8 city-wide survey columns
- Income & Housing — city-wide Cincinnati ACS 2022 averages (honest label + disclaimer)

**Community Perceptions note:**
Dataset `gdf4-fqik` has no neighborhood column — it is a city-wide resident survey. Columns like `overall_quality_of_life_in`, `overall_feeling_of_safety`, `police_services`, etc. hold numeric Likert ratings (1–5). The code fetches 1,000 rows and computes column averages. This is correctly labelled "City-Wide Survey" in the UI.

**Datasets that may 400 — field names unverified in live testing:**
All non-crime datasets use `neighborhood` in current code, queried with UPPER CASE values (matching CPD convention). The SODA metadata originally suggested `sna_neighborhood` for some of these datasets. If a section returns empty, fetch one record to confirm:
```
https://data.cincinnati-oh.gov/resource/{uid}.json?$limit=1
```
Then swap `neighborhood` → the correct field in `NeighborhoodProfiles/index.tsx`.

Datasets to check:
| Dataset | UID | Field used in code | Originally guessed |
|---|---|---|---|
| Building Permits | `uhjb-xac9` | `neighborhood` | — |
| Food Safety | `rg6p-b3h3` | `neighborhood` | `sna_neighborhood` |
| Tax Abatements | `tkp7-yf64` | `ccd_neigh` (Title Case) | — |
| PLAP | `pk9w-99n6` | `neighborhood` | `sna_neighborhood` |
| Fire & EMS | `vnsz-a3wp` | `neighborhood` | `sna_neighborhood` |

**Census data is city-wide (not per-neighborhood):**
`NeighborhoodProfiles/index.tsx` uses hardcoded 2022 ACS city-wide averages
(`medianHouseholdIncome: 43287`, `medianGrossRent: 996`, `rentBurdenRate: 0.47`).
The card is clearly labelled "Cincinnati City-Wide Averages" with a disclaimer.
Per-neighborhood Census data is computed in the Explorer tab (see Tab 4) but not wired up here.

---

## Tab 3 — Police Accountability ✅ Working

**Working well:**
- Traffic stops by race chart (correct colors, angled X-axis labels)
- Outcomes by Race table (`disposition_text` — correct field)
- Pedestrian stops
- Use of Force / OIS (frozen dataset notices display)
- Plain-English AI query

**Confirmed field names for `ktgf-4sjh` (traffic stops):**
- Date: `interview_date`
- Race: `race`
- Sex: `sex` (not `gender`)
- Outcome: `disposition_text` (not `action_taken`)
- District: `district`

**Known gap:**
Search rate by race is not shown (Cincinnati doesn't publish a "was searched" boolean field).

---

## Tab 4 — Neighborhood Explorer ✅ Mostly working

**All six scoring dimensions are now live with real data:**

| Dimension | Source | Status |
|---|---|---|
| Affordability | Census ACS 2022 (`/data/neighborhood_acs.json`) | ✅ Working |
| Income | Census ACS 2022 (`/data/neighborhood_acs.json`) | ✅ Working |
| Safety | CPD STARS `7aqy-xrv9` | ✅ Working |
| Transit Access | SORTA GTFS (`/data/sorta_stops.json`, 3,743 stops) | ✅ Working |
| Investment | Building Permits `uhjb-xac9` | ✅ Working |
| Public Maintenance | PLAP `pk9w-99n6` + Inspections `ivda-umw7` | ✅ Working |
| Park Access | CAGIS Parks & Greenspace (per centroid, 0.75 mi radius) | ⚠️ Needs live test |
| Flood Risk | FEMA NFHL (per centroid) | ⚠️ Needs live test |
| Schools | — | 🔒 Disabled (no open data) |

**Transit note:** Metric is bus stops within 0.4 miles of neighborhood centroid. The `sorta_stops.json` file has 3,743 SORTA stops. All stops in the file have `routes: []` (empty) — route-count-based scoring does not work; stop-count is used instead.

**Two new dimensions (load in background after GeoJSON):**
- **Park Access** (`parks`): ~52 sequential CAGIS API calls in batches of 8. Takes 30–60s to populate after GeoJSON loads. Metric: park acres within 0.75 mi / (population/1000).
- **Flood Risk** (`flood`): ~52 FEMA NFHL queries in batches of 10. Fast (federal service is reliable). Binary: centroid in SFHA or not.

**Map loading:**
The code tries four CAGIS GeoJSON URLs in sequence with 8-second timeouts. If all fail, the rest of the tab still functions (scoring, Top Neighborhoods, Detail Drawer).

Primary URL to test in the browser directly:
```
https://services1.arcgis.com/vdNDkVykv9vEWFX4/arcgis/rest/services/Cincinnati_Neighborhood_Statistical_Areas/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=geojson
```

If CAGIS is consistently unreachable, embed a simplified neighborhood GeoJSON as a static asset at `public/data/cincinnati_neighborhoods.geojson`.

**Census data pipeline:**
ACS 2022 tract data is pre-built at `public/data/neighborhood_acs.json` (226 Hamilton County tracts, 35 KB). Each entry: `{ geoid, lat, lon, income, rent, pop, rb[] }`. Generated by fetching:
1. `api.census.gov/data/2022/acs/acs5` for Hamilton County, OH
2. `www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR39.txt` (population-weighted centroids)

To refresh: re-run `scripts/build_acs.py` (server-side; both sources are CORS-blocked from the browser).

**Inspection pass statuses (PLAP dataset `ivda-umw7`):**
The `data_status` field uses these codes. All are treated as "passing" for the first-pass rate metric:
- `CODECOMP` — code compliant
- `CLOSE-NO` / `CLOS-NO` — closed, no violation
- `CLOS-OUT` — closed out

---

## Environment Variables

| Variable | Location | Notes |
|---|---|---|
| `VITE_GEOCODING_API_KEY` | `.env.local` | Mapbox public token (`pk.eyJ1...`) |
| `VITE_GEOCODING_PROVIDER` | `.env.local` | `mapbox` |
| `VITE_SOCRATA_APP_TOKEN` | `.env.local` | **Leave blank** — registered token is invalid. Public datasets work without it. |
| `OPENROUTER_API_KEY` | `.env.local` (non-VITE_) | `sk-or-v1-...` — injected server-side by Vite proxy |
| `CENSUS_API_KEY` | `.env.local` (non-VITE_) | `0b9ce250...` — injected server-side by Vite proxy (only needed when regenerating `neighborhood_acs.json`) |

---

## Dataset Field Name Reference

This was hard-won through error messages. **Do not change these without live testing.**

### Cincinnati Open Data (Socrata)

| Dataset | UID | Neighborhood field | Date field | Offense/type field |
|---|---|---|---|---|
| PDI Crime (old) | `k59e-2pvf` | `cpd_neighborhood` (UPPER CASE) | `date_reported` | `offense` |
| Crime STARS (new) | `7aqy-xrv9` | `cpd_neighborhood` (UPPER CASE) | `datereported` | `stars_category` |
| Traffic Stops | `ktgf-4sjh` | `cpd_neighborhood` (UPPER CASE) | `interview_date` | — |
| Pedestrian Stops | `jx3x-rh6i` | `cpd_neighborhood` (UPPER CASE) | `interview_date` | — |
| Building Permits | `uhjb-xac9` | `neighborhood` (UPPER CASE) | `applieddate` | `permittypemapped` / `permittype` |
| Inspections | `ivda-umw7` | `neighborhood` (UPPER CASE) | `inspecdate` | `data_status` |
| Food Safety | `rg6p-b3h3` | `neighborhood` (UPPER CASE) — *unverified* | `inspection_date` | — |
| Tax Abatements | `tkp7-yf64` | `ccd_neigh` (Title Case — matches dropdown exactly) | — | — |
| PLAP | `pk9w-99n6` | `neighborhood` (UPPER CASE) — *unverified; may be `sna_neighborhood`* | `date` | — |
| Fire & EMS | `vnsz-a3wp` | `neighborhood` (UPPER CASE) — *unverified* | `create_time` | `incident_type` |
| Community Perceptions | `gdf4-fqik` | **none** — city-wide survey, no neighborhood filter | — | — |
| OIS | `r6qu-muts` | — | `date` | — |
| Use of Force | `748b-sht4` | — | `date_of_incident` | — |

**Building Permits note:** `uhjb-xac9` is the canonical dataset. `tsjj-dcaf` is a derived view with no queryable columns — do not use it.

### CAGIS / ArcGIS

| Layer | Service URL / Item ID |
|---|---|
| Zoning (Cincinnati only) | `cagisonline.hamilton-co.org/arcgis/rest/services/Cincinnati/Cincinnati_LDC_Zoning/MapServer/4` |
| Neighborhood boundaries (SNA) | CAGIS_URLS array in Explorer — tries 4 fallbacks |
| Historic Districts | Item `41203d41015d43c08d7354e57b7eee75`, layer 3 (tries `Cincinnati_Historic_Landmarks` MapServer first) |
| Parks & Greenspace | Item `f3a7a97236f54d9395db2b639787a5db` (resolved via ArcGIS item API) |
| FEMA Flood Hazard | `hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28` |

---

## Architecture Notes

**SODA query param encoding:**
Keys like `$where`, `$limit` must be passed **literally** (not percent-encoded). Values are URL-encoded by `encodeURIComponent`. See `buildSODAQuery()` in `src/utils/api.ts`.

**Socrata app token:**
Passed as `$$app_token` query param (not `X-App-Token` header — the header triggers a CORS preflight that Cincinnati's portal rejects with 403). The registered token is currently invalid — datasets load fine without it.

**Neighborhood name normalization:**
All neighborhood names go through `normalizeNeighborhoodName()` in `utils/api.ts`. CPD datasets use UPPER CASE; the Explorer normalizes both GeoJSON properties and API results before matching. Numeric-only values (CPD district codes like "15") are filtered out.

**AI model:**
OpenRouter → MiniMax M2.5 (`minimax/minimax-m2.5`). OpenAI-compatible messages format. Proxied through Vite dev server (key never in browser bundle). In production, routes through Cloudflare Worker.

**CAGIS queries:**
Use `queryCAGISPoint(serviceUrl, lat, lng)` from `utils/api.ts` for point-in-polygon. Use `queryCAGISItem(itemId, layerIdx, lat, lng)` when you only have an ArcGIS item ID. Both have 8-second timeouts and throw on error.

---

## Recommended Next Steps

1. **Live test CAGIS cards on Tab 1** — verify zoning, flood, historic, parks all return data for a real Cincinnati address. Test with a Downtown address (known flood zone) and a Hyde Park address (known not in flood zone).
2. **Verify unconfirmed field names on Tab 2** — for Food Safety, PLAP, and Fire & EMS, fetch one record from each UID and confirm the neighborhood field name. Swap `neighborhood` → correct field if needed.
3. **Wire per-neighborhood Census data into Tab 2** — the Explorer already computes neighborhood-level income/rent from `neighborhood_acs.json`. Extract that logic into a shared hook or utility so Tab 2 can show real per-neighborhood numbers instead of the city-wide fallback.
4. **Live test Park Access + Flood Risk dimensions (Tab 4)** — enable both; wait 60s; confirm scores populate. Check browser Network tab for failures on `arcgis.com` (parks) or `hazards.fema.gov` (flood).
5. **Pre-compute park acreage** — 52 sequential CAGIS API calls at runtime is slow. Consider a one-time Node.js script that writes `public/data/cagis_neighborhood_parks.json` (same pattern as `neighborhood_acs.json`).
6. **Fix neighborhood dropdown on Tab 2** — currently shows all 53 neighborhoods regardless of whether any data exists for them. Filter to only neighborhoods that return at least one record from the crime dataset (the most complete source).
7. **Mobile testing** — Tab 1 and Tab 3 are primary mobile use cases.
8. **Spanish translation review** — machine-translated; needs native speaker review.

---

## File Structure Quick Reference

```
src/
  utils/api.ts           ← All API calls: fetchSODA, callAI, queryCAGISPoint, queryCAGISItem, fetchNearbyParks, fetchFloodZone, distanceMiles, calculateCentroid, normalizeNeighborhoodName
  utils/scoring.ts       ← Explorer scoring: normalize(), getRawValue(), computeScores()
  hooks/useSODA.ts       ← React hook wrapping fetchSODA with loading/error state
  types/index.ts         ← All TypeScript interfaces (Dimension.methodology is the field for "How is this scored?" text)
  context/LanguageContext.tsx ← EN/ES toggle, persisted to localStorage
  i18n/en.json, es.json  ← All user-visible strings
  components/ui/         ← DataCard, LoadingSkeleton, EmptyState, ErrorState, DataAttribution
  tabs/
    AddressLookup/       ← Tab 1 (geocoding, SODA cards, CAGIS cards, Leaflet map)
    NeighborhoodProfiles/ ← Tab 2 (neighborhood picker, data cards, print layout)
    PoliceAccountability/ ← Tab 3 (charts, outcomes table, AI query)
    NeighborhoodExplorer/ ← Tab 4 (choropleth map, dimension panel, scoring, Top 5, Detail Drawer)
worker/
  api-proxy.js           ← Cloudflare Worker (proxies OpenRouter + Census, injects keys)
  wrangler.toml          ← Cloudflare Worker deploy config
public/data/
  sorta_stops.json       ← SORTA bus stop locations (3,743 stops, GTFS format)
  neighborhood_acs.json  ← Pre-built ACS 2022 Census data: 226 Hamilton County tracts with income, rent, pop, rent-burden distribution, and CenPop2020 lat/lon centroids. Refresh with scripts/build_acs.py.
```
