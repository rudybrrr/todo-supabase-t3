"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { addDays, differenceInCalendarDays, parseISO, startOfDay } from "date-fns";

import { useData } from "~/components/data-provider";
import {
    buildPlannedMinutesByTodo,
    getRemainingEstimatedMinutes,
    getTaskPlanningStatus,
    PLANNED_BLOCK_FIELDS,
} from "~/lib/planning";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { subscribeToFocusSessionCompleted } from "~/lib/focus-session-events";
import {
    TODO_FIELDS,
    normalizeTodoRow,
} from "~/lib/task-actions";
import { getSmartViewTasks, type SmartView } from "~/lib/task-views";
import { getTaskDeadlineDateKey, toDateKeyInTimeZone } from "~/lib/task-deadlines";
import type { PlannedFocusBlock, PlanningStatus, TodoImageRow, TodoList, TodoRow } from "~/lib/types";

export interface TaskDatasetRecord extends TodoRow {
    has_planned_block: boolean;
    planned_minutes: number;
    remaining_estimated_minutes: number | null;
    planning_status: PlanningStatus;
}

export interface ProjectSummary {
    list: TodoList;
    totalCount: number;
    incompleteCount: number;
    completedCount: number;
    dueSoonCount: number;
    overdueCount: number;
    memberCount: number;
}

type SmartViewCounts = Record<SmartView, number>;

interface TaskDatasetValue {
    userId: string | null;
    lists: TodoList[];
    tasks: TaskDatasetRecord[];
    plannedBlocks: PlannedFocusBlock[];
    imagesByTodo: Record<string, TodoImageRow[]>;
    memberCounts: Record<string, number>;
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
    upsertTask: (task: TodoRow, options?: { suppressRealtimeEcho?: boolean }) => void;
    refresh: (options?: { silent?: boolean }) => Promise<void>;
}

const WorkspaceDataContext = createContext<TaskDatasetValue | undefined>(undefined);

interface ListMemberCountRow {
    list_id: string;
}

interface FocusSessionSummaryRow {
    id: string;
    duration_seconds: number;
    mode: string;
    inserted_at: string;
}

const PROJECT_ORDER_STORAGE_KEY_PREFIX = "list-order-";
const ATTACHMENT_FIELDS = "id, todo_id, user_id, list_id, path, original_name, mime_type, size_bytes, inserted_at";

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

function createTaskDatasetRecord(task: TodoRow, plannedMinutesByTodo: ReadonlyMap<string, number>): TaskDatasetRecord {
    const normalizedTask = normalizeTodoRow(task);
    const plannedMinutes = plannedMinutesByTodo.get(normalizedTask.id) ?? 0;

    return {
        ...normalizedTask,
        has_planned_block: plannedMinutes > 0,
        planned_minutes: plannedMinutes,
        remaining_estimated_minutes: getRemainingEstimatedMinutes(normalizedTask.estimated_minutes, plannedMinutes),
        planning_status: getTaskPlanningStatus(normalizedTask.estimated_minutes, plannedMinutes),
    };
}

function hydrateTaskDatasetRecords(tasks: TodoRow[], plannedBlocks: PlannedFocusBlock[]) {
    const plannedMinutesByTodo = buildPlannedMinutesByTodo(plannedBlocks);
    return sortTasksByInsertedAt(tasks.map((task) => createTaskDatasetRecord(task, plannedMinutesByTodo)));
}

function areTaskRecordsEqual(a: TaskDatasetRecord, b: TaskDatasetRecord) {
    return a.id === b.id
        && a.user_id === b.user_id
        && a.list_id === b.list_id
        && (a.section_id ?? null) === (b.section_id ?? null)
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
    }, buildPlannedMinutesByTodo(plannedBlocks));

    if (!existingTask) {
        return sortTasksByInsertedAt([...currentTasks, nextTask]);
    }

    if (areTaskRecordsEqual(existingTask, nextTask)) {
        return currentTasks;
    }

    return sortTasksByInsertedAt(currentTasks.map((item) => item.id === task.id ? nextTask : item));
}

