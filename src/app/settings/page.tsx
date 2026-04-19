import { requireUser } from "~/lib/require-user";
import SettingsPageClient from "./page-client";

export const metadata = {
    title: "Settings | Stride",
};

export default async function SettingsPage() {
    const user = await requireUser();
    return <SettingsPageClient userId={user.id} />;
}
