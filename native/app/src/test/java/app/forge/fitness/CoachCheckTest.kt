package app.forge.fitness

import app.forge.fitness.data.CoachPrefs
import app.forge.fitness.logic.Coach
import org.junit.Assert.*
import org.junit.Test

/** The check must tell a good coach from a bad one, or its score means nothing. */
class CoachCheckTest {
    private val p = CoachPrefs()
    private val sc = Coach.scenarios(p).associateBy { it.key }
    private fun score(answers: Map<String, Coach.Planned?>) = sc.values.count { it.grade(answers[it.key]) == null }

    @Test fun competentCoachPasses() {
        val good = mapOf(
            "easy" to Coach.Planned(102.5, 5, ""), "grind" to Coach.Planned(85.0, 5, ""), "fatigue" to Coach.Planned(142.5, 5, ""),
            "order" to Coach.Planned(26.0, 9, ""), "lighter" to Coach.Planned(47.5, 5, ""), "stall" to Coach.Planned(72.5, 8, ""),
            "bodyweight" to Coach.Planned(0.0, 10, ""), "dumbbell" to Coach.Planned(15.0, 10, ""))
        assertEquals(8, score(good))
    }

    @Test fun naiveAlwaysPlusFiveFails() {
        val naive = mapOf(
            "easy" to Coach.Planned(105.0, 5, ""), "grind" to Coach.Planned(94.5, 5, ""), "fatigue" to Coach.Planned(147.0, 5, ""),
            "order" to Coach.Planned(27.3, 8, ""), "lighter" to Coach.Planned(47.25, 5, ""), "stall" to Coach.Planned(84.0, 8, ""),
            "bodyweight" to Coach.Planned(2.5, 10, ""), "dumbbell" to Coach.Planned(14.7, 10, ""))
        assertTrue("naive scored ${score(naive)}", score(naive) < Coach.PASS_MIN)
    }

    @Test fun panickyDeloaderFails() {
        val scared = sc.keys.associateWith { k -> Coach.Planned(if (k == "bodyweight") 0.0 else 10.0, 5, "") }
        assertTrue(score(scared) < Coach.PASS_MIN)
    }

    @Test fun missingAnswersFail() { assertEquals(0, score(emptyMap())) }

    @Test fun boundCapsJumpAndRounds() {
        val b = Coach.bound(Coach.Planned(130.0, 50, ""), lastTopKg = 100.0, prefs = p, increment = 2.5)
        assertEquals(105.0, b.weightKg, 0.01); assertEquals(30, b.reps)
    }

    @Test fun trustNeedsFreshPass() {
        val today = java.time.LocalDate.now().toString()
        assertTrue(Coach.trusted(p.copy(check_score = 7, check_total = 8, check_date = today)))
        assertFalse(Coach.trusted(p.copy(check_score = 6, check_total = 8, check_date = today)))
        assertFalse(Coach.trusted(p.copy(check_score = 8, check_total = 8, check_date = "2020-01-01")))
    }
}
