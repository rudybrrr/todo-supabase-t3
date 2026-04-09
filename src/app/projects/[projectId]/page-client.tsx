"use client";

import { AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, CheckSquare2, Filter, FolderKanban, MoreHorizontal, PencilLine, Plus, Share2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { AppShell, useShellActions } from "~/components/app-shell";
import { EmptyState, PageHeader } from "~/components/app-primitives";
import { ProjectDialog } from "~/components/project-dialog";
import { ProjectMembersDialog } from "~/components/project-members-dialog";
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
import { dedupeTasks, useTaskSelectionActions } from "~/hooks/use-task-selection-actions";
import { mergeBufferedTasks, useTaskTransitionBuffer } from "~/hooks/use-task-transition-buffer";
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

export default function ProjectWorkspaceClient({ projectId }: { projectId: string }) {
    return (
        <AppShell>
            <ProjectWorkspaceContent projectId={projectId} />
        </AppShell>
    );
}

function ProjectWorkspaceContent({ projectId }: { projectId: string }) {
    const router = useRouter();
    const { enterPrimaryActivity, openQuickAdd, registerPrimaryActivityReset } = useShellActions();
    const { userId, lists, tasks, projectSummaries, imagesByTodo, loading } = useTaskDataset();
    const { bufferedTasks, queueBufferedTask } = useTaskTransitionBuffer();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [projectDialogOpen, setProjectDialogOpen] = useState(false);
    const [membersDialogOpen, setMembersDialogOpen] = useState(false);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [taskFilter, setTaskFilter] = useState<"open" | "done" | "all">("open");
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilterValue>("all");
    const [bulkDeletingOpen, setBulkDeletingOpen] = useState(false);

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

    useEffect(() => {
        if (!selectedTaskId) return;
        if (!visibleTasks.some((task) => task.id === selectedTaskId)) {
            setSelectedTaskId(null);
        }
    }, [selectedTaskId, visibleTasks]);

    const getBufferPlacement = useCallback((task: TaskDatasetRecord, nextIsDone: boolean) => {
        const willLeaveCurrentFilter = (taskFilter === "open" && nextIsDone) || (taskFilter === "done" && !nextIsDone);
        if (!willLeaveCurrentFilter) return null;

        const visibleIndex = visibleTasks.findIndex((item) => item.id === task.id);
        return visibleIndex !== -1 ? { bucket: `project:${taskFilter}`, index: visibleIndex } : null;
    }, [taskFilter, visibleTasks]);

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

    const enterSelectionMode = useCallback(() => {
        if (selectionMode) return;
        enterPrimaryActivity("project-workspace:selection");
        handleToggleSelectionMode();
    }, [enterPrimaryActivity, handleToggleSelectionMode, selectionMode]);

    const requestSelectionModeExit = useCallback(() => {
        if (!selectionMode || bulkEditing || bulkCompleting || bulkDeleting) return;
        handleCancelSelectionMode();
    }, [bulkCompleting, bulkDeleting, bulkEditing, handleCancelSelectionMode, selectionMode]);

    const handleSelectionModeChange = useCallback(() => {
        if (selectionMode) {
            requestSelectionModeExit();
            return;
        }
        enterSelectionMode();
    }, [enterSelectionMode, requestSelectionModeExit, selectionMode]);

    const handleTaskSelect = useCallback((task: TaskDatasetRecord, options?: { shiftKey?: boolean }) => {
        if (options?.shiftKey) {
            enterPrimaryActivity("project-workspace:selection");
            handleToggleTaskSelection(task, { shiftKey: true, enterSelectionMode: true });
            return;
        }

        if (selectedTaskId !== task.id) {
            enterPrimaryActivity("project-workspace:task-detail");
        }
        setSelectedTaskId((current) => current === task.id ? null : task.id);
    }, [enterPrimaryActivity, handleToggleTaskSelection, selectedTaskId]);

    const handleTaskSelection = useCallback((task: TaskDatasetRecord, options?: { shiftKey?: boolean }) => {
        handleToggleTaskSelection(task, { shiftKey: options?.shiftKey });
    }, [handleToggleTaskSelection]);

    const handleProjectDialogOpenChange = useCallback((open: boolean) => {
        if (open) {
            enterPrimaryActivity("project-workspace:dialog");
        }
        setProjectDialogOpen(open);
    }, [enterPrimaryActivity]);

    const handleMembersDialogOpenChange = useCallback((open: boolean) => {
        if (open) {
            enterPrimaryActivity("project-workspace:members");
        }
        setMembersDialogOpen(open);
    }, [enterPrimaryActivity]);

    useEffect(() => registerPrimaryActivityReset("project-workspace:selection", () => {
        setBulkDeletingOpen(false);
        handleCancelSelectionMode();
    }), [handleCancelSelectionMode, registerPrimaryActivityReset]);

    useEffect(() => registerPrimaryActivityReset("project-workspace:task-detail", () => {
        setSelectedTaskId(null);
    }), [registerPrimaryActivityReset]);

    useEffect(() => registerPrimaryActivityReset("project-workspace:dialog", () => {
        setProjectDialogOpen(false);
    }), [registerPrimaryActivityReset]);

    useEffect(() => registerPrimaryActivityReset("project-workspace:members", () => {
        setMembersDialogOpen(false);
    }), [registerPrimaryActivityReset]);

    useEffect(() => {
        if (!selectionMode) return;
        setSelectedTaskId(null);
    }, [selectionMode]);

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

    if (!project || !projectSummary) {
        return (
            <div className="page-container">
                <EmptyState
                    title="Project not found"
                    description="Return to Projects and pick another workspace."
                    icon={<FolderKanban className="h-8 w-8" />}
                    action={<Button size="sm" onClick={() => router.push("/projects")}>Back</Button>}
                />
            </div>
        );
    }

    return (
        <>
            <div className={selectionMode ? "page-container pb-28" : "page-container"}>
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
                                    <SheetHeader className="sr-only">
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
                                <PopoverContent align="end" className="w-72 p-3">
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
                                onClick={handleSelectionModeChange}
                                aria-pressed={selectionMode}
                                title={selectionMode ? "Exit selection mode" : "Select tasks"}
                            >
                                <CheckSquare2 className="h-4 w-4" />
                                <span className="sr-only">{selectionMode ? "Exit selection mode" : "Select tasks"}</span>
                            </Button>

                            {!selectionMode ? (
                                <Button size="sm" onClick={() => openQuickAdd({ listId: project.id })}>
                                    <Plus className="h-4 w-4" />
                                    Add
                                </Button>
                            ) : null}

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon-sm">
                                        <MoreHorizontal className="h-4 w-4" />
                                        <span className="sr-only">Project actions</span>
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-52 rounded-xl">
                                    <DropdownMenuItem onClick={() => router.push(`/calendar?listId=${project.id}`)}>
                                        <CalendarRange className="h-4 w-4" />
                                        Calendar
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleMembersDialogOpenChange(true)}>
                                        <Share2 className="h-4 w-4" />
                                        Members
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleProjectDialogOpenChange(true)}>
                                        <PencilLine className="h-4 w-4" />
                                        Edit project
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
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
                        {taskFilter !== "open" ? (
                            <button
                                type="button"
                                onClick={() => setTaskFilter("open")}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                            >
                                {PROJECT_STATUS_OPTIONS.find((option) => option.value === taskFilter)?.label}
                                <X className="h-3.5 w-3.5" />
                            </button>
                        ) : null}
                        {priorityFilter !== "all" ? (
                            <button
                                type="button"
                                onClick={() => setPriorityFilter("all")}
                                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
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
                            <div className="surface-muted px-3 py-4 text-sm text-muted-foreground">Loading tasks...</div>
                        ) : visibleDisplayTasks.length > 0 ? (
                            <TaskList
                                tasks={visibleDisplayTasks}
                                lists={lists}
                                selectedTaskId={selectedTaskId}
                                selectedTaskIds={selectedTaskIdSet}
                                selectionMode={selectionMode}
                                onSelectionToggle={handleTaskSelection}
                                onSelect={handleTaskSelect}
                                onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
                            />
                        ) : (
                            <EmptyState
                                title="No tasks"
                                description={activeFilterCount > 0 ? "Adjust filters or add one." : "Add a task to this project."}
                                action={(
                                    <Button size="sm" onClick={() => openQuickAdd({ listId: project.id })}>
                                        <Plus className="h-4 w-4" />
                                        Add
                                    </Button>
                                )}
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
                onOpenChange={handleProjectDialogOpenChange}
                initialProject={project}
                onRemoved={() => router.push("/projects")}
            />
            <ProjectMembersDialog
                open={membersDialogOpen}
                onOpenChange={handleMembersDialogOpenChange}
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
                        <Button variant="destructive" onClick={() => void handleConfirmDeleteSelected()} disabled={bulkDeleting}>
                            {bulkDeleting ? "Deleting..." : "Delete"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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
        <div className="space-y-4 p-1">
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
                    className="h-9 w-full justify-center"
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
        ? "rounded-full border border-primary bg-primary px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary-foreground"
        : "rounded-full border border-border bg-card px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";
}
