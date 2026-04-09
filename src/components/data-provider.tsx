"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
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
    totalHours: string;
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
}

interface DataContextType {
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

function calculateStreak(sessions: FocusSession[]) {
    if (!sessions.length) return 0;

    const rawDates = sessions.flatMap((session) => {
        if (!session.inserted_at) return [];
        const day = new Date(session.inserted_at).toISOString().split("T")[0] ?? "";
        return [day];
    });

    const dates = Array.from(new Set(rawDates)).sort().reverse();

    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let expectedDiff = 0;
    for (let i = 0; i < dates.length; i++) {
        const date = new Date(dates[i] ?? "");
        date.setHours(0, 0, 0, 0);
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

function getWeeklyDataSkeleton() {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));

        return {
            day: days[date.getDay()] ?? "Unknown",
            date: date.toISOString().split("T")[0] ?? "",
            minutes: 0,
        };
    });
}

function buildStatsFromSessions(sessions: FocusSession[], tasksCompleted: number): AppStats {
    const weeklyData = getWeeklyDataSkeleton();
    let totalSeconds = 0;
    let focusSessionCount = 0;
    const subjects: Record<string, number> = {};

    sessions.forEach((session) => {
        if (session.mode !== "focus") return;

        totalSeconds += session.duration_seconds;
        focusSessionCount += 1;

        const sessionDate = new Date(session.inserted_at).toISOString().split("T")[0] ?? "";
        const dayData = weeklyData.find((day) => day.date === sessionDate);
        if (dayData) {
            dayData.minutes += Math.round(session.duration_seconds / 60);
        }

        const subjectName = session.todo_lists?.name ?? "General";
        subjects[subjectName] = (subjects[subjectName] ?? 0) + Math.round(session.duration_seconds / 60);
    });

    return {
        totalHours: `${(totalSeconds / 3600).toFixed(1)}h`,
        tasksCompleted,
        streak: calculateStreak(sessions),
        avgSession: focusSessionCount > 0 ? `${Math.round((totalSeconds / 60) / focusSessionCount)}m` : "0m",
        weeklyData,
        subjectData: Object.entries(subjects).map(([name, value]) => ({ name, value })),
    };
}

function createEmptyStats(tasksCompleted = 0): AppStats {
    return {
        totalHours: "0.0h",
        tasksCompleted,
        streak: 0,
        avgSession: "0m",
        weeklyData: getWeeklyDataSkeleton(),
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
        && (current.daily_focus_goal_minutes ?? null) === (next.daily_focus_goal_minutes ?? null);
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

    return current.totalHours === next.totalHours
        && current.tasksCompleted === next.tasksCompleted
        && current.streak === next.streak
        && current.avgSession === next.avgSession
        && areWeeklyDataEqual(current.weeklyData, next.weeklyData)
        && areSubjectDataEqual(current.subjectData, next.subjectData);
}

export function DataProvider({ children }: { children: React.ReactNode }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [userId, setUserId] = useState<string | null>(null);
    const [lists, setLists] = useState<TodoList[]>([]);
    const [profile, setProfile] = useState<DataProfile | null>(null);
    const [stats, setStats] = useState<AppStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchShellData = useCallback(async (uid: string) => {
        const [listsRes, profileRes] = await Promise.all([
            supabase.from("todo_list_members").select("list_id, role, todo_lists(*)").eq("user_id", uid),
            supabase.from("profiles").select("username, full_name, avatar_url, daily_focus_goal_minutes").eq("id", uid).maybeSingle(),
        ]);

        if (listsRes.error) throw listsRes.error;
        if (profileRes.error) throw profileRes.error;

        const membershipRows = (listsRes.data ?? []) as ListMembershipRow[];
        const userLists: TodoList[] = membershipRows.flatMap((membership) => {
            const list = normalizeList(membership.todo_lists);
            if (!list) return [];
            return [{
                ...list,
                user_role: membership.role,
            }];
        });

        const nextProfile = profileRes.data
            ? {
                ...(profileRes.data as DataProfile),
                daily_focus_goal_minutes: (profileRes.data as DataProfile).daily_focus_goal_minutes ?? 120,
            }
            : null;

        setLists((current) => areListsEqual(current, userLists) ? current : userLists);
        setProfile((current) => areProfilesEqual(current, nextProfile) ? current : nextProfile);
    }, [supabase]);

    const fetchStatsData = useCallback(async (uid: string) => {
        const [sessionsRes, todosRes] = await Promise.all([
            supabase.from("focus_sessions").select("*, todo_lists (name)").eq("user_id", uid).order("inserted_at", { ascending: true }),
            supabase.from("todos").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("is_done", true),
        ]);

        if (sessionsRes.error) throw sessionsRes.error;
        if (todosRes.error) throw todosRes.error;

        const nextStats = buildStatsFromSessions((sessionsRes.data ?? []) as FocusSession[], todosRes.count ?? 0);
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
            const baseStats = current ?? createEmptyStats(nextCount);
            const nextStats = {
                ...baseStats,
                tasksCompleted: nextCount,
            };

            return areStatsEqual(current, nextStats) ? current : nextStats;
        });
    }, [supabase]);

    const fetchFocusStats = useCallback(async (uid: string) => {
        const { data, error } = await supabase
            .from("focus_sessions")
            .select("*, todo_lists (name)")
            .eq("user_id", uid)
            .order("inserted_at", { ascending: true });

        if (error) throw error;

        setStats((current) => {
            const tasksCompleted = current?.tasksCompleted ?? 0;
            const nextStats = buildStatsFromSessions((data ?? []) as FocusSession[], tasksCompleted);
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
            const baseStats = current ?? createEmptyStats();
            const nextStats = {
                ...baseStats,
                tasksCompleted: Math.max(0, baseStats.tasksCompleted + delta),
            };

            return areStatsEqual(current, nextStats) ? current : nextStats;
        });

        return true;
    }, []);

    const loadUserData = useCallback(async (uid: string) => {
        try {
            setLoading(true);
            await Promise.all([
                fetchShellData(uid),
                fetchStatsData(uid),
            ]);
        } catch (error) {
            console.error("Global Data fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, [fetchShellData, fetchStatsData]);

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();

            if (user) {
                setUserId(user.id);
                void loadUserData(user.id);
                return;
            }

            setUserId(null);
            setLists([]);
            setProfile(null);
            setStats(null);
            setLoading(false);
        };

        void checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                setUserId((prevUserId) => {
                    if (prevUserId === session.user.id) return prevUserId;
                    void loadUserData(session.user.id);
                    return session.user.id;
                });
                return;
            }

            setUserId(null);
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
                await Promise.all([
                    fetchShellData(userId),
                    fetchStatsData(userId),
                ]);
            } catch (error) {
                console.error("Global Data refresh error:", error);
            }
        }
    }, [fetchShellData, fetchStatsData, userId]);

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
                () => void fetchFocusStats(userId),
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(syncChannel);
        };
    }, [fetchCompletedTaskCount, fetchFocusStats, supabase, updateCompletedTaskCountFromPayload, userId]);

    const value = useMemo(() => ({
        lists,
        profile,
        stats,
        loading,
        refreshData,
        userId,
    }), [lists, profile, stats, loading, refreshData, userId]);

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

