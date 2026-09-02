import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, AreaChart, Bar as RBar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useStore, useToday } from '../store'
import { daysBack, sumTotals, sessionVolume, trend, streak, bestStreak } from '../lib/calc'
import { adherenceFor, activeDates } from '../lib/derive'
import { Button, Card, Empty, Field, Screen, Sheet, Tabs } from '../ui'
import { uid } from '../lib/db'

const RANGES = { '7D': 7, '30D': 30, '3M': 90, '6M': 180, '1Y': 365 } as const
type Range = keyof typeof RANGES

export default function Progress() {
  const s = useStore()
  const today = useToday()
  const nav = useNavigate()
  const [range, setRange] = useState<Range>('30D')
  const [weightSheet, setWeightSheet] = useState(false)

  const dates = daysBack(RANGES[range], today)
  const src = { foodLogs: s.foodLogs, sessions: s.sessions, steps: s.steps, target: s.target, settings: s.settings }

  const series = useMemo(() => dates.map(d => {
    const logs = s.foodLogs.filter(l => l.date === d)
    const t = sumTotals(logs)
    const sess = s.sessions.find(x => x.date === d && x.finished_at)
    const adh = adherenceFor(src, d)
    return {
      date: d.slice(5),
      calories: Math.round(t.calories) || null,
      protein: Math.round(t.protein_g) || null,
      steps: s.steps.find(x => x.date === d)?.steps ?? null,
      weight: s.weights.find(x => x.date === d)?.weight_kg ?? null,
      volume: sess ? Math.round(sessionVolume(sess)) : null,
      adherence: Math.round(adh.score * 100),
      diet: adh.diet === 'complete' ? 100 : adh.diet === 'partial' ? 50 : 0,
      workout: adh.workout === 'complete' ? 100 : adh.workout === 'partial' ? 50 : 0,
    }
  }), [dates, s.foodLogs, s.sessions, s.steps, s.weights, s.target, s.settings])

  const weightPoints = trend(s.weights
    .filter(w => dates.includes(w.date))
    .sort((a, b) => a.date.localeCompare(b.date)))
  const all = activeDates(src)
  const curStreak = streak(all, today, d => adherenceFor(src, d).score >= 0.6)
  const best = bestStreak(all, d => adherenceFor(src, d).score >= 0.6)
  const perfect = bestStreak(all, d => adherenceFor(src, d).score >= 0.999)
  const dietStreak = streak(all, today, d => adherenceFor(src, d).diet === 'complete')
  const workoutStreak = streak(all, today, d => adherenceFor(src, d).workout !== 'incomplete')

  const trained = series.filter(x => x.volume != null).length
  const avgCal = avg(series.map(x => x.calories))
  const avgProtein = avg(series.map(x => x.protein))
  const avgSteps = avg(series.map(x => x.steps))
  const latestWeight = s.weights.sort((a, b) => a.date.localeCompare(b.date)).at(-1)

  return (
    <Screen title="Progress" sub="Analytics"
      right={<button onClick={() => setWeightSheet(true)} className="rounded-full border px-3 py-2 text-[12px] font-bold"
        style={{ borderColor: 'var(--line)' }}>Log weight</button>}>

      <Tabs value={range} onChange={setRange} options={(Object.keys(RANGES) as Range[]).map(r => ({ value: r, label: r }))} />

      <Card paper className="mt-3">
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Weight', latestWeight ? `${latestWeight.weight_kg} kg` : '—', s.goal ? `Target ${s.goal.target_weight_kg} kg` : ''],
            ['Avg calories', avgCal ? Math.round(avgCal).toLocaleString() : '—', 'kcal / day'],
            ['Avg protein', avgProtein ? `${Math.round(avgProtein)} g` : '—', 'per day'],
            ['Avg steps', avgSteps ? Math.round(avgSteps).toLocaleString() : '—', 'per day'],
          ].map(([label, value, sub]) => (
            <div key={label} className="paper-inset p-3">
              <div className="eyebrow">{label}</div>
              <div className="figure mt-1 text-[20px] leading-none">{value}</div>
              {sub && <div className="mt-1 text-[10px]" style={{ color: 'var(--paper-ink-dim)' }}>{sub}</div>}
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-3">
        <div className="eyebrow">Streaks</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div><div className="figure text-[22px]">{curStreak}</div><div className="eyebrow">Current</div></div>
          <div><div className="figure text-[22px]">{best}</div><div className="eyebrow">Best</div></div>
          <div><div className="figure text-[22px]">{perfect}</div><div className="eyebrow">Perfect</div></div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-center">
          <div className="raised p-2"><div className="figure text-[17px]">{dietStreak}</div><div className="eyebrow">Diet streak</div></div>
          <div className="raised p-2"><div className="figure text-[17px]">{workoutStreak}</div><div className="eyebrow">Workout streak</div></div>
        </div>
      </Card>

      <ChartCard title="Bodyweight">
        {weightPoints.length < 2 ? <Empty title="Not enough weight data" body="Log your weight to see the trend." />
          : (
            <ResponsiveContainer width="100%" height={170}>
              <LineChart data={weightPoints.map(p => ({ ...p, date: p.date.slice(5) }))} margin={{ left: -18, right: 6, top: 6 }}>
                <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
                <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={24} />
                <YAxis tick={tick} tickLine={false} axisLine={false} domain={['dataMin - 1', 'dataMax + 1']} width={38} />
                <Tooltip contentStyle={tooltip} />
                <Line dataKey="weight_kg" name="Measured" stroke="var(--accent)" dot={{ r: 2 }} strokeWidth={1} />
                <Line dataKey="trend" name="Trend" stroke="var(--accent-strong)" dot={false} strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
          )}
      </ChartCard>

      <ChartCard title="Calories">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={series} margin={{ left: -18, right: 6, top: 6 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
            <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={38} />
            <Tooltip contentStyle={tooltip} />
            <Area dataKey="calories" stroke="var(--accent)" fill="rgba(169,93,112,0.16)" strokeWidth={2} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Protein & steps">
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={series} margin={{ left: -18, right: 6, top: 6 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
            <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={38} />
            <Tooltip contentStyle={tooltip} />
            <Line dataKey="protein" stroke="var(--accent)" dot={false} strokeWidth={2} connectNulls />
            <Line dataKey="steps" stroke="var(--accent)" dot={false} strokeWidth={1.5} connectNulls yAxisId={0} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Adherence">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={series} margin={{ left: -18, right: 6, top: 6 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
            <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={38} domain={[0, 100]} />
            <Tooltip contentStyle={tooltip} />
            <RBar dataKey="adherence" fill="var(--accent-strong)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={`Training volume · ${trained} sessions`}>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={series} margin={{ left: -18, right: 6, top: 6 }}>
            <CartesianGrid stroke="var(--line)" vertical={false} strokeDasharray="2 4" />
            <XAxis dataKey="date" tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={tick} tickLine={false} axisLine={false} width={38} />
            <Tooltip contentStyle={tooltip} />
            <RBar dataKey="volume" fill="var(--accent)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="mt-3 grid gap-2">
        <Button variant="quiet" onClick={() => nav('/adherence')}>Monthly adherence calendar</Button>
      </div>

      <WeightSheet open={weightSheet} onClose={() => setWeightSheet(false)} date={today} />
    </Screen>
  )
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="mt-3">
      <div className="title mb-2 text-[17px]">{title}</div>
      {children}
    </Card>
  )
}

const tick = { fill: 'var(--text-mute)', fontSize: 10, fontFamily: 'var(--font-sans)' }
const tooltip = {
  background: 'var(--surface-high)', border: '1px solid var(--line)',
  borderRadius: 12, fontSize: 12, color: 'var(--text)',
}
function avg(xs: (number | null)[]) {
  const v = xs.filter((x): x is number => x != null)
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
}

export function WeightSheet({ open, onClose, date }: { open: boolean; onClose: () => void; date: string }) {
  const s = useStore()
  const existing = s.weights.find(w => w.date === date)
  const [v, setV] = useState(String(existing?.weight_kg ?? s.goal?.current_weight_kg ?? ''))
  const [d, setD] = useState(date)
  const row = s.weights.find(w => w.date === d)
  return (
    <Sheet open={open} onClose={onClose} title="Log bodyweight">
      <div className="grid gap-3">
        <Field label="Date"><input type="date" value={d} onChange={e => setD(e.target.value)} /></Field>
        <Field label="Weight (kg)">
          <input type="number" inputMode="decimal" step="0.1" min={25} max={400} value={v} onChange={e => setV(e.target.value)} />
        </Field>
        <Button onClick={async () => {
          const n = Number(v)
          if (!Number.isFinite(n) || n < 25 || n > 400) return
          await s.save('weight_logs', { id: row?.id ?? uid(), date: d, weight_kg: Math.round(n * 10) / 10 })
          if (s.goal) await s.save('goals', { ...s.goal, current_weight_kg: Math.round(n * 10) / 10, updated_at: new Date().toISOString() } as never)
          onClose()
        }}>Save weight</Button>
        {row && <Button variant="danger" onClick={async () => { await s.del('weight_logs', row.id); onClose() }}>Delete entry</Button>}
        {s.weights.length > 0 && (
          <div className="max-h-[30vh] overflow-y-auto">
            <div className="eyebrow mb-1">History</div>
            {[...s.weights].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map(w => (
              <div key={w.id} className="flex justify-between border-b py-1.5 text-[12px]" style={{ borderColor: 'var(--line)' }}>
                <span>{w.date}</span><span className="font-bold">{w.weight_kg} kg</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Sheet>
  )
}
