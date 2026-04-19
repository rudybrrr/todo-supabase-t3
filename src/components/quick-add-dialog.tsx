"use client";

import { Bell, Flag, Folder, Hourglass, Paperclip, Repeat, Rows3, SendHorizontal, Tag, Check, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { TaskSyntaxComposer } from "~/components/task-syntax-composer";
import { useData } from "~/components/data-provider";
import { TaskLabelBadge } from "~/components/task-label-badge";
import { TaskDueDatePicker } from "~/components/task-due-date-picker";
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
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { TimeSelectField } from "~/components/ui/time-select-field";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { useTaskSections } from "~/hooks/use-task-sections";
import {
    applyQuickAddSuggestion,
    getQuickAddActiveSuggestionState,
    parseQuickAddInput,
} from "~/lib/quick-add-parser";
import { formatTaskLabelInput, parseTaskLabelInput } from "~/lib/task-labels";
import { getRecurrenceLabel, RECURRENCE_RULE_OPTIONS } from "~/lib/task-recurrence";
import { calculateTotalSize, MAX_ATTACHMENT_SIZE_BYTES, MAX_ATTACHMENT_SIZE_MB } from "~/lib/task-attachments";
import {
    getReminderOffsetLabel,
    getReminderOffsetInputValue,
    getReminderOffsetMinutesFromInput,
    REMINDER_OFFSET_OPTIONS,
} from "~/lib/task-reminders";
import { createProject } from "~/lib/project-actions";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { createTask, replaceTaskLabels, uploadTaskAttachments } from "~/lib/task-actions";
import { getDateInputValue } from "~/lib/task-views";
import { getTimeInputValue } from "~/lib/task-deadlines";
import type { RecurrenceRule } from "~/lib/types";
import { cn } from "~/lib/utils";

interface QuickAddDefaults {
    listId?: string | null;
    sectionId?: string | null;
    title?: string;
    dueDate?: string | null;
}

const ESTIMATE_PRESETS = [15, 30, 45, 60, 90];
const ACTION_CHIP_CLASS =
    "cursor-pointer h-8 w-auto max-w-full rounded-md border border-border/70 bg-transparent px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-secondary hover:text-foreground focus-visible:border-ring focus-visible:ring-0";
const PENDING_PROJECT_SELECT_VALUE = "__pending_new_project__";

function QuickAddField({
    label,
    children,
    className,
}: {
    label: string;
    hint?: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn("space-y-1.5", className)}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {label}
            </p>
            {children}
        </div>
    );
}

function formatEstimateLabel(minutes: number) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    if (hours > 0 && remainder > 0) {
        return `${hours}h ${remainder}m`;
    }

    if (hours > 0) {
        return `${hours}h`;
    }

    return `${remainder}m`;
}

