import type { SupabaseClient } from "@supabase/supabase-js";

import type { TodoCommentRow } from "~/lib/types";

export const TODO_COMMENT_FIELDS = "id, todo_id, list_id, user_id, body, inserted_at, updated_at";

export function normalizeTodoCommentRow(row: TodoCommentRow): TodoCommentRow {
    return {
        ...row,
        body: row.body.trim(),
    };
}

export function isMissingTodoCommentsError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return code === "PGRST205"
        || code === "42P01"
        || message.includes("todo_comments");
}

export async function listTaskComments(supabase: SupabaseClient, taskId: string) {
    const { data, error } = await supabase
        .from("todo_comments")
        .select(TODO_COMMENT_FIELDS)
        .eq("todo_id", taskId)
        .order("inserted_at", { ascending: true });

    if (error) throw error;
    return ((data ?? []) as TodoCommentRow[]).map(normalizeTodoCommentRow);
}

export async function createTaskComment(supabase: SupabaseClient, input: {
    todoId: string;
    listId: string;
    userId: string;
    body: string;
}) {
    const normalizedBody = input.body.trim();
    if (!normalizedBody) {
        throw new Error("Comment cannot be empty.");
    }

    const { data, error } = await supabase
        .from("todo_comments")
        .insert({
            todo_id: input.todoId,
            list_id: input.listId,
            user_id: input.userId,
            body: normalizedBody,
        })
        .select(TODO_COMMENT_FIELDS)
        .single();

    if (error) throw error;
    return normalizeTodoCommentRow(data as TodoCommentRow);
}

export async function deleteTaskComment(supabase: SupabaseClient, commentId: string) {
    const { error } = await supabase
        .from("todo_comments")
        .delete()
        .eq("id", commentId);

    if (error) throw error;
}
