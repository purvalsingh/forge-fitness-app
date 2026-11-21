package app.forge.fitness.logic

import app.forge.fitness.data.Api
import app.forge.fitness.data.ApiError
import app.forge.fitness.data.PhysiqueAnalysis
import app.forge.fitness.data.json
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

/**
 * Typed suspend functions over [Api.ai] for every AI task — ported from src/lib/ai.ts.
 *
 * Every response is decoded into a @Serializable data class **and** validated against the
 * field bounds from the Zod schemas in ai.ts. Any bound violation throws
 * [ApiError]("The AI returned an unexpected response. Enter the details manually.")
 * before the data can reach the database.
 *
 * Payload JSON shapes match ai.ts exactly so the Vercel serverless function needs no changes.
 */
object Ai {

    // ─── Response data classes ────────────────────────────────────────────────

    @Serializable
    data class FoodItem(
        val name: String,
        val qty: Double,
        val unit: String,
        @SerialName("serving_label") val servingLabel: String? = null,
        val grams: Double? = null,
        val calories: Double,
        @SerialName("protein_g") val proteinG: Double,
        @SerialName("carbs_g") val carbsG: Double,
        @SerialName("fat_g") val fatG: Double,
        @SerialName("fiber_g") val fiberG: Double? = null,
        val confidence: Double? = null,
    )

    @Serializable
    data class RejectedItem(val name: String, val reason: String)

    @Serializable
    data class FoodList(
        val items: List<FoodItem>,
        val rejected: List<RejectedItem>? = null,
    )

    @Serializable
    data class TargetAdviceAdjustments(
        val calories: Double? = null,
        @SerialName("protein_g") val proteinG: Double? = null,
        @SerialName("carbs_g") val carbsG: Double? = null,
        @SerialName("fat_g") val fatG: Double? = null,
    )

    @Serializable
    data class TargetAdvice(
        val summary: String,
        val adjustments: TargetAdviceAdjustments? = null,
    )

    @Serializable
    data class InsightItem(val kind: String, val text: String)

    @Serializable
    data class CoachReply(val reply: String, @SerialName("on_topic") val onTopic: Boolean)

    @Serializable
    data class GeneratedExercise(
        val name: String,
        val sets: Int,
        val reps: String,
        @SerialName("rest_sec") val restSec: Int,
        val tempo: String? = null,
        val note: String? = null,
    )

    @Serializable
    data class GeneratedDay(
        val name: String,
        val focus: String,
        val exercises: List<GeneratedExercise>,
    )

    @Serializable
    data class GeneratedPlan(
        val name: String,
        val rationale: String,
        val days: List<GeneratedDay>,
    )

    @Serializable
    data class PhysiquePhoto(val angle: String, val mimeType: String, val data: String)

    // ─── Input shapes ─────────────────────────────────────────────────────────

    data class GeneratePlanInput(
        val daysPerWeek: Int,
        val focus: String,
        val preferences: String? = null,
        val priorities: List<String>? = null,
        val equipment: String? = null,
        val experience: String? = null,
    )

    // ─── Public suspend functions ─────────────────────────────────────────────

    /**
     * Parse free-text food description into structured food items.
     * Task: `parse_food_text`. Validates all nutritional bounds from the Zod schema.
     */
    suspend fun parseFoodText(api: Api, text: String): FoodList {
        val payload = buildJsonObject { put("text", text) }
        val result = api.ai("parse_food_text", payload)
        return decodeFoodList(result)
    }

    /**
     * Analyse a food photo (base64 JPEG) and return food items.
     * Task: `analyze_food_photo`. Validates all nutritional bounds.
     *
     * @param imageBase64 Base64-encoded image data (no data-URI prefix).
     * @param mimeType    MIME type of the image (e.g. "image/jpeg").
     * @param hint        Optional text hint for the model (dish name, context).
     */
    suspend fun analyzeFoodPhoto(api: Api, imageBase64: String, mimeType: String, hint: String? = null): FoodList {
        val payload = buildJsonObject {
            put("image", imageBase64)
            put("mimeType", mimeType)
            if (hint != null) put("hint", hint)
        }
        val result = api.ai("analyze_food_photo", payload)
        return decodeFoodList(result)
    }

