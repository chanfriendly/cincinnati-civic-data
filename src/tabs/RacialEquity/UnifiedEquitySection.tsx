/**
 * UnifiedEquitySection — Combined racial equity + mortgage lending panel.
 *
 * Merges RacialEquitySection (ACS) and MortgageLendingSection (HMDA) into one
 * component with three selectable views:
 *   A) Equity Gap Chart  — diverging bars from White Non-Hispanic baseline
 *   B) Profile Grid      — compact 4×4 matrix (groups × metrics)
 *   C) Opportunity Chain — income → homeownership → mortgage as linked stages
 *
 * Terminology: "White Non-Hispanic (White NH)" on first prose use, then "White NH".
 * This follows AP Style / CFPB HMDA conventions.
 *
 * TRANSPLANT NOTE: Same pattern as Section.tsx — wrap in a tab shell and wire
 * into App.tsx to promote this to its own tab.
 *
 * Data sources:
 *   ACS:  public/data/neighborhood_racial_equity.json  (build_racial_equity.py)
 *   HMDA: public/data/neighborhood_hmda.json           (build_hmda.py)
 */

import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import {
  fetchNeighborhoodRacialEquityStats,
  fetchNeighborhoodHMDAStats,
  stripNeighborhoodName,
} from '../../utils/api';
import type { NeighborhoodRacialEquityStats, NeighborhoodHMDAStats } from '../../types';
import { DataCard } from '../../components/ui';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Journalistic first-use form (AP Style). Subsequent uses: "White NH". */
const WHITE_NH_FULL = 'White Non-Hispanic (White NH)';

interface GroupData {
  key: 'black' | 'white' | 'asian' | 'hispanic';
  /** Short label used in charts and compact contexts. */
  shortLabel: string;
  color: string;
  income: number | null;
  poverty: number | null;
  homeownership: number | null;
  mortgageApproval: number | null;
  mortgageTotal: number | null;
  popPct: number | null;
}

const GROUP_CONFIG: Pick<GroupData, 'key' | 'shortLabel' | 'color'>[] = [
  { key: 'black',    shortLabel: 'Black',    color: '#1A4A6B' },
  { key: 'white',    shortLabel: 'White NH', color: '#2E7D5A' },
  { key: 'asian',    shortLabel: 'Asian',    color: '#8B5CF6' },
  { key: 'hispanic', shortLabel: 'Hispanic', color: '#D97706' },
];

// ── Data assembly ─────────────────────────────────────────────────────────────

