import { describe, expect, it } from 'vitest'
import { e1rm, nextTarget, parseReps, platesPerSide } from './training'
import type { SessionExercise } from './types'

const ex = (sets: [number, number][]): SessionExercise => ({
  workout_exercise_id: 'w', exercise_id: 'x', name: 'Bench', target: '',
  sets: sets.map(([w, r], i) => ({ set_no: i + 1, weight_kg: w, reps: r, done: true })),
})

describe('training maths', () => {
  it('e1rm refuses high reps', () => {
    expect(e1rm(100, 5)).toBeCloseTo(116.7, 1)
    expect(e1rm(100, 15)).toBeNull()
  })
  it('plate math', () => {
    expect(platesPerSide(70, 20)).toEqual([25])
    expect(platesPerSide(62.5, 20)).toEqual([20, 1.25])
    expect(platesPerSide(15, 20)).toBeNull()
  })
  it('parses rep ranges', () => {
    expect(parseReps('6-8')).toEqual([6, 8])
    expect(parseReps('5')).toEqual([5, 5])
    expect(parseReps('45 sec')).toEqual([45, 45])
  })
  it('adds load only when every set hit the top of the range', () => {
    expect(nextTarget({ history: [{ date: '2026-09-20', ex: ex([[70, 8], [70, 8], [70, 8]]) }], reps: '6-8' })?.weight).toBe(72.5)
    const t = nextTarget({ history: [{ date: '2026-09-20', ex: ex([[70, 8], [70, 7], [70, 6]]) }], reps: '6-8' })
    expect(t?.weight).toBe(70)
    expect(t?.reps).toBe(7)
  })
  it('deloads after three stalls', () => {
    const h = ['2026-09-20', '2026-09-17', '2026-09-14'].map(d => ({ date: d, ex: ex([[100, 3], [100, 3]]) }))
    expect(nextTarget({ history: h, reps: '5' })?.weight).toBe(90)
  })
})

import { importWorkouts } from './importers'
describe('CSV import', () => {
  it('reads a Strong export', () => {
    const csv = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE\n' +
      '2026-09-01 18:00:00,Push,1h,Bench Press (Barbell),1,60,8,,,,,\n2026-09-01 18:00:00,Push,1h,Bench Press (Barbell),2,60,7,,,,,8'
    const r = importWorkouts(csv)!
    expect(r.format).toBe('strong')
    expect(r.sessions).toHaveLength(1)
    expect(r.sessions[0].exercises[0].sets.map(s => s.reps)).toEqual([8, 7])
  })
})

import { matchExercise, type LibExercise } from './exercises'
describe('exercise matching', () => {
  const lib = [
    { id: '1', name: 'Band Bench Press', equipment: 'band' }, { id: '2', name: 'Barbell Bench Press', equipment: 'barbell' },
    { id: '3', name: 'Dumbbell Seated Shoulder Press', equipment: 'dumbbell' }, { id: '4', name: 'Cable Pulldown', equipment: 'cable' },
  ] as LibExercise[]
  it('prefers the barbell version and expands DB', () => {
    expect(matchExercise(lib, 'Bench Press')?.id).toBe('2')
    expect(matchExercise(lib, 'DB Shoulder Press')?.id).toBe('3')
  })
})
