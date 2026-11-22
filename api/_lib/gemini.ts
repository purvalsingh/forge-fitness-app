/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto'
import { extractJson } from './prompts.js'

const ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

/** Short one-way tag for a key. Module-level state never holds a raw key, only this. */
const tag = (key: string) => createHash('sha256').update(key).digest('hex').slice(0, 12)
/** Warm-instance memory: a key that just hit its quota is skipped for a minute. Keyed by model + key tag. */
const cooldowns = new Map<string, number>()

export class Quota extends Error {}

/** Total time budget per request. The phone gives up at 30 s, Vercel at maxDuration; we answer well before both. */
const BUDGET_MS = 22_000
/** Every HEDGE_MS without an answer another (model, key) joins the race; the first valid answer wins. */
const HEDGE_MS = 2_000
/** How many calls start at once. Google's 503 "overloaded" is per model, so the opening burst spans different models. */
const BURST = 2
const deadModels = new Set<string>()

type Outcome = { out: any } | { quota: true } | { skipModel: true } | { overloaded: true } | { fail: true }

/** Gemini 2.5 models take a token budget, Gemini 3 a level. Unknown aliases keep the level and fall back on a 400. */
function forModel(model: string, body: any): any {
  const t = body?.generationConfig?.thinkingConfig
  if (!t?.thinkingLevel || !model.includes('2.5')) return body
  const budget = t.thinkingLevel === 'minimal' ? (model.includes('pro') ? 128 : 0) : 512
  return { ...body, generationConfig: { ...body.generationConfig, thinkingConfig: { thinkingBudget: budget } } }
}
const withoutThinking = (body: any) => { const { thinkingConfig: _t, ...gc } = body.generationConfig ?? {}; return { ...body, generationConfig: gc } }

async function attempt(model: string, key: string, slotNo: number, body: any, deadline: number, abort: AbortSignal): Promise<Outcome> {
  const slot = `${model}:${tag(key)}`
  const t0 = Date.now()
  // Timing only, never the key or any content: which model, which key slot (#n in this request), status, milliseconds.
  const log = (what: string) => console.log(`[ai] ${model} key#${slotNo} ${what} ${Date.now() - t0}ms`)
  let payload = forModel(model, body)
  try {
    for (let tries = 0; ; tries++) {
      const res = await fetch(ENDPOINT(model), {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload),
        signal: AbortSignal.any([abort, AbortSignal.timeout(Math.max(1_000, deadline - Date.now()))]),
      })
      log(`http ${res.status}`)
      // This model rejects the thinking field: retry the same call at once without it.
      if (res.status === 400 && payload?.generationConfig?.thinkingConfig && tries === 0) { payload = withoutThinking(payload); continue }
      if (res.status === 429) {
        // Free tier: full Flash models allow ~20 requests a day per project. Google says when to come back; honour it
        // (up to a day) instead of re-trying every minute and paying a wasted round trip on each request.
        const wait = Number((await res.text().catch(() => '')).match(/"retryDelay":\s*"(\d+)(?:\.\d+)?s"/)?.[1] ?? 60)
        cooldowns.set(slot, Date.now() + Math.min(86_400, Math.max(60, wait)) * 1000)
        return { quota: true }
      }
      if (res.status >= 500) { cooldowns.set(slot, Date.now() + 30_000); return { overloaded: true } }
      if (res.status === 404) { deadModels.add(model); return { skipModel: true } }
      if (res.status === 403) return { fail: true }
      if (!res.ok) return { fail: true }
      const out = extractJson(await res.json().catch(() => null))
      return out !== null ? { out } : { fail: true }
    }
  } catch (e) {
    log(abort.aborted ? 'cancelled (another answered first)' : `error ${(e as Error)?.name}`)
    if (!abort.aborted) cooldowns.set(slot, Date.now() + 30_000)
    return { fail: true }
  }
}

/** (model, key) pairs, models in preference order, keys rotated so neighbouring calls use different models AND keys. */
function plan(keys: string[], models: string[]): (readonly [string, string])[] {
  const live = models.filter(m => !deadModels.has(m))
  const all: (readonly [string, string])[] = []
  for (let r = 0; r < keys.length; r++) live.forEach((m, i) => all.push([m, keys[(i + r) % keys.length]] as const))
  const now = Date.now()
  for (const [slot, until] of cooldowns) if (until <= now) cooldowns.delete(slot)
  const ready = all.filter(([m, k]) => (cooldowns.get(`${m}:${tag(k)}`) ?? 0) <= now)
  // Everything cooling down (a bad minute at Google): try anyway rather than fail instantly.
  return ready.length ? [...ready, ...all.filter(c => !ready.includes(c))] : all
}

/**
 * Hedged Gemini call. BURST calls start at once on different models; every HEDGE_MS without an answer, or right after
 * a failure, the next candidate joins. A model that answers 503 (overloaded) is moved to the back of the queue. The
 * first valid answer wins and the rest are aborted, so one slow or overloaded model never holds the user.
 * hedgeMs = Infinity, burst = 1 and maxAttempts = 2 send a photo once, plus one retry only after an error or quota.
 */
export async function callGemini(keys: string[], body: unknown, models: string[], budgetMs = BUDGET_MS, hedgeMs = HEDGE_MS, burst = BURST, maxAttempts = Infinity): Promise<any> {
  let attempts = 0
  const deadline = Date.now() + budgetMs
  const slotNo = new Map(keys.map((k, i) => [k, i + 1])) // per request, dropped when it returns
  const queue = plan(keys, models)
  const stop = new AbortController()
  let sawQuota = false
  return new Promise<any>((resolve, reject) => {
    let running = 0, done = false, hedge: ReturnType<typeof setTimeout> | undefined
    const giveUp = () => finish(sawQuota ? undefined : null, sawQuota ? new Quota() : undefined)
    const finish = (v: any, err?: unknown) => { if (done) return; done = true; stop.abort(); clearTimeout(timer); clearTimeout(hedge); err ? reject(err) : resolve(v) }
    const timer = setTimeout(giveUp, budgetMs)
    const launch = () => {
      while (queue.length && deadModels.has(queue[0][0])) queue.shift()
      if (done) return
      if (!queue.length || attempts >= maxAttempts) { if (running === 0) giveUp(); return }
      const [model, key] = queue.shift()!
      running++; attempts++
      clearTimeout(hedge); if (Number.isFinite(hedgeMs)) hedge = setTimeout(launch, hedgeMs)
      attempt(model, key, slotNo.get(key) ?? 0, body, deadline, stop.signal).then(r => {
        running--
        if ('out' in r) return finish(r.out)
        if ('quota' in r) sawQuota = true
        if ('overloaded' in r) { const same = queue.filter(c => c[0] === model); same.forEach(c => queue.splice(queue.indexOf(c), 1)); queue.push(...same) }
        launch()
      })
    }
    for (let i = 0; i < burst; i++) launch()
  })
}
