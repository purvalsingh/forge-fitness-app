import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { uid } from '../lib/db'
import { scaleFood, round1 } from '../lib/calc'
import { ai, AIUnavailable, type ParsedFood } from '../lib/ai'
import { Button, Card, Field, Notice, Sheet, Spinner, Tabs } from '../ui'
import { loadCatalog, searchFoods, type CatalogFood } from '../lib/catalog'
import type { Food, FoodLog, Unit } from '../lib/types'

const UNITS: Unit[] = ['g', 'ml', 'serving', 'piece', 'slice', 'cup', 'tbsp', 'tsp', 'scoop']

type Tab = 'search' | 'recipes' | 'describe' | 'custom'

export function AddFoodSheet({ open, onClose, date, mealTypeId }: {
  open: boolean; onClose: () => void; date: string; mealTypeId: string
}) {
  const [tab, setTab] = useState<Tab>('search')
  return (
    <Sheet open={open} onClose={onClose} title="Add food">
      <Tabs value={tab} onChange={setTab} options={[
        { value: 'search', label: 'Search' },
        { value: 'recipes', label: 'Quick meals' },
        { value: 'describe', label: 'AI describe' },
        { value: 'custom', label: 'Custom' },
      ]} />
      <div className="mt-3">
        {tab === 'search' && <SearchTab date={date} mealTypeId={mealTypeId} onDone={onClose} />}
        {tab === 'recipes' && <RecipeTab date={date} mealTypeId={mealTypeId} onDone={onClose} />}
        {tab === 'describe' && <DescribeTab date={date} mealTypeId={mealTypeId} onDone={onClose} />}
        {tab === 'custom' && <CustomTab date={date} mealTypeId={mealTypeId} onDone={onClose} />}
      </div>
    </Sheet>
  )
}

