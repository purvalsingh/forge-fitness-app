# logic batch report

**Build check:** `./gradlew --no-daemon -q :app:testDebugUnitTest :app:compileDebugKotlin` → exit 0, zero `e:` lines.  
**Test results:** 75 tests, 0 failures, 0 errors (5 CalcTest + 25 TrainingTest + 17 PhysiqueTest + 12 TemplatesTest + 16 ImportersTest).

---

## Files written

| File | Source ported from | Notes |
|------|--------------------|-------|
| `logic/Training.kt` | `src/lib/training.ts` | e1RM, plate maths, rep parsing, working sets, exercise history, nextTarget, bestE1rm, muscleSets, minutesByDate (heatmap), kgToLb/lbToKg |
| `logic/Templates.kt` | `src/lib/templates.ts` | POOL, SPLITS, SCHEMES, emphasisGroups, generatePlan, FOCUS_LABELS, FREQUENCIES |
| `logic/Planner.kt` | `src/lib/planner.ts` | PlanRequest, PlanResult, fromGenerated, requestPlan (AI + template fallback) |
| `logic/Physique.kt` | `src/lib/physique.ts` | localRoadmap (deterministic roadmap), coerceFocus, reconcile (AI output clamping) |
| `logic/Catalog.kt` | `src/lib/catalog.ts` | CatalogFood, loadCatalog (assets, off-main-thread, cached), ALIASES (Indian food), searchFoods, byRegion, servingGrams, groundItem, toFoodRow, REGIONS |
| `logic/Exercises.kt` | `src/lib/exercises.ts` | LibExercise, loadExercises (assets, cached), exerciseLibrarySync, searchExercises, matchExercise |
| `logic/Importers.kt` | `src/lib/importers.ts` | parseCSV (quoted fields, CRLF), importWorkouts (Strong + Hevy CSV) |
| `logic/Ai.kt` | `src/lib/ai.ts` | FoodItem, FoodList, TargetAdvice, CoachReply, GeneratedPlan, PhysiquePhoto, plus suspend functions parseFoodText, analyzeFoodPhoto, coachChat, targetAdvice, generatePlan, physiqueAnalysis, insights; full Zod-equivalent validation on every field with ApiError on violation |
| `logic/Photos.kt` | `src/lib/photos.ts` | put/get/del/keys/clear (JPEG files in context.filesDir/photos), downscale (Android Bitmap), splitDataUrl, putDataUrl/getDataUrl |

## Tests written

| File | Tests | What's covered |
|------|-------|----------------|
| `TrainingTest.kt` | 25 | e1RM (Epley, high-reps refused, null inputs), platesPerSide (standard, fractional, light, odd), parseReps (range, single, seconds, unicode dash), workingSets, nextTarget (first time, adds load, stays on miss, deloads ×3, bodyweight, rule=none), bestE1rm, kgToLb/lbToKg, minutesByDate (cap, skip unfinished) |
| `ImportersTest.kt` | 16 | parseCSV (basic, quoted commas, escaped quotes, CRLF), importWorkouts Strong (format, session count, reps, weight, done flag, backfilled), Hevy (format, warmup, name), edge cases (empty, header-only, multi-exercise) |
| `TemplatesTest.kt` | 12 | Day count, snap to 4, every day has exercises, compounds first, no duplicates per day, conditioning in fat_loss, emphasisGroups parsing, emphasis priority note, custom name, source=template, FOCUS_LABELS completeness |
| `PhysiqueTest.kt` | 17 | localRoadmap (composition_estimate, timeline range, calorie_delta for fat_loss/hypertrophy/maintain, priorities parsed, four milestones), reconcile (days_per_week clamp ≤2/≥7, protein_g_per_kg clamp, calorie_delta clamp, text preserved), coerceFocus (exact, partial, fallback, null) |

## NOT ported / differences

