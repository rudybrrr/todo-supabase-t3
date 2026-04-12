import {
  addDays,
  addMinutes,
  differenceInMinutes,
  format,
  isValid,
  parseISO,
  setHours,
  startOfDay,
  startOfWeek,
} from "date-fns";

import type { PlannedFocusBlock, PlanningStatus } from "~/lib/types";

export type PlannerView = "day" | "month" | "week";
export type PlannerWeekStartsOn = 0 | 1;

export interface PlannerPreferenceInput {
  default_block_minutes?: number | null;
  week_starts_on?: number | null;
  planner_day_start_hour?: number | null;
  planner_day_end_hour?: number | null;
}

export interface PlannerPreferences {
  dayEndHour: number;
  dayStartHour: number;
  defaultBlockMinutes: number;
  defaultBlockStartHour: number;
  weekStartsOn: PlannerWeekStartsOn;
}

export interface PlannerTimedBlockLayout {
  block: PlannedFocusBlock;
  lane: number;
  laneCount: number;
  top: number;
  height: number;
  startMinutes: number;
  endMinutes: number;
}

export interface PlannerSlotDraft {
  date: Date;
  startMinutes: number;
  endMinutes: number;
}

export const PLANNER_DEFAULT_BLOCK_MINUTES = 60;
export const WEEK_STARTS_ON = 1 as const;
export const PLANNER_DAY_START_HOUR = 7;
export const PLANNER_DAY_END_HOUR = 22;
export const PLANNER_DEFAULT_BLOCK_START_HOUR = 9;
export const PLANNER_HOUR_ROW_HEIGHT = 56;
export const PLANNER_TIME_GUTTER_WIDTH = 76;
export const PLANNER_SNAP_MINUTES = 15;
export const PLANNER_MIN_BLOCK_MINUTES = 15;
export const PLANNED_BLOCK_FIELDS =
  "id, user_id, list_id, todo_id, title, scheduled_start, scheduled_end, inserted_at, updated_at";

function parsePlannerDate(raw: string | null | undefined) {
  if (!raw) return startOfDay(new Date());

  const parsed = parseISO(raw);
  return isValid(parsed) ? startOfDay(parsed) : startOfDay(new Date());
}

export function toDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function dateKeyToDate(dateKey: string) {
  return parseISO(`${dateKey}T00:00:00`);
}

export function normalizePlannerWeekStartsOn(value: number | null | undefined): PlannerWeekStartsOn {
  return value === 0 ? 0 : 1;
}

export function normalizePlannerDayStartHour(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return PLANNER_DAY_START_HOUR;
  }

  return Math.min(Math.max(Math.round(value!), 0), 23);
}

export function normalizePlannerDayEndHour(value: number | null | undefined, dayStartHour = PLANNER_DAY_START_HOUR) {
  if (!Number.isFinite(value)) {
    return Math.min(Math.max(PLANNER_DAY_END_HOUR, dayStartHour + 1), 24);
  }

  return Math.min(Math.max(Math.round(value!), dayStartHour + 1), 24);
}

export function normalizePlannerDefaultBlockMinutes(value: number | null | undefined) {
  if (!Number.isFinite(value)) {
    return PLANNER_DEFAULT_BLOCK_MINUTES;
  }

  return Math.max(
    PLANNER_MIN_BLOCK_MINUTES,
    snapPlannerMinutes(Math.round(value!), { mode: "ceil" }),
  );
}

export function getPlannerDefaultStartHour(
  dayStartHour = PLANNER_DAY_START_HOUR,
  dayEndHour = PLANNER_DAY_END_HOUR,
) {
  return Math.min(Math.max(PLANNER_DEFAULT_BLOCK_START_HOUR, dayStartHour), dayEndHour - 1);
}

