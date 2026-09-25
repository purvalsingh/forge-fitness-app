import type { SessionExercise, WorkoutSession } from './types'

/**
 * Import workout history from Strong or Hevy CSV exports. Exercise names become free-text
 * exercises (matched to the library by name at display time), so nothing in the file is dropped.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') q = false
      else cell += c
    } else if (c === '"') q = true
    else if (c === ',' || c === ';') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); rows.push(row); row = []; cell = ''
    } else cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim()))
}

const slug = (s: string) => 'imp-' + s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export function importWorkouts(text: string): { sessions: WorkoutSession[]; format: 'strong' | 'hevy' } | null {
  const rows = parseCSV(text)
  if (rows.length < 2) return null
  const h = rows[0].map(x => x.trim().toLowerCase())
  const col = (...names: string[]) => names.map(n => h.indexOf(n)).find(i => i >= 0) ?? -1
  const hevy = h.includes('exercise_title')
  const iDate = hevy ? col('start_time') : col('date')
  const iEnd = hevy ? col('end_time') : -1
  const iName = hevy ? col('title') : col('workout name')
  const iEx = hevy ? col('exercise_title') : col('exercise name')
  const iW = hevy ? col('weight_kg') : col('weight', 'weight (kg)')
  const iR = col('reps')
  const iSec = hevy ? col('duration_seconds') : col('seconds')
  const iKm = hevy ? col('distance_km') : col('distance')
  const iType = hevy ? col('set_type') : -1
  const iRpe = col('rpe')
  if (iDate < 0 || iEx < 0) return null

  const byWorkout = new Map<string, WorkoutSession>()
  for (const r of rows.slice(1)) {
    const started = new Date(r[iDate])
    if (Number.isNaN(started.getTime())) continue
    const key = `${r[iDate]}|${r[iName] ?? ''}`
    let s = byWorkout.get(key)
    if (!s) {
      const end = iEnd >= 0 ? new Date(r[iEnd]) : new Date(started.getTime() + 60 * 60000)
      s = {
        id: crypto.randomUUID(), date: started.toISOString().slice(0, 10), plan_id: 'import', day_id: 'import',
        day_name: (r[iName] || 'Imported workout').slice(0, 60), started_at: started.toISOString(),
        finished_at: (Number.isNaN(end.getTime()) ? started : end).toISOString(), exercises: [], backfilled: true,
      }
      byWorkout.set(key, s)
    }
    const name = (r[iEx] ?? '').trim().slice(0, 80)
    if (!name) continue
    let ex: SessionExercise | undefined = s.exercises.find(e => e.name === name)
    if (!ex) { ex = { workout_exercise_id: crypto.randomUUID(), exercise_id: slug(name), name, target: '', sets: [] }; s.exercises.push(ex) }
    const num = (i: number) => (i >= 0 && r[i] !== '' && Number.isFinite(Number(r[i])) ? Number(r[i]) : null)
    ex.sets.push({
      set_no: ex.sets.length + 1, weight_kg: num(iW), reps: num(iR), done: true,
      warmup: iType >= 0 && /warm/i.test(r[iType]) ? true : undefined,
      duration_sec: num(iSec) ?? undefined, distance_km: num(iKm) ?? undefined,
      effort: num(iRpe) ?? undefined, effort_scale: num(iRpe) != null ? 'rpe' : undefined,
    })
  }
  return { sessions: [...byWorkout.values()], format: hevy ? 'hevy' : 'strong' }
}
