"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { addDays, startOfDay } from "date-fns";

import { useData } from "~/components/data-provider";
import {
    buildPlannedMinutesByTodo,
    getRemainingEstimatedMinutes,
    getTaskPlanningStatus,
    PLANNED_BLOCK_FIELDS,
} from "~/lib/planning";
import { buildProjectSummary, type ProjectSummary } from "~/lib/project-summaries";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { subscribeToFocusSessionCompleted } from "~/lib/focus-session-events";
import {
    areTaskLabelCollectionsEqual,
    buildTaskLabelsByTodo,
    normalizeTaskLabel,
    TASK_LABEL_FIELDS,
    TODO_LABEL_LINK_FIELDS,
} from "~/lib/task-labels";
import {
    TODO_FIELDS,
    normalizeTodoRow,
} from "~/lib/task-actions";
import { getSmartViewTasks, type SmartView } from "~/lib/task-views";
import type { PlannedFocusBlock, PlanningStatus, ProjectMemberProfile, TaskLabel, TodoImageRow, TodoLabelLinkRow, TodoList, TodoListMember, TodoRow } from "~/lib/types";

export interface TaskDatasetRecord extends TodoRow {
    has_planned_block: boolean;
    labels: TaskLabel[];
    planned_minutes: number;
    remaining_estimated_minutes: number | null;
    planning_status: PlanningStatus;
}

type SmartViewCounts = Record<SmartView, number>;

interface TaskDatasetValue {
    userId: string | null;
    lists: TodoList[];
    tasks: TaskDatasetRecord[];
    taskLabels: TaskLabel[];
    plannedBlocks: PlannedFocusBlock[];
    imagesByTodo: Record<string, TodoImageRow[]>;
    memberCounts: Record<string, number>;
    membersByListId: Record<string, ProjectMemberProfile[]>;
    projectSummaries: ProjectSummary[];
    orderedProjectSummaries: ProjectSummary[];
    smartViewCounts: SmartViewCounts;
    todayFocusMinutes: number;
    loading: boolean;
    applyTaskPatch: (taskId: string, patch: Partial<TaskDatasetRecord>) => void;
    removeTask: (taskId: string, options?: { suppressRealtimeEcho?: boolean }) => void;
    removePlannedBlock: (blockId: string, options?: { suppressRealtimeEcho?: boolean }) => void;
    saveProjectOrder: (nextProjectIds: string[]) => void;
    upsertPlannedBlock: (block: PlannedFocusBlock, options?: { suppressRealtimeEcho?: boolean }) => void;
    upsertTaskLabels: (labels: TaskLabel[]) => void;
    upsertTask: (task: TodoRow, options?: { suppressRealtimeEcho?: boolean }) => void;
    refresh: (options?: { silent?: boolean }) => Promise<void>;
}

const WorkspaceDataContext = createContext<TaskDatasetValue | undefined>(undefined);

interface TodoListMemberRow extends TodoListMember {
    inserted_at: string;
}

interface MemberProfileRow {
    id: string;
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
}

interface FocusSessionSummaryRow {
    id: string;
    duration_seconds: number;
    mode: string;
    inserted_at: string;
}

const PROJECT_ORDER_STORAGE_KEY_PREFIX = "list-order-";
const ATTACHMENT_FIELDS = "id, todo_id, user_id, list_id, path, original_name, mime_type, size_bytes, inserted_at";

function normalizeProjectOrderIds(value: string[] | null | undefined) {
    if (!Array.isArray(value)) return null;

    return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0)));
}

function loadProjectOrderFromStorage(userId: string) {
    const storageKey = `${PROJECT_ORDER_STORAGE_KEY_PREFIX}${userId}`;
    const savedOrder = window.localStorage.getItem(storageKey);

    if (!savedOrder) {
        return [];
    }

    try {
        const parsedOrder = JSON.parse(savedOrder) as unknown;
        if (!Array.isArray(parsedOrder)) {
            return [];
        }

        return Array.from(new Set(parsedOrder.filter((item): item is string => typeof item === "string" && item.length > 0)));
    } catch (error) {
        console.error("Failed to parse project order.", error);
        return [];
    }
}

function saveProjectOrderToStorage(userId: string, projectIds: string[]) {
    window.localStorage.setItem(
        `${PROJECT_ORDER_STORAGE_KEY_PREFIX}${userId}`,
        JSON.stringify(projectIds),
    );
}

function isMissingProjectOrderPreferenceColumnError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return code === "PGRST204" && message.includes("project_order_ids");
}

