"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useReducedMotion } from "framer-motion"
import { createPortal } from "react-dom"
import { MoreHorizontal, Search, Pencil, Trash2, Plus, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CanvasProject } from "./canvas-board"
import { IconTooltipButton } from "./icon-tooltip-button"
import { ProjectItem } from "./project-item"
import { AddProjectPopover } from "./add-project-popover"
import { ProjectColorSwatchGrid, PROJECT_COLORS } from "./project-palette"

export { PROJECT_COLORS, ProjectColorSwatchGrid } from "./project-palette"

interface CanvasSidebarProps {
  collapsed: boolean
  onToggleSidebar: () => void
  projects: CanvasProject[]
  projectTaskCounts: Record<string, number>
  activeProjectId: string | null
  onSelectProject: (projectId: string) => void
  /** Omitted when the app uses a fixed project catalog (no “add project”). */
  onAddProject?: (name?: string, icon?: string) => void
  onUpdateProject: (projectId: string, updates: Partial<CanvasProject>) => void
  onDeleteProject: (projectId: string) => void
  /** Same as calendar sidebar: quick-add task scoped to a project (+ on project row). */
  onQuickAddTask?: (preset: {
    tag?: string
    date?: Date
    schedule?: string
    projectId?: string
  }) => void
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
  onQuickAddTask,
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
  const [projectsOpen, setProjectsOpen] = useState(true)
  const projectsRef = useRef<HTMLDivElement>(null)
  const [projectsHeight, setProjectsHeight] = useState<number | undefined>(undefined)
  const addProjectBtnRef = useRef<HTMLButtonElement>(null)
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [addProjectPos, setAddProjectPos] = useState<{ top: number; left: number } | null>(null)
  const reduceMotion = useReducedMotion() ?? false

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

  useEffect(() => {
    requestAnimationFrame(() => {
      if (projectsRef.current) setProjectsHeight(projectsRef.current.scrollHeight)
    })
  }, [projects, renamingProjectId, actionsDropdown])

  const commitProjectRename = useCallback(
    (projectId: string, value: string) => {
      const trimmed = value.trim()
      if (!trimmed) {
        setRenamingProjectId(null)
        return
      }
      const project = projects.find((p) => p.id === projectId)
      if (!project || trimmed === project.name) {
        setRenamingProjectId(null)
        return
      }
      onUpdateProject(projectId, { name: trimmed })
      setRenamingProjectId(null)
    },
    [onUpdateProject, projects]
  )

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-background overflow-hidden transition-[width,opacity] duration-200 ease-out",
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
            </div>

            <div className="flex-1 overflow-y-auto px-1.5 py-3">
              {projects.length === 0 ? (
                <div className="mt-6 px-3 text-xs text-text-muted">
                  No projects yet. Create one to start a canvas.
                </div>
              ) : (
                <>
                  <div className="group/projects mb-0.5 flex w-full items-center px-2">
                    <button
                      type="button"
                      onClick={() => setProjectsOpen(!projectsOpen)}
                      className="flex flex-1 items-center gap-1.5 text-[13px] font-medium text-text/60 transition-colors duration-[200ms] ease-[var(--cadence-ease-slide)] hover:text-text/90"
                    >
                      <ChevronRight
                        className={cn(
                          "h-2.5 w-2.5 transition-transform duration-[200ms] ease-[var(--cadence-ease-slide)] motion-reduce:transition-none",
                          projectsOpen && "rotate-90"
                        )}
                      />
                      Projects
                    </button>
                    {onAddProject && (
                      <button
                        ref={addProjectBtnRef}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (addProjectBtnRef.current) {
                            const rect = addProjectBtnRef.current.getBoundingClientRect()
                            setAddProjectPos({ top: rect.bottom + 4, left: rect.left })
                          }
                          setAddProjectOpen(true)
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-0 transition-[opacity,colors,transform] duration-[200ms] ease-[var(--cadence-ease-slide)] hover:bg-surface-2 hover:text-text group-hover/projects:opacity-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div
                    ref={projectsRef}
                    className={cn(
                      "transform overflow-hidden",
                      reduceMotion
                        ? "transition-none"
                        : "transition-[max-height,opacity,transform] duration-[200ms] ease-[var(--cadence-ease-slide)] motion-reduce:transition-none"
                    )}
                    style={{
                      maxHeight: projectsOpen ? (projectsHeight ?? 2000) : 0,
                      opacity: projectsOpen ? 1 : 0,
                      transform: projectsOpen ? "translateY(0)" : "translateY(-4px)",
                    }}
                  >
                    <div>
                      {projects.map((project) => {
                        const count = projectTaskCounts[project.id] ?? 0
                        const isRenaming = renamingProjectId === project.id
                        return (
                          <ProjectItem
                            key={project.id}
                            label={project.name}
                            color={project.color}
                            count={count > 0 ? count : undefined}
                            hasChevron={false}
                            isActive={project.id === activeProjectId}
                            onRowClick={() => onSelectProject(project.id)}
                            isRenaming={isRenaming}
                            renameValue={renameValue}
                            renameInputRef={renameInputRef}
                            onRenameChange={setRenameValue}
                            onRenameCommit={(value) => commitProjectRename(project.id, value)}
                            onRenameCancel={() => setRenamingProjectId(null)}
                            onPlusClick={
                              onQuickAddTask ? () => onQuickAddTask({ projectId: project.id }) : undefined
                            }
                            onMoreClick={(anchor) => {
                              setActionsDropdown({ projectId: project.id, anchor })
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {onAddProject && addProjectOpen && addProjectPos && (
              <AddProjectPopover
                pos={addProjectPos}
                existingNames={projects.map((p) => p.name)}
                onClose={() => setAddProjectOpen(false)}
                onCreate={(name, color) => {
                  onAddProject(name, color)
                  setAddProjectOpen(false)
                }}
              />
            )}

            {actionsDropdown && (() => {
              const project = projects.find((p) => p.id === actionsDropdown.projectId)
              if (!project) return null
              return (
                <ProjectActionsDropdown
                  anchor={actionsDropdown.anchor}
                  currentColor={project.color}
                  deleteDisabled
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
