import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useActiveDate } from '../store'
import { addDays, sessionVolume } from '../lib/calc'
import { minutesByDate, muscleSets, working } from '../lib/training'
import { loadExercises, matchExercise, type LibExercise } from '../lib/exercises'
import { importWorkouts } from '../lib/importers'
import { Button, Field, Notice, Screen, Sheet, Tabs } from '../ui'

/**
 * Training history: year heatmap, muscle map (balance / recency), session list, back-filling a
 * workout you did without the phone, and importing Strong / Hevy exports.
 */
export default function History() {
  const s = useStore()
  const nav = useNavigate()
  const { today, setDate } = useActiveDate()
  const [lib, setLib] = useState<LibExercise[]>([])
  const [range, setRange] = useState<'7' | '30' | '365'>('7')
  const [backfill, setBackfill] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => { void loadExercises().then(setLib).catch(() => {}) }, [])

  const byId = useMemo(() => new Map(lib.map(e => [e.id, e])), [lib])
  const sets = useMemo(() => muscleSets(s.sessions, today, Number(range), e => byId.get(e.exercise_id) ?? s.customExercises.find(x => x.id === e.exercise_id) ?? (lib.length ? matchExercise(lib, e.name) : undefined)),
    [s.sessions, today, range, byId, s.customExercises, lib])
  const minutes = useMemo(() => minutesByDate(s.sessions), [s.sessions])
  const done = [...s.sessions].filter(x => x.finished_at).sort((a, b) => b.date.localeCompare(a.date))

  async function onImport(f: File) {
    const r = importWorkouts(await f.text())
    if (!r || !r.sessions.length) { setMsg('That file doesn\'t look like a Strong or Hevy export.'); return }
    for (const sess of r.sessions) await s.save('workout_sessions', sess as never)
    setMsg(`Imported ${r.sessions.length} workouts from ${r.format === 'hevy' ? 'Hevy' : 'Strong'}.`)
  }

  return (
    <Screen title="History" sub="Training" back={() => nav(-1)}>
      <section className="card p-4">
        <div className="eyebrow mb-2">Last 12 months</div>
        <Heatmap minutes={minutes} today={today} />
      </section>

      <section className="card mt-3 p-4">
        <div className="flex items-center justify-between">
          <div className="eyebrow">Muscle balance · sets</div>
          <Tabs value={range} onChange={setRange} options={[{ value: '7', label: '7d' }, { value: '30', label: '30d' }, { value: '365', label: '1y' }]} />
        </div>
        <BodyMap sets={sets} />
        <Untrained sets={sets} />
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="quiet" onClick={() => setBackfill(true)}>Log a past workout</Button>
        <Button variant="quiet" onClick={() => file.current?.click()}>Import Strong / Hevy</Button>
      </div>
      <input ref={file} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void onImport(f); e.target.value = '' }} />
      {msg && <div className="mt-2"><Notice>{msg}</Notice></div>}

      <div className="mt-4 grid gap-2">
        <div className="eyebrow">Sessions</div>
        {done.length === 0 && <div className="text-[13px]" style={{ color: 'var(--text-mute)' }}>No finished workouts yet.</div>}
        {done.slice(0, 60).map(x => (
          <button key={x.id} className="cv card press p-3 text-left" onClick={() => { setDate(x.date); nav(`/workout/session/${x.day_id}`) }}>
            <div className="flex justify-between"><span className="text-[14px] font-semibold">{x.day_name}</span><span className="mono text-[12px]">{x.date}</span></div>
            <div className="mono text-[11px]" style={{ color: 'var(--text-mute)' }}>
              {x.exercises.reduce((a, e) => a + working(e.sets).length, 0)} sets · {Math.round(sessionVolume(x)).toLocaleString()} kg
              {x.backfilled ? ' · added later' : ''}{x.exercises.some(e => e.sets.some(st => st.pr)) ? ' · ★ PR' : ''}
            </div>
          </button>
        ))}
      </div>

      <Backfill open={backfill} onClose={() => setBackfill(false)} onGo={(date, dayId) => {
        const clash = s.sessions.find(x => x.date === date && x.day_id === dayId)
        if (clash && !confirm('That day already has this workout. Open it instead?')) return
        setDate(date); setBackfill(false); nav(`/workout/session/${dayId}`)
      }} maxDate={addDays(today, -1)} />
    </Screen>
  )
}

function Heatmap({ minutes, today }: { minutes: Record<string, number>; today: string }) {
  const weeks = 53
  const end = new Date(today + 'T00:00:00')
  const start = new Date(end); start.setDate(end.getDate() - (weeks * 7 - 1) - end.getDay())
  const cells: { d: string; m: number }[] = []
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    cells.push({ d: iso, m: iso > today ? -1 : minutes[iso] ?? 0 })
  }
  const level = (m: number) => (m < 0 ? 'transparent' : m === 0 ? 'var(--surface-high)' : m < 30 ? 'rgba(255,107,44,.35)' : m < 60 ? 'rgba(255,107,44,.65)' : 'var(--accent)')
  return (
    <div className="no-scrollbar overflow-x-auto">
      <div className="grid w-max grid-flow-col gap-[3px]" style={{ gridTemplateRows: 'repeat(7, 10px)' }} role="img" aria-label="Training days over the last year">
        {cells.map(c => <span key={c.d} title={`${c.d}: ${c.m > 0 ? c.m + ' min' : 'rest'}`} className="h-[10px] w-[10px] rounded-[3px]" style={{ background: level(c.m) }} />)}
      </div>
    </div>
  )
}

