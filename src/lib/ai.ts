import { z } from 'zod'
import { supabase } from './supabase'
import { AI_FALLBACKS, candidates, isUnreachable, markBad, rememberGood } from './endpoints'

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

const FoodListResponse = z.object({ items: z.array(ParsedFood).max(25) })

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

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = supabase ? await supabase.auth.getSession() : { data: { session: null } }
  return {
    'content-type': 'application/json',
    ...(data.session?.access_token ? { authorization: `Bearer ${data.session.access_token}` } : {}),
    ...(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } : {}),
  }
}

const POLL_INTERVAL_MS = 2500
const POLL_TIMEOUT_MS = 180_000
const POLL_MAX_CONSECUTIVE_FAILURES = 4

/**
 * Long tasks answer 202 + job_id; poll the result endpoint until it resolves.
 *
 * The poll deliberately sends NO custom headers. Adding `apikey` or `content-type` to a GET makes
 * it a preflighted cross-origin request, and a result endpoint on another host that does not
 * answer OPTIONS then fails every poll — which looked exactly like a job that never finished.
 * The job id is unguessable and grants nothing beyond that one result.
 */
async function pollJob(jobId: string, base = FN_URL): Promise<unknown> {
  const resultUrl = base.replace(/\/ai$/, '/ai-result')
  const deadline = Date.now() + POLL_TIMEOUT_MS
  let consecutiveFailures = 0

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS))
    let res: Response
    try {
      res = await fetch(`${resultUrl}?job=${encodeURIComponent(jobId)}`)
      consecutiveFailures = 0
    } catch {
      // Never fail silently forever: a poll that cannot reach the host is a real failure.
      if (++consecutiveFailures >= POLL_MAX_CONSECUTIVE_FAILURES) {
        throw new AIUnavailable('Lost contact with the AI service while it was working.')
      }
      continue
    }
    if (res.status === 202) continue
    if (res.status === 503) throw new AIUnavailable()
    if (!res.ok) throw new AIUnavailable(`AI request failed (${res.status})`)
    return res.json().catch(() => null)
  }
  throw new AIUnavailable('The AI is taking longer than expected. Try again in a moment.')
}

/** Post the task to the first AI host that answers, remembering which one worked. */
async function postTask(task: string, payload: unknown): Promise<{ res: Response; base: string }> {
  const bases = candidates(FN_URL, AI_FALLBACKS)
  let lastError: unknown = null
  for (const base of bases) {
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ task, payload }),
      })
      rememberGood(FN_URL, base)
      return { res, base }
    } catch (e) {
      if (!isUnreachable(e)) throw e
      markBad(base)
      lastError = e
    }
  }
  throw lastError ?? new TypeError('No AI endpoint configured')
}

async function call<T>(task: string, payload: unknown, schema: z.ZodType<T>, retry = true): Promise<T> {
  if (!FN_URL) throw new AIUnavailable('AI is not configured')
  let res: Response
  let base = FN_URL
  try {
    ({ res, base } = await postTask(task, payload))
  } catch {
    // A cold serverless function can time out the very first call of the day; one more try, then give up.
    if (retry) return call(task, payload, schema, false)
    throw new AIUnavailable('Could not reach the AI service. Check your connection.')
  }
  if (res.status === 503) throw new AIUnavailable()
  if ((res.status === 502 || res.status === 504) && retry) return call(task, payload, schema, false)
  if (!res.ok) throw new AIUnavailable(`AI request failed (${res.status})`)

  let json = await res.json().catch(() => null)
  if (res.status === 202 && json && typeof (json as { job_id?: string }).job_id === 'string') {
    // Poll the same host that accepted the job — another host knows nothing about it.
    json = await pollJob((json as { job_id: string }).job_id, base)
  }
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
  parseFoodText: (text: string) => call('parse_food_text', { text }, FoodListResponse).then(r => r.items),
  analyzePhoto: (imageBase64: string, mimeType: string) =>
    call('analyze_food_photo', { image: imageBase64, mimeType }, FoodListResponse).then(r => r.items),
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