export function getPlannerDefaultStartMinutes(
  dayStartHour = PLANNER_DAY_START_HOUR,
  dayEndHour = PLANNER_DAY_END_HOUR,
  defaultBlockStartHour = getPlannerDefaultStartHour(dayStartHour, dayEndHour),
) {
  return clampPlannerMinutes(
    Math.max((defaultBlockStartHour - dayStartHour) * 60, 0),
    0,
    Math.max(getPlannerDayMinuteRange(dayStartHour, dayEndHour) - PLANNER_MIN_BLOCK_MINUTES, 0),
  );
}

export function getPlannerPreferences(input?: PlannerPreferenceInput | null): PlannerPreferences {
  const dayStartHour = normalizePlannerDayStartHour(input?.planner_day_start_hour);
  const dayEndHour = normalizePlannerDayEndHour(input?.planner_day_end_hour, dayStartHour);
  const plannerDayMinutes = getPlannerDayMinuteRange(dayStartHour, dayEndHour);

  return {
    dayEndHour,
    dayStartHour,
    defaultBlockMinutes: Math.min(
      normalizePlannerDefaultBlockMinutes(input?.default_block_minutes),
      plannerDayMinutes,
    ),
    defaultBlockStartHour: getPlannerDefaultStartHour(dayStartHour, dayEndHour),
    weekStartsOn: normalizePlannerWeekStartsOn(input?.week_starts_on),
  };
}

export function getWeekDays(anchorDate: Date, weekStartsOn: PlannerWeekStartsOn = WEEK_STARTS_ON) {
  const start = startOfWeek(anchorDate, { weekStartsOn });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function getPlannerVisibleDays(
  view: Exclude<PlannerView, "month">,
  anchorDate: Date,
  selectedDate: Date,
  weekStartsOn: PlannerWeekStartsOn = WEEK_STARTS_ON,
) {
  if (view === "day") {
    return [startOfDay(selectedDate)];
  }

  return getWeekDays(anchorDate, weekStartsOn);
}

export function getPlannerHours(
  startHour = PLANNER_DAY_START_HOUR,
  endHour = PLANNER_DAY_END_HOUR,
) {
  return Array.from({ length: Math.max(0, endHour - startHour) }, (_, index) => startHour + index);
}

export function formatPlannerHourLabel(hour: number) {
  return format(setHours(startOfDay(new Date()), hour), "HH:mm");
}

export function getPlannerRangeLabel(
  view: PlannerView,
  anchorDate: Date,
  selectedDate = anchorDate,
  weekStartsOn: PlannerWeekStartsOn = WEEK_STARTS_ON,
) {
  if (view === "day") {
    return format(selectedDate, "EEEE, MMM d");
  }

  if (view === "month") {
    return format(anchorDate, "MMMM yyyy");
  }

  const start = startOfWeek(anchorDate, { weekStartsOn });
  const end = addDays(start, 6);
  return `${format(start, "MMM d")} - ${format(end, "MMM d")}`;
}

export function combineDateAndTime(dateKey: string, time: string) {
  const baseDate = parsePlannerDate(dateKey);
  const [hoursString = "09", minutesString = "00"] = time.split(":");
  const hours = Number.parseInt(hoursString, 10);
  const minutes = Number.parseInt(minutesString, 10);

  baseDate.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return baseDate;
}

export function getPlannerDayMinuteRange(
  startHour = PLANNER_DAY_START_HOUR,
  endHour = PLANNER_DAY_END_HOUR,
) {
  return Math.max(0, endHour - startHour) * 60;
}

export function clampPlannerMinutes(
  value: number,
  min = 0,
  max = getPlannerDayMinuteRange(),
) {
  return Math.min(Math.max(value, min), max);
}

export function snapPlannerMinutes(
  value: number,
  options?: { step?: number; mode?: "ceil" | "floor" | "nearest" },
) {
  const step = options?.step ?? PLANNER_SNAP_MINUTES;
  const mode = options?.mode ?? "nearest";
  const normalized = value / step;

  if (mode === "floor") {
    return Math.floor(normalized) * step;
  }

  if (mode === "ceil") {
    return Math.ceil(normalized) * step;
  }

  return Math.round(normalized) * step;
}

export function getPlannerDateFromMinutes(
  date: Date,
  minutes: number,
  startHour = PLANNER_DAY_START_HOUR,
) {
  return addMinutes(startOfDay(date), startHour * 60 + minutes);
}

export function getPlannerMinutesFromDate(
  value: string | Date,
  startHour = PLANNER_DAY_START_HOUR,
) {
  const date = value instanceof Date ? value : new Date(value);
  return (date.getHours() - startHour) * 60 + date.getMinutes();
}

export function getPlannerOffsetFromMinutes(minutes: number) {
  return (minutes / 60) * PLANNER_HOUR_ROW_HEIGHT;
}

export function getPlannerMinutesFromOffset(offset: number) {
  return (offset / PLANNER_HOUR_ROW_HEIGHT) * 60;
}

export function getDurationMinutes(startIso: string, endIso: string) {
  return Math.max(1, differenceInMinutes(new Date(endIso), new Date(startIso)));
}

export function formatBlockTimeRange(startIso: string, endIso: string) {
  return `${format(new Date(startIso), "h:mm a")} - ${format(new Date(endIso), "h:mm a")}`;
}

export function formatMinutesCompact(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
  }

  return `${minutes}m`;
}

