/**
 * Abuse guards around the food AI. Pure functions — unit-tested in src/lib/guard.test.ts.
 *
 * Two layers: a cheap pre-check that rejects obvious non-food / prompt-injection text before it
 * costs a Gemini call, and a post-check that refuses to pass on physically implausible numbers
 * even if the model produced them.
 */

const NON_FOOD = [
  'bomb', 'nuke', 'nuclear', 'uranium', 'plutonium', 'grenade', 'bullet', 'gun', 'missile', 'dynamite', 'explosive',
  'poison', 'cyanide', 'arsenic', 'mercury', 'bleach', 'detergent', 'soap', 'shampoo', 'toothpaste', 'acid',
  'petrol', 'gasoline', 'diesel', 'kerosene', 'fuel', 'pesticide', 'rat poison', 'insecticide', 'phenyl',
  'plastic', 'glass shards', 'broken glass', 'cement', 'concrete', 'brick', 'stone', 'rock', 'pebble', 'sand', 'soil', 'mud',
  'metal', 'iron rod', 'nail', 'screw', 'coin', 'battery', 'phone', 'laptop', 'computer', 'car', 'bike', 'tyre', 'tire',
  'cardboard', 'paper', 'tissue', 'cloth', 'shoe', 'sock', 'paint', 'glue', 'ink', 'crayon', 'candle', 'cigarette',
  'human', 'person', 'baby', 'corpse', 'blood', 'urine', 'poop', 'feces',
  'sun', 'moon', 'planet', 'galaxy', 'star', 'universe', 'building', 'house', 'mountain', 'ocean',
  'tide pod', 'lava', 'fire', 'electricity', 'wifi', 'air', 'nothing',
]
// "star fruit", "rock salt", "sandwich" etc. are food: an allow-list wins over the block-list.
const FOOD_EXCEPTIONS = [
  'star fruit', 'star anise', 'rock salt', 'rock sugar', 'sandwich', 'sand lobster', 'moon cake', 'mooncake', 'sun dried',
  'sunflower', 'sundae', 'paper dosa', 'paper roast', 'rice paper', 'house salad', 'fire roasted', 'car cake',
  'stone flower', 'stone ground', 'glass noodles', 'fish ball', 'air fried', 'airfried', 'coconut water', 'blood orange',
  'baby corn', 'baby potato', 'baby potatoes', 'baby spinach', 'baby carrot', 'baby carrots', 'mud crab', 'rock melon',
  'squid ink', 'gun powder', 'sun dried tomato', 'star apple',
]

const INJECTION = /(ignore|disregard|forget)\s+(all\s+|the\s+|your\s+|previous\s+|prior\s+|above\s+)*(instructions|rules|prompt)|system\s*prompt|you\s+are\s+now|act\s+as|developer\s+mode|jailbreak|\bDAN\b|reveal\s+(your|the)\s+(prompt|instructions)|<\/?(system|entry)>/i

export type PreCheck = { ok: true } | { ok: false; reason: string }

function words(text: string) {
  return ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `
}

export function preCheckFoodText(text: unknown): PreCheck {
  if (typeof text !== 'string') return { ok: false, reason: 'Describe what you ate.' }
  const t = text.trim()
  if (t.length < 2) return { ok: false, reason: 'Describe what you ate.' }
  if (t.length > 500) return { ok: false, reason: 'Keep it under 500 characters — log one meal at a time.' }
  if (INJECTION.test(t)) return { ok: false, reason: 'That doesn\'t look like a meal. Describe the food you ate.' }
  let w = words(t)
  for (const ok of FOOD_EXCEPTIONS) w = w.replaceAll(` ${ok} `, ' ').replaceAll(ok, '')
  const hit = NON_FOOD.find(b => w.includes(` ${b} `) || w.includes(` ${b}s `))
  if (hit) return { ok: false, reason: `"${hit}" isn't food. FORGE only logs things people can actually eat.` }
  // Absurd counts: "50 rotis", "100 eggs"
  const m = t.match(/\b(\d{2,})\s*(roti|rotis|chapati|eggs?|samosas?|idlis?|dosas?|puris?|parathas?|vada|pav|burgers?|pizzas?|bananas?|laddoos?|plates?|bowls?)\b/i)
  if (m && Number(m[1]) > 20) return { ok: false, reason: `${m[1]} ${m[2]} in one sitting isn't realistic. Log what you actually ate.` }
  const kg = t.match(/\b(\d+(?:\.\d+)?)\s*(kg|kilo|kilos|litre|liter|litres|liters|l)\b/i)
  if (kg && Number(kg[1]) > 3) return { ok: false, reason: `${kg[1]} ${kg[2]} at once isn't realistic. Check the amount.` }
  return { ok: true }
}

