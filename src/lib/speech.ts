import { useRef, useState } from 'react'

/**
 * Browser speech-to-text (Chrome on Android/desktop, Safari on iOS). Hidden where the browser has none.
 * The browser's own speech service (Google or Apple) does the recognition; FORGE only receives the text.
 */
type Rec = { lang: string; interimResults: boolean; maxAlternatives: number; start(): void; stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null }
const Ctor = (): (new () => Rec) | undefined => {
  const w = globalThis as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition
}
export const speechSupported = () => typeof window !== 'undefined' && !!Ctor()

export function useSpeech() {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rec = useRef<Rec | null>(null)
  function start(lang: string, onText: (t: string) => void) {
    const C = Ctor(); if (!C) return
    setError(null)
    const r = new C()
    r.lang = lang; r.interimResults = false; r.maxAlternatives = 1
    r.onresult = e => { const t = e.results[0]?.[0]?.transcript; if (t) onText(t) }
    r.onerror = e => setError(e.error === 'not-allowed' ? 'Microphone permission was denied.' : e.error === 'no-speech' ? "Didn't hear anything. Try again." : 'Voice input stopped. Try again or type it.')
    r.onend = () => setListening(false)
    rec.current = r; setListening(true); r.start()
  }
  return { listening, error, start, stop: () => rec.current?.stop() }
}
