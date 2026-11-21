import { useState } from 'react'
import { Button, Card, Notice, Screen } from '../ui'
import { supabase } from '../lib/supabase'
import { localMode } from '../lib/db'

const KINDS = [['idea', 'Idea'], ['problem', 'Problem'], ['praise', 'I like it'], ['other', 'Other']] as const

/** Ideas, problems and praise go to the FORGE team (feedback table: insert-only, readable by the sender and the owner). */
export default function Feedback() {
  const [kind, setKind] = useState<string>('idea')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function send() {
    if (!supabase) return
    setBusy(true); setErr(null)
    const { error } = await supabase.from('feedback').insert({ kind, message: text.trim(), app: 'web' })
    setBusy(false)
    if (error) setErr(error.message || "Couldn't send. Try again.")
    else { setSent(true); setText('') }
  }

  return (
    <Screen title="Feedback" back={() => history.back()}>
      <Card>
        <div className="eyebrow">Tell us what you think</div>
        <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'var(--text-mute)' }}>
          Something broken, confusing or missing? Something you like? We read every message.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {KINDS.map(([k, l]) => (
            <button key={k} className="chip press !min-h-[44px] justify-center" aria-pressed={kind === k} onClick={() => { setKind(k); setSent(false) }}>{l}</button>
          ))}
        </div>
        <textarea className="mt-4 min-h-[140px] w-full" placeholder="Write your message" maxLength={4000}
          value={text} onChange={e => { setText(e.target.value); setSent(false) }} />
        <div className="mt-4">
          {localMode ? <Notice>Sign in to send feedback.</Notice>
            : sent ? <Notice>Thanks! Your message reached the FORGE team.</Notice>
            : <Button className="w-full" disabled={busy || !text.trim()} onClick={send}>{busy ? 'Sending…' : 'Send'}</Button>}
        </div>
        {err && <div className="mt-2"><Notice tone="error">{err}</Notice></div>}
      </Card>
    </Screen>
  )
}
