# Cincinnati Civic Data Platform — Claude Instructions

## What This Project Is

A React/TypeScript web application that aggregates public civic data for Cincinnati residents, advocates, and journalists.

**Live site:** <https://cincinnati-civic-data.vercel.app>
**Stack:** Vite 5 + React 18 + TypeScript + Tailwind CSS + Leaflet + Recharts + i18next
**Backend:** Vercel serverless function (`api/proxy.js`) that injects API keys for OpenRouter, Census, and OHGO
**Alternative backend:** Cloudflare Worker (`worker/api-proxy.js`)
**Deploy:** Vercel (auto-deploys from `main` branch)

## Quick Reference

- **Changelog (failures + decisions):** `CHANGELOG.md` — **read this first every session**
- Progress log: `PROGRESS.md` — narrative session history; read after CHANGELOG
- All API calls: `src/utils/api.ts` — the heart of the app
- TypeScript interfaces: `src/types/index.ts`
- Tab components: `src/tabs/`
- Scoring logic: `src/utils/scoring.ts`
- Handoff notes: `CLAUDE_CODE_HANDOFF.md` — hard-won field names and architecture decisions

## Starting a Session

1. Read `CHANGELOG.md` — known failures, design decisions, and gotchas. This prevents repeating dead ends.
2. Read `PROGRESS.md` — to see where we left off and what's pending.
3. **Sync the Roadmap** — open `src/tabs/Roadmap/index.tsx` and scan the `SECTIONS` array. Any item whose `status` no longer matches reality should be updated before new work begins: `'planned'` → `'in-progress'` → `'completed'`, or `'seeking-data'` if a source turned out to be unavailable. The Roadmap is public-facing — stale statuses erode trust.
4. Run `npm run dev` and open <http://localhost:5173> to verify the app starts.
5. Check browser console for any regressions before making changes.
6. After completing work: update `PROGRESS.md` with what changed and why, sync any newly completed Roadmap items, and add any dead ends or architectural decisions to `CHANGELOG.md` before pivoting.

## Architecture Principles

These guide every feature decision. When evaluating new work, run it through these before building:

- **Distill, don't display** — every data point should answer "what does this mean and what should I do?" not just "here's another chart." Fewer surfaces, more synthesis.
- **Data to action** — surface who made the decision, what civic opening exists, and which organization is already working on it. Awareness without a path to action is a dead end.
- **Cincinnati first, then portable** — deep local specificity (council members by name, Cincinnati orgs by mission, Cincinnati history) before any generic abstraction. Don't dilute with common denominators prematurely.
- **Permanent over band-aid** — before building a workaround, ask: will this be made obsolete when the real data source opens? If yes, skip it and invest in something that has permanent value. Example: a static ordinance scrape becomes useless the moment the Legistar API is enabled. A civic org directory never becomes useless.
- **Build the data model first** — for features blocked by a future API (Legistar voting records), design the TypeScript interface and UI shell now so wiring it in later is fast.
- **Measured vs modeled — disclose load-bearingly** — when a visualization combines primary-source data (e.g. ACS percentiles) with a model applied from outside the local geography (e.g. ITEP Ohio incidence), tag each with a visible badge. "Modeled" content needs its caveats and sourcing directly adjacent to the chart, not in a footnote. The Tax & Revenue tab is the canonical implementation of this pattern.

## Known Failures (Quick Reference)

> Full detail and rationale in `CHANGELOG.md`. This is the quick-glance list.

- **Socrata auth header** — `X-App-Token` header causes CORS 403. Use `$$app_token` as a query param instead.
- **SODA key encoding** — Never percent-encode `$where`, `$limit`, etc. Only values get `encodeURIComponent`.
- **Building permits derived view** — `tsjj-dcaf` has no queryable columns. Use `uhjb-xac9`.
- **CAGIS Parks layer 34** — Removed by CAGIS, causes HTTP 400. Use layer 46. Field names changed.
- **HUD program color matching** — Fuzzy string match on raw codes (e.g. "LMSA") never fires. Use the explicit `PROGRAM_LABELS` map in `HousingInventorySection.tsx`.
- **EJScreen API** — Offline since Feb 2025. Use pre-built `neighborhood_ejscreen.json` (2019 data). Do not query live.
- **Community Perceptions** — `gdf4-fqik` has no neighborhood field. City-wide only.
- **SORTA routes** — `sorta_stops.json` has `routes: []` for all stops. Use stop count, not route count.

