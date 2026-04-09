"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, addMonths, format, isSameDay, isToday, startOfDay, subDays, subMonths } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { DayButtonProps } from "react-day-picker";
import { toast } from "sonner";

import { AppShell } from "~/components/app-shell";
import { EmptyState, PageHeader } from "~/components/app-primitives";
import { Button } from "~/components/ui/button";
import { Calendar, CalendarDayButton } from "~/components/ui/calendar";
import { DatePickerField } from "~/components/ui/date-picker-field";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { TimeSelectField } from "~/components/ui/time-select-field";
import { useData } from "~/components/data-provider";
import { useTaskDataset, type TaskDatasetRecord } from "~/hooks/use-task-dataset";
import { getProjectColorClasses } from "~/lib/project-appearance";
import {
    combineDateAndTime,
    formatBlockTimeRange,
    formatMinutesCompact,
    formatPlannerHourLabel,
    getPlannerDayMinuteRange,
    getPlannerHours,
    getPlannerMinutesFromDate,
    getPlannerRangeLabel,
    getWeekDays,
    PLANNER_HOUR_ROW_HEIGHT,
    toDateKey,
    type PlannerView,
} from "~/lib/planning";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { getSmartViewTasks } from "~/lib/task-views";
import type { PlannedFocusBlock } from "~/lib/types";
import { cn } from "~/lib/utils";

interface BlockFormState {
    id: string | null;
    title: string;
    listId: string;
    todoId: string | null;
    date: string;
    startTime: string;
    durationMinutes: string;
}

interface PlannerDaySummary {
    dueCount: number;
    blockCount: number;
}

interface TimedBlockLayout {
    block: PlannedFocusBlock;
    lane: number;
    laneCount: number;
    top: number;
    height: number;
}

const PLANNER_HOURS = getPlannerHours();
const PLANNER_DAY_MINUTES = getPlannerDayMinuteRange();
const ALL_DAY_VISIBLE_LIMIT = 2;

function createBlockForm(listId: string, date = toDateKey(new Date())): BlockFormState {
    return {
        id: null,
        title: "",
        listId,
        todoId: null,
        date,
        startTime: "09:00",
        durationMinutes: "60",
    };
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function isEditableKeyboardTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function getDayBlocks(blocks: PlannedFocusBlock[], date: Date) {
    return blocks
        .filter((block) => isSameDay(new Date(block.scheduled_start), date))
        .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
}

function getDayTasks(tasks: TaskDatasetRecord[], date: Date) {
    return tasks
        .filter((task) => task.due_date && isSameDay(new Date(task.due_date), date))
        .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""));
}

function buildTimedBlockLayouts(blocks: PlannedFocusBlock[], date: Date) {
    const normalizedBlocks = getDayBlocks(blocks, date)
        .map((block) => {
            const start = clamp(getPlannerMinutesFromDate(block.scheduled_start), 0, PLANNER_DAY_MINUTES);
            const end = clamp(
                Math.max(start + 15, getPlannerMinutesFromDate(block.scheduled_end)),
                15,
                PLANNER_DAY_MINUTES,
            );

            return { block, start, end };
        })
        .filter((item) => item.end > 0 && item.start < PLANNER_DAY_MINUTES);

    if (normalizedBlocks.length === 0) return [];

    const groups: Array<Array<{ block: PlannedFocusBlock; start: number; end: number }>> = [];
    let currentGroup: Array<{ block: PlannedFocusBlock; start: number; end: number }> = [];
    let currentGroupEnd = -1;

    for (const item of normalizedBlocks) {
        if (currentGroup.length === 0 || item.start < currentGroupEnd) {
            currentGroup.push(item);
            currentGroupEnd = Math.max(currentGroupEnd, item.end);
            continue;
        }

        groups.push(currentGroup);
        currentGroup = [item];
        currentGroupEnd = item.end;
    }

    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }

    return groups.flatMap((group) => {
        const laneEnds: number[] = [];
        const placed = group.map((item) => {
            const laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= item.start);
            const lane = laneIndex === -1 ? laneEnds.length : laneIndex;

            laneEnds[lane] = item.end;
            return { ...item, lane };
        });
        const laneCount = laneEnds.length;

        return placed.map<TimedBlockLayout>((item) => ({
            block: item.block,
            lane: item.lane,
            laneCount,
            top: (item.start / 60) * PLANNER_HOUR_ROW_HEIGHT,
            height: Math.max(42, ((item.end - item.start) / 60) * PLANNER_HOUR_ROW_HEIGHT - 6),
        }));
    });
}

