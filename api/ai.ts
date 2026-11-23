/* eslint-disable @typescript-eslint/no-explicit-any */
import { ensureCoverage } from './_lib/coverage.js'
import { caller, json, preflight, readBody } from './_lib/http.js'
import { decryptKeys } from './_lib/crypto.js'
import { buildRequest } from './_lib/prompts.js'
import { postCheckFood, preCheckFoodText } from './_lib/guard.js'
import { callGemini, Quota } from './_lib/gemini.js'

/**
 * The only route that talks to Gemini. It uses the caller's own keys when they saved some (decrypted per request,
 * never logged or returned), otherwise FORGE's shared pool. Rate limits are atomic in the database (ai_take).
 * Photos live only in this request's memory: never stored, logged or uploaded anywhere but the one Gemini call.
 * Every food answer goes through the plausibility guard before the app sees it.
 */
export const OPTIONS = preflight
export const maxDuration = 30

const MODELS = (process.env.GEMINI_MODELS ?? 'gemini-3-flash-preview,gemini-3.5-flash-lite,gemini-3.6-flash,gemini-3.1-flash-lite')
  .split(',').map(m => m.trim()).filter(Boolean)

const TASKS = new Set(['parse_food_text', 'analyze_food_photo', 'target_advice', 'insights', 'physique_analysis',
  'generate_workout_plan', 'coach_chat', 'training_review', 'coach_session', 'suggest_swap'])
/** FORGE's own key pool (Vercel env, comma-separated) for users who never added a key. Tighter per-user limits keep one user from draining it. */
const SHARED_KEYS = (process.env.FORGE_SHARED_KEYS ?? '').split(',').map(k => k.trim()).filter(Boolean)
/**
 * The shared pool runs on Flash-Lite only. Measured 2026-11-21 on the free keys: 15 requests/minute and 500/day per key
 * per Lite model. FORGE_SHARED_DAILY_CAP=1360 / FORGE_SHARED_HOURLY_CAP=227 come from scripts/simulate-shared-pool.mjs,
 * which budgets on 3.5-flash-lite alone (3.1-flash-lite returns 503 on ~40 % of calls and is spare capacity). gemini-flash-lite-latest is an alias that shares
 * 3.5-flash-lite's quota, so it is not listed twice.
 */
const SHARED_MODELS = (process.env.FORGE_SHARED_MODELS ?? 'gemini-3.5-flash-lite,gemini-3.1-flash-lite').split(',').map(m => m.trim()).filter(Boolean)
/** Shared-pool requests across ALL users, per day and per rolling hour (0 = no cap). Per-user limits live in ai_take(). */
const SHARED_DAILY_CAP = Math.max(0, Number(process.env.FORGE_SHARED_DAILY_CAP ?? 0) || 0)
const SHARED_HOURLY_CAP = Math.max(0, Number(process.env.FORGE_SHARED_HOURLY_CAP ?? 0) || 0)
const BUSY = 'FORGE\'s free AI is busy right now. Try again in a minute, or add your own free Gemini key in You → AI keys.'
const FOOD_TASKS = new Set(['parse_food_text', 'analyze_food_photo'])
const PHOTO_TASKS = new Set(['analyze_food_photo', 'physique_analysis'])

/** Pre-0009 rate limit: count this user's recent rows, then record the request. Not atomic; replaced by ai_take(). */
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_IMAGE_B64 = 4_000_000 // ≈ 3 MB of image bytes
const imageOk = (mime: unknown, data: unknown) =>
  IMAGE_TYPES.has(String(mime ?? 'image/jpeg')) && typeof data === 'string' && data.length > 0 && data.length <= MAX_IMAGE_B64
export function imagesOk(task: string, payload: any): boolean {
  if (task === 'analyze_food_photo') return imageOk(payload?.mimeType, payload?.image)
  if (task === 'physique_analysis') {
    const photos: unknown[] = Array.isArray(payload?.photos) ? payload.photos : []
    if (photos.length > 6) return false // the app has 5 angles
    const all = [...photos, ...(payload?.reference ? [payload.reference] : [])] as { mimeType?: unknown; data?: unknown }[]
    return all.every(p => imageOk(p?.mimeType, p?.data))
  }
  return true
}

