"use client";

import { format } from "date-fns";
import { useMemo } from "react";
import { ArrowRight, CalendarRange } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { AppShell, useShellActions } from "~/components/app-shell";
import { EmptyState, MetricTile, PageHeader, SectionCard } from "~/components/app-primitives";
import { FocusStrip } from "~/components/focus-strip";
import { TaskList } from "~/components/task-list";
import { useData } from "~/components/data-provider";
import { Button } from "~/components/ui/button";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { mergeBufferedTasks, useTaskTransitionBuffer } from "~/hooks/use-task-transition-buffer";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { setTaskCompletion } from "~/lib/task-actions";
import { getSmartViewTasks, isTaskDueToday, isTaskOverdue, selectNextUpTask } from "~/lib/task-views";

export default function HomeClient() {
    return (
        <AppShell>
            <HomeContent />
        </AppShell>
    );
}

function HomeContent() {
    const router = useRouter();
    const { openQuickAdd } = useShellActions();
    const { profile } = useData();
    const { applyTaskPatch, tasks, lists, loading, todayFocusMinutes, upsertTask } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { bufferedTasks, queueBufferedTask } = useTaskTransitionBuffer();

    const todayTasks = useMemo(() => getSmartViewTasks(tasks, "today"), [tasks]);
    const upcomingTasks = useMemo(() => getSmartViewTasks(tasks, "upcoming").slice(0, 5), [tasks]);
    const nextUp = useMemo(() => selectNextUpTask(tasks), [tasks]);
    const todayDisplayTasks = useMemo(
        () => mergeBufferedTasks(todayTasks.slice(0, 8), bufferedTasks.filter((item) => item.bucket === "home-today")),
        [bufferedTasks, todayTasks],
    );
    const upcomingDisplayTasks = useMemo(
        () => mergeBufferedTasks(upcomingTasks, bufferedTasks.filter((item) => item.bucket === "home-upcoming")),
        [bufferedTasks, upcomingTasks],
    );

    const overdueCount = tasks.filter((task) => isTaskOverdue(task)).length;
    const dueTodayCount = tasks.filter((task) => isTaskDueToday(task)).length;
    const dailyGoal = profile?.daily_focus_goal_minutes ?? 120;
    const progress = Math.min(100, Math.round((todayFocusMinutes / dailyGoal) * 100));

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

        if (nextIsDone) {
            const todayIndex = todayTasks.slice(0, 8).findIndex((task) => task.id === taskId);
            const upcomingIndex = upcomingTasks.findIndex((task) => task.id === taskId);

            if (todayIndex !== -1) {
                queueBufferedTask(optimisticTask, "home-today", todayIndex);
            } else if (upcomingIndex !== -1) {
                queueBufferedTask(optimisticTask, "home-upcoming", upcomingIndex);
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

    return (
        <div className="page-container">
            <PageHeader
                eyebrow={format(new Date(), "EEEE, MMM d")}
                title="Today"
                actions={
                    <>
                        <Button variant="outline" onClick={() => router.push("/calendar")}>
                            <CalendarRange className="h-4 w-4" />
                            Calendar
                        </Button>
                        <Button onClick={() => openQuickAdd()}>
                            Add task
                        </Button>
                    </>
                }
            />

            <div className="grid gap-3 sm:grid-cols-3">
                <MetricTile label="Overdue" value={String(overdueCount)} />
                <MetricTile label="Due Today" value={String(dueTodayCount)} />
                <MetricTile label="Focus" value={`${todayFocusMinutes}m`} meta={`${progress}% of ${dailyGoal}m`} />
            </div>

            <FocusStrip />

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <SectionCard
                    title="Next Up"
                    action={
                        nextUp ? (
                            <Button variant="tonal" size="sm" onClick={() => router.push(`/tasks?taskId=${nextUp.id}`)}>
                                Open
                            </Button>
                        ) : null
                    }
                >
                    {nextUp ? (
                        <div className="space-y-4">
                            <div className="rounded-[1.25rem] border border-border/70 bg-muted/55 p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 space-y-1.5">
                                        <h2 className="truncate text-xl font-semibold tracking-[-0.03em] text-foreground">
                                            {nextUp.title}
                                        </h2>
                                        {nextUp.description?.trim() ? (
                                            <p className="line-clamp-2 text-sm text-muted-foreground">
                                                {nextUp.description}
                                            </p>
                                        ) : null}
                                    </div>
                                    <Button size="sm" onClick={() => router.push(`/tasks?taskId=${nextUp.id}`)}>
                                        <ArrowRight className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <EmptyState
                            title="Nothing urgent"
                            description="Add a task or plan the next block."
                            action={<Button onClick={() => openQuickAdd()}>Add task</Button>}
                        />
                    )}
                </SectionCard>

                <SectionCard
                    title="Upcoming"
                    action={
                        <Button variant="tonal" size="sm" asChild>
                            <Link href="/tasks?view=upcoming">Open</Link>
                        </Button>
                    }
                >
                    {upcomingDisplayTasks.length > 0 ? (
                        <TaskList
                            tasks={upcomingDisplayTasks}
                            lists={lists}
                            showProject
                            onSelect={(task) => router.push(`/tasks?taskId=${task.id}`)}
                            onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
                        />
                    ) : (
                        <div className="surface-muted px-4 py-6 text-sm text-muted-foreground">
                            No dated tasks.
                        </div>
                    )}
                </SectionCard>
            </div>

            <SectionCard title="Today">
                {loading ? (
                    <div className="surface-muted px-4 py-6 text-sm text-muted-foreground">Loading tasks...</div>
                ) : todayDisplayTasks.length > 0 ? (
                    <TaskList
                        tasks={todayDisplayTasks}
                        lists={lists}
                        showProject
                        onSelect={(task) => router.push(`/tasks?taskId=${task.id}`)}
                        onToggle={(task, nextIsDone) => void handleToggle(task.id, nextIsDone)}
                    />
                ) : (
                    <EmptyState
                        title="Nothing due"
                        description="No overdue or due-today tasks."
                    />
                )}
            </SectionCard>
        </div>
    );
}
