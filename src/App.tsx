import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { ComposerProvider } from '@/features/transactions/ComposerProvider'
import { TooltipProvider } from '@/ui'
import OverviewPage from '@/features/overview/OverviewPage'
import BoxesPage from '@/features/boxes/BoxesPage'
import PlanningPage from '@/features/planning/PlanningPage'
import ActivityPage from '@/features/transactions/ActivityPage'
import SettingsPage from '@/features/settings/SettingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <TooltipProvider delayDuration={200} skipDelayDuration={400}>
        <ComposerProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/boxes" element={<BoxesPage />} />
              <Route path="/planning" element={<PlanningPage />} />
              <Route path="/activity" element={<ActivityPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<OverviewPage />} />
            </Route>
          </Routes>
        </ComposerProvider>
      </TooltipProvider>
    </BrowserRouter>
  )
}