/** Simplified front/back figure. Colour = sets in the window; a muscle you haven't trained stays grey. */
const REGIONS: { key: string[]; label: string; d: string; back?: boolean }[] = [
  { key: ['delts'], label: 'Shoulders', d: 'M30 44 a9 8 0 1 1 1 0 Z M70 44 a9 8 0 1 0 -1 0 Z' },
  { key: ['pectorals'], label: 'Chest', d: 'M36 44 h28 v14 q-14 6 -28 0 Z' },
  { key: ['biceps'], label: 'Biceps', d: 'M22 52 h9 v18 h-9 Z M69 52 h9 v18 h-9 Z' },
  { key: ['forearms'], label: 'Forearms', d: 'M20 72 h9 v18 h-9 Z M71 72 h9 v18 h-9 Z' },
  { key: ['abs', 'serratus anterior'], label: 'Abs', d: 'M40 60 h20 v26 h-20 Z' },
  { key: ['quads', 'adductors', 'abductors'], label: 'Quads', d: 'M37 92 h12 v34 h-12 Z M51 92 h12 v34 h-12 Z' },
  { key: ['calves'], label: 'Calves', d: 'M38 130 h10 v26 h-10 Z M52 130 h10 v26 h-10 Z' },
  { key: ['traps', 'levator scapulae'], label: 'Traps', d: 'M40 36 h20 v8 h-20 Z', back: true },
  { key: ['upper back'], label: 'Upper back', d: 'M36 44 h28 v12 h-28 Z', back: true },
  { key: ['lats'], label: 'Lats', d: 'M34 56 h12 v18 h-12 Z M54 56 h12 v18 h-12 Z', back: true },
  { key: ['triceps'], label: 'Triceps', d: 'M22 52 h9 v18 h-9 Z M69 52 h9 v18 h-9 Z', back: true },
  { key: ['spine'], label: 'Lower back', d: 'M44 74 h12 v12 h-12 Z', back: true },
  { key: ['glutes'], label: 'Glutes', d: 'M37 88 h26 v12 h-26 Z', back: true },
  { key: ['hamstrings'], label: 'Hamstrings', d: 'M37 102 h12 v24 h-12 Z M51 102 h12 v24 h-12 Z', back: true },
  { key: ['calves'], label: 'Calves', d: 'M38 130 h10 v26 h-10 Z M52 130 h10 v26 h-10 Z', back: true },
]

function BodyMap({ sets }: { sets: Record<string, number> }) {
  const val = (keys: string[]) => keys.reduce((a, k) => a + (sets[k] ?? 0), 0)
  const max = Math.max(1, ...REGIONS.map(r => val(r.key)))
  const fill = (v: number) => (v === 0 ? 'var(--surface-high)' : `rgba(255,107,44,${0.25 + 0.75 * (v / max)})`)
  const Figure = ({ back }: { back?: boolean }) => (
    <svg viewBox="0 0 100 162" className="h-56 w-full" role="img" aria-label={back ? 'Back muscles' : 'Front muscles'}>
      <circle cx="50" cy="22" r="10" fill="var(--surface-raised)" />
      <path d="M32 36 h36 l10 16 v40 h-8 l-4 -22 v26 l-2 62 h-12 l-2 -40 l-2 40 h-12 l-2 -62 v-26 l-4 22 h-8 v-40 Z" fill="var(--surface-raised)" />
      {REGIONS.filter(r => Boolean(r.back) === Boolean(back)).map(r => (
        <path key={r.label} d={r.d} fill={fill(val(r.key))}><title>{`${r.label}: ${Math.round(val(r.key))} sets`}</title></path>
      ))}
    </svg>
  )
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      <div><Figure /><div className="mono text-center text-[10px] uppercase" style={{ color: 'var(--text-mute)' }}>Front</div></div>
      <div><Figure back /><div className="mono text-center text-[10px] uppercase" style={{ color: 'var(--text-mute)' }}>Back</div></div>
    </div>
  )
}

function Untrained({ sets }: { sets: Record<string, number> }) {
  const missing = [...new Set(REGIONS.filter(r => r.key.every(k => !sets[k])).map(r => r.label))]
  if (!missing.length) return <div className="mt-2 text-[12px]" style={{ color: 'var(--lime)' }}>Every major muscle got work in this window.</div>
  return <div className="mt-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>Not trained: {missing.join(', ')}</div>
}

function Backfill({ open, onClose, onGo, maxDate }: { open: boolean; onClose: () => void; onGo: (date: string, dayId: string) => void; maxDate: string }) {
  const s = useStore()
  const plan = s.plans.find(p => p.active) ?? s.plans[0]
  const [date, setDate] = useState(maxDate)
  const [day, setDay] = useState('freestyle')
  return (
    <Sheet open={open} onClose={onClose} title="Log a past workout">
      <div className="grid gap-3">
        <Field label="Date"><input type="date" max={maxDate} value={date} onChange={e => setDate(e.target.value)} /></Field>
        <Field label="Workout">
          <select value={day} onChange={e => setDay(e.target.value)}>
            <option value="freestyle">Freestyle (pick exercises)</option>
            {plan?.days.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Notice>Workouts added later never claim PRs against sessions that came after them.</Notice>
        <Button disabled={!date} onClick={() => onGo(date, day)}>Open workout</Button>
      </div>
    </Sheet>
  )
}
