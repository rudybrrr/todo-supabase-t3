"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useData } from "~/components/data-provider";
import { useTaskDataset, type TaskDatasetRecord } from "~/hooks/use-task-dataset";
import { buildTaskDeadlineMutation, getDateInputValue } from "~/lib/task-deadlines";
import { buildTaskReminderMutation } from "~/lib/task-reminders";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { completeTaskWithRecurrence, deleteTask, updateTask } from "~/lib/task-actions";
import type { TaskPriority } from "~/lib/task-views";

interface DueDateChange {
    mode: "keep" | "set" | "clear";
    value?: string;
}

interface PriorityChange {
    mode: "keep" | "clear" | "set";
    value?: TaskPriority;
}

interface ProjectChange {
    mode: "keep" | "set";
    value?: string;
}

interface TaskBulkEditChanges {
    dueDate: DueDateChange;
    priority: PriorityChange;
    list: ProjectChange;
}

interface TaskBufferPlacement {
    bucket: string;
    index: number;
}

interface UseTaskSelectionActionsOptions {
    allTasks: TaskDatasetRecord[];
    selectableTasks: TaskDatasetRecord[];
    queueBufferedTask: (task: TaskDatasetRecord, bucket: string, index: number) => void;
    getBufferPlacement: (task: TaskDatasetRecord, nextIsDone: boolean) => TaskBufferPlacement | null;
    onTaskDeleted?: (taskId: string) => void;
}

interface TaskSelectionGestureOptions {
    shiftKey?: boolean;
    enterSelectionMode?: boolean;
}

export function dedupeTasks(tasks: TaskDatasetRecord[]) {
    const seen = new Set<string>();
    return tasks.filter((task) => {
        if (seen.has(task.id)) return false;
        seen.add(task.id);
        return true;
    });
}

