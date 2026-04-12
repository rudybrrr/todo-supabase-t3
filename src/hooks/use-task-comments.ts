"use client";

import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { createTaskComment, deleteTaskComment, isMissingTodoCommentsError, listTaskComments } from "~/lib/task-comments";
import type { TodoCommentRow } from "~/lib/types";

interface CommentProfileRow {
    id: string;
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
}

export interface TaskCommentView extends TodoCommentRow {
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
}

export function useTaskComments(taskId: string | null, options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? true;
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [comments, setComments] = useState<TaskCommentView[]>([]);
    const [loading, setLoading] = useState(false);
    const suppressedDeleteIdsRef = useRef<Set<string>>(new Set());

    const loadComments = useCallback(async (options?: { silent?: boolean }) => {
        if (!enabled || !taskId) {
            setComments([]);
            setLoading(false);
            return;
        }

        try {
            if (!options?.silent) {
                setLoading(true);
            }
            const commentRows = await listTaskComments(supabase, taskId);
            const userIds = Array.from(new Set(commentRows.map((comment) => comment.user_id)));
            const nextCommentsById = new Map<string, CommentProfileRow>();

            if (userIds.length > 0) {
                const { data: profileRows, error: profileError } = await supabase
                    .from("profiles")
                    .select("id, username, full_name, avatar_url")
                    .in("id", userIds);

                if (profileError) throw profileError;

                ((profileRows ?? []) as CommentProfileRow[]).forEach((profileRow) => {
                    nextCommentsById.set(profileRow.id, profileRow);
                });
            }

            setComments(commentRows.map((comment) => {
                const author = nextCommentsById.get(comment.user_id);
                return {
                    ...comment,
                    username: author?.username ?? null,
                    full_name: author?.full_name ?? null,
                    avatar_url: author?.avatar_url ?? null,
                };
            }));
        } catch (error) {
            if (isMissingTodoCommentsError(error)) {
                setComments([]);
                return;
            }

            toast.error(error instanceof Error ? error.message : "Unable to load comments.");
        } finally {
            if (!options?.silent) {
                setLoading(false);
            }
        }
    }, [enabled, supabase, taskId]);

    useEffect(() => {
        void loadComments();
    }, [loadComments]);

    useEffect(() => {
        if (!enabled || !taskId) return;

        const channel = supabase
            .channel(`todo-comments-${taskId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "todo_comments", filter: `todo_id=eq.${taskId}` },
                (payload: RealtimePostgresChangesPayload<TodoCommentRow>) => {
                    if (payload.eventType === "DELETE") {
                        const deletedCommentId = payload.old.id;
                        if (deletedCommentId && suppressedDeleteIdsRef.current.has(deletedCommentId)) {
                            suppressedDeleteIdsRef.current.delete(deletedCommentId);
                            return;
                        }

                        if (deletedCommentId) {
                            setComments((current) => current.filter((comment) => comment.id !== deletedCommentId));
                        }
                        return;
                    }

                    void loadComments({ silent: true });
                },
            )
            .subscribe();

        return () => {
            void supabase.removeChannel(channel);
        };
    }, [enabled, loadComments, supabase, taskId]);

    const addComment = useCallback(async (input: { listId: string; userId: string; body: string }) => {
        const createdComment = await createTaskComment(supabase, {
            todoId: taskId ?? "",
            listId: input.listId,
            userId: input.userId,
            body: input.body,
        });

        await loadComments({ silent: true });
        return createdComment;
    }, [loadComments, supabase, taskId]);

    const removeComment = useCallback(async (commentId: string) => {
        let previousComments: TaskCommentView[] = [];

        setComments((current) => {
            previousComments = current;
            return current.filter((comment) => comment.id !== commentId);
        });
        suppressedDeleteIdsRef.current.add(commentId);

        try {
            await deleteTaskComment(supabase, commentId);
        } catch (error) {
            suppressedDeleteIdsRef.current.delete(commentId);
            setComments(previousComments);
            throw error;
        }
    }, [supabase]);

    return {
        comments,
        loading,
        refresh: loadComments,
        addComment,
        removeComment,
    };
}
