import { lazy, Suspense } from 'react'
import { useWorkplaceSync } from './hooks/useWorkplaceSync'
import { useWorkplace } from './stores/workplaceStore'
import { TopBar } from './components/layout/TopBar'
import { Sidebar } from './components/layout/Sidebar'
import { RightPanel } from './components/layout/RightPanel'
import { BottomPanel } from './components/layout/BottomPanel'
import { PanelHost } from './components/layout/PanelHost'
import { ConfirmDialog, PresentationControls, StartRunDialog, Toasts } from './components/layout/Overlays'
import { SceneErrorBoundary } from './components/SceneErrorBoundary'

const OfficeScene = lazy(() => import('./three/OfficeScene').then((m) => ({ default: m.OfficeScene })))

export default function App() {
  useWorkplaceSync()
  const synced = useWorkplace((s) => s.synced)
  const connection = useWorkplace((s) => s.connection)

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="relative min-w-0 flex-1" aria-label="3D workplace">
          <SceneErrorBoundary>
            <Suspense fallback={<Loading text="Building the office…" />}>
              {synced ? <OfficeScene /> : <Loading text={connection === 'open' ? 'Syncing…' : 'Connecting to the backend…'} />}
            </Suspense>
          </SceneErrorBoundary>
          <PanelHost />
          <PresentationControls />
          <BottomPanel />
          <Toasts />
        </main>
        <RightPanel />
      </div>
      <StartRunDialog />
      <ConfirmDialog />
    </div>
  )
}

function Loading({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-sky-300/20 to-slate-950">
      <div className="text-center">
        <div className="mx-auto mb-3 h-12 w-12 animate-bounce rounded-xl bg-amber-400 shadow-[0_4px_0_#b45309]" />
        <p className="font-bold text-slate-200">{text}</p>
        <p className="mt-1 text-xs text-slate-400">Backend expected at http://127.0.0.1:8000</p>
      </div>
    </div>
  )
}
