import { setProgress, toISO } from './calc'
import type { FoodLog, Goal, ISODate, MealType, Settings, StepLog, WorkoutPlan, WorkoutSession } from './types'

/**
 * FORGE streak, plan-aware and forgiving (Duolingo-style). Same rules as native logic/Streak.kt.
 *
 * - A day KEEPS the streak when the user showed up: logged food, finished a workout or hit the step goal.
 *   (The 60 % adherence score is for the separate "Perfect" stats, not the streak.)
 * - A planned REST day never breaks it, logged or not: a chosen rest weekday, or (no rest days chosen) a day off
 *   inside the plan's normal gap (7 − days per week in a row) or after the week's planned workouts are done.
 * - A MISS uses a freeze: 2 per calendar month, applied automatically. A miss with no freeze left breaks it.
 * - Today never breaks it: an unfinished today is simply not counted yet.
 * - Back-filled logs only count for days up to 7 days before they were entered (no rebuilding old streaks).
 * - REPAIR: a break in the last 2 days, with no freeze left, can be repaired once a month by a bonus day
 *   (all meals logged + a workout or the step goal). Repaired days count like freezes.
 *
 * The streak length counts days the user showed up; rest, frozen and repaired days keep it alive without adding.
 */
export const FREEZES_PER_MONTH = 2
export const BACKFILL_DAYS = 7

export interface StreakInput {
  today: ISODate
  /** Every day that has a food log, session or steps, with when that entry was created (ms). */
  entries: { date: ISODate; createdAt: number; kind: 'food' | 'workout' | 'steps'; done: boolean }[]
  /** Workouts finished, by date (for the plan's rest logic). */
  workoutDates: ISODate[]
  /** Rest weekdays the user chose (0 = Sunday); empty = infer from the plan. */
  restDays: number[]
  daysPerWeek: number
  weekStart: 0 | 1
  /** Days covered by a completed repair. */
  repaired: ISODate[]
}

export type DayKind = 'shown' | 'rest' | 'frozen' | 'repaired' | 'miss' | 'before'

export interface StreakState {
  current: number
  best: number
  freezesLeft: number
  /** What each day from the first logged day to yesterday (and today if shown up) was. */
  days: Map<ISODate, DayKind>
  /** A break in the last 2 days that can be repaired: the missed days and the streak they ended. */
  repairable: { days: ISODate[]; previous: number } | null
}

const addDays = (d: ISODate, n: number) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return toISO(x) }
const dow = (d: ISODate) => new Date(d + 'T00:00:00').getDay()
const dayMs = (d: ISODate) => new Date(d + 'T00:00:00').getTime()

/** Did the user show up on `date`? Entries made more than BACKFILL_DAYS after the day don't count. */
function shownUp(input: StreakInput, date: ISODate): boolean {
  const limit = dayMs(date) + (BACKFILL_DAYS + 1) * 86_400_000
  return input.entries.some(e => e.date === date && e.done && e.createdAt <= limit)
}

/** A planned rest day: chosen weekday, the plan's normal gap after a workout, or the week's workouts already done. */
export function isRestDay(input: StreakInput, date: ISODate): boolean {
  if (input.restDays.length) return input.restDays.includes(dow(date))
  const dpw = Math.min(7, Math.max(1, input.daysPerWeek || 0))
  const gap = 7 - dpw
  const before = input.workoutDates.filter(d => d < date).sort()
  const last = before[before.length - 1]
  if (last && (dayMs(date) - dayMs(last)) / 86_400_000 <= gap) return true
  // Week (by the user's week start) already has its planned number of workouts.
  const back = (dow(date) - input.weekStart + 7) % 7
  const weekStart = addDays(date, -back)
  return before.filter(d => d >= weekStart).length >= dpw
}

export function computeStreak(input: StreakInput): StreakState {
  const days = new Map<ISODate, DayKind>()
  // Start at the first day that honestly counts (a late back-fill can't start a streak in the past).
  const first = [...new Set(input.entries.map(e => e.date))].sort().find(d => shownUp(input, d))
  const thisMonth = input.today.slice(0, 7)
  if (!first || first > input.today) return { current: 0, best: 0, freezesLeft: FREEZES_PER_MONTH, days, repairable: null }

  const used = new Map<string, number>()
  const repaired = new Set(input.repaired)
  let run = 0, best = 0
  let lastBreak: { days: ISODate[]; previous: number } | null = null
  let missRun: ISODate[] = []
  let runBeforeMiss = 0

  for (let d = first; d <= input.today; d = addDays(d, 1)) {
    const shown = shownUp(input, d)
    // Today counts only once the user has shown up; until the day ends it can't break anything.
    if (d === input.today && !shown) break
    let kind: DayKind
    if (shown) kind = 'shown'
    else if (isRestDay(input, d)) kind = 'rest'
    else if (repaired.has(d)) kind = 'repaired'
    else if ((used.get(d.slice(0, 7)) ?? 0) < FREEZES_PER_MONTH) { kind = 'frozen'; used.set(d.slice(0, 7), (used.get(d.slice(0, 7)) ?? 0) + 1) }
    else kind = 'miss'
    days.set(d, kind)

    if (kind === 'shown') { run++; missRun = [] }
    else if (kind === 'rest') missRun = []
    else if (kind === 'miss') {
      if (!missRun.length) runBeforeMiss = run
      missRun.push(d)
      lastBreak = { days: [...missRun], previous: runBeforeMiss }
      run = 0
    }
    best = Math.max(best, run)
  }

  // Repairable: the most recent break (1-2 missed days) ended no more than 2 days ago.
  // Only worth repairing a streak of 3+ days (a 1-2 day streak breaking is noise, not a loss).
  const repairable = lastBreak && lastBreak.previous >= 3 && lastBreak.days.length <= 2
    && lastBreak.days[lastBreak.days.length - 1] >= addDays(input.today, -2) ? lastBreak : null

  return { current: run, best, freezesLeft: Math.max(0, FREEZES_PER_MONTH - (used.get(thisMonth) ?? 0)), days, repairable }
}

