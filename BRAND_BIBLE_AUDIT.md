# Brand Bible Audit — 2026-05-18

Audit of all tab components against `BRAND_BIBLE.md`. Applied safe inline fixes
and documented everything requiring deeper work below.

---

## Fixes Applied

### LifeExpectancySection.tsx
- **Added `C` import** from DesignAtoms — file had none; all styles were raw hex literals.
- **Removed gradient** (`linear-gradient(to right, #EF4444, #F59E0B, #22C55E)`) — violates §6 rule 1. Replaced with solid `C.rule` track, `C.muted` city-avg marker, `C.river` neighborhood marker.
- **Replaced all 14 hex literals** with canonical C tokens (`#2f5d62` → `C.river`, `#6b5f55` → `C.muted`, `#b34728` → `C.brick`, `#c8861a` → `C.ochre`, `#ecefdf` → `C.hillLight`, `#5a7a3e` → `C.hill`, `#f5e8e1` → `C.brickLight`, `#f6f1ea` → `C.limestone`, `#e4ddd2` → `C.rule`).
- **Removed `📊` emoji** from equity callout — Brand Bible §1 "No emoji." Replaced with a smallcaps eyebrow label.
- **Fixed headline number** from `text-4xl font-bold` (Tailwind/Public Sans) to `serif font-medium tnum` at `fontSize: 48` — Brand Bible §3.7: big numbers must be in Newsreader.
- **Replaced `rounded-lg`** with `rounded-md` — Brand Bible §2.3: no large organic radii.
- **Fixed border-t class** to inline style using `C.rule`.

### HealthOutcomesSection.tsx
- **Added `C` import**.
- **`ratingColor()` function** (line 97–99): replaced `#dcfce7`/`#15803d` → `C.hillLight`/`C.hill`; `#fee2e2`/`#b91c1c` → `C.brickLight`/`C.brick`; `#f3f4f6`/`#374151` → `C.limestone`/`C.ink`.
- **`MiniBar` component** bar fills: replaced `#fca5a5`/`#86efac`/`#93c5fd` with `C.brick`/`C.hill`/`C.river` — now semantically correct (brick=worse, hill=better, river=near average).
- **`MiniBar` city-avg marker**: replaced `bg-gray-500` Tailwind class with inline `C.muted` style.
- **Track background**: `#f6f1ea` → `C.limestone`.

### SeniorHealthSection.tsx
- **Added `C` import**.
- **Same `ratingColor()` fix** as HealthOutcomesSection — identical hex-to-C-token replacements.
- **Same `MiniBar` bar fill fix** — `C.brick`/`C.hill`/`C.river` semantics.
- **`bg-gray-500` marker** → inline `C.muted`.
- **Vulnerability Score display**: `text-3xl font-bold` → `serif font-medium leading-none tnum` at `fontSize: 36` (Newsreader for big numbers).
- **Score color scale** `#b91c1c`/`#d97706`/`#15803d` → `C.brick`/`C.ochre`/`C.hill` (ochre is correct here as the intermediate editorial signal).
- **Progress bar fill** same mapping.
- **`rounded-lg`** → `rounded-md`.
- **Background** `#f6f1ea` → `C.limestone`.

### HousingInventorySection.tsx
- **Added `C` import**.
- **`programColor()` function**: replaced all 7 invented hex values.
  - `'#2f5d62'` → `C.river` (public housing — default/neutral)
  - `'#C8861A'` → `C.ochre` (section 8 — functionally ochre already, now uses token)
  - `'#16a34a'` → `C.hill` (LIHTC/tax credit — positive/supply)
  - `'#7c3aed'` (purple) → `C.riverDeep` (Section 202 elderly — no purple in palette)
  - `'#0e7490'` (custom teal) → `C.brick` (Section 811 disability — uses alarm color since disability housing shortage is the claim)
  - `'#be185d'` (rose/pink) → `C.hillLight` (RAD conversions)
  - `'#6b7280'` (gray) → `C.muted`
- **`ExpiryAlert` component**: `#f5e8e1`/`#e6c5b2`/`#b34728` → `C.brickLight`/border/`C.brick`. `rounded-lg` → `rounded-md`.

### TransitEquitySection.tsx
- **Added `C` import**.
- **`equityLabel()` function**: replaced 5 hex values with palette tokens.
  - `'#6b7280'` → `C.muted`
  - `'#16a34a'` → `C.hill` (transit-rich, lower-income — positive equity signal)
  - `'#dc2626'` → `C.brick` (transit gap — the claim that hurts)
  - `'#2f5d62'` → `C.river`
  - `'#C8861A'` → `C.ochre`
