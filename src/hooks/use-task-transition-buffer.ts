"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { TaskDatasetRecord } from "~/hooks/use-task-dataset";

interface BufferedTaskItem {
    bucket: string;
    index: number;
    task: TaskDatasetRecord;
}

export function mergeBufferedTasks(
    tasks: TaskDatasetRecord[],
    bufferedTasks: BufferedTaskItem[],
) {
    if (bufferedTasks.length === 0) return tasks;

    const visibleIds = new Set(tasks.map((task) => task.id));
    const ghostRows = bufferedTasks
        .filter((item) => !visibleIds.has(item.task.id))
        .sort((a, b) => a.index - b.index);

    if (ghostRows.length === 0) return tasks;

    const merged: TaskDatasetRecord[] = [];
    let ghostIndex = 0;

    for (let index = 0; index <= tasks.length; index += 1) {
        while (ghostIndex < ghostRows.length && ghostRows[ghostIndex]?.index === index) {
            merged.push(ghostRows[ghostIndex]!.task);
            ghostIndex += 1;
        }

        if (index < tasks.length) {
            merged.push(tasks[index]!);
        }
    }

    while (ghostIndex < ghostRows.length) {
        merged.push(ghostRows[ghostIndex]!.task);
        ghostIndex += 1;
    }

    return merged;
}

export function useTaskTransitionBuffer(durationMs = 220) {
    const [bufferedTasks, setBufferedTasks] = useState<Record<string, BufferedTaskItem>>({});
    const timeoutsRef = useRef<Record<string, number>>({});

    const queueBufferedTask = useCallback((task: TaskDatasetRecord, bucket: string, index: number) => {
        window.clearTimeout(timeoutsRef.current[task.id]);

        setBufferedTasks((current) => ({
            ...current,
            [task.id]: { task, bucket, index },
        }));

        timeoutsRef.current[task.id] = window.setTimeout(() => {
            setBufferedTasks((current) => {
                if (!(task.id in current)) return current;

                const next = { ...current };
                delete next[task.id];
                return next;
            });
            delete timeoutsRef.current[task.id];
        }, durationMs);
    }, [durationMs]);

    useEffect(() => {
        return () => {
            Object.values(timeoutsRef.current).forEach((timeout) => window.clearTimeout(timeout));
            timeoutsRef.current = {};
        };
    }, []);

    const items = useMemo(() => Object.values(bufferedTasks), [bufferedTasks]);

    return {
        bufferedTasks: items,
        queueBufferedTask,
    };
}