export function QuickAddDialog({
    open,
    onOpenChange,
    defaults,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaults?: QuickAddDefaults | null;
}) {
    const { userId, lists, profile, refreshData } = useData();
    const { applyTaskPatch, upsertTask, upsertTaskLabels, taskLabels } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const defaultListId = useMemo(() => {
        const inbox = lists.find((list) => list.name.toLowerCase() === "inbox") ?? lists[0];
        return defaults?.listId ?? inbox?.id ?? "";
    }, [defaults?.listId, lists]);
    const defaultDueDate = useMemo(
        () => defaults?.dueDate ? getDateInputValue(defaults.dueDate) : "",
        [defaults?.dueDate],
    );
    const defaultDueTime = useMemo(
        () => defaults?.dueDate ? getTimeInputValue(defaults.dueDate, profile?.timezone) : "",
        [defaults?.dueDate, profile?.timezone],
    );

    const [inputValue, setInputValue] = useState("");
    const [composerSelection, setComposerSelection] = useState(0);
    const [selectionPosition, setSelectionPosition] = useState<number | null>(null);
    const [manualListId, setManualListId] = useState<string | undefined>(undefined);
    const [manualSectionId, setManualSectionId] = useState<string | undefined>(undefined);
    const [manualPriority, setManualPriority] = useState<"high" | "medium" | "low" | "" | undefined>(undefined);
    const [manualDueDate, setManualDueDate] = useState<string | undefined>(undefined);
    const [manualDueTime, setManualDueTime] = useState<string | undefined>(undefined);
    const [manualReminderOffset, setManualReminderOffset] = useState<string | undefined>(undefined);
    const [manualRecurrenceRule, setManualRecurrenceRule] = useState<RecurrenceRule | "" | undefined>(undefined);
    const [manualEstimatedMinutes, setManualEstimatedMinutes] = useState<string | undefined>(undefined);
    const [manualLabelsInput, setManualLabelsInput] = useState<string | undefined>(undefined);
    const [description, setDescription] = useState("");
    const [attachments, setAttachments] = useState<File[]>([]);
    const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
    const [estimateOpen, setEstimateOpen] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [discardDialogOpen, setDiscardDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const parsedInput = useMemo(
        () => parseQuickAddInput(inputValue, lists, { labels: taskLabels }),
        [inputValue, lists, taskLabels],
    );
    const activeSuggestion = useMemo(
        () => getQuickAddActiveSuggestionState(inputValue, composerSelection, lists, taskLabels),
        [composerSelection, inputValue, lists, taskLabels],
    );
    const effectiveListId = manualListId ?? (parsedInput.hasProjectToken ? parsedInput.listId : defaultListId) ?? "";
    const activeList = lists.find((list) => list.id === effectiveListId) ?? null;
    const sectionsEnabled = Boolean(activeList && activeList.name.toLowerCase() !== "inbox");
    const { sections, loading: sectionsLoading } = useTaskSections(effectiveListId || null, { enabled: sectionsEnabled });
    const defaultSectionId = useMemo(() => {
        if (!defaults?.sectionId || !defaults?.listId || parsedInput.hasProjectToken) return "";
        return defaults.listId === effectiveListId ? defaults.sectionId : "";
    }, [defaults?.listId, defaults?.sectionId, effectiveListId, parsedInput.hasProjectToken]);
    const effectiveSectionId = manualSectionId ?? defaultSectionId;
    const showSectionSelector = sectionsEnabled && (sectionsLoading || sections.length > 0 || Boolean(effectiveSectionId));
    const effectivePriority = manualPriority ?? parsedInput.priority ?? "";
    const effectiveDueDate = manualDueDate ?? parsedInput.dueDate ?? defaultDueDate;
    const effectiveDueTime = manualDueTime ?? parsedInput.dueTime ?? defaultDueTime;
    const effectiveReminderOffset = manualReminderOffset ?? getReminderOffsetInputValue(parsedInput.reminderOffsetMinutes);
    const parsedReminderOffsetMinutes = getReminderOffsetMinutesFromInput(effectiveReminderOffset);
    const effectiveRecurrenceRule = manualRecurrenceRule ?? parsedInput.recurrenceRule ?? "";
    const effectiveEstimatedMinutes = manualEstimatedMinutes
        ?? (parsedInput.estimatedMinutes ? String(parsedInput.estimatedMinutes) : "");
    const effectiveLabelNames = useMemo(
        () => manualLabelsInput != null ? parseTaskLabelInput(manualLabelsInput) : parsedInput.labelNames,
        [manualLabelsInput, parsedInput.labelNames],
    );
    const pendingProjectName = manualListId === undefined ? parsedInput.pendingProjectName : null;
    const projectSelectValue = pendingProjectName ? PENDING_PROJECT_SELECT_VALUE : (effectiveListId || "");
    const parsedEstimateMinutes = effectiveEstimatedMinutes ? Number.parseInt(effectiveEstimatedMinutes, 10) : null;
    const cleanedTitle = parsedInput.title.trim();
    const showEmptyTitleWarning = inputValue.trim() && !cleanedTitle && parsedInput.chips.length > 0;
    const isDirty = Boolean(
        inputValue.trim()
        || description.trim()
        || attachments.length > 0
        || manualListId !== undefined
        || manualSectionId !== undefined
        || manualPriority !== undefined
        || manualDueDate !== undefined
        || manualDueTime !== undefined
        || manualReminderOffset !== undefined
        || manualRecurrenceRule !== undefined
        || manualEstimatedMinutes !== undefined
        || manualLabelsInput !== undefined,
    );

    useEffect(() => {
        if (!open) return;

        setInputValue(defaults?.title ?? "");
        setManualListId(undefined);
        setManualSectionId(undefined);
        setManualPriority(undefined);
        setManualDueDate(undefined);
        setManualDueTime(undefined);
        setManualReminderOffset(undefined);
        setManualRecurrenceRule(undefined);
        setManualEstimatedMinutes(undefined);
        setManualLabelsInput(undefined);
        setDescription("");
        setAttachments([]);
        setUploadProgress({});
        setEstimateOpen(false);
        setDetailsOpen(false);
        setDiscardDialogOpen(false);
        const nextSelection = (defaults?.title ?? "").length;
        setComposerSelection(nextSelection);
        setSelectionPosition(nextSelection);
    }, [defaults, open]);

    useEffect(() => {
        if (!sectionsEnabled) {
            if ((manualSectionId ?? defaultSectionId) !== "") {
                setManualSectionId("");
            }
            return;
        }

        if (sectionsLoading) return;

        const normalizedSectionId = manualSectionId ?? defaultSectionId;
        if (!normalizedSectionId) return;

        if (!sections.some((section) => section.id === normalizedSectionId)) {
            setManualSectionId("");
        }
    }, [defaultSectionId, manualSectionId, sections, sectionsEnabled, sectionsLoading]);

    function handleOpenChange(nextOpen: boolean) {
        if (nextOpen) {
            onOpenChange(true);
            return;
        }

        if (saving) return;

        if (isDirty) {
            setDiscardDialogOpen(true);
            return;
        }

        onOpenChange(false);
    }

    function handleConfirmDiscard() {
        setDiscardDialogOpen(false);
        onOpenChange(false);
    }

    async function handleSubmit() {
        if (!userId || !cleanedTitle) return;
        if (effectiveDueTime && !effectiveDueDate) {
            toast.error("Add a date before setting a time.");
            return;
        }
        if (effectiveRecurrenceRule && !effectiveDueDate) {
            toast.error("Recurring tasks need a deadline.");
            return;
        }
        if (parsedReminderOffsetMinutes != null && !effectiveDueDate) {
            toast.error("Reminders need a deadline.");
            return;
        }

        try {
            setSaving(true);
            let resolvedListId = effectiveListId;

            if (!resolvedListId && pendingProjectName) {
                const createdProject = await createProject(supabase, {
                    userId,
                    name: pendingProjectName,
                    colorToken: "cobalt",
                    iconToken: "book-open",
                });
                resolvedListId = createdProject.id;
                await refreshData();
            }

            if (!resolvedListId) {
                toast.error("Choose a project before adding the task.");
                return;
            }

            const createdTask = await createTask(supabase, {
                userId,
                listId: resolvedListId,
                sectionId: effectiveSectionId || null,
                title: cleanedTitle,
                description,
                dueDate: effectiveDueDate || null,
                dueTime: effectiveDueTime || null,
                reminderOffsetMinutes: parsedReminderOffsetMinutes,
                recurrenceRule: effectiveRecurrenceRule || null,
                priority: effectivePriority || null,
                estimatedMinutes:
                    parsedEstimateMinutes && !Number.isNaN(parsedEstimateMinutes) ? parsedEstimateMinutes : null,
                preferredTimeZone: profile?.timezone,
            });

            upsertTask(createdTask, { suppressRealtimeEcho: true });

            if (effectiveLabelNames.length > 0) {
                try {
                    const assignedLabels = await replaceTaskLabels(supabase, {
                        userId,
                        taskId: createdTask.id,
                        labelNames: effectiveLabelNames,
                    });
                    upsertTaskLabels(assignedLabels);
                    applyTaskPatch(createdTask.id, { labels: assignedLabels });
                } catch (labelError) {
                    toast.warning(labelError instanceof Error ? `Task added, but labels could not be saved: ${labelError.message}` : "Task added, but labels could not be saved.");
                }
            }

            if (attachments.length > 0) {
                await uploadTaskAttachments(supabase, userId, createdTask.id, resolvedListId, attachments, (name, progress) => {
                    setUploadProgress(prev => ({ ...prev, [name]: progress }));
                });
            }

            toast.success("Task added.");
            onOpenChange(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unable to add task.";
            toast.error(message);
        } finally {
            setSaving(false);
        }
    }

    const quickAddContent = (
        <div className="flex h-full min-h-0 flex-col overflow-hidden">
            <div className="border-b border-border/60 bg-background/95 px-4 py-3 sm:px-5 sm:py-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold tracking-tight text-foreground">
                                Quick add
                            </p>
                            <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                Capture
                            </span>
                        </div>
                    </div>

                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => handleOpenChange(false)}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            <div className="task-detail-scroll min-h-0 flex-1 overflow-y-auto lg:overscroll-y-contain">
                <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-5">
                    <section className="rounded-2xl border border-border/60 bg-card shadow-sm">
                        <div className="border-b border-border/60 px-4 py-4 sm:px-5">
                            <div className="mb-3 flex items-center justify-between gap-3">
                                <h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                                    Capture bar
                                </h3>
                            </div>

                            <TaskSyntaxComposer
                                ariaLabel="Task"
                                rows={1}
                                value={inputValue}
                                tokens={parsedInput.tokens}
                                placeholder="Finish chemistry lab #science tomorrow 4pm p1 45m r1h every weekday +exam"
                                suggestionState={activeSuggestion}
                                selectionPosition={selectionPosition}
                                onSelectionChange={(selection) => {
                                    setComposerSelection(selection);
                                    if (selectionPosition != null) {
                                        setSelectionPosition(null);
                                    }
                                }}
                                onChange={setInputValue}
                                onApplySuggestion={(suggestion) => {
                                    if (!activeSuggestion) return;
                                    const nextValue = applyQuickAddSuggestion(inputValue, activeSuggestion, suggestion);
                                    setInputValue(nextValue.value);
                                    setComposerSelection(nextValue.selection);
                                    setSelectionPosition(nextValue.selection);
                                }}
                                onSubmit={() => {
                                    void handleSubmit();
                                }}
                                inputClassName="text-[1.02rem]"
                                highlightClassName="text-[1.02rem]"
                                composerClassName="font-semibold leading-7 tracking-[-0.02em]"
                            />

                            {parsedInput.chips.length > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {parsedInput.chips.map((chip, index) => (
                                        <span
                                            key={`${chip.kind}-${chip.value}-${index}`}
                                            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/35 px-2 py-1 text-[10px] font-medium text-muted-foreground"
                                        >
                                            <span className="uppercase tracking-[0.14em]">{chip.label}</span>
                                            <span className="text-foreground">{chip.value}</span>
                                        </span>
                                    ))}
                                </div>
                            ) : null}

                            {showEmptyTitleWarning ? (
                                <p className="mt-2 text-sm text-destructive">Add a task name.</p>
                            ) : null}

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                {saving ? (
                                    <span className="text-muted-foreground">Saving changes...</span>
                                ) : isDirty ? (
                                    <span className="text-primary">Draft not saved</span>
                                ) : (
                                    <span className="text-muted-foreground">Ready to capture</span>
                                )}
                                {effectiveLabelNames.length > 0 ? (
                                    <span className="text-muted-foreground">
                                        {effectiveLabelNames.length} label{effectiveLabelNames.length > 1 ? "s" : ""}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                                    <Folder className="h-3.5 w-3.5" />
                                    <span className="truncate">
                                        {pendingProjectName
                                            ? `Create ${pendingProjectName}`
                                            : (lists.find((l) => l.id === effectiveListId)?.name ?? "Inbox")}
                                    </span>
                                </span>
                                {effectiveLabelNames.length > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                                        <Tag className="h-3.5 w-3.5" />
                                        <span>
                                            {effectiveLabelNames.length} label{effectiveLabelNames.length > 1 ? "s" : ""}
                                        </span>
                                    </span>
                                ) : null}
                                {(effectiveDueDate || effectiveDueTime) ? (
                                    <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/35 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                                        <Bell className="h-3.5 w-3.5" />
                                        <span>Due set</span>
                                    </span>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-8 rounded-md px-3 text-xs"
                                    onClick={() => setDetailsOpen((current) => !current)}
                                >
                                    {detailsOpen ? "Hide options" : "More options"}
                                </Button>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 rounded-md px-3 text-xs"
                                    onClick={() => handleOpenChange(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    className="h-8 rounded-md px-3 text-xs"
                                    onClick={() => void handleSubmit()}
                                    disabled={saving || !cleanedTitle}
                                    aria-label={saving ? "Saving task" : "Add task"}
                                >
                                    <SendHorizontal className="mr-1.5 h-3.5 w-3.5" />
                                    {saving ? "Saving..." : "Add task"}
                                </Button>
                            </div>
                        </div>
                    </section>

                    {detailsOpen ? (
                        <section className="rounded-2xl border border-border/60 bg-background">
                            <div className="border-b border-border/60 px-4 py-4 sm:px-5">
                                <h3 className="text-sm font-semibold tracking-[-0.02em] text-foreground">
                                    Details
                                </h3>
                            </div>

                            <div className="grid gap-4 px-4 py-4 sm:px-5">
                                <QuickAddField label="Notes">
                                    <Textarea
                                        id="quickAddNotes"
                                        placeholder="Notes"
                                        value={description}
                                        onChange={(event) => setDescription(event.target.value)}
                                        className="min-h-[88px] w-full resize-none rounded-xl border-border/70 bg-background px-3 py-2.5 text-sm shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
                                    />
                                </QuickAddField>

                                <QuickAddField label="Attachments">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <label className={cn(ACTION_CHIP_CLASS, "inline-flex cursor-pointer items-center gap-2")}>
                                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                                            <span className="truncate">
                                                {attachments.length > 0 ? `${attachments.length} file${attachments.length > 1 ? "s" : ""}` : "Attach files"}
                                            </span>
                                            <input
                                                className="hidden"
                                                type="file"
                                                multiple
                                                onChange={(event) => {
                                                    const selectedFiles = Array.from(event.target.files ?? []);
                                                    const currentTotal = calculateTotalSize(attachments);
                                                    const newFilesTotal = calculateTotalSize(selectedFiles);

                                                    if (currentTotal + newFilesTotal > MAX_ATTACHMENT_SIZE_BYTES) {
                                                        toast.error(`Total attachment size cannot exceed ${MAX_ATTACHMENT_SIZE_MB}MB.`);
                                                        event.target.value = "";
                                                        return;
                                                    }

                                                    setAttachments((prev) => [...prev, ...selectedFiles]);
                                                    event.target.value = "";
                                                }}
                                            />
                                        </label>

                                        {attachments.length > 0 ? (
                                            <button
                                                type="button"
                                                className={cn(ACTION_CHIP_CLASS, "inline-flex items-center gap-2")}
                                                onClick={() => setAttachments([])}
                                                disabled={saving}
                                            >
                                                Clear files
                                            </button>
                                        ) : null}
                                    </div>

                                    {attachments.length > 0 ? (
                                        <div className="mt-3 space-y-2">
                                            {attachments.map((file, index) => {
                                                const progress = uploadProgress[file.name];

                                                return (
                                                    <div
                                                        key={`${file.name}-${index}`}
                                                        className="group flex items-center gap-2 rounded-xl border border-border/60 bg-muted/25 px-3 py-2"
                                                    >
                                                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                                            {file.name}
                                                        </span>
                                                        {!saving ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== index))}
                                                                className="rounded-sm p-0.5 text-muted-foreground opacity-70 transition hover:bg-muted-foreground/10 hover:text-foreground hover:opacity-100"
                                                            >
                                                                <X className="h-3 w-3" />
                                                            </button>
                                                        ) : null}
                                                        {saving && progress != null ? (
                                                            <div className="ml-2 h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : null}
                                </QuickAddField>

                                <QuickAddField label="Project">
                                    <Select
                                        value={projectSelectValue}
                                        onValueChange={(value) => {
                                            if (value === PENDING_PROJECT_SELECT_VALUE) {
                                                return;
                                            }
                                            setManualListId(value);
                                            setManualSectionId("");
                                        }}
                                    >
                                        <SelectTrigger
                                            id="quickAddProject"
                                            className="border-border/60 bg-background h-11 rounded-xl px-3.5 text-sm shadow-none focus-visible:ring-0 [&>svg:last-child]:hidden"
                                        >
                                            <span className="flex min-w-0 items-center gap-2">
                                                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">
                                                    {pendingProjectName
                                                        ? `Create ${pendingProjectName}`
                                                        : (lists.find((l) => l.id === effectiveListId)?.name ?? "Inbox")}
                                                </span>
                                            </span>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {pendingProjectName ? (
                                                <SelectItem value={PENDING_PROJECT_SELECT_VALUE}>
                                                    Create {pendingProjectName}
                                                </SelectItem>
                                            ) : null}
                                            {lists.map((list) => (
                                                <SelectItem key={list.id} value={list.id}>
                                                    {list.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </QuickAddField>

                                {showSectionSelector ? (
                                    <QuickAddField label="Section">
                                        <Select
                                            value={effectiveSectionId || "none"}
                                            onValueChange={(value) => setManualSectionId(value === "none" ? "" : value)}
                                        >
                                            <SelectTrigger
                                                id="quickAddSection"
                                                className="border-border/60 bg-background h-11 rounded-xl px-3.5 text-sm shadow-none focus-visible:ring-0 [&>svg:last-child]:hidden"
                                            >
                                                <span className="flex min-w-0 items-center gap-1.5">
                                                    <Rows3 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                    <span className="truncate">
                                                        {effectiveSectionId ? sections.find((section) => section.id === effectiveSectionId)?.name : "No section"}
                                                    </span>
                                                </span>
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="none">No section</SelectItem>
                                                {sections.map((section) => (
                                                    <SelectItem key={section.id} value={section.id}>
                                                        {section.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </QuickAddField>
                                ) : null}

                                <QuickAddField label="Date">
                                    <div className="grid gap-2">
                                        <TaskDueDatePicker
                                            id="quickAddDue"
                                            value={effectiveDueDate}
                                            onChange={(value) => setManualDueDate(value)}
                                            placeholder="Date"
                                            allowClear
                                            className={cn(ACTION_CHIP_CLASS, "h-11 w-full justify-between px-3.5 py-0 text-sm")}
                                        />
                                        {(effectiveDueDate || effectiveDueTime) ? (
                                            <TimeSelectField
                                                id="quickAddDueTime"
                                                value={effectiveDueTime}
                                                onChange={setManualDueTime}
                                                allowClear
                                                clearLabel="No time"
                                                placeholder="Time"
                                                className={cn(ACTION_CHIP_CLASS, "h-11 w-full justify-between px-3.5 py-0 font-mono text-sm")}
                                            />
                                        ) : null}
                                    </div>
                                </QuickAddField>

                                <QuickAddField label="Reminder">
                                    <Select
                                        value={effectiveReminderOffset || "none"}
                                        onValueChange={(value) => setManualReminderOffset(value === "none" ? "" : value)}
                                    >
                                        <SelectTrigger
                                            id="quickAddReminder"
                                            className={cn(ACTION_CHIP_CLASS, "h-11 w-full justify-between px-3.5 [&>svg:last-child]:hidden")}
                                        >
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">
                                                    {parsedReminderOffsetMinutes != null ? getReminderOffsetLabel(parsedReminderOffsetMinutes) : "No reminder"}
                                                </span>
                                            </span>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No reminder</SelectItem>
                                            {REMINDER_OFFSET_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={String(option.value)}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </QuickAddField>

                                <QuickAddField label="Repeat">
                                    <Select
                                        value={effectiveRecurrenceRule || "none"}
                                        onValueChange={(value) => setManualRecurrenceRule(value === "none" ? "" : value as RecurrenceRule)}
                                    >
                                        <SelectTrigger
                                            id="quickAddRecurrence"
                                            className={cn(ACTION_CHIP_CLASS, "h-11 w-full justify-between px-3.5 [&>svg:last-child]:hidden")}
                                        >
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">
                                                    {effectiveRecurrenceRule ? getRecurrenceLabel(effectiveRecurrenceRule) : "Does not repeat"}
                                                </span>
                                            </span>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Does not repeat</SelectItem>
                                            {RECURRENCE_RULE_OPTIONS.map((option) => (
                                                <SelectItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </QuickAddField>

                                <QuickAddField label="Priority">
                                    <Select
                                        value={effectivePriority || "none"}
                                        onValueChange={(value) => setManualPriority(value === "none" ? "" : value as typeof effectivePriority)}
                                    >
                                        <SelectTrigger
                                            id="quickAddPriority"
                                            className={cn(ACTION_CHIP_CLASS, "h-11 w-full justify-between px-3.5 [&>svg:last-child]:hidden")}
                                        >
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                <Flag className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <SelectValue placeholder="No priority" />
                                            </span>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No priority</SelectItem>
                                            <SelectItem value="high">High</SelectItem>
                                            <SelectItem value="medium">Medium</SelectItem>
                                            <SelectItem value="low">Low</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </QuickAddField>

                                <QuickAddField label="Duration">
                                    <Popover open={estimateOpen} onOpenChange={setEstimateOpen}>
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                className={cn(ACTION_CHIP_CLASS, "h-11 w-full justify-start px-3.5")}
                                            >
                                                <Hourglass className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">
                                                    {parsedEstimateMinutes && !Number.isNaN(parsedEstimateMinutes)
                                                        ? formatEstimateLabel(parsedEstimateMinutes)
                                                        : "No estimate"}
                                                </span>
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent align="start" className="w-[18rem] rounded-[1rem] p-3">
                                            <div className="space-y-3">
                                                <div className="flex flex-wrap gap-2">
                                                    {ESTIMATE_PRESETS.map((minutes) => {
                                                        const active = effectiveEstimatedMinutes === String(minutes);

                                                        return (
                                                            <button
                                                                key={minutes}
                                                                type="button"
                                                                onClick={() => {
                                                                    setManualEstimatedMinutes(String(minutes));
                                                                    setEstimateOpen(false);
                                                                }}
                                                                className={cn(
                                                                    "inline-flex items-center rounded-full border px-3 py-1.5 text-sm transition-colors",
                                                                    active
                                                                        ? "border-border bg-secondary text-foreground"
                                                                        : "border-border/70 bg-background text-muted-foreground hover:bg-secondary hover:text-foreground",
                                                                )}
                                                            >
                                                                {formatEstimateLabel(minutes)}
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Input
                                                        id="quickAddEstimate"
                                                        type="number"
                                                        min="1"
                                                        placeholder="45"
                                                        value={effectiveEstimatedMinutes}
                                                        onChange={(event) => setManualEstimatedMinutes(event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter") {
                                                                event.preventDefault();
                                                                setEstimateOpen(false);
                                                            }
                                                        }}
                                                        className="h-10 rounded-xl"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => {
                                                            setManualEstimatedMinutes("");
                                                            setEstimateOpen(false);
                                                        }}
                                                    >
                                                        Clear
                                                    </Button>
                                                </div>
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </QuickAddField>

                                <QuickAddField label="Labels">
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                className={cn(ACTION_CHIP_CLASS, "h-11 w-full justify-start px-3.5")}
                                            >
                                                <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">
                                                    {effectiveLabelNames.length > 0 ? `${effectiveLabelNames.length} label${effectiveLabelNames.length > 1 ? "s" : ""}` : "Labels"}
                                                </span>
                                            </button>
                                        </PopoverTrigger>
                                        <PopoverContent align="start" className="w-[18rem] rounded-[1rem] p-3">
                                            <div className="space-y-3">
                                                <Input
                                                    placeholder="Type labels, comma-separated..."
                                                    value={manualLabelsInput ?? formatTaskLabelInput(effectiveLabelNames.map((label) => ({ name: label })))}
                                                    onChange={(event) => setManualLabelsInput(event.target.value)}
                                                    className="h-10 rounded-xl"
                                                />
                                                {taskLabels.length > 0 ? (
                                                    <div className="grid gap-1 border-t border-border/60 pt-3">
                                                        {taskLabels.map((label) => {
                                                            const active = effectiveLabelNames.includes(label.name);
                                                            return (
                                                                <button
                                                                    key={label.id}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const nextSet = new Set(effectiveLabelNames);
                                                                        if (nextSet.has(label.name)) nextSet.delete(label.name);
                                                                        else nextSet.add(label.name);
                                                                        setManualLabelsInput(Array.from(nextSet).join(", "));
                                                                    }}
                                                                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                                                                >
                                                                    <TaskLabelBadge label={label} />
                                                                    {active && <Check className="h-4 w-4 text-primary" />}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                </QuickAddField>
                            </div>
                        </section>
                    ) : null}
                </div>
            </div>
        </div>
    );

    return (
        <>
            <Dialog open={open} onOpenChange={handleOpenChange}>
                <DialogContent className="sm:!max-w-none w-[min(92vw,640px)] max-h-[calc(100vh-2rem)] gap-0 overflow-hidden rounded-2xl border-border/60 bg-background p-0 shadow-2xl">
                    <DialogHeader className="sr-only">
                        <DialogTitle>Quick Add</DialogTitle>
                        <DialogDescription>
                            Add a task with project, deadline, labels, reminder, recurrence, priority, and duration controls.
                        </DialogDescription>
                    </DialogHeader>
                    {quickAddContent}
                </DialogContent>
            </Dialog>

            <Dialog open={discardDialogOpen} onOpenChange={setDiscardDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Discard quick add changes?</DialogTitle>
                        <DialogDescription>
                            Your draft hasn&apos;t been saved.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDiscardDialogOpen(false)}>
                            Keep editing
                        </Button>
                        <Button variant="destructive" onClick={handleConfirmDiscard}>
                            Discard changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
