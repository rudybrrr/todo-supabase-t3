create table if not exists public.task_saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  smart_view text not null default 'today',
  list_id uuid references public.todo_lists(id) on delete set null,
  priority_filter text not null default 'all',
  planning_status_filter text not null default 'all',
  deadline_scope text not null default 'all',
  label_ids uuid[] not null default '{}',
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_saved_views_name_not_blank check (length(btrim(name)) > 0),
  constraint task_saved_views_smart_view_valid check (smart_view in ('today', 'upcoming', 'inbox', 'done')),
  constraint task_saved_views_priority_filter_valid check (priority_filter in ('all', 'none', 'high', 'medium', 'low')),
  constraint task_saved_views_planning_status_filter_valid check (planning_status_filter in ('all', 'unplanned', 'partially_planned', 'fully_planned', 'overplanned')),
  constraint task_saved_views_deadline_scope_valid check (deadline_scope in ('all', 'overdue', 'today', 'due_soon', 'no_deadline'))
);

create index if not exists idx_task_saved_views_user_id
  on public.task_saved_views (user_id, updated_at desc);

create index if not exists idx_task_saved_views_label_ids
  on public.task_saved_views
  using gin (label_ids);

create or replace function public.set_task_saved_views_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_task_saved_views_updated_at on public.task_saved_views;
create trigger trg_task_saved_views_updated_at
before update on public.task_saved_views
for each row
execute function public.set_task_saved_views_updated_at();

alter table public.task_saved_views enable row level security;

drop policy if exists "Users can view own task saved views" on public.task_saved_views;
create policy "Users can view own task saved views"
on public.task_saved_views
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own task saved views" on public.task_saved_views;
create policy "Users can insert own task saved views"
on public.task_saved_views
for insert
to authenticated
with check (
  auth.uid() = user_id
  and (list_id is null or public.is_list_member(list_id))
  and not exists (
    select 1
    from unnest(label_ids) as label_id
    left join public.task_labels labels
      on labels.id = label_id
    where labels.id is null or labels.user_id <> auth.uid()
  )
);

drop policy if exists "Users can update own task saved views" on public.task_saved_views;
create policy "Users can update own task saved views"
on public.task_saved_views
for update
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and (list_id is null or public.is_list_member(list_id))
  and not exists (
    select 1
    from unnest(label_ids) as label_id
    left join public.task_labels labels
      on labels.id = label_id
    where labels.id is null or labels.user_id <> auth.uid()
  )
);

drop policy if exists "Users can delete own task saved views" on public.task_saved_views;
create policy "Users can delete own task saved views"
on public.task_saved_views
for delete
to authenticated
using (auth.uid() = user_id);
