# Study Sprint 🚀
(Formerly a simple Todo App, now a gamified productivity platform)

Built with **Next.js (App Router)**, **TypeScript**, **Supabase**, **Tailwind CSS**, and **shadcn/ui**.

> **The Problem:** Students can create to-do lists, but still struggle to actually start studying and stay consistent. Without session tracking, daily goals, and progress insights, studying becomes irregular and stressful.
> **The Solution:** A platform that combines advanced task management with Pomodoro-style focus sprints, gamified leaderboards, and detailed analytics to keep you motivated.

---

## ✨ Features

### 🎯 Study & Focus
- **Study Sprint Mode:** A dedicated Pomodoro-style timer that records focus sessions to the database.
- **Dashboard Insights:** Visual motivation through real-time interactive progress charts and study streak tracking.
- **Global Study Hall & Leaderboard:** A weekly arena to rank students by focus time, featuring a live real-time Activity Feed to see when others complete sessions.

### ✅ Advanced Task Management (Things 3 / Todoist Style)
- **Multi-List Management:** Organize tasks by subject or project with a dedicated sidebar.
- **Inline Task Expansion:** Clean minimalist design by default, expanding to reveal descriptions, due dates, and priority levels when clicked.
- **Rich Task Metadata:** Set Due Dates, Priorities (High/Medium/Low), and detailed markdown descriptions.
- **Smart Filtering:** Filter tasks by Status (All/Active/Done) and Priority tags.
- **Real-time Sync & Collaboration:** Share lists with other users; tasks sync instantly across all devices.

### 🎨 Modern UI & UX
- **Beautiful Components:** Built with `shadcn/ui` and `Tailwind CSS`.
- **Smooth Animations:** Powered by `framer-motion` for page transitions, list animations, and micro-interactions.
- **Dark Mode:** System-aware theme switching.
- **Confetti Celebrations:** Satisfying feedback when you complete a focus session (`canvas-confetti`).

---

## 🛠️ Tech Stack
- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, framer-motion, Recharts
- **Backend/BaaS:** Supabase (PostgreSQL, Auth, Row Level Security, Realtime, Storage)

---

## 🚀 Getting Started

### Prerequisites
- Node.js **18+**
- A Supabase project

### 1) Environment Variables
Create a file named **`.env.local`** in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
```

### 2) Supabase Setup (SQL Editor)
Run the following SQL blocks in your Supabase **SQL Editor** to set up the database.

#### A. Tables & Relations
```sql
-- PROFILES
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  full_name text,
  avatar_url text,
  updated_at timestamptz default now()
);

-- LISTS
create table if not exists public.todo_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  inserted_at timestamptz default now()
);

-- MEMBERSHIP
create table if not exists public.todo_list_members (
  list_id uuid not null references public.todo_lists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor',
  inserted_at timestamptz default now(),
  primary key (list_id, user_id),
  constraint todo_list_members_role_valid check (role in ('owner','editor','viewer'))
);

-- TODOS
create table if not exists public.todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid references public.todo_lists(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz,
  priority text, -- 'high', 'medium', 'low'
  is_done boolean not null default false,
  inserted_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- FOCUS SESSIONS
create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid references public.todo_lists(id) on delete cascade,
  duration_seconds int not null,
  mode text not null, -- 'focus', 'shortBreak', 'longBreak'
  inserted_at timestamptz default now()
);

-- IMAGES
create table if not exists public.todo_images (
  id uuid primary key default gen_random_uuid(),
  todo_id uuid not null references public.todos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid references public.todo_lists(id) on delete cascade,
  path text not null,
  inserted_at timestamptz default now()
);

-- WEEKLY LEADERBOARD VIEW
create or replace view public.weekly_leaderboard as
  select 
    p.id as user_id,
    p.username,
    p.avatar_url,
    coalesce(sum(fs.duration_seconds), 0) / 60 as total_minutes
  from public.profiles p
  left join public.focus_sessions fs on fs.user_id = p.id
    and fs.mode = 'focus'
    and fs.inserted_at >= date_trunc('week', now())
  group by p.id, p.username, p.avatar_url;
```

#### B. Row Level Security & Helpers
```sql
-- Enable RLS
alter table public.profiles enable row level security;
alter table public.todos enable row level security;
alter table public.todo_images enable row level security;
alter table public.todo_lists enable row level security;
alter table public.todo_list_members enable row level security;
alter table public.focus_sessions enable row level security;

-- Helper functions
create or replace function public.is_list_owner(lid uuid) returns boolean 
language sql security definer set search_path = public as $$
  select exists (select 1 from public.todo_lists where id = lid and owner_id = auth.uid());
$$;

create or replace function public.is_list_member(lid uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.todo_list_members where list_id = lid and user_id = auth.uid());
$$;

create or replace function public.can_edit_list(lid uuid) returns boolean
language sql security definer set search_path = public as $$
  select exists (select 1 from public.todo_list_members where list_id = lid and user_id = auth.uid() and role in ('owner','editor'));
$$;

-- Policies for todos
create policy "Users can view todos in their lists" on public.todos for select using (public.is_list_member(list_id));
create policy "Editors can insert todos" on public.todos for insert with check (public.can_edit_list(list_id));
create policy "Editors can update todos" on public.todos for update using (public.can_edit_list(list_id));
create policy "Editors can delete todos" on public.todos for delete using (public.can_edit_list(list_id));

-- (Add similar policies for todo_images, focus_sessions, etc.)
```

#### C. Realtime Enablement
```sql
alter publication supabase_realtime set (publish = 'insert, update, delete');
alter publication supabase_realtime add table public.todos;
alter publication supabase_realtime add table public.todo_images;
alter publication supabase_realtime add table public.focus_sessions;

alter table public.todos replica identity full;
alter table public.todo_images replica identity full;
alter table public.focus_sessions replica identity full;
```

### 3) Storage Bucket
1. Create a **Public** bucket named `todo-images` (or `mission-attachments` depending on your code).
2. Ensure the path in the code matches your bucket name.

---

## 💻 Running Locally

```bash
npm install
npm run dev
```

---

## 🗺️ Roadmap
- **Focus XP:** Points per session, Levels, and Ranks.
- **Streak Shield:** Earn freezes for consistent study streaks.
- **Planning Hub:** Calendar View & Weekly Planner.
- **Productivity Heatmaps:** Visualizing your best hours.
