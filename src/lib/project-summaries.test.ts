import { describe, expect, test } from "vitest";

import { buildProjectSummary, formatProjectScheduledLabel, getProjectScheduledBlockState } from "~/lib/project-summaries";
import type { PlannedFocusBlock, TodoList, TodoRow } from "~/lib/types";

function createList(overrides?: Partial<TodoList>): TodoList {
    return {
        id: overrides?.id ?? "list-1",
        name: overrides?.name ?? "Math",
        owner_id: overrides?.owner_id ?? "user-1",
        inserted_at: overrides?.inserted_at ?? "2026-04-01T00:00:00.000Z",
        user_role: overrides?.user_role ?? "owner",
        color_token: overrides?.color_token ?? "slate",
        icon_token: overrides?.icon_token ?? "folder",
    };
}

function createTask(overrides?: Partial<TodoRow> & { planning_status?: "fully_planned" | "overplanned" | "partially_planned" | "unplanned" }) {
    return {
        id: overrides?.id ?? crypto.randomUUID(),
        user_id: overrides?.user_id ?? "user-1",
        list_id: overrides?.list_id ?? "list-1",
        section_id: overrides?.section_id ?? null,
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
        planning_status: overrides?.planning_status ?? "unplanned",
    };
}

function createBlock(overrides?: Partial<PlannedFocusBlock>): PlannedFocusBlock {
    return {
        id: overrides?.id ?? crypto.randomUUID(),
        user_id: overrides?.user_id ?? "user-1",
        list_id: overrides?.list_id ?? "list-1",
        todo_id: overrides?.todo_id ?? null,
        title: overrides?.title ?? "Block",
        scheduled_start: overrides?.scheduled_start ?? "2026-04-11T09:00:00.000Z",
        scheduled_end: overrides?.scheduled_end ?? "2026-04-11T10:00:00.000Z",
        inserted_at: overrides?.inserted_at ?? "2026-04-01T00:00:00.000Z",
        updated_at: overrides?.updated_at ?? "2026-04-01T00:00:00.000Z",
    };
}

describe("project summaries", () => {
    test("derives urgency, planning coverage, and next scheduled work", () => {
        const list = createList();
        const now = new Date("2026-04-11T08:30:00.000Z");
        const summary = buildProjectSummary({
            list,
            memberCount: 3,
            tasks: [
                createTask({ id: "overdue", deadline_on: "2026-04-10", planning_status: "unplanned" }),
                createTask({ id: "due-soon", deadline_on: "2026-04-14", planning_status: "partially_planned" }),
                createTask({ id: "planned", deadline_on: "2026-04-18", planning_status: "fully_planned" }),
                createTask({ id: "done", deadline_on: "2026-04-09", is_done: true, planning_status: "unplanned" }),
            ],
            plannedBlocks: [
                createBlock({
                    id: "current",
                    scheduled_start: "2026-04-11T08:00:00.000Z",
                    scheduled_end: "2026-04-11T09:00:00.000Z",
                }),
                createBlock({
                    id: "next",
                    scheduled_start: "2026-04-11T10:00:00.000Z",
                    scheduled_end: "2026-04-11T11:00:00.000Z",
                }),
            ],
            now,
            timeZone: "UTC",
        });

        expect(summary.incompleteCount).toBe(3);
        expect(summary.completedCount).toBe(1);
        expect(summary.overdueCount).toBe(1);
        expect(summary.dueSoonCount).toBe(2);
        expect(summary.unplannedCount).toBe(1);
        expect(summary.partiallyPlannedCount).toBe(1);
        expect(summary.memberCount).toBe(3);
        expect(summary.nextScheduledBlock?.id).toBe("current");
    });

    test("formats current and upcoming scheduled block labels", () => {
        const currentBlock = createBlock({
            scheduled_start: "2026-04-11T08:00:00.000Z",
            scheduled_end: "2026-04-11T09:00:00.000Z",
        });
        const upcomingBlock = createBlock({
            scheduled_start: "2026-04-12T10:00:00.000Z",
            scheduled_end: "2026-04-12T11:00:00.000Z",
        });
        const now = new Date("2026-04-11T08:30:00.000Z");

        expect(getProjectScheduledBlockState(currentBlock, now)).toBe("current");
        expect(formatProjectScheduledLabel(currentBlock, now)).toContain("Now");
        expect(getProjectScheduledBlockState(upcomingBlock, now)).toBe("upcoming");
        expect(formatProjectScheduledLabel(upcomingBlock, now)).toContain("Tomorrow");
    });
});
