"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { FolderPlus, MoreHorizontal, Search, Pencil, Trash2, Check } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CanvasProject } from "./canvas-board"
import { IconTooltipButton } from "./icon-tooltip-button"

export const PROJECT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#6b7280",
] as const

export function ProjectColorSwatchGrid({
  value,
  onChange,
}: {
  value?: string
  onChange: (color: string) => void
}) {
  return (
    <div className="grid w-fit grid-cols-5 gap-2">
      {PROJECT_COLORS.map((color) => {
        const isActive = color === value
        return (
          <button
            key={color}
            type="button"
            onClick={() => onChange(color)}
            className={cn(
              "relative flex h-4 w-4 items-center justify-center rounded-[4px] transition-transform",
              "focus-visible:outline-none",
              !isActive && "hover:scale-[1.08]"
            )}
            style={{ backgroundColor: color }}
          >
            {isActive && <Check className="h-2.5 w-2.5 text-white" />}
          </button>
        )
      })}
    </div>
  )
}

interface CanvasSidebarProps {
  collapsed: boolean
  onToggleSidebar: () => void
  projects: CanvasProject[]
  projectTaskCounts: Record<string, number>
  activeProjectId: string | null
  onSelectProject: (projectId: string) => void
  onAddProject: (name?: string, icon?: string) => void
  onUpdateProject: (projectId: string, updates: Partial<CanvasProject>) => void
  onDeleteProject: (projectId: string) => void
  appMode: import("./top-bar").AppMode
  sidebarView: "tasks" | "agenda"
  onSidebarModeClick: (view: "tasks" | "agenda" | "canvas") => void
}

