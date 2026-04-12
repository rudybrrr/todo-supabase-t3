export const APP_THEMES = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
] as const;

export type AppTheme = (typeof APP_THEMES)[number]["value"];

export function resolveThemeSelection(theme: string | undefined, _resolvedTheme: string | undefined): AppTheme {
    if (theme === "system") return "system";
    if (theme === "light") return "light";
    if (theme === "paperback") return "light";
    if (theme === "dark") return "dark";
    if (theme === "noir") return "dark";
    return "system";
}
