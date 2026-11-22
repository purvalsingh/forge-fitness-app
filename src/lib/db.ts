import { photos } from './photos'
import { supabase, supabaseConfigured } from './supabase'

/**
 * Storage layer. Two interchangeable backends:
 *  - Supabase (when VITE_SUPABASE_* are set): rows are filtered/owned by RLS on user_id.
 *  - Local (otherwise, or in demo mode): the same row shapes in localStorage.
 * Nested arrays (recipe ingredients, plan days, session exercises) are jsonb columns —
 * they are always read and written as one document, never queried field-by-field.
 */
export type Table =
  | 'profiles' | 'settings' | 'goals' | 'nutrition_targets' | 'meal_types'
  | 'foods' | 'recipes' | 'food_logs' | 'workout_plans' | 'workout_sessions'
  | 'weight_logs' | 'step_logs' | 'ai_insights' | 'physique_checkins' | 'water_logs' | 'exercises'

export type Row = { id: string }

const LS = (t: Table) => `forge:${t}`

export let localMode = !supabaseConfigured
export function setLocalMode(v: boolean) { localMode = v }

function readLocal<T extends Row>(t: Table): T[] {
  try { return JSON.parse(localStorage.getItem(LS(t)) ?? '[]') as T[] } catch { return [] }
}
function writeLocal<T extends Row>(t: Table, rows: T[]) {
  localStorage.setItem(LS(t), JSON.stringify(rows))
}

export async function list<T extends Row>(t: Table): Promise<T[]> {
  if (localMode || !supabase) return readLocal<T>(t)
  // The server caps one response at 1,000 rows; page through so older rows never silently drop out.
  const all: T[] = []
  try {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(t).select('*').order('id').range(from, from + 999)
      if (error) throw new Error(error.message)
      all.push(...((data ?? []) as T[]))
      if (!data || data.length < 1000) break
    }
  } catch (e) {
    // Offline: show the last copy we loaded, with changes still waiting to upload applied on top.
    if (!isNetwork(e)) throw e
    return overlay(t, cacheRead<T>(t))
  }
  cacheWrite(t, all)
  return overlay(t, all)
}

export async function put<T extends Row>(t: Table, row: T): Promise<T> {
  if (localMode || !supabase) {
    const rows = readLocal<T>(t)
    const i = rows.findIndex(r => r.id === row.id)
    if (i >= 0) rows[i] = row; else rows.push(row)
    writeLocal(t, rows)
    return row
  }
  try {
    if (!navigator.onLine) throw new TypeError('offline')
    const { data: auth } = await supabase.auth.getUser()
    const payload = clean({ ...row, user_id: auth.user?.id } as Row, t)
    const { data, error } = await supabase.from(t).upsert(payload).select().single()
    if (error) throw new Error(error.message)
    return data as T
  } catch (e) {
    if (!isNetwork(e)) throw e
    enqueue({ op: 'put', t, row })   // saved on this device; uploads when the connection is back
    return row
  }
}

