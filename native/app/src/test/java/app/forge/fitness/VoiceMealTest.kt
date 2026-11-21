package app.forge.fitness

import app.forge.fitness.logic.VoiceMeal
import org.junit.Assert.assertEquals
import org.junit.Test

class VoiceMealTest {
    @Test fun splitsSpokenMeal() {
        val parts = VoiceMeal.split("do roti, ek katori dal tadka aur a vada pav")
        assertEquals(listOf(2.0 to "roti", 1.0 to "dal tadka", 1.0 to "vada pav"), parts)
    }
    @Test fun defaultsToOneServing() {
        assertEquals(listOf(1.0 to "poha"), VoiceMeal.split("poha"))
    }
}
