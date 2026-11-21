package app.forge.fitness.logic

import kotlin.math.roundToInt
import app.forge.fitness.data.CoachPrefs

import app.forge.fitness.data.SessionExercise
import app.forge.fitness.data.WorkoutSession
import app.forge.fitness.data.WorkoutSet
import kotlin.math.*

/**
 * Training maths. Pure and deterministic — ported from src/lib/training.ts.
 * No Android imports needed: everything is pure Kotlin.
 */
object Training {

    // ─── e1RM ────────────────────────────────────────────────────────────────

    /**
     * Estimated one-rep max (Epley formula).
     * Refuses to guess from high-rep sets (>12) where the formula falls apart.
     * Returns null when weight or reps are absent or out of range.
     */
    fun e1rm(weightKg: Double?, reps: Int?): Double? {
        if (weightKg == null || reps == null || reps < 1 || reps > 12) return null
        return if (reps == 1) weightKg
        else round1(weightKg * (1 + reps / 30.0))
    }

    // ─── Plate mathematics ────────────────────────────────────────────────────

    private val PLATES = listOf(25.0, 20.0, 15.0, 10.0, 5.0, 2.5, 1.25)

    /**
     * What goes on **each side** of the bar for a given total load.
     * Returns null when the total cannot be built from standard plates
     * (e.g. the total is lighter than the bar, or the remainder isn't plate-able).
     *
     * @param total Total barbell load in kg (bar + all plates).
     * @param bar   Bar weight in kg (default 20 kg).
     * @param plates Available plate denominations in kg, heaviest first.
     */
    fun platesPerSide(total: Double, bar: Double = 20.0, plates: List<Double> = PLATES): List<Double>? {
        var side = round2((total - bar) / 2.0)
        if (side < 0) return null
        val out = mutableListOf<Double>()
        for (p in plates) {
            while (side >= p - 1e-9) {
                out.add(p)
                side = round2(side - p)
            }
        }
        return if (side == 0.0) out else null
    }

    // ─── Rep-range parsing ────────────────────────────────────────────────────

    /**
     * Parse a rep range string into a [lo, hi] pair.
     * "6-8" → (6, 8), "5" → (5, 5), "45 sec" → (45, 45).
     * Returns null for strings with no digits.
     */
    fun parseReps(reps: String): Pair<Int, Int>? {
        val m = Regex("""(\d+)\s*(?:[-–to]+\s*(\d+))?""").find(reps) ?: return null
        val lo = m.groupValues[1].toInt()
        val hi = if (m.groupValues[2].isNotEmpty()) m.groupValues[2].toInt() else lo
        return if (lo > 0 && hi >= lo) lo to hi else null
    }

    // ─── Working sets ─────────────────────────────────────────────────────────

    /** Sets that are marked done and are not warm-up sets. */
    fun workingSets(sets: List<WorkoutSet>): List<WorkoutSet> =
        sets.filter { it.done && it.warmup != true }

    /**
     * A "warm-up" lifted at working weight is a working set. Warm-ups ramp to ~80 % of the day's weight, so any W set at
     * 90 %+ of the reference (the target "@ X kg", or the heaviest working set) loses its W. This rescues sessions
     * where the working rows were removed and the warm-up rows were used for the real sets.
     */
    fun settleWarmups(ex: SessionExercise): SessionExercise {
        if (ex.sets.none { it.warmup == true }) return ex
        val target = ex.target.let { Regex("""@\s*([\d.]+)\s*kg""").find(it)?.groupValues?.get(1)?.toDoubleOrNull() }
        val top = ex.sets.filter { it.warmup != true }.mapNotNull { it.weight_kg }.maxOrNull()
        val ref = listOfNotNull(target, top).maxOrNull() ?: return ex
        if (ref <= 0) return ex
        return ex.copy(sets = ex.sets.map { if (it.warmup == true && (it.weight_kg ?: 0.0) >= ref * 0.9) it.copy(warmup = null) else it })
    }

