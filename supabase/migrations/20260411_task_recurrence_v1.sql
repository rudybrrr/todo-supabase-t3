alter table public.todos
  add column if not exists recurrence_rule text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'todos_recurrence_rule_check'
  ) then
    alter table public.todos
      add constraint todos_recurrence_rule_check
      check (
        recurrence_rule is null
        or recurrence_rule in ('daily', 'weekdays', 'weekly', 'monthly')
      );
  end if;
end $$;

create index if not exists idx_todos_user_recurrence_rule
  on public.todos (user_id, recurrence_rule)
  where recurrence_rule is not null;
