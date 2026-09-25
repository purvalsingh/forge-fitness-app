import type { Food } from './types'

/** Look up a packaged product on Open Food Facts (ODbL, free, CORS-enabled). */
export async function lookupBarcode(code: string): Promise<(Food & { serving_g?: number; serving_label?: string }) | null> {
  const clean = code.replace(/\D/g, '')
  if (clean.length < 8 || clean.length > 14) return null
  const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${clean}.json?fields=product_name,brands,nutriments,serving_quantity,serving_size`)
  if (!r.ok) return null
  const j = await r.json()
  const p = j?.product
  const n = p?.nutriments
  if (j?.status !== 1 || !p?.product_name || !n) return null
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
  const kcal = num(n['energy-kcal_100g']) || num(n['energy_100g']) / 4.184
  if (!kcal && !num(n.proteins_100g)) return null
  const serving = num(p.serving_quantity)
  return {
    id: `off-${clean}`,
    name: String(p.product_name).slice(0, 80),
    brand: p.brands ? String(p.brands).split(',')[0].slice(0, 40) : undefined,
    unit: '100g', base: 100,
    calories: Math.round(kcal * 10) / 10,
    protein_g: num(n.proteins_100g), carbs_g: num(n.carbohydrates_100g), fat_g: num(n.fat_100g),
    fiber_g: num(n.fiber_100g) || undefined, sugar_g: num(n.sugars_100g) || undefined,
    sodium_mg: n.sodium_100g ? Math.round(num(n.sodium_100g) * 1000) : undefined,
    category: 'Packaged',
    ...(serving > 0 && serving < 2000 ? { serving_g: serving, serving_label: p.serving_size ? String(p.serving_size).slice(0, 40) : '1 serving' } : {}),
  }
}

/** Native BarcodeDetector exists in Android Chrome/WebView; iOS Safari lacks it (manual entry there). */
export const barcodeSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window
