# CHANGELOG — Cincinnati Civic Data Platform

> This file is the project's institutional memory for failures, decisions, and technical gotchas. Every session should begin by reading this file. `PROGRESS.md` is the narrative session log; this file is the *why-not* and *hard-won* reference. If you hit a dead end, document it here before pivoting — future sessions depend on it.

---

## Current Status

**Phase:** Post-foundation — feature complete on core tabs, refinement in progress  
**Last updated:** 2026-04-11  
**Active focus:** Accountability layer (council panel live, Legistar unlock CTA, civic org directory complete)  
**Live site:** https://cincinnati-civic-data.vercel.app  
**TypeScript:** ✅ `tsc --noEmit` passing clean (0 errors) as of Session 21

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

---

## Next Steps

*Current sprint priorities. See `Claude.md` "Recommended Next Steps" for the full prioritized list.*

1. ✅ **Contextual org surfacing in Tab 1** — lead, blight/violations, and high-crime sections surface relevant orgs contextually
2. ✅ **Public comment calendar** — `CivicCalendar` in Tab 1; recurring Council / Planning / BZA / CDBG schedule
3. 🔄 Manual QA of CAGIS cards (Tab 1) with a Downtown and Hyde Park address
4. 🔄 Mobile testing — Tabs 1 and 3 are primary mobile use cases
5. AI summary reassessment — see `TODO(reassess-ai-summary)` in `AddressLookup/index.tsx`
6. Spanish translation review — needs native speaker
7. **Verify lead card** with real Cincinnati address in high-risk neighborhood (Avondale, Westwood)
