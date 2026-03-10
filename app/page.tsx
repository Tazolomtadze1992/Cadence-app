"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { startOfWeek, addDays, addWeeks, startOfDay, format } from "date-fns"
import { AppSidebar } from "@/components/chrono/sidebar"
import { TopBar, type AppMode } from "@/components/chrono/top-bar"
import { AccountPanel } from "@/components/chrono/account-panel"
import { CalendarGrid } from "@/components/chrono/calendar-grid"
import { CommandBar } from "@/components/chrono/command-bar"
import { CanvasBoard, type CanvasItem, type CanvasProject } from "@/components/chrono/canvas-board"
import { CanvasSidebar } from "../components/chrono/canvas-sidebar"
import { CanvasCommandBar } from "@/components/chrono/canvas-command-bar"
import { SEED_TAGS } from "@/components/chrono/task-editor-modal"
import type { DragCreatePayload, EventMovePayload, EventResizePayload, SidebarTaskDropPayload } from "@/components/chrono/calendar-grid"
import type { TaskEditorInitialData, TaskEditorSaveData, EditingTaskData } from "@/components/chrono/task-editor-modal"

export interface Task {
  id: string
  dayIndex: number
  startMinutes?: number
  endMinutes?: number
  title: string
  tag: string
  tagColor: string
  projectId?: string
  priority: string
  repeat: string
  schedule: string
  completed: boolean
  dueDate: string // ISO date string for easy comparison
}

const INITIAL_CANVAS_PROJECTS: CanvasProject[] = [
  {
    id: "general",
    name: "General",
    color: "#94a3b8",
    items: [],
  },
  {
    id: "p1",
    name: "Ambient UI",
    color: "#f97316",
    items: [
      {
        id: "n1",
        type: "note",
        x: 220,
        y: 160,
        width: 260,
        title: "What is this?",
        body: "A calm canvas for thinking about product work.\nCollect references, jot down ideas, and arrange them freely.",
      },
      {
        id: "n2",
        type: "note",
        x: 560,
        y: 420,
        width: 260,
        title: "Project focus",
        body: "• Ambient, minimal UI\n• Feels spacious and unhurried\n• Great for early-stage exploration",
      },
      {
        id: "i1",
        type: "image",
        x: 620,
        y: 120,
        width: 320,
        height: 420,
        src: "https://images.pexels.com/photos/8436236/pexels-photo-8436236.jpeg?auto=compress&cs=tinysrgb&w=1200",
        alt: "Soft gradient light",
      },
      {
        id: "i2",
        type: "image",
        x: 1040,
        y: 360,
        width: 360,
        height: 260,
        src: "https://images.pexels.com/photos/4993145/pexels-photo-4993145.jpeg?auto=compress&cs=tinysrgb&w=1200",
        alt: "Organic shapes",
      },
    ],
  },
  {
    id: "p2",
    name: "Research notes",
    color: "#3b82f6",
    items: [
      {
        id: "n3",
        type: "note",
        x: 260,
        y: 220,
        width: 280,
        title: "Questions",
        body: "• How do people plan visually?\n• What feels calm versus busy?\n• Which interactions are essential?",
      },
    ],
  },
]

const STORAGE_KEYS = {
  tasks: "cadence_tasks",
  canvasProjects: "cadence_canvas_projects",
  activeProjectId: "cadence_active_project_id",
  appMode: "cadence_app_mode",
  sidebarView: "cadence_sidebar_view",
} as const

const sidebarShellSlideVariants = {
  enter: (direction: 1 | -1) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: 1 | -1) => ({
    x: direction > 0 ? "-100%" : "100%",
    opacity: 0,
  }),
}

const sidebarShellSlideTransition = {
  duration: 0.2,
  ease: [0.2, 0.8, 0.2, 1] as const,
}

