import { uid } from './db'
import type { TrainingFocus, WorkoutPlan } from './types'

/**
 * Plan generation is data-driven: splits, exercise pools and set/rep schemes are data,
 * so the frontend renders whatever plan exists rather than knowing any program by name.
 */
export const FOCUS_LABELS: Record<TrainingFocus, string> = {
  strength: 'Strength',
  hypertrophy: 'Hypertrophy',
  aesthetics: 'Aesthetics',
  strength_aesthetics: 'Strength + Aesthetics',
  fat_loss: 'Fat Loss',
  general: 'General Fitness',
  athletic: 'Athletic / Performance',
  custom: 'Custom',
}

type Group =
  | 'chest' | 'back' | 'shoulders' | 'quads' | 'hamstrings' | 'glutes'
  | 'arms' | 'calves' | 'core' | 'conditioning'

interface PoolItem { name: string; compound?: boolean }

const POOL: Record<Group, PoolItem[]> = {
  chest: [
    { name: 'Bench Press', compound: true },
    { name: 'Incline DB Press', compound: true },
    { name: 'Pec Dec Fly' },
    { name: 'Cable Lower-Chest Fly' },
    { name: 'Push-ups' },
  ],
  back: [
    { name: 'Weighted Pull-ups', compound: true },
    { name: 'Barbell Row', compound: true },
    { name: 'Seated Cable Row', compound: true },
    { name: 'Lat Pulldown — Wide Grip' },
    { name: 'Lat Pulldown — Close Grip' },
    { name: 'Straight-arm Pulldown' },
  ],
  shoulders: [
    { name: 'DB Shoulder Press', compound: true },
    { name: 'Overhead Press', compound: true },
    { name: 'Cable Lateral Raise' },
    { name: 'Cable Rear Delt Fly' },
    { name: 'Face Pulls' },
  ],
  quads: [
    { name: 'Squat, Rack — Full Depth', compound: true },
    { name: 'Hack Squat', compound: true },
    { name: 'Leg Press', compound: true },
    { name: 'DB Reverse Lunge' },
    { name: 'Leg Extension' },
  ],
  hamstrings: [
    { name: 'Romanian Deadlift — DB', compound: true },
    { name: 'Deadlift', compound: true },
    { name: 'Leg Curl / DB RDL' },
    { name: 'Good Morning' },
  ],
  glutes: [
    { name: 'DB Hip Thrust' },
    { name: 'Cable Kickback' },
  ],
  arms: [
    { name: 'Cable Bicep Curl' },
    { name: 'DB Bicep Curl' },
    { name: 'DB Hammer Curl' },
    { name: 'Cable Tricep Pushdown' },
    { name: 'Overhead Cable Tricep Extension' },
  ],
  calves: [{ name: 'Standing Calf Raise' }, { name: 'Calf Raise' }],
  core: [{ name: 'Hanging Knee Raise' }, { name: 'Cable Crunch' }, { name: 'Plank' }],
  conditioning: [{ name: 'Incline Treadmill Walk' }, { name: 'Rowing Intervals' }, { name: 'Assault Bike Intervals' }],
}

interface SplitDay { name: string; focus: string; groups: Group[] }

const SPLITS: Record<number, SplitDay[]> = {
  3: [
    { name: 'Full Body A', focus: 'Full body', groups: ['quads', 'chest', 'back', 'shoulders', 'core'] },
    { name: 'Full Body B', focus: 'Full body', groups: ['hamstrings', 'back', 'chest', 'arms', 'core'] },
    { name: 'Full Body C', focus: 'Full body', groups: ['quads', 'shoulders', 'back', 'arms', 'calves'] },
  ],
  4: [
    { name: 'Upper Strength', focus: 'Strength', groups: ['chest', 'back', 'shoulders', 'arms'] },
    { name: 'Lower Strength', focus: 'Strength', groups: ['quads', 'hamstrings', 'calves', 'core'] },
    { name: 'Upper Aesthetics', focus: 'Aesthetics', groups: ['chest', 'back', 'shoulders', 'arms'] },
    { name: 'Lower Aesthetics', focus: 'Aesthetics', groups: ['quads', 'hamstrings', 'glutes', 'calves'] },
  ],
  5: [
    { name: 'Upper Strength', focus: 'Strength', groups: ['chest', 'back', 'shoulders', 'arms', 'core'] },
    { name: 'Lower Strength', focus: 'Strength', groups: ['quads', 'hamstrings', 'calves', 'core'] },
    { name: 'Upper Aesthetics', focus: 'Aesthetics', groups: ['chest', 'back', 'shoulders', 'arms', 'core'] },
    { name: 'Lower Aesthetics', focus: 'Aesthetics', groups: ['quads', 'hamstrings', 'glutes', 'calves'] },
    { name: 'Arms & Weak Points', focus: 'Aesthetics', groups: ['arms', 'shoulders', 'core'] },
  ],
  6: [
    { name: 'Push Strength', focus: 'Strength', groups: ['chest', 'shoulders', 'arms'] },
    { name: 'Pull Strength', focus: 'Strength', groups: ['back', 'arms', 'core'] },
    { name: 'Legs Strength', focus: 'Strength', groups: ['quads', 'hamstrings', 'calves'] },
    { name: 'Push Aesthetics', focus: 'Aesthetics', groups: ['chest', 'shoulders', 'arms'] },
    { name: 'Pull Aesthetics', focus: 'Aesthetics', groups: ['back', 'shoulders', 'arms'] },
    { name: 'Legs & Core', focus: 'Aesthetics', groups: ['quads', 'glutes', 'calves', 'core'] },
  ],
}