    /**
     * Send a coach chat message and receive a reply.
     * Task: `coach_chat`. Validates reply length and on_topic flag.
     *
     * @param messages Conversation history (role "user" | "model", text content).
     */
    suspend fun coachChat(api: Api, messages: List<Map<String, String>>): CoachReply {
        val payload = buildJsonObject {
            putJsonArray("messages") {
                messages.forEach { m ->
                    addJsonObject { put("role", m["role"] ?: "user"); put("text", m["text"] ?: "") }
                }
            }
        }
        val result = api.ai("coach_chat", payload)
        return decodeCoachReply(result)
    }

    /**
     * Ask for target nutrition adjustments based on user data.
     * Task: `target_advice`. Validates calorie/macro bounds.
     */
    suspend fun targetAdvice(api: Api, input: JsonElement): TargetAdvice {
        val result = api.ai("target_advice", input)
        return decodeTargetAdvice(result)
    }

    /**
     * Generate a workout plan.
     * Task: `generate_workout_plan`. Validates set/rep/rest bounds.
     */
    suspend fun generatePlan(api: Api, input: GeneratePlanInput): GeneratedPlan {
        val payload = buildJsonObject {
            put("days_per_week", input.daysPerWeek)
            put("focus", input.focus)
            if (input.preferences != null) put("preferences", input.preferences)
            if (input.priorities != null) putJsonArray("priorities") { input.priorities.forEach { add(it) } }
            if (input.equipment != null) put("equipment", input.equipment)
            if (input.experience != null) put("experience", input.experience)
        }
        val result = api.ai("generate_workout_plan", payload)
        return decodeGeneratedPlan(result)
    }

    /**
     * Run a physique analysis from progress photos.
     * Task: `physique_analysis`. Validates all numeric bounds; output is then
     * additionally clamped by [Physique.reconcile] before display.
     *
     * @param photos     1–3 angle photos (angle name + base64 JPEG).
     * @param reference  Optional reference photo to compare against.
     * @param goal       Training-focus key (e.g. "fat_loss").
     * @param priorities Free-text priority string.
     * @param context    Additional context (goal, weight, etc.) as a JSON element.
     * @param previous   Previous analysis result for change detection.
     */
    suspend fun physiqueAnalysis(
        api: Api,
        photos: List<PhysiquePhoto>,
        reference: PhysiquePhoto? = null,
        goal: String,
        priorities: String,
        context: JsonElement? = null,
        previous: JsonElement? = null,
    ): PhysiqueAnalysis {
        val payload = buildJsonObject {
            putJsonArray("photos") {
                photos.forEach { p ->
                    addJsonObject { put("angle", p.angle); put("mimeType", p.mimeType); put("data", p.data) }
                }
            }
            if (reference != null) putJsonObject("reference") {
                put("mimeType", reference.mimeType); put("data", reference.data)
            }
            put("goal", goal)
            put("priorities", priorities)
            if (context != null) put("context", context)
            if (previous != null) put("previous", previous)
        }
        val result = api.ai("physique_analysis", payload)
        return decodePhysiqueAnalysis(result)
    }

    /**
     * Generate weekly insights from user nutrition/training data.
     * Task: `insights`. Returns up to 6 insight items.
     */
    data class ReviewTarget(val name: String, val weightKg: Double, val reps: Int, val reason: String)
    data class TrainingReview(val summary: String, val changes: List<String>, val targets: List<ReviewTarget>)