- **Scatter chart `CartesianGrid` stroke**: `'#f0f0f0'` → `C.rule`.
- **Axis label `fill`**: `'#9ca3af'` → `C.muted`.
- **`ReferenceLine` stroke**: `'#d1d5db'` → `C.rule`.
- **Selected neighborhood dot**: `'#c8861a'` → `C.ochre` (token).
- **Unselected dots**: `'#a8c8c8'` → `C.riverLight` (within palette).
- **Tooltip**: `'#fbf8f3'`/`'#e4ddd2'`/`'#1a1410'`/`'#6b5f55'` → `C.paper`/`C.rule`/`C.ink`/`C.muted`.
- **Caption text**: `'#6b5f55'` → `C.muted`.

### CityServicesSection.tsx
- **Added `C` import**.
- **`HBarList` color prop**: `'#6366F1'` (indigo — invented color) → `C.river`.

### LeadSafety/index.tsx
- **Address search results count**: `className="text-xs text-gray-500"` → `className="text-[11px]"` with `style={{ color: C.muted }}`.

---

## Action Items (requires deeper work)

### High priority

**Axes, gridlines, and tooltips throughout Recharts charts (systemic)**

Files: `PoliceAccountability/index.tsx`, `TaxRevenue/index.tsx`, `LeadSafety/index.tsx`,
`SeniorHealthSection.tsx`, `TransitEquitySection.tsx`, `Displacement/ConnectedCommunitiesSection.tsx`

Brand Bible §3.2: "No axes, no gridlines. No tooltips on hover (yet)."
All Recharts charts in the app define `axisProps`, `gridProps`, `<CartesianGrid>`, `<XAxis>`, `<YAxis>`, and `<Tooltip>`. The TransitEquitySection scatter chart has been partially fixed (colors only) but still has axes and grid.

**Recommendation:** The scatter chart in TransitEquitySection and the bar charts in PoliceAccountability are genuinely interactive reference charts — stripping axes entirely would make them unreadable. Consider a middle path: remove `<CartesianGrid>`, keep minimal `<XAxis>`/`<YAxis>` with no gridlines, remove `<Tooltip>` and move key numbers into prose. For sparkline-style charts (MiniBarChart, small time-series), remove axes entirely. This is a significant refactor that needs design judgment per chart.

**`<Legend>` component in TaxRevenue income percentile chart (TaxRevenue/index.tsx ~line 239)**

Brand Bible §3.2: "No legends as colored squares — when needed, the legend is inline in the prose." The income percentile LineChart uses `<Legend wrapperStyle={{ fontSize: 11 }} />` which renders colored squares. Replace with an inline sentence naming the percentile lines, or a smallcaps label list below the chart.

**`ochre` used as a data series color in TaxRevenue (TaxRevenue/index.tsx ~line 199)**

`PERCENTILE_COLORS` assigns `C.ochre` to `p40` (40th percentile line in the income chart). Brand Bible §2.1: ochre is reserved for editorial chrome only — section numerals and "unknown" categories. Replace `p40` with `C.muted` or `C.riverDeep`.

**Emoji in LeadSafety ActionCard and DataGapsCard**

`ActionCard` (lines 410–506) and `DataGapsCard` (lines 800–848) use 8 emoji (🔍 🧪 🔧 🚰 🏠 🩸 🏗️ 🏚️). Brand Bible §1: "No raw emoji. Use the `<Icon>` set." The Icon library has 25 glyphs; check whether equivalents exist before replacing. If they don't exist, add them to the Icon set rather than falling back to emoji.

**Invented colors in PoliceAccountability RACE_COLORS map**

`RACE_COLORS` in `PoliceAccountability/index.tsx` (lines 17–25) includes two off-palette values:
- `'#9c6b98'` (purple) for `ASIAN/PACIFIC ISLANDER` — Brand Bible §6 rule 9: "No invented colors."
- `'#8a6e3e'` (warm brown) for `AMERICAN INDIAN/ALASKAN NATIVE` — same violation.

These are used as bar fill colors in the "Stops by Race" and "Force by Race" charts.
Suggestion: map `ASIAN/PACIFIC ISLANDER` → `C.riverDeep`, `AMERICAN INDIAN/ALASKAN NATIVE` → `C.muted`. The palette can only support ~5 distinguishable race categories — consider consolidating less-common categories into `C.muted` "Other/unlisted."

