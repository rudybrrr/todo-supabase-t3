--  RAN ALREADY ON 2026-03-07 00:30

-- Atomic list creation helper used by the web client.
-- Run this in Supabase SQL Editor or your migration pipeline.

create or replace function public.create_list_with_owner(list_name text)
returns table (
  id uuid,
  name text,
  owner_id uuid,
  inserted_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_list public.todo_lists;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if list_name is null or btrim(list_name) = '' then
    raise exception 'List name cannot be empty';
  end if;

  insert into public.todo_lists (owner_id, name)
  values (auth.uid(), btrim(list_name))
  returning * into new_list;

  insert into public.todo_list_members (list_id, user_id, role)
  values (new_list.id, auth.uid(), 'owner')
  on conflict (list_id, user_id) do update set role = excluded.role;

  return query
  select new_list.id, new_list.name, new_list.owner_id, new_list.inserted_at;
end;
$$;

grant execute on function public.create_list_with_owner(text) to authenticated;
