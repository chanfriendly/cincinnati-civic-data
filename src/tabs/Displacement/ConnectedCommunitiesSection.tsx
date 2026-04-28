/**
 * ConnectedCommunitiesSection — Zoning Reform Impact Tracker
 *
 * Tracks building permit activity before and after Cincinnati's Connected
 * Communities zoning reform (effective July 1, 2024), which legalized
 * duplexes, triplexes, and ADUs by-right across most residential zones
 * and reduced parking minimums city-wide.
 *
 * Comparison windows:
 *   Reform Year 1  : July 1, 2024 → June 30, 2025  (first full year under new rules)
 *   Baseline Year  : July 1, 2023 → June 30, 2024  (identical duration, prior rules)
 *
 * Data source: Cincinnati Open Data building permits `uhjb-xac9`
 *
 * TRANSPLANT NOTE: Self-contained — no props required. Can be moved to its own
 * tab by wrapping in a tab shell and adding an App.tsx nav entry.
 */

import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, ReferenceLine,
} from 'recharts';
import { useSODA } from '../../hooks/useSODA';
import { DataCard, DataAttribution, EmptyState } from '../../components/ui';

// ── Date constants ─────────────────────────────────────────────────────────────

/** Date the Connected Communities zoning reform took effect */
const REFORM_DATE = '2024-07-01';
/** End of Reform Year 1 — one full year after reform */
const REFORM_YEAR1_END = '2025-06-30';
/** Start of the baseline year — same duration before the reform */
const BASELINE_START = '2023-07-01';
/** End of the baseline year — day before reform */
const BASELINE_END = '2024-06-30';

// ── Permit type classification ─────────────────────────────────────────────────

/**
 * Non-trade permit types to show in the "By Permit Type" breakdown.
 *
 * Cincinnati's `permittypemapped` field uses structural/trade categories
 * ("Building", "HVAC", "Plumbing Permits", etc.) — not residential/commercial
 * use-type labels. We show the structural types that are NOT pure trade work.
 * "Building" is the main catch-all for all structural permits (residential
 * and commercial alike) and is the category most affected by zoning reform.
 */
const TRADE_KEYWORDS = [
  'hvac',
  'plumbing',
  'electrical',
  'fire suppression',
  'fire protection',
  'elevator',
];

function isStructural(permitType: string): boolean {
  const lower = permitType.toLowerCase();
  return !TRADE_KEYWORDS.some(k => lower.includes(k));
}

// Exclude pure trade permits from all counts
const TRADE_FILTER =
  " AND (permittypemapped IS NULL OR (" +
  "lower(permittypemapped) NOT LIKE '%mechanical%' AND " +
  "lower(permittypemapped) NOT LIKE '%plumbing%' AND " +
  "lower(permittypemapped) NOT LIKE '%electrical%' AND " +
  "lower(permittypemapped) NOT LIKE '%fire suppression%' AND " +
  "lower(permittypemapped) != 'hvac'))";

// ── Sub-components ─────────────────────────────────────────────────────────────

interface ChangeBarProps {
  label: string;
  baseline: number;
  reform: number;
}

function ChangeBar({ label, baseline, reform }: ChangeBarProps) {
  const pct = baseline > 0 ? ((reform - baseline) / baseline) * 100 : null;
  const color =
    pct === null ? '#9ca3af'
    : pct > 20  ? '#16a34a'
    : pct > 0   ? '#65a30d'
    : pct < -20 ? '#dc2626'
    : '#f97316';

  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className="w-36 text-xs text-gray-700 font-medium truncate shrink-0">{label}</div>
      <div className="flex-1 flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${Math.min(100, (reform / Math.max(reform, baseline, 1)) * 100)}%`,
              backgroundColor: color,
            }}
          />
        </div>
        <div className="w-16 text-right shrink-0">
          <span className="text-xs font-bold" style={{ color }}>
            {pct !== null
              ? `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`
              : '—'}
          </span>
        </div>
        <div className="text-xs text-gray-400 w-20 text-right shrink-0">
          {reform.toLocaleString()} permits
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────

type ViewTab = 'overview' | 'byNeighborhood' | 'byType';

