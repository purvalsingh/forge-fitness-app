# FORGE

**Train hard. Eat Indian. Track everything.**
Fitness and Indian nutrition app for Android, iPhone and the web.

- **Site & download:** https://forgefit-india.vercel.app
- **Web app:** https://forgefit-india.vercel.app/app/
- **Android APK:** https://forgefit-india.vercel.app/download/forge.apk (signed; SHA-256 on the site)
- **iPhone:** open the web app in Safari → Share → *Add to Home Screen*. An App Store build needs an
  Apple Developer account; the Xcode project is in `ios/`.

## What's in it

**Food:** 16,365 foods. That includes 736 dishes calculated from their ingredients, covering all
28 states and 8 union territories, plus 829 Indian Nutrient Databank recipes, USDA data and Open
Food Facts. Dishes log as they're eaten ("1 piece ≈ 150 g", "1 katori"), not per 100 g. Other food
features: AI food camera and "describe your meal" (with abuse guards and database grounding),
barcode scanning, quick meals, copy yesterday's meal, water, and a fasting timer.

**Training:** 1,324-exercise library (English + Hindi instructions), plans and freestyle sessions,
linear/double progression with auto-deload, plate math, estimated 1RM, RIR/RPE, warm-up sets,
supersets, timed and cardio sets, PR detection, rest timer with flash/vibrate, screen wake lock,
back-filling past workouts, a year heatmap, a muscle map, and Strong/Hevy CSV import.

**Days work like real life:** the day ends at 4 AM (configurable), and you can log to yesterday
or any other date in one tap.

**Accounts:** name, email and password, plus 2–5 of your own Gemini API keys. The keys are encrypted
server-side (AES-256-GCM), never shown again, and rotated when a quota runs out. AI calls are rate
limited per user.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173/app/  (no credentials → offline demo mode)
npm test             # calc, AI guard, training maths, importers
npm run build        # dist/ = landing + /app + /download
npm run apk          # signed release APK → release/forge.apk (needs JDK 21 + Android SDK)
npm run deploy       # Vercel production deploy
```

Server environment (Vercel): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `FORGE_KEY_SECRET` (32 random
bytes, base64). Database: run `supabase/migrations/0001_init.sql` then `0002_v2.sql`.
Architecture and rules: [CLAUDE.md](CLAUDE.md).

## Data & credits

USDA FoodData Central (public domain) · Indian Nutrient Databank, Vijayakumar A. et al., *Curr Dev
Nutr* 2024 · Open Food Facts (ODbL) · exercise names and instructions from
[hasaneyldrm/exercises-dataset](https://github.com/hasaneyldrm/exercises-dataset) (MIT; no third-party
media is shipped). Feature ideas were inspired by [SmiTriX](https://github.com/SmitroniX/SmiTriX)
and were reimplemented here; none of its code was copied.

FORGE is not medical advice.
