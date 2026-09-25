import type { ProgressionRule, SessionExercise, WorkoutSession, WorkoutSet } from './types'

/**
 * Training maths. Pure and deterministic — see training.test.ts.
 */

/** Estimated one-rep max (Epley). Refuses to guess from high-rep sets, where the formula falls apart. */
export function e1rm(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || reps < 1 || reps > 12) return null
  return reps === 1 ? weight : Math.round(weight * (1 + reps / 30) * 10) / 10
}

const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25]

/** What goes on each side of the bar. `null` when the total can't be built from standard plates. */
export function platesPerSide(total: number, bar = 20, plates = PLATES): number[] | null {
  let side = Math.round(((total - bar) / 2) * 100) / 100
  if (side < 0) return null
  const out: number[] = []
  for (const p of plates) {
    while (side >= p - 1e-9) { out.push(p); side = Math.round((side - p) * 100) / 100 }
  }
  return side === 0 ? out : null
}

export function parseReps(reps: string): [number, number] | null {
  const m = reps.match(/(\d+)\s*(?:[-–to]+\s*(\d+))?/)
  if (!m) return null
  const lo = Number(m[1]), hi = Number(m[2] ?? m[1])
  return lo > 0 && hi >= lo ? [lo, hi] : null
}

export const working = (sets: WorkoutSet[]) => sets.filter(s => s.done && !s.warmup)

/** Most recent sessions of one exercise, newest first, excluding deloads (they never set the baseline). */
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string, before?: string) {
  return sessions
    .filter(s => !s.deload && (!before || s.date < before))
    .map(s => ({ date: s.date, ex: s.exercises.find(e => e.exercise_id === exerciseId) }))
    .filter((x): x is { date: string; ex: SessionExercise } => Boolean(x.ex && working(x.ex.sets).length))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export interface Target { weight: number | null; reps: number; why: string }

/**
 * Next session's target. Missed reps never add load; three stalls in a row deload 10 %.
 * Bodyweight work progresses in reps.
 */
export function nextTarget(opts: {
  history: { date: string; ex: SessionExercise }[]
  reps: string
  rule?: ProgressionRule
  increment?: number
  bodyweight?: boolean
}): Target | null {
  const range = parseReps(opts.reps)
  if (!range) return null
  const [lo, hi] = range
  const last = opts.history[0]
  if (!last) return { weight: null, reps: lo, why: 'First time — pick a weight you can lift for the top of the range with 1–2 reps to spare.' }
  const sets = working(last.ex.sets)
  const topW = Math.max(...sets.map(s => s.weight_kg ?? 0))
  const top = sets.filter(s => (s.weight_kg ?? 0) === topW)
  const minReps = Math.min(...top.map(s => s.reps ?? 0))
  const rule = opts.rule ?? (lo === hi ? 'linear' : 'double')
  const inc = opts.increment ?? 2.5

  if (opts.bodyweight || rule === 'reps') {
    return minReps >= hi
      ? { weight: topW || null, reps: hi + 1, why: `Hit ${hi} on every set — aim for ${hi + 1}.` }
      : { weight: topW || null, reps: Math.max(lo, minReps + 1), why: `Build to ${hi} reps on every set.` }
  }
  if (rule === 'none') return { weight: topW, reps: lo, why: 'Progression off for this exercise.' }

  const stalls = opts.history.slice(0, 3).filter(h => {
    const w = working(h.ex.sets)
    return w.length && Math.min(...w.map(s => s.reps ?? 0)) < lo
  }).length
  if (stalls >= 3) {
    const w = Math.max(0, Math.round((topW * 0.9) / inc) * inc)
    return { weight: w, reps: lo, why: `Missed ${lo} reps three sessions running — deload 10 % and build back.` }
  }
  if (minReps >= hi) {
    return { weight: topW + inc, reps: lo, why: `+${inc} kg · hit ${top.map(s => s.reps).join(', ')} last time.` }
  }
  if (rule === 'double') {
    return { weight: topW, reps: Math.min(hi, Math.max(lo, minReps + 1)), why: `Same weight — add a rep until every set reaches ${hi}.` }
  }
  return { weight: topW, reps: lo, why: `Repeat ${topW} kg — last time's lowest set was ${minReps} reps.` }
}

/** Best estimated 1RM an exercise has ever reached before `date` (backfilled sessions count only for their own date). */
export function bestE1rm(sessions: WorkoutSession[], exerciseId: string, before: string): number {
  let best = 0
  for (const s of sessions) {
    if (s.date >= before) continue
    for (const e of s.exercises) if (e.exercise_id === exerciseId)
      for (const st of working(e.sets)) best = Math.max(best, e1rm(st.weight_kg, st.reps) ?? 0)
  }
  return best
}

/** Sets per muscle over the last `days` (warm-ups excluded). Secondary muscles count half. */
export function muscleSets(sessions: WorkoutSession[], today: string, days: number, muscleOf: (e: SessionExercise) => { muscle?: string; secondary?: string[] } | undefined) {
  const from = new Date(today + 'T00:00:00'); from.setDate(from.getDate() - days + 1)
  const since = from.toISOString().slice(0, 10)
  const out: Record<string, number> = {}
  for (const s of sessions) {
    if (s.date < since || s.date > today) continue
    for (const e of s.exercises) {
      const n = working(e.sets).length
      if (!n) continue
      const m = muscleOf(e)
      const primary = e.muscle ?? m?.muscle
      if (primary) out[primary] = (out[primary] ?? 0) + n
      for (const sec of m?.secondary ?? []) out[sec] = (out[sec] ?? 0) + n / 2
    }
  }
  return out
}

/** Minutes trained per date, for the year heatmap. */
export function minutesByDate(sessions: WorkoutSession[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const s of sessions) {
    if (!s.finished_at) continue
    const min = Math.max(1, Math.round((new Date(s.finished_at).getTime() - new Date(s.started_at).getTime()) / 60000))
    out[s.date] = (out[s.date] ?? 0) + Math.min(min, 300)
  }
  return out
}

export const kgToLb = (kg: number) => Math.round(kg * 2.20462 * 10) / 10
export const lbToKg = (lb: number) => Math.round((lb / 2.20462) * 100) / 100
