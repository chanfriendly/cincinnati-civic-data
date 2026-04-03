# Progress Log

> **New session? Read this file first.** Each entry records what changed, why decisions were made, and what comes next. This prevents re-litigating solved problems.

---

## Session Log

### Session 19 — Address Lookup Parks Bug Fix + Tab Visualization Redesign (April 2026)

**Goal:** Fix broken parks card (reported empty), then redesign Tab 1 visualizations to match the semantic grouping style of Neighborhood Profiles.

**Bug fix — Parks (CAGIS layer 34 removed):**
- CAGIS silently removed layer 34 (Hamilton County Parks) from their FeatureServer. All parks queries were returning HTTP 400 "Invalid URL".
- Layer 46 (`Cincinnati_Parks_and_Greenspace`) is the replacement. Field names changed: `NAME` → `PARK_NAME`, `PARKTYPE` → `PARK_DESIGNATION`, `SHAPE__Area` → `PARK_SIZE_ACRES`.
- Updated `fetchNearbyParks()` in `src/utils/api.ts` to use layer 46 with new WHERE clause filtering `PARK_DESIGNATION IN ('Local Park', 'Local Conservation Area', ...)`.
- Updated parks render in `AddressLookup/index.tsx` to use `PARK_NAME`, `PARK_DESIGNATION`, `PARK_SIZE_ACRES` (now shows acreage in acres, e.g. "19.7 ac").

**Address Lookup visualization redesign:**
- **Quick Status Bar**: 6-chip row (Zoning / Flood / Crime / Bus Stops / Schools / Parks) appears immediately after address selection. Animated pulse skeleton during loading. Crime count color-codes by severity (green/yellow/orange). Flood zone color-codes by risk.
- **Property Record**: Tabbed card (Overview | Inspections | Abatements & Blight) consolidates 3 formerly separate DataCards. Overview tab shows 4 KPI tiles (Inspections / Violations / Abatements / Blight Flags) + contextual alert banners for violations and blight, or a green "clean record" message if all zero. Inspections tab = full inspection list. Abatements & Blight tab = abatements list + PLAP records.
- **Safety & Environment section**: Nearby Crime card redesigned — large count with severity color, category breakdown horizontal mini-bars (top 6 categories), then recent incidents list. FEMA Flood Zone card unchanged.
- **Location Context section**: Zoning + Historic District side-by-side (unchanged content, now clearly labeled).
- **Amenities & Access**: Single tabbed card (Parks | Schools | Transit) with count badges on each tab. Consolidates 3 formerly separate DataCards. All content preserved from individual cards.
- **Traffic & Infrastructure section**: OHGO cards (3) unchanged — now clearly grouped under a section header.
- **Tab state**: `propertyTab` and `amenitiesTab` useState hooks added. `crimeByCategory` useMemo computes category breakdown.

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

---

### Session 18 — School Proximity + Transit Equity + Neighborhood Comparison (April 2026)

**Goal:** Three roadmap items: Phase 5.1 (school proximity in Address Lookup), Phase 5.2 (transit equity gap analysis), Phase 6 (neighborhood comparison tool).

**School Proximity — Address Lookup (Phase 5.1 ✅):**
- New file: `public/data/schools.json` — 309 Hamilton County schools from CAGIS `OpenData/FeatureServer/32` (Countywide_School_Locations layer). Fields: name, type, grade, fund, district, address, lat/lon.
- `src/tabs/AddressLookup/index.tsx` — added `SchoolRecord` + `NearbySchool` interfaces, `nearbySchools` state + `useEffect` that loads JSON and filters to schools ≤ 1 mile from the address. Added "Nearby Schools" DataCard in the grid after Transit Stops. Shows type badge (color-coded by level), grade range, public/private indicator, and distance in miles.
- File size: 58 KB (tiny; same static-JSON-filter-in-browser pattern as transit stops).

**Transit Equity Gap Analysis (Phase 5.2 ✅):**
- New file: `scripts/` (inline build) → `public/data/neighborhood_transit_equity.json` — 50 neighborhoods, each with stopCount (SORTA stops within 0.4 mi of centroid), medianIncome (nearest-centroid ACS mapping), lat/lon. 4.5 KB.
- New file: `src/tabs/NeighborhoodProfiles/TransitEquitySection.tsx` — self-contained. Shows: 3-KPI row (stop count / rank / city median), equity label with 4 quadrant categories (transit-rich low-income = green equity win; transit gap low-income = red concern; transit-rich high-income = navy; car-dependent high-income = amber), Recharts ScatterChart of all 50 neighborhoods with selected one highlighted in amber and median reference lines, quadrant legend.
- `src/tabs/NeighborhoodProfiles/index.tsx` — added import + "Transportation" section divider + `<TransitEquitySection>` between City Services and Development.

