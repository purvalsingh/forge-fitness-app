# daily batch report

**Build check:**
```bash
cd ~/forge/native && JAVA_HOME=~/.local/jdk-21 ./gradlew --no-daemon -q :app:testDebugUnitTest :app:compileDebugKotlin
```
→ **Exit 0**, zero `e:` lines, all tests passed.

---

## Files written and modified

| File | Source ported from | Notes |
|------|-------------------|-------|
| `logic/Barcode.kt` | `src/lib/barcode.ts` | Ported Open Food Facts lookup using OkHttp and `kotlinx.serialization.json`. Parses product nutriments (kcal, protein, carbs, fat, fiber, sugar, sodium) and serving sizes into a `Food` object. |
| `screens/AddFood.kt` | `src/screens/AddFood.tsx` | Exported public composables/functions: `AddFoodSheet`, `LogTarget`, `PortionPicker`, `ReviewItems`, `normUnit`. Contains all 5 tabs: Search (catalog + custom foods + region browsing), AI Describe (with grounding), Barcode (Google Play Services Code Scanner + manual entry), Quick Meals, and Custom Food. |
| `screens/Today.kt` | `src/screens/Today.tsx` | Ported date switcher, calorie hero ring (Compose Canvas arc + macros), steps / water / streak tiles with `StepSheet` and `WaterSheet`, workout card (rest day / active session / start plan), fuel log list with add-food, and the Fasting card. |
| `screens/Diet.kt` | `src/screens/Diet.tsx` | Ported calorie & macro target bars, quick action shortcuts (Scan Food, Quick Meals), meal-by-meal logs with inline delete and macro breakdown, summary stats, and AddFoodSheet trigger. |
| `screens/Camera.kt` | `src/screens/Camera.tsx` | Ported food camera capture with `ActivityResultContracts.TakePicture` and `FileProvider`, gallery pick via `GetContent`, downscaling via `Photos.downscale(maxPx = 1280, quality = 82)`, AI photo analysis with `Ai.analyzeFoodPhoto`, catalog grounding, and `ReviewItems`. |
| `screens/DayDetail.kt` | `src/screens/DayDetail.tsx` | Ported daily completion card with `FillCircle` (Rule 6 compliant: circle fill indicates completion, no percentage inside), status breakdown for diet/workout/steps, diet meal list, workout session volume/sets/duration stats, steps, weight, and AI insights. |
| `screens/Adherence.kt` | `src/screens/Adherence.tsx` | Ported monthly consistency calendar using `Calc.monthGrid`, `FillCircle` for each day's completion score with day-of-month label, 3 status dots (diet, workout, steps), month navigation, and monthly stats. |
| `screens/Foods.kt` | `src/screens/Foods.tsx` | Ported food database browser (catalog + custom foods), search, and `FoodSheet` modal for creating and editing foods with full macro/micro breakdown. |
| `screens/Recipes.kt` | `src/screens/Recipes.tsx` | Ported quick meals list with macro sums, favorite toggle, "Add to meal" sheet, and `RecipeSheet` for managing ingredients with catalog search. |
| `res/xml/file_paths.xml` | — | Configured cache and file paths for `FileProvider`. |
| `AndroidManifest.xml` | — | Added `androidx.core.content.FileProvider` declaration. |
| `app/build.gradle.kts` | — | Added exactly one dependency: `com.google.android.gms:play-services-code-scanner:16.1.0`. |

---

## NOT ported / differences

- None. All features, modal sheets, states, edge cases, offline demo mode notices, and UI copy from the web screens were ported to native Jetpack Compose.