export default function ConnectedCommunitiesSection() {
  const [view, setView] = useState<ViewTab>('overview');

  // ── Reform Year 1: city-wide permit counts by neighborhood ───────────────────
  const reformByNeighborhood = useSODA<{ neighborhood: string; count: string }>(
    'uhjb-xac9',
    {
      $select: 'neighborhood, count(*) as count',
      $where: `applieddate >= '${REFORM_DATE}' AND applieddate <= '${REFORM_YEAR1_END}' AND neighborhood IS NOT NULL AND neighborhood != 'N/A'${TRADE_FILTER}`,
      $group: 'neighborhood',
      $order: 'count DESC',
      $limit: 60,
    }
  );

  // ── Baseline Year: city-wide permit counts by neighborhood ───────────────────
  const baselineByNeighborhood = useSODA<{ neighborhood: string; count: string }>(
    'uhjb-xac9',
    {
      $select: 'neighborhood, count(*) as count',
      $where: `applieddate >= '${BASELINE_START}' AND applieddate <= '${BASELINE_END}' AND neighborhood IS NOT NULL AND neighborhood != 'N/A'${TRADE_FILTER}`,
      $group: 'neighborhood',
      $order: 'count DESC',
      $limit: 60,
    }
  );

  // ── Reform Year 1: permit counts by type (city-wide) ────────────────────────
  const reformByType = useSODA<{ permittypemapped: string; count: string }>(
    'uhjb-xac9',
    {
      $select: 'permittypemapped, count(*) as count',
      $where: `applieddate >= '${REFORM_DATE}' AND applieddate <= '${REFORM_YEAR1_END}' AND permittypemapped IS NOT NULL${TRADE_FILTER}`,
      $group: 'permittypemapped',
      $order: 'count DESC',
      $limit: 30,
    }
  );

  // ── Baseline Year: permit counts by type (city-wide) ────────────────────────
  const baselineByType = useSODA<{ permittypemapped: string; count: string }>(
    'uhjb-xac9',
    {
      $select: 'permittypemapped, count(*) as count',
      $where: `applieddate >= '${BASELINE_START}' AND applieddate <= '${BASELINE_END}' AND permittypemapped IS NOT NULL${TRADE_FILTER}`,
      $group: 'permittypemapped',
      $order: 'count DESC',
      $limit: 30,
    }
  );

  const loading =
    reformByNeighborhood.loading ||
    baselineByNeighborhood.loading ||
    reformByType.loading ||
    baselineByType.loading;

  const error =
    reformByNeighborhood.error ||
    baselineByNeighborhood.error ||
    reformByType.error ||
    baselineByType.error;

  // ── City-wide KPIs ────────────────────────────────────────────────────────────
  const cityTotals = useMemo(() => {
    const reformTotal = (reformByNeighborhood.data || []).reduce(
      (s, r) => s + parseInt(r.count, 10), 0
    );
    const baselineTotal = (baselineByNeighborhood.data || []).reduce(
      (s, r) => s + parseInt(r.count, 10), 0
    );
    const reformRes = (reformByType.data || [])
      .filter(r => isStructural(r.permittypemapped || ''))
      .reduce((s, r) => s + parseInt(r.count, 10), 0);
    const baselineRes = (baselineByType.data || [])
      .filter(r => isStructural(r.permittypemapped || ''))
      .reduce((s, r) => s + parseInt(r.count, 10), 0);
    return { reformTotal, baselineTotal, reformRes, baselineRes };
  }, [reformByNeighborhood.data, baselineByNeighborhood.data, reformByType.data, baselineByType.data]);

  const overallPct =
    cityTotals.baselineTotal > 0
      ? ((cityTotals.reformTotal - cityTotals.baselineTotal) / cityTotals.baselineTotal) * 100
      : null;

  const residentialPct =
    cityTotals.baselineRes > 0
      ? ((cityTotals.reformRes - cityTotals.baselineRes) / cityTotals.baselineRes) * 100
      : null;

  // ── Top-20 neighborhoods by reform-year permits with YoY delta ───────────────
  const neighborhoodComparison = useMemo(() => {
    const baseMap = new Map<string, number>();
    (baselineByNeighborhood.data || []).forEach(r => {
      baseMap.set(r.neighborhood, parseInt(r.count, 10) || 0);
    });
    return (reformByNeighborhood.data || [])
      .filter(r => r.neighborhood && r.neighborhood !== 'N/A')
      .map(r => {
        const reform = parseInt(r.count, 10) || 0;
        const baseline = baseMap.get(r.neighborhood) ?? 0;
        const pct = baseline > 0 ? ((reform - baseline) / baseline) * 100 : null;
        return { name: r.neighborhood, reform, baseline, pct };
      })
      .sort((a, b) => b.reform - a.reform)
      .slice(0, 20);
  }, [reformByNeighborhood.data, baselineByNeighborhood.data]);

  // ── Permit type comparison (structural types, trades excluded) ────────────────
  const typeComparison = useMemo(() => {
    const baseMap = new Map<string, number>();
    (baselineByType.data || []).forEach(r => {
      if (r.permittypemapped) baseMap.set(r.permittypemapped, parseInt(r.count, 10) || 0);
    });
    return (reformByType.data || [])
      .filter(r => r.permittypemapped && isStructural(r.permittypemapped))
      .map(r => {
        const reform = parseInt(r.count, 10) || 0;
        const baseline = baseMap.get(r.permittypemapped) ?? 0;
        const pct = baseline > 0 ? ((reform - baseline) / baseline) * 100 : null;
        return { type: r.permittypemapped, reform, baseline, pct };
      })
      .sort((a, b) => b.reform - a.reform);
  }, [reformByType.data, baselineByType.data]);

  const tabs: { id: ViewTab; label: string }[] = [
    { id: 'overview',        label: 'City-Wide Summary' },
    { id: 'byNeighborhood',  label: 'By Neighborhood' },
    { id: 'byType',          label: 'By Permit Type' },
  ];

  return (
    <DataCard
      title="Connected Communities Zoning Reform"
      loading={loading}
      error={error}
      empty={false}
    >
      {/* Reform context banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-5 text-sm text-blue-900">
        <div className="font-semibold mb-1">What changed on July 1, 2024</div>
        <p className="text-blue-800 leading-relaxed">
          Cincinnati's Connected Communities ordinance legalized duplexes, triplexes, and
          accessory dwelling units (ADUs) by-right in most residential zones, and eliminated
          parking minimums city-wide. This tracker compares{' '}
          <strong>Reform Year 1</strong> (Jul 2024 – Jun 2025) against the{' '}
          <strong>prior year</strong> (Jul 2023 – Jun 2024) to measure uptake.
        </p>
      </div>

      {/* View tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 p-1 rounded-lg">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
              view === t.id
                ? 'bg-white text-[#1A4A6B] shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ──────────────────────────────────────────────────────────── */}
      {view === 'overview' && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                All Structural Permits
              </div>
              <div className="flex items-end gap-2">
                <div className="text-2xl font-bold text-[#1A4A6B]">
                  {cityTotals.reformTotal.toLocaleString()}
                </div>
                <div
                  className={`text-sm font-semibold mb-0.5 ${
                    overallPct === null ? 'text-gray-400'
                    : overallPct > 0    ? 'text-green-600'
                    : 'text-red-600'
                  }`}
                >
                  {overallPct !== null
                    ? `${overallPct > 0 ? '+' : ''}${overallPct.toFixed(1)}%`
                    : '—'}
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Reform Year 1 vs. {cityTotals.baselineTotal.toLocaleString()} baseline
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-xs font-bold uppercase tracking-wider text-green-400 mb-2">
                Structural Permits
              </div>
              <div className="flex items-end gap-2">
                <div className="text-2xl font-bold text-green-700">
                  {cityTotals.reformRes.toLocaleString()}
                </div>
                <div
                  className={`text-sm font-semibold mb-0.5 ${
                    residentialPct === null ? 'text-gray-400'
                    : residentialPct > 0    ? 'text-green-600'
                    : 'text-red-600'
                  }`}
                >
                  {residentialPct !== null
                    ? `${residentialPct > 0 ? '+' : ''}${residentialPct.toFixed(1)}%`
                    : '—'}
                </div>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Building, Misc. Structures, Wrecking, Signs, etc.
              </div>
            </div>
          </div>

          {/* Top 10 neighborhoods by reform-year activity */}
          {neighborhoodComparison.length > 0 ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                Top neighborhoods — Reform Year 1 activity
              </div>
              <div className="divide-y divide-gray-100">
                {neighborhoodComparison.slice(0, 10).map(r => (
                  <ChangeBar
                    key={r.name}
                    label={r.name}
                    baseline={r.baseline}
                    reform={r.reform}
                  />
                ))}
              </div>
            </>
          ) : (
            !loading && <EmptyState message="No permit data available" />
          )}
        </>
      )}

      {/* ── BY NEIGHBORHOOD ───────────────────────────────────────────────────── */}
      {view === 'byNeighborhood' && (
        <>
          {neighborhoodComparison.length > 0 ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                Year-over-year change — all structural permits
              </div>
              <ResponsiveContainer width="100%" height={380}>
                <BarChart
                  data={neighborhoodComparison}
                  layout="vertical"
                  margin={{ left: 120, right: 40, top: 4, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
                    tick={{ fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={115}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.length > 20 ? v.slice(0, 18) + '…' : v}
                  />
                  <Tooltip
                    formatter={(val: number) =>
                      [`${val > 0 ? '+' : ''}${val.toFixed(1)}%`, 'YoY change']
                    }
                    labelFormatter={(label: string) => label}
                  />
                  <ReferenceLine x={0} stroke="#374151" strokeWidth={1.5} />
                  <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                    {neighborhoodComparison.map(entry => (
                      <Cell
                        key={entry.name}
                        fill={
                          entry.pct === null ? '#9ca3af'
                          : entry.pct > 20   ? '#16a34a'
                          : entry.pct > 0    ? '#65a30d'
                          : entry.pct < -20  ? '#dc2626'
                          : '#f97316'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-3 text-xs text-gray-500 justify-center flex-wrap">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-[#16a34a]" /> +20%+ growth</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-[#65a30d]" /> 0–20% growth</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-[#f97316]" /> 0–20% decline</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-[#dc2626]" /> 20%+ decline</span>
              </div>
            </>
          ) : (
            !loading && <EmptyState message="No neighborhood data available" />
          )}
        </>
      )}

      {/* ── BY PERMIT TYPE ────────────────────────────────────────────────────── */}
      {view === 'byType' && (
        <>
          {typeComparison.length > 0 ? (
            <>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                Structural permit types — Reform Year 1 vs. Baseline
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={typeComparison} margin={{ bottom: 70, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="type"
                    angle={-40}
                    textAnchor="end"
                    height={80}
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v: string) => v.length > 24 ? v.slice(0, 22) + '…' : v}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const d = typeComparison.find(t => t.type === label);
                      if (!d) return null;
                      return (
                        <div className="bg-white border border-gray-200 rounded shadow p-2 text-xs">
                          <div className="font-semibold mb-1">{label}</div>
                          <div>Reform Year 1: <strong>{d.reform.toLocaleString()}</strong></div>
                          <div>Baseline: <strong>{d.baseline.toLocaleString()}</strong></div>
                          {d.pct !== null && (
                            <div className={d.pct >= 0 ? 'text-green-600' : 'text-red-600'}>
                              Change: {d.pct > 0 ? '+' : ''}{d.pct.toFixed(1)}%
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="baseline" fill="#cbd5e1" radius={[2, 2, 0, 0]} name="Baseline" />
                  <Bar dataKey="reform" radius={[2, 2, 0, 0]} name="Reform Year 1">
                    {typeComparison.map(entry => (
                      <Cell
                        key={entry.type}
                        fill={
                          (entry.pct ?? 0) >= 0 ? '#1A4A6B' : '#dc2626'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 text-xs text-gray-500 justify-center">
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-[#cbd5e1]" /> Baseline year</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-[#1A4A6B]" /> Reform Year 1 (increase)</span>
                <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block bg-[#dc2626]" /> Reform Year 1 (decrease)</span>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                Cincinnati's permit data classifies by trade/structural category, not by residential vs. commercial use.
                "Building" is the main structural category covering all construction types.
                Trade permits (HVAC, plumbing, electrical, fire protection, elevator) excluded.
              </p>
            </>
          ) : (
            !loading && <EmptyState message="No residential permit type data available" />
          )}
        </>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100">
        <DataAttribution source="Building Permits" uid="uhjb-xac9" />
      </div>
    </DataCard>
  );
}
