import type { Food } from './types'

/**
 * The bundled food catalog: ~13k foods from USDA FoodData Central (SR Legacy ingredients +
 * FNDDS dishes, both public domain) plus dishes composed from those components.
 * It is fetched on first search, not bundled into the app shell, and cached by the service worker.
 */
export interface CatalogFood extends Food {
  cuisine?: string
  serving_g?: number
  src: 'sr' | 'fndds' | 'composed' | 'off'
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
export function toFoodRow(f: CatalogFood | Food): Food & { cuisine?: string; serving_g?: number; source?: string } {
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
    else if (f.src === 'fndds') score += 60
    else if (f.src === 'off') score += 30
    out.push({ ...f, score })
    if (out.length > 4000) break
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit)
}
