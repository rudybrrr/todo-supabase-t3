"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { bootstrapUserWorkspace } from "~/lib/bootstrap-user";
import { subscribeToFocusSessionCompleted } from "~/lib/focus-session-events";
import { formatMinutesCompact, getPlannerPreferences } from "~/lib/planning";
import { getProgressWeekWindow } from "~/lib/progress-review";
import { toDateKeyInTimeZone } from "~/lib/task-deadlines";
import type { FocusSession, TodoList, TodoRow } from "~/lib/types";

interface WeeklyStatPoint {
    day: string;
    date: string;
    minutes: number;
}

interface SubjectStatPoint {
    name: string;
    value: number;
}

interface AppStats {
    totalFocus: string;
    tasksCompleted: number;
    streak: number;
    avgSession: string;
    weeklyData: WeeklyStatPoint[];
    subjectData: SubjectStatPoint[];
}

interface DataProfile {
    username?: string;
    full_name?: string;
    avatar_url?: string | null;
    daily_focus_goal_minutes?: number | null;
    timezone?: string | null;
    accent_token?: string | null;
    project_order_ids?: string[] | null;
    default_block_minutes?: number | null;
    week_starts_on?: number | null;
    planner_day_start_hour?: number | null;
    planner_day_end_hour?: number | null;
    is_compact_mode?: boolean | null;
}

interface DataContextType {
    focusSessions: FocusSession[];
    lists: TodoList[];
    profile: DataProfile | null;
    stats: AppStats | null;
    loading: boolean;
    refreshData: () => Promise<void>;
    userId: string | null;
}

interface ListMembershipRow {
    role: string;
    todo_lists: TodoList | TodoList[] | null;
}

interface TodoRealtimePayload {
    eventType: "INSERT" | "UPDATE" | "DELETE";
    new: Partial<TodoRow>;
    old: Partial<TodoRow>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

function normalizeList(value: TodoList | TodoList[] | null): TodoList | null {
    if (!value) return null;
    if (Array.isArray(value)) return value[0] ?? null;
    return value;
}

function calculateStreak(sessions: FocusSession[], preferredTimeZone?: string | null, now = new Date()) {
    if (!sessions.length) return 0;

    const rawDates = sessions.flatMap((session) => {
        if (!session.inserted_at) return [];
        const day = toDateKeyInTimeZone(session.inserted_at, preferredTimeZone);
        return [day];
    });

    const dates = Array.from(new Set(rawDates)).sort().reverse();

    let streak = 0;
    const todayDateKey = toDateKeyInTimeZone(now, preferredTimeZone);
    const today = new Date(`${todayDateKey}T00:00:00`);

    let expectedDiff = 0;
    for (let i = 0; i < dates.length; i++) {
        const date = new Date(`${dates[i] ?? ""}T00:00:00`);
        const diffDays = Math.round((today.getTime() - date.getTime()) / (1000 * 3600 * 24));

        if (diffDays === expectedDiff) {
            streak++;
            expectedDiff++;
        } else if (i === 0 && diffDays === 1) {
            streak = 1;
            expectedDiff = 2;
        } else {
            break;
        }
    }

    return streak;
}

function getWeeklyDataSkeleton(preferredTimeZone?: string | null, weekStartsOn?: number | null, now = new Date()) {
    const window = getProgressWeekWindow(preferredTimeZone, now, getPlannerPreferences({ week_starts_on: weekStartsOn }).weekStartsOn);

    return window.dateKeys.map((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);

        return {
            day: date.toLocaleDateString("en-US", { weekday: "short" }),
            date: dateKey,
            minutes: 0,
        };
    });
}

