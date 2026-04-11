"use client";

import { addDays, format, startOfDay } from "date-fns";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarRange, Check, ChevronLeft, ChevronRight, FileText, Play, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useData } from "~/components/data-provider";
import { useFocus } from "~/components/focus-provider";
import { TaskAttachmentUpload } from "~/components/task-attachment-upload";
import { TaskStepsSection } from "~/components/task-steps-section";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { TaskDueDatePicker } from "~/components/task-due-date-picker";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Textarea } from "~/components/ui/textarea";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { useTaskSections } from "~/hooks/use-task-sections";
import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import {
    findNextPlannerSlot,
    findPlannerSlotForDate,
    formatBlockTimeRange,
    formatMinutesCompact,
    getPlannerDateFromMinutes,
    getPlanningStatusLabel,
    toDateKey,
} from "~/lib/planning";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { formatAttachmentSize, getAttachmentDisplayName, getAttachmentExtension, isImageAttachment } from "~/lib/task-attachments";
import { deleteTask, deleteTaskAttachment, completeTaskWithRecurrence, updateTask } from "~/lib/task-actions";
import { buildTaskDeadlineMutation, getDateInputValue } from "~/lib/task-deadlines";
import { canTaskRecur, getRecurrenceLabel, RECURRENCE_RULE_OPTIONS } from "~/lib/task-recurrence";
import {
    buildTaskReminderMutation,
    formatTaskReminderScheduledLabel,
    getReminderOffsetInputValue,
    getReminderOffsetLabel,
    getReminderOffsetMinutesFromInput,
    REMINDER_OFFSET_OPTIONS,
} from "~/lib/task-reminders";
import type { PlannedFocusBlock, RecurrenceRule, TodoImageRow, TodoList } from "~/lib/types";
import { cn } from "~/lib/utils";

type TaskDetailFormSnapshot = {
    title: string;
    description: string;
    priority: "high" | "medium" | "low" | "";
    dueDate: string;
    reminderOffsetMinutes: string;
    recurrenceRule: RecurrenceRule | "";
    estimatedMinutes: string;
    listId: string;
    sectionId: string;
};

type TaskDetailFormSyncInput = Pick<TaskDatasetRecord, "id" | "title" | "description" | "priority" | "due_date" | "deadline_on" | "deadline_at" | "reminder_offset_minutes" | "recurrence_rule" | "estimated_minutes" | "list_id" | "section_id" | "is_done">;

type TaskDetailSnapshotComparisonContext = {
    sectionsEnabled: boolean;
    sectionsLoading: boolean;
    validSectionIds: ReadonlySet<string>;
};

function createTaskDetailFormSnapshot(
    task: Pick<TaskDatasetRecord, "title" | "description" | "priority" | "due_date" | "deadline_on" | "deadline_at" | "reminder_offset_minutes" | "recurrence_rule" | "estimated_minutes" | "list_id" | "section_id">,
    timeZone?: string | null,
): TaskDetailFormSnapshot {
    return {
        title: task.title,
        description: task.description ?? "",
        priority: task.priority ?? "",
        dueDate: getDateInputValue(task, timeZone),
        reminderOffsetMinutes: getReminderOffsetInputValue(task.reminder_offset_minutes),
        recurrenceRule: task.recurrence_rule ?? "",
        estimatedMinutes: task.estimated_minutes ? String(task.estimated_minutes) : "",
        listId: task.list_id,
        sectionId: task.section_id ?? "",
    };
}

function areTaskDetailFormSnapshotsEqual(a: TaskDetailFormSnapshot, b: TaskDetailFormSnapshot) {
    return a.title === b.title
        && a.description === b.description
        && a.priority === b.priority
        && a.dueDate === b.dueDate
        && a.reminderOffsetMinutes === b.reminderOffsetMinutes
        && a.recurrenceRule === b.recurrenceRule
        && a.estimatedMinutes === b.estimatedMinutes
        && a.listId === b.listId
        && a.sectionId === b.sectionId;
}

function normalizeTaskDetailLineBreaks(value: string) {
    return value.replace(/\r\n?/g, "\n");
}

function normalizeTaskDetailRequiredText(value: string) {
    return normalizeTaskDetailLineBreaks(value).trim();
}

function normalizeTaskDetailOptionalText(value: string) {
    const normalized = normalizeTaskDetailLineBreaks(value).trim();
    return normalized ? normalized : "";
}

function normalizeTaskDetailEstimatedMinutes(value: string) {
    const normalized = value.trim();

    if (!normalized) return "";
    if (/^\d+$/.test(normalized)) {
        return String(Number.parseInt(normalized, 10));
    }

    return normalized;
}

function normalizeTaskDetailSectionId(sectionId: string, context: TaskDetailSnapshotComparisonContext) {
    const normalizedSectionId = sectionId || "";

    if (!context.sectionsEnabled) return "";
    if (context.sectionsLoading) return normalizedSectionId;
    if (!normalizedSectionId) return "";

    return context.validSectionIds.has(normalizedSectionId) ? normalizedSectionId : "";
}

