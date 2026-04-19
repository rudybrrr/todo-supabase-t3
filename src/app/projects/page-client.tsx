"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight, Clock3, FolderKanban, Plus, Rows3, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell } from "~/components/app-shell";
import { EmptyState, MetricTile, PageHeader } from "~/components/app-primitives";
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

    const projectCounts = useMemo(() => {
        const activeProjects = orderedProjectSummaries.filter((summary) => summary.incompleteCount > 0).length;
        const urgentProjects = orderedProjectSummaries.filter((summary) => summary.overdueCount > 0 || summary.dueSoonCount > 0).length;
        const scheduledProjects = orderedProjectSummaries.filter((summary) => summary.nextScheduledBlock).length;

        return {
            totalProjects: orderedProjectSummaries.length,
            activeProjects,
            urgentProjects,
            scheduledProjects,
        };
    }, [orderedProjectSummaries]);

    return (
        <div className="page-container">
            <PageHeader
                eyebrow="Projects"
                title="Project index"
                description="Track active workspaces, urgency, and scheduled coverage from one neutral status surface."
                actions={(
                    <Button size="sm" onClick={() => setDialogOpen(true)}>
                        <Plus className="h-4 w-4" />
                        New project
                    </Button>
                )}
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                    label="Projects"
                    value={`${projectCounts.totalProjects}`}
                    meta="Tracked workspaces"
                />
                <MetricTile
                    label="Active"
                    value={`${projectCounts.activeProjects}`}
                    meta="With open tasks"
                />
                <MetricTile
                    label="Urgent"
                    value={`${projectCounts.urgentProjects}`}
                    meta="Overdue or due soon"
                    className={projectCounts.urgentProjects > 0 ? "border-destructive/20 bg-destructive/6" : undefined}
                />
                <MetricTile
                    label="Scheduled"
                    value={`${projectCounts.scheduledProjects}`}
                    meta="Have planned blocks"
                />
            </div>

            {loading ? (
                <div className="surface-muted px-3 py-4 text-sm text-muted-foreground">Loading projects...</div>
            ) : orderedProjectSummaries.length > 0 ? (
                <div className="surface-card overflow-hidden">
                    {orderedProjectSummaries.map((summary, index) => (
                        <ProjectRow
                            key={summary.list.id}
                            summary={summary}
                            isLast={index === orderedProjectSummaries.length - 1}
                            onManage={() => setEditingProject(summary.list)}
                        />
                    ))}
                </div>
            ) : (
                <EmptyState
                    title="No projects"
                    description="Create a project to start organizing work."
                    icon={<FolderKanban className="h-8 w-8" />}
                    action={(
                        <Button size="sm" onClick={() => setDialogOpen(true)}>
                            <Plus className="h-4 w-4" />
                            New project
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

function ProjectRow({
    summary,
    isLast,
    onManage,
}: {
    summary: {
        list: TodoList;
        incompleteCount: number;
        overdueCount: number;
        dueSoonCount: number;
        memberCount: number;
        unplannedCount: number;
        partiallyPlannedCount: number;
        nextScheduledBlock: Parameters<typeof formatProjectScheduledLabel>[0];
    };
    isLast: boolean;
    onManage: () => void;
}) {
    const palette = getProjectColorClasses(summary.list.color_token);
    const Icon = getProjectIcon(summary.list.icon_token);
    const needsCoverageCount = summary.unplannedCount + summary.partiallyPlannedCount;
    const scheduledLabel = formatProjectScheduledLabel(summary.nextScheduledBlock);
    const scheduledState = getProjectScheduledBlockState(summary.nextScheduledBlock);

    const metaItems = [
        summary.incompleteCount === 0
            ? "No open tasks"
            : `${summary.incompleteCount} ${summary.incompleteCount === 1 ? "open task" : "open tasks"}`,
    ];

    if (summary.overdueCount > 0) {
        metaItems.push(`${summary.overdueCount} overdue`);
    } else if (summary.dueSoonCount > 0) {
        metaItems.push(`${summary.dueSoonCount} due soon`);
    }

    if (summary.memberCount > 1) {
        metaItems.push(`${summary.memberCount} members`);
    }

    return (
        <div className={cn("group flex flex-col gap-3 px-4 py-4 transition-colors sm:flex-row sm:items-center sm:gap-4", !isLast && "border-b border-border/70")}>
            <Link href={`/projects/${summary.list.id}`} className="flex min-w-0 flex-1 items-start gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60">
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md border", palette.soft, palette.border)}>
                    <Icon className={cn("h-4 w-4", palette.text)} />
                </span>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold tracking-[-0.02em] text-foreground sm:text-[0.95rem]">
                            {summary.list.name}
                        </h2>
                        {summary.overdueCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-destructive/20 bg-destructive/8 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                {summary.overdueCount} overdue
                            </span>
                        ) : null}
                        {needsCoverageCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/8 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                <Rows3 className="h-3.5 w-3.5" />
                                {needsCoverageCount} to plan
                            </span>
                        ) : null}
                        {scheduledLabel ? (
                            <span
                                className={cn(
                                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                                    scheduledState === "current"
                                        ? "border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300"
                                        : "border-border/70 bg-muted/50 text-muted-foreground",
                                )}
                            >
                                <Clock3 className="h-3.5 w-3.5" />
                                {scheduledState === "current" ? "In progress" : scheduledLabel}
                            </span>
                        ) : null}
                    </div>

                    <p className="mt-1 truncate text-sm text-muted-foreground">
                        {metaItems.join(" / ")}
                    </p>
                </div>
            </Link>

            <div className="flex items-center gap-2 self-start sm:self-center">
                <span className="rounded-full border border-border/70 bg-muted/45 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                    {summary.incompleteCount}
                </span>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    title={`Manage ${summary.list.name}`}
                    aria-label={`Manage ${summary.list.name}`}
                    className="rounded-full text-muted-foreground hover:text-foreground"
                    onClick={onManage}
                >
                    <SlidersHorizontal className="h-4 w-4" />
                </Button>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
            </div>
        </div>
    );
}
