# FORGE

A personal fitness operating system — training, nutrition, steps, bodyweight, goals, adherence,
analytics and AI assistance in one installable mobile app.

Mobile-first PWA. Works fully offline on-device with zero credentials; add Supabase for sync and
Gemini for the AI layer.

---

## Quick start (local)

```bash
npm install
cp .env.example .env.local     # leave the values blank to run in on-device demo mode
npm run dev                    # http://localhost:5173
```

With no credentials FORGE runs in **demo mode**: everything is stored in this browser, seeded with
four meals, ~28 foods, three quick meals and the supplied 5-day training program.

Other commands:

```bash
npm run build      # production build into dist/
npm run preview    # serve the built app
npm run typecheck
npm test
```

---

## Environment variables

Copy `.env.example` → `.env.local`. Only two values belong in the browser:

| Variable | Where to get it | Required? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API, or the `/sb` proxy path on your own domain | for sync/auth |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same page — the **publishable / anon** key | for sync/auth |
| `VITE_AI_FUNCTION_URL` | only to override the default `${VITE_SUPABASE_URL}/functions/v1/ai` | no |

Never put the Supabase **service-role** key in this file — it is a server-only secret and FORGE
never needs it.

Gemini keys are **server-side secrets**. FORGE ships the same AI endpoint for two hosts — use
whichever you deploy on:

- **Netlify** (`netlify/functions/ai.mts`, live at `/api/ai`) — set the keys as Netlify environment
  variables: `netlify env:set GEMINI_API_KEY_1 <key> --secret --context production`.
- **Supabase Edge Function** (`supabase/functions/ai`) — `supabase secrets set GEMINI_API_KEY_1=...`.

Point the browser at whichever you run with `VITE_AI_FUNCTION_URL` (`/api/ai` for Netlify; it
defaults to the Supabase function URL otherwise).

Vision analysis over several photos takes longer than a synchronous function may run, so
`physique_analysis` is dispatched to a background function (`ai-background.mts`), which parks the
result in a Netlify blob that the client polls at `/api/ai-result`. Every other task answers directly.

Optional secrets: `GEMINI_MODEL` (default `gemini-2.5-flash`), `ALLOWED_ORIGIN` (CORS lock-down).

No source file needs editing to add credentials — set env vars and redeploy.

---

## Supabase setup

1. Create a project at supabase.com (the free tier is enough).
2. Run the schema — either:
   ```bash
   supabase link --project-ref <ref>
   supabase db push
   ```
   or paste `supabase/migrations/0001_init.sql` into the SQL editor and run it.
   This creates every table, index, Row Level Security policy and the signup trigger.
3. Auth → Providers: email/password is on by default. Turn email confirmation on or off to taste.
4. Deploy the AI function and its secrets:
   ```bash
   supabase functions deploy ai
   supabase secrets set GEMINI_API_KEY_1=... GEMINI_API_KEY_2=... GEMINI_API_KEY_3=...
   ```
5. Put `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` into your host's env vars and redeploy.

Every table is protected by an owner-only RLS policy (`user_id = auth.uid()`), so one user can never
read or write another's rows.

### Gemini keys

Get them free at [aistudio.google.com](https://aistudio.google.com/apikey). Up to three can be
configured; the function tries them in order and parks a key for 60 seconds when it is rate-limited or
rejected, then falls through to the next. If all are unavailable the app shows
**AI service temporarily unavailable** and manual entry keeps working.

---

## Deploy

The repo is host-agnostic and ships config for the two easiest free options.

**Live site**: https://forge-fitness-app-248.netlify.app (project
`forge-fitness-app-248`). Redeploy from this machine any time with `npm run deploy`.

**Netlify** (`netlify.toml` included): New site from Git → pick the repo → build `npm run build`,
publish `dist` → add the two `VITE_` env vars → deploy. Every push to `main` redeploys; pull requests
get preview deploys.

**Vercel** (`vercel.json` included): Import the repo, framework "Vite", add the env vars, deploy.

Both serve the SPA fallback needed for client-side routing.

**Supabase is proxied through this domain.** `netlify.toml` forwards `/sb/*` to the Supabase
project, and `VITE_SUPABASE_URL` points at `https://<your-site>/sb` rather than
`https://<ref>.supabase.co`. Some mobile networks, DNS resolvers and browser shields block
`*.supabase.co`, which the browser reports only as `Failed to fetch`; same-origin requests avoid
that entirely (and skip the CORS preflight). If you fork this, update the target host in
`netlify.toml` to your own project ref.

