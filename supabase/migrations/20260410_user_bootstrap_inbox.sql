-- Automatic new-user bootstrap
-- Ensures every authenticated user has a profile row and a permanent Inbox list.

create or replace function public.ensure_user_bootstrap(
  target_user_id uuid,
  target_email text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  inbox_list_id uuid;
begin
  if target_user_id is null then
    raise exception 'target_user_id is required';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'email'
  ) then
    execute
      'insert into public.profiles (id, email)
       values ($1, $2)
       on conflict (id) do update
       set email = coalesce(public.profiles.email, excluded.email)'
    using target_user_id, nullif(btrim(target_email), '');
  else
    execute
      'insert into public.profiles (id)
       values ($1)
       on conflict (id) do nothing'
    using target_user_id;
  end if;

  select todo_lists.id
    into inbox_list_id
  from public.todo_lists
  where todo_lists.owner_id = target_user_id
    and lower(btrim(todo_lists.name)) = 'inbox'
  order by todo_lists.inserted_at nulls first, todo_lists.id
  limit 1;

  if inbox_list_id is null then
    insert into public.todo_lists (owner_id, name)
    values (target_user_id, 'Inbox')
    returning id into inbox_list_id;
  end if;

  insert into public.todo_list_members (list_id, user_id, role)
  values (inbox_list_id, target_user_id, 'owner')
  on conflict (list_id, user_id) do update
  set role = excluded.role;

  return inbox_list_id;
end;
$$;

create or replace function public.ensure_default_inbox()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return public.ensure_user_bootstrap(auth.uid(), null);
end;
$$;

create or replace function public.handle_new_user_bootstrap()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.ensure_user_bootstrap(new.id, new.email);
  return new;
end;
$$;

drop trigger if exists trg_handle_new_user_bootstrap on auth.users;
create trigger trg_handle_new_user_bootstrap
after insert on auth.users
for each row
execute function public.handle_new_user_bootstrap();

grant execute on function public.ensure_default_inbox() to authenticated;

do $$
declare
  auth_user record;
begin
  for auth_user in
    select id, email
    from auth.users
  loop
    perform public.ensure_user_bootstrap(auth_user.id, auth_user.email);
  end loop;
end;
$$;