function buildGroups(
  acs: NeighborhoodRacialEquityStats,
  hmda: NeighborhoodHMDAStats | null
): GroupData[] {
  const total = acs.totalPop ?? 1;
  return GROUP_CONFIG.map(cfg => {
    const k = cfg.key;
    const popField = { black: acs.popBlack, white: acs.popWhiteNH, asian: acs.popAsian, hispanic: acs.popHispanic }[k];
    return {
      ...cfg,
      income:          { black: acs.medIncomeBlack,     white: acs.medIncomeWhiteNH,    asian: acs.medIncomeAsian,    hispanic: acs.medIncomeHispanic    }[k] ?? null,
      poverty:         { black: acs.povertyRateBlack,   white: acs.povertyRateWhiteNH,  asian: acs.povertyRateAsian,  hispanic: acs.povertyRateHispanic  }[k] ?? null,
      homeownership:   { black: acs.homeownerRateBlack, white: acs.homeownerRateWhiteNH, asian: acs.homeownerRateAsian, hispanic: acs.homeownerRateHispanic }[k] ?? null,
      mortgageApproval: hmda ? (hmda[k]?.approvalRate ?? null) : null,
      mortgageTotal:    hmda ? (hmda[k]?.total ?? null) : null,
      popPct: popField != null && total > 0 ? Math.round((popField / total) * 1000) / 10 : null,
    };
  });
}

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtIncome = (v: number | null) => v == null ? '—' : `$${(v / 1000).toFixed(0)}k`;
const fmtPct    = (v: number | null) => v == null ? '—' : `${v.toFixed(1)}%`;
const fmtGap    = (v: number, suffix: string) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}${suffix}`;

// ── View A: Equity Gap Chart ──────────────────────────────────────────────────
// Each metric shown as a mini diverging BarChart.
// White NH = 0 (reference line). Red = worse, group color = better.

interface MetricDef {
  key: string;
  label: string;
  whiteRef: (w: GroupData) => number | null;
  value: (g: GroupData) => number | null;
  /** gap = value - white_ref, BUT for income: ¢ per $1 relative (not absolute $) */
  gap: (g: GroupData, w: GroupData) => number | null;
  fmtGap: (v: number) => string;
  fmtRef: (w: GroupData) => string;
  domain: [number, number];
  /** true = positive gap means the group is BETTER than White NH */
  betterPositive: boolean;
}

const METRICS: MetricDef[] = [
  {
    key: 'income', label: 'Median Income',
    whiteRef: w => w.income,
    value:    g => g.income,
    gap: (g, w) => (g.income != null && w.income != null && w.income > 0)
      ? +((g.income / w.income * 100) - 100).toFixed(1) : null,
    fmtGap: v => `${fmtGap(v, '¢')} per $1`,
    fmtRef: w => `${fmtIncome(w.income)} (White NH)`,
    domain: [-80, 25],
    betterPositive: true,
  },
  {
    key: 'poverty', label: 'Poverty Rate',
    whiteRef: w => w.poverty,
    value:    g => g.poverty,
    gap: (g, w) => (g.poverty != null && w.poverty != null)
      ? +(g.poverty - w.poverty).toFixed(1) : null,
    fmtGap: v => `${fmtGap(v, 'pp')}`,
    fmtRef: w => `${fmtPct(w.poverty)} (White NH) · higher is worse`,
    domain: [-15, 35],
    betterPositive: false, // positive = more poverty = worse
  },
  {
    key: 'homeownership', label: 'Homeownership Rate',
    whiteRef: w => w.homeownership,
    value:    g => g.homeownership,
    gap: (g, w) => (g.homeownership != null && w.homeownership != null)
      ? +(g.homeownership - w.homeownership).toFixed(1) : null,
    fmtGap: v => `${fmtGap(v, 'pp')}`,
    fmtRef: w => `${fmtPct(w.homeownership)} (White NH)`,
    domain: [-30, 20],
    betterPositive: true,
  },
  {
    key: 'mortgage', label: 'Mortgage Approval',
    whiteRef: w => w.mortgageApproval,
    value:    g => g.mortgageApproval,
    gap: (g, w) => (g.mortgageApproval != null && w.mortgageApproval != null)
      ? +(g.mortgageApproval - w.mortgageApproval).toFixed(1) : null,
    fmtGap: v => `${fmtGap(v, 'pp')}`,
    fmtRef: w => `${fmtPct(w.mortgageApproval)} (White NH) · HMDA 2022`,
    domain: [-35, 10],
    betterPositive: true,
  },
];

function GapView({ groups }: { groups: GroupData[] }) {
  const white = groups.find(g => g.key === 'white')!;
  const nonWhite = groups.filter(g => g.key !== 'white');

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500">
        All gaps shown relative to{' '}<span className="font-medium text-gray-700">{WHITE_NH_FULL}</span>{' '}
        residents (center line = 0).{' '}
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-2.5 rounded-sm inline-block bg-red-400 opacity-80" />
          worse than White NH
        </span>{' · '}
        <span className="inline-flex items-center gap-1">
          <span className="w-3 h-2.5 rounded-sm inline-block bg-blue-400 opacity-80" />
          better than White NH
        </span>
      </p>

      {METRICS.map(m => {
        const whiteVal = m.whiteRef(white);
        const chartData = nonWhite
          .map(g => ({ name: g.shortLabel, gap: m.gap(g, white), color: g.color }))
          .filter(d => d.gap != null) as { name: string; gap: number; color: string }[];

        if (chartData.length === 0) return null;

        return (
          <div key={m.key} className="bg-gray-50 rounded-lg p-3">
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-700">{m.label}</span>
              {whiteVal != null && (
                <span className="text-xs text-gray-400">{m.fmtRef(white)}</span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={chartData.length * 30 + 20}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 64, right: 64, top: 4, bottom: 4 }}>
                <XAxis type="number" domain={m.domain} hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={60} />
                <Tooltip
                  formatter={(v: number) => [m.fmtGap(v), 'Gap from White NH']}
                  contentStyle={{ fontSize: '12px' }}
                />
                <ReferenceLine x={0} stroke="#9CA3AF" strokeWidth={1.5} />
                <Bar dataKey="gap" radius={[2, 2, 2, 2]}
                     label={{ position: 'right', fontSize: 11, formatter: (v: number) => m.fmtGap(v) }}>
                  {chartData.map((d, i) => {
                    const isGood = m.betterPositive ? d.gap >= 0 : d.gap <= 0;
                    return <Cell key={i} fill={isGood ? d.color : '#EF4444'} opacity={0.8} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

// ── View B: Profile Grid ──────────────────────────────────────────────────────
// 4×4 matrix: groups (columns) × metrics (rows).
// Cell shading = relative performance within each metric's range.

function ProfileGrid({ groups, hmdaSource }: { groups: GroupData[]; hmdaSource: string | null }) {
  const white = groups.find(g => g.key === 'white')!;

  const rows: { label: string; note: string; getValue: (g: GroupData) => number | null; fmt: (v: number | null) => string; max: number; higherBetter: boolean; gapFmt: (gap: number) => string }[] = [
    { label: 'Median Income',      note: 'ACS 2022', getValue: g => g.income,         fmt: fmtIncome, max: 120000, higherBetter: true,  gapFmt: v => `${v >= 0 ? '+' : ''}${(v/1000).toFixed(0)}k` },
    { label: 'Poverty Rate',       note: 'ACS 2022', getValue: g => g.poverty,         fmt: fmtPct,    max: 60,     higherBetter: false, gapFmt: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp` },
    { label: 'Homeownership',      note: 'ACS 2022', getValue: g => g.homeownership,   fmt: fmtPct,    max: 90,     higherBetter: true,  gapFmt: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp` },
    { label: 'Mortgage Approval',  note: 'HMDA 2022', getValue: g => g.mortgageApproval, fmt: fmtPct,  max: 100,    higherBetter: true,  gapFmt: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp` },
  ];

  return (
    <div>
      <p className="text-xs text-gray-500 mb-3">
        Scan across a row to compare groups on one metric.
        Scan down a column to see a group's full economic profile.
        All gaps are relative to <span className="font-medium">{WHITE_NH_FULL}</span> residents.
      </p>

      {/* Column headers */}
      <div className="grid gap-1.5 mb-1" style={{ gridTemplateColumns: '110px repeat(4, 1fr)' }}>
        <div />
        {groups.map(g => (
          <div key={g.key} className="text-center">
            <div className="text-xs font-semibold pb-1 border-b-2" style={{ color: g.color, borderColor: g.color }}>
              {g.shortLabel}
            </div>
            {g.popPct != null && (
              <div className="text-xs text-gray-400 mt-1">{g.popPct}% of pop.</div>
            )}
          </div>
        ))}
      </div>

      {/* Metric rows */}
      <div className="space-y-1.5 mt-2">
        {rows.map(row => {
          const whiteVal = row.getValue(white);
          return (
            <div key={row.label} className="grid gap-1.5 items-center" style={{ gridTemplateColumns: '110px repeat(4, 1fr)' }}>
              {/* Row label */}
              <div className="pr-2">
                <div className="text-xs font-semibold text-gray-700 leading-tight">{row.label}</div>
                <div className="text-xs text-gray-400">{row.note}</div>
              </div>
              {/* Cells */}
              {groups.map(g => {
                const val = row.getValue(g);
                const isWhite = g.key === 'white';
                const gap = val != null && whiteVal != null ? +(val - whiteVal).toFixed(1) : null;
                const relPct = val != null ? Math.round((val / row.max) * 100) : 0;
                const isGood = gap == null ? null : row.higherBetter ? gap >= 0 : gap <= 0;
                const borderColor = isWhite ? '#E5E7EB' : isGood ? g.color + '66' : '#FECACA';

                return (
                  <div key={g.key} className="rounded-lg p-2 text-center"
                       style={{ background: isWhite ? '#F9FAFB' : isGood === true ? g.color + '18' : isGood === false ? '#FEF2F2' : '#F9FAFB', border: `1px solid ${borderColor}` }}>
                    <div className="text-sm font-bold" style={{ color: isWhite ? '#374151' : g.color }}>
                      {row.fmt(val)}
                    </div>
                    {!isWhite && gap != null && (
                      <div className="text-xs mt-0.5" style={{ color: isGood ? '#15803D' : '#DC2626' }}>
                        {row.gapFmt(gap)}
                      </div>
                    )}
                    {isWhite && <div className="text-xs text-gray-400 mt-0.5">baseline</div>}
                    {/* Mini bar */}
                    <div className="h-1 bg-gray-200 rounded mt-1.5 overflow-hidden">
                      <div className="h-full rounded" style={{ width: `${relPct}%`, background: g.color, opacity: 0.7 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {hmdaSource === 'county_fallback' && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-3">
          ⚠ Mortgage data shows Hamilton County averages — insufficient tract-level data for this neighborhood.
        </p>
      )}
    </div>
  );
}

// ── View C: Opportunity Chain ─────────────────────────────────────────────────
// Income/Poverty → Homeownership → Mortgage Approval as linked stages.
// Emphasizes how disadvantage at each stage feeds into the next.

function ChainBar({ groups, getValue, fmt, max }: {
  groups: GroupData[];
  getValue: (g: GroupData) => number | null;
  fmt: (v: number | null) => string;
  max: number;
}) {
  return (
    <div className="space-y-1.5">
      {groups.map(g => {
        const val = getValue(g);
        const pct = val != null ? Math.round((val / max) * 100) : 0;
        return (
          <div key={g.key} className="flex items-center gap-2">
            <div className="text-xs text-gray-500 flex-shrink-0" style={{ width: 56, textAlign: 'right' }}>{g.shortLabel}</div>
            <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
              <div className="h-full rounded" style={{ width: `${pct}%`, background: g.color, opacity: 0.85 }} />
            </div>
            <div className="text-xs font-semibold flex-shrink-0" style={{ width: 38, color: g.color }}>{fmt(val)}</div>
          </div>
        );
      })}
    </div>
  );
}

function OpportunityChain({ groups }: { groups: GroupData[] }) {
  const white = groups.find(g => g.key === 'white')!;
  const black = groups.find(g => g.key === 'black')!;

  const incomeGap = (white.income != null && black.income != null && white.income > 0)
    ? Math.round(black.income / white.income * 100) : null;
  const hoGap = (white.homeownership != null && black.homeownership != null)
    ? +(white.homeownership - black.homeownership).toFixed(1) : null;
  const mortGap = (white.mortgageApproval != null && black.mortgageApproval != null)
    ? +(white.mortgageApproval - black.mortgageApproval).toFixed(1) : null;

  return (
    <div>
      {/* Headline */}
      <div className="bg-gray-900 text-white rounded-xl p-4 mb-5">
        <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Key finding</div>
        <p className="text-sm font-medium leading-snug">
          {incomeGap != null
            ? <>Black residents earn <span className="text-yellow-300 font-bold">{incomeGap}¢ per $1</span> earned by {WHITE_NH_FULL} residents</>
            : <>Income data unavailable</>
          }
          {mortGap != null
            ? <> — and face a <span className="text-yellow-300 font-bold">{mortGap.toFixed(1)}pp gap</span> in mortgage approval. Poverty and homeownership disparities connect these two outcomes.</>
            : <>.</>
          }
        </p>
      </div>

      {/* Three-stage chain */}
      <div className="grid grid-cols-3 gap-0 items-stretch">

        {/* Stage 1: Income */}
        <div className="border border-gray-200 rounded-l-xl p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Stage 1</div>
          <div className="text-sm font-bold text-gray-800 mb-3">Income</div>
          <ChainBar groups={groups} getValue={g => g.income} fmt={fmtIncome} max={130000} />
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="text-xs text-gray-500 mb-1.5">Poverty rate</div>
            <ChainBar groups={groups} getValue={g => g.poverty} fmt={fmtPct} max={70} />
          </div>
        </div>

        {/* Arrow + Stage 2 label */}
        <div className="flex items-stretch">
          <div className="flex items-center justify-center w-4 flex-shrink-0">
            <div className="text-gray-300 text-xs">▶</div>
          </div>
          <div className="flex-1 border-t border-b border-gray-200 p-4">
            <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Stage 2</div>
            <div className="text-sm font-bold text-gray-800 mb-3">Home Equity</div>
            <ChainBar groups={groups} getValue={g => g.homeownership} fmt={fmtPct} max={90} />
            <p className="text-xs text-gray-400 mt-3">
              Homeownership is the primary wealth-building vehicle for most families.
            </p>
          </div>
          <div className="flex items-center justify-center w-4 flex-shrink-0">
            <div className="text-gray-300 text-xs">▶</div>
          </div>
        </div>

        {/* Stage 3: Mortgage */}
        <div className="border border-gray-200 rounded-r-xl p-4">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Stage 3</div>
          <div className="text-sm font-bold text-gray-800 mb-3">Credit Access</div>
          {black.mortgageApproval != null
            ? <ChainBar groups={groups} getValue={g => g.mortgageApproval} fmt={fmtPct} max={100} />
            : <p className="text-xs text-gray-400 italic">Run build_hmda.py to populate mortgage data.</p>
          }
          <p className="text-xs text-gray-400 mt-3">Approval rates from CFPB HMDA 2022, all loan types.</p>
        </div>

      </div>

      {/* Gap summary stats */}
      <div className="grid grid-cols-3 gap-1.5 mt-3">
        {[
          { label: 'Income gap', value: incomeGap != null ? `${incomeGap}¢ per $1` : '—', note: 'Black vs. White NH' },
          { label: 'Homeownership gap', value: hoGap != null ? `${hoGap > 0 ? '+' : ''}${hoGap}pp` : '—', note: 'White NH minus Black' },
          { label: 'Mortgage gap', value: mortGap != null ? `${mortGap.toFixed(1)}pp` : '—', note: 'White NH approval lead' },
        ].map(stat => (
          <div key={stat.label} className="bg-red-50 border border-red-100 rounded-lg p-3 text-center">
            <div className="text-lg font-bold" style={{ color: '#1A4A6B' }}>{stat.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{stat.label}</div>
            <div className="text-xs text-gray-400">{stat.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface UnifiedEquitySectionProps {
  neighborhood: string;
}

type ViewMode = 'gap' | 'grid' | 'chain';

const VIEWS: { id: ViewMode; label: string; desc: string }[] = [
  { id: 'gap',   label: 'Compare gaps',   desc: 'Bars showing how each racial group\'s income, poverty, homeownership, and mortgage approval compare to the White non-Hispanic average in this neighborhood.' },
  { id: 'grid',  label: 'Full breakdown', desc: 'Side-by-side grid of all four metrics across all racial groups — scan across a row to compare groups, or down a column to see one group\'s full profile.' },
  { id: 'chain', label: 'Wealth pathway', desc: 'Traces how income leads to homeownership, which leads to mortgage access — three linked stages of economic mobility shown as connected steps.' },
];

export default function UnifiedEquitySection({ neighborhood }: UnifiedEquitySectionProps) {
  const [acsData, setAcsData] = useState<NeighborhoodRacialEquityStats | null>(null);
  const [hmdaData, setHmdaData] = useState<NeighborhoodHMDAStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [acsNotBuilt, setAcsNotBuilt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('grid');

  useEffect(() => {
    setLoading(true);
    setAcsData(null);
    setHmdaData(null);
    setError(null);
    setAcsNotBuilt(false);

    const key = stripNeighborhoodName(neighborhood);

    Promise.all([
      fetchNeighborhoodRacialEquityStats().then(map => {
        if (map.size === 0) { setAcsNotBuilt(true); return; }
        setAcsData(map.get(key) ?? null);
      }),
      fetchNeighborhoodHMDAStats().then(map => {
        if (map.size === 0) return;
        setHmdaData(map.get(key) ?? null);
      }),
    ])
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [neighborhood]);

  const groups = useMemo(
    () => (acsData ? buildGroups(acsData, hmdaData) : null),
    [acsData, hmdaData]
  );

  const activeView = VIEWS.find(v => v.id === view)!;

  // ── Not built ──────────────────────────────────────────────────────────────
  if (acsNotBuilt) {
    return (
      <DataCard title="Racial Equity & Mortgage Lending" loading={false} error={null}>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">⚙️ Equity data not yet generated</p>
          <pre className="bg-amber-100 rounded p-2 text-xs font-mono overflow-x-auto">python3 scripts/build_racial_equity.py</pre>
          <p>Then optionally generate mortgage lending data:</p>
          <pre className="bg-amber-100 rounded p-2 text-xs font-mono overflow-x-auto">python3 scripts/build_hmda.py</pre>
        </div>
      </DataCard>
    );
  }

  if (!loading && !error && acsData === null) {
    return (
      <DataCard title="Racial Equity & Mortgage Lending" loading={false} error={null}>
        <p className="text-sm text-gray-500">No equity data found for {neighborhood}.</p>
      </DataCard>
    );
  }

  return (
    <DataCard
      title="Racial Equity & Mortgage Lending"
      loading={loading}
      error={error}
      attribution={{
        datasetName: 'U.S. Census ACS 5-Year 2022 (B03002, B19013, B17001, B25003) · CFPB HMDA LAR 2022',
        lastUpdated: acsData?.asOf ?? null,
      }}
    >
      {groups && (
        <div>
          {/* View tab switcher */}
          <div className="flex gap-1.5 mb-1.5">
            {VIEWS.map(v => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors"
                style={{
                  background: view === v.id ? '#1A4A6B' : '#F3F4F6',
                  color: view === v.id ? 'white' : '#374151',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mb-4 italic">{activeView.desc}</p>

          {/* Population composition pill bar */}
          <div className="mb-4">
            {acsData?.totalPop != null && (
              <div className="text-xs text-gray-500 mb-1">
                Population · {acsData.totalPop.toLocaleString()} residents
              </div>
            )}
            <div className="flex h-3.5 rounded overflow-hidden w-full bg-gray-100">
              {groups.filter(g => g.popPct != null && g.popPct > 0).map(g => (
                <div key={g.key} style={{ width: `${g.popPct}%`, background: g.color }}
                     title={`${g.shortLabel} ${g.popPct}%`} />
              ))}
            </div>
            <div className="flex gap-3 mt-1 flex-wrap">
              {groups.filter(g => g.popPct != null && g.popPct > 0.5).map(g => (
                <span key={g.key} className="text-xs text-gray-500">
                  <span style={{ color: g.color }}>■</span> {g.shortLabel} {g.popPct}%
                </span>
              ))}
            </div>
          </div>

          {/* Active view */}
          {view === 'gap'   && <GapView groups={groups} />}
          {view === 'grid'  && <ProfileGrid groups={groups} hmdaSource={hmdaData?.source ?? null} />}
          {view === 'chain' && <OpportunityChain groups={groups} />}

          {/* Shared methodology note */}
          <div className="mt-5 pt-4 border-t border-gray-100 text-xs text-gray-400 space-y-1">
            <p>
              Race groups follow Census B03002 categories.{' '}
              <strong>{WHITE_NH_FULL}</strong> = White alone, not Hispanic or Latino —
              the primary comparison group consistent with Urban League{' '}
              <a href="https://ulgswo.org/state-of-black-cincinnati" target="_blank" rel="noopener noreferrer"
                 className="underline text-[#1A4A6B]">State of Black Cincinnati (2024)</a> framing.
            </p>
            <p>
              Income is a population-weighted average of tract-level medians (an approximation).
              Poverty and homeownership rates are computed from raw counts and are exact.
              "—" indicates suppressed data (fewer than 15 sample households in this neighborhood's tracts).
            </p>
            {hmdaData && (
              <p>
                Mortgage data: CFPB HMDA LAR 2022, all loan types (purchase, refinance, home improvement).
                Rates suppressed when fewer than 10 applications. Source:{' '}
                {hmdaData.source === 'tract_level' ? 'tract-level aggregation.' : 'Hamilton County averages (insufficient local sample).'}
              </p>
            )}
          </div>
        </div>
      )}
    </DataCard>
  );
}