function sortTasksByInsertedAt(tasks: TaskDatasetRecord[]) {
    return [...tasks].sort((a, b) => (a.inserted_at ?? "").localeCompare(b.inserted_at ?? ""));
}

function sortPlannedBlocks(blocks: PlannedFocusBlock[]) {
    return [...blocks].sort((a, b) => {
        const startComparison = a.scheduled_start.localeCompare(b.scheduled_start);
        if (startComparison !== 0) return startComparison;
        return a.id.localeCompare(b.id);
    });
}

function normalizePlannedBlock(block: PlannedFocusBlock): PlannedFocusBlock {
    return {
        ...block,
        todo_id: block.todo_id ?? null,
    };
}

function arePlannedBlocksEqual(a: PlannedFocusBlock, b: PlannedFocusBlock) {
    return a.id === b.id
        && a.user_id === b.user_id
        && a.list_id === b.list_id
        && (a.todo_id ?? null) === (b.todo_id ?? null)
        && a.title === b.title
        && a.scheduled_start === b.scheduled_start
        && a.scheduled_end === b.scheduled_end
        && a.inserted_at === b.inserted_at
        && a.updated_at === b.updated_at;
}

function arePlannedBlockCollectionsEqual(current: PlannedFocusBlock[], next: PlannedFocusBlock[]) {
    if (current.length !== next.length) return false;

    return current.every((block, index) => {
        const nextBlock = next[index];
        if (!nextBlock) return false;
        return arePlannedBlocksEqual(block, nextBlock);
    });
}

function buildTaskLabelsByTodoFromRecords(tasks: Array<Pick<TaskDatasetRecord, "id" | "labels">>) {
    return new Map(tasks.map((task) => [task.id, task.labels]));
}

function createTaskDatasetRecord(
    task: TodoRow,
    plannedMinutesByTodo: ReadonlyMap<string, number>,
    taskLabelsByTodo: ReadonlyMap<string, TaskLabel[]> = new Map(),
): TaskDatasetRecord {
    const normalizedTask = normalizeTodoRow(task);
    const plannedMinutes = plannedMinutesByTodo.get(normalizedTask.id) ?? 0;

    return {
        ...normalizedTask,
        has_planned_block: plannedMinutes > 0,
        labels: taskLabelsByTodo.get(normalizedTask.id) ?? [],
        planned_minutes: plannedMinutes,
        remaining_estimated_minutes: getRemainingEstimatedMinutes(normalizedTask.estimated_minutes, plannedMinutes),
        planning_status: getTaskPlanningStatus(normalizedTask.estimated_minutes, plannedMinutes),
    };
}

function hydrateTaskDatasetRecords(
    tasks: TodoRow[],
    plannedBlocks: PlannedFocusBlock[],
    taskLabelsByTodo: ReadonlyMap<string, TaskLabel[]> = new Map(),
) {
    const plannedMinutesByTodo = buildPlannedMinutesByTodo(plannedBlocks);
    return sortTasksByInsertedAt(tasks.map((task) => createTaskDatasetRecord(task, plannedMinutesByTodo, taskLabelsByTodo)));
}

function areTaskRecordsEqual(a: TaskDatasetRecord, b: TaskDatasetRecord) {
    return a.id === b.id
        && a.user_id === b.user_id
        && a.list_id === b.list_id
        && (a.section_id ?? null) === (b.section_id ?? null)
        && (a.assignee_user_id ?? null) === (b.assignee_user_id ?? null)
        && (a.position ?? 0) === (b.position ?? 0)
        && a.title === b.title
        && a.is_done === b.is_done
        && a.inserted_at === b.inserted_at
        && (a.description ?? null) === (b.description ?? null)
        && (a.due_date ?? null) === (b.due_date ?? null)
        && (a.deadline_on ?? null) === (b.deadline_on ?? null)
        && (a.deadline_at ?? null) === (b.deadline_at ?? null)
        && (a.reminder_offset_minutes ?? null) === (b.reminder_offset_minutes ?? null)
        && (a.reminder_at ?? null) === (b.reminder_at ?? null)
        && (a.recurrence_rule ?? null) === (b.recurrence_rule ?? null)
        && (a.priority ?? null) === (b.priority ?? null)
        && (a.estimated_minutes ?? null) === (b.estimated_minutes ?? null)
        && (a.completed_at ?? null) === (b.completed_at ?? null)
        && (a.updated_at ?? null) === (b.updated_at ?? null)
        && areTaskLabelCollectionsEqual(a.labels, b.labels)
        && a.has_planned_block === b.has_planned_block
        && a.planned_minutes === b.planned_minutes
        && (a.remaining_estimated_minutes ?? null) === (b.remaining_estimated_minutes ?? null)
        && a.planning_status === b.planning_status;
}

