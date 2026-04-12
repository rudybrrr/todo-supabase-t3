alter table public.todos
    add column if not exists assignee_user_id uuid references public.profiles(id) on delete set null,
    add column if not exists position integer not null default 0;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'todos_position_nonnegative'
    ) then
        alter table public.todos
            add constraint todos_position_nonnegative
            check (position >= 0);
    end if;
end
$$;

with ranked_todos as (
    select
        id,
        row_number() over (
            partition by list_id, section_id
            order by inserted_at, id
        ) - 1 as next_position
    from public.todos
)
update public.todos
set position = ranked_todos.next_position
from ranked_todos
where ranked_todos.id = public.todos.id
  and public.todos.position is distinct from ranked_todos.next_position;

create or replace function public.validate_todo_assignee_membership()
returns trigger
language plpgsql
as $$
begin
    if new.assignee_user_id is null then
        return new;
    end if;

    if not exists (
        select 1
        from public.todo_list_members
        where list_id = new.list_id
          and user_id = new.assignee_user_id
    ) then
        raise exception 'Assignee % is not a member of list %', new.assignee_user_id, new.list_id;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_validate_todo_assignee_membership on public.todos;
create trigger trg_validate_todo_assignee_membership
before insert or update of list_id, assignee_user_id on public.todos
for each row
execute function public.validate_todo_assignee_membership();

create index if not exists idx_todos_list_id_section_id_position
    on public.todos (list_id, section_id, position, inserted_at);

create index if not exists idx_todos_list_id_assignee_user_id
    on public.todos (list_id, assignee_user_id)
    where assignee_user_id is not null;
