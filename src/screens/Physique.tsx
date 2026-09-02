import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useToday } from '../store'
import { uid } from '../lib/db'
import { downscale, photos, splitDataUrl } from '../lib/photos'
import { ai, AIUnavailable } from '../lib/ai'
import { coerceFocus, localRoadmap, reconcile } from '../lib/physique'
import { FOCUS_LABELS } from '../lib/templates'
import { requestPlan } from '../lib/planner'
import { calcTargets, isValidTarget } from '../lib/calc'
import { Button, Card, Empty, Field, Icon, Notice, Screen, Spinner, Stat } from '../ui'
import type { PhysiqueAngle, PhysiqueAnalysis, PhysiqueCheckin, TrainingFocus, WorkoutPlan } from '../lib/types'

const ANGLES: { key: PhysiqueAngle; label: string; required?: boolean }[] = [
  { key: 'front', label: 'Front', required: true },
  { key: 'side', label: 'Side' },
  { key: 'back', label: 'Back' },
  { key: 'relaxed', label: 'Relaxed' },
  { key: 'flexed', label: 'Flexed' },
]

type Step = 'timeline' | 'upload' | 'goal' | 'analysing' | 'result'

export default function Physique() {
  const s = useStore()
  const nav = useNavigate()
  const date = useToday()

  const [step, setStep] = useState<Step>('timeline')
  const [pics, setPics] = useState<Partial<Record<PhysiqueAngle, string>>>({})
  const [reference, setReference] = useState<string | null>(null)
  const [goal, setGoal] = useState<TrainingFocus>('strength_aesthetics')
  const [priorities, setPriorities] = useState('')
  const [days, setDays] = useState(s.goal?.training_days_per_week ?? 5)
  const [analysis, setAnalysis] = useState<PhysiqueAnalysis | null>(null)
  const [aiUsed, setAiUsed] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const previous = s.checkins[0] ?? null

  async function analyse() {
    setStep('analysing'); setErr(null)
    const local = localRoadmap({ goal, priorities, bodyGoal: s.goal, trainingDays: days })
    let result = local
    let usedAI = false

    if (ai.configured && Object.keys(pics).length > 0) {
      try {
        const out = await ai.physique({
          photos: Object.entries(pics).map(([angle, dataUrl]) => {
            const { mime, base64 } = splitDataUrl(dataUrl!)
            return { angle, mimeType: mime, data: base64 }
          }),
          reference: reference ? (({ mime, base64 }) => ({ mimeType: mime, data: base64 }))(splitDataUrl(reference)) : undefined,
          goal: FOCUS_LABELS[goal],
          priorities,
          context: {
            goal: s.goal, target: s.target, training_days_per_week: days,
            recent_weights: s.weights.slice(-8),
          },
          previous: previous?.analysis,
        })
        result = reconcile(out as PhysiqueAnalysis, local)
        usedAI = true
      } catch (e) {
        setErr(e instanceof AIUnavailable
          ? `${e.message} Showing the calculated roadmap instead.`
          : 'Could not analyse those photos. Showing the calculated roadmap instead.')
      }
    } else if (!ai.configured) {
      setErr('AI is not configured, so photos were not analysed. This roadmap is calculated from your goal and training frequency.')
    }

    // Photos stay on this device: only their keys go into the record.
    const id = uid()
    const keys: Partial<Record<PhysiqueAngle, string>> = {}
    for (const [angle, dataUrl] of Object.entries(pics)) {
      const key = `${id}:${angle}`
      await photos.put(key, dataUrl!)
      keys[angle as PhysiqueAngle] = key
    }
    let refKey: string | undefined
    if (reference) { refKey = `${id}:reference`; await photos.put(refKey, reference) }

    const checkin: PhysiqueCheckin = {
      id, date, created_at: new Date().toISOString(),
      photo_keys: keys, reference_key: refKey,
      goal, priorities, analysis: result,
      weight_kg: s.weights.find(w => w.date === date)?.weight_kg,
    }
    await s.save('physique_checkins', checkin as never)
    setPendingId(id)
    setAnalysis(result); setAiUsed(usedAI); setStep('result')
  }

  if (step === 'analysing') {
    return <Screen title="Physique Lab" sub="Analysing" back={() => setStep('goal')}>
      <Spinner label="Reviewing your check-in" />
      <Notice>Photos are sent once for this analysis and are never stored outside this device.</Notice>
    </Screen>
  }

  if (step === 'result' && analysis) {
    return <Result analysis={analysis} aiUsed={aiUsed} err={err} goal={goal} priorities={priorities} days={days}
      checkinId={pendingId} onDone={() => { setStep('timeline'); setPics({}); setReference(null); setAnalysis(null) }} />
  }

  if (step === 'upload') {
    return (
      <Screen title="New check-in" sub="Step 1 · Photos" back={() => setStep('timeline')}>
        <Notice>Your photos stay on this device. They are sent to the AI only when you run an analysis, and are deleted with the check-in.</Notice>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {ANGLES.map(a => (
            <PhotoSlot key={a.key} label={a.label} required={a.required} value={pics[a.key]}
              onPick={d => setPics(p => ({ ...p, [a.key]: d }))}
              onClear={() => setPics(p => { const n = { ...p }; delete n[a.key]; return n })} />
          ))}
        </div>
        <div className="mt-4">
          <div className="eyebrow mb-2">Reference physique (optional)</div>
          <PhotoSlot label="Reference" value={reference ?? undefined}
            onPick={d => setReference(d)} onClear={() => setReference(null)} wide />
          <p className="mt-2 text-[11px]" style={{ color: 'var(--text-mute)' }}>
            A reference is an aspirational visual direction, not a promised outcome — skeletal structure,
            insertions and proportions differ between people. FORGE translates it into training objectives.
          </p>
        </div>
        <div className="mt-4 grid gap-2">
          <Button disabled={!pics.front} onClick={() => setStep('goal')}>Continue</Button>
          <Button variant="ghost" onClick={() => setStep('timeline')}>Cancel</Button>
        </div>
      </Screen>
    )
  }

  if (step === 'goal') {
    return (
      <Screen title="New check-in" sub="Step 2 · Objective" back={() => setStep('upload')}>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(FOCUS_LABELS) as TrainingFocus[]).map(f => (
            <Card key={f} glass={goal === f} onClick={() => setGoal(f)} className="text-center"
              style={goal === f ? { borderColor: 'var(--accent)' } : undefined}>
              <div className="text-[13px] font-extrabold">{FOCUS_LABELS[f]}</div>
            </Card>
          ))}
        </div>
        <div className="mt-3 grid gap-3">
          <Card>
            <Field label="Specific priorities" hint="Example: bigger shoulders, wider back, larger arms, smaller waist appearance.">
              <textarea rows={3} value={priorities} onChange={e => setPriorities(e.target.value)} />
            </Field>
          </Card>
          <Card>
            <Field label="Training days per week">
              <input type="number" min={3} max={6} value={days} onChange={e => setDays(Number(e.target.value))} />
            </Field>
          </Card>
          {!ai.configured && <Notice tone="warn">AI is not configured — you will still get a calculated roadmap and a generated plan.</Notice>}
          <Button onClick={analyse}>Analyse check-in</Button>
        </div>
      </Screen>
    )
  }

  return (
    <Screen title="Physique Lab" sub="AI physique coach" back={() => nav('/more')}
      right={<button aria-label="New check-in" onClick={() => setStep('upload')}
        className="grid h-10 w-10 place-items-center rounded-full border" style={{ borderColor: 'var(--line)' }}>
        <Icon name="plus" size={18} /></button>}>

      <Card paper>
        <div className="eyebrow">Physique Lab</div>
        <h2 className="title title-lg mt-1">Define your road to elite performance</h2>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--paper-ink-dim)' }}>
          Check in with photos every few weeks. FORGE tracks observable changes over time and turns them into
          training priorities, a plan and a nutrition strategy — all of which you approve before anything changes.
        </p>
        <div className="mt-3"><Button variant="paper" onClick={() => setStep('upload')}>New check-in</Button></div>
      </Card>

      {s.checkins.length === 0
        ? <div className="mt-3"><Empty title="No check-ins yet" body="Your first check-in becomes the baseline everything else is compared against." /></div>
        : <div className="mt-3 grid gap-3">{s.checkins.map(c => <CheckinCard key={c.id} checkin={c} />)}</div>}

      <Card className="mt-3">
        <div className="eyebrow">Privacy</div>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--text-mute)' }}>
          Physique photos are stored only in this browser's private storage on this device. They are never
          uploaded to the database and never shared. Deleting a check-in deletes its photos.
        </p>
        <div className="mt-3 grid gap-2">
          <Button variant="ghost" onClick={async () => {
            const all = await Promise.all(s.checkins.map(async c => ({
              ...c,
              photos: Object.fromEntries(await Promise.all(
                Object.entries(c.photo_keys).map(async ([a, k]) => [a, await photos.get(k as string)]))),
            })))
            const url = URL.createObjectURL(new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' }))
            const el = document.createElement('a')
            el.href = url; el.download = 'forge-physique-export.json'; el.click()
            URL.revokeObjectURL(url)
          }}>Export check-ins (with photos)</Button>
          <Button variant="danger" onClick={async () => {
            for (const c of s.checkins) await s.del('physique_checkins', c.id)
            await photos.clear()
          }}>Delete all physique data</Button>
        </div>
      </Card>
    </Screen>
  )
}

