# FORGE v2 — PROJECT STATE

## CURRENT OBJECTIVE
FORGE v2 shipped 2026-09-25: Ember redesign, Capacitor APK, per-user encrypted Gemini keys, every-state
Indian food DB, AI abuse guards, SmiTriX-style training features, landing site on Vercel.

## STATUS
LIVE — https://forgefit-india.vercel.app (landing), /app (web app), /download/forge.apk (v2.0.0, code 4).
GitHub: purvalsingh/forge-fitness-app (public) + release v2.0.0. Portfolio card updated.

## DECISIONS
- Domain: forgefit-india.vercel.app. forgefitness.app is owned by a third party (Namecheap, since 2018) and
  forgefit.vercel.app belongs to another Vercel team. Vercel project name: "forgefit" (also forgefit-one.vercel.app).
- Native: Capacitor 8, package app.forge.fitness, signed with the old TWA key (installs as an update).
  Key + password + FORGE_KEY_SECRET backup: ~/.forge-signing (NOT in repo). JDK 21: ~/.local/jdk-21.
  Android SDK: ~/.bubblewrap/android_sdk.
- iOS: PWA install + ios/ Xcode project (needs a Mac + an Apple Developer account for a real build).
- AI: api/ai.ts on Vercel, per-user keys (2–5) AES-256-GCM, bound to user id, rate limit 12/min, 400/day.
  Models: gemini-3.6-flash → gemini-flash-latest → gemini-flash-lite-latest.
- Supabase reached via the /sb rewrite (supabase.co DNS is blocked on the dev machine's ISP, and on Jio).
  Auth: autoconfirm ON; Site URL = https://forgefit-india.vercel.app/app/ ; redirect https://forgefit-india.vercel.app/**
- Migrations 0001 + 0002 applied (via the dashboard SQL editor, 2026-09-25).
- Supabase MCP added at user scope; needs one OAuth via /mcp in an interactive `claude` terminal.

## NOT VERIFIED
- Live AI calls: nobody has signed up with real Gemini keys yet (the assistant must not create accounts or enter keys).
- The APK hasn't been installed on a physical phone yet (no device on adb).

## NEXT ACTION
User: install the APK, sign up with 2+ Gemini keys, and test the food camera and describe-meal. Report issues.
Possible next steps: Play Store listing, native camera plugin, native local notifications for the rest timer.

## IMPORTANT FILES
api/{ai,keys}.ts, api/_lib/guard.ts, src/lib/{catalog,training,exercises}.ts, src/screens/{Today,AddFood,Camera,Session}.tsx,
scripts/{indian-states,rebuild-catalog,assemble,build-apk}.mjs, site/, vercel.json, capacitor.config.ts

## LAST VALIDATION (2026-09-25)
tsc clean · 57 vitest tests pass · live smoke: landing/app/deep links 200, /api/* 401 unauthenticated,
/sb health 200, APK served with the Android MIME type and a matching SHA-256 · demo-mode walkthrough in the browser
(log food by serving, browse by state, live session with a rest timer).