function CalendarMonthDayButton({
    metrics,
    day,
    className,
    ...props
}: DayButtonProps & {
    metrics?: PlannerDaySummary;
}) {
    return (
            <CalendarDayButton
            {...props}
            day={day}
            className={cn(
                "group/month-day h-full min-h-[var(--cell-size)] w-full items-start justify-start rounded-lg border border-transparent px-2 py-1.5 text-left shadow-none hover:border-border hover:bg-muted/45 data-[today=true]:border-primary/30 data-[today=true]:bg-primary/8 data-[selected-single=true]:border-primary data-[selected-single=true]:bg-primary/12 data-[selected-single=true]:text-foreground [&>span:first-child]:text-sm [&>span:first-child]:font-semibold",
                className,
            )}
        >
            <span className="leading-none">{format(day.date, "d")}</span>
            {metrics && (metrics.dueCount > 0 || metrics.blockCount > 0) ? (
                <span className="mt-auto flex flex-wrap items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.12em]">
                    {metrics.dueCount > 0 ? (
                        <span className="rounded-sm bg-amber-500/14 px-1.5 py-0.5 text-amber-800 dark:text-amber-200">
                            {metrics.dueCount} task{metrics.dueCount === 1 ? "" : "s"}
                        </span>
                    ) : null}
                    {metrics.blockCount > 0 ? (
                        <span className="rounded-sm bg-primary/14 px-1.5 py-0.5 text-primary">
                            {metrics.blockCount} block{metrics.blockCount === 1 ? "" : "s"}
                        </span>
                    ) : null}
                </span>
            ) : (
                <span className="mt-auto text-[9px] uppercase tracking-[0.12em] text-transparent">.</span>
            )}
        </CalendarDayButton>
    );
}

export default function CalendarClient() {
    return (
        <AppShell>
            <CalendarContent />
        </AppShell>
    );
}

