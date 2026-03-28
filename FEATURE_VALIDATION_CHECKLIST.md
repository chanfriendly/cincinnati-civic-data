# Feature Validation Checklist
**For Claude Code — Live feature verification against the deployed site**

Use this checklist to test each tab against the live site at **https://cincinnati-civic-data.vercel.app**.

For each check: mark ✅ (works), ❌ (broken), or ⚠️ (partial/unclear).
Open the browser Network tab while testing to catch silent API failures.

---

## Setup

1. Open https://cincinnati-civic-data.vercel.app in Chrome or Firefox
2. Open DevTools → Network tab → filter by "XHR" or "Fetch"
3. Open DevTools → Console tab to watch for JS errors

---

## Tab 1 — Address Lookup

### Test address A: Downtown flood zone
**Address:** `525 Vine St, Cincinnati OH`

- [ ] Address geocodes correctly (map centers on downtown)
- [ ] Map shows the address marker
- [ ] **Crime markers appear on the map** (orange circle markers within ~400m)
  - If none appear: check Network for `7aqy-xrv9` and `k59e-2pvf` SODA requests — do they return data with `latitude_x` / `longitude_x` fields?
- [ ] Nearby Crime card shows incident count and list
- [ ] Flood Zone card shows a flood zone result (Downtown is near the Ohio River — expect AE or X flood zone)
- [ ] Zoning card shows a result (expect B-4, B-5, or similar commercial)
- [ ] Historic District card returns a result
- [ ] Parks card shows nearby parks
- [ ] Transit card shows SORTA stops
- [ ] AI Summary generates without error (may take 5–10s)
- [ ] OHGO traffic section loads (may be empty if no active incidents)

### Test address B: Residential (known non-flood zone)
**Address:** `3600 Erie Ave, Cincinnati OH` (Hyde Park)

- [ ] Address geocodes correctly (map centers on Hyde Park)
- [ ] Flood Zone card shows "minimal flood hazard" or X zone (not a flood zone)
- [ ] Zoning card shows residential zoning (SF or similar)
- [ ] Crime markers appear on map
- [ ] Parks card shows Ault Park or Eden Park nearby

---

## Tab 2 — Neighborhood Profiles

### Test neighborhood: Over-the-Rhine

- [ ] Dropdown loads with OTR selected
- [ ] Crime Trends card shows data and chart
- [ ] Building Permits card shows count and chart
- [ ] Food Safety card shows violations data
- [ ] Tax Abatements card shows data
- [ ] PLAP / Blight card shows data
- [ ] 311 Service Requests card shows data (total count, resolution time, top request types chart)
- [ ] Fire & EMS card shows data
- [ ] Income & Housing card shows **neighborhood-specific** income and rent (not city-wide averages)
- [ ] Date range selector changes data when adjusted

### Test neighborhood: Hyde Park
- [ ] Data loads for a very different neighborhood profile (lower crime, higher income)

---

## Tab 3 — Police Accountability

- [ ] Traffic Stops chart loads (bar chart by race)
- [ ] Pedestrian Stops chart loads
- [ ] Use of Force section loads with chart
- [ ] "Where CPD Used Force" map renders (Leaflet map with orange markers)
- [ ] OIS (Officer-Involved Shooting) section loads
- [ ] AI Q&A: Type a question (e.g., "Which district has the most stops?") — response generates
- [ ] Disclaimer text is visible at the bottom ("This is accountability data about police conduct…")
- [ ] The framing note on the map says "…not a crime map"

---

## Tab 4 — Neighborhood Explorer

- [ ] Choropleth map renders (colored Cincinnati neighborhoods)
- [ ] Neighborhood list / rankings table loads with scores
- [ ] Toggling dimensions (Affordability, Income, Safety, etc.) updates the map colors
- [ ] Clicking a neighborhood shows its detail card
- [ ] Park Access dimension: wait 30–60s — do park scores populate? (Will be fast if `cagis_neighborhood_parks.json` was pre-built)
- [ ] Flood Risk dimension: does it score neighborhoods? (Requires FEMA NFHL calls)
- [ ] Food Access dimension shows scores
- [ ] Scoring methodology tooltip/info is accessible

---

## Tab 5 — Housing Justice (Displacement)

- [ ] Tab loads without a blank screen
- [ ] Check what content is shown (stub or live data?)
- [ ] Note any visible errors in console

---

## Tab 6 — Owner Watch

- [ ] Tab loads without a blank screen
- [ ] Check what content is shown (stub or live data?)
- [ ] Note any visible errors in console

---

## Tab 7 — Lead Safety *(new — Phase 2)*

- [ ] Tab appears in the navigation bar
- [ ] Urgency banner renders with 4 stat callouts
- [ ] Neighborhood dropdown works
- [ ] Service Line Inventory card shows "run build script" notice (expected until `build_lead.py` is run locally)
- [ ] Replacement Activity card loads — makes a SODA request to `ntfu-vnkd`
  - Check Network tab: does the request succeed (200)?
  - Does it return any records, or is it empty?
  - **If empty**: open the raw URL from Network tab and check what fields the dataset actually has. Update `PROGRESS.md` with confirmed field names.
- [ ] "What You Can Do" card renders with all 5 action items
- [ ] City-wide comparison chart does NOT render (expected — no pre-built JSON yet)
- [ ] Data Gaps card renders with 3 gap items and source links

---

## Tab 8 — Accessibility

- [ ] Tab loads
- [ ] Neighborhood dropdown works
- [ ] ADA Paratransit Coverage card shows a stop count (requires SORTA stops data)
- [ ] Census disability stats show numbers (requires `neighborhood_disability.json` to be populated)
  - If showing "run build script" notice: that's expected until it's been run and the JSON committed
- [ ] Impairment view selector works (Overview / Mobility / Vision / Hearing / Cognitive)

---

## Tab 9 — Future Work (Roadmap)

- [ ] Tab loads static content
- [ ] Vision header with 4 stats renders
- [ ] "What we won't build" section is visible
- [ ] All roadmap sections present (Environmental Health, Racial Equity, etc.)
- [ ] No broken links (spot-check 2–3 external links)

---

## Global Checks

- [ ] Language toggle (EN/ES) changes nav labels and tab content headers
- [ ] App loads on mobile width (375px viewport) without horizontal scroll
- [ ] Tab navigation scrolls horizontally on mobile without clipping
- [ ] Footer shows correct attribution links (Cincinnati Open Data, Census ACS, CAGIS)

---

## What to Document After Testing

For each ❌ or ⚠️ item found:

1. **Tab + card name**
2. **What you expected to see**
3. **What actually happened** (error message, blank, wrong data)
4. **Network request** — URL, status code, and first 2–3 fields of the response
5. **Console errors** — copy/paste the error text

Add findings to `PROGRESS.md` under a new session entry, or open a GitHub issue.

---

## Known Issues (Do Not Re-file)

- Vite build in the Cowork sandbox fails with EPERM on `dist/` — this is a sandbox filesystem restriction, not a code bug. Vercel builds from source cleanly.
- SORTA routes are empty (`routes: []`) for all stops — transit scoring uses stop count only.
- Community Perceptions tab has no neighborhood field — shown as city-wide averages by design.
