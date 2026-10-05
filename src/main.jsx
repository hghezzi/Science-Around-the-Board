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

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
