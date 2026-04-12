-- Planning Hub v1
-- Adds per-user daily focus goals and persisted planned focus blocks.

alter table public.profiles
add column if not exists daily_focus_goal_minutes integer not null default 120;

alter table public.profiles
drop constraint if exists profiles_daily_focus_goal_minutes_positive;

alter table public.profiles
add constraint profiles_daily_focus_goal_minutes_positive
check (daily_focus_goal_minutes > 0);

create table if not exists public.planned_focus_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid not null references public.todo_lists(id) on delete cascade,
  todo_id uuid references public.todos(id) on delete set null,
  title text not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_focus_blocks_time_order
    check (scheduled_end > scheduled_start)
);

create or replace function public.set_planned_focus_blocks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_planned_focus_blocks_updated_at on public.planned_focus_blocks;
create trigger trg_planned_focus_blocks_updated_at
before update on public.planned_focus_blocks
for each row
execute function public.set_planned_focus_blocks_updated_at();

alter table public.planned_focus_blocks enable row level security;

drop policy if exists "Users can view own planned focus blocks" on public.planned_focus_blocks;
create policy "Users can view own planned focus blocks"
on public.planned_focus_blocks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own planned focus blocks" on public.planned_focus_blocks;
create policy "Users can insert own planned focus blocks"
on public.planned_focus_blocks
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_list_member(list_id)
);

drop policy if exists "Users can update own planned focus blocks" on public.planned_focus_blocks;
create policy "Users can update own planned focus blocks"
on public.planned_focus_blocks
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and public.is_list_member(list_id)
);

drop policy if exists "Users can delete own planned focus blocks" on public.planned_focus_blocks;
create policy "Users can delete own planned focus blocks"
on public.planned_focus_blocks
for delete
to authenticated
using (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.planned_focus_blocks;
exception
  when duplicate_object then null;
end;
$$;

alter table public.planned_focus_blocks replica identity full;
