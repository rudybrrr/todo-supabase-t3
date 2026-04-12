import { getProjectColorClasses, PROJECT_COLOR_TOKENS } from "~/lib/project-appearance";
import type { TaskLabel, TaskLabelColorToken, TodoLabelLinkRow } from "~/lib/types";

export const TASK_LABEL_FIELDS = "id, user_id, name, color_token, inserted_at, updated_at";
export const TODO_LABEL_LINK_FIELDS = "todo_id, label_id, user_id, inserted_at";
export const TASK_LABEL_COLOR_OPTIONS = [...PROJECT_COLOR_TOKENS];

const VALID_TASK_LABEL_COLOR_TOKENS = new Set<TaskLabelColorToken>(TASK_LABEL_COLOR_OPTIONS);

export function isTaskLabelColorToken(value: string | null | undefined): value is TaskLabelColorToken {
    return VALID_TASK_LABEL_COLOR_TOKENS.has(value as TaskLabelColorToken);
}

export function normalizeTaskLabelName(value: string) {
    return value.trim().replace(/\s+/g, " ");
}

export function parseTaskLabelInput(value: string) {
    const seen = new Set<string>();
    const parsedNames: string[] = [];

    value
        .split(",")
        .map((item) => normalizeTaskLabelName(item))
        .filter(Boolean)
        .forEach((item) => {
            const normalizedKey = item.toLowerCase();
            if (seen.has(normalizedKey)) return;

            seen.add(normalizedKey);
            parsedNames.push(item);
        });

    return parsedNames;
}

export function formatTaskLabelInput(labels: Array<Pick<TaskLabel, "name">>) {
    return labels
        .map((label) => normalizeTaskLabelName(label.name))
        .filter(Boolean)
        .join(", ");
}

export function normalizeTaskLabel(label: TaskLabel): TaskLabel {
    return {
        ...label,
        name: normalizeTaskLabelName(label.name),
        color_token: isTaskLabelColorToken(label.color_token) ? label.color_token : "slate",
    };
}

export function sortTaskLabels(labels: TaskLabel[]) {
    return [...labels].sort((a, b) => {
        const nameComparison = a.name.localeCompare(b.name);
        if (nameComparison !== 0) return nameComparison;
        return a.id.localeCompare(b.id);
    });
}

export function areTaskLabelCollectionsEqual(a: TaskLabel[], b: TaskLabel[]) {
    if (a.length !== b.length) return false;

    return a.every((label, index) => {
        const nextLabel = b[index];
        if (!nextLabel) return false;

        return label.id === nextLabel.id
            && label.user_id === nextLabel.user_id
            && label.name === nextLabel.name
            && (label.color_token ?? "slate") === (nextLabel.color_token ?? "slate")
            && label.inserted_at === nextLabel.inserted_at
            && label.updated_at === nextLabel.updated_at;
    });
}

export function getDefaultTaskLabelColorToken(name: string): TaskLabelColorToken {
    const normalizedName = normalizeTaskLabelName(name).toLowerCase();
    const hash = Array.from(normalizedName).reduce((total, character) => total + character.charCodeAt(0), 0);
    return TASK_LABEL_COLOR_OPTIONS[hash % TASK_LABEL_COLOR_OPTIONS.length] ?? "slate";
}

export function buildTaskLabelsByTodo(labels: TaskLabel[], links: TodoLabelLinkRow[]) {
    const labelsById = new Map(labels.map((label) => [label.id, normalizeTaskLabel(label)]));
    const labelsByTodo = new Map<string, TaskLabel[]>();

    links.forEach((link) => {
        const label = labelsById.get(link.label_id);
        if (!label) return;

        const currentLabels = labelsByTodo.get(link.todo_id) ?? [];
        labelsByTodo.set(link.todo_id, sortTaskLabels([...currentLabels, label]));
    });

    return labelsByTodo;
}

export function getTaskLabelColorClasses(colorToken?: string | null) {
    return getProjectColorClasses(colorToken);
}

export function normalizeTaskSavedViewLabelIds(labelIds: string[] | null | undefined) {
    return Array.from(new Set((labelIds ?? []).filter((labelId): labelId is string => typeof labelId === "string" && labelId.length > 0)))
        .sort((a, b) => a.localeCompare(b));
}