## Project Architecture

### The Tabs

| Tab | Path | Status | Description |
|-----|------|--------|-------------|
| Address Lookup | `src/tabs/AddressLookup/` | Working | Geocode an address; show crime, zoning, flood zone, parks, transit, live traffic, AI summary |
| Neighborhood Profiles | `src/tabs/NeighborhoodProfiles/` | Partial | Pick a neighborhood; show crime trends, permits, inspections, blight, survey, income |
| Police Accountability | `src/tabs/PoliceAccountability/` | Working | CPD traffic/pedestrian stops, use-of-force, OIS — charts by race/district + AI Q&A |
| Neighborhood Explorer | `src/tabs/NeighborhoodExplorer/` | Mostly working | Choropleth map ranking all 52 neighborhoods across 9 scored dimensions |
| Displacement | `src/tabs/Displacement/` | Partial | Zoning Reform Tracker live; wider displacement features in progress |
| Owner Activity | `src/tabs/OwnerActivity/` | Working | Advocate/organizer view: address-first lookup → permit-filer portfolio pivot |
| Tax & Revenue | `src/tabs/TaxRevenue/` | Working | Cincinnati income-tax rate history, ACS household-income percentiles, ITEP Ohio modeled tax burden, City general fund revenue by source. Uses **Measured vs Modeled** badges to distinguish primary-source facts from modeled estimates |
| Limitations | `src/tabs/Limitations/` | Working | Public methodology + limitations page: neighborhood boundary ambiguity (SNA vs Community Council), data vintages, AI disclosures, known gaps. Cross-linked from every tab that surfaces modeled or imputed data |
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
| City General Fund Revenue | `a9hy-bv25` | — | `fiscal_year` | Tax & Revenue tab. `resource_name` is classified into 9 revenue categories by `classifyRevenue()` in `api.ts` (deterministic string match — do not add AI/LLM classification) |

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

#### Integrated (previously listed as "planned")

| Source | Purpose | Status | Notes |
|--------|---------|--------|-------|
| Cincinnati Open Data: 311 (`gcej-gmiw`) | Service request volume, open count, resolution time | ✅ Live | `CityServicesSection.tsx` in Tab 2; queries Socrata live by neighborhood + date range |
| CFPB HMDA (2022) | Mortgage lending by race and census tract | ✅ Live | `public/data/neighborhood_hmda.json` (built by `scripts/build_hmda.py`); shown in `UnifiedEquitySection.tsx` in Tab 2 |
| Cincinnati Health Dept. Lead Inventory | Lead service line map by neighborhood | ✅ Live | `public/data/lead_service_lines.json`; shown in Lead Safety tab |
| HUD Subsidized Households | Affordable housing inventory + expiration dates | ✅ Live | `public/data/hud_affordable_housing.json` (built by `scripts/build_hud.py`); shown in `HousingInventorySection.tsx` in Tab 2 |
| EPA AirToxScreen 2019 (via ArcGIS) | Environmental justice / air toxics scores | ✅ Live (partial) | `public/data/neighborhood_ejscreen.json`; used as EJ dimension in Explorer. **Note: EJScreen has been offline since Feb 2025 — disclosed in UI tooltip. Data is 2019 vintage.** |
| Census ACS 5-Year (B19080) | Cincinnati household income percentiles (p20/p40/p60/p80/p95), 2012–2023 | ✅ Live | `public/data/cincinnati_income_percentiles.json` (built by `scripts/build_income_percentiles.py`). **FIPS place code for Cincinnati is `15000`, not `14000`.** Shown in Tax & Revenue tab |
| ITEP Who Pays? 7th edition (Oct 2024) | Ohio state + local effective tax rate by income group | ✅ Live | `public/data/itep_ohio_incidence.json`. Statewide incidence used as Cincinnati proxy — disclosed as **modeled**, not measured. Shown in Tax & Revenue tab and Limitations tab |
| City of Cincinnati Finance Dept — Tax Rate History | Municipal income tax rate timeline | ✅ Live | `public/data/cincinnati_tax_rate_history.json`. Only verified rates included (1.8% from 2020-10-02; 2.1% prior). Earlier rates lack primary-source ordinance citations — **do not fabricate** |

