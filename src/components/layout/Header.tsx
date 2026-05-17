import React from 'react'
import { useLanguage } from '../../context/LanguageContext'
import type { TabId } from '../../types'

interface HeaderProps {
  onTabChange: (tab: TabId) => void
}

const CivicSeal: React.FC = () => (
  <svg width="36" height="36" viewBox="0 0 34 34" aria-hidden="true">
    <circle cx="17" cy="17" r="16" fill="none" stroke="#1a1410" strokeWidth="1" />
    {/* Ohio River — two flowing curves */}
    <path d="M 4 22 Q 9 14, 14 18 T 22 16 T 30 20" fill="none" stroke="#2f5d62" strokeWidth="1.4" />
    <path d="M 4 25 Q 12 22, 17 24 T 30 23" fill="none" stroke="#2f5d62" strokeWidth="1.4" opacity="0.55" />
    {/* Cincinnati hills silhouette */}
    <path d="M 7 22 L 11 15 L 14 19 L 18 12 L 22 17 L 26 13 L 28 18" fill="none" stroke="#5a7a3e" strokeWidth="1.2" />
  </svg>
)

const Header: React.FC<HeaderProps> = ({ onTabChange }) => {
  const { language, setLanguage } = useLanguage()

  return (
    <header
      className="sticky top-0 z-50"
      style={{ background: '#fbf8f3', borderBottom: '1px solid #e4ddd2' }}
    >
      <div className="max-w-editorial mx-auto px-8 py-5 flex items-center justify-between">

        {/* Wordmark — civic seal + serif italic masthead */}
        <div className="flex items-center gap-3">
          <CivicSeal />
          <div>
            <div
              className="serif leading-none font-medium"
              style={{ fontSize: 22, letterSpacing: '-0.01em', color: '#1a1410' }}
            >
              Cincinnati{' '}
              <span className="serif italic font-normal" style={{ color: '#6b5f55' }}>
                Civic Data
              </span>
            </div>
            <div className="text-[11px] mt-0.5 hidden sm:block" style={{ color: '#6b5f55' }}>
              Public records for residents, organizers, and neighbors
            </div>
          </div>
        </div>

        {/* Nav links + language toggle */}
        <nav className="flex items-center gap-5 text-[13px]" aria-label="Site navigation">
          <button
            onClick={() => onTabChange('about')}
            className="hover:underline transition-colors"
            style={{ color: '#6b5f55' }}
          >
            About &amp; methods
          </button>
          <span style={{ color: '#e4ddd2' }}>·</span>
          <button
            onClick={() => onTabChange('about')}
            className="hover:underline transition-colors"
            style={{ color: '#6b5f55' }}
          >
            Limitations
          </button>

          {/* Language toggle */}
          <div
            className="flex border rounded-sm overflow-hidden ml-2"
            style={{ borderColor: '#e4ddd2' }}
          >
            <button
              onClick={() => setLanguage('en')}
              className="px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={
                language === 'en'
                  ? { background: '#1a1410', color: '#fbf8f3' }
                  : { color: '#6b5f55' }
              }
              aria-label="Switch to English"
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('es')}
              className="px-2.5 py-1 text-[12px] font-medium transition-colors"
              style={
                language === 'es'
                  ? { background: '#1a1410', color: '#fbf8f3' }
                  : { color: '#6b5f55' }
              }
              aria-label="Switch to Spanish"
            >
              ES
            </button>
          </div>
        </nav>
      </div>
    </header>
  )
}

export default Header
