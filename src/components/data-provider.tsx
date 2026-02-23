"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import type { TodoList, FocusSession } from "~/lib/types";

interface AppStats {
    totalHours: string;
    tasksCompleted: number;
    streak: number;
    avgSession: string;
    weeklyData: { day: string; date: string; minutes: number }[];
    subjectData: { name: string; value: number }[];
}

interface DataContextType {
    lists: TodoList[];
    profile: { username?: string; full_name?: string } | null;
    stats: AppStats | null;
    loading: boolean;
    refreshData: () => Promise<void>;
    userId: string | null;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export function DataProvider({ children }: { children: React.ReactNode }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [userId, setUserId] = useState<string | null>(null);
    const [lists, setLists] = useState<TodoList[]>([]);
    const [profile, setProfile] = useState<{ username?: string; full_name?: string } | null>(null);
    const [stats, setStats] = useState<AppStats | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async (uid: string) => {
        try {
            const [listsRes, profileRes, sessionsRes, todosRes] = await Promise.all([
                supabase.from("todo_list_members").select("list_id, role, todo_lists(*)").eq("user_id", uid),
                supabase.from("profiles").select("username, full_name").eq("id", uid).maybeSingle(),
                supabase.from("focus_sessions").select("*, todo_lists (name)").eq("user_id", uid).order("inserted_at", { ascending: true }),
                supabase.from("todos").select("*", { count: 'exact', head: true }).eq("user_id", uid).eq("is_done", true)
            ]);

            // Process Lists
            if (listsRes.data) {
                const userLists: TodoList[] = listsRes.data.map(m => ({
                    ...(m.todo_lists as any as TodoList),
                    user_role: m.role
                }));
                setLists(userLists);
            }

            // Process Profile
            if (profileRes.data) {
                setProfile(profileRes.data);
            }

            // Process Stats
            if (sessionsRes.data) {
                const sessions = sessionsRes.data as FocusSession[];
                const completedCount = todosRes.count || 0;

                // Weekly Data (Last 7 days)
                const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                const last7Days = Array.from({ length: 7 }, (_, i) => {
                    const d = new Date();
                    d.setDate(d.getDate() - (6 - i));
                    return {
                        day: days[d.getDay()] ?? "Unknown",
                        date: d.toISOString().split('T')[0] ?? "",
                        minutes: 0
                    };
                });

                let totalSeconds = 0;
                let focusSessionCount = 0;
                const subjects: Record<string, number> = {};

                sessions.forEach(s => {
                    if (s.mode === "focus") {
                        totalSeconds += s.duration_seconds;
                        focusSessionCount++;
                        const sessionDate = new Date(s.inserted_at).toISOString().split('T')[0];
                        const dayData = last7Days.find(d => d.date === sessionDate);
                        if (dayData) dayData.minutes += Math.round(s.duration_seconds / 60);
                        const subjectName = s.todo_lists?.name || "General";
                        subjects[subjectName] = (subjects[subjectName] || 0) + Math.round(s.duration_seconds / 60);
                    }
                });

                setStats({
                    totalHours: (totalSeconds / 3600).toFixed(1) + "h",
                    tasksCompleted: completedCount,
                    streak: calculateStreak(sessions),
                    avgSession: focusSessionCount > 0 ? Math.round((totalSeconds / 60) / focusSessionCount) + "m" : "0m",
                    weeklyData: last7Days,
                    subjectData: Object.entries(subjects).map(([name, value]) => ({ name, value }))
                });
            }
        } catch (error) {
            console.error("Global Data fetch error:", error);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                setUserId(user.id);
                void fetchData(user.id);
            } else {
                setLoading(false);
            }
        };
        void checkAuth();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                if (session.user.id !== userId) {
                    setUserId(session.user.id);
                    void fetchData(session.user.id);
                }
            } else {
                setUserId(null);
                setLists([]);
                setProfile(null);
                setStats(null);
            }
        });

        return () => subscription.unsubscribe();
    }, [supabase, fetchData, userId]);

    const refreshData = useCallback(async () => {
        if (userId) await fetchData(userId);
    }, [userId, fetchData]);

    useEffect(() => {
        if (!userId) return;

        const syncChannel = supabase
            .channel(`app-sync-${userId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "todos" },
                () => void refreshData()
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "focus_sessions" },
                () => void refreshData()
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(syncChannel);
        };
    }, [supabase, userId, refreshData]);

    function calculateStreak(sessions: FocusSession[]) {
        if (!sessions.length) return 0;
        const rawDates = sessions
            .filter(s => !!s.inserted_at)
            .map(s => new Date(s.inserted_at).toISOString().split('T')[0]) as string[];
        const dates = Array.from(new Set(rawDates)).sort().reverse();

        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let expectedDiff = 0;
        for (let i = 0; i < dates.length; i++) {
            const date = new Date(dates[i]!);
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

    const value = useMemo(() => ({
        lists,
        profile,
        stats,
        loading,
        refreshData,
        userId
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