function createComparableTaskDetailFormSnapshot(
    snapshot: TaskDetailFormSnapshot,
    context: TaskDetailSnapshotComparisonContext,
): TaskDetailFormSnapshot {
    return {
        title: normalizeTaskDetailRequiredText(snapshot.title),
        description: normalizeTaskDetailOptionalText(snapshot.description),
        priority: snapshot.priority || "",
        dueDate: snapshot.dueDate || "",
        reminderOffsetMinutes: snapshot.reminderOffsetMinutes || "",
        recurrenceRule: snapshot.recurrenceRule || "",
        estimatedMinutes: normalizeTaskDetailEstimatedMinutes(snapshot.estimatedMinutes),
        listId: snapshot.listId,
        sectionId: normalizeTaskDetailSectionId(snapshot.sectionId, context),
    };
}

function selectPreferredPlannedBlock(blocks: PlannedFocusBlock[]) {
    if (blocks.length === 0) return null;

    const now = Date.now();
    const upcomingBlock = [...blocks]
        .filter((block) => new Date(block.scheduled_start).getTime() >= now)
        .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))[0];

    if (upcomingBlock) return upcomingBlock;

    return [...blocks].sort((a, b) => b.scheduled_start.localeCompare(a.scheduled_start))[0] ?? null;
}

function getPlanningStatusVariant(task: TaskDatasetRecord) {
    if (task.planning_status === "fully_planned") return "success";
    if (task.planning_status === "partially_planned") return "warning";
    if (task.planning_status === "overplanned") return "warning";
    return "secondary";
}

