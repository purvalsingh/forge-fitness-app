import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useActiveDate } from '../store'
import { sumTotals, totalsByMeal, round1 } from '../lib/calc'
import { Bar, Button, Card, Field, Icon, Screen, Sheet, Stat } from '../ui'
import type { FoodLog } from '../lib/types'
import { AddFoodSheet } from './AddFood'

export default function Diet() {
  const s = useStore()
  const { date } = useActiveDate()
  const nav = useNavigate()
  const [add, setAdd] = useState<string | null>(null)
  const [editing, setEditing] = useState<FoodLog | null>(null)
  const [undo, setUndo] = useState<FoodLog | null>(null)
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 6000); return () => clearTimeout(t) }, [undo])
  const remove = (l: FoodLog) => { void s.del('food_logs', l.id); setUndo(l); setEditing(null) }

  const logs = s.foodLogs.filter(l => l.date === date)
  const totals = sumTotals(logs)
  const byMeal = totalsByMeal(logs)
  const t = s.target
  const remaining = t ? Math.max(0, t.calories - totals.calories) : 0

  return (
    <Screen title="Diet" sub={new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}>
      <Card paper>
        <div className="eyebrow">Calories</div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="figure text-[38px] leading-none">{Math.round(totals.calories).toLocaleString()}</span>
          <span className="text-[14px]" style={{ color: 'var(--paper-ink-dim)' }}>/ {t ? t.calories.toLocaleString() : '—'}</span>
        </div>
        <div className="mt-1 text-[11px]" style={{ color: 'var(--paper-ink-dim)' }}>
          {t ? `Remaining: ${Math.round(remaining).toLocaleString()} kcal` : 'Set a target to track remaining calories'}
        </div>
        <div className="mt-3"><Bar value={t ? totals.calories / t.calories : 0} height={8} onPaper /></div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['protein_g', 'carbs_g', 'fat_g'] as const).map(k => {
            const label = k === 'protein_g' ? 'Protein' : k === 'carbs_g' ? 'Carbs' : 'Fat'
            const target = t ? t[k] : 0
            return (
              <div key={k}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="eyebrow">{label}</span>
                  <span className="figure text-[11px]" style={{ color: 'var(--paper-ink-dim)' }}>
                    {Math.round(totals[k])}{target ? `/${target}` : ''}g
                  </span>
                </div>
                <Bar value={target ? totals[k] / target : 0} onPaper />
              </div>
            )
          })}
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card onClick={() => nav('/diet/camera')} className="flex items-center gap-3">
          <Icon name="camera" /><span className="text-[13px] font-bold">Scan food</span>
        </Card>
        <Card onClick={() => nav('/more/recipes')} className="flex items-center gap-3">
          <Icon name="sparkle" /><span className="text-[13px] font-bold">Quick meals</span>
        </Card>
      </div>

      <div className="mt-3 grid gap-3">
        {s.mealTypes.map(m => {
          const mLogs = logs.filter(l => l.meal_type_id === m.id)
          const mt = byMeal[m.id]
          return (
            <Card key={m.id}>
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="title text-[18px]">{m.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>{m.time}</div>
                </div>
                <div className="text-right">
                  <div className="figure text-[17px]">{Math.round(mt?.calories ?? 0)}</div>
                  <div className="eyebrow">kcal</div>
                </div>
              </div>
              {mLogs.length > 0 && (
                <ul className="mt-3 grid gap-1.5">
                  {mLogs.map(l => (
                    <li key={l.id} className="flex items-center justify-between gap-2 border-b pb-1.5 last:border-0"
                      style={{ borderColor: 'var(--line)' }}>
                      <button className="min-w-0 flex-1 text-left" aria-label={`Edit ${l.name}`} onClick={() => setEditing(l)}>
                        <div className="truncate text-[13px] font-semibold">{l.name}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
                          {round1(l.qty)} {l.unit} · P{round1(l.protein_g)} C{round1(l.carbs_g)} F{round1(l.fat_g)}
                          {l.source.startsWith('ai') ? ' · AI' : ''}
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[13px] font-bold">{Math.round(l.calories)}</span>
                        <button aria-label={`Delete ${l.name}`} onClick={() => remove(l)}
                          style={{ color: 'var(--text-mute)' }}><Icon name="trash" size={16} /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {mLogs.length > 0 && (
                <div className="mt-2 text-[11px]" style={{ color: 'var(--text-dim)' }}>
                  P {round1(mt.protein_g)}g · C {round1(mt.carbs_g)}g · F {round1(mt.fat_g)}g
                </div>
              )}
              <div className="mt-3"><Button variant="quiet" onClick={() => setAdd(m.id)}>+ Add food</Button></div>
            </Card>
          )
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Entries" value={logs.length} />
        <Stat label="Meals logged" value={`${Object.keys(byMeal).length}/${s.mealTypes.length}`} />
      </div>

      {add && <AddFoodSheet open onClose={() => setAdd(null)} date={date} mealTypeId={add} />}
      <EditFood log={editing} onClose={() => setEditing(null)} onSave={l => { void s.save('food_logs', l); setEditing(null) }} onDelete={remove} />
      {undo && (
        <div role="status" className="fixed inset-x-4 z-50 mx-auto flex max-w-[420px] items-center justify-between gap-3 rounded-2xl px-4 py-3 text-[13px]"
          style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))', background: 'var(--surface-high)' }}>
          <span className="truncate">Deleted {undo.name}</span>
          <button className="font-bold" style={{ color: 'var(--accent)' }} onClick={() => { void s.save('food_logs', undo); setUndo(null) }}>Undo</button>
        </div>
      )}
    </Screen>
  )
}

/** Change the amount of a logged food; nutrition scales with it. */
function EditFood({ log, onClose, onSave, onDelete }: { log: FoodLog | null; onClose: () => void; onSave: (l: FoodLog) => void; onDelete: (l: FoodLog) => void }) {
  const [qty, setQty] = useState('')
  useEffect(() => { if (log) setQty(String(round1(log.qty))) }, [log])
  if (!log) return null
  const n = Number(qty)
  const ok = Number.isFinite(n) && n > 0 && n <= 2500
  const k = ok && log.qty > 0 ? n / log.qty : 1
  const kcal = Math.round(log.calories * k)
  return (
    <Sheet open onClose={onClose} title={log.name}>
      <Field label={`Amount (${log.unit})`} hint={ok ? `${kcal} kcal · P${round1(log.protein_g * k)} C${round1(log.carbs_g * k)} F${round1(log.fat_g * k)}` : 'Enter an amount above 0.'}>
        <input type="number" inputMode="decimal" min="0" step="any" value={qty} onChange={e => setQty(e.target.value)} />
      </Field>
      <div className="mt-4 grid gap-2">
        <Button disabled={!ok} onClick={() => onSave({ ...log, qty: n, calories: kcal, protein_g: round1(log.protein_g * k), carbs_g: round1(log.carbs_g * k), fat_g: round1(log.fat_g * k), serving_label: k === 1 ? log.serving_label : undefined })}>Save</Button>
        <Button variant="danger" onClick={() => onDelete(log)}>Delete</Button>
      </div>
    </Sheet>
  )
}
