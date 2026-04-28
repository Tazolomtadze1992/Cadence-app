"use client"

import { useState, useCallback, useMemo, useEffect, type MouseEvent as ReactMouseEvent } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import {
  startOfWeek,
  addDays,
  addWeeks,
  startOfDay,
  format,
  parseISO,
  differenceInCalendarDays,
  isValid,
} from "date-fns"
import { AppSidebar } from "@/components/cadence/sidebar"
import { SidebarModeRail } from "@/components/cadence/sidebar-mode-rail"
import { TopBar, type AppMode } from "@/components/cadence/top-bar"
import { AccountPanel } from "@/components/cadence/account-panel"
import { CalendarGrid } from "@/components/cadence/calendar-grid"
import { CommandBar } from "@/components/cadence/command-bar"
import { CanvasBoard, type CanvasItem, type CanvasProject } from "@/components/cadence/canvas-board"
import { CanvasSidebar } from "../components/cadence/canvas-sidebar"
import { SEED_TAGS } from "@/components/cadence/task-editor-modal"
import { cn } from "@/lib/utils"
import { getDefaultEventColor } from "@/lib/calendar-preferences"
import {
  getVisibleAllTabTaskOrder,
  getVisibleCompletedTabTaskOrder,
} from "@/components/cadence/sidebar-visible-order"
import {
  SIDEBAR_PANEL_SLIDE_VARIANTS,
  sidebarPanelSlideTransition,
} from "@/lib/cadence-motion"
import type { DragCreatePayload, EventMovePayload, EventResizePayload, SidebarTaskDropPayload } from "@/components/cadence/calendar-grid"
import type {
  TaskEditorInitialData,
  TaskEditorSaveData,
  EditingTaskData,
  TaskAssignee,
} from "@/components/cadence/task-editor-modal"

export type { TaskAssignee } from "@/components/cadence/task-editor-modal"

export interface Task {
  id: string
  dayIndex: number
  startMinutes?: number
  endMinutes?: number
  title: string
  /** Free-form note; shown in task editor and available for future UI. */
  notes: string
  tag: string
  tagColor: string
  projectId?: string
  priority: string
  /** Who should pick up the work; empty = unassigned (triage). */
  assignee: TaskAssignee
  /** Due-intent category: today / tomorrow / next-week / anytime / picked — not derived from calendar. */
  schedule: string
  /** When `schedule === "picked"`, the chosen due date (yyyy-MM-dd) from the task editor date picker. */
  schedulePickedDate?: string
  completed: boolean
  /** Calendar day the time block sits on (week column); updated when moving/resizing on the grid. */
  dueDate: string
}

