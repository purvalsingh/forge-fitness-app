/* eslint-disable @typescript-eslint/no-explicit-any */
import { caller, json, preflight, readBody } from './_lib/http.js'
import { decryptKeys } from './_lib/crypto.js'
import { buildRequest, extractJson } from './_lib/prompts.js'
import { postCheckFood, preCheckFoodText } from './_lib/guard.js'

/**
 * The only route that talks to Gemini. It uses the CALLER's own keys (2–5, decrypted per request,
 * never logged or returned), rotates through them on quota errors, rate-limits per user, and runs
 * every food answer through the plausibility guard before the app sees it.
 */
export const OPTIONS = preflight
export const maxDuration = 120

const MODELS = (process.env.GEMINI_MODELS ?? 'gemini-3.6-flash,gemini-flash-latest,gemini-flash-lite-latest')
  .split(',').map(m => m.trim()).filter(Boolean)
const ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

const TASKS = new Set(['parse_food_text', 'analyze_food_photo', 'target_advice', 'insights', 'physique_analysis',
  'generate_workout_plan', 'coach_chat'])
const PER_MINUTE = 12
const PER_DAY = 400
const FOOD_TASKS = new Set(['parse_food_text', 'analyze_food_photo'])

/** Warm-instance memory: a key that just hit its quota is skipped for a minute. Keyed by hash-free suffix + model. */
const cooldowns = new Map<string, number>()

class Quota extends Error {}

async function callGemini(keys: string[], body: unknown): Promise<any> {
  let sawQuota = false
  for (const model of MODELS) {
    for (const key of keys) {
      const slot = `${model}:${key.slice(-8)}`
      if ((cooldowns.get(slot) ?? 0) > Date.now()) continue
      let res: Response
      try {
        res = await fetch(ENDPOINT(model), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(45_000),
        })
      } catch { cooldowns.set(slot, Date.now() + 30_000); continue }
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        if (res.status === 429) sawQuota = true
        cooldowns.set(slot, Date.now() + 60_000)
        continue
      }
      if (!res.ok) continue // 400 on this model (e.g. unsupported field) — try the next one
      const out = extractJson(await res.json().catch(() => null))
      if (out !== null) return out
    }
  }
  if (sawQuota) throw new Quota()
  return null
}

export async function POST(req: Request) {
  const who = await caller(req).catch(() => null)
  if (!who) return json(req, { error: 'unauthorized', message: 'Sign in to use AI features.' }, 401)

  const body = await readBody(req, 4_400_000) as { task?: unknown; payload?: any } | null
  if (!body) return json(req, { error: 'bad_request', message: 'Request too large or not JSON. Photos are resized to under 4 MB.' }, 413)
  const task = typeof body.task === 'string' ? body.task : ''
  if (!TASKS.has(task)) return json(req, { error: 'unknown_task' }, 400)

  if (task === 'parse_food_text') {
    const pre = preCheckFoodText(body.payload?.text)
    if ('reason' in pre) return json(req, { error: 'not_food', message: pre.reason }, 422)
  }
  if (task === 'coach_chat') {
    const msgs = body.payload?.messages
    if (!Array.isArray(msgs) || msgs.length === 0 || msgs.length > 20) return json(req, { error: 'bad_request' }, 400)
  }

  // Rate limit (counted under RLS; the owner cannot delete these rows).
  const now = Date.now()
  const [{ count: lastMin }, { count: lastDay }] = await Promise.all([
    who.db.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 60_000).toISOString()),
    who.db.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 86_400_000).toISOString()),
  ])
  if ((lastMin ?? 0) >= PER_MINUTE) return json(req, { error: 'rate_limited', message: 'Slow down — too many AI requests this minute.' }, 429)
  if ((lastDay ?? 0) >= PER_DAY) return json(req, { error: 'rate_limited', message: 'Daily AI limit reached. It resets in 24 hours.' }, 429)

  const { data: row } = await who.db.from('user_ai_keys').select('ciphertext').maybeSingle()
  if (!row?.ciphertext) return json(req, { error: 'no_keys', message: 'Add your Gemini API keys in Settings → AI keys.' }, 412)
  let keys: string[]
  try { keys = decryptKeys(who.userId, row.ciphertext) } catch {
    return json(req, { error: 'no_keys', message: 'Your saved keys could not be read. Add them again in Settings → AI keys.' }, 412)
  }

  const request = buildRequest(task, body.payload)
  if (!request) return json(req, { error: 'unknown_task' }, 400)
  await who.db.from('ai_usage').insert({ user_id: who.userId, task })

  let result: any
  try { result = await callGemini(keys, request) } catch (e) {
    if (e instanceof Quota) return json(req, { error: 'quota_exhausted', message: 'All your Gemini keys are out of free quota right now. Try later or add another key.' }, 429)
    return json(req, { error: 'ai_unavailable' }, 503)
  }
  if (result === null) return json(req, { error: 'ai_unavailable', message: 'The AI could not answer. Try again, or log it manually.' }, 503)

  if (FOOD_TASKS.has(task)) {
    const checked = postCheckFood(result)
    if (checked.notFood) return json(req, { error: 'not_food', message: checked.notFood }, 422)
    return json(req, { items: checked.items, rejected: checked.rejected })
  }
  if (task === 'coach_chat') {
    const reply = String(result?.reply ?? '').slice(0, 2000)
    return json(req, { reply: reply || 'I can only help with training, nutrition and the FORGE app.', on_topic: result?.on_topic !== false })
  }
  return json(req, result)
}
