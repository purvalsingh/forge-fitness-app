package app.forge.fitness

import app.forge.fitness.data.*
import app.forge.fitness.logic.Training
import org.junit.Assert.*
import org.junit.Test

/**
 * Port of src/lib/training.test.ts (the training maths section).
 */
class TrainingTest {

    // ─── e1RM ─────────────────────────────────────────────────────────────────

    @Test fun `e1rm Epley formula is correct`() {
        // 100 × (1 + 5/30) = 116.67 → round to 1dp = 116.7
        assertEquals(116.7, Training.e1rm(100.0, 5)!!, 0.05)
    }

    @Test fun `e1rm refuses high reps`() {
        assertNull(Training.e1rm(100.0, 15))
    }

    @Test fun `e1rm single rep is bodyweight`() {
        assertEquals(100.0, Training.e1rm(100.0, 1)!!, 1e-9)
    }

    @Test fun `e1rm null inputs return null`() {
        assertNull(Training.e1rm(null, 5))
        assertNull(Training.e1rm(100.0, null))
        assertNull(Training.e1rm(null, null))
    }

    @Test fun `e1rm zero reps returns null`() {
        assertNull(Training.e1rm(100.0, 0))
    }

    // ─── Plate mathematics ────────────────────────────────────────────────────

    @Test fun `platesPerSide 70 kg with 20 kg bar`() {
        // (70-20)/2 = 25 → one 25 plate per side
        assertEquals(listOf(25.0), Training.platesPerSide(70.0, 20.0))
    }

    @Test fun `platesPerSide 62_5 kg with 20 kg bar`() {
        // (62.5-20)/2 = 21.25 → 20 + 1.25
        assertEquals(listOf(20.0, 1.25), Training.platesPerSide(62.5, 20.0))
    }

    @Test fun `platesPerSide lighter than bar returns null`() {
        assertNull(Training.platesPerSide(15.0, 20.0))
    }

    @Test fun `platesPerSide odd remainder returns null`() {
        // 71 → (71-20)/2 = 25.5 → 25 + 0.5 → no plate for 0.5
        assertNull(Training.platesPerSide(71.0, 20.0))
    }

    // ─── Rep parsing ──────────────────────────────────────────────────────────

    @Test fun `parseReps range`() {
        assertEquals(6 to 8, Training.parseReps("6-8"))
    }

    @Test fun `parseReps single`() {
        assertEquals(5 to 5, Training.parseReps("5"))
    }

    @Test fun `parseReps seconds`() {
        // "45 sec" → 45 to 45
        assertEquals(45 to 45, Training.parseReps("45 sec"))
    }

    @Test fun `parseReps unicode dash`() {
        assertEquals(8 to 10, Training.parseReps("8–10"))
    }

    // ─── Working sets ─────────────────────────────────────────────────────────

    @Test fun `workingSets excludes warmup and undone sets`() {
        val sets = listOf(
            WorkoutSet(1, 60.0, 5, done = true, warmup = true),
            WorkoutSet(2, 80.0, 5, done = true),
            WorkoutSet(3, 80.0, 4, done = false),
        )
        val working = Training.workingSets(sets)
        assertEquals(1, working.size)
        assertEquals(2, working[0].set_no)
    }

    // ─── nextTarget ───────────────────────────────────────────────────────────

    private fun session(sets: List<Pair<Double, Int>>) = SessionExercise(
        workout_exercise_id = "w", exercise_id = "x", name = "Bench", target = "",
        sets = sets.mapIndexed { i, (w, r) -> WorkoutSet(i + 1, w, r, done = true) }
    )

    private fun history(vararg entries: Pair<String, List<Pair<Double, Int>>>) =
        entries.map { (date, sets) -> date to session(sets) }

    @Test fun `nextTarget first time gives null weight and lo reps`() {
        val t = Training.nextTarget(emptyList(), "6-8")
        assertNull(t!!.weightKg)
        assertEquals(6, t.reps)
    }

    @Test fun `nextTarget adds load only when every set hit the top`() {
        val h = history("2026-09-20" to listOf(70.0 to 8, 70.0 to 8, 70.0 to 8))
        val t = Training.nextTarget(h, "6-8")
        assertEquals(72.5, t!!.weightKg!!, 1e-9)
    }

    @Test fun `nextTarget stays at same weight when reps missed`() {
        val h = history("2026-09-20" to listOf(70.0 to 8, 70.0 to 7, 70.0 to 6))
        val t = Training.nextTarget(h, "6-8")
        assertEquals(70.0, t!!.weightKg!!, 1e-9)
        assertEquals(7, t.reps)
    }