function upsertNormalizedTaskRecord(
    currentTasks: TaskDatasetRecord[],
    task: TodoRow,
    plannedBlocks: PlannedFocusBlock[],
) {
    const existingTask = currentTasks.find((item) => item.id === task.id);
    const nextTask = createTaskDatasetRecord({
        ...existingTask,
        ...task,
    }, buildPlannedMinutesByTodo(plannedBlocks), buildTaskLabelsByTodoFromRecords(currentTasks));

    if (!existingTask) {
        return sortTasksByInsertedAt([...currentTasks, nextTask]);
    }

    if (areTaskRecordsEqual(existingTask, nextTask)) {
        return currentTasks;
    }

    return sortTasksByInsertedAt(currentTasks.map((item) => item.id === task.id ? nextTask : item));
}

function isMissingTableError(error: unknown, tableName: string) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return (
        code === "PGRST205" ||
        code === "42P01" ||
        message.includes(tableName)
    );
}

async function loadTodoRows(
    supabase: ReturnType<typeof createSupabaseBrowserClient>,
    listIds: string[],
): Promise<TodoRow[]> {
    const { data, error } = await supabase
        .from("todos")
        .select(TODO_FIELDS)
        .in("list_id", listIds);

    if (error) throw error;
    return ((data ?? []) as TodoRow[]).map(normalizeTodoRow);
}

async function loadPlannedBlocks(
    supabase: ReturnType<typeof createSupabaseBrowserClient>,
    userId: string,
): Promise<PlannedFocusBlock[]> {
    const { data, error } = await supabase
        .from("planned_focus_blocks")
        .select(PLANNED_BLOCK_FIELDS)
        .eq("user_id", userId);

    if (!error) {
        return sortPlannedBlocks(((data ?? []) as PlannedFocusBlock[]).map(normalizePlannedBlock));
    }

    if (isMissingTableError(error, "planned_focus_blocks")) {
        return [];
    }

    throw error;
}

async function loadTaskLabels(
    supabase: ReturnType<typeof createSupabaseBrowserClient>,
    userId: string,
): Promise<TaskLabel[]> {
    const { data, error } = await supabase
        .from("task_labels")
        .select(TASK_LABEL_FIELDS)
        .eq("user_id", userId)
        .order("name", { ascending: true });

    if (!error) {
        return ((data ?? []) as TaskLabel[]).map(normalizeTaskLabel);
    }

    if (isMissingTableError(error, "task_labels")) {
        return [];
    }

    throw error;
}

async function loadTodoLabelLinks(
    supabase: ReturnType<typeof createSupabaseBrowserClient>,
    userId: string,
): Promise<TodoLabelLinkRow[]> {
    const { data, error } = await supabase
        .from("todo_label_links")
        .select(TODO_LABEL_LINK_FIELDS)
        .eq("user_id", userId);

    if (!error) {
        return (data ?? []) as TodoLabelLinkRow[];
    }

    if (isMissingTableError(error, "todo_label_links")) {
        return [];
    }

    throw error;
}

async function loadTodoAttachments(
    supabase: ReturnType<typeof createSupabaseBrowserClient>,
    listIds: string[],
): Promise<TodoImageRow[]> {
    const { data, error } = await supabase
        .from("todo_images")
        .select(ATTACHMENT_FIELDS)
        .in("list_id", listIds);

    if (error) throw error;
    return (data ?? []) as TodoImageRow[];
}

function getRealtimeInsertedRowId(payload: { new?: unknown }) {
    const nextRecord = payload.new;
    if (!nextRecord || typeof nextRecord !== "object") return null;

    const nextId = (nextRecord as { id?: unknown }).id;
    return typeof nextId === "string" ? nextId : null;
}