function buildStatsFromSessions(
    sessions: FocusSession[],
    tasksCompleted: number,
    preferredTimeZone?: string | null,
    weekStartsOn?: number | null,
    now = new Date(),
): AppStats {
    const weeklyData = getWeeklyDataSkeleton(preferredTimeZone, weekStartsOn, now);
    let totalSeconds = 0;
    let focusSessionCount = 0;
    const subjects: Record<string, number> = {};

    sessions.forEach((session) => {
        if (session.mode !== "focus") return;

        totalSeconds += session.duration_seconds;
        focusSessionCount += 1;

        const sessionDate = toDateKeyInTimeZone(session.inserted_at, preferredTimeZone);
        const dayData = weeklyData.find((day) => day.date === sessionDate);
        if (dayData) {
            const sessionMinutes = Math.round(session.duration_seconds / 60);
            dayData.minutes += sessionMinutes;

            const subjectName = session.todo_lists?.name ?? "General";
            subjects[subjectName] = (subjects[subjectName] ?? 0) + sessionMinutes;
        }
    });

    const totalMinutes = Math.round(totalSeconds / 60);
    const averageSessionMinutes = focusSessionCount > 0 ? Math.round(totalMinutes / focusSessionCount) : 0;

    return {
        totalFocus: formatMinutesCompact(totalMinutes),
        tasksCompleted,
        streak: calculateStreak(sessions, preferredTimeZone, now),
        avgSession: formatMinutesCompact(averageSessionMinutes),
        weeklyData,
        subjectData: Object.entries(subjects).map(([name, value]) => ({ name, value })),
    };
}

function createEmptyStats(tasksCompleted = 0, preferredTimeZone?: string | null, weekStartsOn?: number | null, now = new Date()): AppStats {
    return {
        totalFocus: "0m",
        tasksCompleted,
        streak: 0,
        avgSession: "0m",
        weeklyData: getWeeklyDataSkeleton(preferredTimeZone, weekStartsOn, now),
        subjectData: [],
    };
}

function areListsEqual(current: TodoList[], next: TodoList[]) {
    if (current.length !== next.length) return false;

    return current.every((list, index) => {
        const nextList = next[index];
        if (!nextList) return false;

        return list.id === nextList.id
            && list.name === nextList.name
            && list.owner_id === nextList.owner_id
            && (list.inserted_at ?? null) === (nextList.inserted_at ?? null)
            && (list.user_role ?? null) === (nextList.user_role ?? null)
            && (list.color_token ?? null) === (nextList.color_token ?? null)
            && (list.icon_token ?? null) === (nextList.icon_token ?? null);
    });
}

function areProfilesEqual(current: DataProfile | null, next: DataProfile | null) {
    if (current === next) return true;
    if (!current || !next) return false;

    return (current.username ?? null) === (next.username ?? null)
        && (current.full_name ?? null) === (next.full_name ?? null)
        && (current.avatar_url ?? null) === (next.avatar_url ?? null)
        && (current.daily_focus_goal_minutes ?? null) === (next.daily_focus_goal_minutes ?? null)
        && (current.timezone ?? null) === (next.timezone ?? null)
        && (current.accent_token ?? null) === (next.accent_token ?? null)
        && (current.default_block_minutes ?? null) === (next.default_block_minutes ?? null)
        && (current.week_starts_on ?? null) === (next.week_starts_on ?? null)
        && (current.planner_day_start_hour ?? null) === (next.planner_day_start_hour ?? null)
        && (current.planner_day_end_hour ?? null) === (next.planner_day_end_hour ?? null)
        && (current.is_compact_mode ?? false) === (next.is_compact_mode ?? false)
        && JSON.stringify(current.project_order_ids ?? null) === JSON.stringify(next.project_order_ids ?? null);
}

function isMissingProfilePreferenceColumnError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return code === "PGRST204"
        && (
            message.includes("accent_token")
            || message.includes("project_order_ids")
            || message.includes("default_block_minutes")
            || message.includes("week_starts_on")
            || message.includes("planner_day_start_hour")
            || message.includes("planner_day_end_hour")
        );
}

function areFocusSessionsEqual(current: FocusSession[], next: FocusSession[]) {
    if (current.length !== next.length) return false;

    return current.every((session, index) => {
        const nextSession = next[index];
        if (!nextSession) return false;

        return session.id === nextSession.id
            && session.user_id === nextSession.user_id
            && (session.list_id ?? null) === (nextSession.list_id ?? null)
            && (session.todo_id ?? null) === (nextSession.todo_id ?? null)
            && (session.planned_block_id ?? null) === (nextSession.planned_block_id ?? null)
            && session.duration_seconds === nextSession.duration_seconds
            && session.mode === nextSession.mode
            && session.inserted_at === nextSession.inserted_at
            && (session.todo_lists?.name ?? null) === (nextSession.todo_lists?.name ?? null);
    });
}

