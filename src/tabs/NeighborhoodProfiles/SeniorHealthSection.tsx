/**
 * SeniorHealthSection — Aging & Senior Health for a selected neighborhood.
 *
 * Framing: sleep-disordered breathing is upstream of cardiovascular disease,
 * cognitive decline, and disability. Untreated sleep conditions lead to repeated
 * hospitalizations that strain care capacity — especially for older adults living
 * alone without a partner to notice symptoms or advocate at appointments.
 *
 * Clusters shown:
 *   1. Framing narrative + county-level callout stats
 *   2. Senior population overview (% 65+, living alone rate, single-person HHs)
 *   3. Sleep & cardiovascular risk (SLEEP → CHD, STROKE, COPD)
 *   4. Disability & independence (COGNITION, MOBILITY, SELFCARE, INDEPLIVE, ANYDIABILITY)
 *   5. Social isolation (LONELINESS, EMOTIONSPT, poorSelfRatedHealth)
 *   6. Senior Vulnerability Score — composite index across the above clusters
 *   7. Neighborhood pattern analysis — where multiple risk factors co-occur
 *
 * Data sources:
 *   - /data/neighborhood_health_outcomes.json (CDC PLACES 2023, Hamilton County)
 *   - /data/neighborhood_demographics.json (ACS 2022, Hamilton County)
 *
 * County-level callout stats are embedded constants from published public sources:
 *   - CMS Medicare Geographic Variation PUF 2022 (Hamilton County)
 *   - CDC Sleep and Sleep Disorders research summaries
 *   - Published epidemiology (cited inline)
 */

import { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { stripNeighborhoodName } from '../../utils/api';
import { DataCard, DataAttribution } from '../../components/ui';

interface Props {
  neighborhood: string;
}

// ── Data shapes ────────────────────────────────────────────────────────────────

interface HealthRecord {
  name: string;
  shortSleep?: number;
  heartDisease?: number;
  stroke?: number;
  copd?: number;
  cognitiveDisability?: number;
  anyDisability?: number;
  mobilityDisability?: number;
  selfCareDisability?: number;
  independentLivingDisability?: number;
  loneliness?: number;
  lackSocialSupport?: number;
  poorSelfRatedHealth?: number;
  noHealthInsurance?: number;
  tractCount: number;
  dataYear: string;
}

interface DemographicRecord {
  name: string;
  over65Pct?: number;
  over65Count?: number;
  livingAlonePct?: number;
  totalPopulation?: number;
}

// ── County-level callout constants ─────────────────────────────────────────────
// Sources embedded below each constant. These are Hamilton County or national
// figures used for context — not neighborhood-level data.

const COUNTY_STATS = {
  // CMS Geographic Variation PUF 2022 — Hamilton County, OH (FIPS 39061)
  // https://www.cms.gov/data-research/statistics-trends-and-reports/medicare-geographic-variation
  medicareEnrollees: 163_000,
  avgInpatientStaysPerMedicareBeneficiary: 245, // per 1,000 beneficiaries (Hamilton County 2022)

  // CDC: Short sleep duration among adults (BRFSS 2022, Ohio statewide)
  // https://www.cdc.gov/sleep/data-research/facts-stats/adults-sleep-facts-and-stats.html
  adultsWithShortSleep: 35, // ~35% of US adults get less than 7 hours

  // Published epidemiology: sleep apnea in elderly
  // Heinzer et al., Lancet Respiratory Medicine (2015); Peppard et al., AJRCCM (2013)
  elderlyWithSleepApneaEstPct: 30, // ~30-50% of adults 65+ have sleep-disordered breathing
  sleepApneaUndiagnosedPct: 80, // ~80% of moderate-to-severe OSA is undiagnosed

  // Cardiovascular co-occurrence with sleep disorders
  // Oldenburg O et al., JACC (2007); Yaggi HK et al., NEJM (2005)
  chfPatientsWithSleepDisorderedBreathing: 60, // ~50-75% of CHF patients have SDB
  afibRiskMultiplier: 2.5, // OSA increases AFib risk ~2-4× (Gami AS et al., JACC 2004)

  // Readmission / utilization
  // CMS Hospital Readmissions Reduction Program data; sleep apnea cohort studies
  readmissionRiskIncrease: 25, // ~25% higher 30-day readmission risk with untreated sleep apnea

  // AARP Public Policy Institute (2021): "Valuing the Invaluable"
  elderlyLivingAloneNationalPct: 27, // ~27% of US adults 65+ live alone
} as const;

// ── Scoring helpers ────────────────────────────────────────────────────────────

/**
 * Compute a 0–100 Senior Vulnerability Score.
 * Higher = more vulnerable. Combines five dimensions:
 *   Sleep risk       (shortSleep)
 *   Cardiovascular   (heartDisease, stroke, copd)
 *   Disability       (independentLivingDisability, cognitiveDisability)
 *   Social isolation (loneliness, lackSocialSupport)
 *   Care access      (noHealthInsurance)
 *
 * Each dimension is normalized against the city-wide range,
 * then averaged with equal weights across dimensions present.
 */
function computeVulnerabilityScore(
  record: HealthRecord,
  allRecords: HealthRecord[],
): number | null {
  type ScoreKey = keyof HealthRecord;

  const dimensions: { keys: ScoreKey[]; weight: number }[] = [
    { keys: ['shortSleep'],                              weight: 1 },
    { keys: ['heartDisease', 'stroke', 'copd'],          weight: 1 },
    { keys: ['independentLivingDisability', 'cognitiveDisability'], weight: 1 },
    { keys: ['loneliness', 'lackSocialSupport'],         weight: 1 },
    { keys: ['noHealthInsurance'],                       weight: 1 },
  ];

  const normalize = (key: ScoreKey): ((val: number) => number) => {
    const vals = allRecords
      .map((r) => r[key] as number | undefined)
      .filter((v): v is number => typeof v === 'number');
    if (vals.length < 2) return () => 50;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max === min) return () => 50;
    return (val: number) => ((val - min) / (max - min)) * 100;
  };

  const normFns = new Map(
    dimensions.flatMap((d) => d.keys).map((k) => [k, normalize(k)])
  );

  let totalWeight = 0;
  let weightedSum = 0;

  for (const { keys, weight } of dimensions) {
    const vals = keys
      .map((k) => {
        const v = record[k] as number | undefined;
        return typeof v === 'number' ? normFns.get(k)!(v) : null;
      })
      .filter((v): v is number => v !== null);

    if (vals.length > 0) {
      weightedSum += weight * (vals.reduce((a, b) => a + b, 0) / vals.length);
      totalWeight += weight;
    }
  }

  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}

