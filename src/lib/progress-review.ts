import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from "date-fns";

import { formatMinutesCompact, getDurationMinutes, normalizePlannerWeekStartsOn, type PlannerWeekStartsOn } from "~/lib/planning";
import {
    buildTaskFocusSummaryMap,
    getTaskEstimateAccuracyStatus,
    getTaskEstimateVarianceMinutes,
    type TaskEstimateAccuracyStatus,
} from "~/lib/task-estimates";
import { formatTaskDueLabel, getTaskDeadlineDateKey, isTaskOverdue, toDateKeyInTimeZone } from "~/lib/task-deadlines";
import type { FocusSession, PlannedFocusBlock, PlanningStatus, TodoList, TodoRow } from "~/lib/types";

type ReviewTask = TodoRow & {
    planned_minutes?: number;
    planning_status?: PlanningStatus;
    remaining_estimated_minutes?: number | null;
};

export interface ProgressReviewWindow {
    dateKeys: string[];
    endDateKey: string;
    label: string;
    startDateKey: string;
}

export interface ProgressReviewTaskItem {
    dueLabel: string | null;
    isOverdue: boolean;
    listId: string;
    listName: string;
    planningStatus: PlanningStatus;
    remainingEstimatedMinutes: number | null;
    taskId: string;
    title: string;
}

export interface ProgressReviewProjectItem {
    actualFocusMinutes: number;
    completedCount: number;
    listId: string;
    listName: string;
    openCount: number;
    overdueCount: number;
    plannedMinutes: number;
    underplannedCount: number;
}

export interface ProgressReviewMeasuredTask {
    accuracyStatus: TaskEstimateAccuracyStatus;
    actualFocusMinutes: number;
    estimatedMinutes: number;
    focusSessionCount: number;
    listName: string;
    taskId: string;
    title: string;
    varianceMinutes: number;
}

export interface WeeklyProgressReview {
    actualFocusDeltaMinutes: number;
    actualFocusMinutes: number;
    carryoverRiskCount: number;
    completedCount: number;
    completedDelta: number;
    estimateAccuracyCounts: Record<TaskEstimateAccuracyStatus, number>;
    executionRate: number | null;
    measuredCompletedTasks: ProgressReviewMeasuredTask[];
    neglectedProjects: ProgressReviewProjectItem[];
    overdueCarryoverCount: number;
    plannedDeltaMinutes: number;
    plannedMinutes: number;
    projectMomentum: ProgressReviewProjectItem[];
    slippedTasks: ProgressReviewTaskItem[];
    underplannedCarryoverCount: number;
    window: ProgressReviewWindow;
}

function toDateOnly(dateKey: string) {
    return parseISO(`${dateKey}T00:00:00`);
}

function getWindowLabel(startDateKey: string, endDateKey: string) {
    const startDate = toDateOnly(startDateKey);
    const endDate = toDateOnly(endDateKey);

    const startLabel = format(startDate, "MMM d");
    const endLabel = startDateKey.slice(0, 7) === endDateKey.slice(0, 7)
        ? format(endDate, "d")
        : format(endDate, "MMM d");

    return `${startLabel} - ${endLabel}`;
}

function getProgressPlanningStatus(task: ReviewTask): PlanningStatus {
    return task.planning_status ?? "unplanned";
}

function getFocusMinutes(durationSeconds: number) {
    return Math.max(1, Math.round(durationSeconds / 60));
}

function isDateKeyWithinRange(dateKey: string | null | undefined, startDateKey: string, endDateKey: string) {
    if (!dateKey) return false;
    return dateKey >= startDateKey && dateKey <= endDateKey;
}

function getDateKeyRange(startDateKey: string, length: number) {
    return Array.from({ length }, (_, index) => {
        return format(addDays(toDateOnly(startDateKey), index), "yyyy-MM-dd");
    });
}

function getTaskReviewListName(task: ReviewTask, listNameById: ReadonlyMap<string, string>) {
    return listNameById.get(task.list_id) ?? "General";
}

