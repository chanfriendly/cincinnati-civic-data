/**
 * About & Methods tab — Cincinnati Civic Data Platform
 *
 * Combines the Roadmap ("Future Work") and Limitations ("About & Methods")
 * pages into a single tab with an internal sub-nav. Reduces nav clutter
 * without losing any content.
 */

import React, { useState } from 'react'
import Roadmap from '../Roadmap'
import Limitations from '../Limitations'

type AboutView = 'methods' | 'roadmap'

const About: React.FC = () => {
  const [activeView, setActiveView] = useState<AboutView>('methods')

  return (
    <div>
      {/* Internal sub-nav */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setActiveView('methods')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeView === 'methods'
              ? 'bg-white shadow-sm text-[#1A4A6B]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          About &amp; Methods
        </button>
        <button
          onClick={() => setActiveView('roadmap')}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeView === 'roadmap'
              ? 'bg-white shadow-sm text-[#1A4A6B]'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Future Work
        </button>
      </div>

      {activeView === 'methods' && <Limitations />}
      {activeView === 'roadmap' && <Roadmap />}
    </div>
  )
}

export default About
