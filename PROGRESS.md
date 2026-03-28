# Progress Log

> **New session? Read this file first.** Each entry records what changed, why decisions were made, and what comes next. This prevents re-litigating solved problems.

---

## Session Log

### Session 8 — Phase 1 Implementation: Roadmap Rewrite + Neighborhood Profiles (March 2026)

**Goal:** Update the Roadmap tab to reflect our new platform vision and commitments; implement Phase 1 foundation fixes in Neighborhood Profiles (Tab 2).

**Roadmap tab (`src/tabs/Roadmap/index.tsx`):**
- Added vision header: "Why we built this" panel with four key stats (evictions, lead service lines, racial income gap, tenant legal representation) in a dark header card
- Added "How we decide what to build" principles block (Fill civic gaps; Show tradeoffs; Race and place together; Accuracy over completeness)
- Added "What we won't build" section (real-time crime heat maps, predictive policing inputs, surveillance infrastructure, scraped personal data) — this makes our ethics explicit and public
- Added two new roadmap sections: Environmental Health & Lead Safety, Racial Equity & Economic Mobility
- Added BRT Construction Impact Tracker item to Transit section
- Updated footer CTA with State of Black Cincinnati link

**Neighborhood Profiles (`src/tabs/NeighborhoodProfiles/index.tsx`):**

1. **Dynamic neighborhood dropdown (Phase 1.1):** On mount, fetches distinct `cpd_neighborhood` values from the STARS crime dataset (`7aqy-xrv9`) and filters the static NEIGHBORHOODS list to only show neighborhoods with actual crime records. Falls back to the full static list on error. If the previously selected neighborhood is filtered out, resets to the first available.

2. **Per-neighborhood Census data (Phase 1.2):** Was already implemented! `fetchNeighborhoodCensusStats()` was already called and displayed in the Income & Housing card. Confirmed working — no changes needed.

3. **311 service requests (Phase 1.3):** Added a full DataCard using dataset `gcej-gmiw` (Cincinnati 311 Non-Emergency Service Requests):
   - Shows total request count (via separate count query for accuracy)
   - Shows open/pending count (filtered by sr_status field)
   - Shows average resolution time in days (computed from date_created / date_closed)
   - Bar chart showing top 8 request types by volume (sr_type_desc)
   - Positioned before Fire & EMS so the civic-transparency sequence is: permits → food safety → abatements → blight → 311 → fire/EMS

**Park acreage script (`scripts/build_parks.py`):**
- Pre-computes park count and total SHAPE__Area per neighborhood from CAGIS FeatureServer/34
- Uses point-in-polygon (ray-casting) for precise neighborhood assignment, with nearest-centroid fallback for parks on boundaries
- Output: `public/data/cagis_neighborhood_parks.json` keyed by normalized neighborhood name
- Eliminates 52 sequential runtime CAGIS calls in the Neighborhood Explorer (30–60s delay)
- **Must be run locally** — CAGIS is blocked from the Cowork sandbox

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

**Pending (Phase 1 remaining):**
- [ ] Run `scripts/build_parks.py` locally and commit `public/data/cagis_neighborhood_parks.json`
- [ ] Update `src/utils/scoring.ts` to read from `cagis_neighborhood_parks.json` instead of making runtime CAGIS calls (write this in next session once the JSON exists)
- [ ] Live test CAGIS cards in Tab 1 (Address Lookup) with real addresses

---

### Session 7 — Research, Roadmap & Roadmap Tab Update (March 2026)

**Goal:** Deep research on Cincinnati's civic landscape to ground the platform in real city priorities; produce a unified project roadmap; update the Roadmap tab with research-backed additions.

