import { KCAL_PER_KG } from './calc'
import { FOCUS_LABELS, emphasisGroups } from './templates'
import type { Goal, PhysiqueAnalysis, TrainingFocus } from './types'

/**
 * Deterministic roadmap. Used on its own when AI is unavailable, and as the sanity floor
 * for AI output: timelines and calorie deltas the app shows are always bounded by real arithmetic.
 */
export function localRoadmap(args: {
  goal: TrainingFocus
  priorities: string
  bodyGoal: Goal | null
  trainingDays: number
}): PhysiqueAnalysis {
  const { bodyGoal, goal, priorities } = args
  const delta = bodyGoal ? bodyGoal.target_weight_kg - bodyGoal.current_weight_kg : 0
  const rate = Math.max(0.1, Math.abs(bodyGoal?.rate_kg_per_week ?? 0.4))
  const weeks = Math.abs(delta) > 0.5 ? Math.ceil(Math.abs(delta) / rate) : 0

  // Body-composition change is the fast part; visible physique change is slower. Give an honest range.
  const lowMonths = Math.max(3, Math.round((weeks / 4.35) * 0.9))
  const highMonths = Math.max(lowMonths + 6, Math.round((weeks / 4.35) * 2.2) + 6)

  const groups = emphasisGroups(priorities)
  const calorie_delta = bodyGoal
    ? Math.round(Math.sign(delta) * (rate * KCAL_PER_KG) / 7)
    : goal === 'fat_loss' ? -400 : goal === 'hypertrophy' ? 250 : 0

  return {
    composition_estimate: 'No AI analysis available — this roadmap is calculated from your goal, current weight and training frequency.',
    strengths: [],
    priorities: groups.length ? groups.map(g => `More volume for ${g}`) : ['Consistent progressive overload across all major movements'],
    observations: [
      bodyGoal
        ? `${Math.abs(delta).toFixed(1)} kg to move at ${rate.toFixed(2)} kg/week ≈ ${weeks} weeks of body-weight change.`
        : 'Set a goal weight to sharpen this estimate.',
      'Visible physique change lags weight change — muscle is built over quarters, not weeks.',
    ],
    timeline: {
      range: `${lowMonths}–${highMonths} months`,
      assumptions: [
        `Training ${args.trainingDays} days per week, consistently.`,
        'Nutrition targets hit on most days.',
        'Adequate sleep and recovery.',
        'Genetics, starting condition, training history and recovery can change this substantially.',
      ],
      milestones: [
        { window: '0–3 months', expectation: 'Technique and consistency established; early strength gains; small visible change.' },
        { window: '3–6 months', expectation: 'Measurable strength progression and the first clear changes in the prioritised areas.' },
        { window: '6–12 months', expectation: 'Noticeable shift in proportions if training and nutrition stayed consistent.' },
        { window: '12+ months', expectation: 'Compounding development; priorities usually need to be re-evaluated by now.' },
      ],
    },
    training: {
      days_per_week: args.trainingDays,
      focus: goal,
      emphasis: groups,
      rationale: `${FOCUS_LABELS[goal]} split with extra accessory volume on your stated priorities.`,
    },
    nutrition: {
      strategy: goal === 'fat_loss' || (delta < 0)
        ? 'Moderate deficit with high protein to hold onto muscle.'
        : delta > 0 ? 'Controlled surplus so gains skew toward muscle rather than fat.'
          : 'Eat around maintenance and let training drive the change.',
      calorie_delta,
      protein_g_per_kg: delta < 0 ? 2.2 : 1.9,
    },
  }
}

/** AI focus strings are free text; map them onto our known focus values. */
export function coerceFocus(v: string | undefined, fallback: TrainingFocus): TrainingFocus {
  const s = (v ?? '').toLowerCase().replace(/[^a-z]+/g, '_')
  const keys = Object.keys(FOCUS_LABELS) as TrainingFocus[]
  return keys.find(k => k === s)
    ?? keys.find(k => s.includes(k.split('_')[0]) && k !== 'custom')
    ?? fallback
}

/** Clamp AI numbers to what the deterministic layer considers sane. */
export function reconcile(aiOut: PhysiqueAnalysis, local: PhysiqueAnalysis): PhysiqueAnalysis {
  return {
    ...aiOut,
    training: {
      ...aiOut.training,
      days_per_week: Math.min(6, Math.max(3, Math.round(aiOut.training.days_per_week))),
    },
    nutrition: {
      ...aiOut.nutrition,
      calorie_delta: clampDelta(aiOut.nutrition.calorie_delta, local.nutrition.calorie_delta),
      protein_g_per_kg: Math.min(2.6, Math.max(1.4, aiOut.nutrition.protein_g_per_kg)),
    },
  }
}

function clampDelta(v: number, local: number) {
  const limit = Math.max(700, Math.abs(local) * 1.5)
  return Math.round(Math.min(limit, Math.max(-limit, v)))
}
