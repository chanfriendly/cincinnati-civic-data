/**
 * LifeExpectancySection — Neighborhood life expectancy at birth from CDC USALEEP
 * (United States Small-Area Life Expectancy Estimates Project, 2010–2015).
 *
 * Source: /data/neighborhood_life_expectancy.json
 * Built by: scripts/build_life_expectancy.py
 * Data: CDC NCHS/NVSS USALEEP — census tracts mapped to nearest SNA centroid
 *
 * Key equity fact surfaced: Cincinnati's wealthiest and lowest-income neighborhoods
 * show a ~23-year gap in life expectancy (63–87 years), rivaling some of the
 * largest urban life-expectancy disparities in the United States.
 */

import { useState, useEffect, useMemo } from 'react';
import { stripNeighborhoodName } from '../../utils/api';
import { DataCard, DataAttribution } from '../../components/ui';

interface Props {
  neighborhood: string;
}

interface LifeExpRecord {
  name: string;
  lifeExpectancy: number;
  tractCount: number;
  tractSuppressed: number;
  dataYears: string;
  asOf: string;
}

type LifeExpData = Record<string, LifeExpRecord>;

function cityStats(data: LifeExpData) {
  const vals = Object.values(data).map(r => r.lifeExpectancy);
  if (vals.length === 0) return { avg: null, min: null, max: null };
  return {
    avg: Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10,
    min: Math.min(...vals),
    max: Math.max(...vals),
  };
}

export default function LifeExpectancySection({ neighborhood }: Props) {
  const [data, setData] = useState<LifeExpData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/data/neighborhood_life_expectancy.json')
      .then(r => r.json())
      .then(setData)
      .catch(() => setError('Failed to load life expectancy data'))
      .finally(() => setLoading(false));
  }, []);

  const key = stripNeighborhoodName(neighborhood);
  const record = data[key] ?? null;
  const stats = useMemo(() => cityStats(data), [data]);
  const noData = !loading && !error && record == null;

  // Position on the city range for the gradient bar
  const rangePosition = useMemo(() => {
    if (!record || stats.min == null || stats.max == null) return null;
    const range = stats.max - stats.min;
    return range > 0 ? Math.round(((record.lifeExpectancy - stats.min) / range) * 100) : 50;
  }, [record, stats]);

  // Years below/above city average
  const diffFromAvg = record && stats.avg != null
    ? Math.round((record.lifeExpectancy - stats.avg) * 10) / 10
    : null;

  return (
    <DataCard
      title="Life Expectancy"
      loading={loading}
      error={error}
      empty={noData}
    >
      {noData && (
        <p className="text-sm italic" style={{ color: '#6b5f55' }}>
          No life expectancy estimate available for {neighborhood}. Census tracts with
          fewer than 5,000 residents or insufficient death records are suppressed in USALEEP data.
        </p>
      )}

      {record && stats.avg != null && stats.min != null && stats.max != null && (
        <div className="space-y-5">
          {/* Headline number */}
          <div className="flex items-end gap-4">
            <div>
              <div className="text-4xl font-bold leading-none" style={{ color: '#2f5d62' }}>
                {record.lifeExpectancy}
              </div>
              <div className="text-xs mt-1 uppercase tracking-widest" style={{ color: '#6b5f55' }}>
                years at birth
              </div>
            </div>
            <div className="mb-1">
              {diffFromAvg != null && (
                <span
                  className="text-sm font-semibold px-2 py-1 rounded-full border"
                  style={
                    diffFromAvg >= 2
                      ? { background: '#ecefdf', color: '#5a7a3e', borderColor: '#cfd9b2' }
                      : diffFromAvg <= -2
                      ? { background: '#f5e8e1', color: '#b34728', borderColor: '#e6c5b2' }
                      : { background: '#f6f1ea', color: '#6b5f55', borderColor: '#e4ddd2' }
                  }
                >
                  {diffFromAvg > 0 ? '+' : ''}{diffFromAvg} vs city avg ({stats.avg})
                </span>
              )}
            </div>
          </div>

          {/* City-range gradient bar */}
          {rangePosition != null && (
            <div>
              <div className="flex justify-between text-[10px] mb-1" style={{ color: '#6b5f55' }}>
                <span>{stats.min} yrs</span>
                <span className="font-medium">City range</span>
                <span>{stats.max} yrs</span>
              </div>
              <div className="relative h-3 rounded-full overflow-hidden"
                style={{ background: 'linear-gradient(to right, #EF4444, #F59E0B, #22C55E)' }}>
                {/* City average marker */}
                {stats.min != null && stats.max != null && (
                  <div
                    className="absolute top-0 bottom-0 w-0.5 bg-white/70"
                    style={{ left: `${Math.round(((stats.avg - stats.min) / (stats.max - stats.min)) * 100)}%` }}
                    title={`City avg: ${stats.avg}`}
                  />
                )}
                {/* Neighborhood marker */}
                <div
                  className="absolute top-0 bottom-0 w-1 rounded-full"
                  style={{ left: `calc(${rangePosition}% - 2px)`, background: '#2f5d62' }}
                />
              </div>
              <div className="text-[10px] mt-1 text-center" style={{ color: '#6b5f55' }}>
                White line = city average · Blue bar = {record.name}
              </div>
            </div>
          )}

          {/* Equity callout — the 23-year gap */}
          <div className="rounded-lg p-3" style={{ background: '#f5e8e1', border: '1px solid #e6c5b2' }}>
            <div className="text-xs font-semibold mb-1" style={{ color: '#b34728' }}>
              📊 Cincinnati's Life Expectancy Gap
            </div>
            <div className="text-xs" style={{ color: '#b34728' }}>
              As of 2010–2015, the {Math.round(stats.max - stats.min)}-year gap between Cincinnati's highest and
              lowest-expectancy neighborhoods ({stats.min}–{stats.max} yrs) ranked among the
              largest within-city disparities in the U.S. — comparable in magnitude to the
              difference between the U.S. and a low-income country.
            </div>
          </div>

          {/* Data note */}
          <div className="text-[10px] italic space-y-0.5" style={{ color: '#6b5f55' }}>
            <p>
              Estimate based on {record.tractCount} census tract{record.tractCount !== 1 ? 's' : ''}.
              {record.tractCount === 1 && (
                <span className="font-medium" style={{ color: '#c8861a' }}> Single-tract estimate — interpret with caution.</span>
              )}
              {record.tractSuppressed > 0 && (
                <span> {record.tractSuppressed} additional tract{record.tractSuppressed !== 1 ? 's' : ''} suppressed due to small population.</span>
              )}
            </p>
            <p>Data period: {record.dataYears}. Tract-to-neighborhood mapping via nearest SNA centroid.</p>
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t" style={{ borderColor: '#e4ddd2' }}>
        <DataAttribution
          source="CDC NCHS / NVSS · USALEEP 2010–2015"
          url="https://www.cdc.gov/nchs/nvss/usaleep/usaleep.html"
        />
      </div>
    </DataCard>
  );
}
