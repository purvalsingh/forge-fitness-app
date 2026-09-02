import { describe, expect, it } from 'vitest'
import {
  bmr, tdee, calcTargets, isValidTarget, scaleFood, sumTotals, totalsByMeal,
  dayAdherence, streak, bestStreak, addDays, daysBack, sessionVolume, sessionSets, trend,
} from './calc'
import { ParsedFood, PhysiqueAnalysisSchema } from './ai'
import { generatePlan, emphasisGroups } from './templates'
import { localRoadmap, coerceFocus, reconcile } from './physique'
import { SEED_SETTINGS } from './seed'
import type { Food, FoodLog, Settings, WorkoutSession } from './types'

const settings: Settings = SEED_SETTINGS

describe('energy calculations', () => {
  it('matches Mifflin-St Jeor', () => {
    expect(bmr('male', 80, 180, 30)).toBe(1780)
    expect(bmr('female', 60, 165, 30)).toBe(1320)
  })
  it('scales tdee with activity and steps', () => {
    const low = tdee('male', 80, 180, 30, 'sedentary', 3000)
    const high = tdee('male', 80, 180, 30, 'high', 12000)
    expect(high).toBeGreaterThan(low)
  })
})

describe('nutrition targets', () => {
  const base = {
    sex: 'male', age: 28, heightCm: 178, weightKg: 80, targetWeightKg: 74,
    activity: 'moderate', avgSteps: 9000,
  } as const

  it('cuts below maintenance and bulks above it', () => {
    const cut = calcTargets({ ...base, mode: 'cut', rateKgPerWeek: 0.5 })
    const bulk = calcTargets({ ...base, targetWeightKg: 86, mode: 'bulk', rateKgPerWeek: 0.25 })
    expect(cut.calories).toBeLessThan(cut.maintenance)
    expect(bulk.calories).toBeGreaterThan(bulk.maintenance)
  })
  it('caps absurd rates and never returns invalid targets', () => {
    const r = calcTargets({ ...base, mode: 'cut', rateKgPerWeek: 5 })
    expect(r.warnings.length).toBeGreaterThan(0)
    expect(isValidTarget(r)).toBe(true)
    expect(r.calories).toBeGreaterThan(0)
  })
  it('reports weeks to target', () => {
    const r = calcTargets({ ...base, mode: 'cut', rateKgPerWeek: 0.5 })
    expect(r.weeks_to_target).toBe(12)
  })
  it('flags a target that contradicts the mode', () => {
    const r = calcTargets({ ...base, targetWeightKg: 90, mode: 'cut', rateKgPerWeek: 0.5 })
    expect(r.warnings.join(' ')).toMatch(/above current weight/)
  })
  it('rejects impossible targets', () => {
    expect(isValidTarget({ calories: -100, protein_g: 10, carbs_g: 10, fat_g: 10 })).toBe(false)
    expect(isValidTarget({ calories: 2200, protein_g: 900, carbs_g: 10, fat_g: 10 })).toBe(false)
  })
})

describe('food maths', () => {
  const food: Food = {
    id: 'f', name: 'Chicken', unit: '100g', base: 100,
    calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6,
  }
  it('scales per-100g nutrition', () => {
    const n = scaleFood(food, 150)
    expect(n.calories).toBeCloseTo(247.5, 1)
    expect(n.protein_g).toBeCloseTo(46.5, 1)
  })
  it('sums meal and daily totals', () => {
    const logs: FoodLog[] = [
      { id: '1', date: '2026-09-01', meal_type_id: 'a', name: 'x', qty: 1, unit: 'serving', calories: 200, protein_g: 20, carbs_g: 10, fat_g: 5, source: 'manual' },
      { id: '2', date: '2026-09-01', meal_type_id: 'a', name: 'y', qty: 1, unit: 'serving', calories: 300, protein_g: 10, carbs_g: 40, fat_g: 8, source: 'manual' },
      { id: '3', date: '2026-09-01', meal_type_id: 'b', name: 'z', qty: 1, unit: 'serving', calories: 100, protein_g: 5, carbs_g: 5, fat_g: 2, source: 'manual' },
    ]
    expect(sumTotals(logs).calories).toBe(600)
    expect(totalsByMeal(logs).a.calories).toBe(500)
    expect(totalsByMeal(logs).b.protein_g).toBe(5)
  })
})