/** Today's bonus that repairs a break: 3+ meals (or every meal type, if fewer) AND (a finished workout OR the step goal). */
export function repairEarned(args: { mealTypeIds: string[]; loggedMealIds: string[]; workoutDone: boolean; stepsDone: boolean }): boolean {
  const need = Math.min(3, args.mealTypeIds.length)
  const meals = new Set(args.loggedMealIds.filter(id => args.mealTypeIds.includes(id))).size
  return need > 0 && meals >= need && (args.workoutDone || args.stepsDone)
}

// ---- building the input from app state ---------------------------------------------------------------------


interface AppState {
  foodLogs: FoodLog[]; sessions: WorkoutSession[]; steps: StepLog[]; settings: Settings
  goal: Goal | null; plans: WorkoutPlan[]; mealTypes: MealType[]
}

/** Days covered by a completed repair, per device. */
export const repairs = {
  get(): ISODate[] { try { return JSON.parse(localStorage.getItem('forge:streak-repaired') ?? '[]') } catch { return [] } },
  usedThisMonth(today: ISODate) { return repairs.get().some(d => d.startsWith(today.slice(0, 7) + '#')) },
  add(days: ISODate[], today: ISODate) {
    try { localStorage.setItem('forge:streak-repaired', JSON.stringify([...repairs.get(), ...days, `${today.slice(0, 7)}#used`].slice(-60))) } catch { /* private mode */ }
  },
}

/** Finished and actually did something (an empty finished session isn't a workout). */
const trained = (x: WorkoutSession) => { if (!x.finished_at) return false; const { done, total } = setProgress(x); return total === 0 || done > 0 }

export function streakInput(s: AppState, today: ISODate): StreakInput {
  // No created_at (local/demo rows, or not yet synced): treat the entry as made on its own day, never as "now".
  const created = (x: { created_at?: string; date: ISODate }) => (x.created_at ? Date.parse(x.created_at) : new Date(x.date + 'T12:00:00').getTime())
  return {
    today,
    entries: [
      ...s.foodLogs.map(l => ({ date: l.date, createdAt: created(l), kind: 'food' as const, done: true })),
      ...s.sessions.map(x => ({ date: x.date, createdAt: x.started_at ? Date.parse(x.started_at) : Date.now(), kind: 'workout' as const, done: trained(x) })),
      ...s.steps.map(x => ({ date: x.date, createdAt: new Date(x.date + 'T23:00:00').getTime(), kind: 'steps' as const, done: x.steps >= s.settings.step_goal })),
    ],
    workoutDates: s.sessions.filter(trained).map(x => x.date),
    restDays: s.settings.rest_days,
    // The plan they actually follow decides the rest gap; the Goals number only when there is no plan.
    daysPerWeek: s.plans.find(p => p.active)?.days.length || s.goal?.training_days_per_week || 4,
    weekStart: s.settings.week_start ?? 1,
    repaired: repairs.get().filter(d => !d.includes('#')),
  }
}

export function streakFor(s: AppState, today: ISODate) {
  const st = computeStreak(streakInput(s, today))
  const repairOffer = st.repairable && !repairs.usedThisMonth(today) ? st.repairable : null
  const todaysLogs = s.foodLogs.filter(l => l.date === today)
  const earned = repairEarned({
    mealTypeIds: s.mealTypes.map(m => m.id), loggedMealIds: todaysLogs.map(l => l.meal_type_id),
    workoutDone: s.sessions.some(x => x.date === today && trained(x)),
    stepsDone: (s.steps.find(x => x.date === today)?.steps ?? 0) >= s.settings.step_goal,
  })
  return { ...st, repairOffer, repairEarned: earned }
}

/** Days whose logs were all entered too late (back-filled > BACKFILL_DAYS later): shown faded, never counted. */
export function lateDays(input: StreakInput): Set<ISODate> {
  const limit = (d: ISODate) => dayMs(d) + (BACKFILL_DAYS + 1) * 86_400_000
  const late = new Set(input.entries.filter(e => e.done && e.createdAt > limit(e.date)).map(e => e.date))
  for (const e of input.entries) if (e.done && e.createdAt <= limit(e.date)) late.delete(e.date)
  return late
}

/**
 * Month numbers for the Adherence screen. "Days logged" = days with any food, workout or steps (not every calendar day).
 * "Month average" starts at the user's first logged day and skips planned rest days and the unfinished today.
 */
export function monthStats(args: { monthDates: ISODate[]; logged: Set<ISODate>; days: Map<ISODate, DayKind>; today: ISODate; score: (d: ISODate) => number }) {
  const firstUse = [...args.logged].sort()[0]
  const scored = args.monthDates.filter(d => firstUse && d >= firstUse && d !== args.today && args.days.get(d) !== 'rest')
  const scores = scored.map(args.score)
  return {
    avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    perfect: scores.filter(x => x >= 0.999).length,
    loggedDays: args.monthDates.filter(d => args.logged.has(d)).length,
  }
}
