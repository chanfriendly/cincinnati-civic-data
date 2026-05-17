# CHANGELOG — Cincinnati Civic Data Platform

> This file is the project's institutional memory for failures, decisions, and technical gotchas. Every session should begin by reading this file. `PROGRESS.md` is the narrative session log; this file is the *why-not* and *hard-won* reference. If you hit a dead end, document it here before pivoting — future sessions depend on it.

---

## Current Status

**Phase:** Phase 7 — Public Health & Community Assets (UC Nursing use case)  
**Last updated:** 2026-04-28  
**Active focus:** Healthcare facilities, CDC PLACES health outcomes, community councils, voting precincts  
**Live site:** https://cincinnati-civic-data.vercel.app  
**TypeScript:** ✅ `tsc --noEmit` passing clean (0 errors) as of Session 29

---

## Session 30 — API Gotchas

### ACS B16001 — suppressed at census tract level
**Symptom:** `build_demographics.py` queried `B16001_001E` and `B16001_002E` (Language Spoken at Home). All 226 Hamilton County tracts returned `null` for both fields.  
**Fix:** Use `C16001_001E` (total population 5+) and `C16001_002E` (English only) — the collapsed table, which IS available at tract level. `B16001` is a highly detailed 120-column table that the Census Bureau suppresses at small geographies.  
**Pattern:** Always use `C16001` for tract-level language-at-home data. `B16001` is county/place only.

### ACS B01002_001E — median age returns decimal string, not integer
**Symptom:** `safe_int('31.6')` returns `None`, causing `medianAge: null` in output.  
**Fix:** Added `safe_float()` function alongside `safe_int()`. All median-type fields (and any ACS value that can be a decimal) must use `safe_float()` rather than `safe_int()`.

---

## Session 29 — API Gotchas

### CDC PLACES API — `$where` approach causes HTTP 400
**Symptom:** `build_health_outcomes.py` original query using `geographiclevel='Census Tract' AND stateabbr='OH'` in a `$where` param returns HTTP 400 Bad Request.  
**Fix:** Use `countyfips=39061` as a direct column filter (no `$where` needed). The API returns all measures for all Hamilton County census tracts without any further filtering needed. Then filter `measureid` in Python post-fetch.  
**Pattern:** `https://data.cdc.gov/resource/cwsq-ngmh.json?countyfips=39061&$limit=50000`

### HRSA ArcGIS FeatureServer URL — 400 from sandbox
**Symptom:** HRSA Health Center Finder ArcGIS URL returns HTTP 400 from the build environment.  
**Fix:** Not resolved. OSM Overpass data used as sole source. HRSA FQHCs are partially captured via OSM name keyword matching (e.g. "health center", "community health"). To fully populate FQHCs, run the script in an environment with access to `services1.arcgis.com`.

### SAMHSA Treatment Locator — unreachable from sandbox
**Symptom:** `https://findtreatment.gov/locator/v1/facilities` returns no data.  
**Fix:** Not resolved. Substance use treatment centers in the data come from OSM tags only (8 facilities). To enrich, run the script with network access to the SAMHSA API.

### `neighborhood_acs.json` structure — list, not dict
**Pattern note:** `public/data/neighborhood_acs.json` is a flat **list** of 226 census tract objects (each with `geoid`, `lat`, `lon`, etc.), NOT a dict keyed by geoid. Any script that reads this file must load it as a list and build its own index. `build_health_outcomes.py` was updated to handle this correctly.

---

## Failed Approaches

*Things tried that didn't work. Read this before attempting any of these again.*

