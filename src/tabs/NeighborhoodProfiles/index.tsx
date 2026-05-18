import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSODA } from '../../hooks/useSODA';
import { fetchSODA, fetchNeighborhoodCensusStats, stripNeighborhoodName } from '../../utils/api';
import type { NeighborhoodCensusStats } from '../../utils/api';
import { getNeighborhoodBlurb } from '../../data/neighborhoodBlurbs';
import demographicsData from '../../../public/data/neighborhood_demographics.json';
import { Chip, Section, PaintHeadline, Lede, C } from '../../components/ui/DesignAtoms';
import VisitBriefSidebar from './VisitBriefSidebar';
import UnifiedEquitySection from '../RacialEquity/UnifiedEquitySection';
import PublicSafetySection from './PublicSafetySection';
import CityServicesSection from './CityServicesSection';
import DevelopmentSection from './DevelopmentSection';
import HousingInventorySection from './HousingInventorySection';
import TransitEquitySection from './TransitEquitySection';
import HealthOutcomesSection from './HealthOutcomesSection';
import LifeExpectancySection from './LifeExpectancySection';
import SeniorHealthSection from './SeniorHealthSection';
import ExpandedDemographicsSection from './ExpandedDemographicsSection';
import CommunityCouncilSection from './CommunityCouncilSection';
import RecreationCentersSection from './RecreationCentersSection';
import { CivicOrgsPanel, EmptyState, DataAttribution, DataCard } from '../../components/ui';

// Static data for life expectancy context in headlines
import lifeExpData from '../../../public/data/neighborhood_life_expectancy.json';
const lifeExp = lifeExpData as Record<string, { name: string; lifeExpectancy: number }>;
const CITY_LIFE_EXP = 77.1;

const NEIGHBORHOODS = [
  'Avondale', 'Bond Hill', 'California', 'Camp Washington', 'Carthage',
  'CBD / Riverfront', 'Clifton', 'Clifton Heights', 'College Hill',
  'Columbia-Tusculum', 'Corryville', 'East End', 'East Price Hill',
  'East Walnut Hills', 'East Westwood', 'English Woods', 'Evanston',
  'Fairview', 'Fay Apartments', 'Hartwell', 'Hyde Park', 'Kennedy Heights',
  'Linwood', 'Lower Price Hill', 'Madisonville', 'Millvale', 'Mount Adams',
  'Mount Airy', 'Mount Auburn', 'Mt. Lookout', 'Mt. Washington',
  'North Avondale', 'North Fairmount', 'Northside', 'Oakley', "O'Bryonville",
  'Over-the-Rhine', 'Paddock Hills', 'Pendleton', 'Pleasant Ridge', 'Queensgate',
  'Riverside', 'Roselawn', 'Sayler Park', 'Sedamsville', 'South Cumminsville',
  'South Fairmount', 'Spring Grove Village', 'Walnut Hills', 'West End',
  'West Price Hill', 'Westwood', 'Winton Hills',
];

const NEIGHBORHOOD_DATASET_KEY: Record<string, string> = {
  'Bond Hill':         'BONDHILL',
  'CBD / Riverfront':  'C. B. D. / RIVERFRONT',
  'Clifton Heights':   'CLIFTON/UNIVERSITY HEIGHTS',
  'Columbia-Tusculum': 'COLUMBIA / TUSCULUM',
  'Mt. Lookout':       'MT. LOOKOUT',
  'Mt. Washington':    'MT. WASHINGTON',
  "O'Bryonville":      "O'BRYONVILLE",
  'South Cumminsville':'S. CUMMINSVILLE',
};

const CENSUS_KEY_OVERRIDE: Record<string, string> = {
  'CBD / Riverfront':  'downtown',
  'Clifton Heights':   'cuf',
  'Fairview':          'cuf',
  'Fay Apartments':    'wesend',
  "O'Bryonville":      'hydeparkobryonville',
  'Queensgate':        'lowerpricehillqueensgate',
  'Sedamsville':       'riversidesedamsville',
  'English Woods':     'englishwoodsnorthfairmount',
  'Lower Price Hill':  'lowerpricehillqueensgate',
  'Millvale':          'millvale',
};

