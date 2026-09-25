import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ai, AIUnavailable } from '../lib/ai'
import { Icon, Notice, Screen } from '../ui'

type Msg = { role: 'user' | 'model'; text: string }
const KEY = 'forge:coach'
const STARTERS = [
  'How much protein do I need to build muscle?',
  'High-protein vegetarian Indian breakfast ideas?',
  'My bench press has stalled for 3 weeks — what should I change?',
  'Is it okay to train on 5 hours of sleep?',
]

/**
 * FORGE Coach: a narrow fitness/nutrition assistant. Off-topic and prompt-injection attempts are
 * refused server-side; this screen only renders text (never HTML) from the model.
 */
export default function Coach() {
  const nav = useNavigate()
  const [msgs, setMsgs] = useState<Msg[]>(() => { try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') } catch { return [] } })
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-20))) } catch { /* private mode */ } end.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])

  async function send(t: string) {
    const q = t.trim().slice(0, 1000)
    if (!q || busy) return
    const next = [...msgs, { role: 'user' as const, text: q }]
    setMsgs(next); setText(''); setBusy(true); setErr(null)
    try {
      const r = await ai.coach(next.slice(-10))
      setMsgs([...next, { role: 'model', text: r.reply }])
    } catch (e) { setErr(e instanceof AIUnavailable ? e.message : 'Coach is unavailable right now.') }
    finally { setBusy(false) }
  }

  return (
    <Screen title="Coach" sub="Training & nutrition AI" back={() => nav(-1)}
      right={msgs.length ? <button className="chip press" onClick={() => setMsgs([])}>Clear</button> : undefined}>
      <div className="grid gap-2 pb-28">
        {msgs.length === 0 && (
          <div className="card p-5">
            <div className="title text-[20px]">Ask anything about training or food.</div>
            <div className="mt-1 text-[13px]" style={{ color: 'var(--text-mute)' }}>Not a doctor — for pain, injury or medical conditions, see one.</div>
            <div className="mt-3 grid gap-2">
              {STARTERS.map(x => <button key={x} className="raised press p-3 text-left text-[13px]" onClick={() => void send(x)}>{x}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`anim-fade max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[14px] leading-relaxed ${m.role === 'user' ? 'justify-self-end' : ''}`}
            style={m.role === 'user' ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : { background: 'var(--surface-solid)', border: '1px solid var(--line)' }}>
            {m.text}
          </div>
        ))}
        {busy && <div className="mono text-[12px]" style={{ color: 'var(--text-mute)' }}>Coach is thinking…</div>}
        {err && <Notice tone="error">{err}</Notice>}
        <div ref={end} />
      </div>
      <form onSubmit={e => { e.preventDefault(); void send(text) }}
        className="fixed inset-x-0 z-40 mx-auto flex max-w-[520px] gap-2 px-4" style={{ bottom: 'calc(92px + env(safe-area-inset-bottom))' }}>
        <input value={text} maxLength={1000} onChange={e => setText(e.target.value)} placeholder="Ask the coach…" aria-label="Message" className="glass" />
        <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className="press grid h-12 w-12 shrink-0 place-items-center rounded-full disabled:opacity-40"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}><Icon name="chevron" /></button>
      </form>
    </Screen>
  )
}
