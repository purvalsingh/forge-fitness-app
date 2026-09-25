import { z } from 'zod'
import { supabase } from './supabase'

/**
 * Client-side AI facade. It never holds a Gemini key: it calls the FORGE API (`/api/ai`), which
 * decrypts the signed-in user's own keys server-side. Every response is schema-validated here too,
 * so a malformed model answer can never reach the database.
 */
export class AIUnavailable extends Error {
  code: string
  constructor(msg = 'AI service temporarily unavailable', code = 'ai_unavailable') { super(msg); this.name = 'AIUnavailable'; this.code = code }
}

/** Base of the FORGE API. Same origin on the web; absolute inside the native app. */
export const API_BASE = (import.meta.env.VITE_API_BASE?.trim() || '').replace(/\/$/, '')
const FN_URL = `${API_BASE}/api/ai`

export const aiConfigured = true

export const ParsedFood = z.object({
  name: z.string().min(1).max(80),
  qty: z.number().positive().max(50),
  unit: z.string().min(1).max(12),
  serving_label: z.string().max(40).optional(),
  grams: z.number().min(0).max(2500).optional(),
  calories: z.number().min(0).max(3000),
  protein_g: z.number().min(0).max(400),
  carbs_g: z.number().min(0).max(1000),
  fat_g: z.number().min(0).max(400),
  fiber_g: z.number().min(0).max(200).optional(),
  confidence: z.number().min(0).max(1).optional(),
})
export type ParsedFood = z.infer<typeof ParsedFood>

const FoodListResponse = z.object({
  items: z.array(ParsedFood).max(25),
  rejected: z.array(z.object({ name: z.string(), reason: z.string() })).optional(),
})
export type FoodList = z.infer<typeof FoodListResponse>

const TargetAdviceResponse = z.object({
  summary: z.string().min(1).max(600),
  adjustments: z.object({
    calories: z.number().min(800).max(8000).optional(),
    protein_g: z.number().min(0).max(400).optional(),
    carbs_g: z.number().min(0).max(1200).optional(),
    fat_g: z.number().min(0).max(400).optional(),
  }).optional(),
})
export type TargetAdvice = z.infer<typeof TargetAdviceResponse>

const InsightsResponse = z.object({
  insights: z.array(z.object({
    kind: z.enum(['observation', 'adjustment']),
    text: z.string().min(1).max(400),
  })).max(6),
})

const CoachResponse = z.object({ reply: z.string().max(2000), on_topic: z.boolean() })

export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
  return {
    'content-type': 'application/json',
    ...(data.session?.access_token ? { authorization: `Bearer ${data.session.access_token}` } : {}),
  }
}

async function call<T>(task: string, payload: unknown, schema: z.ZodType<T>, retry = true): Promise<T> {
  if (!supabase) throw new AIUnavailable('Sign in to use AI features.', 'unauthorized')
  let res: Response
  try {
    res = await fetch(FN_URL, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ task, payload }) })
  } catch {
    if (retry) return call(task, payload, schema, false)
    throw new AIUnavailable('Could not reach the AI service. Check your connection.', 'offline')
  }
  const body = await res.json().catch(() => null) as { error?: string; message?: string } | null
  if (!res.ok) {
    if ((res.status === 502 || res.status === 504) && retry) return call(task, payload, schema, false)
    throw new AIUnavailable(body?.message ?? `AI request failed (${res.status})`, body?.error ?? 'ai_unavailable')
  }
  const parsed = schema.safeParse(body)
  if (parsed.success) return parsed.data
  if (retry) return call(task, payload, schema, false)
  throw new AIUnavailable('The AI returned an unexpected response. Enter the details manually.')
}

/** The signed-in user's Gemini keys: only a count and hints ever come back. */
export const aiKeys = {
  async get(): Promise<{ count: number; hints: string[] }> {
    const r = await fetch(`${API_BASE}/api/keys`, { headers: await authHeaders() })
    if (!r.ok) throw new AIUnavailable('Could not load your AI key status.')
    return r.json()
  },
  async save(keys: string[]): Promise<{ count: number; hints: string[] }> {
    const r = await fetch(`${API_BASE}/api/keys`, { method: 'POST', headers: await authHeaders(), body: JSON.stringify({ keys }) })
    const body = await r.json().catch(() => ({}))
    if (!r.ok) throw new AIUnavailable(body?.message ?? 'Could not save your keys.', body?.error)
    return body
  },
  async remove() {
    await fetch(`${API_BASE}/api/keys`, { method: 'DELETE', headers: await authHeaders() })
  },
}

export const PhysiqueAnalysisSchema = z.object({
  composition_estimate: z.string().min(1).max(400),
  strengths: z.array(z.string().max(200)).max(8),
  priorities: z.array(z.string().max(200)).max(8),
  observations: z.array(z.string().max(300)).max(10),
  changes_since_last: z.array(z.string().max(300)).max(10).optional(),
  timeline: z.object({
    range: z.string().min(1).max(120),
    assumptions: z.array(z.string().max(300)).max(10),
    milestones: z.array(z.object({
      window: z.string().max(60),
      expectation: z.string().max(400),
    })).max(6),
  }),
  training: z.object({
    days_per_week: z.number().int().min(2).max(7),
    focus: z.string().max(40),
    emphasis: z.array(z.string().max(80)).max(10),
    rationale: z.string().max(600),
  }),
  nutrition: z.object({
    strategy: z.string().max(400),
    calorie_delta: z.number().min(-1200).max(1200),
    protein_g_per_kg: z.number().min(0.8).max(3.5),
  }),
})
export type PhysiqueAnalysisResult = z.infer<typeof PhysiqueAnalysisSchema>

export interface PhysiquePhoto { angle: string; mimeType: string; data: string }

export const GeneratedPlan = z.object({
  name: z.string().min(1).max(80),
  rationale: z.string().min(1).max(800),
  days: z.array(z.object({
    name: z.string().min(1).max(60),
    focus: z.string().max(40),
    exercises: z.array(z.object({
      name: z.string().min(1).max(60),
      sets: z.number().int().min(1).max(10),
      reps: z.string().min(1).max(20),
      rest_sec: z.number().int().min(20).max(600),
      tempo: z.string().max(20).optional(),
      note: z.string().max(160).optional(),
    })).min(1).max(12),
  })).min(1).max(7),
})
export type GeneratedPlan = z.infer<typeof GeneratedPlan>

export const ai = {
  configured: aiConfigured,
  parseFoodText: (text: string) => call('parse_food_text', { text }, FoodListResponse),
  analyzePhoto: (imageBase64: string, mimeType: string, hint?: string) =>
    call('analyze_food_photo', { image: imageBase64, mimeType, hint }, FoodListResponse),
  coach: (messages: { role: 'user' | 'model'; text: string }[]) => call('coach_chat', { messages }, CoachResponse),
  targetAdvice: (input: unknown) => call('target_advice', input, TargetAdviceResponse),
  generatePlan: (input: {
    days_per_week: number
    focus: string
    preferences?: string
    priorities?: string[]
    equipment?: string
    experience?: string
  }) => call('generate_workout_plan', input, GeneratedPlan),
  physique: (input: {
    photos: PhysiquePhoto[]
    reference?: { mimeType: string; data: string }
    goal: string
    priorities: string
    context?: unknown
    previous?: unknown
  }) => call('physique_analysis', input, PhysiqueAnalysisSchema),
  insights: (input: unknown) => call('insights', input, InsightsResponse).then(r => r.insights),
}
