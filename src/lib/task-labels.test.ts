import { describe, expect, test } from "vitest";

import {
    buildTaskLabelsByTodo,
    formatTaskLabelInput,
    parseTaskLabelInput,
} from "~/lib/task-labels";
import type { TaskLabel, TodoLabelLinkRow } from "~/lib/types";

describe("task-labels", () => {
    test("parses comma-separated labels, trims whitespace, and deduplicates case-insensitively", () => {
        expect(parseTaskLabelInput(" math, urgent,Math ,  deep work  , urgent ")).toEqual([
            "math",
            "urgent",
            "deep work",
        ]);
    });

    test("formats labels into a stable comma-separated string", () => {
        expect(formatTaskLabelInput([
            { name: "Math" },
            { name: "Deep Work" },
        ])).toBe("Math, Deep Work");
    });

    test("maps personal label assignments onto tasks", () => {
        const labels: TaskLabel[] = [
            {
                id: "label-1",
                user_id: "user-1",
                name: "Math",
                color_token: "amber",
                inserted_at: "2026-04-11T00:00:00.000Z",
                updated_at: "2026-04-11T00:00:00.000Z",
            },
            {
                id: "label-2",
                user_id: "user-1",
                name: "Deep Work",
                color_token: "cobalt",
                inserted_at: "2026-04-11T00:00:00.000Z",
                updated_at: "2026-04-11T00:00:00.000Z",
            },
        ];
        const links: TodoLabelLinkRow[] = [
            { todo_id: "todo-1", label_id: "label-2", user_id: "user-1" },
            { todo_id: "todo-1", label_id: "label-1", user_id: "user-1" },
        ];

        expect(buildTaskLabelsByTodo(labels, links).get("todo-1")?.map((label) => label.name)).toEqual([
            "Deep Work",
            "Math",
        ]);
    });
});