**Research findings (see `CINCINNATI_RESEARCH_REPORT.md` for full detail):**
- Cincinnati's most urgent civic data gap is **lead safety** — 33,449 lead/unknown water service lines remain; 220 child cases/year; no civic-facing map exists
- **Racial equity dashboard** is the next highest gap: Urban League "State of Black Cincinnati" (2024) documents $31,520 vs. $70,909 median income by race, 17.5% vs. 67% mortgage approval
- **Environmental justice** beyond flood risk: EPA EJScreen data (free API) would add air toxics, Superfund proximity, and industrial exposure
- **Connected Communities zoning reform** (June 2024) is the most important housing policy change in decades; permit data to track its equity impact is already in our system
- **SORTA BRT construction** (Hamilton Ave + Reading Rd) is beginning in 2025 — transit-equity context for affected neighborhoods is needed
- **311 service request data** exists on Cincinnati Open Data portal and should be in Neighborhood Profiles
- **Ascend 2030** (City + Hamilton County + UC + P&G + Microsoft) is Cincinnati's AI strategy — potential future partnership for data access
- **Brent Spence Bridge** ($3.6B, 2026–2030) is the largest infrastructure investment in Cincinnati's modern era

**Files created:**
- `CINCINNATI_RESEARCH_REPORT.md` — Full research synthesis (history, current focus, 10–15 year outlook, data gaps, stakeholders)
- `PROJECT_ROADMAP.md` — Phased project roadmap with 6 phases, partnership priorities, data sources to add, and session sequencing recommendation

**Files modified:**
- `src/tabs/Roadmap/index.tsx` — Added two new sections (Environmental Health & Lead Safety; Racial Equity & Economic Mobility) and a new BRT Construction Impact Tracker item in the Transit section
- `CLAUDE.md` — Updated Recommended Next Steps with research-informed priorities; added new data sources to the reference table
- `PROGRESS.md` — This entry

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

**Key session decisions:**
- Lead service line tracker identified as the highest-priority new tab — urgent public health gap, data publicly available, no civic-facing map exists
- EPA EJScreen chosen over building a custom EJ score because it's a free federal API with authoritative methodology
- Racial equity dashboard scoped to Census ACS data first (already in our system) before seeking HMDA or partner data
- Connected Communities zoning impact tracker scoped as an Explorer dimension addition, not a standalone tab

---

### Session 6 — Accessibility Tab (March 2026)

**Goal:** Add a dedicated Accessibility tab for Cincinnati's disabled community, with adjustable views by impairment type and prominent data-gap call-to-action framing.

**Design decisions:**
- No single "accessibility score" — disability is not monolithic. Five impairment-type views instead: Overview, Mobility & Physical, Vision, Hearing, Cognitive & Independent Living.
- Census ACS is the primary data source (tables B18101–B18107, C18130, C18108). These are the highest-quality neighborhood-level disability data available publicly.
- SORTA paratransit coverage calculated at runtime from existing `sorta_stops.json` — ADA requires Access service within ¾ mile of any fixed-route stop.
- Data gaps framed as calls to action with specific agency contacts and direct links, not just "data unavailable" error states.
- Future integrations planned: OpenStreetMap Overpass (curb cuts, accessible paths), CMS Care Compare (nursing homes, home health agencies).

**Files created:**
- `src/tabs/Accessibility/index.tsx` — Full tab with 5 impairment views, paratransit coverage card, data gaps call-to-action.
- `scripts/build_disability.py` — Python script to pre-compute ACS disability stats per neighborhood (same pattern as `build_acs.py`). **Must be run locally — Census API is blocked from the Cowork sandbox.**
- `public/data/neighborhood_disability.json` — Placeholder `{}` until `build_disability.py` is run. Tab handles empty state gracefully with instructions.

**Files modified:**
- `src/types/index.ts` — Added `'accessibility'` to `TabId`; added `NeighborhoodDisabilityStats` interface.
- `src/utils/api.ts` — Added `fetchNeighborhoodDisabilityStats()` (same caching pattern as `fetchNeighborhoodCensusStats()`).
- `src/App.tsx` — Added lazy import and `case 'accessibility'` to render switch.
- `src/components/layout/TabNav.tsx` — Added accessibility tab with custom wheelchair icon.
- `src/i18n/en.json`, `es.json` — Added `nav.accessibility` key.

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors). Vite full build blocked by sandbox filesystem permissions on `dist/` — not a code issue. Vercel will build from source cleanly.

