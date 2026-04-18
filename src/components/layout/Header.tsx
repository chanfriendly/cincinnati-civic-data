import React from 'react'
import { useTranslation } from 'react-i18next'
import { useLanguage } from '../../context/LanguageContext'
import type { TabId } from '../../types'

interface HeaderProps {
  onTabChange: (tab: TabId) => void
}

const Header: React.FC<HeaderProps> = ({ onTabChange }) => {
  const { t } = useTranslation()
  const { language, setLanguage } = useLanguage()

  return (
    <header
      className="sticky top-0 z-50 bg-white border-b-2 border-[#1A4A6B] shadow-sm"
      aria-label={t('app.title')}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between py-4 gap-4 sm:gap-0">
          {/* Left: Logo/Title */}
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <h1 className="text-2xl font-bold text-[#1A4A6B]" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                Cincinnati
              </h1>
              <p className="text-lg text-gray-700 font-normal" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
                Civic Data Platform
              </p>
            </div>
            <p className="text-xs text-gray-500 hidden sm:block" style={{ fontFamily: 'IBM Plex Sans, sans-serif' }}>
              Public records for residents, organizers, and journalists
            </p>
          </div>

          {/* Right: About link + Language Toggle */}
          <nav className="flex items-center gap-4" aria-label="Site navigation">
            {/* About & Methods — meta link, lives outside the data tab row */}
            <button
              onClick={() => onTabChange('about')}
              className="text-sm text-gray-500 hover:text-[#1A4A6B] transition-colors hidden sm:block"
              aria-label="About & Methods"
            >
              About &amp; Methods
            </button>

            <div className="flex gap-3 border-l border-gray-200 pl-4">
              <button
                onClick={() => setLanguage('en')}
                className={`px-3 py-1 font-medium transition-colors ${
                  language === 'en'
                    ? 'text-[#1A4A6B] border-b-2 border-[#1A4A6B]'
                    : 'text-gray-600 hover:text-[#1A4A6B]'
                }`}
                aria-label="Switch to English"
                aria-current={language === 'en' ? 'true' : 'false'}
              >
                EN
              </button>
              <button
                onClick={() => setLanguage('es')}
                className={`px-3 py-1 font-medium transition-colors ${
                  language === 'es'
                    ? 'text-[#1A4A6B] border-b-2 border-[#1A4A6B]'
                    : 'text-gray-600 hover:text-[#1A4A6B]'
                }`}
                aria-label="Switch to Spanish"
                aria-current={language === 'es' ? 'true' : 'false'}
              >
                ES
              </button>
            </div>
          </nav>
        </div>
      </div>
    </header>
  )
}

export default Header
