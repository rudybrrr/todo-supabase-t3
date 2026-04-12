export type TimerMode = "focus" | "shortBreak" | "longBreak";
export type RecurrenceRule = "daily" | "weekdays" | "weekly" | "monthly";
export type TaskLabelColorToken = "cobalt" | "emerald" | "amber" | "rose" | "violet" | "slate";

export interface TodoList {
    id: string;
    name: string;
    owner_id: string;
    inserted_at?: string;
    user_role?: string;
    color_token?: string | null;
    icon_token?: string | null;
}

export interface TodoRow {
    id: string;
    user_id: string;
    list_id: string;
    section_id?: string | null;
    assignee_user_id?: string | null;
    position?: number | null;
    title: string;
    is_done: boolean;
    inserted_at: string;
    description?: string | null;
    due_date?: string | null;
    deadline_on?: string | null;
    deadline_at?: string | null;
    reminder_offset_minutes?: number | null;
    reminder_at?: string | null;
    recurrence_rule?: RecurrenceRule | null;
    priority?: 'high' | 'medium' | 'low' | null;
    estimated_minutes?: number | null;
    completed_at?: string | null;
    updated_at?: string | null;
}

export interface TaskLabel {
    id: string;
    user_id: string;
    name: string;
    color_token?: TaskLabelColorToken | null;
    inserted_at: string;
    updated_at: string;
}

export interface TodoLabelLinkRow {
    todo_id: string;
    label_id: string;
    user_id: string;
    inserted_at?: string;
}

export interface TodoSectionRow {
    id: string;
    list_id: string;
    name: string;
    position: number;
    inserted_at: string;
    updated_at: string;
}

export interface TodoImageRow {
    id: string;
    todo_id: string;
    user_id: string;
    list_id: string;
    path: string;
    original_name?: string | null;
    mime_type?: string | null;
    size_bytes?: number | string | null;
    inserted_at?: string;
}

export interface TodoStepRow {
    id: string;
    todo_id: string;
    title: string;
    is_done: boolean;
    position: number;
    inserted_at: string;
    updated_at: string;
}

export interface FocusSession {
    id: string;
    user_id: string;
    list_id: string | null;
    todo_id?: string | null;
    planned_block_id?: string | null;
    duration_seconds: number;
    mode: TimerMode;
    inserted_at: string;
    todo_lists?: { name: string } | null;
}

export interface Profile {
    id: string;
    email: string;
    username?: string;
    full_name?: string;
    avatar_url?: string;
    daily_focus_goal_minutes?: number | null;
    timezone?: string | null;
    accent_token?: string | null;
    project_order_ids?: string[] | null;
    default_block_minutes?: number | null;
    week_starts_on?: number | null;
    planner_day_start_hour?: number | null;
    planner_day_end_hour?: number | null;
}

export type PlanningStatus = "unplanned" | "partially_planned" | "fully_planned" | "overplanned";

export interface PlannedFocusBlock {
    id: string;
    user_id: string;
    list_id: string;
    todo_id: string | null;
    title: string;
    scheduled_start: string;
    scheduled_end: string;
    inserted_at: string;
    updated_at: string;
}

export interface TaskSavedViewRow {
    id: string;
    user_id: string;
    name: string;
    smart_view: "today" | "upcoming" | "inbox" | "done";
    list_id: string | null;
    priority_filter: "all" | "none" | "high" | "medium" | "low";
    planning_status_filter: PlanningStatus | "all";
    deadline_scope: "all" | "overdue" | "today" | "due_soon" | "no_deadline";
    label_ids: string[];
    inserted_at: string;
    updated_at: string;
}

export interface TodoListMember {
    list_id: string;
    user_id: string;
    role: "owner" | "editor" | "viewer";
    inserted_at?: string;
    profiles?: {
        username?: string | null;
        full_name?: string | null;
        avatar_url?: string | null;
    } | null;
}

export interface ProjectMemberProfile extends TodoListMember {
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
}

export interface TodoCommentRow {
    id: string;
    todo_id: string;
    list_id: string;
    user_id: string;
    body: string;
    inserted_at: string;
    updated_at: string;
}





export interface WeeklyCommitmentRow {
    id: string;
    user_id: string;
    week_start_on: string;
    summary?: string | null;
    target_focus_minutes?: number | null;
    target_task_count?: number | null;
    inserted_at: string;
    updated_at: string;
}

export interface LeaderboardEntry {
    user_id: string;
    username: string;
    avatar_url: string | null;
    total_minutes: number;
    rank?: number;
}
