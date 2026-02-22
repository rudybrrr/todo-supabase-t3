export type TimerMode = "focus" | "shortBreak" | "longBreak";

export interface TodoList {
    id: string;
    name: string;
    owner_id: string;
    inserted_at?: string;
    user_role?: string;
}

export interface TodoRow {
    id: string;
    user_id: string;
    list_id: string;
    title: string;
    is_done: boolean;
    inserted_at: string;
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
    full_name?: string;
    avatar_url?: string;
}
