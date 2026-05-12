import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSODA } from '../../hooks/useSODA';
import { formatCurrency, fetchSODA, fetchNeighborhoodCensusStats, stripNeighborhoodName } from '../../utils/api';
import type { NeighborhoodCensusStats } from '../../utils/api';
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
import {
  DataCard,
  CivicOrgsPanel,
  EmptyState,
  DataAttribution,
} from '../../components/ui';

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
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  // Dynamic neighborhood list — filtered to only show neighborhoods that have
  // at least one record in the current STARS crime dataset (7aqy-xrv9).
  // Falls back to the full static list if the fetch fails.
  const [availableNeighborhoods, setAvailableNeighborhoods] = useState<string[]>(NEIGHBORHOODS);
  useEffect(() => {
    fetchSODA<{ cpd_neighborhood: string }>('7aqy-xrv9', {
      $select: 'cpd_neighborhood',
      $group: 'cpd_neighborhood',
      $limit: 100,
    }).then(({ data: rows }) => {
      if (!rows || rows.length === 0) return;
      const activeKeys = new Set(rows.map((r: { cpd_neighborhood: string }) => r.cpd_neighborhood?.toUpperCase().trim()).filter(Boolean));
      const filtered = NEIGHBORHOODS.filter(nb => {
        const key = NEIGHBORHOOD_DATASET_KEY[nb] ?? nb.toUpperCase();
        return activeKeys.has(key);
      });
      if (filtered.length > 0) {
        setAvailableNeighborhoods(filtered);
        // If the current selection was filtered out, reset to the first available.
        setSelectedNeighborhood(prev =>
          filtered.includes(prev) ? prev : filtered[0]
        );
      }
    }).catch(() => { /* silently keep static list on error */ });
  // Only run once on mount — we don't re-fetch when the date range changes
  // because the neighborhood list should reflect all-time presence, not just
  // the selected window.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resolve the exact dataset key (UPPER CASE) for the selected neighborhood.
  // Most names map cleanly via .toUpperCase(), but a few have quirks in the
  // CPD dataset (e.g. BONDHILL, MT. LOOKOUT) that require an explicit lookup.
  const nbhUpper = NEIGHBORHOOD_DATASET_KEY[selectedNeighborhood] ?? selectedNeighborhood.toUpperCase();
  // Escape single quotes for SoQL string literals (e.g. O'Bryonville → O''Bryonville)
  const nbhSoQL = nbhUpper.replace(/'/g, "''");

  // Food safety — neighborhood field is UPPER CASE; date field is action_date.
  // Dataset is per-violation (one row per violation per inspection), so the same
  // business can appear many times. Filter out 'N/A' geocoding failures and
  // apply the selected date range.
  const foodSafety = useSODA('rg6p-b3h3', {
    $where: `neighborhood='${nbhSoQL}' AND neighborhood != 'N/A' AND action_date >= '${startDate}' AND action_date <= '${endDate}'`,
    $limit: 500,
  });

  // Deduplicate by license_no to get one entry per facility for the list display.
  const uniqueFacilities = useMemo(() => {
    const seen = new Set<string>();
    return (foodSafety.data || []).filter((item: any) => {
      const key = item.license_no || item.business_name || String(Math.random());
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [foodSafety.data]);

  // Count unique facilities (by license_no) that have at least one active violation.
  const activeViolations = useMemo(() => {
    const facilitiesWithViolation = new Set<string>();
    (foodSafety.data || []).forEach((item: any) => {
      const status = (item.action_status || '').toLowerCase();
      if (status.includes('no violation')) return;
      if (status.includes('violation') || status.includes('fail') || status.includes('critical')) {
        facilitiesWithViolation.add(item.license_no || item.business_name || '');
      }
    });
    return facilitiesWithViolation;
  }, [foodSafety.data]);

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

  // Compute rankings across all neighborhoods using already-loaded census data.
  // Sorted descending for income (higher = better rank), ascending for rent burden (lower = better).
  const rankings = useMemo(() => {
    if (!censusStats || !censusData) return null;
    const allEntries = [...censusStats.values()];
    const totalNeighborhoods = allEntries.length;

    const incomes = allEntries
      .map(s => s.medianHouseholdIncome)
      .filter((v): v is number => v != null)
      .sort((a, b) => b - a);
    const incomeRank = censusData.medianHouseholdIncome != null
      ? incomes.indexOf(censusData.medianHouseholdIncome) + 1
      : null;

    const burdens = allEntries
      .map(s => s.rentBurdenRate)
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b); // lower burden = better rank
    const burdenRank = censusData.rentBurdenRate != null
      ? burdens.indexOf(censusData.rentBurdenRate) + 1
      : null;

    return { incomeRank, burdenRank, totalNeighborhoods };
  }, [censusStats, censusData]);

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
                {availableNeighborhoods.map((nb) => (
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

      {/* Neighborhood Rankings Snapshot */}
      {rankings && (
        <div className="bg-white rounded-lg shadow-sm p-4 flex flex-col sm:flex-row sm:items-center gap-4 print:hidden">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">How {selectedNeighborhood} ranks</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {rankings.incomeRank != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-[#1A4A6B]">#{rankings.incomeRank}</span>
                  <span className="text-xs text-gray-500">median income of {rankings.totalNeighborhoods}</span>
                </div>
              )}
              {rankings.burdenRank != null && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-bold text-[#1A4A6B]">#{rankings.burdenRank}</span>
                  <span className="text-xs text-gray-500">least rent-burdened of {rankings.totalNeighborhoods}</span>
                </div>
              )}
            </div>
            <p className="text-[10px] text-gray-400 mt-1.5">Based on ACS 2022 · Lower rank = more affordable · Compared to {rankings.totalNeighborhoods} Cincinnati neighborhoods</p>
          </div>
          {onViewMap && (
            <button
              onClick={onViewMap}
              className="shrink-0 px-4 py-2 text-sm font-medium text-[#1A4A6B] border border-[#1A4A6B] rounded-lg hover:bg-blue-50 transition-colors whitespace-nowrap"
            >
              Compare all neighborhoods →
            </button>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Economic Profile</span>
        <div className="flex-1 h-px bg-gray-200" />
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
          url="https://www.census.gov/programs-surveys/acs"
        />
      </DataCard>

      {/* Racial Equity & Mortgage Lending — unified panel with 3 selectable views */}
      {/* Self-contained: transplant to own tab by wrapping in a tab shell */}
      <UnifiedEquitySection neighborhood={selectedNeighborhood} />

      <ExpandedDemographicsSection neighborhood={selectedNeighborhood} />

      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Public Safety</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <PublicSafetySection nbhSoQL={nbhSoQL} startDate={startDate} endDate={endDate} />

      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">City Services</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <CityServicesSection nbhSoQL={nbhSoQL} startDate={startDate} endDate={endDate} />

      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Transportation</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <TransitEquitySection neighborhood={selectedNeighborhood} />

      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Development &amp; Land Use</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <DevelopmentSection nbhSoQL={nbhSoQL} neighborhood={selectedNeighborhood} />

      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Affordable Housing</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <HousingInventorySection neighborhood={selectedNeighborhood} />

      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Public Health</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      {/* Food Safety */}
      <DataCard
        title={t('neighborhood.foodSafety', 'Food Safety')}
        loading={foodSafety.loading}
        error={foodSafety.error}
        empty={uniqueFacilities.length === 0}
        className="print-page"
      >
        <p className="text-xs text-gray-500 italic mb-3">
          {t('neighborhood.foodSafetyDef', 'Health inspection results for restaurants, food trucks, and other licensed food facilities. Each entry reflects the most recent inspection status within the selected date range.')}
        </p>
        {uniqueFacilities.length > 0 ? (
          <div>
            {activeViolations.size > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 p-3 rounded mb-3">
                <div className="text-sm font-semibold text-yellow-900">
                  {activeViolations.size} {t('neighborhood.facilitiesWithViolations', 'Facilities with Active Violations')}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
              {uniqueFacilities.slice(0, 20).map((facility: any, idx: number) => {
                const status = facility.action_status || '';
                const hasViolation = !status.toLowerCase().includes('no violation') &&
                  (status.toLowerCase().includes('violation') || status.toLowerCase().includes('fail') || status.toLowerCase().includes('critical'));
                return (
                  <div key={idx} className="border-b border-gray-100 pb-1.5">
                    <div className="text-xs font-medium text-gray-900 truncate">
                      {facility.business_name || facility.facility_name || facility.name}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${hasViolation ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                      {hasViolation ? '⚠ ' : ''}{status.slice(0, 40)}{status.length > 40 ? '…' : ''}
                      {facility.action_date && (
                        <span className="ml-1 text-gray-300">
                          {new Date(facility.action_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <EmptyState message={t('neighborhood.noFoodSafety', 'No facilities found')} />
        )}
        <DataAttribution
          source={t('neighborhood.attributionFoodSafety', 'Food Safety')}
          uid="rg6p-b3h3"
        />
      </DataCard>

      <LifeExpectancySection neighborhood={selectedNeighborhood} />
      <HealthOutcomesSection neighborhood={selectedNeighborhood} />
      <SeniorHealthSection neighborhood={selectedNeighborhood} />

      {/* ── Community & Civic ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Community &amp; Civic</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <CommunityCouncilSection neighborhood={selectedNeighborhood} />
      <RecreationCentersSection neighborhood={selectedNeighborhood} />

      {/* ── Resources & Organizations ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gray-400">Resources &amp; Organizations</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>

      <DataCard title="Cincinnati Civic Organizations">
        <CivicOrgsPanel
          compact
          intro={`These organizations work on the issues surfaced in ${selectedNeighborhood}'s data. Direct service orgs can help residents immediately — organizing groups build the power to change the conditions that create these problems.`}
        />
      </DataCard>

    </div>
  );
}