function getWindowMetrics(input: {
    focusSessions: FocusSession[];
    plannedBlocks: PlannedFocusBlock[];
    tasks: ReviewTask[];
    timeZone?: string | null;
    window: ProgressReviewWindow;
}) {
    const focusSessionMinutes = input.focusSessions.reduce((total, session) => {
        if (session.mode !== "focus") return total;

        const sessionDateKey = toDateKeyInTimeZone(session.inserted_at, input.timeZone);
        if (!isDateKeyWithinRange(sessionDateKey, input.window.startDateKey, input.window.endDateKey)) {
            return total;
        }

        return total + getFocusMinutes(session.duration_seconds);
    }, 0);

    const plannedMinutes = input.plannedBlocks.reduce((total, block) => {
        const blockDateKey = toDateKeyInTimeZone(block.scheduled_start, input.timeZone);
        if (!isDateKeyWithinRange(blockDateKey, input.window.startDateKey, input.window.endDateKey)) {
            return total;
        }

        return total + getDurationMinutes(block.scheduled_start, block.scheduled_end);
    }, 0);

    const completedCount = input.tasks.reduce((total, task) => {
        const completedDateKey = task.completed_at
            ? toDateKeyInTimeZone(task.completed_at, input.timeZone)
            : null;
        return total + Number(isDateKeyWithinRange(completedDateKey, input.window.startDateKey, input.window.endDateKey));
    }, 0);

    return {
        actualFocusMinutes: focusSessionMinutes,
        completedCount,
        plannedMinutes,
    };
}

export function getProgressWeekWindow(
    preferredTimeZone?: string | null,
    now = new Date(),
    weekStartsOn: PlannerWeekStartsOn = 1,
): ProgressReviewWindow {
    const todayDateKey = toDateKeyInTimeZone(now, preferredTimeZone);
    const todayDate = toDateOnly(todayDateKey);
    const startDate = startOfWeek(todayDate, { weekStartsOn: normalizePlannerWeekStartsOn(weekStartsOn) });
    const startDateKey = format(startDate, "yyyy-MM-dd");
    const dateKeys = getDateKeyRange(startDateKey, 7);
    const endDateKey = dateKeys[dateKeys.length - 1] ?? startDateKey;

    return {
        dateKeys,
        endDateKey,
        label: getWindowLabel(startDateKey, endDateKey),
        startDateKey,
    };
}

