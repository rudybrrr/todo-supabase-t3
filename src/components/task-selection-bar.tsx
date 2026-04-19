"use client";

import { motion } from "framer-motion";
import { CalendarDays, Check, ChevronDown, Flag, FolderInput, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";

import { Button } from "~/components/ui/button";
import { TaskDueDateMenu } from "~/components/task-due-date-picker";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
    Popover,
    PopoverContent,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from "~/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import type { TodoList } from "~/lib/types";
import type { TaskPriority } from "~/lib/task-views";

const PRIORITY_OPTIONS: Array<{ label: string; value: TaskPriority | null }> = [
    { label: "High", value: "high" },
    { label: "Medium", value: "medium" },
    { label: "Low", value: "low" },
    { label: "No priority", value: null },
];

export function TaskSelectionBar({
    lists,
    selectedCount,
    totalVisibleCount,
    allVisibleSelected,
    editing = false,
    completing = false,
    deleting = false,
    onCancel,
    onToggleSelectAll,
    onSetDueDate,
    onSetPriority,
    onSetProject,
    onCompleteSelected,
    onDeleteSelected,
    variant = "default",
}: {
    lists: Pick<TodoList, "id" | "name">[];
    selectedCount: number;
    totalVisibleCount: number;
    allVisibleSelected: boolean;
    editing?: boolean;
    completing?: boolean;
    deleting?: boolean;
    onCancel: () => void;
    onToggleSelectAll: () => void;
    onSetDueDate: (value: string | null) => void;
    onSetPriority: (value: TaskPriority | null) => void;
    onSetProject: (listId: string) => void;
    onCompleteSelected: () => void;
    onDeleteSelected: () => void;
    variant?: "default" | "tasks";
}) {
    const [dateOpen, setDateOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const busy = editing || completing || deleting;
    const actionDisabled = selectedCount === 0 || busy;
    const isTasksVariant = variant === "tasks";

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 639px)");
        const syncMobileState = () => setIsMobile(mediaQuery.matches);

        syncMobileState();
        mediaQuery.addEventListener("change", syncMobileState);

        return () => {
            mediaQuery.removeEventListener("change", syncMobileState);
        };
    }, []);

    function renderDateAction(button: ReactElement) {
        if (isMobile) {
            return (
                <>
                    {button}
                    <Sheet open={dateOpen} onOpenChange={setDateOpen}>
                        <SheetContent side="bottom" className="h-[min(90vh,44rem)] rounded-t-2xl border-x-0 border-t border-border bg-background p-0">
                            <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
                                <SheetTitle>Change due date</SheetTitle>
                            </SheetHeader>
                            <div className="max-h-[calc(90vh-4rem)] overflow-y-auto p-3">
                                <TaskDueDateMenu
                                    allowClear
                                    onChange={(nextValue) => {
                                        onSetDueDate(nextValue);
                                        setDateOpen(false);
                                    }}
                                />
                            </div>
                        </SheetContent>
                    </Sheet>
                </>
            );
        }

        return (
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>{button}</PopoverTrigger>
                <PopoverContent align="center" className="w-[20rem] p-3">
                    <PopoverHeader className="pb-2">
                        <PopoverTitle>Change due date</PopoverTitle>
                    </PopoverHeader>

                    <TaskDueDateMenu
                        allowClear
                        onChange={(nextValue) => {
                            onSetDueDate(nextValue);
                            setDateOpen(false);
                        }}
                    />
                </PopoverContent>
            </Popover>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className={isTasksVariant ? "fixed inset-x-4 bottom-4 z-50 flex justify-center" : "fixed inset-x-4 bottom-4 z-50 flex justify-center"}
        >
            <div
                className={
                    isTasksVariant
                        ? "flex w-full max-w-[min(100%,72rem)] flex-col gap-2 rounded-xl border border-border/80 bg-card/96 px-3 py-3 shadow-[0_20px_50px_rgba(15,23,42,0.16)] backdrop-blur supports-[backdrop-filter]:bg-card/90"
                        : "flex w-full max-w-[min(100%,56rem)] items-center gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card/96 px-2 py-2 shadow-[0_24px_48px_rgba(17,18,15,0.18)] backdrop-blur supports-[backdrop-filter]:bg-card/88"
                }
            >
                {isTasksVariant ? (
                    <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    className="shrink-0"
                                    onClick={onCancel}
                                    disabled={busy}
                                >
                                    <X className="h-4 w-4" />
                                    <span className="sr-only">Exit selection mode</span>
                                </Button>

                                <div className="rounded-lg border border-border/70 bg-muted/35 px-3 py-1.5 text-sm font-semibold text-foreground">
                                    {editing ? "Applying bulk changes..." : `${selectedCount} selected`}
                                </div>

                                <p className="text-xs text-muted-foreground">
                                    Select multiple tasks and apply changes in one pass.
                                </p>
                            </div>

                            <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0"
                                onClick={onToggleSelectAll}
                                disabled={totalVisibleCount === 0 || busy}
                            >
                                {allVisibleSelected ? "Deselect all" : "Select all"}
                            </Button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            {renderDateAction(
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0"
                                    disabled={actionDisabled}
                                    onClick={() => setDateOpen(true)}
                                >
                                    <CalendarDays className="h-4 w-4" />
                                    Date
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </Button>,
                            )}

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm" className="shrink-0" disabled={actionDisabled}>
                                        <Flag className="h-4 w-4" />
                                        Priority
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center" className="w-48">
                                    <DropdownMenuLabel>Set priority</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {PRIORITY_OPTIONS.map((option) => (
                                        <DropdownMenuItem
                                            key={option.label}
                                            onSelect={() => onSetPriority(option.value)}
                                        >
                                            {option.label}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="shrink-0"
                                        disabled={actionDisabled || lists.length === 0}
                                    >
                                        <FolderInput className="h-4 w-4" />
                                        Move
                                        <ChevronDown className="h-3.5 w-3.5" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="center" className="w-56">
                                    <DropdownMenuLabel>Move selected tasks</DropdownMenuLabel>
                                    <DropdownMenuSeparator />
                                    {lists.map((list) => (
                                        <DropdownMenuItem
                                            key={list.id}
                                            onSelect={() => onSetProject(list.id)}
                                        >
                                            {list.name}
                                        </DropdownMenuItem>
                                    ))}
                                </DropdownMenuContent>
                            </DropdownMenu>

                            <div className="ml-auto flex flex-wrap items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0"
                                    onClick={onCompleteSelected}
                                    disabled={actionDisabled}
                                >
                                    <Check className="h-4 w-4" />
                                    {completing ? "Completing..." : "Complete"}
                                </Button>

                                <Button
                                    variant="destructive"
                                    size="sm"
                                    className="shrink-0"
                                    onClick={onDeleteSelected}
                                    disabled={actionDisabled}
                                >
                                    <Trash2 className="h-4 w-4" />
                                    {deleting ? "Deleting..." : "Delete"}
                                </Button>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
                        <Button
                            variant="ghost"
                            size="icon-sm"
                            className="shrink-0"
                            onClick={onCancel}
                            disabled={busy}
                        >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Exit selection mode</span>
                        </Button>

                        <div className="shrink-0 px-2 text-sm font-semibold text-foreground">
                            {editing ? "Applying changes..." : `${selectedCount} selected`}
                        </div>

                        <div className="hidden h-5 w-px shrink-0 bg-border sm:block" />

                        <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={onToggleSelectAll}
                            disabled={totalVisibleCount === 0 || busy}
                        >
                            {allVisibleSelected ? "Deselect all" : "Select all"}
                        </Button>

                        {renderDateAction(
                            <Button
                                variant="ghost"
                                size="sm"
                                className="shrink-0"
                                disabled={actionDisabled}
                                onClick={() => setDateOpen(true)}
                            >
                                <CalendarDays className="h-4 w-4" />
                                Date
                                <ChevronDown className="h-3.5 w-3.5" />
                            </Button>,
                        )}

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="shrink-0" disabled={actionDisabled}>
                                    <Flag className="h-4 w-4" />
                                    Priority
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-48">
                                <DropdownMenuLabel>Set priority</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {PRIORITY_OPTIONS.map((option) => (
                                    <DropdownMenuItem
                                        key={option.label}
                                        onSelect={() => onSetPriority(option.value)}
                                    >
                                        {option.label}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="shrink-0"
                                    disabled={actionDisabled || lists.length === 0}
                                >
                                    <FolderInput className="h-4 w-4" />
                                    Move to
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="center" className="w-56">
                                <DropdownMenuLabel>Move selected tasks</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {lists.map((list) => (
                                    <DropdownMenuItem
                                        key={list.id}
                                        onSelect={() => onSetProject(list.id)}
                                    >
                                        {list.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <div className="hidden h-5 w-px shrink-0 bg-border sm:block" />

                        <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0"
                            onClick={onCompleteSelected}
                            disabled={actionDisabled}
                        >
                            <Check className="h-4 w-4" />
                            {completing ? "Completing..." : "Complete"}
                        </Button>

                        <Button
                            variant="ghost"
                            size="sm"
                            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={onDeleteSelected}
                            disabled={actionDisabled}
                        >
                            <Trash2 className="h-4 w-4" />
                            {deleting ? "Deleting..." : "Delete"}
                        </Button>
                    </>
                )}
            </div>
        </motion.div>
    );
}