const MEMORY_TASKS = new Set(['physique_analysis', 'generate_workout_plan', 'suggest_swap', 'coach_chat', 'coach_session', 'target_advice', 'insights'])

/** Saves the equipment typed in the plan builder into the user's training notes (once), so it is remembered. */
async function rememberEquipment(db: any, equipment: string) {
  const eq = equipment.trim().slice(0, 200)
  if (!eq) return
  const { data } = await db.from('settings').select('id, training_notes').maybeSingle()
  const notes = String(data?.training_notes ?? '')
  if (!data?.id || notes.toLowerCase().includes(eq.toLowerCase())) return
  const next = notes.replace(/\n?Equipment:[^\n]*/i, '').trim()
  await db.from('settings').update({ training_notes: `${next}${next ? '\n' : ''}Equipment: ${eq}`.slice(0, 1000) }).eq('id', data.id)
}

/** A short text summary of what FORGE knows about the caller. */
export async function memory(db: any): Promise<string> {
  const [st, gl, pl, ck, pr] = await Promise.all([
    db.from('settings').select('training_notes').maybeSingle(),
    db.from('goals').select('mode, current_weight_kg, target_weight_kg, training_days_per_week, training_minutes').maybeSingle(),
    db.from('workout_plans').select('name, days').eq('active', true).limit(1).maybeSingle(),
    db.from('physique_checkins').select('goal, priorities, analysis').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('profiles').select('age, sex, height_cm').maybeSingle(),
  ])
  const lines: string[] = []
  const notes = String(st.data?.training_notes ?? '').trim()
  if (notes) lines.push(`Limits, conditions and equipment: ${notes.slice(0, 1000)}`)
  const p = pr.data
  if (p) lines.push(`Profile: ${[p.age && `${p.age} y`, p.sex, p.height_cm && `${p.height_cm} cm`].filter(Boolean).join(', ')}`)
  const g = gl.data
  if (g) lines.push(`Goal: ${g.mode}, ${g.current_weight_kg} kg now, target ${g.target_weight_kg} kg, ${g.training_days_per_week} training days/week, ${g.training_minutes} min sessions`)
  const plan = pl.data
  if (plan) {
    const days = (Array.isArray(plan.days) ? plan.days : []).map((d: any) =>
      `${d?.name ?? 'Day'}: ${(Array.isArray(d?.exercises) ? d.exercises : []).map((e: any) => e?.name).filter(Boolean).join(', ')}`)
    lines.push(`Current plan "${plan.name}" (shows the equipment they use): ${days.join(' | ').slice(0, 1500)}`)
  }
  const a = ck.data?.analysis
  if (a) lines.push(`Last physique check-in: ${JSON.stringify({ priorities: a.priorities, composition: a.composition_estimate, focus: a.training?.emphasis }).slice(0, 800)}`)
  return lines.join('\n')
}

