package app.forge.fitness

import app.forge.fitness.data.*
import app.forge.fitness.logic.Physique
import org.junit.Assert.*
import org.junit.Test

/**
 * Tests for Physique.kt — especially the AI output clamping (reconcile) and local roadmap.
 */
class PhysiqueTest {

    // ─── localRoadmap ─────────────────────────────────────────────────────────

    private fun goal(current: Double, target: Double, rate: Double = 0.5, mode: String = "cut") = Goal(
        id = "g1", mode = mode, current_weight_kg = current, target_weight_kg = target,
        rate_kg_per_week = rate, activity_level = "moderate",
    )

    @Test fun `localRoadmap produces non-empty composition_estimate`() {
        val r = Physique.localRoadmap("fat_loss", "", goal(80.0, 72.0), 4)
        assertTrue(r.composition_estimate.isNotEmpty())
    }

    @Test fun `localRoadmap timeline range is plausible`() {
        val r = Physique.localRoadmap("fat_loss", "", goal(80.0, 72.0, 0.5), 4)
        // 8 kg / 0.5 = 16 weeks ≈ 3.7 months. lowMonths = max(3, round(3.7*0.9)) = 3
        val (lo, _) = r.timeline.range.split("–").map { it.trim().trimEnd { c -> !c.isDigit() }.toInt() }
        assertTrue("Timeline lo=$lo out of range", lo >= 3)
    }

    @Test fun `localRoadmap fat_loss gives negative calorie_delta`() {
        // With no body goal, fat_loss should return -400
        val r = Physique.localRoadmap("fat_loss", "", null, 4)
        assertTrue("calorie_delta should be negative for fat_loss with no goal", r.nutrition.calorie_delta < 0)
    }

    @Test fun `localRoadmap hypertrophy gives positive calorie_delta`() {
        val r = Physique.localRoadmap("hypertrophy", "", null, 4)
        assertTrue("calorie_delta should be positive for hypertrophy", r.nutrition.calorie_delta > 0)
    }

    @Test fun `localRoadmap maintenance gives zero calorie_delta`() {
        val r = Physique.localRoadmap("general", "", null, 4)
        assertEquals(0.0, r.nutrition.calorie_delta, 1.0)
    }

    @Test fun `localRoadmap with priorities sets emphasis groups`() {
        val r = Physique.localRoadmap("aesthetics", "bigger shoulders and wider back", null, 4)
        assertTrue("No shoulder priority", r.priorities.any { it.contains("shoulders", ignoreCase = true) })
        assertTrue("No back priority", r.priorities.any { it.contains("back", ignoreCase = true) })
    }

    @Test fun `localRoadmap has four standard milestones`() {
        val r = Physique.localRoadmap("strength", "", null, 5)
        assertEquals(4, r.timeline.milestones.size)
    }

    // ─── reconcile (AI clamping) ───────────────────────────────────────────────

    private fun makeAnalysis(
        calDelta: Double = 0.0, protein: Double = 1.9, days: Int = 4
    ) = PhysiqueAnalysis(
        composition_estimate = "test",
        timeline = PhysiqueTimeline("3–9 months", emptyList(), emptyList()),
        training = PhysiqueTraining(days, "general", emptyList(), ""),
        nutrition = PhysiqueNutrition("balanced", calDelta, protein),
    )

    @Test fun `reconcile clamps days_per_week below 2 up to 2`() {
        val ai = makeAnalysis(days = 1)
        val local = makeAnalysis(days = 4)
        assertEquals(2, Physique.reconcile(ai, local).training.days_per_week)
    }

    @Test fun `reconcile clamps days_per_week above 7 down to 7`() {
        val ai = makeAnalysis(days = 10)
        val local = makeAnalysis(days = 4)
        assertEquals(7, Physique.reconcile(ai, local).training.days_per_week)
    }

    @Test fun `reconcile clamps protein_g_per_kg below 1_4 up to 1_4`() {
        val ai = makeAnalysis(protein = 0.5)
        val local = makeAnalysis(protein = 1.9)
        assertEquals(1.4, Physique.reconcile(ai, local).nutrition.protein_g_per_kg, 1e-9)
    }

    @Test fun `reconcile clamps protein_g_per_kg above 2_6 down to 2_6`() {
        val ai = makeAnalysis(protein = 4.0)
        val local = makeAnalysis(protein = 1.9)
        assertEquals(2.6, Physique.reconcile(ai, local).nutrition.protein_g_per_kg, 1e-9)
    }

    @Test fun `reconcile clamps calorie_delta to 1_5x local or 700 whichever is larger`() {
        // local = 400 → limit = max(700, 600) = 700
        val ai = makeAnalysis(calDelta = 1500.0)
        val local = makeAnalysis(calDelta = 400.0)
        val result = Physique.reconcile(ai, local)
        assertTrue("calorie_delta should be clamped", result.nutrition.calorie_delta <= 700.0)
    }

    @Test fun `reconcile preserves text fields verbatim`() {
        val ai = makeAnalysis()
        val local = makeAnalysis()
        assertEquals("test", Physique.reconcile(ai, local).composition_estimate)
    }

    // ─── coerceFocus ──────────────────────────────────────────────────────────

    @Test fun `coerceFocus exact match`() {
        assertEquals("fat_loss", Physique.coerceFocus("fat_loss", "general"))
    }

    @Test fun `coerceFocus partial match`() {
        // "strength training" → starts with "strength" → "strength"
        val result = Physique.coerceFocus("strength_training", "general")
        assertTrue("strength" == result || "strength_aesthetics" == result)
    }

    @Test fun `coerceFocus falls back when no match`() {
        assertEquals("custom", Physique.coerceFocus("unknown_nonsense", "custom"))
    }

    @Test fun `coerceFocus null falls back`() {
        assertEquals("general", Physique.coerceFocus(null, "general"))
    }
}
