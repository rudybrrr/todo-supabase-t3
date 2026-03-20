export const APP_THEMES = [
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
    { value: "midnight", label: "Midnight" },
] as const;

export type AppTheme = (typeof APP_THEMES)[number]["value"];

export function resolveThemeSelection(theme: string | undefined, resolvedTheme: string | undefined): AppTheme {
    if (theme === "midnight") return "midnight";
    if (theme === "dark") return "dark";
    if (theme === "light") return "light";
    return resolvedTheme === "dark" ? "dark" : "light";
}
