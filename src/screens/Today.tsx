import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore, useActiveDate } from '../store'
import { addDays, sumTotals, totalsByMeal, streak, round1 } from '../lib/calc'
import { adherenceFor, activeDates, daySteps } from '../lib/derive'
import { Button, Field, Icon, Sheet } from '../ui'
import { uid } from '../lib/db'
import { AddFoodSheet } from './AddFood'

const niceDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

export default function Today() {
  const s = useStore()
  const { date, today, isToday, setDate } = useActiveDate()
  const nav = useNavigate()
  const [stepSheet, setStepSheet] = useState(false)
  const [waterSheet, setWaterSheet] = useState(false)
  const [addFor, setAddFor] = useState<string | null>(null)

  const logs = s.foodLogs.filter(l => l.date === date)
  const totals = sumTotals(logs)
  const byMeal = totalsByMeal(logs)
  const session = s.sessions.find(x => x.date === date) ?? null
  const src = { foodLogs: s.foodLogs, sessions: s.sessions, steps: s.steps, target: s.target, settings: s.settings }
  const adh = adherenceFor(src, date)
  const steps = daySteps(src, date)
  const water = s.water.filter(w => w.date === date).reduce((a, w) => a + w.ml, 0)
  const waterGoal = s.settings.water_goal_ml ?? 2500
  const plan = s.plans.find(p => p.active) ?? s.plans[0]
  const dow = new Date(date + 'T00:00:00').getDay()
  const isRest = s.settings.rest_days.includes(dow)

  const todayDay = useMemo(() => {
    if (!plan || isRest) return null
    if (session) return plan.days.find(d => d.id === session.day_id) ?? null
    const done = s.sessions.filter(x => x.finished_at && x.plan_id === plan.id).sort((a, b) => a.date.localeCompare(b.date))
    const lastIdx = done.length ? plan.days.findIndex(d => d.id === done[done.length - 1].day_id) : -1
    return plan.days[(lastIdx + 1) % plan.days.length] ?? null
  }, [plan, session, s.sessions, isRest])

  const cur = streak(activeDates(src), date, d => adherenceFor(src, d).score >= 0.6)
  const t = s.target
  const pct = t ? Math.min(1, totals.calories / t.calories) : 0
  const remaining = t ? Math.round(t.calories - totals.calories) : 0

  return (
    <div className="page mx-auto w-full max-w-[520px] px-4 safe-bottom" style={{ paddingTop: 'calc(14px + env(safe-area-inset-top))' }}>
      {/* Header */}
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="eyebrow">{niceDate(date)}</div>
          <h1 className="title text-[30px] leading-tight">
            {isToday ? 'Today' : date === addDays(today, -1) ? 'Yesterday' : niceDate(date)}
            <span style={{ color: 'var(--accent)' }}>.</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-full border p-1" style={{ borderColor: 'var(--line)', background: 'var(--surface-solid)' }}>
            <button aria-label="Previous day" className="press grid h-9 w-9 place-items-center rounded-full" onClick={() => setDate(addDays(date, -1))}><Icon name="left" size={18} /></button>
            <label className="mono relative px-1 text-[12px]">
              {isToday ? 'Today' : date.slice(5)}
              <input type="date" max={today} value={date} aria-label="Pick a day" onChange={e => e.target.value && setDate(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
            <button aria-label="Next day" disabled={isToday} className="press grid h-9 w-9 place-items-center rounded-full disabled:opacity-30" onClick={() => setDate(addDays(date, 1))}><Icon name="chevron" size={18} /></button>
          </div>
          <Link to="/more" aria-label="Profile and settings" className="press grid h-11 w-11 place-items-center rounded-full font-bold"
            style={{ background: 'var(--surface-raised)', border: '2px solid var(--accent)' }}>
            {(s.profile?.display_name || 'A').slice(0, 1).toUpperCase()}
          </Link>
        </div>
      </header>

      {!isToday && (
        <button onClick={() => setDate(today)} className="press mb-3 flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-[13px]"
          style={{ background: 'rgba(255,107,44,.12)', color: 'var(--accent)', border: '1px solid rgba(255,107,44,.3)' }}>
          <span>Logging for <b>{niceDate(date)}</b> — food, workouts and steps go to this day.</span>
          <span className="shrink-0 font-bold">Back to today →</span>
        </button>
      )}

      {/* Energy hero */}
      <section className="paper glow p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow flex items-center gap-1.5" style={{ color: 'var(--accent)' }}><Icon name="flame" size={13} /> Energy balance</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="figure text-[44px] leading-none">{Math.round(totals.calories).toLocaleString()}</span>
              <span className="mono text-[13px]" style={{ color: 'var(--paper-ink-dim)' }}>/ {t ? t.calories.toLocaleString() : '—'} kcal</span>
            </div>
            {t ? (
              <div className="chip mono mt-3" style={{ color: remaining >= 0 ? 'var(--text)' : 'var(--danger)' }}>
                <span className="h-2 w-2 rounded-full" style={{ background: 'var(--accent)' }} />
                {remaining >= 0 ? `${remaining.toLocaleString()} kcal left` : `${Math.abs(remaining).toLocaleString()} kcal over`}
              </div>
            ) : (
              <Link to="/more/target" className="chip mt-3" style={{ color: 'var(--accent)' }}>Set your target →</Link>
            )}
          </div>
          <Arc value={pct} />
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Macro label="Protein" v={totals.protein_g} target={t?.protein_g} color="var(--protein)" />
          <Macro label="Carbs" v={totals.carbs_g} target={t?.carbs_g} color="var(--carbs)" />
          <Macro label="Fat" v={totals.fat_g} target={t?.fat_g} color="var(--fat)" />
        </div>
      </section>

      {/* Stat tiles */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Tile icon="steps" onClick={() => setStepSheet(true)} value={steps == null ? '—' : steps.toLocaleString()}
          label="Steps" sub={`goal ${(s.settings.step_goal / 1000).toFixed(0)}k`} />
        <Tile icon="water" onClick={() => setWaterSheet(true)} value={`${round1(water / 1000)}`} unit="L"
          label="Water" sub={`of ${round1(waterGoal / 1000)} L`} done={water >= waterGoal} />
        <Tile icon="bolt" onClick={() => nav('/adherence')} value={String(cur)} unit="d" label="Streak" sub={`score ${Math.round(adh.score * 100)}%`} accent />
      </div>

      {/* Workout */}
      <section className="card mt-3 p-5">
        <div className="chip" style={{ color: 'var(--accent)', borderColor: 'rgba(255,107,44,.35)', background: 'rgba(255,107,44,.08)' }}>
          <Icon name="workout" size={14} /> {isToday ? "Today's forge" : 'Workout'}
        </div>
        {isRest && !session ? (
          <div className="mt-3">
            <div className="title text-[22px]">Rest day</div>
            <div className="text-[13px]" style={{ color: 'var(--text-mute)' }}>
              {todayDay ? '' : 'Recovery is training too. '}Trained anyway? Start a freestyle session.
            </div>
            <div className="mt-3"><Button variant="quiet" onClick={() => nav('/workout/session/freestyle')}>Freestyle session</Button></div>
          </div>
        ) : todayDay ? (
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="title text-[22px] leading-tight">{todayDay.name}</div>
              <div className="mono mt-1 text-[12px]" style={{ color: 'var(--text-mute)' }}>
                {todayDay.exercises.length} exercises{todayDay.focus ? ` · ${todayDay.focus}` : ''}
                {session ? ` · ${session.exercises.reduce((a, e) => a + e.sets.filter(x => x.done && !x.warmup).length, 0)} sets done` : ''}
              </div>
            </div>
            <button onClick={() => nav(`/workout/session/${todayDay.id}`)} className="press pulse shrink-0 rounded-full px-5 py-3 text-[13px] font-extrabold uppercase tracking-wider"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
              {session?.finished_at ? 'View' : session ? 'Resume' : '▶ Start'}
            </button>
          </div>
        ) : (
          <div className="mt-3 grid gap-2">
            <div className="text-[13px]" style={{ color: 'var(--text-dim)' }}>No plan yet.</div>
            <Button onClick={() => nav('/more/plan')}>Build a plan</Button>
          </div>
        )}
      </section>

      {/* Fuel log */}
      <div className="mt-5 flex items-baseline justify-between">
        <h2 className="title text-[20px]">Fuel log <span className="mono text-[12px] font-normal" style={{ color: 'var(--text-mute)' }}>· {s.mealTypes.filter(m => byMeal[m.id]).length}/{s.mealTypes.length} logged</span></h2>
        <Link to="/diet" className="mono text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>Details →</Link>
      </div>
      <div className="mt-2 grid gap-2">
        {s.mealTypes.map(m => {
          const mt = byMeal[m.id]
          const items = logs.filter(l => l.meal_type_id === m.id)
          return (
            <button key={m.id} onClick={() => (items.length ? nav('/diet') : setAddFor(m.id))}
              className={`press flex items-center gap-3 rounded-[20px] p-4 text-left ${mt ? 'card' : ''}`}
              style={mt ? undefined : { border: '1.5px dashed var(--line)' }}>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: 'var(--surface-raised)', color: mt ? 'var(--lime)' : 'var(--text-mute)' }}>
                <Icon name={mt ? 'check' : 'diet'} size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="mono text-[10px] font-bold uppercase tracking-widest" style={{ color: mt ? 'var(--lime)' : 'var(--text-mute)' }}>{m.name} · {m.time}</div>
                <div className="truncate text-[14px] font-semibold">
                  {items.length ? items.map(i => i.serving_label ? `${i.name} (${i.serving_label})` : i.name).join(', ') : 'Tap to add'}
                </div>
                {mt && <div className="mono text-[11px]" style={{ color: 'var(--text-mute)' }}>
                  <span style={{ color: 'var(--protein)' }}>P {Math.round(mt.protein_g)}g</span> · C {Math.round(mt.carbs_g)}g · F {Math.round(mt.fat_g)}g
                </div>}
              </div>
              {mt
                ? <div className="text-right"><div className="figure text-[20px]">{Math.round(mt.calories)}</div><div className="mono text-[10px]" style={{ color: 'var(--text-mute)' }}>KCAL</div></div>
                : <span className="chip" style={{ color: 'var(--accent)' }}>+ Add</span>}
            </button>
          )
        })}
      </div>

      <FastingCard />

      <StepSheet open={stepSheet} onClose={() => setStepSheet(false)} date={date} />
      <WaterSheet open={waterSheet} onClose={() => setWaterSheet(false)} date={date} />
      <AddFoodSheet open={addFor !== null} onClose={() => setAddFor(null)} date={date} mealTypeId={addFor ?? s.mealTypes[0]?.id ?? ''} />
    </div>
  )
}

function Arc({ value }: { value: number }) {
  const size = 104, stroke = 10, r = (size - stroke) / 2, c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="var(--surface-high)" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" stroke="var(--accent)" opacity={value > 0 ? 1 : 0}
          strokeDasharray={`${c * Math.min(1, value)} ${c}`} style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.9,.25,1)', filter: 'drop-shadow(0 0 6px rgba(255,107,44,.5))' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div><div className="figure text-[22px] leading-none">{Math.round(value * 100)}%</div><div className="eyebrow mt-0.5 text-[9px]">eaten</div></div>
      </div>
    </div>
  )
}