export function buildPlannedMinutesByTodo(blocks: PlannedFocusBlock[]) {
  const plannedMinutesByTodo = new Map<string, number>();

  blocks.forEach((block) => {
    if (!block.todo_id) return;

    plannedMinutesByTodo.set(
      block.todo_id,
      (plannedMinutesByTodo.get(block.todo_id) ?? 0) + getDurationMinutes(block.scheduled_start, block.scheduled_end),
    );
  });

  return plannedMinutesByTodo;
}

function getPlannerDayIntervals(
  blocks: PlannedFocusBlock[],
  date: Date,
  dayStartHour = PLANNER_DAY_START_HOUR,
  dayEndHour = PLANNER_DAY_END_HOUR,
) {
  const plannerDayMinutes = getPlannerDayMinuteRange(dayStartHour, dayEndHour);

  return blocks
    .filter((block) => toDateKey(new Date(block.scheduled_start)) === toDateKey(date))
    .map((block) => {
      const startMinutes = clampPlannerMinutes(
        getPlannerMinutesFromDate(block.scheduled_start, dayStartHour),
        0,
        plannerDayMinutes,
      );
      const endMinutes = clampPlannerMinutes(
        Math.max(startMinutes + PLANNER_MIN_BLOCK_MINUTES, getPlannerMinutesFromDate(block.scheduled_end, dayStartHour)),
        PLANNER_MIN_BLOCK_MINUTES,
        plannerDayMinutes,
      );

      return { startMinutes, endMinutes };
    })
    .filter((interval) => interval.endMinutes > interval.startMinutes)
    .sort((a, b) => a.startMinutes - b.startMinutes);
}

