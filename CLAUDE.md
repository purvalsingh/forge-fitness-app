# FORGE — architecture & conventions

Fitness + Indian nutrition app: training, nutrition, steps, water, fasting, bodyweight, goals,
adherence, analytics, AI. One React codebase ships as a web app (/app on Vercel), a Capacitor
Android APK and an iOS Xcode project. Design system "FORGE Ember" (Stitch project
14736699563082618847): charcoal #0E0D0C + ember #FF6B2C; lime = done, blue = protein.

## Commands

```
npm run dev        # local dev server (5173, base /app/)
npm run build      # web app -> dist/app + landing (site/) -> dist + APK -> dist/download
npm run apk        # native bundle + signed release APK -> release/forge.apk (JDK 21 at ~/.local/jdk-21)
npm run deploy     # vercel build --prod && vercel deploy --prebuilt --prod (project "forgefit")
npm run catalog    # rebuild public/food-catalog.json (dishes + INDB)
npm run typecheck  # tsc -b --noEmit
npm test           # vitest (calc, guard, training, importers)
```

Live: https://forgefit-india.vercel.app (landing), /app (web app), /download/forge.apk.
Signing key + FORGE_KEY_SECRET backup live in ~/.forge-signing (never in the repo).

## Stack

React 19 + TypeScript + Vite 8, Tailwind v4 (theme tokens in `src/index.css`), react-router,
recharts, zod, `vite-plugin-pwa` (web only), Capacitor 8 (native). Supabase for auth + data,
reached through the site's `/sb` proxy (supabase.co is DNS-blocked on some Indian ISPs).
Vercel functions in `api/` for AI and key storage. No UI kit, no state library.

## Layout

```
src/
  lib/
    types.ts      domain types (the contract every layer agrees on)
    calc.ts       ALL deterministic maths: BMR/TDEE, targets, totals, adherence, streaks, trends
    derive.ts     read-only selectors over store state (day totals, adherence, month grid)
    db.ts         storage layer — Supabase or localStorage behind one interface
    supabase.ts   client + `supabaseConfigured`
    ai.ts         AI facade; zod schemas; NEVER holds a key
    photos.ts     on-device IndexedDB photo store for physique check-ins
    seed.ts       first-run data (4 meals, ~28 foods, 3 recipes, the supplied 5-day plan)
    templates.ts  data-driven plan generation (splits × focus × frequency × emphasis)
    physique.ts   deterministic physique roadmap + clamping of AI output
    training.ts   e1RM, plate math, progression/deload, muscle sets, heatmap (tested)
    exercises.ts  1,324-exercise library loader + name matching
    importers.ts  Strong / Hevy CSV import
    native.ts     Capacitor wiring (back button, status bar, splash)
  ui.tsx          all shared primitives (Card, Glass, Sheet, ScoreArc, Ring, FillCircle, Icon…)
  store.tsx       one context store: loads everything, exposes save/del/reload
  screens/        one file per route
api/
  ai.ts           the only route that calls Gemini — with the CALLER's decrypted keys
  keys.ts         save/list/delete a user's 2–5 Gemini keys (AES-256-GCM, never returned)
  _lib/           guard.ts (food abuse checks), prompts.ts, crypto.ts, http.ts
site/             landing page (vanilla + GSAP/Lenis), assembled by scripts/assemble.mjs
scripts/          indian-states.mjs (dishes of all 28 states + 8 UTs), rebuild-catalog.mjs, build-apk.mjs
supabase/migrations/  0001 schema + RLS, 0002 v2 (keys, ai_usage, water, exercises, settings)
android/ ios/     Capacitor projects (package app.forge.fitness)
```

## Rules that matter

1. **Secrets never reach the browser.** Only the Supabase URL + publishable key are client-side.
   Each user's Gemini keys are encrypted by `api/keys.ts` with FORGE_KEY_SECRET (Vercel env) bound to
   their user id; only hints come back. The API acts as the caller (their JWT) — no service-role key.
2. **RLS is the security boundary**, not the client. Every user table has `user_id` and an
   owner-only policy. The client never filters by user id itself.
3. **AI input and output are untrusted.** `api/_lib/guard.ts` rejects non-food, impossible amounts and
   prompt injection before Gemini, and physically impossible numbers after. Food answers are grounded
   to the catalog (`groundItem`) and default to real Indian servings, never "100 g of vada pav".
   **AI output is untrusted input.** Everything from Gemini is validated with zod in `ai.ts` and
   again bounded by deterministic code (`calcTargets`, `physique.reconcile`) before it can be saved.
   One retry, then a graceful failure. AI never writes to the database without the user accepting.
4. **Deterministic first, AI second.** Calorie/macro targets and physique timelines are computed by
   `calc.ts` / `physique.ts`. AI explains and personalises within bounds; it does not replace the maths.
5. **The app must work with zero credentials.** No Supabase → localStorage demo mode. No Gemini →
   manual entry and calculated roadmaps. Nothing is a dead button.
6. **Adherence is transparent and configurable.** `dayAdherence()` in `calc.ts` is the single source
   of truth: weights live in `settings.adherence_weights`, a rest day is `'na'` (never a failure), and
   `'na'` components have their weight redistributed. The calendar shows completion as *circle fill*,
   never as a percentage number inside the circle.
7. **Workouts are data, not code.** Splits, exercise pools and set/rep/rest schemes live in
   `templates.ts`; the frontend renders whatever plan rows exist. The supplied 5-day program is just
   one seed option.
8. **Workout history is immutable relative to plans.** Sessions are their own rows with a snapshot of
   their exercises, so replacing, editing or deleting a plan never rewrites the past.
9. **Physique photos never leave the device**, except for one AI analysis request the user triggers.
   They live in IndexedDB (`photos.ts`); the database row stores only keys and the analysis.

10. **The day ends at `settings.day_start_hour` (default 4 AM).** `calc.today()` is the logical day;
   `useActiveDate()` is the day being viewed/logged (Today's ‹ › switcher, "Yesterday" chips).

## Data model notes

Relational where it is queried (`food_logs`, `weight_logs`, `step_logs`, `workout_sessions` headers),
`jsonb` where the value is a document that is always read and written whole (`recipes.ingredients`,
`workout_plans.days`, `workout_sessions.exercises`, `physique_checkins.analysis`). This keeps the
common queries indexable without an N+1 join for every plan render.

Ids: seeded rows use readable string ids (`food-chicken-breast`), everything else `crypto.randomUUID()`.

## Conventions

- Screens own their layout; anything reused twice moves to `ui.tsx`.
- Touch targets ≥ 44px, `aria-label` on every icon-only control, `Notice` for user-facing errors —
  never a raw stack trace.
- Every feature needs loading / empty / error / offline / permission-denied / AI-unavailable states.
- Tests cover logic, not rendering: `src/lib/calc.test.ts` is the regression net.
