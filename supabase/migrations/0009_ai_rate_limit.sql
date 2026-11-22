-- FORGE: atomic AI rate limit. One call records the request and checks the limits in the same transaction,
-- serialised per user with an advisory lock, so parallel requests cannot all slip under the limit.
-- Requests on FORGE's shared key pool are also counted against a global hourly pace and daily cap across all users.
-- The numbers come from the measured Flash-Lite quota and scripts/simulate-shared-pool.mjs.
alter table public.ai_usage add column if not exists shared boolean not null default false;
create index if not exists ai_usage_shared_time on public.ai_usage (created_at) where shared;

-- Users may still insert their own rows (older app builds do), but never mark one as shared:
-- only ai_take() can, so nobody can burn the shared daily cap by inserting rows directly.
drop policy if exists ai_usage_insert on public.ai_usage;
create policy ai_usage_insert on public.ai_usage for insert to authenticated
  with check (user_id = (select auth.uid()) and shared = false);

-- A user is on the shared pool exactly when they have no saved keys; the database decides, not the caller.
drop function if exists public.ai_take(text, int);
create or replace function public.ai_take(p_task text, p_global_cap int default 0, p_global_hour_cap int default 0)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid();
  p_shared boolean;
  per_min int; per_hour int; per_day int;
  n_min int; n_hour int; n_day int; n_all int; n_all_hour int;
begin
  if uid is null then raise exception 'not signed in'; end if;
  p_shared := not exists (select 1 from public.user_ai_keys where user_id = uid);
  -- Shared pool: one person can't take more than a fair slice (20 users at their daily limit still fit the pool).
  per_min := case when p_shared then 6 else 12 end;
  per_hour := case when p_shared then 20 else 120 end;
  per_day := case when p_shared then 60 else 400 end;
  if char_length(coalesce(p_task, '')) not between 1 and 40 then raise exception 'bad task'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));
  select count(*) filter (where created_at > now() - interval '1 minute'),
         count(*) filter (where created_at > now() - interval '1 hour'), count(*)
    into n_min, n_hour, n_day from public.ai_usage where user_id = uid and created_at > now() - interval '1 day';
  if n_min >= per_min then return jsonb_build_object('ok', false, 'reason', 'minute', 'shared', p_shared); end if;
  if n_hour >= per_hour then return jsonb_build_object('ok', false, 'reason', 'hour', 'shared', p_shared); end if;
  if n_day >= per_day then return jsonb_build_object('ok', false, 'reason', 'day', 'shared', p_shared); end if;
  if p_shared and (p_global_cap > 0 or p_global_hour_cap > 0) then
    perform pg_advisory_xact_lock(7340501);  -- one lock for the shared pool's global counters
    select count(*), count(*) filter (where created_at > now() - interval '1 hour') into n_all, n_all_hour
      from public.ai_usage where shared and created_at > now() - interval '1 day';
    if p_global_cap > 0 and n_all >= p_global_cap then return jsonb_build_object('ok', false, 'reason', 'global', 'shared', p_shared); end if;
    if p_global_hour_cap > 0 and n_all_hour >= p_global_hour_cap then return jsonb_build_object('ok', false, 'reason', 'global', 'shared', p_shared); end if;
  end if;
  insert into public.ai_usage (user_id, task, shared) values (uid, p_task, p_shared);
  return jsonb_build_object('ok', true, 'shared', p_shared, 'minute', n_min + 1, 'day', n_day + 1);
end $$;
revoke all on function public.ai_take(text, int, int) from public, anon;
grant execute on function public.ai_take(text, int, int) to authenticated;