| Date | Area | What Was Tried | What Happened | Lesson |
|------|------|---------------|---------------|--------|
| Early 2026 | Socrata auth | Passed app token as `X-App-Token` request header | Cincinnati's Socrata portal rejects with HTTP 403 — the header triggers a CORS preflight that the server won't allow | Always pass as `$$app_token` query param, never as a header |
| Early 2026 | SODA queries | Percent-encoded the `$where` key as `%24where` | Socrata parser silently fails or returns wrong results | Never percent-encode SODA parameter *keys*. Only values get `encodeURIComponent`. See `buildSODAQuery()` in `api.ts` |
| Early 2026 | Building permits | Used derived view `tsjj-dcaf` | No queryable columns — all queries return empty | Only use canonical dataset `uhjb-xac9` for building permits |
| Apr 2026 | CAGIS Parks | Queried layer 34 (Hamilton County Parks) | HTTP 400 — CAGIS silently removed that layer | Use layer 46 (`Cincinnati_Parks_and_Greenspace`). Field names also changed: `NAME` → `PARK_NAME`, `PARKTYPE` → `PARK_DESIGNATION`, `SHAPE__Area` → `PARK_SIZE_ACRES` |
| Apr 2026 | HUD program colors | Fuzzy string matching on raw HUD codes (e.g. "LMSA", "Sec 8 NC") against terms like "section 8" | Matchers never fire — raw codes don't contain plain-English substrings | Must use an explicit `PROGRAM_LABELS` map keyed to exact codes. Map lives in `HousingInventorySection.tsx` |
| Apr 2026 | AI judge arithmetic | Had AI model (LLM) compute composite scores from its own sub-scores | Model reported composites inconsistent with sub-scores (off by 20–30 pts) | Never trust LLM-computed arithmetic. Always recompute composites externally from the raw sub-scores |
| Ongoing | SORTA route data | Expected `routes` field in `sorta_stops.json` to be populated | All stops have `routes: []` — the GTFS static export doesn't include route assignments at stop level | Transit scoring uses stop *count*, not route count. Do not rebuild on assumption of route data |
| Ongoing | EJScreen live API | Planned to query EPA EJScreen API live | EJScreen has been offline since Feb 2025 | Use pre-built `public/data/neighborhood_ejscreen.json` (2019 vintage). Disclose offline status in UI tooltip. Do not attempt live queries |
| Ongoing | Community Perceptions by neighborhood | Tried to filter `gdf4-fqik` by neighborhood | Dataset has no neighborhood column — it's a city-wide resident survey | Show city-wide averages with clear disclaimer. Cannot be broken out per neighborhood with current data |
| Apr 2026 | Cincinnati FIPS place code | First attempt used `place:14000` for Cincinnati in Census ACS B19080 query | All 12 years returned HTTP 204 (no data) | The correct FIPS place code for Cincinnati city, Ohio is **`15000`**, not `14000`. Verified by listing all Ohio places in a single ACS query. Documented in `scripts/build_income_percentiles.py` |
| Apr 2026 | Pre-1989 Cincinnati income tax rate history | Attempted to source rate history earlier than 2.1% → 1.8% change (2020-10-02) | Cincinnati Finance Dept page only documents current + immediately prior rate. Pre-1989 rates widely cited anecdotally (2.1% since late 1980s) but no primary-source ordinance citation | **Do not fabricate dates.** `cincinnati_tax_rate_history.json` ships with only verified entries and an open invitation (GitHub issue) for primary-source contributions |

---

## Known Limitations

*Ongoing constraints that aren't bugs — just the reality of the data.*

- **Census tract → neighborhood mapping** uses nearest centroid. Tracts straddling two neighborhoods are assigned to whichever centroid is closer. There is no exact fix without a full spatial join.
- **OHGO traffic** only covers Ohio-managed roads (interstates, state routes). Cincinnati city streets are not in this dataset. Coverage note is shown in the UI.
- **Neighborhood Explorer GeoJSON** tries 4 CAGIS URLs with 8s timeouts each. If all fail, the map won't render but scoring still works. Long-term fix: embed a static `public/data/cincinnati_neighborhoods.geojson`.
- **AI summary outputs** (Address Lookup + Police Accountability) have not been formally reassessed for framing, accuracy, or appropriate disclosure. See `TODO(reassess-ai-summary)` in `AddressLookup/index.tsx`.
- **Spanish translations** are machine-generated. A native speaker review is pending. A disclaimer banner now shows when `language === 'es'`.
- **Eviction data** requires a data partner (Legal Aid Society). County totals from Eviction Lab are available but not integrated. Do not build without tract-level data.
- **First Street Foundation** (property-level flood probability) is a paid API — deferred indefinitely.

