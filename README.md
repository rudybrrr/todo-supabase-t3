# T3 + Supabase Todo (Auth • Realtime • Images • Collaboration)

A minimal Todo app built with **Create T3 App (Next.js + TypeScript)** and **Supabase**.

## Features

### Standard
- **Auth**: Register + Login + Logout (Supabase Auth)
- **Todos**: Create, read, update (title + done), delete
- **Images**: Upload an image per todo (Supabase Storage) + show thumbnails

### Advanced (kept simple)
- **Realtime**: Todos + images update instantly across tabs/devices
- **Collaboration**: Share a list with another user (shared tasks) via list membership

---

## Tech Stack
- Next.js (App Router) + TypeScript
- Supabase (Auth, Postgres, Row Level Security, Realtime, Storage)

---

## Prerequisites
- Node.js **18+**
- A Supabase project

---

## 1) Supabase setup

### A. Create a Supabase project
Create a project in Supabase, then note:
- **Project URL**
- **Anon key**

Supabase → **Settings → API**

### B. Environment variables
Create a file named **`.env.local`** in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
```

Restart dev server after changing env vars.

### C. Database tables (SQL)
In Supabase → **SQL Editor**, run the schema below.

> This creates: `todos`, `todo_images`, `todo_lists`, `todo_list_members` and enables collaboration via `list_id`.

```sql
-- TODOS
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  inserted_at timestamptz not null default now(),
  list_id uuid
);

alter table public.todos replica identity full;

-- IMAGES (metadata)
create table if not exists public.todo_images (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.todos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  path text not null,
  inserted_at timestamptz not null default now(),
  list_id uuid
);

alter table public.todo_images replica identity full;

-- LISTS (boards)
create table if not exists public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My List',
  inserted_at timestamptz not null default now()
);

-- MEMBERSHIP
create table if not exists public.todo_list_members (
  list_id uuid not null references public.todo_lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor',
  inserted_at timestamptz not null default now(),
  primary key (list_id, user_id),
  constraint todo_list_members_role_valid check (role in ('owner','editor','viewer'))
);

-- Add FKs for list_id now that lists exist
alter table public.todos
  add constraint if not exists todos_list_id_fk
  foreign key (list_id) references public.todo_lists(id) on delete cascade;

alter table public.todo_images
  add constraint if not exists todo_images_list_id_fk
  foreign key (list_id) references public.todo_lists(id) on delete cascade;
```

### D. Realtime (SQL)
Enable realtime for `todos` and `todo_images`:

```sql
alter publication supabase_realtime set (publish = 'insert, update, delete');
alter publication supabase_realtime add table public.todos;
alter publication supabase_realtime add table public.todo_images;
```

(If it says “already a member”, that’s fine.)

### E. Storage bucket
Supabase → **Storage** → **New bucket**
- Name: `todo-images`
- **Public**: ON

### F. RLS policies (Collaboration-safe)
This project uses **Row Level Security**. Policies are defined via helper functions to avoid recursive policy issues.

Run in Supabase → **SQL Editor**:

```sql
-- Enable RLS
alter table public.todos enable row level security;
alter table public.todo_images enable row level security;
alter table public.todo_lists enable row level security;
alter table public.todo_list_members enable row level security;

-- Helper functions (break circular RLS dependencies)
create or replace function public.is_list_owner(lid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.todo_lists l
    where l.id = lid and l.owner_id = auth.uid()
  );
$$;

create or replace function public.is_list_member(lid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.todo_list_members m
    where m.list_id = lid and m.user_id = auth.uid()
  );
$$;

create or replace function public.can_edit_list(lid uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.todo_list_members m
    where m.list_id = lid
      and m.user_id = auth.uid()
      and m.role in ('owner','editor')
  );
$$;

-- Drop existing policies on these tables (safe reset)
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname='public'
      and tablename in ('todo_lists','todo_list_members','todos','todo_images')
  loop
    execute format('drop policy if exists %I on %I.%I;', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- todo_lists: members can read; owner can create
create policy todo_lists_select_member
on public.todo_lists for select
using (public.is_list_member(id));

create policy todo_lists_insert_owner
on public.todo_lists for insert
with check (owner_id = auth.uid());

-- todo_list_members: self can read row; owner can read all members + manage membership
create policy tlm_select_self_or_owner
on public.todo_list_members for select
using (
  user_id = auth.uid()
  or public.is_list_owner(list_id)
);

create policy tlm_insert_owner_only
on public.todo_list_members for insert
with check (public.is_list_owner(list_id));

create policy tlm_delete_owner_only
on public.todo_list_members for delete
using (public.is_list_owner(list_id));

-- todos: member read; editor/owner write
create policy todos_select_member
on public.todos for select
using (public.is_list_member(list_id));

create policy todos_insert_editor
on public.todos for insert
with check (public.can_edit_list(list_id));

create policy todos_update_editor
on public.todos for update
using (public.can_edit_list(list_id));

create policy todos_delete_editor
on public.todos for delete
using (public.can_edit_list(list_id));

-- todo_images: member read; editor/owner write
create policy todo_images_select_member
on public.todo_images for select
using (public.is_list_member(list_id));

create policy todo_images_insert_editor
on public.todo_images for insert
with check (public.can_edit_list(list_id));

create policy todo_images_delete_editor
on public.todo_images for delete
using (public.can_edit_list(list_id));
```

> Notes:
> - The app auto-creates a default list (“My List”) and adds the current user as owner on first use.
> - Sharing adds another user as an **editor** to the same list.

---

## 2) Install & Run

```bash
npm install
npm run dev
```

Open: http://localhost:3000

---

## 3) How to use the app

### Auth
1. Go to `/login`
2. Click **Register** to create an account
3. Login → you’ll be redirected to `/todos`

> If you previously had “email confirmation required” enabled in Supabase Auth, disable it for local testing:
> Supabase → Authentication → Providers → Email → turn off “Confirm email”.

### Todos
- Create a todo with the input + **Add**
- Toggle done using the checkbox
- Edit title: click text, change, click out (onBlur saves)
- Delete: **Delete**

### Images
- Choose a file under a todo to upload
- Thumbnails appear below the todo
- Click a thumbnail to open the full image

### Collaboration (Shared Tasks)
1. Login as **User A**
2. Supabase → Authentication → Users → copy **User B**'s UUID
3. In the app, paste User B UUID into the **Collaborate** box and click **Share**
4. Login as **User B** → both users see the same list and changes sync in realtime

---

## Troubleshooting

### “Bucket not found”
- Ensure Storage bucket name matches the code: `todo-images`
- Ensure the bucket is **Public** if using public URLs

### Realtime not updating
Run:
```sql
alter publication supabase_realtime set (publish = 'insert, update, delete');
alter publication supabase_realtime add table public.todos;
alter publication supabase_realtime add table public.todo_images;
alter table public.todos replica identity full;
alter table public.todo_images replica identity full;
```

### “Email not confirmed”
Turn off email confirmations:
Supabase → Authentication → Providers → Email → disable confirmations.

---

## Project Routes
- `/` redirects to login/todos depending on auth
- `/login` Auth page (Login/Register)
- `/todos` Main app (todos + images + collaboration)