#### Planned / Future APIs (not yet integrated)

| Source | Purpose | Auth | Notes |
|--------|---------|------|-------|
| First Street Foundation | Property-level flood probability over 30 years | API key | Deferred — paid API. `https://firststreet.org/` |

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

> **MAINTENANCE RULE — read before every session:** This list is the authoritative short-term task queue. When a task is finished, mark it ✅ immediately — do not leave completed work unmarked. If a task is partially done or pending validation, mark it 🔄. New tasks discovered mid-session should be appended here. `PROJECT_ROADMAP.md` is the long-horizon roadmap; this list is the sprint board. They must be kept in sync.

> Research basis: `CINCINNATI_RESEARCH_REPORT.md`

### Phase 1 — Foundation Fixes
1. ✅ **Wire per-neighborhood Census data into Tab 2** — `neighborhood_acs.json` in use; income/rent shown per neighborhood.
2. ✅ **Fix neighborhood dropdown (Tab 2)** — Filters dynamically to neighborhoods with crime records via STARS API on mount.
3. ✅ **Add 311 service requests to Tab 2** — Live via `CityServicesSection` (`gcej-gmiw`); shows volume, open count, avg resolution time, top request types.
4. ✅ **Pre-compute park acreage** — `scripts/build_parks.py` done; `public/data/cagis_neighborhood_parks.json` populated (49 neighborhoods); Explorer uses static file, skips 52 live CAGIS calls.
5. 🔄 **Live test CAGIS cards (Tab 1)** — Verify zoning, flood, historic, and parks cards with a Downtown address (known flood zone) and Hyde Park address (not in flood zone). No code change needed — manual QA only.

### Phase 2 — Lead & Environmental Health
6. ✅ **Lead service line tracker** — Full `LeadSafety` tab built: neighborhood inventory, risk ratings, city-wide chart, address lookup, resident guidance. `public/data/lead_service_lines.json` populated.
7. ✅ **EPA environmental justice layer** — AirToxScreen 2019 via ArcGIS; added as EJ dimension in Neighborhood Explorer (45 neighborhoods). EJScreen offline since Feb 2025 — disclosed in tooltip.
8. **Flood infrastructure status** — Add Mill Creek barrier/floodwall context to Tab 1 flood zone card. First Street Foundation (paid API) deferred; static Mill Creek context is free.

### Phase 3 — Racial Equity & Zoning
9. ✅ **Racial equity metrics by neighborhood** — `UnifiedEquitySection` built: income/poverty/homeownership by race (ACS) + mortgage approval rates by race (HMDA). Shown in Neighborhood Profiles.
10. ✅ **Connected Communities zoning reform tracker** — `ConnectedCommunitiesSection.tsx` added as "Zoning Reform Tracker" sub-tab in Displacement tab. Compares Reform Year 1 (Jul 2024–Jun 2025) vs. baseline (Jul 2023–Jun 2024). Three views: city-wide summary, by-neighborhood YoY bar chart, residential permit type breakdown.

### Phase 4 — Affordable Housing & Displacement
11. ✅ **HUD affordable housing inventory** — `HousingInventorySection.tsx` built and wired into Neighborhood Profiles ("Affordable Housing" section divider). `scripts/build_hud.py` populated `public/data/hud_affordable_housing.json` (28 neighborhoods, 114 properties, 8,191 assisted units). Shows: assisted unit count, property count, units by program type, expiry alert for subsidies ending within 5 years. **Known follow-up:** HUD program type codes in the data (e.g. "LMSA", "PD/8 SR", "RAD PH Conv") are internal HUD abbreviations — consider adding a human-readable label map in `HousingInventorySection.tsx` so residents understand what each program means.
12. **Eviction data** — Requires partner (Legal Aid Society) for tract-level data. County totals available from Eviction Lab. Do not build without a data partner.