    // ─── Exercise history ─────────────────────────────────────────────────────

    /**
     * Most recent sessions for one exercise, newest first,
     * excluding deload sessions (they never set the baseline).
     *
     * @param before If provided, only include sessions strictly before this date string.
     */
    fun exerciseHistory(
        sessions: List<WorkoutSession>,
        exerciseId: String,
        before: String? = null,
    ): List<Pair<String, SessionExercise>> =
        sessions
            // Unfinished workouts never set the next target (an abandoned session would drag it down).
            .filter { s -> s.deload != true && (s.finished_at != null || s.backfilled == true) && (before == null || s.date < before) }
            .mapNotNull { s -> s.exercises.find { it.exercise_id == exerciseId }?.let { s.date to it } }
            .filter { (_, ex) -> workingSets(ex.sets).isNotEmpty() }
            .sortedByDescending { it.first }

    // ─── Next-session target ──────────────────────────────────────────────────

    /** The recommended weight and reps for the next session of an exercise. */
    data class Target(val weightKg: Double?, val reps: Int, val why: String)

    /**
     * Next session's target. Rules (port of training.ts#nextTarget):
     * - Missed reps never add load.
     * - Three consecutive stalls trigger a 10 % deload.
     * - Bodyweight exercises progress in reps, not load.
     * - `progression = "none"` disables automatic progression.
     *
     * @param history   Newest-first list of (date, SessionExercise) from [exerciseHistory].
     * @param reps      Rep-range string (e.g. "5", "6-8").
     * @param rule      "linear" | "double" | "reps" | "none" | null (auto-detect).
     * @param increment Load step in kg (default 2.5).
     * @param bodyweight True for exercises where bodyweight is the load (pull-ups, dips…).
     */
    fun nextTarget(
        history: List<Pair<String, SessionExercise>>,
        reps: String,
        rule: String? = null,
        increment: Double = 2.5,
        bodyweight: Boolean = false,
        prefs: CoachPrefs = CoachPrefs(),
    ): Target? {
        val (lo, hi) = parseReps(reps) ?: return null
        val last = history.firstOrNull()
            ?: return Target(null, lo, "First time — pick a weight you can lift for the top of the range with 1–2 reps to spare.")

        val allSets = workingSets(last.second.sets)
        // A set ticked with no weight is not a 0 kg set: for loaded lifts only sets with a weight count.
        val sets = if (bodyweight || rule == "reps") allSets else allSets.filter { (it.weight_kg ?: 0.0) > 0 }
        if (sets.isEmpty()) return Target(null, lo, "No weight was entered last time. Pick a weight you can lift for $hi reps with 1–2 to spare.")
        // Weight only goes up after every planned working set was done, not after 1 of 4.
        val allDone = last.second.sets.filter { it.warmup != true }.all { it.done }
        val topW = sets.maxOfOrNull { it.weight_kg ?: 0.0 } ?: 0.0
        val top = sets.filter { (it.weight_kg ?: 0.0) == topW }
        val minReps = top.minOfOrNull { it.reps ?: 0 } ?: 0
        val effectiveRule = rule ?: if (lo == hi) "linear" else "double"
        val inc = increment

        if (bodyweight || effectiveRule == "reps") {
            return if (minReps >= hi)
                Target(topW.takeIf { it > 0 }, hi + 1, "Hit $hi on every set — aim for ${hi + 1}.")
            else
                Target(topW.takeIf { it > 0 }, maxOf(lo, minReps + 1), "Build to $hi reps on every set.")
        }
        if (effectiveRule == "none") return Target(topW, lo, "Progression off for this exercise.")

        val stalls = history.take(prefs.stall_sessions).count { (_, h) ->
            val w = workingSets(h.sets)
            w.isNotEmpty() && (w.minOfOrNull { it.reps ?: 0 } ?: 0) < lo
        }
        if (stalls >= prefs.stall_sessions) {
            val w = maxOf(0.0, Math.round(topW * (1 - prefs.deload_pct / 100) / inc) * inc)
            return Target(w, lo, "Missed $lo reps ${prefs.stall_sessions} sessions running — deload ${prefs.deload_pct.toInt()} % and build back.")
        }
        if (minReps >= hi && !allDone) return Target(topW, lo, "Same weight. Finish all your sets before adding weight.")
        if (minReps >= hi) {
            val repStr = top.mapNotNull { it.reps }.joinToString(", ")
            return Target(topW + inc, lo, "+$inc kg · hit $repStr last time.")
        }
        if (effectiveRule == "double") {
            return Target(topW, minOf(hi, maxOf(lo, minReps + 1)), "Same weight — add a rep until every set reaches $hi.")
        }
        return Target(topW, lo, "Repeat $topW kg — last time's lowest set was $minReps reps.")
    }

