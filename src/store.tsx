import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as db from './lib/db'
import { supabase, supabaseConfigured } from './lib/supabase'
import { SEED_FOODS, SEED_MEAL_TYPES, SEED_PLAN, SEED_RECIPES, SEED_SETTINGS } from './lib/seed'
import { today as todayISO, setDayStartHour } from './lib/calc'
import type {
  AIInsight, Food, FoodLog, Goal, MealType, NutritionTarget, PhysiqueCheckin, Profile, Recipe,
  Settings, StepLog, WeightLog, WorkoutPlan, WorkoutSession, WaterLog, Exercise,
} from './lib/types'

interface State {
  ready: boolean
  online: boolean
  error: string | null
  profile: Profile | null
  settings: Settings
  goal: Goal | null
  target: NutritionTarget | null
  mealTypes: MealType[]
  foods: Food[]
  recipes: Recipe[]
  foodLogs: FoodLog[]
  plans: WorkoutPlan[]
  sessions: WorkoutSession[]
  weights: WeightLog[]
  steps: StepLog[]
  insights: AIInsight[]
  checkins: PhysiqueCheckin[]
  water: WaterLog[]
  customExercises: Exercise[]
}

const EMPTY: State = {
  ready: false, online: true, error: null,
  profile: null, settings: SEED_SETTINGS, goal: null, target: null,
  mealTypes: [], foods: [], recipes: [], foodLogs: [], plans: [], sessions: [],
  weights: [], steps: [], insights: [], checkins: [], water: [], customExercises: [],
}

interface Ctx extends State {
  reload: () => Promise<void>
  save: <T extends db.Row>(table: db.Table, row: T) => Promise<void>
  del: (table: db.Table, id: string) => Promise<void>
  setTheme: (t: 'dark' | 'light') => void
  theme: 'dark' | 'light'
}

const StoreCtx = createContext<Ctx | null>(null)

function applyTheme(t: 'dark' | 'light') {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0C0709' : '#F3EDE6')
  localStorage.setItem('forge:theme', t)
}

export const ACCENTS = {
  ember: ['#FF6B2C', '#C4461A', '#1A0A03'],
  lime: ['#B8E54A', '#7FA32A', '#121A03'],
  sky: ['#6E9BFF', '#3A64C8', '#03081A'],
  violet: ['#A78BFA', '#6D4FD6', '#0E061A'],
  rose: ['#FF5C8A', '#C42D5A', '#1A030A'],
} as const
export type Accent = keyof typeof ACCENTS

export function applyAccent(a: Accent) {
  const [main, deep, ink] = ACCENTS[a] ?? ACCENTS.ember
  const r = document.documentElement.style
  r.setProperty('--accent', main); r.setProperty('--accent-strong', main)
  r.setProperty('--accent-deep', deep); r.setProperty('--accent-ink', ink)
  try { localStorage.setItem('forge:accent', a) } catch { /* private mode */ }
}
try { applyAccent((localStorage.getItem('forge:accent') as Accent) || 'ember') } catch { /* no storage */ }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(EMPTY)
  const [theme, setThemeState] = useState<'dark' | 'light'>(
    () => (localStorage.getItem('forge:theme') as 'dark' | 'light') ?? 'dark')

  useEffect(() => { applyTheme(theme) }, [theme])

  useEffect(() => {
    const on = () => setState(s => ({ ...s, online: true }))
    const off = () => setState(s => ({ ...s, online: false }))
    window.addEventListener('online', on); window.addEventListener('offline', off)
    setState(s => ({ ...s, online: navigator.onLine }))
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const reload = useCallback(async () => {
    try {
      await db.flushOutbox().catch(() => 0) // queued offline saves go first, so the reload includes them
      // First run for this account/device: plant the seed data so the UI is meaningful.
      const mealTypes = await db.list<MealType>('meal_types')
      if (mealTypes.length === 0) {
        await db.putMany('meal_types', SEED_MEAL_TYPES)
        await db.putMany('foods', SEED_FOODS)
        await db.putMany('recipes', SEED_RECIPES as unknown as db.Row[])
        await db.putMany('workout_plans', [SEED_PLAN] as unknown as db.Row[])
        await db.put('settings', SEED_SETTINGS as unknown as db.Row)
      }

      // Tables added in v2 may not exist on an older database yet; they must not take the app down.
      const optional = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[])
      const [settingsRows, goals, targets, mts, foods, recipes, foodLogs, plans, sessions, weights, steps, insights, checkins, water, customExercises] =
        await Promise.all([
          db.list<Settings>('settings'), db.list<Goal>('goals'), db.list<NutritionTarget>('nutrition_targets'),
          db.list<MealType>('meal_types'), db.list<Food>('foods'), db.list<Recipe>('recipes'),
          db.list<FoodLog>('food_logs'), db.list<WorkoutPlan>('workout_plans'), db.list<WorkoutSession>('workout_sessions'),
          db.list<WeightLog>('weight_logs'), db.list<StepLog>('step_logs'), db.list<AIInsight>('ai_insights'), db.list<PhysiqueCheckin>('physique_checkins'),
          optional(db.list<WaterLog>('water_logs')), optional(db.list<Exercise>('exercises')),
        ])

      let profile = (await db.list<Profile>('profiles'))[0] ?? null
      if (!profile && db.localMode) {
        profile = { id: 'local', display_name: '', sex: 'male', age: 25, height_cm: 175, theme: 'dark' }
        await db.put('profiles', profile as unknown as db.Row)
      }

      const settings = { ...SEED_SETTINGS, ...(settingsRows[0] ?? {}) }
      setDayStartHour(settings.day_start_hour ?? 4)
      setState({
        ready: true, online: navigator.onLine, error: null,
        profile,
        settings,
        goal: goals.sort(byUpdated).at(-1) ?? null,
        target: targets.sort(byUpdated).at(-1) ?? null,
        mealTypes: mts.sort((a, b) => a.position - b.position),
        foods, recipes, foodLogs, plans, sessions, weights, steps,
        insights: insights.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        checkins: checkins.sort((a, b) => b.date.localeCompare(a.date)),
        water, customExercises,
      })
    } catch (e) {
      setState(s => ({ ...s, ready: true, error: e instanceof Error ? e.message : 'Could not load your data.' }))
    }
  }, [])

  useEffect(() => { void reload() }, [reload])
  // Offline saves upload as soon as the connection is back, then the screen refreshes from the server.
  useEffect(() => {
    const back = () => { void db.flushOutbox().then(() => reload()) }
    window.addEventListener('online', back)
    return () => window.removeEventListener('online', back)
  }, [reload])

  /**
   * Optimistic writes: the UI updates in the same frame, the network write follows. A failed write
   * reloads from the source of truth so the screen never shows data that was not stored.
   */
  const save = useCallback(async <T extends db.Row>(table: db.Table, input: T) => {
    // New food logs get created_at = now (the streak's back-fill rule needs it).
    const row = table === 'food_logs' && !(input as { created_at?: string }).created_at ? { ...input, created_at: new Date().toISOString() } : input
    setState(s => applyLocal(s, table, row))
    try {
      await db.put(table, row)
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : 'Save failed. Your entry was not stored.' }))
      void reload()
      throw e
    }
  }, [reload])

  const del = useCallback(async (table: db.Table, id: string) => {
    setState(s => applyLocal(s, table, { id }, true))
    try { await db.remove(table, id) } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : 'Delete failed.' }))
      void reload()
    }
  }, [reload])

  const value = useMemo<Ctx>(() => ({
    ...state, reload, save, del, theme, setTheme: setThemeState,
  }), [state, reload, save, del, theme])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

