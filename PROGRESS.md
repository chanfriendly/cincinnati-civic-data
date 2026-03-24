# Progress Log

Running record of what has been built, fixed, and what comes next.
Update this file at the end of each session.

---

## Session 3 — March 2026

**Branch:** `claude/fix-multiple-bugs-AC2ll` (open PR, not yet merged)

### Done this session

**Bug fixes (user-reported):**
- Building permits were returning far more results than expected. Fixed by excluding trade/service permits (`mechanical`, `plumbing`, `electrical`, `hvac`, `fire suppression`, `boiler`, `elevator`) from display in both Address Lookup and Neighborhood Profiles. The underlying query was also corrected to fetch a proper count via a separate `count(*)` query rather than inferring from the result limit.

**UX improvements:**
- Roadmap org banner (Cincinnati Open Data Portal, Eviction Lab, HOME Cincy) was perceived as implying partnership. Added "You may be interested in these organizations" label to make clear they're external resources.
- Crime chart "Part 2" category is FBI UCR jargon opaque to residents. Added `CRIME_LABEL_MAP` in `NeighborhoodProfiles/index.tsx` that maps:
  - `Part 2` → `Other Offenses (Part 2)` (drugs, DUI, vandalism, fraud, etc.)
  - `Part 1` → `Serious Crimes (Part 1)`
  - `Part 1 - Person` → `Violent Crimes`
  - `Part 1 - Property` → `Property Crimes`
  - Labels apply to bar axis and hover tooltip (mapping is at data level, not display level).

**Accessibility feature (first pass):**
- Added wheelchair accessibility support to the transit stop card in Address Lookup.
- `wheelchair_boarding` field added to `SORTAStop` and `NearbyStop` TypeScript interfaces.
- Transit card now shows a ♿ badge on each accessible stop, a strikethrough ♿ on inaccessible stops, and a summary line ("X of Y nearby stops are wheelchair accessible") when data is available.
- Badge/summary are hidden when all values are unknown (i.e., current seed data) — no misleading UI.
- Created `scripts/convert-gtfs.cjs` to download the live SORTA GTFS feed and rebuild `sorta_stops.json` with `wheelchair_boarding` and route associations populated. **The team needs to run this once to activate the feature with real data.**

**Housekeeping:**
- Added `scripts/_gtfs_tmp*` to `.gitignore` to prevent leftover GTFS temp files from being committed.
- Created `CLAUDE.md` (project guide for future Claude sessions).
- Created `PROGRESS.md` (this file).

### What's still open

See "Recommended Next Steps" in `CLAUDE_CODE_HANDOFF.md` for the full backlog. Highest priority items:

1. **Run `node scripts/convert-gtfs.cjs`** to populate real wheelchair accessibility and route data in `sorta_stops.json`. This activates the accessibility feature built this session.
2. **Live-test CAGIS cards in Tab 1** against real Cincinnati addresses (zoning, flood zone, historic district, parks). Note any failures in the Network tab and check the layer index or fallback URL.
3. **Verify unconfirmed field names in Tab 2** — fetch one record from Food Safety (`rg6p-b3h3`), PLAP (`pk9w-99n6`), and Fire & EMS (`vnsz-a3wp`) and confirm the neighborhood field name (`neighborhood` vs `sna_neighborhood`).
4. **Wire per-neighborhood Census data into Tab 2** — the Explorer already computes neighborhood-level income/rent; extract into a shared hook so Neighborhood Profiles shows real per-neighborhood numbers instead of city-wide fallback.
5. **Accessibility community follow-up** — this session added transit stop wheelchair data as a starting point for community conversations. Potential next features to discuss with them:
   - ADA-related building permit filter by address
   - Sidewalk/curb-cut condition data (if Cincinnati publishes it via 311 or CAGIS)
   - Accessible park features from CAGIS parks layer
   - EMS response time by neighborhood (Fire & EMS dataset `vnsz-a3wp`)

---

## Session 2 — (prior session)

**Branch:** merged to main

### Done
- All six scoring dimensions live in Neighborhood Explorer with real data
- Park Access and Flood Risk dimensions added (batch CAGIS + FEMA queries)
- Census ACS 2022 data pre-built as `public/data/neighborhood_acs.json` (226 tracts)
- AI model switched to MiniMax M2.5 via OpenRouter; key proxied server-side
- Spanish translations added (machine-translated; needs native review)
- README fully rewritten to reflect actual state
- Cloudflare Worker proxy (`worker/api-proxy.js`) finalized

---

## Session 1 — (initial build)

### Done
- Initial commit: four working tabs (Address Lookup, Neighborhood Profiles, Police Accountability, Neighborhood Explorer)
- Mapbox geocoding, Leaflet map, Recharts charts
- Socrata SODA integration with hard-won field name discovery
- SORTA transit stop proximity (static JSON, haversine distance)
- CAGIS point-in-polygon for zoning, flood zone, historic district, parks
- OHGO traffic incidents and cameras
- Vercel serverless API proxy for dev; Cloudflare Worker for production
