"use client";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
    getPlannerDeadlineScopeLabel,
    getPlannerPlanningStatusFilterLabel,
    type PlannerFilterState,
    type PlannerSavedFilterRow,
} from "~/lib/planner-filters";
import type { TodoList } from "~/lib/types";

export function PlannerFilterBar({
    activeSavedFilterId,
    activeSavedFilterScopeApplied,
    currentFilterState,
    listMap,
    savedFilters,
    onApplySavedFilter,
    onClearFilters,
}: {
    activeSavedFilterId: string | null;
    activeSavedFilterScopeApplied: boolean;
    currentFilterState: PlannerFilterState;
    listMap: Map<string, TodoList>;
    savedFilters: PlannerSavedFilterRow[];
    onApplySavedFilter: (filterId: string) => void;
    onClearFilters: () => void;
}) {
    const hasTaskFilters = currentFilterState.listId !== "all"
        || currentFilterState.planningStatusFilter !== "all"
        || currentFilterState.deadlineScope !== "all";
    const activeSavedFilter = activeSavedFilterId
        ? savedFilters.find((filter) => filter.id === activeSavedFilterId) ?? null
        : null;

    if (savedFilters.length === 0 && !hasTaskFilters && !activeSavedFilter) {
        return null;
    }

    return (
        <div className="rounded-lg border border-border/70 bg-card/90 px-3 py-2.5">
            {savedFilters.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                        Saved views
                    </span>
                    {savedFilters.map((filter) => {
                        const active = activeSavedFilterId === filter.id && activeSavedFilterScopeApplied;

                        return (
                            <Button
                                key={filter.id}
                                type="button"
                                size="xs"
                                variant={active ? "tonal" : "outline"}
                                onClick={() => onApplySavedFilter(filter.id)}
                            >
                                {filter.name}
                            </Button>
                        );
                    })}
                </div>
            ) : null}

            {(hasTaskFilters || activeSavedFilter) ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-medium text-muted-foreground">
                        Active
                    </span>
                    {activeSavedFilter ? (
                        <Badge variant="secondary" className="rounded-full">
                            {activeSavedFilter.name}
                        </Badge>
                    ) : null}
                    {currentFilterState.listId !== "all" ? (
                        <Badge variant="outline" className="rounded-full">
                            {listMap.get(currentFilterState.listId)?.name ?? "Project"}
                        </Badge>
                    ) : null}
                    {currentFilterState.planningStatusFilter !== "all" ? (
                        <Badge variant="outline" className="rounded-full">
                            {getPlannerPlanningStatusFilterLabel(currentFilterState.planningStatusFilter)}
                        </Badge>
                    ) : null}
                    {currentFilterState.deadlineScope !== "all" ? (
                        <Badge variant="outline" className="rounded-full">
                            {getPlannerDeadlineScopeLabel(currentFilterState.deadlineScope)}
                        </Badge>
                    ) : null}
                    <Button type="button" size="xs" variant="ghost" onClick={onClearFilters}>
                        Clear filters
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
