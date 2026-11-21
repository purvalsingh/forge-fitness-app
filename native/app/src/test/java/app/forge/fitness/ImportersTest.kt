package app.forge.fitness

import app.forge.fitness.logic.Importers
import org.junit.Assert.*
import org.junit.Test

/**
 * Port of the CSV import tests from src/lib/training.test.ts (the 'CSV import' describe block).
 */
class ImportersTest {

    // ─── parseCSV ─────────────────────────────────────────────────────────────

    @Test fun `parseCSV basic`() {
        val rows = Importers.parseCSV("a,b,c\n1,2,3")
        assertEquals(2, rows.size)
        assertEquals(listOf("a", "b", "c"), rows[0])
        assertEquals(listOf("1", "2", "3"), rows[1])
    }

    @Test fun `parseCSV quoted commas`() {
        val rows = Importers.parseCSV("\"a,b\",c\n1,2")
        assertEquals("a,b", rows[0][0])
        assertEquals("c", rows[0][1])
    }

    @Test fun `parseCSV escaped quotes`() {
        val rows = Importers.parseCSV("\"say \"\"hi\"\"\",ok")
        assertEquals("say \"hi\"", rows[0][0])
    }

    @Test fun `parseCSV CRLF line endings`() {
        val rows = Importers.parseCSV("a,b\r\n1,2\r\n")
        assertEquals(2, rows.size)
    }

    // ─── importWorkouts — Strong ───────────────────────────────────────────────

    private val STRONG_CSV = """Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-09-01 18:00:00,Push,1h,Bench Press (Barbell),1,60,8,,,,,
2026-09-01 18:00:00,Push,1h,Bench Press (Barbell),2,60,7,,,,,8"""

    @Test fun `Strong import detects format`() {
        val r = Importers.importWorkouts(STRONG_CSV)!!
        assertEquals("strong", r.format)
    }

    @Test fun `Strong import produces one session`() {
        val r = Importers.importWorkouts(STRONG_CSV)!!
        assertEquals(1, r.sessions.size)
    }

    @Test fun `Strong import reads reps correctly`() {
        val r = Importers.importWorkouts(STRONG_CSV)!!
        val reps = r.sessions[0].exercises[0].sets.map { it.reps }
        assertEquals(listOf(8, 7), reps)
    }

    @Test fun `Strong import reads weight correctly`() {
        val r = Importers.importWorkouts(STRONG_CSV)!!
        val w = r.sessions[0].exercises[0].sets[0].weight_kg
        assertEquals(60.0, w!!, 1e-9)
    }

    @Test fun `Strong import sets done = true`() {
        val r = Importers.importWorkouts(STRONG_CSV)!!
        assertTrue(r.sessions[0].exercises[0].sets.all { it.done })
    }

    @Test fun `Strong import sets backfilled = true`() {
        val r = Importers.importWorkouts(STRONG_CSV)!!
        assertTrue(r.sessions[0].backfilled == true)
    }

    // ─── importWorkouts — Hevy ────────────────────────────────────────────────

    private val HEVY_CSV = """title,start_time,end_time,exercise_title,set_type,weight_kg,reps,duration_seconds,distance_km,rpe
Push Day,2026-09-02T10:00:00Z,2026-09-02T11:00:00Z,Squat (Barbell),normal,80,5,,,
Push Day,2026-09-02T10:00:00Z,2026-09-02T11:00:00Z,Squat (Barbell),warmup,60,8,,,"""

    @Test fun `Hevy import detects format`() {
        val r = Importers.importWorkouts(HEVY_CSV)!!
        assertEquals("hevy", r.format)
    }

    @Test fun `Hevy import marks warmup sets`() {
        val r = Importers.importWorkouts(HEVY_CSV)!!
        val sets = r.sessions[0].exercises[0].sets
        // warmup row is second → set_no 2
        val warmupSet = sets.find { it.warmup == true }
        assertNotNull(warmupSet)
    }

    @Test fun `Hevy import produces correct exercise name`() {
        val r = Importers.importWorkouts(HEVY_CSV)!!
        assertEquals("Squat (Barbell)", r.sessions[0].exercises[0].name)
    }

    // ─── Edge cases ───────────────────────────────────────────────────────────

    @Test fun `importWorkouts returns null for empty input`() {
        assertNull(Importers.importWorkouts(""))
    }

    @Test fun `importWorkouts returns null for header only`() {
        assertNull(Importers.importWorkouts("Date,Workout Name,Exercise Name\n"))
    }

    @Test fun `importWorkouts handles multiple exercises per session`() {
        val csv = """Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-09-01 18:00:00,Push,1h,Bench Press (Barbell),1,60,8,,,,,
2026-09-01 18:00:00,Push,1h,Overhead Press,1,40,10,,,,,"""
        val r = Importers.importWorkouts(csv)!!
        assertEquals(2, r.sessions[0].exercises.size)
    }
}
