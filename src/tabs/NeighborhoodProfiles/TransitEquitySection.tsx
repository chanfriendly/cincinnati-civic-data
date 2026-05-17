/**
 * TransitEquitySection — Transit access vs. income equity analysis.
 *
 * Shows how the selected neighborhood's transit access (SORTA bus stop count
 * within 0.4 miles of its centroid) compares to all 50 Cincinnati neighborhoods,
 * with a scatter chart plotting stop count against median household income.
 *
 * Data source: /data/neighborhood_transit_equity.json
 *   — pre-built by querying CAGIS neighborhood centroids + SORTA stops JSON
 *     and mapping ACS tract-level income to neighborhoods by nearest centroid.
 *
 * TRANSPLANT NOTE: Self-contained — accepts `neighborhood` (display name).
 * To promote to its own tab, wrap in a tab shell.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts';
import { stripNeighborhoodName } from '../../utils/api';
import { DataCard, DataAttribution } from '../../components/ui';

interface Props {
  neighborhood: string; // Display name, e.g. "Over-the-Rhine"
}

interface TransitEquityRecord {
  name: string;
  stopCount: number;
  medianIncome: number | null;
  lat: number;
  lon: number;
}

// ── Quadrant label helper ──────────────────────────────────────────────────────
function equityLabel(
  stopCount: number,
  medianIncome: number | null,
  medianStops: number,
  medianIncomeAll: number
): { label: string; color: string; description: string } {
  if (medianIncome === null) return { label: 'Incomplete data', color: '#6b7280', description: '' };

  const highTransit = stopCount >= medianStops;
  const highIncome  = medianIncome >= medianIncomeAll;

  if (highTransit && !highIncome) {
    return {
      label: 'Transit-rich, lower-income',
      color: '#16a34a',
      description:
        'This neighborhood has above-median transit access despite below-median income — a positive equity signal.',
    };
  }
  if (!highTransit && !highIncome) {
    return {
      label: 'Transit gap — lower-income',
      color: '#dc2626',
      description:
        'Below-median transit access AND below-median income. Residents here may have limited transportation options without a car.',
    };
  }
  if (highTransit && highIncome) {
    return {
      label: 'Transit-rich, higher-income',
      color: '#2f5d62',
      description:
        'Above-median transit access in a higher-income area. Well-served neighborhood.',
    };
  }
  // !highTransit && highIncome
  return {
    label: 'Car-dependent, higher-income',
    color: '#C8861A',
    description:
      'Below-median transit access, but higher income may make car ownership more accessible for residents.',
  };
}

// ── Custom scatter tooltip ────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.[0]) return null;
  const d: TransitEquityRecord = payload[0].payload;
  return (
    <div className="rounded-lg p-2.5 text-xs" style={{ background: '#fbf8f3', border: '1px solid #e4ddd2' }}>
      <p className="font-semibold mb-0.5" style={{ color: '#1a1410' }}>{d.name}</p>
      <p style={{ color: '#6b5f55' }}>{d.stopCount} stops within 0.4 mi</p>
      {d.medianIncome !== null && (
        <p style={{ color: '#6b5f55' }}>Median income: ${d.medianIncome.toLocaleString()}</p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function TransitEquitySection({ neighborhood }: Props) {
  const [data, setData] = useState<TransitEquityRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/data/neighborhood_transit_equity.json')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Failed to load transit equity data'))
      .finally(() => setLoading(false));
  }, []);

  const key = stripNeighborhoodName(neighborhood);

  const selected = useMemo(
    () => data.find((d) => stripNeighborhoodName(d.name) === key) ?? null,
    [data, key]
  );

  // Summary stats across all neighborhoods
  const { medianStops, medianIncomeAll, rankedByStops } = useMemo(() => {
    const sorted = [...data].sort((a, b) => a.stopCount - b.stopCount);
    const mid = Math.floor(sorted.length / 2);
    const medianStops = sorted[mid]?.stopCount ?? 0;

    const withIncome = data.filter((d) => d.medianIncome !== null) as (TransitEquityRecord & { medianIncome: number })[];
    const sortedIncome = [...withIncome].sort((a, b) => a.medianIncome - b.medianIncome);
    const midI = Math.floor(sortedIncome.length / 2);
    const medianIncomeAll = sortedIncome[midI]?.medianIncome ?? 0;

    const rankedByStops = [...data]
      .sort((a, b) => b.stopCount - a.stopCount)
      .map((d, i) => ({ ...d, rank: i + 1 }));

    return { medianStops, medianIncomeAll, rankedByStops };
  }, [data]);

  const selectedRank = useMemo(
    () => rankedByStops.find((d) => stripNeighborhoodName(d.name) === key)?.rank ?? null,
    [rankedByStops, key]
  );

  // Only plot neighborhoods that have income data
  const scatterData = useMemo(
    () => data.filter((d) => d.medianIncome !== null),
    [data]
  );

  const equity = selected
    ? equityLabel(selected.stopCount, selected.medianIncome, medianStops, medianIncomeAll)
    : null;

  const totalNeighborhoods = data.length;

  return (
    <DataCard
      title="Transit Access & Equity"
      loading={loading}
      error={error}
      empty={!loading && !error && data.length === 0}
    >
      {selected && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="p-3 rounded-lg text-center" style={{ background: '#e6efef' }}>
              <div className="text-2xl font-bold" style={{ color: '#2f5d62' }}>{selected.stopCount}</div>
              <div className="text-[10px] font-semibold mt-0.5 uppercase tracking-wide" style={{ color: '#2f5d62' }}>Bus Stops</div>
              <div className="text-[10px]" style={{ color: '#6b5f55' }}>within 0.4 mi</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ background: '#f6f1ea' }}>
              <div className="text-2xl font-bold" style={{ color: '#1a1410' }}>
                #{selectedRank}
              </div>
              <div className="text-[10px] font-semibold mt-0.5 uppercase tracking-wide" style={{ color: '#6b5f55' }}>Rank</div>
              <div className="text-[10px]" style={{ color: '#6b5f55' }}>of {totalNeighborhoods} neighborhoods</div>
            </div>
            <div className="p-3 rounded-lg text-center" style={{ background: '#f6f1ea' }}>
              <div className="text-2xl font-bold" style={{ color: '#1a1410' }}>
                {medianStops}
              </div>
              <div className="text-[10px] font-semibold mt-0.5 uppercase tracking-wide" style={{ color: '#6b5f55' }}>City Median</div>
              <div className="text-[10px]" style={{ color: '#6b5f55' }}>bus stops</div>
            </div>
          </div>

          {/* Equity label */}
          {equity && (
            <div
              className="flex items-start gap-2 rounded-lg p-3 mb-5 text-sm"
              style={{ backgroundColor: equity.color + '15', border: `1px solid ${equity.color}40` }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 mt-1"
                style={{ backgroundColor: equity.color }}
              />
              <div>
                <span className="font-semibold" style={{ color: equity.color }}>{equity.label}</span>
                {equity.description && (
                  <p className="text-xs text-gray-600 mt-0.5">{equity.description}</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {!selected && !loading && (
        <p className="text-sm italic mb-4" style={{ color: '#6b5f55' }}>
          No transit equity data found for {neighborhood}. It may not be in the 50-neighborhood SNA dataset.
        </p>
      )}

      {/* Scatter chart — stop count vs. income */}
      {scatterData.length > 0 && (
        <>
          <div className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: '#6b5f55' }}>
            All neighborhoods — transit access vs. income
          </div>
          <p className="text-[10px] mb-3" style={{ color: '#6b5f55' }}>
            Each dot is one of Cincinnati's 50 neighborhoods.
            {selected && ' Your neighborhood is highlighted in amber.'}
            Reference lines show city medians.
          </p>
          <ResponsiveContainer width="100%" height={240}>
            <ScatterChart margin={{ top: 8, right: 12, bottom: 24, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="medianIncome"
                type="number"
                name="Median Income"
                domain={['auto', 'auto']}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 10 }}
                label={{ value: 'Median Household Income', position: 'insideBottom', offset: -14, fontSize: 10, fill: '#9ca3af' }}
              />
              <YAxis
                dataKey="stopCount"
                type="number"
                name="Bus Stops"
                tick={{ fontSize: 10 }}
                label={{ value: 'Bus stops (0.4 mi)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#9ca3af' }}
              />
              <Tooltip content={<CustomTooltip />} />
              {/* Median reference lines */}
              <ReferenceLine x={medianIncomeAll} stroke="#d1d5db" strokeDasharray="4 4" />
              <ReferenceLine y={medianStops} stroke="#d1d5db" strokeDasharray="4 4" />
              <Scatter data={scatterData} isAnimationActive={false}>
                {scatterData.map((entry, index) => {
                  const isSelected = stripNeighborhoodName(entry.name) === key;
                  return (
                    <Cell
                      key={index}
                      fill={isSelected ? '#c8861a' : '#a8c8c8'}
                      stroke={isSelected ? '#92400e' : '#2f5d62'}
                      strokeWidth={isSelected ? 2 : 1}
                      r={isSelected ? 7 : 4}
                    />
                  );
                })}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>

          {/* Quadrant legend */}
          <div className="grid grid-cols-2 gap-1 mt-3 text-[10px] text-gray-500">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
              Upper-left: transit-rich, lower-income (equity win)
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#2f5d62' }} />
              Upper-right: transit-rich, higher-income
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              Lower-left: transit gap, lower-income (equity concern)
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: '#c8861a' }} />
              Lower-right: car-dependent, higher-income
            </div>
          </div>
        </>
      )}

      <div className="mt-4 pt-3 border-t" style={{ borderColor: '#e4ddd2' }}>
        <DataAttribution
          source="SORTA GTFS (bus stops) · CAGIS Neighborhood Centroids · ACS 2022"
          uid="sorta-transit-equity"
        />
      </div>
    </DataCard>
  );
}
