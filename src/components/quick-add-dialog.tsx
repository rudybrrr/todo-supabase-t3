"use client";

import { Bell, Flag, Folder, Hourglass, Paperclip, Plus, Repeat, Rows3, SendHorizontal } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { useData } from "~/components/data-provider";
import { TaskDueDatePicker } from "~/components/task-due-date-picker";
import { Button } from "~/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { useTaskSections } from "~/hooks/use-task-sections";
import { parseQuickAddInput, type QuickAddMatchedToken } from "~/lib/quick-add-parser";
import { getRecurrenceLabel, RECURRENCE_RULE_OPTIONS } from "~/lib/task-recurrence";
import {
    getReminderOffsetLabel,
    getReminderOffsetMinutesFromInput,
    REMINDER_OFFSET_OPTIONS,
} from "~/lib/task-reminders";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { createTask, uploadTaskAttachments } from "~/lib/task-actions";
import { getDateInputValue } from "~/lib/task-views";
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
    "h-10 w-auto max-w-full rounded-full border border-border/70 bg-background px-4 text-sm font-medium shadow-none transition-colors hover:bg-secondary hover:text-foreground focus-visible:border-ring focus-visible:ring-0";

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

function getTokenHighlightClass(kind: QuickAddMatchedToken["kind"]) {
    if (kind === "project") {
        return "rounded-[0.35rem] bg-accent/40 text-foreground";
    }

    if (kind === "date") {
        return "rounded-[0.35rem] bg-secondary text-foreground";
    }

    if (kind === "priority") {
        return "rounded-[0.35rem] bg-destructive/12 text-destructive";
    }

    return "rounded-[0.35rem] bg-muted text-foreground";
}

