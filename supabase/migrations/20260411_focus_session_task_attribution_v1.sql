alter table public.focus_sessions
    add column if not exists todo_id uuid,
    add column if not exists planned_block_id uuid;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'focus_sessions_todo_id_fkey'
    ) then
        alter table public.focus_sessions
            add constraint focus_sessions_todo_id_fkey
            foreign key (todo_id)
            references public.todos(id)
            on delete set null;
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'focus_sessions_planned_block_id_fkey'
    ) then
        alter table public.focus_sessions
            add constraint focus_sessions_planned_block_id_fkey
            foreign key (planned_block_id)
            references public.planned_focus_blocks(id)
            on delete set null;
    end if;
end
$$;

create index if not exists idx_focus_sessions_user_todo_id_inserted_at_desc
    on public.focus_sessions (user_id, todo_id, inserted_at desc)
    where todo_id is not null;

create index if not exists idx_focus_sessions_user_planned_block_id_inserted_at_desc
    on public.focus_sessions (user_id, planned_block_id, inserted_at desc)
    where planned_block_id is not null;
