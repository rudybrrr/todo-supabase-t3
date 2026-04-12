import { describe, expect, test } from "vitest";

import {
    buildTaskDeadlineMutation,
    formatTaskDueLabel,
    getTimeInputValue,
    isTaskOverdue,
    resolveTaskDeadline,
} from "~/lib/task-deadlines";

describe("task-deadlines", () => {
    test("keeps date-only deadlines on the same calendar day across time zones", () => {
        expect(resolveTaskDeadline({
            due_date: null,
            deadline_on: "2026-04-11",
            deadline_at: null,
        }, "America/Los_Angeles")).toEqual({
            kind: "date",
            dateKey: "2026-04-11",
            dateTime: null,
            source: "deadline_on",
        });
    });

    test("maps legacy due_date values through the preferred timezone", () => {
        expect(resolveTaskDeadline({
            due_date: "2026-04-11T00:30:00.000Z",
            deadline_on: null,
            deadline_at: null,
        }, "America/Los_Angeles")).toEqual({
            kind: "date",
            dateKey: "2026-04-10",
            dateTime: null,
            source: "due_date",
        });
    });

    test("treats date-only deadlines as overdue only after the local day ends", () => {
        const task = {
            is_done: false,
            due_date: null,
            deadline_on: "2026-04-11",
            deadline_at: null,
        };

        expect(isTaskOverdue(task, new Date("2026-04-11T15:00:00.000Z"), "Asia/Singapore")).toBe(false);
        expect(isTaskOverdue(task, new Date("2026-04-11T16:30:00.000Z"), "Asia/Singapore")).toBe(true);
    });

    test("builds date-only deadline mutations and clears legacy fields", () => {
        expect(buildTaskDeadlineMutation("2026-04-11")).toEqual({
            due_date: null,
            deadline_on: "2026-04-11",
            deadline_at: null,
        });

        expect(buildTaskDeadlineMutation("")).toEqual({
            due_date: null,
            deadline_on: null,
            deadline_at: null,
        });
    });

    test("builds timed deadline mutations in the preferred timezone", () => {
        expect(buildTaskDeadlineMutation("2026-04-11", "16:30", "Asia/Singapore")).toEqual({
            due_date: null,
            deadline_on: null,
            deadline_at: "2026-04-11T08:30:00.000Z",
        });
    });

    test("extracts time input values from timed deadlines", () => {
        expect(getTimeInputValue({
            due_date: null,
            deadline_on: null,
            deadline_at: "2026-04-11T08:30:00.000Z",
        }, "Asia/Singapore")).toBe("16:30");
    });

    test("formats overdue date-only deadlines without time labels", () => {
        expect(formatTaskDueLabel({
            due_date: null,
            deadline_on: "2026-04-10",
            deadline_at: null,
        }, new Date("2026-04-11T00:00:00.000Z"), "UTC")).toBe("1d overdue");
    });
});
