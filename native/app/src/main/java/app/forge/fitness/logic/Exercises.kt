package app.forge.fitness.logic

import android.content.Context
import app.forge.fitness.data.Exercise
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.concurrent.atomic.AtomicReference

/**
 * Exercise library — ported from src/lib/exercises.ts.
 * Loads the bundled 1,324-exercise list from assets/exercises.json on first use,
 * off the main thread, and caches it in memory.
 */
object Exercises {

    /**
     * A library exercise entry. Flat data class (not a subclass of [Exercise]) because
     * Kotlin data classes are final and cannot be extended with override val.
     * Use [toExercise] to convert to the domain [Exercise] row for DB writes.
     */
    @Serializable
    data class LibExercise(
        val id: String,
        val name: String,
        val muscle: String? = null,
        val secondary: List<String>? = null,
        val body_part: String? = null,
        val equipment: String? = null,
        val instructions: List<String>? = null,
        val kind: String? = null,
        val per_side: Boolean? = null,
        val custom: Boolean? = null,
        val favorite: Boolean? = null,
        val rest_sec: Int? = null,
        val bar_kg: Double? = null,
        /** English step-by-step instructions. */
        val steps: List<String>? = null,
        /** Hindi step-by-step instructions. */
        val steps_hi: List<String>? = null,
    ) {
        /** Convert to the domain [Exercise] row (drops steps fields not in the DB schema). */
        fun toExercise() = Exercise(id, name, muscle, secondary, body_part, equipment, instructions,
            kind, per_side, custom, favorite, rest_sec, bar_kg)
    }

    @Serializable
    private data class ExercisesFile(val exercises: List<LibExercise>)

    private val cache = AtomicReference<List<LibExercise>?>(null)

    /** Synchronous accessor — returns null if the library has not been loaded yet. */
    fun exerciseLibrarySync(): List<LibExercise>? = cache.get()

    /**
     * Load the exercise library from assets, returning the in-memory list.
     * Safe to call from any coroutine; I/O runs on [Dispatchers.IO].
     * Subsequent calls return the cached list immediately.
     *
     * @throws Exception when the asset cannot be read.
     */
    suspend fun loadExercises(context: Context): List<LibExercise> {
        cache.get()?.let { return it }
        return withContext(Dispatchers.IO) {
            cache.get()?.let { return@withContext it }
            val text = context.assets.open("exercises.json").bufferedReader().readText()
            val file = exercisesJson.decodeFromString<ExercisesFile>(text)
            cache.set(file.exercises)
            file.exercises
        }
    }

    // ─── Normalisation ────────────────────────────────────────────────────────

    private fun norm(s: String) = s.lowercase().replace(Regex("[^a-z0-9]+"), " ").trim()

    // ─── Search ───────────────────────────────────────────────────────────────

    /** Filter parameters for [searchExercises]. */
    data class Filter(val muscle: String? = null, val equipment: String? = null)

    /**
     * Filter and rank exercises by query text, muscle filter, and equipment filter.
     * Favorites are shown first; exact prefix matches next; shorter names before longer.
     *
     * @param list       The loaded library.
     * @param q          Search query (empty = all).
     * @param filter     Optional muscle and equipment filters.
     * @param favorites  Set of exercise IDs the user has favourited.
     */
    fun searchExercises(
        list: List<LibExercise>,
        q: String,
        filter: Filter = Filter(),
        favorites: Set<String> = emptySet(),
    ): List<LibExercise> {
        val n = norm(q)
        val terms = n.split(" ").filter { it.isNotEmpty() }
        return list
            .filter { e ->
                (filter.muscle == null || e.muscle == filter.muscle || e.body_part == filter.muscle) &&
                (filter.equipment == null || e.equipment == filter.equipment) &&
                terms.all { t -> norm(e.name).contains(t) }
            }
            .sortedWith(compareBy(
                { if (favorites.contains(it.id)) 0 else 1 },
                { if (n.isNotEmpty() && norm(it.name).startsWith(n)) 0 else 1 },
                { it.name.length },
            ))
    }

    // ─── Name matching ────────────────────────────────────────────────────────

    private val ABBR: Map<String, String> = mapOf(
        "db" to "dumbbell", "bb" to "barbell", "kb" to "kettlebell",
        "ez" to "ez barbell", "ohp" to "overhead press", "rdl" to "romanian deadlift",
    )

    private val EQUIP_RANK = listOf(
        "barbell", "dumbbell", "cable", "machine", "bodyweight",
        "smith machine", "ez bar", "kettlebell", "band",
    )

    /**
     * Match a free-text exercise name (old plans, AI plans, CSV imports) to a library entry.
     * "Bench Press" means the barbell version, not the band one: when the name is ambiguous,
     * the most common equipment wins.
     */
    fun matchExercise(list: List<LibExercise>, name: String): LibExercise? {
        val n = norm(name)
            .split(" ").joinToString(" ") { ABBR[it] ?: it }
            .replace(Regex(" (wide|close|narrow) grip$"), "")

        list.find { norm(it.name) == n }?.let { return it }

        for (eq in listOf("barbell", "dumbbell", "cable", "lever")) {
            list.find { norm(it.name) == "$eq $n" }?.let { return it }
        }

        val terms = n.split(" ").filter { it.length > 1 }
        val candidates = list.filter { e -> terms.all { t -> norm(e.name).contains(t) } }
        fun rank(e: LibExercise): Int {
            val i = EQUIP_RANK.indexOf(e.equipment ?: "")
            return if (i < 0) 99 else i
        }
        return candidates.sortedWith(compareBy({ rank(it) }, { it.name.length })).firstOrNull()
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private val exercisesJson = Json { ignoreUnknownKeys = true }
}
