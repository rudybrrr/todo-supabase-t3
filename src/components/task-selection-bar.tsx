"use client";

import { Check, PencilLine, Trash2, X } from "lucide-react";

import { Button } from "~/components/ui/button";

export function TaskSelectionBar({
    selectedCount,
    totalVisibleCount,
    allVisibleSelected,
    editing = false,
    completing = false,
    deleting = false,
    onToggleSelectAll,
    onClearSelection,
    onEditSelected,
    onCompleteSelected,
    onDeleteSelected,
}: {
    selectedCount: number;
    totalVisibleCount: number;
    allVisibleSelected: boolean;
    editing?: boolean;
    completing?: boolean;
    deleting?: boolean;
    onToggleSelectAll: () => void;
    onClearSelection: () => void;
    onEditSelected: () => void;
    onCompleteSelected: () => void;
    onDeleteSelected: () => void;
}) {
    const busy = editing || completing || deleting;

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-[1.25rem] border border-border/70 bg-card/92 px-3 py-3">
            <p className="mr-auto text-sm font-semibold text-foreground">
                {selectedCount} selected
            </p>
            <Button
                variant="ghost"
                size="sm"
                onClick={onToggleSelectAll}
                disabled={totalVisibleCount === 0 || busy}
            >
                {allVisibleSelected ? "Deselect all" : "Select all"}
            </Button>
            <Button
                variant="ghost"
                size="sm"
                onClick={onClearSelection}
                disabled={selectedCount === 0 || busy}
            >
                <X className="h-4 w-4" />
                Clear
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={onEditSelected}
                disabled={selectedCount === 0 || busy}
            >
                <PencilLine className="h-4 w-4" />
                {editing ? "Applying..." : "Edit"}
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={onCompleteSelected}
                disabled={selectedCount === 0 || busy}
            >
                <Check className="h-4 w-4" />
                {completing ? "Completing..." : "Complete"}
            </Button>
            <Button
                variant="destructive"
                size="sm"
                onClick={onDeleteSelected}
                disabled={selectedCount === 0 || busy}
            >
                <Trash2 className="h-4 w-4" />
                {deleting ? "Deleting..." : "Delete"}
            </Button>
        </div>
    );
}