export function buildWeeklyProgressReview(input: {
    focusSessions: FocusSession[];
    lists: TodoList[];
    now?: Date;
    plannedBlocks: PlannedFocusBlock[];
    tasks: ReviewTask[];
    timeZone?: string | null;
    weekStartsOn?: PlannerWeekStartsOn;
}): WeeklyProgressReview {
    const now = input.now ?? new Date();
    const timeZone = input.timeZone ?? null;
    const weekStartsOn = normalizePlannerWeekStartsOn(input.weekStartsOn);
    const currentWindow = getProgressWeekWindow(timeZone, now, weekStartsOn);
    const previousStartDateKey = format(addDays(toDateOnly(currentWindow.startDateKey), -7), "yyyy-MM-dd");
    const previousWindow: ProgressReviewWindow = {
        dateKeys: getDateKeyRange(previousStartDateKey, 7),
        endDateKey: format(addDays(toDateOnly(previousStartDateKey), 6), "yyyy-MM-dd"),
        label: getWindowLabel(previousStartDateKey, format(addDays(toDateOnly(previousStartDateKey), 6), "yyyy-MM-dd")),
        startDateKey: previousStartDateKey,
    };
    const todayDateKey = toDateKeyInTimeZone(now, timeZone);
    const cutoffDateKey = currentWindow.endDateKey < todayDateKey ? currentWindow.endDateKey : todayDateKey;
    const listNameById = new Map(input.lists.map((list) => [list.id, list.name]));

    const currentMetrics = getWindowMetrics({
        focusSessions: input.focusSessions,
        plannedBlocks: input.plannedBlocks,
        tasks: input.tasks,
        timeZone,
        window: currentWindow,
    });
    const previousMetrics = getWindowMetrics({
        focusSessions: input.focusSessions,
        plannedBlocks: input.plannedBlocks,
        tasks: input.tasks,
        timeZone,
        window: previousWindow,
    });

    const focusSummaryByTaskId = buildTaskFocusSummaryMap(input.focusSessions);
    const allMeasuredCompletedTasks = input.tasks
        .flatMap((task) => {
            const completedDateKey = task.completed_at
                ? toDateKeyInTimeZone(task.completed_at, timeZone)
                : null;
            if (!isDateKeyWithinRange(completedDateKey, currentWindow.startDateKey, currentWindow.endDateKey)) {
                return [];
            }

            const estimatedMinutes = task.estimated_minutes;
            const focusSummary = focusSummaryByTaskId.get(task.id);
            if (!estimatedMinutes || !focusSummary) return [];

            const accuracyStatus = getTaskEstimateAccuracyStatus(estimatedMinutes, focusSummary.actualFocusMinutes);
            if (!accuracyStatus) return [];

            return [{
                accuracyStatus,
                actualFocusMinutes: focusSummary.actualFocusMinutes,
                estimatedMinutes,
                focusSessionCount: focusSummary.focusSessionCount,
                listName: getTaskReviewListName(task, listNameById),
                taskId: task.id,
                title: task.title,
                varianceMinutes: getTaskEstimateVarianceMinutes(estimatedMinutes, focusSummary.actualFocusMinutes) ?? 0,
            } satisfies ProgressReviewMeasuredTask];
        })
        .sort((a, b) => Math.abs(b.varianceMinutes) - Math.abs(a.varianceMinutes));

    const estimateAccuracyCounts = allMeasuredCompletedTasks.reduce<Record<TaskEstimateAccuracyStatus, number>>((counts, task) => {
        counts[task.accuracyStatus] += 1;
        return counts;
    }, {
        underestimated: 0,
        on_track: 0,
        overestimated: 0,
    });
    const measuredCompletedTasks = allMeasuredCompletedTasks.slice(0, 5);

    const slippedTasks = input.tasks
        .filter((task) => {
            if (task.is_done) return false;

            const deadlineDateKey = getTaskDeadlineDateKey(task, timeZone);
            if (!deadlineDateKey) return false;
            return deadlineDateKey <= cutoffDateKey;
        })
        .sort((a, b) => {
            const overdueDelta = Number(isTaskOverdue(b, now, timeZone)) - Number(isTaskOverdue(a, now, timeZone));
            if (overdueDelta !== 0) return overdueDelta;

            const planningDelta = Number(getProgressPlanningStatus(a) === "fully_planned" || getProgressPlanningStatus(a) === "overplanned")
                - Number(getProgressPlanningStatus(b) === "fully_planned" || getProgressPlanningStatus(b) === "overplanned");
            if (planningDelta !== 0) return planningDelta;

            const deadlineA = getTaskDeadlineDateKey(a, timeZone) ?? "";
            const deadlineB = getTaskDeadlineDateKey(b, timeZone) ?? "";
            const deadlineComparison = deadlineA.localeCompare(deadlineB);
            if (deadlineComparison !== 0) return deadlineComparison;

            return a.title.localeCompare(b.title);
        })
        .slice(0, 5)
        .map((task) => ({
            dueLabel: formatTaskDueLabel(task, now, timeZone),
            isOverdue: isTaskOverdue(task, now, timeZone),
            listId: task.list_id,
            listName: getTaskReviewListName(task, listNameById),
            planningStatus: getProgressPlanningStatus(task),
            remainingEstimatedMinutes: task.remaining_estimated_minutes ?? null,
            taskId: task.id,
            title: task.title,
        }));

    const projectSummaries = input.lists.map((list) => {
        const projectTasks = input.tasks.filter((task) => task.list_id === list.id);
        const openTasks = projectTasks.filter((task) => !task.is_done);
        const currentProjectFocusMinutes = input.focusSessions.reduce((total, session) => {
            if (session.mode !== "focus" || session.list_id !== list.id) return total;

            const sessionDateKey = toDateKeyInTimeZone(session.inserted_at, timeZone);
            if (!isDateKeyWithinRange(sessionDateKey, currentWindow.startDateKey, currentWindow.endDateKey)) {
                return total;
            }

            return total + getFocusMinutes(session.duration_seconds);
        }, 0);
        const currentProjectPlannedMinutes = input.plannedBlocks.reduce((total, block) => {
            if (block.list_id !== list.id) return total;

            const blockDateKey = toDateKeyInTimeZone(block.scheduled_start, timeZone);
            if (!isDateKeyWithinRange(blockDateKey, currentWindow.startDateKey, currentWindow.endDateKey)) {
                return total;
            }

            return total + getDurationMinutes(block.scheduled_start, block.scheduled_end);
        }, 0);
        const currentProjectCompletedCount = projectTasks.reduce((total, task) => {
            const completedDateKey = task.completed_at
                ? toDateKeyInTimeZone(task.completed_at, timeZone)
                : null;
            return total + Number(isDateKeyWithinRange(completedDateKey, currentWindow.startDateKey, currentWindow.endDateKey));
        }, 0);
        const overdueCount = openTasks.filter((task) => isTaskOverdue(task, now, timeZone)).length;
        const underplannedCount = openTasks.filter((task) => {
            const deadlineDateKey = getTaskDeadlineDateKey(task, timeZone);
            if (!deadlineDateKey) return false;
            if (deadlineDateKey > currentWindow.endDateKey) return false;
            const planningStatus = getProgressPlanningStatus(task);
            return planningStatus === "unplanned" || planningStatus === "partially_planned";
        }).length;

        return {
            actualFocusMinutes: currentProjectFocusMinutes,
            completedCount: currentProjectCompletedCount,
            listId: list.id,
            listName: list.name,
            openCount: openTasks.length,
            overdueCount,
            plannedMinutes: currentProjectPlannedMinutes,
            underplannedCount,
        } satisfies ProgressReviewProjectItem;
    });

    const neglectedProjects = projectSummaries
        .filter((project) => project.openCount > 0 && project.actualFocusMinutes === 0 && project.completedCount === 0)
        .sort((a, b) => {
            const overdueDelta = b.overdueCount - a.overdueCount;
            if (overdueDelta !== 0) return overdueDelta;

            const underplannedDelta = b.underplannedCount - a.underplannedCount;
            if (underplannedDelta !== 0) return underplannedDelta;

            return b.openCount - a.openCount;
        })
        .slice(0, 5);

    const projectMomentum = projectSummaries
        .filter((project) => project.actualFocusMinutes > 0 || project.completedCount > 0 || project.plannedMinutes > 0)
        .sort((a, b) => {
            const completedDelta = b.completedCount - a.completedCount;
            if (completedDelta !== 0) return completedDelta;

            const focusDelta = b.actualFocusMinutes - a.actualFocusMinutes;
            if (focusDelta !== 0) return focusDelta;

            return b.plannedMinutes - a.plannedMinutes;
        })
        .slice(0, 5);

    const overdueCarryoverCount = input.tasks.filter((task) => !task.is_done && isTaskOverdue(task, now, timeZone)).length;
    const underplannedCarryoverCount = input.tasks.filter((task) => {
        if (task.is_done) return false;

        const deadlineDateKey = getTaskDeadlineDateKey(task, timeZone);
        if (!deadlineDateKey) return false;
        if (deadlineDateKey > currentWindow.endDateKey) return false;

        const planningStatus = getProgressPlanningStatus(task);
        return planningStatus === "unplanned" || planningStatus === "partially_planned";
    }).length;
    const carryoverRiskCount = input.tasks.filter((task) => {
        if (task.is_done) return false;

        const deadlineDateKey = getTaskDeadlineDateKey(task, timeZone);
        if (!deadlineDateKey) return false;

        const planningStatus = getProgressPlanningStatus(task);
        const planningRisk = deadlineDateKey <= currentWindow.endDateKey
            && (planningStatus === "unplanned" || planningStatus === "partially_planned");

        return isTaskOverdue(task, now, timeZone) || planningRisk;
    }).length;

    return {
        actualFocusDeltaMinutes: currentMetrics.actualFocusMinutes - previousMetrics.actualFocusMinutes,
        actualFocusMinutes: currentMetrics.actualFocusMinutes,
        carryoverRiskCount,
        completedCount: currentMetrics.completedCount,
        completedDelta: currentMetrics.completedCount - previousMetrics.completedCount,
        estimateAccuracyCounts,
        executionRate: currentMetrics.plannedMinutes > 0
            ? currentMetrics.actualFocusMinutes / currentMetrics.plannedMinutes
            : null,
        measuredCompletedTasks,
        neglectedProjects,
        overdueCarryoverCount,
        plannedDeltaMinutes: currentMetrics.plannedMinutes - previousMetrics.plannedMinutes,
        plannedMinutes: currentMetrics.plannedMinutes,
        projectMomentum,
        slippedTasks,
        underplannedCarryoverCount,
        window: currentWindow,
    };
}