const LIST_KEY: Partial<Record<db.Table, keyof State>> = {
  meal_types: 'mealTypes', foods: 'foods', recipes: 'recipes', food_logs: 'foodLogs',
  workout_plans: 'plans', workout_sessions: 'sessions', weight_logs: 'weights', step_logs: 'steps',
  ai_insights: 'insights', physique_checkins: 'checkins', water_logs: 'water', exercises: 'customExercises',
}

/** Mirror a write into in-memory state so the UI never waits on the network. */
function applyLocal(s: State, table: db.Table, row: db.Row, remove = false): State {
  const key = LIST_KEY[table]
  if (key) {
    const list = (s[key] as unknown as db.Row[]).filter(r => r.id !== row.id)
    return { ...s, [key]: remove ? list : [...list, row] }
  }
  if (remove) return s
  switch (table) {
    case 'settings': {
      const settings = { ...s.settings, ...(row as unknown as Settings) }
      setDayStartHour(settings.day_start_hour ?? 4)
      return { ...s, settings }
    }
    case 'profiles': return { ...s, profile: row as unknown as Profile }
    case 'goals': return { ...s, goal: row as unknown as Goal }
    case 'nutrition_targets': return { ...s, target: row as unknown as NutritionTarget }
    default: return s
  }
}

function byUpdated(a: { updated_at?: string }, b: { updated_at?: string }) {
  return (a.updated_at ?? '').localeCompare(b.updated_at ?? '')
}

export function useStore(): Ctx {
  const ctx = useContext(StoreCtx)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

/** Today's date, recomputed when the app regains focus (so a phone left open rolls over). */
export function useToday() {
  const [d, setD] = useState(todayISO)
  useEffect(() => {
    const tick = () => setD(todayISO())
    window.addEventListener('focus', tick)
    const i = setInterval(tick, 60_000)
    return () => { window.removeEventListener('focus', tick); clearInterval(i) }
  }, [])
  return d
}

/**
 * The date the user is looking at / logging into. `null` follows the logical today (and rolls over
 * by itself); picking another day pins it until they come back to today.
 */
const ActiveDateCtx = createContext<{ pinned: string | null; setPinned: (d: string | null) => void } | null>(null)

export function ActiveDateProvider({ children }: { children: ReactNode }) {
  const [pinned, setPinned] = useState<string | null>(null)
  const v = useMemo(() => ({ pinned, setPinned }), [pinned])
  return <ActiveDateCtx.Provider value={v}>{children}</ActiveDateCtx.Provider>
}

export function useActiveDate() {
  const ctx = useContext(ActiveDateCtx)
  const today = useToday()
  const date = ctx?.pinned && ctx.pinned <= today ? ctx.pinned : today
  return {
    date, today, isToday: date === today,
    setDate: (d: string) => ctx?.setPinned(d >= today ? null : d),
  }
}

export const authEnabled = supabaseConfigured
export { supabase }
