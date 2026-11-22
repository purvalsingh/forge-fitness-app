import { type CatalogFood, type Grounded, searchFoods, type SearchResult, servingGrams } from './catalog'
import { CANONICAL, defaultUnit, FILLER, isFat, NUMBERS, PLURALS, type PortionUnit, type Size, SIZES, unitGrams, unitOf, VAGUE } from './portions'

/**
 * Fast, offline meal logger: "2 roti, 1 katori dal, thoda ghee, chai" → catalog items with real Indian portions,
 * instantly and without AI. Understands digits, fractions, English/Hindi/Marathi number words (ek, do, aadha,
 * dedh, dhai…), vague amounts (thoda, zyada), sizes (chhota, bada) and units (katori, plate, glass, chamach…).
 * Whatever it can't match is returned as `unmatched` so only those words go to the AI (parse_food_text).
 */
export interface Phrase { qty: number; unit?: PortionUnit; size?: Size; food: string; vague?: boolean; text: string }
/** `partial`: phrases matched only after dropping words ("restaurant styled pav bhaji"): fine offline, but the AI should read the whole meal. */
export interface LocalParse { items: (Grounded & { source: 'local' })[]; unmatched: string[]; tooLarge: string[]; partial: string[] }

const SPLIT = /,|;|\+|&|\n|\band\b|\baur\b|\bani\b|\bplus\b|\bthen\b|\bphir\b|\bke saath\b|\bsaath\b|\bwith\b/i
const round1 = (n: number) => Math.round(n * 10) / 10

/** "1/2", "1.5", "2" → number. */
function numeric(w: string): number | undefined {
  const frac = w.match(/^(\d+)\/(\d+)$/)
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : undefined
  return /^\d+(\.\d+)?$/.test(w) ? Number(w) : undefined
}

/** Read one phrase: quantity words, size, unit and the food name, in any order Indians say them. */
export function parsePhrase(raw: string): Phrase | null {
  const text = raw.trim()
  // "2roti" / "200g" → "2 roti" / "200 g"
  const words = text.toLowerCase().replace(/(\d)([a-z])/g, '$1 $2').replace(/[^\p{L}\p{N}./ ]+/gu, ' ').split(/\s+/).filter(Boolean)
  let qty: number | undefined, unit: PortionUnit | undefined, size: Size | undefined, vague = false
  let weak = false // qty came from "a"/"an": a real number later ("a total of 3") replaces it
  const food: string[] = []
  for (const w of words) {
    const n = numeric(w) ?? NUMBERS[w]
    const article = w === 'a' || w === 'an'
    if (n !== undefined && !article && (qty === undefined || weak)) { qty = n; weak = false; vague = false; continue }
    if (article) { if (qty === undefined) { qty = 1; weak = true } continue }
    if (VAGUE[w] !== undefined && (qty === undefined || weak)) { qty = VAGUE[w]; weak = false; vague = true; continue }
    if (SIZES[w] && !size) { size = SIZES[w]; continue }
    const u = unitOf(w)
    if (u && !unit) { unit = u; continue }
    if (FILLER.has(w)) continue
    food.push(PLURALS[w] ?? w)
  }
  if (!food.length) return null
  return { qty: qty ?? 1, unit, size, food: food.join(' '), vague, text }
}

export function splitMeal(text: string): Phrase[] {
  return text.split(SPLIT).map(parsePhrase).filter((p): p is Phrase => p !== null)
}

/**
 * Catalog lookup the local parser trusts: the Hinglish canonical dish first, then a strong name match that prefers
 * Indian dishes over raw ingredients, then the same with leading words dropped ("moong dal khichdi" → "khichdi").
 */
let byId: { from: CatalogFood[]; map: Map<string, CatalogFood> } | null = null
/** `dropped` = how many leading words had to go ("restaurant styled pav bhaji" → 2): those words may change the dish. */
function lookupWithDrop(catalog: CatalogFood[], food: string): { food: CatalogFood; dropped: number } | null {
  if (byId?.from !== catalog) byId = { from: catalog, map: new Map(catalog.map(f => [f.id, f])) }
  const canon = CANONICAL[food] && byId.map.get(CANONICAL[food])
  if (canon) return { food: canon, dropped: 0 }
  const words = food.split(' ')
  for (let i = 0; i < words.length; i++) {
    const q = words.slice(i).join(' ')
    if (i > 0 && q.length < 4) break
    const c = CANONICAL[q] && byId.map.get(CANONICAL[q])
    if (c) return { food: c, dropped: i }
    const hits = searchFoods(catalog, q, 5) as SearchResult[]
    const best = hits.find(h => h.score >= 600 && h.src !== 'off' && !/\b(raw|dry|dried|uncooked|powder|flour)\b/i.test(h.name)) ?? hits.find(h => h.score >= 900)
    if (best) return { food: best, dropped: i }
  }
  return null
}

