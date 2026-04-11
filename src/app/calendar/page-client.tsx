"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, format, isSameDay, parseISO, startOfDay, subDays, subMonths } from "date-fns";
import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { DayButtonProps } from "react-day-picker";
import { toast } from "sonner";

import { AppShell } from "~/components/app-shell";
import { EmptyState, PageHeader } from "~/components/app-primitives";
import { Calendar, CalendarDayButton } from "~/components/ui/calendar";
import { useData } from "~/components/data-provider";
import { useFocus } from "~/components/focus-provider";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { useTaskDataset, type TaskDatasetRecord } from "~/hooks/use-task-dataset";
import {
    buildTimedBlockLayouts,
    combineDateAndTime,
    dateKeyToDate,
    findNextPlannerSlot,
    findPlannerSlotForDate,
    getPlannerDateFromMinutes,
    getPlannerRangeLabel,
    getPlannerVisibleDays,
    PLANNED_BLOCK_FIELDS,
    toDateKey,
    type PlannerView,
} from "~/lib/planning";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import {
    applyPlannerTaskFilters,
    arePlannerFilterScopesEqual,
    arePlannerFilterStatesEqual,
    createPlannerFilterState,
    normalizePlannerSavedFilterRow,
    plannerSavedFilterToState,
    PLANNER_SAVED_FILTER_FIELDS,
    type PlannerDeadlineScope,
    type PlannerFilterState,
    type PlannerPlanningStatusFilter,
    type PlannerSavedFilterRow,
} from "~/lib/planner-filters";
import { getTaskDeadlineDateKey } from "~/lib/task-deadlines";
import { compareDeterministicTasks, getSmartViewTasks } from "~/lib/task-views";
import type { PlannedFocusBlock } from "~/lib/types";
import { cn } from "~/lib/utils";
import { PlannerBlockDialog } from "./_components/planner-block-dialog";
import { PlannerFilterBar } from "./_components/planner-filter-bar";
import { PlannerGrid } from "./_components/planner-grid";
import { PlannerSidebar } from "./_components/planner-sidebar";
import { PlannerToolbar } from "./_components/planner-toolbar";
import type { BlockDialogPrefillOptions, BlockFormState, PlannerDaySummary } from "./_components/planner-types";

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

function createBlockFormFromPlannedBlock(block: PlannedFocusBlock): BlockFormState {
    const durationMinutes = Math.max(
        15,
        Math.round((new Date(block.scheduled_end).getTime() - new Date(block.scheduled_start).getTime()) / 60000),
    );

    return {
        id: block.id,
        title: block.title,
        listId: block.list_id,
        todoId: block.todo_id,
        date: format(new Date(block.scheduled_start), "yyyy-MM-dd"),
        startTime: format(new Date(block.scheduled_start), "HH:mm"),
        durationMinutes: String(durationMinutes),
    };
}

function clamp(value: number, min: number, max: number) {
    return Math.min(Math.max(value, min), max);
}

function sortPlannerSavedFilters(filters: PlannerSavedFilterRow[]) {
    return [...filters].sort((a, b) => {
        const updatedAtComparison = b.updated_at.localeCompare(a.updated_at);
        if (updatedAtComparison !== 0) return updatedAtComparison;
        return a.name.localeCompare(b.name);
    });
}

function isMissingPlannerSavedFiltersTableError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return code === "PGRST205" || code === "42P01" || message.includes("planner_saved_filters");
}

function isEditableKeyboardTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function isPlannerView(value: string | null): value is PlannerView {
    return value === "day" || value === "week" || value === "month";
}

