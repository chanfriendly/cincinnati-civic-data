/**
 * Editorial design atoms — shared primitives for the Cincinnati Civic Data redesign.
 *
 * These match the design prototype from Claude Design (May 2026).
 * Colors are inline rather than class-based for predictable rendering
 * across Tailwind's JIT boundary.
 */
import React from 'react'

// ── Color tokens (mirrors tailwind.config.ts for inline use) ─────────────────
export const C = {
  ink:         '#1a1410',
  muted:       '#6b5f55',
  rule:        '#e4ddd2',
  river:       '#2f5d62',
  riverDeep:   '#1f3f43',
  riverLight:  '#e6efef',
  brick:       '#b34728',
  brickLight:  '#f5e8e1',
  hill:        '#5a7a3e',
  hillLight:   '#ecefdf',
  paper:       '#fbf8f3',
  limestone:   '#f6f1ea',
  ochre:       '#c8861a',
  brickBorder: '#e6c5b2',  // warm tint for brick-adjacent borders (warn Tag, EditorialCallout)
} as const

// ── Chip — inline data number inside prose ────────────────────────────────────
type ChipTone = 'default' | 'warn' | 'good'
interface ChipProps { children: React.ReactNode; tone?: ChipTone }

export const Chip: React.FC<ChipProps> = ({ children, tone = 'default' }) => {
  const styles: Record<ChipTone, React.CSSProperties> = {
    default: { background: C.riverLight, color: C.riverDeep },
    warn:    { background: C.brickLight, color: '#7c2e16' },
    good:    { background: C.hillLight,  color: '#3d5527' },
  }
  return (
    <span
      className="inline-flex items-baseline gap-1 tnum"
      style={{
        padding: '1px 7px',
        borderRadius: 4,
        fontFamily: '"Public Sans", sans-serif',
        fontWeight: 600,
        fontVariantNumeric: 'tabular-nums',
        fontSize: '0.875em',
        lineHeight: 1.4,
        ...styles[tone],
      }}
    >
      {children}
    </span>
  )
}

// ── PaintHeadline — the big story-sentence above each section ─────────────────
export const PaintHeadline: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2
    className="serif font-medium leading-tight mb-3"
    style={{ fontSize: 26, color: C.ink, letterSpacing: '-0.01em' }}
  >
    {children}
  </h2>
)

// ── Span — inline colored text inside a PaintHeadline ────────────────────────
export const Span: React.FC<{ children: React.ReactNode; color: string }> = ({ children, color }) => (
  <span style={{ color }}>{children}</span>
)

// ── Lede — first paragraph of a section (editorial prose) ────────────────────
export const Lede: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p
    className="serif leading-relaxed mb-0"
    style={{ fontSize: 17, color: C.ink, lineHeight: 1.65, maxWidth: 740 }}
  >
    {children}
  </p>
)

// ── Eyebrow — section label with optional number and rule ─────────────────────
interface EyebrowProps { children: React.ReactNode; num?: number }

export const Eyebrow: React.FC<EyebrowProps> = ({ children, num }) => (
  <div className="flex items-baseline gap-3 mb-4">
    {num != null && (
      <span
        className="serif tnum font-light"
        style={{ fontSize: 34, lineHeight: 1, color: C.ochre }}
      >
        {String(num).padStart(2, '0')}
      </span>
    )}
    <span className="smallcaps" style={{ color: C.muted }}>{children}</span>
    <div className="flex-1" style={{ height: 1, background: C.rule }} />
  </div>
)

// ── Section — numbered section wrapper ────────────────────────────────────────
interface SectionProps { num: number; eyebrow: string; children: React.ReactNode }

export const Section: React.FC<SectionProps> = ({ num, eyebrow, children }) => (
  <section>
    <Eyebrow num={num}>{eyebrow}</Eyebrow>
    {children}
  </section>
)

// ── Tag — small pill badge ────────────────────────────────────────────────────
type TagTone = 'neutral' | 'warn' | 'good' | 'info'
interface TagProps { children: React.ReactNode; tone?: TagTone }

export const Tag: React.FC<TagProps> = ({ children, tone = 'neutral' }) => {
  const styles: Record<TagTone, React.CSSProperties> = {
    neutral: { background: C.limestone, color: C.ink,       border: `1px solid ${C.rule}` },
    warn:    { background: C.brickLight, color: '#7c2e16',  border: `1px solid ${C.brickBorder}` },
    good:    { background: C.hillLight,  color: '#3d5527',  border: '1px solid #cfd9b2' },
    info:    { background: C.riverLight, color: C.riverDeep, border: `1px solid ${C.rule}` },
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm text-[11px] font-medium"
      style={{ padding: '2px 8px', ...styles[tone] }}
    >
      {children}
    </span>
  )
}

// ── Stat — a single large number with label ───────────────────────────────────
type StatTone = 'default' | 'warn' | 'good'
type StatSize = 'sm' | 'md' | 'lg'
interface StatProps {
  value: string | number
  unit?: string
  label: string
  sub?: string
  tone?: StatTone
  size?: StatSize
}

