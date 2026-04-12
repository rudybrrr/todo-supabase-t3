-- Task steps v1
-- Adds simple checklist-style steps attached to tasks.

create table if not exists public.todo_steps (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.todos(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  position integer not null default 0,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todo_steps_title_not_blank
    check (btrim(title) <> ''),
  constraint todo_steps_position_nonnegative
    check (position >= 0)
);

create or replace function public.set_todo_steps_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_todo_steps_updated_at on public.todo_steps;
create trigger trg_todo_steps_updated_at
before update on public.todo_steps
for each row
execute function public.set_todo_steps_updated_at();

alter table public.todo_steps enable row level security;

drop policy if exists "Users can view task steps in shared lists" on public.todo_steps;
create policy "Users can view task steps in shared lists"
on public.todo_steps
for select
to authenticated
using (
  exists (
    select 1
    from public.todos
    where todos.id = todo_id
      and public.is_list_member(todos.list_id)
  )
);

drop policy if exists "Users can insert task steps in shared lists" on public.todo_steps;
create policy "Users can insert task steps in shared lists"
on public.todo_steps
for insert
to authenticated
with check (
  exists (
    select 1
    from public.todos
    where todos.id = todo_id
      and public.is_list_member(todos.list_id)
  )
);

drop policy if exists "Users can update task steps in shared lists" on public.todo_steps;
create policy "Users can update task steps in shared lists"
on public.todo_steps
for update
to authenticated
using (
  exists (
    select 1
    from public.todos
    where todos.id = todo_id
      and public.is_list_member(todos.list_id)
  )
)
with check (
  exists (
    select 1
    from public.todos
    where todos.id = todo_id
      and public.is_list_member(todos.list_id)
  )
);

drop policy if exists "Users can delete task steps in shared lists" on public.todo_steps;
create policy "Users can delete task steps in shared lists"
on public.todo_steps
for delete
to authenticated
using (
  exists (
    select 1
    from public.todos
    where todos.id = todo_id
      and public.is_list_member(todos.list_id)
  )
);

create index if not exists idx_todo_steps_todo_id_position
  on public.todo_steps (todo_id, position, inserted_at);

do $$
begin
  alter publication supabase_realtime add table public.todo_steps;
exception
  when duplicate_object then null;
end;
$$;

alter table public.todo_steps replica identity full;
