import { useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from 'react'

export function Screen({ title, sub, right, back, children }: {
  title?: string; sub?: string; right?: ReactNode; back?: () => void; children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[520px] min-w-0 overflow-x-hidden px-4 pt-3 safe-bottom">
      {(title || back || right) && (
        <header className="flex items-center gap-3 py-3">
          {back && (
            <button onClick={back} aria-label="Back"
              className="grid h-10 w-10 place-items-center rounded-full border"
              style={{ borderColor: 'var(--line)' }}>
              <Icon name="back" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            {sub && <div className="eyebrow">{sub}</div>}
            {title && <h1 className="truncate text-[22px] font-extrabold tracking-tight">{title}</h1>}
          </div>
          {right}
        </header>
      )}
      {children}
    </div>
  )
}

export function Card({ children, className = '', glass, onClick, style }: {
  children: ReactNode; className?: string; glass?: boolean; onClick?: () => void; style?: CSSProperties
}) {
  const cls = `${glass ? 'glass' : 'card'} p-4 ${onClick ? 'text-left active:scale-[0.995] transition-transform' : ''} ${className}`
  return onClick
    ? <button className={cls} onClick={onClick} style={style}>{children}</button>
    : <div className={cls} style={style}>{children}</div>
}

export function Button({ children, onClick, variant = 'primary', className = '', disabled, type = 'button' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'quiet' | 'danger'
  className?: string; disabled?: boolean; type?: 'button' | 'submit'
}) {
  const styles: Record<string, CSSProperties> = {
    primary: { background: 'var(--accent-strong)', color: '#F6E6EA', borderColor: 'transparent' },
    ghost: { background: 'transparent', color: 'var(--text)', borderColor: 'var(--line)' },
    quiet: { background: 'var(--glass)', color: 'var(--text)', borderColor: 'var(--glass-border)' },
    danger: { background: 'transparent', color: '#D98A8A', borderColor: 'rgba(217,138,138,.4)' },
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`min-h-[46px] w-full rounded-2xl border px-4 text-[14px] font-bold tracking-wide uppercase disabled:opacity-45 ${className}`}
      style={styles[variant]}>{children}</button>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="eyebrow mb-1.5">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px]" style={{ color: 'var(--text-mute)' }}>{hint}</div>}
    </label>
  )
}

export function Tabs<T extends string>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: { value: T; label: string }[]
}) {
  return (
    <div role="tablist" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className="min-h-[38px] shrink-0 rounded-full border px-4 text-[12px] font-bold tracking-wide uppercase"
          style={value === o.value
            ? { background: 'var(--accent-strong)', color: '#F6E6EA', borderColor: 'transparent' }
            : { background: 'var(--glass)', color: 'var(--text-dim)', borderColor: 'var(--glass-border)' }}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Arc gauge used for the daily score on Today. */
export function ScoreArc({ value, size, label, caption }: {
  value: number; size?: number; label?: string; caption?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(size ?? 168)
  useEffect(() => {
    if (size) return
    const el = box.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(120, Math.min(168, e.contentRect.width - 24))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [size])
  const px = size ?? w
  const r = px / 2 - 12
  const c = Math.PI * r
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div ref={box} className="relative grid w-full place-items-center" style={{ height: px / 2 + 26 }}>
      <svg width={px} height={px / 2 + 8} viewBox={`0 0 ${px} ${px / 2 + 8}`} aria-hidden>
        <path d={arcPath(px, r)} fill="none" strokeWidth="12" strokeLinecap="round" stroke="var(--glass-border)" />
        <path d={arcPath(px, r)} fill="none" strokeWidth="12" strokeLinecap="round"
          stroke="var(--accent)" strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray .5s ease' }} />
      </svg>
      <div className="absolute bottom-0 text-center">
        <div className="text-[30px] font-extrabold leading-none">{Math.round(pct * 100)}%</div>
        {label && <div className="eyebrow mt-1">{label}</div>}
        {caption && <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>{caption}</div>}
      </div>
    </div>
  )
}
function arcPath(size: number, r: number) {
  const cx = size / 2, cy = size / 2
  return `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`
}

/** Macro ring. */
export function Ring({ value, size = 74, stroke = 7, label, sub }: {
  value: number; size?: number; stroke?: number; label?: string; sub?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, value))
  return (
    <div className="grid place-items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke="var(--glass-border)" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
            stroke="var(--accent)" strokeDasharray={`${c * pct} ${c}`} style={{ transition: 'stroke-dasharray .4s ease' }} />
        </svg>
        {label && <div className="absolute inset-0 grid place-items-center text-[12px] font-bold">{label}</div>}
      </div>
      {sub && <div className="eyebrow">{sub}</div>}
    </div>
  )
}

/**
 * Calendar completion indicator. The fill level *is* the number —
 * deliberately no percentage text inside the circle.
 */
export function FillCircle({ value, size = 30, dim, children }: {
  value: number; size?: number; dim?: boolean; children?: ReactNode
}) {
  const pct = Math.max(0, Math.min(1, value))
  const r = size / 2 - 1
  const clipId = `fc${useId().replace(/:/g, '')}`
  return (
    <span className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--glass-border)" strokeWidth="1.5" />
        <clipPath id={clipId}>
          <rect x="0" y={size * (1 - pct)} width={size} height={size * pct} />
        </clipPath>
        <circle cx={size / 2} cy={size / 2} r={r} fill="var(--accent)" opacity={dim ? 0.35 : 0.85}
          clipPath={`url(#${clipId})`} />
      </svg>
      <span className="absolute text-[11px] font-semibold">{children}</span>
    </span>
  )
}

export function Bar({ value, height = 6, color }: { value: number; height?: number; color?: string }) {
  return (
    <div className="w-full overflow-hidden rounded-full" style={{ height, background: 'var(--glass-border)' }}>
      <div style={{
        width: `${Math.max(0, Math.min(1, value)) * 100}%`, height: '100%',
        background: color ?? 'var(--accent)', transition: 'width .4s ease',
      }} />
    </div>
  )
}

export function Sheet({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 backdrop-blur-[2px]" style={{ background: 'var(--scrim)' }} onClick={onClose} />
      <div ref={ref} tabIndex={-1}
        className="sheet-surface relative max-h-[88vh] w-full max-w-[520px] overflow-y-auto rounded-t-3xl p-4"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--glass-border)' }} />
        {title && <h2 className="mb-3 text-[17px] font-extrabold">{title}</h2>}
        {children}
      </div>
    </div>
  )
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card grid place-items-center gap-2 p-8 text-center">
      <div className="text-[15px] font-bold">{title}</div>
      {body && <div className="text-[13px]" style={{ color: 'var(--text-mute)' }}>{body}</div>}
      {action}
    </div>
  )
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode }) {
  const c = tone === 'error' ? '#D98A8A' : tone === 'warn' ? 'var(--color-warn)' : 'var(--accent)'
  return (
    <div className="rounded-2xl border px-3 py-2.5 text-[12px]"
      style={{ borderColor: c, color: 'var(--text-dim)', background: 'var(--glass)' }} role="status">
      {children}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="grid place-items-center gap-2 py-8" role="status" aria-live="polite">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-transparent"
        style={{ borderTopColor: 'var(--accent)', borderRightColor: 'var(--accent)' }} />
      {label && <div className="eyebrow">{label}</div>}
    </div>
  )
}

