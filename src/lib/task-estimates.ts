import { PLANNER_DEFAULT_BLOCK_MINUTES, PLANNER_MIN_BLOCK_MINUTES, snapPlannerMinutes } from "~/lib/planning";
import type { FocusSession, TodoRow } from "~/lib/types";

export type TaskEstimateAccuracyStatus = "on_track" | "overestimated" | "underestimated";

export interface TaskFocusSummary {
    actualFocusMinutes: number;
    focusSessionCount: number;
    lastFocusedAt: string | null;
    medianSessionMinutes: number | null;
    taskId: string;
}

type EstimatableTask = Pick<TodoRow, "estimated_minutes" | "id"> & {
    remaining_estimated_minutes?: number | null;
};

function getFocusSessionMinutes(durationSeconds: number) {
    return Math.max(1, Math.round(durationSeconds / 60));
}

function getMedianSessionMinutes(values: number[]) {
    if (values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const middleIndex = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 1) {
        return sorted[middleIndex] ?? null;
    }

    const lower = sorted[middleIndex - 1] ?? 0;
    const upper = sorted[middleIndex] ?? 0;
    return Math.round((lower + upper) / 2);
}

export function buildTaskFocusSummaryMap(sessions: FocusSession[]) {
    const workingSummaryByTaskId = new Map<string, {
        actualFocusMinutes: number;
        focusSessionCount: number;
        lastFocusedAt: string | null;
        sessionMinutes: number[];
    }>();

    sessions.forEach((session) => {
        if (session.mode !== "focus" || !session.todo_id) return;

        const sessionMinutes = getFocusSessionMinutes(session.duration_seconds);
        const summary = workingSummaryByTaskId.get(session.todo_id) ?? {
            actualFocusMinutes: 0,
            focusSessionCount: 0,
            lastFocusedAt: null,
            sessionMinutes: [],
        };

        summary.actualFocusMinutes += sessionMinutes;
        summary.focusSessionCount += 1;
        summary.sessionMinutes.push(sessionMinutes);
        summary.lastFocusedAt = summary.lastFocusedAt && summary.lastFocusedAt > session.inserted_at
            ? summary.lastFocusedAt
            : session.inserted_at;

        workingSummaryByTaskId.set(session.todo_id, summary);
    });

    return new Map(
        Array.from(workingSummaryByTaskId.entries()).map(([taskId, summary]) => [
            taskId,
            {
                taskId,
                actualFocusMinutes: summary.actualFocusMinutes,
                focusSessionCount: summary.focusSessionCount,
                lastFocusedAt: summary.lastFocusedAt,
                medianSessionMinutes: getMedianSessionMinutes(summary.sessionMinutes),
            } satisfies TaskFocusSummary,
        ]),
    );
}

export function getTaskEstimateVarianceMinutes(
    estimatedMinutes: number | null | undefined,
    actualFocusMinutes: number,
) {
    if (!estimatedMinutes || estimatedMinutes <= 0) return null;
    return actualFocusMinutes - estimatedMinutes;
}

export function getTaskEstimateAccuracyStatus(
    estimatedMinutes: number | null | undefined,
    actualFocusMinutes: number,
): TaskEstimateAccuracyStatus | null {
    if (!estimatedMinutes || estimatedMinutes <= 0) return null;
    if (actualFocusMinutes <= 0) return null;

    const varianceMinutes = actualFocusMinutes - estimatedMinutes;
    const toleranceMinutes = Math.max(15, Math.round(estimatedMinutes * 0.2));

    if (Math.abs(varianceMinutes) <= toleranceMinutes) {
        return "on_track";
    }

    return varianceMinutes > 0 ? "underestimated" : "overestimated";
}

export function getTaskEstimateAccuracyLabel(status: TaskEstimateAccuracyStatus | null | undefined) {
    switch (status) {
        case "underestimated":
            return "Underestimated";
        case "overestimated":
            return "Overestimated";
        case "on_track":
            return "On track";
        default:
            return "No baseline";
    }
}

export function getSuggestedTaskBlockMinutes(
    task: EstimatableTask,
    summary?: TaskFocusSummary | null,
    options?: {
        fallbackMinutes?: number;
        maximumMinutes?: number;
        minimumMinutes?: number;
    },
) {
    const fallbackMinutes = options?.fallbackMinutes ?? PLANNER_DEFAULT_BLOCK_MINUTES;
    const minimumMinutes = options?.minimumMinutes ?? PLANNER_MIN_BLOCK_MINUTES;
    const maximumMinutes = options?.maximumMinutes ?? 180;
    const remainingEstimatedMinutes = task.remaining_estimated_minutes;

    let candidateMinutes = summary?.medianSessionMinutes
        ?? remainingEstimatedMinutes
        ?? task.estimated_minutes
        ?? fallbackMinutes;

    if (
        remainingEstimatedMinutes != null
        && remainingEstimatedMinutes > 0
        && candidateMinutes > remainingEstimatedMinutes
    ) {
        candidateMinutes = remainingEstimatedMinutes;
    }

    return Math.min(
        Math.max(snapPlannerMinutes(candidateMinutes, { mode: "ceil" }), minimumMinutes),
        maximumMinutes,
    );
}

export function getRemainingEstimateSessionCount(
    remainingEstimatedMinutes: number | null | undefined,
    summary?: TaskFocusSummary | null,
    fallbackMinutes = PLANNER_DEFAULT_BLOCK_MINUTES,
) {
    if (remainingEstimatedMinutes == null) return null;
    if (remainingEstimatedMinutes <= 0) return 0;

    const typicalMinutes = Math.max(summary?.medianSessionMinutes ?? fallbackMinutes, PLANNER_MIN_BLOCK_MINUTES);
    return Math.max(1, Math.ceil(remainingEstimatedMinutes / typicalMinutes));
}
