import { describe, expect, it } from 'vitest'
import type { CatalogFood } from './catalog'
import { parseMealLocally, parsePhrase, splitMeal } from './hinglish'
import { asksOil, defaultUnit, isHomeCooked, isRestaurant, OIL, oilLine, unitGrams } from './portions'

const food = (id: string, name: string, calories: number, extra: Partial<CatalogFood> = {}): CatalogFood =>
  ({ id, name, calories, protein_g: 3, carbs_g: 20, fat_g: 2, unit: '100g', base: 100, src: 'composed', ...extra }) as CatalogFood
const CATALOG = [
  food('dish-dal-tadka', 'Dal Tadka', 135, { serving_g: 250, serving_label: '1 katori' }),
  food('x-roti', 'Chapati/Roti', 297, { src: 'indb', serving_g: 40, serving_label: '1 roti' }),
  food('usda-2708408', 'Rice, white, cooked, no added fat', 129, { src: 'fndds' }),
  food('x-ghee', 'Ghee, clarified butter', 880, { src: 'sr' }),
  food('dish-masala-chai-1-cup', 'Masala Chai (1 cup)', 41, { serving_g: 200, serving_label: '1 cup' }),
  food('x-vadapav', 'Vada Pav', 272, { serving_g: 140, serving_label: '1 piece' }),
]

describe('Hinglish quantities', () => {
  it('do roti = 2 roti', () => expect(parsePhrase('do roti')).toMatchObject({ qty: 2, food: 'roti' }))
  it('aadha katori = 0.5 katori', () => expect(parsePhrase('aadha katori dal')).toMatchObject({ qty: 0.5, unit: 'katori', food: 'dal' }))
  it('dedh / dhai / sava', () => {
    expect(parsePhrase('dedh plate poha')?.qty).toBe(1.5)
    expect(parsePhrase('dhai roti')?.qty).toBe(2.5)
    expect(parsePhrase('sava katori chawal')?.qty).toBe(1.25)
  })
  it('Marathi numbers and units', () => expect(parsePhrase('don vati varan')).toMatchObject({ qty: 2, unit: 'katori', food: 'varan' }))
  it('digits, fractions and glued units', () => {
    expect(parsePhrase('1/2 glass milk')).toMatchObject({ qty: 0.5, unit: 'glass' })
    expect(parsePhrase('200g paneer')).toMatchObject({ qty: 200, unit: 'g', food: 'paneer' })
  })
  it('vague amounts and sizes', () => {
    expect(parsePhrase('thoda ghee')).toMatchObject({ qty: 0.5, vague: true, food: 'ghee' })
    expect(parsePhrase('teen chhoti roti')).toMatchObject({ qty: 3, size: 'small', food: 'roti' })
    expect(parsePhrase('2 bade parathe')).toMatchObject({ qty: 2, size: 'large', food: 'paratha' })
  })
  it('splits a meal on commas, aur, and, plus', () =>
    expect(splitMeal('2 roti, 1 katori dal aur chai and thoda ghee').map(p => p.food)).toEqual(['roti', 'dal', 'chai', 'ghee']))
})

describe('portion grams are per food, never one global number', () => {
  it('katori depends on the food', () => {
    expect(unitGrams('dal', 'katori')).toBe(150)
    expect(unitGrams('bhindi sabzi', 'katori')).toBe(120)
    expect(unitGrams('chawal', 'katori')).toBe(130)
    expect(unitGrams('dahi', 'katori')).toBe(150)
  })
  it('roti sizes', () => {
    expect(unitGrams('roti', 'piece', 'small')).toBe(30)
    expect(unitGrams('roti', 'piece', 'medium')).toBe(40)
    expect(unitGrams('roti', 'piece', 'large')).toBe(55)
  })
  it('glass, spoons, scoop', () => {
    expect(unitGrams('milk', 'glass')).toBe(250)
    expect(unitGrams('ghee', 'tsp')).toBe(5)
    expect(unitGrams('ghee', 'tbsp')).toBe(15)
    expect(unitGrams('whey', 'scoop')).toBe(30)
  })
  it('a dish\'s own piece weight beats a generic word in its name', () => expect(unitGrams('vada pav', 'piece', undefined, 140)).toBe(140))
  it('default units', () => {
    expect(defaultUnit('dal')).toBe('katori')
    expect(defaultUnit('roti')).toBe('piece')
    expect(defaultUnit('ghee')).toBe('tsp')
  })
})

