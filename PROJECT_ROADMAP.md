# Cincinnati Civic Data Platform — Project Roadmap
**Last updated:** March 2026 | **Informed by:** Session 7 civic research

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
| Address Lookup | ✅ Working | CAGIS cards not fully live-tested |
| Neighborhood Profiles | ⚠️ Partial | Census data is city-wide fallback |
| Police Accountability | ✅ Working | Charts + AI Q&A functional |
| Neighborhood Explorer | ✅ Mostly working | Park/Flood dimensions need live test |
| Displacement (Housing Justice) | ⚠️ Partial | Pressure index live; eviction/LLC data seeking partner |
| Owner Watch | ✅ Working | Permit + CRA search live |
| Accessibility | ✅ Working | 47 neighborhoods with disability data |
| Roadmap | ✅ Working | Updated with research-backed items |

---

## Phase 1 — Solidify the Foundation
**Target: Next 1–2 sessions | Effort: Medium**

These are fixes and completions to existing functionality. Nothing new — just making what's there reliable.

### 1.1 Fix Neighborhood Profiles (Tab 2)
- [ ] Wire per-neighborhood Census data (income, rent burden) from `neighborhood_acs.json` — Explorer already has this; Tab 2 needs it
- [ ] Fix neighborhood dropdown to only show neighborhoods with at least one crime record (currently shows all 53 even if empty)
- [ ] Live test Food Safety, PLAP, and Fire & EMS queries with a known neighborhood

### 1.2 Live Test Critical Data Paths
- [ ] Test CAGIS cards (zoning, flood, historic, parks) with a Downtown address and a Hyde Park address
- [ ] Test Park Access + Flood Risk dimensions in Explorer — wait 60s; confirm scores populate
- [ ] Pre-compute park acreage to eliminate 52 sequential CAGIS calls at runtime

### 1.3 Implement 311 Service Requests in Neighborhood Profiles
- [ ] Fetch 311 data from Cincinnati Open Data portal by neighborhood and date range
- [ ] Show request volume and average resolution time
- [ ] This is the single highest-value addition to Tab 2 given what research reveals about service delivery disparities

**Why Phase 1 first:** These are the foundational fixes that make the existing platform trustworthy. Shipping new tabs on top of broken foundation data is counterproductive.

---

## Phase 2 — Lead & Environmental Health Tab
**Target: Next 2–3 sessions | Effort: High | Priority: CRITICAL**

This is the platform's most urgent gap. Cincinnati has 33,449 lead or unknown water service lines remaining. 220 children per year are diagnosed with elevated blood lead levels. Only 36.8% of children are tested. No civic-facing map exists.

### 2.1 Lead Service Line Map
- [ ] Fetch Cincinnati Health Department lead service line inventory
- [ ] Display map with status (replaced, unknown, active lead) per address/block
- [ ] Overlay childhood blood lead case rates by census tract
- [ ] Add "Is my address affected?" address lookup integration (Tab 1 cross-link)

### 2.2 EPA EJScreen Environmental Justice Layer
- [ ] Integrate EPA EJScreen API (free, no auth) for: air toxics exposure index, Superfund proximity, wastewater discharge indicator, traffic proximity
- [ ] Display as neighborhood-level composite environmental burden score
- [ ] Add to Neighborhood Explorer as a new scored dimension

### 2.3 Flood Infrastructure Status
- [ ] Add Mill Creek Barrier Dam / floodwall infrastructure status to flood zone display (Tab 1 + Explorer)
- [ ] Integrate First Street Foundation flood risk probability data
- [ ] Contextualize: "This address has a X% chance of flooding over 30 years"

**Data sources:** Cincinnati Health Department (lead inventory), EPA EJScreen API, City Stormwater (floodwall data), First Street Foundation API

---

## Phase 3 — Racial Equity Dashboard
**Target: 3–5 sessions | Effort: High | Priority: High**

The Urban League's "State of Black Cincinnati" (June 2024) is the clearest statement of what this tab needs to show: income, homeownership, mortgage approval, poverty, and incarceration by race and neighborhood. All of this is derivable from Census data already in our system.

### 3.1 Racial Equity Metrics by Neighborhood
- [ ] Build a dedicated Equity tab (or add to Neighborhood Profiles as a view)
- [ ] Show: poverty rate by race, median income by race, homeownership rate by race, rent burden by race — per neighborhood
- [ ] Source: Census ACS B19001 (income), B25003 (tenure), B17001 (poverty) by race tables — same API as existing Census data

### 3.2 HMDA Mortgage Lending Map
- [ ] Integrate CFPB HMDA data (public, annual) showing mortgage approval rates by race and census tract
- [ ] Show redlining legacy overlay (from HOLC maps) alongside current lending patterns

### 3.3 Connected Communities Zoning Reform Impact
- [ ] Track new building permit applications filed under the relaxed zoning rules (post July 2024)
- [ ] Show: where new density is being added, at what rent levels (unit type + permit category), in which neighborhoods
- [ ] Compare to pre-reform baseline

