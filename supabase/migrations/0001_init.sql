-- FORGE schema. Run with: supabase db push  (or paste into the SQL editor).
-- Every user-owned table carries user_id and is protected by RLS.

create extension if not exists "pgcrypto";

-- helper: owner-only policy set
create or replace function forge_touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null default '',
  sex text not null default 'male' check (sex in ('male','female')),
  age int not null default 25 check (age between 10 and 100),
  height_cm numeric not null default 175 check (height_cm between 100 and 250),
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists settings (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  step_goal int not null default 10000 check (step_goal between 0 and 100000),
  rest_days jsonb not null default '[0,6]',
  adherence_weights jsonb not null default '{"diet":0.4,"workout":0.4,"steps":0.2}',
  diet_tolerance numeric not null default 0.10 check (diet_tolerance between 0.01 and 0.5),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('cut','maintain','bulk')),
  current_weight_kg numeric not null check (current_weight_kg between 25 and 400),
  target_weight_kg numeric not null check (target_weight_kg between 25 and 400),
  activity_level text not null default 'moderate',
  avg_daily_steps int not null default 8000,
  training_days_per_week int not null default 5 check (training_days_per_week between 0 and 7),
  training_minutes int not null default 60,
  rate_kg_per_week numeric not null default 0.4,
  updated_at timestamptz not null default now()
);

create table if not exists nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calories int not null check (calories between 800 and 8000),
  protein_g int not null check (protein_g between 0 and 400),
  carbs_g int not null check (carbs_g between 0 and 1200),
  fat_g int not null check (fat_g between 0 and 400),
  source text not null default 'calculated' check (source in ('manual','calculated','ai')),
  note text,
  updated_at timestamptz not null default now()
);

create table if not exists meal_types (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  time text not null default '12:00',
  position int not null default 0,
  primary key (user_id, id)
);

-- foods: built-in rows are seeded per user on first launch; custom=true for user-created.
create table if not exists foods (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  brand text,
  category text,
  unit text not null,
  base numeric not null default 100,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric, sugar_g numeric, sodium_mg numeric,
  custom boolean not null default false,
  primary key (user_id, id)
);

-- recipe ingredients live in a jsonb column: they are always read and written as one document.
create table if not exists recipes (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  favorite boolean not null default false,
  ingredients jsonb not null default '[]',
  primary key (user_id, id)
);

create table if not exists food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  meal_type_id text not null,
  food_id text,
  name text not null,
  qty numeric not null check (qty > 0),
  unit text not null,
  calories numeric not null check (calories >= 0),
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  note text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

create table if not exists workout_plans (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  active boolean not null default false,
  focus text,
  days_per_week int,
  source text not null default 'custom',
  days jsonb not null default '[]',
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  plan_id text not null,
  day_id text not null,
  day_name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  exercises jsonb not null default '[]'
);

create table if not exists weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_kg numeric not null check (weight_kg between 25 and 400),
  unique (user_id, date)
);

create table if not exists step_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  steps int not null check (steps between 0 and 200000),
  unique (user_id, date)
);

create table if not exists ai_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('observation','adjustment')),
  text text not null,
  payload jsonb,
  dismissed boolean not null default false,
  applied boolean not null default false
);

-- Physique check-ins. Photos are NOT stored here: they stay in on-device storage.
-- This table keeps only the check-in metadata and the analysis.
create table if not exists physique_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  created_at timestamptz not null default now(),
  photo_keys jsonb not null default '{}',
  reference_key text,
  goal text not null default 'strength_aesthetics',
  priorities text not null default '',
  notes text,
  analysis jsonb,
  weight_kg numeric
);

-- Indexes for the queries the app actually runs (user + date ranges).
create index if not exists food_logs_user_date_idx on food_logs (user_id, date desc);
create index if not exists food_logs_user_meal_idx on food_logs (user_id, date, meal_type_id);
create index if not exists workout_sessions_user_date_idx on workout_sessions (user_id, date desc);
create index if not exists weight_logs_user_date_idx on weight_logs (user_id, date desc);
create index if not exists step_logs_user_date_idx on step_logs (user_id, date desc);
create index if not exists ai_insights_user_created_idx on ai_insights (user_id, created_at desc);
create index if not exists foods_user_name_idx on foods (user_id, lower(name));
create index if not exists physique_user_date_idx on physique_checkins (user_id, date desc);

-- Row Level Security: a user can only ever touch their own rows.
do $$
declare t text;
begin
  foreach t in array array['profiles','settings','goals','nutrition_targets','meal_types','foods',
                           'recipes','food_logs','workout_plans','workout_sessions','weight_logs',
                           'step_logs','ai_insights','physique_checkins']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format(
      'create policy %I on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t);
  end loop;
end $$;

-- Create the profile row automatically on signup.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, user_id, display_name)
  values (new.id, new.id, coalesce(new.raw_user_meta_data->>'display_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();
