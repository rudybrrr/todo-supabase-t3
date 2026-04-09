import { format } from "date-fns";

import type { TodoList, TodoRow } from "~/lib/types";

type TaskPriority = NonNullable<TodoRow["priority"]>;
type QuickAddChipKind = "project" | "date" | "priority" | "estimate";

export interface QuickAddMatchedToken {
    kind: QuickAddChipKind;
    start: number;
    end: number;
}

interface QuickAddParsedChip {
    kind: QuickAddChipKind;
    label: string;
    value: string;
}

interface QuickAddParsedProject {
    listId: string;
    label: string;
}

interface QuickAddParsedDate {
    value: string;
    label: string;
}

interface QuickAddParsedPriority {
    value: TaskPriority;
    label: string;
}

interface QuickAddParsedEstimate {
    value: number;
    label: string;
}

export interface QuickAddParseResult {
    title: string;
    listId: string | null;
    dueDate: string | null;
    priority: TaskPriority | null;
    estimatedMinutes: number | null;
    chips: QuickAddParsedChip[];
    tokens: QuickAddMatchedToken[];
}

const PROJECT_TOKEN_PATTERN = /(^|\s)#([a-z0-9][a-z0-9_-]*)/gi;
const PRIORITY_TOKEN_PATTERN = /(^|\s)(p[123])\b/gi;
const DATE_TOKEN_PATTERN = /(^|\s)(today|tomorrow|tmr)\b/gi;
const NEXT_WEEKDAY_PATTERN =
    /(^|\s)(next\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun))\b/gi;
const ESTIMATE_TOKEN_PATTERN = /(^|\s)(\d+\s*h(?:\s*\d+\s*m)?|\d+\s*m)\b/gi;

const PRIORITY_LABELS: Record<TaskPriority, string> = {
    high: "High",
    medium: "Medium",
    low: "Low",
};

const PRIORITY_BY_TOKEN: Record<string, TaskPriority> = {
    p1: "high",
    p2: "medium",
    p3: "low",
};

const WEEKDAY_INDEX_BY_TOKEN: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    tues: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    thur: 4,
    thurs: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
};

function normalizeProjectName(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[_-]+/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function buildProjectLookup(lists: TodoList[]) {
    const lookup = new Map<string, QuickAddParsedProject>();

    lists.forEach((list) => {
        const normalized = normalizeProjectName(list.name);
        if (!normalized) return;

        const project = {
            listId: list.id,
            label: list.name,
        };

        if (!lookup.has(normalized)) {
            lookup.set(normalized, project);
        }

        const compact = normalized.replace(/\s+/g, "");
        if (compact && !lookup.has(compact)) {
            lookup.set(compact, project);
        }
    });

    return lookup;
}

function getNextWeekday(referenceDate: Date, targetDay: number) {
    const currentDay = referenceDate.getDay();
    const diff = (targetDay - currentDay + 7) % 7 || 7;
    const nextDate = new Date(referenceDate);
    nextDate.setDate(referenceDate.getDate() + diff);
    return nextDate;
}

function formatEstimateLabel(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    }
    if (hours > 0) {
        return `${hours}h`;
    }
    return `${minutes}m`;
}

function parseEstimateToken(token: string) {
    const normalized = token.trim().toLowerCase();
    const hoursMatch = /(\d+)\s*h/.exec(normalized);
    const minutesMatch = /(\d+)\s*m/.exec(normalized);
    const hours = hoursMatch ? Number.parseInt(hoursMatch[1] ?? "0", 10) : 0;
    const minutes = minutesMatch ? Number.parseInt(minutesMatch[1] ?? "0", 10) : 0;
    const totalMinutes = hours * 60 + minutes;

    if (totalMinutes <= 0) return null;

    return {
        value: totalMinutes,
        label: formatEstimateLabel(totalMinutes),
    } satisfies QuickAddParsedEstimate;
}

function getTokenStart(matchIndex: number, leadingWhitespace: string) {
    return matchIndex + leadingWhitespace.length;
}

function getNormalizedTokens(tokens: QuickAddMatchedToken[]) {
    if (tokens.length === 0) return [];

    const sorted = [...tokens].sort((a, b) => {
        if (a.start !== b.start) return a.start - b.start;
        return b.end - a.end;
    });
    const normalized: QuickAddMatchedToken[] = [];

    sorted.forEach((token) => {
        const previous = normalized[normalized.length - 1];
        if (!previous || token.start >= previous.end) {
            normalized.push({ ...token });
            return;
        }

        if (token.start === previous.start && token.end > previous.end) {
            normalized[normalized.length - 1] = { ...token };
        }
    });

    return normalized;
}

function stripRecognizedTokens(rawInput: string, tokens: QuickAddMatchedToken[]) {
    if (tokens.length === 0) {
        return rawInput.trim();
    }

    let cursor = 0;
    let title = "";

    getNormalizedTokens(tokens).forEach((token) => {
        title += rawInput.slice(cursor, token.start);
        cursor = token.end;
    });

    title += rawInput.slice(cursor);

    return title.replace(/\s+/g, " ").trim();
}

