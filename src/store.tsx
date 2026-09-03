import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as db from './lib/db'
import { supabase, supabaseConfigured } from './lib/supabase'
import { SEED_FOODS, SEED_MEAL_TYPES, SEED_PLAN, SEED_RECIPES, SEED_SETTINGS } from './lib/seed'
import { today as todayISO } from './lib/calc'
import type {
  AIInsight, Food, FoodLog, Goal, MealType, NutritionTarget, PhysiqueCheckin, Profile, Recipe,
  Settings, StepLog, WeightLog, WorkoutPlan, WorkoutSession,
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
}

const EMPTY: State = {
  ready: false, online: true, error: null,
  profile: null, settings: SEED_SETTINGS, goal: null, target: null,
  mealTypes: [], foods: [], recipes: [], foodLogs: [], plans: [], sessions: [],
  weights: [], steps: [], insights: [], checkins: [],
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
      // First run for this account/device: plant the seed data so the UI is meaningful.
      const mealTypes = await db.list<MealType>('meal_types')
      if (mealTypes.length === 0) {
        await db.putMany('meal_types', SEED_MEAL_TYPES)
        await db.putMany('foods', SEED_FOODS)
        await db.putMany('recipes', SEED_RECIPES as unknown as db.Row[])
        await db.putMany('workout_plans', [SEED_PLAN] as unknown as db.Row[])
        await db.put('settings', SEED_SETTINGS as unknown as db.Row)
      }

      const [settingsRows, goals, targets, mts, foods, recipes, foodLogs, plans, sessions, weights, steps, insights, checkins] =
        await Promise.all([
          db.list<Settings>('settings'), db.list<Goal>('goals'), db.list<NutritionTarget>('nutrition_targets'),
          db.list<MealType>('meal_types'), db.list<Food>('foods'), db.list<Recipe>('recipes'),
          db.list<FoodLog>('food_logs'), db.list<WorkoutPlan>('workout_plans'), db.list<WorkoutSession>('workout_sessions'),
          db.list<WeightLog>('weight_logs'), db.list<StepLog>('step_logs'), db.list<AIInsight>('ai_insights'), db.list<PhysiqueCheckin>('physique_checkins'),
        ])

      let profile = (await db.list<Profile>('profiles'))[0] ?? null
      if (!profile && db.localMode) {
        profile = { id: 'local', display_name: '', sex: 'male', age: 25, height_cm: 175, theme: 'dark' }
        await db.put('profiles', profile as unknown as db.Row)
      }

      setState({
        ready: true, online: navigator.onLine, error: null,
        profile,
        settings: { ...SEED_SETTINGS, ...(settingsRows[0] ?? {}) },
        goal: goals.sort(byUpdated).at(-1) ?? null,
        target: targets.sort(byUpdated).at(-1) ?? null,
        mealTypes: mts.sort((a, b) => a.position - b.position),
        foods, recipes, foodLogs, plans, sessions, weights, steps,
        insights: insights.sort((a, b) => b.created_at.localeCompare(a.created_at)),
        checkins: checkins.sort((a, b) => b.date.localeCompare(a.date)),
      })
    } catch (e) {
      setState(s => ({ ...s, ready: true, error: e instanceof Error ? e.message : 'Could not load your data.' }))
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const save = useCallback(async <T extends db.Row>(table: db.Table, row: T) => {
    try {
      await db.put(table, row)
      await reload()
    } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : 'Save failed. Your entry was not stored.' }))
      throw e
    }
  }, [reload])

  const del = useCallback(async (table: db.Table, id: string) => {
    try { await db.remove(table, id); await reload() } catch (e) {
      setState(s => ({ ...s, error: e instanceof Error ? e.message : 'Delete failed.' }))
    }
  }, [reload])

  const value = useMemo<Ctx>(() => ({
    ...state, reload, save, del, theme, setTheme: setThemeState,
  }), [state, reload, save, del, theme])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
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

export const authEnabled = supabaseConfigured
export { supabase }