**Neighborhood Comparison Tool (Phase 6 ✅):**
- New file: `src/tabs/NeighborhoodExplorer/NeighborhoodComparison.tsx` — receives `scores` and `dimensions` from Explorer (no extra data loading). Two selectors (A vs B). Shows: overall winner banner with composite scores, horizontal grouped BarChart (navy = A, amber = B), detail table with scores + raw metric values + per-dimension winner badges.
- `src/tabs/NeighborhoodExplorer/index.tsx` — added import + `rightView` state + "Rankings & Map" / "Compare Neighborhoods" tab-switcher pill. When Compare is active, replaces the map + rankings with the comparison panel.

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

**CLAUDE.md items marked ✅:** items 13 (school proximity), 14 (transit equity), plus comparison tool noted.

**Next session priorities:**
- Spanish translation review (item 16) — current ES strings are machine-translated
- Mobile testing (item 17) — Tabs 1 and 3 are primary mobile use cases
- Eviction data (item 12) — blocked on data partner (Legal Aid Society)
- Flood infrastructure status (item 8) — static Mill Creek context card for Tab 1

---

### Session 17 — HUD Program Labels (April 2026)

**Goal:** Add plain-English labels to HUD program type codes in `HousingInventorySection.tsx` so residents see "Section 8 – New Construction" instead of "Sec 8 NC".

**Files modified:**
- `src/tabs/NeighborhoodProfiles/HousingInventorySection.tsx` — two changes:
  1. Added `PROGRAM_LABELS` const mapping all 13 codes found in the live data to `{ label, description }` objects. Labels are plain-English. Descriptions (one sentence each) appear as a small sub-line under each bar. Hover `title` attribute also carries the description for truncated rows.
  2. Updated `programColor()` to match against `hudProgramLabel(code).label` instead of the raw code — the old fuzzy matchers ("public housing", "section 8", etc.) were never firing because no HUD code string contains those phrases verbatim. Now Section 8 programs get amber, RAD conversions get rose/pink, 202 elderly programs get purple, 811 disability programs get teal, public housing gets navy.

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

**Next session priorities (in order):**
1. School proximity in Address Lookup (Phase 5.1) — CPS school location GeoJSON is public
2. Transit equity gap analysis (Phase 5.2) — SORTA stop data already in system
3. Neighborhood comparison tool (Phase 6) — side-by-side Explorer dimensions

---

### Session 16 — CLAUDE.md Maintenance Rule + Zoning Reform Tracker + HUD Affordable Housing (April 2026)

**Goal:** Correct the stale "Recommended Next Steps" list, then build the next two phases from the roadmap.

**CLAUDE.md maintenance rule added:** The "Recommended Next Steps" section now has an explicit rule requiring Claude to mark items ✅ when done and 🔄 when in progress every session. Previous items were found to be silently complete (dropdown filtering, park acreage, lead safety, EJScreen — all done in earlier sessions). Stale state corrected.

**Connected Communities Zoning Reform Tracker (Phase 3.3 — now ✅ complete):**
- New file: `src/tabs/Displacement/ConnectedCommunitiesSection.tsx` — self-contained component
- Added as third sub-tab "Zoning Reform Tracker" in the Displacement tab
- Compares Reform Year 1 (Jul 2024–Jun 2025) vs. baseline (Jul 2023–Jun 2024) city-wide
- Three views:
  - **City-Wide Summary**: KPI cards (all structural permits + residential permits) with YoY %, top-10 neighborhoods bar list
  - **By Neighborhood**: Horizontal bar chart showing YoY % change for top-20 neighborhoods; green = growth, red = decline
  - **By Permit Type**: Grouped bar chart (baseline grey vs. reform blue/red) for residential permit types
- Reform context banner explains what the ordinance changed (duplexes, ADUs, parking minimums)
- Trade permits (electrical, plumbing, HVAC) excluded from all counts
- `Displacement/index.tsx` modified: added import, extended activeSection type to include `'zoning'`, added sub-tab button and conditional render

