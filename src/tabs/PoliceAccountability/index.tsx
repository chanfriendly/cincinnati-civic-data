import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { renderMarkdown } from '../../utils/markdown';
import L from 'leaflet';
import { useTranslation } from 'react-i18next';
import { useSODA } from '../../hooks/useSODA';
import { callClaude } from '../../utils/api';
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

type SubSection = 'traffic' | 'force' | 'ois' | 'question';

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
  const [forceYear, setForceYear] = useState<number>(2024);
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

  // Use of Force (748b-sht4)
  // Fields confirmed: eventdate, sna_neighborhood, formtype, district
  // Note: no race field in this dataset. Valid years: 2021–2025 (3 records have data-entry errors with year 2200+, excluded by year filter).
  const forceWhere = `eventdate >= '${forceYear}-01-01' AND eventdate <= '${forceYear}-12-31'`;

  const forceByNeighborhoodQ = useSODA('748b-sht4', {
    $select: 'sna_neighborhood,count(*) as count',
    $group: 'sna_neighborhood',
    $where: `${forceWhere} AND sna_neighborhood IS NOT NULL`,
    $order: 'count DESC',
    $limit: 10,
  });

  const forceByTypeQ = useSODA('748b-sht4', {
    $select: 'formtype,count(*) as count',
    $group: 'formtype',
    $where: forceWhere,
    $order: 'count DESC',
  });

  const forceCount = useSODA('748b-sht4', {
    $select: 'count(*) as total',
    $where: forceWhere,
  });

  // Use of Force Subjects (4gu6-tz3f) — has subject_race, covers 2021–2024
  // incident_date field is used for filtering; note this is a separate table from 748b-sht4
  const forceSubjectsByRaceQ = useSODA('4gu6-tz3f', {
    $select: 'subject_race,count(*) as count',
    $group: 'subject_race',
    $where: `incident_date >= '${forceYear}-01-01' AND incident_date <= '${forceYear}-12-31'`,
    $order: 'count DESC',
  });

  // Heatmap coordinates — fetch lat/lon for incidents that have coordinates
  const forceCoordinatesQ = useSODA('748b-sht4', {
    $select: 'latitude_x,longitude_x',
    $where: `${forceWhere} AND latitude_x IS NOT NULL AND longitude_x IS NOT NULL`,
    $limit: 2000,
  });

  const forceByNeighborhood = useMemo(() => {
    return (forceByNeighborhoodQ.data || []).map((item: any) => ({
      neighborhood: item.sna_neighborhood || 'Unknown',
      count: parseInt(item.count || '0', 10),
    }));
  }, [forceByNeighborhoodQ.data]);

  const forceByType = useMemo(() => {
    return (forceByTypeQ.data || []).map((item: any) => ({
      type: (item.formtype || 'UNKNOWN').replace(/_/g, ' '),
      count: parseInt(item.count || '0', 10),
    }));
  }, [forceByTypeQ.data]);

  const forceSubjectsByRace = useMemo(() => {
    return (forceSubjectsByRaceQ.data || [])
      .map((item: any) => ({
        race: (item.subject_race || 'UNKNOWN').toUpperCase(),
        count: parseInt(item.count || '0', 10),
      }))
      .filter((d: any) => d.count > 0);
  }, [forceSubjectsByRaceQ.data]);

  // OIS legacy (r6q4-muts) — frozen at 2019, CPD transitioned to Police Firearm Discharge datasets
  const oisQuery = useSODA('r6q4-muts', {
    $select: 'date_extract_y(incident_date) as year,count(*) as count',
    $group: 'year',
    $order: 'year DESC',
  });

  // Police Firearm Discharge — new datasets published after RMS transition (n625-s9aa incidents, dxac-g4wm subjects)
  const firearmsIncidents = useSODA('n625-s9aa', {
    $select: 'date_extract_y(incidentdatetime) as year,count(*) as count',
    $group: 'year',
    $order: 'year ASC',
  });

  const firearmsSubjects = useSODA('dxac-g4wm', {
    $select: 'subject_race,count(*) as count',
    $group: 'subject_race',
    $order: 'count DESC',
  });

  const oisByYear = useMemo(() => {
    return (oisQuery.data || [])
      .map((item: any) => ({
        year: item.year || 'Unknown',
        count: parseInt(item.count || 0),
      }))
      .sort((a: any, b: any) => a.year.localeCompare(b.year));
  }, [oisQuery.data]);

  const firearmsIncidentsByYear = useMemo(() => {
    return (firearmsIncidents.data || []).map((item: any) => ({
      year: item.year || 'Unknown',
      count: parseInt(item.count || '0', 10),
    }));
  }, [firearmsIncidents.data]);

  const firearmsSubjectsByRace = useMemo(() => {
    return (firearmsSubjects.data || []).map((item: any) => ({
      race: (item.subject_race || 'UNKNOWN').toUpperCase(),
      count: parseInt(item.count || '0', 10),
    }));
  }, [firearmsSubjects.data]);

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

  // Leaflet heatmap for Use of Force
  const heatmapRef = useRef<HTMLDivElement>(null);
  const heatmapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!heatmapRef.current || activeSection !== 'force') return;

    const coords = (forceCoordinatesQ.data || []) as any[];
    if (coords.length === 0) return;

    // Destroy old map instance before re-creating (year change)
    if (heatmapInstanceRef.current) {
      heatmapInstanceRef.current.remove();
      heatmapInstanceRef.current = null;
    }

    const map = L.map(heatmapRef.current, { zoomControl: true, scrollWheelZoom: false });
    heatmapInstanceRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    const validPoints: L.LatLng[] = [];
    coords.forEach((row: any) => {
      const lat = parseFloat(row.latitude_x);
      const lon = parseFloat(row.longitude_x);
      if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
        validPoints.push(L.latLng(lat, lon));
        L.circleMarker([lat, lon], {
          radius: 6,
          fillColor: '#FF5722',
          color: 'transparent',
          fillOpacity: 0.25,
        }).addTo(map);
      }
    });

    if (validPoints.length > 0) {
      map.fitBounds(L.latLngBounds(validPoints), { padding: [20, 20], maxZoom: 13 });
    } else {
      map.setView([39.1, -84.51], 12);
    }

    return () => {
      map.remove();
      heatmapInstanceRef.current = null;
    };
  }, [forceCoordinatesQ.data, activeSection]);

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
        <p className="text-xs text-yellow-700 mt-1">
          This tab focuses on <strong>police behavior</strong> — stop patterns, force used, and officer-involved shootings.
          Neighborhood-level crime trend data is available in the <strong>Neighborhood Profiles</strong> tab.
          We do not publish individual incident records as a crime map or ticker, which can amplify fear without accountability context.
        </p>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white rounded-lg shadow-sm border-b border-gray-200">
        <div className="flex flex-wrap">
          {[
            { id: 'traffic', label: t('police.trafficStops', 'Traffic Stops') },
            { id: 'force', label: t('police.useOfForce', 'Use of Force') },
            { id: 'ois', label: t('police.ois', 'OIS') },
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

      {/* Use of Force Section */}
      {activeSection === 'force' && (
        <div className="space-y-6">
          {/* Controls */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('police.year', 'Year')}
                </label>
                <select
                  value={forceYear}
                  onChange={(e) => setForceYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
                >
                  {[2021, 2022, 2023, 2024, 2025].map((yr) => (
                    <option key={yr} value={yr}>{yr}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Summary stat */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-3xl font-bold text-red-700">
              {parseInt((forceCount.data as any)?.[0]?.total || '0', 10).toLocaleString()}
            </div>
            <div className="text-sm text-gray-600 mt-1">
              {t('police.totalForceIncidents', 'Use of force incidents')} ({forceYear})
            </div>
          </div>

          {/* Force by Type */}
          <DataCard
            title={t('police.forceByType', 'Use of Force by Type')}
            loading={forceByTypeQ.loading}
            error={forceByTypeQ.error}
            empty={forceByType.length === 0}
          >
            <p className="text-xs text-gray-500 italic mb-3">
              This dataset does not include a race field. Breakdown shown by force type (formtype).{' '}
              <strong>Other Investigation</strong> is a CPD catch-all: all records in that category are
              classified only as "Investigation Report" with no further sub-type available in the public dataset.
            </p>
            {forceByType.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={forceByType} margin={{ bottom: 80, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="type" angle={-35} textAnchor="end" interval={0} tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#FF5722" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}
            <DataAttribution source={t('police.attributionForce', 'Use of Force')} uid="748b-sht4" />
          </DataCard>

          {/* Force by Neighborhood */}
          <DataCard
            title={t('police.forcebyNeighborhood', 'Use of Force by Neighborhood (Top 10)')}
            loading={forceByNeighborhoodQ.loading}
            error={forceByNeighborhoodQ.error}
            empty={forceByNeighborhood.length === 0}
          >
            {forceByNeighborhood.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={forceByNeighborhood}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="neighborhood" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="#FF5722" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}
            <p className="text-xs text-gray-400 italic mt-2">
              A small number of incidents (~37 in 2024) have no SNA neighborhood assigned — these span multiple
              districts and include incidents outside city limits or on roads that don't map to a neighborhood
              boundary. They are excluded from this chart.
            </p>
            <DataAttribution source={t('police.attributionForce', 'Use of Force')} uid="748b-sht4" />
          </DataCard>

          {/* Subjects by Race — from Use of Force Subjects table (4gu6-tz3f) */}
          <DataCard
            title="Use of Force — Subjects by Race"
            loading={forceSubjectsByRaceQ.loading}
            error={forceSubjectsByRaceQ.error}
            empty={forceSubjectsByRace.length === 0}
          >
            <p className="text-xs text-gray-500 italic mb-3">
              Race of subjects involved in use-of-force incidents, from the CPD Subjects table (4gu6-tz3f).
              Covers 2021–2024. This is a separate record from the incidents table and may differ slightly in count.{' '}
              <strong>UNKNOWN</strong> means the officer did not record the subject's race in the incident report —
              it does not indicate a separate demographic category.
            </p>
            {forceSubjectsByRace.length > 0 ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={forceSubjectsByRace} margin={{ bottom: 60, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="race"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v}
                  />
                  <YAxis tickFormatter={(v: number) => v.toLocaleString()} width={55} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} />
                  <Bar dataKey="count" fill="#FF5722" radius={[3, 3, 0, 0]}>
                    {forceSubjectsByRace.map((entry: any, i: number) => (
                      <Cell key={i} fill={RACE_COLORS[entry.race] || '#607D8B'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={forceSubjectsByRaceQ.loading ? 'Loading…' : `No subject data available for ${forceYear}. Coverage is 2021–2024.`} />
            )}
            <DataAttribution source="Use of Force – Subjects" uid="4gu6-tz3f" />
          </DataCard>

          {/* Incident Map — police use-of-force locations */}
          <DataCard
            title="Where CPD Used Force — Geographic Distribution"
            loading={forceCoordinatesQ.loading}
            error={forceCoordinatesQ.error}
            empty={false}
          >
            <p className="text-xs text-gray-500 italic mb-3">
              Each dot marks the location of a <strong>police use-of-force incident</strong> — where
              an officer applied physical or mechanical force during an encounter.
              This is accountability data about <em>police conduct</em>, not a crime map.
              Concentration in certain neighborhoods reflects patrol patterns and deployment, not resident behavior.
              Scroll to zoom; click and drag to pan.
            </p>
            <div ref={heatmapRef} style={{ height: 400, borderRadius: 8, zIndex: 0 }} />
            <DataAttribution source={t('police.attributionForce', 'Use of Force')} uid="748b-sht4" />
          </DataCard>
        </div>
      )}

      {/* OIS Section */}
      {activeSection === 'ois' && (
        <div className="space-y-6">
          {/* Transition notice */}
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded">
            <p className="text-sm font-semibold text-blue-900">CPD has transitioned to a new records management system.</p>
            <p className="text-sm text-blue-800 mt-1">
              The legacy OIS dataset (below) is frozen at September 2019. Cincinnati now publishes firearm discharge data under three new datasets:
              Incidents (<strong>n625-s9aa</strong>), Subjects (<strong>dxac-g4wm</strong>), and Officers (<strong>82xu-949a</strong>),
              covering 2021–2024. The new data is shown first.
            </p>
          </div>

          {/* New: Police Firearm Discharge */}
          <DataCard
            title="Police Firearm Discharge — Incidents by Year (2021–present)"
            loading={firearmsIncidents.loading}
            error={firearmsIncidents.error}
            empty={firearmsIncidentsByYear.length === 0}
          >
            {firearmsIncidentsByYear.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={firearmsIncidentsByYear}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="year" />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1A4A6B" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}
            <DataAttribution source="Police Firearm Discharge – Incidents" uid="n625-s9aa" />
          </DataCard>

          <DataCard
            title="Police Firearm Discharge — Subjects by Race (2021–present)"
            loading={firearmsSubjects.loading}
            error={firearmsSubjects.error}
            empty={firearmsSubjectsByRace.length === 0}
          >
            <p className="text-xs text-gray-500 italic mb-3">Race of subjects involved in firearm discharge incidents. Small sample size (5 subjects total as of last update).</p>
            {firearmsSubjectsByRace.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={firearmsSubjectsByRace} margin={{ bottom: 40, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="race" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#1A4A6B" radius={[3, 3, 0, 0]}>
                    {firearmsSubjectsByRace.map((entry: any, i: number) => (
                      <Cell key={i} fill={RACE_COLORS[entry.race] || '#607D8B'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}
            <DataAttribution source="Police Firearm Discharge – Subjects" uid="dxac-g4wm" />
          </DataCard>

          {/* Legacy OIS */}
          <DataCard
            title={t('police.oisByYear', 'Legacy OIS by Year (frozen at 2019)')}
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
                  <Bar dataKey="count" fill="#607D8B" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={t('police.noData', 'No data available')} />
            )}
            <DataAttribution
              source={t('police.attributionOIS', 'PDI Officer-Involved Shootings (legacy)')}
              uid="r6q4-muts"
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
                  <div className="prose prose-sm max-w-none">
                    {renderMarkdown(aiResponse)}
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
