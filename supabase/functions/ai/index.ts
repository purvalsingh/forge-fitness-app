// Supabase Edge Function: the only place Gemini keys exist.
// Deploy: supabase functions deploy ai
// Secrets: supabase secrets set GEMINI_API_KEY_1=... GEMINI_API_KEY_2=... GEMINI_API_KEY_3=...
// deno-lint-ignore-file no-explicit-any

const MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.6-flash'
// The key travels in a header, never in the URL — query strings leak into logs and proxies.
const ENDPOINT = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

import { buildRequest, extractJson } from '../_shared/prompts.ts'

const CORS = {
  'access-control-allow-origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

interface KeyState { key: string; cooldownUntil: number }
const keys: KeyState[] = [1, 2, 3]
  .map(n => Deno.env.get(`GEMINI_API_KEY_${n}`)?.trim())
  .filter((k): k is string => Boolean(k))
  .map(key => ({ key, cooldownUntil: 0 }))

const COOLDOWN_MS = 60_000

async function callGemini(body: unknown): Promise<any> {
  const now = Date.now()
  const available = keys.filter(k => k.cooldownUntil <= now)
  if (available.length === 0) return null

  for (const state of available) {
    let res: Response
    try {
      res = await fetch(ENDPOINT(MODEL), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': state.key },
        body: JSON.stringify(body),
      })
    } catch {
      state.cooldownUntil = Date.now() + COOLDOWN_MS
      continue
    }
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      // Rate limited / exhausted / upstream trouble: park this key, try the next one. No retry storms.
      state.cooldownUntil = Date.now() + COOLDOWN_MS
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

  const result = await callGemini(request)
  if (result === null) return json({ error: 'ai_unavailable' }, 503)
  return json(result, 200)
})

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status, headers: { ...CORS, 'content-type': 'application/json' },
  })
}
