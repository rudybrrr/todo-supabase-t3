"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    ArrowUpRight,
    BarChart3,
    Brain,
    CalendarRange,
    Pause,
    Play,
    RotateCcw,
    Users,
} from "lucide-react";

import { PageHeader } from "~/components/app-primitives";
import { AppShell } from "~/components/app-shell";
import { useData } from "~/components/data-provider";
import { MODE_CONFIG, useFocus } from "~/components/focus-provider";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import {
    formatBlockTimeRange,
    formatMinutesCompact,
    getCurrentPlannedBlock,
    getNextPlannedBlock,
    getRemainingPlannedMinutesForDay,
} from "~/lib/planning";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { cn } from "~/lib/utils";

const MODE_OPTIONS = ["focus", "shortBreak", "longBreak"] as const;

interface WeeklyRankRow {
    total_minutes: number | null;
}

function formatTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function getCommunityDescription(rank: number | null | undefined) {
    if (rank === undefined) return "Checking rank";
    if (rank === null) return "Not ranked yet";
    return `#${rank} this week`;
}

function getModeLabel(mode: (typeof MODE_OPTIONS)[number]) {
    switch (mode) {
        case "focus":
            return "Focus";
        case "shortBreak":
            return "Short break";
        case "longBreak":
            return "Long break";
    }
}

function getModeTone(mode: (typeof MODE_OPTIONS)[number]) {
    switch (mode) {
        case "focus":
            return {
                pill: "border-primary/15 bg-primary/10 text-primary",
                iconWrap: "border-primary/16 bg-primary/11 text-primary",
                status: "border-primary/15 bg-primary/10 text-primary",
            };
        case "shortBreak":
            return {
                pill: "border-[color-mix(in_oklab,var(--color-chart-3)_26%,transparent)] bg-[color-mix(in_oklab,var(--color-chart-3)_11%,transparent)] text-[color:var(--color-chart-3)]",
                iconWrap: "border-[color-mix(in_oklab,var(--color-chart-3)_24%,transparent)] bg-[color-mix(in_oklab,var(--color-chart-3)_10%,transparent)] text-[color:var(--color-chart-3)]",
                status: "border-[color-mix(in_oklab,var(--color-chart-3)_26%,transparent)] bg-[color-mix(in_oklab,var(--color-chart-3)_11%,transparent)] text-[color:var(--color-chart-3)]",
            };
        case "longBreak":
            return {
                pill: "border-[color-mix(in_oklab,var(--color-chart-2)_26%,transparent)] bg-[color-mix(in_oklab,var(--color-chart-2)_11%,transparent)] text-[color:var(--color-chart-2)]",
                iconWrap: "border-[color-mix(in_oklab,var(--color-chart-2)_24%,transparent)] bg-[color-mix(in_oklab,var(--color-chart-2)_10%,transparent)] text-[color:var(--color-chart-2)]",
                status: "border-[color-mix(in_oklab,var(--color-chart-2)_26%,transparent)] bg-[color-mix(in_oklab,var(--color-chart-2)_11%,transparent)] text-[color:var(--color-chart-2)]",
            };
    }
}

function FocusMetricTile({
    label,
    value,
    meta,
}: {
    label: string;
    value: string;
    meta?: string;
}) {
    return (
        <div className="rounded-lg border border-border/70 bg-background/72 px-3 py-2.5">
            <p className="eyebrow">{label}</p>
            <p className="mt-1 text-[1.05rem] font-semibold tracking-[-0.03em] text-foreground">
                {value}
            </p>
            {meta ? <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{meta}</p> : null}
        </div>
    );
}

function FocusLinkCard({
    href,
    icon: Icon,
    title,
    description,
}: {
    href: string;
    icon: typeof BarChart3;
    title: string;
    description: string;
}) {
    return (
        <Link
            href={href}
            className="group surface-card flex items-center justify-between gap-4 px-3.5 py-3 transition-colors hover:border-ring/35 hover:bg-muted/35"
        >
            <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80 text-muted-foreground transition-colors group-hover:text-foreground">
                    <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-semibold tracking-[-0.03em] text-foreground sm:text-[15px]">{title}</p>
                    <p className="truncate text-[13px] leading-5 text-muted-foreground">{description}</p>
                </div>
            </div>
            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
        </Link>
    );
}

