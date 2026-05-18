/**
 * TaxRevenue — Tax & Revenue tab.
 *
 * Five sections:
 *   1. Cincinnati's flat local income tax rate (policy fact)
 *   2. Cincinnati household income percentiles over time (measured, ACS B19080)
 *   3. Modeled state+local effective tax burden by income quintile (ITEP applied)
 *   4. What the city actually collects, by revenue category (live Socrata)
 *   5. Where the city spends, by fund category (live Socrata)
 *
 * Modeling disclosure is load-bearing: section 3 is a MODEL, not a measurement.
 * We show the ITEP Ohio incidence profile applied to Cincinnati's percentile
 * thresholds. Every caveat is flagged in the UI and cross-linked to the
 * Limitations tab.
 *
 * Data sources:
 *   public/data/cincinnati_tax_rate_history.json  (curated)
 *   public/data/itep_ohio_incidence.json          (ITEP 7th ed, 2024)
 *   public/data/cincinnati_income_percentiles.json (ACS B19080, 2012–2023)
 *   Socrata a9hy-bv25 (live, via fetchCityRevenue in src/utils/api.ts)
 *   Socrata qmwc-pyt8 (live, via fetchCitySpending in src/utils/api.ts)
 */

import React, { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell,
} from 'recharts'
import {
  fetchCityRevenue, classifyRevenue, type CityRevenueRow, type RevenueCategory,
  fetchCitySpending, classifySpending, type CitySpendingRow, type SpendingCategory,
} from '../../utils/api'
import { useLanguage } from '../../context/LanguageContext'
import { C, Eyebrow, PaintHeadline, Lede, Tag } from '../../components/ui/DesignAtoms'

// ─── Types for static data ────────────────────────────────────────────────────

interface TaxRateHistory {
  source: { name: string; url: string; fetched_at: string; note: string }
  rate_type: string
  description: string
  history: Array<{
    effective_from: string | null
    effective_to: string | null
    rate_pct: number
    source_note: string
    verified: boolean
  }>
}

interface ITEPData {
  source: { name: string; url: string; edition: string; data_year_note: string; fetched_at: string }
  scope: string
  modeling_note: string
  groups: Array<{
    id: string
    label: string
    income_range: string
    income_low: number
    income_high: number | null
    avg_income: number
    effective_tax_rate_pct: number
  }>
  key_finding: string
  caveats: string[]
}

