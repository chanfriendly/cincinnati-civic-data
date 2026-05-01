/**
 * ExpandedDemographicsSection — Age structure, languages, foreign-born,
 * educational attainment, household type, and broadband/internet access
 * for the selected SNA neighborhood.
 *
 * Source: /data/neighborhood_demographics.json
 * Built by: scripts/build_demographics.py
 * Data: ACS 5-Year 2022 (Census tracts → nearest SNA centroid)
 */

import { useState, useEffect, useMemo } from 'react';
import { stripNeighborhoodName } from '../../utils/api';
import { DataCard, DataAttribution } from '../../components/ui';

interface Props {
  neighborhood: string;
}

interface DemoRecord {
  name: string;
  tractCount: number;
  totalPopulation: number;
  medianAge: number | null;
  under18Pct: number | null;
  over65Pct: number | null;
  nonEnglishHomePct: number | null;
  foreignBornPct: number | null;
  hsCompletionPct: number | null;
  bachelorsPlusPct: number | null;
  livingAlonePct: number | null;
  broadbandPct: number | null;
  noInternetPct: number | null;
  dataYear: string;
}

type DemoData = Record<string, DemoRecord>;

// Compute city-wide averages once across all neighborhoods (population-weighted where possible)
function cityAverages(data: DemoData): Partial<DemoRecord> {
  const records = Object.values(data);
  if (records.length === 0) return {};

  const avg = (field: keyof DemoRecord) => {
    const vals = records.map(r => r[field]).filter((v): v is number => typeof v === 'number');
    return vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  };

  return {
    medianAge: avg('medianAge'),
    under18Pct: avg('under18Pct'),
    over65Pct: avg('over65Pct'),
    nonEnglishHomePct: avg('nonEnglishHomePct'),
    foreignBornPct: avg('foreignBornPct'),
    hsCompletionPct: avg('hsCompletionPct'),
    bachelorsPlusPct: avg('bachelorsPlusPct'),
    livingAlonePct: avg('livingAlonePct'),
    broadbandPct: avg('broadbandPct'),
    noInternetPct: avg('noInternetPct'),
  };
}

// Mini horizontal bar component
function MiniBar({ value, max = 100, color = '#1A4A6B' }: { value: number; max?: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}

// Comparison badge: how does this neighborhood compare to city avg?
function CmpBadge({ value, cityAvg, higherIsBetter = true }: { value: number; cityAvg: number | null | undefined; higherIsBetter?: boolean }) {
  if (cityAvg == null) return null;
  const diff = value - cityAvg;
  const threshold = 3;
  const better = higherIsBetter ? diff > threshold : diff < -threshold;
  const worse  = higherIsBetter ? diff < -threshold : diff > threshold;

  if (better) return <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">above avg</span>;
  if (worse)  return <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">below avg</span>;
  return <span className="ml-1.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-500 border border-gray-200">near avg</span>;
}

interface StatRowProps {
  label: string;
  value: number | null;
  cityAvg?: number | null;
  suffix?: string;
  higherIsBetter?: boolean;
  barColor?: string;
  maxBar?: number;
}

function StatRow({ label, value, cityAvg, suffix = '%', higherIsBetter = true, barColor, maxBar = 100 }: StatRowProps) {
  if (value == null) return null;
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600">{label}</span>
        <div className="flex items-center">
          <span className="text-xs font-semibold text-gray-900">{value}{suffix}</span>
          {cityAvg != null && <CmpBadge value={value} cityAvg={cityAvg} higherIsBetter={higherIsBetter} />}
        </div>
      </div>
      <MiniBar value={value} max={maxBar} color={barColor ?? '#1A4A6B'} />
    </div>
  );
}

export default function ExpandedDemographicsSection({ neighborhood }: Props) {
  const [data, setData] = useState<DemoData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/neighborhood_demographics.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => setError('Failed to load demographics data'))
      .finally(() => setLoading(false));
  }, []);

  const key = stripNeighborhoodName(neighborhood);
  const record = data[key] ?? null;
  const cityAvg = useMemo(() => cityAverages(data), [data]);

  const noData = !loading && !error && record == null;

  return (
    <DataCard
      title="Demographics"
      loading={loading}
      error={error}
      empty={noData}
    >
      {record && (
        <div className="space-y-5">
          {/* Population headline */}
          <div className="flex items-center gap-4 pb-3 border-b border-gray-100">
            <div className="text-center">
              <div className="text-xl font-bold text-[#1A4A6B]">{record.totalPopulation.toLocaleString()}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-widest">Total Population</div>
            </div>
            {record.medianAge != null && (
              <div className="text-center">
                <div className="text-xl font-bold text-[#1A4A6B]">{record.medianAge}</div>
                <div className="text-[10px] text-gray-500 uppercase tracking-widest">Median Age</div>
              </div>
            )}
          </div>
          {record.tractCount >= 6 && (
            <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠ Population count may be over-estimated. This neighborhood's centroid aligns with {record.tractCount} Census tracts, some of which may extend into adjacent areas. Use the figure as an approximate order of magnitude.
            </div>
          )}

          {/* Age structure */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Age Structure</div>
            <div className="divide-y divide-gray-50">
              <StatRow label="Under 18" value={record.under18Pct} cityAvg={cityAvg.under18Pct} barColor="#3B82F6" />
              <StatRow label="65 and older" value={record.over65Pct} cityAvg={cityAvg.over65Pct} barColor="#8B5CF6" />
            </div>
          </div>

          {/* Origin & Language */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Origin & Language</div>
            <div className="divide-y divide-gray-50">
              <StatRow label="Speak non-English at home" value={record.nonEnglishHomePct} cityAvg={cityAvg.nonEnglishHomePct} barColor="#F59E0B" />
              <StatRow label="Foreign-born" value={record.foreignBornPct} cityAvg={cityAvg.foreignBornPct} barColor="#10B981" />
            </div>
          </div>

          {/* Education */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Education (Pop. 25+)</div>
            <div className="divide-y divide-gray-50">
              <StatRow label="HS diploma or higher" value={record.hsCompletionPct} cityAvg={cityAvg.hsCompletionPct} barColor="#1A4A6B" />
              <StatRow label="Bachelor's degree or higher" value={record.bachelorsPlusPct} cityAvg={cityAvg.bachelorsPlusPct} barColor="#2563EB" />
            </div>
          </div>

          {/* Household */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Household Type</div>
            <div className="divide-y divide-gray-50">
              <StatRow label="Living alone (of all households)" value={record.livingAlonePct} cityAvg={cityAvg.livingAlonePct} barColor="#6366F1" />
            </div>
          </div>

          {/* Broadband */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Internet Access</div>
            <div className="divide-y divide-gray-50">
              <StatRow label="Broadband (cable/fiber/DSL)" value={record.broadbandPct} cityAvg={cityAvg.broadbandPct} barColor="#059669" />
              <StatRow
                label="No internet access"
                value={record.noInternetPct}
                cityAvg={cityAvg.noInternetPct}
                higherIsBetter={false}
                barColor="#EF4444"
              />
            </div>
          </div>

          <p className="text-[10px] text-gray-400 italic pt-1">
            Data: ACS 5-Year 2022. Census tracts mapped to neighborhoods via nearest-centroid approximation.
            {record.tractCount > 1 ? ` Aggregated across ${record.tractCount} tracts; tracts near neighborhood boundaries may span adjacent areas.` : ''}
          </p>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-gray-100">
        <DataAttribution source="U.S. Census Bureau · American Community Survey 5-Year 2022" url="https://www.census.gov/programs-surveys/acs" />
      </div>
    </DataCard>
  );
}