// Chrono App
export default function ChronoApp() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [pendingOpen, setPendingOpen] = useState<TaskEditorInitialData | null>(null)
  const [editingTask, setEditingTask] = useState<EditingTaskData | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date())
  const [draggingSidebarTask, setDraggingSidebarTask] = useState<Task | null>(null)
  const [accountPanelOpen, setAccountPanelOpen] = useState(false)
  const [appMode, setAppMode] = useState<AppMode>("schedule")
  const [sidebarView, setSidebarView] = useState<"tasks" | "agenda">("tasks")
  const [canvasProjects, setCanvasProjects] = useState<CanvasProject[]>(INITIAL_CANVAS_PROJECTS)
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    INITIAL_CANVAS_PROJECTS.length ? INITIAL_CANVAS_PROJECTS[0].id : null
  )
  const [canvasAutoEditNoteId, setCanvasAutoEditNoteId] = useState<string | null>(null)
  const [canvasViewport, setCanvasViewport] = useState<{
    scrollLeft: number
    scrollTop: number
    clientWidth: number
    clientHeight: number
  } | null>(null)
  const [sidebarShellDirection, setSidebarShellDirection] = useState<1 | -1>(1)

  const weekStart = useMemo(() => startOfWeek(anchorDate, { weekStartsOn: 0 }), [anchorDate])

  const tasksWithProjectIdentity = useMemo(() => {
    const byId = new Map(canvasProjects.map((p) => [p.id, p] as const))
    return tasks.map((t) => {
      const pid = (t.projectId ?? "general").trim() || "general"
      const project = byId.get(pid) ?? byId.get("general") ?? null
      return {
        ...t,
        tagColor: project?.color ?? t.tagColor ?? "#94a3b8",
        projectName: project?.name,
      }
    })
  }, [canvasProjects, tasks])

  const taskCountByProjectId = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const t of tasks) {
      const pid = (t.projectId ?? "general").trim() || "general"
      counts[pid] = (counts[pid] ?? 0) + 1
    }
    return counts
  }, [tasks])

  // ─── Hydrate state from localStorage on first mount ─────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return

    const ensureGeneralProject = (projects: CanvasProject[]) => {
      if (projects.some((p) => p.id === "general")) return projects
      return [
        {
          id: "general",
          name: "General",
          icon: "folder",
          color: "#94a3b8",
          items: [],
        },
        ...projects,
      ]
    }

    const readJsonArray = <T,>(key: string): T[] | null => {
      try {
        const raw = window.localStorage.getItem(key)
        if (!raw) return null
        const parsed = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as T[]) : null
      } catch {
        return null
      }
    }

    const storedTasks = readJsonArray<Task>(STORAGE_KEYS.tasks) ?? null
    const storedProjects = readJsonArray<CanvasProject>(STORAGE_KEYS.canvasProjects) ?? null

    // Start from stored values if present, otherwise from seeds, and ensure a default color.
    let nextProjects = ensureGeneralProject(storedProjects ?? INITIAL_CANVAS_PROJECTS).map((p) => ({
      ...p,
      color: p.color ?? "#94a3b8",
    })) as CanvasProject[]
    let nextTasks = (storedTasks ?? []) as Task[]

    // Migrate legacy tag-based tasks → projectId
    if (nextTasks.length > 0) {
      const nameToProjectId = new Map(
        nextProjects.map((p) => [p.name.trim().toLowerCase(), p.id] as const)
      )

      const maybeCreateProjectFromTag = (tagName: string, color?: string) => {
        const key = tagName.trim().toLowerCase()
        const existing = nameToProjectId.get(key)
        if (existing) return existing
        const id = crypto.randomUUID()
        const proj: CanvasProject = {
          id,
          name: tagName.trim(),
          color: typeof color === "string" && color.startsWith("#") ? color : "#94a3b8",
          items: [],
        }
        nextProjects = [...nextProjects, proj]
        nameToProjectId.set(key, id)
        return id
      }

      nextTasks = nextTasks.map((t) => {
        if (t.projectId) return t
        const tag = (t.tag ?? "").trim()
        if (!tag) return { ...t, projectId: "general" }
        const match = nameToProjectId.get(tag.toLowerCase())
        const projectId = match ?? maybeCreateProjectFromTag(tag, t.tagColor)
        return { ...t, projectId }
      })
    }

    setTasks(nextTasks)
    setCanvasProjects(nextProjects)

    try {
      const storedMode = window.localStorage.getItem(STORAGE_KEYS.appMode)
      if (storedMode === "schedule" || storedMode === "canvas") {
        setAppMode(storedMode)
      }
    } catch {
      // ignore
    }

    try {
      const storedSidebarView = window.localStorage.getItem(STORAGE_KEYS.sidebarView)
      if (storedSidebarView === "tasks" || storedSidebarView === "agenda") {
        setSidebarView(storedSidebarView)
      }
    } catch {
      // ignore
    }

    try {
      const storedActiveId = window.localStorage.getItem(STORAGE_KEYS.activeProjectId)
      if (storedActiveId) {
        const exists = nextProjects.some((p) => p.id === storedActiveId)
        if (exists) setActiveProjectId(storedActiveId)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleGoToDate = useCallback((date: Date) => {
    setAnchorDate(startOfDay(date))
  }, [])

  const handleGoToToday = useCallback(() => {
    setAnchorDate(new Date())
  }, [])

  const handleSidebarQuickAdd = useCallback(
    (preset: { tag?: string; date?: Date; schedule?: string; projectId?: string }) => {
      if (preset.date) {
        const d = startOfDay(preset.date)
        setAnchorDate(d)
        setPendingOpen({
          dayIndex: d.getDay(),
          presetTag: preset.tag,
          presetSchedule: preset.schedule,
          presetScheduledDate: preset.schedule === "picked" ? d.toISOString() : undefined,
          noDuration: true,
          presetProjectId: preset.projectId,
        })
        return
      }

      // Tag-only quick add: keep current week context; editor will default day to "today". No duration preselected.
      setPendingOpen({
        presetTag: preset.tag,
        presetSchedule: preset.schedule,
        presetProjectId: preset.projectId,
        noDuration: true,
      })
    },
    []
  )

  const handlePrevWeek = useCallback(() => {
    setAnchorDate((prev) => addWeeks(prev, -1))
  }, [])

  const handleSidebarModeClick = useCallback(
    (view: "tasks" | "agenda" | "canvas") => {
      if (view === "canvas") {
        if (appMode !== "canvas") setSidebarShellDirection(1)
        setAppMode("canvas")
        return
      }
      if (appMode === "canvas") setSidebarShellDirection(-1)
      setAppMode("schedule")
      setSidebarView(view)
    },
    [appMode]
  )

  const createCanvasNote = useCallback(
    (projectId: string, x: number, y: number) => {
      const NOTE_WIDTH = 360
      const NOTE_HEIGHT = 140
      const BOARD_WIDTH = 2200
      const BOARD_HEIGHT = 1400

      let clampedX = x
      let clampedY = y
      const maxX = Math.max(0, BOARD_WIDTH - NOTE_WIDTH)
      const maxY = Math.max(0, BOARD_HEIGHT - NOTE_HEIGHT)
      if (clampedX < 0) clampedX = 0
      else if (clampedX > maxX) clampedX = maxX
      if (clampedY < 0) clampedY = 0
      else if (clampedY > maxY) clampedY = maxY

      const id = crypto.randomUUID()

      setCanvasProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                items: [
                  ...project.items,
                  {
                    id,
                    type: "note" as const,
                    x: clampedX,
                    y: clampedY,
                    width: NOTE_WIDTH,
                    title: "Untitled note",
                    body: "Start writing...",
                  },
                ],
              }
            : project
        )
      )

      setCanvasAutoEditNoteId(id)
    },
    []
  )

  const handleCanvasItemDelete = useCallback((projectId: string, itemId: string) => {
    setCanvasProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? { ...project, items: project.items.filter((item) => item.id !== itemId) }
          : project
      )
    )
  }, [])

  // ─── Persist state to localStorage ───────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks))
    } catch {
      // ignore write errors
    }
  }, [tasks])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEYS.canvasProjects, JSON.stringify(canvasProjects))
    } catch {
      // ignore write errors
    }
  }, [canvasProjects])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      if (activeProjectId) {
        window.localStorage.setItem(STORAGE_KEYS.activeProjectId, activeProjectId)
      }
    } catch {
      // ignore
    }
  }, [activeProjectId])

  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(STORAGE_KEYS.appMode, appMode)
      window.localStorage.setItem(STORAGE_KEYS.sidebarView, sidebarView)
    } catch {
      // ignore
    }
  }, [appMode, sidebarView])

  const handleNextWeek = useCallback(() => {
    setAnchorDate((prev) => addWeeks(prev, 1))
  }, [])

  const handleDragCreate = useCallback((payload: DragCreatePayload) => {
    setPendingOpen({
      dayIndex: payload.dayIndex,
      startTimeMinutes: payload.startMinutes,
      endTimeMinutes: payload.endMinutes,
    })
  }, [])

  const handleExternalOpenHandled = useCallback(() => {
    setPendingOpen(null)
  }, [])

  const handleEventMove = useCallback(
    (payload: EventMovePayload) => {
      const dueDate = format(addDays(weekStart, payload.dayIndex), "yyyy-MM-dd")
      setTasks((prev) =>
        prev.map((t) =>
          t.id === payload.id
            ? {
                ...t,
                dayIndex: payload.dayIndex,
                startMinutes: payload.startMinutes,
                endMinutes: payload.endMinutes,
                dueDate,
                schedule: "picked",
              }
            : t
        )
      )
    },
    [weekStart]
  )

  const handleEventResize = useCallback((payload: EventResizePayload) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === payload.id ? { ...t, endMinutes: payload.endMinutes } : t))
    )
  }, [])

  const handleSidebarTaskDrop = useCallback(
    (payload: SidebarTaskDropPayload) => {
      const dueDate = format(addDays(weekStart, payload.dayIndex), "yyyy-MM-dd")
      setTasks((prev) =>
        prev.map((t) =>
          t.id === payload.taskId
            ? {
                ...t,
                dayIndex: payload.dayIndex,
                startMinutes: payload.startMinutes,
                endMinutes: payload.endMinutes,
                dueDate,
                schedule: "picked",
              }
            : t
        )
      )
    },
    [weekStart]
  )

  const handleToggleComplete = useCallback((id: string) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    )
  }, [])

  const handleUpdateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    )
  }, [])

  const handleDeleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const handleEventDoubleClick = useCallback((eventId: string) => {
    console.log("[page] handleEventDoubleClick called", { eventId, taskIds: tasks.map((x) => x.id) })
    const t = tasks.find((task) => task.id === eventId)
    if (!t) {
      console.warn("[page] handleEventDoubleClick: no task found for id", eventId)
      return
    }
    setEditingTask({
      id: t.id,
      dayIndex: t.dayIndex,
      title: t.title,
      schedule: t.schedule,
      tag: t.tag,
      projectId: t.projectId,
      priority: t.priority,
      repeat: t.repeat,
      startTimeMinutes: t.startMinutes,
      endTimeMinutes: t.endMinutes,
    })
  }, [tasks])

  const handleEditSave = useCallback((id: string, data: TaskEditorSaveData) => {
    const project =
      canvasProjects.find((p) => p.id === data.projectId) ??
      canvasProjects.find((p) => p.id === "general") ??
      null
    const dueDate = format(addDays(weekStart, data.dayIndex), "yyyy-MM-dd")
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              dayIndex: data.dayIndex,
              startMinutes: data.startTimeMinutes,
              endMinutes: data.endTimeMinutes,
              title: data.title || t.title,
              projectId: data.projectId,
              // keep legacy tag visuals in sync with projects for now
              tag: project?.name ?? t.tag,
              tagColor: project?.color ?? t.tagColor,
              priority: data.priority,
              repeat: data.repeat,
              schedule: data.schedule,
              dueDate,
            }
          : t
      )
    )
    setEditingTask(null)
  }, [canvasProjects, weekStart])

  const handleEditDone = useCallback(() => {
    setEditingTask(null)
  }, [])

  const handleTaskSave = useCallback((data: TaskEditorSaveData) => {
    const project =
      canvasProjects.find((p) => p.id === data.projectId) ??
      canvasProjects.find((p) => p.id === "general") ??
      null
    const dueDate = format(addDays(weekStart, data.dayIndex), "yyyy-MM-dd")
    setTasks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        dayIndex: data.dayIndex,
        startMinutes: data.startTimeMinutes,
        endMinutes: data.endTimeMinutes,
        title: data.title || "New Task",
        projectId: data.projectId,
        tag: project?.name ?? "General",
        tagColor: project?.color ?? "#94a3b8",
        priority: data.priority,
        repeat: data.repeat,
        schedule: data.schedule,
        completed: false,
        dueDate,
      },
    ])
  }, [canvasProjects, weekStart])

  const activeCanvasProject = useMemo(
    () => canvasProjects.find((p) => p.id === activeProjectId) ?? canvasProjects[0] ?? null,
    [canvasProjects, activeProjectId]
  )

  const handleCanvasItemPositionChange = useCallback(
    (projectId: string, itemId: string, x: number, y: number) => {
      setCanvasProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                items: project.items.map((item) =>
                  item.id === itemId ? { ...item, x, y } : item
                ),
              }
            : project
        )
      )
    },
    []
  )

  const handleCanvasItemUpdate = useCallback(
    (projectId: string, itemId: string, updates: Partial<CanvasItem>) => {
      setCanvasProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                items: project.items.map((item) =>
                  item.id === itemId
                    ? item.type === "note"
                      ? { ...item, ...(updates as Partial<Extract<CanvasItem, { type: "note" }>>) }
                      : { ...item, ...(updates as Partial<Extract<CanvasItem, { type: "image" }>>) }
                    : item
                ),
              }
            : project
        )
      )
    },
    []
  )

  const handleCanvasNoteUpdate = useCallback(
    (projectId: string, itemId: string, updates: { title: string; body: string }) => {
      setCanvasProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                items: project.items.map((item) =>
                  item.id === itemId && item.type === "note"
                    ? { ...item, title: updates.title, body: updates.body }
                    : item
                ),
              }
            : project
        )
      )
    },
    []
  )

  const handleCanvasImageResize = useCallback(
    (projectId: string, itemId: string, width: number, height: number) => {
      setCanvasProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                items: project.items.map((item) =>
                  item.id === itemId && item.type === "image"
                    ? { ...item, width, height }
                    : item
                ),
              }
            : project
        )
      )
    },
    []
  )

  const handleCanvasProjectUpdate = useCallback(
    (projectId: string, updates: Partial<CanvasProject>) => {
      setCanvasProjects((prev) =>
        prev.map((project) =>
          project.id === projectId ? { ...project, ...updates } : project
        )
      )
    },
    []
  )

  const handleCanvasProjectDelete = useCallback(
    (projectId: string) => {
      // Block deletion if any tasks belong to this project.
      const hasTasks = tasks.some((t) => ((t.projectId ?? "general").trim() || "general") === projectId)
      if (hasTasks) return
      setCanvasProjects((prev) => {
        const next = prev.filter((project) => project.id !== projectId)
        if (next.length === 0) {
          setActiveProjectId(null)
        } else if (projectId === activeProjectId) {
          setActiveProjectId(next[0].id)
        }
        return next
      })
    },
    [activeProjectId, tasks]
  )
  const handleAddProject = useCallback((name?: string, _unusedIcon?: string) => {
    setCanvasProjects((prev) => {
      const id = crypto.randomUUID()
      const displayName = name?.trim() || `New project ${prev.length + 1}`
      const next = [
        ...prev,
        {
          id,
          name: displayName,
          color: "#94a3b8",
          items: [],
        },
      ]
      setActiveProjectId(id)
      return next
    })
  }, [])

  const handleAddCanvasNote = useCallback(() => {
    if (!activeCanvasProject || !canvasViewport) return
    const projectId = activeCanvasProject.id

    // Position new note within the current visible viewport, centered horizontally
    // and placed just above the command bar with a comfortable gap.
    const NOTE_WIDTH = 360
    const NOTE_HEIGHT = 140
    const BOARD_WIDTH = 2200
    const BOARD_HEIGHT = 1400
    const COMMAND_BAR_HEIGHT = 52
    const COMMAND_BAR_BOTTOM_OFFSET = 24 // tailwind bottom-6 (1.5rem)
    const GAP_ABOVE_BAR = 64

    const { scrollLeft, scrollTop, clientWidth, clientHeight } = canvasViewport

    // Center horizontally in the visible viewport.
    let x = scrollLeft + clientWidth / 2 - NOTE_WIDTH / 2

    // Place vertically so there is GAP_ABOVE_BAR between note bottom and command bar top.
    const visibleBottom = scrollTop + clientHeight
    const commandBarTop = visibleBottom - COMMAND_BAR_BOTTOM_OFFSET - COMMAND_BAR_HEIGHT
    let y = commandBarTop - GAP_ABOVE_BAR - NOTE_HEIGHT

    // Clamp to board bounds.
    const maxX = Math.max(0, BOARD_WIDTH - NOTE_WIDTH)
    const maxY = Math.max(0, BOARD_HEIGHT - NOTE_HEIGHT)
    if (x < 0) x = 0
    else if (x > maxX) x = maxX
    if (y < 0) y = 0
    else if (y > maxY) y = maxY

    createCanvasNote(projectId, x, y)
  }, [activeCanvasProject, canvasViewport, createCanvasNote])

  const handleAddCanvasImageFile = useCallback(
    (file: File) => {
      if (!activeCanvasProject) return
      const src = URL.createObjectURL(file)
      const projectId = activeCanvasProject.id
      const centerX = 2200 / 2 - 320 / 2
      const y = 220
      const id = crypto.randomUUID()
      setCanvasProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                items: [
                  ...project.items,
                  {
                    id,
                    type: "image" as const,
                    x: centerX,
                    y,
                    width: 320,
                    height: 260,
                    src,
                    alt: file.name,
                  },
                ],
              }
            : project
        )
      )
    },
    [activeCanvasProject]
  )

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* TopBar: full width, pinned top */}
      <TopBar
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onAvatarClick={() => setAccountPanelOpen(true)}
      />

      <AccountPanel open={accountPanelOpen} onClose={() => setAccountPanelOpen(false)} />

      {/* Content: sidebar + main area side by side */}
      <div className="flex flex-1 min-h-0">
        <AnimatePresence initial={false} custom={sidebarShellDirection} mode="popLayout">
          {appMode === "schedule" ? (
            <motion.div
              key="scheduleSidebar"
              custom={sidebarShellDirection}
              variants={sidebarShellSlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={sidebarShellSlideTransition}
            >
              <AppSidebar
                collapsed={sidebarCollapsed}
                onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
                tasks={tasks}
                projects={canvasProjects}
                onAddProject={handleAddProject}
                onUpdateProject={handleCanvasProjectUpdate}
                onDeleteProject={handleCanvasProjectDelete}
                onToggleComplete={handleToggleComplete}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onQuickAddTask={handleSidebarQuickAdd}
                onDragTaskStart={setDraggingSidebarTask}
                onDragTaskEnd={() => setDraggingSidebarTask(null)}
                appMode={appMode}
                sidebarView={sidebarView}
                onSidebarModeClick={handleSidebarModeClick}
              />
            </motion.div>
          ) : (
            <motion.div
              key="canvasSidebar"
              custom={sidebarShellDirection}
              variants={sidebarShellSlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={sidebarShellSlideTransition}
            >
              <CanvasSidebar
                collapsed={sidebarCollapsed}
                onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
                projects={canvasProjects}
                projectTaskCounts={taskCountByProjectId}
                activeProjectId={activeCanvasProject?.id ?? null}
                onSelectProject={setActiveProjectId}
                onAddProject={handleAddProject}
                onUpdateProject={handleCanvasProjectUpdate}
                onDeleteProject={handleCanvasProjectDelete}
                appMode={appMode}
                sidebarView={sidebarView}
                onSidebarModeClick={handleSidebarModeClick}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {appMode === "schedule" ? (
          <div className="relative flex flex-1 flex-col min-w-0 overflow-hidden rounded-tl-lg bg-calendar-bg shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]">
            <CalendarGrid
              onDragCreate={handleDragCreate}
              onEventMove={handleEventMove}
              onEventResize={handleEventResize}
              onEventDoubleClick={handleEventDoubleClick}
              onSidebarTaskDrop={handleSidebarTaskDrop}
              externalEvents={tasksWithProjectIdentity}
              anchorDate={anchorDate}
              draggingSidebarTask={draggingSidebarTask}
            />

            <CommandBar
              externalOpen={pendingOpen}
              onExternalOpenHandled={handleExternalOpenHandled}
              onTaskSave={handleTaskSave}
              editingTask={editingTask}
              onEditSave={handleEditSave}
              onEditDone={handleEditDone}
              onGoToDate={handleGoToDate}
              onGoToToday={handleGoToToday}
              onPrevWeek={handlePrevWeek}
              onNextWeek={handleNextWeek}
              projects={canvasProjects}
            />
          </div>
        ) : (
          <div className="relative flex flex-1 flex-col min-w-0 overflow-hidden rounded-tl-lg bg-calendar-bg">
            <CanvasBoard
              project={activeCanvasProject}
              onItemPositionChange={handleCanvasItemPositionChange}
              onItemUpdate={handleCanvasItemUpdate}
              onResizeImage={handleCanvasImageResize}
              onUpdateNote={handleCanvasNoteUpdate}
              autoFocusNoteId={canvasAutoEditNoteId}
              onAutoFocusNoteHandled={() => setCanvasAutoEditNoteId(null)}
              onViewportChange={setCanvasViewport}
              onAddNoteAtPosition={createCanvasNote}
              onDeleteItem={handleCanvasItemDelete}
            />
            <CanvasCommandBar
              onAddNote={handleAddCanvasNote}
              onAddImageFile={handleAddCanvasImageFile}
            />
          </div>
        )}
      </div>
    </div>
  )
}
