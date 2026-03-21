"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { DatePickerField } from "~/components/ui/date-picker-field";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import type { TodoList } from "~/lib/types";
import type { TaskPriority } from "~/lib/task-views";

type DueDateMode = "keep" | "set" | "clear";
type PriorityMode = "keep" | "clear" | TaskPriority;

export interface TaskBulkEditChanges {
    dueDate: { mode: DueDateMode; value?: string };
    priority: { mode: "keep" | "clear" | "set"; value?: TaskPriority };
    list: { mode: "keep" | "set"; value?: string };
}

export function TaskBulkEditDialog({
    open,
    onOpenChange,
    selectedCount,
    lists,
    submitting = false,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    selectedCount: number;
    lists: TodoList[];
    submitting?: boolean;
    onSubmit: (changes: TaskBulkEditChanges) => void;
}) {
    const [dueDateMode, setDueDateMode] = useState<DueDateMode>("keep");
    const [dueDate, setDueDate] = useState("");
    const [priorityMode, setPriorityMode] = useState<PriorityMode>("keep");
    const [listValue, setListValue] = useState("keep");

    useEffect(() => {
        if (!open) return;
        setDueDateMode("keep");
        setDueDate("");
        setPriorityMode("keep");
        setListValue("keep");
    }, [open]);

    const hasChanges = useMemo(
        () => dueDateMode !== "keep" || priorityMode !== "keep" || listValue !== "keep",
        [dueDateMode, listValue, priorityMode],
    );
    const canSubmit = hasChanges
        && (dueDateMode !== "set" || dueDate.length > 0)
        && !submitting;

    function handleSubmit() {
        if (!canSubmit) return;

        onSubmit({
            dueDate: dueDateMode === "set"
                ? { mode: "set", value: dueDate }
                : { mode: dueDateMode },
            priority: priorityMode === "keep"
                ? { mode: "keep" }
                : priorityMode === "clear"
                    ? { mode: "clear" }
                    : { mode: "set", value: priorityMode },
            list: listValue === "keep"
                ? { mode: "keep" }
                : { mode: "set", value: listValue },
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg rounded-[1.6rem]">
                <DialogHeader>
                    <DialogTitle>Edit selected tasks</DialogTitle>
                    <DialogDescription>
                        Apply shared changes to {selectedCount} selected task{selectedCount === 1 ? "" : "s"}.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5">
                    <div className="space-y-2">
                        <p className="eyebrow">Due date</p>
                        <Select value={dueDateMode} onValueChange={(value) => setDueDateMode(value as DueDateMode)} disabled={submitting}>
                            <SelectTrigger>
                                <SelectValue placeholder="No change" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="keep">No change</SelectItem>
                                <SelectItem value="set">Set due date</SelectItem>
                                <SelectItem value="clear">Clear due date</SelectItem>
                            </SelectContent>
                        </Select>
                        {dueDateMode === "set" ? (
                            <DatePickerField
                                id="bulkEditDueDate"
                                value={dueDate}
                                onChange={setDueDate}
                                placeholder="Choose date"
                                disabled={submitting}
                            />
                        ) : null}
                    </div>

                    <div className="space-y-2">
                        <p className="eyebrow">Priority</p>
                        <Select
                            value={priorityMode}
                            onValueChange={(value) => setPriorityMode(value as PriorityMode)}
                            disabled={submitting}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder="No change" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="keep">No change</SelectItem>
                                <SelectItem value="high">High</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="low">Low</SelectItem>
                                <SelectItem value="clear">Clear priority</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <p className="eyebrow">Project</p>
                        <Select value={listValue} onValueChange={setListValue} disabled={submitting}>
                            <SelectTrigger>
                                <SelectValue placeholder="No change" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="keep">No change</SelectItem>
                                {lists.map((list) => (
                                    <SelectItem key={list.id} value={list.id}>
                                        {list.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit}>
                        {submitting ? "Applying..." : "Apply changes"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
