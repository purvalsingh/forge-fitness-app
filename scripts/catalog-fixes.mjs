/**
 * Corrections applied to the food catalog after it is built (also run on its own: node scripts/catalog-fixes.mjs).
 * Source data has errors the audit found: an INDB "boiled egg" of 151 g at 45 kcal/100 g, a 125 g "milk cookie",
 * Open Food Facts entries whose macros cannot add up to their calories, and no per-scoop serving for whey.
 */
import fs from 'node:fs'

const FIX = {
  // Real boiled egg (USDA 01129): per 100 g, one large egg ≈ 50 g.
  'indb-asc056': { calories: 155, protein_g: 12.6, carbs_g: 1.1, fat_g: 10.6, serving_g: 50, serving_label: '1 egg' },
  'indb-osr041': { serving_g: 10, serving_label: '1 cookie' },
  'off-amul-gee-amul-': { name: 'Amul Ghee (Amul)', fat_g: 99.5, carbs_g: 0, protein_g: 0 },
}
const DROP = new Set(['off-amul-roti-amul-']) // 31 g protein per 100 g for a roti: label data is wrong

/** Open Food Facts rows are user-entered; drop any whose protein/carbs/fat cannot produce the stated calories. */
function impossible(f) {
  if (f.src !== 'off' || !(f.calories > 0)) return false
  const atwater = f.protein_g * 4 + f.carbs_g * 4 + f.fat_g * 9
  return atwater > f.calories * 1.3 + 25 || atwater < f.calories * 0.6 - 25 || f.protein_g + f.carbs_g + f.fat_g > 101
}

const isWhey = f => /whey|protein powder|protein isolate|iso whey/i.test(f.name) && f.protein_g >= 50 && !f.serving_g

export function applyFixes(foods) {
  return foods
    .filter(f => !DROP.has(f.id) && !impossible(f))
    .map(f => ({ ...f, ...(FIX[f.id] ?? {}), ...(isWhey(f) ? { serving_g: 30, serving_label: '1 scoop' } : {}) }))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const p = new URL('../public/food-catalog.json', import.meta.url)
  const d = JSON.parse(fs.readFileSync(p, 'utf8'))
  const before = d.foods.length
  d.foods = applyFixes(d.foods)
  fs.writeFileSync(p, JSON.stringify(d))
  console.error(`catalog fixes: ${before} -> ${d.foods.length} foods, ${d.foods.filter(f => f.serving_label === '1 scoop').length} with a scoop serving`)
}