function CheckinCard({ checkin }: { checkin: PhysiqueCheckin }) {
  const s = useStore()
  const [open, setOpen] = useState(false)
  const [urls, setUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!open) return
    void (async () => {
      const out: Record<string, string> = {}
      for (const [a, k] of Object.entries(checkin.photo_keys)) {
        const d = await photos.get(k as string)
        if (d) out[a] = d
      }
      setUrls(out)
    })()
  }, [open, checkin])

  const a = checkin.analysis
  return (
    <Card>
      <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => setOpen(o => !o)}>
        <div>
          <div className="text-[15px] font-extrabold">{checkin.date}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
            {FOCUS_LABELS[checkin.goal]} · {Object.keys(checkin.photo_keys).length} photos
            {checkin.weight_kg ? ` · ${checkin.weight_kg} kg` : ''}
          </div>
        </div>
        <span style={{ color: 'var(--text-mute)' }}>{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="mt-3 grid gap-3">
          {Object.keys(urls).length > 0 && (
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
              {Object.entries(urls).map(([angle, url]) => (
                <figure key={angle} className="shrink-0">
                  <img src={url} alt={`${angle} check-in`} className="h-40 w-28 rounded-xl object-cover" />
                  <figcaption className="eyebrow mt-1 text-center">{angle}</figcaption>
                </figure>
              ))}
            </div>
          )}
          {a && <AnalysisBody analysis={a} />}
          {checkin.priorities && (
            <div><div className="eyebrow">Stated priorities</div><p className="text-[13px]">{checkin.priorities}</p></div>
          )}
          <Button variant="danger" onClick={async () => {
            for (const k of Object.values(checkin.photo_keys)) await photos.del(k as string)
            if (checkin.reference_key) await photos.del(checkin.reference_key)
            await s.del('physique_checkins', checkin.id)
          }}>Delete this check-in</Button>
        </div>
      )}
    </Card>
  )
}