    // ─── RPE autoregulation ───────────────────────────────────────────────────

    /** Reps the lifter could have done to failure at this RPE: reps + reps-in-reserve (RIR = 10 − RPE). */
    private fun repsToFailure(reps: Int, rpe: Double?) = reps + (10.0 - (rpe ?: 8.0)).coerceIn(0.0, 5.0)

    /** e1RM that respects how hard the set felt: 80 kg × 5 at RPE 7 is a stronger day than at RPE 10. */
    fun e1rmRpe(weightKg: Double, reps: Int, rpe: Double?): Double = weightKg * (1 + repsToFailure(reps, rpe) / 30.0)

    /**
     * RPE-aware next target. Uses the best e1RM from the last session's working sets (so going lighter for more reps,
     * or grinding a set at RPE 10, both move the number honestly), then picks the load for the target reps at
     * RPE 8 (2 reps in reserve). Never jumps more than +5 % over last time's top weight; a set at RPE ≥ 9.5 that
     * missed the rep floor holds or drops the load. Falls back to [nextTarget] when there is no RPE data or load.
     */
    fun nextTargetRpe(history: List<Pair<String, SessionExercise>>, reps: String, rule: String? = null,
                      increment: Double = 2.5, bodyweight: Boolean = false, prefs: CoachPrefs = CoachPrefs()): Target? {
        val targetRpe = prefs.target_rpe
        val base = nextTarget(history, reps, rule, increment, bodyweight, prefs)
        val (lo, hi) = parseReps(reps) ?: return base
        val last = history.firstOrNull() ?: return base
        val sets = workingSets(last.second.sets).filter { (it.weight_kg ?: 0.0) > 0 && (it.reps ?: 0) > 0 }
        if (bodyweight || rule == "none" || sets.isEmpty() || sets.none { it.effort != null && it.effort_scale != "rir" }) return base
        // Strength is read from the first working set done (freshest, least fatigue). Later sets' rising RPE is normal
        // fatigue from set order and rest, not lost strength. Falls back to the best set when order wasn't recorded.
        val inOrder = sets.sortedBy { it.seq ?: (1000 + it.set_no) }
        val best = inOrder.firstOrNull { prefs.first_set_strength && it.effort != null && it.effort_scale != "rir" && it.seq != null }
            ?: sets.maxBy { e1rmRpe(it.weight_kg!!, it.reps!!, it.effort.takeIf { _ -> it.effort_scale != "rir" }) }
        val e1 = e1rmRpe(best.weight_kg!!, best.reps!!, best.effort)
        val topW = sets.maxOf { it.weight_kg!! }
        // Aim for the low end of the range when the last session was a grind, the top end when it felt easy.
        val easy = (best.effort ?: 8.0) <= 7.0
        val targetReps = if (easy) hi else lo
        val raw = e1 / (1 + (targetReps + (10 - targetRpe)) / 30.0)
        var w = Math.round(raw / increment) * increment
        w = w.coerceAtMost(Math.floor(topW * (1 + prefs.max_jump_pct / 100) / increment) * increment).coerceAtLeast(increment)
        val missed = (best.reps ?: 0) < lo && (best.effort ?: 0.0) >= 9.5
        if (missed) w = minOf(w, topW)
        val feel = best.effort?.let { "RPE ${if (it % 1.0 == 0.0) it.toInt() else it}" } ?: "no RPE"
        val why = when {
            w > topW -> "+${round1(w - topW)} kg · ${best.weight_kg}×${best.reps} felt $feel, so you have room."
            w < topW -> "−${round1(topW - w)} kg · ${best.weight_kg}×${best.reps} at $feel was a grind; build back cleanly."
            else -> "Same ${w} kg · ${best.weight_kg}×${best.reps} at $feel — own it, then add load."
        } + " Target $targetReps reps at RPE ${if (targetRpe % 1.0 == 0.0) targetRpe.toInt() else targetRpe}."
        return Target(w, targetReps, why)
    }

