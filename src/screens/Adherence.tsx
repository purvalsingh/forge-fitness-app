import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useToday } from '../store'
import { adherenceFor, monthGrid } from '../lib/derive'
import { Card, FillCircle, Screen, Stat } from '../ui'

export default function Adherence() {
  const s = useStore()
  const today = useToday()
  const nav = useNavigate()
  const [cursor, setCursor] = useState(() => { const d = new Date(today + 'T00:00:00'); return { y: d.getFullYear(), m: d.getMonth() } })

  const src = { foodLogs: s.foodLogs, sessions: s.sessions, steps: s.steps, target: s.target, settings: s.settings }
  const cells = monthGrid(cursor.y, cursor.m)
  const monthDates = cells.filter((c): c is string => c != null && c <= today)
  const scores = monthDates.map(d => adherenceFor(src, d).score)
  const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const perfect = scores.filter(x => x >= 0.999).length
  const label = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const shift = (n: number) => setCursor(c => {
    const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }
  })

  return (
    <Screen title="Monthly adherence" sub="Consistency" back={() => nav(-1 as never)}>
      <Card paper>
        <div className="flex items-center justify-between">
          <button aria-label="Previous month" onClick={() => shift(-1)} className="px-3 py-1 text-[18px]">‹</button>
          <div className="title text-[19px]">{label}</div>
          <button aria-label="Next month" onClick={() => shift(1)} className="px-3 py-1 text-[18px]">›</button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} className="eyebrow">{d}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const future = d > today
            const a = future ? null : adherenceFor(src, d)
            return (
              <button key={d} onClick={() => nav(`/day/${d}`)} disabled={future}
                aria-label={`${d}${a ? `, ${Math.round(a.score * 100)} percent complete` : ''}`}
                className="grid place-items-center gap-0.5 py-1 disabled:opacity-30">
                <FillCircle value={a?.score ?? 0} dim={!a} size={30} onPaper>{Number(d.slice(-2))}</FillCircle>
                <span className="flex gap-[3px]">
                  <Dot on={a?.diet === 'complete'} />
                  <Dot on={a?.workout === 'complete'} />
                  <Dot on={a?.steps === 'complete'} />
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-[10px]" style={{ color: 'var(--paper-ink-dim)' }}>
          <span className="flex items-center gap-1"><Dot on /> Diet</span>
          <span className="flex items-center gap-1"><Dot on /> Workout</span>
          <span className="flex items-center gap-1"><Dot on /> Steps</span>
          <span>Circle fill = day completion</span>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Month average" value={`${Math.round(avg * 100)}%`} />
        <Stat label="Perfect days" value={perfect} />
        <Stat label="Days logged" value={monthDates.length} />
      </div>
    </Screen>
  )
}

function Dot({ on }: { on?: boolean }) {
  return <span className="inline-block h-[4px] w-[4px] rounded-full"
    style={{ background: on ? 'var(--accent-strong)' : 'var(--paper-line)' }} />
}
