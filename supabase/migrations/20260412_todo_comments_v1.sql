create table if not exists public.todo_comments (
    id uuid primary key default gen_random_uuid(),
    todo_id uuid not null references public.todos(id) on delete cascade,
    list_id uuid not null references public.todo_lists(id) on delete cascade,
    user_id uuid not null references public.profiles(id) on delete cascade,
    body text not null,
    inserted_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint todo_comments_body_not_blank check (btrim(body) <> '')
);

create or replace function public.set_todo_comments_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_todo_comments_updated_at on public.todo_comments;
create trigger trg_todo_comments_updated_at
before update on public.todo_comments
for each row
execute function public.set_todo_comments_updated_at();

create or replace function public.validate_todo_comment_list()
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
        raise exception 'Comment list % does not match task list %', new.list_id, task_list_id;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_validate_todo_comment_list on public.todo_comments;
create trigger trg_validate_todo_comment_list
before insert or update of todo_id, list_id on public.todo_comments
for each row
execute function public.validate_todo_comment_list();

create index if not exists idx_todo_comments_todo_id_inserted_at
    on public.todo_comments (todo_id, inserted_at);

create index if not exists idx_todo_comments_list_id_inserted_at_desc
    on public.todo_comments (list_id, inserted_at desc);

alter table public.todo_comments enable row level security;

drop policy if exists "Users can view task comments in shared lists" on public.todo_comments;
create policy "Users can view task comments in shared lists"
on public.todo_comments
for select
to authenticated
using (
    public.is_list_member(list_id)
);

drop policy if exists "Users can insert task comments in shared lists" on public.todo_comments;
create policy "Users can insert task comments in shared lists"
on public.todo_comments
for insert
to authenticated
with check (
    auth.uid() = user_id
    and public.is_list_member(list_id)
);

drop policy if exists "Users can update own task comments" on public.todo_comments;
create policy "Users can update own task comments"
on public.todo_comments
for update
to authenticated
using (
    auth.uid() = user_id
    and public.is_list_member(list_id)
)
with check (
    auth.uid() = user_id
    and public.is_list_member(list_id)
);

drop policy if exists "Users can delete own task comments or owned-project comments" on public.todo_comments;
create policy "Users can delete own task comments or owned-project comments"
on public.todo_comments
for delete
to authenticated
using (
    public.is_list_member(list_id)
    and (
        auth.uid() = user_id
        or exists (
            select 1
            from public.todo_lists
            where todo_lists.id = todo_comments.list_id
              and todo_lists.owner_id = auth.uid()
        )
    )
);

do $$
begin
    alter publication supabase_realtime add table public.todo_comments;
exception
    when duplicate_object then null;
end;
$$;

alter table public.todo_comments replica identity full;
