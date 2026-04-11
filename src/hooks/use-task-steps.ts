"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import {
    createTaskStep,
    deleteTaskStep,
    listTaskSteps,
    setTaskStepCompletion,
    updateTaskStep,
} from "~/lib/task-step-actions";
import type { TodoStepRow } from "~/lib/types";

const taskStepsCache = new Map<string, TodoStepRow[]>();

function sortTaskSteps(steps: TodoStepRow[]) {
    return [...steps].sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return a.inserted_at.localeCompare(b.inserted_at);
    });
}

function upsertTaskStep(currentSteps: TodoStepRow[], nextStep: TodoStepRow) {
    const existingIndex = currentSteps.findIndex((step) => step.id === nextStep.id);
    if (existingIndex === -1) {
        return sortTaskSteps([...currentSteps, nextStep]);
    }

    const currentStep = currentSteps[existingIndex]!;
    if (
        currentStep.todo_id === nextStep.todo_id
        && currentStep.title === nextStep.title
        && currentStep.is_done === nextStep.is_done
        && currentStep.position === nextStep.position
        && currentStep.inserted_at === nextStep.inserted_at
        && currentStep.updated_at === nextStep.updated_at
    ) {
        return currentSteps;
    }

    return sortTaskSteps(currentSteps.map((step) => (step.id === nextStep.id ? nextStep : step)));
}

function removeTaskStep(currentSteps: TodoStepRow[], stepId: string) {
    const nextSteps = currentSteps.filter((step) => step.id !== stepId);
    return nextSteps.length === currentSteps.length ? currentSteps : nextSteps;
}

function cacheTaskSteps(taskId: string, steps: TodoStepRow[]) {
    const sortedSteps = sortTaskSteps(steps);
    taskStepsCache.set(taskId, sortedSteps);
    return sortedSteps;
}

