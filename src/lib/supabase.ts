import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { failoverFetch, SUPABASE_FALLBACKS, SUPABASE_PRIMARY } from './endpoints'

const url = SUPABASE_PRIMARY
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabaseConfigured = Boolean(url && key)

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, key!, {
      auth: { persistSession: true, autoRefreshToken: true },
      // Auth and data survive one host going down: the request is replayed against the next base.
      global: { fetch: failoverFetch(url, SUPABASE_FALLBACKS) },
    })
  : null
