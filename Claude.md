# Cincinnati Civic Data Platform — Claude Instructions

## What This Project Is

A React/TypeScript web application that aggregates public civic data for Cincinnati residents, advocates, and journalists.

**Live site:** <https://cincinnati-civic-data.vercel.app>
**Stack:** Vite 5 + React 18 + TypeScript + Tailwind CSS + Leaflet + Recharts + i18next
**Backend:** Vercel serverless function (`api/proxy.js`) that injects API keys for OpenRouter, Census, and OHGO
**Alternative backend:** Cloudflare Worker (`worker/api-proxy.js`)
**Deploy:** Vercel (auto-deploys from `main` branch)

## Quick Reference

- Progress log: `PROGRESS.md` — **read this first every session**
- All API calls: `src/utils/api.ts` — the heart of the app
- TypeScript interfaces: `src/types/index.ts`
- Tab components: `src/tabs/`
- Scoring logic: `src/utils/scoring.ts`
- Handoff notes: `CLAUDE_CODE_HANDOFF.md` — hard-won field names and architecture decisions

## Starting a Session

1. Read `PROGRESS.md` to see where we left off and what's pending.
2. Run `npm run dev` and open <http://localhost:5173> to verify the app starts.
3. Check browser console for any regressions before making changes.
4. After completing work, update `PROGRESS.md` with what changed and why.

## Project Architecture

### The Seven Tabs

| Tab | Path | Status | Description |
|-----|------|--------|-------------|
| Address Lookup | `src/tabs/AddressLookup/` | Working | Geocode an address; show crime, zoning, flood zone, parks, transit, live traffic, AI summary |
| Neighborhood Profiles | `src/tabs/NeighborhoodProfiles/` | Partial | Pick a neighborhood; show crime trends, permits, inspections, blight, survey, income |
| Police Accountability | `src/tabs/PoliceAccountability/` | Working | CPD traffic/pedestrian stops, use-of-force, OIS — charts by race/district + AI Q&A |
| Neighborhood Explorer | `src/tabs/NeighborhoodExplorer/` | Mostly working | Choropleth map ranking all 52 neighborhoods across 9 scored dimensions |
| Displacement | `src/tabs/Displacement/` | Stub | Gentrification tracking — not yet implemented |
| Owner Activity | `src/tabs/OwnerActivity/` | Stub | Landlord/developer search — not yet implemented |
| Roadmap | `src/tabs/Roadmap/` | Working | Static public roadmap |

### Key Files

```
src/utils/api.ts           All API calls (SODA, OpenRouter, Census, CAGIS, OHGO, SORTA, FARA)
src/utils/scoring.ts       Neighborhood Explorer scoring: normalize(), computeScores()
src/hooks/useSODA.ts       React hook wrapping fetchSODA() with loading/error/success states
src/hooks/useCensus.ts     React hook for Census API
src/types/index.ts         All TypeScript interfaces
src/context/LanguageContext.tsx  EN/ES toggle persisted to localStorage
src/i18n/en.json, es.json  All user-visible strings (ES is machine-translated, needs review)
api/proxy.js               Vercel serverless function — key injection for OpenRouter/Census/OHGO
public/data/sorta_stops.json     3,743 SORTA bus stops (static GTFS asset)
public/data/neighborhood_acs.json  226 Hamilton County Census tracts (ACS 2022, pre-built)
```

### Data Sources

#### Cincinnati Open Data (Socrata) — data.cincinnati-oh.gov

| Dataset | UID | Neighborhood field | Date field | Notes |
|---------|-----|--------------------|-----------| ------|
| Crime STARS (current) | `7aqy-xrv9` | `cpd_neighborhood` (UPPER CASE) | `datereported` | |
| Crime PDI (legacy) | `k59e-2pvf` | `cpd_neighborhood` (UPPER CASE) | `date_reported` | |
| Traffic Stops | `ktgf-4sjh` | `cpd_neighborhood` (UPPER CASE) | `interview_date` | |
| Pedestrian Stops | `jx3x-rh6i` | `cpd_neighborhood` (UPPER CASE) | `interview_date` | |
| Building Permits | `uhjb-xac9` | `neighborhood` (UPPER CASE) | `applieddate` | Filter trade permits via `permittypemapped` |
| Inspections | `ivda-umw7` | `neighborhood` (UPPER CASE) | `inspecdate` | |
| Food Safety | `rg6p-b3h3` | `neighborhood` (UPPER CASE) ✅ | `action_date` | Per-violation rows; filter `neighborhood != 'N/A'` |
| Tax Abatements | `tkp7-yf64` | `ccd_neigh` (Title Case) | — | |
| PLAP (Problem Landlords) | `pk9w-99n6` | `neighborhood` (UPPER CASE) ✅ | `sr_recd_date` / `enf_recd_date` | No `date` field |
| Fire & EMS | `vnsz-a3wp` | `neighborhood` (UPPER CASE) ✅ | `create_time_incident` | |
| Community Perceptions | `gdf4-fqik` | **none** — city-wide survey only | — | |
| Use of Force | `748b-sht4` | — | `date_of_incident` | |
| OIS | `r6qu-muts` | — | `date` | |

**Critical:** `uhjb-xac9` is the canonical Building Permits dataset. `tsjj-dcaf` is a derived view with no queryable columns — do not use it.

#### External APIs

