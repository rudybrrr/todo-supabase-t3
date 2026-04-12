"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, isSameDay, isToday } from "date-fns";

import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import { getProjectColorClasses } from "~/lib/project-appearance";
import {
  PLANNER_HOUR_ROW_HEIGHT,
  PLANNER_MIN_BLOCK_MINUTES,
  PLANNER_TIME_GUTTER_WIDTH,
  clampPlannerMinutes,
  formatBlockTimeRange,
  formatPlannerHourLabel,
  getPlannerDayMinuteRange,
  getPlannerHours,
  getPlannerMinutesFromOffset,
  getPlannerMinutesFromDate,
  getPlannerOffsetFromMinutes,
  snapPlannerMinutes,
  toDateKey,
  type PlannerTimedBlockLayout,
} from "~/lib/planning";
import type { PlannedFocusBlock, TodoList } from "~/lib/types";
import { cn } from "~/lib/utils";

type PlannerInteraction =
  | {
      type: "create";
      pointerId: number;
      dayIndex: number;
      anchorMinutes: number;
      startMinutes: number;
      endMinutes: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
    }
  | {
      type: "move";
      pointerId: number;
      block: PlannedFocusBlock;
      originalDayIndex: number;
      originalStartMinutes: number;
      originalEndMinutes: number;
      dayIndex: number;
      startMinutes: number;
      endMinutes: number;
      pointerOffsetMinutes: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
    }
  | {
      type: "resize";
      edge: "end" | "start";
      pointerId: number;
      block: PlannedFocusBlock;
      originalDayIndex: number;
      originalStartMinutes: number;
      originalEndMinutes: number;
      dayIndex: number;
      startMinutes: number;
      endMinutes: number;
      startClientX: number;
      startClientY: number;
      moved: boolean;
    };

const MOVE_THRESHOLD_PX = 4;

