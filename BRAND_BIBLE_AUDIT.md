# Brand Bible Audit — Cincinnati Civic Data Platform

Audit dates: 2026-05-18 (two passes)  
Auditor: Claude Code (automated, human-reviewed)  
Scope: All `src/tabs/` components + `src/components/ui/DesignAtoms.tsx`  
Reference: `BRAND_BIBLE.md` §2 (color tokens/semantics), §3 (visualization through-line), §6 (avoid list)

---

## Fixes Applied

### Pass 1 — Color-semantic violations (commit 8f09d1e)

#### 1. `src/tabs/LeadSafety/index.tsx` — Ochre as data fill color
**Rule violated:** Brand Bible §2 — `ochre` is editorial chrome only; never a data value.

The most-recent-year bar in the lead-pipe replacement activity chart used `C.ochre` as a highlight fill. Fixed to `C.river` fill with `opacity={0.55}` on the last bar.

```tsx
// BEFORE
<Cell key={i} fill={i === yearData.length - 1 ? C.ochre : C.river} />
// AFTER
<Cell key={i} fill={C.river} opacity={i === yearData.length - 1 ? 0.55 : 1} />
```

#### 2. `src/tabs/TaxRevenue/index.tsx` — Ochre as income-percentile line color
**Rule violated:** Brand Bible §2 — `ochre` is editorial chrome only; never a data value.

`PERCENTILE_COLORS.p40` mapped the 40th-income-percentile trend line to `C.ochre`. Fixed to `C.muted`.

#### 3. `src/tabs/TaxRevenue/index.tsx` — Brick as decorative page-header label
**Rule violated:** Brand Bible §2 — `brick` is reserved exclusively for "the claim that hurts"; never decorative UI chrome.

The "Tax & Revenue" eyebrow label used `color: C.brick`. Fixed to `color: C.muted`.

#### 4. `src/tabs/About/index.tsx` — Brick as decorative sub-nav active indicator
**Rule violated:** Brand Bible §2 — `brick` is alarm/negative only; never decorative navigation chrome.

Active-tab underline used `C.brick`. Fixed to `C.river`.

#### 5. `src/tabs/Neighborhoods/index.tsx` — Brick as decorative sub-nav active indicator
Same fix as #4.

#### 6. `src/tabs/PoliceAccountability/index.tsx` — Ochre as race-category data color
**Rule violated:** Brand Bible §2 — `ochre` is editorial chrome only; never a data value.

`RACE_COLORS['HISPANIC']` mapped to `C.ochre`. Fixed to `C.muted`.

#### 7. `src/tabs/PoliceAccountability/index.tsx` — Brick as decorative sub-nav active indicator
Same fix as #4.

#### 8. `src/tabs/NeighborhoodProfiles/index.tsx` — Missing sources footnote
**Rule violated:** Brand Bible §3.10 — "Sources footnote on every page. Non-negotiable."

Added canonical sources footnote at the bottom of the `<article>` element.

---

### Pass 2 — Off-palette hex values throughout tab components (commit 956d23a)

#### LifeExpectancySection.tsx
- **Added `C` import** — file had none; all styles were raw hex literals.
- **Removed gradient** (`linear-gradient(to right, #EF4444, #F59E0B, #22C55E)`) — violates §6 rule 1. Replaced with solid `C.rule` track, `C.muted` city-avg marker, `C.river` neighborhood marker.
- **Replaced all 14 hex literals** with canonical C tokens.
- **Removed `📊` emoji** from equity callout — Brand Bible §1 "No emoji." Replaced with smallcaps eyebrow label.
- **Fixed headline number** from `text-4xl font-bold` to `serif font-medium tnum` at `fontSize: 48` — Brand Bible §3.7.
- **Replaced `rounded-lg`** with `rounded-md` — Brand Bible §2.3.

#### HealthOutcomesSection.tsx
- **Added `C` import**.
- **`ratingColor()` function**: replaced all hex values with C tokens.
- **`MiniBar` component**: bar fills and city-avg marker now use C tokens.
- **Track background**: `#f6f1ea` → `C.limestone`.

#### SeniorHealthSection.tsx
- **Added `C` import**.
- Same `ratingColor()` and `MiniBar` fixes as HealthOutcomesSection.
- **Vulnerability Score display**: `text-3xl font-bold` → `serif font-medium tnum` at `fontSize: 36` (Newsreader for big numbers).
- **Score color scale**: `#b91c1c`/`#d97706`/`#15803d` → `C.brick`/`C.ochre`/`C.hill`.
- **`rounded-lg`** → `rounded-md`.

#### HousingInventorySection.tsx
- **Added `C` import**.
- **`programColor()` function**: replaced all 7 invented hex values with C tokens.
- **`ExpiryAlert` component**: off-palette hex → C tokens.

