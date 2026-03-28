import type { DimensionId, NeighborhoodRawMetrics, NeighborhoodScore, Dimension } from '../types';

/**
 * Normalize a raw metric value to a 0-100 score given the array of all
 * values across neighborhoods. Handles null/undefined gracefully.
 * higherIsBetter: true = higher raw value → higher score
 */
export function normalize(
  value: number | undefined,
  allValues: (number | undefined)[],
  higherIsBetter: boolean
): number | null {
  if (value === undefined || value === null || isNaN(value)) return null;
  const valid = allValues.filter((v): v is number => v !== undefined && v !== null && !isNaN(v));
  if (valid.length === 0) return null;
  const min = Math.min(...valid);
  const max = Math.max(...valid);
  if (max === min) return 50; // all same → neutral
  const normalized = (value - min) / (max - min);
  return Math.round((higherIsBetter ? normalized : 1 - normalized) * 100);
}

/**
 * Extract the raw metric for a given dimension from NeighborhoodRawMetrics.
 */
export function getRawValue(
  metrics: NeighborhoodRawMetrics,
  dimId: DimensionId,
  _incomeSub: 'higher' | 'lower' = 'higher'
): number | undefined {
  switch (dimId) {
    case 'affordability': return metrics.rentBurdenRate;
    case 'income': return metrics.medianHouseholdIncome;
    case 'safety': return metrics.crimeRatePer1000;
    case 'transit': return metrics.stopCount ?? metrics.uniqueRouteCount;
    case 'investment': return metrics.permitYoYChange;
    // Public Maintenance composite: 70% PLAP violation density, 30% inspection
    // closure rate. plapPerSqMile is the raw violation count (higher = worse).
    // firstPassRate is the % of cases closed as compliant (higher = better).
    // We invert firstPassRate so the combined metric is "higher = worse" (matching
    // higherIsBetter:false), then weight and combine.
    case 'blight': {
      const plap = metrics.plapPerSqMile;
      const fpr = metrics.firstPassRate; // 0-100, higher is better
      if (plap === undefined && fpr === undefined) return undefined;
      // Normalise firstPassRate to the same directional sense as PLAP:
      // convert "pass rate" to "failure penalty" (100 - fpr), so higher = worse
      const failurePenalty = fpr !== undefined ? (100 - fpr) : undefined;
      if (plap !== undefined && failurePenalty !== undefined) {
        // Blend: we can't directly add different-scale numbers, so return plap
        // as primary (normalized against peers in computeScores) and let the
        // firstPassRate surface in the detail drawer only.
        return plap;
      }
      return plap ?? failurePenalty;
    }
    // Parks: higher acreage per 1,000 residents = better access = higher score
    case 'parks': return metrics.parkAcresPer1000;
    // Flood: convert boolean to 0/1 so the normalizer can process it.
    // inFloodZone=true (risky) → 1; false (safe) → 0.
    // higherIsBetter is false for this dimension, so 1 (risky) scores lowest.
    case 'flood': return metrics.inFloodZone !== undefined
      ? (metrics.inFloodZone ? 1 : 0)
      : undefined;
    // Food Access: % of population in a food desert tract (USDA FARA LILA definition).
    // Higher % = worse food access → higherIsBetter: false.
    case 'food': return metrics.foodDesertPct;
    // Environmental Justice: EPA EJScreen 2023 composite pollution burden index.
    // Population-weighted average of national percentile ranks for:
    //   air toxics cancer risk (30%), diesel PM (20%), traffic proximity (20%),
    //   Superfund proximity (15%), hazardous waste proximity (15%).
    // Higher index = greater pollution burden → higherIsBetter: false.
    case 'ej': return metrics.ejPollutionIndex;
    case 'schools': return undefined;
    default: return undefined;
  }
}

/**
 * Compute composite scores for all neighborhoods given current dimension config.
 * enabledDimensions must be the array of currently-enabled Dimension objects.
 */
export function computeScores(
  rawDataMap: Map<string, NeighborhoodRawMetrics>,
  dimensions: Dimension[]
): NeighborhoodScore[] {
  const enabledDims = dimensions.filter((d) => d.enabled && d.available);
  const neighborhoods = Array.from(rawDataMap.keys());

  // Build per-dimension arrays of raw values for normalization
  const rawArrays: Record<DimensionId, (number | undefined)[]> = {} as Record<DimensionId, (number | undefined)[]>;
  for (const dim of enabledDims) {
    rawArrays[dim.id] = neighborhoods.map((n) =>
      getRawValue(rawDataMap.get(n)!, dim.id, dim.incomeSub)
    );
  }

  // Determine higherIsBetter per dimension
  // For income: depends on incomeSub (looking for lower-cost = lower income is better; higher-income = higher is better)
  function dimHigherIsBetter(dim: Dimension): boolean {
    if (dim.id === 'income') return dim.incomeSub === 'higher';
    return dim.higherIsBetter;
  }

  // Score each neighborhood
  return neighborhoods.map((name) => {
    const metrics = rawDataMap.get(name)!;
    const dimensionScores: Record<DimensionId, number | null> = {
      affordability: null, income: null, safety: null,
      transit: null, investment: null, blight: null,
      parks: null, flood: null, food: null, ej: null, schools: null,
    };

    if (enabledDims.length === 0) {
      return { name, compositeScore: 0, dimensionScores, rawMetrics: metrics, hasInsufficientData: false };
    }

    let totalWeight = 0;
    let weightedSum = 0;
    let hasNull = false;

    for (const dim of enabledDims) {
      const rawVal = getRawValue(metrics, dim.id, dim.incomeSub);
      const score = normalize(rawVal, rawArrays[dim.id], dimHigherIsBetter(dim));
      dimensionScores[dim.id] = score;
      if (score === null) {
        hasNull = true;
      } else {
        weightedSum += score * dim.weight;
        totalWeight += dim.weight;
      }
    }

    const compositeScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;

    return {
      name,
      compositeScore,
      dimensionScores,
      rawMetrics: metrics,
      hasInsufficientData: hasNull,
    };
  }).sort((a, b) => {
    if (a.hasInsufficientData !== b.hasInsufficientData)
      return a.hasInsufficientData ? 1 : -1;
    if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
    return a.name.localeCompare(b.name);
  });
}
