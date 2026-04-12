import React, { useState, Suspense } from 'react'
import { LanguageProvider } from './context/LanguageContext'
import Header from './components/layout/Header'
import TabNav from './components/layout/TabNav'
import LoadingSkeleton from './components/ui/LoadingSkeleton'
import type { TabId } from './types'

// Lazy load tabs
const AddressLookup = React.lazy(() => import('./tabs/AddressLookup'))
const NeighborhoodProfiles = React.lazy(() => import('./tabs/NeighborhoodProfiles'))
const PoliceAccountability = React.lazy(() => import('./tabs/PoliceAccountability'))
const NeighborhoodExplorer = React.lazy(() => import('./tabs/NeighborhoodExplorer'))
const Roadmap = React.lazy(() => import('./tabs/Roadmap'))
const DisplacementTab = React.lazy(() => import('./tabs/Displacement'))
const OwnerActivity = React.lazy(() => import('./tabs/OwnerActivity'))
const Accessibility = React.lazy(() => import('./tabs/Accessibility'))
const LeadSafety = React.lazy(() => import('./tabs/LeadSafety'))

const TabLoadingFallback: React.FC = () => (
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <LoadingSkeleton lines={5} height="h-8" />
  </div>
)

const AppContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('address')

  const renderTabContent = () => {
    switch (activeTab) {
      case 'address':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <AddressLookup />
          </Suspense>
        )
      case 'neighborhood':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <NeighborhoodProfiles />
          </Suspense>
        )
      case 'police':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <PoliceAccountability />
          </Suspense>
        )
      case 'explorer':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <NeighborhoodExplorer />
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
      case 'roadmap':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <Roadmap />
          </Suspense>
        )
      case 'displacement':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <DisplacementTab />
          </Suspense>
        )
      case 'owner':
        return (
          <Suspense fallback={<TabLoadingFallback />}>
            <OwnerActivity />
          </Suspense>
        )
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      <Header />
      <TabNav activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {renderTabContent()}
        </div>
      </main>
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">

            {/* Left: attribution */}
            <div className="text-center sm:text-left space-y-1">
              <p className="font-medium text-gray-700">Cincinnati Civic Data Platform</p>
              <p>Open data for community organizers, researchers, and residents.</p>
              <p>
                Data sourced from{' '}
                <a href="https://data.cincinnati-oh.gov" target="_blank" rel="noopener noreferrer"
                  className="text-[#1A4A6B] hover:underline">Cincinnati Open Data</a>
                {', '}
                <a href="https://www.census.gov/programs-surveys/acs" target="_blank" rel="noopener noreferrer"
                  className="text-[#1A4A6B] hover:underline">U.S. Census ACS</a>
                {', and '}
                <a href="https://cagis.hamilton-co.org/" target="_blank" rel="noopener noreferrer"
                  className="text-[#1A4A6B] hover:underline">Hamilton County CAGIS</a>.
              </p>
            </div>

            {/* Right: made by */}
            <div className="text-center sm:text-right space-y-1 shrink-0">
              <p>
                Made by{' '}
                {/* TODO: replace # with your personal website URL, e.g. https://christianglass.com */}
                <a href="https://christianglass.vercel.app/" className="font-medium text-[#1A4A6B] hover:underline">
                  Christian Glass
                </a>
              </p>
              <div className="flex items-center justify-center sm:justify-end gap-3">
                {/* GitHub link — update URL once the repo is public */}
                <a
                  href="https://github.com/chanfriendly/cincinnati-civic-data"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-gray-500 hover:text-[#1A4A6B] transition-colors"
                  aria-label="View source on GitHub"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path fillRule="evenodd" clipRule="evenodd"
                      d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.92.359.31.678.921.678 1.856 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                    />
                  </svg>
                  GitHub
                </a>
                <span className="text-gray-300">·</span>
                <span>{new Date().getFullYear()}</span>
              </div>
            </div>

          </div>
        </div>
      </footer>
    </div>
  )
}

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <AppContent />
    </LanguageProvider>
  )
}

export default App
