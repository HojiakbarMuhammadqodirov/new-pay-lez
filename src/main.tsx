import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { captureReferral } from './site/auth/referral'

/* Before the first render, so the invite in `?ref=` is kept before anything
   rewrites the address. See `site/auth/referral.ts`. */
captureReferral()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