export async function putMany<T extends Row>(t: Table, rows: T[]): Promise<void> {
  if (rows.length === 0) return
  if (localMode || !supabase) {
    const existing = readLocal<T>(t)
    const map = new Map(existing.map(r => [r.id, r]))
    for (const r of rows) map.set(r.id, r)
    writeLocal(t, [...map.values()])
    return
  }
  const { data: auth } = await supabase.auth.getUser()
  const payload = rows.map(r => clean({ ...r, user_id: auth.user?.id } as Row, t))
  // Rows with different key sets cannot share one PostgREST call: it pads the gaps with NULL.
  const groups = new Map<string, Row[]>()
  for (const r of payload) {
    const key = Object.keys(r).sort().join(',')
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  for (const group of groups.values()) {
    const { error } = await supabase.from(t).upsert(group)
    if (error) throw new Error(error.message)
  }
}

export async function remove(t: Table, id: string): Promise<void> {
  if (localMode || !supabase) {
    writeLocal(t, readLocal(t).filter(r => r.id !== id))
    return
  }
  try {
    if (!navigator.onLine) throw new TypeError('offline')
    const { error } = await supabase.from(t).delete().eq('id', id)
    if (error) throw new Error(error.message)
  } catch (e) {
    if (!isNetwork(e)) throw e
    enqueue({ op: 'del', t, id })
  }
}

// ---------- offline outbox ----------
// Writes made without a connection wait here (per browser) and replay in order once online.
type Pending = { op: 'put'; t: Table; row: Row } | { op: 'del'; t: Table; id: string }
const OUTBOX = 'forge:outbox'
const isNetwork = (e: unknown) =>
  !navigator.onLine || e instanceof TypeError || /failed to fetch|network|load failed|fetch failed/i.test(e instanceof Error ? e.message : String(e))
function readOutbox(): Pending[] { try { return JSON.parse(localStorage.getItem(OUTBOX) ?? '[]') } catch { return [] } }
function writeOutbox(l: Pending[]) { try { localStorage.setItem(OUTBOX, JSON.stringify(l)) } catch { /* storage full */ } }
function enqueue(p: Pending) { writeOutbox([...readOutbox(), p]) }
export const pendingCount = () => readOutbox().length

/** Replays queued writes in order; stops at the first one that still can't reach the server. */
export async function flushOutbox(): Promise<number> {
  if (localMode || !supabase || !navigator.onLine) return readOutbox().length
  const l = readOutbox()
  while (l.length) {
    const p = l[0]
    try {
      if (p.op === 'put') await put(p.t, p.row); else await remove(p.t, p.id)
    } catch (e) { if (isNetwork(e)) break }  // a server-side refusal is dropped, not retried forever
    if (readOutbox().length > l.length) { writeOutbox(l); break } // put re-queued it: still offline; undo the duplicate
    l.shift(); writeOutbox(l)
  }
  return l.length
}

function overlay<T extends Row>(t: Table, rows: T[]): T[] {
  const m = new Map(rows.map(r => [r.id, r]))
  for (const p of readOutbox()) {
    if (p.t !== t) continue
    if (p.op === 'put') m.set(p.row.id, p.row as T); else m.delete(p.id)
  }
  return [...m.values()]
}
const CACHE = (t: Table) => `forge:cache:${t}`
function cacheRead<T>(t: Table): T[] { try { return JSON.parse(localStorage.getItem(CACHE(t)) ?? '[]') } catch { return [] } }
function cacheWrite(t: Table, rows: Row[]) { try { localStorage.setItem(CACHE(t), JSON.stringify(rows)) } catch { /* too big for storage: skip */ } }

/**
 * Strip null/undefined before writing.
 * PostgREST pads a batch to a uniform column set, so one row missing an optional field makes it
 * send NULL for every other row — which trips NOT NULL columns that have a perfectly good default.
 * Dropping empty values lets the database defaults do their job.
 */
/**
 * NOT NULL columns per table (live schema; same list as native Api.kt). A null for these is dropped so the
 * column default applies. Any other explicit null is sent, so emptying a field and saving really clears it.
 */
const NOT_NULL: Record<string, string[]> = {
  ai_insights: ['created_at', 'applied', 'dismissed', 'text', 'kind'],
  exercises: ['updated_at', 'name'],
  food_logs: ['name', 'meal_type_id', 'date', 'created_at', 'source', 'fat_g', 'carbs_g', 'protein_g', 'calories', 'unit', 'qty'],
  foods: ['unit', 'name', 'fat_g', 'custom', 'carbs_g', 'protein_g', 'calories', 'base'],
  goals: ['current_weight_kg', 'training_days_per_week', 'training_minutes', 'avg_daily_steps', 'activity_level', 'mode', 'rate_kg_per_week', 'updated_at', 'target_weight_kg'],
  meal_types: ['position', 'name', 'time'],
  nutrition_targets: ['source', 'updated_at', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
  physique_checkins: ['priorities', 'created_at', 'date', 'goal', 'photo_keys'],
  profiles: ['created_at', 'updated_at', 'display_name', 'age', 'height_cm', 'theme', 'sex'],
  recipes: ['ingredients', 'favorite', 'name'],
  settings: ['keep_awake', 'step_goal', 'rest_days', 'adherence_weights', 'diet_tolerance', 'updated_at', 'day_start_hour', 'water_goal_ml', 'week_start', 'units', 'bar_weight_kg', 'default_rest_sec', 'effort_scale', 'timer_flash', 'fasting_hours'],
  step_logs: ['steps', 'date'],
  water_logs: ['ml', 'at', 'date'],
  weight_logs: ['date', 'weight_kg'],
  workout_plans: ['name', 'deload', 'updated_at', 'days', 'source', 'active'],
  workout_sessions: ['day_name', 'freestyle', 'deload', 'started_at', 'date', 'exercises', 'backfilled', 'plan_id', 'day_id'],
}
function clean<T extends Row>(row: T, table?: string): T {
  const required = new Set(table ? NOT_NULL[table] ?? [] : [])
  return Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== undefined && (v !== null || !required.has(k)))) as T
}

export function uid(): string {
  return crypto.randomUUID()
}

export async function exportAll(): Promise<Record<string, unknown>> {
  const tables: Table[] = ['profiles', 'settings', 'goals', 'nutrition_targets', 'meal_types',
    'foods', 'recipes', 'food_logs', 'workout_plans', 'workout_sessions', 'weight_logs', 'step_logs', 'ai_insights', 'physique_checkins', 'water_logs', 'exercises']
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), version: 1 }
  for (const t of tables) out[t] = await list(t)
  return out
}

export function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const esc = (v: unknown) => {
    const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n')
}

/** A different person signing in on this browser must never see (or upload) the previous account's saved data. */
export function claimDevice(userId: string) {
  try {
    const owner = localStorage.getItem('forge:owner')
    if (owner && owner !== userId) void forgetDevice()
    localStorage.setItem('forge:owner', userId)
  } catch { /* storage unavailable */ }
}
/** Returns once the physique photos are really gone: await it before reloading the page or the clear can be cut off. */
export async function forgetDevice(): Promise<void> {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('forge:cache:') || k === OUTBOX || k === 'forge:owner') localStorage.removeItem(k)
  } catch { /* storage unavailable */ }
  // Physique photos too: on a shared computer the next person must not find them.
  await photos.clear().catch(() => {})
}
