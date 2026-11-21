# training batch report

**Build check:** `./gradlew --no-daemon -q :app:testDebugUnitTest :app:compileDebugKotlin` → exit 0, zero `e:` lines.  
**Test results:** All unit tests passing.

---

## Files written

| File | Source ported from | Notes |
|------|--------------------|-------|
| `screens/Workout.kt` | `src/screens/Workout.tsx` | Full port of today's training screen. Plan selection, day tabs, completion progress bar, workout exercise list with set status checkboxes, quick navigation chips (Freestyle, History & muscle map, Exercises, Plans), volume stats, recent sessions list, and `nameOf()` helper. |
| `screens/Session.kt` | `src/screens/Session.tsx` | Live workout tracker. Clock timer, sets management, warm-up toggles, plate calculator per side, PR detection with toast alert, rest countdown timer with `android.os.Vibrator` vibration feedback and screen flash, screen keep-awake flag (`FLAG_KEEP_SCREEN_ON`) respecting `settings.keep_awake`, superset grouping and last-in-round rest triggers, effort scale (RIR/RPE color-coded), exercise menu sheet (notes, custom rest seconds, swap, superset, reorder, remove), exercise picker sheet with muscle filtering and favorites. |
| `screens/PlanBuilder.kt` | `src/screens/PlanBuilder.tsx` | Plan management and creation. Plan switching, renaming, active toggle, plan duplication, day swap sheet, day addition/deletion, exercise reordering (up/down), duplicate exercise, exercise delete, sets/reps/target/rest/tempo/notes inline editing. Full `NewPlanSheet` with training focus options, frequency selection, AI generation with rationale via `Planner.requestPlan()` / fallback to deterministic templates via `Templates.generatePlan()`, empty plan, and supplied 5-day plan options. |
| `screens/Exercises.kt` | `src/screens/Exercises.tsx` | Exercise library browser. Async loading of 1,324 exercises via `Exercises.loadExercises()`, search with muscle and equipment filter chips, custom exercise creation sheet, favorite toggling, detail sheet with English and Hindi step-by-step instructions, best estimated 1RM, exercise session history, and custom exercise deletion. |
| `screens/History.kt` | `src/screens/History.tsx` | Training history. 53-week interactive training heatmap rendered using Compose Canvas (no chart libraries), muscle balance map powered by `BodyMap`, time range tabs (7d, 30d, 1y), untrained muscle list, past workout backfill sheet, CSV workout importer for Strong & Hevy exports via `Importers.importWorkouts()`, and session list with set count, volume, and PR badges. |
| `screens/BodyMap.kt` | `src/screens/BodyMap.tsx` | Full anatomical muscle map. Male and female front and back figures drawn as Compose Canvas vector paths parsed from bundled `assets/body.json`. Interactive touch hit-testing using `android.graphics.Region`, color-coded volume intensity scaling, sex toggle chips, muscle set count display, and legend. |
| `screens/Physique.kt` | `src/screens/Physique.tsx` | AI physique lab and check-ins. On-device photo management with `ActivityResultContracts.PickVisualMedia` and `Photos.kt` downscaling (front, side, back, relaxed, flexed, and reference). Multi-step wizard (Upload -> Objective -> Analysing -> Result), AI analysis via `Ai.physiqueAnalysis()` with fallback to deterministic `Physique.localRoadmap()`, timeline milestones, recommended workout plan generation, nutrition target derivation via `Calc.calcTargets()`, check-in history cards with expandable photos and deletion. Photos remain exclusively on-device. |
| `assets/body.json` | `src/lib/body.json` | Bundled anatomical SVG path data (18 parts per front/back view for male and female) for Compose Canvas rendering in `BodyMap.kt`. |

---

## Notable Port Details & Parity

1. **Charts & Canvas**:
   - The 53-week training history heatmap in `History.kt` is drawn with Compose `Canvas` with rounded rect cells and opacity blending based on workout duration.
   - The front and back anatomical figures in `BodyMap.kt` are rendered directly via Compose `Canvas` vector paths with custom hit-testing for muscle selection and dynamic fill alpha based on relative volume.
   - The live workout rest timer countdown ring in `Session.kt` is drawn via Compose `Canvas` arc drawing.

2. **Hardware & System Integrations**:
   - Live session timer keeps the display awake via `window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)` when `settings.keep_awake != false`.
   - Rest timer completion and set completion trigger haptic vibrations via `android.os.Vibrator`.
   - File picker for CSV imports in `History.kt` utilizes `ActivityResultContracts.GetContent()`.
   - Photo picker in `Physique.kt` utilizes `ActivityResultContracts.PickVisualMedia()`.

3. **Privacy & Offline First**:
   - Physique photos are saved to private app storage (`context.filesDir/photos`) and never uploaded to remote databases. Only the single user-triggered analysis request transmits photo data.
   - All AI actions check `api.configured` and `state.localMode`, seamlessly providing deterministic template generation and local roadmaps when offline or unconfigured.

---

## Verification

Compiled cleanly using:
```bash
cd ~/forge/native && JAVA_HOME=~/.local/jdk-21 ./gradlew --no-daemon -q :app:testDebugUnitTest :app:compileDebugKotlin
```
Exit 0, 0 failures, 0 errors.
