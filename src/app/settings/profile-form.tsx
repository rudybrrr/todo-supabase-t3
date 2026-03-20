"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "~/lib/supabase/browser";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "~/components/ui/card";
import { toast } from "sonner";
import { Check, Image as ImageIcon, KeyRound, Loader2, Shield, Target, Upload, User } from "lucide-react";
import { motion } from "framer-motion";

import { useData } from "~/components/data-provider";
import { getPublicAvatarUrl, isAvatarPathOwnedByUser, PROFILE_AVATAR_BUCKET } from "~/lib/avatar";

interface ProfileUpdatePayload {
    id: string;
    username: string;
    full_name: string | null;
}

interface AvatarUpdatePayload {
    id: string;
    avatar_url: string;
}

interface StudyGoalUpdatePayload {
    id: string;
    daily_focus_goal_minutes: number;
}

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const USERNAME_PATTERN = /^[a-z0-9_]+$/;

function normalizeUsername(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function inferAvatarExtension(file: File) {
    if (file.type === "image/png") return "png";
    if (file.type === "image/webp") return "webp";
    if (file.type === "image/jpeg") return "jpg";

    const extension = file.name.split(".").pop()?.toLowerCase();
    if (extension === "jpeg") return "jpg";
    if (extension === "png" || extension === "webp" || extension === "jpg") return extension;
    return "jpg";
}

function getPasswordValidationError(currentPassword: string, newPassword: string, confirmPassword: string) {
    if (!currentPassword || !newPassword || !confirmPassword) {
        return "All password fields are required.";
    }
    if (newPassword !== confirmPassword) {
        return "New password and confirmation do not match.";
    }
    if (newPassword === currentPassword) {
        return "New password must be different from your current password.";
    }
    if (newPassword.length < 8) {
        return "New password must be at least 8 characters.";
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
        return "New password must include uppercase, lowercase, and a number.";
    }
    return null;
}

export function ProfileForm({ userId }: { userId: string }) {
    const { profile, loading, refreshData } = useData();
    const supabase = useMemo(() => createSupabaseBrowserClient(), []);

    const [profileSaving, setProfileSaving] = useState(false);
    const [studyGoalSaving, setStudyGoalSaving] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [passwordSaving, setPasswordSaving] = useState(false);

    const [username, setUsername] = useState("");
    const [fullName, setFullName] = useState("");
    const [avatarPath, setAvatarPath] = useState<string | null>(null);
    const [dailyGoal, setDailyGoal] = useState("120");

    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    useEffect(() => {
        setUsername(profile?.username ?? "");
        setFullName(profile?.full_name ?? "");
        setAvatarPath(profile?.avatar_url ?? null);
        setDailyGoal(String(profile?.daily_focus_goal_minutes ?? 120));
    }, [profile]);

    const avatarPreviewUrl = useMemo(
        () => getPublicAvatarUrl(supabase, avatarPath),
        [supabase, avatarPath],
    );

    const avatarFallbackText = useMemo(() => {
        const source = fullName.trim() || username.trim();
        if (!source) return "U";

        const initials = source
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0] ?? "")
            .join("")
            .slice(0, 2)
            .toUpperCase();

        return initials || "U";
    }, [fullName, username]);

    async function updateProfile(e: React.FormEvent) {
        e.preventDefault();

        const normalizedUsername = normalizeUsername(username);

        if (normalizedUsername.length < 3) {
            toast.error("Username must be at least 3 characters");
            return;
        }
        if (!USERNAME_PATTERN.test(normalizedUsername)) {
            toast.error("Username can only contain letters, numbers, and underscores.");
            return;
        }

        try {
            setProfileSaving(true);

            const profileUpdate: ProfileUpdatePayload = {
                id: userId,
                username: normalizedUsername,
                full_name: fullName.trim() ? fullName.trim() : null,
            };

            const { error } = await supabase.from("profiles").upsert(profileUpdate, { onConflict: "id" });

            if (error) {
                console.error("Supabase UPSERT Error:", {
                    code: error.code,
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
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
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown Error";
            console.error("Profile update logic failed:", {
                message,
                userId,
            });
            toast.error(`Update Error: ${message}`);
        } finally {
            setProfileSaving(false);
        }
    }

    async function uploadAvatar(file: File) {
        try {
            setAvatarUploading(true);

            const previousAvatarPath = avatarPath;
            const extension = inferAvatarExtension(file);
            const objectPath = `${userId}/${crypto.randomUUID()}.${extension}`;

            const { error: uploadError } = await supabase.storage
                .from(PROFILE_AVATAR_BUCKET)
                .upload(objectPath, file, {
                    upsert: false,
                    contentType: file.type,
                    cacheControl: "3600",
                });

            if (uploadError) {
                throw uploadError;
            }

            const avatarUpdatePayload: AvatarUpdatePayload = {
                id: userId,
                avatar_url: objectPath,
            };

            const { error: profileUpdateError } = await supabase
                .from("profiles")
                .upsert(avatarUpdatePayload, { onConflict: "id" });

            if (profileUpdateError) {
                await supabase.storage.from(PROFILE_AVATAR_BUCKET).remove([objectPath]);
                throw profileUpdateError;
            }

            setAvatarPath(objectPath);
            toast.success("Profile picture updated!");
            void refreshData();

            if (
                previousAvatarPath
                && previousAvatarPath !== objectPath
                && isAvatarPathOwnedByUser(previousAvatarPath, userId)
            ) {
                const { error: cleanupError } = await supabase.storage
                    .from(PROFILE_AVATAR_BUCKET)
                    .remove([previousAvatarPath]);

                if (cleanupError) {
                    console.warn("Could not clean up previous avatar object:", cleanupError.message);
                }
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown avatar upload error";
            console.error("Avatar upload failed:", { message, userId });
            toast.error(`Avatar upload failed: ${message}`);
        } finally {
            setAvatarUploading(false);
        }
    }

    async function updateStudyGoal(e: React.FormEvent) {
        e.preventDefault();

        const nextGoal = Number.parseInt(dailyGoal, 10);
        if (!Number.isFinite(nextGoal) || nextGoal <= 0) {
            toast.error("Daily study goal must be a positive number of minutes.");
            return;
        }

        try {
            setStudyGoalSaving(true);

            const studyGoalPayload: StudyGoalUpdatePayload = {
                id: userId,
                daily_focus_goal_minutes: nextGoal,
            };

            const { error } = await supabase.from("profiles").upsert(studyGoalPayload, { onConflict: "id" });
            if (error) {
                throw error;
            }

            toast.success("Daily study goal updated.");
            void refreshData();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown study goal update error";
            console.error("Study goal update failed:", { message, userId });
            toast.error(`Study goal update failed: ${message}`);
        } finally {
            setStudyGoalSaving(false);
        }
    }

    async function handleAvatarFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";

        if (!file) return;

        if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
            toast.error("Only JPG, PNG, and WEBP images are allowed.");
            return;
        }

        if (file.size > MAX_AVATAR_BYTES) {
            toast.error("Image must be 3MB or smaller.");
            return;
        }

        await uploadAvatar(file);
    }

    async function updatePassword(e: React.FormEvent) {
        e.preventDefault();

        const passwordValidationError = getPasswordValidationError(currentPassword, newPassword, confirmPassword);
        if (passwordValidationError) {
            toast.error(passwordValidationError);
            return;
        }

        try {
            setPasswordSaving(true);

            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError || !userData.user?.email) {
                throw new Error("Unable to verify account email for re-authentication.");
            }

            const { data: reauthData, error: reauthError } = await supabase.auth.signInWithPassword({
                email: userData.user.email,
                password: currentPassword,
            });

            if (reauthError) {
                toast.error("Current password is incorrect.");
                return;
            }

            if (reauthData.user?.id !== userId) {
                throw new Error("Re-authentication returned an unexpected account.");
            }

            const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
            if (updateError) {
                throw updateError;
            }

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            toast.success("Password changed successfully.");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unknown password update error";
            console.error("Password update failed:", { message, userId });
            toast.error(`Password update failed: ${message}`);
        } finally {
            setPasswordSaving(false);
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
            <div className="space-y-6">
                <form onSubmit={updateProfile}>
                    <Card className="border-border/40 shadow-sm bg-card/50 rounded-2xl overflow-hidden transition-shadow hover:shadow-md">
                        <div className="flex flex-col md:flex-row">
                            <CardHeader className="space-y-1 bg-primary/5 md:bg-transparent md:border-r border-b md:border-b-0 border-border/40 p-6 md:w-1/3 shrink-0">
                                <div className="flex flex-col gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary w-fit">
                                        <User className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-black tracking-tight">Public Profile</CardTitle>
                                        <CardDescription className="text-muted-foreground font-medium mt-1">
                                            This is how other students will see you.
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <div className="flex flex-col flex-1">
                                <CardContent className="p-6 space-y-6 flex-1">
                                    <div className="space-y-2 max-w-md">
                                        <Label htmlFor="username" className="text-xs font-bold uppercase tracking-wider opacity-70">
                                            Username
                                        </Label>
                                        <div className="relative">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold opacity-50">@</span>
                                            <Input
                                                id="username"
                                                placeholder="your_handle"
                                                value={username}
                                                onChange={(event) => setUsername(event.target.value)}
                                                className="pl-8 rounded-xl border-border/40 bg-background/50 focus:ring-primary shadow-sm h-11 font-medium transition-all"
                                                required
                                            />
                                        </div>
                                        <p className="text-[10px] text-muted-foreground font-bold uppercase pl-1">
                                            Minimum 3 characters. Letters, numbers, and underscores only.
                                        </p>
                                    </div>

                                    <div className="space-y-2 max-w-md">
                                        <Label htmlFor="fullName" className="text-xs font-bold uppercase tracking-wider opacity-70">
                                            Full Name
                                        </Label>
                                        <Input
                                            id="fullName"
                                            placeholder="Display Name"
                                            value={fullName}
                                            onChange={(event) => setFullName(event.target.value)}
                                            className="rounded-xl border-border/40 bg-background/50 focus:ring-primary shadow-sm h-11 font-medium transition-all"
                                        />
                                    </div>
                                </CardContent>
                                <CardFooter className="p-4 bg-muted/30 border-t border-border/40 flex justify-end">
                                    <Button
                                        type="submit"
                                        disabled={profileSaving}
                                        className="rounded-xl px-6 font-bold gap-2 shadow-sm transition-all text-sm h-9 hover:translate-y-[-1px]"
                                    >
                                        {profileSaving ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Check className="w-4 h-4" />
                                        )}
                                        {profileSaving ? "Saving..." : "Save Changes"}
                                    </Button>
                                </CardFooter>
                            </div>
                        </div>
                    </Card>
                </form>

                <form onSubmit={updateStudyGoal}>
                    <Card className="border-border/40 shadow-sm bg-card/50 rounded-2xl overflow-hidden transition-shadow hover:shadow-md">
                        <div className="flex flex-col md:flex-row">
                            <CardHeader className="space-y-1 bg-primary/5 md:bg-transparent md:border-r border-b md:border-b-0 border-border/40 p-6 md:w-1/3 shrink-0">
                                <div className="flex flex-col gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary w-fit">
                                        <Target className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-black tracking-tight">Study Goal</CardTitle>
                                        <CardDescription className="text-muted-foreground font-medium mt-1">
                                            Set your daily focus target in minutes.
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <div className="flex flex-col flex-1">
                                <CardContent className="p-6 space-y-6 flex-1">
                                    <div className="space-y-2 max-w-md">
                                        <Label htmlFor="dailyGoal" className="text-xs font-bold uppercase tracking-wider opacity-70">
                                            Daily Focus Goal
                                        </Label>
                                        <div className="relative">
                                            <Input
                                                id="dailyGoal"
                                                type="number"
                                                min="1"
                                                step="1"
                                                inputMode="numeric"
                                                value={dailyGoal}
                                                onChange={(event) => setDailyGoal(event.target.value)}
                                                className="rounded-xl border-border/40 bg-background/50 focus:ring-primary shadow-sm h-11 font-medium transition-all pr-20"
                                                required
                                            />
                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                minutes
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground font-bold uppercase pl-1">
                                            Used for your daily focus goal across the planner.
                                        </p>
                                    </div>
                                </CardContent>
                                <CardFooter className="p-4 bg-muted/30 border-t border-border/40 flex justify-end">
                                    <Button
                                        type="submit"
                                        disabled={studyGoalSaving}
                                        className="rounded-xl px-6 font-bold gap-2 shadow-sm transition-all text-sm h-9 hover:translate-y-[-1px]"
                                    >
                                        {studyGoalSaving ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Check className="w-4 h-4" />
                                        )}
                                        {studyGoalSaving ? "Saving..." : "Save Goal"}
                                    </Button>
                                </CardFooter>
                            </div>
                        </div>
                    </Card>
                </form>

                <Card className="border-border/40 shadow-sm bg-card/50 rounded-2xl overflow-hidden transition-shadow hover:shadow-md">
                    <div className="flex flex-col md:flex-row">
                        <CardHeader className="space-y-1 bg-primary/5 md:bg-transparent md:border-r border-b md:border-b-0 border-border/40 p-6 md:w-1/3 shrink-0">
                            <div className="flex flex-col gap-3">
                                <div className="p-2 rounded-xl bg-primary/10 text-primary w-fit">
                                    <ImageIcon className="w-6 h-6" />
                                </div>
                                <div>
                                    <CardTitle className="text-xl font-black tracking-tight">Profile Picture</CardTitle>
                                    <CardDescription className="text-muted-foreground font-medium mt-1">
                                        Upload a JPG, PNG, or WEBP image up to 3MB.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <div className="flex flex-col flex-1 justify-center">
                            <CardContent className="p-6">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                                    <Avatar className="w-20 h-20 border-2 border-border shadow-sm">
                                        <AvatarImage src={avatarPreviewUrl ?? ""} alt="Profile picture preview" />
                                        <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
                                            {avatarFallbackText}
                                        </AvatarFallback>
                                    </Avatar>

                                    <div className="space-y-3">
                                        <p className="text-sm text-muted-foreground">
                                            Your avatar appears in progress and community surfaces.
                                        </p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="rounded-xl gap-2 font-bold shadow-sm transition-all text-sm h-9 hover:translate-y-[-1px]"
                                            disabled={avatarUploading}
                                            asChild
                                        >
                                            <label className={avatarUploading ? "cursor-not-allowed" : "cursor-pointer"}>
                                                {avatarUploading ? (
                                                    <Loader2 className="w-4 h-4 animate-spin" />
                                                ) : (
                                                    <Upload className="w-4 h-4" />
                                                )}
                                                {avatarUploading ? "Uploading..." : "Upload New Picture"}
                                                <input
                                                    type="file"
                                                    accept="image/jpeg,image/png,image/webp"
                                                    className="hidden"
                                                    disabled={avatarUploading}
                                                    onChange={(event) => {
                                                        void handleAvatarFileChange(event);
                                                    }}
                                                />
                                            </label>
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </div>
                    </div>
                </Card>

                <form onSubmit={updatePassword}>
                    <Card className="border-border/40 shadow-sm bg-card/50 rounded-2xl overflow-hidden transition-shadow hover:shadow-md">
                        <div className="flex flex-col md:flex-row">
                            <CardHeader className="space-y-1 bg-primary/5 md:bg-transparent md:border-r border-b md:border-b-0 border-border/40 p-6 md:w-1/3 shrink-0">
                                <div className="flex flex-col gap-3">
                                    <div className="p-2 rounded-xl bg-primary/10 text-primary w-fit">
                                        <Shield className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl font-black tracking-tight">Security</CardTitle>
                                        <CardDescription className="text-muted-foreground font-medium mt-1">
                                            Re-enter your current password before setting a new one.
                                        </CardDescription>
                                    </div>
                                </div>
                            </CardHeader>
                            <div className="flex flex-col flex-1">
                                <CardContent className="p-6 space-y-4 flex-1">
                                    <div className="space-y-4 max-w-md">
                                        <div className="space-y-2">
                                            <Label htmlFor="currentPassword" className="text-xs font-bold uppercase tracking-wider opacity-70">
                                                Current Password
                                            </Label>
                                            <Input
                                                id="currentPassword"
                                                type="password"
                                                value={currentPassword}
                                                onChange={(event) => setCurrentPassword(event.target.value)}
                                                className="rounded-xl border-border/40 bg-background/50 focus:ring-primary shadow-sm h-11 font-medium transition-all"
                                                autoComplete="current-password"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="newPassword" className="text-xs font-bold uppercase tracking-wider opacity-70">
                                                New Password
                                            </Label>
                                            <Input
                                                id="newPassword"
                                                type="password"
                                                value={newPassword}
                                                onChange={(event) => setNewPassword(event.target.value)}
                                                className="rounded-xl border-border/40 bg-background/50 focus:ring-primary shadow-sm h-11 font-medium transition-all"
                                                autoComplete="new-password"
                                                required
                                            />
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="confirmPassword" className="text-xs font-bold uppercase tracking-wider opacity-70">
                                                Confirm New Password
                                            </Label>
                                            <Input
                                                id="confirmPassword"
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(event) => setConfirmPassword(event.target.value)}
                                                className="rounded-xl border-border/40 bg-background/50 focus:ring-primary shadow-sm h-11 font-medium transition-all"
                                                autoComplete="new-password"
                                                required
                                            />
                                        </div>

                                        <p className="text-[10px] text-muted-foreground font-bold uppercase">
                                            Password must be at least 8 characters and include uppercase, lowercase, and a number.
                                        </p>
                                    </div>
                                </CardContent>
                                <CardFooter className="p-4 bg-muted/30 border-t border-border/40 flex justify-end">
                                    <Button
                                        type="submit"
                                        disabled={passwordSaving}
                                        className="rounded-xl px-6 font-bold gap-2 shadow-sm transition-all text-sm h-9 hover:translate-y-[-1px]"
                                    >
                                        {passwordSaving ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <KeyRound className="w-4 h-4" />
                                        )}
                                        {passwordSaving ? "Updating..." : "Change Password"}
                                    </Button>
                                </CardFooter>
                            </div>
                        </div>
                    </Card>
                </form>
            </div>
        </motion.div>
    );
}
