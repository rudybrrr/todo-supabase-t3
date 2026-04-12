"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bell,
  CalendarRange,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useData } from "~/components/data-provider";
import { TaskAttachmentUpload } from "~/components/task-attachment-upload";
import { TaskCommentsSection } from "~/components/task-comments-section";
import { TaskDetailAssignee } from "~/components/task-detail-assignee";
import { TaskLabelBadge } from "~/components/task-label-badge";
import { TaskSyntaxComposer } from "~/components/task-syntax-composer";
import { TaskStepsSection } from "~/components/task-steps-section";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { TaskDueDatePicker } from "~/components/task-due-date-picker";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Textarea } from "~/components/ui/textarea";
import { TimeSelectField } from "~/components/ui/time-select-field";
import { useTaskComments } from "~/hooks/use-task-comments";
import { useTaskDataset } from "~/hooks/use-task-dataset";
import { useTaskSections } from "~/hooks/use-task-sections";
import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";
import {
  applyQuickAddSuggestion,
  getQuickAddActiveSuggestionState,
  parseQuickAddInput,
} from "~/lib/quick-add-parser";
import { createProject } from "~/lib/project-actions";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { getNextTaskPosition } from "~/lib/task-ordering";
import {
  calculateTotalSize,
  formatAttachmentSize,
  getAttachmentDisplayName,
  getAttachmentExtension,
  isImageAttachment,
  MAX_ATTACHMENT_SIZE_MB,
} from "~/lib/task-attachments";
import {
  deleteTask,
  deleteTaskAttachment,
  completeTaskWithRecurrence,
  replaceTaskLabels,
  updateTask,
} from "~/lib/task-actions";
import {
  buildTaskDeadlineMutation,
  getDateInputValue,
  getTimeInputValue,
} from "~/lib/task-deadlines";
import {
  formatTaskLabelInput,
  normalizeTaskLabelName,
  parseTaskLabelInput,
  sortTaskLabels,
} from "~/lib/task-labels";
import { canTaskRecur, RECURRENCE_RULE_OPTIONS } from "~/lib/task-recurrence";
import {
  buildTaskReminderMutation,
  getReminderOffsetInputValue,
  getReminderOffsetLabel,
  getReminderOffsetMinutesFromInput,
  REMINDER_OFFSET_OPTIONS,
} from "~/lib/task-reminders";
import type {
  RecurrenceRule,
  TodoImageRow,
  TodoList,
} from "~/lib/types";
import { cn } from "~/lib/utils";

type TaskDetailFormSnapshot = {
  title: string;
  description: string;
  labelsInput: string;
  priority: "high" | "medium" | "low" | "";
  dueDate: string;
  dueTime: string;
  reminderOffsetMinutes: string;
  recurrenceRule: RecurrenceRule | "";
  estimatedMinutes: string;
  listId: string;
  sectionId: string;
  assigneeUserId: string;
};

type TaskDetailFormSyncInput = Pick<
  TaskDatasetRecord,
  | "id"
  | "title"
  | "description"
  | "labels"
  | "priority"
  | "due_date"
  | "deadline_on"
  | "deadline_at"
  | "reminder_offset_minutes"
  | "recurrence_rule"
  | "estimated_minutes"
  | "list_id"
  | "section_id"
  | "assignee_user_id"
  | "is_done"
>;

type TaskDetailSnapshotComparisonContext = {
  sectionsEnabled: boolean;
  sectionsLoading: boolean;
  validSectionIds: ReadonlySet<string>;
};

const PENDING_PROJECT_SELECT_VALUE = "__pending_new_project__";

function createTaskDetailFormSnapshot(
  task: Pick<
    TaskDatasetRecord,
    | "title"
    | "description"
    | "labels"
    | "priority"
    | "due_date"
    | "deadline_on"
    | "deadline_at"
    | "reminder_offset_minutes"
    | "recurrence_rule"
    | "estimated_minutes"
    | "list_id"
    | "section_id"
    | "assignee_user_id"
  >,
  timeZone?: string | null,
): TaskDetailFormSnapshot {
  return {
    title: task.title,
    description: task.description ?? "",
    labelsInput: formatTaskLabelInput(task.labels ?? []),
    priority: task.priority ?? "",
    dueDate: getDateInputValue(task, timeZone),
    dueTime: getTimeInputValue(task, timeZone),
    reminderOffsetMinutes: getReminderOffsetInputValue(
      task.reminder_offset_minutes,
    ),
    recurrenceRule: task.recurrence_rule ?? "",
    estimatedMinutes: task.estimated_minutes
      ? String(task.estimated_minutes)
      : "",
    listId: task.list_id,
    sectionId: task.section_id ?? "",
    assigneeUserId: task.assignee_user_id ?? "",
  };
}

function areTaskDetailFormSnapshotsEqual(
  a: TaskDetailFormSnapshot,
  b: TaskDetailFormSnapshot,
) {
  return (
    a.title === b.title &&
    a.description === b.description &&
    a.labelsInput === b.labelsInput &&
    a.priority === b.priority &&
    a.dueDate === b.dueDate &&
    a.dueTime === b.dueTime &&
    a.reminderOffsetMinutes === b.reminderOffsetMinutes &&
    a.recurrenceRule === b.recurrenceRule &&
    a.estimatedMinutes === b.estimatedMinutes &&
    a.listId === b.listId &&
    a.sectionId === b.sectionId &&
    a.assigneeUserId === b.assigneeUserId
  );
}

