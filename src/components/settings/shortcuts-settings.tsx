"use client";

import { useMemo } from "react";
export function ShortcutsSettings() {
    const shortcuts = useMemo(() => [
        { keys: "Q", label: "Quick add" },
        { keys: "Ctrl/Cmd K", label: "Search" },
        { keys: "Ctrl/Cmd \\", label: "Toggle sidebar" },
    ], []);

    const syntax = useMemo(() => [
        { syntax: "today, tomorrow, next mon", label: "Due Date" },
        { syntax: "14:00, 2:30pm (requires date)", label: "Time" },
        { syntax: "#project-name", label: "Project/List" },
        { syntax: "+urgent, +math", label: "Label" },
        { syntax: "p1, p2, p3", label: "Priority (High, Med, Low)" },
        { syntax: "30m, 2h 15m", label: "Duration" },
        { syntax: "r30m, r2h, r1d", label: "Reminder" },
        { syntax: "every day, every weekday", label: "Repeat" },
    ], []);

    return (
        <div className="space-y-8">
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-foreground">Keyboard Shortcuts</h3>
                    <p className="text-xs text-muted-foreground">
                        Efficiency at your fingertips.
                    </p>
                </div>
                <div className="grid gap-2">
                    {shortcuts.map((shortcut) => (
                        <div
                            key={shortcut.label}
                            className="flex items-center justify-between rounded-2xl border border-border/40 bg-card/40 px-4 py-3.5 transition-colors hover:border-border/60 hover:bg-secondary/40 cursor-pointer"
                        >
                            <span className="text-sm font-semibold text-foreground">{shortcut.label}</span>
                            <kbd className="inline-flex h-6 items-center rounded-lg border border-border bg-background px-2.5 font-mono text-[10px] font-bold text-muted-foreground shadow-sm">
                                {shortcut.keys}
                            </kbd>
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-foreground">Quick Add Syntax</h3>
                    <p className="text-xs text-muted-foreground">
                        Use these patterns to capture tasks even faster.
                    </p>
                </div>
                <div className="grid gap-2">
                    {syntax.map((feature) => (
                        <div
                            key={feature.label}
                            className="flex items-center justify-between gap-4 rounded-2xl border border-border/40 bg-card/40 px-4 py-3.5 transition-colors hover:border-border/60 hover:bg-secondary/40 cursor-pointer"
                        >
                            <span className="shrink-0 text-sm font-semibold text-foreground">{feature.label}</span>
                            <span className="rounded-lg border border-border/60 bg-secondary/60 px-2.5 py-1.5 text-right font-mono text-[10px] font-bold text-muted-foreground/80">
                                {feature.syntax}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
