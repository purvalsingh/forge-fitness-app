package app.forge.fitness

import app.forge.fitness.data.*
import app.forge.fitness.logic.Calc
import org.junit.Assert.*
import org.junit.Test

/** Same expectations as src/lib/calc.test.ts, so the APK and web app compute identical numbers. */
class CalcTest {
    @Test fun bmrMatchesMifflin() {
        assertEquals(1780, Calc.bmr("male", 80.0, 180.0, 30))
        assertEquals(1320, Calc.bmr("female", 60.0, 165.0, 30))
    }
    @Test fun cutTargetsAreBounded() {
        val r = Calc.calcTargets(Calc.TargetInput("male", 30, 180.0, 80.0, 72.0, "moderate", 6000, "cut", 2.0))
        assertEquals(0.8, r.rate_kg_per_week, 1e-9)
        assertTrue(r.warnings.any { "capped" in it })
        assertTrue(r.calories >= 1500)
    }
    @Test fun restDayIsNotAFailure() {
        val sun = "2026-03-01" // a Sunday
        val a = Calc.dayAdherence(sun, null, Calc.Totals(), false, null, 9000, Settings(rest_days = listOf(0)))
        assertEquals("na", a.workout); assertEquals(1.0, a.score, 1e-9)
    }
    @Test fun streakSkipsUnfinishedToday() {
        val d = listOf("2026-03-01", "2026-03-02", "2026-03-03")
        assertEquals(2, Calc.streak(d, "2026-03-03") { it != "2026-03-03" })
    }
    @Test fun adaptiveTdee() {
        val kcal = (1..21).associate { "2026-03-%02d".format(it) to 2200.0 }
        val flat = Calc.adaptiveTdee(listOf(WeightLog("a", "2026-03-01", 80.0), WeightLog("b", "2026-03-21", 80.0)), kcal, 21, "2026-03-21")
        assertEquals(2200, flat!!.tdee)
        val losing = Calc.adaptiveTdee((1..21).map { WeightLog("$it", "2026-03-%02d".format(it), 80 - it * 0.05) }, kcal, 21, "2026-03-21")
        assertTrue(losing!!.tdee > 2200)
        assertNull(Calc.adaptiveTdee(emptyList(), kcal, 21, "2026-03-21"))
    }
}
