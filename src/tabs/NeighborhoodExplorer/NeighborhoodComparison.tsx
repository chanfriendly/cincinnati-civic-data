/**
 * NeighborhoodComparison — Side-by-side Explorer dimension comparison for two
 * user-selected neighborhoods. Useful for grant applications and advocacy.
 *
 * Rendered inside the Neighborhood Explorer right panel when the user switches
 * to the "Compare" tab. Receives the fully-computed scores array and dimensions
 * list from the Explorer, so no additional data fetching is needed here.
 */

import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import type { NeighborhoodScore, Dimension } from '../../types';
import { C } from '../../components/ui/DesignAtoms';

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

const COLOR_A = C.riverDeep; // navy
const COLOR_B = C.ochre;    // amber (editorial UI accent for second series)

// ── Comparison Chart ──────────────────────────────────────────────────────────

interface Props {
  scores: NeighborhoodScore[];
  dimensions: Dimension[];
}

export default function NeighborhoodComparison({ scores, dimensions }: Props) {
  const { t } = useTranslation();
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
      label: t(dim.labelKey),
      [nameA]: scoreA.dimensionScores[dim.id],   // keep null — don't coerce to 0
      [nameB]: scoreB.dimensionScores[dim.id],
      rawA: getRaw(scoreA, dim.id),
      rawB: getRaw(scoreB, dim.id),
      higherIsBetter: dim.higherIsBetter,
    }));
  }, [scoreA, scoreB, activeDims, nameA, nameB, t]);

  // Per-dimension winner — null means no data, treat as no edge
  function winner(row: (typeof chartData)[0]) {
    const a = row[nameA] as number | null;
    const b = row[nameB] as number | null;
    if (a === null || b === null) return 'tie';
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
    <div className="rounded-md shadow-md p-5">
      <h2 className="text-lg font-bold mb-1" style={{ color: C.ink }}>Compare Neighborhoods</h2>
      <p className="text-xs mb-4" style={{ color: C.muted }}>
        Select two neighborhoods to compare their Explorer dimension scores side-by-side.
        Only enabled dimensions are shown.
      </p>

      {/* Selectors */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="flex-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.riverDeep }}>
            Neighborhood A
          </label>
          <select
            value={nameA}
            onChange={(e) => setNameA(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-md focus:ring-2 focus:outline-none"
            style={{ border: `1px solid ${C.riverDeep}` }}
          >
            <option value="">Select…</option>
            {sortedNames.filter((n) => n !== nameB).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-center">
          <span className="text-sm font-bold pb-1" style={{ color: C.muted }}>vs</span>
        </div>

        <div className="flex-1">
          <label className="block text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: C.ochre }}>
            Neighborhood B
          </label>
          <select
            value={nameB}
            onChange={(e) => setNameB(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-md focus:ring-2 focus:outline-none"
            style={{ border: `1px solid ${C.ochre}` }}
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
        <div className="text-center text-sm py-8" style={{ color: C.muted }}>
          Choose two neighborhoods above to see how they compare.
        </div>
      )}

      {/* No dimensions enabled */}
      {scoreA && scoreB && activeDims.length === 0 && (
        <div className="text-center text-sm py-8" style={{ color: C.muted }}>
          Enable at least one dimension in the left panel to compare neighborhoods.
        </div>
      )}

      {/* Comparison results */}
      {scoreA && scoreB && activeDims.length > 0 && (
        <>
          {/* Overall winner banner */}
          <div
            className="rounded-md p-3 mb-5 text-sm flex items-center gap-3"
            style={
              overallWinner === 'A' ? { background: C.riverLight, border: `1px solid ${C.rule}` } :
              overallWinner === 'B' ? { background: C.limestone, border: `1px solid ${C.rule}` } :
                                      { background: C.paper, border: `1px solid ${C.rule}` }
            }
          >
            <span className="text-2xl">
              {overallWinner === 'A' ? '🏆' : overallWinner === 'B' ? '🏆' : '🤝'}
            </span>
            <div>
              {overallWinner === 'tie' ? (
                <p className="font-semibold" style={{ color: C.ink }}>Tie — identical composite score</p>
              ) : (
                <>
                  <p className="font-semibold" style={{ color: overallWinner === 'A' ? COLOR_A : COLOR_B }}>
                    {overallWinner === 'A' ? nameA : nameB} scores higher overall
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: C.muted }}>
                    Composite: {nameA} {compositeA?.toFixed(0)}/100 · {nameB} {compositeB?.toFixed(0)}/100
                    {' '}· Dimension wins: {nameA} {aWins} – {nameB} {bWins}
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Inline series key — Brand Bible §3.5: no Recharts Legend squares */}
          <div className="flex gap-5 mb-2 text-[11px]" style={{ color: C.muted }}>
            <span className="inline-flex items-center gap-1.5">
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: COLOR_A, flexShrink: 0 }} />
              {nameA || 'Neighborhood A'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: 2, background: COLOR_B, flexShrink: 0 }} />
              {nameB || 'Neighborhood B'}
            </span>
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
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => `${v}`}
                label={{ value: 'Score (0–100)', position: 'insideBottom', offset: -4, fontSize: 10, fill: C.muted }}
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
              <Bar dataKey={nameA} fill={COLOR_A} radius={[0, 3, 3, 0]} maxBarSize={18} />
              <Bar dataKey={nameB} fill={COLOR_B} radius={[0, 3, 3, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>

          {/* Detail table */}
          <div className="mt-5">
            <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: C.muted }}>
              Dimension Detail
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.rule}` }}>
                    <th className="text-left py-1.5 pr-3 font-semibold" style={{ color: C.muted }}>Dimension</th>
                    <th className="text-right py-1.5 px-2 font-semibold" style={{ color: COLOR_A }}>
                      {nameA}
                    </th>
                    <th className="text-right py-1.5 px-2 font-semibold" style={{ color: COLOR_B }}>
                      {nameB}
                    </th>
                    <th className="text-center py-1.5 pl-2 font-semibold" style={{ color: C.muted }}>Edge</th>
                  </tr>
                </thead>
                <tbody>
                  {chartData.map((row) => {
                    const w = winner(row);
                    const scoreAVal = row[nameA] as number | null;
                    const scoreBVal = row[nameB] as number | null;
                    return (
                      <tr key={row.dim} style={{ borderTop: `1px solid ${C.rule}` }}>
                        <td className="py-2 pr-3 font-medium" style={{ color: C.ink }}>{row.label}</td>
                        <td className="py-2 px-2 text-right">
                          <span className="font-semibold" style={{ color: w === 'A' ? COLOR_A : C.muted }}>
                            {scoreAVal !== null ? `${scoreAVal}/100` : '—'}
                          </span>
                          <br />
                          <span style={{ color: C.muted }}>{formatRaw(row.dim, row.rawA)}</span>
                        </td>
                        <td className="py-2 px-2 text-right">
                          <span className="font-semibold" style={{ color: w === 'B' ? COLOR_B : C.muted }}>
                            {scoreBVal !== null ? `${scoreBVal}/100` : '—'}
                          </span>
                          <br />
                          <span style={{ color: C.muted }}>{formatRaw(row.dim, row.rawB)}</span>
                        </td>
                        <td className="py-2 pl-2 text-center">
                          {w === 'tie' ? (
                            <span style={{ color: C.muted }}>—</span>
                          ) : (
                            <span
                              className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-sm"
                              style={{
                                backgroundColor: w === 'A' ? C.riverLight : C.limestone,
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

          <p className="text-[10px] mt-4" style={{ color: C.muted }}>
            Scores are min-max normalized (0–100) across all Cincinnati neighborhoods.
            Higher is always better in this view. Enable or adjust dimensions in the left panel to change the comparison.
          </p>
        </>
      )}
    </div>
  );
}
