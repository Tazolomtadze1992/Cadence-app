"use client"

import { useState, useRef, useEffect, useCallback, useMemo } from "react"
import { createPortal } from "react-dom"
import { format, isToday as isTodayFn, isTomorrow as isTomorrowFn, isBefore, startOfDay, addDays } from "date-fns"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Check,
  MoreHorizontal,
  Repeat,
  Tag,
  Calendar,
} from "lucide-react"
import type { Task } from "@/app/page"
import { AgendaView } from "./agenda-view"
import { IconTooltipButton } from "./icon-tooltip-button"

const scheduledGroups = [
  { label: "Unscheduled", color: "#6b7280", icon: "calendar.svg" },
  { label: "Due today", color: "#f97316", icon: "due-today.svg" },
  { label: "Due tomorrow", color: "#3b82f6", icon: "due-tomorrow.svg" },
  { label: "Due Soon", color: "#a855f7", icon: "due-soon.svg" },
  { label: "Overdue", color: "#ef4444", icon: "overdue.svg" },
]

const INITIAL_CATEGORIES = [
  { label: "Reading", color: "#ef4444" },
  { label: "Building", color: "#3b82f6" },
  { label: "Portfolio", color: "#a855f7" },
  { label: "Inspiration", color: "#22c55e" },
]

const PRESET_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#6b7280"]

const EXTENDED_COLORS = [
  "#ef4444",
  "#dc2626",
  "#f97316",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#94a3b8",
  "#d4d4d8",
]

