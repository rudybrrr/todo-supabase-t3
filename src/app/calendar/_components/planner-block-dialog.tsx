"use client";

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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { TimeSelectField } from "~/components/ui/time-select-field";
import { formatMinutesCompact } from "~/lib/planning";

import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import type { TodoList } from "~/lib/types";

import type { BlockFormState } from "./planner-types";

export function PlannerBlockDialog({
  form,
  lists,
  open,
  saving,
  tasks,
  onDelete,
  onOpenChange,
  onSave,
  onSetForm,
  onStartFocus,
}: {
  form: BlockFormState;
  lists: TodoList[];
  open: boolean;
  saving: boolean;
  tasks: TaskDatasetRecord[];
  onDelete: () => void;
  onOpenChange: (open: boolean) => void;
  onSave: () => void;
  onSetForm: (updater: (current: BlockFormState) => BlockFormState) => void;
  onStartFocus?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl rounded-[1.5rem] border-border/60 p-0">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle>{form.id ? "Edit focus block" : "Plan focus block"}</DialogTitle>
          <DialogDescription>
            Add time for a task or project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-5">
          <div className="space-y-2">
            <Label htmlFor="blockTitle" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Title
            </Label>
            <Input
              id="blockTitle"
              value={form.title}
              onChange={(event) => onSetForm((current) => ({ ...current, title: event.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="blockProject" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Project
              </Label>
              <Select value={form.listId} onValueChange={(value) => onSetForm((current) => ({ ...current, listId: value }))}>
                <SelectTrigger id="blockProject">
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
              <Label htmlFor="blockTask" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Linked task
              </Label>
              <Select
                value={form.todoId ?? "none"}
                onValueChange={(value) => onSetForm((current) => ({ ...current, todoId: value === "none" ? null : value }))}
              >
                <SelectTrigger id="blockTask">
                  <SelectValue placeholder="No linked task" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked task</SelectItem>
                  {tasks
                    .filter((task) => task.list_id === form.listId && !task.is_done)
                    .map((task) => (
                      <SelectItem key={task.id} value={task.id}>
                        {task.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="blockDate" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Date
              </Label>
              <DatePickerField id="blockDate" value={form.date} onChange={(value) => onSetForm((current) => ({ ...current, date: value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="blockStart" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Start
              </Label>
              <TimeSelectField id="blockStart" value={form.startTime} onChange={(value) => onSetForm((current) => ({ ...current, startTime: value }))} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="blockDuration" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Duration
              </Label>
              <Input
                id="blockDuration"
                type="number"
                min="15"
                step="15"
                value={form.durationMinutes}
                onChange={(event) => onSetForm((current) => ({ ...current, durationMinutes: event.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/70 bg-background/60 px-4 py-4 text-sm text-muted-foreground">
            <span>Reserved time</span>
            <span className="font-mono text-foreground">
              {formatMinutesCompact(Number.parseInt(form.durationMinutes || "0", 10) || 0)}
            </span>
          </div>
        </div>

        <DialogFooter className="justify-between border-t border-border/60 px-5 py-4 sm:justify-between">
          {form.id ? (
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
              Delete
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            {form.id && onStartFocus ? (
              <Button variant="outline" onClick={onStartFocus}>
                Start focus
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} disabled={saving || !form.title.trim() || !form.listId}>
              {saving ? "Saving..." : form.id ? "Save block" : "Create block"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
