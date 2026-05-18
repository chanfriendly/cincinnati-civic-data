import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { renderMarkdown } from '../../utils/markdown';
import L from 'leaflet';
import { useTranslation } from 'react-i18next';
import { useSODA } from '../../hooks/useSODA';
import { callClaude } from '../../utils/api';
import { useLanguage } from '../../context/LanguageContext';
import { DataCard, EmptyState, DataAttribution } from '../../components/ui';
import { C } from '../../components/ui/DesignAtoms';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';

type SubSection = 'traffic' | 'force' | 'ois' | 'question';

// Editorial-palette race colors — distinguishable, not value-laden
const RACE_COLORS: Record<string, string> = {
  'BLACK':                                      C.river,
  'WHITE':                                      C.hill,
  'HISPANIC':                                   C.muted,
  'ASIAN/PACIFIC ISLANDER':                     C.hill,
  'AMERICAN INDIAN/ALASKAN NATIVE':             C.riverDeep,
  'NATIVE HAWAIIAN OR OTHER PACIFIC ISLANDER':  C.riverDeep,
  'UNKNOWN':                                    C.muted,
};

const axisProps = { stroke: C.muted, fontSize: 11 };
const gridProps = { strokeDasharray: '3 3' as const, stroke: C.rule };
const tooltipStyle = { fontSize: 12, borderColor: C.rule, borderRadius: 6 };

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
  const [mapLoading, setMapLoading] = useState(false);

  // ── Traffic Stops (ktgf-4sjh) ───────────────────────────────────────────────
  const trafficWhere = `interview_date >= '${trafficYear}-01-01' AND interview_date <= '${trafficYear}-12-31'${
    trafficDistrict !== 'all' ? ` AND district='${trafficDistrict}'` : ''
  }`;

  const trafficByRace = useSODA('ktgf-4sjh', {
    $select: 'race,count(*) as count',
    $group: 'race',
    $where: trafficWhere,
  });

  const trafficOutcome = useSODA('ktgf-4sjh', {
    $select: 'race,disposition_text,count(*) as count',
    $group: 'race,disposition_text',
    $where: trafficWhere,
    $limit: 500,
  });

  const trafficByRaceData = useMemo(() => (trafficByRace.data || [])
    .map((item: any) => ({
      race: (item.race || 'UNKNOWN').toUpperCase(),
      count: parseInt(item.count || '0', 10),
    }))
    .filter((d: any) => d.count > 0)
    .sort((a: any, b: any) => b.count - a.count),
  [trafficByRace.data]);

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

  const topDispositions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of (trafficOutcome.data || []) as any[]) {
      const disp = (item.disposition_text || 'UNKNOWN').toUpperCase();
      const count = parseInt(item.count || '0', 10);
      counts.set(disp, (counts.get(disp) || 0) + count);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([d]) => d);
  }, [trafficOutcome.data]);

  // ── Use of Force (748b-sht4) ────────────────────────────────────────────────
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

  const forceSubjectsByRaceQ = useSODA('4gu6-tz3f', {
    $select: 'subject_race,count(*) as count',
    $group: 'subject_race',
    $where: `incident_date >= '${forceYear}-01-01' AND incident_date <= '${forceYear}-12-31'`,
    $order: 'count DESC',
  });

  // forceCoordinatesQ is fetched directly inside the Leaflet useEffect to avoid
  // useSODA timing issues in the real browser (hook state sometimes doesn't propagate
  // before the map effect fires, leaving coords.length === 0 permanently).

  const forceByNeighborhood = useMemo(() => (forceByNeighborhoodQ.data || []).map((item: any) => ({
    neighborhood: item.sna_neighborhood || 'Unknown',
    count: parseInt(item.count || '0', 10),
  })), [forceByNeighborhoodQ.data]);

  const forceByType = useMemo(() => (forceByTypeQ.data || []).map((item: any) => ({
    type: (item.formtype || 'UNKNOWN').replace(/_/g, ' '),
    count: parseInt(item.count || '0', 10),
  })), [forceByTypeQ.data]);

  const forceSubjectsByRace = useMemo(() => (forceSubjectsByRaceQ.data || [])
    .map((item: any) => ({
      race: (item.subject_race || 'UNKNOWN').toUpperCase(),
      count: parseInt(item.count || '0', 10),
    }))
    .filter((d: any) => d.count > 0),
  [forceSubjectsByRaceQ.data]);

  // ── OIS / Firearm Discharge ─────────────────────────────────────────────────
  const oisQuery = useSODA('r6q4-muts', {
    $select: 'date_extract_y(incident_date) as year,count(*) as count',
    $group: 'year',
    $order: 'year ASC',
  });

  const oisOfficerRace = useSODA('r6q4-muts', {
    $select: 'officer_race,count(*) as count',
    $group: 'officer_race',
    $order: 'count DESC',
  });

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

  const oisByYear = useMemo(() => (oisQuery.data || [])
    .map((item: any) => ({ year: item.year || 'Unknown', count: parseInt(item.count || 0) }))
    .sort((a: any, b: any) => a.year.localeCompare(b.year)),
  [oisQuery.data]);

  const oisStats = useMemo(() => {
    if (!oisByYear.length) return null;
    const total = oisByYear.reduce((s: number, d: any) => s + d.count, 0);
    const avg = Math.round((total / oisByYear.length) * 10) / 10;
    const peak = oisByYear.reduce((a: any, b: any) => b.count > a.count ? b : a, oisByYear[0]);
    const earliest = oisByYear[0].year;
    const latest = [...oisByYear].sort((a: any, b: any) => b.year.localeCompare(a.year))[0];
    return { total, avg, peak, earliest, latest };
  }, [oisByYear]);

  const oisOfficerRaceData = useMemo(() => (oisOfficerRace.data || []).map((item: any) => ({
    race: (item.officer_race || 'UNKNOWN').toUpperCase(),
    count: parseInt(item.count || '0', 10),
  })), [oisOfficerRace.data]);

  const firearmsIncidentsByYear = useMemo(() => (firearmsIncidents.data || []).map((item: any) => ({
    year: item.year || 'Unknown',
    count: parseInt(item.count || '0', 10),
  })), [firearmsIncidents.data]);

  const firearmsTotal = useMemo(() =>
    firearmsIncidentsByYear.reduce((s: number, d: any) => s + d.count, 0),
  [firearmsIncidentsByYear]);

  // Latest year with any incidents (2024 = 1, 2022 = 3, 2021 = 1; no 2023 or 2025 data)
  const firearmsLatestYear = useMemo(() => {
    if (!firearmsIncidentsByYear.length) return null;
    return [...firearmsIncidentsByYear].sort((a: any, b: any) => b.year.localeCompare(a.year))[0];
  }, [firearmsIncidentsByYear]);

  const firearmsSubjectsByRace = useMemo(() => (firearmsSubjects.data || []).map((item: any) => ({
    race: (item.subject_race || 'UNKNOWN').toUpperCase(),
    count: parseInt(item.count || '0', 10),
  })), [firearmsSubjects.data]);

  // ── AI Q&A ──────────────────────────────────────────────────────────────────
  const handleAiQuestion = useCallback(async () => {
    if (!aiQuestion.trim()) return;
    setLoadingAi(true);
    try {
      const systemPrompt = 'You are a civic data assistant for Cincinnati. You help users query CPD transparency data. When given a question, construct a valid Socrata SODA API query for the most relevant dataset, then explain what the data would show. Available datasets: Traffic Stops (ktgf-4sjh: interview_date, race, sex, disposition_text, district — actively updated), Use of Force (748b-sht4: eventdate, sna_neighborhood, formtype — actively updated through 2024), OIS Legacy (r6q4-muts: incident_date — frozen at 2019). Note: the Pedestrian Stops dataset (jx3x-rh6i) is currently near-empty and should not be queried. Return your response as: 1) which dataset, 2) the SODA $where query string, 3) a plain-language explanation. Be factual and non-editorializing.';
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

  // ── Leaflet heatmap ─────────────────────────────────────────────────────────
  const heatmapRef = useRef<HTMLDivElement>(null);
  const heatmapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (activeSection !== 'force') return;

    // Fetch coordinates directly — bypasses useSODA hook timing issues that
    // prevent map data from propagating in the real browser.
    const controller = new AbortController();
    let outerRaf = 0;
    let innerRaf = 0;

    const initMap = async () => {
      setMapLoading(true);
      let coords: any[] = [];
      try {
        const whereClause = encodeURIComponent(
          `eventdate >= '${forceYear}-01-01' AND eventdate <= '${forceYear}-12-31' AND latitude_x IS NOT NULL AND longitude_x IS NOT NULL`
        );
        const url = `https://data.cincinnati-oh.gov/resource/748b-sht4.json?$select=latitude_x,longitude_x&$where=${whereClause}&$limit=2000`;
        const res = await fetch(url, { signal: controller.signal });
        if (res.ok) coords = await res.json();
      } catch {
        // AbortError on cleanup is expected — silently ignore
      }
      setMapLoading(false);

      if (controller.signal.aborted || !heatmapRef.current) return;

      // Tear down any existing Leaflet instance before creating a new one
      if (heatmapInstanceRef.current) {
        heatmapInstanceRef.current.remove();
        heatmapInstanceRef.current = null;
      }

      const map = L.map(heatmapRef.current, { zoomControl: true, scrollWheelZoom: false });
      heatmapInstanceRef.current = map;

      // Two chained rAFs guarantee the browser has committed layout — tile positions
      // are accurate only after the container's final geometry is resolved.
      outerRaf = requestAnimationFrame(() => {
        innerRaf = requestAnimationFrame(() => {
          if (controller.signal.aborted || !heatmapInstanceRef.current) return;
          map.invalidateSize({ animate: false });
          map.setView([39.1031, -84.512], 12, { animate: false });
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
          }).addTo(map);
          coords.forEach((row: any) => {
            const lat = parseFloat(row.latitude_x);
            const lon = parseFloat(row.longitude_x);
            if (!isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0) {
              L.circleMarker([lat, lon], {
                radius: 5,
                fillColor: C.brick,
                color: '#fff',
                weight: 0.5,
                fillOpacity: 0.55,
              }).addTo(map);
            }
          });
        });
      });
    };

    initMap();

    return () => {
      controller.abort();
      cancelAnimationFrame(outerRaf);
      cancelAnimationFrame(innerRaf);
      if (heatmapInstanceRef.current) {
        heatmapInstanceRef.current.remove();
        heatmapInstanceRef.current = null;
      }
      setMapLoading(false);
    };
  }, [activeSection, forceYear]);

  // ── Shared select style ─────────────────────────────────────────────────────
  const selectStyle: React.CSSProperties = {
    background: C.paper,
    color: C.ink,
    border: `1px solid ${C.rule}`,
    fontFamily: '"Public Sans", sans-serif',
    fontSize: 14,
    padding: '6px 12px',
    borderRadius: 6,
    appearance: 'none' as const,
    cursor: 'pointer',
  };

  return (
    <div className="px-8 py-2 space-y-0">

      {/* ── Disclaimer ───────────────────────────────────────────────────────── */}
      <div
        className="rounded-md p-4 mb-5"
        style={{ background: C.brickLight, borderLeft: `3px solid ${C.brick}` }}
      >
        <p className="text-[13px] font-semibold mb-1" style={{ color: C.brick }}>
          Accountability data — read with context
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: C.ink }}>
          {t('police.disclaimer', DISCLAIMER)}
        </p>
        <p className="text-[12px] mt-1.5 leading-relaxed" style={{ color: C.muted }}>
          {t('police.raceDataNote', 'Traffic and pedestrian stop data includes race of the subject, included by the city specifically for accountability purposes (originating from the Collaborative Agreement).')}
        </p>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: C.muted }}>
          This tab focuses on <strong style={{ color: C.ink }}>police behavior</strong> — stop patterns, force used, and officer-involved shootings.
          Neighborhood-level crime trend data is in the <strong style={{ color: C.ink }}>Neighborhood Profiles</strong> tab.
        </p>
      </div>

      {/* ── Sub-nav ───────────────────────────────────────────────────────────── */}
      <div className="page-paper rounded-md mb-5" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <div className="flex flex-wrap">
          {([
            { id: 'traffic',  label: t('police.trafficStops', 'Traffic Stops') },
            { id: 'force',    label: t('police.useOfForce',   'Use of Force') },
            { id: 'ois',      label: t('police.ois',          'OIS') },
            { id: 'question', label: t('police.askQuestion',  'Ask a Question') },
          ] as { id: SubSection; label: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className="px-5 py-3 text-[13px] font-medium transition-colors"
              style={{
                borderBottom: activeSection === tab.id ? `2px solid ${C.river}` : '2px solid transparent',
                color: activeSection === tab.id ? C.ink : C.muted,
                background: 'transparent',
                fontFamily: '"Public Sans", sans-serif',
                marginBottom: -1,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Traffic Stops ─────────────────────────────────────────────────────── */}
      {activeSection === 'traffic' && (
        <div className="space-y-5">
          {/* Controls */}
          <div className="page-paper rounded-md p-4">
            <div className="flex flex-wrap items-center gap-5 text-[13px]" style={{ color: C.muted }}>
              <span className="smallcaps">Year</span>
              <select
                value={trafficYear}
                onChange={(e) => setTrafficYear(parseInt(e.target.value))}
                style={selectStyle}
              >
                {[2018, 2019, 2020, 2021, 2022, 2023, 2024].map((yr) => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>

              <span className="smallcaps">District</span>
              <select
                value={trafficDistrict}
                onChange={(e) => setTrafficDistrict(e.target.value)}
                style={selectStyle}
              >
                <option value="all">All Districts</option>
                {[1, 2, 3, 4, 5].map((d) => (
                  <option key={d} value={d}>District {d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Stops by Race */}
          <DataCard
            title={t('police.stopsbyRace', 'Stops by Race')}
            loading={trafficLoading}
            error={trafficError}
            empty={trafficByRaceData.length === 0}
          >
            {trafficByRaceData.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={trafficByRaceData} margin={{ bottom: 60, left: 10 }}>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis
                    dataKey="race"
                    angle={-35}
                    textAnchor="end"
                    interval={0}
                    tick={{ fontSize: 11, fill: C.muted }}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v}
                  />
                  <YAxis {...axisProps} tickFormatter={(v: number) => v.toLocaleString()} width={65} />
                  <Tooltip
                    formatter={(v: number) => v.toLocaleString()}
                    contentStyle={tooltipStyle}
                  />
                  <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                    {trafficByRaceData.map((entry: any, i: number) => (
                      <Cell key={i} fill={RACE_COLORS[entry.race] || C.muted} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-[11px] italic mt-3" style={{ color: C.muted }}>
              Chart shows raw stop counts. Cincinnati is approximately 40% Black and 48% white (ACS 2022).
              Comparing counts to population share provides a stops-per-capita context the chart alone does not convey.
            </p>
            <DataAttribution source={t('police.attributionTraffic', 'Traffic Stops')} uid="ktgf-4sjh" />
          </DataCard>

          {/* Outcomes by Race */}
          <DataCard
            title={t('police.outcomesByRace', 'Outcomes by Race (Disposition)')}
            loading={trafficOutcome.loading}
            error={trafficOutcome.error}
          >
            <p className="text-[12px] italic mb-3" style={{ color: C.muted }}>
              Cincinnati's traffic stops dataset does not include a "searched" field.
              Showing reported stop outcomes (disposition_text) by race instead.
            </p>
            {trafficOutcomeData.length > 0 && topDispositions.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${C.rule}` }}>
                      <th className="text-left py-2 pr-3 font-semibold whitespace-nowrap" style={{ color: C.ink }}>Race</th>
                      <th className="text-right py-2 pr-3 font-semibold" style={{ color: C.ink }}>Total</th>
                      {topDispositions.map((d) => (
                        <th key={d} className="text-right py-2 px-2 font-semibold whitespace-nowrap max-w-[100px] truncate" title={d} style={{ color: C.ink }}>
                          {d.length > 14 ? d.slice(0, 12) + '…' : d}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {trafficOutcomeData.slice(0, 8).map((row) => (
                      <tr key={row.race} style={{ borderBottom: `1px solid ${C.rule}` }}>
                        <td className="py-2 pr-3 font-medium whitespace-nowrap" style={{ color: C.ink }}>{row.race}</td>
                        <td className="py-2 pr-3 text-right font-semibold tnum" style={{ color: C.ink }}>
                          {row.total.toLocaleString()}
                        </td>
                        {topDispositions.map((d) => (
                          <td key={d} className="py-2 px-2 text-right tnum" style={{ color: C.muted }}>
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

      {/* ── Use of Force ──────────────────────────────────────────────────────── */}
      {activeSection === 'force' && (
        <div className="space-y-5">
          {/* Controls */}
          <div className="page-paper rounded-md p-4">
            <div className="flex flex-wrap items-center gap-5 text-[13px]" style={{ color: C.muted }}>
              <span className="smallcaps">Year</span>
              <select
                value={forceYear}
                onChange={(e) => setForceYear(parseInt(e.target.value))}
                style={selectStyle}
              >
                {[2021, 2022, 2023, 2024, 2025].map((yr) => (
                  <option key={yr} value={yr}>{yr}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary stat */}
          <div
            className="page-paper rounded-md p-5"
            style={{ borderLeft: `3px solid ${C.brick}` }}
          >
            <div className="serif font-medium leading-none" style={{ fontSize: 48, color: C.brick }}>
              {parseInt((forceCount.data as any)?.[0]?.total || '0', 10).toLocaleString()}
            </div>
            <div className="text-[13px] mt-2" style={{ color: C.muted }}>
              {t('police.totalForceIncidents', 'Use of force incidents')} in {forceYear}
            </div>
          </div>

          {/* Force by Type */}
          <DataCard
            title={t('police.forceByType', 'Use of Force by Type')}
            loading={forceByTypeQ.loading}
            error={forceByTypeQ.error}
            empty={forceByType.length === 0}
          >
            <p className="text-[12px] italic mb-3" style={{ color: C.muted }}>
              This dataset does not include a race field. Breakdown shown by force type (formtype).{' '}
              <strong style={{ color: C.ink }}>Other Investigation</strong> is a CPD catch-all: all records in that
              category are classified only as "Investigation Report" with no further sub-type available.
            </p>
            {forceByType.length > 0 && (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={forceByType} margin={{ bottom: 80, left: 10 }}>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="type" {...axisProps} angle={-35} textAnchor="end" interval={0}
                    tick={{ fontSize: 11, fill: C.muted }}
                    tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v} />
                  <YAxis {...axisProps} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill={C.brick} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
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
            {forceByNeighborhood.length > 0 && (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={forceByNeighborhood}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="neighborhood" {...axisProps} angle={-45} textAnchor="end" height={80}
                    tick={{ fontSize: 11, fill: C.muted }} />
                  <YAxis {...axisProps} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" fill={C.brick} />
                </BarChart>
              </ResponsiveContainer>
            )}
            <p className="text-[11px] italic mt-2" style={{ color: C.muted }}>
              A small number of incidents (~37 in 2024) have no SNA neighborhood assigned — these span multiple
              districts or fall outside city limits. They are excluded from this chart.
            </p>
            <DataAttribution source={t('police.attributionForce', 'Use of Force')} uid="748b-sht4" />
          </DataCard>

          {/* Subjects by Race — horizontal bars avoid label rotation overlap */}
          <DataCard
            title="Use of Force — Subjects by Race"
            loading={forceSubjectsByRaceQ.loading}
            error={forceSubjectsByRaceQ.error}
            empty={forceSubjectsByRace.length === 0}
          >
            <p className="text-[12px] italic mb-3" style={{ color: C.muted }}>
              Race of subjects involved in use-of-force incidents, from the CPD Subjects table (4gu6-tz3f).
              Covers 2021–2024. <strong style={{ color: C.ink }}>UNKNOWN</strong> means the officer did not record
              the subject's race — it does not indicate a separate demographic category.
            </p>
            {forceSubjectsByRace.length > 0 ? (
              <ResponsiveContainer width="100%" height={forceSubjectsByRace.length * 36 + 20}>
                <BarChart data={forceSubjectsByRace} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" {...axisProps} tickFormatter={(v: number) => v.toLocaleString()} />
                  <YAxis type="category" dataKey="race" width={175} tick={{ fontSize: 11, fill: C.muted }} />
                  <Tooltip formatter={(v: number) => v.toLocaleString()} contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]}>
                    {forceSubjectsByRace.map((entry: any, i: number) => (
                      <Cell key={i} fill={RACE_COLORS[entry.race] || C.muted} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message={forceSubjectsByRaceQ.loading ? 'Loading…' : `No subject data available for ${forceYear}. Coverage is 2021–2024.`} />
            )}
            <DataAttribution source="Use of Force – Subjects" uid="4gu6-tz3f" />
          </DataCard>

          {/* Incident Map — overflow:hidden clips Leaflet tiles whose CSS transforms escape the container */}
          <div className="page-paper rounded-md p-5" style={{ overflow: 'hidden' }}>
            <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
              Where CPD Used Force — Geographic Distribution
            </div>
            {mapLoading && (
              <p className="text-[13px] py-2" style={{ color: C.muted }}>Loading location data…</p>
            )}
            <p className="text-[12px] italic mb-3" style={{ color: C.muted }}>
              Each dot marks the location of a <strong style={{ color: C.ink }}>police use-of-force incident</strong> — where
              an officer applied physical or mechanical force. This is accountability data about{' '}
              <em>police conduct</em>, not a crime map. Concentration in certain neighborhoods reflects
              patrol patterns and deployment, not resident behavior.
            </p>
            {/* position:relative is required — Leaflet uses absolute-positioned panes inside the container */}
            <div ref={heatmapRef} style={{ height: 420, width: '100%', position: 'relative' }} />
            <div className="mt-3">
              <DataAttribution source={t('police.attributionForce', 'Use of Force')} uid="748b-sht4" />
            </div>
          </div>
        </div>
      )}

      {/* ── OIS / Firearm Discharge ───────────────────────────────────────────── */}
      {activeSection === 'ois' && (
        <div className="space-y-5">

          {/* ── Current data (2021–present) ────────────────────────────────────── */}
          <div className="page-paper rounded-md p-6">
            {/* Section header */}
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
              01 · Officer-Involved Shootings
            </div>
            <div className="serif mb-4" style={{ fontSize: 26, fontWeight: 500, color: C.brick, lineHeight: 1.2 }}>
              {firearmsIncidents.loading
                ? 'Loading…'
                : firearmsLatestYear
                  ? `${firearmsLatestYear.count} firearm discharge${firearmsLatestYear.count !== 1 ? 's' : ''} recorded in ${firearmsLatestYear.year}.`
                  : 'Firearm discharge data (2021–present)'}
            </div>

            {/* Stat grid — by year */}
            {firearmsIncidentsByYear.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-5">
                {firearmsIncidentsByYear.map((d: any) => (
                  <div
                    key={d.year}
                    className="text-center rounded-md"
                    style={{ background: C.limestone, minWidth: 80, padding: '14px 18px' }}
                  >
                    <div className="serif font-medium leading-none" style={{ fontSize: 40, color: C.river }}>
                      {d.count}
                    </div>
                    <div className="text-[10px] mt-1.5 uppercase tracking-widest" style={{ color: C.muted }}>
                      {d.year}
                    </div>
                  </div>
                ))}
                {/* Total across all years */}
                <div
                  className="text-center rounded-md"
                  style={{ background: C.brickLight, minWidth: 80, padding: '14px 18px', borderLeft: `2px solid ${C.brick}` }}
                >
                  <div className="serif font-medium leading-none" style={{ fontSize: 40, color: C.brick }}>
                    {firearmsTotal}
                  </div>
                  <div className="text-[10px] mt-1.5 uppercase tracking-widest" style={{ color: C.muted }}>
                    Total (2021–2024)
                  </div>
                </div>
              </div>
            )}

            {/* Data gap note */}
            <div className="rounded px-3 py-2 mb-4" style={{ background: C.limestone, border: `1px solid ${C.rule}` }}>
              <p className="text-[12px]" style={{ color: C.muted }}>
                <strong style={{ color: C.ink }}>No 2023 or 2025 data is published.</strong>{' '}
                The city's open data portal shows 0 records for those years — this appears to reflect
                a recording gap, not zero incidents. CPD publishes full case files (redacted) within 90 days
                on the open data portal. Fatality status and CCIA review outcomes are <em>not</em> included
                in this dataset.
              </p>
            </div>

            {/* CCIA context */}
            <div style={{ borderTop: `1px solid ${C.rule}`, paddingTop: 14, marginTop: 4 }}>
              <p className="text-[12px] leading-relaxed" style={{ color: C.muted }}>
                <strong style={{ color: C.ink }}>Cincinnati Citizen Complaint Authority (CCIA)</strong> independently
                reviews every officer-involved shooting and serious use-of-force incident. Reviews examine
                whether force was within policy, identify training gaps, and produce public findings.
                CCIA case status is not published in machine-readable open data — visit{' '}
                <a href="https://www.cincinnati-oh.gov/cca/" target="_blank" rel="noopener noreferrer"
                  style={{ color: C.river }}>cincinnati-oh.gov/cca</a> for case files and annual reports.
              </p>
            </div>

            <div className="mt-4 flex gap-3 flex-wrap text-[11px]" style={{ color: C.muted }}>
              <DataAttribution source="Police Firearm Discharge – Incidents" uid="n625-s9aa" />
            </div>
          </div>

          {/* Subjects by race — labeled rows; 5 total subjects, chart would be misleading */}
          <DataCard
            title="Firearm Discharge — Subjects by Race (2021–2024)"
            loading={firearmsSubjects.loading}
            error={firearmsSubjects.error}
            empty={firearmsSubjectsByRace.length === 0}
          >
            <p className="text-[12px] italic mb-3" style={{ color: C.muted }}>
              Race of subjects involved in all recorded firearm discharge incidents.
              5 subjects total across the dataset — a bar chart would overstate precision.
            </p>
            {firearmsSubjectsByRace.length > 0 && (
              <div className="divide-y" style={{ borderTop: `1px solid ${C.rule}` }}>
                {firearmsSubjectsByRace.map((entry: any) => (
                  <div key={entry.race} className="flex items-center justify-between py-2.5">
                    <span className="text-[13px]" style={{ color: C.ink }}>{entry.race}</span>
                    <span
                      className="serif font-medium tnum"
                      style={{ fontSize: 28, color: RACE_COLORS[entry.race] || C.muted }}
                    >
                      {entry.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <DataAttribution source="Police Firearm Discharge – Subjects" uid="dxac-g4wm" />
          </DataCard>

          {/* ── Legacy OIS (2001–2019) ─────────────────────────────────────────── */}
          <div className="page-paper rounded-md p-6">
            <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: C.muted }}>
              02 · Legacy OIS Record (frozen at 2019)
            </div>
            <div className="serif mb-4" style={{ fontSize: 22, fontWeight: 500, color: C.ink, lineHeight: 1.3 }}>
              {oisStats
                ? `${oisStats.avg} incidents per year on average (${oisStats.earliest}–${oisStats.latest.year}), peaking at ${oisStats.peak.count} in ${oisStats.peak.year}.`
                : 'Historical officer-involved shooting record.'}
            </div>

            {/* Key stat chips */}
            {oisStats && (
              <div className="flex flex-wrap gap-3 mb-5">
                <div className="text-center rounded-md" style={{ background: C.limestone, minWidth: 80, padding: '12px 18px' }}>
                  <div className="serif font-medium leading-none" style={{ fontSize: 36, color: C.muted }}>{oisStats.avg}</div>
                  <div className="text-[10px] mt-1 uppercase tracking-widest" style={{ color: C.muted }}>Avg / year</div>
                </div>
                <div className="text-center rounded-md" style={{ background: C.limestone, minWidth: 80, padding: '12px 18px' }}>
                  <div className="serif font-medium leading-none" style={{ fontSize: 36, color: C.muted }}>{oisStats.peak.count}</div>
                  <div className="text-[10px] mt-1 uppercase tracking-widest" style={{ color: C.muted }}>Peak ({oisStats.peak.year})</div>
                </div>
                <div className="text-center rounded-md" style={{ background: C.limestone, minWidth: 80, padding: '12px 18px' }}>
                  <div className="serif font-medium leading-none" style={{ fontSize: 36, color: C.muted }}>{oisStats.latest.count}</div>
                  <div className="text-[10px] mt-1 uppercase tracking-widest" style={{ color: C.muted }}>In {oisStats.latest.year}</div>
                </div>
              </div>
            )}

            {/* Historical context callouts */}
            <div className="space-y-3 mb-5">
              <div className="rounded-md p-4" style={{ background: C.limestone, borderLeft: `3px solid ${C.river}` }}>
                <p className="text-[12px] font-semibold mb-1" style={{ color: C.riverDeep }}>
                  2001 — The Collaborative Agreement
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: C.ink }}>
                  The April 2001 shooting of Timothy Thomas — 19 years old and unarmed — by a CPD officer
                  sparked three days of civil unrest, the largest such event in Cincinnati since the 1960s.
                  The aftermath led directly to the{' '}
                  <strong>Collaborative Agreement</strong> (2002), a nationally pioneering consent decree
                  between CPD, the ACLU, and community organizations that mandated use-of-force reform,
                  community policing, and civilian oversight. It is the foundational document behind CPD's
                  modern accountability structure, including the data published on this tab.
                </p>
              </div>

              <div className="rounded-md p-4" style={{ background: C.limestone, borderLeft: `3px solid ${C.ochre}` }}>
                <p className="text-[12px] font-semibold mb-1" style={{ color: C.ochre }}>
                  2014–2016 — Spike, then decline
                </p>
                <p className="text-[12px] leading-relaxed" style={{ color: C.ink }}>
                  The legacy data shows an elevated period from 2014–2016 followed by a reduction.
                  Nationally, this period coincides with the Ferguson unrest (August 2014), the emergence
                  of the Black Lives Matter movement, and dramatically increased public and federal scrutiny
                  of police use of force. Many departments also updated reporting practices, making previously
                  unreported incidents appear in data for the first time. The post-2016 decline in Cincinnati
                  aligns with CPD's citywide body camera rollout (2015–2016) and expanded de-escalation
                  training implemented under Collaborative Agreement compliance monitoring —
                  though the dataset alone cannot establish causation.
                </p>
              </div>
            </div>

            {/* Reference bar chart */}
            {oisByYear.length > 0 && (
              <>
                <p className="text-[12px] mb-3" style={{ color: C.muted }}>
                  Full year-by-year breakdown. Dataset frozen at September 2019 — no new records added after that date.
                </p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={oisByYear} margin={{ bottom: 10, left: 0, right: 10 }}>
                    <CartesianGrid {...gridProps} />
                    <XAxis dataKey="year" {...axisProps} />
                    <YAxis {...axisProps} allowDecimals={false} width={28} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                      {oisByYear.map((entry: any, i: number) => {
                        const yr = parseInt(entry.year)
                        const fill =
                          yr === 2001 ? C.river
                          : yr >= 2014 && yr <= 2016 ? C.ochre
                          : C.muted
                        return <Cell key={i} fill={fill} />
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}

            {/* Officer race from legacy data */}
            {oisOfficerRaceData.length > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: C.muted }}>
                  Officer Race (2001–2019, legacy record)
                </div>
                <div className="divide-y" style={{ borderTop: `1px solid ${C.rule}` }}>
                  {oisOfficerRaceData.map((entry: any) => (
                    <div key={entry.race} className="flex items-center justify-between py-2">
                      <span className="text-[12px]" style={{ color: C.ink }}>{entry.race}</span>
                      <span className="text-[13px] font-semibold tnum" style={{ color: C.muted }}>
                        {entry.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4">
              <DataAttribution
                source={t('police.attributionOIS', 'PDI Officer-Involved Shootings (legacy)')}
                uid="r6q4-muts"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Ask a Question ────────────────────────────────────────────────────── */}
      {activeSection === 'question' && (
        <div className="space-y-5">
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
                placeholder={t('police.questionPlaceholder', 'e.g., "What is the search rate for pedestrian stops in 2024?" or "How many traffic stops were there in District 3?"')}
                rows={4}
                className="w-full px-4 py-2 rounded-md text-[13px]"
                style={{
                  background: C.limestone,
                  border: `1px solid ${C.rule}`,
                  color: C.ink,
                  fontFamily: '"Public Sans", sans-serif',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />

              <button
                onClick={handleAiQuestion}
                disabled={loadingAi || !aiQuestion.trim()}
                className="px-5 py-2 rounded-md text-[13px] font-medium transition-opacity disabled:opacity-40"
                style={{
                  background: C.river,
                  color: '#fff',
                  fontFamily: '"Public Sans", sans-serif',
                  cursor: loadingAi || !aiQuestion.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {loadingAi
                  ? t('police.askQuestion_loading', 'Analyzing...')
                  : t('police.askQuestion_button', 'Ask Question')}
              </button>

              {aiResponse && (
                <div
                  className="rounded-md p-4"
                  style={{ background: C.hillLight, borderLeft: `3px solid ${C.hill}` }}
                >
                  <div className="text-[13px] font-semibold mb-2" style={{ color: C.hill }}>
                    {t('police.response', 'Response')}
                  </div>
                  <div className="prose prose-sm max-w-none text-[13px]" style={{ color: C.ink }}>
                    {renderMarkdown(aiResponse)}
                  </div>
                </div>
              )}

              <div className="pt-4" style={{ borderTop: `1px solid ${C.rule}` }}>
                <p className="smallcaps mb-2" style={{ color: C.muted }}>
                  {t('police.availableDatasets', 'Available Datasets')}
                </p>
                <ul className="space-y-1 text-[12px]" style={{ color: C.muted }}>
                  <li>
                    <strong style={{ color: C.ink }}>Traffic Stops</strong> (ktgf-4sjh):
                    interview_date, race, sex, disposition_text, district
                  </li>
                  <li>
                    <strong style={{ color: C.ink }}>Use of Force</strong> (748b-sht4):
                    eventdate, sna_neighborhood, formtype — updated through 2024
                  </li>
                  <li>
                    <strong style={{ color: C.ink }}>OIS Legacy</strong> (r6q4-muts): incident_date — frozen at 2019
                  </li>
                  <li style={{ opacity: 0.6, fontStyle: 'italic' }}>
                    Pedestrian Stops (jx3x-rh6i): currently near-empty on the city portal — not queryable
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
