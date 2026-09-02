/**
 * Build the food catalog the app ships.
 *
 *   node scripts/parse-usda.mjs <sr_dir> <fndds_dir> > /tmp/usda.json
 *   node scripts/build-catalog.mjs /tmp/usda.json > public/food-catalog.json
 *
 * Sources: USDA FoodData Central SR Legacy + FNDDS survey foods (both public domain),
 * plus data/composed-dishes.json — dishes missing from USDA, computed from USDA components.
 */
import fs from 'node:fs'

const usda = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
// Optional third source: Indian packaged products from Open Food Facts (ODbL).
const offPath = process.argv[3]
const off = offPath && fs.existsSync(offPath) ? JSON.parse(fs.readFileSync(offPath, 'utf8')) : []
const composed = JSON.parse(fs.readFileSync(new URL('../data/composed-dishes.json', import.meta.url), 'utf8'))
const { dishes: indianDishes } = await import('./indian-dishes.mjs')
const { dishes: regionalDishes } = await import('./indian-regional.mjs')
const allComposed = [...composed.dishes, ...indianDishes, ...regionalDishes]

const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d

/** USDA writes "Beef, chuck, cooked" — read it back as "Chuck beef, cooked" style leading term. */
function tidy(name) {
  return name
    .replace(/\s+/g, ' ')
    .replace(/,\s*(NFS|NS as to fat|Includes foods for USDA.*)$/i, '')
    .trim()
}

const out = []
const seen = new Set()

for (const f of usda) {
  const name = tidy(f.name)
  const key = name.toLowerCase()
  if (seen.has(key)) continue
  seen.add(key)
  out.push({
    id: `usda-${f.fdc_id}`,
    name,
    category: f.source === 'usda-fndds' ? 'Dish' : 'Ingredient',
    unit: '100g', base: 100,
    calories: round(f.calories), protein_g: round(f.protein_g),
    carbs_g: round(f.carbs_g), fat_g: round(f.fat_g),
    ...(Number.isFinite(f.fiber_g) ? { fiber_g: round(f.fiber_g) } : {}),
    ...(Number.isFinite(f.sugar_g) ? { sugar_g: round(f.sugar_g) } : {}),
    ...(Number.isFinite(f.sodium_mg) ? { sodium_mg: Math.round(f.sodium_mg) } : {}),
    src: f.source === 'usda-fndds' ? 'fndds' : 'sr',
  })
}

// Composed dishes: totals come from the component foods, so nothing here is invented.
const missing = []
for (const dish of allComposed) {
  let cal = 0, pro = 0, carb = 0, fat = 0, grams = 0
  for (const c of dish.components) {
    const re = new RegExp(c.match, 'i')
    const hit = usda.find(f => re.test(f.name))
    if (!hit) { missing.push(`${dish.name}: ${c.match}`); continue }
    const k = c.g / 100
    cal += hit.calories * k; pro += hit.protein_g * k
    carb += hit.carbs_g * k; fat += hit.fat_g * k
    grams += c.g
  }
  if (missing.some(m => m.startsWith(dish.name + ':'))) continue
  // Cooking loses water; a plated serving weighs less than the sum of its raw parts.
  const per100 = 100 / (dish.serving_g || grams)
  out.push({
    id: 'dish-' + dish.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    name: dish.name,
    category: 'Dish',
    cuisine: dish.cuisine,
    unit: '100g', base: 100,
    calories: round(cal * per100), protein_g: round(pro * per100),
    carbs_g: round(carb * per100), fat_g: round(fat * per100),
    serving_g: dish.serving_g,
    src: 'composed',
  })
}

if (missing.length) {
  console.error('UNRESOLVED COMPONENTS:\n  ' + missing.join('\n  '))
  process.exit(1)
}

for (const p of off) {
  const label = p.brand ? `${p.name} (${p.brand})` : p.name
  const key = label.toLowerCase()
  if (seen.has(key)) continue
  seen.add(key)
  out.push({
    id: 'off-' + key.replace(/[^a-z0-9]+/g, '-').slice(0, 60),
    name: label,
    brand: p.brand,
    category: p.category || 'Packaged',
    unit: '100g', base: 100,
    calories: p.calories, protein_g: p.protein_g, carbs_g: p.carbs_g, fat_g: p.fat_g,
    ...(p.fiber_g != null ? { fiber_g: p.fiber_g } : {}),
    ...(p.sugar_g != null ? { sugar_g: p.sugar_g } : {}),
    ...(p.sodium_mg != null ? { sodium_mg: p.sodium_mg } : {}),
    src: 'off',
  })
}

out.sort((a, b) => a.name.localeCompare(b.name))
process.stdout.write(JSON.stringify({
  version: 1,
  generated_at: new Date().toISOString().slice(0, 10),
  attribution: 'USDA FoodData Central (SR Legacy + FNDDS), public domain. Indian packaged products from Open Food Facts (ODbL). Dishes computed from those components.',
  foods: out,
}))
console.error(`catalog: ${out.length} foods (${out.filter(f => f.category === 'Dish').length} dishes)`)
