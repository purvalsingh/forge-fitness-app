/**
 * Rebuild public/food-catalog.json without re-downloading USDA.
 *
 *   node scripts/rebuild-catalog.mjs
 *
 * Reuses the USDA/OFF rows already in the shipped catalog as the component table, recomposes every
 * dish (indian-dishes, indian-regional, indian-states) and adds the Indian Nutrient Databank (INDB,
 * Vijayakumar et al. 2024, open access) recipes after a plausibility filter — INDB counts all frying
 * oil as eaten, which inflates some fried items past anything physically plausible.
 */
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const catalogPath = new URL('public/food-catalog.json', root)
const old = JSON.parse(fs.readFileSync(catalogPath, 'utf8')).foods
const base = old.filter(f => f.src !== 'composed' && f.src !== 'indb')
const usda = base.filter(f => f.src === 'sr' || f.src === 'fndds')

const composed = JSON.parse(fs.readFileSync(new URL('data/composed-dishes.json', root), 'utf8')).dishes
const { dishes: indian } = await import('./indian-dishes.mjs')
const { dishes: regional } = await import('./indian-regional.mjs')
const { dishes: states } = await import('./indian-states.mjs')

// Older dish lists use a cuisine label; map it to the state it belongs to.
const CUISINE_STATE = {
  Maharashtrian: 'Maharashtra', Bengali: 'West Bengal', Gujarati: 'Gujarat', Kerala: 'Kerala',
  Tamil: 'Tamil Nadu', Rajasthani: 'Rajasthan', Punjabi: 'Punjab', Goan: 'Goa', Karnataka: 'Karnataka',
  Kashmiri: 'Jammu and Kashmir', Hyderabadi: 'Telangana', Andhra: 'Andhra Pradesh', Bihari: 'Bihar',
  Assamese: 'Assam', Konkani: 'Goa',
}

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** "Batata Vada (2 pieces)" -> "2 pieces"; otherwise a sensible default by dish type. */
function labelFor(name, fallback) {
  const m = name.match(/\((\d+\s+[a-z ]+?)\)/i)
  if (m) return m[1]
  if (fallback && fallback !== '1 serving') return fallback
  const n = name.toLowerCase()
  if (/dal|curry|sabzi|masala|kadhi|sambar|rasam|raita|korma|saag|bharta|kheer|payas|halwa/.test(n)) return '1 katori'
  if (/biryani|pulao|rice|khichdi|poha|upma|thali|chaat|bhel|noodles|pav bhaji|misal/.test(n)) return '1 plate'
  if (/roti|paratha|naan|kulcha|dosa|chilla|thepla|bhakri|puri|vada|samosa|kachori|pav|roll|frankie|tikki|idli|uttapam|appam/.test(n)) return '1 piece'
  if (/chai|coffee|lassi|milk|sharbat|pani|chaas|thandai|kahwa/.test(n)) return '1 glass'
  return '1 serving'
}

const out = [...base]
const ids = new Set(out.map(f => f.id))
const missing = []

for (const dish of [...composed, ...indian, ...regional, ...states]) {
  let cal = 0, pro = 0, carb = 0, fat = 0, fib = 0, grams = 0
  let bad = false
  for (const c of dish.components) {
    if (!c.g) continue
    const re = new RegExp(c.match, 'i')
    const hit = usda.find(f => re.test(f.name))
    if (!hit) { missing.push(`${dish.name}: ${c.match}`); bad = true; continue }
    const k = c.g / 100
    cal += hit.calories * k; pro += hit.protein_g * k; carb += hit.carbs_g * k; fat += hit.fat_g * k
    fib += (hit.fiber_g ?? 0) * k
    grams += c.g
  }
  if (bad) continue
  const id = 'dish-' + slug(dish.name)
  if (ids.has(id)) continue
  ids.add(id)
  const serving = dish.serving_g || grams
  const per100 = 100 / serving
  out.push({
    id, name: dish.name, category: 'Dish',
    cuisine: dish.state ?? dish.cuisine,
    state: dish.state ?? CUISINE_STATE[dish.cuisine],
    unit: '100g', base: 100,
    calories: round(cal * per100), protein_g: round(pro * per100),
    carbs_g: round(carb * per100), fat_g: round(fat * per100), fiber_g: round(fib * per100),
    serving_g: serving, serving_label: labelFor(dish.name, dish.label),
    src: 'composed',
  })
}

