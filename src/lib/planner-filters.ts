import { differenceInCalendarDays, parseISO } from "date-fns";

import type { PlannerView } from "~/lib/planning";
import { getTaskDeadlineDateKey, hasTaskDeadline, toDateKeyInTimeZone } from "~/lib/task-deadlines";
import { isTaskDueToday, isTaskOverdue } from "~/lib/task-views";
import type { PlanningStatus, TodoRow } from "~/lib/types";

export type PlannerPlanningStatusFilter = "all" | PlanningStatus;
export type PlannerDeadlineScope = "all" | "due_soon" | "no_deadline" | "overdue" | "today";

export interface PlannerFilterState {
    defaultView: PlannerView;
    deadlineScope: PlannerDeadlineScope;
    listId: string;
    planningStatusFilter: PlannerPlanningStatusFilter;
}

export interface PlannerSavedFilterRow {
    default_view: PlannerView;
    deadline_scope: PlannerDeadlineScope;
    id: string;
    inserted_at: string;
    list_id: string | null;
    name: string;
    planning_status_filter: PlannerPlanningStatusFilter;
    updated_at: string;
    user_id: string;
}

type PlannerFilterableTask = Pick<TodoRow, "deadline_at" | "deadline_on" | "due_date" | "is_done" | "list_id"> & {
    planning_status?: PlanningStatus;
};

const DEFAULT_PLANNER_FILTER_VIEW: PlannerView = "week";
const VALID_PLANNER_DEADLINE_SCOPES = new Set<PlannerDeadlineScope>(["all", "due_soon", "no_deadline", "overdue", "today"]);
const VALID_PLANNER_PLANNING_STATUS_FILTERS = new Set<PlannerPlanningStatusFilter>(["all", "fully_planned", "overplanned", "partially_planned", "unplanned"]);
const VALID_PLANNER_VIEWS = new Set<PlannerView>(["day", "week", "month"]);

export const PLANNER_SAVED_FILTER_FIELDS =
    "id, user_id, name, list_id, planning_status_filter, deadline_scope, default_view, inserted_at, updated_at";

export const PLANNER_PLANNING_STATUS_FILTER_OPTIONS: Array<{ label: string; value: PlannerPlanningStatusFilter }> = [
    { value: "all", label: "All planning" },
    { value: "unplanned", label: "Unplanned" },
    { value: "partially_planned", label: "Partially planned" },
    { value: "fully_planned", label: "Fully planned" },
    { value: "overplanned", label: "Overplanned" },
];

export const PLANNER_DEADLINE_SCOPE_OPTIONS: Array<{ label: string; value: PlannerDeadlineScope }> = [
    { value: "all", label: "All deadlines" },
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Due today" },
    { value: "due_soon", label: "Due soon" },
    { value: "no_deadline", label: "No deadline" },
];

export function isPlannerDeadlineScope(value: string | null | undefined): value is PlannerDeadlineScope {
    return VALID_PLANNER_DEADLINE_SCOPES.has(value as PlannerDeadlineScope);
}

export function isPlannerPlanningStatusFilter(value: string | null | undefined): value is PlannerPlanningStatusFilter {
    return VALID_PLANNER_PLANNING_STATUS_FILTERS.has(value as PlannerPlanningStatusFilter);
}

export function isPlannerSavedFilterView(value: string | null | undefined): value is PlannerView {
    return VALID_PLANNER_VIEWS.has(value as PlannerView);
}

export function createPlannerFilterState(overrides?: Partial<PlannerFilterState>): PlannerFilterState {
    return {
        listId: overrides?.listId ?? "all",
        planningStatusFilter: overrides?.planningStatusFilter ?? "all",
        deadlineScope: overrides?.deadlineScope ?? "all",
        defaultView: overrides?.defaultView ?? DEFAULT_PLANNER_FILTER_VIEW,
    };
}

export function plannerSavedFilterToState(filter: Pick<PlannerSavedFilterRow, "default_view" | "deadline_scope" | "list_id" | "planning_status_filter">): PlannerFilterState {
    return createPlannerFilterState({
        listId: filter.list_id ?? "all",
        planningStatusFilter: filter.planning_status_filter,
        deadlineScope: filter.deadline_scope,
        defaultView: filter.default_view,
    });
}

export function normalizePlannerSavedFilterRow(row: PlannerSavedFilterRow): PlannerSavedFilterRow {
    return {
        ...row,
        list_id: row.list_id ?? null,
        planning_status_filter: isPlannerPlanningStatusFilter(row.planning_status_filter) ? row.planning_status_filter : "all",
        deadline_scope: isPlannerDeadlineScope(row.deadline_scope) ? row.deadline_scope : "all",
        default_view: isPlannerSavedFilterView(row.default_view) ? row.default_view : DEFAULT_PLANNER_FILTER_VIEW,
    };
}

export function arePlannerFilterStatesEqual(a: PlannerFilterState, b: PlannerFilterState) {
    return a.listId === b.listId
        && a.planningStatusFilter === b.planningStatusFilter
        && a.deadlineScope === b.deadlineScope
        && a.defaultView === b.defaultView;
}

export function arePlannerFilterScopesEqual(a: PlannerFilterState, b: PlannerFilterState) {
    return a.listId === b.listId
        && a.planningStatusFilter === b.planningStatusFilter
        && a.deadlineScope === b.deadlineScope;
}

export function getPlannerPlanningStatusFilterLabel(value: PlannerPlanningStatusFilter) {
    return PLANNER_PLANNING_STATUS_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? "All planning";
}

export function getPlannerDeadlineScopeLabel(value: PlannerDeadlineScope) {
    return PLANNER_DEADLINE_SCOPE_OPTIONS.find((option) => option.value === value)?.label ?? "All deadlines";
}

function matchesPlannerDeadlineScope(task: PlannerFilterableTask, deadlineScope: PlannerDeadlineScope, preferredTimeZone?: string | null) {
    if (deadlineScope === "all") return true;
    if (deadlineScope === "no_deadline") return !hasTaskDeadline(task);
    if (!hasTaskDeadline(task)) return false;
    if (deadlineScope === "overdue") return isTaskOverdue(task as TodoRow, new Date(), preferredTimeZone);
    if (deadlineScope === "today") return isTaskDueToday(task as TodoRow, new Date(), preferredTimeZone);

    const deadlineDateKey = getTaskDeadlineDateKey(task, preferredTimeZone);
    if (!deadlineDateKey) return false;

    const todayDateKey = toDateKeyInTimeZone(new Date(), preferredTimeZone);
    const diffDays = differenceInCalendarDays(parseISO(`${deadlineDateKey}T00:00:00`), parseISO(`${todayDateKey}T00:00:00`));
    return diffDays >= 0 && diffDays <= 7;
}

function matchesPlannerPlanningStatus(task: PlannerFilterableTask, planningStatusFilter: PlannerPlanningStatusFilter) {
    if (planningStatusFilter === "all") return true;
    return (task.planning_status ?? "unplanned") === planningStatusFilter;
}

export function applyPlannerTaskFilters<T extends PlannerFilterableTask>(
    tasks: T[],
    filterState: PlannerFilterState,
    preferredTimeZone?: string | null,
) {
    return tasks.filter((task) => {
        if (task.is_done) return false;
        if (filterState.listId !== "all" && task.list_id !== filterState.listId) return false;
        if (!matchesPlannerPlanningStatus(task, filterState.planningStatusFilter)) return false;
        if (!matchesPlannerDeadlineScope(task, filterState.deadlineScope, preferredTimeZone)) return false;
        return true;
    });
}

