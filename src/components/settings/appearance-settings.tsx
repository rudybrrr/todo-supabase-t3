"use client";

import { useTheme } from "next-themes";
import { Check, Laptop, Moon, Sun } from "lucide-react";

import { ACCENT_OPTIONS, useAccent } from "~/components/accent-provider";
import { useCompactMode } from "~/components/compact-mode-provider";
import { APP_THEMES, resolveThemeSelection } from "~/lib/theme-options";
import { Switch } from "~/components/ui/switch";
import { cn } from "~/lib/utils";

export function AppearanceSettings() {
    const { accent, mounted, setAccent } = useAccent();
    const { isCompact, setCompact } = useCompactMode();
    const { resolvedTheme, setTheme, theme } = useTheme();
    const activeTheme = resolveThemeSelection(theme, resolvedTheme);

    const themeIcons = {
        system: Laptop,
        light: Sun,
        dark: Moon,
    } as const;

    return (
        <div className="space-y-8">
            <div className="space-y-4">
                <div className="space-y-1.5">
                    <h3 className="text-sm font-bold text-foreground">Theme</h3>
                    <p className="text-xs text-muted-foreground">
                        Choose between system, light, and dark mode.
                    </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    {APP_THEMES.map((option) => {
                        const Icon = themeIcons[option.value];
                        const active = mounted && activeTheme === option.value;
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setTheme(option.value)}
                                className={cn(
                                    "group flex items-center justify-between rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer",
                                    active
                                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/20"
                                        : "border-border/40 bg-card/40 text-muted-foreground hover:border-border hover:bg-secondary/60 hover:text-foreground",
                                )}
                            >
                                <span className="flex items-center gap-3.5">
                                    <span className={cn(
                                        "rounded-xl p-2.5 transition-colors",
                                        active ? "bg-primary/20 text-primary" : "bg-background/80 group-hover:bg-background"
                                    )}>
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <span className="text-sm font-bold">{option.label}</span>
                                </span>
                                {active ? (
                                    <div className="rounded-full bg-primary p-1">
                                        <Check className="h-3 w-3 text-primary-foreground" />
                                    </div>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-foreground">Accent</h3>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground opacity-70">
                            Synced to profile
                        </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Choose a primary color that follows you across devices.
                    </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Accent color">
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
                                    "group flex items-center justify-between rounded-2xl border p-4 text-left transition-all duration-200 cursor-pointer",
                                    active
                                        ? "border-primary bg-primary/10 text-foreground ring-1 ring-primary/20"
                                        : "border-border/40 bg-card/40 text-muted-foreground hover:border-border hover:bg-secondary/60 hover:text-foreground",
                                )}
                            >
                                <span className="flex items-center gap-3">
                                    <span
                                        className="h-4 w-4 rounded-full border border-black/10 shadow-sm transition-transform group-hover:scale-110"
                                        style={{ backgroundColor: option.swatch }}
                                    />
                                    <span className="text-sm font-bold">{option.label}</span>
                                </span>
                                {active ? (
                                    <div className="rounded-full bg-primary p-1">
                                        <Check className="h-3 w-3 text-primary-foreground" />
                                    </div>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-border/40">
                <div className="flex items-center justify-between">
                    <div className="space-y-1.5">
                        <h3 className="text-sm font-bold text-foreground">Compact Mode</h3>
                        <p className="text-xs text-muted-foreground">
                            Maximize information density by reducing whitespace across the app.
                        </p>
                    </div>
                    <Switch 
                        checked={isCompact} 
                        onCheckedChange={setCompact}
                        activeColor="primary"
                    />
                </div>
            </div>
        </div>
    );
}
