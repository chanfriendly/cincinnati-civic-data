# Cincinnati Civic Data — Design System

> The authoritative reference for visual design decisions.
> Generated May 2026. Inspired by https://github.com/google-labs-code/design.md.
> **Update this file when you change any token, component, or pattern.**
>
> For editorial voice, visualization philosophy, and the "why" behind these decisions, read `BRAND_BIBLE.md` first.

---

## Philosophy

Three rules govern every design decision:

1. **Distill, don't display** — every visual element should answer "what does this mean?" not just "here is data."
2. **Editorial, not dashboard** — typography and hierarchy come before color and decoration. A reader should understand the story before noticing the chart.
3. **Warm, civic, trustworthy** — the palette comes from Cincinnati's physical landscape (the Ohio River, limestone geology, brick architecture, wooded hills). It reads as authoritative without being governmental or cold.

---

## Color Tokens

All colors are defined in two places that must stay in sync:
- `src/components/ui/DesignAtoms.tsx` — the `C` object (TypeScript, used for inline styles)
- `tailwind.config.ts` — Tailwind utility classes (used sparingly for layout)

**Always prefer `C.*` inline styles over Tailwind color utilities** inside tab components. This gives predictable rendering across Tailwind's JIT boundary and makes diffs readable.

### Semantic Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `C.ink` | `#1a1410` | Primary text, headings, labels |
| `C.muted` | `#6b5f55` | Secondary text, captions, axis labels, eyebrows |
| `C.rule` | `#e4ddd2` | Dividers, card borders, grid lines in charts |
| `C.paper` | `#fbf8f3` | Card surface (`page-paper` class) |
| `C.limestone` | `#f6f1ea` | Page background, inset surfaces, loading skeletons |

### Accent Palette

| Token | Hex | Tailwind class | Usage |
|-------|-----|----------------|-------|
| `C.river` | `#2f5d62` | `text-river` | Primary accent, links, positive data |
| `C.riverDeep` | `#1f3f43` | `text-river-deep` | Dark teal for high-contrast text on light teal |
| `C.riverLight` | `#e6efef` | `bg-river-light` | River-tinted inset backgrounds |
| `C.brick` | `#b34728` | `text-brick` | Warning, alerts, negative trends, police accountability |
| `C.brickLight` | `#f5e8e1` | `bg-brick-light` | Brick-tinted inset backgrounds |
| `C.hill` | `#5a7a3e` | `text-hill` | Positive trends, "good" indicators |
| `C.hillLight` | `#ecefdf` | `bg-hill-light` | Hill-tinted inset backgrounds |
| `C.ochre` | `#c8861a` | `text-ochre` | Section numbers, editorial accents, caution |

### Legacy Palette (do not use in new components)

The `civic.*` Tailwind classes (`civic-blue`, `civic-amber`, etc.) remain in `tailwind.config.ts` for backwards compatibility with components not yet migrated. **Do not use in new code.** Replace with C tokens on contact.

---

## Typography

### Fonts

| Role | Font | CSS class | Use for |
|------|------|-----------|---------|
| UI / body | Public Sans | (default) | Labels, body text, buttons, captions |
| Editorial / data | Newsreader | `.serif` | Big numbers, section headlines, lede paragraphs |
| Monospace | JetBrains Mono | (manual) | Code snippets only |

### Type Scale (practical)

| Use | Size | Weight | Class/Style |
|-----|------|--------|-------------|
| Section eyebrow | 10–11px | 700 | `smallcaps` CSS class |
| Body caption | 11–12px | 400 | `style={{ color: C.muted, fontSize: 11 }}` |
| Body text | 13px | 400 | `text-[13px]` + `style={{ color: C.ink }}` |
| Card label | 13px | 600 | `text-[13px] font-semibold` |
| Sub-heading | 15–17px | 500 (serif) | `className="serif"` + fontSize inline |
| Section heading | 22–28px | 500 (serif) | `className="serif"` + fontSize inline |
| Hero stat | 40–64px | 500 (serif) | `className="serif tnum font-medium"` |

### Typography Rules

- **Numbers in context**: use `className="serif tnum"` for any metric displayed at large size.
- **Section labels**: always use the `smallcaps` CSS class — never `uppercase tracking-wider` on a standard font weight.
- **No `font-bold` on serif**. Newsreader is set at `font-medium` (500). Bold serif reads as brochure, not editorial.
- **Lede paragraphs**: use the `Lede` component from DesignAtoms for the opening sentence of a section.

---

## Layout

### Max width

`max-w-editorial` = 1400px. Applied to all main content containers.

### Tab content root

Every tab's root `<div>` should be:
```tsx
<div className="px-8 py-2 space-y-0">
  {/* sections */}
</div>
```
Do not nest inside `max-w-7xl mx-auto` — the editorial max-width is applied by the shell.

