-- Execution-first redesign metadata additions

alter table public.todo_lists
add column if not exists color_token text not null default 'cobalt';

alter table public.todo_lists
add column if not exists icon_token text not null default 'book-open';

alter table public.todos
add column if not exists estimated_minutes integer;

alter table public.todos
add column if not exists completed_at timestamptz;

alter table public.todos
drop constraint if exists todos_estimated_minutes_positive;

alter table public.todos
add constraint todos_estimated_minutes_positive
check (estimated_minutes is null or estimated_minutes > 0);

update public.todos
set completed_at = coalesce(completed_at, updated_at, inserted_at)
where is_done = true
  and completed_at is null;