    @Test fun `nextTarget deloads after three stalls`() {
        val h = history(
            "2026-09-20" to listOf(100.0 to 3, 100.0 to 3),
            "2026-09-17" to listOf(100.0 to 3, 100.0 to 3),
            "2026-09-14" to listOf(100.0 to 3, 100.0 to 3),
        )
        val t = Training.nextTarget(h, "5")
        assertEquals(90.0, t!!.weightKg!!, 1e-9)
    }

    @Test fun `nextTarget bodyweight increments reps`() {
        val h = history("2026-09-20" to listOf(0.0 to 8, 0.0 to 8, 0.0 to 8))
        val t = Training.nextTarget(h, "6-8", bodyweight = true)
        assertEquals(9, t!!.reps)
    }

    @Test fun `nextTarget rule none stops progression`() {
        val h = history("2026-09-20" to listOf(100.0 to 8))
        val t = Training.nextTarget(h, "8", rule = "none")
        assertEquals(100.0, t!!.weightKg!!, 1e-9)
        assertEquals(8, t.reps)
    }

    // ─── bestE1rm ─────────────────────────────────────────────────────────────

    @Test fun `bestE1rm excludes on or after the cutoff date`() {
        val sessions = listOf(
            WorkoutSession("s1", "2026-09-01", "p", "d", "day", "2026-09-01T10:00:00Z",
                exercises = listOf(session(listOf(100.0 to 5))).map { it.copy(exercise_id = "bench") }),
            WorkoutSession("s2", "2026-09-10", "p", "d", "day", "2026-09-10T10:00:00Z",
                exercises = listOf(session(listOf(110.0 to 5))).map { it.copy(exercise_id = "bench") }),
        )
        // Before 2026-09-10 — only s1 should count
        val best = Training.bestE1rm(sessions, "bench", "2026-09-10")
        // e1rm(100, 5) ≈ 116.7
        assertEquals(116.7, best, 0.5)
    }

    // ─── Unit conversions ─────────────────────────────────────────────────────

    @Test fun `kgToLb is correct`() {
        assertEquals(220.5, Training.kgToLb(100.0), 0.1)
    }

    @Test fun `lbToKg is correct`() {
        assertEquals(100.0, Training.lbToKg(220.462), 0.01)
    }

    // ─── minutesByDate ────────────────────────────────────────────────────────

    @Test fun `minutesByDate caps at 300`() {
        val sessions = listOf(
            WorkoutSession("s1", "2026-09-01", "p", "d", "day",
                started_at = "2026-09-01T08:00:00Z", finished_at = "2026-09-01T16:00:00Z")
        )
        val map = Training.minutesByDate(sessions)
        assertEquals(300, map["2026-09-01"])
    }

    @Test fun `minutesByDate skips unfinished sessions`() {
        val sessions = listOf(
            WorkoutSession("s1", "2026-09-01", "p", "d", "day",
                started_at = "2026-09-01T08:00:00Z", finished_at = null)
        )
        val map = Training.minutesByDate(sessions)
        assertNull(map["2026-09-01"])
    }
}

class RpeTargetTest {
    private fun hist(w: Double, reps: Int, rpe: Double?) = listOf("2026-11-10" to app.forge.fitness.data.SessionExercise(
        "we", "ex", "Bench", sets = listOf(app.forge.fitness.data.WorkoutSet(1, w, reps, true, effort = rpe, effort_scale = "rpe"))))

    @org.junit.Test fun easySetAddsLoadButCapped() {
        val t = app.forge.fitness.logic.Training.nextTargetRpe(hist(80.0, 5, 6.0), "5")!!
        org.junit.Assert.assertTrue(t.weightKg!! > 80.0 && t.weightKg!! <= 84.0)
    }
    @org.junit.Test fun grindHoldsOrDrops() {
        val t = app.forge.fitness.logic.Training.nextTargetRpe(hist(80.0, 5, 10.0), "5")!!
        org.junit.Assert.assertTrue(t.weightKg!! < 80.0)
    }
    @org.junit.Test fun lighterForMoreRepsCountsAsStrength() {
        // Couldn't hit 80×5, did 70×10 at RPE 9: estimate ~ 70*(1+11/30) ≈ 95.7 → 5 reps @8 ≈ 95.7/1.233 ≈ 77.5 kg
        val t = app.forge.fitness.logic.Training.nextTargetRpe(hist(70.0, 10, 9.0), "5")!!
        org.junit.Assert.assertEquals(72.5, t.weightKg!!, 0.01) // capped at +5% over 70
    }
    @org.junit.Test fun rampSkipsLightWork() {
        org.junit.Assert.assertTrue(app.forge.fitness.logic.Training.warmupRamp(25.0).isEmpty())
        org.junit.Assert.assertEquals(listOf(40.0 to 8, 60.0 to 5, 80.0 to 3), app.forge.fitness.logic.Training.warmupRamp(100.0))
    }
}

