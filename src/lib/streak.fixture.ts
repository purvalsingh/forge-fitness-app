import { toISO } from './calc'
import type { StreakInput } from './streak'

/** Shared fixture (src/lib/streak.fixture.json) → engine input. Same reader as native StreakFixtureTest.kt. */
export interface FixtureCase {
  name: string; today: string; restDays: number[]; daysPerWeek: number; weekStart: 0 | 1
  food: { from: string; to: string; created?: string }[]; workouts: string[]
  expect?: { current: number; best: number; freezesLeft: number; repairable: { days: string[]; previous: number } | null; days: Record<string, string> }
}
const days = (a: string, b: string) => { const out: string[] = []; for (let d = new Date(a + 'T00:00:00'); toISO(d) <= b; d.setDate(d.getDate() + 1)) out.push(toISO(d)); return out }
// created: local time; missing = the entry's own day at noon (the engine's no-created_at rule).
const at = (local: string) => new Date(local).getTime()

export function fixtureInput(c: FixtureCase): StreakInput {
  return {
    today: c.today, restDays: c.restDays, daysPerWeek: c.daysPerWeek, weekStart: c.weekStart, repaired: [],
    workoutDates: c.workouts,
    entries: [
      ...c.food.flatMap(r => days(r.from, r.to).map(d => ({ date: d, createdAt: at(r.created ?? d + 'T12:00'), kind: 'food' as const, done: true }))),
      ...c.workouts.map(d => ({ date: d, createdAt: at(d + 'T12:00'), kind: 'workout' as const, done: true })),
    ],
  }
}