function parseDurationParam(value: string | null) {
    if (!value) return null;

    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getDefaultPlannerView() {
    if (typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches) {
        return "day" as const;
    }

    return "week" as const;
}

function getDayBlocks(blocks: PlannedFocusBlock[], date: Date) {
    return blocks
        .filter((block) => isSameDay(new Date(block.scheduled_start), date))
        .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
}

function getDayTasks(tasks: TaskDatasetRecord[], date: Date, timeZone?: string | null) {
    const comparisonDateKey = toDateKey(date);

    return tasks
        .filter((task) => getTaskDeadlineDateKey(task, timeZone) === comparisonDateKey)
        .sort(compareDeterministicTasks);
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
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { profile, userId } = useData();
    const { lists, tasks, plannedBlocks, todayFocusMinutes, loading, removePlannedBlock, upsertPlannedBlock } = useTaskDataset();
    const { handleModeChange, setCurrentBlockId, setCurrentListId, setCurrentTaskId, setIsActive } = useFocus();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const searchListId = searchParams.get("listId");
    const searchBlockId = searchParams.get("blockId");
    const searchTaskId = searchParams.get("taskId");
    const searchDate = searchParams.get("date");
    const searchStartTime = searchParams.get("startTime");
    const searchDuration = searchParams.get("duration");
    const searchView = searchParams.get("view");

    const [view, setView] = useState<PlannerView>(() => isPlannerView(searchView) ? searchView : getDefaultPlannerView());
    const [anchorDate, setAnchorDate] = useState(startOfDay(new Date()));
    const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
    const [selectedListId, setSelectedListId] = useState(searchListId ?? "all");
    const [planningStatusFilter, setPlanningStatusFilter] = useState<PlannerPlanningStatusFilter>("all");
    const [deadlineScope, setDeadlineScope] = useState<PlannerDeadlineScope>("all");
    const [savedFilters, setSavedFilters] = useState<PlannerSavedFilterRow[]>([]);
    const [activeSavedFilterId, setActiveSavedFilterId] = useState<string | null>(null);
    const [saveFilterName, setSaveFilterName] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savingFilter, setSavingFilter] = useState(false);
    const [form, setForm] = useState<BlockFormState>(() => createBlockForm(""));
    const [now, setNow] = useState(() => new Date());
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isWideSidebar, setIsWideSidebar] = useState(() => {
        if (typeof window === "undefined") return true;
        return window.matchMedia("(min-width: 1280px)").matches;
    });
    const consumedBlockPrefillRef = useRef<string | null>(null);
    const consumedTaskPrefillRef = useRef<string | null>(null);
    const plannedBlocksRef = useRef(plannedBlocks);

    const clearDeepLinkParams = useCallback((keys: string[]) => {
        const nextParams = new URLSearchParams(searchParams.toString());
        let changed = false;

        keys.forEach((key) => {
            if (!nextParams.has(key)) return;
            nextParams.delete(key);
            changed = true;
        });

        if (!changed) return;

        const nextQuery = nextParams.toString();
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }, [pathname, router, searchParams]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setNow(new Date());
        }, 60_000);

        return () => {
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        plannedBlocksRef.current = plannedBlocks;
    }, [plannedBlocks]);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(min-width: 1280px)");
        const syncWideSidebar = () => setIsWideSidebar(mediaQuery.matches);

        syncWideSidebar();
        mediaQuery.addEventListener("change", syncWideSidebar);

        return () => {
            mediaQuery.removeEventListener("change", syncWideSidebar);
        };
    }, []);

    useEffect(() => {
        if (isWideSidebar) {
            setSidebarOpen(false);
        }
    }, [isWideSidebar]);

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
        if (!isPlannerView(searchView)) return;
        setView(searchView);
    }, [searchView]);

    useEffect(() => {
        if (selectedListId === "all") return;
        if (lists.some((list) => list.id === selectedListId)) return;
        setSelectedListId("all");
    }, [lists, selectedListId]);

    useEffect(() => {
        if (!userId) {
            setSavedFilters([]);
            setActiveSavedFilterId(null);
            setSaveFilterName("");
            return;
        }

        let cancelled = false;

        async function loadSavedFilters() {
            const { data, error } = await supabase
                .from("planner_saved_filters")
                .select(PLANNER_SAVED_FILTER_FIELDS)
                .eq("user_id", userId)
                .order("updated_at", { ascending: false });

            if (cancelled) return;

            if (error) {
                if (isMissingPlannerSavedFiltersTableError(error)) {
                    setSavedFilters([]);
                    return;
                }
                toast.error(error.message || "Unable to load planner filters.");
                return;
            }

            setSavedFilters(sortPlannerSavedFilters(((data ?? []) as PlannerSavedFilterRow[]).map(normalizePlannerSavedFilterRow)));
        }

        void loadSavedFilters();

        return () => {
            cancelled = true;
        };
    }, [supabase, userId]);

    useEffect(() => {
        if (!activeSavedFilterId) return;
        if (savedFilters.some((filter) => filter.id === activeSavedFilterId)) return;
        setActiveSavedFilterId(null);
    }, [activeSavedFilterId, savedFilters]);

    useEffect(() => {
        if (!searchBlockId) {
            consumedBlockPrefillRef.current = null;
            return;
        }

        const prefillKey = `${searchBlockId}:${searchListId ?? ""}`;
        if (consumedBlockPrefillRef.current === prefillKey) return;

        const block = plannedBlocks.find((item) => item.id === searchBlockId);
        if (!block) return;

        const blockDate = startOfDay(new Date(block.scheduled_start));

        consumedBlockPrefillRef.current = prefillKey;
        if (isPlannerView(searchView)) {
            setView(searchView);
        }
        setForm(createBlockFormFromPlannedBlock(block));
        setSelectedDate(blockDate);
        setAnchorDate(blockDate);
        setSelectedListId(block.list_id);
        setDialogOpen(true);
        clearDeepLinkParams(["blockId", "taskId", "date", "duration", "startTime"]);
    }, [clearDeepLinkParams, plannedBlocks, searchBlockId, searchListId, searchView]);

    useEffect(() => {
        if (!searchTaskId) {
            consumedTaskPrefillRef.current = null;
            return;
        }

        if (searchBlockId) return;

        const prefillKey = `${searchTaskId}:${searchListId ?? ""}:${searchDate ?? ""}:${searchDuration ?? ""}:${searchStartTime ?? ""}:${searchView ?? ""}`;
        if (consumedTaskPrefillRef.current === prefillKey) return;

        const task = tasks.find((item) => item.id === searchTaskId);
        if (!task) return;

        const requestedDate = searchDate ? parseISO(searchDate) : null;
        const requestedDuration = parseDurationParam(searchDuration);
        const taskDateKey = getTaskDeadlineDateKey(task, profile?.timezone);
        const taskDate = requestedDate && !Number.isNaN(requestedDate.getTime())
            ? startOfDay(requestedDate)
            : taskDateKey
                ? startOfDay(dateKeyToDate(taskDateKey))
                : startOfDay(new Date());

        consumedTaskPrefillRef.current = prefillKey;
        if (isPlannerView(searchView)) {
            setView(searchView);
        }
        setForm({
            id: null,
            title: task.title,
            listId: task.list_id,
            todoId: task.id,
            date: toDateKey(taskDate),
            startTime: searchStartTime ?? "09:00",
            durationMinutes: String(requestedDuration ?? task.remaining_estimated_minutes ?? task.estimated_minutes ?? 60),
        });
        setSelectedDate(taskDate);
        setAnchorDate(taskDate);
        setSelectedListId(task.list_id);
        setDialogOpen(true);
        clearDeepLinkParams(["taskId", "date", "duration", "startTime"]);
    }, [clearDeepLinkParams, profile?.timezone, searchBlockId, searchDate, searchDuration, searchListId, searchStartTime, searchTaskId, searchView, tasks]);

    const currentFilterState = useMemo<PlannerFilterState>(() => createPlannerFilterState({
        listId: selectedListId,
        planningStatusFilter,
        deadlineScope,
        defaultView: view,
    }), [deadlineScope, planningStatusFilter, selectedListId, view]);
    const activeSavedFilter = useMemo(
        () => activeSavedFilterId ? savedFilters.find((filter) => filter.id === activeSavedFilterId) ?? null : null,
        [activeSavedFilterId, savedFilters],
    );
    const activeSavedFilterState = useMemo(
        () => activeSavedFilter ? plannerSavedFilterToState(activeSavedFilter) : null,
        [activeSavedFilter],
    );
    const activeSavedFilterScopeApplied = useMemo(
        () => activeSavedFilterState ? arePlannerFilterScopesEqual(currentFilterState, activeSavedFilterState) : false,
        [activeSavedFilterState, currentFilterState],
    );
    const canUpdateActiveFilter = useMemo(() => {
        if (!activeSavedFilter || !activeSavedFilterState) return false;
        const normalizedName = saveFilterName.trim();
        if (!normalizedName) return false;

        return normalizedName !== activeSavedFilter.name
            || !arePlannerFilterStatesEqual(currentFilterState, activeSavedFilterState);
    }, [activeSavedFilter, activeSavedFilterState, currentFilterState, saveFilterName]);

    const filteredTasks = useMemo(
        () => applyPlannerTaskFilters(tasks, currentFilterState, profile?.timezone),
        [currentFilterState, profile?.timezone, tasks],
    );

    const filteredBlocks = useMemo(() => {
        return selectedListId === "all"
            ? plannedBlocks
            : plannedBlocks.filter((block) => block.list_id === selectedListId);
    }, [plannedBlocks, selectedListId]);

    const daySummaries = useMemo(() => {
        const summaries: Record<string, PlannerDaySummary> = {};

        filteredTasks.forEach((task) => {
            const key = getTaskDeadlineDateKey(task, profile?.timezone);
            if (!key) return;
            summaries[key] ??= { dueCount: 0, blockCount: 0, plannedMinutes: 0 };
            summaries[key].dueCount += 1;
        });

        filteredBlocks.forEach((block) => {
            const key = toDateKey(new Date(block.scheduled_start));
            summaries[key] ??= { dueCount: 0, blockCount: 0, plannedMinutes: 0 };
            summaries[key].blockCount += 1;
            summaries[key].plannedMinutes += Math.max(
                15,
                Math.round((new Date(block.scheduled_end).getTime() - new Date(block.scheduled_start).getTime()) / 60000),
            );
        });

        return summaries;
    }, [filteredBlocks, filteredTasks, profile?.timezone]);

    const plannerDays = useMemo(
        () => view === "month" ? [] : getPlannerVisibleDays(view, anchorDate, selectedDate),
        [anchorDate, selectedDate, view],
    );
    const dailyGoal = profile?.daily_focus_goal_minutes ?? 120;
    const focusProgress = clamp((todayFocusMinutes / Math.max(dailyGoal, 1)) * 100, 0, 100);
    const selectedDayTasks = useMemo(() => getDayTasks(filteredTasks, selectedDate, profile?.timezone), [filteredTasks, profile?.timezone, selectedDate]);
    const selectedDayBlocks = useMemo(() => getDayBlocks(filteredBlocks, selectedDate), [filteredBlocks, selectedDate]);
    const upcomingTasks = useMemo(() => getSmartViewTasks(filteredTasks, "upcoming", new Date(), profile?.timezone).slice(0, 6), [filteredTasks, profile?.timezone]);
    const unscheduledTasks = useMemo(() => filteredTasks.filter((task) => task.planning_status === "unplanned").slice(0, 6), [filteredTasks]);
    const partiallyPlannedTasks = useMemo(
        () => filteredTasks.filter((task) => task.planning_status === "partially_planned").slice(0, 6),
        [filteredTasks],
    );
    const listMap = useMemo(() => new Map(lists.map((list) => [list.id, list])), [lists]);
    const plannerTasksByKey = useMemo(() => {
        const byKey = new Map<string, TaskDatasetRecord[]>();
        plannerDays.forEach((day) => {
            byKey.set(toDateKey(day), getDayTasks(filteredTasks, day, profile?.timezone));
        });
        return byKey;
    }, [filteredTasks, plannerDays, profile?.timezone]);
    const plannerBlockLayoutsByKey = useMemo(() => {
        const byKey = new Map<string, ReturnType<typeof buildTimedBlockLayouts>>();
        plannerDays.forEach((day) => {
            byKey.set(toDateKey(day), buildTimedBlockLayouts(filteredBlocks, day));
        });
        return byKey;
    }, [filteredBlocks, plannerDays]);
    const plannerRangeLabel = useMemo(() => getPlannerRangeLabel(view, anchorDate, selectedDate), [anchorDate, selectedDate, view]);
    const selectedScopeLabel = useMemo(() => {
        if (selectedListId === "all") return "All projects";
        return listMap.get(selectedListId)?.name ?? "Project";
    }, [listMap, selectedListId]);
    const getTaskDefaultDuration = useCallback((task: TaskDatasetRecord, options?: { durationMinutes?: number }) => {
        return options?.durationMinutes ?? task.remaining_estimated_minutes ?? task.estimated_minutes ?? 60;
    }, []);
    const handleSetView = useCallback((nextView: PlannerView) => {
        setView(nextView);
        if (nextView !== "month") {
            setAnchorDate(startOfDay(selectedDate));
        }
    }, [selectedDate]);

    useEffect(() => {
        setSaveFilterName(activeSavedFilter?.name ?? "");
    }, [activeSavedFilter]);

    const clearPlannerFilters = useCallback(() => {
        setActiveSavedFilterId(null);
        setSaveFilterName("");
        setSelectedListId("all");
        setPlanningStatusFilter("all");
        setDeadlineScope("all");
    }, []);

    const handleApplySavedFilter = useCallback((filterId: string) => {
        const filter = savedFilters.find((item) => item.id === filterId);
        if (!filter) return;

        const filterState = plannerSavedFilterToState(filter);
        setActiveSavedFilterId(filter.id);
        setSelectedListId(filterState.listId);
        setPlanningStatusFilter(filterState.planningStatusFilter);
        setDeadlineScope(filterState.deadlineScope);
        setSaveFilterName(filter.name);
        handleSetView(filterState.defaultView);
    }, [handleSetView, savedFilters]);

    const handleSaveCurrentFilter = useCallback(async () => {
        if (!userId) return;

        const normalizedName = saveFilterName.trim();
        if (!normalizedName) {
            toast.error("Name the planner filter first.");
            return;
        }

        if (savedFilters.some((filter) => filter.name.trim().toLowerCase() === normalizedName.toLowerCase())) {
            toast.error("A planner filter with that name already exists.");
            return;
        }

        try {
            setSavingFilter(true);
            const { data, error } = await supabase
                .from("planner_saved_filters")
                .insert({
                    user_id: userId,
                    name: normalizedName,
                    list_id: currentFilterState.listId === "all" ? null : currentFilterState.listId,
                    planning_status_filter: currentFilterState.planningStatusFilter,
                    deadline_scope: currentFilterState.deadlineScope,
                    default_view: currentFilterState.defaultView,
                })
                .select(PLANNER_SAVED_FILTER_FIELDS)
                .single();

            if (error) throw error;

            const savedFilter = normalizePlannerSavedFilterRow(data as PlannerSavedFilterRow);
            setSavedFilters((current) => sortPlannerSavedFilters([savedFilter, ...current.filter((filter) => filter.id !== savedFilter.id)]));
            setActiveSavedFilterId(savedFilter.id);
            setSaveFilterName(savedFilter.name);
            toast.success("Planner filter saved.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save planner filter.");
        } finally {
            setSavingFilter(false);
        }
    }, [currentFilterState, saveFilterName, savedFilters, supabase, userId]);

    const handleUpdateActiveFilter = useCallback(async () => {
        if (!activeSavedFilter) return;

        const normalizedName = saveFilterName.trim();
        if (!normalizedName) {
            toast.error("Name the planner filter first.");
            return;
        }

        if (savedFilters.some((filter) => filter.id !== activeSavedFilter.id && filter.name.trim().toLowerCase() === normalizedName.toLowerCase())) {
            toast.error("A planner filter with that name already exists.");
            return;
        }

        try {
            setSavingFilter(true);
            const { data, error } = await supabase
                .from("planner_saved_filters")
                .update({
                    name: normalizedName,
                    list_id: currentFilterState.listId === "all" ? null : currentFilterState.listId,
                    planning_status_filter: currentFilterState.planningStatusFilter,
                    deadline_scope: currentFilterState.deadlineScope,
                    default_view: currentFilterState.defaultView,
                })
                .eq("id", activeSavedFilter.id)
                .select(PLANNER_SAVED_FILTER_FIELDS)
                .single();

            if (error) throw error;

            const updatedFilter = normalizePlannerSavedFilterRow(data as PlannerSavedFilterRow);
            setSavedFilters((current) => sortPlannerSavedFilters(current.map((filter) => filter.id === updatedFilter.id ? updatedFilter : filter)));
            setSaveFilterName(updatedFilter.name);
            toast.success("Planner filter updated.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to update planner filter.");
        } finally {
            setSavingFilter(false);
        }
    }, [activeSavedFilter, currentFilterState, saveFilterName, savedFilters, supabase]);

    const handleDeleteActiveFilter = useCallback(async () => {
        if (!activeSavedFilter) return;

        try {
            setSavingFilter(true);
            const { error } = await supabase
                .from("planner_saved_filters")
                .delete()
                .eq("id", activeSavedFilter.id);

            if (error) throw error;

            setSavedFilters((current) => current.filter((filter) => filter.id !== activeSavedFilter.id));
            setActiveSavedFilterId(null);
            setSaveFilterName("");
            toast.success("Planner filter deleted.");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to delete planner filter.");
        } finally {
            setSavingFilter(false);
        }
    }, [activeSavedFilter, supabase]);

    const shiftPeriod = useCallback((direction: -1 | 1) => {
        setAnchorDate((current) => view === "day"
            ? (direction === -1 ? subDays(current, 1) : addDays(current, 1))
            : view === "week"
                ? (direction === -1 ? subDays(current, 7) : addDays(current, 7))
                : (direction === -1 ? subMonths(current, 1) : addMonths(current, 1)));
        setSelectedDate((current) => view === "day"
            ? (direction === -1 ? subDays(current, 1) : addDays(current, 1))
            : view === "week"
                ? (direction === -1 ? subDays(current, 7) : addDays(current, 7))
                : (direction === -1 ? subMonths(current, 1) : addMonths(current, 1)));
    }, [view]);

    const goToToday = useCallback(() => {
        const today = startOfDay(new Date());
        setAnchorDate(today);
        setSelectedDate(today);
    }, []);

    const openBlockDialog = useCallback((taskId?: string | null, options?: BlockDialogPrefillOptions) => {
        const task = taskId ? tasks.find((item) => item.id === taskId) : null;
        const date = startOfDay(options?.date ?? selectedDate);
        const listId = task?.list_id ?? (selectedListId === "all" ? lists[0]?.id ?? "" : selectedListId);
        const defaultDurationMinutes = options?.durationMinutes
            ?? task?.remaining_estimated_minutes
            ?? task?.estimated_minutes
            ?? 60;

        if (options?.view) {
            setView(options.view);
        }

        setSelectedDate(date);
        setAnchorDate(date);
        setSidebarOpen(false);
        setForm({
            id: null,
            title: task?.title ?? "",
            listId,
            todoId: task?.id ?? null,
            date: toDateKey(date),
            startTime: options?.startTime ?? "09:00",
            durationMinutes: String(defaultDurationMinutes),
        });
        setDialogOpen(true);
    }, [lists, selectedDate, selectedListId, tasks]);

    const editBlock = useCallback((block: PlannedFocusBlock) => {
        setForm(createBlockFormFromPlannedBlock(block));
        setSidebarOpen(false);
        setDialogOpen(true);
    }, []);

    const persistBlockUpdate = useCallback(async (
        block: PlannedFocusBlock,
        updates: {
            list_id: string;
            scheduled_end: string;
            scheduled_start: string;
            title: string;
            todo_id: string | null;
        },
        options?: {
            successMessage?: string;
            undoSnapshot?: PlannedFocusBlock;
            undoSuccessMessage?: string;
        },
    ) => {
        const optimisticUpdatedAt = new Date().toISOString();
        const optimisticBlock: PlannedFocusBlock = {
            ...block,
            ...updates,
            updated_at: optimisticUpdatedAt,
        };

        upsertPlannedBlock(optimisticBlock);

        try {
            const { data, error } = await supabase
                .from("planned_focus_blocks")
                .update(updates)
                .eq("id", block.id)
                .select(PLANNED_BLOCK_FIELDS)
                .single();
            if (error) throw error;
            const savedBlock = data as PlannedFocusBlock;
            upsertPlannedBlock(savedBlock, { suppressRealtimeEcho: true });
            if (options?.successMessage) {
                const undoSnapshot = options?.undoSnapshot;

                toast.success(options.successMessage, undoSnapshot ? {
                    action: {
                        label: "Undo",
                        onClick: () => {
                            const currentBlock = plannedBlocksRef.current.find((item) => item.id === savedBlock.id);
                            if (!currentBlock) {
                                toast.error("Focus block is no longer available.");
                                return;
                            }

                            void persistBlockUpdate(currentBlock, {
                                title: undoSnapshot.title,
                                list_id: undoSnapshot.list_id,
                                todo_id: undoSnapshot.todo_id,
                                scheduled_start: undoSnapshot.scheduled_start,
                                scheduled_end: undoSnapshot.scheduled_end,
                            }, {
                                successMessage: options.undoSuccessMessage ?? "Change reverted.",
                            });
                        },
                    },
                } : undefined);
            }
            return savedBlock;
        } catch (error) {
            upsertPlannedBlock(block);
            toast.error(error instanceof Error ? error.message : "Unable to update focus block.");
            return null;
        }
    }, [supabase, upsertPlannedBlock]);

    const restoreDeletedBlock = useCallback(async (
        block: PlannedFocusBlock,
        options?: { successMessage?: string },
    ) => {
        upsertPlannedBlock(block);

        try {
            const { data, error } = await supabase
                .from("planned_focus_blocks")
                .insert({
                    id: block.id,
                    user_id: block.user_id,
                    list_id: block.list_id,
                    todo_id: block.todo_id,
                    title: block.title,
                    scheduled_start: block.scheduled_start,
                    scheduled_end: block.scheduled_end,
                })
                .select(PLANNED_BLOCK_FIELDS)
                .single();
            if (error) throw error;

            upsertPlannedBlock(data as PlannedFocusBlock, { suppressRealtimeEcho: true });
            if (options?.successMessage) {
                toast.success(options.successMessage);
            }
            return true;
        } catch (error) {
            removePlannedBlock(block.id);
            toast.error(error instanceof Error ? error.message : "Unable to restore focus block.");
            return false;
        }
    }, [removePlannedBlock, supabase, upsertPlannedBlock]);

    const deleteBlock = useCallback(async (
        block: PlannedFocusBlock,
        options?: {
            closeDialog?: boolean;
            successMessage?: string;
            undoSnapshot?: PlannedFocusBlock;
        },
    ) => {
        removePlannedBlock(block.id);

        try {
            const { error } = await supabase.from("planned_focus_blocks").delete().eq("id", block.id);
            if (error) throw error;

            if (options?.closeDialog) {
                setDialogOpen(false);
            }

            if (options?.successMessage) {
                const undoSnapshot = options.undoSnapshot;

                toast.success(options.successMessage, undoSnapshot ? {
                    action: {
                        label: "Undo",
                        onClick: () => {
                            void restoreDeletedBlock(undoSnapshot, {
                                successMessage: "Focus block restored.",
                            });
                        },
                    },
                } : undefined);
            }

            return true;
        } catch (error) {
            upsertPlannedBlock(block);
            toast.error(error instanceof Error ? error.message : "Unable to delete focus block.");
            return false;
        }
    }, [removePlannedBlock, restoreDeletedBlock, supabase, upsertPlannedBlock]);

    const handleQuickScheduleTask = useCallback((
        task: TaskDatasetRecord,
        intent: "add_30m" | "next_slot" | "today" | "tomorrow",
    ) => {
        const durationMinutes = getTaskDefaultDuration(task, {
            durationMinutes: intent === "add_30m" ? 30 : undefined,
        });

        if (intent === "today" || intent === "tomorrow") {
            const targetDate = startOfDay(intent === "today" ? new Date() : addDays(new Date(), 1));
            const slot = findPlannerSlotForDate(plannedBlocksRef.current, targetDate, durationMinutes, {
                after: intent === "today" ? new Date() : undefined,
            });

            openBlockDialog(task.id, {
                date: targetDate,
                startTime: slot ? format(getPlannerDateFromMinutes(slot.date, slot.startMinutes), "HH:mm") : undefined,
                durationMinutes,
                view: "day",
            });
            return;
        }

        const slot = findNextPlannerSlot(plannedBlocksRef.current, {
            after: new Date(),
            durationMinutes,
        });

        openBlockDialog(task.id, {
            date: slot.date,
            startTime: format(getPlannerDateFromMinutes(slot.date, slot.startMinutes), "HH:mm"),
            durationMinutes,
            view: "day",
        });
    }, [getTaskDefaultDuration, openBlockDialog]);

    const handleCreateRange = useCallback((draft: { date: Date; endMinutes: number; startMinutes: number }) => {
        openBlockDialog(undefined, {
            date: draft.date,
            startTime: format(getPlannerDateFromMinutes(draft.date, draft.startMinutes), "HH:mm"),
            durationMinutes: draft.endMinutes - draft.startMinutes,
        });
    }, [openBlockDialog]);

    const handleUpdateBlockRange = useCallback((block: PlannedFocusBlock, next: { date: Date; endMinutes: number; startMinutes: number }) => {
        const nextStart = getPlannerDateFromMinutes(next.date, next.startMinutes).toISOString();
        const nextEnd = getPlannerDateFromMinutes(next.date, next.endMinutes).toISOString();

        void persistBlockUpdate(block, {
            title: block.title,
            list_id: block.list_id,
            todo_id: block.todo_id,
            scheduled_start: nextStart,
            scheduled_end: nextEnd,
        }, {
            successMessage: "Focus block rescheduled.",
            undoSnapshot: block,
        });
    }, [persistBlockUpdate]);

    async function handleSaveBlock() {
        if (!userId || !form.listId || !form.title.trim()) return;

        const start = combineDateAndTime(form.date, form.startTime);
        const end = new Date(start);
        end.setMinutes(start.getMinutes() + Number.parseInt(form.durationMinutes || "60", 10));
        const scheduledStart = start.toISOString();
        const scheduledEnd = end.toISOString();
        const normalizedTitle = form.title.trim();
        const optimisticUpdatedAt = new Date().toISOString();
        let existingBlockForRollback: PlannedFocusBlock | null = null;
        let tempBlockId: string | null = null;

        try {
            setSaving(true);

            if (form.id) {
                const existingBlock = plannedBlocks.find((block) => block.id === form.id);
                if (!existingBlock) {
                    throw new Error("Unable to locate the block to update.");
                }
                existingBlockForRollback = existingBlock;

                const updated = await persistBlockUpdate(existingBlock, {
                    title: normalizedTitle,
                    list_id: form.listId,
                    todo_id: form.todoId,
                    scheduled_start: scheduledStart,
                    scheduled_end: scheduledEnd,
                }, {
                    successMessage: "Focus block updated.",
                    undoSnapshot: existingBlock,
                });
                if (!updated) {
                    return;
                }
            } else {
                tempBlockId = `temp-${crypto.randomUUID()}`;
                const optimisticBlock: PlannedFocusBlock = {
                    id: tempBlockId,
                    user_id: userId,
                    list_id: form.listId,
                    todo_id: form.todoId,
                    title: normalizedTitle,
                    scheduled_start: scheduledStart,
                    scheduled_end: scheduledEnd,
                    inserted_at: optimisticUpdatedAt,
                    updated_at: optimisticUpdatedAt,
                };
                upsertPlannedBlock(optimisticBlock);

                const { data, error } = await supabase.from("planned_focus_blocks").insert({
                    user_id: userId,
                    list_id: form.listId,
                    todo_id: form.todoId,
                    title: normalizedTitle,
                    scheduled_start: scheduledStart,
                    scheduled_end: scheduledEnd,
                })
                    .select(PLANNED_BLOCK_FIELDS)
                    .single();
                if (error) throw error;
                removePlannedBlock(tempBlockId);
                const createdBlock = data as PlannedFocusBlock;
                upsertPlannedBlock(createdBlock, { suppressRealtimeEcho: true });
                toast.success("Focus block created.", {
                    action: {
                        label: "Undo",
                        onClick: () => {
                            void deleteBlock(createdBlock, {
                                successMessage: "Focus block removed.",
                            });
                        },
                    },
                });
            }

            setDialogOpen(false);
        } catch (error) {
            if (existingBlockForRollback) {
                upsertPlannedBlock(existingBlockForRollback);
            }
            if (tempBlockId) {
                removePlannedBlock(tempBlockId);
            }
            toast.error(error instanceof Error ? error.message : "Unable to save focus block.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteBlock() {
        if (!form.id) return;
        try {
            setSaving(true);
            const existingBlock = plannedBlocks.find((block) => block.id === form.id);
            if (!existingBlock) {
                throw new Error("Unable to locate the block to delete.");
            }

            const deleted = await deleteBlock(existingBlock, {
                closeDialog: true,
                successMessage: "Focus block deleted.",
                undoSnapshot: existingBlock,
            });
            if (!deleted) {
                return;
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to delete focus block.");
        } finally {
            setSaving(false);
        }
    }

    const handleStartFocusFromBlock = useCallback(() => {
        if (!form.id) return;

        const block = plannedBlocksRef.current.find((item) => item.id === form.id);
        if (!block) {
            toast.error("Unable to locate this focus block.");
            return;
        }

        setCurrentListId(block.list_id);
        setCurrentTaskId(block.todo_id ?? null);
        setCurrentBlockId(block.id);
        handleModeChange("focus");
        setIsActive(true);
        setDialogOpen(false);
        router.push("/focus");
        toast.success("Focus session started.");
    }, [form.id, handleModeChange, router, setCurrentBlockId, setCurrentListId, setCurrentTaskId, setIsActive]);

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

            if (event.key.toLowerCase() === "d") {
                event.preventDefault();
                handleSetView("day");
                return;
            }

            if (event.key.toLowerCase() === "w") {
                event.preventDefault();
                handleSetView("week");
                return;
            }

            if (event.key.toLowerCase() === "m") {
                event.preventDefault();
                handleSetView("month");
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [goToToday, handleSetView, openBlockDialog, shiftPeriod]);

    function renderSidebar() {
        return (
            <PlannerSidebar
                dailyGoal={dailyGoal}
                date={selectedDate}
                focusProgress={focusProgress}
                partiallyPlannedTasks={partiallyPlannedTasks}
                selectedDayBlocks={selectedDayBlocks}
                selectedDayTasks={selectedDayTasks}
                selectedScopeLabel={selectedScopeLabel}
                timeZone={profile?.timezone}
                todayFocusMinutes={todayFocusMinutes}
                upcomingTasks={upcomingTasks}
                unplannedTasks={unscheduledTasks}
                listMap={listMap}
                onEditBlock={(block) => {
                    setSidebarOpen(false);
                    editBlock(block);
                }}
                onOpenTask={(taskId, options) => {
                    setSidebarOpen(false);
                    openBlockDialog(taskId, options);
                }}
                onQuickCreate={(date) => {
                    setSidebarOpen(false);
                    openBlockDialog(undefined, { date });
                }}
                onQuickScheduleTask={handleQuickScheduleTask}
            />
        );
    }

    function renderToolbar() {
        return (
            <PlannerToolbar
                activeSavedFilterName={activeSavedFilter?.name ?? null}
                canDeleteActiveFilter={Boolean(activeSavedFilter)}
                canUpdateActiveFilter={canUpdateActiveFilter}
                deadlineScope={deadlineScope}
                lists={lists}
                plannerRangeLabel={plannerRangeLabel}
                planningStatusFilter={planningStatusFilter}
                saveFilterName={saveFilterName}
                selectedListId={selectedListId}
                selectedScopeLabel={selectedScopeLabel}
                showSidebarTrigger={!loading && !isWideSidebar}
                savingFilter={savingFilter}
                view={view}
                onChangeSaveFilterName={setSaveFilterName}
                onClearFilters={clearPlannerFilters}
                onDeleteActiveFilter={() => void handleDeleteActiveFilter()}
                onGoToToday={goToToday}
                onOpenSidebar={() => setSidebarOpen(true)}
                onSaveCurrentFilter={() => void handleSaveCurrentFilter()}
                onSelectList={setSelectedListId}
                onSetDeadlineScope={setDeadlineScope}
                onSetPlanningStatusFilter={setPlanningStatusFilter}
                onSetView={handleSetView}
                onShiftPeriod={shiftPeriod}
                onUpdateActiveFilter={() => void handleUpdateActiveFilter()}
            />
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

    function renderPlannerView() {
        return (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18.5rem] xl:items-start">
                <div>
                    <PlannerGrid
                        blockLayoutsByKey={plannerBlockLayoutsByKey}
                        days={plannerDays}
                        now={now}
                        selectedDate={selectedDate}
                        tasksByKey={plannerTasksByKey}
                        listMap={listMap}
                        onCreateRange={handleCreateRange}
                        onEditBlock={editBlock}
                        onQuickPlanTask={(taskId, date) => openBlockDialog(taskId, { date })}
                        onSelectDate={(date) => {
                            const normalizedDate = startOfDay(date);
                            setSelectedDate(normalizedDate);
                            if (view === "day") {
                                setAnchorDate(normalizedDate);
                            }
                        }}
                        onUpdateBlock={handleUpdateBlockRange}
                    />
                </div>
                {isWideSidebar ? renderSidebar() : null}
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
                {isWideSidebar ? renderSidebar() : null}
            </div>
        );
    }

    function renderBlockDialog() {
        return (
            <PlannerBlockDialog
                form={form}
                lists={lists}
                open={dialogOpen}
                saving={saving}
                tasks={tasks}
                onDelete={() => void handleDeleteBlock()}
                onOpenChange={setDialogOpen}
                onSave={() => void handleSaveBlock()}
                onSetForm={setForm}
                onStartFocus={form.id ? handleStartFocusFromBlock : undefined}
            />
        );
    }

    function renderMobileSidebarSheet() {
        return (
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetContent side="right" className="w-full max-w-[24rem] gap-0 border-l border-border/70 p-0">
                    <SheetHeader className="border-b border-border/60 px-5 py-4">
                        <SheetTitle>Planner details</SheetTitle>
                        <SheetDescription>
                            Selected day, planning queue, and quick schedule actions.
                        </SheetDescription>
                    </SheetHeader>
                    <div className="max-h-[100dvh] overflow-y-auto px-4 py-4">
                        {renderSidebar()}
                    </div>
                </SheetContent>
            </Sheet>
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
                <PlannerFilterBar
                    activeSavedFilterId={activeSavedFilterId}
                    activeSavedFilterScopeApplied={activeSavedFilterScopeApplied}
                    currentFilterState={currentFilterState}
                    listMap={listMap}
                    savedFilters={savedFilters}
                    onApplySavedFilter={handleApplySavedFilter}
                    onClearFilters={clearPlannerFilters}
                />
                {loading ? renderLoadingState() : view === "month" ? renderMonthView() : renderPlannerView()}
            </div>

            {renderBlockDialog()}
            {!loading && !isWideSidebar ? renderMobileSidebarSheet() : null}
        </>
    );
}