function areWeeklyDataEqual(current: WeeklyStatPoint[], next: WeeklyStatPoint[]) {
    if (current.length !== next.length) return false;

    return current.every((point, index) => {
        const nextPoint = next[index];
        if (!nextPoint) return false;

        return point.day === nextPoint.day
            && point.date === nextPoint.date
            && point.minutes === nextPoint.minutes;
    });
}

function areSubjectDataEqual(current: SubjectStatPoint[], next: SubjectStatPoint[]) {
    if (current.length !== next.length) return false;

    return current.every((point, index) => {
        const nextPoint = next[index];
        if (!nextPoint) return false;

        return point.name === nextPoint.name
            && point.value === nextPoint.value;
    });
}

function areStatsEqual(current: AppStats | null, next: AppStats | null) {
    if (current === next) return true;
    if (!current || !next) return false;

    return current.totalFocus === next.totalFocus
        && current.tasksCompleted === next.tasksCompleted
        && current.streak === next.streak
        && current.avgSession === next.avgSession
        && areWeeklyDataEqual(current.weeklyData, next.weeklyData)
        && areSubjectDataEqual(current.subjectData, next.subjectData);
}

function getRealtimeInsertedRowId(payload: { new?: unknown }) {
    const nextRecord = payload.new;
    if (!nextRecord || typeof nextRecord !== "object") return null;

    const nextId = (nextRecord as { id?: unknown }).id;
    return typeof nextId === "string" ? nextId : null;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [userId, setUserId] = useState<string | null>(null);
    const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
    const [lists, setLists] = useState<TodoList[]>([]);
    const [profile, setProfile] = useState<DataProfile | null>(null);
    const [stats, setStats] = useState<AppStats | null>(null);
    const [loading, setLoading] = useState(true);
    const inboxProvisionAttemptedForRef = useRef<string | null>(null);
    const focusSessionsRef = useRef<FocusSession[]>([]);
    const knownFocusSessionIdsRef = useRef<Set<string>>(new Set());
    const locallyPatchedFocusSessionIdsRef = useRef<Set<string>>(new Set());

    const fetchShellData = useCallback(async (uid: string) => {
        const [listsRes, profileRes] = await Promise.all([
            supabase.from("todo_list_members").select("list_id, role, todo_lists(*)").eq("user_id", uid),
            supabase
                .from("profiles")
                .select("username, full_name, avatar_url, daily_focus_goal_minutes, timezone, accent_token, project_order_ids, default_block_minutes, week_starts_on, planner_day_start_hour, planner_day_end_hour, is_compact_mode")
                .eq("id", uid)
                .maybeSingle(),
        ]);

        if (listsRes.error) throw listsRes.error;
        if (profileRes.error && !isMissingProfilePreferenceColumnError(profileRes.error)) throw profileRes.error;

        const membershipRows = (listsRes.data ?? []) as ListMembershipRow[];
        const userLists: TodoList[] = membershipRows.flatMap((membership) => {
            const list = normalizeList(membership.todo_lists);
            if (!list) return [];
            return [{
                ...list,
                user_role: membership.role,
            }];
        });

        let rawProfile = profileRes.data as DataProfile | null;

        if (profileRes.error && isMissingProfilePreferenceColumnError(profileRes.error)) {
            const { data: fallbackProfile, error: fallbackError } = await supabase
                .from("profiles")
                .select("username, full_name, avatar_url, daily_focus_goal_minutes, timezone")
                .eq("id", uid)
                .maybeSingle();

            if (fallbackError) throw fallbackError;
            rawProfile = fallbackProfile as DataProfile | null;
        }

        const nextProfile = rawProfile
            ? {
                ...rawProfile,
                daily_focus_goal_minutes: rawProfile.daily_focus_goal_minutes ?? 120,
                timezone: rawProfile.timezone ?? null,
                accent_token: rawProfile.accent_token ?? null,
                default_block_minutes: rawProfile.default_block_minutes ?? null,
                week_starts_on: rawProfile.week_starts_on ?? null,
                planner_day_start_hour: rawProfile.planner_day_start_hour ?? null,
                planner_day_end_hour: rawProfile.planner_day_end_hour ?? null,
                is_compact_mode: rawProfile.is_compact_mode ?? false,
                project_order_ids: Array.isArray(rawProfile.project_order_ids)
                    ? rawProfile.project_order_ids.filter((value): value is string => typeof value === "string")
                    : null,
            }
            : null;

        setLists((current) => areListsEqual(current, userLists) ? current : userLists);
        setProfile((current) => areProfilesEqual(current, nextProfile) ? current : nextProfile);
        return nextProfile;
    }, [supabase]);

    const fetchStatsData = useCallback(async (uid: string, preferredTimeZone?: string | null, weekStartsOn?: number | null) => {
        const [sessionsRes, todosRes] = await Promise.all([
            supabase.from("focus_sessions").select("*, todo_lists (name)").eq("user_id", uid).order("inserted_at", { ascending: true }),
            supabase.from("todos").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("is_done", true),
        ]);

        if (sessionsRes.error) throw sessionsRes.error;
        if (todosRes.error) throw todosRes.error;

        const nextSessions = (sessionsRes.data ?? []) as FocusSession[];
        focusSessionsRef.current = nextSessions;
        setFocusSessions((current) => areFocusSessionsEqual(current, nextSessions) ? current : nextSessions);
        knownFocusSessionIdsRef.current = new Set(nextSessions.map((session) => session.id));
        for (const sessionId of Array.from(locallyPatchedFocusSessionIdsRef.current)) {
            if (knownFocusSessionIdsRef.current.has(sessionId)) {
                locallyPatchedFocusSessionIdsRef.current.delete(sessionId);
            }
        }
        const nextStats = buildStatsFromSessions(nextSessions, todosRes.count ?? 0, preferredTimeZone, weekStartsOn);
        setStats((current) => areStatsEqual(current, nextStats) ? current : nextStats);
    }, [supabase]);

    const fetchCompletedTaskCount = useCallback(async (uid: string) => {
        const { count, error } = await supabase
            .from("todos")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid)
            .eq("is_done", true);

        if (error) throw error;

        const nextCount = count ?? 0;
        setStats((current) => {
            const baseStats = current ?? createEmptyStats(nextCount, profile?.timezone, profile?.week_starts_on);
            const nextStats = {
                ...baseStats,
                tasksCompleted: nextCount,
            };

            return areStatsEqual(current, nextStats) ? current : nextStats;
        });
    }, [profile?.timezone, profile?.week_starts_on, supabase]);

    const fetchFocusStats = useCallback(async (uid: string, preferredTimeZone?: string | null, weekStartsOn?: number | null) => {
        const { data, error } = await supabase
            .from("focus_sessions")
            .select("*, todo_lists (name)")
            .eq("user_id", uid)
            .order("inserted_at", { ascending: true });

        if (error) throw error;
        const nextSessions = (data ?? []) as FocusSession[];
        focusSessionsRef.current = nextSessions;
        setFocusSessions((current) => areFocusSessionsEqual(current, nextSessions) ? current : nextSessions);
        knownFocusSessionIdsRef.current = new Set(nextSessions.map((session) => session.id));
        for (const sessionId of Array.from(locallyPatchedFocusSessionIdsRef.current)) {
            if (knownFocusSessionIdsRef.current.has(sessionId)) {
                locallyPatchedFocusSessionIdsRef.current.delete(sessionId);
            }
        }

        setStats((current) => {
            const tasksCompleted = current?.tasksCompleted ?? 0;
            const nextStats = buildStatsFromSessions(nextSessions, tasksCompleted, preferredTimeZone, weekStartsOn);
            return areStatsEqual(current, nextStats) ? current : nextStats;
        });
    }, [supabase]);

    const updateCompletedTaskCountFromPayload = useCallback((payload: TodoRealtimePayload) => {
        const nextIsDone = typeof payload.new.is_done === "boolean" ? payload.new.is_done : null;
        const previousIsDone = typeof payload.old.is_done === "boolean" ? payload.old.is_done : null;

        let delta = 0;
        if (payload.eventType === "INSERT" && nextIsDone === true) {
            delta = 1;
        } else if (payload.eventType === "INSERT" && nextIsDone === false) {
            return true;
        } else if (payload.eventType === "DELETE" && previousIsDone === true) {
            delta = -1;
        } else if (payload.eventType === "DELETE" && previousIsDone === false) {
            return true;
        } else if (payload.eventType === "UPDATE" && previousIsDone !== null && nextIsDone !== null) {
            if (!previousIsDone && nextIsDone) delta = 1;
            if (previousIsDone && !nextIsDone) delta = -1;
        }

        if (delta === 0) {
            return previousIsDone !== null && nextIsDone !== null;
        }

        setStats((current) => {
            const baseStats = current ?? createEmptyStats(0, profile?.timezone, profile?.week_starts_on);
            const nextStats = {
                ...baseStats,
                tasksCompleted: Math.max(0, baseStats.tasksCompleted + delta),
            };

            return areStatsEqual(current, nextStats) ? current : nextStats;
        });

        return true;
    }, [profile?.timezone, profile?.week_starts_on]);

    const loadUserData = useCallback(async (uid: string) => {
        try {
            setLoading(true);
            const nextProfile = await fetchShellData(uid);
            await fetchStatsData(uid, nextProfile?.timezone, nextProfile?.week_starts_on);
        } catch (error) {
            console.error("Global Data fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, [fetchShellData, fetchStatsData]);

    const ensureWorkspaceBootstrap = useCallback(async (uid: string) => {
        await bootstrapUserWorkspace(supabase, {
            userId: uid,
            lists,
            hasProfile: Boolean(profile),
        });
        const nextProfile = await fetchShellData(uid);
        await fetchStatsData(uid, nextProfile?.timezone, nextProfile?.week_starts_on);
    }, [fetchShellData, fetchStatsData, lists, profile, supabase]);

    useEffect(() => {
        focusSessionsRef.current = [];
        knownFocusSessionIdsRef.current = new Set();
        locallyPatchedFocusSessionIdsRef.current = new Set();
        setFocusSessions([]);
    }, [userId]);

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                inboxProvisionAttemptedForRef.current = null;
                setUserId(user.id);
                void loadUserData(user.id);
                return;
            }

            inboxProvisionAttemptedForRef.current = null;
            setUserId(null);
            setFocusSessions([]);
            setLists([]);
            setProfile(null);
            setStats(null);
            setLoading(false);
        };

        void checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                inboxProvisionAttemptedForRef.current = null;
                setUserId((prevUserId) => {
                    if (prevUserId === session.user.id) return prevUserId;
                    void loadUserData(session.user.id);
                    return session.user.id;
                });
                return;
            }

            inboxProvisionAttemptedForRef.current = null;
            setUserId(null);
            setFocusSessions([]);
            setLists([]);
            setProfile(null);
            setStats(null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, [loadUserData, supabase]);

    const refreshData = useCallback(async () => {
        if (userId) {
            try {
                const nextProfile = await fetchShellData(userId);
                await fetchStatsData(userId, nextProfile?.timezone, nextProfile?.week_starts_on);
            } catch (error) {
                console.error("Global Data refresh error:", error);
            }
        }
    }, [fetchShellData, fetchStatsData, userId]);

    useEffect(() => {
        setStats((current) => {
            if (!current && focusSessionsRef.current.length === 0) return current;

            const tasksCompleted = current?.tasksCompleted ?? 0;
            const nextStats = buildStatsFromSessions(
                focusSessionsRef.current,
                tasksCompleted,
                profile?.timezone,
                profile?.week_starts_on,
            );
            return areStatsEqual(current, nextStats) ? current : nextStats;
        });
    }, [profile?.timezone, profile?.week_starts_on]);

    useEffect(() => {
        if (!userId || loading) return;

        const hasOwnedInbox = lists.some((list) => list.owner_id === userId && list.name.trim().toLowerCase() === "inbox");
        const needsBootstrap = !profile || !hasOwnedInbox;

        if (!needsBootstrap) {
            inboxProvisionAttemptedForRef.current = null;
            return;
        }
        if (inboxProvisionAttemptedForRef.current === userId) return;

        inboxProvisionAttemptedForRef.current = userId;

        void ensureWorkspaceBootstrap(userId).catch((error) => {
            inboxProvisionAttemptedForRef.current = null;
            console.error("Workspace bootstrap failed:", error);
        });
    }, [ensureWorkspaceBootstrap, lists, loading, profile, userId]);

    useEffect(() => {
        if (!userId) return;

        const syncChannel = supabase
            .channel(`app-sync-${userId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "todos", filter: `user_id=eq.${userId}` },
                (payload) => {
                    const handled = updateCompletedTaskCountFromPayload(payload as TodoRealtimePayload);
                    if (!handled) {
                        void fetchCompletedTaskCount(userId);
                    }
                },
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "focus_sessions", filter: `user_id=eq.${userId}` },
                (payload) => {
                    const nextSessionId = getRealtimeInsertedRowId(payload);
                    if (payload.eventType === "INSERT" && nextSessionId && locallyPatchedFocusSessionIdsRef.current.has(nextSessionId)) {
                        locallyPatchedFocusSessionIdsRef.current.delete(nextSessionId);
                        knownFocusSessionIdsRef.current.add(nextSessionId);
                        return;
                    }

                    void fetchFocusStats(userId, profile?.timezone, profile?.week_starts_on);
                },
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(syncChannel);
        };
    }, [fetchCompletedTaskCount, fetchFocusStats, profile?.timezone, profile?.week_starts_on, supabase, updateCompletedTaskCountFromPayload, userId]);

    useEffect(() => {
        if (!userId) return;

        return subscribeToFocusSessionCompleted((detail) => {
            if (detail.mode !== "focus") return;
            if (knownFocusSessionIdsRef.current.has(detail.sessionId)) return;
            if (locallyPatchedFocusSessionIdsRef.current.has(detail.sessionId)) return;

            const listName = detail.listId
                ? (lists.find((list) => list.id === detail.listId)?.name ?? "General")
                : "General";

            const nextSession: FocusSession = {
                id: detail.sessionId,
                user_id: userId,
                list_id: detail.listId,
                todo_id: detail.todoId,
                planned_block_id: detail.plannedBlockId,
                duration_seconds: detail.durationSeconds,
                mode: detail.mode,
                inserted_at: detail.insertedAt,
                todo_lists: listName ? { name: listName } : null,
            };

            locallyPatchedFocusSessionIdsRef.current.add(detail.sessionId);
            knownFocusSessionIdsRef.current.add(detail.sessionId);
            focusSessionsRef.current = [...focusSessionsRef.current, nextSession];
            setFocusSessions((current) => {
                const nextSessions = [...current, nextSession];
                return areFocusSessionsEqual(current, nextSessions) ? current : nextSessions;
            });

            setStats((current) => {
                const tasksCompleted = current?.tasksCompleted ?? 0;
                const nextStats = buildStatsFromSessions(
                    focusSessionsRef.current,
                    tasksCompleted,
                    profile?.timezone,
                    profile?.week_starts_on,
                );
                return areStatsEqual(current, nextStats) ? current : nextStats;
            });
        });
    }, [lists, profile?.timezone, profile?.week_starts_on, userId]);

    const value = useMemo(() => ({
        focusSessions,
        lists,
        profile,
        stats,
        loading,
        refreshData,
        userId,
    }), [focusSessions, lists, profile, stats, loading, refreshData, userId]);

    return (
        <DataContext.Provider value={value}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (context === undefined) {
        throw new Error("useData must be used within a DataProvider");
    }
    return context;
}