**HUD Affordable Housing Inventory (Phase 4.2 — 🔄 pending data build):**
- New file: `scripts/build_hud.py` — queries HUD Multifamily Properties Assisted ArcGIS FeatureServer (public, no auth), filters to Cincinnati bounding box, nearest-centroid maps properties to neighborhoods, outputs by-program unit counts and expiry alerts
- New file: `public/data/hud_affordable_housing.json` — placeholder `{}` until script is run
- New interface: `NeighborhoodHUDStats` + `HUDProperty` in `src/types/index.ts`
- New function: `fetchNeighborhoodHUDStats()` in `src/utils/api.ts`
- New file: `src/tabs/NeighborhoodProfiles/HousingInventorySection.tsx` — shows assisted units, property count, breakdown by program type (Public Housing / Section 8 / LIHTC etc.), amber alert for subsidies expiring within 5 years, graceful build-notice when JSON is empty
- `src/tabs/NeighborhoodProfiles/index.tsx` modified: added import, added "Affordable Housing" section divider and `<HousingInventorySection>` between Development and Public Health

**Data build completed (same session):** `python3 scripts/build_hud.py` ran successfully.
- 28 Cincinnati neighborhoods mapped
- 114 HUD-assisted properties
- 8,191 total assisted units
- Top neighborhoods: North Fairmount (903), Walnut Hills (863), Avondale (700), Over-the-Rhine (637), CBD/Riverfront (621)
- Expiring subsidies: 0 flagged — HUD's `EXPIRATION_DATE` fields appear sparsely populated in this dataset; the alert system is wired and will activate when dates are present

**Known follow-up for next session:** HUD program type codes in the JSON (e.g. "LMSA", "PD/8 SR", "RAD Mod Rehab Conv", "RAD PH Conv", "202/8 NC") are internal HUD abbreviations. Add a label map to `HousingInventorySection.tsx` so residents see "Section 8 New Construction" instead of "Sec 8 NC". Reference: https://www.huduser.gov/portal/datasets/assthsg.html

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

---

### Session 15 — Visualization Consolidation: Public Safety, City Services, Development (April 2026)

**Goal:** Consolidate semantically-related data cards in Neighborhood Profiles into unified, multi-view panels — same philosophy as `UnifiedEquitySection`. Motivated by user wanting to "combine ideas but still show in a digestable, understandable way."

**Process:** Built an HTML prototype (`public/section-mockups.html`) presenting three consolidation options side-by-side; user approved all three.

**Section reordering:** `UnifiedEquitySection` promoted near the top of the tab (directly under Income & Housing). Sections reorganized into semantic groups with lightweight gray divider labels: Economic Profile → Public Safety → City Services → Development & Land Use → Public Health.

**Files created:**
- `src/tabs/NeighborhoodProfiles/PublicSafetySection.tsx` — combines CPD crime (PDI `k59e-2pvf` + STARS `7aqy-xrv9`) and CFD Fire/EMS (`vnsz-a3wp`) into one tabbed card with three views: Overview (side-by-side ranked bar lists), Crime Detail (full bar chart), Fire & EMS Detail (full bar chart). Shared KPI row shows CPD incidents / CFD dispatches / Total.
- `src/tabs/NeighborhoodProfiles/CityServicesSection.tsx` — combines 311 requests (`gcej-gmiw`) and Community Perceptions survey (`gdf4-fqik`) in a two-column layout. Left: 311 KPIs + top request types. Right: resident satisfaction survey bars sorted descending by score (user requested).
- `src/tabs/NeighborhoodProfiles/DevelopmentSection.tsx` — combines Building Permits (`uhjb-xac9`), Tax Abatements (`tkp7-yf64`), and Blight/PLAP (`pk9w-99n6`). KPI row + demolition alert banner + permit-by-type bar chart with demolitions highlighted red via Recharts `Cell`.
- `public/section-mockups.html` — standalone HTML prototype used for user review (not part of app build).

**Files modified:**
- `src/tabs/NeighborhoodProfiles/index.tsx` — removed ~200 lines of now-redundant `useSODA` calls and `useMemo` computed values (crime, fire/ems, 311, perceptions, permits, tax abatements, blight). Replaced 7 old `DataCard` blocks with 3 component calls. Added semantic section dividers throughout.

**Architecture note:** All three new section components are self-contained (own data fetching, own state). Each carries a TRANSPLANT NOTE in its header — promoting any of them to their own tab requires only wrapping in a tab shell and adding a nav entry.

**Key dual-key pattern:** `DevelopmentSection` accepts both `nbhSoQL` (UPPER CASE, used for permits/blight) and `neighborhood` (Title Case, used for tax abatements `ccd_neigh` field) because the datasets use different neighborhood name casing.

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

---

### Session 14 — Unified Equity Visualization (April 2026)

**Goal:** Consolidate four separate bar charts (income, poverty, homeownership, mortgage) into a single unified panel with three selectable views.