**`'#8a6e3e'` in LeadSafety galvanized steel bar and riskStyle**

`riskStyle()` (lines 63–64) and `StatRow` (line 268) use `'#8a6e3e'` for galvanized steel — an invented warm-brown. The three-level risk system (lead=brick, unknown=ochre, galvanized=??, copper=hill, replaced=river) has one slot that doesn't map cleanly to the palette. Recommendation: use `C.ochre` for galvanized (it reads as "caution" without being alarm) and drop the `riskStyle` middle tier or merge it with the ochre tier.

**`DevelopmentSection.tsx` line 154: `'#DC2626'` for demolition bars**

`fill={entry.type.toLowerCase().includes('demolition') ? '#DC2626' : '#C8861A'}` — `#DC2626` is close to brick but not the token. Replace with `C.brick` and `C.ochre`.

### Medium priority

**`rounded-lg` throughout several section files**

Brand Bible §2.3: "No big organic radii here — this is editorial, not playful." `rounded-lg` (8px) is above the `rounded-md` (6px) cap. Files: `SeniorHealthSection.tsx` (remaining instances post-fix), `HousingInventorySection.tsx` (ExpiryAlert post-fix uses `rounded-md` but check other card wrappers), `TransitEquitySection.tsx`, `HealthOutcomesSection.tsx`. Audit and replace all `rounded-lg` with `rounded-md`.

**`CommunityCouncilSection.tsx` — off-palette hex values**

`grep` found hex values in this file. Quick scan needed to confirm which values and replace with C tokens.

**Sources footnote missing from several sub-sections**

Brand Bible §3.10: "Every page ends with a sources/limitations line in serif italic. Non-negotiable." The `NeighborhoodProfiles` tab has many sections but no unified sources footer — each section has its own `DataAttribution` component rather than the canonical `<p className="serif italic text-[12px] pt-6">` at the bottom. Consider adding a tab-level sources block below all sections.

**TaxRevenue section 3 border**

`section.page-paper rounded-md p-6 mb-6` has `borderLeft: 3px solid C.ochre` on the Modeled section. This is intentional and documented, but the ochre left-border on a section card is the one place ochre does double duty as both editorial chrome (the border signals "modeled") and a visual accent. Worth keeping as-is but worth documenting as a deliberate exception.

### Low priority

**`PoliceAccountability` — `'8a6e3e'` in RACE_COLORS for AMERICAN INDIAN/ALASKAN NATIVE**

Same invented-color issue as noted above, lower priority since this race category appears infrequently in the data.

**`RacialEquity/` tab files (Section.tsx, MortgageSection.tsx, UnifiedEquitySection.tsx)**

grep found hex values in these three files. These tabs are partially hidden or accessed via NeighborhoodProfiles. Audit and replace hex literals with C tokens — likely similar pattern of off-palette greens and reds for positive/negative rate indicators.

**`NeighborhoodExplorer/` — hex values in ChoroplethMap, DimensionPanel, DetailDrawer, TopNeighborhoods, NeighborhoodComparison**

The explorer uses choropleth color scales that are inherently multi-color. Several support files have hex literals. The Explorer's color scale is not a standard Brand Bible pattern — it may need a documented exception similar to the TransitEquity scatter. Audit separately; do not blindly replace choropleth scale colors with single-token colors.

**`Accessibility/index.tsx` — hex values found**

Needs audit. Check for off-palette values and replace with C tokens where applicable.

**`OwnerActivity/index.tsx` — hex values found**

Same as above. Quick audit needed.

**`Roadmap/index.tsx` — hex values found**

Minor — Roadmap is mostly static content. Check for any off-palette values.

---

## Tabs with no violations found

- `PoliceAccountability` — color semantics and C tokens correct; violations are structural (axes/gridlines) and the RACE_COLORS invented values, documented above.
- `Displacement/index.tsx` — C tokens throughout; sub-nav uses brick-underline pattern correctly; scatter chart uses C tokens.
- `TaxRevenue/index.tsx` — C tokens throughout except the ochre-as-data-series issue and axes/gridlines; sources footnotes present.
- `LeadSafety/index.tsx` — C tokens throughout post-fix; structural violations (emoji, axes) documented above.
- `Limitations/index.tsx` — C tokens correct; no chart violations.
- `About/index.tsx` — no chart components; C tokens.
- `Roadmap/index.tsx` — mostly static, minor hex values to audit.
- `DesignAtoms.tsx` — clean; this is the source of truth.
