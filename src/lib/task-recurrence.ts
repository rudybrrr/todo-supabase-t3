import { addDays, addMonths, addWeeks, format, isWeekend, parseISO } from "date-fns";

import { resolveTaskDeadline } from "~/lib/task-deadlines";
import type { RecurrenceRule, TodoRow } from "~/lib/types";

export const RECURRENCE_RULE_OPTIONS: Array<{ label: string; value: RecurrenceRule }> = [
    { value: "daily", label: "Daily" },
    { value: "weekdays", label: "Weekdays" },
    { value: "weekly", label: "Weekly" },
    { value: "monthly", label: "Monthly" },
];

function advanceRecurringDate(date: Date, rule: RecurrenceRule) {
    if (rule === "daily") {
        return addDays(date, 1);
    }

    if (rule === "weekly") {
        return addWeeks(date, 1);
    }

    if (rule === "monthly") {
        return addMonths(date, 1);
    }

    let nextDate = addDays(date, 1);
    while (isWeekend(nextDate)) {
        nextDate = addDays(nextDate, 1);
    }
    return nextDate;
}

export function isRecurrenceRule(value: string | null | undefined): value is RecurrenceRule {
    return value === "daily" || value === "weekdays" || value === "weekly" || value === "monthly";
}

export function getRecurrenceLabel(rule: RecurrenceRule | null | undefined) {
    if (!rule) return "Does not repeat";

    return RECURRENCE_RULE_OPTIONS.find((option) => option.value === rule)?.label ?? "Repeats";
}

export function normalizeRecurrenceRule(value: string | null | undefined): RecurrenceRule | null {
    return isRecurrenceRule(value) ? value : null;
}

export function getNextRecurringDeadline(
    task: Pick<TodoRow, "deadline_at" | "deadline_on" | "due_date" | "recurrence_rule">,
    preferredTimeZone?: string | null,
) {
    const recurrenceRule = normalizeRecurrenceRule(task.recurrence_rule);
    if (!recurrenceRule) return null;

    const deadline = resolveTaskDeadline(task, preferredTimeZone);
    if (!deadline) return null;

    if (deadline.kind === "datetime" && deadline.dateTime) {
        return {
            due_date: null,
            deadline_on: null,
            deadline_at: advanceRecurringDate(new Date(deadline.dateTime), recurrenceRule).toISOString(),
        };
    }

    const nextDateKey = format(
        advanceRecurringDate(parseISO(`${deadline.dateKey}T00:00:00`), recurrenceRule),
        "yyyy-MM-dd",
    );

    return {
        due_date: null,
        deadline_on: nextDateKey,
        deadline_at: null,
    };
}

export function canTaskRecur(task: Pick<TodoRow, "deadline_at" | "deadline_on" | "due_date">) {
    return Boolean(resolveTaskDeadline(task));
}
