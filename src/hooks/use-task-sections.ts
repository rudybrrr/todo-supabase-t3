"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import {
    createTaskSection,
    deleteTaskSection,
    getTaskSectionsErrorMessage,
    isMissingTaskSectionsError,
    listTaskSections,
    updateTaskSection,
} from "~/lib/task-section-actions";
import type { TodoSectionRow } from "~/lib/types";

function sortTaskSections(sections: TodoSectionRow[]) {
    return [...sections].sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return a.inserted_at.localeCompare(b.inserted_at);
    });
}

function upsertTaskSection(currentSections: TodoSectionRow[], nextSection: TodoSectionRow) {
    const existingIndex = currentSections.findIndex((section) => section.id === nextSection.id);
    if (existingIndex === -1) {
        return sortTaskSections([...currentSections, nextSection]);
    }

    const existingSection = currentSections[existingIndex]!;
    if (
        existingSection.list_id === nextSection.list_id
        && existingSection.name === nextSection.name
        && existingSection.position === nextSection.position
        && existingSection.inserted_at === nextSection.inserted_at
        && existingSection.updated_at === nextSection.updated_at
    ) {
        return currentSections;
    }

    return sortTaskSections(currentSections.map((section) => (section.id === nextSection.id ? nextSection : section)));
}

function removeTaskSection(currentSections: TodoSectionRow[], sectionId: string) {
    const nextSections = currentSections.filter((section) => section.id !== sectionId);
    return nextSections.length === currentSections.length ? currentSections : nextSections;
}

