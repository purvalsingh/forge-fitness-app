import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { setLocalMode } from '../lib/db'
import { aiKeys, AIUnavailable } from '../lib/ai'
import { isNative } from '../lib/native'
import { Button, Field, Icon, Notice, Spinner } from '../ui'

/** Where email links (confirm / reset) land. The native app has no URL of its own, so it uses the site. */
const SITE_APP = isNative ? 'https://forgefit-india.vercel.app/app/' : `${location.origin}${import.meta.env.BASE_URL}`

type Mode = 'signin' | 'signup' | 'reset'

/** Keys typed at sign-up while the account still awaited email confirmation. Memory only — never persisted. */
let pendingKeys: string[] | null = null
let pendingSex: 'male' | 'female' | null = null

const KEY_RE = /^AIza[0-9A-Za-z_-]{35}$/

/**
 * Auth gate. With Supabase configured it enforces a real session AND at least two Gemini keys on
 * the account (the AI runs on the user's own quota). Without Supabase — or in explicit offline
 * demo mode — the app runs against local storage with AI switched off.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(supabaseConfigured)
  const [keys, setKeys] = useState<'unknown' | 'missing' | 'ok'>('unknown')
  const [demo, setDemo] = useState(() => { try { return localStorage.getItem('forge:demo') === '1' } catch { return false } })

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setKeys('unknown'); return }
    let alive = true
    ;(async () => {
      if (pendingSex && supabase) {
        // The body shown on the muscle map (and used for calorie maths) — chosen at sign-up.
        await supabase.from('profiles').update({ sex: pendingSex }).eq('id', session.user.id).then(() => { pendingSex = null }, () => {})
      }
      if (pendingKeys) {
        try { await aiKeys.save(pendingKeys); pendingKeys = null; if (alive) setKeys('ok'); return } catch { /* fall through to the gate */ }
      }
      try {
        const k = await aiKeys.get()
        if (alive) setKeys(k.count >= 2 ? 'ok' : 'missing')
      } catch {
        // API unreachable (offline, cold start): let them in — AI features explain themselves.
        if (alive) setKeys('ok')
      }
    })()
    return () => { alive = false }
  }, [session])

  const local = !supabaseConfigured || demo
  setLocalMode(local)

  if (local) return <>{children}</>
  if (checking) return <Spinner label="Checking session" />
  if (!session) return <AuthScreen onDemo={() => { try { localStorage.setItem('forge:demo', '1') } catch { /* private mode */ } setDemo(true) }} />
  if (keys === 'unknown') return <Spinner label="Loading your account" />
  if (keys === 'missing') return <Shell><KeySetup required onSaved={() => setKeys('ok')} /></Shell>
  return <>{children}</>
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="page mx-auto grid min-h-full w-full max-w-[460px] content-center gap-5 px-5 py-10"
      style={{ paddingTop: 'calc(40px + env(safe-area-inset-top))' }}>
      <div>
        <div className="flex items-center gap-2" style={{ color: 'var(--accent)' }}><Icon name="flame" size={26} /><span className="eyebrow" style={{ color: 'var(--accent)' }}>Train · Eat · Track</span></div>
        <h1 className="title mt-1 text-[48px] leading-none">FORGE</h1>
      </div>
      {children}
    </div>
  )
}

function passwordProblem(p: string): string | null {
  if (p.length < 10) return 'Use at least 10 characters.'
  if (!/[a-z]/i.test(p) || !/\d/.test(p)) return 'Mix letters and numbers.'
  if (/^(.)\1+$/.test(p) || /password|qwerty|123456/i.test(p)) return 'That password is too easy to guess.'
  return null
}

