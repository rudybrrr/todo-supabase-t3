"use client";

import Link from "next/link";
import { FolderKanban } from "lucide-react";
import { useState } from "react";

import { AppShell } from "~/components/app-shell";
import { EmptyState, PageHeader, SectionCard } from "~/components/app-primitives";
import { ProjectDialog } from "~/components/project-dialog";
import { ProjectSettingsDialog } from "~/components/project-settings-dialog";
import { Button } from "~/components/ui/button";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { getProjectColorClasses, getProjectIcon } from "~/lib/project-appearance";
import type { TodoList } from "~/lib/types";

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
    const [settingsProject, setSettingsProject] = useState<TodoList | null>(null);

    return (
        <div className="page-container">
            <PageHeader title="Projects" />

            <SectionCard
                title="All projects"
                action={<Button onClick={() => setDialogOpen(true)}>New project</Button>}
            >
                {loading ? (
                    <div className="surface-muted px-4 py-6 text-sm text-muted-foreground">Loading projects...</div>
                ) : orderedProjectSummaries.length > 0 ? (
                    <div className="overflow-hidden rounded-[1.35rem] border border-border/60 bg-card/92">
                        {orderedProjectSummaries.map((summary) => {
                            const palette = getProjectColorClasses(summary.list.color_token);
                            const Icon = getProjectIcon(summary.list.icon_token);

                            return (
                                <div
                                    key={summary.list.id}
                                    className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                                    style={{
                                        boxShadow: `inset 3px 0 0 var(--project-${summary.list.color_token ?? "cobalt"})`,
                                        borderBottom: summary !== orderedProjectSummaries[orderedProjectSummaries.length - 1]
                                            ? "1px solid color-mix(in oklab, var(--border) 60%, transparent)"
                                            : undefined,
                                    }}
                                >
                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                        <Link href={`/projects/${summary.list.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                                            <div className="rounded-xl border border-border/60 bg-muted/85 p-2.5">
                                                <Icon className={`h-5 w-5 ${palette.text}`} />
                                            </div>
                                            <div className="min-w-0">
                                                <h2 className="truncate text-base font-semibold tracking-[-0.03em] text-foreground">
                                                    {summary.list.name}
                                                </h2>
                                                <p className="text-sm text-muted-foreground">
                                                    {summary.list.user_role ?? "owner"}
                                                </p>
                                            </div>
                                        </Link>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                            {summary.incompleteCount} open
                                        </span>
                                        <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                            {summary.dueSoonCount} due soon
                                        </span>
                                        {summary.memberCount > 1 ? (
                                            <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                                {summary.memberCount} members
                                            </span>
                                        ) : null}
                                        {summary.overdueCount > 0 ? (
                                            <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-destructive">
                                                {summary.overdueCount} overdue
                                            </span>
                                        ) : null}
                                        <Button asChild variant="outline" size="sm">
                                            <Link href={`/projects/${summary.list.id}`}>Open</Link>
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSettingsProject(summary.list)}
                                        >
                                            Settings
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
                        action={<Button onClick={() => setDialogOpen(true)}>New project</Button>}
                    />
                )}
            </SectionCard>

            <ProjectDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            {settingsProject ? (
                <ProjectSettingsDialog
                    open={!!settingsProject}
                    onOpenChange={(open) => {
                        if (!open) setSettingsProject(null);
                    }}
                    project={settingsProject}
                    onProjectRemoved={() => setSettingsProject(null)}
                />
            ) : null}
        </div>
    );
}
