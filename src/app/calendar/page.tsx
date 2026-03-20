import CalendarClient from "./page-client";

import { requireUser } from "~/lib/require-user";

export const metadata = {
    title: "Calendar | Stride",
};

export default async function CalendarPage() {
    await requireUser();
    return <CalendarClient />;
}
