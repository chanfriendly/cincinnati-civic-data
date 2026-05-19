import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { callClaude } from '../../utils/api';
import type { NeighborhoodScore, Dimension } from '../../types';
import { C } from '../../components/ui/DesignAtoms';

interface TopNeighborhoodsProps {
  scores: NeighborhoodScore[];
  dimensions: Dimension[];
  onSelect: (name: string) => void;
  selectedNeighborhood: string | null;
  anyDimensionEnabled: boolean;
  language: 'en' | 'es';
}

export default function TopNeighborhoods({
  scores,
  dimensions,
  onSelect,
  selectedNeighborhood,
  anyDimensionEnabled,
  language,
}: TopNeighborhoodsProps) {
  const { t } = useTranslation();
  const [descriptions, setDescriptions] = useState<Map<string, string>>(new Map());
  const [loadingDescriptions, setLoadingDescriptions] = useState<Set<string>>(new Set());
  // Track which neighborhoods have already been fetched to avoid re-fetching on every render.
  // Using a ref prevents this from being part of the effect's dependency array.
  const fetchedRef = useRef<Set<string>>(new Set());

  // Memoize so the reference is stable across internal re-renders (e.g. when
  // setLoadingDescriptions fires). Without this, slice() creates a new array
  // every render → topFive reference changes → useEffect re-runs → infinite loop.
  const topFive = useMemo(() => scores.slice(0, 5), [scores]);

  // Generate AI descriptions for top neighborhoods.
  // NOTE: descriptions is NOT in the dep array — adding it caused an infinite loop
  // because setDescriptions() would re-trigger the effect on every call.
  useEffect(() => {
    if (!anyDimensionEnabled || topFive.length === 0) {
      setDescriptions(new Map());
      fetchedRef.current.clear();
      return;
    }

    const fetchDescriptions = async () => {
      const enabledDims = dimensions.filter((d) => d.enabled && d.available);

      for (const score of topFive) {
        // Skip if already fetched (use ref, not state, to avoid re-renders)
        if (fetchedRef.current.has(score.name)) continue;
        fetchedRef.current.add(score.name);

        setLoadingDescriptions((prev) => new Set(prev).add(score.name));

        try {
          const metricsText = enabledDims
            .map((dim) => {
              const val = score.dimensionScores[dim.id];
              const raw = score.rawMetrics;
              let rawStr = '';
              if (dim.id === 'affordability' && raw.rentBurdenRate !== undefined)
                rawStr = ` (rent burden: ${raw.rentBurdenRate.toFixed(1)}% of renters pay >30% of income on rent)`;
              else if (dim.id === 'income' && raw.medianHouseholdIncome)
                rawStr = ` (median income: $${raw.medianHouseholdIncome.toLocaleString()})`;
              else if (dim.id === 'safety' && raw.crimeRatePer1000)
                rawStr = ` (${raw.crimeRatePer1000.toFixed(1)} incidents per 1,000 residents)`;
              else if (dim.id === 'transit' && (raw.stopCount ?? raw.uniqueRouteCount) !== undefined)
                rawStr = ` (${raw.stopCount ?? raw.uniqueRouteCount} bus stops within 0.4 miles)`;
              else if (dim.id === 'investment' && raw.permitYoYChange !== undefined)
                rawStr = ` (${raw.permitYoYChange.toFixed(1)}% year-over-year permit change)`;
              else if (dim.id === 'blight' && raw.plapPerSqMile !== undefined)
                rawStr = ` (${raw.plapPerSqMile.toFixed(1)} PLAP violations per sq mi)`;
              else if (dim.id === 'parks' && raw.parkAcresPer1000 !== undefined)
                rawStr = ` (${raw.parkAcresPer1000.toFixed(1)} park acres per 1,000 residents within 0.75 mi)`;
              else if (dim.id === 'flood' && raw.inFloodZone !== undefined)
                rawStr = ` (${raw.inFloodZone ? 'centroid IS in FEMA Special Flood Hazard Area' : 'centroid is NOT in a FEMA flood zone'})`;
              else if (dim.id === 'food' && raw.foodDesertPct !== undefined)
                rawStr = ` (${raw.foodDesertPct.toFixed(1)}% of population in food desert tract)`;
              return `${t(dim.labelKey)}: score ${val ?? 'N/A'}/100${rawStr}`;
            })
            .join('\n');

          const userPrompt =
            language === 'es'
              ? `Proporciona una descripción de una sola oración (máximo 15 palabras) del vecindario ${score.name} en Cincinnati basándose en estas métricas:\n${metricsText}\n\nResponde solo con la oración.`
              : `Provide a single sentence (max 15 words) description of the ${score.name} neighborhood in Cincinnati based on these metrics:\n${metricsText}\n\nRespond with just the sentence.`;

          const desc = await callClaude(
            'You are a concise civic data assistant for Cincinnati neighborhoods. Scores are 0–100 where 100 is always the best outcome. Raw data in parentheses is the actual measurement — use that to describe the neighborhood, not the score number.',
            userPrompt,
            language
          );
          setDescriptions((prev) => new Map(prev).set(score.name, desc.slice(0, 200)));
        } catch (error) {
          console.error('AI description error:', error);
          setDescriptions((prev) => new Map(prev).set(score.name, ''));
        }

        setLoadingDescriptions((prev) => {
          const next = new Set(prev);
          next.delete(score.name);
          return next;
        });
      }
    };

    fetchDescriptions();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topFive, dimensions, anyDimensionEnabled, language]);

  if (!anyDimensionEnabled) {
    return (
      <div className="rounded-md shadow-md p-6">
        <h3 className="text-lg font-bold mb-4" style={{ color: C.riverDeep }}>
          {t('explorer.topNeighborhoods.title', 'Top Neighborhoods')}
        </h3>
        <p className="text-sm" style={{ color: C.muted }}>
          {t('explorer.topNeighborhoods.enableDimensions', 'Enable at least one dimension to see results')}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md shadow-md p-6">
      <h3 className="text-lg font-bold mb-4" style={{ color: C.riverDeep }}>
        {t('explorer.topNeighborhoods.title', 'Top Neighborhoods')}
      </h3>

      <div className="space-y-3">
        {topFive.map((score, idx) => (
          <button
            key={score.name}
            onClick={() => onSelect(score.name)}
            className="w-full text-left p-3 rounded-md border-2 transition"
            style={
              selectedNeighborhood === score.name
                ? { borderColor: C.ochre, background: C.limestone }
                : { borderColor: C.rule, background: C.paper }
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="font-semibold" style={{ color: C.riverDeep }}>
                  {idx + 1}. {score.name}
                </div>
                <div className="w-full rounded-full h-2 mt-2" style={{ background: C.rule }}>
                  <div
                    className="rounded-full h-2 transition"
                    style={{ width: `${score.compositeScore}%`, background: C.riverDeep }}
                  />
                </div>
                {descriptions.has(score.name) && descriptions.get(score.name) && (
                  <p className="text-xs mt-1" style={{ color: C.muted }}>
                    {descriptions.get(score.name)}
                  </p>
                )}
                {loadingDescriptions.has(score.name) && (
                  <p className="text-xs italic mt-1" style={{ color: C.muted }}>Loading...</p>
                )}
              </div>
              <div className="text-right">
                <span className="text-lg font-bold" style={{ color: C.riverDeep }}>
                  {score.compositeScore}
                </span>
                <span className="text-xs" style={{ color: C.muted }}>/100</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
