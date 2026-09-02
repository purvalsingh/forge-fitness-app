import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store'
import { uid } from '../lib/db'
import { Button, Card, Field, Icon, Screen, Sheet } from '../ui'
import type { Food, Unit } from '../lib/types'

const UNITS: Unit[] = ['100g', '100ml', 'g', 'ml', 'serving', 'piece', 'slice', 'cup', 'tbsp', 'tsp', 'scoop']

export default function Foods() {
  const s = useStore()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Food | null>(null)

  const list = useMemo(() => {
    const n = q.trim().toLowerCase()
    return [...s.foods]
      .filter(f => !n || f.name.toLowerCase().includes(n))
      .sort((a, b) => Number(Boolean(b.custom)) - Number(Boolean(a.custom)) || a.name.localeCompare(b.name))
  }, [q, s.foods])

  const blank = (): Food => ({
    id: uid(), name: '', unit: '100g', base: 100, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
    custom: true, category: 'Custom',
  })

  return (
    <Screen title="Food database" sub={`${s.foods.length} foods`} back={() => nav('/more')}
      right={<button aria-label="Add food" onClick={() => setEdit(blank())}
        className="grid h-10 w-10 place-items-center rounded-full border" style={{ borderColor: 'var(--line)' }}>
        <Icon name="plus" size={18} /></button>}>

      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search foods" aria-label="Search foods" />

      <div className="mt-3 grid gap-2">
        {list.map(f => (
          <Card key={f.id} onClick={() => setEdit(f)} className="flex items-center justify-between">
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold">{f.name}{f.brand ? ` · ${f.brand}` : ''}</span>
              <span className="block text-[11px]" style={{ color: 'var(--text-mute)' }}>
                {f.calories} kcal / {f.base} {f.unit} · P{f.protein_g} C{f.carbs_g} F{f.fat_g}
              </span>
            </span>
            <span className="eyebrow shrink-0">{f.custom ? 'Custom' : f.category}</span>
          </Card>
        ))}
      </div>

      {edit && <FoodSheet food={edit} onClose={() => setEdit(null)} />}
    </Screen>
  )
}

function FoodSheet({ food, onClose }: { food: Food; onClose: () => void }) {
  const s = useStore()
  const [f, setF] = useState(food)
  const set = (p: Partial<Food>) => setF(v => ({ ...v, ...p }))
  const exists = s.foods.some(x => x.id === food.id)

  return (
    <Sheet open onClose={onClose} title={exists ? 'Edit food' : 'New food'}>
      <div className="grid gap-3">
        <Field label="Name"><input value={f.name} onChange={e => set({ name: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Brand"><input value={f.brand ?? ''} onChange={e => set({ brand: e.target.value })} /></Field>
          <Field label="Category"><input value={f.category ?? ''} onChange={e => set({ category: e.target.value })} /></Field>
        </div>
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
        <div className="grid grid-cols-3 gap-2">
          <Field label="Fiber"><input type="number" value={f.fiber_g ?? ''} onChange={e => set({ fiber_g: Number(e.target.value) })} /></Field>
          <Field label="Sugar"><input type="number" value={f.sugar_g ?? ''} onChange={e => set({ sugar_g: Number(e.target.value) })} /></Field>
          <Field label="Sodium (mg)"><input type="number" value={f.sodium_mg ?? ''} onChange={e => set({ sodium_mg: Number(e.target.value) })} /></Field>
        </div>
        <Button disabled={!f.name.trim() || f.base <= 0} onClick={async () => {
          await s.save('foods', { ...f, custom: true } as never); onClose()
        }}>Save food</Button>
        {exists && <Button variant="danger" onClick={async () => { await s.del('foods', f.id); onClose() }}>Delete food</Button>}
      </div>
    </Sheet>
  )
}
