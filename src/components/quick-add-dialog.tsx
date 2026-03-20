"use client";

import { useEffect, useMemo, useState } from "react";
import { Paperclip, Plus } from "lucide-react";
import { toast } from "sonner";

import { useData } from "~/components/data-provider";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { DatePickerField } from "~/components/ui/date-picker-field";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { createTask, uploadTaskImages } from "~/lib/task-actions";
import { getDateInputValue } from "~/lib/task-views";

interface QuickAddDefaults {
    listId?: string | null;
    title?: string;
    dueDate?: string | null;
}

export function QuickAddDialog({
    open,
    onOpenChange,
    defaults,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaults?: QuickAddDefaults | null;
}) {
    const { userId, lists } = useData();
    const { upsertTask } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [title, setTitle] = useState("");
    const [listId, setListId] = useState("");
    const [priority, setPriority] = useState<"high" | "medium" | "low" | "">("");
    const [dueDate, setDueDate] = useState("");
    const [estimatedMinutes, setEstimatedMinutes] = useState("");
    const [description, setDescription] = useState("");
    const [expanded, setExpanded] = useState(false);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;

        const inbox = lists.find((list) => list.name.toLowerCase() === "inbox") ?? lists[0];
        setTitle(defaults?.title ?? "");
        setListId(defaults?.listId ?? inbox?.id ?? "");
        setPriority("");
        setDueDate(defaults?.dueDate ? getDateInputValue(defaults.dueDate) : "");
        setEstimatedMinutes("");
        setDescription("");
        setExpanded(false);
        setAttachments([]);
    }, [defaults, lists, open]);

    async function handleSubmit() {
        if (!userId || !listId || !title.trim()) return;

        try {
            setSaving(true);
            const createdTask = await createTask(supabase, {
                userId,
                listId,
                title,
                description,
                dueDate: dueDate || null,
                priority: priority || null,
                estimatedMinutes: estimatedMinutes ? Number.parseInt(estimatedMinutes, 10) : null,
            });

            if (attachments.length > 0) {
                await uploadTaskImages(supabase, userId, createdTask.id, listId, attachments);
            }

            upsertTask(createdTask);
            toast.success("Task added.");
            onOpenChange(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to add task.";
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl rounded-[1.75rem] border-border/60 p-0">
                <div className="border-b border-border/50 p-6">
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-2xl font-semibold tracking-[-0.04em]">Quick Add</DialogTitle>
                        <DialogDescription>
                            Add a task fast.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="space-y-5 p-6">
                    <div className="space-y-2">
                        <Label htmlFor="quickAddTitle" className="eyebrow">
                            Task
                        </Label>
                        <Input
                            id="quickAddTitle"
                            placeholder="Finish chemistry lab outline"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    void handleSubmit();
                                }
                            }}
                        />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="quickAddProject" className="eyebrow">
                                Project
                            </Label>
                            <Select value={listId} onValueChange={setListId}>
                                <SelectTrigger id="quickAddProject">
                                    <SelectValue placeholder="Choose a project" />
                                </SelectTrigger>
                                <SelectContent>
                                    {lists.map((list) => (
                                        <SelectItem key={list.id} value={list.id}>
                                            {list.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="quickAddDue" className="eyebrow">
                                Due
                            </Label>
                            <DatePickerField id="quickAddDue" value={dueDate} onChange={setDueDate} placeholder="Choose date" allowClear />
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Label htmlFor="quickAddPriority" className="eyebrow">
                                Priority
                            </Label>
                            <Select
                                value={priority || "none"}
                                onValueChange={(value) => setPriority(value === "none" ? "" : value as typeof priority)}
                            >
                                <SelectTrigger id="quickAddPriority">
                                    <SelectValue placeholder="No priority" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">No priority</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="quickAddEstimate" className="eyebrow">
                                Estimate
                            </Label>
                            <Input
                                id="quickAddEstimate"
                                type="number"
                                min="1"
                                placeholder="45"
                                value={estimatedMinutes}
                                onChange={(event) => setEstimatedMinutes(event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <Button variant="tonal" size="sm" onClick={() => setExpanded((current) => !current)}>
                            <Plus className="h-4 w-4" />
                            {expanded ? "Hide details" : "More details"}
                        </Button>
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/70 bg-background/75 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                            <Paperclip className="h-3.5 w-3.5" />
                            Attach files
                            <input
                                className="hidden"
                                type="file"
                                multiple
                                accept="image/*"
                                onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
                            />
                        </label>
                        {attachments.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                                {attachments.length} file{attachments.length === 1 ? "" : "s"} ready
                            </span>
                        ) : null}
                    </div>

                    {expanded ? (
                        <div className="space-y-2">
                            <Label htmlFor="quickAddNotes" className="eyebrow">
                                Notes
                            </Label>
                            <Textarea
                                id="quickAddNotes"
                                placeholder="Notes"
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                            />
                        </div>
                    ) : null}
                </div>

                <DialogFooter className="border-t border-border/50 p-6">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSubmit()} disabled={saving || !title.trim() || !listId}>
                        {saving ? "Saving..." : "Add task"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
