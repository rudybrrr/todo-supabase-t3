"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { addDays, startOfDay } from "date-fns";

import { useData } from "~/components/data-provider";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import {
    LEGACY_TODO_FIELDS,
    TODO_FIELDS,
    isMissingTaskMetadataError,
    normalizeTodoRow,
} from "~/lib/task-actions";
import { getSmartViewTasks, type SmartView } from "~/lib/task-views";
import type { PlannedFocusBlock, TodoImageRow, TodoList, TodoRow } from "~/lib/types";

export interface TaskDatasetRecord extends TodoRow {
    has_planned_block: boolean;
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
    removeTask: (taskId: string) => void;
    saveProjectOrder: (nextProjectIds: string[]) => void;
    upsertTask: (task: TodoRow) => void;
    refresh: (options?: { silent?: boolean }) => Promise<void>;
}

const WorkspaceDataContext = createContext<TaskDatasetValue | undefined>(undefined);

interface ListMemberCountRow {
    list_id: string;
}

interface FocusSessionSummaryRow {
    duration_seconds: number;
    mode: string;
}

const PROJECT_ORDER_STORAGE_KEY_PREFIX = "list-order-";

function sortTasksByInsertedAt(tasks: TaskDatasetRecord[]) {
    return [...tasks].sort((a, b) => (a.inserted_at ?? "").localeCompare(b.inserted_at ?? ""));
}

