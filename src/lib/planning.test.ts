import { describe, expect, test } from "vitest";

import {
    buildPlannedMinutesByTodo,
    findPlannerSlotForDate,
    getPlannerPreferences,
    getPlannerRangeLabel,
    getPlannerVisibleDays,
    getRemainingEstimatedMinutes,
    getTaskPlanningStatus,
    toDateKey,
} from "~/lib/planning";
import type { PlannedFocusBlock } from "~/lib/types";

describe("planning", () => {
    test("aggregates planned minutes by task and ignores unassigned blocks", () => {
        const blocks: PlannedFocusBlock[] = [
            {
                id: "block-1",
                user_id: "user-1",
                list_id: "list-1",
                todo_id: "todo-1",
                title: "Deep work",
                scheduled_start: "2026-04-11T09:00:00.000Z",
                scheduled_end: "2026-04-11T09:30:00.000Z",
                inserted_at: "2026-04-11T00:00:00.000Z",
                updated_at: "2026-04-11T00:00:00.000Z",
            },
            {
                id: "block-2",
                user_id: "user-1",
                list_id: "list-1",
                todo_id: "todo-1",
                title: "Review",
                scheduled_start: "2026-04-11T10:00:00.000Z",
                scheduled_end: "2026-04-11T10:15:00.000Z",
                inserted_at: "2026-04-11T00:00:00.000Z",
                updated_at: "2026-04-11T00:00:00.000Z",
            },
            {
                id: "block-3",
                user_id: "user-1",
                list_id: "list-1",
                todo_id: null,
                title: "Break",
                scheduled_start: "2026-04-11T11:00:00.000Z",
                scheduled_end: "2026-04-11T11:30:00.000Z",
                inserted_at: "2026-04-11T00:00:00.000Z",
                updated_at: "2026-04-11T00:00:00.000Z",
            },
        ];

        const plannedMinutesByTodo = buildPlannedMinutesByTodo(blocks);
        expect(plannedMinutesByTodo.get("todo-1")).toBe(45);
        expect(plannedMinutesByTodo.has("todo-2")).toBe(false);
    });

    test("derives planning status across unplanned, partial, full, and overplanned states", () => {
        expect(getTaskPlanningStatus(60, 0)).toBe("unplanned");
        expect(getTaskPlanningStatus(null, 30)).toBe("fully_planned");
        expect(getTaskPlanningStatus(60, 30)).toBe("partially_planned");
        expect(getTaskPlanningStatus(60, 60)).toBe("fully_planned");
        expect(getTaskPlanningStatus(60, 75)).toBe("overplanned");
    });

    test("clamps remaining estimated minutes at zero", () => {
        expect(getRemainingEstimatedMinutes(null, 30)).toBeNull();
        expect(getRemainingEstimatedMinutes(60, 15)).toBe(45);
        expect(getRemainingEstimatedMinutes(60, 90)).toBe(0);
    });

    test("normalizes planner preferences into shared defaults", () => {
        expect(getPlannerPreferences({
            default_block_minutes: 50,
            planner_day_end_hour: 20,
            planner_day_start_hour: 8,
            week_starts_on: 0,
        })).toEqual({
            dayEndHour: 20,
            dayStartHour: 8,
            defaultBlockMinutes: 60,
            defaultBlockStartHour: 9,
            weekStartsOn: 0,
        });
    });

    test("finds planner slots inside custom day bounds", () => {
        const slot = findPlannerSlotForDate([
            {
                id: "block-1",
                user_id: "user-1",
                list_id: "list-1",
                todo_id: "todo-1",
                title: "Deep work",
                scheduled_start: "2026-04-15T10:00:00.000Z",
                scheduled_end: "2026-04-15T11:00:00.000Z",
                inserted_at: "2026-04-15T00:00:00.000Z",
                updated_at: "2026-04-15T00:00:00.000Z",
            },
        ], new Date("2026-04-15T00:00:00.000Z"), 45, {
            dayEndHour: 14,
            dayStartHour: 10,
            defaultBlockStartHour: 10,
        });

        expect(slot).not.toBeNull();
        expect(slot?.startMinutes).toBe(0);
        expect(slot?.endMinutes).toBe(45);
        expect(slot ? toDateKey(slot.date) : null).toBe("2026-04-15");
    });

    test("uses the configured week start when building visible days and labels", () => {
        const anchorDate = new Date("2026-04-15T00:00:00.000Z");
        const visibleDays = getPlannerVisibleDays("week", anchorDate, anchorDate, 0);

        expect(visibleDays.map((day) => toDateKey(day))).toEqual([
            "2026-04-12",
            "2026-04-13",
            "2026-04-14",
            "2026-04-15",
            "2026-04-16",
            "2026-04-17",
            "2026-04-18",
        ]);
        expect(getPlannerRangeLabel("week", anchorDate, anchorDate, 0)).toBe("Apr 12 - Apr 18");
    });
});
