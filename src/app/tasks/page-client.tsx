"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare2, Filter, Plus, X } from "lucide-react";
import { useSearchParams } from "next/navigation";

import { AppShell, useShellActions } from "~/components/app-shell";
import { EmptyState, PageHeader } from "~/components/app-primitives";
import { useData } from "~/components/data-provider";
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
    Popover,
    PopoverContent,
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
import { dedupeTasks, useTaskSelectionActions } from "~/hooks/use-task-selection-actions";
import { mergeBufferedTasks, useTaskTransitionBuffer } from "~/hooks/use-task-transition-buffer";
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

interface PendingTaskLeaveAction {
    run: () => void;
}

function isTaskNavigationBlockedTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;

    return Boolean(target.closest(
        "input, textarea, select, [contenteditable='true'], #detailDue, [data-slot='select-trigger'], [data-slot='select-content'], [data-slot='select-item'], [data-slot='popover-content']",
    ));
}

function getRouteView(value: string | null): SmartView {
    if (value === "upcoming" || value === "inbox" || value === "done") {
        return value;
    }
    return "today";
}

export default function TasksClient({
    initialView,
    initialTaskId,
}: {
    initialView?: string | null;
    initialTaskId?: string | null;
}) {
    return (
        <AppShell>
            <TasksContent initialView={initialView} initialTaskId={initialTaskId} />
        </AppShell>
    );
}

