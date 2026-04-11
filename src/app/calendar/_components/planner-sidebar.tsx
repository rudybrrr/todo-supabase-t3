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
    <div className="rounded-lg border border-border/70 bg-background/60 px-3 py-2 transition-colors hover:bg-muted/55">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onClick}
            className="w-full text-left"
          >
            <div className="truncate text-[13px] font-semibold text-foreground">{title}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">{subtitle}</div>
          </button>
          {actions && actions.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {actions.map((action) => (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-ring/30 hover:text-foreground"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        {trailing ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]",
              tone === "warning"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "bg-primary/10 text-primary",
            )}
          >
            {trailing}
          </span>
        ) : null}
      </div>
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
        "w-full rounded-lg border px-3 py-2 text-left transition-colors hover:bg-background/90",
        colors.soft,
        colors.border,
      )}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", colors.accent)} />
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-foreground">{block.title}</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
            {formatBlockTimeRange(block.scheduled_start, block.scheduled_end)}
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

      <div className="rounded-xl border border-border/70 bg-card/96 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Selected day
            </p>
            <h3 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-foreground">
              {format(date, "EEEE, MMM d")}
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right text-[11px] text-muted-foreground">
            <div>
              <div className="uppercase tracking-[0.14em]">Due</div>
              <div className="mt-1 font-mono text-sm text-foreground">{selectedDayTasks.length}</div>
            </div>
            <div>
              <div className="uppercase tracking-[0.14em]">Blocks</div>
              <div className="mt-1 font-mono text-sm text-foreground">{selectedDayBlocks.length}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Due tasks
              </p>
              {hiddenSelectedDayTaskCount > 0 ? (
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
              <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
                No due tasks.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Planned blocks
              </p>
              {hiddenSelectedDayBlockCount > 0 ? (
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
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
              <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
                No planned blocks.
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-card/96 p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
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
                "flex-1 rounded-md px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] transition-colors",
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
              <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
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
              <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
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
              <div className="rounded-lg border border-dashed border-border/70 bg-background/40 px-3 py-3 text-sm text-muted-foreground">
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
    <div className="rounded-xl border border-border/70 bg-card/96 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/65">
            <Clock3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Focus today
            </div>
            <div className="mt-0.5 font-mono text-lg text-foreground">
              {todayFocusMinutes}m / {dailyGoal}m
            </div>
          </div>
        </div>

        <Button size="sm" className="h-10 rounded-lg px-3.5" onClick={() => onQuickCreate(date)}>
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
