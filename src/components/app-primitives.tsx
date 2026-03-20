"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { cn } from "~/lib/utils";

export function PageHeader({
    eyebrow,
    title,
    description,
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
                <div className="space-y-1.5">
                    <h1 className="text-balance text-2xl font-semibold tracking-[-0.04em] text-foreground sm:text-3xl">
                        {title}
                    </h1>
                    {description ? (
                        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
    );
}

export function SectionCard({
    title,
    description,
    action,
    className,
    children,
}: {
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
    children: ReactNode;
}) {
    return (
        <Card className={cn("overflow-hidden", className)}>
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <CardTitle className="text-[17px] font-semibold tracking-[-0.02em]">{title}</CardTitle>
                        {description ? <CardDescription>{description}</CardDescription> : null}
                    </div>
                    {action ? <div className="shrink-0">{action}</div> : null}
                </div>
            </CardHeader>
            <CardContent className="pt-2">{children}</CardContent>
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
        <div className={cn("surface-card flex min-h-24 flex-col justify-between p-4", className)}>
            <p className="eyebrow">{label}</p>
            <div className="space-y-0.5">
                <p className="font-mono text-2xl font-semibold tracking-[-0.05em] text-foreground">{value}</p>
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
        <div className="surface-card flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
            {icon ? <div className="rounded-2xl bg-secondary/80 p-4 text-primary">{icon}</div> : null}
            <div className="space-y-2">
                <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">{title}</h3>
                <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
            {action ? <div className="pt-2">{action}</div> : null}
        </div>
    );
}
