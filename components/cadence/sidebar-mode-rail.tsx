"use client"

import { IconTooltipButton } from "@/components/cadence/icon-tooltip-button"
import type { AppMode } from "@/components/cadence/top-bar"

export function SidebarModeRail({
  appMode,
  sidebarView,
  onSidebarModeClick,
}: {
  appMode: AppMode
  sidebarView: "tasks" | "agenda"
  onSidebarModeClick: (view: "tasks" | "agenda" | "canvas") => void
}) {
  return (
    <div className="flex shrink-0 justify-start px-3 pb-3 pt-2">
      <div className="relative inline-flex items-center rounded-lg bg-surface-2/80 px-2 py-2">
        <IconTooltipButton
          iconUrl="/icons/taskicon.svg"
          label="Tasks"
          shortcut="T"
          isActive={appMode === "schedule" && sidebarView === "tasks"}
          onClick={() => onSidebarModeClick("tasks")}
          tooltipPosition="above"
        />
        <IconTooltipButton
          iconUrl="/icons/calendar.svg"
          label="Agenda"
          shortcut="A"
          isActive={appMode === "schedule" && sidebarView === "agenda"}
          onClick={() => onSidebarModeClick("agenda")}
          tooltipPosition="above"
        />
        <IconTooltipButton
          iconUrl="/icons/canvas.svg"
          label="Canvas"
          shortcut="C"
          isActive={appMode === "canvas"}
          onClick={() => onSidebarModeClick("canvas")}
          tooltipPosition="above"
        />
      </div>
    </div>
  )
}