async function legacyTake(db: any, userId: string, task: string, shared: boolean) {
  const now = Date.now()
  const [{ count: m }, { count: d }] = await Promise.all([
    db.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 60_000).toISOString()),
    db.from('ai_usage').select('id', { count: 'exact', head: true }).gte('created_at', new Date(now - 86_400_000).toISOString()),
  ])
  if ((m ?? 0) >= (shared ? 6 : 12)) return { ok: false, reason: 'minute', shared }
  if ((d ?? 0) >= (shared ? 60 : 400)) return { ok: false, reason: 'day', shared }
  await db.from('ai_usage').insert({ user_id: userId, task }).then(() => undefined, () => undefined)
  return { ok: true, shared }
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

  // Images only (no PDFs or other documents on FORGE's shared key), each at most ~3 MB of base64.
  if (!imagesOk(task, body.payload)) return json(req, { error: 'bad_image', message: 'Send a JPEG, PNG or WebP photo under 3 MB.' }, 400)

  // Validate everything that needs no quota BEFORE ai_take records the request, so a bad payload or an under-18
  // physique request never counts against the user's limits or the shared daily cap.
  const request = buildRequest(task, body.payload)
  if (!request) return json(req, { error: 'unknown_task' }, 400)
  if (task === 'physique_analysis') {
    // The profile age defaults to 25, so a number alone proves nothing: the app sends the user's own age confirmation
    // (self-declared, like the age itself) and the saved age must be 18+.
    if (body.payload?.age_confirmed !== true) return json(req, { error: 'age_unconfirmed', message: 'Confirm your age in the physique check-in first.' }, 403)
    const { data: prof } = await who.db.from('profiles').select('age').maybeSingle()
    const p = prof as { age?: unknown } | null
    if (!(Number(p?.age) >= 18)) return json(req, { error: 'age_restricted', message: 'Physique check-ins are for people 18 and over.' }, 403)
  }
  // The language: explanations and chat come back in it. Food and exercise names stay English so they match the catalog.
  const LANG_NAME: Record<string, string> = { hi: 'Hindi', mr: 'Marathi' }
  const lang = LANG_NAME[String((body as { lang?: unknown }).lang ?? '')]
  const part = (request as any).contents?.[0]?.parts?.find((p: any) => typeof p.text === 'string')
  // Memory: what the user already told FORGE (limits, equipment, goal, current plan, last check-in) goes into every
  // coaching request, so the AI never asks again or suggests something outside it. Read with the caller's JWT (RLS).
  if (MEMORY_TASKS.has(task) && part) {
    if (task === 'generate_workout_plan' && typeof body.payload?.equipment === 'string') await rememberEquipment(who.db, body.payload.equipment)
    const mem = await memory(who.db).catch(() => '')
    if (mem) part.text += `\n\nWHAT THIS USER ALREADY TOLD FORGE (hard limits: respect every one, never contradict them):\n${mem}`
  }
  if (lang && !FOOD_TASKS.has(task) && part) part.text += `\n\nWrite every human-readable sentence in simple everyday ${lang} (Devanagari script). Keep food names, exercise names, units and numbers in English.`

  // One database round trip: the atomic rate limit (records this request, then checks; migration 0009) and the key row.
  const [rpc, { data: row }] = await Promise.all([
    who.db.rpc('ai_take', { p_task: task, p_global_cap: SHARED_DAILY_CAP, p_global_hour_cap: SHARED_HOURLY_CAP }),
    who.db.from('user_ai_keys').select('ciphertext').maybeSingle(),
  ])
  // Until migration 0009 is applied ai_take() doesn't exist: fall back to per-user counting (no global cap).
  const take = rpc.error && /ai_take|PGRST202|42883/.test(`${rpc.error.code} ${rpc.error.message}`)
    ? { data: await legacyTake(who.db, who.userId, task, !row?.ciphertext), error: null }
    : rpc
  if (take.error || !take.data) return json(req, { error: 'ai_unavailable' }, 503)
  const shared = take.data.shared === true
  if (!take.data.ok) {
    const reason = take.data.reason
    if (reason === 'global') return json(req, { error: 'quota_exhausted', message: BUSY }, 429)
    if (reason === 'minute') return json(req, { error: 'rate_limited', message: 'Slow down — too many AI requests this minute.' }, 429)
    if (reason === 'hour') return json(req, { error: 'rate_limited', message: 'That\'s a lot of AI this hour. It frees up again within the hour.' }, 429)
    return json(req, { error: 'rate_limited', message: shared ? 'Daily free AI limit reached. It resets in 24 hours, or add your own free Gemini key in You → AI keys for more.' : 'Daily AI limit reached. It resets in 24 hours.' }, 429)
  }
  // Body photos never go through FORGE's shared keys: those run on Google's free tier, where Google may use inputs
  // to improve its products and people may review them. Physique analysis needs the user's own key.
  if (task === 'physique_analysis' && shared) {
    return json(req, { error: 'needs_own_key', message: 'Physique analysis needs your own free Gemini key (You → AI keys), so your body photos never go through FORGE\'s shared AI. Your roadmap below is calculated without AI.' }, 403)
  }
  let keys: string[] = SHARED_KEYS
  if (!shared) {
    try { keys = decryptKeys(who.userId, row?.ciphertext ?? '') } catch {
      return json(req, { error: 'no_keys', message: 'Your saved keys could not be read. Add them again in You → AI keys.' }, 412)
    }
  }
  if (!keys.length) return json(req, { error: 'no_keys', message: 'Add your Gemini API keys in You → AI keys.' }, 412)

  let result: any
  // Food (typed, spoken or photo) is recognition work: the lite model answers in a few seconds and is accurate enough,
  // with the full model as fallback. Everything else starts with the full model.
  // Free-tier Flash allows only 20 requests a day per project, Flash-Lite far more. The shared pool is Lite-only;
  // users with their own keys get Lite first for food and full Flash first for plans, reviews and physique.
  // Physique: 5 photos. gemini-3-flash-preview took 2+ minutes on them (2026-11-23) and the Lite models often answer
  // 503 under load, so try the fast, stable models first and the slow preview last.
  const PHYSIQUE_MODELS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3-flash-preview']
  const order = shared ? SHARED_MODELS : task === 'physique_analysis' ? PHYSIQUE_MODELS
    : FOOD_TASKS.has(task) || task === 'suggest_swap' ? [...MODELS.filter(m => m.includes('lite')), ...MODELS.filter(m => !m.includes('lite'))] : MODELS
  const t0 = Date.now()
  // Photos: no parallel burst, no hedge, and at most 2 sends in total (a second only after an error or quota).
  // The shared pool starts one call at a time to save quota. Own keys keep the hedged race.
  const photo = PHOTO_TASKS.has(task)
  const burst = photo || shared ? 1 : FOOD_TASKS.has(task) ? 3 : 2
  // Food text answers in ~1.2 s on Lite: a second call after 1.5 s cuts the slow tail.
  const hedge = task === 'physique_analysis' ? 9_000 : photo ? Infinity : FOOD_TASKS.has(task) ? 1_500 : undefined
  let quota = false
  // Google only: no second AI company ever sees a request. 22 s budget; the phone waits 28 s.
  try { result = await callGemini(keys, request, order, photo ? 26_000 : undefined, hedge, burst, task === 'physique_analysis' ? 6 : photo ? 2 : undefined) } catch (e) {
    if (!(e instanceof Quota)) return json(req, { error: 'ai_unavailable' }, 503)
    quota = true; result = null
  }
  console.log(`[ai] ${task} ${result === null ? 'no answer' : 'ok'} ${Date.now() - t0}ms ${shared ? 'shared' : 'own'}`)
  if (result === null && quota) return json(req, { error: 'quota_exhausted', message: shared ? BUSY : 'All your Gemini keys are out of free quota right now. Try later or add another key.' }, 429)
  if (result === null && shared) return json(req, { error: 'ai_busy', message: BUSY }, 429) // 429 so both apps show this message, not "too slow"
  if (result === null) return json(req, { error: 'ai_slow', message: task === 'physique_analysis' ? 'Google\'s AI is overloaded right now (not a FORGE fault). Try the check-in again in a few minutes.' : 'Google\'s AI is busy or slow right now. Try again in a minute, or log it manually.' }, 503)

  if (FOOD_TASKS.has(task)) {
    const checked = postCheckFood(result)
    if (checked.notFood) return json(req, { error: 'not_food', message: checked.notFood }, 422)
    return json(req, { items: checked.items, rejected: checked.rejected })
  }
  if (task === 'coach_chat') {
    const reply = String(result?.reply ?? '').slice(0, 2000)
    return json(req, { reply: reply || 'I can only help with training, nutrition and the FORGE app.', on_topic: result?.on_topic !== false })
  }
  if (task === 'suggest_swap') {
    // Only real library exercises from the candidate list, never one the model made up.
    const ids = new Set((Array.isArray(body.payload?.candidates) ? body.payload.candidates : []).map((c: any) => String(c?.id)))
    const swaps = (Array.isArray(result?.swaps) ? result.swaps : []).filter((x: any) => ids.has(String(x?.id)))
      .slice(0, 3).map((x: any) => ({ id: String(x.id), reason: String(x.reason ?? '').slice(0, 300) }))
    return json(req, { swaps })
  }
  if (task === 'generate_workout_plan') {
    // Pure strength plans on 1-3 days stay lean on purpose; everything else must train every muscle.
    const lean = /strength|power/i.test(String(body.payload?.focus ?? '')) && Number(body.payload?.days_per_week) < 4
    // A revision does exactly what the user asked ("less abs"), so FORGE doesn't re-add muscles on top.
    if (!lean && body.payload?.revise !== true) result = ensureCoverage(result)
  }
  return json(req, result)
}