function AnalysisBody({ analysis: a }: { analysis: PhysiqueAnalysis }) {
  return (
    <div className="grid gap-3">
      <div>
        <div className="eyebrow">Body composition — estimate</div>
        <p className="mt-1 text-[13px]">{a.composition_estimate}</p>
      </div>
      {a.changes_since_last?.length ? (
        <List title="Changes since last check-in" items={a.changes_since_last} />
      ) : null}
      {a.strengths.length > 0 && <List title="Already strong" items={a.strengths} />}
      {a.priorities.length > 0 && <List title="Training priorities" items={a.priorities} />}
      {a.observations.length > 0 && <List title="Observations" items={a.observations} />}
      <div className="raised p-3">
        <div className="eyebrow">Estimated timeline</div>
        <div className="mt-1 text-[20px] font-black">{a.timeline.range}</div>
        <div className="mt-2 grid gap-1.5">
          {a.timeline.milestones.map((m, i) => (
            <div key={i} className="text-[12px]">
              <span className="font-bold">{m.window}</span>
              <span style={{ color: 'var(--text-dim)' }}> — {m.expectation}</span>
            </div>
          ))}
        </div>
        <div className="mt-2 text-[11px]" style={{ color: 'var(--text-mute)' }}>
          Assumptions: {a.timeline.assumptions.join(' · ')}
        </div>
        <div className="mt-2 text-[11px]" style={{ color: 'var(--text-mute)' }}>
          This is an estimate, not a guarantee. Genetics, starting condition, consistency, nutrition and recovery
          can change it substantially.
        </div>
      </div>
    </div>
  )
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="eyebrow">{title}</div>
      <ul className="mt-1 grid gap-1">
        {items.map((x, i) => <li key={i} className="text-[13px]">• {x}</li>)}
      </ul>
    </div>
  )
}

