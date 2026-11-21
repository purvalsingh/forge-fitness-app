package app.forge.fitness

import app.forge.fitness.data.CoachPrefs
import app.forge.fitness.data.json
import app.forge.fitness.logic.Coach
import kotlinx.serialization.json.*
import org.junit.Test
import java.io.File

/**
 * Offline eval harness (no-op unless COACH_EVAL_DIR is set): writes the coach-check request payload, and grades a model's
 * answers file, so the check can be run against any model outside the app.
 */
class CoachEvalDump {
    private val dir = System.getenv("COACH_EVAL_DIR")?.let(::File)
    @Test fun dumpAndGrade() {
        val d = dir ?: return
        val p = CoachPrefs(); val sc = Coach.scenarios(p)
        File(d, "payload.json").writeText(buildJsonObject {
            put("prefs", json.encodeToJsonElement(CoachPrefs.serializer(), p)); put("profile", buildJsonObject { put("goal", "strength") })
            putJsonArray("exercises") { sc.forEach { s -> addJsonObject { put("key", s.ex.key); put("name", s.ex.name); put("sets", s.ex.sets)
                put("reps", s.ex.reps); put("equipment", s.ex.equipment ?: "unknown"); put("history", s.ex.history); s.ex.maxKg?.let { put("max_kg", it) } } } }
        }.toString())
        d.listFiles { f -> f.name.startsWith("answers") && f.name.endsWith(".json") }?.sorted()?.forEach { f ->
            val o = runCatching { json.parseToJsonElement(f.readText().substringAfter("```json").substringAfter("```").let { t ->
                val a = f.readText(); a.substring(a.indexOf('{'), a.lastIndexOf('}') + 1) }).jsonObject }.getOrNull()
            val ans = (o?.get("exercises") as? JsonArray)?.mapNotNull { e -> val j = e.jsonObject
                (j["key"]?.jsonPrimitive?.content ?: return@mapNotNull null) to Coach.Planned(j["weight_kg"]!!.jsonPrimitive.double, j["reps"]!!.jsonPrimitive.double.toInt(), j["reason"]?.jsonPrimitive?.content ?: "") }?.toMap() ?: emptyMap()
            val lines = sc.map { s -> val why = s.grade(ans[s.key]); "${if (why == null) "PASS" else "FAIL"} ${s.title} -> ${ans[s.key]?.let { "${it.weightKg}kg x${it.reps}" } ?: "none"}${why?.let { " ($it)" } ?: ""}" }
            File(d, f.name.replace(".json", ".graded.txt")).writeText("score ${sc.size - lines.count { it.startsWith("FAIL") }}/${sc.size}\n" + lines.joinToString("\n"))
        }
    }
}