    /**
     * Warm-up ramp to a working weight: ~40 % × 8, 60 % × 5, 80 % × 3 (only steps heavier than the empty bar).
     * Light work (< 30 kg) gets no ramp.
     */
    /** Parse "40x8, 60x5, 80x3" (also "40%x8", "40*8") into (fraction, reps). Bad parts are skipped. */
    fun parseRamp(text: String): List<Pair<Double, Int>> =
        text.split(',', ';').mapNotNull { part ->
            val m = Regex("(\\d{1,3})\\s*%?\\s*[x×*]\\s*(\\d{1,2})").find(part) ?: return@mapNotNull null
            val pct = m.groupValues[1].toInt(); val reps = m.groupValues[2].toInt()
            if (pct in 20..95 && reps in 1..20) pct / 100.0 to reps else null
        }

    fun warmupRamp(workKg: Double, bar: Double = 20.0, increment: Double = 2.5, prefs: CoachPrefs = CoachPrefs()): List<Pair<Double, Int>> {
        if (workKg < prefs.warmup_min_kg) return emptyList()
        return parseRamp(prefs.warmup_ramp).map { (p, r) -> maxOf(bar, Math.round(workKg * p / increment) * increment) to r }
            .distinctBy { it.first }.filter { it.first < workKg }
    }

    // ─── Session log for AI review (order + rest aware) ───────────────────────

    /**
     * One session as text, in the order it was actually performed:
     *   2026-11-10 (Day 1 — Upper, 52 min)
     *    1. Bench Press: W40×8 W60×5 | 80×5@7 · 80×5@8 (rest 2:30) · 80×5@9 (rest 1:40)
     *    2. Overhead Press (after 1): …
     * Rest = time since the previous completed set anywhere in the workout. Sets logged before order tracking
     * existed are listed in their stored order without rest times.
     */
    fun sessionLog(ss: WorkoutSession): String? {
        data class Done(val ex: SessionExercise, val set: WorkoutSet, val at: java.time.Instant?)
        val done = ss.exercises.flatMap { e -> e.sets.filter { it.done && (it.reps ?: 0) > 0 }.map { Done(e, it, it.done_at?.let { t -> runCatching { java.time.Instant.parse(t) }.getOrNull() }) } }
        if (done.isEmpty()) return null
        val ordered = done.sortedWith(compareBy({ it.set.seq ?: Int.MAX_VALUE }, { ss.exercises.indexOf(it.ex) }, { it.set.set_no }))
        val restBefore = HashMap<WorkoutSet, Long>()
        ordered.zipWithNext { a, b -> if (a.at != null && b.at != null) restBefore[b.set] = java.time.Duration.between(a.at, b.at).seconds }
        val exOrder = ordered.map { it.ex }.distinct()
        val mins = ss.finished_at?.let { f -> runCatching { java.time.Duration.between(java.time.Instant.parse(ss.started_at), java.time.Instant.parse(f)).toMinutes() }.getOrNull() }
        val head = "${ss.date} (${ss.day_name}${mins?.let { ", $it min" } ?: ""}${if (ss.deload == true) ", deload" else ""})"
        fun fmtSet(w: WorkoutSet): String {
            val kg = w.weight_kg?.let { if (it % 1.0 == 0.0) it.toInt().toString() else it.toString() } ?: "BW"
            val eff = w.effort?.let { e -> if (w.effort_scale == "rir") "@RIR${e.toInt()}" else "@${if (e % 1.0 == 0.0) e.toInt() else e}" } ?: ""
            val rest = restBefore[w]?.takeIf { it in 5..3600 }?.let { " (rest ${it / 60}:${"%02d".format(it % 60)})" } ?: ""
            return "$kg×${w.reps}$eff$rest"
        }
        val lines = exOrder.mapIndexed { i, e ->
            val sets = ordered.filter { it.ex === e }.map { it.set }
            val warm = sets.filter { it.warmup == true }.joinToString(" ") { "W" + fmtSet(it).substringBefore(" (") }
            val work = sets.filter { it.warmup != true }.joinToString(" · ") { fmtSet(it) }
            " ${i + 1}. ${e.name}${if (i > 0) " (after ${i})" else ""}: ${if (warm.isNotEmpty()) "$warm | " else ""}$work"
        }
        return head + "\n" + lines.joinToString("\n")
    }

