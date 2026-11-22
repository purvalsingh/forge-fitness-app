package app.forge.fitness.logic

import app.forge.fitness.data.State
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * FORGE streak, plan-aware and forgiving (Duolingo-style). Same rules and tests as the web app's src/lib/streak.ts.
 *
 * - A day KEEPS the streak when the user showed up: logged food, finished a workout or hit the step goal.
 * - A planned REST day never breaks it: a chosen rest weekday, or (none chosen) a day off inside the plan's normal gap
 *   (7 − days per week in a row) or after the week's planned workouts are done.
 * - A MISS uses a freeze (2 per calendar month, automatic); a miss with no freeze left breaks it.
 * - Today never breaks it. Back-filled logs count only for days up to 7 days before they were entered.
 * - REPAIR: a break of 1-2 days within the last 2 days, ending a 3+ day streak, can be repaired once a month by a bonus day.
 *
 * The length counts days the user showed up; rest, frozen and repaired days keep it alive without adding.
 */
object Streak {
    const val FREEZES_PER_MONTH = 2
    const val BACKFILL_DAYS = 7L

    data class Entry(val date: String, val createdAt: Long, val done: Boolean)
    data class Input(
        val today: String, val entries: List<Entry>, val workoutDates: List<String>, val restDays: List<Int>,
        val daysPerWeek: Int, val weekStart: Int, val repaired: Set<String> = emptySet(),
    )
    enum class Kind { Shown, Rest, Frozen, Repaired, Miss }
    data class Repairable(val days: List<String>, val previous: Int)
    data class Result(val current: Int, val best: Int, val freezesLeft: Int, val days: Map<String, Kind>, val repairable: Repairable?)

    private fun d(s: String) = Calc.safeDate(s)
    private fun dayMs(s: String) = d(s).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli()
    private fun dow(s: String) = d(s).dayOfWeek.value % 7

    private fun shownUp(i: Input, date: String): Boolean {
        val limit = dayMs(date) + (BACKFILL_DAYS + 1) * 86_400_000
        return i.entries.any { it.date == date && it.done && it.createdAt <= limit }
    }

    fun isRestDay(i: Input, date: String): Boolean {
        if (i.restDays.isNotEmpty()) return dow(date) in i.restDays
        val dpw = i.daysPerWeek.coerceIn(1, 7)
        val before = i.workoutDates.filter { it < date }.sorted()
        before.lastOrNull()?.let { last -> if (java.time.temporal.ChronoUnit.DAYS.between(d(last), d(date)) <= 7 - dpw) return true }
        val weekStart = d(date).minusDays(((dow(date) - i.weekStart + 7) % 7).toLong()).toString()
        return before.count { it >= weekStart } >= dpw
    }

    fun compute(i: Input): Result {
        val days = LinkedHashMap<String, Kind>()
        val first = i.entries.map { it.date }.distinct().sorted().firstOrNull { shownUp(i, it) }
        if (first == null || first > i.today) return Result(0, 0, FREEZES_PER_MONTH, days, null)
        val used = HashMap<String, Int>()
        var run = 0; var best = 0
        var lastBreak: Repairable? = null
        val missRun = mutableListOf<String>(); var runBeforeMiss = 0
        var cur = d(first)
        val end = d(i.today)
        while (!cur.isAfter(end)) {
            val ds = cur.toString(); val month = ds.take(7)
            val shown = shownUp(i, ds)
            if (ds == i.today && !shown) break
            val kind = when {
                shown -> Kind.Shown
                isRestDay(i, ds) -> Kind.Rest
                ds in i.repaired -> Kind.Repaired
                (used[month] ?: 0) < FREEZES_PER_MONTH -> { used[month] = (used[month] ?: 0) + 1; Kind.Frozen }
                else -> Kind.Miss
            }
            days[ds] = kind
            when (kind) {
                Kind.Shown -> { run++; missRun.clear() }
                Kind.Rest -> missRun.clear()
                Kind.Miss -> { if (missRun.isEmpty()) runBeforeMiss = run; missRun += ds; lastBreak = Repairable(missRun.toList(), runBeforeMiss); run = 0 }
                else -> {}
            }
            best = maxOf(best, run)
            cur = cur.plusDays(1)
        }
        val lb = lastBreak
        val repairable = if (lb != null && lb.previous >= 3 && lb.days.size <= 2 && lb.days.last() >= d(i.today).minusDays(2).toString()) lb else null
        return Result(run, best, maxOf(0, FREEZES_PER_MONTH - (used[i.today.take(7)] ?: 0)), days, repairable)
    }

