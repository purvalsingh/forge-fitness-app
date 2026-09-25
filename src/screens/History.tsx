import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useActiveDate } from '../store'
import { addDays, sessionVolume } from '../lib/calc'
import { minutesByDate, muscleSets, working } from '../lib/training'
import { loadExercises, matchExercise, type LibExercise } from '../lib/exercises'
import { importWorkouts } from '../lib/importers'
import { Button, Field, Notice, Screen, Sheet, Tabs } from '../ui'
import { BodyMap, untrained, useRegionSets } from './BodyMap'

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
  const regions = useRegionSets(sets)
  const missing = untrained(regions)
  const sex = s.profile?.sex ?? 'male'
  const minutes = useMemo(() => minutesByDate(s.sessions), [s.sessions])
  const done = [...s.sessions].filter(x => x.finished_at).sort((a, b) => b.date.localeCompare(a.date))

  async function onImport(f: File) {
    const r = importWorkouts(await f.text())
    if (!r || !r.sessions.length) { setMsg('That file isn\'t a workout export from the Strong or Hevy apps. In those apps use Settings → Export data → CSV.'); return }
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
        <div className="mt-3">
          <BodyMap sets={regions} sex={sex}
            onSexChange={sx => { if (s.profile) void s.save('profiles', { ...s.profile, sex: sx } as never) }} />
        </div>
        <div className="mt-2 text-[12px]" style={{ color: missing.length ? 'var(--text-dim)' : 'var(--lime)' }}>
          {missing.length ? `Not trained in this window: ${missing.join(', ')}.` : 'Every major muscle got work in this window.'}
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="quiet" onClick={() => setBackfill(true)}>Add past workout</Button>
        <Button variant="quiet" onClick={() => file.current?.click()}>Import workouts</Button>
      </div>
      <p className="mt-1.5 text-[11px]" style={{ color: 'var(--text-mute)' }}>
        Switching from the <b>Strong</b> or <b>Hevy</b> workout apps? Export your workouts there as a CSV file and pick it here — every set comes across.
      </p>
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
