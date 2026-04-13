"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

const KNOWN_THEMES = new Set(["system", "light", "dark"])

export function ThemeProvider({
    children,
    storageKey = "theme",
    ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
    React.useEffect(() => {
        const storedTheme = window.localStorage.getItem(storageKey)
        if (!storedTheme) return

        let migratedTheme: "light" | "dark" | null = null
        if (storedTheme === "paperback") migratedTheme = "light"
        else if (!KNOWN_THEMES.has(storedTheme)) migratedTheme = "dark"
        if (!migratedTheme) return

        window.localStorage.setItem(storageKey, migratedTheme)

        const root = document.documentElement
        root.classList.remove(storedTheme)
        root.classList.add(migratedTheme)
    }, [storageKey])

    return <NextThemesProvider storageKey={storageKey} {...props}>{children}</NextThemesProvider>
}
