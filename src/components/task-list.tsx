"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Clock3 } from "lucide-react";
import { useData } from "~/components/data-provider";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { TaskLabelBadge } from "~/components/task-label-badge";
import { Badge } from "~/components/ui/badge";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { getProjectColorClasses } from "~/lib/project-appearance";
import { getRecurrenceLabel } from "~/lib/task-recurrence";
import {
  getReminderOffsetLabel,
  normalizeReminderOffsetMinutes,
} from "~/lib/task-reminders";
import { formatTaskDueLabel, isTaskOverdue } from "~/lib/task-views";
import type { TodoList } from "~/lib/types";
import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import { cn } from "~/lib/utils";

export function TaskListItem({
  task,
  lists,
  selected = false,
  bulkSelected = false,
  selectionMode = false,
  onSelect,
  onToggle,
  onSelectionToggle,
  showProject = false,
  divider = false,
  isDragging = false,
  compact = false,
  variant = "default",
}: {
  task: TaskDatasetRecord;
  lists: TodoList[];
  selected?: boolean;
  bulkSelected?: boolean;
  selectionMode?: boolean;
  onSelect: (task: TaskDatasetRecord, options?: { shiftKey?: boolean }) => void;
  onToggle: (task: TaskDatasetRecord, nextIsDone: boolean) => void;
  onSelectionToggle?: (
    task: TaskDatasetRecord,
    options?: { shiftKey?: boolean },
  ) => void;
  showProject?: boolean;
  divider?: boolean;
  isDragging?: boolean;
  compact?: boolean;
  variant?: "default" | "tasks";
}) {
  const { profile } = useData();
  const { membersByListId } = useTaskDataset();
  const project = lists.find((list) => list.id === task.list_id);
  const assignee = task.assignee_user_id
    ? (membersByListId[task.list_id] ?? []).find(
        (member) => member.user_id === task.assignee_user_id,
      )
    : null;
  const dueLabel = formatTaskDueLabel(task, new Date(), profile?.timezone);
  const reminderOffsetMinutes = normalizeReminderOffsetMinutes(
    task.reminder_offset_minutes,
  );
  const palette = getProjectColorClasses(project?.color_token);
  const visibleLabels = task.labels.slice(0, 2);
  const isTasksVariant = variant === "tasks";
  const hasMetadata = [
    showProject && project,
    visibleLabels.length > 0,
    task.labels.length > visibleLabels.length,
    task.priority,
    assignee,
    dueLabel,
    task.recurrence_rule,
    !task.is_done && reminderOffsetMinutes != null,
    task.estimated_minutes,
  ].some(Boolean);
  const hasSecondaryContent = Boolean(task.description) || hasMetadata;

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "group relative flex transition-colors duration-200",
        isTasksVariant
          ? "items-start gap-3 border-border/70 border-b px-4 py-3.5 last:border-b-0 sm:px-4"
          : hasSecondaryContent
            ? "items-start"
            : "items-center",
        !isTasksVariant
          && (compact
            ? "gap-2.5 rounded-xl border border-border/70 bg-background/95 px-3 py-2.5"
            : "gap-3 px-3 py-3.5 sm:px-3"),
        divider && !compact && !isTasksVariant && "border-border/70 border-b",
        selectionMode
          ? bulkSelected
            ? compact
              ? "border-primary/35 bg-primary/10 ring-1 ring-primary/20"
              : isTasksVariant
                ? "bg-primary/6"
                : "bg-accent"
            : compact
              ? "hover:border-border hover:bg-muted/40"
              : isTasksVariant
                ? "hover:bg-muted/45"
                : "hover:bg-muted/60"
          : selected
            ? compact
              ? "border-primary/40 bg-primary/12 ring-1 ring-primary/20 shadow-[0_8px_18px_rgba(15,23,42,0.08)]"
              : isTasksVariant
                ? "border-primary/35 bg-primary/5"
                : "bg-accent/78"
            : compact
              ? "hover:-translate-y-[1px] hover:border-border/90 hover:bg-card hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)]"
              : isTasksVariant
                ? "hover:bg-muted/45"
                : "hover:bg-muted/60",
        isDragging &&
          (isTasksVariant
            ? "z-20 scale-[1.01] border-primary/35 bg-card border shadow-[0_18px_36px_rgba(15,23,42,0.16)]"
            : "z-20 scale-[1.01] border-primary/35 bg-card rounded-xl border shadow-[0_18px_36px_rgba(15,23,42,0.16)]"),
      )}
    >
      <button
        type="button"
        aria-label={
          task.is_done ? "Mark task incomplete" : "Mark task complete"
        }
        onClick={() => onToggle(task, !task.is_done)}
        className={cn(
          "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center border transition-all duration-200",
          hasSecondaryContent && "mt-0.5",
          compact
            ? "border-border/80 mt-[1px] rounded-full"
            : isTasksVariant
              ? "border-border/80 mt-[1px] rounded-md"
              : "border-border rounded-sm",
          task.is_done
            ? "border-primary bg-primary text-primary-foreground"
            : isTasksVariant
              ? "bg-background text-transparent hover:border-primary/60 hover:bg-primary/5"
              : "bg-card hover:border-primary/60 hover:bg-primary/5 text-transparent",
        )}
      >
        <Check
          className={cn(
            "transition-transform duration-200",
            compact ? "h-3 w-3" : "h-3.5 w-3.5",
            !task.is_done && "scale-0",
          )}
        />
      </button>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (selectionMode) {
              onSelectionToggle?.(task, { shiftKey: event.shiftKey });
              return;
            }
            onSelect(task, { shiftKey: event.shiftKey });
          }
        }}
        onClick={(event) => {
          if (selectionMode) {
            onSelectionToggle?.(task, { shiftKey: event.shiftKey });
            return;
          }
          onSelect(task, { shiftKey: event.shiftKey });
        }}
        className={cn(
          "focus-visible:ring-ring/60 min-w-0 flex-1 cursor-pointer rounded-md px-1 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none",
          isTasksVariant ? "py-[2px]" : hasSecondaryContent ? "py-0.5" : "py-0",
        )}
        aria-label={
          selectionMode
            ? `Select ${task.title}`
            : `Open details for ${task.title}`
        }
      >
        <div className={cn(isTasksVariant ? "space-y-1.5" : hasSecondaryContent && "space-y-2")}>
          <div className="min-w-0">
            <p
              className={cn(
                "text-foreground leading-5 font-medium tracking-tight transition-opacity",
                compact
                  ? "line-clamp-2 text-[13.5px] sm:text-[14px]"
                  : isTasksVariant
                    ? "line-clamp-2 text-[14px] sm:text-[14.5px]"
                    : "text-[14px] sm:text-[14.5px]",
                task.is_done ? "text-muted-foreground/60 line-through" : "",
              )}
            >
              {task.title}
            </p>
            {task.description ? (
              <p
                className={cn(
                  "text-muted-foreground/80 line-clamp-1",
                  compact ? "mt-0 text-[11.5px]" : "mt-0.5 text-[13px]",
                )}
              >
                {task.description}
              </p>
            ) : null}
          </div>

          <div
            className={cn(
              "text-muted-foreground/90 flex flex-wrap items-center",
              compact
                ? "gap-1.5 text-[10.5px]"
                : isTasksVariant
                  ? "gap-1.5 text-[11px]"
                  : "gap-x-3 gap-y-1.5 text-[11px] font-bold tracking-[0.12em] uppercase",
            )}
          >
            {showProject && project ? (
              <span
                className={cn(
                  "inline-flex items-center gap-1.5",
                  compact &&
                    "rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 font-medium tracking-normal normal-case",
                  isTasksVariant &&
                    "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 font-medium tracking-normal normal-case",
                )}
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-sm", palette.accent)}
                />
                {project.name}
              </span>
            ) : null}
            {visibleLabels.map((label) => (
              <TaskLabelBadge
                key={label.id}
                label={label}
                className={cn(
                  compact &&
                    "px-2 py-0.5 text-[10px] font-medium tracking-normal",
                  isTasksVariant &&
                    "px-2 py-0.5 text-[10px] font-medium tracking-normal",
                )}
              />
            ))}
            {task.labels.length > visibleLabels.length ? (
              <span
                className={cn(
                  "inline-flex items-center",
                  compact &&
                    "rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 font-medium tracking-normal normal-case",
                  isTasksVariant &&
                    "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 font-medium tracking-normal normal-case",
                )}
              >
                +{task.labels.length - visibleLabels.length} label
                {task.labels.length - visibleLabels.length === 1 ? "" : "s"}
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
                className={cn(
                  compact &&
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-normal normal-case",
                  isTasksVariant &&
                    "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-normal normal-case",
                )}
              >
                {task.priority}
              </Badge>
            ) : null}
            {assignee ? (
              <span
              className={cn(
                "text-foreground inline-flex items-center gap-1.5 tracking-normal normal-case",
                compact &&
                  "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5",
                isTasksVariant &&
                  "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5",
              )}
            >
              <Avatar className="border-border/70 h-4 w-4 border">
                <AvatarImage
                  src={assignee.avatar_url ?? ""}
                    alt={assignee.username ?? "Assignee"}
                  />
                  <AvatarFallback className="text-[8px]">
                    {(assignee.full_name ?? assignee.username ?? "A")
                      .slice(0, 1)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                {assignee.full_name ?? `@${assignee.username ?? "unknown"}`}
              </span>
            ) : null}
            {dueLabel ? (
              <span
              className={cn(
                "inline-flex items-center gap-1",
                compact &&
                  "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 tracking-normal normal-case",
                isTasksVariant &&
                  "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 tracking-normal normal-case",
                isTaskOverdue(task, new Date(), profile?.timezone)
                  ? compact
                    ? "border-destructive/25 bg-destructive/10 text-destructive"
                    : isTasksVariant
                      ? "border-destructive/20 bg-destructive/8 text-destructive"
                    : "text-destructive"
                  : "",
              )}
            >
                <Clock3 className="h-3.5 w-3.5" />
                {dueLabel}
              </span>
            ) : null}
            {task.recurrence_rule ? (
              <Badge
                variant="secondary"
                className={cn(
                  compact &&
                    "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-normal normal-case",
                  isTasksVariant &&
                    "rounded-full px-2 py-0.5 text-[10px] font-medium tracking-normal normal-case",
                )}
              >
                {getRecurrenceLabel(task.recurrence_rule)}
              </Badge>
            ) : null}
            {!task.is_done && reminderOffsetMinutes != null ? (
              <span
              className={cn(
                "inline-flex items-center gap-1",
                compact &&
                  "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 tracking-normal normal-case",
                isTasksVariant &&
                  "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 tracking-normal normal-case",
              )}
            >
              <Bell className="h-3.5 w-3.5" />
              {getReminderOffsetLabel(reminderOffsetMinutes)}
            </span>
            ) : null}
            {task.estimated_minutes ? (
              <span
              className={cn(
                "inline-flex items-center",
                compact &&
                  "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 tracking-normal normal-case",
                isTasksVariant &&
                  "rounded-full border border-border/70 bg-muted/35 px-2 py-0.5 tracking-normal normal-case",
              )}
            >
              {task.estimated_minutes} min
            </span>
          ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

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
  compact = false,
  variant = "default",
}: {
  tasks: TaskDatasetRecord[];
  lists: TodoList[];
  selectedTaskId?: string | null;
  selectedTaskIds?: Set<string>;
  selectionMode?: boolean;
  onSelect: (task: TaskDatasetRecord, options?: { shiftKey?: boolean }) => void;
  onToggle: (task: TaskDatasetRecord, nextIsDone: boolean) => void;
  onSelectionToggle?: (
    task: TaskDatasetRecord,
    options?: { shiftKey?: boolean },
  ) => void;
  showProject?: boolean;
  emptyMessage?: string;
  compact?: boolean;
  variant?: "default" | "tasks";
}) {
  if (tasks.length === 0) {
    return (
      <div className="surface-muted text-muted-foreground px-4 py-7 text-center text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      className={cn(
        variant === "tasks"
          ? "overflow-hidden rounded-xl border border-border/80 bg-card shadow-[0_1px_0_rgba(15,23,42,0.03)]"
          : compact
            ? "space-y-2"
            : "border-border bg-card overflow-hidden rounded-xl border",
      )}
    >
      <AnimatePresence initial={false}>
        {tasks.map((task, index) => {
          return (
            <div key={task.id}>
              <TaskListItem
                task={task}
                lists={lists}
                selected={task.id === selectedTaskId}
                bulkSelected={selectedTaskIds?.has(task.id) ?? false}
                selectionMode={selectionMode}
                showProject={showProject}
                divider={!compact && index !== tasks.length - 1}
                compact={compact}
                variant={variant}
                onSelectionToggle={onSelectionToggle}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
