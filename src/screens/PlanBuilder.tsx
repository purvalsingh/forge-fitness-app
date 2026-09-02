import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { uid } from '../lib/db'
import { Button, Card, Field, Icon, Notice, Screen, Sheet, Spinner, Tabs } from '../ui'
import { requestPlan } from '../lib/planner'
import { ai } from '../lib/ai'
import { nameOf } from './Workout'
import { SEED_PLAN } from '../lib/seed'
import { FOCUS_LABELS, FREQUENCIES, generatePlan } from '../lib/templates'
import type { TrainingFocus, WorkoutDay, WorkoutPlan } from '../lib/types'

export default function PlanBuilder() {
  const s = useStore()
  const nav = useNavigate()
  const [planId, setPlanId] = useState(() => (s.plans.find(p => p.active) ?? s.plans[0])?.id ?? '')
  const plan = s.plans.find(p => p.id === planId) ?? s.plans[0]
  const [dayId, setDayId] = useState(() => plan?.days[0]?.id ?? '')
  const [addOpen, setAddOpen] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)

  if (!plan) return (
    <Screen title="Workout plans" back={() => nav('/more')}>
      <div className="grid gap-2">
        <Button onClick={() => s.save('workout_plans', { ...SEED_PLAN, id: uid(), active: true } as never)}>
          Use the supplied FORGE 5-day plan
        </Button>
        <Button variant="quiet" onClick={() => setNewOpen(true)}>Build a different plan</Button>
      </div>
      <NewPlanSheet open={newOpen} onClose={() => setNewOpen(false)} />
    </Screen>
  )

  const day = plan.days.find(d => d.id === dayId) ?? plan.days[0]
  const savePlan = (next: WorkoutPlan) => s.save('workout_plans', next as never)
  const patchDay = (patch: Partial<WorkoutDay>) =>
    savePlan({ ...plan, days: plan.days.map(d => d.id === day.id ? { ...d, ...patch } : d) })

  const move = (i: number, dir: -1 | 1) => {
    const list = [...day.exercises]
    const j = i + dir
    if (j < 0 || j >= list.length) return
    ;[list[i], list[j]] = [list[j], list[i]]
    patchDay({ exercises: list.map((e, k) => ({ ...e, position: k })) })
  }

  return (
    <Screen title="Workout plan" sub={plan.name} back={() => nav('/more')}>
      {s.plans.length > 1 && (
        <div className="mb-3">
          <Tabs value={planId} onChange={setPlanId} options={s.plans.map(p => ({ value: p.id, label: p.name.slice(0, 14) }))} />
        </div>
      )}

      <Card>
        <Field label="Plan name">
          <input value={plan.name} onChange={e => savePlan({ ...plan, name: e.target.value })} />
        </Field>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="quiet" onClick={() => savePlan({ ...plan, active: true })}>
            {plan.active ? 'Active plan' : 'Make active'}
          </Button>
          <Button variant="ghost" onClick={() => {
            const id = uid()
            void s.save('workout_plans', {
              ...plan, id, name: `${plan.name} (copy)`, active: false,
              days: plan.days.map(d => ({ ...d, id: uid(), plan_id: id, exercises: d.exercises.map(e => ({ ...e, id: uid() })) })),
            } as never)
          }}>Duplicate plan</Button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button variant="quiet" onClick={() => setNewOpen(true)}>Replace / new plan</Button>
          <Button variant="ghost" onClick={() => setSwapOpen(true)}>Swap this day</Button>
        </div>
        {s.plans.length > 1 && (
          <div className="mt-2">
            <Button variant="danger" onClick={async () => {
              await s.del('workout_plans', plan.id)
              const next = s.plans.find(p => p.id !== plan.id)!
              setPlanId(next.id); setDayId(next.days[0]?.id ?? '')
            }}>Delete this plan</Button>
          </div>
        )}
        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-mute)' }}>
          Changing or replacing a plan never touches your workout history — past sessions are stored separately.
        </p>
      </Card>

      <div className="mt-3">
        <Tabs value={day.id} onChange={setDayId} options={plan.days.map((d, i) => ({ value: d.id, label: `Day ${i + 1}` }))} />
      </div>

      <Card className="mt-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="Day name"><input value={day.name} onChange={e => patchDay({ name: e.target.value })} /></Field>
          <Field label="Focus"><input value={day.focus} onChange={e => patchDay({ focus: e.target.value })} /></Field>
        </div>
      </Card>

      <div className="mt-3 grid gap-2">
        {day.exercises.map((ex, i) => (
          <Card key={ex.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1 text-[14px] font-bold">{ex.name ?? nameOf(ex.exercise_id)}</div>
              <div className="flex shrink-0 gap-1">
                <button aria-label="Move up" onClick={() => move(i, -1)} className="px-2">↑</button>
                <button aria-label="Move down" onClick={() => move(i, 1)} className="px-2">↓</button>
                <button aria-label="Duplicate exercise" className="px-2" onClick={() => patchDay({
                  exercises: [...day.exercises.slice(0, i + 1), { ...ex, id: uid() }, ...day.exercises.slice(i + 1)]
                    .map((e, k) => ({ ...e, position: k })),
                })}>⧉</button>
                <button aria-label="Remove exercise" className="px-2" style={{ color: '#D98A8A' }}
                  onClick={() => patchDay({ exercises: day.exercises.filter(e => e.id !== ex.id) })}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <Field label="Sets">
                <input type="number" min={1} max={12} value={ex.sets}
                  onChange={e => patchDay({ exercises: day.exercises.map(x => x.id === ex.id ? { ...x, sets: Number(e.target.value) } : x) })} />
              </Field>
              <Field label="Reps">
                <input value={ex.reps}
                  onChange={e => patchDay({ exercises: day.exercises.map(x => x.id === ex.id ? { ...x, reps: e.target.value } : x) })} />
              </Field>
              <Field label="Target">
                <input value={ex.target}
                  onChange={e => patchDay({ exercises: day.exercises.map(x => x.id === ex.id ? { ...x, target: e.target.value } : x) })} />
              </Field>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Rest (sec)">
                <input type="number" min={0} max={600} value={ex.rest_sec ?? ''}
                  onChange={e => patchDay({ exercises: day.exercises.map(x => x.id === ex.id ? { ...x, rest_sec: Number(e.target.value) } : x) })} />
              </Field>
              <Field label="Tempo">
                <input value={ex.tempo ?? ''} placeholder="3-0-1"
                  onChange={e => patchDay({ exercises: day.exercises.map(x => x.id === ex.id ? { ...x, tempo: e.target.value } : x) })} />
              </Field>
            </div>
            <div className="mt-2">
              <Field label="Notes">
                <input value={ex.note ?? ''}
                  onChange={e => patchDay({ exercises: day.exercises.map(x => x.id === ex.id ? { ...x, note: e.target.value } : x) })} />
              </Field>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-3 grid gap-2">
        <Button variant="quiet" onClick={() => setAddOpen(true)}>+ Add exercise</Button>
        <Button variant="ghost" onClick={() => savePlan({
          ...plan,
          days: [...plan.days, {
            id: uid(), plan_id: plan.id, name: `Day ${plan.days.length + 1}`, focus: 'Strength',
            position: plan.days.length, exercises: [],
          }],
        })}>+ Add day</Button>
        {plan.days.length > 1 && (
          <Button variant="danger" onClick={() => {
            const days = plan.days.filter(d => d.id !== day.id).map((d, i) => ({ ...d, position: i }))
            setDayId(days[0].id)
            void savePlan({ ...plan, days })
          }}>Delete this day</Button>
        )}
      </div>

      <NewPlanSheet open={newOpen} onClose={() => setNewOpen(false)} onCreated={id => { setNewOpen(false); setPlanId(id) }} />

      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} title={`Replace “${day.name}” with`}>
        <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
          {s.plans.flatMap(p => p.days.map(d => ({ p, d })))
            .filter(({ d }) => d.id !== day.id)
            .map(({ p, d }) => (
              <button key={`${p.id}-${d.id}`} className="raised p-3 text-left" onClick={() => {
                void savePlan({
                  ...plan,
                  days: plan.days.map(x => x.id === day.id ? {
                    ...d, id: day.id, plan_id: plan.id, position: day.position,
                    exercises: d.exercises.map(e => ({ ...e, id: uid() })),
                  } : x),
                })
                setSwapOpen(false)
              }}>
                <div className="text-[13px] font-bold">{d.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
                  {p.name} · {d.exercises.length} exercises
                </div>
              </button>
            ))}
        </div>
      </Sheet>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add exercise">
        <AddExercise onAdd={name => {
          patchDay({
            exercises: [...day.exercises, {
              id: uid(), exercise_id: 'ex-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name,
              sets: 3, reps: '10', target: '', position: day.exercises.length,
            }],
          })
          setAddOpen(false)
        }} />
      </Sheet>
    </Screen>
  )
}

function AddExercise({ onAdd }: { onAdd: (name: string) => void }) {
  const s = useStore()
  const known = [...new Set(s.plans.flatMap(p => p.days.flatMap(d => d.exercises.map(e => e.name ?? nameOf(e.exercise_id)))))].sort()
  const [name, setName] = useState('')
  return (
    <div className="grid gap-3">
      <Field label="Exercise name"><input value={name} onChange={e => setName(e.target.value)} placeholder="Incline DB Press" /></Field>
      <Button disabled={!name.trim()} onClick={() => onAdd(name.trim())}>Add exercise</Button>
      <div className="eyebrow">Already in your plans</div>
      <div className="grid max-h-[36vh] gap-1.5 overflow-y-auto">
        {known.map(n => (
          <button key={n} onClick={() => onAdd(n)} className="raised p-2.5 text-left text-[13px]">{n}</button>
        ))}
      </div>
    </div>
  )
}

function NewPlanSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const s = useStore()
  const [focus, setFocus] = useState<TrainingFocus>('strength_aesthetics')
  const [days, setDays] = useState(5)
  const [preferences, setPreferences] = useState('')
  const [equipment, setEquipment] = useState('')
  const [experience, setExperience] = useState('intermediate')
  const [replace, setReplace] = useState(true)
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<WorkoutPlan | null>(null)
  const [rationale, setRationale] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [aiUsed, setAiUsed] = useState(false)

  const template = generatePlan({ focus, daysPerWeek: days, emphasis: [preferences] })
  const preview = proposal ?? template

  async function activate(plan: WorkoutPlan, source: 'ai' | 'template') {
    if (replace) for (const p of s.plans.filter(p => p.active)) await s.save('workout_plans', { ...p, active: false } as never)
    await s.save('workout_plans', { ...plan, active: replace, source } as never)
    onCreated?.(plan.id)
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Build a plan">
      <div className="grid gap-3">
        <div>
          <div className="eyebrow mb-2">Training focus</div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FOCUS_LABELS) as TrainingFocus[]).map(f => (
              <button key={f} onClick={() => { setFocus(f); setProposal(null) }}
                className="min-h-[44px] rounded-xl border px-3 text-[12px] font-bold"
                style={focus === f
                  ? { background: 'var(--accent-strong)', color: '#F6E6EA', borderColor: 'transparent' }
                  : { borderColor: 'var(--line)' }}>{FOCUS_LABELS[f]}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="eyebrow mb-2">Days per week</div>
          <div className="flex gap-2">
            {FREQUENCIES.map(n => (
              <button key={n} onClick={() => { setDays(n); setProposal(null) }}
                className="min-h-[44px] flex-1 rounded-xl border text-[13px] font-bold"
                style={days === n
                  ? { background: 'var(--accent-strong)', color: '#F6E6EA', borderColor: 'transparent' }
                  : { borderColor: 'var(--line)' }}>{n}</button>
            ))}
          </div>
        </div>

        <Field label="What do you want from this plan?"
          hint="Example: bigger shoulders and wider back, keep bench heavy, no barbell squats — my knee dislikes them.">
          <textarea rows={3} value={preferences} onChange={e => { setPreferences(e.target.value); setProposal(null) }} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label="Equipment">
            <input value={equipment} onChange={e => setEquipment(e.target.value)} placeholder="Full gym / dumbbells only" />
          </Field>
          <Field label="Experience">
            <select value={experience} onChange={e => setExperience(e.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
          </Field>
        </div>

        {busy ? <Spinner label="Designing your plan" /> : (
          <Button disabled={!ai.configured} onClick={async () => {
            setBusy(true); setNote(null)
            const r = await requestPlan({ focus, daysPerWeek: days, preferences, equipment, experience })
            setProposal(r.plan); setRationale(r.rationale ?? null)
            setAiUsed(r.source === 'ai'); setNote(r.fallbackReason ?? null)
            setBusy(false)
          }}>Generate with AI</Button>
        )}
        {!ai.configured && <Notice tone="warn">AI is not configured — the template plan below still works.</Notice>}
        {note && <Notice tone="warn">{note}</Notice>}
        {rationale && aiUsed && (
          <div className="rounded-2xl border p-3" style={{ borderColor: 'var(--glass-border)', background: 'var(--glass)' }}>
            <div className="eyebrow">Why this plan</div>
            <p className="mt-1 text-[12px]">{rationale}</p>
          </div>
        )}

        <div className="raised p-3">
          <div className="eyebrow">{proposal ? (aiUsed ? 'AI plan — review before activating' : 'Template plan') : 'Template preview'}</div>
          <div className="mt-1 text-[13px] font-bold">{preview.name}</div>
          {preview.days.map(d => (
            <details key={d.id} className="mt-1.5">
              <summary className="cursor-pointer text-[12px]">
                <span className="font-bold">{d.name}</span>
                <span style={{ color: 'var(--text-mute)' }}> — {d.exercises.length} exercises</span>
              </summary>
              <ul className="mt-1 grid gap-0.5 pl-3">
                {d.exercises.map(e => (
                  <li key={e.id} className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                    {e.name ?? nameOf(e.exercise_id)} — {e.sets} × {e.reps}
                    {e.rest_sec ? ` · ${e.rest_sec}s` : ''}{e.tempo ? ` · ${e.tempo}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>

        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" className="h-5 w-5" checked={replace} onChange={e => setReplace(e.target.checked)} />
          Make this my active plan
        </label>

        <Button onClick={() => activate(preview, proposal && aiUsed ? 'ai' : 'template')}>
          {proposal ? 'Activate this plan' : 'Create template plan'}
        </Button>
        <Button variant="ghost" onClick={async () => {
          const copy = { ...SEED_PLAN, id: uid(), active: replace }
          if (replace) for (const p of s.plans.filter(p => p.active)) await s.save('workout_plans', { ...p, active: false } as never)
          await s.save('workout_plans', copy as never)
          onCreated?.(copy.id); onClose()
        }}>Use the supplied FORGE 5-day plan</Button>
        <Button variant="ghost" onClick={async () => {
          const id = uid()
          const blank = {
            id, name: 'My plan', active: replace, focus: 'custom' as TrainingFocus, days_per_week: days, source: 'custom' as const,
            days: [{ id: uid(), plan_id: id, name: 'Day 1', focus: 'Custom', position: 0, exercises: [] }],
          }
          if (replace) for (const p of s.plans.filter(p => p.active)) await s.save('workout_plans', { ...p, active: false } as never)
          await s.save('workout_plans', blank as never)
          onCreated?.(id); onClose()
        }}>Start from an empty plan</Button>
      </div>
    </Sheet>
  )
}