    // ─── Powerlifting wave (block periodisation) ──────────────────────────────

    /** Default 5-week wave: % of estimated max and reps per week (week 4 = heavy single, week 5 = deload). */
    val WAVE_DEFAULT = listOf(70 to 5, 80 to 4, 90 to 3, 105 to 1, 60 to 5)

    /** Parse "70,80,90,105,60" into percentages; reps follow intensity (≥100 % → 1, ≥90 → 3, ≥80 → 4, else 5). */
    fun parseWave(text: String?): List<Pair<Int, Int>> {
        val pcts = text?.split(Regex("[,\\s/]+"))?.mapNotNull { it.trim().removeSuffix("%").toIntOrNull() }?.filter { it in 30..120 }
        if (pcts.isNullOrEmpty()) return WAVE_DEFAULT
        return pcts.take(12).map { p -> p to when { p >= 100 -> 1; p >= 90 -> 3; p >= 80 -> 4; else -> 5 } }
    }

    /** Which week of the wave [today] falls in (0-based), counting whole weeks from [start]. */
    fun waveWeek(start: String, today: String, length: Int): Int {
        val d = java.time.temporal.ChronoUnit.DAYS.between(java.time.LocalDate.parse(start), java.time.LocalDate.parse(today))
        return (Math.floorDiv(d, 7L) % length).toInt().let { if (it < 0) it + length else it }
    }

    /** Estimated max from the best working set in the last 8 weeks, RPE-aware (null when nothing usable). */
    fun estimatedMax(history: List<Pair<String, SessionExercise>>, today: String, weeks: Int = 8): Double? {
        val since = java.time.LocalDate.parse(today).minusDays(7L * weeks).toString()
        return history.filter { it.first >= since }.flatMap { workingSets(it.second.sets) }
            .filter { (it.weight_kg ?: 0.0) > 0 && (it.reps ?: 0) in 1..12 }
            .maxOfOrNull { e1rmRpe(it.weight_kg!!, it.reps!!, it.effort.takeIf { _ -> it.effort_scale != "rir" }) }
    }

    fun waveTarget(max: Double, week: Int, wave: List<Pair<Int, Int>>, increment: Double = 2.5): Target {
        val (pct, reps) = wave[week]
        val w = Math.round(max * pct / 100.0 / increment) * increment
        val why = "Wave week ${week + 1} of ${wave.size}: $pct % of your ~${max.roundToInt()} kg max." + when {
            pct > 100 -> " Heavy single: only go for it if your warm-ups move fast; otherwise take ${Math.round(max / increment) * increment} kg."
            pct <= 65 -> " Deload week: easy, fast reps to recover."
            else -> ""
        }
        return Target(w, reps, why)
    }