### Spacing rhythm

- Between major sections: `space-y-5` or `mb-5`
- Inside a card: `p-5` (default) or `p-6` (wide editorial cards)
- Between chart and attribution: `mt-3`

### Two-column layout (detail panels)

```tsx
<div className="flex flex-col lg:flex-row gap-5">
  <div className="lg:w-2/5 flex-shrink-0"> {/* list / filter panel */} </div>
  <div className="lg:w-3/5"> {/* detail panel */} </div>
</div>
```

---

## Components

### Card surface — `page-paper`

The fundamental container. CSS class defined in `src/index.css`:
```css
.page-paper {
  background: #fbf8f3;
  border: 1px solid #e4ddd2;
}
```

Usage:
```tsx
<div className="page-paper rounded-md p-5">
  {/* content */}
</div>
```

Never use `bg-white shadow` or `bg-gray-50` in new components. `page-paper` is the canonical card surface.

### Sub-navigation (tab within a tab)

```tsx
<div className="page-paper rounded-md mb-5" style={{ borderBottom: `1px solid ${C.rule}` }}>
  <div className="flex flex-wrap">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => setActive(tab.id)}
        className="px-5 py-3 text-[13px] font-medium transition-colors"
        style={{
          borderBottom: active === tab.id ? `2px solid ${C.brick}` : '2px solid transparent',
          color: active === tab.id ? C.ink : C.muted,
          background: 'transparent',
          fontFamily: '"Public Sans", sans-serif',
          marginBottom: -1,
        }}
      >
        {tab.label}
      </button>
    ))}
  </div>
</div>
```

### Section header pattern

```tsx
{/* Eyebrow */}
<div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
  01 · Section Label
</div>
{/* Serif headline */}
<div className="serif mb-3" style={{ fontSize: 26, fontWeight: 500, color: C.ink, lineHeight: 1.2 }}>
  The story sentence goes here.
</div>
```

Or use the `Eyebrow` + `PaintHeadline` components from DesignAtoms for a numbered version.

### Hero stat

```tsx
<div className="page-paper rounded-md p-5" style={{ borderLeft: `3px solid ${C.brick}` }}>
  <div className="serif font-medium leading-none" style={{ fontSize: 48, color: C.brick }}>
    {value.toLocaleString()}
  </div>
  <div className="text-[13px] mt-2" style={{ color: C.muted }}>
    Label text here
  </div>
</div>
```

### Callout / contextual note

```tsx
{/* River-tinted: context, history, background information */}
<div className="rounded-md p-4" style={{ background: C.limestone, borderLeft: `3px solid ${C.river}` }}>
  <p className="text-[12px] font-semibold mb-1" style={{ color: C.riverDeep }}>Title</p>
  <p className="text-[12px] leading-relaxed" style={{ color: C.ink }}>Body text.</p>
</div>

{/* Ochre-tinted: caution, context with temporal nuance */}
<div className="rounded-md p-4" style={{ background: C.limestone, borderLeft: `3px solid ${C.ochre}` }}>
  <p className="text-[12px] font-semibold mb-1" style={{ color: C.ochre }}>Title</p>
  <p className="text-[12px] leading-relaxed" style={{ color: C.ink }}>Body text.</p>
</div>

{/* Brick-tinted: disclaimer, warning, accountability context */}
<div className="rounded-md p-4 mb-5" style={{ background: C.brickLight, borderLeft: `3px solid ${C.brick}` }}>
  <p className="text-[13px] font-semibold mb-1" style={{ color: C.brick }}>Label</p>
  <p className="text-[13px] leading-relaxed" style={{ color: C.ink }}>Body text.</p>
</div>
```

### Digit display (small counts where bar charts would mislead)

Used when N < ~20 and a bar chart would overstate precision (e.g., OIS incident counts):

```tsx
<div className="flex flex-wrap gap-3">
  {items.map((d) => (
    <div
      key={d.year}
      className="text-center rounded-md"
      style={{ background: C.limestone, minWidth: 80, padding: '14px 18px' }}
    >
      <div className="serif font-medium leading-none" style={{ fontSize: 40, color: C.river }}>
        {d.count}
      </div>
      <div className="text-[10px] mt-1.5 uppercase tracking-widest" style={{ color: C.muted }}>
        {d.year}
      </div>
    </div>
  ))}
</div>
```

### Labeled row list (small-count breakdown by category)

```tsx
<div className="divide-y" style={{ borderTop: `1px solid ${C.rule}` }}>
  {items.map((entry) => (
    <div key={entry.label} className="flex items-center justify-between py-2.5">
      <span className="text-[13px]" style={{ color: C.ink }}>{entry.label}</span>
      <span className="serif font-medium tnum" style={{ fontSize: 28, color: C.river }}>
        {entry.count}
      </span>
    </div>
  ))}
</div>
```

