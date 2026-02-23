"use client";

import { useState, useEffect } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { toast } from "sonner";
import { User, Check, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

import { useData } from "~/components/data-provider";

export function ProfileForm({ userId }: { userId: string }) {
    const { profile, loading, refreshData } = useData();
    const supabase = createSupabaseBrowserClient();
    const [saving, setSaving] = useState(false);
    const [username, setUsername] = useState("");
    const [fullName, setFullName] = useState("");

    useEffect(() => {
        if (profile) {
            setUsername(profile.username || "");
            setFullName(profile.full_name || "");
        }
    }, [profile]);

    async function updateProfile(e: React.FormEvent) {
        e.preventDefault();

        if (username.length < 3) {
            toast.error("Username must be at least 3 characters");
            return;
        }

        try {
            setSaving(true);

            // Defensively update only what we need. 
            // We removed updated_at because it might not exist in your table.
            const profileUpdate: any = {
                id: userId,
                username: username.toLowerCase().replace(/\s+/g, "_"),
                full_name: fullName,
            };

            const { error } = await supabase.from("profiles").upsert(profileUpdate);

            if (error) {
                console.error("Supabase UPSERT Error:", {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint
                });

                if (error.code === "23505") {
                    toast.error("Username is already taken!");
                } else {
                    throw error;
                }
            } else {
                toast.success("Profile updated successfully!");
                void refreshData();
            }
        } catch (error: any) {
            const errMsg = error.message || error.code || "Unknown Error";
            console.error("Profile update logic failed:", {
                message: error.message,
                stack: error.stack,
                userId
            });
            toast.error(`Update Error: ${errMsg}`);
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            <form onSubmit={updateProfile}>
                <Card className="max-w-xl mx-auto border-border/40 shadow-xl bg-card/50 backdrop-blur-sm rounded-2xl overflow-hidden">
                    <CardHeader className="space-y-1 bg-primary/5 border-b border-border/40 p-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-primary/10 text-primary">
                                <User className="w-6 h-6" />
                            </div>
                            <div>
                                <CardTitle className="text-2xl font-black tracking-tight">Public Profile</CardTitle>
                                <CardDescription className="text-muted-foreground font-medium">
                                    This is how other students will see you.
                                </CardDescription>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="username" className="text-sm font-bold uppercase tracking-wider opacity-70">
                                Username
                            </Label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold opacity-50">@</span>
                                <Input
                                    id="username"
                                    placeholder="your_handle"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="pl-8 rounded-xl border-border/40 bg-background/50 focus:ring-primary shadow-sm h-11 font-medium"
                                    required
                                />
                            </div>
                            <p className="text-[10px] text-muted-foreground font-bold uppercase pl-1">
                                Minimum 3 characters. Letters, numbers, and underscores only.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="fullName" className="text-sm font-bold uppercase tracking-wider opacity-70">
                                Full Name
                            </Label>
                            <Input
                                id="fullName"
                                placeholder="Display Name"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                className="rounded-xl border-border/40 bg-background/50 focus:ring-primary shadow-sm h-11 font-medium"
                            />
                        </div>
                    </CardContent>
                    <CardFooter className="p-6 bg-muted/30 border-t border-border/40 flex justify-end">
                        <Button
                            type="submit"
                            disabled={saving}
                            className="rounded-xl px-8 font-bold gap-2 shadow-lg shadow-primary/20 transition-all hover:scale-105 active:scale-95"
                        >
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                            {saving ? "Saving..." : "Save Changes"}
                        </Button>
                    </CardFooter>
                </Card>
            </form>
        </motion.div>
    );
}
