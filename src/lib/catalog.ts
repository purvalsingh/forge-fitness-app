import type { Food } from './types'

/**
 * The bundled food catalog: ~13k foods from USDA FoodData Central (SR Legacy ingredients +
 * FNDDS dishes, both public domain) plus dishes composed from those components.
 * It is fetched on first search, not bundled into the app shell, and cached by the service worker.
 */
export interface CatalogFood extends Food {
  cuisine?: string
  /** Indian state / union territory the dish is from. */
  state?: string
  serving_g?: number
  /** How the dish is actually eaten: "1 piece", "1 katori", "1 plate". */
  serving_label?: string
  src: 'sr' | 'fndds' | 'composed' | 'off' | 'indb'
}

let cache: CatalogFood[] | null = null
let inflight: Promise<CatalogFood[]> | null = null

export function catalogLoaded() { return cache !== null }

export async function loadCatalog(): Promise<CatalogFood[]> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = fetch(`${import.meta.env.BASE_URL}food-catalog.json`)
    .then(r => { if (!r.ok) throw new Error(`catalog ${r.status}`); return r.json() })
    .then((data: { foods: CatalogFood[] }) => {
      cache = data.foods.map(f => ({ ...f, unit: '100g' as const, base: 100 }))
      return cache
    })
    .finally(() => { inflight = null })
  return inflight
}

const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** Common spellings that do not match the catalog's naming. */
const ALIASES: Record<string, string> = {
  // Street food and dish spellings
  vadapav: 'vada pav', wadapav: 'vada pav', vadapao: 'vada pav',
  pavbhaji: 'pav bhaji', paobhaji: 'pav bhaji',
  golgappa: 'pani puri', golgappe: 'pani puri', puchka: 'pani puri',
  phuchka: 'pani puri', panipuri: 'pani puri', gupchup: 'pani puri',
  dahibhalla: 'dahi vada', dahibhalle: 'dahi vada', dahivada: 'dahi vada',
  kandapoha: 'poha', batatapoha: 'poha', usal: 'matki usal',
  macherjhol: 'macher jhol', mistidoi: 'mishti doi', meencurry: 'kerala fish curry',
  chholebhature: 'chole bhature', cholebhature: 'chole bhature',
  aloopratha: 'aloo paratha', parantha: 'paratha', prantha: 'paratha',
  poori: 'puri', bhatura: 'bhature', kadhai: 'kadai', manchurian: 'manchurian',
  maggie: 'maggi', biriyani: 'biryani', biriani: 'biryani',
  // Ingredient names
  chhole: 'chickpea', chole: 'chickpea', rajmah: 'rajma',
  dahi: 'yogurt', curd: 'yogurt', chaas: 'buttermilk',
  roti: 'chapati', chapathi: 'chapati', atta: 'wheat flour',
  brinjal: 'eggplant', baingan: 'eggplant', ladyfinger: 'okra', bhindi: 'okra',
  capsicum: 'pepper', shimlamirch: 'pepper', lauki: 'gourd', doodhi: 'gourd',
  karela: 'bitter gourd', arbi: 'taro', kaddu: 'pumpkin', shakarkandi: 'sweet potato',
  maida: 'wheat flour, white', suji: 'semolina', rava: 'semolina', sooji: 'semolina',
  jeera: 'cumin', haldi: 'turmeric', dhania: 'coriander', methi: 'fenugreek',
  sarson: 'mustard greens', palak: 'spinach', gobi: 'cauliflower', matar: 'peas',
  chawal: 'rice', doodh: 'milk', anda: 'egg', murgh: 'chicken', gosht: 'mutton',
  machli: 'fish', jhinga: 'shrimp', kaju: 'cashew', badam: 'almond',
  moongphali: 'peanut', til: 'sesame', nariyal: 'coconut', imli: 'tamarind',
  gud: 'jaggery', chini: 'sugar', namak: 'salt', chai: 'tea',
}

export interface SearchResult extends CatalogFood { score: number }

/**
 * Reduce anything food-shaped to the columns the `foods` table actually has.
 * Catalog entries carry search-only extras (`score`, and previously `src`), and sending an
 * unknown column makes PostgREST reject the whole write.
 */
