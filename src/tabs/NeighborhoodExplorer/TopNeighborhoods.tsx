import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { NeighborhoodScore } from '../../types';
import { C } from '../../components/ui/DesignAtoms';

interface TopNeighborhoodsProps {
  scores: NeighborhoodScore[];
  onSelect: (name: string) => void;
  selectedNeighborhood: string | null;
  anyDimensionEnabled: boolean;
}

export default function TopNeighborhoods({
  scores,
  onSelect,
  selectedNeighborhood,
  anyDimensionEnabled,
}: TopNeighborhoodsProps) {
  const { t } = useTranslation();

  const topFive = useMemo(() => scores.slice(0, 5), [scores]);

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
