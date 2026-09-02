import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { uid } from '../lib/db'
import { Bar, Button, Card, Field, Notice, Screen, Stat } from '../ui'
import type { ActivityLevel, Goal, GoalMode } from '../lib/types'

const MODES: { value: GoalMode; title: string; body: string }[] = [
  { value: 'cut', title: 'Cut', body: 'Lose body fat' },
  { value: 'maintain', title: 'Maintain', body: 'Hold current weight' },
  { value: 'bulk', title: 'Bulk', body: 'Build size' },
]
const LEVELS: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Sedentary' }, { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' }, { value: 'high', label: 'High' }, { value: 'athlete', label: 'Athlete' },
]

export default function Goals() {
  const s = useStore()
  const nav = useNavigate()
  const [g, setG] = useState<Goal>(() => s.goal ?? {
    id: uid(), mode: 'maintain', current_weight_kg: 75, target_weight_kg: 75,
    activity_level: 'moderate', avg_daily_steps: 8000, training_days_per_week: 5,
    training_minutes: 60, rate_kg_per_week: 0.4, updated_at: new Date().toISOString(),
  })
  const [saved, setSaved] = useState(false)
  const set = (p: Partial<Goal>) => { setG(v => ({ ...v, ...p })); setSaved(false) }

  const start = s.goal?.current_weight_kg ?? g.current_weight_kg
  const latest = [...s.weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.weight_kg ?? g.current_weight_kg
  const span = g.target_weight_kg - start
  const progress = Math.abs(span) < 0.05 ? 1 : Math.max(0, Math.min(1, (latest - start) / span))

  const invalid =
    g.current_weight_kg < 25 || g.current_weight_kg > 400 ||
    g.target_weight_kg < 25 || g.target_weight_kg > 400 ||
    (g.mode === 'cut' && g.target_weight_kg > g.current_weight_kg) ||
    (g.mode === 'bulk' && g.target_weight_kg < g.current_weight_kg)

  return (
    <Screen title="Goals" sub="Cut · Maintain · Bulk" back={() => nav('/more')}>
      <div className="grid grid-cols-3 gap-2">
        {MODES.map(m => (
          <Card key={m.value} glass={g.mode === m.value} onClick={() => set({ mode: m.value })}
            className="text-center" style={g.mode === m.value ? { borderColor: 'var(--accent)' } : undefined}>
            <div className="text-[14px] font-extrabold uppercase">{m.title}</div>
            <div className="mt-1 text-[10px]" style={{ color: 'var(--text-mute)' }}>{m.body}</div>
          </Card>
        ))}
      </div>

      <Card className="mt-3">
        <div className="eyebrow">Progress to target</div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-[22px] font-black">{latest} kg</span>
          <span className="text-[12px]" style={{ color: 'var(--text-mute)' }}>target {g.target_weight_kg} kg</span>
        </div>
        <div className="mt-2"><Bar value={progress} height={8} /></div>
        <div className="mt-1 text-[11px]" style={{ color: 'var(--text-mute)' }}>
          {Math.round(progress * 100)}% · started at {start} kg
        </div>
      </Card>

      <div className="mt-3 grid gap-3">
        <Card>
          <div className="eyebrow mb-2">Body</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Current weight (kg)">
              <input type="number" step="0.1" value={g.current_weight_kg} onChange={e => set({ current_weight_kg: Number(e.target.value) })} />
            </Field>
            <Field label="Target weight (kg)">
              <input type="number" step="0.1" value={g.target_weight_kg} onChange={e => set({ target_weight_kg: Number(e.target.value) })} />
            </Field>
          </div>
          {s.profile && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Field label="Height (cm)">
                <input type="number" value={s.profile.height_cm}
                  onChange={e => s.save('profiles', { ...s.profile!, height_cm: Number(e.target.value) } as never)} />
              </Field>
              <Field label="Age">
                <input type="number" value={s.profile.age}
                  onChange={e => s.save('profiles', { ...s.profile!, age: Number(e.target.value) } as never)} />
              </Field>
              <Field label="Sex">
                <select value={s.profile.sex}
                  onChange={e => s.save('profiles', { ...s.profile!, sex: e.target.value as 'male' | 'female' } as never)}>
                  <option value="male">Male</option><option value="female">Female</option>
                </select>
              </Field>
            </div>
          )}
        </Card>

        <Card>
          <div className="eyebrow mb-2">Activity</div>
          <Field label="Activity level">
            <select value={g.activity_level} onChange={e => set({ activity_level: e.target.value as ActivityLevel })}>
              {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </Field>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Field label="Avg daily steps">
              <input type="number" value={g.avg_daily_steps} onChange={e => set({ avg_daily_steps: Number(e.target.value) })} />
            </Field>
            <Field label="Training days / week">
              <input type="number" min={0} max={7} value={g.training_days_per_week} onChange={e => set({ training_days_per_week: Number(e.target.value) })} />
            </Field>
            <Field label="Session length (min)">
              <input type="number" value={g.training_minutes} onChange={e => set({ training_minutes: Number(e.target.value) })} />
            </Field>
            <Field label="Rate (kg / week)" hint={g.mode === 'maintain' ? 'Ignored while maintaining.' : undefined}>
              <input type="number" step="0.05" min={0} max={1.5} value={g.rate_kg_per_week}
                onChange={e => set({ rate_kg_per_week: Number(e.target.value) })} />
            </Field>
          </div>
        </Card>

        {invalid && <Notice tone="warn">Check the weights: the target does not match the selected goal mode, or is out of range.</Notice>}
        {saved && <Notice>Goal saved.</Notice>}

        <Button disabled={invalid} onClick={async () => {
          await s.save('goals', { ...g, updated_at: new Date().toISOString() } as never)
          setSaved(true)
        }}>Save goal</Button>
        <Button variant="quiet" onClick={() => nav('/more/target')}>Calculate nutrition target →</Button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Steps goal" value={s.settings.step_goal.toLocaleString()} />
        <Stat label="Training" value={`${g.training_days_per_week}×/wk`} />
        <Stat label="Calories" value={s.target ? s.target.calories.toLocaleString() : '—'} />
      </div>
    </Screen>
  )
}