### Loading state

```tsx
{isLoading && (
  <div className="space-y-3">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="h-8 rounded animate-pulse" style={{ background: C.limestone }} />
    ))}
  </div>
)}
```

### Select / filter control

```tsx
const selectStyle: React.CSSProperties = {
  background: C.paper,
  color: C.ink,
  border: `1px solid ${C.rule}`,
  fontFamily: '"Public Sans", sans-serif',
  fontSize: 14,
  padding: '6px 12px',
  borderRadius: 6,
  appearance: 'none',
  cursor: 'pointer',
}
```

---

## Charts (Recharts)

### Shared props

```tsx
const axisProps = { stroke: C.muted, fontSize: 11 }
const gridProps = { strokeDasharray: '3 3' as const, stroke: C.rule }
const tooltipStyle = { fontSize: 12, borderColor: C.rule, borderRadius: 6 }
```

### Bar chart — vertical (standard)

```tsx
<ResponsiveContainer width="100%" height={280}>
  <BarChart data={data} margin={{ bottom: 60, left: 10 }}>
    <CartesianGrid {...gridProps} vertical={false} />
    <XAxis dataKey="label" {...axisProps} angle={-35} textAnchor="end" interval={0}
      tick={{ fontSize: 11, fill: C.muted }} />
    <YAxis {...axisProps} tickFormatter={(v) => v.toLocaleString()} />
    <Tooltip contentStyle={tooltipStyle} />
    <Bar dataKey="count" fill={C.river} radius={[3, 3, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

### Bar chart — horizontal (use when labels are long or > 6 categories)

```tsx
<ResponsiveContainer width="100%" height={data.length * 36 + 20}>
  <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
    <CartesianGrid {...gridProps} horizontal={false} />
    <XAxis type="number" {...axisProps} tickFormatter={(v) => v.toLocaleString()} />
    <YAxis type="category" dataKey="label" width={175} tick={{ fontSize: 11, fill: C.muted }} />
    <Tooltip formatter={(v: number) => v.toLocaleString()} contentStyle={tooltipStyle} />
    <Bar dataKey="count" radius={[0, 3, 3, 0]} fill={C.river} />
  </BarChart>
</ResponsiveContainer>
```

### Race/category color assignment

```ts
const RACE_COLORS: Record<string, string> = {
  'BLACK':                                      C.river,
  'WHITE':                                      C.hill,
  'HISPANIC':                                   C.ochre,
  'ASIAN/PACIFIC ISLANDER':                     '#9c6b98',
  'AMERICAN INDIAN/ALASKAN NATIVE':             '#8a6e3e',
  'NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER':  C.riverDeep,
  'UNKNOWN':                                    C.muted,
}
```

### Reference / timeline chart with colored context bands

When a bar chart has editorial annotations (e.g., "2001 Collaborative Agreement", "2014–2016 spike"), use `Cell` fill to color the relevant bars to match the annotation's callout border color:

```tsx
<Bar dataKey="count" radius={[3, 3, 0, 0]}>
  {data.map((entry, i) => {
    const yr = parseInt(entry.year)
    const fill =
      yr === 2001 ? C.river    // matches the river-bordered callout
      : yr >= 2014 && yr <= 2016 ? C.ochre  // matches the ochre-bordered callout
      : C.muted
    return <Cell key={i} fill={fill} />
  })}
</Bar>
```

---

## Leaflet Maps

Leaflet has strict requirements around container initialization timing. The canonical pattern:

```tsx
useEffect(() => {
  if (activeSection !== 'target-section') return

  const controller = new AbortController()
  let outerRaf = 0, innerRaf = 0

  const initMap = async () => {
    // 1. Fetch data directly — do NOT rely on useSODA hook state propagating before this effect
    let coords: any[] = []
    try {
      const url = `https://data.cincinnati-oh.gov/resource/DATASET-UID.json?$select=latitude_x,longitude_x&$where=${encodeURIComponent(whereClause)}&$limit=2000`
      const res = await fetch(url, { signal: controller.signal })
      if (res.ok) coords = await res.json()
    } catch { /* AbortError on cleanup is expected */ }

    if (controller.signal.aborted || !containerRef.current) return

    // 2. Tear down existing instance
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }

    // 3. Create map (no tiles yet)
    const map = L.map(containerRef.current, { zoomControl: true, scrollWheelZoom: false })
    mapRef.current = map

    // 4. Two rAFs to ensure browser has committed layout before tile requests fire
    outerRaf = requestAnimationFrame(() => {
      innerRaf = requestAnimationFrame(() => {
        if (controller.signal.aborted || !mapRef.current) return
        map.invalidateSize({ animate: false })
        map.setView([39.1031, -84.512], 12, { animate: false })
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
        }).addTo(map)
        // add markers...
      })
    })
  }

  initMap()

  return () => {
    controller.abort()
    cancelAnimationFrame(outerRaf)
    cancelAnimationFrame(innerRaf)
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null }
  }
}, [activeSection, dependencyThatChangesData])
```

**Container requirements:**
```tsx
<div className="page-paper rounded-md p-5" style={{ overflow: 'hidden' }}>
  {/* position:relative is required — Leaflet uses absolute-positioned panes */}
  <div ref={containerRef} style={{ height: 420, width: '100%', position: 'relative' }} />