function renderHighlightedComposerText(input: string, tokens: QuickAddMatchedToken[], placeholder: string) {
    if (!input) {
        return <span className="text-muted-foreground/75">{placeholder}</span>;
    }

    const children: ReactNode[] = [];
    let cursor = 0;

    tokens.forEach((token, index) => {
        if (token.start > cursor) {
            children.push(
                <span key={`text-${index}-${cursor}`}>
                    {input.slice(cursor, token.start)}
                </span>,
            );
        }

        children.push(
            <span key={`token-${token.kind}-${token.start}-${token.end}`} className={getTokenHighlightClass(token.kind)}>
                {input.slice(token.start, token.end)}
            </span>,
        );

        cursor = token.end;
    });

    if (cursor < input.length) {
        children.push(<span key={`tail-${cursor}`}>{input.slice(cursor)}</span>);
    }

    if (input.endsWith("\n")) {
        children.push(<span key="trailing-newline">{"\n"}</span>);
    }

    return children;
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
    const { userId, lists, profile } = useData();
    const { upsertTask } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const inputHighlightRef = useRef<HTMLDivElement>(null);
    const defaultListId = useMemo(() => {
        const inbox = lists.find((list) => list.name.toLowerCase() === "inbox") ?? lists[0];
        return defaults?.listId ?? inbox?.id ?? "";
    }, [defaults?.listId, lists]);
    const defaultDueDate = useMemo(
        () => defaults?.dueDate ? getDateInputValue(defaults.dueDate) : "",
        [defaults?.dueDate],
    );

    const [inputValue, setInputValue] = useState("");
    const [manualListId, setManualListId] = useState<string | undefined>(undefined);
    const [manualSectionId, setManualSectionId] = useState<string | undefined>(undefined);
    const [manualPriority, setManualPriority] = useState<"high" | "medium" | "low" | "" | undefined>(undefined);
    const [manualDueDate, setManualDueDate] = useState<string | undefined>(undefined);
    const [manualReminderOffset, setManualReminderOffset] = useState<string | undefined>(undefined);
    const [manualRecurrenceRule, setManualRecurrenceRule] = useState<RecurrenceRule | "" | undefined>(undefined);
    const [manualEstimatedMinutes, setManualEstimatedMinutes] = useState<string | undefined>(undefined);
    const [description, setDescription] = useState("");
    const [expanded, setExpanded] = useState(false);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [estimateOpen, setEstimateOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const parsedInput = useMemo(() => parseQuickAddInput(inputValue, lists), [inputValue, lists]);
    const effectiveListId = manualListId ?? parsedInput.listId ?? defaultListId;
    const activeList = lists.find((list) => list.id === effectiveListId) ?? null;
    const sectionsEnabled = Boolean(activeList && activeList.name.toLowerCase() !== "inbox");
    const { sections, loading: sectionsLoading } = useTaskSections(effectiveListId || null, { enabled: sectionsEnabled });
    const defaultSectionId = useMemo(() => {
        if (!defaults?.sectionId || !defaults?.listId) return "";
        return defaults.listId === effectiveListId ? defaults.sectionId : "";
    }, [defaults?.listId, defaults?.sectionId, effectiveListId]);
    const effectiveSectionId = manualSectionId ?? defaultSectionId;
    const showSectionSelector = sectionsEnabled && (sectionsLoading || sections.length > 0 || Boolean(effectiveSectionId));
    const effectivePriority = manualPriority ?? parsedInput.priority ?? "";
    const effectiveDueDate = manualDueDate ?? parsedInput.dueDate ?? defaultDueDate;
    const effectiveReminderOffset = manualReminderOffset ?? "";
    const parsedReminderOffsetMinutes = getReminderOffsetMinutesFromInput(effectiveReminderOffset);
    const effectiveRecurrenceRule = manualRecurrenceRule ?? "";
    const effectiveEstimatedMinutes = manualEstimatedMinutes
        ?? (parsedInput.estimatedMinutes ? String(parsedInput.estimatedMinutes) : "");
    const parsedEstimateMinutes = effectiveEstimatedMinutes ? Number.parseInt(effectiveEstimatedMinutes, 10) : null;
    const cleanedTitle = parsedInput.title.trim();
    const showEmptyTitleWarning = inputValue.trim() && !cleanedTitle && parsedInput.chips.length > 0;

    useEffect(() => {
        if (!open) return;

        setInputValue(defaults?.title ?? "");
        setManualListId(undefined);
        setManualSectionId(undefined);
        setManualPriority(undefined);
        setManualDueDate(undefined);
        setManualReminderOffset(undefined);
        setManualRecurrenceRule(undefined);
        setManualEstimatedMinutes(undefined);
        setDescription("");
        setExpanded(false);
        setAttachments([]);
        setEstimateOpen(false);
        if (inputRef.current) {
            inputRef.current.scrollTop = 0;
            inputRef.current.scrollLeft = 0;
        }
        if (inputHighlightRef.current) {
            inputHighlightRef.current.style.transform = "translate(0px, 0px)";
        }
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

    useEffect(() => {
        if (!open) return;

        const frame = window.requestAnimationFrame(() => {
            inputRef.current?.focus();
        });

        return () => window.cancelAnimationFrame(frame);
    }, [open]);

    async function handleSubmit() {
        if (!userId || !effectiveListId || !cleanedTitle) return;
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
            const createdTask = await createTask(supabase, {
                userId,
                listId: effectiveListId,
                sectionId: effectiveSectionId || null,
                title: cleanedTitle,
                description,
                dueDate: effectiveDueDate || null,
                reminderOffsetMinutes: parsedReminderOffsetMinutes,
                recurrenceRule: effectiveRecurrenceRule || null,
                priority: effectivePriority || null,
                estimatedMinutes:
                    parsedEstimateMinutes && !Number.isNaN(parsedEstimateMinutes) ? parsedEstimateMinutes : null,
                preferredTimeZone: profile?.timezone,
            });

            if (attachments.length > 0) {
                await uploadTaskAttachments(supabase, userId, createdTask.id, effectiveListId, attachments);
            }

            upsertTask(createdTask, { suppressRealtimeEcho: true });
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
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-xl gap-0 rounded-[1.5rem] border-border/60 p-0">
                <DialogHeader className="sr-only">
                    <DialogTitle>Quick Add</DialogTitle>
                    <DialogDescription>Add a task with project, date, priority, and duration controls.</DialogDescription>
                </DialogHeader>

                <div className="p-3 sm:p-4">
                    <div className="overflow-hidden rounded-[1.2rem] border border-border/70 bg-card/70 shadow-[0_18px_36px_rgba(17,18,15,0.08)]">
                        <div className="p-3.5 sm:p-4">
                            <div className="relative">
                                <div
                                    aria-hidden="true"
                                    className="pointer-events-none absolute inset-0 overflow-hidden text-[1.02rem] leading-7"
                                >
                                    <div
                                        ref={inputHighlightRef}
                                        className="min-h-20 whitespace-pre-wrap break-words text-foreground [word-break:break-word]"
                                    >
                                        {renderHighlightedComposerText(
                                            inputValue,
                                            parsedInput.tokens,
                                            "Finish chemistry lab #science tomorrow p1 45m",
                                        )}
                                    </div>
                                </div>

                                <textarea
                                    ref={inputRef}
                                    id="quickAddTitle"
                                    rows={3}
                                    aria-label="Task"
                                    spellCheck={false}
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    value={inputValue}
                                    onChange={(event) => setInputValue(event.target.value)}
                                    onScroll={(event) => {
                                        if (!inputHighlightRef.current) return;

                                        inputHighlightRef.current.style.transform = `translate(${-event.currentTarget.scrollLeft}px, ${-event.currentTarget.scrollTop}px)`;
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key === "Enter" && !event.shiftKey) {
                                            event.preventDefault();
                                            void handleSubmit();
                                        }
                                    }}
                                    className="relative min-h-20 w-full resize-none border-0 bg-transparent p-0 text-[1.02rem] leading-7 text-transparent outline-none focus-visible:ring-0"
                                    style={{ caretColor: "hsl(var(--foreground))" }}
                                />
                            </div>
                        </div>

                        {showEmptyTitleWarning ? (
                            <div className="border-t border-border/60 px-3.5 py-2.5 text-sm text-destructive sm:px-4">
                                Add a task name.
                            </div>
                        ) : null}

                        {expanded ? (
                            <div className="space-y-3 border-t border-border/60 px-3.5 py-3.5 sm:px-4">
                                <Textarea
                                    id="quickAddNotes"
                                    placeholder="Description"
                                    value={description}
                                    onChange={(event) => setDescription(event.target.value)}
                                    className="min-h-20 border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                                />

                                <div className="flex flex-wrap items-center gap-2">
                                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-border/70 bg-background px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
                                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                                        Attach
                                        <input
                                            className="hidden"
                                            type="file"
                                            multiple
                                            onChange={(event) => setAttachments(Array.from(event.target.files ?? []))}
                                        />
                                    </label>

                                    {attachments.map((file) => (
                                        <span
                                            key={`${file.name}-${file.size}-${file.lastModified}`}
                                            className="inline-flex max-w-full items-center rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs text-muted-foreground"
                                        >
                                            <span className="truncate">{file.name}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ) : null}

                        <div className="border-t border-border/60 px-3.5 py-3 sm:px-4">
                            <div className="flex items-end gap-2">
                                <div className="flex flex-1 flex-wrap items-center gap-2">
                                    <Select
                                        value={effectiveListId || ""}
                                        onValueChange={(value) => {
                                            setManualListId(value);
                                            setManualSectionId("");
                                        }}
                                    >
                                        <SelectTrigger id="quickAddProject" className={cn(ACTION_CHIP_CLASS, "max-w-[14rem]")}>
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                <SelectValue placeholder="Project" />
                                            </span>
                                        </SelectTrigger>
                                        <SelectContent>
                                            {lists.map((list) => (
                                                <SelectItem key={list.id} value={list.id}>
                                                    {list.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>

                                    {showSectionSelector ? (
                                        <Select value={effectiveSectionId || "none"} onValueChange={(value) => setManualSectionId(value === "none" ? "" : value)}>
                                            <SelectTrigger id="quickAddSection" className={cn(ACTION_CHIP_CLASS, "max-w-[12rem]")}>
                                                <span className="inline-flex min-w-0 items-center gap-2">
                                                    <Rows3 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                    <SelectValue placeholder="Section" />
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

                                    <TaskDueDatePicker
                                        id="quickAddDue"
                                        value={effectiveDueDate}
                                        onChange={(value) => setManualDueDate(value)}
                                        placeholder="Date"
                                        allowClear
                                        className={cn(ACTION_CHIP_CLASS, "w-auto")}
                                    />

                                    <Select
                                        value={effectiveReminderOffset || "none"}
                                        onValueChange={(value) => setManualReminderOffset(value === "none" ? "" : value)}
                                    >
                                        <SelectTrigger id="quickAddReminder" className={cn(ACTION_CHIP_CLASS, "max-w-[12rem]")}>
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
                                        <SelectTrigger id="quickAddRecurrence" className={cn(ACTION_CHIP_CLASS, "max-w-[12rem]")}>
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
                                        <SelectTrigger id="quickAddPriority" className={cn(ACTION_CHIP_CLASS, "max-w-[12rem]")}>
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
                                                className={cn(ACTION_CHIP_CLASS, "inline-flex min-w-[8rem] items-center justify-start gap-2")}
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

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-10 rounded-full border border-transparent px-4 text-sm font-medium text-muted-foreground hover:border-border/60 hover:bg-secondary hover:text-foreground"
                                        onClick={() => setExpanded((current) => !current)}
                                    >
                                        <Plus className="h-4 w-4" />
                                        {expanded ? "Less" : "More"}
                                    </Button>
                                </div>

                                <Button
                                    type="button"
                                    size="icon"
                                    className="mb-0.5 ml-auto h-10 w-10 rounded-full"
                                    onClick={() => void handleSubmit()}
                                    disabled={saving || !cleanedTitle || !effectiveListId}
                                    aria-label={saving ? "Saving task" : "Add task"}
                                    title={saving ? "Saving..." : "Add task"}
                                >
                                    <SendHorizontal className="h-4 w-4" />
                                    <span className="sr-only">{saving ? "Saving..." : "Add task"}</span>
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