    // ─── Best e1RM ────────────────────────────────────────────────────────────

    /**
     * Best estimated 1RM an exercise has ever reached before [before] date.
     * Backfilled sessions count only for their own date.
     */
    fun bestE1rm(sessions: List<WorkoutSession>, exerciseId: String, before: String): Double {
        var best = 0.0
        for (s in sessions) {
            if (s.date >= before) continue
            for (e in s.exercises) {
                if (e.exercise_id != exerciseId) continue
                for (st in workingSets(e.sets)) {
                    best = maxOf(best, e1rm(st.weight_kg, st.reps) ?: 0.0)
                }
            }
        }
        return best
    }

    // ─── Muscle sets ──────────────────────────────────────────────────────────

    /**
     * Sets per muscle over the last [days] calendar days ending on [today] (warm-ups excluded).
     * Secondary muscles count half a set each.
     *
     * @param muscleOf Looks up the primary muscle and secondary muscles for a [SessionExercise].
     *                 Supply this from the loaded [Exercises] library at the call site.
     */
    fun muscleSets(
        sessions: List<WorkoutSession>,
        today: String,
        days: Int,
        muscleOf: (SessionExercise) -> Pair<String?, List<String>>,
    ): Map<String, Double> {
        val since = addDaysStr(today, -(days - 1))
        val out = mutableMapOf<String, Double>()
        for (s in sessions) {
            if (s.date < since || s.date > today) continue
            for (e in s.exercises) {
                val n = workingSets(e.sets).size
                if (n == 0) continue
                val (primary, secondary) = muscleOf(e)
                val p = e.muscle ?: primary
                if (p != null) out[p] = (out[p] ?: 0.0) + n
                for (sec in secondary) out[sec] = (out[sec] ?: 0.0) + n / 2.0
            }
        }
        return out
    }

    // ─── Heatmap ──────────────────────────────────────────────────────────────

    /**
     * Minutes trained per date, for the year heatmap.
     * Caps each session at 300 min to avoid outlier-distorting the colour scale.
     */
    fun minutesByDate(sessions: List<WorkoutSession>): Map<String, Int> {
        val out = mutableMapOf<String, Int>()
        for (s in sessions) {
            if (s.finished_at == null) continue
            val startMs = parseIsoMs(s.started_at)
            val endMs = parseIsoMs(s.finished_at)
            if (startMs == null || endMs == null) continue
            val min = maxOf(1, ((endMs - startMs) / 60_000).toInt())
            out[s.date] = (out[s.date] ?: 0) + minOf(min, 300)
        }
        return out
    }

    // ─── Unit conversion ─────────────────────────────────────────────────────

    /** Kilograms → pounds (1 decimal place). */
    fun kgToLb(kg: Double): Double = round1(kg * 2.20462)

    /** Pounds → kilograms (2 decimal places). */
    fun lbToKg(lb: Double): Double = round2(lb / 2.20462)

    // ─── Private helpers ──────────────────────────────────────────────────────

    private fun round1(x: Double) = floor(x * 10 + 0.5) / 10
    private fun round2(x: Double) = floor(x * 100 + 0.5) / 100

    /** Add [n] days to an ISO-8601 date string (YYYY-MM-DD). */
    private fun addDaysStr(date: String, n: Int): String {
        val (y, m, d) = date.split("-").map { it.toInt() }
        val cal = java.util.Calendar.getInstance().also { it.set(y, m - 1, d) }
        cal.add(java.util.Calendar.DAY_OF_MONTH, n)
        return "%04d-%02d-%02d".format(cal.get(java.util.Calendar.YEAR), cal.get(java.util.Calendar.MONTH) + 1, cal.get(java.util.Calendar.DAY_OF_MONTH))
    }

    /** Parse an ISO-8601 string to epoch milliseconds, returning null on failure. */
    private fun parseIsoMs(iso: String): Long? =
        runCatching { java.time.Instant.parse(iso).toEpochMilli() }.getOrNull()
}
