"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";

export function PageHeader({
    eyebrow,
    title,
    actions,
}: {
    eyebrow?: string;
    title: string;
    description?: string;
    actions?: ReactNode;
}) {
    return (
        <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl space-y-1.5">
                {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
                <h1 className="text-balance text-[1.75rem] font-semibold tracking-[-0.03em] text-foreground sm:text-[2rem]">
                    {title}
                </h1>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
    );
}

export function SectionCard({
    title,
    action,
    className,
    dense,
    children,
}: {
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
    dense?: boolean;
    children: ReactNode;
}) {
    return (
        <Card className={cn("overflow-hidden", className)}>
            <CardHeader className={cn("border-b border-border/70", dense ? "px-3 py-2.5" : "px-4 py-3")}>
                <div className="flex items-start justify-between gap-3">
                    <CardTitle className={cn("font-semibold tracking-[-0.02em]", dense ? "text-[0.95rem]" : "text-[0.98rem]")}>{title}</CardTitle>
                    {action ? <div className="shrink-0">{action}</div> : null}
                </div>
            </CardHeader>
            <CardContent className={dense ? "px-3 py-3" : "px-4 py-4"}>{children}</CardContent>
        </Card>
    );
}

export function MetricTile({
    label,
    value,
    meta,
    className,
}: {
    label: string;
    value: string;
    meta?: string;
    className?: string;
}) {
    return (
        <div className={cn("surface-card flex min-h-20 flex-col justify-between p-3", className)}>
            <p className="eyebrow">{label}</p>
            <div className="space-y-0.5">
                <p className="font-mono text-[1.35rem] font-semibold tracking-[-0.04em] text-foreground">{value}</p>
                {meta ? <p className="text-xs text-muted-foreground">{meta}</p> : null}
            </div>
        </div>
    );
}

export function EmptyState({
    title,
    description,
    icon,
    action,
}: {
    title: string;
    description: string;
    icon?: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div className="surface-muted flex min-h-44 flex-col items-center justify-center gap-3 p-5 text-center">
            {icon ? <div className="rounded-md border border-border bg-background p-2.5 text-primary">{icon}</div> : null}
            <div className="space-y-1.5">
                <h3 className="text-[0.98rem] font-semibold tracking-[-0.03em] text-foreground">{title}</h3>
                <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
            {action ? <div className="pt-1">{action}</div> : null}
        </div>
    );
}
