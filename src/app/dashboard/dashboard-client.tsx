"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from "recharts";
import {
    Brain, Timer, CheckCircle2, Flame, ArrowLeft,
    Calendar, TrendingUp, Target, Clock
} from "lucide-react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { ListSidebar } from "../todos/list-sidebar";
import { FocusTimer } from "../todos/focus-timer"; // Added this import
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FocusSession, TodoList } from "~/lib/types";

// Chart color palette
const COLORS = [
    "hsl(var(--primary))",
    "#fb7185",
    "#f43f5e",
    "#e11d48",
    "#be123c"
];


export default function DashboardClient({ userId }: { userId: string }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const router = useRouter();
    const [lists, setLists] = useState<TodoList[]>([]);
    const [weeklyData, setWeeklyData] = useState<{ day: string; date: string; minutes: number }[]>([]);
    const [subjectData, setSubjectData] = useState<{ name: string; value: number }[]>([]);
    const [stats, setStats] = useState({
        totalHours: "0h",
        tasksCompleted: 0,
        streak: 0,
        avgSession: "0m"
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            // 1. Fetch Focus Sessions
            const { data: sessions } = await supabase
                .from("focus_sessions")
                .select(`
                    *,
                    todo_lists (name)
                `)
                .eq("user_id", userId)
                .order("inserted_at", { ascending: true }) as { data: FocusSession[] | null };

            // 2. Fetch Completed Tasks
            const { count: completedCount } = await supabase
                .from("todos")
                .select("*", { count: 'exact', head: true })
                .eq("user_id", userId)
                .eq("is_done", true);

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

                        // Weekly distribution
                        const sessionDate = new Date(s.inserted_at as string).toISOString().split('T')[0];
                        const dayData = last7Days.find(d => d.date === sessionDate);
                        if (dayData) {
                            dayData.minutes += Math.round(s.duration_seconds / 60);
                        }

                        // Subject breakdown
                        const subjectName = s.todo_lists?.name || "General";
                        subjects[subjectName] = (subjects[subjectName] || 0) + Math.round(s.duration_seconds / 60);
                    }
                });

                setWeeklyData(last7Days);
                setSubjectData(Object.entries(subjects).map(([name, value]) => ({ name, value })));

                setStats({
                    totalHours: (totalSeconds / 3600).toFixed(1) + "h",
                    tasksCompleted: completedCount || 0,
                    streak: calculateStreak(sessions),
                    avgSession: focusSessionCount > 0
                        ? Math.round((totalSeconds / 60) / focusSessionCount) + "m"
                        : "0m"
                });
            }
        } catch (error) {
            console.error("Error fetching stats:", error);
        } finally {
            setLoading(false);
        }
    }, [supabase, userId]);

    const fetchLists = useCallback(async () => {
        const { data } = await supabase
            .from("todo_lists")
            .select("*")
            .eq("owner_id", userId);
        if (data) setLists(data);
    }, [supabase, userId]);

    useEffect(() => {
        void fetchLists();
        void fetchStats();
    }, [fetchLists, fetchStats]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.refresh();
    };

    function calculateStreak(sessions: FocusSession[]) {
        if (!sessions.length) return 0;
        const rawDates = sessions
            .filter(s => !!s.inserted_at)
            .map(s => new Date(s.inserted_at).toISOString().split('T')[0]) as string[];
        const dates = Array.from(new Set(rawDates)).reverse();

        let streak = 0;
        let currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);

        for (const dateStr of dates) {
            const date = new Date(dateStr);
            date.setHours(0, 0, 0, 0);

            const diffDays = Math.floor((currentDate.getTime() - date.getTime()) / (1000 * 3600 * 24));

            if (diffDays === streak) {
                streak++;
            } else if (diffDays > streak) {
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
                        <StatsCard
                            title="Total Focus"
                            value={stats.totalHours}
                            subtext={parseFloat(stats.totalHours) > 0 ? "Lifetime focus" : "Ready to focus?"}
                            icon={Brain}
                            color="text-primary"
                        />
                        <StatsCard
                            title="Completed"
                            value={stats.tasksCompleted}
                            subtext={stats.tasksCompleted > 0 ? "Tasks done" : "Finish a task to start"}
                            icon={CheckCircle2}
                            color="text-emerald-500"
                        />
                        <StatsCard
                            title="Study Streak"
                            value={`${stats.streak} days`}
                            subtext={stats.streak > 0 ? "Keep it up!" : "Start your journey today"}
                            icon={Flame}
                            color="text-orange-500"
                        />
                        <StatsCard
                            title="Avg Session"
                            value={stats.avgSession}
                            subtext={parseInt(stats.avgSession) > 0 ? "Highly productive" : "Start your first session"}
                            icon={Timer}
                            color="text-blue-500"
                        />
                    </div>

                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Study Chart */}
                        <Card className="lg:col-span-2 glass-card rounded-3xl overflow-hidden border-border/40 shadow-xl shadow-primary/5">
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
                                                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                                                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
                                            <XAxis
                                                dataKey="day"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: 'var(--foreground)', opacity: 0.6, fontSize: 12, fontWeight: 700 }}
                                                dy={10}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: 'var(--foreground)', opacity: 0.6, fontSize: 12, fontWeight: 700 }}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: 'hsl(var(--card))',
                                                    borderRadius: '16px',
                                                    border: '1px solid hsl(var(--border))',
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
                                                stroke="hsl(var(--primary))"
                                                strokeWidth={4}
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

                        {/* Project Breakdown */}
                        <Card className="glass-card rounded-3xl overflow-hidden border-border/40 shadow-xl shadow-primary/5">
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
                                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} strokeWidth={0} />
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
                                                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
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
                    </div>

                </div>
            </main>
        </div>
    );
}

function StatsCard({ title, value, subtext, icon: Icon, color }: any) {
    return (
        <Card className="glass-card rounded-2xl border-border/40 hover:shadow-lg transition-all duration-300 group">
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
}
