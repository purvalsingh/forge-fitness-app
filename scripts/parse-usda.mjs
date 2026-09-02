/**
 * Turn the USDA FoodData Central CSV exports into FORGE's food shape.
 *
 * Sources (both public domain):
 *   SR Legacy — 7.8k generic ingredients
 *   FNDDS survey foods — 5.4k foods "as eaten", i.e. actual dishes
 *
 * Usage: node scripts/parse-usda.mjs <sr_dir> <fndds_dir> > data/usda.json
 */
import fs from 'node:fs'
import path from 'node:path'

// Nutrient ids differ between the SR and FNDDS exports, so resolve them per directory
// from each export's own nutrient.csv rather than hardcoding numbers.
const WANTED = [
  ['calories', /^energy$/i, 'KCAL'],
  ['protein_g', /^protein$/i, 'G'],
  ['carbs_g', /^carbohydrate, by difference$/i, 'G'],
  ['fat_g', /^total lipid \(fat\)$/i, 'G'],
  ['fiber_g', /^fiber, total dietary$/i, 'G'],
  ['sugar_g', /^(sugars, total.*|total sugars)$/i, 'G'],
  ['sodium_mg', /^sodium, na$/i, 'MG'],
]

function nutrientMap(dir) {
  const map = new Map()
  for (const r of rows(path.join(dir, 'nutrient.csv'))) {
    for (const [key, re, unit] of WANTED) {
      if (!re.test(r.name ?? '') || (r.unit_name ?? '').toUpperCase() !== unit) continue
      // The SR export references nutrients by id, the FNDDS export by nutrient_nbr. Accept both.
      if (!map.has(r.id)) map.set(r.id, key)
      if (r.nutrient_nbr && !map.has(r.nutrient_nbr)) map.set(r.nutrient_nbr, key)
    }
  }
  return map
}

/** Minimal CSV reader for USDA's quoted export format. */
function* rows(file) {
  const text = fs.readFileSync(file, 'utf8')
  let field = '', row = [], quoted = false, first = true, header = null
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false }
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') {
      row.push(field.replace(/\r$/, '')); field = ''
      if (first) { header = row; first = false } else yield Object.fromEntries(header.map((h, j) => [h, row[j]]))
      row = []
    } else field += c
  }
  if (field || row.length) { row.push(field); if (!first) yield Object.fromEntries(header.map((h, j) => [h, row[j]])) }
}

function load(dir, dataTypeLabel) {
  const nutrients = nutrientMap(dir)
  const foods = new Map()
  for (const r of rows(path.join(dir, 'food.csv'))) {
    if (!r.description) continue
    foods.set(r.fdc_id, { fdc_id: r.fdc_id, name: r.description, source: dataTypeLabel })
  }
  for (const r of rows(path.join(dir, 'food_nutrient.csv'))) {
    const key = nutrients.get(r.nutrient_id)
    if (!key) continue
    const f = foods.get(r.fdc_id)
    if (!f) continue
    const v = Number(r.amount)
    if (Number.isFinite(v)) f[key] = Math.round(v * 100) / 100
  }
  return [...foods.values()]
}

const [srDir, fnddsDir] = process.argv.slice(2)
const all = [...load(srDir, 'usda-sr'), ...load(fnddsDir, 'usda-fndds')]
  // A food without calories is not loggable.
  .filter(f => Number.isFinite(f.calories))
  .map(f => ({
    ...f,
    protein_g: f.protein_g ?? 0, carbs_g: f.carbs_g ?? 0, fat_g: f.fat_g ?? 0,
  }))

process.stdout.write(JSON.stringify(all))
console.error(`parsed ${all.length} foods (${all.filter(f => f.source === 'usda-fndds').length} dishes)`)
