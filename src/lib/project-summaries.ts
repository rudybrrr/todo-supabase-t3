import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import {
    formatBlockTimeRange,
    getCurrentPlannedBlock,
    getNextPlannedBlock,
    toDateKey,
} from "~/lib/planning";
import { getTaskDeadlineDateKey, toDateKeyInTimeZone } from "~/lib/task-deadlines";
import type { PlannedFocusBlock, PlanningStatus, TodoList, TodoRow } from "~/lib/types";

export interface ProjectSummary {
    list: TodoList;
    totalCount: number;
    incompleteCount: number;
    completedCount: number;
    dueSoonCount: number;
    overdueCount: number;
    memberCount: number;
    partiallyPlannedCount: number;
    unplannedCount: number;
    nextScheduledBlock: PlannedFocusBlock | null;
}

type ProjectSummaryTask = TodoRow & {
    planning_status?: PlanningStatus;
};

function getDateKeyDistance(dateKey: string, comparisonDateKey: string) {
    return differenceInCalendarDays(parseISO(`${dateKey}T00:00:00`), parseISO(`${comparisonDateKey}T00:00:00`));
}

export function isProjectTaskDueSoon(task: TodoRow, timeZone?: string | null, now = new Date()) {
    if (task.is_done) return false;

    const deadlineDateKey = getTaskDeadlineDateKey(task, timeZone);
    if (!deadlineDateKey) return false;

    const todayDateKey = toDateKeyInTimeZone(now, timeZone);
    const diffDays = getDateKeyDistance(deadlineDateKey, todayDateKey);
    return diffDays >= 0 && diffDays <= 7;
}

export function isProjectTaskOverdue(task: TodoRow, timeZone?: string | null, now = new Date()) {
    if (task.is_done) return false;

    const deadlineDateKey = getTaskDeadlineDateKey(task, timeZone);
    if (!deadlineDateKey) return false;

    return deadlineDateKey < toDateKeyInTimeZone(now, timeZone);
}

export function buildProjectSummary(input: {
    list: TodoList;
    tasks: ProjectSummaryTask[];
    plannedBlocks: PlannedFocusBlock[];
    memberCount: number;
    timeZone?: string | null;
    now?: Date;
}): ProjectSummary {
    const now = input.now ?? new Date();
    const projectTasks = input.tasks.filter((task) => task.list_id === input.list.id);
    const openTasks = projectTasks.filter((task) => !task.is_done);
    const projectBlocks = input.plannedBlocks.filter((block) => block.list_id === input.list.id);

    return {
        list: input.list,
        totalCount: projectTasks.length,
        incompleteCount: openTasks.length,
        completedCount: projectTasks.length - openTasks.length,
        dueSoonCount: openTasks.filter((task) => isProjectTaskDueSoon(task, input.timeZone, now)).length,
        overdueCount: openTasks.filter((task) => isProjectTaskOverdue(task, input.timeZone, now)).length,
        memberCount: input.memberCount,
        partiallyPlannedCount: openTasks.filter((task) => task.planning_status === "partially_planned").length,
        unplannedCount: openTasks.filter((task) => (task.planning_status ?? "unplanned") === "unplanned").length,
        nextScheduledBlock: getCurrentPlannedBlock(projectBlocks, now) ?? getNextPlannedBlock(projectBlocks, now),
    };
}

export function getProjectScheduledBlockState(block: PlannedFocusBlock | null | undefined, now = new Date()) {
    if (!block) return null;

    const startTime = new Date(block.scheduled_start).getTime();
    const endTime = new Date(block.scheduled_end).getTime();
    const nowTime = now.getTime();

    if (startTime <= nowTime && endTime > nowTime) {
        return "current";
    }

    return "upcoming";
}

export function formatProjectScheduledLabel(block: PlannedFocusBlock | null | undefined, now = new Date()) {
    if (!block) return null;

    if (getProjectScheduledBlockState(block, now) === "current") {
        return `Now · ${formatBlockTimeRange(block.scheduled_start, block.scheduled_end)}`;
    }

    const startDate = new Date(block.scheduled_start);
    const startDateKey = toDateKey(startDate);
    const todayDateKey = toDateKey(now);
    const tomorrowDateKey = toDateKey(addDays(now, 1));

    const dayLabel = startDateKey === todayDateKey
        ? "Today"
        : startDateKey === tomorrowDateKey
            ? "Tomorrow"
            : format(startDate, "EEE, MMM d");

    return `${dayLabel} · ${formatBlockTimeRange(block.scheduled_start, block.scheduled_end)}`;
}
