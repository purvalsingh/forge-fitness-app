import { lazy, Suspense, useState } from 'react'
import { BrowserRouter, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ActiveDateProvider, StoreProvider, useActiveDate, useStore } from './store'
import { AuthGate, KeySetup } from './screens/Auth'
import { AddFoodSheet } from './screens/AddFood'
import Today, { WaterSheet } from './screens/Today'
import { Icon, Spinner, Notice, Sheet, Screen } from './ui'

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
const Coach = lazy(() => import('./screens/Coach'))
const Exercises = lazy(() => import('./screens/Exercises'))
const History = lazy(() => import('./screens/History'))

const NAV = [
  { to: '/', icon: 'today', label: 'Today' },
  { to: '/diet', icon: 'diet', label: 'Food' },
  null,
  { to: '/workout', icon: 'workout', label: 'Train' },
  { to: '/progress', icon: 'progress', label: 'Progress' },
] as const

function BottomNav({ onAdd }: { onAdd: () => void }) {
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 flex justify-center"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', background: 'linear-gradient(to top, var(--bg) 55%, transparent)' }}>
      <div className="flex w-full max-w-[520px] items-end justify-between gap-1 px-3 pb-2 pt-3"
        style={{ borderTop: '1px solid var(--line)', background: 'var(--glass)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}>
        {NAV.map((n, i) => n === null ? (
          <button key={i} onClick={onAdd} aria-label="Quick add"
            className="press -mt-7 grid h-[62px] w-[62px] shrink-0 place-items-center rounded-full"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)', boxShadow: '0 10px 30px -6px rgba(255,107,44,.65)' }}>
            <Icon name="plus" size={30} />
          </button>
        ) : (
          <NavLink key={n.to} to={n.to} end={n.to === '/'}
            className="press flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-1"
            style={({ isActive }) => ({ color: isActive ? 'var(--accent)' : 'var(--text-mute)' })}>
            <Icon name={n.icon} size={22} />
            <span className="text-[10.5px] font-semibold">{n.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** The + button: every logging action one tap away, into the day being viewed. */
function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const nav = useNavigate()
  const { date, isToday } = useActiveDate()
  const [food, setFood] = useState<null | 'search' | 'describe' | 'barcode'>(null)
  const [water, setWater] = useState(false)
  const hour = new Date().getHours()
  const meal = s.mealTypes.reduce((best, m) => (Number(m.time.slice(0, 2)) <= hour ? m : best), s.mealTypes[0])
  const go = (to: string) => { onClose(); nav(to) }
  const items: [string, string, string, () => void][] = [
    ['search', 'Log food', 'Search 16,000 foods', () => { onClose(); setFood('search') }],
    ['camera', 'Scan meal', 'AI food camera', () => go('/diet/camera')],
    ['sparkle', 'Describe meal', '“2 roti, dal, vada pav”', () => { onClose(); setFood('describe') }],
    ['barcode', 'Barcode', 'Packaged food', () => { onClose(); setFood('barcode') }],
    ['water', 'Water', '+250 ml and more', () => { onClose(); setWater(true) }],
    ['workout', 'Start workout', 'Plan or freestyle', () => go('/workout')],
    ['weight', 'Weigh-in', 'Log bodyweight', () => go('/progress?log=weight')],
    ['bolt', 'Ask coach', 'Training & nutrition AI', () => go('/coach')],
  ]
  return (
    <>
      <Sheet open={open} onClose={onClose} title={isToday ? 'Add to today' : `Add to ${date}`}>
        <div className="grid grid-cols-2 gap-2">
          {items.map(([icon, title, sub, fn]) => (
            <button key={title} onClick={fn} className="card press flex items-center gap-3 p-3 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--surface-raised)', color: 'var(--accent)' }}><Icon name={icon} size={20} /></span>
              <span className="min-w-0"><span className="block text-[14px] font-semibold">{title}</span><span className="block truncate text-[11px]" style={{ color: 'var(--text-mute)' }}>{sub}</span></span>
            </button>
          ))}
        </div>
      </Sheet>
      <AddFoodSheet open={food !== null} onClose={() => setFood(null)} date={date} mealTypeId={meal?.id ?? ''} initialTab={food ?? 'search'} />
      <WaterSheet open={water} onClose={() => setWater(false)} date={date} />
    </>
  )
}

function Shell() {
  const { ready, error, online } = useStore()
  const [quick, setQuick] = useState(false)
  // A live workout owns the whole screen (rest timer sits where the nav would be).
  const inSession = useLocation().pathname.includes('/workout/session/')
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
          <Route path="/coach" element={<Coach />} />
          <Route path="/exercises" element={<Exercises />} />
          <Route path="/history" element={<History />} />
          <Route path="/more/keys" element={<Screen title="AI keys" sub="Gemini" back={() => history.back()}><KeySetup /></Screen>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      {!inSession && <BottomNav onAdd={() => setQuick(true)} />}
      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <AuthGate>
        <StoreProvider><ActiveDateProvider><Shell /></ActiveDateProvider></StoreProvider>
      </AuthGate>
    </BrowserRouter>
  )
}
