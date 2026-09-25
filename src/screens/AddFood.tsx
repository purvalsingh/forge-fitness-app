import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { uid } from '../lib/db'
import { scaleFood, round1, addDays, today as todayISO } from '../lib/calc'
import { ai, AIUnavailable } from '../lib/ai'
import { Button, Card, Field, Icon, Notice, Sheet, Spinner, Tabs } from '../ui'
import {
  byRegion, groundItem, loadCatalog, REGIONS, searchFoods, servingGrams, toFoodRow,
  type CatalogFood, type Grounded,
} from '../lib/catalog'
import { barcodeSupported, lookupBarcode } from '../lib/barcode'
import type { Food, FoodLog, Unit } from '../lib/types'

const UNITS: Unit[] = ['g', 'ml', 'serving', 'piece', 'slice', 'cup', 'tbsp', 'tsp', 'scoop']

type Tab = 'search' | 'describe' | 'barcode' | 'recipes' | 'custom'
type AnyFood = CatalogFood | Food

export function AddFoodSheet({ open, onClose, date, mealTypeId, initialTab = 'search' }: {
  open: boolean; onClose: () => void; date: string; mealTypeId: string; initialTab?: Tab
}) {
  const [tab, setTab] = useState<Tab>(initialTab)
  const [target, setTarget] = useState({ date, mealTypeId })
  useEffect(() => { if (open) { setTarget({ date, mealTypeId }); setTab(initialTab) } }, [open, date, mealTypeId, initialTab])
  return (
    <Sheet open={open} onClose={onClose} title="Add food">
      <LogTarget value={target} onChange={setTarget} />
      <div className="mt-3">
        <Tabs value={tab} onChange={setTab} options={[
          { value: 'search', label: 'Search' },
          { value: 'describe', label: 'AI describe' },
          { value: 'barcode', label: 'Barcode' },
          { value: 'recipes', label: 'Quick meals' },
          { value: 'custom', label: 'Custom' },
        ]} />
      </div>
      <div className="mt-3">
        {tab === 'search' && <SearchTab {...target} onDone={onClose} />}
        {tab === 'describe' && <DescribeTab {...target} onDone={onClose} />}
        {tab === 'barcode' && <BarcodeTab {...target} onDone={onClose} />}
        {tab === 'recipes' && <RecipeTab {...target} onDone={onClose} />}
        {tab === 'custom' && <CustomTab {...target} onDone={onClose} />}
      </div>
    </Sheet>
  )
}

/**
 * Which meal and which day an entry goes to. "Yesterday" is one tap — the gym-after-midnight case —
 * and any earlier date is available from the date field.
 */
