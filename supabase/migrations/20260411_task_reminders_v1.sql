alter table public.todos
    add column if not exists reminder_offset_minutes integer,
    add column if not exists reminder_at timestamptz;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'todos_reminder_offset_minutes_nonnegative'
    ) then
        alter table public.todos
            add constraint todos_reminder_offset_minutes_nonnegative
            check (reminder_offset_minutes is null or reminder_offset_minutes >= 0);
    end if;
end
$$;

create index if not exists idx_todos_user_reminder_at
    on public.todos (user_id, reminder_at)
    where reminder_at is not null and is_done = false;