- **Catalog.kt**: Does not subclass `Food` (Kotlin `data class` is final; we use a flat `CatalogFood` with `toFoodRow()` for DB writes). Behaviour is identical.
- **Exercises.kt**: Does not subclass `Exercise` for the same reason; `LibExercise.toExercise()` converts for DB writes.
- **Photos.kt**: Web version uses IndexedDB; native version uses `context.filesDir/photos` (JPEG files). Same privacy guarantees, same public API shape. `downscale()` uses Android `Bitmap` instead of Canvas (the brief explicitly allows Android imports for Photos).
- **Catalog.kt `scoreOf()`**: Simplified compared to the full `searchFoods` rescoring — calls `searchFoods` and then computes name score inline; produces identical grounding results.
- **ai.ts `authHeaders()` / `aiKeys`**: Handled by `Api.kt` (already built); `Ai.kt` delegates to `Api.ai(task, payload)`.

---

## Public API signatures

### Training.kt
```kotlin
object Training {
    fun e1rm(weightKg: Double?, reps: Int?): Double?
    fun platesPerSide(total: Double, bar: Double = 20.0, plates: List<Double> = PLATES): List<Double>?
    fun parseReps(reps: String): Pair<Int, Int>?
    fun workingSets(sets: List<WorkoutSet>): List<WorkoutSet>
    fun exerciseHistory(sessions: List<WorkoutSession>, exerciseId: String, before: String? = null): List<Pair<String, SessionExercise>>
    data class Target(val weightKg: Double?, val reps: Int, val why: String)
    fun nextTarget(history: List<Pair<String, SessionExercise>>, reps: String, rule: String? = null, increment: Double = 2.5, bodyweight: Boolean = false): Target?
    fun bestE1rm(sessions: List<WorkoutSession>, exerciseId: String, before: String): Double
    fun muscleSets(sessions: List<WorkoutSession>, today: String, days: Int, muscleOf: (SessionExercise) -> Pair<String?, List<String>>): Map<String, Double>
    fun minutesByDate(sessions: List<WorkoutSession>): Map<String, Int>
    fun kgToLb(kg: Double): Double
    fun lbToKg(lb: Double): Double
}
```

### Templates.kt
```kotlin
object Templates {
    val FOCUS_LABELS: Map<String, String>
    val FREQUENCIES: List<Int>
    fun emphasisGroups(text: String): List<String>
    data class GenerateOptions(val focus: String, val daysPerWeek: Int, val emphasis: List<String> = [], val name: String? = null)
    fun generatePlan(opts: GenerateOptions): WorkoutPlan
}
```

### Planner.kt
```kotlin
object Planner {
    data class PlanRequest(val focus: String, val daysPerWeek: Int, val preferences: String? = null, val priorities: List<String>? = null, val equipment: String? = null, val experience: String? = null, val name: String? = null)
    data class PlanResult(val plan: WorkoutPlan, val source: String, val rationale: String? = null, val fallbackReason: String? = null)
    fun fromGenerated(g: Ai.GeneratedPlan, req: PlanRequest): WorkoutPlan
    suspend fun requestPlan(api: Api, req: PlanRequest, localMode: Boolean = false): PlanResult
}
```

### Physique.kt
```kotlin
object Physique {
    fun localRoadmap(goal: String, priorities: String, bodyGoal: Goal?, trainingDays: Int): PhysiqueAnalysis
    fun coerceFocus(v: String?, fallback: String): String
    fun reconcile(aiOut: PhysiqueAnalysis, local: PhysiqueAnalysis): PhysiqueAnalysis
}
```

