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
        /** The user's saved training limits. */
        val notes: String? = null,
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
            // Deterministic first, AI second: the AI adapts FORGE's own library plan instead of inventing one.
            val base = template()
            val g = Ai.generatePlan(api, Ai.GeneratePlanInput(
                baseline = base.days.joinToString("\n") { d -> "${d.name}: " + d.exercises.joinToString(", ") { "${it.name} ${it.sets}x${it.reps}" } },
                daysPerWeek = req.daysPerWeek,
                focus = FOCUS_LABELS[req.focus] ?: req.focus,
                preferences = req.preferences,
                priorities = req.priorities,
                equipment = req.equipment,
                experience = req.experience,
                notes = req.notes,
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

    /** One line per day, the way the AI reads a plan. */
    fun planLines(p: WorkoutPlan) = p.days.joinToString("\n") { d -> "${d.name}: " + d.exercises.joinToString(", ") { "${it.name ?: it.exercise_id} ${it.sets}x${it.reps}" } }

    data class Revision(val plan: WorkoutPlan, val rationale: String)

    /**
     * Ask the AI to change an existing plan ("more back, less abs") within the user's limits. Day and exercise ids are
     * kept where the day/exercise survives, so progression history and today's session still line up. Same as web revisePlan.
     */
    suspend fun revisePlan(api: app.forge.fitness.data.Api, plan: WorkoutPlan, request: String, notes: String?): Revision {
        val focus = plan.focus ?: "strength_aesthetics"
        val g = Ai.generatePlan(api, Ai.GeneratePlanInput(daysPerWeek = plan.days.size, focus = FOCUS_LABELS[focus] ?: focus,
            notes = notes, revise = true, current = planLines(plan), request = request))
        val fresh = fromGenerated(g, PlanRequest(focus, g.days.size))
        fun norm(x: String?) = (x ?: "").lowercase().replace(Regex("[^a-z0-9]"), "")
        return Revision(plan.copy(days_per_week = fresh.days.size, updated_at = java.time.Instant.now().toString(),
            days = fresh.days.mapIndexed { i, d ->
                val old = plan.days.getOrNull(i)
                d.copy(id = old?.id ?: d.id, plan_id = plan.id, exercises = d.exercises.map { e ->
                    val same = old?.exercises?.firstOrNull { norm(it.name) == norm(e.name) }
                    if (same != null) e.copy(id = same.id, exercise_id = same.exercise_id, progression = same.progression, warmups = same.warmups) else e
                })
            }), g.rationale)
    }
}
