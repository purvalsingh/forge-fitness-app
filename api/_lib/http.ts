import { createPublicKey, verify, type JsonWebKey as Jwk, type KeyObject } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared request plumbing for the API routes: CORS, JSON replies, and a Supabase client that acts
 * AS the caller (their JWT), so Row Level Security — not this code — decides what they can touch.
 * No service-role key is used anywhere.
 */
const ALLOWED = new Set([
  'https://forgefit-india.vercel.app',
  'https://localhost',          // Capacitor Android
  'capacitor://localhost',      // Capacitor iOS
  'http://localhost:5173',
  'http://localhost:4173',
  ...(process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean),
])

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const ok = ALLOWED.has(origin) || /^https:\/\/forgefit-[a-z0-9-]+-purvalsingh841-7189\.vercel\.app$/.test(origin)
  return {
    ...(ok ? { 'access-control-allow-origin': origin } : {}),
    'access-control-allow-headers': 'authorization, content-type, apikey',
    'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
    'access-control-max-age': '86400',
    vary: 'origin',
  }
}

export function json(req: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(req), 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export const preflight = (req: Request) => new Response(null, { status: 204, headers: cors(req) })

export interface Caller { userId: string; db: SupabaseClient }

/** Supabase's public signing keys (ES256), fetched once per warm instance. Public data, safe to cache. */
let jwks: { at: number; keys: Map<string, KeyObject> } | null = null
async function signingKey(url: string, kid: string): Promise<KeyObject | null> {
  if (!jwks || !jwks.keys.has(kid) && Date.now() - jwks.at > 60_000) {
    const res = await fetch(`${url}/auth/v1/.well-known/jwks.json`, { signal: AbortSignal.timeout(4_000) })
    const body = res.ok ? await res.json() as { keys?: (Jwk & { kid?: string })[] } : { keys: [] }
    jwks = { at: Date.now(), keys: new Map((body.keys ?? []).filter(k => k.kid).map(k => [k.kid!, createPublicKey({ key: k, format: 'jwk' })])) }
  }
  return jwks.keys.get(kid) ?? null
}

/**
 * Verify the session token locally against Supabase's published ES256 key: no network call per request.
 * Known trade-off: a token stays valid until it expires (≤ 1 h) even after sign-out. A deleted account still can't
 * use AI, because ai_take()'s usage insert fails its foreign key and the route answers 503.
 * Returns the user id, or undefined when this token can't be checked locally (then the caller falls back to getUser).
 */
export async function verifyLocally(token: string, url: string, now = Date.now()): Promise<string | null | undefined> {
  const [h, p, sig] = token.split('.')
  if (!h || !p || !sig) return null
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString())
    if (header.alg !== 'ES256' || typeof header.kid !== 'string') return undefined
    const key = await signingKey(url, header.kid)
    if (!key) return undefined
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'))
    if (!ok) return null
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString())
    if (claims.aud !== 'authenticated' || typeof claims.sub !== 'string' || !(claims.exp * 1000 > now)) return null
    return claims.sub
  } catch { return undefined }
}

/** Resolve the caller from their bearer token. Returns null when it is missing or invalid. */
export async function caller(req: Request): Promise<Caller | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token || token.length > 4096) return null
  const url = process.env.SUPABASE_URL, anon = process.env.SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY not set')
  const db = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const local = await verifyLocally(token, url)
  if (local === null) return null
  if (local) return { userId: local, db }
  // Token type we can't check here (e.g. an old HS256 session): ask Supabase.
  const { data, error } = await db.auth.getUser(token)
  if (error || !data.user) return null
  return { userId: data.user.id, db }
}

/** Read a JSON body with a hard size cap (Vercel's own limit is 4.5 MB). */
export async function readBody(req: Request, maxBytes: number): Promise<unknown | null> {
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > maxBytes) return null
  const text = await req.text()
  if (text.length > maxBytes) return null
  try { return JSON.parse(text) } catch { return null }
}