</div>
```

**Critical:** `overflow: hidden` on the outer wrapper clips Leaflet tile CSS transforms that would otherwise escape the card boundary. `position: relative` on the map div is required for Leaflet's internal pane positioning.

---

## Design Patterns by Use Case

### "Small counts — skip the chart"

If a dataset has fewer than ~20 total records across all categories, a bar chart overstates precision. Use digit display chips instead (see component above). Establish N in editorial prose: "5 subjects total across the dataset — a bar chart would overstate precision."

### "Measured vs Modeled" disclosure

When a visualization combines primary-source data with a model applied from outside the local geography:
- Tag each data series with a visible `Tag` component (`tone="info"` for measured, `tone="warn"` for modeled)
- Add a callout box directly adjacent to the chart, not in a footnote
- The Tax & Revenue tab is the canonical implementation of this pattern

### Data gap / no-data honesty

Never show 0 when the data is missing. Use a callout:
```tsx
<div className="rounded px-3 py-2" style={{ background: C.limestone, border: `1px solid ${C.rule}` }}>
  <p className="text-[12px]" style={{ color: C.muted }}>
    <strong style={{ color: C.ink }}>No [year] data is published.</strong>{' '}
    This appears to reflect a recording gap, not zero incidents.
  </p>
</div>
```

### Phase / status color mapping

When coding neighborhoods or items by status, use this canonical mapping:

| Phase | Background | Border / accent | Text |
|-------|-----------|-----------------|------|
| Active / urgent | `C.brickLight` | `C.brick` | `C.brick` |
| Caution / watch | `rgba(200,134,26,0.12)` | `C.ochre` | `C.ochre` |
| Positive / good | `C.hillLight` | `C.hill` | `C.hill` |
| Stable / neutral | `C.riverLight` | `C.river` | `C.river` |
| Insufficient data | `C.limestone` | `C.rule` | `C.muted` |

---

## Tab Migration Checklist

When migrating an existing tab to the design system, work through this list:

- [ ] `import { C } from '../../components/ui/DesignAtoms'`
- [ ] Replace all `bg-white` with `page-paper` class or `style={{ background: C.paper }}`
- [ ] Replace all `bg-gray-50` / `bg-gray-100` with `style={{ background: C.limestone }}`
- [ ] Replace all `text-gray-900` / `text-gray-800` / `text-gray-700` with `style={{ color: C.ink }}`
- [ ] Replace all `text-gray-500` / `text-gray-400` / `text-gray-600` with `style={{ color: C.muted }}`
- [ ] Replace all `border-gray-200` with `style={{ border: '1px solid ' + C.rule }}`
- [ ] Replace old `[#1A4A6B]` civic blue with `C.river`
- [ ] Replace old `[#C8861A]` civic amber with `C.ochre`
- [ ] Replace section title `text-2xl font-bold` with eyebrow + serif heading
- [ ] Replace `rounded-lg` card containers with `page-paper rounded-md`
- [ ] Replace `shadow-sm` with `page-paper` border (no shadows)
- [ ] Update sub-nav active state to `C.brick` underline, `C.ink` text
- [ ] Update all bar chart fills to use C tokens
- [ ] Run `npx tsc --noEmit` — must be zero errors
- [ ] Run `npm run build` — must succeed

---

## File Locations

| File | Purpose |
|------|---------|
| `src/components/ui/DesignAtoms.tsx` | All reusable design components + C color object |
| `src/index.css` | CSS class definitions: `page-paper`, `serif`, `smallcaps`, `tnum`, `fade-up`, `topo-bg` |
| `tailwind.config.ts` | Tailwind theme extension — color tokens as utility classes |
| `src/tabs/PoliceAccountability/index.tsx` | **Reference tab** — fully migrated, canonical patterns |
| `src/tabs/TaxRevenue/index.tsx` | **Reference tab** — canonical "Measured vs Modeled" disclosure |

---

## What the Design Is Not

- Not a government website blue-and-gray palette
- Not a SaaS dashboard with colored cards for every metric
- Not a newspaper with long-form prose only — data visualizations earn their place
- Not a mobile-first design — primary use case is desktop/tablet; mobile is a constraint, not the target

The visual register is: **a well-designed annual report from a civic organization that takes its data seriously.**
