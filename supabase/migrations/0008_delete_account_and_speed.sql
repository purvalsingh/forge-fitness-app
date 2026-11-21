-- FORGE: delete-account function + database speed fixes. Safe to run more than once.
-- Paste the whole file into Supabase -> SQL Editor -> Run.

-- 1. Delete my account (the Settings button calls this). Deletes only the caller; every table cascades.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 2. Row security: check the user id once per query instead of once per row. Same rule, faster.
alter policy ai_insights_owner on public.ai_insights using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy exercises_owner on public.exercises using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy food_logs_owner on public.food_logs using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy foods_owner on public.foods using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy goals_owner on public.goals using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy meal_types_owner on public.meal_types using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy nutrition_targets_owner on public.nutrition_targets using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy physique_checkins_owner on public.physique_checkins using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy profiles_owner on public.profiles using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy recipes_owner on public.recipes using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy settings_owner on public.settings using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy step_logs_owner on public.step_logs using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy user_ai_keys_owner on public.user_ai_keys using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy water_logs_owner on public.water_logs using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy weight_logs_owner on public.weight_logs using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy workout_plans_owner on public.workout_plans using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy workout_sessions_owner on public.workout_sessions using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy ai_usage_select on public.ai_usage using (user_id = (select auth.uid()));
alter policy ai_usage_insert on public.ai_usage with check (user_id = (select auth.uid()));
alter policy feedback_select on public.feedback using (user_id = (select auth.uid()));
alter policy feedback_insert on public.feedback with check (user_id = (select auth.uid()));

-- 3. Indexes on the user link (also makes account deletion fast).
create index if not exists feedback_user_id_idx on public.feedback (user_id);
create index if not exists goals_user_id_idx on public.goals (user_id);
create index if not exists nutrition_targets_user_id_idx on public.nutrition_targets (user_id);
create index if not exists profiles_user_id_idx on public.profiles (user_id);
