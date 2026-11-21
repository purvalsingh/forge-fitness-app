-- 0003: per-user training/coach preferences (all optional; the app's defaults apply when null).
alter table public.settings add column if not exists coach jsonb;
comment on column public.settings.coach is 'Training/coach preferences (target RPE, max jump, increments, warm-up ramp, deload rules, coach mode, AI reliability check result). Nullable; app defaults apply when null.';