    /** Today's bonus that repairs a break: 3+ meals (or every meal type, if fewer) AND (a finished workout OR the step goal). */
    fun repairEarned(mealTypeIds: List<String>, loggedMealIds: List<String>, workoutDone: Boolean, stepsDone: Boolean): Boolean {
        val need = minOf(3, mealTypeIds.size)
        return need > 0 && loggedMealIds.filter { it in mealTypeIds }.toSet().size >= need && (workoutDone || stepsDone)
    }

    /** No created_at (local rows, not yet synced): treat the entry as made on its own day, never as "now". */
    private fun ms(iso: String?, date: String) = iso?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() } ?: (dayMs(date) + 12 * 3_600_000L)

    /** Finished and actually did something (an empty finished session isn't a workout). */
    private fun trained(s: app.forge.fitness.data.WorkoutSession) = s.finished_at != null && Calc.setProgress(s).let { (d, t) -> t == 0 || d > 0 }

    fun input(st: State, today: String, repaired: Set<String>) = Input(
        today = today,
        entries = st.foodLogs.map { Entry(it.date, ms(it.created_at, it.date), true) } +
            st.sessions.map { Entry(it.date, ms(it.started_at, it.date), trained(it)) } +
            st.steps.map { Entry(it.date, dayMs(it.date) + 23 * 3_600_000L, it.steps >= st.settings.step_goal) },
        workoutDates = st.sessions.filter { trained(it) }.map { it.date },
        restDays = st.settings.rest_days,
        // The plan they actually follow decides the rest gap; the Goals number only when there is no plan.
        daysPerWeek = st.plans.firstOrNull { it.active == true }?.days?.size?.takeIf { it > 0 } ?: st.goal?.training_days_per_week ?: 4,
        weekStart = st.settings.week_start ?: 1,
        repaired = repaired,
    )

    data class View(val result: Result, val repairOffer: Repairable?, val repairEarned: Boolean)

    /** Everything the screens need. [repairs] = stored repaired days plus "yyyy-MM#used" markers (per device). */
    fun view(st: State, today: String, repairs: Set<String>): View {
        val r = compute(input(st, today, repairs.filterNot { '#' in it }.toSet()))
        val offer = r.repairable?.takeIf { "${today.take(7)}#used" !in repairs }
        val logs = st.foodLogs.filter { it.date == today }
        val earned = repairEarned(st.mealTypes.map { it.id }, logs.map { it.meal_type_id },
            st.sessions.any { it.date == today && trained(it) }, (st.steps.firstOrNull { it.date == today }?.steps ?: 0) >= st.settings.step_goal)
        return View(r, offer, earned)
    }

    /** Days whose logs were all entered too late (back-filled > BACKFILL_DAYS later): shown faded, never counted. */
    fun lateDays(i: Input): Set<String> {
        fun limit(d: String) = dayMs(d) + (BACKFILL_DAYS + 1) * 86_400_000
        val onTime = i.entries.filter { it.done && it.createdAt <= limit(it.date) }.map { it.date }.toSet()
        return i.entries.filter { it.done && it.createdAt > limit(it.date) }.map { it.date }.toSet() - onTime
    }

    data class MonthStats(val avg: Double, val perfect: Int, val loggedDays: Int)

    /** "Days logged" = days with any food, workout or steps. "Month average" starts at first use, skips rest days and today. */
    fun monthStats(monthDates: List<String>, logged: Set<String>, days: Map<String, Kind>, today: String, score: (String) -> Double): MonthStats {
        val firstUse = logged.minOrNull()
        val scores = monthDates.filter { firstUse != null && it >= firstUse && it != today && days[it] != Kind.Rest }.map(score)
        return MonthStats(if (scores.isEmpty()) 0.0 else scores.sum() / scores.size, scores.count { it >= 0.999 }, monthDates.count { it in logged })
    }
}
