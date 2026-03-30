# Feature Validation Checklist
**For Claude Code — Live feature verification against the deployed site**

Use this checklist to test each tab against the live site at **https://cincinnati-civic-data.vercel.app**.

For each check: mark ✅ (works), ❌ (broken), or ⚠️ (partial/unclear).
Open the browser Network tab while testing to catch silent API failures.

*Last validated: 2026-03-29*

---

## Setup

1. Open https://cincinnati-civic-data.vercel.app in Chrome or Firefox
2. Open DevTools → Network tab → filter by "XHR" or "Fetch"
3. Open DevTools → Console tab to watch for JS errors

---

## Tab 1 — Address Lookup

### Test address A: Downtown flood zone
**Address:** `525 Vine St, Cincinnati OH`

- ✅ Address geocodes correctly (map centers on downtown)
- ✅ Map shows the address marker
- ✅ **Crime markers appear on the map** (orange circle markers within ~400m)
- ✅ Nearby Crime card shows incident count and list
- ✅ Flood Zone card shows a flood zone result (AE zone confirmed)
- ✅ Zoning card shows a result (B-4 commercial confirmed)
- ✅ Historic District card returns a result
- ✅ Parks card shows nearby parks
- ✅ Transit card shows SORTA stops
- ✅ AI Summary generates without error (may take 5–10s)
- ✅ OHGO traffic section loads (may be empty if no active incidents)

### Test address B: Residential (known non-flood zone)
**Address:** `3600 Erie Ave, Cincinnati OH` (Hyde Park)

- ✅ Address geocodes correctly (map centers on Hyde Park)
- ✅ Flood Zone card shows X zone (minimal flood hazard confirmed)
- ✅ Zoning card shows residential zoning
- ✅ Crime markers appear on map
- ✅ Parks card shows Ault Park or Eden Park nearby

### Known issues
- ❌ **AI Summary markdown does not render** — raw `##`, `**bold**`, backticks display as plain text. *Fix applied 2026-03-29: `renderMarkdown()` utility added and wired in.*

---

## Tab 2 — Neighborhood Profiles

### Test neighborhood: Over-the-Rhine

- ✅ Dropdown loads with OTR selected
- ✅ Crime Trends card shows data and chart
- ✅ Building Permits card shows count and chart
- ⚠️ **Food Safety card** — data loads but includes schools registered at OTR district offices (Taft HS, Western Hills HS, etc.). The `neighborhood` field reflects the license registration address, not the physical school location. Source data quality issue; not a code bug. Consider adding a UI note.
- ⚠️ **Tax Abatements card** — shows "No abatements found" for OTR despite heavy development. Likely a `ccd_neigh` field value mismatch (Title Case in query vs. actual dataset values). Needs live SODA field audit.
- ✅ PLAP / Blight card shows data
- ⚠️ **311 Service Requests card** — total count correct (3,223 for OTR), charts render, but **"Still Open/Pending" count reads 0**. Open count is computed from the 1,000-record general batch; with 3,223+ total records many open entries fall outside the batch. Needs a dedicated `$where=sr_status IN ('OPEN','PENDING','ASSIGNED')` count query.
- ✅ Fire & EMS card shows data
- ✅ Income & Housing card shows neighborhood-specific income and rent
- ✅ Date range selector changes data when adjusted

### Test neighborhood: Hyde Park
- ✅ Data loads with distinct lower-crime, higher-income profile

---

## Tab 3 — Police Accountability

- ✅ Traffic Stops chart loads (bar chart by race)
- ✅ Pedestrian Stops chart loads
- ✅ Use of Force section loads with chart
- ✅ "Where CPD Used Force" map renders (Leaflet map with orange markers)
- ✅ OIS (Officer-Involved Shooting) section loads
- ✅ AI Q&A: response generates
- ✅ Disclaimer text is visible at the bottom
- ✅ The framing note on the map says "…not a crime map"

### Known issues
- ❌ **AI Q&A markdown does not render** — same raw markdown issue as Tab 1. *Fix applied 2026-03-29: `renderMarkdown()` wired into the response card.*

---

## Tab 4 — Neighborhood Explorer

