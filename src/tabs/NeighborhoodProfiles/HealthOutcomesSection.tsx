/**
 * HealthOutcomesSection — CDC PLACES health outcome data by neighborhood.
 *
 * Displays 10 health measures from CDC PLACES (census-tract level, aggregated
 * to Cincinnati SNA neighborhoods) for the selected neighborhood, with city-
 * wide averages for comparison.
 *
 * Data source: /data/neighborhood_health_outcomes.json
 *   — pre-built by scripts/build_health_outcomes.py
 *   — Source: CDC PLACES Local Data for Better Health (Hamilton County, OH)
 *
 * Measures shown:
 *   Chronic conditions: diabetes, obesity, high blood pressure
 *   Mental health:      depression, mental health distress (≥14 bad days/mo)
 *   Behaviors:          smoking, physical inactivity
 *   Access/prevention:  dental visit, health insurance, annual checkup
 */

import { useState, useEffect, useMemo } from 'react';
import { stripNeighborhoodName } from '../../utils/api';
import { DataCard, DataAttribution } from '../../components/ui';

interface Props {
  neighborhood: string; // Display name, e.g. "Avondale"
}

interface HealthOutcomeRecord {
  name: string;
  diabetes?: number;
  obesity?: number;
  highBloodPressure?: number;
  depression?: number;
  mentalHealthDistress?: number;
  smoking?: number;
  physicalInactivity?: number;
  noDentalVisit?: number;
  noHealthInsurance?: number;
  annualCheckup?: number;
  tractCount: number;
  dataYear: string;
  asOf: string;
}

type HealthData = Record<string, HealthOutcomeRecord>;

// Metric display config
interface MetricConfig {
  key: keyof Omit<HealthOutcomeRecord, 'name' | 'tractCount' | 'dataYear' | 'asOf'>;
  label: string;
  description: string;
  /** If true, lower = better (green). If false, higher = better (green). */
  lowerIsBetter: boolean;
  unit: string;
}

const METRICS: MetricConfig[] = [
  // Chronic conditions
  { key: 'diabetes',           label: 'Diagnosed Diabetes',      description: 'Adults diagnosed with diabetes',                     lowerIsBetter: true,  unit: '%' },
  { key: 'obesity',            label: 'Obesity',                  description: 'Adults with BMI ≥ 30',                               lowerIsBetter: true,  unit: '%' },
  { key: 'highBloodPressure',  label: 'High Blood Pressure',      description: 'Adults with diagnosed hypertension',                 lowerIsBetter: true,  unit: '%' },
  // Mental health
  { key: 'depression',         label: 'Depression',               description: 'Adults ever diagnosed with depression',             lowerIsBetter: true,  unit: '%' },
  { key: 'mentalHealthDistress', label: 'Mental Health Distress', description: 'Adults with ≥14 poor mental health days/month',     lowerIsBetter: true,  unit: '%' },
  // Behaviors
  { key: 'smoking',            label: 'Current Smoking',          description: 'Adults who currently smoke cigarettes',             lowerIsBetter: true,  unit: '%' },
  { key: 'physicalInactivity', label: 'Physical Inactivity',      description: 'Adults with no leisure-time physical activity',     lowerIsBetter: true,  unit: '%' },
  // Access / prevention
  { key: 'noDentalVisit',      label: 'No Dental Visit',          description: 'Adults without a dental visit in the past year. Note: higher-income neighborhoods sometimes show elevated rates — residents there tend to space visits further apart and self-report good dental health. This metric does not straightforwardly rank neighborhoods from "worst" to "best."',    lowerIsBetter: true,  unit: '%' },
  { key: 'noHealthInsurance',  label: 'No Health Insurance',      description: 'Adults without any health insurance coverage',      lowerIsBetter: true,  unit: '%' },
  { key: 'annualCheckup',      label: 'Annual Checkup',           description: 'Adults who had a routine checkup in the past year', lowerIsBetter: false, unit: '%' },
];

const METRIC_GROUPS = [
  { label: 'Chronic Conditions', keys: ['diabetes', 'obesity', 'highBloodPressure'] },
  { label: 'Mental Health',      keys: ['depression', 'mentalHealthDistress'] },
  { label: 'Health Behaviors',   keys: ['smoking', 'physicalInactivity'] },
  { label: 'Access & Prevention', keys: ['noDentalVisit', 'noHealthInsurance', 'annualCheckup'] },
] as const;

