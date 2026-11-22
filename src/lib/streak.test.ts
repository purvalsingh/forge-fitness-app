import { describe, expect, it } from 'vitest'
import { toISO } from './calc'
import { computeStreak, lateDays, monthStats, repairEarned, type StreakInput } from './streak'
import fixture from './streak.fixture.json'
import { fixtureInput, type FixtureCase } from './streak.fixture'

const day = (s: string) => new Date(s + 'T12:00:00').getTime()
const base = (over: Partial<StreakInput>): StreakInput => ({ today: '2026-11-30', entries: [], workoutDates: [], restDays: [], daysPerWeek: 4, weekStart: 1, repaired: [], ...over })
const food = (date: string, createdAt = day(date)) => ({ date, createdAt, kind: 'food' as const, done: true })
const workout = (date: string) => ({ date, createdAt: day(date), kind: 'workout' as const, done: true })
function range(from: string, to: string) { const out: string[] = []; for (let d = new Date(from + 'T00:00:00'); d <= new Date(to + 'T00:00:00'); d.setDate(d.getDate() + 1)) out.push(toISO(d)); return out }

describe('plan-aware, forgiving streak', () => {
  it('a 4-day plan (Mon/Tue/Thu/Sat) with nothing logged on rest days keeps growing', () => {
    // 3 weeks, 2026-11-09 (Mon) .. 2026-11-29 (Sun)
    const train = range('2026-11-09', '2026-11-29').filter(d => [1, 2, 4, 6].includes(new Date(d + 'T00:00:00').getDay()))
    const s = computeStreak(base({ today: '2026-11-30', entries: train.map(workout), workoutDates: train }))
    expect(s.current).toBe(12) // the 12 training days; the 9 rest days keep it alive without adding
    expect([...s.days.values()].filter(k => k === 'miss' || k === 'frozen')).toHaveLength(0)
  })
  it('food logged every day but a training-day workout missed: the streak continues', () => {
    const s = computeStreak(base({ today: '2026-11-30', entries: range('2026-11-20', '2026-11-29').map(d => food(d)) }))
    expect(s.current).toBe(10)
  })
  it('a 1-day miss uses a freeze and the streak continues', () => {
    const dates = range('2026-11-20', '2026-11-29').filter(d => d !== '2026-11-25')
    const s = computeStreak(base({ entries: dates.map(d => food(d)) }))
    expect(s.days.get('2026-11-25')).toBe('frozen')
    expect(s.current).toBe(9)
    expect(s.freezesLeft).toBe(1)
  })
  it('a 3-day miss with 2 freezes breaks it, and repair is offered for 48 h', () => {
    const dates = [...range('2026-11-20', '2026-11-26')]
    const s = computeStreak(base({ today: '2026-11-30', entries: dates.map(d => food(d)) }))
    expect(s.current).toBe(0)
    expect(s.repairable).toEqual({ days: ['2026-11-29'], previous: 7 })
    const later = computeStreak(base({ today: '2026-12-03', entries: dates.map(d => food(d)) }))
    expect(later.repairable).toBeNull()
  })
  it('a completed repair brings the streak back', () => {
    const dates = [...range('2026-11-20', '2026-11-26'), '2026-11-30']
    const s = computeStreak(base({ today: '2026-11-30', entries: dates.map(d => food(d)), repaired: ['2026-11-29'] }))
    expect(s.current).toBe(8)
  })
  it('an unfinished today never breaks the streak', () => {
    const s = computeStreak(base({ today: '2026-11-30', entries: range('2026-11-25', '2026-11-29').map(d => food(d)) }))
    expect(s.current).toBe(5)
    expect(s.days.has('2026-11-30')).toBe(false)
  })
  it('back-filling more than 7 days late does not count', () => {
    const late = day('2026-11-30')
    const s = computeStreak(base({ today: '2026-11-30', entries: [food('2026-11-01', late), food('2026-11-02', late), ...range('2026-11-26', '2026-11-29').map(d => food(d))] }))
    expect(s.days.get('2026-11-01')).toBeUndefined() // first counted day is the first honest one
    expect(s.current).toBe(4)
  })
  it('repair needs every meal AND a workout or steps', () => {
    expect(repairEarned({ mealTypeIds: ['b', 'l', 'd'], loggedMealIds: ['b', 'l', 'd'], workoutDone: false, stepsDone: true })).toBe(true)
    expect(repairEarned({ mealTypeIds: ['b', 'l', 'd'], loggedMealIds: ['b', 'l'], workoutDone: true, stepsDone: true })).toBe(false)
    // 4 meal types (with an evening snack): 3 meals are enough
    expect(repairEarned({ mealTypeIds: ['b', 'l', 's', 'd'], loggedMealIds: ['b', 'l', 'd'], workoutDone: true, stepsDone: false })).toBe(true)
  })
  it('"Days logged" is the real logged-day count, and the month average ignores days before first use', () => {
    const monthDates = range('2026-11-01', '2026-11-22')
    const logged = new Set(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'])
    const m = monthStats({ monthDates, logged, days: new Map(), today: '2026-11-22', score: d => (logged.has(d) ? 0.5 : 0) })
    expect(m.loggedDays).toBe(6)
    expect(m.avg).toBe(0.5) // 16-21 Nov only, not diluted by 1-15 Nov
  })
})

// Shared with native StreakFixtureTest.kt: both engines must give the same answer on the same data.
describe('shared fixture (web = native)', () => {
  for (const c of fixture as unknown as FixtureCase[]) it(c.name, () => {
    const r = computeStreak(fixtureInput(c))
    expect({ current: r.current, best: r.best, freezesLeft: r.freezesLeft, repairable: r.repairable, days: Object.fromEntries(r.days) }).toEqual(c.expect)
  })
})

describe('lateDays', () => {
  it('only days whose every log was entered over a week late', () => {
    const at = (d: string) => new Date(d + 'T12:00:00').getTime()
    const input: StreakInput = { today: '2026-11-30', restDays: [], daysPerWeek: 4, weekStart: 1, repaired: [], workoutDates: [],
      entries: [
        { date: '2026-11-09', createdAt: at('2026-11-25'), kind: 'food', done: true },
        { date: '2026-11-10', createdAt: at('2026-11-25'), kind: 'food', done: true },
        { date: '2026-11-10', createdAt: at('2026-11-10'), kind: 'food', done: true },
      ] }
    expect([...lateDays(input)]).toEqual(['2026-11-09'])
  })
})
