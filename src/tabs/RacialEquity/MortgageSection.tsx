/**
 * MortgageLendingSection — Self-contained HMDA mortgage lending equity component.
 *
 * TRANSPLANT NOTE: This component is intentionally isolated so it can be
 * embedded in Neighborhood Profiles today and moved to its own tab later
 * without structural changes. To create a standalone tab:
 *   1. Create src/tabs/RacialEquity/index.tsx (or add to existing)
 *   2. Add a neighborhood selector + tab header
 *   3. Render <MortgageLendingSection neighborhood={selected} />
 *   4. Wire into App.tsx and TabNav.tsx
 *
 * Data source: public/data/neighborhood_hmda.json
 * Built by: scripts/build_hmda.py (CFPB HMDA LAR 2022)
 *
 * Shows mortgage application approval rates for Black, White NH, Asian, and
 * Hispanic/Latino applicants — both at the neighborhood and county level.
 *
 * HMDA notes:
 *   - "Hispanic or Latino" is an ethnicity in HMDA, not a race code.
 *     The build script queries it separately and merges into the record.
 *   - Rates are suppressed (null) when the sample is < 10 applications.
 *   - source='county_fallback' means no tract-level data; county rates shown.
 *   - The '_county' key holds Hamilton County totals for benchmarking.
 */

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { fetchNeighborhoodHMDAStats, stripNeighborhoodName } from '../../utils/api';
import type { NeighborhoodHMDAStats, HMDARaceStats } from '../../types';
import { DataCard } from '../../components/ui';

// ── Race group config ─────────────────────────────────────────────────────────

interface RaceGroup {
  key: 'black' | 'white' | 'asian' | 'hispanic';
  label: string;
  shortLabel: string;
  color: string;
}

