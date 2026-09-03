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
/** Cooldowns live per isolate: good enough to stop hammering a rate-limited key. */
const cooldowns = new Map<string, number>()

async function callGemini(env: Env, body: unknown): Promise<unknown | null> {
  const model = env.GEMINI_MODEL ?? 'gemini-3.6-flash'
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  const now = Date.now()
  const keys = [env.GEMINI_API_KEY_1, env.GEMINI_API_KEY_2, env.GEMINI_API_KEY_3]
    .map(k => k?.trim())
    .filter((k): k is string => Boolean(k))
    .filter(k => (cooldowns.get(k) ?? 0) <= now)

  if (keys.length === 0) return null

  for (const key of keys) {
    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        // The key goes in a header, never the URL: query strings leak into logs and proxies.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      })
    } catch {
      cooldowns.set(key, Date.now() + COOLDOWN_MS)
      continue
    }
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      cooldowns.set(key, Date.now() + COOLDOWN_MS)
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

  const result = await callGemini(env, geminiRequest)
  if (result === null) return json({ error: 'ai_unavailable' }, 503)
  return json(result, 200)
}
