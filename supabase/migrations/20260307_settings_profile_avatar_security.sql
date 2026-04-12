--  RAN ALREADY ON 2026-03-07 1:42

-- Settings page upgrade support (Section 16)
-- Aligns profile/avatar/password flows with schema and storage policies.

-- 1) Ensure profiles columns exist
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- 2) Ensure profile RLS + policies match app behavior
alter table public.profiles enable row level security;

drop policy if exists "Anyone can view profiles" on public.profiles;
create policy "Anyone can view profiles"
on public.profiles
for select
using (true);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- 3) Keep updated_at fresh
create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

-- 4) Create/normalize avatar bucket
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update
set public = excluded.public;

-- 5) Storage policies for avatar objects
drop policy if exists "Public can view profile avatars" on storage.objects;
create policy "Public can view profile avatars"
on storage.objects
for select
using (bucket_id = 'profile-avatars');

drop policy if exists "Users can upload own profile avatars" on storage.objects;
create policy "Users can upload own profile avatars"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users can delete own profile avatars" on storage.objects;
create policy "Users can delete own profile avatars"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