export function findPlannerSlotForDate(
  blocks: PlannedFocusBlock[],
  date: Date,
  durationMinutes: number,
  options?: {
    after?: Date | null;
    dayEndHour?: number;
    dayStartHour?: number;
    defaultBlockStartHour?: number;
  },
): PlannerSlotDraft | null {
  const normalizedDate = startOfDay(date);
  const dayStartHour = options?.dayStartHour ?? PLANNER_DAY_START_HOUR;
  const dayEndHour = options?.dayEndHour ?? PLANNER_DAY_END_HOUR;
  const defaultBlockStartHour = options?.defaultBlockStartHour ?? getPlannerDefaultStartHour(dayStartHour, dayEndHour);
  const normalizedDuration = Math.max(PLANNER_MIN_BLOCK_MINUTES, snapPlannerMinutes(durationMinutes, { mode: "ceil" }));
  const plannerDayMinutes = getPlannerDayMinuteRange(dayStartHour, dayEndHour);
  const defaultStartMinutes = clampPlannerMinutes(
    getPlannerDefaultStartMinutes(dayStartHour, dayEndHour, defaultBlockStartHour),
    0,
    plannerDayMinutes - normalizedDuration,
  );

  if (normalizedDuration > plannerDayMinutes) {
    return null;
  }

  const sameDayAfter = options?.after && toDateKey(options.after) === toDateKey(normalizedDate)
    ? options.after
    : null;
  const initialStartMinutes = sameDayAfter
    ? clampPlannerMinutes(
      snapPlannerMinutes(getPlannerMinutesFromDate(sameDayAfter, dayStartHour), { mode: "ceil" }),
      defaultStartMinutes,
      plannerDayMinutes - normalizedDuration,
    )
    : defaultStartMinutes;
  const intervals = getPlannerDayIntervals(blocks, normalizedDate, dayStartHour, dayEndHour);
  let cursorMinutes = initialStartMinutes;

  for (const interval of intervals) {
    if (interval.endMinutes <= cursorMinutes) {
      continue;
    }

    if (interval.startMinutes - cursorMinutes >= normalizedDuration) {
      return {
        date: normalizedDate,
        startMinutes: cursorMinutes,
        endMinutes: cursorMinutes + normalizedDuration,
      };
    }

    cursorMinutes = Math.max(cursorMinutes, interval.endMinutes);
  }

  if (plannerDayMinutes - cursorMinutes >= normalizedDuration) {
    return {
      date: normalizedDate,
      startMinutes: cursorMinutes,
      endMinutes: cursorMinutes + normalizedDuration,
    };
  }

  return null;
}

export function findNextPlannerSlot(
  blocks: PlannedFocusBlock[],
  options?: {
    after?: Date;
    dayEndHour?: number;
    dayStartHour?: number;
    daysToScan?: number;
    defaultBlockStartHour?: number;
    durationMinutes?: number;
  },
) {
  const after = options?.after ?? new Date();
  const dayStartHour = options?.dayStartHour ?? PLANNER_DAY_START_HOUR;
  const dayEndHour = options?.dayEndHour ?? PLANNER_DAY_END_HOUR;
  const defaultBlockStartHour = options?.defaultBlockStartHour ?? getPlannerDefaultStartHour(dayStartHour, dayEndHour);
  const normalizedDuration = Math.max(
    PLANNER_MIN_BLOCK_MINUTES,
    snapPlannerMinutes(options?.durationMinutes ?? PLANNER_DEFAULT_BLOCK_MINUTES, { mode: "ceil" }),
  );
  const daysToScan = Math.max(options?.daysToScan ?? 10, 1);

  for (let index = 0; index < daysToScan; index += 1) {
    const nextDate = startOfDay(addDays(after, index));
    const slot = findPlannerSlotForDate(blocks, nextDate, normalizedDuration, {
      after: index === 0 ? after : null,
      dayEndHour,
      dayStartHour,
      defaultBlockStartHour,
    });

    if (slot) {
      return slot;
    }
  }

  const fallbackDate = startOfDay(addDays(after, daysToScan));
  return {
    date: fallbackDate,
    startMinutes: 0,
    endMinutes: normalizedDuration,
  };
}

export function getCurrentPlannedBlock(
  blocks: PlannedFocusBlock[],
  now = new Date(),
) {
  const nowTime = now.getTime();

  return blocks
    .filter((block) => {
      const startTime = new Date(block.scheduled_start).getTime();
      const endTime = new Date(block.scheduled_end).getTime();
      return startTime <= nowTime && endTime > nowTime;
    })
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))[0] ?? null;
}

export function getNextPlannedBlock(
  blocks: PlannedFocusBlock[],
  now = new Date(),
) {
  const nowTime = now.getTime();

  return blocks
    .filter((block) => new Date(block.scheduled_start).getTime() > nowTime)
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))[0] ?? null;
}

export function getRemainingPlannedMinutesForDay(
  blocks: PlannedFocusBlock[],
  now = new Date(),
) {
  const todayKey = toDateKey(now);
  const nowTime = now.getTime();

  return blocks
    .filter((block) => toDateKey(new Date(block.scheduled_start)) === todayKey)
    .reduce((total, block) => {
      const startTime = new Date(block.scheduled_start).getTime();
      const endTime = new Date(block.scheduled_end).getTime();
      if (endTime <= nowTime) {
        return total;
      }

      return total + Math.max(Math.ceil((endTime - Math.max(startTime, nowTime)) / 60000), 0);
    }, 0);
}

