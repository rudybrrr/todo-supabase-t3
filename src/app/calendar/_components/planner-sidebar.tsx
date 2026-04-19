"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Clock3, Plus } from "lucide-react";

import { Button } from "~/components/ui/button";
import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import { getProjectColorClasses } from "~/lib/project-appearance";
import { formatBlockTimeRange, formatMinutesCompact } from "~/lib/planning";
import { getTaskDeadlineDateKey } from "~/lib/task-deadlines";
import { formatTaskDueLabel } from "~/lib/task-views";
import type { PlannedFocusBlock, TodoList } from "~/lib/types";
import { cn } from "~/lib/utils";

const SELECTED_DAY_PREVIEW_LIMIT = 2;
const QUEUE_PREVIEW_LIMIT = 3;

type PlannerQueueMode = "partial" | "unplanned" | "upcoming";

function PlannerTaskPreview({
  subtitle,
  title,
  onClick,
  trailing,
  tone = "default",
  actions,
}: {
  subtitle: string;
  title: string;
  onClick: () => void;
  trailing?: string | null;
  tone?: "default" | "warning";
  actions?: Array<{ label: string; onClick: () => void }>;
}) {
  return (
    <div
      className={cn(
        "rounded-md border border-border/70 bg-background/70 px-3 py-2.5 transition-colors hover:border-border hover:bg-background/90",
        tone === "warning" && "border-amber-500/20 bg-amber-500/[0.04]",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button type="button" onClick={onClick} className="min-w-0 flex-1 text-left">
          <div className="truncate text-[13px] font-semibold leading-5 text-foreground">
            {title}
          </div>
          <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {subtitle}
          </div>
        </button>
        {trailing ? (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em]",
              tone === "warning"
                ? "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-border/70 bg-background/80 text-primary",
            )}
          >
            {trailing}
          </span>
        ) : null}
      </div>
      {actions && actions.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground transition-colors hover:border-ring/30 hover:text-foreground"
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PlannerBlockPreview({
  block,
  listMap,
  onEditBlock,
}: {
  block: PlannedFocusBlock;
  listMap: Map<string, TodoList>;
  onEditBlock: (block: PlannedFocusBlock) => void;
}) {
  const project = listMap.get(block.list_id);
  const colors = getProjectColorClasses(project?.color_token);

  return (
    <button
      type="button"
      onClick={() => onEditBlock(block)}
      className={cn(
        "relative w-full overflow-hidden rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-background/90",
        colors.soft,
        colors.border,
      )}
    >
      <span className={cn("absolute inset-y-2 left-0 w-1.5 rounded-r-full", colors.accent)} />
      <div className="flex items-start gap-2.5 pl-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold leading-5 text-foreground">{block.title}</div>
          <div className="mt-1 text-[11px] font-medium text-muted-foreground">
            {formatBlockTimeRange(block.scheduled_start, block.scheduled_end)}
          </div>
          <div className="mt-1.5 truncate text-[11px] text-muted-foreground">
            {project?.name ?? "Project"}
          </div>
        </div>
      </div>
    </button>
  );
}

export function PlannerSidebar({
  dailyGoal,
  date,
  focusProgress,
  partiallyPlannedTasks,
  selectedDayBlocks,
  selectedDayTasks,
  selectedScopeLabel,
  timeZone,
  todayFocusMinutes,
  upcomingTasks,
  unplannedTasks,
  listMap,
  onEditBlock,
  onOpenTask,
  onQuickCreate,
  onQuickScheduleTask,
}: {
  dailyGoal: number;
  date: Date;
  focusProgress: number;
  partiallyPlannedTasks: TaskDatasetRecord[];
  selectedDayBlocks: PlannedFocusBlock[];
  selectedDayTasks: TaskDatasetRecord[];
  selectedScopeLabel: string;
  timeZone?: string | null;
  todayFocusMinutes: number;
  upcomingTasks: TaskDatasetRecord[];
  unplannedTasks: TaskDatasetRecord[];
  listMap: Map<string, TodoList>;
  onEditBlock: (block: PlannedFocusBlock) => void;
  onOpenTask: (taskId?: string | null, options?: { date?: Date; startTime?: string; durationMinutes?: number }) => void;
  onQuickCreate: (date: Date) => void;
  onQuickScheduleTask: (task: TaskDatasetRecord, intent: "add_30m" | "next_slot" | "today" | "tomorrow") => void;
}) {
  const [queueMode, setQueueMode] = useState<PlannerQueueMode>("unplanned");
  const visibleSelectedDayTasks = selectedDayTasks.slice(0, SELECTED_DAY_PREVIEW_LIMIT);
  const visibleSelectedDayBlocks = selectedDayBlocks.slice(0, SELECTED_DAY_PREVIEW_LIMIT);
  const hiddenSelectedDayTaskCount = Math.max(selectedDayTasks.length - visibleSelectedDayTasks.length, 0);
  const hiddenSelectedDayBlockCount = Math.max(selectedDayBlocks.length - visibleSelectedDayBlocks.length, 0);

  const queueTabs: Array<{ count: number; key: PlannerQueueMode; label: string }> = [
    { key: "unplanned", label: "Unplanned", count: unplannedTasks.length },
    { key: "partial", label: "Partial", count: partiallyPlannedTasks.length },
    { key: "upcoming", label: "Due soon", count: upcomingTasks.length },
  ];
  const activeQueueCount = queueTabs.find((tab) => tab.key === queueMode)?.count ?? 0;
  const queueActions = (task: TaskDatasetRecord) => [
    { label: "Today", onClick: () => onQuickScheduleTask(task, "today") },
    { label: "Tomorrow", onClick: () => onQuickScheduleTask(task, "tomorrow") },
    { label: "Next slot", onClick: () => onQuickScheduleTask(task, "next_slot") },
    { label: "+30m", onClick: () => onQuickScheduleTask(task, "add_30m") },
  ];

  return (
    <div className="space-y-3 xl:sticky xl:top-24">
      <PlannerSidebarActions
        dailyGoal={dailyGoal}
        date={date}
        focusProgress={focusProgress}
        todayFocusMinutes={todayFocusMinutes}
        onQuickCreate={onQuickCreate}
      />

      <div className="rounded-lg border border-border/70 bg-card/96 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">
              Selected day
            </p>
            <h3 className="mt-1 text-base font-semibold tracking-[-0.02em] text-foreground">
              {format(date, "EEEE, MMM d")}
            </h3>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5">
              Due {selectedDayTasks.length}
            </span>
            <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5">
              Blocks {selectedDayBlocks.length}
            </span>
          </div>
        </div>

        <div className="mt-3 grid gap-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">
                Due tasks
              </p>
              {hiddenSelectedDayTaskCount > 0 ? (
                <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">
                  +{hiddenSelectedDayTaskCount} more
                </span>
              ) : null}
            </div>

            {visibleSelectedDayTasks.length > 0 ? visibleSelectedDayTasks.map((task) => {
              const project = listMap.get(task.list_id);

              return (
                <PlannerTaskPreview
                  key={task.id}
                  title={task.title}
                  subtitle={project?.name ?? "Project"}
                  onClick={() => onOpenTask(task.id, { date })}
                />
              );
            }) : (
              <div className="rounded-md border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
                No due tasks.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">
                Planned blocks
              </p>
              {hiddenSelectedDayBlockCount > 0 ? (
                <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">
                  +{hiddenSelectedDayBlockCount} more
                </span>
              ) : null}
            </div>

            {visibleSelectedDayBlocks.length > 0 ? visibleSelectedDayBlocks.map((block) => (
              <PlannerBlockPreview
                key={block.id}
                block={block}
                listMap={listMap}
                onEditBlock={onEditBlock}
              />
            )) : (
              <div className="rounded-md border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
                No planned blocks.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border/70 bg-card/96 p-3.5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">
              Planning queue
            </p>
            <h3 className="mt-1 text-sm font-semibold tracking-[-0.02em] text-foreground">
              {queueMode === "unplanned"
                ? "What still needs time"
                : queueMode === "partial"
                  ? "Needs more coverage"
                  : "Coming up"}
            </h3>
            <p className="mt-1 text-[11px] text-muted-foreground">{selectedScopeLabel}</p>
          </div>
          <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
            {activeQueueCount}
          </span>
        </div>

        <div className="inline-flex w-full rounded-lg border border-border/70 bg-background/60 p-0.5">
          {queueTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setQueueMode(tab.key)}
              className={cn(
                "flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.12em] transition-colors",
                queueMode === tab.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2">
          {queueMode === "unplanned" ? (
            unplannedTasks.slice(0, QUEUE_PREVIEW_LIMIT).length > 0 ? unplannedTasks.slice(0, QUEUE_PREVIEW_LIMIT).map((task) => {
              const project = listMap.get(task.list_id);
              const subtitle = [project?.name ?? "Project", task.estimated_minutes ? formatMinutesCompact(task.estimated_minutes) : null]
                .filter(Boolean)
                .join(" / ");

              return (
                <PlannerTaskPreview
                  key={task.id}
                  title={task.title}
                  subtitle={subtitle || "No estimate"}
                  trailing="Plan"
                  actions={queueActions(task)}
                  onClick={() => onOpenTask(task.id, { date })}
                />
              );
            }) : (
              <div className="rounded-md border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
                Everything visible is already planned.
              </div>
            )
          ) : null}

          {queueMode === "partial" ? (
            partiallyPlannedTasks.slice(0, QUEUE_PREVIEW_LIMIT).length > 0 ? partiallyPlannedTasks.slice(0, QUEUE_PREVIEW_LIMIT).map((task) => {
              const project = listMap.get(task.list_id);
              const remaining = task.remaining_estimated_minutes ?? 0;
              const subtitle = [project?.name ?? "Project", task.planned_minutes > 0 ? `${formatMinutesCompact(task.planned_minutes)} planned` : null]
                .filter(Boolean)
                .join(" / ");

              return (
                <PlannerTaskPreview
                  key={task.id}
                  title={task.title}
                  subtitle={subtitle}
                  trailing={remaining > 0 ? `${formatMinutesCompact(remaining)} left` : "Needs time"}
                  tone="warning"
                  actions={queueActions(task)}
                  onClick={() => onOpenTask(task.id, { date })}
                />
              );
            }) : (
              <div className="rounded-md border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
                No partially planned tasks in scope.
              </div>
            )
          ) : null}

          {queueMode === "upcoming" ? (
            upcomingTasks.slice(0, QUEUE_PREVIEW_LIMIT).length > 0 ? upcomingTasks.slice(0, QUEUE_PREVIEW_LIMIT).map((task) => {
              const deadlineDateKey = getTaskDeadlineDateKey(task, timeZone);

              return (
                <PlannerTaskPreview
                  key={task.id}
                  title={task.title}
                  subtitle={formatTaskDueLabel(task, new Date(), timeZone) ?? "No deadline"}
                  actions={queueActions(task)}
                  onClick={() => onOpenTask(task.id, {
                    date: deadlineDateKey ? new Date(`${deadlineDateKey}T00:00:00`) : date,
                  })}
                />
              );
            }) : (
              <div className="rounded-md border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
                No upcoming items in scope.
              </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PlannerSidebarActions({
  dailyGoal,
  date,
  focusProgress,
  todayFocusMinutes,
  onQuickCreate,
}: {
  dailyGoal: number;
  date: Date;
  focusProgress: number;
  todayFocusMinutes: number;
  onQuickCreate: (date: Date) => void;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-card/96 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/65">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">
                Focus today
              </div>
              <div className="mt-0.5 font-mono text-lg text-foreground">
                {todayFocusMinutes}m
                <span className="text-sm text-muted-foreground"> / {dailyGoal}m goal</span>
              </div>
            </div>
          </div>
          <div className="mt-2 text-[11px] text-muted-foreground">
            {format(date, "EEE, MMM d")}
          </div>
        </div>

        <Button size="sm" className="h-9 rounded-md px-3.5" onClick={() => onQuickCreate(date)}>
          <Plus className="h-4 w-4" />
          New block
        </Button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${focusProgress}%` }} />
      </div>
    </div>
  );
}
