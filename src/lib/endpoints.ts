/**
 * Endpoint failover.
 *
 * The static app can only be served by a host that is up, so it cannot fail *itself* over.
 * What it can do is treat every backend call as replaceable: try the origin it was served from
 * first, and on a network-level failure move to the next configured host and remember that
 * choice. A host that is exhausted, blocked by DNS, or simply down then costs one failed
 * request instead of a dead app.
 */

const COOLDOWN_MS = 5 * 60_000
const LAST_GOOD_KEY = 'forge:last-good-base'

/** Bases that recently failed at the network level, with the time they may be retried. */
const cooldowns = new Map<string, number>()

function parseList(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

/** Ordered, de-duplicated candidates: last known good, then same-origin, then the configured rest. */
export function candidates(primary: string, fallbacks: string[]): string[] {
  const remembered = typeof localStorage !== 'undefined'
    ? localStorage.getItem(`${LAST_GOOD_KEY}:${primary}`)
    : null
  const all = [remembered, primary, ...fallbacks].filter((b): b is string => Boolean(b))
  const now = Date.now()
  const seen = new Set<string>()
  const ordered = all.filter(b => (seen.has(b) ? false : (seen.add(b), true)))
  const ready = ordered.filter(b => (cooldowns.get(b) ?? 0) <= now)
  // If everything is cooling down, try them anyway rather than refusing to work.
  return ready.length > 0 ? ready : ordered
}

export function rememberGood(primary: string, base: string) {
  cooldowns.delete(base)
  try { localStorage.setItem(`${LAST_GOOD_KEY}:${primary}`, base) } catch { /* private mode */ }
}

/** Test seam: clears the in-memory cooldowns. */
export function resetFailoverState() {
  cooldowns.clear()
}

export function markBad(base: string) {
  cooldowns.set(base, Date.now() + COOLDOWN_MS)
}

/** A network-level failure — the request never got an answer — is the only thing worth failing over. */
export function isUnreachable(e: unknown): boolean {
  return e instanceof TypeError || /failed to fetch|networkerror|load failed|connection/i.test(String(e))
}

export const SUPABASE_PRIMARY = (import.meta.env.VITE_SUPABASE_URL ?? '').trim().replace(/\/$/, '')
export const SUPABASE_FALLBACKS = parseList(import.meta.env.VITE_SUPABASE_FALLBACKS)
export const AI_FALLBACKS = parseList(import.meta.env.VITE_AI_FALLBACKS)

/**
 * A `fetch` that walks the candidate list. Only unreachable hosts trigger a move — an HTTP error
 * is a real answer from a live server and must be returned untouched, or a wrong password would
 * silently retry against every host in turn.
 */
export function failoverFetch(primary: string, fallbacks: string[]): typeof fetch {
  return async (input, init) => {
    const requested = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const bases = candidates(primary, fallbacks)
    let lastError: unknown = new TypeError('No endpoint configured')

    for (const base of bases) {
      const url = requested.startsWith(primary) ? base + requested.slice(primary.length) : requested
      try {
        const res = await fetch(url, input instanceof Request && typeof input !== 'string'
          ? { ...init, method: init?.method ?? input.method, headers: init?.headers ?? input.headers, body: init?.body ?? undefined }
          : init)
        rememberGood(primary, base)
        return res
      } catch (e) {
        if (!isUnreachable(e)) throw e
        markBad(base)
        lastError = e
      }
    }
    throw lastError
  }
}
