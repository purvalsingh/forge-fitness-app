package app.forge.fitness.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Domain rows, field-for-field with src/lib/types.ts and the Supabase schema (snake_case names on purpose,
 * so the same JSON goes to PostgREST, the local cache and the web app). Enum-like fields stay strings so a
 * value the web app adds later never crashes an older APK.
 */
interface Row { val id: String }

@Serializable data class Profile(
    override val id: String, val display_name: String = "", val sex: String = "male", val age: Int = 25,
    val height_cm: Double = 175.0, val theme: String = "dark",
) : Row

@Serializable data class Goal(
    override val id: String, val mode: String = "maintain", val current_weight_kg: Double = 70.0,
    val target_weight_kg: Double = 70.0, val activity_level: String = "moderate", val avg_daily_steps: Int = 6000,
    val training_days_per_week: Int = 4, val training_minutes: Int = 60, val rate_kg_per_week: Double = 0.5,
    val updated_at: String = "",
) : Row

@Serializable data class NutritionTarget(
    override val id: String, val calories: Double, val protein_g: Double, val carbs_g: Double, val fat_g: Double,
    val source: String = "calculated", val note: String? = null, val updated_at: String = "",
) : Row

@Serializable data class MealType(override val id: String, val name: String, val time: String = "", val position: Int = 0) : Row

/** Nutrition is stored per `base` amount of `unit`. */
@Serializable data class Food(
    override val id: String, val name: String, val brand: String? = null, val unit: String = "100g", val base: Double = 100.0,
    val calories: Double, val protein_g: Double, val carbs_g: Double, val fat_g: Double,
    val fiber_g: Double? = null, val sugar_g: Double? = null, val sodium_mg: Double? = null, val custom: Boolean? = null,
    val category: String? = null, val serving_g: Double? = null, val serving_label: String? = null,
    val state: String? = null, val cuisine: String? = null,
) : Row

@Serializable data class RecipeIngredient(val food_id: String, val qty: Double)
@Serializable data class Recipe(
    override val id: String, val name: String, val favorite: Boolean? = null, val ingredients: List<RecipeIngredient> = emptyList(),
) : Row

@Serializable data class FoodLog(
    override val id: String, val date: String, val meal_type_id: String, val food_id: String? = null, val name: String,
    val qty: Double, val unit: String, val calories: Double, val protein_g: Double, val carbs_g: Double, val fat_g: Double,
    val note: String? = null, val source: String = "manual", val serving_label: String? = null,
    /** Set by the database; used so back-filled logs only count toward the streak for the last 7 days. */
    val created_at: String? = null,
) : Row

@Serializable data class Exercise(
    override val id: String, val name: String, val muscle: String? = null, val secondary: List<String>? = null,
    val body_part: String? = null, val equipment: String? = null, val instructions: List<String>? = null,
    val kind: String? = null, val per_side: Boolean? = null, val custom: Boolean? = null, val favorite: Boolean? = null,
    val rest_sec: Int? = null, val bar_kg: Double? = null,
) : Row

@Serializable data class WaterLog(override val id: String, val date: String, val ml: Int, val at: String? = null) : Row

@Serializable data class WorkoutExercise(
    val id: String, val exercise_id: String, val name: String? = null, val sets: Int, val reps: String, val target: String = "",
    val position: Int = 0, val rest_sec: Int? = null, val tempo: String? = null, val note: String? = null,
    val superset: String? = null, val progression: String? = null, val warmups: Int? = null,
)
@Serializable data class WorkoutDay(
    val id: String, val plan_id: String, val name: String, val focus: String = "", val position: Int = 0,
    val exercises: List<WorkoutExercise> = emptyList(),
)
@Serializable data class WorkoutPlan(
    override val id: String, val name: String, val days: List<WorkoutDay> = emptyList(), val active: Boolean? = null,
    val focus: String? = null, val days_per_week: Int? = null, val source: String? = null, val updated_at: String? = null,
    val deload: Boolean? = null, val progression: String? = null,
    /** What the user told FORGE when the plan was made (injuries, limits, likes). AI swaps keep to it. */
    val brief: String? = null,
) : Row

@Serializable data class WorkoutSet(
    val set_no: Int, val weight_kg: Double? = null, val reps: Int? = null, val done: Boolean = false, val warmup: Boolean? = null,
    val effort: Double? = null, val effort_scale: String? = null, val duration_sec: Int? = null, val distance_km: Double? = null,
    val kind: String? = null, val pr: Boolean? = null,
    /** Order this set was completed in, across the whole workout (1 = first set done). Explains RPE drift. */
    val seq: Int? = null,
    /** When the set was ticked done (ISO time); rest before a set = gap to the previous completed set. */
    val done_at: String? = null,
)
@Serializable data class SessionExercise(
    val workout_exercise_id: String, val exercise_id: String, val name: String, val target: String = "", val note: String? = null,
    val sets: List<WorkoutSet> = emptyList(), val superset: String? = null, val rest_sec: Int? = null, val kind: String? = null,
    val muscle: String? = null,
)
@Serializable data class WorkoutSession(
    override val id: String, val date: String, val plan_id: String, val day_id: String, val day_name: String,
    val started_at: String, val finished_at: String? = null, val exercises: List<SessionExercise> = emptyList(),
    val backfilled: Boolean? = null, val freestyle: Boolean? = null, val bodyweight_kg: Double? = null,
    val deload: Boolean? = null, val note: String? = null,
) : Row