export function toFoodRow(f: CatalogFood | Food): Food & { cuisine?: string; serving_g?: number; serving_label?: string; state?: string; source?: string } {
  const c = f as Partial<CatalogFood>
  return {
    id: f.id,
    name: f.name,
    brand: f.brand,
    category: f.category,
    unit: f.unit,
    base: f.base,
    calories: f.calories,
    protein_g: f.protein_g,
    carbs_g: f.carbs_g,
    fat_g: f.fat_g,
    fiber_g: f.fiber_g,
    sugar_g: f.sugar_g,
    sodium_mg: f.sodium_mg,
    custom: f.custom ?? false,
    cuisine: c.cuisine,
    serving_g: c.serving_g,
    serving_label: c.serving_label,
    state: c.state,
    source: c.src,
  }
}

/**
 * Rank by how early and how completely the query matches: exact name, then prefix,
 * then word-start, then substring. Dishes outrank raw ingredients on equal footing —
 * someone typing "biryani" wants the dish, not the rice.
 */
export function searchFoods(foods: CatalogFood[], query: string, limit = 60): CatalogFood[] {
  const raw = normalise(query)
  if (!raw) return foods.filter(f => f.src !== 'sr').slice(0, limit)

  const q = ALIASES[squash(raw)] ? normalise(ALIASES[squash(raw)]) : raw
  const qSquashed = squash(q)
  const terms = q.split(' ')
  const out: SearchResult[] = []

  for (const f of foods) {
    const name = normalise(f.name)
    let score = 0
    if (name === q) score = 1000
    else if (name.startsWith(q)) score = 800 - name.length
    else if (name.includes(` ${q}`)) score = 600 - name.length
    else if (name.includes(q)) score = 400 - name.length
    else if (terms.length > 1 && terms.every(t => name.includes(t))) score = 300 - name.length
    else if (qSquashed.length >= 4 && squash(f.name).includes(qSquashed)) score = 250 - name.length
    if (score === 0) continue
    if (f.src === 'composed') score += 120
    else if (f.src === 'indb') score += 100
    else if (f.src === 'fndds') score += 60
    else if (f.src === 'off') score += 30
    out.push({ ...f, score })
    if (out.length > 4000) break
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}

/** All 28 states and 8 union territories, in the order the app lists them. */
export const REGIONS = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const

export function byRegion(foods: CatalogFood[], region: string) {
  return foods.filter(f => f.state === region).sort((a, b) => a.name.localeCompare(b.name))
}

/** Grams in one natural serving, or null when the food is only known per 100 g/ml. */
export function servingGrams(f: Partial<CatalogFood>): number | null {
  return f.serving_g && f.serving_g > 0 ? f.serving_g : null
}

export interface Grounded {
  name: string; qty: number; unit: string; grams?: number; serving_label?: string
  calories: number; protein_g: number; carbs_g: number; fat_g: number; confidence?: number
  /** Set when the numbers were replaced by the FORGE database entry of the same dish. */
  matched?: { id: string; name: string }
}

/**
 * Replace an AI estimate's macros with the database entry for the same dish when there is a
 * confident name match — the database is computed from ingredients; the model's numbers are a guess.
 * The AI's portion (grams) is kept, because that is the part only the photo/description knows.
 */
export function groundItem<T extends Grounded>(catalog: CatalogFood[], item: T): T {
  const hits = searchFoods(catalog, item.name, 3) as SearchResult[]
  const best = hits[0]
  if (!best || best.score < 600) return item
  if (!['composed', 'indb', 'fndds'].includes(best.src)) return item
  const grams = item.grams && item.grams > 0 ? item.grams : servingGrams(best) ? servingGrams(best)! * (item.qty || 1) : null
  if (!grams) return item
  const k = grams / 100
  const kcal = best.calories * k
  // A wildly different number means the name matched a different preparation — keep the AI's.
  if (item.calories > 0 && (kcal / item.calories > 2.5 || item.calories / kcal > 2.5)) return item
  return {
    ...item, grams: Math.round(grams),
    calories: Math.round(kcal), protein_g: round1(best.protein_g * k), carbs_g: round1(best.carbs_g * k), fat_g: round1(best.fat_g * k),
    matched: { id: best.id, name: best.name },
  }
}
const round1 = (n: number) => Math.round(n * 10) / 10
