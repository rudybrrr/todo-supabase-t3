import type { PlannerView } from "~/lib/planning";

export interface BlockFormState {
  id: string | null;
  title: string;
  listId: string;
  todoId: string | null;
  date: string;
  startTime: string;
  durationMinutes: string;
}

export interface PlannerDaySummary {
  dueCount: number;
  blockCount: number;
  plannedMinutes: number;
}

export interface BlockDialogPrefillOptions {
  date?: Date;
  startTime?: string;
  durationMinutes?: number;
  view?: PlannerView;
}