function SearchTab({ date, mealTypeId, onDone }: { date: string; mealTypeId: string; onDone: () => void }) {
  const s = useStore()
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<CatalogFood | Food | null>(null)
  const [qty, setQty] = useState('100')
  const [catalog, setCatalog] = useState<CatalogFood[] | null>(null)
  const [catalogError, setCatalogError] = useState(false)

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => setCatalogError(true))
  }, [])

  const results = useMemo(() => {
    const mine = s.foods.filter(f => !q.trim() || f.name.toLowerCase().includes(q.trim().toLowerCase()))
    const fromCatalog = catalog ? searchFoods(catalog, q, 60) : []
    const seen = new Set(mine.map(f => f.name.toLowerCase()))
    return [...mine, ...fromCatalog.filter(f => !seen.has(f.name.toLowerCase()))].slice(0, 60)
  }, [q, s.foods, catalog])

  if (picked) {
    const serving = 'serving_g' in picked ? picked.serving_g : undefined
    const n = scaleFood(picked, Number(qty) || 0)
    return (
      <div className="grid gap-3">
        <div>
          <div className="text-[16px] font-extrabold">{picked.name}</div>
          <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
            {picked.calories} kcal per {picked.base} {picked.unit === '100g' ? 'g' : picked.unit === '100ml' ? 'ml' : picked.unit}
            {'src' in picked && picked.src === 'composed' ? ' · estimate, computed from ingredients' : ''}
          </div>
        </div>
        <Field label={`Quantity (${unitLabel(picked.unit)})`}>
          <input type="number" inputMode="decimal" min={0} value={qty} onChange={e => setQty(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          {(serving ? [serving, serving / 2, 100] : [50, 100, 150, 200, 250]).map(v => (
            <button key={v} onClick={() => setQty(String(Math.round(v)))}
              className="min-h-[38px] rounded-xl border px-3 text-[12px] font-bold" style={{ borderColor: 'var(--line)' }}>
              {serving && v === serving ? '1 serving' : serving && v === serving / 2 ? '½ serving' : `${Math.round(v)} g`}
            </button>
          ))}
        </div>
        <MacroRow n={n} />
        <Button onClick={async () => {
          const q2 = Number(qty)
          if (!Number.isFinite(q2) || q2 <= 0) return
          // A catalog food used for the first time is copied into the user's own foods,
          // so recipes and history can reference it later.
          if (!s.foods.some(f => f.id === picked.id)) {
            const { ...food } = picked as Food
            await s.save('foods', { ...food, custom: false } as never)
          }
          await s.save('food_logs', {
            id: uid(), date, meal_type_id: mealTypeId, food_id: picked.id, name: picked.name,
            qty: q2, unit: normUnit(picked.unit), source: 'search',
            calories: n.calories, protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g,
          } as never)
          onDone()
        }}>Add to meal</Button>
        <Button variant="ghost" onClick={() => setPicked(null)}>Back to search</Button>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search 13,000+ foods and dishes" aria-label="Search foods" />
      {!catalog && !catalogError && <Spinner label="Loading food database" />}
      {catalogError && <Notice tone="warn">Could not load the full food database. Your own foods are still searchable.</Notice>}
      <div className="grid max-h-[46vh] gap-2 overflow-y-auto">
        {catalog && results.length === 0 && (
          <div className="text-[13px]" style={{ color: 'var(--text-mute)' }}>No matches. Create it under “Custom”.</div>
        )}
        {results.map(f => (
          <button key={f.id} onClick={() => { setPicked(f); setQty(String(('serving_g' in f && f.serving_g) || f.base)) }}
            className="raised flex items-center justify-between gap-2 p-3 text-left">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold">{f.name}</span>
              <span className="block text-[11px]" style={{ color: 'var(--text-mute)' }}>
                {f.calories} kcal / {f.base}{unitLabel(f.unit)} · P{f.protein_g} C{f.carbs_g} F{f.fat_g}
              </span>
            </span>
            <span className="shrink-0 text-[11px]" style={{ color: 'var(--accent)' }}>
              {f.custom ? 'Mine' : f.category === 'Dish' ? 'Dish' : f.category}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function unitLabel(u: Unit) { return u === '100g' ? 'g' : u === '100ml' ? 'ml' : ` ${u}` }

function RecipeTab({ date, mealTypeId, onDone }: { date: string; mealTypeId: string; onDone: () => void }) {
  const s = useStore()
  const nav = useNavigate()
  const [busy, setBusy] = useState<string | null>(null)
  const logged = s.foodLogs.filter(l => l.date === date && l.meal_type_id === mealTypeId)
  return (
    <div className="grid max-h-[60vh] gap-2 overflow-y-auto">
      <div className="grid gap-2">
        <Button variant="quiet" onClick={() => nav('/more/recipes?new=1')}>+ New quick meal</Button>
        {logged.length > 0 && (
          <Button variant="ghost" onClick={async () => {
            // Turn what is already on this meal into a reusable quick meal.
            const ingredients: { food_id: string; qty: number }[] = []
            for (const l of logged) {
              let foodId = l.food_id
              if (!foodId || !s.foods.some(f => f.id === foodId)) {
                foodId = uid()
                const factor = l.qty || 1
                await s.save('foods', {
                  id: foodId, name: l.name, unit: l.unit, base: l.qty,
                  calories: l.calories, protein_g: l.protein_g, carbs_g: l.carbs_g, fat_g: l.fat_g,
                  custom: true, category: 'Custom',
                } as never)
                void factor
              }
              ingredients.push({ food_id: foodId, qty: l.qty })
            }
            const mealName = s.mealTypes.find(m => m.id === mealTypeId)?.name ?? 'Meal'
            await s.save('recipes', { id: uid(), name: `${mealName} — ${date}`, ingredients } as never)
            onDone()
          }}>Save this meal as a quick meal</Button>
        )}
      </div>
      {s.recipes.length === 0 && <div className="text-[13px]" style={{ color: 'var(--text-mute)' }}>No saved quick meals yet — create one above.</div>}
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
              <div className="text-[15px] font-extrabold">{r.name}</div>
              <div className="text-[12px] font-bold">{Math.round(tot.calories)} kcal</div>
            </div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--text-mute)' }}>
              {parts.map(p => `${p.f.name} ${p.qty}${unitShort(p.f.unit)}`).join(' · ')}
            </div>
            <div className="mt-1 text-[11px]" style={{ color: 'var(--text-dim)' }}>
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
              }}>{busy === r.id ? 'Adding…' : 'Add all ingredients'}</Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function DescribeTab({ date, mealTypeId, onDone }: { date: string; mealTypeId: string; onDone: () => void }) {
  const [text, setText] = useState('')
  const [items, setItems] = useState<ParsedFood[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (items) return <ReviewItems items={items} date={date} mealTypeId={mealTypeId} source="ai_text"
    onCancel={() => setItems(null)} onDone={onDone} />

  return (
    <div className="grid gap-3">
      <Field label="Describe your meal" hint="Example: 4 eggs, 2 slices brown bread and 250 ml milk">
        <textarea rows={3} value={text} onChange={e => setText(e.target.value)} placeholder="4 eggs, 2 slices brown bread, 250 ml milk" />
      </Field>
      {!ai.configured && <Notice tone="warn">AI is not configured. Use Search or Custom to log manually.</Notice>}
      {err && <Notice tone="error">{err}</Notice>}
      {busy ? <Spinner label="Analysing" /> : (
        <Button disabled={!ai.configured || text.trim().length < 3} onClick={async () => {
          setBusy(true); setErr(null)
          try {
            const out = await ai.parseFoodText(text)
            if (out.length === 0) setErr('No foods recognised in that description. Try naming the foods and amounts, or use Search.')
            else setItems(out)
          }
          catch (e) { setErr(e instanceof AIUnavailable ? e.message : 'Could not analyse that. Enter it manually.') }
          finally { setBusy(false) }
        }}>Analyse with AI</Button>
      )}
    </div>
  )
}

export function ReviewItems({ items, date, mealTypeId, source, onCancel, onDone }: {
  items: ParsedFood[]; date: string; mealTypeId: string
  source: FoodLog['source']; onCancel: () => void; onDone: () => void
}) {
  const s = useStore()
  const [rows, setRows] = useState(items)
  const [busy, setBusy] = useState(false)
  const tot = rows.reduce((a, r) => ({
    calories: a.calories + r.calories, protein_g: a.protein_g + r.protein_g,
    carbs_g: a.carbs_g + r.carbs_g, fat_g: a.fat_g + r.fat_g,
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })

  const patch = (i: number, p: Partial<ParsedFood>) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...p } : r))

  return (
    <div className="grid gap-3">
      <Notice tone="warn">AI estimate — review before saving.</Notice>
      <div className="grid max-h-[44vh] gap-2 overflow-y-auto">
        {rows.map((r, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between gap-2">
              <input value={r.name} onChange={e => patch(i, { name: e.target.value })} aria-label="Food name" />
              <button aria-label="Remove" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))}
                className="shrink-0 px-2 text-[12px]" style={{ color: '#D98A8A' }}>Remove</button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Field label="Qty"><input type="number" inputMode="decimal" value={r.qty}
                onChange={e => patch(i, { qty: Number(e.target.value) })} /></Field>
              <Field label="Unit"><input value={r.unit} onChange={e => patch(i, { unit: e.target.value })} /></Field>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2">
              <Field label="kcal"><input type="number" value={r.calories} onChange={e => patch(i, { calories: Number(e.target.value) })} /></Field>
              <Field label="P"><input type="number" value={r.protein_g} onChange={e => patch(i, { protein_g: Number(e.target.value) })} /></Field>
              <Field label="C"><input type="number" value={r.carbs_g} onChange={e => patch(i, { carbs_g: Number(e.target.value) })} /></Field>
              <Field label="F"><input type="number" value={r.fat_g} onChange={e => patch(i, { fat_g: Number(e.target.value) })} /></Field>
            </div>
          </Card>
        ))}
      </div>
      <div className="raised p-3 text-[12px]">
        Estimated total: <b>{Math.round(tot.calories)} kcal</b> · P {round1(tot.protein_g)}g · C {round1(tot.carbs_g)}g · F {round1(tot.fat_g)}g
      </div>
      <Button disabled={busy || rows.length === 0} onClick={async () => {
        setBusy(true)
        for (const r of rows) {
          await s.save('food_logs', {
            id: uid(), date, meal_type_id: mealTypeId, name: r.name, qty: r.qty,
            unit: normUnit(r.unit as Unit), source,
            calories: r.calories, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g,
          } as never)
        }
        setBusy(false); onDone()
      }}>{busy ? 'Saving…' : 'Add to meal'}</Button>
      <Button variant="ghost" onClick={onCancel}>Cancel</Button>
    </div>
  )
}

function CustomTab({ date, mealTypeId, onDone }: { date: string; mealTypeId: string; onDone: () => void }) {
  const s = useStore()
  const [f, setF] = useState({ name: '', brand: '', unit: 'g' as Unit, base: 100, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
  const [saveToDb, setSaveToDb] = useState(true)
  const set = (p: Partial<typeof f>) => setF(v => ({ ...v, ...p }))

  return (
    <div className="grid gap-3">
      <Field label="Name"><input value={f.name} onChange={e => set({ name: e.target.value })} placeholder="Home dal" /></Field>
      <Field label="Brand (optional)"><input value={f.brand} onChange={e => set({ brand: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Per amount"><input type="number" value={f.base} onChange={e => set({ base: Number(e.target.value) })} /></Field>
        <Field label="Unit">
          <select value={f.unit} onChange={e => set({ unit: e.target.value as Unit })}>
            {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <Field label="kcal"><input type="number" value={f.calories} onChange={e => set({ calories: Number(e.target.value) })} /></Field>
        <Field label="P"><input type="number" value={f.protein_g} onChange={e => set({ protein_g: Number(e.target.value) })} /></Field>
        <Field label="C"><input type="number" value={f.carbs_g} onChange={e => set({ carbs_g: Number(e.target.value) })} /></Field>
        <Field label="F"><input type="number" value={f.fat_g} onChange={e => set({ fat_g: Number(e.target.value) })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" className="h-5 w-5" checked={saveToDb} onChange={e => setSaveToDb(e.target.checked)} />
        Save to my food database
      </label>
      <Button disabled={!f.name.trim() || f.base <= 0} onClick={async () => {
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
  return (
    <div className="raised grid grid-cols-4 gap-2 p-3 text-center">
      {[['kcal', n.calories], ['P', n.protein_g], ['C', n.carbs_g], ['F', n.fat_g]].map(([k, v]) => (
        <div key={k as string}>
          <div className="eyebrow">{k as string}</div>
          <div className="text-[15px] font-extrabold">{round1(v as number)}</div>
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