**Design decision:** User reviewed three mockup options (HTML prototype at `public/equity-mockups.html`) and chose to offer all three simultaneously via a tab switcher — same approach as the mockup's tab UI, now implemented in production React.

**Terminology fix:** Applied journalistic standard throughout — "White Non-Hispanic (White NH)" on first prose use, "White NH" on subsequent uses. Consistent with AP Style and CFPB HMDA conventions.

**Files created:**
- `src/tabs/RacialEquity/UnifiedEquitySection.tsx` — unified panel combining ACS racial equity + HMDA mortgage data with 3 view modes:
  - **A · Gap Chart**: Diverging BarChart (recharts) per metric; White NH = 0 reference line; group color when better, red when worse
  - **B · Profile Grid**: 4×4 CSS grid matrix (groups × metrics); color-coded cells; mini inline bars; gap delta vs. White NH in each cell
  - **C · Opportunity Chain**: Three connected stage panels (Income → Homeownership → Mortgage); dark headline callout with key gap stats; gap summary tiles at bottom
- `public/equity-mockups.html` — standalone HTML prototype used to present options to user (not part of the app build)

**Files modified:**
- `src/tabs/NeighborhoodProfiles/index.tsx` — replaced separate `RacialEquitySection` + `MortgageLendingSection` imports with single `UnifiedEquitySection`

**Architecture note:** `Section.tsx` and `MortgageSection.tsx` are retained (not deleted) — they remain the transplant-ready building blocks if the unified section is later promoted to its own tab. `UnifiedEquitySection.tsx` is the production component.

**Default view:** Profile Grid (B) — most data-dense, easiest to scan for neighborhood comparison.

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

---

### Session 13 — Phase 3: Racial Equity + HMDA Mortgage Lending (March 2026)

**Goal:** Begin Phase 3 (Racial Equity Dashboard) with race-disaggregated ACS metrics embedded in Neighborhood Profiles, structured for easy transplant to a standalone tab.

**Architecture decision:** Built as a self-contained `RacialEquitySection` component in `src/tabs/RacialEquity/Section.tsx` rather than inline in Neighborhood Profiles. This means promoting it to its own tab later requires only: wrapping in a tab shell, adding a nav entry, and wiring into App.tsx. The section itself doesn't move. Transplant path is documented in the component's header comment.

**Data source:** ACS 5-Year 2022 — tables B03002 (population by race), B19013 (median income by race), B17001 (poverty by race), B25003 (tenure/homeownership by race). Same Census API already in use for income/rent data.

**Files created:**
- `scripts/build_racial_equity.py` — fetches 25 ACS variables for 226 Hamilton County tracts, maps to neighborhoods via nearest centroid (same pattern as build_disability.py), computes poverty rates + homeownership rates from raw counts, population-weights income medians as approx, writes JSON
- `public/data/neighborhood_racial_equity.json` — placeholder `{}` until script is run
- `src/tabs/RacialEquity/Section.tsx` — self-contained component showing population composition, income gap callout, and comparison bar charts for income/poverty/homeownership by race group (Black, White NH, Asian, Hispanic)

**Files modified:**
- `src/types/index.ts` — added `NeighborhoodRacialEquityStats` interface
- `src/utils/api.ts` — added `NeighborhoodRacialEquityStats` import + `fetchNeighborhoodRacialEquityStats()` with cache
- `src/tabs/NeighborhoodProfiles/index.tsx` — imported `RacialEquitySection`; mounted at bottom of profile tab with comment marking transplant point

**What the section shows (once build script is run):**
1. Population composition bar (racial breakdown of neighborhood pop)
2. Key disparities callout — Black/White NH income gap in ¢ on the dollar; homeownership gap in percentage points
3. Median household income by race (horizontal bar chart)
4. Poverty rate by race (horizontal bar chart)
5. Homeownership rate by race (horizontal bar chart)
6. Methodology note (income is approx; poverty/homeownership are exact from counts)
7. Urban League "State of Black Cincinnati" citation

**Suppression handling:** Census suppresses cells with < 15 sample households. Null values render as "—" in the UI; metrics with no valid data for any group show "Insufficient data for this neighborhood."

**Racial equity build status:** User ran `python3 scripts/build_racial_equity.py`; 47 neighborhoods populated. Sample data confirmed plausible: West End Black income $19,811 vs White NH $129,333 (15¢/$1); large homeownership gaps in Mt. Airy, Winton Hills, West Price Hill.

---

**Phase 3.2 — HMDA Mortgage Lending (same session continuation)**

