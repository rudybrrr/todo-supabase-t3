import { describe, expect, test } from "vitest";

import {
    canTaskRecur,
    getNextRecurringDeadline,
    normalizeRecurrenceRule,
} from "~/lib/task-recurrence";

describe("task-recurrence", () => {
    test("advances weekday deadlines from friday to monday", () => {
        expect(getNextRecurringDeadline({
            due_date: null,
            deadline_on: "2026-04-10",
            deadline_at: null,
            recurrence_rule: "weekdays",
        }, "UTC")).toEqual({
            due_date: null,
            deadline_on: "2026-04-13",
            deadline_at: null,
        });
    });

    test("advances monthly deadlines from end-of-month anchors", () => {
        expect(getNextRecurringDeadline({
            due_date: null,
            deadline_on: "2026-01-31",
            deadline_at: null,
            recurrence_rule: "monthly",
        }, "UTC")).toEqual({
            due_date: null,
            deadline_on: "2026-02-28",
            deadline_at: null,
        });
    });

    test("advances recurring datetime deadlines without shifting the time", () => {
        expect(getNextRecurringDeadline({
            due_date: null,
            deadline_on: null,
            deadline_at: "2026-04-11T10:15:00.000Z",
            recurrence_rule: "weekly",
        }, "UTC")).toEqual({
            due_date: null,
            deadline_on: null,
            deadline_at: "2026-04-18T10:15:00.000Z",
        });
    });

    test("rejects invalid recurrence rules and tasks without deadlines", () => {
        expect(normalizeRecurrenceRule("yearly")).toBeNull();
        expect(canTaskRecur({
            due_date: null,
            deadline_on: "2026-04-11",
            deadline_at: null,
        })).toBe(true);
        expect(canTaskRecur({
            due_date: null,
            deadline_on: null,
            deadline_at: null,
        })).toBe(false);
        expect(getNextRecurringDeadline({
            due_date: null,
            deadline_on: null,
            deadline_at: null,
            recurrence_rule: "daily",
        }, "UTC")).toBeNull();
    });
});
