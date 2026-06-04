"use client"

import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  type ComponentType,
  type ReactNode,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from "react"
import { createPortal } from "react-dom"
import { format, startOfDay, addDays } from "date-fns"
import { motion, AnimatePresence, MotionConfig, useReducedMotion, type Variants } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Check,
  MoreHorizontal,
  Tag,
  Calendar as CalendarIcon,
  User,
  Layers,
} from "lucide-react"
import { Calendar } from "@/components/ui/calendar"
import { whenInlineCalendarFormatters } from "@/components/cadence/task-editor-modal"
import {
  QUICK_WHEN_OPTIONS,
  PICK_DATE_ICON,
  whenPickRowLabel,
} from "@/components/cadence/schedule-when-shared"
import type { Task } from "@/app/page"
import { formatAssigneeLabel, isAssignedDesignee } from "@/components/cadence/assignee-utils"
import type { CanvasProject } from "./canvas-board"
import { AgendaView } from "./agenda-view"
import { IconTooltipButton } from "./icon-tooltip-button"
import { ProjectActionsDropdown } from "./canvas-sidebar"
import { ProjectItem } from "./project-item"
import { AddProjectPopover } from "./add-project-popover"
import { SidebarCollapseLabel, SidebarCollapseRegion } from "./sidebar-collapse-fade"
import { bucketForSchedulePickedDate } from "./picked-due-bucket"
import {
  CADENCE_EASE_OUT,
  CADENCE_EASE_OUT_CSS,
  CONTEXT_MENU_CLOSE_MS,
  CONTEXT_MENU_OPEN_MS,
  emilSidebarPanelProps,
  emilSidebarTransition,
} from "@/lib/cadence-motion"
import {
  getContextMenuSurfaceStyle,
  useFloatingMenuEnterVisible,
  useContextMenuRequestClose,
  runAfterContextMenuExit,
} from "@/components/cadence/floating-menu-portal"
import { SidebarDisclosure } from "@/components/cadence/sidebar-disclosure"

const scheduledGroups = [
  { label: "Due today", color: "#f97316", icon: "due-today.svg" },
  { label: "Due tomorrow", color: "#3b82f6", icon: "due-tomorrow.svg" },
  { label: "Due Soon", color: "#a855f7", icon: "due-soon.svg" },
  { label: "Overdue", color: "#ef4444", icon: "overdue.svg" },
]

