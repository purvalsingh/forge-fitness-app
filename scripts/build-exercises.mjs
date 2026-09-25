/**
 * Build public/exercises.json from hasaneyldrm/exercises-dataset (MIT: names, muscles, equipment,
 * instruction text). The GIF/image media is NOT included — its rights are disputed and excluded
 * from that MIT licence.
 *
 *   node scripts/build-exercises.mjs <path-to-exercises.json>
 */
import fs from 'node:fs'

const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
const title = s => s.replace(/\b([a-z])/g, (m, c) => c.toUpperCase()).replace(/\bV\. /g, 'v. ')
const EQUIP = { 'body weight': 'bodyweight', 'leverage machine': 'machine', 'sled machine': 'machine', 'assisted': 'machine',
  'ez barbell': 'ez bar', 'olympic barbell': 'barbell', 'resistance band': 'band', 'weighted': 'other' }
const BAR = { barbell: 20, 'ez bar': 10, 'smith machine': 15, 'trap bar': 25 }

const out = src.map(x => {
  const equipment = EQUIP[x.equipment] ?? x.equipment
  const n = x.name.toLowerCase()
  const kind = x.body_part === 'cardio' ? 'cardio'
    : /plank|hold|wall sit|hang\b|dead hang|isometric|l-sit|hollow/.test(n) ? 'timed'
      : equipment === 'bodyweight' ? 'bodyweight_reps' : 'weight_reps'
  return {
    id: 'x-' + x.id,
    name: title(x.name),
    muscle: x.target,
    secondary: (x.secondary_muscles ?? []).slice(0, 4),
    body_part: x.body_part,
    equipment,
    kind,
    ...(/single|one arm|one leg|alternat|lunge|split squat|step-up|unilateral/.test(n) ? { per_side: true } : {}),
    ...(BAR[equipment] ? { bar_kg: BAR[equipment] } : {}),
    steps: x.instruction_steps?.en ?? [],
    steps_hi: x.instruction_steps?.hi ?? [],
  }
})
fs.writeFileSync(new URL('../public/exercises.json', import.meta.url), JSON.stringify({
  attribution: 'Exercise names, muscles and instructions: hasaneyldrm/exercises-dataset (MIT). No third-party media included.',
  exercises: out,
}))
console.error(`exercises: ${out.length}`)
