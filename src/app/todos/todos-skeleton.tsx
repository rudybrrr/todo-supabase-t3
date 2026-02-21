"use client";

import { Skeleton } from "~/components/ui/skeleton";
import { Card, CardContent } from "~/components/ui/card";

export default function TodosSkeleton() {
    return (
        <main className="min-h-screen bg-background p-4 md:p-8">
            <div className="mx-auto max-w-3xl space-y-6">
                {/* Header Skeleton */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-card p-6 rounded-2xl shadow-sm border border-border">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <Skeleton className="h-9 w-9 rounded-xl" />
                            <Skeleton className="h-8 w-48 rounded-lg" />
                        </div>
                        <Skeleton className="h-4 w-64 rounded-md ml-1" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="h-9 w-9 rounded-md" />
                        <Skeleton className="h-9 w-24 rounded-xl" />
                    </div>
                </div>

                {/* Focus Stats Skeleton */}
                <div className="bg-card p-5 rounded-2xl shadow-sm border border-border space-y-3">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-5 w-24 rounded-md" />
                        <Skeleton className="h-5 w-32 rounded-md" />
                    </div>
                    <Skeleton className="h-2 w-full rounded-full" />
                </div>

                {/* Add Todo Skeleton */}
                <Card className="border-none shadow-md bg-card overflow-hidden ring-1 ring-border">
                    <CardContent className="p-4 sm:p-6 flex gap-3">
                        <Skeleton className="h-12 flex-1 rounded-md" />
                        <Skeleton className="h-12 w-32 rounded-xl" />
                    </CardContent>
                </Card>

                {/* Todo List Skeleton */}
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                        <Card key={i} className="border-border/50 shadow-sm bg-card">
                            <CardContent className="p-4 sm:p-5 flex items-start gap-4">
                                <Skeleton className="mt-1 h-6 w-6 rounded-full" />
                                <div className="flex-1 space-y-3">
                                    <Skeleton className="h-6 w-3/4 rounded-md" />
                                    <div className="flex gap-3">
                                        <Skeleton className="h-8 w-24 rounded-lg" />
                                        <Skeleton className="h-8 w-8 rounded-lg ml-auto" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </main>
    );
}
