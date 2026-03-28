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

#### Planned / Future APIs (not yet integrated)

| Source | Purpose | Auth | Notes |
|--------|---------|------|-------|
| Cincinnati Health Dept. Lead Inventory | Lead service line map | None (public) | `https://www.cincinnati-oh.gov/health/chd-programs/lead-poisoning-prevention/` |
| EPA EJScreen API | Environmental justice scores (air, Superfund, industrial) | None (public) | `https://ejscreen.epa.gov/mapper/ejscreenRESTbroker.aspx` |
| HUD Subsidized Households | Affordable housing inventory + expiration dates | None (public API) | `https://www.huduser.gov/portal/datasets/assthsg.html` |
| CFPB HMDA | Mortgage lending by race and census tract | None (public) | `https://ffiec.cfpb.gov/api/public/` |
| Cincinnati Open Data: 311 | Service request volume and resolution time | None | Look up UID on data.cincinnati-oh.gov |
| First Street Foundation | Property-level flood probability over 30 years | API key | `https://firststreet.org/` |

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

> Full phased roadmap: see `PROJECT_ROADMAP.md`. Research basis: see `CINCINNATI_RESEARCH_REPORT.md`.

### Phase 1 — Foundation Fixes (immediate)
1. **Wire per-neighborhood Census data into Tab 2** — Explorer already computes neighborhood-level income/rent from `neighborhood_acs.json`. Extract into a shared hook so Tab 2 shows real per-neighborhood numbers.
2. **Fix neighborhood dropdown (Tab 2)** — Currently shows all 53 neighborhoods even if no data exists. Filter to neighborhoods with at least one crime record.
3. **Add 311 service requests to Tab 2** — Data exists on Cincinnati Open Data portal; service delivery disparities by neighborhood are a high-value civic transparency addition.
4. **Live test CAGIS cards (Tab 1)** — Test zoning, flood, historic, and parks with a Downtown address (known flood zone) and Hyde Park address (known not in flood zone).
5. **Pre-compute park acreage** — 52 sequential CAGIS calls at runtime is slow. Write a Node.js script that generates `public/data/cagis_neighborhood_parks.json` (same pattern as `neighborhood_acs.json`).

### Phase 2 — Lead & Environmental Health (high priority)
6. **Lead service line tracker** — Cincinnati has 33,449 lead/unknown service lines remaining; 220 child cases/year. Cincinnati Health Dept. publishes the inventory. No civic-facing map exists — highest-priority new feature.
7. **EPA EJScreen environmental justice layer** — Free federal API (no auth). Add air toxics, Superfund proximity, and industrial exposure to Neighborhood Explorer as a new EJ dimension.
8. **Flood infrastructure status** — First Street Foundation probability data + Mill Creek floodwall condition status alongside existing FEMA flood zones.

### Phase 3 — Racial Equity (high priority)
9. **Racial equity metrics by neighborhood** — Census ACS B19001/B25003/B17001 by race tables. Already fetching Census data; new breakdowns. Motivated by Urban League "State of Black Cincinnati" (2024).
10. **Connected Communities zoning impact tracker** — Track permit applications filed under the June 2024 zoning reform. Permit data already in our system.

### Lower Priority
11. **HUD affordable housing inventory** — Free public API. Section 8, LIHTC, public housing units + subsidy expiration dates.
12. **Spanish translation review** — Current ES strings are machine-translated.
13. **Mobile testing** — Tabs 1 and 3 are primary mobile use cases.

## Known Issues & Workarounds

- **SORTA routes are empty** — `sorta_stops.json` has `routes: []` for all stops. Transit scoring uses stop count, not route count.
- **Neighborhood Explorer GeoJSON** — Tries 4 CAGIS URLs with 8s timeouts. If all fail, map won't render but scoring still works. Fallback: embed a static `public/data/cincinnati_neighborhoods.geojson`.
- **Community Perceptions Survey** — No neighborhood field exists in `gdf4-fqik`. Data is shown as city-wide averages with a clear disclaimer.
- **Building permits address filter** — Uses `within_circle(location,...)` which requires a `location` geo_point field. If a "No such column: location" error appears, switch to bounding box lat/lon filter.
- **OHGO traffic** — Only covers Ohio-managed roads (interstates, state routes), not Cincinnati city streets.
- **Census tract→neighborhood mapping** — Uses closest centroid; tracts straddling boundaries go to nearest neighborhood centroid.
