"use client";

import { Badge } from "~/components/ui/badge";
import { getTaskLabelColorClasses } from "~/lib/task-labels";
import type { TaskLabel } from "~/lib/types";
import { cn } from "~/lib/utils";

export function TaskLabelBadge({
    label,
    className,
}: {
    label: Pick<TaskLabel, "color_token" | "name">;
    className?: string;
}) {
    const palette = getTaskLabelColorClasses(label.color_token);

    return (
        <Badge
            variant="outline"
            className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium normal-case tracking-normal",
                palette.border,
                palette.soft,
                palette.text,
                className,
            )}
        >
            {label.name}
        </Badge>
    );
}
