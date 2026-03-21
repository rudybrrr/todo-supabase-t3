"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, Check, ChevronRight, Paperclip, Play, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useFocus } from "~/components/focus-provider";
import { TodoImageUpload } from "~/app/todos/todo-image-upload";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { DatePickerField } from "~/components/ui/date-picker-field";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { Textarea } from "~/components/ui/textarea";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { deleteTask, setTaskCompletion, updateTask } from "~/lib/task-actions";
import { getDateInputValue } from "~/lib/task-views";
import type { TodoImageRow, TodoList } from "~/lib/types";
import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import { cn } from "~/lib/utils";

function TaskDetailForm({
    task,
    lists,
    images,
    userId,
    onClose,
    onSaved,
    onDeleted,
}: {
    task: TaskDatasetRecord;
    lists: TodoList[];
    images: TodoImageRow[];
    userId: string;
    onClose?: () => void;
    onSaved: () => void;
    onDeleted: () => void;
}) {
    const router = useRouter();
    const { applyTaskPatch, removeTask, upsertTask } = useTaskDataset();
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
    const [showNotes, setShowNotes] = useState(false);
    const [showAttachments, setShowAttachments] = useState(false);
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
        setShowNotes(false);
        setShowAttachments(false);
    }, [syncFormState, task]);

    const isDirty =
        title !== task.title
        || description !== (task.description ?? "")
        || priority !== (task.priority ?? "")
        || dueDate !== getDateInputValue(task.due_date)
        || estimatedMinutes !== (task.estimated_minutes ? String(task.estimated_minutes) : "")
        || listId !== task.list_id;

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

    return (
        <>
            <div className="space-y-4 sm:space-y-5">
                <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3 sm:pb-4">
                    <div className="min-w-0 flex flex-1 items-start gap-3">
                        <button
                            type="button"
                            aria-label={isDone ? "Mark task incomplete" : "Mark task complete"}
                            onClick={() => void handleToggleCompletion()}
                            className={cn(
                                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                                isDone
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-border/80 bg-background/80 text-transparent hover:border-primary/60",
                            )}
                        >
                            <Check className="h-3.5 w-3.5" />
                        </button>
                        <div className="min-w-0">
                            <p className="eyebrow">Task details</p>
                            <p
                                className={cn(
                                    "mt-1 line-clamp-2 text-lg font-semibold tracking-[-0.03em] text-foreground transition-colors",
                                    isDone ? "text-muted-foreground line-through" : "",
                                )}
                            >
                                {title}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteOpen(true)}
                        >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete task</span>
                        </Button>
                        {onClose ? (
                            <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
                                <X className="h-4 w-4" />
                                <span className="sr-only">Close task details</span>
                            </Button>
                        ) : null}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <Button variant="outline" size="sm" onClick={handleStartFocus}>
                        <Play className="h-4 w-4" />
                        Start focus
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePlanBlock}>
                        <CalendarRange className="h-4 w-4" />
                        Plan block
                    </Button>
                    <Button variant="tonal" size="sm" onClick={() => void handleSave()} disabled={saving || !title.trim() || !isDirty}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </div>

                <div className="space-y-2">
                    <Label htmlFor="detailTitle" className="eyebrow">
                        Title
                    </Label>
                    <Input id="detailTitle" value={title} onChange={(event) => setTitle(event.target.value)} className="h-10" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="detailProject" className="eyebrow">
                            Project
                        </Label>
                        <Select value={listId} onValueChange={setListId}>
                            <SelectTrigger id="detailProject">
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
                    <div className="space-y-2">
                        <Label htmlFor="detailDue" className="eyebrow">
                            Due
                        </Label>
                        <DatePickerField id="detailDue" value={dueDate} onChange={setDueDate} placeholder="Choose date" allowClear />
                    </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                        <Label htmlFor="detailPriority" className="eyebrow">
                            Priority
                        </Label>
                        <Select
                            value={priority || "none"}
                            onValueChange={(value) => setPriority(value === "none" ? "" : value as typeof priority)}
                        >
                            <SelectTrigger id="detailPriority">
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
                    <div className="space-y-2">
                        <Label htmlFor="detailEstimate" className="eyebrow">
                            Estimate
                        </Label>
                        <Input
                            id="detailEstimate"
                            type="number"
                            min="1"
                            value={estimatedMinutes}
                            onChange={(event) => setEstimatedMinutes(event.target.value)}
                            placeholder="45"
                            className="h-10"
                        />
                    </div>
                </div>

                <div className="space-y-3 rounded-[1rem] border border-border/60 bg-background/40 p-3">
                    <button
                        type="button"
                        onClick={() => setShowNotes((current) => !current)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                    >
                        <div>
                            <p className="eyebrow">Notes</p>
                            {!showNotes ? (
                                <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">
                                    {description.trim() || "Add note"}
                                </p>
                            ) : null}
                        </div>
                        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showNotes ? "rotate-90" : "")} />
                    </button>
                    {showNotes ? (
                        <Textarea
                            id="detailNotes"
                            value={description}
                            onChange={(event) => setDescription(event.target.value)}
                            placeholder="Clarify the output, reference links, or completion definition."
                            className="min-h-[88px] resize-none"
                        />
                    ) : null}
                </div>

                <div className="space-y-3 rounded-[1rem] border border-border/60 bg-background/40 p-3">
                    <button
                        type="button"
                        onClick={() => setShowAttachments((current) => !current)}
                        className="flex w-full items-center justify-between gap-3 text-left"
                    >
                        <div>
                            <p className="eyebrow">Attachments</p>
                            {!showAttachments ? (
                                <p className="mt-1 text-sm text-muted-foreground">
                                    {images.length > 0 ? `${images.length} file${images.length === 1 ? "" : "s"}` : "Add attachment"}
                                </p>
                            ) : null}
                        </div>
                        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <Paperclip className="h-4 w-4" />
                            <ChevronRight className={cn("h-4 w-4 transition-transform", showAttachments ? "rotate-90" : "")} />
                        </span>
                    </button>
                    {showAttachments ? (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <p className="text-sm text-muted-foreground">
                                    Keep source material close to the task.
                                </p>
                                <TodoImageUpload userId={userId} todoId={task.id} listId={listId} onUploaded={onSaved} />
                            </div>
                            {images.length > 0 ? (
                                <div className="grid grid-cols-2 gap-2">
                                    {images.map((image) => {
                                        const publicUrl = supabase.storage.from("todo-images").getPublicUrl(image.path).data.publicUrl;
                                        return (
                                            <a
                                                key={image.id}
                                                href={publicUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="overflow-hidden rounded-xl border border-border/60"
                                            >
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={publicUrl} alt="Task attachment" className="h-20 w-full object-cover" />
                                            </a>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="surface-muted px-4 py-4 text-sm text-muted-foreground">
                                    No attachments yet.
                                </div>
                            )}
                        </div>
                    ) : null}
                </div>
            </div>

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent className="max-w-md rounded-[1.5rem]">
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
    open,
    onOpenChange,
    onClose,
    onSaved,
    onDeleted,
    className,
}: {
    task: TaskDatasetRecord | null;
    lists: TodoList[];
    images: TodoImageRow[];
    userId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onClose?: () => void;
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
                        "hidden max-w-[min(760px,calc(100vw-2rem))] overflow-hidden rounded-[2rem] border-border/70 p-0 shadow-[0_28px_80px_rgba(15,23,42,0.22)] lg:block",
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
