import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { AcademicSessionProvider } from './context/AcademicSessionContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AcademicSessionProvider>
          <App />
        </AcademicSessionProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
