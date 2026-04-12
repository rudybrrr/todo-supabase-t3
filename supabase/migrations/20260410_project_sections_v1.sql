-- Project sections v1
-- Adds lightweight sections within projects and lets tasks optionally belong to one section.

create table if not exists public.todo_sections (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.todo_lists(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint todo_sections_name_not_blank
    check (btrim(name) <> ''),
  constraint todo_sections_position_nonnegative
    check (position >= 0)
);

create or replace function public.set_todo_sections_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_todo_sections_updated_at on public.todo_sections;
create trigger trg_todo_sections_updated_at
before update on public.todo_sections
for each row
execute function public.set_todo_sections_updated_at();

alter table public.todos
add column if not exists section_id uuid references public.todo_sections(id) on delete set null;

create or replace function public.validate_todo_section_assignment()
returns trigger
language plpgsql
as $$
declare
  section_list_id uuid;
begin
  if new.section_id is null then
    return new;
  end if;

  select list_id
  into section_list_id
  from public.todo_sections
  where id = new.section_id;

  if section_list_id is null then
    raise exception 'Section % does not exist', new.section_id;
  end if;

  if section_list_id <> new.list_id then
    raise exception 'Section % does not belong to list %', new.section_id, new.list_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_todo_section_assignment on public.todos;
create trigger trg_validate_todo_section_assignment
before insert or update of list_id, section_id on public.todos
for each row
execute function public.validate_todo_section_assignment();

create index if not exists idx_todo_sections_list_id_position
  on public.todo_sections (list_id, position, inserted_at);

create index if not exists idx_todos_list_id_section_id
  on public.todos (list_id, section_id);

alter table public.todo_sections enable row level security;

drop policy if exists "Users can view sections in shared lists" on public.todo_sections;
create policy "Users can view sections in shared lists"
on public.todo_sections
for select
to authenticated
using (
  public.is_list_member(list_id)
);

drop policy if exists "Users can insert sections in shared lists" on public.todo_sections;
create policy "Users can insert sections in shared lists"
on public.todo_sections
for insert
to authenticated
with check (
  public.is_list_member(list_id)
);

drop policy if exists "Users can update sections in shared lists" on public.todo_sections;
create policy "Users can update sections in shared lists"
on public.todo_sections
for update
to authenticated
using (
  public.is_list_member(list_id)
)
with check (
  public.is_list_member(list_id)
);

drop policy if exists "Users can delete sections in shared lists" on public.todo_sections;
create policy "Users can delete sections in shared lists"
on public.todo_sections
for delete
to authenticated
using (
  public.is_list_member(list_id)
);

do $$
begin
  alter publication supabase_realtime add table public.todo_sections;
exception
  when duplicate_object then null;
end;
$$;

alter table public.todo_sections replica identity full;
alter table public.todos replica identity full;
