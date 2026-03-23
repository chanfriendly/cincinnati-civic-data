import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSODA } from '../../hooks/useSODA';
import { formatCurrency, fetchNeighborhoodCensusStats, stripNeighborhoodName } from '../../utils/api';
import type { NeighborhoodCensusStats } from '../../utils/api';
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
} from 'recharts';

// Neighborhoods sourced from CPD crime dataset (k59e-2pvf) — only Cincinnati
// proper neighborhoods with actual data are included. Separate municipalities
// (Cheviot, Madeira, Norwood, etc.) have been removed.
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

// Some display names don't produce the exact UPPER CASE value stored in the
// CPD datasets when calling .toUpperCase(). This lookup provides the correct
// dataset key for those neighborhoods.
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

// Maps Tab 2 CPD neighborhood names to the stripped SNA keys used by the
// census utility. Only needed where names differ across datasets.
const CENSUS_KEY_OVERRIDE: Record<string, string> = {
  'CBD / Riverfront':  'downtown',
  'Clifton Heights':   'cuf',
  'Fairview':          'cuf',
  'Fay Apartments':    'wesend',           // closest SNA match — limited data
  "O'Bryonville":      'hydeparkobryonville', // OBryonville is within Hyde Park SNA
  'Queensgate':        'lowerpricehillqueensgate',
  'Sedamsville':       'riversidesedamsville',
  'English Woods':     'englishwoodsnorthfairmount',
  'Lower Price Hill':  'lowerpricehillqueensgate',
  'Millvale':          'millvale',
};