export function formatProgressMinuteDelta(deltaMinutes: number) {
    if (deltaMinutes === 0) return "Flat vs last week";

    const absoluteLabel = formatMinutesCompact(Math.abs(deltaMinutes));
    return `${deltaMinutes > 0 ? "+" : "-"}${absoluteLabel} vs last week`;
}

export function formatProgressCountDelta(delta: number, noun: string) {
    if (delta === 0) return `Flat vs last week`;
    return `${delta > 0 ? "+" : ""}${delta} ${noun} vs last week`;
}

export function getProgressExecutionLabel(executionRate: number | null) {
    if (executionRate == null) return "No planned time this week";

    const roundedPercent = Math.round(executionRate * 100);
    if (roundedPercent >= 100) return `${roundedPercent}% of planned time`;
    return `${roundedPercent}% of planned time`;
}

export function getProgressProjectStatusLabel(project: ProgressReviewProjectItem) {
    if (project.completedCount > 0) {
        return `${project.completedCount} completed`;
    }

    if (project.actualFocusMinutes > 0) {
        return `${formatMinutesCompact(project.actualFocusMinutes)} focused`;
    }

    if (project.overdueCount > 0) {
        return `${project.overdueCount} overdue`;
    }

    return `${project.openCount} open`;
}

export function getProgressWeekDistance(dateKey: string, comparisonDateKey: string) {
    return differenceInCalendarDays(toDateOnly(dateKey), toDateOnly(comparisonDateKey));
}
