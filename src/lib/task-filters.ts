import { differenceInCalendarDays, parseISO } from "date-fns";

import type { PlannerDeadlineScope, PlannerPlanningStatusFilter } from "~/lib/planner-filters";
import { getTaskDeadlineDateKey, hasTaskDeadline, toDateKeyInTimeZone } from "~/lib/task-deadlines";
import { isTaskDueToday, isTaskOverdue, type SmartView, type TaskPriority } from "~/lib/task-views";
import { normalizeTaskSavedViewLabelIds } from "~/lib/task-labels";
import type { TaskSavedViewRow, TodoRow } from "~/lib/types";

export type TaskPriorityFilter = "all" | "none" | TaskPriority;

export interface TaskViewFilterState {
    deadlineScope: PlannerDeadlineScope;
    labelIds: string[];
    listId: string;
    planningStatusFilter: PlannerPlanningStatusFilter;
    priorityFilter: TaskPriorityFilter;
    smartView: SmartView;
}

type TaskFilterableTask = Pick<TodoRow, "deadline_at" | "deadline_on" | "due_date" | "is_done" | "list_id" | "priority"> & {
    labels?: Array<{ id: string }>;
    planning_status?: PlannerPlanningStatusFilter;
};

const DEFAULT_TASK_FILTER_VIEW: SmartView = "today";
const VALID_TASK_PRIORITY_FILTERS = new Set<TaskPriorityFilter>(["all", "none", "high", "medium", "low"]);
const VALID_TASK_VIEWS = new Set<SmartView>(["today", "upcoming", "inbox", "done"]);
const VALID_TASK_DEADLINE_SCOPES = new Set<PlannerDeadlineScope>(["all", "due_soon", "no_deadline", "overdue", "today"]);
const VALID_TASK_PLANNING_STATUS_FILTERS = new Set<PlannerPlanningStatusFilter>(["all", "fully_planned", "overplanned", "partially_planned", "unplanned"]);

export const TASK_SAVED_VIEW_FIELDS =
    "id, user_id, name, smart_view, list_id, priority_filter, planning_status_filter, deadline_scope, label_ids, inserted_at, updated_at";

export const TASK_PRIORITY_FILTER_OPTIONS: Array<{ label: string; value: TaskPriorityFilter }> = [
    { value: "all", label: "All priority" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
    { value: "none", label: "No priority" },
];

export function isTaskPriorityFilter(value: string | null | undefined): value is TaskPriorityFilter {
    return VALID_TASK_PRIORITY_FILTERS.has(value as TaskPriorityFilter);
}

export function isTaskSavedViewSmartView(value: string | null | undefined): value is SmartView {
    return VALID_TASK_VIEWS.has(value as SmartView);
}

export function isTaskSavedViewDeadlineScope(value: string | null | undefined): value is PlannerDeadlineScope {
    return VALID_TASK_DEADLINE_SCOPES.has(value as PlannerDeadlineScope);
}

export function isTaskSavedViewPlanningStatusFilter(value: string | null | undefined): value is PlannerPlanningStatusFilter {
    return VALID_TASK_PLANNING_STATUS_FILTERS.has(value as PlannerPlanningStatusFilter);
}

export function createTaskViewFilterState(overrides?: Partial<TaskViewFilterState>): TaskViewFilterState {
    return {
        smartView: overrides?.smartView ?? DEFAULT_TASK_FILTER_VIEW,
        listId: overrides?.listId ?? "all",
        priorityFilter: overrides?.priorityFilter ?? "all",
        planningStatusFilter: overrides?.planningStatusFilter ?? "all",
        deadlineScope: overrides?.deadlineScope ?? "all",
        labelIds: normalizeTaskSavedViewLabelIds(overrides?.labelIds),
    };
}

export function taskSavedViewToState(view: Pick<TaskSavedViewRow, "smart_view" | "list_id" | "priority_filter" | "planning_status_filter" | "deadline_scope" | "label_ids">): TaskViewFilterState {
    return createTaskViewFilterState({
        smartView: view.smart_view,
        listId: view.list_id ?? "all",
        priorityFilter: view.priority_filter,
        planningStatusFilter: view.planning_status_filter,
        deadlineScope: view.deadline_scope,
        labelIds: view.label_ids,
    });
}

export function normalizeTaskSavedViewRow(row: TaskSavedViewRow): TaskSavedViewRow {
    return {
        ...row,
        list_id: row.list_id ?? null,
        smart_view: isTaskSavedViewSmartView(row.smart_view) ? row.smart_view : DEFAULT_TASK_FILTER_VIEW,
        priority_filter: isTaskPriorityFilter(row.priority_filter) ? row.priority_filter : "all",
        planning_status_filter: isTaskSavedViewPlanningStatusFilter(row.planning_status_filter)
            ? row.planning_status_filter
            : "all",
        deadline_scope: isTaskSavedViewDeadlineScope(row.deadline_scope) ? row.deadline_scope : "all",
        label_ids: normalizeTaskSavedViewLabelIds(row.label_ids),
    };
}

export function areTaskViewFilterStatesEqual(a: TaskViewFilterState, b: TaskViewFilterState) {
    return a.smartView === b.smartView
        && a.listId === b.listId
        && a.priorityFilter === b.priorityFilter
        && a.planningStatusFilter === b.planningStatusFilter
        && a.deadlineScope === b.deadlineScope
        && a.labelIds.length === b.labelIds.length
        && a.labelIds.every((labelId, index) => labelId === b.labelIds[index]);
}

export function areTaskViewFilterScopesEqual(a: TaskViewFilterState, b: TaskViewFilterState) {
    return a.listId === b.listId
        && a.priorityFilter === b.priorityFilter
        && a.planningStatusFilter === b.planningStatusFilter
        && a.deadlineScope === b.deadlineScope
        && a.labelIds.length === b.labelIds.length
        && a.labelIds.every((labelId, index) => labelId === b.labelIds[index]);
}

export function getTaskPriorityFilterLabel(value: TaskPriorityFilter) {
    return TASK_PRIORITY_FILTER_OPTIONS.find((option) => option.value === value)?.label ?? "All priority";
}

function matchesTaskDeadlineScope(task: TaskFilterableTask, deadlineScope: PlannerDeadlineScope, preferredTimeZone?: string | null) {
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

function matchesPlanningStatus(task: TaskFilterableTask, planningStatusFilter: PlannerPlanningStatusFilter) {
    if (planningStatusFilter === "all") return true;
    return (task.planning_status ?? "unplanned") === planningStatusFilter;
}

function matchesPriority(task: TaskFilterableTask, priorityFilter: TaskPriorityFilter) {
    if (priorityFilter === "all") return true;
    if (priorityFilter === "none") return !task.priority;
    return task.priority === priorityFilter;
}

function matchesLabels(task: TaskFilterableTask, labelIds: string[]) {
    if (labelIds.length === 0) return true;
    return (task.labels ?? []).some((label) => labelIds.includes(label.id));
}

export function applyTaskViewFilters<T extends TaskFilterableTask>(
    tasks: T[],
    filterState: TaskViewFilterState,
    preferredTimeZone?: string | null,
) {
    return tasks.filter((task) => {
        if (filterState.listId !== "all" && task.list_id !== filterState.listId) return false;
        if (!matchesPriority(task, filterState.priorityFilter)) return false;
        if (!matchesPlanningStatus(task, filterState.planningStatusFilter)) return false;
        if (!matchesTaskDeadlineScope(task, filterState.deadlineScope, preferredTimeZone)) return false;
        if (!matchesLabels(task, filterState.labelIds)) return false;
        return true;
    });
}
