create table if not exists public.progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  history jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  bookmarks text[] not null default '{}',
  streak_days integer not null default 0 check (streak_days >= 0),
  last_activity_date date,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

create policy "Users can read their own progress"
  on public.progress for select
  using ((select auth.uid()) = user_id);

create policy "Users can create their own progress"
  on public.progress for insert
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own progress"
  on public.progress for update
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own progress"
  on public.progress for delete
  using ((select auth.uid()) = user_id);

create or replace function public.set_progress_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists progress_updated_at on public.progress;
create trigger progress_updated_at
before update on public.progress
for each row execute function public.set_progress_updated_at();