function Macro({ label, v, target, color }: { label: string; v: number; target?: number; color: string }) {
  const p = target ? Math.min(1, v / target) : 0
  return (
    <div className="rounded-2xl p-3" style={{ background: 'var(--surface-raised)' }}>
      <div className="flex items-baseline justify-between">
        <span className="mono text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{label}</span>
        {target ? <span className="mono text-[10px]" style={{ color: 'var(--text-mute)' }}>{Math.round(p * 100)}%</span> : null}
      </div>
      <div className="mt-1"><span className="figure text-[20px]">{Math.round(v)}</span><span className="mono text-[11px]" style={{ color: 'var(--text-mute)' }}> / {target ?? '—'}g</span></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-high)' }}>
        <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: color, transition: 'width .5s ease' }} />
      </div>
    </div>
  )
}

function Tile({ icon, value, unit, label, sub, onClick, done, accent }: {
  icon: string; value: string; unit?: string; label: string; sub: string; onClick: () => void; done?: boolean; accent?: boolean
}) {
  return (
    <button onClick={onClick} className="card press p-3 text-left">
      <div className="flex items-center justify-between" style={{ color: accent ? 'var(--accent)' : done ? 'var(--lime)' : 'var(--text-dim)' }}>
        <Icon name={icon} size={18} />
        {done && <span className="h-2 w-2 rounded-full" style={{ background: 'var(--lime)' }} />}
      </div>
      <div className="mt-2"><span className="figure text-[22px]" style={{ color: accent ? 'var(--accent)' : undefined }}>{value}</span>{unit && <span className="mono text-[11px]"> {unit}</span>}</div>
      <div className="mono text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-mute)' }}>{label} · {sub}</div>
    </button>
  )
}