interface NeighborhoodProfilesProps {
  onViewMap?: () => void;
}


export default function NeighborhoodProfiles({ onViewMap }: NeighborhoodProfilesProps = {}) {
  const { t } = useTranslation();
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>(NEIGHBORHOODS[0]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [availableNeighborhoods, setAvailableNeighborhoods] = useState<string[]>(NEIGHBORHOODS);

  // Populate neighborhood dropdown from live crime data
  useEffect(() => {
    fetchSODA<{ cpd_neighborhood: string }>('7aqy-xrv9', {
      $select: 'cpd_neighborhood',
      $group: 'cpd_neighborhood',
      $limit: 100,
    }).then(({ data: rows }) => {
      if (!rows || rows.length === 0) return;
      const activeKeys = new Set(
        rows.map((r) => r.cpd_neighborhood?.toUpperCase().trim()).filter(Boolean)
      );
      const filtered = NEIGHBORHOODS.filter((nb) => {
        const k = NEIGHBORHOOD_DATASET_KEY[nb] ?? nb.toUpperCase();
        return activeKeys.has(k);
      });
      if (filtered.length > 0) {
        setAvailableNeighborhoods(filtered);
        setSelectedNeighborhood((prev) => (filtered.includes(prev) ? prev : filtered[0]));
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nbhUpper = NEIGHBORHOOD_DATASET_KEY[selectedNeighborhood] ?? selectedNeighborhood.toUpperCase();
  const nbhSoQL  = nbhUpper.replace(/'/g, "''");

  // Food safety data
  const foodSafety = useSODA('rg6p-b3h3', {
    $where: `neighborhood='${nbhSoQL}' AND neighborhood != 'N/A' AND action_date >= '${startDate}' AND action_date <= '${endDate}'`,
    $limit: 500,
  });

  const uniqueFacilities = useMemo(() => {
    const seen = new Set<string>();
    return (foodSafety.data || []).filter((item: any) => {
      const k = item.license_no || item.business_name || String(Math.random());
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [foodSafety.data]);

  const activeViolations = useMemo(() => {
    const fwv = new Set<string>();
    (foodSafety.data || []).forEach((item: any) => {
      const st = (item.action_status || '').toLowerCase();
      if (!st.includes('no violation') &&
        (st.includes('violation') || st.includes('fail') || st.includes('critical'))) {
        fwv.add(item.license_no || item.business_name || '');
      }
    });
    return fwv;
  }, [foodSafety.data]);

  // Census stats
  const [censusStats, setCensusStats] = useState<Map<string, NeighborhoodCensusStats> | null>(null);
  const [censusLoading, setCensusLoading] = useState(true);

  useEffect(() => {
    fetchNeighborhoodCensusStats()
      .then(setCensusStats)
      .catch(() => setCensusStats(null))
      .finally(() => setCensusLoading(false));
  }, []);

  const censusData = useMemo(() => {
    if (!censusStats) return null;
    const k = CENSUS_KEY_OVERRIDE[selectedNeighborhood] ?? stripNeighborhoodName(selectedNeighborhood);
    return censusStats.get(k) ?? null;
  }, [censusStats, selectedNeighborhood]);

  const rankings = useMemo(() => {
    if (!censusStats || !censusData) return null;
    const all = [...censusStats.values()];
    const incomes = all.map(s => s.medianHouseholdIncome).filter((v): v is number => v != null).sort((a, b) => b - a);
    const burdens = all.map(s => s.rentBurdenRate).filter((v): v is number => v != null).sort((a, b) => a - b);
    return {
      incomeRank:         censusData.medianHouseholdIncome != null ? incomes.indexOf(censusData.medianHouseholdIncome) + 1 : null,
      burdenRank:         censusData.rentBurdenRate        != null ? burdens.indexOf(censusData.rentBurdenRate)        + 1 : null,
      totalNeighborhoods: all.length,
    };
  }, [censusStats, censusData]);

  // Top 311 calls — minimal query for Visit Brief sidebar
  // Note: 311 dataset (gcej-gmiw) uses date_created and sr_type_desc, not requested_date/service_name
  const [topRequests, setTopRequests] = useState<Array<{ label: string; count: number }>>([]);
  useEffect(() => {
    fetchSODA<{ sr_type_desc: string; count: string }>('gcej-gmiw', {
      $select:  'sr_type_desc,count(sr_type_desc) as count',
      $where:   `neighborhood='${nbhSoQL}' AND date_created >= '${startDate}' AND date_created <= '${endDate}'`,
      $group:   'sr_type_desc',
      $order:   'count desc',
      $limit:   5,
    }).then(({ data: rows }) => {
      if (!rows) return;
      setTopRequests(rows.map((r) => ({ label: r.sr_type_desc, count: parseInt(r.count, 10) || 0 })));
    }).catch(() => {});
  }, [selectedNeighborhood, startDate, endDate, nbhSoQL]);

  // Life expectancy — for picture-painting headlines
  const lifeKey = stripNeighborhoodName(selectedNeighborhood);
  const lifeYrs = lifeExp[lifeKey]?.lifeExpectancy;
  const lifeGap = lifeYrs != null ? CITY_LIFE_EXP - lifeYrs : null;

  // Income headline fragment
  const income    = censusData?.medianHouseholdIncome;
  const cityInc   = 40000; // Cincinnati citywide approximate
  const incomeRatio = income != null ? income / cityInc : null;
  const rentBurden  = censusData?.rentBurdenRate;

  const blurb = getNeighborhoodBlurb(selectedNeighborhood);

  const downloadCSV = () => {
    const rows: [string, string][] = [
      ['Neighborhood', selectedNeighborhood],
      ['Date range', `${startDate} to ${endDate}`],
      ['Life expectancy (years)', lifeYrs != null ? String(lifeYrs) : ''],
      ['City avg life expectancy', String(CITY_LIFE_EXP)],
      ['Median household income', censusData?.medianHouseholdIncome != null ? String(censusData.medianHouseholdIncome) : ''],
      ['Rent burden rate (%)', censusData?.rentBurdenRate != null ? String(censusData.rentBurdenRate) : ''],
      ['Total population', demoRecord?.totalPopulation != null ? String(demoRecord.totalPopulation) : ''],
      ['Median age', demoRecord?.medianAge != null ? String(demoRecord.medianAge) : ''],
      ['Under 18 (%)', demoRecord?.under18Pct != null ? String(demoRecord.under18Pct) : ''],
      ['Over 65 (%)', demoRecord?.over65Pct != null ? String(demoRecord.over65Pct) : ''],
      ['Foreign born (%)', demoRecord?.foreignBornPct != null ? String(demoRecord.foreignBornPct) : ''],
      ['English only (%)', demoRecord?.englishOnlyPct != null ? String(demoRecord.englishOnlyPct) : ''],
      ['Bachelor degree or higher (%)', demoRecord?.bachelorsOrHigherPct != null ? String(demoRecord.bachelorsOrHigherPct) : ''],
      ['Broadband access (%)', demoRecord?.broadbandPct != null ? String(demoRecord.broadbandPct) : ''],
      ...topRequests.map((r, i) => [`Top 311 call #${i + 1}`, `${r.label} (${r.count})`] as [string, string]),
    ]
    const csv = rows.map(([k, v]) => `"${k}","${v}"`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${selectedNeighborhood.replace(/[^a-z0-9]/gi, '_')}_profile.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Data sentence for hero — derived from static demographics JSON
  const demoRecord = (demographicsData as Record<string, any>)[stripNeighborhoodName(selectedNeighborhood)];
  const demoSentence = useMemo(() => {
    if (!demoRecord?.totalPopulation) return null;
    const pop = demoRecord.totalPopulation.toLocaleString();
    const seniors = demoRecord.over65Pct != null
      ? Math.round(demoRecord.over65Pct / 100 * demoRecord.totalPopulation).toLocaleString()
      : null;
    const youth = demoRecord.under18Pct != null
      ? Math.round(demoRecord.under18Pct / 100 * demoRecord.totalPopulation).toLocaleString()
      : null;
    if (seniors && youth) {
      return `About ${pop} residents — roughly ${youth} under 18 and ${seniors} age 65 or older.`;
    }
    return `About ${pop} residents.`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoRecord]);

  return (
    <div className="px-8 py-2">

      {/* ── Top controls bar ─────────────────────────────────────────────── */}
      <div
        className="flex flex-wrap items-center gap-4 py-5 text-[13px] no-print"
        style={{ color: C.muted }}
      >
        <span className="smallcaps">Neighborhood</span>
        <select
          value={selectedNeighborhood}
          onChange={(e) => setSelectedNeighborhood(e.target.value)}
          className="appearance-none pl-3 pr-8 py-1.5 rounded-md font-medium text-[14px] cursor-pointer"
          style={{
            background: C.paper,
            color:      C.ink,
            border:     `1px solid ${C.rule}`,
            fontFamily: 'Newsreader, serif',
          }}
        >
          {availableNeighborhoods.map((nb) => (
            <option key={nb} value={nb}>{nb}</option>
          ))}
        </select>

        <span style={{ color: C.rule }}>·</span>

        <label className="smallcaps">From</label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="px-2 py-1 rounded-md text-[13px]"
          style={{ background: C.paper, border: `1px solid ${C.rule}`, color: C.ink }}
        />
        <label className="smallcaps">To</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="px-2 py-1 rounded-md text-[13px]"
          style={{ background: C.paper, border: `1px solid ${C.rule}`, color: C.ink }}
        />

        <div className="flex-1" />

        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 hover:underline transition-colors"
          style={{ color: C.river }}
        >
          Print brief
        </button>

        <button
          onClick={downloadCSV}
          className="flex items-center gap-1.5 hover:underline transition-colors"
          style={{ color: C.river }}
        >
          Download data
        </button>

        {onViewMap && (
          <button
            onClick={onViewMap}
            className="flex items-center gap-1.5 hover:underline transition-colors"
            style={{ color: C.river }}
          >
            Compare all →
          </button>
        )}
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <header className="page-paper rounded-md px-10 pt-10 pb-9 mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <span className="smallcaps" style={{ color: C.brick }}>Neighborhood Profile</span>
        </div>

        <h1
          className="serif font-medium leading-none"
          style={{ fontSize: 'clamp(48px, 7vw, 96px)', letterSpacing: '-0.025em', color: C.ink }}
        >
          {selectedNeighborhood}<span style={{ color: C.brick }}>.</span>
        </h1>

        <div
          className="mt-6 grid gap-10 items-start"
          style={{ gridTemplateColumns: rankings ? '1fr auto' : '1fr' }}
        >
          <div style={{ maxWidth: 760 }}>
            <p className="serif leading-relaxed" style={{ fontSize: 18, color: C.ink }}>
              {blurb}
            </p>
            {demoSentence && (
              <p className="serif mt-2" style={{ fontSize: 15, color: C.muted }}>
                {demoSentence}
              </p>
            )}
          </div>

          {rankings && (
            <div className="border-l pl-6 self-stretch shrink-0" style={{ borderColor: C.rule }}>
              <div className="smallcaps mb-2" style={{ color: C.muted }}>Where it ranks</div>
              <div className="space-y-2 text-[13px]">
                {rankings.incomeRank != null && (
                  <div className="tnum">
                    <span className="serif font-medium" style={{ fontSize: 20, color: C.river }}>
                      #{rankings.incomeRank}
                    </span>
                    <span style={{ color: C.muted }}>/{rankings.totalNeighborhoods} income</span>
                  </div>
                )}
                {rankings.burdenRank != null && (
                  <div className="tnum">
                    <span className="serif font-medium" style={{ fontSize: 20, color: C.river }}>
                      #{rankings.burdenRank}
                    </span>
                    <span style={{ color: C.muted }}>/{rankings.totalNeighborhoods} affordability</span>
                  </div>
                )}
              </div>
              <p className="text-[10px] mt-2" style={{ color: C.muted }}>ACS 2022 · {rankings.totalNeighborhoods} nbhds</p>
            </div>
          )}
        </div>
      </header>

      {/* ── Two-column body: Visit Brief (sticky) + scrolling sections ────── */}
      <div
        className="grid gap-10 pb-16 items-start"
        style={{ gridTemplateColumns: '320px 1fr' }}
      >

        {/* LEFT: Visit Brief rail */}
        <aside className="no-print">
          <VisitBriefSidebar
            neighborhood={selectedNeighborhood}
            topRequests={topRequests}
            cityLifeExpectancy={CITY_LIFE_EXP}
          />
        </aside>

        {/* RIGHT: scrolling editorial content */}
        <article className="min-w-0 space-y-14">

          {/* ── 1. Public Health ──────────────────────────────────────────── */}
          <Section num={1} eyebrow="Public Health">
            <PaintHeadline>
              {lifeGap != null && lifeGap >= 3
                ? <>Residents here live <span style={{ color: C.brick }}>{lifeGap.toFixed(0)} years less</span> than the average Cincinnatian.</>
                : lifeGap != null && lifeGap <= -1
                ? <>Residents here live <span style={{ color: C.hill }}>{Math.abs(lifeGap).toFixed(0)} years longer</span> than the city average.</>
                : <>Health outcomes in this neighborhood track close to the city average — but the details matter.</>
              }
            </PaintHeadline>
            <Lede>
              {lifeYrs != null
                ? <>Average life expectancy of <Chip tone={lifeGap != null && lifeGap >= 5 ? 'warn' : 'default'}>{lifeYrs} years</Chip> at birth, against a citywide <Chip>{CITY_LIFE_EXP} years</Chip>. Chronic disease rates — asthma, diabetes, high blood pressure — are the proximate cause. Income, housing, and environmental exposure are the upstream ones.</>
                : <>Scroll below for CDC PLACES chronic disease rates and senior health indicators — the data that tells you what a neighborhood's healthcare burden actually looks like.</>
              }
            </Lede>
            <div className="mt-8 space-y-6">
              <LifeExpectancySection neighborhood={selectedNeighborhood} />
              <HealthOutcomesSection neighborhood={selectedNeighborhood} />
              <SeniorHealthSection neighborhood={selectedNeighborhood} />
            </div>
          </Section>

          {/* ── 2. Income & Housing ──────────────────────────────────────── */}
          <Section num={2} eyebrow="Income & Housing">
            <PaintHeadline>
              {incomeRatio != null && incomeRatio < 0.6
                ? <><span style={{ color: C.river }}>Well below the city's median income</span> — and rent that still takes more than a third.</>
                : incomeRatio != null && incomeRatio > 1.3
                ? <>Above the city median, with <span style={{ color: C.hill }}>lower rent burden</span> than most Cincinnati neighborhoods.</>
                : <>Income close to the city median, but rent burden is where the real picture shows.</>
              }
            </PaintHeadline>
            <Lede>
              {income != null
                ? <>Median household income of <Chip>${(income / 1000).toFixed(0)}k</Chip>{' '}
                    {rentBurden != null && <>, with <Chip tone={rentBurden > 40 ? 'warn' : rentBurden > 30 ? 'default' : 'good'}>{rentBurden.toFixed(0)}%</Chip> of renters cost-burdened — paying more than 30% of income on rent.</>}
                    {' '}Cost-burden is the polite phrase for the line at which a missed shift or a copay becomes structurally consequential.</>
                : <>Census income, rent, and affordability data for this neighborhood.</>
              }
            </Lede>
            <div className="mt-8 space-y-6">
              {/* Income & Housing card */}
              <div className="page-paper rounded-md p-6">
                <div className="smallcaps mb-4" style={{ color: C.muted }}>ACS 2022 estimates</div>
                {censusLoading ? (
                  <div className="text-[13px]" style={{ color: C.muted }}>Loading…</div>
                ) : (
                  <div className="grid grid-cols-3 gap-5">
                    <div>
                      <div className="smallcaps mb-1.5" style={{ color: C.muted }}>Median income</div>
                      <div className="serif tnum font-medium" style={{ fontSize: 28, color: C.ink }}>
                        {censusData?.medianHouseholdIncome != null
                          ? `$${(censusData.medianHouseholdIncome / 1000).toFixed(0)}k`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="smallcaps mb-1.5" style={{ color: C.muted }}>Median rent</div>
                      <div className="serif tnum font-medium" style={{ fontSize: 28, color: C.ink }}>
                        {censusData?.medianGrossRent != null
                          ? `$${censusData.medianGrossRent}/mo`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="smallcaps mb-1.5" style={{ color: C.muted }}>Rent-burdened</div>
                      <div
                        className="serif tnum font-medium"
                        style={{ fontSize: 28, color: rentBurden && rentBurden > 40 ? C.brick : C.ink }}
                      >
                        {censusData?.rentBurdenRate != null
                          ? `${censusData.rentBurdenRate.toFixed(0)}%`
                          : '—'}
                      </div>
                      <div className="text-[11px] mt-1" style={{ color: C.muted }}>pay &gt;30% on rent</div>
                    </div>
                  </div>
                )}
              </div>
              <UnifiedEquitySection neighborhood={selectedNeighborhood} />
              <ExpandedDemographicsSection neighborhood={selectedNeighborhood} />
              <HousingInventorySection neighborhood={selectedNeighborhood} />
            </div>
          </Section>

          {/* ── 3. Public Safety ─────────────────────────────────────────── */}
          <Section num={3} eyebrow="Public Safety">
            <PaintHeadline>
              Crime patterns here follow the city's rhythm — a midsummer rise, a winter drop — but the rate per resident is what counts.
            </PaintHeadline>
            <Lede>
              Incident data below comes from CPD's STARS reporting system. Use it to understand patterns and timing, not just raw totals — the population denominator matters, and Avondale's density means the per-capita rate can look different than the headline count.
            </Lede>
            <div className="mt-8">
              <PublicSafetySection nbhSoQL={nbhSoQL} startDate={startDate} endDate={endDate} />
            </div>
          </Section>

          {/* ── 4. City Services ─────────────────────────────────────────── */}
          <Section num={4} eyebrow="City Services (311)">
            <PaintHeadline>
              {topRequests.length > 0
                ? <>The top 311 call is <span style={{ color: C.river }}>{topRequests[0].label.toLowerCase()}</span> — and how fast the city responds is the more telling number.</>
                : <>311 requests reveal both what's breaking and how long residents wait for a response.</>
              }
            </PaintHeadline>
            <Lede>
              Response time and closure rate matter as much as volume. A flood of open requests in a given category is a signal about service equity, not just demand.
            </Lede>
            <div className="mt-8">
              <CityServicesSection nbhSoQL={nbhSoQL} startDate={startDate} endDate={endDate} />
            </div>
          </Section>

          {/* ── 5. Transportation ────────────────────────────────────────── */}
          <Section num={5} eyebrow="Transportation">
            <PaintHeadline>
              Transit access here is about stops on the map, but the real question is whether routes run when people need to get to work.
            </PaintHeadline>
            <Lede>
              SORTA bus stop density and income are shown together below — the neighborhoods with the fewest stops are often those with the fewest cars.
            </Lede>
            <div className="mt-8">
              <TransitEquitySection neighborhood={selectedNeighborhood} />
            </div>
          </Section>

          {/* ── 6. Development ───────────────────────────────────────────── */}
          <Section num={6} eyebrow="Development & Land Use">
            <PaintHeadline>
              Building permits track investment — what's being built, where, and by whom.
            </PaintHeadline>
            <Lede>
              Permit volume alone doesn't distinguish community-serving development from displacement-driving investment. Look at the permit type and the pace of change together.
            </Lede>
            <div className="mt-8">
              <DevelopmentSection nbhSoQL={nbhSoQL} neighborhood={selectedNeighborhood} />
            </div>
          </Section>

          {/* ── 7. Food Safety ───────────────────────────────────────────── */}
          <Section num={7} eyebrow="Food Safety">
            <PaintHeadline>
              {uniqueFacilities.length > 0
                ? <><span style={{ color: C.river }}>{uniqueFacilities.length} facilities</span> inspected in the last year — {activeViolations.size > 0 ? `${activeViolations.size} with active violations.` : 'none with active violations.'}</>
                : <>Health inspection results for licensed food facilities in this neighborhood.</>
              }
            </PaintHeadline>
            <Lede>
              Each row below reflects the most recent inspection within the selected date range. Violations flagged as "critical" can indicate risk to public health; non-critical violations are typically documentation or facility issues.
            </Lede>
            <div className="mt-8">
              <DataCard
                title={t('neighborhood.foodSafety', 'Food Safety')}
                loading={foodSafety.loading}
                error={foodSafety.error}
                empty={uniqueFacilities.length === 0}
                className="print-page"
              >
                {uniqueFacilities.length > 0 && (
                  <div>
                    {activeViolations.size > 0 && (
                      <div
                        className="rounded-md px-4 py-3 mb-4 text-[13px]"
                        style={{ background: C.brickLight, color: '#7c2e16' }}
                      >
                        <strong>{activeViolations.size}</strong> facilit{activeViolations.size === 1 ? 'y' : 'ies'} with active violations in this period.
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                      {uniqueFacilities.slice(0, 20).map((facility: any, idx: number) => {
                        const status = facility.action_status || '';
                        const hasViolation = !status.toLowerCase().includes('no violation') &&
                          (status.toLowerCase().includes('violation') || status.toLowerCase().includes('fail') || status.toLowerCase().includes('critical'));
                        return (
                          <div key={idx} className="border-b pb-1.5" style={{ borderColor: C.rule }}>
                            <div className="text-[13px] font-medium truncate" style={{ color: C.ink }}>
                              {facility.business_name || facility.facility_name || facility.name}
                            </div>
                            <div className="text-[11px] mt-0.5" style={{ color: hasViolation ? C.brick : C.muted }}>
                              {hasViolation ? '⚠ ' : ''}{status.slice(0, 50)}{status.length > 50 ? '…' : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {uniqueFacilities.length === 0 && !foodSafety.loading && (
                  <EmptyState message={t('neighborhood.noFoodSafety', 'No facilities found in this date range')} />
                )}
                <DataAttribution source="Food Safety" uid="rg6p-b3h3" />
              </DataCard>
            </div>
          </Section>

          {/* ── 8. Community & Civic ─────────────────────────────────────── */}
          <Section num={8} eyebrow="Community & Civic">
            <PaintHeadline>
              The neighborhood council and recreation center are the civic infrastructure most residents actually touch.
            </PaintHeadline>
            <Lede>
              Community councils are the formal voice of neighborhoods at City Hall — but their meeting frequency and accessibility vary widely. Recreation centers serve as de-facto community hubs, especially for youth and seniors.
            </Lede>
            <div className="mt-8 space-y-6">
              <CommunityCouncilSection neighborhood={selectedNeighborhood} />
              <RecreationCentersSection neighborhood={selectedNeighborhood} />
            </div>
          </Section>

          {/* ── 9. Organizations ─────────────────────────────────────────── */}
          <Section num={9} eyebrow="Resources & Organizations">
            <PaintHeadline>
              These organizations work on the conditions the data above describes.
            </PaintHeadline>
            <Lede>
              Direct-service organizations address immediate needs; organizing groups build the power to change the upstream conditions that create those needs.
            </Lede>
            <div className="mt-8 page-paper rounded-md p-6">
              <CivicOrgsPanel
                compact
                intro={`Organizations working on the issues surfaced in ${selectedNeighborhood}'s data.`}
              />
            </div>
          </Section>

          <p className="serif italic text-[12px] pt-6 mt-8" style={{ color: C.muted, borderTop: `1px solid ${C.rule}` }}>
            Sources: City of Cincinnati Open Data Portal (data.cincinnati-oh.gov) — 311 Service Requests, Cincinnati Police crime incidents, property conditions; U.S. Census Bureau American Community Survey 5-year estimates; Hamilton County Auditor parcel data; SORTA/Metro transit GTFS feeds; Cincinnati Health Department; Ohio Department of Health life expectancy estimates. Data currency varies by dataset; see individual section notes.
          </p>

        </article>
      </div>
    </div>
  );
}
