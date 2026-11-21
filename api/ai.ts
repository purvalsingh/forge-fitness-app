/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureCoverage } from './_lib/coverage.js'
import { caller, json, preflight, readBody } from './_lib/http.js'
import { decryptKeys } from './_lib/crypto.js'
import { buildRequest, extractJson } from './_lib/prompts.js'
import { postCheckFood, preCheckFoodText } from './_lib/guard.js'
import { callGemini, Quota } from './_lib/gemini.js'

/**
 * The only route that talks to Gemini. It uses the CALLER's own keys (2–5, decrypted per request,
 * never logged or returned), rotates through them on quota errors, rate-limits per user, and runs
 * every food answer through the plausibility guard before the app sees it.
 */
export const OPTIONS = preflight
export const maxDuration = 30

const MODELS = (process.env.GEMINI_MODELS ?? 'gemini-3.6-flash,gemini-flash-latest,gemini-2.5-flash,gemini-flash-lite-latest,gemini-2.5-flash-lite')
  .split(',').map(m => m.trim()).filter(Boolean)

const TASKS = new Set(['parse_food_text', 'analyze_food_photo', 'target_advice', 'insights', 'physique_analysis',
  'generate_workout_plan', 'coach_chat', 'training_review', 'coach_session'])
const PER_MINUTE = 12
const PER_DAY = 400
const FOOD_TASKS = new Set(['parse_food_text', 'analyze_food_photo'])

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
  // Rate-limit counts and the key row are fetched together: one database round trip instead of two.
  const [{ count: lastMin }, { count: lastDay }, { data: row }] = await Promise.all([
    who.db.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 60_000).toISOString()),
    who.db.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 86_400_000).toISOString()),
    who.db.from('user_ai_keys').select('ciphertext').maybeSingle(),
  ])
  if ((lastMin ?? 0) >= PER_MINUTE) return json(req, { error: 'rate_limited', message: 'Slow down — too many AI requests this minute.' }, 429)
  if ((lastDay ?? 0) >= PER_DAY) return json(req, { error: 'rate_limited', message: 'Daily AI limit reached. It resets in 24 hours.' }, 429)

  if (!row?.ciphertext) return json(req, { error: 'no_keys', message: 'Add your Gemini API keys in Settings → AI keys.' }, 412)
  let keys: string[]
  try { keys = decryptKeys(who.userId, row.ciphertext) } catch {
    return json(req, { error: 'no_keys', message: 'Your saved keys could not be read. Add them again in Settings → AI keys.' }, 412)
  }

  const request = buildRequest(task, body.payload)
  if (!request) return json(req, { error: 'unknown_task' }, 400)
  // The app's language: explanations and chat come back in it. Food and exercise names stay English so they match the catalog.
  const LANG_NAME: Record<string, string> = { hi: 'Hindi', mr: 'Marathi' }
  const lang = LANG_NAME[String((body as { lang?: unknown }).lang ?? '')]
  const part = (request as any).contents?.[0]?.parts?.find((p: any) => typeof p.text === 'string')
  if (lang && !FOOD_TASKS.has(task) && part) part.text += `\n\nWrite every human-readable sentence in simple everyday ${lang} (Devanagari script). Keep food names, exercise names, units and numbers in English.`
  // Logged alongside the Gemini call rather than before it, so it adds no wait.
  const logged = who.db.from('ai_usage').insert({ user_id: who.userId, task }).then(() => undefined, () => undefined)

  let result: any
  // Food (typed, spoken or photo) is recognition work: the lite model answers in a few seconds and is accurate enough,
  // with the full model as fallback. Everything else starts with the full model.
  const order = FOOD_TASKS.has(task) ? [...MODELS.filter(m => m.includes('lite')), ...MODELS.filter(m => !m.includes('lite'))] : MODELS
  const t0 = Date.now()
  try { result = await callGemini(keys, request, order, undefined, undefined, FOOD_TASKS.has(task) ? 3 : 2); console.log(`[ai] ${task} done ${result === null ? 'no answer' : 'ok'} ${Date.now() - t0}ms, ${keys.length} keys`) } catch (e) {
    if (e instanceof Quota) return json(req, { error: 'quota_exhausted', message: 'All your Gemini keys are out of free quota right now. Try later or add another key.' }, 429)
    return json(req, { error: 'ai_unavailable' }, 503)
  }
  await logged // finished long before Gemini answers; awaited so the serverless instance doesn't drop it
  if (result === null) return json(req, { error: 'ai_slow', message: 'The AI didn\'t answer in time. Try again, or log it manually.' }, 503)

  if (FOOD_TASKS.has(task)) {
    const checked = postCheckFood(result)
    if (checked.notFood) return json(req, { error: 'not_food', message: checked.notFood }, 422)
    return json(req, { items: checked.items, rejected: checked.rejected })
  }
  if (task === 'coach_chat') {
    const reply = String(result?.reply ?? '').slice(0, 2000)
    return json(req, { reply: reply || 'I can only help with training, nutrition and the FORGE app.', on_topic: result?.on_topic !== false })
  }
  if (task === 'generate_workout_plan') {
    // Pure strength plans on 1-3 days stay lean on purpose; everything else must train every muscle.
    const lean = /strength|power/i.test(String(body.payload?.focus ?? '')) && Number(body.payload?.days_per_week) < 4
    if (!lean) result = ensureCoverage(result)
  }
  return json(req, result)
}
