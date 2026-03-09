"use client"

import { useEffect, useRef, useState } from "react"
import { MoreHorizontal, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CanvasProject } from "./canvas-board"
import { CategoryActionsDropdown } from "./sidebar"

interface CanvasSidebarProps {
  collapsed: boolean
  onToggleSidebar: () => void
  projects: CanvasProject[]
  activeProjectId: string | null
  onSelectProject: (projectId: string) => void
  onAddProject: () => void
  onUpdateProject: (projectId: string, updates: Partial<CanvasProject>) => void
  onDeleteProject: (projectId: string) => void
}

export function CanvasSidebar({
  collapsed,
  projects,
  activeProjectId,
  onSelectProject,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
}: CanvasSidebarProps) {
  const [contentVisible, setContentVisible] = useState(!collapsed)
  const [actionsDropdown, setActionsDropdown] = useState<{
    projectId: string
    anchor: { top: number; left: number; right: number; bottom: number }
  } | null>(null)
  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const renameInputRef = useRef<HTMLInputElement | null>(null)

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
            <div className="px-3 pt-4 pb-2">
              <p className="text-[12px] font-semibold text-text-faint">Recent</p>
              <button
                type="button"
                onClick={onAddProject}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-surface-2/80 px-2.5 py-1 text-[11px] font-medium text-text-muted transition-colors hover:bg-surface hover:text-text"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New project</span>
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
                    const color = project.color ?? "#d4d4d8"
                    return (
                      <button
                        key={project.id}
                        type="button"
                        onClick={() => onSelectProject(project.id)}
                        className={cn(
                          "group flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                          isActive
                            ? "bg-calendar-bg/50 text-text"
                            : "text-text-muted hover:text-text"
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
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
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {actionsDropdown && (() => {
              const project = projects.find((p) => p.id === actionsDropdown.projectId)
              if (!project) return null
              return (
                <CategoryActionsDropdown
                  anchor={actionsDropdown.anchor}
                  currentColor={project.color ?? "#d4d4d8"}
                  onClose={() => setActionsDropdown(null)}
                  onColorChange={(newColor) => {
                    onUpdateProject(project.id, { color: newColor })
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
          </div>
        )}
      </div>
    </aside>
  )
}
