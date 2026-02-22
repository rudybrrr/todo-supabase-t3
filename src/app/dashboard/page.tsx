import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "~/lib/supabase/server";
import DashboardClient from "./dashboard-client";

export default async function DashboardPage() {
    const supabase = await createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    // Fetch lists for the sidebar in the client, but the main dashboard logic is here
    return <DashboardClient userId={user.id} />;
}
