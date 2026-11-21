package app.forge.fitness.data

import android.content.Context
import kotlinx.serialization.Serializable

/** First-run data, exported verbatim from src/lib/seed.ts into assets/seed.json so web and APK seed identically. */
object Seed {
    @Serializable private data class Bundle(val mealTypes: List<MealType>, val foods: List<Food>, val recipes: List<Recipe>,
                                            val plan: WorkoutPlan, val settings: Settings)
    private lateinit var b: Bundle
    fun init(ctx: Context) { if (!::b.isInitialized) b = json.decodeFromString(ctx.assets.open("seed.json").bufferedReader().readText()) }
    val mealTypes get() = b.mealTypes
    val foods get() = b.foods
    val recipes get() = b.recipes
    val plan get() = b.plan
    val settings get() = b.settings
}
