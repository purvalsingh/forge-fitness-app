import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useToday } from '../store'
import { sumTotals, totalsByMeal, round1 } from '../lib/calc'
import { Bar, Button, Card, Icon, Screen, Stat } from '../ui'
import { AddFoodSheet } from './AddFood'

export default function Diet() {
  const s = useStore()
  const date = useToday()
  const nav = useNavigate()
  const [add, setAdd] = useState<string | null>(null)

  const logs = s.foodLogs.filter(l => l.date === date)
  const totals = sumTotals(logs)
  const byMeal = totalsByMeal(logs)
  const t = s.target
  const remaining = t ? Math.max(0, t.calories - totals.calories) : 0

  return (
    <Screen title="Diet" sub={date}>
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
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold">{l.name}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
                          {round1(l.qty)} {l.unit} · P{round1(l.protein_g)} C{round1(l.carbs_g)} F{round1(l.fat_g)}
                          {l.source.startsWith('ai') ? ' · AI' : ''}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[13px] font-bold">{Math.round(l.calories)}</span>
                        <button aria-label={`Delete ${l.name}`} onClick={() => s.del('food_logs', l.id)}
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

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Entries" value={logs.length} />
        <Stat label="Protein" value={`${Math.round(totals.protein_g)}g`} />
        <Stat label="Meals logged" value={`${Object.keys(byMeal).length}/${s.mealTypes.length}`} />
      </div>

      {add && <AddFoodSheet open onClose={() => setAdd(null)} date={date} mealTypeId={add} />}
    </Screen>
  )
}
