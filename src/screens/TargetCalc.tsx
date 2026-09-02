import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { uid } from '../lib/db'
import { calcTargets, isValidTarget } from '../lib/calc'
import { ai, AIUnavailable } from '../lib/ai'
import { Button, Card, Field, Notice, Screen, Spinner } from '../ui'
import type { NutritionTarget } from '../lib/types'

export default function TargetCalc() {
  const s = useStore()
  const nav = useNavigate()
  const g = s.goal
  const p = s.profile

  const base = useMemo(() => {
    if (!g || !p) return null
    return calcTargets({
      sex: p.sex, age: p.age, heightCm: p.height_cm,
      weightKg: g.current_weight_kg, targetWeightKg: g.target_weight_kg,
      activity: g.activity_level, avgSteps: g.avg_daily_steps,
      mode: g.mode, rateKgPerWeek: g.rate_kg_per_week,
    })
  }, [g, p])

  const [draft, setDraft] = useState<Omit<NutritionTarget, 'id' | 'updated_at'> | null>(null)
  const [aiText, setAiText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const current = draft ?? (base ? {
    calories: base.calories, protein_g: base.protein_g, carbs_g: base.carbs_g, fat_g: base.fat_g,
    source: 'calculated' as const,
  } : null)

  if (!g || !p) return (
    <Screen title="Nutrition target" back={() => nav('/more')}>
      <Notice tone="warn">Set your goal and body details first.</Notice>
      <div className="mt-3"><Button onClick={() => nav('/more/goals')}>Open goals</Button></div>
    </Screen>
  )

  const set = (patch: Partial<NonNullable<typeof current>>) => {
    setDraft(d => ({ ...(d ?? current!), ...patch, source: 'manual' }))
    setSaved(false)
  }
  const macroKcal = current ? current.protein_g * 4 + current.carbs_g * 4 + current.fat_g * 9 : 0

  return (
    <Screen title="Nutrition target" sub="Calculator" back={() => nav('/more')}>
      <Card paper>
        <div className="eyebrow">Deterministic baseline</div>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {[
            ['Maintenance', `${base!.maintenance.toLocaleString()} kcal`],
            ['Rate', `${base!.rate_kg_per_week.toFixed(2)} kg/wk`],
            ['Goal', g.mode.toUpperCase()],
            ['Timeframe', base!.weeks_to_target ? `${base!.weeks_to_target} weeks` : '—'],
          ].map(([l, v]) => (
            <div key={l} className="paper-inset p-3">
              <div className="eyebrow">{l}</div>
              <div className="figure mt-1 text-[18px] leading-none">{v}</div>
            </div>
          ))}
        </div>
        {base!.warnings.length > 0 && (
          <div className="mt-3 grid gap-2">
            {base!.warnings.map((w, i) => <Notice key={i} tone="warn">{w}</Notice>)}
          </div>
        )}
      </Card>

      <Card className="mt-3">
        <div className="eyebrow mb-2">Your target — edit anything</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Calories"><input type="number" value={current!.calories} onChange={e => set({ calories: Number(e.target.value) })} /></Field>
          <Field label="Protein (g)"><input type="number" value={current!.protein_g} onChange={e => set({ protein_g: Number(e.target.value) })} /></Field>
          <Field label="Carbs (g)"><input type="number" value={current!.carbs_g} onChange={e => set({ carbs_g: Number(e.target.value) })} /></Field>
          <Field label="Fat (g)"><input type="number" value={current!.fat_g} onChange={e => set({ fat_g: Number(e.target.value) })} /></Field>
        </div>
        <div className="mt-2 text-[11px]" style={{ color: 'var(--text-mute)' }}>
          Macros add up to {Math.round(macroKcal).toLocaleString()} kcal
          {Math.abs(macroKcal - current!.calories) > current!.calories * 0.05 ? ' — that differs from the calorie target.' : '.'}
        </div>
        {!isValidTarget(current!) && <div className="mt-2"><Notice tone="error">These values are outside a sane range and cannot be saved.</Notice></div>}
        {draft && <div className="mt-2"><Button variant="ghost" onClick={() => { setDraft(null); setSaved(false) }}>Reset to calculated</Button></div>}
      </Card>

      <Card className="mt-3">
        <div className="eyebrow">AI personalisation</div>
        <p className="mt-1 text-[12px]" style={{ color: 'var(--text-mute)' }}>
          The numbers above come from the app's own calculation. AI only explains them and may suggest small adjustments —
          this is a planning estimate, not medical advice.
        </p>
        {!ai.configured && <div className="mt-2"><Notice tone="warn">AI is not configured. The calculated target above still works.</Notice></div>}
        {err && <div className="mt-2"><Notice tone="error">{err}</Notice></div>}
        {busy ? <Spinner label="Asking AI" /> : (
          <div className="mt-3">
            <Button variant="quiet" disabled={!ai.configured} onClick={async () => {
              setBusy(true); setErr(null)
              try {
                const r = await ai.targetAdvice({ profile: p, goal: g, calculated: base })
                setAiText(r.summary)
                if (r.adjustments) {
                  const merged = { ...current!, ...r.adjustments, source: 'ai' as const }
                  if (isValidTarget(merged)) setDraft(merged)
                }
              } catch (e) {
                setErr(e instanceof AIUnavailable ? e.message : 'AI is unavailable right now.')
              } finally { setBusy(false) }
            }}>Explain & personalise</Button>
          </div>
        )}
        {aiText && (
          <div className="mt-3 rounded-2xl border p-3" style={{ borderColor: 'var(--glass-border)', background: 'var(--glass)' }}>
            <div className="eyebrow">AI-generated estimate</div>
            <p className="mt-1 text-[13px]">{aiText}</p>
            <p className="mt-2 text-[11px]" style={{ color: 'var(--text-mute)' }}>Review and adjust before accepting.</p>
          </div>
        )}
      </Card>

      {saved && <div className="mt-3"><Notice>Target saved. Today's screen now uses it.</Notice></div>}

      <div className="mt-3 grid gap-2">
        <Button disabled={!isValidTarget(current!)} onClick={async () => {
          await s.save('nutrition_targets', {
            id: s.target?.id ?? uid(), ...current!, note: aiText ?? undefined,
            updated_at: new Date().toISOString(),
          } as never)
          setSaved(true)
        }}>Accept target</Button>
        <Button variant="ghost" onClick={() => nav('/')}>Back to today</Button>
      </div>
    </Screen>
  )
}
