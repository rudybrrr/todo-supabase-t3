"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Check, ChevronLeft, ChevronRight, FileText, Play, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useFocus } from "~/components/focus-provider";
import { TaskAttachmentUpload } from "~/components/task-attachment-upload";
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
import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { formatAttachmentSize, getAttachmentDisplayName, getAttachmentExtension, isImageAttachment } from "~/lib/task-attachments";
import { deleteTask, deleteTaskAttachment, setTaskCompletion, updateTask } from "~/lib/task-actions";
import { getDateInputValue } from "~/lib/task-views";
import type { TodoImageRow, TodoList } from "~/lib/types";
import { cn } from "~/lib/utils";

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
    const { applyTaskPatch, refresh, removeTask, upsertTask } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { setCurrentListId, handleModeChange, toggleTimer } = useFocus();
    const [title, setTitle] = useState(task.title);
    const [description, setDescription] = useState(task.description ?? "");
    const [priority, setPriority] = useState<"high" | "medium" | "low" | "">(task.priority ?? "");
    const [dueDate, setDueDate] = useState(getDateInputValue(task.due_date));
    const [estimatedMinutes, setEstimatedMinutes] = useState(task.estimated_minutes ? String(task.estimated_minutes) : "");
    const [listId, setListId] = useState(task.list_id);
    const [isDone, setIsDone] = useState(task.is_done);
    const [saving, setSaving] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
    const initializedTaskIdRef = useRef<string | null>(null);

    const syncFormState = useCallback((
        nextTask: Pick<TaskDatasetRecord, "title" | "description" | "priority" | "due_date" | "estimated_minutes" | "list_id" | "is_done">,
    ) => {
        setTitle(nextTask.title);
        setDescription(nextTask.description ?? "");
        setPriority(nextTask.priority ?? "");
        setDueDate(getDateInputValue(nextTask.due_date));
        setEstimatedMinutes(nextTask.estimated_minutes ? String(nextTask.estimated_minutes) : "");
        setListId(nextTask.list_id);
        setIsDone(nextTask.is_done);
    }, []);

    useEffect(() => {
        if (initializedTaskIdRef.current === task.id) return;

        initializedTaskIdRef.current = task.id;
        syncFormState(task);
        setDeletingAttachmentId(null);
    }, [syncFormState, task]);

    const isDirty = initializedTaskIdRef.current === task.id && (
        title !== task.title
        || description !== (task.description ?? "")
        || priority !== (task.priority ?? "")
        || dueDate !== getDateInputValue(task.due_date)
        || estimatedMinutes !== (task.estimated_minutes ? String(task.estimated_minutes) : "")
        || listId !== task.list_id
    );

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
        const normalizedPriority = priority || null;
        const normalizedEstimatedMinutes = estimatedMinutes ? Number.parseInt(estimatedMinutes, 10) : null;
        const optimisticUpdatedAt = new Date().toISOString();

        try {
            setSaving(true);
            applyTaskPatch(task.id, {
                title: normalizedTitle,
                description: normalizedDescription,
                due_date: normalizedDueDate,
                priority: normalizedPriority,
                estimated_minutes: normalizedEstimatedMinutes,
                list_id: listId,
                updated_at: optimisticUpdatedAt,
            });
            const updatedTask = await updateTask(supabase, {
                id: task.id,
                title: normalizedTitle,
                description: normalizedDescription,
                dueDate: normalizedDueDate,
                priority: normalizedPriority,
                estimatedMinutes: normalizedEstimatedMinutes,
                listId,
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
            const updatedTask = await setTaskCompletion(supabase, task.id, nextIsDone);
            upsertTask(updatedTask, { suppressRealtimeEcho: true });
            toast.success(nextIsDone ? "Task completed." : "Task reopened.");
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
        handleModeChange("focus");
        toggleTimer();
        toast.success("Focus session started.");
    }

    function handlePlanBlock() {
        const nextDate = dueDate ? `&date=${dueDate}` : "";
        router.push(`/calendar?taskId=${task.id}&listId=${task.list_id}${nextDate}`);
        onClose?.();
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

                <section className="rounded-xl border border-border/70 bg-muted/15 p-1.5">
                    <div className="grid gap-1">
                        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3 rounded-lg px-3 py-2.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Project</p>
                            <Select value={listId} onValueChange={setListId}>
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
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Estimate</p>
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

                <section className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="xs" onClick={handleStartFocus}>
                        <Play className="h-3.5 w-3.5" />
                        Start focus
                    </Button>
                    <Button variant="outline" size="xs" onClick={handlePlanBlock}>
                        <CalendarRange className="h-3.5 w-3.5" />
                        Plan block
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