### Catalog.kt
```kotlin
object Catalog {
    data class CatalogFood(id, name, brand, unit, base, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, custom, category, serving_g, serving_label, state, cuisine, src: String)
    val REGIONS: List<String>
    fun catalogLoaded(): Boolean
    suspend fun loadCatalog(context: Context): List<CatalogFood>
    fun searchFoods(foods: List<CatalogFood>, query: String, limit: Int = 60): List<CatalogFood>
    fun byRegion(foods: List<CatalogFood>, region: String): List<CatalogFood>
    fun servingGrams(f: CatalogFood): Double?
    data class Grounded(name, qty, unit, grams, servingLabel, calories, proteinG, carbsG, fatG, confidence, matched: Pair<String,String>?)
    fun groundItem(catalog: List<CatalogFood>, item: Grounded): Grounded
    fun toFoodRow(f: CatalogFood): Food
}
```

### Exercises.kt
```kotlin
object Exercises {
    data class LibExercise(id, name, muscle, secondary, body_part, equipment, instructions, kind, per_side, custom, favorite, rest_sec, bar_kg, steps, steps_hi) { fun toExercise(): Exercise }
    data class Filter(val muscle: String? = null, val equipment: String? = null)
    fun exerciseLibrarySync(): List<LibExercise>?
    suspend fun loadExercises(context: Context): List<LibExercise>
    fun searchExercises(list: List<LibExercise>, q: String, filter: Filter = Filter(), favorites: Set<String> = emptySet()): List<LibExercise>
    fun matchExercise(list: List<LibExercise>, name: String): LibExercise?
}
```

### Importers.kt
```kotlin
object Importers {
    data class ImportResult(val sessions: List<WorkoutSession>, val format: String)
    fun parseCSV(text: String): List<List<String>>
    fun importWorkouts(text: String): ImportResult?
}
```

### Ai.kt
```kotlin
object Ai {
    data class FoodItem(name, qty, unit, servingLabel, grams, calories, proteinG, carbsG, fatG, fiberG, confidence)
    data class RejectedItem(name, reason)
    data class FoodList(items: List<FoodItem>, rejected: List<RejectedItem>?)
    data class TargetAdvice(summary, adjustments: TargetAdviceAdjustments?)
    data class TargetAdviceAdjustments(calories, proteinG, carbsG, fatG)
    data class InsightItem(kind, text)
    data class CoachReply(reply, onTopic)
    data class GeneratedExercise(name, sets, reps, restSec, tempo, note)
    data class GeneratedDay(name, focus, exercises: List<GeneratedExercise>)
    data class GeneratedPlan(name, rationale, days: List<GeneratedDay>)
    data class PhysiquePhoto(angle, mimeType, data)
    data class GeneratePlanInput(daysPerWeek, focus, preferences, priorities, equipment, experience)
    suspend fun parseFoodText(api: Api, text: String): FoodList
    suspend fun analyzeFoodPhoto(api: Api, imageBase64: String, mimeType: String, hint: String? = null): FoodList
    suspend fun coachChat(api: Api, messages: List<Map<String, String>>): CoachReply
    suspend fun targetAdvice(api: Api, input: JsonElement): TargetAdvice
    suspend fun generatePlan(api: Api, input: GeneratePlanInput): GeneratedPlan
    suspend fun physiqueAnalysis(api: Api, photos: List<PhysiquePhoto>, reference: PhysiquePhoto?, goal: String, priorities: String, context: JsonElement?, previous: JsonElement?): PhysiqueAnalysis
    suspend fun insights(api: Api, input: JsonElement): List<InsightItem>
    suspend fun keys(api: Api): Api.KeyStatus
}
```

### Photos.kt
```kotlin
object Photos {
    suspend fun put(context: Context, key: String, jpegBytes: ByteArray)
    suspend fun putDataUrl(context: Context, key: String, dataUrl: String)
    suspend fun get(context: Context, key: String): ByteArray?
    suspend fun getDataUrl(context: Context, key: String): String?
    suspend fun del(context: Context, key: String)
    suspend fun keys(context: Context): List<String>
    suspend fun clear(context: Context)
    suspend fun downscale(input: ByteArray, maxPx: Int = 720, quality: Int = 72): ByteArray
    fun splitDataUrl(dataUrl: String): Pair<String, String>
}
```