const RACE_GROUPS: RaceGroup[] = [
  { key: 'black',    label: 'Black or African American', shortLabel: 'Black',    color: '#1A4A6B' },
  { key: 'white',    label: 'White (non-Hispanic)',      shortLabel: 'White NH', color: '#2E7D5A' },
  { key: 'asian',    label: 'Asian',                     shortLabel: 'Asian',    color: '#8B5CF6' },
  { key: 'hispanic', label: 'Hispanic or Latino',        shortLabel: 'Hispanic', color: '#D97706' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPct(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(1) + '%';
}

function fmtCount(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

/** Returns a plain-English sentence describing the Black/White approval gap. */
function approvalGapSentence(stats: NeighborhoodHMDAStats): string | null {
  const bRate = stats.black.approvalRate;
  const wRate = stats.white.approvalRate;
  if (bRate == null || wRate == null) return null;
  const gap = wRate - bRate;
  if (Math.abs(gap) < 2) {
    return `Black and White NH applicants have similar mortgage approval rates in this neighborhood.`;
  }
  if (gap > 0) {
    return `White NH applicants are approved ${gap.toFixed(1)} percentage points more often than Black applicants in this neighborhood.`;
  }
  return `Black applicants are approved ${Math.abs(gap).toFixed(1)} percentage points more often than White NH applicants in this neighborhood.`;
}

/** Returns a note comparing neighborhood rate to county benchmark. */
function countyBenchmarkNote(
  label: string,
  neighborhoodRate: number | null,
  countyRate: number | null | undefined
): string | null {
  if (neighborhoodRate == null || countyRate == null) return null;
  const diff = neighborhoodRate - countyRate;
  if (Math.abs(diff) < 2) return null;
  const dir = diff > 0 ? 'above' : 'below';
  return `${label} approval here is ${Math.abs(diff).toFixed(1)} pp ${dir} the county average (${fmtPct(countyRate)}).`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Approval rate horizontal bar chart */
function ApprovalRateChart({
  stats,
  countyWhiteRate,
  countyBlackRate,
}: {
  stats: NeighborhoodHMDAStats;
  countyWhiteRate: number | null | undefined;
  countyBlackRate: number | null | undefined;
}) {
  const chartData = RACE_GROUPS
    .map(g => {
      const raceStats: HMDARaceStats = stats[g.key];
      return {
        name: g.shortLabel,
        value: raceStats.approvalRate,
        total: raceStats.total,
        approved: raceStats.approved,
        denied: raceStats.denied,
        color: g.color,
      };
    })
    .filter(d => d.value != null);

  if (chartData.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic">
        Insufficient application volume for rate calculation (min. 10 applications required).
      </p>
    );
  }

  // Show county reference line if we have Black county rate
  const refRate = countyBlackRate ?? countyWhiteRate ?? null;

  return (
    <div className="mt-2">
      <ResponsiveContainer width="100%" height={chartData.length * 38 + 30}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 70, bottom: 0, left: 82 }}
        >
          <XAxis
            type="number"
            domain={[0, 100]}
            tickFormatter={v => v + '%'}
            tick={{ fontSize: 10 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 11 }}
            width={78}
          />
          <Tooltip
            formatter={(v: number, _name: string, props: { payload?: { total?: number; approved?: number; denied?: number } }) => {
              const payload = props.payload;
              const parts: string[] = [`${v.toFixed(1)}% approval rate`];
              if (payload?.total) {
                parts.push(`${fmtCount(payload.approved)} approved / ${fmtCount(payload.denied)} denied (${fmtCount(payload.total)} total)`);
              }
              return [parts.join('\n'), 'Mortgage Applications'];
            }}
            contentStyle={{ fontSize: '12px', whiteSpace: 'pre-line' }}
          />
          {refRate != null && (
            <ReferenceLine
              x={refRate}
              stroke="#6B7280"
              strokeDasharray="4 2"
              label={{ value: 'County avg', position: 'top', fontSize: 9, fill: '#6B7280' }}
            />
          )}
          <Bar dataKey="value" radius={[0, 3, 3, 0]} label={{ position: 'right', fontSize: 11, formatter: (v: number) => fmtPct(v) }}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Application volume table */
function ApplicationVolumeTable({ stats }: { stats: NeighborhoodHMDAStats }) {
  const rows = RACE_GROUPS.map(g => {
    const raceStats: HMDARaceStats = stats[g.key];
    return { ...g, ...raceStats };
  }).filter(r => r.total && r.total > 0);

  if (rows.length === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-xs font-medium text-gray-600 mb-1.5">Application Volume (2022)</p>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-gray-500 border-b border-gray-100">
            <th className="text-left py-1 pr-2">Group</th>
            <th className="text-right py-1 px-2">Approved</th>
            <th className="text-right py-1 px-2">Denied</th>
            <th className="text-right py-1 pl-2">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.key} className="border-b border-gray-50">
              <td className="py-1 pr-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-sm inline-block flex-shrink-0" style={{ backgroundColor: r.color }} />
                {r.shortLabel}
              </td>
              <td className="text-right py-1 px-2 tabular-nums">{fmtCount(r.approved)}</td>
              <td className="text-right py-1 px-2 tabular-nums">{fmtCount(r.denied)}</td>
              <td className="text-right py-1 pl-2 tabular-nums font-medium">{fmtCount(r.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

interface MortgageLendingSectionProps {
  neighborhood: string;
}

export default function MortgageLendingSection({ neighborhood }: MortgageLendingSectionProps) {
  const [stats, setStats] = useState<NeighborhoodHMDAStats | null>(null);
  const [countyStats, setCountyStats] = useState<NeighborhoodHMDAStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [notBuilt, setNotBuilt] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setStats(null);
    setError(null);
    setNotBuilt(false);

    fetchNeighborhoodHMDAStats()
      .then(map => {
        if (map.size === 0) { setNotBuilt(true); return; }
        const key = stripNeighborhoodName(neighborhood);
        setStats(map.get(key) ?? null);
        setCountyStats(map.get('_county') ?? null);
      })
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [neighborhood]);

  // ── Not built yet ────────────────────────────────────────────────────────────
  if (notBuilt) {
    return (
      <DataCard title="Mortgage Lending" loading={false} error={null}>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900 space-y-2">
          <p className="font-semibold">⚙️ Mortgage lending data not yet generated</p>
          <p>Run the build script to generate HMDA race-disaggregated mortgage statistics:</p>
          <pre className="bg-amber-100 rounded p-2 text-xs font-mono overflow-x-auto">
            python3 scripts/build_hmda.py
          </pre>
          <p>
            This fetches CFPB HMDA 2022 mortgage application data for Hamilton County
            (all loan types: purchase, refinance, and home improvement) and maps
            approval rates by race to Cincinnati neighborhoods.
          </p>
        </div>
      </DataCard>
    );
  }

  // ── No data for this neighborhood ────────────────────────────────────────────
  if (!loading && !error && stats === null) {
    return (
      <DataCard title="Mortgage Lending" loading={false} error={null}
        attribution={{ datasetName: 'CFPB HMDA LAR 2022', lastUpdated: null }}>
        <p className="text-sm text-gray-500">
          No mortgage lending data found for {neighborhood}. This neighborhood may have
          too few census tracts or insufficient application volume.
        </p>
      </DataCard>
    );
  }

  const approvalGap = stats ? approvalGapSentence(stats) : null;
  const isFallback = stats?.source === 'county_fallback';

  const blackNote = stats ? countyBenchmarkNote(
    'Black',
    stats.black.approvalRate,
    stats.countyBlackApprovalRate
  ) : null;
  const whiteNote = stats ? countyBenchmarkNote(
    'White NH',
    stats.white.approvalRate,
    stats.countyWhiteApprovalRate
  ) : null;

  return (
    <DataCard
      title="Mortgage Lending"
      loading={loading}
      error={error}
      attribution={{
        datasetName: 'CFPB HMDA LAR 2022 — Home Purchase Loans, Hamilton County',
        lastUpdated: stats?.year ? `${stats.year} HMDA` : null,
      }}
    >
      {stats && (
        <div className="space-y-2">

          {/* Context note */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-900 mb-3">
            <strong>Source:</strong> CFPB Home Mortgage Disclosure Act (HMDA) LAR 2022.
            Counts include all mortgage applications (purchase, refinance, and home improvement)
            due to CFPB API filter constraints — home-purchase-only isolation is not possible
            alongside race disaggregation. "Hispanic or Latino" is an HMDA ethnicity category
            (separate from race) shown alongside race groups for context.
            Rates suppressed when fewer than 10 applications in this area.
            {isFallback && (
              <span className="block mt-1 font-medium text-amber-800">
                ⚠️ No census tracts matched this neighborhood — showing Hamilton County rates as a reference.
              </span>
            )}
          </div>

          {/* Key disparity callout */}
          {(approvalGap || blackNote || whiteNote) && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-3 space-y-1.5">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Key disparities</p>
              {approvalGap && <p className="text-sm text-gray-700">{approvalGap}</p>}
              {blackNote && <p className="text-sm text-gray-600 text-xs">{blackNote}</p>}
              {whiteNote && <p className="text-sm text-gray-600 text-xs">{whiteNote}</p>}
            </div>
          )}

          {/* County benchmark (if available) */}
          {countyStats && (
            <div className="text-xs text-gray-500 flex gap-4 mb-1">
              <span>
                Hamilton Co. White NH: <strong>{fmtPct(countyStats.white.approvalRate)}</strong>
              </span>
              <span>
                Hamilton Co. Black: <strong>{fmtPct(countyStats.black.approvalRate)}</strong>
              </span>
            </div>
          )}

          {/* Approval rate chart */}
          <p className="text-sm font-medium text-gray-700 mb-1">Approval Rate by Race/Ethnicity</p>
          <ApprovalRateChart
            stats={stats}
            countyWhiteRate={stats.countyWhiteApprovalRate}
            countyBlackRate={stats.countyBlackApprovalRate}
          />

          {/* Application volume table */}
          <ApplicationVolumeTable stats={stats} />

          {/* Small-sample caveat */}
          {RACE_GROUPS.some(g => {
            const t = stats[g.key].total;
            return t != null && t > 0 && t < 30;
          }) && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 mt-1">
              ⚠ One or more groups have fewer than 30 applications. Approval rates based on small samples are statistically volatile — a single decision can shift the rate by several percentage points.
            </p>
          )}

          {/* CFPB citation */}
          <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-gray-500">
            Data via the{' '}
            <a
              href="https://ffiec.cfpb.gov/data-browser/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-[#1A4A6B]"
            >
              CFPB HMDA Data Browser
            </a>
            . For broader context on lending disparities in Cincinnati, see the{' '}
            <a
              href="https://ulgswo.org/state-of-black-cincinnati"
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-[#1A4A6B]"
            >
              Urban League's State of Black Cincinnati (2024)
            </a>
            .
          </div>
        </div>
      )}
    </DataCard>
  );
}
