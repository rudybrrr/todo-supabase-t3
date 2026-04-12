"use client";

import { useEffect, useState } from "react";
import { 
    Keyboard, 
    Palette, 
    User, 
    X 
} from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "~/components/ui/dialog";
import { ProfileForm } from "~/components/settings/profile-form";
import { AppearanceSettings } from "./settings/appearance-settings";
import { ShortcutsSettings } from "./settings/shortcuts-settings";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";

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
    initialSection = "account"
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
                showCloseButton={true}
                className="sm:!max-w-none sm:!w-[1100px] w-[95vw] h-[90vh] max-h-[90vh] p-0 overflow-hidden flex flex-col sm:flex-row gap-0 border-border/60 bg-background/95 backdrop-blur-xl shadow-2xl"
            >
                <DialogTitle className="sr-only">Settings</DialogTitle>
                <DialogDescription className="sr-only">
                    Manage your profile, account preferences, data, and app appearance.
                </DialogDescription>

                {/* Sidebar */}
                <aside className="w-full sm:h-full sm:w-56 border-b sm:border-b-0 sm:border-r border-border/50 bg-secondary/5 flex flex-col">
                    <div className="p-6 flex items-center justify-between">
                        <h2 className="text-lg font-bold tracking-tight text-foreground">Settings</h2>
                        <button 
                            onClick={() => onOpenChange(false)}
                            className="sm:hidden p-2 rounded-lg hover:bg-secondary/80 transition-colors"
                        >
                            <X className="h-5 w-5 text-muted-foreground" />
                        </button>
                    </div>

                    <nav className="flex-1 px-3 space-y-1">
                        {sections.map((section) => {
                            const Icon = section.icon;
                            const active = activeSection === section.id;
                            return (
                                <button
                                    key={section.id}
                                    onClick={() => setActiveSection(section.id)}
                                    className={cn(
                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer text-left",
                                        active 
                                            ? "bg-primary/10 text-primary" 
                                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                                    )}
                                >
                                    <Icon className={cn("h-4.5 w-4.5", active ? "text-primary" : "text-muted-foreground")} />
                                    {section.label}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="p-6 mt-auto border-t border-border/40">
                        <a 
                            href="https://www.rudhresh.com/" 
                            target="_blank" 
                            rel="noreferrer"
                            className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                        >
                            Built by Rudy
                        </a>
                    </div>
                </aside>

                {/* Content Area */}
                <main className="relative flex min-h-0 flex-1 flex-col bg-background/50">
                    <ScrollArea className="min-h-0 flex-1">
                        <div className="px-8 py-10 md:px-12 lg:px-16 mx-auto w-full">
                            {activeSection === "account" && <ProfileForm userId={userId} />}
                            {activeSection === "appearance" && <AppearanceSettings />}
                            {activeSection === "shortcuts" && <ShortcutsSettings />}
                        </div>
                    </ScrollArea>
                </main>
            </DialogContent>
        </Dialog>
    );
}
