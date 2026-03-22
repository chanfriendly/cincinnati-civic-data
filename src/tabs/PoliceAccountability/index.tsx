import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSODA } from '../../hooks/useSODA';
import { callClaude, formatDate } from '../../utils/api';
import { useLanguage } from '../../context/LanguageContext';
import {
  DataCard,
  EmptyState,
  DataAttribution,
} from '../../components/ui';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

type SubSection = 'traffic' | 'pedestrian' | 'force' | 'ois' | 'crime' | 'question';

// Keys must match the UPPERCASE values returned by Socrata (e.g. 'BLACK', not 'Black')
const RACE_COLORS: { [key: string]: string } = {
  'BLACK': '#1A4A6B',
  'WHITE': '#C8861A',
  'HISPANIC': '#4CAF50',
  'ASIAN/PACIFIC ISLANDER': '#9C27B0',
  'AMERICAN INDIAN/ALASKAN NATIVE': '#FF5722',
  'NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER': '#00897B',
  'UNKNOWN': '#607D8B',
};

const DISCLAIMER = 'This data is published by the City of Cincinnati for public accountability purposes. Patterns in the data do not establish intent or cause.';

export default function PoliceAccountability() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [activeSection, setActiveSection] = useState<SubSection>('traffic');
  const [trafficYear, setTrafficYear] = useState<number>(2024);
  const [trafficDistrict, setTrafficDistrict] = useState<string>('all');
  const [pedestrianDistrict, setPedestrianDistrict] = useState<string>('all');
  const [crimeType, setCrimeType] = useState<string>('');
  const [crimeYear, setCrimeYear] = useState<number>(2024);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  // Traffic Stops (ktgf-4sjh)
  // Confirmed field names: interview_date (not date_of_stop), race, sex (not gender),
  // disposition_text (not action_taken), district
  const trafficWhere = `interview_date >= '${trafficYear}-01-01' AND interview_date <= '${trafficYear}-12-31'${
    trafficDistrict !== 'all' ? ` AND district='${trafficDistrict}'` : ''
  }`;

  const trafficByRace = useSODA('ktgf-4sjh', {
    $select: 'race,count(*) as count',
    $group: 'race',
    $where: trafficWhere,
  });

  // Outcome by race — disposition_text is the closest proxy to "action taken" in this dataset.
  // Cincinnati's traffic stops dataset does not have a "searched" boolean field.
  const trafficOutcome = useSODA('ktgf-4sjh', {
    $select: 'race,disposition_text,count(*) as count',
    $group: 'race,disposition_text',
    $where: trafficWhere,
    $limit: 500,
  });

  const trafficByRaceData = useMemo(() => {
    return (trafficByRace.data || [])
      .map((item: any) => ({
        race: (item.race || 'UNKNOWN').toUpperCase(),
        count: parseInt(item.count || '0', 10),
      }))
      .filter((d: any) => d.count > 0)
      .sort((a: any, b: any) => b.count - a.count);
  }, [trafficByRace.data]);

  // Build outcome table: { race → { disposition_text → count } }
  const trafficOutcomeData = useMemo(() => {
    const raceMap = new Map<string, Map<string, number>>();
    for (const item of (trafficOutcome.data || []) as any[]) {
      const race = (item.race || 'UNKNOWN').toUpperCase();
      const disp = (item.disposition_text || 'UNKNOWN').toUpperCase();
      const count = parseInt(item.count || '0', 10);
      if (!raceMap.has(race)) raceMap.set(race, new Map());
      raceMap.get(race)!.set(disp, (raceMap.get(race)!.get(disp) || 0) + count);
    }
    return Array.from(raceMap.entries())
      .map(([race, disps]) => ({
        race,
        total: Array.from(disps.values()).reduce((a, b) => a + b, 0),
        dispositions: Object.fromEntries(disps),
      }))
      .sort((a, b) => b.total - a.total);
  }, [trafficOutcome.data]);

  // Top 5 disposition types (by total count across all races)
  const topDispositions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of (trafficOutcome.data || []) as any[]) {
      const disp = (item.disposition_text || 'UNKNOWN').toUpperCase();
      const count = parseInt(item.count || '0', 10);
      counts.set(disp, (counts.get(disp) || 0) + count);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([d]) => d);
  }, [trafficOutcome.data]);

  // Pedestrian Stops (jx3x-rh6i)
  // NOTE: interview_date column exists in schema but is NULL for all records in this dataset.
  // Filter by district only; show all-time data broken down by race.
  const pedestrianWhere = pedestrianDistrict !== 'all'
    ? `district='${pedestrianDistrict}'`
    : undefined;

  const pedestrianByRace = useSODA('jx3x-rh6i', {
    $select: 'race,count(*) as count',
    $group: 'race',
    ...(pedestrianWhere ? { $where: pedestrianWhere } : {}),
  });

  const pedestrianByRaceData = useMemo(() => {
    return (pedestrianByRace.data || [])
      .map((item: any) => ({
        race: item.race || 'Unknown',
        count: parseInt(item.count || 0),
      }))
      .sort((a: any, b: any) => b.count - a.count);
  }, [pedestrianByRace.data]);

  // Use of Force (748b-sht4)
  // Fields confirmed: eventdate (not date), sna_neighborhood (not neighborhood)
  const forceQuery = useSODA('748b-sht4', {
    $limit: 100,
    $order: 'eventdate DESC',
  });

  const forceByNeighborhood = useMemo(() => {
    const counts: { [key: string]: number } = {};
    (forceQuery.data || []).forEach((item: any) => {
      const nb = item.sna_neighborhood || 'Unknown';
      counts[nb] = (counts[nb] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([neighborhood, count]) => ({ neighborhood, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [forceQuery.data]);

  // OIS (r6q4-muts)
  // No 'year' column — use date_extract_y(incident_date) to group by year
  const oisQuery = useSODA('r6q4-muts', {
    $select: 'date_extract_y(incident_date) as year,count(*) as count',
    $group: 'year',
    $order: 'year DESC',
  });

  const oisByYear = useMemo(() => {
    return (oisQuery.data || [])
      .map((item: any) => ({
        year: item.year || 'Unknown',
        count: parseInt(item.count || 0),
      }))
      .sort((a: any, b: any) => a.year.localeCompare(b.year));
  }, [oisQuery.data]);

  // Crime Map (combined)
  const crimeOld = useSODA('k59e-2pvf', {
    $where: `date_reported >= '${crimeYear}-01-01' AND date_reported <= '${crimeYear}-12-31'${
      crimeType ? ` AND offense LIKE '%${crimeType}%'` : ''
    }`,
    $limit: 100,
    $order: 'date_reported DESC',
  });

  // 7aqy-xrv9 (STARS): date field is datereported, offense field is stars_category
  const crimeNew = useSODA('7aqy-xrv9', {
    $where: `datereported >= '${crimeYear}-01-01' AND datereported <= '${crimeYear}-12-31'${
      crimeType ? ` AND stars_category LIKE '%${crimeType}%'` : ''
    }`,
    $limit: 100,
    $order: 'datereported DESC',
  });

  const mergedCrime = useMemo(() => {
    return [...(crimeOld.data || []), ...(crimeNew.data || [])].slice(0, 100);
  }, [crimeOld.data, crimeNew.data]);

  const handleAiQuestion = useCallback(async () => {
    if (!aiQuestion.trim()) return;

    setLoadingAi(true);
    try {
      const systemPrompt =
        'You are a civic data assistant for Cincinnati. You help users query CPD transparency data. When given a question, construct a valid Socrata SODA API query for the most relevant dataset, then explain what the data would show. Available datasets: Traffic Stops (ktgf-4sjh: interview_date, race, sex, disposition_text, district), Pedestrian Stops (jx3x-rh6i: same fields), Use of Force (748b-sht4: frozen), OIS (r6q4-muts: frozen). Return your response as: 1) which dataset, 2) the SODA $where query string, 3) a plain-language explanation. Be factual and non-editorializing.';

      const response = await callClaude(systemPrompt, aiQuestion, language);
      setAiResponse(response);
    } catch (e) {
      console.error('AI query error:', e);
    } finally {
      setLoadingAi(false);
    }
  }, [aiQuestion, language]);

  const trafficLoading = trafficByRace.loading || trafficOutcome.loading;
  const trafficError = trafficByRace.error || trafficOutcome.error;

  return (
    <div className="space-y-6">
      {/* Disclaimer Banner */}
      <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
        <p className="text-sm text-yellow-800">{t('police.disclaimer', DISCLAIMER)}</p>
        <p className="text-xs text-yellow-700 mt-2">
          {t(
            'police.raceDataNote',
            'Traffic and pedestrian stop data includes race of the subject, included by the city specifically for accountability purposes (originating from the Collaborative Agreement).'
          )}
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm border-b border-gray-200">
        <div className="flex flex-wrap">
          {[
            { id: 'traffic', label: t('police.trafficStops', 'Traffic Stops') },
            { id: 'pedestrian', label: t('police.pedestrianStops', 'Pedestrian Stops') },
            { id: 'force', label: t('police.useOfForce', 'Use of Force') },
            { id: 'ois', label: t('police.ois', 'OIS') },
            { id: 'crime', label: t('police.crimeMap', 'Crime Map') },
            { id: 'question', label: t('police.askQuestion', 'Ask a Question') },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as SubSection)}
              className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition ${
                activeSection === tab.id
                  ? 'border-[#1A4A6B] text-[#1A4A6B]'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Traffic Stops Section */}
      {activeSection === 'traffic' && (
        <div className="space-y-6">
          {/* Controls */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('police.year', 'Year')}
                </label>
                <select
                  value={trafficYear}
                  onChange={(e) => setTrafficYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
                >
                  {[2018, 2019, 2020, 2021, 2022, 2023, 2024].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('police.district', 'District')}
                </label>
                <select
                  value={trafficDistrict}
                  onChange={(e) => setTrafficDistrict(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
                >
                  <option value="all">{t('police.allDistricts', 'All Districts')}</option>
                  {[1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      {t('police.district_n', `District ${d}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Stop Count by Race */}
          <DataCard
            title={t('police.stopsbyRace', 'Stops by Race')}
            loading={trafficLoading}
            error={trafficError}
            empty={trafficByRaceData.length === 0}
          >
            {trafficByRaceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={trafficByRaceData} margin={{ bottom: 60, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="race"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v}
                  />
                  <YAxis tickFormatter={(v: number) => v.toLocaleString()} width={65} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Bar dataKey="count" fill="#1A4A6B" radius={[3, 3, 0, 0]}>
                    {trafficByRaceData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={RACE_COLORS[entry.race] || '#607D8B'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}
            <DataAttribution
              source={t('police.attributionTraffic', 'Traffic Stops')}
              uid="ktgf-4sjh"
            />
          </DataCard>

          {/* Outcomes by Race */}
          <DataCard
            title={t('police.outcomesByRace', 'Outcomes by Race (Disposition)')}
            loading={trafficOutcome.loading}
            error={trafficOutcome.error}
          >
            <p className="text-xs text-gray-500 mb-3 italic">
              Note: Cincinnati's traffic stops dataset does not include a "searched" field.
              Showing reported stop outcomes (disposition_text) by race instead.
            </p>
            {trafficOutcomeData.length > 0 && topDispositions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b-2 border-gray-200">
                      <th className="text-left py-2 pr-3 font-semibold text-gray-700 whitespace-nowrap">Race</th>
                      <th className="text-right py-2 pr-3 font-semibold text-gray-700">Total</th>
                      {topDispositions.map((d) => (
                        <th key={d} className="text-right py-2 px-2 font-semibold text-gray-700 whitespace-nowrap max-w-[100px] truncate" title={d}>
                          {d.length > 14 ? d.slice(0, 12) + '…' : d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trafficOutcomeData.slice(0, 8).map((row) => (
                      <tr key={row.race} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 pr-3 font-medium text-gray-900 whitespace-nowrap">{row.race}</td>
                        <td className="py-2 pr-3 text-right text-gray-700 font-semibold">
                          {row.total.toLocaleString()}
                        </td>
                        {topDispositions.map((d) => (
                          <td key={d} className="py-2 px-2 text-right text-gray-600">
                            {row.dispositions[d] ? row.dispositions[d].toLocaleString() : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message={t('police.noData', 'No outcome data available')} />
            )}
            <DataAttribution source={t('police.attributionTraffic', 'Traffic Stops')} uid="ktgf-4sjh" />
          </DataCard>
        </div>
      )}

      {/* Pedestrian Stops Section */}
      {activeSection === 'pedestrian' && (
        <div className="space-y-6">
          {/* Data note */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <p className="text-sm text-blue-900">
              {t('police.pedNote', 'This dataset covers all recorded pedestrian contacts. Date filtering is not available as the date field is not populated by the source agency.')}
            </p>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('police.district', 'District')}
                </label>
                <select
                  value={pedestrianDistrict}
                  onChange={(e) => setPedestrianDistrict(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
                >
                  <option value="all">{t('police.allDistricts', 'All Districts')}</option>
                  {[1, 2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      {t('police.district_n', `District ${d}`)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Pedestrian Stops by Race */}
          <DataCard
            title={t('police.pedestrianbyRace', 'Pedestrian Stops by Race')}
            loading={pedestrianByRace.loading}
            error={pedestrianByRace.error}
            empty={pedestrianByRaceData.length === 0}
          >
            {pedestrianByRaceData.length > 0 ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={pedestrianByRaceData} margin={{ bottom: 60, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="race"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v}
                  />
                  <YAxis tickFormatter={(v: number) => v.toLocaleString()} width={65} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Bar dataKey="count" fill="#C8861A" radius={[3, 3, 0, 0]}>
                    {pedestrianByRaceData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={RACE_COLORS[entry.race] || '#607D8B'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}
            <DataAttribution
              source={t('police.attributionPedestrian', 'Pedestrian Stops')}
              uid="jx3x-rh6i"
            />
          </DataCard>
        </div>
      )}

      {/* Use of Force Section */}
      {activeSection === 'force' && (
        <div className="space-y-6">
          {/* Freeze Notice */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <p className="text-sm font-semibold text-yellow-900">
              {t(
                'police.freezeNotice',
                'This dataset is currently frozen pending CPD\'s transition to a new records management system. Last available data shown.'
              )}
            </p>
          </div>

          {/* Force by Neighborhood */}
          <DataCard
            title={t('police.forcebyNeighborhood', 'Use of Force by Neighborhood (Top 10)')}
            loading={forceQuery.loading}
            error={forceQuery.error}
            empty={forceByNeighborhood.length === 0}
          >
            {forceByNeighborhood.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={forceByNeighborhood}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="neighborhood" angle={-45} textAnchor="end" height={80} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#FF5722" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}

            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                {t('police.forceNote', 'For deeper analysis, related datasets include Subjects (uid: 4gu6-tz3f) and Officers (uid: 28j3-kqky), linked via UNIQUE_REPORT_ID.')}
              </p>
            </div>

            <DataAttribution
              source={t('police.attributionForce', 'Use of Force')}
              uid="748b-sht4"
            />
          </DataCard>

          {/* Summary Stats */}
          <DataCard
            title={t('police.forceStats', 'Summary Statistics')}
            loading={forceQuery.loading}
            error={forceQuery.error}
            empty={!forceQuery.data || forceQuery.data.length === 0}
          >
            {forceQuery.data && forceQuery.data.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-red-50 p-4 rounded">
                  <div className="text-2xl font-bold text-red-700">
                    {forceQuery.data.length}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {t('police.totalForceIncidents', 'Total Incidents')}
                  </div>
                </div>
              </div>
            )}
          </DataCard>
        </div>
      )}

      {/* OIS Section */}
      {activeSection === 'ois' && (
        <div className="space-y-6">
          {/* Freeze Notice */}
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded">
            <p className="text-sm font-semibold text-yellow-900">
              {t(
                'police.freezeNotice',
                'This dataset is currently frozen pending CPD\'s transition to a new records management system. Last available data shown.'
              )}
            </p>
          </div>

          {/* OIS by Year */}
          <DataCard
            title={t('police.oisByYear', 'Officer-Involved Shootings by Year')}
            loading={oisQuery.loading}
            error={oisQuery.error}
            empty={oisByYear.length === 0}
          >
            {oisByYear.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={oisByYear}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1A4A6B" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}
            <DataAttribution
              source={t('police.attributionOIS', 'Officer-Involved Shootings')}
              uid="r6q4-muts"
            />
          </DataCard>
        </div>
      )}

      {/* Crime Map Section */}
      {activeSection === 'crime' && (
        <div className="space-y-6">
          {/* Note about RMS transition */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <p className="text-sm text-blue-900">
              {t(
                'police.crimeNote',
                'Note: Records Management System transition on 6/2/2024. Data gap between old (k59e-2pvf) and new STARS (7aqy-xrv9) datasets.'
              )}
            </p>
          </div>

          {/* Controls */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('police.year', 'Year')}
                </label>
                <select
                  value={crimeYear}
                  onChange={(e) => setCrimeYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
                >
                  {[2020, 2021, 2022, 2023, 2024].map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('police.offenseType', 'Offense Type (optional)')}
                </label>
                <input
                  type="text"
                  value={crimeType}
                  onChange={(e) => setCrimeType(e.target.value)}
                  placeholder={t('police.filterPlaceholder', 'e.g., Assault')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Crime Table */}
          <DataCard
            title={t('police.crimeRecords', 'Crime Records')}
            loading={crimeOld.loading || crimeNew.loading}
            error={crimeOld.error || crimeNew.error}
            empty={mergedCrime.length === 0}
          >
            {mergedCrime.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-3 font-semibold text-gray-900">
                        {t('police.date', 'Date')}
                      </th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-900">
                        {t('police.offense', 'Offense')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {mergedCrime.map((crime: any, idx: number) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-3 text-gray-600">
                          {formatDate(
                            crime.date_reported || crime.datereported
                          )}
                        </td>
                        <td className="py-2 px-3 text-gray-900">
                          {crime.offense_type || crime.offense}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}
            <DataAttribution
              source={t('police.attributionCrime', 'PDI Crime + STARS')}
              uid="k59e-2pvf"
            />
          </DataCard>
        </div>
      )}

      {/* Ask a Question Section */}
      {activeSection === 'question' && (
        <div className="space-y-6">
          <DataCard
            title={t('police.askQuestion_title', 'Ask a Question About Police Data')}
            loading={false}
            error={null}
            empty={false}
          >
            <div className="space-y-4">
              <textarea
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder={t(
                  'police.questionPlaceholder',
                  'e.g., "What is the search rate for pedestrian stops in 2024?" or "How many traffic stops were there in District 3?"'
                )}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
              />

              <button
                onClick={handleAiQuestion}
                disabled={loadingAi || !aiQuestion.trim()}
                className="px-6 py-2 bg-[#1A4A6B] text-white rounded-lg hover:bg-[#143850] disabled:opacity-50"
              >
                {loadingAi
                  ? t('police.askQuestion_loading', 'Analyzing...')
                  : t('police.askQuestion_button', 'Ask Question')}
              </button>

              {aiResponse && (
                <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                  <div className="text-sm font-semibold text-green-900 mb-2">
                    {t('police.response', 'Response')}
                  </div>
                  <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                    {aiResponse}
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-600 mt-4 border-t pt-4">
                <p className="font-semibold mb-2">
                  {t('police.availableDatasets', 'Available Datasets')}
                </p>
                <ul className="space-y-1">
                  <li>
                    <strong>Traffic Stops</strong> (ktgf-4sjh):
                    interview_date, race, sex, disposition_text, district
                  </li>
                  <li>
                    <strong>Pedestrian Stops</strong> (jx3x-rh6i):
                    interview_date, race, sex, disposition_text, district
                  </li>
                  <li>
                    <strong>Use of Force</strong> (748b-sht4): [FROZEN]
                  </li>
                  <li>
                    <strong>OIS</strong> (r6q4-muts): [FROZEN]
                  </li>
                </ul>
              </div>
            </div>
          </DataCard>
        </div>
      )}
    </div>
  );
}
