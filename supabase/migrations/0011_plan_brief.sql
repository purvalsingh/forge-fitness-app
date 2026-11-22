-- What the user told FORGE when a plan was made (injuries, limits, likes). AI exercise swaps keep to it.
alter table public.workout_plans add column if not exists brief text check (char_length(brief) <= 1200);
