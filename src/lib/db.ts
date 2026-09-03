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
  | 'weight_logs' | 'step_logs' | 'ai_insights' | 'physique_checkins'

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
  const { data, error } = await supabase.from(t).select('*')
  if (error) throw new Error(error.message)
  return (data ?? []) as T[]
}

export async function put<T extends Row>(t: Table, row: T): Promise<T> {
  if (localMode || !supabase) {
    const rows = readLocal<T>(t)
    const i = rows.findIndex(r => r.id === row.id)
    if (i >= 0) rows[i] = row; else rows.push(row)
    writeLocal(t, rows)
    return row
  }
  const { data: auth } = await supabase.auth.getUser()
  const payload = clean({ ...row, user_id: auth.user?.id } as Row)
  const { data, error } = await supabase.from(t).upsert(payload).select().single()
  if (error) throw new Error(error.message)
  return data as T
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
  const payload = rows.map(r => clean({ ...r, user_id: auth.user?.id } as Row))
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
  const { error } = await supabase.from(t).delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/**
 * Strip null/undefined before writing.
 * PostgREST pads a batch to a uniform column set, so one row missing an optional field makes it
 * send NULL for every other row — which trips NOT NULL columns that have a perfectly good default.
 * Dropping empty values lets the database defaults do their job.
 */
function clean<T extends Row>(row: T): T {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined)) as T
}

export function uid(): string {
  return crypto.randomUUID()
}

export async function exportAll(): Promise<Record<string, unknown>> {
  const tables: Table[] = ['profiles', 'settings', 'goals', 'nutrition_targets', 'meal_types',
    'foods', 'recipes', 'food_logs', 'workout_plans', 'workout_sessions', 'weight_logs', 'step_logs', 'ai_insights', 'physique_checkins']
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
