import React, { useState, Suspense } from 'react'
import { LanguageProvider } from './context/LanguageContext'
import Header from './components/layout/Header'
import TabNav from './components/layout/TabNav'
import LoadingSkeleton from './components/ui/LoadingSkeleton'
import type { TabId } from './types'

// Lazy load tabs
const AddressLookup = React.lazy(() => import('./tabs/AddressLookup'))
const Neighborhoods = React.lazy(() => import('./tabs/Neighborhoods'))
const PoliceAccountability = React.lazy(() => import('./tabs/PoliceAccountability'))
const DisplacementTab = React.lazy(() => import('./tabs/Displacement'))
const Accessibility = React.lazy(() => import('./tabs/Accessibility'))
const LeadSafety = React.lazy(() => import('./tabs/LeadSafety'))
const TaxRevenue = React.lazy(() => import('./tabs/TaxRevenue'))
const About = React.lazy(() => import('./tabs/About'))

const TabLoadingFallback: React.FC = () => (
  <div className="max-w-editorial mx-auto px-8 py-10">
    <LoadingSkeleton lines={5} height="h-8" />
  </div>
)

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('neighborhoods')

  const renderTabContent = () => {
    switch (activeTab) {
      case 'address':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <AddressLookup onTabChange={setActiveTab} />
          </Suspense>
        )
      case 'neighborhoods':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <Neighborhoods />
          </Suspense>
        )
      case 'police':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <PoliceAccountability />
          </Suspense>
        )
      case 'accessibility':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <Accessibility />
          </Suspense>
        )
      case 'lead':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <LeadSafety />
          </Suspense>
        )
      case 'displacement':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <DisplacementTab onTabChange={setActiveTab} />
          </Suspense>
        )
      case 'tax':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <TaxRevenue />
          </Suspense>
        )
      case 'about':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <About />
          </Suspense>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-limestone">
      <Header />
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1 fade-up">
        {renderTabContent()}
      </main>

      {/* Editorial 4-column footer */}
      <footer
        className="mt-20 pb-12 no-print"
        style={{ borderTop: '1px solid #e4ddd2', background: '#fbf8f3' }}
      >
        <div className="max-w-editorial mx-auto px-8 py-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 text-[13px]">

          {/* Wordmark + mission */}
          <div>
            <div className="serif text-[18px] leading-none font-medium mb-2" style={{ color: '#1a1410' }}>
              Cincinnati{' '}
              <span className="italic font-normal" style={{ color: '#6b5f55' }}>Civic Data</span>
            </div>
            <p className="leading-relaxed max-w-[360px]" style={{ color: '#6b5f55' }}>
              A civic project. Public records for residents, organizers, and neighbors. Not affiliated
              with the City of Cincinnati.
            </p>
          </div>

          {/* Sources */}
          <div>
            <div className="smallcaps mb-3" style={{ color: '#6b5f55' }}>Sources</div>
            <ul className="space-y-2" style={{ color: '#1a1410' }}>
              <li>
                <a href="https://data.cincinnati-oh.gov" target="_blank" rel="noopener noreferrer"
                  className="hover:underline">Cincinnati Open Data</a>
              </li>
              <li>
                <a href="https://www.census.gov/programs-surveys/acs" target="_blank" rel="noopener noreferrer"
                  className="hover:underline">U.S. Census ACS</a>
              </li>
              <li>
                <a href="https://cdc.gov/places" target="_blank" rel="noopener noreferrer"
                  className="hover:underline">CDC PLACES</a>
              </li>
              <li>
                <a href="https://cagis.hamilton-co.org" target="_blank" rel="noopener noreferrer"
                  className="hover:underline">CAGIS Hamilton Co.</a>
              </li>
            </ul>
          </div>

          {/* Help */}
          <div>
            <div className="smallcaps mb-3" style={{ color: '#6b5f55' }}>Help</div>
            <ul className="space-y-2" style={{ color: '#1a1410' }}>
              <li>
                <button onClick={() => setActiveTab('about')} className="hover:underline text-left">
                  About this site
                </button>
              </li>
              <li>
                <button onClick={() => setActiveTab('about')} className="hover:underline text-left">
                  Methodology
                </button>
              </li>
              <li>
                <a href="https://forms.gle/sMHyvc4Hu8FMwARE8" target="_blank" rel="noopener noreferrer"
                  className="hover:underline">Submit a correction</a>
              </li>
            </ul>
          </div>

          {/* Made by */}
          <div>
            <div className="smallcaps mb-3" style={{ color: '#6b5f55' }}>Made by</div>
            <p className="leading-relaxed" style={{ color: '#6b5f55' }}>
              <a href="https://christianglass.vercel.app/" className="hover:underline font-medium" style={{ color: '#1a1410' }}>
                Christian Glass
              </a>
              {' '}· {new Date().getFullYear()} ·{' '}
              <a href="https://github.com/chanfriendly/cincinnati-civic-data" target="_blank"
                rel="noopener noreferrer" className="hover:underline">
                Open source on GitHub
              </a>
            </p>
          </div>

        </div>
      </footer>
    </div>
  )
}

const App: React.FC = () => (
  <LanguageProvider>
    <AppContent />
  </LanguageProvider>
)

export default App
