package app.forge.fitness

import app.forge.fitness.logic.Streak
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

/** Same cases as the web app's src/lib/streak.test.ts. */
class StreakTest {
    private fun ms(d: String) = LocalDate.parse(d).atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    private fun range(a: String, b: String) = generateSequence(LocalDate.parse(a)) { it.plusDays(1) }.takeWhile { !it.isAfter(LocalDate.parse(b)) }.map { it.toString() }.toList()
    private fun input(today: String = "2026-11-30", food: List<String> = emptyList(), workouts: List<String> = emptyList(), repaired: Set<String> = emptySet()) =
        Streak.Input(today, food.map { Streak.Entry(it, ms(it), true) } + workouts.map { Streak.Entry(it, ms(it), true) }, workouts, emptyList(), 4, 1, repaired)

    @Test fun fourDayPlanRestDaysKeepGrowing() {
        val train = range("2026-11-09", "2026-11-29").filter { LocalDate.parse(it).dayOfWeek.value % 7 in listOf(1, 2, 4, 6) }
        val r = Streak.compute(input(workouts = train))
        assertEquals(12, r.current) // 12 training days; the 9 rest days keep it alive without adding
        assertEquals(0, r.days.values.count { it == Streak.Kind.Miss || it == Streak.Kind.Frozen })
    }
    @Test fun foodEveryDayKeepsItWithoutWorkouts() = assertEquals(10, Streak.compute(input(food = range("2026-11-20", "2026-11-29"))).current)
    @Test fun oneDayMissUsesAFreeze() {
        val r = Streak.compute(input(food = range("2026-11-20", "2026-11-29") - "2026-11-25"))
        assertEquals(Streak.Kind.Frozen, r.days["2026-11-25"]); assertEquals(9, r.current); assertEquals(1, r.freezesLeft)
    }
    @Test fun threeDayMissBreaksAndOffersRepairFor48h() {
        val food = range("2026-11-20", "2026-11-26")
        val r = Streak.compute(input(food = food))
        assertEquals(0, r.current); assertEquals(Streak.Repairable(listOf("2026-11-29"), 7), r.repairable)
        assertNull(Streak.compute(input(today = "2026-12-03", food = food)).repairable)
    }
    @Test fun repairBringsItBack() = assertEquals(8, Streak.compute(input(food = range("2026-11-20", "2026-11-26") + "2026-11-30", repaired = setOf("2026-11-29"))).current)
    @Test fun unfinishedTodayNeverBreaks() = assertEquals(5, Streak.compute(input(food = range("2026-11-25", "2026-11-29"))).current)
    @Test fun repairNeedsThreeMealsOrAll() {
        assert(!Streak.repairEarned(listOf("b", "l", "d"), listOf("b", "l"), true, true))
        assert(Streak.repairEarned(listOf("b", "l", "s", "d"), listOf("b", "l", "d"), true, false))
        assert(!Streak.repairEarned(listOf("b", "l", "d"), listOf("b", "l", "d"), false, false))
    }
    @Test fun shortStreakIsNotRepairable() = assertNull(Streak.compute(input(food = range("2026-11-25", "2026-11-26"))).repairable)
    @Test fun monthStats() {
        val month = range("2026-11-01", "2026-11-22")
        val logged = range("2026-11-16", "2026-11-21").toSet()
        val m = Streak.monthStats(month, logged, emptyMap(), "2026-11-22") { if (it in logged) 0.5 else 0.0 }
        assertEquals(6, m.loggedDays); assertEquals(0.5, m.avg, 1e-9)
    }
}
