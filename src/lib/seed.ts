import type { Food, MealType, Recipe, Settings, WorkoutPlan } from './types'

const id = (s: string) => s // stable, human-readable ids for seeded rows

export const SEED_MEAL_TYPES: MealType[] = [
  { id: id('meal-breakfast'), name: 'Breakfast', time: '08:20', position: 0 },
  { id: id('meal-lunch'), name: 'Lunch', time: '13:00', position: 1 },
  { id: id('meal-snack'), name: 'Evening Snack', time: '17:30', position: 2 },
  { id: id('meal-dinner'), name: 'Dinner', time: '21:00', position: 3 },
]

export const SEED_SETTINGS: Settings = {
  id: 'settings',
  step_goal: 10000,
  rest_days: [0, 6],
  adherence_weights: { diet: 0.4, workout: 0.4, steps: 0.2 },
  diet_tolerance: 0.1,
}

const f = (
  name: string, category: string, unit: Food['unit'], base: number,
  calories: number, protein_g: number, carbs_g: number, fat_g: number,
  extra: Partial<Food> = {},
): Food => ({ id: id('food-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')), name, category, unit, base, calories, protein_g, carbs_g, fat_g, ...extra })

export const SEED_FOODS: Food[] = [
  f('Chicken Breast', 'Protein', '100g', 100, 165, 31, 0, 3.6),
  f('Whole Egg', 'Protein', 'piece', 1, 78, 6.3, 0.6, 5.3),
  f('Egg White', 'Protein', 'piece', 1, 17, 3.6, 0.2, 0.1),
  f('Paneer', 'Protein', '100g', 100, 296, 20, 3.4, 22),
  f('Whey Protein', 'Protein', 'scoop', 1, 120, 24, 3, 1.5),
  f('Greek Yogurt', 'Protein', '100g', 100, 59, 10, 3.6, 0.4),
  f('Salmon', 'Protein', '100g', 100, 208, 20, 0, 13),
  f('White Rice, cooked', 'Carbs', '100g', 100, 130, 2.7, 28, 0.3),
  f('Brown Rice, cooked', 'Carbs', '100g', 100, 123, 2.7, 26, 1),
  f('Oats', 'Carbs', '100g', 100, 389, 16.9, 66, 6.9),
  f('Brown Bread', 'Carbs', 'slice', 1, 74, 3.6, 12.3, 1),
  f('Roti / Chapati', 'Carbs', 'piece', 1, 104, 3, 20, 1.5),
  f('Banana', 'Carbs', 'piece', 1, 105, 1.3, 27, 0.4),
  f('Potato, boiled', 'Carbs', '100g', 100, 87, 2, 20, 0.1),
  f('Pasta, cooked', 'Carbs', '100g', 100, 158, 5.8, 31, 0.9),
  f('Olive Oil', 'Fats', 'tbsp', 1, 119, 0, 0, 13.5),
  f('Peanut Butter', 'Fats', 'tbsp', 1, 94, 4, 3.2, 8),
  f('Almonds', 'Fats', '100g', 100, 579, 21, 22, 50),
  f('Milk, full fat', 'Dairy', '100ml', 100, 61, 3.2, 4.8, 3.3),
  f('Milk, toned', 'Dairy', '100ml', 100, 47, 3.1, 4.7, 1.7),
  f('Cheese Slice', 'Dairy', 'slice', 1, 68, 4, 1, 5),
  f('Mixed Vegetables', 'Vegetables', '100g', 100, 65, 2.6, 13, 0.5),
  f('Broccoli', 'Vegetables', '100g', 100, 34, 2.8, 7, 0.4),
  f('Spinach', 'Vegetables', '100g', 100, 23, 2.9, 3.6, 0.4),
  f('Salad Bowl', 'Vegetables', '100g', 100, 30, 1.5, 5, 0.4),
  f('Dal, cooked', 'Protein', '100g', 100, 116, 9, 20, 0.4),
  f('Curry Sauce', 'Other', '100g', 100, 90, 1.5, 8, 6),
  f('Dark Chocolate 70%', 'Other', '100g', 100, 598, 7.8, 46, 43),
]

const foodId = (name: string) => 'food-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

export const SEED_RECIPES: Recipe[] = [
  {
    id: id('recipe-chicken-rice-bowl'), name: 'Chicken Rice Bowl', favorite: true,
    ingredients: [
      { food_id: foodId('Chicken Breast'), qty: 150 },
      { food_id: foodId('White Rice, cooked'), qty: 200 },
      { food_id: foodId('Mixed Vegetables'), qty: 100 },
      { food_id: foodId('Curry Sauce'), qty: 20 },
    ],
  },
  {
    id: id('recipe-protein-oats'), name: 'Protein Oats', favorite: true,
    ingredients: [
      { food_id: foodId('Oats'), qty: 60 },
      { food_id: foodId('Whey Protein'), qty: 1 },
      { food_id: foodId('Milk, toned'), qty: 250 },
      { food_id: foodId('Banana'), qty: 1 },
    ],
  },
  {
    id: id('recipe-eggs-toast'), name: '4 Eggs + Toast',
    ingredients: [
      { food_id: foodId('Whole Egg'), qty: 4 },
      { food_id: foodId('Brown Bread'), qty: 2 },
      { food_id: foodId('Olive Oil'), qty: 1 },
    ],
  },
]

