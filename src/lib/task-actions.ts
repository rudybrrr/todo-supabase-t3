import type { SupabaseClient } from "@supabase/supabase-js";

import { getNextRecurringDeadline, isRecurrenceRule } from "~/lib/task-recurrence";
import { sanitizeAttachmentFileName } from "~/lib/task-attachments";
import { buildTaskDeadlineMutation } from "~/lib/task-deadlines";
import { buildTaskReminderMutation, normalizeReminderOffsetMinutes } from "~/lib/task-reminders";
import type { RecurrenceRule, TodoImageRow, TodoRow } from "~/lib/types";

interface CreateTaskInput {
    userId: string;
    listId: string;
    sectionId?: string | null;
    title: string;
    description?: string;
    dueDate?: string | null;
    reminderOffsetMinutes?: number | null;
    recurrenceRule?: RecurrenceRule | null;
    priority?: "high" | "medium" | "low" | null;
    estimatedMinutes?: number | null;
    preferredTimeZone?: string | null;
}

interface UpdateTaskInput {
    id: string;
    title: string;
    description?: string | null;
    dueDate?: string | null;
    reminderOffsetMinutes?: number | null;
    recurrenceRule?: RecurrenceRule | null;
    priority?: "high" | "medium" | "low" | null;
    estimatedMinutes?: number | null;
    listId: string;
    sectionId?: string | null;
    preferredTimeZone?: string | null;
}

export const TODO_FIELDS =
    "id, user_id, list_id, section_id, title, is_done, inserted_at, description, due_date, deadline_on, deadline_at, reminder_offset_minutes, reminder_at, recurrence_rule, priority, estimated_minutes, completed_at, updated_at";

export interface CompleteTaskResult {
    completedTask: TodoRow;
    nextTask: TodoRow | null;
}

export function normalizeTodoRow(row: TodoRow): TodoRow {
    return {
        ...row,
        section_id: row.section_id ?? null,
        due_date: row.due_date ?? null,
        deadline_on: row.deadline_on ?? null,
        deadline_at: row.deadline_at ?? null,
        reminder_offset_minutes: normalizeReminderOffsetMinutes(row.reminder_offset_minutes),
        reminder_at: row.reminder_at ?? null,
        recurrence_rule: isRecurrenceRule(row.recurrence_rule) ? row.recurrence_rule : null,
        estimated_minutes: row.estimated_minutes ?? null,
        completed_at: row.completed_at ?? (row.is_done ? row.updated_at ?? row.inserted_at : null),
        updated_at: row.updated_at ?? row.inserted_at,
    };
}

export async function createTask(
    supabase: SupabaseClient,
    { userId, listId, sectionId, title, description, dueDate, reminderOffsetMinutes, recurrenceRule, priority, estimatedMinutes, preferredTimeZone }: CreateTaskInput,
): Promise<TodoRow> {
    const deadlineMutation = buildTaskDeadlineMutation(dueDate);

    const { data, error } = await supabase
        .from("todos")
        .insert({
            user_id: userId,
            list_id: listId,
            section_id: sectionId ?? null,
            title: title.trim(),
            description: description?.trim() ? description.trim() : null,
            ...deadlineMutation,
            ...buildTaskReminderMutation(deadlineMutation, reminderOffsetMinutes, preferredTimeZone),
            recurrence_rule: recurrenceRule ?? null,
            priority: priority ?? null,
            estimated_minutes: estimatedMinutes ?? null,
        })
        .select(TODO_FIELDS)
        .single();

    if (error) throw error;
    return normalizeTodoRow(data as TodoRow);
}

