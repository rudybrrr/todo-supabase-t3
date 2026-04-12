create table if not exists public.task_labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color_token text not null default 'slate',
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_labels_name_not_blank check (length(btrim(name)) > 0),
  constraint task_labels_color_token_valid check (color_token in ('cobalt', 'emerald', 'amber', 'rose', 'violet', 'slate'))
);

create unique index if not exists idx_task_labels_user_name_unique
  on public.task_labels (user_id, lower(name));

create index if not exists idx_task_labels_user_id
  on public.task_labels (user_id, updated_at desc);

create or replace function public.set_task_labels_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_task_labels_updated_at on public.task_labels;
create trigger trg_task_labels_updated_at
before update on public.task_labels
for each row
execute function public.set_task_labels_updated_at();

create table if not exists public.todo_label_links (
  todo_id uuid not null references public.todos(id) on delete cascade,
  label_id uuid not null references public.task_labels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  inserted_at timestamptz not null default now(),
  primary key (todo_id, label_id, user_id)
);

create index if not exists idx_todo_label_links_user_todo
  on public.todo_label_links (user_id, todo_id, inserted_at desc);

create index if not exists idx_todo_label_links_user_label
  on public.todo_label_links (user_id, label_id, inserted_at desc);

alter table public.task_labels enable row level security;
alter table public.todo_label_links enable row level security;

drop policy if exists "Users can view own task labels" on public.task_labels;
create policy "Users can view own task labels"
on public.task_labels
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own task labels" on public.task_labels;
create policy "Users can insert own task labels"
on public.task_labels
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own task labels" on public.task_labels;
create policy "Users can update own task labels"
on public.task_labels
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own task labels" on public.task_labels;
create policy "Users can delete own task labels"
on public.task_labels
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view own todo label links" on public.todo_label_links;
create policy "Users can view own todo label links"
on public.todo_label_links
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own todo label links" on public.todo_label_links;
create policy "Users can insert own todo label links"
on public.todo_label_links
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.task_labels labels
    where labels.id = label_id
      and labels.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.todos todos
    where todos.id = todo_id
      and public.is_list_member(todos.list_id)
  )
);

drop policy if exists "Users can delete own todo label links" on public.todo_label_links;
create policy "Users can delete own todo label links"
on public.todo_label_links
for delete
to authenticated
using (auth.uid() = user_id);
