package app.forge.fitness.logic

import app.forge.fitness.data.*
import app.forge.fitness.logic.Templates.FOCUS_LABELS
import app.forge.fitness.logic.Templates.emphasisGroups
import app.forge.fitness.logic.Templates.generatePlan
import java.util.UUID

/**
 * Plan orchestration — ported from src/lib/planner.ts.
 * Calls the AI via [Ai.generatePlan]; falls back to [Templates.generatePlan] when AI is
 * unavailable. The feature never dead-ends.
 * Pure Kotlin; no Android imports.
 */
object Planner {

    /** Parameters for a plan request. */
    data class PlanRequest(
        val focus: String,
        val daysPerWeek: Int,
        val preferences: String? = null,
        val priorities: List<String>? = null,
        val equipment: String? = null,
        val experience: String? = null,
        val name: String? = null,
    )

    /** Result returned to the UI: always contains a valid plan. */
    data class PlanResult(
        val plan: WorkoutPlan,
        /** Where the plan came from. */
        val source: String,            // "ai" | "template"
        /** AI rationale, if the plan came from AI. */
        val rationale: String? = null,
        /** Set when AI was asked but could not answer, so the UI can explain the fallback. */
        val fallbackReason: String? = null,
    )

    /**
     * Convert a validated AI-generated plan ([Ai.GeneratedPlan]) into FORGE's [WorkoutPlan] shape.
     */
    fun fromGenerated(g: Ai.GeneratedPlan, req: PlanRequest): WorkoutPlan {
        val planId = UUID.randomUUID().toString()
        val focusLabel = FOCUS_LABELS[req.focus] ?: req.focus
        return WorkoutPlan(
            id = planId,
            name = g.name.ifBlank { req.name ?: "$focusLabel · ${req.daysPerWeek} days" },
            focus = req.focus,
            days_per_week = g.days.size,
            source = "ai",
            active = false,
            updated_at = java.time.Instant.now().toString(),
            days = g.days.mapIndexed { i, d ->
                WorkoutDay(
                    id = UUID.randomUUID().toString(),
                    plan_id = planId,
                    name = if (d.name.matches(Regex("(?i)day\\s*\\d.*"))) d.name else "Day ${i + 1} — ${d.name}",
                    focus = d.focus.ifBlank { focusLabel },
                    position = i,
                    exercises = d.exercises.mapIndexed { j, e ->
                        WorkoutExercise(
                            id = UUID.randomUUID().toString(),
                            exercise_id = "ex-" + e.name.lowercase().replace(Regex("[^a-z0-9]+"), "-"),
                            name = e.name,
                            sets = e.sets,
                            reps = e.reps,
                            target = "",
                            rest_sec = e.restSec,
                            tempo = e.tempo,
                            note = e.note,
                            position = j,
                        )
                    },
                )
            },
        )
    }

    /**
     * Ask Gemini for a personalised plan via [Ai.generatePlan]; fall back to the deterministic
     * template generator when AI is unavailable or not configured.
     *
     * @param api  The [app.forge.fitness.data.Api] instance (used only for the AI call).
     * @param localMode True when no credentials are present — skips AI immediately.
     */
    suspend fun requestPlan(api: app.forge.fitness.data.Api, req: PlanRequest, localMode: Boolean = false): PlanResult {
        fun template() = generatePlan(
            Templates.GenerateOptions(
                focus = req.focus,
                daysPerWeek = req.daysPerWeek,
                emphasis = (req.priorities ?: emptyList()) + listOfNotNull(req.preferences),
                name = req.name,
            )
        )

        if (localMode || !api.configured) {
            return PlanResult(template(), "template",
                fallbackReason = "AI is not set up, so this plan uses built-in templates.")
        }

        return try {
            val g = Ai.generatePlan(api, Ai.GeneratePlanInput(
                daysPerWeek = req.daysPerWeek,
                focus = FOCUS_LABELS[req.focus] ?: req.focus,
                preferences = req.preferences,
                priorities = req.priorities,
                equipment = req.equipment,
                experience = req.experience,
            ))
            PlanResult(fromGenerated(g, req), "ai", rationale = g.rationale)
        } catch (e: app.forge.fitness.data.ApiError) {
            PlanResult(template(), "template",
                fallbackReason = "${e.message} Showing a template plan instead.")
        } catch (e: Exception) {
            PlanResult(template(), "template",
                fallbackReason = "The AI could not build a plan just now. Showing a template plan instead.")
        }
    }
}
