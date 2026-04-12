create table if not exists public.todo_activity_events (
    id uuid primary key default gen_random_uuid(),
    todo_id uuid not null references public.todos(id) on delete cascade,
    list_id uuid not null references public.todo_lists(id) on delete cascade,
    actor_user_id uuid not null references public.profiles(id) on delete cascade,
    event_type text not null,
    payload jsonb,
    inserted_at timestamptz not null default now(),
    constraint todo_activity_events_event_type_valid
        check (event_type in (
            'task_created',
            'task_completed',
            'task_reopened',
            'task_moved_section',
            'task_reordered',
            'task_assigned',
            'comment_added'
        ))
);

create or replace function public.validate_todo_activity_event_list()
returns trigger
language plpgsql
as $$
declare
    task_list_id uuid;
begin
    select list_id
    into task_list_id
    from public.todos
    where id = new.todo_id;

    if task_list_id is null then
        raise exception 'Task % does not exist', new.todo_id;
    end if;

    if task_list_id <> new.list_id then
        raise exception 'Activity list % does not match task list %', new.list_id, task_list_id;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_validate_todo_activity_event_list on public.todo_activity_events;
create trigger trg_validate_todo_activity_event_list
before insert or update of todo_id, list_id on public.todo_activity_events
for each row
execute function public.validate_todo_activity_event_list();

create index if not exists idx_todo_activity_events_todo_id_inserted_at_desc
    on public.todo_activity_events (todo_id, inserted_at desc);

create index if not exists idx_todo_activity_events_list_id_inserted_at_desc
    on public.todo_activity_events (list_id, inserted_at desc);

alter table public.todo_activity_events enable row level security;

drop policy if exists "Users can view task activity in shared lists" on public.todo_activity_events;
create policy "Users can view task activity in shared lists"
on public.todo_activity_events
for select
to authenticated
using (
    public.is_list_member(list_id)
);

drop policy if exists "Users can insert task activity in shared lists" on public.todo_activity_events;
create policy "Users can insert task activity in shared lists"
on public.todo_activity_events
for insert
to authenticated
with check (
    auth.uid() = actor_user_id
    and public.is_list_member(list_id)
);

do $$
begin
    alter publication supabase_realtime add table public.todo_activity_events;
exception
    when duplicate_object then null;
end;
$$;

alter table public.todo_activity_events replica identity full;
