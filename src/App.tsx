import { lazy, Suspense } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { StoreProvider, useStore } from './store'
import { AuthGate } from './screens/Auth'
import { Icon, Spinner, Notice } from './ui'

const Today = lazy(() => import('./screens/Today'))
const Diet = lazy(() => import('./screens/Diet'))
const Camera = lazy(() => import('./screens/Camera'))
const Workout = lazy(() => import('./screens/Workout'))
const Session = lazy(() => import('./screens/Session'))
const Progress = lazy(() => import('./screens/Progress'))
const More = lazy(() => import('./screens/More'))
const Goals = lazy(() => import('./screens/Goals'))
const TargetCalc = lazy(() => import('./screens/TargetCalc'))
const Foods = lazy(() => import('./screens/Foods'))
const Recipes = lazy(() => import('./screens/Recipes'))
const PlanBuilder = lazy(() => import('./screens/PlanBuilder'))
const Adherence = lazy(() => import('./screens/Adherence'))
const DayDetail = lazy(() => import('./screens/DayDetail'))
const SettingsScreen = lazy(() => import('./screens/Settings'))
const Physique = lazy(() => import('./screens/Physique'))

const NAV = [
  { to: '/', icon: 'today', label: 'Today' },
  { to: '/diet', icon: 'diet', label: 'Diet' },
  { to: '/workout', icon: 'workout', label: 'Workout' },
  { to: '/progress', icon: 'progress', label: 'Progress' },
  { to: '/more', icon: 'more', label: 'More' },
]

function BottomNav() {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-3"
      style={{ paddingBottom: 'calc(10px + env(safe-area-inset-bottom))' }}>
      <div className="glass flex w-full max-w-[520px] items-center justify-between gap-1 px-2 py-2">
        {NAV.map(n => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}
            className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1"
            style={({ isActive }) => ({
              color: isActive ? 'var(--text)' : 'var(--text-mute)',
              background: isActive ? 'var(--glass)' : 'transparent',
            })}>
            <Icon name={n.icon} size={20} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{n.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function Shell() {
  const { ready, error, online } = useStore()
  if (!ready) return <Spinner label="Loading FORGE" />
  return (
    <>
      {!online && (
        <div className="mx-auto max-w-[520px] px-4 pt-3">
          <Notice tone="warn">Offline — showing your last saved data. New entries save once you reconnect.</Notice>
        </div>
      )}
      {error && (
        <div className="mx-auto max-w-[520px] px-4 pt-3"><Notice tone="error">{error}</Notice></div>
      )}
      <Suspense fallback={<Spinner />}>
        <Routes>
          <Route path="/" element={<Today />} />
          <Route path="/diet" element={<Diet />} />
          <Route path="/diet/camera" element={<Camera />} />
          <Route path="/workout" element={<Workout />} />
          <Route path="/workout/session/:dayId" element={<Session />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/adherence" element={<Adherence />} />
          <Route path="/day/:date" element={<DayDetail />} />
          <Route path="/more" element={<More />} />
          <Route path="/more/goals" element={<Goals />} />
          <Route path="/more/target" element={<TargetCalc />} />
          <Route path="/more/foods" element={<Foods />} />
          <Route path="/more/recipes" element={<Recipes />} />
          <Route path="/more/plan" element={<PlanBuilder />} />
          <Route path="/more/settings" element={<SettingsScreen />} />
          <Route path="/physique" element={<Physique />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <BottomNav />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthGate>
        <StoreProvider><Shell /></StoreProvider>
      </AuthGate>
    </BrowserRouter>
  )
}