function FastingCard() {
  const s = useStore()
  const started = s.settings.fasting_started_at
  const hours = s.settings.fasting_hours ?? 16
  const [, force] = useState(0)
  if (!hours) return null
  const elapsed = started ? (Date.now() - new Date(started).getTime()) / 3_600_000 : 0
  const p = started ? Math.min(1, elapsed / hours) : 0
  const save = (fasting_started_at: string | null) => s.save('settings', { ...s.settings, fasting_started_at } as never)
  return (
    <section className="card mt-3 flex items-center gap-4 p-4" onClick={() => force(x => x + 1)}>
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={{ background: 'var(--surface-raised)', color: started ? 'var(--accent)' : 'var(--text-mute)' }}>
        <Icon name="timer" size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mono text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-mute)' }}>Fasting · {hours}h window</div>
        <div className="text-[14px] font-semibold">
          {started ? (p >= 1 ? `Done — ${Math.floor(elapsed)}h fasted` : `${Math.floor(elapsed)}h ${Math.floor((elapsed % 1) * 60)}m of ${hours}h`) : 'Not fasting'}
        </div>
        {started && <div className="mt-1.5 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--surface-high)' }}>
          <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: p >= 1 ? 'var(--lime)' : 'var(--accent)' }} /></div>}
      </div>
      <button className="chip press shrink-0" onClick={e => { e.stopPropagation(); void save(started ? null : new Date().toISOString()) }}>
        {started ? 'End' : 'Start'}
      </button>
    </section>
  )
}

