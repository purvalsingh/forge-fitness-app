# FORGE native audit (Sonnet, read-only). Root: app/src/main/java/app/forge/fitness/
No Gradle run, no edits. Items marked UNVERIFIED were not reproduced on a device.

## 1. BUGS (most severe first)

1. **Offline/failed writes silently vanish (data loss).** data/Store.kt:137-139
   `try { putRemote(t, listOf(row)) } catch (e: Exception) { _state.update { it.copy(error=...) }; reload() }`
   Signed-in `putRemote` (l.109) only calls `api.upsert`; it never writes the local cache or queues the row. When offline, `reload()` goes to `fetch()` (l.99 `if (e.code=="offline") return readLocal(t)`), which returns the stale cache. The optimistic row is replaced and gone. A set logged in a gym with no signal disappears when you leave the screen. The web app has the same shape but runs in a browser tab. A native app needs a persisted outbox.
2. **Session.persist() shows a false promise.** screens/Session.kt:242-247 `try { s.save(...) } catch (_: Exception) { err = "...will save when you are back online." }`. `Store.save` returns Unit and never throws (the launch is async), so the catch is dead code. The message is wrong: nothing is queued (see 1).
3. **Clearing a field never persists.** data/Api.kt:84 `row.filterValues { it !is JsonNull }`, plus `explicitNulls=false` (Api.kt:15). With `resolution=merge-duplicates` the server column keeps its old value. Removing a note, photo path, goal weight or target override reverts after the next reload. The comment says this is deliberate protection against old-APK blanking, but it breaks every "set to empty" edit. UNVERIFIED per column.
4. **Re-seed can overwrite user data.** Store.kt:115-119: if `fetch(mealTypes).isEmpty()` it runs `putRemote(settings, Seed.settings)`, `plans, Seed.plan`, `foods` and `recipes`. `fetch` (l.102) uses `mapNotNull{ runCatching{decode}.getOrNull() }`, so undecodable rows are dropped silently. A user who deletes all meal types, or a decode failure on that one table, triggers a reseed that upserts seed ids over their settings and plan.
5. **Concurrent `reload()` calls race.** Store.kt:112 `fun reload() = viewModelScope.launch {...}`. Nothing cancels an earlier job. Several failed saves each start a reload, and an older response can overwrite a newer `_state.value = s` (l.127). A reload also overwrites any optimistic row whose upsert has not reached the server yet. That is the same race as in `save()` on rapid sequential edits, such as ticking sets quickly.
6. **Token refresh race and NPE.** Api.kt:70-75 `token()` has no mutex. Parallel `save()` calls near expiry each POST the same refresh token, and Supabase rotation rejects the second. `parseSession` does `o["refresh_token"]!!` (Api.kt:57). If refresh fails (a revoked session returns 4xx `ApiError`), the app only shows a Snackbar. There is no auto-sign-out and no re-auth prompt. The user stays stuck with every write failing until they find Settings > Sign out. UNVERIFIED.
7. **Step counter loses steps after a reboot.** data/StepCounter.kt:36 `total < base -> base = 0` then `onSteps(today, total - 0)`. Store.onSensorSteps (Store.kt:175) never lowers a day's count, so after a same-day reboot nothing updates until the new counter exceeds the earlier total. Steps walked in that stretch are lost. Fix: keep a per-day `offset`.
8. **Step counter dumps multi-day gaps onto today.** StepCounter.kt:35 `day != today -> base = if (last in 0..total) last else total`. Open the app after 3 days and all 3 days of steps land on today (for example 25k). The file's own `ponytail:` comment admits only the midnight case. Also, `<50` chunking (Store.kt:176) never flushes the last under-50 steps on `onPause`.
9. **Date never rolls over.** Store.kt:192 `_date = MutableStateFlow(Calc.today())` and Today.kt:60 `val today = remember { Calc.today() }`. A phone left alive past 4am keeps logging to yesterday. Web recomputes on focus (src/store.tsx:206-213). `_date` is also created before `Calc.dayStartHour` is loaded (Store.kt:126).
10. **Finish workout adds a back-stack entry.** Session.kt:398-399 `persist(session.copy(finished_at = nowIso())); nav.navigate("workout")`. The same pattern is at :163 and :360. It pushes a second Workout route instead of popping. System Back then returns to the finished session, and Reopen is one tap away. The Back arrow also navigates forward instead of popping.
11. **Demo-mode users have no way out.** screens/Settings.kt:590-598 shows Sign out only when `s.api.configured && !st.localMode`. A user who tapped "Continue without account" (Auth.kt:49) can never sign in or sign up later without clearing app data. There is no local-to-cloud migration either. Conversely, `signOut()` (Store.kt:158) deletes the cache files with no confirmation. Signed-in is fine because the server holds the data. Physique photos in filesDir and the `forge_steps` prefs survive sign-out, so the next account on the device sees the old step baseline.
12. **AI errors leak raw exception text.** Ai.kt:`el.jsonObject`, `.jsonArray` and `.jsonPrimitive` throw IllegalArgumentException on a wrongly-shaped item. Callers show `e.message` directly (Coach.kt:75, Camera.kt:~148, AddFood.kt:~897, Settings.kt:~462). Users see "Element class kotlinx... is not a JsonObject". The web catches only AIUnavailable.
13. **No retry on AI schema failure.** Web `call()` (src/lib/ai.ts:81-84) retries once when `safeParse` fails. Native `Api.ai` retries only on non-JSON (Api.kt:121-124), so `Ai.decode*` `bad()` fails on the first miss. Violates the "one retry" rule.
14. **AI insights saved without user acceptance.** Settings.kt:~452 `out.forEach { s.save(Tables.insights, ...) }`. This breaks CLAUDE rule 2, though the web does the same (Settings.tsx:233). Rows also accumulate on every tap and are never pruned. UI shows only `take(6)`.
15. **Steps sheet resets mid-typing.** Today.kt:815 `var text by remember(existing)`. The sensor writes a new StepLog every 50 steps, `existing` changes, and the field text is overwritten while the user types.
16. **Updater.** (a) data/Updater.kt:45 `total = contentLength().coerceAtLeast(1)`. If the server omits Content-Length, progress is bytes/1, so the bar and "%" show absurd values. (b) `check()` wraps `runCatching`, which also swallows CancellationException. (c) Empty `sha256` skips the integrity check (l.54). Android's signature check still covers tampering. (d) `UpdateBanner` runs the download in `rememberCoroutineScope`, so it is cancelled if the app leaves composition; the partial file stays in cache. (e) The banner overlays screens with no scrim and covers the top of Today (MainActivity.kt:95).
17. **Permission prompt loop.** MainActivity.kt:49 `onResume { startSteps() }` re-launches `askActivity` every resume while ACTIVITY_RECOGNITION is denied. UNVERIFIED on API 33+. Denial gives no explanation, and the step tile silently shows "—".
18. **Silent row dropping and no sync indicator.** Store.kt:102 loses rows with unknown enum values (for example a field the web later adds) with no warning. There is no "offline / last synced" banner anywhere. Data shown after an offline launch looks live.
19. **Coach history is `remember`, not saveable.** The chat is lost on navigation or process death. `on_topic` is decoded but UNVERIFIED as used (grep of Coach.kt found no use).
20. **Concurrent multi-device step rows.** `StepLog(existing?.id ?: uid(), ...)` keys by local date. Two devices create two ids for the same date. UNVERIFIED whether the table has a unique(user_id,date) constraint.

