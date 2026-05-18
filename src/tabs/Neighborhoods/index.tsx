/**
 * Neighborhoods tab — Cincinnati Civic Data Platform
 *
 * Combines Neighborhood Profiles and the Neighborhood Map (Explorer) into a
 * single tab with an internal sub-nav, following the same pattern used by the
 * Housing Justice and Police Accountability tabs.
 *
 * Sub-tabs:
 *   Profiles   — deep per-neighborhood data profile (the former Tab 2)
 *   Map & Compare — choropleth map + scoring across all 52 neighborhoods (the former Explorer)
 */

import React, { useState, Suspense } from 'react'
import LoadingSkeleton from '../../components/ui/LoadingSkeleton'
import { C } from '../../components/ui/DesignAtoms'

const NeighborhoodProfiles = React.lazy(() => import('../NeighborhoodProfiles'))
const NeighborhoodExplorer = React.lazy(() => import('../NeighborhoodExplorer'))

type NeighborhoodsView = 'profiles' | 'map'

const VIEWS: Array<{ id: NeighborhoodsView; label: string }> = [
  { id: 'profiles', label: 'Profiles'      },
  { id: 'map',      label: 'Map & Compare' },
]

const SubTabFallback: React.FC = () => (
  <div className="mt-6">
    <LoadingSkeleton lines={5} height="h-8" />
  </div>
)

const Neighborhoods: React.FC = () => {
  const [activeView, setActiveView] = useState<NeighborhoodsView>('profiles')

  return (
    <div>
      <div className="page-paper" style={{ borderBottom: `1px solid ${C.rule}` }}>
        <div className="max-w-editorial mx-auto px-8 flex flex-wrap">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setActiveView(v.id)}
              className="px-5 py-3 text-[13px] font-medium transition-colors"
              style={{
                borderBottom: activeView === v.id ? `2px solid ${C.river}` : '2px solid transparent',
                color: activeView === v.id ? C.ink : C.muted,
                background: 'transparent',
                fontFamily: '"Public Sans", sans-serif',
                marginBottom: -1,
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {activeView === 'profiles' && (
        <Suspense fallback={<SubTabFallback />}>
          <NeighborhoodProfiles onViewMap={() => setActiveView('map')} />
        </Suspense>
      )}
      {activeView === 'map' && (
        <Suspense fallback={<SubTabFallback />}>
          <NeighborhoodExplorer />
        </Suspense>
      )}
    </div>
  )
}

export default Neighborhoods