**✅ FIXED — `build_disability.py` now generates data. 47 neighborhoods written.**

Root cause: GENZ2022/json/ directory doesn't carry per-state tract files (HTTP 404 confirmed). Fixed by switching to TIGERweb ACS2022 REST API, **MapServer layer 6** (Census Tracts). Layer 6 returns `INTPTLAT`/`INTPTLON` internal-point coordinates directly — no polygon centroid computation needed. All 226 Hamilton County tracts returned in a single request with `where=STATE='39' AND COUNTY='061'`.

Key finding: layer 8 is Census Block Groups (12-digit GEOIDs, 678 results for Hamilton County), not tracts. Layer 6 is Census Tracts (11-digit GEOIDs, 226 results — exact match).

**What the tab shows without running the script:**
- Neighborhood selector and impairment view selector ✅
- ADA paratransit coverage calculation (from SORTA stops) ✅
- Data gaps call-to-action with agency contacts ✅
- Census disability metrics: shows "run build script" notice instead of numbers ⚠️

**Planned next additions to this tab (future sessions):**
1. **OpenStreetMap Overpass API** — curb cuts (`kerb=lowered`), wheelchair-accessible paths, accessible parking. Free, no auth. Fetch via Vercel serverless (same pattern as CAGIS). Note: OSM data coverage varies by neighborhood; caveat must be prominent.
2. **CMS Care Compare** (`data.cms.gov/provider-data`) — nursing homes, home health agencies, dialysis centers near each neighborhood. Free federal API, queryable by lat/lon. Add as a "Nearby Facilities" card to the Mobility view.
3. **SORTA GTFS wheelchair_boarding field** — re-import `sorta_stops.json` with the accessibility flags from SORTA's GTFS `stops.txt` (column index 9). Currently all stops show `wheelchair_boarding=0` (unknown).

---

### Session 3 — Field Verification + Tab 2 Bug Fixes (March 2026)

**What was investigated:**
- Fetched one live record from each of the three unverified datasets to confirm field names.

**Confirmed field names (all three were using correct `neighborhood` field):**

| Dataset | UID | Neighborhood field | Date field | Notes |
|---------|-----|--------------------|------------|-------|
| Food Safety | `rg6p-b3h3` | `neighborhood` (UPPER CASE) ✅ | `action_date` | Some records have `"N/A"` (geocoding failures) — must filter these out |
| PLAP | `pk9w-99n6` | `neighborhood` (UPPER CASE) ✅ | `sr_recd_date` / `enf_recd_date` | No `date` field — previous docs were wrong |
| Fire & EMS | `vnsz-a3wp` | `neighborhood` (UPPER CASE) ✅ | `create_time_incident` | Previous docs incorrectly said `create_time` |

**Bugs fixed in `src/tabs/NeighborhoodProfiles/index.tsx`:**

1. **Food Safety query — no date filter** — Was loading all-time data regardless of the selected date range. Fixed: added `AND action_date >= '${startDate}' AND action_date <= '${endDate}'`. Also added `AND neighborhood != 'N/A'` to exclude geocoding failures.

2. **Food Safety data structure** — Dataset is per-violation, not per-facility. The same business appears once per violation found per inspection. Fixed: added `uniqueFacilities` memo that deduplicates by `license_no` for display. The "Facilities with Active Violations" count now uses a `Set` to count unique facilities (not violation rows).

3. **Fire & EMS query — no date filter** — Was loading up to 500 incidents with no date constraint, making the count inconsistent with the crime section. Fixed: added `AND create_time_incident >= '${startDate}' AND create_time_incident <= '${endDate}'`. Also corrected the date field from (undocumented) `create_time` to confirmed `create_time_incident`.

**Build status:** `npm run build` passes clean (TypeScript + Vite). ✅

