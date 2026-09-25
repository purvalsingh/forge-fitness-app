import { caller, json, preflight, readBody } from './_lib/http.js'
import { encryptKeys } from './_lib/crypto.js'
import { GEMINI_KEY_RE } from './_lib/guard.js'

/**
 * Per-user Gemini keys.
 *   GET    -> { count, hints }            never returns a key
 *   POST   { keys: string[] } (2–5)     -> validates each with Google, encrypts, stores
 *   DELETE                               -> removes them
 */
export const OPTIONS = preflight

async function verify(key: string): Promise<'ok' | 'invalid' | 'unreachable'> {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', {
      headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(8000),
    })
    if (r.ok) return 'ok'
    // 429 means the key is real but busy — accept it.
    if (r.status === 429) return 'ok'
    return 'invalid'
  } catch { return 'unreachable' }
}

export async function GET(req: Request) {
  const who = await caller(req)
  if (!who) return json(req, { error: 'unauthorized' }, 401)
  const { data, error } = await who.db.from('user_ai_keys').select('key_count, hints, updated_at').maybeSingle()
  if (error) return json(req, { error: 'db_error' }, 500)
  return json(req, { count: data?.key_count ?? 0, hints: data?.hints ?? [], updated_at: data?.updated_at ?? null })
}

export async function POST(req: Request) {
  const who = await caller(req)
  if (!who) return json(req, { error: 'unauthorized' }, 401)
  const body = await readBody(req, 4096) as { keys?: unknown } | null
  const raw = Array.isArray(body?.keys) ? body!.keys : null
  if (!raw) return json(req, { error: 'bad_request', message: 'Send { keys: [...] }.' }, 400)
  const keys = [...new Set(raw.map(k => String(k ?? '').trim()).filter(Boolean))]
  if (keys.length < 2 || keys.length > 5) {
    return json(req, { error: 'bad_count', message: 'Add at least 2 and at most 5 different Gemini API keys.' }, 400)
  }
  const malformed = keys.findIndex(k => !GEMINI_KEY_RE.test(k))
  if (malformed >= 0) {
    return json(req, { error: 'malformed', index: malformed, message: `Key ${malformed + 1} doesn't look like a Gemini API key (it should start with "AIza").` }, 400)
  }
  const results = await Promise.all(keys.map(verify))
  const bad = results.map((r, i) => (r === 'invalid' ? i + 1 : 0)).filter(Boolean)
  if (bad.length) {
    return json(req, { error: 'invalid_keys', bad, message: `Google rejected key ${bad.join(', ')}. Copy it again from aistudio.google.com/apikey.` }, 400)
  }
  const row = {
    user_id: who.userId,
    ciphertext: encryptKeys(who.userId, keys),
    hints: keys.map(k => `…${k.slice(-4)}`),
    key_count: keys.length,
    updated_at: new Date().toISOString(),
  }
  const { error } = await who.db.from('user_ai_keys').upsert(row)
  if (error) return json(req, { error: 'db_error', message: 'Could not save your keys. Try again.' }, 500)
  return json(req, { count: row.key_count, hints: row.hints, unverified: results.filter(r => r === 'unreachable').length })
}

export async function DELETE(req: Request) {
  const who = await caller(req)
  if (!who) return json(req, { error: 'unauthorized' }, 401)
  const { error } = await who.db.from('user_ai_keys').delete().eq('user_id', who.userId)
  if (error) return json(req, { error: 'db_error' }, 500)
  return json(req, { count: 0, hints: [] })
}
