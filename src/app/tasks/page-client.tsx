"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, Plus, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { AppShell, useShellActions } from "~/components/app-shell";
import { EmptyState, PageHeader, SectionCard } from "~/components/app-primitives";
import { TaskDetailPanel } from "~/components/task-detail-panel";
import { TaskList } from "~/components/task-list";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "~/components/ui/sheet";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { mergeBufferedTasks, useTaskTransitionBuffer } from "~/hooks/use-task-transition-buffer";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { createTask, setTaskCompletion } from "~/lib/task-actions";
import {
    getSmartViewTasks,
    isTaskDueToday,
    isTaskOverdue,
    taskMatchesSearch,
    type TaskPriority,
    type SmartView,
} from "~/lib/task-views";

const VIEW_OPTIONS: Array<{ value: SmartView; label: string }> = [
    { value: "today", label: "Today" },
    { value: "upcoming", label: "Upcoming" },
    { value: "inbox", label: "Inbox" },
    { value: "done", label: "Completed" },
];

const PRIORITY_OPTIONS: Array<{ value: "all" | TaskPriority; label: string }> = [
    { value: "all", label: "All Priority" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
];

function getRouteView(value: string | null): SmartView {
    if (value === "upcoming" || value === "inbox" || value === "done") {
        return value;
    }
    return "today";
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
    const { applyTaskPatch, upsertTask, userId, tasks, lists, imagesByTodo, loading } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { bufferedTasks, queueBufferedTask } = useTaskTransitionBuffer();

    const routeView = getRouteView(searchParams.get("view"));
    const routeTaskId = searchParams.get("taskId");

    const [view, setView] = useState<SmartView>(routeView);
    const [projectFilter, setProjectFilter] = useState("all");
    const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
    const [search, setSearch] = useState("");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(routeTaskId);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [inlineTitle, setInlineTitle] = useState("");
    const [addingInline, setAddingInline] = useState(false);

    useEffect(() => {
        setView(routeView);
    }, [routeView]);

    useEffect(() => {
        setSelectedTaskId(routeTaskId);
    }, [routeTaskId]);

    const projectScopedTasks = useMemo(() => {
        return tasks.filter((task) => {
            const matchesProject = projectFilter === "all" || task.list_id === projectFilter;
            const matchesQuery = taskMatchesSearch(task, search);
            return matchesProject && matchesQuery;
        });
    }, [projectFilter, search, tasks]);

    const priorityScopedTasks = useMemo(() => {
        if (priorityFilter === "all") return projectScopedTasks;
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
            upsertTask(updatedTask);
            toast.success(nextIsDone ? "Task completed." : "Task reopened.");
        } catch (error) {
            upsertTask(existingTask);
            toast.error(error instanceof Error ? error.message : "Unable to update task.");
        }
    }

    async function handleInlineAdd() {
        if (!userId || !defaultListId || !inlineTitle.trim()) return;

        try {
            setAddingInline(true);
            const createdTask = await createTask(supabase, {
                userId,
                listId: defaultListId,
                title: inlineTitle,
            });
            upsertTask(createdTask);
            setInlineTitle("");
            toast.success("Task added.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to add task.");
        } finally {
            setAddingInline(false);
        }
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
                action={<Button onClick={() => openQuickAdd()}>Add task</Button>}
            />
        )
    ) : visibleDisplayTasks.length === 0 ? (
        <EmptyState
            title="No tasks"
            description="Adjust filters or add a task."
            action={<Button onClick={() => openQuickAdd()}>Add task</Button>}
        />
    ) : (
        <TaskList
            tasks={visibleDisplayTasks}
            lists={lists}
            showProject={projectFilter === "all"}
            selectedTaskId={selectedTaskId}
            onSelect={(task) => setSelectedTaskId((current) => current === task.id ? null : task.id)}
            onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
        />
    );

    return (
        <div className="page-container">
            <PageHeader
                title="Tasks"
                actions={
                    <>
                        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
                            <SheetTrigger asChild>
                                <Button variant="outline" className="sm:hidden">
                                    <Filter className="h-4 w-4" />
                                    Filters
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="bottom" className="rounded-t-[2rem] border-x-0 border-t border-border/70">
                                <SheetHeader>
                                    <SheetTitle>Filters</SheetTitle>
                                    <SheetDescription>Search and project filter.</SheetDescription>
                                </SheetHeader>
                                <div className="space-y-4 p-4">
                                    <div className="space-y-2">
                                        <p className="eyebrow">Search</p>
                                        <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" />
                                    </div>
                                    <div className="space-y-2">
                                        <p className="eyebrow">Project</p>
                                        <Select value={projectFilter} onValueChange={setProjectFilter}>
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
                                        <Select
                                            value={priorityFilter}
                                            onValueChange={(value) => setPriorityFilter(value as "all" | TaskPriority)}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="All Priority" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {PRIORITY_OPTIONS.map((option) => (
                                                    <SelectItem key={option.value} value={option.value}>
                                                        {option.label}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                        <Button onClick={() => openQuickAdd()}>
                            Add task
                        </Button>
                    </>
                }
            />

            <SectionCard title="Workspace">
                <div className="space-y-4">
                    <div className="surface-muted flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                <Plus className="h-4 w-4" />
                            </div>
                            <Input
                                value={inlineTitle}
                                onChange={(event) => setInlineTitle(event.target.value)}
                                placeholder={
                                    projectFilter === "all"
                                        ? "Add a task"
                                        : `Add a task to ${lists.find((list) => list.id === projectFilter)?.name ?? "this project"}`
                                }
                                className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                                onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                        event.preventDefault();
                                        void handleInlineAdd();
                                    }
                                }}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => openQuickAdd(defaultListId ? { listId: defaultListId } : undefined)}>
                                More details
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => void handleInlineAdd()}
                                disabled={addingInline || !inlineTitle.trim() || !defaultListId}
                            >
                                {addingInline ? "Adding..." : "Add"}
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex flex-wrap gap-2 lg:hidden">
                            {VIEW_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setView(option.value)}
                                    className={cnTaskView(view === option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                            <div className="relative flex-1">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Search tasks"
                                    className="pl-10"
                                />
                            </div>
                            <div className="hidden min-w-56 sm:block">
                                <Select value={projectFilter} onValueChange={setProjectFilter}>
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
                        </div>

                        <div className="hidden flex-wrap gap-2 sm:flex">
                            {PRIORITY_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setPriorityFilter(option.value)}
                                    className={cnTaskFilter(priorityFilter === option.value)}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid gap-5 lg:flex lg:items-start lg:gap-0">
                        <div className="min-w-0 flex-1">{taskContent}</div>
                        {userId ? (
                            <TaskDetailPanel
                                task={selectedTask}
                                lists={lists}
                                images={selectedTask ? imagesByTodo[selectedTask.id] ?? [] : []}
                                userId={userId}
                                open={!!selectedTask}
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
            </SectionCard>
        </div>
    );
}

function cnTaskView(active: boolean) {
    return active
        ? "rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        : "rounded-full bg-secondary px-4 py-2 text-sm font-semibold text-muted-foreground";
}

function cnTaskFilter(active: boolean) {
    return active
        ? "rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
        : "rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground";
}
