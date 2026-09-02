import { uid } from './db'
import { ai, AIUnavailable, type GeneratedPlan } from './ai'
import { FOCUS_LABELS, generatePlan } from './templates'
import type { TrainingFocus, WorkoutPlan } from './types'

export interface PlanRequest {
  focus: TrainingFocus
  daysPerWeek: number
  preferences?: string
  priorities?: string[]
  equipment?: string
  experience?: string
  name?: string
}

export interface PlanResult {
  plan: WorkoutPlan
  source: 'ai' | 'template'
  rationale?: string
  /** Set when AI was asked for but could not answer, so the UI can say why it fell back. */
  fallbackReason?: string
}

/** Turn a validated AI plan into FORGE's plan shape. */
export function fromGenerated(g: GeneratedPlan, req: PlanRequest): WorkoutPlan {
  const planId = uid()
  return {
    id: planId,
    name: g.name || req.name || `${FOCUS_LABELS[req.focus]} · ${req.daysPerWeek} days`,
    focus: req.focus,
    days_per_week: g.days.length,
    source: 'ai',
    active: false,
    updated_at: new Date().toISOString(),
    days: g.days.map((d, i) => ({
      id: uid(),
      plan_id: planId,
      name: d.name.match(/^day\s*\d/i) ? d.name : `Day ${i + 1} — ${d.name}`,
      focus: d.focus || FOCUS_LABELS[req.focus],
      position: i,
      exercises: d.exercises.map((e, j) => ({
        id: uid(),
        exercise_id: 'ex-' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        name: e.name,
        sets: e.sets,
        reps: e.reps,
        target: '',
        rest_sec: e.rest_sec,
        tempo: e.tempo,
        note: e.note,
        position: j,
      })),
    })),
  }
}

/**
 * Ask Gemini for a plan built around what the user actually asked for, and fall back to the
 * deterministic template generator when AI is unavailable — the feature never dead-ends.
 */
export async function requestPlan(req: PlanRequest): Promise<PlanResult> {
  const template = (): WorkoutPlan => generatePlan({
    focus: req.focus,
    daysPerWeek: req.daysPerWeek,
    emphasis: [...(req.priorities ?? []), req.preferences ?? ''],
    name: req.name,
  })

  if (!ai.configured) {
    return { plan: template(), source: 'template', fallbackReason: 'AI is not configured, so this plan comes from the built-in templates.' }
  }

  try {
    const g = await ai.generatePlan({
      days_per_week: req.daysPerWeek,
      focus: FOCUS_LABELS[req.focus],
      preferences: req.preferences,
      priorities: req.priorities,
      equipment: req.equipment,
      experience: req.experience,
    })
    return { plan: fromGenerated(g, req), source: 'ai', rationale: g.rationale }
  } catch (e) {
    return {
      plan: template(),
      source: 'template',
      fallbackReason: e instanceof AIUnavailable
        ? `${e.message} Showing a template plan instead.`
        : 'The AI could not build a plan just now. Showing a template plan instead.',
    }
  }
}
