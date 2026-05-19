import { useTranslation } from 'react-i18next';
import type { Dimension, DimensionId } from '../../types';
import { C } from '../../components/ui/DesignAtoms';

interface DimensionPanelProps {
  dimensions: Dimension[];
  onToggle: (id: DimensionId) => void;
  onWeightChange: (id: DimensionId, weight: number) => void;
  onIncomeSubChange: (sub: 'higher' | 'lower') => void;
}

export default function DimensionPanel({
  dimensions,
  onToggle,
  onWeightChange,
  onIncomeSubChange,
}: DimensionPanelProps) {
  const { t } = useTranslation();

  const renderStars = (weight: number, dimId: DimensionId) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onWeightChange(dimId, star)}
            className="text-lg transition"
            style={{ color: star <= weight ? C.ochre : C.rule }}
            title={`Weight: ${star}`}
          >
            ★
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-md shadow-md p-6 h-full overflow-y-auto">
      <h2 className="text-2xl font-bold mb-6" style={{ color: C.riverDeep }}>
        {t('explorer.dimensionPanel.title', 'Dimensions')}
      </h2>

      <div className="space-y-6">
        {dimensions.map((dim) => (
          <div key={dim.id} className="pb-4 last:border-b-0" style={{ borderBottom: `1px solid ${C.rule}` }}>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {!dim.available ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled
                      className="w-5 h-5 rounded"
                    />
                    <span className="flex items-center gap-1" style={{ color: C.muted }}>
                      {t(dim.labelKey)}
                      <span title={t('explorer.dimensionPanel.noData', 'No data available')}>🔒</span>
                    </span>
                  </div>
                ) : (
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dim.enabled}
                      onChange={() => onToggle(dim.id)}
                      className="w-5 h-5 rounded cursor-pointer"
                    />
                    <span className="font-semibold" style={{ color: C.riverDeep }}>
                      {t(dim.labelKey)}
                    </span>
                  </label>
                )}
                <p className="text-sm mt-1 ml-8" style={{ color: C.muted }}>
                  {t(dim.descriptionKey)}
                </p>
              </div>
            </div>

            {dim.enabled && dim.available && (
              <div className="mt-3 ml-8 space-y-3">
                {dim.methodology && (
                  <details className="group">
                    <summary className="text-xs cursor-pointer select-none hover:underline" style={{ color: C.riverDeep }}>
                      How is this scored? ▸
                    </summary>
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: C.muted }}>
                      {dim.methodology}
                    </p>
                  </details>
                )}
                {dim.id === 'income' && dim.incomeSub !== undefined && (
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="radio"
                        checked={dim.incomeSub === 'higher'}
                        onChange={() => onIncomeSubChange('higher')}
                        className="cursor-pointer"
                      />
                      <span>{t('explorer.income.higher', 'Higher-income areas')}</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm">
                      <input
                        type="radio"
                        checked={dim.incomeSub === 'lower'}
                        onChange={() => onIncomeSubChange('lower')}
                        className="cursor-pointer"
                      />
                      <span>{t('explorer.income.lower', 'Lower-cost areas')}</span>
                    </label>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: C.ink }}>
                    {t('explorer.dimensionPanel.weight', 'Weight')}
                  </label>
                  {renderStars(dim.weight, dim.id)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
