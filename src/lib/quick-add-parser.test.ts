import { describe, expect, test } from "vitest";

import {
    applyQuickAddSuggestion,
    getQuickAddActiveSuggestionState,
    parseQuickAddInput,
} from "~/lib/quick-add-parser";
import type { TaskLabel, TodoList } from "~/lib/types";

const lists: TodoList[] = [
    {
        id: "list-science",
        name: "Science",
        owner_id: "user-1",
    },
    {
        id: "list-math",
        name: "Math",
        owner_id: "user-1",
    },
    {
        id: "list-projects-exams",
        name: "Projects & Exams",
        owner_id: "user-1",
    },
    {
        id: "list-personal-admin",
        name: "Personal Admin",
        owner_id: "user-1",
    },
];

const labels: Array<Pick<TaskLabel, "id" | "name">> = [
    {
        id: "label-deep-work",
        name: "Deep Work",
    },
    {
        id: "label-exam",
        name: "Exam",
    },
    {
        id: "label-urgent",
        name: "Urgent",
    },
];

describe("quick-add-parser", () => {
    test("parses project, due date, due time, priority, estimate, reminder, recurrence, and labels together", () => {
        expect(parseQuickAddInput(
            "Finish chemistry lab #science tomorrow 4pm p1 45m r1h every weekday +exam +deep-work",
            lists,
            {
                labels,
                now: new Date("2026-04-11T08:00:00.000Z"),
            },
        )).toMatchObject({
            title: "Finish chemistry lab",
            listId: "list-science",
            dueDate: "2026-04-12",
            dueTime: "16:00",
            priority: "high",
            estimatedMinutes: 45,
            reminderOffsetMinutes: 60,
            recurrenceRule: "weekdays",
            labelNames: ["exam", "deep work"],
        });
    });

    test("leaves standalone time phrases in the title when there is no parsed date token", () => {
        expect(parseQuickAddInput(
            "Review flashcards 4pm +study",
            lists,
            {
                labels,
                now: new Date("2026-04-11T08:00:00.000Z"),
            },
        )).toMatchObject({
            title: "Review flashcards 4pm",
            dueDate: null,
            dueTime: null,
            labelNames: ["study"],
        });
    });

    test("deduplicates repeated labels and strips all recognized tokens from the title", () => {
        expect(parseQuickAddInput(
            "Plan finals +exam +exam #math today p2",
            lists,
            {
                labels,
                now: new Date("2026-04-11T08:00:00.000Z"),
            },
        )).toMatchObject({
            title: "Plan finals",
            listId: "list-math",
            dueDate: "2026-04-11",
            priority: "medium",
            labelNames: ["exam"],
        });
    });

    test("parses multi-word project and label tokens against existing data", () => {
        expect(parseQuickAddInput(
            "Plan finals schedule #projects & exams next monday +deep work +urgent",
            lists,
            {
                labels,
                now: new Date("2026-04-11T08:00:00.000Z"),
            },
        )).toMatchObject({
            title: "Plan finals schedule",
            hasProjectToken: true,
            listId: "list-projects-exams",
            dueDate: "2026-04-13",
            hasLabelTokens: true,
            labelNames: ["deep work", "urgent"],
            pendingProjectName: null,
        });
    });

    test("returns a pending project when the typed project does not exist", () => {
        expect(parseQuickAddInput(
            "Draft committee agenda #Student Council +deep work",
            lists,
            {
                labels,
                now: new Date("2026-04-11T08:00:00.000Z"),
            },
        )).toMatchObject({
            title: "Draft committee agenda",
            hasProjectToken: true,
            projectName: "Student Council",
            pendingProjectName: "Student Council",
            listId: null,
            labelNames: ["deep work"],
        });
    });

    test("supports hyphenated project matching for names with punctuation", () => {
        expect(parseQuickAddInput(
            "Review deadlines #projects-exams",
            lists,
            new Date("2026-04-11T08:00:00.000Z"),
        )).toMatchObject({
            title: "Review deadlines",
            listId: "list-projects-exams",
            pendingProjectName: null,
        });
    });

    test("surfaces existing and create-new project suggestions for hash syntax", () => {
        const suggestionState = getQuickAddActiveSuggestionState(
            "Plan week #pers",
            "Plan week #pers".length,
            lists,
            labels,
        );

        expect(suggestionState).toMatchObject({
            kind: "project",
            query: "pers",
        });
        expect(suggestionState?.suggestions.map((suggestion) => ({
            label: suggestion.label,
            isExisting: suggestion.isExisting,
        }))).toEqual(expect.arrayContaining([
            { label: "pers", isExisting: false },
            { label: "Personal Admin", isExisting: true },
        ]));
    });

    test("applies a selected project suggestion over the active token span", () => {
        const input = "Plan week #pers tomorrow";
        const suggestionState = getQuickAddActiveSuggestionState(
            input,
            "Plan week #pers".length,
            lists,
            labels,
        );

        expect(suggestionState).not.toBeNull();

        const personalAdminSuggestion = suggestionState?.suggestions.find((suggestion) => suggestion.label === "Personal Admin");
        expect(personalAdminSuggestion).toBeTruthy();

        expect(applyQuickAddSuggestion(input, suggestionState!, personalAdminSuggestion!)).toEqual({
            value: "Plan week #Personal Admin\u200B tomorrow",
            selection: "Plan week #Personal Admin\u200B ".length,
        });
    });

    test("applies a selected project suggestion at the end of input and adds a trailing space and moves selection past it", () => {
        const input = "Plan week #pers";
        const suggestionState = getQuickAddActiveSuggestionState(
            input,
            input.length,
            lists,
            labels,
        );

        expect(suggestionState).not.toBeNull();
        const personalAdminSuggestion = suggestionState?.suggestions.find((suggestion) => suggestion.label === "Personal Admin");

        expect(applyQuickAddSuggestion(input, suggestionState!, personalAdminSuggestion!)).toEqual({
            value: "Plan week #Personal Admin\u200B ",
            selection: "Plan week #Personal Admin\u200B ".length,
        });
    });

    test("surfaces existing and create-new label suggestions for plus syntax", () => {
        const suggestionState = getQuickAddActiveSuggestionState(
            "Write report +deep",
            "Write report +deep".length,
            lists,
            labels,
        );

        expect(suggestionState).toMatchObject({
            kind: "label",
            query: "deep",
        });
        expect(suggestionState?.suggestions.map((suggestion) => ({
            label: suggestion.label,
            isExisting: suggestion.isExisting,
        }))).toEqual(expect.arrayContaining([
            { label: "deep", isExisting: false },
            { label: "Deep Work", isExisting: true },
        ]));
    });
});
