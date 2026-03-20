"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export const ACCENT_OPTIONS = [
    { value: "blue", label: "Blue", swatch: "#2f6ae0" },
    { value: "teal", label: "Teal", swatch: "#147d73" },
    { value: "green", label: "Green", swatch: "#2f8f54" },
    { value: "amber", label: "Amber", swatch: "#c47d1f" },
    { value: "rose", label: "Rose", swatch: "#c45172" },
    { value: "slate", label: "Slate", swatch: "#55657d" },
] as const;

export type AccentToken = (typeof ACCENT_OPTIONS)[number]["value"];

const DEFAULT_ACCENT: AccentToken = "blue";
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

export function AccentProvider({ children }: { children: ReactNode }) {
    const [accent, setAccentState] = useState<AccentToken>(DEFAULT_ACCENT);
    const [mounted, setMounted] = useState(false);

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

    const setAccent = useCallback((nextAccent: AccentToken) => {
        setAccentState(nextAccent);
        applyAccent(nextAccent);
        window.localStorage.setItem(STORAGE_KEY, nextAccent);
    }, []);

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
