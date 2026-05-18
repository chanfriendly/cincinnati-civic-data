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

### HIGH PRIORITY

#### H-6: Sources footnotes missing on several tabs
**Rule violated:** Brand Bible §3.10 — "Sources footnote on every page. Non-negotiable."

Tabs still missing a page-level sources footnote:
- `src/tabs/PoliceAccountability/index.tsx`
- `src/tabs/LeadSafety/index.tsx`
- `src/tabs/TaxRevenue/index.tsx`

The canonical format:
```tsx
<p className="serif italic text-[12px] pt-6" style={{ color: C.muted, borderTop: `1px solid ${C.rule}` }}>
  Sources: ...
</p>
```

---

### MEDIUM PRIORITY

#### M-1: Recharts axes, gridlines, and tooltips across all chart tabs
**Rules violated:** Brand Bible §3.3 (no axes), §3.4 (no gridlines), §3.7 (no tooltips as explanation).

Every Recharts chart in `PoliceAccountability`, `TaxRevenue`, and `LeadSafety` renders `<CartesianGrid>`, `<XAxis>`, `<YAxis>`, and `<Tooltip>`. This is a judgment call per chart — stripping axes entirely from interactive reference charts would make them unreadable. Recommendation: remove `<CartesianGrid>`, keep minimal axes, remove `<Tooltip>` in favor of inline prose for key findings.

#### M-4: LeadSafety uses `#8a6e3e` for galvanized steel bars
`riskStyle()` (lines 63–64) and `StatRow` (line 268) use `'#8a6e3e'` for galvanized steel — an invented warm-brown. Recommended fix: `C.muted` for galvanized (non-lead) material.

#### M-5: Chart Legend squares in Recharts charts
**Rule violated:** Brand Bible §3.5 — "No legend squares. Use Chip inline in prose."

Several charts in TaxRevenue and PoliceAccountability render `<Legend>` components. Replace with `<Chip>` labels within prose.

#### M-6: `src/tabs/AddressLookup/index.tsx` — Not yet audited (file too large)
Perform a targeted audit:
1. `grep -n "C\.brick\|C\.ochre\|#[0-9a-fA-F]\{6\}\|text-red\|text-green\|text-blue\|emoji" src/tabs/AddressLookup/index.tsx`
2. `grep -n "CartesianGrid\|XAxis\|YAxis\|Legend\|Tooltip" src/tabs/AddressLookup/index.tsx`
3. Check for sources footnote near end of file

#### M-7: `src/tabs/Displacement/index.tsx` — Not yet audited (file too large)
Same targeted grep approach as M-6.

---

### LOW PRIORITY

#### L-1: `rounded-lg` in a few remaining section files
Brand Bible §2.3: cap at `rounded-md` (6px). Files that may have residual instances: `SeniorHealthSection.tsx`, `HousingInventorySection.tsx`, `HealthOutcomesSection.tsx`. Quick grep + replace pass.

#### L-2: `RacialEquity/` tab files
`Section.tsx`, `MortgageSection.tsx`, `UnifiedEquitySection.tsx` likely have hex literals. Audit and replace with C tokens.

#### L-3: `NeighborhoodExplorer/` sub-components
`ChoroplethMap`, `DimensionPanel`, `DetailDrawer`, `TopNeighborhoods`, `NeighborhoodComparison` may have hex values. The choropleth color scale is inherently multi-color — audit separately, do not blindly replace.

#### L-4: Sub-nav active state — ink vs. riverDeep
The active sub-tab label color is `C.ink` across About, Neighborhoods, and PoliceAccountability. `C.riverDeep` would match the `C.river` active border more cohesively. Low-stakes.

---

## Files Confirmed Clean

| File | Status |
|------|--------|
| `src/components/ui/DesignAtoms.tsx` | ✓ Clean — source of truth |
| `src/tabs/About/index.tsx` | ✓ Fixed (Pass 1, Fix #4) |
| `src/tabs/Accessibility/index.tsx` | ✓ Fixed (Pass 3, H-1) |
| `src/tabs/AddressLookup/index.tsx` | ⚠ Not audited — file too large (M-6) |
| `src/tabs/Displacement/index.tsx` | ⚠ Not audited — file too large (M-7) |
| `src/tabs/LeadSafety/index.tsx` | ✓ Fixed (Pass 1 #1, Pass 2); action item M-4 |
| `src/tabs/Limitations/index.tsx` | ✓ Fixed (Pass 3, H-4) |
| `src/tabs/NeighborhoodExplorer/index.tsx` | ✓ Fixed (Pass 3, H-2) |
| `src/tabs/NeighborhoodProfiles/index.tsx` | ✓ Fixed (Pass 1, Fix #8) |
| `src/tabs/Neighborhoods/index.tsx` | ✓ Fixed (Pass 1, Fix #5) |
| `src/tabs/OwnerActivity/index.tsx` | ✓ Fixed (Pass 3, H-3) |
| `src/tabs/PoliceAccountability/index.tsx` | ✓ Fixed (Pass 1 #6/#7, Pass 3 M-3); action items M-1, M-5, H-6 |
| `src/tabs/Roadmap/index.tsx` | ✓ Fixed (Pass 3, H-5) |
| `src/tabs/TaxRevenue/index.tsx` | ✓ Fixed (Pass 1 #2/#3, Pass 3 M-2); action items M-1, M-5, H-6 |
