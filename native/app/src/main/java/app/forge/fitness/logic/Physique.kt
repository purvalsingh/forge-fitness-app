package app.forge.fitness.logic

import app.forge.fitness.data.Goal
import app.forge.fitness.data.PhysiqueAnalysis
import app.forge.fitness.data.PhysiqueMilestone
import app.forge.fitness.data.PhysiqueNutrition
import app.forge.fitness.data.PhysiqueTimeline
import app.forge.fitness.data.PhysiqueTraining
import app.forge.fitness.logic.Calc.KCAL_PER_KG
import app.forge.fitness.logic.Templates.FOCUS_LABELS
import app.forge.fitness.logic.Templates.emphasisGroups
import kotlin.math.*

/**
 * Deterministic physique roadmap and AI output clamping — ported from src/lib/physique.ts.
 * Pure Kotlin; no Android imports.
 */
object Physique {

    /**
     * Build a [PhysiqueAnalysis] from the user's goal data alone — no AI.
     * Used when AI is unavailable, and as the sanity floor for AI output.
     *
     * Timelines and calorie deltas shown in the app are always bounded by real arithmetic;
     * the AI adds colour and nuance, but never raw numbers the deterministic layer rejects.
     *
     * @param goal         Training focus key (e.g. "fat_loss", "hypertrophy").
     * @param priorities   Free-text priority string (e.g. "bigger shoulders, wider back").
     * @param bodyGoal     Current [Goal] row (may be null for new users).
     * @param trainingDays Days per week the user trains.
     */
    fun localRoadmap(
        goal: String,
        priorities: String,
        bodyGoal: Goal?,
        trainingDays: Int,
    ): PhysiqueAnalysis {
        val delta = if (bodyGoal != null) bodyGoal.target_weight_kg - bodyGoal.current_weight_kg else 0.0
        val rate = maxOf(0.1, abs(bodyGoal?.rate_kg_per_week ?: 0.4))
        val weeks = if (abs(delta) > 0.5) ceil(abs(delta) / rate).toInt() else 0

        // Body-composition change is the fast part; visible physique change is slower.
        val lowMonths = maxOf(3, (weeks / 4.35 * 0.9).roundToInt())
        val highMonths = maxOf(lowMonths + 6, (weeks / 4.35 * 2.2 + 6).roundToInt())

        val groups = emphasisGroups(priorities)
        val calorieDelta = when {
            bodyGoal != null -> (sign(delta) * (rate * KCAL_PER_KG) / 7).roundToInt().toDouble()
            goal == "fat_loss" -> -400.0
            goal == "hypertrophy" -> 250.0
            else -> 0.0
        }

        return PhysiqueAnalysis(
            composition_estimate = "No AI analysis available — this roadmap is calculated from your goal, current weight and training frequency.",
            strengths = emptyList(),
            priorities = if (groups.isNotEmpty()) groups.map { "More volume for $it" }
                         else listOf("Consistent progressive overload across all major movements"),
            observations = listOfNotNull(
                if (bodyGoal != null)
                    "${abs(delta).format1()} kg to move at ${rate.format2()} kg/week ≈ $weeks weeks of body-weight change."
                else "Set a goal weight to sharpen this estimate.",
                "Visible physique change lags weight change — muscle is built over quarters, not weeks.",
            ),
            timeline = PhysiqueTimeline(
                range = "$lowMonths–$highMonths months",
                assumptions = listOf(
                    "Training $trainingDays days per week, consistently.",
                    "Nutrition targets hit on most days.",
                    "Adequate sleep and recovery.",
                    "Genetics, starting condition, training history and recovery can change this substantially.",
                ),
                milestones = listOf(
                    PhysiqueMilestone("0–3 months", "Technique and consistency established; early strength gains; small visible change."),
                    PhysiqueMilestone("3–6 months", "Measurable strength gains and clear changes in target areas."),
                    PhysiqueMilestone("6–12 months", "Noticeable change in physique with consistent training and diet."),
                    PhysiqueMilestone("12+ months", "Compounding development; priorities usually need to be re-evaluated by now."),
                ),
            ),
            training = PhysiqueTraining(
                days_per_week = trainingDays,
                focus = goal,
                emphasis = groups,
                rationale = "${FOCUS_LABELS[goal] ?: goal} split with extra accessory volume on your stated priorities.",
            ),
            nutrition = PhysiqueNutrition(
                strategy = when {
                    goal == "fat_loss" || delta < 0 -> "Moderate deficit with high protein to hold onto muscle."
                    delta > 0 -> "Controlled surplus so gains skew toward muscle rather than fat."
                    else -> "Eat around maintenance and let training drive the change."
                },
                calorie_delta = calorieDelta,
                protein_g_per_kg = if (delta < 0) 2.2 else 1.9,
            ),
        )
    }

    /**
     * Map AI free-text focus strings onto known focus values in [Templates.FOCUS_LABELS].
     * Falls back to [fallback] when nothing matches.
     */
    fun coerceFocus(v: String?, fallback: String): String {
        val s = (v ?: "").lowercase().replace(Regex("[^a-z]+"), "_")
        val keys = FOCUS_LABELS.keys.toList()
        return keys.find { it == s }
            ?: keys.find { k -> k != "custom" && s.contains(k.split("_")[0]) }
            ?: fallback
    }

    /**
     * Clamp AI numbers to what the deterministic layer considers sane.
     * Text fields (composition_estimate, strengths, etc.) are kept verbatim — only numbers change.
     *
     * @param aiOut  The AI-produced analysis (already Zod-validated in [Ai.physiqueAnalysis]).
     * @param local  The [localRoadmap] result for the same user (the sanity floor).
     */
    fun reconcile(aiOut: PhysiqueAnalysis, local: PhysiqueAnalysis): PhysiqueAnalysis =
        aiOut.copy(
            training = aiOut.training.copy(
                days_per_week = aiOut.training.days_per_week.coerceIn(2, 7),
            ),
            nutrition = aiOut.nutrition.copy(
                calorie_delta = clampDelta(aiOut.nutrition.calorie_delta, local.nutrition.calorie_delta),
                protein_g_per_kg = aiOut.nutrition.protein_g_per_kg.coerceIn(1.4, 2.6),
            ),
        )

    // ─── Private ──────────────────────────────────────────────────────────────

    private fun clampDelta(v: Double, local: Double): Double {
        val limit = maxOf(700.0, abs(local) * 1.5)
        return minOf(limit, maxOf(-limit, v)).roundToInt().toDouble()
    }

    private fun Double.format1() = "%.1f".format(this)
    private fun Double.format2() = "%.2f".format(this)
    private fun Double.roundToInt() = floor(this + 0.5).toInt()
}
