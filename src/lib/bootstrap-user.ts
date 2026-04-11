import type { SupabaseClient } from "@supabase/supabase-js";

import { createProject } from "~/lib/project-actions";
import { getBrowserTimeZone } from "~/lib/task-deadlines";
import type { TodoList } from "~/lib/types";

interface BootstrapOptions {
    userId: string;
    email?: string | null;
    lists?: TodoList[];
    hasProfile?: boolean;
}

interface BootstrapMembershipRow {
    role: string;
    todo_lists: TodoList | TodoList[] | null;
}

const DEFAULT_INBOX_NAME = "Inbox";
const DEFAULT_INBOX_COLOR = "cobalt";
const DEFAULT_INBOX_ICON = "book-open";

function normalizeList(value: TodoList | TodoList[] | null): TodoList | null {
    if (!value) return null;
    if (Array.isArray(value)) return value[0] ?? null;
    return value;
}

function isInboxListName(name: string) {
    return name.trim().toLowerCase() === DEFAULT_INBOX_NAME.toLowerCase();
}

function hasOwnedInbox(lists: TodoList[], userId: string) {
    return lists.some((list) => list.owner_id === userId && isInboxListName(list.name));
}

function isMissingProfilesEmailColumnError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return code === "PGRST204" && message.includes("email");
}

async function ensureProfileRow(supabase: SupabaseClient, userId: string, email?: string | null) {
    let resolvedEmail = email?.trim() ?? null;
    const resolvedTimeZone = getBrowserTimeZone();

    if (!resolvedEmail) {
        const { data } = await supabase.auth.getUser();
        resolvedEmail = data.user?.id === userId ? (data.user.email ?? null) : null;
    }

    const profilePayloadWithEmail = resolvedEmail
        ? { id: userId, email: resolvedEmail, timezone: resolvedTimeZone }
        : { id: userId, timezone: resolvedTimeZone };

    const { error } = await supabase
        .from("profiles")
        .upsert(profilePayloadWithEmail, { onConflict: "id" });

    if (!error) return;
    if (!isMissingProfilesEmailColumnError(error)) {
        throw error;
    }

    const { error: fallbackError } = await supabase
        .from("profiles")
        .upsert({ id: userId, timezone: resolvedTimeZone }, { onConflict: "id" });

    if (fallbackError) {
        throw fallbackError;
    }
}

async function fetchAccessibleLists(supabase: SupabaseClient, userId: string) {
    const { data, error } = await supabase
        .from("todo_list_members")
        .select("list_id, role, todo_lists(*)")
        .eq("user_id", userId);

    if (error) throw error;

    return ((data ?? []) as BootstrapMembershipRow[]).flatMap((membership) => {
        const list = normalizeList(membership.todo_lists);
        if (!list) return [];

        return [{
            ...list,
            user_role: membership.role,
        }];
    });
}

export async function bootstrapUserWorkspace(
    supabase: SupabaseClient,
    { userId, email, lists, hasProfile }: BootstrapOptions,
) {
    try {
        const { error } = await supabase.rpc("ensure_default_inbox");
        if (!error) {
            return;
        }
    } catch {
        // Fall through to client-side repair.
    }

    if (!hasProfile) {
        await ensureProfileRow(supabase, userId, email);
    }

    let accessibleLists = lists ?? [];

    if (!hasOwnedInbox(accessibleLists, userId)) {
        accessibleLists = await fetchAccessibleLists(supabase, userId);
    }

    if (hasOwnedInbox(accessibleLists, userId)) {
        return;
    }

    await createProject(supabase, {
        userId,
        name: DEFAULT_INBOX_NAME,
        colorToken: DEFAULT_INBOX_COLOR,
        iconToken: DEFAULT_INBOX_ICON,
    });
}
