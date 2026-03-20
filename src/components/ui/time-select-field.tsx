"use client";

import { format } from "date-fns";
import { useMemo } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";

interface TimeSelectFieldProps {
    id?: string;
    value: string;
    onChange: (value: string) => void;
    stepMinutes?: number;
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
}: TimeSelectFieldProps) {
    const options = useMemo(() => buildTimeOptions(stepMinutes), [stepMinutes]);

    return (
        <Select value={value} onValueChange={onChange}>
            <SelectTrigger id={id} className="font-mono">
                <SelectValue placeholder="Choose time" />
            </SelectTrigger>
            <SelectContent className="max-h-80">
                {options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                        {option.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
