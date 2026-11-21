# FORGE native port — brief for every agent

OBJECTIVE: FORGE is a fitness + Indian-nutrition app. The web/React version lives in ~/forge/src (READ-ONLY for you).
We are replacing the Capacitor WebView APK with a REAL native Android app in Kotlin + Jetpack Compose at
~/forge/native, with FULL feature parity. The server stays as-is (Supabase via the site's /sb proxy + Vercel API).

## Already built (do not rewrite; read these first)
- native/app/src/main/java/app/forge/fitness/data/Models.kt   — every domain row (snake_case = DB columns)
- data/Api.kt     — Supabase auth + PostgREST + FORGE API (`api.ai(task, payload)` returns JsonObject; keys())
- data/Store.kt   — AndroidViewModel: `state: StateFlow<State>`, `save(Tables.x, row)`, `del(Tables.x, id)`, `date`/`setDate`,
                    theme/accent, exportJson(), `uid()`, `nowIso()`. Tables.* lists every table.
- data/Seed.kt    — seed rows from assets/seed.json
- logic/Calc.kt   — port of calc.ts + derive.ts (targets, adherence, streaks, trend, adaptiveTdee, dates, monthGrid)
- ui/Theme.kt (colours via `F.accent`, `F.text`…), ui/Components.kt (Screen, Card, FButton, Chip, Tabs, Field, Input,
  NumberInput, Ring, FillCircle, ProgressBar, Notice, Empty, Spinner, Stat, Sheet, Eyebrow, Title, Figure, Body, fmt)
- MainActivity.kt — NavHost with every route; screen signature is `@Composable fun XScreen(s: Store, nav: NavController)`
  (Session takes dayId, DayDetail takes date). Bottom tabs: today, diet, workout, progress, more.
- assets/: food-catalog.json ({foods:[...]} ~13k), exercises.json (1,324 exercises), seed.json

## Rules (from ~/forge/CLAUDE.md — follow them exactly)
1. Port BEHAVIOUR faithfully from the matching .tsx/.ts file: same features, states, copy, numbers. Read the source file fully.
2. Deterministic first, AI second; AI output is untrusted: validate/clamp every AI field (ranges from src/lib/ai.ts zod schemas)
   before showing or saving. AI never writes to the DB without the user accepting. One retry then a graceful Notice.
3. App must work with zero credentials (demo mode): AI buttons show a Notice when `s.state.value.localMode` is true.
4. Every feature has loading / empty / error / offline states. Errors go in `Notice(..., Tone.Error)`, never stack traces.
5. Touch targets >= 44dp, contentDescription on every icon-only control.
6. Adherence completion is shown as circle FILL (FillCircle), never a percentage number in the circle.
7. Physique photos stay on device (app filesDir), only sent in the one user-triggered AI request.
8. Reuse ui/Components.kt and logic/Calc.kt. Add a shared composable to Components.kt ONLY if you own that file (you don't — put
   screen-private helpers as `private` in your own file).
9. No new dependencies unless the brief for your batch allows it. Use kotlinx.serialization (`json` in Api.kt) and OkHttp.
10. Only create/edit the files your batch OWNS. Never touch ~/forge/src, api/, site/, or other batches' files.

## Verify before you finish (mandatory)
cd ~/forge/native && JAVA_HOME=~/.local/jdk-21 ./gradlew --no-daemon -q :app:testDebugUnitTest :app:compileDebugKotlin
Must exit 0 with no `e:` lines. Fix every error you caused. If another batch's file breaks the build, do not edit it — report it.
Write a short report to ~/forge/native/reports/<batch>.md: files written, what was ported, anything NOT ported and why.
Do not claim something works that you did not compile.