### Phase 5 — Schools & Transit
13. ✅ **School proximity in Address Lookup** — `public/data/schools.json` built from CAGIS layer 32 (309 Hamilton County schools). "Nearby Schools (within 1 mi)" DataCard added to Tab 1, filters static JSON in-browser (same pattern as transit stops). Shows type badge, grade, public/private, district, distance.
14. ✅ **Transit equity gap analysis** — `public/data/neighborhood_transit_equity.json` built (50 neighborhoods, stop count + income). `TransitEquitySection.tsx` added to Neighborhood Profiles under "Transportation" divider. ScatterChart plots all neighborhoods; 4 quadrant equity labels; selected neighborhood highlighted.

### Phase 6 — Transparency & Methodology
19. ✅ **Tax & Revenue tab** — `src/tabs/TaxRevenue/index.tsx`. Four sections: (a) municipal income tax rate history; (b) ACS B19080 household income percentiles 2012–2023 (LineChart); (c) ITEP Ohio modeled state+local tax burden by income group (BarChart, heavily disclosed); (d) City general fund revenue composition by source (stacked BarChart, `a9hy-bv25` with deterministic `classifyRevenue()`).
20. ✅ **Limitations & Methodology tab** — `src/tabs/Limitations/index.tsx`. Dedicated public methodology page covering: neighborhood boundary ambiguity (SNA vs Community Council, Oakley example, contested areas, centroid mapping), data vintages table, known data gaps, political structure (at-large council, Legistar blockage), AI-generated content disclosures, tax modeling, language/translation, and contribute CTA.

### Lower Priority / Ongoing
15. ✅ **HUD program type labels** — `PROGRAM_LABELS` map added to `HousingInventorySection.tsx`; all 13 codes in the live data mapped to plain-English labels + one-sentence descriptions. `programColor()` updated to match on labels (fuzzy matchers now actually fire). Reference: https://www.huduser.gov/portal/datasets/assthsg.html
16. **Spanish translation review** — Current ES strings are machine-translated; needs native speaker review.
17. 🔄 **Mobile testing** — Tabs 1 and 3 are primary mobile use cases. In progress — pending user confirmation.
18. ✅ **Neighborhood comparison tool** — `NeighborhoodComparison.tsx` added to Explorer. Two-neighborhood selector + horizontal grouped BarChart (navy vs amber) + detail table with raw metrics + per-dimension winner badges. Accessible via "Compare Neighborhoods" pill tab in the Explorer right panel.
21. **Tax & Revenue — next extensions** — (a) Cincinnati EITC / CTC state-level changes (Ohio Dept of Taxation); (b) per-neighborhood effective tax burden once a Cincinnati-specific incidence model becomes available; (c) expenditure-side companion: City general fund *spending* by category and neighborhood (complements the revenue view).
22. **Limitations tab — community contributions** — wire a "submit a correction / share a source" path (GitHub issue template or form) so advocates can add primary-source citations for pre-1989 rate history, SNA vs. CCB mappings they've authenticated, and domain-specific caveats.

## Known Issues & Workarounds

- **SORTA routes are empty** — `sorta_stops.json` has `routes: []` for all stops. Transit scoring uses stop count, not route count.
- **Neighborhood Explorer GeoJSON** — Tries 4 CAGIS URLs with 8s timeouts. If all fail, map won't render but scoring still works. Fallback: embed a static `public/data/cincinnati_neighborhoods.geojson`.
- **Community Perceptions Survey** — No neighborhood field exists in `gdf4-fqik`. Data is shown as city-wide averages with a clear disclaimer.
- **Building permits address filter** — Uses `within_circle(location,...)` which requires a `location` geo_point field. If a "No such column: location" error appears, switch to bounding box lat/lon filter.
- **OHGO traffic** — Only covers Ohio-managed roads (interstates, state routes), not Cincinnati city streets. A coverage note is now shown in the UI above the Traffic & Infrastructure section.
- **Census tract→neighborhood mapping** — Uses closest centroid; tracts straddling boundaries go to nearest neighborhood centroid.
- **AI summary outputs (pending reassessment)** — The "Plain English Summary" in Address Lookup and the Q&A in Police Accountability use `minimax/minimax-m2.5` via OpenRouter. Output quality, framing, and disclosure have not been formally reviewed. Key questions: Is the "factual, not alarmist" prompt producing outputs residents trust? Should raw data points be shown so users can verify? Should there be an explicit "AI-generated" disclosure? See `TODO(reassess-ai-summary)` comment in `src/tabs/AddressLookup/index.tsx`.
