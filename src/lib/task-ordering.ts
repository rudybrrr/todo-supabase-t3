import type { TodoRow } from "~/lib/types";

type WorkspaceOrderedTask = Pick<TodoRow, "id" | "section_id" | "position" | "inserted_at" | "is_done">;

export interface TaskPositionPatch {
    id: string;
    section_id: string | null;
    position: number;
}

function compareTaskOrder(a: WorkspaceOrderedTask, b: WorkspaceOrderedTask) {
    const positionDelta = (a.position ?? 0) - (b.position ?? 0);
    if (positionDelta !== 0) return positionDelta;

    const insertedAtDelta = (a.inserted_at ?? "").localeCompare(b.inserted_at ?? "");
    if (insertedAtDelta !== 0) return insertedAtDelta;

    return a.id.localeCompare(b.id);
}

export function sortTasksByWorkspaceOrder<T extends WorkspaceOrderedTask>(tasks: T[]) {
    return [...tasks].sort(compareTaskOrder);
}

function buildOrderedSectionTasks<T extends WorkspaceOrderedTask>(tasks: T[]) {
    const orderedTasks = sortTasksByWorkspaceOrder(tasks);
    const openTasks = orderedTasks.filter((task) => !task.is_done);
    const doneTasks = orderedTasks.filter((task) => task.is_done);

    return {
        openTasks,
        doneTasks,
    };
}

export function buildTaskPositionPatches<T extends WorkspaceOrderedTask>(tasks: T[], sectionId: string | null): TaskPositionPatch[] {
    return tasks.map((task, index) => ({
        id: task.id,
        section_id: sectionId,
        position: index,
    }));
}

export function buildProjectTaskMovePatches<T extends WorkspaceOrderedTask>(input: {
    movedTaskId: string;
    sourceTasks: T[];
    destinationTasks: T[];
    sourceSectionId: string | null;
    destinationSectionId: string | null;
    destinationIndex: number;
}) {
    const { movedTaskId, sourceTasks, destinationTasks, sourceSectionId, destinationSectionId, destinationIndex } = input;
    const movingWithinSameSection = sourceSectionId === destinationSectionId;

    if (movingWithinSameSection) {
        const { openTasks, doneTasks } = buildOrderedSectionTasks(sourceTasks);
        const movingTask = openTasks.find((task) => task.id === movedTaskId);
        if (!movingTask) return [];

        const remainingOpenTasks = openTasks.filter((task) => task.id !== movedTaskId);
        const boundedIndex = Math.max(0, Math.min(destinationIndex, remainingOpenTasks.length));
        remainingOpenTasks.splice(boundedIndex, 0, movingTask);

        return buildTaskPositionPatches([...remainingOpenTasks, ...doneTasks], sourceSectionId);
    }

    const { openTasks: sourceOpenTasks, doneTasks: sourceDoneTasks } = buildOrderedSectionTasks(sourceTasks);
    const { openTasks: destinationOpenTasks, doneTasks: destinationDoneTasks } = buildOrderedSectionTasks(destinationTasks);
    const movingTask = sourceOpenTasks.find((task) => task.id === movedTaskId);
    if (!movingTask) return [];

    const nextSourceOpenTasks = sourceOpenTasks.filter((task) => task.id !== movedTaskId);
    const nextDestinationOpenTasks = destinationOpenTasks.filter((task) => task.id !== movedTaskId);
    const boundedIndex = Math.max(0, Math.min(destinationIndex, nextDestinationOpenTasks.length));
    nextDestinationOpenTasks.splice(boundedIndex, 0, {
        ...movingTask,
        section_id: destinationSectionId,
    });

    return [
        ...buildTaskPositionPatches([...nextSourceOpenTasks, ...sourceDoneTasks], sourceSectionId),
        ...buildTaskPositionPatches([...nextDestinationOpenTasks, ...destinationDoneTasks], destinationSectionId),
    ];
}

export function getNextTaskPosition<T extends WorkspaceOrderedTask>(tasks: T[]) {
    if (tasks.length === 0) return 0;
    return Math.max(...tasks.map((task) => task.position ?? 0)) + 1;
}
