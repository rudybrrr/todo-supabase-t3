"use client";

import { Check, Circle, Moon, MoonStar, Sun } from "lucide-react";
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
    const accentDisabled = mounted && activeTheme === "noir";

    const themeIcons = {
        light: Sun,
        dark: Moon,
        midnight: MoonStar,
        noir: Circle,
    } as const;
    const shortcuts = [
        { keys: "Q", label: "Quick add" },
        { keys: "Ctrl/Cmd K", label: "Search" },
        { keys: "Ctrl/Cmd \\", label: "Toggle sidebar" },
    ];

    return (
        <AppShell>
            <div className="page-container">
                <PageHeader title="Settings" />

                <div className="space-y-8">
                    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_22rem]">
                        <div className="space-y-5">
                            <ProfileForm userId={userId} />
                        </div>

                        <div className="space-y-5">
                            <SectionCard title="Appearance">
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <p className="text-sm font-semibold text-foreground">Theme</p>
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
                                                            "flex items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors",
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

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-sm font-semibold text-foreground">Accent</p>
                                            <span className="text-xs text-muted-foreground">
                                                {accentDisabled ? "Locked in Noir" : "Saved locally"}
                                            </span>
                                        </div>
                                        {accentDisabled ? (
                                            <p className="text-xs text-muted-foreground">
                                                Preserved for Light, Dark, and Midnight.
                                            </p>
                                        ) : null}
                                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="Accent color">
                                            {ACCENT_OPTIONS.map((option) => {
                                                const active = mounted && accent === option.value;
                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={active}
                                                        aria-disabled={accentDisabled}
                                                        disabled={accentDisabled}
                                                        onClick={() => setAccent(option.value)}
                                                        className={cn(
                                                            "flex items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors",
                                                            accentDisabled && "cursor-not-allowed opacity-45 hover:border-border/60 hover:bg-background/70 hover:text-muted-foreground",
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

                            <SectionCard title="Keyboard">
                                <div className="space-y-2">
                                    {shortcuts.map((shortcut) => (
                                        <div
                                            key={shortcut.label}
                                            className="flex items-center justify-between rounded-xl border border-border/60 bg-background/70 px-3 py-2.5"
                                        >
                                            <span className="text-sm text-foreground">{shortcut.label}</span>
                                            <span className="rounded-md border border-border bg-secondary/70 px-2 py-1 font-mono text-[11px] text-muted-foreground">
                                                {shortcut.keys}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </SectionCard>
                        </div>
                    </div>

                    <footer className="border-t border-border/60 pt-6 text-center text-sm text-muted-foreground">
                        <a
                            href="https://rudhresh.vercel.app/"
                            target="_blank"
                            rel="noreferrer"
                            className="transition-colors hover:text-foreground"
                        >
                            Built by Rudy
                        </a>
                    </footer>
                </div>
            </div>
        </AppShell>
    );
}