export function LogTarget({ value, onChange }: {
  value: { date: string; mealTypeId: string }; onChange: (v: { date: string; mealTypeId: string }) => void
}) {
  const s = useStore()
  const t = todayISO()
  const y = addDays(t, -1)
  return (
    <div className="grid gap-2">
      <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {s.mealTypes.map(m => (
          <button key={m.id} className="chip press shrink-0" aria-pressed={value.mealTypeId === m.id}
            onClick={() => onChange({ ...value, mealTypeId: m.id })}>{m.name}</button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button className="chip press" aria-pressed={value.date === t} onClick={() => onChange({ ...value, date: t })}>Today</button>
        <button className="chip press" aria-pressed={value.date === y} onClick={() => onChange({ ...value, date: y })}>Yesterday</button>
        <label className="chip press relative" aria-pressed={value.date !== t && value.date !== y}>
          <Icon name="calendar" size={14} />
          {value.date !== t && value.date !== y ? value.date : 'Other day'}
          <input type="date" max={t} value={value.date} aria-label="Log date"
            onChange={e => e.target.value && onChange({ ...value, date: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0" />
        </label>
      </div>
    </div>
  )
}

function useCatalog() {
  const [catalog, setCatalog] = useState<CatalogFood[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => { loadCatalog().then(setCatalog).catch(() => setError(true)) }, [])
  return { catalog, error }
}

async function logFood(s: ReturnType<typeof useStore>, f: AnyFood, grams: number, date: string, mealTypeId: string,
  source: FoodLog['source'], label?: string) {
  // A catalog food used for the first time is copied into the user's own foods, so recipes and
  // history can reference it later.
  if (!s.foods.some(x => x.id === f.id)) void s.save('foods', toFoodRow(f) as never).catch(() => {})
  const n = scaleFood(f, grams)
  await s.save('food_logs', {
    id: uid(), date, meal_type_id: mealTypeId, food_id: f.id, name: f.name,
    qty: round1(grams), unit: normUnit(f.unit), source, serving_label: label,
    calories: n.calories, protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g,
  } as never)
}

function SearchTab({ date, mealTypeId, onDone }: { date: string; mealTypeId: string; onDone: () => void }) {
  const s = useStore()
  const [q, setQ] = useState('')
  const [region, setRegion] = useState<string | null>(null)
  const [picked, setPicked] = useState<AnyFood | null>(null)
  const { catalog, error } = useCatalog()

  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: Food[] = []
    for (const l of [...s.foodLogs].sort((a, b) => b.date.localeCompare(a.date))) {
      const f = s.foods.find(x => x.id === l.food_id)
      if (!f || seen.has(f.id)) continue
      seen.add(f.id); out.push(f)
      if (out.length >= 10) break
    }
    return out
  }, [s.foodLogs, s.foods])

  const results = useMemo(() => {
    if (region && catalog && !q.trim()) return byRegion(catalog, region)
    if (!q.trim()) return []
    const mine = s.foods.filter(f => f.custom && f.name.toLowerCase().includes(q.trim().toLowerCase()))
    const fromCatalog = catalog ? searchFoods(catalog, q, 60) : []
    const seen = new Set(mine.map(f => f.name.toLowerCase()))
    return [...mine, ...fromCatalog.filter(f => !seen.has(f.name.toLowerCase()))].slice(0, 60)
  }, [q, region, s.foods, catalog])

  if (picked) {
    return <PortionPicker food={picked} onBack={() => setPicked(null)} onAdd={async (grams, label) => {
      await logFood(s, picked, grams, date, mealTypeId, 'search', label); onDone()
    }} />
  }

  return (
    <div className="grid gap-3">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-mute)' }}>
          <Icon name="search" size={18} />
        </span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Vada pav, dal makhani, paneer…"
          aria-label="Search foods" style={{ paddingLeft: 38 }} />
      </div>
      {!catalog && !error && <Spinner label="Loading 16,000 foods" />}
      {error && <Notice tone="warn">Could not load the food database. Your own foods still work.</Notice>}

      {!q.trim() && (
        <>
          {recent.length > 0 && !region && (
            <div>
              <div className="eyebrow mb-2">Recent</div>
              <div className="grid gap-2">{recent.map(f => <FoodRow key={f.id} f={f} onPick={setPicked} />)}</div>
            </div>
          )}
          <div>
            <div className="eyebrow mb-2">Browse by state</div>
            <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {REGIONS.map(r => (
                <button key={r} className="chip press shrink-0" aria-pressed={region === r}
                  onClick={() => setRegion(region === r ? null : r)}>{r}</button>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="grid max-h-[44vh] gap-2 overflow-y-auto overscroll-contain">
        {catalog && q.trim() && results.length === 0 && (
          <div className="text-[13px]" style={{ color: 'var(--text-mute)' }}>No matches. Try “AI describe”, or add it under “Custom”.</div>
        )}
        {results.map(f => <FoodRow key={f.id} f={f} onPick={setPicked} />)}
      </div>
    </div>
  )
}

function FoodRow({ f, onPick }: { f: AnyFood; onPick: (f: AnyFood) => void }) {
  const g = servingGrams(f as CatalogFood)
  const c = f as CatalogFood
  const perServing = g ? scaleFood(f, g) : null
  return (
    <button onClick={() => onPick(f)} className="cv raised press flex items-center justify-between gap-2 p-3 text-left">
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">{f.name}</span>
        <span className="mono block text-[11px]" style={{ color: 'var(--text-mute)' }}>
          {perServing
            ? `${Math.round(perServing.calories)} kcal · ${c.serving_label ?? '1 serving'} (${g} g) · P${Math.round(perServing.protein_g)}`
            : `${Math.round(f.calories)} kcal / ${f.base}${unitShort(f.unit)} · P${round1(f.protein_g)}`}
        </span>
      </span>
      <span className="mono shrink-0 text-[10px] uppercase" style={{ color: 'var(--accent)' }}>
        {f.custom ? 'Mine' : c.state ? c.state.split(' ').map(w => w[0]).join('') : f.category === 'Dish' ? 'Dish' : ''}
      </span>
    </button>
  )
}

/**
 * Quantity in the unit people think in. A dish with a known serving defaults to "1 piece / 1 plate",
 * with the gram weight shown alongside; grams remain one tap away.
 */
export function PortionPicker({ food, onAdd, onBack }: {
  food: AnyFood; onAdd: (grams: number, label?: string) => Promise<void>; onBack: () => void
}) {
  const g = servingGrams(food as CatalogFood)
  const label = (food as CatalogFood).serving_label ?? '1 serving'
  const [mode, setMode] = useState<'serving' | 'grams'>(g ? 'serving' : 'grams')
  const [servings, setServings] = useState(1)
  const [grams, setGrams] = useState(String(g ?? food.base))
  const [busy, setBusy] = useState(false)
  const total = mode === 'serving' && g ? g * servings : Number(grams) || 0
  const n = scaleFood(food, total)
  const labelFor = (x: number) => {
    const m = label.match(/^(\d+(?:\.\d+)?)\s+(.*)$/)
    return m ? `${round1(Number(m[1]) * x)} ${m[2]}` : `${x} × ${label}`
  }
  const unit: string = food.unit === '100ml' || food.unit === 'ml' ? 'ml' : food.unit === '100g' || food.unit === 'g' ? 'g' : food.unit
  const quick = unit === 'g' || unit === 'ml' ? [50, 100, 150, 200, 250] : [0.5, 1, 2, 3]

  return (
    <div className="grid gap-3">
      <div>
        <div className="text-[17px] font-bold">{food.name}</div>
        <div className="mono text-[11px]" style={{ color: 'var(--text-mute)' }}>
          {(food as CatalogFood).state ? `${(food as CatalogFood).state} · ` : ''}
          {(food as CatalogFood).src === 'composed' ? 'computed from ingredients' : (food as CatalogFood).src === 'indb' ? 'Indian Nutrient Databank' : food.brand ?? ''}
        </div>
      </div>
      {g && (
        <div className="flex gap-2">
          <button className="chip press" aria-pressed={mode === 'serving'} onClick={() => setMode('serving')}>Servings</button>
          <button className="chip press" aria-pressed={mode === 'grams'} onClick={() => setMode('grams')}>{unit === 'ml' ? 'Millilitres' : unit === 'g' ? 'Grams' : unit}</button>
        </div>
      )}
      {mode === 'serving' && g ? (
        <div className="raised flex items-center justify-between p-2">
          <button aria-label="Less" className="press grid h-12 w-12 place-items-center rounded-xl text-[22px] font-bold"
            style={{ background: 'var(--surface-high)' }} onClick={() => setServings(v => Math.max(0.5, round1(v - 0.5)))}>−</button>
          <div className="text-center">
            <div className="figure text-[24px]">{labelFor(servings)}</div>
            <div className="mono text-[11px]" style={{ color: 'var(--text-mute)' }}>≈ {Math.round(g * servings)} {unit}</div>
          </div>
          <button aria-label="More" className="press grid h-12 w-12 place-items-center rounded-xl text-[22px] font-bold"
            style={{ background: 'var(--surface-high)' }} onClick={() => setServings(v => Math.min(20, round1(v + 0.5)))}>+</button>
        </div>
      ) : (
        <>
          <Field label={`Amount (${unit})`}>
            <input type="number" inputMode="decimal" min={0} value={grams} onChange={e => setGrams(e.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            {quick.map(v => (
              <button key={v} className="chip press" onClick={() => setGrams(String(v))}>{v} {unit}</button>
            ))}
          </div>
        </>
      )}
      <MacroRow n={n} />
      <Button disabled={busy || total <= 0 || total > 5000} onClick={async () => {
        setBusy(true)
        try { await onAdd(round1(total), mode === 'serving' && g ? labelFor(servings) : undefined) } finally { setBusy(false) }
      }}>{busy ? 'Adding…' : 'Add to meal'}</Button>
      <Button variant="ghost" onClick={onBack}>Back</Button>
    </div>
  )
}

function RecipeTab({ date, mealTypeId, onDone }: { date: string; mealTypeId: string; onDone: () => void }) {
  const s = useStore()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const logged = s.foodLogs.filter(l => l.date === date && l.meal_type_id === mealTypeId)
  const yesterday = s.foodLogs.filter(l => l.date === addDays(date, -1) && l.meal_type_id === mealTypeId)
  return (
    <div className="grid max-h-[56vh] gap-2 overflow-y-auto">
      {yesterday.length > 0 && (
        <Button variant="quiet" disabled={busy === 'copy'} onClick={async () => {
          setBusy('copy')
          for (const l of yesterday) await s.save('food_logs', { ...l, id: uid(), date, source: 'copy' } as never)
          setBusy(null); onDone()
        }}>Copy this meal from the day before ({yesterday.length} items)</Button>
      )}
      <Button variant="quiet" onClick={() => nav('/more/recipes?new=1')}>+ New quick meal</Button>
      {logged.length > 0 && (
        <Button variant="ghost" onClick={async () => {
          // Turn what is already on this meal into a reusable quick meal.
          const ingredients: { food_id: string; qty: number }[] = []
          for (const l of logged) {
            let foodId = l.food_id
            if (!foodId || !s.foods.some(f => f.id === foodId)) {
              foodId = uid()
              await s.save('foods', {
                id: foodId, name: l.name, unit: l.unit, base: l.qty,
                calories: l.calories, protein_g: l.protein_g, carbs_g: l.carbs_g, fat_g: l.fat_g,
                custom: true, category: 'Custom',
              } as never)
            }
            ingredients.push({ food_id: foodId, qty: l.qty })
          }
          const mealName = s.mealTypes.find(m => m.id === mealTypeId)?.name ?? 'Meal'
          await s.save('recipes', { id: uid(), name: `${mealName} — ${date}`, ingredients } as never)
          onDone()
        }}>Save this meal as a quick meal</Button>
      )}
      {s.recipes.length === 0 && <div className="text-[13px]" style={{ color: 'var(--text-mute)' }}>No saved quick meals yet.</div>}
      {s.recipes.map(r => {
        const parts = r.ingredients.map(i => {
          const f = s.foods.find(x => x.id === i.food_id)
          return f ? { f, qty: i.qty, n: scaleFood(f, i.qty) } : null
        }).filter(Boolean) as { f: Food; qty: number; n: ReturnType<typeof scaleFood> }[]
        const tot = parts.reduce((a, p) => ({
          calories: a.calories + p.n.calories, protein_g: a.protein_g + p.n.protein_g,
          carbs_g: a.carbs_g + p.n.carbs_g, fat_g: a.fat_g + p.n.fat_g,
        }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
        return (
          <Card key={r.id}>
            <div className="flex items-center justify-between">
              <div className="text-[15px] font-bold">{r.name}</div>
              <div className="mono text-[12px] font-bold">{Math.round(tot.calories)} kcal</div>
            </div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--text-mute)' }}>
              {parts.map(p => `${p.f.name} ${p.qty}${unitShort(p.f.unit)}`).join(' · ')}
            </div>
            <div className="mono mt-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
              P {round1(tot.protein_g)}g · C {round1(tot.carbs_g)}g · F {round1(tot.fat_g)}g
            </div>
            <div className="mt-3">
              <Button disabled={busy === r.id} onClick={async () => {
                setBusy(r.id)
                for (const p of parts) {
                  await s.save('food_logs', {
                    id: uid(), date, meal_type_id: mealTypeId, food_id: p.f.id, name: p.f.name,
                    qty: p.qty, unit: normUnit(p.f.unit), source: 'recipe',
                    calories: p.n.calories, protein_g: p.n.protein_g, carbs_g: p.n.carbs_g, fat_g: p.n.fat_g,
                  } as never)
                }
                setBusy(null); onDone()
              }}>{busy === r.id ? 'Adding…' : 'Add all'}</Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function DescribeTab({ date, mealTypeId, onDone }: { date: string; mealTypeId: string; onDone: () => void }) {
  const [text, setText] = useState('')
  const [items, setItems] = useState<Grounded[] | null>(null)
  const [rejected, setRejected] = useState<{ name: string; reason: string }[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { catalog } = useCatalog()

  if (items) return <ReviewItems items={items} rejected={rejected} date={date} mealTypeId={mealTypeId} source="ai_text"
    onCancel={() => setItems(null)} onDone={onDone} />

  return (
    <div className="grid gap-3">
      <Field label="What did you eat?" hint="Say it like you'd tell a friend: “2 roti, dal tadka and a vada pav”. No quantity = one normal serving.">
        <textarea rows={3} maxLength={500} value={text} onChange={e => setText(e.target.value)} placeholder="2 roti, 1 katori dal tadka, 1 vada pav" />
      </Field>
      {err && <Notice tone="error">{err}</Notice>}
      {busy ? <Spinner label="Reading your meal" /> : (
        <Button disabled={text.trim().length < 2} onClick={async () => {
          setBusy(true); setErr(null)
          try {
            const out = await ai.parseFoodText(text)
            if (out.items.length === 0) setErr('No foods recognised. Name the foods, or use Search.')
            else { setItems(catalog ? out.items.map(i => groundItem(catalog, i)) : out.items); setRejected(out.rejected ?? []) }
          } catch (e) { setErr(e instanceof AIUnavailable ? e.message : 'Could not analyse that. Enter it manually.') }
          finally { setBusy(false) }
        }}>Analyse with AI</Button>
      )}
    </div>
  )
}

function BarcodeTab({ date, mealTypeId, onDone }: { date: string; mealTypeId: string; onDone: () => void }) {
  const s = useStore()
  const [code, setCode] = useState('')
  const [food, setFood] = useState<Food | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const video = useRef<HTMLVideoElement>(null)

  async function find(c: string) {
    setBusy(true); setErr(null)
    try {
      const f = await lookupBarcode(c)
      if (f) setFood(f); else setErr('Product not found in Open Food Facts. Add it under “Custom”.')
    } catch { setErr('Lookup failed. Check your connection.') } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!scanning) return
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } })
        if (!video.current) return
        video.current.srcObject = stream
        await video.current.play()
        // @ts-expect-error BarcodeDetector is not in the DOM lib yet
        const det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] })
        const tick = async () => {
          if (stopped || !video.current) return
          try {
            const hits = await det.detect(video.current)
            if (hits[0]?.rawValue) { setScanning(false); setCode(hits[0].rawValue); void find(hits[0].rawValue); return }
          } catch { /* frame not ready */ }
          raf = requestAnimationFrame(() => void tick())
        }
        void tick()
      } catch { setErr('Camera unavailable. Type the barcode number instead.'); setScanning(false) }
    })()
    return () => { stopped = true; cancelAnimationFrame(raf); stream?.getTracks().forEach(t => t.stop()) }
  }, [scanning])

  if (food) return <PortionPicker food={food} onBack={() => setFood(null)} onAdd={async (grams, label) => {
    await logFood(s, food, grams, date, mealTypeId, 'barcode', label); onDone()
  }} />

  return (
    <div className="grid gap-3">
      {scanning && (
        <div className="relative overflow-hidden rounded-2xl" style={{ background: '#000' }}>
          <video ref={video} playsInline muted className="aspect-[4/3] w-full object-cover" />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2" style={{ background: 'var(--accent)', boxShadow: '0 0 12px var(--accent)' }} />
        </div>
      )}
      {barcodeSupported
        ? <Button variant={scanning ? 'ghost' : 'primary'} onClick={() => setScanning(v => !v)}>{scanning ? 'Stop camera' : 'Scan barcode'}</Button>
        : <Notice>Live scanning isn't available on this device — type the number under the barcode.</Notice>}
      <Field label="Barcode number">
        <input inputMode="numeric" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} placeholder="8901234567890" />
      </Field>
      {err && <Notice tone="error">{err}</Notice>}
      <Button variant="quiet" disabled={busy || code.length < 8} onClick={() => find(code)}>{busy ? 'Looking up…' : 'Look up'}</Button>
    </div>
  )
}

export function ReviewItems({ items, rejected = [], date, mealTypeId, source, onCancel, onDone }: {
  items: Grounded[]; rejected?: { name: string; reason: string }[]; date: string; mealTypeId: string
  source: FoodLog['source']; onCancel: () => void; onDone: () => void
}) {
  const s = useStore()
  const [rows, setRows] = useState(items.map(i => ({ ...i, factor: 1 })))
  const [edit, setEdit] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [target, setTarget] = useState({ date, mealTypeId })
  const eff = rows.map(r => ({
    ...r, calories: r.calories * r.factor, protein_g: r.protein_g * r.factor, carbs_g: r.carbs_g * r.factor, fat_g: r.fat_g * r.factor,
  }))
  const tot = eff.reduce((a, r) => ({
    calories: a.calories + r.calories, protein_g: a.protein_g + r.protein_g, carbs_g: a.carbs_g + r.carbs_g, fat_g: a.fat_g + r.fat_g,
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
  const patch = (i: number, p: Partial<(typeof rows)[number]>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...p } : r))

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <div className="text-[17px] font-bold">We found {rows.length} item{rows.length === 1 ? '' : 's'}</div>
        <span className="chip">AI estimate</span>
      </div>
      {rejected.length > 0 && (
        <Notice tone="error">Skipped: {rejected.map(r => `${r.name} — ${r.reason}`).join('; ')}</Notice>
      )}
      <Notice tone="warn">Portions are estimated — adjust with − / + before logging.</Notice>
      <div className="grid max-h-[40vh] gap-2 overflow-y-auto overscroll-contain">
        {eff.map((r, i) => (
          <div key={i} className="raised p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">{r.name}</div>
                <div className="mono text-[11px]" style={{ color: 'var(--text-mute)' }}>
                  {r.serving_label ?? `${r.qty} ${r.unit}`}{r.grams ? ` ≈ ${Math.round(r.grams * r.factor)} g` : ''}
                  {r.matched ? ' · matched FORGE database' : ''}
                  {typeof r.confidence === 'number' ? ` · ${Math.round(r.confidence * 100)}% sure` : ''}
                </div>
              </div>
              <button aria-label={`Remove ${r.name}`} onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                className="press shrink-0 p-1" style={{ color: 'var(--danger)' }}><Icon name="trash" size={18} /></button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button aria-label="Smaller portion" className="press grid h-9 w-9 place-items-center rounded-lg font-bold" style={{ background: 'var(--surface-high)' }}
                  onClick={() => patch(i, { factor: Math.max(0.25, round1(rows[i].factor - 0.25)) })}>−</button>
                <span className="mono w-14 text-center text-[13px] font-bold">×{rows[i].factor}</span>
                <button aria-label="Bigger portion" className="press grid h-9 w-9 place-items-center rounded-lg font-bold" style={{ background: 'var(--surface-high)' }}
                  onClick={() => patch(i, { factor: Math.min(10, round1(rows[i].factor + 0.25)) })}>+</button>
              </div>
              <div className="mono text-right text-[12px]">
                <b>{Math.round(r.calories)} kcal</b>
                <div style={{ color: 'var(--text-mute)' }}>
                  <span style={{ color: 'var(--protein)' }}>P {round1(r.protein_g)}</span> · C {round1(r.carbs_g)} · F {round1(r.fat_g)}
                </div>
              </div>
            </div>
            <button className="mt-1 text-[11px] underline" style={{ color: 'var(--text-mute)' }} onClick={() => setEdit(edit === i ? null : i)}>
              {edit === i ? 'Done editing' : 'Edit name & numbers'}
            </button>
            {edit === i && (
              <div className="mt-2 grid gap-2">
                <input value={rows[i].name} onChange={e => patch(i, { name: e.target.value, matched: undefined })} aria-label="Food name" />
                <div className="grid grid-cols-4 gap-2">
                  {(['calories', 'protein_g', 'carbs_g', 'fat_g'] as const).map(k => (
                    <Field key={k} label={k === 'calories' ? 'kcal' : k[0].toUpperCase()}>
                      <input type="number" inputMode="decimal" min={0} value={rows[i][k]}
                        onChange={e => patch(i, { [k]: Math.max(0, Number(e.target.value) || 0) } as never)} />
                    </Field>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="raised mono flex items-center justify-between p-3 text-[12px]">
        <span>Total</span>
        <span><b className="text-[15px]">{Math.round(tot.calories)} kcal</b> · P {round1(tot.protein_g)} · C {round1(tot.carbs_g)} · F {round1(tot.fat_g)}</span>
      </div>
      <LogTarget value={target} onChange={setTarget} />
      <Button disabled={busy || rows.length === 0} onClick={async () => {
        setBusy(true)
        try {
          for (const r of eff) {
            await s.save('food_logs', {
              id: uid(), date: target.date, meal_type_id: target.mealTypeId, name: r.name.slice(0, 80),
              qty: round1(r.grams ? r.grams * r.factor : r.qty * r.factor), unit: r.grams ? 'g' : normUnit(r.unit as Unit),
              serving_label: r.serving_label, source, food_id: r.matched?.id,
              calories: round1(r.calories), protein_g: round1(r.protein_g), carbs_g: round1(r.carbs_g), fat_g: round1(r.fat_g),
            } as never)
          }
          onDone()
        } finally { setBusy(false) }
      }}>{busy ? 'Saving…' : `Log ${rows.length} item${rows.length === 1 ? '' : 's'}`}</Button>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  )
}

function CustomTab({ date, mealTypeId, onDone }: { date: string; mealTypeId: string; onDone: () => void }) {
  const s = useStore()
  const [f, setF] = useState({ name: '', brand: '', unit: 'g' as Unit, base: 100, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
  const [saveToDb, setSaveToDb] = useState(true)
  const set = (p: Partial<typeof f>) => setF(v => ({ ...v, ...p }))
  const macroKcal = 4 * f.protein_g + 4 * f.carbs_g + 9 * f.fat_g
  const mismatch = f.calories > 0 && Math.abs(macroKcal - f.calories) > Math.max(30, f.calories * 0.3)

  return (
    <div className="grid gap-3">
      <Field label="Name"><input value={f.name} maxLength={80} onChange={e => set({ name: e.target.value })} placeholder="Mom's rajma" /></Field>
      <Field label="Brand (optional)"><input value={f.brand} maxLength={40} onChange={e => set({ brand: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Per amount"><input type="number" min={0} value={f.base} onChange={e => set({ base: Number(e.target.value) })} /></Field>
        <Field label="Unit">
          <select value={f.unit} onChange={e => set({ unit: e.target.value as Unit })}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Field label="kcal"><input type="number" min={0} value={f.calories} onChange={e => set({ calories: Number(e.target.value) })} /></Field>
        <Field label="P"><input type="number" min={0} value={f.protein_g} onChange={e => set({ protein_g: Number(e.target.value) })} /></Field>
        <Field label="C"><input type="number" min={0} value={f.carbs_g} onChange={e => set({ carbs_g: Number(e.target.value) })} /></Field>
        <Field label="F"><input type="number" min={0} value={f.fat_g} onChange={e => set({ fat_g: Number(e.target.value) })} /></Field>
      </div>
      {mismatch && <Notice tone="warn">Macros add up to {Math.round(macroKcal)} kcal, not {f.calories}. Double-check the label.</Notice>}
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={saveToDb} onChange={e => setSaveToDb(e.target.checked)} />
        Save to my foods
      </label>
      <Button disabled={!f.name.trim() || f.base <= 0 || f.calories < 0 || f.calories > 5000} onClick={async () => {
        const foodId = uid()
        if (saveToDb) await s.save('foods', { ...f, id: foodId, custom: true, category: 'Custom' } as never)
        await s.save('food_logs', {
          id: uid(), date, meal_type_id: mealTypeId, food_id: saveToDb ? foodId : undefined, name: f.name,
          qty: f.base, unit: normUnit(f.unit), source: 'manual',
          calories: f.calories, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g,
        } as never)
        onDone()
      }}>Add to meal</Button>
    </div>
  )
}

function MacroRow({ n }: { n: { calories: number; protein_g: number; carbs_g: number; fat_g: number } }) {
  const cells: [string, number, string][] = [
    ['kcal', n.calories, 'var(--text)'], ['Protein', n.protein_g, 'var(--protein)'],
    ['Carbs', n.carbs_g, 'var(--carbs)'], ['Fat', n.fat_g, 'var(--fat)'],
  ]
  return (
    <div className="raised grid grid-cols-4 gap-2 p-3 text-center">
      {cells.map(([k, v, c]) => (
        <div key={k}>
          <div className="eyebrow">{k}</div>
          <div className="figure text-[17px]" style={{ color: c }}>{k === 'kcal' ? Math.round(v) : round1(v)}</div>
        </div>
      ))}
    </div>
  )
}

export function normUnit(u: Unit | string): Unit {
  if (u === '100g') return 'g'
  if (u === '100ml') return 'ml'
  const known: string[] = [...UNITS]
  return (known.includes(String(u)) ? u : 'g') as Unit
}
export function unitShort(u: Unit) { return u === '100g' ? 'g' : u === '100ml' ? 'ml' : ` ${u}` }
