"use client";

import { formatDistanceToNow } from "date-fns";
import { Loader2, MessageSquareText, Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import type { TaskCommentView } from "~/hooks/use-task-comments";

export function TaskCommentsSection({
    comments,
    loading,
    currentUserId,
    onAddComment,
    onDeleteComment,
}: {
    comments: TaskCommentView[];
    loading: boolean;
    currentUserId: string;
    onAddComment: (body: string) => Promise<void>;
    onDeleteComment: (commentId: string) => Promise<void>;
}) {
    const [draft, setDraft] = useState("");
    const [saving, setSaving] = useState(false);
    const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

    async function handleSubmit() {
        const normalizedDraft = draft.trim();
        if (!normalizedDraft) return;

        try {
            setSaving(true);
            await onAddComment(normalizedDraft);
            setDraft("");
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to add comment.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDelete(commentId: string) {
        try {
            setDeletingCommentId(commentId);
            await onDeleteComment(commentId);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to delete comment.");
        } finally {
            setDeletingCommentId((current) => current === commentId ? null : current);
        }
    }

    return (
        <section className="space-y-3 rounded-xl border border-border/70 bg-card/70 p-4">
            <div>
                <h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">Comments</h3>
            </div>

            <form 
                className="flex items-start gap-2"
                onSubmit={(e) => {
                    e.preventDefault();
                    void handleSubmit();
                }}
            >
                <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Add a comment"
                    className="min-h-[42px] max-h-[160px] flex-1 resize-none rounded-xl border-border/70 bg-muted/15 px-3.5 py-2.5 text-sm shadow-none focus-visible:ring-0"
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleSubmit();
                        }
                    }}
                />
                <Button 
                    type="submit" 
                    size="icon" 
                    variant="tonal"
                    className="h-[42px] w-[42px] shrink-0 fill-current" 
                    disabled={saving || !draft.trim()}
                >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    <span className="sr-only">Comment</span>
                </Button>
            </form>

            {loading ? (
                <div className="surface-muted rounded-xl px-3 py-4 text-sm text-muted-foreground">Loading comments...</div>
            ) : comments.length > 0 ? (
                <div className="space-y-2.5">
                    {comments.map((comment) => {
                        const canDelete = comment.user_id === currentUserId;
                        const deleting = deletingCommentId === comment.id;

                        return (
                            <div key={comment.id} className="rounded-xl border border-border/70 bg-background/65 px-3.5 py-3">
                                <div className="flex items-start gap-3">
                                    <Avatar className="h-8 w-8 border border-border/70">
                                        <AvatarImage src={comment.avatar_url ?? ""} alt={comment.username ?? "Comment author"} />
                                        <AvatarFallback className="text-[10px]">
                                            {(comment.full_name ?? comment.username ?? "C").slice(0, 1).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-foreground">
                                                    {comment.full_name ?? `@${comment.username ?? "unknown"}`}
                                                </p>
                                                <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                                                    {formatDistanceToNow(new Date(comment.inserted_at), { addSuffix: true })}
                                                </p>
                                            </div>
                                            {canDelete ? (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon-xs"
                                                    className="shrink-0 text-muted-foreground hover:text-destructive"
                                                    disabled={deleting}
                                                    onClick={() => void handleDelete(comment.id)}
                                                >
                                                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                    <span className="sr-only">Delete comment</span>
                                                </Button>
                                            ) : null}
                                        </div>
                                        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground">{comment.body}</p>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="surface-muted rounded-xl px-3 py-6 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                        <MessageSquareText className="h-4 w-4" />
                        No comments yet.
                    </div>
                </div>
            )}
        </section>
    );
}