export function AppSidebar({
  collapsed,
  onToggleSidebar,
  tasks = [],
  onToggleComplete,
  onUpdateTask,
  onDeleteTask,
  onQuickAddTask,
  onDragTaskStart,
  onDragTaskEnd,
  appMode,
  sidebarView,
  onSidebarModeClick,
}: {
  collapsed: boolean
  onToggleSidebar: () => void
  tasks?: Task[]
  onToggleComplete?: (id: string) => void
  onUpdateTask?: (id: string, updates: Partial<Task>) => void
  onDeleteTask?: (id: string) => void
  onQuickAddTask?: (preset: { tag?: string; date?: Date; schedule?: string }) => void
  onDragTaskStart?: (task: Task) => void
  onDragTaskEnd?: () => void
  appMode: import("./top-bar").AppMode
  sidebarView: "tasks" | "agenda"
  onSidebarModeClick: (view: "tasks" | "agenda" | "canvas") => void
}) {
  const [slideDirection, setSlideDirection] = useState<1 | -1>(1)
  const [activeTab, setActiveTab] = useState<"all" | "completed">("all")
  const [categoriesOpen, setCategoriesOpen] = useState(true)
  const [categories, setCategories] = useState(INITIAL_CATEGORIES)
  const categoriesRef = useRef<HTMLDivElement>(null)
  const [categoriesHeight, setCategoriesHeight] = useState<number | undefined>(undefined)

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({})
  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const buckets = useMemo(() => {
    const now = new Date()
    const today = startOfDay(now)
    const tomorrow = addDays(today, 1)
    const soonEnd = addDays(today, 7)

    const unscheduled: Task[] = []
    const overdue: Task[] = []
    const dueToday: Task[] = []
    const dueTomorrow: Task[] = []
    const dueSoon: Task[] = []

    for (const t of tasks) {
      if (t.completed) continue
      const hasTime = t.startMinutes != null && t.endMinutes != null
      if (!hasTime) {
        unscheduled.push(t)
        continue
      }
      const d = new Date(t.dueDate + "T00:00:00")
      if (isBefore(d, today)) overdue.push(t)
      else if (isTodayFn(d)) dueToday.push(t)
      else if (isTomorrowFn(d)) dueTomorrow.push(t)
      else if (isBefore(d, soonEnd)) dueSoon.push(t)
    }

    return { unscheduled, overdue, dueToday, dueTomorrow, dueSoon }
  }, [tasks])

  const todayStart = useMemo(() => startOfDay(new Date()), [])
  const handleQuickAddFromScheduledGroup = useCallback(
    (label: string) => {
      // Map sidebar sections to a concrete date + editor schedule preset.
      if (label === "Unscheduled") {
        onQuickAddTask?.({ schedule: "anytime" })
      } else if (label === "Due today") {
        onQuickAddTask?.({ date: todayStart, schedule: "today" })
      } else if (label === "Due tomorrow") {
        onQuickAddTask?.({ date: addDays(todayStart, 1), schedule: "tomorrow" })
      } else if (label === "Due Soon") {
        // Pick a reasonable default within the "soon" window.
        const d = addDays(todayStart, 3)
        onQuickAddTask?.({ date: d, schedule: "picked" })
      } else if (label === "Overdue") {
        // No "+" currently shown for Overdue, but keep mapping sane.
        const d = addDays(todayStart, -1)
        onQuickAddTask?.({ date: d, schedule: "picked" })
      }
    },
    [onQuickAddTask, todayStart]
  )

  const bucketMap: Record<string, Task[]> = {
    Unscheduled: buckets.unscheduled,
    Overdue: buckets.overdue,
    "Due today": buckets.dueToday,
    "Due tomorrow": buckets.dueTomorrow,
    "Due Soon": buckets.dueSoon,
  }

  const categoryTaskMap = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const t of tasks) {
      if (t.completed) continue
      if (t.tag) {
        if (!map[t.tag]) map[t.tag] = []
        map[t.tag].push(t)
      }
    }
    return map
  }, [tasks])

  const completedTasks = useMemo(() => tasks.filter((t) => t.completed), [tasks])

  const [taskDropdown, setTaskDropdown] = useState<{
    taskId: string
    anchor: { top: number; left: number; right: number; bottom: number }
  } | null>(null)

  // Slightly delay content mount on expand so width animation leads
  const [contentVisible, setContentVisible] = useState(!collapsed)

  useEffect(() => {
    if (!collapsed) {
      // Wait a short moment so the width has started expanding before we show content
      const id = window.setTimeout(() => setContentVisible(true), 80)
      return () => window.clearTimeout(id)
    }
    // Hide content immediately when collapsing to avoid flicker
    setContentVisible(false)
  }, [collapsed])

  const activeDropdownTask = useMemo(
    () => (taskDropdown ? tasks.find((t) => t.id === taskDropdown.taskId) : null),
    [taskDropdown, tasks]
  )

  const [actionsDropdown, setActionsDropdown] = useState<{
    label: string
    anchor: { top: number; left: number; right: number; bottom: number }
  } | null>(null)

  const [renamingCategory, setRenamingCategory] = useState<string | null>(null)

  const handleMoreClick = useCallback(
    (label: string, anchor: { top: number; left: number; right: number; bottom: number }) => {
      setActionsDropdown({ label, anchor })
    },
    []
  )

  const handleColorChangeImmediate = useCallback((label: string, newColor: string) => {
    setCategories((prev) => prev.map((c) => (c.label === label ? { ...c, color: newColor } : c)))
  }, [])

  const handleRenameStart = useCallback((label: string) => {
    setActionsDropdown(null)
    requestAnimationFrame(() => setRenamingCategory(label))
  }, [])

  const handleRenameCommit = useCallback((oldLabel: string, newLabel: string) => {
    const trimmed = newLabel.trim()
    if (trimmed && trimmed !== oldLabel) {
      setCategories((prev) => prev.map((c) => (c.label === oldLabel ? { ...c, label: trimmed } : c)))
    }
    setRenamingCategory(null)
  }, [])

  const handleDeleteCategory = useCallback((label: string) => {
    setActionsDropdown(null)
    setCategories((prev) => prev.filter((c) => c.label !== label))
    requestAnimationFrame(() => {
      if (categoriesRef.current) setCategoriesHeight(categoriesRef.current.scrollHeight)
    })
  }, [])

  const [addOpen, setAddOpen] = useState(false)
  const [addPos, setAddPos] = useState<{ top: number; left: number } | null>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => {
      if (categoriesRef.current) setCategoriesHeight(categoriesRef.current.scrollHeight)
    })
  }, [categories, expandedCategories, categoryTaskMap])

  const openAddPopover = useCallback(() => {
    if (addBtnRef.current) {
      const rect = addBtnRef.current.getBoundingClientRect()
      setAddPos({ top: rect.bottom + 4, left: rect.left })
    }
    setAddOpen(true)
  }, [])

  const handleCreateCategory = useCallback((name: string, color: string) => {
    setCategories((prev) => [...prev, { label: name, color }])
    setAddOpen(false)
    requestAnimationFrame(() => {
      if (categoriesRef.current) setCategoriesHeight(categoriesRef.current.scrollHeight)
    })
  }, [])

  const switchToAgenda = useCallback(() => {
    if (sidebarView === "agenda") return
    setSlideDirection(1) // tasks slides left, agenda slides in from right
    onSidebarModeClick("agenda")
  }, [sidebarView, onSidebarModeClick])

  const switchToTasks = useCallback(() => {
    if (sidebarView === "tasks") return
    setSlideDirection(-1) // agenda slides right, tasks slides in from left
    onSidebarModeClick("tasks")
  }, [sidebarView, onSidebarModeClick])

  // Keyboard shortcuts for T, A, and Shift+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return

      // Shift+S toggles sidebar
      if (e.shiftKey && e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        onToggleSidebar()
        return
      }

      // Ignore other shortcuts if modifier keys are pressed
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      if (e.key === "t" || e.key === "T") {
        e.preventDefault()
        switchToTasks()
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault()
        switchToAgenda()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [switchToTasks, switchToAgenda, onToggleSidebar])

  // Animation variants for sliding panels
  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? "100%" : "-100%",
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? "-100%" : "100%",
      opacity: 0,
    }),
  }

  // Agenda view uses a simpler fade variant so it plays nicer
  // with the sidebar width animation on expand/collapse.
  const agendaVariants = {
    enter: { opacity: 0, x: 0 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 0 },
  }

  const slideTransition = {
    duration: 0.2,
    ease: [0.2, 0.8, 0.2, 1] as const,
  }

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col bg-background overflow-hidden transition-all duration-200 ease-out",
        collapsed ? "w-0 opacity-0" : "w-[260px] opacity-100"
      )}
    >
      {/* Animated content area */}
      <div className="relative flex-1 overflow-hidden">
        {contentVisible && (
        <AnimatePresence initial={false} custom={slideDirection} mode="popLayout">
          {sidebarView === "tasks" ? (
            <motion.div
              key="tasks"
              custom={slideDirection}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
              className="absolute inset-0 flex flex-col overflow-hidden"
            >
              {/* All/Completed tabs */}
              <div className="px-3 pb-2">
                <div className="flex rounded bg-surface-2 p-0.5">
                  <button
                    onClick={() => setActiveTab("all")}
                    className={cn(
                      "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                      activeTab === "all" ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
                    )}
                  >
                    All
                  </button>
                  <button
                    onClick={() => setActiveTab("completed")}
                    className={cn(
                      "flex-1 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                      activeTab === "completed" ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text"
                    )}
                  >
                    Completed
                  </button>
                </div>
              </div>

              {activeTab === "completed" ? (
                completedTasks.length === 0 ? (
                  <CompletedEmptyState />
                ) : (
                  <div className="flex flex-1 flex-col overflow-y-auto px-1.5 py-3">
                    <div className="space-y-0.5">
                      {completedTasks.map((t) => (
                        <TaskRow
                          key={t.id}
                          task={t}
                          onToggleComplete={() => onToggleComplete?.(t.id)}
                          onMoreClick={(anchor) => setTaskDropdown({ taskId: t.id, anchor })}
                          isDraggable={t.startMinutes == null || t.endMinutes == null}
                          onDragStart={() => {
                            setDraggingTaskId(t.id)
                            onDragTaskStart?.(t)
                          }}
                          onDragEnd={() => {
                            setDraggingTaskId(null)
                            onDragTaskEnd?.()
                          }}
                          isDragging={draggingTaskId === t.id}
                        />
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <>
              {/* Scheduled groups */}
              <div className="px-1.5 py-3">
                {scheduledGroups.map((group) => {
                  const groupTasks = bucketMap[group.label] ?? []
                  const count = groupTasks.length
                  const isExpanded = expandedGroups[group.label] ?? false
                  return (
                    <div key={group.label}>
                      <SidebarItem
                        label={group.label}
                        color={group.color}
                        icon={group.icon}
                        count={count > 0 ? count : undefined}
                        hasChevron
                        isExpanded={isExpanded}
                        onToggleExpand={count > 0 ? () => toggleGroup(group.label) : undefined}
                        showPlus={group.label !== "Overdue"}
                        onPlusClick={() => handleQuickAddFromScheduledGroup(group.label)}
                      />
                      {isExpanded && count > 0 && (
                        <div className="ml-5 mt-0.5 mb-1">
                          {groupTasks.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              onToggleComplete={() => onToggleComplete?.(t.id)}
                              onMoreClick={(anchor) => setTaskDropdown({ taskId: t.id, anchor })}
                              isDraggable={t.startMinutes == null || t.endMinutes == null}
                              onDragStart={() => {
                                setDraggingTaskId(t.id)
                                onDragTaskStart?.(t)
                              }}
                              onDragEnd={() => {
                                setDraggingTaskId(null)
                                onDragTaskEnd?.()
                              }}
                              isDragging={draggingTaskId === t.id}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>


              {/* Categories section */}
              <div className="flex-1 overflow-y-auto px-1.5 py-3">
                <div className="group/cat-header mb-0.5 flex w-full items-center px-2">
                  <button
                    onClick={() => setCategoriesOpen(!categoriesOpen)}
                    className="flex flex-1 items-center gap-1.5 text-[13px] font-medium text-text/60 transition-colors duration-300 ease-in-out hover:text-text/90"
                  >
                    <ChevronRight className={cn("h-2.5 w-2.5 transition-transform duration-200", categoriesOpen && "rotate-90")} />
                    Categories
                  </button>
                  <button
                    ref={addBtnRef}
                    onClick={(e) => {
                      e.stopPropagation()
                      e.preventDefault()
                      openAddPopover()
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded text-text-muted opacity-0 transition-all duration-300 ease-in-out hover:bg-surface-2 hover:text-text group-hover/cat-header:opacity-100"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div
                  ref={categoriesRef}
                  className="transition-all duration-200"
                  style={{
                    maxHeight: categoriesOpen ? (categoriesHeight ?? 2000) : 0,
                    opacity: categoriesOpen ? 1 : 0,
                    overflow: categoriesOpen ? "visible" : "hidden",
                  }}
                >
                  {categories.map((group) => {
                    const catTasks = categoryTaskMap[group.label] ?? []
                    const catCount = catTasks.length
                    const isCatExpanded = expandedCategories[group.label] ?? false
                    return (
                      <div key={group.label}>
                        <SidebarItem
                          label={group.label}
                          color={group.color}
                          count={catCount > 0 ? catCount : undefined}
                          hasChevron
                          isExpanded={isCatExpanded}
                          onToggleExpand={catCount > 0 ? () => toggleCategory(group.label) : undefined}
                          showPlus
                          onPlusClick={() => onQuickAddTask?.({ tag: group.label })}
                          showMore
                          isRenaming={renamingCategory === group.label}
                          onRenameCommit={(newLabel) => handleRenameCommit(group.label, newLabel)}
                          onRenameCancel={() => setRenamingCategory(null)}
                          onMoreClick={(anchor) => handleMoreClick(group.label, anchor)}
                        />
                        {isCatExpanded && catCount > 0 && (
                          <div className="ml-5 mt-0.5 mb-1">
                            {catTasks.map((t) => (
                              <TaskRow
                                key={t.id}
                                task={t}
                                onToggleComplete={() => onToggleComplete?.(t.id)}
                                onMoreClick={(anchor) => setTaskDropdown({ taskId: t.id, anchor })}
                                isDraggable={t.startMinutes == null || t.endMinutes == null}
                                onDragStart={() => {
                                  setDraggingTaskId(t.id)
                                  onDragTaskStart?.(t)
                                }}
                                onDragEnd={() => {
                                  setDraggingTaskId(null)
                                  onDragTaskEnd?.()
                                }}
                                isDragging={draggingTaskId === t.id}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {addOpen && addPos && (
                  <AddCategoryPopover
                    pos={addPos}
                    existingNames={categories.map((c) => c.label)}
                    onClose={() => setAddOpen(false)}
                    onCreate={handleCreateCategory}
                  />
                )}

                {actionsDropdown && (() => {
                  const cat = categories.find((c) => c.label === actionsDropdown.label)
                  if (!cat) return null
                  return (
                    <CategoryActionsDropdown
                      anchor={actionsDropdown.anchor}
                      currentColor={cat.color}
                      onClose={() => setActionsDropdown(null)}
                      onColorChange={(newColor) => handleColorChangeImmediate(actionsDropdown.label, newColor)}
                      onRename={() => handleRenameStart(actionsDropdown.label)}
                      onDelete={() => handleDeleteCategory(actionsDropdown.label)}
                    />
                  )
                })()}

              </div>
                </>
              )}

              {taskDropdown && activeDropdownTask && (
                <TaskActionsDropdown
                  task={activeDropdownTask}
                  anchor={taskDropdown.anchor}
                  categories={categories}
                  onClose={() => setTaskDropdown(null)}
                  onToggleComplete={() => onToggleComplete?.(activeDropdownTask.id)}
                  onUpdateTask={(id, updates) => onUpdateTask?.(id, updates)}
                  onDeleteTask={(id) => onDeleteTask?.(id)}
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="agenda"
              custom={slideDirection}
              variants={agendaVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
              className="absolute inset-0 overflow-hidden"
            >
              <AgendaView tasks={tasks} />
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>


      {/* Bottom toggle icons */}
      <div className="flex justify-start px-3 pb-3 pt-2">
        <div className="relative inline-flex items-center rounded-lg bg-surface-2/80 px-2 py-2">
          <IconTooltipButton
            iconUrl="/icons/taskicon.svg"
            label="Tasks"
            shortcut="T"
            isActive={sidebarView === "tasks"}
            onClick={switchToTasks}
            tooltipPosition="above"
          />
          <IconTooltipButton
            iconUrl="/icons/calendar.svg"
            label="Agenda"
            shortcut="A"
            isActive={sidebarView === "agenda"}
            onClick={switchToAgenda}
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
    </aside>
  )
}

function AddCategoryPopover({
  pos,
  existingNames,
  onClose,
  onCreate,
}: {
  pos: { top: number; left: number }
  existingNames: string[]
  onClose: () => void
  onCreate: (name: string, color: string) => void
}) {
  const [name, setName] = useState("")
  const [color, setColor] = useState(EXTENDED_COLORS[0])
  const [error, setError] = useState<string | null>(null)
  const [visible, setVisible] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    inputRef.current?.focus()
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

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return setError("Name required")
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return setError("Category already exists")
    onCreate(trimmed, color)
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[100] w-[200px] rounded-xl border border-border/50 bg-background p-3 shadow-lg motion-reduce:transition-none will-change-transform will-change-opacity"
      style={{
        top: pos.top,
        left: pos.left,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.98)",
        transition: "opacity 160ms cubic-bezier(0.2,0.8,0.2,1), transform 160ms cubic-bezier(0.2,0.8,0.2,1)",
        transformOrigin: "top left",
      }}
    >
      <div className="mb-3">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit()
          }}
          placeholder="Category name"
          className="w-full rounded-lg border border-border/50 bg-surface-2 px-3 py-2 text-xs text-text outline-none placeholder:text-text-faint transition-colors duration-300 ease-in-out focus:border-neutral/50"
        />
        {error && <p className="mt-1.5 text-[10px] text-red-400">{error}</p>}
      </div>

      <div className="mb-3">
        <p className="mb-2 text-[10px] font-medium text-text-faint">Color</p>
        <ColorSwatchGrid value={color} onChange={setColor} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={onClose}
          className="rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors duration-300 ease-in-out hover:bg-surface-2 hover:text-text"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="rounded bg-app-accent px-3 py-1.5 text-xs font-medium text-app-accent-foreground transition-all duration-300 ease-in-out hover:brightness-110"
        >
          Create
        </button>
      </div>
    </div>,
    document.body
  )
}

export function CategoryActionsDropdown({
  anchor,
  currentColor,
  onClose,
  onColorChange,
  onRename,
  onDelete,
}: {
  anchor: { top: number; left: number; right: number; bottom: number }
  currentColor: string
  onClose: () => void
  onColorChange: (color: string) => void
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
        <ColorSwatchGrid value={currentColor} onChange={onColorChange} />
      </div>

      <div className="my-1.5 h-px bg-border/20" />

      <button
        onClick={() => onRename()}
        className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1 text-xs text-text transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-surface-2"
      >
        <Pencil className="h-3 w-3 text-text-muted" />
        Rename
      </button>

      <button
        onClick={() => onDelete()}
        className="flex w-full items-center gap-2.5 rounded-sm px-2 py-1 text-xs text-red-400 transition-all duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-red-500/10"
      >
        <Trash2 className="h-3 w-3" />
        Delete
      </button>
    </div>,
    document.body
  )
}

// ─── Shared Color Swatch Grid ────────────────────────────────────────
function ColorSwatchGrid({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const row1 = EXTENDED_COLORS.slice(0, 8)
  const row2 = EXTENDED_COLORS.slice(8, 16)
  return (
    <div className="flex flex-col gap-1.5">
      {[row1, row2].map((row, ri) => (
        <div key={ri} className="flex items-center gap-1.5">
          {row.map((c) => {
            const isSelected = c === value
            return (
              <button
                key={c}
                onClick={() => onChange(c)}
                className={cn(
                  "relative flex h-4 w-4 items-center justify-center rounded-sm transform-gpu transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:scale-[1.1]",
                  isSelected ? "" : "hover:ring-1 hover:ring-white/10 hover:ring-offset-1 hover:ring-offset-background"
                )}
                style={{ backgroundColor: c }}
              >
                {isSelected && <Check className="h-3 w-3 text-white drop-shadow-sm" />}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "#ef4444",
  medium: "#f97316",
  low: "#3b82f6",
}

export const PRIORITY_ICON_MAP: Record<string, string> = {
  high: "/icons/high.svg",
  medium: "/icons/medium.svg",
  low: "/icons/low.svg",
  none: "/icons/none.svg",
}

export function PriorityIcon({ priority, className }: { priority: string; className?: string }) {
  const src = PRIORITY_ICON_MAP[priority] ?? PRIORITY_ICON_MAP.none
  return <img src={src} alt="" className={cn("shrink-0", className)} />
}

const PRIORITY_OPTIONS = [
  { value: "high", label: "High", color: "#ef4444" },
  { value: "medium", label: "Medium", color: "#f97316" },
  { value: "low", label: "Low", color: "#3b82f6" },
  { value: "none", label: "None" },
]

const SCHEDULE_OPTIONS = [
  { value: "anytime", label: "Anytime", icon: "settings" },
  { value: "today", label: "Today", color: "#f97316" },
  { value: "tomorrow", label: "Tomorrow", color: "#3b82f6" },
]

const REPEAT_LABELS: Record<string, string> = {
  daily: "Daily",
  weekdays: "Every weekday",
  weekly: "Weekly",
  monthly: "Monthly",
}

// ─── Submenu Component ──────────────────────────────────────────��────
function DropdownSubmenu({
  anchor,
  children,
  onMouseEnter,
  onMouseLeave,
  submenuRef,
}: {
  anchor: { top: number; right: number; left: number }
  children: React.ReactNode
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  submenuRef?: React.RefObject<HTMLDivElement | null>
}) {
  const SUBMENU_WIDTH = 180
  const GAP = 6
  const fitsRight = anchor.right + GAP + SUBMENU_WIDTH <= window.innerWidth - 8
  const left = fitsRight ? anchor.right + GAP : anchor.left - SUBMENU_WIDTH - GAP
  const top = Math.min(anchor.top, window.innerHeight - 200)

  const [visible, setVisible] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  return createPortal(
    <div
      ref={submenuRef}
      className="fixed z-[102] w-[180px] rounded-xl border border-border/50 bg-background py-1.5 shadow-lg will-change-transform will-change-opacity"
      style={{
        top,
        left,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-2px) scale(0.99)",
        transition: "opacity 140ms cubic-bezier(0.2,0.8,0.2,1), transform 140ms cubic-bezier(0.2,0.8,0.2,1)",
        transformOrigin: fitsRight ? "top left" : "top right",
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {children}
    </div>,
    document.body
  )
}

function SubmenuRow({
  label,
  color,
  icon,
  isSelected,
  onClick,
}: {
  label: string
  color?: string
  icon?: React.ReactNode
  isSelected?: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-text transition-colors duration-150 hover:bg-surface-2"
    >
      {icon ? (
        icon
      ) : color ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      ) : (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-text-faint/30" />
      )}
      <span className="flex-1 text-left">{label}</span>
      {isSelected && <Check className="h-3 w-3 text-text-muted" />}
    </button>
  )
}

// ─── Task Actions Dropdown ───────────────────────────────────────────
function TaskActionsDropdown({
  task,
  anchor,
  categories,
  onClose,
  onToggleComplete,
  onUpdateTask,
  onDeleteTask,
}: {
  task: Task
  anchor: { top: number; left: number; right: number; bottom: number }
  categories: { label: string; color: string }[]
  onClose: () => void
  onToggleComplete: () => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onDeleteTask: (id: string) => void
}) {
  const DROPDOWN_WIDTH = 200
  const GAP = 8
  const [visible, setVisible] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const [openSub, setOpenSub] = useState<"priority" | "tag" | "schedule" | null>(null)
  const [subAnchor, setSubAnchor] = useState<{ top: number; right: number; left: number } | null>(null)

  const fitsRight = anchor.right + GAP + DROPDOWN_WIDTH <= window.innerWidth - GAP
  const computedLeft = fitsRight ? anchor.right + GAP : anchor.left - DROPDOWN_WIDTH - GAP
  const DROPDOWN_HEIGHT = 260
  const computedTop = Math.min(anchor.top, window.innerHeight - DROPDOWN_HEIGHT - GAP)
  const origin = fitsRight ? "top left" : "top right"

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
  }, [])

  // ✅ animate-out close (instead of unmounting instantly)
  const closeWithAnimation = useCallback(() => {
    setVisible(false)
    window.setTimeout(() => onClose(), 160)
  }, [onClose])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        (!submenuRef.current || !submenuRef.current.contains(target))
      ) {
        closeWithAnimation()
      }
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClick)
    }
  }, [closeWithAnimation])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (openSub) setOpenSub(null)
        else closeWithAnimation()
      }
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [closeWithAnimation, openSub])

  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSubHover = (sub: "priority" | "tag" | "schedule", e: React.MouseEvent<HTMLButtonElement>) => {
    const rowRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const dropdownRect = popoverRef.current?.getBoundingClientRect()
    if (dropdownRect) setSubAnchor({ top: rowRect.top, right: dropdownRect.right, left: dropdownRect.left })

    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    if (openTimer.current) clearTimeout(openTimer.current)

    // ✅ tiny delay prevents flicker + feels intentional
    openTimer.current = setTimeout(() => setOpenSub(sub), 60)
  }

  const handleContainerEnter = () => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
  }

  const handleContainerLeave = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current)
      openTimer.current = null
    }
    leaveTimer.current = setTimeout(() => setOpenSub(null), 200)
  }

  useEffect(() => {
    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current)
      if (openTimer.current) clearTimeout(openTimer.current)
    }
  }, [])

  const rowClass =
    "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-text transition-colors duration-150 hover:bg-surface-2"

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[101] w-[200px] rounded-xl border border-border/50 bg-background py-1.5 shadow-lg motion-reduce:transition-none will-change-transform will-change-opacity"
      style={{
        top: computedTop,
        left: computedLeft,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(-4px) scale(0.98)",
        transition: "opacity 500ms cubic-bezier(0.2,0.8,0.2,1), transform 500ms cubic-bezier(0.2,0.8,0.2,1)",
        transformOrigin: origin,
      }}
      onMouseEnter={handleContainerEnter}
      onMouseLeave={handleContainerLeave}
    >
      <button
        className={rowClass}
        onMouseEnter={() => setOpenSub(null)}
        onClick={() => {
          onToggleComplete()
          closeWithAnimation()
        }}
      >
        <Check className="h-3.5 w-3.5 text-text-muted" />
        <span>{task.completed ? "Mark as undone" : "Mark as done"}</span>
      </button>

      <div className="mx-2 my-1 h-px bg-border/20" />

      <button
        className={cn(rowClass, openSub === "priority" && "bg-surface-2")}
        onMouseEnter={(e) => handleSubHover("priority", e)}
        onClick={(e) => handleSubHover("priority", e)}
      >
        <PriorityIcon priority={task.priority} className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Priority</span>
        <ChevronRight className="h-3 w-3 text-text-faint" />
      </button>

      <button
        className={cn(rowClass, openSub === "tag" && "bg-surface-2")}
        onMouseEnter={(e) => handleSubHover("tag", e)}
        onClick={(e) => handleSubHover("tag", e)}
      >
        <Tag className="h-3.5 w-3.5 text-text-muted" />
        <span className="flex-1 text-left">Tag</span>
        <ChevronRight className="h-3 w-3 text-text-faint" />
      </button>

      <button
        className={cn(rowClass, openSub === "schedule" && "bg-surface-2")}
        onMouseEnter={(e) => handleSubHover("schedule", e)}
        onClick={(e) => handleSubHover("schedule", e)}
      >
        <Calendar className="h-3.5 w-3.5 text-text-muted" />
        <span className="flex-1 text-left">Schedule</span>
        <ChevronRight className="h-3 w-3 text-text-faint" />
      </button>

      <div className="mx-2 my-1 h-px bg-border/20" />


      <button
        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-red-400 transition-colors duration-150 hover:bg-red-500/10"
        onMouseEnter={() => setOpenSub(null)}
        onClick={() => {
          onDeleteTask(task.id)
          closeWithAnimation()
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span>Delete</span>
      </button>

      {openSub === "priority" && subAnchor && (
        <DropdownSubmenu
          anchor={subAnchor}
          onMouseEnter={handleContainerEnter}
          onMouseLeave={handleContainerLeave}
          submenuRef={submenuRef}
        >
          {PRIORITY_OPTIONS.map((opt) => (
            <SubmenuRow
              key={opt.value}
              label={opt.label}
              icon={<PriorityIcon priority={opt.value} className="h-3.5 w-3.5" />}
              isSelected={task.priority === opt.value}
              onClick={() => { onUpdateTask(task.id, { priority: opt.value }); onClose() }}
            />
          ))}
        </DropdownSubmenu>
      )}

      {openSub === "tag" && subAnchor && (
        <DropdownSubmenu
          anchor={subAnchor}
          onMouseEnter={handleContainerEnter}
          onMouseLeave={handleContainerLeave}
          submenuRef={submenuRef}
        >
          <SubmenuRow
            label="No tag"
            isSelected={!task.tag}
            onClick={() => {
              onUpdateTask(task.id, { tag: "", tagColor: "#6b7280" })
              closeWithAnimation()
            }}
          />
          {categories.map((cat) => (
            <SubmenuRow
              key={cat.label}
              label={cat.label}
              color={cat.color}
              isSelected={task.tag === cat.label}
              onClick={() => {
                onUpdateTask(task.id, { tag: cat.label, tagColor: cat.color })
                closeWithAnimation()
              }}
            />
          ))}
        </DropdownSubmenu>
      )}

      {openSub === "schedule" && subAnchor && (
        <DropdownSubmenu
          anchor={subAnchor}
          onMouseEnter={handleContainerEnter}
          onMouseLeave={handleContainerLeave}
          submenuRef={submenuRef}
        >
          {SCHEDULE_OPTIONS.map((opt) => {
            const isSelected =
              opt.value === "today"
                ? isTodayFn(new Date(task.dueDate + "T00:00:00"))
                : opt.value === "tomorrow"
                  ? isTomorrowFn(new Date(task.dueDate + "T00:00:00"))
                  : task.schedule === "anytime"

            return (
              <SubmenuRow
                key={opt.value}
                label={opt.label}
                color={opt.color}
                isSelected={isSelected}
                onClick={() => {
                  if (opt.value === "today") {
                    const today = startOfDay(new Date())
                    onUpdateTask(task.id, { dueDate: format(today, "yyyy-MM-dd"), schedule: "today" })
                  } else if (opt.value === "tomorrow") {
                    const tomorrow = addDays(startOfDay(new Date()), 1)
                    onUpdateTask(task.id, { dueDate: format(tomorrow, "yyyy-MM-dd"), schedule: "tomorrow" })
                  } else {
                    onUpdateTask(task.id, { schedule: "anytime" })
                  }
                  closeWithAnimation()
                }}
              />
            )
          })}
          <div className="mx-2 my-1 h-px bg-border/20" />
          <button
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-text transition-colors duration-150 hover:bg-surface-2"
            onClick={() => closeWithAnimation()}
          >
            <span className="flex-1 text-left text-text-muted">Pick a date...</span>
            <ChevronRight className="h-3 w-3 text-text-faint" />
          </button>
        </DropdownSubmenu>
      )}
    </div>,
    document.body
  )
}

const DRAG_IMAGE_TRANSPARENT =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

function CompletedEmptyState() {
  return (
    <div className="px-4 pt-12">
      <div className="flex flex-col items-center text-center">
        <div
          className="mb-4 h-6 w-6"
          style={{
            backgroundColor: "var(--color-text-muted)",
            WebkitMaskImage: "url(/icons/taskicon.svg)",
            WebkitMaskSize: "contain",
            WebkitMaskRepeat: "no-repeat",
            WebkitMaskPosition: "center",
            maskImage: "url(/icons/taskicon.svg)",
            maskSize: "contain",
            maskRepeat: "no-repeat",
            maskPosition: "center",
          }}
          aria-hidden="true"
        />

        <p className="mb-1.5 text-sm font-medium text-text">No completed tasks yet</p>
        <p className="max-w-[220px] text-xs leading-relaxed text-text-muted">
          Completed tasks will appear here
          <br />
          for 24 hours
        </p>
      </div>
    </div>
  )
}

function TaskRow({
  task,
  onToggleComplete,
  onMoreClick,
  isDraggable,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: Task
  onToggleComplete: () => void
  onMoreClick?: (anchor: { top: number; left: number; right: number; bottom: number }) => void
  isDraggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  isDragging?: boolean
}) {
  const emptyDragImageRef = useRef<HTMLImageElement | null>(null)

  useEffect(() => {
    const img = new Image()
    img.src = DRAG_IMAGE_TRANSPARENT
    emptyDragImageRef.current = img
    return () => {
      emptyDragImageRef.current = null
    }
  }, [])

  const dueDateFormatted = useMemo(() => {
    try {
      return format(new Date(task.dueDate + "T00:00:00"), "d MMM")
    } catch {
      return ""
    }
  }, [task.dueDate])

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData("text/plain", task.id)
    e.dataTransfer.effectAllowed = "move"
    if (emptyDragImageRef.current) {
      e.dataTransfer.setDragImage(emptyDragImageRef.current, 0, 0)
    }
    onDragStart?.()
  }

  return (
    <div
      className={cn(
        "group/task flex w-full items-start gap-2.5 rounded-lg px-2 py-2 transition-colors duration-150 hover:bg-surface-2/30",
        isDraggable && "cursor-grab active:cursor-grabbing"
      )}
      draggable={isDraggable ?? false}
      onDragStart={isDraggable ? handleDragStart : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete()
        }}
        className={cn(
          "mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-all duration-200",
          task.completed
            ? "border-transparent bg-app-accent"
            : "border-text-faint/40 hover:border-text-muted"
        )}
      >
        {task.completed && <Check className="h-2.5 w-2.5 text-app-accent-foreground" />}
      </button>

      <div className="flex flex-1 flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm", task.completed ? "text-text-faint line-through" : "text-text")}>
            {task.title}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {dueDateFormatted && (
            <div className="flex items-center gap-1 rounded bg-surface-2/60 px-1.5 py-0.5">
              <Calendar className="h-3 w-3 text-[#f97316]" />
              <span className="text-[10px] text-text-faint">{dueDateFormatted}</span>
            </div>
          )}

          {task.tag && (
            <div className="group/chip relative flex items-center justify-center rounded bg-surface-2/60 p-1">
              <Tag className="h-3 w-3" style={{ color: task.tagColor }} />
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text opacity-0 shadow-md transition-opacity duration-150 group-hover/chip:opacity-100">
                {task.tag}
              </span>
            </div>
          )}

          {task.repeat && task.repeat !== "none" && (
            <div className="group/chip relative flex items-center justify-center rounded bg-surface-2/60 p-1">
              <Repeat className="h-3 w-3 text-[#3b82f6]" />
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text opacity-0 shadow-md transition-opacity duration-150 group-hover/chip:opacity-100">
                {REPEAT_LABELS[task.repeat] ?? task.repeat}
              </span>
            </div>
          )}

          {task.priority && task.priority !== "none" && (
            <div className="group/chip relative flex items-center justify-center rounded bg-surface-2/60 p-1">
              <PriorityIcon priority={task.priority} className="h-3 w-3" />
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text capitalize opacity-0 shadow-md transition-opacity duration-150 group-hover/chip:opacity-100">
                {task.priority}
              </span>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation()
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          onMoreClick?.({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom })
        }}
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted opacity-0 transition-all duration-150 hover:bg-surface-2 hover:text-text group-hover/task:opacity-100"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function SidebarItem({
  label,
  color,
  icon,
  count,
  hasChevron,
  isExpanded,
  onToggleExpand,
  showPlus,
  showMore,
  isRenaming,
  onRenameCommit,
  onRenameCancel,
  onMoreClick,
  onPlusClick,
}: {
  label: string
  color: string
  icon?: string
  count?: number
  hasChevron?: boolean
  isExpanded?: boolean
  onToggleExpand?: () => void
  showPlus?: boolean
  showMore?: boolean
  isRenaming?: boolean
  onRenameCommit?: (newLabel: string) => void
  onRenameCancel?: () => void
  onMoreClick?: (anchor: { top: number; left: number; right: number; bottom: number }) => void
  onPlusClick?: () => void
}) {
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [renameValue, setRenameValue] = useState(label)

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(label)
      requestAnimationFrame(() => {
        renameInputRef.current?.focus()
        renameInputRef.current?.select()
      })
    }
  }, [isRenaming, label])

  return (
    <div className="group flex w-full items-center rounded px-2 py-1 text-sm cursor-pointer" onClick={onToggleExpand}>
      <div className="flex flex-1 items-center gap-2.5 min-w-0">
        {hasChevron && (
          <ChevronRight
            className={cn("h-3 w-3 shrink-0 text-text-faint transition-transform duration-200", isExpanded && "rotate-90")}
          />
        )}
        {icon ? (
          <img src={`/icons/${icon}`} alt="" className="h-4 w-4 shrink-0" />
        ) : (
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        )}

        {isRenaming ? (
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onRenameCommit?.(renameValue)
              else if (e.key === "Escape") onRenameCancel?.()
            }}
            onBlur={() => onRenameCommit?.(renameValue)}
            className="min-w-0 flex-1 truncate rounded border border-app-accent/50 bg-surface-2 px-1.5 py-0.5 text-sm text-text outline-none"
          />
        ) : (
          <span className="text-text truncate">{label}</span>
        )}

        {!isRenaming && count !== undefined && <span className="text-[11px] text-text-faint tabular-nums">{count}</span>}
      </div>

      {!isRenaming && (showPlus || showMore) && (
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
          {showPlus && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onPlusClick?.()
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          )}
          {showMore && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                onMoreClick?.({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom })
              }}
              className="flex h-6 w-6 items-center justify-center rounded text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
