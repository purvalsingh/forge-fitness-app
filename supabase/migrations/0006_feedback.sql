-- In-app feedback: users can send ideas, problems and praise; only the sender (and the project owner) can read them.
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('idea','problem','praise','other')),
  message text not null check (char_length(message) between 1 and 4000),
  screen text check (char_length(screen) <= 80),
  app text check (char_length(app) <= 40)
);
alter table feedback enable row level security;
create policy feedback_insert on feedback for insert to authenticated with check (user_id = auth.uid());
create policy feedback_select on feedback for select to authenticated using (user_id = auth.uid());
