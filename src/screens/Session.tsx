import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore, useActiveDate } from '../store'
import { uid } from '../lib/db'
import { sessionVolume } from '../lib/calc'
import { bestE1rm, e1rm, exerciseHistory, kgToLb, lbToKg, nextTarget, platesPerSide, working } from '../lib/training'
import { loadExercises, matchExercise, searchExercises, type LibExercise } from '../lib/exercises'
import { Button, Field, Icon, Notice, Screen, Sheet } from '../ui'
import { nameOf } from './Workout'
import type { SessionExercise, WorkoutSession, WorkoutSet } from '../lib/types'

const fmtClock = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const fmtRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function Session() {
  const s = useStore()
  const { date, today } = useActiveDate()
  const nav = useNavigate()
  const { dayId } = useParams()
  const freestyle = dayId === 'freestyle'
  const plan = s.plans.find(p => p.active) ?? s.plans[0]
  const day = freestyle ? null : plan?.days.find(d => d.id === dayId)
  const lb = s.settings.units === 'lb'
  const effortScale = s.settings.effort_scale ?? 'off'

  const existing = s.sessions.find(x => x.date === date && x.day_id === (freestyle ? 'freestyle' : dayId)) ?? null
  const [draft, setDraft] = useState<WorkoutSession | null>(existing)
  const [current, setCurrent] = useState(0)
  const [restEnd, setRestEnd] = useState<number | null>(null)
  const [restTotal, setRestTotal] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [err, setErr] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const [picker, setPicker] = useState<null | { mode: 'add' } | { mode: 'swap'; index: number }>(null)
  const [flash, setFlash] = useState(false)
  const [lib, setLib] = useState<LibExercise[]>([])

  useEffect(() => { void loadExercises().then(setLib).catch(() => {}) }, [])
  useEffect(() => { if (existing && !draft) setDraft(existing) }, [existing, draft])

  // One clock drives the session timer and the rest countdown.
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(i) }, [])
  const restLeft = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : null
  useEffect(() => {
    if (restEnd && restLeft === 0) {
      setRestEnd(null)
      navigator.vibrate?.([200, 100, 200])
      if (s.settings.timer_flash) { setFlash(true); setTimeout(() => setFlash(false), 600) }
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('Rest over', { body: 'Next set — let\'s go.', tag: 'forge-rest' })
      }
    }
  }, [restLeft, restEnd, s.settings.timer_flash])

  // Keep the screen awake while a workout is running (released when leaving).
  useEffect(() => {
    if (s.settings.keep_awake === false || draft?.finished_at) return
    let lock: WakeLockSentinel | null = null
    const get = () => navigator.wakeLock?.request('screen').then(l => { lock = l }).catch(() => {})
    void get()
    const onVis = () => { if (!document.hidden) void get() }
    document.addEventListener('visibilitychange', onVis)
    return () => { document.removeEventListener('visibilitychange', onVis); void lock?.release() }
  }, [s.settings.keep_awake, draft?.finished_at])

  const libById = useMemo(() => new Map(lib.map(e => [e.id, e])), [lib])
  const meta = (id: string, name?: string) => libById.get(id) ?? s.customExercises.find(e => e.id === id) ?? (name && lib.length ? matchExercise(lib, name) : undefined)

  if (!freestyle && (!plan || !day)) {
    return <Screen title="Workout" back={() => nav('/workout')}><Notice tone="error">That workout day no longer exists.</Notice></Screen>
  }

  const session: WorkoutSession = draft ?? {
    id: uid(), date, plan_id: freestyle ? 'freestyle' : plan!.id, day_id: freestyle ? 'freestyle' : day!.id,
    day_name: freestyle ? 'Freestyle' : day!.name, started_at: new Date().toISOString(),
    freestyle, deload: plan?.deload, backfilled: date < today || undefined,
    exercises: freestyle ? [] : day!.exercises.map(ex => {
      const hist = exerciseHistory(s.sessions, ex.exercise_id, date)
      const t = nextTarget({ history: hist, reps: ex.reps, rule: ex.progression ?? plan!.progression })
      const warm = Array.from({ length: ex.warmups ?? 0 }, (_, i): WorkoutSet => ({
        set_no: i + 1, warmup: true, done: false, reps: 8, weight_kg: t?.weight ? Math.round(t.weight * (0.5 + 0.15 * i) / 2.5) * 2.5 : null,
      }))
      return {
        workout_exercise_id: ex.id, exercise_id: ex.exercise_id, name: ex.name ?? nameOf(ex.exercise_id),
        target: t ? `${ex.sets} × ${ex.reps}${t.weight ? ` @ ${t.weight} kg` : ''}` : ex.target,
        note: t?.why, superset: ex.superset, rest_sec: ex.rest_sec,
        sets: [...warm, ...Array.from({ length: ex.sets }, (_, i): WorkoutSet => ({
          set_no: warm.length + i + 1, weight_kg: t?.weight ?? null, reps: t?.reps ?? null, done: false,
        }))],
      }
    }),
  }

  const finished = Boolean(session.finished_at)
  const doneSets = session.exercises.reduce((a, e) => a + working(e.sets).length, 0)
  const totalSets = session.exercises.reduce((a, e) => a + e.sets.filter(x => !x.warmup).length, 0)
  const elapsed = Math.floor(((finished ? new Date(session.finished_at!).getTime() : now) - new Date(session.started_at).getTime()) / 1000)

  async function persist(next: WorkoutSession) {
    setDraft(next)
    try { setErr(null); await s.save('workout_sessions', next as never) }
    catch { setErr('Not saved yet — it stays on screen and will save when you are back online.') }
  }
  const patchEx = (i: number, p: Partial<SessionExercise>) =>
    persist({ ...session, exercises: session.exercises.map((e, k) => (k === i ? { ...e, ...p } : e)) })
  const patchSet = (i: number, j: number, p: Partial<WorkoutSet>) =>
    patchEx(i, { sets: session.exercises[i].sets.map((st, k) => (k === j ? { ...st, ...p } : st)) })

  function complete(i: number, j: number) {
    const e = session.exercises[i]
    const st = e.sets[j]
    const done = !st.done
    let pr = false
    if (done && !st.warmup && !session.backfilled) {
      const prev = bestE1rm(s.sessions.filter(x => x.id !== session.id), e.exercise_id, date)
      const mine = e1rm(st.weight_kg, st.reps) ?? 0
      pr = prev > 0 && mine > prev
      if (pr) { setToast(`New PR · ${e.name} · est. 1RM ${mine} kg`); setTimeout(() => setToast(null), 3500) }
    }
    navigator.vibrate?.(done ? 12 : 0)
    void patchSet(i, j, { done, pr: done ? pr : false })
    if (done && !st.warmup) {
      // A superset rests once, after the last member of the round.
      const group = e.superset ? session.exercises.filter(x => x.superset === e.superset) : [e]
      const isLastInRound = group[group.length - 1] === e
      if (isLastInRound) {
        const sec = Math.max(...group.map(g => g.rest_sec ?? meta(g.exercise_id)?.rest_sec ?? s.settings.default_rest_sec ?? 120))
        setRestTotal(sec); setRestEnd(Date.now() + sec * 1000)
        if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
      }
    }
  }

  function addExercise(x: LibExercise) {
    const hist = exerciseHistory(s.sessions, x.id, date)
    const last = hist[0]?.ex
    // Freestyle arrives pre-filled from last time: same sets, reps and weight by position.
    const sets: WorkoutSet[] = last
      ? working(last.sets).map((p, k) => ({ set_no: k + 1, weight_kg: p.weight_kg, reps: p.reps, done: false }))
      : Array.from({ length: 3 }, (_, k) => ({ set_no: k + 1, weight_kg: null, reps: x.kind === 'timed' ? null : 10, done: false }))
    const ex: SessionExercise = { workout_exercise_id: uid(), exercise_id: x.id, name: x.name, target: last ? 'Same as last time' : '', sets, kind: x.kind, muscle: x.muscle }
    void persist({ ...session, exercises: [...session.exercises, ex] })
    setCurrent(session.exercises.length)
  }

  const cur = session.exercises[current]
  const toDisp = (kg: number | null) => (kg == null ? '' : lb ? kgToLb(kg) : kg)
  const fromDisp = (v: string) => (v === '' ? null : lb ? lbToKg(Number(v)) : Number(v))

  return (
    <div className="page mx-auto w-full max-w-[520px] px-4" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))', paddingBottom: 'calc(140px + env(safe-area-inset-bottom))' }}>
      {flash && <div className="anim-fade pointer-events-none fixed inset-0 z-[60]" style={{ background: 'var(--accent)', opacity: 0.5 }} />}
      {/* Header */}
      <header className="flex items-center gap-3">
        <button aria-label="Back" onClick={() => nav('/workout')} className="press grid h-10 w-10 place-items-center rounded-full border" style={{ borderColor: 'var(--line)' }}><Icon name="back" /></button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {!finished && <span className="h-2.5 w-2.5 rounded-full pulse" style={{ background: 'var(--accent)' }} />}
            <span className="figure text-[24px] leading-none">{fmtClock(Math.max(0, elapsed))}</span>
            <span className="chip mono !min-h-[22px] !px-2 text-[10px]">{finished ? 'DONE' : session.backfilled ? 'PAST' : 'LIVE'}</span>
          </div>
          <div className="truncate text-[13px]" style={{ color: 'var(--text-dim)' }}>{session.day_name}{session.deload ? ' · deload' : ''}</div>
        </div>
        {!finished
          ? <button className="press rounded-full border px-4 py-2 text-[13px] font-extrabold uppercase" style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              onClick={async () => { await persist({ ...session, finished_at: new Date().toISOString() }); nav('/workout?done=' + session.id) }}>Finish ✓</button>
          : <button className="chip press" onClick={() => void persist({ ...session, finished_at: undefined })}>Reopen</button>}
      </header>

      <div className="mt-3 flex items-center justify-between">
        <span className="mono text-[12px]">Exercise <b>{Math.min(current + 1, session.exercises.length)}</b> of {session.exercises.length}</span>
        <span className="mono text-[12px]" style={{ color: 'var(--text-mute)' }}>{doneSets}/{totalSets} sets · {Math.round(lb ? kgToLb(sessionVolume(session)) : sessionVolume(session)).toLocaleString()} {lb ? 'lb' : 'kg'}</span>
      </div>
      <div className="mt-2 flex gap-1">
        {session.exercises.map((e, i) => (
          <button key={e.workout_exercise_id} aria-label={e.name} onClick={() => setCurrent(i)} className="h-1.5 flex-1 rounded-full"
            style={{ background: e.sets.filter(x => !x.warmup).every(x => x.done) ? 'var(--accent)' : i === current ? 'var(--text-dim)' : 'var(--surface-high)' }} />
        ))}
      </div>

      {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}

      {session.exercises.length === 0 && (
        <div className="card mt-4 grid gap-3 p-6 text-center">
          <div className="title text-[20px]">Freestyle session</div>
          <div className="text-[13px]" style={{ color: 'var(--text-mute)' }}>Add exercises as you go — each one pre-fills from the last time you did it.</div>
          <Button onClick={() => setPicker({ mode: 'add' })}>+ Add exercise</Button>
        </div>
      )}

      {cur && (() => {
        const i = current
        const m = meta(cur.exercise_id, cur.name)
        const kind = cur.kind ?? m?.kind ?? 'weight_reps'
        const prev = exerciseHistory(s.sessions, cur.exercise_id, date)[0]?.ex
        const topW = Math.max(0, ...cur.sets.filter(x => !x.warmup).map(x => x.weight_kg ?? 0))
        const bar = m?.bar_kg ?? (/barbell|smith|ez bar|trap bar/i.test(m?.equipment ?? cur.name) ? s.settings.bar_weight_kg ?? 20 : null)
        const plates = bar && topW > bar ? platesPerSide(topW, bar) : null
        const partner = cur.superset ? session.exercises.filter(x => x.superset === cur.superset && x !== cur).map(x => x.name) : []
        return (
          <section className="card mt-4 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--text-mute)' }}>
                  {m?.muscle ?? cur.muscle ?? ''}{m?.equipment ? ` · ${m.equipment}` : ''}{partner.length ? ` · superset with ${partner.join(', ')}` : ''}
                </div>
                <h2 className="title text-[24px] leading-tight">{cur.name}</h2>
              </div>
              <button aria-label="Exercise options" onClick={() => setMenu(i)} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: 'var(--surface-raised)' }}><Icon name="more" size={18} /></button>
            </div>
            {(cur.target || cur.note) && (
              <div className="mt-3 rounded-2xl border-l-4 p-3" style={{ borderColor: 'var(--accent)', background: 'var(--surface-raised)' }}>
                <div className="mono text-[10px] uppercase tracking-widest" style={{ color: 'var(--accent)' }}>✦ Target</div>
                {cur.target && <div className="mono mt-0.5 text-[14px] font-bold">{cur.target}</div>}
                {cur.note && <div className="text-[12px]" style={{ color: 'var(--text-dim)' }}>{cur.note}</div>}
              </div>
            )}
            {plates && (
              <div className="chip mono mt-2 w-full justify-between !rounded-2xl !py-2">
                <span>Bar {bar} kg · {(topW - bar!) / 2} kg / side</span>
                <span style={{ color: 'var(--accent)' }}>{plates.join(' + ')}</span>
              </div>
            )}

            {/* Set table */}
            <div className="mono mt-3 grid grid-cols-[34px_1fr_64px_56px_auto_44px] items-center gap-1.5 px-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-mute)' }}>
              <span>Set</span><span>Prev</span>
              <span className="text-center">{kind === 'timed' || kind === 'cardio' ? 'min' : lb ? 'lb' : 'kg'}</span>
              <span className="text-center">{kind === 'timed' ? 'sec' : kind === 'cardio' ? 'km' : 'reps'}</span>
              <span className="w-10 text-center">{effortScale === 'off' ? '' : effortScale.toUpperCase()}</span>
              <span />
            </div>
            <div className="mt-1 grid gap-1.5">
              {cur.sets.map((st, j) => {
                const p = prev?.sets.filter(x => !x.warmup)[cur.sets.slice(0, j).filter(x => !x.warmup).length]
                const active = !st.done && cur.sets.findIndex(x => !x.done) === j
                return (
                  <div key={j} className="grid grid-cols-[34px_1fr_64px_56px_auto_44px] items-center gap-1.5 rounded-2xl p-1.5"
                    style={{ background: active ? 'rgba(255,107,44,.08)' : st.done ? 'var(--surface-raised)' : 'transparent', border: active ? '1.5px solid var(--accent)' : '1.5px solid transparent', opacity: st.warmup && !active ? 0.75 : 1 }}>
                    <button className="mono press grid h-8 w-8 place-items-center rounded-lg text-[12px] font-bold"
                      style={{ background: 'var(--surface-high)', color: st.warmup ? 'var(--text-mute)' : st.pr ? 'var(--lime)' : 'var(--text)' }}
                      aria-label={`Set ${j + 1}: tap to toggle warm-up`} disabled={finished}
                      onClick={() => void patchSet(i, j, { warmup: !st.warmup })}>{st.warmup ? 'W' : st.pr ? '★' : cur.sets.slice(0, j + 1).filter(x => !x.warmup).length}</button>
                    <span className="mono truncate text-[11px]" style={{ color: 'var(--text-mute)' }}>
                      {p ? (kind === 'timed' ? `${p.duration_sec ?? '—'}s` : `${toDisp(p.weight_kg) || 'BW'}×${p.reps ?? '—'}`) : '—'}
                    </span>
                    {kind === 'timed' ? (
                      <span />
                    ) : (
                      <input aria-label="Weight" type="number" inputMode="decimal" disabled={finished} className="!px-1 text-center !text-[16px] font-bold"
                        value={kind === 'cardio' ? (st.duration_sec ? Math.round(st.duration_sec / 60) : '') : toDisp(st.weight_kg)}
                        placeholder={kind === 'bodyweight_reps' ? 'BW' : '–'}
                        onChange={ev => void patchSet(i, j, kind === 'cardio' ? { duration_sec: Number(ev.target.value) * 60 } : { weight_kg: fromDisp(ev.target.value) })} />
                    )}
                    <input aria-label={kind === 'timed' ? 'Seconds' : kind === 'cardio' ? 'Distance' : 'Reps'} type="number" inputMode="decimal" disabled={finished}
                      className="!px-1 text-center !text-[16px] font-bold"
                      value={kind === 'timed' ? st.duration_sec ?? '' : kind === 'cardio' ? st.distance_km ?? '' : st.reps ?? ''}
                      onChange={ev => {
                        const v = ev.target.value === '' ? undefined : Number(ev.target.value)
                        void patchSet(i, j, kind === 'timed' ? { duration_sec: v } : kind === 'cardio' ? { distance_km: v } : { reps: v ?? null })
                      }} />
                    {effortScale === 'off' ? <span /> : (
                      <select aria-label={effortScale.toUpperCase()} disabled={finished} className="!w-10 !px-0.5 text-center !text-[12px]" value={st.effort ?? ''}
                        style={{ color: effortColor(st.effort, effortScale) }}
                        onChange={ev => void patchSet(i, j, { effort: ev.target.value === '' ? undefined : Number(ev.target.value), effort_scale: effortScale })}>
                        <option value="">–</option>
                        {(effortScale === 'rir' ? [0, 1, 2, 3, 4, 5] : [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10]).map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    )}
                    <button aria-label={st.done ? 'Undo set' : 'Complete set'} disabled={finished} onClick={() => complete(i, j)}
                      className="press grid h-10 w-10 place-items-center rounded-full"
                      style={{ background: st.done ? (st.warmup ? 'var(--surface-high)' : 'rgba(200,245,96,.18)') : active ? 'var(--accent)' : 'var(--surface-high)', color: st.done ? 'var(--lime)' : active ? 'var(--accent-ink)' : 'var(--text-mute)' }}>
                      <Icon name="check" size={18} />
                    </button>
                  </div>
                )
              })}
            </div>
            {!finished && (
              <div className="mt-3 flex items-center justify-between">
                <button className="chip press" onClick={() => {
                  const last = cur.sets[cur.sets.length - 1]
                  void patchEx(i, { sets: [...cur.sets, { set_no: cur.sets.length + 1, weight_kg: last?.weight_kg ?? null, reps: last?.reps ?? null, done: false }] })
                }}>+ Add set</button>
                {cur.sets.length > 1 && <button className="chip press" onClick={() => void patchEx(i, { sets: cur.sets.slice(0, -1) })}>− Remove set</button>}
              </div>
            )}
          </section>
        )
      })()}

      {/* Up next / list */}
      {session.exercises.length > 0 && (
        <div className="mt-4 grid gap-2">
          <div className="eyebrow">All exercises</div>
          {session.exercises.map((e, i) => {
            const d = e.sets.filter(x => !x.warmup)
            return (
              <button key={e.workout_exercise_id} onClick={() => { setCurrent(i); window.scrollTo({ top: 0, behavior: 'smooth' }) }}
                className="card press flex items-center gap-3 p-3 text-left" style={i === current ? { borderColor: 'var(--accent)' } : undefined}>
                <span className="mono grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold"
                  style={{ background: d.every(x => x.done) ? 'rgba(200,245,96,.18)' : 'var(--surface-raised)', color: d.every(x => x.done) ? 'var(--lime)' : 'var(--text-dim)' }}>
                  {d.every(x => x.done) ? '✓' : `#${i + 1}`}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{e.name}</span>
                  <span className="mono block text-[11px]" style={{ color: 'var(--text-mute)' }}>{d.filter(x => x.done).length}/{d.length} sets{e.superset ? ' · superset' : ''}</span>
                </span>
              </button>
            )
          })}
          {!finished && <Button variant="quiet" onClick={() => setPicker({ mode: 'add' })}>+ Add exercise</Button>}
        </div>
      )}

      {/* Rest timer */}
      {restLeft != null && (
        <div className="anim-sheet fixed inset-x-0 z-50 flex justify-center px-4" style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <div className="glass flex w-full max-w-[488px] items-center gap-3 p-3">
            <RestRing left={restLeft} total={restTotal} />
            <div className="flex-1">
              <div className="figure text-[26px] leading-none">{fmtRest(restLeft)} <span className="mono text-[11px] font-normal">REST</span></div>
              <div className="mono text-[11px]" style={{ color: 'var(--text-mute)' }}>Target {fmtRest(restTotal)}</div>
            </div>
            <button className="chip press" onClick={() => { setRestEnd(e => (e ?? Date.now()) + 15000); setRestTotal(t => t + 15) }}>+15s</button>
            <button className="press rounded-full px-4 py-2 text-[13px] font-bold" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }} onClick={() => setRestEnd(null)}>Skip »</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="anim-fade fixed inset-x-0 top-0 z-[70] flex justify-center px-4" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
          <div className="pop rounded-2xl px-4 py-3 text-[13px] font-bold" style={{ background: 'var(--lime)', color: '#131a02' }}>★ {toast}</div>
        </div>
      )}

      <ExerciseMenu open={menu !== null} onClose={() => setMenu(null)} session={session} index={menu ?? 0}
        onPatch={(p) => menu !== null && void patchEx(menu, p)}
        onRemove={() => { if (menu === null) return; void persist({ ...session, exercises: session.exercises.filter((_, k) => k !== menu) }); setCurrent(0); setMenu(null) }}
        onSwap={() => { setPicker({ mode: 'swap', index: menu ?? 0 }); setMenu(null) }}
        onMove={(dir) => {
          if (menu === null) return
          const k = menu + dir
          if (k < 0 || k >= session.exercises.length) return
          const arr = [...session.exercises]; [arr[menu], arr[k]] = [arr[k], arr[menu]]
          void persist({ ...session, exercises: arr }); setCurrent(k); setMenu(null)
        }}
        onSuperset={(dir) => {
          if (menu === null) return
          const k = menu + dir
          const other = session.exercises[k]
          if (!other) return
          const id = session.exercises[menu].superset ?? other.superset ?? uid()
          void persist({ ...session, exercises: session.exercises.map((e, x) => (x === menu || x === k ? { ...e, superset: id } : e)) })
          setMenu(null)
        }} />

      <ExercisePicker open={picker !== null} lib={lib} onClose={() => setPicker(null)} onPick={x => {
        if (picker?.mode === 'swap') {
          const i = picker.index
          void patchEx(i, { exercise_id: x.id, name: x.name, kind: x.kind, muscle: x.muscle, target: '', note: `Swapped in for ${session.exercises[i].name}` })
        } else addExercise(x)
        setPicker(null)
      }} />
    </div>
  )
}

