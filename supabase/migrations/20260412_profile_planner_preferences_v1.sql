alter table public.profiles
    add column if not exists default_block_minutes integer,
    add column if not exists week_starts_on smallint,
    add column if not exists planner_day_start_hour smallint,
    add column if not exists planner_day_end_hour smallint;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_default_block_minutes_valid'
    ) then
        alter table public.profiles
            add constraint profiles_default_block_minutes_valid
            check (
                default_block_minutes is null
                or (
                    default_block_minutes >= 15
                    and default_block_minutes <= 240
                    and mod(default_block_minutes, 15) = 0
                )
            );
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_week_starts_on_valid'
    ) then
        alter table public.profiles
            add constraint profiles_week_starts_on_valid
            check (week_starts_on is null or week_starts_on in (0, 1));
    end if;

    if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_planner_day_hours_valid'
    ) then
        alter table public.profiles
            add constraint profiles_planner_day_hours_valid
            check (
                planner_day_start_hour is null
                or planner_day_end_hour is null
                or (
                    planner_day_start_hour >= 0
                    and planner_day_start_hour <= 23
                    and planner_day_end_hour >= 1
                    and planner_day_end_hour <= 24
                    and planner_day_end_hour > planner_day_start_hour
                )
            );
    end if;
end
$$;