---

## Design Decisions

*Why things are the way they are. Read before proposing changes to architecture.*

| Date | Decision | Rationale |
|------|----------|-----------|
| Early 2026 | `$$app_token` as query param, not header | CORS preflight on header causes 403 from Cincinnati's Socrata portal |
| Early 2026 | `stripNeighborhoodName()` normalizes all neighborhood names to lowercase-alphanumeric | CPD datasets use UPPER CASE, GeoJSON uses Title Case — must normalize to match across sources |
| Early 2026 | Pre-build static JSON files for slow data (parks, schools, transit equity, HMDA, HUD) | Live CAGIS/ArcGIS queries for 52 neighborhoods take 30–60 seconds. Static files load instantly. Build scripts live in `scripts/` |
| Early 2026 | Nearest-centroid mapping for Census tract → neighborhood | True spatial join requires PostGIS or a server-side process. Centroid approximation is good enough at neighborhood granularity |
| Early 2026 | Vercel serverless function (`api/proxy.js`) for key injection | OpenRouter and Census keys must never be in the browser bundle. Proxy injects them server-side |
| Early 2026 | `minimax/minimax-m2.5` via OpenRouter for AI summaries | Cost-effective for summarization tasks; uses OpenAI-compatible message format |
| Apr 2026 | SODA `count(*)` query for permit totals, not just fetching 500 rows | Without a separate count query, the total would be capped at the pagination limit, producing misleading numbers |
| Apr 2026 | Explicit `PROGRAM_LABELS` map for HUD codes | HUD's internal codes (e.g. "PD/8 SR", "RAD PH Conv") are not human-readable. Residents need plain English |
| Apr 2026 | `NeighborhoodExplorer` scoring runs schools dimension as disabled | No open, reliable school quality data source exists. Placeholder exists in code but does not score |
| Apr 2026 | Park Access and Flood Risk scores use pre-computed static files, not live CAGIS | 52 async CAGIS/FEMA queries took 30–60s on map load; replaced with `cagis_neighborhood_parks.json` (parks) and centroid-based FEMA lookup |
| Apr 2026 | "Measured vs Modeled" badge convention | Introduced on the Tax & Revenue tab to separate primary-source facts (rate history, ACS income percentiles, city revenue ledgers) from modeled estimates (ITEP Ohio incidence applied to Cincinnati percentiles). Any future tab presenting modeled or imputed data should reuse the same badge + disclosure pattern so "this is a measurement" vs "this is a model" is load-bearing in the UI, not buried in footnotes |
| Apr 2026 | ITEP Who Pays? sourced statewide, disclosed as Ohio-wide proxy | ITEP does not publish a Cincinnati-specific incidence model. Using Ohio statewide incidence is the best available public source. The tab and the Limitations page both disclose that Cincinnati's tax mix (flat 1.8% municipal income tax) differs from the Ohio average — the model is a reasonable *pattern*, not a household measurement |
| Apr 2026 | New dedicated "Limitations & Methodology" tab rather than per-tab disclosures | Boundary ambiguity (SNA vs Community Council), nearest-centroid mapping, AI-generated-content disclosures, data vintages, and Legistar blockage each recur across many tabs. Consolidating them in one public page lets advocates and journalists cite one URL instead of digging through per-feature tooltips. Per-tab tooltips remain where they aid immediate interpretation; the Limitations tab is the authoritative long-form record |

---

## Data Source Quick Reference

*Field names and gotchas that have burned us before.*

