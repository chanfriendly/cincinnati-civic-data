# Cincinnati Civic Data Platform — Project Roadmap
**Last updated:** March 2026 | **Informed by:** Sessions 1–11

---

## Vision

Make Cincinnati's public data accessible, honest, and useful to the people who need it most: tenants fighting displacement, parents navigating school choices, residents tracking police accountability, advocates building the case for investment, and journalists holding institutions accountable. We follow the data — and the data says the highest-stakes gaps are lead safety, racial equity, displacement pressure, and environmental justice.

---

## Guiding Principles

1. **Fill civic gaps, not dashboard gaps.** Build what residents actually need, not what's easy to display. If there's no civic-facing lead service line map in Cincinnati, we build one — even if it's harder than adding another chart.

2. **Show the tradeoffs.** Zoning reform vs. displacement risk. Transit investment vs. access equity. Police accountability vs. community trust. The platform should make tradeoffs legible, not obscure them.

3. **Race and place together.** Every metric should be examinable by race and by neighborhood. Data that's only citywide is data that can hide inequity.

4. **Accuracy over completeness.** A broken tab is worse than a missing one. We don't ship unverified data.

5. **Open attribution.** Every data source visible to the user. Every gap labeled as a gap.

---

## Current State (March 2026)

| Tab | Status | Notes |
|-----|--------|-------|
| Address Lookup | ✅ Working | Crime markers fixed; CAGIS cards need live address test |
| Neighborhood Profiles | ✅ Mostly working | Per-neighborhood Census data, dynamic dropdown, 311 live |
| Police Accountability | ✅ Working | Charts + AI Q&A; crime map removed per platform principles |
| Neighborhood Explorer | ✅ Mostly working | EJ dimension added; parks pre-computed (49 neighborhoods) |
| Displacement (Housing Justice) | ✅ Working | Pressure scatter chart, zoning reform tracker, permit trends live |
| Owner Watch | 🔄 Built, not in nav | Component complete (`src/tabs/OwnerActivity/`); not yet wired to TabNav |
| Lead Safety | ✅ Working | GCWW replacement program data (71 neighborhoods, 1,142 lead lines) |
| Accessibility | ✅ Working | 47 neighborhoods with disability data |
| Roadmap | ✅ Working | Reflects completed work and live platform principles |

---

## Phase 1 — Solidify the Foundation ✅ Complete

These fixes and completions to existing functionality were the prerequisite for everything else.

### 1.1 Neighborhood Profiles (Tab 2) ✅
- [x] Per-neighborhood Census data (income, rent burden) from `neighborhood_acs.json`
- [x] Dynamic neighborhood dropdown — only shows neighborhoods with crime records
- [x] Food Safety, PLAP, and Fire & EMS field names verified against live data; date filters fixed
- [x] 311 service requests — dataset `gcej-gmiw`; shows volume, open count, avg resolution time, top request types

### 1.2 Data Path Fixes ✅
- [x] Parks query fixed — invalid `TYPE` field replaced with confirmed `PARKTYPE` field
- [x] Census MultiPolygon fix — TIGERweb ACS2022 REST API (MapServer layer 6) returns 226 Hamilton County tracts with coordinates
- [x] Crime markers in Address Lookup fixed — was reading `crime.location?.latitude`; Socrata returns `latitude_x`/`longitude_x` at top level
- [x] Park acreage pre-computed — `scripts/build_parks.py` generates `public/data/cagis_neighborhood_parks.json` (49 neighborhoods); eliminates 52 sequential runtime CAGIS calls

### 1.3 Police Accountability Principles Audit ✅
- [x] "Crime Map" tab removed — individual incident ticker violated published platform principle
- [x] Use of Force map reframed as accountability data (police conduct), not a crime map
- [x] Disclaimer updated to explain why individual incident records are not shown here

---

## Phase 2 — Lead & Environmental Health
**Priority: Critical | Effort: High**

### 2.1 Lead Service Line Tracker ✅ Complete
Built as a dedicated Lead Safety tab.
- [x] Neighborhood-by-neighborhood breakdown of GCWW replacement program (dataset `b4xq-u3su`)
- [x] Active lead lines, replaced lines, and risk concentration by area — 71 neighborhoods, 1,142 active lead lines
- [x] City-wide urgency framing (33,449 lines remaining, ~220 child cases/year, 36.8% testing rate)
- [x] Resident action guidance: address lookup link, free testing kits, interim safety tips, renters' rights
- [x] City-wide comparison chart showing all neighborhoods ranked by % active lead lines
- [x] Transparent data gap disclosure: program covers ~6,400 of 33,449 total city lines

