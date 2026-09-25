import { useMemo, useState } from 'react'
import body from '../lib/body.json'
import type { Sex } from '../lib/types'

/**
 * Anatomical muscle map (front + back, male or female). Figure data: react-native-body-highlighter,
 * MIT © ELABBASSI Hicham (scripts/vendor/body-highlighter-LICENSE).
 */

type Part = { slug: string; d: string[] }
type View = { viewBox: string; outline: string; parts: Part[] }
const FIGURES = body as Record<Sex, { front: View; back: View }>

export const REGION_LABEL: Record<string, string> = {
  chest: 'Chest', abs: 'Abs', obliques: 'Obliques', biceps: 'Biceps', triceps: 'Triceps', deltoids: 'Shoulders',
  forearm: 'Forearms', quadriceps: 'Quads', adductors: 'Adductors', calves: 'Calves', tibialis: 'Shins',
  trapezius: 'Traps', 'upper-back': 'Upper back & lats', 'lower-back': 'Lower back', gluteal: 'Glutes', hamstring: 'Hamstrings',
}
/** Parts that are not trained muscles — drawn as plain body. */
const NON_MUSCLE = new Set(['head', 'hands', 'feet', 'ankles', 'knees', 'neck', 'hair'])

/** Map any muscle name from the exercise library (targets + secondary muscles) to a figure region. */
export function regionOf(muscle: string): string | null {
  const m = muscle.toLowerCase()
  const rules: [RegExp, string][] = [
    [/pector|chest/, 'chest'], [/serratus|oblique/, 'obliques'], [/\babs\b|abdom|core|rectus/, 'abs'],
    [/bicep|brachialis/, 'biceps'], [/tricep/, 'triceps'], [/delt|shoulder|rotator/, 'deltoids'],
    [/forearm|wrist|grip|brachioradialis/, 'forearm'], [/quad/, 'quadriceps'], [/adductor|groin|inner thigh/, 'adductors'],
    [/abductor|glute|hip/, 'gluteal'], [/hamstring/, 'hamstring'], [/calf|calves|soleus|gastro/, 'calves'], [/shin|tibialis/, 'tibialis'],
    [/trap|levator/, 'trapezius'], [/lat|upper back|rhomboid|teres|back$/, 'upper-back'], [/spine|lower back|erector/, 'lower-back'],
  ]
  for (const [re, slug] of rules) if (re.test(m)) return slug
  return null
}

export function BodyMap({ sets, sex, onSexChange }: {
  /** Sets per region slug. */
  sets: Record<string, number>
  sex: Sex
  onSexChange?: (s: Sex) => void
}) {
  const [picked, setPicked] = useState<string | null>(null)
  const max = Math.max(1, ...Object.values(sets))
  const fill = (slug: string) => {
    if (NON_MUSCLE.has(slug)) return 'var(--surface-high)'
    const v = sets[slug] ?? 0
    if (v === 0) return 'var(--surface-raised)'
    return `rgba(255, 107, 44, ${(0.3 + 0.7 * Math.min(1, v / max)).toFixed(2)})`
  }
  const fig = FIGURES[sex] ?? FIGURES.male

  const Figure = ({ view, label }: { view: View; label: string }) => (
    <figure className="m-0 grid gap-1">
      <svg viewBox={view.viewBox} className="h-[340px] w-full" role="img" aria-label={`${label} muscles`}>
        {view.parts.map(p => p.d.map((d, i) => (
          <path key={`${p.slug}${i}`} d={d} fill={fill(p.slug)}
            stroke={picked === p.slug ? 'var(--text)' : 'var(--bg)'} strokeWidth={picked === p.slug ? 5 : 2.5}
            style={{ cursor: NON_MUSCLE.has(p.slug) ? 'default' : 'pointer', transition: 'fill .3s ease' }}
            onClick={() => !NON_MUSCLE.has(p.slug) && setPicked(picked === p.slug ? null : p.slug)}>
            <title>{REGION_LABEL[p.slug] ?? p.slug}: {Math.round(sets[p.slug] ?? 0)} sets</title>
          </path>
        )))}
        {view.outline && <path d={view.outline} fill="none" stroke="var(--line)" strokeWidth={3} vectorEffect="non-scaling-stroke" />}
      </svg>
      <figcaption className="mono text-center text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-mute)' }}>{label}</figcaption>
    </figure>
  )

  return (
    <div className="grid gap-2">
      {onSexChange && (
        <div className="flex justify-end gap-1.5">
          <button className="chip press !min-h-[28px] !px-3 !text-[11px]" aria-pressed={sex === 'male'} onClick={() => onSexChange('male')}>Male</button>
          <button className="chip press !min-h-[28px] !px-3 !text-[11px]" aria-pressed={sex === 'female'} onClick={() => onSexChange('female')}>Female</button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Figure view={fig.front} label="Front" />
        <Figure view={fig.back} label="Back" />
      </div>
      <div className="mono min-h-[20px] text-center text-[12px]" style={{ color: picked ? 'var(--text)' : 'var(--text-mute)' }}>
        {picked ? `${REGION_LABEL[picked]} · ${Math.round(sets[picked] ?? 0)} sets` : 'Tap a muscle to see its sets'}
      </div>
      <Legend />
    </div>
  )
}

function Legend() {
  return (
    <div className="mono flex items-center justify-center gap-2 text-[10px]" style={{ color: 'var(--text-mute)' }}>
      <span>None</span>
      {[0, 0.3, 0.55, 0.8, 1].map(o => (
        <span key={o} className="h-2.5 w-5 rounded-sm" style={{ background: o === 0 ? 'var(--surface-raised)' : `rgba(255,107,44,${o})` }} />
      ))}
      <span>Most</span>
    </div>
  )
}

/** Regions with no sets, for the "not trained" line. */
export function untrained(sets: Record<string, number>) {
  return Object.keys(REGION_LABEL).filter(slug => !(sets[slug] > 0)).map(slug => REGION_LABEL[slug])
}

export function useRegionSets(raw: Record<string, number>) {
  return useMemo(() => {
    const out: Record<string, number> = {}
    for (const [muscle, n] of Object.entries(raw)) {
      const r = regionOf(muscle)
      if (r) out[r] = (out[r] ?? 0) + n
    }
    return out
  }, [raw])
}
