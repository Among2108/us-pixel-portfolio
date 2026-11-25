import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { StartupGate } from './StartupGate'
import { startJourneyPreviews } from './imageReadiness'
import './index.css'

startJourneyPreviews()
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <StartupGate><App /></StartupGate>
  </React.StrictMode>,
)
