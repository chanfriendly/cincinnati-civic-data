import React, { createContext, useContext, useState, useEffect } from 'react'
import i18next from 'i18next'

interface LanguageContextType {
  language: 'en' | 'es'
  setLanguage: (lang: 'en' | 'es') => void
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<'en' | 'es'>('en')

  useEffect(() => {
    // Initialize from localStorage or browser language
    const savedLanguage = localStorage.getItem('language') as 'en' | 'es' | null
    const browserLanguage = navigator.language.startsWith('es') ? 'es' : 'en'
    const initialLanguage = savedLanguage || browserLanguage

    setLanguageState(initialLanguage)
    i18next.changeLanguage(initialLanguage)
  }, [])

  const setLanguage = (lang: 'en' | 'es') => {
    setLanguageState(lang)
    i18next.changeLanguage(lang)
    localStorage.setItem('language', lang)
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }
  return context
}
