package app.forge.fitness

import app.forge.fitness.data.*
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Regression for "plan generated but never saved": required columns must never be sent as null. */
class UpsertNullsTest {
    private val api = Api({}, null)

    private fun <T> check(table: String, ser: kotlinx.serialization.KSerializer<T>, row: T) {
        val sent = api.cleanRow(table, jsonWrite.encodeToJsonElement(ser, row).jsonObject)
        val required = api.NOT_NULL.getValue(table)
        val nulls = sent.filter { (k, v) -> v is JsonNull && k in required }.keys
        assertTrue("$table sends null for required $nulls", nulls.isEmpty())
    }

    @Test fun planSessionWaterSettingsRecipe() {
        check("workout_plans", WorkoutPlan.serializer(), WorkoutPlan(id = "p", name = "AI plan"))
        check("workout_sessions", WorkoutSession.serializer(), WorkoutSession("s", "2026-11-16", "p", "d", "Day 1", "2026-11-16T10:00:00Z"))
        check("water_logs", WaterLog.serializer(), WaterLog("w", "2026-11-16", 250))
        check("settings", Settings.serializer(), Settings(keep_awake = null, timer_flash = null))
        check("recipes", Recipe.serializer(), Recipe("r", "Dal"))
        check("foods", Food.serializer(), Food(id = "f", name = "Poha", calories = 1.0, protein_g = 1.0, carbs_g = 1.0, fat_g = 1.0))
    }

    @Test fun optionalNullsStillClear() {
        val sent = api.cleanRow("workout_plans", jsonWrite.encodeToJsonElement(WorkoutPlan.serializer(), WorkoutPlan(id = "p", name = "x")).jsonObject)
        assertTrue(sent["focus"] is JsonNull) // nullable column: null is sent, so clearing works
        assertFalse(sent.containsKey("deload")) // required column: left to the DB default
    }
}
