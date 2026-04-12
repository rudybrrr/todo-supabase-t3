create table if not exists public.planner_saved_filters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  list_id uuid references public.todo_lists(id) on delete set null,
  planning_status_filter text not null default 'all',
  deadline_scope text not null default 'all',
  default_view text not null default 'week',
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planner_saved_filters_name_not_blank check (length(btrim(name)) > 0),
  constraint planner_saved_filters_planning_status_filter_valid check (planning_status_filter in ('all', 'unplanned', 'partially_planned', 'fully_planned', 'overplanned')),
  constraint planner_saved_filters_deadline_scope_valid check (deadline_scope in ('all', 'overdue', 'today', 'due_soon', 'no_deadline')),
  constraint planner_saved_filters_default_view_valid check (default_view in ('day', 'week', 'month'))
);

create index if not exists idx_planner_saved_filters_user_id
  on public.planner_saved_filters (user_id, updated_at desc);

create or replace function public.set_planner_saved_filters_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_planner_saved_filters_updated_at on public.planner_saved_filters;
create trigger trg_planner_saved_filters_updated_at
before update on public.planner_saved_filters
for each row
execute function public.set_planner_saved_filters_updated_at();

alter table public.planner_saved_filters enable row level security;

drop policy if exists "Users can view own planner saved filters" on public.planner_saved_filters;
create policy "Users can view own planner saved filters"
on public.planner_saved_filters
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own planner saved filters" on public.planner_saved_filters;
create policy "Users can insert own planner saved filters"
on public.planner_saved_filters
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (list_id is null or public.is_list_member(list_id))
);

drop policy if exists "Users can update own planner saved filters" on public.planner_saved_filters;
create policy "Users can update own planner saved filters"
on public.planner_saved_filters
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (list_id is null or public.is_list_member(list_id))
);

drop policy if exists "Users can delete own planner saved filters" on public.planner_saved_filters;
create policy "Users can delete own planner saved filters"
on public.planner_saved_filters
for delete
to authenticated
using (auth.uid() = user_id);
