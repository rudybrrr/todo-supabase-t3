"use client";

import { Bell, Flag, Folder, Hourglass, Paperclip, Repeat, Rows3, SendHorizontal, Tag, Check, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

    return (
        <>
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-xl gap-0 rounded-[1.5rem] border-border/60 p-0">
                <DialogHeader className="sr-only">
                    <DialogTitle>Quick Add</DialogTitle>
                    <DialogDescription>Add a task with project, deadline, labels, reminder, recurrence, priority, and duration controls.</DialogDescription>
                </DialogHeader>

                <div className="p-3 sm:p-4">
                    <div className="overflow-hidden rounded-[1.2rem] border border-border/40 bg-card shadow-[0_18px_36px_rgba(17,18,15,0.08)]">
                        <div className="p-3.5 sm:p-4">
                            <TaskSyntaxComposer
                                ariaLabel="Task"
                                rows={2}
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
                            />

                            {parsedInput.chips.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {parsedInput.chips.map((chip, index) => (
                                        <span
                                            key={`${chip.kind}-${chip.value}-${index}`}
                                            className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/85 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                                        >
                                            <span className="uppercase tracking-[0.14em] text-[10px]">{chip.label}</span>
                                            <span className="text-foreground">{chip.value}</span>
                                        </span>
                                    ))}
                                </div>
                            ) : null}
                        </div>

                        {showEmptyTitleWarning ? (
                            <div className="px-4 py-2 text-sm text-destructive">
                                Add a task name.
                            </div>
                        ) : null}

                        <div className="px-3.5 pb-2 pt-1 sm:px-4">
                            <Textarea
                                id="quickAddNotes"
                                placeholder="Notes"
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                className="min-h-[60px] w-full resize-none rounded-md border border-border/70 bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground/60"
                            />
                        </div>

                        <div className="px-3.5 py-3 sm:px-4 pb-4">
                            <div className="flex flex-wrap items-center gap-1.5 border-b border-transparent pb-3">

                                    <TaskDueDatePicker
                                        id="quickAddDue"
                                        value={effectiveDueDate}
                                        onChange={(value) => setManualDueDate(value)}
                                        placeholder="Date"
                                        allowClear
                                        className={cn(ACTION_CHIP_CLASS, "w-auto")}
                                    />

                                    {(effectiveDueDate || effectiveDueTime) ? (
                                        <TimeSelectField
                                            id="quickAddDueTime"
                                            value={effectiveDueTime}
                                            onChange={setManualDueTime}
                                            allowClear
                                            clearLabel="No time"
                                            placeholder="Time"
                                            className={cn(ACTION_CHIP_CLASS, "max-w-[11rem] font-mono")}
                                        />
                                    ) : null}

                                    <Select
                                        value={effectiveReminderOffset || "none"}
                                        onValueChange={(value) => setManualReminderOffset(value === "none" ? "" : value)}
                                    >
                                        <SelectTrigger id="quickAddReminder" className={cn(ACTION_CHIP_CLASS, "max-w-[12rem] [&>svg:last-child]:hidden")}>
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                <Bell className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">
                                                    {parsedReminderOffsetMinutes != null ? getReminderOffsetLabel(parsedReminderOffsetMinutes) : "Reminder"}
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

                                    <Select
                                        value={effectiveRecurrenceRule || "none"}
                                        onValueChange={(value) => setManualRecurrenceRule(value === "none" ? "" : value as RecurrenceRule)}
                                    >
                                        <SelectTrigger id="quickAddRecurrence" className={cn(ACTION_CHIP_CLASS, "max-w-[12rem] [&>svg:last-child]:hidden")}>
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                <Repeat className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">
                                                    {effectiveRecurrenceRule ? getRecurrenceLabel(effectiveRecurrenceRule) : "Repeat"}
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

                                    <Select
                                        value={effectivePriority || "none"}
                                        onValueChange={(value) => setManualPriority(value === "none" ? "" : value as typeof effectivePriority)}
                                    >
                                        <SelectTrigger id="quickAddPriority" className={cn(ACTION_CHIP_CLASS, "max-w-[12rem] [&>svg:last-child]:hidden")}>
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                <Flag className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <SelectValue placeholder="Priority" />
                                            </span>
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">No priority</SelectItem>
                                            <SelectItem value="high">High</SelectItem>
                                            <SelectItem value="medium">Medium</SelectItem>
                                            <SelectItem value="low">Low</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Popover open={estimateOpen} onOpenChange={setEstimateOpen}>
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                className={cn(ACTION_CHIP_CLASS, "inline-flex items-center gap-2")}
                                            >
                                                <Hourglass className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <span className="truncate">
                                                    {parsedEstimateMinutes && !Number.isNaN(parsedEstimateMinutes)
                                                        ? formatEstimateLabel(parsedEstimateMinutes)
                                                        : "Duration"}
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
                                                        className="h-10 rounded-full"
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

                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <button
                                                type="button"
                                                className={cn(ACTION_CHIP_CLASS, "inline-flex max-w-[12rem] items-center justify-start gap-2")}
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
                                                    className="h-10 rounded-md"
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

                                    <label className={cn(ACTION_CHIP_CLASS, "inline-flex cursor-pointer items-center gap-2")}>
                                        <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <div className="flex flex-col items-start leading-tight">
                                            <span className="truncate">{attachments.length > 0 ? `${attachments.length} file${attachments.length > 1 ? "s" : ""}` : "Attach"}</span>
                                        </div>
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
                                                
                                                setAttachments(prev => [...prev, ...selectedFiles]);
                                                event.target.value = "";
                                            }}
                                        />
                                    </label>


                                </div>

                                {attachments.length > 0 && (
                                    <div className="mt-4 flex flex-col gap-1.5 border-t border-border/40 pt-3">
                                        <div className="ml-1 flex items-center justify-between pr-1">
                                            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                                Attachments
                                            </div>
                                            <div className="text-[10px] font-medium tabular-nums text-muted-foreground/70">
                                                {(calculateTotalSize(attachments) / (1024 * 1024)).toFixed(1)} / {MAX_ATTACHMENT_SIZE_MB} MB
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            {attachments.map((file, i) => {
                                                const progress = uploadProgress[file.name];

                                                return (
                                                    <div key={i} className="group relative flex max-w-[14rem] flex-col overflow-hidden rounded-md border border-border/60 bg-muted/30 pb-0.5 shadow-sm">
                                                        <div className="flex items-center gap-1.5 py-1 pl-2 pr-1 text-xs text-muted-foreground">
                                                            <Paperclip className="h-3 w-3 shrink-0" />
                                                            <span className="truncate">{file.name}</span>
                                                            {!saving && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                                                                    className="ml-0.5 rounded-sm p-0.5 opacity-60 hover:bg-muted-foreground/20 hover:opacity-100"
                                                                >
                                                                    <X className="h-3 w-3" />
                                                                </button>
                                                            )}
                                                        </div>
                                                        {saving && progress != null && (
                                                            <div className="h-0.5 w-full bg-muted/50">
                                                                <div 
                                                                    className="h-full bg-primary transition-all duration-300" 
                                                                    style={{ width: `${progress}%` }}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3">
                                    <div className="flex items-center gap-1.5">
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
                                            <SelectTrigger id="quickAddProject" className="h-8 w-auto min-w-[6rem] max-w-[12rem] rounded-md border-0 bg-transparent px-2.5 text-sm font-medium text-foreground shadow-none hover:bg-muted/50 focus:ring-0 [&>svg:last-child]:hidden">
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
                                        
                                        {showSectionSelector ? (
                                            <Select value={effectiveSectionId || "none"} onValueChange={(value) => setManualSectionId(value === "none" ? "" : value)}>
                                                <SelectTrigger id="quickAddSection" className="h-8 w-auto min-w-0 max-w-[12rem] rounded-md border-0 bg-transparent px-2.5 text-sm text-muted-foreground shadow-none hover:bg-muted/50 focus:ring-0 [&>svg:last-child]:hidden">
                                                    <span className="flex min-w-0 items-center gap-1.5">
                                                        <Rows3 className="h-3.5 w-3.5 shrink-0" />
                                                        <span className="truncate">
                                                            {effectiveSectionId ? sections.find(s => s.id === effectiveSectionId)?.name : "(No section)"}
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
                                        ) : null}
                                    </div>
                                    <div className="flex items-center gap-2">
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
                                            <SendHorizontal className="h-3.5 w-3.5 mr-1.5" />
                                            {saving ? "Saving..." : "Add task"}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
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
