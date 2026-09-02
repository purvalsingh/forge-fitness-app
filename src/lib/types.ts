export type ID = string
export type ISODate = string // YYYY-MM-DD

export type Sex = 'male' | 'female'
export type GoalMode = 'cut' | 'maintain' | 'bulk'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'high' | 'athlete'
export type Unit =
  | 'g' | 'ml' | '100g' | '100ml' | 'serving' | 'piece' | 'slice' | 'cup' | 'tbsp' | 'tsp' | 'scoop'

export interface Profile {
  id: ID
  display_name: string
  sex: Sex
  age: number
  height_cm: number
  theme: 'dark' | 'light' | 'system'
}

export interface Goal {
  id: ID
  mode: GoalMode
  current_weight_kg: number
  target_weight_kg: number
  activity_level: ActivityLevel
  avg_daily_steps: number
  training_days_per_week: number
  training_minutes: number
  rate_kg_per_week: number
  updated_at: string
}

export interface NutritionTarget {
  id: ID
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  source: 'manual' | 'calculated' | 'ai'
  note?: string
  updated_at: string
}

export interface MealType {
  id: ID
  name: string
  time: string // HH:MM
  position: number
}

/** Nutrition is always stored per `base` amount of `unit`. */
export interface Food {
  id: ID
  name: string
  brand?: string
  unit: Unit
  base: number // e.g. 100 for 100g, 1 for serving/piece
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g?: number
  sugar_g?: number
  sodium_mg?: number
  custom?: boolean
  category?: string
}

export interface RecipeIngredient {
  food_id: ID
  qty: number
}

export interface Recipe {
  id: ID
  name: string
  favorite?: boolean
  ingredients: RecipeIngredient[]
}

export interface FoodLog {
  id: ID
  date: ISODate
  meal_type_id: ID
  food_id?: ID
  name: string
  qty: number
  unit: Unit
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  note?: string
  source: 'manual' | 'search' | 'recipe' | 'ai_text' | 'ai_photo'
}

export interface Exercise {
  id: ID
  name: string
  muscle?: string
}

export interface WorkoutExercise {
  id: ID
  exercise_id: ID
  /** Display name. Kept on the row so renaming an exercise never depends on parsing its id. */
  name?: string
  sets: number
  reps: string
  target: string
  position: number
  rest_sec?: number
  tempo?: string
  note?: string
}

export interface WorkoutDay {
  id: ID
  plan_id: ID
  name: string
  focus: string
  position: number
  exercises: WorkoutExercise[]
}

export type TrainingFocus =
  | 'strength' | 'hypertrophy' | 'aesthetics' | 'strength_aesthetics'
  | 'fat_loss' | 'general' | 'athletic' | 'custom'

export interface WorkoutPlan {
  id: ID
  name: string
  days: WorkoutDay[]
  active?: boolean
  focus?: TrainingFocus
  days_per_week?: number
  source?: 'template' | 'custom' | 'ai'
  updated_at?: string
}

export interface WorkoutSet {
  set_no: number
  weight_kg: number | null
  reps: number | null
  done: boolean
}

export interface SessionExercise {
  workout_exercise_id: ID
  exercise_id: ID
  name: string
  target: string
  note?: string
  sets: WorkoutSet[]
}

export interface WorkoutSession {
  id: ID
  date: ISODate
  plan_id: ID
  day_id: ID
  day_name: string
  started_at: string
  finished_at?: string
  exercises: SessionExercise[]
}

export interface WeightLog { id: ID; date: ISODate; weight_kg: number }
export interface StepLog { id: ID; date: ISODate; steps: number }
export interface Settings {
  id: ID
  step_goal: number
  rest_days: number[] // 0=Sun
  adherence_weights: { diet: number; workout: number; steps: number }
  diet_tolerance: number // fraction, e.g. 0.10 => within 10% of calorie target
}
export interface AIInsight {
  id: ID
  created_at: string
  kind: 'observation' | 'adjustment'
  text: string
  payload?: unknown
  dismissed?: boolean
  applied?: boolean
}

export type PhysiqueAngle = 'front' | 'side' | 'back' | 'relaxed' | 'flexed'

export interface PhysiqueMilestone { window: string; expectation: string }

export interface PhysiqueAnalysis {
  composition_estimate: string
  strengths: string[]
  priorities: string[]
  observations: string[]
  timeline: { range: string; assumptions: string[]; milestones: PhysiqueMilestone[] }
  training: { days_per_week: number; focus: TrainingFocus; emphasis: string[]; rationale: string }
  nutrition: { strategy: string; calorie_delta: number; protein_g_per_kg: number }
  changes_since_last?: string[]
}

export interface PhysiqueCheckin {
  id: ID
  date: ISODate
  created_at: string
  /** Photo keys in the on-device photo store. Images never leave the device except for one AI request. */
  photo_keys: Partial<Record<PhysiqueAngle, string>>
  reference_key?: string
  goal: TrainingFocus
  priorities: string
  notes?: string
  analysis?: PhysiqueAnalysis
  weight_kg?: number
}
