import { useTranslation } from 'react-i18next';
import type { NeighborhoodScore, Dimension } from '../../types';

interface DetailDrawerProps {
  score: NeighborhoodScore | null;
  dimensions: Dimension[];
  onClose: () => void;
}

export default function DetailDrawer({
  score,
  dimensions,
  onClose,
}: DetailDrawerProps) {
  const { t } = useTranslation();

  if (!score) {
    return null;
  }

  const enabledDims = dimensions.filter((d) => d.enabled && d.available);

  const formatValue = (value: number | undefined, unit: string): string => {
    if (value === undefined) return 'N/A';
    if (unit === 'percent') return `${value.toFixed(1)}%`;
    if (unit === 'money') return `$${value.toLocaleString()}`;
    if (unit === 'rate') return `${value.toFixed(2)} per 1000`;
    if (unit === 'count') return value.toFixed(0);
    return value.toFixed(1);
  };

  const getSourceAttribution = (dimId: string): string => {
    switch (dimId) {
      case 'affordability':
        return 'Census ACS 5-Year 2022';
      case 'income':
        return 'Census ACS 5-Year 2022';
      case 'safety':
        return 'PDI Crime Incidents + STARS';
      case 'transit':
        return 'SORTA GTFS Data';
      case 'investment':
        return 'Building Permits (Cincinnati)';
      case 'blight':
        return 'Property Maintenance Audit Program';
      case 'parks':
        return 'CAGIS Parks & Greenspace';
      case 'flood':
        return 'FEMA National Flood Hazard Layer';
      case 'food':
        return 'USDA Food Access Research Atlas 2019';
      case 'schools':
        return 'Cincinnati Public Schools';
      default:
        return 'Local Data';
    }
  };

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-lg shadow-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-civic-blue">{score.name}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Composite Score */}
          <div className="bg-gradient-to-r from-civic-blue to-civic-blue-light p-6 rounded-lg text-white">
            <p className="text-sm opacity-90 mb-2">
              {t('explorer.drawer.compositeScore', 'Composite Score')}
            </p>
            <div className="text-5xl font-bold">{score.compositeScore}</div>
            <p className="text-xs opacity-75 mt-2">
              {t('explorer.drawer.outOf', 'out of 100')}
            </p>
          </div>

          {/* Dimension Scores */}
          {enabledDims.length > 0 ? (
            <div>
              <h3 className="text-lg font-bold text-civic-blue mb-4">
                {t('explorer.drawer.dimensionBreakdown', 'Dimension Breakdown')}
              </h3>
              <div className="space-y-4">
                {enabledDims.map((dim) => {
                  const dimScore = score.dimensionScores[dim.id];
                  let rawValue: string;
                  let unit: string;

                  if (dim.id === 'affordability') {
                    rawValue = formatValue(score.rawMetrics.rentBurdenRate, 'percent');
                    unit = 'Rent Burden Rate';
                  } else if (dim.id === 'income') {
                    rawValue = formatValue(score.rawMetrics.medianHouseholdIncome, 'money');
                    unit = 'Median Household Income';
                  } else if (dim.id === 'safety') {
                    rawValue = formatValue(score.rawMetrics.crimeRatePer1000, 'rate');
                    unit = 'Crime Rate per 1000 residents';
                  } else if (dim.id === 'transit') {
                    rawValue = formatValue(score.rawMetrics.stopCount ?? score.rawMetrics.uniqueRouteCount, 'count');
                    unit = 'Bus Stops within 0.4 mi';
                  } else if (dim.id === 'investment') {
                    rawValue = formatValue(score.rawMetrics.permitYoYChange, 'percent');
                    unit = 'Permits YoY Change';
                  } else if (dim.id === 'blight') {
                    rawValue = formatValue(score.rawMetrics.plapPerSqMile, 'count');
                    unit = 'PLAP Issues per Sq Mi';
                  } else if (dim.id === 'parks') {
                    rawValue = score.rawMetrics.parkAcresPer1000 !== undefined
                      ? score.rawMetrics.parkAcresPer1000.toFixed(2)
                      : 'N/A';
                    unit = 'Park Acres per 1,000 Residents';
                  } else if (dim.id === 'flood') {
                    rawValue = score.rawMetrics.inFloodZone !== undefined
                      ? (score.rawMetrics.inFloodZone ? 'In FEMA flood zone' : 'Not in flood zone')
                      : 'N/A';
                    unit = '';
                  } else if (dim.id === 'food') {
                    rawValue = formatValue(score.rawMetrics.foodDesertPct, 'percent');
                    unit = 'Population in Food Desert Tract';
                  } else {
                    rawValue = 'N/A';
                    unit = '';
                  }

                  return (
                    <div key={dim.id} className="border-l-4 border-civic-blue pl-4">
                      <div className="flex justify-between mb-2">
                        <h4 className="font-semibold text-civic-gray-dark">
                          {t(dim.labelKey)}
                        </h4>
                        {dimScore !== null ? (
                          <span className="text-xl font-bold text-civic-blue">
                            {dimScore}
                          </span>
                        ) : (
                          <span className="text-sm text-orange-600 font-semibold">
                            {t('explorer.drawer.insufficientData', 'Insufficient Data')}
                          </span>
                        )}
                      </div>

                      {dimScore !== null && (
                        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                          <div
                            className="bg-civic-blue rounded-full h-2"
                            style={{ width: `${dimScore}%` }}
                          />
                        </div>
                      )}

                      <p className="text-xs text-gray-600">
                        <span className="font-mono">{rawValue}</span>
                        {unit && <span className="ml-1">{unit}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {t('explorer.drawer.source', 'Source')}: {getSourceAttribution(dim.id)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-gray-600 text-sm">
              {t('explorer.drawer.noDimensions', 'No dimensions enabled')}
            </p>
          )}

          {/* Census Note */}
          {(score.rawMetrics.rentBurdenRate ||
            score.rawMetrics.medianHouseholdIncome ||
            score.rawMetrics.medianGrossRent) && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-xs text-blue-900">
                <strong>{t('explorer.drawer.censusNote', 'Census Data Note')}:</strong>{' '}
                {t(
                  'explorer.drawer.censusAlignmentNote',
                  'Census tract data is aligned to neighborhoods by proximity. Boundaries may not align perfectly.'
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
