import { caller, json, preflight, readBody } from './_lib/http.js'
import { decryptKeys, encryptKeys } from './_lib/crypto.js'
import { GEMINI_KEY_RE } from './_lib/guard.js'

/**
 * Per-user Gemini keys.
 *   GET    -> { count, hints }            never returns a key
 *   POST   { keys: string[], mode?: 'add' } -> validates each with Google, encrypts, stores.
 *          mode 'add' merges the new keys into the saved ones (so adding a 3rd key never asks for the first two again);
 *          without it the list replaces what is saved. The saved total must end up 1–5.
 *   DELETE ?hint=…abcd                   -> removes the one key with that hint (no hint: removes all)
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
  const body = await readBody(req, 4096) as { keys?: unknown; mode?: unknown } | null
  const raw = Array.isArray(body?.keys) ? body!.keys : null
  if (!raw) return json(req, { error: 'bad_request', message: 'Send { keys: [...] }.' }, 400)
  const incoming = [...new Set(raw.map(k => String(k ?? '').trim()).filter(Boolean))]
  const existing = body?.mode === 'add' ? await savedKeys(who) : []
  const fresh = incoming.filter(k => !existing.includes(k))
  const keys = [...existing, ...fresh]
  if (keys.length > 5) return json(req, { error: 'bad_count', message: `You can save up to 5 keys. You already have ${existing.length}; remove one first.` }, 400)
  if (keys.length < 1) return json(req, { error: 'bad_count', message: 'Add a Gemini API key.' }, 400)
  // Each save checks keys with Google: cap it so FORGE can't be used as a free key-validity checker.
  if (fresh.length) {
    const { count } = await who.db.from('ai_usage').select('id', { count: 'exact', head: true })
      .eq('task', 'save_keys').gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
    if ((count ?? 0) >= 10) return json(req, { error: 'rate_limited', message: 'Too many key checks this hour. Try again later.' }, 429)
    await who.db.from('ai_usage').insert({ user_id: who.userId, task: 'save_keys' }).then(() => undefined, () => undefined)
  }
  const malformed = fresh.findIndex(k => !GEMINI_KEY_RE.test(k))
  if (malformed >= 0) {
    return json(req, { error: 'malformed', index: malformed, message: `Key ${malformed + 1} doesn't look like a Gemini API key (Gemini keys start with "AIza" or "AQ.").` }, 400)
  }
  // Only the new keys need checking with Google; saved ones were verified when they were added.
  const results = await Promise.all(fresh.map(verify))
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

async function savedKeys(who: { userId: string; db: any }): Promise<string[]> {
  const { data } = await who.db.from('user_ai_keys').select('ciphertext').maybeSingle()
  if (!data?.ciphertext) return []
  try { return decryptKeys(who.userId, data.ciphertext) } catch { return [] }
}

export async function DELETE(req: Request) {
  const who = await caller(req)
  if (!who) return json(req, { error: 'unauthorized' }, 401)
  const hint = new URL(req.url).searchParams.get('hint')
  if (hint) {
    // Remove ONE key with that hint: two keys can share their last 4 characters.
    const all = await savedKeys(who)
    const at = all.findIndex(k => `…${k.slice(-4)}` === hint)
    const left = at < 0 ? all : all.filter((_, i) => i !== at)
    if (left.length === 0) { await who.db.from('user_ai_keys').delete().eq('user_id', who.userId); return json(req, { count: 0, hints: [] }) }
    const row = { user_id: who.userId, ciphertext: encryptKeys(who.userId, left), hints: left.map(k => `…${k.slice(-4)}`),
      key_count: left.length, updated_at: new Date().toISOString() }
    const { error } = await who.db.from('user_ai_keys').upsert(row)
    if (error) return json(req, { error: 'db_error' }, 500)
    return json(req, { count: row.key_count, hints: row.hints })
  }
  const { error } = await who.db.from('user_ai_keys').delete().eq('user_id', who.userId)
  if (error) return json(req, { error: 'db_error' }, 500)
  return json(req, { count: 0, hints: [] })
}
