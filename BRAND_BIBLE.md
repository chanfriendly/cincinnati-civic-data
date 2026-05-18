# Cincinnati Civic Data — Brand Bible

A handoff document for engineers and designers extending this project.
This is not a marketing brand book. It is a working reference for how we
make pages, charts, and copy so the next ten screens feel like they
belong to the same publication.

If you only read one section, read **§3 The Visualization Through-Line**.
Everything else exists to support it.

> **Note on code references.** Throughout this document, atoms are
> referenced by their JSX file paths (`atoms.jsx`, `data.jsx`,
> `pages/*.jsx`). Those refer to the **static HTML design prototype**
> that lives in *this* project — a Babel-in-the-browser sandbox we use
> to iterate on visual decisions without a build step.
>
> The **production codebase** carries the same atoms as TypeScript
> components in `src/components/ui/DesignAtoms.tsx` (with data in the
> equivalent typed module). Names, props, and semantic rules match
> 1:1 — when this Bible says `<CompareBar>`, the production import is
> the typed one. See §9 for the full mapping.

---

## 0. What this project actually is

A public-records reader for Cincinnati residents, organizers, and
neighbors. It is **not a dashboard**. It is closer to a quarterly civic
review — a printed publication that happens to be on the web. Numbers
appear inside sentences, not inside cards. Charts illustrate a claim,
not the other way around.

Pages we have so far:

1. **Address** — single-address lookup (zoning, inspections, voting precinct, transit, schools).
2. **Neighborhoods** — long-form neighborhood profile (Avondale as the test subject).
3. **Displacement** — citywide map of risk phases + landlord concentrations.
4. **Lead Safety** — service-line composition by neighborhood + replacement trend.
5. **Police** — traffic stops, use of force, OIS, with sub-tabs.
6. **Accessibility** — disability prevalence + paratransit coverage.
7. **Tax & Revenue** — effective tax rate by income, revenue/spend breakdowns.

Keep the count to roughly this. We want **fewer, deeper** screens, not
a navigation tree.

---

## 1. Voice and editorial posture

Borrowed from the underlying Christian Glass brand (see his design
system) but adapted to civic data:

- **Lead with the "so what."** What does this number mean for someone
  visiting this block today? State that before describing the method.
- **Numbers go inside sentences.** Don't say "Median income: $22,500."
  Say "The typical Avondale household earns about $22,500 — roughly
  half the city's median."
- **Honest about limits.** Every page ends with a sources/limitations
  line in serif italic. Patterns in the public record describe city
  operations; they do not establish intent or cause.
- **No corporate filler.** Christian's CLAUDE.md banned phrases like
  "passionate professional" and "results-driven." Same rule here. No
  "leverage," no "empower," no "stakeholder."