function upsertNormalizedTaskRecord(
    currentTasks: TaskDatasetRecord[],
    task: TodoRow,
    plannedBlocks: PlannedFocusBlock[],
) {
    const existingTask = currentTasks.find((item) => item.id === task.id);
    const hasPlannedBlock = existingTask?.has_planned_block ?? plannedBlocks.some((block) => block.todo_id === task.id);
    const nextTask: TaskDatasetRecord = {
        ...existingTask,
        ...task,
        has_planned_block: hasPlannedBlock,
    };

    if (!existingTask) {
        return sortTasksByInsertedAt([...currentTasks, nextTask]);
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

    if (!error) {
        return ((data ?? []) as TodoRow[]).map(normalizeTodoRow);
    }

    if (!isMissingTaskMetadataError(error)) {
        throw error;
    }

    const { data: legacyData, error: legacyError } = await supabase
        .from("todos")
        .select(LEGACY_TODO_FIELDS)
        .in("list_id", listIds);

    if (legacyError) throw legacyError;
    return ((legacyData ?? []) as TodoRow[]).map(normalizeTodoRow);
}

async function loadPlannedBlocks(
    supabase: ReturnType<typeof createSupabaseBrowserClient>,
    userId: string,
): Promise<PlannedFocusBlock[]> {
    const { data, error } = await supabase
        .from("planned_focus_blocks")
        .select("id, user_id, list_id, todo_id, title, scheduled_start, scheduled_end, inserted_at, updated_at")
        .eq("user_id", userId);

    if (!error) {
        return (data ?? []) as PlannedFocusBlock[];
    }

    if (isMissingPlannedBlocksTableError(error)) {
        return [];
    }

    throw error;
}

function isDueSoon(task: TodoRow) {
    if (!task.due_date || task.is_done) return false;
    const dueDate = new Date(task.due_date);
    const diffDays = Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
}

function isOverdue(task: TodoRow) {
    if (!task.due_date || task.is_done) return false;
    return new Date(task.due_date).getTime() < new Date().setHours(0, 0, 0, 0);
}

function useTaskDatasetState(): TaskDatasetValue {
    const { userId, lists, loading: dataLoading } = useData();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [tasks, setTasks] = useState<TaskDatasetRecord[]>([]);
    const [plannedBlocks, setPlannedBlocks] = useState<PlannedFocusBlock[]>([]);
    const [imagesByTodo, setImagesByTodo] = useState<Record<string, TodoImageRow[]>>({});
    const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
    const [todayFocusMinutes, setTodayFocusMinutes] = useState(0);
    const [loading, setLoading] = useState(true);
    const [projectOrder, setProjectOrder] = useState<string[]>([]);

    const listIds = useMemo(() => lists.map((list) => list.id), [lists]);

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

            const [taskRows, nextBlocks, imagesResponse, membersResponse, focusResponse] = await Promise.all([
                loadTodoRows(supabase, listIds),
                loadPlannedBlocks(supabase, userId),
                supabase
                    .from("todo_images")
                    .select("id, todo_id, user_id, list_id, path, inserted_at")
                    .in("list_id", listIds),
                supabase
                    .from("todo_list_members")
                    .select("list_id")
                    .in("list_id", listIds),
                supabase
                    .from("focus_sessions")
                    .select("duration_seconds, mode")
                    .eq("user_id", userId)
                    .gte("inserted_at", startOfDay(new Date()).toISOString())
                    .lt("inserted_at", addDays(startOfDay(new Date()), 1).toISOString()),
            ]);

            if (imagesResponse.error) throw imagesResponse.error;
            if (membersResponse.error) throw membersResponse.error;
            if (focusResponse.error) throw focusResponse.error;

            const plannedTaskIds = new Set(
                nextBlocks.flatMap((block) => (block.todo_id ? [block.todo_id] : [])),
            );

            const nextTasks = taskRows
                .map((task) => ({
                    ...task,
                    has_planned_block: plannedTaskIds.has(task.id),
                }))
            const sortedTasks = sortTasksByInsertedAt(nextTasks);

            const nextImagesByTodo: Record<string, TodoImageRow[]> = {};
            for (const image of (imagesResponse.data ?? []) as TodoImageRow[]) {
                (nextImagesByTodo[image.todo_id] ??= []).push(image);
            }

            const nextMemberCounts: Record<string, number> = {};
            for (const row of (membersResponse.data ?? []) as ListMemberCountRow[]) {
                nextMemberCounts[row.list_id] = (nextMemberCounts[row.list_id] ?? 0) + 1;
            }

            const focusMinutes = ((focusResponse.data ?? []) as FocusSessionSummaryRow[])
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

                    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== deletedId));
                    setImagesByTodo((currentImages) => {
                        if (!(deletedId in currentImages)) return currentImages;

                        const nextImages = { ...currentImages };
                        delete nextImages[deletedId];
                        return nextImages;
                    });
                    return;
                }

                const nextTask = normalizeTodoRow(payload.new as TodoRow);
                const taskListId = nextTask.list_id;
                if (typeof taskListId !== "string") return;

                if (!listIds.includes(taskListId)) {
                    setTasks((currentTasks) => currentTasks.filter((task) => task.id !== nextTask.id));
                    return;
                }

                setTasks((currentTasks) => upsertNormalizedTaskRecord(currentTasks, nextTask, plannedBlocks));
            })
            .on("postgres_changes", { event: "*", schema: "public", table: "todo_images" }, () => void loadDataset({ silent: true }))
            .on("postgres_changes", { event: "*", schema: "public", table: "planned_focus_blocks", filter: `user_id=eq.${userId}` }, () => void loadDataset({ silent: true }))
            .on("postgres_changes", { event: "*", schema: "public", table: "focus_sessions", filter: `user_id=eq.${userId}` }, () => void loadDataset({ silent: true }))
            .on("postgres_changes", { event: "*", schema: "public", table: "todo_list_members" }, () => void loadDataset({ silent: true }))
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [listIds, loadDataset, plannedBlocks, supabase, userId]);

    const projectSummaries = useMemo<ProjectSummary[]>(() => {
        return lists.map((list) => {
            const projectTasks = tasks.filter((task) => task.list_id === list.id);
            return {
                list,
                totalCount: projectTasks.length,
                incompleteCount: projectTasks.filter((task) => !task.is_done).length,
                completedCount: projectTasks.filter((task) => task.is_done).length,
                dueSoonCount: projectTasks.filter((task) => isDueSoon(task)).length,
                overdueCount: projectTasks.filter((task) => isOverdue(task)).length,
                memberCount: memberCounts[list.id] ?? 0,
            };
        });
    }, [lists, memberCounts, tasks]);

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
        setTasks((currentTasks) => sortTasksByInsertedAt(currentTasks.map((task) => {
            if (task.id !== taskId) return task;
            return {
                ...task,
                ...patch,
            };
        })));
    }, []);

    const upsertTask = useCallback((task: TodoRow) => {
        const normalizedTask = normalizeTodoRow(task);
        setTasks((currentTasks) => upsertNormalizedTaskRecord(currentTasks, normalizedTask, plannedBlocks));
    }, [plannedBlocks]);

    const removeTask = useCallback((taskId: string) => {
        setTasks((currentTasks) => currentTasks.filter((task) => task.id !== taskId));
        setImagesByTodo((currentImages) => {
            if (!(taskId in currentImages)) return currentImages;

            const nextImages = { ...currentImages };
            delete nextImages[taskId];
            return nextImages;
        });
    }, []);

    const smartViewCounts = useMemo<SmartViewCounts>(() => ({
        today: getSmartViewTasks(tasks, "today").length,
        upcoming: getSmartViewTasks(tasks, "upcoming").length,
        inbox: getSmartViewTasks(tasks, "inbox").length,
        done: getSmartViewTasks(tasks, "done").length,
    }), [tasks]);

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
        saveProjectOrder,
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
