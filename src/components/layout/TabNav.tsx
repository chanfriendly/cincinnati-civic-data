import React from 'react'
import { useTranslation } from 'react-i18next'
import type { TabId } from '../../types'

interface TabNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

const TABS: Array<{ id: TabId; num: string; label: string }> = [
  { id: 'address',       num: '01', label: 'Address Lookup'       },
  { id: 'neighborhoods', num: '02', label: 'Neighborhoods'        },
  { id: 'displacement',  num: '03', label: 'Housing Justice'      },
  { id: 'lead',          num: '04', label: 'Lead Safety'          },
  { id: 'police',        num: '05', label: 'Police'               },
  { id: 'accessibility', num: '06', label: 'Explorer'             },
  { id: 'tax',           num: '07', label: 'Tax & Revenue'        },
  { id: 'about',         num: '08', label: 'Methodology & Limits' },
]

const TabNav: React.FC<TabNavProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation()
  const scrollRef = React.useRef<HTMLDivElement>(null)

  return (
    <nav
      className="sticky z-40 no-print"
      style={{
        top: 73,
        background: '#fbf8f3',
        borderBottom: '1px solid #e4ddd2',
      }}
      aria-label="Main navigation"
    >
      <div className="max-w-editorial mx-auto px-8">
        <div ref={scrollRef} className="flex overflow-x-auto scrollbar-hide">
          {TABS.map((tab) => {
            const active = tab.id === activeTab
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="relative flex items-center gap-2 px-4 py-3.5 text-[14px] font-medium transition-colors whitespace-nowrap"
                style={{
                  color: active ? '#1a1410' : '#6b5f55',
                  borderBottom: `2px solid ${active ? '#b34728' : 'transparent'}`,
                  marginBottom: -1,
                }}
                aria-current={active ? 'page' : undefined}
              >
                <span
                  className="serif tnum text-[12px]"
                  style={{ color: active ? '#b34728' : '#6b5f55', opacity: 0.8 }}
                >
                  {tab.num}
                </span>
                <span>{t(`nav.${tab.id}`, tab.label)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

export default TabNav
