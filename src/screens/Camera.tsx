import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useToday } from '../store'
import { ai, AIUnavailable, type ParsedFood } from '../lib/ai'
import { Button, Card, Field, Notice, Screen, Spinner } from '../ui'
import { ReviewItems } from './AddFood'

type Stage = 'capture' | 'analysing' | 'review'

export default function Camera() {
  const s = useStore()
  const date = useToday()
  const nav = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('capture')
  const [mealTypeId, setMealTypeId] = useState(s.mealTypes[1]?.id ?? s.mealTypes[0]?.id ?? '')
  const [permission, setPermission] = useState<'idle' | 'granted' | 'denied' | 'unsupported'>('idle')
  const [preview, setPreview] = useState<{ dataUrl: string; base64: string; mime: string } | null>(null)
  const [items, setItems] = useState<ParsedFood[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => stop, [stop])

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) { setPermission('unsupported'); return }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })
      streamRef.current = stream
      setPermission('granted')
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play() }
    } catch {
      setPermission('denied')
    }
  }

  function capture() {
    const v = videoRef.current
    if (!v) return
    const canvas = document.createElement('canvas')
    const w = Math.min(1024, v.videoWidth || 1024)
    canvas.width = w
    canvas.height = Math.round((v.videoHeight / v.videoWidth) * w) || w
    canvas.getContext('2d')!.drawImage(v, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
    setPreview({ dataUrl, base64: dataUrl.split(',')[1], mime: 'image/jpeg' })
    stop(); setPermission('idle')
  }

  function onFile(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      setPreview({ dataUrl, base64: dataUrl.split(',')[1], mime: file.type || 'image/jpeg' })
    }
    reader.readAsDataURL(file)
  }

  async function analyse() {
    if (!preview) return
    setStage('analysing'); setErr(null)
    try {
      const res = await ai.analyzePhoto(preview.base64, preview.mime)
      setItems(res); setStage('review')
    } catch (e) {
      setErr(e instanceof AIUnavailable ? e.message : 'Unable to analyse this image. You can search for the food manually.')
      setStage('capture')
    }
  }

  if (stage === 'review' && items) {
    return (
      <Screen title="Detected foods" sub="AI estimate" back={() => { setItems(null); setStage('capture') }}>
        <ReviewItems items={items} date={date} mealTypeId={mealTypeId} source="ai_photo"
          onCancel={() => { setItems(null); setStage('capture') }} onDone={() => nav('/diet')} />
      </Screen>
    )
  }

  return (
    <Screen title="Scan food" sub="Camera" back={() => nav('/diet')}>
      <div className="grid gap-3">
        <Field label="Add to meal">
          <select value={mealTypeId} onChange={e => setMealTypeId(e.target.value)}>
            {s.mealTypes.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>

        <Card className="overflow-hidden p-0">
          <div className="grid aspect-[4/5] place-items-center" style={{ background: 'var(--surface-raised)' }}>
            {preview
              ? <img src={preview.dataUrl} alt="Captured meal" className="h-full w-full object-cover" />
              : permission === 'granted'
                ? <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
                : (
                  <div className="grid gap-2 p-6 text-center">
                    <div className="text-[14px] font-bold">
                      {permission === 'denied' ? 'Camera permission denied'
                        : permission === 'unsupported' ? 'Camera not supported in this browser'
                          : 'Camera preview'}
                    </div>
                    <div className="text-[12px]" style={{ color: 'var(--text-mute)' }}>
                      {permission === 'idle' ? 'Start the camera or upload a photo from your gallery.'
                        : 'Upload a photo from your gallery instead.'}
                    </div>
                  </div>
                )}
          </div>
        </Card>

        {!ai.configured && <Notice tone="warn">AI is not configured, so photo analysis is unavailable. Manual entry still works.</Notice>}
        {err && <Notice tone="error">{err}</Notice>}
        {stage === 'analysing' && <Spinner label="Analysing meal" />}

        <div className="glass grid grid-cols-3 items-center gap-3 p-3">
          <Button variant="ghost" onClick={() => fileRef.current?.click()}>Gallery</Button>
          {permission === 'granted'
            ? <Button onClick={capture}>Capture</Button>
            : <Button onClick={startCamera} disabled={permission === 'unsupported'}>Camera</Button>}
          <Button variant="ghost" onClick={() => { stop(); setPreview(null); setPermission('idle'); nav('/diet') }}>Cancel</Button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />

        {preview && (
          <>
            <Button disabled={!ai.configured || stage === 'analysing'} onClick={analyse}>
              {stage === 'analysing' ? 'Analysing…' : 'Analyse meal'}
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>Retake</Button>
          </>
        )}
        <Button variant="quiet" onClick={() => nav('/diet')}>Log manually instead</Button>
      </div>
    </Screen>
  )
}