**Goal:** Add race-disaggregated mortgage lending approval rates (CFPB HMDA 2022) to Neighborhood Profiles, structured as a transplantable component like RacialEquitySection.

**Data source:** CFPB HMDA Data Browser API (`ffiec.cfpb.gov/v2/data-browser-api/view/aggregations`), no auth required. Home-purchase loans (`loan_purposes=1`) in Hamilton County (`counties=39061`), 2022. Race variable queried separately from Hispanic/Latino ethnicity (HMDA architecture — ethnicity is not a race code).

**Build script:** `scripts/build_hmda.py`
- County-level aggregation for benchmark rates (stored as `_county` key)
- Tract-level by race for neighborhood-level rates
- Actions 1+2 = approved, 3 = denied
- Suppresses rates with < 10 applications per group
- Falls back to county rates for neighborhoods with no tract-level data (source='county_fallback')

**Files created:**
- `scripts/build_hmda.py` — fetches CFPB HMDA, maps tracts to neighborhoods, outputs approval rates by race
- `public/data/neighborhood_hmda.json` — placeholder `{}` until script is run
- `src/tabs/RacialEquity/MortgageSection.tsx` — self-contained component: approval gap callout, horizontal bar chart with county reference line, application volume table

**Files modified:**
- `src/types/index.ts` — added `HMDARaceStats` and `NeighborhoodHMDAStats` interfaces
- `src/utils/api.ts` — added `fetchNeighborhoodHMDAStats()` with `_hmdaCachePromise` cache
- `src/tabs/NeighborhoodProfiles/index.tsx` — imported `MortgageLendingSection`; mounted below `RacialEquitySection`

**What the section shows (once build script is run):**
1. County-level White NH vs Black approval rate benchmark (header callout)
2. Key disparities callout — approval gap between Black and White NH applicants in this neighborhood
3. Approval rate bar chart by race (with county-level dashed reference line)
4. Application volume table (approved / denied / total per group)
5. CFPB Data Browser + Urban League citations

**CFPB API debugging (hard-won knowledge, do not re-litigate):**
- The API is behind Akamai CDN which blocks Python urllib by TLS fingerprint. All calls use `curl` subprocess.
- The aggregations endpoint allows max 2 "filter criteria" (counties/years are free; races, ethnicities, actions_taken, loan_purposes each count as one). Exceeding 2 returns HTTP 400 with `{"errorType":"provide-two-or-less-filter-criteria"}`.
- Commas in parameter values must be literal, not percent-encoded (%2C breaks the parser). `urllib.parse.urlencode` encodes them by default — fixed via custom `build_qs()` helper.
- `loan_purposes=1` (home-purchase-only filter) cannot be combined with both `races` and `actions_taken` without exceeding the 2-criterion limit. The script drops it; all loan types are included. This is disclosed in the UI methodology note.
- Tract-level data uses `variable=census_tract` with `actions_taken=1` and `actions_taken=3` as separate calls per race (2 criteria each: races + actions_taken). This is the most reliable pattern.

**Pending:**
- [ ] Run `python3 scripts/build_hmda.py` to populate the JSON and confirm tract-level data is now working. Expected: county gap ~15pp (White 83% / Black 68%), neighborhoods with enough volume should show tract-level variation.

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

---

### Session 12 — Polish Pass + Phase 2 Address Lookup + Blood Lead Research (March 2026)

**Goal:** Polish existing features before new phase work; add address-level lookup to Lead Safety; research blood lead case data availability.

**Polish pass (no new features — fixes and accuracy):**
- `src/tabs/NeighborhoodExplorer/index.tsx` — corrected EJ methodology tooltip: now accurately describes AirToxScreen 2019 via ArcGIS (not CSV composite); discloses EJScreen offline since Feb 2025
- `src/tabs/Roadmap/index.tsx` — Lead Safety marked Completed; "Air Quality & Environmental Burden" marked Completed (AirToxScreen); "Environmental Justice Cumulative Impact Map" updated to In Progress; stale EJScreen API references removed throughout
- `PROGRESS.md` — Session 11 entry rewritten to reflect AirToxScreen pivot accurately
- `PROJECT_ROADMAP.md` — Full reconciliation: Phase 1 marked complete with accurate records; Phase 2.1 updated to match Lead Safety tab as built; Data Sources table replaced with status-based format; Lead Safety added to Current State table; Session Sequencing section removed (was stale to-do list)

**Address lookup — Lead Safety tab:**

