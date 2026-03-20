export type TimerMode = "focus" | "shortBreak" | "longBreak";

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
    title: string;
    is_done: boolean;
    inserted_at: string;
    description?: string | null;
    due_date?: string | null;
    priority?: 'high' | 'medium' | 'low' | null;
    estimated_minutes?: number | null;
    completed_at?: string | null;
    updated_at?: string | null;
}

export interface TodoImageRow {
    id: string;
    todo_id: string;
    user_id: string;
    list_id: string;
    path: string;
    inserted_at?: string;
}

export interface FocusSession {
    id: string;
    user_id: string;
    list_id: string | null;
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
}

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

export interface LeaderboardEntry {
    user_id: string;
    username: string;
    avatar_url: string | null;
    total_minutes: number;
    rank?: number;
}

export interface ActivityFeedEvent {
    id: string;
    user_id: string;
    username: string;
    avatar_url: string | null;
    duration_seconds: number;
    inserted_at: string;
}
