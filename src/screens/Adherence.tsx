import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, useToday } from '../store'
import { adherenceFor, monthGrid } from '../lib/derive'
import { lateDays, monthStats, repairs, streakFor, streakInput } from '../lib/streak'
import { Button, Card, FillCircle, Screen, Stat } from '../ui'

export default function Adherence() {
  const s = useStore()
  const today = useToday()
  const nav = useNavigate()
  const [cursor, setCursor] = useState(() => { const d = new Date(today + 'T00:00:00'); return { y: d.getFullYear(), m: d.getMonth() } })
  const [info, setInfo] = useState(false)
  const [, rerender] = useState(0)

  const src = { foodLogs: s.foodLogs, sessions: s.sessions, steps: s.steps, target: s.target, settings: s.settings }
  const st = streakFor(s, today)
  const late = lateDays(streakInput(s, today))
  const cells = monthGrid(cursor.y, cursor.m)
  const monthDates = cells.filter((c): c is string => c != null && c <= today)
  // Days the user actually logged something: food, a finished-or-started workout, or steps.
  const logged = new Set([...s.foodLogs.map(l => l.date), ...s.sessions.map(x => x.date), ...s.steps.filter(x => x.steps > 0).map(x => x.date)])
  const { avg, perfect, loggedDays } = monthStats({ monthDates, logged, days: st.days, today, score: d => adherenceFor(src, d).score })
  const label = new Date(cursor.y, cursor.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

  const shift = (n: number) => setCursor(c => {
    const d = new Date(c.y, c.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }
  })

  return (
    <Screen title="Monthly adherence" sub="Consistency" back={() => nav(-1 as never)}>
      {/* Streak: one line plus one small line; the rules live behind (i). */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <div className="text-[17px] font-bold">{st.current} day{st.current === 1 ? '' : 's'} 🔥 <span className="text-[13px] font-normal" style={{ color: 'var(--text-mute)' }}>· {st.freezesLeft} freeze{st.freezesLeft === 1 ? '' : 's'} left</span></div>
          <button aria-label="How the streak works" aria-expanded={info} onClick={() => setInfo(v => !v)}
            className="grid h-9 w-9 place-items-center rounded-full text-[13px] font-bold" style={{ background: 'var(--surface-high)' }}>i</button>
        </div>
        <div className="mt-0.5 text-[12px]" style={{ color: 'var(--text-mute)' }}>Best {st.best} day{st.best === 1 ? '' : 's'}</div>
        {info && (
          <p className="mt-2 text-[12px] leading-snug" style={{ color: 'var(--text-dim)' }}>
            A day counts when you log food, finish a workout or hit your steps. Planned rest days never break it (they keep it, but only days you show up add to it). Missing a day
            uses a freeze (2 a month, automatic). If a streak of 3+ days breaks with no freeze left, you can repair it once a month within 2 days
            by logging 3 meals plus a workout or your step goal.
          </p>
        )}
        {st.repairOffer && (st.repairEarned
          ? <Button className="mt-3" onClick={() => { repairs.add(st.repairOffer!.days, today); rerender(n => n + 1) }}>Repair your {st.repairOffer.previous}-day streak</Button>
          : <div className="mt-3 text-[13px]">Streak broke. Finish today's 3 meals + workout or steps to repair it.</div>)}
      </Card>

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
            const kind = st.days.get(d)
            const isLate = late.has(d) && kind !== 'shown'
            const mark = kind === 'rest' ? 'R' : kind === 'frozen' || kind === 'repaired' ? '❄' : null
            return (
              <button key={d} onClick={() => nav(`/day/${d}`)} disabled={future}
                aria-label={`${d}${kind === 'rest' ? ', rest day' : kind === 'frozen' ? ', freeze used' : kind === 'miss' ? ', missed' : a ? `, ${Math.round(a.score * 100)} percent complete` : ''}`}
                className="relative grid place-items-center gap-0.5 py-1 disabled:opacity-30">
                <FillCircle value={kind === 'rest' || kind === 'frozen' || kind === 'repaired' ? 0 : a?.score ?? 0} dim={!a || kind === 'rest' || isLate} size={30} onPaper>{Number(d.slice(-2))}</FillCircle>
                {mark && <span className="absolute right-0.5 top-0 text-[9px] font-bold" style={{ color: 'var(--paper-ink-dim)' }}>{mark}</span>}
                <span className="flex gap-[3px]">
                  <Dot on={a?.diet === 'complete'} />
                  <Dot on={a?.workout === 'complete'} />
                  <Dot on={a?.steps === 'complete'} />
                </span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[10px]" style={{ color: 'var(--paper-ink-dim)' }}>
          <span className="flex items-center gap-1"><Dot on /> Diet · Workout · Steps</span>
          <span>Fill = day completion</span>
          <span>R rest day</span>
          <span>❄ freeze</span>
          {[...late].some(d => monthDates.includes(d)) && <span>Faded = logged over a week late, not counted</span>}
          <span>Empty = missed</span>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Month average" value={`${Math.round(avg * 100)}%`} />
        <Stat label="Perfect days" value={perfect} />
        <Stat label="Days logged" value={loggedDays} />
      </div>
    </Screen>
  )
}

function Dot({ on }: { on?: boolean }) {
  return <span className="inline-block h-[4px] w-[4px] rounded-full"
    style={{ background: on ? 'var(--accent-strong)' : 'var(--paper-line)' }} />
}
