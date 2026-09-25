-- FORGE v2: per-user encrypted Gemini keys, AI rate limiting, water, custom exercises, new settings.
-- Idempotent: safe to run more than once.

-- ---- Settings added in v2 ------------------------------------------------------------------
alter table settings add column if not exists day_start_hour int not null default 4 check (day_start_hour between 0 and 12);
alter table settings add column if not exists water_goal_ml int not null default 2500 check (water_goal_ml between 0 and 10000);
alter table settings add column if not exists week_start int not null default 1 check (week_start in (0, 1));
alter table settings add column if not exists units text not null default 'kg' check (units in ('kg', 'lb'));
alter table settings add column if not exists bar_weight_kg numeric not null default 20 check (bar_weight_kg between 0 and 50);
alter table settings add column if not exists default_rest_sec int not null default 120 check (default_rest_sec between 0 and 900);
alter table settings add column if not exists effort_scale text not null default 'off' check (effort_scale in ('off', 'rir', 'rpe'));
alter table settings add column if not exists keep_awake boolean not null default true;
alter table settings add column if not exists timer_flash boolean not null default false;
alter table settings add column if not exists fasting_hours int not null default 16 check (fasting_hours between 0 and 72);
alter table settings add column if not exists fasting_started_at timestamptz;

alter table workout_plans add column if not exists deload boolean not null default false;
alter table workout_plans add column if not exists progression text;

alter table workout_sessions add column if not exists backfilled boolean not null default false;
alter table workout_sessions add column if not exists freestyle boolean not null default false;
alter table workout_sessions add column if not exists bodyweight_kg numeric;
alter table workout_sessions add column if not exists deload boolean not null default false;
alter table workout_sessions add column if not exists note text check (char_length(note) <= 2000);

alter table food_logs add column if not exists serving_label text check (char_length(serving_label) <= 40);
alter table foods add column if not exists serving_label text check (char_length(serving_label) <= 40);
alter table foods add column if not exists state text check (char_length(state) <= 60);

-- ---- New tables ------------------------------------------------------------------------------
create table if not exists water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  ml int not null check (ml between 1 and 5000),
  at timestamptz not null default now()
);
create index if not exists water_logs_user_date on water_logs (user_id, date);

create table if not exists exercises (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  muscle text,
  secondary jsonb,
  body_part text,
  equipment text,
  instructions jsonb,
  kind text check (kind in ('weight_reps', 'bodyweight_reps', 'timed', 'cardio')),
  per_side boolean,
  custom boolean,
  favorite boolean,
  rest_sec int check (rest_sec between 0 and 900),
  bar_kg numeric check (bar_kg between 0 and 50),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

do $$
declare t text;
begin
  foreach t in array array['water_logs', 'exercises']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format(
      'create policy %I on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t);
  end loop;
end $$;

-- ---- Per-user Gemini keys -------------------------------------------------------------------
-- The keys are AES-256-GCM encrypted by the server (api/keys) with a secret that exists only in the
-- server environment. The database never sees a plaintext key, and neither does the browser after
-- saving: the client can read only the hints (last 4 characters).
create table if not exists user_ai_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ciphertext text not null check (char_length(ciphertext) < 8000),
  hints jsonb not null default '[]',
  key_count int not null check (key_count between 2 and 5),
  updated_at timestamptz not null default now()
);
alter table user_ai_keys enable row level security;
drop policy if exists user_ai_keys_owner on user_ai_keys;
create policy user_ai_keys_owner on user_ai_keys for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- AI rate limiting -------------------------------------------------------------------------
-- Insert-only for the owner (no update/delete policy), so a user cannot erase their own history to
-- dodge the limit. The server counts rows in the last minute/day before every AI call.
create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  task text not null check (char_length(task) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_user_time on ai_usage (user_id, created_at desc);
alter table ai_usage enable row level security;
drop policy if exists ai_usage_select on ai_usage;
drop policy if exists ai_usage_insert on ai_usage;
create policy ai_usage_select on ai_usage for select to authenticated using (user_id = auth.uid());
create policy ai_usage_insert on ai_usage for insert to authenticated with check (user_id = auth.uid());

-- Old rows are pruned by the owner's own inserts staying small; a periodic job is not required.

-- ---- Signup: store the name the user typed -----------------------------------------------------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, user_id, display_name)
  values (new.id, new.id, left(coalesce(new.raw_user_meta_data->>'display_name', ''), 60))
  on conflict (id) do nothing;
  return new;
end $$;