@Serializable data class WeightLog(override val id: String, val date: String, val weight_kg: Double) : Row
@Serializable data class StepLog(override val id: String, val date: String, val steps: Int) : Row

@Serializable data class AdherenceWeights(val diet: Double = 0.4, val workout: Double = 0.4, val steps: Double = 0.2)
/**
 * Every training number the app uses, editable by the user (Settings → Coach). Defaults are only starting points.
 * Stored in settings.coach (jsonb), so it syncs across devices.
 */
@Serializable data class CoachPrefs(
    /** Who sets next session's weights: "rules" (FORGE's maths) or "ai" (AI coach, only once it passed the check). */
    val mode: String = "rules",
    val target_rpe: Double = 8.0,
    /** Largest load increase allowed from one session to the next, in % of last top weight. */
    val max_jump_pct: Double = 5.0,
    val barbell_increment_kg: Double = 2.5,
    val dumbbell_increment_kg: Double = 1.0,
    /** Warm-up ramp as "%×reps" steps, e.g. "40x8, 60x5, 80x3". Empty = no automatic warm-ups. */
    val warmup_ramp: String = "40x8, 60x5, 80x3",
    /** Lifts below this working weight get no warm-up ramp. */
    val warmup_min_kg: Double = 30.0,
    /** How many of the day's first lifts get an automatic ramp. */
    val warmup_lifts: Int = 2,
    /** Read strength from the first (freshest) working set instead of the best set. */
    val first_set_strength: Boolean = true,
    /** Sessions in a row below the rep floor before a deload, and how big it is. */
    val stall_sessions: Int = 3,
    val deload_pct: Double = 10.0,
    /** Weeks of history used to estimate a max. */
    val max_window_weeks: Int = 8,
    /** Last AI coach reliability check: score/total, date, and which scenarios failed. */
    val check_score: Int? = null,
    val check_total: Int? = null,
    val check_date: String? = null,
    val check_failed: List<String>? = null,
)

@Serializable data class Settings(
    override val id: String = "settings",
    /** Training limits told once (injuries, conditions, dislikes); every AI plan, revision and swap keeps to them. */
    val training_notes: String? = null,
    val step_goal: Int = 8000, val rest_days: List<Int> = emptyList(),
    val adherence_weights: AdherenceWeights = AdherenceWeights(), val diet_tolerance: Double = 0.1,
    val day_start_hour: Int? = 4, val water_goal_ml: Int? = 2500, val week_start: Int? = 1, val units: String? = "kg",
    val bar_weight_kg: Double? = 20.0, val default_rest_sec: Int? = 90, val effort_scale: String? = "off",
    val keep_awake: Boolean? = null, val timer_flash: Boolean? = null, val fasting_hours: Int? = 16,
    val fasting_started_at: String? = null,
    val coach: CoachPrefs? = null,
    val share_data: Boolean = false,
) : Row

@Serializable data class AIInsight(
    override val id: String, val created_at: String, val kind: String, val text: String, val payload: JsonElement? = null,
    val dismissed: Boolean? = null, val applied: Boolean? = null,
) : Row

@Serializable data class PhysiqueMilestone(val window: String, val expectation: String)
@Serializable data class PhysiqueTimeline(val range: String, val assumptions: List<String> = emptyList(), val milestones: List<PhysiqueMilestone> = emptyList())
@Serializable data class PhysiqueTraining(val days_per_week: Int, val focus: String, val emphasis: List<String> = emptyList(), val rationale: String = "")
@Serializable data class PhysiqueNutrition(val strategy: String, val calorie_delta: Double, val protein_g_per_kg: Double)
@Serializable data class PhysiqueAnalysis(
    val composition_estimate: String, val strengths: List<String> = emptyList(), val priorities: List<String> = emptyList(),
    val observations: List<String> = emptyList(), val timeline: PhysiqueTimeline, val training: PhysiqueTraining,
    val nutrition: PhysiqueNutrition, val changes_since_last: List<String>? = null,
)
/** Photo keys point into on-device storage; images never leave the phone except for one user-triggered AI request. */
@Serializable data class PhysiqueCheckin(
    override val id: String, val date: String, val created_at: String, val photo_keys: Map<String, String> = emptyMap(),
    val reference_key: String? = null, val goal: String = "general", val priorities: String = "", val notes: String? = null,
    val analysis: PhysiqueAnalysis? = null, val weight_kg: Double? = null,
) : Row
