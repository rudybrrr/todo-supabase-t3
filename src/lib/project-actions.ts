import type { SupabaseClient } from "@supabase/supabase-js";

import type { TodoList } from "~/lib/types";

interface TodoListRow {
    id: string;
    name: string;
    owner_id: string;
    inserted_at?: string;
    color_token?: string | null;
    icon_token?: string | null;
}

interface ProfileIdRow {
    id: string;
}

interface CreateProjectInput {
    userId: string;
    name: string;
    colorToken: string;
    iconToken: string;
}

const PROJECT_FIELDS = "id, name, owner_id, inserted_at, color_token, icon_token";
const LEGACY_PROJECT_FIELDS = "id, name, owner_id, inserted_at";

function isMissingProjectMetadataError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return (
        code === "PGRST204" ||
        message.includes("color_token") ||
        message.includes("icon_token")
    );
}

function normalizeProjectRow(row: TodoListRow): TodoList {
    return {
        ...row,
        color_token: row.color_token ?? null,
        icon_token: row.icon_token ?? null,
    };
}

export async function createProject(
    supabase: SupabaseClient,
    { userId, name, colorToken, iconToken }: CreateProjectInput,
) {
    const trimmedName = name.trim();
    if (!trimmedName) {
        throw new Error("Project name cannot be empty.");
    }

    const basePayload = {
        owner_id: userId,
        name: trimmedName,
    };

    const { data: list, error: listError } = await supabase
        .from("todo_lists")
        .insert({
            ...basePayload,
            color_token: colorToken,
            icon_token: iconToken,
        })
        .select(PROJECT_FIELDS)
        .single();

    let createdList = list as TodoListRow | null;
    if (listError) {
        if (!isMissingProjectMetadataError(listError)) throw listError;

        const { data: legacyList, error: legacyError } = await supabase
            .from("todo_lists")
            .insert(basePayload)
            .select(LEGACY_PROJECT_FIELDS)
            .single();

        if (legacyError) throw legacyError;
        createdList = legacyList as TodoListRow | null;
    }

    if (!createdList) {
        throw new Error("Project creation returned no data.");
    }

    const { error: membershipError } = await supabase.from("todo_list_members").upsert({
        list_id: createdList.id,
        user_id: userId,
        role: "owner",
    });

    if (membershipError) throw membershipError;

    return normalizeProjectRow(createdList);
}

export async function updateProject(
    supabase: SupabaseClient,
    listId: string,
    updates: Partial<Pick<TodoList, "name" | "color_token" | "icon_token">>,
) {
    const payload = {
        ...updates,
        name: updates.name?.trim(),
    };

    const { data, error } = await supabase
        .from("todo_lists")
        .update(payload)
        .eq("id", listId)
        .select(PROJECT_FIELDS)
        .single();

    if (!error) {
        return normalizeProjectRow(data as TodoListRow);
    }

    if (!isMissingProjectMetadataError(error)) {
        throw error;
    }

    const legacyPayload: Partial<Pick<TodoList, "name">> = {};
    if (payload.name) {
        legacyPayload.name = payload.name;
    }

    const { data: legacyData, error: legacyError } = await supabase
        .from("todo_lists")
        .update(legacyPayload)
        .eq("id", listId)
        .select(LEGACY_PROJECT_FIELDS)
        .single();

    if (legacyError) throw legacyError;
    return normalizeProjectRow(legacyData as TodoListRow);
}

export async function inviteProjectMember(supabase: SupabaseClient, listId: string, username: string) {
    const cleanUsername = username.replace("@", "").trim().toLowerCase();
    if (!cleanUsername) {
        throw new Error("Username cannot be empty.");
    }

    const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .ilike("username", cleanUsername)
        .maybeSingle();

    if (profileError) throw profileError;
    const profile = profileData as ProfileIdRow | null;
    if (!profile) {
        throw new Error(`No student found with username @${cleanUsername}.`);
    }

    const { error: membershipError } = await supabase.from("todo_list_members").insert({
        list_id: listId,
        user_id: profile.id,
        role: "editor",
    });

    if (membershipError) {
        if (membershipError.code === "23505") {
            throw new Error(`@${cleanUsername} is already a member of this project.`);
        }
        throw membershipError;
    }
}

export async function deleteOrLeaveProject(
    supabase: SupabaseClient,
    listId: string,
    userId: string,
    ownerId: string,
) {
    if (ownerId === userId) {
        const { error } = await supabase.from("todo_lists").delete().eq("id", listId);
        if (error) throw error;
        return;
    }

    const { error } = await supabase
        .from("todo_list_members")
        .delete()
        .eq("list_id", listId)
        .eq("user_id", userId);

    if (error) throw error;
}
