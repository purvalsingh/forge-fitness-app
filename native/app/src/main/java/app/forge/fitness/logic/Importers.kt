package app.forge.fitness.logic

import app.forge.fitness.data.SessionExercise
import app.forge.fitness.data.WorkoutSession
import app.forge.fitness.data.WorkoutSet
import java.util.UUID

/**
 * Import workout history from Strong or Hevy CSV exports — ported from src/lib/importers.ts.
 * Exercise names become free-text entries (matched to the library at display time), so no data
 * from the file is dropped.
 * Pure Kotlin; no Android imports.
 */
object Importers {

    /** Result of a successful import. */
    data class ImportResult(
        val sessions: List<WorkoutSession>,
        val format: String,  // "strong" | "hevy"
    )

    // ─── CSV parser ───────────────────────────────────────────────────────────

    /**
     * Parse CSV text into a list of rows (each row is a list of cell strings).
     * Handles quoted fields (including escaped double-quotes `""`), comma and semicolon delimiters,
     * and Windows (CRLF) line endings.
     */
    fun parseCSV(text: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        var row = mutableListOf<String>()
        var cell = StringBuilder()
        var quoted = false
        var i = 0
        while (i < text.length) {
            when (val c = text[i]) {
                '"' -> if (quoted) {
                    if (i + 1 < text.length && text[i + 1] == '"') { cell.append('"'); i++ }
                    else quoted = false
                } else quoted = true
                ',', ';' -> if (quoted) cell.append(c)
                           else { row.add(cell.toString()); cell = StringBuilder() }
                '\n', '\r' -> if (quoted) cell.append(c)
                             else {
                                 if (c == '\r' && i + 1 < text.length && text[i + 1] == '\n') i++
                                 row.add(cell.toString()); rows.add(row)
                                 row = mutableListOf(); cell = StringBuilder()
                             }
                else -> cell.append(c)
            }
            i++
        }
        if (cell.isNotEmpty() || row.isNotEmpty()) { row.add(cell.toString()); rows.add(row) }
        return rows.filter { r -> r.any { it.trim().isNotEmpty() } }
    }

    // ─── Importer ─────────────────────────────────────────────────────────────

    /**
     * Parse a Strong or Hevy CSV export into a list of [WorkoutSession]s.
     * Returns null when the file is too short or missing required columns.
     *
     * Strong columns: Date, Workout Name, Duration, Exercise Name, Set Order, Weight, Reps, …
     * Hevy  columns: title, start_time, end_time, exercise_title, weight_kg, reps, …
     */
    fun importWorkouts(text: String): ImportResult? {
        val rows = parseCSV(text)
        if (rows.size < 2) return null
        val header = rows[0].map { it.trim().lowercase() }

        fun col(vararg names: String): Int = names.map { header.indexOf(it) }.firstOrNull { it >= 0 } ?: -1

        val isHevy = header.contains("exercise_title")
        val iDate = if (isHevy) col("start_time") else col("date")
        val iEnd  = if (isHevy) col("end_time")   else -1
        val iName = if (isHevy) col("title")       else col("workout name")
        val iEx   = if (isHevy) col("exercise_title") else col("exercise name")
        val iW    = if (isHevy) col("weight_kg")   else col("weight", "weight (kg)")
        val iR    = col("reps")
        val iSec  = if (isHevy) col("duration_seconds") else col("seconds")
        val iKm   = if (isHevy) col("distance_km") else col("distance")
        val iType = if (isHevy) col("set_type")    else -1
        val iRpe  = col("rpe")

        if (iDate < 0 || iEx < 0) return null

        val byWorkout = linkedMapOf<String, WorkoutSession>()

        for (r in rows.drop(1)) {
            if (r.size <= maxOf(iDate, iEx)) continue
            val startedMs = parseDate(r.getOrNull(iDate) ?: continue) ?: continue
            val key = "${r.getOrNull(iDate)}|${r.getOrNull(iName) ?: ""}"

            if (!byWorkout.containsKey(key)) {
                val endMs = iEnd.takeIf { it >= 0 }?.let { r.getOrNull(it)?.let { v -> parseDate(v) } }
                    ?: (startedMs + 60 * 60_000)
                byWorkout[key] = WorkoutSession(
                    id = UUID.randomUUID().toString(),
                    date = isoDate(startedMs),
                    plan_id = "import",
                    day_id  = "import",
                    day_name = (r.getOrNull(iName) ?: "Imported workout").take(60).ifBlank { "Imported workout" },
                    started_at  = isoInstant(startedMs),
                    finished_at = isoInstant(endMs),
                    backfilled  = true,
                    exercises   = emptyList(),
                )
            }

            val session = byWorkout[key]!!
            val name = (r.getOrNull(iEx) ?: "").trim().take(80)
            if (name.isEmpty()) continue

            val ex = session.exercises.find { it.name == name } ?: run {
                val newEx = SessionExercise(
                    workout_exercise_id = UUID.randomUUID().toString(),
                    exercise_id = slug(name),
                    name = name, target = "", sets = emptyList(),
                )
                byWorkout[key] = session.copy(exercises = session.exercises + newEx)
                byWorkout[key]!!.exercises.last()
            }

            fun num(idx: Int): Double? =
                if (idx >= 0 && r.getOrNull(idx)?.let { it.isNotEmpty() && it.toDoubleOrNull() != null } == true)
                    r[idx].toDouble() else null

            val newSet = WorkoutSet(
                set_no     = ex.sets.size + 1,
                weight_kg  = num(iW),
                reps       = num(iR)?.toInt(),
                done       = true,
                warmup     = if (iType >= 0 && r.getOrNull(iType)?.contains("warm", ignoreCase = true) == true) true else null,
                duration_sec = num(iSec)?.toInt(),
                distance_km  = num(iKm),
                effort       = num(iRpe),
                effort_scale = if (num(iRpe) != null) "rpe" else null,
            )
            val updatedEx = ex.copy(sets = ex.sets + newSet)
            byWorkout[key] = byWorkout[key]!!.copy(
                exercises = byWorkout[key]!!.exercises.map { if (it.name == name) updatedEx else it }
            )
        }

        if (byWorkout.isEmpty()) return null
        return ImportResult(byWorkout.values.toList(), if (isHevy) "hevy" else "strong")
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private fun slug(s: String) = "imp-" + s.lowercase().replace(Regex("[^a-z0-9]+"), "-")
        .trimStart('-').trimEnd('-').take(60)

    /** Parse various date string formats into epoch milliseconds. */
    private fun parseDate(s: String): Long? =
        // Try ISO-8601 first, then fall back to "2026-09-01 18:00:00"
        runCatching { java.time.Instant.parse(s).toEpochMilli() }.getOrNull()
            ?: runCatching {
                val sdf = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss", java.util.Locale.US)
                sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
                sdf.parse(s)?.time
            }.getOrNull()

    private fun isoDate(ms: Long): String {
        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
        return sdf.format(java.util.Date(ms))
    }

    private fun isoInstant(ms: Long): String = java.time.Instant.ofEpochMilli(ms).toString()
}
