import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../store'
import { round1, sessionSets, sessionVolume, sumTotals, totalsByMeal } from '../lib/calc'
import { adherenceFor } from '../lib/derive'
import { Card, Empty, ScoreArc, Screen, Stat } from '../ui'

export default function DayDetail() {
  const s = useStore()
  const nav = useNavigate()
  const { date = '' } = useParams()

  const src = { foodLogs: s.foodLogs, sessions: s.sessions, steps: s.steps, target: s.target, settings: s.settings }
  const adh = adherenceFor(src, date)
  const logs = s.foodLogs.filter(l => l.date === date)
  const totals = sumTotals(logs)
  const byMeal = totalsByMeal(logs)
  const session = s.sessions.find(x => x.date === date) ?? null
  const steps = s.steps.find(x => x.date === date)?.steps ?? null
  const weight = s.weights.find(w => w.date === date)?.weight_kg ?? null
  const insight = s.insights.find(i => i.created_at.slice(0, 10) === date)
  const nice = new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <Screen title={nice} sub="Day detail" back={() => nav(-1 as never)}>
      <Card glass className="grid place-items-center">
        <ScoreArc value={adh.score} label="Completion" />
        <div className="mt-2 grid w-full grid-cols-3 gap-2 text-center">
          {(['diet', 'workout', 'steps'] as const).map(k => (
            <div key={k} className="raised py-2">
              <div className="eyebrow">{k}</div>
              <div className="text-[12px] font-bold" style={{
                color: adh[k] === 'complete' ? 'var(--color-good)' : adh[k] === 'partial' ? 'var(--color-warn)' : 'var(--text-mute)',
              }}>{adh[k] === 'na' ? 'N/A' : adh[k]}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-3">
        <div className="eyebrow">Diet</div>
        <div className="mt-1 text-[20px] font-black">{Math.round(totals.calories).toLocaleString()} kcal</div>
        <div className="text-[12px]" style={{ color: 'var(--text-mute)' }}>
          P {round1(totals.protein_g)}g · C {round1(totals.carbs_g)}g · F {round1(totals.fat_g)}g
          {s.target ? ` · target ${s.target.calories} kcal` : ''}
        </div>
        <div className="mt-3 grid gap-1.5">
          {s.mealTypes.map(m => (
            <div key={m.id} className="flex justify-between border-b pb-1.5 text-[12px] last:border-0" style={{ borderColor: 'var(--line)' }}>
              <span>{m.name}</span>
              <span style={{ color: 'var(--text-mute)' }}>{Math.round(byMeal[m.id]?.calories ?? 0)} kcal</span>
            </div>
          ))}
        </div>
        {logs.length === 0 && <div className="mt-2 text-[12px]" style={{ color: 'var(--text-mute)' }}>Nothing logged.</div>}
      </Card>

      <Card className="mt-3">
        <div className="eyebrow">Workout</div>
        {session ? (
          <>
            <div className="mt-1 text-[15px] font-extrabold">{session.day_name}</div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Stat label="Sets" value={sessionSets(session)} />
              <Stat label="Volume" value={`${Math.round(sessionVolume(session)).toLocaleString()} kg`} />
              <Stat label="Duration" value={duration(session.started_at, session.finished_at)} />
            </div>
          </>
        ) : <div className="mt-1 text-[12px]" style={{ color: 'var(--text-mute)' }}>
          {adh.workout === 'na' ? 'Rest day.' : 'No session logged.'}
        </div>}
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Steps" value={steps == null ? '—' : steps.toLocaleString()} sub={`Goal ${s.settings.step_goal.toLocaleString()}`} />
        <Stat label="Weight" value={weight == null ? '—' : `${weight} kg`} />
      </div>

      {insight ? (
        <Card className="mt-3">
          <div className="eyebrow">AI insight</div>
          <p className="mt-1 text-[13px]">{insight.text}</p>
        </Card>
      ) : <div className="mt-3"><Empty title="No AI insight for this day" /></div>}
    </Screen>
  )
}

function duration(start: string, end?: string) {
  if (!end) return '—'
  const mins = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000))
  return `${mins} min`
}