- **No emoji. No exclamation marks.** Tone is measured.
- **Bilingual is real.** EN/ES toggle in the header is a placeholder
  today but the intent is real — when you write copy, keep it
  translatable (avoid idioms when there's a plain alternative).

Three voices to copy from when stuck:

> "It's a small thing, but it's consistent — and consistency is the point."

> "Cost-burden is the polite phrase. In practice it is the line at
> which a copay or a missed shift becomes structurally consequential."

> "Patterns in data do not establish intent or cause; they describe
> what the city's records look like."

### Casing

- Page titles: **Sentence case in Newsreader serif.** Often a full
  sentence with a period: "Avondale." "Black drivers are stopped at 4×
  the rate of white drivers."
- Eyebrows: **SMALLCAPS** (`.smallcaps` class — 11px Public Sans,
  uppercase, 0.12em tracking). Used for section dividers and labels.
- Buttons / links: **Sentence case action verbs.** "Print brief,"
  "Download data," "View calendar."
- No ALL CAPS for body, no Title Case for section labels (that's
  reserved for the SMALLCAPS treatment).

---

## 2. Visual foundations

### 2.1 Color tokens (canonical hex values)

All colors are also available as Tailwind utilities (`bg-river`,
`text-brick`, etc.) via the config block in `index.html`, and as CSS
variables (`--river`, `--brick`, etc.) on `:root`. Always reach for one
of these; never introduce a new hex.

| Token            | Hex       | Role                                              |
|------------------|-----------|---------------------------------------------------|
| `ink`            | `#1a1410` | Default body text. Almost black, slightly warm.   |
| `limestone`      | `#f6f1ea` | The page canvas behind all cards.                 |
| `paper`          | `#fbf8f3` | Card / panel background.                          |
| `rule`           | `#e4ddd2` | Hairlines, borders, axis lines.                   |
| `muted`          | `#6b5f55` | Secondary text, captions, source notes.           |
| `river`          | `#2f5d62` | **Primary data color.** Neutral / positive frame. |
| `river-deep`     | `#1f3f43` | Text on river-light backgrounds.                  |
| `river-light`    | `#e6efef` | Info pill / soft callout background.              |
| `brick`          | `#b34728` | **Alarm / negative.** Page accents, key claims.   |
| `brick-light`    | `#f5e8e1` | Warning callout background.                       |
| `hill`           | `#5a7a3e` | **Positive / supply-side.** Less common.          |
| `hill-light`     | `#ecefdf` | Good-news callout background.                     |
| `ochre`          | `#c8861a` | Editorial accent — section numerals, "unknown".   |

#### Color semantics — the rule we hold to

The palette has **a meaning grammar**, not just a list of colors:

- **`river`** is the default series color. It says "this is the number
  we're showing you" without judgment. Use it for unmarked series, for
  positive-or-neutral framings, and as the default chart fill.
- **`brick`** is reserved for the **claim that hurts** on the page —
  the disparity, the gap, the failure. Avondale's life expectancy is
  brick. The 4× traffic-stop disparity is brick. **Do not** use brick
  for decoration. If everything on the page is brick, nothing is.
- **`hill`** is for the constructive counterweight — supply of
  hospitals, affordable units built, replaced pipes. Use it sparingly.
- **`ochre`** is the page's editorial voice in color form. It's how we
  number sections (`01`, `02`, `03` in serif), and how we mark
  "unknown" categories in stacked bars. It is never used for data
  values — only for editorial chrome.
- **`muted`** is the *city baseline* in comparisons. When we draw "this
  neighborhood vs. citywide," the city bar is `muted` at 50% opacity.

Rule of thumb when you reach for a color:
> Ask, "Is this number the claim, the baseline, or the counterweight?"
> If the answer is "I don't know," it's `river`.

### 2.2 Type system

Three families. No fourth.

- **Newsreader** (variable serif, opsz 6–72) — display, headlines,
  pull quotes, big numbers in Stat blocks, source notes (in italic).
  This is the publication's voice. Reach for it whenever the type is
  doing editorial work.
- **Public Sans** — UI and body. Tabs, buttons, labels, captions,
  small comparative numbers, chips. Use `tnum` (tabular-nums) for any
  digits that need to align in columns.
- **JetBrains Mono** — loaded but used only for parcel IDs, file
  hashes, and similar machine-strings. Don't use it for vibes.

Sizes we've standardized:

| Use                            | Size / family                       |
|--------------------------------|-------------------------------------|
| Hero page title                | 64–96px Newsreader medium, −0.025em |
| `PaintHeadline` (section)      | 38px Newsreader medium, −0.015em    |
| `Lede` paragraph               | 17–18px Newsreader, line-height 1.6 |
| Stat number (big)              | 42–64px Newsreader medium           |
| Body                           | 13–14px Public Sans                 |
| Eyebrow numeral                | 34px Newsreader light, ochre        |
| `.smallcaps` eyebrow text      | 11px Public Sans 600, 0.12em        |
| Source / italic footnote       | 12px Newsreader italic, muted       |

### 2.3 Spacing, radii, shadows

- **Container**: `max-w-[1400px]` centered, `px-8` gutters.
- **Section rhythm**: `space-y-16` between sections inside an article.
- **Card padding**: 20–24px (use `p-5` for small cards, `p-6` for
  panels, `p-10` for hero blocks).
- **Radii**: `rounded-sm` (2px) for chips, `rounded-md` (6px) for cards
  and buttons, `rounded-full` only for paratransit-style pill chips.
  No big organic radii here — this is editorial, not playful.
- **Shadows**: practically none. We rely on hairlines (`1px solid
  var(--rule)`) and the `.page-paper` class (paper background + rule
  border). If a card needs to "lift," it's a wrong card.
- **Dot grid** (`.topo-bg`): 14px radial dot grid in river at 10%
  opacity over limestone. Use behind map-like sections; never under
  body copy.

---

## 3. The Visualization Through-Line

> This is the part to internalize before adding anything.

We are making **editorial infographics**, not a dashboard. Every chart
on this site obeys the following:

### 3.1 Charts illustrate sentences

Each section opens with a **`PaintHeadline`** — a real sentence that
states the finding, with one or two words colored to signal the
emotion of the claim:

```jsx
<PaintHeadline>
  Residents here live <Span color={C.brick}>nine years less</Span>
  than the average Cincinnatian.
</PaintHeadline>
```

The chart below proves the headline. If the chart's data doesn't
support a one-sentence claim, **the chart shouldn't be on the page**.

### 3.2 Charts are under-decorated on purpose

Looking at any of our atoms (`Sparkline`, `BarChart`, `CompareBar`,
`StackedBar`) you'll notice what's missing:

- No axes, no gridlines.
- No tooltips on hover (yet).
- No chart titles inside the SVG — the title is the `smallcaps`
  eyebrow above the chart.
- No legends as colored squares — when needed, the legend is **inline
  in the prose** ("thick bar Avondale; thin grey city").
- No animation on data entry.

The reason: framed widgets read like a dashboard. Bare marks read
like an illustration in the paragraph.

### 3.3 Numbers live inside prose via `<Chip>`

The single most distinctive UI choice on this site is the inline
**chip** — a number with a soft tinted background, baseline-aligned
with the surrounding sentence:

```jsx
<Chip>{fmt(N.population)} residents</Chip>
<Chip tone="warn">{N.health.leadPipes}% lead</Chip>
<Chip tone="good">{N.housing.affordableUnits} units</Chip>
```

Three tones: neutral (river), `warn` (brick), `good` (hill). Use chips
**inside paragraphs**, not in tables or labels. The point is to let
the eye land on numbers while still reading the sentence.

Rules:

- Always pair a chip with a unit or noun (`12% lead`, not just `12%`).
- Don't chain more than 4 chips in one sentence — at that point you
  should be looking at a chart or a list.
- Don't use chips inside Stat blocks — the Stat is already a number.

### 3.4 Comparisons are paired bars, never grouped bars

When you compare "this neighborhood vs. citywide," use
**`<CompareBar>`**:

- **Thick bar** for the local value, in the semantic color (`brick`
  for negative-tone, `hill` for positive, `river` default).
- **Thin bar** below it for the city baseline, in `muted` at 50%
  opacity.
- Value typeset to the right in Newsreader medium tnum.
- "city {value}" caption underneath in muted, smaller.

We do not use grouped bar charts. The visual stack of *thick-on-thin*
is the comparison vocabulary of this site. Use it everywhere a
"vs. city" comparison appears.

### 3.5 Stacked bars carry an editorial palette

For categorical breakdowns (race composition, service-line types,
revenue sources) we use `<StackedBar>`. Two rules:

- The semantic palette is always: **river → brick → hill → ochre**
  (and then `muted` and the soft tints for spillover). Don't pick
  rainbow.
- For service-line / lead composition, the order is **locked**:
  Lead (brick) → Unknown (ochre) → Copper (hill) → Replaced (river).
  This sequence reads as "danger → uncertainty → safe → good news"
  and is repeated across the Lead page and Avondale brief. Don't
  reorder it.

### 3.6 Sparklines are typographic, not visual

Sparklines (`<Sparkline values=...>`) are always:

- 28–30px tall, no axes, no labels inside the SVG.
- Same width as the column they sit in.
- Stroke 1.5, with a single dot on the most recent value (`showDots`).
- Color = the semantic color of the metric being trended (`brick` for
  Avondale life expectancy, `river` for income).

Think of them as setting type — they appear under a number to give it
a trajectory, not as a standalone chart.

### 3.7 Numerals are typeset in Newsreader

Every prominent number on the site (Stat blocks, hero ranks, big
percentages) is in **Newsreader medium with tabular-nums and tight
letter-spacing**. The combo of serif + tnum + slight optical-size shift
is the *signature texture* of the site. If you find yourself typing
big numbers in Public Sans, stop.

### 3.8 Every chart belongs to a section

Sections are wrapped in `<Section num={N} eyebrow="…">`. That gives
you the ochre serif numeral, the smallcaps label, and the hairline
divider. Use this for every block on every page. It's the editorial
spine.

### 3.9 The "two charts that rhyme" device

When two related metrics drive the same conclusion (Avondale's
pre-1950 housing share + its lead-pipe share, for example), put them
in **one panel** with the eyebrow `Two charts that rhyme`. The shared
y-context is the point — don't separate them into two cards.

### 3.10 Sources & limits sit at the bottom in italic serif

Every page ends with:

```jsx
<p className="serif italic text-[12px] pt-6"
   style={{ color: C.muted, borderTop: `1px solid ${C.rule}` }}>
  Sources: …
</p>
```

This is non-negotiable. It's the publication's posture.

---

## 4. Reusable atoms (the kit)

These live in `atoms.jsx` and `data.jsx` and are attached to `window`.
**Always use them.** If you find yourself building a new one, add it
here and document it.

| Atom               | When to use                                                          |
|--------------------|----------------------------------------------------------------------|
| `<Chip>`           | A number quoted in a sentence. Tones: default, `warn`, `good`.       |
| `<Tag>`            | A categorical label (FQHC, Approved, Hospital). Stronger than chip.  |
| `<Eyebrow num=…>`  | The section divider — ochre numeral + smallcaps + hairline.          |
| `<Stat>`           | A big number with caption + comparison sub-line. `sm/md/lg`, tones.  |
| `<CompareBar>`     | Local vs. city paired-bar comparison.                                |
| `<StackedBar>`     | Categorical share breakdown.                                         |
| `<Sparkline>`      | Trend under a Stat. Typographic, not visual.                         |
| `<BarChart>`       | Small monthly / time-bucketed counts. Last bar at 0.55 opacity.      |
| `<ConnectorNote>`  | A dashed-curve aside linking two charts.                             |
| `<Icon name=…>`    | Line glyphs, stroke 1.5, currentColor. 25 names available.           |
| `<ControlStrip>`   | Neighborhood selector / date / print / download header row.          |
| `fmt(n, opts)`     | All number formatting. `kind: 'usd' | 'usd1k' | 'usdM' | 'pct'`.     |

### Page-local atoms (only inside their page file)

Each page can define small helpers (`<PaintHeadline>`, `<Lede>`,
`<Span color>`, `<BriefItem>`) but they should be **stylistic shorthand
only** — no business logic. If two pages need the same atom, promote it
into `atoms.jsx`.

---

## 5. Page architecture pattern

Every direction page follows roughly the same skeleton:

```
[ Top control strip ]      neighborhood selector + date + print/download
[ Page hero          ]      eyebrow + serif page title + lede sentence
[ Section 01..N      ]      <Eyebrow num=I/> + PaintHeadline + Lede + chart panels
[ Sources footnote   ]      serif italic, hairline above
```

The Neighborhoods page adds a **sticky left "brief" rail** for the
six-item TL;DR. Reuse this when a page is long enough to need a
contents/summary rail. Otherwise, one column with generous section
spacing.

### Card patterns

- **`.page-paper` card** — paper bg, 1px rule border, rounded-md. The
  default container. Use for any chart panel or content block.
- **Tinted callout card** — `brick-light` / `river-light` / `hill-light`
  background, no border. For "what families should do," "what
  landlords should do," etc. Always paired with a smallcaps audience
  label.
- **Hero block** — `.page-paper` at `p-10` with a 64–96px serif title
  and one lede paragraph. One per page.

---

## 6. Things to actively avoid

Lessons from building this so far. Don't undo them:

1. **No gradients.** The page is solid limestone end to end. The
   closest thing is a 50%-opacity muted bar.
2. **No glassmorphism, no backdrop-blur.** Civic data doesn't blur.
3. **No skeuomorphic chart frames.** No grid backgrounds inside SVG,
   no axis ticks, no boxed legends.
4. **No raw emoji.** Use the `<Icon>` set. If you need a new glyph, add
   it to the Icon library with the same stroke conventions.
5. **No dashboards.** No 12-tile "KPI grid." If you find yourself
   making one, you're missing the headline.
6. **No alphabetical or "balanced" charts.** Sort by magnitude or by
   the editorial story. Bar charts in `data.jsx` are pre-sorted; keep
   it that way.
7. **No tooltips as the explanation.** If a number needs explaining,
   write the explanation in the lede. Hover states are for keyboard +
   precision, not for hiding meaning.
8. **No "Loading…" placeholders that flash.** The data is static.
   Treat it as a publication, not a feed.
9. **No invented colors.** If your section "needs purple," the section
   is wrong, not the palette.
10. **No anonymous charts.** Every chart has an eyebrow label, every
    page has sources at the bottom. No exceptions.

---

## 7. Future-screen guidance

When adding a new direction (e.g. *Eviction filings*, *Air quality*,
*Public-school outcomes*), do this in order:

1. **Write the headline first.** What is the one sentence this page
   exists to argue? If you can't write it, don't build the page yet.
2. **Pick the comparison.** Almost every page on this site frames a
   neighborhood (or a population) against the citywide baseline. Make
   sure that comparison exists in the data.
3. **Reuse the atoms.** PaintHeadline + Lede + Section + CompareBar +
   Stat covers ~80% of what you'll need.
4. **Plan two or three sections, not seven.** Density per section is
   good; section count is bad.
5. **Color budget per page**: river everywhere, brick for *the* claim,
   hill for the counterweight, ochre for chrome only. If you used four
   colors as data colors, you used one too many.
6. **End with a sources footnote.** Always.

### Specific upcoming candidates to keep in mind

- **Eviction filings** — would pair naturally with the Displacement
  page's landlord table. Use `brick` for filings, `river` for
  judgments, `hill` for dismissed.
- **Air quality** — sparklines along a year, paired with a CompareBar
  vs. EPA threshold. Probably one of the more sparkline-heavy pages.
- **Permitting / construction** — careful: this risks becoming a
  dashboard. Frame it as "what is being built and who lives next to
  it," not as a permit tracker.

---

## 8. Accessibility & print

- **Color is never the only signal.** CompareBar pairs thick + thin
  position. StackedBar has labels under it. The brick "alarm" is also
  the *headline* — color is reinforcing meaning that text already
  carries.
- **Contrast**: ink on limestone, river on paper, brick on
  brick-light, hill on hill-light have all been spot-checked at WCAG
  AA. If you tint a new card, verify the text on it.
- **Print brief** is a real action. When you add a page, give it a
  print-friendly layout via a CSS print rule (or, longer-term, a
  generated PDF). The Newsreader + Public Sans pair was chosen partly
  for legibility at 11pt on paper.
- **Bilingual**: copy strings should be extractable. Long-term we'll
  pull them into a `strings.{en,es}.js`. For now, write text in a way
  that survives translation (avoid figures of speech where a plain
  phrase exists).

---

## 9. Repo conventions (so the next agent doesn't break things)

### 9.1 Two codebases, one design system

This project ships in two places. Keep them in sync **conceptually**;
don't try to share files between them.

| Surface              | Lives in                                         | Purpose                                                    |
|----------------------|--------------------------------------------------|------------------------------------------------------------|
| **Design prototype** | This project (`index.html`, `atoms.jsx`, etc.)   | Fast visual iteration. Babel-in-browser. No build step.    |
| **Production app**   | The main repo (`src/components/ui/DesignAtoms.tsx`) | Typed, bundled, shipped to users.                          |

When the Bible references `atoms.jsx`, the production equivalent is
**`src/components/ui/DesignAtoms.tsx`**. The atom names, props, and
semantic rules in §3 and §4 apply to **both**.

Prototype → Production file mapping:

| Prototype path                | Production path                                  |
|-------------------------------|--------------------------------------------------|
| `atoms.jsx`                   | `src/components/ui/DesignAtoms.tsx`              |
| `data.jsx`                    | Typed data modules (per the production repo)     |
| `pages/<name>.jsx`            | `src/pages/<Name>.tsx` (or equivalent route file)|
| `shell.jsx`                   | App shell / router in the production repo        |

**Workflow rule**: design changes start in the prototype (so we can
see them without rebuilding), then port to the TypeScript components
once approved. Don't add a new atom to the production codebase without
first sketching it here — the prototype is where the visual language
gets argued out.

### 9.2 Prototype conventions

- One file per page in `pages/`, each defines a single React component
  attached to `window` (e.g. `window.NeighborhoodsPage`).
- All shared atoms in `atoms.jsx`, all mock data in `data.jsx`,
  attached to `window` at the bottom of the file.
- Routing is a `useState('neighborhoods')` in `shell.jsx`. Don't add
  a router library here; routing belongs in the production app.
- Tailwind via the CDN config block in `index.html`. CSS variables
  mirror Tailwind colors so plain CSS works too.
- React 18.3.1 + Babel standalone, pinned with integrity hashes.
  Don't bump these casually.

### 9.3 Cross-surface etiquette

- If you change a token (color, font size, spacing constant), update
  it in **both** the prototype's Tailwind config + CSS variables and
  the production theme file. The system only works because it's
  consistent.
- If you add an atom to the prototype, port it to
  `src/components/ui/DesignAtoms.tsx` with proper TypeScript types
  before the next page in production lands. Don't let the surfaces
  drift.
- If you find a divergence (atom exists in one place but not the
  other, or the semantic rules differ), flag it — the prototype is
  the source of truth for visual decisions, the production code is
  the source of truth for behavior.

---

## 10. The one-line summary

> A civic publication that uses charts to illustrate sentences,
> in service of public-record transparency for the people who actually
> live in Cincinnati.

If a design decision serves that line, ship it. If it doesn't, cut it.
