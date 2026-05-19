import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { fetchSODA, fetchNeighborhoodCensusStats, normalizeNeighborhoodName, stripNeighborhoodName } from '../../utils/api'
import { normalize } from '../../utils/scoring'
import OwnerActivity from '../OwnerActivity'
import ConnectedCommunitiesSection from './ConnectedCommunitiesSection'
import CivicOrgsPanel from '../../components/ui/CivicOrgsPanel'
import { C } from '../../components/ui/DesignAtoms'
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
    bgColor: C.brickLight, borderColor: C.brick, textColor: C.brick,
  },
  vulnerable: {
    headline: 'Neighborhood is vulnerable — development pressure could arrive soon',
    interpretation:
      'Residents here face economic vulnerability (high rent burden, lower incomes) but major development pressure hasn\'t fully arrived yet. Historically, vulnerable neighborhoods become targets once adjacent areas are "developed." The window to organize is now.',
    action:
      'Connect with housing and community development organizations before pressure accelerates. Building a stabilization strategy now — community land trusts, tenant organizing, zoning engagement — is far more effective than reacting after displacement begins.',
    orgCategories: ['housing-eviction', 'economic-development'],
    bgColor: 'rgba(200,134,26,0.09)', borderColor: C.ochre, textColor: C.ochre,
  },
  gentrifying: {
    headline: 'Development pressure is arriving — resident protection is the question',
    interpretation:
      'Strong construction activity and investment is coming in, but residents aren\'t automatically protected from rising rents and displacement. This is early-stage gentrification: if incomes don\'t rise alongside rents, longtime residents get pushed out.',
    action:
      'Engage the public process: attend Planning Commission hearings before major projects are approved, comment on zoning changes, and ask developers what\'s in it for current residents. Check the "Zoning Reform" tab to see how Connected Communities is playing out here.',
    orgCategories: ['housing-eviction', 'civic-engagement'],
    bgColor: C.hillLight, borderColor: C.hill, textColor: C.hill,
  },
  stable: {
    headline: 'Currently stable',
    interpretation:
      'Neither high vulnerability nor strong development pressure at the moment. Stability isn\'t permanent — conditions change, and the neighborhoods that are stable today are often the ones surprised by rapid change tomorrow.',
    action:
      'Stay engaged with your neighborhood\'s civic process. Attending Planning Commission meetings before large projects are approved is the lowest-cost way to protect stability.',
    orgCategories: ['civic-engagement'],
    bgColor: C.riverLight, borderColor: C.river, textColor: C.river,
  },
  insufficient: {
    headline: 'Not enough data to classify',
    interpretation:
      'We couldn\'t find sufficient data to reliably score this neighborhood across all four dimensions. This may reflect a smaller population, fewer reported permits, or gaps in available public data.',
    action:
      'Your neighborhood community council may have local context not captured in city data. You can also check the Neighborhood Profiles tab for whatever data is available.',
    orgCategories: ['civic-engagement'],
    bgColor: C.limestone, borderColor: C.rule, textColor: C.muted,
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
  project_type?: string
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

type CRAUseType = 'Residential' | 'Mixed Use' | 'Commercial' | 'Other'

interface CRALeaderboardEntry {
  name: string
  total: number
  projectCount: number
  neighborhoods: string
  useType: CRAUseType         // dominant project use category
  sinceYear: number | null    // earliest city council approval year (1900 = unknown, filtered)
  isAffordableHousing: boolean  // federally-constrained affordable program (HOME, CDBG, etc.)
}

// Program types that are federally constrained to affordable housing purposes
const AFFORDABLE_PROGRAM_TYPES = new Set([
  'HOME', 'CDBG GRANT', 'CDBG', 'HOME GRANT', 'HOME LOAN',
])

// Normalize project_type field (case-inconsistent in the data) to a display category
function normalizeUseType(types: Set<string>): CRAUseType {
  const norm = (s: string) => s.toUpperCase().trim()
  const all = [...types].map(norm)
  const hasResidential = all.some(t => t.includes('RESIDENTIAL') || t === 'HOUSING')
  const hasCommercial  = all.some(t =>
    t.includes('OFFICE') || t.includes('RETAIL') || t.includes('INDUSTRIAL') ||
    t.includes('HOTEL') || t.includes('COMMERCIAL')
  )
  const hasMixed = all.some(t => t.includes('MIXED'))
  if (hasMixed || (hasResidential && hasCommercial)) return 'Mixed Use'
  if (hasResidential) return 'Residential'
  if (hasCommercial)  return 'Commercial'
  return 'Other'
}

// Plain-English glossary for the most common CRA program types
const PROGRAM_TYPE_GLOSSARY: Record<string, string> = {
  'CRA':                'Community Reinvestment Area — state-designated zone granting multi-year property tax abatements to encourage private investment.',
  'LEED CRA':           'CRA abatement awarded to buildings certified under LEED green-building standards. Same tax benefit, requires environmental certification.',
  'OTHER CITY LOAN':    'Direct below-market-rate loan from the City of Cincinnati, typically for development or building rehabilitation.',
  'JCTC':               'Job Creation Tax Credit — tax incentive tied to a company creating a minimum number of new jobs. Always commercial.',
  'HOME':               'HOME Investment Partnerships — federal HUD grant passed through the city. By law, all units must be affordable to low- and moderate-income households.',
  'BELOW MARKET RATE SALE': "City sells land it owns below appraised value. Affordability requirements depend on the buyer's proposal — not automatic.",
  'PROJECT TIF':        'Tax Increment Financing — future property-tax growth from the site funds public infrastructure costs instead of going to the general fund.',
  'CDBG GRANT':         'Community Development Block Grant — federal HUD funds for housing rehab, economic development, or public facilities in low-income areas.',
}

type OrgType = 'Corporate' | 'Land Trust' | 'Nonprofit / Gov'

function inferOrgType(name: string): OrgType {
  const u = name.toUpperCase()
  if (u.includes('LAND TRUST') || u.includes('CLT')) return 'Land Trust'
  if (
    u.includes(' LLC') || u.includes(',LLC') ||
    u.includes(' INC') || u.includes(',INC') ||
    u.includes(' CORP') || u.includes(',CORP') ||
    u.includes('HOLDINGS') || u.includes('PARTNERS') ||
    u.includes('CAPITAL') || u.includes('PROPERTIES') ||
    u.includes('INVESTMENTS') || u.includes('VENTURES')
  ) return 'Corporate'
  return 'Nonprofit / Gov'
}

const ORG_TYPE_STYLE: Record<OrgType, { bg: string; color: string; border: string }> = {
  'Corporate':      { bg: C.brickLight,  color: C.brick,  border: '#e6c5b2' },
  'Land Trust':     { bg: C.hillLight,   color: C.hill,   border: C.hill },
  'Nonprofit / Gov':{ bg: C.riverLight,  color: C.riverDeep, border: C.rule },
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

const PHASE_CONFIG: Record<DisplacementPhase, { label: string; textColor: string; bgColor: string; borderColor: string; dotColor: string }> = {
  active:       { label: 'Active Displacement Zone', textColor: C.brick,      bgColor: C.brickLight,                    borderColor: C.brick, dotColor: C.brick      },
  vulnerable:   { label: 'Vulnerable / At Risk',     textColor: C.ochre,      bgColor: 'rgba(200,134,26,0.09)',          borderColor: C.ochre, dotColor: C.ochre      },
  gentrifying:  { label: 'Development Pressure',     textColor: C.hill,       bgColor: C.hillLight,                     borderColor: C.hill,  dotColor: C.hill       },
  stable:       { label: 'Stable',                   textColor: C.river,      bgColor: C.riverLight,                    borderColor: C.river, dotColor: C.river      },
  insufficient: { label: 'Insufficient Data',        textColor: C.muted,      bgColor: C.limestone,                     borderColor: C.rule,  dotColor: C.muted      },
}

const PHASE_DOT_SVG: Record<DisplacementPhase, string> = {
  active:       C.brick,
  vulnerable:   C.ochre,
  gentrifying:  C.hill,
  stable:       C.river,
  insufficient: C.muted,
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
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: cfg.bgColor, color: cfg.textColor, border: `1px solid ${cfg.borderColor}` }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: cfg.dotColor }} />
      {cfg.label}
    </span>
  )
}


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
      <rect x={PAD.left} y={PAD.top} width={plotW / 2} height={plotH / 2} fill={C.brickLight} opacity={0.5} />
      <rect x={midX} y={PAD.top} width={plotW / 2} height={plotH / 2} fill={C.hillLight} opacity={0.5} />
      <rect x={PAD.left} y={midY} width={plotW / 2} height={plotH / 2} fill={C.riverLight} opacity={0.5} />
      <rect x={midX} y={midY} width={plotW / 2} height={plotH / 2} fill={C.limestone} opacity={0.5} />

      {/* Grid lines */}
      <line x1={PAD.left} y1={midY} x2={PAD.left + plotW} y2={midY} stroke={C.rule} strokeWidth={1} strokeDasharray="4 3" />
      <line x1={midX} y1={PAD.top} x2={midX} y2={PAD.top + plotH} stroke={C.rule} strokeWidth={1} strokeDasharray="4 3" />

      {/* Border */}
      <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH} fill="none" stroke={C.rule} strokeWidth={1} />

      {/* Quadrant labels */}
      <text x={PAD.left + 6} y={PAD.top + 14} fontSize={9} fill={C.brick} fontWeight="600">Active</text>
      <text x={PAD.left + 6} y={PAD.top + 24} fontSize={9} fill={C.brick} fontWeight="600">Displacement</text>

      <text x={midX + 6} y={PAD.top + 14} fontSize={9} fill={C.hill} fontWeight="600">Development</text>
      <text x={midX + 6} y={PAD.top + 24} fontSize={9} fill={C.hill} fontWeight="600">Pressure</text>

      <text x={PAD.left + 6} y={midY + plotH / 2 - 10} fontSize={9} fill={C.river} fontWeight="600">Stable</text>

      <text x={midX + 6} y={midY + plotH / 2 - 10} fontSize={9} fill={C.muted} fontWeight="600">Vulnerable</text>
      <text x={midX + 6} y={midY + plotH / 2} fontSize={9} fill={C.muted} fontWeight="600">/ At Risk</text>

      {/* Axes */}
      <line x1={PAD.left} y1={PAD.top + plotH} x2={PAD.left + plotW} y2={PAD.top + plotH} stroke={C.muted} strokeWidth={1.5} />
      <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + plotH} stroke={C.muted} strokeWidth={1.5} />

      {/* Axis labels */}
      <text x={PAD.left + plotW / 2} y={H - 4} fontSize={10} fill={C.ink} textAnchor="middle">Market Pressure →</text>
      <text
        x={12}
        y={PAD.top + plotH / 2}
        fontSize={10}
        fill={C.ink}
        textAnchor="middle"
        transform={`rotate(-90, 12, ${PAD.top + plotH / 2})`}
      >
        Vulnerability →
      </text>

      {/* Tick marks */}
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line x1={toX(v)} y1={PAD.top + plotH} x2={toX(v)} y2={PAD.top + plotH + 4} stroke={C.muted} strokeWidth={1} />
          <text x={toX(v)} y={PAD.top + plotH + 13} fontSize={8} fill={C.muted} textAnchor="middle">{v}</text>
          <line x1={PAD.left - 4} y1={toY(v)} x2={PAD.left} y2={toY(v)} stroke={C.muted} strokeWidth={1} />
          <text x={PAD.left - 6} y={toY(v) + 3} fontSize={8} fill={C.muted} textAnchor="end">{v}</text>
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
        <text x={PAD.left + plotW / 2} y={PAD.top + plotH / 2} fontSize={11} fill={C.muted} textAnchor="middle">
          Insufficient data to plot
        </text>
      )}
    </svg>
  )
}