function useTaskDatasetState(): TaskDatasetValue {
    const { userId, lists, profile, loading: dataLoading } = useData();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [tasks, setTasks] = useState<TaskDatasetRecord[]>([]);
    const [taskLabels, setTaskLabels] = useState<TaskLabel[]>([]);
    const [plannedBlocks, setPlannedBlocks] = useState<PlannedFocusBlock[]>([]);
    const [imagesByTodo, setImagesByTodo] = useState<Record<string, TodoImageRow[]>>({});
    const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
    const [membersByListId, setMembersByListId] = useState<Record<string, ProjectMemberProfile[]>>({});
    const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
    const [loading, setLoading] = useState(true);
    const [projectOrder, setProjectOrder] = useState<string[]>([]);
    const pendingRealtimeEchoCountsRef = useRef<Map<string, number>>(new Map());
    const pendingPlannedBlockRealtimeEchoCountsRef = useRef<Map<string, number>>(new Map());
    const knownFocusSessionIdsRef = useRef<Set<string>>(new Set());
    const locallyPatchedFocusSessionIdsRef = useRef<Set<string>>(new Set());
    const migratedProjectOrderUserIdsRef = useRef<Set<string>>(new Set());
    const profileTimeZone = profile?.timezone ?? null;

    const listIdSignature = useMemo(() => {
        return Array.from(new Set(lists.map((list) => list.id)))
            .sort((a, b) => a.localeCompare(b))
            .join("|");
    }, [lists]);
    const listIds = useMemo(
        () => listIdSignature ? listIdSignature.split("|") : [],
        [listIdSignature],
    );
    const listIdSet = useMemo(() => new Set(listIds), [listIds]);

    const markPendingRealtimeEcho = useCallback((taskId: string) => {
        const currentCount = pendingRealtimeEchoCountsRef.current.get(taskId) ?? 0;
        pendingRealtimeEchoCountsRef.current.set(taskId, currentCount + 1);
    }, []);

    const markPendingPlannedBlockRealtimeEcho = useCallback((blockId: string) => {
        const currentCount = pendingPlannedBlockRealtimeEchoCountsRef.current.get(blockId) ?? 0;
        pendingPlannedBlockRealtimeEchoCountsRef.current.set(blockId, currentCount + 1);
    }, []);

    const shouldSuppressRealtimeEcho = useCallback((taskId: string) => {
        const currentCount = pendingRealtimeEchoCountsRef.current.get(taskId) ?? 0;
        if (currentCount <= 0) return false;

        if (currentCount === 1) {
            pendingRealtimeEchoCountsRef.current.delete(taskId);
        } else {
            pendingRealtimeEchoCountsRef.current.set(taskId, currentCount - 1);
        }

        return true;
    }, []);

    const shouldSuppressPlannedBlockRealtimeEcho = useCallback((blockId: string) => {
        const currentCount = pendingPlannedBlockRealtimeEchoCountsRef.current.get(blockId) ?? 0;
        if (currentCount <= 0) return false;

        if (currentCount === 1) {
            pendingPlannedBlockRealtimeEchoCountsRef.current.delete(blockId);
        } else {
            pendingPlannedBlockRealtimeEchoCountsRef.current.set(blockId, currentCount - 1);
        }

        return true;
    }, []);

    const updatePlannedBlocks = useCallback((updater: (currentBlocks: PlannedFocusBlock[]) => PlannedFocusBlock[]) => {
        setPlannedBlocks((currentBlocks) => {
            const nextBlocks = sortPlannedBlocks(updater(currentBlocks));
            if (arePlannedBlockCollectionsEqual(currentBlocks, nextBlocks)) {
                return currentBlocks;
            }

            setTasks((currentTasks) => hydrateTaskDatasetRecords(currentTasks, nextBlocks, buildTaskLabelsByTodoFromRecords(currentTasks)));
            return nextBlocks;
        });
    }, []);

    const loadDataset = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false;

        if (!userId || dataLoading) return;

        if (listIds.length === 0) {
            setTasks([]);
            setTaskLabels([]);
            setPlannedBlocks([]);
            setImagesByTodo({});
            setMemberCounts({});
            setMembersByListId({});
            setLoading(false);
            return;
        }

        try {
            if (!silent) {
                setLoading(true);
            }

            const [taskRows, nextBlocks, attachments, memberLabels, labelLinks, membersResponse, focusResponse] = await Promise.all([
                loadTodoRows(supabase, listIds),
                loadPlannedBlocks(supabase, userId),
                loadTodoAttachments(supabase, listIds),
                loadTaskLabels(supabase, userId),
                loadTodoLabelLinks(supabase, userId),
                supabase
                    .from("todo_list_members")
                    .select("list_id, user_id, role, inserted_at")
                    .in("list_id", listIds),
                supabase
                    .from("focus_sessions")
                    .select("id, duration_seconds, mode, inserted_at")
                    .eq("user_id", userId)
                    .gte("inserted_at", startOfDay(new Date()).toISOString())
                    .lt("inserted_at", addDays(startOfDay(new Date()), 1).toISOString()),
            ]);

            if (membersResponse.error) throw membersResponse.error;
            if (focusResponse.error) throw focusResponse.error;

            const taskLabelsByTodo = buildTaskLabelsByTodo(memberLabels, labelLinks);
            const sortedTasks = hydrateTaskDatasetRecords(taskRows, nextBlocks, taskLabelsByTodo);

            const nextImagesByTodo: Record<string, TodoImageRow[]> = {};
            for (const image of attachments) {
                (nextImagesByTodo[image.todo_id] ??= []).push(image);
            }

            const nextMemberCounts: Record<string, number> = {};
            const memberRows = (membersResponse.data ?? []) as TodoListMemberRow[];
            for (const row of memberRows) {
                nextMemberCounts[row.list_id] = (nextMemberCounts[row.list_id] ?? 0) + 1;
            }

            const memberIds = Array.from(new Set(memberRows.map((row) => row.user_id)));
            const nextMembersByListId: Record<string, ProjectMemberProfile[]> = {};

            if (memberIds.length > 0) {
                const { data: memberProfilesData, error: memberProfilesError } = await supabase
                    .from("profiles")
                    .select("id, username, full_name, avatar_url")
                    .in("id", memberIds);

                if (memberProfilesError) throw memberProfilesError;

                const memberProfilesById = new Map<string, MemberProfileRow>(
                    ((memberProfilesData ?? []) as MemberProfileRow[]).map((profileRow) => [profileRow.id, profileRow]),
                );

                memberRows.forEach((memberRow) => {
                    const profileRow = memberProfilesById.get(memberRow.user_id);
                    const nextMember: ProjectMemberProfile = {
                        ...memberRow,
                        username: profileRow?.username ?? null,
                        full_name: profileRow?.full_name ?? null,
                        avatar_url: profileRow?.avatar_url ?? null,
                    };

                    (nextMembersByListId[memberRow.list_id] ??= []).push(nextMember);
                });

                Object.keys(nextMembersByListId).forEach((listIdKey) => {
                    nextMembersByListId[listIdKey] = nextMembersByListId[listIdKey]!.sort((a, b) => {
                        const nameA = a.full_name ?? a.username ?? a.user_id;
                        const nameB = b.full_name ?? b.username ?? b.user_id;
                        return nameA.localeCompare(nameB);
                    });
                });
            }

            const focusSessions = (focusResponse.data ?? []) as FocusSessionSummaryRow[];
            knownFocusSessionIdsRef.current = new Set(focusSessions.map((session) => session.id));
            for (const sessionId of Array.from(locallyPatchedFocusSessionIdsRef.current)) {
                if (knownFocusSessionIdsRef.current.has(sessionId)) {
                    locallyPatchedFocusSessionIdsRef.current.delete(sessionId);
                }
            }

            const focusMinutes = focusSessions
                .filter((session) => session.mode === "focus")
                .reduce((total, session) => total + Math.round(session.duration_seconds / 60), 0);

            setPlannedBlocks(nextBlocks);
            setTaskLabels(memberLabels);
            setTasks(sortedTasks);
            setImagesByTodo(nextImagesByTodo);
            setMemberCounts(nextMemberCounts);
            setMembersByListId(nextMembersByListId);
            setTodayFocusMinutes(focusMinutes);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to load tasks.";
            toast.error(message);
        } finally {
            setLoading(false);
        }
    }, [dataLoading, listIds, supabase, userId]);

    useEffect(() => {
        if (!userId) {
            knownFocusSessionIdsRef.current = new Set();
            locallyPatchedFocusSessionIdsRef.current = new Set();
            setTaskLabels([]);
            setMembersByListId({});
        }
    }, [userId]);

    useEffect(() => {
        void loadDataset();
    }, [loadDataset]);

    useEffect(() => {
        if (!userId) {
            setProjectOrder([]);
            return;
        }

        const syncedProjectOrder = normalizeProjectOrderIds(profile?.project_order_ids);
        if (syncedProjectOrder) {
            setProjectOrder(syncedProjectOrder);
            saveProjectOrderToStorage(userId, syncedProjectOrder);
            return;
        }

        setProjectOrder(loadProjectOrderFromStorage(userId));
    }, [profile?.project_order_ids, userId]);

    useEffect(() => {
        if (!userId) return;

        const syncedProjectOrder = normalizeProjectOrderIds(profile?.project_order_ids);
        if (syncedProjectOrder || migratedProjectOrderUserIdsRef.current.has(userId)) return;

        const localProjectOrder = loadProjectOrderFromStorage(userId);
        if (localProjectOrder.length === 0) return;

        migratedProjectOrderUserIdsRef.current.add(userId);
        setProjectOrder(localProjectOrder);

        void supabase
            .from("profiles")
            .upsert({ id: userId, project_order_ids: localProjectOrder }, { onConflict: "id" })
            .then(({ error }) => {
                if (!error || isMissingProjectOrderPreferenceColumnError(error)) return;
                console.error("Failed to sync project order.", error);
            });
    }, [profile?.project_order_ids, supabase, userId]);

    useEffect(() => {
        if (!userId) return;

        const channel = supabase
            .channel(`workspace-dataset-${userId}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "todos" }, (payload) => {
                if (payload.eventType === "DELETE") {
                    const deletedId = typeof payload.old.id === "string" ? payload.old.id : null;
                    if (!deletedId) return;
                    if (shouldSuppressRealtimeEcho(deletedId)) return;

                    setTasks((currentTasks) => {
                        if (!currentTasks.some((task) => task.id === deletedId)) return currentTasks;
                        return currentTasks.filter((task) => task.id !== deletedId);
                    });
                    setImagesByTodo((currentImages) => {
                        if (!(deletedId in currentImages)) return currentImages;

                        const nextImages = { ...currentImages };
                        delete nextImages[deletedId];
                        return nextImages;
                    });
                    return;
                }

                const nextTask = normalizeTodoRow(payload.new as TodoRow);
                if (shouldSuppressRealtimeEcho(nextTask.id)) return;
                const taskListId = nextTask.list_id;
                if (typeof taskListId !== "string") return;

                if (!listIdSet.has(taskListId)) {
                    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== nextTask.id));
                    return;
                }

                setTasks((currentTasks) => upsertNormalizedTaskRecord(currentTasks, nextTask, plannedBlocks));
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "task_labels", filter: `user_id=eq.${userId}` }, () => void loadDataset({ silent: true }))
            .on("postgres_changes", { event: "*", schema: "public", table: "todo_label_links", filter: `user_id=eq.${userId}` }, () => void loadDataset({ silent: true }))
            .on("postgres_changes", { event: "*", schema: "public", table: "todo_images" }, () => void loadDataset({ silent: true }))
            .on("postgres_changes", { event: "*", schema: "public", table: "planned_focus_blocks", filter: `user_id=eq.${userId}` }, (payload) => {
                if (payload.eventType === "DELETE") {
                    const deletedId = typeof payload.old.id === "string" ? payload.old.id : null;
                    if (!deletedId) return;
                    if (shouldSuppressPlannedBlockRealtimeEcho(deletedId)) return;

                    updatePlannedBlocks((currentBlocks) => currentBlocks.filter((block) => block.id !== deletedId));
                    return;
                }

                const nextBlock = normalizePlannedBlock(payload.new as PlannedFocusBlock);
                if (!nextBlock.id) return;
                if (shouldSuppressPlannedBlockRealtimeEcho(nextBlock.id)) return;

                if (!listIdSet.has(nextBlock.list_id)) {
                    updatePlannedBlocks((currentBlocks) => currentBlocks.filter((block) => block.id !== nextBlock.id));
                    return;
                }

                updatePlannedBlocks((currentBlocks) => {
                    const existingIndex = currentBlocks.findIndex((block) => block.id === nextBlock.id);
                    if (existingIndex === -1) {
                        return [...currentBlocks, nextBlock];
                    }

                    return currentBlocks.map((block) => block.id === nextBlock.id ? nextBlock : block);
                });
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "focus_sessions", filter: `user_id=eq.${userId}` }, (payload) => {
                const nextSessionId = getRealtimeInsertedRowId(payload);
                if (payload.eventType === "INSERT" && nextSessionId && locallyPatchedFocusSessionIdsRef.current.has(nextSessionId)) {
                    locallyPatchedFocusSessionIdsRef.current.delete(nextSessionId);
                    knownFocusSessionIdsRef.current.add(nextSessionId);
                    return;
                }

                void loadDataset({ silent: true });
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "todo_list_members" }, () => void loadDataset({ silent: true }))
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [listIdSet, loadDataset, plannedBlocks, shouldSuppressPlannedBlockRealtimeEcho, shouldSuppressRealtimeEcho, supabase, updatePlannedBlocks, userId]);

    useEffect(() => {
        return subscribeToFocusSessionCompleted((detail) => {
            if (detail.mode !== "focus") return;
            if (knownFocusSessionIdsRef.current.has(detail.sessionId)) return;
            if (locallyPatchedFocusSessionIdsRef.current.has(detail.sessionId)) return;

            const sessionDay = startOfDay(new Date(detail.insertedAt)).getTime();
            const today = startOfDay(new Date()).getTime();
            if (sessionDay !== today) return;

            locallyPatchedFocusSessionIdsRef.current.add(detail.sessionId);
            knownFocusSessionIdsRef.current.add(detail.sessionId);
            setTodayFocusMinutes((current) => current + Math.round(detail.durationSeconds / 60));
        });
    }, []);

    const projectSummaries = useMemo<ProjectSummary[]>(() => {
        return lists.map((list) => buildProjectSummary({
            list,
            tasks,
            plannedBlocks,
            memberCount: memberCounts[list.id] ?? 0,
            timeZone: profileTimeZone,
        }));
    }, [lists, memberCounts, plannedBlocks, profileTimeZone, tasks]);

    const orderedProjectSummaries = useMemo(() => {
        const fallbackOrder = [...projectSummaries].sort((a, b) => {
            const overdueDelta = Number(b.overdueCount > 0) - Number(a.overdueCount > 0);
            if (overdueDelta !== 0) return overdueDelta;

            const dueSoonDelta = Number(b.dueSoonCount > 0) - Number(a.dueSoonCount > 0);
            if (dueSoonDelta !== 0) return dueSoonDelta;

            const activeDelta = Number(b.incompleteCount > 0) - Number(a.incompleteCount > 0);
            if (activeDelta !== 0) return activeDelta;

            const scheduledDelta = Number(Boolean(b.nextScheduledBlock)) - Number(Boolean(a.nextScheduledBlock));
            if (scheduledDelta !== 0) return scheduledDelta;

            return a.list.name.localeCompare(b.list.name);
        });

        if (projectOrder.length === 0) {
            return fallbackOrder;
        }

        const fallbackIndex = new Map(
            fallbackOrder.map((summary, index) => [summary.list.id, index]),
        );
        const storedIndex = new Map(projectOrder.map((projectId, index) => [projectId, index]));

        return [...fallbackOrder].sort((a, b) => {
            const indexA = storedIndex.get(a.list.id);
            const indexB = storedIndex.get(b.list.id);

            if (indexA == null && indexB == null) {
                return (fallbackIndex.get(a.list.id) ?? 0) - (fallbackIndex.get(b.list.id) ?? 0);
            }
            if (indexA == null) return 1;
            if (indexB == null) return -1;
            return indexA - indexB;
        });
    }, [projectOrder, projectSummaries]);

    const saveProjectOrder = useCallback((nextProjectIds: string[]) => {
        if (!userId) return;

        const uniqueProjectIds = Array.from(new Set(nextProjectIds));
        setProjectOrder(uniqueProjectIds);
        saveProjectOrderToStorage(userId, uniqueProjectIds);

        void supabase
            .from("profiles")
            .upsert({ id: userId, project_order_ids: uniqueProjectIds }, { onConflict: "id" })
            .then(({ error }) => {
                if (!error || isMissingProjectOrderPreferenceColumnError(error)) return;
                console.error("Failed to sync project order.", error);
            });
    }, [supabase, userId]);

    const applyTaskPatch = useCallback((taskId: string, patch: Partial<TaskDatasetRecord>) => {
        setTasks((currentTasks) => {
            let changed = false;
            const plannedMinutesByTodo = buildPlannedMinutesByTodo(plannedBlocks);
            const taskLabelsByTodo = buildTaskLabelsByTodoFromRecords(currentTasks);
            const nextTasks = currentTasks.map((task) => {
                if (task.id !== taskId) return task;

                const nextTask = createTaskDatasetRecord({
                    ...task,
                    ...patch,
                }, plannedMinutesByTodo, new Map(taskLabelsByTodo).set(taskId, patch.labels ?? task.labels));

                if (areTaskRecordsEqual(task, nextTask)) {
                    return task;
                }

                changed = true;
                return nextTask;
            });

            return changed ? sortTasksByInsertedAt(nextTasks) : currentTasks;
        });
    }, [plannedBlocks]);

    const upsertTaskLabels = useCallback((labels: TaskLabel[]) => {
        setTaskLabels((currentLabels) => {
            const nextLabelsById = new Map(currentLabels.map((label) => [label.id, label]));
            let changed = false;

            labels.forEach((label) => {
                const normalizedLabel = normalizeTaskLabel(label);
                const existingLabel = nextLabelsById.get(normalizedLabel.id);

                if (existingLabel?.name === normalizedLabel.name
                    && existingLabel.user_id === normalizedLabel.user_id
                    && (existingLabel.color_token ?? "slate") === (normalizedLabel.color_token ?? "slate")
                    && existingLabel.inserted_at === normalizedLabel.inserted_at
                    && existingLabel.updated_at === normalizedLabel.updated_at) {
                    return;
                }

                changed = true;
                nextLabelsById.set(normalizedLabel.id, normalizedLabel);
            });

            return changed ? Array.from(nextLabelsById.values()).sort((a, b) => a.name.localeCompare(b.name)) : currentLabels;
        });
    }, []);

    const upsertTask = useCallback((task: TodoRow, options?: { suppressRealtimeEcho?: boolean }) => {
        if (options?.suppressRealtimeEcho) {
            markPendingRealtimeEcho(task.id);
        }

        const normalizedTask = normalizeTodoRow(task);
        setTasks((currentTasks) => upsertNormalizedTaskRecord(currentTasks, normalizedTask, plannedBlocks));
    }, [markPendingRealtimeEcho, plannedBlocks]);

    const upsertPlannedBlock = useCallback((block: PlannedFocusBlock, options?: { suppressRealtimeEcho?: boolean }) => {
        if (options?.suppressRealtimeEcho) {
            markPendingPlannedBlockRealtimeEcho(block.id);
        }

        const normalizedBlock = normalizePlannedBlock(block);
        updatePlannedBlocks((currentBlocks) => {
            const existingIndex = currentBlocks.findIndex((item) => item.id === normalizedBlock.id);
            if (existingIndex === -1) {
                return [...currentBlocks, normalizedBlock];
            }

            const existingBlock = currentBlocks[existingIndex];
            if (existingBlock && arePlannedBlocksEqual(existingBlock, normalizedBlock)) {
                return currentBlocks;
            }

            return currentBlocks.map((item) => item.id === normalizedBlock.id ? normalizedBlock : item);
        });
    }, [markPendingPlannedBlockRealtimeEcho, updatePlannedBlocks]);

    const removeTask = useCallback((taskId: string, options?: { suppressRealtimeEcho?: boolean }) => {
        if (options?.suppressRealtimeEcho) {
            markPendingRealtimeEcho(taskId);
        }

        setTasks((currentTasks) => {
            if (!currentTasks.some((task) => task.id === taskId)) return currentTasks;
            return currentTasks.filter((task) => task.id !== taskId);
        });
        setImagesByTodo((currentImages) => {
            if (!(taskId in currentImages)) return currentImages;

            const nextImages = { ...currentImages };
            delete nextImages[taskId];
            return nextImages;
        });
    }, [markPendingRealtimeEcho]);

    const removePlannedBlock = useCallback((blockId: string, options?: { suppressRealtimeEcho?: boolean }) => {
        if (options?.suppressRealtimeEcho) {
            markPendingPlannedBlockRealtimeEcho(blockId);
        }

        updatePlannedBlocks((currentBlocks) => {
            if (!currentBlocks.some((block) => block.id === blockId)) {
                return currentBlocks;
            }

            return currentBlocks.filter((block) => block.id !== blockId);
        });
    }, [markPendingPlannedBlockRealtimeEcho, updatePlannedBlocks]);

    const smartViewCounts = useMemo<SmartViewCounts>(() => ({
        today: getSmartViewTasks(tasks, "today", new Date(), profileTimeZone).length,
        upcoming: getSmartViewTasks(tasks, "upcoming", new Date(), profileTimeZone).length,
        inbox: getSmartViewTasks(tasks, "inbox", new Date(), profileTimeZone).length,
        done: getSmartViewTasks(tasks, "done").length,
    }), [profileTimeZone, tasks]);

    return {
        userId,
        lists,
        tasks,
        taskLabels,
        plannedBlocks,
        imagesByTodo,
        memberCounts,
        membersByListId,
        projectSummaries,
        orderedProjectSummaries,
        smartViewCounts,
        todayFocusMinutes,
        loading: dataLoading || loading,
        applyTaskPatch,
        removeTask,
        removePlannedBlock,
        saveProjectOrder,
        upsertPlannedBlock,
        upsertTaskLabels,
        upsertTask,
        refresh: loadDataset,
    };
}

export function WorkspaceDataProvider({ children }: { children: ReactNode }) {
    const value = useTaskDatasetState();
    return createElement(WorkspaceDataContext.Provider, { value }, children);
}

export function useTaskDataset() {
    const context = useContext(WorkspaceDataContext);
    if (!context) {
        throw new Error("useTaskDataset must be used within WorkspaceDataProvider.");
    }
    return context;
}
