/**
 * Full-day simulation of FORGE's shared Gemini pool (no network calls).
 *
 * Models what production does: 4 free keys × 2 Flash-Lite models, each with its own 15 requests/minute and
 * measured daily quota; one call per request plus extra calls from hedging (slow answers) and 503 retries; and
 * the database limits in ai_take(): per user per minute / hour / day, plus a global hourly pace and daily cap.
 * 20 users follow an Indian meal-time day at ~1.5× average use, one Gemini day (reset 13:30 IST = 00:00 PT).
 *
 * Passes when no admitted request ever finds every key/model slot exhausted (the pool never runs dry), so any
 * over-use is refused up front by the database with the clean "busy" / limit message instead of a slow failure.
 *
 * Usage: node scripts/simulate-shared-pool.mjs [rpd35] [rpd31] [--seeds N]
 */
const POS = process.argv.slice(2).filter(a => !a.startsWith('--'))
const RPD35 = Number(POS[0] ?? 500)   // gemini-3.5-flash-lite daily quota per key: 500, measured 2026-11-21 (Google 429: PerDayPerProjectPerModel-FreeTier = 500)
const RPD31 = Number(POS[1] ?? 500)   // gemini-3.1-flash-lite daily quota per key (measured)
const SEEDS = Number(process.argv.find(a => a.startsWith('--seeds='))?.split('=')[1] ?? 50)

export const KEYS = 4
export const RPM = 15
/** Gemini calls per admitted request: 1 + hedge duplicates + retries after 503. Measured in this session's runs. */
const HEDGE_P = 0.2          // share of text requests slow enough (>1.5-2 s) to start a second call
const FAIL_503 = { '3.5': 0.05, '3.1': 0.4 } // observed overload rates per model
export const MODELS = [{ id: '3.5', rpd: RPD35 }, { id: '3.1', rpd: RPD31 }]

/** Budget derived from the measured quota: 85 % of what the pool can serve after call amplification. */
export function budget(rpd35 = RPD35, rpd31 = RPD31) {
  // Budget on 3.5-lite alone. 3.1-lite fails ~40 % of calls with 503 (measured), so once 3.5 is used up all four
  // keys on 3.1 fail together 2-3 % of the time: it is kept as spare capacity for spikes, never counted on.
  void rpd31
  const calls = KEYS * rpd35
  const perRequest = 1 + HEDGE_P + FAIL_503['3.5']
  const daily = Math.floor(calls / perRequest * 0.85)
  return {
    daily,
    hourly: Math.ceil(daily / 6),             // no rolling hour may take more than 1/6 of the day's budget
    perUser: { minute: 6, hour: 20, day: 60 }, // generous for one person, but 20 people at the day limit still fit the pool
  }
}

// ---- users and their day ---------------------------------------------------------------------------------
const AVG_PER_DAY = 12  // typical: ~6 food logs/photos, ~4 coach messages, 1-2 plan/review/insight calls
const LOAD = Number(process.argv.find(a => a.startsWith('--load='))?.split('=')[1] ?? 1.5) // 1.5 = the target; try --load=10 for abuse
/** Share of a day's AI use per IST hour (meals and evening coach chats). */
const HOURLY = [0.5, 0.2, 0.1, 0.1, 0.1, 0.3, 1.5, 3, 4, 3, 2, 2, 4, 5, 3, 2, 2, 3, 4, 6, 7, 5, 3, 1.5]

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 } }

