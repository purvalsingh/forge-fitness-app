import { describe, expect, it } from 'vitest'
import { ensureCoverage } from '../../api/_lib/coverage'

const ex = (name: string) => ({ name, sets: 3, reps: '8', rest_sec: 90 })
// The real plan that shipped without rear delts, arm heads, leg curls or calves.
const plan = { name: 'P', days: [
  { name: 'Upper A', focus: 'Upper', exercises: ['Bench Press', 'Weighted Pull-Up', 'Incline Dumbbell Press', 'Seated Cable Row', 'Cable Lateral Raise', 'Cable Triceps Pushdown'].map(ex) },
  { name: 'Lower A', focus: 'Lower', exercises: ['Hack Squat', 'Romanian Deadlift', 'Leg Extension', 'Dumbbell Reverse Lunge', 'Decline Crunch'].map(ex) },
  { name: 'Upper B', focus: 'Upper', exercises: ['Incline Dumbbell Press', 'Lat Pulldown', 'Pec Deck', 'Single-Arm Dumbbell Row', 'Cable Lower Chest Flye', 'Dumbbell Biceps Curl'].map(ex) },
  { name: 'Lower B', focus: 'Lower', exercises: ['Deadlift', 'Back Squat', 'Leg Extension', 'Dumbbell Shrug', 'Hanging Knee Raise'].map(ex) },
] }

describe('ensureCoverage', () => {
  it('adds every missing muscle to a fitting day', () => {
    const out = ensureCoverage(structuredClone(plan))
    expect(out.added).toEqual(['Seated Dumbbell Shoulder Press', 'Face Pull', 'Overhead Cable Triceps Extension', 'Incline Dumbbell Curl', 'Hammer Curl', 'Lying Leg Curl', 'Standing Calf Raise'])
    const names = (d: number) => out.days[d].exercises.map(e => e.name)
    expect([...names(1), ...names(3)]).toEqual(expect.arrayContaining(['Lying Leg Curl', 'Standing Calf Raise']))
    expect([...names(0), ...names(2)]).toContain('Face Pull')
    expect(out.days.every(d => d.exercises.length <= 9)).toBe(true)
  })
  it('leaves a complete plan alone', () => {
    const full = ensureCoverage(structuredClone(plan))
    expect(ensureCoverage({ days: full.days }).added).toBeUndefined()
  })
})