interface SeedEx { name: string; sets: number; reps: string; target: string }
const day = (name: string, focus: string, position: number, list: SeedEx[]) => ({
  id: id('day-' + (position + 1)),
  plan_id: 'plan-forge',
  name, focus, position,
  exercises: list.map((e, i) => ({
    id: id(`wex-${position + 1}-${i + 1}`),
    exercise_id: 'ex-' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: e.name,
    sets: e.sets, reps: e.reps, target: e.target, position: i,
  })),
})

export const SEED_PLAN: WorkoutPlan = {
  id: id('plan-forge'),
  name: 'FORGE — Strength + Aesthetics',
  active: true,
  days: [
    day('Day 1 — Upper Strength', 'Strength', 0, [
      { name: 'Bench Press', sets: 4, reps: '5', target: '58–60 kg' },
      { name: 'Weighted Pull-ups', sets: 4, reps: '5', target: '+20–25 kg' },
      { name: 'Seated Cable Row', sets: 3, reps: '8', target: 'Moderate' },
      { name: 'DB Shoulder Press', sets: 3, reps: '8', target: '14–18 kg / hand' },
      { name: 'Cable Tricep Pushdown', sets: 3, reps: '12', target: '' },
      { name: 'Lat Pulldown — Wide Grip', sets: 3, reps: '10', target: 'Moderate' },
      { name: 'DB Bicep Curl', sets: 3, reps: '10', target: '' },
      { name: 'Hanging Knee Raise', sets: 3, reps: '15', target: '' },
    ]),
    day('Day 2 — Lower Strength', 'Strength', 1, [
      { name: 'Squat, Rack — Full Depth', sets: 4, reps: '5', target: '70–75 kg, build to 85+' },
      { name: 'Hack Squat', sets: 3, reps: '8', target: 'Moderate-heavy' },
      { name: 'Romanian Deadlift — DB', sets: 3, reps: '8', target: '70–80 kg' },
      { name: 'Leg Extension', sets: 3, reps: '12', target: 'Moderate' },
      { name: 'Standing Calf Raise', sets: 4, reps: '15', target: '' },
      { name: 'Plank', sets: 3, reps: '45 sec', target: '' },
    ]),
    day('Day 3 — Upper Aesthetics', 'Aesthetics', 2, [
      { name: 'Incline DB Press', sets: 3, reps: '10', target: '' },
      { name: 'Overhead Cable Tricep Extension', sets: 3, reps: '12', target: '' },
      { name: 'Pec Dec Fly', sets: 3, reps: '12', target: '' },
      { name: 'Cable Lower-Chest Fly', sets: 3, reps: '12', target: '' },
      { name: 'Lat Pulldown — Close Grip', sets: 3, reps: '10', target: '' },
      { name: 'Cable Rear Delt Fly', sets: 3, reps: '15', target: '' },
      { name: 'Cable Lateral Raise', sets: 3, reps: '15', target: '' },
      { name: 'Cable Bicep Curl', sets: 3, reps: '12', target: '' },
      { name: 'Cable Crunch', sets: 3, reps: '15', target: '' },
    ]),
    day('Day 4 — Lower Aesthetics', 'Aesthetics', 3, [
      { name: 'Hack Squat', sets: 3, reps: '12', target: '' },
      { name: 'DB Reverse Lunge', sets: 3, reps: '10 / leg', target: '' },
      { name: 'Leg Extension', sets: 3, reps: '15', target: '' },
      { name: 'Leg Curl / DB RDL', sets: 3, reps: '12', target: '' },
      { name: 'DB Hip Thrust', sets: 3, reps: '15', target: '' },
      { name: 'Calf Raise', sets: 4, reps: '15', target: '' },
      { name: 'Plank', sets: 3, reps: '45 sec', target: '' },
    ]),
    day('Day 5 — Arms & Weak Points', 'Aesthetics', 4, [
      { name: 'Cable Bicep Curl', sets: 3, reps: '12', target: '' },
      { name: 'DB Hammer Curl', sets: 3, reps: '12', target: '' },
      { name: 'Cable Tricep Pushdown', sets: 3, reps: '12', target: '' },
      { name: 'Overhead Cable Tricep Extension', sets: 3, reps: '12', target: '' },
      { name: 'Face Pulls', sets: 3, reps: '15', target: '' },
    ]),
  ],
}

export const SEED_EXERCISES = [...new Map(
  SEED_PLAN.days.flatMap(d => d.exercises.map(e => [e.exercise_id, {
    id: e.exercise_id,
    name: SEED_PLAN.days.flatMap(x => x.exercises).find(x => x.exercise_id === e.exercise_id) ? nameOf(e.exercise_id) : e.exercise_id,
  }])),
).values()]

function nameOf(exId: string) {
  return exId.replace(/^ex-/, '').split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}