interface Scheme { sets: number; reps: string; rest: number; tempo?: string }
interface FocusScheme { compound: Scheme; accessory: Scheme; perDay: number; conditioning?: number }

const SCHEMES: Record<TrainingFocus, FocusScheme> = {
  strength: { compound: { sets: 5, reps: '5', rest: 180, tempo: '2-0-1' }, accessory: { sets: 3, reps: '8', rest: 90 }, perDay: 5 },
  hypertrophy: { compound: { sets: 4, reps: '8', rest: 120 }, accessory: { sets: 3, reps: '12', rest: 75, tempo: '3-0-1' }, perDay: 7 },
  aesthetics: { compound: { sets: 3, reps: '10', rest: 90 }, accessory: { sets: 3, reps: '12–15', rest: 60, tempo: '3-1-1' }, perDay: 8 },
  strength_aesthetics: { compound: { sets: 4, reps: '5', rest: 150 }, accessory: { sets: 3, reps: '10–12', rest: 75 }, perDay: 7 },
  fat_loss: { compound: { sets: 3, reps: '10', rest: 75 }, accessory: { sets: 3, reps: '15', rest: 45 }, perDay: 6, conditioning: 1 },
  general: { compound: { sets: 3, reps: '8–10', rest: 90 }, accessory: { sets: 2, reps: '12', rest: 60 }, perDay: 6, conditioning: 1 },
  athletic: { compound: { sets: 4, reps: '5', rest: 150, tempo: 'explosive' }, accessory: { sets: 3, reps: '8', rest: 75 }, perDay: 6, conditioning: 1 },
  custom: { compound: { sets: 3, reps: '10', rest: 90 }, accessory: { sets: 3, reps: '12', rest: 60 }, perDay: 6 },
}

/** Free-text emphasis ("bigger shoulders, wider back") → extra accessory volume for those groups. */
const EMPHASIS_MAP: [RegExp, Group][] = [
  [/shoulder|delt/i, 'shoulders'],
  [/back|lat|width|wider/i, 'back'],
  [/arm|bicep|tricep/i, 'arms'],
  [/chest|pec/i, 'chest'],
  [/leg|quad|thigh/i, 'quads'],
  [/glute|hip/i, 'glutes'],
  [/hamstring/i, 'hamstrings'],
  [/calf|calves/i, 'calves'],
  [/waist|core|abs|midsection/i, 'core'],
  [/condition|cardio|lean|fat/i, 'conditioning'],
]

export function emphasisGroups(text: string): Group[] {
  return [...new Set(EMPHASIS_MAP.filter(([re]) => re.test(text)).map(([, g]) => g))]
}

export interface GenerateOptions {
  focus: TrainingFocus
  daysPerWeek: number
  emphasis?: string[]
  name?: string
}

export function generatePlan(opts: GenerateOptions): WorkoutPlan {
  const dpw = [3, 4, 5, 6].includes(opts.daysPerWeek) ? opts.daysPerWeek : 4
  const scheme = SCHEMES[opts.focus] ?? SCHEMES.custom
  const emphasis = emphasisGroups((opts.emphasis ?? []).join(' '))
  const planId = uid()

  const days = SPLITS[dpw].map((split, di) => {
    const groups: Group[] = [...split.groups]
    for (const g of emphasis) if (groups.includes(g)) groups.push(g) // extra slot for prioritised groups
    if (scheme.conditioning) groups.push('conditioning')

    const used = new Set<string>()
    const picks: { name: string; compound: boolean }[] = []
    let gi = 0
    while (picks.length < scheme.perDay + (scheme.conditioning ?? 0) && gi < groups.length * 3) {
      const g = groups[gi % groups.length]
      const item = POOL[g].find(p => !used.has(p.name))
        ?? POOL[g][(gi + di) % POOL[g].length]
      if (!used.has(item.name)) {
        used.add(item.name)
        picks.push({ name: item.name, compound: Boolean(item.compound) })
      }
      gi++
    }
    // Compounds first — heaviest work while fresh.
    picks.sort((a, b) => Number(b.compound) - Number(a.compound))

    return {
      id: uid(),
      plan_id: planId,
      name: `Day ${di + 1} — ${split.name}`,
      focus: split.focus,
      position: di,
      exercises: picks.map((p, i) => {
        const sc = p.compound ? scheme.compound : scheme.accessory
        return {
          id: uid(),
          exercise_id: 'ex-' + p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          name: p.name,
          sets: sc.sets, reps: sc.reps, target: '', position: i,
          rest_sec: sc.rest, tempo: sc.tempo,
          note: emphasis.some(g => POOL[g].some(x => x.name === p.name)) ? 'Priority — push this one' : undefined,
        }
      }),
    }
  })

  return {
    id: planId,
    name: opts.name ?? `${FOCUS_LABELS[opts.focus]} · ${dpw} days`,
    days,
    focus: opts.focus,
    days_per_week: dpw,
    source: 'template',
    active: false,
    updated_at: new Date().toISOString(),
  }
}

export const FREQUENCIES = [3, 4, 5, 6]
