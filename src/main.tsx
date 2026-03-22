import React from 'react'
import ReactDOM from 'react-dom/client'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import App from './App'
import './index.css'
import en from './i18n/en.json'
import es from './i18n/es.json'

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: localStorage.getItem('cincy-lang') ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
