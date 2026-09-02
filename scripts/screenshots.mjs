/**
 * Capture every screen into one contact sheet.
 *   node scripts/screenshots.mjs [baseUrl] [outFile]
 * Seeds demo data first so the screens have something to show.
 */
import puppeteer from 'puppeteer-core'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const OUT_DIR = process.argv[3] ?? 'design/screens'
const CHROME = process.env.CHROME_PATH
  ?? '/home/purvals/.cache/puppeteer/chrome/linux-152.0.7977.42/chrome-linux64/chrome'

// Dates must be LOCAL, like the app's own toISO — a UTC slice lands on yesterday east of Greenwich.
const localISO = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = localISO()

/** Demo data written straight into the local store the app reads. */
const seed = () => ({
  'forge:demo': '1',
  'forge:theme': 'dark',
})

const shots = [
  { name: '01-today', path: '/' },
  { name: '02-diet', path: '/diet' },
  { name: '03-add-food-search', path: '/diet', action: 'addFood' },
  { name: '04-add-food-quickmeals', path: '/diet', action: 'quickMeals' },
  { name: '05-ai-describe', path: '/diet', action: 'aiDescribe' },
  { name: '06-camera', path: '/diet/camera' },
  { name: '07-workout', path: '/workout' },
  { name: '08-session', path: '/workout/session/day-1' },
  { name: '09-plan-builder', path: '/more/plan' },
  { name: '10-build-a-plan', path: '/more/plan', action: 'newPlan' },
  { name: '11-progress', path: '/progress' },
  { name: '12-adherence', path: '/adherence' },
  { name: '13-day-detail', path: `/day/${today}` },
  { name: '14-goals', path: '/more/goals' },
  { name: '15-nutrition-target', path: '/more/target' },
  { name: '16-physique-lab', path: '/physique' },
  { name: '17-physique-checkin', path: '/physique', action: 'newCheckin' },
  { name: '18-physique-goal', path: '/physique', action: 'physiqueGoal' },
  { name: '19-foods', path: '/more/foods' },
  { name: '20-food-search', path: '/more/foods', action: 'searchFood' },
  { name: '21-quick-meals', path: '/more/recipes' },
  { name: '22-recipe-editor', path: '/more/recipes?new=1' },
  { name: '23-more', path: '/more' },
  { name: '24-settings', path: '/more/settings' },
  { name: '25-today-light', path: '/', theme: 'light' },
  { name: '26-diet-light', path: '/diet', theme: 'light' },
  { name: '27-progress-light', path: '/progress', theme: 'light' },
  { name: '28-adherence-light', path: '/adherence', theme: 'light' },
]

const sleep = ms => new Promise(r => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
})

const page = await browser.newPage()
await page.setViewport({ width: 412, height: 900, deviceScaleFactor: 2 })

// Prime storage, then plant a few days of history so charts and calendars are not empty.
await page.goto(BASE, { waitUntil: 'networkidle2' })
await page.evaluate(seeds => { for (const [k, v] of Object.entries(seeds)) localStorage.setItem(k, v) }, seed())
await page.reload({ waitUntil: 'networkidle2' })
await sleep(2500)

// The app seeds meal types and foods on first launch; wait for that before planting history.
await page.waitForFunction(() => {
  try {
    return JSON.parse(localStorage.getItem('forge:meal_types') ?? '[]').length > 0
      && JSON.parse(localStorage.getItem('forge:foods') ?? '[]').length > 0
  } catch { return false }
}, { timeout: 15000 })

