# FORGE — architecture & conventions

Personal fitness operating system: training + nutrition + steps + bodyweight + goals + adherence +
analytics + AI. Mobile-first PWA. Dark burgundy is the primary look; light mode is a designed
counterpart, not an inversion.

## Commands

```
npm run dev        # local dev server (5173)
npm run build      # production build -> dist/
npm run preview    # serve the production build
npm run typecheck  # tsc -b --noEmit
npm test           # vitest (pure logic + AI schema validation)
```

## Stack

React 19 + TypeScript + Vite 8, Tailwind v4 (`@tailwindcss/vite`, no config file — theme lives in
`src/index.css`), react-router, recharts, zod, `vite-plugin-pwa`. Supabase for auth + data.
No UI kit, no state library: one context store is enough for a single-user app.

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
  ui.tsx          all shared primitives (Card, Glass, Sheet, ScoreArc, Ring, FillCircle, Icon…)
  store.tsx       one context store: loads everything, exposes save/del/reload
  screens/        one file per route
supabase/
  migrations/0001_init.sql   full schema, indexes, RLS, signup trigger
  functions/ai/index.ts      the only place Gemini keys exist
```

## Rules that matter

1. **Secrets never reach the browser.** Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`
   are client-side. Gemini keys live as Edge Function secrets. No service-role key anywhere in `src/`.
2. **RLS is the security boundary**, not the client. Every user table has `user_id` and an
   owner-only policy. The client never filters by user id itself.
3. **AI output is untrusted input.** Everything from Gemini is validated with zod in `ai.ts` and
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
