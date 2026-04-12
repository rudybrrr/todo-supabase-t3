"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Flame, Gauge, Target, Timer, TrendingUp } from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { EmptyState, MetricTile, PageHeader, SectionCard } from "~/components/app-primitives";
import { useData } from "~/components/data-provider";
import { TaskDetailPanel } from "~/components/task-detail-panel";
import { Badge } from "~/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { formatMinutesCompact, getPlanningStatusLabel } from "~/lib/planning";
import {
    buildWeeklyProgressReview,
    formatProgressCountDelta,
    formatProgressMinuteDelta,
    getProgressExecutionLabel,
    getProgressProjectStatusLabel,
    type ProgressReviewMeasuredTask,
    type ProgressReviewTaskItem,
} from "~/lib/progress-review";
import type { TaskEstimateAccuracyStatus } from "~/lib/task-estimates";

const ResponsiveContainer = dynamic(() => import("recharts").then((mod) => mod.ResponsiveContainer), { ssr: false });
const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((mod) => mod.CartesianGrid), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });
const PieChart = dynamic(() => import("recharts").then((mod) => mod.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then((mod) => mod.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then((mod) => mod.Cell), { ssr: false });

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function getEstimateAccuracyVariant(status: TaskEstimateAccuracyStatus) {
    if (status === "on_track") return "success";
    if (status === "underestimated") return "warning";
    return "secondary";
}

function getSlippedTaskVariant(task: ProgressReviewTaskItem) {
    if (task.isOverdue) return "danger";
    if (task.planningStatus === "unplanned" || task.planningStatus === "partially_planned") return "warning";
    return "secondary";
}

function getEstimateAccuracyLabel(status: TaskEstimateAccuracyStatus) {
    if (status === "underestimated") return "Underestimated";
    if (status === "overestimated") return "Overestimated";
    return "On track";
}

function renderMeasuredTaskMeta(task: ProgressReviewMeasuredTask) {
    const varianceMinutes = Math.abs(task.varianceMinutes);
    const varianceLabel = task.varianceMinutes === 0
        ? "On estimate"
        : `${task.varianceMinutes > 0 ? "+" : "-"}${formatMinutesCompact(varianceMinutes)}`;

    return `Est ${formatMinutesCompact(task.estimatedMinutes)} / Actual ${formatMinutesCompact(task.actualFocusMinutes)} / ${varianceLabel} / ${task.focusSessionCount} session${task.focusSessionCount === 1 ? "" : "s"}`;
}

interface PendingTaskLeaveAction {
    run: () => void;
}

export default function ProgressClient() {
    return (
        <AppShell>
            <ProgressContent />
        </AppShell>
    );
}

function ProgressContent() {
    const { focusSessions, profile, stats, loading } = useData();
    const { imagesByTodo, lists, plannedBlocks, tasks, userId, loading: datasetLoading } = useTaskDataset();
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    const [detailDirty, setDetailDirty] = useState(false);
    const [pendingTaskLeaveAction, setPendingTaskLeaveAction] = useState<PendingTaskLeaveAction | null>(null);
    const review = useMemo(() => buildWeeklyProgressReview({
        focusSessions,
        lists,
        plannedBlocks,
        tasks,
        timeZone: profile?.timezone,
        weekStartsOn: profile?.week_starts_on === 0 ? 0 : 1,
    }), [focusSessions, lists, plannedBlocks, profile?.timezone, profile?.week_starts_on, tasks]);
    const measuredTaskCount = useMemo(
        () => Object.values(review.estimateAccuracyCounts).reduce((total, count) => total + count, 0),
        [review.estimateAccuracyCounts],
    );
    const selectedTask = useMemo(
        () => tasks.find((task) => task.id === selectedTaskId) ?? null,
        [selectedTaskId, tasks],
    );
    const slippedTaskRecords = useMemo(
        () => review.slippedTasks
            .map((item) => tasks.find((task) => task.id === item.taskId) ?? null)
            .filter((task): task is NonNullable<typeof task> => Boolean(task)),
        [review.slippedTasks, tasks],
    );
    const selectedTaskIndex = useMemo(
        () => slippedTaskRecords.findIndex((task) => task.id === selectedTaskId),
        [selectedTaskId, slippedTaskRecords],
    );
    const previousTask = selectedTaskIndex > 0 ? slippedTaskRecords[selectedTaskIndex - 1] ?? null : null;
    const nextTask = selectedTaskIndex !== -1 && selectedTaskIndex < slippedTaskRecords.length - 1
        ? (slippedTaskRecords[selectedTaskIndex + 1] ?? null)
        : null;
    const taskPositionLabel = selectedTaskIndex === -1 ? null : `${selectedTaskIndex + 1} of ${slippedTaskRecords.length}`;

    const requestTaskLeave = useCallback((action: () => void) => {
        if (detailDirty && selectedTaskId) {
            setPendingTaskLeaveAction({ run: action });
            return;
        }

        action();
    }, [detailDirty, selectedTaskId]);

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

    const handleOpenTaskDetail = useCallback((taskId: string) => {
        if (taskId === selectedTaskId) return;

        requestTaskLeave(() => {
            setSelectedTaskId(taskId);
            setDetailDirty(false);
        });
    }, [requestTaskLeave, selectedTaskId]);

    const handleTaskPanelNavigate = useCallback((taskId: string) => {
        if (taskId === selectedTaskId) return;

        requestTaskLeave(() => {
            setSelectedTaskId(taskId);
            setDetailDirty(false);
        });
    }, [requestTaskLeave, selectedTaskId]);

    useEffect(() => {
        if (!selectedTaskId) return;
        if (selectedTask) return;

        setSelectedTaskId(null);
        setDetailDirty(false);
        setPendingTaskLeaveAction(null);
    }, [selectedTask, selectedTaskId]);

    return (
        <div className="page-container">
                <PageHeader
                    eyebrow={`Weekly review • ${review.window.label}`}
                    title="Progress"
                    description={loading || !stats
                        ? "Preparing weekly execution review."
                        : `${formatMinutesCompact(review.actualFocusMinutes)} focused this week, ${review.completedCount} completed, ${review.carryoverRiskCount} tasks carrying risk. ${stats.totalFocus} total focus overall.`}
                />

                {loading || !stats || datasetLoading ? (
                    <EmptyState
                        title="Loading progress"
                        description="Preparing weekly review."
                        icon={<BarChart3 className="h-8 w-8" />}
                    />
                ) : (
                    <>
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <MetricTile
                                label="Planned vs actual"
                                value={`${formatMinutesCompact(review.actualFocusMinutes)} / ${formatMinutesCompact(review.plannedMinutes)}`}
                                meta={`${getProgressExecutionLabel(review.executionRate)} • ${formatProgressMinuteDelta(review.actualFocusDeltaMinutes)}`}
                            />
                            <MetricTile
                                label="Completed this week"
                                value={`${review.completedCount}`}
                                meta={formatProgressCountDelta(review.completedDelta, "tasks")}
                            />
                            <MetricTile
                                label="Carryover risk"
                                value={`${review.carryoverRiskCount}`}
                                meta={`${review.overdueCarryoverCount} overdue • ${review.underplannedCarryoverCount} underplanned`}
                            />
                            <MetricTile
                                label="Estimate accuracy"
                                value={measuredTaskCount > 0 ? `${review.estimateAccuracyCounts.on_track}/${measuredTaskCount}` : "0"}
                                meta={measuredTaskCount > 0 ? "Completed estimates on track this week" : "No estimated completions this week"}
                            />
                        </div>

                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                            <SectionCard
                                title="What slipped"
                                description="Open tasks that were due by today and still need attention."
                            >
                                {review.slippedTasks.length > 0 ? (
                                    <div className="space-y-2.5">
                                        {review.slippedTasks.map((task) => (
                                            <button
                                                key={task.taskId}
                                                type="button"
                                                onClick={() => handleOpenTaskDetail(task.taskId)}
                                                className="flex w-full cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3 text-left transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-ring/35 hover:shadow-[0_14px_30px_rgba(17,18,15,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                            >
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-foreground">{task.title}</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {task.listName}
                                                        {task.dueLabel ? ` • ${task.dueLabel}` : ""}
                                                        {task.remainingEstimatedMinutes != null ? ` • ${formatMinutesCompact(task.remainingEstimatedMinutes)} left` : ""}
                                                    </p>
                                                </div>
                                                <Badge variant={getSlippedTaskVariant(task)}>
                                                    {task.isOverdue ? "Overdue" : getPlanningStatusLabel(task.planningStatus)}
                                                </Badge>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState
                                        title="Nothing slipping right now"
                                        description="No open tasks are overdue or due by today."
                                        icon={<TrendingUp className="h-8 w-8" />}
                                    />
                                )}
                            </SectionCard>

                            <SectionCard
                                title="Neglected projects"
                                description="Active projects with open work but no focus or completions this week."
                            >
                                {review.neglectedProjects.length > 0 ? (
                                    <div className="space-y-2.5">
                                        {review.neglectedProjects.map((project) => (
                                            <Link
                                                key={project.listId}
                                                href={`/projects/${project.listId}`}
                                                className="block rounded-xl border border-border/60 bg-background/70 px-4 py-3 transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-ring/35 hover:shadow-[0_14px_30px_rgba(17,18,15,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <p className="truncate text-sm font-semibold text-foreground">{project.listName}</p>
                                                    <Badge variant={project.overdueCount > 0 ? "danger" : "warning"}>
                                                        {getProgressProjectStatusLabel(project)}
                                                    </Badge>
                                                </div>
                                                <p className="mt-1 text-xs text-muted-foreground">
                                                    {project.openCount} open
                                                    {" • "}
                                                    {project.overdueCount} overdue
                                                    {" • "}
                                                    {project.underplannedCount} underplanned by week end
                                                </p>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState
                                        title="No neglected projects"
                                        description="Every active project got focus, planned time, or completions this week."
                                        icon={<Target className="h-8 w-8" />}
                                    />
                                )}
                            </SectionCard>
                        </div>

                        <SectionCard
                            title="Project momentum"
                            description="Where execution is actually happening this week."
                        >
                            {review.projectMomentum.length > 0 ? (
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                    {review.projectMomentum.map((project) => (
                                        <Link
                                            key={project.listId}
                                            href={`/projects/${project.listId}`}
                                            className="block rounded-xl border border-border/60 bg-background/70 p-4 transition-[border-color,transform,box-shadow] hover:-translate-y-0.5 hover:border-ring/35 hover:shadow-[0_14px_30px_rgba(17,18,15,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-foreground">{project.listName}</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">{getProgressProjectStatusLabel(project)}</p>
                                                </div>
                                                <Badge variant={project.completedCount > 0 ? "success" : "secondary"}>
                                                    {project.completedCount > 0 ? "Moving" : "Active"}
                                                </Badge>
                                            </div>
                                            <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                                                <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                                                    <p className="eyebrow">Focus</p>
                                                    <p className="mt-1 font-mono text-sm text-foreground">{formatMinutesCompact(project.actualFocusMinutes)}</p>
                                                </div>
                                                <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                                                    <p className="eyebrow">Planned</p>
                                                    <p className="mt-1 font-mono text-sm text-foreground">{formatMinutesCompact(project.plannedMinutes)}</p>
                                                </div>
                                                <div className="rounded-lg bg-muted/60 px-2.5 py-2">
                                                    <p className="eyebrow">Done</p>
                                                    <p className="mt-1 font-mono text-sm text-foreground">{project.completedCount}</p>
                                                </div>
                                            </div>
                                        </Link>
                                    ))}
                                </div>
                            ) : (
                                <EmptyState
                                    title="No project momentum yet"
                                    description="Log focus or complete work this week and the project review will populate."
                                    icon={<TrendingUp className="h-8 w-8" />}
                                />
                            )}
                        </SectionCard>

                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                            <SectionCard
                                title="Weekly focus"
                                description={`Current week • ${review.window.label}`}
                            >
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={stats.weeklyData}>
                                            <CartesianGrid stroke="color-mix(in oklab, var(--border) 75%, transparent)" vertical={false} />
                                            <XAxis dataKey="day" axisLine={false} tickLine={false} />
                                            <YAxis axisLine={false} tickLine={false} />
                                            <Tooltip />
                                            <Area
                                                type="monotone"
                                                dataKey="minutes"
                                                isAnimationActive={false}
                                                stroke="var(--chart-1)"
                                                fill="color-mix(in oklab, var(--chart-1) 22%, transparent)"
                                                strokeWidth={3}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </SectionCard>

                            <SectionCard
                                title="Subject balance"
                                description="Focus distribution this week."
                            >
                                {stats.subjectData.length > 0 ? (
                                    <div className="space-y-3">
                                        <div className="h-56">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie
                                                        data={stats.subjectData}
                                                        dataKey="value"
                                                        innerRadius={56}
                                                        outerRadius={82}
                                                        paddingAngle={4}
                                                        isAnimationActive={false}
                                                    >
                                                        {stats.subjectData.map((entry, index) => (
                                                            <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="space-y-2">
                                            {stats.subjectData.map((entry, index) => (
                                                <div key={entry.name} className="flex items-center justify-between rounded-xl bg-background/70 px-3 py-2.5 text-[13px]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                                                        <span>{entry.name}</span>
                                                    </div>
                                                    <span className="font-mono text-muted-foreground">{entry.value}m</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <EmptyState
                                        title="No subject data this week"
                                        description="Finish a focus session tied to a project."
                                        icon={<Target className="h-8 w-8" />}
                                    />
                                )}
                            </SectionCard>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <SectionCard title="Consistency">
                                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 p-4">
                                    <div className="rounded-xl bg-primary/10 p-3 text-primary">
                                        <Flame className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-semibold tracking-[-0.04em] text-foreground">{stats.streak} day streak</p>
                                        <p className="text-sm text-muted-foreground">Keep it alive today.</p>
                                    </div>
                                </div>
                            </SectionCard>

                            <SectionCard title="Session length">
                                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 p-4">
                                    <div className="rounded-xl bg-primary/10 p-3 text-primary">
                                        <Timer className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-semibold tracking-[-0.04em] text-foreground">{stats.avgSession}</p>
                                        <p className="text-sm text-muted-foreground">Typical focus block length.</p>
                                    </div>
                                </div>
                            </SectionCard>
                        </div>

                        <SectionCard
                            title="Estimate accuracy this week"
                            description="Completed estimated tasks and how they landed against reality."
                        >
                            {review.measuredCompletedTasks.length > 0 ? (
                                <div className="space-y-4">
                                    <div className="grid gap-3 sm:grid-cols-3">
                                        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">On track</p>
                                            <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-foreground">{review.estimateAccuracyCounts.on_track}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">Completed tasks landing near the estimate.</p>
                                        </div>
                                        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Underestimated</p>
                                            <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-foreground">{review.estimateAccuracyCounts.underestimated}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">Tasks that took more focus than planned.</p>
                                        </div>
                                        <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Overestimated</p>
                                            <p className="mt-1 text-2xl font-semibold tracking-[-0.05em] text-foreground">{review.estimateAccuracyCounts.overestimated}</p>
                                            <p className="mt-1 text-sm text-muted-foreground">Tasks that finished faster than expected.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        {review.measuredCompletedTasks.map((task) => (
                                            <div key={task.taskId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                                                <div className="min-w-0 flex-1">
                                                    <p className="truncate text-sm font-semibold text-foreground">{task.title}</p>
                                                    <p className="mt-1 text-xs text-muted-foreground">
                                                        {task.listName}
                                                        {" • "}
                                                        {renderMeasuredTaskMeta(task)}
                                                    </p>
                                                </div>
                                                <Badge variant={getEstimateAccuracyVariant(task.accuracyStatus)}>
                                                    {getEstimateAccuracyLabel(task.accuracyStatus)}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <EmptyState
                                    title="No measured estimate data this week"
                                    description="Complete an estimated task this week and the review will show how close the estimate was."
                                    icon={<Gauge className="h-8 w-8" />}
                                />
                            )}
                        </SectionCard>
                    </>
                )}

                {userId ? (
                    <TaskDetailPanel
                        task={selectedTask}
                        lists={lists}
                        images={selectedTask ? imagesByTodo[selectedTask.id] ?? [] : []}
                        userId={userId}
                        previousTask={previousTask}
                        nextTask={nextTask}
                        taskPositionLabel={taskPositionLabel}
                        open={!!selectedTask}
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
                            <button
                                type="button"
                                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                                onClick={handleCancelTaskLeave}
                            >
                                Stay
                            </button>
                            <button
                                type="button"
                                className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md bg-destructive px-4 text-sm font-medium text-destructive-foreground transition-colors hover:opacity-90"
                                onClick={handleConfirmTaskLeave}
                            >
                                Discard changes
                            </button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
        </div>
    );
}