function effortColor(v: number | undefined, scale: 'rir' | 'rpe') {
  if (v == null) return 'var(--text-mute)'
  const hard = scale === 'rir' ? 5 - v : (v - 5) // 0..5
  return hard >= 5 ? 'var(--danger)' : hard >= 4 ? 'var(--accent)' : hard >= 2 ? 'var(--carbs)' : 'var(--lime)'
}

function RestRing({ left, total }: { left: number; total: number }) {
  const size = 48, r = 20, c = 2 * Math.PI * r, p = total ? left / total : 0
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={24} cy={24} r={r} fill="none" stroke="var(--surface-high)" strokeWidth="5" />
      <circle cx={24} cy={24} r={r} fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} style={{ transition: 'stroke-dasharray .25s linear' }} />
    </svg>
  )
}

function ExerciseMenu({ open, onClose, session, index, onPatch, onRemove, onSwap, onMove, onSuperset }: {
  open: boolean; onClose: () => void; session: WorkoutSession; index: number
  onPatch: (p: Partial<SessionExercise>) => void; onRemove: () => void; onSwap: () => void
  onMove: (dir: -1 | 1) => void; onSuperset: (dir: -1 | 1) => void
}) {
  const e = session.exercises[index]
  const [note, setNote] = useState('')
  const noteRef = useRef(e?.note)
  useEffect(() => { if (open) { setNote(e?.note ?? ''); noteRef.current = e?.note } }, [open, e?.note])
  if (!e) return null
  return (
    <Sheet open={open} onClose={() => { if (note !== noteRef.current) onPatch({ note }); onClose() }} title={e.name}>
      <div className="grid gap-2">
        <Field label="Note"><textarea rows={2} maxLength={300} value={note} onChange={ev => setNote(ev.target.value)} /></Field>
        <Field label="Rest for this exercise (seconds)">
          <input type="number" inputMode="numeric" min={0} max={900} defaultValue={e.rest_sec ?? ''} placeholder="Default"
            onBlur={ev => onPatch({ rest_sec: ev.target.value === '' ? undefined : Math.min(900, Math.max(0, Number(ev.target.value))) })} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="quiet" onClick={onSwap}>Swap exercise</Button>
          <Button variant="quiet" onClick={() => onSuperset(1)} disabled={index >= session.exercises.length - 1}>Superset with next</Button>
          <Button variant="quiet" onClick={() => onMove(-1)} disabled={index === 0}>Move up</Button>
          <Button variant="quiet" onClick={() => onMove(1)} disabled={index >= session.exercises.length - 1}>Move down</Button>
        </div>
        {e.superset && <Button variant="ghost" onClick={() => onPatch({ superset: undefined })}>Remove from superset</Button>}
        <Button variant="danger" onClick={onRemove}>Remove exercise</Button>
      </div>
    </Sheet>
  )
}

