import React, { useState } from 'react'
import Roadmap from '../Roadmap'
import Limitations from '../Limitations'
import { C } from '../../components/ui/DesignAtoms'

type AboutView = 'methods' | 'roadmap'

const VIEWS: Array<{ id: AboutView; label: string }> = [
  { id: 'methods', label: 'Methodology & Limits' },
  { id: 'roadmap', label: 'Future Work'          },
]

const About: React.FC = () => {
  const [activeView, setActiveView] = useState<AboutView>('methods')

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

      {activeView === 'methods' && <Limitations />}
      {activeView === 'roadmap' && <Roadmap />}
    </div>
  )
}

export default About
