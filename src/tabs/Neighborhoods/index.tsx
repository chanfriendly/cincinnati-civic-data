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

// Lazy-load the heavy sub-components so the tab shell renders instantly
const NeighborhoodProfiles = React.lazy(() => import('../NeighborhoodProfiles'))
const NeighborhoodExplorer = React.lazy(() => import('../NeighborhoodExplorer'))

type NeighborhoodsView = 'profiles' | 'map'

const SubTabFallback: React.FC = () => (
  <div className="mt-6">
    <LoadingSkeleton lines={5} height="h-8" />
  </div>
)

const Neighborhoods: React.FC = () => {
  const [activeView, setActiveView] = useState<NeighborhoodsView>('profiles')

  return (
    <div>
      {/* Internal sub-nav — matches the pill style used in Housing Justice */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setActiveView('profiles')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeView === 'profiles'
              ? 'bg-white shadow-sm text-[#1A4A6B]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Profiles
        </button>
        <button
          onClick={() => setActiveView('map')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeView === 'map'
              ? 'bg-white shadow-sm text-[#1A4A6B]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Map &amp; Compare
        </button>
      </div>

      {activeView === 'profiles' && (
        <Suspense fallback={<SubTabFallback />}>
          <NeighborhoodProfiles />
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
