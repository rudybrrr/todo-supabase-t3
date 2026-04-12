create table if not exists public.weekly_commitments (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references public.profiles(id) on delete cascade,
    week_start_on date not null,
    summary text,
    target_focus_minutes integer,
    target_task_count integer,
    inserted_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint weekly_commitments_target_focus_minutes_nonnegative
        check (target_focus_minutes is null or target_focus_minutes >= 0),
    constraint weekly_commitments_target_task_count_nonnegative
        check (target_task_count is null or target_task_count >= 0)
);

create unique index if not exists idx_weekly_commitments_user_id_week_start_on
    on public.weekly_commitments (user_id, week_start_on);

create or replace function public.set_weekly_commitments_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_weekly_commitments_updated_at on public.weekly_commitments;
create trigger trg_weekly_commitments_updated_at
before update on public.weekly_commitments
for each row
execute function public.set_weekly_commitments_updated_at();

alter table public.weekly_commitments enable row level security;

drop policy if exists "Users can view own weekly commitments" on public.weekly_commitments;
create policy "Users can view own weekly commitments"
on public.weekly_commitments
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own weekly commitments" on public.weekly_commitments;
create policy "Users can insert own weekly commitments"
on public.weekly_commitments
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own weekly commitments" on public.weekly_commitments;
create policy "Users can update own weekly commitments"
on public.weekly_commitments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own weekly commitments" on public.weekly_commitments;
create policy "Users can delete own weekly commitments"
on public.weekly_commitments
for delete
to authenticated
using (auth.uid() = user_id);
