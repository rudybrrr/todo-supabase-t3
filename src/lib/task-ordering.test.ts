import { describe, expect, test } from "vitest";

import { buildProjectTaskMovePatches, getNextTaskPosition, sortTasksByWorkspaceOrder } from "~/lib/task-ordering";
import type { TodoRow } from "~/lib/types";

function createTask(overrides?: Partial<TodoRow>): TodoRow {
    return {
        id: overrides?.id ?? crypto.randomUUID(),
        user_id: overrides?.user_id ?? "user-1",
        list_id: overrides?.list_id ?? "list-1",
        section_id: overrides?.section_id ?? null,
        assignee_user_id: overrides?.assignee_user_id ?? null,
        position: overrides?.position ?? 0,
        title: overrides?.title ?? "Task",
        is_done: overrides?.is_done ?? false,
        inserted_at: overrides?.inserted_at ?? "2026-04-01T00:00:00.000Z",
        description: overrides?.description ?? null,
        due_date: overrides?.due_date ?? null,
        deadline_on: overrides?.deadline_on ?? null,
        deadline_at: overrides?.deadline_at ?? null,
        reminder_offset_minutes: overrides?.reminder_offset_minutes ?? null,
        reminder_at: overrides?.reminder_at ?? null,
        recurrence_rule: overrides?.recurrence_rule ?? null,
        priority: overrides?.priority ?? null,
        estimated_minutes: overrides?.estimated_minutes ?? null,
        completed_at: overrides?.completed_at ?? null,
        updated_at: overrides?.updated_at ?? "2026-04-01T00:00:00.000Z",
    };
}

describe("task ordering", () => {
    test("sorts by position first, then inserted_at", () => {
        const ordered = sortTasksByWorkspaceOrder([
            createTask({ id: "b", position: 1, inserted_at: "2026-04-02T00:00:00.000Z" }),
            createTask({ id: "a", position: 0, inserted_at: "2026-04-03T00:00:00.000Z" }),
            createTask({ id: "c", position: 1, inserted_at: "2026-04-01T00:00:00.000Z" }),
        ]);

        expect(ordered.map((task) => task.id)).toEqual(["a", "c", "b"]);
    });

    test("builds same-section reorder patches for open tasks while keeping done tasks at the end", () => {
        const patches = buildProjectTaskMovePatches({
            movedTaskId: "task-2",
            sourceTasks: [
                createTask({ id: "task-1", section_id: "section-1", position: 0 }),
                createTask({ id: "task-2", section_id: "section-1", position: 1 }),
                createTask({ id: "task-3", section_id: "section-1", position: 2, is_done: true }),
            ],
            destinationTasks: [
                createTask({ id: "task-1", section_id: "section-1", position: 0 }),
                createTask({ id: "task-2", section_id: "section-1", position: 1 }),
                createTask({ id: "task-3", section_id: "section-1", position: 2, is_done: true }),
            ],
            sourceSectionId: "section-1",
            destinationSectionId: "section-1",
            destinationIndex: 0,
        });

        expect(patches).toEqual([
            { id: "task-2", section_id: "section-1", position: 0 },
            { id: "task-1", section_id: "section-1", position: 1 },
            { id: "task-3", section_id: "section-1", position: 2 },
        ]);
    });

    test("builds cross-section move patches and appends done tasks after open tasks", () => {
        const patches = buildProjectTaskMovePatches({
            movedTaskId: "task-2",
            sourceTasks: [
                createTask({ id: "task-1", section_id: "section-a", position: 0 }),
                createTask({ id: "task-2", section_id: "section-a", position: 1 }),
            ],
            destinationTasks: [
                createTask({ id: "task-3", section_id: "section-b", position: 0 }),
                createTask({ id: "task-4", section_id: "section-b", position: 1, is_done: true }),
            ],
            sourceSectionId: "section-a",
            destinationSectionId: "section-b",
            destinationIndex: 1,
        });

        expect(patches).toEqual([
            { id: "task-1", section_id: "section-a", position: 0 },
            { id: "task-3", section_id: "section-b", position: 0 },
            { id: "task-2", section_id: "section-b", position: 1 },
            { id: "task-4", section_id: "section-b", position: 2 },
        ]);
    });

    test("returns the next workspace position", () => {
        expect(getNextTaskPosition([])).toBe(0);
        expect(getNextTaskPosition([
            createTask({ position: 0 }),
            createTask({ position: 4 }),
            createTask({ position: 2 }),
        ])).toBe(5);
    });
});