#### TransitEquitySection.tsx
- **Added `C` import**.
- **`equityLabel()` function**: replaced 5 hex values with palette tokens.
- **Recharts chart elements** (grid, axes, reference lines, dots, tooltips): all hex → C tokens.

#### CityServicesSection.tsx
- **Added `C` import**.
- **`HBarList` color prop**: `'#6366F1'` (indigo — invented color) → `C.river`.

#### LeadSafety/index.tsx
- **Address search results count**: `text-gray-500` → inline `C.muted`.

---

### Pass 4 — Remaining violations sweep (2026-05-18, this session)

#### H-6: Sources footnotes added (3 tabs)
Added canonical `<p className="serif italic text-[12px] pt-6">` footnote to:
- `PoliceAccountability/index.tsx` — CPD Traffic Stops, Use of Force, OIS datasets
- `LeadSafety/index.tsx` — GCWW Neighborhood Stats, Cincinnati Open Data replacements, GCWW Service Line Map
- `TaxRevenue/index.tsx` — ACS B19080, ITEP Who Pays?, City Finance tax rate history, Open Data revenue/spending

#### M-4: LeadSafety `#8a6e3e` galvanized steel → `C.muted`
`riskStyle()` moderate-low tier, `StatRow barColor`, and city-wide chart `<Cell>` fill — all replaced with `C.muted` / `C.limestone` / `C.rule`.

#### M-6: `AddressLookup/index.tsx` — Full C-token migration
- Added `C` import (was missing)
- All `#1A4A6B` → `C.riverDeep`, `#C8861A` → `C.ochre` throughout (~30 occurrences)
- All Tailwind semantic color classes → inline C-token styles (red → brick, green → hill, blue/gray variants)
- `rounded-lg`/`rounded-xl` → `rounded-md`
- Sources footnote added (Mapbox, CAGIS, FEMA, CPD, GCWW, SORTA, OSM, OHGO)
- One emoji (`🏛`) left in place — inside hardcoded JSX string; `C.ochre` applied to wrapper span (editorial chrome for historic district icon)

#### M-7: `Displacement/index.tsx` + `ConnectedCommunitiesSection.tsx`
- `C.ochre` as "vulnerable/at-risk" phase data category → `C.muted` (phase styles, dot colors, quadrant labels, scatter fills, sidebar ordinals)
- `C.brick` for "active" phase left intentionally — semantically correct
- `pctColor()` in ConnectedCommunitiesSection: `#16a34a`/`#65a30d` → `C.hill`, `#dc2626` → `C.brick`, `#f97316` → `C.ochre`, `#9ca3af` → `C.muted`
- `rounded-lg` → `rounded-md` throughout both files
- Sources footnote added to Displacement

#### L-1: `rounded-lg` / off-palette hex in NeighborhoodProfiles sections
All 5 targeted section files cleaned:
`HousingInventorySection`, `HealthOutcomesSection`, `PublicSafetySection`, `TransitEquitySection`, `SeniorHealthSection` — `rounded-lg` → `rounded-md`, all hex literals → C tokens.

Additional 6 files cleaned separately:
`ExpandedDemographicsSection`, `CityServicesSection`, `DevelopmentSection`, `CommunityCouncilSection`, `RecreationCentersSection`, `LifeExpectancySection`

#### L-2: `RacialEquity/` — Full C-token migration
`Section.tsx`, `MortgageSection.tsx`, `UnifiedEquitySection.tsx`:
- Race category colors standardized: Black → `C.riverDeep`, White NH → `C.hill`, Asian → `C.river`, Hispanic → `C.muted`
- `bg-gray-900` dark block → `C.ink`/`C.paper`
- All amber/blue/gray Tailwind blocks → C-token inline styles
- `rounded-lg`/`rounded-xl`/`rounded-l-xl`/`rounded-r-xl` → `rounded-md` equivalents

#### Inline fixes — small isolated hex literals
- `TaxRevenue`: `#c9bfb3` list text on dark section → `C.rule`; `#bfd2d4` river border → `C.rule`
- `Limitations`: `#bfd2d4` info-caveat border → `C.rule`
- `Roadmap`: `#fbf8f3` text on dark hero block → `C.paper`
- `NeighborhoodProfiles/index.tsx`: `#7c2e16` dark brick text → `C.brick`
- `LifeExpectancySection`: `#cfd9b2` hill border → `C.hill`
- `Displacement/index.tsx`: `#cfd9b2`/`#bfd2d4` borders → `C.hill`/`C.rule`
- `ConnectedCommunitiesSection`: `#e4ddd2` divider → `C.rule`
- `CommunityCouncilSection`: `#e4ddd2` divider → `C.rule`
- `LeadSafety`: `bg-amber-100` on `<code>` element → `C.limestone`

