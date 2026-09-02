import { z } from 'zod'
import { supabase } from './supabase'

/**
 * Client-side AI facade. It never touches a Gemini key — it calls the `ai` Edge Function,
 * which holds GEMINI_API_KEY_1..3 server-side. Every response is schema-validated here too,
 * so a malformed model answer can never reach the database.
 */
export class AIUnavailable extends Error {
  constructor(msg = 'AI service temporarily unavailable') { super(msg); this.name = 'AIUnavailable' }
}

const FN_URL = import.meta.env.VITE_AI_FUNCTION_URL?.trim()
  || (import.meta.env.VITE_SUPABASE_URL?.trim() ? `${import.meta.env.VITE_SUPABASE_URL.trim()}/functions/v1/ai` : '')

export const aiConfigured = Boolean(FN_URL)

export const ParsedFood = z.object({
  name: z.string().min(1).max(80),
  qty: z.number().positive().max(10000),
  unit: z.string().min(1).max(12),
  calories: z.number().min(0).max(5000),
  protein_g: z.number().min(0).max(400),
  carbs_g: z.number().min(0).max(1000),
  fat_g: z.number().min(0).max(400),
})
export type ParsedFood = z.infer<typeof ParsedFood>

const FoodListResponse = z.object({ items: z.array(ParsedFood).min(1).max(25) })

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

async function call<T>(task: string, payload: unknown, schema: z.ZodType<T>, retry = true): Promise<T> {
  if (!FN_URL) throw new AIUnavailable('AI is not configured')
  let res: Response
  try {
    const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
    res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(data.session?.access_token ? { authorization: `Bearer ${data.session.access_token}` } : {}),
        ...(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } : {}),
      },
      body: JSON.stringify({ task, payload }),
    })
  } catch {
    throw new AIUnavailable('Could not reach the AI service. Check your connection.')
  }
  if (res.status === 503) throw new AIUnavailable()
  if (!res.ok) throw new AIUnavailable(`AI request failed (${res.status})`)

  const json = await res.json().catch(() => null)
  const parsed = schema.safeParse(json)
  if (parsed.success) return parsed.data
  if (retry) return call(task, payload, schema, false)
  throw new AIUnavailable('The AI returned an unexpected response. Enter the details manually.')
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

export const ai = {
  configured: aiConfigured,
  parseFoodText: (text: string) => call('parse_food_text', { text }, FoodListResponse).then(r => r.items),
  analyzePhoto: (imageBase64: string, mimeType: string) =>
    call('analyze_food_photo', { image: imageBase64, mimeType }, FoodListResponse).then(r => r.items),
  targetAdvice: (input: unknown) => call('target_advice', input, TargetAdviceResponse),
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
