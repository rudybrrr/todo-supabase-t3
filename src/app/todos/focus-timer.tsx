"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Play, Pause, RotateCcw, Coffee, Brain, Timer } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";

type TimerMode = "focus" | "shortBreak" | "longBreak";

const MODE_CONFIG = {
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

export function FocusTimer({ userId, listId }: { userId?: string; listId?: string | null }) {
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);
    const [mode, setMode] = useState<TimerMode>("focus");
    const [timeLeft, setTimeLeft] = useState(MODE_CONFIG.focus.duration);
    const [isActive, setIsActive] = useState(false);

    const config = MODE_CONFIG[mode];

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

    const resetTimer = useCallback(() => {
        setIsActive(false);
        setTimeLeft(MODE_CONFIG[mode].duration);
    }, [mode]);

    const toggleTimer = () => {
        setIsActive(!isActive);
    };

    const handleModeChange = (newMode: TimerMode) => {
        setMode(newMode);
        setIsActive(false);
        setTimeLeft(MODE_CONFIG[newMode].duration);
    };

    const saveSession = useCallback(async () => {
        if (!userId) return;

        const { error } = await supabase.from("focus_sessions").insert({
            user_id: userId,
            list_id: listId || null,
            duration_seconds: MODE_CONFIG[mode].duration,
            mode: mode,
        });

        if (error) {
            console.error("Error saving focus session:", error);
            // Don't show toast for every fail to avoid spamming if offline, but log it
        } else {
            console.log("Session saved successfully");
        }
    }, [supabase, userId, listId, mode]);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            setIsActive(false);

            // Save session to database
            void saveSession();

            toast.success(
                mode === "focus"
                    ? "Study session complete! Take a well-deserved break."
                    : "Break's over! Ready to get back into focus mode?"
            );
        }

        return () => clearInterval(interval);
    }, [isActive, timeLeft, mode, saveSession]);

    const progress = useMemo(() => {
        const total = MODE_CONFIG[mode].duration;
        return ((total - timeLeft) / total) * 100;
    }, [timeLeft, mode]);

    // SVG Progress Ring calculations
    const radius = 32;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
        <Card className="border-border/50 bg-card/50 backdrop-blur-sm shadow-lg overflow-hidden ring-1 ring-border shadow-primary/5">
            <CardContent className="p-3 sm:p-4">
                <div className="flex items-center gap-4 sm:gap-6">
                    {/* Mini Timer Display */}
                    <div className="relative h-20 w-20 flex-shrink-0">
                        <svg className="w-20 h-20 transform -rotate-90">
                            <circle
                                cx="40"
                                cy="40"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="5"
                                fill="transparent"
                                className="text-border/50"
                            />
                            <circle
                                cx="40"
                                cy="40"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="5"
                                fill="transparent"
                                strokeDasharray={circumference}
                                style={{
                                    strokeDashoffset,
                                    transition: "stroke-dashoffset 0.5s ease"
                                }}
                                className={config.progressColor}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-lg font-bold tracking-tighter text-foreground font-mono">
                                {formatTime(timeLeft)}
                            </span>
                            <span className={`text-[8px] font-bold uppercase tracking-widest ${config.color}`}>
                                {mode === "focus" ? "Work" : "Break"}
                            </span>
                        </div>
                    </div>

                    {/* Controls and Content */}
                    <div className="flex-1 min-w-0 space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="min-w-0">
                                <h2 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2 truncate">
                                    <config.icon className={`h-3.5 w-3.5 ${config.color}`} />
                                    {mode === "focus" ? "Focus Session" : "Recharge"}
                                </h2>
                                <p className="text-[10px] text-muted-foreground font-medium truncate hidden sm:block">
                                    {mode === "focus"
                                        ? "Complete the session to log your progress!"
                                        : "Step away for a moment."}
                                </p>
                            </div>

                            <div className="flex items-center gap-1.5 self-start sm:self-auto">
                                {(Object.keys(MODE_CONFIG) as TimerMode[]).map((m) => (
                                    <button
                                        key={m}
                                        onClick={() => handleModeChange(m)}
                                        className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md transition-all ${mode === m
                                            ? "bg-primary/20 text-primary"
                                            : "text-muted-foreground hover:bg-muted"
                                            }`}
                                    >
                                        {m === "shortBreak" ? "Short" : m === "longBreak" ? "Long" : "Focus"}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Button
                                onClick={toggleTimer}
                                size="sm"
                                className={`h-8 px-5 rounded-lg text-xs font-bold shadow-md transition-all active:scale-95 ${isActive
                                    ? "bg-muted text-foreground hover:bg-muted/80"
                                    : "bg-primary hover:bg-primary/95 text-primary-foreground shadow-primary/20"
                                    }`}
                            >
                                {isActive ? (
                                    <Pause className="w-3.5 h-3.5 mr-1.5 fill-current" />
                                ) : (
                                    <Play className="w-3.5 h-3.5 mr-1.5 fill-current" />
                                )}
                                {isActive ? "Pause" : "Start"}
                            </Button>
                            <Button
                                onClick={resetTimer}
                                size="icon"
                                variant="outline"
                                className="h-8 w-8 rounded-lg border-border hover:bg-muted transition-all"
                            >
                                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>

    );
}