function FocusPlannerBlockCard({
    label,
    emptyLabel,
    projectName,
    taskTitle,
    timeLabel,
}: {
    label: string;
    emptyLabel: string;
    projectName?: string | null;
    taskTitle?: string | null;
    timeLabel?: string | null;
}) {
    return (
        <div className="flex items-start justify-between gap-4 px-4 py-3">
            <div className="min-w-0 space-y-1">
                <p className="eyebrow">{label}</p>
                <p className={cn("truncate text-sm font-semibold tracking-[-0.03em] text-foreground", !taskTitle && "text-muted-foreground")}>
                    {taskTitle ?? emptyLabel}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                    {[projectName, timeLabel].filter(Boolean).join(" / ") || "No block in scope"}
                </p>
            </div>
            <div className="shrink-0 text-right">
                <p className="text-xs font-medium text-foreground/80">{timeLabel ?? "--"}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{projectName ?? "General"}</p>
            </div>
        </div>
    );
}

export default function FocusClient() {
    return (
        <AppShell>
            <FocusPageContent />
        </AppShell>
    );
}

function FocusPageContent() {
    const { profile, stats, userId, loading: dataLoading } = useData();
    const { lists, plannedBlocks, tasks, todayFocusMinutes, orderedProjectSummaries, loading: datasetLoading } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [communityRank, setCommunityRank] = useState<number | null | undefined>(undefined);
    const [now, setNow] = useState(() => new Date());
    const {
        mode,
        timeLeft,
        isActive,
        toggleTimer,
        resetTimer,
        handleModeChange,
        currentListId,
        setCurrentListId,
        currentTaskId,
        setCurrentTaskId,
        currentBlockId,
        setCurrentBlockId,
    } = useFocus();

    const isFocusDataLoading = dataLoading || datasetLoading;
    const config = MODE_CONFIG[mode];
    const tone = getModeTone(mode);
    const dailyGoal = profile?.daily_focus_goal_minutes ?? 120;
    const focusProgress = clamp((todayFocusMinutes / Math.max(dailyGoal, 1)) * 100, 0, 100);
    const remainingMinutes = Math.max(dailyGoal - todayFocusMinutes, 0);
    const sessionMinutes = mode === "focus" && timeLeft < config.duration ? Math.ceil((config.duration - timeLeft) / 60) : 0;
    const selectedProjectId = orderedProjectSummaries.some((summary) => summary.list.id === currentListId) ? currentListId : null;
    const selectedProjectName = orderedProjectSummaries.find((summary) => summary.list.id === selectedProjectId)?.list.name ?? null;
    const listMap = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists]);
    const taskMap = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
    const scopedBlocks = useMemo(
        () => selectedProjectId ? plannedBlocks.filter((block) => block.list_id === selectedProjectId) : plannedBlocks,
        [plannedBlocks, selectedProjectId],
    );
    const focusContextBlock = useMemo(
        () => currentBlockId ? plannedBlocks.find((block) => block.id === currentBlockId) ?? null : null,
        [currentBlockId, plannedBlocks],
    );
    const currentPlannedBlock = useMemo(
        () => getCurrentPlannedBlock(scopedBlocks, now),
        [now, scopedBlocks],
    );
    const nextDetectedBlock = useMemo(
        () => getNextPlannedBlock(scopedBlocks, now),
        [now, scopedBlocks],
    );
    const nextPlannedBlock = useMemo(() => {
        if (
            focusContextBlock
            && focusContextBlock.id !== currentPlannedBlock?.id
            && new Date(focusContextBlock.scheduled_start).getTime() > now.getTime()
        ) {
            return focusContextBlock;
        }

        return nextDetectedBlock;
    }, [currentPlannedBlock?.id, focusContextBlock, nextDetectedBlock, now]);
    const focusContextTask = useMemo(
        () => currentTaskId ? taskMap.get(currentTaskId) ?? null : null,
        [currentTaskId, taskMap],
    );
    const plannerTask = useMemo(() => {
        if (currentPlannedBlock?.todo_id) {
            return taskMap.get(currentPlannedBlock.todo_id) ?? null;
        }

        if (nextPlannedBlock?.todo_id) {
            return taskMap.get(nextPlannedBlock.todo_id) ?? null;
        }

        return focusContextTask;
    }, [currentPlannedBlock?.todo_id, focusContextTask, nextPlannedBlock?.todo_id, taskMap]);
    const remainingPlannedMinutes = useMemo(
        () => getRemainingPlannedMinutesForDay(scopedBlocks, now),
        [now, scopedBlocks],
    );
    const plannerAnchorBlock = currentPlannedBlock ?? nextPlannedBlock ?? focusContextBlock;
    const plannerHref = useMemo(() => {
        const params = new URLSearchParams();

        if (selectedProjectId) {
            params.set("listId", selectedProjectId);
        }

        if (plannerAnchorBlock) {
            params.set("blockId", plannerAnchorBlock.id);
            params.set("view", "day");
        } else if (plannerTask) {
            params.set("taskId", plannerTask.id);
            params.set("view", "day");
        }

        const query = params.toString();
        return query ? `/calendar?${query}` : "/calendar";
    }, [plannerAnchorBlock, plannerTask, selectedProjectId]);

    useEffect(() => {
        if (!userId) {
            setCommunityRank(null);
            return;
        }

        let active = true;

        const loadCommunityRank = async () => {
            const { data: currentRow, error } = await supabase
                .from("weekly_leaderboard")
                .select("total_minutes")
                .eq("user_id", userId)
                .maybeSingle<WeeklyRankRow>();

            if (error || !currentRow || (currentRow.total_minutes ?? 0) <= 0) {
                if (active) setCommunityRank(null);
                return;
            }

            const { count, error: countError } = await supabase
                .from("weekly_leaderboard")
                .select("user_id", { count: "exact", head: true })
                .gt("total_minutes", currentRow.total_minutes ?? 0);

            if (!active) return;

            if (countError) {
                setCommunityRank(null);
                return;
            }

            setCommunityRank((count ?? 0) + 1);
        };

        void loadCommunityRank();

        return () => {
            active = false;
        };
    }, [supabase, userId]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(new Date());
        }, 60_000);

        return () => {
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (!currentTaskId) return;
        if (taskMap.has(currentTaskId)) return;
        setCurrentTaskId(null);
    }, [currentTaskId, setCurrentTaskId, taskMap]);

    useEffect(() => {
        if (!currentBlockId) return;
        if (plannedBlocks.some((block) => block.id === currentBlockId)) return;
        setCurrentBlockId(null);
    }, [currentBlockId, plannedBlocks, setCurrentBlockId]);

    return (
        <div className="page-container gap-3 lg:gap-4">
            <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-3 lg:gap-4">
                <PageHeader
                    eyebrow="Focus"
                    title="Session console"
                    description="Keep the timer, current block, and next block in one dense workspace."
                />

                <section className="surface-card overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                            {MODE_OPTIONS.map((nextMode) => {
                                const active = mode === nextMode;
                                return (
                                    <button
                                        key={nextMode}
                                        type="button"
                                        onClick={() => handleModeChange(nextMode)}
                                        className={cn(
                                            "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] transition-colors",
                                            active
                                                ? tone.pill
                                                : "border-border/70 bg-background/72 text-muted-foreground hover:border-ring/30 hover:text-foreground",
                                        )}
                                    >
                                        {getModeLabel(nextMode)}
                                    </button>
                                );
                            })}
                        </div>

                        <span className={cn("inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em]", tone.status)}>
                            {isActive ? "Running" : mode === "focus" ? "Ready" : "Paused"}
                        </span>
                    </div>

                    <div className="grid gap-0 xl:grid-cols-[minmax(0,1.2fr)_minmax(18.5rem,0.8fr)]">
                        <div className="border-b border-border/70 px-4 py-5 sm:px-5 sm:py-6 xl:border-b-0 xl:border-r">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <p className="eyebrow">Session timer</p>
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        {isActive
                                            ? mode === "focus"
                                                ? "Keep the page quiet and let the block run."
                                                : "Take the break fully, then slide back into the next block."
                                            : mode === "focus"
                                                ? "Start a clean session when you are ready."
                                                : "Pause here for a short reset before the next study block."}
                                    </p>
                                </div>
                                <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border", tone.iconWrap)}>
                                    <config.icon className="h-6 w-6" />
                                </div>
                            </div>

                            <div className="mt-5 flex flex-col gap-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                                    <p className="font-mono text-[clamp(4.5rem,9vw,7.75rem)] leading-none font-semibold tracking-[-0.1em] text-foreground">
                                        {formatTime(timeLeft)}
                                    </p>
                                    <div className="max-w-sm rounded-lg border border-border/70 bg-background/72 px-3 py-2 text-sm leading-6 text-muted-foreground">
                                        {config.label}
                                    </div>
                                </div>

                                <div className="flex flex-col gap-2 sm:flex-row">
                                    <Button size="lg" className="w-full sm:min-w-[12rem] sm:flex-1" onClick={toggleTimer}>
                                        {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                                        {isActive ? "Pause" : mode === "focus" ? "Start focus" : "Start break"}
                                    </Button>
                                    <Button size="lg" variant="outline" className="w-full sm:min-w-[9.5rem] sm:flex-1" onClick={resetTimer}>
                                        <RotateCcw className="h-4 w-4" />
                                        Reset
                                    </Button>
                                </div>

                                <div className="grid gap-2 sm:grid-cols-3">
                                    <FocusMetricTile
                                        label="Session"
                                        value={sessionMinutes > 0 ? `${sessionMinutes}m` : "0m"}
                                        meta="Elapsed this cycle"
                                    />
                                    <FocusMetricTile
                                        label="Typical"
                                        value={isFocusDataLoading ? "--" : (stats?.avgSession ?? "0m")}
                                        meta="Average focus block"
                                    />
                                    <FocusMetricTile
                                        label="Streak"
                                        value={isFocusDataLoading ? "--" : `${stats?.streak ?? 0}d`}
                                        meta={isFocusDataLoading ? "Loading" : "Consecutive days"}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5 xl:px-5 xl:py-6">
                            <div className="surface-muted space-y-3 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1">
                                        <p className="eyebrow">Session project</p>
                                        <p className="text-sm font-semibold tracking-[-0.03em] text-foreground">
                                            {selectedProjectName ?? "General"}
                                        </p>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                        {selectedProjectId ? "Scoped" : "Unscoped"}
                                    </span>
                                </div>
                                <Select
                                    value={selectedProjectId ?? "general"}
                                    onValueChange={(value) => {
                                        setCurrentListId(value === "general" ? null : value);
                                        setCurrentTaskId(null);
                                        setCurrentBlockId(null);
                                    }}
                                >
                                    <SelectTrigger className="h-10 border-border/70 bg-background/80 shadow-none focus-visible:ring-0">
                                        <SelectValue placeholder="General" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="general">General</SelectItem>
                                        {orderedProjectSummaries.map((summary) => (
                                            <SelectItem key={summary.list.id} value={summary.list.id}>
                                                {summary.list.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="surface-muted p-0">
                                <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
                                    <div className="space-y-1">
                                        <p className="eyebrow">Planner context</p>
                                        <p className="text-sm font-semibold tracking-[-0.03em] text-foreground">
                                            {currentPlannedBlock
                                                ? "Run the current block"
                                                : nextPlannedBlock
                                                    ? "Next block is queued"
                                                    : "No scheduled block in scope"}
                                        </p>
                                    </div>
                                    <Button asChild variant="outline" size="xs">
                                        <Link href={plannerHref}>
                                            <CalendarRange className="h-3.5 w-3.5" />
                                            Open calendar
                                        </Link>
                                    </Button>
                                </div>

                                <div className="divide-y divide-border/70">
                                    <FocusPlannerBlockCard
                                        label="Current block"
                                        emptyLabel="Nothing running now"
                                        projectName={currentPlannedBlock ? (listMap.get(currentPlannedBlock.list_id)?.name ?? "Project") : null}
                                        taskTitle={currentPlannedBlock?.todo_id ? (taskMap.get(currentPlannedBlock.todo_id)?.title ?? currentPlannedBlock.title) : currentPlannedBlock?.title}
                                        timeLabel={currentPlannedBlock ? formatBlockTimeRange(currentPlannedBlock.scheduled_start, currentPlannedBlock.scheduled_end) : null}
                                    />
                                    <FocusPlannerBlockCard
                                        label="Next block"
                                        emptyLabel="Nothing else planned today"
                                        projectName={nextPlannedBlock ? (listMap.get(nextPlannedBlock.list_id)?.name ?? "Project") : null}
                                        taskTitle={nextPlannedBlock?.todo_id ? (taskMap.get(nextPlannedBlock.todo_id)?.title ?? nextPlannedBlock.title) : nextPlannedBlock?.title}
                                        timeLabel={nextPlannedBlock ? formatBlockTimeRange(nextPlannedBlock.scheduled_start, nextPlannedBlock.scheduled_end) : null}
                                    />
                                </div>

                                <div className="grid gap-2 border-t border-border/70 p-4 sm:grid-cols-2">
                                    <FocusMetricTile
                                        label="Planned left"
                                        value={formatMinutesCompact(remainingPlannedMinutes)}
                                        meta={remainingPlannedMinutes > 0 ? "Still scheduled today" : "Nothing else scheduled today"}
                                    />
                                    <FocusMetricTile
                                        label="Task context"
                                        value={plannerTask?.title ?? "General focus"}
                                        meta={selectedProjectName ?? "Project context"}
                                    />
                                </div>
                            </div>

                            <div className="surface-muted p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="space-y-1">
                                        <p className="eyebrow">Daily goal</p>
                                        <p className="text-sm font-semibold tracking-[-0.03em] text-foreground">
                                            {isFocusDataLoading
                                                ? "Loading focus data"
                                                : `${todayFocusMinutes}m / ${dailyGoal}m today`}
                                        </p>
                                    </div>
                                    <div className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium", tone.status)}>
                                        <Brain className="h-3.5 w-3.5" />
                                        {isFocusDataLoading ? "--" : (stats?.streak ?? 0)} day streak
                                    </div>
                                </div>

                                <div className="mt-3 space-y-2">
                                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                                        <div
                                            className="h-full rounded-full bg-primary transition-[width]"
                                            style={{ width: `${focusProgress}%` }}
                                        />
                                    </div>
                                    <p className="text-sm leading-6 text-muted-foreground">
                                        {isFocusDataLoading
                                            ? "Syncing goal and session totals"
                                            : remainingMinutes > 0
                                                ? `${remainingMinutes} minutes left to goal`
                                                : "Daily focus goal reached"}
                                    </p>
                                </div>

                                <div className="mt-3 grid grid-cols-3 gap-2">
                                    <FocusMetricTile
                                        label="Today"
                                        value={isFocusDataLoading ? "--" : `${todayFocusMinutes}m`}
                                        meta="Logged so far"
                                    />
                                    <FocusMetricTile
                                        label="Goal"
                                        value={isFocusDataLoading ? "--" : `${Math.round(focusProgress)}%`}
                                        meta="Progress to target"
                                    />
                                    <FocusMetricTile
                                        label="Remaining"
                                        value={isFocusDataLoading ? "--" : `${remainingMinutes}m`}
                                        meta="Before goal"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <div className="grid gap-3 md:grid-cols-2">
                    <FocusLinkCard
                        href="/progress"
                        icon={BarChart3}
                        title="Progress"
                        description={isFocusDataLoading ? "Loading focus data" : stats ? `${stats.totalFocus} total focus` : "No focus logged yet"}
                    />

                    <FocusLinkCard
                        href="/community"
                        icon={Users}
                        title="Community"
                        description={getCommunityDescription(communityRank)}
                    />
                </div>
            </div>
        </div>
    );
}
