"use client"

import * as React from "react"
import { Moon, MoonStar, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "~/components/ui/button"
import { resolveThemeSelection } from "~/lib/theme-options"

export function ModeToggle() {
    const { resolvedTheme, setTheme, theme } = useTheme()
    const activeTheme = resolveThemeSelection(theme, resolvedTheme)

    return (
        <Button
            variant="outline"
            size="icon"
            className="rounded-xl"
            onClick={() => {
                if (activeTheme === "light") {
                    setTheme("dark")
                    return
                }
                if (activeTheme === "dark") {
                    setTheme("midnight")
                    return
                }
                setTheme("light")
            }}
        >
            {activeTheme === "light" ? <Sun className="h-[1.2rem] w-[1.2rem]" /> : null}
            {activeTheme === "dark" ? <Moon className="h-[1.2rem] w-[1.2rem]" /> : null}
            {activeTheme === "midnight" ? <MoonStar className="h-[1.2rem] w-[1.2rem]" /> : null}
            <span className="sr-only">Cycle theme</span>
        </Button>
    )
}