export interface AIFoodItem {
  name: string; qty: number; unit: string; grams: number
  calories: number; protein_g: number; carbs_g: number; fat_g: number
  fiber_g?: number; edible: boolean; confidence: number; serving_label?: string
}

export interface PostCheck {
  items: AIFoodItem[]
  rejected: { name: string; reason: string }[]
}

const clampNum = (n: unknown, lo: number, hi: number) =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : NaN

/** Keep only physically plausible items. Never trust model numbers blindly. */
export function postCheckFood(raw: { is_food_request?: boolean; rejection_reason?: string; items?: unknown[] } | null): PostCheck & { notFood?: string } {
  if (!raw || typeof raw !== 'object') return { items: [], rejected: [], notFood: 'The AI returned nothing usable.' }
  if (raw.is_food_request === false) {
    return { items: [], rejected: [], notFood: String(raw.rejection_reason || 'That isn\'t a food log. Describe what you ate.').slice(0, 200) }
  }
  const items: AIFoodItem[] = []
  const rejected: { name: string; reason: string }[] = []
  for (const it of (raw.items ?? []).slice(0, 25) as Record<string, unknown>[]) {
    const name = String(it?.name ?? '').trim().slice(0, 80)
    if (!name) continue
    if (it.edible === false) { rejected.push({ name, reason: 'Not something people can eat.' }); continue }
    if (preCheckFoodText(name).ok === false) { rejected.push({ name, reason: 'Not something people can eat.' }); continue }
    const grams = clampNum(it.grams, 0, 100000)
    const kcal = clampNum(it.calories, 0, 100000)
    const p = clampNum(it.protein_g, 0, 10000), c = clampNum(it.carbs_g, 0, 10000), f = clampNum(it.fat_g, 0, 10000)
    if ([grams, kcal, p, c, f].some(Number.isNaN)) { rejected.push({ name, reason: 'Incomplete nutrition data.' }); continue }
    if (grams > 2500) { rejected.push({ name, reason: 'Portion too large to be one serving.' }); continue }
    if (kcal > 3000) { rejected.push({ name, reason: 'Over 3000 kcal for one item isn\'t plausible.' }); continue }
    // Pure fat is 9 kcal/g; nothing edible is denser. Water/tea sit near 0.
    if (grams > 0 && kcal / grams > 9.2) { rejected.push({ name, reason: 'Calories don\'t fit the portion.' }); continue }
    if (grams > 0 && p + c + f > grams * 1.02) { rejected.push({ name, reason: 'Macros weigh more than the food.' }); continue }
    const macroKcal = 4 * p + 4 * c + 9 * f
    if (kcal > 40 && Math.abs(macroKcal - kcal) > Math.max(40, kcal * 0.3)) {
      rejected.push({ name, reason: 'Calories and macros disagree.' }); continue
    }
    items.push({
      name, grams: Math.round(grams),
      qty: clampNum(it.qty, 0.1, 50) || 1,
      unit: String(it.unit ?? 'serving').slice(0, 12),
      serving_label: it.serving_label ? String(it.serving_label).slice(0, 40) : undefined,
      calories: Math.round(kcal), protein_g: round1(p), carbs_g: round1(c), fat_g: round1(f),
      fiber_g: Number.isFinite(clampNum(it.fiber_g, 0, 200)) ? round1(clampNum(it.fiber_g, 0, 200)) : undefined,
      edible: true,
      confidence: Number.isFinite(clampNum(it.confidence, 0, 1)) ? clampNum(it.confidence, 0, 1) : 0.5,
    })
  }
  const total = items.reduce((a, i) => a + i.calories, 0)
  if (total > 8000) return { items: [], rejected, notFood: 'That adds up to more than anyone eats in one meal. Check the amounts.' }
  if (items.length === 0 && rejected.length > 0) {
    return { items, rejected, notFood: rejected.map(r => `${r.name}: ${r.reason}`).join(' ') }
  }
  return { items, rejected }
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** Gemini API keys have a fixed shape; anything else is rejected before it is stored or used. */
export const GEMINI_KEY_RE = /^AIza[0-9A-Za-z_-]{35}$/
