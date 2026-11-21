package app.forge.fitness.logic

import app.forge.fitness.data.*
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.temporal.ChronoUnit
import kotlin.math.*

/** ALL deterministic maths (port of src/lib/calc.ts + derive.ts). AI explains and personalises; it never replaces this. */
object Calc {
    /** Rest/train choices made on Today for single dates ("rest" or a plan day id), mirrored from Store. */
    @Volatile var dayPicks: Map<String, String> = emptyMap()
    const val REST = "rest"
    /** A date is a rest day if the user chose rest for it, or it is a weekly rest day they didn't choose to train on. */
    fun isRestDay(date: String, settings: Settings): Boolean =
        dayPicks[date]?.let { it == REST } ?: (dow(date) in settings.rest_days)

    val ACTIVITY_FACTOR = mapOf("sedentary" to 1.2, "light" to 1.375, "moderate" to 1.55, "high" to 1.725, "athlete" to 1.9)
    val LEVEL_STEPS = mapOf("sedentary" to 5000, "light" to 7500, "moderate" to 10000, "high" to 12500, "athlete" to 15000)
    const val KCAL_PER_KG = 7700.0

    /** Mifflin-St Jeor. */
    fun bmr(sex: String, weightKg: Double, heightCm: Double, age: Int): Int {
        val base = 10 * weightKg + 6.25 * heightCm - 5 * age.coerceIn(13, 90)
        return jsRound(if (sex == "male") base + 5 else base - 161)
    }

    fun tdee(sex: String, w: Double, h: Double, age: Int, activity: String, avgSteps: Int = 0): Int {
        // The activity level already includes everyday walking; only steps beyond it add ~0.4 kcal/kg per 1,000.
        val stepBonus = max(0, avgSteps - (LEVEL_STEPS[activity] ?: 10000)) / 1000.0 * 0.4 * w
        return jsRound(bmr(sex, w, h, age) * (ACTIVITY_FACTOR[activity] ?: 1.55) + stepBonus)
    }

    data class TargetInput(val sex: String, val age: Int, val heightCm: Double, val weightKg: Double, val targetWeightKg: Double,
                           val activity: String, val avgSteps: Int, val mode: String, val rateKgPerWeek: Double)
    data class TargetResult(val maintenance: Int, val calories: Int, val protein_g: Int, val carbs_g: Int, val fat_g: Int,
                            val rate_kg_per_week: Double, val weeks_to_target: Int?, val warnings: List<String>)

    fun calcTargets(i: TargetInput): TargetResult {
        val warnings = mutableListOf<String>()
        val maintenance = tdee(i.sex, i.weightKg, i.heightCm, i.age, i.activity, i.avgSteps)
        var rate = abs(i.rateKgPerWeek)
        val maxRate = if (i.mode == "cut") min(1.0, i.weightKg * 0.01) else 0.5
        if (rate > maxRate) { rate = maxRate; warnings += "Rate capped at ${"%.2f".format(maxRate)} kg/week for safety." }
        if (i.mode == "maintain") rate = 0.0
        val signed = when (i.mode) { "cut" -> -rate; "bulk" -> rate; else -> 0.0 }
        var calories = jsRound(maintenance + signed * KCAL_PER_KG / 7)
        val floor = if (i.sex == "male") 1500 else 1200
        if (calories < floor) { calories = floor; warnings += "Calories raised to the $floor kcal floor." }
        if (calories > maintenance * 1.35) { calories = jsRound(maintenance * 1.35); warnings += "Surplus capped at 35% over maintenance." }
        val anchor = if (i.mode == "cut") min(i.weightKg, max(i.targetWeightKg, i.weightKg * 0.8)) else i.weightKg
        val protein = jsRound(clamp(anchor * (if (i.mode == "cut") 2.2 else 1.9), 60.0, 260.0))
        val fat = jsRound(clamp(calories * 0.25 / 9, i.weightKg * 0.6, i.weightKg * 1.4))
        val carbs = max(30, jsRound((calories - protein * 4 - fat * 9) / 4.0))
        val delta = abs(i.targetWeightKg - i.weightKg)
        val weeks = if (rate > 0 && delta > 0) ceil(delta / rate).toInt() else null
        if (i.targetWeightKg <= 0 || i.targetWeightKg > 400) warnings += "Target weight looks invalid."
        if (i.mode == "cut" && i.targetWeightKg > i.weightKg) warnings += "Cut selected but target weight is above current weight."
        if (i.mode == "bulk" && i.targetWeightKg < i.weightKg) warnings += "Bulk selected but target weight is below current weight."
        return TargetResult(maintenance, calories, protein, carbs, fat, rate, weeks, warnings)
    }