| Dataset | UID | Neighborhood Field | Date Field | Gotcha |
|---------|-----|--------------------|------------|--------|
| Crime STARS | `7aqy-xrv9` | `cpd_neighborhood` (UPPER CASE) | `datereported` | |
| Crime PDI (legacy) | `k59e-2pvf` | `cpd_neighborhood` (UPPER CASE) | `date_reported` | |
| Building Permits | `uhjb-xac9` | `neighborhood` (UPPER CASE) | `applieddate` | Use THIS, not `tsjj-dcaf` |
| Traffic Stops | `ktgf-4sjh` | `cpd_neighborhood` (UPPER CASE) | `interview_date` | |
| Food Safety | `rg6p-b3h3` | `neighborhood` (UPPER CASE) | `action_date` | Per-violation rows; filter `neighborhood != 'N/A'` |
| PLAP (Problem Landlords) | `pk9w-99n6` | `neighborhood` (UPPER CASE) | `sr_recd_date` | No generic `date` field |
| Fire & EMS | `vnsz-a3wp` | `neighborhood` (UPPER CASE) | `create_time_incident` | |
| Tax Abatements | `tkp7-yf64` | `ccd_neigh` (**Title Case**) | — | Different case convention |
| Community Perceptions | `gdf4-fqik` | **None** | — | City-wide survey only, no neighborhood breakdown |
| CAGIS Parks | layer 46 | — | — | Layer 34 was removed; use 46. Field: `PARK_NAME`, `PARK_DESIGNATION`, `PARK_SIZE_ACRES` |

---

## Legistar Integration (Phase 2) — Blocked

**Discovered:** 2026-04-10  
**Status:** Cincinnati's Legistar instance is NOT configured for API access.

Attempting `https://webapi.legistar.com/v1/cincinnati/bodies` returns:
```
LegistarConnectionString setting is not set up in InSite for client: cincinnati
```

The API infrastructure exists but the city has not enabled it. **Do not attempt live Legistar API calls** — they will return an error for all endpoints.

**Workarounds for Phase 2 (voting records / legislation):**
1. Cincinnati's Legistar *web interface* is public at `https://cincinnatioh.legistar.com/`. Deep links work for surfacing relevant legislation — consider linking directly into Legistar search results.
2. A one-time static scrape of recent ordinances (housing, police, infrastructure budgets) could power a pre-built JSON — lower fidelity than a live API but doesn't require the API to work.
3. Cincinnati Open Data portal (`data.cincinnati-oh.gov`) — check if any legislative/ordinance datasets exist there.

**At-large structure note:** Cincinnati City Council has no geographic districts. All 9 members are elected citywide. "Who represents me" cannot be address→district mapping — all 9 members represent every address. The feature should surface all 9 council members with contact info, framed as "these are your 9 representatives."

---

## Session Log

*High-level summary. See `PROGRESS.md` for full narrative of each session.*

