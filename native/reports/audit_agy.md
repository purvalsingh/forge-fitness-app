# Comprehensive Technical & UX Audit: FORGE Android Native

**Auditor:** Antigravity (Google DeepMind Agentic Assistant)  
**Date:** November 16, 2026  
**Scope:** Strict Read-Only Audit of Android Native App (`~/forge/native`) vs. React Reference (`~/forge/src`)  
**Backend Reference:** Supabase PostgREST (`https://forgefit-india.vercel.app/sb`) + Vercel Serverless AI (`/api/ai`)  
**Build & Test Verification:** Clean Gradle build, **75/75 unit tests passing**, 0 compile errors (`:app:testDebugUnitTest :app:compileDebugKotlin`)

---

## Executive Summary

FORGE is a native Android fitness and Indian-nutrition app engineered with Kotlin and Jetpack Compose. Its offline-first math (`logic/Calc.kt`, `logic/Training.kt`) is clean, highly covered by automated tests, and architected to mirror the React web reference (`src/lib/calc.ts`, `src/lib/training.ts`).

However, this deep-dive audit identified critical defects across state synchronization, sensor persistence, navigation, theme accessibility, and feature parity:
1. **Broken Core Exercise Tracking:** A UUID mismatch in `SessionExercise` prevents exercise completion checkmarks from ever appearing completed on the Train screen.
2. **Navigation Traps:** Past workouts from imported Strong/Hevy CSVs or superseded plans cannot be opened or viewed from the History screen, locking the user behind an error screen in direct violation of `CLAUDE.md` Rule 8.
3. **Step Counter Data Loss:** Same-day hardware reboots trigger step dropping up to the previous baseline, multi-day app absences dump several days of steps onto a single date, and background step counting is entirely nonexistent because the sensor unregisters on `onPause()`.
4. **Concurrency Vulnerabilities:** In demo/local mode, file writes lack synchronization locks, risking data loss on rapid taps; failed non-transient remote writes trigger nuclear store reloads that wipe all uncommitted optimistic state across every table.
5. **AI Safety Breach:** AI insight generation writes directly to the Supabase database without user acceptance, violating `CLAUDE.md` Rule 3.
6. **Severe WCAG AA Contrast Failures:** Multiple theme palettes ("Monsoon", "Citrus") and key components (`FillCircle`, `Notice`) have contrast ratios as low as 1.4:1 to 2.6:1, rendering text illegible under normal lighting.
7. **Indian Fitness Parity Gaps:** Crucial workflows for Indian lifters—such as festival fasting modes (Navratri/Roza), vegetarian PDCAAS amino acid pairing, traditional volumetric measures (katoris, rotis), hidden tadka/oil accounting, and Health Connect wearable sync—are missing.

---

## 1. BUGS (Ranked Most Severe First)

