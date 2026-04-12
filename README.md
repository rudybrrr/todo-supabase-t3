# Stride

Stride is an execution-first productivity system for students. It helps convert captured tasks into scheduled work, focused sessions, and weekly review.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-black?style=for-the-badge&logo=vercel)](https://stride.rudhresh.app)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Profile-blue?style=for-the-badge&logo=linkedin)](https://www.linkedin.com/in/rudhresh-r/)

## What Stride Solves

Most students are not blocked by writing tasks down. They are blocked by execution drift:

- too many unscheduled tasks
- weak connection between plans and actual focus time
- no tight feedback loop for what slipped and why

Stride is designed around one loop:

1. Capture quickly.
2. Clarify what matters now.
3. Plan realistic focus time.
4. Execute with context.
5. Review outcomes and adjust.

## Current Product Surface

### Primary Routes

- `/tasks`
- `/calendar`
- `/focus`
- `/projects`

### Secondary Routes

- `/progress`
- `/community`
- `/settings`

## Feature Highlights

### Tasks

- Smart views: `Today`, `Upcoming`, `No Due Date`, `Completed`
- Saved task views with filters
- Quick Add parser for project, date, time, priority, estimate, reminder, recurrence, and labels
- Rich task detail: title, description, labels, assignee, priority, deadline, reminder, recurrence, estimate
- Steps, attachments, comments, and unsaved-change protection
- Selection mode and bulk task actions

### Planner And Focus

- Calendar planner with persisted focus blocks
- Week/month planning surfaces
- Planned blocks linked to tasks
- Dedicated `/focus` route with focus and break modes
- Focus sessions saved and attributed to tasks/planned blocks

### Projects And Collaboration

- Project workspaces with list and board views
- Sections with reorder and cross-section task movement
- Persistent task ordering
- Members, assignees, comments, and collaboration-aware summaries

### Progress And Community

- Weekly review in `/progress`:
  - planned vs actual
  - slipped work
  - neglected projects
  - estimate quality
- `/community` with weekly commitments and shared-peer accountability

### Shell And Preferences

- Command palette / shell search
- Shell-level Quick Add
- Desktop sidebar and mobile drawer navigation
- Synced preferences (timezone, planner defaults, week start, compact mode)

## Visual Gallery

| Login | Tasks |
| :---: | :---: |
| ![Login](screenshots/auth.png) | ![Tasks](screenshots/tasks.png) |

| Planner | Progress / Insights |
| :---: | :---: |
| ![Planner](screenshots/planner.png) | ![Insights](screenshots/insights.png) |

## Tech Stack

- Next.js 16 App Router
- React 19 + TypeScript
- Tailwind CSS + shadcn/ui + Framer Motion
- Supabase (Postgres, Auth, Realtime, Storage, RLS)
- Sentry + Vercel Speed Insights + PostHog
- Vitest for semantic utility coverage

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env` (or `.env.local`) with:

```bash
NEXT_PUBLIC_SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="YOUR_SUPABASE_ANON_KEY"
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN="phc_your_project_token"
NEXT_PUBLIC_POSTHOG_HOST="https://us.i.posthog.com"
```

Notes:

- If PostHog variables are omitted locally, analytics initialization is skipped.
- Keep secrets out of `.env.example`.

### 3. Set up Supabase schema and policies

Recommended path:

```bash
supabase db push
```

This applies all SQL in `supabase/migrations/` in order.

### 4. Create required storage buckets

Create these Supabase Storage buckets:

- `todo-images`
- `profile-avatars`

### 5. Run locally

```bash
npm run dev
```

If your PowerShell policy blocks `npm.ps1`, use `npm.cmd run dev`.

## Database Setup (Detailed, SQL-First)

If you want a transparent SQL setup path, this section is the source of truth.

### A. Migration files in this repo

Current migration files are in:

- `supabase/migrations/*.sql`

List them in order:

```powershell
Get-ChildItem supabase/migrations/*.sql | Sort-Object Name | Select-Object -ExpandProperty Name
```

### B. Apply SQL manually (without `supabase db push`)

Open Supabase SQL Editor and run each file in ascending timestamp order.

If you have direct Postgres access and `psql` installed:

```powershell
Get-ChildItem supabase/migrations/*.sql |
  Sort-Object Name |
  ForEach-Object { psql $env:SUPABASE_DB_URL -v ON_ERROR_STOP=1 -f $_.FullName }
```

### C. Key SQL examples used by Stride

These examples are already represented in the checked-in migrations and shown here for clarity.

#### 1) Atomic project/list creation RPC

```sql
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
```

#### 2) Planned focus blocks table + RLS enablement

```sql
create table if not exists public.planned_focus_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  list_id uuid not null references public.todo_lists(id) on delete cascade,
  todo_id uuid references public.todos(id) on delete set null,
  title text not null,
  scheduled_start timestamptz not null,
  scheduled_end timestamptz not null,
  inserted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_focus_blocks_time_order check (scheduled_end > scheduled_start)
);

alter table public.planned_focus_blocks enable row level security;
```

#### 3) Profile avatars bucket + policies

```sql
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true)
on conflict (id) do update set public = excluded.public;

create policy "Public can view profile avatars"
on storage.objects
for select
using (bucket_id = 'profile-avatars');

create policy "Users can upload own profile avatars"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

#### 4) Task attachments bucket (`todo-images`) expected policy shape

The app uploads attachment paths as:

- `${userId}/${taskId}/${uuid}-${filename}`

Create bucket (if missing):

```sql
insert into storage.buckets (id, name, public)
values ('todo-images', 'todo-images', true)
on conflict (id) do update set public = excluded.public;
```

Recommended policy pattern:

```sql
create policy "Public can view todo images"
on storage.objects
for select
using (bucket_id = 'todo-images');

create policy "Users can upload own todo images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'todo-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete own todo images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'todo-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);
```

### D. Migration map (what each group adds)

| Migration | Purpose | Key areas touched |
| :--- | :--- | :--- |
| `20260306_create_list_with_owner.sql` | Adds atomic list creation RPC used by the client. | `create_list_with_owner`, `todo_lists`, `todo_list_members` |
| `20260307_settings_profile_avatar_security.sql` | Hardens profile and avatar security model. | `profiles` columns/RLS/policies, `profile-avatars` bucket + `storage.objects` policies |
| `20260319_planning_hub_v1.sql` | Introduces planning hub foundation. | `profiles.daily_focus_goal_minutes`, `planned_focus_blocks`, RLS/realtime |
| `20260320_execution_first_redesign_metadata.sql` | Adds execution-focused metadata fields. | `todo_lists.color_token/icon_token`, `todos.estimated_minutes/completed_at` |
| `20260322_attachment_metadata.sql` | Adds attachment metadata support. | `todo_images.original_name/mime_type/size_bytes` |
| `20260403_baseline_indexes.sql` | Adds baseline performance indexes. | indexes on `todo_lists`, `todo_list_members`, `todos`, planning/query paths |
| `20260409_todo_steps_v1.sql` | Adds checklist-style task steps. | `todo_steps`, updated_at trigger, RLS/realtime |
| `20260410_deadline_timezone_planning_foundation.sql` | Splits deadline semantics and adds timezone foundation. | `profiles.timezone`, `todos.deadline_on/deadline_at`, deadline indexes/constraints |
| `20260410_dedupe_focus_sessions.sql` | Removes near-duplicate focus sessions. | cleanup query on `focus_sessions` |
| `20260410_project_sections_v1.sql` | Adds project sections and section assignment. | `todo_sections`, `todos.section_id`, RLS/realtime |
| `20260410_user_bootstrap_inbox.sql` | Auto-bootstraps user profile + Inbox. | bootstrap function/trigger logic, `profiles`, `todo_lists`, `todo_list_members` |
| `20260411_focus_session_task_attribution_v1.sql` | Links focus sessions to task/planned block context. | `focus_sessions.todo_id`, `focus_sessions.planned_block_id` FKs |
| `20260411_planner_saved_filters_v1.sql` | Adds saved planner filters. | `planner_saved_filters`, constraints, RLS |
| `20260411_task_labels_v1.sql` | Adds task labels and links. | `task_labels`, `todo_label_links`, triggers/indexes/RLS |
| `20260411_task_recurrence_v1.sql` | Adds recurring task rules. | `todos.recurrence_rule` + validation/index |
| `20260411_task_reminders_v1.sql` | Adds reminders on tasks. | `todos.reminder_offset_minutes`, `todos.reminder_at`, constraint/index |
| `20260411_task_saved_views_v1.sql` | Adds saved task view presets. | `task_saved_views`, filter constraints, indexes, RLS |
| `20260412_profile_compact_mode_v1.sql` | Adds compact-mode preference. | `profiles.is_compact_mode` |
| `20260412_profile_planner_preferences_v1.sql` | Adds planner preference fields and guards. | `profiles.default_block_minutes/week_starts_on/planner_day_*` + constraints |
| `20260412_profile_shell_preferences_v1.sql` | Adds shell appearance/order preferences. | `profiles.accent_token/project_order_ids` + constraint |
| `20260412_task_collaboration_foundation_v1.sql` | Adds assignee and stable ordering basics. | `todos.assignee_user_id`, `todos.position`, ordering backfill/constraint |
| `20260412_todo_activity_events_v1.sql` | Adds collaboration activity event stream. | `todo_activity_events`, validation trigger, RLS/realtime |
| `20260412_todo_comments_v1.sql` | Adds task comments. | `todo_comments`, triggers, validation, RLS/realtime |
| `20260412_weekly_commitments_v1.sql` | Adds community weekly commitments. | `weekly_commitments`, constraints/index, RLS/realtime |

### E. Post-setup sanity checks

After migrations and bucket setup:

1. Sign in and confirm your profile row is created.
2. Create a project and task.
3. Add/edit a planned focus block.
4. Upload an attachment to verify `todo-images` permissions.
5. Upload an avatar to verify `profile-avatars` permissions.

## Data Model Notes

Key tables and entities:

- `profiles`: identity + synced preferences
- `todo_lists` / `todo_list_members`: projects and membership
- `todos`: task core model
- `todo_sections`: project sections
- `task_labels` + `todo_label_links`: labels
- `planned_focus_blocks`: planner blocks
- `focus_sessions`: execution sessions
- `todo_comments`: task discussion
- `weekly_commitments`: community commitments

Deadline semantics:

- legacy `due_date` (backward compatibility)
- `deadline_on` for date-only deadlines
- `deadline_at` for timed deadlines

## Verification

Run before shipping:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

If needed in PowerShell environments:

```bash
npm.cmd run build
```

## Additional Docs

- Architecture: `system_architecture.md`
- Distribution strategy: `distribution-plan.md`
- Backlog: `todo.md`
- Meeting brief: `meeting_prep.md`
- LinkedIn draft: `linkedin_post.md`