function TasksContent({
    initialView,
    initialTaskId,
}: {
    initialView?: string | null;
    initialTaskId?: string | null;
}) {
    const searchParams = useSearchParams();
    const { enterPrimaryActivity, openQuickAdd, registerPrimaryActivityReset } = useShellActions();
    const { profile } = useData();
    const { userId, tasks, lists, imagesByTodo, loading } = useTaskDataset();
    const { bufferedTasks, queueBufferedTask } = useTaskTransitionBuffer();

    const routeView = getRouteView(searchParams.get("view"));
    const routeTaskId = searchParams.get("taskId");

    const [view, setView] = useState<SmartView>(() => getRouteView(initialView ?? null));
    const [projectFilter, setProjectFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilterValue>("all");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(initialTaskId ?? null);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [bulkDeletingOpen, setBulkDeletingOpen] = useState(false);
    const [detailDirty, setDetailDirty] = useState(false);
    const [pendingTaskLeaveAction, setPendingTaskLeaveAction] = useState<PendingTaskLeaveAction | null>(null);

    useEffect(() => {
        setView(routeView);
    }, [routeView]);

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

    const visibleTasks = useMemo(
        () => getSmartViewTasks(priorityScopedTasks, view, new Date(), profile?.timezone),
        [priorityScopedTasks, profile?.timezone, view],
    );
    const overdueTasks = useMemo(
        () => visibleTasks.filter((task) => isTaskOverdue(task, new Date(), profile?.timezone)),
        [profile?.timezone, visibleTasks],
    );
    const dueTodayTasks = useMemo(
        () => visibleTasks.filter((task) => !isTaskOverdue(task, new Date(), profile?.timezone) && isTaskDueToday(task, new Date(), profile?.timezone)),
        [profile?.timezone, visibleTasks],
    );
    const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
    const defaultListId = useMemo(
        () => projectFilter !== "all"
            ? projectFilter
            : (lists.find((list) => list.name === "Inbox")?.id ?? lists[0]?.id ?? null),
        [lists, projectFilter],
    );
    const currentViewLabel = VIEW_OPTIONS.find((option) => option.value === view)?.label ?? "Today";
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
    const selectedTaskIndex = useMemo(
        () => selectableTasks.findIndex((task) => task.id === selectedTaskId),
        [selectableTasks, selectedTaskId],
    );
    const previousTask = selectedTaskIndex > 0 ? selectableTasks[selectedTaskIndex - 1] ?? null : null;
    const nextTask = selectedTaskIndex !== -1 && selectedTaskIndex < selectableTasks.length - 1
        ? (selectableTasks[selectedTaskIndex + 1] ?? null)
        : null;
    const taskPositionLabel = selectedTaskIndex === -1 ? null : `${selectedTaskIndex + 1} of ${selectableTasks.length}`;
    const getBufferPlacement = useCallback((task: TaskDatasetRecord, nextIsDone: boolean) => {
        if (view === "today" && nextIsDone) {
            const overdueIndex = overdueTasks.findIndex((item) => item.id === task.id);
            if (overdueIndex !== -1) {
                return { bucket: "today-overdue", index: overdueIndex };
            }

            const dueTodayIndex = dueTodayTasks.findIndex((item) => item.id === task.id);
            if (dueTodayIndex !== -1) {
                return { bucket: "today-due", index: dueTodayIndex };
            }
        }

        const willLeaveCurrentView = (view === "done" && !nextIsDone) || (view !== "done" && nextIsDone);
        if (!willLeaveCurrentView) return null;

        const visibleIndex = visibleTasks.findIndex((item) => item.id === task.id);
        return visibleIndex !== -1 ? { bucket: `view:${view}`, index: visibleIndex } : null;
    }, [dueTodayTasks, overdueTasks, view, visibleTasks]);

    const {
        selectionMode,
        selectedTaskIdSet,
        selectedVisibleTasks,
        allVisibleSelected,
        bulkCompleting,
        bulkDeleting,
        bulkEditing,
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
    } = useTaskSelectionActions({
        allTasks: tasks,
        selectableTasks,
        queueBufferedTask,
        getBufferPlacement,
        onTaskDeleted(taskId) {
            setSelectedTaskId((current) => current === taskId ? null : current);
        },
    });

    async function handleConfirmDeleteSelected() {
        await handleDeleteSelected();
        setBulkDeletingOpen(false);
    }

    const requestTaskLeave = useCallback((action: () => void) => {
        if (detailDirty && selectedTaskId) {
            setPendingTaskLeaveAction({ run: action });
            return;
        }

        action();
    }, [detailDirty, selectedTaskId]);

    const activateSelectionMode = useCallback(() => {
        if (selectionMode) return;
        enterPrimaryActivity("tasks:selection");
        handleToggleSelectionMode();
    }, [enterPrimaryActivity, handleToggleSelectionMode, selectionMode]);

    const handleConfirmTaskLeave = useCallback(() => {
        if (!pendingTaskLeaveAction) return;

        const { run } = pendingTaskLeaveAction;
        setPendingTaskLeaveAction(null);
        setDetailDirty(false);
        run();
    }, [pendingTaskLeaveAction]);

    const handleCancelTaskLeave = useCallback(() => {
        setPendingTaskLeaveAction(null);
    }, []);

    const requestSelectionModeExit = useCallback(() => {
        if (!selectionMode || bulkEditing || bulkCompleting || bulkDeleting) return;
        handleCancelSelectionMode();
    }, [bulkCompleting, bulkDeleting, bulkEditing, handleCancelSelectionMode, selectionMode]);

    const handleSelectionModeChange = useCallback(() => {
        if (selectionMode) {
            requestSelectionModeExit();
            return;
        }
        requestTaskLeave(() => {
            setSelectedTaskId(null);
            setDetailDirty(false);
            activateSelectionMode();
        });
    }, [activateSelectionMode, requestSelectionModeExit, requestTaskLeave, selectionMode]);

    const handleTaskSelect = useCallback((task: TaskDatasetRecord, options?: { shiftKey?: boolean }) => {
        if (options?.shiftKey) {
            requestTaskLeave(() => {
                setSelectedTaskId(null);
                setDetailDirty(false);
                enterPrimaryActivity("tasks:selection");
                handleToggleTaskSelection(task, { shiftKey: true, enterSelectionMode: true });
            });
            return;
        }

        const nextTaskId = selectedTaskId === task.id ? null : task.id;
        requestTaskLeave(() => {
            if (nextTaskId) {
                enterPrimaryActivity("tasks:detail");
            }
            setSelectedTaskId(nextTaskId);
            setDetailDirty(false);
        });
    }, [enterPrimaryActivity, handleToggleTaskSelection, requestTaskLeave, selectedTaskId]);

    const handleTaskPanelNavigate = useCallback((taskId: string) => {
        if (taskId === selectedTaskId) return;

        requestTaskLeave(() => {
            enterPrimaryActivity("tasks:detail");
            setSelectedTaskId(taskId);
            setDetailDirty(false);
        });
    }, [enterPrimaryActivity, requestTaskLeave, selectedTaskId]);

    const handleTaskSelection = useCallback((task: TaskDatasetRecord, options?: { shiftKey?: boolean }) => {
        handleToggleTaskSelection(task, { shiftKey: options?.shiftKey });
    }, [handleToggleTaskSelection]);

    useEffect(() => registerPrimaryActivityReset("tasks:selection", () => {
        setBulkDeletingOpen(false);
        setPendingTaskLeaveAction(null);
        setDetailDirty(false);
        handleCancelSelectionMode();
    }), [handleCancelSelectionMode, registerPrimaryActivityReset]);

    useEffect(() => registerPrimaryActivityReset("tasks:detail", () => {
        setPendingTaskLeaveAction(null);
        setDetailDirty(false);
        setSelectedTaskId(null);
    }), [registerPrimaryActivityReset]);

    useEffect(() => {
        if (selectionMode) return;
        if (routeTaskId) {
            enterPrimaryActivity("tasks:detail");
        }
        setSelectedTaskId(routeTaskId);
    }, [enterPrimaryActivity, routeTaskId, selectionMode]);

    useEffect(() => {
        if (!selectionMode) return;
        setSelectedTaskId(null);
        setDetailDirty(false);
    }, [selectionMode]);

    useEffect(() => {
        if (selectedTask) return;
        setDetailDirty(false);
        setPendingTaskLeaveAction(null);
    }, [selectedTask]);

    useEffect(() => {
        if (!selectedTask || selectionMode) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            if (pendingTaskLeaveAction || bulkDeletingOpen || mobileFiltersOpen) return;
            if (isTaskNavigationBlockedTarget(event.target)) return;

            if (event.key === "ArrowLeft") {
                if (!previousTask) return;
                event.preventDefault();
                handleTaskPanelNavigate(previousTask.id);
                return;
            }

            if (event.key === "ArrowRight") {
                if (!nextTask) return;
                event.preventDefault();
                handleTaskPanelNavigate(nextTask.id);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [
        bulkDeletingOpen,
        handleTaskPanelNavigate,
        mobileFiltersOpen,
        nextTask,
        pendingTaskLeaveAction,
        previousTask,
        selectedTask,
        selectionMode,
    ]);

    useEffect(() => {
        if (!selectionMode) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.key !== "Escape") return;
            if (bulkDeletingOpen) return;

            event.preventDefault();
            requestSelectionModeExit();
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [bulkDeletingOpen, requestSelectionModeExit, selectionMode]);

    const taskContent = loading ? (
        <div className="surface-muted px-3 py-4 text-sm text-muted-foreground">Loading tasks...</div>
    ) : view === "today" ? (
        hasTodayDisplayTasks ? (
            <div className="space-y-4">
                {overdueDisplayTasks.length > 0 ? (
                    <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                            <p className="eyebrow">Overdue</p>
                            <span className="text-xs text-muted-foreground">{overdueTasks.length}</span>
                        </div>
                        <TaskList
                            tasks={overdueDisplayTasks}
                            lists={lists}
                            showProject
                            selectedTaskId={selectedTaskId}
                            selectedTaskIds={selectedTaskIdSet}
                            selectionMode={selectionMode}
                            onSelectionToggle={handleTaskSelection}
                            onSelect={handleTaskSelect}
                            onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
                            emptyMessage="Nothing overdue."
                        />
                    </div>
                ) : null}

                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <p className="eyebrow">Due today</p>
                        <span className="text-xs text-muted-foreground">{dueTodayTasks.length}</span>
                    </div>
                    <TaskList
                        tasks={dueTodayDisplayTasks}
                        lists={lists}
                        showProject
                        selectedTaskId={selectedTaskId}
                        selectedTaskIds={selectedTaskIdSet}
                        selectionMode={selectionMode}
                        onSelectionToggle={handleTaskSelection}
                        onSelect={handleTaskSelect}
                        onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
                        emptyMessage="Nothing else due today."
                    />
                </div>
            </div>
        ) : (
            <EmptyState
                title="No tasks"
                description="Adjust filters or add one."
                action={
                    <Button size="sm" onClick={() => openQuickAdd(defaultListId ? { listId: defaultListId } : undefined)}>
                        <Plus className="h-4 w-4" />
                        Add
                    </Button>
                }
            />
        )
    ) : visibleDisplayTasks.length === 0 ? (
        <EmptyState
            title="No tasks"
            description="Adjust filters or add one."
            action={
                <Button size="sm" onClick={() => openQuickAdd(defaultListId ? { listId: defaultListId } : undefined)}>
                    <Plus className="h-4 w-4" />
                    Add
                </Button>
            }
        />
    ) : (
        <TaskList
            tasks={visibleDisplayTasks}
            lists={lists}
            showProject={projectFilter === "all"}
            selectedTaskId={selectedTaskId}
            selectedTaskIds={selectedTaskIdSet}
            selectionMode={selectionMode}
            onSelectionToggle={handleTaskSelection}
            onSelect={handleTaskSelect}
            onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
        />
    );

    return (
        <>
            <div className={selectionMode ? "page-container pb-28" : "page-container"}>
                <PageHeader
                    title={currentViewLabel}
                    actions={
                        <>
                            <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="outline" size="icon-sm" className="relative sm:hidden">
                                        <Filter className="h-4 w-4" />
                                        {activeFilterCount > 0 ? (
                                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                                                {activeFilterCount}
                                            </span>
                                        ) : null}
                                        <span className="sr-only">Open filters</span>
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="bottom" className="rounded-t-xl border-x-0 border-t border-border">
                                    <SheetHeader className="sr-only">
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
                                            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-sm bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                                                {activeFilterCount}
                                            </span>
                                        ) : null}
                                        <span className="sr-only">Open filters</span>
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent align="end" className="w-72 p-3">
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
                                onClick={handleSelectionModeChange}
                                aria-pressed={selectionMode}
                                title={selectionMode ? "Exit selection mode" : "Select tasks"}
                            >
                                <CheckSquare2 className="h-4 w-4" />
                                <span className="sr-only">{selectionMode ? "Exit selection mode" : "Select tasks"}</span>
                            </Button>

                            {!selectionMode ? (
                                <Button size="sm" onClick={() => openQuickAdd(defaultListId ? { listId: defaultListId } : undefined)}>
                                    <Plus className="h-4 w-4" />
                                    Add
                                </Button>
                            ) : null}
                        </>
                    }
                />

                <AnimatePresence>
                    {selectionMode ? (
                        <TaskSelectionBar
                            lists={lists}
                            selectedCount={selectedVisibleTasks.length}
                            totalVisibleCount={selectableTasks.length}
                            allVisibleSelected={allVisibleSelected}
                            editing={bulkEditing}
                            completing={bulkCompleting}
                            deleting={bulkDeleting}
                            onCancel={requestSelectionModeExit}
                            onToggleSelectAll={handleToggleSelectAll}
                            onSetDueDate={handleSetSelectedDueDate}
                            onSetPriority={handleSetSelectedPriority}
                            onSetProject={handleMoveSelectedTasks}
                            onCompleteSelected={() => void handleCompleteSelected()}
                            onDeleteSelected={() => setBulkDeletingOpen(true)}
                        />
                    ) : null}
                </AnimatePresence>

                {activeFilterCount > 0 ? (
                    <div className="flex flex-wrap gap-2">
                        {activeProjectName ? (
                            <button
                                type="button"
                                onClick={() => setProjectFilter("all")}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                                {activeProjectName}
                                <X className="h-3 w-3" />
                            </button>
                        ) : null}
                        {priorityFilter !== "all" ? (
                            <button
                                type="button"
                                onClick={() => setPriorityFilter("all")}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                                {PRIORITY_OPTIONS.find((option) => option.value === priorityFilter)?.label}
                                <X className="h-3 w-3" />
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
                            previousTask={previousTask}
                            nextTask={nextTask}
                            taskPositionLabel={taskPositionLabel}
                            open={!selectionMode && !!selectedTask}
                            onOpenChange={(open) => {
                                if (!open) {
                                    requestTaskLeave(() => {
                                        setSelectedTaskId(null);
                                        setDetailDirty(false);
                                    });
                                }
                            }}
                            onClose={() => {
                                requestTaskLeave(() => {
                                    setSelectedTaskId(null);
                                    setDetailDirty(false);
                                });
                            }}
                            onNavigateToTask={handleTaskPanelNavigate}
                            onDirtyChange={setDetailDirty}
                            onSaved={() => undefined}
                            onDeleted={() => {
                                setPendingTaskLeaveAction(null);
                                setDetailDirty(false);
                                setSelectedTaskId(null);
                            }}
                        />
                    ) : null}
                </div>
            </div>

            <Dialog open={!!pendingTaskLeaveAction} onOpenChange={(open) => {
                if (!open) {
                    handleCancelTaskLeave();
                }
            }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Discard unsaved changes?</DialogTitle>
                        <DialogDescription>
                            Your edits to {selectedTask?.title ? `"${selectedTask.title}"` : "this task"} haven&apos;t been saved.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={handleCancelTaskLeave}>
                            Stay
                        </Button>
                        <Button variant="destructive" onClick={handleConfirmTaskLeave}>
                            Discard changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={bulkDeletingOpen} onOpenChange={setBulkDeletingOpen}>
                <DialogContent className="max-w-md">
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
                        <Button variant="destructive" onClick={() => void handleConfirmDeleteSelected()} disabled={bulkDeleting}>
                            {bulkDeleting ? "Deleting..." : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
        <div className="space-y-4 p-1">
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
                    className="h-9 w-full justify-center"
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
        ? "rounded-full border border-primary bg-primary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground"
        : "rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";
}
