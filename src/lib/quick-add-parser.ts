import { format } from "date-fns";

import { normalizeTaskLabelName } from "~/lib/task-labels";
import { getRecurrenceLabel } from "~/lib/task-recurrence";
import { getReminderOffsetLabel } from "~/lib/task-reminders";
import type { RecurrenceRule, TaskLabel, TodoList, TodoRow } from "~/lib/types";

type TaskPriority = NonNullable<TodoRow["priority"]>;
type QuickAddChipKind = "date" | "estimate" | "label" | "priority" | "project" | "recurrence" | "reminder" | "time";
type QuickAddEntityKind = "project" | "label";

export interface QuickAddMatchedToken {
    kind: QuickAddChipKind;
    start: number;
    end: number;
}

export interface QuickAddSuggestion {
    description: string;
    id: string;
    insertValue: string;
    isExisting: boolean;
    kind: QuickAddEntityKind;
    label: string;
}

export interface QuickAddActiveSuggestionState {
    end: number;
    kind: QuickAddEntityKind;
    query: string;
    start: number;
    suggestions: QuickAddSuggestion[];
}

interface QuickAddParsedChip {
    kind: QuickAddChipKind;
    label: string;
    value: string;
}

interface QuickAddParsedProject {
    isExisting: boolean;
    label: string;
    listId: string | null;
}

interface QuickAddParsedDate {
    value: string;
    label: string;
}

