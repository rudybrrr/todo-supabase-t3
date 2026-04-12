alter table public.profiles
    add column if not exists accent_token text,
    add column if not exists project_order_ids uuid[];

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'profiles_accent_token_valid'
    ) then
        alter table public.profiles
            add constraint profiles_accent_token_valid
            check (
                accent_token is null
                or accent_token in ('blue', 'teal', 'green', 'amber', 'rose', 'slate')
            );
    end if;
end
$$;
