"use client";

import { useMemo } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { useFocus, MODE_CONFIG, type TimerMode } from "~/components/focus-provider";

export function FocusTimer({ userId, listId }: { userId?: string; listId?: string | null }) {
    const {
        mode,
        timeLeft,
        isActive,
        toggleTimer,
        resetTimer,
        handleModeChange
    } = useFocus();

    const config = MODE_CONFIG[mode];

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    };

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
