"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useData } from "~/components/data-provider";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

const STORAGE_KEY = "study-sprint-compact-mode";

interface CompactModeContextValue {
    isCompact: boolean;
    setCompact: (isCompact: boolean) => void;
    mounted: boolean;
}

const CompactModeContext = createContext<CompactModeContextValue | undefined>(undefined);

function applyCompactMode(isCompact: boolean) {
    if (isCompact) {
        document.documentElement.classList.add("compact");
    } else {
        document.documentElement.classList.remove("compact");
    }
}

export function CompactModeProvider({ children }: { children: ReactNode }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const { profile, userId } = useData();
    const [isCompact, setIsCompactState] = useState<boolean>(false);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const initial = stored === "true";
        setIsCompactState(initial);
        applyCompactMode(initial);
        setMounted(true);

        const handleStorage = (event: StorageEvent) => {
            if (event.key !== STORAGE_KEY) return;
            const synced = event.newValue === "true";
            setIsCompactState(synced);
            applyCompactMode(synced);
        };

        window.addEventListener("storage", handleStorage);
        return () => window.removeEventListener("storage", handleStorage);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const profileCompact = profile?.is_compact_mode ?? false;
        setIsCompactState(profileCompact);
        applyCompactMode(profileCompact);
        window.localStorage.setItem(STORAGE_KEY, String(profileCompact));
    }, [mounted, profile?.is_compact_mode]);

    const setCompact = useCallback((nextCompact: boolean) => {
        setIsCompactState(nextCompact);
        applyCompactMode(nextCompact);
        window.localStorage.setItem(STORAGE_KEY, String(nextCompact));

        if (!userId) return;

        void supabase
            .from("profiles")
            .upsert({ id: userId, is_compact_mode: nextCompact }, { onConflict: "id" })
            .then(({ error }) => {
                if (error) {
                    console.error("Failed to sync compact mode preference.", error);
                }
            });
    }, [supabase, userId]);

    const value = useMemo<CompactModeContextValue>(() => ({
        isCompact,
        setCompact,
        mounted,
    }), [isCompact, mounted, setCompact]);

    return (
        <CompactModeContext.Provider value={value}>
            {children}
        </CompactModeContext.Provider>
    );
}

export function useCompactMode() {
    const context = useContext(CompactModeContext);
    if (!context) {
        throw new Error("useCompactMode must be used within a CompactModeProvider.");
    }
    return context;
}
