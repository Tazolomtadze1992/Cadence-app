"use client"

import { IconTooltipButton } from "@/components/cadence/icon-tooltip-button"
import { SidebarCollapseRegion } from "@/components/cadence/sidebar-collapse-fade"
import type { AppMode } from "@/components/cadence/top-bar"

export function SidebarModeRail({
  collapsed,
  appMode,
  sidebarView,
  onSidebarModeClick,
}: {
  collapsed: boolean
  appMode: AppMode
  sidebarView: "tasks" | "agenda"
  onSidebarModeClick: (view: "tasks" | "agenda" | "canvas") => void
}) {
  return (
    <SidebarCollapseRegion expanded={!collapsed} className="flex shrink-0 justify-start px-3 pb-3 pt-2">
      <div className="relative inline-flex items-center rounded-lg bg-surface-2/80 p-1">
        <IconTooltipButton
          iconUrl="/icons/taskicon.svg"
          label="Tasks"
          shortcut="T"
          isActive={appMode === "schedule" && sidebarView === "tasks"}
          onClick={() => onSidebarModeClick("tasks")}
          tooltipPosition="above"
          sharedLayoutIndicatorId="cadence-mode-tab-indicator"
        />
        <IconTooltipButton
          iconUrl="/icons/calendar.svg"
          label="Agenda"
          shortcut="A"
          isActive={appMode === "schedule" && sidebarView === "agenda"}
          onClick={() => onSidebarModeClick("agenda")}
          tooltipPosition="above"
          sharedLayoutIndicatorId="cadence-mode-tab-indicator"
        />
        <IconTooltipButton
          iconUrl="/icons/canvas.svg"
          label="Canvas"
          shortcut="C"
          isActive={appMode === "canvas"}
          onClick={() => onSidebarModeClick("canvas")}
          tooltipPosition="above"
          sharedLayoutIndicatorId="cadence-mode-tab-indicator"
        />
      </div>
    </SidebarCollapseRegion>
  )
}
