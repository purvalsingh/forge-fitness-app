import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore, useToday } from '../store'
import { uid } from '../lib/db'
import { sessionSets, sessionVolume } from '../lib/calc'
import { Bar, Button, Card, Field, Icon, Notice, Screen, Sheet, Stat } from '../ui'
import { nameOf } from './Workout'
import type { SessionExercise, WorkoutSession } from '../lib/types'

export default function Session() {
  const s = useStore()
  const date = useToday()
  const nav = useNavigate()
  const { dayId } = useParams()
  const plan = s.plans.find(p => p.active) ?? s.plans[0]
  const day = plan?.days.find(d => d.id === dayId)

  const existing = s.sessions.find(x => x.date === date && x.day_id === dayId) ?? null
  const [draft, setDraft] = useState<WorkoutSession | null>(existing)
  const [open, setOpen] = useState<string | null>(null)
  const [rest, setRest] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => { if (existing && !draft) setDraft(existing) }, [existing, draft])

  useEffect(() => {
    if (rest == null) return
    if (rest <= 0) { setRest(null); return }
    const t = setTimeout(() => setRest(r => (r == null ? null : r - 1)), 1000)
    return () => clearTimeout(t)
  }, [rest])

  const previous = useMemo(() => {
    const map = new Map<string, SessionExercise>()
    for (const sess of [...s.sessions].filter(x => x.date < date).sort((a, b) => a.date.localeCompare(b.date))) {
      for (const e of sess.exercises) map.set(e.exercise_id, e)
    }
    return map
  }, [s.sessions, date])

  if (!plan || !day) return <Screen title="Workout" back={() => nav('/workout')}><Notice tone="error">That workout day no longer exists.</Notice></Screen>

  const session: WorkoutSession = draft ?? {
    id: uid(), date, plan_id: plan.id, day_id: day.id, day_name: day.name,
    started_at: new Date().toISOString(),
    exercises: day.exercises.map(ex => ({
      workout_exercise_id: ex.id,
      exercise_id: ex.exercise_id,
      name: ex.name ?? nameOf(ex.exercise_id),
      target: ex.target,
      sets: Array.from({ length: ex.sets }, (_, i) => ({ set_no: i + 1, weight_kg: null, reps: null, done: false })),
    })),
  }

  const done = sessionSets(session)
  const total = session.exercises.reduce((a, e) => a + e.sets.length, 0)
  const finished = Boolean(session.finished_at)

  async function persist(next: WorkoutSession) {
    setDraft(next)
    try { setErr(null); await s.save('workout_sessions', next as never) }
    catch { setErr('Could not save that set. It is still on screen — try again when you are back online.') }
  }

  function patchSet(exIdx: number, setIdx: number, patch: Partial<{ weight_kg: number | null; reps: number | null; done: boolean }>) {
    const next: WorkoutSession = {
      ...session,
      exercises: session.exercises.map((e, i) => i !== exIdx ? e : {
        ...e, sets: e.sets.map((st, j) => j !== setIdx ? st : { ...st, ...patch }),
      }),
    }
    void persist(next)
  }

  return (
    <Screen title={day.name} sub={finished ? 'Completed' : 'In progress'} back={() => nav('/workout')}>
      <Card paper>
        <div className="flex items-center gap-2">
          <Bar value={total ? done / total : 0} height={8} onPaper />
          <span className="figure shrink-0 text-[12px]">{done}/{total}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 [&_.raised]:!bg-transparent [&_.raised]:!border-[var(--paper-line)]">
          <Stat label="Sets" value={done} />
          <Stat label="Volume" value={`${Math.round(sessionVolume(session)).toLocaleString()} kg`} />
          <Stat label="Rest" value={rest == null ? '—' : `${rest}s`} />
        </div>
      </Card>

      {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}

      <div className="mt-3 grid gap-2">
        {session.exercises.map((e, i) => {
          const planned = day.exercises.find(x => x.id === e.workout_exercise_id)
          const prev = previous.get(e.exercise_id)
          const allDone = e.sets.every(x => x.done)
          return (
            <Card key={e.workout_exercise_id}>
              <button className="flex w-full items-center gap-3 text-left" onClick={() => setOpen(open === e.workout_exercise_id ? null : e.workout_exercise_id)}>
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border"
                  style={{ borderColor: allDone ? 'var(--sage)' : 'var(--line)', background: allDone ? 'var(--sage)' : 'transparent' }}>
                  {allDone && <Icon name="check" size={14} color="var(--noir)" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{e.name}</span>
                  <span className="block text-[11px]" style={{ color: 'var(--text-mute)' }}>
                    {planned?.sets} × {planned?.reps}{e.target ? ` · ${e.target}` : ''}
                    {planned?.rest_sec ? ` · ${planned.rest_sec}s rest` : ''}
                    {planned?.tempo ? ` · tempo ${planned.tempo}` : ''}
                    {prev ? ` · last ${bestOf(prev)}` : ''}
                  </span>
                </span>
                <span className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
                  {e.sets.filter(x => x.done).length}/{e.sets.length}
                </span>
              </button>

              {open === e.workout_exercise_id && (
                <div className="mt-3 grid gap-2">
                  {e.sets.map((st, j) => (
                    <div key={st.set_no} className="raised grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2 p-2">
                      <span className="eyebrow w-10">Set {st.set_no}</span>
                      <input aria-label={`Set ${st.set_no} weight in kg`} type="number" inputMode="decimal" placeholder="kg"
                        value={st.weight_kg ?? ''} disabled={finished}
                        onChange={ev => patchSet(i, j, { weight_kg: ev.target.value === '' ? null : Number(ev.target.value) })} />
                      <input aria-label={`Set ${st.set_no} reps`} type="number" inputMode="numeric" placeholder="reps"
                        value={st.reps ?? ''} disabled={finished}
                        onChange={ev => patchSet(i, j, { reps: ev.target.value === '' ? null : Number(ev.target.value) })} />
                      <button aria-label={st.done ? `Mark set ${st.set_no} incomplete` : `Mark set ${st.set_no} complete`}
                        disabled={finished}
                        onClick={() => { patchSet(i, j, { done: !st.done }); if (!st.done) setRest(planned?.rest_sec ?? 90) }}
                        className="grid h-10 w-10 place-items-center rounded-xl border"
                        style={{ borderColor: st.done ? 'var(--sage)' : 'var(--line)', background: st.done ? 'var(--sage)' : 'transparent' }}>
                        <Icon name="check" size={16} color={st.done ? '#12080B' : 'var(--text-mute)'} />
                      </button>
                    </div>
                  ))}
                  <Field label="Notes">
                    <textarea rows={2} value={e.note ?? ''} disabled={finished}
                      onChange={ev => void persist({
                        ...session,
                        exercises: session.exercises.map((x, k) => k === i ? { ...x, note: ev.target.value } : x),
                      })} />
                  </Field>
                  <RestControls onRest={setRest} />
                </div>
              )}
            </Card>
          )
        })}
      </div>

      <div className="mt-4 grid gap-2">
        {!finished ? (
          <Button disabled={saving} onClick={async () => {
            setSaving(true)
            await persist({ ...session, finished_at: new Date().toISOString() })
            setSaving(false)
            nav('/workout')
          }}>{saving ? 'Saving…' : 'Finish workout'}</Button>
        ) : (
          <Button variant="ghost" onClick={() => void persist({ ...session, finished_at: undefined })}>Reopen workout</Button>
        )}
        <Button variant="ghost" onClick={() => nav('/workout')}>Back to plan</Button>
      </div>

      <Sheet open={false} onClose={() => {}}>{null}</Sheet>
    </Screen>
  )
}

function RestControls({ onRest }: { onRest: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} className="flex gap-2">
      {[60, 90, 120, 180].map(n => (
        <button key={n} onClick={() => onRest(n)}
          className="min-h-[38px] flex-1 rounded-xl border text-[12px] font-bold"
          style={{ borderColor: 'var(--line)' }}>{n}s rest</button>
      ))}
    </div>
  )
}

function bestOf(e: SessionExercise) {
  const best = e.sets.filter(s => s.done && s.weight_kg).sort((a, b) => (b.weight_kg ?? 0) - (a.weight_kg ?? 0))[0]
  return best ? `${best.weight_kg} kg × ${best.reps ?? '?'}` : '—'
}
