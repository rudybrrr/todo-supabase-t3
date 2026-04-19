"use client";

import { addDays, format, isValid, parseISO } from "date-fns";
import { CalendarDays, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { cn } from "~/lib/utils";

type PopoverAlign = "start" | "center" | "end";

interface TaskDueDateMenuProps {
    value?: string | null;
    onChange: (value: string) => void;
    allowClear?: boolean;
    onClose?: () => void;
}

interface TaskDueDatePickerProps {
    id?: string;
    value?: string | null;
    onChange: (value: string) => void;
    placeholder?: string;
    allowClear?: boolean;
    disabled?: boolean;
    popoverAlign?: PopoverAlign;
    className?: string;
}

function getSelectedDate(value?: string | null) {
    if (!value) return undefined;
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : undefined;
}

export function TaskDueDateMenu({
    value = null,
    onChange,
    allowClear = false,
    onClose,
}: TaskDueDateMenuProps) {
    const selectedDate = useMemo(() => getSelectedDate(value), [value]);
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [displayMonth, setDisplayMonth] = useState<Date>(selectedDate ?? new Date());
    const currentValue = value ?? "";
    const presets = useMemo(() => {
        const today = new Date();
        const tomorrow = addDays(today, 1);
        const nextWeek = addDays(today, 7);

        return [
            {
                label: "Today",
                caption: format(today, "EEE, MMM d"),
                value: format(today, "yyyy-MM-dd"),
            },
            {
                label: "Tomorrow",
                caption: format(tomorrow, "EEE, MMM d"),
                value: format(tomorrow, "yyyy-MM-dd"),
            },
            {
                label: "Next week",
                caption: format(nextWeek, "EEE, MMM d"),
                value: format(nextWeek, "yyyy-MM-dd"),
            },
            ...(allowClear
                ? [{ label: "No date", caption: "Clear due date", value: "" }]
                : []),
        ];
    }, [allowClear]);

    useEffect(() => {
        if (!calendarOpen) return;
        setDisplayMonth(selectedDate ?? new Date());
    }, [calendarOpen, selectedDate]);

    function openCalendar() {
        setCalendarOpen((current) => !current);
    }

    function apply(nextValue: string) {
        onChange(nextValue);
        setCalendarOpen(false);
        onClose?.();
    }

    function renderCalendar() {
        return (
            <Calendar
                mode="single"
                selected={selectedDate}
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                onSelect={(date) => {
                    if (!date) return;
                    apply(format(date, "yyyy-MM-dd"));
                }}
                className="rounded-lg bg-transparent p-0 [--cell-size:2.55rem]"
                classNames={{
                    month_caption: "flex h-9 items-center justify-center px-10 text-sm",
                    weekday: "flex-1 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground",
                    week: "mt-1 flex w-full",
                    day: "group/day relative aspect-square flex-1 p-0.5 text-center select-none",
                }}
            />
        );
    }

    return (
        <div
            className="w-full min-w-0"
            onBlurCapture={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
                setCalendarOpen(false);
            }}
        >
            <div className="space-y-1">
                {presets.map((option) => {
                    const active = currentValue === option.value;

                    return (
                        <button
                            key={option.label}
                            type="button"
                            onClick={() => apply(option.value)}
                            className={cn(
                                "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors",
                                active
                                    ? "bg-accent text-accent-foreground"
                                    : "text-foreground hover:bg-secondary",
                            )}
                        >
                            <div className="min-w-0">
                                <div className="text-sm font-medium">{option.label}</div>
                                <div className="text-xs text-muted-foreground">{option.caption}</div>
                            </div>
                            {active ? (
                                <span className="h-2 w-2 rounded-full bg-primary" />
                            ) : null}
                        </button>
                    );
                })}

                <div
                    className="relative"
                >
                    <button
                        type="button"
                        onClick={openCalendar}
                        aria-expanded={calendarOpen}
                        className={cn(
                            "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors",
                            calendarOpen
                                ? "bg-accent text-accent-foreground"
                                : "text-foreground hover:bg-secondary",
                        )}
                    >
                        <div>
                            <div className="text-sm font-medium">Pick date...</div>
                        </div>
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {calendarOpen ? (
                <div className="mt-2 rounded-xl border border-border bg-popover p-2.5 text-popover-foreground shadow-[0_18px_36px_rgba(17,18,15,0.16)]">
                    {renderCalendar()}
                </div>
            ) : null}
        </div>
    );
}

export function TaskDueDatePicker({
    id,
    value = "",
    onChange,
    placeholder = "Choose date",
    allowClear = false,
    disabled = false,
    popoverAlign = "start",
    className,
}: TaskDueDatePickerProps) {
    const [open, setOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const selectedDate = useMemo(() => getSelectedDate(value), [value]);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(max-width: 639px)");
        const syncMobileState = () => setIsMobile(mediaQuery.matches);

        syncMobileState();
        mediaQuery.addEventListener("change", syncMobileState);

        return () => {
            mediaQuery.removeEventListener("change", syncMobileState);
        };
    }, []);

    if (isMobile) {
        return (
            <Sheet open={open} onOpenChange={setOpen}>
                <div className="px-0">
                    <button
                        id={id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setOpen(true)}
                        className={cn(
                            "border-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-11 w-full items-center justify-between gap-3 rounded-lg border bg-card px-3.5 text-left text-sm outline-none transition-[color,box-shadow,border-color,background-color] focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                            className,
                        )}
                    >
                        <span className="inline-flex min-w-0 items-center gap-2">
                            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className={cn("truncate", selectedDate ? "text-foreground" : "text-muted-foreground")}>
                                {selectedDate ? format(selectedDate, "dd MMM yyyy") : placeholder}
                            </span>
                        </span>
                    </button>
                </div>
                <SheetContent side="bottom" className="h-[min(90vh,44rem)] rounded-t-2xl border-x-0 border-t border-border bg-background p-0">
                    <SheetHeader className="border-b border-border/60 px-4 py-3 text-left">
                        <SheetTitle>Change due date</SheetTitle>
                    </SheetHeader>
                    <div className="max-h-[calc(90vh-4rem)] overflow-y-auto p-3">
                        <TaskDueDateMenu value={value} onChange={onChange} allowClear={allowClear} onClose={() => setOpen(false)} />
                    </div>
                </SheetContent>
            </Sheet>
        );
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    id={id}
                    type="button"
                    disabled={disabled}
                    className={cn(
                        "border-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-11 w-full items-center justify-between gap-3 rounded-lg border bg-card px-3.5 text-left text-sm outline-none transition-[color,box-shadow,border-color,background-color] focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
                        className,
                    )}
                >
                    <span className="inline-flex min-w-0 items-center gap-2">
                        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className={cn("truncate", selectedDate ? "text-foreground" : "text-muted-foreground")}>
                            {selectedDate ? format(selectedDate, "dd MMM yyyy") : placeholder}
                        </span>
                    </span>
                </button>
            </PopoverTrigger>
            <PopoverContent align={popoverAlign} className="w-[min(22rem,calc(100vw-1rem))] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-border p-2.5">
                <TaskDueDateMenu value={value} onChange={onChange} allowClear={allowClear} onClose={() => setOpen(false)} />
            </PopoverContent>
        </Popover>
    );
}