export function useTaskSteps(taskId: string | null) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [steps, setSteps] = useState<TodoStepRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [creating, setCreating] = useState(false);
    const [pendingStepIds, setPendingStepIds] = useState<string[]>([]);
    const activeTaskIdRef = useRef<string | null>(taskId);

    useEffect(() => {
        activeTaskIdRef.current = taskId;
    }, [taskId]);

    const addPendingStepId = useCallback((stepId: string) => {
        setPendingStepIds((current) => (current.includes(stepId) ? current : [...current, stepId]));
    }, []);

    const removePendingStepId = useCallback((stepId: string) => {
        setPendingStepIds((current) => current.filter((id) => id !== stepId));
    }, []);

    const writeSteps = useCallback((
        scopeTaskId: string,
        updater: TodoStepRow[] | ((currentSteps: TodoStepRow[]) => TodoStepRow[]),
    ) => {
        setSteps((currentSteps) => {
            const baseSteps = activeTaskIdRef.current === scopeTaskId
                ? currentSteps
                : (taskStepsCache.get(scopeTaskId) ?? []);
            const nextSteps = typeof updater === "function"
                ? updater(baseSteps)
                : updater;
            const cachedSteps = cacheTaskSteps(scopeTaskId, nextSteps);

            return activeTaskIdRef.current === scopeTaskId ? cachedSteps : currentSteps;
        });
    }, []);

    useEffect(() => {
        if (!taskId) {
            setSteps([]);
            setPendingStepIds([]);
            setCreating(false);
            setLoading(false);
            return;
        }

        let active = true;
        const cachedSteps = taskStepsCache.get(taskId) ?? null;
        setSteps(cachedSteps ?? []);
        setLoading(!cachedSteps);
        setCreating(false);
        setPendingStepIds([]);

        void listTaskSteps(supabase, taskId)
            .then((loadedSteps) => {
                if (!active || activeTaskIdRef.current !== taskId) return;
                setSteps(cacheTaskSteps(taskId, loadedSteps));
            })
            .catch((error) => {
                if (!active || activeTaskIdRef.current !== taskId) return;
                toast.error(error instanceof Error ? error.message : "Unable to load steps.");
            })
            .finally(() => {
                if (!active || activeTaskIdRef.current !== taskId) return;
                setLoading(false);
            });

        const channel = supabase
            .channel(`todo-steps-${taskId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "todo_steps", filter: `todo_id=eq.${taskId}` },
                (payload) => {
                    if (activeTaskIdRef.current !== taskId) return;

                    if (payload.eventType === "DELETE") {
                        const deletedId = typeof payload.old.id === "string" ? payload.old.id : null;
                        if (!deletedId) return;
                        writeSteps(taskId, (current) => removeTaskStep(current, deletedId));
                        return;
                    }

                    const nextStep = payload.new as TodoStepRow | null;
                    if (!nextStep?.id) return;
                    writeSteps(taskId, (current) => upsertTaskStep(current, nextStep));
                },
            )
            .subscribe();

        return () => {
            active = false;
            void supabase.removeChannel(channel);
        };
    }, [supabase, taskId, writeSteps]);

    const createStep = useCallback(async (title: string) => {
        const scopeTaskId = taskId;
        const normalizedTitle = title.trim();

        if (!scopeTaskId || !normalizedTitle) return false;

        const position = steps.reduce((maxPosition, step) => Math.max(maxPosition, step.position), -1) + 1;
        const tempId = `temp-${crypto.randomUUID()}`;
        const optimisticStep: TodoStepRow = {
            id: tempId,
            todo_id: scopeTaskId,
            title: normalizedTitle,
            is_done: false,
            position,
            inserted_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };

        setCreating(true);
        writeSteps(scopeTaskId, (current) => [...current, optimisticStep]);

        try {
            const createdStep = await createTaskStep(supabase, {
                taskId: scopeTaskId,
                title: normalizedTitle,
                position,
            });

            if (activeTaskIdRef.current !== scopeTaskId) return true;

            writeSteps(scopeTaskId, (current) => {
                const withoutTemp = current.filter((step) => step.id !== tempId);
                return upsertTaskStep(withoutTemp, createdStep);
            });

            return true;
        } catch (error) {
            if (activeTaskIdRef.current === scopeTaskId) {
                writeSteps(scopeTaskId, (current) => current.filter((step) => step.id !== tempId));
                toast.error(error instanceof Error ? error.message : "Unable to add step.");
            }
            return false;
        } finally {
            if (activeTaskIdRef.current === scopeTaskId) {
                setCreating(false);
            }
        }
    }, [steps, supabase, taskId, writeSteps]);

    const renameStep = useCallback(async (stepId: string, title: string) => {
        const scopeTaskId = taskId;
        const normalizedTitle = title.trim();
        const previousStep = steps.find((step) => step.id === stepId);

        if (!scopeTaskId || !previousStep || !normalizedTitle || previousStep.title === normalizedTitle) return;

        addPendingStepId(stepId);
        writeSteps(scopeTaskId, (current) => current.map((step) => (
            step.id === stepId
                ? { ...step, title: normalizedTitle, updated_at: new Date().toISOString() }
                : step
        )));

        try {
            const updatedStep = await updateTaskStep(supabase, {
                stepId,
                title: normalizedTitle,
            });

            if (activeTaskIdRef.current !== scopeTaskId) return;
            writeSteps(scopeTaskId, (current) => upsertTaskStep(current, updatedStep));
        } catch (error) {
            if (activeTaskIdRef.current === scopeTaskId) {
                writeSteps(scopeTaskId, (current) => current.map((step) => (step.id === stepId ? previousStep : step)));
                toast.error(error instanceof Error ? error.message : "Unable to rename step.");
            }
        } finally {
            if (activeTaskIdRef.current === scopeTaskId) {
                removePendingStepId(stepId);
            }
        }
    }, [addPendingStepId, removePendingStepId, steps, supabase, taskId, writeSteps]);

    const toggleStep = useCallback(async (stepId: string, nextIsDone: boolean) => {
        const scopeTaskId = taskId;
        const previousStep = steps.find((step) => step.id === stepId);

        if (!scopeTaskId || !previousStep || previousStep.is_done === nextIsDone) return;

        addPendingStepId(stepId);
        writeSteps(scopeTaskId, (current) => current.map((step) => (
            step.id === stepId
                ? { ...step, is_done: nextIsDone, updated_at: new Date().toISOString() }
                : step
        )));

        try {
            const updatedStep = await setTaskStepCompletion(supabase, stepId, nextIsDone);

            if (activeTaskIdRef.current !== scopeTaskId) return;
            writeSteps(scopeTaskId, (current) => upsertTaskStep(current, updatedStep));
        } catch (error) {
            if (activeTaskIdRef.current === scopeTaskId) {
                writeSteps(scopeTaskId, (current) => current.map((step) => (step.id === stepId ? previousStep : step)));
                toast.error(error instanceof Error ? error.message : "Unable to update step.");
            }
        } finally {
            if (activeTaskIdRef.current === scopeTaskId) {
                removePendingStepId(stepId);
            }
        }
    }, [addPendingStepId, removePendingStepId, steps, supabase, taskId, writeSteps]);

    const removeStep = useCallback(async (stepId: string) => {
        const scopeTaskId = taskId;
        const previousStep = steps.find((step) => step.id === stepId);

        if (!scopeTaskId || !previousStep) return;

        addPendingStepId(stepId);
        writeSteps(scopeTaskId, (current) => removeTaskStep(current, stepId));

        try {
            await deleteTaskStep(supabase, stepId);
        } catch (error) {
            if (activeTaskIdRef.current === scopeTaskId) {
                writeSteps(scopeTaskId, (current) => [...current, previousStep]);
                toast.error(error instanceof Error ? error.message : "Unable to remove step.");
            }
        } finally {
            if (activeTaskIdRef.current === scopeTaskId) {
                removePendingStepId(stepId);
            }
        }
    }, [addPendingStepId, removePendingStepId, steps, supabase, taskId, writeSteps]);

    const pendingStepIdSet = useMemo(() => new Set(pendingStepIds), [pendingStepIds]);
    const completedCount = useMemo(() => steps.filter((step) => step.is_done).length, [steps]);

    return {
        steps,
        loading,
        creating,
        pendingStepIds: pendingStepIdSet,
        totalCount: steps.length,
        completedCount,
        createStep,
        renameStep,
        toggleStep,
        removeStep,
    };
}