const INITIAL_CANVAS_PROJECTS: CanvasProject[] = [
  {
    id: "general",
    name: "Daily Banking",
    color: "#94a3b8",
    items: [],
  },
  {
    id: "p1",
    name: "Credit Products",
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
    id: "web",
    name: "Web",
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
  {
    id: "p3",
    name: "Special Products",
    color: "#a855f7",
    items: [],
  },
]

const SEED_PROJECT_IDS = new Set(INITIAL_CANVAS_PROJECTS.map((p) => p.id))

/** Removed / legacy canvas project ids → canonical seed id (tasks + active project). */
const LEGACY_PROJECT_ID_MAP: Record<string, string> = {
  p2: "web",
  p4: "web",
  p5: "general",
  p6: "general",
}

/** Legacy display names from stored tasks → canonical project id. */
const PROJECT_LEGACY_NAME_ALIASES: readonly [string, string][] = [
  ["Credit Products & Agency Banking", "p1"],
  ["Non-Credit Products", "web"],
  ["Internet Bank", "web"],
  ["Identity Squad", "general"],
  ["Bill Payments", "general"],
]

function normalizeStoredProjectId(raw: string | undefined): string {
  const id = (raw ?? "general").trim() || "general"
  if (SEED_PROJECT_IDS.has(id)) return id
  return LEGACY_PROJECT_ID_MAP[id] ?? "general"
}

/** Merge stored projects with the canonical four: seed order/names, keep `items` / colors when present; drop non-seed projects (canvas items merged into Web). */
function mergeCanvasProjectsWithSeed(projects: CanvasProject[]): CanvasProject[] {
  const byId = new Map(projects.map((p) => [p.id, p]))
  const orphanItems: CanvasItem[] = []
  for (const p of projects) {
    if (!SEED_PROJECT_IDS.has(p.id)) {
      for (const item of p.items ?? []) orphanItems.push(item)
    }
  }

  return INITIAL_CANVAS_PROJECTS.map((seed) => {
    const existing = byId.get(seed.id)
    const baseItems = Array.isArray(existing?.items) ? existing.items : seed.items
    const items =
      seed.id === "web" && orphanItems.length > 0 ? [...baseItems, ...orphanItems] : baseItems

    if (!existing) {
      return { ...seed, items }
    }
    return {
      ...seed,
      ...existing,
      name: seed.name,
      color: existing.color ?? seed.color,
      items,
    }
  })
}

const STORAGE_KEYS = {
  tasks: "cadence_tasks",
  canvasProjects: "cadence_canvas_projects",
  activeProjectId: "cadence_active_project_id",
  appMode: "cadence_app_mode",
  sidebarView: "cadence_sidebar_view",
} as const

// Cadence App
export default function CadenceApp() {
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
  const [sidebarSelectedTaskIds, setSidebarSelectedTaskIds] = useState<string[]>([])
  const [sidebarSelectionAnchorId, setSidebarSelectionAnchorId] = useState<string | null>(null)
  /** Schedule ↔ Canvas sidebar body: 1 = canvas enters from right; -1 = schedule enters from left. */
  const [scheduleCanvasSlideDirection, setScheduleCanvasSlideDirection] = useState<1 | -1>(1)
  const shouldReduceMotion = useReducedMotion()
  const scheduleCanvasSlideTransition = useMemo(
    () => sidebarPanelSlideTransition(shouldReduceMotion),
    [shouldReduceMotion]
  )

  const weekStart = useMemo(() => startOfWeek(anchorDate, { weekStartsOn: 0 }), [anchorDate])

  /** Incomplete tasks only: completed tasks stay in app state / sidebar Completed tab but are excluded from the grid. */
  const calendarGridExternalEvents = useMemo(() => {
    const week0 = startOfDay(weekStart)
    const byId = new Map(canvasProjects.map((p) => [p.id, p] as const))
    return tasks.flatMap((t) => {
      if (t.completed) return []
      const raw = typeof t.dueDate === "string" ? t.dueDate.trim() : ""
      if (!raw) return []
      const due = startOfDay(parseISO(raw))
      if (!isValid(due)) return []
      const col = differenceInCalendarDays(due, week0)
      if (col < 0 || col > 6) return []
      const pid = (t.projectId ?? "general").trim() || "general"
      const project = byId.get(pid) ?? byId.get("general") ?? null
      return [
        {
          ...t,
          dayIndex: col,
          tagColor: project?.color ?? t.tagColor ?? "#94a3b8",
          projectName: project?.name,
        },
      ]
    })
  }, [canvasProjects, tasks, weekStart])

  const visibleAllTabTaskOrder = useMemo(
    () => getVisibleAllTabTaskOrder(tasks, canvasProjects),
    [tasks, canvasProjects]
  )
  const visibleCompletedTabTaskOrder = useMemo(
    () => getVisibleCompletedTabTaskOrder(tasks),
    [tasks]
  )

  const clearSidebarTaskSelection = useCallback(() => {
    setSidebarSelectedTaskIds([])
    setSidebarSelectionAnchorId(null)
  }, [])

  const handleSidebarTaskRowClick = useCallback(
    (taskId: string, e: ReactMouseEvent, tab: "all" | "completed") => {
      if (!e.shiftKey) return

      const order = tab === "all" ? visibleAllTabTaskOrder : visibleCompletedTabTaskOrder

      if (sidebarSelectionAnchorId) {
        const ia = order.indexOf(sidebarSelectionAnchorId)
        const ib = order.indexOf(taskId)
        if (ia === -1 || ib === -1) {
          setSidebarSelectedTaskIds([taskId])
          setSidebarSelectionAnchorId(taskId)
          return
        }
        const lo = Math.min(ia, ib)
        const hi = Math.max(ia, ib)
        setSidebarSelectedTaskIds(order.slice(lo, hi + 1))
        return
      }

      const idSet = new Set(sidebarSelectedTaskIds)
      if (idSet.has(taskId)) {
        idSet.delete(taskId)
        const next = [...idSet]
        setSidebarSelectedTaskIds(next)
        if (next.length === 0) setSidebarSelectionAnchorId(null)
      } else {
        idSet.add(taskId)
        setSidebarSelectedTaskIds([...idSet])
        setSidebarSelectionAnchorId(taskId)
      }
    },
    [
      visibleAllTabTaskOrder,
      visibleCompletedTabTaskOrder,
      sidebarSelectionAnchorId,
      sidebarSelectedTaskIds,
    ]
  )

  const handleBulkMarkDone = useCallback(() => {
    const idSet = new Set(sidebarSelectedTaskIds)
    setTasks((prev) => prev.map((t) => (idSet.has(t.id) ? { ...t, completed: true } : t)))
    clearSidebarTaskSelection()
  }, [sidebarSelectedTaskIds, clearSidebarTaskSelection])

  const handleBulkDelete = useCallback(() => {
    const ids = sidebarSelectedTaskIds.filter((id) => tasks.some((t) => t.id === id))
    if (ids.length === 0) {
      clearSidebarTaskSelection()
      return
    }
    if (ids.length > 1) {
      const ok = window.confirm(`Delete ${ids.length} tasks?`)
      if (!ok) return
    }
    const idSet = new Set(ids)
    setTasks((prev) => prev.filter((t) => !idSet.has(t.id)))
    clearSidebarTaskSelection()
  }, [sidebarSelectedTaskIds, tasks, clearSidebarTaskSelection])

  const handleBulkProject = useCallback(
    (projectId: string) => {
      const project =
        canvasProjects.find((p) => p.id === projectId) ??
        canvasProjects.find((p) => p.id === "general") ??
        null
      if (!project) return
      const idSet = new Set(sidebarSelectedTaskIds)
      setTasks((prev) =>
        prev.map((t) =>
          idSet.has(t.id)
            ? {
                ...t,
                projectId: project.id,
                tag: project.name,
                tagColor: project.color ?? t.tagColor,
              }
            : t
        )
      )
      clearSidebarTaskSelection()
    },
    [sidebarSelectedTaskIds, canvasProjects, clearSidebarTaskSelection]
  )

  const handleBulkPriority = useCallback(
    (priority: string) => {
      const idSet = new Set(sidebarSelectedTaskIds)
      setTasks((prev) =>
        prev.map((t) => (idSet.has(t.id) ? { ...t, priority } : t))
      )
      clearSidebarTaskSelection()
    },
    [sidebarSelectedTaskIds, clearSidebarTaskSelection]
  )

  useEffect(() => {
    if (editingTask) clearSidebarTaskSelection()
  }, [editingTask, clearSidebarTaskSelection])

  useEffect(() => {
    if (pendingOpen) clearSidebarTaskSelection()
  }, [pendingOpen, clearSidebarTaskSelection])

  useEffect(() => {
    if (sidebarCollapsed) clearSidebarTaskSelection()
  }, [sidebarCollapsed, clearSidebarTaskSelection])

  useEffect(() => {
    if (appMode !== "schedule" || sidebarView !== "tasks") {
      clearSidebarTaskSelection()
    }
  }, [appMode, sidebarView, clearSidebarTaskSelection])

  // ─── Hydrate state from localStorage on first mount ─────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return

    const ensureGeneralProject = (projects: CanvasProject[]) => {
      if (projects.some((p) => p.id === "general")) return projects
      return [
        {
          id: "general",
          name: "Daily Banking",
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
    let nextProjects = mergeCanvasProjectsWithSeed(
      ensureGeneralProject(storedProjects ?? INITIAL_CANVAS_PROJECTS).map((p) => ({
        ...p,
        color: p.color ?? "#94a3b8",
      })) as CanvasProject[]
    )
    let nextTasks = (storedTasks ?? []) as Task[]

    const nameToProjectId = new Map<string, string>()
    for (const [label, id] of PROJECT_LEGACY_NAME_ALIASES) {
      nameToProjectId.set(label.trim().toLowerCase(), id)
    }
    for (const p of nextProjects) {
      nameToProjectId.set(p.name.trim().toLowerCase(), p.id)
    }

    // Migrate legacy tag-based tasks → projectId (canonical four only; unknown → Daily Banking)
    if (nextTasks.length > 0) {
      nextTasks = nextTasks.map((t) => {
        const assignee: TaskAssignee =
          t.assignee === "tazo" || t.assignee === "mebo" ? t.assignee : ""
        const withMeta = {
          ...t,
          notes: typeof t.notes === "string" ? t.notes : "",
          assignee,
          schedulePickedDate:
            typeof (t as Task).schedulePickedDate === "string"
              ? (t as Task).schedulePickedDate
              : undefined,
        }
        const { repeat: _dropRepeat, ...rest } = withMeta as typeof withMeta & { repeat?: string }
        let withProject = rest as Task
        if (!withProject.projectId) {
          const tag = (withProject.tag ?? "").trim()
          if (!tag) withProject = { ...withProject, projectId: "general" }
          else {
            const match = nameToProjectId.get(tag.toLowerCase())
            withProject = { ...withProject, projectId: match ?? "general" }
          }
        }
        return withProject
      })

      nextTasks = nextTasks.map((t) => {
        const pid = normalizeStoredProjectId(t.projectId)
        const proj = nextProjects.find((p) => p.id === pid)
        return {
          ...t,
          projectId: pid,
          tag: proj?.name ?? t.tag,
          tagColor: proj?.color ?? t.tagColor,
        }
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
        const normalized = normalizeStoredProjectId(storedActiveId)
        const exists = nextProjects.some((p) => p.id === normalized)
        if (exists) setActiveProjectId(normalized)
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
    (preset: {
      tag?: string
      date?: Date
      schedule?: string
      projectId?: string
    }) => {
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
        clearSidebarTaskSelection()
        setAppMode((prev) => {
          if (prev !== "canvas") setScheduleCanvasSlideDirection(1)
          return "canvas"
        })
        return
      }
      setAppMode((prev) => {
        if (prev === "canvas") setScheduleCanvasSlideDirection(-1)
        return "schedule"
      })
      setSidebarView(view)
    },
    [clearSidebarTaskSelection]
  )

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return
      }

      if (e.shiftKey && e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setSidebarCollapsed((c) => !c)
        return
      }

      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      if (e.key === "t" || e.key === "T") {
        e.preventDefault()
        setAppMode((prev) => {
          if (prev === "canvas") setScheduleCanvasSlideDirection(-1)
          return "schedule"
        })
        setSidebarView("tasks")
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault()
        setAppMode((prev) => {
          if (prev === "canvas") setScheduleCanvasSlideDirection(-1)
          return "schedule"
        })
        setSidebarView("agenda")
      } else if (e.key === "c" || e.key === "C") {
        e.preventDefault()
        clearSidebarTaskSelection()
        setAppMode((prev) => {
          if (prev !== "canvas") setScheduleCanvasSlideDirection(1)
          return "canvas"
        })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [clearSidebarTaskSelection])

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
                    title: "",
                    body: "",
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
    const ws = startOfDay(weekStart)
    let editorDayIndex = t.dayIndex
    const rawDue = typeof t.dueDate === "string" ? t.dueDate.trim() : ""
    if (rawDue) {
      const due = startOfDay(parseISO(rawDue))
      if (isValid(due)) {
        const col = differenceInCalendarDays(due, ws)
        if (col >= 0 && col <= 6) editorDayIndex = col
      }
    }
    setEditingTask({
      id: t.id,
      dayIndex: editorDayIndex,
      title: t.title,
      schedule: t.schedule,
      tag: t.tag,
      projectId: t.projectId,
      priority: t.priority,
      notes: t.notes ?? "",
      assignee: t.assignee === "tazo" || t.assignee === "mebo" ? t.assignee : "",
      startTimeMinutes: t.startMinutes,
      endTimeMinutes: t.endMinutes,
      scheduledDate: t.schedulePickedDate
        ? startOfDay(parseISO(t.schedulePickedDate)).toISOString()
        : undefined,
    })
  }, [tasks, weekStart])

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
              tagColor: project?.color ?? getDefaultEventColor() ?? t.tagColor,
              priority: data.priority,
              notes: data.notes,
              assignee: data.assignee,
              schedule: data.schedule,
              schedulePickedDate:
                data.schedule === "picked" && data.scheduledDate
                  ? format(startOfDay(new Date(data.scheduledDate)), "yyyy-MM-dd")
                  : undefined,
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
        tag: project?.name ?? "Daily Banking",
        tagColor: project?.color ?? getDefaultEventColor() ?? "#94a3b8",
        priority: data.priority,
        notes: data.notes ?? "",
        assignee: data.assignee ?? "",
        schedule: data.schedule,
        schedulePickedDate:
          data.schedule === "picked" && data.scheduledDate
            ? format(startOfDay(new Date(data.scheduledDate)), "yyyy-MM-dd")
            : undefined,
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
        <aside
          className={cn(
            "flex h-full shrink-0 flex-col overflow-hidden bg-background transition-[width,opacity] duration-200 ease-out",
            sidebarCollapsed ? "w-0 opacity-0" : "w-[260px] opacity-100"
          )}
        >
          <div className="relative min-h-0 flex-1 overflow-hidden">
            <AnimatePresence
              initial={false}
              custom={scheduleCanvasSlideDirection}
              mode="popLayout"
            >
              {appMode === "schedule" ? (
                <motion.div
                  key="sidebar-schedule"
                  custom={scheduleCanvasSlideDirection}
                  variants={SIDEBAR_PANEL_SLIDE_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={scheduleCanvasSlideTransition}
                  className="absolute inset-0 flex flex-col overflow-hidden"
                >
                  <AppSidebar
                    collapsed={sidebarCollapsed}
                    tasks={tasks}
                    projects={canvasProjects}
                    onUpdateProject={handleCanvasProjectUpdate}
                    onDeleteProject={handleCanvasProjectDelete}
                    onToggleComplete={handleToggleComplete}
                    onUpdateTask={handleUpdateTask}
                    onDeleteTask={handleDeleteTask}
                    onQuickAddTask={handleSidebarQuickAdd}
                    onDragTaskStart={setDraggingSidebarTask}
                    onDragTaskEnd={() => setDraggingSidebarTask(null)}
                    sidebarView={sidebarView}
                    onSidebarModeClick={handleSidebarModeClick}
                    selectedTaskIds={sidebarSelectedTaskIds}
                    onSidebarTaskRowClick={handleSidebarTaskRowClick}
                    onSidebarTasksTabChange={clearSidebarTaskSelection}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="sidebar-canvas"
                  custom={scheduleCanvasSlideDirection}
                  variants={SIDEBAR_PANEL_SLIDE_VARIANTS}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={scheduleCanvasSlideTransition}
                  className="absolute inset-0 flex flex-col overflow-hidden"
                >
                  <CanvasSidebar
                    collapsed={sidebarCollapsed}
                    projects={canvasProjects}
                    activeProjectId={activeCanvasProject?.id ?? null}
                    onSelectProject={setActiveProjectId}
                    onUpdateProject={handleCanvasProjectUpdate}
                    onDeleteProject={handleCanvasProjectDelete}
                    onQuickAddTask={handleSidebarQuickAdd}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <SidebarModeRail
            appMode={appMode}
            sidebarView={sidebarView}
            onSidebarModeClick={handleSidebarModeClick}
          />
        </aside>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-tl-lg bg-calendar-bg shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]">
          {appMode === "schedule" ? (
            <CalendarGrid
              onDragCreate={handleDragCreate}
              onEventMove={handleEventMove}
              onEventResize={handleEventResize}
              onEventDoubleClick={handleEventDoubleClick}
              onToggleComplete={handleToggleComplete}
              onSidebarTaskDrop={handleSidebarTaskDrop}
              externalEvents={calendarGridExternalEvents}
              anchorDate={anchorDate}
              draggingSidebarTask={draggingSidebarTask}
            />
          ) : (
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
          )}

          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-20 flex items-end justify-center px-4">
            <div className="pointer-events-auto flex w-full max-w-[calc(100vw-2rem)] justify-center">
              <CommandBar
                dock="inline"
                appMode={appMode}
                onAddCanvasNote={handleAddCanvasNote}
                onAddCanvasImageFile={handleAddCanvasImageFile}
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
                onEditorOpen={clearSidebarTaskSelection}
                bulkSelection={
                  appMode === "schedule" &&
                  sidebarView === "tasks" &&
                  sidebarSelectedTaskIds.length > 0
                    ? {
                        count: sidebarSelectedTaskIds.length,
                        onExit: clearSidebarTaskSelection,
                        onDone: handleBulkMarkDone,
                        onDelete: handleBulkDelete,
                        onProject: handleBulkProject,
                        onPriority: handleBulkPriority,
                      }
                    : null
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
