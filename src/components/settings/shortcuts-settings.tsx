"use client";

const SHORTCUTS = [
    { keys: "Q", label: "Quick add" },
    { keys: "Ctrl/Cmd K", label: "Search" },
    { keys: "Ctrl/Cmd \\", label: "Toggle sidebar" },
] as const;

const SYNTAX_ROWS = [
    { syntax: "today, tomorrow, next mon", label: "Due date" },
    { syntax: "14:00, 2:30pm (requires date)", label: "Time" },
    { syntax: "#project-name", label: "Project or list" },
    { syntax: "+urgent, +math", label: "Label" },
    { syntax: "p1, p2, p3", label: "Priority" },
    { syntax: "30m, 2h 15m", label: "Duration" },
    { syntax: "r30m, r2h, r1d", label: "Reminder" },
    { syntax: "every day, every weekday", label: "Repeat" },
] as const;

export function ShortcutsSettings() {
    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                        Move faster without leaving the keyboard.
                    </p>
                </div>
                <div className="grid gap-2">
                    {SHORTCUTS.map((shortcut) => (
                        <div
                            key={shortcut.label}
                            className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3.5 py-3"
                        >
                            <span className="text-sm font-medium text-foreground">{shortcut.label}</span>
                            <kbd className="inline-flex h-7 items-center rounded-lg border border-border bg-secondary/60 px-2.5 font-mono text-[11px] text-muted-foreground">
                                {shortcut.keys}
                            </kbd>
                        </div>
                    ))}
                </div>
            </section>

            <section className="space-y-3">
                <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">Quick add syntax</h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                        Capture structured task details in a single line.
                    </p>
                </div>
                <div className="grid gap-2">
                    {SYNTAX_ROWS.map((feature) => (
                        <div
                            key={feature.label}
                            className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 px-3.5 py-3"
                        >
                            <span className="shrink-0 text-sm font-medium text-foreground">{feature.label}</span>
                            <span className="rounded-lg border border-border bg-secondary/60 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground">
                                {feature.syntax}
                            </span>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