    fun clamp(n: Double, lo: Double, hi: Double) = min(hi, max(lo, n))
    /** JS Math.round semantics (half rounds up, also for negatives) so numbers match the web app exactly. */
    fun jsRound(x: Double): Int = floor(x + 0.5).toInt()
    fun round1(x: Double) = floor(x * 10 + 0.5) / 10

    fun isValidTarget(c: Double, p: Double, carbs: Double, f: Double) =
        c in 800.0..8000.0 && p in 0.0..400.0 && carbs in 0.0..1200.0 && f in 0.0..400.0

    data class Totals(val calories: Double = 0.0, val protein_g: Double = 0.0, val carbs_g: Double = 0.0, val fat_g: Double = 0.0) {
        operator fun plus(o: Totals) = Totals(calories + o.calories, protein_g + o.protein_g, carbs_g + o.carbs_g, fat_g + o.fat_g)
    }

    fun scaleFood(f: Food, qty: Double): Totals {
        val k = qty / (if (f.base == 0.0) 1.0 else f.base)
        return Totals(round1(f.calories * k), round1(f.protein_g * k), round1(f.carbs_g * k), round1(f.fat_g * k))
    }

    fun sumTotals(logs: List<FoodLog>) = logs.fold(Totals()) { a, l -> a + Totals(l.calories, l.protein_g, l.carbs_g, l.fat_g) }
    fun totalsByMeal(logs: List<FoodLog>) = logs.groupBy { it.meal_type_id }.mapValues { sumTotals(it.value) }

    // ---------- adherence ----------
    data class DayAdherence(val diet: String, val workout: String, val steps: String, val score: Double)

    /**
     * Single source of truth for completion. Rest day => workout 'na' (never a failure); 'na' components
     * have their weight redistributed. See CLAUDE.md rule 6.
     */
    fun dayAdherence(date: String, target: NutritionTarget?, totals: Totals, hasFoodLogs: Boolean,
                     session: WorkoutSession?, steps: Int?, settings: Settings, trainedRecently: Boolean = false): DayAdherence {
        val tol = settings.diet_tolerance
        val diet = when {
            target != null && hasFoodLogs -> {
                val calOk = abs(totals.calories - target.calories) <= target.calories * tol
                val proOk = totals.protein_g >= target.protein_g * (1 - tol)
                if (calOk && proOk) "complete" else if (totals.calories >= target.calories * 0.6) "partial" else "incomplete"
            }
            target != null -> "incomplete"
            else -> "na"
        }
        // No rest days chosen: a day off within two days of a workout counts as rest (3-5 day plans keep their streak).
        val isRest = isRestDay(date, settings) || (settings.rest_days.isEmpty() && dayPicks[date] == null && trainedRecently)
        val workout = when { session?.finished_at != null -> "complete"; session != null -> "partial"; isRest -> "na"; else -> "incomplete" }
        val stepC = when { steps == null -> "na"; steps >= settings.step_goal -> "complete"; steps >= settings.step_goal * 0.6 -> "partial"; else -> "incomplete" }
        val w = settings.adherence_weights
        val active = listOf(diet to w.diet, workout to w.workout, stepC to w.steps).filter { it.first != "na" }
        val totalW = active.sumOf { it.second }
        val score = if (totalW == 0.0) 0.0 else active.sumOf { (c, x) -> x * when (c) { "complete" -> 1.0; "partial" -> 0.5; else -> 0.0 } } / totalW
        return DayAdherence(diet, workout, stepC, jsRound(score * 100) / 100.0)
    }

    fun adherenceFor(s: State, date: String): DayAdherence {
        val logs = s.foodLogs.filter { it.date == date }
        return dayAdherence(date, s.target, sumTotals(logs), logs.isNotEmpty(), s.sessions.find { it.date == date },
            s.steps.find { it.date == date }?.steps, s.settings,
            trainedRecently = (1..2).any { n -> val d = java.time.LocalDate.parse(date).minusDays(n.toLong()).toString(); s.sessions.any { it.date == d && it.finished_at != null } })
    }

