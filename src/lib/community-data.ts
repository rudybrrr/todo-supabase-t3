import { normalizePlannerWeekStartsOn } from "~/lib/planning";
import { getProgressWeekWindow } from "~/lib/progress-review";
import { toDateKeyInTimeZone } from "~/lib/task-deadlines";
import type { FocusSession, WeeklyCommitmentRow } from "~/lib/types";

export interface CommunityPeerProfile {
    id: string;
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
}

export interface CommunityLeaderboardEntry {
    user_id: string;
    username: string;
    avatar_url: string | null;
    total_minutes: number;
    shared_project_count: number;
    rank: number;
}



export function buildCommunityLeaderboard(input: {
    sessions: FocusSession[];
    peerProfiles: Map<string, CommunityPeerProfile>;
    sharedProjectCounts: Map<string, number>;
    timeZone?: string | null;
    weekStartsOn?: number | null;
    now?: Date;
}) {
    const { sessions, peerProfiles, sharedProjectCounts, timeZone, weekStartsOn, now = new Date() } = input;
    const weekWindow = getProgressWeekWindow(timeZone, now, normalizePlannerWeekStartsOn(weekStartsOn));
    const minutesByUserId = new Map<string, number>();

    sessions.forEach((session) => {
        if (session.mode !== "focus") return;
        if (!weekWindow.dateKeys.includes(toDateKeyInTimeZone(session.inserted_at, timeZone))) return;
        minutesByUserId.set(session.user_id, (minutesByUserId.get(session.user_id) ?? 0) + Math.round(session.duration_seconds / 60));
    });

    return Array.from(minutesByUserId.entries())
        .map(([userId, totalMinutes]) => {
            const profile = peerProfiles.get(userId);

            return {
                user_id: userId,
                username: profile?.username ?? "anonymous",
                avatar_url: profile?.avatar_url ?? null,
                total_minutes: totalMinutes,
                shared_project_count: sharedProjectCounts.get(userId) ?? 0,
                rank: 0,
            };
        })
        .sort((a, b) => {
            if (b.total_minutes !== a.total_minutes) return b.total_minutes - a.total_minutes;
            return a.username.localeCompare(b.username);
        })
        .map((entry, index) => ({
            ...entry,
            rank: index + 1,
        })) satisfies CommunityLeaderboardEntry[];
}



export function createEmptyWeeklyCommitment(input: {
    userId: string;
    weekStartOn: string;
}): WeeklyCommitmentRow {
    const now = new Date().toISOString();

    return {
        id: `local-${input.userId}-${input.weekStartOn}`,
        user_id: input.userId,
        week_start_on: input.weekStartOn,
        summary: null,
        target_focus_minutes: null,
        target_task_count: null,
        inserted_at: now,
        updated_at: now,
    };
}
