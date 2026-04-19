"use client";

import {
    BarChart3,
    CalendarRange,
    CheckSquare2,
    ChevronLeft,
    ChevronRight,
    FolderKanban,
    Inbox,
    LogOut,
    Menu,
    Plus,
    Search,
    Settings,
    Timer,
    Users,
} from "lucide-react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ProjectDialog } from "~/components/project-dialog";
import { QuickAddDialog } from "~/components/quick-add-dialog";
import { SettingsDialog } from "~/components/settings-dialog";
import { WorkspaceDataProvider, useTaskDataset } from "~/hooks/use-task-dataset";
import { useData } from "~/components/data-provider";
import { useCompactMode } from "~/components/compact-mode-provider";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "~/components/ui/sheet";
import { getPublicAvatarUrl } from "~/lib/avatar";
import { getProjectColorClasses, getProjectIcon } from "~/lib/project-appearance";
import { formatProjectScheduledLabel } from "~/lib/project-summaries";
import { formatTaskReminderScheduledLabel, getReminderOffsetLabel, hasTaskReminder } from "~/lib/task-reminders";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { formatTaskDueLabel, taskMatchesSearch } from "~/lib/task-views";
import { cn } from "~/lib/utils";

interface ShellActionsContextValue {
    openQuickAdd: (defaults?: { listId?: string | null; sectionId?: string | null; title?: string; dueDate?: string | null }) => void;
    openSettings: (section?: "account" | "appearance" | "shortcuts") => void;
    enterPrimaryActivity: (activityId: string) => void;
    registerPrimaryActivityReset: (activityId: string, reset: () => void) => () => void;
}

const ShellActionsContext = createContext<ShellActionsContextValue | undefined>(undefined);

const SIDEBAR_COLLAPSED_STORAGE_KEY = "shell-sidebar-collapsed";
const SIDEBAR_HOVER_PREVIEW_DELAY_MS = 120;
const SIDEBAR_HOVER_PREVIEW_CLOSE_DELAY_MS = 160;
const DESKTOP_SIDEBAR_COLLAPSED_WIDTH = "4.25rem";
const DESKTOP_SIDEBAR_PREVIEW_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

const PRIMARY_ITEMS = [
    { href: "/tasks", label: "Today", icon: CheckSquare2 },
    { href: "/calendar", label: "Plan", icon: CalendarRange },
    { href: "/focus", label: "Focus", icon: Timer },
    { href: "/progress", label: "Progress", icon: BarChart3 },
] as const;

const SECONDARY_ITEMS = [
    { href: "/projects", label: "Projects", icon: FolderKanban },
    { href: "/community", label: "Community", icon: Users },
] as const;

const SMART_VIEW_ITEMS = [
    { href: "/tasks?view=upcoming", value: "upcoming", label: "Upcoming", icon: CalendarRange },
    { href: "/tasks?view=inbox", value: "inbox", label: "No Due Date", icon: Inbox },
    { href: "/tasks?view=done", value: "done", label: "Completed", icon: CheckSquare2 },
] as const;

const GLOBAL_SEARCH_VIEW_ITEMS = [
    { href: "/tasks", label: "Today", icon: CheckSquare2, keywords: ["tasks", "focus"] },
    { href: "/calendar", label: "Plan", icon: CalendarRange, keywords: ["calendar", "plan"] },
    { href: "/focus", label: "Focus", icon: Timer, keywords: ["pomodoro", "timer", "study"] },
    { href: "/progress", label: "Progress", icon: BarChart3, keywords: ["analytics", "review", "stats"] },
    { href: "/projects", label: "Projects", icon: FolderKanban, keywords: ["workspace"] },
    { href: "/community", label: "Community", icon: Users, keywords: ["leaderboard", "friends", "feed"] },
    { href: "/tasks?view=upcoming", label: "Upcoming", icon: CalendarRange, keywords: ["schedule"] },
    { href: "/tasks?view=inbox", label: "No Due Date", icon: Inbox, keywords: ["inbox"] },
    { href: "/tasks?view=done", label: "Completed", icon: CheckSquare2, keywords: ["done"] },
] as const;

const COMMAND_ACTION_ITEMS = [
    { id: "quick-add", label: "Quick add task", icon: Plus, keywords: ["new", "capture", "task"] },
    { id: "create-project", label: "Create project", icon: FolderKanban, keywords: ["new", "workspace", "project"] },
    { id: "open-settings", label: "Open settings", icon: Settings, keywords: ["preferences", "account", "appearance"] },
] as const;

type ShellCommandActionId = (typeof COMMAND_ACTION_ITEMS)[number]["id"];

function getActiveSmartView(pathname: string, rawView: string | null) {
    if (pathname !== "/tasks") return null;
    if (rawView === "upcoming" || rawView === "inbox" || rawView === "done") {
        return rawView;
    }
    return null;
}

function getProjectStatusLabel(summary: {
    incompleteCount: number;
    overdueCount: number;
    dueSoonCount: number;
    nextScheduledBlock: Parameters<typeof formatProjectScheduledLabel>[0];
    memberCount: number;
}) {
    const parts = [`${summary.incompleteCount} open`];

    if (summary.overdueCount > 0) {
        parts.push(`${summary.overdueCount} overdue`);
    } else if (summary.dueSoonCount > 0) {
        parts.push(`${summary.dueSoonCount} due soon`);
    }

    if (summary.nextScheduledBlock) {
        const scheduledLabel = formatProjectScheduledLabel(summary.nextScheduledBlock);
        if (scheduledLabel) parts.push(scheduledLabel);
    }

    if (summary.memberCount > 1) {
        parts.push(`${summary.memberCount} members`);
    }

    return parts.slice(0, 3);
}