export function ExercisePicker({ open, lib, onClose, onPick }: { open: boolean; lib: LibExercise[]; onClose: () => void; onPick: (x: LibExercise) => void }) {
  const s = useStore()
  const [q, setQ] = useState('')
  const [muscle, setMuscle] = useState('')
  const all = useMemo(() => [...(s.customExercises as LibExercise[]), ...lib], [s.customExercises, lib])
  const favs = useMemo(() => new Set(s.customExercises.filter(e => e.favorite).map(e => e.id)), [s.customExercises])
  const res = useMemo(() => searchExercises(all, q, { muscle: muscle || undefined }, favs).slice(0, 80), [all, q, muscle, favs])
  const muscles = ['chest', 'back', 'shoulders', 'upper arms', 'upper legs', 'lower legs', 'waist', 'cardio']
  return (
    <Sheet open={open} onClose={onClose} title="Pick an exercise">
      <div className="grid gap-3">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search 1,324 exercises" aria-label="Search exercises" />
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {muscles.map(m => <button key={m} className="chip press shrink-0" aria-pressed={muscle === m} onClick={() => setMuscle(muscle === m ? '' : m)}>{m}</button>)}
        </div>
        <div className="grid max-h-[50vh] gap-1.5 overflow-y-auto overscroll-contain">
          {lib.length === 0 && <div className="text-[13px]" style={{ color: 'var(--text-mute)' }}>Loading library…</div>}
          {res.map(x => (
            <button key={x.id} onClick={() => onPick(x)} className="cv raised press flex items-center justify-between gap-2 p-3 text-left">
              <span className="min-w-0"><span className="block truncate text-[14px] font-semibold">{x.name}</span>
                <span className="mono block text-[11px]" style={{ color: 'var(--text-mute)' }}>{x.muscle} · {x.equipment}</span></span>
              {favs.has(x.id) && <span style={{ color: 'var(--accent)' }}><Icon name="star" size={16} /></span>}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  )
}
