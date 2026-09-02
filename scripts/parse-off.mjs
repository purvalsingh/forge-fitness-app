/**
 * Extract Indian food products from the Open Food Facts CSV dump (ODbL).
 *
 *   node scripts/parse-off.mjs ~/.cache/forge-data/off.csv.gz > /tmp/off-india.json
 *
 * The dump is ~1.3 GB gzipped and tab-separated, so it is streamed, never loaded whole.
 */
import fs from 'node:fs'
import zlib from 'node:zlib'
import readline from 'node:readline'

const file = process.argv[2]
const rl = readline.createInterface({
  input: fs.createReadStream(file).pipe(zlib.createGunzip()),
  crlfDelay: Infinity,
})

let cols = null
const idx = {}
const out = []
const seen = new Set()
let lines = 0

const NEEDED = ['product_name', 'brands', 'countries_en', 'energy-kcal_100g', 'proteins_100g',
  'carbohydrates_100g', 'fat_100g', 'fiber_100g', 'sugars_100g', 'sodium_100g', 'serving_size', 'categories_en']

for await (const line of rl) {
  if (!cols) {
    cols = line.split('\t')
    for (const n of NEEDED) idx[n] = cols.indexOf(n)
    continue
  }
  if (++lines % 500000 === 0) console.error(`  ${lines} rows, ${out.length} kept`)

  const f = line.split('\t')
  const countries = f[idx.countries_en] ?? ''
  if (!countries.includes('India')) continue

  const name = (f[idx.product_name] ?? '').trim()
  if (name.length < 2 || name.length > 70) continue

  const kcal = Number(f[idx['energy-kcal_100g']])
  const p = Number(f[idx.proteins_100g]), c = Number(f[idx.carbohydrates_100g]), fat = Number(f[idx.fat_100g])
  // Without energy and macros the row cannot be logged, and absurd values mean a data-entry error.
  if (!Number.isFinite(kcal) || kcal <= 0 || kcal > 900) continue
  if (![p, c, fat].every(Number.isFinite)) continue
  if (p < 0 || p > 100 || c < 0 || c > 100 || fat < 0 || fat > 100) continue

  const brand = (f[idx.brands] ?? '').split(',')[0].trim()
  const key = `${name.toLowerCase()}|${brand.toLowerCase()}`
  if (seen.has(key)) continue
  seen.add(key)

  const num = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : undefined }
  out.push({
    name, brand: brand || undefined,
    calories: Math.round(kcal), protein_g: num(p), carbs_g: num(c), fat_g: num(fat),
    fiber_g: num(f[idx.fiber_100g]), sugar_g: num(f[idx.sugars_100g]),
    sodium_mg: Number.isFinite(Number(f[idx.sodium_100g])) ? Math.round(Number(f[idx.sodium_100g]) * 1000) : undefined,
    category: (f[idx.categories_en] ?? '').split(',')[0].trim() || undefined,
  })
}

process.stdout.write(JSON.stringify(out))
console.error(`kept ${out.length} Indian products from ${lines} rows`)
