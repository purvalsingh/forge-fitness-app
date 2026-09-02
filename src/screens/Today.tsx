import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, useToday } from '../store'
import { sumTotals, totalsByMeal, streak, toISO } from '../lib/calc'
import { adherenceFor, activeDates, daySteps } from '../lib/derive'
import { Bar, Button, Card, Icon, Ring, ScoreArc, Screen, Sheet, Field } from '../ui'
import { uid } from '../lib/db'

export default function Today() {
  const s = useStore()
  const date = useToday()
  const nav = useNavigate()
  const [stepSheet, setStepSheet] = useState(false)

  const logs = s.foodLogs.filter(l => l.date === date)
  const totals = sumTotals(logs)
  const byMeal = totalsByMeal(logs)
  const session = s.sessions.find(x => x.date === date) ?? null
  const src = { foodLogs: s.foodLogs, sessions: s.sessions, steps: s.steps, target: s.target, settings: s.settings }
  const adh = adherenceFor(src, date)
  const steps = daySteps(src, date)
  const plan = s.plans.find(p => p.active) ?? s.plans[0]
  const dow = new Date(date + 'T00:00:00').getDay()
  const isRest = s.settings.rest_days.includes(dow)

  const todayDay = useMemo(() => {
    if (!plan || isRest) return null
    if (session) return plan.days.find(d => d.id === session.day_id) ?? null
    const done = s.sessions.filter(x => x.finished_at).sort((a, b) => a.date.localeCompare(b.date))
    const lastIdx = done.length ? plan.days.findIndex(d => d.id === done[done.length - 1].day_id) : -1
    return plan.days[(lastIdx + 1) % plan.days.length] ?? null
  }, [plan, session, s.sessions, isRest])

  const dates = activeDates(src)
  const cur = streak(dates, date, d => adherenceFor(src, d).score >= 0.6)

  const t = s.target
  const pct = (v: number, target?: number) => (target ? Math.min(1, v / target) : 0)
  const nice = new Date(date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

  return (
    <Screen>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <div className="eyebrow">FORGE</div>
          <h1 className="text-[26px] font-black leading-none tracking-tight">Today</h1>
          <div className="mt-1 text-[12px]" style={{ color: 'var(--text-mute)' }}>{nice}</div>
        </div>
        <Link to="/more/settings" aria-label="Settings" className="grid h-10 w-10 place-items-center rounded-full border"
          style={{ borderColor: 'var(--line)' }}><Icon name="gear" size={18} /></Link>
      </div>

      <Card glass className="grid place-items-center">
        <ScoreArc value={adh.score} label="Today's score" />
        <div className="mt-3 grid w-full grid-cols-3 gap-2">
          <StatusPill label="Diet" state={adh.diet} onClick={() => nav('/diet')} />
          <StatusPill label="Workout" state={adh.workout} onClick={() => nav('/workout')} />
          <StatusPill label="Steps" state={adh.steps} value={steps == null ? '—' : steps.toLocaleString()}
            onClick={() => setStepSheet(true)} />
        </div>
      </Card>

      <div className="mt-3 grid gap-3">
        <Card>
          <div className="flex items-center justify-between">
            <div className="eyebrow">Today's target</div>
            <Link to="/more/target" className="text-[11px]" style={{ color: 'var(--accent)' }}>Adjust</Link>
          </div>
          {t ? (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[28px] font-black">{Math.round(totals.calories).toLocaleString()}</span>
                <span className="text-[13px]" style={{ color: 'var(--text-mute)' }}>/ {t.calories.toLocaleString()} kcal</span>
              </div>
              <div className="mt-2"><Bar value={pct(totals.calories, t.calories)} /></div>
              <div className="mt-1 text-[11px]" style={{ color: 'var(--text-mute)' }}>
                {Math.max(0, Math.round(t.calories - totals.calories)).toLocaleString()} kcal remaining
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Ring value={pct(totals.protein_g, t.protein_g)} label={`${Math.round(totals.protein_g)}g`} sub={`Protein ${t.protein_g}g`} />
                <Ring value={pct(totals.carbs_g, t.carbs_g)} label={`${Math.round(totals.carbs_g)}g`} sub={`Carbs ${t.carbs_g}g`} />
                <Ring value={pct(totals.fat_g, t.fat_g)} label={`${Math.round(totals.fat_g)}g`} sub={`Fat ${t.fat_g}g`} />
              </div>
            </>
          ) : (
            <div className="mt-2 grid gap-2">
              <div className="text-[13px]" style={{ color: 'var(--text-dim)' }}>No nutrition target yet.</div>
              <Button onClick={() => nav('/more/target')}>Set nutrition target</Button>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <div className="eyebrow">Today's meals</div>
            <Link to="/diet" className="text-[11px]" style={{ color: 'var(--accent)' }}>Open diet</Link>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {s.mealTypes.map(m => {
              const mt = byMeal[m.id]
              return (
                <button key={m.id} onClick={() => nav('/diet')} className="raised p-3 text-left">
                  <div className="text-[13px] font-bold">{m.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>{m.time}</div>
                  <div className="mt-2 text-[15px] font-extrabold">{Math.round(mt?.calories ?? 0)} <span className="text-[11px] font-medium">kcal</span></div>
                  <div className="text-[11px]" style={{ color: mt ? 'var(--color-good)' : 'var(--text-mute)' }}>
                    {mt ? 'Logged' : 'Not logged'}
                  </div>
                </button>
              )
            })}
          </div>
        </Card>

        <Card>
          <div className="eyebrow">Today's workout</div>
          {isRest ? (
            <div className="mt-2 text-[14px] font-bold">Rest day</div>
          ) : todayDay ? (
            <>
              <div className="mt-1 text-[16px] font-extrabold">{todayDay.name}</div>
              <div className="text-[12px]" style={{ color: 'var(--text-mute)' }}>
                {todayDay.focus} · {todayDay.exercises.length} exercises
                {session ? ` · ${session.exercises.reduce((a, e) => a + e.sets.filter(x => x.done).length, 0)} sets done` : ''}
              </div>
              <div className="mt-3">
                <Button onClick={() => nav(`/workout/session/${todayDay.id}`)}>
                  {session?.finished_at ? 'View workout' : session ? 'Continue workout' : 'Start workout'}
                </Button>
              </div>
            </>
          ) : (
            <div className="mt-2 text-[13px]" style={{ color: 'var(--text-dim)' }}>No plan yet.</div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <div className="eyebrow">Current streak</div>
            <div className="mt-1 text-[24px] font-black">{cur} <span className="text-[12px] font-bold">days</span></div>
          </Card>
          <Card onClick={() => nav('/adherence')}>
            <div className="eyebrow">Monthly adherence</div>
            <div className="mt-1 text-[13px] font-bold" style={{ color: 'var(--accent)' }}>Open calendar →</div>
          </Card>
        </div>
      </div>

      <StepSheet open={stepSheet} onClose={() => setStepSheet(false)} date={date} />
    </Screen>
  )
}

function StatusPill({ label, state, value, onClick }: {
  label: string; state: 'complete' | 'partial' | 'incomplete' | 'na'; value?: string; onClick: () => void
}) {
  const color = state === 'complete' ? 'var(--color-good)' : state === 'partial' ? 'var(--color-warn)' : 'var(--text-mute)'
  const text = state === 'complete' ? 'On track' : state === 'partial' ? 'Partial'
    : state === 'na' ? (label === 'Workout' ? 'Rest' : '—') : 'Pending'
  return (
    <button onClick={onClick} className="raised grid place-items-center gap-1 py-3">
      <span className="eyebrow">{label}</span>
      <span className="text-[13px] font-bold" style={{ color }}>{value ?? text}</span>
    </button>
  )
}

export function StepSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const s = useStore()
  const existing = s.steps.find(x => x.date === date)
  const [v, setV] = useState(String(existing?.steps ?? ''))
  return (
    <Sheet open={open} onClose={onClose} title="Log steps">
      <div className="grid gap-3">
        <Field label={`Steps on ${date}`} hint={`Goal: ${s.settings.step_goal.toLocaleString()}`}>
          <input type="number" inputMode="numeric" min={0} max={200000} value={v}
            onChange={e => setV(e.target.value)} placeholder="7842" />
        </Field>
        <Button onClick={async () => {
          const n = Number(v)
          if (!Number.isFinite(n) || n < 0 || n > 200000) return
          await s.save('step_logs', { id: existing?.id ?? uid(), date, steps: Math.round(n) })
          onClose()
        }}>Save steps</Button>
        {existing && <Button variant="danger" onClick={async () => { await s.del('step_logs', existing.id); onClose() }}>Delete entry</Button>}
      </div>
    </Sheet>
  )
}

export { toISO }
