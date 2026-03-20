"use client";

import { Pause, Play, RotateCcw } from "lucide-react";

import { useFocus, MODE_CONFIG } from "~/components/focus-provider";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

function formatTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`;
}

export function FocusStrip() {
    const { mode, timeLeft, isActive, toggleTimer, resetTimer, handleModeChange } = useFocus();
    const config = MODE_CONFIG[mode];

    return (
        <div className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1.5">
                <p className="eyebrow">Focus</p>
                <div className="flex items-center gap-3">
                    <div className={cn("rounded-xl p-2.5", config.bgColor)}>
                        <config.icon className={cn("h-5 w-5", config.color)} />
                    </div>
                    <div>
                        <p className="font-mono text-2xl font-semibold tracking-[-0.05em]">{formatTime(timeLeft)}</p>
                        <p className="text-sm text-muted-foreground">
                            {mode === "focus" ? "Focus block" : "Break"}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3 sm:items-end">
                <div className="flex flex-wrap gap-2">
                    {(["focus", "shortBreak", "longBreak"] as const).map((nextMode) => (
                        <button
                            key={nextMode}
                            type="button"
                            onClick={() => handleModeChange(nextMode)}
                            className={cn(
                                "rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition-colors",
                                mode === nextMode
                                    ? "bg-primary/12 text-primary"
                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                            )}
                        >
                            {nextMode === "focus" ? "Focus" : nextMode === "shortBreak" ? "Short" : "Long"}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <Button size="sm" onClick={toggleTimer}>
                        {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        {isActive ? "Pause" : "Start"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetTimer}>
                        <RotateCcw className="h-4 w-4" />
                        Reset
                    </Button>
                </div>
            </div>
        </div>
    );
}
