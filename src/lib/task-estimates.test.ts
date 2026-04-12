import { describe, expect, test } from "vitest";

import {
    buildTaskFocusSummaryMap,
    getRemainingEstimateSessionCount,
    getSuggestedTaskBlockMinutes,
    getTaskEstimateAccuracyStatus,
    getTaskEstimateVarianceMinutes,
} from "~/lib/task-estimates";
import type { FocusSession } from "~/lib/types";

describe("task-estimates", () => {
    test("builds per-task focus summaries from attributed focus sessions", () => {
        const sessions: FocusSession[] = [
            {
                id: "session-1",
                user_id: "user-1",
                list_id: "list-1",
                todo_id: "task-1",
                planned_block_id: "block-1",
                duration_seconds: 1500,
                mode: "focus",
                inserted_at: "2026-04-11T09:00:00.000Z",
                todo_lists: { name: "Math" },
            },
            {
                id: "session-2",
                user_id: "user-1",
                list_id: "list-1",
                todo_id: "task-1",
                planned_block_id: null,
                duration_seconds: 1800,
                mode: "focus",
                inserted_at: "2026-04-11T11:00:00.000Z",
                todo_lists: { name: "Math" },
            },
            {
                id: "session-3",
                user_id: "user-1",
                list_id: "list-1",
                todo_id: "task-2",
                planned_block_id: null,
                duration_seconds: 300,
                mode: "shortBreak",
                inserted_at: "2026-04-11T11:30:00.000Z",
                todo_lists: { name: "Math" },
            },
        ];

        expect(buildTaskFocusSummaryMap(sessions).get("task-1")).toEqual({
            taskId: "task-1",
            actualFocusMinutes: 55,
            focusSessionCount: 2,
            lastFocusedAt: "2026-04-11T11:00:00.000Z",
            medianSessionMinutes: 28,
        });
        expect(buildTaskFocusSummaryMap(sessions).has("task-2")).toBe(false);
    });

    test("classifies estimate accuracy with a tolerance band", () => {
        expect(getTaskEstimateAccuracyStatus(60, 72)).toBe("on_track");
        expect(getTaskEstimateAccuracyStatus(60, 90)).toBe("underestimated");
        expect(getTaskEstimateAccuracyStatus(60, 30)).toBe("overestimated");
        expect(getTaskEstimateAccuracyStatus(null, 30)).toBeNull();
        expect(getTaskEstimateAccuracyStatus(60, 0)).toBeNull();
    });

    test("derives estimate variance from actual focus time", () => {
        expect(getTaskEstimateVarianceMinutes(60, 90)).toBe(30);
        expect(getTaskEstimateVarianceMinutes(60, 45)).toBe(-15);
        expect(getTaskEstimateVarianceMinutes(null, 45)).toBeNull();
    });

    test("uses median task focus length for suggested block durations", () => {
        const summary = {
            taskId: "task-1",
            actualFocusMinutes: 80,
            focusSessionCount: 3,
            lastFocusedAt: "2026-04-11T11:00:00.000Z",
            medianSessionMinutes: 40,
        };

        expect(getSuggestedTaskBlockMinutes({
            id: "task-1",
            estimated_minutes: 120,
            remaining_estimated_minutes: 35,
        }, summary)).toBe(45);

        expect(getSuggestedTaskBlockMinutes({
            id: "task-2",
            estimated_minutes: 50,
            remaining_estimated_minutes: 50,
        }, null)).toBe(60);

        expect(getSuggestedTaskBlockMinutes({
            id: "task-3",
            estimated_minutes: null,
            remaining_estimated_minutes: null,
        }, null, { fallbackMinutes: 45 })).toBe(45);
    });

    test("derives remaining session counts from remaining estimate and typical focus length", () => {
        const summary = {
            taskId: "task-1",
            actualFocusMinutes: 75,
            focusSessionCount: 3,
            lastFocusedAt: "2026-04-11T11:00:00.000Z",
            medianSessionMinutes: 25,
        };

        expect(getRemainingEstimateSessionCount(50, summary)).toBe(2);
        expect(getRemainingEstimateSessionCount(0, summary)).toBe(0);
        expect(getRemainingEstimateSessionCount(null, summary)).toBeNull();
    });
});