| Source | Purpose | Auth |
|--------|---------|------|
| Mapbox Geocoding | Address → lat/lon | `VITE_GEOCODING_API_KEY` (browser-safe) |
| CAGIS / ArcGIS | Zoning, parks, historic districts | None (CORS-open) |
| FEMA NFHL | Flood zone boundaries | None (federal) |
| Census ACS | Income, rent, demographics | `CENSUS_API_KEY` (server-side only) |
| OpenRouter → MiniMax M2.5 | AI summaries and Q&A | `OPENROUTER_API_KEY` (server-side only) |
| OHGO / Ohio ODOT | Live traffic incidents | `VITE_OHGO_API_KEY` (browser-safe) |
| SORTA GTFS | Bus stop locations | Static file |
| USDA Food Access | Food desert data | None |

## Critical Patterns — Do Not Break

### SODA Query Encoding

SODA parameter **keys** (`$where`, `$limit`, etc.) must be passed **literally** — never percent-encode them. **Values** are URL-encoded by `encodeURIComponent`. See `buildSODAQuery()` in `src/utils/api.ts`.

```
CORRECT:   $where=neighborhood='OVER-THE-RHINE'
INCORRECT: %24where=neighborhood='OVER-THE-RHINE'   ← breaks Socrata parser
```

### Socrata App Token

Passed as `$$app_token` query param — NOT as `X-App-Token` header. The header triggers a CORS preflight that Cincinnati's portal rejects with 403.

### Neighborhood Name Normalization

Names vary across datasets. All are normalized via `stripNeighborhoodName()` (lowercases and strips non-alphanumeric):

- CPD datasets: UPPER CASE (`OVER-THE-RHINE`)
- GeoJSON: Title Case (`Over-the-Rhine`)
- Match key: `overtherine` ← both normalize to this

### AI Model

OpenRouter → `minimax/minimax-m2.5`. Request goes through `/api/openrouter/...` → Vercel proxy injects key. The model uses OpenAI-compatible message format.

### CAGIS Queries

- Point-in-polygon: `queryCAGISPoint(serviceUrl, lat, lng)`
- Item-based: `queryCAGISItem(itemId, layerIdx, lat, lng)`
- Both have 8-second timeouts and throw on error.

### Explorer Scoring

9 dimensions, each normalized 0–100. Computed in `src/utils/scoring.ts`. Schools dimension is disabled (no open data source). Park Access and Flood Risk run ~52 async CAGIS/FEMA queries in batches after the map loads (30–60s delay expected).

## Environment Variables

| Variable | Where | Notes |
|----------|-------|-------|
| `VITE_GEOCODING_API_KEY` | `.env.local` | Mapbox public token (`pk.eyJ1...`) |
| `VITE_GEOCODING_PROVIDER` | `.env.local` | `mapbox` |
| `VITE_SOCRATA_APP_TOKEN` | `.env.local` | Leave blank — registered token is invalid; public datasets work without it |
| `VITE_OHGO_API_KEY` | `.env.local` | Ohio ODOT traffic API |
| `OPENROUTER_API_KEY` | `.env.local` (non-VITE) | Injected server-side — NEVER in browser bundle |
| `CENSUS_API_KEY` | `.env.local` (non-VITE) | Injected server-side — only needed to regenerate `neighborhood_acs.json` |

## Recommended Next Steps (Priority Order)

1. **Verify unconfirmed field names on Tab 2** — For Food Safety, PLAP, and Fire & EMS, fetch one record from the UID and confirm the neighborhood field. To check: `https://data.cincinnati-oh.gov/resource/{uid}.json?$limit=1`
2. **Wire per-neighborhood Census data into Tab 2** — Explorer already computes neighborhood-level income/rent from `neighborhood_acs.json`. Extract into a shared hook so Tab 2 shows real per-neighborhood numbers.
3. **Live test CAGIS cards (Tab 1)** — Test zoning, flood, historic, and parks with a Downtown address (known flood zone) and Hyde Park address (known not in flood zone).
4. **Live test Park Access + Flood Risk dimensions (Tab 4)** — Enable both; wait 60s; confirm scores populate. Check Network tab for failures on `arcgis.com` (parks) or `hazards.fema.gov` (flood).
5. **Pre-compute park acreage** — 52 sequential CAGIS calls at runtime is slow. Write a Node.js script that generates `public/data/cagis_neighborhood_parks.json` (same pattern as `neighborhood_acs.json`).
6. **Implement Displacement tab** — Key datasets: permits (`uhjb-xac9`), tax abatements (`tkp7-yf64`), PLAP (`pk9w-99n6`), demolitions (`cncm-znd6`).
7. **Implement Owner Activity tab** — Key datasets: permits (`uhjb-xac9`), unit activity (`xedz-tk7q`), CRA loans (`m76i-p5p9`), tax abatements (`tkp7-yf64`).
8. **Fix neighborhood dropdown (Tab 2)** — Currently shows all 53 neighborhoods even if no data exists. Filter to neighborhoods with at least one crime record.
9. **Spanish translation review** — Current ES strings are machine-translated.
10. **Mobile testing** — Tabs 1 and 3 are primary mobile use cases.

## Known Issues & Workarounds

- **SORTA routes are empty** — `sorta_stops.json` has `routes: []` for all stops. Transit scoring uses stop count, not route count.
- **Neighborhood Explorer GeoJSON** — Tries 4 CAGIS URLs with 8s timeouts. If all fail, map won't render but scoring still works. Fallback: embed a static `public/data/cincinnati_neighborhoods.geojson`.
- **Community Perceptions Survey** — No neighborhood field exists in `gdf4-fqik`. Data is shown as city-wide averages with a clear disclaimer.
- **Building permits address filter** — Uses `within_circle(location,...)` which requires a `location` geo_point field. If a "No such column: location" error appears, switch to bounding box lat/lon filter.
- **OHGO traffic** — Only covers Ohio-managed roads (interstates, state routes), not Cincinnati city streets.
- **Census tract→neighborhood mapping** — Uses closest centroid; tracts straddling boundaries go to nearest neighborhood centroid.
