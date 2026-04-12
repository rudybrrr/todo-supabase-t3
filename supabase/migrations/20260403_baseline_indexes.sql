-- Baseline indexing for Stride
-- Purpose: cover foreign keys and the most common task / planning access patterns
-- Safe for Supabase migrations: no CONCURRENTLY statements

-- todo_lists
create index if not exists idx_todo_lists_owner_id
  on public.todo_lists (owner_id);

-- todo_list_members
-- Note: primary key (list_id, user_id) already covers lookups by list_id first.
-- This extra index helps when listing memberships by user_id.
create index if not exists idx_todo_list_members_user_id
  on public.todo_list_members (user_id);

-- todos
create index if not exists idx_todos_user_id
  on public.todos (user_id);

create index if not exists idx_todos_list_id
  on public.todos (list_id);

create index if not exists idx_todos_list_done_due_date
  on public.todos (list_id, is_done, due_date);

create index if not exists idx_todos_user_done_due_date
  on public.todos (user_id, is_done, due_date);

create index if not exists idx_todos_completed_at_desc
  on public.todos (completed_at desc)
  where is_done = true;

-- focus_sessions
create index if not exists idx_focus_sessions_user_inserted_at_desc
  on public.focus_sessions (user_id, inserted_at desc);

-- todo_images
create index if not exists idx_todo_images_todo_id
  on public.todo_images (todo_id);

create index if not exists idx_todo_images_list_id
  on public.todo_images (list_id);

-- planned_focus_blocks
create index if not exists idx_planned_focus_blocks_user_scheduled_start
  on public.planned_focus_blocks (user_id, scheduled_start);

create index if not exists idx_planned_focus_blocks_list_scheduled_start
  on public.planned_focus_blocks (list_id, scheduled_start);

create index if not exists idx_planned_focus_blocks_todo_id
  on public.planned_focus_blocks (todo_id)
  where todo_id is not null;