Two settings live behind the Netlify UI and only need one click each, under
[Project configuration](https://app.netlify.com/projects/forge-fitness-app-248/configuration/general):

- **Access & security → Visitor access → Public** — new free-plan sites start restricted to team
  members, which is why an unauthenticated phone sees a login redirect.
- **Build & deploy → Link repository → GitHub → `purvalsingh/forge-fitness-app`** — turns on
  deploy-on-push and pull-request previews. Until then, `npm run deploy` publishes from your machine.

### Editing later

- **Desktop**: edit, `git push`, the host rebuilds.
- **Browser**: edit the file on GitHub (or press `.` in the repo for the web editor), commit, done.
- **Phone**: the GitHub mobile app or github.dev in a mobile browser both work — commit and the site
  rebuilds within a minute. No paid IDE, no server on your phone.

---

## Install on Android (Samsung)

1. Open the deployed URL in Chrome (or Samsung Internet).
2. Menu → **Add to Home screen** / **Install app**.
3. Launch it from the home screen: standalone window, no browser chrome, its own icon and splash.

The service worker precaches the app shell, so it opens and stays usable without a connection; an
offline banner appears and writes are reported honestly rather than silently dropped. iOS: Share →
Add to Home Screen.

---

## What's inside

**Today** — daily score arc, calorie/macro rings, diet · workout · steps status, the four meals,
today's session and your current streak.

**Diet** — calories against target, macro bars, four configurable meals, per-entry edit and delete,
plus four ways to log: search, quick meals, AI description, camera.

**Food camera** — capture or upload a meal photo → Gemini vision → detected foods with editable
quantities → *AI estimate — review before saving* → add to a meal. Denied camera permission falls
back to gallery upload and manual search.

**Foods & quick meals** — built-in foods, your own custom foods, and saved recipes that log all their
ingredients into a meal in one tap.

**Workout** — day selector, exercise checklist, per-set weight/reps/done, rest timer seeded from the
exercise's rest period, previous performance, notes, finish. Full plan builder: swap a whole day,
add/remove/reorder/duplicate exercises, edit sets, reps, rest, tempo and notes.

**Plans** — generate a plan from focus (strength, hypertrophy, aesthetics, strength + aesthetics, fat
loss, general fitness, athletic, custom) × 3–6 days per week × free-text emphasis, start from the
supplied 5-day program, or build one from empty. Replacing a plan never touches past sessions.

**Physique Lab** — front/side/back/relaxed/flexed check-in photos plus an optional aspirational
reference image → AI review of visible development, proportions, symmetry and priorities → an
estimated timeline *range* with milestones and stated assumptions → a recommended plan and nutrition
strategy you review and activate. Photos stay on the device; export and delete controls are in the
Lab.

**Goals & nutrition target** — cut / maintain / bulk, a deterministic Mifflin-St Jeor baseline with
activity and step adjustment, bounds that reject impossible values, optional AI explanation, and full
manual override before anything is saved.

**Adherence & progress** — a monthly calendar where each day's completion is shown by how full its
circle is (no percentage text inside), day detail sheets, streaks, and 7D/30D/3M/6M/1Y charts for
weight, calories, protein, steps, adherence and training volume.

**Settings** — profile, theme, step goal, rest days, diet tolerance, meal configuration, AI insights,
JSON export of everything and CSV exports for food logs, weight and workout history.

---

## Troubleshooting

**"AI service temporarily unavailable"** — no Gemini key is configured, all keys are cooling down
after rate limits, or the function is not deployed. Check `supabase functions logs ai`. Manual entry
always works regardless.

**Sign-in does nothing** — `VITE_SUPABASE_*` are missing or wrong; the app falls back to demo mode.
Confirm the values are set in your host's environment and that you redeployed after adding them.

**Rows do not save when signed in** — the migration was not applied, so RLS has no policy. Re-run
`supabase/migrations/0001_init.sql`.

**The camera does nothing** — the browser needs HTTPS (or localhost) for camera access, and the
permission must be granted. Use the Gallery button otherwise.

**Nothing changes after deploying** — the service worker serves the cached shell first; it updates
automatically on the next launch, or pull-to-refresh twice.

**Demo data on a real account** — demo mode is per-device and separate; sign out and sign in to work
against Supabase.

## Limitations

- Step counts are entered manually or imported. Android exposes no browser API for Samsung Health,
  and FORGE deliberately does not depend on a proprietary native integration.
- AI nutrition and physique output are estimates from a language model. They are labelled as such,
  bounded by the app's own arithmetic, and always require your confirmation.
- Physique photos are device-local by design, so they do not follow you to another device.
