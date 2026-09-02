import { useEffect, useState, type ReactNode } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { setLocalMode } from '../lib/db'
import { Button, Card, Field, Notice, Spinner } from '../ui'

type Mode = 'signin' | 'signup' | 'reset'

/**
 * Auth gate. With Supabase configured it enforces a real session.
 * Without it (or in explicit demo mode) the app runs fully against local storage —
 * a separate code path, never a way to bypass a configured backend.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<unknown>(null)
  const [checking, setChecking] = useState(supabaseConfigured)
  const [demo, setDemo] = useState(() => localStorage.getItem('forge:demo') === '1')

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setChecking(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const local = !supabaseConfigured || demo
  setLocalMode(local)

  if (local) return <>{children}</>
  if (checking) return <Spinner label="Checking session" />
  if (!session) return <AuthScreen onDemo={() => { localStorage.setItem('forge:demo', '1'); setDemo(true) }} />
  return <>{children}</>
}

function AuthScreen({ onDemo }: { onDemo: () => void }) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setBusy(true); setMsg(null)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg({ tone: 'info', text: 'Account created. Check your email if confirmation is required, then sign in.' })
        setMode('signin')
      } else if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
        if (error) throw error
        setMsg({ tone: 'info', text: 'Password reset email sent.' })
      }
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Something went wrong. Try again.' })
    } finally { setBusy(false) }
  }

  return (
    <div className="mx-auto grid min-h-full w-full max-w-[440px] content-center gap-4 px-5 py-10">
      <div>
        <div className="eyebrow">Personal fitness operating system</div>
        <h1 className="text-[40px] font-black tracking-tight">FORGE</h1>
      </div>
      <Card glass>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Email">
            <input type="email" autoComplete="email" required value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          {mode !== 'reset' && (
            <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
              <input type="password" required minLength={8} value={password}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          )}
          {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
          <Button type="submit" disabled={busy}>
            {busy ? 'Working…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}
          </Button>
        </form>
        <div className="mt-3 flex justify-between text-[12px]" style={{ color: 'var(--text-mute)' }}>
          <button onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
            {mode === 'signup' ? 'Have an account?' : 'Create an account'}
          </button>
          <button onClick={() => setMode('reset')}>Forgot password</button>
        </div>
      </Card>
      <Button variant="ghost" onClick={onDemo}>Use offline demo mode</Button>
      <p className="text-center text-[11px]" style={{ color: 'var(--text-mute)' }}>
        Demo mode keeps everything on this device only.
      </p>
    </div>
  )
}
