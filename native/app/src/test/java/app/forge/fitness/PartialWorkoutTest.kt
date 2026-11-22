package app.forge.fitness

import app.forge.fitness.data.SessionExercise
import app.forge.fitness.data.WorkoutSession
import app.forge.fitness.data.WorkoutSet
import app.forge.fitness.logic.Calc
import org.junit.Assert.assertEquals
import org.junit.Test

/** Same cases as calc.test.ts "partial workouts". */
class PartialWorkoutTest {
    private fun ses(done: Int, total: Int, warm: Int = 0) = WorkoutSession(id = "s", date = "2026-11-22", plan_id = "p", day_id = "d", day_name = "Push",
        started_at = "2026-11-22T10:00:00Z", exercises = listOf(SessionExercise("we", "e", "Bench",
            sets = List(warm) { WorkoutSet(it, 20.0, 10, true, warmup = true) } + List(total) { WorkoutSet(it, 60.0, 8, it < done) })))
    @Test fun scoring() {
        assertEquals("partial", Calc.workoutCompletion(ses(2, 19)))
        assertEquals("complete", Calc.workoutCompletion(ses(16, 19)))
        assertEquals("incomplete", Calc.workoutCompletion(ses(0, 5, 3)))
    }
}
