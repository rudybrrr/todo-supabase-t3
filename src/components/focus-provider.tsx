"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Brain, Coffee, Timer } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import confetti from "canvas-confetti";

import { emitFocusSessionCompleted } from "~/lib/focus-session-events";
import type { TimerMode } from "~/lib/types";

export const MODE_CONFIG = {
    focus: {
        duration: 25 * 60,
        label: "Focus Time",
        icon: Brain,
        color: "text-primary",
        bgColor: "bg-primary/10",
        progressColor: "stroke-primary",
    },
    shortBreak: {
        duration: 5 * 60,
        label: "Short Break",
        icon: Coffee,
        color: "text-green-500",
        bgColor: "bg-green-500/10",
        progressColor: "stroke-green-500",
    },
    longBreak: {
        duration: 15 * 60,
        label: "Long Break",
        icon: Timer,
        color: "text-blue-500",
        bgColor: "bg-blue-500/10",
        progressColor: "stroke-blue-500",
    },
};

interface FocusContextType {
    mode: TimerMode;
    timeLeft: number;
    isActive: boolean;
    setMode: (mode: TimerMode) => void;
    setIsActive: (active: boolean) => void;
    setTimeLeft: (time: number) => void;
    toggleTimer: () => void;
    resetTimer: () => void;
    handleModeChange: (newMode: TimerMode) => void;
    currentListId: string | null;
    setCurrentListId: (id: string | null) => void;
    currentTaskId: string | null;
    setCurrentTaskId: (id: string | null) => void;
    currentBlockId: string | null;
    setCurrentBlockId: (id: string | null) => void;
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

import { useData } from "./data-provider";

export function FocusProvider({ children }: { children: React.ReactNode }) {
    const { userId } = useData();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [mode, setMode] = useState<TimerMode>("focus");
    const [timeLeft, setTimeLeft] = useState(MODE_CONFIG.focus.duration);
    const [isActive, setIsActive] = useState(false);
    const [currentListId, setCurrentListId] = useState<string | null>(null);
    const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
    const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);
    const completionHandledRef = useRef(false);

    // Initial Load from localStorage
    useEffect(() => {
        const savedMode = localStorage.getItem("focus-mode") as TimerMode;
        const savedTime = localStorage.getItem("focus-time");
        const savedListId = localStorage.getItem("focus-list-id");
        const savedTaskId = localStorage.getItem("focus-task-id");
        const savedBlockId = localStorage.getItem("focus-block-id");
        const nextMode = savedMode && MODE_CONFIG[savedMode] ? savedMode : "focus";
        const parsedTime = savedTime ? parseInt(savedTime, 10) : NaN;
        const nextTime = Number.isFinite(parsedTime) && parsedTime > 0
            ? parsedTime
            : MODE_CONFIG[nextMode].duration;

        setMode(nextMode);
        setTimeLeft(nextTime);
        // Until the timer is wall-clock based, never auto-resume on refresh.
        setIsActive(false);
        setCurrentListId(savedListId ?? null);
        setCurrentTaskId(savedTaskId ?? null);
        setCurrentBlockId(savedBlockId ?? null);
        completionHandledRef.current = false;
        setIsInitialized(true);
    }, []);

    // Save to localStorage
    useEffect(() => {
        if (!isInitialized) return;
        localStorage.setItem("focus-mode", mode);
        localStorage.setItem("focus-time", timeLeft.toString());
        localStorage.setItem("focus-active", isActive.toString());
        if (currentListId) {
            localStorage.setItem("focus-list-id", currentListId);
        } else {
            localStorage.removeItem("focus-list-id");
        }

        if (currentTaskId) {
            localStorage.setItem("focus-task-id", currentTaskId);
        } else {
            localStorage.removeItem("focus-task-id");
        }

        if (currentBlockId) {
            localStorage.setItem("focus-block-id", currentBlockId);
        } else {
            localStorage.removeItem("focus-block-id");
        }
    }, [currentBlockId, currentListId, currentTaskId, isActive, isInitialized, mode, timeLeft]);

    const toggleTimer = useCallback(() => {
        if (isActive) {
            setIsActive(false);
            return;
        }

        completionHandledRef.current = false;

        if (timeLeft <= 0) {
            setTimeLeft(MODE_CONFIG[mode].duration);
            setIsActive(true);
            return;
        }

        setIsActive(true);
    }, [isActive, mode, timeLeft]);

    const resetTimer = useCallback(() => {
        completionHandledRef.current = false;
        setIsActive(false);
        setTimeLeft(MODE_CONFIG[mode].duration);
    }, [mode]);

    const handleModeChange = useCallback((newMode: TimerMode) => {
        completionHandledRef.current = false;
        setMode(newMode);
        setIsActive(false);
        setTimeLeft(MODE_CONFIG[newMode].duration);
    }, []);

    const saveSession = useCallback(async () => {
        if (!userId) return;

        const sessionPayload = {
            user_id: userId,
            duration_seconds: MODE_CONFIG[mode].duration,
            mode,
            list_id: currentListId,
        };

        const { data, error } = await supabase
            .from("focus_sessions")
            .insert(sessionPayload)
            .select("id, inserted_at")
            .single();

        if (error) {
            console.error("Error saving focus session:", error);
            return;
        }

        emitFocusSessionCompleted({
            sessionId: typeof data?.id === "string" ? data.id : `${userId}-${mode}-${Date.now()}`,
            durationSeconds: MODE_CONFIG[mode].duration,
            mode,
            listId: currentListId,
            insertedAt: typeof data?.inserted_at === "string" ? data.inserted_at : new Date().toISOString(),
        });
    }, [supabase, mode, currentListId, userId]);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && isActive) {
            if (completionHandledRef.current) {
                return () => clearInterval(interval);
            }

            completionHandledRef.current = true;
            setIsActive(false);
            void saveSession();

            const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            if (!prefersReducedMotion) {
                void confetti({
                    particleCount: 120,
                    spread: 60,
                    origin: { y: 0.6 },
                    colors: ["#3155d6", "#0f8b74", "#c6801d"],
                });
            }

            toast.success(
                mode === "focus"
                    ? "Study session complete! Take a well-deserved break."
                    : "Break's over! Ready to get back into focus mode?"
            );
        }

        return () => clearInterval(interval);
    }, [isActive, timeLeft, mode, saveSession]);

    const value = useMemo(() => ({
        mode,
        timeLeft,
        isActive,
        setMode,
        setIsActive,
        setTimeLeft,
        toggleTimer,
        resetTimer,
        handleModeChange,
        currentListId,
        setCurrentListId,
        currentTaskId,
        setCurrentTaskId,
        currentBlockId,
        setCurrentBlockId,
    }), [currentBlockId, currentListId, currentTaskId, handleModeChange, isActive, mode, resetTimer, timeLeft, toggleTimer]);

    return (
        <FocusContext.Provider value={value}>
            {children}
        </FocusContext.Provider>
    );
}

export function useFocus() {
    const context = useContext(FocusContext);
    if (context === undefined) {
        throw new Error("useFocus must be used within a FocusProvider");
    }
    return context;
}
