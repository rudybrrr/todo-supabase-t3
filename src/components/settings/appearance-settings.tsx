"use client";

import { Check, Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { ACCENT_OPTIONS, useAccent } from "~/components/accent-provider";
import { APP_THEMES, resolveThemeSelection } from "~/lib/theme-options";
import { cn } from "~/lib/utils";

export function AppearanceSettings() {
    const { accent, mounted, setAccent } = useAccent();
    const { resolvedTheme, setTheme, theme } = useTheme();
    const activeTheme = resolveThemeSelection(theme, resolvedTheme);

    const themeIcons = {
        system: Laptop,
        light: Sun,
        dark: Moon,
    } as const;

    return (
        <div className="space-y-6">
            <section className="space-y-3">
                <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-foreground">Theme</h3>
                    <p className="text-sm leading-6 text-muted-foreground">
                        Choose the chrome contrast that fits your environment.
                    </p>
                </div>
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
                                    "flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors",
                                    active
                                        ? "border-primary bg-primary/10 text-foreground"
                                        : "border-border/60 bg-background/70 text-muted-foreground hover:border-border hover:bg-secondary/70 hover:text-foreground",
                                )}
                            >
                                <span className="flex items-center gap-3">
                                    <span
                                        className={cn(
                                            "flex h-9 w-9 items-center justify-center rounded-lg border",
                                            active ? "border-primary/30 bg-primary/15 text-primary" : "border-border/60 bg-secondary/50 text-muted-foreground",
                                        )}
                                    >
                                        <Icon className="h-4.5 w-4.5" />
                                    </span>
                                    <span className="text-sm font-medium">{option.label}</span>
                                </span>
                                {active ? <Check className="h-4 w-4 text-primary" /> : null}
                            </button>
                        );
                    })}
                </div>
            </section>

            <section className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                    <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-foreground">Accent</h3>
                        <p className="text-sm leading-6 text-muted-foreground">
                            Your accent follows the same account across devices.
                        </p>
                    </div>
                    <span className="text-xs text-muted-foreground">Synced to profile</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Accent color">
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
                                    "flex items-center justify-between rounded-xl border px-3.5 py-3 text-left transition-colors",
                                    active
                                        ? "border-primary bg-primary/10 text-foreground"
                                        : "border-border/60 bg-background/70 text-muted-foreground hover:border-border hover:bg-secondary/70 hover:text-foreground",
                                )}
                            >
                                <span className="flex items-center gap-3">
                                    <span
                                        className="h-3.5 w-3.5 rounded-full border border-black/10"
                                        style={{ backgroundColor: option.swatch }}
                                    />
                                    <span className="text-sm font-medium">{option.label}</span>
                                </span>
                                {active ? <Check className="h-4 w-4 text-primary" /> : null}
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
