/**
 * NeighborhoodComparison — Side-by-side Explorer dimension comparison for two
 * user-selected neighborhoods. Useful for grant applications and advocacy.
 *
 * Rendered inside the Neighborhood Explorer right panel when the user switches
 * to the "Compare" tab. Receives the fully-computed scores array and dimensions
 * list from the Explorer, so no additional data fetching is needed here.
 */

import { useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import type { NeighborhoodScore, Dimension } from '../../types';

// ── Formatting helpers ────────────────────────────────────────────────────────

function formatRaw(dimId: string, value: number | undefined): string {
  if (value === undefined || value === null) return '—';
  switch (dimId) {
    case 'income':       return `$${value.toLocaleString()}`;
    case 'affordability': return `${value.toFixed(1)}%`;
    case 'safety':       return `${value.toFixed(1)} / 1k`;
    case 'transit':      return `${value} stops`;
    case 'investment':   return `${value > 0 ? '+' : ''}${value.toFixed(0)}%`;
    case 'blight':       return `${value.toFixed(2)} / mi²`;
    case 'parks':        return `${value.toFixed(1)} ac/1k`;
    case 'flood':        return value > 0.5 ? 'Yes' : 'No';
    case 'food':         return `${value.toFixed(1)}%`;
    case 'ej':           return `${value.toFixed(0)}th %ile`;
    default:             return value.toFixed(1);
  }
}

function getRaw(score: NeighborhoodScore, dimId: string): number | undefined {
  const m = score.rawMetrics;
  switch (dimId) {
    case 'affordability': return m.rentBurdenRate;
    case 'income':        return m.medianHouseholdIncome;
    case 'safety':        return m.crimeRatePer1000;
    case 'transit':       return m.stopCount ?? m.uniqueRouteCount;
    case 'investment':    return m.permitYoYChange;
    case 'blight':        return m.plapPerSqMile;
    case 'parks':         return m.parkAcresPer1000;
    case 'flood':         return m.inFloodZone !== undefined ? (m.inFloodZone ? 1 : 0) : undefined;
    case 'food':          return m.foodDesertPct;
    case 'ej':            return m.ejPollutionIndex;
    default:              return undefined;
  }
}

const COLOR_A = '#1A4A6B'; // navy
const COLOR_B = '#C8861A'; // amber

// ── Comparison Chart ──────────────────────────────────────────────────────────

interface Props {
  scores: NeighborhoodScore[];
  dimensions: Dimension[];
}

export default function NeighborhoodComparison({ scores, dimensions }: Props) {
  const [nameA, setNameA] = useState<string>('');
  const [nameB, setNameB] = useState<string>('');

  const sortedNames = useMemo(
    () => scores.map((s) => s.name).sort(),
    [scores]
  );

  const scoreA = useMemo(
    () => scores.find((s) => s.name === nameA) ?? null,
    [scores, nameA]
  );
  const scoreB = useMemo(
    () => scores.find((s) => s.name === nameB) ?? null,
    [scores, nameB]
  );

  // Only show enabled, available dimensions
  const activeDims = dimensions.filter((d) => d.enabled && d.available);

  // Build chart data: one row per dimension
  const chartData = useMemo(() => {
    if (!scoreA || !scoreB) return [];
    return activeDims.map((dim) => ({
      dim: dim.id,
      label: dim.id.charAt(0).toUpperCase() + dim.id.slice(1),
      [nameA]: scoreA.dimensionScores[dim.id] ?? 0,
      [nameB]: scoreB.dimensionScores[dim.id] ?? 0,
      rawA: getRaw(scoreA, dim.id),
      rawB: getRaw(scoreB, dim.id),
      higherIsBetter: dim.higherIsBetter,
    }));
  }, [scoreA, scoreB, activeDims, nameA, nameB]);

  // Per-dimension winner
  function winner(row: (typeof chartData)[0]) {
    const a = row[nameA] as number;
    const b = row[nameB] as number;
    if (a === b) return 'tie';
    return a > b ? 'A' : 'B';
  }

  const aWins = chartData.filter((r) => winner(r) === 'A').length;
  const bWins = chartData.filter((r) => winner(r) === 'B').length;

  const compositeA = scoreA?.compositeScore ?? null;
  const compositeB = scoreB?.compositeScore ?? null;
  const overallWinner =
    compositeA === null || compositeB === null ? null
    : compositeA > compositeB ? 'A'
    : compositeB > compositeA ? 'B'
    : 'tie';

  return (
    <div className="bg-white rounded-lg shadow-md p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-1">Compare Neighborhoods</h2>
      <p className="text-xs text-gray-500 mb-4">
        Select two neighborhoods to compare their Explorer dimension scores side-by-side.
        Only enabled dimensions are shown.
      </p>

      {/* Selectors */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#1A4A6B] mb-1">
            Neighborhood A
          </label>
          <select
            value={nameA}
            onChange={(e) => setNameA(e.target.value)}
            className="w-full text-sm border border-[#1A4A6B] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#1A4A6B] focus:outline-none"
          >
            <option value="">Select…</option>
            {sortedNames.filter((n) => n !== nameB).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-center">
          <span className="text-sm font-bold text-gray-400 pb-1">vs</span>
        </div>

        <div className="flex-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-[#C8861A] mb-1">
            Neighborhood B
          </label>
          <select
            value={nameB}
            onChange={(e) => setNameB(e.target.value)}
            className="w-full text-sm border border-[#C8861A] rounded-lg px-3 py-2 focus:ring-2 focus:ring-[#C8861A] focus:outline-none"
          >
            <option value="">Select…</option>
            {sortedNames.filter((n) => n !== nameA).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Prompt when nothing selected yet */}
      {!scoreA && !scoreB && (
        <div className="text-center text-gray-400 text-sm py-8">
          Choose two neighborhoods above to see how they compare.
        </div>
      )}

      {/* No dimensions enabled */}
      {scoreA && scoreB && activeDims.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-8">
          Enable at least one dimension in the left panel to compare neighborhoods.
        </div>
      )}

      {/* Comparison results */}
      {scoreA && scoreB && activeDims.length > 0 && (
        <>
          {/* Overall winner banner */}
          <div className={`rounded-lg p-3 mb-5 text-sm flex items-center gap-3 ${
            overallWinner === 'A' ? 'bg-[#1A4A6B]/10 border border-[#1A4A6B]/30' :
            overallWinner === 'B' ? 'bg-[#C8861A]/10 border border-[#C8861A]/30' :
                                    'bg-gray-50 border border-gray-200'
          }`}>
            <span className="text-2xl">
              {overallWinner === 'A' ? '🏆' : overallWinner === 'B' ? '🏆' : '🤝'}
            </span>
            <div>
              {overallWinner === 'tie' ? (
                <p className="font-semibold text-gray-700">Tie — identical composite score</p>
              ) : (
                <>
                  <p className="font-semibold" style={{ color: overallWinner === 'A' ? COLOR_A : COLOR_B }}>
                    {overallWinner === 'A' ? nameA : nameB} scores higher overall
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Composite: {nameA} {compositeA?.toFixed(0)}/100 · {nameB} {compositeB?.toFixed(0)}/100
                    {' '}· Dimension wins: {nameA} {aWins} – {nameB} {bWins}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Bar chart */}
          <ResponsiveContainer width="100%" height={Math.max(180, activeDims.length * 44)}>
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 72 }}
              barCategoryGap="30%"
              barGap={3}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}`}
                label={{ value: 'Score (0–100)', position: 'insideBottom', offset: -4, fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis
                dataKey="label"
                type="category"
                tick={{ fontSize: 11 }}
                width={70}
              />
              <Tooltip
                formatter={(value: number, name: string) => [`${value}/100`, name]}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(value) => <span style={{ color: value === nameA ? COLOR_A : COLOR_B }}>{value}</span>}
              />
              <Bar dataKey={nameA} fill={COLOR_A} radius={[0, 3, 3, 0]} maxBarSize={18} />
              <Bar dataKey={nameB} fill={COLOR_B} radius={[0, 3, 3, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>

          {/* Detail table */}
          <div className="mt-5">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Dimension Detail
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-1.5 pr-3 text-gray-500 font-semibold">Dimension</th>
                    <th className="text-right py-1.5 px-2 font-semibold" style={{ color: COLOR_A }}>
                      {nameA}
                    </th>
                    <th className="text-right py-1.5 px-2 font-semibold" style={{ color: COLOR_B }}>
                      {nameB}
                    </th>
                    <th className="text-center py-1.5 pl-2 text-gray-500 font-semibold">Edge</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {chartData.map((row) => {
                    const w = winner(row);
                    const scoreAVal = row[nameA] as number;
                    const scoreBVal = row[nameB] as number;
                    return (
                      <tr key={row.dim} className="hover:bg-gray-50">
                        <td className="py-2 pr-3 text-gray-700 font-medium capitalize">{row.label}</td>
                        <td className="py-2 px-2 text-right">
                          <span className={`font-semibold ${w === 'A' ? 'text-[#1A4A6B]' : 'text-gray-500'}`}>
                            {scoreAVal}/100
                          </span>
                          <br />
                          <span className="text-gray-400">{formatRaw(row.dim, row.rawA)}</span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className={`font-semibold ${w === 'B' ? 'text-[#C8861A]' : 'text-gray-500'}`}>
                            {scoreBVal}/100
                          </span>
                          <br />
                          <span className="text-gray-400">{formatRaw(row.dim, row.rawB)}</span>
                        </td>
                        <td className="py-2 pl-2 text-center">
                          {w === 'tie' ? (
                            <span className="text-gray-400">—</span>
                          ) : (
                            <span
                              className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: w === 'A' ? `${COLOR_A}20` : `${COLOR_B}20`,
                                color: w === 'A' ? COLOR_A : COLOR_B,
                              }}
                            >
                              {w === 'A' ? nameA.split(' ')[0] : nameB.split(' ')[0]}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] text-gray-400 mt-4">
            Scores are min-max normalized (0–100) across all Cincinnati neighborhoods.
            Higher is always better in this view. Enable or adjust dimensions in the left panel to change the comparison.
          </p>
        </>
      )}
    </div>
  );
}
