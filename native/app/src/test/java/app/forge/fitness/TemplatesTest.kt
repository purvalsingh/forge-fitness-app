package app.forge.fitness

import app.forge.fitness.logic.Templates
import org.junit.Assert.*
import org.junit.Test

/**
 * Tests for the deterministic plan generator (Templates.kt).
 */
class TemplatesTest {

    @Test fun `generatePlan produces correct number of days`() {
        for (dpw in listOf(3, 4, 5, 6)) {
            val plan = Templates.generatePlan(Templates.GenerateOptions("strength", dpw))
            assertEquals("days_per_week=$dpw", dpw, plan.days.size)
        }
    }

    @Test fun `generatePlan snaps invalid daysPerWeek to 4`() {
        val plan = Templates.generatePlan(Templates.GenerateOptions("strength", 7))
        assertEquals(4, plan.days.size)
    }

    @Test fun `generatePlan every day has at least one exercise`() {
        val plan = Templates.generatePlan(Templates.GenerateOptions("hypertrophy", 4))
        plan.days.forEach { day -> assertTrue(day.exercises.isNotEmpty()) }
    }

    @Test fun `generatePlan compounds come before accessories`() {
        val plan = Templates.generatePlan(Templates.GenerateOptions("strength", 4))
        // In a strength plan the first exercise in a day should be a compound.
        // We verify no accessory appears before the last compound.
        plan.days.forEach { day ->
            var lastCompound = -1
            var firstAccessory = day.exercises.size
            day.exercises.forEachIndexed { i, ex ->
                // "5 sets of 5 reps" → compound; "3 sets of 8" → accessory (heuristic)
                if (ex.sets == 5 && ex.reps == "5") lastCompound = i
                else if (ex.sets == 3 && lastCompound == -1) firstAccessory = minOf(firstAccessory, i)
            }
            assertTrue("Accessory before compound in day '${day.name}'",
                firstAccessory >= lastCompound || lastCompound == -1)
        }
    }

    @Test fun `generatePlan no duplicate exercises within a day`() {
        val plan = Templates.generatePlan(Templates.GenerateOptions("aesthetics", 6))
        plan.days.forEach { day ->
            val names = day.exercises.map { it.name }
            assertEquals("Duplicates in '${day.name}'", names.distinct().size, names.size)
        }
    }

    @Test fun `generatePlan fat_loss plan adds conditioning`() {
        val plan = Templates.generatePlan(Templates.GenerateOptions("fat_loss", 4))
        val hasConditioning = plan.days.any { d ->
            d.exercises.any { e ->
                (e.name ?: "").contains("Treadmill", ignoreCase = true) ||
                (e.name ?: "").contains("Rowing", ignoreCase = true) ||
                (e.name ?: "").contains("Assault", ignoreCase = true)
            }
        }
        assertTrue("No conditioning in fat_loss plan", hasConditioning)
    }

    @Test fun `emphasisGroups parses free text`() {
        val groups = Templates.emphasisGroups("I want bigger shoulders and a wider back")
        assertTrue("shoulders" in groups)
        assertTrue("back" in groups)
    }

    @Test fun `emphasisGroups empty text returns empty list`() {
        assertTrue(Templates.emphasisGroups("").isEmpty())
    }

    @Test fun `generatePlan with emphasis adds priority note`() {
        val plan = Templates.generatePlan(Templates.GenerateOptions(
            focus = "aesthetics", daysPerWeek = 4, emphasis = listOf("bigger shoulders")
        ))
        val hasPriorityNote = plan.days.any { d ->
            d.exercises.any { e -> e.note?.contains("Priority") == true }
        }
        assertTrue("No priority note when shoulder emphasis requested", hasPriorityNote)
    }

    @Test fun `generatePlan uses custom name when supplied`() {
        val plan = Templates.generatePlan(Templates.GenerateOptions(
            focus = "strength", daysPerWeek = 4, name = "My Plan"
        ))
        assertEquals("My Plan", plan.name)
    }

    @Test fun `generatePlan source is template`() {
        val plan = Templates.generatePlan(Templates.GenerateOptions("general", 3))
        assertEquals("template", plan.source)
    }

    @Test fun `FOCUS_LABELS covers all standard keys`() {
        val keys = listOf("strength", "hypertrophy", "aesthetics", "strength_aesthetics",
            "fat_loss", "general", "athletic", "custom")
        keys.forEach { k -> assertNotNull("Missing label for $k", Templates.FOCUS_LABELS[k]) }
    }
}