function normalizeTaskDetailLineBreaks(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

function normalizeTaskDetailRequiredText(value: string) {
  return normalizeTaskDetailLineBreaks(value).trim();
}

function normalizeTaskDetailOptionalText(value: string) {
  const normalized = normalizeTaskDetailLineBreaks(value).trim();
  return normalized ? normalized : "";
}

function normalizeTaskDetailLabelsInput(value: string) {
  return parseTaskLabelInput(value)
    .map((label) => normalizeTaskLabelName(label).toLowerCase())
    .sort((a, b) => a.localeCompare(b))
    .join("|");
}

function normalizeTaskDetailEstimatedMinutes(value: string) {
  const normalized = value.trim();

  if (!normalized) return "";
  if (/^\d+$/.test(normalized)) {
    return String(Number.parseInt(normalized, 10));
  }

  return normalized;
}

function normalizeTaskDetailSectionId(
  sectionId: string,
  context: TaskDetailSnapshotComparisonContext,
) {
  const normalizedSectionId = sectionId || "";

  if (!context.sectionsEnabled) return "";
  if (context.sectionsLoading) return normalizedSectionId;
  if (!normalizedSectionId) return "";

  return context.validSectionIds.has(normalizedSectionId)
    ? normalizedSectionId
    : "";
}

function createComparableTaskDetailFormSnapshot(
  snapshot: TaskDetailFormSnapshot,
  context: TaskDetailSnapshotComparisonContext,
): TaskDetailFormSnapshot {
  return {
    title: normalizeTaskDetailRequiredText(snapshot.title),
    description: normalizeTaskDetailOptionalText(snapshot.description),
    labelsInput: normalizeTaskDetailLabelsInput(snapshot.labelsInput),
    priority: snapshot.priority || "",
    dueDate: snapshot.dueDate || "",
    dueTime: snapshot.dueTime || "",
    reminderOffsetMinutes: snapshot.reminderOffsetMinutes || "",
    recurrenceRule: snapshot.recurrenceRule || "",
    estimatedMinutes: normalizeTaskDetailEstimatedMinutes(
      snapshot.estimatedMinutes,
    ),
    listId: snapshot.listId,
    sectionId: normalizeTaskDetailSectionId(snapshot.sectionId, context),
    assigneeUserId: snapshot.assigneeUserId || "",
  };
}

function TaskDetailMetaField({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 py-2",
        className,
      )}
    >
      <p className="text-muted-foreground w-[5.25rem] shrink-0 pt-0.5 text-sm font-medium leading-5">
        {label}
      </p>
      <div className="min-w-0 flex-1 space-y-1.5">{children}</div>
      {hint ? (
        <div className="text-muted-foreground hidden text-sm xl:block">{hint}</div>
      ) : null}
    </div>
  );
}

