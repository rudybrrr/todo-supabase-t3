import { describe, expect, test } from "vitest";

import {
    DATE_ONLY_REMINDER_ANCHOR_HOUR,
    buildTaskReminderMutation,
    getReminderOffsetLabel,
    getTaskReminderAt,
} from "~/lib/task-reminders";

describe("task-reminders", () => {
    test("anchors date-only reminders at 9am in the user's timezone", () => {
        expect(DATE_ONLY_REMINDER_ANCHOR_HOUR).toBe(9);
        expect(getTaskReminderAt({
            due_date: null,
            deadline_on: "2026-04-11",
            deadline_at: null,
        }, 0, "Asia/Singapore")).toBe("2026-04-11T01:00:00.000Z");
    });

    test("offsets date-only reminders from the local anchor time", () => {
        expect(getTaskReminderAt({
            due_date: null,
            deadline_on: "2026-04-11",
            deadline_at: null,
        }, 1440, "Asia/Singapore")).toBe("2026-04-10T01:00:00.000Z");
    });

    test("offsets timed reminders directly from deadline_at", () => {
        expect(getTaskReminderAt({
            due_date: null,
            deadline_on: null,
            deadline_at: "2026-04-11T10:00:00.000Z",
        }, 60, "UTC")).toBe("2026-04-11T09:00:00.000Z");
    });

    test("clears invalid reminder values", () => {
        expect(buildTaskReminderMutation({
            due_date: null,
            deadline_on: "2026-04-11",
            deadline_at: null,
        }, -15, "UTC")).toEqual({
            reminder_offset_minutes: null,
            reminder_at: null,
        });
    });

    test("formats non-preset reminder offsets into human labels", () => {
        expect(getReminderOffsetLabel(2880)).toBe("2d before");
    });
});
