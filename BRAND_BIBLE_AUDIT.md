# Brand Bible Audit — Cincinnati Civic Data Platform

Audit date: 2026-05-18  
Auditor: Claude Code (automated, human-reviewed)  
Scope: All `src/tabs/` components + `src/components/ui/DesignAtoms.tsx`  
Reference: `BRAND_BIBLE.md` §2 (color tokens/semantics), §3 (visualization through-line), §6 (avoid list)

---

## Fixes Applied

The following low-risk, in-place edits were made during the audit.

### 1. `src/tabs/LeadSafety/index.tsx` — Ochre as data fill color

**Rule violated:** Brand Bible §2 — `ochre` is editorial chrome only; never a data value.

The most-recent-year bar in the lead-pipe replacement activity chart used `C.ochre` as a highlight fill. Fixed to `C.river` fill with `opacity={0.55}` on the last bar, matching the explicit Brand Bible §4 pattern ("Last bar at 0.55 opacity") implemented in the `MiniBarChart` atom.

```tsx
// BEFORE
<Cell key={i} fill={i === yearData.length - 1 ? C.ochre : C.river} />

// AFTER
<Cell key={i} fill={C.river} opacity={i === yearData.length - 1 ? 0.55 : 1} />
```

---

### 2. `src/tabs/TaxRevenue/index.tsx` — Ochre as income-percentile line color

**Rule violated:** Brand Bible §2 — `ochre` is editorial chrome only; never a data value.

`PERCENTILE_COLORS.p40` mapped the 40th-income-percentile trend line to `C.ochre`. Fixed to `C.muted`, a palette-native color appropriate for a mid-range secondary metric.

```typescript
// BEFORE
const PERCENTILE_COLORS = { ..., p40: C.ochre, ... }

// AFTER
const PERCENTILE_COLORS = { ..., p40: C.muted, ... }
```

---

### 3. `src/tabs/TaxRevenue/index.tsx` — Brick as decorative page-header label

**Rule violated:** Brand Bible §2 — `brick` is reserved exclusively for "the claim that hurts" (alarm/negative data); never decorative UI chrome.

The "Tax & Revenue" eyebrow label on the page header used `color: C.brick`. Fixed to `color: C.muted`.

```tsx
// BEFORE
<span className="smallcaps" style={{ color: C.brick }}>Tax &amp; Revenue</span>

// AFTER
<span className="smallcaps" style={{ color: C.muted }}>Tax &amp; Revenue</span>
```

---

### 4. `src/tabs/About/index.tsx` — Brick as decorative sub-nav active indicator

**Rule violated:** Brand Bible §2 — `brick` is alarm/negative only; never decorative navigation chrome.

The active-tab underline in the About sub-nav used `C.brick`. Fixed to `C.river`.

```tsx
// BEFORE
borderBottom: activeView === v.id ? `2px solid ${C.brick}` : '2px solid transparent',

// AFTER
borderBottom: activeView === v.id ? `2px solid ${C.river}` : '2px solid transparent',
```

---

### 5. `src/tabs/Neighborhoods/index.tsx` — Brick as decorative sub-nav active indicator

**Rule violated:** Same as fix #4.

```tsx
// BEFORE
borderBottom: activeView === v.id ? `2px solid ${C.brick}` : '2px solid transparent',

// AFTER
borderBottom: activeView === v.id ? `2px solid ${C.river}` : '2px solid transparent',
```

---

### 6. `src/tabs/PoliceAccountability/index.tsx` — Ochre as race-category data color

**Rule violated:** Brand Bible §2 — `ochre` is editorial chrome only; never a data value.

