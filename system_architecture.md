# Stride: System Architecture

## 1. Product Framing

Stride is an execution-first student productivity system.

Core loop:

1. Capture work quickly.
2. Clarify what matters now.
3. Plan realistic focus time.
4. Execute in focused sessions.
5. Review outcomes and adjust.

The architecture favors coherent end-to-end flow over isolated feature growth.

## 2. Runtime Stack

- Framework: Next.js 16 (App Router)
- Language: TypeScript
- UI: Tailwind CSS, shadcn/ui, Framer Motion
- Backend: Supabase (Postgres, Auth, Realtime, Storage, RLS)
- Observability: Sentry, Vercel Speed Insights, PostHog
- Testing: Vitest for semantic utility coverage

## 3. Route Architecture

### Primary routes

- `/tasks`: task execution workspace
- `/calendar`: planning and focus-block scheduling
- `/focus`: dedicated execution timer surface
- `/projects`: project index + per-project workspace

### Secondary routes

- `/progress`: weekly execution review
- `/community`: accountability and commitments
- `/settings`: profile, appearance, shortcuts, planner defaults

## 4. Shell Architecture

Stride runs inside a shared authenticated shell.

### Desktop shell

- Collapsible sidebar
- Primary route navigation
- Smart view links and project list
- Shell-level Quick Add
- Command palette / global search
- Profile utilities (Progress, Community, Settings, logout)

### Mobile shell

- Drawer navigation (same model as desktop)
- Top-right account menu
- No bottom-tab dependency

## 5. State And Data Layers

### 5.1 `DataProvider`

Responsibilities:

- authenticated `userId`
- profile and preference data
- accessible project list
- high-level counters and shared app context

### 5.2 `WorkspaceDataProvider`

Responsibilities:

- tasks and task labels
- planned focus blocks
- task images
- project summaries
- members by project
- local patching and upsert/remove helpers

This layer powers Tasks, Calendar, Focus, and Projects surfaces.

### 5.3 `FocusProvider`

Responsibilities:

- timer mode/state (`focus`, `shortBreak`, `longBreak`)
- time-left state and persistence
- session lifecycle persistence into `focus_sessions`
- binding focus context to task/planned-block references

### 5.4 Route-scoped hooks

Used for domain-specific data that should not inflate global state:

- `useTaskSections`
- `useTaskComments`
- other task- or route-local helpers

## 6. Task Domain Model

The task model is richer than basic checklist semantics.

### Core fields and semantics

- `title`, `description`, `is_done`, completion metadata
- deadline model:
  - legacy `due_date` (compatibility)
  - `deadline_on` (date-only)
  - `deadline_at` (timed)
- `priority`, `estimated_minutes`
- `reminder_offset_minutes` / reminder fields
- `recurrence_rule`
- `section_id` and `assignee_user_id`

### Related entities

- labels (`task_labels` relationships)
- comments (`todo_comments`)
- attachments (Supabase Storage + metadata rows)

## 7. Planning And Focus Pipeline

### Planner (`/calendar`)

- Persisted planned blocks in `planned_focus_blocks`
- Week and month planning surfaces
- Task-linked and generic planning blocks
- Saved planning filters
- Optimistic mutations with reconciliation

### Focus (`/focus`)

- timer-first execution interface
- session attribution to task/planned block when available
- persistence into `focus_sessions`
- feeds execution signals to Progress and Community surfaces

## 8. Projects And Collaboration

Projects (lists) are enriched with:

- section structure (`todo_sections`)
- list/board workspace views
- persistent task ordering
- shared membership (`todo_list_members`)
- assignee context and task comments

Project workspace behavior emphasizes direct execution and ordering stability.

## 9. Progress And Community Surfaces

### Progress

Weekly review behavior includes:

- planned vs actual focus
- slipped/overdue work
- neglected projects
- estimate quality signals

### Community

- weekly commitments (`weekly_commitments`)
- shared-peer comparisons based on collaboration context
- lightweight accountability tied to execution activity

## 10. Mutation And Realtime Strategy

Stride favors targeted local patching plus selective server reconciliation.

Typical mutation flow:

1. UI action updates local state optimistically when safe.
2. Mutation is persisted to Supabase.
3. On success: keep local state and reconcile as needed.
4. On failure: rollback/refresh and surface actionable error feedback.

Realtime updates are used where they materially improve collaboration freshness, without forcing universal full-list reloads.

## 11. Observability And Operational Signals

- Sentry wired through Next.js instrumentation + app error boundary
- Vercel Speed Insights mounted at root layout
- PostHog initialized client-side when env vars are present

Current design goal: actionable failure visibility for task, planner, and settings flows without noisy telemetry.

## 12. Current Constraints And Tradeoffs

- Supabase-centric architecture keeps backend complexity low but couples product velocity to migration discipline.
- Rich optimistic UI improves responsiveness but requires careful regression coverage.
- Offline-first behavior is not yet a product guarantee; network-connected usage remains the primary mode.

## 13. Extension Priorities (Architecture Lens)

Near-term architecture priorities:

- stronger interaction-level regression coverage
- clearer error instrumentation in high-risk flows
- tighter cross-route consistency for mobile and dense workspaces
- continued shell command depth and recovery ergonomics

## 14. Verification Standard

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```
