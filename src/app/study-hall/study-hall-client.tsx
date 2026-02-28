"use client";

import React, { useState, useEffect, useCallback } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { ListSidebar } from "../todos/list-sidebar";
import { FocusTimer } from "../todos/focus-timer";
import { useData } from "~/components/data-provider";
import { Trophy, Clock, Flame, ArrowLeft, Users, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import type { LeaderboardEntry, ActivityFeedEvent } from "~/lib/types";
import confetti from "canvas-confetti";

export default function StudyHallClient() {
    const { lists, profile, userId } = useData();
    const router = useRouter();
    const supabase = createSupabaseBrowserClient();

    // Ensure users are redirected to login if unauthenticated
    useEffect(() => {
        if (!userId) {
            supabase.auth.getSession().then(({ data }) => {
                if (!data.session) router.push('/login');
            });
        }
    }, [userId, router, supabase.auth]);

    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [activityFeed, setActivityFeed] = useState<ActivityFeedEvent[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLeaderboard = useCallback(async () => {
        const { data, error } = await supabase
            .from("weekly_leaderboard")
            .select("*")
            .limit(50);

        if (error) {
            console.error("Error fetching leaderboard:", error);
            return;
        }

        // Add rank manually since the view is ordered
        const rankedData: LeaderboardEntry[] = (data || []).map((entry, index) => ({
            ...entry,
            rank: index + 1
        }));

        setLeaderboard(rankedData);
    }, [supabase]);

    const fetchRecentActivity = useCallback(async () => {
        const { data, error } = await supabase
            .from("focus_sessions")
            .select("id, duration_seconds, inserted_at, user_id")
            .eq('mode', 'focus')
            .order("inserted_at", { ascending: false })
            .limit(5);

        if (error) {
            console.error("Error fetching activity:", error);
            return;
        }

        if (!data || data.length === 0) {
            setActivityFeed([]);
            return;
        }

        const userIds = [...new Set(data.map(s => s.user_id))];
        const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, username, avatar_url")
            .in("id", userIds);

        const profilesMap = (profilesData || []).reduce((acc: any, p: any) => {
            acc[p.id] = p;
            return acc;
        }, {});

        const formattedFeed: ActivityFeedEvent[] = data.map((item: any) => ({
            id: item.id,
            user_id: item.user_id,
            duration_seconds: item.duration_seconds,
            inserted_at: item.inserted_at,
            username: profilesMap[item.user_id]?.username || "Anonymous",
            avatar_url: profilesMap[item.user_id]?.avatar_url || null
        }));

        setActivityFeed(formattedFeed);
    }, [supabase]);

    useEffect(() => {
        let isMounted = true;
        Promise.all([fetchLeaderboard(), fetchRecentActivity()]).then(() => {
            if (isMounted) setLoading(false);
        });

        // Subscribe to NEW focus sessions to update the live feed
        const channel = supabase
            .channel('public:focus_sessions')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'focus_sessions' },
                async (payload) => {
                    const newSession = payload.new;
                    if (newSession.mode !== 'focus') return;

                    // Fetch the user's profile info to enrich the feed event
                    const { data: profileData } = await supabase
                        .from('profiles')
                        .select('username, avatar_url')
                        .eq('id', newSession.user_id)
                        .single();

                    const newEvent: ActivityFeedEvent = {
                        id: newSession.id,
                        user_id: newSession.user_id,
                        duration_seconds: newSession.duration_seconds,
                        inserted_at: newSession.inserted_at,
                        username: profileData?.username || "Anonymous Scholar",
                        avatar_url: profileData?.avatar_url || null
                    };

                    setActivityFeed(prev => [newEvent, ...prev].slice(0, 5)); // Keep max 5 items

                    // Also refresh the leaderboard to reflect the new time
                    fetchLeaderboard();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, fetchLeaderboard, fetchRecentActivity]);

    const handleLogout = async () => {
        await supabase.auth.signOut();
        router.push("/login");
    };

    const getRankStyles = (rank: number) => {
        switch (rank) {
            case 1: return "bg-yellow-500/10 border-yellow-500/50 text-yellow-600 dark:text-yellow-400";
            case 2: return "bg-gray-300/10 border-gray-400/50 text-gray-500 dark:text-gray-300";
            case 3: return "bg-amber-700/10 border-amber-700/50 text-amber-800 dark:text-amber-500";
            default: return "bg-card border-border/40 text-muted-foreground";
        }
    };

    const getRankIcon = (rank: number) => {
        if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500 drop-shadow-sm" />;
        if (rank === 2) return <Trophy className="w-5 h-5 text-gray-400 drop-shadow-sm" />;
        if (rank === 3) return <Trophy className="w-5 h-5 text-amber-600 drop-shadow-sm" />;
        return <span className="font-mono font-bold text-muted-foreground w-5 text-center">{rank}</span>;
    };


    if (!userId) {
        return (
            <div className="flex h-screen bg-background items-center justify-center">
                <div className="animate-pulse flex items-center gap-2 text-muted-foreground font-medium">
                    <Activity className="w-4 h-4 animate-spin text-primary" />
                    Checking credentials...
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-background overflow-hidden">
            {/* Sidebar */}
            <aside className="w-80 hidden lg:block h-full border-r border-sidebar-border">
                <ListSidebar
                    lists={lists}
                    activeListId={null} // Null because we are not on a list
                    onListSelect={(id) => router.push(`/todos?listId=${id}`)}
                    onCreateList={() => router.push("/todos")}
                    onDeleteList={() => { }}
                    onInvite={() => { }}
                    onLogout={handleLogout}
                    userId={userId}
                    username={profile?.username}
                />
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto custom-scrollbar relative">
                {/* Background Decor */}
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

                <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-8 pb-20 relative z-10">
                    {/* Header */}
                    <header className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-3">
                                <Users className="w-8 h-8 text-primary" />
                                Global Study Hall
                            </h1>
                            <p className="text-muted-foreground text-sm font-medium">
                                The weekly arena. Resets every Monday.
                            </p>
                        </div>
                        <Link href="/dashboard">
                            <Button variant="outline" className="rounded-xl gap-2 font-bold shadow-sm">
                                <ArrowLeft className="w-4 h-4" />
                                Back to Insights
                            </Button>
                        </Link>
                    </header>

                    {/* Persistent Focus Timer */}
                    <FocusTimer userId={userId} />

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Leaderboard Column (Takes up 2/3) */}
                        <div className="lg:col-span-2 space-y-4">
                            <Card className="bg-card/50 border-border/10 shadow-sm rounded-2xl overflow-hidden py-0 gap-0 h-fit">
                                <CardHeader className="border-b border-border/10 p-6 bg-transparent !pb-6">
                                    <CardTitle className="flex items-center gap-2 text-xl">
                                        <Trophy className="w-5 h-5 text-primary" />
                                        Top Scholars
                                    </CardTitle>
                                    <CardDescription>
                                        Ranked by total focus minutes this week.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-0">
                                    {loading ? (
                                        <div className="p-8 flex justify-center">
                                            <div className="animate-pulse flex items-center gap-2 text-muted-foreground">
                                                <Activity className="w-4 h-4" /> Loading Leaderboard...
                                            </div>
                                        </div>
                                    ) : leaderboard.length === 0 ? (
                                        <div className="p-12 text-center text-muted-foreground border-transparent">
                                            <Trophy className="w-12 h-12 mx-auto mb-4 opacity-20" />
                                            <p className="font-medium">No focus sessions recorded yet this week.</p>
                                            <p className="text-sm mt-1">Be the first to claim the top spot!</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-border/10">
                                            <AnimatePresence>
                                                {leaderboard.map((entry) => {
                                                    const isMe = entry.user_id === userId;
                                                    return (
                                                        <motion.div
                                                            key={entry.user_id}
                                                            layout
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0 }}
                                                            className={`flex items-center gap-4 p-4 transition-colors hover:bg-muted/30 ${isMe ? 'bg-primary/5' : ''}`}
                                                        >
                                                            {/* Rank */}
                                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 border-transparent ${getRankStyles(entry.rank!)}`}>
                                                                {getRankIcon(entry.rank!)}
                                                            </div>

                                                            {/* User Info */}
                                                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                                                <Avatar className={`w-10 h-10 border-2 ${isMe ? 'border-primary' : 'border-background'}`}>
                                                                    <AvatarImage src={entry.avatar_url || ""} />
                                                                    <AvatarFallback className="bg-primary/10 text-primary font-bold">
                                                                        {entry.username.substring(0, 2).toUpperCase()}
                                                                    </AvatarFallback>
                                                                </Avatar>
                                                                <div className="flex flex-col truncate">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`font-bold truncate ${isMe ? 'text-primary' : 'text-foreground'}`}>
                                                                            @{entry.username} {isMe && "(You)"}
                                                                        </span>
                                                                        {/* Placeholder for streak badge logic if we add it later */}
                                                                        {entry.rank! <= 3 && <Flame className="w-3.5 h-3.5 text-orange-500" />}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Score */}
                                                            <div className="text-right flex-shrink-0">
                                                                <div className="text-lg font-black font-mono">
                                                                    {entry.total_minutes}<span className="text-xs text-muted-foreground ml-0.5">m</span>
                                                                </div>
                                                                {/* Showing hours helper if > 60m */}
                                                                {entry.total_minutes > 60 && (
                                                                    <div className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">
                                                                        {(entry.total_minutes / 60).toFixed(1)} hrs
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })}
                                            </AnimatePresence>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>

                        {/* Live Feed Column (Takes up 1/3) */}
                        <div className="space-y-4">
                            <Card className="bg-card/50 border-border/10 shadow-sm rounded-2xl sticky top-8 py-0 gap-0 overflow-hidden h-fit">
                                <CardHeader className="border-b border-border/10 p-4 bg-transparent !pb-4">
                                    <CardTitle className="flex items-center gap-2 text-md">
                                        <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
                                        Live Feed
                                    </CardTitle>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                                        {loading ? (
                                            <div className="p-8 text-center text-muted-foreground text-sm">
                                                Sensing activity...
                                            </div>
                                        ) : activityFeed.length === 0 ? (
                                            <div className="p-8 text-center text-muted-foreground text-sm italic">
                                                No recent activity globally.
                                            </div>
                                        ) : (
                                            <div className="divide-y divide-border/10">
                                                <AnimatePresence>
                                                    {activityFeed.map((event) => (
                                                        <motion.div
                                                            key={event.id}
                                                            initial={{ opacity: 0, x: -20, backgroundColor: "rgba(16, 185, 129, 0.1)" }}
                                                            animate={{ opacity: 1, x: 0, backgroundColor: "transparent" }}
                                                            transition={{ duration: 0.5 }}
                                                            className="flex gap-3 px-4 py-3"
                                                        >
                                                            <Avatar className="w-8 h-8 flex-shrink-0 mt-0.5 border border-border">
                                                                <AvatarImage src={event.avatar_url || ""} />
                                                                <AvatarFallback className="bg-muted text-xs font-bold">
                                                                    {event.username.substring(0, 1).toUpperCase()}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                            <div className="flex flex-col min-w-0 flex-1">
                                                                <p className="text-sm text-foreground leading-tight">
                                                                    <span className="font-bold">@{event.username}</span> completed a <span className="font-bold text-primary">{Math.round(event.duration_seconds / 60)}m</span> session!
                                                                </p>
                                                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                                                    <Clock className="w-3 h-3" />
                                                                    {formatDistanceToNow(new Date(event.inserted_at), { addSuffix: true })}
                                                                </span>
                                                            </div>
                                                        </motion.div>
                                                    ))}
                                                </AnimatePresence>
                                            </div>
                                        )}
                                    </div>
                                    <div className="p-3 border-t border-border/40 bg-muted/10 text-center">
                                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest flex items-center justify-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                                            Syncing in real-time
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
