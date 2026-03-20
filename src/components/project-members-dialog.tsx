"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { useData } from "~/components/data-provider";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { getPublicAvatarUrl } from "~/lib/avatar";
import { inviteProjectMember } from "~/lib/project-actions";
import type { TodoList, TodoListMember } from "~/lib/types";

interface ProjectMemberView extends TodoListMember {
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
}

interface ProfileRow {
    id: string;
    username?: string | null;
    full_name?: string | null;
    avatar_url?: string | null;
}

export function ProjectMembersDialog({
    open,
    onOpenChange,
    project,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    project: TodoList;
}) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { refreshData } = useData();
    const [members, setMembers] = useState<ProjectMemberView[]>([]);
    const [username, setUsername] = useState("");
    const [loading, setLoading] = useState(false);
    const [inviting, setInviting] = useState(false);

    useEffect(() => {
        if (!open) return;

        async function loadMembers() {
            try {
                setLoading(true);
                const { data: memberRows, error: memberError } = await supabase
                    .from("todo_list_members")
                    .select("list_id, user_id, role, inserted_at")
                    .eq("list_id", project.id);

                if (memberError) throw memberError;

                const rows = (memberRows ?? []) as TodoListMember[];
                const memberIds = rows.map((row) => row.user_id);
                const { data: profileRows, error: profileError } = await supabase
                    .from("profiles")
                    .select("id, username, full_name, avatar_url")
                    .in("id", memberIds);

                if (profileError) throw profileError;

                const profileMap = new Map<string, ProfileRow>(
                    ((profileRows ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]),
                );

                setMembers(
                    rows.map((row) => ({
                        ...row,
                        username: profileMap.get(row.user_id)?.username ?? null,
                        full_name: profileMap.get(row.user_id)?.full_name ?? null,
                        avatar_url: profileMap.get(row.user_id)?.avatar_url ?? null,
                    })),
                );
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Unable to load project members.");
            } finally {
                setLoading(false);
            }
        }

        void loadMembers();
    }, [open, project.id, supabase]);

    async function handleInvite() {
        try {
            setInviting(true);
            await inviteProjectMember(supabase, project.id, username);
            toast.success("Member invited.");
            setUsername("");
            await refreshData();
            onOpenChange(false);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to invite member.");
        } finally {
            setInviting(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg rounded-[1.75rem]">
                <DialogHeader>
                    <DialogTitle>Members and sharing</DialogTitle>
                    <DialogDescription>
                        Invite members and review access.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <div className="space-y-3">
                        <p className="eyebrow">Invite member</p>
                        <div className="flex gap-3">
                            <Input
                                value={username}
                                onChange={(event) => setUsername(event.target.value)}
                                placeholder="@classmate"
                            />
                            <Button onClick={() => void handleInvite()} disabled={inviting || !username.trim()}>
                                {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                                Invite
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <p className="eyebrow">Current members</p>
                        {loading ? (
                            <div className="surface-muted px-4 py-8 text-sm text-muted-foreground">Loading members...</div>
                        ) : (
                            <div className="overflow-hidden rounded-[1.25rem] border border-border/60 bg-background/60">
                                {members.map((member, index) => {
                                    const avatarUrl = getPublicAvatarUrl(supabase, member.avatar_url);
                                    return (
                                        <div
                                            key={member.user_id}
                                            className={`flex items-center justify-between gap-3 px-4 py-3 ${index !== members.length - 1 ? "border-b border-border/50" : ""}`}
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <Avatar className="h-10 w-10 border border-border/60">
                                                    <AvatarImage src={avatarUrl ?? ""} alt={member.username ?? "Member"} />
                                                    <AvatarFallback className="bg-primary/12 text-primary">
                                                        {member.username?.slice(0, 1).toUpperCase() ?? "S"}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-foreground">
                                                        {member.full_name ?? `@${member.username ?? "unknown"}`}
                                                    </p>
                                                    <p className="truncate text-xs uppercase tracking-[0.16em] text-muted-foreground">
                                                        {member.role}
                                                    </p>
                                                </div>
                                            </div>
                                            {member.user_id === project.owner_id ? (
                                                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                                                    Owner
                                                </span>
                                            ) : null}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
