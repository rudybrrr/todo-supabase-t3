import type { TimerMode } from "~/lib/types";

export interface FocusSessionCompletedEventDetail {
    sessionId: string;
    durationSeconds: number;
    mode: TimerMode;
    listId: string | null;
    todoId: string | null;
    plannedBlockId: string | null;
    insertedAt: string;
}

const FOCUS_SESSION_COMPLETED_EVENT = "stride:focus-session-completed";

function isFocusSessionCompletedEventDetail(value: unknown): value is FocusSessionCompletedEventDetail {
    if (!value || typeof value !== "object") return false;

    const detail = value as Record<string, unknown>;
    return (
        typeof detail.sessionId === "string"
        && detail.sessionId.length > 0
        && typeof detail.durationSeconds === "number"
        && typeof detail.mode === "string"
        && (typeof detail.listId === "string" || detail.listId === null)
        && (typeof detail.todoId === "string" || detail.todoId === null)
        && (typeof detail.plannedBlockId === "string" || detail.plannedBlockId === null)
        && typeof detail.insertedAt === "string"
    );
}

export function emitFocusSessionCompleted(detail: FocusSessionCompletedEventDetail) {
    if (typeof window === "undefined") return;

    window.dispatchEvent(new CustomEvent<FocusSessionCompletedEventDetail>(
        FOCUS_SESSION_COMPLETED_EVENT,
        { detail },
    ));
}

export function subscribeToFocusSessionCompleted(
    handler: (detail: FocusSessionCompletedEventDetail) => void,
) {
    if (typeof window === "undefined") {
        return () => undefined;
    }

    const listener = (event: Event) => {
        if (!(event instanceof CustomEvent)) return;
        if (!isFocusSessionCompletedEventDetail(event.detail)) return;
        handler(event.detail);
    };

    window.addEventListener(FOCUS_SESSION_COMPLETED_EVENT, listener);
    return () => {
        window.removeEventListener(FOCUS_SESSION_COMPLETED_EVENT, listener);
    };
}
