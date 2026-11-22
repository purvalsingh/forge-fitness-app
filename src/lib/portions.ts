import table from './portions.json'

/**
 * Indian serving sizes, per food, from one shared table (portions.json, also bundled in the Android app).
 * A katori of dal is not a katori of sabzi: every unit resolves through the food first, then a default.
 */
export type PortionUnit = keyof typeof table.units
export type Size = 'small' | 'medium' | 'large'
interface Rule {
  re: RegExp; default_unit?: string; home_cooked?: boolean; restaurant?: boolean; fat?: boolean; already_fried?: boolean
  sizes?: Record<string, number>; grams: Record<string, number>
}

const RULES: Rule[] = table.foods.map(f => {
  const { match, default_unit, home_cooked, restaurant, fat, sizes, already_fried, ...grams } = f as Record<string, unknown>
  return { re: new RegExp(String(match), 'i'), default_unit: default_unit as string | undefined, home_cooked: !!home_cooked,
    restaurant: !!restaurant, fat: !!fat, already_fried: !!already_fried, sizes: sizes as Record<string, number> | undefined, grams: grams as Record<string, number> }
})
const UNIT_OF = new Map<string, PortionUnit>()
for (const [unit, words] of Object.entries(table.units)) for (const w of words) UNIT_OF.set(w, unit as PortionUnit)

export const NUMBERS: Record<string, number> = table.numbers
export const VAGUE: Record<string, number> = table.vague
export const SIZES: Record<string, Size> = table.sizes as Record<string, Size>
export const FILLER = new Set(table.filler)
export const OIL = table.oil
/** Hinglish word → the catalog dish people mean ("chawal" is cooked rice, not raw grain). */
export const CANONICAL: Record<string, string> = table.canonical
export const PLURALS: Record<string, string> = table.plurals
export const unitOf = (word: string): PortionUnit | undefined => UNIT_OF.get(word.toLowerCase())

/** Every rule whose pattern matches this food name, most specific (earliest) first. */
const rulesFor = (name: string) => RULES.filter(r => r.re.test(name))
const firstWith = (name: string, pick: (r: Rule) => unknown) => rulesFor(name).find(pick)

/** The unit a food is normally counted in when none is said: "dal" → katori, "roti" → piece, "ghee" → tsp. */
export const defaultUnit = (name: string) => firstWith(name, r => r.default_unit)?.default_unit as PortionUnit | undefined
export const isFat = (name: string) => rulesFor(name).some(r => r.fat)
/** Cooked at home with oil or ghee you can't see: dal, sabzi, curry, paratha, tadka. Fried dishes already count their oil. */
export const isHomeCooked = (name: string) => { const rs = rulesFor(name); return rs.some(r => r.home_cooked) && !rs.some(r => r.already_fried) }
/** Restaurant and street food: the oil question defaults to "A lot". */
export const isRestaurant = (name: string) => rulesFor(name).some(r => r.restaurant)

/**
 * Grams in ONE unit of this food. g/ml are 1. Size words apply to foods that have sizes (roti small/medium/large).
 * catalogServing is the food's own "1 serving" weight, used for a piece when the table has nothing specific.
 */
export function unitGrams(name: string, unit: PortionUnit | 'serving' | undefined, size?: Size, catalogServing?: number): number | null {
  if (unit === 'g' || unit === 'ml') return 1
  const u = unit ?? defaultUnit(name) ?? 'serving'
  if (u === 'piece' || u === 'serving') {
    const sized = size ? firstWith(name, r => r.sizes?.[size])?.sizes?.[size] : undefined
    if (sized) return sized
    // The dish's own serving wins ("vada pav" is 140 g, not a 40 g pav); the table covers foods without one.
    return catalogServing ?? firstWith(name, r => r.grams.piece)?.grams.piece ?? null
  }
  const own = firstWith(name, r => r.grams[u])?.grams[u]
  return own ?? (table.default_grams as Record<string, number>)[u] ?? null
}

export interface OilLine { name: string; qty: number; unit: 'g'; serving_label: string; calories: number; protein_g: 0; carbs_g: 0; fat_g: number; oil: true }

/** The separate, visible oil/ghee line: level per serving × servings. "Ghee, 2 tsp, 90 kcal". */
export function oilLine(level: string, kind: 'oil' | 'ghee', servings: number): OilLine | null {
  const tsp = (OIL.levels.find(l => l.id === level)?.tsp ?? 0) * Math.max(1, servings)
  if (tsp <= 0) return null
  const g = tsp * OIL.grams_per_tsp
  const label = tsp % 3 === 0 ? `${tsp / 3} tbsp` : `${tsp} tsp`
  return { name: kind === 'ghee' ? 'Ghee' : 'Cooking oil', qty: g, unit: 'g', serving_label: label,
    calories: Math.round(g * OIL.kcal_per_g), protein_g: 0, carbs_g: 0, fat_g: g, oil: true }
}

/**
 * Should the oil question cover this dish? Only lean home-cooked dishes: one whose recipe already carries its fat
 * (over 8 g fat per 100 g, or tadka / makhani / butter / masala / fry in the name) would be counted twice.
 */
export function asksOil(name: string, fatPer100?: number): boolean {
  if (!isHomeCooked(name)) return false
  if (fatPer100 !== undefined && fatPer100 > 8) return false
  return !/\b(tadka|tarka|makhani|butter|masala|fry|fried|korma|kadai|malai)\b/i.test(name)
}

/** True for an item that already IS the oil or ghee (from the parser or the AI), so the question isn't asked twice. */
export const isOilItem = (name: string) => isFat(name)