export function useTaskSections(listId: string | null, options?: { enabled?: boolean }) {
    const enabled = options?.enabled ?? true;
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [sections, setSections] = useState<TodoSectionRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [lastLoadedListId, setLastLoadedListId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [pendingSectionIds, setPendingSectionIds] = useState<string[]>([]);
    const activeListIdRef = useRef<string | null>(listId);

    useEffect(() => {
        activeListIdRef.current = listId;
    }, [listId]);

    const addPendingSectionId = useCallback((sectionId: string) => {
        setPendingSectionIds((current) => (current.includes(sectionId) ? current : [...current, sectionId]));
    }, []);

    const addPendingSectionIds = useCallback((sectionIds: string[]) => {
        setPendingSectionIds((current) => {
            const nextIds = new Set(current);
            sectionIds.forEach((sectionId) => {
                nextIds.add(sectionId);
            });
            return Array.from(nextIds);
        });
    }, []);

    const removePendingSectionId = useCallback((sectionId: string) => {
        setPendingSectionIds((current) => current.filter((id) => id !== sectionId));
    }, []);

    const removePendingSectionIds = useCallback((sectionIds: string[]) => {
        const idsToRemove = new Set(sectionIds);
        setPendingSectionIds((current) => current.filter((id) => !idsToRemove.has(id)));
    }, []);

    useEffect(() => {
        if (!enabled || !listId) {
            setSections([]);
            setLoading(false);
            setCreating(false);
            setPendingSectionIds([]);
            return;
        }

        let active = true;
        setSections([]);
        setLoading(true);
        setCreating(false);
        setPendingSectionIds([]);

        void listTaskSections(supabase, listId)
            .then((loadedSections) => {
                if (!active || activeListIdRef.current !== listId) return;
                setSections(loadedSections);
                setLastLoadedListId(listId);
            })
            .catch((error) => {
                if (!active || activeListIdRef.current !== listId) return;
                if (isMissingTaskSectionsError(error)) {
                    setSections([]);
                    setLastLoadedListId(listId);
                    toast.error(getTaskSectionsErrorMessage(error));
                    return;
                }
                setLastLoadedListId(listId);
                toast.error(getTaskSectionsErrorMessage(error));
            })
            .finally(() => {
                if (!active || activeListIdRef.current !== listId) return;
                setLoading(false);
            });

        const channel = supabase
            .channel(`todo-sections-${listId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "todo_sections", filter: `list_id=eq.${listId}` },
                (payload) => {
                    if (activeListIdRef.current !== listId) return;

                    if (payload.eventType === "DELETE") {
                        const deletedId = typeof payload.old.id === "string" ? payload.old.id : null;
                        if (!deletedId) return;
                        setSections((current) => removeTaskSection(current, deletedId));
                        return;
                    }

                    const nextSection = payload.new as TodoSectionRow | null;
                    if (!nextSection?.id) return;
                    setSections((current) => upsertTaskSection(current, nextSection));
                },
            )
            .subscribe();

        return () => {
            active = false;
            void supabase.removeChannel(channel);
        };
    }, [enabled, listId, supabase]);

    const createSection = useCallback(async (name: string) => {
        const scopeListId = listId;
        const normalizedName = name.trim();

        if (!enabled || !scopeListId || !normalizedName) return false;

        setCreating(true);

        try {
            const createdSection = await createTaskSection(supabase, {
                listId: scopeListId,
                name: normalizedName,
                position: sections.reduce((maxPosition, section) => Math.max(maxPosition, section.position), -1) + 1,
            });

            if (activeListIdRef.current !== scopeListId) return true;
            setSections((current) => upsertTaskSection(current, createdSection));
            return true;
        } catch (error) {
            if (activeListIdRef.current === scopeListId) {
                toast.error(getTaskSectionsErrorMessage(error));
            }
            return false;
        } finally {
            if (activeListIdRef.current === scopeListId) {
                setCreating(false);
            }
        }
    }, [enabled, listId, sections, supabase]);

    const renameSection = useCallback(async (sectionId: string, name: string) => {
        const scopeListId = listId;
        const normalizedName = name.trim();
        const previousSection = sections.find((section) => section.id === sectionId);

        if (!enabled || !scopeListId || !previousSection || !normalizedName || previousSection.name === normalizedName) return;

        addPendingSectionId(sectionId);
        setSections((current) => current.map((section) => (
            section.id === sectionId
                ? { ...section, name: normalizedName, updated_at: new Date().toISOString() }
                : section
        )));

        try {
            const updatedSection = await updateTaskSection(supabase, {
                sectionId,
                name: normalizedName,
            });

            if (activeListIdRef.current !== scopeListId) return;
            setSections((current) => upsertTaskSection(current, updatedSection));
        } catch (error) {
            if (activeListIdRef.current === scopeListId) {
                setSections((current) => current.map((section) => (section.id === sectionId ? previousSection : section)));
                toast.error(getTaskSectionsErrorMessage(error));
            }
        } finally {
            if (activeListIdRef.current === scopeListId) {
                removePendingSectionId(sectionId);
            }
        }
    }, [addPendingSectionId, enabled, listId, removePendingSectionId, sections, supabase]);

    const removeSection = useCallback(async (sectionId: string) => {
        const scopeListId = listId;
        const previousSection = sections.find((section) => section.id === sectionId);

        if (!enabled || !scopeListId || !previousSection) return;

        addPendingSectionId(sectionId);
        setSections((current) => removeTaskSection(current, sectionId));

        try {
            await deleteTaskSection(supabase, sectionId);
        } catch (error) {
            if (activeListIdRef.current === scopeListId) {
                setSections((current) => sortTaskSections([...current, previousSection]));
                toast.error(getTaskSectionsErrorMessage(error));
            }
        } finally {
            if (activeListIdRef.current === scopeListId) {
                removePendingSectionId(sectionId);
            }
        }
    }, [addPendingSectionId, enabled, listId, removePendingSectionId, sections, supabase]);

    const reorderSections = useCallback(async (orderedSectionIds: string[]) => {
        const scopeListId = listId;

        if (!enabled || !scopeListId || sections.length <= 1) return false;

        const uniqueOrderedIds = Array.from(new Set(orderedSectionIds));
        if (uniqueOrderedIds.length !== sections.length) return false;

        const sectionById = new Map(sections.map((section) => [section.id, section]));
        const previousSections = sections;
        const optimisticUpdatedAt = new Date().toISOString();
        const nextSections = uniqueOrderedIds.map((sectionId, index) => {
            const section = sectionById.get(sectionId);
            if (!section) return null;

            return {
                ...section,
                position: index,
                updated_at: optimisticUpdatedAt,
            };
        }).filter((section): section is TodoSectionRow => Boolean(section));

        if (nextSections.length !== sections.length) return false;

        const changedSectionIds = nextSections
            .filter((section) => {
                const previousSection = sectionById.get(section.id);
                return previousSection?.position !== section.position;
            })
            .map((section) => section.id);

        if (changedSectionIds.length === 0) return true;

        addPendingSectionIds(changedSectionIds);
        setSections(sortTaskSections(nextSections));

        try {
            const updatedSections = await Promise.all(changedSectionIds.map((sectionId) => {
                const nextSection = nextSections.find((section) => section.id === sectionId);
                if (!nextSection) {
                    throw new Error("Section not found.");
                }

                return updateTaskSection(supabase, {
                    sectionId,
                    position: nextSection.position,
                });
            }));

            if (activeListIdRef.current !== scopeListId) return true;

            setSections((current) => updatedSections.reduce(
                (nextCurrentSections, updatedSection) => upsertTaskSection(nextCurrentSections, updatedSection),
                current,
            ));
            return true;
        } catch (error) {
            if (activeListIdRef.current === scopeListId) {
                setSections(previousSections);
                toast.error(getTaskSectionsErrorMessage(error));
            }
            return false;
        } finally {
            if (activeListIdRef.current === scopeListId) {
                removePendingSectionIds(changedSectionIds);
            }
        }
    }, [addPendingSectionIds, enabled, listId, removePendingSectionIds, sections, supabase]);

    return {
        sections,
        loading: loading || (enabled ? Boolean(listId && lastLoadedListId !== listId) : false),
        creating,
        pendingSectionIds: new Set(pendingSectionIds),
        createSection,
        renameSection,
        removeSection,
        reorderSections,
    };
}
