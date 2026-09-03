// Netlify Function: server-side home for the Gemini keys.
// Env vars (set in Netlify, never in git): GEMINI_API_KEY_1..3, optional GEMINI_MODEL.
// Same contract as the Supabase Edge Function in supabase/functions/ai — run whichever you prefer.
import { buildRequest, extractJson } from '../../supabase/functions/_shared/prompts.ts'
import { callGemini, keys } from '../lib/gemini.mts'

// These outrun a synchronous function's timeout (vision over several photos; a whole training
// plan is ~35 exercises of generation), so they run in the background function and the client
// polls /api/ai-result for the result.
const BACKGROUND_TASKS = new Set(['physique_analysis', 'generate_workout_plan'])

export default async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (keys.length === 0) return json({ error: 'ai_unconfigured' }, 503)

  const body = await req.json().catch(() => null) as any
  if (typeof body?.task !== 'string') return json({ error: 'bad_request' }, 400)

  if (BACKGROUND_TASKS.has(body.task)) {
    const jobId = crypto.randomUUID()
    const url = new URL('/.netlify/functions/ai-background', req.url)
    const started = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, job_id: jobId }),
    }).then(r => r.ok || r.status === 202).catch(() => false)
    if (!started) return json({ error: 'ai_unavailable' }, 503)
    return json({ job_id: jobId }, 202)
  }

  const request = buildRequest(body.task, body.payload)
  if (!request) return json({ error: 'unknown_task' }, 400)

  const result = await callGemini(request, extractJson)
  if (result === null) return json({ error: 'ai_unavailable' }, 503)
  return json(result, 200)
}

const CORS: Record<string, string> = {
  'access-control-allow-origin': process.env.ALLOWED_ORIGIN ?? '*',
  'access-control-allow-headers': 'authorization, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  })
}

export const config = { path: '/api/ai' }