    /**
     * AI review of recent training. [bestKg] maps exercise name (lowercase) -> best recent working weight; every AI
     * weight is clamped to at most +5 % of it (deterministic bound: the AI never sets an unsafe jump).
     */
    suspend fun trainingReview(api: Api, period: String, history: String, profile: JsonElement, bestKg: Map<String, Double>, maxJumpPct: Double = 5.0): TrainingReview {
        val o = api.ai("training_review", buildJsonObject { put("period", period); put("history", history); put("profile", profile) })
        return safe {
            fun cut(v: String?, n: Int) = (v ?: "").trim().let { if (it.length <= n) it else it.take(n - 1) + "…" }
            val targets = ((o["exercises"] as? JsonArray) ?: bad()).mapNotNull { el ->
                val e = el as? JsonObject ?: return@mapNotNull null
                val name = cut(e.strN("name"), 60).ifBlank { return@mapNotNull null }
                val raw = e.dblN("weight_kg") ?: return@mapNotNull null
                val cap = bestKg[name.lowercase()]?.let { it * (1 + maxJumpPct / 100) } ?: 500.0
                val w = (Math.round(raw.coerceIn(0.0, cap) / 0.5) * 0.5)
                ReviewTarget(name, w, (e.dblN("reps") ?: 5.0).toInt().coerceIn(1, 30), cut(e.strN("reason"), 200))
            }
            val changes = (o["changes"] as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.let { c -> cut(c, 200) } }?.take(3) ?: emptyList()
            TrainingReview(cut(o.strN("summary"), 700), changes, targets)
        }
    }

    suspend fun insights(api: Api, input: JsonElement): List<InsightItem> {
        val result = api.ai("insights", input)
        return decodeInsights(result)
    }

    /**
     * Fetch the user's saved key count and hints.
     * Not an AI task — calls [Api.keys] directly.
     */
    suspend fun keys(api: Api): Api.KeyStatus = api.keys()

    // ─── Decoders + validators ────────────────────────────────────────────────

    private fun bad(): Nothing = throw ApiError(
        "The AI returned an unexpected response. Enter the details manually.", "bad_ai"
    )

    private fun require(cond: Boolean) { if (!cond) bad() }
    /** Any shape surprise in an AI reply becomes one plain message, never a raw exception. */
    private inline fun <T> safe(block: () -> T): T = try { block() } catch (e: ApiError) { throw e } catch (e: Exception) { bad() }

    private fun decodeFoodList(o: JsonObject) = safe { decodeFoodListRaw(o) }
    private fun decodeFoodListRaw(o: JsonObject): FoodList {
        val itemsArr = o["items"]?.jsonArray ?: bad()
        require(itemsArr.size <= 25)
        val items = itemsArr.map { el ->
            val j = el.jsonObject
            val name     = j.str("name");   require(name.length in 1..80)
            val qty      = j.dbl("qty");    require(qty > 0 && qty <= 50)
            val unit     = j.str("unit");   require(unit.length in 1..12)
            val sl       = j.strN("serving_label"); if (sl != null) require(sl.length <= 40)
            val grams    = j.dblN("grams"); if (grams != null) require(grams in 0.0..2500.0)
            val calories = j.dbl("calories"); require(calories in 0.0..3000.0)
            val protein  = j.dbl("protein_g"); require(protein in 0.0..400.0)
            val carbs    = j.dbl("carbs_g");   require(carbs in 0.0..1000.0)
            val fat      = j.dbl("fat_g");     require(fat in 0.0..400.0)
            val fiber    = j.dblN("fiber_g");  if (fiber != null) require(fiber in 0.0..200.0)
            val conf     = j.dblN("confidence"); if (conf != null) require(conf in 0.0..1.0)
            FoodItem(name, qty, unit, sl, grams, calories, protein, carbs, fat, fiber, conf)
        }
        val rejected = o["rejected"]?.jsonArray?.map { el ->
            val j = el.jsonObject
            RejectedItem(j.str("name"), j.str("reason"))
        }
        return FoodList(items, rejected)
    }