export function CanvasSidebar({
  collapsed,
  projects,
  projectTaskCounts,
  activeProjectId,
  onSelectProject,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  appMode,
  sidebarView,
  onSidebarModeClick,
}: CanvasSidebarProps) {
  const [contentVisible, setContentVisible] = useState(!collapsed)
  const [actionsDropdown, setActionsDropdown] = useState<{
    projectId: string
    anchor: { top: number; left: number; right: number; bottom: number }
  } | null>(null)
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    if (!collapsed) {
      const id = window.setTimeout(() => setContentVisible(true), 80)
      return () => window.clearTimeout(id)
    }
    setContentVisible(false)
  }, [collapsed])

  useEffect(() => {
    if (!renamingProjectId) return
    const proj = projects.find((p) => p.id === renamingProjectId)
    setRenameValue(proj?.name ?? "")
    requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
  }, [renamingProjectId, projects])

  const handleRenameCommit = (projectId: string, value: string) => {
    const trimmed = value.trim()
    if (trimmed) {
      onUpdateProject(projectId, { name: trimmed })
    }
    setRenamingProjectId(null)
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-background overflow-hidden transition-all duration-200 ease-out",
        collapsed ? "w-0 opacity-0" : "w-[260px] opacity-100"
      )}
    >
      <div className="relative flex-1 overflow-hidden">
        {contentVisible && (
          <div className="flex h-full flex-col">
            <div className="flex items-center gap-2 px-3 pt-0 pb-3">
              <div className="flex h-8 flex-1 items-center gap-2 rounded-md bg-surface-2/60 px-2.5 text-sm text-text transition-colors hover:bg-surface">
                <Search className="h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="w-full bg-transparent text-sm text-text outline-none placeholder:text-text-muted"
                />
              </div>
              <button
                type="button"
                onClick={() => onAddProject()}
                className="flex h-8 w-8 items-center justify-center rounded-md bg-surface-2/60 text-text-muted transition-colors hover:bg-surface hover:text-text"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-1.5 pb-3">
              {projects.length === 0 ? (
                <div className="mt-6 px-3 text-xs text-text-muted">
                  No projects yet. Create one to start a canvas.
                </div>
              ) : (
                <div className="space-y-0.5">
                  {projects.map((project) => {
                    const isActive = project.id === activeProjectId
                    const isRenaming = renamingProjectId === project.id
                    return (
                      <div
                        key={project.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelectProject(project.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault()
                            onSelectProject(project.id)
                          }
                        }}
                        className={cn(
                          "group flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          isActive
                            ? "bg-faint text-text"
                            : "text-text-muted hover:text-text"
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: project.color ?? "#94a3b8" }}
                          />
                          {isRenaming ? (
                            <input
                              ref={renameInputRef}
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleRenameCommit(project.id, renameValue)
                                else if (e.key === "Escape") setRenamingProjectId(null)
                              }}
                              onBlur={() => handleRenameCommit(project.id, renameValue)}
                              className="min-w-0 flex-1 truncate rounded border border-app-faint/50 bg-surface-2 px-1.5 py-0.5 text-sm text-text outline-none"
                            />
                          ) : (
                            <span className="min-w-0 flex-1 truncate">{project.name}</span>
                          )}
                        </div>
                        {!isRenaming && (
                          <div className="ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-surface-2 hover:text-text">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                setActionsDropdown({
                                  projectId: project.id,
                                  anchor: {
                                    top: rect.top,
                                    left: rect.left,
                                    right: rect.right,
                                    bottom: rect.bottom,
                                  },
                                })
                              }}
                              className="flex h-6 w-6 items-center justify-center rounded text-inherit"
                            >
                  <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {actionsDropdown && (() => {
              const project = projects.find((p) => p.id === actionsDropdown.projectId)
              if (!project) return null
              return (
                <ProjectActionsDropdown
                  anchor={actionsDropdown.anchor}
                  currentColor={project.color}
                  deleteDisabled={(projectTaskCounts[project.id] ?? 0) > 0}
                  onClose={() => setActionsDropdown(null)}
                  onColorChange={(color) => {
                    onUpdateProject(project.id, { color })
                  }}
                  onRename={() => {
                    setActionsDropdown(null)
                    requestAnimationFrame(() => setRenamingProjectId(project.id))
                  }}
                  onDelete={() => {
                    setActionsDropdown(null)
                    onDeleteProject(project.id)
                  }}
                />
              )
            })()}

            {/* Bottom toggle icons – mirror main sidebar */}
            <div className="flex justify-start px-3 pb-3 pt-2">
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
          </div>
        )}
      </div>
    </aside>
  )
}

export function ProjectActionsDropdown({
  anchor,
  currentColor,
  deleteDisabled = false,
  onClose,
  onColorChange,
  onRename,
  onDelete,
}: {
  anchor: { top: number; left: number; right: number; bottom: number }
  currentColor?: string
  deleteDisabled?: boolean
  onClose: () => void
  onColorChange?: (color: string) => void
  onRename: () => void
  onDelete: () => void
}) {
  const DROPDOWN_WIDTH = 200
  const GAP = 8
  const [visible, setVisible] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  const fitsRight = anchor.right + GAP + DROPDOWN_WIDTH <= window.innerWidth - GAP
  const computedLeft = fitsRight ? anchor.right + GAP : anchor.left - DROPDOWN_WIDTH - GAP
  const computedTop = anchor.top
  const origin = fitsRight ? "top left" : "top right"

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose()
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClick)
    }
  }, [onClose])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  // uses PROJECT_COLORS + ProjectColorSwatchGrid (shared)

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[100] w-fit rounded-xl border border-border/50 bg-background p-3 shadow-lg motion-reduce:transition-none will-change-transform will-change-opacity"
      style={{
        top: computedTop,
        left: computedLeft,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.98)",
        transition: "opacity 160ms cubic-bezier(0.2,0.8,0.2,1), transform 160ms cubic-bezier(0.2,0.8,0.2,1)",
        transformOrigin: origin,
      }}
    >
      <div className="flex flex-col items-start">
      {onColorChange && (
        <div className="mb-2">
          <ProjectColorSwatchGrid
            value={currentColor}
            onChange={(c) => onColorChange(c)}
          />
          <div className="mt-2 h-px bg-border/20" />
        </div>
      )}

      <button
        type="button"
        onClick={() => onRename()}
        className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1 text-xs text-text transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-surface-2"
      >
        <Pencil className="h-3 w-3 text-text-muted" />
        Rename
      </button>

      <button
        type="button"
        disabled={deleteDisabled}
        onClick={() => {
          if (deleteDisabled) return
          onDelete()
        }}
        className={cn(
          "mt-0.5 flex w-full items-center gap-2.5 rounded-sm px-2 py-1 text-xs transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]",
          deleteDisabled
            ? "cursor-not-allowed text-text-faint opacity-60"
            : "text-red-400 hover:bg-red-500/10"
        )}
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </button>
      </div>
    </div>,
    document.body
  )
}
