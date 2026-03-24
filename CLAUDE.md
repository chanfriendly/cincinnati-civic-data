# Cincinnati Civic Data Platform — Claude Code Guide

Open-source civic dashboard surfacing Cincinnati public data (crime, permits,
transit, housing, police accountability) for residents and community organizations.

---

## Key Commands

```bash
npm run dev        # Dev server → http://localhost:5173
npm run build      # TypeScript compile + Vite build (run before PRs to catch type errors)
npm run preview    # Preview production build locally

node scripts/convert-gtfs.cjs   # Refresh SORTA transit data from live GTFS feed
                                 # (requires network + unzip; commits sorta_stops.json)
```

---

## Development Workflow

Claude Code on the web cannot push to `main`. All work goes to a `claude/` branch;
the human opens and merges the PR on GitHub.

```bash
git checkout -b claude/<short-description>-<session-id>
git push -u origin <branch-name>
```

---

## Architecture at a Glance

```
src/
  utils/api.ts           ← All API calls (fetchSODA, callAI, CAGIS helpers, distanceMiles)
  utils/scoring.ts       ← Neighborhood Explorer scoring pipeline
  hooks/useSODA.ts       ← React hook: fetchSODA + loading/error state
  types/index.ts         ← All TypeScript interfaces
  components/ui/         ← DataCard, LoadingSkeleton, EmptyState, DataAttribution
  tabs/
    AddressLookup/       ← Geocoding + nearby data cards (crime, transit, CAGIS, OHGO)
    NeighborhoodProfiles/← Neighborhood picker + data cards + print layout
    PoliceAccountability/← CPD charts, outcomes table, AI Q&A
    NeighborhoodExplorer/← Choropleth map, scoring, Top 5, Detail Drawer
    Roadmap/             ← Static roadmap page
public/data/
  sorta_stops.json       ← 3,743 SORTA bus stops (GTFS-derived, refresh with convert-gtfs.cjs)
  neighborhood_acs.json  ← Pre-built ACS 2022 Census data for 226 Hamilton County tracts
worker/
  api-proxy.js           ← Cloudflare Worker: proxies OpenRouter + Census, injects keys
```

**Data fetching patterns:**
- Socrata: `useSODA(uid, params)` hook or `fetchSODA(uid, params)` directly
- SODA `$where` keys must be passed literally (not percent-encoded); values are encoded
- CAGIS/ArcGIS: `queryCAGISPoint(serviceUrl, lat, lng)` or `queryCAGISItem(itemId, layerIdx, lat, lng)`
- Transit: loaded from static `/data/sorta_stops.json` (not a live API call)

**Socrata app token:** Passed as `$$app_token` query param — never as `X-App-Token` header
(the header triggers a CORS preflight that Cincinnati's Socrata portal rejects with 403).
The registered token is currently invalid; public datasets work without it.

---

## Critical: Hard-Won Field Names

Do not change these without live-testing against the API.

### Socrata Datasets

| Dataset | UID | Neighborhood field | Date field | Type/offense field |
|---|---|---|---|---|
| PDI Crime (legacy) | `k59e-2pvf` | `cpd_neighborhood` **UPPER CASE** | `date_reported` | `offense` |
| Crime STARS (current) | `7aqy-xrv9` | `cpd_neighborhood` **UPPER CASE** | `datereported` | `stars_category` |
| Traffic Stops | `ktgf-4sjh` | `cpd_neighborhood` **UPPER CASE** | `interview_date` | — |
| Pedestrian Stops | `jx3x-rh6i` | `cpd_neighborhood` **UPPER CASE** | `interview_date` | — |
| Building Permits | `uhjb-xac9` | `neighborhood` **UPPER CASE** | `applieddate` | `permittypemapped` / `permittype` |
| Inspections | `ivda-umw7` | `neighborhood` **UPPER CASE** | `inspecdate` | `data_status` |
| Food Safety | `rg6p-b3h3` | `neighborhood` **UPPER CASE** — *unverified* | `inspection_date` | — |
| Tax Abatements | `tkp7-yf64` | `ccd_neigh` **Title Case** | — | — |
| PLAP Blight | `pk9w-99n6` | `neighborhood` **UPPER CASE** — *unverified* | `date` | — |
| Fire & EMS | `vnsz-a3wp` | `neighborhood` **UPPER CASE** — *unverified* | `create_time` | `incident_type` |
| Community Perceptions | `gdf4-fqik` | **none** — city-wide survey, no neighborhood filter | — | — |

**Do not use `tsjj-dcaf`** (derived view of permits with no queryable columns); always use `uhjb-xac9`.

### CAGIS / ArcGIS Endpoints

| Layer | Service / Item |
|---|---|
| Zoning | `cagisonline.hamilton-co.org/arcgis/rest/services/Cincinnati/Cincinnati_LDC_Zoning/MapServer/4` |
| Neighborhood boundaries | CAGIS_URLS array in Explorer (tries 4 fallbacks) |
| Historic Districts | Item `41203d41015d43c08d7354e57b7eee75`, layer 3 |
| Parks & Greenspace | Item `f3a7a97236f54d9395db2b639787a5db` |
| FEMA Flood Hazard | `hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28` |

---

## Key Gotchas

- **Neighborhood names are UPPER CASE** in CPD/Socrata datasets. `normalizeNeighborhoodName()` in `utils/api.ts` handles matching between GeoJSON (Title Case) and API results (UPPER CASE).
- **Building permits:** filter out trade permits (`mechanical`, `plumbing`, `electrical`, `hvac`, `fire suppression`, `boiler`, `elevator`) to show only structural permits. See `TRADE_PERMIT_TERMS` in `AddressLookup/index.tsx`.
- **Crime categories:** `stars_category` from the STARS dataset uses FBI UCR codes ("Part 1", "Part 2"). Map these to plain English using `CRIME_LABEL_MAP` in `NeighborhoodProfiles/index.tsx` before displaying.
- **Bounding box vs within_circle:** If you see "No such column: location", the dataset doesn't have a geo_point field. Switch to the bounding box helper: `bboxWhere(latCol, lonCol, radiusMeters)` in `AddressLookup/index.tsx`.
- **Census data** in NeighborhoodProfiles is currently **city-wide** (hardcoded ACS 2022 averages), not per-neighborhood. Per-neighborhood data exists in the Explorer tab. Wiring it into Tab 2 is a known next step.
- **Community Perceptions (`gdf4-fqik`):** City-wide survey only — no neighborhood column. Displayed with a clear "City-Wide Survey" label.
- **AI model:** OpenRouter → MiniMax M2.5 (`minimax/minimax-m2.5`). Proxied server-side; key never in the browser bundle.
- **Park Access scoring** in the Explorer makes ~52 sequential CAGIS API calls. Takes 30–60s to populate. Consider pre-computing as a static JSON asset.

---

## Environment Variables

| Variable | Where | Notes |
|---|---|---|
| `VITE_GEOCODING_API_KEY` | `.env.local` | Mapbox public token (`pk.eyJ1...`) |
| `VITE_GEOCODING_PROVIDER` | `.env.local` | `mapbox` |
| `VITE_SOCRATA_APP_TOKEN` | `.env.local` | Leave blank — token is invalid; public datasets work without it |
| `OPENROUTER_API_KEY` | `.env.local` | `sk-or-v1-...` — injected server-side only |
| `CENSUS_API_KEY` | `.env.local` | Only needed when regenerating `neighborhood_acs.json` |
