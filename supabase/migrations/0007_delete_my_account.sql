-- Account deletion with a 15-day grace period.
-- delete_my_account() only SCHEDULES deletion. Signing in within 15 days shows a "Restore my account" choice
-- (restore_my_account()). After 15 days a daily job removes the auth user; every user table references
-- auth.users with ON DELETE CASCADE, so all of their rows go with it.
-- Security definer: callers cannot touch auth.users or this table directly.

create table if not exists public.account_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now()
);
alter table public.account_deletions enable row level security; -- no policies: only the functions below read or write it

create or replace function public.delete_my_account() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare purge_at timestamptz;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.account_deletions (user_id) values (auth.uid())
    on conflict (user_id) do nothing;
  select requested_at + interval '15 days' into purge_at from public.account_deletions where user_id = auth.uid();
  return purge_at;
end $$;

-- When the account will be deleted, or null if it isn't scheduled.
create or replace function public.account_deletion_status() returns timestamptz
language sql security definer set search_path = '' stable as $$
  select requested_at + interval '15 days' from public.account_deletions where user_id = auth.uid()
$$;

create or replace function public.restore_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.account_deletions where user_id = auth.uid();
end $$;

-- Removes accounts whose 15 days are up. Run daily by pg_cron below; not callable by app users.
create or replace function public.purge_deleted_accounts() returns integer
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  delete from auth.users where id in (
    select user_id from public.account_deletions where requested_at < now() - interval '15 days');
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.delete_my_account() from public, anon;
revoke all on function public.account_deletion_status() from public, anon;
revoke all on function public.restore_my_account() from public, anon;
revoke all on function public.purge_deleted_accounts() from public, anon, authenticated;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.account_deletion_status() to authenticated;
grant execute on function public.restore_my_account() to authenticated;

-- Daily purge at 03:17 UTC.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'forge-purge-deleted-accounts';
select cron.schedule('forge-purge-deleted-accounts', '17 3 * * *', 'select public.purge_deleted_accounts()');
