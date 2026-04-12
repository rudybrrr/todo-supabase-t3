import { describe, expect, test } from "vitest";

import { buildWeeklyProgressReview, getProgressWeekWindow } from "~/lib/progress-review";
import type { FocusSession, PlannedFocusBlock, TodoList, TodoRow } from "~/lib/types";

const LISTS: TodoList[] = [
    {
        id: "list-a",
        name: "Math",
        owner_id: "user-1",
    },
    {
        id: "list-b",
        name: "Inbox",
        owner_id: "user-1",
    },
];

describe("progress-review", () => {
    test("builds Monday-based weekly review windows in the preferred timezone", () => {
        expect(getProgressWeekWindow("Asia/Singapore", new Date("2026-04-15T04:00:00.000Z"))).toEqual({
            dateKeys: [
                "2026-04-13",
                "2026-04-14",
                "2026-04-15",
                "2026-04-16",
                "2026-04-17",
                "2026-04-18",
                "2026-04-19",
            ],
            endDateKey: "2026-04-19",
            label: "Apr 13 - 19",
            startDateKey: "2026-04-13",
        });
    });

    test("respects Sunday-based review windows when configured", () => {
        expect(getProgressWeekWindow("Asia/Singapore", new Date("2026-04-15T04:00:00.000Z"), 0)).toEqual({
            dateKeys: [
                "2026-04-12",
                "2026-04-13",
                "2026-04-14",
                "2026-04-15",
                "2026-04-16",
                "2026-04-17",
                "2026-04-18",
            ],
            endDateKey: "2026-04-18",
            label: "Apr 12 - 18",
            startDateKey: "2026-04-12",
        });
    });

    test("derives weekly execution, carryover risk, and neglected projects", () => {
        const tasks: Array<TodoRow & {
            planned_minutes: number;
            planning_status: "unplanned" | "partially_planned" | "fully_planned" | "overplanned";
            remaining_estimated_minutes: number | null;
        }> = [
            {
                id: "task-slip",
                user_id: "user-1",
                list_id: "list-a",
                title: "Finish worksheet",
                is_done: false,
                inserted_at: "2026-04-10T00:00:00.000Z",
                deadline_on: "2026-04-13",
                deadline_at: null,
                due_date: null,
                estimated_minutes: 60,
                planned_minutes: 0,
                planning_status: "unplanned",
                remaining_estimated_minutes: 60,
            },
            {
                id: "task-risk",
                user_id: "user-1",
                list_id: "list-a",
                title: "Practice set",
                is_done: false,
                inserted_at: "2026-04-10T00:00:00.000Z",
                deadline_on: "2026-04-18",
                deadline_at: null,
                due_date: null,
                estimated_minutes: 90,
                planned_minutes: 30,
                planning_status: "partially_planned",
                remaining_estimated_minutes: 60,
            },
            {
                id: "task-neglected",
                user_id: "user-1",
                list_id: "list-b",
                title: "Reply to mentor",
                is_done: false,
                inserted_at: "2026-04-10T00:00:00.000Z",
                deadline_on: "2026-04-19",
                deadline_at: null,
                due_date: null,
                estimated_minutes: 30,
                planned_minutes: 0,
                planning_status: "unplanned",
                remaining_estimated_minutes: 30,
            },
            {
                id: "task-done",
                user_id: "user-1",
                list_id: "list-a",
                title: "Mock paper",
                is_done: true,
                inserted_at: "2026-04-10T00:00:00.000Z",
                deadline_on: "2026-04-15",
                deadline_at: null,
                due_date: null,
                estimated_minutes: 60,
                completed_at: "2026-04-15T02:30:00.000Z",
                planned_minutes: 60,
                planning_status: "fully_planned",
                remaining_estimated_minutes: 0,
            },
        ];
        const plannedBlocks: PlannedFocusBlock[] = [
            {
                id: "block-current",
                user_id: "user-1",
                list_id: "list-a",
                todo_id: "task-risk",
                title: "Practice block",
                scheduled_start: "2026-04-16T01:00:00.000Z",
                scheduled_end: "2026-04-16T02:00:00.000Z",
                inserted_at: "2026-04-10T00:00:00.000Z",
                updated_at: "2026-04-10T00:00:00.000Z",
            },
            {
                id: "block-previous",
                user_id: "user-1",
                list_id: "list-a",
                todo_id: null,
                title: "Previous week",
                scheduled_start: "2026-04-09T01:00:00.000Z",
                scheduled_end: "2026-04-09T01:30:00.000Z",
                inserted_at: "2026-04-02T00:00:00.000Z",
                updated_at: "2026-04-02T00:00:00.000Z",
            },
        ];
        const focusSessions: FocusSession[] = [
            {
                id: "session-current-1",
                user_id: "user-1",
                list_id: "list-a",
                todo_id: "task-done",
                planned_block_id: null,
                duration_seconds: 60 * 60,
                mode: "focus",
                inserted_at: "2026-04-14T01:00:00.000Z",
                todo_lists: { name: "Math" },
            },
            {
                id: "session-current-2",
                user_id: "user-1",
                list_id: "list-a",
                todo_id: "task-done",
                planned_block_id: null,
                duration_seconds: 30 * 60,
                mode: "focus",
                inserted_at: "2026-04-15T01:00:00.000Z",
                todo_lists: { name: "Math" },
            },
            {
                id: "session-previous",
                user_id: "user-1",
                list_id: "list-a",
                todo_id: null,
                planned_block_id: null,
                duration_seconds: 30 * 60,
                mode: "focus",
                inserted_at: "2026-04-08T01:00:00.000Z",
                todo_lists: { name: "Math" },
            },
        ];

        const review = buildWeeklyProgressReview({
            focusSessions,
            lists: LISTS,
            now: new Date("2026-04-15T04:00:00.000Z"),
            plannedBlocks,
            tasks,
            timeZone: "Asia/Singapore",
        });

        expect(review.actualFocusMinutes).toBe(90);
        expect(review.actualFocusDeltaMinutes).toBe(60);
        expect(review.plannedMinutes).toBe(60);
        expect(review.plannedDeltaMinutes).toBe(30);
        expect(review.completedCount).toBe(1);
        expect(review.completedDelta).toBe(1);
        expect(review.executionRate).toBe(1.5);
        expect(review.overdueCarryoverCount).toBe(1);
        expect(review.underplannedCarryoverCount).toBe(3);
        expect(review.carryoverRiskCount).toBe(3);
        expect(review.slippedTasks.map((task) => task.taskId)).toEqual(["task-slip"]);
        expect(review.neglectedProjects.map((project) => project.listId)).toEqual(["list-b"]);
        expect(review.projectMomentum.map((project) => project.listId)).toEqual(["list-a"]);
        expect(review.estimateAccuracyCounts).toEqual({
            underestimated: 1,
            on_track: 0,
            overestimated: 0,
        });
        expect(review.measuredCompletedTasks.map((task) => task.taskId)).toEqual(["task-done"]);
    });
});
