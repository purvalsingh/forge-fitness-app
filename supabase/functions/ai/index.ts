// Supabase Edge Function: the only place Gemini keys exist.
// Deploy: supabase functions deploy ai
// Secrets: supabase secrets set GEMINI_API_KEY_1=... GEMINI_API_KEY_2=... GEMINI_API_KEY_3=...
// deno-lint-ignore-file no-explicit-any

const MODELS = (Deno.env.get('GEMINI_MODELS') ?? 'gemini-3.6-flash,gemini-flash-latest,gemini-flash-lite-latest').split(',').map(m => m.trim()).filter(Boolean)
// The key travels in a header, never in the URL — query strings leak into logs and proxies.
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

/** Raised when every model and key reports an exhausted free-tier quota. */
class QuotaExhausted extends Error {}

import { buildRequest, extractJson } from '../_shared/prompts.ts'

const CORS = {
  'access-control-allow-origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

const keys: string[] = [1, 2, 3]
  .map(n => Deno.env.get(`GEMINI_API_KEY_${n}`)?.trim())
  .filter((k): k is string => Boolean(k))

/**
 * Cooldowns are keyed by model AND key: a key that exhausted its quota on one model usually
 * still has quota on another, so parking it globally would waste the model ladder.
 */
const cooldowns = new Map<string, number>()
const slot = (model: string, key: string) => `${model}::${key}`

const COOLDOWN_MS = 60_000
/** A key that stalls should not hold up the whole request when two others are ready. */
const PER_KEY_TIMEOUT_MS = 30_000

async function callGemini(body: unknown): Promise<any> {
  let sawQuotaError = false
  for (const model of MODELS) {
    const result = await tryModel(model, body, () => { sawQuotaError = true })
    if (result !== null) return result
  }
  if (sawQuotaError) throw new QuotaExhausted()
  return null
}

async function tryModel(model: string, body: unknown, onQuotaError: () => void): Promise<any> {
  const now = Date.now()
  const available = keys.filter(k => (cooldowns.get(slot(model, k)) ?? 0) <= now)
  if (available.length === 0) return null

  for (const key of available) {
    let res: Response
    try {
      res = await fetch(ENDPOINT(model), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(PER_KEY_TIMEOUT_MS),
      })
    } catch {
      cooldowns.set(slot(model, key), Date.now() + COOLDOWN_MS)
      continue
    }
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      // Rate limited / exhausted / upstream trouble: park this key, try the next one. No retry storms.
      if (res.status === 429) onQuotaError()
      cooldowns.set(slot(model, key), Date.now() + COOLDOWN_MS)
      continue
    }
    if (!res.ok) return null
    return extractJson(await res.json().catch(() => null))
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  if (keys.length === 0) return json({ error: 'ai_unconfigured' }, 503)

  const body = await req.json().catch(() => null)
  const task = body?.task
  if (typeof task !== 'string') return json({ error: 'bad_request' }, 400)

  const request = buildRequest(task, body?.payload)
  if (!request) return json({ error: 'unknown_task' }, 400)

  let result: unknown
  try {
    result = await callGemini(request)
  } catch (e) {
    if (e instanceof QuotaExhausted) return json({ error: 'quota_exhausted' }, 429)
    return json({ error: 'ai_unavailable' }, 503)
  }
  if (result === null) return json({ error: 'ai_unavailable' }, 503)
  return json(result, 200)
})

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  })
}
