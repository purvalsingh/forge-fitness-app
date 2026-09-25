import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useActiveDate } from '../store'
import { ai, AIUnavailable } from '../lib/ai'
import { compressImage } from '../lib/image'
import { groundItem, loadCatalog, type Grounded } from '../lib/catalog'
import { Button, Field, Icon, Notice, Screen } from '../ui'
import { ReviewItems } from './AddFood'

type Stage = 'capture' | 'analysing' | 'review'

/**
 * Food camera. The live preview runs at the camera's native rate in a <video> element (GPU
 * composited, no per-frame JS), the still is downscaled once on capture, and the AI's result is
 * grounded against the FORGE food database before the user sees it.
 */
export default function Camera() {
  const s = useStore()
  const { date } = useActiveDate()
  const nav = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('capture')
  const [live, setLive] = useState<'off' | 'on' | 'denied' | 'unsupported'>('off')
  const [preview, setPreview] = useState<{ dataUrl: string; base64: string; mime: string } | null>(null)
  const [hint, setHint] = useState('')
  const [items, setItems] = useState<Grounded[] | null>(null)
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const mealTypeId = s.mealTypes[1]?.id ?? s.mealTypes[0]?.id ?? ''

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])
  useEffect(() => stop, [stop])
  useEffect(() => { void loadCatalog().catch(() => {}) }, []) // warm it while the user frames the shot

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setLive('unsupported'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false,
      })
      streamRef.current = stream
      setLive('on')
      requestAnimationFrame(async () => {
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}) }
      })
    } catch { setLive('denied') }
  }

  async function capture() {
    const v = videoRef.current
    if (!v || !v.videoWidth) return
    setFlash(true); setTimeout(() => setFlash(false), 180)
    navigator.vibrate?.(15)
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth; canvas.height = v.videoHeight
    canvas.getContext('2d')!.drawImage(v, 0, 0)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', 0.92))
    stop(); setLive('off')
    if (blob) setPreview(await compressImage(blob))
  }

  async function onFile(file: File) {
    setErr(null)
    try { setPreview(await compressImage(file)) } catch { setErr('Could not read that image. Try another photo.') }
  }

  async function analyse() {
    if (!preview) return
    setStage('analysing'); setErr(null)
    try {
      const res = await ai.analyzePhoto(preview.base64, preview.mime, hint.trim() || undefined)
      if (res.items.length === 0) {
        setErr('No food recognised. Try a clearer, top-down shot of the plate, or search manually.')
        setStage('capture'); return
      }
      const catalog = await loadCatalog().catch(() => null)
      setItems(catalog ? res.items.map(i => groundItem(catalog, i)) : res.items)
      setRejected(res.rejected ?? [])
      setStage('review')
    } catch (e) {
      setErr(e instanceof AIUnavailable ? e.message : 'Unable to analyse this image. You can search for the food manually.')
      setStage('capture')
    }
  }

  if (stage === 'review' && items) {
    return (
      <Screen title="Scan result" sub="AI food camera" back={() => { setItems(null); setStage('capture') }}>
        {preview && <img src={preview.dataUrl} alt="Your meal" className="mb-3 h-40 w-full rounded-2xl object-cover" />}
        <ReviewItems items={items} rejected={rejected} date={date} mealTypeId={mealTypeId} source="ai_photo"
          onCancel={() => { setItems(null); setStage('capture') }} onDone={() => nav('/diet')} />
      </Screen>
    )
  }

  return (
    <Screen title="Scan food" sub="AI food camera" back={() => { stop(); nav(-1) }}>
      <div className="grid gap-3">
        <div className="relative overflow-hidden rounded-3xl" style={{ background: '#000', aspectRatio: '4 / 5' }}>
          {preview
            ? <img src={preview.dataUrl} alt="Captured meal" className="h-full w-full object-cover" />
            : live === 'on'
              ? <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" style={{ transform: 'translateZ(0)' }} />
              : (
                <div className="grid h-full place-items-center p-6 text-center">
                  <div className="grid gap-2">
                    <div className="mx-auto" style={{ color: 'var(--accent)' }}><Icon name="camera" size={40} /></div>
                    <div className="text-[15px] font-semibold text-white">
                      {live === 'denied' ? 'Camera permission denied' : live === 'unsupported' ? 'Live camera not available' : 'Point at your plate'}
                    </div>
                    <div className="text-[12px]" style={{ color: '#9b928a' }}>
                      {live === 'off' ? 'Top-down, whole plate in frame, good light.' : 'Use “Photo” to take a picture with your camera app instead.'}
                    </div>
                  </div>
                </div>
              )}
          {live === 'on' && !preview && (
            <div className="pointer-events-none absolute inset-6 rounded-2xl border-2" style={{ borderColor: 'rgba(255,107,44,.7)' }} />
          )}
          {flash && <div className="anim-fade absolute inset-0 bg-white" />}
          {stage === 'analysing' && (
            <div className="absolute inset-0 grid place-items-center" style={{ background: 'rgba(0,0,0,.55)' }}>
              <div className="grid place-items-center gap-3 text-white">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-transparent" style={{ borderTopColor: 'var(--accent)', borderRightColor: 'var(--accent)' }} />
                <div className="mono text-[12px] uppercase tracking-widest">Identifying food…</div>
              </div>
            </div>
          )}
        </div>

        {err && <Notice tone="error">{err}</Notice>}

        {!preview ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>Photo</Button>
            {live === 'on'
              ? <button aria-label="Capture" onClick={capture} className="press pulse h-[74px] w-[74px] rounded-full border-4"
                  style={{ borderColor: 'var(--text)', background: 'var(--accent)' }} />
              : <button aria-label="Start camera" onClick={startCamera} className="press grid h-[74px] w-[74px] place-items-center rounded-full"
                  style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}><Icon name="camera" size={30} /></button>}
            <Button variant="ghost" onClick={() => { stop(); nav('/diet') }}>Manual</Button>
          </div>
        ) : (
          <>
            <Field label="Anything the photo can't show? (optional)" hint="e.g. “made with ghee”, “2 rotis under the sabzi”, “half eaten”">
              <input value={hint} maxLength={200} onChange={e => setHint(e.target.value)} placeholder="Cooked in ghee" />
            </Field>
            <Button disabled={stage === 'analysing'} onClick={analyse}>{stage === 'analysing' ? 'Analysing…' : 'Analyse meal'}</Button>
            <Button variant="ghost" onClick={() => { setPreview(null); void startCamera() }}>Retake</Button>
          </>
        )}
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = '' }} />
      </div>
    </Screen>
  )
}
