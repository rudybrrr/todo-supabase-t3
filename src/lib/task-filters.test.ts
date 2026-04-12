import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
    applyTaskViewFilters,
    createTaskViewFilterState,
    normalizeTaskSavedViewRow,
} from "~/lib/task-filters";
import type { PlanningStatus } from "~/lib/types";

function createTask(overrides?: {
    deadline_on?: string | null;
    is_done?: boolean;
    labels?: Array<{ id: string }>;
    list_id?: string;
    planning_status?: PlanningStatus;
    priority?: "high" | "medium" | "low" | null;
}) {
    return {
        deadline_at: null,
        deadline_on: overrides?.deadline_on ?? null,
        due_date: overrides?.deadline_on ?? null,
        is_done: overrides?.is_done ?? false,
        labels: overrides?.labels ?? [],
        list_id: overrides?.list_id ?? "list-a",
        planning_status: overrides?.planning_status ?? "unplanned",
        priority: overrides?.priority ?? null,
    };
}

describe("task-filters", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-04-11T12:00:00.000Z"));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test("filters by project, priority, and labels together", () => {
        const matchingTask = createTask({
            list_id: "list-a",
            priority: "high",
            labels: [{ id: "label-1" }],
        });

        expect(applyTaskViewFilters([
            createTask({ list_id: "list-a", priority: "medium", labels: [{ id: "label-1" }] }),
            createTask({ list_id: "list-b", priority: "high", labels: [{ id: "label-1" }] }),
            createTask({ list_id: "list-a", priority: "high", labels: [{ id: "label-2" }] }),
            matchingTask,
        ], createTaskViewFilterState({
            listId: "list-a",
            priorityFilter: "high",
            labelIds: ["label-1"],
        }), "UTC")).toEqual([matchingTask]);
    });

    test("filters by planning status and deadline scope", () => {
        const matchingTask = createTask({
            deadline_on: "2026-04-11",
            planning_status: "partially_planned",
        });

        expect(applyTaskViewFilters([
            createTask({ deadline_on: "2026-04-10", planning_status: "partially_planned" }),
            createTask({ deadline_on: "2026-04-11", planning_status: "fully_planned" }),
            matchingTask,
        ], createTaskViewFilterState({
            planningStatusFilter: "partially_planned",
            deadlineScope: "today",
        }), "UTC")).toEqual([matchingTask]);
    });

    test("normalizes invalid saved view values to safe defaults", () => {
        expect(normalizeTaskSavedViewRow({
            id: "view-1",
            user_id: "user-1",
            name: "Broken view",
            smart_view: "later" as never,
            list_id: null,
            priority_filter: "urgent" as never,
            planning_status_filter: "mystery" as never,
            deadline_scope: "soonish" as never,
            label_ids: ["label-2", "", "label-1", "label-2"] as never,
            inserted_at: "2026-04-11T00:00:00.000Z",
            updated_at: "2026-04-11T00:00:00.000Z",
        })).toMatchObject({
            smart_view: "today",
            priority_filter: "all",
            planning_status_filter: "all",
            deadline_scope: "all",
            label_ids: ["label-1", "label-2"],
        });
    });
});
