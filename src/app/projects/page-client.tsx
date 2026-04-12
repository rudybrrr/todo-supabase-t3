"use client";

import Link from "next/link";
import { AlertTriangle, Clock3, FolderKanban, Plus, Rows3, SlidersHorizontal } from "lucide-react";
import { useState } from "react";

import { AppShell } from "~/components/app-shell";
import { EmptyState, PageHeader } from "~/components/app-primitives";
import { ProjectDialog } from "~/components/project-dialog";
import { Button } from "~/components/ui/button";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { formatProjectScheduledLabel, getProjectScheduledBlockState } from "~/lib/project-summaries";
import { getProjectColorClasses, getProjectIcon } from "~/lib/project-appearance";
import type { TodoList } from "~/lib/types";
import { cn } from "~/lib/utils";

export default function ProjectsClient() {
    return (
        <AppShell>
            <ProjectsContent />
        </AppShell>
    );
}

function ProjectsContent() {
    const { orderedProjectSummaries, loading } = useTaskDataset();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<TodoList | null>(null);

    return (
        <div className="page-container">
            <PageHeader
                title="Projects"
                actions={(
                    <Button size="sm" onClick={() => setDialogOpen(true)}>
                        <Plus className="h-4 w-4" />
                        New
                    </Button>
                )}
            />

            {loading ? (
                <div className="surface-muted px-3 py-4 text-sm text-muted-foreground">Loading projects...</div>
            ) : orderedProjectSummaries.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-border/60 bg-card/92">
                    {orderedProjectSummaries.map((summary, index) => {
                        const palette = getProjectColorClasses(summary.list.color_token);
                        const Icon = getProjectIcon(summary.list.icon_token);
                        const needsCoverageCount = summary.unplannedCount + summary.partiallyPlannedCount;
                        const scheduledLabel = formatProjectScheduledLabel(summary.nextScheduledBlock);
                        const scheduledState = getProjectScheduledBlockState(summary.nextScheduledBlock);
                        const metaParts = [
                            summary.incompleteCount === 0
                                ? "No open tasks"
                                : `${summary.incompleteCount} ${summary.incompleteCount === 1 ? "open task" : "open tasks"}`,
                        ];

                        if (summary.overdueCount > 0) {
                            metaParts.push(`${summary.overdueCount} overdue`);
                        } else if (summary.dueSoonCount > 0) {
                            metaParts.push(`${summary.dueSoonCount} due soon`);
                        }

                        if (summary.memberCount > 1) {
                            metaParts.push(`${summary.memberCount} members`);
                        }

                        return (
                            <div
                                key={summary.list.id}
                                className={cn(
                                    "flex items-start gap-2.5 px-3.5 py-3.5",
                                    index !== orderedProjectSummaries.length - 1 && "border-b border-border/55",
                                )}
                            >
                                <Link href={`/projects/${summary.list.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                                    <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", palette.soft, palette.border)}>
                                        <Icon className={cn("h-4 w-4", palette.text)} />
                                    </span>
                                    <div className="min-w-0">
                                        <h2 className="truncate text-sm font-semibold tracking-[-0.02em] text-foreground">
                                            {summary.list.name}
                                        </h2>
                                        <p className="truncate text-[13px] text-muted-foreground">{metaParts.join(" / ")}</p>
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                            {summary.overdueCount > 0 ? (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/6 px-2 py-1 text-destructive">
                                                    <AlertTriangle className="h-3.5 w-3.5" />
                                                    {summary.overdueCount} overdue
                                                </span>
                                            ) : null}
                                            {needsCoverageCount > 0 ? (
                                                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/6 px-2 py-1 text-amber-700 dark:text-amber-300">
                                                    <Rows3 className="h-3.5 w-3.5" />
                                                    {needsCoverageCount} to plan
                                                </span>
                                            ) : null}
                                            {scheduledLabel ? (
                                                <span className={cn(
                                                    "inline-flex items-center gap-1 rounded-full border px-2 py-1",
                                                    scheduledState === "current"
                                                        ? "border-emerald-500/20 bg-emerald-500/6 text-emerald-700 dark:text-emerald-300"
                                                        : "border-border/70 bg-card text-muted-foreground",
                                                )}>
                                                    <Clock3 className="h-3.5 w-3.5" />
                                                    {scheduledState === "current" ? "In progress" : scheduledLabel}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                </Link>

                                <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[11px] text-muted-foreground">{summary.incompleteCount}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        title={`Manage ${summary.list.name}`}
                                        aria-label={`Manage ${summary.list.name}`}
                                        className="rounded-full text-muted-foreground hover:text-foreground"
                                        onClick={() => setEditingProject(summary.list)}
                                    >
                                        <SlidersHorizontal className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <EmptyState
                    title="No projects"
                    description="Create a project to start organizing work."
                    icon={<FolderKanban className="h-8 w-8" />}
                    action={(
                        <Button size="sm" onClick={() => setDialogOpen(true)}>
                            <Plus className="h-4 w-4" />
                            New
                        </Button>
                    )}
                />
            )}

            <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            {editingProject ? (
                <ProjectDialog
                    open={!!editingProject}
                    onOpenChange={(open) => {
                        if (!open) setEditingProject(null);
                    }}
                    initialProject={editingProject}
                    onRemoved={() => setEditingProject(null)}
                />
            ) : null}
        </div>
    );
}