export function useTaskSelectionActions({
    allTasks,
    selectableTasks,
    queueBufferedTask,
    getBufferPlacement,
    onTaskDeleted,
}: UseTaskSelectionActionsOptions) {
    const { profile } = useData();
    const { applyTaskPatch, removeTask, upsertTask } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [selectionAnchorTaskId, setSelectionAnchorTaskId] = useState<string | null>(null);
    const [bulkCompleting, setBulkCompleting] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkEditing, setBulkEditing] = useState(false);

    const selectableTaskIds = useMemo(
        () => new Set(selectableTasks.map((task) => task.id)),
        [selectableTasks],
    );
    const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
    const selectedVisibleTasks = useMemo(
        () => selectableTasks.filter((task) => selectedTaskIdSet.has(task.id)),
        [selectableTasks, selectedTaskIdSet],
    );
    const allVisibleSelected = selectableTasks.length > 0 && selectedVisibleTasks.length === selectableTasks.length;

    useEffect(() => {
        if (!selectionMode) {
            setSelectedTaskIds([]);
            setSelectionAnchorTaskId(null);
        }
    }, [selectionMode]);

    useEffect(() => {
        setSelectedTaskIds((current) => {
            const next = current.filter((taskId) => selectableTaskIds.has(taskId));
            return next.length === current.length ? current : next;
        });
        setSelectionAnchorTaskId((current) => current && selectableTaskIds.has(current) ? current : null);
    }, [selectableTaskIds]);

    const handleToggle = useCallback(async (taskId: string, nextIsDone: boolean) => {
        const existingTask = allTasks.find((task) => task.id === taskId);
        if (!existingTask) return;

        const optimisticUpdatedAt = new Date().toISOString();
        const optimisticTask = {
            ...existingTask,
            is_done: nextIsDone,
            completed_at: nextIsDone ? optimisticUpdatedAt : null,
            updated_at: optimisticUpdatedAt,
        };
        const placement = getBufferPlacement(existingTask, nextIsDone);

        if (placement) {
            queueBufferedTask(optimisticTask, placement.bucket, placement.index);
        }

        try {
            applyTaskPatch(taskId, {
                is_done: nextIsDone,
                completed_at: nextIsDone ? optimisticUpdatedAt : null,
                updated_at: optimisticUpdatedAt,
            });
            const result = await completeTaskWithRecurrence(supabase, existingTask, nextIsDone, profile?.timezone);
            upsertTask(result.completedTask, { suppressRealtimeEcho: true });
            if (result.nextTask) {
                upsertTask(result.nextTask, { suppressRealtimeEcho: true });
            }
            toast.success(
                nextIsDone
                    ? result.nextTask
                        ? "Task completed. Next occurrence created."
                        : "Task completed."
                    : "Task reopened.",
            );
        } catch (error) {
            upsertTask(existingTask);
            toast.error(error instanceof Error ? error.message : "Unable to update task.");
        }
    }, [allTasks, applyTaskPatch, getBufferPlacement, profile?.timezone, queueBufferedTask, supabase, upsertTask]);

    const handleToggleTaskSelection = useCallback((task: TaskDatasetRecord, options?: TaskSelectionGestureOptions) => {
        const shiftKey = options?.shiftKey ?? false;
        const enterSelectionMode = options?.enterSelectionMode ?? false;

        if (enterSelectionMode) {
            setSelectionMode(true);
        }

        const targetIndex = selectableTasks.findIndex((item) => item.id === task.id);
        if (targetIndex === -1) return;

        if (shiftKey) {
            const hasExistingSelection = selectedTaskIds.length > 0;
            const anchorTaskId = hasExistingSelection && selectionAnchorTaskId && selectableTaskIds.has(selectionAnchorTaskId)
                ? selectionAnchorTaskId
                : task.id;
            const anchorIndex = selectableTasks.findIndex((item) => item.id === anchorTaskId);
            const rangeStart = Math.min(anchorIndex === -1 ? targetIndex : anchorIndex, targetIndex);
            const rangeEnd = Math.max(anchorIndex === -1 ? targetIndex : anchorIndex, targetIndex);
            const rangeTaskIds = selectableTasks.slice(rangeStart, rangeEnd + 1).map((item) => item.id);

            setSelectedTaskIds((current) => Array.from(new Set([...current, ...rangeTaskIds])));
            setSelectionAnchorTaskId(anchorTaskId);
            return;
        }

        setSelectedTaskIds((current) => current.includes(task.id)
            ? current.filter((taskId) => taskId !== task.id)
            : [...current, task.id]);
        setSelectionAnchorTaskId(task.id);
    }, [selectableTaskIds, selectableTasks, selectedTaskIds.length, selectionAnchorTaskId]);

    const handleToggleSelectionMode = useCallback(() => {
        setSelectionMode((current) => !current);
    }, []);

    const handleCancelSelectionMode = useCallback(() => {
        setSelectedTaskIds([]);
        setSelectionAnchorTaskId(null);
        setSelectionMode(false);
    }, []);

    const handleToggleSelectAll = useCallback(() => {
        if (allVisibleSelected) {
            setSelectedTaskIds([]);
            return;
        }

        setSelectedTaskIds(selectableTasks.map((task) => task.id));
    }, [allVisibleSelected, selectableTasks]);

    const handleCompleteSelected = useCallback(async () => {
        const tasksToComplete = selectedVisibleTasks.filter((task) => !task.is_done);
        if (tasksToComplete.length === 0) return;

        setBulkCompleting(true);
        const optimisticUpdatedAt = new Date().toISOString();

        for (const task of tasksToComplete) {
            const optimisticTask = {
                ...task,
                is_done: true,
                completed_at: optimisticUpdatedAt,
                updated_at: optimisticUpdatedAt,
            };
            const placement = getBufferPlacement(task, true);

            if (placement) {
                queueBufferedTask(optimisticTask, placement.bucket, placement.index);
            }

            applyTaskPatch(task.id, {
                is_done: true,
                completed_at: optimisticUpdatedAt,
                updated_at: optimisticUpdatedAt,
            });
        }

        const results = await Promise.allSettled(
            tasksToComplete.map((task) => completeTaskWithRecurrence(supabase, task, true, profile?.timezone)),
        );

        let successCount = 0;
        let recurringCount = 0;
        const failedTaskIds: string[] = [];

        results.forEach((result, index) => {
            const originalTask = tasksToComplete[index];
            if (!originalTask) return;

            if (result.status === "fulfilled") {
                upsertTask(result.value.completedTask, { suppressRealtimeEcho: true });
                if (result.value.nextTask) {
                    upsertTask(result.value.nextTask, { suppressRealtimeEcho: true });
                    recurringCount += 1;
                }
                successCount += 1;
                return;
            }

            upsertTask(originalTask);
            failedTaskIds.push(originalTask.id);
        });

        if (successCount > 0) {
            toast.success(
                recurringCount > 0
                    ? `${successCount} task${successCount === 1 ? "" : "s"} completed, ${recurringCount} repeated.`
                    : `${successCount} task${successCount === 1 ? "" : "s"} completed.`,
            );
        }
        if (failedTaskIds.length > 0) {
            toast.error(`${failedTaskIds.length} task${failedTaskIds.length === 1 ? "" : "s"} failed to update.`);
        }

        setSelectedTaskIds(failedTaskIds);
        if (failedTaskIds.length === 0) {
            setSelectionMode(false);
        }
        setBulkCompleting(false);
    }, [applyTaskPatch, getBufferPlacement, profile?.timezone, queueBufferedTask, selectedVisibleTasks, supabase, upsertTask]);

    const handleDeleteSelected = useCallback(async () => {
        if (selectedVisibleTasks.length === 0) return;

        setBulkDeleting(true);

        const results = await Promise.allSettled(
            selectedVisibleTasks.map((task) => deleteTask(supabase, task.id)),
        );

        let successCount = 0;
        const failedTaskIds: string[] = [];

        results.forEach((result, index) => {
            const task = selectedVisibleTasks[index];
            if (!task) return;

            if (result.status === "fulfilled") {
                removeTask(task.id, { suppressRealtimeEcho: true });
                onTaskDeleted?.(task.id);
                successCount += 1;
                return;
            }

            failedTaskIds.push(task.id);
        });

        if (successCount > 0) {
            toast.success(`${successCount} task${successCount === 1 ? "" : "s"} deleted.`);
        }
        if (failedTaskIds.length > 0) {
            toast.error(`${failedTaskIds.length} task${failedTaskIds.length === 1 ? "" : "s"} failed to delete.`);
        }

        setSelectedTaskIds(failedTaskIds);
        if (failedTaskIds.length === 0) {
            setSelectionMode(false);
        }
        setBulkDeleting(false);
    }, [onTaskDeleted, removeTask, selectedVisibleTasks, supabase]);

    const handleEditSelected = useCallback(async (changes: TaskBulkEditChanges) => {
        if (selectedVisibleTasks.length === 0) return;

        setBulkEditing(true);
        const optimisticUpdatedAt = new Date().toISOString();
        const tasksToUpdate = selectedVisibleTasks.map((task) => {
            const nextDueDate = changes.dueDate.mode === "keep"
                ? (getDateInputValue(task) || null)
                : changes.dueDate.mode === "clear"
                    ? null
                    : (changes.dueDate.value ?? null);
            const nextReminderOffsetMinutes = nextDueDate ? task.reminder_offset_minutes ?? null : null;
            const nextRecurrenceRule = nextDueDate ? task.recurrence_rule ?? null : null;
            const nextPriority = changes.priority.mode === "keep"
                ? task.priority ?? null
                : changes.priority.mode === "clear"
                    ? null
                    : (changes.priority.value ?? null);
            const nextListId = changes.list.mode === "keep"
                ? task.list_id
                : (changes.list.value ?? task.list_id);
            const nextSectionId = changes.list.mode === "keep"
                ? task.section_id ?? null
                : null;

            return { originalTask: task, nextDueDate, nextReminderOffsetMinutes, nextRecurrenceRule, nextPriority, nextListId, nextSectionId };
        });

        for (const { originalTask, nextDueDate, nextReminderOffsetMinutes, nextRecurrenceRule, nextPriority, nextListId, nextSectionId } of tasksToUpdate) {
            const deadlinePatch = buildTaskDeadlineMutation(nextDueDate);
            applyTaskPatch(originalTask.id, {
                ...deadlinePatch,
                ...buildTaskReminderMutation(deadlinePatch, nextReminderOffsetMinutes, profile?.timezone),
                recurrence_rule: nextRecurrenceRule,
                priority: nextPriority,
                list_id: nextListId,
                section_id: nextSectionId,
                updated_at: optimisticUpdatedAt,
            });
        }

        const results = await Promise.allSettled(
            tasksToUpdate.map(({ originalTask, nextDueDate, nextReminderOffsetMinutes, nextRecurrenceRule, nextPriority, nextListId, nextSectionId }) => updateTask(supabase, {
                id: originalTask.id,
                title: originalTask.title,
                description: originalTask.description ?? null,
                dueDate: nextDueDate,
                reminderOffsetMinutes: nextReminderOffsetMinutes,
                recurrenceRule: nextRecurrenceRule,
                priority: nextPriority,
                estimatedMinutes: originalTask.estimated_minutes ?? null,
                listId: nextListId,
                sectionId: nextSectionId,
                preferredTimeZone: profile?.timezone,
            })),
        );

        let successCount = 0;
        const failedTaskIds: string[] = [];

        results.forEach((result, index) => {
            const taskUpdate = tasksToUpdate[index];
            if (!taskUpdate) return;

            if (result.status === "fulfilled") {
                upsertTask(result.value, { suppressRealtimeEcho: true });
                successCount += 1;
                return;
            }

            upsertTask(taskUpdate.originalTask);
            failedTaskIds.push(taskUpdate.originalTask.id);
        });

        if (successCount > 0) {
            toast.success(`${successCount} task${successCount === 1 ? "" : "s"} updated.`);
        }
        if (failedTaskIds.length > 0) {
            toast.error(`${failedTaskIds.length} task${failedTaskIds.length === 1 ? "" : "s"} failed to update.`);
        }

        setBulkEditing(false);
    }, [applyTaskPatch, profile?.timezone, selectedVisibleTasks, supabase, upsertTask]);

    const handleSetSelectedDueDate = useCallback((value: string | null) => {
        void handleEditSelected({
            dueDate: value ? { mode: "set", value } : { mode: "clear" },
            priority: { mode: "keep" },
            list: { mode: "keep" },
        });
    }, [handleEditSelected]);

    const handleSetSelectedPriority = useCallback((value: TaskPriority | null) => {
        void handleEditSelected({
            dueDate: { mode: "keep" },
            priority: value ? { mode: "set", value } : { mode: "clear" },
            list: { mode: "keep" },
        });
    }, [handleEditSelected]);

    const handleMoveSelectedTasks = useCallback((listId: string) => {
        void handleEditSelected({
            dueDate: { mode: "keep" },
            priority: { mode: "keep" },
            list: { mode: "set", value: listId },
        });
    }, [handleEditSelected]);

    return {
        selectionMode,
        selectedTaskIdSet,
        selectedVisibleTasks,
        allVisibleSelected,
        bulkCompleting,
        bulkDeleting,
        bulkEditing,
        selectedCount: selectedTaskIds.length,
        handleToggle,
        handleToggleTaskSelection,
        handleToggleSelectionMode,
        handleCancelSelectionMode,
        handleToggleSelectAll,
        handleCompleteSelected,
        handleDeleteSelected,
        handleSetSelectedDueDate,
        handleSetSelectedPriority,
        handleMoveSelectedTasks,
    };
}
