"use client"

import { useState, useEffect, useMemo } from "react"
import { ChevronDown } from "lucide-react"
import { useTheme } from "next-themes"
import { format, getWeek } from "date-fns"
import { cn } from "@/lib/utils"
import { IconTooltipButton } from "./icon-tooltip-button"

export type AppMode = "schedule" | "canvas"

export function TopBar({
  sidebarCollapsed,
  onToggleSidebar,
  onAvatarClick,
}: {
  sidebarCollapsed: boolean
  onToggleSidebar: () => void
  onAvatarClick?: () => void
}) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const now = useMemo(() => new Date(), [])
  const monthYear = format(now, "MMMM yyyy")
  const weekNumber = getWeek(now)

  return (
    <header className="flex shrink-0 items-center justify-between pl-2 pr-4 py-4">
      <div className="flex items-center gap-3">
        <IconTooltipButton
          iconUrl="/icons/collapse.svg"
          label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
          shortcut={"\u21E7 S"}
          alwaysPrimary
          onClick={onToggleSidebar}
          tooltipPosition="below"
        />

        <div className="flex items-center gap-2">
          <h1 className="text-sm font-medium text-text">{monthYear}</h1>
          <span className="flex h-5 items-center rounded bg-surface-2 px-1.5 text-[10px] font-medium text-text-muted">
            W{weekNumber}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex h-7 items-center gap-1 rounded px-2 text-xs font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
        >
          {mounted ? (theme === "dark" ? "Light" : "Dark") : "Theme"}
        </button>
        <button className="flex h-7 items-center gap-1 rounded px-2.5 text-xs font-medium text-text transition-colors hover:bg-surface-2">
          Week
          <ChevronDown className="h-3 w-3 text-text-muted" />
        </button>
        <button
          type="button"
          onClick={onAvatarClick}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-app-accent text-xs font-semibold text-app-accent-foreground transition-opacity hover:opacity-90"
          aria-label="Open account settings"
        >
          TS
        </button>
      </div>
    </header>
  )
}
