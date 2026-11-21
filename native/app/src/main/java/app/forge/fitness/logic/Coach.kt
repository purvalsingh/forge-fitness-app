package app.forge.fitness.logic

import app.forge.fitness.data.*
import kotlinx.serialization.json.*

/**
 * The AI coach. It plans today's working weights, but:
 *  1. it is only trusted after passing [runCheck], a fixed set of training scenarios with known-correct answers,
 *     graded on the AI's RAW output (before any safety clamp), so the score measures the AI, not our guard rails;
 *  2. even when trusted, every planned weight is bounded by the user's own settings ([CoachPrefs]) before use;
 *  3. any failure or timeout falls back to FORGE's rules ([Training.nextTargetRpe]).
 */
object Coach {
    data class Planned(val weightKg: Double, val reps: Int, val reason: String)

    /** Score needed to unlock AI coach mode, and how old a pass may be before it must be re-run. */
    const val PASS_MIN = 7
    const val CHECK_VALID_DAYS = 30L

    fun trusted(p: CoachPrefs): Boolean {
        val score = p.check_score ?: return false
        val total = p.check_total ?: return false
        val date = p.check_date ?: return false
        val fresh = runCatching { java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.parse(date), java.time.LocalDate.now()) <= CHECK_VALID_DAYS }.getOrDefault(false)
        return fresh && total > 0 && score >= minOf(PASS_MIN, total)
    }

    /** [maxKg] = hard limit for today (last top working weight × (1 + max jump), rounded up to one plate step); null = no history. */
    data class ExerciseIn(val key: String, val name: String, val sets: Int, val reps: String, val equipment: String?, val history: String, val maxKg: Double? = null)

    /** Today's hard limit for an exercise, given its last top working weight. */
    fun maxToday(lastTopKg: Double?, prefs: CoachPrefs, increment: Double): Double? =
        lastTopKg?.takeIf { it > 0 }?.let { Math.ceil(it * (1 + prefs.max_jump_pct / 100) / increment - 1e-9) * increment }

    /** One call for the whole session. Returns key -> raw AI plan (unclamped). */
    suspend fun askAi(api: Api, prefs: CoachPrefs, profile: JsonElement, exercises: List<ExerciseIn>): Map<String, Planned> {
        val payload = buildJsonObject {
            put("prefs", json.encodeToJsonElement(CoachPrefs.serializer(), prefs))
            put("profile", profile)
            putJsonArray("exercises") {
                exercises.forEach { e -> addJsonObject {
                    put("key", e.key); put("name", e.name); put("sets", e.sets); put("reps", e.reps)
                    put("equipment", e.equipment ?: "unknown"); put("history", e.history)
                    e.maxKg?.let { put("max_kg", it) }
                } }
            }
        }
        val o = api.ai("coach_session", payload)
        val arr = o["exercises"] as? JsonArray ?: throw ApiError("The coach returned an unexpected answer.", "bad_ai")
        return arr.mapNotNull { el ->
            val e = el as? JsonObject ?: return@mapNotNull null
            val key = (e["key"] as? JsonPrimitive)?.contentOrNull ?: return@mapNotNull null
            val w = (e["weight_kg"] as? JsonPrimitive)?.doubleOrNull ?: return@mapNotNull null
            val r = (e["reps"] as? JsonPrimitive)?.doubleOrNull?.toInt() ?: return@mapNotNull null
            key to Planned(w, r, ((e["reason"] as? JsonPrimitive)?.contentOrNull ?: "").take(200))
        }.toMap()
    }

    /**
     * Hard limits applied to every AI weight before it reaches a session: never above last top weight + max jump,
     * never negative, rounded to the user's increment, reps inside 1..30.
     */
    fun bound(p: Planned, lastTopKg: Double?, prefs: CoachPrefs, increment: Double): Planned {
        val cap = maxToday(lastTopKg, prefs, increment) ?: Double.MAX_VALUE
        val w = (Math.round(p.weightKg / increment) * increment).coerceIn(0.0, cap)
        return Planned(if (w < 0) 0.0 else w, p.reps.coerceIn(1, 30), p.reason)
    }

    /** History text for one exercise: the last few workouts that contained it, in full (order and rest included). */
    fun historyFor(sessions: List<WorkoutSession>, exerciseId: String, before: String, take: Int = 4): String =
        sessions.filter { s -> s.date < before && s.finished_at != null && s.exercises.any { it.exercise_id == exerciseId } }
            .sortedBy { it.date }.takeLast(take).mapNotNull { Training.sessionLog(it) }.joinToString("\n").ifBlank { "none" }

    // ─── Reliability check ───────────────────────────────────────────────────

    data class Scenario(val key: String, val title: String, val ex: ExerciseIn, val grade: (Planned?) -> String?)
    data class CheckResult(val score: Int, val total: Int, val failed: List<String>, val details: List<Pair<String, String>>)

    private fun hist(vararg sessions: String) = sessions.joinToString("\n")

    /**
     * Eight scenarios a competent coach gets right, each with a pass rule. The rules use the user's own settings
     * (target RPE, max jump), so the check measures whether the AI follows THEIR coaching style.
     */
    fun scenarios(p: CoachPrefs): List<Scenario> {
        val jump = 1 + p.max_jump_pct / 100
        // Upper limits allow rounding up to the next plate step (47.25 kg cap -> 47.5 kg on a 2.5 kg barbell), no more.
        fun capB(x: Double) = Math.ceil(x * jump / p.barbell_increment_kg - 1e-9) * p.barbell_increment_kg
        fun capD(x: Double) = Math.ceil(x * jump / p.dumbbell_increment_kg - 1e-9) * p.dumbbell_increment_kg
        fun inRange(x: Double, lo: Double, hi: Double) = x >= lo - 0.01 && x <= hi + 0.01
        return listOf(
            Scenario("easy", "Easy sets → add a little load",
                ExerciseIn("easy", "Back Squat", 3, "5", "barbell", hist(
                    "2026-10-27 (Day A, 60 min)\n 1. Back Squat: W40×8 W60×5 | 100×5@6 (rest 3:00) · 100×5@6.5 (rest 3:10) · 100×5@7 (rest 3:05)"), maxKg = maxToday(100.0, p, p.barbell_increment_kg))) { a ->
                if (a == null) "no answer" else if (!inRange(a.weightKg, 100.5, capB(100.0))) "gave ${a.weightKg} kg (expected above 100, at most ${capB(100.0)})" else null },
            Scenario("grind", "Missed reps at RPE 10 → don't add load",
                ExerciseIn("grind", "Bench Press", 3, "5", "barbell", hist(
                    "2026-10-28 (Day B, 55 min)\n 1. Bench Press: W40×8 | 90×5@9.5 (rest 3:00) · 90×4@10 (rest 3:00) · 90×3@10 (rest 3:00)"), maxKg = maxToday(90.0, p, p.barbell_increment_kg))) { a ->
                if (a == null) "no answer" else if (a.weightKg > 90.01) "raised to ${a.weightKg} kg after missed reps" else null },
            Scenario("fatigue", "RPE drift from short rest → not a stall",
                ExerciseIn("fatigue", "Deadlift", 3, "5", "barbell", hist(
                    "2026-10-29 (Day C, 40 min)\n 1. Deadlift: W60×5 | 140×5@7 (rest 2:30) · 140×5@8.5 (rest 1:20) · 140×5@9.5 (rest 1:10)"), maxKg = maxToday(140.0, p, p.barbell_increment_kg))) { a ->
                if (a == null) "no answer" else if (a.weightKg < 139.99) "dropped to ${a.weightKg} kg; the first set at RPE 7 shows strength, the rest was short" else if (a.weightKg > capB(140.0) + 0.01) "jumped past your max increase" else null },
            Scenario("order", "Lift done late in the workout → don't punish it",
                ExerciseIn("order", "Incline Dumbbell Press", 3, "8-10", "dumbbell", hist(
                    "2026-10-20 (Day A, 50 min)\n 1. Incline Dumbbell Press: 26×10@7 (rest 2:00) · 26×10@7.5 (rest 2:00)",
                    "2026-10-27 (Day A, 70 min)\n 1. Bench Press: 90×5@8\n 2. Overhead Press (after 1): 55×6@8.5\n 3. Incline Dumbbell Press (after 2): 26×8@9 (rest 1:45) · 26×7@9.5 (rest 1:40)"), maxKg = maxToday(26.0, p, p.dumbbell_increment_kg))) { a ->
                if (a == null) "no answer" else if (a.weightKg < 24.99) "dropped to ${a.weightKg} kg though it came after two pressing lifts" else if (a.weightKg > capD(26.0) + 0.01) "jumped too far" else null },
            Scenario("lighter", "Lighter for more reps → strength kept, jump still capped",
                ExerciseIn("lighter", "Overhead Press", 3, "5", "barbell", hist(
                    "2026-10-30 (Day B, 45 min)\n 1. Overhead Press: 45×10@9 (rest 2:30) · 45×9@9.5 (rest 2:30)"), maxKg = maxToday(45.0, p, p.barbell_increment_kg))) { a ->
                if (a == null) "no answer" else if (!inRange(a.weightKg, 45.0, capB(45.0))) "gave ${a.weightKg} kg (expected 45–${capB(45.0)}: stronger than it looks, but capped)" else if (a.reps !in 3..6) "reps ${a.reps} outside the 5-rep plan" else null },
            Scenario("stall", "${p.stall_sessions} stalled sessions → deload",
                ExerciseIn("stall", "Barbell Row", 3, "8", "barbell", hist(
                    *(1..maxOf(3, p.stall_sessions)).map { i -> "2026-10-${10 + i * 5} (Day C, 50 min)\n 1. Barbell Row: 80×7@10 (rest 2:30) · 80×6@10 (rest 2:30) · 80×6@10 (rest 2:30)" }.toTypedArray()), maxKg = maxToday(80.0, p, p.barbell_increment_kg))) { a ->
                if (a == null) "no answer" else if (a.weightKg > 80 * (1 - p.deload_pct / 200) + 0.01) "kept ${a.weightKg} kg after repeated failed sessions (expected a deload)" else null },
            Scenario("bodyweight", "Bodyweight lift → progress reps, not load",
                ExerciseIn("bodyweight", "Pull-up", 3, "6-10", "bodyweight", hist(
                    "2026-10-30 (Day B, 45 min)\n 1. Pull-up: BW×10@8 (rest 2:00) · BW×10@8.5 (rest 2:00) · BW×9@9 (rest 2:00)"))) { a ->
                if (a == null) "no answer" else if (a.weightKg > 0.01) "added ${a.weightKg} kg to a bodyweight lift" else if (a.reps < 9) "cut reps to ${a.reps}" else null },
            Scenario("dumbbell", "Dumbbell steps → small, whole-kg change",
                ExerciseIn("dumbbell", "Dumbbell Curl", 3, "10-12", "dumbbell", hist(
                    "2026-10-30 (Day B, 45 min)\n 1. Dumbbell Curl: 14×12@7 (rest 1:30) · 14×12@7.5 (rest 1:30)"), maxKg = maxToday(14.0, p, p.dumbbell_increment_kg))) { a ->
                if (a == null) "no answer" else if (!inRange(a.weightKg, 14.0, maxOf(capD(14.0), 14.0 + p.dumbbell_increment_kg))) "gave ${a.weightKg} kg (expected 14–${maxOf(capD(14.0), 14.0 + p.dumbbell_increment_kg)})" else null },
        )
    }

    /**
     * Runs the scenarios [runs] times (to catch inconsistency); a scenario passes only if it passes every run.
     */
    suspend fun runCheck(api: Api, prefs: CoachPrefs, runs: Int = 2): CheckResult {
        val sc = scenarios(prefs)
        val passCount = HashMap<String, Int>(); val lastWhy = HashMap<String, String>()
        repeat(runs) {
            val answers = askAi(api, prefs, buildJsonObject { put("goal", "strength") }, sc.map { it.ex })
            sc.forEach { s -> val why = s.grade(answers[s.key]); if (why == null) passCount[s.key] = (passCount[s.key] ?: 0) + 1 else lastWhy[s.key] = why }
        }
        val passed = sc.filter { (passCount[it.key] ?: 0) == runs }
        val failed = sc.filter { it !in passed }
        return CheckResult(passed.size, sc.size, failed.map { "${it.title}: ${lastWhy[it.key] ?: "inconsistent"}" },
            sc.map { it.title to (if (it in passed) "pass" else (lastWhy[it.key] ?: "inconsistent")) })
    }
}
