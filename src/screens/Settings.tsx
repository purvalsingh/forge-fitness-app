import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { exportAll, toCSV, uid } from '../lib/db'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { ai, AIUnavailable } from '../lib/ai'
import { adherenceFor } from '../lib/derive'
import { daysBack, sumTotals } from '../lib/calc'
import { Button, Card, Field, Notice, Screen, Spinner } from '../ui'

export default function SettingsScreen() {
  const s = useStore()
  const nav = useNavigate()
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function download(name: string, content: string, type = 'application/json') {
    const url = URL.createObjectURL(new Blob([content], { type }))
    const a = document.createElement('a')
    a.href = url; a.download = name; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Screen title="Settings" sub="System" back={() => nav('/more')}>
      <div className="grid gap-3">
        <Card>
          <div className="eyebrow mb-2">Profile</div>
          <Field label="Display name">
            <input value={s.profile?.display_name ?? ''}
              onChange={e => s.profile && s.save('profiles', { ...s.profile, display_name: e.target.value } as never)} />
          </Field>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Theme</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={s.theme === 'dark' ? 'primary' : 'ghost'} onClick={() => s.setTheme('dark')}>Dark</Button>
            <Button variant={s.theme === 'light' ? 'primary' : 'ghost'} onClick={() => s.setTheme('light')}>Light</Button>
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Steps & adherence</div>
          <Field label="Daily step goal">
            <input type="number" min={0} max={100000} value={s.settings.step_goal}
              onChange={e => s.save('settings', { ...s.settings, step_goal: Number(e.target.value) } as never)} />
          </Field>
          <div className="mt-2">
            <Field label="Rest days" hint="Rest days never count as a failed workout.">
              <div className="flex flex-wrap gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => {
                  const on = s.settings.rest_days.includes(i)
                  return (
                    <button key={d} onClick={() => s.save('settings', {
                      ...s.settings,
                      rest_days: on ? s.settings.rest_days.filter(x => x !== i) : [...s.settings.rest_days, i],
                    } as never)}
                      className="min-h-[38px] rounded-xl border px-3 text-[12px] font-bold"
                      style={on
                        ? { background: 'var(--accent-strong)', color: '#F6E6EA', borderColor: 'transparent' }
                        : { borderColor: 'var(--line)' }}>{d}</button>
                  )
                })}
              </div>
            </Field>
          </div>
          <div className="mt-2">
            <Field label="Diet tolerance (%)" hint="How close to your calorie and protein targets still counts as complete.">
              <input type="number" min={1} max={50} value={Math.round(s.settings.diet_tolerance * 100)}
                onChange={e => s.save('settings', { ...s.settings, diet_tolerance: Number(e.target.value) / 100 } as never)} />
            </Field>
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Meal configuration</div>
          <div className="grid gap-2">
            {s.mealTypes.map(m => (
              <div key={m.id} className="raised grid grid-cols-[1fr_110px] gap-2 p-2">
                <input aria-label="Meal name" value={m.name} onChange={e => s.save('meal_types', { ...m, name: e.target.value } as never)} />
                <input aria-label="Meal time" type="time" value={m.time} onChange={e => s.save('meal_types', { ...m, time: e.target.value } as never)} />
              </div>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="ghost" onClick={() => s.save('meal_types', {
              id: uid(), name: 'New meal', time: '16:00', position: s.mealTypes.length,
            } as never)}>+ Add meal</Button>
            {s.mealTypes.length > 1 && (
              <Button variant="danger" onClick={() => s.del('meal_types', s.mealTypes[s.mealTypes.length - 1].id)}>
                Remove last
              </Button>
            )}
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">AI assistant</div>
          {!ai.configured
            ? <Notice tone="warn">No AI endpoint configured. Add Gemini keys to the Edge Function and set VITE_SUPABASE_URL to enable AI features. Everything else keeps working.</Notice>
            : busy ? <Spinner label="Generating insights" /> : (
              <Button variant="quiet" onClick={async () => {
                setBusy(true); setErr(null)
                try {
                  const src = { foodLogs: s.foodLogs, sessions: s.sessions, steps: s.steps, target: s.target, settings: s.settings }
                  const summary = daysBack(28).map(d => ({
                    date: d,
                    calories: Math.round(sumTotals(s.foodLogs.filter(l => l.date === d)).calories),
                    protein: Math.round(sumTotals(s.foodLogs.filter(l => l.date === d)).protein_g),
                    steps: s.steps.find(x => x.date === d)?.steps ?? null,
                    weight: s.weights.find(x => x.date === d)?.weight_kg ?? null,
                    score: adherenceFor(src, d).score,
                  }))
                  const out = await ai.insights({ target: s.target, goal: s.goal, days: summary })
                  for (const i of out) {
                    await s.save('ai_insights', { id: uid(), created_at: new Date().toISOString(), ...i } as never)
                  }
                  setMsg('Insights updated.')
                } catch (e) {
                  setErr(e instanceof AIUnavailable ? e.message : 'Could not generate insights right now.')
                } finally { setBusy(false) }
              }}>Generate insights</Button>
            )}
          {err && <div className="mt-2"><Notice tone="error">{err}</Notice></div>}
          {s.insights.length > 0 && (
            <div className="mt-3 grid gap-2">
              {s.insights.slice(0, 6).map(i => (
                <div key={i.id} className="raised p-3">
                  <div className="eyebrow">AI insight{i.kind === 'adjustment' ? ' · review target adjustment' : ''}</div>
                  <p className="mt-1 text-[13px]">{i.text}</p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {i.kind === 'adjustment' && (
                      <Button variant="quiet" onClick={() => nav('/more/target')}>Review target</Button>
                    )}
                    <Button variant="ghost" onClick={() => s.del('ai_insights', i.id)}>Dismiss</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div className="eyebrow mb-2">Data & backup</div>
          <div className="grid gap-2">
            <Button variant="quiet" onClick={async () => {
              download(`forge-export-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await exportAll(), null, 2))
              setMsg('Full JSON export downloaded.')
            }}>Export everything (JSON)</Button>
            <Button variant="ghost" onClick={() => {
              download('forge-food-logs.csv', toCSV(s.foodLogs as never), 'text/csv')
            }}>Export food logs (CSV)</Button>
            <Button variant="ghost" onClick={() => {
              download('forge-weight-history.csv', toCSV(s.weights as never), 'text/csv')
            }}>Export weight history (CSV)</Button>
            <Button variant="ghost" onClick={() => {
              download('forge-workout-history.csv', toCSV(s.sessions as never), 'text/csv')
            }}>Export workout history (CSV)</Button>
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Account</div>
          {supabaseConfigured ? (
            <Button variant="danger" onClick={async () => {
              localStorage.removeItem('forge:demo')
              await supabase?.auth.signOut()
              location.reload()
            }}>Sign out</Button>
          ) : (
            <Notice>Running on this device only. Add Supabase credentials to sync across devices.</Notice>
          )}
        </Card>

        {msg && <Notice>{msg}</Notice>}
      </div>
    </Screen>
  )
}
