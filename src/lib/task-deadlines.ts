import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";

import type { TodoRow } from "~/lib/types";

type DeadlineFields = Pick<TodoRow, "due_date" | "deadline_on" | "deadline_at">;

export interface ResolvedTaskDeadline {
    kind: "date" | "datetime";
    dateKey: string;
    dateTime: string | null;
    source: "deadline_on" | "deadline_at" | "due_date";
}

const dateKeyFormatterCache = new Map<string, Intl.DateTimeFormat>();
const timeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateKeyFormatter(timeZone: string) {
    const cacheKey = timeZone;
    const existing = dateKeyFormatterCache.get(cacheKey);
    if (existing) return existing;

    const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    dateKeyFormatterCache.set(cacheKey, formatter);
    return formatter;
}

function getTimeFormatter(timeZone: string) {
    const cacheKey = timeZone;
    const existing = timeFormatterCache.get(cacheKey);
    if (existing) return existing;

    const formatter = new Intl.DateTimeFormat(undefined, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
    });
    timeFormatterCache.set(cacheKey, formatter);
    return formatter;
}

function isDateInput(value: string) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toDateOnlyDate(dateKey: string) {
    return parseISO(`${dateKey}T00:00:00`);
}

export function isValidTimeZone(value?: string | null) {
    if (!value) return false;

    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

export function getBrowserTimeZone() {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(detected) ? detected : "UTC";
}

export function resolveTimeZone(preferred?: string | null): string {
    if (isValidTimeZone(preferred)) {
        return preferred!;
    }

    return getBrowserTimeZone();
}

export function toDateKeyInTimeZone(value: string | Date, preferredTimeZone?: string | null) {
    const date = value instanceof Date ? value : new Date(value);
    const timeZone = resolveTimeZone(preferredTimeZone);
    const parts = getDateKeyFormatter(timeZone).formatToParts(date);
    const partByType = new Map(parts.map((part) => [part.type, part.value]));

    const year = partByType.get("year");
    const month = partByType.get("month");
    const day = partByType.get("day");
    if (!year || !month || !day) {
        return format(date, "yyyy-MM-dd");
    }

    return `${year}-${month}-${day}`;
}

export function resolveTaskDeadline(task: DeadlineFields, preferredTimeZone?: string | null): ResolvedTaskDeadline | null {
    const timeZone = resolveTimeZone(preferredTimeZone);

    if (task.deadline_at) {
        return {
            kind: "datetime",
            dateKey: toDateKeyInTimeZone(task.deadline_at, timeZone),
            dateTime: task.deadline_at,
            source: "deadline_at",
        };
    }

    if (task.deadline_on) {
        return {
            kind: "date",
            dateKey: task.deadline_on,
            dateTime: null,
            source: "deadline_on",
        };
    }

    if (task.due_date) {
        return {
            kind: "date",
            dateKey: toDateKeyInTimeZone(task.due_date, timeZone),
            dateTime: null,
            source: "due_date",
        };
    }

    return null;
}

export function getTaskDeadlineDateKey(task: DeadlineFields, preferredTimeZone?: string | null) {
    return resolveTaskDeadline(task, preferredTimeZone)?.dateKey ?? null;
}

export function hasTaskDeadline(task: DeadlineFields) {
    return Boolean(task.deadline_at ?? task.deadline_on ?? task.due_date);
}

export function getDateInputValue(value?: DeadlineFields | string | null, preferredTimeZone?: string | null) {
    if (!value) return "";

    if (typeof value === "string") {
        if (isDateInput(value)) return value;
        return toDateKeyInTimeZone(value, preferredTimeZone);
    }

    return getTaskDeadlineDateKey(value, preferredTimeZone) ?? "";
}

export function buildTaskDeadlineMutation(dateInput?: string | null) {
    const normalized = dateInput?.trim() ?? "";
    if (!normalized) {
        return {
            due_date: null,
            deadline_on: null,
            deadline_at: null,
        };
    }

    return {
        due_date: null,
        deadline_on: normalized,
        deadline_at: null,
    };
}

function getDateKeyDiff(a: string, b: string) {
    return differenceInCalendarDays(toDateOnlyDate(a), toDateOnlyDate(b));
}

function formatDateKey(dateKey: string, formatString: string) {
    return format(toDateOnlyDate(dateKey), formatString);
}

function formatDeadlineTime(dateTime: string, preferredTimeZone?: string | null) {
    const timeZone = resolveTimeZone(preferredTimeZone);
    return getTimeFormatter(timeZone).format(new Date(dateTime));
}

export function isTaskOverdue(task: Pick<TodoRow, "is_done"> & DeadlineFields, now = new Date(), preferredTimeZone?: string | null) {
    if (task.is_done) return false;

    const deadline = resolveTaskDeadline(task, preferredTimeZone);
    if (!deadline) return false;

    if (deadline.kind === "datetime" && deadline.dateTime) {
        return new Date(deadline.dateTime).getTime() < now.getTime();
    }

    return deadline.dateKey < toDateKeyInTimeZone(now, preferredTimeZone);
}

export function isTaskDueToday(task: Pick<TodoRow, "is_done"> & DeadlineFields, now = new Date(), preferredTimeZone?: string | null) {
    if (task.is_done) return false;

    const deadline = resolveTaskDeadline(task, preferredTimeZone);
    if (!deadline) return false;

    return deadline.dateKey === toDateKeyInTimeZone(now, preferredTimeZone);
}

export function isTaskUpcoming(task: Pick<TodoRow, "is_done"> & DeadlineFields, now = new Date(), preferredTimeZone?: string | null) {
    if (task.is_done) return false;

    const deadline = resolveTaskDeadline(task, preferredTimeZone);
    if (!deadline) return false;

    return deadline.dateKey > toDateKeyInTimeZone(now, preferredTimeZone);
}

export function formatTaskDueLabel(task: DeadlineFields, now = new Date(), preferredTimeZone?: string | null) {
    const deadline = resolveTaskDeadline(task, preferredTimeZone);
    if (!deadline) return null;

    const todayKey = toDateKeyInTimeZone(now, preferredTimeZone);
    const tomorrowKey = toDateKeyInTimeZone(addDays(now, 1), preferredTimeZone);

    if (deadline.kind === "datetime" && deadline.dateTime) {
        const timeLabel = formatDeadlineTime(deadline.dateTime, preferredTimeZone);
        if (deadline.dateKey === todayKey) return `Today ${timeLabel}`;
        if (deadline.dateKey === tomorrowKey) return `Tomorrow ${timeLabel}`;

        const diff = getDateKeyDiff(deadline.dateKey, todayKey);
        if (diff < 0) return `${Math.abs(diff)}d overdue`;
        if (diff < 7) return `${formatDateKey(deadline.dateKey, "EEE")} ${timeLabel}`;
        return `${formatDateKey(deadline.dateKey, "MMM d")} ${timeLabel}`;
    }

    if (deadline.dateKey === todayKey) return "Today";
    if (deadline.dateKey === tomorrowKey) return "Tomorrow";

    const diff = getDateKeyDiff(deadline.dateKey, todayKey);
    if (diff < 0) return `${Math.abs(diff)}d overdue`;
    if (diff < 7) return formatDateKey(deadline.dateKey, "EEE");
    return formatDateKey(deadline.dateKey, "MMM d");
}