function TaskDetailForm({
    task,
    lists,
    images,
    userId,
    onClose,
    previousTask,
    nextTask,
    taskPositionLabel,
    onNavigateToTask,
    onDirtyChange,
    onSaved,
    onDeleted,
}: {
    task: TaskDatasetRecord;
    lists: TodoList[];
    images: TodoImageRow[];
    userId: string;
    onClose?: () => void;
    previousTask?: TaskDatasetRecord | null;
    nextTask?: TaskDatasetRecord | null;
    taskPositionLabel?: string | null;
    onNavigateToTask?: (taskId: string) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onSaved: () => void;
    onDeleted: () => void;
}) {
    const router = useRouter();
    const { profile } = useData();
    const { applyTaskPatch, plannedBlocks, refresh, removeTask, upsertTask } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { setCurrentListId, setCurrentTaskId, setCurrentBlockId, handleModeChange, setIsActive } = useFocus();
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description ?? "");
    const [priority, setPriority] = useState<"high" | "medium" | "low" | "">(task.priority ?? "");
    const [dueDate, setDueDate] = useState(getDateInputValue(task, profile?.timezone));
    const [reminderOffsetMinutes, setReminderOffsetMinutes] = useState(getReminderOffsetInputValue(task.reminder_offset_minutes));
    const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule | "">(task.recurrence_rule ?? "");
    const [estimatedMinutes, setEstimatedMinutes] = useState(task.estimated_minutes ? String(task.estimated_minutes) : "");
    const [listId, setListId] = useState(task.list_id);
    const [sectionId, setSectionId] = useState(task.section_id ?? "");
    const [isDone, setIsDone] = useState(task.is_done);
    const [saving, setSaving] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
    const initializedTaskIdRef = useRef<string | null>(null);
    const lastSyncedSnapshotRef = useRef<TaskDetailFormSnapshot | null>(null);
    const activeList = lists.find((list) => list.id === listId) ?? null;
    const sectionsEnabled = Boolean(activeList && activeList.name.toLowerCase() !== "inbox");
    const { sections, loading: sectionsLoading } = useTaskSections(listId, { enabled: sectionsEnabled });
    const showSectionSelector = sectionsEnabled && (sectionsLoading || sections.length > 0 || Boolean(sectionId));
    const validSectionIds = useMemo(() => new Set(sections.map((section) => section.id)), [sections]);
    const linkedPlannedBlocks = useMemo(
        () => plannedBlocks.filter((block) => block.todo_id === task.id),
        [plannedBlocks, task.id],
    );
    const preferredPlannedBlock = useMemo(
        () => selectPreferredPlannedBlock(linkedPlannedBlocks),
        [linkedPlannedBlocks],
    );

    const currentFormSnapshot = useMemo<TaskDetailFormSnapshot>(() => ({
        title,
        description,
        priority,
        dueDate,
        reminderOffsetMinutes,
        recurrenceRule,
        estimatedMinutes,
        listId,
        sectionId,
    }), [description, dueDate, estimatedMinutes, listId, priority, recurrenceRule, reminderOffsetMinutes, sectionId, title]);
    const taskSnapshot = useMemo(() => createTaskDetailFormSnapshot(task, profile?.timezone), [profile?.timezone, task]);
    const comparableCurrentFormSnapshot = useMemo(() => createComparableTaskDetailFormSnapshot(currentFormSnapshot, {
        sectionsEnabled,
        sectionsLoading,
        validSectionIds,
    }), [currentFormSnapshot, sectionsEnabled, sectionsLoading, validSectionIds]);
    const comparableTaskSnapshot = useMemo(() => createComparableTaskDetailFormSnapshot(taskSnapshot, {
        sectionsEnabled,
        sectionsLoading,
        validSectionIds,
    }), [sectionsEnabled, sectionsLoading, taskSnapshot, validSectionIds]);
    const comparableLastSyncedSnapshot = lastSyncedSnapshotRef.current
        ? createComparableTaskDetailFormSnapshot(lastSyncedSnapshotRef.current, {
            sectionsEnabled,
            sectionsLoading,
            validSectionIds,
        })
        : null;

    const syncFormState = useCallback((nextTask: TaskDetailFormSyncInput) => {
        const nextSnapshot = createTaskDetailFormSnapshot(nextTask, profile?.timezone);

        setTitle(nextSnapshot.title);
        setDescription(nextSnapshot.description);
        setPriority(nextSnapshot.priority);
        setDueDate(nextSnapshot.dueDate);
        setReminderOffsetMinutes(nextSnapshot.reminderOffsetMinutes);
        setRecurrenceRule(nextSnapshot.recurrenceRule);
        setEstimatedMinutes(nextSnapshot.estimatedMinutes);
        setListId(nextSnapshot.listId);
        setSectionId(nextSnapshot.sectionId);
        setIsDone(nextTask.is_done);
        initializedTaskIdRef.current = nextTask.id;
        lastSyncedSnapshotRef.current = nextSnapshot;
    }, [profile?.timezone]);

    const planningStatusLabel = useMemo(
        () => getPlanningStatusLabel(task.planning_status),
        [task.planning_status],
    );
    const plannedTimeLabel = useMemo(
        () => formatMinutesCompact(task.planned_minutes),
        [task.planned_minutes],
    );
    const remainingEstimateLabel = useMemo(() => {
        if (task.remaining_estimated_minutes == null) {
            return task.planned_minutes > 0 ? "Scheduled" : "No estimate";
        }

        if (task.planning_status === "overplanned" && task.estimated_minutes) {
            return `${formatMinutesCompact(Math.max(task.planned_minutes - task.estimated_minutes, 0))} over`;
        }

        if (task.remaining_estimated_minutes === 0) {
            return "Estimate covered";
        }

        return `${formatMinutesCompact(task.remaining_estimated_minutes)} left`;
    }, [task.estimated_minutes, task.planned_minutes, task.planning_status, task.remaining_estimated_minutes]);
    const nextBlockLabel = useMemo(
        () => preferredPlannedBlock
            ? formatBlockTimeRange(preferredPlannedBlock.scheduled_start, preferredPlannedBlock.scheduled_end)
            : "No scheduled block",
        [preferredPlannedBlock],
    );
    const defaultScheduleDuration = useMemo(
        () => task.remaining_estimated_minutes ?? task.estimated_minutes ?? 60,
        [task.estimated_minutes, task.remaining_estimated_minutes],
    );
    const recurrenceLabel = useMemo(
        () => getRecurrenceLabel(recurrenceRule || null),
        [recurrenceRule],
    );
    const parsedReminderOffsetMinutes = useMemo(
        () => getReminderOffsetMinutesFromInput(reminderOffsetMinutes),
        [reminderOffsetMinutes],
    );
    const reminderLabel = useMemo(
        () => parsedReminderOffsetMinutes == null ? null : getReminderOffsetLabel(parsedReminderOffsetMinutes),
        [parsedReminderOffsetMinutes],
    );
    const reminderPreviewAt = useMemo(() => {
        const deadlinePatch = buildTaskDeadlineMutation(dueDate || null);
        return buildTaskReminderMutation(deadlinePatch, parsedReminderOffsetMinutes, profile?.timezone).reminder_at;
    }, [dueDate, parsedReminderOffsetMinutes, profile?.timezone]);
    const reminderScheduledLabel = useMemo(
        () => formatTaskReminderScheduledLabel(reminderPreviewAt, profile?.timezone),
        [profile?.timezone, reminderPreviewAt],
    );

    useEffect(() => {
        const switchingTasks = initializedTaskIdRef.current !== task.id;
        const hasLocalEdits = comparableLastSyncedSnapshot
            ? !areTaskDetailFormSnapshotsEqual(comparableCurrentFormSnapshot, comparableLastSyncedSnapshot)
            : false;
        const taskSnapshotChanged = comparableLastSyncedSnapshot
            ? !areTaskDetailFormSnapshotsEqual(comparableLastSyncedSnapshot, comparableTaskSnapshot)
            : true;

        if (!switchingTasks && (hasLocalEdits || !taskSnapshotChanged)) {
            return;
        }

        syncFormState(task);

        if (switchingTasks) {
            setDeletingAttachmentId(null);
        }
    }, [comparableCurrentFormSnapshot, comparableLastSyncedSnapshot, comparableTaskSnapshot, syncFormState, task]);

    const isDirty = initializedTaskIdRef.current === task.id && comparableLastSyncedSnapshot
        ? !areTaskDetailFormSnapshotsEqual(comparableCurrentFormSnapshot, comparableLastSyncedSnapshot)
        : false;

    useEffect(() => {
        if (!sectionsEnabled) {
            if (sectionId) {
                setSectionId("");
            }
            return;
        }

        if (sectionsLoading) return;

        if (sectionId && !sections.some((section) => section.id === sectionId)) {
            setSectionId("");
        }
    }, [sectionId, sections, sectionsEnabled, sectionsLoading]);

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    useEffect(() => {
        return () => {
            onDirtyChange?.(false);
        };
    }, [onDirtyChange]);

    async function handleSave() {
        const normalizedTitle = title.trim();
        const normalizedDescription = description.trim() ? description.trim() : null;
        const normalizedDueDate = dueDate || null;
        const normalizedReminderOffsetMinutes = parsedReminderOffsetMinutes;
        const normalizedRecurrenceRule = recurrenceRule || null;
        const normalizedPriority = priority || null;
        const normalizedEstimatedMinutes = estimatedMinutes ? Number.parseInt(estimatedMinutes, 10) : null;
        const normalizedSectionId = sectionId || null;
        const optimisticUpdatedAt = new Date().toISOString();
        const deadlinePatch = buildTaskDeadlineMutation(normalizedDueDate);
        const reminderPatch = buildTaskReminderMutation(deadlinePatch, normalizedReminderOffsetMinutes, profile?.timezone);

        if (normalizedReminderOffsetMinutes != null && !normalizedDueDate) {
            toast.error("Reminders need a deadline.");
            return;
        }
        if (normalizedRecurrenceRule && !normalizedDueDate) {
            toast.error("Recurring tasks need a deadline.");
            return;
        }

        try {
            setSaving(true);
            applyTaskPatch(task.id, {
                title: normalizedTitle,
                description: normalizedDescription,
                ...deadlinePatch,
                ...reminderPatch,
                recurrence_rule: normalizedRecurrenceRule,
                priority: normalizedPriority,
                estimated_minutes: normalizedEstimatedMinutes,
                list_id: listId,
                section_id: normalizedSectionId,
                updated_at: optimisticUpdatedAt,
            });
            const updatedTask = await updateTask(supabase, {
                id: task.id,
                title: normalizedTitle,
                description: normalizedDescription,
                dueDate: normalizedDueDate,
                reminderOffsetMinutes: normalizedReminderOffsetMinutes,
                recurrenceRule: normalizedRecurrenceRule,
                priority: normalizedPriority,
                estimatedMinutes: normalizedEstimatedMinutes,
                listId,
                sectionId: normalizedSectionId,
                preferredTimeZone: profile?.timezone,
            });
            upsertTask(updatedTask, { suppressRealtimeEcho: true });
            syncFormState(updatedTask);
            toast.success("Task updated.");
            onSaved();
        } catch (error) {
            upsertTask(task);
            toast.error(error instanceof Error ? error.message : "Unable to update task.");
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleCompletion() {
        const optimisticUpdatedAt = new Date().toISOString();
        const nextIsDone = !isDone;

        try {
            setIsDone(nextIsDone);
            applyTaskPatch(task.id, {
                is_done: nextIsDone,
                completed_at: nextIsDone ? optimisticUpdatedAt : null,
                updated_at: optimisticUpdatedAt,
            });
            const result = await completeTaskWithRecurrence(supabase, task, nextIsDone, profile?.timezone);
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
            onSaved();
        } catch (error) {
            setIsDone(task.is_done);
            upsertTask(task);
            toast.error(error instanceof Error ? error.message : "Unable to update task status.");
        }
    }

    async function handleDelete() {
        try {
            await deleteTask(supabase, task.id);
            removeTask(task.id, { suppressRealtimeEcho: true });
            toast.success("Task deleted.");
            setDeleteOpen(false);
            onDeleted();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to delete task.");
        }
    }

    function handleStartFocus() {
        setCurrentListId(task.list_id);
        setCurrentTaskId(task.id);
        setCurrentBlockId(preferredPlannedBlock?.id ?? null);
        handleModeChange("focus");
        setIsActive(true);
        router.push("/focus");
        toast.success("Focus session started.");
    }

    function openPlannerWithPrefill(options?: {
        date?: string;
        startTime?: string;
        durationMinutes?: number;
        preferExistingBlock?: boolean;
        view?: "day" | "week";
    }) {
        const nextParams = new URLSearchParams({
            listId: preferredPlannedBlock?.list_id ?? task.list_id,
        });

        if (options?.preferExistingBlock && preferredPlannedBlock) {
            nextParams.set("blockId", preferredPlannedBlock.id);
        } else {
            nextParams.set("taskId", task.id);
            const nextDate = options?.date ?? dueDate;
            if (nextDate) {
                nextParams.set("date", nextDate);
            }
            if (options?.startTime) {
                nextParams.set("startTime", options.startTime);
            }
            if (options?.durationMinutes) {
                nextParams.set("duration", String(options.durationMinutes));
            }
            if (options?.view) {
                nextParams.set("view", options.view);
            }
        }

        router.push(`/calendar?${nextParams.toString()}`);
        onClose?.();
    }

    function handlePlanBlock() {
        openPlannerWithPrefill({
            preferExistingBlock: true,
            view: preferredPlannedBlock ? "week" : "day",
        });
    }

    function handleScheduleToday() {
        const today = startOfDay(new Date());
        const slot = findPlannerSlotForDate(plannedBlocks, today, defaultScheduleDuration, {
            after: new Date(),
        });

        openPlannerWithPrefill({
            date: toDateKey(today),
            startTime: slot ? format(getPlannerDateFromMinutes(slot.date, slot.startMinutes), "HH:mm") : undefined,
            durationMinutes: defaultScheduleDuration,
            view: "day",
        });
    }

    function handleScheduleTomorrow() {
        const tomorrow = startOfDay(addDays(new Date(), 1));
        const slot = findPlannerSlotForDate(plannedBlocks, tomorrow, defaultScheduleDuration);

        openPlannerWithPrefill({
            date: toDateKey(tomorrow),
            startTime: slot ? format(getPlannerDateFromMinutes(slot.date, slot.startMinutes), "HH:mm") : undefined,
            durationMinutes: defaultScheduleDuration,
            view: "day",
        });
    }

    function handleAddThirtyMinuteBlock() {
        const slot = findNextPlannerSlot(plannedBlocks, {
            after: new Date(),
            durationMinutes: 30,
        });

        openPlannerWithPrefill({
            date: toDateKey(slot.date),
            startTime: format(getPlannerDateFromMinutes(slot.date, slot.startMinutes), "HH:mm"),
            durationMinutes: 30,
            view: "day",
        });
    }

    function handleScheduleNextSlot() {
        const slot = findNextPlannerSlot(plannedBlocks, {
            after: new Date(),
            durationMinutes: defaultScheduleDuration,
        });

        openPlannerWithPrefill({
            date: toDateKey(slot.date),
            startTime: format(getPlannerDateFromMinutes(slot.date, slot.startMinutes), "HH:mm"),
            durationMinutes: defaultScheduleDuration,
            view: "day",
        });
    }

    async function handleAttachmentsUploaded() {
        await refresh({ silent: true });
        onSaved();
    }

    async function handleAttachmentDelete(attachment: TodoImageRow) {
        try {
            setDeletingAttachmentId(attachment.id);
            const result = await deleteTaskAttachment(supabase, attachment);
            await refresh({ silent: true });
            onSaved();

            if (result.cleanupWarning) {
                toast.warning("Attachment removed, but file cleanup may have been incomplete.");
                return;
            }

            toast.success("Attachment removed.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to remove attachment.");
        } finally {
            setDeletingAttachmentId((current) => (current === attachment.id ? null : current));
        }
    }

    return (
        <>
            <div className="space-y-5">
                <div className="space-y-3 border-b border-border/70 pb-4">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                {taskPositionLabel ? `Task ${taskPositionLabel}` : "Task details"}
                            </span>
                            {reminderLabel ? (
                                <Badge variant="secondary">{reminderLabel}</Badge>
                            ) : null}
                            {recurrenceRule ? (
                                <Badge variant="secondary">{recurrenceLabel}</Badge>
                            ) : null}
                            {onNavigateToTask ? (
                                <div className="inline-flex items-center rounded-md border border-border/70 bg-muted/35 p-0.5">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        className="h-6 w-6 rounded-sm"
                                        title={previousTask ? `Previous task: ${previousTask.title}` : "Previous task"}
                                        aria-label={previousTask ? `Open previous task: ${previousTask.title}` : "Previous task unavailable"}
                                        disabled={!previousTask}
                                        onClick={() => previousTask && onNavigateToTask(previousTask.id)}
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon-xs"
                                        className="h-6 w-6 rounded-sm"
                                        title={nextTask ? `Next task: ${nextTask.title}` : "Next task"}
                                        aria-label={nextTask ? `Open next task: ${nextTask.title}` : "Next task unavailable"}
                                        disabled={!nextTask}
                                        onClick={() => nextTask && onNavigateToTask(nextTask.id)}
                                    >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            {isDirty ? (
                                <Button
                                    variant="tonal"
                                    size="sm"
                                    onClick={() => void handleSave()}
                                    disabled={saving || !title.trim()}
                                >
                                    {saving ? "Saving..." : "Save"}
                                </Button>
                            ) : null}
                            {onClose ? (
                                <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">Close task details</span>
                                </Button>
                            ) : null}
                        </div>
                    </div>

                    <div className="flex items-start gap-3">
                        <button
                            type="button"
                            aria-label={isDone ? "Mark task incomplete" : "Mark task complete"}
                            onClick={() => void handleToggleCompletion()}
                            className={cn(
                                "mt-1 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md border transition-colors",
                                isDone
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border bg-card text-transparent hover:border-primary/60",
                            )}
                        >
                            <Check className="h-4 w-4" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <Input
                                id="detailTitle"
                                value={title}
                                onChange={(event) => setTitle(event.target.value)}
                                placeholder="Task title"
                                className={cn(
                                    "h-auto rounded-none border-0 bg-transparent px-0 py-0.5 text-[1rem] leading-6 font-semibold tracking-[-0.02em] shadow-none focus-visible:ring-0 sm:text-[1.05rem] md:text-[1.1rem]",
                                    isDone && "text-muted-foreground line-through",
                                )}
                            />
                            {isDirty ? (
                                <p className="mt-1 text-xs text-muted-foreground">Unsaved changes</p>
                            ) : null}
                        </div>
                    </div>
                </div>

                <section className="space-y-2">
                    <label htmlFor="detailNotes" className="sr-only">
                        Notes
                    </label>
                    <Textarea
                        id="detailNotes"
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        placeholder="Add notes"
                        className="min-h-[84px] resize-none rounded-xl border-border/70 bg-muted/20 px-3.5 py-3 text-sm leading-6 shadow-none focus-visible:ring-0"
                    />
                </section>

                <TaskStepsSection taskId={task.id} />

                <section className="rounded-xl border border-border/70 bg-card/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Planning</p>
                            <h3 className="mt-1 text-sm font-semibold tracking-[-0.02em] text-foreground">
                                Schedule coverage
                            </h3>
                        </div>
                        <Badge variant={getPlanningStatusVariant(task)}>{planningStatusLabel}</Badge>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <div className="rounded-lg border border-border/70 bg-background/55 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Planned time</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{plannedTimeLabel}</p>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-background/55 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Estimate delta</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{remainingEstimateLabel}</p>
                        </div>
                        <div className="rounded-lg border border-border/70 bg-background/55 px-3 py-2.5">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Next block</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{nextBlockLabel}</p>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-border/70 bg-muted/15 p-1.5">
                    <div className="grid gap-1">
                        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Project</p>
                            <Select
                                value={listId}
                                onValueChange={(value) => {
                                    setListId(value);
                                    setSectionId("");
                                }}
                            >
                                <SelectTrigger
                                    id="detailProject"
                                    className="h-auto min-h-0 rounded-lg border-0 bg-background/70 px-3 py-2 text-right shadow-none focus-visible:ring-0 [&>span]:text-right"
                                >
                                    <SelectValue placeholder="Choose a project" />
                                </SelectTrigger>
                                <SelectContent>
                                    {lists.map((list) => (
                                        <SelectItem key={list.id} value={list.id}>
                                            {list.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {showSectionSelector ? (
                            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2.5">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Section</p>
                                <Select value={sectionId || "none"} onValueChange={(value) => setSectionId(value === "none" ? "" : value)}>
                                    <SelectTrigger
                                        id="detailSection"
                                        className="h-auto min-h-0 rounded-lg border-0 bg-background/70 px-3 py-2 text-right shadow-none focus-visible:ring-0 [&>span]:text-right"
                                    >
                                        <SelectValue placeholder="No section" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No section</SelectItem>
                                        {sections.map((section) => (
                                            <SelectItem key={section.id} value={section.id}>
                                                {section.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : null}

                        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Due</p>
                            <TaskDueDatePicker
                                id="detailDue"
                                value={dueDate}
                                onChange={setDueDate}
                                placeholder="Choose date"
                                allowClear
                                popoverAlign="end"
                                smallScreenCalendarPlacement="left"
                                className="h-auto rounded-lg border-0 bg-background/70 px-3 py-2 text-right shadow-none focus-visible:ring-0 [&>span]:w-full [&>span]:justify-end [&>span]:text-right"
                            />
                        </div>

                        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Reminder</p>
                            <div className="space-y-1">
                                <Select
                                    value={reminderOffsetMinutes || "none"}
                                    onValueChange={(value) => setReminderOffsetMinutes(value === "none" ? "" : value)}
                                >
                                    <SelectTrigger
                                        id="detailReminder"
                                        className="h-auto min-h-0 rounded-lg border-0 bg-background/70 px-3 py-2 text-right shadow-none focus-visible:ring-0 [&>span]:text-right"
                                    >
                                        <span className="inline-flex w-full items-center justify-end gap-2">
                                            <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            <span>{reminderLabel ?? "No reminder"}</span>
                                        </span>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No reminder</SelectItem>
                                        {REMINDER_OFFSET_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={String(option.value)}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {parsedReminderOffsetMinutes != null && !dueDate ? (
                                    <p className="text-right text-[11px] text-amber-700 dark:text-amber-300">
                                        Add a deadline to set a reminder.
                                    </p>
                                ) : reminderScheduledLabel ? (
                                    <p className="text-right text-[11px] text-muted-foreground">
                                        Will remind {reminderScheduledLabel}.
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Repeat</p>
                            <div className="space-y-1">
                                <Select
                                    value={recurrenceRule || "none"}
                                    onValueChange={(value) => setRecurrenceRule(value === "none" ? "" : value as RecurrenceRule)}
                                >
                                    <SelectTrigger
                                        id="detailRecurrence"
                                        className="h-auto min-h-0 rounded-lg border-0 bg-background/70 px-3 py-2 text-right shadow-none focus-visible:ring-0 [&>span]:text-right"
                                    >
                                        <SelectValue placeholder="Does not repeat" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">Does not repeat</SelectItem>
                                        {RECURRENCE_RULE_OPTIONS.map((option) => (
                                            <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {recurrenceRule && !canTaskRecur({ due_date: null, deadline_on: dueDate || null, deadline_at: null }) ? (
                                    <p className="text-right text-[11px] text-amber-700 dark:text-amber-300">
                                        Add a deadline to repeat this task.
                                    </p>
                                ) : null}
                            </div>
                        </div>

                        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Priority</p>
                            <Select
                                value={priority || "none"}
                                onValueChange={(value) => setPriority(value === "none" ? "" : value as typeof priority)}
                            >
                                <SelectTrigger
                                    id="detailPriority"
                                    className="h-auto min-h-0 rounded-lg border-0 bg-background/70 px-3 py-2 text-right shadow-none focus-visible:ring-0 [&>span]:text-right"
                                >
                                    <SelectValue placeholder="No priority" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No priority</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Duration</p>
                            <div className="flex items-center justify-end gap-2 rounded-lg bg-background/70 px-3 py-2">
                                <Input
                                    id="detailEstimate"
                                    type="number"
                                    min="1"
                                    inputMode="numeric"
                                    value={estimatedMinutes}
                                    onChange={(event) => setEstimatedMinutes(event.target.value)}
                                    placeholder="45"
                                    className="h-auto w-16 rounded-none border-0 bg-transparent px-0 py-0 text-right shadow-none focus-visible:ring-0"
                                />
                                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Min</span>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Schedule</p>
                            <h3 className="mt-1 text-sm font-semibold tracking-[-0.02em] text-foreground">
                                Quick plan actions
                            </h3>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                            {task.remaining_estimated_minutes ?? task.estimated_minutes ?? 60}m default
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <Button variant="tonal" size="xs" onClick={handleScheduleToday}>
                            Today
                        </Button>
                        <Button variant="tonal" size="xs" onClick={handleScheduleTomorrow}>
                            Tomorrow
                        </Button>
                        <Button variant="tonal" size="xs" onClick={handleScheduleNextSlot}>
                            Next slot
                        </Button>
                        <Button variant="tonal" size="xs" onClick={handleAddThirtyMinuteBlock}>
                            Add 30m
                        </Button>
                        <Button variant="outline" size="xs" onClick={handlePlanBlock}>
                            <CalendarRange className="h-3.5 w-3.5" />
                            {preferredPlannedBlock ? "Edit block" : "Open planner"}
                        </Button>
                    </div>
                </section>

                <section className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="xs" onClick={handleStartFocus}>
                        <Play className="h-3.5 w-3.5" />
                        Start focus
                    </Button>
                    <Button variant="outline" size="xs" onClick={handlePlanBlock}>
                        <CalendarRange className="h-3.5 w-3.5" />
                        {preferredPlannedBlock ? "Edit block" : "Open planner"}
                    </Button>
                </section>

                <section className="space-y-3 border-t border-border/60 pt-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Attachments</p>
                            {images.length > 0 ? (
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    {images.length} file{images.length === 1 ? "" : "s"} attached
                                </p>
                            ) : null}
                        </div>
                        <TaskAttachmentUpload
                            userId={userId}
                            todoId={task.id}
                            listId={listId}
                            onUploaded={handleAttachmentsUploaded}
                        />
                    </div>

                    {images.length > 0 ? (
                        <div className="space-y-2">
                            {images.map((image) => {
                                const publicUrl = supabase.storage.from("todo-images").getPublicUrl(image.path).data.publicUrl;
                                const displayName = getAttachmentDisplayName(image);
                                const extension = getAttachmentExtension(displayName).toUpperCase();
                                const imageAttachment = isImageAttachment(image);
                                const deletingAttachment = deletingAttachmentId === image.id;
                                const metaLabel = [imageAttachment ? "Image" : (extension || "File"), formatAttachmentSize(image.size_bytes)]
                                    .filter(Boolean)
                                    .join(" - ");

                                return (
                                    <div
                                        key={image.id}
                                        className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2"
                                    >
                                        <a
                                            href={publicUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-card"
                                        >
                                            {imageAttachment ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={publicUrl} alt={displayName} className="h-full w-full object-cover" />
                                            ) : (
                                                <FileText className="h-4 w-4 text-muted-foreground" />
                                            )}
                                        </a>
                                        <a href={publicUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-foreground">{displayName}</p>
                                            <p className="truncate text-xs text-muted-foreground">{metaLabel || "Attachment"}</p>
                                        </a>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-xs"
                                            className="shrink-0 text-muted-foreground hover:text-destructive"
                                            aria-label={`Remove ${displayName}`}
                                            disabled={deletingAttachment}
                                            onClick={() => void handleAttachmentDelete(image)}
                                        >
                                            {deletingAttachment ? (
                                                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground/35 border-t-muted-foreground" />
                                            ) : (
                                                <Trash2 className="h-3.5 w-3.5" />
                                            )}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No attachments yet.</p>
                    )}
                </section>

                <section className="border-t border-border/60 pt-4">
                    <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        className="h-auto px-0 py-0 font-medium text-destructive/80 hover:bg-transparent hover:text-destructive"
                        onClick={() => setDeleteOpen(true)}
                    >
                        Delete task
                    </Button>
                </section>
            </div>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete task?</DialogTitle>
                        <DialogDescription>
                            Delete <span className="font-semibold text-foreground">{task.title}</span> and its attachments.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={() => void handleDelete()}>
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

export function TaskDetailPanel({
    task,
    lists,
    images,
    userId,
    previousTask,
    nextTask,
    taskPositionLabel,
    open,
    onOpenChange,
    onClose,
    onNavigateToTask,
    onDirtyChange,
    onSaved,
    onDeleted,
    className,
}: {
    task: TaskDatasetRecord | null;
    lists: TodoList[];
    images: TodoImageRow[];
    userId: string;
    previousTask?: TaskDatasetRecord | null;
    nextTask?: TaskDatasetRecord | null;
    taskPositionLabel?: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onClose?: () => void;
    onNavigateToTask?: (taskId: string) => void;
    onDirtyChange?: (dirty: boolean) => void;
    onSaved: () => void;
    onDeleted: () => void;
    className?: string;
}) {
    const [isDesktop, setIsDesktop] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(min-width: 1024px)");
        const syncDesktopState = () => setIsDesktop(mediaQuery.matches);

        syncDesktopState();
        mediaQuery.addEventListener("change", syncDesktopState);

        return () => {
            mediaQuery.removeEventListener("change", syncDesktopState);
        };
    }, []);

    return (
        <>
            <Dialog open={isDesktop && open && !!task} onOpenChange={onOpenChange}>
                <DialogContent
                    showCloseButton={false}
                    className={cn(
                        "hidden max-w-[min(680px,calc(100vw-2rem))] overflow-hidden p-0 lg:block",
                        className,
                    )}
                >
                    <DialogHeader className="sr-only">
                        <DialogTitle>Task details</DialogTitle>
                        <DialogDescription>Review and edit the selected task.</DialogDescription>
                    </DialogHeader>
                    {task ? (
                        <div className="task-detail-scroll max-h-[min(82vh,760px)] overflow-y-auto p-5 sm:p-6">
                            <TaskDetailForm
                                task={task}
                                lists={lists}
                                images={images}
                                userId={userId}
                                onClose={onClose}
                                previousTask={previousTask}
                                nextTask={nextTask}
                                taskPositionLabel={taskPositionLabel}
                                onNavigateToTask={onNavigateToTask}
                                onDirtyChange={onDirtyChange}
                                onSaved={onSaved}
                                onDeleted={onDeleted}
                            />
                        </div>
                    ) : null}
                </DialogContent>
            </Dialog>

            <Sheet open={!isDesktop && open && !!task} onOpenChange={onOpenChange}>
                <SheetContent
                    side="right"
                    showCloseButton={false}
                    className="w-full max-w-none border-0 bg-background p-0 lg:hidden"
                >
                    <SheetHeader className="sr-only">
                        <SheetTitle>Task details</SheetTitle>
                        <SheetDescription>Review and edit the selected task.</SheetDescription>
                    </SheetHeader>
                    {task ? (
                        <div className="task-detail-scroll h-[100dvh] overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
                            <TaskDetailForm
                                task={task}
                                lists={lists}
                                images={images}
                                userId={userId}
                                onClose={onClose}
                                previousTask={previousTask}
                                nextTask={nextTask}
                                taskPositionLabel={taskPositionLabel}
                                onNavigateToTask={onNavigateToTask}
                                onDirtyChange={onDirtyChange}
                                onSaved={onSaved}
                                onDeleted={onDeleted}
                            />
                        </div>
                    ) : null}
                </SheetContent>
            </Sheet>
        </>
    );
}