**Remaining gaps:**
- [ ] Blood lead case rates by census tract (Cincinnati Health Dept. — requires structured access or partnership)
- [ ] Address-level lookup: "Is my address in the program?" (requires GCWW address matching)
- [ ] Full city-wide inventory (33,449 lines) — not yet publicly available in machine-readable form

### 2.2 Environmental Justice Layer ✅ Partial
- [x] EJ dimension added to Neighborhood Explorer — scored by cumulative air toxics cancer risk
- [x] Data source: EPA AirToxScreen 2019 via ArcGIS feature service (45 neighborhoods mapped)
- [x] Methodology tooltip discloses EJScreen was taken offline in February 2025; AirToxScreen 2019 is the most recent publicly available modeled estimate
- [ ] **Future enhancement:** EPA TRI facility-level data — show which specific industrial sites drive the burden in high-risk neighborhoods (complement to tract-level score, not a replacement)

### 2.3 Flood Infrastructure Status
- [ ] Add Mill Creek Barrier Dam / floodwall infrastructure condition to flood zone display (Tab 1 + Explorer)
- [ ] Integrate First Street Foundation flood risk probability data
- [ ] Contextualize: "This address has an X% chance of flooding over 30 years"

**Data sources:** GCWW (lead, `b4xq-u3su`), EPA AirToxScreen / TRI (environmental justice), City Stormwater (floodwall), First Street Foundation API

---

## Phase 3 — Racial Equity Dashboard
**Priority: High | Effort: High**

The Urban League's "State of Black Cincinnati" (June 2024) documents the need: $31,520 vs. $70,909 median household income by race; 17.5% vs. 67% mortgage approval. All of this is derivable from Census data already in our system.

### 3.1 Racial Equity Metrics by Neighborhood
- [ ] Dedicated Equity tab or expanded Neighborhood Profiles view
- [ ] Poverty rate by race, median income by race, homeownership rate by race, rent burden by race — per neighborhood
- [ ] Source: Census ACS B19001 (income), B25003 (tenure), B17001 (poverty) by race tables — same API as existing Census data

### 3.2 HMDA Mortgage Lending Map
- [ ] CFPB HMDA data (public, annual) — mortgage approval rates by race and census tract
- [ ] Redlining legacy overlay (HOLC maps) alongside current lending patterns

### 3.3 Connected Communities Zoning Reform Impact
- [ ] Track new building permit applications filed under relaxed zoning rules (effective July 1, 2024)
- [ ] Show where new density is being added, at what unit types, in which neighborhoods
- [ ] Compare to pre-reform baseline — permit data already in our system

**Why this matters now:** The Connected Communities reform is approaching its second anniversary. The equity question — does relaxed zoning produce affordable housing or accelerate displacement — is answerable with permit data we already have.

---

## Phase 4 — Displacement & Owner Watch Deepening
**Priority: High | Effort: Medium**

The Displacement tab has a live pressure index. Owner Watch has permit/CRA search. This phase deepens both.

### 4.1 Eviction Court Data (Needs Partner)
- [ ] Partnership with Legal Aid Society of Greater Cincinnati for anonymized filing data
- [ ] Eviction Lab provides county totals; tract-level data requires direct court records access
- [ ] Hamilton County: 13,601 filings in 2024 (~9% of all renter households)

### 4.2 HUD Affordable Housing Inventory
- [ ] HUD Picture of Subsidized Households API (public)
- [ ] Map Section 8, LIHTC, and public housing units by neighborhood
- [ ] Flag units with subsidy expiration dates within 5 years

### 4.3 Property Ownership Network (Needs Partner)
- [ ] Link permit applicant names (already in system) to Ohio Secretary of State LLC registry
- [ ] Connect CAGIS parcel ownership data (requires CAGIS parcel layer access)
- [ ] Goal: surface corporate ownership networks, not just individual LLCs

---

## Phase 5 — Schools & Transit
**Priority: Medium | Effort: Medium**

### 5.1 School Proximity in Address Lookup
- [ ] Nearest CPS schools with walk distances and bus service availability
- [ ] Use CPS school location GeoJSON (public) + SORTA data (already in system)
- [ ] Walk zone eligibility indicator (determines whether bus service is provided)

