import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchSODA, fetchNeighborhoodCensusStats, normalizeNeighborhoodName, stripNeighborhoodName } from '../../utils/api'
import { normalize } from '../../utils/scoring'
import OwnerActivity from '../OwnerActivity'
import ConnectedCommunitiesSection from './ConnectedCommunitiesSection'
import CivicOrgsPanel from '../../components/ui/CivicOrgsPanel'
import type { CivicOrgCategory } from '../../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SNA_GEOJSON_URL =
  'https://opendata.arcgis.com/datasets/572561553c9e4d618d2d7939c5261d46_0.geojson'

const CENSUS_KEY_OVERRIDE: Record<string, string> = {
  'CBD / Riverfront':  'downtown',
  'Clifton Heights':   'cuf',
  'Fairview':          'cuf',
  'Fay Apartments':    'wesend',
  "O'Bryonville":      'hydeparkobryonville',
  'Queensgate':        'lowerpricehillqueensgate',
  'Sedamsville':       'riversidesedamsville',
  'English Woods':     'englishwoodsnorthfairmount',
  'Lower Price Hill':  'lowerpricehillqueensgate',
  'Millvale':          'millvale',
}

// ─── Phase synthesis config ────────────────────────────────────────────────────
// For each phase: plain-English interpretation + recommended action + which
// org categories to surface. This is the "information to action" translation layer.

interface PhaseSynthesis {
  headline: string
  interpretation: string
  action: string
  orgCategories: CivicOrgCategory[]
  bgColor: string
  borderColor: string
  textColor: string
}

const PHASE_SYNTHESIS: Record<'active' | 'vulnerable' | 'gentrifying' | 'stable' | 'insufficient', PhaseSynthesis> = {
  active: {
    headline: 'High displacement risk — vulnerability and pressure both above city median',
    interpretation:
      'Renter vulnerability is above the city median and development pressure is above the city median. This combination places residents at elevated risk of being priced out. Incomes are low relative to rents, and significant construction activity is transforming the market. This is a relative score — it identifies neighborhoods at higher risk than most of Cincinnati, not an official determination that displacement has occurred.',
    action:
      'If you live here, act now: document everything, get legal help early (before receiving an eviction notice), and connect with organizing groups that are fighting displacement in this neighborhood.',
    orgCategories: ['housing-eviction'],
    bgColor: 'bg-red-50', borderColor: 'border-red-200', textColor: 'text-red-900',
  },
  vulnerable: {
    headline: 'Neighborhood is vulnerable — development pressure could arrive soon',
    interpretation:
      'Residents here face economic vulnerability (high rent burden, lower incomes) but major development pressure hasn\'t fully arrived yet. Historically, vulnerable neighborhoods become targets once adjacent areas are "developed." The window to organize is now.',
    action:
      'Connect with housing and community development organizations before pressure accelerates. Building a stabilization strategy now — community land trusts, tenant organizing, zoning engagement — is far more effective than reacting after displacement begins.',
    orgCategories: ['housing-eviction', 'economic-development'],
    bgColor: 'bg-orange-50', borderColor: 'border-orange-200', textColor: 'text-orange-900',
  },
  gentrifying: {
    headline: 'Development pressure is arriving — resident protection is the question',
    interpretation:
      'Strong construction activity and investment is coming in, but residents aren\'t automatically protected from rising rents and displacement. This is early-stage gentrification: if incomes don\'t rise alongside rents, longtime residents get pushed out.',
    action:
      'Engage the public process: attend Planning Commission hearings before major projects are approved, comment on zoning changes, and ask developers what\'s in it for current residents. Check the "Zoning Reform" tab to see how Connected Communities is playing out here.',
    orgCategories: ['housing-eviction', 'civic-engagement'],
    bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', textColor: 'text-yellow-900',
  },
  stable: {
    headline: 'Currently stable',
    interpretation:
      'Neither high vulnerability nor strong development pressure at the moment. Stability isn\'t permanent — conditions change, and the neighborhoods that are stable today are often the ones surprised by rapid change tomorrow.',
    action:
      'Stay engaged with your neighborhood\'s civic process. Attending Planning Commission meetings before large projects are approved is the lowest-cost way to protect stability.',
    orgCategories: ['civic-engagement'],
    bgColor: 'bg-green-50', borderColor: 'border-green-200', textColor: 'text-green-900',
  },
  insufficient: {
    headline: 'Not enough data to classify',
    interpretation:
      'We couldn\'t find sufficient data to reliably score this neighborhood across all four dimensions. This may reflect a smaller population, fewer reported permits, or gaps in available public data.',
    action:
      'Your neighborhood community council may have local context not captured in city data. You can also check the Neighborhood Profiles tab for whatever data is available.',
    orgCategories: ['civic-engagement'],
    bgColor: 'bg-gray-50', borderColor: 'border-gray-200', textColor: 'text-gray-700',
  },
}

// ─── Types ────────────────────────────────────────────────────────────────────

type DisplacementPhase = 'active' | 'vulnerable' | 'gentrifying' | 'stable' | 'insufficient'
type FilterPhase = 'all' | DisplacementPhase

interface DisplacementRecord {
  name: string
  vulnerability: number | null
  pressure: number | null
  phase: DisplacementPhase
  rentBurdenRate: number | null
  medianIncome: number | null
  permitYoY: number | null
  recentPermitCount: number | null
  abatementCount: number
  plapCount: number
  unitLossCount: number
}

interface PermitCountRow { neighborhood: string; count: string }
interface AbatementCountRow { ccd_neigh: string; count: string }
interface PLAPCountRow { neighborhood: string; count: string }

interface AbatementDetail {
  address: string
  type?: string
  abatement_value?: string
}

interface PLAPDetail {
  address: string
  date?: string
}

interface CrossRefRow {
  address: string
  abatementType: string
  plapCount: number
  hasViolations: boolean
}

interface UnitActivityRow {
  neighborhood: string
  address: string
  units_added: string
  units_removed: string
  title?: string
  permit_description?: string
  issued_date?: string
}

interface CRARow {
  organization_legal_name?: string
  project_name?: string
  community_council_neighborhood?: string
  est_program_total_value?: string
  program_type?: string
  approved_by_city_council?: string
}

interface DemolitionRow {
  full_address?: string
  data_status_display?: string
  entered_date?: string
  sub_type_desc?: string
  data_status?: string
  neighborhood?: string
}

interface CRALeaderboardEntry {
  name: string
  total: number
  projectCount: number
  neighborhoods: string
}

// ─── Phase helpers ─────────────────────────────────────────────────────────────

function getPhase(vulnerability: number | null, pressure: number | null): DisplacementPhase {
  if (vulnerability === null || pressure === null) return 'insufficient'
  const highVuln = vulnerability > 50
  const highPressure = pressure > 50
  if (highVuln && highPressure) return 'active'
  if (highVuln && !highPressure) return 'vulnerable'
  if (!highVuln && highPressure) return 'gentrifying'
  return 'stable'
}

