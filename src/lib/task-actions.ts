import type { SupabaseClient } from "@supabase/supabase-js";

import { toStoredDueDate } from "~/lib/task-views";
import type { TodoRow } from "~/lib/types";

interface CreateTaskInput {
    userId: string;
    listId: string;
    title: string;
    description?: string;
    dueDate?: string | null;
    priority?: "high" | "medium" | "low" | null;
    estimatedMinutes?: number | null;
}

interface UpdateTaskInput {
    id: string;
    title: string;
    description?: string | null;
    dueDate?: string | null;
    priority?: "high" | "medium" | "low" | null;
    estimatedMinutes?: number | null;
    listId: string;
}

export const TODO_FIELDS =
    "id, user_id, list_id, title, is_done, inserted_at, description, due_date, priority, estimated_minutes, completed_at, updated_at";
export const LEGACY_TODO_FIELDS =
    "id, user_id, list_id, title, is_done, inserted_at, description, due_date, priority, updated_at";

export function isMissingTaskMetadataError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return (
        code === "PGRST204" ||
        message.includes("estimated_minutes") ||
        message.includes("completed_at")
    );
}

export function normalizeTodoRow(row: TodoRow): TodoRow {
    return {
        ...row,
        estimated_minutes: row.estimated_minutes ?? null,
        completed_at: row.completed_at ?? (row.is_done ? row.updated_at ?? row.inserted_at : null),
        updated_at: row.updated_at ?? row.inserted_at,
    };
}

export async function createTask(
    supabase: SupabaseClient,
    { userId, listId, title, description, dueDate, priority, estimatedMinutes }: CreateTaskInput,
): Promise<TodoRow> {
    const basePayload = {
        user_id: userId,
        list_id: listId,
        title: title.trim(),
        description: description?.trim() ? description.trim() : null,
        due_date: toStoredDueDate(dueDate),
        priority: priority ?? null,
    };

    const { data, error } = await supabase
        .from("todos")
        .insert({
            ...basePayload,
            estimated_minutes: estimatedMinutes ?? null,
        })
        .select(TODO_FIELDS)
        .single();

    if (!error) {
        return normalizeTodoRow(data as TodoRow);
    }

    if (!isMissingTaskMetadataError(error)) {
        throw error;
    }

    const { data: legacyData, error: legacyError } = await supabase
        .from("todos")
        .insert(basePayload)
        .select(LEGACY_TODO_FIELDS)
        .single();

    if (legacyError) throw legacyError;
    return normalizeTodoRow(legacyData as TodoRow);
}

export async function updateTask(supabase: SupabaseClient, input: UpdateTaskInput): Promise<TodoRow> {
    const basePayload = {
        title: input.title.trim(),
        description: input.description?.trim() ? input.description.trim() : null,
        due_date: toStoredDueDate(input.dueDate),
        priority: input.priority ?? null,
        list_id: input.listId,
    };

    const { data, error } = await supabase
        .from("todos")
        .update({
            ...basePayload,
            estimated_minutes: input.estimatedMinutes ?? null,
        })
        .eq("id", input.id)
        .select(TODO_FIELDS)
        .single();

    if (!error) {
        return normalizeTodoRow(data as TodoRow);
    }

    if (!isMissingTaskMetadataError(error)) {
        throw error;
    }

    const { data: legacyData, error: legacyError } = await supabase
        .from("todos")
        .update(basePayload)
        .eq("id", input.id)
        .select(LEGACY_TODO_FIELDS)
        .single();

    if (legacyError) throw legacyError;
    return normalizeTodoRow(legacyData as TodoRow);
}

export async function setTaskCompletion(
    supabase: SupabaseClient,
    taskId: string,
    nextIsDone: boolean,
): Promise<TodoRow> {
    const { data, error } = await supabase
        .from("todos")
        .update({
            is_done: nextIsDone,
            completed_at: nextIsDone ? new Date().toISOString() : null,
        })
        .eq("id", taskId)
        .select(TODO_FIELDS)
        .single();

    if (!error) {
        return normalizeTodoRow(data as TodoRow);
    }

    if (!isMissingTaskMetadataError(error)) {
        throw error;
    }

    const { data: legacyData, error: legacyError } = await supabase
        .from("todos")
        .update({
            is_done: nextIsDone,
        })
        .eq("id", taskId)
        .select(LEGACY_TODO_FIELDS)
        .single();

    if (legacyError) throw legacyError;
    return normalizeTodoRow(legacyData as TodoRow);
}

export async function deleteTask(supabase: SupabaseClient, taskId: string) {
    const { error } = await supabase.from("todos").delete().eq("id", taskId);
    if (error) throw error;
}

export async function uploadTaskImages(
    supabase: SupabaseClient,
    userId: string,
    taskId: string,
    listId: string,
    files: File[],
) {
    for (const file of files) {
        const extension = file.name.split(".").pop() ?? "jpg";
        const path = `${userId}/${taskId}/${crypto.randomUUID()}.${extension}`;

        const { error: uploadError } = await supabase.storage.from("todo-images").upload(path, file, {
            upsert: false,
        });

        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from("todo_images").insert({
            todo_id: taskId,
            user_id: userId,
            list_id: listId,
            path,
        });

        if (dbError) throw dbError;
    }
}