### 5.2 School Quality Data
- [ ] Waiting on Ohio DOE ESSA report cards to become machine-readable
- [ ] Alternative: partner with Strive Partnership for school-level outcome data
- [ ] Explorer Schools dimension currently disabled — this re-enables it

### 5.3 Transit Equity Gap Analysis
- [ ] Compare SORTA stop density and route frequency by neighborhood against income
- [ ] Show job accessibility via transit (time to top Cincinnati employers)
- [ ] Add BRT corridor impact projections as construction progresses (Hamilton Ave + Reading Rd, approved 2024)

---

## Phase 6 — Platform Maturity
**Priority: Ongoing | Effort: Varies**

These are important but depend on earlier phases being solid.

- [ ] **Neighborhood comparison tool** — Side-by-side Explorer dimensions for any two neighborhoods; useful for grant applications and advocacy
- [ ] **Spanish translation review** — Current ES strings are machine-translated; needs native speaker review
- [ ] **Language expansion** — Burmese, Somali, Arabic, Amharic (significant Cincinnati refugee communities)
- [ ] **Mobile optimization** — Address Lookup and Police Accountability are primary mobile use cases
- [ ] **CAGIS GeoJSON static fallback** — Embed a local `cincinnati_neighborhoods.geojson` if CAGIS is unreliable
- [ ] **OSM accessibility infrastructure** — Curb cuts, accessible paths via Overpass API into Accessibility tab
- [ ] **CMS Care Compare** — Nursing homes / home health agencies near each neighborhood (Accessibility tab)
- [ ] **Zoning change tracker** — Planning Commission variance requests (requires PDF parsing or partner)

---

## Partnership Priorities

| Partner | What They Unlock | Status |
|---------|-----------------|--------|
| Legal Aid Society of Greater Cincinnati | Eviction filing data at tract level | Not yet approached |
| Cincinnati Health Department | Full lead service line inventory (33,449 lines); blood lead case rates by tract | Data published; need structured access |
| Housing Opportunities Made Equal (HOME Cincy) | Fair housing complaint data; LLC research help | Not yet approached |
| Urban League of Greater Southwestern Ohio | Racial equity data sharing | Not yet approached |
| Strive Partnership | School outcome data (machine-readable) | Not yet approached |
| Ohio Secretary of State | LLC registry bulk data for ownership mapping | Not yet approached |
| OPDA (City of Cincinnati) | Direct API access; dataset requests; promotion | Not yet approached |

---

## Data Sources Status

| Source | Purpose | Status |
|--------|---------|--------|
| Cincinnati Health Dept. Lead Inventory | Lead service line map | ✅ Partial — GCWW program data live (`b4xq-u3su`); full inventory not yet machine-readable |
| EPA AirToxScreen 2019 | Air toxics cancer risk by neighborhood | ✅ Live — Explorer EJ dimension (ArcGIS feature service) |
| EPA EJScreen | Multi-indicator EJ screening | ❌ Offline since February 2025 (federal rollback) |
| Cincinnati Open Data: 311 | Service request response times | ✅ Live — Neighborhood Profiles (`gcej-gmiw`) |
| CFPB HMDA Data | Mortgage lending by race | Planned — Phase 3.2 |
| HUD Subsidized Housing | Affordable unit inventory | Planned — Phase 4.2 |
| First Street Foundation | Flood risk probability | Planned — Phase 2.3 |
| Hamilton County Eviction Court | Eviction filings | Partner required — Phase 4.1 |
| Ohio DOE ESSA Report Cards | School performance | Not machine-readable yet — Phase 5.2 |
| EPA TRI | Facility-level toxic releases | Planned — Phase 2.2 future enhancement |
| OSM Overpass API | Accessibility infrastructure | Planned — Phase 6 |

---

## What We're NOT Building

It's as important to be clear about what's out of scope:

- **Real-time crime mapping** — Individual incident maps without context amplify fear without accountability. We show aggregate trends, not a crime heat map.
- **Predictive policing inputs** — No algorithmic risk scores for individuals or addresses.
- **Surveillance infrastructure** — No integration with traffic cameras, facial recognition, or license plate readers.
- **Social media monitoring** — We use public government data, not scraped personal data.

---

*This roadmap is updated each session. For session-by-session change history, see `PROGRESS.md`. For the research basis behind priorities, see `CINCINNATI_RESEARCH_REPORT.md`.*