    private fun decodeTargetAdvice(o: JsonObject) = safe { decodeTargetAdviceRaw(o) }
    private fun decodeTargetAdviceRaw(o: JsonObject): TargetAdvice {
        val summary = o.str("summary"); require(summary.length in 1..600)
        val adj = o["adjustments"]?.jsonObject?.let { j ->
            val cal  = j.dblN("calories");  if (cal  != null) require(cal  in 800.0..8000.0)
            val prot = j.dblN("protein_g"); if (prot != null) require(prot in 0.0..400.0)
            val carb = j.dblN("carbs_g");   if (carb != null) require(carb in 0.0..1200.0)
            val fat  = j.dblN("fat_g");     if (fat  != null) require(fat  in 0.0..400.0)
            TargetAdviceAdjustments(cal, prot, carb, fat)
        }
        return TargetAdvice(summary, adj)
    }

    private fun decodeInsights(o: JsonObject) = safe { decodeInsightsRaw(o) }
    private fun decodeInsightsRaw(o: JsonObject): List<InsightItem> {
        val arr = o["insights"]?.jsonArray ?: bad()
        require(arr.size <= 6)
        return arr.map { el ->
            val j = el.jsonObject
            val kind = j.str("kind"); require(kind in listOf("observation", "adjustment"))
            val text = j.str("text"); require(text.length in 1..400)
            InsightItem(kind, text)
        }
    }

    private fun decodeCoachReply(o: JsonObject) = safe { decodeCoachReplyRaw(o) }
    private fun decodeCoachReplyRaw(o: JsonObject): CoachReply {
        val reply = o.str("reply"); require(reply.length <= 2000)
        val onTopic = o["on_topic"]?.jsonPrimitive?.booleanOrNull ?: bad()
        return CoachReply(reply, onTopic)
    }

    internal fun decodeGeneratedPlan(o: JsonObject) = safe { decodeGeneratedPlanRaw(o) }
    /**
     * Lenient on cosmetics, strict on structure: long text is trimmed and numbers are clamped to safe ranges,
     * instead of discarding a whole good plan because a note ran long or "sets" came back as 3.0.
     * Structure (days, exercises, names) must still be present, or the reply is rejected.
     */
    private fun decodeGeneratedPlanRaw(o: JsonObject): GeneratedPlan {
        fun cut(v: String, n: Int) = v.trim().let { if (it.length <= n) it else it.take(n - 1).trimEnd() + "…" }
        fun num(e: JsonObject, k: String, lo: Int, hi: Int, def: Int) =
            ((e[k] as? JsonPrimitive)?.contentOrNull?.filter { it.isDigit() || it == '.' }?.toDoubleOrNull()?.let { Math.round(it).toInt() } ?: def).coerceIn(lo, hi)
        val name = cut(o.str("name"), 80).ifBlank { "Your plan" }
        val rationale = cut(o.strN("rationale") ?: "", 800)
        val daysArr = (o["days"] as? JsonArray) ?: bad()
        val days = daysArr.take(7).mapNotNull { el ->
            val j = el as? JsonObject ?: return@mapNotNull null
            val exercises = ((j["exercises"] as? JsonArray) ?: return@mapNotNull null).take(12).mapNotNull { ee ->
                val e = ee as? JsonObject ?: return@mapNotNull null
                val eName = cut(e.strN("name") ?: return@mapNotNull null, 60).ifBlank { return@mapNotNull null }
                GeneratedExercise(eName, num(e, "sets", 1, 10, 3), cut(e.strN("reps") ?: "8-12", 20).ifBlank { "8-12" },
                    num(e, "rest_sec", 20, 600, 90), e.strN("tempo")?.let { cut(it, 20) }, e.strN("note")?.let { cut(it, 160) })
            }
            if (exercises.isEmpty()) null
            else GeneratedDay(cut(j.strN("name") ?: "Day", 60).ifBlank { "Day" }, cut(j.strN("focus") ?: "", 40), exercises)
        }
        require(days.isNotEmpty())
        return GeneratedPlan(name, rationale, days)
    }

