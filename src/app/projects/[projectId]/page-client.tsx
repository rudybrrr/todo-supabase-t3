"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarRange, FolderKanban, PencilLine, Plus, Settings, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppShell, useShellActions } from "~/components/app-shell";
import { EmptyState, PageHeader, SectionCard } from "~/components/app-primitives";
import { ProjectDialog } from "~/components/project-dialog";
import { ProjectMembersDialog } from "~/components/project-members-dialog";
import { ProjectSettingsDialog } from "~/components/project-settings-dialog";
import { TaskDetailPanel } from "~/components/task-detail-panel";
import { TaskList } from "~/components/task-list";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { mergeBufferedTasks, useTaskTransitionBuffer } from "~/hooks/use-task-transition-buffer";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { createTask } from "~/lib/task-actions";
import { setTaskCompletion } from "~/lib/task-actions";
import type { TaskPriority } from "~/lib/task-views";
import { cn } from "~/lib/utils";

const PRIORITY_OPTIONS: Array<{ value: "all" | TaskPriority; label: string }> = [
    { value: "all", label: "All Priority" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
];

export default function ProjectWorkspaceClient({ projectId }: { projectId: string }) {
    return (
        <AppShell>
            <ProjectWorkspaceContent projectId={projectId} />
        </AppShell>
    );
}

function cnPriorityFilter(active: boolean) {
    return active
        ? "rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary"
        : "rounded-full border border-border/70 bg-background/70 px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:text-foreground";
}

function ProjectWorkspaceContent({ projectId }: { projectId: string }) {
    const router = useRouter();
    const { openQuickAdd } = useShellActions();
    const { applyTaskPatch, userId, lists, tasks, projectSummaries, imagesByTodo, loading, upsertTask } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { bufferedTasks, queueBufferedTask } = useTaskTransitionBuffer();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [projectDialogOpen, setProjectDialogOpen] = useState(false);
    const [membersDialogOpen, setMembersDialogOpen] = useState(false);
    const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
    const [taskFilter, setTaskFilter] = useState<"open" | "done" | "all">("open");
    const [priorityFilter, setPriorityFilter] = useState<"all" | TaskPriority>("all");
    const [inlineTitle, setInlineTitle] = useState("");
    const [addingInline, setAddingInline] = useState(false);

    const project = lists.find((list) => list.id === projectId) ?? null;
    const projectSummary = projectSummaries.find((summary) => summary.list.id === projectId) ?? null;
    const projectTasks = tasks.filter((task) => task.list_id === projectId);
    const priorityScopedTasks = projectTasks.filter((task) => {
        if (priorityFilter === "all") return true;
        return task.priority === priorityFilter;
    });
    const visibleTasks = priorityScopedTasks.filter((task) => {
        if (taskFilter === "open") return !task.is_done;
        if (taskFilter === "done") return task.is_done;
        return true;
    });
    const visibleDisplayTasks = useMemo(
        () => mergeBufferedTasks(visibleTasks, bufferedTasks.filter((item) => item.bucket === `project:${taskFilter}`)),
        [bufferedTasks, taskFilter, visibleTasks],
    );
    const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;

    useEffect(() => {
        if (!selectedTaskId) return;
        if (!visibleTasks.some((task) => task.id === selectedTaskId)) {
            setSelectedTaskId(null);
        }
    }, [selectedTaskId, visibleTasks]);

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
            upsertTask(updatedTask);
            toast.success(nextIsDone ? "Task completed." : "Task reopened.");
        } catch (error) {
            upsertTask(existingTask);
            toast.error(error instanceof Error ? error.message : "Unable to update task.");
        }
    }

    async function handleInlineAdd() {
        if (!userId || !inlineTitle.trim()) return;

        try {
            setAddingInline(true);
            const createdTask = await createTask(supabase, {
                userId,
                listId: projectId,
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
                            <Button
                                variant="outline"
                                size="icon-sm"
                                title="Open project calendar"
                                aria-label="Open project calendar"
                                onClick={() => router.push(`/calendar?listId=${project.id}`)}
                            >
                                <CalendarRange className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                title="Manage members"
                                aria-label="Manage members"
                                onClick={() => setMembersDialogOpen(true)}
                            >
                                <Share2 className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                title="Project settings"
                                aria-label="Project settings"
                                onClick={() => setSettingsDialogOpen(true)}
                            >
                                <Settings className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="outline"
                                size="icon-sm"
                                title="Edit project"
                                aria-label="Edit project"
                                onClick={() => setProjectDialogOpen(true)}
                            >
                                <PencilLine className="h-4 w-4" />
                            </Button>
                        </>
                    }
                />

                <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-border/60 bg-card/90 px-3 py-2 text-sm text-muted-foreground">
                        {projectSummary.incompleteCount} open
                    </span>
                    <span className="rounded-full border border-border/60 bg-card/90 px-3 py-2 text-sm text-muted-foreground">
                        {projectSummary.dueSoonCount} due soon
                    </span>
                    {projectSummary.memberCount > 1 ? (
                        <span className="rounded-full border border-border/60 bg-card/90 px-3 py-2 text-sm text-muted-foreground">
                            {projectSummary.memberCount} members
                        </span>
                    ) : null}
                </div>

                <SectionCard title="Tasks">
                    <div className="space-y-5">
                        <div className="surface-muted flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <Plus className="h-4 w-4" />
                                </div>
                                <Input
                                    value={inlineTitle}
                                    onChange={(event) => setInlineTitle(event.target.value)}
                                    placeholder={`Add a task to ${project.name}`}
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
                                <Button variant="ghost" size="sm" onClick={() => openQuickAdd({ listId: project.id })}>
                                    More details
                                </Button>
                                <Button size="sm" onClick={() => void handleInlineAdd()} disabled={addingInline || !inlineTitle.trim()}>
                                    {addingInline ? "Adding..." : "Add"}
                                </Button>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex flex-wrap gap-2">
                            {[
                                { value: "open", label: `Open ${projectSummary.incompleteCount}` },
                                { value: "done", label: `Completed ${projectSummary.completedCount}` },
                                { value: "all", label: `All ${projectTasks.length}` },
                            ].map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setTaskFilter(option.value as typeof taskFilter)}
                                    className={cn(
                                        "rounded-full px-4 py-2 text-sm font-semibold transition-colors",
                                        taskFilter === option.value
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-secondary text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    {option.label}
                                </button>
                            ))}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {PRIORITY_OPTIONS.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => setPriorityFilter(option.value)}
                                        className={cnPriorityFilter(priorityFilter === option.value)}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid gap-5 lg:flex lg:items-start lg:gap-0">
                            <div className="min-w-0 flex-1">
                                {loading ? (
                                    <div className="surface-muted px-4 py-6 text-sm text-muted-foreground">Loading tasks...</div>
                                ) : visibleDisplayTasks.length > 0 ? (
                                    <TaskList
                                        tasks={visibleDisplayTasks}
                                        lists={lists}
                                        selectedTaskId={selectedTaskId}
                                        onSelect={(task) => setSelectedTaskId((current) => current === task.id ? null : task.id)}
                                        onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
                                    />
                                ) : (
                                    <EmptyState
                                        title="No tasks"
                                        description="Add a task to this project."
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

            <ProjectDialog
                open={projectDialogOpen}
                onOpenChange={setProjectDialogOpen}
                initialProject={project}
            />
            <ProjectMembersDialog
                open={membersDialogOpen}
                onOpenChange={setMembersDialogOpen}
                project={project}
            />
            <ProjectSettingsDialog
                open={settingsDialogOpen}
                onOpenChange={setSettingsDialogOpen}
                project={project}
                onProjectRemoved={() => router.push("/projects")}
            />
        </>
    );
}
