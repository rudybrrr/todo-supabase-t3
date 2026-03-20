import HomeClient from "./page-client";

import { requireUser } from "~/lib/require-user";

export const metadata = {
    title: "Home | Stride",
};

export default async function HomePage() {
    await requireUser();
    return <HomeClient />;
}
