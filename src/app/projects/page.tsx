import ProjectsClient from "./page-client";

import { requireUser } from "~/lib/require-user";

export const metadata = {
    title: "Projects | Stride",
};

export default async function ProjectsPage() {
    await requireUser();
    return <ProjectsClient />;
}
