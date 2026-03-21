"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckSquare2, Filter, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { AppShell, useShellActions } from "~/components/app-shell";
import { EmptyState, PageHeader } from "~/components/app-primitives";
import { TaskDetailPanel } from "~/components/task-detail-panel";
import { TaskBulkEditDialog, type TaskBulkEditChanges } from "~/components/task-bulk-edit-dialog";
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
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from "~/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
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
import {
    getSmartViewTasks,
    isTaskDueToday,
    isTaskOverdue,
    type TaskPriority,
    type SmartView,
} from "~/lib/task-views";

const VIEW_OPTIONS: Array<{ value: SmartView; label: string }> = [
    { value: "today", label: "Today" },
    { value: "upcoming", label: "Upcoming" },
    { value: "inbox", label: "No Due Date" },
    { value: "done", label: "Completed" },
];

type PriorityFilterValue = "all" | "none" | TaskPriority;

const PRIORITY_OPTIONS: Array<{ value: PriorityFilterValue; label: string }> = [
    { value: "all", label: "All Priority" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
    { value: "none", label: "No Priority" },
];

function getRouteView(value: string | null): SmartView {
    if (value === "upcoming" || value === "inbox" || value === "done") {
        return value;
    }
    return "today";
}

function dedupeTasks(tasks: TaskDatasetRecord[]) {
    const seen = new Set<string>();
    return tasks.filter((task) => {
        if (seen.has(task.id)) return false;
        seen.add(task.id);
        return true;
    });
}

export default function TasksClient() {
    return (
        <AppShell>
            <TasksContent />
        </AppShell>
    );
}

function TasksContent() {
    const searchParams = useSearchParams();
    const { openQuickAdd } = useShellActions();
    const { applyTaskPatch, removeTask, upsertTask, userId, tasks, lists, imagesByTodo, loading } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { bufferedTasks, queueBufferedTask } = useTaskTransitionBuffer();

    const routeView = getRouteView(searchParams.get("view"));
    const routeTaskId = searchParams.get("taskId");

    const [view, setView] = useState<SmartView>(routeView);
    const [projectFilter, setProjectFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilterValue>("all");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(routeTaskId);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [bulkDeletingOpen, setBulkDeletingOpen] = useState(false);
    const [bulkEditOpen, setBulkEditOpen] = useState(false);
    const [bulkCompleting, setBulkCompleting] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [bulkEditing, setBulkEditing] = useState(false);

    useEffect(() => {
        setView(routeView);
    }, [routeView]);

    useEffect(() => {
        if (selectionMode) return;
        setSelectedTaskId(routeTaskId);
    }, [routeTaskId, selectionMode]);

    useEffect(() => {
        if (!selectionMode) {
            setSelectedTaskIds([]);
            return;
        }

        setSelectedTaskId(null);
    }, [selectionMode]);

    const projectScopedTasks = useMemo(() => {
        return tasks.filter((task) => projectFilter === "all" || task.list_id === projectFilter);
    }, [projectFilter, tasks]);

    const priorityScopedTasks = useMemo(() => {
        if (priorityFilter === "all") return projectScopedTasks;
        if (priorityFilter === "none") {
            return projectScopedTasks.filter((task) => !task.priority);
        }
        return projectScopedTasks.filter((task) => task.priority === priorityFilter);
    }, [priorityFilter, projectScopedTasks]);

    const visibleTasks = useMemo(() => getSmartViewTasks(priorityScopedTasks, view), [priorityScopedTasks, view]);
    const overdueTasks = useMemo(() => visibleTasks.filter((task) => isTaskOverdue(task)), [visibleTasks]);
    const dueTodayTasks = useMemo(
        () => visibleTasks.filter((task) => !isTaskOverdue(task) && isTaskDueToday(task)),
        [visibleTasks],
    );
    const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
    const defaultListId = useMemo(
        () => projectFilter !== "all"
            ? projectFilter
            : (lists.find((list) => list.name === "Inbox")?.id ?? lists[0]?.id ?? null),
        [lists, projectFilter],
    );
    const currentViewLabel = VIEW_OPTIONS.find((option) => option.value === view)?.label ?? "Tasks";
    const activeFilterCount = Number(projectFilter !== "all") + Number(priorityFilter !== "all");
    const activeProjectName = projectFilter === "all"
        ? null
        : (lists.find((list) => list.id === projectFilter)?.name ?? "Project");

    const overdueDisplayTasks = useMemo(
        () => mergeBufferedTasks(overdueTasks, bufferedTasks.filter((item) => item.bucket === "today-overdue")),
        [bufferedTasks, overdueTasks],
    );
    const dueTodayDisplayTasks = useMemo(
        () => mergeBufferedTasks(dueTodayTasks, bufferedTasks.filter((item) => item.bucket === "today-due")),
        [bufferedTasks, dueTodayTasks],
    );
    const visibleDisplayTasks = useMemo(
        () => mergeBufferedTasks(visibleTasks, bufferedTasks.filter((item) => item.bucket === `view:${view}`)),
        [bufferedTasks, view, visibleTasks],
    );
    const hasTodayDisplayTasks = overdueDisplayTasks.length > 0 || dueTodayDisplayTasks.length > 0;
    const selectableTasks = useMemo(
        () => view === "today"
            ? dedupeTasks([...overdueDisplayTasks, ...dueTodayDisplayTasks])
            : dedupeTasks(visibleDisplayTasks),
        [dueTodayDisplayTasks, overdueDisplayTasks, view, visibleDisplayTasks],
    );
    const selectableTaskIds = useMemo(() => new Set(selectableTasks.map((task) => task.id)), [selectableTasks]);
    const selectedTaskIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds]);
    const selectedVisibleTasks = useMemo(
        () => selectableTasks.filter((task) => selectedTaskIdSet.has(task.id)),
        [selectableTasks, selectedTaskIdSet],
    );
    const allVisibleSelected = selectableTasks.length > 0 && selectedVisibleTasks.length === selectableTasks.length;

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

        if (view === "today" && nextIsDone) {
            const overdueIndex = overdueTasks.findIndex((task) => task.id === taskId);
            const dueTodayIndex = dueTodayTasks.findIndex((task) => task.id === taskId);

            if (overdueIndex !== -1) {
                queueBufferedTask(optimisticTask, "today-overdue", overdueIndex);
            } else if (dueTodayIndex !== -1) {
                queueBufferedTask(optimisticTask, "today-due", dueTodayIndex);
            }
        } else {
            const willLeaveCurrentView = (view === "done" && !nextIsDone) || (view !== "done" && nextIsDone);
            if (willLeaveCurrentView) {
                const visibleIndex = visibleTasks.findIndex((task) => task.id === taskId);
                if (visibleIndex !== -1) {
                    queueBufferedTask(optimisticTask, `view:${view}`, visibleIndex);
                }
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

            if (view === "today") {
                const overdueIndex = overdueTasks.findIndex((item) => item.id === task.id);
                const dueTodayIndex = dueTodayTasks.findIndex((item) => item.id === task.id);

                if (overdueIndex !== -1) {
                    queueBufferedTask(optimisticTask, "today-overdue", overdueIndex);
                } else if (dueTodayIndex !== -1) {
                    queueBufferedTask(optimisticTask, "today-due", dueTodayIndex);
                }
            } else if (view !== "done") {
                const visibleIndex = visibleTasks.findIndex((item) => item.id === task.id);
                if (visibleIndex !== -1) {
                    queueBufferedTask(optimisticTask, `view:${view}`, visibleIndex);
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

    const taskContent = loading ? (
        <div className="surface-muted px-4 py-6 text-sm text-muted-foreground">Loading tasks...</div>
    ) : view === "today" ? (
        hasTodayDisplayTasks ? (
            <div className="space-y-5">
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="eyebrow">Overdue</p>
                        <span className="text-sm text-muted-foreground">{overdueTasks.length}</span>
                    </div>
                    <TaskList
                        tasks={overdueDisplayTasks}
                        lists={lists}
                        showProject
                        selectedTaskId={selectedTaskId}
                        selectedTaskIds={selectedTaskIdSet}
                        selectionMode={selectionMode}
                        onSelectionToggle={handleToggleTaskSelection}
                        onSelect={(task) => setSelectedTaskId((current) => current === task.id ? null : task.id)}
                        onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
                        emptyMessage="Nothing overdue."
                    />
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="eyebrow">Due today</p>
                        <span className="text-sm text-muted-foreground">{dueTodayTasks.length}</span>
                    </div>
                    <TaskList
                        tasks={dueTodayDisplayTasks}
                        lists={lists}
                        showProject
                        selectedTaskId={selectedTaskId}
                        selectedTaskIds={selectedTaskIdSet}
                        selectionMode={selectionMode}
                        onSelectionToggle={handleToggleTaskSelection}
                        onSelect={(task) => setSelectedTaskId((current) => current === task.id ? null : task.id)}
                        onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
                        emptyMessage="Nothing else due today."
                    />
                </div>
            </div>
        ) : (
            <EmptyState
                title="No tasks"
                description="Adjust filters or add a task."
                action={<Button onClick={() => openQuickAdd(defaultListId ? { listId: defaultListId } : undefined)}>Add task</Button>}
            />
        )
    ) : visibleDisplayTasks.length === 0 ? (
        <EmptyState
            title="No tasks"
            description="Adjust filters or add a task."
            action={<Button onClick={() => openQuickAdd(defaultListId ? { listId: defaultListId } : undefined)}>Add task</Button>}
        />
    ) : (
        <TaskList
            tasks={visibleDisplayTasks}
            lists={lists}
            showProject={projectFilter === "all"}
            selectedTaskId={selectedTaskId}
            selectedTaskIds={selectedTaskIdSet}
            selectionMode={selectionMode}
            onSelectionToggle={handleToggleTaskSelection}
            onSelect={(task) => setSelectedTaskId((current) => current === task.id ? null : task.id)}
            onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
        />
    );

    return (
        <>
            <div className="page-container">
                <PageHeader
                    title={currentViewLabel}
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
                                        <SheetDescription>Refine this task view by project or priority.</SheetDescription>
                                    </SheetHeader>
                                    <TasksFilterPanel
                                        lists={lists}
                                        projectFilter={projectFilter}
                                        priorityFilter={priorityFilter}
                                        onProjectFilterChange={setProjectFilter}
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
                                    <TasksFilterPanel
                                        lists={lists}
                                        projectFilter={projectFilter}
                                        priorityFilter={priorityFilter}
                                        onProjectFilterChange={setProjectFilter}
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
                                <Button onClick={() => openQuickAdd(defaultListId ? { listId: defaultListId } : undefined)}>
                                    Add task
                                </Button>
                            ) : null}
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
                        {activeProjectName ? (
                            <button
                                type="button"
                                onClick={() => setProjectFilter("all")}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/90 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                            >
                                {activeProjectName}
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
                    <div className="min-w-0 flex-1">{taskContent}</div>
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

            <Dialog open={bulkDeletingOpen} onOpenChange={setBulkDeletingOpen}>
                <DialogContent className="max-w-md rounded-[1.5rem]">
                    <DialogHeader>
                        <DialogTitle>Delete selected tasks?</DialogTitle>
                        <DialogDescription>
                            Delete {selectedVisibleTasks.length} selected task{selectedVisibleTasks.length === 1 ? "" : "s"}.
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

function TasksFilterPanel({
    lists,
    projectFilter,
    priorityFilter,
    onProjectFilterChange,
    onPriorityFilterChange,
}: {
    lists: { id: string; name: string }[];
    projectFilter: string;
    priorityFilter: PriorityFilterValue;
    onProjectFilterChange: (value: string) => void;
    onPriorityFilterChange: (value: PriorityFilterValue) => void;
}) {
    const hasActiveFilters = projectFilter !== "all" || priorityFilter !== "all";

    return (
        <div className="space-y-4 p-1 pt-4">
            <div className="space-y-2">
                <p className="eyebrow">Project</p>
                <Select value={projectFilter} onValueChange={onProjectFilterChange}>
                    <SelectTrigger>
                        <SelectValue placeholder="All projects" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All projects</SelectItem>
                        {lists.map((list) => (
                            <SelectItem key={list.id} value={list.id}>
                                {list.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <p className="eyebrow">Priority</p>
                <div className="flex flex-wrap gap-2">
                    {PRIORITY_OPTIONS.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => onPriorityFilterChange(option.value)}
                            className={cnFilterChip(priorityFilter === option.value)}
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
                        onProjectFilterChange("all");
                        onPriorityFilterChange("all");
                    }}
                >
                    Clear filters
                </Button>
            ) : null}
        </div>
    );
}

function cnFilterChip(active: boolean) {
    return active
        ? "rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
        : "rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground";
}
