import type {
  ActivityLevel, FoodLog, Goal, GoalMode, ISODate, NutritionTarget, Sex, Settings,
  WorkoutSession, Food, Unit,
} from './types'

export const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, athlete: 1.9,
}

/** Mifflin-St Jeor. */
export function bmr(sex: Sex, weightKg: number, heightCm: number, age: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age
  return Math.round(sex === 'male' ? base + 5 : base - 161)
}

export function tdee(sex: Sex, weightKg: number, heightCm: number, age: number, activity: ActivityLevel, avgSteps = 0): number {
  // Steps beyond the level's implied baseline add ~0.04 kcal/kg per 1000 steps.
  const stepBonus = Math.max(0, avgSteps - 5000) / 1000 * 0.04 * weightKg * 10
  return Math.round(bmr(sex, weightKg, heightCm, age) * ACTIVITY_FACTOR[activity] + stepBonus)
}

export const KCAL_PER_KG = 7700

export interface TargetInput {
  sex: Sex; age: number; heightCm: number
  weightKg: number; targetWeightKg: number
  activity: ActivityLevel; avgSteps: number
  mode: GoalMode; rateKgPerWeek: number
}

export interface TargetResult {
  maintenance: number
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  rate_kg_per_week: number
  weeks_to_target: number | null
  warnings: string[]
}

/** Deterministic baseline. AI only explains/personalises this — it never replaces it. */
export function calcTargets(i: TargetInput): TargetResult {
  const warnings: string[] = []
  const maintenance = tdee(i.sex, i.weightKg, i.heightCm, i.age, i.activity, i.avgSteps)

  let rate = Math.abs(i.rateKgPerWeek || 0)
  const maxRate = i.mode === 'cut' ? Math.min(1.0, i.weightKg * 0.01) : 0.5
  if (rate > maxRate) { rate = maxRate; warnings.push(`Rate capped at ${maxRate.toFixed(2)} kg/week for safety.`) }
  if (i.mode === 'maintain') rate = 0

  const signed = i.mode === 'cut' ? -rate : i.mode === 'bulk' ? rate : 0
  let calories = Math.round(maintenance + (signed * KCAL_PER_KG) / 7)

  const floor = i.sex === 'male' ? 1500 : 1200
  if (calories < floor) { calories = floor; warnings.push(`Calories raised to the ${floor} kcal floor.`) }
  if (calories > maintenance * 1.35) { calories = Math.round(maintenance * 1.35); warnings.push('Surplus capped at 35% over maintenance.') }

  // Protein anchored to target bodyweight (avoids absurd values at high body fat).
  const proteinAnchor = i.mode === 'cut' ? Math.min(i.weightKg, Math.max(i.targetWeightKg, i.weightKg * 0.8)) : i.weightKg
  const protein_g = Math.round(clamp(proteinAnchor * (i.mode === 'cut' ? 2.2 : 1.9), 60, 260))
  const fat_g = Math.round(clamp((calories * 0.25) / 9, i.weightKg * 0.6, i.weightKg * 1.4))
  const carbs_g = Math.max(30, Math.round((calories - protein_g * 4 - fat_g * 9) / 4))

  const delta = Math.abs(i.targetWeightKg - i.weightKg)
  const weeks_to_target = rate > 0 && delta > 0 ? Math.ceil(delta / rate) : null

  if (i.targetWeightKg <= 0 || i.targetWeightKg > 400) warnings.push('Target weight looks invalid.')
  if (i.mode === 'cut' && i.targetWeightKg > i.weightKg) warnings.push('Cut selected but target weight is above current weight.')
  if (i.mode === 'bulk' && i.targetWeightKg < i.weightKg) warnings.push('Bulk selected but target weight is below current weight.')

  return { maintenance, calories, protein_g, carbs_g, fat_g, rate_kg_per_week: rate, weeks_to_target, warnings }
}

export function clamp(n: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, n)) }

export function isValidTarget(t: Pick<NutritionTarget, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>): boolean {
  return t.calories >= 800 && t.calories <= 8000
    && t.protein_g >= 0 && t.protein_g <= 400
    && t.carbs_g >= 0 && t.carbs_g <= 1200
    && t.fat_g >= 0 && t.fat_g <= 400
}

/** Scale a food's stored nutrition (per `base` `unit`) to an arbitrary quantity. */
export function scaleFood(food: Food, qty: number, unit?: Unit) {
  const factor = (qty || 0) / (food.base || 1)
  const u: Unit = unit ?? food.unit
  return {
    unit: u,
    calories: round1(food.calories * factor),
    protein_g: round1(food.protein_g * factor),
    carbs_g: round1(food.carbs_g * factor),
    fat_g: round1(food.fat_g * factor),
  }
}

export function round1(n: number) { return Math.round(n * 10) / 10 }

export interface Totals { calories: number; protein_g: number; carbs_g: number; fat_g: number }
export const ZERO_TOTALS: Totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }

export function sumTotals(logs: Pick<FoodLog, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>[]): Totals {
  return logs.reduce<Totals>((a, l) => ({
    calories: a.calories + (l.calories || 0),
    protein_g: a.protein_g + (l.protein_g || 0),
    carbs_g: a.carbs_g + (l.carbs_g || 0),
    fat_g: a.fat_g + (l.fat_g || 0),
  }), { ...ZERO_TOTALS })
}

