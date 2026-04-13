# Stride: System Architecture

Status: Ongoing (the codebase and data model are actively evolving).

## High-Level Architecture

- Frontend: Next.js App Router application (React + TypeScript).
- Backend: Supabase (Postgres + Auth + Realtime + Storage) with RLS-heavy authorization.
- Pattern: client-heavy interaction surfaces with optimistic updates, plus selective realtime subscriptions to reduce stale collaboration state.

## Frontend Structure

- Routing: `src/app/*` (App Router).
  - Auth entry: `/login`
  - Authenticated surfaces: `/tasks`, `/calendar`, `/focus`, `/projects`, `/progress`, `/community`, `/settings`
- Layout: `src/app/layout.tsx` mounts global providers and Vercel Speed Insights.
- “Shell” UI: pages render inside a shared `AppShell` (navigation + global actions).
- State layers (high-level):
  - `DataProvider`: authenticated user context + profile/preferences + list membership + top-level stats.
  - `useTaskDataset` and related hooks: route-focused task/planning datasets, optimistic helpers, and realtime wiring.
  - `FocusProvider`: timer state + focus session lifecycle persistence.

## Backend / Data Layer

Schema management:

- SQL-first migrations live in `supabase/migrations/*.sql` and define tables, indexes, triggers, and policies.

Key entities (representative, not exhaustive):

- `profiles`: user preferences (timezone, week start, compact mode, planner defaults, shell ordering/accent tokens).
- `todo_lists` + `todo_list_members`: projects and membership.
- `todos`: tasks (including deadlines, recurrence, reminders, estimates, assignee foundation, stable ordering).
- `todo_sections`: project sections for grouping and board organization.
- `planned_focus_blocks`: calendar/planner blocks.
- `focus_sessions`: execution sessions (optionally attributed to a task and/or planned block).
- `task_saved_views` and `planner_saved_filters`: persisted filter presets.
- `task_labels` + `todo_label_links`: labels.
- `todo_steps`: checklist steps.
- `todo_comments`: task comments.
- `weekly_commitments`: community commitments.

Storage:

- Buckets are expected for attachments and avatars (see `README.md` for names).
- Attachment metadata is stored in tables alongside Storage objects.

## Authentication

- Supabase Auth (email/password) is used for login and session management.
- Server-side gating: authenticated routes call a helper that redirects unauthenticated users to `/login`.
- Client-side usage: browser Supabase client is used for queries/mutations and realtime subscriptions.
- New-user bootstrap: on first login, the app attempts to provision a usable workspace (profile + Inbox).

## Analytics / Observability

- Sentry is integrated via `@sentry/nextjs` (client/server/edge config + App Router global error boundary).
- PostHog is initialized client-side only when `NEXT_PUBLIC_POSTHOG_*` env vars are present.
- Vercel Speed Insights is mounted at the root layout.

## Main App Surfaces / Routing

- `/tasks`: execution workspace (smart views, saved views, bulk actions, deep task detail editing).
- `/calendar`: planning surface around persisted focus blocks + filters.
- `/focus`: timer surface that persists focus sessions and ties them back to planned work when possible.
- `/projects`: per-project workspace with list/board views, sections, and ordering.
- `/progress`: weekly review computed from tasks + planned blocks + focus sessions.
- `/community`: commitments and early accountability/peer visibility (additional insights are still WIP).
- `/settings`: profile + preference management.

## Realtime, Mutations, and Consistency

- Primary approach: optimistic local patching for responsive UI.
- Realtime is used selectively (channels scoped by user/list/task) for freshness in collaboration-sensitive areas (e.g., task lists, steps, comments, sections).
- Fallback behavior is defensive: when a table is missing (e.g., during partial migration rollout), some surfaces treat it as “feature unavailable” instead of hard failing.

## Deployment (Inferred)

- The repository is structured like a standard Next.js deployment and includes Vercel Speed Insights integration.
- The live demo URL is documented in `README.md`, but the repo does not enforce a single deployment target in code.

## Limitations / Future Work

Grounded in `todo.md` (kept intentionally conservative here):

- Add interaction-level regression protection for high-risk flows (planner blocks, quick add, task detail leave-guard, focus persistence).
- Harden rollback/error paths for optimistic updates and improve failure instrumentation.
- Reduce UX drift across core routes (especially dense mobile interactions).
- Deepen shell actions beyond navigation while keeping state manageable.
- Distribution packaging (PWA → wrappers) is tracked as a parallel path after reliability.
- Offline-first behavior is not yet a guaranteed contract.
