/**
 * RacialEquitySection — Self-contained racial equity metrics component.
 *
 * TRANSPLANT NOTE: This component is intentionally isolated so it can be
 * embedded in Neighborhood Profiles today and moved to its own tab later
 * without structural changes. To create a standalone tab:
 *   1. Create src/tabs/RacialEquity/index.tsx
 *   2. Add a neighborhood selector + tab header
 *   3. Render <RacialEquitySection neighborhood={selected} />
 *   4. Add 'racial-equity' to TabId in types/index.ts
 *   5. Wire into App.tsx and TabNav.tsx
 *
 * Data source: public/data/neighborhood_racial_equity.json
 * Built by: scripts/build_racial_equity.py (ACS 5-Year 2022)
 *
 * Shows three equity dimensions for Black, White non-Hispanic, Asian, and
 * Hispanic/Latino residents:
 *   - Median household income (population-weighted approx)
 *   - Poverty rate (exact from counts)
 *   - Homeownership rate (exact from counts)
 *
 * Null values are shown as "Insufficient data" — Census suppresses cells
 * with fewer than 15 sample households in a tract.
 */

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { fetchNeighborhoodRacialEquityStats, stripNeighborhoodName } from '../../utils/api';
import type { NeighborhoodRacialEquityStats } from '../../types';
import { DataCard } from '../../components/ui';

// ── Race group config ─────────────────────────────────────────────────────────

interface RaceGroup {
  key: 'Black' | 'WhiteNH' | 'Asian' | 'Hispanic';
  label: string;
  shortLabel: string;
  color: string;
}

const RACE_GROUPS: RaceGroup[] = [
  { key: 'Black',    label: 'Black or African American', shortLabel: 'Black',    color: '#1A4A6B' },
  { key: 'WhiteNH',  label: 'White (non-Hispanic)',      shortLabel: 'White NH', color: '#2E7D5A' },
  { key: 'Asian',    label: 'Asian',                     shortLabel: 'Asian',    color: '#8B5CF6' },
  { key: 'Hispanic', label: 'Hispanic or Latino',        shortLabel: 'Hispanic', color: '#D97706' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt$( n: number | null | undefined): string {
  if (n == null) return '—';
  return '$' + n.toLocaleString();
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(1) + '%';
}

function fmtPop(n: number | null | undefined): string {
  if (n == null || n === 0) return '—';
  return n.toLocaleString();
}

/** Compute the Black/White NH income gap ratio as a plain-English sentence. */
function incomeGapSentence(stats: NeighborhoodRacialEquityStats): string | null {
  const { medIncomeBlack: b, medIncomeWhiteNH: w } = stats;
  if (!b || !w || w === 0) return null;
  const ratio = Math.round((b / w) * 100);
  const gap = w - b;
  if (ratio >= 95) return `Black and White NH residents have similar median incomes in this neighborhood.`;
  return `Black residents earn ${ratio}¢ for every $1 earned by White non-Hispanic residents — a gap of ${fmt$(gap)}.`;
}

function homeownerGapSentence(stats: NeighborhoodRacialEquityStats): string | null {
  const { homeownerRateBlack: b, homeownerRateWhiteNH: w } = stats;
  if (b == null || w == null) return null;
  const gap = Math.round(w - b);
  if (Math.abs(gap) < 3) return null;
  return `White NH homeownership (${fmtPct(w)}) is ${gap} percentage points higher than Black homeownership (${fmtPct(b)}) in this neighborhood.`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Three-bar comparison row for a single metric */
function MetricComparisonChart({
  title,
  data,
  formatter,
  domain,
  note,
}: {
  title: string;
  data: { group: string; value: number | null; color: string }[];
  formatter: (v: number) => string;
  domain?: [number, number];
  note?: string;
}) {
  const chartData = data
    .filter(d => d.value != null)
    .map(d => ({ name: d.group, value: d.value as number, color: d.color }));

  if (chartData.length === 0) {
    return (
      <div className="mb-4">
        <p className="text-sm font-medium text-gray-700 mb-1">{title}</p>
        <p className="text-xs text-gray-400 italic">Insufficient data for this neighborhood</p>
      </div>
    );
  }

  return (
    <div className="mb-5">
      <p className="text-sm font-medium text-gray-700 mb-2">{title}</p>
      <ResponsiveContainer width="100%" height={chartData.length * 36 + 20}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 60, bottom: 0, left: 80 }}
        >
          <XAxis
            type="number"
            domain={domain}
            tickFormatter={formatter}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11 }}
            width={78}
          />
          <Tooltip
            formatter={(v: number) => [formatter(v), title]}
            contentStyle={{ fontSize: '12px' }}
          />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 11, formatter }}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
    </div>
  );
}

