# system batch report

**Build check:** `./gradlew --no-daemon -q :app:testDebugUnitTest :app:compileDebugKotlin` → exit 0, zero `e:` lines.  
**Test results:** 75 tests, 0 failures, 0 errors.

---

## Files written

| File | Source ported from | Notes |
|------|--------------------|-------|
| `screens/More.kt` | `src/screens/More.tsx` | Profile paper card with display name & goal stats; Backend & AI status tags; categorized navigation sections (Plan, Training, Data, System) with icons and navigation targets; clickable AI insights card linking to Progress. |
| `screens/Goals.kt` | `src/screens/Goals.tsx` | Mode selector (Cut, Maintain, Bulk); Progress to target bar with weight delta and starting weight; Body cards for weight inputs and profile height/age/sex chips; Activity cards for activity level chips, steps, training frequency, session length, and rate; target validation; save goal; navigation to target calculator; summary stats footer. |
| `screens/TargetCalc.kt` | `src/screens/TargetCalc.tsx` | Deterministic baseline card (maintenance, rate, goal, timeframe, warnings); Adaptive maintenance card using `Calc.adaptiveTdee` + "Apply to target" with offset; editable target inputs (calories, protein, carbs, fat) with live macro calorie summation and validation via `Calc.isValidTarget`; AI personalisation via `Ai.targetAdvice` with review card; target persistence. |
| `screens/Settings.kt` | `src/screens/Settings.tsx` | Profile display name & sex chips; Theme switcher (Dark, Light, System) via `s.setTheme`; Accent color picker (Ember, Lime, Sky, Violet, Rose) via `s.setAccent` and `ACCENTS`; Step goal, rest days selector, diet tolerance %; Day end hour (0 to 6 AM) setting `Calc.dayStartHour`; Units (kg/lb), week start (Mon/Sun), default rest, bar weight, effort scale (off/rir/rpe), water goal, fasting window, keep awake & timer flash toggles; Meal configuration (add, edit name/time, remove last); AI assistant insights generation via `Ai.insights` + dismiss & review actions; JSON & CSV exports using Android Storage Access Framework (`CreateDocument`) + Android Share Sheet text sharing; Strong & Hevy CSV workout import using `OpenDocument` + `Importers.importWorkouts`; Backend connection probe; Sign out via `s.signOut()`. |
| `screens/Keys.kt` | `src/screens/Auth.tsx` (KeySetup) | Gemini API key manager (supports 2 to 5 keys, regex validation `^AIza[0-9A-Za-z_-]{35}$`, distinct keys check, show/hide toggle, add key, delete key slot); status display with active count and key hints; persistence via `s.api.saveKeys` / `s.api.deleteKeys`; local mode warning. |
| `screens/Coach.kt` | `src/screens/Coach.tsx` | Fitness & nutrition chat assistant; starter suggestion prompts; message history with user and model speech bubbles; AI generation via `Ai.coachChat`; clear history button; send input bar with character limit and loading states; local mode warning. |
| `screens/Progress.kt` | `src/screens/Progress.tsx` | Date range selector (7D, 30D, 3M, 6M, 1Y); summary analytics card (weight, avg calories, avg protein, avg steps); streaks breakdown (current, best, perfect, diet, workout); pure Jetpack Compose Canvas charts: bodyweight measured + trend line (`Calc.trend`), calories area chart, dual line chart for protein & steps, adherence bar chart, training volume bar chart; monthly adherence navigation; bottom sheet for logging/deleting bodyweight. |

---

## Verification
- Verified compilation and unit tests:
  `cd ~/forge/native && JAVA_HOME=~/.local/jdk-21 ./gradlew --no-daemon -q :app:testDebugUnitTest :app:compileDebugKotlin` completed cleanly with exit code 0.
- No new dependencies added (standard Android SAF and Compose Canvas used for files and charts).
