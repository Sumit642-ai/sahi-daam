import React from 'react'
import ReactDOM from 'react-dom/client'

// Self-hosted, subset fonts: Latin Poppins and Devanagari Noto Sans only.
import '@fontsource/poppins/latin-400.css'
import '@fontsource/poppins/latin-500.css'
import '@fontsource/poppins/latin-600.css'
import '@fontsource/poppins/latin-700.css'
import '@fontsource/noto-sans-devanagari/devanagari-400.css'
import '@fontsource/noto-sans-devanagari/devanagari-600.css'

import { registerSW } from 'virtual:pwa-register'

import { App } from './app/App'
import './index.css'

// Offline and installable (spec v2, sections 4 and 13); updates apply on the next visit.
registerSW({ immediate: true })

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
