-- Deadline and planning reliability foundation
-- Adds timezone support and separates date-only deadlines from timed deadlines.

alter table public.profiles
add column if not exists timezone text not null default 'UTC';

alter table public.todos
add column if not exists deadline_on date;

alter table public.todos
add column if not exists deadline_at timestamptz;

alter table public.todos
drop constraint if exists todos_single_deadline_shape;

alter table public.todos
add constraint todos_single_deadline_shape
check (num_nonnulls(deadline_on, deadline_at) <= 1);

update public.todos
set deadline_on = coalesce(deadline_on, timezone('UTC', due_date)::date)
where deadline_on is null
  and deadline_at is null
  and due_date is not null;

create index if not exists idx_todos_list_done_deadline_on
  on public.todos (list_id, is_done, deadline_on);

create index if not exists idx_todos_user_done_deadline_on
  on public.todos (user_id, is_done, deadline_on);

create index if not exists idx_todos_list_done_deadline_at
  on public.todos (list_id, is_done, deadline_at);

create index if not exists idx_todos_user_done_deadline_at
  on public.todos (user_id, is_done, deadline_at);
