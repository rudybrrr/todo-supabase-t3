import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_AVATAR_BUCKET = "profile-avatars";

const ABSOLUTE_URL_PATTERN = /^(https?:)?\/\//i;

export function isAbsoluteAvatarUrl(value: string) {
    return ABSOLUTE_URL_PATTERN.test(value);
}

export function getPublicAvatarUrl(supabase: SupabaseClient, avatarPathOrUrl?: string | null) {
    if (!avatarPathOrUrl) return null;

    if (isAbsoluteAvatarUrl(avatarPathOrUrl)) {
        return avatarPathOrUrl;
    }

    const normalizedPath = avatarPathOrUrl.replace(/^\/+/, "");
    if (!normalizedPath) return null;

    return supabase.storage
        .from(PROFILE_AVATAR_BUCKET)
        .getPublicUrl(normalizedPath)
        .data.publicUrl;
}

export function isAvatarPathOwnedByUser(avatarPath: string, userId: string) {
    if (!avatarPath || isAbsoluteAvatarUrl(avatarPath)) {
        return false;
    }

    const normalizedPath = avatarPath.replace(/^\/+/, "");
    const [ownerFolder] = normalizedPath.split("/");
    return ownerFolder === userId;
}