function TaskDetailForm({
  task,
  lists,
  images,
  userId,
  onClose,
  previousTask,
  nextTask,
  taskPositionLabel,
  onNavigateToTask,
  onDirtyChange,
  onSaved,
  onDeleted,
}: {
  task: TaskDatasetRecord;
  lists: TodoList[];
  images: TodoImageRow[];
  userId: string;
  onClose?: () => void;
  previousTask?: TaskDatasetRecord | null;
  nextTask?: TaskDatasetRecord | null;
  taskPositionLabel?: string | null;
  onNavigateToTask?: (taskId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const { profile, refreshData } = useData();
  const {
    applyTaskPatch,
    tasks,
    taskLabels,
    refresh,
    removeTask,
    upsertTask,
    upsertTaskLabels,
    membersByListId,
  } = useTaskDataset();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [title, setTitle] = useState(task.title);
  const [composerSelection, setComposerSelection] = useState(task.title.length);
  const [selectionPosition, setSelectionPosition] = useState<number | null>(
    null,
  );
  const [description, setDescription] = useState(task.description ?? "");
  const [manualLabelsInput, setManualLabelsInput] = useState<
    string | undefined
  >(undefined);
  const [manualPriority, setManualPriority] = useState<
    "high" | "medium" | "low" | "" | undefined
  >(undefined);
  const [manualDueDate, setManualDueDate] = useState<string | undefined>(
    undefined,
  );
  const [manualDueTime, setManualDueTime] = useState<string | undefined>(
    undefined,
  );
  const [manualReminderOffsetMinutes, setManualReminderOffsetMinutes] =
    useState<string | undefined>(undefined);
  const [manualRecurrenceRule, setManualRecurrenceRule] = useState<
    RecurrenceRule | "" | undefined
  >(undefined);
  const [manualEstimatedMinutes, setManualEstimatedMinutes] = useState<
    string | undefined
  >(undefined);
  const [showMoreMeta, setShowMoreMeta] = useState(false);
  const [manualListId, setManualListId] = useState<string | undefined>(
    undefined,
  );
  const [manualSectionId, setManualSectionId] = useState<string | undefined>(
    undefined,
  );
  const [assigneeUserId, setAssigneeUserId] = useState(
    task.assignee_user_id ?? "",
  );
  const [isDone, setIsDone] = useState(task.is_done);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<
    string | null
  >(null);
  const initializedTaskIdRef = useRef<string | null>(null);
  const lastSyncedSnapshotRef = useRef<TaskDetailFormSnapshot | null>(null);
  const parsedTitleInput = useMemo(
    () => parseQuickAddInput(title, lists, { labels: taskLabels }),
    [lists, taskLabels, title],
  );
  const activeSuggestion = useMemo(
    () =>
      getQuickAddActiveSuggestionState(
        title,
        composerSelection,
        lists,
        taskLabels,
      ),
    [composerSelection, lists, taskLabels, title],
  );
  const cleanedTitle = parsedTitleInput.title.trim();
  const showEmptyTitleWarning =
    title.trim() && !cleanedTitle && parsedTitleInput.chips.length > 0;
  const effectivePriority =
    manualPriority ?? parsedTitleInput.priority ?? task.priority ?? "";
  const effectiveDueDate =
    manualDueDate ??
    parsedTitleInput.dueDate ??
    getDateInputValue(task, profile?.timezone);
  const effectiveDueTime =
    manualDueTime ??
    parsedTitleInput.dueTime ??
    getTimeInputValue(task, profile?.timezone);
  const effectiveReminderOffsetMinutes =
    manualReminderOffsetMinutes ??
    getReminderOffsetInputValue(
      parsedTitleInput.reminderOffsetMinutes ?? task.reminder_offset_minutes,
    );
  const effectiveRecurrenceRule =
    manualRecurrenceRule ??
    parsedTitleInput.recurrenceRule ??
    task.recurrence_rule ??
    "";
  const effectiveEstimatedMinutes =
    manualEstimatedMinutes ??
    (parsedTitleInput.estimatedMinutes
      ? String(parsedTitleInput.estimatedMinutes)
      : task.estimated_minutes
        ? String(task.estimated_minutes)
        : "");
  const effectiveListId =
    manualListId ??
    (parsedTitleInput.hasProjectToken
      ? parsedTitleInput.listId
      : task.list_id) ??
    "";
  const pendingProjectName =
    manualListId === undefined ? parsedTitleInput.pendingProjectName : null;
  const projectSelectValue = pendingProjectName
    ? PENDING_PROJECT_SELECT_VALUE
    : effectiveListId;
  const defaultSectionId =
    effectiveListId === task.list_id ? (task.section_id ?? "") : "";
  const effectiveSectionId = manualSectionId ?? defaultSectionId;
  const activeList = lists.find((list) => list.id === effectiveListId) ?? null;
  const sectionsEnabled = Boolean(
    activeList && activeList.name.toLowerCase() !== "inbox",
  );
  const { sections, loading: sectionsLoading } = useTaskSections(
    effectiveListId || null,
    { enabled: sectionsEnabled },
  );
  const showSectionSelector =
    sectionsEnabled &&
    (sectionsLoading || sections.length > 0 || Boolean(effectiveSectionId));
  const validSectionIds = useMemo(
    () => new Set(sections.map((section) => section.id)),
    [sections],
  );
  const activeListMembers = useMemo(
    () => membersByListId[effectiveListId] ?? [],
    [effectiveListId, membersByListId],
  );
  const currentTaskLabelNames = useMemo(
    () => parseTaskLabelInput(formatTaskLabelInput(task.labels)),
    [task.labels],
  );
  const effectiveLabelNames = useMemo(() => {
    if (manualLabelsInput != null) {
      return parseTaskLabelInput(manualLabelsInput);
    }

    if (!parsedTitleInput.hasLabelTokens) {
      return currentTaskLabelNames;
    }

    const mergedLabels = new Map(
      currentTaskLabelNames.map((labelName) => [
        labelName.toLowerCase(),
        labelName,
      ]),
    );
    parsedTitleInput.labelNames.forEach((labelName) => {
      mergedLabels.set(labelName.toLowerCase(), labelName);
    });

    return Array.from(mergedLabels.values());
  }, [
    currentTaskLabelNames,
    manualLabelsInput,
    parsedTitleInput.hasLabelTokens,
    parsedTitleInput.labelNames,
  ]);
  const labelsChanged = useMemo(() => {
    if (effectiveLabelNames.length !== currentTaskLabelNames.length)
      return true;

    const currentKeys = currentTaskLabelNames
      .map((label) => label.toLowerCase())
      .sort((a, b) => a.localeCompare(b));
    const nextKeys = effectiveLabelNames
      .map((label) => label.toLowerCase())
      .sort((a, b) => a.localeCompare(b));

    return nextKeys.some((label, index) => label !== currentKeys[index]);
  }, [currentTaskLabelNames, effectiveLabelNames]);

  const currentFormSnapshot = useMemo<TaskDetailFormSnapshot>(
    () => ({
      title: cleanedTitle,
      description,
      labelsInput: formatTaskLabelInput(
        effectiveLabelNames.map((labelName) => ({ name: labelName })),
      ),
      priority: effectivePriority,
      dueDate: effectiveDueDate,
      dueTime: effectiveDueTime,
      reminderOffsetMinutes: effectiveReminderOffsetMinutes,
      recurrenceRule: effectiveRecurrenceRule,
      estimatedMinutes: effectiveEstimatedMinutes,
      listId: effectiveListId,
      sectionId: effectiveSectionId,
      assigneeUserId,
    }),
    [
      assigneeUserId,
      cleanedTitle,
      description,
      effectiveDueDate,
      effectiveDueTime,
      effectiveEstimatedMinutes,
      effectiveLabelNames,
      effectiveListId,
      effectivePriority,
      effectiveRecurrenceRule,
      effectiveReminderOffsetMinutes,
      effectiveSectionId,
    ],
  );
  const taskSnapshot = useMemo(
    () => createTaskDetailFormSnapshot(task, profile?.timezone),
    [profile?.timezone, task],
  );
  const comparableCurrentFormSnapshot = useMemo(
    () =>
      createComparableTaskDetailFormSnapshot(currentFormSnapshot, {
        sectionsEnabled,
        sectionsLoading,
        validSectionIds,
      }),
    [currentFormSnapshot, sectionsEnabled, sectionsLoading, validSectionIds],
  );
  const comparableTaskSnapshot = useMemo(
    () =>
      createComparableTaskDetailFormSnapshot(taskSnapshot, {
        sectionsEnabled,
        sectionsLoading,
        validSectionIds,
      }),
    [sectionsEnabled, sectionsLoading, taskSnapshot, validSectionIds],
  );
  const comparableLastSyncedSnapshot = lastSyncedSnapshotRef.current
    ? createComparableTaskDetailFormSnapshot(lastSyncedSnapshotRef.current, {
        sectionsEnabled,
        sectionsLoading,
        validSectionIds,
      })
    : null;

  const syncFormState = useCallback(
    (nextTask: TaskDetailFormSyncInput) => {
      const nextSnapshot = createTaskDetailFormSnapshot(
        nextTask,
        profile?.timezone,
      );

      setTitle(nextSnapshot.title);
      setDescription(nextSnapshot.description);
      setComposerSelection(nextSnapshot.title.length);
      setSelectionPosition(nextSnapshot.title.length);
      setManualLabelsInput(undefined);
      setManualPriority(undefined);
      setManualDueDate(undefined);
      setManualDueTime(undefined);
      setManualReminderOffsetMinutes(undefined);
      setManualRecurrenceRule(undefined);
      setManualEstimatedMinutes(undefined);
      setShowMoreMeta(false);
      setManualListId(undefined);
      setManualSectionId(undefined);
      setAssigneeUserId(nextSnapshot.assigneeUserId);
      setIsDone(nextTask.is_done);
      initializedTaskIdRef.current = nextTask.id;
      lastSyncedSnapshotRef.current = nextSnapshot;
    },
    [profile?.timezone],
  );

  const projectDisplayLabel = useMemo(
    () =>
      pendingProjectName
        ? `Create ${pendingProjectName}`
        : (activeList?.name ?? "Choose a project"),
    [activeList?.name, pendingProjectName],
  );
  const activeSectionName = useMemo(
    () =>
      effectiveSectionId
        ? (sections.find((section) => section.id === effectiveSectionId)
            ?.name ?? "Selected section")
        : null,
    [effectiveSectionId, sections],
  );
  const headerContextLabel = useMemo(
    () =>
      activeSectionName
        ? `${projectDisplayLabel} / ${activeSectionName}`
        : projectDisplayLabel,
    [activeSectionName, projectDisplayLabel],
  );
  const parsedReminderOffsetMinutes = useMemo(
    () => getReminderOffsetMinutesFromInput(effectiveReminderOffsetMinutes),
    [effectiveReminderOffsetMinutes],
  );
  const reminderLabel = useMemo(
    () =>
      parsedReminderOffsetMinutes == null
        ? null
        : getReminderOffsetLabel(parsedReminderOffsetMinutes),
    [parsedReminderOffsetMinutes],
  );
  const totalAttachmentsSize = useMemo(
    () => calculateTotalSize(images),
    [images],
  );
  const reminderPreviewAt = useMemo(() => {
    const deadlinePatch = buildTaskDeadlineMutation(
      effectiveDueDate || null,
      effectiveDueTime || null,
      profile?.timezone,
    );
    return buildTaskReminderMutation(
      deadlinePatch,
      parsedReminderOffsetMinutes,
      profile?.timezone,
    ).reminder_at;
  }, [
    effectiveDueDate,
    effectiveDueTime,
    parsedReminderOffsetMinutes,
    profile?.timezone,
  ]);
  const { comments, loading: commentsLoading, addComment, removeComment } = 
    useTaskComments(task.id);

  useEffect(() => {
    const switchingTasks = initializedTaskIdRef.current !== task.id;
    const hasLocalEdits = comparableLastSyncedSnapshot
      ? !areTaskDetailFormSnapshotsEqual(
          comparableCurrentFormSnapshot,
          comparableLastSyncedSnapshot,
        )
      : false;
    const taskSnapshotChanged = comparableLastSyncedSnapshot
      ? !areTaskDetailFormSnapshotsEqual(
          comparableLastSyncedSnapshot,
          comparableTaskSnapshot,
        )
      : true;

    if (!switchingTasks && (hasLocalEdits || !taskSnapshotChanged)) {
      return;
    }

    syncFormState(task);

    if (switchingTasks) {
      setDeletingAttachmentId(null);
    }
  }, [
    comparableCurrentFormSnapshot,
    comparableLastSyncedSnapshot,
    comparableTaskSnapshot,
    syncFormState,
    task,
  ]);

  const isDirty =
    initializedTaskIdRef.current === task.id && comparableLastSyncedSnapshot
      ? !areTaskDetailFormSnapshotsEqual(
          comparableCurrentFormSnapshot,
          comparableLastSyncedSnapshot,
        )
      : false;

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
  }, [
    defaultSectionId,
    manualSectionId,
    sections,
    sectionsEnabled,
    sectionsLoading,
  ]);

  useEffect(() => {
    if (!assigneeUserId) return;
    if (
      !activeListMembers.some((member) => member.user_id === assigneeUserId)
    ) {
      setAssigneeUserId("");
    }
  }, [activeListMembers, assigneeUserId]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  async function handleSave() {
    const normalizedTitle = cleanedTitle;
    const normalizedDescription = description.trim()
      ? description.trim()
      : null;
    const normalizedLabelNames = effectiveLabelNames;
    const normalizedDueDate = effectiveDueDate || null;
    const normalizedDueTime = effectiveDueTime || null;
    const normalizedReminderOffsetMinutes = parsedReminderOffsetMinutes;
    const normalizedRecurrenceRule = effectiveRecurrenceRule || null;
    const normalizedPriority = effectivePriority || null;
    const normalizedEstimatedMinutes = effectiveEstimatedMinutes
      ? Number.parseInt(effectiveEstimatedMinutes, 10)
      : null;
    const normalizedSectionId = effectiveSectionId || null;
    const normalizedAssigneeUserId = assigneeUserId || null;
    const optimisticUpdatedAt = new Date().toISOString();

    if (normalizedDueTime && !normalizedDueDate) {
      toast.error("Add a deadline before setting a time.");
      return;
    }
    if (normalizedReminderOffsetMinutes != null && !normalizedDueDate) {
      toast.error("Reminders need a deadline.");
      return;
    }
    if (normalizedRecurrenceRule && !normalizedDueDate) {
      toast.error("Recurring tasks need a deadline.");
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
        toast.error("Choose a project before saving.");
        return;
      }

      const deadlinePatch = buildTaskDeadlineMutation(
        normalizedDueDate,
        normalizedDueTime,
        profile?.timezone,
      );
      const reminderPatch = buildTaskReminderMutation(
        deadlinePatch,
        normalizedReminderOffsetMinutes,
        profile?.timezone,
      );
      const listOrSectionChanged =
        resolvedListId !== task.list_id ||
        normalizedSectionId !== (task.section_id ?? null);
      const nextPosition = listOrSectionChanged
        ? getNextTaskPosition(
            tasks.filter(
              (candidateTask) =>
                candidateTask.id !== task.id &&
                candidateTask.list_id === resolvedListId &&
                (candidateTask.section_id ?? null) === normalizedSectionId,
            ),
          )
        : undefined;

      applyTaskPatch(task.id, {
        title: normalizedTitle,
        description: normalizedDescription,
        ...deadlinePatch,
        ...reminderPatch,
        recurrence_rule: normalizedRecurrenceRule,
        priority: normalizedPriority,
        estimated_minutes: normalizedEstimatedMinutes,
        list_id: resolvedListId,
        section_id: normalizedSectionId,
        assignee_user_id: normalizedAssigneeUserId,
        ...(typeof nextPosition === "number" ? { position: nextPosition } : {}),
        updated_at: optimisticUpdatedAt,
      });
      const updatedTask = await updateTask(supabase, {
        id: task.id,
        title: normalizedTitle,
        description: normalizedDescription,
        dueDate: normalizedDueDate,
        dueTime: normalizedDueTime,
        reminderOffsetMinutes: normalizedReminderOffsetMinutes,
        recurrenceRule: normalizedRecurrenceRule,
        priority: normalizedPriority,
        estimatedMinutes: normalizedEstimatedMinutes,
        listId: resolvedListId,
        sectionId: normalizedSectionId,
        assigneeUserId: normalizedAssigneeUserId,
        position: nextPosition,
        preferredTimeZone: profile?.timezone,
      });
      let assignedLabels = task.labels;

      if (labelsChanged) {
        try {
          assignedLabels = sortTaskLabels(
            await replaceTaskLabels(supabase, {
              userId,
              taskId: task.id,
              labelNames: normalizedLabelNames,
            }),
          );
          upsertTaskLabels(assignedLabels);
        } catch (labelError) {
          upsertTask(updatedTask, { suppressRealtimeEcho: true });
          applyTaskPatch(task.id, { labels: task.labels });
          syncFormState({
            ...updatedTask,
            labels: task.labels,
          });
          toast.error(
            labelError instanceof Error
              ? `Task updated, but labels could not be saved: ${labelError.message}`
              : "Task updated, but labels could not be saved.",
          );
          onSaved();
          return;
        }
      }

      upsertTask(updatedTask, { suppressRealtimeEcho: true });
      if (labelsChanged) {
        applyTaskPatch(task.id, { labels: assignedLabels });
      }
      if (listOrSectionChanged) {
        // Logging removed as activity system is deprecated
      }
      syncFormState({
        ...updatedTask,
        labels: assignedLabels,
      });
      toast.success("Task updated.");
      onSaved();
    } catch (error) {
      upsertTask(task);
      toast.error(
        error instanceof Error ? error.message : "Unable to update task.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleCompletion() {
    const optimisticUpdatedAt = new Date().toISOString();
    const nextIsDone = !isDone;

    try {
      setIsDone(nextIsDone);
      applyTaskPatch(task.id, {
        is_done: nextIsDone,
        completed_at: nextIsDone ? optimisticUpdatedAt : null,
        updated_at: optimisticUpdatedAt,
      });
      const result = await completeTaskWithRecurrence(
        supabase,
        task,
        nextIsDone,
        profile?.timezone,
        userId,
      );
      upsertTask(result.completedTask, { suppressRealtimeEcho: true });
      if (result.nextTask) {
        upsertTask(result.nextTask, { suppressRealtimeEcho: true });
      }
      toast.success(
        nextIsDone
          ? result.nextTask
            ? "Task completed. Next occurrence created."
            : "Task completed."
          : "Task reopened.",
      );
      onSaved();
    } catch (error) {
      setIsDone(task.is_done);
      upsertTask(task);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update task status.",
      );
    }
  }

  async function handleDelete() {
    try {
      await deleteTask(supabase, task.id);
      removeTask(task.id, { suppressRealtimeEcho: true });
      toast.success("Task deleted.");
      setDeleteOpen(false);
      onDeleted();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete task.",
      );
    }
  }

  function openPlannerWithPrefill() {
    const nextParams = new URLSearchParams({
      listId: effectiveListId || task.list_id,
      taskId: task.id,
      view: "day",
    });
    if (effectiveDueDate) nextParams.set("date", effectiveDueDate);

    router.push(`/calendar?${nextParams.toString()}`);
    onClose?.();
  }

  function handlePlanBlock() {
    openPlannerWithPrefill();
  }

  async function handleAttachmentsUploaded() {
    await refresh({ silent: true });
    onSaved();
  }

  async function handleAttachmentDelete(attachment: TodoImageRow) {
    try {
      setDeletingAttachmentId(attachment.id);
      const result = await deleteTaskAttachment(supabase, attachment);
      await refresh({ silent: true });
      onSaved();

      if (result.cleanupWarning) {
        toast.warning(
          "Attachment removed, but file cleanup may have been incomplete.",
        );
        return;
      }

      toast.success("Attachment removed.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to remove attachment.",
      );
    } finally {
      setDeletingAttachmentId((current) =>
        current === attachment.id ? null : current,
      );
    }
  }

  async function handleAddComment(body: string) {
    await addComment({
      listId: task.list_id,
      userId,
      body,
    });
  }

  async function handleDeleteComment(commentId: string) {
    await removeComment(commentId);
  }
  return (
    <>
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-border/60 space-y-2 border-b px-5 pt-3 pb-3 sm:px-6 sm:pt-4 sm:pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-foreground text-sm font-semibold tracking-tight">
                {taskPositionLabel ? `Task ${taskPositionLabel}` : "Task"}
              </p>
              <p className="text-muted-foreground mt-2 truncate text-sm">
                {headerContextLabel}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {onNavigateToTask ? (
                <div className="border-border/70 bg-muted/35 inline-flex items-center rounded-lg border p-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="h-7 w-7 rounded-md"
                    title={previousTask ? `Previous task: ${previousTask.title}` : "Previous task"}
                    disabled={!previousTask}
                    onClick={() => previousTask && onNavigateToTask(previousTask.id)}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="h-7 w-7 rounded-md"
                    title={nextTask ? `Next task: ${nextTask.title}` : "Next task"}
                    disabled={!nextTask}
                    onClick={() => nextTask && onNavigateToTask(nextTask.id)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : null}

              {isDirty ? (
                <Button variant="tonal" size="sm" onClick={() => void handleSave()} disabled={saving || !cleanedTitle}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              ) : null}
              {onClose ? (
                <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              ) : null}
            </div>
          </div>

          <div className="px-1 py-0.5 sm:px-1 sm:py-1">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => void handleToggleCompletion()}
                className={cn(
                  "mt-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors",
                  isDone
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card hover:border-primary/60 text-transparent",
                )}
              >
                <Check className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <TaskSyntaxComposer
                  value={title}
                  ariaLabel="Task title"
                  placeholder="Task title"
                  tokens={parsedTitleInput.tokens}
                  suggestionState={activeSuggestion}
                  selectionPosition={selectionPosition}
                  onSelectionChange={(selection) => {
                    setComposerSelection(selection);
                    if (selectionPosition != null) setSelectionPosition(null);
                  }}
                  onChange={setTitle}
                  onApplySuggestion={(suggestion) => {
                    if (!activeSuggestion) return;
                    const nextValue = applyQuickAddSuggestion(title, activeSuggestion, suggestion);
                    setTitle(nextValue.value);
                    setComposerSelection(nextValue.selection);
                    setSelectionPosition(nextValue.selection);
                  }}
                  onSubmit={() => void handleSave()}
                  rows={1}
                  className={cn("mt-0.5", isDone && "opacity-70")}
                  composerClassName="text-[1.15rem] leading-7 font-semibold tracking-[-0.03em] sm:text-[1.25rem]"
                />
                {parsedTitleInput.chips.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {parsedTitleInput.chips.map((chip, index) => (
                      <span
                        key={`${chip.kind}-${chip.value}-${index}`}
                        className="bg-muted/55 text-muted-foreground inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
                      >
                        <span className="text-[11px] tracking-[0.12em] uppercase">{chip.label}</span>
                        <span className="text-foreground">{chip.value}</span>
                      </span>
                    ))}
                  </div>
                )}
                {showEmptyTitleWarning && <p className="text-destructive mt-3 text-sm">Add a task name.</p>}
                {isDirty && <p className="text-muted-foreground mt-2 text-sm">Unsaved changes</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="task-detail-scroll min-h-0 flex-1 lg:overflow-y-auto lg:overscroll-y-contain">
        <div className="space-y-4 p-4 sm:p-5 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-4 lg:space-y-0">
        {/* Pane 1: Core Content */}
        <div className="flex min-h-0 flex-col lg:h-full">
          <div className="space-y-5 rounded-2xl border border-border/55 bg-card p-5">
            <section className="space-y-2">
              <h3 className="text-foreground px-1 text-sm font-semibold">Description</h3>
              <Textarea
                id="detailNotes"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add details, links, or context"
                className="border border-border/60 bg-background min-h-[110px] resize-none rounded-lg px-3.5 py-3 text-[15px] leading-6 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground/60"
              />
            </section>

            <TaskStepsSection taskId={task.id} />

            <section className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-foreground text-sm font-semibold">Attachments</h3>
                <div className="text-muted-foreground/50 text-[10px] font-medium tabular-nums">
                  {(totalAttachmentsSize / (1024 * 1024)).toFixed(1)} / {MAX_ATTACHMENT_SIZE_MB} MB
                </div>
              </div>
              <TaskAttachmentUpload
                userId={userId}
                todoId={task.id}
                listId={task.list_id}
                currentTotalSizeBytes={totalAttachmentsSize}
                onUploaded={handleAttachmentsUploaded}
              />
              {images.length > 0 ? (
                <div className="space-y-2">
                  {images.map((image) => {
                    const publicUrl = supabase.storage.from("todo-images").getPublicUrl(image.path).data.publicUrl;
                    const displayName = getAttachmentDisplayName(image);
                    const extension = getAttachmentExtension(displayName).toUpperCase();
                    const imageAttachment = isImageAttachment(image);
                    const isDeleting = deletingAttachmentId === image.id;
                    const metaLabel = [imageAttachment ? "Image" : extension || "File", formatAttachmentSize(image.size_bytes)].filter(Boolean).join(" - ");

                    return (
                      <div key={image.id} className="border-border/60 flex items-center gap-3 rounded-lg border px-3 py-2">
                        <a href={publicUrl} target="_blank" rel="noreferrer" className="bg-card flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md">
                          {imageAttachment ? (
                            <img src={publicUrl} alt={displayName} className="h-full w-full object-cover" />
                          ) : (
                            <FileText className="text-muted-foreground h-4 w-4" />
                          )}
                        </a>
                        <a href={publicUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                          <p className="text-foreground truncate text-sm font-medium">{displayName}</p>
                          <p className="text-muted-foreground truncate text-sm">{metaLabel}</p>
                        </a>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          disabled={isDeleting}
                          onClick={() => void handleAttachmentDelete(image)}
                        >
                          {isDeleting ? (
                            <div className="border-muted-foreground/35 border-t-muted-foreground h-3.5 w-3.5 animate-spin rounded-full border-2" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>

            <TaskCommentsSection
              comments={comments}
              loading={commentsLoading}
              currentUserId={userId}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
            />
          </div>
        </div>

        {/* Pane 2: Metadata */}
        <div className="flex min-h-0 flex-col lg:h-full">
          <div className="space-y-5 rounded-2xl border border-border/55 bg-background p-5">
            <h3 className="text-foreground px-1 text-sm font-semibold">Metadata</h3>
            <div className="space-y-3 px-1">
              <TaskDetailMetaField label="Project">
                <Select
                  value={projectSelectValue}
                  onValueChange={(val) => {
                    if (val === PENDING_PROJECT_SELECT_VALUE) return;
                    setManualListId(val);
                    setManualSectionId("");
                  }}
                >
                  <SelectTrigger className="border-border/60 bg-background h-auto min-h-0 rounded-lg px-3.5 py-2.5 text-sm shadow-none focus-visible:ring-0">
                    <span className="truncate">{projectDisplayLabel}</span>
                  </SelectTrigger>
                  <SelectContent>
                    {pendingProjectName && (
                      <SelectItem value={PENDING_PROJECT_SELECT_VALUE}>Create {pendingProjectName}</SelectItem>
                    )}
                    {lists.map((list) => (
                      <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </TaskDetailMetaField>

              <TaskDetailMetaField label="Date">
                <div className="grid gap-2">
                  <TaskDueDatePicker
                    value={effectiveDueDate}
                    onChange={setManualDueDate}
                    allowClear
                    className="border-border/60 bg-background h-auto rounded-lg px-3.5 py-2.5 text-sm shadow-none focus-visible:ring-0"
                  />
                  {(effectiveDueDate || effectiveDueTime) && (
                    <TimeSelectField
                      value={effectiveDueTime}
                      onChange={setManualDueTime}
                      allowClear
                      className="border-border/60 bg-background h-auto min-h-0 rounded-lg px-3.5 py-2.5 font-mono text-sm shadow-none focus-visible:ring-0"
                    />
                  )}
                </div>
              </TaskDetailMetaField>

              <TaskDetailMetaField label="Priority">
                <Select value={effectivePriority || "none"} onValueChange={(val) => setManualPriority(val === "none" ? "" : val as any)}>
                  <SelectTrigger className="border-border/60 bg-background h-auto min-h-0 rounded-lg px-3.5 py-2.5 text-sm shadow-none focus-visible:ring-0">
                    <SelectValue placeholder="No priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No priority</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </TaskDetailMetaField>

              <TaskDetailMetaField label="Estimate">
                <div className="border-border/60 bg-background flex items-center gap-2 rounded-lg border px-3.5 py-2.5">
                  <Input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={effectiveEstimatedMinutes}
                    onChange={(e) => setManualEstimatedMinutes(e.target.value)}
                    placeholder="45"
                    className="h-auto w-20 rounded-none border-0 bg-transparent px-0 py-0 shadow-none focus-visible:ring-0"
                  />
                  <span className="text-muted-foreground text-xs font-medium uppercase">Min</span>
                </div>
              </TaskDetailMetaField>
              <TaskDetailMetaField label="Plan">
                <Button variant="tonal" size="sm" onClick={handlePlanBlock}>
                  <CalendarRange className="mr-2 h-4 w-4" /> Plan block in calendar
                </Button>
              </TaskDetailMetaField>

              <div className="border-t border-border/50 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground h-8 px-2"
                  onClick={() => setShowMoreMeta((open) => !open)}
                >
                  <ChevronDown
                    className={cn(
                      "mr-1 h-4 w-4 transition-transform",
                      showMoreMeta && "rotate-180",
                    )}
                  />
                  More details
                </Button>
              </div>

              {showMoreMeta ? (
                <div className="space-y-3 border-t border-border/50 pt-3">
                  {showSectionSelector && (
                    <TaskDetailMetaField label="Section">
                      <Select value={effectiveSectionId || "none"} onValueChange={(val) => setManualSectionId(val === "none" ? "" : val)}>
                        <SelectTrigger className="border-border/60 bg-background h-auto min-h-0 rounded-lg px-3.5 py-2.5 text-sm shadow-none focus-visible:ring-0">
                          <SelectValue placeholder="No section" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No section</SelectItem>
                          {sections.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TaskDetailMetaField>
                  )}

                  <TaskDetailMetaField label="Assignee">
                    <TaskDetailAssignee value={assigneeUserId} members={activeListMembers} onChange={setAssigneeUserId} />
                  </TaskDetailMetaField>

                  <TaskDetailMetaField label="Reminder">
                    <Select value={effectiveReminderOffsetMinutes || "none"} onValueChange={(val) => setManualReminderOffsetMinutes(val === "none" ? "" : val)}>
                      <SelectTrigger className="border-border/60 bg-background h-auto min-h-0 rounded-lg px-3.5 py-2.5 text-sm shadow-none focus-visible:ring-0">
                        <span className="inline-flex w-full items-center gap-2">
                          <Bell className="text-muted-foreground h-4 w-4 shrink-0" />
                          <span>{reminderLabel ?? "No reminder"}</span>
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No reminder</SelectItem>
                        {REMINDER_OFFSET_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TaskDetailMetaField>

                  <TaskDetailMetaField label="Repeat">
                    <Select value={effectiveRecurrenceRule || "none"} onValueChange={(val) => setManualRecurrenceRule(val === "none" ? "" : val as RecurrenceRule)}>
                      <SelectTrigger className="border-border/60 bg-background h-auto min-h-0 rounded-lg px-3.5 py-2.5 text-sm shadow-none focus-visible:ring-0">
                        <SelectValue placeholder="Does not repeat" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Does not repeat</SelectItem>
                        {RECURRENCE_RULE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TaskDetailMetaField>

                  <TaskDetailMetaField label="Labels">
                    <Input
                      value={manualLabelsInput ?? formatTaskLabelInput(effectiveLabelNames.map(n => ({ name: n })))}
                      onChange={(e) => setManualLabelsInput(e.target.value)}
                      placeholder="math, urgent"
                      className="border-border/60 bg-background h-auto rounded-lg px-3.5 py-2.5 text-sm shadow-none focus-visible:ring-0"
                    />
                    {effectiveLabelNames.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {effectiveLabelNames.map((name) => (
                          <TaskLabelBadge key={name.toLowerCase()} label={taskLabels.find(l => l.name.toLowerCase() === name.toLowerCase()) ?? { name, color_token: "slate" }} />
                        ))}
                      </div>
                    )}
                  </TaskDetailMetaField>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="border-t border-border/40 pt-4">
            <Button
              variant="ghost"
              size="xs"
              className="text-destructive/60 hover:text-destructive justify-start"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete task
            </Button>
          </div>
        </div>
        </div>
      </div>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              Delete <span className="text-foreground font-semibold">{task.title}</span> and its attachments.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

}

export function TaskDetailPanel({
  task,
  lists,
  images,
  userId,
  previousTask,
  nextTask,
  taskPositionLabel,
  open,
  onOpenChange,
  onClose,
  onNavigateToTask,
  onDirtyChange,
  onSaved,
  onDeleted,
  className,
}: {
  task: TaskDatasetRecord | null;
  lists: TodoList[];
  images: TodoImageRow[];
  userId: string;
  previousTask?: TaskDatasetRecord | null;
  nextTask?: TaskDatasetRecord | null;
  taskPositionLabel?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose?: () => void;
  onNavigateToTask?: (taskId: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved: () => void;
  onDeleted: () => void;
  className?: string;
}) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const syncDesktopState = () => setIsDesktop(mediaQuery.matches);

    syncDesktopState();
    mediaQuery.addEventListener("change", syncDesktopState);

    return () => {
      mediaQuery.removeEventListener("change", syncDesktopState);
    };
  }, []);

  return (
    <>
      <Dialog open={isDesktop && open && !!task} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className={cn(
            "sm:!max-w-none w-[min(95vw,1420px)] h-[94vh] max-h-[94vh] p-0 overflow-hidden flex flex-col border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl",
            className,
          )}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Task details</DialogTitle>
            <DialogDescription>
              Task editor
            </DialogDescription>
          </DialogHeader>
          {task ? (
            <div className="task-detail-scroll h-full overflow-hidden">
              <TaskDetailForm
                task={task}
                lists={lists}
                images={images}
                userId={userId}
                onClose={onClose}
                previousTask={previousTask}
                nextTask={nextTask}
                taskPositionLabel={taskPositionLabel}
                onNavigateToTask={onNavigateToTask}
                onDirtyChange={onDirtyChange}
                onSaved={onSaved}
                onDeleted={onDeleted}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Sheet open={!isDesktop && open && !!task} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="bg-background w-full max-w-none border-0 p-0 lg:hidden"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Task details</SheetTitle>
            <SheetDescription>
              Task editor
            </SheetDescription>
          </SheetHeader>
          {task ? (
            <div className="task-detail-scroll h-[100dvh] overflow-y-auto px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
              <TaskDetailForm
                task={task}
                lists={lists}
                images={images}
                userId={userId}
                onClose={onClose}
                previousTask={previousTask}
                nextTask={nextTask}
                taskPositionLabel={taskPositionLabel}
                onNavigateToTask={onNavigateToTask}
                onDirtyChange={onDirtyChange}
                onSaved={onSaved}
                onDeleted={onDeleted}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
