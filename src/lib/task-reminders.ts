import { resolveTaskDeadline, resolveTimeZone, toDateKeyInTimeZone, toUtcIsoForDateKeyAtLocalTime } from "~/lib/task-deadlines";
import type { TodoRow } from "~/lib/types";

type ReminderFields = Pick<TodoRow, "due_date" | "deadline_on" | "deadline_at" | "reminder_offset_minutes" | "reminder_at">;
type ReminderDeadlineFields = Pick<TodoRow, "due_date" | "deadline_on" | "deadline_at">;

export const DATE_ONLY_REMINDER_ANCHOR_HOUR = 9;
export const REMINDER_OFFSET_OPTIONS = [
    { value: 0, label: "At deadline" },
    { value: 15, label: "15m before" },
    { value: 30, label: "30m before" },
    { value: 60, label: "1h before" },
    { value: 1440, label: "1 day before" },
] as const;

const zonedDateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();
const zonedTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getZonedDateTimeFormatter(timeZone: string) {
    const cacheKey = timeZone;
    const existing = zonedDateTimeFormatterCache.get(cacheKey);
    if (existing) return existing;

    const formatter = new Intl.DateTimeFormat(undefined, {
        timeZone,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
    zonedDateTimeFormatterCache.set(cacheKey, formatter);
    return formatter;
}

function getZonedTimeFormatter(timeZone: string) {
    const cacheKey = timeZone;
    const existing = zonedTimeFormatterCache.get(cacheKey);
    if (existing) return existing;

    const formatter = new Intl.DateTimeFormat(undefined, {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
    });
    zonedTimeFormatterCache.set(cacheKey, formatter);
    return formatter;
}

export function normalizeReminderOffsetMinutes(value: unknown): number | null {
    if (typeof value !== "number" || !Number.isFinite(value)) return null;

    const normalized = Math.trunc(value);
    if (normalized < 0) return null;
    return normalized;
}

export function getReminderOffsetLabel(reminderOffsetMinutes: number | null | undefined) {
    const normalized = normalizeReminderOffsetMinutes(reminderOffsetMinutes);
    if (normalized == null) return "No reminder";
    if (normalized === 0) return "At deadline";

    const preset = REMINDER_OFFSET_OPTIONS.find((option) => option.value === normalized);
    if (preset) return preset.label;

    if (normalized % 1440 === 0) {
        const days = normalized / 1440;
        return `${days}d before`;
    }

    if (normalized % 60 === 0) {
        const hours = normalized / 60;
        return `${hours}h before`;
    }

    return `${normalized}m before`;
}

export function getTaskReminderAt(
    task: ReminderDeadlineFields,
    reminderOffsetMinutes: number | null | undefined,
    preferredTimeZone?: string | null,
) {
    const normalizedReminderOffset = normalizeReminderOffsetMinutes(reminderOffsetMinutes);
    if (normalizedReminderOffset == null) return null;

    const deadline = resolveTaskDeadline(task, preferredTimeZone);
    if (!deadline) return null;

    if (deadline.kind === "datetime" && deadline.dateTime) {
        return new Date(new Date(deadline.dateTime).getTime() - normalizedReminderOffset * 60_000).toISOString();
    }

    const anchoredDateTime = toUtcIsoForDateKeyAtLocalTime(
        deadline.dateKey,
        DATE_ONLY_REMINDER_ANCHOR_HOUR,
        0,
        preferredTimeZone,
    );
    if (!anchoredDateTime) return null;

    return new Date(new Date(anchoredDateTime).getTime() - normalizedReminderOffset * 60_000).toISOString();
}

export function buildTaskReminderMutation(
    task: ReminderDeadlineFields,
    reminderOffsetMinutes: number | null | undefined,
    preferredTimeZone?: string | null,
) {
    const normalizedReminderOffset = normalizeReminderOffsetMinutes(reminderOffsetMinutes);

    return {
        reminder_offset_minutes: normalizedReminderOffset,
        reminder_at: getTaskReminderAt(task, normalizedReminderOffset, preferredTimeZone),
    };
}

export function hasTaskReminder(task: ReminderFields) {
    return normalizeReminderOffsetMinutes(task.reminder_offset_minutes) != null && Boolean(task.reminder_at);
}

export function formatTaskReminderScheduledLabel(reminderAt: string | null | undefined, preferredTimeZone?: string | null) {
    if (!reminderAt) return null;

    const reminderDate = new Date(reminderAt);
    if (Number.isNaN(reminderDate.getTime())) return null;

    const timeZone = resolveTimeZone(preferredTimeZone);
    const reminderDateKey = toDateKeyInTimeZone(reminderDate, timeZone);
    const todayDateKey = toDateKeyInTimeZone(new Date(), timeZone);

    if (reminderDateKey === todayDateKey) {
        return `Today ${getZonedTimeFormatter(timeZone).format(reminderDate)}`;
    }

    return getZonedDateTimeFormatter(timeZone).format(reminderDate);
}

export function getReminderOffsetInputValue(reminderOffsetMinutes: number | null | undefined) {
    const normalized = normalizeReminderOffsetMinutes(reminderOffsetMinutes);
    return normalized == null ? "" : String(normalized);
}

export function getReminderOffsetMinutesFromInput(value: string | null | undefined) {
    if (!value) return null;
    return normalizeReminderOffsetMinutes(Number.parseInt(value, 10));
}