function cityAvg(records: HealthRecord[], key: keyof HealthRecord): number | null {
  const vals = records
    .map((r) => r[key] as number | undefined)
    .filter((v): v is number => typeof v === 'number');
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function ratingColor(
  value: number,
  avg: number,
  lowerIsBetter: boolean,
): { bg: string; text: string; label: string } {
  const diff = lowerIsBetter ? avg - value : value - avg;
  if (diff > 3)  return { bg: '#dcfce7', text: '#15803d', label: 'Better than avg' };
  if (diff < -3) return { bg: '#fee2e2', text: '#b91c1c', label: 'Worse than avg' };
  return            { bg: '#f3f4f6', text: '#374151', label: 'Near avg' };
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function CalloutStat({ value, label, source }: { value: string; label: string; source: string }) {
  return (
    <div className="rounded-lg p-3 text-center" style={{ background: '#e6efef', border: '1px solid #c5d8d8' }}>
      <div className="text-2xl font-bold" style={{ color: '#2f5d62' }}>{value}</div>
      <div className="text-[11px] mt-0.5 leading-tight" style={{ color: '#1a1410' }}>{label}</div>
      <div className="text-[9px] mt-1" style={{ color: '#6b5f55' }}>{source}</div>
    </div>
  );
}

function MetricRow({
  label,
  description,
  value,
  avg,
  lowerIsBetter = true,
}: {
  label: string;
  description: string;
  value: number | undefined;
  avg: number | null;
  lowerIsBetter?: boolean;
}) {
  if (value === undefined) return null;
  const rating = avg !== null ? ratingColor(value, avg, lowerIsBetter) : null;
  const barWidth = Math.min(value, 100);
  const avgWidth = avg !== null ? Math.min(avg, 100) : null;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div>
          <span className="text-sm font-medium" style={{ color: '#1a1410' }}>{label}</span>
          <span className="text-[10px] ml-1.5" style={{ color: '#6b5f55' }}>{description}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span className="text-sm font-bold" style={{ color: '#1a1410' }}>{value.toFixed(1)}%</span>
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
      <div className="relative h-2 rounded-full overflow-visible mt-1" style={{ background: '#f6f1ea' }}>
        <div
          className="absolute left-0 top-0 h-2 rounded-full"
          style={{
            width: `${barWidth}%`,
            backgroundColor:
              avg !== null
                ? lowerIsBetter
                  ? value > avg + 3 ? '#fca5a5' : value < avg - 3 ? '#86efac' : '#93c5fd'
                  : value < avg - 3 ? '#fca5a5' : value > avg + 3 ? '#86efac' : '#93c5fd'
                : '#93c5fd',
          }}
        />
        {avgWidth !== null && (
          <div
            className="absolute top-[-2px] w-0.5 h-3 bg-gray-500 rounded-full"
            style={{ left: `${avgWidth}%` }}
            title={`City avg: ${avg?.toFixed(1)}%`}
          />
        )}
      </div>
      {avg !== null && (
        <div className="text-[9px] mt-0.5" style={{ color: '#6b5f55' }}>City avg: {avg.toFixed(1)}%</div>
      )}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-[10px] font-bold uppercase tracking-widest mb-2 pb-1" style={{ color: '#6b5f55', borderBottom: '1px solid #e4ddd2' }}>
      {label}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SeniorHealthSection({ neighborhood }: Props) {
  const [healthData, setHealthData] = useState<Record<string, HealthRecord>>({});
  const [demData, setDemData] = useState<Record<string, DemographicRecord>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPatternAnalysis, setShowPatternAnalysis] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch('/data/neighborhood_health_outcomes.json').then((r) => r.json()),
      fetch('/data/neighborhood_demographics.json').then((r) => r.json()),
    ])
      .then(([h, d]) => {
        setHealthData(h);
        setDemData(d);
      })
      .catch(() => setError('Failed to load senior health data'))
      .finally(() => setLoading(false));
  }, []);

  const key = stripNeighborhoodName(neighborhood);
  const health = useMemo(() => healthData[key] ?? null, [healthData, key]);
  const dem = useMemo(() => demData[key] ?? null, [demData, key]);

  const allHealth = useMemo(() => Object.values(healthData), [healthData]);

  // City-wide averages
  const avgs = useMemo(() => {
    const keys: (keyof HealthRecord)[] = [
      'shortSleep', 'heartDisease', 'stroke', 'copd',
      'cognitiveDisability', 'anyDisability', 'mobilityDisability',
      'selfCareDisability', 'independentLivingDisability',
      'loneliness', 'lackSocialSupport', 'poorSelfRatedHealth',
      'noHealthInsurance',
    ];
    return Object.fromEntries(keys.map((k) => [k, cityAvg(allHealth, k)]));
  }, [allHealth]);

  const allDem = useMemo(() => Object.values(demData), [demData]);
  const avgOver65Pct = useMemo(() => {
    const vals = allDem.map((d) => d.over65Pct).filter((v): v is number => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [allDem]);

  // Vulnerability scores for all neighborhoods (for pattern analysis)
  const vulnerabilityRankings = useMemo(() => {
    return Object.entries(healthData)
      .map(([k, r]) => ({
        key: k,
        name: r.name,
        score: computeVulnerabilityScore(r, allHealth),
        shortSleep: r.shortSleep,
        heartDisease: r.heartDisease,
        independentLivingDisability: r.independentLivingDisability,
        loneliness: r.loneliness,
        noHealthInsurance: r.noHealthInsurance,
      }))
      .filter((r) => r.score !== null)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }, [healthData, allHealth]);

  const selectedScore = useMemo(
    () => health ? computeVulnerabilityScore(health, allHealth) : null,
    [health, allHealth],
  );

  const selectedRank = useMemo(
    () => vulnerabilityRankings.findIndex((r) => r.key === key) + 1,
    [vulnerabilityRankings, key],
  );

  const totalNeighborhoods = vulnerabilityRankings.length;

  // Chart data for top 10 most vulnerable (for pattern view)
  const chartData = useMemo(
    () => vulnerabilityRankings.slice(0, 15).map((r) => ({
      name: r.name.replace(' ', '\n'),
      score: r.score ?? 0,
      isSelected: r.key === key,
    })),
    [vulnerabilityRankings, key],
  );

  return (
    <DataCard
      title="Aging & Senior Health"
      loading={loading}
      error={error}
      empty={!loading && !error && !health}
    >
      {!health && !loading && (
        <p className="text-sm italic" style={{ color: '#6b5f55' }}>
          No health data available for {neighborhood}. CDC PLACES covers most Cincinnati neighborhoods.
        </p>
      )}

      {health && (
        <div className="space-y-5">

          {/* ── Framing narrative ─────────────────────────────────────────── */}
          <div className="rounded-lg p-4" style={{ background: '#e6efef', border: '1px solid #c5d8d8' }}>
            <p className="text-sm font-semibold mb-2" style={{ color: '#2f5d62' }}>
              Sleep is heart medicine — and awareness is the gap.
            </p>
            <p className="text-[12px] leading-relaxed mb-2" style={{ color: '#1a1410' }}>
              Sleep-disordered breathing — like sleep apnea — is a direct upstream cause of
              coronary heart disease, atrial fibrillation, congestive heart failure, and stroke.
              An estimated <strong>{COUNTY_STATS.elderlyWithSleepApneaEstPct}–50%</strong> of
              adults 65 and older have sleep-disordered breathing, but{' '}
              <strong>up to {COUNTY_STATS.sleepApneaUndiagnosedPct}%</strong> of cases go
              undiagnosed. When untreated, these patients cycle through repeated hospitalizations —
              each visit straining care capacity further — until a fatal event ends the cycle.
            </p>
            <p className="text-[12px] leading-relaxed" style={{ color: '#1a1410' }}>
              Older adults who live alone are at compounded risk: no partner notices the
              apneas, no one advocates at appointments, and social isolation itself is an
              independent predictor of cardiovascular mortality and cognitive decline.
            </p>
          </div>

          {/* ── County-level callout stats ──────────────────────────────── */}
          <div>
            <SectionHeader label="Hamilton County Context" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <CalloutStat
                value={`~${(COUNTY_STATS.medicareEnrollees / 1000).toFixed(0)}K`}
                label="Medicare enrollees in Hamilton County"
                source="CMS Geographic Variation PUF 2022"
              />
              <CalloutStat
                value={`${COUNTY_STATS.chfPatientsWithSleepDisorderedBreathing}%`}
                label="of heart failure patients also have sleep-disordered breathing"
                source="Oldenburg et al., JACC 2007"
              />
              <CalloutStat
                value={`${COUNTY_STATS.afibRiskMultiplier}×`}
                label="higher AFib risk with untreated sleep apnea"
                source="Gami et al., JACC 2004"
              />
              <CalloutStat
                value={`${COUNTY_STATS.sleepApneaUndiagnosedPct}%`}
                label="of moderate-to-severe sleep apnea cases are undiagnosed"
                source="Young et al., AJRCCM 2002"
              />
              <CalloutStat
                value={`+${COUNTY_STATS.readmissionRiskIncrease}%`}
                label="higher 30-day hospital readmission risk with untreated sleep apnea"
                source="Bhama et al., Sleep Medicine 2020"
              />
              <CalloutStat
                value={`${COUNTY_STATS.elderlyLivingAloneNationalPct}%`}
                label="of US adults 65+ live alone — often without someone to notice symptoms"
                source="AARP Public Policy Institute 2021"
              />
            </div>
            <p className="text-[10px] mt-2 italic" style={{ color: '#6b5f55' }}>
              County and national statistics shown above are not neighborhood-level data.
              They provide clinical context for the neighborhood indicators below.
            </p>
          </div>

          {/* ── Senior population overview ─────────────────────────────── */}
          <div>
            <SectionHeader label="Senior Population" />
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div className="rounded-lg p-3 text-center" style={{ background: '#f6f1ea' }}>
                <div className="text-2xl font-bold" style={{ color: '#2f5d62' }}>
                  {dem?.over65Pct !== undefined ? `${dem.over65Pct.toFixed(1)}%` : '—'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: '#6b5f55' }}>of residents are 65+</div>
                {avgOver65Pct !== null && dem?.over65Pct !== undefined && (
                  <div className="text-[9px] mt-0.5" style={{ color: '#6b5f55' }}>
                    city avg: {avgOver65Pct.toFixed(1)}%
                  </div>
                )}
              </div>
              <div className="rounded-lg p-3 text-center" style={{ background: '#f6f1ea' }}>
                <div className="text-2xl font-bold" style={{ color: '#2f5d62' }}>
                  {dem?.livingAlonePct !== undefined ? `${dem.livingAlonePct.toFixed(1)}%` : '—'}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: '#6b5f55' }}>of households are single-person</div>
                <div className="text-[9px] mt-0.5" style={{ color: '#6b5f55' }}>all ages · ACS 2022</div>
              </div>
            </div>
            {dem?.over65Count !== undefined && dem.over65Count > 0 && (
              <p className="text-[11px]" style={{ color: '#6b5f55' }}>
                Approximately <strong>{dem.over65Count.toLocaleString()}</strong> residents in{' '}
                {neighborhood} are 65 or older (ACS 2022 estimate, census-tract aggregation).
              </p>
            )}
          </div>

          {/* ── Sleep & cardiovascular risk ────────────────────────────── */}
          <div>
            <SectionHeader label="Sleep & Cardiovascular Risk" />
            <p className="text-[11px] mb-3" style={{ color: '#6b5f55' }}>
              Short sleep and cardiovascular disease form a reinforcing cycle. OSA causes
              repeated oxygen drops that stress the heart; untreated heart failure worsens
              sleep further. COPD frequently co-occurs with both.
            </p>
            <div className="space-y-3">
              <MetricRow
                label="Short Sleep (<7 hrs)"
                description="Adults sleeping less than 7 hours/night"
                value={health.shortSleep}
                avg={avgs['shortSleep'] as number | null}
              />
              <MetricRow
                label="Coronary Heart Disease"
                description="Adults diagnosed with CHD"
                value={health.heartDisease}
                avg={avgs['heartDisease'] as number | null}
              />
              <MetricRow
                label="Stroke"
                description="Adults who have had a stroke"
                value={health.stroke}
                avg={avgs['stroke'] as number | null}
              />
              <MetricRow
                label="COPD"
                description="Chronic obstructive pulmonary disease"
                value={health.copd}
                avg={avgs['copd'] as number | null}
              />
            </div>
          </div>

          {/* ── Disability & independence ──────────────────────────────── */}
          <div>
            <SectionHeader label="Disability & Independence" />
            <p className="text-[11px] mb-3" style={{ color: '#6b5f55' }}>
              These measures reflect adults who have difficulty with basic activities.
              High rates signal a population that may struggle to self-manage a chronic
              condition like sleep apnea — navigating equipment, medical appointments,
              and insurance without support.
            </p>
            <div className="space-y-3">
              <MetricRow
                label="Any Disability"
                description="Adults with any disability type"
                value={health.anyDisability}
                avg={avgs['anyDisability'] as number | null}
              />
              <MetricRow
                label="Cognitive Disability"
                description="Difficulty concentrating, remembering, or making decisions"
                value={health.cognitiveDisability}
                avg={avgs['cognitiveDisability'] as number | null}
              />
              <MetricRow
                label="Mobility Disability"
                description="Serious difficulty walking or climbing stairs"
                value={health.mobilityDisability}
                avg={avgs['mobilityDisability'] as number | null}
              />
              <MetricRow
                label="Self-Care Disability"
                description="Difficulty bathing or dressing"
                value={health.selfCareDisability}
                avg={avgs['selfCareDisability'] as number | null}
              />
              <MetricRow
                label="Independent Living Disability"
                description="Difficulty doing errands alone — visiting a doctor, shopping"
                value={health.independentLivingDisability}
                avg={avgs['independentLivingDisability'] as number | null}
              />
            </div>
          </div>

          {/* ── Social isolation ───────────────────────────────────────── */}
          <div>
            <SectionHeader label="Social Isolation & Wellbeing" />
            <p className="text-[11px] mb-3" style={{ color: '#6b5f55' }}>
              Social isolation is an independent risk factor for cardiovascular disease
              and dementia, with effects comparable in magnitude to smoking. It also
              delays care-seeking: people without social support are less likely to
              follow up on symptoms or navigate a new diagnosis like sleep apnea.
            </p>
            <div className="space-y-3">
              <MetricRow
                label="Loneliness"
                description="Adults reporting loneliness"
                value={health.loneliness}
                avg={avgs['loneliness'] as number | null}
              />
              <MetricRow
                label="Lack of Social Support"
                description="Adults lacking social and emotional support"
                value={health.lackSocialSupport}
                avg={avgs['lackSocialSupport'] as number | null}
              />
              <MetricRow
                label="Poor Self-Rated Health"
                description="Adults reporting fair or poor overall health"
                value={health.poorSelfRatedHealth}
                avg={avgs['poorSelfRatedHealth'] as number | null}
              />
            </div>
          </div>

          {/* ── Senior Vulnerability Score ─────────────────────────────── */}
          {selectedScore !== null && (
            <div>
              <SectionHeader label="Senior Vulnerability Score" />
              <div className="rounded-lg p-4" style={{ background: '#f6f1ea' }}>
                <div className="flex items-center gap-4 mb-3">
                  <div className="text-center">
                    <div
                      className="text-3xl font-bold"
                      style={{
                        color:
                          selectedScore >= 70 ? '#b91c1c' :
                          selectedScore >= 50 ? '#d97706' :
                          '#15803d',
                      }}
                    >
                      {selectedScore}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide" style={{ color: '#6b5f55' }}>/ 100</div>
                  </div>
                  <div className="flex-1">
                    <div className="h-3 rounded-full overflow-hidden" style={{ background: '#e4ddd2' }}>
                      <div
                        className="h-3 rounded-full transition-all"
                        style={{
                          width: `${selectedScore}%`,
                          backgroundColor:
                            selectedScore >= 70 ? '#ef4444' :
                            selectedScore >= 50 ? '#f59e0b' :
                            '#22c55e',
                        }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] mt-0.5" style={{ color: '#6b5f55' }}>
                      <span>Lower risk</span>
                      <span>Higher risk</span>
                    </div>
                  </div>
                </div>
                <p className="text-[11px]" style={{ color: '#6b5f55' }}>
                  {neighborhood} ranks{' '}
                  <strong>
                    #{selectedRank} of {totalNeighborhoods}
                  </strong>{' '}
                  neighborhoods for senior vulnerability (higher rank = more risk factors present).
                  Score combines short sleep, cardiovascular disease burden, disability rates,
                  social isolation, and lack of healthcare access.
                </p>
              </div>
            </div>
          )}

          {/* ── Pattern analysis toggle ────────────────────────────────── */}
          <div>
            <button
              onClick={() => setShowPatternAnalysis((v) => !v)}
              className="w-full text-left flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors"
              style={{ background: '#e6efef', border: '1px solid #c5d8d8' }}
            >
              <span className="text-sm font-semibold" style={{ color: '#2f5d62' }}>
                City-Wide Pattern Analysis: Where Are Seniors Most At Risk?
              </span>
              <span className="text-lg" style={{ color: '#2f5d62' }}>{showPatternAnalysis ? '▲' : '▼'}</span>
            </button>

            {showPatternAnalysis && (
              <div className="mt-3 space-y-4">
                <p className="text-[11px]" style={{ color: '#6b5f55' }}>
                  The neighborhoods below show the highest composite senior vulnerability scores —
                  meaning multiple risk factors co-occur: poor sleep, high cardiovascular disease
                  rates, disability burden, and social isolation. These communities may especially
                  benefit from sleep health outreach, caregiver support programs, and transportation
                  assistance to medical appointments.
                </p>

                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={chartData}
                    layout="vertical"
                    margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `${v}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 9 }}
                      width={110}
                    />
                    <Tooltip
                      formatter={(val) => [`${val}/100`, 'Vulnerability Score']}
                      labelStyle={{ fontSize: 11 }}
                      contentStyle={{ fontSize: 11 }}
                    />
                    <Bar dataKey="score" radius={[0, 3, 3, 0]}>
                      {chartData.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={entry.isSelected ? '#c8861a' : '#2f5d62'}
                          opacity={entry.isSelected ? 1 : 0.7}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Risk factor table for top 10 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr style={{ background: '#f6f1ea' }}>
                        <th className="text-left p-1.5 font-semibold" style={{ color: '#6b5f55' }}>Neighborhood</th>
                        <th className="text-center p-1.5 font-semibold" style={{ color: '#6b5f55' }}>Score</th>
                        <th className="text-center p-1.5 font-semibold" style={{ color: '#6b5f55' }}>Short Sleep</th>
                        <th className="text-center p-1.5 font-semibold" style={{ color: '#6b5f55' }}>Heart Dis.</th>
                        <th className="text-center p-1.5 font-semibold" style={{ color: '#6b5f55' }}>Indep. Living Dis.</th>
                        <th className="text-center p-1.5 font-semibold" style={{ color: '#6b5f55' }}>Loneliness</th>
                        <th className="text-center p-1.5 font-semibold" style={{ color: '#6b5f55' }}>No Insurance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vulnerabilityRankings.slice(0, 10).map((r, i) => (
                        <tr
                          key={r.key}
                          style={
                            r.key === key
                              ? { background: '#f5e8e1', borderLeft: '2px solid #c8861a' }
                              : i % 2 === 0
                              ? { background: '#fbf8f3' }
                              : { background: '#f6f1ea' }
                          }
                        >
                          <td className="p-1.5 font-medium" style={{ color: '#1a1410' }}>
                            {i + 1}. {r.name}
                          </td>
                          <td className="p-1.5 text-center font-bold" style={{ color: '#2f5d62' }}>{r.score}</td>
                          <td className="p-1.5 text-center">{r.shortSleep?.toFixed(1) ?? '—'}%</td>
                          <td className="p-1.5 text-center">{r.heartDisease?.toFixed(1) ?? '—'}%</td>
                          <td className="p-1.5 text-center">{r.independentLivingDisability?.toFixed(1) ?? '—'}%</td>
                          <td className="p-1.5 text-center">{r.loneliness?.toFixed(1) ?? '—'}%</td>
                          <td className="p-1.5 text-center">{r.noHealthInsurance?.toFixed(1) ?? '—'}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-[9px] mt-1" style={{ color: '#6b5f55' }}>
                    Selected neighborhood highlighted in amber. Score is a composite index
                    (0–100) normalized across all Cincinnati neighborhoods.
                  </p>
                </div>

                {/* Action framing */}
                <div className="rounded-lg p-3" style={{ background: '#ecefdf', border: '1px solid #cfd9b2' }}>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: '#5a7a3e' }}>What can change outcomes?</p>
                  <ul className="text-[11px] space-y-1 list-disc list-inside" style={{ color: '#5a7a3e' }}>
                    <li>
                      <strong>Sleep health screenings</strong> at community health events in
                      high-risk neighborhoods — primary care referral pathways for sleep studies.
                    </li>
                    <li>
                      <strong>CPAP navigation support</strong> — equipment setup, insurance
                      paperwork, and follow-up are barriers that disproportionately affect older
                      adults with cognitive or mobility limitations.
                    </li>
                    <li>
                      <strong>Caregiver and social support programs</strong> — reducing
                      isolation improves self-management and care-seeking behavior.
                    </li>
                    <li>
                      <strong>Transportation to appointments</strong> — mobility disability
                      and lack of reliable transit frequently delay diagnosis and follow-up.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </div>

          {/* ── What would unlock this ────────────────────────────────── */}
          <div className="rounded-lg p-3 text-[11px]" style={{ background: '#f6f1ea', border: '1px solid #e4ddd2', color: '#6b5f55' }}>
            <p className="font-semibold mb-1.5" style={{ color: '#1a1410' }}>What this data can't show — and what would</p>
            <ul className="space-y-1.5 list-none">
              <li>
                <span className="font-medium" style={{ color: '#1a1410' }}>Repeat hospitalization rates by neighborhood</span>
                {' '}— the most direct measure of the problem described above. TriHealth, UC Health, and Hamilton
                County Public Health hold discharge data at ZIP-code level. A data-sharing agreement with any of
                these partners would unlock it.
              </li>
              <li>
                <span className="font-medium" style={{ color: '#1a1410' }}>Sleep apnea diagnosis and CPAP prescription rates</span>
                {' '}— available in Medicare/Medicaid claims (ICD-10 G47.33, HCPCS E0601) but not publicly
                downloadable below the county level. Requires a CMS Data Use Agreement or Ohio ODJFS research
                partnership.
              </li>
              <li>
                <span className="font-medium" style={{ color: '#1a1410' }}>Elderly living alone, specifically</span>
                {' '}— ACS table B11010 provides this at the census-tract level, but variable-level documentation
                is ambiguous enough that the derived rates were unreliable. A direct Census API query validated
                against county totals could resolve this.
              </li>
            </ul>
            <p className="mt-2" style={{ color: '#6b5f55' }}>
              If you work at a health system, county agency, or research institution and can share any of these,{' '}
              <a
                href="https://forms.gle/sMHyvc4Hu8FMwARE8"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: '#2f5d62' }}
              >
                get in touch via the contribution form
              </a>.
            </p>
          </div>

          {/* ── Methodology note ───────────────────────────────────────── */}
          <div className="rounded-lg p-3 text-[11px]" style={{ background: '#f5e8e1', border: '1px solid #e6c5b2', color: '#b34728' }}>
            <p className="font-semibold mb-0.5">Methodology note</p>
            <p>
              Health outcome data is from CDC PLACES 2023 (census-tract level, model-based
              estimates aggregated to Cincinnati SNA neighborhoods via nearest-centroid).
              Demographic data is ACS 2022. County-level callout statistics are from published
              epidemiological research and CMS administrative data — not derived from neighborhood
              indicators. The Senior Vulnerability Score is a composite index normalized to the
              range of observed values across all 41 Cincinnati neighborhoods; it is a relative
              measure, not a clinical risk assessment.
            </p>
          </div>

          <div className="mt-2 pt-3 border-t" style={{ borderColor: '#e4ddd2' }}>
            <DataAttribution
              source={`CDC PLACES: Local Data for Better Health · Hamilton County, OH · ${health.dataYear}`}
              url="https://www.cdc.gov/places/"
            />
            <p className="text-[10px] italic mt-2" style={{ color: '#6b5f55' }}>
              For Emily, who made this possible. Thanks, neighbor.
            </p>
          </div>
        </div>
      )}
    </DataCard>
  );
}