export function totalsByMeal(logs: FoodLog[]): Record<string, Totals> {
  const out: Record<string, Totals> = {}
  for (const l of logs) {
    const t = out[l.meal_type_id] ?? { ...ZERO_TOTALS }
    t.calories += l.calories; t.protein_g += l.protein_g; t.carbs_g += l.carbs_g; t.fat_g += l.fat_g
    out[l.meal_type_id] = t
  }
  return out
}

export type Component = 'complete' | 'partial' | 'incomplete' | 'na'

export interface DayAdherence {
  diet: Component
  workout: Component
  steps: Component
  score: number // 0..1
}

export const DEFAULT_WEIGHTS = { diet: 0.4, workout: 0.4, steps: 0.2 }

/**
 * Deterministic daily completion.
 * - diet: complete when calories AND protein are inside tolerance of target; partial at >=60% of calories.
 * - workout: complete when a session for that date is finished; rest day => 'na' (never counted as failed).
 * - steps: complete at goal, partial at >=60%.
 * Weights of components that are 'na' are redistributed across the remaining components.
 */
export function dayAdherence(args: {
  date: ISODate
  target: NutritionTarget | null
  totals: Totals
  hasFoodLogs: boolean
  session: WorkoutSession | null
  steps: number | null
  settings: Settings
}): DayAdherence {
  const { settings, target, totals, session, steps } = args
  const tol = settings.diet_tolerance ?? 0.1

  let diet: Component = 'na'
  if (target && args.hasFoodLogs) {
    const calOk = Math.abs(totals.calories - target.calories) <= target.calories * tol
    const proOk = totals.protein_g >= target.protein_g * (1 - tol)
    diet = calOk && proOk ? 'complete'
      : totals.calories >= target.calories * 0.6 ? 'partial' : 'incomplete'
  } else if (target) {
    diet = 'incomplete'
  }

  const dow = new Date(args.date + 'T00:00:00').getDay()
  const isRest = settings.rest_days.includes(dow)
  let workout: Component
  if (session?.finished_at) workout = 'complete'
  else if (session) workout = 'partial'
  else workout = isRest ? 'na' : 'incomplete'

  let stepC: Component = 'incomplete'
  if (steps == null) stepC = 'na'
  else if (steps >= settings.step_goal) stepC = 'complete'
  else if (steps >= settings.step_goal * 0.6) stepC = 'partial'

  const w = settings.adherence_weights ?? DEFAULT_WEIGHTS
  const parts: [Component, number][] = [[diet, w.diet], [workout, w.workout], [stepC, w.steps]]
  const active = parts.filter(([c]) => c !== 'na')
  const totalW = active.reduce((a, [, x]) => a + x, 0)
  const score = totalW === 0 ? 0 : active.reduce((a, [c, x]) => a + x * (c === 'complete' ? 1 : c === 'partial' ? 0.5 : 0), 0) / totalW

  return { diet, workout, steps: stepC, score: Math.round(score * 100) / 100 }
}

/** Consecutive days ending today (or yesterday, so an unfinished today does not break it). */
export function streak(dates: ISODate[], today: ISODate, ok: (d: ISODate) => boolean): number {
  let n = 0
  const cur = new Date(today + 'T00:00:00')
  if (!ok(today)) cur.setDate(cur.getDate() - 1)
  for (;;) {
    const key = toISO(cur)
    if (!dates.includes(key) || !ok(key)) break
    n++
    cur.setDate(cur.getDate() - 1)
  }
  return n
}

export function bestStreak(dates: ISODate[], ok: (d: ISODate) => boolean): number {
  const sorted = [...dates].sort()
  let best = 0, run = 0, prev: Date | null = null
  for (const d of sorted) {
    if (!ok(d)) { run = 0; prev = null; continue }
    const cur = new Date(d + 'T00:00:00')
    run = prev && (cur.getTime() - prev.getTime()) === 86400000 ? run + 1 : 1
    best = Math.max(best, run)
    prev = cur
  }
  return best
}

export function toISO(d: Date): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function today(): ISODate { return toISO(new Date()) }
export function addDays(date: ISODate, n: number): ISODate {
  const d = new Date(date + 'T00:00:00'); d.setDate(d.getDate() + n); return toISO(d)
}
export function daysBack(n: number, from = today()): ISODate[] {
  return Array.from({ length: n }, (_, i) => addDays(from, -(n - 1 - i)))
}

export function sessionVolume(s: WorkoutSession): number {
  return s.exercises.reduce((a, e) => a + e.sets.reduce(
    (b, st) => b + (st.done && st.weight_kg && st.reps ? st.weight_kg * st.reps : 0), 0), 0)
}
export function sessionSets(s: WorkoutSession): number {
  return s.exercises.reduce((a, e) => a + e.sets.filter(st => st.done).length, 0)
}

export function goalProgress(g: Goal, currentWeight: number): number {
  const span = g.target_weight_kg - startWeight(g)
  if (Math.abs(span) < 0.01) return 1
  return clamp((currentWeight - startWeight(g)) / span, 0, 1)
}
function startWeight(g: Goal) { return g.current_weight_kg }

/** Exponentially weighted trend line over weight measurements (keeps raw points intact). */
export function trend(points: { date: ISODate; weight_kg: number }[], alpha = 0.25) {
  let ema: number | null = null
  return points.map(p => {
    ema = ema == null ? p.weight_kg : alpha * p.weight_kg + (1 - alpha) * ema
    return { ...p, trend: Math.round(ema * 100) / 100 }
  })
}