if (missing.length) {
  console.error('UNRESOLVED COMPONENTS:\n  ' + missing.join('\n  '))
  process.exit(1)
}

// ---- INDB ------------------------------------------------------------------------------
const indbRows = JSON.parse(execFileSync('python3', ['-c', `
import openpyxl, json
wb = openpyxl.load_workbook('data/indb/INDB.xlsx', read_only=True); ws = wb.active
rows = list(ws.iter_rows(values_only=True)); h = rows[0]
print(json.dumps([dict(zip(h, r)) for r in rows[1:]], default=str))
`], { cwd: new URL('.', root).pathname, maxBuffer: 64 << 20 }).toString())

const DRY = /laddu|laddoo|ladoo|burfi|barfi|chikki|namkeen|chivda|mixture|sev|bhujia|mathri|chakli|murukku|pak\b|halwa|papdi|khakhra|biscuit|cookie|cake|nankhatai|shakarpara|gujiya|pinni|panjiri|chocolate|fudge|powder|masala|chutney powder|podi|pickle|achar/i
let indbKept = 0, indbDropped = 0
const seenNames = new Set(out.map(f => f.name.toLowerCase()))
for (const r of indbRows) {
  const kcal = Number(r.energy_kcal), p = Number(r.protein_g), c = Number(r.carb_g), f = Number(r.fat_g)
  const name = String(r.food_name ?? '').replace(/\s+/g, ' ').trim()
  if (!name || ![kcal, p, c, f].every(Number.isFinite)) { indbDropped++; continue }
  // Energy must roughly agree with the macros (4/4/9), and wet dishes cannot exceed ~420 kcal/100 g.
  const macroKcal = 4 * p + 4 * c + 9 * f
  const cap = DRY.test(name) ? 620 : 420
  if (kcal < 5 || kcal > cap || Math.abs(macroKcal - kcal) > Math.max(40, kcal * 0.25)) { indbDropped++; continue }
  if (seenNames.has(name.toLowerCase())) continue
  seenNames.add(name.toLowerCase())
  const servKcal = Number(r.unit_serving_energy_kcal)
  let serving_g = Number.isFinite(servKcal) && servKcal > 0 ? Math.round((servKcal / kcal) * 100) : null
  if (!serving_g || serving_g < 15 || serving_g > 600) serving_g = null
  const unitWord = String(r.servings_unit ?? '').trim()
  out.push({
    id: 'indb-' + String(r.food_code).toLowerCase(),
    name, category: 'Dish', cuisine: 'Indian',
    unit: '100g', base: 100,
    calories: round(kcal), protein_g: round(p), carbs_g: round(c), fat_g: round(f),
    ...(Number.isFinite(Number(r.fibre_g)) ? { fiber_g: round(Number(r.fibre_g)) } : {}),
    ...(Number.isFinite(Number(r.sodium_mg)) ? { sodium_mg: Math.round(Number(r.sodium_mg)) } : {}),
    ...(serving_g ? { serving_g, serving_label: unitWord && unitWord !== 'gm' ? `1 ${unitWord}` : labelFor(name) } : {}),
    src: 'indb',
  })
  indbKept++
}

out.sort((a, b) => a.name.localeCompare(b.name))
fs.writeFileSync(catalogPath, JSON.stringify({
  version: 2,
  generated_at: new Date().toISOString().slice(0, 10),
  attribution: 'USDA FoodData Central (public domain); Open Food Facts (ODbL); Indian Nutrient Databank — Vijayakumar A. et al., Curr Dev Nutr 2024 (open access); regional dishes composed from those components.',
  foods: out,
}))
const byState = {}
for (const f of out) if (f.state) byState[f.state] = (byState[f.state] ?? 0) + 1
console.error(`catalog: ${out.length} foods; composed ${out.filter(f => f.src === 'composed').length}; INDB kept ${indbKept}, dropped ${indbDropped}; states ${Object.keys(byState).length}`)
console.error(Object.entries(byState).sort().map(([k, v]) => `${k}:${v}`).join(', '))
