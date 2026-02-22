"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import dynamic from "next/dynamic";
const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false });
const PieChart = dynamic(() => import("recharts").then((mod) => mod.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then((mod) => mod.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then((mod) => mod.Cell), { ssr: false });
const ResponsiveContainer = dynamic(() => import("recharts").then((mod) => mod.ResponsiveContainer), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((mod) => mod.CartesianGrid), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });
import {
    Brain, Timer, CheckCircle2, Flame, ArrowLeft,
    Calendar, TrendingUp, Target, Clock
} from "lucide-react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { ListSidebar } from "../todos/list-sidebar";
import { FocusTimer } from "../todos/focus-timer";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import type { FocusSession, TodoList } from "~/lib/types";

const DARK_COLORS = [
    "#f8fafc", // Arctic White
    "#bae6fd", // Bright Sky
    "#fecdd3", // Bright Rose
    "#99f6e4", // Bright Teal
    "#fef08a", // Bright Yellow
    "#e9d5ff"  // Bright Lavender
];

const LIGHT_COLORS = [
    "hsl(var(--primary))",
    "#e11d48", // Rose 600
    "#059669", // Emerald 600
    "#2563eb", // Blue 600
    "#d97706", // Amber 600
    "#7c3aed"  // Violet 600
];


// Module-level "Instant Cache" to survive navigation
let dashCache: {
    weeklyData: { day: string; date: string; minutes: number }[];
    subjectData: { name: string; value: number }[];
    stats: { totalHours: string; tasksCompleted: number; streak: number; avgSession: string };
    lists: TodoList[];
} | null = null;

export default function DashboardClient({ userId }: { userId: string }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const router = useRouter();
    const { theme, resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    const [lists, setLists] = useState<TodoList[]>(dashCache?.lists || []);

    // Safety check for hydration
    useEffect(() => {
        setMounted(true);
    }, []);

    const isDark = mounted && (resolvedTheme === 'dark' || theme === 'dark');
    const colors = isDark ? DARK_COLORS : LIGHT_COLORS;
    const chartStroke = isDark ? "#ffffff" : "hsl(var(--primary))";
    const chartGrid = isDark ? "#ffffff" : "hsl(var(--border))";
    const chartTick = isDark ? "#ffffff" : "hsl(var(--foreground))";
    const chartFill = isDark ? "#f8fafc" : "hsl(var(--primary))";
    const [weeklyData, setWeeklyData] = useState<{ day: string; date: string; minutes: number }[]>(dashCache?.weeklyData || []);
    const [subjectData, setSubjectData] = useState<{ name: string; value: number }[]>(dashCache?.subjectData || []);
    const [stats, setStats] = useState(dashCache?.stats || {
        totalHours: "0h",
        tasksCompleted: 0,
        streak: 0,
        avgSession: "0m"
    });
    const [loading, setLoading] = useState(!dashCache); // Only show loading if no cache

    const fetchStatsAndLists = useCallback(async () => {
        // Only show loading pulse if we have literally no data (first visit)
        if (!dashCache) setLoading(true);

        try {
            // FIRE EVERYTHING IN PARALLEL 🏎️
            const [sessionsRes, todosRes, listsRes] = await Promise.all([
                supabase
                    .from("focus_sessions")
                    .select("*, todo_lists (name)")
                    .eq("user_id", userId)
                    .order("inserted_at", { ascending: true }),
                supabase
                    .from("todos")
                    .select("*", { count: 'exact', head: true })
                    .eq("user_id", userId)
                    .eq("is_done", true),
                supabase
                    .from("todo_lists")
                    .select("*")
                    .eq("owner_id", userId)
            ]);

            const sessions = sessionsRes.data as FocusSession[] | null;
            const completedCount = todosRes.count;
            const listsData = listsRes.data as TodoList[] | null;

            if (listsData) {
                setLists(listsData);
            }

            if (sessions) {
                // Parse Weekly Data (Last 7 days)
                const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                const last7Days: { day: string; date: string; minutes: number }[] = Array.from({ length: 7 }, (_, i) => {
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
                        const sessionDate = new Date(s.inserted_at as string).toISOString().split('T')[0];
                        const dayData = last7Days.find(d => d.date === sessionDate);
                        if (dayData) dayData.minutes += Math.round(s.duration_seconds / 60);
                        const subjectName = s.todo_lists?.name || "General";
                        subjects[subjectName] = (subjects[subjectName] || 0) + Math.round(s.duration_seconds / 60);
                    }
                });

                const newStats = {
                    totalHours: (totalSeconds / 3600).toFixed(1) + "h",
                    tasksCompleted: completedCount || 0,
                    streak: calculateStreak(sessions),
                    avgSession: focusSessionCount > 0 ? Math.round((totalSeconds / 60) / focusSessionCount) + "m" : "0m"
                };

                const newWeeklyData = last7Days;
                const newSubjectData = Object.entries(subjects).map(([name, value]) => ({ name, value }));

                setWeeklyData(newWeeklyData);
                setSubjectData(newSubjectData);
                setStats(newStats);

                // Update the "Extreme Cache" 🏎️
                dashCache = {
                    weeklyData: newWeeklyData,
                    subjectData: newSubjectData,
                    stats: newStats,
                    lists: listsData || []
                };
            }
        } catch (error) {
            console.error("Extreme Fetch Error:", error);
        } finally {
            setLoading(false);
        }
    }, [supabase, userId]);

    useEffect(() => {
        void fetchStatsAndLists();
    }, [fetchStatsAndLists]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.refresh();
    };

    function calculateStreak(sessions: FocusSession[]) {
        if (!sessions.length) return 0;

        // Get unique dates in YYYY-MM-DD format, sorted newest to oldest
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

            // Calculate difference in calendar days
            const diffDays = Math.round((today.getTime() - date.getTime()) / (1000 * 3600 * 24));

            if (diffDays === expectedDiff) {
                // Perfect consecutive match
                streak++;
                expectedDiff++;
            } else if (i === 0 && diffDays === 1) {
                // Special case: Missed today, but started yesterday. Streak is still active.
                streak = 1;
                expectedDiff = 2;
            } else {
                // Gap detected
                break;
            }
        }
        return streak;
    }

    if (loading) {
        return <div className="flex h-screen items-center justify-center bg-background">
            <div className="animate-pulse flex flex-col items-center gap-4">
                <TrendingUp className="w-12 h-12 text-primary/40" />
                <p className="text-muted-foreground font-bold tracking-widest uppercase text-xs">Analyzing Focus...</p>
            </div>
        </div>;
    }

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            {/* Sidebar */}
            <aside className="w-80 hidden lg:block h-full">
                <ListSidebar
                    lists={lists}
                    activeListId={null}
                    onListSelect={() => router.push("/todos")}
                    onCreateList={() => router.push("/todos")}
                    onDeleteList={() => { }}
                    onInvite={() => { }}
                    onLogout={handleLogout}
                    userId={userId}
                />
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto custom-scrollbar">
                <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8 pb-20">
                    {/* Header */}
                    <header className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                                <TrendingUp className="w-8 h-8 text-primary" />
                                Insights
                            </h1>
                            <p className="text-muted-foreground text-sm font-medium">
                                Tracking your journey to academic excellence.
                            </p>
                        </div>
                        <Link href="/todos">
                            <Button variant="outline" className="rounded-xl gap-2 font-bold shadow-sm">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Todos
                            </Button>
                        </Link>
                    </header>

                    {/* Persistent Focus Timer */}
                    <FocusTimer userId={userId} />

                    {/* Quick Stats Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {[
                            { title: "Total Focus", value: stats.totalHours, subtext: parseFloat(stats.totalHours) > 0 ? "Lifetime focus" : "Ready to focus?", icon: Brain, color: "text-primary" },
                            { title: "Completed", value: stats.tasksCompleted, subtext: stats.tasksCompleted > 0 ? "Tasks done" : "Finish a task to start", icon: CheckCircle2, color: "text-emerald-500" },
                            { title: "Study Streak", value: `${stats.streak} days`, subtext: stats.streak > 0 ? "Keep it up!" : "Start your journey today", icon: Flame, color: "text-orange-500" },
                            { title: "Avg Session", value: stats.avgSession, subtext: parseInt(stats.avgSession) > 0 ? "Highly productive" : "Start your first session", icon: Timer, color: "text-blue-500" }
                        ].map((stat, i) => (
                            <motion.div
                                key={stat.title}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05, duration: 0.3 }}
                                whileHover={{ y: -2 }}
                            >
                                <StatsCard
                                    title={stat.title}
                                    value={stat.value}
                                    subtext={stat.subtext}
                                    icon={stat.icon}
                                    color={stat.color}
                                />
                            </motion.div>
                        ))}
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Study Chart */}
                        <motion.div
                            className="lg:col-span-2"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2, duration: 0.4 }}
                        >
                            <Card className="bg-card/50 rounded-2xl overflow-hidden border-border/40 shadow-sm transition-shadow hover:shadow-md h-full">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                                        <Clock className="w-5 h-5 text-primary" />
                                        Weekly Review
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="h-[350px] pt-4">
                                    {weeklyData.length > 0 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <AreaChart data={weeklyData}>
                                                <defs>
                                                    <linearGradient id="colorMinutes" x1="0" y1="0" x2="0" y2="1">
                                                        <stop offset="5%" stopColor={chartFill} stopOpacity={isDark ? 0.9 : 0.6} />
                                                        <stop offset="95%" stopColor={chartFill} stopOpacity={isDark ? 0.4 : 0.1} />
                                                    </linearGradient>
                                                </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={chartGrid} strokeOpacity={isDark ? 0.2 : 0.5} />
                                                <XAxis
                                                    dataKey="day"
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: chartTick, opacity: isDark ? 1 : 0.7, fontSize: 13, fontWeight: 800 }}
                                                    dy={10}
                                                />
                                                <YAxis
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tick={{ fill: chartTick, opacity: isDark ? 1 : 0.7, fontSize: 13, fontWeight: 800 }}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: 'rgba(var(--card), 0.8)',
                                                        backdropFilter: 'blur(12px)',
                                                        borderRadius: '16px',
                                                        border: '1px solid rgba(var(--border), 0.5)',
                                                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                                                        color: 'var(--foreground)'
                                                    }}
                                                    itemStyle={{ color: 'var(--foreground)' }}
                                                    labelStyle={{ color: 'var(--foreground)', fontWeight: 'bold' }}
                                                    cursor={{ stroke: 'hsl(var(--primary))', strokeWidth: 2 }}
                                                />
                                                <Area
                                                    type="monotone"
                                                    dataKey="minutes"
                                                    stroke={chartStroke}
                                                    strokeWidth={6}
                                                    dot={{ r: 5, fill: chartStroke, strokeWidth: 3, stroke: isDark ? '#0f172a' : '#ffffff' }}
                                                    activeDot={{ r: 8, strokeWidth: 0 }}
                                                    fillOpacity={1}
                                                    fill="url(#colorMinutes)"
                                                />
                                            </AreaChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-muted-foreground italic">
                                            No focus data yet for this week.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>

                        {/* Project Breakdown */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3, duration: 0.4 }}
                        >
                            <Card className="bg-card/50 rounded-2xl overflow-hidden border-border/40 shadow-sm transition-shadow hover:shadow-md h-full">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                                        <Target className="w-5 h-5 text-primary" />
                                        Subject Focus
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="h-[350px] flex flex-col items-center justify-center pt-4">
                                    {subjectData.length > 0 ? (
                                        <>
                                            <ResponsiveContainer width="100%" height="70%">
                                                <PieChart>
                                                    <Pie
                                                        data={subjectData}
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={60}
                                                        outerRadius={80}
                                                        paddingAngle={8}
                                                        dataKey="value"
                                                    >
                                                        {subjectData.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={colors[index % colors.length]} stroke={isDark ? "#ffffff" : "transparent"} strokeOpacity={0.5} strokeWidth={3} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="w-full mt-4 space-y-2 overflow-y-auto max-h-[100px] custom-scrollbar px-2">
                                                {subjectData.map((entry, index) => (
                                                    <div key={entry.name} className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div
                                                                className="w-3 h-3 rounded-full flex-shrink-0"
                                                                style={{ backgroundColor: colors[index % colors.length] }}
                                                            />
                                                            <span className="text-xs font-bold truncate">{entry.name}</span>
                                                        </div>
                                                        <span className="text-xs text-muted-foreground font-mono flex-shrink-0">
                                                            {entry.value}m
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-muted-foreground italic text-center p-8">
                                            Complete your first focus session to see subject breakdown.
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </motion.div>
                    </div>

                </div>
            </main>
        </div>
    );
}

const StatsCard = React.memo(function StatsCard({ title, value, subtext, icon: Icon, color }: any) {
    return (
        <Card className="bg-card/50 rounded-xl border-border/40 hover:shadow-md transition-all duration-300 group">
            <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
                    <Icon className={`w-5 h-5 ${color} opacity-80 group-hover:opacity-100 transition-opacity`} />
                </div>
                <div className="space-y-1">
                    <h3 className="text-2xl font-black tracking-tighter">{value}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">{subtext}</p>
                </div>
            </CardContent>
        </Card>
    );
});