const PATHS: Record<string, string> = {
  today: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z',
  diet: 'M7 2v9a3 3 0 0 0 2 2.8V22h2v-8.2A3 3 0 0 0 13 11V2h-2v7H9V2H7Zm10 0c-1.7 0-3 2.5-3 5.5S15.3 13 17 13v9h2V2h-2Z',
  workout: 'M4 9h2v6H4V9Zm14 0h2v6h-2V9ZM7 7h2v10H7V7Zm8 0h2v10h-2V7Zm-5 4h4v2h-4v-2Z',
  progress: 'M4 19h16v2H4v-2Zm2-6h3v5H6v-5Zm5-5h3v10h-3V8Zm5-4h3v14h-3V4Z',
  more: 'M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  back: 'M15 5 8 12l7 7-1.4 1.4L5.2 12 13.6 3.6 15 5Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  camera: 'M9 4 7.6 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.6L15 4H9Zm3 5a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  sparkle: 'M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Zm6 12 .9 2.6L21.5 18l-2.6.9L18 21.5l-.9-2.6L14.5 18l2.6-.9L18 14Z',
  check: 'M9.5 17.6 4 12.1l1.4-1.4 4.1 4.1 9-9L20 7.2 9.5 17.6Z',
  gear: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 4-.1 1.3 2 1.6-2 3.4-2.4-.8a7.7 7.7 0 0 1-2.2 1.3L15.9 22h-3.8l-.4-2.2a7.7 7.7 0 0 1-2.2-1.3l-2.4.8-2-3.4 2-1.6a8.6 8.6 0 0 1 0-2.6l-2-1.6 2-3.4 2.4.8a7.7 7.7 0 0 1 2.2-1.3L12.1 2h3.8l.4 2.2c.8.3 1.5.7 2.2 1.3l2.4-.8 2 3.4-2 1.6L21 12Z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2ZM6 9h12l-1 12H7L6 9Z',
  weight: 'M12 4a4 4 0 0 1 3.9 3H18a2 2 0 0 1 2 1.7l1 10A2 2 0 0 1 19 21H5a2 2 0 0 1-2-2.3l1-10A2 2 0 0 1 6 7h2.1A4 4 0 0 1 12 4Zm0 2a2 2 0 0 0-1.7 1h3.4A2 2 0 0 0 12 6Z',
  steps: 'M7 3c1.7 0 3 1.6 3 3.5 0 1.4-.4 2.5-.4 4 0 .9.4 1.5.4 2.5 0 1.4-1.1 2-2.5 2S5 14.4 5 13c0-1.3.4-2 .4-3.2C5.4 8 5 7.6 5 6.5 5 4.6 5.3 3 7 3Zm10 5c1.7 0 2 1.6 2 3.5 0 1.1-.4 1.5-.4 3.3 0 1.2.4 1.9.4 3.2 0 1.4-1.1 2-2.5 2s-2.5-.6-2.5-2c0-1 .4-1.6.4-2.5 0-1.5-.4-2.6-.4-4C14 9.6 15.3 8 17 8Z',
}

export function Icon({ name, size = 22, color }: { name: keyof typeof PATHS | string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color ?? 'currentColor'} aria-hidden focusable="false">
      <path d={PATHS[name] ?? PATHS.more} />
    </svg>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="raised p-3">
      <div className="eyebrow">{label}</div>
      <div className="mt-1 text-[19px] font-extrabold leading-none">{value}</div>
      {sub && <div className="mt-1 text-[11px]" style={{ color: 'var(--text-mute)' }}>{sub}</div>}
    </div>
  )
}