## 2. UI/UX DEFECTS (most severe first)

Contrast, computed on the Monsoon light glass (white 45% over g2 gradient):
1. `F.mute` (ui/Theme.kt:63 `0xFF6B8290`) measures about 3.2-3.6:1 on glass. That is below AA 4.5 for Eyebrow 11sp (Components.kt:44), Body(F.mute,12-13) hints, placeholders (Components.kt:139) and Empty bodies. Dark mode mute (Theme.kt:72) is 4.4:1, borderline.
2. White text on the gradient primary button (Components.kt:94,100): 3.1:1 Monsoon, 3.1 Dusk, **2.6 Citrus**, 3.4 Lagoon. 15sp bold fails AA. Use dark ink on light accents or darken `a1`.
3. `F.accent` used as text colour (Pill l.47, selected Chip l.114, nav label MainActivity.kt:155) is about 2.3-3.4:1 on light glass. The Citrus accent `E8890C` is the worst case.
4. Notice(Tone.Warn) (Components.kt:185) puts `F.carbs` (`E3A12E`) text on a 10% carbs tint over glass, about 2:1 and nearly unreadable. Info (`4C6FFF`) is about 4:1.
5. Disabled button (Components.kt:103) uses `disabledContentColor = F.mute` on `F.raised`. Disabled Sign in and Forgot password are hard to read.

