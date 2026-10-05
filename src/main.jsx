import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { theme } from './theme.js'
import App from './App.jsx'
import { getConsent, loadAnalytics } from './consent.js'

// Analytics only for visitors who opted in on the start page (see ConsentBanner).
if (getConsent() === 'granted') loadAnalytics()

// Keep the browser's install prompt so the start page can offer "Install as an app".
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  window.__sabInstallPrompt = e
  window.dispatchEvent(new Event('sab-install-available'))
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
