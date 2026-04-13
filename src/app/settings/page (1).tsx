import SettingsPageClient from "./page-client";

import { requireUser } from "~/lib/require-user";

export const metadata = {
    title: "Settings | Stride",
};

export default async function SettingsPage() {
    const user = await requireUser();
    return <SettingsPageClient userId={user.id} />;
}
