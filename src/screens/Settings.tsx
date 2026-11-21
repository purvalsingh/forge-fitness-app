import { forgetDevice } from '../lib/db'
import { LANGS, currentLang, setLang } from '../lib/i18n'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, ACCENTS, applyAccent, type Accent } from '../store'
import { exportAll, toCSV, uid } from '../lib/db'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { ai, AIUnavailable, API_BASE } from '../lib/ai'
import { isNative } from '../lib/native'
import { adherenceFor } from '../lib/derive'
import { daysBack, sumTotals } from '../lib/calc'
import { Button, Card, DraftInput, Field, Notice, Screen, Spinner } from '../ui'

/** Shows which backend host answered last, so a silent failover is visible rather than mysterious. */
function ConnectionStatus() {
  const [state, setState] = useState<{ label: string; detail: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function probe() {
    setBusy(true)
    const results: string[] = []
    for (const [name, url] of [
      ['Data', `${import.meta.env.VITE_SUPABASE_URL ?? ''}/auth/v1/settings`],
      ['AI', `${API_BASE}/api/keys`],
    ] as const) {
      if (!url) { results.push(`${name}: not configured`); continue }
      try {
        const res = await fetch(url, {
          headers: name === 'AI' ? {} : { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '' },
        })
        // Any HTTP answer means the host is alive; only a thrown error means unreachable.
        results.push(`${name}: reachable (${res.status})`)
      } catch {
        results.push(`${name}: unreachable`)
      }
    }
    setState({ label: results.join(' · '), detail: new Date().toLocaleTimeString() })
    setBusy(false)
  }

  return (
    <div className="grid gap-2">
      <div className="text-[12px]" style={{ color: 'var(--text-dim)' }}>
        {state ? state.label : 'FORGE tries this site first and moves to a backup host if one stops answering.'}
      </div>
      {state && <div className="eyebrow">Checked {state.detail}</div>}
      <Button variant="quiet" disabled={busy} onClick={probe}>{busy ? 'Checking…' : 'Check backends'}</Button>
    </div>
  )
}

export default function SettingsScreen() {
  const s = useStore()
  const nav = useNavigate()
  const [lang, setLangState] = useState(currentLang)
  const [accent, setAccent] = useState<Accent>(() => (localStorage.getItem('forge:accent') as Accent) || 'ember')
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
            <DraftInput value={s.profile?.display_name ?? ''} ariaLabel="Display name"
              onCommit={v => s.profile && s.save('profiles', { ...s.profile, display_name: v } as never)} />
          </Field>
          <div className="mt-2">
            <Field label="Gender" hint="Sets your calorie math and muscle map body.">
              <div className="grid grid-cols-2 gap-2">
                {(['male', 'female'] as const).map(g => (
                  <button key={g} className="chip press !min-h-[44px] justify-center" aria-pressed={s.profile?.sex === g}
                    onClick={() => s.profile && s.save('profiles', { ...s.profile, sex: g } as never)}>{g === 'male' ? 'Male' : 'Female'}</button>
                ))}
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Language</div>
          <div className="grid grid-cols-3 gap-2" data-no-i18n>
            {LANGS.map(([code, name]) => (
              <Button key={code} variant={lang === code ? 'primary' : 'ghost'} onClick={() => { setLangState(code); void setLang(code) }}>{name}</Button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Theme</div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={s.theme === 'dark' ? 'primary' : 'ghost'} onClick={() => s.setTheme('dark')}>Dark</Button>
            <Button variant={s.theme === 'light' ? 'primary' : 'ghost'} onClick={() => s.setTheme('light')}>Light</Button>
          </div>
          <div className="eyebrow mb-2 mt-3">Accent colour</div>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(ACCENTS) as Accent[]).map(a => (
              <button key={a} aria-label={`${a} accent`} aria-pressed={accent === a} className="press grid h-11 w-11 place-items-center rounded-full"
                style={{ background: ACCENTS[a][0], outline: accent === a ? '2px solid var(--text)' : 'none', outlineOffset: 3 }}
                onClick={() => { applyAccent(a); setAccent(a) }} />
            ))}
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Steps & adherence</div>
          <Field label="Daily step goal">
            <DraftInput type="number" min={0} max={100000} value={s.settings.step_goal} ariaLabel="Daily step goal"
              onCommit={v => s.save('settings', { ...s.settings, step_goal: Number(v) || 0 } as never)} />
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
                        ? { background: 'var(--accent-strong)', color: 'var(--accent-ink)', borderColor: 'transparent' }
                        : { borderColor: 'var(--line)' }}>{d}</button>
                  )
                })}
              </div>
            </Field>
          </div>
          <div className="mt-2">
            <Field label="Diet tolerance (%)" hint="How close to your calorie and protein targets still counts as complete.">
              <DraftInput type="number" min={1} max={50} value={Math.round(s.settings.diet_tolerance * 100)}
                ariaLabel="Diet tolerance percent"
                onCommit={v => s.save('settings', { ...s.settings, diet_tolerance: Math.min(50, Math.max(1, Number(v) || 10)) / 100 } as never)} />
            </Field>
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Day & training</div>
          <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
            <Row label="My day ends at" hint="Food and workouts logged before this time count for the day before.">
              <select value={s.settings.day_start_hour ?? 4} onChange={e => s.save('settings', { ...s.settings, day_start_hour: Number(e.target.value) } as never)}>
                {[0, 1, 2, 3, 4, 5, 6].map(h => <option key={h} value={h}>{h === 0 ? '12 AM' : `${h} AM`}</option>)}
              </select>
            </Row>
            <Row label="Units">
              <select value={s.settings.units ?? 'kg'} onChange={e => s.save('settings', { ...s.settings, units: e.target.value } as never)}>
                <option value="kg">kg</option><option value="lb">lb</option>
              </select>
            </Row>
            <Row label="Week starts on">
              <select value={s.settings.week_start ?? 1} onChange={e => s.save('settings', { ...s.settings, week_start: Number(e.target.value) } as never)}>
                <option value={1}>Monday</option><option value={0}>Sunday</option>
              </select>
            </Row>
            <Row label="Rest timer" hint="Seconds between sets">
              <DraftInput type="number" min={0} max={900} value={s.settings.default_rest_sec ?? 120} ariaLabel="Default rest seconds"
                onCommit={v => s.save('settings', { ...s.settings, default_rest_sec: Math.min(900, Math.max(0, Number(v) || 0)) } as never)} />
            </Row>
            <Row label="Barbell weight" hint="kg, for plate maths">
              <DraftInput type="number" min={0} max={50} value={s.settings.bar_weight_kg ?? 20} ariaLabel="Bar weight"
                onCommit={v => s.save('settings', { ...s.settings, bar_weight_kg: Math.min(50, Math.max(0, Number(v) || 20)) } as never)} />
            </Row>
            <Row label="Effort scale" hint="How you rate how hard a set felt">
              <select value={s.settings.effort_scale ?? 'off'} onChange={e => s.save('settings', { ...s.settings, effort_scale: e.target.value } as never)}>
                <option value="off">Off</option><option value="rir">RIR</option><option value="rpe">RPE</option>
              </select>
            </Row>
            <Row label="Water goal" hint="ml per day">
              <DraftInput type="number" min={0} max={10000} value={s.settings.water_goal_ml ?? 2500} ariaLabel="Water goal"
                onCommit={v => s.save('settings', { ...s.settings, water_goal_ml: Math.min(10000, Math.max(0, Number(v) || 0)) } as never)} />
            </Row>
            <Row label="Fasting window" hint="Hours. Set 0 to turn fasting off.">
              <DraftInput type="number" min={0} max={72} value={s.settings.fasting_hours ?? 16} ariaLabel="Fasting hours"
                onCommit={v => s.save('settings', { ...s.settings, fasting_hours: Math.min(72, Math.max(0, Number(v) || 0)) } as never)} />
            </Row>
            <Row label="Keep screen on" hint="During workouts">
              <input type="checkbox" className="h-5 w-5" checked={s.settings.keep_awake !== false} onChange={e => s.save('settings', { ...s.settings, keep_awake: e.target.checked } as never)} />
            </Row>
            <Row label="Flash when rest ends" hint="Useful in loud gyms">
              <input type="checkbox" className="h-5 w-5" checked={Boolean(s.settings.timer_flash)} onChange={e => s.save('settings', { ...s.settings, timer_flash: e.target.checked } as never)} />
            </Row>
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Meal configuration</div>
          <div className="grid gap-2">
            {s.mealTypes.map(m => (
              <div key={m.id} className="raised grid grid-cols-[1fr_110px] gap-2 p-2">
                <DraftInput ariaLabel="Meal name" value={m.name}
                  onCommit={v => s.save('meal_types', { ...m, name: v } as never)} />
                <DraftInput ariaLabel="Meal time" type="time" value={m.time}
                  onCommit={v => s.save('meal_types', { ...m, time: v } as never)} />
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
          <Button variant="ghost" onClick={() => nav('/more/keys')}>Manage my Gemini keys</Button>
          <div className="h-2" />
          {!supabaseConfigured
            ? <Notice tone="warn">AI needs an account — sign in to use your own Gemini keys.</Notice>
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
          <div className="eyebrow mb-2">Install</div>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--text-mute)' }}>
            Install FORGE as a real Android app, or add it to your home screen from the browser menu.
            Both run the same build; the app version has no browser chrome.
          </p>
          <div className="mt-3 grid gap-2">
            {!isNative && <a href="https://forgefit-india.vercel.app/#download"
              className="grid min-h-[48px] place-items-center rounded-xl border px-4 text-[12px] font-bold uppercase tracking-[0.16em]"
              style={{ background: 'var(--accent-strong)', color: 'var(--accent-ink)', borderColor: 'transparent' }}>
              Download the Android / iPhone app
            </a>}
            <a href="https://forgefit-india.vercel.app/#install"
              className="grid min-h-[48px] place-items-center rounded-xl border px-4 text-[12px] font-bold uppercase tracking-[0.16em]"
              style={{ borderColor: 'var(--line)' }}>
              Install instructions
            </a>
          </div>
        </Card>

        <Card>
          <div className="eyebrow mb-2">Connection</div>
          <ConnectionStatus />
        </Card>

        <Card>
          <div className="eyebrow mb-2">Account</div>
          {supabaseConfigured ? (
            <Button variant="danger" onClick={async () => {
              localStorage.removeItem('forge:demo')
              forgetDevice()
              await supabase?.auth.signOut()
              location.reload()
            }}>Sign out</Button>
          ) : null}
          {supabaseConfigured && !localStorage.getItem('forge:demo') && <DeleteAccount />}
          {supabaseConfigured ? null : (
            <Notice>Running on this device only. Add Supabase credentials to sync across devices.</Notice>
          )}
        </Card>

        {msg && <Notice>{msg}</Notice>}
      </div>
    </Screen>
  )
}

/** Label and hint on the left, one compact control on the right: no cramped two-column fields. */
function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 py-3" style={{ borderColor: 'var(--line)' }}>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-semibold">{label}</div>
        {hint && <div className="mt-0.5 text-[12px] leading-snug" style={{ color: 'var(--text-mute)' }}>{hint}</div>}
      </div>
      <div className="w-[120px] shrink-0 [&>input[type=checkbox]]:ml-auto [&>input[type=checkbox]]:block">{children}</div>
    </div>
  )
}

/** Permanently deletes the account and every row it owns (the database cascades). Two taps, so it can't happen by accident. */
function DeleteAccount() {
  const [armed, setArmed] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  return (
    <div className="mt-4 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
      <div className="text-[15px] font-semibold">Delete my account</div>
      <p className="mt-1 text-[12px] leading-snug" style={{ color: 'var(--text-mute)' }}>
        Permanently deletes your account and all your data: meals, workouts, weight, plans and saved keys. This can't be undone.
      </p>
      <div className="mt-3">
        <Button variant={armed ? 'danger' : 'ghost'} onClick={async () => {
          if (!armed) { setArmed(true); return }
          const { error } = await supabase!.rpc('delete_my_account')
          if (error) { setErr("Couldn't delete your account right now. Try again later."); setArmed(false); return }
          forgetDevice(); localStorage.clear(); await supabase!.auth.signOut(); location.reload()
        }}>{armed ? 'Yes, delete everything' : 'Delete my account'}</Button>
      </div>
      {err && <div className="mt-2"><Notice tone="error">{err}</Notice></div>}
    </div>
  )
}
