import type { LucideIcon } from "lucide-react";
import {
    Atom,
    BookOpen,
    BriefcaseBusiness,
    Code2,
    FlaskConical,
    FolderKanban,
    GraduationCap,
    PencilRuler,
    ScrollText,
} from "lucide-react";

export const PROJECT_COLOR_TOKENS = [
    "cobalt",
    "emerald",
    "amber",
    "rose",
    "violet",
    "slate",
] as const;

export const PROJECT_ICON_TOKENS = [
    "book-open",
    "graduation-cap",
    "folder-kanban",
    "atom",
    "code-2",
    "flask-conical",
    "briefcase-business",
    "pencil-ruler",
    "scroll-text",
] as const;

export type ProjectColorToken = (typeof PROJECT_COLOR_TOKENS)[number];
export type ProjectIconToken = (typeof PROJECT_ICON_TOKENS)[number];

const COLOR_MAP: Record<ProjectColorToken, { accent: string; soft: string; border: string; text: string }> = {
    cobalt: {
        accent: "bg-[color:var(--project-cobalt)]",
        soft: "bg-[color:color-mix(in_oklab,var(--project-cobalt)_16%,transparent)]",
        border: "border-[color:color-mix(in_oklab,var(--project-cobalt)_28%,transparent)]",
        text: "text-[color:var(--project-cobalt)]",
    },
    emerald: {
        accent: "bg-[color:var(--project-emerald)]",
        soft: "bg-[color:color-mix(in_oklab,var(--project-emerald)_16%,transparent)]",
        border: "border-[color:color-mix(in_oklab,var(--project-emerald)_28%,transparent)]",
        text: "text-[color:var(--project-emerald)]",
    },
    amber: {
        accent: "bg-[color:var(--project-amber)]",
        soft: "bg-[color:color-mix(in_oklab,var(--project-amber)_18%,transparent)]",
        border: "border-[color:color-mix(in_oklab,var(--project-amber)_28%,transparent)]",
        text: "text-[color:var(--project-amber)]",
    },
    rose: {
        accent: "bg-[color:var(--project-rose)]",
        soft: "bg-[color:color-mix(in_oklab,var(--project-rose)_16%,transparent)]",
        border: "border-[color:color-mix(in_oklab,var(--project-rose)_28%,transparent)]",
        text: "text-[color:var(--project-rose)]",
    },
    violet: {
        accent: "bg-[color:var(--project-violet)]",
        soft: "bg-[color:color-mix(in_oklab,var(--project-violet)_16%,transparent)]",
        border: "border-[color:color-mix(in_oklab,var(--project-violet)_28%,transparent)]",
        text: "text-[color:var(--project-violet)]",
    },
    slate: {
        accent: "bg-[color:var(--project-slate)]",
        soft: "bg-[color:color-mix(in_oklab,var(--project-slate)_16%,transparent)]",
        border: "border-[color:color-mix(in_oklab,var(--project-slate)_28%,transparent)]",
        text: "text-[color:var(--project-slate)]",
    },
};

const ICON_MAP: Record<ProjectIconToken, LucideIcon> = {
    "atom": Atom,
    "book-open": BookOpen,
    "briefcase-business": BriefcaseBusiness,
    "code-2": Code2,
    "flask-conical": FlaskConical,
    "folder-kanban": FolderKanban,
    "graduation-cap": GraduationCap,
    "pencil-ruler": PencilRuler,
    "scroll-text": ScrollText,
};

export function getProjectColorToken(token?: string | null): ProjectColorToken {
    return PROJECT_COLOR_TOKENS.includes(token as ProjectColorToken)
        ? (token as ProjectColorToken)
        : "cobalt";
}

export function getProjectIconToken(token?: string | null): ProjectIconToken {
    return PROJECT_ICON_TOKENS.includes(token as ProjectIconToken)
        ? (token as ProjectIconToken)
        : "book-open";
}

export function getProjectColorClasses(token?: string | null) {
    return COLOR_MAP[getProjectColorToken(token)];
}

export function getProjectIcon(token?: string | null) {
    return ICON_MAP[getProjectIconToken(token)];
}