await page.evaluate((args) => {
  const { days, id } = args
  const rid = () => id + Math.random().toString(36).slice(2, 10)
  const read = k => JSON.parse(localStorage.getItem('forge:' + k) ?? '[]')
  const write = (k, v) => localStorage.setItem('forge:' + k, JSON.stringify(v))

  write('goals', [{ id: rid(), mode: 'cut', current_weight_kg: 84.2, target_weight_kg: 78,
    activity_level: 'moderate', avg_daily_steps: 9000, training_days_per_week: 5,
    training_minutes: 60, rate_kg_per_week: 0.4, updated_at: new Date().toISOString() }])
  write('nutrition_targets', [{ id: rid(), calories: 2489, protein_g: 172, carbs_g: 295, fat_g: 69,
    source: 'calculated', updated_at: new Date().toISOString() }])

  const meals = read('meal_types')
  const foods = read('foods')
  if (meals.length === 0 || foods.length === 0) throw new Error('seed data missing')
  const pick = n => foods.find(f => f.name === n)
  const logs = [], steps = [], weights = [], sessions = []
  const plan = read('workout_plans')[0]

  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86400000)
    const date = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
    const plate = [['Chicken Breast', 180], ['White Rice, cooked', 220], ['Mixed Vegetables', 120],
      ['Whole Egg', 3], ['Oats', 60], ['Milk, toned', 250], ['Greek Yogurt', 150], ['Banana', 1]]
    plate.forEach(([name, qty], j) => {
      const f = pick(name)
      if (!f) return
      const k = qty / f.base
      logs.push({ id: rid(), date, meal_type_id: meals[j % meals.length].id, food_id: f.id, name: f.name,
        qty, unit: f.unit === '100g' ? 'g' : f.unit === '100ml' ? 'ml' : f.unit, source: 'search',
        calories: Math.round(f.calories * k), protein_g: Math.round(f.protein_g * k),
        carbs_g: Math.round(f.carbs_g * k), fat_g: Math.round(f.fat_g * k) })
    })
    steps.push({ id: rid(), date, steps: 7000 + Math.round(Math.random() * 5000) })
    if (i % 3 === 0) weights.push({ id: rid(), date, weight_kg: Math.round((85 - (days - i) * 0.03) * 10) / 10 })
    const dow = new Date(date + 'T00:00:00').getDay()
    if (plan && dow !== 0 && dow !== 6) {
      const day = plan.days[i % plan.days.length]
      sessions.push({ id: rid(), date, plan_id: plan.id, day_id: day.id, day_name: day.name,
        started_at: date + 'T18:00:00', finished_at: date + 'T19:05:00',
        exercises: day.exercises.map(e => ({ workout_exercise_id: e.id, exercise_id: e.exercise_id,
          name: e.name ?? e.exercise_id, target: e.target,
          sets: Array.from({ length: e.sets }, (_, s) => ({ set_no: s + 1, weight_kg: 60, reps: 8, done: true })) })) })
    }
  }
  write('food_logs', logs); write('step_logs', steps); write('weight_logs', weights); write('workout_sessions', sessions)
  return { logs: logs.length, sessions: sessions.length }
}, { days: 40, id: 'demo-' }).then(r => console.error('seeded', JSON.stringify(r)))

const clickText = async (label) => {
  await page.evaluate((t) => {
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === t)
    b?.click()
  }, label)
}

const files = []
for (const shot of shots) {
  await page.evaluate(t => localStorage.setItem('forge:theme', t), shot.theme ?? 'dark')
  await page.goto(BASE + shot.path, { waitUntil: 'networkidle2' })
  await sleep(1400)

  if (shot.action === 'addFood') { await clickText('+ Add food'); await sleep(600)
    await page.type('input[aria-label="Search foods"]', 'paneer'); await sleep(1800) }
  if (shot.action === 'quickMeals') { await clickText('+ Add food'); await sleep(500); await clickText('Quick meals'); await sleep(700) }
  if (shot.action === 'aiDescribe') { await clickText('+ Add food'); await sleep(500); await clickText('AI describe'); await sleep(700) }
  if (shot.action === 'newPlan') { await clickText('Replace / new plan'); await sleep(900) }
  if (shot.action === 'newCheckin') { await clickText('New check-in'); await sleep(900) }
  if (shot.action === 'physiqueGoal') { await clickText('New check-in'); await sleep(700); await clickText('Continue'); await sleep(700) }
  if (shot.action === 'searchFood') { await page.type('input[aria-label="Search foods"]', 'vada'); await sleep(1800) }

  const file = `${OUT_DIR}/${shot.name}.png`
  await page.screenshot({ path: file })
  files.push(file)
  console.error('captured', shot.name)
}

await browser.close()
console.log(files.join('\n'))
