import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useStore, useToday } from '../store'
import { uid } from '../lib/db'
import { round1, scaleFood } from '../lib/calc'
import { Button, Card, Empty, Field, Icon, Screen, Sheet, Spinner } from '../ui'
import { loadCatalog, searchFoods, type CatalogFood } from '../lib/catalog'
import { normUnit } from './AddFood'
import type { Recipe } from '../lib/types'

export default function Recipes() {
  const s = useStore()
  const nav = useNavigate()
  const date = useToday()
  const [params, setParams] = useSearchParams()
  const [edit, setEdit] = useState<Recipe | null>(
    () => (params.get('new') ? { id: uid(), name: '', ingredients: [] } : null))
  const [addTo, setAddTo] = useState<Recipe | null>(null)

  function totalsOf(r: Recipe) {
    return r.ingredients.reduce((a, ing) => {
      const f = s.foods.find(x => x.id === ing.food_id)
      if (!f) return a
      const n = scaleFood(f, ing.qty)
      return {
        calories: a.calories + n.calories, protein_g: a.protein_g + n.protein_g,
        carbs_g: a.carbs_g + n.carbs_g, fat_g: a.fat_g + n.fat_g,
      }
    }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 })
  }

  return (
    <Screen title="Quick meals" sub="Saved recipes" back={() => nav('/more')}
      right={<button aria-label="New recipe"
        onClick={() => setEdit({ id: uid(), name: '', ingredients: [] })}
        className="grid h-10 w-10 place-items-center rounded-full border" style={{ borderColor: 'var(--line)' }}>
        <Icon name="plus" size={18} /></button>}>

      {s.recipes.length === 0 && <Empty title="No quick meals yet" body="Save a combination you eat often and log it in one tap." />}

      <div className="grid gap-3">
        {[...s.recipes].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite))).map(r => {
          const t = totalsOf(r)
          return (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[16px] font-extrabold">{r.name}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
                    {r.ingredients.map(i => {
                      const f = s.foods.find(x => x.id === i.food_id)
                      return f ? `${f.name} ${i.qty}${f.unit === '100g' ? 'g' : f.unit === '100ml' ? 'ml' : ' ' + f.unit}` : null
                    }).filter(Boolean).join(' · ') || 'No ingredients yet'}
                  </div>
                </div>
                <button aria-label={r.favorite ? 'Unfavorite' : 'Favorite'}
                  onClick={() => s.save('recipes', { ...r, favorite: !r.favorite } as never)}
                  style={{ color: r.favorite ? 'var(--accent)' : 'var(--text-mute)' }}><Icon name="sparkle" size={18} /></button>
              </div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                {[['kcal', t.calories], ['P', t.protein_g], ['C', t.carbs_g], ['F', t.fat_g]].map(([k, v]) => (
                  <div key={k as string} className="raised py-2">
                    <div className="eyebrow">{k as string}</div>
                    <div className="text-[14px] font-extrabold">{Math.round(v as number)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="quiet" onClick={() => setAddTo(r)}>Add to meal</Button>
                <Button variant="ghost" onClick={() => setEdit(r)}>Edit</Button>
              </div>
            </Card>
          )
        })}
      </div>

      {edit && <RecipeSheet recipe={edit} onClose={() => { setEdit(null); if (params.get('new')) setParams({}, { replace: true }) }} />}
      {addTo && (
        <Sheet open onClose={() => setAddTo(null)} title={`Add “${addTo.name}” to`}>
          <div className="grid gap-2">
            {s.mealTypes.map(m => (
              <Button key={m.id} variant="quiet" onClick={async () => {
                for (const ing of addTo.ingredients) {
                  const f = s.foods.find(x => x.id === ing.food_id)
                  if (!f) continue
                  const n = scaleFood(f, ing.qty)
                  await s.save('food_logs', {
                    id: uid(), date, meal_type_id: m.id, food_id: f.id, name: f.name,
                    qty: ing.qty, unit: normUnit(f.unit), source: 'recipe',
                    calories: n.calories, protein_g: n.protein_g, carbs_g: n.carbs_g, fat_g: n.fat_g,
                  } as never)
                }
                setAddTo(null); nav('/diet')
              }}>{m.name}</Button>
            ))}
          </div>
        </Sheet>
      )}
    </Screen>
  )
}

function RecipeSheet({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const s = useStore()
  const [r, setR] = useState(recipe)
  const [q, setQ] = useState('')
  const [catalog, setCatalog] = useState<CatalogFood[] | null>(null)
  const exists = s.recipes.some(x => x.id === recipe.id)

  useEffect(() => { loadCatalog().then(setCatalog).catch(() => setCatalog([])) }, [])

  const options = useMemo(() => {
    if (!q.trim()) return []
    const needle = q.trim().toLowerCase()
    const mine = s.foods.filter(f => f.name.toLowerCase().includes(needle)).slice(0, 8)
    const seen = new Set(mine.map(f => f.name.toLowerCase()))
    const rest = catalog ? searchFoods(catalog, q, 20).filter(f => !seen.has(f.name.toLowerCase())) : []
    return [...mine, ...rest].slice(0, 20)
  }, [q, s.foods, catalog])

  return (
    <Sheet open onClose={onClose} title={exists ? 'Edit recipe' : 'New recipe'}>
      <div className="grid gap-3">
        <Field label="Name"><input value={r.name} onChange={e => setR(v => ({ ...v, name: e.target.value }))} placeholder="Chicken Rice Bowl" /></Field>

        <div className="grid gap-2">
          <div className="eyebrow">Ingredients</div>
          {r.ingredients.map((ing, i) => {
            const f = s.foods.find(x => x.id === ing.food_id)
            const n = f ? scaleFood(f, ing.qty) : null
            return (
              <div key={i} className="raised grid grid-cols-[1fr_84px_auto] items-center gap-2 p-2">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-bold">{f?.name ?? 'Unknown food'}</div>
                  {n && <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>{round1(n.calories)} kcal</div>}
                </div>
                <input type="number" aria-label="Quantity" value={ing.qty}
                  onChange={e => setR(v => ({ ...v, ingredients: v.ingredients.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x) }))} />
                <button aria-label="Remove ingredient" style={{ color: '#D98A8A' }}
                  onClick={() => setR(v => ({ ...v, ingredients: v.ingredients.filter((_, j) => j !== i) }))}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            )
          })}
          <div className="grid gap-2">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a food to add" aria-label="Search a food to add" />
            {q.trim() && !catalog && <Spinner label="Loading food database" />}
            {options.map(f => (
              <button key={f.id} className="raised p-2.5 text-left" onClick={async () => {
                // An ingredient must exist in the user's foods for the recipe to resolve later.
                if (!s.foods.some(x => x.id === f.id)) await s.save('foods', { ...f, custom: false } as never)
                setR(v => ({ ...v, ingredients: [...v.ingredients, { food_id: f.id, qty: ('serving_g' in f && typeof f.serving_g === 'number' ? f.serving_g : f.base) }] }))
                setQ('')
              }}>
                <div className="text-[13px] font-bold">{f.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-mute)' }}>
                  {f.calories} kcal / {f.base}{f.unit === '100g' ? 'g' : f.unit === '100ml' ? 'ml' : ' ' + f.unit}
                </div>
              </button>
            ))}
          </div>
        </div>

        <Button disabled={!r.name.trim()} onClick={async () => { await s.save('recipes', r as never); onClose() }}>Save recipe</Button>
        {exists && (
          <>
            <Button variant="quiet" onClick={async () => {
              await s.save('recipes', { ...r, id: uid(), name: `${r.name} (copy)` } as never); onClose()
            }}>Duplicate</Button>
            <Button variant="danger" onClick={async () => { await s.del('recipes', r.id); onClose() }}>Delete recipe</Button>
          </>
        )}
      </div>
    </Sheet>
  )
}