const target = { id: 't', calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 60, source: 'manual' as const, updated_at: '' }

function session(date: string, finished: boolean): WorkoutSession {
  return {
    id: 's', date, plan_id: 'p', day_id: 'd', day_name: 'Day 1', started_at: `${date}T10:00:00Z`,
    finished_at: finished ? `${date}T11:00:00Z` : undefined,
    exercises: [{
      workout_exercise_id: 'w', exercise_id: 'ex', name: 'Bench', target: '',
      sets: [
        { set_no: 1, weight_kg: 60, reps: 5, done: true },
        { set_no: 2, weight_kg: 60, reps: 5, done: true },
        { set_no: 3, weight_kg: 60, reps: 5, done: false },
      ],
    }],
  }
}

describe('daily adherence', () => {
  const on = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 }

  it('is 100% when diet, workout and steps all hit', () => {
    const a = dayAdherence({
      date: '2026-09-02', target, totals: on, hasFoodLogs: true,
      session: session('2026-09-02', true), steps: 10500, settings,
    })
    expect(a).toMatchObject({ diet: 'complete', workout: 'complete', steps: 'complete' })
    expect(a.score).toBe(1)
  })

  it('never counts a rest day as a failed workout', () => {
    // 2026-09-06 is a Sunday, a configured rest day.
    const a = dayAdherence({
      date: '2026-09-06', target, totals: on, hasFoodLogs: true, session: null, steps: 10500, settings,
    })
    expect(a.workout).toBe('na')
    expect(a.score).toBe(1) // remaining weights are redistributed
  })

  it('scores partial components at half', () => {
    const a = dayAdherence({
      date: '2026-09-02', target, totals: { ...on, calories: 1400, protein_g: 80 }, hasFoodLogs: true,
      session: session('2026-09-02', false), steps: 7000, settings,
    })
    expect(a.diet).toBe('partial')
    expect(a.workout).toBe('partial')
    expect(a.steps).toBe('partial')
    expect(a.score).toBe(0.5)
  })

  it('treats missing steps as not applicable rather than a failure', () => {
    const a = dayAdherence({
      date: '2026-09-02', target, totals: on, hasFoodLogs: true,
      session: session('2026-09-02', true), steps: null, settings,
    })
    expect(a.steps).toBe('na')
    expect(a.score).toBe(1)
  })

  it('marks an unlogged diet day incomplete', () => {
    const a = dayAdherence({
      date: '2026-09-02', target, totals: { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
      hasFoodLogs: false, session: null, steps: 0, settings,
    })
    expect(a.diet).toBe('incomplete')
    expect(a.score).toBe(0)
  })
})

describe('streaks', () => {
  const dates = ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02']
  it('counts consecutive days ending today', () => {
    expect(streak(dates, '2026-09-02', () => true)).toBe(4)
  })
  it('does not break because today is still unfinished', () => {
    expect(streak(dates, '2026-09-02', d => d !== '2026-09-02')).toBe(3)
  })
  it('breaks on a gap', () => {
    expect(streak(['2026-08-28', '2026-09-01', '2026-09-02'], '2026-09-02', () => true)).toBe(2)
  })
  it('finds the best historical run', () => {
    expect(bestStreak(dates, d => d !== '2026-08-31')).toBe(2)
  })
})

describe('dates', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })
  it('produces an inclusive window ending today', () => {
    const d = daysBack(3, '2026-09-02')
    expect(d).toEqual(['2026-08-31', '2026-09-01', '2026-09-02'])
  })
})

describe('workout maths', () => {
  it('counts only completed sets and their volume', () => {
    const s = session('2026-09-02', true)
    expect(sessionSets(s)).toBe(2)
    expect(sessionVolume(s)).toBe(600)
  })
  it('smooths a weight trend without losing measurements', () => {
    const t = trend([
      { date: '2026-09-01', weight_kg: 80 },
      { date: '2026-09-02', weight_kg: 82 },
    ])
    expect(t[1].weight_kg).toBe(82)
    expect(t[1].trend).toBeLessThan(82)
  })
})