function CalendarContent() {
    const searchParams = useSearchParams();
    const { profile, userId } = useData();
    const { lists, tasks, plannedBlocks, todayFocusMinutes, loading, refresh } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const searchListId = searchParams.get("listId");
    const searchTaskId = searchParams.get("taskId");

    const [view, setView] = useState<PlannerView>("week");
    const [anchorDate, setAnchorDate] = useState(startOfDay(new Date()));
    const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
    const [selectedListId, setSelectedListId] = useState(searchListId ?? "all");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<BlockFormState>(() => createBlockForm(""));
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(new Date());
        }, 60_000);

        return () => {
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (!form.listId && lists[0]) {
            setForm((current) => ({ ...current, listId: lists[0]!.id }));
        }
    }, [form.listId, lists]);

    useEffect(() => {
        if (!searchListId) return;
        if (searchListId !== "all" && !lists.some((list) => list.id === searchListId)) return;
        setSelectedListId(searchListId);
    }, [lists, searchListId]);

    useEffect(() => {
        if (selectedListId === "all") return;
        if (lists.some((list) => list.id === selectedListId)) return;
        setSelectedListId("all");
    }, [lists, selectedListId]);

    useEffect(() => {
        if (!searchTaskId) return;
        const task = tasks.find((item) => item.id === searchTaskId);
        if (!task) return;

        const taskDate = task.due_date ? startOfDay(new Date(task.due_date)) : startOfDay(new Date());
        setForm({
            id: null,
            title: task.title,
            listId: task.list_id,
            todoId: task.id,
            date: toDateKey(taskDate),
            startTime: "09:00",
            durationMinutes: task.estimated_minutes ? String(task.estimated_minutes) : "60",
        });
        setSelectedDate(taskDate);
        setAnchorDate(taskDate);
        setSelectedListId(task.list_id);
        setDialogOpen(true);
    }, [searchTaskId, tasks]);

    const filteredTasks = useMemo(() => {
        const scoped = selectedListId === "all"
            ? tasks
            : tasks.filter((task) => task.list_id === selectedListId);
        return scoped.filter((task) => !task.is_done);
    }, [selectedListId, tasks]);

    const filteredBlocks = useMemo(() => {
        return selectedListId === "all"
            ? plannedBlocks
            : plannedBlocks.filter((block) => block.list_id === selectedListId);
    }, [plannedBlocks, selectedListId]);

    const daySummaries = useMemo(() => {
        const summaries: Record<string, PlannerDaySummary> = {};

        filteredTasks.forEach((task) => {
            if (!task.due_date) return;
            const key = toDateKey(new Date(task.due_date));
            summaries[key] ??= { dueCount: 0, blockCount: 0 };
            summaries[key].dueCount += 1;
        });

        filteredBlocks.forEach((block) => {
            const key = toDateKey(new Date(block.scheduled_start));
            summaries[key] ??= { dueCount: 0, blockCount: 0 };
            summaries[key].blockCount += 1;
        });

        return summaries;
    }, [filteredBlocks, filteredTasks]);

    const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
    const dailyGoal = profile?.daily_focus_goal_minutes ?? 120;
    const focusProgress = clamp((todayFocusMinutes / Math.max(dailyGoal, 1)) * 100, 0, 100);
    const selectedDayTasks = useMemo(() => getDayTasks(filteredTasks, selectedDate), [filteredTasks, selectedDate]);
    const selectedDayBlocks = useMemo(() => getDayBlocks(filteredBlocks, selectedDate), [filteredBlocks, selectedDate]);
    const upcomingTasks = useMemo(() => getSmartViewTasks(filteredTasks, "upcoming").slice(0, 6), [filteredTasks]);
    const unscheduledTasks = useMemo(() => filteredTasks.filter((task) => !task.has_planned_block).slice(0, 6), [filteredTasks]);
    const listMap = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists]);
    const weekTasksByKey = useMemo(() => {
        const byKey = new Map<string, TaskDatasetRecord[]>();
        weekDays.forEach((day) => {
            byKey.set(toDateKey(day), getDayTasks(filteredTasks, day));
        });
        return byKey;
    }, [filteredTasks, weekDays]);
    const weekBlockLayoutsByKey = useMemo(() => {
        const byKey = new Map<string, TimedBlockLayout[]>();
        weekDays.forEach((day) => {
            byKey.set(toDateKey(day), buildTimedBlockLayouts(filteredBlocks, day));
        });
        return byKey;
    }, [filteredBlocks, weekDays]);
    const currentTimeOffset = useMemo(() => {
        if (!weekDays.some((day) => isToday(day))) return null;
        const minutesIntoPlanner = getPlannerMinutesFromDate(now);
        if (minutesIntoPlanner < 0 || minutesIntoPlanner > PLANNER_DAY_MINUTES) return null;
        return (minutesIntoPlanner / 60) * PLANNER_HOUR_ROW_HEIGHT;
    }, [now, weekDays]);
    const todayColumnIndex = useMemo(() => weekDays.findIndex((day) => isToday(day)), [weekDays]);
    const plannerRangeLabel = useMemo(() => getPlannerRangeLabel(view, anchorDate), [anchorDate, view]);
    const selectedScopeLabel = useMemo(() => {
        if (selectedListId === "all") return "All projects";
        return listMap.get(selectedListId)?.name ?? "Project";
    }, [listMap, selectedListId]);
    const plannerRowStyle = { height: `${PLANNER_HOUR_ROW_HEIGHT}px` };

    const shiftPeriod = useCallback((direction: -1 | 1) => {
        setAnchorDate((current) => view === "week"
            ? (direction === -1 ? subDays(current, 7) : addDays(current, 7))
            : (direction === -1 ? subMonths(current, 1) : addMonths(current, 1)));
        setSelectedDate((current) => view === "week"
            ? (direction === -1 ? subDays(current, 7) : addDays(current, 7))
            : (direction === -1 ? subMonths(current, 1) : addMonths(current, 1)));
    }, [view]);

    const goToToday = useCallback(() => {
        const today = startOfDay(new Date());
        setAnchorDate(today);
        setSelectedDate(today);
    }, []);

    const openBlockDialog = useCallback((taskId?: string | null, options?: { date?: Date; startTime?: string }) => {
        const task = taskId ? tasks.find((item) => item.id === taskId) : null;
        const date = options?.date ?? selectedDate;
        const listId = task?.list_id ?? (selectedListId === "all" ? lists[0]?.id ?? "" : selectedListId);

        setForm({
            id: null,
            title: task?.title ?? "",
            listId,
            todoId: task?.id ?? null,
            date: toDateKey(date),
            startTime: options?.startTime ?? "09:00",
            durationMinutes: task?.estimated_minutes ? String(task.estimated_minutes) : "60",
        });
        setDialogOpen(true);
    }, [lists, selectedDate, selectedListId, tasks]);

    const editBlock = useCallback((block: PlannedFocusBlock) => {
        const durationMinutes = Math.max(
            15,
            Math.round((new Date(block.scheduled_end).getTime() - new Date(block.scheduled_start).getTime()) / 60000),
        );
        setForm({
            id: block.id,
            title: block.title,
            listId: block.list_id,
            todoId: block.todo_id,
            date: format(new Date(block.scheduled_start), "yyyy-MM-dd"),
            startTime: format(new Date(block.scheduled_start), "HH:mm"),
            durationMinutes: String(durationMinutes),
        });
        setDialogOpen(true);
    }, []);

    async function handleSaveBlock() {
        if (!userId || !form.listId || !form.title.trim()) return;

        const start = combineDateAndTime(form.date, form.startTime);
        const end = new Date(start);
        end.setMinutes(start.getMinutes() + Number.parseInt(form.durationMinutes || "60", 10));

        try {
            setSaving(true);

            if (form.id) {
                const { error } = await supabase
                    .from("planned_focus_blocks")
                    .update({
                        title: form.title.trim(),
                        list_id: form.listId,
                        todo_id: form.todoId,
                        scheduled_start: start.toISOString(),
                        scheduled_end: end.toISOString(),
                    })
                    .eq("id", form.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from("planned_focus_blocks").insert({
                    user_id: userId,
                    list_id: form.listId,
                    todo_id: form.todoId,
                    title: form.title.trim(),
                    scheduled_start: start.toISOString(),
                    scheduled_end: end.toISOString(),
                });
                if (error) throw error;
            }

            toast.success(form.id ? "Focus block updated." : "Focus block created.");
            setDialogOpen(false);
            await refresh({ silent: true });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save focus block.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteBlock() {
        if (!form.id) return;
        try {
            setSaving(true);
            const { error } = await supabase.from("planned_focus_blocks").delete().eq("id", form.id);
            if (error) throw error;
            toast.success("Focus block deleted.");
            setDialogOpen(false);
            await refresh({ silent: true });
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to delete focus block.");
        } finally {
            setSaving(false);
        }
    }

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
            if (isEditableKeyboardTarget(event.target)) return;

            if (event.key === "ArrowLeft") {
                event.preventDefault();
                shiftPeriod(-1);
                return;
            }

            if (event.key === "ArrowRight") {
                event.preventDefault();
                shiftPeriod(1);
                return;
            }

            if (event.key.toLowerCase() === "t") {
                event.preventDefault();
                goToToday();
                return;
            }

            if (event.key.toLowerCase() === "n") {
                event.preventDefault();
                openBlockDialog();
                return;
            }

            if (event.key.toLowerCase() === "w") {
                event.preventDefault();
                setView("week");
                return;
            }

            if (event.key.toLowerCase() === "m") {
                event.preventDefault();
                setView("month");
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [goToToday, openBlockDialog, shiftPeriod]);

    function renderToolbar() {
        return (
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex items-center rounded-lg border border-border/70 bg-card/96 p-0.5">
                        <Button variant="ghost" size="icon-sm" className="rounded-lg" onClick={() => shiftPeriod(-1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="min-w-32 px-2 text-center text-sm font-semibold tracking-[-0.01em] text-foreground">
                            {plannerRangeLabel}
                        </div>
                        <Button variant="ghost" size="icon-sm" className="rounded-lg" onClick={() => shiftPeriod(1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>

                    <Button variant="outline" size="sm" onClick={goToToday}>
                        Today
                    </Button>

                    <div className="inline-flex items-center rounded-full border border-border/70 bg-card/96 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {selectedScopeLabel}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="min-w-44">
                        <Select value={selectedListId} onValueChange={setSelectedListId}>
                            <SelectTrigger className="h-10 rounded-lg bg-card/96 text-sm">
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

                    <div className="inline-flex rounded-lg border border-border/70 bg-card/96 p-0.5">
                        {(["week", "month"] as const).map((nextView) => (
                            <button
                                key={nextView}
                                type="button"
                                onClick={() => setView(nextView)}
                                className={cn(
                                    "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                                    view === nextView
                                        ? "bg-foreground text-background"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                )}
                            >
                                {nextView === "week" ? "Week" : "Month"}
                            </button>
                        ))}
                    </div>

                    <div className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-card/96 px-3 py-2 text-sm">
                        <Clock3 className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Focus today
                            </div>
                            <div className="font-mono text-xs text-foreground sm:text-sm">
                                {todayFocusMinutes}m / {dailyGoal}m
                            </div>
                        </div>
                    </div>

                    <Button size="sm" onClick={() => openBlockDialog()}>
                        <Plus className="h-4 w-4" />
                        New block
                    </Button>
                </div>
            </div>
        );
    }

    function renderLoadingState() {
        return (
            <div className="rounded-xl border border-border/70 bg-card/96 p-4">
                <div className="space-y-3">
                    <div className="h-9 w-60 animate-pulse rounded-lg bg-muted/70" />
                    <div className="h-[31rem] animate-pulse rounded-[1rem] bg-muted/55" />
                </div>
            </div>
        );
    }

    function renderWeekGrid() {
        return (
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card/98">
                <div className="overflow-x-auto">
                    <div className="min-w-[980px]">
                        <div className="grid grid-cols-[76px_repeat(7,minmax(140px,1fr))] border-b border-border/70">
                            <div className="sticky left-0 z-20 border-r border-border/70 bg-card/98 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Day
                            </div>
                            {weekDays.map((day) => {
                                const dayKey = toDateKey(day);
                                const itemCount = (weekTasksByKey.get(dayKey)?.length ?? 0) + (weekBlockLayoutsByKey.get(dayKey)?.length ?? 0);
                                const isSelected = isSameDay(day, selectedDate);
                                const isCurrentDay = isToday(day);

                                return (
                                    <button
                                        key={dayKey}
                                        type="button"
                                        onClick={() => setSelectedDate(day)}
                                        className={cn(
                                            "flex min-h-[64px] flex-col items-start justify-center gap-0.5 border-r border-border/70 px-3 py-2.5 text-left transition-colors last:border-r-0",
                                            isSelected ? "bg-accent/40" : "bg-background/35 hover:bg-muted/50",
                                        )}
                                    >
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                            {format(day, "EEE")}
                                        </span>
                                        <div className="flex w-full items-center justify-between gap-3">
                                            <span className={cn("text-base font-semibold tracking-[-0.03em] text-foreground", isCurrentDay && "text-primary")}>
                                                {format(day, "d")}
                                            </span>
                                            <span className={cn(
                                                "rounded-full border px-2 py-0.5 text-[11px] font-mono",
                                                isSelected
                                                    ? "border-primary/30 bg-primary/10 text-primary"
                                                    : "border-border/70 bg-background/75 text-muted-foreground",
                                            )}>
                                                {itemCount}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-[76px_repeat(7,minmax(140px,1fr))] border-b border-border/70">
                            <div className="sticky left-0 z-20 border-r border-border/70 bg-card/98 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                All day
                            </div>
                            {weekDays.map((day) => {
                                const dayKey = toDateKey(day);
                                const tasksForDay = weekTasksByKey.get(dayKey) ?? [];
                                const visibleTasks = tasksForDay.slice(0, ALL_DAY_VISIBLE_LIMIT);
                                const remainingCount = tasksForDay.length - visibleTasks.length;

                                return (
                                    <div
                                        key={dayKey}
                                        className={cn(
                                            "min-h-[5.25rem] space-y-1.5 border-r border-border/70 px-2.5 py-2.5 last:border-r-0",
                                            isSameDay(day, selectedDate) ? "bg-accent/20" : "bg-background/22",
                                        )}
                                    >
                                        {visibleTasks.length > 0 ? visibleTasks.map((task) => {
                                            const project = listMap.get(task.list_id);
                                            const colors = getProjectColorClasses(project?.color_token);

                                            return (
                                                <button
                                                    key={task.id}
                                                    type="button"
                                                    onClick={() => openBlockDialog(task.id, { date: day })}
                                                    className={cn(
                                                        "flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-background/90",
                                                        colors.soft,
                                                        colors.border,
                                                    )}
                                                >
                                                    <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", colors.accent)} />
                                                    <span className="min-w-0 truncate font-medium text-foreground">{task.title}</span>
                                                </button>
                                            );
                                        }) : (
                                            <div className="flex min-h-[5.25rem] items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/35 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                                                Clear
                                            </div>
                                        )}

                                        {remainingCount > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => setSelectedDate(day)}
                                                className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                                            >
                                                +{remainingCount} more
                                            </button>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="relative grid grid-cols-[76px_repeat(7,minmax(140px,1fr))]">
                            <div className="sticky left-0 z-20 border-r border-border/70 bg-card/98">
                                {PLANNER_HOURS.map((hour) => (
                                    <div
                                        key={hour}
                                        className="flex items-start justify-end border-b border-border/60 px-3 pt-1.5 text-[10px] font-medium text-muted-foreground last:border-b-0"
                                        style={plannerRowStyle}
                                    >
                                        {formatPlannerHourLabel(hour)}
                                    </div>
                                ))}
                            </div>

                            {weekDays.map((day) => {
                                const dayKey = toDateKey(day);
                                const dayLayouts = weekBlockLayoutsByKey.get(dayKey) ?? [];

                                return (
                                    <div
                                        key={dayKey}
                                        className={cn(
                                            "relative border-r border-border/70 last:border-r-0",
                                            isSameDay(day, selectedDate) ? "bg-accent/18" : "bg-background/15",
                                        )}
                                    >
                                        {PLANNER_HOURS.map((hour) => (
                                            <div key={`${dayKey}-${hour}`} className="border-b border-border/60 last:border-b-0" style={plannerRowStyle} />
                                        ))}

                                        {dayLayouts.map((layout) => {
                                            const project = listMap.get(layout.block.list_id);
                                            const colors = getProjectColorClasses(project?.color_token);
                                            const width = `calc(${100 / layout.laneCount}% - 8px)`;
                                            const left = `calc(${(layout.lane / layout.laneCount) * 100}% + 4px)`;

                                            return (
                                                <button
                                                    key={layout.block.id}
                                                    type="button"
                                                    onClick={() => editBlock(layout.block)}
                                                    className={cn(
                                                        "absolute overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-transform hover:-translate-y-0.5",
                                                        colors.soft,
                                                        colors.border,
                                                    )}
                                                    style={{ top: layout.top + 3, left, width, height: layout.height }}
                                                >
                                                    <div className="flex items-start gap-2">
                                                        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", colors.accent)} />
                                                        <div className="min-w-0">
                                                            <div className="truncate text-sm font-semibold text-foreground">{layout.block.title}</div>
                                                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                                                {formatBlockTimeRange(layout.block.scheduled_start, layout.block.scheduled_end)}
                                                            </div>
                                                            <div className="mt-2 truncate text-xs text-muted-foreground">
                                                                {project?.name ?? "Project"}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}

                            {currentTimeOffset != null && todayColumnIndex >= 0 ? (
                                <div
                                    className="pointer-events-none absolute z-30"
                                    style={{
                                        top: currentTimeOffset,
                                        left: `calc(76px + (${todayColumnIndex} * ((100% - 76px) / 7)))`,
                                        width: "calc((100% - 76px) / 7)",
                                    }}
                                >
                                    <div className="relative h-0">
                                        <span className="absolute -left-1.5 top-0 h-3 w-3 -translate-y-1/2 rounded-full bg-rose-500 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-card)_80%,transparent)]" />
                                        <div className="h-px w-full bg-rose-500" />
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    function renderWeekView() {
        return (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_17.5rem] xl:items-start">
                <div>{renderWeekGrid()}</div>

                <div className="space-y-3 xl:sticky xl:top-24">
                    <div className="rounded-xl border border-border/70 bg-card/96 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    To plan
                                </p>
                                <h3 className="mt-1 text-sm font-semibold tracking-[-0.02em] text-foreground">
                                    Unscheduled work
                                </h3>
                            </div>
                            <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                                {unscheduledTasks.length}
                            </span>
                        </div>

                        <div className="space-y-2">
                            {unscheduledTasks.length > 0 ? unscheduledTasks.map((task) => {
                                const project = listMap.get(task.list_id);
                                const colors = getProjectColorClasses(project?.color_token);

                                return (
                                    <button
                                        key={task.id}
                                        type="button"
                                        onClick={() => openBlockDialog(task.id)}
                                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-border/70 bg-background/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/55"
                                    >
                                        <div className="min-w-0">
                                            <div className="truncate text-[13px] font-semibold text-foreground">{task.title}</div>
                                            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                                                <span className={cn("h-2 w-2 rounded-full", colors.accent)} />
                                                <span className="truncate">{project?.name ?? "Project"}</span>
                                                {task.estimated_minutes ? <span>{formatMinutesCompact(task.estimated_minutes)}</span> : null}
                                            </div>
                                        </div>
                                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                                            Plan
                                        </span>
                                    </button>
                                );
                            }) : (
                                <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-5 text-sm text-muted-foreground">
                                    Everything visible is already planned.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-card/96 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Due soon
                                </p>
                                <h3 className="mt-1 text-sm font-semibold tracking-[-0.02em] text-foreground">Upcoming</h3>
                            </div>
                            <span className="text-[11px] text-muted-foreground">{selectedScopeLabel}</span>
                        </div>

                        <div className="space-y-2">
                            {upcomingTasks.length > 0 ? upcomingTasks.map((task) => {
                                const project = listMap.get(task.list_id);
                                const colors = getProjectColorClasses(project?.color_token);

                                return (
                                    <button
                                        key={task.id}
                                        type="button"
                                        onClick={() => openBlockDialog(task.id, { date: task.due_date ? new Date(task.due_date) : selectedDate })}
                                        className="flex w-full items-start gap-2.5 rounded-lg border border-border/70 bg-background/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/55"
                                    >
                                        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", colors.accent)} />
                                        <div className="min-w-0">
                                            <div className="truncate text-[13px] font-semibold text-foreground">{task.title}</div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                {task.due_date ? format(new Date(task.due_date), "EEE, MMM d") : "No date"}
                                            </div>
                                        </div>
                                    </button>
                                );
                            }) : (
                                <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-5 text-sm text-muted-foreground">
                                    No upcoming deadlines in scope.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="rounded-xl border border-border/70 bg-card/96 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                            Focus goal
                        </p>
                        <div className="mt-2 flex items-end justify-between gap-3">
                            <div className="text-xl font-semibold tracking-[-0.04em] text-foreground">
                                {todayFocusMinutes}m
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                                Goal {dailyGoal}m
                            </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${focusProgress}%` }} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                            <div className="rounded-lg border border-border/70 bg-background/55 px-3 py-2">
                                <div className="uppercase tracking-[0.14em]">Due today</div>
                                <div className="mt-1 font-mono text-sm text-foreground">{selectedDayTasks.length}</div>
                            </div>
                            <div className="rounded-lg border border-border/70 bg-background/55 px-3 py-2">
                                <div className="uppercase tracking-[0.14em]">Blocks</div>
                                <div className="mt-1 font-mono text-sm text-foreground">{filteredBlocks.length}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    function renderMonthView() {
        return (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_19rem] xl:items-start">
                <div className="overflow-hidden rounded-xl border border-border/70 bg-card/98">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        month={anchorDate}
                        onMonthChange={(month) => setAnchorDate(startOfDay(month))}
                        onSelect={(date) => {
                            if (!date) return;
                            const normalizedDate = startOfDay(date);
                            setSelectedDate(normalizedDate);
                            setAnchorDate(normalizedDate);
                        }}
                        className="w-full bg-transparent p-3 sm:p-4 [--cell-size:clamp(4rem,6.2vw,5.2rem)]"
                        classNames={{
                            root: "w-full",
                            months: "w-full",
                            month: "w-full gap-4",
                            table: "w-full",
                            month_grid: "w-full",
                            nav: "absolute inset-x-3 top-3 flex items-center justify-between sm:inset-x-4 sm:top-4",
                            month_caption: "flex h-(--cell-size) w-full items-center justify-center px-12 sm:px-14",
                            weekdays: "mt-3 flex w-full",
                            weeks: "w-full",
                            week: "mt-1.5 flex w-full",
                            weekday: "flex-1 text-center text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground",
                            day: "group/day relative aspect-square flex-1 p-1 text-center select-none",
                        }}
                        components={{
                            DayButton: (props) => (
                                <CalendarMonthDayButton
                                    {...props}
                                    metrics={daySummaries[toDateKey(props.day.date)]}
                                />
                            ),
                        }}
                    />
                </div>

                <div className="rounded-xl border border-border/70 bg-card/96 p-4">
                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Selected day
                            </p>
                            <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-foreground">
                                {format(selectedDate, "EEEE, MMM d")}
                            </h3>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                {selectedDayTasks.length} task{selectedDayTasks.length === 1 ? "" : "s"} /{" "}
                                {selectedDayBlocks.length} block{selectedDayBlocks.length === 1 ? "" : "s"}.
                            </p>
                        </div>

                        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/60 px-3 py-2.5 text-sm">
                            <div>
                                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                    Focus today
                                </div>
                                <div className="font-mono text-sm text-foreground">
                                    {todayFocusMinutes}m / {dailyGoal}m
                                </div>
                            </div>
                            <Button variant="ghost" size="xs" onClick={() => openBlockDialog(undefined, { date: selectedDate })}>
                                <Plus className="h-3.5 w-3.5" />
                                New
                            </Button>
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Due tasks
                            </p>
                            {selectedDayTasks.length > 0 ? selectedDayTasks.map((task) => {
                                const project = listMap.get(task.list_id);
                                const colors = getProjectColorClasses(project?.color_token);

                                return (
                                    <button
                                        key={task.id}
                                        type="button"
                                        onClick={() => openBlockDialog(task.id, { date: selectedDate })}
                                        className="flex w-full items-start gap-2.5 rounded-lg border border-border/70 bg-background/60 px-3 py-2.5 text-left transition-colors hover:bg-muted/55"
                                    >
                                        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", colors.accent)} />
                                        <div className="min-w-0">
                                            <div className="truncate text-[13px] font-semibold text-foreground">{task.title}</div>
                                            <div className="mt-1 text-[11px] text-muted-foreground">
                                                {project?.name ?? "Project"}
                                            </div>
                                        </div>
                                    </button>
                                );
                            }) : (
                                <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-5 text-sm text-muted-foreground">
                                    No tasks due this day.
                                </div>
                            )}
                        </div>

                        <div className="space-y-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Planned blocks
                            </p>
                            {selectedDayBlocks.length > 0 ? selectedDayBlocks.map((block) => {
                                const project = listMap.get(block.list_id);
                                const colors = getProjectColorClasses(project?.color_token);

                                return (
                                    <button
                                        key={block.id}
                                        type="button"
                                        onClick={() => editBlock(block)}
                                        className={cn(
                                            "w-full rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-background/90",
                                            colors.soft,
                                            colors.border,
                                        )}
                                    >
                                        <div className="flex items-start gap-3">
                                            <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", colors.accent)} />
                                            <div className="min-w-0">
                                                <div className="truncate text-[13px] font-semibold text-foreground">{block.title}</div>
                                                <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                                    {formatBlockTimeRange(block.scheduled_start, block.scheduled_end)}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            }) : (
                                <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-5 text-sm text-muted-foreground">
                                    No blocks planned this day.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    function renderBlockDialog() {
        return (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-xl rounded-[1.5rem] border-border/60 p-0">
                    <DialogHeader className="border-b border-border/60 px-5 py-4">
                        <DialogTitle>{form.id ? "Edit focus block" : "Plan focus block"}</DialogTitle>
                        <DialogDescription>
                            Add time for a task or project.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 px-5 py-5">
                        <div className="space-y-2">
                            <Label htmlFor="blockTitle" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Title
                            </Label>
                            <Input
                                id="blockTitle"
                                value={form.title}
                                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                            />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="space-y-2">
                                <Label htmlFor="blockProject" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Project
                                </Label>
                                <Select value={form.listId} onValueChange={(value) => setForm((current) => ({ ...current, listId: value }))}>
                                    <SelectTrigger id="blockProject">
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
                                <Label htmlFor="blockTask" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Linked task
                                </Label>
                                <Select
                                    value={form.todoId ?? "none"}
                                    onValueChange={(value) => setForm((current) => ({ ...current, todoId: value === "none" ? null : value }))}
                                >
                                    <SelectTrigger id="blockTask">
                                        <SelectValue placeholder="No linked task" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">No linked task</SelectItem>
                                        {tasks.filter((task) => task.list_id === form.listId && !task.is_done).map((task) => (
                                            <SelectItem key={task.id} value={task.id}>
                                                {task.title}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="space-y-2">
                                <Label htmlFor="blockDate" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Date
                                </Label>
                                <DatePickerField id="blockDate" value={form.date} onChange={(value) => setForm((current) => ({ ...current, date: value }))} />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="blockStart" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Start
                                </Label>
                                <TimeSelectField id="blockStart" value={form.startTime} onChange={(value) => setForm((current) => ({ ...current, startTime: value }))} />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="blockDuration" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                    Duration
                                </Label>
                                <Input
                                    id="blockDuration"
                                    type="number"
                                    min="15"
                                    step="15"
                                    value={form.durationMinutes}
                                    onChange={(event) => setForm((current) => ({ ...current, durationMinutes: event.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
                            <span>Reserved time</span>
                            <span className="font-mono text-foreground">
                                {formatMinutesCompact(Number.parseInt(form.durationMinutes || "0", 10) || 0)}
                            </span>
                        </div>
                    </div>

                    <DialogFooter className="justify-between border-t border-border/60 px-5 py-4 sm:justify-between">
                        {form.id ? (
                            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void handleDeleteBlock()}>
                                Delete
                            </Button>
                        ) : <div />}
                        <div className="flex gap-2">
                            <Button variant="outline" onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button onClick={() => void handleSaveBlock()} disabled={saving || !form.title.trim() || !form.listId}>
                                {saving ? "Saving..." : form.id ? "Save block" : "Create block"}
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    if (!loading && lists.length === 0) {
        return (
            <div className="page-container">
                <PageHeader
                    eyebrow="Calendar"
                    title="Upcoming"
                    description="Create a project before planning."
                />
                <EmptyState
                    title="Create a project before planning"
                    description="Create a project first."
                    icon={<CalendarDays className="h-8 w-8" />}
                />
            </div>
        );
    }

    return (
        <>
            <div className="page-container gap-4">
                <PageHeader
                    eyebrow="Calendar"
                    title="Upcoming"
                    description={`${plannerRangeLabel} / ${filteredTasks.length} open tasks / ${filteredBlocks.length} planned blocks`}
                />

                {renderToolbar()}
                {loading ? renderLoadingState() : view === "week" ? renderWeekView() : renderMonthView()}
            </div>

            {renderBlockDialog()}
        </>
    );
}
