import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useToday } from '../store'
import { sessionSets, sessionVolume } from '../lib/calc'
import { Bar, Button, Card, Empty, Icon, Screen, Stat, Tabs } from '../ui'

export default function Workout() {
  const s = useStore()
  const date = useToday()
  const nav = useNavigate()
  const plan = s.plans.find(p => p.active) ?? s.plans[0]
  const [dayId, setDayId] = useState(() => plan?.days[0]?.id ?? '')

  if (!plan) return (
    <Screen title="Workout">
      <Empty title="No workout plan" body="Create a plan to start training."
        action={<div className="mt-2 w-full"><Button onClick={() => nav('/more/plan')}>Open plan builder</Button></div>} />
    </Screen>
  )

  const day = plan.days.find(d => d.id === dayId) ?? plan.days[0]
  const session = s.sessions.find(x => x.date === date && x.day_id === day.id) ?? null
  const doneSets = session ? sessionSets(session) : 0
  const totalSets = day.exercises.reduce((a, e) => a + e.sets, 0)
  const recent = s.sessions.filter(x => x.finished_at).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)

  return (
    <Screen title="Workout" sub="Today's training"
      right={<button aria-label="Plan builder" onClick={() => nav('/more/plan')}
        className="grid h-10 w-10 place-items-center rounded-full border" style={{ borderColor: 'var(--line)' }}>
        <Icon name="gear" size={18} /></button>}>

      <Card glass>
        <div className="eyebrow">{plan.name}</div>
        <h2 className="mt-1 text-[22px] font-black leading-tight">{day.name}</h2>
        <div className="text-[12px]" style={{ color: 'var(--text-mute)' }}>{day.focus}</div>
        <div className="mt-3">
          <Tabs value={dayId || plan.days[0].id} onChange={setDayId}
            options={plan.days.map((d, i) => ({ value: d.id, label: `Day ${i + 1}` }))} />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Bar value={totalSets ? doneSets / totalSets : 0} />
          <span className="shrink-0 text-[11px]" style={{ color: 'var(--text-mute)' }}>{doneSets}/{totalSets}</span>
        </div>
        <div className="mt-3">
          <Button onClick={() => nav(`/workout/session/${day.id}`)}>
            {session?.finished_at ? 'View workout' : session ? 'Continue workout' : 'Start workout'}
          </Button>
        </div>
      </Card>

      <div className="mt-3 grid gap-2">
        {day.exercises.map((ex, i) => {
          const se = session?.exercises.find(x => x.workout_exercise_id === ex.id)
          const done = se ? se.sets.every(x => x.done) : false
          return (
            <Card key={ex.id} onClick={() => nav(`/workout/session/${day.id}`)} className="flex items-center gap-3">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border"
                style={{ borderColor: done ? 'var(--color-good)' : 'var(--line)', background: done ? 'var(--color-good)' : 'transparent' }}>
                {done && <Icon name="check" size={14} color="#12080B" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-bold">{ex.name ?? nameOf(ex.exercise_id)}</span>
                <span className="block text-[11px]" style={{ color: 'var(--text-mute)' }}>
                  {ex.sets} × {ex.reps}{ex.target ? ` · ${ex.target}` : ''}
                </span>
              </span>
              <span className="eyebrow">{i + 1}</span>
            </Card>
          )
        })}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Sessions" value={s.sessions.filter(x => x.finished_at).length} />
        <Stat label="Last volume" value={recent[0] ? `${Math.round(sessionVolume(recent[0])).toLocaleString()} kg` : '—'} />
        <Stat label="Plan days" value={plan.days.length} />
      </div>

      {recent.length > 0 && (
        <Card className="mt-3">
          <div className="eyebrow">Recent sessions</div>
          <ul className="mt-2 grid gap-1.5">
            {recent.map(r => (
              <li key={r.id} className="flex items-center justify-between text-[12px]">
                <span className="truncate">{r.date} · {r.day_name}</span>
                <span style={{ color: 'var(--text-mute)' }}>{sessionSets(r)} sets · {Math.round(sessionVolume(r)).toLocaleString()} kg</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Screen>
  )
}

export function nameOf(exId: string) {
  return exId.replace(/^ex-/, '').split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
}
