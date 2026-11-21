package app.forge.fitness.logic

import app.forge.fitness.data.*
import java.util.UUID

/**
 * Data-driven plan generation — ported from src/lib/templates.ts.
 * Pure Kotlin; no Android imports.
 */
object Templates {

    // ─── Focus labels ─────────────────────────────────────────────────────────

    /** Human-readable label for every training focus value. */
    val FOCUS_LABELS: Map<String, String> = mapOf(
        "strength"           to "Strength",
        "hypertrophy"        to "Hypertrophy",
        "aesthetics"         to "Aesthetics",
        "strength_aesthetics" to "Strength + Aesthetics",
        "fat_loss"           to "Fat Loss",
        "general"            to "General Fitness",
        "athletic"           to "Athletic / Performance",
        "custom"             to "Custom",
    )

    /** Training frequencies the UI offers. */
    val FREQUENCIES = listOf(3, 4, 5, 6)

    // ─── Exercise pool ────────────────────────────────────────────────────────

    private data class PoolItem(val name: String, val compound: Boolean = false)

    private val POOL: Map<String, List<PoolItem>> = mapOf(
        "chest" to listOf(
            PoolItem("Bench Press", true), PoolItem("Incline DB Press", true),
            PoolItem("Pec Dec Fly"), PoolItem("Cable Lower-Chest Fly"), PoolItem("Push-ups"),
        ),
        "back" to listOf(
            PoolItem("Weighted Pull-ups", true), PoolItem("Barbell Row", true),
            PoolItem("Seated Cable Row", true), PoolItem("Lat Pulldown — Wide Grip"),
            PoolItem("Lat Pulldown — Close Grip"), PoolItem("Straight-arm Pulldown"),
        ),
        "shoulders" to listOf(
            PoolItem("DB Shoulder Press", true), PoolItem("Overhead Press", true),
            PoolItem("Cable Lateral Raise"), PoolItem("Cable Rear Delt Fly"), PoolItem("Face Pulls"),
        ),
        "quads" to listOf(
            PoolItem("Squat, Rack — Full Depth", true), PoolItem("Hack Squat", true),
            PoolItem("Leg Press", true), PoolItem("DB Reverse Lunge"), PoolItem("Leg Extension"),
        ),
        "hamstrings" to listOf(
            PoolItem("Romanian Deadlift — DB", true), PoolItem("Deadlift", true),
            PoolItem("Leg Curl / DB RDL"), PoolItem("Good Morning"),
        ),
        "glutes" to listOf(PoolItem("DB Hip Thrust"), PoolItem("Cable Kickback")),
        "arms" to listOf(
            PoolItem("Cable Bicep Curl"), PoolItem("DB Bicep Curl"), PoolItem("DB Hammer Curl"),
            PoolItem("Cable Tricep Pushdown"), PoolItem("Overhead Cable Tricep Extension"),
        ),
        "calves" to listOf(PoolItem("Standing Calf Raise"), PoolItem("Calf Raise")),
        "core" to listOf(PoolItem("Hanging Knee Raise"), PoolItem("Cable Crunch"), PoolItem("Plank")),
        "conditioning" to listOf(
            PoolItem("Incline Treadmill Walk"), PoolItem("Rowing Intervals"), PoolItem("Assault Bike Intervals"),
        ),
    )

    // ─── Splits ───────────────────────────────────────────────────────────────

    private data class SplitDay(val name: String, val focus: String, val groups: List<String>)

