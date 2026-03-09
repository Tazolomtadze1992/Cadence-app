"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  BookOpen,
  FileText,
  Folder,
  Image as ImageIcon,
  Layout,
  MoreHorizontal,
  Plus,
  Sparkles,
  Star,
  StickyNote,
  Pencil,
  Trash2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CanvasProject } from "./canvas-board"

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
                    const Icon = getProjectIcon(project.icon)
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
                          <Icon
                            className={cn(
                              "h-3.5 w-3.5 shrink-0 transition-colors",
                              isActive ? "text-text" : "text-text-muted group-hover:text-text"
                            )}
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
                  currentIcon={project.icon ?? "folder"}
                  onClose={() => setActionsDropdown(null)}
                  onIconChange={(icon) => {
                    onUpdateProject(project.id, { icon })
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

const PROJECT_ICONS: Record<string, LucideIcon> = {
  folder: Folder,
  sparkles: Sparkles,
  fileText: FileText,
  star: Star,
  book: BookOpen,
  layout: Layout,
  image: ImageIcon,
  note: StickyNote,
}

const PROJECT_ICON_OPTIONS = ["folder", "sparkles", "fileText", "star", "book", "layout", "image", "note"] as const

type ProjectIconKey = (typeof PROJECT_ICON_OPTIONS)[number]

function getProjectIcon(name?: string): LucideIcon {
  if (!name) return Folder
  return PROJECT_ICONS[name] ?? Folder
}

function ProjectActionsDropdown({
  anchor,
  currentIcon,
  onClose,
  onIconChange,
  onRename,
  onDelete,
}: {
  anchor: { top: number; left: number; right: number; bottom: number }
  currentIcon: string
  onClose: () => void
  onIconChange: (icon: ProjectIconKey) => void
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

  const selected = (currentIcon || "folder") as ProjectIconKey

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[100] w-[200px] rounded-xl border border-border/50 bg-background p-3 shadow-lg motion-reduce:transition-none will-change-transform will-change-opacity"
      style={{
        top: computedTop,
        left: computedLeft,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.98)",
        transition: "opacity 160ms cubic-bezier(0.2,0.8,0.2,1), transform 160ms cubic-bezier(0.2,0.8,0.2,1)",
        transformOrigin: origin,
      }}
    >
      <div className="mb-3">
        <div className="grid grid-cols-4 gap-1.5">
          {PROJECT_ICON_OPTIONS.map((key) => {
            const Icon = getProjectIcon(key)
            const isActive = selected === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => onIconChange(key)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-text-muted transition-colors",
                  isActive
                    ? "border-app-accent/60 bg-app-accent/10 text-app-accent"
                    : "hover:border-border/60 hover:bg-surface-2 hover:text-text"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            )
          })}
        </div>
      </div>

      <div className="my-1.5 h-px bg-border/20" />

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
        onClick={() => onDelete()}
        className="mt-0.5 flex w-full items-center gap-2.5 rounded-sm px-2 py-1 text-xs text-red-400 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-red-500/10"
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </button>
    </div>,
    document.body
  )
}