export async function updateTask(supabase: SupabaseClient, input: UpdateTaskInput): Promise<TodoRow> {
    const deadlineMutation = buildTaskDeadlineMutation(input.dueDate);

    const { data, error } = await supabase
        .from("todos")
        .update({
            title: input.title.trim(),
            description: input.description?.trim() ? input.description.trim() : null,
            ...deadlineMutation,
            ...buildTaskReminderMutation(deadlineMutation, input.reminderOffsetMinutes, input.preferredTimeZone),
            recurrence_rule: input.recurrenceRule ?? null,
            priority: input.priority ?? null,
            list_id: input.listId,
            section_id: input.sectionId ?? null,
            estimated_minutes: input.estimatedMinutes ?? null,
        })
        .eq("id", input.id)
        .select(TODO_FIELDS)
        .single();

    if (error) throw error;
    return normalizeTodoRow(data as TodoRow);
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

    if (error) throw error;
    return normalizeTodoRow(data as TodoRow);
}

export async function completeTaskWithRecurrence(
    supabase: SupabaseClient,
    task: TodoRow,
    nextIsDone: boolean,
    preferredTimeZone?: string | null,
): Promise<CompleteTaskResult> {
    if (!nextIsDone || !task.recurrence_rule) {
        return {
            completedTask: await setTaskCompletion(supabase, task.id, nextIsDone),
            nextTask: null,
        };
    }

    const nextDeadline = getNextRecurringDeadline(task);
    const completedTask = await setTaskCompletion(supabase, task.id, true);

    if (!nextDeadline) {
        return { completedTask, nextTask: null };
    }

    try {
        const { data, error } = await supabase
            .from("todos")
            .insert({
                user_id: task.user_id,
                list_id: task.list_id,
                section_id: task.section_id ?? null,
                title: task.title.trim(),
                description: task.description?.trim() ? task.description.trim() : null,
                ...nextDeadline,
                ...buildTaskReminderMutation(nextDeadline, task.reminder_offset_minutes ?? null, preferredTimeZone),
                recurrence_rule: task.recurrence_rule,
                priority: task.priority ?? null,
                estimated_minutes: task.estimated_minutes ?? null,
            })
            .select(TODO_FIELDS)
            .single();

        if (error) throw error;

        return {
            completedTask,
            nextTask: normalizeTodoRow(data as TodoRow),
        };
    } catch (error) {
        try {
            await setTaskCompletion(supabase, task.id, false);
        } catch (rollbackError) {
            console.error("Unable to roll back recurring task completion:", rollbackError);
        }

        throw error;
    }
}

export async function deleteTask(supabase: SupabaseClient, taskId: string) {
    const { error } = await supabase.from("todos").delete().eq("id", taskId);
    if (error) throw error;
}

export async function deleteTaskAttachment(
    supabase: SupabaseClient,
    attachment: Pick<TodoImageRow, "id" | "path">,
) {
    const { error: dbError } = await supabase.from("todo_images").delete().eq("id", attachment.id);
    if (dbError) throw dbError;

    const { error: storageError } = await supabase.storage.from("todo-images").remove([attachment.path]);

    return {
        cleanupWarning: storageError?.message ?? null,
    };
}

export async function uploadTaskAttachments(
    supabase: SupabaseClient,
    userId: string,
    taskId: string,
    listId: string,
    files: File[],
) {
    for (const file of files) {
        const path = `${userId}/${taskId}/${crypto.randomUUID()}-${sanitizeAttachmentFileName(file.name)}`;

        const { error: uploadError } = await supabase.storage.from("todo-images").upload(path, file, {
            upsert: false,
            contentType: file.type || undefined,
        });

        if (uploadError) throw uploadError;

        const metadataPayload = {
            todo_id: taskId,
            user_id: userId,
            list_id: listId,
            path,
            original_name: file.name,
            mime_type: file.type || null,
            size_bytes: file.size,
        };

        const { error: dbError } = await supabase.from("todo_images").insert(metadataPayload);

        if (!dbError) continue;

        await supabase.storage.from("todo-images").remove([path]);
        throw dbError;
    }
}

export const uploadTaskImages = uploadTaskAttachments;