function Result({ analysis, aiUsed, err, goal, priorities, days, checkinId, onDone }: {
  analysis: PhysiqueAnalysis; aiUsed: boolean; err: string | null
  goal: TrainingFocus; priorities: string; days: number; checkinId: string | null; onDone: () => void
}) {
  const s = useStore()
  const nav = useNavigate()
  const [applied, setApplied] = useState<string[]>([])

  const proposedFocus = coerceFocus(analysis.training.focus, goal)
  const proposedDays = analysis.training.days_per_week || days
  const [plan, setPlan] = useState<WorkoutPlan | null>(null)
  const [planNote, setPlanNote] = useState<string | null>(null)
  const [planRationale, setPlanRationale] = useState<string | null>(null)

  // The physique analysis feeds straight into plan generation: its priorities become the brief.
  useEffect(() => {
    let live = true
    void requestPlan({
      focus: proposedFocus,
      daysPerWeek: proposedDays,
      preferences: priorities,
      priorities: analysis.training.emphasis,
      name: `${FOCUS_LABELS[proposedFocus]} · ${proposedDays} days`,
    }).then(r => {
      if (!live) return
      setPlan(r.plan); setPlanNote(r.fallbackReason ?? null); setPlanRationale(r.rationale ?? null)
    })
    return () => { live = false }
  }, [proposedFocus, proposedDays, priorities, analysis.training.emphasis])

  const nutrition = useMemo(() => {
    if (!s.goal || !s.profile) return null
    const base = calcTargets({
      sex: s.profile.sex, age: s.profile.age, heightCm: s.profile.height_cm,
      weightKg: s.goal.current_weight_kg, targetWeightKg: s.goal.target_weight_kg,
      activity: s.goal.activity_level, avgSteps: s.goal.avg_daily_steps,
      mode: s.goal.mode, rateKgPerWeek: s.goal.rate_kg_per_week,
    })
    const calories = Math.round(base.maintenance + analysis.nutrition.calorie_delta)
    const protein_g = Math.round(s.goal.current_weight_kg * analysis.nutrition.protein_g_per_kg)
    const fat_g = Math.round((calories * 0.25) / 9)
    const carbs_g = Math.max(30, Math.round((calories - protein_g * 4 - fat_g * 9) / 4))
    return { calories, protein_g, carbs_g, fat_g, maintenance: base.maintenance }
  }, [s.goal, s.profile, analysis])

  return (
    <Screen title="Your roadmap" sub={aiUsed ? 'AI physique analysis' : 'Calculated roadmap'} back={onDone}>
      {err && <div className="mb-3"><Notice tone="warn">{err}</Notice></div>}
      <Notice>{aiUsed
        ? 'AI estimate from photos — review before acting on it. Not a measurement and not medical advice.'
        : 'Calculated from your goal, weight and training frequency.'}</Notice>

      <Card className="mt-3"><AnalysisBody analysis={analysis} /></Card>

      <Card className="mt-3">
        <div className="eyebrow">Recommended training</div>
        {!plan ? <Spinner label="Building your plan" /> : (
          <>
            <div className="mt-1 text-[16px] font-extrabold">{plan.name}</div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--text-mute)' }}>
              {planRationale ?? analysis.training.rationale}
            </p>
            {planNote && <div className="mt-2"><Notice tone="warn">{planNote}</Notice></div>}
            <div className="mt-2 grid gap-1.5">
              {plan.days.map(d => (
                <details key={d.id} className="raised p-2.5">
                  <summary className="cursor-pointer text-[13px] font-bold">{d.name}</summary>
                  <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
                    {d.exercises.length} exercises · {d.exercises.reduce((a, e) => a + e.sets, 0)} sets
                  </div>
                  <ul className="mt-1 grid gap-0.5">
                    {d.exercises.map(e => (
                      <li key={e.id} className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
                        {e.name} — {e.sets} × {e.reps}{e.rest_sec ? ` · ${e.rest_sec}s rest` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
            <div className="mt-3">
              <Button disabled={applied.includes('plan')} onClick={async () => {
                for (const p of s.plans.filter(p => p.active)) await s.save('workout_plans', { ...p, active: false } as never)
                await s.save('workout_plans', { ...plan, active: true } as never)
                setApplied(a => [...a, 'plan'])
              }}>{applied.includes('plan') ? 'Plan activated' : 'Review & activate this plan'}</Button>
            </div>
          </>
        )}
        <p className="mt-2 text-[11px]" style={{ color: 'var(--text-mute)' }}>
          Your existing workout history is kept — activating a plan never deletes past sessions.
        </p>
      </Card>

      <Card className="mt-3">
        <div className="eyebrow">Nutrition strategy</div>
        <p className="mt-1 text-[13px]">{analysis.nutrition.strategy}</p>
        {nutrition ? (
          <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="Calories" value={nutrition.calories.toLocaleString()} sub={`maintenance ${nutrition.maintenance.toLocaleString()}`} />
              <Stat label="Protein" value={`${nutrition.protein_g} g`} />
              <Stat label="Carbs" value={`${nutrition.carbs_g} g`} />
              <Stat label="Fat" value={`${nutrition.fat_g} g`} />
            </div>
            <div className="mt-3 grid gap-2">
              <Button variant="quiet" disabled={applied.includes('target') || !isValidTarget(nutrition)}
                onClick={async () => {
                  await s.save('nutrition_targets', {
                    id: s.target?.id ?? uid(), ...nutrition, source: aiUsed ? 'ai' : 'calculated',
                    note: analysis.nutrition.strategy, updated_at: new Date().toISOString(),
                  } as never)
                  setApplied(a => [...a, 'target'])
                }}>{applied.includes('target') ? 'Target applied' : 'Apply nutrition target'}</Button>
              <Button variant="ghost" onClick={() => nav('/more/target')}>Adjust it first</Button>
            </div>
          </>
        ) : (
          <div className="mt-2"><Button variant="quiet" onClick={() => nav('/more/goals')}>Set your goal to get targets</Button></div>
        )}
      </Card>

      <div className="mt-3 grid gap-2">
        <Button variant="ghost" onClick={onDone}>
          {checkinId ? 'Done — check-in saved' : 'Done'}
        </Button>
      </div>
    </Screen>
  )
}

function PhotoSlot({ label, value, onPick, onClear, required, wide }: {
  label: string; value?: string; onPick: (dataUrl: string) => void; onClear: () => void
  required?: boolean; wide?: boolean
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div>
      <button onClick={() => ref.current?.click()}
        className="card grid w-full place-items-center overflow-hidden p-0"
        style={{ aspectRatio: wide ? '16 / 10' : '3 / 4' }}>
        {value
          ? <img src={value} alt={`${label} photo`} className="h-full w-full object-cover" />
          : (
            <span className="grid place-items-center gap-1 p-4 text-center">
              <Icon name="camera" size={20} />
              <span className="text-[12px] font-bold">{label}{required ? ' *' : ''}</span>
              <span className="text-[10px]" style={{ color: 'var(--text-mute)' }}>Tap to add</span>
            </span>
          )}
      </button>
      {value && <button onClick={onClear} className="mt-1 w-full text-[11px]" style={{ color: '#D98A8A' }}>Remove</button>}
      {err && <div className="mt-1 text-[11px]" style={{ color: '#D98A8A' }}>{err}</div>}
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={async e => {
          const f = e.target.files?.[0]
          if (!f) return
          try { setErr(null); onPick(await downscale(f)) }
          catch { setErr('Could not read that image.') }
        }} />
    </div>
  )
}
