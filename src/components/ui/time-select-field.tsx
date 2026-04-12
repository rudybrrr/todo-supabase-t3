"use client";

import { format } from "date-fns";
import { useMemo } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

interface TimeSelectFieldProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    stepMinutes?: number;
    allowClear?: boolean;
    clearLabel?: string;
    className?: string;
    placeholder?: string;
}

function buildTimeOptions(stepMinutes: number) {
    const options: Array<{ value: string; label: string }> = [];

    for (let minutes = 0; minutes < 24 * 60; minutes += stepMinutes) {
        const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
        const mins = String(minutes % 60).padStart(2, "0");
        const value = `${hours}:${mins}`;
        const previewDate = new Date(2026, 0, 1, Number(hours), Number(mins));

        options.push({
            value,
            label: format(previewDate, "h:mm a"),
        });
    }

    return options;
}

export function TimeSelectField({
    id,
    value,
    onChange,
    stepMinutes = 15,
    allowClear = false,
    clearLabel = "No time",
    className,
    placeholder = "Choose time",
}: TimeSelectFieldProps) {
    const options = useMemo(() => buildTimeOptions(stepMinutes), [stepMinutes]);
    const selectValue = value || "none";

    return (
        <Select value={selectValue} onValueChange={(nextValue) => onChange(nextValue === "none" ? "" : nextValue)}>
            <SelectTrigger id={id} className={className ?? "font-mono"}>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent className="max-h-80">
                {allowClear ? (
                    <SelectItem value="none">
                        {clearLabel}
                    </SelectItem>
                ) : null}
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