// ─── City-wide Scatter Chart ──────────────────────────────────────────────────

// Curated label set — one anchor per quadrant + key civic context neighborhoods.
// Kept small to avoid overlap; hover reveals any unlabeled neighborhood name.
const LABEL_NEIGHBORHOODS = new Set([
  'Over-the-Rhine',  // active risk — canonical gentrification example
  'Walnut Hills',    // active risk — East side displacement story
  'Avondale',        // vulnerable — high renter burden, historic disinvestment
  'East Price Hill', // vulnerable — extreme rent burden
  'Hyde Park',       // gentrifying/stable — low vuln, high pressure contrast
  'Northside',       // stable — anchor for lower-left quadrant
  'Madisonville',    // center — mixed, useful midpoint reference
])

const CityScatterChart: React.FC<{
  records: DisplacementRecord[]
  selected: string | null
  onSelect: (name: string | null) => void
  filter: FilterPhase
  onTabChange?: (tab: import('../../types').TabId) => void
}> = ({ records, selected, onSelect, filter, onTabChange }) => {
  const [hovered, setHovered] = useState<string | null>(null)

  const plottable = records.filter(r => r.vulnerability !== null && r.pressure !== null)

  const atRiskList = useMemo(() =>
    [...records]
      .filter(r => (r.phase === 'active' || r.phase === 'vulnerable') && r.vulnerability !== null)
      .sort((a, b) => {
        if (a.phase !== b.phase) return a.phase === 'active' ? -1 : 1
        return (b.vulnerability ?? 0) - (a.vulnerability ?? 0)
      })
      .slice(0, 8),
    [records]
  )

  const W = 720, H = 420
  const PAD = { top: 40, right: 28, bottom: 50, left: 50 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top - PAD.bottom
  const midX = PAD.left + plotW / 2
  const midY = PAD.top + plotH / 2

  // X = development pressure (0=left, 100=right)
  // Y = vulnerability (0=bottom, 100=top)
  const toX = (pressure: number) => PAD.left + (pressure / 100) * plotW
  const toY = (vulnerability: number) => PAD.top + ((100 - vulnerability) / 100) * plotH

  const hoveredRecord = plottable.find(r => r.name === hovered) ?? null
  const FONT = '"Public Sans", sans-serif'
  const SERIF = '"Newsreader", "Georgia", serif'

  // Centers of each quadrant for labels
  const qLabelX = { left: PAD.left + plotW * 0.25, right: PAD.left + plotW * 0.75 }
  const qLabelY = { top: PAD.top + plotH * 0.18, bottom: PAD.top + plotH * 0.82 }

  return (
    <div>
      {/* Section header */}
      <div className="mb-6">
        <div className="smallcaps mb-2" style={{ color: C.muted }}>01 / Vulnerability &amp; Pressure</div>
        <h2 className="serif font-medium leading-tight mb-3" style={{ fontSize: 30, letterSpacing: '-0.015em', color: C.ink }}>
          The city splits into quadrants.{' '}
          <span style={{ color: C.brick }}>Top-right</span> is where displacement happens fastest.
        </h2>
        <p className="serif" style={{ fontSize: 16, lineHeight: 1.65, color: C.muted, maxWidth: 680 }}>
          Each dot is a neighborhood. The horizontal axis measures development pressure — permit
          volume, tax abatements, and unit removals over a 3-year rolling window. The vertical
          axis measures renter vulnerability — income and rent burden from Census ACS data. Both
          are normalized to the city median. Hover anywhere along the diagonal and you find the
          neighborhoods most likely to change next.
        </p>
      </div>

      <div className="page-paper rounded-md overflow-hidden" style={{ border: `1px solid ${C.rule}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px' }}>

          {/* ── Scatter plot ── */}
          <div className="p-5 min-w-0" style={{ borderRight: `1px solid ${C.rule}` }}>
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block' }}>

              {/* Quadrant fills */}
              <rect x={PAD.left}  y={PAD.top}  width={plotW/2} height={plotH/2} fill={C.ochre} opacity={0.07} />
              <rect x={midX}      y={PAD.top}  width={plotW/2} height={plotH/2} fill={C.brick} opacity={0.07} />
              <rect x={PAD.left}  y={midY}     width={plotW/2} height={plotH/2} fill={C.river} opacity={0.05} />
              <rect x={midX}      y={midY}     width={plotW/2} height={plotH/2} fill={C.hill}  opacity={0.05} />

              {/* Dashed median dividers */}
              <line x1={midX}      y1={PAD.top}         x2={midX}           y2={PAD.top+plotH} stroke={C.rule} strokeWidth={1} strokeDasharray="5 4" />
              <line x1={PAD.left}  y1={midY}            x2={PAD.left+plotW} y2={midY}          stroke={C.rule} strokeWidth={1} strokeDasharray="5 4" />
              <rect x={PAD.left}   y={PAD.top}          width={plotW}       height={plotH}     fill="none" stroke={C.rule} strokeWidth={1} />

              {/* Quadrant labels — centered in each quadrant */}
              <text x={qLabelX.left}  y={qLabelY.top}      fontSize={10} fontWeight="700" fill={C.ochre} textAnchor="middle" style={{ fontFamily: FONT, letterSpacing: '0.08em' }}>VULNERABLE</text>
              <text x={qLabelX.left}  y={qLabelY.top + 15} fontSize={9}  fill={C.ochre} textAnchor="middle" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>waiting for pressure</text>

              <text x={qLabelX.right} y={qLabelY.top}      fontSize={10} fontWeight="700" fill={C.brick} textAnchor="middle" style={{ fontFamily: FONT, letterSpacing: '0.08em' }}>ACTIVE RISK</text>
              <text x={qLabelX.right} y={qLabelY.top + 15} fontSize={9}  fill={C.brick} textAnchor="middle" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>vulnerable + pressure</text>

              <text x={qLabelX.left}  y={qLabelY.bottom}      fontSize={10} fontWeight="700" fill={C.river} textAnchor="middle" style={{ fontFamily: FONT, letterSpacing: '0.08em' }}>STABLE</text>
              <text x={qLabelX.left}  y={qLabelY.bottom + 15} fontSize={9}  fill={C.river} textAnchor="middle" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>for now</text>

              <text x={qLabelX.right} y={qLabelY.bottom}      fontSize={10} fontWeight="700" fill={C.hill} textAnchor="middle" style={{ fontFamily: FONT, letterSpacing: '0.08em' }}>GENTRIFYING</text>
              <text x={qLabelX.right} y={qLabelY.bottom + 15} fontSize={9}  fill={C.hill} textAnchor="middle" style={{ fontFamily: SERIF, fontStyle: 'italic' }}>pressure, low vuln.</text>

              {/* Axis labels */}
              <text x={16} y={PAD.top + plotH/2} fontSize={10} textAnchor="middle" fill={C.muted}
                transform={`rotate(-90, 16, ${PAD.top + plotH/2})`} style={{ fontFamily: FONT }}>
                Vulnerability →
              </text>
              <text x={PAD.left + plotW/2} y={H - 6} fontSize={10} textAnchor="middle" fill={C.muted} style={{ fontFamily: FONT }}>
                Development pressure →
              </text>

              {/* Neighborhood dots */}
              {plottable.map(rec => {
                const x = toX(rec.pressure!)
                const y = toY(rec.vulnerability!)
                const isSelected = rec.name === selected
                const isHovered  = rec.name === hovered
                const isDimmed   = filter !== 'all' && rec.phase !== filter
                const color = PHASE_CONFIG[rec.phase].dotColor
                const r = isSelected ? 8 : isHovered ? 7 : 5.5
                const shouldLabel = LABEL_NEIGHBORHOODS.has(rec.name) && !isDimmed

                const onRight = rec.pressure! > 50
                const onTop   = rec.vulnerability! > 50
                const lx = x + (onRight ? -9 : 9)
                const ly = y + (onTop ? -9 : 15)
                const anchor: React.SVGProps<SVGTextElement>['textAnchor'] = onRight ? 'end' : 'start'

                return (
                  <g key={rec.name} style={{ cursor: 'pointer' }}
                    onClick={() => onSelect(rec.name === selected ? null : rec.name)}
                    onMouseEnter={() => setHovered(rec.name)}
                    onMouseLeave={() => setHovered(null)}>
                    {isSelected && <circle cx={x} cy={y} r={r+5} fill={color} opacity={0.18} />}
                    <circle cx={x} cy={y} r={r} fill={color}
                      opacity={isDimmed ? 0.15 : 0.85}
                      stroke={isSelected ? '#fff' : 'none'}
                      strokeWidth={isSelected ? 2 : 0} />
                    {shouldLabel && (
                      <text x={lx} y={ly} fontSize={9} textAnchor={anchor}
                        fill={C.ink} fontWeight="500"
                        style={{ fontFamily: FONT, pointerEvents: 'none' }}>
                        {rec.name}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Hover name for un-labeled neighborhoods */}
              {hoveredRecord && !LABEL_NEIGHBORHOODS.has(hoveredRecord.name) &&
                hoveredRecord.pressure !== null && hoveredRecord.vulnerability !== null && (
                <text
                  x={toX(hoveredRecord.pressure) + (hoveredRecord.pressure > 50 ? -9 : 9)}
                  y={toY(hoveredRecord.vulnerability) - 9}
                  fontSize={9}
                  textAnchor={hoveredRecord.pressure > 50 ? 'end' : 'start'}
                  fill={C.ink}
                  fontWeight="500"
                  style={{ fontFamily: FONT, pointerEvents: 'none' }}>
                  {hoveredRecord.name}
                </text>
              )}
            </svg>
          </div>

          {/* ── At-risk sidebar ── */}
          <div className="p-5 flex flex-col">
            <div className="smallcaps mb-4" style={{ color: C.muted }}>Top of the At-Risk List</div>
            <div className="flex flex-col gap-4 flex-1">
              {atRiskList.map((rec, i) => (
                <div key={rec.name} className="flex items-start gap-3 cursor-pointer group"
                  onClick={() => onSelect(rec.name === selected ? null : rec.name)}>
                  <span className="serif font-medium flex-shrink-0"
                    style={{ color: rec.phase === 'active' ? C.brick : C.ochre, fontSize: 14, minWidth: 22, lineHeight: 1.3 }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm leading-tight group-hover:underline" style={{ color: C.ink }}>
                      {rec.name}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: C.muted }}>
                      {rec.phase === 'active' ? 'Active risk' : 'Vulnerable'}
                      {rec.rentBurdenRate !== null ? ` · ${rec.rentBurdenRate.toFixed(0)}% rent-burdened` : ''}
                    </div>
                  </div>
                  {onTabChange && (
                    <button
                      className="text-xs flex-shrink-0 hover:underline"
                      style={{ color: C.river, lineHeight: 1.3 }}
                      onClick={e => { e.stopPropagation(); onSelect(rec.name); onTabChange('neighborhoods') }}>
                      profile →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── Methodology info panel ────────────────────────────────────────────────────

const MethodologyNote: React.FC = () => {
  const [open, setOpen] = React.useState(false)
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Show methodology details"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
        style={{
          border: `1px solid ${C.ochre}`,
          color: open ? C.paper : C.ochre,
          background: open ? C.ochre : 'transparent',
        }}
      >
        <span className="font-bold">i</span>
        Methodology
      </button>

      {open && (
        <div className="mt-3 rounded-md p-4 max-w-3xl" style={{ background: 'rgba(200, 134, 26, 0.08)', border: `1px solid ${C.ochre}` }}>
          <div className="space-y-4 text-xs" style={{ color: C.ink }}>
            <p className="text-sm leading-relaxed">
              Inspired by the{' '}
              <a href="https://antievictionmap.com/" target="_blank" rel="noopener noreferrer"
                className="underline" style={{ color: C.ochre }}>Anti-Eviction Mapping Project</a>{' '}
              and{' '}
              <a href="https://www.displacementalert.org/" target="_blank" rel="noopener noreferrer"
                className="underline" style={{ color: C.ochre }}>NYC Displacement Alert Project</a>{' '}
              frameworks, adapted to Cincinnati open data. A simplified model — it uses fewer
              dimensions than those full methodologies (which add race, tenure, education, and
              language isolation). Combines housing vulnerability (who is at risk) with market
              pressure (what forces are acting) using only publicly available local data.
            </p>
            <div>
              <p className="font-semibold mb-1">Vulnerability score (0–100) — who is at risk</p>
              <p className="mb-1">Average of two components, each min-max normalized across all ~52 Cincinnati neighborhoods (0 = city minimum, 100 = city maximum):</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li><strong>Rent burden rate</strong> — % of renters paying &gt;30% of income on rent (ACS Census). Higher burden → higher score.</li>
                <li><strong>Median household income</strong> — ACS Census. Lower income → higher score (inverted).</li>
              </ul>
              <p className="mt-1 italic" style={{ color: C.muted }}>Scores are relative to other Cincinnati neighborhoods, not absolute national thresholds. A "stable" neighborhood may still have objectively high rent burden.</p>
            </div>
            <div>
              <p className="font-semibold mb-1">Pressure score (0–100) — what forces are acting</p>
              <p className="mb-1">Average of three components, same normalization:</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1">
                <li><strong>Permit volume trend</strong> — building permits (3-year rolling window vs. prior 3 years). Higher growth → higher score.</li>
                <li><strong>Tax abatement count</strong> — commercial CRA subsidies (tax abatements, TIF, LEED credits, below-market land sales). More city-backed investment → higher score.</li>
                <li><strong>Housing unit removal count</strong> — units removed via building permits. More removals → higher score.</li>
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
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

interface DisplacementTabProps {
  onTabChange?: (tab: import('../../types').TabId) => void;
}

const DisplacementTab: React.FC<DisplacementTabProps> = ({ onTabChange }) => {
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
  const [glossaryOpen, setGlossaryOpen] = useState(false)

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
      $select: 'organization_legal_name,project_name,community_council_neighborhood,est_program_total_value,program_type,project_type,approved_by_city_council',
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
    const byDev = new Map<string, {
      total: number; projects: Set<string>; neighborhoods: Set<string>
      programTypes: Set<string>; projectTypes: Set<string>; approvalYears: number[]
    }>()
    for (const r of craAllData) {
      if (!r.organization_legal_name) continue
      const dev = r.organization_legal_name.trim()
      if (!dev) continue
      if (!byDev.has(dev)) byDev.set(dev, {
        total: 0, projects: new Set(), neighborhoods: new Set(),
        programTypes: new Set(), projectTypes: new Set(), approvalYears: [],
      })
      const entry = byDev.get(dev)!
      entry.total += parseFloat(r.est_program_total_value || '0') || 0
      if (r.project_name) entry.projects.add(r.project_name)
      const nbhd = r.community_council_neighborhood
      if (nbhd && nbhd !== 'N/A') entry.neighborhoods.add(nbhd)
      if (r.program_type && r.program_type !== 'N/A') entry.programTypes.add(r.program_type.trim())
      if (r.project_type && r.project_type !== 'N/A') entry.projectTypes.add(r.project_type.trim())
      if (r.approved_by_city_council) {
        const yr = new Date(r.approved_by_city_council).getFullYear()
        if (yr > 1900) entry.approvalYears.push(yr)
      }
    }
    return [...byDev.entries()]
      .map(([name, data]) => {
        const orgType = inferOrgType(name)
        const isAffordableHousing =
          [...data.programTypes].some(pt => AFFORDABLE_PROGRAM_TYPES.has(pt.toUpperCase())) &&
          orgType === 'Nonprofit / Gov'
        return {
          name,
          total: data.total,
          projectCount: data.projects.size,
          neighborhoods: [...data.neighborhoods].sort().join(', '),
          useType: normalizeUseType(data.projectTypes),
          sinceYear: data.approvalYears.length > 0 ? Math.min(...data.approvalYears) : null,
          isAffordableHousing,
        }
      })
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
  function rentBurdenStyle(val: number | null): React.CSSProperties {
    if (val === null) return { color: C.muted }
    if (val >= 50) return { color: C.brick, fontWeight: 600 }
    if (val >= 35) return { color: C.ink, fontWeight: 500 }
    return { color: C.ink }
  }

  function incomeStyle(val: number | null): React.CSSProperties {
    if (val === null) return { color: C.muted }
    if (val < 30000) return { color: C.brick, fontWeight: 600 }
    if (val < 50000) return { color: C.ink, fontWeight: 500 }
    return { color: C.ink }
  }

  function permitYoYStyle(val: number | null): React.CSSProperties {
    if (val === null) return { color: C.muted }
    if (val > 50) return { color: C.brick, fontWeight: 600 }
    if (val > 20) return { color: C.ink, fontWeight: 500 }
    if (val < 0) return { color: C.hill }
    return { color: C.ink }
  }

  // Suppress unused warning for craNeighborhoodMap (used for future features)
  void craNeighborhoodMap

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="px-8 py-2 space-y-0">

      {/* Section sub-tabs */}
      <div className="page-paper rounded-md mb-5" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <div className="flex flex-wrap">
          {([
            { id: 'displacement', label: 'Displacement Index' },
            { id: 'owner',        label: 'Owner / Developer Search' },
            { id: 'zoning',       label: 'Zoning Reform Tracker' },
          ] as const).map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className="flex-1 px-4 py-3 text-sm font-medium transition"
              style={
                activeSection === sec.id
                  ? { borderBottom: `2px solid ${C.brick}`, color: C.ink }
                  : { borderBottom: '2px solid transparent', color: C.muted }
              }
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
      <div className="mb-8">
        <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>Housing Justice</div>
        <div className="serif mb-2" style={{ fontSize: 32, fontWeight: 500, color: C.ink, lineHeight: 1.1 }}>
          Which neighborhoods are most at risk<br />of displacement?
        </div>
        <p className="text-[14px] leading-relaxed mb-5" style={{ color: C.muted, maxWidth: 680 }}>
          A two-axis model combining housing vulnerability (who is economically exposed) with market pressure
          (what forces are acting). Neighborhoods scoring above the city midpoint on <em>both</em> axes need
          the most urgent attention.
        </p>

        {/* City-wide summary stat row */}
        {!isLoading && scoredRecords.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-5">
            {([
              { phase: 'active'      as const, label: 'At active risk',       color: C.brick },
              { phase: 'vulnerable'  as const, label: 'Vulnerable',            color: C.ochre },
              { phase: 'gentrifying' as const, label: 'Development pressure',  color: C.hill  },
              { phase: 'stable'      as const, label: 'Stable',                color: C.river },
            ]).map(({ phase, label, color }) => (
              <div
                key={phase}
                className="page-paper rounded-md px-4 py-3 cursor-pointer transition-colors"
                style={{
                  borderLeft: `3px solid ${color}`,
                  minWidth: 130,
                  background: filter === phase ? C.limestone : C.paper,
                }}
                onClick={() => setFilter(filter === phase ? 'all' : phase)}
              >
                <div className="serif font-medium leading-none" style={{ fontSize: 32, color }}>{phaseCounts[phase]}</div>
                <div className="text-[11px] mt-1" style={{ color: C.muted }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        <MethodologyNote />
      </div>

      {/* Error notices */}
      {(anyError || errorUnits || errorCRA) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {errorSNA && <span className="text-xs px-2 py-1 rounded" style={{ background: C.brickLight, color: C.brick, border: `1px solid ${C.brick}` }}>SNA boundaries unavailable</span>}
          {errorCensus && <span className="text-xs px-2 py-1 rounded" style={{ background: C.brickLight, color: C.brick, border: `1px solid ${C.brick}` }}>Census data unavailable</span>}
          {errorPermits && <span className="text-xs px-2 py-1 rounded" style={{ background: C.brickLight, color: C.brick, border: `1px solid ${C.brick}` }}>Permit data unavailable</span>}
          {errorAbatements && <span className="text-xs px-2 py-1 rounded" style={{ background: C.brickLight, color: C.brick, border: `1px solid ${C.brick}` }}>Abatement data unavailable</span>}
          {errorPLAP && <span className="text-xs px-2 py-1 rounded" style={{ background: C.brickLight, color: C.brick, border: `1px solid ${C.brick}` }}>PLAP data unavailable</span>}
          {errorUnits && <span className="text-xs px-2 py-1 rounded" style={{ background: C.hillLight, color: C.hill, border: `1px solid ${C.hill}` }}>Unit activity data limited</span>}
          {errorCRA && <span className="text-xs px-2 py-1 rounded" style={{ background: C.hillLight, color: C.hill, border: `1px solid ${C.hill}` }}>CRA subsidy data limited</span>}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="flex flex-col gap-3 mb-6">
          <div className="h-8 rounded animate-pulse w-48" style={{ background: C.limestone }} />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 rounded animate-pulse" style={{ background: C.limestone }} />
          ))}
        </div>
      )}

      {/* Main layout: scatter chart + detail below */}
      {!isLoading && scoredRecords.length > 0 && (
        <div className="flex flex-col gap-6">
          <CityScatterChart
            records={scoredRecords}
            selected={selected}
            onSelect={setSelected}
            filter={filter}
            onTabChange={onTabChange}
          />

          {!selected && (
            <div
              className="flex items-center justify-center h-28 rounded-md"
              style={{ border: `1px dashed ${C.rule}` }}
            >
              <p className="text-sm" style={{ color: C.muted }}>
                Click a neighborhood dot or name above to view details
              </p>
            </div>
          )}

          {selected && selectedRecord && (
              <div className="page-paper rounded-md overflow-hidden" style={{ border: `1px solid ${C.rule}` }}>
                {/* Detail header */}
                <div
                  className="px-5 py-4"
                  style={{
                    background: PHASE_CONFIG[selectedRecord.phase].bgColor,
                    borderBottom: `1px solid ${PHASE_CONFIG[selectedRecord.phase].borderColor}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold serif" style={{ color: C.ink }}>{selectedRecord.name}</h2>
                      <div className="mt-1">
                        <PhaseBadge phase={selectedRecord.phase} />
                      </div>
                    </div>
                    <button
                      onClick={() => setSelected(null)}
                      className="p-1 rounded"
                      style={{ color: C.muted }}
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
                      <div
                        className="rounded-md px-4 py-3 space-y-2"
                        style={{ background: syn.bgColor, border: `1px solid ${syn.borderColor}` }}
                      >
                        <p className="text-sm font-semibold" style={{ color: syn.textColor }}>{syn.headline}</p>
                        <p className="text-xs leading-relaxed" style={{ color: C.ink }}>{syn.interpretation}</p>
                        <div className="pt-2 mt-1" style={{ borderTop: `1px solid ${syn.borderColor}` }}>
                          <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: syn.textColor }}>What you can do</p>
                          <p className="text-[13px] leading-relaxed font-medium" style={{ color: C.ink }}>{syn.action}</p>
                        </div>
                        <div className="pt-2 mt-1" style={{ borderTop: `1px solid ${C.rule}` }}>
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
                    <div className="smallcaps mb-3" style={{ color: C.muted }}>Two-Axis Profile</div>
                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                      <QuadrantPlot record={selectedRecord} />
                      <div className="flex flex-col gap-3 flex-1 min-w-0">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>Vulnerability Score</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: C.limestone }}>
                              <div className="h-full rounded-full" style={{ width: `${selectedRecord.vulnerability ?? 0}%`, background: C.brick }} />
                            </div>
                            <span className="text-sm font-bold w-8 text-right" style={{ color: C.ink }}>
                              {selectedRecord.vulnerability !== null ? selectedRecord.vulnerability : 'N/A'}
                            </span>
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>Pressure Score</p>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: C.limestone }}>
                              <div className="h-full rounded-full" style={{ width: `${selectedRecord.pressure ?? 0}%`, background: C.river }} />
                            </div>
                            <span className="text-sm font-bold w-8 text-right" style={{ color: C.ink }}>
                              {selectedRecord.pressure !== null ? selectedRecord.pressure : 'N/A'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <hr style={{ borderColor: C.rule }} />

                  {/* Section 2: Vulnerability Factors */}
                  <div>
                    <div className="smallcaps mb-3" style={{ color: C.muted }}>Vulnerability Factors</div>
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm" style={{ color: C.muted }}>Rent Burden Rate</p>
                          <p className="text-xs" style={{ color: C.muted, opacity: 0.7 }}>% of renters paying &gt;30% of income on rent</p>
                        </div>
                        <span className="text-sm" style={rentBurdenStyle(selectedRecord.rentBurdenRate)}>
                          {selectedRecord.rentBurdenRate !== null
                            ? `${selectedRecord.rentBurdenRate.toFixed(1)}%`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm" style={{ color: C.muted }}>Median Household Income</p>
                          <p className="text-xs" style={{ color: C.muted, opacity: 0.7 }}>Cincinnati median ≈ $47,000</p>
                        </div>
                        <span className="text-sm" style={incomeStyle(selectedRecord.medianIncome)}>
                          {selectedRecord.medianIncome !== null
                            ? `$${selectedRecord.medianIncome.toLocaleString()}`
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                    {onTabChange && (
                      <button
                        onClick={() => onTabChange('neighborhoods')}
                        className="mt-3 text-xs font-medium hover:underline"
                        style={{ color: C.river }}
                      >
                        Full economic profile &amp; demographics for {selectedRecord.name} →
                      </button>
                    )}
                  </div>

                  <hr style={{ borderColor: C.rule }} />

                  {/* Section 3: Market Pressure Factors */}
                  <div>
                    <div className="smallcaps mb-3" style={{ color: C.muted }}>Market Pressure Factors</div>
                    <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm" style={{ color: C.muted }}>Permit Growth (3yr YoY)</p>
                          <p className="text-xs" style={{ color: C.muted, opacity: 0.7 }}>
                            {selectedRecord.recentPermitCount !== null
                              ? `${selectedRecord.recentPermitCount} recent permits`
                              : 'No recent permit data'}
                          </p>
                        </div>
                        <span className="text-sm" style={permitYoYStyle(selectedRecord.permitYoY)}>
                          {selectedRecord.permitYoY !== null
                            ? `${selectedRecord.permitYoY > 0 ? '+' : ''}${selectedRecord.permitYoY.toFixed(1)}%`
                            : 'N/A'}
                        </span>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm" style={{ color: C.muted }}>Tax Abatements</p>
                          <p className="text-xs" style={{ color: C.muted, opacity: 0.7 }}>Active developer subsidies</p>
                        </div>
                        <span className="text-sm font-medium" style={{ color: C.ink }}>{selectedRecord.abatementCount}</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm" style={{ color: C.muted }}>PLAP Blight Violations</p>
                          <p className="text-xs" style={{ color: C.muted, opacity: 0.7 }}>Complaints logged</p>
                        </div>
                        <span className="text-sm font-medium" style={{ color: C.ink }}>{selectedRecord.plapCount}</span>
                      </div>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-sm" style={{ color: C.muted }}>Housing Units Removed</p>
                          <p className="text-xs" style={{ color: C.muted, opacity: 0.7 }}>Total units removed via permits</p>
                        </div>
                        <span className="text-sm" style={{ color: selectedRecord.unitLossCount > 0 ? C.brick : C.ink, fontWeight: selectedRecord.unitLossCount > 0 ? 600 : undefined }}>
                          {selectedRecord.unitLossCount > 0 ? `−${selectedRecord.unitLossCount}` : '0'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <hr style={{ borderColor: C.rule }} />

                  {/* Section 4: Tax Abatement Accountability */}
                  <div>
                    <div className="smallcaps mb-1" style={{ color: C.muted }}>Tax Abatement Accountability</div>
                    <p className="text-xs mb-3" style={{ color: C.muted }}>
                      Cross-referencing properties receiving tax abatements against their PLAP blight violation history.
                    </p>

                    {loadingDetail && (
                      <div className="flex flex-col gap-2">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="h-8 rounded animate-pulse" style={{ background: C.limestone }} />
                        ))}
                      </div>
                    )}

                    {!loadingDetail && crossRefRows.length === 0 && (
                      <p className="text-sm italic" style={{ color: C.muted }}>
                        {detailAbatements.length === 0
                          ? 'No tax abatements found for this neighborhood.'
                          : 'Abatement addresses could not be cross-referenced.'}
                      </p>
                    )}

                    {!loadingDetail && crossRefRows.length > 0 && (
                      <>
                        <div
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md mb-3 text-sm font-semibold"
                          style={
                            violationCount > 0
                              ? { background: C.brickLight, color: C.brick, border: `1px solid ${C.brick}` }
                              : { background: C.hillLight, color: C.hill, border: `1px solid ${C.hill}` }
                          }
                        >
                          {violationCount > 0
                            ? `${violationCount} propert${violationCount === 1 ? 'y' : 'ies'} with subsidies and violations`
                            : 'No cross-referenced violations found'}
                        </div>

                        {showFuzzyNote && (
                          <p className="text-xs italic mb-3" style={{ color: C.muted }}>
                            Address-level cross-referencing uses fuzzy matching. Some matches may be missed due to address formatting differences.
                          </p>
                        )}

                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr style={{ background: C.limestone, borderBottom: `1px solid ${C.rule}` }}>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Address</th>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Abatement Type</th>
                                <th className="text-center py-2 px-2 font-semibold" style={{ color: C.muted }}>PLAP Violations</th>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {crossRefRows.slice(0, 30).map((row, i) => (
                                <tr key={i} style={{ borderBottom: `1px solid ${C.rule}`, background: i % 2 === 0 ? C.paper : C.limestone }}>
                                  <td className="py-1.5 px-2 max-w-[140px] truncate" style={{ color: C.ink }} title={row.address}>
                                    {row.address}
                                  </td>
                                  <td className="py-1.5 px-2" style={{ color: C.muted }}>{row.abatementType}</td>
                                  <td className="py-1.5 px-2 text-center" style={{ color: C.ink }}>{row.plapCount}</td>
                                  <td className="py-1.5 px-2">
                                    {row.hasViolations
                                      ? <span style={{ color: C.brick }} className="font-medium">Has Violations</span>
                                      : <span style={{ color: C.hill }}>Clean</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {crossRefRows.length > 30 && (
                            <p className="text-xs mt-1 text-center" style={{ color: C.muted }}>
                              Showing 30 of {crossRefRows.length} abatement records
                            </p>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <hr style={{ borderColor: C.rule }} />

                  {/* Section 5: Housing Units Removed */}
                  <div>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: C.ink }}>Housing Units Removed</h3>
                    <p className="text-xs mb-3" style={{ color: C.muted }}>
                      Building permits showing a net reduction in housing units in this neighborhood, with the permit applicant (owner or LLC) from the city record. Source: Cincinnati Housing Unit Activity.
                    </p>
                    {unitLossForNeighborhood.length === 0 ? (
                      <p className="text-sm italic" style={{ color: C.muted }}>No unit removal permits found for this neighborhood.</p>
                    ) : (
                      <>
                        <div
                          className="rounded-md px-3 py-2 mb-3 text-sm font-semibold inline-flex gap-2 items-center"
                          style={{ background: C.brickLight, color: C.brick, border: `1px solid ${C.brick}` }}
                        >
                          <span>⚠</span>
                          <span>{unitLossForNeighborhood.reduce((s, r) => s + (parseInt(r.units_removed, 10) || 0), 0)} units removed across {unitLossForNeighborhood.length} permits</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr style={{ background: C.limestone, borderBottom: `1px solid ${C.rule}` }}>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Address</th>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Permit Holder</th>
                                <th className="text-center py-2 px-2 font-semibold" style={{ color: C.muted }}>Units −</th>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {unitLossForNeighborhood.map((r, i) => (
                                <tr key={i} style={{ borderBottom: `1px solid ${C.rule}`, background: i % 2 === 0 ? C.paper : C.limestone }}>
                                  <td className="py-1.5 px-2 max-w-[130px] truncate" style={{ color: C.ink }} title={r.address}>{r.address}</td>
                                  <td className="py-1.5 px-2 max-w-[130px] truncate font-medium" style={{ color: C.muted }} title={r.title ?? ''}>{r.title || '—'}</td>
                                  <td className="py-1.5 px-2 text-center font-bold" style={{ color: C.brick }}>−{r.units_removed}</td>
                                  <td className="py-1.5 px-2" style={{ color: C.muted }}>{r.issued_date ? r.issued_date.slice(0, 8) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  <hr style={{ borderColor: C.rule }} />

                  {/* Section 6: Developer Subsidies */}
                  <div>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: C.ink }}>Developer Subsidies Approved Here</h3>
                    <p className="text-xs mb-3" style={{ color: C.muted }}>
                      City-approved commercial CRA subsidies for this neighborhood. Includes tax abatements, TIF grants, LEED credits, and below-market city land sales. Source: Commercial CRA Abatements.
                    </p>
                    {craForNeighborhood.length === 0 ? (
                      <p className="text-sm italic" style={{ color: C.muted }}>No CRA subsidies found for this neighborhood.</p>
                    ) : (
                      <>
                        <div
                          className="rounded-md px-3 py-2 mb-3 text-sm font-semibold inline-flex gap-2 items-center"
                          style={{ background: C.riverLight, color: C.riverDeep, border: `1px solid ${C.river}` }}
                        >
                          <span>${(craForNeighborhood.reduce((s, r) => s + (parseFloat(r.est_program_total_value || '0') || 0), 0) / 1_000_000).toFixed(2)}M in city subsidies approved</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr style={{ background: C.limestone, borderBottom: `1px solid ${C.rule}` }}>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Developer</th>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Project</th>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Type</th>
                                <th className="text-right py-2 px-2 font-semibold" style={{ color: C.muted }}>Value</th>
                                <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Approved</th>
                              </tr>
                            </thead>
                            <tbody>
                              {craForNeighborhood.slice(0, 20).map((r, i) => (
                                <tr key={i} style={{ borderBottom: `1px solid ${C.rule}`, background: i % 2 === 0 ? C.paper : C.limestone }}>
                                  <td className="py-1.5 px-2 font-medium max-w-[120px] truncate" style={{ color: C.ink }} title={r.organization_legal_name ?? ''}>{r.organization_legal_name || '—'}</td>
                                  <td className="py-1.5 px-2 max-w-[120px] truncate" style={{ color: C.muted }} title={r.project_name ?? ''}>{r.project_name || '—'}</td>
                                  <td className="py-1.5 px-2" style={{ color: C.muted }}>{r.program_type || '—'}</td>
                                  <td className="py-1.5 px-2 text-right font-medium" style={{ color: C.ink }}>
                                    {r.est_program_total_value && parseFloat(r.est_program_total_value) > 0
                                      ? `$${Math.round(parseFloat(r.est_program_total_value)).toLocaleString()}`
                                      : '—'}
                                  </td>
                                  <td className="py-1.5 px-2" style={{ color: C.muted }}>{r.approved_by_city_council ? r.approved_by_city_council.slice(0, 10) : '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  <hr style={{ borderColor: C.rule }} />

                  {/* Section 7: Demolition Orders */}
                  <div>
                    <h3 className="text-sm font-semibold mb-1" style={{ color: C.ink }}>Demolition Orders</h3>
                    <p className="text-xs mb-3" style={{ color: C.muted }}>
                      Active city demolition proceedings in this neighborhood. "Ready for Bid" means the property is actively being cleared for auction. Source: Cincinnati Code Enforcement.
                    </p>
                    {loadingDetail ? (
                      <div className="h-12 rounded animate-pulse" style={{ background: C.limestone }} />
                    ) : detailDemolitions.length === 0 ? (
                      <p className="text-sm italic" style={{ color: C.muted }}>No demolition orders found for this neighborhood.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr style={{ background: C.limestone, borderBottom: `1px solid ${C.rule}` }}>
                              <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Address</th>
                              <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Type</th>
                              <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Status</th>
                              <th className="text-left py-2 px-2 font-semibold" style={{ color: C.muted }}>Filed</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailDemolitions.map((d, i) => {
                              const isUrgent = (d.data_status_display ?? '').toLowerCase().includes('bid') || (d.data_status_display ?? '').toLowerCase().includes('nuisance')
                              return (
                                <tr key={i} style={{ borderBottom: `1px solid ${C.rule}`, background: i % 2 === 0 ? C.paper : C.limestone }}>
                                  <td className="py-1.5 px-2 max-w-[130px] truncate" style={{ color: C.ink }} title={d.full_address ?? ''}>{d.full_address || '—'}</td>
                                  <td className="py-1.5 px-2" style={{ color: C.muted }}>{d.sub_type_desc || '—'}</td>
                                  <td className="py-1.5 px-2">
                                    <span style={{ color: isUrgent ? C.brick : C.muted, fontWeight: isUrgent ? 600 : undefined }}>
                                      {d.data_status_display || '—'}
                                    </span>
                                  </td>
                                  <td className="py-1.5 px-2" style={{ color: C.muted }}>{d.entered_date ? d.entered_date.slice(0, 10) : '—'}</td>
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
      )}

      {/* Empty state after loading */}
      {!isLoading && scoredRecords.length === 0 && !anyError && (
        <div className="text-center py-16" style={{ color: C.muted }}>
          <p className="text-sm">No neighborhood data could be loaded. Please try refreshing the page.</p>
        </div>
      )}

      {/* CRA Developer Leaderboard */}
      {!isLoading && craLeaderboard.length > 0 && (() => {
        const topTotal = craLeaderboard[0]?.total ?? 0
        const fmtM = (v: number) =>
          v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v / 1000)}K`
        return (
        <div className="mt-12 pt-8" style={{ borderTop: `1px solid ${C.rule}` }}>
          {/* Editorial header */}
          <div className="flex items-baseline gap-3 mb-2">
            <span className="serif font-medium" style={{ fontSize: 28, color: C.ochre, lineHeight: 1 }}>02</span>
            <span className="smallcaps" style={{ color: C.muted, fontSize: 11, letterSpacing: '0.1em' }}>Who's Getting the Money</span>
          </div>
          <h2 className="serif font-medium leading-tight mb-3" style={{ fontSize: 30, letterSpacing: '-0.015em', color: C.ink, maxWidth: 700 }}>
            The top developer received{' '}
            <span style={{ color: C.brick }}>{fmtM(topTotal)}</span>{' '}
            in city subsidies — and not all of them build affordable units.
          </h2>
          <p className="serif mb-4" style={{ fontSize: 16, lineHeight: 1.65, color: C.muted, maxWidth: 680 }}>
            Developers ranked by total city subsidy value received — tax abatements, TIF grants, LEED
            credits, and below-market land sales approved by city council. Corporate entities, nonprofits,
            and land trusts use these subsidies very differently. The strategies inside these numbers differ.
          </p>

          {/* Collapsible glossary */}
          <div className="mb-5">
            <button
              onClick={() => setGlossaryOpen(o => !o)}
              className="text-[11px] flex items-center gap-1.5 rounded-sm px-2.5 py-1 transition"
              style={{
                border: `1px solid ${C.ochre}`,
                color: glossaryOpen ? C.paper : C.ochre,
                background: glossaryOpen ? C.ochre : 'transparent',
              }}
            >
              <span style={{ fontSize: 10 }}>ⓘ</span> What do these subsidy types mean?
            </button>
            {glossaryOpen && (
              <div className="mt-2 rounded-md p-4" style={{ background: C.limestone, border: `1px solid ${C.rule}` }}>
                <div className="grid gap-x-6 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                  {Object.entries(PROGRAM_TYPE_GLOSSARY).map(([term, def]) => (
                    <div key={term}>
                      <span className="text-[11px] font-bold" style={{ color: C.ink }}>{term}</span>
                      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: C.muted }}>{def}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] mt-3 italic" style={{ color: C.muted }}>
                  <strong>Civic pathway — Below Market Rate Sales:</strong> City-owned land sold below appraised value goes through the Port of Greater Cincinnati Development Authority. Community land trusts and nonprofits can submit competing bids.{' '}
                  <a href="https://www.cincinnatiport.org/" target="_blank" rel="noopener noreferrer" style={{ color: C.river }}>cincinnatiport.org →</a>
                </p>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="page-paper rounded-md overflow-hidden" style={{ border: `1px solid ${C.rule}` }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.rule}` }}>
                    <th className="text-left py-3 px-5" style={{ color: C.muted, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase' }}>Developer</th>
                    <th className="text-left py-3 px-4" style={{ color: C.muted, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase' }}>Org Type</th>
                    <th className="text-left py-3 px-4" style={{ color: C.muted, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase' }}>Use</th>
                    <th className="text-left py-3 px-4 hidden md:table-cell" style={{ color: C.muted, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase' }}>Neighborhoods</th>
                    <th className="text-right py-3 px-4 hidden sm:table-cell" style={{ color: C.muted, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase' }}>Est.</th>
                    <th className="text-right py-3 px-4" style={{ color: C.muted, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase' }}>Projects</th>
                    <th className="text-right py-3 px-5" style={{ color: C.muted, fontSize: 11, letterSpacing: '0.08em', fontWeight: 600, textTransform: 'uppercase' }}>Total Subsidy</th>
                  </tr>
                </thead>
                <tbody>
                  {craLeaderboard.map((entry) => {
                    const orgType = inferOrgType(entry.name)
                    const ts = ORG_TYPE_STYLE[orgType]
                    const isHigh = entry.total >= 1_000_000

                    // Use type badge style
                    const useStyle: React.CSSProperties =
                      entry.useType === 'Residential' ? { background: C.hillLight,  color: '#3d5527', border: `1px solid ${C.hill}` } :
                      entry.useType === 'Mixed Use'   ? { background: C.riverLight, color: C.riverDeep, border: `1px solid ${C.rule}` } :
                      entry.useType === 'Commercial'  ? { background: C.limestone,  color: C.muted, border: `1px solid ${C.rule}` } :
                                                        { background: C.limestone,  color: C.muted, border: `1px solid ${C.rule}` }

                    return (
                      <tr key={entry.name} style={{ borderBottom: `1px solid ${C.rule}` }}>
                        <td className="py-3 px-5">
                          <span className="font-semibold block leading-tight" style={{ color: C.ink }}>{entry.name}</span>
                          {entry.isAffordableHousing && (
                            <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-medium"
                              style={{ color: C.hill }}>
                              ✓ affordable housing program
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                            style={{ background: ts.bg, color: ts.color, border: `1px solid ${ts.border}` }}
                          >{orgType}</span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium" style={useStyle}>
                            {entry.useType}
                          </span>
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell text-xs max-w-xs truncate" style={{ color: C.muted }} title={entry.neighborhoods}>
                          {entry.neighborhoods || '—'}
                        </td>
                        <td className="py-3 px-4 text-right hidden sm:table-cell text-xs" style={{ color: C.muted }}>
                          {entry.sinceYear ?? '—'}
                        </td>
                        <td className="py-3 px-4 text-right" style={{ color: C.muted }}>{entry.projectCount}</td>
                        <td className="py-3 px-5 text-right font-bold" style={{ color: isHigh ? C.brick : C.ink }}>
                          {fmtM(entry.total)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-5 py-3" style={{ borderTop: `1px solid ${C.rule}` }}>
              <p className="text-xs" style={{ color: C.muted }}>
                Source: Cincinnati Open Data — Commercial CRA Abatements (m76i-p5p9). Values are estimated program totals as reported at time of city council approval. "Est." shows earliest recorded city council approval year. "✓ affordable housing program" flags organizations whose subsidies include HOME or CDBG funds, which are federally required to benefit low- and moderate-income households. Showing top 25 by reported subsidy value.
              </p>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Sources footnote */}
      <p className="serif italic text-[12px] pt-6 mt-4" style={{ color: C.muted, borderTop: `1px solid ${C.rule}` }}>
        Sources: Cincinnati Open Data — Building Permits (uhjb-xac9), Tax Abatements (tkp7-yf64), PLAP — Problem Landlord List (pk9w-99n6), Neighborhood Boundaries (CAGIS); U.S. Census Bureau, ACS 5-Year Estimates (income, rent, demographics); HUD Subsidized Households (public/data/hud_affordable_housing.json); Connected Communities Zoning Reform Tracker data (City of Cincinnati Planning Dept.).
      </p>

      </>}

    </div>
  )
}

export default DisplacementTab
