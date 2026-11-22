import { generateKeyPairSync, sign } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { verifyLocally } from '../_lib/http.js'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-kid', alg: 'ES256' }
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
function token(claims: Record<string, unknown>, kid = 'test-kid') {
  const head = b64({ alg: 'ES256', kid, typ: 'JWT' }), body = b64(claims)
  const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
  return `${head}.${body}.${sig}`
}
const now = Date.now()
const good = { sub: 'user-1', aud: 'authenticated', exp: Math.floor(now / 1000) + 3600 }

describe('local session check (no Supabase round trip)', () => {
  beforeAll(() => { vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] })))) })
  afterAll(() => vi.unstubAllGlobals())
  it('accepts a valid token', async () => expect(await verifyLocally(token(good), 'https://x', now)).toBe('user-1'))
  it('rejects an expired token', async () => expect(await verifyLocally(token({ ...good, exp: Math.floor(now / 1000) - 5 }), 'https://x', now)).toBeNull())
  it('rejects a tampered payload', async () => {
    const [h, , s] = token(good).split('.')
    expect(await verifyLocally(`${h}.${b64({ ...good, sub: 'someone-else' })}.${s}`, 'https://x', now)).toBeNull()
  })
  it('rejects a non-user audience', async () => expect(await verifyLocally(token({ ...good, aud: 'anon' }), 'https://x', now)).toBeNull())
  it('falls back (undefined) for an unknown key id', async () => expect(await verifyLocally(token(good, 'other'), 'https://x', now)).toBeUndefined())
})