    fun activeDates(s: State) = (s.foodLogs.map { it.date } + s.sessions.map { it.date } + s.steps.map { it.date }).toSortedSet().toList()

    /** Consecutive days ending today (or yesterday, so an unfinished today does not break it). */
    fun streak(dates: List<String>, today: String, ok: (String) -> Boolean): Int {
        val set = dates.toHashSet(); var n = 0
        var cur = if (ok(today)) today else addDays(today, -1)
        while (cur in set && ok(cur)) { n++; cur = addDays(cur, -1) }
        return n
    }

    fun bestStreak(dates: List<String>, ok: (String) -> Boolean): Int {
        var best = 0; var run = 0; var prev: String? = null
        for (d in dates.sorted()) {
            if (!ok(d)) { run = 0; prev = null; continue }
            run = if (prev != null && addDays(prev, 1) == d) run + 1 else 1
            best = max(best, run); prev = d
        }
        return best
    }

    // ---------- dates (the logical day ends at day_start_hour, default 4 AM) ----------
    var dayStartHour = 4
        set(v) { field = v.coerceIn(0, 12) }
    fun today(now: LocalDateTime = LocalDateTime.now()): String = now.minusHours(dayStartHour.toLong()).toLocalDate().toString()
    fun addDays(date: String, n: Int): String = LocalDate.parse(date).plusDays(n.toLong()).toString()
    fun daysBack(n: Int, from: String = today()) = (0 until n).map { addDays(from, -(n - 1 - it)) }
    /** 0 = Sunday, like JS getDay(). */
    fun dow(date: String) = LocalDate.parse(date).dayOfWeek.value % 7

    fun monthGrid(year: Int, month0: Int): List<String?> {
        val first = LocalDate.of(year, month0 + 1, 1)
        val cells = MutableList<String?>(first.dayOfWeek.value % 7) { null }
        for (d in 1..first.lengthOfMonth()) cells += first.withDayOfMonth(d).toString()
        while (cells.size % 7 != 0) cells += null
        return cells
    }

    fun sessionVolume(s: WorkoutSession) = s.exercises.sumOf { e -> e.sets.sumOf { if (it.done && it.weight_kg != null && it.reps != null) it.weight_kg * it.reps else 0.0 } }
    fun sessionSets(s: WorkoutSession) = s.exercises.sumOf { e -> e.sets.count { it.done } }

    fun goalProgress(g: Goal, current: Double): Double {
        val span = g.target_weight_kg - g.current_weight_kg
        if (abs(span) < 0.01) return 1.0
        return clamp((current - g.current_weight_kg) / span, 0.0, 1.0)
    }

    data class TrendPoint(val date: String, val weight_kg: Double, val trend: Double)
    /** Exponentially weighted trend over weigh-ins (raw points kept intact). */
    fun trend(points: List<WeightLog>, alpha: Double = 0.25): List<TrendPoint> {
        var ema: Double? = null
        return points.map { p -> val e = ema?.let { alpha * p.weight_kg + (1 - alpha) * it } ?: p.weight_kg; ema = e
            TrendPoint(p.date, p.weight_kg, floor(e * 100 + 0.5) / 100) }
    }

    data class Adaptive(val tdee: Int, val loggedDays: Int, val trendDeltaKg: Double)
    /**
     * Adaptive maintenance: average logged intake minus the energy implied by the weight-trend change
     * (7700 kcal/kg). Needs >=14 logged days and >=2 weigh-ins at least a week apart.
     */
    fun adaptiveTdee(weights: List<WeightLog>, dailyKcal: Map<String, Double>, days: Int = 21, end: String = today()): Adaptive? {
        val window = daysBack(days, end)
        val logged = window.filter { (dailyKcal[it] ?: 0.0) > 0 }
        val w = weights.filter { it.date >= window[0] && it.date <= end }.sortedBy { it.date }
        if (logged.size < 14 || w.size < 2) return null
        val tr = trend(w)
        val span = ChronoUnit.DAYS.between(LocalDate.parse(w.first().date), LocalDate.parse(w.last().date)).toDouble()
        if (span < 7) return null
        val delta = tr.last().trend - tr.first().trend
        val avg = logged.sumOf { dailyKcal[it]!! } / logged.size
        return Adaptive(jsRound(avg - delta * KCAL_PER_KG / span).coerceIn(1000, 6000), logged.size, floor(delta * 100 + 0.5) / 100)
    }
}