**Why this matters now:** The Connected Communities reform just turned two years old. The equity question — does relaxed zoning produce affordable housing or accelerate displacement — is answerable with permit data we already have. This could be a meaningful contribution to national housing policy debate.

---

## Phase 4 — Displacement & Owner Watch Deepening
**Target: 4–6 sessions | Effort: Medium**

The Displacement tab is live with a pressure index. Owner Watch is live with permit/CRA search. This phase deepens both.

### 4.1 Eviction Court Data (Needs Partner)
- [ ] Pursue partnership with Legal Aid Society of Greater Cincinnati for anonymized filing data
- [ ] Eviction Lab provides county totals; tract-level data requires direct court records access
- [ ] Hamilton County: 13,601 filings in 2024 (~9% of all renter households)

### 4.2 HUD Affordable Housing Inventory
- [ ] Integrate HUD Picture of Subsidized Households API (public)
- [ ] Map Section 8, LIHTC, and public housing units by neighborhood
- [ ] Flag units with subsidy expiration dates within 5 years

### 4.3 Property Ownership Network (Needs Partner)
- [ ] Link permit applicant names (already in system) to Ohio Secretary of State LLC registry
- [ ] Connect CAGIS parcel ownership data (requires CAGIS parcel layer access)
- [ ] Goal: surface corporate ownership networks, not just individual LLCs

---

## Phase 5 — Schools & Transit
**Target: 6–8 sessions | Effort: Medium**

### 5.1 School Proximity in Address Lookup
- [ ] Add nearest CPS schools with walk distances and bus service availability to Address Lookup
- [ ] Use CPS school location GeoJSON (public) + SORTA data (already in system)
- [ ] Add walk zone eligibility indicator (determines whether bus service is provided)

### 5.2 School Quality Data
- [ ] Waiting on Ohio DOE ESSA report cards to become machine-readable
- [ ] Alternative: partner with Strive Partnership for school-level outcome data
- [ ] Explorer Schools dimension currently disabled — this re-enables it

### 5.3 Transit Equity Gap Analysis
- [ ] Compare SORTA stop density and route frequency by neighborhood against income
- [ ] Show job accessibility via transit (time to top Cincinnati employers)
- [ ] Add BRT corridor impact projections as construction progresses

---

## Phase 6 — Platform Maturity
**Target: 8–12 sessions | Effort: Varies**

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
| Legal Aid Society of Greater Cincinnati | Eviction filing data at granular level | Not yet approached |
| Cincinnati Health Department | Lead service line inventory API access | Data published; need structured access |
| Housing Opportunities Made Equal (HOME Cincy) | Fair housing complaint data; LLC research help | Not yet approached |
| Urban League of Greater Southwestern Ohio | Racial equity data sharing | Not yet approached |
| Strive Partnership | School outcome data (machine-readable) | Not yet approached |
| Ohio Secretary of State | LLC registry bulk data for ownership mapping | Not yet approached |
| OPDA (City of Cincinnati) | Direct API access; dataset requests; promotion | Not yet approached |

---

## Data Sources to Add

| Source | Purpose | Auth | Priority |
|--------|---------|------|----------|
| Cincinnati Health Dept. Lead Inventory | Lead service line map | None (public) | **Critical** |
| EPA EJScreen API | Environmental justice scores | None (public) | High |
| CFPB HMDA Data | Mortgage lending by race | None (public) | High |
| HUD Subsidized Housing | Affordable unit inventory | None (public API) | Medium |
| Cincinnati Open Data: 311 | Service request response times | None | Medium |
| First Street Foundation | Flood risk probability | API key | Medium |
| Hamilton County Eviction Court | Eviction filings | Partner required | High (with partner) |
| Ohio DOE ESSA Report Cards | School performance | None (not machine-readable yet) | Medium |
| OSM Overpass API | Accessibility infrastructure | None (public) | Low |

---

## What We're NOT Building

It's as important to be clear about what's out of scope:

- **Real-time crime mapping** — Individual incident maps without context amplify fear without accountability. We show aggregate trends, not a crime heat map.
- **Predictive policing inputs** — No algorithmic risk scores for individuals or addresses.
- **Surveillance infrastructure** — No integration with traffic cameras, facial recognition, or license plate readers.
- **Social media monitoring** — We use public government data, not scraped personal data.

---

## Session Sequencing Recommendation

For maximum impact with limited time, the recommended order is:

1. **Fix Tab 2 + add 311** (Phase 1.1–1.3) — Quick wins; makes the platform reliable
2. **Lead service line map** (Phase 2.1) — Highest civic urgency; most visible gap vs. peer cities
3. **EPA EJScreen** (Phase 2.2) — Free API; high impact; builds on existing flood risk work
4. **Racial equity metrics** (Phase 3.1) — Census data already in system; new tab or expanded view
5. **Connected Communities zoning impact** (Phase 3.3) — Permit data already in system; timely given 2024 reform
6. **HUD affordable housing** (Phase 4.2) — Completes the displacement picture; free public API

---

*This roadmap was informed by the March 2026 Cincinnati Civic Research Report (see `CINCINNATI_RESEARCH_REPORT.md`). It should be reviewed and updated each session as priorities shift and new data sources become available.*