/**
 * One countable piece of a catalog dish, from its own serving: "1 piece" 140 g → 140; "2 idli" 300 g → 150 each.
 * A serving that is a katori, plate or glass is not a piece, so the portion table decides instead.
 */
function pieceGrams(food: CatalogFood): number | undefined {
  const g = servingGrams(food), label = food.serving_label ?? ''
  if (!g || /katori|bowl|plate|glass|cup|tbsp|tsp|scoop|serving|ml\b|\bg\b/i.test(label)) return undefined
  const n = Number(label.match(/^(\d+(?:\.\d+)?)\s/)?.[1] ?? 1)
  return g / (n > 0 ? n : 1)
}

/** Grams for a phrase: per-food units from portions.json; vague fats ("thoda ghee") count in teaspoons. */
export function phraseGrams(p: Phrase, food?: CatalogFood | null): number | null {
  const name = `${p.food} ${food?.name ?? ''}`
  if (p.unit === 'g' || p.unit === 'ml') return p.qty
  if (p.vague && !p.unit && isFat(name)) return p.qty * 2 * (unitGrams(name, 'tsp') ?? 5) // thoda = 1 tsp, zyada = 3 tsp
  const one = unitGrams(name, p.unit ?? defaultUnit(name), p.size, food ? pieceGrams(food) : undefined)
  return one === null ? null : one * p.qty
}

const unitLabel = (p: Phrase, name: string) => {
  const u = p.unit ?? defaultUnit(name)
  const n = p.vague ? (p.qty < 1 ? 'a little' : 'extra') : String(round1(p.qty))
  if (p.vague && !p.unit && isFat(name)) return `${round1(p.qty * 2)} tsp`
  if (!u || u === 'piece') return p.vague ? n : `${n} ${p.size ? p.size + ' ' : ''}${p.qty === 1 ? 'piece' : 'pieces'}`
  return `${n} ${u}${p.qty !== 1 && !['g', 'ml', 'tsp', 'tbsp'].includes(u) ? 's' : ''}`
}

/** Parse a whole meal locally. Items carry real numbers from the catalog; `unmatched` phrases go to the AI. */
export function parseMealLocally(catalog: CatalogFood[], text: string): LocalParse {
  const items: LocalParse['items'] = []
  const unmatched: string[] = []
  const tooLarge: string[] = []
  const partial: string[] = []
  for (const raw of text.split(SPLIT)) {
    const p = parsePhrase(raw)
    if (!p) continue
    // A product whose name starts with a number ("5 Star", "7 Up") is one item, not 5 × "star".
    const whole = /^\s*\d/.test(raw) ? (searchFoods(catalog, raw.trim(), 1) as SearchResult[])[0] : undefined
    if (whole && whole.score >= 800 && whole.name.toLowerCase().startsWith(raw.trim().toLowerCase())) {
      const g = phraseGrams({ qty: 1, food: raw.trim(), text: raw }, whole) ?? 100
      items.push({ name: whole.name, qty: 1, unit: 'serving', grams: Math.round(g), serving_label: whole.serving_label ?? '1 serving',
        calories: Math.round(whole.calories * g / 100), protein_g: round1(whole.protein_g * g / 100), carbs_g: round1(whole.carbs_g * g / 100),
        fat_g: round1(whole.fat_g * g / 100), matched: { id: whole.id, name: whole.name }, source: 'local' })
      continue
    }
    const hit = lookupWithDrop(catalog, p.food)
    const food = hit?.food ?? null
    const grams = food ? phraseGrams(p, food) : null
    // Absurd amounts ("99999 roti") are never logged silently. Gram/ml amounts are the grams themselves ("200 ml").
    const absurd = !!grams && (grams > 2500 || (p.unit !== 'g' && p.unit !== 'ml' && p.qty > 50))
    if (food && absurd) tooLarge.push(p.text)
    if (!food || !grams || absurd) { unmatched.push(p.text); continue }
    if (hit!.dropped > 0) partial.push(p.text)
    const k = grams / 100
    items.push({
      name: food.name, qty: round1(p.qty), unit: p.unit ?? defaultUnit(`${p.food} ${food.name}`) ?? 'serving', grams: Math.round(grams),
      serving_label: unitLabel(p, `${p.food} ${food.name}`),
      calories: Math.round(food.calories * k), protein_g: round1(food.protein_g * k), carbs_g: round1(food.carbs_g * k), fat_g: round1(food.fat_g * k),
      matched: { id: food.id, name: food.name }, source: 'local',
    })
  }
  return { items, unmatched, tooLarge, partial }
}
