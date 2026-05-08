/**
 * TaxRevenue — Tax & Revenue tab.
 *
 * Four sections:
 *   1. Cincinnati's flat local income tax rate (policy fact)
 *   2. Cincinnati household income percentiles over time (measured, ACS B19080)
 *   3. Modeled state+local effective tax burden by income quintile (ITEP applied)
 *   4. What the city actually collects, by revenue category (live Socrata)
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

// ─── Small UI helpers ─────────────────────────────────────────────────────────

const fmtUSD = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtUSDShort = (n: number) => {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return `$${n}`
}

const Badge: React.FC<{ variant: 'measured' | 'modeled'; children: React.ReactNode }> = ({ variant, children }) => {
  const styles = variant === 'measured'
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : 'bg-amber-100 text-amber-800 border-amber-200'
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${styles}`}>
      {variant === 'measured' ? '●' : '▲'} {children}
    </span>
  )
}

const Callout: React.FC<{ tone?: 'info' | 'warn'; title: string; children: React.ReactNode }> = ({ tone = 'info', title, children }) => {
  const styles = tone === 'warn'
    ? 'bg-amber-50 border-amber-200 text-amber-900'
    : 'bg-blue-50 border-blue-200 text-blue-900'
  return (
    <div className={`border rounded-lg p-4 ${styles}`}>
      <p className="font-semibold text-sm mb-1">{title}</p>
      <div className="text-sm leading-relaxed opacity-90">{children}</div>
    </div>
  )
}

const SectionHeader: React.FC<{ eyebrow: string; title: string; blurb: string }> = ({ eyebrow, title, blurb }) => (
  <div className="mb-5">
    <p className="text-xs font-semibold text-[#1A4A6B] uppercase tracking-wider mb-1">{eyebrow}</p>
    <h2 className="text-xl font-bold text-gray-900 mb-2">{title}</h2>
    <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">{blurb}</p>
  </div>
)

// ─── Section 1: Cincinnati income tax rate history ────────────────────────────

const RateHistorySection: React.FC<{ data: TaxRateHistory | null }> = ({ data }) => {
  if (!data) return null

  const current = data.history.find(h => h.effective_to === null) || data.history[0]
  const prior = data.history.find(h => h !== current)

  return (
    <section className="mb-12 bg-white border border-gray-200 rounded-xl p-6">
      <SectionHeader
        eyebrow="Section 1 — Measured"
        title="Cincinnati's local income tax rate"
        blurb="Cincinnati charges a flat municipal income tax. Because the rate is flat, every income level pays the same percentage locally — any progressivity or regressivity in your total tax bill comes from federal, state, and sales/property taxes, not the city."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-[#1A4A6B] text-white rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-blue-200 font-semibold mb-1">Current rate</p>
          <p className="text-3xl font-bold">{current.rate_pct}%</p>
          <p className="text-xs text-blue-100 mt-1">
            Effective {current.effective_from ?? '—'}
          </p>
        </div>
        {prior && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
            <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Immediate prior rate</p>
            <p className="text-3xl font-bold text-gray-700">{prior.rate_pct}%</p>
            <p className="text-xs text-gray-500 mt-1">
              Until {prior.effective_to ?? '—'}
            </p>
          </div>
        )}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5">
          <p className="text-xs uppercase tracking-wide text-gray-500 font-semibold mb-1">Who decides</p>
          <p className="text-sm font-semibold text-gray-800">Cincinnati City Council</p>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            All 9 at-large members vote on rate changes. Some changes require a ballot measure.
          </p>
        </div>
      </div>

      <Callout tone="info" title={`Rate change: ${prior?.rate_pct}% → ${current.rate_pct}% on ${current.effective_from}`}>
        <p>
          {current.source_note}
        </p>
      </Callout>

      <div className="mt-4 text-xs text-gray-500 leading-relaxed">
        <strong>On earlier rate history:</strong> {data.source.note}
        {' '}Source:{' '}
        <a href={data.source.url} target="_blank" rel="noopener noreferrer" className="text-[#1A4A6B] hover:underline">
          {data.source.name}
        </a>
        {' '}(fetched {data.source.fetched_at}).
      </div>
    </section>
  )
}

// ─── Section 2: Income percentile thresholds over time ────────────────────────

const PERCENTILE_KEYS = ['p20', 'p40', 'p60', 'p80', 'p95'] as const
const PERCENTILE_LABELS: Record<typeof PERCENTILE_KEYS[number], string> = {
  p20: '20th pct (top of lowest 20%)',
  p40: '40th pct',
  p60: '60th pct (median-ish)',
  p80: '80th pct',
  p95: '95th pct (top 5% threshold)',
}
const PERCENTILE_COLORS: Record<typeof PERCENTILE_KEYS[number], string> = {
  p20: '#dc2626', // red
  p40: '#ea580c', // orange
  p60: '#1A4A6B', // navy
  p80: '#059669', // green
  p95: '#7c3aed', // purple
}

const PercentilesSection: React.FC<{ data: PercentileData | null }> = ({ data }) => {
  if (!data || data.years.length === 0) return null

  const chartData = data.years.map(y => ({
    year: y.year,
    p20: y.p20 ?? null,
    p40: y.p40 ?? null,
    p60: y.p60 ?? null,
    p80: y.p80 ?? null,
    p95: y.p95 ?? null,
  }))

  const latest = data.years[data.years.length - 1]
  const earliest = data.years[0]

  // Nominal change at p20 vs p95
  const p20Change = latest.p20 && earliest.p20 ? ((latest.p20 - earliest.p20) / earliest.p20) * 100 : null
  const p95Change = latest.p95 && earliest.p95 ? ((latest.p95 - earliest.p95) / earliest.p95) * 100 : null

  return (
    <section className="mb-12 bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-5">
        <div>
          <p className="text-xs font-semibold text-[#1A4A6B] uppercase tracking-wider mb-1">
            Section 2 &mdash; Measured <Badge variant="measured">ACS direct</Badge>
          </p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Cincinnati household incomes over time</h2>
          <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
            These are the household-income thresholds that mark each percentile of Cincinnati residents, from
            U.S. Census ACS 5-year estimates. In {latest.year}, a household earning{' '}
            <strong>{fmtUSD(latest.p20 ?? 0)} or less</strong> was in the lowest 20% of city incomes;
            a household earning <strong>over {fmtUSD(latest.p95 ?? 0)}</strong> was in the top 5%.
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="w-full" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="year" stroke="#6b7280" fontSize={12} />
            <YAxis stroke="#6b7280" fontSize={12} tickFormatter={fmtUSDShort} />
            <Tooltip
              formatter={(v: number) => fmtUSD(v)}
              labelFormatter={(l) => `ACS 5-year ending ${l}`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
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

      {/* Change callout */}
      {p20Change !== null && p95Change !== null && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-1">Lowest 20% nominal change</p>
            <p className="text-lg font-bold text-red-900">
              {fmtUSD(earliest.p20 ?? 0)} → {fmtUSD(latest.p20 ?? 0)}
            </p>
            <p className="text-xs text-red-800 mt-1">
              +{p20Change.toFixed(1)}% nominal over {latest.year - earliest.year} years
              &nbsp;&mdash;&nbsp; roughly tracking (or behind) inflation, depending on how you measure it.
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Top 5% threshold nominal change</p>
            <p className="text-lg font-bold text-purple-900">
              {fmtUSD(earliest.p95 ?? 0)} → {fmtUSD(latest.p95 ?? 0)}
            </p>
            <p className="text-xs text-purple-800 mt-1">
              +{p95Change.toFixed(1)}% nominal over {latest.year - earliest.year} years.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500 leading-relaxed">
        <strong>About this data:</strong> ACS 5-year estimates combine survey waves; a year of "2023" represents
        2019–2023 combined. These are <em>nominal dollars</em> &mdash; not inflation-adjusted. If p20 grew 55% and
        the CPI grew 35%, real lowest-quintile income still rose, but modestly. Interpret with care.{' '}
        <a href="https://censusreporter.org/tables/B19080/" target="_blank" rel="noopener noreferrer"
          className="text-[#1A4A6B] hover:underline">Source: ACS Table B19080</a>.
      </div>
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

  return (
    <section className="mb-12 bg-white border border-amber-200 rounded-xl p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">
            Section 3 &mdash; <Badge variant="modeled">Modeled</Badge>
          </p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Effective state + local tax rate by income group</h2>
          <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
            This is the Institute on Taxation &amp; Economic Policy&rsquo;s <em>Who Pays? 7th Edition</em> (2024)
            analysis of Ohio's state and local tax system &mdash; sales, property, and income taxes combined,
            expressed as a share of household income for each income group.
          </p>
        </div>
      </div>

      {/* Key finding callout */}
      <div className="mb-5 bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-amber-900 mb-1">Key finding</p>
        <p className="text-sm text-amber-900 leading-relaxed">{itep.key_finding}</p>
      </div>

      {/* Chart */}
      <div className="w-full" style={{ height: 320 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              stroke="#6b7280"
              fontSize={11}
              angle={-20}
              textAnchor="end"
              height={60}
              interval={0}
            />
            <YAxis
              stroke="#6b7280"
              fontSize={12}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 15]}
            />
            <Tooltip
              formatter={(v: number) => `${v.toFixed(1)}%`}
              labelFormatter={(name) => `${name}`}
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0) return null
                const row = payload[0].payload as typeof chartData[number]
                return (
                  <div className="bg-white border border-gray-200 shadow-lg rounded-lg p-3 text-xs">
                    <p className="font-bold text-gray-900 mb-1">{label}</p>
                    <p className="text-gray-600">Income range: {row.range}</p>
                    <p className="text-gray-600">Avg income: {fmtUSD(row.avg)}</p>
                    <p className="text-gray-900 font-semibold mt-1">
                      Effective state + local tax: {row.rate.toFixed(1)}%
                    </p>
                  </div>
                )
              }}
            />
            <Bar dataKey="rate" name="Effective state + local tax rate">
              {chartData.map((_, i) => {
                // Color intensity inversely correlated with rate (higher rate = redder)
                const rate = chartData[i].rate
                const color = rate >= 12 ? '#dc2626' : rate >= 10 ? '#ea580c' : rate >= 8 ? '#f59e0b' : '#1A4A6B'
                return <Cell key={i} fill={color} />
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cincinnati context */}
      {latestPercentiles && (
        <div className="mt-5 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
            Rough Cincinnati alignment ({latestPercentiles.year})
          </p>
          <p className="text-sm text-gray-700 leading-relaxed">
            Cincinnati&rsquo;s lowest 20% tops out at about <strong>{fmtUSD(latestPercentiles.p20 ?? 0)}</strong>,
            close to Ohio&rsquo;s lowest-20% bracket ({fmtUSD(itep.groups[0].income_high ?? 22500)} statewide).
            Cincinnati&rsquo;s top 5% threshold is around <strong>{fmtUSD(latestPercentiles.p95 ?? 0)}</strong>,
            placing those households in ITEP&rsquo;s &ldquo;Next 4%&rdquo; income bracket (above the $235,800 bracket cutoff).
            <em> These are Ohio-wide incidence rates applied to Cincinnati incomes &mdash; a reasonable
            estimate, not a Cincinnati-specific measurement.</em>
          </p>
        </div>
      )}

      {/* Modeling note and caveats */}
      <div className="mt-5">
        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">
          What &ldquo;Modeled&rdquo; means here
        </p>
        <p className="text-sm text-gray-700 leading-relaxed mb-3">
          {itep.modeling_note}
        </p>
        <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2">Important caveats</p>
        <ul className="text-xs text-gray-600 space-y-1.5 leading-relaxed list-disc pl-5">
          {itep.caveats.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
        Source:{' '}
        <a href={itep.source.url} target="_blank" rel="noopener noreferrer" className="text-[#1A4A6B] hover:underline">
          {itep.source.name}
        </a>
        {' '}&mdash; {itep.source.data_year_note}. If you need citable numbers for advocacy, cite ITEP directly,
        not this site.
      </div>
    </section>
  )
}

// ─── Section 4: What the city actually collects ───────────────────────────────

const CATEGORY_ORDER: RevenueCategory[] = [
  'Income Tax',
  'Property Tax',
  'Utility Charges',
  'Charges for Services',
  'Intergovernmental',
  'Licenses, Fines & Permits',
  'Investment Income',
  'Internal Transfers',
  'Other',
]

const CATEGORY_COLORS: Record<RevenueCategory, string> = {
  'Income Tax':                '#1A4A6B',
  'Property Tax':              '#059669',
  'Utility Charges':           '#0891b2',
  'Charges for Services':      '#7c3aed',
  'Intergovernmental':         '#ea580c',
  'Licenses, Fines & Permits': '#db2777',
  'Investment Income':         '#65a30d',
  'Internal Transfers':        '#9ca3af',
  'Other':                     '#6b7280',
}

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

  // Aggregate by fiscal_year × category
  const chartData = useMemo(() => {
    if (!rows) return []
    const byYear = new Map<string, Partial<Record<RevenueCategory, number>> & { year: string }>()
    for (const r of rows) {
      const cat = classifyRevenue(r.resource_name)
      const entry = byYear.get(r.fiscal_year) || { year: r.fiscal_year }
      entry[cat] = (entry[cat] || 0) + r.total
      byYear.set(r.fiscal_year, entry)
    }
    return Array.from(byYear.values())
      .sort((a, b) => a.year.localeCompare(b.year))
  }, [rows])

  // Also compute "last full FY" breakdown for a table
  const latestFY = useMemo(() => {
    if (chartData.length === 0) return null
    // Last entry may be partial current FY — take the most recent complete year heuristically:
    // "complete" meaning it's not the highest year (which may be mid-FY)
    const sorted = [...chartData].sort((a, b) => a.year.localeCompare(b.year))
    // Prefer the second-to-last if the last one has notably less total
    const last = sorted[sorted.length - 1]
    const prev = sorted[sorted.length - 2]
    const lastTotal = CATEGORY_ORDER.reduce((s, c) => s + ((last as Record<string, number | string | undefined>)[c] as number ?? 0), 0)
    const prevTotal = prev ? CATEGORY_ORDER.reduce((s, c) => s + ((prev as Record<string, number | string | undefined>)[c] as number ?? 0), 0) : 0
    const chosen = (prev && lastTotal < prevTotal * 0.6) ? prev : last
    return chosen
  }, [chartData])

  return (
    <section className="mb-12 bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-xs font-semibold text-[#1A4A6B] uppercase tracking-wider mb-1">
            Section 4 &mdash; Measured <Badge variant="measured">Live Socrata</Badge>
          </p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">What the city actually collects</h2>
          <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
            Cincinnati&rsquo;s positive revenue lines, FY 2014&ndash;present, aggregated from the city&rsquo;s open revenue
            dataset and grouped into broad categories. The current fiscal year is typically partial &mdash; don&rsquo;t
            read a drop at the far right as a real decline.
          </p>
        </div>
      </div>

      {loading && <div className="py-10 text-center text-sm text-gray-500">Loading revenue data from Cincinnati Open Data…</div>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900">
          <p className="font-semibold mb-1">Couldn&rsquo;t load revenue data.</p>
          <p className="opacity-80">{error}</p>
          <p className="mt-2 text-xs">This section queries dataset <code>a9hy-bv25</code> live. If the portal is down this section may be empty.</p>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <>
          <Callout tone="info" title="About Internal Transfers">
            <p>
              &ldquo;Internal Transfers&rdquo; is often the largest category but it represents money moving <em>within</em> city
              government, not new revenue from taxpayers. Excluding it gives a cleaner picture of external revenue sources.
              Not all city revenue is tax revenue — fees for services and utility charges are shown too.
            </p>
          </Callout>

          <div className="w-full mt-4" style={{ height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="year" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={fmtUSDShort} />
                <Tooltip formatter={(v: number) => fmtUSD(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {CATEGORY_ORDER.map(cat => (
                  <Bar key={cat} dataKey={cat} stackId="revenue" fill={CATEGORY_COLORS[cat]} name={cat} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {latestFY && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Revenue mix, FY {latestFY.year}
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Category</th>
                      <th className="text-right px-3 py-2 font-semibold">Amount</th>
                      <th className="text-right px-3 py-2 font-semibold">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(() => {
                      const total = CATEGORY_ORDER.reduce((s, c) => s + ((latestFY as Record<string, number | string | undefined>)[c] as number ?? 0), 0)
                      return CATEGORY_ORDER
                        .map(cat => ({ cat, amount: ((latestFY as Record<string, number | string | undefined>)[cat] as number) ?? 0 }))
                        .filter(r => r.amount > 0)
                        .sort((a, b) => b.amount - a.amount)
                        .map(r => (
                          <tr key={r.cat}>
                            <td className="px-3 py-2">
                              <span className="inline-block w-3 h-3 rounded-sm mr-2 align-middle" style={{ background: CATEGORY_COLORS[r.cat] }} />
                              {r.cat}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{fmtUSD(r.amount)}</td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {total > 0 ? ((r.amount / total) * 100).toFixed(1) : '—'}%
                            </td>
                          </tr>
                        ))
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Callout tone="info" title="How we categorize these lines">
            <p>
              The raw dataset has hundreds of resource_name values, one per accounting line. We group them into
              broad buckets (Income Tax, Property Tax, Utility Charges, etc.) using a deterministic string-match
              classifier in <code>src/utils/api.ts</code>. &ldquo;Internal Transfers&rdquo; is often the biggest line but it
              represents money moving <em>within</em> city government, not new revenue from taxpayers. Not all
              city revenue is tax revenue &mdash; fees for services and utility charges are shown too.
            </p>
          </Callout>
        </>
      )}

      <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
        Source: City of Cincinnati Revenue dataset{' '}
        <a href="https://data.cincinnati-oh.gov/Fiscal-Sustainability/City-of-Cincinnati-Revenue/a9hy-bv25"
          target="_blank" rel="noopener noreferrer" className="text-[#1A4A6B] hover:underline">
          a9hy-bv25
        </a>
        {' '}on the Open Data Portal, updated daily.
      </div>
    </section>
  )
}

// ─── Section 5: What the city spends ─────────────────────────────────────────

const SPENDING_CATEGORY_ORDER: SpendingCategory[] = [
  'Water & Sewer',
  'Capital Projects',
  'General Government',
  'Community Development',
  'Risk & Insurance',
  'Public Health',
  'Transit & Streets',
  'Recreation & Culture',
  'Internal Services',
  'Other',
]

const SPENDING_CATEGORY_COLORS: Record<SpendingCategory, string> = {
  'Water & Sewer':        '#0891b2',
  'Capital Projects':     '#1A4A6B',
  'General Government':   '#059669',
  'Community Development':'#ea580c',
  'Risk & Insurance':     '#9ca3af',
  'Public Health':        '#7c3aed',
  'Transit & Streets':    '#db2777',
  'Recreation & Culture': '#65a30d',
  'Internal Services':    '#f59e0b',
  'Other':                '#6b7280',
}

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
      // Drop the current partial FY if it's notably smaller than prior year
      .filter((_, i, arr) => {
        if (i !== arr.length - 1) return true
        const cur = SPENDING_CATEGORY_ORDER.reduce((s, c) => s + ((arr[i] as Record<string, number | string | undefined>)[c] as number ?? 0), 0)
        const prev = arr[i - 1] ? SPENDING_CATEGORY_ORDER.reduce((s, c) => s + ((arr[i - 1] as Record<string, number | string | undefined>)[c] as number ?? 0), 0) : cur
        return cur >= prev * 0.6
      })
  }, [rows])

  const latestFY = useMemo(() => {
    if (chartData.length === 0) return null
    return chartData[chartData.length - 1]
  }, [chartData])

  return (
    <section className="mb-12 bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <p className="text-xs font-semibold text-[#1A4A6B] uppercase tracking-wider mb-1">
            Section 5 &mdash; Measured <Badge variant="measured">Live Socrata</Badge>
          </p>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Where the city spends its money</h2>
          <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
            Cincinnati&rsquo;s vendor payments, FY 2014&ndash;present, grouped by the fund they were paid from.
            These are procurement and contracting dollars from the Cincinnati Financial System &mdash;
            the &ldquo;what did the city buy?&rdquo; side of the ledger.
          </p>
        </div>
      </div>

      <Callout tone="warn" title="Payroll not included">
        <p>
          This dataset contains vendor and contractor payments only. Personnel costs
          (salaries, wages, benefits) &mdash; typically 60&ndash;70% of a city&rsquo;s operating budget &mdash;
          are not in this dataset. These numbers show how Cincinnati spends on goods, services,
          and capital projects, not on its workforce.
        </p>
      </Callout>

      {loading && <div className="py-10 text-center text-sm text-gray-500 mt-4">Loading spending data from Cincinnati Open Data…</div>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900 mt-4">
          <p className="font-semibold mb-1">Couldn&rsquo;t load spending data.</p>
          <p className="opacity-80">{error}</p>
          <p className="mt-2 text-xs">This section queries dataset <code>qmwc-pyt8</code> live.</p>
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <>
          <div className="w-full mt-5" style={{ height: 380 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="year" stroke="#6b7280" fontSize={12} />
                <YAxis stroke="#6b7280" fontSize={12} tickFormatter={fmtUSDShort} />
                <Tooltip formatter={(v: number) => fmtUSD(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {SPENDING_CATEGORY_ORDER.map(cat => (
                  <Bar key={cat} dataKey={cat} stackId="spending" fill={SPENDING_CATEGORY_COLORS[cat]} name={cat} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {latestFY && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Spending mix, FY {latestFY.year} (vendor payments)
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold">Category</th>
                      <th className="text-right px-3 py-2 font-semibold">Amount</th>
                      <th className="text-right px-3 py-2 font-semibold">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(() => {
                      const total = SPENDING_CATEGORY_ORDER.reduce((s, c) => s + ((latestFY as Record<string, number | string | undefined>)[c] as number ?? 0), 0)
                      return SPENDING_CATEGORY_ORDER
                        .map(cat => ({ cat, amount: ((latestFY as Record<string, number | string | undefined>)[cat] as number) ?? 0 }))
                        .filter(r => r.amount > 0)
                        .sort((a, b) => b.amount - a.amount)
                        .map(r => (
                          <tr key={r.cat}>
                            <td className="px-3 py-2">
                              <span className="inline-block w-3 h-3 rounded-sm mr-2 align-middle" style={{ background: SPENDING_CATEGORY_COLORS[r.cat] }} />
                              {r.cat}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{fmtUSD(r.amount)}</td>
                            <td className="px-3 py-2 text-right text-gray-600">
                              {total > 0 ? ((r.amount / total) * 100).toFixed(1) : '—'}%
                            </td>
                          </tr>
                        ))
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 leading-relaxed">
        Source: City of Cincinnati vendor payments dataset{' '}
        <a href="https://data.cincinnati-oh.gov/Growing-Economic-Opportunities/Non-negative-amount-data/qmwc-pyt8"
          target="_blank" rel="noopener noreferrer" className="text-[#1A4A6B] hover:underline">
          qmwc-pyt8
        </a>
        {' '}on the Open Data Portal, updated weekly. Fund groupings are deterministic
        string-match categories, not official City of Cincinnati budget classifications.
      </div>
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
      .then(([rate, it, pct]) => {
        setRateHistory(rate)
        setItep(it)
        setPercentiles(pct)
      })
      .catch(e => setLoadError(String(e)))
  }, [])

  const latestPercentileRow = percentiles?.years[percentiles.years.length - 1] ?? null

  return (
    <div className="max-w-5xl mx-auto">

      {/* Spanish AI-translation disclaimer */}
      {language === 'es' && (
        <div className="mb-6 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <span className="text-amber-500 text-lg shrink-0 mt-0.5">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-amber-800 mb-1">Nota sobre la traducción al español</p>
            <p className="text-xs text-amber-700 leading-relaxed">
              Las traducciones al español en este sitio fueron generadas por inteligencia artificial y aún no
              han sido revisadas por un hablante nativo.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Tax &amp; Revenue</h1>
        <p className="text-gray-600 max-w-3xl leading-relaxed">
          Who pays what in Cincinnati &mdash; and what the city actually collects. Some of these numbers are
          direct measurements from public data; some are modeled estimates. Each section is labeled so you
          know what you&rsquo;re looking at.
        </p>
      </div>

      {/* Reader orientation banner */}
      <div className="mb-8 bg-gray-50 border border-gray-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-800 mb-3">Two kinds of number on this page</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-start gap-3">
            <Badge variant="measured">Measured</Badge>
            <span className="text-gray-700 leading-relaxed">
              Direct values from public data (rate history, city revenue, ACS percentile thresholds).
            </span>
          </div>
          <div className="flex items-start gap-3">
            <Badge variant="modeled">Modeled</Badge>
            <span className="text-gray-700 leading-relaxed">
              Estimates derived from a statewide model (ITEP) applied to Cincinnati incomes &mdash; not a
              measurement of any specific household.
            </span>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-3 leading-relaxed">
          For the full methodology and caveats, see the{' '}
          <strong>About &amp; Limitations</strong> tab (Tax burden modeling section).
        </p>
      </div>

      {loadError && (
        <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-900">
          <p className="font-semibold mb-1">Couldn&rsquo;t load static tax data.</p>
          <p className="opacity-80">{loadError}</p>
        </div>
      )}

      <RateHistorySection data={rateHistory} />
      <PercentilesSection data={percentiles} />
      <ITEPSection itep={itep} latestPercentiles={latestPercentileRow} />
      <RevenueSection />
      <SpendingSection />

      {/* What's missing */}
      <section className="mb-8 bg-gray-900 text-white rounded-xl p-6">
        <h2 className="text-lg font-bold mb-2">What this page <em>doesn&rsquo;t</em> show</h2>
        <ul className="text-sm text-gray-300 space-y-2 leading-relaxed list-disc pl-5">
          <li>Federal taxes. Including federal incidence (which is progressive) would change the overall picture.</li>
          <li>Property-tax burden for individual Cincinnati neighborhoods &mdash; property tax rates vary by school district and jurisdiction inside city limits.</li>
          <li>The effect of tax abatements on what residential and commercial property owners actually pay. Cincinnati&rsquo;s abatement data is in the Displacement tab but not yet joined to this view.</li>
          <li>The 99th and 99.9th percentiles of Cincinnati income &mdash; not resolvable from public data without microdata access.</li>
          <li>Personnel costs &mdash; payroll, salaries, and benefits make up the majority of the city&rsquo;s operating budget but are not in the vendor-payments dataset (Section 5).</li>
          <li>Spending by neighborhood &mdash; the City&rsquo;s Capital Improvement Plan Public Viewer shows where capital dollars land geographically; connecting that to resident need is a future goal.</li>
        </ul>
      </section>

      <p className="text-xs text-gray-500 mb-8">
        For the full list of data vintages, modeling assumptions, and known gaps across the site,
        see the <strong>About &amp; Limitations</strong> tab.
      </p>
    </div>
  )
}

export default TaxRevenue
