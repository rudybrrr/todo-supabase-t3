import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
    applyPlannerTaskFilters,
    createPlannerFilterState,
    normalizePlannerSavedFilterRow,
} from "~/lib/planner-filters";
import type { PlanningStatus } from "~/lib/types";

function createPlannerTask(overrides?: {
    deadline_at?: string | null;
    deadline_on?: string | null;
    due_date?: string | null;
    is_done?: boolean;
    list_id?: string;
    planning_status?: PlanningStatus;
}) {
    return {
        deadline_at: overrides?.deadline_at ?? null,
        deadline_on: overrides?.deadline_on ?? null,
        due_date: overrides?.due_date ?? null,
        is_done: overrides?.is_done ?? false,
        list_id: overrides?.list_id ?? "list-a",
        planning_status: overrides?.planning_status ?? "unplanned",
    };
}

describe("planner-filters", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-11T12:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test("filters by project scope and planning status together", () => {
        const matchingTask = createPlannerTask({
            deadline_on: "2026-04-12",
            list_id: "list-a",
            planning_status: "partially_planned",
        });

        const tasks = [
            createPlannerTask({
                deadline_on: "2026-04-12",
                list_id: "list-a",
                planning_status: "unplanned",
            }),
            matchingTask,
            createPlannerTask({
                deadline_on: "2026-04-12",
                list_id: "list-b",
                planning_status: "partially_planned",
            }),
        ];

        expect(applyPlannerTaskFilters(tasks, createPlannerFilterState({
            listId: "list-a",
            planningStatusFilter: "partially_planned",
        }), "UTC")).toEqual([matchingTask]);
    });

    test("filters no-deadline tasks", () => {
        const noDeadlineTask = createPlannerTask({
            deadline_on: null,
            planning_status: "fully_planned",
        });

        const tasks = [
            createPlannerTask({ deadline_on: "2026-04-11" }),
            noDeadlineTask,
        ];

        expect(applyPlannerTaskFilters(tasks, createPlannerFilterState({
            deadlineScope: "no_deadline",
        }), "UTC")).toEqual([noDeadlineTask]);
    });

    test("filters overdue and today scopes from the current date", () => {
        const overdueTask = createPlannerTask({ deadline_on: "2026-04-10" });
        const todayTask = createPlannerTask({ deadline_on: "2026-04-11" });
        const doneTask = createPlannerTask({
            deadline_on: "2026-04-10",
            is_done: true,
        });
        const tasks = [overdueTask, todayTask, doneTask];

        expect(applyPlannerTaskFilters(tasks, createPlannerFilterState({
            deadlineScope: "overdue",
        }), "UTC")).toEqual([overdueTask]);

        expect(applyPlannerTaskFilters(tasks, createPlannerFilterState({
            deadlineScope: "today",
        }), "UTC")).toEqual([todayTask]);
    });

    test("treats due soon as today through seven days out", () => {
        const todayTask = createPlannerTask({ deadline_on: "2026-04-11" });
        const nearTask = createPlannerTask({ deadline_on: "2026-04-17" });
        const overdueTask = createPlannerTask({ deadline_on: "2026-04-10" });
        const farTask = createPlannerTask({ deadline_on: "2026-04-20" });

        expect(applyPlannerTaskFilters(
            [todayTask, nearTask, overdueTask, farTask],
            createPlannerFilterState({ deadlineScope: "due_soon" }),
            "UTC",
        )).toEqual([todayTask, nearTask]);
    });

    test("normalizes invalid saved filter values to safe defaults", () => {
        expect(normalizePlannerSavedFilterRow({
            default_view: "quarter" as never,
            deadline_scope: "later" as never,
            id: "filter-1",
            inserted_at: "2026-04-11T00:00:00.000Z",
            list_id: null,
            name: "Broken filter",
            planning_status_filter: "mystery" as never,
            updated_at: "2026-04-11T00:00:00.000Z",
            user_id: "user-1",
        })).toMatchObject({
            default_view: "week",
            deadline_scope: "all",
            planning_status_filter: "all",
        });
    });
});