**Deferred:**
- PLAP (`pk9w-99n6`) has no date filter in Tab 2 — intentional, since blight records don't have a clean "closed date" concept; showing all active records for the neighborhood is the right behavior.
- Food Safety also has an `insp_type` field (e.g., "ROUTINE", "COMPLAINT") that could be used to filter inspections in a future enhancement.

---

### Session 4 — Parks + Census MultiPolygon Fixes (March 2026)

**Root cause investigation prompted by two visible regressions (both pre-existing, not introduced by Session 3):**

**Bug 1 — Parks always empty (Tab 1 Address Lookup + Tab 4 Explorer park scoring):**
- The Session 2 "schools in parks" fix added a `WHERE TYPE NOT LIKE '%SCHOOL%'` clause to the CAGIS parks query.
- `TYPE` is not a valid field in the Hamilton County Parks & Greenspace layer (FeatureServer/34). The actual field is `PARKTYPE`.
- The invalid field name caused a 400 error on every parks query. The `catch` block returned `[]`, silently showing "No parks found."
- Fix: Changed `where` to `"PARKTYPE NOT IN ('Schools-Private', 'Schools-Public')"`. Confirmed field values via live API query.
- Also corrected all field name references in `AddressLookup/index.tsx` (comment, `TYPE` → `PARKTYPE`) and `NeighborhoodExplorer/index.tsx` (`ACREAGE` → `SHAPE__Area` for park scoring — the `ACREAGE` field doesn't exist in this layer; `SHAPE__Area` is the correct area field, units unspecified but consistent for min-max normalization).

**Bug 2 — 5 neighborhoods show no census/income data (Tab 2 + Tab 4 Explorer):**
- `_buildCensusMap()` in `api.ts` computed centroids only for `Polygon` geometries, skipping `MultiPolygon`.
- 5 neighborhoods have MultiPolygon boundaries: **California, Kennedy Heights, Mt. Washington, Pleasant Ridge, West Price Hill**.
- Fix: Added `MultiPolygon` handling — uses the first ring of the first polygon as centroid approximation.
- Verified: Mt. Washington now shows $107,547 median income, $1,057/mo rent, 56% rent burden.

**Confirmed layer fields for FeatureServer/34 (Hamilton County Parks & Greenspace):**
`OBJECTID, NAME, SHORT_NAME, PARKTYPE, COUNTY, SHOW, GLOBALID, SHAPE__Area, SHAPE__Length`
- No `ACREAGE` field, no `TYPE` field, no `NEIGHBORHOOD` field (old code referenced all three).
- `PARKTYPE` values: Ball Field, Cemetery, City or Village, Clubs-Members Only, Conservancy District, Conservation Group, County Government, Federal Government, None, Nonprofit, Other Private, Park District, Private Commercial, Schools-Private, Schools-Public, State Government, Township.

**Build status:** `npm run build` passes clean. ✅

---

### Session 5 — Remove Building Permits from Address Lookup (March 2026)

**Finding:** The building permits dataset (`uhjb-xac9`) has no geocoordinate fields (`latitude`/`longitude` do not exist in the schema). The Address Lookup tab was querying `bboxWhere('latitude', 'longitude', 200)`, but Socrata silently ignores WHERE conditions on non-existent columns rather than returning an error. This meant every address lookup returned the same ~50 most recent permits from all of Cincinnati — completely unrelated to the searched address.

Additionally, `permittypemapped = "HVAC"` was not caught by the existing trade permit filter (which only excluded "mechanical", "plumbing", "electrical", "fire suppression"), so HVAC permits were displayed as if they were building activity at the specific address.

**Decision: Removed Building Permits from Address Lookup entirely.** No reliable address-level querying is possible without geocoordinates. Permit data remains available by neighborhood in Tab 2 (Neighborhood Profiles), which is the correct granularity for this dataset.

**What was removed from `src/tabs/AddressLookup/index.tsx`:**
- `PERMIT_TYPE_FILTER` constant
- `permits` useSODA hook
- Building Permits DataCard in JSX
- `permits: permits.data?.length` from AI summary context
- `permits.data` from the useCallback dependency array

**Note for future work:** If a future version of the permits dataset adds geocoordinates, or if we can reliably normalize `originaladdress1` against Mapbox-returned addresses, this section could be restored. The address field format in the dataset is `"123 MAIN ST"` (uppercase, abbreviated suffixes) — would require normalization to match Mapbox output.

---

### Session 1 — Initial Build (March 2026)
**Commits:** `dad12ef` through `bf4ce4e`

**What was built:**
- Full React/TypeScript/Vite scaffold with Tailwind CSS, Leaflet, Recharts, and i18next
- All 7 tab shells: Address Lookup, Neighborhood Profiles, Police Accountability, Neighborhood Explorer, Displacement, Owner Activity, Roadmap
- `src/utils/api.ts` — central API module covering SODA, Census, CAGIS, OHGO, OpenRouter, SORTA, FARA
- Vercel serverless proxy (`api/proxy.js`) for server-side key injection
- Cloudflare Worker alternative (`worker/api-proxy.js`)
- Pre-built static data assets: `public/data/sorta_stops.json` (3,743 SORTA stops), `public/data/neighborhood_acs.json` (226 Census tracts, ACS 2022)
- EN/ES language toggle with i18next

**Key decisions:**
- Socrata app token passed as `$$app_token` query param (not `X-App-Token` header) — CORS preflight blocks the header approach on Cincinnati's portal
- SODA keys must NOT be percent-encoded; values are URL-encoded — this was discovered through 400 errors
- Census and OpenRouter keys injected server-side only; never in browser bundle
- Mapbox chosen as geocoding provider over Google Maps
- Static pre-built JSON files for SORTA and Census (both are CORS-blocked from browser at source)

---

### Session 2 — Bug Fixes (March 2026)
**Commits:** `4d56b00`, `1fdff20`, `b2eb4c3`, `3b80593` (PR #1)

**What was fixed:**
1. **Schools appearing in Parks results** — CAGIS parks query was returning school facilities. Fixed by filtering feature type.
2. **AI feature broken** — OpenRouter was configured to use a free model that was rate-limited. Reverted to paid MiniMax M2.5 model (`minimax/minimax-m2.5`).
3. **Mobile charts broken** — Recharts ResponsiveContainer sizing issue on mobile. Fixed with explicit height constraints.
4. **Permit counts wrong** — `uhjb-xac9` was returning trade permits (electrical, plumbing, HVAC) mixed in with building permits. Added `permittypemapped` filter to exclude trade permits. Also fixed total count: now uses a separate `count(*)` query instead of relying on the capped 500-row response.
5. **API proxy simplified** — Collapsed multiple Vercel functions into single catch-all `api/proxy.js`.
6. **README and `.env.example` rewritten** — Updated to match actual implementation state.

**Field names confirmed through live testing:**
- Traffic stops `ktgf-4sjh`: date=`interview_date`, outcome=`disposition_text` (NOT `action_taken`), sex=`sex` (NOT `gender`)
- Crime STARS `7aqy-xrv9`: date=`datereported` (no underscore), neighborhood=`cpd_neighborhood`
- Building permits `uhjb-xac9`: type filter=`permittypemapped`, neighborhood=`neighborhood`

**Deferred (not in this PR):**
- Food Safety, PLAP, Fire & EMS neighborhood field names unverified in live testing
- Per-neighborhood Census data not wired into Tab 2
- Displacement and Owner Activity tabs still stubs

---

## Current State (as of March 2026)

### Tab Status

| Tab | Status | Notes |
|-----|--------|-------|
| Address Lookup | ✅ Working | CAGIS cards (zoning, flood, historic, parks) not fully live-tested at all addresses |
| Neighborhood Profiles | ⚠️ Partial | Crime + permits working; Food Safety/PLAP/Fire & EMS field names unverified; Census data is city-wide fallback, not per-neighborhood |
| Police Accountability | ✅ Working | Charts, outcomes table, AI Q&A all functional |
| Neighborhood Explorer | ✅ Mostly working | 7 of 9 dimensions confirmed; Park Access + Flood Risk need live test (slow — 52 async CAGIS/FEMA calls) |
| Displacement | ❌ Stub | UI shell exists, no data wired |
| Owner Activity | ❌ Stub | UI shell exists, no data wired |
| Accessibility | ✅ Working | Tab live; paratransit coverage, data gaps, and Census disability metrics all functional. `neighborhood_disability.json` generated (47 neighborhoods). |
| Roadmap | ✅ Working | Static content |

### Data Gaps

| Item | Gap | Impact |
|------|-----|--------|
| Food Safety `rg6p-b3h3` | Neighborhood field name unverified | Tab 2 food safety section may be empty or erroring silently |
| PLAP `pk9w-99n6` | Neighborhood field unverified (may be `sna_neighborhood`) | Tab 2 blight section and Explorer public maintenance dimension |
| Fire & EMS `vnsz-a3wp` | Neighborhood field unverified | Tab 2 fire incidents section |
| Park Access dimension | Not live-tested post-fixes | Explorer park score may be 0 for all neighborhoods |
| Flood Risk dimension | Not live-tested post-fixes | Explorer flood score may be 0 for all neighborhoods |
| SORTA routes | All stops have `routes: []` | Transit scoring uses stop count only |
| Community Perceptions | No neighborhood field in dataset | Shown as city-wide average with disclaimer (intended behavior) |

---

## Decision Log

**Why use Socrata `$limit` + separate `count(*)` query for permit totals?**
Socrata SODA API caps responses at 1,000 rows by default (configurable up to 50,000 per request). A `$limit=500` query would make it look like only 500 permits existed. The fix: fetch `$select=count(*) as cnt` in a separate query to get the real total, then display both.

**Why filter out trade permits (`permittypemapped`)?**
The building permits dataset `uhjb-xac9` includes electrical, plumbing, HVAC, and other trade permits that inflate the "construction activity" count. These are routine maintenance items, not indicators of investment/development pressure. Filter applied: `WHERE permittypemapped NOT IN ('...trade types...')`.

**Why not use the Census API directly in the browser?**
Both `api.census.gov` and `www2.census.gov` block cross-origin requests (CORS). The Census data is pre-built as `public/data/neighborhood_acs.json` (run server-side via `scripts/build_acs.py`).

**Why is `VITE_SOCRATA_APP_TOKEN` left blank?**
The registered Socrata app token is invalid/expired. Cincinnati's public datasets work fine without authentication for the query volumes this app uses. Left in `.env.example` for future use if rate limiting becomes an issue.

**Why MiniMax M2.5 instead of Claude or GPT-4?**
Cost. MiniMax M2.5 is a capable open-weight model available through OpenRouter at a fraction of the cost of frontier models. The use case (civic data summaries) doesn't require frontier-level reasoning.

**Why closest-centroid for Census tract → neighborhood mapping?**
Census tracts don't align with Cincinnati neighborhood statistical areas (SNAs). Point-in-polygon is expensive at runtime. Closest centroid is a fast approximation — tracts at boundaries get assigned to their nearest neighborhood, which is correct for most cases. An exact PiP mapping could be pre-built if precision matters.

---

## Pending Tasks

### High Priority
- [x] **Verify unconfirmed field names (Tab 2)** — All three confirmed correct `neighborhood` (UPPER CASE). Date field for Fire & EMS is `create_time_incident`. PLAP date fields are `sr_recd_date`/`enf_recd_date` (no `date` field). Fixed in Session 3.
- [x] **Run `scripts/build_disability.py` locally** — Fixed and run. 47 neighborhoods in `public/data/neighborhood_disability.json`. Committed and deployed.
- [ ] **Live test CAGIS cards (Tab 1)** — Test with a Downtown address (e.g., 525 Vine St) and a Hyde Park address. Verify zoning, flood, historic, and parks all return data. Check browser Network tab for any 4xx/5xx.
- [ ] **Live test Park Access + Flood Risk (Tab 4)** — Enable both dimensions; wait 60s; check scores appear. If blank, open Network tab and look for failed ArcGIS or FEMA requests.

### Medium Priority
- [ ] **Wire per-neighborhood Census data into Tab 2** — Explorer already has neighborhood-level income/rent from `neighborhood_acs.json`. Extract into a shared hook/utility so Tab 2 can show real numbers.
- [ ] **Implement Displacement tab** — Key datasets: permits `uhjb-xac9`, tax abatements `tkp7-yf64`, PLAP `pk9w-99n6`, demolitions `cncm-znd6`. Show permit surge, abatement counts, and unit loss per neighborhood over time.
- [ ] **Implement Owner Activity tab** — Search by owner/developer name across: permits `uhjb-xac9`, unit activity `xedz-tk7q`, CRA loans `m76i-p5p9`, tax abatements `tkp7-yf64`.
- [ ] **Fix neighborhood dropdown (Tab 2)** — Currently shows all 53 neighborhoods even if they have no data. Filter to only neighborhoods with at least one crime record (most complete dataset).

### Low Priority
- [ ] **Accessibility tab — OpenStreetMap curb cuts** — Add Overpass API fetch via Vercel serverless to show wheelchair infrastructure in the Mobility view. Caveat OSM coverage gaps prominently.
- [ ] **Accessibility tab — CMS Care Compare** — Add nearby nursing homes/home health agencies card to Mobility view using `data.cms.gov/provider-data` free API.
- [ ] **Accessibility tab — SORTA wheelchair_boarding field** — Re-import SORTA stops with `wheelchair_boarding` flag from GTFS `stops.txt` (column 9). Re-run the stops build script.
- [ ] **Pre-compute park acreage** — Write a Node.js script to generate `public/data/cagis_neighborhood_parks.json` (similar to `neighborhood_acs.json`) so Park Access doesn't require 52 sequential CAGIS API calls at runtime.
- [ ] **Spanish translation review** — Current ES strings (`src/i18n/es.json`) are machine-translated and need native speaker review.
- [ ] **Mobile testing** — Address Lookup (Tab 1) and Police Accountability (Tab 3) are the primary mobile use cases.
- [ ] **CAGIS GeoJSON fallback** — If CAGIS is consistently unreachable, embed a simplified `public/data/cincinnati_neighborhoods.geojson` as a static asset.

---

## How to Debug Common Issues

### SODA query returns empty/errors
1. Copy the URL from the browser Network tab
2. Paste into browser to see the raw Socrata error message
3. Check field names against the Dataset Field Name Reference in `Claude.md`
4. Verify neighborhood values are UPPER CASE (most datasets) or Title Case (tax abatements only)

### CAGIS card shows "Error"
1. Open browser DevTools → Network tab
2. Find the failing ArcGIS request
3. Inspect the URL — check layer index (layer 0 vs 3 vs 4)
4. Try the URL directly in the browser to see the ArcGIS error response

### AI summary not appearing
1. Check that `OPENROUTER_API_KEY` is set in `.env.local` (not a VITE_ prefixed variable)
2. Check browser Network tab for the `/api/openrouter/...` request
3. A 401 means the key is wrong; a 429 means rate-limited

### Neighborhood Explorer map blank
The code tries 4 CAGIS URLs with 8-second timeouts. If all fail, scoring still works. To debug:
- Try the primary URL directly: `https://services1.arcgis.com/vdNDkVykv9vEWFX4/arcgis/rest/services/Cincinnati_Neighborhood_Statistical_Areas/FeatureServer/0/query?where=1=1&outFields=*&outSR=4326&f=geojson`
- If CAGIS is down, embed a local GeoJSON fallback

### Build fails on TypeScript errors
Run `npm run build` locally before pushing. TypeScript errors block the Vercel deploy.
