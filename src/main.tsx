import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import AuthProvider from './context/AuthProvider'
import { CampaignSettingsProvider } from './context/CampaignSettingsProvider'
import { syncCachesWithEmulatorRuntime } from './utils/fetchCache'

const queryClient = new QueryClient()
const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element #root not found')
}
const rootContainer: HTMLElement = rootElement

async function bootstrap() {
  await syncCachesWithEmulatorRuntime()

  createRoot(rootContainer).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <CampaignSettingsProvider>
              <App />
            </CampaignSettingsProvider>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </StrictMode>,
  )
}

void bootstrap()
