"use client";

import Link from "next/link";
import { BarChart3, Check, Moon, MoonStar, Palette, Sun, Users } from "lucide-react";
import { useTheme } from "next-themes";

import { ACCENT_OPTIONS, useAccent } from "~/components/accent-provider";
import { AppShell } from "~/components/app-shell";
import { PageHeader, SectionCard } from "~/components/app-primitives";
import { Button } from "~/components/ui/button";
import { APP_THEMES, resolveThemeSelection } from "~/lib/theme-options";
import { cn } from "~/lib/utils";
import { ProfileForm } from "./profile-form";

export default function SettingsPageClient({ userId }: { userId: string }) {
    const { accent, mounted, setAccent } = useAccent();
    const { resolvedTheme, setTheme, theme } = useTheme();
    const activeTheme = resolveThemeSelection(theme, resolvedTheme);

    const themeIcons = {
        light: Sun,
        dark: Moon,
        midnight: MoonStar,
    } as const;

    return (
        <AppShell>
            <div className="page-container">
                <PageHeader title="Settings" />

                <div className="grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_22rem]">
                    <div className="space-y-6">
                        <ProfileForm userId={userId} />
                    </div>

                    <div className="space-y-6">
                        <SectionCard title="Appearance">
                            <div className="space-y-5">
                                <div className="space-y-2">
                                    <div className="flex items-center gap-3">
                                        <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                                            <Palette className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-foreground">Theme</p>
                                            <p className="text-xs text-muted-foreground">Light, Dark, or Midnight</p>
                                        </div>
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
                                        <span className="text-xs text-muted-foreground">Saved on this browser</span>
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
                                                        "flex items-center justify-between rounded-xl border px-3 py-3 text-left transition-colors",
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

                        <SectionCard title="Shortcuts">
                            <div className="grid gap-3">
                                <Button variant="outline" asChild className="justify-start">
                                    <Link href="/community">
                                        <Users className="h-4 w-4" />
                                        Open community
                                    </Link>
                                </Button>
                                <Button variant="outline" asChild className="justify-start">
                                    <Link href="/progress">
                                        <BarChart3 className="h-4 w-4" />
                                        Open progress
                                    </Link>
                                </Button>
                            </div>
                        </SectionCard>
                    </div>
                </div>
            </div>
        </AppShell>
    );
}