New `AddressSearchCard` component added to `src/tabs/LeadSafety/index.tsx`. Lets residents search for their specific street address in the GCWW replacement program dataset and see:
- Private-side and public-side material type (with human-readable labels: PB → Lead, CU → Copper, GS → Galvanized)
- Current program status (Complete / In Progress / Pending)
- Public-side replacement date if applicable
- Color-coded risk badge per material type
- Clear "not found" message explaining dataset scope (6,400 program lines, not 33,449 city-wide)
- Link to GCWW's interactive ArcGIS map for address-level detail when no match found

New `searchLeadByAddress(query)` function added to `src/utils/api.ts` — queries `b4xq-u3su` with `upper(address) LIKE '%TERM%'`, returns up to 10 results ordered by address.

`DataGapsCard` updated: blood lead section now links to the 2024 Lead Annual Report PDF directly and states we're pursuing a public records request for the census tract table powering those maps.

**Blood lead case data research:**
The Cincinnati Health Dept's 2024 Lead Annual Report contains census tract maps (testing rates + elevated prevalence, 2015–2024 avg) but not a downloadable table. The EPA's Ohio census-tract blood lead dataset is restricted under the Privacy Act. The Ohio Public Health Warehouse has an interactive web tool with tract-level data but no public API. **Recommended path:** Public records request to Cincinnati Health Dept for the census tract aggregate table. Small-cell suppression likely limits disclosure for low-count tracts.

**Files modified:**
- `src/utils/api.ts` — added `searchLeadByAddress()`
- `src/tabs/LeadSafety/index.tsx` — added `AddressSearchCard`, `materialLabel()`, `materialRisk()`, `statusLabel()` helpers; updated `DataGapsCard` blood lead section; wired `AddressSearchCard` into layout above neighborhood cards
- `src/tabs/NeighborhoodExplorer/index.tsx` — EJ methodology tooltip corrected
- `src/tabs/Roadmap/index.tsx` — status updates and stale references removed
- `PROGRESS.md`, `PROJECT_ROADMAP.md` — documentation reconciliation

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

**Next:** Phase 3 — Racial Equity Dashboard (Census ACS data by race, per neighborhood). All data sources already in system.

---

### Session 11 — Phase 2 Continued: EJScreen Environmental Justice Dimension (March 2026)

**Goal:** Add EPA EJScreen environmental justice indicators as a new scored dimension in the Neighborhood Explorer.

**Key discovery:** EPA EJScreen REST API was taken offline February 5, 2025 (Trump administration rollback). `ejscreen.epa.gov/mapper/ejscreenRESTbroker.aspx` returns 404. Bulk CSV downloads (PEDP / Zenodo) are 5.9GB — too large for automated retrieval. **Solution:** EPA's AirToxScreen 2019 ArcGIS feature service is still live and provides the same core metric (cumulative air toxics cancer risk).

**Data source used (confirmed live 2026-03-29):**
```
https://services.arcgis.com/cJ9YHowT8TU7DUyn/arcgis/rest/services/
  Cancer_risk_per_million_due_to_cumulative_air_toxics/FeatureServer/0/query
  ?where=FIPS='39061'&outFields=GEOID10,Population,TOTAL_RISK,AC_DIESEL_PM,RESPIRATORY_HI
  &returnGeometry=false&f=json&resultRecordCount=2000
```
Returns 222 Hamilton County census tracts in a single request. Key field: `TOTAL_RISK` (cumulative air toxics cancer risk, cases per million).

**Architecture:** Same pre-build pattern as parks/census. `scripts/build_ejscreen.py` queries the ArcGIS endpoint directly (no download required), maps tracts to neighborhoods via nearest centroid (same logic as ACS loader), population-weights `TOTAL_RISK` across tracts, and writes `public/data/neighborhood_ejscreen.json`.

**Output (confirmed 2026-03-29):** 222 tracts → 45 neighborhoods. Range: 29.5–36.0 cases/million. Top burden: Lower Price Hill/Queensgate (36.0), West End (35.9), Downtown (35.7), Camp Washington (35.2) — all in the Mill Creek industrial corridor adjacent to I-75, as expected.

**Metric:** `ejIndex` = population-weighted `TOTAL_RISK`. Higher = greater air toxics burden = lower Explorer score (`higherIsBetter: false`). Scores are min-max normalized across Cincinnati neighborhoods.

**Files created:**
- `scripts/build_ejscreen.py` — queries EPA ArcGIS, aggregates to neighborhoods, writes JSON
- `public/data/neighborhood_ejscreen.json` — ✅ populated (45 neighborhoods)

