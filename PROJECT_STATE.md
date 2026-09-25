# FORGE v2 — PROJECT STATE

## CURRENT OBJECTIVE
Ship FORGE v2: new Stitch "Ember" design, per-user encrypted Gemini keys (2–5), SmiTriX feature
parity (reimplemented, no AGPL code copied), competitor features, every-state Indian food DB with
real serving sizes, AI abuse guards, Capacitor APK + iOS project, landing site on Vercel
(forgefit-india.vercel.app — forgefitness.app is owned by someone else), GitHub push, portfolio link.

## DECISIONS
- Domain: free Vercel subdomain (user said "change name"; forgefitness.app registered by a third party since 2018).
- App: Capacitor native shell (bundled assets, native camera) — replaces the old TWA.
- iOS: PWA "Add to Home Screen" + generated Xcode project (no Apple dev account).
- AI moves to Vercel function `api/ai.ts`; per-user keys AES-256-GCM encrypted with server secret
  `FORGE_KEY_SECRET`; row stored under RLS; server reads it with the caller's JWT (no service-role key).
- Stitch project 14736699563082618847, design system assets/3503674894253681249 ("FORGE Ember"):
  bg #0E0D0C, card #171514, raised #221F1D, ember #FF6B2C, lime #C8F560 (done), blue #7AA7FF (protein),
  Bricolage Grotesque / Inter / JetBrains Mono. Screens in design/v2/.
- SmiTriX is AGPL-3.0: features reimplemented from its README, no code copied. Exercise metadata from
  hasaneyldrm/exercises-dataset (MIT metadata only, no GIFs — media rights disputed).

## STATUS / TODO — see TODO.md

## IMPORTANT FILES
src/lib/{types,calc,db,ai,catalog}.ts, src/store.tsx, supabase/migrations/, api/ (Vercel functions)

## BLOCKERS
- Supabase project jdogjpskctrpjtuygmdx restoring (2026-09-25). Supabase MCP added at user scope; needs
  one-time OAuth via /mcp in an interactive `claude` terminal.
