import type { FileOptions } from "@supabase/storage-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getNextTaskPosition } from "~/lib/task-ordering";
import { getNextRecurringDeadline, isRecurrenceRule } from "~/lib/task-recurrence";
import { MAX_ATTACHMENT_SIZE_BYTES, sanitizeAttachmentFileName } from "~/lib/task-attachments";
import { buildTaskDeadlineMutation } from "~/lib/task-deadlines";
import {
    getDefaultTaskLabelColorToken,
    normalizeTaskLabel,
    normalizeTaskLabelName,
    sortTaskLabels,
    TASK_LABEL_FIELDS,
} from "~/lib/task-labels";
import { buildTaskReminderMutation, normalizeReminderOffsetMinutes } from "~/lib/task-reminders";
import type { RecurrenceRule, TaskLabel, TodoImageRow, TodoRow } from "~/lib/types";

interface CreateTaskInput {
    userId: string;
    listId: string;
    sectionId?: string | null;
    assigneeUserId?: string | null;
    title: string;
    description?: string;
    dueDate?: string | null;
    dueTime?: string | null;
    reminderOffsetMinutes?: number | null;
    recurrenceRule?: RecurrenceRule | null;
    priority?: "high" | "medium" | "low" | null;
    estimatedMinutes?: number | null;
    position?: number | null;
    preferredTimeZone?: string | null;
}

interface UpdateTaskInput {
    id: string;
    title: string;
    description?: string | null;
    dueDate?: string | null;
    dueTime?: string | null;
    reminderOffsetMinutes?: number | null;
    recurrenceRule?: RecurrenceRule | null;
    priority?: "high" | "medium" | "low" | null;
    estimatedMinutes?: number | null;
    listId: string;
    sectionId?: string | null;
    assigneeUserId?: string | null;
    position?: number | null;
    preferredTimeZone?: string | null;
}

export const TODO_FIELDS =
    "id, user_id, list_id, section_id, assignee_user_id, position, title, is_done, inserted_at, description, due_date, deadline_on, deadline_at, reminder_offset_minutes, reminder_at, recurrence_rule, priority, estimated_minutes, completed_at, updated_at";

export interface CompleteTaskResult {
    completedTask: TodoRow;
    nextTask: TodoRow | null;
}