const PHASE_CONFIG: Record<DisplacementPhase, { label: string; color: string; bg: string; border: string; dot: string }> = {
  active:       { label: 'Active Displacement Zone', color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    dot: 'bg-red-500'    },
  vulnerable:   { label: 'Vulnerable / At Risk',     color: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', dot: 'bg-orange-500' },
  gentrifying:  { label: 'Development Pressure',     color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  stable:       { label: 'Stable',                   color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200',  dot: 'bg-green-500'  },
  insufficient: { label: 'Insufficient Data',        color: 'text-gray-600',   bg: 'bg-gray-50',   border: 'border-gray-200',   dot: 'bg-gray-400'   },
}

const PHASE_DOT_SVG: Record<DisplacementPhase, string> = {
  active:       '#ef4444',
  vulnerable:   '#f97316',
  gentrifying:  '#eab308',
  stable:       '#22c55e',
  insufficient: '#9ca3af',
}

// ─── Address normalizer ────────────────────────────────────────────────────────

function normalizeAddress(addr: string): string {
  return addr
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function addressesMatch(abatAddr: string, plapAddr: string): boolean {
  const a = normalizeAddress(abatAddr)
  const b = normalizeAddress(plapAddr)
  const aPrefix = a.slice(0, 15)
  const bPrefix = b.slice(0, 15)
  return a.includes(bPrefix) || b.includes(aPrefix) || aPrefix === bPrefix
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const PhaseBadge: React.FC<{ phase: DisplacementPhase }> = ({ phase }) => {
  const cfg = PHASE_CONFIG[phase]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

const MiniBar: React.FC<{ value: number | null; colorClass: string; label: string }> = ({ value, colorClass, label }) => (
  <div className="mb-1">
    <div className="flex justify-between items-center mb-0.5">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-xs font-medium text-gray-700">{value !== null ? `${value}` : 'N/A'}</span>
    </div>
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full ${colorClass}`}
        style={{ width: value !== null ? `${value}%` : '0%' }}
      />
    </div>
  </div>
)

// ─── Quadrant Plot ─────────────────────────────────────────────────────────────

const QuadrantPlot: React.FC<{ record: DisplacementRecord }> = ({ record }) => {
  const W = 300
  const H = 250
  const PAD = { top: 20, right: 20, bottom: 40, left: 45 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom

  const toX = (v: number) => PAD.left + (v / 100) * plotW
  const toY = (v: number) => PAD.top + ((100 - v) / 100) * plotH

  const dotX = record.pressure !== null ? toX(record.pressure) : null
  const dotY = record.vulnerability !== null ? toY(record.vulnerability) : null

  const midX = PAD.left + plotW / 2
  const midY = PAD.top + plotH / 2

  return (
    <svg width={W} height={H} className="overflow-visible">
      {/* Quadrant fills */}
      <rect x={PAD.left} y={PAD.top} width={plotW / 2} height={plotH / 2} fill="#fef2f2" opacity={0.6} />
      <rect x={midX} y={PAD.top} width={plotW / 2} height={plotH / 2} fill="#fefce8" opacity={0.6} />
      <rect x={PAD.left} y={midY} width={plotW / 2} height={plotH / 2} fill="#f0fdf4" opacity={0.6} />
      <rect x={midX} y={midY} width={plotW / 2} height={plotH / 2} fill="#fffbeb" opacity={0.6} />

      {/* Grid lines */}
      <line x1={PAD.left} y1={midY} x2={PAD.left + plotW} y2={midY} stroke="#d1d5db" strokeWidth={1} strokeDasharray="4 3" />
      <line x1={midX} y1={PAD.top} x2={midX} y2={PAD.top + plotH} stroke="#d1d5db" strokeWidth={1} strokeDasharray="4 3" />

      {/* Border */}
      <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="none" stroke="#e5e7eb" strokeWidth={1} />

      {/* Quadrant labels */}
      <text x={PAD.left + 6} y={PAD.top + 14} fontSize={9} fill="#b91c1c" fontWeight="600">Active</text>
      <text x={PAD.left + 6} y={PAD.top + 24} fontSize={9} fill="#b91c1c" fontWeight="600">Displacement</text>

      <text x={midX + 6} y={PAD.top + 14} fontSize={9} fill="#a16207" fontWeight="600">Development</text>
      <text x={midX + 6} y={PAD.top + 24} fontSize={9} fill="#a16207" fontWeight="600">Pressure</text>

      <text x={PAD.left + 6} y={midY + plotH / 2 - 10} fontSize={9} fill="#15803d" fontWeight="600">Stable</text>

      <text x={midX + 6} y={midY + plotH / 2 - 10} fontSize={9} fill="#c2410c" fontWeight="600">Vulnerable</text>
      <text x={midX + 6} y={midY + plotH / 2} fontSize={9} fill="#c2410c" fontWeight="600">/ At Risk</text>

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke="#6b7280" strokeWidth={1.5} />
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke="#6b7280" strokeWidth={1.5} />

      {/* Axis labels */}
      <text x={PAD.left + plotW / 2} y={H - 4} fontSize={10} fill="#374151" textAnchor="middle">Market Pressure →</text>
      <text
        x={12}
        y={PAD.top + plotH / 2}
        fontSize={10}
        fill="#374151"
        textAnchor="middle"
        transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}
      >
        Vulnerability →
      </text>

      {/* Tick marks */}
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={toX(v)} y1={PAD.top + plotH} x2={toX(v)} y2={PAD.top + plotH + 4} stroke="#9ca3af" strokeWidth={1} />
          <text x={toX(v)} y={PAD.top + plotH + 13} fontSize={8} fill="#9ca3af" textAnchor="middle">{v}</text>
          <line x1={PAD.left - 4} y1={toY(v)} x2={PAD.left} y2={toY(v)} stroke="#9ca3af" strokeWidth={1} />
          <text x={PAD.left - 6} y={toY(v) + 3} fontSize={8} fill="#9ca3af" textAnchor="end">{v}</text>
        </g>
      ))}

      {/* Dot */}
      {dotX !== null && dotY !== null && (
        <g>
          <circle cx={dotX} cy={dotY} r={8} fill={PHASE_DOT_SVG[record.phase]} opacity={0.2} />
          <circle cx={dotX} cy={dotY} r={5} fill={PHASE_DOT_SVG[record.phase]} stroke="white" strokeWidth={1.5} />
        </g>
      )}

      {dotX === null && dotY === null && (
        <text x={PAD.left + plotW / 2} y={PAD.top + plotH / 2} fontSize={11} fill="#9ca3af" textAnchor="middle">
          Insufficient data to plot
        </text>
      )}
    </svg>
  )
}

// ─── Methodology info panel ────────────────────────────────────────────────────

const MethodologyNote: React.FC = () => {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-3xl">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-amber-800 leading-relaxed">
          <span className="font-semibold">Methodology: </span>
          Inspired by the Anti-Eviction Mapping Project and NYC Displacement Alert Project
          frameworks, adapted to Cincinnati open data. This is a simplified model — it uses
          fewer dimensions than those full methodologies (which add race, tenure, education,
          and language isolation). Combines housing vulnerability (who is at risk) with
          market pressure (what forces are acting) using only publicly available local data.
          Neighborhoods scoring above the city midpoint on BOTH axes need the most urgent attention.
        </p>
        <button
          onClick={() => setOpen(v => !v)}
          aria-label="Show calculation details"
          title="How are these scores calculated?"
          className="shrink-0 w-6 h-6 rounded-full border border-amber-400 text-amber-700 text-xs font-bold flex items-center justify-center hover:bg-amber-100 transition-colors"
        >
          i
        </button>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-amber-200 space-y-4 text-xs text-amber-900">
          <div>
            <p className="font-semibold mb-1">Vulnerability score (0–100) — who is at risk</p>
            <p className="mb-1">Average of two components, each min-max normalized across all ~52 Cincinnati neighborhoods (0 = city minimum, 100 = city maximum):</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li><strong>Rent burden rate</strong> — % of renters paying &gt;30% of income on rent (ACS Census). Higher burden → higher score.</li>
              <li><strong>Median household income</strong> — ACS Census. Lower income → higher score (inverted).</li>
            </ul>
            <p className="mt-1 text-amber-700 italic">Limitation: scores are relative to other Cincinnati neighborhoods, not absolute national thresholds. A "stable" neighborhood may still have objectively high rent burden.</p>
          </div>
          <div>
            <p className="font-semibold mb-1">Pressure score (0–100) — what forces are acting</p>
            <p className="mb-1">Average of three components, same normalization:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li><strong>Permit year-over-year % change</strong> — building permits (last 3 years vs. prior 3 years, measured as a rolling window from today — scores shift gradually over time). Higher growth → higher score.</li>
              <li><strong>Tax abatement count</strong> — commercial CRA subsidies (tax abatements, TIF, LEED credits, below-market land sales). More city-backed investment → higher score.</li>
              <li><strong>Housing unit removal count</strong> — units removed via building permits. More demolitions/removals → higher score.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-1">Phase classification</p>
            <p>Each score above 50 means "above the city midpoint" — not an absolute threshold. Four phases result from the two binary splits:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1 mt-1">
              <li><strong>Active Displacement Zone</strong>: Vulnerability &gt; 50 and Pressure &gt; 50</li>
              <li><strong>Vulnerable / At Risk</strong>: Vulnerability &gt; 50, Pressure ≤ 50</li>
              <li><strong>Development Pressure</strong>: Vulnerability ≤ 50, Pressure &gt; 50</li>
              <li><strong>Stable</strong>: Both ≤ 50</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

const DisplacementTab: React.FC = () => {
  const [activeSection, setActiveSection] = useState<'displacement' | 'owner' | 'zoning'>('displacement')

  // ── Data state ──────────────────────────────────────────────────────────────
  const [snaNames, setSnaNames] = useState<string[]>([])
  const [censusMap, setCensusMap] = useState<Map<string, { medianHouseholdIncome: number | null; rentBurdenRate: number | null }> | null>(null)
  const [recentPermits, setRecentPermits] = useState<PermitCountRow[] | null>(null)
  const [priorPermits, setPriorPermits] = useState<PermitCountRow[] | null>(null)
  const [abatementCounts, setAbatementCounts] = useState<AbatementCountRow[] | null>(null)
  const [plapCounts, setPlapCounts] = useState<PLAPCountRow[] | null>(null)
  const [unitActivityData, setUnitActivityData] = useState<UnitActivityRow[] | null>(null)
  const [craAllData, setCraAllData] = useState<CRARow[] | null>(null)

  // ── Loading / error flags ────────────────────────────────────────────────────
  const [loadingSNA, setLoadingSNA] = useState(true)
  const [loadingCensus, setLoadingCensus] = useState(true)
  const [loadingPermits, setLoadingPermits] = useState(true)
  const [loadingAbatements, setLoadingAbatements] = useState(true)
  const [loadingPLAP, setLoadingPLAP] = useState(true)
  const [loadingUnits, setLoadingUnits] = useState(true)
  const [loadingCRA, setLoadingCRA] = useState(true)

  const [errorSNA, setErrorSNA] = useState<string | null>(null)
  const [errorCensus, setErrorCensus] = useState<string | null>(null)
  const [errorPermits, setErrorPermits] = useState<string | null>(null)
  const [errorAbatements, setErrorAbatements] = useState<string | null>(null)
  const [errorPLAP, setErrorPLAP] = useState<string | null>(null)
  const [errorUnits, setErrorUnits] = useState<string | null>(null)
  const [errorCRA, setErrorCRA] = useState<string | null>(null)

  // ── UI state ────────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterPhase>('all')

  // ── Detail data for selected neighborhood ───────────────────────────────────
  const [detailAbatements, setDetailAbatements] = useState<AbatementDetail[]>([])
  const [detailPLAP, setDetailPLAP] = useState<PLAPDetail[]>([])
  const [detailDemolitions, setDetailDemolitions] = useState<DemolitionRow[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)

  // ── Date helpers ─────────────────────────────────────────────────────────────
  const now = new Date()
  const yr3ago = new Date(now.getFullYear() - 3, now.getMonth(), now.getDate()).toISOString().slice(0, 10)
  const yr6ago = new Date(now.getFullYear() - 6, now.getMonth(), now.getDate()).toISOString().slice(0, 10)

  // ─── Fetch SNA names ────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingSNA(true)
    fetch(SNA_GEOJSON_URL)
      .then(r => {
        if (!r.ok) throw new Error(`SNA GeoJSON HTTP ${r.status}`)
        return r.json()
      })
      .then((geo: { features: Array<{ properties: Record<string, string> }> }) => {
        const names: string[] = []
        for (const f of geo.features) {
          const name = f.properties?.SNA_NAME
          if (name && !names.includes(name)) names.push(name)
        }
        setSnaNames(names.sort())
      })
      .catch(e => setErrorSNA(String(e)))
      .finally(() => setLoadingSNA(false))
  }, [])

  // ─── Fetch Census ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingCensus(true)
    fetchNeighborhoodCensusStats()
      .then(map => {
        const out = new Map<string, { medianHouseholdIncome: number | null; rentBurdenRate: number | null }>()
        map.forEach((v, k) => {
          out.set(k, { medianHouseholdIncome: v.medianHouseholdIncome, rentBurdenRate: v.rentBurdenRate })
        })
        setCensusMap(out)
      })
      .catch(e => setErrorCensus(String(e)))
      .finally(() => setLoadingCensus(false))
  }, [])

  // ─── Fetch Permits (recent + prior, in parallel) ─────────────────────────────
  useEffect(() => {
    setLoadingPermits(true)
    Promise.all([
      fetchSODA<PermitCountRow>('uhjb-xac9', {
        $select: 'neighborhood,count(*) as count',
        $where: `applieddate >= '${yr3ago}'`,
        $group: 'neighborhood',
        $limit: 100,
      }),
      fetchSODA<PermitCountRow>('uhjb-xac9', {
        $select: 'neighborhood,count(*) as count',
        $where: `applieddate >= '${yr6ago}' AND applieddate < '${yr3ago}'`,
        $group: 'neighborhood',
        $limit: 100,
      }),
    ])
      .then(([recent, prior]) => {
        setRecentPermits(recent.data)
        setPriorPermits(prior.data)
      })
      .catch(e => setErrorPermits(String(e)))
      .finally(() => setLoadingPermits(false))
  }, [yr3ago, yr6ago])

  // ─── Fetch Tax Abatements bulk ───────────────────────────────────────────────
  useEffect(() => {
    setLoadingAbatements(true)
    fetchSODA<AbatementCountRow>('tkp7-yf64', {
      $select: 'ccd_neigh,count(*) as count',
      $group: 'ccd_neigh',
      $limit: 200,
    })
      .then(r => setAbatementCounts(r.data))
      .catch(e => setErrorAbatements(String(e)))
      .finally(() => setLoadingAbatements(false))
  }, [])

  // ─── Fetch PLAP bulk ─────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingPLAP(true)
    fetchSODA<PLAPCountRow>('pk9w-99n6', {
      $select: 'neighborhood,count(*) as count',
      $group: 'neighborhood',
      $limit: 200,
    })
      .then(r => setPlapCounts(r.data))
      .catch(e => setErrorPLAP(String(e)))
      .finally(() => setLoadingPLAP(false))
  }, [])

  // ─── Fetch Housing Unit Activity ─────────────────────────────────────────────
  useEffect(() => {
    setLoadingUnits(true)
    fetchSODA<UnitActivityRow>('xedz-tk7q', {
      $where: "units_removed != '0'",
      $select: 'neighborhood,address,units_added,units_removed,title,permit_description,issued_date',
      $limit: 5000,
    })
      .then(r => setUnitActivityData(r.data))
      .catch(e => setErrorUnits(String(e)))
      .finally(() => setLoadingUnits(false))
  }, [])

  // ─── Fetch Commercial CRA Abatements ─────────────────────────────────────────
  useEffect(() => {
    setLoadingCRA(true)
    fetchSODA<CRARow>('m76i-p5p9', {
      $select: 'organization_legal_name,project_name,community_council_neighborhood,est_program_total_value,program_type,approved_by_city_council',
      $limit: 1000,
    })
      .then(r => setCraAllData(r.data))
      .catch(e => setErrorCRA(String(e)))
      .finally(() => setLoadingCRA(false))
  }, [])

  // ─── Fetch detail data for selected neighborhood ─────────────────────────────
  const fetchDetailData = useCallback(async (name: string) => {
    setLoadingDetail(true)
    setDetailAbatements([])
    setDetailPLAP([])
    setDetailDemolitions([])
    try {
      const [abatRes, plapRes, demolRes] = await Promise.all([
        fetchSODA<AbatementDetail>('tkp7-yf64', {
          $where: `ccd_neigh='${name.replace(/'/g, "''")}'`,
          $select: 'address,type,abatement_value',
          $limit: 200,
        }),
        fetchSODA<PLAPDetail>('pk9w-99n6', {
          $where: `upper(neighborhood)='${name.toUpperCase().replace(/'/g, "''")}'`,
          $select: 'address,date',
          $limit: 500,
        }),
        fetchSODA<DemolitionRow>('cncm-znd6', {
          $where: `comp_type_desc='Code Enforcement - Demolitions' AND upper(neighborhood)='${name.toUpperCase().replace(/'/g, "''")}'`,
          $select: 'full_address,data_status_display,entered_date,sub_type_desc,data_status',
          $limit: 100,
        }),
      ])
      setDetailAbatements(abatRes.data)
      setDetailPLAP(plapRes.data)
      setDetailDemolitions(demolRes.data)
    } catch {
      // fail silently — keep empty arrays
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    if (selected) {
      fetchDetailData(selected)
    }
  }, [selected, fetchDetailData])

  // ─── Build permit YoY map ────────────────────────────────────────────────────
  const permitYoYMap = useMemo(() => {
    if (!recentPermits || !priorPermits) return null
    const recentMap = new Map<string, number>()
    for (const r of recentPermits) {
      const key = normalizeNeighborhoodName(r.neighborhood)
      recentMap.set(key, parseInt(r.count, 10) || 0)
    }
    const priorMap = new Map<string, number>()
    for (const r of priorPermits) {
      const key = normalizeNeighborhoodName(r.neighborhood)
      priorMap.set(key, parseInt(r.count, 10) || 0)
    }
    const allKeys = new Set([...recentMap.keys(), ...priorMap.keys()])
    const out = new Map<string, { yoy: number; recent: number }>()
    for (const key of allKeys) {
      const rec = recentMap.get(key) ?? 0
      const pri = priorMap.get(key) ?? 0
      const yoy = ((rec - pri) / Math.max(pri, 1)) * 100
      out.set(key, { yoy, recent: rec })
    }
    return out
  }, [recentPermits, priorPermits])

  // ─── Build abatement map ─────────────────────────────────────────────────────
  const abatementMap = useMemo(() => {
    if (!abatementCounts) return null
    const out = new Map<string, number>()
    for (const r of abatementCounts) {
      if (r.ccd_neigh) out.set(r.ccd_neigh, parseInt(r.count, 10) || 0)
    }
    return out
  }, [abatementCounts])

  // ─── Build PLAP map ──────────────────────────────────────────────────────────
  const plapMap = useMemo(() => {
    if (!plapCounts) return null
    const out = new Map<string, number>()
    for (const r of plapCounts) {
      if (r.neighborhood) {
        const key = normalizeNeighborhoodName(r.neighborhood)
        out.set(key, (out.get(key) ?? 0) + (parseInt(r.count, 10) || 0))
      }
    }
    return out
  }, [plapCounts])

  // ─── Build unit loss map ──────────────────────────────────────────────────────
  const unitLossMap = useMemo(() => {
    if (!unitActivityData) return null
    const out = new Map<string, number>()
    for (const r of unitActivityData) {
      if (!r.neighborhood || r.neighborhood === 'N/A') continue
      const key = normalizeNeighborhoodName(r.neighborhood)
      const lost = parseInt(r.units_removed, 10) || 0
      out.set(key, (out.get(key) ?? 0) + lost)
    }
    return out
  }, [unitActivityData])

  // ─── CRA leaderboard (city-wide) ─────────────────────────────────────────────
  const craLeaderboard = useMemo((): CRALeaderboardEntry[] => {
    if (!craAllData) return []
    const byDev = new Map<string, { total: number; projects: Set<string>; neighborhoods: Set<string> }>()
    for (const r of craAllData) {
      if (!r.organization_legal_name) continue
      const dev = r.organization_legal_name.trim()
      if (!dev) continue
      if (!byDev.has(dev)) byDev.set(dev, { total: 0, projects: new Set(), neighborhoods: new Set() })
      const entry = byDev.get(dev)!
      entry.total += parseFloat(r.est_program_total_value || '0') || 0
      if (r.project_name) entry.projects.add(r.project_name)
      const nbhd = r.community_council_neighborhood
      if (nbhd && nbhd !== 'N/A') entry.neighborhoods.add(nbhd)
    }
    return [...byDev.entries()]
      .map(([name, data]) => ({
        name,
        total: data.total,
        projectCount: data.projects.size,
        neighborhoods: [...data.neighborhoods].sort().join(', '),
      }))
      .filter(r => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 25)
  }, [craAllData])

  // ─── CRA per neighborhood map ────────────────────────────────────────────────
  const craNeighborhoodMap = useMemo(() => {
    if (!craAllData) return null
    const out = new Map<string, number>()
    for (const r of craAllData) {
      const nbhd = r.community_council_neighborhood
      if (!nbhd || nbhd === 'N/A') continue
      const val = parseFloat(r.est_program_total_value || '0') || 0
      out.set(nbhd, (out.get(nbhd) ?? 0) + val)
    }
    return out
  }, [craAllData])

  // ─── Compute displacement records ────────────────────────────────────────────
  const records: DisplacementRecord[] = useMemo(() => {
    if (!snaNames.length || !censusMap || !permitYoYMap || !abatementMap || !plapMap) return []

    return snaNames.map(name => {
      const censusKey = CENSUS_KEY_OVERRIDE[name] ?? stripNeighborhoodName(name)
      const census = censusMap.get(censusKey)
      const rentBurdenRate = census?.rentBurdenRate ?? null
      const medianIncome = census?.medianHouseholdIncome ?? null

      const titleName = normalizeNeighborhoodName(name)
      const permitData = permitYoYMap.get(titleName) ?? null
      const permitYoY = permitData?.yoy ?? null
      const recentPermitCount = permitData?.recent ?? null

      const abatementCount = abatementMap.get(name) ?? 0
      const plapCount = plapMap.get(titleName) ?? 0
      const unitLossCount = unitLossMap ? (unitLossMap.get(titleName) ?? 0) : 0

      return {
        name,
        vulnerability: null,
        pressure: null,
        phase: 'insufficient' as DisplacementPhase,
        rentBurdenRate,
        medianIncome,
        permitYoY,
        recentPermitCount,
        abatementCount,
        plapCount,
        unitLossCount,
      }
    })
  }, [snaNames, censusMap, permitYoYMap, abatementMap, plapMap, unitLossMap])

  // ─── Score normalization ──────────────────────────────────────────────────────
  const scoredRecords: DisplacementRecord[] = useMemo(() => {
    if (!records.length) return []

    const allRentBurden = records.map(r => r.rentBurdenRate ?? undefined)
    const allIncome = records.map(r => r.medianIncome ?? undefined)
    const allPermitYoY = records.map(r => r.permitYoY ?? undefined)
    const allAbatement = records.map(r => r.abatementCount as number | undefined)
    const allUnitLoss = records.map(r => r.unitLossCount as number | undefined)

    return records.map(r => {
      // Vulnerability
      const vulnRentBurden = normalize(r.rentBurdenRate ?? undefined, allRentBurden, true)
      const vulnIncome = normalize(r.medianIncome ?? undefined, allIncome, false)

      const vulnComponents: number[] = []
      if (vulnRentBurden !== null) vulnComponents.push(vulnRentBurden)
      if (vulnIncome !== null) vulnComponents.push(vulnIncome)
      const vulnerability = vulnComponents.length > 0
        ? Math.round(vulnComponents.reduce((a, b) => a + b, 0) / vulnComponents.length)
        : null

      // Pressure (3 components: permits, abatements, unit loss)
      const pressurePermit = normalize(r.permitYoY ?? undefined, allPermitYoY, true)
      const pressureAbatement = normalize(r.abatementCount as number | undefined, allAbatement, true)
      const pressureUnitLoss = normalize(r.unitLossCount as number | undefined, allUnitLoss, true)

      const pressureComponents: number[] = []
      if (pressurePermit !== null) pressureComponents.push(pressurePermit)
      if (pressureAbatement !== null) pressureComponents.push(pressureAbatement)
      if (pressureUnitLoss !== null) pressureComponents.push(pressureUnitLoss)
      const pressure = pressureComponents.length > 0
        ? Math.round(pressureComponents.reduce((a, b) => a + b, 0) / pressureComponents.length)
        : null

      const phase = getPhase(vulnerability, pressure)

      return { ...r, vulnerability, pressure, phase }
    })
  }, [records])

  // ─── Filtered + sorted list ───────────────────────────────────────────────────
  const filteredRecords = useMemo(() => {
    const filtered = filter === 'all'
      ? scoredRecords
      : scoredRecords.filter(r => r.phase === filter)
    return [...filtered].sort((a, b) => {
      const va = a.vulnerability ?? -1
      const vb = b.vulnerability ?? -1
      return vb - va
    })
  }, [scoredRecords, filter])

  // ─── Cross-reference for selected neighborhood ────────────────────────────────
  const crossRefRows: CrossRefRow[] = useMemo(() => {
    if (!detailAbatements.length) return []
    return detailAbatements
      .filter(a => a.address)
      .map(a => {
        const matches = detailPLAP.filter(p => p.address && addressesMatch(a.address, p.address))
        return {
          address: a.address,
          abatementType: a.type ?? 'Unknown',
          plapCount: matches.length,
          hasViolations: matches.length > 0,
        }
      })
  }, [detailAbatements, detailPLAP])

  const violationCount = crossRefRows.filter(r => r.hasViolations).length
  const showFuzzyNote = crossRefRows.filter(r => r.hasViolations).length < 3 && crossRefRows.length > 0

  // ─── Unit loss detail for selected neighborhood ───────────────────────────────
  const unitLossForNeighborhood = useMemo(() => {
    if (!unitActivityData || !selected) return []
    return unitActivityData
      .filter(r => {
        if (!r.neighborhood || r.neighborhood === 'N/A') return false
        return normalizeNeighborhoodName(r.neighborhood) === selected ||
               r.neighborhood.toUpperCase() === selected.toUpperCase()
      })
      .sort((a, b) => {
        const dateA = a.issued_date ?? ''
        const dateB = b.issued_date ?? ''
        return dateB.localeCompare(dateA)
      })
      .slice(0, 30)
  }, [unitActivityData, selected])

  // ─── CRA detail for selected neighborhood ────────────────────────────────────
  const craForNeighborhood = useMemo(() => {
    if (!craAllData || !selected) return []
    return craAllData.filter(r =>
      r.community_council_neighborhood?.toUpperCase() === selected.toUpperCase()
    ).sort((a, b) => {
      const dateA = a.approved_by_city_council ?? ''
      const dateB = b.approved_by_city_council ?? ''
      return dateB.localeCompare(dateA)
    })
  }, [craAllData, selected])

  // ─── Loading state ────────────────────────────────────────────────────────────
  const isLoading = loadingSNA || loadingCensus || loadingPermits || loadingAbatements || loadingPLAP || loadingUnits || loadingCRA
  const anyError = errorSNA || errorCensus || errorPermits || errorAbatements || errorPLAP

  const selectedRecord = scoredRecords.find(r => r.name === selected) ?? null

  // ─── Phase counts for filter buttons ─────────────────────────────────────────
  const phaseCounts = useMemo(() => {
    const counts: Record<FilterPhase, number> = { all: scoredRecords.length, active: 0, vulnerable: 0, gentrifying: 0, stable: 0, insufficient: 0 }
    for (const r of scoredRecords) counts[r.phase]++
    return counts
  }, [scoredRecords])

  // ─── Severity color helpers ───────────────────────────────────────────────────
  function rentBurdenColor(val: number | null): string {
    if (val === null) return 'text-gray-400'
    if (val >= 50) return 'text-red-600 font-semibold'
    if (val >= 35) return 'text-orange-600 font-medium'
    return 'text-gray-700'
  }

  function incomeColor(val: number | null): string {
    if (val === null) return 'text-gray-400'
    if (val < 30000) return 'text-red-600 font-semibold'
    if (val < 50000) return 'text-orange-600 font-medium'
    return 'text-gray-700'
  }

  function permitYoYColor(val: number | null): string {
    if (val === null) return 'text-gray-400'
    if (val > 50) return 'text-red-600 font-semibold'
    if (val > 20) return 'text-orange-600 font-medium'
    if (val < 0) return 'text-green-600'
    return 'text-gray-700'
  }

  // Suppress unused warning for craNeighborhoodMap (used for future features)
  void craNeighborhoodMap

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto">

      {/* Section sub-tabs */}
      <div className="bg-white rounded-lg shadow-sm border-b border-gray-200 mb-6">
        <div className="flex flex-wrap">
          {([
            { id: 'displacement', label: 'Displacement Index' },
            { id: 'owner',        label: 'Owner / Developer Search' },
            { id: 'zoning',       label: 'Zoning Reform Tracker' },
          ] as const).map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeSection === sec.id
                  ? 'border-[#1A4A6B] text-[#1A4A6B]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {sec.label}
            </button>
          ))}
        </div>
      </div>

      {/* Owner / Developer Search */}
      {activeSection === 'owner' && <OwnerActivity />}

      {/* Connected Communities Zoning Reform Tracker */}
      {activeSection === 'zoning' && (
        <div className="mt-4">
          <ConnectedCommunitiesSection />
        </div>
      )}

      {/* Displacement Index content */}
      {activeSection === 'displacement' && <>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Displacement Pressure &amp; Housing Vulnerability
        </h1>
        <p className="text-gray-600 text-sm max-w-3xl leading-relaxed mb-4">
          A two-axis model showing which Cincinnati neighborhoods face both high housing vulnerability
          (who is at risk) and high market pressure (what forces are acting on them). Neighborhoods
          high on both axes need the most urgent attention.
        </p>
        <MethodologyNote />
      </div>

      {/* Error notices */}
      {(anyError || errorUnits || errorCRA) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {errorSNA && <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded border border-red-200">SNA boundaries unavailable</span>}
          {errorCensus && <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded border border-red-200">Census data unavailable</span>}
          {errorPermits && <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded border border-red-200">Permit data unavailable</span>}
          {errorAbatements && <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded border border-red-200">Abatement data unavailable</span>}
          {errorPLAP && <span className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded border border-red-200">PLAP data unavailable</span>}
          {errorUnits && <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded border border-yellow-200">Unit activity data limited</span>}
          {errorCRA && <span className="text-xs bg-yellow-50 text-yellow-700 px-2 py-1 rounded border border-yellow-200">CRA subsidy data limited</span>}
        </div>
      )}

      {/* Phase legend */}
      <div className="mb-6 flex flex-wrap gap-3 text-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
          <span className="text-gray-700"><strong>Active Displacement Zone:</strong> High vulnerability + High pressure — most urgent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-orange-500 flex-shrink-0" />
          <span className="text-gray-700"><strong>Vulnerable / At Risk:</strong> High vulnerability + Low pressure — predatory conditions</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-yellow-500 flex-shrink-0" />
          <span className="text-gray-700"><strong>Development Pressure:</strong> Low vulnerability + High pressure — watch for incoming displacement</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
          <span className="text-gray-700"><strong>Stable:</strong> Low vulnerability + Low pressure</span>
        </div>
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-3 mb-6">
          <div className="h-8 bg-gray-100 rounded animate-pulse w-48" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      )}

      {/* Main two-panel layout */}
      {!isLoading && scoredRecords.length > 0 && (
        <div className="flex flex-col lg:flex-row gap-6">

          {/* Left panel: Rankings list (40%) */}
          <div className="lg:w-2/5 flex-shrink-0">
            {/* Filter buttons */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(['all', 'active', 'vulnerable', 'gentrifying', 'stable', 'insufficient'] as FilterPhase[]).map(ph => {
                const isActive = filter === ph
                const cfg = ph === 'all'
                  ? { label: 'All', bg: 'bg-gray-900', text: 'text-white', inactBg: 'bg-gray-100', inactText: 'text-gray-700' }
                  : { label: PHASE_CONFIG[ph as DisplacementPhase].label.split('/')[0].trim(), bg: PHASE_CONFIG[ph as DisplacementPhase].bg, text: PHASE_CONFIG[ph as DisplacementPhase].color, inactBg: 'bg-white', inactText: 'text-gray-600' }
                return (
                  <button
                    key={ph}
                    onClick={() => setFilter(ph)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      isActive
                        ? ph === 'all' ? 'bg-gray-900 text-white border-gray-900' : `${cfg.bg} ${cfg.text} border-current`
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    {ph === 'all' ? 'All' : PHASE_CONFIG[ph as DisplacementPhase].label.split('/')[0].trim()} ({phaseCounts[ph]})
                  </button>
                )
              })}
            </div>

            {/* List */}
            <div className="flex flex-col gap-2 max-h-[680px] overflow-y-auto pr-1">
              {filteredRecords.map(rec => (
                <button
                  key={rec.name}
                  onClick={() => setSelected(rec.name === selected ? null : rec.name)}
                  className={`text-left w-full rounded-lg border p-3 transition-all hover:shadow-sm ${
                    selected === rec.name
                      ? 'border-[#1A4A6B] shadow-sm bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-semibold text-sm text-gray-900 leading-tight">{rec.name}</span>
                    <PhaseBadge phase={rec.phase} />
                  </div>
                  <MiniBar value={rec.vulnerability} colorClass="bg-gradient-to-r from-orange-400 to-red-500" label="Vulnerability" />
                  <MiniBar value={rec.pressure} colorClass="bg-gradient-to-r from-blue-400 to-blue-600" label="Pressure" />
                </button>
              ))}
              {filteredRecords.length === 0 && (
                <p className="text-sm text-gray-500 text-center py-8">No neighborhoods match this filter.</p>
              )}
            </div>
          </div>

          {/* Right panel: Detail view (60%) */}
          <div className="lg:w-3/5">
            {!selected && (
              <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200 border-dashed">
                <div className="text-center text-gray-400">
                  <svg className="w-10 h-10 mx-auto mb-2 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                  </svg>
                  <p className="text-sm font-medium">Select a neighborhood to view details</p>
                  <p className="text-xs mt-1">Click any neighborhood in the list on the left</p>
                </div>
              </div>
            )}

            {selected && selectedRecord && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Detail header */}
                <div className={`px-5 py-4 ${PHASE_CONFIG[selectedRecord.phase].bg} border-b ${PHASE_CONFIG[selectedRecord.phase].border}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">{selectedRecord.name}</h2>
                      <div className="mt-1">
                        <PhaseBadge phase={selectedRecord.phase} />
                      </div>
                    </div>
                    <button
                      onClick={() => setSelected(null)}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded"
                      aria-label="Close detail"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="p-5 flex flex-col gap-6">

                  {/* Synthesis: What this means + What to do */}
                  {(() => {
                    const syn = PHASE_SYNTHESIS[selectedRecord.phase]
                    return (
                      <div className={`rounded-lg border ${syn.borderColor} ${syn.bgColor} px-4 py-3 space-y-2`}>
                        <p className={`text-sm font-semibold ${syn.textColor}`}>{syn.headline}</p>
                        <p className="text-xs text-gray-700 leading-relaxed">{syn.interpretation}</p>
                        <div className="pt-1 border-t border-gray-200">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-0.5">What to do</p>
                          <p className="text-xs text-gray-700 leading-relaxed">{syn.action}</p>
                        </div>
                        <div className="pt-2">
                          <CivicOrgsPanel
                            categories={syn.orgCategories}
                            intro="Organizations working on this:"
                          />
                        </div>
                      </div>
                    )
                  })()}

                  {/* Section 1: Two-Axis Profile */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Two-Axis Profile</h3>
                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                      <QuadrantPlot record={selectedRecord} />
                      <div className="flex flex-col gap-3 flex-1 min-w-0">
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Vulnerability Score</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-red-500" style={{ width: `${selectedRecord.vulnerability ?? 0}%` }} />
                            </div>
                            <span className="text-sm font-bold text-gray-900 w-8 text-right">
                              {selectedRecord.vulnerability !== null ? selectedRecord.vulnerability : 'N/A'}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pressure Score</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-600" style={{ width: `${selectedRecord.pressure ?? 0}%` }} />
                            </div>
                            <span className="text-sm font-bold text-gray-900 w-8 text-right">
                              {selectedRecord.pressure !== null ? selectedRecord.pressure : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <hr className="border-gray-100" />

                  {/* Section 2: Vulnerability Factors */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Vulnerability Factors</h3>
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm text-gray-600">Rent Burden Rate</p>
                          <p className="text-xs text-gray-400">% of renters paying &gt;30% of income on rent</p>
                        </div>
                        <span className={`text-sm ${rentBurdenColor(selectedRecord.rentBurdenRate)}`}>
                          {selectedRecord.rentBurdenRate !== null
                            ? `${selectedRecord.rentBurdenRate.toFixed(1)}%`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm text-gray-600">Median Household Income</p>
                          <p className="text-xs text-gray-400">Cincinnati median ≈ $47,000</p>
                        </div>
                        <span className={`text-sm ${incomeColor(selectedRecord.medianIncome)}`}>
                          {selectedRecord.medianIncome !== null
                            ? `$${selectedRecord.medianIncome.toLocaleString()}`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <hr className="border-gray-100" />

                  {/* Section 3: Market Pressure Factors */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Market Pressure Factors</h3>
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm text-gray-600">Permit Growth (3yr YoY)</p>
                          <p className="text-xs text-gray-400">
                            {selectedRecord.recentPermitCount !== null
                              ? `${selectedRecord.recentPermitCount} recent permits`
                              : 'No recent permit data'}
                          </p>
                        </div>
                        <span className={`text-sm ${permitYoYColor(selectedRecord.permitYoY)}`}>
                          {selectedRecord.permitYoY !== null
                            ? `${selectedRecord.permitYoY > 0 ? '+' : ''}${selectedRecord.permitYoY.toFixed(1)}%`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm text-gray-600">Tax Abatements</p>
                          <p className="text-xs text-gray-400">Active developer subsidies</p>
                        </div>
                        <span className="text-sm font-medium text-gray-800">{selectedRecord.abatementCount}</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm text-gray-600">PLAP Blight Violations</p>
                          <p className="text-xs text-gray-400">Complaints logged</p>
                        </div>
                        <span className="text-sm font-medium text-gray-800">{selectedRecord.plapCount}</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm text-gray-600">Housing Units Removed</p>
                          <p className="text-xs text-gray-400">Total units removed via permits</p>
                        </div>
                        <span className={`text-sm ${selectedRecord.unitLossCount > 0 ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                          {selectedRecord.unitLossCount > 0 ? `−${selectedRecord.unitLossCount}` : '0'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <hr className="border-gray-100" />

                  {/* Section 4: Tax Abatement Accountability */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Tax Abatement Accountability</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Cross-referencing properties receiving tax abatements against their PLAP blight violation history.
                    </p>

                    {loadingDetail && (
                      <div className="flex flex-col gap-2">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
                        ))}
                      </div>
                    )}

                    {!loadingDetail && crossRefRows.length === 0 && (
                      <p className="text-sm text-gray-500 italic">
                        {detailAbatements.length === 0
                          ? 'No tax abatements found for this neighborhood.'
                          : 'Abatement addresses could not be cross-referenced.'}
                      </p>
                    )}

                    {!loadingDetail && crossRefRows.length > 0 && (
                      <>
                        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg mb-3 text-sm font-semibold ${
                          violationCount > 0 ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'
                        }`}>
                          {violationCount > 0
                            ? `${violationCount} propert${violationCount === 1 ? 'y' : 'ies'} with subsidies and violations`
                            : 'No cross-referenced violations found'}
                        </div>

                        {showFuzzyNote && (
                          <p className="text-xs text-gray-400 italic mb-3">
                            Address-level cross-referencing uses fuzzy matching. Some matches may be missed due to address formatting differences.
                          </p>
                        )}

                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Address</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Abatement Type</th>
                                <th className="text-center py-2 px-2 font-semibold text-gray-600">PLAP Violations</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {crossRefRows.slice(0, 30).map((row, i) => (
                                <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                  <td className="py-1.5 px-2 text-gray-700 max-w-[140px] truncate" title={row.address}>
                                    {row.address}
                                  </td>
                                  <td className="py-1.5 px-2 text-gray-600">{row.abatementType}</td>
                                  <td className="py-1.5 px-2 text-center text-gray-700">{row.plapCount}</td>
                                  <td className="py-1.5 px-2">
                                    {row.hasViolations
                                      ? <span className="text-red-600 font-medium">Has Violations</span>
                                      : <span className="text-green-600">Clean</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {crossRefRows.length > 30 && (
                            <p className="text-xs text-gray-400 mt-1 text-center">
                              Showing 30 of {crossRefRows.length} abatement records
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <hr className="border-gray-100" />

                  {/* Section 5: Housing Units Removed */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Housing Units Removed</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Building permits showing a net reduction in housing units in this neighborhood, with the permit applicant (owner or LLC) from the city record. Source: Cincinnati Housing Unit Activity.
                    </p>
                    {unitLossForNeighborhood.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No unit removal permits found for this neighborhood.</p>
                    ) : (
                      <>
                        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3 text-sm font-semibold text-red-700 inline-flex gap-2 items-center">
                          <span>⚠</span>
                          <span>{unitLossForNeighborhood.reduce((s, r) => s + (parseInt(r.units_removed, 10) || 0), 0)} units removed across {unitLossForNeighborhood.length} permits</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Address</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Permit Holder</th>
                                <th className="text-center py-2 px-2 font-semibold text-gray-600">Units −</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {unitLossForNeighborhood.map((r, i) => (
                                <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                  <td className="py-1.5 px-2 text-gray-700 max-w-[130px] truncate" title={r.address}>{r.address}</td>
                                  <td className="py-1.5 px-2 text-gray-600 max-w-[130px] truncate font-medium" title={r.title ?? ''}>{r.title || '—'}</td>
                                  <td className="py-1.5 px-2 text-center text-red-600 font-bold">−{r.units_removed}</td>
                                  <td className="py-1.5 px-2 text-gray-500">{r.issued_date ? r.issued_date.slice(0, 8) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  <hr className="border-gray-100" />

                  {/* Section 6: Developer Subsidies */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Developer Subsidies Approved Here</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      City-approved commercial CRA subsidies for this neighborhood. Includes tax abatements, TIF grants, LEED credits, and below-market city land sales. Source: Commercial CRA Abatements.
                    </p>
                    {craForNeighborhood.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No CRA subsidies found for this neighborhood.</p>
                    ) : (
                      <>
                        <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-3 text-sm font-semibold text-blue-800 inline-flex gap-2 items-center">
                          <span>${(craForNeighborhood.reduce((s, r) => s + (parseFloat(r.est_program_total_value || '0') || 0), 0) / 1_000_000).toFixed(2)}M in city subsidies approved</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Developer</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Project</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Type</th>
                                <th className="text-right py-2 px-2 font-semibold text-gray-600">Value</th>
                                <th className="text-left py-2 px-2 font-semibold text-gray-600">Approved</th>
                              </tr>
                            </thead>
                            <tbody>
                              {craForNeighborhood.slice(0, 20).map((r, i) => (
                                <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                  <td className="py-1.5 px-2 text-gray-700 font-medium max-w-[120px] truncate" title={r.organization_legal_name ?? ''}>{r.organization_legal_name || '—'}</td>
                                  <td className="py-1.5 px-2 text-gray-600 max-w-[120px] truncate" title={r.project_name ?? ''}>{r.project_name || '—'}</td>
                                  <td className="py-1.5 px-2 text-gray-500">{r.program_type || '—'}</td>
                                  <td className="py-1.5 px-2 text-right text-gray-700 font-medium">
                                    {r.est_program_total_value && parseFloat(r.est_program_total_value) > 0
                                      ? `$${Math.round(parseFloat(r.est_program_total_value)).toLocaleString()}`
                                      : '—'}
                                  </td>
                                  <td className="py-1.5 px-2 text-gray-500">{r.approved_by_city_council ? r.approved_by_city_council.slice(0, 10) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  <hr className="border-gray-100" />

                  {/* Section 7: Demolition Orders */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-1">Demolition Orders</h3>
                    <p className="text-xs text-gray-500 mb-3">
                      Active city demolition proceedings in this neighborhood. "Ready for Bid" means the property is actively being cleared for auction. Source: Cincinnati Code Enforcement.
                    </p>
                    {loadingDetail ? (
                      <div className="h-12 bg-gray-100 rounded animate-pulse" />
                    ) : detailDemolitions.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">No demolition orders found for this neighborhood.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                              <th className="text-left py-2 px-2 font-semibold text-gray-600">Address</th>
                              <th className="text-left py-2 px-2 font-semibold text-gray-600">Type</th>
                              <th className="text-left py-2 px-2 font-semibold text-gray-600">Status</th>
                              <th className="text-left py-2 px-2 font-semibold text-gray-600">Filed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailDemolitions.map((d, i) => {
                              const isUrgent = (d.data_status_display ?? '').toLowerCase().includes('bid') || (d.data_status_display ?? '').toLowerCase().includes('nuisance')
                              return (
                                <tr key={i} className={`border-b border-gray-100 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                                  <td className="py-1.5 px-2 text-gray-700 max-w-[130px] truncate" title={d.full_address ?? ''}>{d.full_address || '—'}</td>
                                  <td className="py-1.5 px-2 text-gray-600">{d.sub_type_desc || '—'}</td>
                                  <td className="py-1.5 px-2">
                                    <span className={isUrgent ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                                      {d.data_status_display || '—'}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2 text-gray-500">{d.entered_date ? d.entered_date.slice(0, 10) : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty state after loading */}
      {!isLoading && scoredRecords.length === 0 && !anyError && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No neighborhood data could be loaded. Please try refreshing the page.</p>
        </div>
      )}

      {/* CRA Developer Leaderboard */}
      {!isLoading && craLeaderboard.length > 0 && (
        <div className="mt-10">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-gray-900">Who's Getting the Money?</h2>
            <p className="text-sm text-gray-600 mt-1 max-w-3xl">
              Developers ranked by total city subsidy value received city-wide — tax abatements, TIF grants, LEED credits, and below-market land sales.
              Only developers with reported dollar values are shown. Source: Cincinnati Commercial CRA Abatements dataset.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Rank</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Developer / Organization</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Total Subsidy</th>
                    <th className="text-center py-3 px-4 font-semibold text-gray-700">Projects</th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700 hidden md:table-cell">Neighborhoods</th>
                  </tr>
                </thead>
                <tbody>
                  {craLeaderboard.map((entry, i) => (
                    <tr key={entry.name} className={`border-b border-gray-100 hover:bg-blue-50 transition-colors ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <td className="py-2.5 px-4 text-gray-500 font-medium">#{i + 1}</td>
                      <td className="py-2.5 px-4 font-semibold text-gray-900">{entry.name}</td>
                      <td className="py-2.5 px-4 text-right">
                        <span className={`font-bold ${entry.total >= 1_000_000 ? 'text-red-700' : entry.total >= 500_000 ? 'text-orange-700' : 'text-gray-800'}`}>
                          ${entry.total >= 1_000_000
                            ? `${(entry.total / 1_000_000).toFixed(2)}M`
                            : `${Math.round(entry.total / 1000)}K`}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center text-gray-700">{entry.projectCount}</td>
                      <td className="py-2.5 px-4 text-gray-500 text-xs hidden md:table-cell max-w-xs truncate" title={entry.neighborhoods}>
                        {entry.neighborhoods || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                Source: Cincinnati Open Data — Commercial CRA Abatements (m76i-p5p9). Values are estimated program totals as reported at time of city council approval. Showing top 25 by reported subsidy value.
              </p>
            </div>
          </div>
        </div>
      )}

      </>}

    </div>
  )
}

export default DisplacementTab