### Bug 1.1: Exercise Done Checkbox Never Turns Green on Train Screen (UUID Mismatch)
* **Severity:** Critical (Core Workout Tracking Broken)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Session.kt:206`
  * `native/app/src/main/java/app/forge/fitness/screens/Workout.kt:133-134`
  * Reference: `src/screens/Session.tsx:85`

#### Verbatim Code Evidence
In `Session.kt:205-208`:
```kotlin
                SessionExercise(
                    workout_exercise_id = uid(),
                    exercise_id = ex.exercise_id,
                    name = ex.name ?: nameOf(ex.exercise_id),
```
In `Workout.kt:133-135`:
```kotlin
            day.exercises.forEachIndexed { i, ex ->
                val se = session?.exercises?.firstOrNull { it.workout_exercise_id == ex.id }
                val isDone = se?.sets?.isNotEmpty() == true && se.sets.all { it.done }
```
In React web reference `Session.tsx:85`:
```typescript
      return {
        workout_exercise_id: ex.id, exercise_id: ex.exercise_id, name: ex.name ?? nameOf(ex.exercise_id),
```

#### Root Cause Analysis
In `Session.kt`, when instantiating a `SessionExercise` from the plan's `WorkoutExercise` (`ex`), it assigns a newly generated random UUID `workout_exercise_id = uid()`. In `Workout.kt`, the Train screen looks up the corresponding session exercise using `it.workout_exercise_id == ex.id` (where `ex.id` is the stable plan exercise ID). Because `workout_exercise_id` is a random UUID, it never equals `ex.id`.

#### User Impact
`se` is always `null`, and `isDone` evaluates to `false` for every single exercise. Even when the user completes every warmup and working set of a workout, the checkboxes on the Train screen *never* turn green. The user receives no visual confirmation that an exercise was finished.

#### Recommended Fix
In `Session.kt:206`, change:
```kotlin
workout_exercise_id = ex.id,
```

---

### Bug 1.2: Imported Workouts & Past Plan Sessions Are Navigation Dead Ends
* **Severity:** Critical (Navigation Trap / Historical Data Inaccessible)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Session.kt:80, 162-167`
  * `native/app/src/main/java/app/forge/fitness/screens/History.kt:198-201`
  * `native/app/src/main/java/app/forge/fitness/logic/Importers.kt:101`

#### Verbatim Code Evidence
In `History.kt:198-201`:
```kotlin
                Card(onClick = {
                    s.setDate(sess.date)
                    nav.navigate("workout/session/${sess.day_id}")
                }) {
```
In `Importers.kt:101`:
```kotlin
        val sess = WorkoutSession(
            id = uid(), date = date, plan_id = "import", day_id = "import",
```
In `Session.kt:79-80, 162-167`:
```kotlin
    val plan = state.plans.firstOrNull { it.active == true } ?: state.plans.firstOrNull()
    val day = if (freestyle) null else plan?.days?.firstOrNull { it.id == dayId }
...
    if (!freestyle && (plan == null || day == null)) {
        Screen(title = "Workout", back = { nav.popBackStack() }) {
            Notice("That workout day no longer exists.", Tone.Error)
        }
        return
    }
```

#### Root Cause Analysis
When an imported session (from Strong or Hevy) or a historical session from an older/edited plan is tapped in `History.kt`, the app navigates to `workout/session/${sess.day_id}`. In `Session.kt`, line 162 checks `if (!freestyle && (plan == null || day == null))` before checking if `existing` is already in state!
For imported workouts, `day_id == "import"`. No active plan has a day with `id == "import"`. For past plans that were updated, `sess.day_id` no longer exists in `plan.days`. Thus `day` is `null`, and `Session.kt` halts and shows "That workout day no longer exists."

This directly violates `CLAUDE.md` Rule 8: *"Workout history is immutable relative to plans: a workout session copies plan data into itself on creation; deleting or editing a plan MUST NOT orphan or mutate past sessions."*

#### User Impact
Users who import years of training logs from Strong or Hevy CSVs, or who switch workout plans, can never inspect, review, or edit their historical workouts.

#### Recommended Fix
In `Session.kt:162`, bypass the plan/day check if `existing != null`:
```kotlin
    if (!freestyle && existing == null && (plan == null || day == null)) {
        Screen(title = "Workout", back = { nav.popBackStack() }) {
            Notice("That workout day no longer exists.", Tone.Error)
        }
        return
    }
```

---

### Bug 1.3: Hardware Step Counter Erases Post-Reboot Steps up to Old Baseline
* **Severity:** High (Data Loss in Sensor Tracking)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/data/StepCounter.kt:37`
  * `native/app/src/main/java/app/forge/fitness/data/Store.kt:225-227`

#### Verbatim Code Evidence
In `StepCounter.kt:34-40`:
```kotlin
        when {
            base < 0 -> { base = total; carried = 0 }                     // first ever reading: start counting now
            day != today -> { base = if (last in 0..total) last else 0; carried = 0 }  // new day
            total < last -> { carried += (last - base).coerceAtLeast(0); base = 0 }   // rebooted: keep what was counted
        }
        prefs.edit().putLong("base", base).putLong("carried", carried).putLong("last", total).putString("day", today).apply()
        onSteps(today, (carried + total - base).toInt().coerceAtLeast(0))
```
In `Store.kt:225-227`:
```kotlin
        val existing = st.steps.find { it.date == date }
        if (existing != null && existing.steps >= steps) return
        if (existing != null && steps - existing.steps < 50 && steps - lastSavedSteps < 50) return
```

#### Root Cause Analysis
The Android hardware step counter (`Sensor.TYPE_STEP_COUNTER`) resets to 0 when the device is rebooted. In `StepCounter.kt:37`, when a reboot occurs on the same day (`total < last`), `carried` is increased by `last - base`, and `base` is set to 0.
When the user walks the first steps post-reboot (say, 40 steps), `carried + total - base` evaluates to `carried + 40`.
However, in `Store.kt:226`, `existing.steps` contains the pre-reboot steps saved in the database (e.g., 4,500). If `last - base` was 4,450 (due to 50-step chunking lag), `carried + 40 = 4,490`. Because `existing.steps (4,500) >= steps (4,490)`, the update is dropped! Furthermore, because `base = 0` instead of the reboot initial total, any non-zero initial hardware offset after boot creates a permanent calculation skew.

#### User Impact
Following any device restart during the day, step counting freezes until the user walks enough new steps to surpass the old pre-reboot count. All steps walked in the interim are permanently lost.

#### Recommended Fix
Maintain a persistent reboot offset:
```kotlin
total < last -> { 
    carried += (last - base).coerceAtLeast(0)
    base = total 
}
```

---

### Bug 1.4: Step Counter Bundles Multi-Day Absences Into Today
* **Severity:** High (Corrupted Historical Analytics)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/data/StepCounter.kt:35-36`

#### Verbatim Code Evidence
In `StepCounter.kt:35-38`:
```kotlin
        when {
            base < 0 -> { base = total; carried = 0 }                     // first ever reading: start counting now
            day != today -> { base = if (last in 0..total) last else 0; carried = 0 }  // new day
            total < last -> { carried += (last - base).coerceAtLeast(0); base = 0 }   // rebooted: keep what was counted
        }
```

#### Root Cause Analysis
Suppose a user walks on Friday (accumulating `last = 15,000`). Over Saturday and Sunday, they carry the phone (hardware sensor reaches 35,000), but do not launch FORGE.
When they open FORGE on Monday morning (`today = Monday`), `day != today` triggers.
Because `last (15,000)` is in `0..total (35,000)`, `base` is set to `15,000` and `carried = 0`.
Line 40 immediately runs: `onSteps(today, total - base)` = `35,000 - 15,000 = 20,000` steps.
All steps walked on Saturday, Sunday, and Monday are assigned to Monday. Saturday and Sunday have 0 steps.

#### User Impact
Step charts, adherence scores, and weekly activity summaries become invalid whenever the user does not open the app daily.

#### Recommended Fix
Check if `day == Calc.addDays(today, -1)`. If the date gap is greater than 1 day, reset `base = total` (steps from intermediate days cannot be reconstructed without historical sensor logs or Health Connect).

---

### Bug 1.5: Sensor Tracking Dies When App Is Backgrounded or Screen Locked
* **Severity:** High (Fundamental Feature Limitation)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/MainActivity.kt:49-50`

#### Verbatim Code Evidence
In `MainActivity.kt:49-50`:
```kotlin
    override fun onResume() { super.onResume(); store.onResume(); startSteps() }
    override fun onPause() { super.onPause(); steps.stop() }
```
In `StepCounter.kt:24-25`:
```kotlin
    fun start() { sensor?.let { sm.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL) } }
    fun stop() = sm.unregisterListener(this)
```

#### Root Cause Analysis
`SensorEventListener` is unregistered on `Activity.onPause()`. While `TYPE_STEP_COUNTER` continues incrementing hardware counts in silicon, the app receives zero updates while backgrounded. If Android kills the process or the device reboots before the user opens FORGE again, the baseline calculation in Bug 1.3/1.4 fails. There is no Foreground Service, WorkManager periodic sync, or Android Health Connect integration.

#### User Impact
Automatic step tracking is effectively non-functional for passive tracking unless the app is kept in foreground.

#### Recommended Fix
Implement a periodic `WorkManager` worker (or Android Health Connect sync) to record step deltas periodically in the background.

---

### Bug 1.6: Data Loss & Overwrite Race Condition in `Store.kt` Local Mode
* **Severity:** High (Data Loss in Offline/Demo Mode)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/data/Store.kt:109, 137, 169-178`

#### Verbatim Code Evidence
In `Store.kt:108-111`:
```kotlin
    private suspend fun <T : Row> putRemote(t: Table<T>, rows: List<T>) {
        if (localMode) { val m = readLocal(t).associateBy { it.id }.toMutableMap(); rows.forEach { m[it.id] = it }; writeLocal(t, m.values.toList()); return }
        rows.forEach { api.upsert(t.name, jsonWrite.encodeToJsonElement(t.ser, it).jsonObject) }
    }
```
In `Store.kt:137`:
```kotlin
    private fun <T : Row> cache(t: Table<T>) { if (!localMode) runCatching { writeLocal(t, t.get(_state.value)) } }
```
In `Store.kt:169-177`:
```kotlin
    fun <T : Row> save(t: Table<T>, row: T) {
        _state.update { s -> t.set(s, t.get(s).filter { it.id != row.id } + row) }
        cache(t)
        viewModelScope.launch {
            try { putRemote(t, listOf(row)) } catch (e: Exception) { ... }
        }
    }
```

#### Root Cause Analysis
1. In `Store.kt:137`, `cache(t)` explicitly skips disk writes when `localMode` is true (`if (!localMode)`).
2. Disk persistence in `localMode` is deferred to `putRemote(t, listOf(row))` inside `viewModelScope.launch`.
3. In `putRemote(t, rows)`, reading from disk (`readLocal`), mutating in memory (`m[it.id] = it`), and writing back to disk (`writeLocal`) is executed without any `Mutex` or thread synchronization.
4. If a user rapidly logs two food items, or rapidly checks two workout sets, two concurrent coroutines read the disk file before either writes. Coroutine B writes its file without row A, permanently dropping row A from disk.

#### User Impact
Users in Demo Mode ("Continue without account") or offline mode lose logged entries on fast sequential taps.

#### Recommended Fix
Guard `readLocal`/`writeLocal` with a `Mutex`, and ensure `cache(t)` writes to disk in `localMode`.

---

### Bug 1.7: Non-Transient PostgREST Failure Triggers Nuclear Reload Wiping Optimistic State
* **Severity:** High (State Reset / Cascading Write Discard)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/data/Store.kt:140-166, 173-176`

#### Verbatim Code Evidence
In `Store.kt:173-176`:
```kotlin
            try { putRemote(t, listOf(row)) } catch (e: Exception) {
                if (transient(e)) enqueue(Pending(t.name, row = jsonWrite.encodeToJsonElement(t.ser, row).jsonObject))
                else { _state.update { it.copy(error = e.message ?: "Save failed. Your entry was not stored.") }; reload() }
            }
```
In `Store.kt:140-142, 160`:
```kotlin
    fun reload() { reloadJob?.cancel(); reloadJob = viewModelScope.launch { doReload() } }
...
            var s = State(ready = true, signedIn = true, localMode = localMode)
            for (t in Tables.all) s = load(s, t)
            _state.value = s
```

#### Root Cause Analysis
When an API error occurs that is not classified as `transient` (for example, a 409 conflict, a 400 schema validation mismatch, or a 500 error from a Supabase hook), line 175 calls `reload()`.
`reload()` cancels all in-flight jobs and performs a full remote fetch across all 16 tables, resetting `_state.value = s`. Any pending optimistic updates in other tables (e.g. water logged, exercises completed, notes edited) that were in-flight are instantly wiped out of in-memory state.

#### User Impact
A single failed save in one table wipes the user's unsynced in-progress workout or food log across the entire app.

#### Recommended Fix
Revert only the specific failed row in `_state` instead of triggering a full `reload()`.

---

### Bug 1.8: AI Insights Written Directly to Database Without User Acceptance
* **Severity:** High (Safety & Architectural Rule Violation)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Settings.kt:450-454`

#### Verbatim Code Evidence
In `Settings.kt:450-454`:
```kotlin
                            val out = Ai.insights(s.api, payload)
                            out.forEach { i ->
                                s.save(Tables.insights, AIInsight(id = uid(), created_at = nowIso(), kind = i.kind, text = i.text))
                            }
                            msg = "Insights updated."
```

#### Root Cause Analysis
`CLAUDE.md` Rule 3 mandates: *"AI is an assistant, not an oracle: every AI flow must have a human in the loop, show diffs/previews, handle refusals, and never write to the database without the user accepting."*
In `Settings.kt:451-453`, tapping "Generate insights" immediately writes all returned AI insights into `Tables.insights` with no preview or accept/reject UI. Furthermore, because each item is saved with `id = uid()`, repeated taps flood the user's database with duplicate insights.

#### User Impact
Unreviewed AI content is permanently committed to the user's profile, and the insights table accumulates duplicate rows on every tap.

#### Recommended Fix
Present AI insights in a review sheet where the user can accept, dismiss, or edit each insight before calling `s.save()`.

---

### Bug 1.9: Fasting Timer & Progress Bar Frozen on Today Screen
* **Severity:** Medium (UI Liveness Defect)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Today.kt:687-693`

#### Verbatim Code Evidence
In `Today.kt:687-693`:
```kotlin
    val elapsedHours = remember(started) {
        if (started != null) {
            val startMillis = runCatching { Instant.parse(started).toEpochMilli() }.getOrDefault(0L)
            if (startMillis > 0) (System.currentTimeMillis() - startMillis) / 3600000.0 else 0.0
        } else 0.0
    }
    val p = if (started != null && hours > 0) (elapsedHours / hours).toFloat() else 0f
```

#### Root Cause Analysis
`elapsedHours` is calculated using `remember(started)`. Unlike `Session.kt:108-114` (which runs a `LaunchedEffect` loop updating `now = System.currentTimeMillis()` every 250ms) or React's `Today.tsx` (which updates via `setInterval`), `Today.kt` lacks any ticker. The fasting elapsed time and progress bar never advance while viewing the screen.

#### User Impact
The fasting timer appears stuck, forcing users to navigate away and return to see updated elapsed fasting hours.

#### Recommended Fix
Add a 60-second ticker loop in a `LaunchedEffect(started)` to update an observable `currentTime` state.

---

### Bug 1.10: StepSheet Form State Persists Stale Data Across Date Changes
* **Severity:** Medium (State Leak Across Screens)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Today.kt:814-815`

#### Verbatim Code Evidence
In `Today.kt:814-815`:
```kotlin
    val existing = remember(st.steps, date) { st.steps.find { it.date == date } }
    var text by remember { mutableStateOf(existing?.steps?.toString() ?: "") }
```

#### Root Cause Analysis
`var text` is remembered without any key (`remember { mutableStateOf(...) }`). If the user opens `StepSheet` on Monday (e.g. 8,000 steps), cancels, navigates to Tuesday (which has 2,000 steps), and opens `StepSheet`, `text` retains `"8000"`.

#### User Impact
Users inadvertently overwrite steps for previous dates with stale input text.

#### Recommended Fix
Key the remember call:
```kotlin
var text by remember(date, existing) { mutableStateOf(existing?.steps?.toString() ?: "") }
```

---

### Bug 1.11: AI Food Camera Hardcodes Lunch Meal Type With No Change Option
* **Severity:** Medium (Functional Parity Gap)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Camera.kt:52, 178`

#### Verbatim Code Evidence
In `Camera.kt:52`:
```kotlin
    val mealTypeId = remember(st.mealTypes) { st.mealTypes.getOrNull(1)?.id ?: st.mealTypes.firstOrNull()?.id ?: "" }
```
In `Camera.kt:178`:
```kotlin
            ReviewItems(
                items = items!!,
                rejected = rejected,
                date = date,
                mealTypeId = mealTypeId,
                source = "ai_photo",
```

#### Root Cause Analysis
`CameraScreen` hardcodes `st.mealTypes.getOrNull(1)?.id` (which is "Lunch" in seed data). Regardless of whether the user captures a meal at 8 AM (Breakfast), 5 PM (Snacks), or 9 PM (Dinner), it is permanently assigned to `mealTypes[1]`. There is no meal type picker anywhere on the camera capture or review screen.

#### User Impact
All camera-logged meals are dumped into Lunch, corrupting meal-level macronutrient distributions.

#### Recommended Fix
Provide a `Tabs` or dropdown selector in `CameraReviewScreen` allowing the user to select the target `mealTypeId` before confirming.

---

### Bug 1.12: Un-Batched CSV Import Floods Supabase with 100+ Concurrent Requests
* **Severity:** Medium (Network & Backend Instability)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/History.kt:108-110`

#### Verbatim Code Evidence
In `History.kt:108-110`:
```kotlin
        for (sess in r.sessions) {
            s.save(Tables.sessions, sess)
        }
```

#### Root Cause Analysis
When importing a Strong or Hevy CSV file containing dozens or hundreds of historical workouts, `s.save(Tables.sessions, sess)` is called in a synchronous loop. Each call dispatches an independent `viewModelScope.launch { putRemote(...) }` coroutine, firing 100+ parallel PostgREST HTTP upserts. If any single request encounters rate limiting or fails, `Store.kt:175` initiates a full `reload()`, cancelling the rest of the batch.

#### User Impact
Importing workout history from Hevy or Strong frequently fails or causes PostgREST connection throttling.

#### Recommended Fix
Add a batch `s.saveAll(Tables.sessions, r.sessions)` method that sends rows in chunks or executes a single bulk upsert.

---

### Bug 1.13: Deleting a Meal Type Orphan-Hides Food Logs While Retaining Ghost Calories
* **Severity:** Medium (UI Data Desynchronization)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Settings.kt:393-395`
  * `native/app/src/main/java/app/forge/fitness/screens/Today.kt:418-421`
  * `native/app/src/main/java/app/forge/fitness/screens/Diet.kt:143-146`

#### Verbatim Code Evidence
In `Settings.kt:393-395`:
```kotlin
                    Box(Modifier.weight(1f)) {
                        FButton("Remove last", Modifier.fillMaxWidth(), Variant.Danger) {
                            s.del(Tables.mealTypes, st.mealTypes.last().id)
                        }
                    }
```
In `Today.kt:418-421`:
```kotlin
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                st.mealTypes.forEach { m ->
                    val mt = byMeal[m.id]
                    val items = logs.filter { it.meal_type_id == m.id }
```

#### Root Cause Analysis
When a user deletes a meal type in Settings, `s.del` deletes the `MealType` record. However, existing `FoodLog` entries referencing that `meal_type_id` remain in the database.
Because `Today.kt` and `Diet.kt` iterate strictly over `st.mealTypes.forEach`, orphaned food logs are never rendered. Yet `Calc.sumTotals(logs)` computes daily totals over all logs for that date.

#### User Impact
The daily macro header displays e.g. 2,200 kcal, but the visible meal cards only sum to 1,600 kcal. The user cannot see, edit, or delete the missing 600 kcal of orphaned foods.

#### Recommended Fix
Reassign orphaned food logs to the preceding meal type, or render an "Other / Unassigned Meals" section when orphaned food logs are detected.

---

### Bug 1.14: Sparkline Charts Plunge to Zero on Unlogged Days
* **Severity:** Medium (Misleading Data Visualization)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Progress.kt:341, 391, 401`

#### Verbatim Code Evidence
In `Progress.kt:340-343`:
```kotlin
                values.forEachIndexed { i, v ->
                    val curV = v ?: 0.0
                    val x = (i.toFloat() / (n - 1)) * w
                    val y = h - ((curV - minVal) / span).toFloat() * h
```
In `Progress.kt:390-394`:
```kotlin
                primary.forEachIndexed { i, v ->
                    val cur = v ?: 0.0
                    val x = (i.toFloat() / (n - 1)) * w
                    val y = h - (cur / (pMax * 1.15)).toFloat() * h
```

#### Root Cause Analysis
When rendering calorie, protein, or step trends in `Progress.kt`, unlogged days are coerced to `0.0`. Rather than breaking the path or linearly interpolating between logged days, the canvas draws sharp plunges straight to the zero baseline.

#### User Impact
A user who misses logging one day sees a severe vertical spike down to zero, obscuring weekly moving averages and trends.

#### Recommended Fix
Break line segments across `null` values or interpolate between adjacent known data points.

---

### Bug 1.15: Weight Trend Chart Has Non-Linear Distorted Time Axis
* **Severity:** Medium (Visualization Inaccuracy)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Progress.kt:283, 292`

#### Verbatim Code Evidence
In `Progress.kt:282-284`:
```kotlin
                    points.forEachIndexed { i, pt ->
                        val x = (i.toFloat() / (n - 1)) * w
                        val y = h - ((pt.trend - minVal) / span).toFloat() * h
```

#### Root Cause Analysis
The X-coordinate is calculated purely from array index `i / (n - 1)` rather than date offset. If a user weighs themselves on Day 1, Day 2, and Day 45, the gap between Day 1 and 2 occupies 50% of the screen width, and the gap between Day 2 and 45 occupies the remaining 50%.

#### User Impact
Weight trends are visually distorted and give a false impression of rate of weight change over time.

#### Recommended Fix
Scale `x` proportional to `ChronoUnit.DAYS.between(startDate, pointDate)`.

---

### Bug 1.16: Today Screen Retains Stale Date Past Midnight / 4 AM
* **Severity:** Medium (State Stagnation)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Today.kt:60-61`

#### Verbatim Code Evidence
In `Today.kt:59-61`:
```kotlin
    val date by s.date.collectAsStateWithLifecycle()
    val today = remember { Calc.today() }
    val isToday = date == today
```

#### Root Cause Analysis
`today` is remembered once without a key (`remember { Calc.today() }`). Even though `Store.onResume()` correctly advances `s.date` across the 4 AM boundary, `today` in `TodayScreen` remains anchored to the date when the composable was first mounted. Consequently, `isToday` becomes false, locking the day view into the past and disabling navigation forward to the true current day.

#### User Impact
Users keeping the app open overnight find the Today screen stuck on yesterday.

#### Recommended Fix
Derive `today` dynamically or observe date changes via a lifecycle event.

---

### Bug 1.17: Coach AI Chat History Completely Lost on Screen Rotation
* **Severity:** Medium (Ephemeral State Loss)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Coach.kt:49`

#### Verbatim Code Evidence
In `Coach.kt:49`:
```kotlin
    var msgs by remember { mutableStateOf(listOf<ChatMsg>()) }
```

#### Root Cause Analysis
`msgs` is wrapped in a standard `remember` call instead of `rememberSaveable` or a ViewModel state property. Rotating the device, changing system theme, or entering split-screen recreates the Activity and purges the entire conversation history.

#### User Impact
In-depth coaching advice from Gemini disappears immediately if the user accidentally tilts their phone.

#### Recommended Fix
Persist chat state in `Store` or use `rememberSaveable` with a custom list saver.

---

### Bug 1.18: Sign-Out Deletes Database Cache But Leaves Private Physique Photos
* **Severity:** Low / Privacy Defect
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/data/Store.kt:209`
  * `native/app/src/main/java/app/forge/fitness/logic/Photos.kt:28`
  * `native/app/src/main/java/app/forge/fitness/data/StepCounter.kt:21`

#### Verbatim Code Evidence
In `Store.kt:209`:
```kotlin
    fun signOut() { api.signOut(); prefs.edit().putBoolean("local", false).apply(); dir.listFiles()?.forEach { it.delete() }; reload() }
```
In `Photos.kt:28`:
```kotlin
    fun dir(context: Context): File =
        File(context.filesDir, "photos").also { it.mkdirs() }
```

#### Root Cause Analysis
`signOut()` only deletes files inside `dir` (`filesDir/db`). Private user physique photos stored in `filesDir/photos` and step counter state stored in `forge_steps.xml` are not deleted.

#### User Impact
If another user signs in on the same device, private physique progress photos from the previous user remain accessible in internal app storage.

#### Recommended Fix
Clear `context.filesDir/photos` and `prefs("forge_steps")` during `signOut()`.

---

### Bug 1.19: Raw Kotlinx Serialization Exceptions Leaked Directly to Users
* **Severity:** Low (Unhandled Schema Errors)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/logic/Ai.kt:352, 356, 360`
  * `native/app/src/main/java/app/forge/fitness/screens/Coach.kt:75`
  * `native/app/src/main/java/app/forge/fitness/screens/Camera.kt:147`

#### Verbatim Code Evidence
In `Ai.kt:352`:
```kotlin
        val tr = o["training"]?.jsonObject ?: bad()
```
In `Coach.kt:75`:
```kotlin
        } catch (e: Exception) {
            err = e.message ?: "Coach couldn't respond right now."
```

#### Root Cause Analysis
In `Ai.kt`, accessing `.jsonObject` or `.jsonArray` on a mismatched JSON primitive throws an unchecked `java.lang.IllegalArgumentException` (e.g. *"Element class kotlinx.serialization.json.JsonPrimitive is not a JsonObject"*). Callers catch `Exception` and render `e.message` directly in `Notice(it, Tone.Error)`.

#### User Impact
Users are presented with cryptic Kotlin compiler exceptions instead of clean error guidance.

#### Recommended Fix
Catch `IllegalArgumentException` in `Ai.kt` and throw a structured `ApiError("The AI returned an invalid response. Please try again.")`.

---

## 2. UI/UX DEFECTS (Ranked Most Severe First)

### Defect 2.1: Severe WCAG AA Contrast Failures on Glass & Monsoon Theme
* **Severity:** Severe (Accessibility & Legibility Failure)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/ui/Theme.kt:26-31, 61-75`
  * `native/app/src/main/java/app/forge/fitness/ui/Components.kt:173, 185`

#### Mathematical Luminance & Contrast Evaluations
1. **Dark Mode `FillCircle` Text on Completed Ring:**
   * Text Color: `F.text = Color(0xFFEAF4F8)` (near white)
   * Completed Circle Color: `F.lime = Color(0xFF5FD3A6)` (bright mint green, line 75)
   * **Contrast Ratio:** **1.4:1** (WCAG AA requires 4.5:1 for 11sp text). Text is completely illegible when completed.
2. **`Notice(Tone.Warn)` Banner:**
   * Text Color: `F.carbs = Color(0xFFE3A12E)` (amber gold)
   * Background: `c.copy(alpha = 0.1f)` over light glass (`#FFFFFF` with 45% alpha over `#B9E3F2`)
   * **Contrast Ratio:** **2.1:1** (WCAG AA requires 4.5:1 for 13sp normal text). Warning messages cannot be read in daylight.
3. **Primary Button in "Citrus" Palette:**
   * Button Background: `a1 = Color(0xFFE8890C)` / `Color(0xFFB45F00)`
   * Button Text: `F.accentInk = Color.White`
   * **Contrast Ratio:** **2.6:1 - 3.1:1** (Fails WCAG AA minimum 4.5:1 for 15sp text).
4. **Mute Text (`F.mute`) on Light Cards:**
   * `F.mute = Color(0xFF4F6573)` / `Color(0xFF6B8290)` on `0x73FFFFFF`
   * **Contrast Ratio:** **3.3:1 - 3.6:1** for 11sp eyebrows and 12sp body hints (failing 4.5:1).

#### Recommended Fix
* For `FillCircle`, invert text color to dark ink (`Color(0xFF0F2A3A)`) when background is filled with `F.lime`.
* For `Notice(Tone.Warn)`, darken warning text to `#8A5A00`.
* For "Citrus", use dark ink (`accentInk = Color(0xFF1F1200)`) on primary buttons.

---

### Defect 2.2: Touch Targets Severely Under 44dp
* **Severity:** High (Touch Usability Defect)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Diet.kt:192` (Delete button: `24.dp`)
  * `native/app/src/main/java/app/forge/fitness/screens/Recipes.kt:98` (Favorite button: `28.dp`)
  * `native/app/src/main/java/app/forge/fitness/screens/Settings.kt:230` (Rest chips: `38.dp`)
  * `native/app/src/main/java/app/forge/fitness/ui/Components.kt:122` (Tabs selector: `40.dp`)
  * `native/app/src/main/java/app/forge/fitness/screens/Adherence.kt:124-137` (Month calendar cell: ~40x42dp)
  * `native/app/src/main/java/app/forge/fitness/screens/Today.kt:147` (Date picker trigger: ~30x16dp)

#### Verbatim Code Evidence
In `Diet.kt:190-195`:
```kotlin
                                        IconButton(
                                            onClick = { scope.launch { s.del(Tables.foodLogs, l.id) } },
                                            modifier = Modifier.size(24.dp)
                                        ) {
                                            Icon(Icons.Filled.Delete, contentDescription = "Delete ${l.name}", tint = F.mute, modifier = Modifier.size(16.dp))
                                        }
```
In `Recipes.kt:98`:
```kotlin
                        IconButton(
                            onClick = { ... },
                            modifier = Modifier.size(28.dp)
                        )
```

#### User Impact
Material Design guidelines require an absolute minimum touch target size of 48x48dp (WCAG 2.5.5 requires 44x44dp). A 24dp delete button causes frequent missed taps or accidental clicks on neighboring food row elements.

#### Recommended Fix
Enforce minimum 44dp or 48dp bounding boxes using `Modifier.sizeIn(minWidth = 44.dp, minHeight = 44.dp)`.

---

### Defect 2.3: Central Floating "+" Button Missing 8-Action QuickAdd Grid
* **Severity:** High (Core Workflow Parity Gap)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/MainActivity.kt:140-143`
  * Reference: `src/App.tsx:61-97`

#### Verbatim Code Evidence
In `MainActivity.kt:140-143`:
```kotlin
            if (i == 2) Box(Modifier.size(52.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(18.dp)).background(F.accentBrush)
                .clickable { go("diet") }, contentAlignment = Alignment.Center) {
                Icon(Icons.Filled.Add, "Log food", tint = androidx.compose.ui.graphics.Color.White)
            }
```
In React web reference `App.tsx:71-80`:
```typescript
  const items: [string, string, string, () => void][] = [
    ['search', 'Log food', 'Search 16,000 foods', () => { onClose(); setFood('search') }],
    ['camera', 'Scan meal', 'AI food camera', () => go('/diet/camera')],
    ['sparkle', 'Describe meal', '“2 roti, dal, vada pav”', () => { onClose(); setFood('describe') }],
    ['barcode', 'Barcode', 'Packaged food', () => { onClose(); setFood('barcode') }],
    ['water', 'Water', '+250 ml and more', () => { onClose(); setWater(true) }],
    ['workout', 'Start workout', 'Plan or freestyle', () => go('/workout')],
    ['weight', 'Weigh-in', 'Log bodyweight', () => go('/progress?log=weight')],
    ['bolt', 'Ask coach', 'Training & nutrition AI', () => go('/coach')],
  ]
```

#### Root Cause Analysis
In the React web app, the primary floating "+" button in the navigation bar opens an omnipresent 8-action `QuickAdd` sheet enabling 1-tap logging into the active date. In Android, it is hardcoded to navigate directly to `"diet"`, eliminating quick access to water logging, weigh-ins, AI meal description, camera, barcode scanning, and workouts.

#### Recommended Fix
Port `QuickAdd` bottom sheet to Android Compose and trigger it from `MainActivity.kt`.

---

### Defect 2.4: Flawed Hit-Testing in BodyMap Canvas Steals Taps from Neighboring Muscles
* **Severity:** High (Canvas Gesture Defect)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/BodyMap.kt:238`

#### Verbatim Code Evidence
In `BodyMap.kt:227-241`:
```kotlin
                            for (aPath in part.androidPaths) {
                                aPath.computeBounds(hitBounds, true)
                                hitRegion.setPath(
                                    aPath,
                                    Region(
                                        hitBounds.left.toInt() - 1,
                                        hitBounds.top.toInt() - 1,
                                        hitBounds.right.toInt() + 1,
                                        hitBounds.bottom.toInt() + 1
                                    )
                                )
                                if (hitRegion.contains(mx.toInt(), my.toInt()) || hitBounds.contains(mx, my)) {
                                    onPick(part.slug)
                                    return@detectTapGestures
                                }
                            }
```

#### Root Cause Analysis
Notice the expression:
```kotlin
if (hitRegion.contains(mx.toInt(), my.toInt()) || hitBounds.contains(mx, my))
```
`hitBounds` is the rectangular bounding box enclosing the muscle path. Because `|| hitBounds.contains(...)` is included, any tap inside the rectangular bounding box registers a hit—even if the tap is outside the actual muscle contour! Bounding boxes for lats, chest, obliques, and shoulders overlap heavily. Tapping the upper chest can inadvertently select the lats or deltoids depending on iteration order.

#### Recommended Fix
Remove `|| hitBounds.contains(mx, my)` and rely exclusively on the precise path region test `hitRegion.contains(mx.toInt(), my.toInt())`.

---

### Defect 2.5: Calendar Grid Ignores User's Week-Start (Mon/Sun) Preference
* **Severity:** Medium (Setting Ineffective in UI)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/logic/Calc.kt:140`
  * `native/app/src/main/java/app/forge/fitness/screens/Adherence.kt:96`
  * `native/app/src/main/java/app/forge/fitness/screens/Settings.kt:290-292`

#### Verbatim Code Evidence
In `Settings.kt:290-292`:
```kotlin
Chip("Mon", (st.settings.week_start ?: 1) == 1, Modifier.weight(1f)) { s.save(Tables.settings, st.settings.copy(week_start = 1)) }
Chip("Sun", (st.settings.week_start ?: 1) == 0, Modifier.weight(1f)) { s.save(Tables.settings, st.settings.copy(week_start = 0)) }
```
In `Adherence.kt:96`:
```kotlin
listOf("S", "M", "T", "W", "T", "F", "S").forEach { dayLabel ->
```
In `Calc.kt:140`:
```kotlin
val cells = MutableList<String?>(first.dayOfWeek.value % 7) { null }
```

#### Root Cause Analysis
The user can toggle `week_start` between Monday (1) and Sunday (0) in Settings (Monday is the default). However, `Calc.monthGrid` hardcodes Sunday padding (`first.dayOfWeek.value % 7`), and `Adherence.kt` hardcodes the column headers starting with `"S"`. The calendar display completely ignores the user's setting.

#### Recommended Fix
Pass `st.settings.week_start ?: 1` to `Calc.monthGrid` and dynamically order the weekday header labels.

---

### Defect 2.6: Barbell Plate Calculator Hardcodes "kg" For Imperial ("lb") Users
* **Severity:** Medium (Unit Display Defect)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Session.kt:552`

#### Verbatim Code Evidence
In `Session.kt:552`:
```kotlin
Text("Bar ${bar.roundToInt()} kg · ${((topW - bar) / 2.0).roundToInt()} kg / side", color = F.dim, fontFamily = Mono, fontSize = 11.sp)
```

#### Root Cause Analysis
While `Session.kt` reads `val lb = state.settings.units == "lb"`, the plate loading bar display hardcodes `"kg"` and `"kg / side"`.

#### Recommended Fix
Conditionally display `"lb"` or `"kg"` according to `state.settings.units`.

---

### Defect 2.7: Today Screen Displays Raw Substring "11-16" Instead of Formatted Date
* **Severity:** Medium (Unpolished Copy)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Today.kt:150`

#### Verbatim Code Evidence
In `Today.kt:149-155`:
```kotlin
                        Text(
                            text = if (isToday) "Today" else date.substring(5),
                            fontFamily = Mono,
                            fontSize = 12.sp,
                            color = F.text
                        )
```

#### Root Cause Analysis
When viewing past or future dates, the date label executes `date.substring(5)`, rendering raw strings such as `"11-16"` instead of user-friendly text like `"Mon, 16 Nov"`.

#### Recommended Fix
Format with `DateTimeFormatter.ofPattern("EEE, d MMM")`.

---

### Defect 2.8: Workout Focus Renders Snake-Case Technical Strings
* **Severity:** Low (Unfiltered Enum String)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Workout.kt:100`

#### Verbatim Code Evidence
In `Workout.kt:99-101`:
```kotlin
            if (day.focus.isNotBlank()) {
                Text(day.focus, color = F.paperDim, fontSize = 12.sp)
            }
```

#### Root Cause Analysis
If a workout plan generates or imports focus tags such as `hypertrophy_push` or `fat_loss`, the string is rendered without title-casing or replacing underscores.

#### Recommended Fix
Replace underscores with spaces and capitalize words before display.

---

### Defect 2.9: Auth Screen Keyboard Options Lack Email Type and Password Toggle
* **Severity:** Low (Form Input Defect)
* **File & Lines:**  
  * `native/app/src/main/java/app/forge/fitness/screens/Auth.kt:27-28`
  * `native/app/src/main/java/app/forge/fitness/ui/Components.kt:141`

#### Verbatim Code Evidence
In `Components.kt:141`:
```kotlin
keyboardOptions = KeyboardOptions(keyboardType = when { number -> KeyboardType.Decimal; password -> KeyboardType.Password; else -> KeyboardType.Text })
```

#### Root Cause Analysis
`Components.Input` does not support `KeyboardType.Email`. On Android soft keyboards, typing an email in `Auth.kt` does not display the `@` key on the main keyboard layer, auto-capitalizes initial characters, and provides no password visibility reveal toggle.

#### Recommended Fix
Add `email: Boolean = false` parameter to `Input` mapping to `KeyboardType.Email` and add an eye icon trailing button for password fields.

---

## 3. FEATURES GENUINELY WORTH ADDING FOR INDIAN LIFTERS (Ranked Most Valuable First)

### Feature 3.1: Indian Festival & Fasting (Vrat / Roza / Ekadashi) Nutrition Modes
* **Value:** Critical differentiator for Indian demographic  
* **Size:** **M** (Medium — ~300 LOC logic + Compose settings)  
* **Why It Matters:**  
  Millions of Indian fitness enthusiasts practice fasting cycles throughout the year:
  * **Navratri / Shravan / Ekadashi (Vrat):** Grains (wheat, rice) and alliums (onion, garlic) are strictly avoided. Meals shift to high-carb fasting staples like sabudana, kuttu (buckwheat), singhara atta, potatoes, and full-fat dairy, causing dramatic protein deficits.
  * **Ramadan (Roza):** Time-restricted feeding with two anchor meals: Suhoor (pre-dawn) and Iftar (post-sunset). Lifters must hit their daily protein target in a compressed 8-hour window without dehydration.
  * **Standard trackers fail:** MyFitnessPal or HealthifyMe flag adherence failure or recommend chicken/eggs during Navratri, driving users to abandon logging.
* **Architecture Blueprint:**
  1. Add `fasting_mode: "none" | "vrat" | "roza" | "jain"` to `Settings` entity in `Models.kt`.
  2. In `vrat` mode:
     * Shift macro ratios to realistic vegetarian preservation (e.g. 1.2–1.5 g/kg instead of 2.0 g/kg).
     * Filter catalog recommendations to compliant Vrat foods (paneer, curd, whey, peanuts, makhana, kuttu).
     * Suppress streak breakage penalties on fasting days in `Calc.adherenceFor`.
  3. In `roza` mode:
     * Update `FastingCard` on Today screen with Suhoor / Iftar prayer-time countdowns.
     * Configure meal reminders to prompt protein hydration before sunrise.

---

### Feature 3.2: Lacto-Vegetarian Protein Completeness & PDCAAS Quality Optimizer
* **Value:** Essential for Indian lifters (~40% lacto-vegetarian)  
* **Size:** **S** (Small — ~150 LOC pure logic)  
* **Why It Matters:**  
  Most Indian lifters believe "1 katori dal = 15g protein". In reality, cooked dal is ~70% water and has ~5-7g protein with low methionine/cysteine bioavailability (PDCAAS ~0.55-0.70). Indian lifters consistently fall short of leucine and essential amino acid thresholds required for muscle protein synthesis (MPS).
* **Architecture Blueprint:**
  1. Add an amino-acid scoring rule in `logic/Calc.kt` for vegetarian catalog staples:
     * Cereals (roti, rice): low in lysine, high in methionine.
     * Legumes (dal, chole, rajma): high in lysine, low in methionine.
  2. Implement a 1-tap "Protein Complement" chip in `Diet.kt` and `AddFood.kt`:
     * When logging dal without rice or paneer, display a helpful suggestion: *"Tip: Pair with 100g low-fat paneer or 2 rotis to achieve complete amino acid balance."*
     * In Target Calculator (`TargetCalc.kt`), provide a vegetarian protein realistic curve (e.g. 1.6 g/kg) rather than a rigid 2.2 g/kg animal-protein standard.

---

### Feature 3.3: Indian Thali & Street-Food Multi-Item Combo Builder
* **Value:** Eliminates the #1 friction in Indian nutrition tracking  
* **Size:** **M** (Medium — ~250 LOC UI + DB model)  
* **Why It Matters:**  
  Western trackers assume single-item meals (e.g., "1 bowl of oatmeal" or "1 chicken breast"). An Indian meal is almost never a single item—it is a Thali: 2 rotis, 1 katori dal, 1 serving dry sabzi, 1 small bowl curd, and a portion of rice. Having to search and log 5 separate items 3 times a day causes high user attrition.
* **Architecture Blueprint:**
  1. Introduce a `ThaliTemplate` entity with pre-configured traditional plates:
     * *Standard North Indian Thali:* 2 Phulkas (50g flour) + 1 Katori Dal Tadka (150g) + Bhindi Masala (100g) + Curd (100g).
     * *South Indian Meal:* Sambar (150ml) + White Rice (150g) + Poriyal (100g) + Curd (100g).
     * *Gym Rat High-Protein Thali:* 3 Rotis + 200g Paneer Bhurji / Soya Chunks Curry + Cucumber Salad.
  2. Provide a 1-tap "Log Thali" action in `QuickAdd` that logs all constituent items with correct portion grammages simultaneously.

---

### Feature 3.4: Traditional Indian Volumetric Serving Units in Portion Picker
* **Value:** Dramatic improvement in logging accuracy  
* **Size:** **S** (Small — ~100 LOC in Catalog/AddFood)  
* **Why It Matters:**  
  Indian home cooks do not weigh food on digital scales. They measure using household references:
  * "1 Katori" (standard Indian bowl: Small ~150ml, Medium ~200ml, Large ~250ml)
  * "1 Phulka / Roti" (thin vs paratha with oil)
  * "1 Chammach" (tablespoon ~15ml)
  * "1 Tukda / Piece" (e.g., 50g paneer cube)
* **Architecture Blueprint:**
  1. In `logic/Catalog.kt`, augment food items with `serving_units`:
     * Cooked dals/curries: `katori_sm` (150g), `katori_md` (200g), `katori_lg` (250g).
     * Breads: `phulka_plain` (25g raw flour, 70 kcal), `roti_ghee` (95 kcal), `paratha` (180 kcal).
  2. In `AddFood.kt`, offer intuitive segmented buttons for `Katori` and `Pieces` before falling back to raw grams.

---

### Feature 3.5: Android Health Connect & Indian Smartwatch Wearable Two-Way Sync
* **Value:** Completely solves sensor crashes & phone reboot step losses  
* **Size:** **M** (Medium — ~350 LOC with Android Health Connect API)  
* **Why It Matters:**  
  The Indian wearable market is dominated by affordable budget smartwatches (Noise, boAt, Fire-Boltt, Amazfit, OnePlus, Fastrack). Lifters do not keep heavy phones in their pockets while doing squats or deadlifts. Relying solely on `Sensor.TYPE_STEP_COUNTER` on the phone guarantees step under-counting.
* **Architecture Blueprint:**
  1. Integrate Android `androidx.health.connect.client.HealthConnectClient`.
  2. Read aggregated steps, active calories burned, and weight logs synced from Google Fit, NoiseFit, boAt Crest, and Samsung Health.
  3. When Health Connect is connected, supersede the unreliable local `StepCounter.kt` listener, eliminating Bugs 1.3, 1.4, and 1.5 permanently.

---

### Feature 3.6: Hidden Cooking Oil & "Tadka" Calorie Estimator
* **Value:** Addresses the primary cause of fat loss failure in India  
* **Size:** **S** (Small — ~80 LOC UI component)  
* **Why It Matters:**  
  Home-cooked Indian food is healthy, but traditional cooking techniques use liberal amounts of mustard oil, refined sunflower oil, or ghee for tadka (tempering). A single tablespoon of oil adds ~120 kcal of pure fat. Most lifters log "1 bowl homemade dal = 120 kcal", unaware that the tadka contributed an additional 150 kcal, erasing their daily caloric deficit.
* **Architecture Blueprint:**
  1. Add an intuitive `+ Tadka / Oil` quick-toggle chip on the food logging sheet (`AddFood.kt`):
     * *1 tsp Oil/Ghee:* +45 kcal (5g fat)
     * *1 tbsp Oil/Ghee (Standard Tadka):* +120 kcal (14g fat)
     * *Restaurant / Shaadi Style:* +200 kcal (22g fat)
  2. Automatically appends a linked oil sub-entry to the food log.

---

### Feature 3.7: Vernacular Regional Localization (Hindi, Tamil, Telugu, Marathi)
* **Value:** Expands reach to Tier-2/Tier-3 Indian fitness audience  
* **Size:** **M** (Medium — Android string resources)  
* **Why It Matters:**  
  The app repository already bundles Hindi exercise instructions (`steps_hi` in `Exercises.kt`). Extending localization to core UI tabs, macro labels, and common Indian food aliases will allow millions of non-English-first gym-goers across Bharat to train with FORGE.
* **Architecture Blueprint:**
  1. Extract hardcoded UI strings in `Components.kt`, `Today.kt`, and `Diet.kt` into `res/values/strings.xml` and `res/values-hi/strings.xml`.
  2. Support Indian food names in Devanagari and regional scripts (e.g. "चना दाल", "पनीर भुर्जी", "इडली सांभर") in `Catalog.kt` search queries.

---

### Feature 3.8: Gym Lockscreen Rest Timer Notification & Media Controls
* **Value:** Significant quality-of-life upgrade during intense lifting  
* **Size:** **M** (Medium — ~200 LOC Android Notification Service)  
* **Why It Matters:**  
  Currently, rest timer countdown and vibration only run while the phone is unlocked and `Session.kt` is active (Session.kt:117-135). Lifters lock their phones, put them on the gym floor or bench, and listen to music. Unlocking the phone with chalky or sweaty hands to check rest time is inconvenient.
* **Architecture Blueprint:**
  1. Spawn an ongoing Notification (`startForeground`) with a countdown chronometer when a set is marked done.
  2. Include Notification Action Buttons:
     * `+30s` (Add rest time)
     * `Skip Rest` (Start next set immediately)
     * `Log Set` (Check off next planned set directly from notification)
  3. Fire system vibration pattern `[0, 200, 100, 200]` when the notification timer reaches 0, even while the phone is locked.

---

## 4. AUDIT SUMMARY TABLE

| Category | Finding ID | Severity | File / Citation | Summary |
| :--- | :--- | :--- | :--- | :--- |
| **Bug** | 1.1 | **Critical** | `Session.kt:206` / `Workout.kt:133` | `workout_exercise_id = uid()` breaks link with `ex.id`; Train screen exercise checks never turn green. |
| **Bug** | 1.2 | **Critical** | `Session.kt:162` / `History.kt:198` | History session clicks check active plan day; imported/past workouts locked behind "Day no longer exists". |
| **Bug** | 1.3 | **High** | `StepCounter.kt:37` / `Store.kt:226` | Hardware counter reboot sets `base = 0`; Store drops post-reboot steps up to old count. |
| **Bug** | 1.4 | **High** | `StepCounter.kt:35` | Multi-day absence sets `base = last`, bundling several days of accumulated steps onto today. |
| **Bug** | 1.5 | **High** | `MainActivity.kt:50` | `steps.stop()` on `onPause()` completely disables background and locked-screen step counting. |
| **Bug** | 1.6 | **High** | `Store.kt:109, 137` | Local mode skips synchronous cache and executes unsynchronized disk writes, causing data loss on rapid taps. |
| **Bug** | 1.7 | **High** | `Store.kt:140, 175` | Non-transient save error calls full `reload()`, wiping all uncommitted optimistic in-memory state. |
| **Bug** | 1.8 | **High** | `Settings.kt:450` | AI insights saved directly to Supabase DB without user acceptance, violating `CLAUDE.md` Rule 3. |
| **Bug** | 1.9 | **Medium** | `Today.kt:687` | Fasting elapsed hours computed in un-keyed `remember`; timer and progress bar frozen on screen. |
| **Bug** | 1.10 | **Medium** | `Today.kt:815` | `StepSheet` text state remembered without date key, persisting old date's input across navigation. |
| **Bug** | 1.11 | **Medium** | `Camera.kt:52, 178` | Scanned food photos hardcode `mealTypes[1]` (Lunch) with no UI to select breakfast or dinner. |
| **Bug** | 1.12 | **Medium** | `History.kt:108` | CSV import launches 100+ un-batched concurrent PostgREST requests, risking rate-limit failures. |
| **Bug** | 1.13 | **Medium** | `Settings.kt:394` | Deleting a meal type hides logged foods from UI while ghost calories remain in daily totals. |
| **Bug** | 1.14 | **Medium** | `Progress.kt:341` | Sparkline charts coerce unlogged days to `0.0`, drawing jagged vertical plunges to zero. |
| **Bug** | 1.15 | **Medium** | `Progress.kt:283` | Weight trend chart spaces points by array index instead of date delta, distorting time axis. |
| **Bug** | 1.16 | **Medium** | `Today.kt:60` | `today = remember { Calc.today() }` retains stale date past midnight / 4 AM day boundary. |
| **Bug** | 1.17 | **Medium** | `Coach.kt:49` | AI Coach chat history stored in plain `remember`, lost entirely on phone rotation. |
| **Bug** | 1.18 | **Low** | `Store.kt:209` | Sign-out cleans database cache but leaves private physique photos and step baseline on disk. |
| **Bug** | 1.19 | **Low** | `Ai.kt:352` | Malformed AI JSON throws raw `IllegalArgumentException` leaked to users in Notice banners. |
| **UI/UX** | 2.1 | **Severe** | `Theme.kt` / `Components.kt` | WCAG AA contrast failures (FillCircle 1.4:1, Notice.Warn 2.1:1, Citrus button 2.6:1). |
| **UI/UX** | 2.2 | **High** | `Diet.kt:192` / `Recipes.kt:98` | Touch targets under 44dp minimum (delete button 24dp, favorite star 28dp, chips 38dp). |
| **UI/UX** | 2.3 | **High** | `MainActivity.kt:141` | Central floating "+" button hardcoded to `go("diet")`; missing web's 8-action `QuickAdd` sheet. |
| **UI/UX** | 2.4 | **High** | `BodyMap.kt:238` | `hitBounds.contains()` tests rectangular bounding box, stealing taps from adjacent muscles. |
| **UI/UX** | 2.5 | **Medium** | `Adherence.kt:96` / `Calc.kt:140` | Calendar grid hardcodes Sunday start, ignoring user's Monday `week_start` setting. |
| **UI/UX** | 2.6 | **Medium** | `Session.kt:552` | Barbell plate loading calculator hardcodes `"kg"` even when user units are set to `"lb"`. |
| **UI/UX** | 2.7 | **Medium** | `Today.kt:150` | Date label renders raw `"11-16"` substring instead of human-formatted `"Mon, 16 Nov"`. |
| **UI/UX** | 2.8 | **Low** | `Workout.kt:100` | Displays raw snake_case focus strings (e.g. `hypertrophy_push`) to users. |
| **UI/UX** | 2.9 | **Low** | `Auth.kt:27` / `Components.kt:141` | Input fields lack `KeyboardType.EmailAddress` and password visibility toggle. |
| **Feature** | 3.1 | **Critical (M)** | `Settings.kt` / `Today.kt` | Indian Festival & Fasting (Vrat / Roza / Ekadashi) Nutrition Modes. |
| **Feature** | 3.2 | **High (S)** | `Calc.kt` / `AddFood.kt` | Lacto-Vegetarian Protein Completeness & PDCAAS Quality Optimizer. |
| **Feature** | 3.3 | **High (M)** | `QuickAdd` / `Diet.kt` | Indian Thali & Street-Food Multi-Item Combo Builder. |
| **Feature** | 3.4 | **High (S)** | `Catalog.kt` / `AddFood.kt` | Traditional Indian Volumetric Serving Units (Katori, Roti, Chammach). |
| **Feature** | 3.5 | **High (M)** | `data/` | Android Health Connect & Indian Smartwatch Wearable Two-Way Sync. |
| **Feature** | 3.6 | **High (S)** | `AddFood.kt` | Hidden Cooking Oil & "Tadka" Calorie Estimator. |
| **Feature** | 3.7 | **Medium (M)** | `res/values-hi` | Vernacular Regional Localization (Hindi, Tamil, Telugu, Marathi). |
| **Feature** | 3.8 | **Medium (M)** | `Session.kt` | Gym Lockscreen Rest Timer Notification & Media Controls. |
