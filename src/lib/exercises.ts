import type { Exercise } from './types'

export interface LibExercise extends Exercise { steps?: string[]; steps_hi?: string[] }

let cache: LibExercise[] | null = null
let inflight: Promise<LibExercise[]> | null = null

/** The bundled 1,324-exercise library, fetched on first use and cached by the service worker. */
export function loadExercises(): Promise<LibExercise[]> {
  if (cache) return Promise.resolve(cache)
  inflight ??= fetch(`${import.meta.env.BASE_URL}exercises.json`)
    .then(r => { if (!r.ok) throw new Error(`exercises ${r.status}`); return r.json() })
    .then((d: { exercises: LibExercise[] }) => (cache = d.exercises))
    .finally(() => { inflight = null })
  return inflight
}

export function exerciseLibrarySync() { return cache }

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function searchExercises(list: LibExercise[], q: string, filter: { muscle?: string; equipment?: string } = {}, favorites = new Set<string>()) {
  const n = norm(q)
  const terms = n.split(' ').filter(Boolean)
  return list
    .filter(e => (!filter.muscle || e.muscle === filter.muscle || e.body_part === filter.muscle)
      && (!filter.equipment || e.equipment === filter.equipment)
      && terms.every(t => norm(e.name).includes(t)))
    .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id))
      || Number(norm(b.name).startsWith(n)) - Number(norm(a.name).startsWith(n))
      || a.name.length - b.name.length)
}

const ABBR: Record<string, string> = { db: 'dumbbell', bb: 'barbell', kb: 'kettlebell', ez: 'ez barbell', ohp: 'overhead press', rdl: 'romanian deadlift' }
const EQUIP_RANK = ['barbell', 'dumbbell', 'cable', 'machine', 'bodyweight', 'smith machine', 'ez bar', 'kettlebell', 'band']

/**
 * Match a free-text exercise name (old plans, AI plans, imports) to a library entry.
 * "Bench Press" means the barbell version, not the band one: when the name doesn't say, the most
 * common equipment wins.
 */
export function matchExercise(list: LibExercise[], name: string): LibExercise | undefined {
  const n = norm(name).split(' ').map(w => ABBR[w] ?? w).join(' ').replace(/ (wide|close|narrow) grip$/, '')
  const exact = list.find(e => norm(e.name) === n)
  if (exact) return exact
  for (const eq of ['barbell', 'dumbbell', 'cable', 'lever']) {
    const hit = list.find(e => norm(e.name) === `${eq} ${n}`)
    if (hit) return hit
  }
  const terms = n.split(' ').filter(t => t.length > 1)
  const cands = list.filter(e => terms.every(t => norm(e.name).includes(t)))
  const rank = (e: LibExercise) => { const i = EQUIP_RANK.indexOf(String(e.equipment)); return i < 0 ? 99 : i }
  return cands.sort((a, b) => rank(a) - rank(b) || a.name.length - b.name.length)[0]
}