export function parseQuickAddInput(input: string, lists: TodoList[], now = new Date()): QuickAddParseResult {
    const tokens: QuickAddMatchedToken[] = [];
    const projectLookup = buildProjectLookup(lists);
    let parsedProject: QuickAddParsedProject | null = null;
    let parsedDate: QuickAddParsedDate | null = null;
    let parsedPriority: QuickAddParsedPriority | null = null;
    let parsedEstimate: QuickAddParsedEstimate | null = null;

    for (const match of input.matchAll(PROJECT_TOKEN_PATTERN)) {
        const leadingWhitespace = match[1] ?? "";
        const rawToken = match[0]?.slice(leadingWhitespace.length) ?? "";
        const projectToken = normalizeProjectName(match[2] ?? "");
        const project = projectLookup.get(projectToken) ?? null;
        const matchIndex = match.index ?? -1;

        if (!project || matchIndex === -1) continue;

        parsedProject = project;
        const start = getTokenStart(matchIndex, leadingWhitespace);
        tokens.push({ kind: "project", start, end: start + rawToken.length });
    }

    for (const match of input.matchAll(NEXT_WEEKDAY_PATTERN)) {
        const leadingWhitespace = match[1] ?? "";
        const rawToken = match[0]?.slice(leadingWhitespace.length) ?? "";
        const weekdayToken = (match[3] ?? "").toLowerCase();
        const weekdayIndex = WEEKDAY_INDEX_BY_TOKEN[weekdayToken];
        const matchIndex = match.index ?? -1;

        if (weekdayIndex == null || matchIndex === -1) continue;

        const nextDate = getNextWeekday(now, weekdayIndex);
        parsedDate = {
            value: format(nextDate, "yyyy-MM-dd"),
            label: `Next ${format(nextDate, "EEEE")}`,
        };
        const start = getTokenStart(matchIndex, leadingWhitespace);
        tokens.push({ kind: "date", start, end: start + rawToken.length });
    }

    for (const match of input.matchAll(DATE_TOKEN_PATTERN)) {
        const leadingWhitespace = match[1] ?? "";
        const rawToken = match[0]?.slice(leadingWhitespace.length) ?? "";
        const dateToken = (match[2] ?? "").toLowerCase();
        const matchIndex = match.index ?? -1;

        if (matchIndex === -1) continue;

        const parsedDateValue = new Date(now);
        if (dateToken === "tomorrow" || dateToken === "tmr") {
            parsedDateValue.setDate(parsedDateValue.getDate() + 1);
        }

        parsedDate = {
            value: format(parsedDateValue, "yyyy-MM-dd"),
            label: dateToken === "today" ? "Today" : "Tomorrow",
        };
        const start = getTokenStart(matchIndex, leadingWhitespace);
        tokens.push({ kind: "date", start, end: start + rawToken.length });
    }

    for (const match of input.matchAll(PRIORITY_TOKEN_PATTERN)) {
        const leadingWhitespace = match[1] ?? "";
        const rawToken = match[0]?.slice(leadingWhitespace.length) ?? "";
        const priorityToken = (match[2] ?? "").toLowerCase();
        const priority = PRIORITY_BY_TOKEN[priorityToken];
        const matchIndex = match.index ?? -1;

        if (!priority || matchIndex === -1) continue;

        parsedPriority = {
            value: priority,
            label: PRIORITY_LABELS[priority],
        };
        const start = getTokenStart(matchIndex, leadingWhitespace);
        tokens.push({ kind: "priority", start, end: start + rawToken.length });
    }

    for (const match of input.matchAll(ESTIMATE_TOKEN_PATTERN)) {
        const leadingWhitespace = match[1] ?? "";
        const rawToken = match[0]?.slice(leadingWhitespace.length) ?? "";
        const estimate = parseEstimateToken(match[2] ?? "");
        const matchIndex = match.index ?? -1;

        if (!estimate || matchIndex === -1) continue;

        parsedEstimate = estimate;
        const start = getTokenStart(matchIndex, leadingWhitespace);
        tokens.push({ kind: "estimate", start, end: start + rawToken.length });
    }

    const chips: QuickAddParsedChip[] = [];
    if (parsedProject) {
        chips.push({ kind: "project", label: "Project", value: parsedProject.label });
    }
    if (parsedDate) {
        chips.push({ kind: "date", label: "Due", value: parsedDate.label });
    }
    if (parsedPriority) {
        chips.push({ kind: "priority", label: "Priority", value: parsedPriority.label });
    }
    if (parsedEstimate) {
        chips.push({ kind: "estimate", label: "Estimate", value: parsedEstimate.label });
    }

    const normalizedTokens = getNormalizedTokens(tokens);

    return {
        title: stripRecognizedTokens(input, normalizedTokens),
        listId: parsedProject?.listId ?? null,
        dueDate: parsedDate?.value ?? null,
        priority: parsedPriority?.value ?? null,
        estimatedMinutes: parsedEstimate?.value ?? null,
        chips,
        tokens: normalizedTokens,
    };
}
