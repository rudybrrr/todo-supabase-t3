"use client";

import { Keyboard, Palette, User, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";
import { AppearanceSettings } from "./settings/appearance-settings";
import { ProfileForm } from "~/components/settings/profile-form";
import { ShortcutsSettings } from "./settings/shortcuts-settings";

type SettingsSection = "account" | "appearance" | "shortcuts";

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userId: string;
    initialSection?: SettingsSection;
}

export function SettingsDialog({
    open,
    onOpenChange,
    userId,
    initialSection = "account",
}: SettingsDialogProps) {
    const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);

    useEffect(() => {
        if (open) {
            setActiveSection(initialSection);
        }
    }, [open, initialSection]);

    const sections = [
        { id: "account", label: "Account", icon: User },
        { id: "appearance", label: "Appearance", icon: Palette },
        { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
    ] as const;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                showCloseButton
                className="flex h-[100dvh] w-[100vw] max-h-[100dvh] flex-col overflow-hidden rounded-none border-border/60 bg-background p-0 shadow-[0_24px_70px_rgba(15,23,42,0.18)] sm:h-[90vh] sm:w-[95vw] sm:max-h-[90vh] sm:max-w-[1100px] sm:rounded-lg lg:flex-row"
            >
                <DialogTitle className="sr-only">Settings</DialogTitle>
                <DialogDescription className="sr-only">
                    Manage your account, appearance, and shortcut preferences.
                </DialogDescription>

                <aside className="flex w-full flex-col border-b border-border/60 bg-muted/20 lg:w-64 lg:border-b-0 lg:border-r">
                    <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-5">
                        <div className="space-y-1">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                                Preferences
                            </p>
                            <h2 className="text-lg font-semibold tracking-[-0.03em] text-foreground">Settings</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() => onOpenChange(false)}
                            className="rounded-lg border border-border bg-background p-2 text-muted-foreground transition-colors hover:text-foreground lg:hidden"
                        >
                            <X className="h-4.5 w-4.5" />
                        </button>
                    </div>

                    <nav className="flex-1 space-y-1 p-3">
                        {sections.map((section) => {
                            const Icon = section.icon;
                            const active = activeSection === section.id;

                            return (
                                <button
                                    key={section.id}
                                    type="button"
                                    onClick={() => setActiveSection(section.id)}
                                    className={cn(
                                        "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                                        active
                                            ? "border-primary bg-primary/10 text-foreground"
                                            : "border-transparent text-muted-foreground hover:border-border hover:bg-background/70 hover:text-foreground",
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
                                            active
                                                ? "border-primary/20 bg-primary/15 text-primary"
                                                : "border-border/60 bg-secondary/60 text-muted-foreground",
                                        )}
                                    >
                                        <Icon className="h-4.5 w-4.5" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium text-foreground">{section.label}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </nav>

                </aside>

                <main className="min-h-0 flex-1 bg-background">
                    <ScrollArea className="h-full">
                        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-5 py-6 sm:px-7 sm:py-8 lg:px-10">
                            {activeSection === "account" ? <ProfileForm userId={userId} /> : null}
                            {activeSection === "appearance" ? <AppearanceSettings /> : null}
                            {activeSection === "shortcuts" ? <ShortcutsSettings /> : null}
                        </div>
                    </ScrollArea>
                </main>
            </DialogContent>
        </Dialog>
    );
}