// Compute city-wide average across all neighborhoods for a given metric
function cityAverage(data: HealthOutcomeRecord[], key: MetricConfig['key']): number | null {
  const vals = data.map((d) => d[key]).filter((v): v is number => typeof v === 'number');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// Color-code a value vs. city average
function ratingColor(
  value: number,
  cityAvg: number,
  lowerIsBetter: boolean
): { bg: string; text: string; label: string } {
  const diff = lowerIsBetter
    ? cityAvg - value  // positive means neighborhood is better
    : value - cityAvg; // positive means neighborhood is better

  if (diff > 3)  return { bg: '#dcfce7', text: '#15803d', label: 'Better than avg' };
  if (diff < -3) return { bg: '#fee2e2', text: '#b91c1c', label: 'Worse than avg'  };
  return           { bg: '#f3f4f6', text: '#374151', label: 'Near city average'  };
}

// Horizontal mini-bar component
function MiniBar({ value, cityAvg, lowerIsBetter }: { value: number; cityAvg: number | null; lowerIsBetter: boolean }) {
  // Bar represents the value as a share of 0–100%
  const barWidth = Math.min(value, 100);
  const avgWidth = cityAvg !== null ? Math.min(cityAvg, 100) : null;
  return (
    <div className="relative h-2 rounded-full overflow-visible mt-1" style={{ background: '#f6f1ea' }}>
      <div
        className="absolute left-0 top-0 h-2 rounded-full"
        style={{
          width: `${barWidth}%`,
          backgroundColor: cityAvg !== null
            ? (lowerIsBetter
                ? (value > cityAvg + 3 ? '#fca5a5' : value < cityAvg - 3 ? '#86efac' : '#93c5fd')
                : (value < cityAvg - 3 ? '#fca5a5' : value > cityAvg + 3 ? '#86efac' : '#93c5fd'))
            : '#93c5fd',
        }}
      />
      {avgWidth !== null && (
        <div
          className="absolute top-[-2px] w-0.5 h-3 bg-gray-500 rounded-full"
          style={{ left: `${avgWidth}%` }}
          title={`City average: ${cityAvg?.toFixed(1)}%`}
        />
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HealthOutcomesSection({ neighborhood }: Props) {
  const [rawData, setRawData] = useState<HealthData>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/data/neighborhood_health_outcomes.json')
      .then((r) => r.json())
      .then(setRawData)
      .catch(() => setError('Failed to load health outcome data'))
      .finally(() => setLoading(false));
  }, []);

  const key = stripNeighborhoodName(neighborhood);

  const selected = useMemo<HealthOutcomeRecord | null>(
    () => rawData[key] ?? null,
    [rawData, key]
  );

  const allRecords = useMemo(() => Object.values(rawData), [rawData]);

  // City-wide averages for each metric
  const cityAvgs = useMemo(() => {
    return Object.fromEntries(
      METRICS.map((m) => [m.key, cityAverage(allRecords, m.key)])
    ) as Record<string, number | null>;
  }, [allRecords]);

  const metricLookup = useMemo(
    () => Object.fromEntries(METRICS.map((m) => [m.key, m])),
    []
  );

  return (
    <DataCard
      title="Health Outcomes (CDC PLACES)"
      loading={loading}
      error={error}
      empty={!loading && !error && !selected}
    >
      {!selected && !loading && (
        <p className="text-sm italic" style={{ color: '#6b5f55' }}>
          No health outcome data available for {neighborhood}. CDC PLACES covers most, but not all, Cincinnati neighborhoods.
        </p>
      )}

      {selected && (
        <>
          {/* Header row */}
          <div className="flex items-center gap-3 mb-4">
            <div className="rounded-lg px-3 py-2 text-center" style={{ background: '#e6efef' }}>
              <div className="text-xl font-bold" style={{ color: '#2f5d62' }}>{selected.tractCount}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#2f5d62' }}>Census Tracts</div>
            </div>
            <div className="text-xs" style={{ color: '#6b5f55' }}>
              <p>Data from <span className="font-medium" style={{ color: '#1a1410' }}>{selected.dataYear}</span>. Values are percentages of adults in each category.</p>
              <p className="mt-0.5">The vertical bar (|) on each row marks the Cincinnati-wide average.</p>
            </div>
          </div>

          {/* Metric groups */}
          {METRIC_GROUPS.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2 pb-1" style={{ color: '#6b5f55', borderBottom: '1px solid #e4ddd2' }}>
                {group.label}
              </div>
              <div className="space-y-3">
                {group.keys.map((metricKey) => {
                  const cfg = metricLookup[metricKey];
                  if (!cfg) return null;
                  const val = selected[metricKey as keyof HealthOutcomeRecord] as number | undefined;
                  const avg = cityAvgs[metricKey];
                  if (val === undefined) return null;

                  const rating = avg !== null ? ratingColor(val, avg, cfg.lowerIsBetter) : null;

                  return (
                    <div key={metricKey}>
                      <div className="flex items-baseline justify-between">
                        <div>
                          <span className="text-sm font-medium" style={{ color: '#1a1410' }}>{cfg.label}</span>
                          <span className="text-[10px] ml-1.5" style={{ color: '#6b5f55' }}>{cfg.description}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-sm font-bold" style={{ color: '#1a1410' }}>{val.toFixed(1)}{cfg.unit}</span>
                          {rating && (
                            <span
                              className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: rating.bg, color: rating.text }}
                            >
                              {rating.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <MiniBar value={val} cityAvg={avg} lowerIsBetter={cfg.lowerIsBetter} />
                      {avg !== null && (
                        <div className="text-[9px] mt-0.5" style={{ color: '#6b5f55' }}>
                          City avg: {avg.toFixed(1)}%
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Disclosure */}
          <div className="rounded-lg p-3 mt-2 text-[11px]" style={{ background: '#f5e8e1', border: '1px solid #e6c5b2', color: '#b34728' }}>
            <p className="font-semibold mb-0.5">Methodology note</p>
            <p>
              CDC PLACES data is collected at the census tract level and aggregated here to Cincinnati SNA neighborhoods
              using a nearest-centroid method. Neighborhoods with fewer census tracts may show more variability.
              Data reflects model-based estimates from survey data — not direct measurement.
            </p>
          </div>
        </>
      )}

      <div className="mt-4 pt-3 border-t" style={{ borderColor: '#e4ddd2' }}>
        <DataAttribution
          source={`CDC PLACES: Local Data for Better Health · Hamilton County, OH · ${selected?.dataYear ?? 'N/A'}`}
          url="https://www.cdc.gov/places/"
        />
      </div>
    </DataCard>
  );
}
