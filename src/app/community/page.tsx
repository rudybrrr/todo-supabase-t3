import CommunityClient from "./page-client";

import { requireUser } from "~/lib/require-user";

export const metadata = {
    title: "Community | Stride",
};

export default async function CommunityPage() {
    await requireUser();
    return <CommunityClient />;
}
