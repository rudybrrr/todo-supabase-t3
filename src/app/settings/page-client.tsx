"use client";

import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { ACCENT_OPTIONS, useAccent } from "~/components/accent-provider";
import { AppShell } from "~/components/app-shell";
import { PageHeader, SectionCard } from "~/components/app-primitives";
import { APP_THEMES, resolveThemeSelection } from "~/lib/theme-options";
import { cn } from "~/lib/utils";
import { ProfileForm } from "./profile-form";

export default function SettingsPageClient({ userId }: { userId: string }) {
    const { accent, mounted, setAccent } = useAccent();
    const { resolvedTheme, setTheme, theme } = useTheme();
    const activeTheme = resolveThemeSelection(theme, resolvedTheme);

    const themeIcons: Record<(typeof APP_THEMES)[number]["value"], LucideIcon> = {
        system: Monitor,
        light: Sun,
        dark: Moon,
    };
    const shortcuts = [
        { keys: "Q", label: "Quick add" },
        { keys: "Ctrl/Cmd K", label: "Search" },
        { keys: "Ctrl/Cmd \\", label: "Toggle sidebar" },
    ];

    return (
        <AppShell>
            <div className="page-container">
                <PageHeader title="Settings" />

                <div className="space-y-5">
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_20rem]">
                        <div className="space-y-4">
                            <ProfileForm userId={userId} />
                        </div>

                        <div className="space-y-4">
                            <SectionCard title="Appearance" dense>
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                            Theme
                                        </p>
                                        <div className="grid gap-2">
                                            {APP_THEMES.map((option) => {
                                                const Icon = themeIcons[option.value];
                                                const active = mounted && activeTheme === option.value;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() => setTheme(option.value)}
                                                        className={cn(
                                                            "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors",
                                                            active
                                                                ? "border-primary bg-primary/10 text-foreground"
                                                                : "border-border/60 bg-background/70 text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground",
                                                        )}
                                                    >
                                                        <span className="flex items-center gap-3">
                                                            <span className="rounded-lg bg-secondary/80 p-2">
                                                                <Icon className="h-4 w-4" />
                                                            </span>
                                                            <span className="text-sm font-semibold">{option.label}</span>
                                                        </span>
                                                        {active ? <Check className="h-4 w-4 text-primary" /> : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div className="space-y-1.5">
                                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                            Accent
                                        </p>
                                        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Accent color">
                                            {ACCENT_OPTIONS.map((option) => {
                                                const active = mounted && accent === option.value;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={active}
                                                        onClick={() => setAccent(option.value)}
                                                        className={cn(
                                                            "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-colors",
                                                            active
                                                                ? "border-primary bg-primary/10 text-foreground"
                                                                : "border-border/60 bg-background/70 text-muted-foreground hover:border-border hover:bg-secondary/80 hover:text-foreground",
                                                        )}
                                                    >
                                                        <span className="flex items-center gap-3">
                                                            <span
                                                                className="h-3.5 w-3.5 rounded-full"
                                                                style={{ backgroundColor: option.swatch }}
                                                            />
                                                            <span className="text-sm font-semibold">{option.label}</span>
                                                        </span>
                                                        {active ? <Check className="h-4 w-4 text-primary" /> : null}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </SectionCard>

                            <SectionCard title="Keyboard" dense>
                                <div className="space-y-2">
                                    {shortcuts.map((shortcut) => (
                                        <div
                                            key={shortcut.label}
                                            className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2"
                                        >
                                            <span className="text-sm text-foreground">{shortcut.label}</span>
                                            <span className="rounded-md border border-border bg-secondary/70 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                                                {shortcut.keys}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>

                            <SectionCard title="Quick Add Commands" dense>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {[
                                        { syntax: "today, tomorrow, next mon", label: "Due date" },
                                        { syntax: "14:00, 2:30pm (requires date)", label: "Time" },
                                        { syntax: "#project-name", label: "Project / list" },
                                        { syntax: "+urgent, +math", label: "Label" },
                                        { syntax: "p1, p2, p3", label: "Priority" },
                                        { syntax: "30m, 2h 15m", label: "Duration" },
                                        { syntax: "r30m, r2h, r1d", label: "Reminder" },
                                        { syntax: "every day, every weekday", label: "Repeat" },
                                    ].map((feature) => (
                                        <div
                                            key={feature.label}
                                            className="rounded-xl border border-border/60 bg-background/70 px-3 py-2"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <span className="text-sm text-foreground">{feature.label}</span>
                                                <span className="rounded-md border border-border bg-secondary/70 px-2 py-1 text-right font-mono text-[11px] leading-4 text-muted-foreground">
                                                    {feature.syntax}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        </div>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
