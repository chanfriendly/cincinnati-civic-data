import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Dimension, DimensionId } from '../../types';

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
            className={`text-lg transition ${
              star <= weight ? 'text-civic-amber' : 'text-gray-300'
            }`}
            title={`Weight: ${star}`}
          >
            ★
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 h-full overflow-y-auto">
      <h2 className="text-2xl font-bold text-civic-blue mb-6">
        {t('explorer.dimensionPanel.title', 'Dimensions')}
      </h2>

      <div className="space-y-6">
        {dimensions.map((dim) => (
          <div key={dim.id} className="border-b border-gray-200 pb-4 last:border-b-0">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {!dim.available ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      disabled
                      className="w-5 h-5 text-civic-blue rounded"
                    />
                    <span className="text-gray-400 flex items-center gap-1">
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
                      className="w-5 h-5 text-civic-blue rounded cursor-pointer"
                    />
                    <span className="font-semibold text-civic-blue">
                      {t(dim.labelKey)}
                    </span>
                  </label>
                )}
                <p className="text-sm text-gray-600 mt-1 ml-8">
                  {t(dim.descriptionKey)}
                </p>
              </div>
            </div>

            {dim.enabled && dim.available && (
              <div className="mt-3 ml-8 space-y-3">
                {dim.methodology && (
                  <details className="group">
                    <summary className="text-xs text-civic-blue cursor-pointer select-none hover:underline">
                      How is this scored? ▸
                    </summary>
                    <p className="mt-1 text-xs text-gray-500 leading-relaxed">
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
                  <label className="block text-xs font-semibold text-gray-700 mb-2">
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
