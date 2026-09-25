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