    private fun decodePhysiqueAnalysis(o: JsonObject) = safe { decodePhysiqueAnalysisRaw(o) }
    private fun decodePhysiqueAnalysisRaw(o: JsonObject): PhysiqueAnalysis {
        val compEst = o.str("composition_estimate"); require(compEst.length in 1..400)
        val strengths = o["strengths"]?.jsonArray?.let { a ->
            require(a.size <= 8); a.map { s -> val t = s.jsonPrimitive.content; require(t.length <= 200); t }
        } ?: emptyList()
        val priorities = o["priorities"]?.jsonArray?.let { a ->
            require(a.size <= 8); a.map { s -> val t = s.jsonPrimitive.content; require(t.length <= 200); t }
        } ?: emptyList()
        val observations = o["observations"]?.jsonArray?.let { a ->
            require(a.size <= 10); a.map { s -> val t = s.jsonPrimitive.content; require(t.length <= 300); t }
        } ?: emptyList()
        val changesSince = o["changes_since_last"]?.jsonArray?.let { a ->
            require(a.size <= 10); a.map { s -> val t = s.jsonPrimitive.content; require(t.length <= 300); t }
        }
        val tl = o["timeline"]?.jsonObject ?: bad()
        val tlRange = tl.str("range"); require(tlRange.length in 1..120)
        val tlAssumptions = tl["assumptions"]?.jsonArray?.let { a ->
            require(a.size <= 10); a.map { s -> val t = s.jsonPrimitive.content; require(t.length <= 300); t }
        } ?: emptyList()
        val tlMilestones = tl["milestones"]?.jsonArray?.let { a ->
            require(a.size <= 6)
            a.map { el ->
                val j = el.jsonObject
                val w = j.str("window"); require(w.length <= 60)
                val e = j.str("expectation"); require(e.length <= 400)
                app.forge.fitness.data.PhysiqueMilestone(w, e)
            }
        } ?: emptyList()

        val tr = o["training"]?.jsonObject ?: bad()
        val trDays  = tr.int("days_per_week"); require(trDays in 2..7)
        val trFocus = tr.str("focus");         require(trFocus.length <= 40)
        val trEmph  = tr["emphasis"]?.jsonArray?.let { a ->
            require(a.size <= 10); a.map { s -> val t = s.jsonPrimitive.content; require(t.length <= 80); t }
        } ?: emptyList()
        val trRat   = tr.str("rationale");     require(trRat.length <= 600)

        val nu = o["nutrition"]?.jsonObject ?: bad()
        val nuStrat = nu.str("strategy");     require(nuStrat.length <= 400)
        val nuDelta = nu.dbl("calorie_delta"); require(nuDelta in -1200.0..1200.0)
        val nuProt  = nu.dbl("protein_g_per_kg"); require(nuProt in 0.8..3.5)

        return PhysiqueAnalysis(
            composition_estimate = compEst,
            strengths = strengths,
            priorities = priorities,
            observations = observations,
            changes_since_last = changesSince,
            timeline = app.forge.fitness.data.PhysiqueTimeline(tlRange, tlAssumptions, tlMilestones),
            training = app.forge.fitness.data.PhysiqueTraining(trDays, trFocus, trEmph, trRat),
            nutrition = app.forge.fitness.data.PhysiqueNutrition(nuStrat, nuDelta, nuProt),
        )
    }

    // ─── JsonObject helpers ───────────────────────────────────────────────────

    private fun JsonObject.str(key: String): String =
        this[key]?.jsonPrimitive?.contentOrNull ?: bad()

    private fun JsonObject.strN(key: String): String? =
        this[key]?.takeIf { it != JsonNull }?.jsonPrimitive?.contentOrNull

    private fun JsonObject.dbl(key: String): Double =
        this[key]?.jsonPrimitive?.doubleOrNull ?: bad()

    private fun JsonObject.dblN(key: String): Double? =
        this[key]?.takeIf { it != JsonNull }?.jsonPrimitive?.doubleOrNull

    private fun JsonObject.int(key: String): Int =
        this[key]?.jsonPrimitive?.intOrNull ?: bad()
}
