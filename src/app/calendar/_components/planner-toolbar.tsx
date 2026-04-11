"use client";

import { ChevronLeft, ChevronRight, SlidersHorizontal } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import {
  getPlannerDeadlineScopeLabel,
  getPlannerPlanningStatusFilterLabel,
  PLANNER_DEADLINE_SCOPE_OPTIONS,
  PLANNER_PLANNING_STATUS_FILTER_OPTIONS,
  type PlannerDeadlineScope,
  type PlannerPlanningStatusFilter,
} from "~/lib/planner-filters";
import type { TodoList } from "~/lib/types";
import { cn } from "~/lib/utils";

import type { PlannerView } from "~/lib/planning";

export function PlannerToolbar({
  lists,
  activeSavedFilterName = null,
  canDeleteActiveFilter = false,
  canUpdateActiveFilter = false,
  plannerRangeLabel,
  deadlineScope,
  planningStatusFilter,
  saveFilterName,
  selectedListId,
  selectedScopeLabel,
  showSidebarTrigger = false,
  sidebarButtonLabel = "Details",
  savingFilter = false,
  view,
  onChangeSaveFilterName,
  onClearFilters,
  onDeleteActiveFilter,
  onGoToToday,
  onOpenSidebar,
  onSaveCurrentFilter,
  onSelectList,
  onSetDeadlineScope,
  onSetPlanningStatusFilter,
  onSetView,
  onShiftPeriod,
  onUpdateActiveFilter,
}: {
  lists: TodoList[];
  activeSavedFilterName?: string | null;
  canDeleteActiveFilter?: boolean;
  canUpdateActiveFilter?: boolean;
  plannerRangeLabel: string;
  deadlineScope: PlannerDeadlineScope;
  planningStatusFilter: PlannerPlanningStatusFilter;
  saveFilterName: string;
  selectedListId: string;
  selectedScopeLabel: string;
  showSidebarTrigger?: boolean;
  sidebarButtonLabel?: string;
  savingFilter?: boolean;
  view: PlannerView;
  onChangeSaveFilterName: (value: string) => void;
  onClearFilters: () => void;
  onDeleteActiveFilter?: () => void;
  onGoToToday: () => void;
  onOpenSidebar?: () => void;
  onSaveCurrentFilter: () => void;
  onSelectList: (value: string) => void;
  onSetDeadlineScope: (value: PlannerDeadlineScope) => void;
  onSetPlanningStatusFilter: (value: PlannerPlanningStatusFilter) => void;
  onSetView: (view: PlannerView) => void;
  onShiftPeriod: (direction: -1 | 1) => void;
  onUpdateActiveFilter?: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-lg border border-border/70 bg-card/96 p-0.5">
          <Button variant="ghost" size="icon-sm" className="rounded-lg" onClick={() => onShiftPeriod(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-32 px-2 text-center text-sm font-semibold tracking-[-0.01em] text-foreground">
            {plannerRangeLabel}
          </div>
          <Button variant="ghost" size="icon-sm" className="rounded-lg" onClick={() => onShiftPeriod(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button variant="outline" size="sm" onClick={onGoToToday}>
          Today
        </Button>

        <div className="inline-flex items-center rounded-full border border-border/70 bg-card/96 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {selectedScopeLabel}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {showSidebarTrigger && onOpenSidebar ? (
          <Button variant="outline" size="sm" onClick={onOpenSidebar}>
            {sidebarButtonLabel}
          </Button>
        ) : null}

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon-sm" className="rounded-lg">
              <SlidersHorizontal className="h-4 w-4" />
              <span className="sr-only">Open planner controls</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 rounded-xl p-3">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    Saved filter
                  </p>
                  {activeSavedFilterName ? (
                    <span className="text-[11px] text-muted-foreground">
                      {activeSavedFilterName}
                    </span>
                  ) : null}
                </div>

                <Input
                  value={saveFilterName}
                  onChange={(event) => onChangeSaveFilterName(event.target.value)}
                  placeholder="Exam prep queue"
                  className="h-10 rounded-lg bg-card/96"
                />

                <div className="flex flex-wrap gap-2">
                  <Button size="xs" variant="outline" onClick={onSaveCurrentFilter} disabled={savingFilter}>
                    Save current
                  </Button>
                  {canUpdateActiveFilter && onUpdateActiveFilter ? (
                    <Button size="xs" variant="tonal" onClick={onUpdateActiveFilter} disabled={savingFilter}>
                      Update
                    </Button>
                  ) : null}
                  {canDeleteActiveFilter && onDeleteActiveFilter ? (
                    <Button size="xs" variant="ghost" onClick={onDeleteActiveFilter} disabled={savingFilter}>
                      Delete
                    </Button>
                  ) : null}
                  <Button size="xs" variant="ghost" onClick={onClearFilters}>
                    Clear to all
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Project filter
                </p>
                <Select value={selectedListId} onValueChange={onSelectList}>
                  <SelectTrigger className="h-10 rounded-lg bg-card/96 text-sm">
                    <SelectValue placeholder="All projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All projects</SelectItem>
                    {lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Planning status
                </p>
                <Select value={planningStatusFilter} onValueChange={(value) => onSetPlanningStatusFilter(value as PlannerPlanningStatusFilter)}>
                  <SelectTrigger className="h-10 rounded-lg bg-card/96 text-sm">
                    <SelectValue placeholder={getPlannerPlanningStatusFilterLabel(planningStatusFilter)} />
                  </SelectTrigger>
                  <SelectContent>
                    {PLANNER_PLANNING_STATUS_FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Deadline scope
                </p>
                <Select value={deadlineScope} onValueChange={(value) => onSetDeadlineScope(value as PlannerDeadlineScope)}>
                  <SelectTrigger className="h-10 rounded-lg bg-card/96 text-sm">
                    <SelectValue placeholder={getPlannerDeadlineScopeLabel(deadlineScope)} />
                  </SelectTrigger>
                  <SelectContent>
                    {PLANNER_DEADLINE_SCOPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  View
                </p>
                <div className="inline-flex w-full rounded-lg border border-border/70 bg-card/96 p-0.5">
                  {(["day", "week", "month"] as const).map((nextView) => (
                    <button
                      key={nextView}
                      type="button"
                      onClick={() => onSetView(nextView)}
                      className={cn(
                        "flex-1 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors",
                        view === nextView
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {nextView === "day" ? "Day" : nextView === "week" ? "Week" : "Month"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
