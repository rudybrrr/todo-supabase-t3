"use client";

import { TaskLabelBadge } from "~/components/task-label-badge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
    getPlannerDeadlineScopeLabel,
    getPlannerPlanningStatusFilterLabel,
} from "~/lib/planner-filters";
import {
    getTaskPriorityFilterLabel,
    type TaskViewFilterState,
} from "~/lib/task-filters";
import type { TaskLabel, TaskSavedViewRow, TodoList } from "~/lib/types";

export function TaskSavedViewBar({
    activeSavedViewId,
    activeSavedViewStateApplied,
    currentFilterState,
    labelMap,
    listMap,
    savedViews,
    onApplySavedView,
    onClearFilters,
}: {
    activeSavedViewId: string | null;
    activeSavedViewStateApplied: boolean;
    currentFilterState: TaskViewFilterState;
    labelMap: Map<string, TaskLabel>;
    listMap: Map<string, TodoList>;
    savedViews: TaskSavedViewRow[];
    onApplySavedView: (viewId: string) => void;
    onClearFilters: () => void;
}) {
    const hasTaskFilters = currentFilterState.listId !== "all"
        || currentFilterState.priorityFilter !== "all"
        || currentFilterState.planningStatusFilter !== "all"
        || currentFilterState.deadlineScope !== "all"
        || currentFilterState.labelIds.length > 0;
    const activeSavedView = activeSavedViewId
        ? savedViews.find((view) => view.id === activeSavedViewId) ?? null
        : null;

    if (savedViews.length === 0 && !hasTaskFilters && !activeSavedView) {
        return null;
    }

    return (
        <div className="space-y-2">
            {savedViews.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                    {savedViews.map((view) => {
                        const active = activeSavedViewId === view.id && activeSavedViewStateApplied;

                        return (
                            <Button
                                key={view.id}
                                type="button"
                                size="xs"
                                variant={active ? "tonal" : "outline"}
                                onClick={() => onApplySavedView(view.id)}
                            >
                                {view.name}
                            </Button>
                        );
                    })}
                </div>
            ) : null}

            {(hasTaskFilters || activeSavedView) ? (
                <div className="flex flex-wrap items-center gap-2">
                    {activeSavedView ? (
                        <Badge variant="secondary">
                            {activeSavedView.name}
                        </Badge>
                    ) : null}
                    {currentFilterState.listId !== "all" ? (
                        <Badge variant="outline">
                            {listMap.get(currentFilterState.listId)?.name ?? "Project"}
                        </Badge>
                    ) : null}
                    {currentFilterState.priorityFilter !== "all" ? (
                        <Badge variant="outline">
                            {getTaskPriorityFilterLabel(currentFilterState.priorityFilter)}
                        </Badge>
                    ) : null}
                    {currentFilterState.planningStatusFilter !== "all" ? (
                        <Badge variant="outline">
                            {getPlannerPlanningStatusFilterLabel(currentFilterState.planningStatusFilter)}
                        </Badge>
                    ) : null}
                    {currentFilterState.deadlineScope !== "all" ? (
                        <Badge variant="outline">
                            {getPlannerDeadlineScopeLabel(currentFilterState.deadlineScope)}
                        </Badge>
                    ) : null}
                    {currentFilterState.labelIds.map((labelId) => {
                        const label = labelMap.get(labelId);
                        if (!label) return null;

                        return (
                            <TaskLabelBadge key={labelId} label={label} />
                        );
                    })}
                    <Button type="button" size="xs" variant="ghost" onClick={onClearFilters}>
                        Clear filters
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
