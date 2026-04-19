"use client";

import { format, isValid, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { cn } from "~/lib/utils";

interface DatePickerFieldProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    allowClear?: boolean;
    popoverAlign?: "start" | "center" | "end";
    disabled?: boolean;
    className?: string;
}

function getSelectedDate(value: string) {
    if (!value) return undefined;
    const parsed = parseISO(value);
    return isValid(parsed) ? parsed : undefined;
}

export function DatePickerField({
    id,
    value,
    onChange,
    placeholder = "Choose date",
    allowClear = false,
    popoverAlign = "start",
    disabled = false,
    className,
}: DatePickerFieldProps) {
    const [open, setOpen] = useState(false);
    const selectedDate = useMemo(() => getSelectedDate(value), [value]);
    const [displayMonth, setDisplayMonth] = useState<Date>(selectedDate ?? new Date());

    useEffect(() => {
        if (!open) return;
        setDisplayMonth(selectedDate ?? new Date());
    }, [open, selectedDate]);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    id={id}
                    type="button"
                    disabled={disabled}
                    className={cn(
                        "border-input focus-visible:border-ring focus-visible:ring-ring/50 inline-flex h-10 w-full items-center justify-between gap-3 rounded-md border bg-card px-3 text-left text-sm outline-none transition-[color,box-shadow,border-color,background-color] focus-visible:ring-[2px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
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
            <PopoverContent align={popoverAlign} className="w-auto rounded-lg border border-border p-2.5">
                <div className="space-y-3">
                    <Calendar
                        mode="single"
                        selected={selectedDate}
                        month={displayMonth}
                        onMonthChange={setDisplayMonth}
                        onSelect={(date) => {
                            if (!date) return;
                            onChange(format(date, "yyyy-MM-dd"));
                            setOpen(false);
                        }}
                        className="rounded-md bg-transparent p-0"
                        classNames={{
                            month_caption: "flex h-9 items-center justify-center px-10",
                            weekday: "flex-1 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground",
                        }}
                    />
                    <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2.5">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                                onChange(format(new Date(), "yyyy-MM-dd"));
                                setOpen(false);
                            }}
                        >
                            Today
                        </Button>
                        {allowClear ? (
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                    onChange("");
                                    setOpen(false);
                                }}
                            >
                                Clear
                            </Button>
                        ) : null}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}
