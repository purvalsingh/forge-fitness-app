package app.forge.fitness

import app.forge.fitness.logic.Ai
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Test

/** A real-world Gemini plan reply (long rationale, 3.0 sets, long notes, odd rest) must still become a plan. */
class AiPlanTest {
    @Test fun lenientPlanDecode() {
        val long = "x".repeat(1200)
        val raw = """{"name":"Shoulders & Back Builder","rationale":"$long","days":[
          {"name":"Upper A — Heavy Press and Width","focus":"Strength plus hypertrophy for shoulders and lats","exercises":[
            {"name":"Barbell Bench Press","sets":3.0,"reps":"5","rest_sec":180.0,"note":"${"n".repeat(300)}"},
            {"name":"Lat Pulldown","sets":"4","reps":"8-12","rest_sec":15}]},
          {"name":"Rest","focus":"","exercises":[]}]}"""
        val plan = Ai.decodeGeneratedPlan(Json.parseToJsonElement(raw).jsonObject)
        assertEquals(1, plan.days.size)                     // empty day dropped, not fatal
        assertEquals(3, plan.days[0].exercises[0].sets)     // 3.0 -> 3
        assertEquals(20, plan.days[0].exercises[1].restSec) // 15 clamped up to 20
        assertEquals(800, plan.rationale.length)            // trimmed, not rejected
    }
}
