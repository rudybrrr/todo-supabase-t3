import { differenceInCalendarDays, format, isToday, isTomorrow, startOfDay } from "date-fns";

import type { TodoRow } from "~/lib/types";

export type SmartView = "today" | "upcoming" | "inbox" | "done";
export type TaskPriority = NonNullable<TodoRow["priority"]>;

export interface TaskRecord extends TodoRow {
    has_planned_block?: boolean;
}

const PRIORITY_SCORE: Record<TaskPriority, number> = {
    high: 3,
    medium: 2,
    low: 1,
};

function getPriorityScore(priority?: TodoRow["priority"]) {
    if (!priority) return 0;
    return PRIORITY_SCORE[priority] ?? 0;
}

function getComparableDueDate(task: TodoRow) {
    return task.due_date ? startOfDay(new Date(task.due_date)) : null;
}

function compareNullableNumber(a: number | null | undefined, b: number | null | undefined) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    return a - b;
}

function compareNullableDate(a: Date | null, b: Date | null) {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.getTime() - b.getTime();
}

export function compareDeterministicTasks(a: TodoRow, b: TodoRow) {
    const dueComparison = compareNullableDate(getComparableDueDate(a), getComparableDueDate(b));
    if (dueComparison !== 0) return dueComparison;

    const estimateComparison = compareNullableNumber(a.estimated_minutes, b.estimated_minutes);
    if (estimateComparison !== 0) return estimateComparison;

    const insertedComparison = (a.inserted_at ?? "").localeCompare(b.inserted_at ?? "");
    if (insertedComparison !== 0) return insertedComparison;

    return a.id.localeCompare(b.id);
}

export function comparePriorityDescending(a: TodoRow, b: TodoRow) {
    const priorityDelta = getPriorityScore(b.priority) - getPriorityScore(a.priority);
    if (priorityDelta !== 0) return priorityDelta;
    return compareDeterministicTasks(a, b);
}

export function getDateInputValue(dateIso?: string | null) {
    if (!dateIso) return "";
    return format(new Date(dateIso), "yyyy-MM-dd");
}

export function toStoredDueDate(dateInput?: string | null) {
    if (!dateInput) return null;
    return new Date(`${dateInput}T12:00:00`).toISOString();
}

export function isTaskOverdue(task: TodoRow, now = new Date()) {
    if (task.is_done || !task.due_date) return false;
    return differenceInCalendarDays(new Date(task.due_date), startOfDay(now)) < 0;
}

export function isTaskDueToday(task: TodoRow, now = new Date()) {
    if (task.is_done || !task.due_date) return false;
    return differenceInCalendarDays(new Date(task.due_date), startOfDay(now)) === 0;
}

export function isTaskUpcoming(task: TodoRow, now = new Date()) {
    if (task.is_done || !task.due_date) return false;
    return differenceInCalendarDays(new Date(task.due_date), startOfDay(now)) > 0;
}

export function isInboxTask(task: TaskRecord) {
    return !task.is_done && !task.due_date && !task.has_planned_block;
}

export function getSmartViewTasks<T extends TaskRecord>(tasks: T[], view: SmartView, now = new Date()): T[] {
    const incomplete = tasks.filter((task) => !task.is_done);

    if (view === "today") {
        return incomplete
            .filter((task) => isTaskOverdue(task, now) || isTaskDueToday(task, now))
            .sort((a, b) => {
                const overdueDelta = Number(isTaskOverdue(b, now)) - Number(isTaskOverdue(a, now));
                if (overdueDelta !== 0) return overdueDelta;
                return comparePriorityDescending(a, b);
            });
    }

    if (view === "upcoming") {
        return incomplete
            .filter((task) => isTaskUpcoming(task, now))
            .sort(compareDeterministicTasks);
    }

    if (view === "inbox") {
        return incomplete
            .filter((task) => isInboxTask(task))
            .sort((a, b) => {
                const estimateComparison = compareNullableNumber(a.estimated_minutes, b.estimated_minutes);
                if (estimateComparison !== 0) return estimateComparison;
                return compareDeterministicTasks(a, b);
            });
    }

    return tasks
        .filter((task) => task.is_done)
        .sort((a, b) => {
            const completedComparison = (b.completed_at ?? "").localeCompare(a.completed_at ?? "");
            if (completedComparison !== 0) return completedComparison;
            return compareDeterministicTasks(a, b);
        });
}

export function selectNextUpTask<T extends TaskRecord>(tasks: T[], now = new Date()): T | null {
    const incomplete = tasks.filter((task) => !task.is_done);
    if (incomplete.length === 0) return null;

    const overdue = incomplete
        .filter((task) => isTaskOverdue(task, now))
        .sort(comparePriorityDescending);
    if (overdue[0]) return overdue[0];

    const today = incomplete
        .filter((task) => isTaskDueToday(task, now))
        .sort(comparePriorityDescending);
    if (today[0]) return today[0];

    const upcomingHigh = incomplete
        .filter((task) => task.priority === "high" && isTaskUpcoming(task, now))
        .sort(compareDeterministicTasks);
    if (upcomingHigh[0]) return upcomingHigh[0];

    const inbox = incomplete
        .filter((task) => isInboxTask(task))
        .sort((a, b) => {
            const estimateComparison = compareNullableNumber(a.estimated_minutes, b.estimated_minutes);
            if (estimateComparison !== 0) return estimateComparison;
            return compareDeterministicTasks(a, b);
        });
    if (inbox[0]) return inbox[0];

    return [...incomplete].sort((a, b) => {
        const insertedComparison = (a.inserted_at ?? "").localeCompare(b.inserted_at ?? "");
        if (insertedComparison !== 0) return insertedComparison;
        return compareDeterministicTasks(a, b);
    })[0] ?? null;
}

export function formatTaskDueLabel(task: TodoRow) {
    if (!task.due_date) return null;

    const dueDate = new Date(task.due_date);
    if (isToday(dueDate)) return "Today";
    if (isTomorrow(dueDate)) return "Tomorrow";

    const diff = differenceInCalendarDays(dueDate, new Date());
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff < 7) return format(dueDate, "EEE");
    return format(dueDate, "MMM d");
}

export function taskMatchesSearch(task: TodoRow, query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return true;

    const haystack = [
        task.title,
        task.description ?? "",
        task.priority ?? "",
    ]
        .join(" ")
        .toLowerCase();

    return haystack.includes(normalized);
}
