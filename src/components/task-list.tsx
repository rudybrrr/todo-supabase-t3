"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock3 } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { getProjectColorClasses } from "~/lib/project-appearance";
import { formatTaskDueLabel, isTaskOverdue } from "~/lib/task-views";
import type { TodoList } from "~/lib/types";
import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import { cn } from "~/lib/utils";

export function TaskList({
    tasks,
    lists,
    selectedTaskId,
    selectedTaskIds,
    selectionMode = false,
    onSelect,
    onToggle,
    onSelectionToggle,
    showProject = false,
    emptyMessage = "No tasks here yet.",
}: {
    tasks: TaskDatasetRecord[];
    lists: TodoList[];
    selectedTaskId?: string | null;
    selectedTaskIds?: Set<string>;
    selectionMode?: boolean;
    onSelect: (task: TaskDatasetRecord, options?: { shiftKey?: boolean }) => void;
    onToggle: (task: TaskDatasetRecord, nextIsDone: boolean) => void;
    onSelectionToggle?: (task: TaskDatasetRecord, options?: { shiftKey?: boolean }) => void;
    showProject?: boolean;
    emptyMessage?: string;
}) {
    if (tasks.length === 0) {
        return (
            <div className="surface-muted px-4 py-7 text-center text-sm text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <AnimatePresence initial={false}>
                {tasks.map((task, index) => {
                    const project = lists.find((list) => list.id === task.list_id);
                    const dueLabel = formatTaskDueLabel(task);
                    const palette = getProjectColorClasses(project?.color_token);
                    const bulkSelected = selectedTaskIds?.has(task.id) ?? false;

                    return (
                        <motion.div
                            key={task.id}
                            layout="position"
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -6, scale: 0.98 }}
                            transition={{ duration: 0.18, ease: "easeOut" }}
                            className={cn(
                                "group flex items-start gap-3 px-3.5 py-3.5 transition-colors sm:px-4",
                                index !== tasks.length - 1 ? "border-b border-border/70" : "",
                                selectionMode
                                    ? bulkSelected
                                        ? "bg-accent"
                                        : "hover:bg-muted/60"
                                    : task.id === selectedTaskId
                                        ? "bg-accent/78"
                                        : "hover:bg-muted/60",
                            )}
                        >
                            <button
                                type="button"
                                aria-label={task.is_done ? "Mark task incomplete" : "Mark task complete"}
                                onClick={() => onToggle(task, !task.is_done)}
                                className={cn(
                                    "mt-0.5 flex h-5.5 w-5.5 shrink-0 cursor-pointer items-center justify-center rounded-sm border transition-colors",
                                    task.is_done
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-card text-transparent hover:border-primary/60",
                                )}
                            >
                                <Check className="h-3.5 w-3.5" />
                            </button>

                            <button
                                type="button"
                                onClick={(event) => {
                                    if (selectionMode) {
                                        onSelectionToggle?.(task, { shiftKey: event.shiftKey });
                                        return;
                                    }
                                    onSelect(task, { shiftKey: event.shiftKey });
                                }}
                                className="min-w-0 flex-1 cursor-pointer rounded-md px-1 py-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                                aria-label={selectionMode ? `Select ${task.title}` : `Open details for ${task.title}`}
                            >
                                <div className="space-y-2">
                                    <div className="min-w-0">
                                        <p
                                            className={cn(
                                                "truncate text-[14px] font-medium tracking-[-0.01em] text-foreground transition-opacity sm:text-[14.5px]",
                                                task.is_done ? "text-muted-foreground line-through" : "",
                                            )}
                                        >
                                            {task.title}
                                        </p>
                                        {task.description ? (
                                            <p className="mt-0.5 line-clamp-1 text-[13px] text-muted-foreground">
                                                {task.description}
                                            </p>
                                        ) : null}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                                        {showProject && project ? (
                                            <span className="inline-flex items-center gap-1.5">
                                                <span className={cn("h-1.5 w-1.5 rounded-sm", palette.accent)} />
                                                {project.name}
                                            </span>
                                        ) : null}
                                        {task.priority ? (
                                            <Badge
                                                variant={
                                                    task.priority === "high"
                                                        ? "danger"
                                                        : task.priority === "medium"
                                                            ? "warning"
                                                            : "default"
                                                }
                                            >
                                                {task.priority}
                                            </Badge>
                                        ) : null}
                                        {dueLabel ? (
                                            <span
                                                className={cn(
                                                    "inline-flex items-center gap-1",
                                                    isTaskOverdue(task) ? "text-destructive" : "",
                                                )}
                                            >
                                                <Clock3 className="h-3.5 w-3.5" />
                                                {dueLabel}
                                            </span>
                                        ) : null}
                                        {task.estimated_minutes ? (
                                            <span className="inline-flex items-center">
                                                {task.estimated_minutes} min
                                            </span>
                                        ) : null}
                                        {task.has_planned_block && !task.is_done ? (
                                            <Badge variant="outline">Planned</Badge>
                                        ) : null}
                                    </div>
                                </div>
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
}
