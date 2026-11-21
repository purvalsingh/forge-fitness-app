-- Opt-in "help improve FORGE": a user can let the app owner study their data, anonymised.
-- Default off. RLS still keeps every user's rows private from every other user; these views live in a
-- schema the API does not expose, so only the project owner (dashboard / service role) can read them.
alter table settings add column if not exists share_data boolean not null default false;

create schema if not exists insights;
revoke all on schema insights from public, anon, authenticated;

create or replace view insights.sharing_users as
  select user_id, md5(user_id::text) as anon_id from settings where share_data;

create or replace view insights.food_logs as
  select u.anon_id, f.date, f.meal_type_id, f.name, f.qty, f.unit, f.serving_label, f.calories, f.protein_g, f.carbs_g, f.fat_g, f.source
  from food_logs f join insights.sharing_users u using (user_id);

create or replace view insights.workout_sessions as
  select u.anon_id, w.date, w.day_name, w.started_at, w.finished_at, w.exercises, w.freestyle
  from workout_sessions w join insights.sharing_users u using (user_id);

create or replace view insights.workout_plans as
  select u.anon_id, p.name, p.active, p.focus, p.days_per_week, p.source, p.days from workout_plans p join insights.sharing_users u using (user_id);

create or replace view insights.weight_logs as
  select u.anon_id, x.date, x.weight_kg from weight_logs x join insights.sharing_users u using (user_id);

create or replace view insights.ai_usage as
  select u.anon_id, a.task, a.created_at from ai_usage a join insights.sharing_users u using (user_id);
