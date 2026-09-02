// Gemini transport shared by the sync and background functions.
// The keys live only in this process's environment; they never reach the browser.
const MODEL = process.env.GEMINI_MODEL ?? 'gemini-3.6-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`
const COOLDOWN_MS = 60_000

interface KeyState { key: string; cooldownUntil: number }

export const keys: KeyState[] = [1, 2, 3]
  .map(n => process.env[`GEMINI_API_KEY_${n}`]?.trim())
  .filter((k): k is string => Boolean(k))
  .map(key => ({ key, cooldownUntil: 0 }))

export async function callGemini(
  body: unknown,
  extract: (response: unknown) => unknown | null,
): Promise<unknown | null> {
  const now = Date.now()
  const available = keys.filter(k => k.cooldownUntil <= now)
  if (available.length === 0) return null

  for (const state of available) {
    let res: Response
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        // The key goes in a header, never the URL: query strings leak into logs and proxies.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': state.key },
        body: JSON.stringify(body),
      })
    } catch {
      state.cooldownUntil = Date.now() + COOLDOWN_MS
      continue
    }
    if (res.status === 429 || res.status === 403 || res.status >= 500) {
      // Rate limited / exhausted / upstream trouble: park this key, try the next. No retry storms.
      state.cooldownUntil = Date.now() + COOLDOWN_MS
      continue
    }
    if (!res.ok) return null
    return extract(await res.json().catch(() => null))
  }
  return null
}