**Files modified:**
- `src/types/index.ts` — added `'ej'` to DimensionId; added EJ fields to NeighborhoodRawMetrics; added NeighborhoodEJStats interface
- `src/utils/api.ts` — added `fetchNeighborhoodEJStats()` with cache
- `src/utils/scoring.ts` — added `ej` case to getRawValue(); added `ej: null` to dimensionScores initializer
- `src/tabs/NeighborhoodExplorer/index.tsx` — added EJ dimension (`enabled: false` by default); added loadEJ useEffect; methodology tooltip discloses EJScreen offline since Feb 2025
- `src/i18n/en.json`, `es.json` — added `explorer.dim.ej.label` and `.description`
- `src/tabs/Roadmap/index.tsx` — updated Lead Safety and EJ roadmap items to reflect completed/in-progress status; removed stale EJScreen API references
- `PROJECT_ROADMAP.md` — section 2.2 marked partial complete; TRI noted as future EJ enhancement

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors). Committed and pushed to Vercel.

**No pending items for this session.**

---

### Session 10 — Phase 2 Start: Lead Safety Tab (March 2026)

**Goal:** Begin Phase 2 with the highest-urgency civic gap — lead service line safety. Build a new tab showing GCWW lead service line inventory by neighborhood, replacement program activity, and actionable resident guidance.

**New tab: Lead Safety (`src/tabs/LeadSafety/index.tsx`)**

Architecture follows the Accessibility tab pattern: pre-built static JSON for the expensive inventory data, live SODA query for the replacement activity data, graceful degradation if the static file hasn't been generated yet.

**Files created:**
- `src/tabs/LeadSafety/index.tsx` — full tab component
- `public/data/lead_service_lines.json` — placeholder `{}` until `build_lead.py` is run
- `scripts/build_lead.py` — pre-compute script (same pattern as `build_disability.py`)

**Files modified:**
- `src/types/index.ts` — added `'lead'` to `TabId`; added `NeighborhoodLeadStats` interface
- `src/utils/api.ts` — added `fetchNeighborhoodLeadStats()`, `fetchLeadReplacements()`, `LeadReplacementRecord` interface
- `src/App.tsx` — added lazy import and `case 'lead'` to render switch
- `src/components/layout/TabNav.tsx` — added `LeadIcon` and lead tab entry (positioned before Accessibility)
- `src/i18n/en.json`, `es.json` — added `nav.lead` key

**What the tab shows:**
1. **Urgency Banner** — city-wide stats (33,449 lines, ~220 children/year, 36.8% testing rate) framed as a public health call to action
2. **Service Line Inventory card** — from pre-built JSON: lead/unknown/copper/galvanized/replaced counts with visual bar breakdown; risk badge (High/Elevated/Moderate/Lower) based on % lead+unknown
3. **Replacement Activity card** — live SODA query on `ntfu-vnkd`; shows count + year-by-year bar chart of completed replacements
4. **What You Can Do card** — address lookup link, free testing kits, replacement program info, interim safety tips, renters' rights
5. **City-wide Comparison** — horizontal bar chart of all neighborhoods ranked by % lead+unknown (only renders if pre-built JSON is populated)
6. **Data Gaps card** — transparent about what's missing (blood lead case data by neighborhood, interior plumbing, ArcGIS inventory vs. confirmed inspections)

**Data sources used:**
- `ntfu-vnkd` — GCWW Private-Side One-off Lead Service Line Replacements (live, queryable from browser)
- `/data/lead_service_lines.json` — pre-built from `scripts/build_lead.py`

**Dataset confirmed (2026-03-28 live test):**
- `ntfu-vnkd` — returns 403 (authentication required). Do not use.
- `b4xq-u3su` — publicly accessible. Confirmed fields:
  `address, status, emergency, replacement, adminarea, municipality, privatematerialtype, publicmaterialtype, publicreplacedate, gis_branchnumber`
- Neighborhood field: **`adminarea`** (case TBD — use `upper()` for WHERE clauses)
- Date field: **`publicreplacedate`** (ISO 8601, public-side replacement date)
- Material field: **`privatematerialtype`** (Lead, Copper, Unknown, Galvanized, etc.)
- Strategy 1 (HTML scrape) failed — mygcww.org returned unstructured HTML. Strategy 2 (SODA fallback) found `b4xq-u3su` fields but no neighborhood field initially. Updated script now uses `adminarea` and fetches full inventory grouped by `adminarea + privatematerialtype`.

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

**Session 10 follow-up (continued in Session 11):**

`build_lead.py` required two fixes before producing correct data:
1. Dataset `ntfu-vnkd` returns 403. Switched to `b4xq-u3su` (publicly accessible).
2. Material types are chemical codes (PB = lead, CU = copper), not English words. Original `is_replaced()` fired on any record with a `publicreplacedate`, misclassifying all copper lines as "replaced." Replaced with `classify_record()` using explicit code sets and status-aware logic.

