"use client";

import dynamic from "next/dynamic";
import { BarChart3, Flame, Target, Timer } from "lucide-react";

import { AppShell } from "~/components/app-shell";
import { EmptyState, PageHeader, SectionCard } from "~/components/app-primitives";
import { useData } from "~/components/data-provider";

const ResponsiveContainer = dynamic(() => import("recharts").then((mod) => mod.ResponsiveContainer), { ssr: false });
const AreaChart = dynamic(() => import("recharts").then((mod) => mod.AreaChart), { ssr: false });
const Area = dynamic(() => import("recharts").then((mod) => mod.Area), { ssr: false });
const CartesianGrid = dynamic(() => import("recharts").then((mod) => mod.CartesianGrid), { ssr: false });
const XAxis = dynamic(() => import("recharts").then((mod) => mod.XAxis), { ssr: false });
const YAxis = dynamic(() => import("recharts").then((mod) => mod.YAxis), { ssr: false });
const Tooltip = dynamic(() => import("recharts").then((mod) => mod.Tooltip), { ssr: false });
const PieChart = dynamic(() => import("recharts").then((mod) => mod.PieChart), { ssr: false });
const Pie = dynamic(() => import("recharts").then((mod) => mod.Pie), { ssr: false });
const Cell = dynamic(() => import("recharts").then((mod) => mod.Cell), { ssr: false });

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export default function ProgressClient() {
    const { stats, loading } = useData();

    return (
        <AppShell>
            <div className="page-container">
                <PageHeader
                    title="Progress"
                    description={stats
                        ? `${stats.totalHours}h focus, ${stats.tasksCompleted} tasks, ${stats.streak}-day streak.`
                        : undefined}
                />

                {loading || !stats ? (
                    <EmptyState
                        title="Loading progress"
                        description="Preparing history."
                        icon={<BarChart3 className="h-8 w-8" />}
                    />
                ) : (
                    <>
                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                            <SectionCard title="Weekly focus">
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={stats.weeklyData}>
                                            <CartesianGrid stroke="color-mix(in oklab, var(--border) 75%, transparent)" vertical={false} />
                                            <XAxis dataKey="day" axisLine={false} tickLine={false} />
                                            <YAxis axisLine={false} tickLine={false} />
                                            <Tooltip />
                                            <Area
                                                type="monotone"
                                                dataKey="minutes"
                                                stroke="var(--chart-1)"
                                                fill="color-mix(in oklab, var(--chart-1) 22%, transparent)"
                                                strokeWidth={3}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </SectionCard>

                            <SectionCard title="Subject balance">
                                {stats.subjectData.length > 0 ? (
                                    <div className="space-y-3">
                                        <div className="h-56">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={stats.subjectData} dataKey="value" innerRadius={56} outerRadius={82} paddingAngle={4}>
                                                        {stats.subjectData.map((entry, index) => (
                                                            <Cell key={entry.name} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                        <div className="space-y-2">
                                            {stats.subjectData.map((entry, index) => (
                                                <div key={entry.name} className="flex items-center justify-between rounded-xl bg-background/70 px-3 py-2.5 text-[13px]">
                                                    <div className="flex items-center gap-2">
                                                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: PIE_COLORS[index % PIE_COLORS.length] }} />
                                                        <span>{entry.name}</span>
                                                    </div>
                                                    <span className="font-mono text-muted-foreground">{entry.value}m</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <EmptyState
                                        title="No subject data yet"
                                        description="Finish a focus session tied to a project."
                                        icon={<Target className="h-8 w-8" />}
                                    />
                                )}
                            </SectionCard>
                        </div>

                        <div className="grid gap-5 md:grid-cols-2">
                            <SectionCard title="Consistency">
                                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 p-4">
                                    <div className="rounded-xl bg-primary/10 p-3 text-primary">
                                        <Flame className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-semibold tracking-[-0.04em] text-foreground">{stats.streak} day streak</p>
                                        <p className="text-sm text-muted-foreground">Keep it alive today.</p>
                                    </div>
                                </div>
                            </SectionCard>

                            <SectionCard title="Session length">
                                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/70 p-4">
                                    <div className="rounded-xl bg-primary/10 p-3 text-primary">
                                        <Timer className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-semibold tracking-[-0.04em] text-foreground">{stats.avgSession}</p>
                                        <p className="text-sm text-muted-foreground">Typical block length.</p>
                                    </div>
                                </div>
                            </SectionCard>
                        </div>
                    </>
                )}
            </div>
        </AppShell>
    );
}