    private val SPLITS: Map<Int, List<SplitDay>> = mapOf(
        3 to listOf(
            SplitDay("Full Body A", "Full body", listOf("quads", "chest", "back", "shoulders", "core")),
            SplitDay("Full Body B", "Full body", listOf("hamstrings", "back", "chest", "arms", "core")),
            SplitDay("Full Body C", "Full body", listOf("quads", "shoulders", "back", "arms", "calves")),
        ),
        4 to listOf(
            SplitDay("Upper Strength", "Strength", listOf("chest", "back", "shoulders", "arms")),
            SplitDay("Lower Strength", "Strength", listOf("quads", "hamstrings", "calves", "core")),
            SplitDay("Upper Aesthetics", "Aesthetics", listOf("chest", "back", "shoulders", "arms")),
            SplitDay("Lower Aesthetics", "Aesthetics", listOf("quads", "hamstrings", "glutes", "calves")),
        ),
        5 to listOf(
            SplitDay("Upper Strength", "Strength", listOf("chest", "back", "shoulders", "arms", "core")),
            SplitDay("Lower Strength", "Strength", listOf("quads", "hamstrings", "calves", "core")),
            SplitDay("Upper Aesthetics", "Aesthetics", listOf("chest", "back", "shoulders", "arms", "core")),
            SplitDay("Lower Aesthetics", "Aesthetics", listOf("quads", "hamstrings", "glutes", "calves")),
            SplitDay("Arms & Weak Points", "Aesthetics", listOf("arms", "shoulders", "core")),
        ),
        6 to listOf(
            SplitDay("Push Strength", "Strength", listOf("chest", "shoulders", "arms")),
            SplitDay("Pull Strength", "Strength", listOf("back", "arms", "core")),
            SplitDay("Legs Strength", "Strength", listOf("quads", "hamstrings", "calves")),
            SplitDay("Push Aesthetics", "Aesthetics", listOf("chest", "shoulders", "arms")),
            SplitDay("Pull Aesthetics", "Aesthetics", listOf("back", "shoulders", "arms")),
            SplitDay("Legs & Core", "Aesthetics", listOf("quads", "glutes", "calves", "core")),
        ),
    )

    // ─── Set/rep schemes ──────────────────────────────────────────────────────

    private data class Scheme(val sets: Int, val reps: String, val rest: Int, val tempo: String? = null)
    private data class FocusScheme(val compound: Scheme, val accessory: Scheme, val perDay: Int, val conditioning: Int = 0)

    private val SCHEMES: Map<String, FocusScheme> = mapOf(
        "strength"            to FocusScheme(Scheme(5, "5", 180, "2-0-1"), Scheme(3, "8", 90), 5),
        "hypertrophy"         to FocusScheme(Scheme(4, "8", 120), Scheme(3, "12", 75, "3-0-1"), 7),
        "aesthetics"          to FocusScheme(Scheme(3, "10", 90), Scheme(3, "12–15", 60, "3-1-1"), 8),
        "strength_aesthetics" to FocusScheme(Scheme(4, "5", 150), Scheme(3, "10–12", 75), 7),
        "fat_loss"            to FocusScheme(Scheme(3, "10", 75), Scheme(3, "15", 45), 6, 1),
        "general"             to FocusScheme(Scheme(3, "8–10", 90), Scheme(2, "12", 60), 6, 1),
        "athletic"            to FocusScheme(Scheme(4, "5", 150, "explosive"), Scheme(3, "8", 75), 6, 1),
        "custom"              to FocusScheme(Scheme(3, "10", 90), Scheme(3, "12", 60), 6),
    )

    // ─── Emphasis mapping ─────────────────────────────────────────────────────

    private val EMPHASIS_MAP: List<Pair<Regex, String>> = listOf(
        Regex("shoulder|delt", RegexOption.IGNORE_CASE) to "shoulders",
        Regex("back|lat|width|wider", RegexOption.IGNORE_CASE) to "back",
        Regex("arm|bicep|tricep", RegexOption.IGNORE_CASE) to "arms",
        Regex("chest|pec", RegexOption.IGNORE_CASE) to "chest",
        Regex("leg|quad|thigh", RegexOption.IGNORE_CASE) to "quads",
        Regex("glute|hip", RegexOption.IGNORE_CASE) to "glutes",
        Regex("hamstring", RegexOption.IGNORE_CASE) to "hamstrings",
        Regex("calf|calves", RegexOption.IGNORE_CASE) to "calves",
        Regex("waist|core|abs|midsection", RegexOption.IGNORE_CASE) to "core",
        Regex("condition|cardio|lean|fat", RegexOption.IGNORE_CASE) to "conditioning",
    )