**Final output (2026-03-28 run):**
- 71 neighborhoods, 6,448 records
- 1,142 active lead lines | 67 replaced | 5,216 copper/safe | 22 unknown | 1 galvanized
- Hotspots: West Price Hill (159), Avondale (89), East Price Hill (77), Hyde Park (62)
- Worst % concentration: Lower Price Hill 47%, West Price Hill 36%, Cheviot 21%

`adminarea` values are SNA neighborhood names in ALL CAPS. Script title-cases them with CUF as a special case (acronym). All neighborhood keys normalize correctly via `stripNeighborhoodName()`.

**`LeadSafety/index.tsx` framing updates:**
- "Service Line Inventory" → "Replacement Program Status" with scope caveat (covers ~6,448 program lines, not city-wide 33,449 total)
- StatRow labels clarified: "Active lead lines (pending replacement)", "Lead lines successfully replaced"
- Attribution uid corrected to `b4xq-u3su`

**Address Lookup crime marker bug fixed (committed in Session 10):**
Map code was checking `crime.location?.latitude` but Socrata returns `latitude_x`/`longitude_x` as top-level fields. Fixed in `src/tabs/AddressLookup/index.tsx`; committed in commit `108eab9`.

---

### Session 9 — Phase 1 Completion: Parks Integration + Police Accountability Audit (March 2026)

**Goal:** Complete Phase 1 (parks JSON integration), and audit/fix the Police Accountability tab against the principles we published in the Roadmap.

**NeighborhoodExplorer (`src/tabs/NeighborhoodExplorer/index.tsx`):**
- Updated `loadParks` useEffect to first attempt loading `/data/cagis_neighborhood_parks.json` (the pre-computed static file from `scripts/build_parks.py`)
- If static file exists and is non-empty, applies it directly — eliminates all 52 runtime CAGIS calls and the 30–60s load delay
- Falls back to the existing CAGIS batch strategy if the file is absent (e.g., on first deploy before the script is run)
- **To activate:** run `python3 scripts/build_parks.py` locally and commit the output JSON

**Police Accountability (`src/tabs/PoliceAccountability/index.tsx`) — Principles Audit:**

The audit identified two issues:

1. **"Crime Map" tab removed** — The tab was labeled "Crime Map" and showed a table of the 100 most recent individual crime records, filtered by offense type. This is functionally a crime ticker — individual incidents without accountability context — which directly violates the principle we published on the Roadmap ("Individual incident maps without context amplify fear without accountability. We show aggregate trends, not a live crime ticker."). Removed: the `crime` sub-section type, three `useSODA` hooks (`crimeOld`, `crimeNew`), `mergedCrime` memo, all associated state (`crimeType`, `crimeYear`), and the full rendering block. Aggregate crime trend data remains available in Neighborhood Profiles (Tab 2) which is the appropriate context.

2. **Use of Force incident map reframed** — The map shows *police use-of-force locations*, not crime locations. Renamed from "Use of Force — Incident Map" to "Where CPD Used Force — Geographic Distribution." Added explicit note: "This is accountability data about police conduct, not a crime map. Concentration in certain neighborhoods reflects patrol patterns and deployment, not resident behavior." This framing distinction is important for our credibility with community organizations.

3. **Disclaimer updated** — Added sentence explaining why individual crime incident records are not shown here, and directing users to Neighborhood Profiles for crime trend data.

**TypeScript status:** ✅ `tsc --noEmit` passes clean (0 errors).

**Phase 1 complete — remaining item:**
- [ ] Run `scripts/build_parks.py` locally, commit `public/data/cagis_neighborhood_parks.json` to activate fast park scoring in Explorer

---

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
- [ ] **Run updated `scripts/build_lead.py` locally** — Uses confirmed `b4xq-u3su` dataset with `adminarea` + `privatematerialtype` grouping. Check that `adminarea` values match SNA neighborhood names — if not, update the display_name mapping in the script.
- [x] **Confirmed `b4xq-u3su` field names** — `adminarea` (neighborhood), `privatematerialtype` (material), `publicreplacedate` (date), `status`, `replacement`. Updated `api.ts` and build script accordingly.
- [ ] **Fix Address Lookup map label** — Map section says "location and nearby crime" but no crime is shown on the map. Either add a nearby-crime radius overlay or rename the section. Needs investigation of `src/tabs/AddressLookup/index.tsx`.
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