export function WaterSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const s = useStore()
  const entries = s.water.filter(w => w.date === date)
  const total = entries.reduce((a, w) => a + w.ml, 0)
  const add = (ml: number) => { navigator.vibrate?.(10); void s.save('water_logs', { id: uid(), date, ml, at: new Date().toISOString() }) }
  return (
    <Sheet open={open} onClose={onClose} title="Water">
      <div className="grid gap-3">
        <div className="text-center"><span className="figure text-[40px]">{round1(total / 1000)}</span><span className="mono"> / {round1((s.settings.water_goal_ml ?? 2500) / 1000)} L</span></div>
        <div className="grid grid-cols-3 gap-2">
          {[[150, 'Small glass'], [250, 'Glass'], [500, 'Bottle']].map(([ml, l]) => (
            <button key={ml} className="card press grid place-items-center gap-1 p-4" onClick={() => add(ml as number)}>
              <span style={{ color: 'var(--protein)' }}><Icon name="water" /></span>
              <span className="figure text-[16px]">+{ml} ml</span>
              <span className="mono text-[10px]" style={{ color: 'var(--text-mute)' }}>{l}</span>
            </button>
          ))}
        </div>
        {entries.length > 0 && (
          <Button variant="ghost" onClick={() => void s.del('water_logs', entries[entries.length - 1].id)}>Undo last ({entries[entries.length - 1].ml} ml)</Button>
        )}
      </div>
    </Sheet>
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