function AuthScreen({ onDemo }: { onDemo: () => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [keys, setKeys] = useState<string[]>(['', ''])
  const [consent, setConsent] = useState(false)
  const [sex, setSex] = useState<'male' | 'female' | ''>('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [failures, setFailures] = useState(0)

  const isNetworkError = (e: unknown) =>
    e instanceof TypeError || /failed to fetch|network|load failed/i.test(e instanceof Error ? e.message : String(e))

  function validateSignup(): string | null {
    if (name.trim().length < 2) return 'Enter your name.'
    if (!sex) return 'Choose male or female — it sets your body map and calorie maths.'
    const pw = passwordProblem(password)
    if (pw) return pw
    if (password !== confirm) return 'Passwords don\'t match.'
    const filled = keys.map(k => k.trim()).filter(Boolean)
    if (filled.length < 2) return 'Add at least 2 Gemini API keys (up to 5).'
    if (new Set(filled).size !== filled.length) return 'Each Gemini key must be different.'
    const bad = filled.findIndex(k => !KEY_RE.test(k))
    if (bad >= 0) return `Key ${bad + 1} doesn't look like a Gemini API key (it starts with "AIza").`
    if (!consent) return 'Please accept how your keys are stored.'
    return null
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || busy) return
    // Client-side backoff on repeated failures (Supabase also rate-limits server-side).
    if (failures >= 5) { setMsg({ tone: 'error', text: 'Too many attempts. Wait a minute and try again.' }); return }
    setMsg(null)
    if (mode === 'signup') {
      const problem = validateSignup()
      if (problem) { setMsg({ tone: 'error', text: problem }); return }
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const filled = keys.map(k => k.trim()).filter(Boolean)
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { data: { display_name: name.trim().slice(0, 60) }, emailRedirectTo: SITE_APP },
        })
        if (error) throw error
        pendingKeys = filled
        pendingSex = sex || null
        if (data.session) return // AuthGate saves the keys and lets them in
        setMsg({ tone: 'info', text: 'Check your inbox to confirm your email, then sign in here. Your keys are saved on first sign-in.' })
        setMode('signin')
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: SITE_APP })
        if (error) throw error
        setMsg({ tone: 'info', text: 'If that email has an account, a reset link is on its way.' })
      }
      setFailures(0)
    } catch (err) {
      setFailures(f => f + 1)
      setTimeout(() => setFailures(f => Math.max(0, f - 1)), 60_000)
      if (isNetworkError(err)) {
        setMsg({ tone: 'error', text: 'Could not reach the server. Nothing was sent — check your connection, VPN or ad-blocker and retry.' })
      } else {
        // Never reveal whether an email exists.
        const m = err instanceof Error ? err.message : ''
        setMsg({ tone: 'error', text: /invalid login/i.test(m) ? 'Email or password is incorrect.' : m || 'Something went wrong. Try again.' })
      }
    } finally { setBusy(false) }
  }

  return (
    <Shell>
      <div className="card glow p-5">
        <div className="mb-4 flex gap-2">
          <button className="chip press" aria-pressed={mode === 'signin'} onClick={() => { setMode('signin'); setMsg(null) }}>Sign in</button>
          <button className="chip press" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setMsg(null) }}>Create account</button>
        </div>
        <form onSubmit={submit} className="grid gap-3" noValidate>
          {mode === 'signup' && (
            <Field label="Your name">
              <input autoComplete="name" required maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder="Aarav Sharma" />
            </Field>
          )}
          {mode === 'signup' && (
            <Field label="Gender" hint="Used for your calorie maths and the body shown on your muscle map.">
              <div className="grid grid-cols-2 gap-2">
                {(['male', 'female'] as const).map(g => (
                  <button key={g} type="button" className="chip press !min-h-[44px] justify-center" aria-pressed={sex === g} onClick={() => setSex(g)}>
                    {g === 'male' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
            </Field>
          )}
          <Field label="Email">
            <input type="email" autoComplete="email" inputMode="email" required maxLength={254} value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          {mode !== 'reset' && (
            <Field label="Password" hint={mode === 'signup' ? 'At least 10 characters, letters and numbers.' : undefined}>
              <input type="password" required minLength={mode === 'signup' ? 10 : 6} maxLength={128} value={password}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••••" />
            </Field>
          )}
          {mode === 'signup' && (
            <>
              <Field label="Confirm password">
                <input type="password" required maxLength={128} value={confirm} autoComplete="new-password"
                  onChange={e => setConfirm(e.target.value)} placeholder="••••••••••" />
              </Field>
              <KeyInputs keys={keys} setKeys={setKeys} />
              <label className="flex items-start gap-2 text-[12px]" style={{ color: 'var(--text-dim)' }}>
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                <span>My keys are encrypted (AES-256) on the FORGE server, used only for my own AI requests and never shown again. I can delete them any time in Settings.</span>
              </label>
            </>
          )}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </Button>
        </form>
        {mode !== 'signup' && (
          <div className="mt-3 text-right text-[12px]" style={{ color: 'var(--text-mute)' }}>
            <button onClick={() => setMode(mode === 'reset' ? 'signin' : 'reset')}>{mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}</button>
          </div>
        )}
      </div>
      <button className="text-[12px] underline" style={{ color: 'var(--text-mute)' }} onClick={onDemo}>
        Try it offline without an account (no AI, data stays on this device)
      </button>
    </Shell>
  )
}

function KeyInputs({ keys, setKeys }: { keys: string[]; setKeys: (k: string[]) => void }) {
  const [show, setShow] = useState(false)
  return (
    <div className="grid gap-2">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">Gemini API keys · {keys.length} of 5</div>
          <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
            Minimum 2. Free at <a className="underline" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer noopener" style={{ color: 'var(--accent)' }}>aistudio.google.com/apikey</a> — use different Google projects for more free quota.
          </div>
        </div>
        <button type="button" className="text-[11px] underline" style={{ color: 'var(--text-mute)' }} onClick={() => setShow(v => !v)}>{show ? 'Hide' : 'Show'}</button>
      </div>
      {keys.map((k, i) => (
        <div key={i} className="flex gap-2">
          <input type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false} maxLength={60}
            value={k} placeholder={`Key ${i + 1}: AIza…`} aria-label={`Gemini key ${i + 1}`}
            onChange={e => setKeys(keys.map((x, j) => (j === i ? e.target.value.trim() : x)))}
            style={{ borderColor: k && !KEY_RE.test(k) ? 'var(--danger)' : undefined }} />
          {keys.length > 2 && (
            <button type="button" aria-label={`Remove key ${i + 1}`} className="press px-2" style={{ color: 'var(--danger)' }}
              onClick={() => setKeys(keys.filter((_, j) => j !== i))}><Icon name="trash" size={18} /></button>
          )}
        </div>
      ))}
      {keys.length < 5 && (
        <button type="button" className="chip press w-fit" onClick={() => setKeys([...keys, ''])}>+ Add another key</button>
      )}
    </div>
  )
}

/** Add / replace the account's Gemini keys. `required` = shown as a gate after sign-in. */
export function KeySetup({ required, onSaved }: { required?: boolean; onSaved?: () => void }) {
  const [keys, setKeys] = useState<string[]>(['', ''])
  const [status, setStatus] = useState<{ count: number; hints: string[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)

  useEffect(() => { if (!required) aiKeys.get().then(setStatus).catch(() => {}) }, [required])

  async function save() {
    const filled = keys.map(k => k.trim()).filter(Boolean)
    if (filled.length < 2) { setMsg({ tone: 'error', text: 'Add at least 2 keys.' }); return }
    if (filled.some(k => !KEY_RE.test(k))) { setMsg({ tone: 'error', text: 'Every key starts with "AIza" and is 39 characters.' }); return }
    setBusy(true); setMsg(null)
    try {
      const r = await aiKeys.save(filled)
      setStatus(r); setKeys(['', ''])
      setMsg({ tone: 'info', text: `Saved ${r.count} keys. Google confirmed they work.` })
      onSaved?.()
    } catch (e) {
      setMsg({ tone: 'error', text: e instanceof AIUnavailable ? e.message : 'Could not save keys.' })
    } finally { setBusy(false) }
  }

  return (
    <div className="card grid gap-3 p-5">
      <div>
        <div className="title text-[22px]">{required ? 'One last step' : 'AI keys'}</div>
        <div className="mt-1 text-[13px]" style={{ color: 'var(--text-dim)' }}>
          FORGE's AI (food camera, meal parsing, coach, plans) runs on your own free Gemini keys, so it stays free and
          nobody else's usage slows you down.
        </div>
      </div>
      {status && status.count > 0 && (
        <Notice>Active: {status.count} keys ({status.hints.join(', ')}). Saving new keys replaces them.</Notice>
      )}
      <KeyInputs keys={keys} setKeys={setKeys} />
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <Button disabled={busy} onClick={save}>{busy ? 'Checking keys with Google…' : 'Save keys'}</Button>
      {!required && status && status.count > 0 && (
        <Button variant="danger" onClick={async () => { await aiKeys.remove(); setStatus({ count: 0, hints: [] }) }}>Delete my keys</Button>
      )}
      {required && (
        <button className="text-[12px] underline" style={{ color: 'var(--text-mute)' }} onClick={() => supabase?.auth.signOut()}>Sign out</button>
      )}
    </div>
  )
}
