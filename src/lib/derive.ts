import { dayAdherence, sumTotals, type DayAdherence } from './calc'
import type { FoodLog, ISODate, NutritionTarget, Settings, StepLog, WorkoutSession } from './types'

export interface DaySource {
  foodLogs: FoodLog[]
  sessions: WorkoutSession[]
  steps: StepLog[]
  target: NutritionTarget | null
  settings: Settings
}

export function dayLogs(src: DaySource, date: ISODate) {
  return src.foodLogs.filter(l => l.date === date)
}
export function daySession(src: DaySource, date: ISODate) {
  return src.sessions.find(s => s.date === date) ?? null
}
export function daySteps(src: DaySource, date: ISODate): number | null {
  return src.steps.find(s => s.date === date)?.steps ?? null
}

export function adherenceFor(src: DaySource, date: ISODate): DayAdherence {
  const logs = dayLogs(src, date)
  return dayAdherence({
    date,
    target: src.target,
    totals: sumTotals(logs),
    hasFoodLogs: logs.length > 0,
    session: daySession(src, date),
    steps: daySteps(src, date),
    settings: src.settings,
  })
}

/** All dates that have any activity at all — the domain for streak calculations. */
export function activeDates(src: DaySource): ISODate[] {
  return [...new Set([
    ...src.foodLogs.map(l => l.date),
    ...src.sessions.map(s => s.date),
    ...src.steps.map(s => s.date),
  ])].sort()
}

export function monthGrid(year: number, month: number): (ISODate | null)[] {
  const first = new Date(year, month, 1)
  const lead = first.getDay()
  const days = new Date(year, month + 1, 0).getDate()
  const cells: (ISODate | null)[] = Array<ISODate | null>(lead).fill(null)
  for (let d = 1; d <= days; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
