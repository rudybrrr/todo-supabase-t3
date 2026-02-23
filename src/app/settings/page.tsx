import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "~/lib/supabase/server";
import { ProfileForm } from "./profile-form";
import { ArrowLeft, Settings } from "lucide-react";
import { Button } from "~/components/ui/button";
import Link from "next/link";

export default async function SettingsPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-8">
                {/* Header */}
                <header className="flex items-center justify-between">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-black tracking-tight text-foreground flex items-center gap-3">
                            <Settings className="w-8 h-8 text-primary" />
                            Account Settings
                        </h1>
                        <p className="text-muted-foreground text-sm font-medium">
                            Manage your public profile and account preferences.
                        </p>
                    </div>
                    <Link href="/dashboard">
                        <Button variant="outline" className="rounded-xl gap-2 font-bold shadow-sm">
                            <ArrowLeft className="w-4 h-4" />
                            Back to Dashboard
                        </Button>
                    </Link>
                </header>

                <div className="py-8">
                    <ProfileForm userId={user.id} />
                </div>
            </div>
        </div>
    );
}