interface QuickAddParsedTime {
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

interface QuickAddParsedReminder {
    value: number;
    label: string;
}

interface QuickAddParsedRecurrence {
    value: RecurrenceRule;
    label: string;
}

interface QuickAddParsedLabel {
    isExisting: boolean;
    value: string;
    label: string;
}

interface QuickAddPendingToken<T> {
    end: number;
    parsed: T;
    start: number;
}

interface QuickAddParseOptions {
    labels?: Array<Pick<TaskLabel, "id" | "name">>;
    now?: Date;
}

interface QuickAddProjectLookupItem {
    label: string;
    listId: string;
}

interface QuickAddLabelLookupItem {
    id?: string;
    label: string;
}

interface QuickAddEntitySegment {
    end: number;
    kind: QuickAddEntityKind;
    query: string;
    start: number;
}

export interface QuickAddParseResult {
    chips: QuickAddParsedChip[];
    dueDate: string | null;
    dueTime: string | null;
    estimatedMinutes: number | null;
    hasLabelTokens: boolean;
    hasProjectToken: boolean;
    labelNames: string[];
    listId: string | null;
    pendingProjectName: string | null;
    priority: TaskPriority | null;
    projectName: string | null;
    recurrenceRule: RecurrenceRule | null;
    reminderOffsetMinutes: number | null;
    title: string;
    tokens: QuickAddMatchedToken[];
}

const ENTITY_TRIGGER_CHARS = new Set(["#", "+"]);
const PRIORITY_TOKEN_PATTERN = /(^|\s)(p[123])\b/gi;
const DATE_TOKEN_PATTERN = /(^|\s)(today|tomorrow|tmr)\b/gi;
const NEXT_WEEKDAY_PATTERN =
    /(^|\s)(next\s+(monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat|sunday|sun))\b/gi;
const TIME_TOKEN_PATTERN = /(^|\s)(\d{1,2}(?::\d{2})?\s*(?:am|pm)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/gi;
const ESTIMATE_TOKEN_PATTERN = /(^|\s)(\d+\s*h(?:\s*\d+\s*m)?|\d+\s*m)\b/gi;
const REMINDER_TOKEN_PATTERN = /(^|\s)(r\s*\d+\s*(?:m|h|d))\b/gi;
const RECURRENCE_TOKEN_PATTERN = /(^|\s)(every\s+(?:day|weekday|weekdays|week|month))\b/gi;

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

const RECURRENCE_BY_TOKEN: Record<string, RecurrenceRule> = {
    "every day": "daily",
    "every weekday": "weekdays",
    "every weekdays": "weekdays",
    "every week": "weekly",
    "every month": "monthly",
};

function collapseWhitespace(value: string) {
    return value.replace(/\s+/g, " ").trim();
}

function normalizeProjectName(value: string) {
    return collapseWhitespace(
        value
            .toLowerCase()
            .replace(/[_-]+/g, " ")
            .replace(/[^a-z0-9\s]/g, " "),
    );
}

function normalizeInlineLabelName(value: string) {
    return normalizeTaskLabelName(value.replace(/[_-]+/g, " "));
}

function buildProjectLookup(lists: TodoList[]) {
    const lookup = new Map<string, QuickAddProjectLookupItem>();

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

function buildLabelLookup(labels: Array<Pick<TaskLabel, "id" | "name">>) {
    const lookup = new Map<string, QuickAddLabelLookupItem>();

    labels.forEach((label) => {
        const normalized = normalizeInlineLabelName(label.name);
        if (!normalized) return;

        if (!lookup.has(normalized.toLowerCase())) {
            lookup.set(normalized.toLowerCase(), {
                id: label.id,
                label: label.name,
            });
        }
    });

    return lookup;
}

function collectSyntaxTokenStarts(input: string) {
    const starts = new Set<number>();
    const patterns = [
        PRIORITY_TOKEN_PATTERN,
        DATE_TOKEN_PATTERN,
        NEXT_WEEKDAY_PATTERN,
        TIME_TOKEN_PATTERN,
        ESTIMATE_TOKEN_PATTERN,
        REMINDER_TOKEN_PATTERN,
        RECURRENCE_TOKEN_PATTERN,
    ];

    patterns.forEach((pattern) => {
        pattern.lastIndex = 0;
        for (const match of input.matchAll(pattern)) {
            const leadingWhitespace = match[1] ?? "";
            const matchIndex = match.index ?? -1;
            if (matchIndex === -1) continue;
            starts.add(matchIndex + leadingWhitespace.length);
        }
    });

    return Array.from(starts).sort((a, b) => a - b);
}

function collectEntityTriggerStarts(input: string) {
    const starts: number[] = [];

    for (let index = 0; index < input.length; index += 1) {
        const character = input[index];
        if (!character || !ENTITY_TRIGGER_CHARS.has(character)) continue;

        const previousCharacter = input[index - 1];
        if (index === 0 || (previousCharacter && /\s/.test(previousCharacter))) {
            starts.push(index);
        }
    }

    return starts;
}

function getEntityBoundaryEnd(
    input: string,
    start: number,
    entityStarts: number[],
    syntaxTokenStarts: number[],
) {
    let boundaryEnd = input.length;

    for (const candidateStart of entityStarts) {
        if (candidateStart > start) {
            boundaryEnd = Math.min(boundaryEnd, candidateStart);
            break;
        }
    }

    for (const candidateStart of syntaxTokenStarts) {
        if (candidateStart > start) {
            boundaryEnd = Math.min(boundaryEnd, candidateStart);
            break;
        }
    }

    const newlineIndex = input.indexOf("\n", start + 1);
    if (newlineIndex !== -1) {
        boundaryEnd = Math.min(boundaryEnd, newlineIndex);
    }

    const zwsIndex = input.indexOf("\u200B", start + 1);
    if (zwsIndex !== -1) {
        boundaryEnd = Math.min(boundaryEnd, zwsIndex);
    }

    return boundaryEnd;
}

function trimEntityRange(input: string, start: number, end: number) {
    let trimmedStart = start;
    let trimmedEnd = end;

    while (trimmedStart < trimmedEnd && /\s/.test(input[trimmedStart] ?? "")) {
        trimmedStart += 1;
    }

    while (trimmedEnd > trimmedStart && /\s/.test(input[trimmedEnd - 1] ?? "")) {
        trimmedEnd -= 1;
    }

    return {
        trimmedEnd,
        trimmedStart,
    };
}

function collectEntitySegments(
    input: string,
    entityStarts: number[],
    syntaxTokenStarts: number[],
) {
    const segments: QuickAddEntitySegment[] = [];

    entityStarts.forEach((start) => {
        const trigger = input[start];
        if (!trigger) return;

        const boundaryEnd = getEntityBoundaryEnd(input, start, entityStarts, syntaxTokenStarts);
        const { trimmedEnd, trimmedStart } = trimEntityRange(input, start + 1, boundaryEnd);
        const rawQuery = input.slice(trimmedStart, trimmedEnd);
        const queryRaw = rawQuery.replace(/\u200B/g, "");
        const query = trigger === "#"
            ? collapseWhitespace(queryRaw)
            : normalizeInlineLabelName(queryRaw);

        if (!query) return;

        let segmentEnd = trimmedEnd;
        if (input[boundaryEnd] === "\u200B") {
            segmentEnd = boundaryEnd + 1;
        }

        segments.push({
            kind: trigger === "#" ? "project" : "label",
            start,
            end: segmentEnd,
            query,
        });
    });

    return segments;
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

function formatTimeLabel(value: string) {
    const [hoursString, minutesString] = value.split(":");
    const previewDate = new Date(2026, 0, 1, Number.parseInt(hoursString ?? "0", 10), Number.parseInt(minutesString ?? "0", 10));
    return format(previewDate, "h:mm a");
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

function parseTimeToken(token: string) {
    const normalized = token.trim().toLowerCase().replace(/\s+/g, "");

    const meridiemMatch = /^(\d{1,2})(?::(\d{2}))?(am|pm)$/.exec(normalized);
    if (meridiemMatch) {
        const hours = Number.parseInt(meridiemMatch[1] ?? "0", 10);
        const minutes = Number.parseInt(meridiemMatch[2] ?? "0", 10);
        const meridiem = meridiemMatch[3];
        if (!Number.isFinite(hours) || hours < 1 || hours > 12 || !Number.isFinite(minutes) || minutes > 59) {
            return null;
        }

        const hours24 = meridiem === "pm"
            ? (hours % 12) + 12
            : hours % 12;
        const value = `${String(hours24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;

        return {
            value,
            label: formatTimeLabel(value),
        } satisfies QuickAddParsedTime;
    }

    const twentyFourHourMatch = /^(\d{1,2}):(\d{2})$/.exec(normalized);
    if (!twentyFourHourMatch) return null;

    const hours = Number.parseInt(twentyFourHourMatch[1] ?? "0", 10);
    const minutes = Number.parseInt(twentyFourHourMatch[2] ?? "0", 10);
    if (!Number.isFinite(hours) || hours > 23 || !Number.isFinite(minutes) || minutes > 59) {
        return null;
    }

    const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    return {
        value,
        label: formatTimeLabel(value),
    } satisfies QuickAddParsedTime;
}

function parseReminderToken(token: string) {
    const normalized = token.trim().toLowerCase().replace(/\s+/g, "");
    const match = /^r(\d+)(m|h|d)$/.exec(normalized);
    if (!match) return null;

    const amount = Number.parseInt(match[1] ?? "0", 10);
    const unit = match[2];
    if (!Number.isFinite(amount) || amount <= 0) return null;

    const multiplier = unit === "d" ? 1440 : unit === "h" ? 60 : 1;
    const value = amount * multiplier;

    return {
        value,
        label: getReminderOffsetLabel(value),
    } satisfies QuickAddParsedReminder;
}

function parseRecurrenceToken(token: string) {
    const normalized = token.trim().toLowerCase().replace(/\s+/g, " ");
    const value = RECURRENCE_BY_TOKEN[normalized];
    if (!value) return null;

    return {
        value,
        label: getRecurrenceLabel(value),
    } satisfies QuickAddParsedRecurrence;
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
        return rawInput.replace(/\u200B/g, "").trim();
    }

    let cursor = 0;
    let title = "";

    getNormalizedTokens(tokens).forEach((token) => {
        title += rawInput.slice(cursor, token.start);
        cursor = token.end;
    });

    title += rawInput.slice(cursor);

    return title.replace(/\u200B/g, "").replace(/\s+/g, " ").trim();
}

function toQuickAddParseOptions(nowOrOptions?: Date | QuickAddParseOptions) {
    if (nowOrOptions instanceof Date) {
        return {
            labels: [] as Array<Pick<TaskLabel, "id" | "name">>,
            now: nowOrOptions,
        };
    }

    return {
        labels: nowOrOptions?.labels ?? [],
        now: nowOrOptions?.now ?? new Date(),
    };
}

function scoreSuggestion(name: string, query: string, normalize: (value: string) => string) {
    if (!query) return 0;

    const normalizedName = normalize(name);
    const normalizedQuery = normalize(query);
    const compactName = normalizedName.replace(/\s+/g, "");
    const compactQuery = normalizedQuery.replace(/\s+/g, "");

    if (normalizedName === normalizedQuery || compactName === compactQuery) return 0;
    if (normalizedName.startsWith(normalizedQuery) || compactName.startsWith(compactQuery)) return 1;
    if (normalizedName.includes(` ${normalizedQuery}`)) return 2;
    if (normalizedName.includes(normalizedQuery) || compactName.includes(compactQuery)) return 3;
    return 4;
}

function buildProjectSuggestions(
    query: string,
    lists: TodoList[],
) {
    const normalizedQuery = collapseWhitespace(query);
    const existingSuggestions = [...lists]
        .map((list) => ({
            description: "Existing project",
            id: `project-${list.id}`,
            insertValue: list.name,
            isExisting: true,
            kind: "project" as const,
            label: list.name,
            score: scoreSuggestion(list.name, normalizedQuery, normalizeProjectName),
        }))
        .filter((option) => normalizedQuery ? option.score < 4 : true)
        .sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            return a.label.localeCompare(b.label);
        })
        .slice(0, 6);

    const normalizedMatchQuery = normalizeProjectName(normalizedQuery);
    const hasExactMatch = normalizedQuery
        ? lists.some((list) => {
            const normalizedName = normalizeProjectName(list.name);
            return normalizedName === normalizedMatchQuery
                || normalizedName.replace(/\s+/g, "") === normalizedMatchQuery.replace(/\s+/g, "");
        })
        : false;

    const createSuggestion = normalizedQuery && !hasExactMatch
        ? [{
            description: "Create new project",
            id: `create-project-${normalizedQuery.toLowerCase()}`,
            insertValue: normalizedQuery,
            isExisting: false,
            kind: "project" as const,
            label: normalizedQuery,
        }]
        : [];

    return [...createSuggestion, ...existingSuggestions.map(({ score: _score, ...option }) => option)];
}

function buildLabelSuggestions(
    query: string,
    labels: Array<Pick<TaskLabel, "id" | "name">>,
) {
    const normalizedQuery = normalizeInlineLabelName(query);
    const existingSuggestions = [...labels]
        .map((label) => ({
            description: "Existing label",
            id: `label-${label.id ?? label.name.toLowerCase()}`,
            insertValue: label.name,
            isExisting: true,
            kind: "label" as const,
            label: label.name,
            score: scoreSuggestion(label.name, normalizedQuery, (value) => normalizeInlineLabelName(value).toLowerCase()),
        }))
        .filter((option) => normalizedQuery ? option.score < 4 : true)
        .sort((a, b) => {
            if (a.score !== b.score) return a.score - b.score;
            return a.label.localeCompare(b.label);
        })
        .slice(0, 6);

    const hasExactMatch = normalizedQuery
        ? labels.some((label) => normalizeInlineLabelName(label.name).toLowerCase() === normalizedQuery.toLowerCase())
        : false;

    const createSuggestion = normalizedQuery && !hasExactMatch
        ? [{
            description: "Create new label",
            id: `create-label-${normalizedQuery.toLowerCase()}`,
            insertValue: normalizedQuery,
            isExisting: false,
            kind: "label" as const,
            label: normalizedQuery,
        }]
        : [];

    return [...createSuggestion, ...existingSuggestions.map(({ score: _score, ...option }) => option)];
}

export function getQuickAddActiveSuggestionState(
    input: string,
    caretIndex: number,
    lists: TodoList[],
    labels: Array<Pick<TaskLabel, "id" | "name">> = [],
): QuickAddActiveSuggestionState | null {
    if (caretIndex < 0) return null;

    const entityStarts = collectEntityTriggerStarts(input);
    const syntaxTokenStarts = collectSyntaxTokenStarts(input);

    for (let index = entityStarts.length - 1; index >= 0; index -= 1) {
        const start = entityStarts[index];
        if (start == null || caretIndex < start + 1) continue;

        const boundaryEnd = getEntityBoundaryEnd(input, start, entityStarts, syntaxTokenStarts);
        
        let effectiveBoundaryEnd = boundaryEnd;
        if (input[boundaryEnd] === "\u200B") {
            effectiveBoundaryEnd = boundaryEnd + 1;
        }

        if (caretIndex > effectiveBoundaryEnd) continue;

        const trigger = input[start];
        if (!trigger) continue;

        const queryRaw = input.slice(start + 1, caretIndex).replace(/\u200B/g, "");
        const query = trigger === "#"
            ? collapseWhitespace(queryRaw)
            : normalizeInlineLabelName(queryRaw);
            
        const suggestions = trigger === "#"
            ? buildProjectSuggestions(query, lists)
            : buildLabelSuggestions(query, labels);

        return {
            kind: trigger === "#" ? "project" : "label",
            query,
            start,
            end: effectiveBoundaryEnd,
            suggestions,
        };
    }

    return null;
}

export function applyQuickAddSuggestion(
    input: string,
    state: QuickAddActiveSuggestionState,
    suggestion: QuickAddSuggestion,
) {
    const replacementPrefix = state.kind === "project" ? "#" : "+";
    const replacement = `${replacementPrefix}${suggestion.insertValue}\u200B`;
    
    let suffix = input.slice(state.end);
    if (suffix.startsWith("\u200B")) {
        suffix = suffix.slice(1);
    }
    
    const needsTrailingSpace = suffix.length === 0 || !/^\s/.test(suffix);
    const insertedText = needsTrailingSpace ? `${replacement} ` : replacement;

    return {
        selection: state.start + insertedText.length,
        value: `${input.slice(0, state.start)}${insertedText}${suffix}`,
    };
}

export function parseQuickAddInput(
    input: string,
    lists: TodoList[],
    nowOrOptions?: Date | QuickAddParseOptions,
): QuickAddParseResult {
    const { labels, now } = toQuickAddParseOptions(nowOrOptions);
    const tokens: QuickAddMatchedToken[] = [];
    const projectLookup = buildProjectLookup(lists);
    const labelLookup = buildLabelLookup(labels);
    let parsedProject: QuickAddParsedProject | null = null;
    let parsedDate: QuickAddParsedDate | null = null;
    let parsedTime: QuickAddParsedTime | null = null;
    let parsedPriority: QuickAddParsedPriority | null = null;
    let parsedEstimate: QuickAddParsedEstimate | null = null;
    let parsedReminder: QuickAddParsedReminder | null = null;
    let parsedRecurrence: QuickAddParsedRecurrence | null = null;
    let hasProjectToken = false;
    let hasLabelTokens = false;
    const parsedLabels: QuickAddParsedLabel[] = [];
    const seenLabelNames = new Set<string>();
    const pendingTimeTokens: Array<QuickAddPendingToken<QuickAddParsedTime>> = [];

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

    for (const match of input.matchAll(TIME_TOKEN_PATTERN)) {
        const leadingWhitespace = match[1] ?? "";
        const rawToken = match[0]?.slice(leadingWhitespace.length) ?? "";
        const parsed = parseTimeToken(match[2] ?? "");
        const matchIndex = match.index ?? -1;

        if (!parsed || matchIndex === -1) continue;

        const start = getTokenStart(matchIndex, leadingWhitespace);
        pendingTimeTokens.push({
            parsed,
            start,
            end: start + rawToken.length,
        });
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

    for (const match of input.matchAll(REMINDER_TOKEN_PATTERN)) {
        const leadingWhitespace = match[1] ?? "";
        const rawToken = match[0]?.slice(leadingWhitespace.length) ?? "";
        const reminder = parseReminderToken(match[2] ?? "");
        const matchIndex = match.index ?? -1;

        if (!reminder || matchIndex === -1) continue;

        parsedReminder = reminder;
        const start = getTokenStart(matchIndex, leadingWhitespace);
        tokens.push({ kind: "reminder", start, end: start + rawToken.length });
    }

    for (const match of input.matchAll(RECURRENCE_TOKEN_PATTERN)) {
        const leadingWhitespace = match[1] ?? "";
        const rawToken = match[0]?.slice(leadingWhitespace.length) ?? "";
        const recurrence = parseRecurrenceToken(match[2] ?? "");
        const matchIndex = match.index ?? -1;

        if (!recurrence || matchIndex === -1) continue;

        parsedRecurrence = recurrence;
        const start = getTokenStart(matchIndex, leadingWhitespace);
        tokens.push({ kind: "recurrence", start, end: start + rawToken.length });
    }

    const entityStarts = collectEntityTriggerStarts(input);
    const syntaxTokenStarts = collectSyntaxTokenStarts(input);
    const entitySegments = collectEntitySegments(input, entityStarts, syntaxTokenStarts);

    for (const segment of entitySegments) {
        if (segment.kind === "project") {
            hasProjectToken = true;

            const normalizedProject = normalizeProjectName(segment.query);
            const project = projectLookup.get(normalizedProject) ?? projectLookup.get(normalizedProject.replace(/\s+/g, "")) ?? null;
            parsedProject = project
                ? {
                    listId: project.listId,
                    label: project.label,
                    isExisting: true,
                }
                : {
                    listId: null,
                    label: collapseWhitespace(segment.query),
                    isExisting: false,
                };
            tokens.push({ kind: "project", start: segment.start, end: segment.end });
            continue;
        }

        hasLabelTokens = true;
        const normalizedLabel = normalizeInlineLabelName(segment.query);
        if (!normalizedLabel) continue;

        const normalizedKey = normalizedLabel.toLowerCase();
        if (!seenLabelNames.has(normalizedKey)) {
            const existingLabel = labelLookup.get(normalizedKey) ?? null;
            seenLabelNames.add(normalizedKey);
            parsedLabels.push({
                value: normalizedLabel,
                label: existingLabel?.label ?? normalizedLabel,
                isExisting: Boolean(existingLabel),
            });
        }

        tokens.push({ kind: "label", start: segment.start, end: segment.end });
    }

    if (parsedDate) {
        const pendingTime = pendingTimeTokens[pendingTimeTokens.length - 1];
        if (pendingTime) {
            parsedTime = pendingTime.parsed;
            tokens.push({ kind: "time", start: pendingTime.start, end: pendingTime.end });
        }
    }

    const chips: QuickAddParsedChip[] = [];
    if (parsedProject) {
        chips.push({
            kind: "project",
            label: parsedProject.isExisting ? "Project" : "New project",
            value: parsedProject.label,
        });
    }
    if (parsedDate) {
        chips.push({ kind: "date", label: "Due", value: parsedDate.label });
    }
    if (parsedTime) {
        chips.push({ kind: "time", label: "Time", value: parsedTime.label });
    }
    if (parsedPriority) {
        chips.push({ kind: "priority", label: "Priority", value: parsedPriority.label });
    }
    if (parsedEstimate) {
        chips.push({ kind: "estimate", label: "Duration", value: parsedEstimate.label });
    }
    if (parsedReminder) {
        chips.push({ kind: "reminder", label: "Reminder", value: parsedReminder.label });
    }
    if (parsedRecurrence) {
        chips.push({ kind: "recurrence", label: "Repeat", value: parsedRecurrence.label });
    }
    parsedLabels.forEach((label) => {
        chips.push({
            kind: "label",
            label: label.isExisting ? "Label" : "New label",
            value: label.label,
        });
    });

    const normalizedTokens = getNormalizedTokens(tokens);

    return {
        title: stripRecognizedTokens(input, normalizedTokens),
        hasProjectToken,
        projectName: parsedProject?.label ?? null,
        pendingProjectName: parsedProject && !parsedProject.isExisting ? parsedProject.label : null,
        listId: parsedProject?.listId ?? null,
        dueDate: parsedDate?.value ?? null,
        dueTime: parsedTime?.value ?? null,
        priority: parsedPriority?.value ?? null,
        estimatedMinutes: parsedEstimate?.value ?? null,
        reminderOffsetMinutes: parsedReminder?.value ?? null,
        recurrenceRule: parsedRecurrence?.value ?? null,
        hasLabelTokens,
        labelNames: parsedLabels.map((label) => label.value),
        chips,
        tokens: normalizedTokens,
    };
}
