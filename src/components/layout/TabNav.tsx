import React from 'react'
import { useTranslation } from 'react-i18next'
import type { TabId } from '../../types'

interface TabNavProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}

interface TabConfig {
  id: TabId
  icon: React.ReactNode
  labelKey: string
}

const AddressIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
    />
  </svg>
)

const NeighborhoodIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
    />
  </svg>
)

const PoliceIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
    />
  </svg>
)

const DisplacementIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
)

const LeadIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 2C12 2 5 10 5 14a7 7 0 0014 0c0-4-7-12-7-12z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 17v.01" />
  </svg>
)

const AccessibilityIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="4" r="1.5" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 7v5l3 3M9 10H6M18 10h-3M9 21l3-4 3 4" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M6.5 18a6 6 0 1111 0" />
  </svg>
)

const TaxIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

const TabNav: React.FC<TabNavProps> = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = React.useState(false)
  const [canScrollRight, setCanScrollRight] = React.useState(false)

  const updateScrollState = React.useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  React.useEffect(() => {
    updateScrollState()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateScrollState)
    const ro = new ResizeObserver(updateScrollState)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', updateScrollState); ro.disconnect() }
  }, [updateScrollState])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'right' ? 200 : -200, behavior: 'smooth' })
  }

  // Tab order tells a story: personal → neighborhoods → housing justice
  // → environmental health → police → tax
  // Notes:
  //   - "Neighborhoods" combines Profiles + Map & Compare (sub-nav inside)
  //   - Owner / Developer Search lives inside Housing Justice as a sub-section
  //   - About & Methods lives in the Header, not here
  const tabs: TabConfig[] = [
    { id: 'address',        icon: <AddressIcon />,       labelKey: 'nav.address' },
    { id: 'neighborhoods',  icon: <NeighborhoodIcon />,  labelKey: 'nav.neighborhoods' },
    { id: 'displacement',   icon: <DisplacementIcon />,  labelKey: 'nav.displacement' },
    { id: 'lead',           icon: <LeadIcon />,          labelKey: 'nav.lead' },
    { id: 'police',         icon: <PoliceIcon />,        labelKey: 'nav.police' },
    { id: 'accessibility',  icon: <AccessibilityIcon />, labelKey: 'nav.accessibility' },
    { id: 'tax',            icon: <TaxIcon />,           labelKey: 'nav.tax' },
  ]

  return (
    <nav
      className="bg-white shadow-sm border-b border-gray-100 sticky top-[72px] z-40"
      aria-label="Main navigation"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        {/* Left fade + arrow */}
        {canScrollLeft && (
          <>
            <div className="absolute left-4 sm:left-6 lg:left-8 top-0 bottom-0 w-12 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
            <button
              onClick={() => scroll('left')}
              className="absolute left-4 sm:left-6 lg:left-8 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-[#1A4A6B] hover:border-[#1A4A6B] transition-colors"
              aria-label="Scroll tabs left"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
          </>
        )}

        {/* Right fade + arrow */}
        {canScrollRight && (
          <>
            <div className="absolute right-4 sm:right-6 lg:right-8 top-0 bottom-0 w-12 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
            <button
              onClick={() => scroll('right')}
              className="absolute right-4 sm:right-6 lg:right-8 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-7 h-7 rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-[#1A4A6B] hover:border-[#1A4A6B] transition-colors"
              aria-label="Scroll tabs right"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </button>
          </>
        )}

        <div ref={scrollRef} className="flex overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-[#1A4A6B] text-[#1A4A6B]'
                  : 'border-transparent text-gray-600 hover:text-[#1A4A6B]'
              }`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.icon}
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </nav>
  )
}

export default TabNav
