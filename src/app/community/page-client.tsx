"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Clock3, Trophy } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { AppShell } from "~/components/app-shell";
import { EmptyState, PageHeader, SectionCard } from "~/components/app-primitives";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { useData } from "~/components/data-provider";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { getPublicAvatarUrl } from "~/lib/avatar";
import type { ActivityFeedEvent, LeaderboardEntry } from "~/lib/types";

interface WeeklyLeaderboardRow {
    user_id: string;
    username: string | null;
    avatar_url: string | null;
    total_minutes: number | null;
}

interface FocusSessionActivityRow {
    id: string;
    user_id: string;
    duration_seconds: number;
    inserted_at: string;
}

interface PublicProfileRow {
    id: string;
    username: string | null;
    avatar_url: string | null;
}

interface FocusSessionInsertPayload {
    id: string;
    user_id: string;
    duration_seconds: number;
    inserted_at: string;
    mode: string;
}

function isFocusSessionInsertPayload(value: unknown): value is FocusSessionInsertPayload {
    if (!value || typeof value !== "object") return false;
    const row = value as Record<string, unknown>;
    return (
        typeof row.id === "string"
        && typeof row.user_id === "string"
        && typeof row.duration_seconds === "number"
        && typeof row.inserted_at === "string"
        && typeof row.mode === "string"
    );
}

export default function CommunityClient() {
    const { userId } = useData();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
    const [activityFeed, setActivityFeed] = useState<ActivityFeedEvent[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchLeaderboard = useCallback(async () => {
        const { data, error } = await supabase
            .from("weekly_leaderboard")
            .select("user_id, username, avatar_url, total_minutes")
            .limit(30);

        if (error) {
            throw error;
        }

        const ranked = ((data ?? []) as WeeklyLeaderboardRow[])
            .sort((a, b) => (b.total_minutes ?? 0) - (a.total_minutes ?? 0))
            .map((entry, index) => ({
                user_id: entry.user_id,
                username: entry.username ?? "anonymous",
                avatar_url: getPublicAvatarUrl(supabase, entry.avatar_url),
                total_minutes: entry.total_minutes ?? 0,
                rank: index + 1,
            }));

        setLeaderboard(ranked);
    }, [supabase]);

    const fetchRecentActivity = useCallback(async () => {
        const { data, error } = await supabase
            .from("focus_sessions")
            .select("id, duration_seconds, inserted_at, user_id")
            .eq("mode", "focus")
            .order("inserted_at", { ascending: false })
            .limit(8);

        if (error) {
            throw error;
        }

        const sessions = (data ?? []) as FocusSessionActivityRow[];
        const userIds = [...new Set(sessions.map((session) => session.user_id))];
        const { data: profilesData } = await supabase
            .from("profiles")
            .select("id, username, avatar_url")
            .in("id", userIds);

        const profileMap = new Map(
            ((profilesData ?? []) as PublicProfileRow[]).map((profileRow) => [profileRow.id, profileRow]),
        );

        setActivityFeed(
            sessions.map((session) => ({
                id: session.id,
                user_id: session.user_id,
                duration_seconds: session.duration_seconds,
                inserted_at: session.inserted_at,
                username: profileMap.get(session.user_id)?.username ?? "Anonymous",
                avatar_url: getPublicAvatarUrl(supabase, profileMap.get(session.user_id)?.avatar_url),
            })),
        );
    }, [supabase]);

    useEffect(() => {
        let active = true;

        void Promise.all([fetchLeaderboard(), fetchRecentActivity()])
            .catch(() => undefined)
            .finally(() => {
                if (active) setLoading(false);
            });

        const channel = supabase
            .channel("community-focus-feed")
            .on(
                "postgres_changes",
                { event: "INSERT", schema: "public", table: "focus_sessions" },
                (payload) => {
                    if (!isFocusSessionInsertPayload(payload.new) || payload.new.mode !== "focus") return;
                    void fetchLeaderboard();
                    void fetchRecentActivity();
                },
            )
            .subscribe();

        return () => {
            active = false;
            void supabase.removeChannel(channel);
        };
    }, [fetchLeaderboard, fetchRecentActivity, supabase]);

    return (
        <AppShell>
            <div className="page-container">
                <PageHeader
                    title="Community"
                />

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                    <SectionCard title="Weekly leaderboard">
                        {loading ? (
                            <div className="surface-muted px-3 py-6 text-sm text-muted-foreground">Loading leaderboard...</div>
                        ) : leaderboard.length > 0 ? (
                            <div className="overflow-hidden rounded-xl border border-border/60 bg-background/60">
                                {leaderboard.map((entry, index) => (
                                    <div key={entry.user_id} className={`flex items-center gap-3 px-3.5 py-3 ${index !== leaderboard.length - 1 ? "border-b border-border/50" : ""}`}>
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary/70 text-sm font-semibold text-foreground">
                                            {entry.rank === 1 ? <Trophy className="h-5 w-5 text-amber-500" /> : entry.rank}
                                        </div>
                                        <Avatar className="h-9 w-9 border border-border/60">
                                            <AvatarImage src={entry.avatar_url ?? ""} alt={entry.username} />
                                            <AvatarFallback className="bg-primary/12 text-primary">
                                                {entry.username.slice(0, 1).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-semibold text-foreground">
                                                @{entry.username} {entry.user_id === userId ? "(You)" : ""}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-mono text-base font-semibold text-foreground">{entry.total_minutes}m</p>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">focus</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                title="No sessions yet"
                                description="Focus sessions will show up here."
                                icon={<Trophy className="h-8 w-8" />}
                            />
                        )}
                    </SectionCard>

                    <SectionCard title="Live feed">
                        {loading ? (
                            <div className="surface-muted px-3 py-6 text-sm text-muted-foreground">Loading activity...</div>
                        ) : activityFeed.length > 0 ? (
                            <div className="space-y-2.5">
                                {activityFeed.map((event) => (
                                    <div key={event.id} className="rounded-xl border border-border/60 bg-background/70 px-3.5 py-3">
                                        <div className="flex items-start gap-2.5">
                                            <Avatar className="h-9 w-9 border border-border/60">
                                                <AvatarImage src={event.avatar_url ?? ""} alt={event.username} />
                                                <AvatarFallback className="bg-primary/12 text-primary">
                                                    {event.username.slice(0, 1).toUpperCase()}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm text-foreground">
                                                    <span className="font-semibold">@{event.username}</span> completed a{" "}
                                                    <span className="font-semibold text-primary">{Math.round(event.duration_seconds / 60)}m</span> focus session.
                                                </p>
                                                <div className="mt-1.5 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                                    <Clock3 className="h-3.5 w-3.5" />
                                                    {formatDistanceToNow(new Date(event.inserted_at), { addSuffix: true })}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                title="Quiet right now"
                                description="Recent focus sessions will appear here."
                                icon={<Activity className="h-8 w-8" />}
                            />
                        )}
                    </SectionCard>
                </div>
            </div>
        </AppShell>
    );
}
