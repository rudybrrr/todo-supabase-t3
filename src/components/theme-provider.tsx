"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

const LEGACY_THEME_MAP: Record<string, "light" | "dark"> = {
    paperback: "light",
    noir: "dark",
}

export function ThemeProvider({
    children,
    storageKey = "theme",
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    React.useEffect(() => {
        const storedTheme = window.localStorage.getItem(storageKey)
        if (!storedTheme) return

        const migratedTheme = LEGACY_THEME_MAP[storedTheme]
        if (!migratedTheme) return

        window.localStorage.setItem(storageKey, migratedTheme)

        const root = document.documentElement
        root.classList.remove(storedTheme)
        root.classList.add(migratedTheme)
    }, [storageKey])

    return <NextThemesProvider storageKey={storageKey} {...props}>{children}</NextThemesProvider>
}
