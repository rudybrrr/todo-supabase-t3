"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

import { useTaskSteps } from "~/hooks/use-task-steps";
import type { TodoStepRow } from "~/lib/types";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

export function TaskStepsSection({ taskId }: { taskId: string }) {
    const {
        steps,
        loading,
        creating,
        pendingStepIds,
        totalCount,
        completedCount,
        createStep,
        renameStep,
        toggleStep,
        removeStep,
    } = useTaskSteps(taskId);
    const addInputRef = useRef<HTMLInputElement>(null);
    const [newStepTitle, setNewStepTitle] = useState("");
    const [draftTitles, setDraftTitles] = useState<Record<string, string>>({});
    const [shouldRefocusAddInput, setShouldRefocusAddInput] = useState(false);

    useEffect(() => {
        setDraftTitles((current) => {
            const next: Record<string, string> = {};

            for (const step of steps) {
                next[step.id] = current[step.id] ?? step.title;
            }

            return next;
        });
    }, [steps]);

    useEffect(() => {
        if (!shouldRefocusAddInput) return;

        let cancelled = false;
        let frameId = 0;

        const focusWhenReady = () => {
            if (cancelled) return;

            const input = addInputRef.current;
            if (!input || input.disabled) {
                frameId = window.requestAnimationFrame(focusWhenReady);
                return;
            }

            input.focus();
            const caretPosition = input.value.length;
            input.setSelectionRange(caretPosition, caretPosition);
            setShouldRefocusAddInput(false);
        };

        frameId = window.requestAnimationFrame(focusWhenReady);

        return () => {
            cancelled = true;
            window.cancelAnimationFrame(frameId);
        };
    }, [shouldRefocusAddInput]);

    async function handleCreateStep() {
        const normalizedTitle = newStepTitle.trim();
        if (!normalizedTitle) return;

        setShouldRefocusAddInput(true);
        const created = await createStep(normalizedTitle);
        if (!created) return;

        setNewStepTitle("");
    }

    function resetDraftTitle(step: TodoStepRow) {
        setDraftTitles((current) => ({
            ...current,
            [step.id]: step.title,
        }));
    }

    async function commitStepTitle(step: TodoStepRow) {
        const draftTitle = (draftTitles[step.id] ?? step.title).trim();

        if (!draftTitle) {
            setDraftTitles((current) => {
                const next = { ...current };
                delete next[step.id];
                return next;
            });
            await removeStep(step.id);
            return;
        }

        if (draftTitle === step.title) {
            resetDraftTitle(step);
            return;
        }

        setDraftTitles((current) => ({
            ...current,
            [step.id]: draftTitle,
        }));
        await renameStep(step.id, draftTitle);
    }

    return (
        <section className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-3">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">Steps</h3>
                    {totalCount > 0 ? (
                        <span className="rounded-full border border-border/70 bg-background/70 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                            {completedCount}/{totalCount}
                        </span>
                    ) : null}
                </div>
            </div>

            {loading && steps.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 bg-background/35 px-3 py-3 text-sm text-muted-foreground">
                    Loading steps...
                </div>
            ) : steps.length > 0 ? (
                <div className="space-y-2">
                    {steps.map((step) => {
                        const pending = pendingStepIds.has(step.id);

                        return (
                            <div
                                key={step.id}
                                className={cn(
                                    "group flex items-center gap-2.5 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2",
                                    pending && "opacity-70",
                                )}
                            >
                                <button
                                    type="button"
                                    aria-label={step.is_done ? "Mark step incomplete" : "Mark step complete"}
                                    disabled={pending}
                                    onClick={() => void toggleStep(step.id, !step.is_done)}
                                    className={cn(
                                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border transition-colors",
                                        step.is_done
                                            ? "border-primary bg-primary text-primary-foreground"
                                            : "border-border bg-card text-transparent hover:border-primary/60",
                                    )}
                                >
                                    <Check className="h-3 w-3" />
                                </button>

                                <input
                                    value={draftTitles[step.id] ?? step.title}
                                    disabled={pending}
                                    onChange={(event) => {
                                        const nextValue = event.target.value;
                                        setDraftTitles((current) => ({
                                            ...current,
                                            [step.id]: nextValue,
                                        }));
                                    }}
                                    onBlur={() => void commitStepTitle(step)}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter") {
                                            event.preventDefault();
                                            setShouldRefocusAddInput(true);
                                            return;
                                        }

                                        if (event.key === "Escape") {
                                            event.preventDefault();
                                            resetDraftTitle(step);
                                            event.currentTarget.blur();
                                        }
                                    }}
                                    className={cn(
                                        "h-auto w-full min-w-0 border-0 bg-transparent px-0 py-0 text-sm outline-none",
                                        step.is_done && "text-muted-foreground line-through",
                                    )}
                                />

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="shrink-0 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                                    aria-label={`Remove step ${step.title}`}
                                    disabled={pending}
                                    onClick={() => void removeStep(step.id)}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        );
                    })}
                </div>
            ) : null}

            <form
                className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-background/55 px-2.5 py-2"
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleCreateStep();
                }}
            >
                <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <input
                    ref={addInputRef}
                    value={newStepTitle}
                    disabled={creating}
                    onChange={(event) => setNewStepTitle(event.target.value)}
                    placeholder="Add a step"
                    className="h-auto w-full min-w-0 border-0 bg-transparent px-0 py-0 text-sm outline-none placeholder:text-muted-foreground"
                />
                <Button
                    type="submit"
                    variant="ghost"
                    size="icon-xs"
                    className="shrink-0"
                    disabled={creating || !newStepTitle.trim()}
                    aria-label="Add step"
                >
                    <Plus className="h-3.5 w-3.5" />
                </Button>
            </form>
        </section>
    );
}