Touch targets under 44dp:
6. Today.kt:139,160 date prev/next `size(36.dp)`. The date label (l.150) has only 6dp padding, so its hit area is under 44dp.
7. Session.kt:804 `size(36.dp)` (water/rest steppers, UNVERIFIED which control). Tabs (Components.kt:122) `heightIn(min=40.dp)`. The Session Finish button passes `heightIn(40)` but FButton's own 52dp min wins.
8. NavItem (MainActivity.kt:151) is 52dp wide but only about 44dp tall by padding arithmetic (UNVERIFIED). The nav icon `contentDescription = t.label` makes TalkBack read the label twice.

Copy and raw values:
9. FButton (Components.kt:104) does `text.lowercase().replaceFirstChar{uppercase}`. It mangles proper nouns and acronyms: "Export everything (JSON)" becomes "Export everything (json)", "Import workouts (Strong / Hevy CSV)" becomes "(strong / hevy csv)", "Share JSON" and the like.
10. Today.kt:150 shows the date as raw `date.substring(5)`, so "11-16" instead of "16 Nov".
11. Camera.kt:269 and AddFood.kt:867 say "Configure Gemini keys in **More** > Keys". The bottom tab is labelled **You** (MainActivity.kt:73). AddFood.kt:867 also says "offline mode" when the cause is no account, which is confusing. The Auth card says "Your data stays on the device" but never warns that there is no migration later.
12. Workout.kt:100 shows `day.focus` raw. If the AI or a template stores a key like `fat_loss`, it appears as a snake_case string (UNVERIFIED which values appear in practice).
13. Error Snackbar (MainActivity.kt:96-98) is app-global and persists until OK. It appears on the Auth-adjacent screens after a reload failure and overlaps the floating nav on small phones. A first-load failure leaves an empty Today with a Snackbar and no Retry button, because `reload()` is not offered.
14. AuthScreen: email field has no `KeyboardType.Email` (Components.kt:141 only handles number/password), no IME action, no show-password toggle, and Forgot password has no busy state.
15. Missing states: no stale/"offline" banner (Section 1 item 18). The Step tile gives no "permission needed" prompt. Sheet() (Components.kt:216) has no imePadding, so the keyboard covers inputs in tall sheets (UNVERIFIED).

## 3. FEATURES WORTH ADDING (most valuable first)

1. **Persisted offline write queue + "synced / N pending" chip.** Why: fixes Bugs 1-2 and 18 properly, and gyms and Indian trains have poor signal. Size M.
2. **Rest-timer notification / vibration while app is backgrounded.** Today the timer only vibrates in the foreground (Session.kt:117-135). Use a foreground service or an exact alarm. Why: users lock the phone between sets. Size M.
3. **Daily reminders** (log lunch, water, weigh-in, workout). No Notification/Alarm/WorkManager code exists (grep empty). Size M.
4. **Vegetarian/Jain/egg-only and regional diet preference** driving food search ranking, AI prompts and the protein target. Protein is hard-coded at 1.9-2.2 g/kg (logic/Calc.kt:43), which is unrealistic for many vegetarian users. Add per-meal protein-gap suggestions ("add 150g paneer or 1 scoop") from the existing 13k catalog. Size M.
5. **Fasting-day / festival mode** (Navratri, Ekadashi, Ramzan): shifted meal windows and a suggested-food filter. Why: very common in India and absent from generic trackers. Size M.
6. **Health Connect import** (steps, weight from smart scales, Mi Band / Noise / boAt via Google Fit). This would also fix the raw-sensor gaps in Bugs 7-8. Size L.
7. **Home-screen widget** (calories/protein left, water +250ml, steps). Size M.
8. **Gap-fill on step counter**: a WorkManager midnight snapshot that closes each day's baseline. Why: Bug 8. Size S.
9. **Hindi/Hinglish UI strings and food names** (the catalog already has Indian names). Size L.
10. **Demo-to-account migration** (upload local db on first sign-in). Why: Bug 11. Size S/M.
11. **Cooking helper**: scale a recipe by yield and log "1 katori / 1 roti" serving presets by default. Size S.
12. **Plate-photo correction loop**: let the user adjust AI portions before saving (partly present via the grounded REVIEW stage in Camera.kt). Size S.

Not recommended: social feed, gamified badges, a second AI chat surface.