export function PlannerGrid({
  blockLayoutsByKey,
  dayEndHour,
  dayStartHour,
  days,
  defaultCreateDurationMinutes,
  now,
  selectedDate,
  tasksByKey,
  listMap,
  onCreateRange,
  onEditBlock,
  onQuickPlanTask,
  onSelectDate,
  onUpdateBlock,
}: {
  blockLayoutsByKey: Map<string, PlannerTimedBlockLayout[]>;
  dayEndHour: number;
  dayStartHour: number;
  days: Date[];
  defaultCreateDurationMinutes: number;
  now: Date;
  selectedDate: Date;
  tasksByKey: Map<string, TaskDatasetRecord[]>;
  listMap: Map<string, TodoList>;
  onCreateRange: (draft: { date: Date; endMinutes: number; startMinutes: number }) => void;
  onEditBlock: (block: PlannedFocusBlock) => void;
  onQuickPlanTask: (taskId: string, date: Date) => void;
  onSelectDate: (date: Date) => void;
  onUpdateBlock: (block: PlannedFocusBlock, next: { date: Date; endMinutes: number; startMinutes: number }) => void;
}) {
  const timedGridRef = useRef<HTMLDivElement | null>(null);
  const [interaction, setInteraction] = useState<PlannerInteraction | null>(null);
  const plannerHours = useMemo(() => getPlannerHours(dayStartHour, dayEndHour), [dayEndHour, dayStartHour]);
  const plannerDayMinutes = useMemo(() => getPlannerDayMinuteRange(dayStartHour, dayEndHour), [dayEndHour, dayStartHour]);
  const normalizedDefaultCreateDurationMinutes = useMemo(
    () => clampPlannerMinutes(
      snapPlannerMinutes(defaultCreateDurationMinutes, { mode: "ceil" }),
      PLANNER_MIN_BLOCK_MINUTES,
      plannerDayMinutes,
    ),
    [defaultCreateDurationMinutes, plannerDayMinutes],
  );
  const previewDayKey = interaction ? toDateKey(days[interaction.dayIndex] ?? days[0] ?? new Date()) : null;
  const currentTimeOffset = useMemo(() => {
    if (!days.some((day) => isToday(day))) return null;
    const minutesIntoPlanner = getPlannerMinutesFromDate(now, dayStartHour);
    if (minutesIntoPlanner < 0 || minutesIntoPlanner > plannerDayMinutes) return null;
    return getPlannerOffsetFromMinutes(minutesIntoPlanner);
  }, [dayStartHour, days, now, plannerDayMinutes]);
  const todayColumnIndex = useMemo(() => days.findIndex((day) => isToday(day)), [days]);
  const plannerRowStyle = useMemo(() => ({ height: `${PLANNER_HOUR_ROW_HEIGHT}px` }), []);
  const gridTemplateColumns = useMemo(
    () => `${PLANNER_TIME_GUTTER_WIDTH}px repeat(${days.length}, minmax(${days.length === 1 ? "0px" : "140px"}, 1fr))`,
    [days.length],
  );
  const allDayVisibleLimit = days.length === 1 ? 6 : 2;

  useEffect(() => {
    if (!interaction) return;

    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    const getDayIndexFromClientX = (clientX: number) => {
      if (days.length <= 1 || !timedGridRef.current) return 0;

      const rect = timedGridRef.current.getBoundingClientRect();
      const daysWidth = rect.width - PLANNER_TIME_GUTTER_WIDTH;
      const rawOffset = clientX - rect.left - PLANNER_TIME_GUTTER_WIDTH;
      const clampedOffset = Math.min(Math.max(rawOffset, 0), Math.max(daysWidth - 1, 0));
      const nextIndex = Math.floor(clampedOffset / (daysWidth / days.length));
      return Math.min(Math.max(nextIndex, 0), days.length - 1);
    };

    const getMinutesFromClientY = (clientY: number) => {
      if (!timedGridRef.current) return 0;

      const rect = timedGridRef.current.getBoundingClientRect();
      const rawOffset = clientY - rect.top;
      const clampedOffset = Math.min(Math.max(rawOffset, 0), rect.height);
      return clampPlannerMinutes(getPlannerMinutesFromOffset(clampedOffset), 0, plannerDayMinutes);
    };

    const handlePointerMove = (event: PointerEvent) => {
      setInteraction((current) => {
        if (current?.pointerId !== event.pointerId) return current;

        const moved = current.moved
          || Math.abs(event.clientY - current.startClientY) > MOVE_THRESHOLD_PX
          || Math.abs(event.clientX - current.startClientX) > MOVE_THRESHOLD_PX;

        if (current.type === "create") {
          const currentMinutes = getMinutesFromClientY(event.clientY);
          let startMinutes = snapPlannerMinutes(Math.min(current.anchorMinutes, currentMinutes), { mode: "floor" });
          let endMinutes = snapPlannerMinutes(Math.max(current.anchorMinutes, currentMinutes), { mode: "ceil" });

          if (endMinutes - startMinutes < PLANNER_MIN_BLOCK_MINUTES) {
            if (currentMinutes >= current.anchorMinutes) {
              endMinutes = startMinutes + PLANNER_MIN_BLOCK_MINUTES;
            } else {
              startMinutes = endMinutes - PLANNER_MIN_BLOCK_MINUTES;
            }
          }

          return {
            ...current,
            moved,
            startMinutes: clampPlannerMinutes(startMinutes, 0, plannerDayMinutes - PLANNER_MIN_BLOCK_MINUTES),
            endMinutes: clampPlannerMinutes(endMinutes, PLANNER_MIN_BLOCK_MINUTES, plannerDayMinutes),
          };
        }

        if (current.type === "move") {
          const duration = current.originalEndMinutes - current.originalStartMinutes;
          const dayIndex = getDayIndexFromClientX(event.clientX);
          const nextStart = snapPlannerMinutes(getMinutesFromClientY(event.clientY) - current.pointerOffsetMinutes);
          const startMinutes = clampPlannerMinutes(nextStart, 0, plannerDayMinutes - duration);

          return {
            ...current,
            moved,
            dayIndex,
            startMinutes,
            endMinutes: startMinutes + duration,
          };
        }

        const nextMinutes = getMinutesFromClientY(event.clientY);
        if (current.edge === "start") {
          const startMinutes = clampPlannerMinutes(
          snapPlannerMinutes(nextMinutes),
          0,
          current.originalEndMinutes - PLANNER_MIN_BLOCK_MINUTES,
          );

          return {
            ...current,
            moved,
            startMinutes,
          };
        }

        const endMinutes = clampPlannerMinutes(
          snapPlannerMinutes(nextMinutes),
          current.originalStartMinutes + PLANNER_MIN_BLOCK_MINUTES,
          plannerDayMinutes,
        );

        return {
          ...current,
          moved,
          endMinutes,
        };
      });
    };

    const handlePointerFinish = (event: PointerEvent) => {
      if (interaction?.pointerId !== event.pointerId) return;

      setInteraction(null);

      if (interaction.type === "create") {
        const day = days[interaction.dayIndex];
        if (!day) return;

        const startMinutes = interaction.startMinutes;
        const endMinutes = interaction.moved
          ? interaction.endMinutes
          : clampPlannerMinutes(
            startMinutes + normalizedDefaultCreateDurationMinutes,
            PLANNER_MIN_BLOCK_MINUTES,
            plannerDayMinutes,
          );

        onSelectDate(day);
        onCreateRange({ date: day, startMinutes, endMinutes });
        return;
      }

      const day = days[interaction.dayIndex];
      if (!day) return;

      if (!interaction.moved) {
        onEditBlock(interaction.block);
        return;
      }

      onSelectDate(day);
      onUpdateBlock(interaction.block, {
        date: day,
        startMinutes: interaction.startMinutes,
        endMinutes: interaction.endMinutes,
      });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerFinish);
    window.addEventListener("pointercancel", handlePointerFinish);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerFinish);
      window.removeEventListener("pointercancel", handlePointerFinish);
    };
  }, [days, interaction, normalizedDefaultCreateDurationMinutes, onCreateRange, onEditBlock, onSelectDate, onUpdateBlock, plannerDayMinutes]);

  return (
    <div className="overflow-hidden rounded-xl border border-border/70 bg-card/98">
      <div className="overflow-x-auto">
        <div className={cn(days.length > 1 && "min-w-[980px]")}>
          <div className="grid border-b border-border/70" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-20 border-r border-border/70 bg-card/98 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Day
            </div>
            {days.map((day) => {
              const dayKey = toDateKey(day);
              const itemCount = (tasksByKey.get(dayKey)?.length ?? 0) + (blockLayoutsByKey.get(dayKey)?.length ?? 0);
              const isSelected = isSameDay(day, selectedDate);
              const isCurrentDay = isToday(day);

              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => onSelectDate(day)}
                  className={cn(
                    "flex min-h-[64px] flex-col items-start justify-center gap-0.5 border-r border-border/70 px-3 py-2.5 text-left transition-colors last:border-r-0",
                    isSelected ? "bg-accent/40" : "bg-background/35 hover:bg-muted/50",
                  )}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {format(day, days.length === 1 ? "EEEE" : "EEE")}
                  </span>
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className={cn("text-base font-semibold tracking-[-0.03em] text-foreground", isCurrentDay && "text-primary")}>
                      {format(day, days.length === 1 ? "MMM d" : "d")}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[11px] font-mono",
                        isSelected
                          ? "border-primary/30 bg-primary/10 text-primary"
                          : "border-border/70 bg-background/75 text-muted-foreground",
                      )}
                    >
                      {itemCount}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid border-b border-border/70" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-20 border-r border-border/70 bg-card/98 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Tasks
            </div>
            {days.map((day) => {
              const dayKey = toDateKey(day);
              const tasksForDay = tasksByKey.get(dayKey) ?? [];
              const visibleTasks = tasksForDay.slice(0, allDayVisibleLimit);
              const remainingCount = tasksForDay.length - visibleTasks.length;

              return (
                <div
                  key={dayKey}
                  className={cn(
                    "min-h-[5.25rem] space-y-1.5 border-r border-border/70 px-2.5 py-2.5 last:border-r-0",
                    isSameDay(day, selectedDate) ? "bg-accent/20" : "bg-background/22",
                  )}
                >
                  {visibleTasks.length > 0 ? visibleTasks.map((task) => {
                    const project = listMap.get(task.list_id);
                    const colors = getProjectColorClasses(project?.color_token);

                    return (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onQuickPlanTask(task.id, day)}
                        className={cn(
                          "flex w-full items-start gap-2 rounded-lg border px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-background/90",
                          colors.soft,
                          colors.border,
                        )}
                      >
                        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", colors.accent)} />
                        <span className="min-w-0 truncate font-medium text-foreground">{task.title}</span>
                      </button>
                    );
                  }) : (
                    <div className="flex min-h-[5.25rem] items-center justify-center rounded-xl border border-dashed border-border/70 bg-background/35 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      Clear
                    </div>
                  )}

                  {remainingCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => onSelectDate(day)}
                      className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      +{remainingCount} more
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div ref={timedGridRef} className="relative grid" style={{ gridTemplateColumns }}>
            <div className="sticky left-0 z-20 border-r border-border/70 bg-card/98">
              {plannerHours.map((hour) => (
                <div
                  key={hour}
                  className="flex items-start justify-end border-b border-border/60 px-3 pt-1.5 text-[10px] font-medium text-muted-foreground last:border-b-0"
                  style={plannerRowStyle}
                >
                  {formatPlannerHourLabel(hour)}
                </div>
              ))}
            </div>

            {days.map((day, dayIndex) => {
              const dayKey = toDateKey(day);
              const dayLayouts = blockLayoutsByKey.get(dayKey) ?? [];

              return (
                <div
                  key={dayKey}
                  className={cn(
                    "relative border-r border-border/70 last:border-r-0 touch-none",
                    isSameDay(day, selectedDate) ? "bg-accent/18" : "bg-background/15",
                  )}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    if ((event.target as HTMLElement).closest("[data-planner-interactive='true']")) return;

                    event.preventDefault();
                    onSelectDate(day);

                    const rect = timedGridRef.current?.getBoundingClientRect();
                    if (!rect) return;

                    const currentMinutes = clampPlannerMinutes(
                      getPlannerMinutesFromOffset(Math.min(Math.max(event.clientY - rect.top, 0), rect.height)),
                      0,
                      plannerDayMinutes,
                    );
                    const anchorMinutes = clampPlannerMinutes(
                      snapPlannerMinutes(currentMinutes, { mode: "floor" }),
                      0,
                      plannerDayMinutes - PLANNER_MIN_BLOCK_MINUTES,
                    );

                    setInteraction({
                      type: "create",
                      pointerId: event.pointerId,
                      dayIndex,
                      anchorMinutes,
                      startMinutes: anchorMinutes,
                      endMinutes: anchorMinutes + PLANNER_MIN_BLOCK_MINUTES,
                      startClientX: event.clientX,
                      startClientY: event.clientY,
                      moved: false,
                    });
                  }}
                >
                  {plannerHours.map((hour) => (
                    <div key={`${dayKey}-${hour}`} className="border-b border-border/60 last:border-b-0" style={plannerRowStyle} />
                  ))}

                  {dayLayouts.map((layout) => {
                    const project = listMap.get(layout.block.list_id);
                    const colors = getProjectColorClasses(project?.color_token);
                    const width = `calc(${100 / layout.laneCount}% - 8px)`;
                    const left = `calc(${(layout.lane / layout.laneCount) * 100}% + 4px)`;
                    const active =
                      interaction?.type !== "create"
                      && interaction?.block.id === layout.block.id;

                    return (
                      <div
                        key={layout.block.id}
                        data-planner-interactive="true"
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onEditBlock(layout.block);
                          }
                        }}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;

                          event.preventDefault();
                          event.stopPropagation();
                          onSelectDate(day);

                          const rect = timedGridRef.current?.getBoundingClientRect();
                          if (!rect) return;

                          const pointerMinutes = clampPlannerMinutes(
                            getPlannerMinutesFromOffset(Math.min(Math.max(event.clientY - rect.top, 0), rect.height)),
                            0,
                            plannerDayMinutes,
                          );
                          setInteraction({
                            type: "move",
                            pointerId: event.pointerId,
                            block: layout.block,
                            originalDayIndex: dayIndex,
                            originalStartMinutes: layout.startMinutes,
                            originalEndMinutes: layout.endMinutes,
                            dayIndex,
                            startMinutes: layout.startMinutes,
                            endMinutes: layout.endMinutes,
                            pointerOffsetMinutes: pointerMinutes - layout.startMinutes,
                            startClientX: event.clientX,
                            startClientY: event.clientY,
                            moved: false,
                          });
                        }}
                        className={cn(
                          "absolute overflow-hidden rounded-xl border px-2 py-1.5 text-left transition-opacity",
                          colors.soft,
                          colors.border,
                          active && "opacity-30",
                        )}
                        style={{ top: layout.top + 3, left, width, height: layout.height }}
                      >
                        <span
                          data-planner-interactive="true"
                          className="absolute inset-x-2 top-1 h-2 cursor-ns-resize rounded-full"
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.preventDefault();
                            event.stopPropagation();
                            onSelectDate(day);
                            setInteraction({
                              type: "resize",
                              edge: "start",
                              pointerId: event.pointerId,
                              block: layout.block,
                              originalDayIndex: dayIndex,
                              originalStartMinutes: layout.startMinutes,
                              originalEndMinutes: layout.endMinutes,
                              dayIndex,
                              startMinutes: layout.startMinutes,
                              endMinutes: layout.endMinutes,
                              startClientX: event.clientX,
                              startClientY: event.clientY,
                              moved: false,
                            });
                          }}
                        />
                        <span
                          data-planner-interactive="true"
                          className="absolute inset-x-2 bottom-1 h-2 cursor-ns-resize rounded-full"
                          onPointerDown={(event) => {
                            if (event.button !== 0) return;
                            event.preventDefault();
                            event.stopPropagation();
                            onSelectDate(day);
                            setInteraction({
                              type: "resize",
                              edge: "end",
                              pointerId: event.pointerId,
                              block: layout.block,
                              originalDayIndex: dayIndex,
                              originalStartMinutes: layout.startMinutes,
                              originalEndMinutes: layout.endMinutes,
                              dayIndex,
                              startMinutes: layout.startMinutes,
                              endMinutes: layout.endMinutes,
                              startClientX: event.clientX,
                              startClientY: event.clientY,
                              moved: false,
                            });
                          }}
                        />
                        <div className="flex items-start gap-2">
                          <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", colors.accent)} />
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{layout.block.title}</div>
                            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                              {formatBlockTimeRange(layout.block.scheduled_start, layout.block.scheduled_end)}
                            </div>
                            <div className="mt-2 truncate text-xs text-muted-foreground">
                              {project?.name ?? "Project"}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {previewDayKey === dayKey && interaction ? (
                    <div
                      className={cn(
                        "pointer-events-none absolute inset-x-1 rounded-xl border border-dashed bg-primary/10",
                        interaction.type === "create"
                          ? "border-primary/50"
                          : "border-foreground/25",
                      )}
                      style={{
                        top: getPlannerOffsetFromMinutes(interaction.startMinutes) + 3,
                        height: Math.max(
                          42,
                          getPlannerOffsetFromMinutes(interaction.endMinutes - interaction.startMinutes) - 6,
                        ),
                      }}
                    />
                  ) : null}
                </div>
              );
            })}

            {currentTimeOffset != null && todayColumnIndex >= 0 ? (
              <div
                className="pointer-events-none absolute z-30"
                style={{
                  top: currentTimeOffset,
                  left: `calc(${PLANNER_TIME_GUTTER_WIDTH}px + (${todayColumnIndex} * ((100% - ${PLANNER_TIME_GUTTER_WIDTH}px) / ${days.length})))`,
                  width: `calc((100% - ${PLANNER_TIME_GUTTER_WIDTH}px) / ${days.length})`,
                }}
              >
                <div className="relative h-0">
                  <span className="absolute -left-1.5 top-0 h-3 w-3 -translate-y-1/2 rounded-full bg-rose-500 shadow-[0_0_0_3px_color-mix(in_oklab,var(--color-card)_80%,transparent)]" />
                  <div className="h-px w-full bg-rose-500" />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
