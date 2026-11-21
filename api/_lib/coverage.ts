/**
 * Models still skip small muscles (rear delts, triceps long head, calves...) even when told not to.
 * After the AI designs a plan, every muscle it missed gets a standard exercise added to the best-fitting day,
 * so a generated plan always trains the whole body.
 */
type Ex = { name: string; sets: number; reps: string; rest_sec: number; note?: string }
type Day = { name: string; focus?: string; exercises: Ex[] }

const RULES: { muscle: string; lower: boolean; hit: RegExp; add: Ex }[] = [
  { muscle: 'front delts', lower: false, hit: /overhead press|shoulder press|military|arnold|push press|\bohp\b|landmine press/i,
    add: { name: 'Seated Dumbbell Shoulder Press', sets: 3, reps: '8-10', rest_sec: 120 } },
  { muscle: 'side delts', lower: false, hit: /lateral raise|upright row|y[- ]raise/i,
    add: { name: 'Cable Lateral Raise', sets: 3, reps: '12-15', rest_sec: 60 } },
  { muscle: 'rear delts', lower: false, hit: /face pull|rear delt|reverse (pec|fly|flye)|reverse cable|band pull[- ]apart/i,
    add: { name: 'Face Pull', sets: 3, reps: '15', rest_sec: 60 } },
  { muscle: 'triceps long head', lower: false, hit: /overhead (cable |dumbbell |db |ez[- ]bar )?(triceps |tricep )?extension|skull ?crusher|french press|jm press/i,
    add: { name: 'Overhead Cable Triceps Extension', sets: 3, reps: '10-12', rest_sec: 60 } },
  { muscle: 'biceps peak', lower: false, hit: /incline (dumbbell |db )?curl|bayesian|drag curl|preacher|spider curl/i,
    add: { name: 'Incline Dumbbell Curl', sets: 3, reps: '10-12', rest_sec: 60 } },
  { muscle: 'brachialis', lower: false, hit: /hammer|reverse curl|cross[- ]body curl/i,
    add: { name: 'Hammer Curl', sets: 3, reps: '10-12', rest_sec: 60 } },
  { muscle: 'hamstring curl', lower: true, hit: /leg curl|hamstring curl|nordic|glute[- ]ham/i,
    add: { name: 'Lying Leg Curl', sets: 3, reps: '10-12', rest_sec: 75 } },
  { muscle: 'calves', lower: true, hit: /calf|calves/i,
    add: { name: 'Standing Calf Raise', sets: 3, reps: '12-15', rest_sec: 60 } },
]

const LOWER_DAY = /leg|lower|squat|quad|hamstring|glute|posterior/i
const UPPER_DAY = /upper|push|pull|chest|back|shoulder|arm/i
const FULL_DAY = /full/i

export function ensureCoverage<T extends { days?: Day[] }>(plan: T): T & { added?: string[] } {
  const days = plan?.days
  if (!Array.isArray(days) || days.length === 0) return plan
  const all = days.flatMap(d => d.exercises ?? []).map(e => e.name).join(' | ')
  const added: string[] = []
  for (const r of RULES) {
    if (r.hit.test(all)) continue
    const label = (d: Day) => `${d.name} ${d.focus ?? ''}`
    const fits = days.filter(d => FULL_DAY.test(label(d)) || (r.lower ? LOWER_DAY.test(label(d)) : UPPER_DAY.test(label(d)) && !LOWER_DAY.test(d.name)))
    const pool = (fits.length ? fits : days).filter(d => (d.exercises?.length ?? 0) < 9)
    const day = (pool.length ? pool : days).reduce((a, b) => ((a.exercises?.length ?? 0) <= (b.exercises?.length ?? 0) ? a : b))
    day.exercises = [...(day.exercises ?? []), { ...r.add, note: `Added so ${r.muscle} get trained` }]
    added.push(r.add.name)
  }
  return added.length ? { ...plan, added } : plan
}
