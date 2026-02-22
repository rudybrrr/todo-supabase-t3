"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { Brain, Coffee, Timer } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

export type TimerMode = "focus" | "shortBreak" | "longBreak";

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
}

const FocusContext = createContext<FocusContextType | undefined>(undefined);

export function FocusProvider({ children }: { children: React.ReactNode }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [mode, setMode] = useState<TimerMode>("focus");
    const [timeLeft, setTimeLeft] = useState(MODE_CONFIG.focus.duration);
    const [isActive, setIsActive] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Initial Load from localStorage
    useEffect(() => {
        const savedMode = localStorage.getItem("focus-mode") as TimerMode;
        const savedTime = localStorage.getItem("focus-time");
        const savedIsActive = localStorage.getItem("focus-active") === "true";

        if (savedMode && MODE_CONFIG[savedMode]) {
            setMode(savedMode);
        }
        if (savedTime) {
            setTimeLeft(parseInt(savedTime, 10));
        }
        // We don't auto-start on refresh for better UX, but we keep the state if it was active
        setIsActive(savedIsActive);
        setIsInitialized(true);
    }, []);

    // Save to localStorage
    useEffect(() => {
        if (!isInitialized) return;
        localStorage.setItem("focus-mode", mode);
        localStorage.setItem("focus-time", timeLeft.toString());
        localStorage.setItem("focus-active", isActive.toString());
    }, [mode, timeLeft, isActive, isInitialized]);

    const toggleTimer = useCallback(() => {
        setIsActive((prev) => !prev);
    }, []);

    const resetTimer = useCallback(() => {
        setIsActive(false);
        setTimeLeft(MODE_CONFIG[mode].duration);
    }, [mode]);

    const handleModeChange = useCallback((newMode: TimerMode) => {
        setMode(newMode);
        setIsActive(false);
        setTimeLeft(MODE_CONFIG[newMode].duration);
    }, []);

    const saveSession = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase.from("focus_sessions").insert({
            user_id: user.id,
            duration_seconds: MODE_CONFIG[mode].duration,
            mode: mode,
        });

        if (error) {
            console.error("Error saving focus session:", error);
        }
    }, [supabase, mode]);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && isActive) {
            setIsActive(false);
            void saveSession();
            toast.success(
                mode === "focus"
                    ? "Study session complete! Take a well-deserved break."
                    : "Break's over! Ready to get back into focus mode?"
            );
        }

        return () => clearInterval(interval);
    }, [isActive, timeLeft, mode, saveSession]);

    const value = {
        mode,
        timeLeft,
        isActive,
        setMode,
        setIsActive,
        setTimeLeft,
        toggleTimer,
        resetTimer,
        handleModeChange,
    };

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
