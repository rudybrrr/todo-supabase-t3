"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { useData } from "~/components/data-provider";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { deleteOrLeaveProject } from "~/lib/project-actions";
import { getProjectColorClasses, getProjectIcon } from "~/lib/project-appearance";
import type { TodoList } from "~/lib/types";

export function ProjectSettingsDialog({
    open,
    onOpenChange,
    project,
    onProjectRemoved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    project: TodoList;
    onProjectRemoved?: () => void;
}) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { userId, refreshData } = useData();
    const [saving, setSaving] = useState(false);

    const palette = getProjectColorClasses(project.color_token);
    const Icon = getProjectIcon(project.icon_token);
    const isOwner = project.owner_id === userId;
    const isInbox = project.name.trim().toLowerCase() === "inbox";

    async function handleDeleteOrLeave() {
        if (!userId || isInbox) return;

        try {
            setSaving(true);
            await deleteOrLeaveProject(supabase, project.id, userId, project.owner_id);
            await refreshData();
            toast.success(isOwner ? "Project deleted." : "You left the project.");
            onOpenChange(false);
            onProjectRemoved?.();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to update the project.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg rounded-[1.75rem] border-border/60 p-0">
                <DialogHeader className="border-b border-border/60 px-6 py-5 text-left">
                    <DialogTitle>Project settings</DialogTitle>
                    <DialogDescription>
                        Review destructive actions for this workspace.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 px-6 py-6">
                    <div className="flex items-center gap-4 rounded-[1.25rem] border border-border/60 bg-background/70 p-4">
                        <div className={`rounded-2xl p-3 ${palette.soft}`}>
                            <Icon className={`h-6 w-6 ${palette.text}`} />
                        </div>
                        <div className="min-w-0">
                            <p className="truncate text-lg font-semibold tracking-[-0.03em] text-foreground">{project.name}</p>
                            <p className="text-sm text-muted-foreground">{isOwner ? "Owned by you" : "Shared project"}</p>
                        </div>
                    </div>

                    {isInbox ? (
                        <div className="surface-muted flex items-start gap-3 px-4 py-4 text-sm text-muted-foreground">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                            <p>Inbox is permanent and cannot be deleted or left.</p>
                        </div>
                    ) : (
                        <div className="rounded-[1.25rem] border border-destructive/25 bg-destructive/5 p-4">
                            <div className="space-y-2">
                                <p className="eyebrow text-destructive">Danger zone</p>
                                <h3 className="text-base font-semibold tracking-[-0.02em] text-foreground">
                                    {isOwner ? "Delete this project" : "Leave this project"}
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    {isOwner
                                        ? "This removes the project for all members."
                                        : "You will lose access to this shared project."}
                                </p>
                            </div>
                            <div className="mt-4">
                                <Button
                                    variant="destructive"
                                    onClick={() => void handleDeleteOrLeave()}
                                    disabled={saving}
                                >
                                    {saving ? "Working..." : isOwner ? "Delete project" : "Leave project"}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter className="border-t border-border/60 px-6 py-5">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
