alter table public.profiles
    add column if not exists is_compact_mode boolean not null default false;
