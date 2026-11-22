-- The user's training limits (injuries, conditions, dislikes), told once and used by every AI plan, revision and swap.
alter table public.settings add column if not exists training_notes text check (char_length(training_notes) <= 1200);
update public.settings s set training_notes = p.brief
  from (select distinct on (user_id) user_id, brief from public.workout_plans where brief is not null order by user_id, updated_at desc) p
  where s.user_id = p.user_id and s.training_notes is null;