class WaveTest {
    private val T = app.forge.fitness.logic.Training
    @org.junit.Test fun defaultWaveAndWeeks() {
        org.junit.Assert.assertEquals(T.WAVE_DEFAULT, T.parseWave(" 70,80, 90 ,105%, 60"))
        org.junit.Assert.assertEquals(0, T.waveWeek("2026-11-02", "2026-11-08", 5))
        org.junit.Assert.assertEquals(3, T.waveWeek("2026-11-02", "2026-11-23", 5))
        org.junit.Assert.assertEquals(0, T.waveWeek("2026-11-02", "2026-12-07", 5)) // week 6 = new cycle
    }
    @org.junit.Test fun targetsFromMax() {
        val w = T.WAVE_DEFAULT
        org.junit.Assert.assertEquals(70.0, T.waveTarget(100.0, 0, w).weightKg!!, 0.01)
        org.junit.Assert.assertEquals(105.0, T.waveTarget(100.0, 3, w).weightKg!!, 0.01)
        org.junit.Assert.assertEquals(1, T.waveTarget(100.0, 3, w).reps)
        org.junit.Assert.assertEquals(60.0, T.waveTarget(100.0, 4, w).weightKg!!, 0.01)
    }
}

class SessionLogTest {
    @org.junit.Test fun ordersSetsAndShowsRest() {
        fun st(n: Int, w: Double, r: Int, e: Double, seq: Int, at: String, warm: Boolean = false) =
            app.forge.fitness.data.WorkoutSet(n, w, r, true, warmup = warm, effort = e, effort_scale = "rpe", seq = seq, done_at = at)
        val ss = app.forge.fitness.data.WorkoutSession("s", "2026-11-10", "p", "d", "Day 1", "2026-11-10T10:00:00Z", "2026-11-10T10:52:00Z",
            exercises = listOf(
                app.forge.fitness.data.SessionExercise("a", "ohp", "Overhead Press", sets = listOf(st(1, 50.0, 5, 8.0, 4, "2026-11-10T10:20:00Z"))),
                app.forge.fitness.data.SessionExercise("b", "bench", "Bench Press", sets = listOf(
                    st(1, 60.0, 5, 5.0, 1, "2026-11-10T10:05:00Z", warm = true),
                    st(2, 80.0, 5, 7.0, 2, "2026-11-10T10:08:00Z"),
                    st(3, 80.0, 5, 9.0, 3, "2026-11-10T10:09:40Z")))))
        val log = app.forge.fitness.logic.Training.sessionLog(ss)!!
        org.junit.Assert.assertTrue(log, log.contains(" 1. Bench Press: W60×5@5 | 80×5@7 (rest 3:00) · 80×5@9 (rest 1:40)"))
        org.junit.Assert.assertTrue(log, log.contains(" 2. Overhead Press (after 1): 50×5@8 (rest 10:20)"))
        org.junit.Assert.assertTrue(log, log.startsWith("2026-11-10 (Day 1, 52 min)"))
    }

    @Test fun `warm-up rows lifted at working weight count as working sets`() {
        val ex = SessionExercise(workout_exercise_id = "w", exercise_id = "lat", name = "Lat Pulldown", target = "4 × 8-10 @ 52.5 kg",
            sets = listOf(
                WorkoutSet(set_no = 1, weight_kg = 20.0, reps = 8, done = true, warmup = true),
                WorkoutSet(set_no = 2, weight_kg = 71.5, reps = 6, done = true, warmup = true),
                WorkoutSet(set_no = 3, weight_kg = 71.5, reps = 8, done = true, warmup = true)))
        val fixed = Training.settleWarmups(ex)
        assertEquals(listOf(true, null, null), fixed.sets.map { it.warmup })
        assertEquals(2, Training.workingSets(fixed.sets).size)
    }
}