- ✅ Choropleth map renders (colored Cincinnati neighborhoods)
- ✅ Neighborhood list / rankings table loads with scores
- ✅ Toggling dimensions updates the map colors
- ✅ Clicking a neighborhood shows its detail card
- ✅ Park Access dimension populates quickly (pre-built `cagis_neighborhood_parks.json` in use)
- ✅ Flood Risk dimension scores neighborhoods
- ✅ Food Access dimension shows scores
- ✅ Scoring methodology tooltip/info is accessible

---

## Tab 5 — Housing Justice (Displacement)

- ✅ Tab loads with live data (fully implemented — not a stub)
- ✅ Displacement Pressure Index, permit trends, and tax abatement cross-reference all render

---

## Tab 6 — Owner Watch

- ✅ Tab loads with live data (fully implemented — not a stub)
- ✅ Owner/LLC search works against live permit data

---

## Tab 7 — Lead Safety

- ✅ Tab appears in the navigation bar
- ✅ Urgency banner renders with 4 stat callouts
- ✅ Neighborhood dropdown works
- ✅ Service Line Inventory card shows neighborhood-level breakdown chart (pre-built `lead_service_lines.json` in use — `build_lead.py` already run)
- ✅ Replacement Activity card loads — SODA request to `ntfu-vnkd` returns 200 with records
- ✅ "What You Can Do" card renders with all 5 action items
- ✅ City-wide comparison chart renders (pre-built data available)
- ✅ Data Gaps card renders with 3 gap items and source links

---

## Tab 8 — Accessibility

- ✅ Tab loads
- ✅ Neighborhood dropdown works
- ✅ ADA Paratransit Coverage card shows stop count (117 stops within ¾ mile for Avondale)
- ✅ Census disability stats show real numbers from `neighborhood_disability.json` (e.g. 24.7% with any disability, 92.7% below poverty for Avondale)
- ✅ Impairment view selector works — switches between All / Mobility & Physical / Vision / Hearing / Cognitive views with correct subset of data

---

## Tab 9 — Future Work (Roadmap)

- ✅ Tab loads static content
- ✅ Vision header with 4 stats renders (13,601 / 33,449 / $31,520 / 7%)
- ✅ "What we won't build" section is visible (4 commitments)
- ✅ All roadmap sections present (Housing Justice, School Quality, Transportation, Civic Transparency, Environmental Health, Racial Equity, Open Questions)
- ✅ External links spot-checked (Legal Aid, HMDA, EPA EJScreen all render)

---

## Global Checks

- ✅ Language toggle (EN/ES) changes nav labels and tab content headers (confirmed Spanish: "Búsqueda de Dirección", "Rendición de Cuentas Policial", etc.)
- ⚠️ App loads on mobile width (375px viewport) — **untested**: browser resize tool did not reduce below native viewport in this environment. Tab nav shows horizontal overflow at desktop width as expected.
- ⚠️ Tab navigation scrolls horizontally on mobile — untested for same reason above
- ✅ Footer shows correct attribution links (Cincinnati Open Data, U.S. Census ACS, Hamilton County CAGIS)

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

## Open Issues from 2026-03-29 Validation

| # | Tab | Card | Status | Notes |
|---|-----|------|--------|-------|
| 1 | Tab 1 + Tab 3 | AI Summary / AI Q&A | ✅ Fixed | `renderMarkdown()` utility added; both components updated |
| 2 | Tab 2 | 311 "Still Open" count | ⚠️ Open | Always 0 — needs dedicated status-filtered count query |
| 3 | Tab 2 | Tax Abatements | ⚠️ Open | "No abatements found" for OTR — audit `ccd_neigh` field values in `tkp7-yf64` |
| 4 | Tab 2 | Food Safety | ⚠️ Open | Cross-neighborhood school records appear; add UI caveat note |
| 5 | Global | Mobile viewport | ⚠️ Open | Could not test at 375px in this environment — verify manually |

---

## Known Issues (Do Not Re-file)

- Vite build in the Cowork sandbox fails with EPERM on `dist/` — this is a sandbox filesystem restriction, not a code bug. Vercel builds from source cleanly.
- SORTA routes are empty (`routes: []`) for all stops — transit scoring uses stop count only.
- Community Perceptions tab has no neighborhood field — shown as city-wide averages by design.
- PROGRESS.md was stale as of 2026-03-29: Tabs 5 & 6 were documented as stubs (both fully implemented); build scripts listed as pending (all already run).