export function normalizeTodoRow(row: TodoRow): TodoRow {
    return {
        ...row,
        section_id: row.section_id ?? null,
        assignee_user_id: row.assignee_user_id ?? null,
        position: row.position ?? 0,
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

async function loadNextTaskPosition(
    supabase: SupabaseClient,
    listId: string,
    sectionId?: string | null,
) {
    let query = supabase
        .from("todos")
        .select("id, section_id, position, inserted_at, is_done")
        .eq("list_id", listId)
        .order("position", { ascending: false })
        .order("inserted_at", { ascending: false })
        .limit(1);

    query = sectionId
        ? query.eq("section_id", sectionId)
        : query.is("section_id", null);

    const { data, error } = await query;
    if (error) throw error;

    return getNextTaskPosition((data ?? []) as Array<Pick<TodoRow, "id" | "section_id" | "position" | "inserted_at" | "is_done">>);
}

export async function createTask(
    supabase: SupabaseClient,
    { userId, listId, sectionId, assigneeUserId, title, description, dueDate, dueTime, reminderOffsetMinutes, recurrenceRule, priority, estimatedMinutes, position, preferredTimeZone }: CreateTaskInput,
): Promise<TodoRow> {
    const deadlineMutation = buildTaskDeadlineMutation(dueDate, dueTime, preferredTimeZone);
    const nextPosition = typeof position === "number"
        ? position
        : await loadNextTaskPosition(supabase, listId, sectionId ?? null);

    const { data, error } = await supabase
        .from("todos")
        .insert({
            user_id: userId,
            list_id: listId,
            section_id: sectionId ?? null,
            assignee_user_id: assigneeUserId ?? null,
            position: nextPosition,
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
    const createdTask = normalizeTodoRow(data as TodoRow);
    return createdTask;
}

export async function updateTask(supabase: SupabaseClient, input: UpdateTaskInput): Promise<TodoRow> {
    const deadlineMutation = buildTaskDeadlineMutation(input.dueDate, input.dueTime, input.preferredTimeZone);
    const payload: Record<string, unknown> = {
        title: input.title.trim(),
        description: input.description?.trim() ? input.description.trim() : null,
        ...deadlineMutation,
        ...buildTaskReminderMutation(deadlineMutation, input.reminderOffsetMinutes, input.preferredTimeZone),
        recurrence_rule: input.recurrenceRule ?? null,
        priority: input.priority ?? null,
        list_id: input.listId,
        section_id: input.sectionId ?? null,
        estimated_minutes: input.estimatedMinutes ?? null,
    };

    if (typeof input.assigneeUserId !== "undefined") {
        payload.assignee_user_id = input.assigneeUserId ?? null;
    }

    if (typeof input.position === "number") {
        payload.position = input.position;
    }

    const { data, error } = await supabase
        .from("todos")
        .update(payload)
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
    actorUserId?: string | null,
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
    const updatedTask = normalizeTodoRow(data as TodoRow);
    return updatedTask;
}

export async function completeTaskWithRecurrence(
    supabase: SupabaseClient,
    task: TodoRow,
    nextIsDone: boolean,
    preferredTimeZone?: string | null,
    actorUserId?: string | null,
): Promise<CompleteTaskResult> {
    if (!nextIsDone || !task.recurrence_rule) {
        return {
            completedTask: await setTaskCompletion(supabase, task.id, nextIsDone, actorUserId),
            nextTask: null,
        };
    }

    const nextDeadline = getNextRecurringDeadline(task);
    const completedTask = await setTaskCompletion(supabase, task.id, true, actorUserId);

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
                assignee_user_id: task.assignee_user_id ?? null,
                position: await loadNextTaskPosition(supabase, task.list_id, task.section_id ?? null),
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
            await setTaskCompletion(supabase, task.id, false, actorUserId);
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
    onProgress?: (fileName: string, progress: number) => void,
) {
    for (const file of files) {
        if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
            throw new Error(`File "${file.name}" exceeds the 5MB limit.`);
        }
        const path = `${userId}/${taskId}/${crypto.randomUUID()}-${sanitizeAttachmentFileName(file.name)}`;

        const uploadOptions: FileOptions & {
            onUploadProgress?: (progress: { loaded: number; total: number }) => void;
        } = {
            upsert: false,
            contentType: file.type || undefined,
            onUploadProgress: (progress: { loaded: number; total: number }) => {
                if (onProgress) {
                    const percent = (progress.loaded / progress.total) * 100;
                    onProgress(file.name, percent);
                }
            },
        };

        const { error: uploadError } = await supabase.storage.from("todo-images").upload(path, file, uploadOptions);

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

        if (!dbError) {
            // Ensure 100% progress is reported on success
            onProgress?.(file.name, 100);
            continue;
        }

        await supabase.storage.from("todo-images").remove([path]);
        throw dbError;
    }
}

export const uploadTaskImages = uploadTaskAttachments;

export async function replaceTaskLabels(
    supabase: SupabaseClient,
    {
        labelNames,
        taskId,
        userId,
    }: {
        labelNames: string[];
        taskId: string;
        userId: string;
    },
): Promise<TaskLabel[]> {
    const normalizedLabelNames: string[] = [];
    const seenLabelNames = new Set<string>();

    labelNames.forEach((name) => {
        const normalizedName = normalizeTaskLabelName(name);
        if (!normalizedName) return;

        const normalizedKey = normalizedName.toLowerCase();
        if (seenLabelNames.has(normalizedKey)) return;

        seenLabelNames.add(normalizedKey);
        normalizedLabelNames.push(normalizedName);
    });

    const { data: existingLabelsData, error: existingLabelsError } = await supabase
        .from("task_labels")
        .select(TASK_LABEL_FIELDS)
        .eq("user_id", userId);

    if (existingLabelsError) throw existingLabelsError;

    const existingLabels = ((existingLabelsData ?? []) as TaskLabel[]).map(normalizeTaskLabel);
    const existingLabelsByName = new Map(existingLabels.map((label) => [label.name.toLowerCase(), label]));
    const missingLabelNames = normalizedLabelNames.filter((name) => !existingLabelsByName.has(name.toLowerCase()));
    let insertedLabels: TaskLabel[] = [];

    if (missingLabelNames.length > 0) {
        const missingLabelPayload = missingLabelNames.map((name) => ({
            user_id: userId,
            name,
            color_token: getDefaultTaskLabelColorToken(name),
        }));

        const { data: insertedLabelsData, error: insertedLabelsError } = await supabase
            .from("task_labels")
            .insert(missingLabelPayload)
            .select(TASK_LABEL_FIELDS);

        if (insertedLabelsError) throw insertedLabelsError;

        insertedLabels = ((insertedLabelsData ?? []) as TaskLabel[]).map(normalizeTaskLabel);
        insertedLabels.forEach((label) => existingLabelsByName.set(label.name.toLowerCase(), label));
    }

    const assignedLabels = sortTaskLabels(
        normalizedLabelNames
            .map((name) => existingLabelsByName.get(name.toLowerCase()))
            .filter((label): label is TaskLabel => Boolean(label)),
    );

    const { error: deleteError } = await supabase
        .from("todo_label_links")
        .delete()
        .eq("todo_id", taskId)
        .eq("user_id", userId);

    if (deleteError) throw deleteError;

    if (assignedLabels.length > 0) {
        const { error: insertLinksError } = await supabase
            .from("todo_label_links")
            .insert(assignedLabels.map((label) => ({
                todo_id: taskId,
                label_id: label.id,
                user_id: userId,
            })));

        if (insertLinksError) throw insertLinksError;
    }

    return assignedLabels;
}
