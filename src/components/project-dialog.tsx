"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useData } from "~/components/data-provider";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { createProject, updateProject } from "~/lib/project-actions";
import {
    getProjectColorClasses,
    getProjectIcon,
    PROJECT_COLOR_TOKENS,
    PROJECT_ICON_TOKENS,
} from "~/lib/project-appearance";
import type { TodoList } from "~/lib/types";

export function ProjectDialog({
    open,
    onOpenChange,
    initialProject,
    onSaved,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialProject?: TodoList | null;
    onSaved?: (projectId: string) => void;
}) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { userId, refreshData } = useData();
    const [name, setName] = useState("");
    const [colorToken, setColorToken] = useState<(typeof PROJECT_COLOR_TOKENS)[number]>("cobalt");
    const [iconToken, setIconToken] = useState<(typeof PROJECT_ICON_TOKENS)[number]>("book-open");
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setName(initialProject?.name ?? "");
        setColorToken((initialProject?.color_token as typeof PROJECT_COLOR_TOKENS[number]) ?? "cobalt");
        setIconToken((initialProject?.icon_token as typeof PROJECT_ICON_TOKENS[number]) ?? "book-open");
    }, [initialProject, open]);

    async function handleSubmit() {
        if (!userId) return;

        try {
            setSaving(true);
            const project = initialProject
                ? await updateProject(supabase, initialProject.id, {
                    name,
                    color_token: colorToken,
                    icon_token: iconToken,
                })
                : await createProject(supabase, {
                    userId,
                    name,
                    colorToken,
                    iconToken,
                });

            await refreshData();
            toast.success(initialProject ? "Project updated." : "Project created.");
            onOpenChange(false);
            onSaved?.(project.id);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Unable to save project.");
        } finally {
            setSaving(false);
        }
    }

    const PreviewIcon = getProjectIcon(iconToken);
    const previewPalette = getProjectColorClasses(colorToken);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl rounded-[1.75rem] border-border/60 p-0">
                <div className="border-b border-border/50 p-6">
                    <DialogHeader className="text-left">
                        <DialogTitle className="text-2xl font-semibold tracking-[-0.04em]">
                            {initialProject ? "Edit project" : "Create project"}
                        </DialogTitle>
                        <DialogDescription>
                            Set the project name, color, and icon.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <div className="space-y-6 p-6">
                    <div className="flex items-center gap-4 rounded-[1.25rem] border border-border/60 bg-background/70 p-4">
                        <div className={`rounded-2xl p-3 ${previewPalette.soft}`}>
                            <PreviewIcon className={`h-6 w-6 ${previewPalette.text}`} />
                        </div>
                        <div>
                            <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
                                {name.trim() || "Untitled Project"}
                            </p>
                            <p className="text-sm text-muted-foreground">Preview</p>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="projectName" className="eyebrow">
                            Name
                        </Label>
                        <Input
                            id="projectName"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder="Organic Chemistry"
                        />
                    </div>

                    <div className="space-y-3">
                        <Label className="eyebrow">Color</Label>
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                            {PROJECT_COLOR_TOKENS.map((token) => {
                                const palette = getProjectColorClasses(token);
                                return (
                                    <button
                                        key={token}
                                        type="button"
                                        onClick={() => setColorToken(token)}
                                        className={`rounded-2xl border px-3 py-4 text-xs font-semibold capitalize transition-colors ${colorToken === token ? `${palette.soft} ${palette.border} ${palette.text}` : "border-border/60 bg-background/70 text-muted-foreground hover:bg-secondary/60"}`}
                                    >
                                        <span className={`mx-auto mb-2 block h-3 w-3 rounded-full ${palette.accent}`} />
                                        {token}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <Label className="eyebrow">Icon</Label>
                        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                            {PROJECT_ICON_TOKENS.map((token) => {
                                const Icon = getProjectIcon(token);
                                const active = iconToken === token;
                                return (
                                    <button
                                        key={token}
                                        type="button"
                                        onClick={() => setIconToken(token)}
                                        className={`rounded-2xl border px-3 py-4 text-xs font-semibold capitalize transition-colors ${active ? `${previewPalette.soft} ${previewPalette.border} ${previewPalette.text}` : "border-border/60 bg-background/70 text-muted-foreground hover:bg-secondary/60"}`}
                                    >
                                        <Icon className="mx-auto mb-2 h-5 w-5" />
                                        {token.replace("-", " ")}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <DialogFooter className="border-t border-border/50 p-6">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => void handleSubmit()} disabled={saving || !name.trim()}>
                        {saving ? "Saving..." : initialProject ? "Save project" : "Create project"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