function isEditableKeyboardTarget(target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function useShellActions() {
    const context = useContext(ShellActionsContext);
    if (!context) {
        throw new Error("useShellActions must be used within AppShell.");
    }
    return context;
}

export function AppShell({ children }: { children: ReactNode }) {
    return (
        <WorkspaceDataProvider>
            <AppShellLayout>{children}</AppShellLayout>
        </WorkspaceDataProvider>
    );
}

function AppShellLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { profile, userId } = useData();
    const { isCompact } = useCompactMode();
    const { lists, orderedProjectSummaries, saveProjectOrder, smartViewCounts, tasks } = useTaskDataset();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [mounted, setMounted] = useState(false);
    const [desktopCollapsed, setDesktopCollapsed] = useState(false);
    const [desktopPreviewOpen, setDesktopPreviewOpen] = useState(false);
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
    const [mobileProfileMenuSource, setMobileProfileMenuSource] = useState<"sidebar" | "topbar" | null>(null);
    const [desktopProfileMenuId, setDesktopProfileMenuId] = useState<string | null>(null);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    const [quickAddDefaults, setQuickAddDefaults] = useState<{ listId?: string | null; sectionId?: string | null; title?: string; dueDate?: string | null } | null>(null);
    const [projectDialogOpen, setProjectDialogOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsSection, setSettingsSection] = useState<"account" | "appearance" | "shortcuts">("account");
    const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
    const [globalSearchQuery, setGlobalSearchQuery] = useState("");
    const suppressProjectClickRef = useRef(false);
    const hoverPreviewTimerRef = useRef<number | null>(null);
    const desktopCollapsedRef = useRef(desktopCollapsed);
    const reminderTasksRef = useRef(tasks);
    const reminderTimeZoneRef = useRef(profile?.timezone ?? null);
    const reminderToastKeysRef = useRef<Set<string>>(new Set());
    const lastReminderCheckAtRef = useRef(Date.now());
    const primaryActivityResetsRef = useRef(new Map<string, () => void>());

    const activeSmartView = getActiveSmartView(pathname, searchParams.get("view"));
    const activeProjectId = pathname.startsWith("/projects/") ? pathname.split("/")[2] ?? null : null;
    const settingsRequestedByUrl = searchParams.get("settings") === "true";
    const avatarUrl = getPublicAvatarUrl(supabase, profile?.avatar_url);
    const normalizedGlobalSearchQuery = globalSearchQuery.trim().toLowerCase();
    const projectNameById = useMemo(
        () => new Map(lists.map((list) => [list.id, list.name])),
        [lists],
    );

    const matchingViewResults = useMemo(() => {
        return GLOBAL_SEARCH_VIEW_ITEMS.filter((item) => {
            if (!normalizedGlobalSearchQuery) return true;
            const haystack = [item.label, ...(item.keywords ?? [])].join(" ").toLowerCase();
            return haystack.includes(normalizedGlobalSearchQuery);
        }).slice(0, normalizedGlobalSearchQuery ? 6 : 5);
    }, [normalizedGlobalSearchQuery]);

    const matchingActionResults = useMemo(() => {
        return COMMAND_ACTION_ITEMS.filter((item) => {
            if (!normalizedGlobalSearchQuery) return true;
            const haystack = [item.label, ...(item.keywords ?? [])].join(" ").toLowerCase();
            return haystack.includes(normalizedGlobalSearchQuery);
        }).slice(0, normalizedGlobalSearchQuery ? 7 : 5);
    }, [normalizedGlobalSearchQuery]);

    const matchingProjectResults = useMemo(() => {
        const filtered = orderedProjectSummaries.filter((summary) => {
            if (!normalizedGlobalSearchQuery) return true;
            return summary.list.name.toLowerCase().includes(normalizedGlobalSearchQuery);
        });
        return filtered.slice(0, normalizedGlobalSearchQuery ? 8 : 5);
    }, [normalizedGlobalSearchQuery, orderedProjectSummaries]);

    const matchingTaskResults = useMemo(() => {
        if (!normalizedGlobalSearchQuery) return [];

        return tasks
            .map((task) => {
                const projectName = projectNameById.get(task.list_id) ?? "";
                const title = task.title.toLowerCase();
                const description = (task.description ?? "").toLowerCase();
                const project = projectName.toLowerCase();
                let score = 4;

                if (title.startsWith(normalizedGlobalSearchQuery)) score = 0;
                else if (title.includes(normalizedGlobalSearchQuery)) score = 1;
                else if (project.includes(normalizedGlobalSearchQuery)) score = 2;
                else if (description.includes(normalizedGlobalSearchQuery)) score = 3;
                else if (!taskMatchesSearch(task, normalizedGlobalSearchQuery)) score = 99;

                return { projectName, score, task };
            })
            .filter((entry) => entry.score < 99)
            .sort((a, b) => {
                if (a.score !== b.score) return a.score - b.score;
                const doneDelta = Number(a.task.is_done) - Number(b.task.is_done);
                if (doneDelta !== 0) return doneDelta;
                return a.task.title.localeCompare(b.task.title);
            })
            .slice(0, 8);
    }, [normalizedGlobalSearchQuery, projectNameById, tasks]);

    const hasGlobalSearchResults = matchingActionResults.length > 0 || matchingViewResults.length > 0 || matchingProjectResults.length > 0 || matchingTaskResults.length > 0;

    useEffect(() => {
        setMounted(true);

        const savedCollapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
        if (savedCollapsed === "true") {
            setDesktopCollapsed(true);
        }
    }, []);

    useEffect(() => {
        return () => {
            if (hoverPreviewTimerRef.current !== null) {
                window.clearTimeout(hoverPreviewTimerRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!desktopCollapsed) {
            if (hoverPreviewTimerRef.current !== null) {
                window.clearTimeout(hoverPreviewTimerRef.current);
                hoverPreviewTimerRef.current = null;
            }
            setDesktopPreviewOpen(false);
        }
    }, [desktopCollapsed]);

    useEffect(() => {
        if (globalSearchOpen) return;
        setGlobalSearchQuery("");
    }, [globalSearchOpen]);

    useEffect(() => {
        desktopCollapsedRef.current = desktopCollapsed;
    }, [desktopCollapsed]);

    useEffect(() => {
        reminderTasksRef.current = tasks;
    }, [tasks]);

    useEffect(() => {
        reminderTimeZoneRef.current = profile?.timezone ?? null;
    }, [profile?.timezone]);

    useEffect(() => {
        reminderToastKeysRef.current.clear();
        lastReminderCheckAtRef.current = Date.now();
    }, [userId]);

    useEffect(() => {
        if (!userId) return;

        const checkReminders = () => {
            const now = Date.now();
            const previousCheckAt = lastReminderCheckAtRef.current;
            lastReminderCheckAtRef.current = now;

            const activeReminderKeys = new Set<string>();

            for (const task of reminderTasksRef.current) {
                if (task.is_done || !task.reminder_at || !hasTaskReminder(task)) continue;

                const reminderTime = new Date(task.reminder_at).getTime();
                if (Number.isNaN(reminderTime)) continue;

                const reminderKey = `${task.id}:${task.reminder_at}`;
                activeReminderKeys.add(reminderKey);

                if (reminderTime <= previousCheckAt || reminderTime > now) continue;
                if (reminderToastKeysRef.current.has(reminderKey)) continue;

                reminderToastKeysRef.current.add(reminderKey);
                const reminderLabel = getReminderOffsetLabel(task.reminder_offset_minutes);
                const scheduledLabel = formatTaskReminderScheduledLabel(task.reminder_at, reminderTimeZoneRef.current);

                toast.info(task.title, {
                    id: `task-reminder-${reminderKey}`,
                    description: [reminderLabel, scheduledLabel ? `Scheduled ${scheduledLabel}` : null]
                        .filter(Boolean)
                        .join(" · "),
                    action: {
                        label: "Open",
                        onClick: () => router.push(`/tasks?taskId=${task.id}`),
                    },
                });
            }

            for (const reminderKey of Array.from(reminderToastKeysRef.current)) {
                if (!activeReminderKeys.has(reminderKey)) {
                    reminderToastKeysRef.current.delete(reminderKey);
                }
            }
        };

        const intervalId = window.setInterval(checkReminders, 15_000);
        return () => {
            window.clearInterval(intervalId);
        };
    }, [router, userId]);

    const clearHoverPreviewTimer = useCallback(() => {
        if (hoverPreviewTimerRef.current !== null) {
            window.clearTimeout(hoverPreviewTimerRef.current);
            hoverPreviewTimerRef.current = null;
        }
    }, []);

    const setCollapsedState = useCallback((nextValue: boolean) => {
        clearHoverPreviewTimer();
        setDesktopProfileMenuId(null);
        setDesktopPreviewOpen(false);
        setDesktopCollapsed(nextValue);
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(nextValue));
    }, [clearHoverPreviewTimer]);

    const dismissPrimaryActivities = useCallback((options?: { except?: string }) => {
        const except = options?.except;

        setDesktopProfileMenuId(null);
        setMobileProfileMenuSource(null);

        if (except !== "shell:quick-add") {
            setQuickAddOpen(false);
        }
        if (except !== "shell:global-search") {
            setGlobalSearchOpen(false);
        }
        if (except !== "shell:mobile-sidebar") {
            setMobileSidebarOpen(false);
        }
        if (except !== "shell:project-dialog") {
            setProjectDialogOpen(false);
        }
        if (except !== "shell:settings") {
            setSettingsOpen(false);
        }

        for (const [activityId, reset] of primaryActivityResetsRef.current) {
            if (activityId === except) continue;
            reset();
        }
    }, []);

    const enterPrimaryActivity = useCallback((activityId: string) => {
        dismissPrimaryActivities({ except: activityId });
    }, [dismissPrimaryActivities]);

    const registerPrimaryActivityReset = useCallback((activityId: string, reset: () => void) => {
        primaryActivityResetsRef.current.set(activityId, reset);

        return () => {
            const currentReset = primaryActivityResetsRef.current.get(activityId);
            if (currentReset === reset) {
                primaryActivityResetsRef.current.delete(activityId);
            }
        };
    }, []);

    const openQuickAdd = useCallback((defaults?: { listId?: string | null; sectionId?: string | null; title?: string; dueDate?: string | null }) => {
        enterPrimaryActivity("shell:quick-add");
        setQuickAddDefaults(defaults ?? null);
        setQuickAddOpen(true);
    }, [enterPrimaryActivity]);

    const handleProjectDialogOpenChange = useCallback((open: boolean) => {
        if (open) {
            enterPrimaryActivity("shell:project-dialog");
        }
        setProjectDialogOpen(open);
    }, [enterPrimaryActivity]);

    const handleGlobalSearchOpenChange = useCallback((open: boolean) => {
        if (open) {
            enterPrimaryActivity("shell:global-search");
        }
        setGlobalSearchOpen(open);
    }, [enterPrimaryActivity]);

    const clearSettingsUrlParams = useCallback(() => {
        if (!settingsRequestedByUrl) return;

        const nextSearchParams = new URLSearchParams(searchParams.toString());
        nextSearchParams.delete("settings");
        nextSearchParams.delete("section");

        const nextSearch = nextSearchParams.toString();
        router.replace(nextSearch ? `${pathname}?${nextSearch}` : pathname, { scroll: false });
    }, [pathname, router, searchParams, settingsRequestedByUrl]);

    const openSettings = useCallback((section?: "account" | "appearance" | "shortcuts") => {
        enterPrimaryActivity("shell:settings");
        if (section) setSettingsSection(section);
        setSettingsOpen(true);
    }, [enterPrimaryActivity]);

    const handleSettingsOpenChange = useCallback((open: boolean) => {
        setSettingsOpen(open);

        if (!open) {
            clearSettingsUrlParams();
        }
    }, [clearSettingsUrlParams]);

    useEffect(() => {
        if (!settingsRequestedByUrl) return;

        const section = searchParams.get("section");
        if (section === "appearance" || section === "shortcuts" || section === "account") {
            setSettingsSection(section);
        } else {
            setSettingsSection("account");
        }

        enterPrimaryActivity("shell:settings");
        setSettingsOpen(true);
    }, [enterPrimaryActivity, searchParams, settingsRequestedByUrl]);

    const contextValue = useMemo<ShellActionsContextValue>(() => ({
        openQuickAdd,
        openSettings,
        enterPrimaryActivity,
        registerPrimaryActivityReset,
    }), [enterPrimaryActivity, openQuickAdd, openSettings, registerPrimaryActivityReset]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const key = event.key?.toLowerCase();

            if (!event.metaKey && !event.ctrlKey && !event.altKey) {
                if (event.shiftKey || event.repeat || key !== "q") return;
                if (isEditableKeyboardTarget(event.target)) return;

                event.preventDefault();
                openQuickAdd();
                return;
            }

            if (event.altKey) return;

            if (key === "k") {
                event.preventDefault();
                handleGlobalSearchOpenChange(true);
                return;
            }

            if (event.code !== "Backslash" || event.shiftKey || event.repeat) return;
            if (isEditableKeyboardTarget(event.target)) return;

            event.preventDefault();
            if (window.matchMedia("(min-width: 1024px)").matches) {
                setCollapsedState(!desktopCollapsedRef.current);
                return;
            }

            setMobileSidebarOpen((current) => {
                if (current) return false;
                enterPrimaryActivity("shell:mobile-sidebar");
                return true;
            });
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [enterPrimaryActivity, handleGlobalSearchOpenChange, openQuickAdd, setCollapsedState]);

    function openDesktopPreview() {
        clearHoverPreviewTimer();
        if (desktopPreviewOpen) return;
        setDesktopPreviewOpen(true);
    }

    function closeDesktopPreview() {
        setDesktopPreviewOpen(false);
    }

    function handleDesktopSidebarMouseEnter() {
        if (!desktopCollapsed) return;
        clearHoverPreviewTimer();
        hoverPreviewTimerRef.current = window.setTimeout(() => {
            openDesktopPreview();
            hoverPreviewTimerRef.current = null;
        }, SIDEBAR_HOVER_PREVIEW_DELAY_MS);
    }

    function handleDesktopSidebarMouseLeave() {
        if (!desktopCollapsed) return;
        clearHoverPreviewTimer();
        hoverPreviewTimerRef.current = window.setTimeout(() => {
            closeDesktopPreview();
            hoverPreviewTimerRef.current = null;
        }, SIDEBAR_HOVER_PREVIEW_CLOSE_DELAY_MS);
    }

    async function handleLogout() {
        setDesktopProfileMenuId(null);
        setMobileProfileMenuSource(null);
        await supabase.auth.signOut();
        router.push("/login");
    }

    function handleNavigate(href: string) {
        dismissPrimaryActivities();
        router.push(href);
    }

    function handleMobileSidebarOpenChange(open: boolean) {
        if (open) {
            enterPrimaryActivity("shell:mobile-sidebar");
        }
        setMobileSidebarOpen(open);

        if (!open) {
            setMobileProfileMenuSource((current) => (current === "sidebar" ? null : current));
        }
    }

    function openGlobalSearch() {
        handleGlobalSearchOpenChange(true);
    }

    function handleCommandAction(actionId: ShellCommandActionId) {
        setGlobalSearchQuery("");

        switch (actionId) {
            case "quick-add":
                openQuickAdd();
                return;
            case "create-project":
                handleProjectDialogOpenChange(true);
                return;
            case "open-settings":
                openSettings();
                return;
        }
    }

    function handleGlobalSearchNavigate(href: string) {
        setGlobalSearchQuery("");
        handleNavigate(href);
    }

    function handleProjectDragEnd(result: DropResult) {
        suppressProjectClickRef.current = true;
        window.setTimeout(() => {
            suppressProjectClickRef.current = false;
        }, 140);

        if (!result.destination || result.destination.index === result.source.index) {
            return;
        }

        const nextProjectIds = orderedProjectSummaries.map((summary) => summary.list.id);
        const [movedProjectId] = nextProjectIds.splice(result.source.index, 1);
        if (!movedProjectId) return;

        nextProjectIds.splice(result.destination.index, 0, movedProjectId);
        saveProjectOrder(nextProjectIds);
    }

    function renderProfileMenuContent() {
        return (
            <DropdownMenuContent
                align="end"
                className="w-64 rounded-xl border-border/70 p-1.5 shadow-[0_18px_36px_rgba(15,23,42,0.12)]"
            >
                <DropdownMenuItem className="rounded-lg px-2.5 py-2" onClick={() => handleNavigate("/progress")}>
                    <BarChart3 className="h-4 w-4" />
                    Progress
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg px-2.5 py-2" onClick={() => handleNavigate("/community")}>
                    <Users className="h-4 w-4" />
                    Community
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg px-2.5 py-2" onClick={() => handleNavigate("/tasks?view=done")}>
                    <CheckSquare2 className="h-4 w-4" />
                    Completed Tasks
                </DropdownMenuItem>
                <DropdownMenuItem className="rounded-lg px-2.5 py-2" onClick={() => openSettings()}>
                    <Settings className="h-4 w-4" />
                    Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="rounded-lg px-2.5 py-2" onClick={() => void handleLogout()}>
                    <LogOut className="h-4 w-4" />
                    Log out
                </DropdownMenuItem>
            </DropdownMenuContent>
        );
    }

    function renderGlobalSearchTrigger(options: { collapsed: boolean; mobile: boolean }) {
        const { collapsed, mobile } = options;

        if (collapsed) {
            return (
                <button
                    type="button"
                    onClick={() => openGlobalSearch()}
                    title="Search"
                    className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-sidebar-border bg-sidebar text-muted-foreground transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
                >
                    <Search className="h-4 w-4" />
                    <span className="sr-only">Search</span>
                </button>
            );
        }

        return (
            <button
                type="button"
                onClick={() => openGlobalSearch()}
                className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar px-3 text-sm text-muted-foreground transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/80 hover:text-sidebar-foreground"
            >
                <Search className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 text-left">Search</span>
                {mobile ? null : (
                    <span className="rounded-md border border-sidebar-border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        Ctrl K
                    </span>
                )}
            </button>
        );
    }

    function renderProjectLinks(options: { collapsed: boolean; mobile: boolean }) {
        const { collapsed, mobile } = options;

        if (collapsed) {
            return (
                <nav className="space-y-2">
                    {orderedProjectSummaries.slice(0, 8).map((summary) => {
                        const active = activeProjectId === summary.list.id;
                        const palette = getProjectColorClasses(summary.list.color_token);
                        const Icon = getProjectIcon(summary.list.icon_token);

                        return (
                            <button
                                key={summary.list.id}
                                type="button"
                                title={summary.list.name}
                                aria-current={active ? "page" : undefined}
                                onClick={() => handleNavigate(`/projects/${summary.list.id}`)}
                                className={cn(
                                    "group mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-transparent transition-colors",
                                    active
                                        ? "border-sidebar-border bg-sidebar-accent/90 text-sidebar-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]"
                                        : "hover:border-sidebar-border hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                                )}
                            >
                                <span
                                    className={cn(
                                        "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                                        palette.soft,
                                        active ? cn("border shadow-[0_0_0_1px_rgba(255,255,255,0.08)]", palette.border) : "opacity-80 group-hover:opacity-100",
                                    )}
                                >
                                    <Icon className={cn("h-4 w-4", palette.text, !active && "opacity-90")} />
                                </span>
                                <span className="sr-only">{summary.list.name}</span>
                            </button>
                        );
                    })}
                </nav>
            );
        }

        const content = (
            <nav className="space-y-1">
                {orderedProjectSummaries.map((summary, index) => {
                    const active = activeProjectId === summary.list.id;
                    const palette = getProjectColorClasses(summary.list.color_token);
                    const Icon = getProjectIcon(summary.list.icon_token);
                    const statusLabel = getProjectStatusLabel(summary).join(" / ");

                    return (
                        <Draggable key={summary.list.id} draggableId={summary.list.id} index={index}>
                            {(draggableProvided, snapshot) => (
                                <div
                                    ref={draggableProvided.innerRef}
                                    {...draggableProvided.draggableProps}
                                    {...draggableProvided.dragHandleProps}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Open or reorder ${summary.list.name}`}
                                    onClick={() => {
                                        if (suppressProjectClickRef.current) return;
                                        handleNavigate(`/projects/${summary.list.id}`);
                                    }}
                                    onKeyDown={(event) => {
                                        if (event.key !== "Enter" && event.key !== " ") return;
                                        event.preventDefault();
                                        if (suppressProjectClickRef.current) return;
                                        handleNavigate(`/projects/${summary.list.id}`);
                                    }}
                                    style={{
                                        ...draggableProvided.draggableProps.style,
                                        cursor: snapshot.isDragging ? "grabbing" : "pointer",
                                    }}
                                    className={cn(
                                        "flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 text-left font-medium transition-colors",
                                        isCompact ? "py-[0.375rem] text-[13px]" : "py-2.5 text-sm",
                                        active
                                            ? "border-sidebar-border bg-sidebar-accent/90 text-sidebar-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                                            : "text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                                        snapshot.isDragging && "cursor-grabbing border-sidebar-border bg-sidebar-accent/80",
                                    )}
                                >
                                    <span className={cn("pointer-events-none h-2.5 w-2.5 shrink-0 rounded-sm", palette.accent)} />
                                    <Icon className={cn("pointer-events-none h-4 w-4 shrink-0", active ? palette.text : "text-muted-foreground")} />
                                    <span className="pointer-events-none min-w-0 flex-1">
                                        <span className="block truncate">{summary.list.name}</span>
                                        <span className="block truncate text-[11px] font-normal text-muted-foreground">
                                            {statusLabel}
                                        </span>
                                    </span>
                                    <span className="pointer-events-none rounded-md border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                        {summary.incompleteCount}
                                    </span>
                                </div>
                            )}
                        </Draggable>
                    );
                })}
            </nav>
        );

        if (!mounted) {
            return (
                <nav className="space-y-1">
                    {orderedProjectSummaries.map((summary) => {
                        const active = activeProjectId === summary.list.id;
                        const palette = getProjectColorClasses(summary.list.color_token);
                        const Icon = getProjectIcon(summary.list.icon_token);
                        const statusLabel = getProjectStatusLabel(summary).join(" / ");

                        return (
                            <button
                                key={summary.list.id}
                                type="button"
                                onClick={() => handleNavigate(`/projects/${summary.list.id}`)}
                                className={cn(
                                    "flex w-full items-center gap-2.5 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-medium transition-colors",
                                    active
                                        ? "border-sidebar-border bg-sidebar-accent/90 text-sidebar-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                                        : "text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                                )}
                            >
                                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", palette.accent)} />
                                <Icon className={cn("h-4 w-4 shrink-0", active ? palette.text : "text-muted-foreground")} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">{summary.list.name}</span>
                                    <span className="block truncate text-[11px] font-normal text-muted-foreground">
                                        {statusLabel}
                                    </span>
                                </span>
                                <span className="rounded-md border border-border/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                    {summary.incompleteCount}
                                </span>
                            </button>
                        );
                    })}
                </nav>
            );
        }

        return (
            <DragDropContext
                onDragStart={() => {
                    suppressProjectClickRef.current = true;
                }}
                onDragEnd={handleProjectDragEnd}
            >
                <Droppable droppableId={mobile ? "mobile-sidebar-projects" : "desktop-sidebar-projects"}>
                    {(provided) => (
                        <div ref={provided.innerRef} {...provided.droppableProps}>
                            {content}
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        );
    }

    function renderSidebarContent(options: { collapsed: boolean; mobile: boolean; previewing?: boolean }) {
        const { collapsed, mobile, previewing = false } = options;
        const projectsIndexActive = pathname === "/projects" || pathname.startsWith("/projects/");
        const profileMenuTriggerId = mobile
            ? "mobile-sidebar-profile-menu-trigger"
            : collapsed
                ? "collapsed-sidebar-profile-menu-trigger"
                : previewing
                    ? "preview-sidebar-profile-menu-trigger"
                    : "desktop-sidebar-profile-menu-trigger";
        const isDesktopProfileMenuOpen = !mobile && desktopProfileMenuId === profileMenuTriggerId;

        return (
            <div className="flex h-full w-full flex-col bg-sidebar">
                <div className={cn("border-b border-sidebar-border", collapsed ? "px-2 py-3" : "px-3 py-3")}>
                    {collapsed ? (
                        <div className="flex flex-col items-center gap-3">
                            <Link
                                href="/tasks"
                                title="Go to Today"
                                onClick={() => dismissPrimaryActivities()}
                                className="flex h-10 w-10 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent text-sm font-semibold tracking-[0.08em] text-sidebar-foreground transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/80"
                            >
                                <span aria-hidden="true">S</span>
                                <span className="sr-only">Go to Today</span>
                            </Link>

                            {renderGlobalSearchTrigger({ collapsed, mobile })}

                            <button
                                type="button"
                                onClick={() => {
                                    openQuickAdd();
                                }}
                                title="Quick add"
                                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl border border-primary bg-primary text-primary-foreground transition-colors hover:bg-primary/92"
                            >
                                <Plus className="h-4 w-4" />
                                <span className="sr-only">Quick Add</span>
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-start justify-between gap-3">
                                <Link
                                    href="/tasks"
                                    onClick={() => dismissPrimaryActivities()}
                                    className="flex min-w-0 items-center gap-2"
                                >
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sidebar-border bg-sidebar-accent text-sm font-semibold tracking-[0.08em] text-sidebar-foreground">
                                        S
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-semibold text-sidebar-foreground">Stride</span>
                                    </span>
                                </Link>

                                {mobile ? null : (
                                    <Button
                                        variant="ghost"
                                        size="icon-sm"
                                        onClick={() => setCollapsedState(!desktopCollapsed)}
                                        title={previewing ? "Keep sidebar open" : "Collapse sidebar"}
                                        className={cn(
                                            "rounded-xl border border-sidebar-border/70 text-muted-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground",
                                            previewing && "bg-sidebar-accent/60",
                                        )}
                                    >
                                        {previewing ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                                        <span className="sr-only">{previewing ? "Keep sidebar open" : "Collapse sidebar"}</span>
                                    </Button>
                                )}
                            </div>

                            <div className="mt-3 space-y-2">
                                {renderGlobalSearchTrigger({ collapsed, mobile })}

                                <Button
                                    className="h-10 w-full justify-between rounded-xl px-3"
                                    size="sm"
                                    onClick={() => {
                                        openQuickAdd();
                                    }}
                                    title="Quick add"
                                >
                                    <span className="inline-flex items-center gap-2">
                                        <Plus className="h-4 w-4" />
                                        Add task
                                    </span>
                                    {mobile ? null : (
                                        <span className="rounded-md border border-primary-foreground/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-primary-foreground/80">
                                            Q
                                        </span>
                                    )}
                                </Button>
                            </div>
                        </>
                    )}
                </div>

                <div className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-2.5")}>
                    <div className={cn("space-y-5", collapsed && "space-y-4")}>
                        <section className="space-y-1">
                            {!collapsed ? (
                                <div className="px-2.5">
                                    <p className="eyebrow">Loop</p>
                                </div>
                            ) : null}
                            <nav className="space-y-1">
                                {PRIMARY_ITEMS.map((item) => {
                                    const active = item.href === "/tasks"
                                        ? pathname === "/tasks" && activeSmartView === null
                                        : pathname === item.href || pathname.startsWith(`${item.href}/`);

                                    return (
                                        <button
                                            key={item.href}
                                            type="button"
                                            onClick={() => handleNavigate(item.href)}
                                            title={collapsed ? item.label : undefined}
                                            aria-current={active ? "page" : undefined}
                                            className={cn(
                                                "relative flex w-full cursor-pointer items-center justify-start rounded-xl border border-transparent text-left font-medium transition-colors",
                                                collapsed ? "mx-auto h-10 w-10 justify-center px-0" : cn("gap-2.5 px-3", isCompact ? "py-[0.375rem] text-[13px]" : "py-2.5 text-sm"),
                                                active
                                                    ? "border-sidebar-border bg-sidebar-accent/90 text-sidebar-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                                                    : "text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                                            )}
                                        >
                                            <item.icon className="h-4.5 w-4.5 shrink-0" />
                                            {collapsed ? <span className="sr-only">{item.label}</span> : (
                                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </nav>
                        </section>

                        <section className="space-y-1">
                            {!collapsed ? (
                                <div className="px-2.5">
                                    <p className="eyebrow">Workspace</p>
                                </div>
                            ) : null}
                            <nav className="space-y-1">
                                {SECONDARY_ITEMS.map((item) => {
                                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

                                    return (
                                        <button
                                            key={item.href}
                                            type="button"
                                            onClick={() => handleNavigate(item.href)}
                                            title={collapsed ? item.label : undefined}
                                            aria-current={active ? "page" : undefined}
                                            className={cn(
                                                "relative flex w-full cursor-pointer items-center justify-start rounded-xl border border-transparent text-left font-medium transition-colors",
                                                collapsed ? "mx-auto h-10 w-10 justify-center px-0" : cn("gap-2.5 px-3", isCompact ? "py-[0.375rem] text-[13px]" : "py-2.5 text-sm"),
                                                active
                                                    ? "border-sidebar-border bg-sidebar-accent/90 text-sidebar-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                                                    : "text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                                            )}
                                        >
                                            <item.icon className="h-4.5 w-4.5 shrink-0" />
                                            {collapsed ? <span className="sr-only">{item.label}</span> : (
                                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </nav>
                        </section>

                        {!collapsed && pathname === "/tasks" ? (
                            <section className="space-y-1.5">
                                <div className="px-2.5">
                                    <p className="eyebrow">Views</p>
                                </div>
                                <nav className="space-y-1">
                                    {SMART_VIEW_ITEMS.map((item) => {
                                        const active = activeSmartView === item.value;
                                        const count = smartViewCounts[item.value];
                                        return (
                                            <button
                                                key={item.value}
                                                type="button"
                                                onClick={() => handleNavigate(item.href)}
                                                aria-current={active ? "page" : undefined}
                                                className={cn(
                                                    "flex w-full cursor-pointer items-center gap-2.5 rounded-xl border border-transparent px-3 text-left font-medium transition-colors",
                                                    isCompact ? "py-[0.375rem] text-[13px]" : "py-2.5 text-sm",
                                                    active
                                                        ? "border-sidebar-border bg-sidebar-accent/90 text-sidebar-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]"
                                                        : "text-muted-foreground hover:border-sidebar-border hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                                                )}
                                            >
                                                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                                                    <item.icon className="h-4 w-4 shrink-0" />
                                                    <span className="truncate">{item.label}</span>
                                                </span>
                                                <span className="ml-auto rounded-md border border-sidebar-border bg-sidebar px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                                    {count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </nav>
                            </section>
                        ) : null}

                        <section className="space-y-1.5">
                            {!collapsed ? (
                                <div className="flex items-center justify-between px-2.5 py-0.5">
                                    <button
                                        type="button"
                                        onClick={() => handleNavigate("/projects")}
                                        className={cn(
                                            "eyebrow cursor-pointer transition-colors hover:text-foreground",
                                            projectsIndexActive ? "text-foreground" : "text-muted-foreground",
                                        )}
                                    >
                                        Projects
                                    </button>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handleNavigate("/projects")}
                                            className="cursor-pointer rounded-md border border-sidebar-border px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-foreground"
                                        >
                                            Manage
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleProjectDialogOpenChange(true)}
                                            aria-label="New project"
                                            title="New project"
                                            className="cursor-pointer rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:bg-primary/15"
                                        >
                                            +
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                            {renderProjectLinks({ collapsed, mobile })}
                        </section>
                    </div>
                </div>

                <div className={cn("border-t border-sidebar-border py-2.5", collapsed ? "px-2" : "px-2.5")}>
                    <DropdownMenu
                        open={mobile ? mobileProfileMenuSource === "sidebar" : isDesktopProfileMenuOpen}
                        onOpenChange={(open) => {
                            if (mobile) {
                                setMobileProfileMenuSource(open ? "sidebar" : null);
                                return;
                            }

                            setDesktopProfileMenuId(open ? profileMenuTriggerId : null);
                        }}
                    >
                        <DropdownMenuTrigger asChild>
                            <button
                                id={profileMenuTriggerId}
                                className={cn(
                                    "flex w-full cursor-pointer items-center rounded-xl border border-transparent transition-colors hover:border-sidebar-border hover:bg-sidebar-accent/70",
                                    collapsed ? "mx-auto h-10 w-10 justify-center px-0" : "gap-3 px-3 py-2 text-left",
                                )}
                            >
                                <Avatar className={cn("border border-border/60", collapsed ? "h-8 w-8" : "h-9 w-9")}>
                                    <AvatarImage src={avatarUrl ?? ""} alt={profile?.username ?? "User"} />
                                    <AvatarFallback className="bg-primary/12 text-primary">
                                        {profile?.username?.slice(0, 1).toUpperCase() ?? "S"}
                                    </AvatarFallback>
                                </Avatar>
                                {collapsed ? (
                                    <span className="sr-only">Open account menu</span>
                                ) : (
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                            {profile?.username ?? "Profile"}
                                        </p>
                                        <p className="truncate text-[11px] text-muted-foreground">Account and preferences</p>
                                    </div>
                                )}
                            </button>
                        </DropdownMenuTrigger>
                        {renderProfileMenuContent()}
                    </DropdownMenu>
                </div>
            </div>
        );
    }

    const content = (
        <div className="min-h-screen bg-background">
            {desktopCollapsed ? (
                <>
                    <aside
                        onMouseEnter={handleDesktopSidebarMouseEnter}
                        onMouseLeave={handleDesktopSidebarMouseLeave}
                        className="fixed inset-y-0 left-0 z-30 hidden w-[4.25rem] overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex"
                    >
                        {renderSidebarContent({ collapsed: true, mobile: false })}
                    </aside>

                    <aside
                        onMouseEnter={handleDesktopSidebarMouseEnter}
                        onMouseLeave={handleDesktopSidebarMouseLeave}
                        className={cn(
                            "fixed inset-y-0 left-0 z-40 hidden w-72 overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex",
                            desktopPreviewOpen
                                ? "pointer-events-auto shadow-[0_18px_36px_rgba(17,18,15,0.18)]"
                                : "pointer-events-none shadow-none",
                        )}
                        style={{
                            clipPath: desktopPreviewOpen
                                ? "inset(0 0 0 0)"
                                : `inset(0 calc(100% - ${DESKTOP_SIDEBAR_COLLAPSED_WIDTH}) 0 0)`,
                            opacity: desktopPreviewOpen ? 1 : 0,
                            transition: [
                                `clip-path 320ms ${DESKTOP_SIDEBAR_PREVIEW_EASING}`,
                                "opacity 180ms ease-out",
                                `box-shadow 320ms ${DESKTOP_SIDEBAR_PREVIEW_EASING}`,
                            ].join(", "),
                            willChange: "clip-path, opacity, box-shadow",
                        }}
                    >
                        <div
                            className="h-full w-72"
                            style={{
                                opacity: desktopPreviewOpen ? 1 : 0.84,
                                transform: desktopPreviewOpen ? "translateX(0)" : "translateX(-8px)",
                                transition: [
                                    `transform 340ms ${DESKTOP_SIDEBAR_PREVIEW_EASING}`,
                                    "opacity 180ms ease-out",
                                ].join(", "),
                                willChange: "transform, opacity",
                            }}
                        >
                            {renderSidebarContent({ collapsed: false, mobile: false, previewing: true })}
                        </div>
                    </aside>
                </>
            ) : (
                <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 overflow-hidden border-r border-sidebar-border bg-sidebar lg:flex">
                    {renderSidebarContent({ collapsed: false, mobile: false })}
                </aside>
            )}

            <main className={cn("pt-0 transition-[padding-left,padding-top] duration-200 lg:pt-0", desktopCollapsed ? "lg:pl-[4.25rem]" : "lg:pl-72")}>
                {children}
            </main>

            {userId ? (
                <>
                    <div className="fixed inset-x-0 top-[max(0.5rem,env(safe-area-inset-top))] z-30 flex items-start justify-between gap-3 px-3 sm:px-4 lg:hidden">
                        <div className="flex items-start justify-between gap-3">
                            <Button
                                variant="outline"
                                size="icon-sm"
                                onClick={() => handleMobileSidebarOpenChange(true)}
                                className="rounded-xl border-border/80 bg-card/95 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                            >
                                <Menu className="h-5 w-5" />
                                <span className="sr-only">Open navigation</span>
                            </Button>

                            <div className="flex items-center gap-1.5">
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    onClick={() => openGlobalSearch()}
                                    className="rounded-xl border-border/80 bg-card/95 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                                >
                                    <Search className="h-4.5 w-4.5" />
                                    <span className="sr-only">Search</span>
                                </Button>
                                <Button
                                    size="icon-sm"
                                    onClick={() => openQuickAdd()}
                                    className="rounded-xl shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                                >
                                    <Plus className="h-4.5 w-4.5" />
                                    <span className="sr-only">Quick add</span>
                                </Button>
                                <DropdownMenu
                                    open={mobileProfileMenuSource === "topbar"}
                                    onOpenChange={(open) => setMobileProfileMenuSource(open ? "topbar" : null)}
                                >
                                    <DropdownMenuTrigger asChild>
                                        <button
                                            id="mobile-topbar-profile-menu-trigger"
                                            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl border border-border/80 bg-card/95 shadow-[0_8px_24px_rgba(15,23,42,0.12)]"
                                        >
                                            <Avatar className="h-7 w-7 border border-border/60">
                                                <AvatarImage src={avatarUrl ?? ""} alt={profile?.username ?? "User"} />
                                                <AvatarFallback className="bg-primary/12 text-primary">
                                                    {profile?.username?.slice(0, 1).toUpperCase() ?? "S"}
                                                </AvatarFallback>
                                            </Avatar>
                                            <span className="sr-only">Open account menu</span>
                                        </button>
                                    </DropdownMenuTrigger>
                                    {renderProfileMenuContent()}
                                </DropdownMenu>
                            </div>
                        </div>
                    </div>

                    <Sheet open={mobileSidebarOpen} onOpenChange={handleMobileSidebarOpenChange}>
                        <SheetContent
                            side="left"
                            showCloseButton={false}
                            className="w-[86vw] max-w-[22rem] border-r border-sidebar-border bg-sidebar p-0 shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
                        >
                            <SheetHeader className="sr-only">
                                <SheetTitle>Navigation</SheetTitle>
                                <SheetDescription>Navigate between pages, projects, and account settings.</SheetDescription>
                            </SheetHeader>
                            {renderSidebarContent({ collapsed: false, mobile: true })}
                        </SheetContent>
                    </Sheet>
                </>
            ) : null}

            <Dialog open={globalSearchOpen} onOpenChange={handleGlobalSearchOpenChange}>
                <DialogContent showCloseButton={false} className="max-w-2xl overflow-hidden rounded-2xl border-border/80 p-0 shadow-[0_24px_70px_rgba(15,23,42,0.18)]">
                    <DialogTitle className="sr-only">Command palette</DialogTitle>
                    <DialogDescription className="sr-only">
                        Search destinations, projects, and tasks across your workspace, or run quick actions.
                    </DialogDescription>

                    <div className="border-b border-border/70 bg-card/40 px-4 py-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
                                <Search className="h-4 w-4" />
                            </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="truncate text-sm font-semibold text-foreground">Command palette</p>
                                            </div>
                                            <span className="rounded-md border border-border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                                Ctrl K
                                    </span>
                                </div>
                                <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
                                    <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                                    <Input
                                        autoFocus
                                        value={globalSearchQuery}
                                        onChange={(event) => setGlobalSearchQuery(event.target.value)}
                                        placeholder="Search or run a command"
                                        className="h-10 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="max-h-[70vh] overflow-y-auto p-3">
                        {!hasGlobalSearchResults ? (
                            <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
                                No commands or results for &quot;{globalSearchQuery.trim()}&quot;.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {matchingActionResults.length > 0 ? (
                                    <div className="space-y-1">
                                        <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                            Actions
                                        </p>
                                        {matchingActionResults.map((item) => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                onClick={() => handleCommandAction(item.id)}
                                                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-sidebar-accent/60"
                                            >
                                                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                                                    <item.icon className="h-4 w-4" />
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}

                                {matchingViewResults.length > 0 ? (
                                    <div className={cn("space-y-1", matchingActionResults.length > 0 && "border-t border-border/60 pt-3")}>
                                        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                            Navigate
                                        </p>
                                        {matchingViewResults.map((item) => (
                                            <button
                                                key={item.href}
                                                type="button"
                                                onClick={() => handleGlobalSearchNavigate(item.href)}
                                                className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-sidebar-accent/60"
                                            >
                                                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground">
                                                    <item.icon className="h-4 w-4" />
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{item.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : null}

                                {matchingProjectResults.length > 0 ? (
                                    <div className="space-y-1 border-t border-border/60 pt-3">
                                        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                            Projects
                                        </p>
                                        {matchingProjectResults.map((summary) => {
                                            const palette = getProjectColorClasses(summary.list.color_token);
                                            const Icon = getProjectIcon(summary.list.icon_token);
                                            const metaParts = getProjectStatusLabel(summary);

                                            return (
                                                <button
                                                    key={summary.list.id}
                                                    type="button"
                                                    onClick={() => handleGlobalSearchNavigate(`/projects/${summary.list.id}`)}
                                                    className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-sidebar-accent/60"
                                                >
                                                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg border", palette.soft, palette.border)}>
                                                        <Icon className={cn("h-4 w-4", palette.text)} />
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-foreground">{summary.list.name}</p>
                                                        <p className="truncate text-[11px] text-muted-foreground">{metaParts.join(" / ")}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}

                                {matchingTaskResults.length > 0 ? (
                                    <div className="space-y-1 border-t border-border/60 pt-3">
                                        <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                            Tasks
                                        </p>
                                        {matchingTaskResults.map(({ projectName, task }) => {
                                            const dueLabel = formatTaskDueLabel(task, new Date(), profile?.timezone);
                                            return (
                                                <button
                                                    key={task.id}
                                                    type="button"
                                                    onClick={() => handleGlobalSearchNavigate(`/tasks?taskId=${task.id}`)}
                                                    className="flex w-full items-start gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-sidebar-accent/60"
                                                >
                                                    <span className={cn(
                                                        "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border",
                                                        task.is_done
                                                            ? "border-primary/70 bg-primary/12 text-primary"
                                                            : "border-border bg-card text-muted-foreground",
                                                    )}>
                                                        <CheckSquare2 className="h-3.5 w-3.5" />
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                                                        <p className="truncate text-[11px] text-muted-foreground">
                                                            {[projectName, dueLabel, task.is_done ? "Completed" : null].filter(Boolean).join(" / ")}
                                                        </p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <QuickAddDialog
                open={quickAddOpen}
                defaults={quickAddDefaults}
                onOpenChange={setQuickAddOpen}
            />
            <ProjectDialog open={projectDialogOpen} onOpenChange={handleProjectDialogOpenChange} />
            {userId && (
                <SettingsDialog 
                    open={settingsOpen} 
                    onOpenChange={handleSettingsOpenChange} 
                    userId={userId} 
                    initialSection={settingsSection}
                />
            )}
        </div>
    );

    return (
        <ShellActionsContext.Provider value={contextValue}>
            {content}
        </ShellActionsContext.Provider>
    );
}
