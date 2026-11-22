import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

// Both apps must read the same portion table: `npm run apk` copies it, this fails if the copies drift.
it('Android portions.json matches the web one', () => {
  expect(readFileSync('native/app/src/main/assets/portions.json', 'utf8')).toBe(readFileSync('src/lib/portions.json', 'utf8'))
})

// Catalog entries the audit found wrong stay fixed (scripts/catalog-fixes.mjs), in both apps' copies.
it('catalog audit fixes hold', () => {
  const web = readFileSync('public/food-catalog.json', 'utf8')
  expect(readFileSync('native/app/src/main/assets/food-catalog.json', 'utf8')).toBe(web)
  const foods: { id: string; name: string; serving_g?: number; serving_label?: string }[] = JSON.parse(web).foods
  const by = (id: string) => foods.find(f => f.id === id)
  expect(by('indb-asc056')?.serving_g).toBe(50)              // boiled egg, not 151 g
  expect(by('indb-osr041')?.serving_g).toBeLessThanOrEqual(40) // milk cookie, not 125 g
  expect(by('off-amul-roti-amul-')).toBeUndefined()            // "Amul Roti" with 30.8 g protein dropped
  expect(foods.some(f => /\bgee\b|proteni/i.test(f.name))).toBe(false)
  expect(foods.filter(f => /^1 (cookie|biscuit|egg)$/i.test(f.serving_label ?? '') && (f.serving_g ?? 0) > 80)).toEqual([])
})