---

### Pass 3 — Structural off-palette redesigns (2026-05-18, this session)

#### M-2: TaxRevenue CATEGORY_COLORS and SPENDING_CATEGORY_COLORS
Replaced `#8a6e3e`, `#2e5438`, `#a89880`, `#c4a96e`, and `C.ochre` (as data series) with opacity variants of palette data colors: `'#5a7a3eb3'` (hill at 70%), `'#2f5d62b3'` (river at 70%), `'#6b5f55b3'` (muted at 70%). Removed all invented hues.

#### M-3: PoliceAccountability RACE_COLORS
- `'ASIAN/PACIFIC ISLANDER': '#9c6b98'` → `C.hill`
- `'AMERICAN INDIAN/ALASKAN NATIVE': '#8a6e3e'` → `C.riverDeep`

#### H-5: Roadmap/index.tsx — Full C-token migration
Replaced entire Tailwind color system (STATUS_CONFIG, SEGMENT_ORDER, iconBg, ItemCard, RoadmapProgress, section headers, "Why we built" block) with inline C-token styles. The `#1A4A6B` "Why we built" hero section → `C.riverDeep`.

#### H-4: Limitations/index.tsx — Full C-token migration
Replaced Tailwind base colors throughout: Section component iconBg→iconStyle, Caveat severity styles, "What this is" dark block (`#1A4A6B` → `C.riverDeep`), jump nav, data vintage table, neighborhood boundary boxes, contribute section. Replaced emoji (🐛, 📋, 💡) with inline SVGs. Replaced `bg-gray-900` developer section → `C.ink`.

#### H-3: OwnerActivity/index.tsx — Full C-token migration
All `#1A4A6B`, Tailwind base colors (`text-red-*`, `text-green-*`, `text-blue-*`, `bg-yellow-*`), `rounded-lg`/`rounded-xl` replaced with C tokens and `rounded-md`. StatBox big numbers converted to serif Newsreader.

#### H-1: Accessibility/index.tsx — Full C-token migration
All `#1A4A6B`, Tailwind base colors replaced. Raw emoji (♿, 🦽, 👁, 👂, 🧠, ✅, ⚠️) replaced with inline SVG icons. `StatCallout` big number converted from `text-3xl font-bold` to `serif font-medium tnum` at `fontSize: 36`. `rateColor()` function returning Tailwind class strings converted to `rateStyle()` returning `React.CSSProperties`.

#### H-2: NeighborhoodExplorer/index.tsx — Gradient removal + off-palette fixes
- Removed gradient (`bg-gradient-to-r from-civic-blue to-civic-blue-light`) on Composite Score callout → flat `C.riverLight` background.
- `text-civic-blue` headings → `color: C.riverDeep`.
- View toggle `text-[#1A4A6B]` → `color: C.riverDeep`.
- Composite Score number `text-3xl font-bold text-white` → `serif font-medium tnum` at `fontSize: 36` with `color: C.riverDeep`.

---

## Remaining Action Items

### MEDIUM PRIORITY

#### M-1: Recharts axes, gridlines, and tooltips across all chart tabs
**Rules violated:** Brand Bible §3.3 (no axes), §3.4 (no gridlines), §3.7 (no tooltips as explanation).

Every Recharts chart in `PoliceAccountability`, `TaxRevenue`, and `LeadSafety` renders `<CartesianGrid>`, `<XAxis>`, `<YAxis>`, and `<Tooltip>`. This is a judgment call per chart — stripping axes entirely from interactive reference charts would make them unreadable. Recommendation: remove `<CartesianGrid>`, keep minimal axes, remove `<Tooltip>` in favor of inline prose for key findings.

#### M-5: Chart Legend squares in Recharts charts
**Rule violated:** Brand Bible §3.5 — "No legend squares. Use Chip inline in prose."

Several charts in TaxRevenue and PoliceAccountability render `<Legend>` components. Replace with `<Chip>` labels within prose.

---

### LOW PRIORITY

#### L-3: `NeighborhoodExplorer/` sub-components
`ChoroplethMap`, `DimensionPanel`, `DetailDrawer`, `TopNeighborhoods`, `NeighborhoodComparison` have 21 remaining hex values and ~39 Tailwind color/radius violations. The choropleth color scale is inherently multi-color — audit carefully, do not blindly replace. Remaining violations are all confined to this directory.

#### L-4: Sub-nav active state — ink vs. riverDeep
The active sub-tab label color is `C.ink` across About, Neighborhoods, and PoliceAccountability. `C.riverDeep` would match the `C.river` active border more cohesively. Low-stakes.