export default function NeighborhoodProfiles() {
  const { t } = useTranslation();
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>(NEIGHBORHOODS[0]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Resolve the exact dataset key (UPPER CASE) for the selected neighborhood.
  // Most names map cleanly via .toUpperCase(), but a few have quirks in the
  // CPD dataset (e.g. BONDHILL, MT. LOOKOUT) that require an explicit lookup.
  const nbhUpper = NEIGHBORHOOD_DATASET_KEY[selectedNeighborhood] ?? selectedNeighborhood.toUpperCase();
  // Escape single quotes for SoQL string literals (e.g. O'Bryonville → O''Bryonville)
  const nbhSoQL = nbhUpper.replace(/'/g, "''");

  // Crime data (combined old + new)
  // cpd_neighborhood values are UPPER CASE in both datasets (e.g. 'AVONDALE')
  // k59e-2pvf: neighborhood field is cpd_neighborhood; date is date_reported; offense is offense
  // 7aqy-xrv9: neighborhood field is cpd_neighborhood; date is datereported; offense is stars_category
  const crimeOld = useSODA('k59e-2pvf', {
    $where: `cpd_neighborhood='${nbhSoQL}' AND date_reported >= '${startDate}' AND date_reported <= '${endDate}'`,
    $limit: 1000,
  });

  const crimeNew = useSODA('7aqy-xrv9', {
    $where: `cpd_neighborhood='${nbhSoQL}' AND datereported >= '${startDate}' AND datereported <= '${endDate}'`,
    $limit: 1000,
  });

  const crimeByType = useMemo(() => {
    const combined = [...(crimeOld.data || []), ...(crimeNew.data || [])];
    const counts: { [key: string]: number } = {};
    combined.forEach((record: any) => {
      // Old dataset uses `offense`; new STARS dataset uses `stars_category`
      const type = record.stars_category || record.offense || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [crimeOld.data, crimeNew.data]);

  // Building permits — UID uhjb-xac9; neighborhood field is UPPER CASE.
  // Fetch up to 500 records for the breakdown chart, plus a separate count
  // query for the true total (large neighborhoods exceed the 500 record limit).
  // Excludes trade/service permits so only structural building permits are shown.
  //
  // SoQL two-branch filter: when permittypemapped IS NOT NULL check it;
  // when it IS NULL fall through to permittype (many records have one null).
  // 'hvac' is a literal value in this dataset — must be excluded explicitly.
  const _tradeFilter =
    "lower(permittypemapped) NOT LIKE '%mechanical%' AND " +
    "lower(permittypemapped) NOT LIKE '%plumbing%' AND " +
    "lower(permittypemapped) NOT LIKE '%electrical%' AND " +
    "lower(permittypemapped) NOT LIKE '%hvac%' AND " +
    "lower(permittypemapped) NOT LIKE '%fire suppression%'";
  const _tradeFilterType =
    "lower(permittype) NOT LIKE '%mechanical%' AND " +
    "lower(permittype) NOT LIKE '%plumbing%' AND " +
    "lower(permittype) NOT LIKE '%electrical%' AND " +
    "lower(permittype) NOT LIKE '%hvac%' AND " +
    "lower(permittype) NOT LIKE '%fire suppression%'";
  const PERMIT_TYPE_FILTER =
    ` AND ((permittypemapped IS NOT NULL AND ${_tradeFilter})` +
    ` OR (permittypemapped IS NULL AND (permittype IS NULL OR (${_tradeFilterType}))))`;
  const permitsWhere = `neighborhood='${nbhSoQL}' AND neighborhood != 'N/A'${PERMIT_TYPE_FILTER}`;

  const permits = useSODA('uhjb-xac9', {
    $where: permitsWhere,
    $limit: 500,
  });
  const permitsCount = useSODA('uhjb-xac9', {
    $where: permitsWhere,
    $select: 'count(*) as total',
  });

  // Client-side safety net — same terms as the SoQL filter above.
  const TRADE_PERMIT_TERMS = ['mechanical', 'plumbing', 'electrical', 'hvac', 'fire suppression', 'boiler', 'elevator'];
  const permitsByType = useMemo(() => {
    const counts: { [key: string]: number } = {};
    (permits.data || []).forEach((permit: any) => {
      const typeStr = ((permit.permittypemapped || permit.permittype) ?? '').toLowerCase();
      if (TRADE_PERMIT_TERMS.some(term => typeStr.includes(term))) return;
      const type = permit.permittypemapped || permit.permittype || 'Other';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permits.data]);

  const demolitionCount = permitsByType.find((p) => p.type.toLowerCase().includes('demolition'))
    ?.count || 0;

  // Food safety — neighborhood field is UPPER CASE
  const foodSafety = useSODA('rg6p-b3h3', {
    $where: `neighborhood='${nbhSoQL}'`,
    $limit: 500,
  });

  const activeViolations = useMemo(() => {
    // action_status values: "Approved - No Violations", "Approved - Violations Corrected",
    // "Approved - Violations", "Failed", "Critical Violation", etc.
    // Must explicitly exclude "No Violations" before checking for "violation"
    return (foodSafety.data || []).filter((item: any) => {
      const status = (item.action_status || item.inspection_status || item.status || '').toLowerCase();
      if (status.includes('no violation')) return false;
      return status.includes('violation') || status.includes('fail') || status.includes('critical');
    });
  }, [foodSafety.data]);

  // Tax abatements — field is ccd_neigh, Title Case (matches dropdown values)
  const taxAbatements = useSODA('tkp7-yf64', {
    $where: `ccd_neigh='${selectedNeighborhood.replace(/'/g, "''")}'`,
    $limit: 500,
  });

  const abatementTotal = useMemo(() => {
    let total = 0;
    (taxAbatements.data || []).forEach((item: any) => {
      total += parseFloat(item.abatement_value || item.incentive_amount || 0);
    });
    return total;
  }, [taxAbatements.data]);

  // PLAP/Blight — neighborhood field is UPPER CASE
  const blight = useSODA('pk9w-99n6', {
    $where: `neighborhood='${nbhSoQL}'`,
    $limit: 500,
  });

  // Community perceptions — gdf4-fqik is a city-wide resident survey.
  // Each row is a respondent; columns are Likert-scale ratings (1–5).
  // There is no neighborhood field — these are city-wide averages.
  const perceptions = useSODA('gdf4-fqik', {
    $limit: 1000,
  });

  // Key survey categories to display with friendly labels
  const PERCEPTION_METRICS = [
    { key: 'overall_quality_of_life_in', label: 'Overall Quality of Life' },
    { key: 'overall_feeling_of_safety',  label: 'Feeling of Safety' },
    { key: 'police_services',            label: 'Police Services' },
    { key: 'fire_and_ambulance_services',label: 'Fire & Ambulance' },
    { key: 'city_parks_and_recreation',  label: 'Parks & Recreation' },
    { key: 'the_maintenance_of_city',    label: 'City Maintenance' },
    { key: 'overall_quality_of_services',label: 'Quality of City Services' },
    { key: 'overall_image_of_the_city',  label: 'City Image' },
  ];

  const perceptionAverages = useMemo(() => {
    if (!perceptions.data || perceptions.data.length === 0) return [];
    return PERCEPTION_METRICS.map(({ key, label }) => {
      const values = (perceptions.data as any[])
        .map((r: any) => parseFloat(r[key]))
        .filter((v) => !isNaN(v) && v >= 1 && v <= 5);
      const avg = values.length > 0
        ? values.reduce((a: number, b: number) => a + b, 0) / values.length
        : null;
      return { label, avg: avg !== null ? Math.round(avg * 10) / 10 : null };
    }).filter((m) => m.avg !== null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perceptions.data]);

  // Fire & EMS — neighborhood field is UPPER CASE
  const fireEms = useSODA('vnsz-a3wp', {
    $where: `neighborhood='${nbhSoQL}'`,
    $limit: 500,
  });

  const fireEmsByType = useMemo(() => {
    const counts: { [key: string]: number } = {};
    (fireEms.data || []).forEach((incident: any) => {
      const type = incident.incident_type_desc || incident.incident_type || 'Unknown';
      counts[type] = (counts[type] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [fireEms.data]);

  // Per-neighborhood ACS census data — loaded from /data/neighborhood_acs.json
  // via fetchNeighborhoodCensusStats(). Falls back to null values while loading.
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
    const key = CENSUS_KEY_OVERRIDE[selectedNeighborhood] ?? stripNeighborhoodName(selectedNeighborhood);
    return censusStats.get(key) ?? null;
  }, [censusStats, selectedNeighborhood]);

  const crimeLoading = crimeOld.loading || crimeNew.loading;
  const crimeError = crimeOld.error || crimeNew.error;

  return (
    <div className="space-y-6">
      {/* Print Header - hidden by default, shown on print */}
      <div className="no-print">
        {/* Controls */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('neighborhood.selectNeighborhood', 'Select Neighborhood')}
              </label>
              <select
                value={selectedNeighborhood}
                onChange={(e) => setSelectedNeighborhood(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
              >
                {NEIGHBORHOODS.map((nb) => (
                  <option key={nb} value={nb}>
                    {nb}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('neighborhood.startDate', 'Start Date')}
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('neighborhood.endDate', 'End Date')}
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1A4A6B] focus:border-transparent"
              />
            </div>
          </div>

          <button
            onClick={() => window.print()}
            className="px-6 py-2 bg-[#1A4A6B] text-white rounded-lg hover:bg-[#143850] print:hidden"
          >
            {t('neighborhood.printPDF', 'Print / Save as PDF')}
          </button>
        </div>
      </div>

      {/* Print Header */}
      <div className="hidden print:block bg-white p-8 text-center border-b-4 border-[#1A4A6B]">
        <div className="text-4xl font-bold text-[#1A4A6B] mb-2">
          Cincinnati Neighborhood Profile
        </div>
        <div className="text-2xl font-semibold text-gray-900 mb-4">
          {selectedNeighborhood}
        </div>
        <div className="text-sm text-gray-600">
          Generated {new Date().toLocaleDateString()}
        </div>
      </div>

      {/* Income & Housing — per-neighborhood ACS data */}
      <DataCard
        title={t('neighborhood.censusData', 'Income & Housing')}
        loading={censusLoading}
        error={null}
        empty={false}
        className="print-page"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded">
            <div className="text-xs text-gray-600 uppercase tracking-wide">
              {t('neighborhood.medianHouseholdIncome', 'Median Household Income')}
            </div>
            <div className="text-2xl font-bold text-[#1A4A6B] mt-2">
              {censusData?.medianHouseholdIncome != null
                ? formatCurrency(censusData.medianHouseholdIncome)
                : '—'}
            </div>
          </div>

          <div className="bg-amber-50 p-4 rounded">
            <div className="text-xs text-gray-600 uppercase tracking-wide">
              {t('neighborhood.medianGrossRent', 'Median Gross Rent')}
            </div>
            <div className="text-2xl font-bold text-[#C8861A] mt-2">
              {censusData?.medianGrossRent != null
                ? `${formatCurrency(censusData.medianGrossRent)}/mo`
                : '—'}
            </div>
          </div>

          <div className="bg-green-50 p-4 rounded">
            <div className="text-xs text-gray-600 uppercase tracking-wide">
              {t('neighborhood.rentBurdenRate', 'Rent Burden Rate')}
            </div>
            <div className="text-2xl font-bold text-green-700 mt-2">
              {censusData?.rentBurdenRate != null
                ? `${censusData.rentBurdenRate.toFixed(0)}%`
                : '—'}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {t('neighborhood.rentBurdenNote', '% of renters paying >30% of income on rent')}
            </div>
          </div>
        </div>

        {censusData == null && !censusLoading && (
          <div className="mt-3 text-xs text-gray-500 italic">
            {t('neighborhood.censusNoData', 'No ACS data available for this neighborhood.')}
          </div>
        )}

        <div className="mt-4 text-xs text-gray-500 italic border-t pt-4">
          {t(
            'neighborhood.censusNote',
            'ACS 2022 5-Year Estimates — neighborhood averages weighted by Census tract population.'
          )}
        </div>

        <DataAttribution
          source={t('neighborhood.attributionCensus', 'U.S. Census Bureau ACS 2022')}
          uid=""
        />
      </DataCard>

      {/* Crime Section */}
      <DataCard
        title={t('neighborhood.crime', 'Crime & Public Safety')}
        loading={crimeLoading}
        error={crimeError}
        empty={crimeByType.length === 0}
        className="print-page"
      >
        {crimeByType.length > 0 ? (
          <div className="space-y-4">
            <div className="text-2xl font-bold text-[#C8861A]">
              {crimeByType.reduce((sum, item) => sum + item.count, 0)}
            </div>
            <div className="text-sm text-gray-600 mb-4">
              {t('neighborhood.totalIncidents', 'total incidents')} ({startDate} to {endDate})
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={crimeByType.slice(0, 10)} margin={{ bottom: 60, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#1A4A6B" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState message={t('neighborhood.noCrime', 'No crime records found')} />
        )}
        <DataAttribution
          source={t('neighborhood.attributionCrime', 'PDI Crime Incidents + STARS')}
          uid="k59e-2pvf"
        />
      </DataCard>

      {/* Building Permits */}
      <DataCard
        title={t('neighborhood.permits', 'Building Permits')}
        loading={permits.loading}
        error={permits.error}
        empty={!permits.data || permits.data.length === 0}
        className="print-page"
      >
        {permitsByType.length > 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-blue-50 p-3 rounded">
                <div className="text-2xl font-bold text-[#1A4A6B]">
                  {parseInt((permitsCount.data as any)?.[0]?.total || '0', 10).toLocaleString()}
                </div>
                <div className="text-xs text-gray-600">
                  {t('neighborhood.totalPermits', 'Total Permits')}
                </div>
              </div>
              {demolitionCount > 0 && (
                <div className="bg-red-50 p-3 rounded">
                  <div className="text-2xl font-bold text-red-700">
                    {demolitionCount}
                  </div>
                  <div className="text-xs text-gray-600">
                    {t('neighborhood.demolitions', 'Demolitions')}
                  </div>
                </div>
              )}
            </div>

            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={permitsByType.slice(0, 8)} margin={{ bottom: 60, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" angle={-45} textAnchor="end" height={80} tick={{ fontSize: 11 }} tickFormatter={(v: string) => v.length > 22 ? v.slice(0, 20) + '…' : v} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#C8861A" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState message={t('neighborhood.noPermits', 'No permits found')} />
        )}
        <DataAttribution
          source={t('neighborhood.attributionPermits', 'Building Permits')}
          uid="uhjb-xac9"
        />
      </DataCard>

      {/* Food Safety */}
      <DataCard
        title={t('neighborhood.foodSafety', 'Food Safety')}
        loading={foodSafety.loading}
        error={foodSafety.error}
        empty={!foodSafety.data || foodSafety.data.length === 0}
        className="print-page"
      >
        {foodSafety.data && foodSafety.data.length > 0 ? (
          <div className="space-y-3">
            {activeViolations.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded mb-4">
                <div className="text-sm font-semibold text-yellow-900">
                  {activeViolations.length} {t('neighborhood.facilitiesWithViolations', 'Facilities with Active Violations')}
                </div>
              </div>
            )}

            {foodSafety.data.slice(0, 15).map((facility: any, idx: number) => {
              const status = facility.action_status || facility.inspection_status || facility.status || '';
              const hasViolation = !status.toLowerCase().includes('no violation') &&
                (status.toLowerCase().includes('violation') || status.toLowerCase().includes('fail') || status.toLowerCase().includes('critical'));
              return (
                <div key={idx} className="border-b border-gray-200 pb-2 last:border-b-0">
                  <div className="text-sm font-medium text-gray-900">
                    {facility.business_name || facility.facility_name || facility.name}
                  </div>
                  <div className={`text-xs mt-0.5 ${hasViolation ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    {status}
                    {facility.action_date && (
                      <span className="ml-2 text-gray-400">
                        {new Date(facility.action_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState message={t('neighborhood.noFoodSafety', 'No facilities found')} />
        )}
        <DataAttribution
          source={t('neighborhood.attributionFoodSafety', 'Food Safety')}
          uid="rg6p-b3h3"
        />
      </DataCard>

      {/* Tax Abatements */}
      <DataCard
        title={t('neighborhood.taxAbatements', 'Tax Abatements')}
        loading={taxAbatements.loading}
        error={taxAbatements.error}
        empty={!taxAbatements.data || taxAbatements.data.length === 0}
        className="print-page"
      >
        {taxAbatements.data && taxAbatements.data.length > 0 ? (
          <div className="space-y-3">
            <div className="bg-green-50 p-3 rounded mb-4">
              <div className="text-2xl font-bold text-green-700">
                {taxAbatements.data.length}
              </div>
              <div className="text-sm text-gray-600 mb-2">
                {t('neighborhood.activeAbatements', 'Active Abatements')}
              </div>
              <div className="text-lg font-semibold text-green-900">
                {formatCurrency(abatementTotal)}
              </div>
              <div className="text-xs text-gray-600">
                {t('neighborhood.estimatedValue', 'Estimated Total Value')}
              </div>
            </div>
          </div>
        ) : (
          <EmptyState message={t('neighborhood.noAbatements', 'No abatements found')} />
        )}
        <DataAttribution
          source={t('neighborhood.attributionTaxAbatements', 'Tax Abatements')}
          uid="tkp7-yf64"
        />
      </DataCard>

      {/* PLAP / Blight */}
      <DataCard
        title={t('neighborhood.blight', 'Blight & Property Maintenance')}
        loading={blight.loading}
        error={blight.error}
        empty={!blight.data || blight.data.length === 0}
        className="print-page"
      >
        <p className="text-xs text-gray-500 italic mb-3">
          {t('neighborhood.blightDef', '"Blight" refers to properties flagged by Cincinnati\'s Proactive Landlord Accountability Program (PLAP) for code violations — including vacant buildings, overgrown lots, structural issues, or public nuisances.')}
        </p>
        {blight.data && blight.data.length > 0 ? (
          <div className="space-y-2">
            <div className="text-3xl font-bold text-[#C8861A]">
              {blight.data.length}
            </div>
            <div className="text-sm text-gray-600">
              {t('neighborhood.blightRecords', 'active blight records in this neighborhood')}
            </div>
          </div>
        ) : (
          <EmptyState message={t('neighborhood.noBlight', 'No blight records found')} />
        )}
        <DataAttribution
          source={t('neighborhood.attributionBlight', 'PLAP Blight')}
          uid="pk9w-99n6"
        />
      </DataCard>

      {/* Community Perceptions */}
      <DataCard
        title={t('neighborhood.communityPerceptions', 'Community Perceptions — City-Wide Survey')}
        loading={perceptions.loading}
        error={perceptions.error}
        empty={perceptionAverages.length === 0}
        className="print-page"
      >
        {perceptionAverages.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500 italic mb-4">
              City-wide resident survey ratings (scale 1–5). This data is not broken down by neighborhood.
            </p>
            {perceptionAverages.map(({ label, avg }) => (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-700">{label}</span>
                  <span className="font-semibold text-[#1A4A6B]">{avg} / 5</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-civic-blue rounded-full h-2 transition-all"
                    style={{ width: `${((avg ?? 0) / 5) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState message={t('neighborhood.noPerceptions', 'No perception data found')} />
        )}
        <DataAttribution
          source={t('neighborhood.attributionPerceptions', 'Community Perceptions Survey')}
          uid="gdf4-fqik"
        />
      </DataCard>

      {/* Fire & EMS */}
      <DataCard
        title={t('neighborhood.fireEms', 'Fire & EMS Incidents')}
        loading={fireEms.loading}
        error={fireEms.error}
        empty={fireEmsByType.length === 0}
        className="print-page"
      >
        {fireEmsByType.length > 0 ? (
          <div className="space-y-4">
            <div className="text-2xl font-bold text-[#1A4A6B]">
              {fireEms.data?.length || 0}
            </div>
            <div className="text-sm text-gray-600 mb-4">
              {t('neighborhood.totalIncidents', 'total incidents')}
            </div>

            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={fireEmsByType.slice(0, 8)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="type" angle={-45} textAnchor="end" height={80} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#FF5722" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState message={t('neighborhood.noFireEms', 'No incidents found')} />
        )}
        <DataAttribution
          source={t('neighborhood.attributionFireEms', 'Fire & EMS')}
          uid="vnsz-a3wp"
        />
      </DataCard>

    </div>
  );
}