| Session | Date | Key Work |
|---------|------|----------|
| 1–10 | Early 2026 | Initial scaffold, 4 working tabs, API wiring, CAGIS cards, Socrata auth fixes |
| 11 | Mar 2026 | Lead service line tracker (`LeadSafety` tab), `lead_service_lines.json` |
| 12 | Mar 2026 | EPA EJScreen AirToxScreen integration, Explorer EJ dimension |
| 13 | Mar 2026 | Racial equity metrics — `UnifiedEquitySection`, HMDA mortgage data |
| 14 | Mar 2026 | Census ACS per-neighborhood wiring, dropdown fix, 311 service requests |
| 15 | Mar 2026 | Pre-compute park acreage (`build_parks.py`), Explorer speed improvement |
| 16 | Apr 2026 | Zoning Reform Tracker (Connected Communities), HUD affordable housing inventory |
| 17 | Apr 2026 | HUD program type plain-English labels (`PROGRAM_LABELS` map) |
| 18 | Apr 2026 | School proximity (Tab 1), transit equity gap analysis, neighborhood comparison tool |
| 19 | Apr 2026 | CAGIS parks bug fix (layer 34 → 46), Address Lookup visualization redesign |
| 20 | Apr 2026 | Mill Creek flood infrastructure context, Spanish AI-translation disclaimer |
| 21 | Apr 2026 | Data accuracy audit, Explorer methodology tooltips rewritten for public, UX clarity pass |
| 22 | Apr 2026 | Architecture principles codified: distill > display, data-to-action, Cincinnati-first, permanent > band-aid |
| 23 | Apr 2026 | Accountability layer: CouncilPanel (all 9 at-large members), Roadmap accountability section, Legistar investigation |
| 24 | Apr 2026 | Legistar Phase 2a: LegistarBridge with 3 deep links + pre-filled unlock mailto CTA |
| 25 | Apr 2026 | Civic org directory: 19 orgs, 7 categories, CivicOrgsPanel (contextual + full), integrated into NeighborhoodProfiles and CouncilPanel |
| 26 | Apr 2026 | Contextual orgs in Tab 1 (lead, blight, crime), lead service line card with neighborhood lookup, CivicCalendar public comment component |
| 27 | Apr 2026 | Owner Activity tab rewrite (advocate/organizer use case, address-first flow, permit companyname as ownership proxy) |
| 28 | Apr 2026 | Tax & Revenue transparency tab (rate history + ACS B19080 percentiles + ITEP Ohio modeled incidence + city revenue `a9hy-bv25`); dedicated Limitations & Methodology tab (SNA vs Community Council, Oakley example, centroid mapping, AI disclosures, data vintages) |
| 29 | Apr 2026 | Phase 7a: Healthcare facilities (OSM, 458 facilities) + CDC PLACES health outcomes (41 neighborhoods, 10 measures) + HealthOutcomesSection + Healthcare amenities tab in Address Lookup |
| 30 | Apr 2026 | Phase 7b: Community councils directory (52 entries, static JSON) + Voting precinct lookup (live CAGIS layer 44) + Recreation centers (24 CRC centers) + Expanded demographics + broadband (ACS C16001/B01001/B05002/B15003/B28002, 41 neighborhoods) |
| 31 | Apr 2026 | Phase 7c: Life expectancy by neighborhood (CDC USALEEP 2010–2015, 41 neighborhoods, 63–87yr range) + LifeExpectancySection with city-range gradient bar + 23-year equity gap callout |
| 32 | May 2026 | Editorial design system migration — Police Accountability tab: OIS section redesign (digit chips for small counts, CCIA context, Collaborative Agreement / 2014-2016 editorial callouts, legacy chart with officer race breakdown); Use of Force Leaflet map fix (direct fetch bypasses useSODA timing issue, AbortController cleanup); x-axis overlap fix (horizontal bar chart for Subjects by Race) |
| 33 | May 2026 | Design system documentation — `DESIGN_SYSTEM.md` created (color tokens, typography scale, component patterns, Leaflet init pattern, Recharts chart templates, tab migration checklist). `CLAUDE.md` updated to reference it. Inspired by https://github.com/google-labs-code/design.md |
| 34 | May 2026 | Housing Justice tab (formerly "Displacement") — renamed in nav, full C-token migration of `Displacement/index.tsx` (1,480 lines) and `ConnectedCommunitiesSection.tsx`: all old Tailwind color utilities replaced, phase colors remapped to C tokens, sub-nav migrated, serif/smallcaps headings applied, "Housing Justice" eyebrow added |

---

## Next Steps

*Current sprint priorities. See `CLAUDE.md` "Recommended Next Steps" for the full prioritized list.*

1. **About/Limitations deduplication** (Phase 8, #32) — two nav entries for same page; consolidate
2. **OIS legacy chart — color-coded bars** (Phase 8, #33) — 2001 bar = river, 2014–2016 bars = ochre, rest = muted
3. **Neighborhoods Map & Compare + Print/Download** (Phase 8, #34) — layout rework + print brief + CSV export
4. **Housing Justice tab rework** (Phase 8, #35) — editorial layout overhaul per Claude Design prototype
5. **Lead Safety tab rework** (Phase 8, #36) — design system migration + editorial layout
6. 🔄 Manual QA of CAGIS cards (Tab 1) with a Downtown and Hyde Park address
7. 🔄 Mobile testing — Tabs 1 and 3 are primary mobile use cases