interface PercentileData {
  source: { dataset: string; place: string; api: string; built_at: string; note: string }
  fields: Record<string, string>
  years: Array<{
    year: number
    p20: number | null
    p40: number | null
    p60: number | null
    p80: number | null
    p95: number | null
  }>
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtUSD = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtUSDShort = (n: number) => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

// ─── Editorial UI helpers ─────────────────────────────────────────────────────

const MeasuredTag: React.FC = () => (
  <Tag tone="good">● Measured</Tag>
)
const ModeledTag: React.FC = () => (
  <Tag tone="neutral">▲ Modeled</Tag>
)

const EditorialCallout: React.FC<{ tone?: 'info' | 'warn'; title: string; children: React.ReactNode }> = ({ tone = 'info', title, children }) => {
  const bg    = tone === 'warn' ? C.brickLight : C.riverLight
  const border = tone === 'warn' ? '#e6c5b2' : '#bfd2d4'
  const titleColor = tone === 'warn' ? C.brick : C.riverDeep
  return (
    <div className="rounded-md p-4" style={{ background: bg, border: `1px solid ${border}` }}>
      <p className="text-[13px] font-semibold mb-1" style={{ color: titleColor }}>{title}</p>
      <div className="text-[13px] leading-relaxed" style={{ color: C.ink, opacity: 0.9 }}>{children}</div>
    </div>
  )
}

// ─── Editorial chart axis/grid defaults ──────────────────────────────────────

const axisProps = { stroke: C.muted, fontSize: 11 }
const gridProps = { strokeDasharray: '3 3' as const, stroke: C.rule }

// ─── Section 1: Cincinnati income tax rate history ────────────────────────────

const RateHistorySection: React.FC<{ data: TaxRateHistory | null }> = ({ data }) => {
  if (!data) return null

  const current = data.history.find(h => h.effective_to === null) || data.history[0]
  const prior = data.history.find(h => h !== current)

  return (
    <section className="page-paper rounded-md p-6 mb-6">
      <Eyebrow num={1}>Tax Rate <span style={{ marginLeft: 8 }}><MeasuredTag /></span></Eyebrow>
      <PaintHeadline>
        Cincinnati charges a flat <span style={{ color: C.river }}>{current.rate_pct}%</span> on every dollar earned here.
      </PaintHeadline>
      <Lede>
        Because the rate is flat, every income level pays the same local percentage — any progressivity
        or regressivity in your total bill comes from state, federal, and sales taxes, not the city.
      </Lede>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        {/* Current rate hero */}
        <div className="rounded-md p-5" style={{ background: C.river, color: '#fff' }}>
          <p className="smallcaps mb-1" style={{ color: 'rgba(255,255,255,0.7)' }}>Current rate</p>
          <p className="serif font-medium leading-none" style={{ fontSize: 48 }}>{current.rate_pct}%</p>
          <p className="text-[12px] mt-2" style={{ color: 'rgba(255,255,255,0.7)' }}>
            Effective {current.effective_from ?? '—'}
          </p>
        </div>

        {/* Prior rate */}
        {prior && (
          <div className="rounded-md p-5" style={{ background: C.limestone, border: `1px solid ${C.rule}` }}>
            <p className="smallcaps mb-1" style={{ color: C.muted }}>Prior rate</p>
            <p className="serif font-medium leading-none" style={{ fontSize: 48, color: C.muted }}>{prior.rate_pct}%</p>
            <p className="text-[12px] mt-2" style={{ color: C.muted }}>
              Until {prior.effective_to ?? '—'}
            </p>
          </div>
        )}

        {/* Who decides */}
        <div className="rounded-md p-5" style={{ background: C.limestone, border: `1px solid ${C.rule}` }}>
          <p className="smallcaps mb-1" style={{ color: C.muted }}>Who decides</p>
          <p className="text-[15px] font-semibold mt-1" style={{ color: C.ink }}>Cincinnati City Council</p>
          <p className="text-[12px] mt-2 leading-relaxed" style={{ color: C.muted }}>
            All 9 at-large members vote on rate changes. Some changes require a ballot measure.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <EditorialCallout tone="info" title={`Rate change: ${prior?.rate_pct}% → ${current.rate_pct}% on ${current.effective_from}`}>
          <p>{current.source_note}</p>
        </EditorialCallout>
      </div>

      <p className="text-[11px] mt-4 leading-relaxed" style={{ color: C.muted }}>
        <strong style={{ color: C.ink }}>On earlier rate history:</strong> {data.source.note}
        {' '}Source:{' '}
        <a href={data.source.url} target="_blank" rel="noopener noreferrer" style={{ color: C.river }}>
          {data.source.name}
        </a>
        {' '}(fetched {data.source.fetched_at}).
      </p>
    </section>
  )
}

// ─── Section 2: Income percentile thresholds over time ────────────────────────

const PERCENTILE_KEYS = ['p20', 'p40', 'p60', 'p80', 'p95'] as const
const PERCENTILE_LABELS: Record<typeof PERCENTILE_KEYS[number], string> = {
  p20: '20th pct — lowest 20%',
  p40: '40th pct',
  p60: '60th pct — median-ish',
  p80: '80th pct',
  p95: '95th pct — top 5% threshold',
}
const PERCENTILE_COLORS: Record<typeof PERCENTILE_KEYS[number], string> = {
  p20: C.brick,
  p40: C.muted,
  p60: C.river,
  p80: C.hill,
  p95: C.riverDeep,
}

const PercentilesSection: React.FC<{ data: PercentileData | null }> = ({ data }) => {
  if (!data || data.years.length === 0) return null

  const chartData = data.years.map(y => ({ ...y }))
  const latest = data.years[data.years.length - 1]
  const earliest = data.years[0]

  const p20Change = latest.p20 && earliest.p20 ? ((latest.p20 - earliest.p20) / earliest.p20) * 100 : null
  const p95Change = latest.p95 && earliest.p95 ? ((latest.p95 - earliest.p95) / earliest.p95) * 100 : null

  return (
    <section className="page-paper rounded-md p-6 mb-6">
      <Eyebrow num={2}>Household Income <span style={{ marginLeft: 8 }}><MeasuredTag /></span></Eyebrow>
      <PaintHeadline>
        In {latest.year}, half of Cincinnati households earned{' '}
        <span style={{ color: C.river }}>less than ~{fmtUSDShort(Math.round(((latest.p40 ?? 0) + (latest.p60 ?? 0)) / 2))}</span>.
      </PaintHeadline>
      <Lede>
        These are the household-income thresholds marking each percentile of Cincinnati residents,
        from U.S. Census ACS 5-year estimates. In {latest.year}, a household earning{' '}
        <strong>{fmtUSD(latest.p20 ?? 0)} or less</strong> was in the lowest 20%;
        a household earning over <strong>{fmtUSD(latest.p95 ?? 0)}</strong> was in the top 5%.
      </Lede>

      <div className="w-full mt-6" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="year" {...axisProps} />
            <YAxis {...axisProps} tickFormatter={fmtUSDShort} />
            <Tooltip
              formatter={(v: number) => fmtUSD(v)}
              labelFormatter={(l) => `ACS 5-year ending ${l}`}
              contentStyle={{ fontSize: 12, borderColor: C.rule, borderRadius: 6 }}
            />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {PERCENTILE_KEYS.map(k => (
              <Line
                key={k}
                type="monotone"
                dataKey={k}
                name={PERCENTILE_LABELS[k]}
                stroke={PERCENTILE_COLORS[k]}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {p20Change !== null && p95Change !== null && (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-md p-4" style={{ background: C.brickLight, border: `1px solid #e6c5b2` }}>
            <p className="smallcaps mb-1" style={{ color: C.brick }}>Lowest 20% — nominal change</p>
            <p className="serif font-medium text-[18px]" style={{ color: C.ink }}>
              {fmtUSD(earliest.p20 ?? 0)} → {fmtUSD(latest.p20 ?? 0)}
            </p>
            <p className="text-[12px] mt-1" style={{ color: C.muted }}>
              +{p20Change.toFixed(1)}% nominal over {latest.year - earliest.year} years — roughly tracking (or behind) inflation.
            </p>
          </div>
          <div className="rounded-md p-4" style={{ background: C.riverLight, border: `1px solid #bfd2d4` }}>
            <p className="smallcaps mb-1" style={{ color: C.riverDeep }}>Top 5% threshold — nominal change</p>
            <p className="serif font-medium text-[18px]" style={{ color: C.ink }}>
              {fmtUSD(earliest.p95 ?? 0)} → {fmtUSD(latest.p95 ?? 0)}
            </p>
            <p className="text-[12px] mt-1" style={{ color: C.muted }}>
              +{p95Change.toFixed(1)}% nominal over {latest.year - earliest.year} years.
            </p>
          </div>
        </div>
      )}

      <p className="text-[11px] mt-4 leading-relaxed" style={{ color: C.muted }}>
        <strong style={{ color: C.ink }}>About this data:</strong> ACS 5-year estimates combine survey waves;
        a year of "2023" represents 2019–2023 combined. These are <em>nominal dollars</em> — not inflation-adjusted.{' '}
        <a href="https://censusreporter.org/tables/B19080/" target="_blank" rel="noopener noreferrer" style={{ color: C.river }}>
          Source: ACS Table B19080
        </a>.
      </p>
    </section>
  )
}

// ─── Section 3: ITEP state+local tax burden (MODELED) ─────────────────────────

const ITEPSection: React.FC<{ itep: ITEPData | null; latestPercentiles: PercentileData['years'][number] | null }> = ({ itep, latestPercentiles }) => {
  if (!itep) return null

  const chartData = itep.groups.map(g => ({
    name: g.label,
    rate: g.effective_tax_rate_pct,
    range: g.income_range,
    avg: g.avg_income,
  }))

  const highest = Math.max(...itep.groups.map(g => g.effective_tax_rate_pct))
  const lowest  = Math.min(...itep.groups.map(g => g.effective_tax_rate_pct))

  return (
    <section className="page-paper rounded-md p-6 mb-6" style={{ borderLeft: `3px solid ${C.ochre}` }}>
      <Eyebrow num={3}>Effective Tax Burden <span style={{ marginLeft: 8 }}><ModeledTag /></span></Eyebrow>
      <PaintHeadline>
        Ohio's lowest earners pay{' '}
        <span style={{ color: C.brick }}>{(highest / lowest).toFixed(1)}×</span>{' '}
        the effective rate of the highest.
      </PaintHeadline>
      <Lede>
        This is the Institute on Taxation &amp; Economic Policy's <em>Who Pays? 7th Edition</em> (2024)
        analysis of Ohio's state and local tax system — sales, property, and income taxes combined,
        as a share of household income for each income group.
      </Lede>

      <div className="mt-4 rounded-md p-4" style={{ background: C.limestone, border: `1px solid ${C.rule}` }}>
        <p className="text-[13px] font-semibold mb-1" style={{ color: C.ink }}>Key finding</p>
        <p className="text-[13px] leading-relaxed" style={{ color: C.ink }}>{itep.key_finding}</p>
      </div>

      <div className="w-full mt-6" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 40 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} angle={-20} textAnchor="end" height={60} interval={0} />
            <YAxis {...axisProps} tickFormatter={(v) => `${v}%`} domain={[0, 15]} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null
                const row = payload[0].payload as typeof chartData[number]
                return (
                  <div className="rounded-md p-3 text-[12px]" style={{ background: C.paper, border: `1px solid ${C.rule}` }}>
                    <p className="font-semibold mb-1" style={{ color: C.ink }}>{label}</p>
                    <p style={{ color: C.muted }}>Income range: {row.range}</p>
                    <p style={{ color: C.muted }}>Avg income: {fmtUSD(row.avg)}</p>
                    <p className="font-semibold mt-1" style={{ color: C.ink }}>
                      Effective state + local tax: {row.rate.toFixed(1)}%
                    </p>
                  </div>
                )
              }}
            />
            <Bar dataKey="rate" name="Effective state + local tax rate">
              {chartData.map((row, i) => {
                const color = row.rate >= 12 ? C.brick : row.rate >= 10 ? C.ochre : row.rate >= 8 ? C.hill : C.river
                return <Cell key={i} fill={color} />
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {latestPercentiles && (
        <div className="mt-5 rounded-md p-4" style={{ background: C.limestone, border: `1px solid ${C.rule}` }}>
          <p className="smallcaps mb-2" style={{ color: C.muted }}>
            Rough Cincinnati alignment ({latestPercentiles.year})
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: C.ink }}>
            Cincinnati's lowest 20% tops out at about <strong>{fmtUSD(latestPercentiles.p20 ?? 0)}</strong>,
            close to Ohio's lowest-20% bracket ({fmtUSD(itep.groups[0].income_high ?? 22500)} statewide).
            Cincinnati's top 5% threshold is around <strong>{fmtUSD(latestPercentiles.p95 ?? 0)}</strong>.
            {' '}<em style={{ color: C.muted }}>These are Ohio-wide incidence rates applied to Cincinnati incomes — a reasonable estimate, not a Cincinnati-specific measurement.</em>
          </p>
        </div>
      )}

      <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
        <p className="smallcaps mb-2" style={{ color: C.ochre }}>What "Modeled" means here</p>
        <p className="text-[13px] leading-relaxed mb-3" style={{ color: C.ink }}>{itep.modeling_note}</p>
        <p className="smallcaps mb-2" style={{ color: C.ochre }}>Important caveats</p>
        <ul className="text-[12px] space-y-1.5 leading-relaxed list-disc pl-5" style={{ color: C.muted }}>
          {itep.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </div>

      <p className="text-[11px] mt-4 pt-3 leading-relaxed" style={{ borderTop: `1px solid ${C.rule}`, color: C.muted }}>
        Source:{' '}
        <a href={itep.source.url} target="_blank" rel="noopener noreferrer" style={{ color: C.river }}>
          {itep.source.name}
        </a>
        {' '}— {itep.source.data_year_note}. If you need citable numbers for advocacy, cite ITEP directly, not this site.
      </p>
    </section>
  )
}

// ─── Revenue & Spending color palettes ───────────────────────────────────────

const CATEGORY_ORDER: RevenueCategory[] = [
  'Income Tax', 'Property Tax', 'Utility Charges', 'Charges for Services',
  'Intergovernmental', 'Licenses, Fines & Permits', 'Investment Income',
  'Internal Transfers', 'Other',
]

const CATEGORY_COLORS: Record<RevenueCategory, string> = {
  'Income Tax':                C.river,
  'Property Tax':              C.hill,
  'Utility Charges':           C.riverDeep,
  'Charges for Services':      C.ochre,
  'Intergovernmental':         '#8a6e3e',
  'Licenses, Fines & Permits': C.brick,
  'Investment Income':         '#2e5438',
  'Internal Transfers':        '#a89880',
  'Other':                     C.muted,
}

const SPENDING_CATEGORY_ORDER: SpendingCategory[] = [
  'Water & Sewer', 'Capital Projects', 'General Government', 'Community Development',
  'Risk & Insurance', 'Public Health', 'Transit & Streets', 'Recreation & Culture',
  'Internal Services', 'Other',
]

const SPENDING_CATEGORY_COLORS: Record<SpendingCategory, string> = {
  'Water & Sewer':        C.riverDeep,
  'Capital Projects':     C.river,
  'General Government':   C.hill,
  'Community Development':C.ochre,
  'Risk & Insurance':     '#a89880',
  'Public Health':        C.brick,
  'Transit & Streets':    '#2e5438',
  'Recreation & Culture': '#8a6e3e',
  'Internal Services':    '#c4a96e',
  'Other':                C.muted,
}

// ─── Shared breakdown table ───────────────────────────────────────────────────

function BreakdownTable<T extends string>({
  latestFY,
  categories,
  colors,
  label,
}: {
  latestFY: Record<string, number | string | undefined>
  categories: T[]
  colors: Record<T, string>
  label: string
}) {
  const total = categories.reduce((s, c) => s + ((latestFY[c] as number) ?? 0), 0)
  const rows = categories
    .map(cat => ({ cat, amount: (latestFY[cat] as number) ?? 0 }))
    .filter(r => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)

  return (
    <div className="mt-5">
      <p className="smallcaps mb-2" style={{ color: C.muted }}>{label}</p>
      <div className="overflow-x-auto rounded-md" style={{ border: `1px solid ${C.rule}` }}>
        <table className="w-full text-[13px]">
          <thead style={{ background: C.limestone }}>
            <tr>
              <th className="text-left px-3 py-2 font-semibold" style={{ color: C.ink }}>Category</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: C.ink }}>Amount</th>
              <th className="text-right px-3 py-2 font-semibold" style={{ color: C.ink }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.cat} style={{ borderTop: i > 0 ? `1px solid ${C.rule}` : undefined }}>
                <td className="px-3 py-2" style={{ color: C.ink }}>
                  <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ background: colors[r.cat as T] }} />
                  {r.cat}
                </td>
                <td className="px-3 py-2 text-right tnum" style={{ color: C.ink }}>{fmtUSD(r.amount)}</td>
                <td className="px-3 py-2 text-right tnum" style={{ color: C.muted }}>
                  {total > 0 ? ((r.amount / total) * 100).toFixed(1) : '—'}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Section 4: What the city actually collects ───────────────────────────────

const RevenueSection: React.FC = () => {
  const [rows, setRows] = useState<CityRevenueRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchCityRevenue()
      .then(r => { if (!cancelled) { setRows(r); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message ?? 'Unknown error'); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const chartData = useMemo(() => {
    if (!rows) return []
    const byYear = new Map<string, Partial<Record<RevenueCategory, number>> & { year: string }>()
    for (const r of rows) {
      const cat = classifyRevenue(r.resource_name)
      const entry = byYear.get(r.fiscal_year) || { year: r.fiscal_year }
      entry[cat] = (entry[cat] || 0) + r.total
      byYear.set(r.fiscal_year, entry)
    }
    return Array.from(byYear.values()).sort((a, b) => a.year.localeCompare(b.year))
  }, [rows])

  const latestFY = useMemo(() => {
    if (chartData.length === 0) return null
    const sorted = [...chartData].sort((a, b) => a.year.localeCompare(b.year))
    const last = sorted[sorted.length - 1]
    const prev = sorted[sorted.length - 2]
    const lastTotal = CATEGORY_ORDER.reduce((s, c) => s + ((last as Record<string, number | string | undefined>)[c] as number ?? 0), 0)
    const prevTotal = prev ? CATEGORY_ORDER.reduce((s, c) => s + ((prev as Record<string, number | string | undefined>)[c] as number ?? 0), 0) : 0
    return (prev && lastTotal < prevTotal * 0.6) ? prev : last
  }, [chartData])

  const incomeTaxShare = useMemo(() => {
    if (!latestFY) return null
    const total = CATEGORY_ORDER.reduce((s, c) => s + ((latestFY as Record<string, number | string | undefined>)[c] as number ?? 0), 0)
    const itx = ((latestFY as Record<string, number | string | undefined>)['Income Tax'] as number) ?? 0
    return total > 0 ? ((itx / total) * 100).toFixed(0) : null
  }, [latestFY])

  return (
    <section className="page-paper rounded-md p-6 mb-6">
      <Eyebrow num={4}>What the City Collects <span style={{ marginLeft: 8 }}><MeasuredTag /></span></Eyebrow>
      <PaintHeadline>
        Income tax funds{' '}
        <span style={{ color: C.river }}>{incomeTaxShare ? `${incomeTaxShare}%` : 'more than a third'}</span>{' '}
        of what the city brings in.
      </PaintHeadline>
      <Lede>
        Cincinnati's positive revenue lines, FY 2014–present, grouped into broad categories.
        The current fiscal year is typically partial — don't read a drop at the far right as a real decline.
      </Lede>

      {loading && (
        <div className="py-10 text-center text-[13px]" style={{ color: C.muted }}>
          Loading revenue data from Cincinnati Open Data…
        </div>
      )}
      {error && (
        <div className="rounded-md p-4 mt-4" style={{ background: C.brickLight, border: `1px solid #e6c5b2` }}>
          <p className="text-[13px] font-semibold mb-1" style={{ color: C.brick }}>Couldn't load revenue data.</p>
          <p className="text-[13px]" style={{ color: C.ink, opacity: 0.8 }}>{error}</p>
          <p className="text-[11px] mt-2" style={{ color: C.muted }}>Queries dataset <code>a9hy-bv25</code> live. If the portal is down this section may be empty.</p>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <>
          <div className="mt-4">
            <EditorialCallout tone="info" title="About Internal Transfers">
              <p>
                "Internal Transfers" is often the largest category but represents money moving <em>within</em> city
                government, not new revenue from taxpayers. Not all city revenue is tax revenue — fees for
                services and utility charges are shown too.
              </p>
            </EditorialCallout>
          </div>

          <div className="w-full mt-5" style={{ height: 340 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="year" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={fmtUSDShort} />
                <Tooltip formatter={(v: number) => fmtUSD(v)} contentStyle={{ fontSize: 12, borderColor: C.rule, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {CATEGORY_ORDER.map(cat => (
                  <Bar key={cat} dataKey={cat} stackId="revenue" fill={CATEGORY_COLORS[cat]} name={cat} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {latestFY && (
            <BreakdownTable
              latestFY={latestFY as Record<string, number | string | undefined>}
              categories={CATEGORY_ORDER}
              colors={CATEGORY_COLORS}
              label={`Revenue mix, FY ${latestFY.year}`}
            />
          )}
        </>
      )}

      <p className="text-[11px] mt-4 pt-3 leading-relaxed" style={{ borderTop: `1px solid ${C.rule}`, color: C.muted }}>
        Source: City of Cincinnati Revenue dataset{' '}
        <a href="https://data.cincinnati-oh.gov/Fiscal-Sustainability/City-of-Cincinnati-Revenue/a9hy-bv25"
          target="_blank" rel="noopener noreferrer" style={{ color: C.river }}>
          a9hy-bv25
        </a>
        {' '}on the Open Data Portal, updated daily.
      </p>
    </section>
  )
}

// ─── Section 5: What the city spends ─────────────────────────────────────────

const SpendingSection: React.FC = () => {
  const [rows, setRows] = useState<CitySpendingRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetchCitySpending()
      .then(r => { if (!cancelled) { setRows(r); setLoading(false) } })
      .catch(e => { if (!cancelled) { setError(e.message ?? 'Unknown error'); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  const chartData = useMemo(() => {
    if (!rows) return []
    const byYear = new Map<string, Partial<Record<SpendingCategory, number>> & { year: string }>()
    for (const r of rows) {
      const cat = classifySpending(r.fund_desc)
      const entry = byYear.get(r.fiscal_year) || { year: r.fiscal_year }
      entry[cat] = (entry[cat] || 0) + r.total
      byYear.set(r.fiscal_year, entry)
    }
    return Array.from(byYear.values())
      .sort((a, b) => a.year.localeCompare(b.year))
      .filter((_, i, arr) => {
        if (i !== arr.length - 1) return true
        const cur  = SPENDING_CATEGORY_ORDER.reduce((s, c) => s + ((arr[i]    as Record<string, number | string | undefined>)[c] as number ?? 0), 0)
        const prev = arr[i - 1] ? SPENDING_CATEGORY_ORDER.reduce((s, c) => s + ((arr[i - 1] as Record<string, number | string | undefined>)[c] as number ?? 0), 0) : cur
        return cur >= prev * 0.6
      })
  }, [rows])

  const latestFY = useMemo(() => chartData.length ? chartData[chartData.length - 1] : null, [chartData])

  return (
    <section className="page-paper rounded-md p-6 mb-6">
      <Eyebrow num={5}>Where the Money Goes <span style={{ marginLeft: 8 }}><MeasuredTag /></span></Eyebrow>
      <PaintHeadline>
        Water, sewer, and capital projects dominate{' '}
        <span style={{ color: C.river }}>what the city buys from contractors.</span>
      </PaintHeadline>
      <Lede>
        Cincinnati's vendor payments, FY 2014–present, grouped by fund. These are procurement and
        contracting dollars — the "what did the city buy?" side of the ledger.
      </Lede>

      <div className="mt-4">
        <EditorialCallout tone="warn" title="Payroll not included">
          <p>
            This dataset contains vendor and contractor payments only. Personnel costs (salaries,
            wages, benefits) — typically 60–70% of a city's operating budget — are not in this
            dataset.
          </p>
        </EditorialCallout>
      </div>

      {loading && (
        <div className="py-10 text-center text-[13px] mt-4" style={{ color: C.muted }}>
          Loading spending data from Cincinnati Open Data…
        </div>
      )}
      {error && (
        <div className="rounded-md p-4 mt-4" style={{ background: C.brickLight, border: `1px solid #e6c5b2` }}>
          <p className="text-[13px] font-semibold mb-1" style={{ color: C.brick }}>Couldn't load spending data.</p>
          <p className="text-[13px]" style={{ color: C.ink, opacity: 0.8 }}>{error}</p>
          <p className="text-[11px] mt-2" style={{ color: C.muted }}>Queries dataset <code>qmwc-pyt8</code> live.</p>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <>
          <div className="w-full mt-5" style={{ height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="year" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={fmtUSDShort} />
                <Tooltip formatter={(v: number) => fmtUSD(v)} contentStyle={{ fontSize: 12, borderColor: C.rule, borderRadius: 6 }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {SPENDING_CATEGORY_ORDER.map(cat => (
                  <Bar key={cat} dataKey={cat} stackId="spending" fill={SPENDING_CATEGORY_COLORS[cat]} name={cat} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {latestFY && (
            <BreakdownTable
              latestFY={latestFY as Record<string, number | string | undefined>}
              categories={SPENDING_CATEGORY_ORDER}
              colors={SPENDING_CATEGORY_COLORS}
              label={`Spending mix, FY ${latestFY.year} (vendor payments only)`}
            />
          )}
        </>
      )}

      <p className="text-[11px] mt-4 pt-3 leading-relaxed" style={{ borderTop: `1px solid ${C.rule}`, color: C.muted }}>
        Source: City of Cincinnati vendor payments dataset{' '}
        <a href="https://data.cincinnati-oh.gov/Growing-Economic-Opportunities/Non-negative-amount-data/qmwc-pyt8"
          target="_blank" rel="noopener noreferrer" style={{ color: C.river }}>
          qmwc-pyt8
        </a>
        {' '}on the Open Data Portal, updated weekly. Fund groupings are deterministic string-match
        categories, not official City of Cincinnati budget classifications.
      </p>
    </section>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

const TaxRevenue: React.FC = () => {
  const { language } = useLanguage()
  const [rateHistory, setRateHistory] = useState<TaxRateHistory | null>(null)
  const [itep, setItep] = useState<ITEPData | null>(null)
  const [percentiles, setPercentiles] = useState<PercentileData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/data/cincinnati_tax_rate_history.json').then(r => r.ok ? r.json() : Promise.reject(`rate ${r.status}`)),
      fetch('/data/itep_ohio_incidence.json').then(r => r.ok ? r.json() : Promise.reject(`itep ${r.status}`)),
      fetch('/data/cincinnati_income_percentiles.json').then(r => r.ok ? r.json() : Promise.reject(`pct ${r.status}`)),
    ])
      .then(([rate, it, pct]) => { setRateHistory(rate); setItep(it); setPercentiles(pct) })
      .catch(e => setLoadError(String(e)))
  }, [])

  const latestPercentileRow = percentiles?.years[percentiles.years.length - 1] ?? null

  return (
    <div className="px-8 py-2">

      {/* Spanish AI-translation disclaimer */}
      {language === 'es' && (
        <div className="mb-6 flex items-start gap-3 rounded-md p-4" style={{ background: C.brickLight, border: `1px solid #e6c5b2` }}>
          <span className="text-lg shrink-0 mt-0.5" style={{ color: C.brick }}>⚠</span>
          <div>
            <p className="text-[13px] font-semibold mb-1" style={{ color: C.brick }}>Nota sobre la traducción al español</p>
            <p className="text-[12px] leading-relaxed" style={{ color: C.ink }}>
              Las traducciones al español en este sitio fueron generadas por inteligencia artificial y aún no
              han sido revisadas por un hablante nativo.
            </p>
          </div>
        </div>
      )}

      {/* Page header */}
      <header className="page-paper rounded-md px-8 pt-8 pb-7 mb-8">
        <span className="smallcaps" style={{ color: C.muted }}>Tax &amp; Revenue</span>
        <h1
          className="serif font-medium leading-none mt-2 mb-4"
          style={{ fontSize: 'clamp(36px, 5vw, 64px)', letterSpacing: '-0.02em', color: C.ink }}
        >
          Who pays what — and what the city collects.
        </h1>
        <p className="serif leading-relaxed" style={{ fontSize: 17, color: C.ink, maxWidth: 700 }}>
          Some of these numbers are direct measurements from public data; some are modeled estimates.
          Each section is labeled so you know what you're looking at.
        </p>

        {/* Measured vs Modeled key */}
        <div className="mt-6 pt-5 grid grid-cols-1 md:grid-cols-2 gap-4" style={{ borderTop: `1px solid ${C.rule}` }}>
          <div className="flex items-start gap-3">
            <MeasuredTag />
            <span className="text-[13px] leading-relaxed" style={{ color: C.ink }}>
              Direct values from public data (rate history, city revenue, ACS percentile thresholds).
            </span>
          </div>
          <div className="flex items-start gap-3">
            <ModeledTag />
            <span className="text-[13px] leading-relaxed" style={{ color: C.ink }}>
              Estimates from a statewide model (ITEP) applied to Cincinnati incomes — not a measurement
              of any specific household.
            </span>
          </div>
        </div>
      </header>

      {loadError && (
        <div className="mb-6 rounded-md p-4" style={{ background: C.brickLight, border: `1px solid #e6c5b2` }}>
          <p className="text-[13px] font-semibold mb-1" style={{ color: C.brick }}>Couldn't load static tax data.</p>
          <p className="text-[13px] opacity-80" style={{ color: C.ink }}>{loadError}</p>
        </div>
      )}

      <RateHistorySection data={rateHistory} />
      <PercentilesSection data={percentiles} />
      <ITEPSection itep={itep} latestPercentiles={latestPercentileRow} />
      <RevenueSection />
      <SpendingSection />

      {/* What's missing */}
      <section className="rounded-md p-6 mb-8" style={{ background: C.ink, color: C.limestone }}>
        <h2
          className="serif font-medium mb-3"
          style={{ fontSize: 22, color: C.limestone }}
        >
          What this page <em>doesn't</em> show
        </h2>
        <ul className="text-[13px] space-y-2.5 leading-relaxed list-disc pl-5" style={{ color: '#c9bfb3' }}>
          <li>Federal taxes. Including federal incidence (which is progressive) would change the overall picture significantly.</li>
          <li>Property-tax burden for individual Cincinnati neighborhoods — rates vary by school district and jurisdiction inside city limits.</li>
          <li>The effect of tax abatements on what residential and commercial property owners actually pay. Cincinnati's abatement data is in the Displacement tab but not yet joined to this view.</li>
          <li>The 99th and 99.9th percentiles of Cincinnati income — not resolvable from public ACS data without microdata access.</li>
          <li>Personnel costs — payroll, salaries, and benefits make up the majority of the city's operating budget but are not in the vendor-payments dataset (Section 5).</li>
          <li>Spending by neighborhood — the City's Capital Improvement Plan Public Viewer shows where capital dollars land geographically; connecting that to resident need is a future goal.</li>
        </ul>
      </section>

      <p className="text-[11px] mb-8 leading-relaxed" style={{ color: C.muted }}>
        For the full list of data vintages, modeling assumptions, and known gaps across the site,
        see the <strong style={{ color: C.ink }}>About &amp; Limitations</strong> tab.
      </p>
    </div>
  )
}

export default TaxRevenue
