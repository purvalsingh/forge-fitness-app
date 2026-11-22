-- Audit round 5 hardening: internal helper functions are not callable by app users, and the trigger function has a fixed search_path.
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.forge_touch_updated_at() from anon, authenticated, public;
alter function public.forge_touch_updated_at() set search_path = '';
do $$ begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from anon, authenticated, public';
  end if;
end $$;