export function simulate(seed, b = budget()) {
  const r = rng(seed)
  const hourSum = HOURLY.reduce((a, x) => a + x, 0)
  // Each user's appetite: most near average, a few heavy users at 2-3×.
  const users = Array.from({ length: 20 }, () => { const x = r(); return AVG_PER_DAY * LOAD * (x < 0.15 ? 2.5 : x < 0.5 ? 1.2 : 0.7) })
  // Requests as (time in seconds since reset, user). Reset is 13:30 IST, so second 0 = 13:30.
  const reqs = []
  users.forEach((perDay, u) => {
    for (let h = 0; h < 24; h++) {
      const istHour = (13 + h + (h >= 0 ? 0 : 0)) % 24 // hour h after 13:30 starts at IST hour 13+h (approx.)
      const mean = perDay * HOURLY[istHour] / hourSum
      // Poisson draw, then bursty placement: meal logs come in clusters of a few seconds.
      let n = 0; for (let L = Math.exp(-mean), p = 1; (p *= r()) > L;) n++
      for (let i = 0; i < n; i++) {
        const t = h * 3600 + Math.floor(r() * 3600)
        reqs.push([t, u]); if (r() < 0.3) reqs.push([t + 2 + Math.floor(r() * 20), u]) // a follow-up edit / retry
      }
    }
  })
  reqs.sort((a, b2) => a[0] - b2[0])

  const userLog = users.map(() => [])
  const sharedLog = []
  const slots = []
  for (let k = 0; k < KEYS; k++) for (const m of MODELS) slots.push({ k, m: m.id, rpd: m.rpd, used: 0, minute: [], cool: 0 })
  const out = { requests: reqs.length, served: 0, refusedUser: 0, busy: 0, dry: 0, calls: 0, peakMinute: 0 }
  let rot = 0

  for (const [t, u] of reqs) {
    // ---- ai_take(): per-user minute/hour/day, then global hour/day (instant refusals) ----
    const log = userLog[u]
    const inWin = (arr, w) => arr.filter(x => x > t - w).length
    if (inWin(log, 60) >= b.perUser.minute || inWin(log, 3600) >= b.perUser.hour || log.length >= b.perUser.day) { out.refusedUser++; continue }
    if (sharedLog.length >= b.daily || inWin(sharedLog, 3600) >= b.hourly) { out.busy++; continue }
    log.push(t); sharedLog.push(t)

    // ---- Gemini: Lite models in order, keys rotated; 429 = minute/day full, 503 = overloaded ----
    const callsNeeded = 1 + (r() < HEDGE_P ? 1 : 0)
    let answered = false
    for (let c = 0; c < callsNeeded; c++) {
      let placed = false
      // Same order as api/ai.ts: every key on 3.5-lite (starting at a rotating key), then every key on 3.1-lite.
      const start = rot++ % KEYS
      const order = MODELS.flatMap(m => Array.from({ length: KEYS }, (_, j) => slots.find(s => s.m === m.id && s.k === (start + j) % KEYS)))
      for (let i = 0; i < order.length && !placed; i++) {
        const s = order[i]
        s.minute = s.minute.filter(x => x > t - 60)
        if (s.cool > t || s.used >= s.rpd || s.minute.length >= RPM) continue
        s.used++; s.minute.push(t); out.calls++
        if (r() < FAIL_503[s.m]) { s.cool = t + 30; continue } // overloaded: try the next slot
        placed = true; answered = true
      }
    }
    if (answered) out.served++; else out.dry++ // admitted but every slot full or failing = the pool ran dry
    out.peakMinute = Math.max(out.peakMinute, inWin(sharedLog, 60))
  }
  out.minLeft = Math.min(...MODELS.map(m => slots.filter(s => s.m === m.id).reduce((a, s) => a + s.rpd - s.used, 0)))
  return out
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const b = budget()
  console.log(`measured quota per key: 3.5-flash-lite ${RPD35}/day, 3.1-flash-lite ${RPD31}/day, ${RPM}/min each`)
  console.log(`budget: FORGE_SHARED_DAILY_CAP=${b.daily}  FORGE_SHARED_HOURLY_CAP=${b.hourly}  per user ${JSON.stringify(b.perUser)}`)
  const runs = Array.from({ length: SEEDS }, (_, i) => simulate(i + 1, b))
  const sum = k => runs.reduce((a, x) => a + x[k], 0)
  const max = k => Math.max(...runs.map(x => x[k]))
  console.log(`${SEEDS} simulated days, 20 users at ${LOAD}× average (${AVG_PER_DAY * LOAD}/user/day):`)
  console.log(`  requests/day avg ${Math.round(sum('requests') / SEEDS)}, served ${Math.round(sum('served') / SEEDS)}, user-limit refusals ${Math.round(sum('refusedUser') / SEEDS)}, busy ${Math.round(sum('busy') / SEEDS)}`)
  console.log(`  Gemini calls/day avg ${Math.round(sum('calls') / SEEDS)}, peak shared requests in one minute ${max('peakMinute')}`)
  console.log(`  pool ran dry (admitted but no quota): ${sum('dry')} across all days; least quota left at reset: ${Math.min(...runs.map(x => x.minLeft))}`)
  process.exit(sum('dry') === 0 ? 0 : 1)
}