---

## Files Confirmed Clean

| File | Status |
|------|--------|
| `src/components/ui/DesignAtoms.tsx` | ✓ Clean — source of truth |
| `src/tabs/About/index.tsx` | ✓ Fixed (Pass 1, Fix #4) |
| `src/tabs/Accessibility/index.tsx` | ✓ Fixed (Pass 3, H-1) |
| `src/tabs/AddressLookup/index.tsx` | ✓ Fixed (Pass 4, M-6) |
| `src/tabs/Displacement/index.tsx` | ✓ Fixed (Pass 4, M-7) |
| `src/tabs/Displacement/ConnectedCommunitiesSection.tsx` | ✓ Fixed (Pass 4) |
| `src/tabs/LeadSafety/index.tsx` | ✓ Fixed (Pass 1 #1, Pass 2, Pass 4 M-4/H-6) |
| `src/tabs/Limitations/index.tsx` | ✓ Fixed (Pass 3 H-4, Pass 4 inline) |
| `src/tabs/NeighborhoodExplorer/index.tsx` | ✓ Fixed (Pass 3, H-2) |
| `src/tabs/NeighborhoodExplorer/ChoroplethMap.tsx` | ⚠ Deferred (L-3) — choropleth color scale needs careful audit |
| `src/tabs/NeighborhoodExplorer/NeighborhoodComparison.tsx` | ⚠ Deferred (L-3) |
| `src/tabs/NeighborhoodExplorer/DimensionPanel.tsx` | ⚠ Deferred (L-3) |
| `src/tabs/NeighborhoodExplorer/DetailDrawer.tsx` | ⚠ Deferred (L-3) |
| `src/tabs/NeighborhoodExplorer/TopNeighborhoods.tsx` | ⚠ Deferred (L-3) |
| `src/tabs/NeighborhoodProfiles/index.tsx` | ✓ Fixed (Pass 1 Fix #8, Pass 4 inline) |
| `src/tabs/NeighborhoodProfiles/CityServicesSection.tsx` | ✓ Fixed (Pass 4, L-1) |
| `src/tabs/NeighborhoodProfiles/CommunityCouncilSection.tsx` | ✓ Fixed (Pass 4, L-1) |
| `src/tabs/NeighborhoodProfiles/DevelopmentSection.tsx` | ✓ Fixed (Pass 4, L-1) |
| `src/tabs/NeighborhoodProfiles/ExpandedDemographicsSection.tsx` | ✓ Fixed (Pass 4, L-1) |
| `src/tabs/NeighborhoodProfiles/HealthOutcomesSection.tsx` | ✓ Fixed (Pass 2, Pass 4 L-1) |
| `src/tabs/NeighborhoodProfiles/HousingInventorySection.tsx` | ✓ Fixed (Pass 2, Pass 4 L-1) |
| `src/tabs/NeighborhoodProfiles/LifeExpectancySection.tsx` | ✓ Fixed (Pass 2, Pass 4 inline) |
| `src/tabs/NeighborhoodProfiles/PublicSafetySection.tsx` | ✓ Fixed (Pass 4, L-1) |
| `src/tabs/NeighborhoodProfiles/RecreationCentersSection.tsx` | ✓ Fixed (Pass 4, L-1) |
| `src/tabs/NeighborhoodProfiles/SeniorHealthSection.tsx` | ✓ Fixed (Pass 2, Pass 4 L-1) |
| `src/tabs/NeighborhoodProfiles/TransitEquitySection.tsx` | ✓ Fixed (Pass 4, L-1) |
| `src/tabs/Neighborhoods/index.tsx` | ✓ Fixed (Pass 1, Fix #5) |
| `src/tabs/OwnerActivity/index.tsx` | ✓ Fixed (Pass 3, H-3) |
| `src/tabs/PoliceAccountability/index.tsx` | ✓ Fixed (Pass 1 #6/#7, Pass 3 M-3, Pass 4 H-6); action items M-1, M-5 |
| `src/tabs/RacialEquity/MortgageSection.tsx` | ✓ Fixed (Pass 4, L-2) |
| `src/tabs/RacialEquity/Section.tsx` | ✓ Fixed (Pass 4, L-2) |
| `src/tabs/RacialEquity/UnifiedEquitySection.tsx` | ✓ Fixed (Pass 4, L-2) |
| `src/tabs/Roadmap/index.tsx` | ✓ Fixed (Pass 3 H-5, Pass 4 inline) |
| `src/tabs/TaxRevenue/index.tsx` | ✓ Fixed (Pass 1 #2/#3, Pass 3 M-2, Pass 4 H-6/inline); action items M-1, M-5 |
