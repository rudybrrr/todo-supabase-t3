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
    onSelect: (task: TaskDatasetRecord) => void;
    onToggle: (task: TaskDatasetRecord, nextIsDone: boolean) => void;
    onSelectionToggle?: (task: TaskDatasetRecord) => void;
    showProject?: boolean;
    emptyMessage?: string;
}) {
    if (tasks.length === 0) {
        return (
            <div className="surface-muted px-4 py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="overflow-hidden rounded-[1.5rem] border border-border/60 bg-card/88">
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
                                "group flex items-start gap-3 px-4 py-4 transition-[background-color]",
                                index !== tasks.length - 1 ? "border-b border-border/50" : "",
                                selectionMode
                                    ? bulkSelected
                                        ? "bg-primary/10"
                                        : "hover:bg-muted/70"
                                    : task.id === selectedTaskId
                                        ? "bg-accent/55"
                                        : "hover:bg-muted/70",
                            )}
                        >
                            {selectionMode ? (
                                <button
                                    type="button"
                                    aria-label={bulkSelected ? `Deselect ${task.title}` : `Select ${task.title}`}
                                    onClick={() => onSelectionToggle?.(task)}
                                    className={cn(
                                        "mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                                        bulkSelected
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border/80 bg-background/70 text-transparent hover:border-primary/60",
                                    )}
                                >
                                    <Check className="h-3 w-3" />
                                </button>
                            ) : null}

                            <button
                                type="button"
                                aria-label={task.is_done ? "Mark task incomplete" : "Mark task complete"}
                                onClick={() => onToggle(task, !task.is_done)}
                                className={cn(
                                    "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                                    task.is_done
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border/80 bg-background/80 text-transparent hover:border-primary/60",
                                )}
                            >
                                <Check className="h-3.5 w-3.5" />
                            </button>

                            <button
                                type="button"
                                onClick={() => {
                                    if (selectionMode) {
                                        onSelectionToggle?.(task);
                                        return;
                                    }
                                    onSelect(task);
                                }}
                                className="min-w-0 flex-1 cursor-pointer rounded-xl px-1 py-0.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                                aria-label={selectionMode ? `Select ${task.title}` : `Open details for ${task.title}`}
                            >
                                <div className="space-y-2">
                                    <div className="min-w-0">
                                        <p
                                            className={cn(
                                                "truncate text-[15px] font-medium text-foreground transition-[color,opacity]",
                                                task.id !== selectedTaskId ? "group-hover:text-primary" : "",
                                                task.is_done ? "text-muted-foreground line-through" : "",
                                            )}
                                        >
                                            {task.title}
                                        </p>
                                        {task.description ? (
                                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                                                {task.description}
                                            </p>
                                        ) : null}
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2">
                                        {showProject && project ? (
                                            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                                                <span className={cn("h-2 w-2 rounded-full", palette.accent)} />
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
                                                    "inline-flex items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground",
                                                    isTaskOverdue(task) ? "border-rose-500/20 text-rose-600 dark:text-rose-300" : "",
                                                )}
                                            >
                                                <Clock3 className="h-3.5 w-3.5" />
                                                {dueLabel}
                                            </span>
                                        ) : null}
                                        {task.estimated_minutes ? (
                                            <span className="inline-flex items-center rounded-full border border-border/60 bg-background/70 px-2.5 py-1 text-xs text-muted-foreground">
                                                {task.estimated_minutes}m
                                            </span>
                                        ) : null}
                                        {task.has_planned_block && !task.is_done ? (
                                            <Badge variant="secondary">Planned</Badge>
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