describe('local meal parse', () => {
  const r = parseMealLocally(CATALOG, '2 roti, 1 katori dal, thoda ghee, chai, xyzzy')
  it('matches known foods with real grams', () => {
    expect(r.items.map(i => [i.name, i.grams])).toEqual([
      ['Chapati/Roti', 80], ['Dal Tadka', 150], ['Ghee, clarified butter', 5], ['Masala Chai (1 cup)', 150],
    ])
    expect(r.items[1].calories).toBe(Math.round(135 * 1.5))
  })
  it('sends only unknown words to the AI', () => expect(r.unmatched).toEqual(['xyzzy']))
  it('a product named with a number stays one item', () => {
    const r = parseMealLocally([...CATALOG, food('x-5star', '5 Star (Cadbury)', 470, { src: 'off', serving_g: 40, serving_label: '1 bar' })], '5 star')
    expect(r.items).toMatchObject([{ name: '5 Star (Cadbury)', qty: 1, grams: 40 }])
  })
  it('a dish named after a fat is not counted in teaspoons', () => {
    const r = parseMealLocally([...CATALOG, food('dish-paneer-butter-masala', 'Paneer Butter Masala', 216, { serving_g: 280, serving_label: '1 katori' })], '2 paneer butter masala')
    expect(r.items[0]).toMatchObject({ name: 'Paneer Butter Masala', grams: 300 })
  })
  it('absurd amounts are never logged silently', () => expect(parseMealLocally(CATALOG, '99999 roti')).toMatchObject({ items: [], unmatched: ['99999 roti'], tooLarge: ['99999 roti'] }))
  it('fried dishes already count their oil', () => { expect(isHomeCooked('Okra/Lady\'s fingers fry (Bhindi sabzi)')).toBe(false); expect(isHomeCooked('Samosa')).toBe(false) })
  it('a messy restaurant order: pav bhaji is a plate, "a total of 3" is 3, 200 ml is not too large, modifiers flag the AI', () => {
    const cat = [...CATALOG,
      food('dish-pav-bhaji', 'Pav Bhaji', 164.8, { serving_g: 400, serving_label: '1 plate' }),
      food('dish-pav-2-pieces', 'Pav (2 pieces)', 251.2, { serving_g: 90, serving_label: '2 pieces' }),
      food('x-thumsup', 'Thums Up', 42, { src: 'fndds' })]
    const r = parseMealLocally(cat, 'restaurant styled pav bhaji with butter a lot and a total of 3 pav with 200ml thums up')
    expect(r.items.find(i => i.name === 'Pav Bhaji')).toMatchObject({ grams: 300, serving_label: '1 plate' })
    expect(r.items.find(i => i.name === 'Pav (2 pieces)')).toMatchObject({ qty: 3, grams: 135 })
    expect(r.items.find(i => i.name === 'Thums Up')).toMatchObject({ grams: 200 })
    expect(r.tooLarge).toEqual([])
    expect(r.partial).toEqual(['restaurant styled pav bhaji'])
  })
  it('chawal is cooked rice', () => expect(parseMealLocally(CATALOG, 'aadha katori chawal').items[0]).toMatchObject({ name: 'Rice, white, cooked, no added fat', grams: 65 }))
})

describe('oil / ghee line', () => {
  it('Ghee, 2 tsp, 90 kcal for one normal serving', () =>
    expect(oilLine('normal', 'ghee', 1)).toMatchObject({ name: 'Ghee', qty: 10, unit: 'g', serving_label: '2 tsp', calories: 90, fat_g: 10, oil: true }))
  it('scales per serving and shows tablespoons', () => expect(oilLine('lot', 'oil', 2)).toMatchObject({ name: 'Cooking oil', qty: 30, serving_label: '2 tbsp', calories: 270 }))
  it('none adds nothing', () => expect(oilLine('none', 'oil', 3)).toBeNull())
  it('the oil question skips dishes whose recipe already has the fat', () => {
    expect(asksOil('Moong Dal', 3)).toBe(true)
    expect(asksOil('Dal Tadka', 6)).toBe(false)
    expect(asksOil('Paneer Butter Masala', 17.8)).toBe(false)
    expect(asksOil('Rajma (Kidney Bean Curry)', 9.5)).toBe(false)
    expect(OIL.home_default).toBe('little')
  })
  it('home-cooked and restaurant tags', () => {
    expect(isHomeCooked('Dal Tadka')).toBe(true)
    expect(isHomeCooked('Aloo Paratha')).toBe(true)
    expect(isHomeCooked('Chapati/Roti')).toBe(false)
    expect(isRestaurant('Butter Chicken')).toBe(true)
    expect(OIL.restaurant_default).toBe('lot')
  })
})
