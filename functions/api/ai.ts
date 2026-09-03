/**
 * Cloudflare Pages Function: the AI endpoint.
 *
 * Workers do not bill wall-clock time spent waiting on a subrequest, so every task —
 * including vision and plan generation — runs synchronously here. No background job,
 * no polling, no 30-second ceiling.
 *
 * Secrets (set with `wrangler pages secret put`): GEMINI_API_KEY_1..3, optional GEMINI_MODEL.
 */
import { buildRequest, extractJson } from '../../supabase/functions/_shared/prompts.ts'

interface Env {
  GEMINI_API_KEY_1?: string
  GEMINI_API_KEY_2?: string
  GEMINI_API_KEY_3?: string
  GEMINI_MODEL?: string
  ALLOWED_ORIGIN?: string
}

const COOLDOWN_MS = 60_000
/** A key that stalls should not hold up the whole request when two others are ready. */
const PER_KEY_TIMEOUT_MS = 30_000
/**
 * Cooldowns live per isolate, keyed by model AND key: a key that exhausted its quota on one
 * model usually still has quota on another, so parking it globally would waste the ladder.
 */
const cooldowns = new Map<string, number>()
const slot = (model: string, key: string) => `${model}::${key}`

class QuotaExhausted extends Error {
  constructor(readonly attempts: string[]) { super('quota exhausted') }
}

async function callGemini(env: Env, body: unknown): Promise<unknown | null> {
  // Each model carries its own free-tier quota, so an exhausted one is not the end of the road.
  const models = (env.GEMINI_MODELS ?? 'gemini-3.6-flash,gemini-flash-latest,gemini-flash-lite-latest')
    .split(',').map(m => m.trim()).filter(Boolean)
  let sawQuotaError = false
  const attempts: string[] = []
  for (const model of models) {
    const started = Date.now()
    const result = await tryModel(env, model, body, () => { sawQuotaError = true })
    attempts.push(`${model}:${result !== null ? 'ok' : 'miss'}:${Date.now() - started}ms`)
    if (result !== null) return result
  }
  if (sawQuotaError) throw new QuotaExhausted(attempts)
  return null
}

async function tryModel(env: Env, model: string, body: unknown, onQuotaError: () => void): Promise<unknown | null> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const now = Date.now()
  const keys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3]
    .map(k => k?.trim())
    .filter((k): k is string => Boolean(k))
    .filter(k => (cooldowns.get(slot(model, k)) ?? 0) <= now)

  if (keys.length === 0) return null

  for (const key of keys) {
    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        // The key goes in a header, never the URL: query strings leak into logs and proxies.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(PER_KEY_TIMEOUT_MS),
      })
    } catch {
      cooldowns.set(slot(model, key), Date.now() + COOLDOWN_MS)
      continue
    }
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      if (res.status === 429) onQuotaError()
      cooldowns.set(slot(model, key), Date.now() + COOLDOWN_MS)
      continue
    }
    if (!res.ok) return null
    return extractJson(await res.json().catch(() => null))
  }
  return null
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const cors: Record<string, string> = {
    'access-control-allow-origin': env.ALLOWED_ORIGIN ?? '*',
    'access-control-allow-headers': 'authorization, apikey, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
  }
  const json = (payload: unknown, status: number) =>
    new Response(JSON.stringify(payload), { status, headers: { ...cors, 'content-type': 'application/json' } })

  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  if (!env.GEMINI_API_KEY_1 && !env.GEMINI_API_KEY_2 && !env.GEMINI_API_KEY_3) {
    return json({ error: 'ai_unconfigured' }, 503)
  }

  const body = await request.json().catch(() => null) as { task?: string; payload?: unknown } | null
  if (typeof body?.task !== 'string') return json({ error: 'bad_request' }, 400)

  const geminiRequest = buildRequest(body.task, body.payload)
  if (!geminiRequest) return json({ error: 'unknown_task' }, 400)

  let result: unknown
  try {
    result = await callGemini(env, geminiRequest)
  } catch (e) {
    if (e instanceof QuotaExhausted) return json({ error: 'quota_exhausted', attempts: e.attempts }, 429)
    return json({ error: 'ai_unavailable' }, 503)
  }
  if (result === null) return json({ error: 'ai_unavailable' }, 503)
  return json(result, 200)
}
