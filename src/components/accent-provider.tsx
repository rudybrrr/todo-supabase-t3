"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useData } from "~/components/data-provider";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

export const ACCENT_OPTIONS = [
    { value: "blue", label: "Blue", swatch: "#5f6f82" },
    { value: "teal", label: "Teal", swatch: "#366760" },
    { value: "green", label: "Green", swatch: "#4d6547" },
    { value: "amber", label: "Amber", swatch: "#946a36" },
    { value: "rose", label: "Rose", swatch: "#8d5f6b" },
    { value: "slate", label: "Slate", swatch: "#53605b" },
] as const;

export type AccentToken = (typeof ACCENT_OPTIONS)[number]["value"];

const DEFAULT_ACCENT: AccentToken = "slate";
const STORAGE_KEY = "study-sprint-accent";

interface AccentContextValue {
    accent: AccentToken;
    setAccent: (accent: AccentToken) => void;
    mounted: boolean;
}

const AccentContext = createContext<AccentContextValue | undefined>(undefined);

function isAccentToken(value: string | null): value is AccentToken {
    return ACCENT_OPTIONS.some((option) => option.value === value);
}

function applyAccent(accent: AccentToken) {
    document.documentElement.dataset.accent = accent;
}

function isMissingAccentPreferenceColumnError(error: unknown) {
    if (!error || typeof error !== "object") return false;

    const code = "code" in error ? String(error.code) : "";
    const message = "message" in error ? String(error.message) : "";

    return code === "PGRST204" && message.includes("accent_token");
}

export function AccentProvider({ children }: { children: ReactNode }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { profile, userId } = useData();
    const [accent, setAccentState] = useState<AccentToken>(DEFAULT_ACCENT);
    const [mounted, setMounted] = useState(false);
    const migratedUserIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const storedAccent = window.localStorage.getItem(STORAGE_KEY);
        const nextAccent = isAccentToken(storedAccent) ? storedAccent : DEFAULT_ACCENT;

        setAccentState(nextAccent);
        applyAccent(nextAccent);
        setMounted(true);

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== STORAGE_KEY) return;

            const syncedAccent = isAccentToken(event.newValue) ? event.newValue : DEFAULT_ACCENT;
            setAccentState(syncedAccent);
            applyAccent(syncedAccent);
        };

        window.addEventListener("storage", handleStorage);
        return () => {
            window.removeEventListener("storage", handleStorage);
        };
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const profileAccent = profile?.accent_token ?? null;
        const syncedAccent: AccentToken | null = isAccentToken(profileAccent) ? profileAccent : null;
        if (syncedAccent) {
            setAccentState((current) => current === syncedAccent ? current : syncedAccent);
            applyAccent(syncedAccent);
            window.localStorage.setItem(STORAGE_KEY, syncedAccent);
            return;
        }

        if (!userId || migratedUserIdsRef.current.has(userId)) return;

        migratedUserIdsRef.current.add(userId);
        const localAccent = window.localStorage.getItem(STORAGE_KEY);
        const fallbackAccent = isAccentToken(localAccent) ? localAccent : DEFAULT_ACCENT;

        void supabase
            .from("profiles")
            .upsert({ id: userId, accent_token: fallbackAccent }, { onConflict: "id" })
            .then(({ error }) => {
                if (!error || isMissingAccentPreferenceColumnError(error)) return;
                console.error("Failed to sync accent preference.", error);
            });
    }, [mounted, profile?.accent_token, supabase, userId]);

    const setAccent = useCallback((nextAccent: AccentToken) => {
        setAccentState(nextAccent);
        applyAccent(nextAccent);
        window.localStorage.setItem(STORAGE_KEY, nextAccent);

        if (!userId) return;

        void supabase
            .from("profiles")
            .upsert({ id: userId, accent_token: nextAccent }, { onConflict: "id" })
            .then(({ error }) => {
                if (!error || isMissingAccentPreferenceColumnError(error)) return;
                console.error("Failed to sync accent preference.", error);
            });
    }, [supabase, userId]);

    const value = useMemo<AccentContextValue>(() => ({
        accent,
        setAccent,
        mounted,
    }), [accent, mounted, setAccent]);

    return (
        <AccentContext.Provider value={value}>
            {children}
        </AccentContext.Provider>
    );
}

export function useAccent() {
    const context = useContext(AccentContext);
    if (!context) {
        throw new Error("useAccent must be used within an AccentProvider.");
    }
    return context;
}