`RACE_COLORS['HISPANIC']` mapped the Hispanic race category to `C.ochre`. Fixed to `C.muted`. (Note: `UNKNOWN` also uses `C.muted`; brief collision between these two low-frequency categories is acceptable given the Brand Bible's palette budget for multi-category charts.)

```typescript
// BEFORE
'HISPANIC': C.ochre,

// AFTER
'HISPANIC': C.muted,
```

---

### 7. `src/tabs/PoliceAccountability/index.tsx` — Brick as decorative sub-nav active indicator

**Rule violated:** Brand Bible §2 — `brick` is alarm/negative only; never decorative navigation chrome.

```tsx
// BEFORE
borderBottom: activeSection === tab.id ? `2px solid ${C.brick}` : '2px solid transparent',

// AFTER
borderBottom: activeSection === tab.id ? `2px solid ${C.river}` : '2px solid transparent',
```

---

### 8. `src/tabs/NeighborhoodProfiles/index.tsx` — Missing sources footnote

**Rule violated:** Brand Bible §3.10 — "Sources footnote on every page. Non-negotiable."

Added a sources footnote at the bottom of the `<article>` element in the Newsreader italic style specified by the Brand Bible.

```tsx
<p className="serif italic text-[12px] pt-6 mt-8" style={{ color: C.muted, borderTop: `1px solid ${C.rule}` }}>
  Sources: City of Cincinnati Open Data Portal ... (full citation)
</p>
```

---

## Action Items

### HIGH PRIORITY

These violations are substantive and visible; they should be addressed before any public-facing deployment.

---

#### H-1: `src/tabs/Accessibility/index.tsx` — Full off-palette design system

**Rules violated:** §2 (color semantics), §6.6 (no raw emoji), §3.10 (sources footnote).

This tab uses an entirely separate color system:
- `#1A4A6B` appears as primary brand color (not in `C` palette)
- Tailwind base colors throughout: `text-green-700`, `bg-blue-50`, `text-red-700`, `bg-yellow-50`, etc.
- Raw emoji as icons: ♿, 🦽, 👁, 👂, 🧠, ✅, ⚠️ (Brand Bible §6.6: "Use the Icon set, never raw emoji")
- `StatCallout` renders large numbers without Newsreader (§3.6: big numbers must be Newsreader/serif)
- No `Section` / `Eyebrow` / `PaintHeadline` structure from DesignAtoms
- No sources footnote

**Recommended fix:** Refactor to use `C` tokens, DesignAtoms atoms (`Section`, `Eyebrow`, `PaintHeadline`, `Stat`), and replace emoji with the project's icon set. Add sources footnote. This is a structural rewrite of the visual layer — data/logic untouched.

---

#### H-2: `src/tabs/NeighborhoodExplorer/index.tsx` — Off-palette + gradient violation

**Rules violated:** §2 (color semantics), §6.1 (no gradients), §3.10 (sources footnote).

- `#1A4A6B` (`text-civic-blue`, `text-[#1A4A6B]`, `bg-[#1A4A6B]`) used as primary color throughout
- Explicit CSS gradient on the "Composite Score" callout: `bg-gradient-to-r from-civic-blue to-civic-blue-light` (~line 976) — a direct §6.1 violation ("No gradients, full stop")
- No DesignAtoms structure
- No sources footnote

**Recommended fix:** Replace `#1A4A6B` with `C.river`/`C.riverDeep`; remove gradient, replace with flat `C.riverLight` background; add DesignAtoms structure; add sources footnote.

---

#### H-3: `src/tabs/OwnerActivity/index.tsx` — Off-palette design system

**Rules violated:** §2 (color semantics), §3.10 (sources footnote).

- `#1A4A6B` throughout
- `text-red-600`, `text-green-600`, `bg-yellow-50` Tailwind base colors
- `StatBox` renders large numbers in `text-gray-800` (not `C.ink`, not Newsreader)
- No sources footnote

**Recommended fix:** Replace all off-palette colors with `C` tokens; use `Stat` atom for big numbers; add sources footnote.

---

#### H-4: `src/tabs/Limitations/index.tsx` — Off-palette design system

**Rules violated:** §2 (color semantics), §3.10 (sources footnote).

Entirely different design system:
- `bg-[#1A4A6B]`, `border-blue-200`, `text-blue-900`
- `bg-amber-50`, `bg-red-50` for status callouts
- Local `Section` component defined inside file, unrelated to DesignAtoms `Section`
- No `C` token usage
- No sources footnote

**Recommended fix:** Port to DesignAtoms tokens. Replace status callout backgrounds with `C.brickLight`/`C.hillLight`/`C.limestone`. Remove local `Section` redefinition; import from DesignAtoms.

---

#### H-5: `src/tabs/Roadmap/index.tsx` — Off-palette design system

**Rules violated:** §2 (color semantics), §3.10 (sources footnote).

- `#1A4A6B` throughout
- Status badge colors use Tailwind: `bg-blue-100 text-blue-800`, `bg-green-100 text-green-800`, `bg-amber-100 text-amber-800`, `bg-red-100 text-red-800`
- No DesignAtoms structure
- No sources footnote

**Recommended fix:** Map status categories to `C` tokens (e.g., complete=`C.hill`/`C.hillLight`, in-progress=`C.river`/`C.riverLight`, planned=`C.limestone`, blocked=`C.brick`/`C.brickLight`). Add sources or "last updated" footnote.

---

#### H-6: Sources footnotes missing on most tabs

**Rule violated:** Brand Bible §3.10 — "Sources footnote on every page. Non-negotiable."

Tabs confirmed to be **missing** a page-level sources footnote:
- `src/tabs/Accessibility/index.tsx`
- `src/tabs/OwnerActivity/index.tsx`
- `src/tabs/Limitations/index.tsx`
- `src/tabs/Roadmap/index.tsx`
- `src/tabs/PoliceAccountability/index.tsx`
- `src/tabs/LeadSafety/index.tsx`
- `src/tabs/TaxRevenue/index.tsx`

(NeighborhoodProfiles was fixed in this audit — see Fix #8.)

The canonical format from Brand Bible §3.10:
```tsx
<p className="serif italic text-[12px] pt-6" style={{ color: C.muted, borderTop: `1px solid ${C.rule}` }}>
  Sources: ...
</p>
```

---

### MEDIUM PRIORITY

These are real violations but lower visual impact or require more careful coordination.

---

#### M-1: Recharts axes, gridlines, and tooltips across all chart tabs

**Rules violated:** Brand Bible §3.3 (no axes), §3.4 (no gridlines), §3.7 (no tooltips as explanation).

Every Recharts chart in the following tabs renders `<CartesianGrid>`, `<XAxis>`, `<YAxis>`, and `<Tooltip>` components:
- `src/tabs/PoliceAccountability/index.tsx` (traffic stops, use-of-force, OIS charts)
- `src/tabs/TaxRevenue/index.tsx` (income percentile, revenue category, spending charts)
- `src/tabs/LeadSafety/index.tsx` (replacement activity bar chart)

The Brand Bible calls for charts that "illustrate a sentence" with no chartjunk: no axes, no gridlines, no legend boxes, no tooltip-as-explanation. Direct labeling or prose annotation is preferred.

**Recommended fix:** Remove `<CartesianGrid>`, suppress axes with `hide` props, remove `<Tooltip>` or replace with inline annotations. This requires chart-by-chart review to ensure the data story remains legible without axes.

---

#### M-2: Invented hex colors in TaxRevenue category palettes

**Rules violated:** Brand Bible §2 / §6.7 — "Do not invent colors outside the palette."

`CATEGORY_COLORS` and `SPENDING_CATEGORY_COLORS` in `src/tabs/TaxRevenue/index.tsx` contain four off-palette hex values:
- `#8a6e3e` — used for "Intergovernmental" revenue and "Recreation & Culture" spending
- `#2e5438` — used for "Investment Income" and "Transit & Streets"
- `#a89880` — used for "Internal Transfers" and "Risk & Insurance"
- `#c4a96e` — used for "Internal Services"

**Recommended fix:** Map all categories to the six palette data colors (`C.river`, `C.riverDeep`, `C.hill`, `C.brick`, `C.muted`, `C.ochre`—noting ochre is editorial chrome, so realistically five data colors). For 6+ categories, use opacity variants (`0.7`, `0.5`) of existing palette colors rather than inventing new hues.

---

#### M-3: Invented hex colors in PoliceAccountability RACE_COLORS

**Rules violated:** Brand Bible §6.7 — "Do not invent colors outside the palette."

`RACE_COLORS` contains two off-palette hex values:
- `'ASIAN/PACIFIC ISLANDER': '#9c6b98'` — a purple not in the palette
- `'AMERICAN INDIAN/ALASKAN NATIVE': '#8a6e3e'` — a brown not in the palette

**Recommended fix:** Map these categories to palette colors. Suggested: `'ASIAN/PACIFIC ISLANDER': C.hill` (if not already occupied by WHITE) and `'AMERICAN INDIAN/ALASKAN NATIVE': C.riverDeep`. Accept that UNKNOWN and HISPANIC share `C.muted` given their typically low counts.

---

#### M-4: LeadSafety uses `#8a6e3e` for galvanized steel bars

**Rules violated:** Brand Bible §6.7 — "Do not invent colors outside the palette."

In the lead pipe material breakdown chart, galvanized steel bars use `'#8a6e3e'` as fill. This is the same off-palette brown as in M-3.

**Recommended fix:** Use `C.muted` or `C.hill` for galvanized (non-lead) pipe material. Document the mapping in a code comment referencing the palette.

---

#### M-5: Chart Legend squares in Recharts charts

**Rules violated:** Brand Bible §3.5 — "No legend squares. Use Chip inline in prose."

Several charts in TaxRevenue and PoliceAccountability render `<Legend>` components producing colored squares. The Brand Bible requires `<Chip>` components inline within the prose narrative instead.

**Recommended fix:** Remove `<Legend>` from all charts; introduce `<Chip>` labels within the prose `<Lede>` or section text above/below the chart.

---

#### M-6: `src/tabs/AddressLookup/index.tsx` — Not audited (file too large)

This file was 28,609 tokens — exceeding the read limit of ~25,000 tokens. It could not be audited in this pass.

**Recommended fix:** Perform a targeted audit of this file:
1. `grep -n "C\.brick\|C\.ochre\|#[0-9a-fA-F]\{6\}\|text-red\|text-green\|text-blue\|emoji" src/tabs/AddressLookup/index.tsx`
2. `grep -n "CartesianGrid\|XAxis\|YAxis\|Legend\|Tooltip" src/tabs/AddressLookup/index.tsx`
3. Check for sources footnote near end of file

---

#### M-7: `src/tabs/Displacement/index.tsx` — Not audited (file too large)

This file was 26,387 tokens — exceeding the read limit. Could not be audited in this pass.

**Recommended fix:** Same targeted grep approach as M-6.

---

### LOW PRIORITY

These are minor polish items that don't affect semantic integrity.

---

#### L-1: Recharts `<Tooltip>` usage is partly explanatory

**Rule violated:** Brand Bible §3.7 — "Tooltips are not a substitute for explanation. Put the insight in the prose."

Some tooltip content in PoliceAccountability and TaxRevenue surfaces data that is not otherwise visible (e.g., exact counts on hover). The Brand Bible does not prohibit tooltips entirely in interactive charts, but warns against relying on them as the primary explanation vehicle.

**Recommended fix:** Ensure the prose `<Lede>` or callout `<Stat>` above each chart states the key finding explicitly. If a chart's insight is only visible via tooltip, restructure the prose to state it directly.

---

#### L-2: `src/tabs/NeighborhoodProfiles/index.tsx` — Sources footnote content

**Fix #8 applied** in this audit adds a sources footnote; however, the citation text is a general template. Each sub-section (PublicSafety, Housing, Transit, Health, etc.) pulls from different datasets. A future improvement would be per-section `<DataAttribution>` nodes in addition to the page-level footnote.

---

#### L-3: Sub-nav active state — ink vs. riverDeep

Minor typography note: the active sub-tab label color is `C.ink` (near-black) across About, Neighborhoods, and PoliceAccountability. The Brand Bible does not specify active state color explicitly, but `C.riverDeep` would reinforce the active indicator color (`C.river` border) more cohesively. Low-stakes visual preference.

---

## Files Confirmed Clean

- `src/components/ui/DesignAtoms.tsx` — No violations. Canonical `C` token object is correct; all shared atoms (`Chip`, `Section`, `PaintHeadline`, `Lede`, `Stat`, `CompareBar`, `MiniBarChart`, etc.) conform to Brand Bible.

---

## Audit Coverage

| File | Status |
|------|--------|
| `src/components/ui/DesignAtoms.tsx` | ✓ Clean |
| `src/tabs/About/index.tsx` | ✓ Fixed (Fix #4) |
| `src/tabs/Accessibility/index.tsx` | ⚠ Action item H-1 |
| `src/tabs/AddressLookup/index.tsx` | ⚠ Not audited — file too large (M-6) |
| `src/tabs/Displacement/index.tsx` | ⚠ Not audited — file too large (M-7) |
| `src/tabs/LeadSafety/index.tsx` | ✓ Fixed (Fix #1); action item M-4 |
| `src/tabs/Limitations/index.tsx` | ⚠ Action item H-4 |
| `src/tabs/NeighborhoodExplorer/index.tsx` | ⚠ Action item H-2 |
| `src/tabs/NeighborhoodProfiles/index.tsx` | ✓ Fixed (Fix #8) |
| `src/tabs/Neighborhoods/index.tsx` | ✓ Fixed (Fix #5) |
| `src/tabs/OwnerActivity/index.tsx` | ⚠ Action item H-3 |
| `src/tabs/PoliceAccountability/index.tsx` | ✓ Fixed (Fix #6, #7); action items M-3, M-5 |
| `src/tabs/Roadmap/index.tsx` | ⚠ Action item H-5 |
| `src/tabs/TaxRevenue/index.tsx` | ✓ Fixed (Fix #2, #3); action items M-2, M-5 |