function isMissingPlannedBlocksTableError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return (
        code === "PGRST205" ||
        code === "42P01" ||
        message.includes("planned_focus_blocks")
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

    if (isMissingPlannedBlocksTableError(error)) {
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

function getDateKeyDistance(dateKey: string, comparisonDateKey: string) {
    return differenceInCalendarDays(parseISO(`${dateKey}T00:00:00`), parseISO(`${comparisonDateKey}T00:00:00`));
}

function isDueSoon(task: TodoRow, timeZone?: string | null) {
    if (task.is_done) return false;

    const deadlineDateKey = getTaskDeadlineDateKey(task, timeZone);
    if (!deadlineDateKey) return false;

    const todayDateKey = toDateKeyInTimeZone(new Date(), timeZone);
    const diffDays = getDateKeyDistance(deadlineDateKey, todayDateKey);
    return diffDays >= 0 && diffDays <= 7;
}

function isOverdue(task: TodoRow, timeZone?: string | null) {
    if (task.is_done) return false;

    const deadlineDateKey = getTaskDeadlineDateKey(task, timeZone);
    if (!deadlineDateKey) return false;

    return deadlineDateKey < toDateKeyInTimeZone(new Date(), timeZone);
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
    const [plannedBlocks, setPlannedBlocks] = useState<PlannedFocusBlock[]>([]);
    const [imagesByTodo, setImagesByTodo] = useState<Record<string, TodoImageRow[]>>({});
    const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
    const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
    const [loading, setLoading] = useState(true);
    const [projectOrder, setProjectOrder] = useState<string[]>([]);
    const pendingRealtimeEchoCountsRef = useRef<Map<string, number>>(new Map());
    const pendingPlannedBlockRealtimeEchoCountsRef = useRef<Map<string, number>>(new Map());
    const knownFocusSessionIdsRef = useRef<Set<string>>(new Set());
    const locallyPatchedFocusSessionIdsRef = useRef<Set<string>>(new Set());
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

            setTasks((currentTasks) => hydrateTaskDatasetRecords(currentTasks, nextBlocks));
            return nextBlocks;
        });
    }, []);

    const loadDataset = useCallback(async (options?: { silent?: boolean }) => {
        const silent = options?.silent ?? false;

        if (!userId || dataLoading) return;

        if (listIds.length === 0) {
            setTasks([]);
            setPlannedBlocks([]);
            setImagesByTodo({});
            setMemberCounts({});
            setLoading(false);
            return;
        }

        try {
            if (!silent) {
                setLoading(true);
            }

            const [taskRows, nextBlocks, attachments, membersResponse, focusResponse] = await Promise.all([
                loadTodoRows(supabase, listIds),
                loadPlannedBlocks(supabase, userId),
                loadTodoAttachments(supabase, listIds),
                supabase
                    .from("todo_list_members")
                    .select("list_id")
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

            const sortedTasks = hydrateTaskDatasetRecords(taskRows, nextBlocks);

            const nextImagesByTodo: Record<string, TodoImageRow[]> = {};
            for (const image of attachments) {
                (nextImagesByTodo[image.todo_id] ??= []).push(image);
            }

            const nextMemberCounts: Record<string, number> = {};
            for (const row of (membersResponse.data ?? []) as ListMemberCountRow[]) {
                nextMemberCounts[row.list_id] = (nextMemberCounts[row.list_id] ?? 0) + 1;
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
            setTasks(sortedTasks);
            setImagesByTodo(nextImagesByTodo);
            setMemberCounts(nextMemberCounts);
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

        const storageKey = `${PROJECT_ORDER_STORAGE_KEY_PREFIX}${userId}`;
        const savedOrder = window.localStorage.getItem(storageKey);

        if (!savedOrder) {
            setProjectOrder([]);
            return;
        }

        try {
            const parsedOrder = JSON.parse(savedOrder) as unknown;
            if (!Array.isArray(parsedOrder)) {
                setProjectOrder([]);
                return;
            }

            setProjectOrder(
                parsedOrder.filter((item): item is string => typeof item === "string"),
            );
        } catch (error) {
            console.error("Failed to parse project order.", error);
            setProjectOrder([]);
        }
    }, [userId]);

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
        return lists.map((list) => {
            const projectTasks = tasks.filter((task) => task.list_id === list.id);
            return {
                list,
                totalCount: projectTasks.length,
                incompleteCount: projectTasks.filter((task) => !task.is_done).length,
                completedCount: projectTasks.filter((task) => task.is_done).length,
                dueSoonCount: projectTasks.filter((task) => isDueSoon(task, profileTimeZone)).length,
                overdueCount: projectTasks.filter((task) => isOverdue(task, profileTimeZone)).length,
                memberCount: memberCounts[list.id] ?? 0,
            };
        });
    }, [lists, memberCounts, profileTimeZone, tasks]);

    const orderedProjectSummaries = useMemo(() => {
        const fallbackOrder = [...projectSummaries].sort((a, b) => {
            const activeDelta = Number(b.incompleteCount > 0) - Number(a.incompleteCount > 0);
            if (activeDelta !== 0) return activeDelta;
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
        window.localStorage.setItem(
            `${PROJECT_ORDER_STORAGE_KEY_PREFIX}${userId}`,
            JSON.stringify(uniqueProjectIds),
        );
    }, [userId]);

    const applyTaskPatch = useCallback((taskId: string, patch: Partial<TaskDatasetRecord>) => {
        setTasks((currentTasks) => {
            let changed = false;
            const plannedMinutesByTodo = buildPlannedMinutesByTodo(plannedBlocks);
            const nextTasks = currentTasks.map((task) => {
                if (task.id !== taskId) return task;

                const nextTask = createTaskDatasetRecord({
                    ...task,
                    ...patch,
                }, plannedMinutesByTodo);

                if (areTaskRecordsEqual(task, nextTask)) {
                    return task;
                }

                changed = true;
                return nextTask;
            });

            return changed ? sortTasksByInsertedAt(nextTasks) : currentTasks;
        });
    }, [plannedBlocks]);

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
        plannedBlocks,
        imagesByTodo,
        memberCounts,
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