describe('AI response validation', () => {
  it('accepts a well-formed food item', () => {
    expect(ParsedFood.safeParse({
      name: 'Egg', qty: 2, unit: 'piece', calories: 156, protein_g: 12.6, carbs_g: 1.2, fat_g: 10.6,
    }).success).toBe(true)
  })
  it('rejects out-of-range and malformed AI output', () => {
    expect(ParsedFood.safeParse({ name: 'Egg', qty: -1, unit: 'piece', calories: 100, protein_g: 1, carbs_g: 1, fat_g: 1 }).success).toBe(false)
    expect(ParsedFood.safeParse({ name: 'Egg', qty: 1, unit: 'piece', calories: 999999, protein_g: 1, carbs_g: 1, fat_g: 1 }).success).toBe(false)
    expect(ParsedFood.safeParse({ qty: 1, unit: 'piece' }).success).toBe(false)
  })
  it('rejects a physique analysis missing its timeline', () => {
    expect(PhysiqueAnalysisSchema.safeParse({
      composition_estimate: 'x', strengths: [], priorities: [], observations: [],
      training: { days_per_week: 5, focus: 'aesthetics', emphasis: [], rationale: 'x' },
      nutrition: { strategy: 'x', calorie_delta: 0, protein_g_per_kg: 2 },
    }).success).toBe(false)
  })
})

describe('plan generation', () => {
  it('builds one day per training day with exercises', () => {
    const plan = generatePlan({ focus: 'hypertrophy', daysPerWeek: 4 })
    expect(plan.days).toHaveLength(4)
    for (const d of plan.days) expect(d.exercises.length).toBeGreaterThan(3)
  })
  it('puts strength work at heavier sets and lower reps than aesthetics work', () => {
    const strength = generatePlan({ focus: 'strength', daysPerWeek: 4 })
    const aesthetics = generatePlan({ focus: 'aesthetics', daysPerWeek: 4 })
    expect(strength.days[0].exercises[0].reps).toBe('5')
    expect(aesthetics.days[0].exercises.length).toBeGreaterThan(strength.days[0].exercises.length)
  })
  it('maps free-text priorities onto muscle groups', () => {
    expect(emphasisGroups('bigger shoulders, wider back, smaller waist')).toEqual(
      expect.arrayContaining(['shoulders', 'back', 'core']))
  })
  it('gives every exercise a stable unique id', () => {
    const plan = generatePlan({ focus: 'general', daysPerWeek: 6 })
    const ids = plan.days.flatMap(d => d.exercises.map(e => e.id))
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('physique roadmap', () => {
  const goal = {
    id: 'g', mode: 'cut' as const, current_weight_kg: 85, target_weight_kg: 78,
    activity_level: 'moderate' as const, avg_daily_steps: 9000, training_days_per_week: 5,
    training_minutes: 60, rate_kg_per_week: 0.5, updated_at: '',
  }
  it('returns a range, milestones and stated assumptions', () => {
    const r = localRoadmap({ goal: 'aesthetics', priorities: 'bigger shoulders', bodyGoal: goal, trainingDays: 5 })
    expect(r.timeline.range).toMatch(/\d+–\d+ months/)
    expect(r.timeline.milestones.length).toBeGreaterThan(2)
    expect(r.timeline.assumptions.join(' ')).toMatch(/[Gg]enetics/)
  })
  it('puts a cut into a calorie deficit', () => {
    const r = localRoadmap({ goal: 'fat_loss', priorities: '', bodyGoal: goal, trainingDays: 4 })
    expect(r.nutrition.calorie_delta).toBeLessThan(0)
  })
  it('clamps AI numbers to sane bounds', () => {
    const local = localRoadmap({ goal: 'aesthetics', priorities: '', bodyGoal: goal, trainingDays: 5 })
    const wild = { ...local, training: { ...local.training, days_per_week: 14 }, nutrition: { ...local.nutrition, calorie_delta: -5000, protein_g_per_kg: 9 } }
    const fixed = reconcile(wild, local)
    expect(fixed.training.days_per_week).toBeLessThanOrEqual(6)
    expect(fixed.nutrition.calorie_delta).toBeGreaterThan(-1000)
    expect(fixed.nutrition.protein_g_per_kg).toBeLessThanOrEqual(2.6)
  })
  it('coerces free-text AI focus onto a known focus', () => {
    expect(coerceFocus('Hypertrophy', 'custom')).toBe('hypertrophy')
    expect(coerceFocus('nonsense', 'strength')).toBe('strength')
  })
})
