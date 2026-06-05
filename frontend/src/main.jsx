import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { bootstrapDatabase } from './serverless/database'

const rootEl = document.getElementById('root')
const root = createRoot(rootEl)

root.render(
  <StrictMode>
    <div style={{ padding: '2rem', color: '#a8b4c4', fontFamily: 'system-ui' }}>Loading secure local database…</div>
  </StrictMode>
)

bootstrapDatabase()
  .then(() => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
  .catch((err) => {
    console.error('Database bootstrap failed:', err)
    root.render(
      <StrictMode>
        <div style={{ padding: '2rem', color: '#f87171', fontFamily: 'system-ui' }}>
          Failed to initialize local database. Please restart the app.
        </div>
      </StrictMode>
    )
  })
