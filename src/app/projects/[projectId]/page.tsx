import ProjectWorkspaceClient from "./page-client";

import { requireUser } from "~/lib/require-user";

export default async function ProjectWorkspacePage({
    params,
}: {
    params: Promise<{ projectId: string }>;
}) {
    await requireUser();
    const { projectId } = await params;
    return <ProjectWorkspaceClient projectId={projectId} />;
}