export function buildTimedBlockLayouts(
  blocks: PlannedFocusBlock[],
  date: Date,
  options?: { dayEndHour?: number; dayStartHour?: number },
) {
  const dayStartHour = options?.dayStartHour ?? PLANNER_DAY_START_HOUR;
  const dayEndHour = options?.dayEndHour ?? PLANNER_DAY_END_HOUR;
  const plannerDayMinutes = getPlannerDayMinuteRange(dayStartHour, dayEndHour);
  const normalizedBlocks = blocks
    .filter((block) => toDateKey(new Date(block.scheduled_start)) === toDateKey(date))
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))
    .map((block) => {
      const interval = getPlannerDayIntervals([block], date, dayStartHour, dayEndHour)[0];
      if (!interval) return null;

      return {
        block,
        startMinutes: interval.startMinutes,
        endMinutes: interval.endMinutes,
      };
    })
    .filter((item): item is { block: PlannedFocusBlock; startMinutes: number; endMinutes: number } => {
      if (!item) return false;
      return item.endMinutes > 0 && item.startMinutes < plannerDayMinutes;
    });

  if (normalizedBlocks.length === 0) return [];

  const groups: Array<Array<{ block: PlannedFocusBlock; startMinutes: number; endMinutes: number }>> = [];
  let currentGroup: Array<{ block: PlannedFocusBlock; startMinutes: number; endMinutes: number }> = [];
  let currentGroupEnd = -1;

  for (const item of normalizedBlocks) {
    if (currentGroup.length === 0 || item.startMinutes < currentGroupEnd) {
      currentGroup.push(item);
      currentGroupEnd = Math.max(currentGroupEnd, item.endMinutes);
      continue;
    }

    groups.push(currentGroup);
    currentGroup = [item];
    currentGroupEnd = item.endMinutes;
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups.flatMap((group) => {
    const laneEnds: number[] = [];
    const placed = group.map((item) => {
      const laneIndex = laneEnds.findIndex((laneEnd) => laneEnd <= item.startMinutes);
      const lane = laneIndex === -1 ? laneEnds.length : laneIndex;

      laneEnds[lane] = item.endMinutes;
      return { ...item, lane };
    });
    const laneCount = laneEnds.length;

    return placed.map<PlannerTimedBlockLayout>((item) => ({
      block: item.block,
      lane: item.lane,
      laneCount,
      top: getPlannerOffsetFromMinutes(item.startMinutes),
      height: Math.max(
        42,
        getPlannerOffsetFromMinutes(item.endMinutes - item.startMinutes) - 6,
      ),
      startMinutes: item.startMinutes,
      endMinutes: item.endMinutes,
    }));
  });
}

export function getTaskPlanningStatus(
  estimatedMinutes: number | null | undefined,
  plannedMinutes: number,
): PlanningStatus {
  if (plannedMinutes <= 0) {
    return "unplanned";
  }

  if (!estimatedMinutes || estimatedMinutes <= 0) {
    return "fully_planned";
  }

  if (plannedMinutes < estimatedMinutes) {
    return "partially_planned";
  }

  if (plannedMinutes > estimatedMinutes) {
    return "overplanned";
  }

  return "fully_planned";
}

export function getRemainingEstimatedMinutes(
  estimatedMinutes: number | null | undefined,
  plannedMinutes: number,
) {
  if (!estimatedMinutes || estimatedMinutes <= 0) {
    return null;
  }

  return Math.max(estimatedMinutes - plannedMinutes, 0);
}

export function getPlanningStatusLabel(status: PlanningStatus) {
  switch (status) {
    case "partially_planned":
      return "Partially planned";
    case "fully_planned":
      return "Fully planned";
    case "overplanned":
      return "Overplanned";
    default:
      return "Unplanned";
  }
}
