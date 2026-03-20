import ProgressClient from "./page-client";

import { requireUser } from "~/lib/require-user";

export const metadata = {
    title: "Progress | Stride",
};

export default async function ProgressPage() {
    await requireUser();
    return <ProgressClient />;
}