export const Stat: React.FC<StatProps> = ({
  value, unit, label, sub, tone = 'default', size = 'md',
}) => {
  const color = tone === 'warn' ? C.brick : tone === 'good' ? C.hill : C.ink
  const numSize = size === 'lg' ? 64 : size === 'sm' ? 28 : 42
  const unitSize = size === 'lg' ? 24 : size === 'sm' ? 14 : 18

  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="serif tnum font-medium leading-none" style={{ fontSize: numSize, color }}>
          {value}
        </span>
        {unit && (
          <span className="serif tnum font-light" style={{ fontSize: unitSize, color }}>
            {unit}
          </span>
        )}
      </div>
      <div className="text-[13px] mt-2 leading-tight" style={{ color: C.ink }}>{label}</div>
      {sub && <div className="text-[11px] mt-1 leading-snug" style={{ color: C.muted }}>{sub}</div>}
    </div>
  )
}

// ── CompareBar — two stacked horizontal bars (neighborhood vs city) ───────────
type BarTone = 'neutral' | 'positive' | 'negative'
interface CompareBarProps {
  label: string
  value: number
  cityValue: number
  max?: number
  format?: (x: number) => string
  tone?: BarTone
  unit?: string
}

export const CompareBar: React.FC<CompareBarProps> = ({
  label, value, cityValue, max, format = (x) => x.toLocaleString(), tone = 'neutral', unit = '',
}) => {
  const m = max ?? Math.max(value, cityValue) * 1.15
  const barColor = tone === 'negative' ? C.brick : tone === 'positive' ? C.hill : C.river

  return (
    <div className="grid py-2" style={{ gridTemplateColumns: '1fr auto', gap: '0 12px' }}>
      <div className="text-[13px] col-span-2 mb-1.5" style={{ color: C.ink }}>{label}</div>
      <div className="space-y-1.5">
        {/* Neighborhood bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: C.rule }}>
            <div className="h-full rounded-full" style={{ width: `${(value / m) * 100}%`, background: barColor }} />
          </div>
        </div>
        {/* City comparison bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: C.rule }}>
            <div className="h-full rounded-full" style={{ width: `${(cityValue / m) * 100}%`, background: C.muted, opacity: 0.45 }} />
          </div>
        </div>
      </div>
      <div className="text-right self-center">
        <div className="serif tnum font-medium leading-none" style={{ fontSize: 18, color: barColor }}>
          {format(value)}{unit}
        </div>
        <div className="tnum mt-1" style={{ fontSize: 10, color: C.muted }}>
          city {format(cityValue)}{unit}
        </div>
      </div>
    </div>
  )
}

// ── StackedBar — horizontal proportional bar (e.g. lead pipe breakdown) ───────
interface StackedSegment { label: string; share: number; color?: string }
interface StackedBarProps {
  segments: StackedSegment[]
  height?: number
  showLabels?: boolean
}

export const StackedBar: React.FC<StackedBarProps> = ({
  segments, height = 14, showLabels = true,
}) => {
  const total = segments.reduce((s, x) => s + x.share, 0)
  return (
    <div>
      <div className="flex w-full overflow-hidden rounded-sm" style={{ height, gap: 2 }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            title={`${seg.label}: ${seg.share}%`}
            style={{
              width: `${(seg.share / total) * 100}%`,
              background: seg.color ?? C.river,
              minWidth: seg.share > 0 ? 2 : 0,
            }}
          />
        ))}
      </div>
      {showLabels && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: 11, color: C.muted }}>
          {segments.map((seg, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-sm" style={{ background: seg.color ?? C.river }} />
              <span className="tnum">{seg.share}%</span> {seg.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sparkline — mini SVG line chart ──────────────────────────────────────────
interface SparklineProps {
  values: number[]
  width?: number
  height?: number
  color?: string
  showDot?: boolean
}

export const Sparkline: React.FC<SparklineProps> = ({
  values, width = 120, height = 30, color = C.river, showDot = false,
}) => {
  if (!values || values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const stepX = width / (values.length - 1)
  const pts = values.map((v, i) => [
    i * stepX,
    height - ((v - min) / range) * (height - 4) - 2,
  ])
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const last = pts[pts.length - 1]

  return (
    <svg display="block" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {showDot && <circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />}
    </svg>
  )
}

// ── MiniBarChart — vertical bars (monthly counts etc.) ───────────────────────
interface MiniBarChartProps {
  values: number[]
  width?: number
  height?: number
  color?: string
}

export const MiniBarChart: React.FC<MiniBarChartProps> = ({
  values, width = 200, height = 40, color = C.river,
}) => {
  const max = Math.max(...values, 1)
  const gap = 2
  const barW = (width - gap * (values.length - 1)) / values.length
  return (
    <svg display="block" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {values.map((v, i) => {
        const h = (v / max) * height
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            rx={1}
            fill={color}
            opacity={i === values.length - 1 ? 0.5 : 1}
          />
        )
      })}
    </svg>
  )
}

// ── BriefItem — numbered item in the Visit Brief sidebar ─────────────────────
interface BriefItemProps { n: string; children: React.ReactNode }

export const BriefItem: React.FC<BriefItemProps> = ({ n, children }) => (
  <li className="flex gap-3">
    <span
      className="serif tnum font-light shrink-0 mt-0.5"
      style={{ fontSize: 20, lineHeight: 1, color: C.ochre, minWidth: 24 }}
    >
      {n}
    </span>
    <div className="min-w-0 flex-1">{children}</div>
  </li>
)
