"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, CheckSquare2, Filter, FolderKanban, MoreHorizontal, PencilLine, Share2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppShell, useShellActions } from "~/components/app-shell";
import { EmptyState, PageHeader } from "~/components/app-primitives";
import { ProjectDialog } from "~/components/project-dialog";
import { ProjectMembersDialog } from "~/components/project-members-dialog";
import { TaskBulkEditDialog, type TaskBulkEditChanges } from "~/components/task-bulk-edit-dialog";
import { TaskDetailPanel } from "~/components/task-detail-panel";
import { TaskList } from "~/components/task-list";
import { TaskSelectionBar } from "~/components/task-selection-bar";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from "~/components/ui/popover";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "~/components/ui/sheet";
import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { mergeBufferedTasks, useTaskTransitionBuffer } from "~/hooks/use-task-transition-buffer";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { deleteTask, setTaskCompletion, updateTask } from "~/lib/task-actions";
import type { TaskPriority } from "~/lib/task-views";
import { cn } from "~/lib/utils";

type PriorityFilterValue = "all" | "none" | TaskPriority;

const PRIORITY_OPTIONS: Array<{ value: PriorityFilterValue; label: string }> = [
    { value: "all", label: "All Priority" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
    { value: "none", label: "No Priority" },
];

const PROJECT_STATUS_OPTIONS = [
    { value: "open", label: "Open" },
    { value: "done", label: "Completed" },
    { value: "all", label: "All" },
] as const;

function dedupeTasks(tasks: TaskDatasetRecord[]) {
    const seen = new Set<string>();
    return tasks.filter((task) => {
        if (seen.has(task.id)) return false;
        seen.add(task.id);
        return true;
    });
}

export default function ProjectWorkspaceClient({ projectId }: { projectId: string }) {
    return (
        <AppShell>
            <ProjectWorkspaceContent projectId={projectId} />
        </AppShell>
    );
}

function ProjectWorkspaceContent({ projectId }: { projectId: string }) {
    const router = useRouter();
    const { openQuickAdd } = useShellActions();
    const { applyTaskPatch, removeTask, userId, lists, tasks, projectSummaries, imagesByTodo, loading, upsertTask } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { bufferedTasks, queueBufferedTask } = useTaskTransitionBuffer();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [projectDialogOpen, setProjectDialogOpen] = useState(false);
    const [membersDialogOpen, setMembersDialogOpen] = useState(false);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [taskFilter, setTaskFilter] = useState<"open" | "done" | "all">("open");
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilterValue>("all");
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [bulkDeletingOpen, setBulkDeletingOpen] = useState(false);
    const [bulkEditOpen, setBulkEditOpen] = useState(false);
    const [bulkCompleting, setBulkCompleting] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkEditing, setBulkEditing] = useState(false);

    const project = lists.find((list) => list.id === projectId) ?? null;
    const projectSummary = projectSummaries.find((summary) => summary.list.id === projectId) ?? null;
    const projectTasks = useMemo(
        () => tasks.filter((task) => task.list_id === projectId),
        [projectId, tasks],
    );
    const priorityScopedTasks = useMemo(() => projectTasks.filter((task) => {
        if (priorityFilter === "all") return true;
        if (priorityFilter === "none") return !task.priority;
        return task.priority === priorityFilter;
    }), [priorityFilter, projectTasks]);
    const visibleTasks = useMemo(() => priorityScopedTasks.filter((task) => {
        if (taskFilter === "open") return !task.is_done;
        if (taskFilter === "done") return task.is_done;
        return true;
    }), [priorityScopedTasks, taskFilter]);
    const visibleDisplayTasks = useMemo(
        () => mergeBufferedTasks(visibleTasks, bufferedTasks.filter((item) => item.bucket === `project:${taskFilter}`)),
        [bufferedTasks, taskFilter, visibleTasks],
    );
    const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
    const activeFilterCount = Number(taskFilter !== "open") + Number(priorityFilter !== "all");
    const selectableTasks = useMemo(() => dedupeTasks(visibleDisplayTasks), [visibleDisplayTasks]);
    const selectableTaskIds = useMemo(() => new Set(selectableTasks.map((task) => task.id)), [selectableTasks]);
    const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
    const selectedVisibleTasks = useMemo(
        () => selectableTasks.filter((task) => selectedTaskIdSet.has(task.id)),
        [selectableTasks, selectedTaskIdSet],
    );
    const allVisibleSelected = selectableTasks.length > 0 && selectedVisibleTasks.length === selectableTasks.length;

    useEffect(() => {
        if (!selectedTaskId) return;
        if (!visibleTasks.some((task) => task.id === selectedTaskId)) {
            setSelectedTaskId(null);
        }
    }, [selectedTaskId, visibleTasks]);

    useEffect(() => {
        if (!selectionMode) {
            setSelectedTaskIds([]);
            return;
        }

        setSelectedTaskId(null);
    }, [selectionMode]);

    useEffect(() => {
        setSelectedTaskIds((current) => {
            const next = current.filter((taskId) => selectableTaskIds.has(taskId));
            return next.length === current.length ? current : next;
        });
    }, [selectableTaskIds]);

    async function handleToggle(taskId: string, nextIsDone: boolean) {
        const existingTask = tasks.find((task) => task.id === taskId);
        if (!existingTask) return;

        const optimisticUpdatedAt = new Date().toISOString();
        const optimisticTask = {
            ...existingTask,
            is_done: nextIsDone,
            completed_at: nextIsDone ? optimisticUpdatedAt : null,
            updated_at: optimisticUpdatedAt,
        };

        const willLeaveCurrentFilter = (taskFilter === "open" && nextIsDone) || (taskFilter === "done" && !nextIsDone);
        if (willLeaveCurrentFilter) {
            const visibleIndex = visibleTasks.findIndex((task) => task.id === taskId);
            if (visibleIndex !== -1) {
                queueBufferedTask(optimisticTask, `project:${taskFilter}`, visibleIndex);
            }
        }

        try {
            applyTaskPatch(taskId, {
                is_done: nextIsDone,
                completed_at: nextIsDone ? optimisticUpdatedAt : null,
                updated_at: optimisticUpdatedAt,
            });
            const updatedTask = await setTaskCompletion(supabase, taskId, nextIsDone);
            upsertTask(updatedTask, { suppressRealtimeEcho: true });
            toast.success(nextIsDone ? "Task completed." : "Task reopened.");
        } catch (error) {
            upsertTask(existingTask);
            toast.error(error instanceof Error ? error.message : "Unable to update task.");
        }
    }

    function handleToggleTaskSelection(task: TaskDatasetRecord) {
        setSelectedTaskIds((current) => current.includes(task.id)
            ? current.filter((taskId) => taskId !== task.id)
            : [...current, task.id]);
    }

    function handleToggleSelectionMode() {
        setSelectionMode((current) => !current);
    }

    function handleToggleSelectAll() {
        if (allVisibleSelected) {
            setSelectedTaskIds([]);
            return;
        }

        setSelectedTaskIds(selectableTasks.map((task) => task.id));
    }

    async function handleCompleteSelected() {
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

            if (taskFilter === "open") {
                const visibleIndex = visibleTasks.findIndex((item) => item.id === task.id);
                if (visibleIndex !== -1) {
                    queueBufferedTask(optimisticTask, `project:${taskFilter}`, visibleIndex);
                }
            }

            applyTaskPatch(task.id, {
                is_done: true,
                completed_at: optimisticUpdatedAt,
                updated_at: optimisticUpdatedAt,
            });
        }

        const results = await Promise.allSettled(
            tasksToComplete.map((task) => setTaskCompletion(supabase, task.id, true)),
        );

        let successCount = 0;
        const failedTaskIds: string[] = [];

        results.forEach((result, index) => {
            const originalTask = tasksToComplete[index];
            if (!originalTask) return;

            if (result.status === "fulfilled") {
                upsertTask(result.value, { suppressRealtimeEcho: true });
                successCount += 1;
                return;
            }

            upsertTask(originalTask);
            failedTaskIds.push(originalTask.id);
        });

        if (successCount > 0) {
            toast.success(`${successCount} task${successCount === 1 ? "" : "s"} completed.`);
        }
        if (failedTaskIds.length > 0) {
            toast.error(`${failedTaskIds.length} task${failedTaskIds.length === 1 ? "" : "s"} failed to update.`);
        }

        setSelectedTaskIds(failedTaskIds);
        if (failedTaskIds.length === 0) {
            setSelectionMode(false);
        }
        setBulkCompleting(false);
    }

    async function handleDeleteSelected() {
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
                successCount += 1;
                if (selectedTaskId === task.id) {
                    setSelectedTaskId(null);
                }
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

        setBulkDeletingOpen(false);
        setSelectedTaskIds(failedTaskIds);
        if (failedTaskIds.length === 0) {
            setSelectionMode(false);
        }
        setBulkDeleting(false);
    }

    async function handleEditSelected(changes: TaskBulkEditChanges) {
        if (selectedVisibleTasks.length === 0) return;

        setBulkEditing(true);
        const optimisticUpdatedAt = new Date().toISOString();
        const tasksToUpdate = selectedVisibleTasks.map((task) => {
            const nextDueDate = changes.dueDate.mode === "keep"
                ? task.due_date ?? null
                : changes.dueDate.mode === "clear"
                    ? null
                    : (changes.dueDate.value ?? null);
            const nextPriority = changes.priority.mode === "keep"
                ? task.priority ?? null
                : changes.priority.mode === "clear"
                    ? null
                    : (changes.priority.value ?? null);
            const nextListId = changes.list.mode === "keep"
                ? task.list_id
                : (changes.list.value ?? task.list_id);

            return { originalTask: task, nextDueDate, nextPriority, nextListId };
        });

        for (const { originalTask, nextDueDate, nextPriority, nextListId } of tasksToUpdate) {
            applyTaskPatch(originalTask.id, {
                due_date: nextDueDate,
                priority: nextPriority,
                list_id: nextListId,
                updated_at: optimisticUpdatedAt,
            });
        }

        const results = await Promise.allSettled(
            tasksToUpdate.map(({ originalTask, nextDueDate, nextPriority, nextListId }) => updateTask(supabase, {
                id: originalTask.id,
                title: originalTask.title,
                description: originalTask.description ?? null,
                dueDate: nextDueDate,
                priority: nextPriority,
                estimatedMinutes: originalTask.estimated_minutes ?? null,
                listId: nextListId,
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

        setBulkEditOpen(false);
        setSelectedTaskIds(failedTaskIds);
        if (failedTaskIds.length === 0) {
            setSelectionMode(false);
        }
        setBulkEditing(false);
    }

    if (!project || !projectSummary) {
        return (
            <div className="page-container">
                <EmptyState
                    title="Project not found"
                    description="Return to Projects and pick another workspace."
                    icon={<FolderKanban className="h-8 w-8" />}
                    action={<Button onClick={() => router.push("/projects")}>Back</Button>}
                />
            </div>
        );
    }

    return (
        <>
            <div className="page-container">
                <PageHeader
                    title={project.name}
                    actions={
                        <>
                            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="outline" size="icon-sm" className="relative sm:hidden">
                                        <Filter className="h-4 w-4" />
                                        {activeFilterCount > 0 ? (
                                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                                                {activeFilterCount}
                                            </span>
                                        ) : null}
                                        <span className="sr-only">Open filters</span>
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="bottom" className="rounded-t-[2rem] border-x-0 border-t border-border/70">
                                    <SheetHeader>
                                        <SheetTitle>Filters</SheetTitle>
                                        <SheetDescription>Refine this project by status or priority.</SheetDescription>
                                    </SheetHeader>
                                    <ProjectFilterPanel
                                        taskFilter={taskFilter}
                                        priorityFilter={priorityFilter}
                                        onTaskFilterChange={setTaskFilter}
                                        onPriorityFilterChange={setPriorityFilter}
                                    />
                                </SheetContent>
                            </Sheet>

                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="outline" size="icon-sm" className="relative hidden sm:flex">
                                        <Filter className="h-4 w-4" />
                                        {activeFilterCount > 0 ? (
                                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                                                {activeFilterCount}
                                            </span>
                                        ) : null}
                                        <span className="sr-only">Open filters</span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-80">
                                    <PopoverHeader>
                                        <PopoverTitle>Filters</PopoverTitle>
                                    </PopoverHeader>
                                    <ProjectFilterPanel
                                        taskFilter={taskFilter}
                                        priorityFilter={priorityFilter}
                                        onTaskFilterChange={setTaskFilter}
                                        onPriorityFilterChange={setPriorityFilter}
                                    />
                                </PopoverContent>
                            </Popover>

                            <Button
                                variant={selectionMode ? "tonal" : "outline"}
                                size="icon-sm"
                                onClick={handleToggleSelectionMode}
                                aria-pressed={selectionMode}
                                title={selectionMode ? "Exit selection mode" : "Select tasks"}
                            >
                                <CheckSquare2 className="h-4 w-4" />
                                <span className="sr-only">{selectionMode ? "Exit selection mode" : "Select tasks"}</span>
                            </Button>

                            {!selectionMode ? (
                                <Button onClick={() => openQuickAdd({ listId: project.id })}>Add task</Button>
                            ) : null}

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon-sm">
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">Project actions</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                                    <DropdownMenuItem onClick={() => router.push(`/calendar?listId=${project.id}`)}>
                                        <CalendarRange className="h-4 w-4" />
                                        Calendar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setMembersDialogOpen(true)}>
                                        <Share2 className="h-4 w-4" />
                                        Members
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setProjectDialogOpen(true)}>
                                        <PencilLine className="h-4 w-4" />
                                        Edit project
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    }
                />

                {selectionMode ? (
                    <TaskSelectionBar
                        selectedCount={selectedVisibleTasks.length}
                        totalVisibleCount={selectableTasks.length}
                        allVisibleSelected={allVisibleSelected}
                        editing={bulkEditing}
                        completing={bulkCompleting}
                        deleting={bulkDeleting}
                        onToggleSelectAll={handleToggleSelectAll}
                        onClearSelection={() => setSelectedTaskIds([])}
                        onEditSelected={() => setBulkEditOpen(true)}
                        onCompleteSelected={() => void handleCompleteSelected()}
                        onDeleteSelected={() => setBulkDeletingOpen(true)}
                    />
                ) : null}

                {activeFilterCount > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {taskFilter !== "open" ? (
                            <button
                                type="button"
                                onClick={() => setTaskFilter("open")}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                            >
                                {PROJECT_STATUS_OPTIONS.find((option) => option.value === taskFilter)?.label}
                                <X className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                        {priorityFilter !== "all" ? (
                            <button
                                type="button"
                                onClick={() => setPriorityFilter("all")}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                            >
                                {PRIORITY_OPTIONS.find((option) => option.value === priorityFilter)?.label}
                                <X className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                    </div>
                ) : null}

                <div className="grid gap-5 lg:flex lg:items-start lg:gap-0">
                    <div className="min-w-0 flex-1">
                        {loading ? (
                            <div className="surface-muted px-4 py-6 text-sm text-muted-foreground">Loading tasks...</div>
                        ) : visibleDisplayTasks.length > 0 ? (
                            <TaskList
                                tasks={visibleDisplayTasks}
                                lists={lists}
                                selectedTaskId={selectedTaskId}
                                selectedTaskIds={selectedTaskIdSet}
                                selectionMode={selectionMode}
                                onSelectionToggle={handleToggleTaskSelection}
                                onSelect={(task) => setSelectedTaskId((current) => current === task.id ? null : task.id)}
                                onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
                            />
                        ) : (
                            <EmptyState
                                title="No tasks"
                                description={activeFilterCount > 0 ? "Try changing your filters." : "Add a task to this project."}
                                action={<Button onClick={() => openQuickAdd({ listId: project.id })}>Add task</Button>}
                            />
                        )}
                    </div>

                    {userId ? (
                        <TaskDetailPanel
                            task={selectedTask}
                            lists={lists}
                            images={selectedTask ? imagesByTodo[selectedTask.id] ?? [] : []}
                            userId={userId}
                            open={!selectionMode && !!selectedTask}
                            onOpenChange={(open) => {
                                if (!open) setSelectedTaskId(null);
                            }}
                            onClose={() => setSelectedTaskId(null)}
                            onSaved={() => undefined}
                            onDeleted={() => {
                                setSelectedTaskId(null);
                            }}
                        />
                    ) : null}
                </div>
            </div>

            <ProjectDialog
                open={projectDialogOpen}
                onOpenChange={setProjectDialogOpen}
                initialProject={project}
                onRemoved={() => router.push("/projects")}
            />
            <ProjectMembersDialog
                open={membersDialogOpen}
                onOpenChange={setMembersDialogOpen}
                project={project}
            />

            <Dialog open={bulkDeletingOpen} onOpenChange={setBulkDeletingOpen}>
                <DialogContent className="max-w-md rounded-[1.5rem]">
                    <DialogHeader>
                        <DialogTitle>Delete selected tasks?</DialogTitle>
                        <DialogDescription>
                            Delete {selectedVisibleTasks.length} selected task{selectedVisibleTasks.length === 1 ? "" : "s"} from this project.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkDeletingOpen(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={() => void handleDeleteSelected()} disabled={bulkDeleting}>
                            {bulkDeleting ? "Deleting..." : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <TaskBulkEditDialog
                open={bulkEditOpen}
                onOpenChange={setBulkEditOpen}
                selectedCount={selectedVisibleTasks.length}
                lists={lists}
                submitting={bulkEditing}
                onSubmit={(changes) => void handleEditSelected(changes)}
            />
        </>
    );
}

function ProjectFilterPanel({
    taskFilter,
    priorityFilter,
    onTaskFilterChange,
    onPriorityFilterChange,
}: {
    taskFilter: "open" | "done" | "all";
    priorityFilter: PriorityFilterValue;
    onTaskFilterChange: (value: "open" | "done" | "all") => void;
    onPriorityFilterChange: (value: PriorityFilterValue) => void;
}) {
    const hasActiveFilters = taskFilter !== "open" || priorityFilter !== "all";

    return (
        <div className="space-y-4 p-1 pt-4">
            <div className="space-y-2">
                <p className="eyebrow">Status</p>
                <div className="flex flex-wrap gap-2">
                    {PROJECT_STATUS_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onTaskFilterChange(option.value)}
                            className={cn(
                                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                                taskFilter === option.value
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-border/70 bg-background/70 text-muted-foreground hover:border-border hover:text-foreground",
                            )}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <p className="eyebrow">Priority</p>
                <div className="flex flex-wrap gap-2">
                    {PRIORITY_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onPriorityFilterChange(option.value)}
                            className={cnPriorityFilter(priorityFilter === option.value)}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            {hasActiveFilters ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-center"
                    onClick={() => {
                        onTaskFilterChange("open");
                        onPriorityFilterChange("all");
                    }}
                >
                    Clear filters
                </Button>
            ) : null}
        </div>
    );
}

function cnPriorityFilter(active: boolean) {
    return active
        ? "rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
        : "rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground";
}