    /**
     * Parse free-text priority/emphasis (e.g. "bigger shoulders, wider back") into
     * muscle group keys from the pool.
     */
    fun emphasisGroups(text: String): List<String> =
        EMPHASIS_MAP.filter { (re, _) -> re.containsMatchIn(text) }
            .map { it.second }.distinct()

    // ─── Plan generation ──────────────────────────────────────────────────────

    /** Options for the deterministic plan builder. */
    data class GenerateOptions(
        val focus: String,
        val daysPerWeek: Int,
        val emphasis: List<String> = emptyList(),
        val name: String? = null,
    )

    /**
     * Generate a [WorkoutPlan] from the data tables above — no AI required.
     * Exercise selection is deterministic (pool round-robin, compounds first).
     */
    fun generatePlan(opts: GenerateOptions): WorkoutPlan {
        val dpw = if (opts.daysPerWeek in listOf(3, 4, 5, 6)) opts.daysPerWeek else 4
        val scheme = SCHEMES[opts.focus] ?: SCHEMES["custom"]!!
        val emphasis = emphasisGroups(opts.emphasis.joinToString(" "))
        val planId = uuid()

        val splits = SPLITS[dpw] ?: SPLITS[4]!!
        val days = splits.mapIndexed { di, split ->
            val groups = split.groups.toMutableList()
            for (g in emphasis) if (groups.contains(g)) groups.add(g)
            if (scheme.conditioning > 0) groups.add("conditioning")

            val used = mutableSetOf<String>()
            val picks = mutableListOf<Pair<String, Boolean>>()  // name, isCompound
            var gi = 0
            val total = scheme.perDay + scheme.conditioning
            while (picks.size < total && gi < groups.size * 3) {
                val g = groups[gi % groups.size]
                val pool = POOL[g] ?: emptyList()
                if (pool.isEmpty()) { gi++; continue }
                val item = pool.firstOrNull { !used.contains(it.name) }
                    ?: pool[(gi + di) % pool.size]
                if (!used.contains(item.name)) {
                    used.add(item.name)
                    picks.add(item.name to item.compound)
                }
                gi++
            }
            // Compounds first — heaviest work while fresh.
            picks.sortByDescending { it.second }

            WorkoutDay(
                id = uuid(),
                plan_id = planId,
                name = "Day ${di + 1} — ${split.name}",
                focus = split.focus,
                position = di,
                exercises = picks.mapIndexed { i, (pName, isCompound) ->
                    val sc = if (isCompound) scheme.compound else scheme.accessory
                    WorkoutExercise(
                        id = uuid(),
                        exercise_id = "ex-" + pName.lowercase().replace(Regex("[^a-z0-9]+"), "-"),
                        name = pName,
                        sets = sc.sets,
                        reps = sc.reps,
                        target = "",
                        position = i,
                        rest_sec = sc.rest,
                        tempo = sc.tempo,
                        note = if (emphasis.any { g -> POOL[g]?.any { it.name == pName } == true })
                            "Priority — push this one" else null,
                    )
                },
            )
        }

        return WorkoutPlan(
            id = planId,
            name = opts.name ?: "${FOCUS_LABELS[opts.focus] ?: opts.focus} · $dpw days",
            days = days,
            focus = opts.focus,
            days_per_week = dpw,
            source = "template",
            active = false,
            updated_at = java.time.Instant.now().toString(),
        )
    }

    // ─── Private ──────────────────────────────────────────────────────────────

    private fun uuid() = UUID.randomUUID().toString()
}