/** Population composition pill chart */
function PopulationComposition({ stats }: { stats: NeighborhoodRacialEquityStats }) {
  const total = stats.totalPop;
  if (!total) return null;

  const groups = [
    { label: 'Black', pop: stats.popBlack, color: '#1A4A6B' },
    { label: 'White NH', pop: stats.popWhiteNH, color: '#2E7D5A' },
    { label: 'Hispanic', pop: stats.popHispanic, color: '#D97706' },
    { label: 'Asian', pop: stats.popAsian, color: '#8B5CF6' },
  ].filter(g => g.pop && g.pop > 0);

  const other = total - groups.reduce((s, g) => s + (g.pop ?? 0), 0);

  return (
    <div className="mb-4">
      <p className="text-xs text-gray-500 mb-1.5">
        Population: {total.toLocaleString()} residents
      </p>
      <div className="flex h-4 rounded-full overflow-hidden w-full">
        {groups.map(g => (
          <div
            key={g.label}
            style={{ width: `${((g.pop ?? 0) / total) * 100}%`, backgroundColor: g.color }}
            title={`${g.label}: ${fmtPop(g.pop)} (${fmtPct(((g.pop ?? 0) / total) * 100)})`}
          />
        ))}
        {other > 0 && (
          <div
            style={{ width: `${(other / total) * 100}%`, backgroundColor: '#D1D5DB' }}
            title={`Other / multiracial: ${other.toLocaleString()}`}
          />
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
        {groups.map(g => (
          <span key={g.label} className="text-xs text-gray-600 flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: g.color }} />
            {g.label} {fmtPct(((g.pop ?? 0) / total) * 100)}
          </span>
        ))}
        {other > 0 && (
          <span className="text-xs text-gray-600 flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm inline-block bg-gray-300" />
            Other {fmtPct((other / total) * 100)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface RacialEquitySectionProps {
  neighborhood: string;
}

export default function RacialEquitySection({ neighborhood }: RacialEquitySectionProps) {
  const [stats, setStats] = useState<NeighborhoodRacialEquityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notBuilt, setNotBuilt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setStats(null);
    setError(null);
    setNotBuilt(false);

    fetchNeighborhoodRacialEquityStats()
      .then(map => {
        if (map.size === 0) { setNotBuilt(true); return; }
        const key = stripNeighborhoodName(neighborhood);
        setStats(map.get(key) ?? null);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [neighborhood]);

  // ── Not built yet ────────────────────────────────────────────────────────────
  if (notBuilt) {
    return (
      <DataCard title="Racial Equity" loading={false} error={null}>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">⚙️ Racial equity data not yet generated</p>
          <p>Run the build script to generate race-disaggregated ACS statistics:</p>
          <pre className="bg-amber-100 rounded p-2 text-xs font-mono overflow-x-auto">
            python3 scripts/build_racial_equity.py
          </pre>
          <p>
            This fetches ACS 5-Year 2022 data (income, poverty, homeownership by race)
            for all 226 Hamilton County census tracts and maps them to Cincinnati neighborhoods.
          </p>
        </div>
      </DataCard>
    );
  }

  // ── No data for this neighborhood ────────────────────────────────────────────
  if (!loading && !error && stats === null) {
    return (
      <DataCard title="Racial Equity" loading={false} error={null}
        attribution={{ datasetName: 'U.S. Census ACS 5-Year 2022', lastUpdated: null }}>
        <p className="text-sm text-gray-500">
          No racial equity data found for {neighborhood}.
        </p>
      </DataCard>
    );
  }

  // ── Income chart data ────────────────────────────────────────────────────────
  const incomeData = RACE_GROUPS.map(g => ({
    group: g.shortLabel,
    value: stats ? (stats[`medIncome${g.key}` as keyof NeighborhoodRacialEquityStats] as number | null) : null,
    color: g.color,
  }));

  const povertyData = RACE_GROUPS.map(g => ({
    group: g.shortLabel,
    value: stats ? (stats[`povertyRate${g.key}` as keyof NeighborhoodRacialEquityStats] as number | null) : null,
    color: g.color,
  }));

  const homeownerData = RACE_GROUPS.map(g => ({
    group: g.shortLabel,
    value: stats ? (stats[`homeownerRate${g.key}` as keyof NeighborhoodRacialEquityStats] as number | null) : null,
    color: g.color,
  }));

  const incomeGap = stats ? incomeGapSentence(stats) : null;
  const homeGap = stats ? homeownerGapSentence(stats) : null;

  return (
    <DataCard
      title="Racial Equity"
      loading={loading}
      error={error}
      attribution={{
        datasetName: 'U.S. Census ACS 5-Year 2022 — B03002, B19013, B17001, B25003',
        lastUpdated: stats?.asOf ? `${stats.asOf} ACS` : null,
      }}
    >
      {stats && (
        <div className="space-y-2">

          {/* Context note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900 mb-4">
            <strong>Source:</strong> U.S. Census Bureau ACS 5-Year 2022. Race groups follow Census B03002
            categories. "White NH" = White alone, not Hispanic or Latino. Median income values are
            population-weighted averages of tract-level medians — an approximation disclosed for transparency.
            Poverty and homeownership rates are computed from raw counts and are exact.
            "—" indicates suppressed data (fewer than 15 sample households in this neighborhood's tracts).
          </div>

          {/* Population composition */}
          <PopulationComposition stats={stats} />

          {/* Key disparities callout */}
          {(incomeGap || homeGap) && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4 space-y-1.5">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Key disparities</p>
              {incomeGap && <p className="text-sm text-gray-700">{incomeGap}</p>}
              {homeGap && <p className="text-sm text-gray-700">{homeGap}</p>}
            </div>
          )}

          {/* Income chart */}
          <MetricComparisonChart
            title="Median Household Income"
            data={incomeData}
            formatter={v => '$' + (v / 1000).toFixed(0) + 'k'}
            note="Population-weighted average of tract-level medians (ACS B19013). An approximation."
          />

          {/* Poverty chart */}
          <MetricComparisonChart
            title="Poverty Rate"
            data={povertyData}
            formatter={v => v.toFixed(1) + '%'}
            domain={[0, 60]}
            note="% of residents with income below the federal poverty level (ACS B17001)."
          />

          {/* Homeownership chart */}
          <MetricComparisonChart
            title="Homeownership Rate"
            data={homeownerData}
            formatter={v => v.toFixed(1) + '%'}
            domain={[0, 100]}
            note="% of occupied housing units that are owner-occupied (ACS B25003)."
          />

          {/* Urban League citation */}
          <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
            For broader context on Cincinnati's racial equity landscape, see the{' '}
            <a
              href="https://ulgswo.org/state-of-black-cincinnati"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-[#1A4A6B]"
            >
              Urban League's State of Black Cincinnati (2024)
            </a>.
          </div>
        </div>
      )}
    </DataCard>
  );
}
