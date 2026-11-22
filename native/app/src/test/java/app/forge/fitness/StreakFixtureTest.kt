package app.forge.fitness

import app.forge.fitness.logic.Streak
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

/** Runs the web app's src/lib/streak.fixture.json through the native engine: web and native must agree. */
class StreakFixtureTest {
    private val file = generateSequence(File("").absoluteFile) { it.parentFile }.map { File(it, "src/lib/streak.fixture.json") }.first { it.exists() }
    private fun at(local: String) = LocalDateTime.parse(local).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
    private fun range(a: String, b: String) = generateSequence(LocalDate.parse(a)) { it.plusDays(1) }.takeWhile { !it.isAfter(LocalDate.parse(b)) }.map { it.toString() }.toList()
    private val kindName = mapOf(Streak.Kind.Shown to "shown", Streak.Kind.Rest to "rest", Streak.Kind.Frozen to "frozen", Streak.Kind.Repaired to "repaired", Streak.Kind.Miss to "miss")

    @Test fun webAndNativeAgree() {
        for (el in Json.parseToJsonElement(file.readText()).jsonArray) {
            val c = el.jsonObject
            val s = { k: String -> c[k]!!.jsonPrimitive.content }
            val workouts = c["workouts"]!!.jsonArray.map { it.jsonPrimitive.content }
            val food = c["food"]!!.jsonArray.flatMap { r ->
                val o = r.jsonObject
                range(o["from"]!!.jsonPrimitive.content, o["to"]!!.jsonPrimitive.content).map { d -> Streak.Entry(d, at(o["created"]?.jsonPrimitive?.content ?: "${d}T12:00"), true) }
            }
            val input = Streak.Input(s("today"), food + workouts.map { Streak.Entry(it, at("${it}T12:00"), true) }, workouts,
                c["restDays"]!!.jsonArray.map { it.jsonPrimitive.int }, c["daysPerWeek"]!!.jsonPrimitive.int, c["weekStart"]!!.jsonPrimitive.int)
            val r = Streak.compute(input)
            val e = c["expect"]!!.jsonObject
            val name = s("name")
            assertEquals(name, e["current"]!!.jsonPrimitive.int, r.current)
            assertEquals(name, e["best"]!!.jsonPrimitive.int, r.best)
            assertEquals(name, e["freezesLeft"]!!.jsonPrimitive.int, r.freezesLeft)
            val rep = e["repairable"]!!
            assertEquals(name, if (rep is JsonNull) null else Streak.Repairable(rep.jsonObject["days"]!!.jsonArray.map { it.jsonPrimitive.content }, rep.jsonObject["previous"]!!.jsonPrimitive.int), r.repairable)
            assertEquals(name, e["days"]!!.jsonObject.mapValues { it.value.jsonPrimitive.content }, r.days.mapValues { kindName[it.value] })
        }
    }
}