/** Picked due date in the past → Overdue bucket; used for drag eligibility. */
function taskBelongsToOverdueBucket(t: Task): boolean {
  if (t.completed) return false
  if (t.schedule === "picked" && t.schedulePickedDate) {
    return bucketForSchedulePickedDate(t.schedulePickedDate) === "overdue"
  }
  return false
}

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
  tasks = [],
  projects = [],
  onToggleComplete,
  onUpdateTask,
  onDeleteTask,
  onQuickAddTask,
  onDragTaskStart,
  onDragTaskEnd,
  sidebarView,
  onSidebarModeClick,
  onAddProject,
  onUpdateProject,
  onDeleteProject,
  selectedTaskIds,
  onSidebarTaskRowClick,
  onSidebarTasksTabChange,
}: {
  collapsed: boolean
  tasks?: Task[]
  projects?: CanvasProject[]
  onToggleComplete?: (id: string) => void
  onUpdateTask?: (id: string, updates: Partial<Task>) => void
  onDeleteTask?: (id: string) => void
  onQuickAddTask?: (preset: {
    tag?: string
    date?: Date
    schedule?: string
    projectId?: string
  }) => void
  onDragTaskStart?: (task: Task) => void
  onDragTaskEnd?: () => void
  sidebarView: "tasks" | "agenda"
  onSidebarModeClick: (view: "tasks" | "agenda" | "canvas") => void
  onAddProject?: (name: string, color: string) => void
  onUpdateProject?: (projectId: string, updates: Partial<CanvasProject>) => void
  onDeleteProject?: (projectId: string) => void
  selectedTaskIds?: readonly string[]
  onSidebarTaskRowClick?: (taskId: string, e: ReactMouseEvent, tab: "all" | "completed") => void
  onSidebarTasksTabChange?: () => void
}) {
  const [activeTab, setActiveTab] = useState<"all" | "completed">("all")
  const [projectsOpen, setProjectsOpen] = useState(true)

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const toggleProject = useCallback((key: string) => {
    setExpandedProjects((prev) => ({ ...prev, [key]: !prev[key] }))
  }, [])

  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [addProjectPos, setAddProjectPos] = useState<{ top: number; left: number } | null>(null)
  const addProjectBtnRef = useRef<HTMLButtonElement>(null)

  const [projectActionsDropdown, setProjectActionsDropdown] = useState<{
    projectId: string
    anchor: { top: number; left: number; right: number; bottom: number }
  } | null>(null)

  const [renamingProjectId, setRenamingProjectId] = useState<string | null>(null)
  const [renameProjectValue, setRenameProjectValue] = useState("")
  const renameProjectInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!renamingProjectId) return
    const proj = projects.find((p) => p.id === renamingProjectId)
    setRenameProjectValue(proj?.name ?? "")
    requestAnimationFrame(() => {
      renameProjectInputRef.current?.focus()
      renameProjectInputRef.current?.select()
    })
  }, [renamingProjectId, projects])

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
      onUpdateProject?.(projectId, { name: trimmed })
      setRenamingProjectId(null)
    },
    [onUpdateProject, projects]
  )

  const buckets = useMemo(() => {
    const today = startOfDay(new Date())

    const overdue: Task[] = []
    const dueToday: Task[] = []
    const dueTomorrow: Task[] = []
    const dueSoon: Task[] = []

    for (const t of tasks) {
      if (t.completed) continue

      // Overdue: explicit picked date before today (due-intent only)
      if (taskBelongsToOverdueBucket(t)) {
        overdue.push(t)
        continue
      }

      const hasTime = t.startMinutes != null && t.endMinutes != null

      if (!hasTime) {
        const s = t.schedule
        if (s === "anytime" || !s) {
          // No sidebar group for unscheduled — task stays in app state only.
          continue
        } else if (s === "today") {
          dueToday.push(t)
        } else if (s === "tomorrow") {
          dueTomorrow.push(t)
        } else if (s === "next-week") {
          dueSoon.push(t)
        } else if (s === "picked" && t.schedulePickedDate) {
          switch (bucketForSchedulePickedDate(t.schedulePickedDate)) {
            case "overdue":
              overdue.push(t)
              break
            case "dueToday":
              dueToday.push(t)
              break
            case "dueTomorrow":
              dueTomorrow.push(t)
              break
            case "dueSoon":
              dueSoon.push(t)
              break
          }
        } else {
          dueSoon.push(t)
        }
        continue
      }

      const s = t.schedule
      if (s === "today") {
        dueToday.push(t)
        continue
      }
      if (s === "tomorrow") {
        dueTomorrow.push(t)
        continue
      }
      if (s === "next-week" || s === "anytime") {
        dueSoon.push(t)
        continue
      }
      if (s === "picked") {
        const pd = t.schedulePickedDate
        if (pd) {
          switch (bucketForSchedulePickedDate(pd)) {
            case "overdue":
              overdue.push(t)
              break
            case "dueToday":
              dueToday.push(t)
              break
            case "dueTomorrow":
              dueTomorrow.push(t)
              break
            case "dueSoon":
              dueSoon.push(t)
              break
          }
        } else {
          dueSoon.push(t)
        }
        continue
      }
      dueSoon.push(t)
    }

    return { overdue, dueToday, dueTomorrow, dueSoon }
  }, [tasks])

  const todayStart = useMemo(() => startOfDay(new Date()), [])
  const handleQuickAddFromScheduledGroup = useCallback(
    (label: string) => {
      // When / due-intent presets for the task editor (not calendar placement).
      if (label === "Due today") {
        onQuickAddTask?.({ date: todayStart, schedule: "today" })
      } else if (label === "Due tomorrow") {
        onQuickAddTask?.({ date: addDays(todayStart, 1), schedule: "tomorrow" })
      } else if (label === "Due Soon") {
        onQuickAddTask?.({ schedule: "next-week" })
      }
    },
    [onQuickAddTask, todayStart]
  )

  const bucketMap: Record<string, Task[]> = {
    Overdue: buckets.overdue,
    "Due today": buckets.dueToday,
    "Due tomorrow": buckets.dueTomorrow,
    "Due Soon": buckets.dueSoon,
  }

  const projectTaskMap = useMemo(() => {
    const map: Record<string, Task[]> = {}
    for (const t of tasks) {
      if (t.completed) continue
      const pid = (t.projectId ?? "general").trim() || "general"
      if (!map[pid]) map[pid] = []
      map[pid].push(t)
    }
    return map
  }, [tasks])

  const projectById = useMemo(() => {
    const map = new Map<string, CanvasProject>()
    for (const p of projects) map.set(p.id, p)
    return map
  }, [projects])

  const completedTasks = useMemo(() => tasks.filter((t) => t.completed), [tasks])

  const [taskDropdown, setTaskDropdown] = useState<{
    taskId: string
    anchor: { top: number; left: number; right: number; bottom: number }
  } | null>(null)

  useEffect(() => {
    if (!collapsed) return
    setTaskDropdown(null)
    setAddProjectOpen(false)
    setProjectActionsDropdown(null)
  }, [collapsed])

  const activeDropdownTask = useMemo(
    () => (taskDropdown ? tasks.find((t) => t.id === taskDropdown.taskId) : null),
    [taskDropdown, tasks]
  )

  const shouldReduceMotion = useReducedMotion()
  const emilTransition = useMemo(
    () => emilSidebarTransition(shouldReduceMotion),
    [shouldReduceMotion]
  )
  const tasksPanelProps = useMemo(
    () => emilSidebarPanelProps("left", shouldReduceMotion),
    [shouldReduceMotion]
  )
  const agendaPanelProps = useMemo(
    () => emilSidebarPanelProps("right", shouldReduceMotion),
    [shouldReduceMotion]
  )
  const allTabPanelProps = useMemo(
    () => emilSidebarPanelProps("left", shouldReduceMotion),
    [shouldReduceMotion]
  )
  const completedTabPanelProps = useMemo(
    () => emilSidebarPanelProps("right", shouldReduceMotion),
    [shouldReduceMotion]
  )
  const sidebarExpanded = !collapsed
  return (
    <div
      className="relative h-full min-h-0 w-full overflow-hidden"
      aria-hidden={collapsed}
    >
      {/* Animated content area */}
      <div className="relative h-full min-h-0 overflow-hidden">
        <MotionConfig transition={emilTransition}>
        <AnimatePresence initial={false} mode="popLayout">
          {sidebarView === "tasks" ? (
            <motion.div
              key="tasks"
              {...tasksPanelProps}
              className="absolute inset-0 flex flex-col overflow-hidden"
            >
              {/* All/Completed tabs */}
              <SidebarCollapseRegion expanded={sidebarExpanded} className="shrink-0 px-3 pb-2">
                <div className="flex rounded-[8px] bg-calendar-bg p-0.5">
                  {(
                    [
                      { value: "all" as const, label: "All" },
                      { value: "completed" as const, label: "Completed" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      aria-pressed={activeTab === tab.value}
                      onClick={() => {
                        if (activeTab === tab.value) return
                        setActiveTab(tab.value)
                        onSidebarTasksTabChange?.()
                      }}
                      className={cn(
                        "relative flex-1 rounded-[6px] px-3 py-1.5 text-xs font-medium transition-colors",
                        activeTab === tab.value ? "text-text" : "text-text-muted"
                      )}
                    >
                      {activeTab === tab.value && (
                        <motion.div
                          layoutId="task-filter-tab-indicator"
                          className="absolute inset-0 rounded-[6px] bg-background"
                          transition={
                            shouldReduceMotion
                              ? { duration: 0 }
                              : { type: "spring", duration: 0.2, bounce: 0 }
                          }
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  ))}
                </div>
              </SidebarCollapseRegion>

              <div className="relative min-h-0 flex-1 overflow-hidden">
                <AnimatePresence initial={false} mode="popLayout">
                  {activeTab === "all" ? (
                    <motion.div
                      key="sidebar-tab-all"
                      {...allTabPanelProps}
                      className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
                      role="listbox"
                      aria-label="Tasks"
                      aria-multiselectable="true"
                    >
              {/* Scheduled groups */}
              <SidebarCollapseRegion expanded={sidebarExpanded} className="px-1.5 py-3">
                {scheduledGroups.map((group) => {
                  const groupTasks = bucketMap[group.label] ?? []
                  const count = groupTasks.length
                  const isExpanded = expandedGroups[group.label] ?? false
                  return (
                    <div key={group.label}>
                      <SidebarItem
                        label={group.label}
                        expanded={sidebarExpanded}
                        color={group.color}
                        icon={group.icon}
                        count={count > 0 ? count : undefined}
                        hasChevron
                        isExpanded={isExpanded}
                        onToggleExpand={count > 0 ? () => toggleGroup(group.label) : undefined}
                        showPlus={group.label !== "Overdue"}
                        onPlusClick={() => handleQuickAddFromScheduledGroup(group.label)}
                      />
                      <SidebarDisclosure show={isExpanded && count > 0} motionKey={`sched-${group.label}-tasks`}>
                        {groupTasks.map((t) => (
                          <TaskRow
                            key={t.id}
                            task={t}
                            selected={selectedTaskIds?.includes(t.id) ?? false}
                            onRowClick={(e) => onSidebarTaskRowClick?.(t.id, e, "all")}
                            onToggleComplete={() => onToggleComplete?.(t.id)}
                            onMoreClick={(anchor) => setTaskDropdown({ taskId: t.id, anchor })}
                            isDraggable={group.label !== "Overdue"}
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
                      </SidebarDisclosure>
                    </div>
                  )
                })}
              </SidebarCollapseRegion>


              {/* Projects section */}
              <SidebarCollapseRegion
                expanded={sidebarExpanded}
                className="flex-1 overflow-y-auto px-1.5 py-3"
              >
                <div className="group/projects mb-0.5 flex w-full items-center px-2">
                  <button
                    onClick={() => setProjectsOpen(!projectsOpen)}
                    className="flex flex-1 items-center gap-1.5 text-[13px] font-medium text-text/60 transition-colors duration-[200ms] ease-[var(--cadence-ease-slide)] hover:text-text/90"
                  >
                    <ChevronRight
                      className={cn(
                        "h-2.5 w-2.5 transition-transform duration-[200ms] ease-[var(--cadence-ease-slide)] motion-reduce:transition-none",
                        projectsOpen && "rotate-90"
                      )}
                    />
                    <SidebarCollapseLabel
                      expanded={sidebarExpanded}
                      className="text-[13px] font-medium text-text/60 transition-colors duration-[200ms] ease-[var(--cadence-ease-slide)] group-hover/projects:text-text/90"
                    >
                      Projects
                    </SidebarCollapseLabel>
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

                <SidebarDisclosure
                  show={projectsOpen}
                  motionKey="sidebar-projects-section"
                  indented={false}
                  innerClassName="mt-0.5"
                >
                  {projects.map((project) => {
                    const projectTasks = projectTaskMap[project.id] ?? []
                    const count = projectTasks.length
                    const isExpanded = expandedProjects[project.id] ?? false
                    const isRenaming = renamingProjectId === project.id
                    return (
                      <div key={project.id}>
                        <ProjectItem
                          label={project.name}
                          expanded={sidebarExpanded}
                          color={project.color}
                          count={count > 0 ? count : undefined}
                          hasChevron
                          isExpanded={isExpanded}
                          onToggleExpand={count > 0 ? () => toggleProject(project.id) : undefined}
                          isRenaming={isRenaming}
                          renameValue={renameProjectValue}
                          renameInputRef={renameProjectInputRef}
                          onRenameChange={setRenameProjectValue}
                          onRenameCommit={(value) => commitProjectRename(project.id, value)}
                          onRenameCancel={() => setRenamingProjectId(null)}
                          onPlusClick={() => {
                            onQuickAddTask?.({ projectId: project.id })
                          }}
                          onMoreClick={(anchor) => {
                            setProjectActionsDropdown({ projectId: project.id, anchor })
                          }}
                        />
                        <SidebarDisclosure show={isExpanded && count > 0} motionKey={`project-${project.id}-tasks`}>
                          {projectTasks.map((t) => (
                            <TaskRow
                              key={t.id}
                              task={t}
                              selected={selectedTaskIds?.includes(t.id) ?? false}
                              onRowClick={(e) => onSidebarTaskRowClick?.(t.id, e, "all")}
                              onToggleComplete={() => onToggleComplete?.(t.id)}
                              onMoreClick={(anchor) => setTaskDropdown({ taskId: t.id, anchor })}
                              isDraggable={!taskBelongsToOverdueBucket(t)}
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
                        </SidebarDisclosure>
                      </div>
                    )
                  })}
                </SidebarDisclosure>
              </SidebarCollapseRegion>

              {addProjectOpen && addProjectPos && onAddProject && (
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

              {projectActionsDropdown && projects.length > 0 && (() => {
                const project = projects.find((p) => p.id === projectActionsDropdown.projectId)
                if (!project) return null
                const count = projectTaskMap[project.id]?.length ?? 0
                return (
                  <ProjectActionsDropdown
                    anchor={projectActionsDropdown.anchor}
                    currentColor={project.color}
                    deleteDisabled
                    onClose={() => setProjectActionsDropdown(null)}
                    onColorChange={(color) => {
                      onUpdateProject?.(project.id, { color })
                    }}
                    onRename={() => {
                      requestAnimationFrame(() => setRenamingProjectId(project.id))
                    }}
                    onDelete={() => {
                      onDeleteProject?.(project.id)
                    }}
                  />
                )
              })()}
                    </motion.div>
                  ) : (
                    <motion.div
                      key="sidebar-tab-completed"
                      {...completedTabPanelProps}
                      className="absolute inset-0 flex min-h-0 flex-col overflow-hidden"
                      role="listbox"
                      aria-label="Completed tasks"
                      aria-multiselectable="true"
                    >
                      {completedTasks.length === 0 ? (
                        <SidebarCollapseRegion expanded={sidebarExpanded}>
                          <CompletedEmptyState />
                        </SidebarCollapseRegion>
                      ) : (
                        <SidebarCollapseRegion
                          expanded={sidebarExpanded}
                          className="flex flex-1 flex-col overflow-y-auto px-1.5 py-3"
                        >
                          <div className="space-y-1 pl-0 pr-1.5">
                            {completedTasks.map((t) => (
                              <TaskRow
                                key={t.id}
                                task={t}
                                selected={selectedTaskIds?.includes(t.id) ?? false}
                                onRowClick={(e) => onSidebarTaskRowClick?.(t.id, e, "completed")}
                                onToggleComplete={() => onToggleComplete?.(t.id)}
                                onMoreClick={(anchor) => setTaskDropdown({ taskId: t.id, anchor })}
                                isDraggable={false}
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
                        </SidebarCollapseRegion>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {taskDropdown && activeDropdownTask && (
                <TaskActionsDropdown
                  task={activeDropdownTask}
                  anchor={taskDropdown.anchor}
                  projects={projects}
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
              {...agendaPanelProps}
              className="absolute inset-0 overflow-hidden"
            >
              <AgendaView
                collapsed={collapsed}
                tasks={tasks}
                projects={projects}
                onQuickAddTask={onQuickAddTask}
              />
            </motion.div>
          )}
        </AnimatePresence>
        </MotionConfig>
      </div>
    </div>
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
  const reduceMotion = useReducedMotion() ?? false
  const [visible, setVisible] = useFloatingMenuEnterVisible(reduceMotion)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestClose = useContextMenuRequestClose(onClose, setVisible, reduceMotion)

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) requestClose()
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClick)
    }
  }, [requestClose])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [requestClose])

  const handleSubmit = () => {
    const trimmed = name.trim()
    if (!trimmed) return setError("Name required")
    if (existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase())) return setError("Category already exists")
    onCreate(trimmed, color)
  }

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[100] w-[200px] rounded-xl border border-border/50 bg-background p-3 shadow-lg motion-reduce:transition-none"
      style={{
        top: pos.top,
        left: pos.left,
        ...getContextMenuSurfaceStyle({
          visible,
          transformOrigin: "top left",
          reduceMotion,
        }),
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
        {error && <p className="mt-1.5 text-[10px] text-destructive-text">{error}</p>}
      </div>

      <div className="mb-3">
        <p className="mb-2 text-[10px] font-medium text-text-faint">Color</p>
        <ColorSwatchGrid value={color} onChange={setColor} />
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={requestClose}
          className="rounded px-3 py-1.5 text-xs font-medium text-text-muted transition-colors duration-300 ease-in-out hover:bg-surface-2 hover:text-text"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          className="rounded bg-app-accent px-3 py-1.5 text-xs font-medium text-app-accent-foreground transition-[filter,transform] duration-200 ease-out hover:brightness-110 active:scale-[0.97]"
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
  const reduceMotion = useReducedMotion() ?? false
  const [visible, setVisible] = useFloatingMenuEnterVisible(reduceMotion)
  const popoverRef = useRef<HTMLDivElement>(null)
  const requestClose = useContextMenuRequestClose(onClose, setVisible, reduceMotion)

  const fitsRight = anchor.right + GAP + DROPDOWN_WIDTH <= window.innerWidth - GAP
  const computedLeft = fitsRight ? anchor.right + GAP : anchor.left - DROPDOWN_WIDTH - GAP
  const computedTop = anchor.top
  const origin = fitsRight ? "top left" : "top right"

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) requestClose()
    }
    const timer = setTimeout(() => document.addEventListener("mousedown", handleClick), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener("mousedown", handleClick)
    }
  }, [requestClose])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [requestClose])

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[100] w-[200px] rounded-xl border border-border/50 bg-background p-3 shadow-lg motion-reduce:transition-none"
      style={{
        top: computedTop,
        left: computedLeft,
        ...getContextMenuSurfaceStyle({ visible, transformOrigin: origin, reduceMotion }),
      }}
    >
      <div className="mb-3">
        <ColorSwatchGrid value={currentColor} onChange={onColorChange} />
      </div>

      <div className="my-1.5 h-px bg-border/20" />

      <button
        onClick={() =>
          runAfterContextMenuExit(reduceMotion, setVisible, () => {
            onRename()
            onClose()
          })
        }
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-xs text-text transition-[background-color,color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-surface-2"
      >
        <Pencil className="h-3 w-3 text-text-muted" />
        Rename
      </button>

      <button
        onClick={() =>
          runAfterContextMenuExit(reduceMotion, setVisible, () => {
            onDelete()
            onClose()
          })
        }
        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-xs text-destructive-text transition-[background-color,color] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:bg-destructive/10"
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
    <div className="flex flex-col gap-1">
      {[row1, row2].map((row, ri) => (
        <div key={ri} className="flex items-center gap-1">
          {row.map((c) => {
            const isSelected = c === value
            return (
              <button
                key={c}
                onClick={() => onChange(c)}
                className={cn(
                  // Swatch: smaller, squarer, rounded-[4px], compact, subtle hover scale, smooth transition
                  "relative flex h-4 w-4 items-center justify-center rounded-[4px] transform-gpu transition-transform duration-200 ease-[cubic-bezier(0.4,0,0.2,1)] hover:scale-[1.08]",
                  isSelected
                    ? "ring-2 ring-white/90 ring-offset-2 ring-offset-background"
                    : "hover:ring-1 hover:ring-white/10 hover:ring-offset-1 hover:ring-offset-background"
                )}
                style={{ backgroundColor: c }}
              >
                {isSelected && (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Check className="h-3 w-3 text-white drop-shadow-sm pointer-events-none" />
                  </span>
                )}
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

/** Task-actions side submenu: clipped viewport + direction-aware paired enter/exit (`y` + opacity on inner). */
const TASK_ACTIONS_SUBMENU_GAP = 6
const TASK_ACTIONS_SUBMENU_CONTENT_EXIT_MS = CONTEXT_MENU_CLOSE_MS
const TASK_ACTIONS_SUBMENU_CONTENT_ENTER_DELAY_MS = 0
const TASK_ACTIONS_SUBMENU_CONTENT_ENTER_MS = CONTEXT_MENU_OPEN_MS
const TASK_ACTIONS_SUBMENU_SHELL_LAYOUT_MS = CONTEXT_MENU_OPEN_MS
const TASK_ACTIONS_SUBMENU_CONTENT_TRANSLATE_PX = 12

const TASK_SUBMENU_CONTENT_EASE = [...CADENCE_EASE_OUT] as [number, number, number, number]

function taskSubmenuAnimationOrder(key: string): number {
  switch (key) {
    case "priority":
      return 0
    case "project":
      return 1
    case "schedule-options":
      return 2
    case "schedule-calendar":
      return 3
    default:
      return 0
  }
}

function taskSubmenuInnerVariants(reduceMotion: boolean, offset: number): Variants {
  if (reduceMotion) {
    return {
      initial: { opacity: 1, y: 0, zIndex: 2 },
      animate: { opacity: 1, y: 0, zIndex: 2, transition: { duration: 0 } },
      exit: { opacity: 1, y: 0, zIndex: 1, transition: { duration: 0 } },
    }
  }
  const exitTransition = {
    duration: TASK_ACTIONS_SUBMENU_CONTENT_EXIT_MS / 1000,
    ease: TASK_SUBMENU_CONTENT_EASE,
  }
  const enterTransition = {
    duration: TASK_ACTIONS_SUBMENU_CONTENT_ENTER_MS / 1000,
    delay: TASK_ACTIONS_SUBMENU_CONTENT_ENTER_DELAY_MS / 1000,
    ease: TASK_SUBMENU_CONTENT_EASE,
  }
  return {
    initial: (dir: number) => ({
      opacity: 0,
      y: dir * offset,
      zIndex: 2,
      pointerEvents: "auto" as const,
    }),
    animate: {
      opacity: 1,
      y: 0,
      zIndex: 2,
      pointerEvents: "auto" as const,
      transition: enterTransition,
    },
    exit: (dir: number) => ({
      opacity: 0,
      y: -dir * offset,
      zIndex: 1,
      pointerEvents: "none" as const,
      transition: exitTransition,
    }),
  }
}

/**
 * Single portaled shell while `openSub` is set. Shell: floating-menu enter once + layout morph (top/left/width/height).
 * Inner: AnimatePresence pairs exit/enter on `animationKey` (translateY + opacity, no scale).
 */
function TaskActionsSubmenuShell({
  anchor,
  submenuWidth,
  reduceMotion,
  submenuRef,
  onMouseEnter,
  onMouseLeave,
  animationKey,
  children,
}: {
  anchor: { top: number; right: number; left: number }
  submenuWidth: number
  reduceMotion: boolean
  submenuRef?: RefObject<HTMLDivElement | null>
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  /** Stable id for direction: priority | project | schedule-options | schedule-calendar */
  animationKey: string
  children: React.ReactNode
}) {
  const fitsRight =
    anchor.right + TASK_ACTIONS_SUBMENU_GAP + submenuWidth <= window.innerWidth - 8
  const left = fitsRight
    ? anchor.right + TASK_ACTIONS_SUBMENU_GAP
    : anchor.left - submenuWidth - TASK_ACTIONS_SUBMENU_GAP
  const top = Math.min(anchor.top, window.innerHeight - 200)

  const [shellVisible] = useFloatingMenuEnterVisible(reduceMotion)
  const prevKeyRef = useRef<string | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const activePanelRef = useRef<HTMLDivElement>(null)
  const lastViewportHeightRef = useRef<number | null>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)

  const shellSurface = getContextMenuSurfaceStyle({
    visible: shellVisible,
    transformOrigin: fitsRight ? "top left" : "top right",
    reduceMotion,
  })

  const layoutTransition = reduceMotion
    ? ""
    : `top ${TASK_ACTIONS_SUBMENU_SHELL_LAYOUT_MS}ms ${CADENCE_EASE_OUT_CSS}, left ${TASK_ACTIONS_SUBMENU_SHELL_LAYOUT_MS}ms ${CADENCE_EASE_OUT_CSS}, width ${TASK_ACTIONS_SUBMENU_SHELL_LAYOUT_MS}ms ${CADENCE_EASE_OUT_CSS}`

  const shellTransition = reduceMotion
    ? shellSurface.transition
    : layoutTransition
      ? `${shellSurface.transition}, ${layoutTransition}`
      : shellSurface.transition

  const prev = prevKeyRef.current
  let transitionDir = 1
  if (prev !== null && prev !== animationKey) {
    const d = taskSubmenuAnimationOrder(animationKey) - taskSubmenuAnimationOrder(prev)
    transitionDir = d >= 0 ? 1 : -1
  }

  useLayoutEffect(() => {
    prevKeyRef.current = animationKey
  }, [animationKey])

  const measureViewport = useCallback(() => {
    const activePanel = activePanelRef.current
    if (!activePanel) return
    const nextHeight = activePanel.getBoundingClientRect().height
    if (nextHeight > 0) {
      lastViewportHeightRef.current = nextHeight
      setViewportHeight(nextHeight)
    }
  }, [])

  useLayoutEffect(() => {
    measureViewport()
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      measureViewport()
      raf2 = requestAnimationFrame(() => measureViewport())
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [animationKey, submenuWidth, measureViewport])

  useEffect(() => {
    const activePanel = activePanelRef.current
    if (!activePanel) return
    const ro = new ResizeObserver(() => measureViewport())
    ro.observe(activePanel)
    return () => ro.disconnect()
  }, [measureViewport, animationKey])

  const innerVariants = useMemo(
    () => taskSubmenuInnerVariants(reduceMotion, TASK_ACTIONS_SUBMENU_CONTENT_TRANSLATE_PX),
    [reduceMotion]
  )

  const resolvedViewportHeight =
    viewportHeight ?? lastViewportHeightRef.current ?? 120

  return createPortal(
    <div
      ref={submenuRef}
      className="fixed z-[102] rounded-xl border border-border/50 bg-background p-1 shadow-lg overflow-hidden"
      style={{
        top,
        left,
        width: submenuWidth,
        opacity: shellSurface.opacity,
        transform: shellSurface.transform,
        transition: shellTransition,
        transformOrigin: shellSurface.transformOrigin,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div
        ref={viewportRef}
        className="relative w-full overflow-hidden"
        style={{
          height: `${resolvedViewportHeight}px`,
          transition: reduceMotion
            ? undefined
            : `height ${TASK_ACTIONS_SUBMENU_SHELL_LAYOUT_MS}ms ${CADENCE_EASE_OUT_CSS}`,
        }}
      >
        <AnimatePresence initial={false} custom={transitionDir} mode="sync">
          <motion.div
            key={animationKey}
            ref={activePanelRef}
            className="absolute left-0 top-0 w-full"
            custom={transitionDir}
            variants={innerVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            onAnimationComplete={measureViewport}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>,
    document.body
  )
}

/** p-1 portaled menus: rounded-lg rows nest inside rounded-xl shell (14px = 10px + 4px padding). */
const CONTEXT_MENU_ROW_ROUNDED = "rounded-lg"

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
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-text transition-colors duration-150 hover:bg-surface-2",
        CONTEXT_MENU_ROW_ROUNDED
      )}
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
  projects,
  onClose,
  onToggleComplete,
  onUpdateTask,
  onDeleteTask,
}: {
  task: Task
  anchor: { top: number; left: number; right: number; bottom: number }
  projects: CanvasProject[]
  onClose: () => void
  onToggleComplete: () => void
  onUpdateTask: (id: string, updates: Partial<Task>) => void
  onDeleteTask: (id: string) => void
}) {
  const DROPDOWN_WIDTH = 200
  const GAP = 8
  const reduceMotion = useReducedMotion() ?? false
  const [visible, setVisible] = useFloatingMenuEnterVisible(reduceMotion)
  const popoverRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const [openSub, setOpenSub] = useState<"priority" | "project" | "schedule" | null>(null)
  const [subAnchor, setSubAnchor] = useState<{ top: number; right: number; left: number } | null>(null)
  const [scheduleMenuView, setScheduleMenuView] = useState<"options" | "calendar">("options")

  const fitsRight = anchor.right + GAP + DROPDOWN_WIDTH <= window.innerWidth - GAP
  const computedLeft = fitsRight ? anchor.right + GAP : anchor.left - DROPDOWN_WIDTH - GAP
  const DROPDOWN_HEIGHT = 260
  const computedTop = Math.min(anchor.top, window.innerHeight - DROPDOWN_HEIGHT - GAP)
  const origin = fitsRight ? "top left" : "top right"

  const closeWithAnimation = useContextMenuRequestClose(onClose, setVisible, reduceMotion)

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

  const handleSubHover = (sub: "priority" | "project" | "schedule", e: React.MouseEvent<HTMLButtonElement>) => {
    const rowRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const dropdownRect = popoverRef.current?.getBoundingClientRect()
    if (dropdownRect) setSubAnchor({ top: rowRect.top, right: dropdownRect.right, left: dropdownRect.left })

    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current)
      leaveTimer.current = null
    }
    if (openTimer.current) clearTimeout(openTimer.current)

    // Hover intent delay only when opening from no submenu; switches are immediate.
    if (openSub === null) {
      openTimer.current = setTimeout(() => setOpenSub(sub), 60)
    } else {
      setOpenSub(sub)
    }
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

  useEffect(() => {
    if (openSub !== "schedule") setScheduleMenuView("options")
  }, [openSub])

  const rowClass = cn(
    "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-text transition-colors duration-150 hover:bg-surface-2",
    CONTEXT_MENU_ROW_ROUNDED
  )

  const taskSubmenuAnimationKey =
    openSub === null
      ? ""
      : openSub === "schedule"
        ? scheduleMenuView === "calendar"
          ? "schedule-calendar"
          : "schedule-options"
        : openSub

  const taskSubmenuWidth =
    openSub === "schedule" && scheduleMenuView === "calendar" ? 280 : 180

  return createPortal(
    <div
      ref={popoverRef}
      className="fixed z-[101] w-[200px] rounded-xl border border-border/50 bg-background p-1 shadow-lg motion-reduce:transition-none"
      style={{
        top: computedTop,
        left: computedLeft,
        ...getContextMenuSurfaceStyle({ visible, transformOrigin: origin, reduceMotion }),
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
        className={cn(rowClass, openSub === "project" && "bg-surface-2")}
        onMouseEnter={(e) => handleSubHover("project", e)}
        onClick={(e) => handleSubHover("project", e)}
      >
        <Layers className="h-3.5 w-3.5 text-text-muted" />
        <span className="flex-1 text-left">Project</span>
        <ChevronRight className="h-3 w-3 text-text-faint" />
      </button>

      <button
        className={cn(rowClass, openSub === "schedule" && "bg-surface-2")}
        onMouseEnter={(e) => handleSubHover("schedule", e)}
        onClick={(e) => handleSubHover("schedule", e)}
      >
        <CalendarIcon className="h-3.5 w-3.5 text-text-muted" />
        <span className="flex-1 text-left">Schedule</span>
        <ChevronRight className="h-3 w-3 text-text-faint" />
      </button>

      <div className="mx-2 my-1 h-px bg-border/20" />


      <button
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-destructive-text transition-colors duration-150 hover:bg-destructive/10",
          CONTEXT_MENU_ROW_ROUNDED
        )}
        onMouseEnter={() => setOpenSub(null)}
        onClick={() => {
          onDeleteTask(task.id)
          closeWithAnimation()
        }}
      >
        <Trash2 className="h-3.5 w-3.5" />
        <span>Delete</span>
      </button>

      {openSub && subAnchor && (
        <TaskActionsSubmenuShell
          anchor={subAnchor}
          submenuWidth={taskSubmenuWidth}
          reduceMotion={reduceMotion}
          submenuRef={submenuRef}
          onMouseEnter={handleContainerEnter}
          onMouseLeave={handleContainerLeave}
          animationKey={taskSubmenuAnimationKey}
        >
          {openSub === "priority" ? (
            <>
              {PRIORITY_OPTIONS.map((opt) => (
                <SubmenuRow
                  key={opt.value}
                  label={opt.label}
                  icon={<PriorityIcon priority={opt.value} className="h-3.5 w-3.5" />}
                  isSelected={task.priority === opt.value}
                  onClick={() => {
                    onUpdateTask(task.id, { priority: opt.value })
                    closeWithAnimation()
                  }}
                />
              ))}
            </>
          ) : openSub === "project" ? (
            <>
              {projects.map((project) => (
                <SubmenuRow
                  key={project.id}
                  label={project.name}
                  icon={
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: project.color ?? "#94a3b8" }}
                    />
                  }
                  isSelected={(task.projectId ?? "general") === project.id}
                  onClick={() => {
                    onUpdateTask(task.id, { projectId: project.id })
                    closeWithAnimation()
                  }}
                />
              ))}
            </>
          ) : (
            <>
              {scheduleMenuView === "options" ? (
                <>
                  {QUICK_WHEN_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text transition-colors hover:bg-surface-2",
                        CONTEXT_MENU_ROW_ROUNDED
                      )}
                      onClick={() => {
                        onUpdateTask(task.id, {
                          schedule: opt.value,
                          schedulePickedDate: undefined,
                        })
                        closeWithAnimation()
                      }}
                    >
                      <img src={`/icons/${opt.icon}`} alt="" className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{opt.label}</span>
                      {task.schedule === opt.value && (
                        <Check className="h-3 w-3 shrink-0 text-text-muted" />
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-xs text-text transition-colors hover:bg-surface-2",
                      CONTEXT_MENU_ROW_ROUNDED
                    )}
                    onClick={() => setScheduleMenuView("calendar")}
                  >
                    <img src={PICK_DATE_ICON} alt="" className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left text-text">
                      {whenPickRowLabel(task.schedule, task.schedulePickedDate)}
                    </span>
                    {task.schedule === "picked" && task.schedulePickedDate ? (
                      <Check className="h-3 w-3 shrink-0 text-text-muted" />
                    ) : null}
                  </button>
                </>
              ) : (
                <div className="px-1 pb-1 pt-0.5">
                  <button
                    type="button"
                    className={cn(
                      "mb-1 flex w-full items-center gap-2 px-2 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface-2 hover:text-text",
                      CONTEXT_MENU_ROW_ROUNDED
                    )}
                    onClick={() => setScheduleMenuView("options")}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <div className="min-w-0" onClick={(e) => e.stopPropagation()}>
                    <Calendar
                      navLayout="around"
                      mode="single"
                      captionLayout="label"
                      formatters={whenInlineCalendarFormatters}
                      selected={
                        task.schedulePickedDate
                          ? new Date(`${task.schedulePickedDate}T12:00:00`)
                          : undefined
                      }
                      onSelect={(date) => {
                        if (date) {
                          onUpdateTask(task.id, {
                            schedule: "picked",
                            schedulePickedDate: format(startOfDay(date), "yyyy-MM-dd"),
                          })
                          setScheduleMenuView("options")
                          closeWithAnimation()
                        }
                      }}
                      defaultMonth={
                        task.schedulePickedDate
                          ? new Date(`${task.schedulePickedDate}T12:00:00`)
                          : new Date()
                      }
                      className="w-full max-w-[min(260px,calc(100vw-2rem))] !bg-transparent !p-0 [--cell-size:2rem]"
                      modifiersClassNames={{
                        today:
                          "[&_button:not([data-selected-single=true])]:bg-app-accent [&_button:not([data-selected-single=true])]:text-white [&_button:not([data-selected-single=true])]:hover:bg-app-accent/90",
                        selected:
                          "[&_button]:z-[1] [&_button]:ring-2 [&_button]:ring-white/25 [&_button]:ring-offset-0",
                      }}
                      classNames={{
                        months: "flex w-full flex-col gap-0",
                        month: "relative w-full gap-1 p-0",
                        month_caption:
                          "relative mb-0 flex h-8 w-full shrink-0 items-center justify-start px-9",
                        caption_label:
                          "w-full text-left text-sm font-semibold tracking-tight text-text",
                        button_previous:
                          "absolute left-0 top-0 z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-md p-0 text-text-muted opacity-80 transition-colors hover:bg-surface-2 hover:opacity-100 aria-disabled:opacity-30",
                        button_next:
                          "absolute right-0 top-0 z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-md p-0 text-text-muted opacity-80 transition-colors hover:bg-surface-2 hover:opacity-100 aria-disabled:opacity-30",
                        month_grid: "w-full border-collapse",
                        weekdays: "mt-0.5 flex w-full",
                        weekday:
                          "flex-1 select-none text-center text-[0.65rem] font-medium uppercase tracking-wide text-text-muted",
                        week: "mt-0.5 flex w-full",
                        day: "relative p-0 text-center text-sm focus-within:relative focus-within:z-20",
                        day_button:
                          "size-8 min-h-8 min-w-8 rounded-md p-0 font-normal text-text hover:bg-surface-2 data-[selected-single=true]:!bg-app-accent data-[selected-single=true]:!text-white data-[selected-single=true]:hover:!bg-app-accent",
                        today: "bg-transparent p-0",
                        selected: "bg-transparent",
                        outside: "text-text-faint opacity-45 aria-selected:opacity-100",
                        disabled: "text-text-faint opacity-30",
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </TaskActionsSubmenuShell>
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

        <p className="mb-1.5 text-balance text-sm font-medium text-text">No completed tasks yet</p>
        <p className="max-w-[220px] text-pretty text-xs leading-relaxed text-text-muted">
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
  projectName,
  selected,
  onRowClick,
  onToggleComplete,
  onMoreClick,
  isDraggable,
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  task: Task
  projectName?: string
  selected?: boolean
  onRowClick?: (e: ReactMouseEvent) => void
  onToggleComplete: () => void
  onMoreClick?: (anchor: { top: number; left: number; right: number; bottom: number }) => void
  isDraggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
  isDragging?: boolean
}) {
  const emptyDragImageRef = useRef<HTMLImageElement | null>(null)
  const [rowHovered, setRowHovered] = useState(false)
  const reduceMotion = useReducedMotion() ?? false

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

  const handleDragStart = (e: DragEvent) => {
    if (e.shiftKey) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData("text/plain", task.id)
    e.dataTransfer.effectAllowed = "move"
    if (emptyDragImageRef.current) {
      e.dataTransfer.setDragImage(emptyDragImageRef.current, 0, 0)
    }
    onDragStart?.()
  }

  return (
    <div
      role="option"
      aria-selected={selected || undefined}
      className={cn(
        "group/task box-border flex w-full max-w-full min-w-0 items-start gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-150 hover:bg-surface-2/30",
        isDraggable && "cursor-grab active:cursor-grabbing",
        /** `ring-inset` keeps the ring inside the box so `overflow-hidden` on `SidebarDisclosure` does not clip it. */
        selected && "bg-surface-2/30 ring-1 ring-inset ring-border/30"
      )}
      draggable={isDraggable ?? false}
      onClick={(e) => onRowClick?.(e)}
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
      onDragStart={isDraggable ? handleDragStart : undefined}
      onDragEnd={isDraggable ? onDragEnd : undefined}
    >
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          onToggleComplete()
        }}
        className={cn(
          "relative mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-[background-color,border-color] duration-200 after:absolute after:top-1/2 after:left-1/2 after:size-8 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']",
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
              <CalendarIcon className="h-3 w-3 text-chart-1" />
              <span className="text-[10px] text-text-faint">{dueDateFormatted}</span>
            </div>
          )}

          {projectName && (
            <div className="group/chip relative flex items-center justify-center rounded bg-surface-2/60 px-1.5 py-0.5 gap-1">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: task.tagColor ?? "#94a3b8" }}
              />
              <span className="text-[10px] text-text-faint truncate">
                {projectName}
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

          {isAssignedDesignee(task.assignee) && (
            <div className="group/chip relative flex items-center justify-center rounded bg-surface-2/60 p-1">
              <User className="h-3 w-3 text-text-faint" aria-hidden />
              <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-text opacity-0 shadow-md transition-opacity duration-150 group-hover/chip:opacity-100">
                {formatAssigneeLabel(task.assignee)}
              </span>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {rowHovered && onMoreClick ? (
          <motion.button
            type="button"
            initial={
              reduceMotion ? false : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
            }
            animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
            exit={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.25, filter: "blur(4px)" }
            }
            transition={
              reduceMotion ? { duration: 0 } : { type: "spring", duration: 0.3, bounce: 0 }
            }
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
              onMoreClick?.({ top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom })
            }}
            className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-muted transition-[background-color,color] duration-150 hover:bg-surface-2 hover:text-text after:absolute after:top-1/2 after:left-1/2 after:size-10 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

function SidebarItem({
  label,
  expanded = true,
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
  expanded?: boolean
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
            className={cn(
              "h-3 w-3 shrink-0 text-text-faint transition-transform duration-200 ease-[var(--cadence-ease-slide)] motion-reduce:transition-none",
              isExpanded && "rotate-90"
            )}
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
          <SidebarCollapseLabel expanded={expanded} className="text-text truncate">
            {label}
          </SidebarCollapseLabel>
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
